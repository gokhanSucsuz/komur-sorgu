import { NextRequest, NextResponse } from 'next/server';
import { getDbCollections, mapDocs, buildIdFilter } from '@/lib/mongodb';
import { isBirebirBeneficiaryMatch, normalizeToTon } from '@/lib/normalizer';
import { getIstanbulDate } from '@/lib/dateUtils';
import { verifySession } from '@/lib/auth';
import { serverError, asString } from '@/lib/security';

export async function GET(request: NextRequest) {
  try {
    const session = await verifySession(request);
    if (!session.valid) {
      return session.response || NextResponse.json({ success: false, error: 'Oturum gerekli' }, { status: 401 });
    }

    const { deliveryHistory: histCol, beneficiaries: benCol, truckDeliveries: trucksCol } = await getDbCollections();
    const searchParams = request.nextUrl.searchParams;
    const islemTipi = asString(searchParams.get('tip'), 32); // 'TESLIMAT', 'IPTAL', or all
    const gun = asString(searchParams.get('gun'), 32); // YYYY-MM-DD
    const q = asString(searchParams.get('q'), 100);

    // O gün gelen kantar/tır tonajını çek (kişi veya torba sayısına göre değil fiili gelen tonaja göre esas alınır)
    const allTrucks = await trucksCol.find({}).toArray();
    const trucksByDate = new Map<string, number>();
    for (const t of allTrucks) {
      const dateStr = t.tarih ? String(t.tarih).slice(0, 10) : '';
      if (dateStr) {
        const netT = normalizeToTon(t.net_tonaj);
        trucksByDate.set(dateStr, parseFloat(((trucksByDate.get(dateStr) || 0) + netT).toFixed(3)));
      }
    }

    // 1. Hak sahiplerinin canlı ve kesin durumunu çek (Source of Truth)
    const allBens = mapDocs(await benCol.find({}).toArray());
    const benMap = new Map<string, any>();
    allBens.forEach((b: any) => {
      benMap.set(String(b.id || b._id), b);
      if (b.tc_no) benMap.set(String(b.tc_no).trim(), b);
    });

    // 2. Tüm geçmiş kayıtlarını çek ve çöz
    const rawAllRecords = await histCol.find({}).sort({ tarih: 1 }).toArray();
    const allHistoryMapped = mapDocs(rawAllRecords);
    for (let i = 0; i < allHistoryMapped.length; i++) {
      allHistoryMapped[i]._raw_iptal_edildi = Boolean(rawAllRecords[i]?.iptal_edildi);
    }

    // Hak sahibi bazında geçmiş kayıtlarını grupla
    const historyByBen = new Map<string, any[]>();
    for (const r of allHistoryMapped) {
      const bId = String(r.beneficiary_id || r.tc_no || '');
      if (!historyByBen.has(bId)) historyByBen.set(bId, []);
      historyByBen.get(bId)!.push(r);
    }

    const autoHealIds: any[] = [];
    const autoHealUncancelIds: any[] = [];

    // Her teslimat kaydının geçerliliğini, açık adresini ve iptal durumunu doğrula
    for (const r of allHistoryMapped) {
      const bId = String(r.beneficiary_id || r.tc_no || '');
      const ben = benMap.get(String(r.beneficiary_id || '')) || (r.tc_no ? benMap.get(String(r.tc_no).trim()) : undefined);

      // Açık adres ve yerleşim bilgilerini hane üzerinden zenginleştir (tutanak çıktılarında adres boş görünmez)
      if (!r.acik_adres || String(r.acik_adres).trim() === '' || r.acik_adres === '-') {
        if (ben) {
          r.acik_adres = ben.acik_adres || ben.imza_listesi_acik_adres || ben.adres || '';
          if (!r.acik_adres && ben.sokak) {
            r.acik_adres = `${ben.sokak}${ben.kapi_no && ben.kapi_no !== 999999 && ben.kapi_no !== '999999' ? ' No: ' + ben.kapi_no : ''}${ben.daire_no ? ' D: ' + ben.daire_no : ''}`.trim();
          }
        }
      }
      if (!r.mahalle || String(r.mahalle).trim() === '') {
        r.mahalle = ben?.mahalle || ben?.imza_listesi_mahalle || 'Edirne Merkez';
      }
      if (!r.sokak && ben?.sokak) r.sokak = ben.sokak;
      if (!r.kapi_no && ben?.kapi_no) r.kapi_no = ben.kapi_no;
      if (!r.daire_no && ben?.daire_no) r.daire_no = ben.daire_no;

      if (
        r.islem_tipi === 'TESLIMAT' ||
        r.islem_tipi === 'EKSIK_TESLIMAT' ||
        r.islem_tipi === 'EKSIK_TAMAMLAMA'
      ) {
        const benHistory = historyByBen.get(bId) || [];
        const thisIdx = benHistory.indexOf(r);
        const subsequentEvents = thisIdx !== -1 ? benHistory.slice(thisIdx + 1) : [];

        // Bu kayıttan sonra bir İPTAL işlemi yapılmış mı?
        const hasSubsequentCancel = subsequentEvents.some((e: any) => e.islem_tipi === 'IPTAL');

        const isCurrentlyDeliveredInDb =
          ben &&
          (ben.teslimat_durumu === 'TAMAMLANDI' ||
            ben.teslimat_durumu === 'TESLIM_EDILDI' ||
            ben.teslimat_durumu === 'EKSIK' ||
            (Number(ben.torba_sayisi) > 0 && ben.imza_durumu === 'IMZALANDI'));
        const isSignatureRevoked = !ben || (ben.imza_durumu !== 'IMZALANDI' && Number(ben.torba_sayisi || 0) === 0);
        const isCoalCancelled = ben && (ben.komur_verilmeyecek === true || ben.komur_verilmeyecek === 'true');

        if (hasSubsequentCancel || !isCurrentlyDeliveredInDb || isSignatureRevoked || isCoalCancelled) {
          r.iptal_edildi = true;
        } else {
          r.iptal_edildi = false;
        }

        if (r.iptal_edildi && !r._raw_iptal_edildi) {
          autoHealIds.push(r.id || r._id);
        } else if (!r.iptal_edildi && r._raw_iptal_edildi) {
          autoHealUncancelIds.push(r.id || r._id);
        }
      }
    }

    // Her hak sahibi için son İPTAL işleminden sonraki İLK geçerli teslimatı "Esas (İlk) Teslimat" olarak işaretle;
    // sonraki günlerde yapılan tamamlama kayıtlarını ise "EKSIK_TAMAMLAMA" olarak ayır (günlük tutanaklara mükerrer girmesin)
    for (const [, benEvents] of historyByBen.entries()) {
      const validDeliveries = benEvents.filter(
        (e: any) =>
          (e.islem_tipi === 'TESLIMAT' ||
            e.islem_tipi === 'EKSIK_TESLIMAT' ||
            e.islem_tipi === 'EKSIK_TAMAMLAMA') &&
          !e.iptal_edildi
      );
      if (validDeliveries.length > 0) {
        const primaryRecord = validDeliveries[0];
        const ben =
          benMap.get(String(primaryRecord.beneficiary_id || '')) ||
          (primaryRecord.tc_no ? benMap.get(String(primaryRecord.tc_no).trim()) : undefined);
        const fullQuota = Number(ben?.hedef_torba) || Number(primaryRecord.hedef_torba) || 34;
        const fiiliIlkTorba = Number(primaryRecord.fiili_ilk_torba ?? primaryRecord.torba_sayisi) || 0;
        const completionRecord = validDeliveries.length > 1 ? validDeliveries[validDeliveries.length - 1] : null;

        primaryRecord.is_ilk_teslimat = true;
        primaryRecord.is_eksik_tamamlama = false;
        primaryRecord.hedef_torba = fullQuota;
        primaryRecord.fiili_ilk_torba = fiiliIlkTorba;
        // Tutanaklarda eksik kömür verilmiş olsa dahi ilk teslim gününde tam teslimat (hedef kota) olarak görünür
        primaryRecord.torba_sayisi = fullQuota;
        primaryRecord.ilk_teslimat_tarihi =
          ben?.ilk_teslimat_tarihi || primaryRecord.tarih || primaryRecord.gun_tarihi;
        primaryRecord.eksik_tamamlanma_tarihi =
          ben?.eksik_tamamlanma_tarihi ||
          primaryRecord.eksik_tamamlanma_tarihi ||
          (completionRecord ? completionRecord.tarih : null);

        for (let i = 1; i < validDeliveries.length; i++) {
          validDeliveries[i].is_ilk_teslimat = false;
          validDeliveries[i].is_eksik_tamamlama = true;
          validDeliveries[i].islem_tipi = 'EKSIK_TAMAMLAMA';
          validDeliveries[i].ilk_teslimat_tarihi = primaryRecord.ilk_teslimat_tarihi;
        }
      }
    }

    // Veritabanındaki eski kayıtları arka planda otomatik onar
    if (autoHealIds.length > 0) {
      try {
        const idFilters = autoHealIds.map((id) => buildIdFilter(id));
        await histCol.updateMany(
          { $or: idFilters },
          { $set: { iptal_edildi: true } }
        );
      } catch (err) {
        console.warn('Auto-heal history flags network blip:', err);
      }
    }
    if (autoHealUncancelIds.length > 0) {
      try {
        const idFilters = autoHealUncancelIds.map((id) => buildIdFilter(id));
        await histCol.updateMany(
          { $or: idFilters },
          { $set: { iptal_edildi: false } }
        );
      } catch (err) {
        console.warn('Auto-heal uncancel history flags network blip:', err);
      }
    }

    // 3. İstenen filtreye göre kayıtları sınırla
    // Günlük teslim tutanaklarında yalnızca o güne ait İLK TESLİMAT yapılan kayıtlar dahil edilir
    let records = allHistoryMapped.filter((r: any) => !r.is_eksik_tamamlama);

    if (islemTipi && islemTipi !== 'HEPSI') {
      if (islemTipi === 'TESLIMAT') {
        records = records.filter(
          (r: any) =>
            (r.islem_tipi === 'TESLIMAT' || r.islem_tipi === 'EKSIK_TESLIMAT') &&
            !r.iptal_edildi &&
            !r.is_eksik_tamamlama
        );
      } else if (islemTipi === 'IPTAL') {
        records = records.filter((r: any) => r.islem_tipi === 'IPTAL' || r.iptal_edildi);
      } else {
        records = allHistoryMapped.filter((r: any) => r.islem_tipi === islemTipi);
      }
    }

    if (gun) {
      records = records.filter((r: any) => r.gun_tarihi === gun);
    }

    if (q) {
      records = records.filter((item: any) => isBirebirBeneficiaryMatch(item, q));
    }

    // Tarihe göre azalan sırala (en yeniden en eskiye)
    records.sort((a: any, b: any) => {
      const tA = new Date(b.tarih || b.created_at || 0).getTime();
      const tB = new Date(a.created_at || a.created_at || 0).getTime();
      return tA - tB;
    });

    // 4. Günlük gruplama (Yalnızca o güne ait ilk teslimatları teslimatSayisi ve toplamTorba'ya dahil et; gelen tonajı ve torba ağırlık farklarını bağla)
    const groupedDaysMap = new Map<
      string,
      {
        gun_tarihi: string;
        items: any[];
        toplamTorba: number;
        teslimatSayisi: number;
        iptalSayisi: number;
        gelen_tonaj: number;
        fiili_dagitilan_tonaj?: number;
        resmi_kabul_tonaj?: number;
        beklenen_standart_torba?: number;
        beklenen_standart_hane?: number;
        ortalama_torba_kg?: number;
        ortalama_hane_kg?: number;
        artan_torba?: number;
        artan_hane_kesirli?: number;
        acik_torba?: number;
        acik_hane_kesirli?: number;
      }
    >();

    for (const item of records) {
      const g = item.gun_tarihi || 'Bilinmeyen Tarih';
      if (!groupedDaysMap.has(g)) {
        groupedDaysMap.set(g, {
          gun_tarihi: g,
          items: [],
          toplamTorba: 0,
          teslimatSayisi: 0,
          iptalSayisi: 0,
          gelen_tonaj: trucksByDate.get(g) || 0,
        });
      }
      const dayGroup = groupedDaysMap.get(g)!;
      dayGroup.items.push(item);

      if (
        (item.islem_tipi === 'TESLIMAT' || item.islem_tipi === 'EKSIK_TESLIMAT') &&
        !item.iptal_edildi &&
        !item.is_eksik_tamamlama
      ) {
        dayGroup.toplamTorba += Number(item.hedef_torba) || Number(item.torba_sayisi) || 34;
        dayGroup.teslimatSayisi += 1;
      } else if (item.islem_tipi === 'IPTAL') {
        dayGroup.iptalSayisi += 1;
      }
    }

    const groupedDays = Array.from(groupedDaysMap.values()).map((dg) => {
      const gelenTon = Number(dg.gelen_tonaj || 0);
      const resmiTon = parseFloat((dg.toplamTorba * 0.025).toFixed(2));
      const fiiliTon = gelenTon > 0 ? gelenTon : resmiTon;
      const beklenenTorba = gelenTon > 0 ? Math.round((gelenTon * 1000) / 25) : 0;
      const beklenenHane = beklenenTorba > 0 ? parseFloat((beklenenTorba / 34).toFixed(2)) : 0;
      const ortTorbaKg =
        gelenTon > 0 && dg.toplamTorba > 0
          ? parseFloat(((gelenTon * 1000) / dg.toplamTorba).toFixed(2))
          : 0;
      const ortHaneKg = ortTorbaKg > 0 ? Math.round(ortTorbaKg * 34) : 850;
      const artanTorba =
        gelenTon > 0 && dg.toplamTorba > beklenenTorba ? dg.toplamTorba - beklenenTorba : 0;
      const acikTorba =
        gelenTon > 0 && dg.toplamTorba > 0 && dg.toplamTorba < beklenenTorba
          ? beklenenTorba - dg.toplamTorba
          : 0;

      return {
        ...dg,
        fiili_dagitilan_tonaj: fiiliTon,
        resmi_kabul_tonaj: resmiTon,
        beklenen_standart_torba: beklenenTorba,
        beklenen_standart_hane: beklenenHane,
        ortalama_torba_kg: ortTorbaKg,
        ortalama_hane_kg: ortHaneKg,
        artan_torba: artanTorba,
        artan_hane_kesirli: artanTorba > 0 ? parseFloat((artanTorba / 34).toFixed(2)) : 0,
        acik_torba: acikTorba,
        acik_hane_kesirli: acikTorba > 0 ? parseFloat((acikTorba / 34).toFixed(2)) : 0,
      };
    });

    // 5. Genel Özet İstatistikleri (Tüm Geçmiş Üzerinden - İptaller ve İmzası Geri Alınanlar Düşülmüş, İlk Teslimat Bazlı)
    const { nowEnCa: localToday } = getIstanbulDate();

    let toplamTeslimatSayisi = 0;
    let toplamTorbaSayisi = 0;
    let toplamIptalSayisi = 0;
    let bugunTeslimatSayisi = 0;
    let bugunTorbaSayisi = 0;

    for (const item of allHistoryMapped) {
      const isValidPrimaryDelivery =
        (item.islem_tipi === 'TESLIMAT' || item.islem_tipi === 'EKSIK_TESLIMAT') &&
        !item.iptal_edildi &&
        !item.is_eksik_tamamlama;

      if (isValidPrimaryDelivery) {
        const quotaBags = Number(item.hedef_torba) || Number(item.torba_sayisi) || 34;
        toplamTeslimatSayisi += 1;
        toplamTorbaSayisi += quotaBags;
        if (item.gun_tarihi === localToday) {
          bugunTeslimatSayisi += 1;
          bugunTorbaSayisi += quotaBags;
        }
      } else if (item.islem_tipi === 'IPTAL' || item.iptal_edildi) {
        if (item.islem_tipi === 'IPTAL') {
          toplamIptalSayisi += 1;
        }
      }
    }

    const toplamResmiKabulTonaj = parseFloat((toplamTorbaSayisi * 0.025).toFixed(2));
    const toplamGelenTonajAllDays = Array.from(trucksByDate.values()).reduce((a, b) => a + b, 0);
    const toplamFiiliTonaj =
      toplamGelenTonajAllDays > 0
        ? parseFloat(Math.min(toplamGelenTonajAllDays, toplamResmiKabulTonaj).toFixed(2))
        : toplamResmiKabulTonaj;
    const toplamArtanTorba = groupedDays.reduce((acc, g) => acc + (g.artan_torba || 0), 0);
    const toplamAcikTorba = groupedDays.reduce((acc, g) => acc + (g.acik_torba || 0), 0);

    return NextResponse.json({
      success: true,
      records,
      groupedDays,
      stats: {
        toplamTeslimatSayisi,
        toplamTorbaSayisi,
        toplamFiiliTonaj,
        toplamResmiKabulTonaj,
        toplamArtanTorba,
        toplamAcikTorba,
        toplamIptalSayisi,
        bugunTeslimatSayisi,
        bugunTorbaSayisi,
      },
    });
  } catch (error: any) {
    if (error?.digest === 'NEXT_PRERENDER_INTERRUPTED') throw error;
    return serverError('delivery/history:GET', error);
  }
}
