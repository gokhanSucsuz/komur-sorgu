import { NextRequest, NextResponse } from 'next/server';
import { getDbCollections, mapDocs, buildIdFilter } from '@/lib/mongodb';
import { isBirebirBeneficiaryMatch } from '@/lib/normalizer';
import { getIstanbulDate } from '@/lib/dateUtils';
import { verifySession } from '@/lib/auth';
import { serverError, asString } from '@/lib/security';

export async function GET(request: NextRequest) {
  try {
    const session = await verifySession(request);
    if (!session.valid) {
      return session.response || NextResponse.json({ success: false, error: 'Oturum gerekli' }, { status: 401 });
    }

    const { deliveryHistory: histCol, beneficiaries: benCol } = await getDbCollections();
    const searchParams = request.nextUrl.searchParams;
    const islemTipi = asString(searchParams.get('tip'), 32); // 'TESLIMAT', 'IPTAL', or all
    const gun = asString(searchParams.get('gun'), 32); // YYYY-MM-DD
    const q = asString(searchParams.get('q'), 100);

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

    // Hak sahibi bazında geçmiş kayıtlarını grupla
    const historyByBen = new Map<string, any[]>();
    for (const r of allHistoryMapped) {
      const bId = String(r.beneficiary_id || '');
      if (!historyByBen.has(bId)) historyByBen.set(bId, []);
      historyByBen.get(bId)!.push(r);
    }

    const autoHealIds: any[] = [];

    // Her teslimat kaydının geçerliliğini ve iptal durumunu doğrula
    for (const r of allHistoryMapped) {
      if (r.islem_tipi === 'TESLIMAT' || r.islem_tipi === 'EKSIK_TESLIMAT') {
        const bId = String(r.beneficiary_id || '');
        const ben = benMap.get(bId) || (r.tc_no ? benMap.get(String(r.tc_no).trim()) : undefined);
        const benHistory = historyByBen.get(bId) || [];
        const thisIdx = benHistory.indexOf(r);
        const subsequentEvents = thisIdx !== -1 ? benHistory.slice(thisIdx + 1) : [];

        const hasSubsequentCancel = subsequentEvents.some((e: any) => e.islem_tipi === 'IPTAL');
        const hasSubsequentDelivery = subsequentEvents.some(
          (e: any) => e.islem_tipi === 'TESLIMAT' || e.islem_tipi === 'EKSIK_TESLIMAT'
        );
        const isCurrentlyDeliveredInDb =
          ben && (ben.teslimat_durumu === 'TAMAMLANDI' || ben.teslimat_durumu === 'TESLIM_EDILDI');
        const isSignatureRevoked = !ben || ben.imza_durumu !== 'IMZALANDI';
        const isCoalCancelled = ben && (ben.komur_verilmeyecek === true || ben.komur_verilmeyecek === 'true');

        if (hasSubsequentCancel && !hasSubsequentDelivery) {
          // Kesinlikle iptal edilmiş (örn: Nurettin Dur)
          r.iptal_edildi = true;
        } else if (hasSubsequentDelivery) {
          // Daha sonra yeni bir teslimat yapıldığı için önceki teslimat geçersiz kalmış
          r.iptal_edildi = true;
        } else if (!isCurrentlyDeliveredInDb || isSignatureRevoked || isCoalCancelled) {
          // Hak sahibi veritabanında teslim edilmemiş veya imzası geri alınmış
          r.iptal_edildi = true;
        } else {
          r.iptal_edildi = false;
        }

        if (r.iptal_edildi && !r._raw_iptal_edildi) {
          autoHealIds.push(r.id || r._id);
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

    // 3. İstenen filtreye göre kayıtları sınırla
    let records = allHistoryMapped;

    if (islemTipi && islemTipi !== 'HEPSI') {
      if (islemTipi === 'TESLIMAT') {
        records = records.filter(
          (r: any) => (r.islem_tipi === 'TESLIMAT' || r.islem_tipi === 'EKSIK_TESLIMAT') && !r.iptal_edildi
        );
      } else if (islemTipi === 'IPTAL') {
        records = records.filter((r: any) => r.islem_tipi === 'IPTAL' || r.iptal_edildi);
      } else {
        records = records.filter((r: any) => r.islem_tipi === islemTipi);
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
      const tB = new Date(a.tarih || a.created_at || 0).getTime();
      return tA - tB;
    });

    // 4. Günlük gruplama (Yalnızca geçerli teslimatları teslimatSayisi ve toplamTorba'ya dahil et)
    const groupedDaysMap = new Map<
      string,
      { gun_tarihi: string; items: any[]; toplamTorba: number; teslimatSayisi: number; iptalSayisi: number }
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
        });
      }
      const dayGroup = groupedDaysMap.get(g)!;
      dayGroup.items.push(item);

      if ((item.islem_tipi === 'TESLIMAT' || item.islem_tipi === 'EKSIK_TESLIMAT') && !item.iptal_edildi) {
        dayGroup.toplamTorba += item.torba_sayisi || 0;
        dayGroup.teslimatSayisi += 1;
      } else if (item.islem_tipi === 'IPTAL') {
        dayGroup.iptalSayisi += 1;
      }
    }

    const groupedDays = Array.from(groupedDaysMap.values());

    // 5. Genel Özet İstatistikleri (Tüm Geçmiş Üzerinden - İptaller ve İmzası Geri Alınanlar Düşülmüş)
    const { nowEnCa: localToday } = getIstanbulDate();

    let toplamTeslimatSayisi = 0;
    let toplamTorbaSayisi = 0;
    let toplamIptalSayisi = 0;
    let bugunTeslimatSayisi = 0;
    let bugunTorbaSayisi = 0;

    for (const item of allHistoryMapped) {
      const isValidDelivery =
        (item.islem_tipi === 'TESLIMAT' || item.islem_tipi === 'EKSIK_TESLIMAT') && !item.iptal_edildi;

      if (isValidDelivery) {
        toplamTeslimatSayisi += 1;
        toplamTorbaSayisi += item.torba_sayisi || 0;
        if (item.gun_tarihi === localToday) {
          bugunTeslimatSayisi += 1;
          bugunTorbaSayisi += item.torba_sayisi || 0;
        }
      } else if (item.islem_tipi === 'IPTAL' || item.iptal_edildi) {
        if (item.islem_tipi === 'IPTAL') {
          toplamIptalSayisi += 1;
        }
      }
    }

    return NextResponse.json({
      success: true,
      records,
      groupedDays,
      stats: {
        toplamTeslimatSayisi,
        toplamTorbaSayisi,
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
