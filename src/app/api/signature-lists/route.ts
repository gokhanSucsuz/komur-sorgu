import { NextRequest, NextResponse } from 'next/server';
import { getDbCollections, mapDocs, recordActivityLog, touchSyncPulse } from '@/lib/mongodb';
import { decryptBeneficiary } from '@/lib/crypto';
import { getIstanbulDate } from '@/lib/dateUtils';
import { verifySession } from '@/lib/auth';
import { normalizeMahalleName } from '@/lib/normalizer';
import { serverError, asString } from '@/lib/security';

export async function GET(request: NextRequest) {
  try {
    const session = await verifySession(request);
    if (!session.valid) {
      return session.response || NextResponse.json({ success: false, error: 'Oturum gerekli' }, { status: 401 });
    }

    const { searchParams } = request.nextUrl;
    const donemKoduParam = asString(searchParams.get('donem_kodu'), 32);

    const {
      beneficiaries: benCol,
      signatureLists,
      systemSettings,
      calismaModu,
      isSandboxMode,
    } = await getDbCollections();

    // Aktif sezon kodunu belirle
    let activeSeason = donemKoduParam;
    if (!activeSeason || activeSeason === 'AKTIF') {
      try {
        const seasonDoc = await systemSettings.findOne({ key: 'aktif_donem' });
        activeSeason = seasonDoc?.value || '2026-2027';
      } catch {
        activeSeason = '2026-2027';
      }
    }

    // Aktif dönem hak sahiplerini çek
    const rawBeneficiaries = await benCol.find({}).toArray();
    const allBeneficiaries = rawBeneficiaries.map(decryptBeneficiary);

    // İmza listesi durumlarına göre ayır
    const unassigned = allBeneficiaries.filter((b: any) => !b.imza_listesi_id);
    const assigned = allBeneficiaries.filter((b: any) => Boolean(b.imza_listesi_id));

    // Mahalle bazında bekleyen yeni kayıt dağılımı
    const pendingMahalleMap = new Map<string, number>();
    for (const b of unassigned) {
      const m = normalizeMahalleName(b.mahalle) || b.mahalle || 'Genel';
      pendingMahalleMap.set(m, (pendingMahalleMap.get(m) || 0) + 1);
    }

    const pendingMahalleler = Array.from(pendingMahalleMap.entries())
      .map(([mahalle, count]) => ({ mahalle, count }))
      .sort((a, b) => b.count - a.count);

    // Kayıtlı imza listelerini çek
    const rawLists = await signatureLists.find({}).sort({ liste_no: -1 }).toArray();
    const lists = mapDocs(rawLists);

    const maxNo = lists.reduce((max: number, l: any) => Math.max(max, Number(l.liste_no || 0)), 0);
    const nextListNo = maxNo + 1;

    return NextResponse.json({
      success: true,
      donemKodu: activeSeason,
      calismaModu,
      isSandbox: isSandboxMode,
      totalCount: allBeneficiaries.length,
      pendingCount: unassigned.length,
      assignedCount: assigned.length,
      pendingMahalleCount: pendingMahalleMap.size,
      pendingMahalleler,
      nextListNo,
      lists,
    });
  } catch (error: any) {
    return serverError('signature-lists:GET', error);
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await verifySession(request, { requiredRole: 'ADMIN' });
    if (!session.valid) {
      return (
        session.response ||
        NextResponse.json(
          {
            success: false,
            error: 'Yetkisiz erişim! Islak imza listesi oluşturma ve yönetme yetkisi sadece Yöneticilere aittir.',
          },
          { status: 403 }
        )
      );
    }

    const body = await request.json().catch(() => ({}));
    const action = asString(body.action, 64) || 'GENERATE_NEW_LIST';
    const adminName = session.ad_soyad || session.username || 'Sistem Yöneticisi';
    const { nowLocaleTr: nowStr, nowIso } = getIstanbulDate();

    const {
      beneficiaries: benCol,
      signatureLists,
      systemSettings,
      calismaModu,
      isSandboxMode,
    } = await getDbCollections();

    // 1. YENİ İMZA LİSTESİ OLUŞTURMA
    if (action === 'GENERATE_NEW_LIST') {
      let activeSeason = asString(body.donem_kodu, 32);
      if (!activeSeason || activeSeason === 'AKTIF') {
        try {
          const seasonDoc = await systemSettings.findOne({ key: 'aktif_donem' });
          activeSeason = seasonDoc?.value || '2026-2027';
        } catch {
          activeSeason = '2026-2027';
        }
      }

      // Henüz bir imza listesine atanmamış tüm hak sahiplerini bul
      const rawBeneficiaries = await benCol.find({}).toArray();
      const allBeneficiaries = rawBeneficiaries.map((raw: any) => ({
        ...decryptBeneficiary(raw),
        _rawId: raw._id || raw.id,
      }));

      // KURAL: Bir kayıt sadece tek bir imza listesinde olabilir!
      // Sadece imza_listesi_id'si boş/tanımsız olan kayıtlar yeni listeye dahil edilir.
      const unassigned = allBeneficiaries.filter((b: any) => !b.imza_listesi_id);

      if (unassigned.length === 0) {
        return NextResponse.json(
          {
            success: false,
            error: 'İmza listesi çıkarılacak bekleyen YENİ kayıt bulunamadı. Tüm hak sahipleri zaten mevcut bir imza listesine atanmış durumda.',
          },
          { status: 400 }
        );
      }

      // Sıradaki Liste No hesapla
      const existingLists = await signatureLists.find({}).toArray();
      const maxNo = existingLists.reduce((max: number, l: any) => Math.max(max, Number(l.liste_no || 0)), 0);
      const nextNo = maxNo + 1;

      const randomSuffix = Math.random().toString(36).substring(2, 6).toUpperCase();
      const listId = `IMZA-${Date.now().toString(36).toUpperCase()}-${String(nextNo).padStart(3, '0')}-${randomSuffix}`;
      const listName =
        nextNo === 1
          ? '1. Dağıtım Islak İmza Listesi (Genel)'
          : `${nextNo}. Dağıtım Islak İmza Listesi (Yeni Eklenen Kayıtlar)`;

      // Mahalle bazında dağılımı hesapla
      const mahalleCounts: Record<string, number> = {};
      for (const item of unassigned) {
        const m = normalizeMahalleName(item.mahalle) || item.mahalle || 'Genel';
        mahalleCounts[m] = (mahalleCounts[m] || 0) + 1;
      }
      const mahalleSayisi = Object.keys(mahalleCounts).length;

      // Tüm bekleyen kayıtları bu imza listesi kimliğiyle güncelle (Kayıt kilitlenir)
      for (const item of unassigned) {
        await benCol.updateOne(
          { _id: item._rawId },
          {
            $set: {
              imza_listesi_id: listId,
              imza_listesi_no: nextNo,
              imza_listesi_adi: listName,
              imza_listesi_tarihi: nowStr,
              updated_at: nowStr,
            },
          }
        );
      }

      // İmza listesi meta-belgesini kaydet
      const newListDoc = {
        id: listId,
        liste_no: nextNo,
        liste_adi: listName,
        donem_kodu: activeSeason,
        calisma_modu: calismaModu,
        is_sandbox: isSandboxMode,
        toplam_kayit: unassigned.length,
        mahalle_sayisi: mahalleSayisi,
        mahalle_dagilimi: mahalleCounts,
        olusturan_personel: adminName,
        created_at: nowStr,
        tarih_iso: nowIso,
      };

      await signatureLists.insertOne(newListDoc);

      // Denetim Günlüğü Kaydı
      await recordActivityLog({
        kullanici_adi: adminName,
        kullanici_rolu: 'ADMIN',
        islem_tipi: 'IMZA_LISTESI_OLUSTURMA',
        baslik: `${isSandboxMode ? '[DENEME MODU] ' : ''}Resmi Islak İmza Listesi Oluşturuldu (${listName})`,
        detay: `${isSandboxMode ? '[DENEME / TEST ALANI] ' : ''}"${listName}" kapsamında ${unassigned.length} hak sahibi (${mahalleSayisi} Mahalle) için yeni ıslak imza listesi oluşturuldu ve kayıtlara kilitlendi. Bir kayıt sadece tek bir imza listesinde yer alabilir kuralı uygulandı.`,
        ek_bilgi: {
          listId,
          listName,
          listeNo: nextNo,
          toplamKayit: unassigned.length,
          mahalleSayisi,
          calisma_modu: calismaModu,
        },
      });

      await touchSyncPulse(adminName);

      return NextResponse.json({
        success: true,
        message: `"${listName}" başarıyla oluşturuldu! ${unassigned.length} hane listeye kilitlendi.`,
        listId,
        listName,
        listeNo: nextNo,
        count: unassigned.length,
        mahalleSayisi,
      });
    }

    // 2. İMZA LİSTESİNİ GERİ ALMA (İPTAL ETME - KAYITLARI TEKRAR BEKLEYENE DÖNDÜRME)
    if (action === 'ROLLBACK_LIST') {
      const listId = asString(body.listId, 128);
      if (!listId) {
        return NextResponse.json({ success: false, error: 'Geri alınacak liste ID belirtilmedi' }, { status: 400 });
      }

      const targetList = await signatureLists.findOne({
        $or: [{ id: listId }, { _id: listId }],
      });

      if (!targetList) {
        return NextResponse.json({ success: false, error: 'İptal edilecek imza listesi bulunamadı' }, { status: 404 });
      }

      // Bu listedeki kayıtların imza_listesi alanlarını temizle
      const updateResult = await benCol.updateMany(
        { imza_listesi_id: listId },
        {
          $set: {
            imza_listesi_id: null,
            imza_listesi_no: null,
            imza_listesi_adi: null,
            imza_listesi_tarihi: null,
            updated_at: nowStr,
          },
        }
      );

      // İmza listesini veritabanından sil
      await signatureLists.deleteOne({
        $or: [{ id: listId }, { _id: targetList._id }],
      });

      await recordActivityLog({
        kullanici_adi: adminName,
        kullanici_rolu: 'ADMIN',
        islem_tipi: 'IMZA_LISTESI_IPTAL',
        baslik: `${isSandboxMode ? '[DENEME MODU] ' : ''}İmza Listesi İptal Edildi (${targetList.liste_adi})`,
        detay: `"${targetList.liste_adi}" iptal edildi. Bu listedeki ${updateResult.modifiedCount || 0} hane tekrar imza listesi bekleyen kayıtlar havuzuna aktarıldı.`,
        ek_bilgi: { listId, listName: targetList.liste_adi, modifiedCount: updateResult.modifiedCount },
      });

      await touchSyncPulse(adminName);

      return NextResponse.json({
        success: true,
        message: `"${targetList.liste_adi}" başarıyla geri alındı. İlgili kayıtlar tekrar bekleyen durumuna alındı.`,
      });
    }

    return NextResponse.json({ success: false, error: 'Geçersiz işlem parametresi' }, { status: 400 });
  } catch (error: any) {
    return serverError('signature-lists:POST', error);
  }
}
