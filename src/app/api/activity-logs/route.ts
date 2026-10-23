import { NextRequest, NextResponse } from 'next/server';
import { getDbCollections, mapDocs, recordActivityLog } from '@/lib/mongodb';
import { turkishRecordMatches } from '@/lib/normalizer';
import { verifySession } from '@/lib/auth';
import { serverError, asString, clampInt } from '@/lib/security';

// GET /api/activity-logs - Query user activity/audit logs
export async function GET(request: NextRequest) {
  try {
    const session = await verifySession(request, { requiredRole: 'ADMIN' });
    if (!session.valid) {
      return session.response || NextResponse.json(
        { success: false, error: 'Yetkisiz erişim! Güvenlik ve denetim loglarını sadece Sistem Yöneticisi görüntüleyebilir.' },
        { status: 403 }
      );
    }

    const { activityLogs } = await getDbCollections();

    const searchParams = request.nextUrl.searchParams;

    const q = asString(searchParams.get('q'), 100);
    const islemTipi = asString(searchParams.get('islem_tipi'), 50);
    const personel = asString(searchParams.get('personel'), 100);
    const startDate = asString(searchParams.get('startDate'), 30);
    const endDate = asString(searchParams.get('endDate'), 30);
    const gun = asString(searchParams.get('gun'), 30);
    const limit = clampInt(searchParams.get('limit'), 1, 1000, 200);
    const page = clampInt(searchParams.get('page'), 1, 10000, 1);

    const filter: any = {};

    if (islemTipi && islemTipi !== 'HEPSI') {
      if (islemTipi === 'TESLIMAT') {
        filter.islem_tipi = { $in: ['TESLIMAT', 'EKSIK_TESLIMAT'] };
      } else if (islemTipi === 'ROTA') {
        filter.islem_tipi = { $in: ['ROTA_OLUSTURMA', 'ROTA_KAPATMA', 'ROTA_GUNCELLEME'] };
      } else if (islemTipi === 'EXCEL') {
        filter.islem_tipi = { $in: ['EXCEL_YUKLEME', 'EXCEL_SILME'] };
      } else if (islemTipi === 'MESAI') {
        filter.islem_tipi = { $in: ['MESAI_BASLAT', 'MESAI_BITIR', 'MESAI_GIRIS'] };
      } else if (islemTipi === 'TIR') {
        filter.islem_tipi = { $in: ['TIR_GIRIS', 'TIR_GUNCELLEME', 'TIR_SILME'] };
      } else {
        filter.islem_tipi = islemTipi;
      }
    }

    if (personel && personel !== 'HEPSI') {
      filter.kullanici_adi = personel;
    }

    if (gun) {
      filter.gun_tarihi = gun;
    } else if (startDate || endDate) {
      const dateRange: any = {};
      if (startDate) dateRange.$gte = `${startDate}T00:00:00.000Z`;
      if (endDate) dateRange.$lte = `${endDate}T23:59:59.999Z`;
      filter.tarih_iso = dateRange;
    }

    let logs: any[] = [];
    let total = 0;

    if (!q) {
      const rawLogs = await activityLogs
        .find(filter)
        .sort({ _id: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .toArray();

      total = await activityLogs.countDocuments(filter);
      logs = mapDocs(rawLogs);
    } else {
      // Encrypted fields (detay, hedef_kisi, hedef_tc) must be decrypted before text search
      const rawCandidates = await activityLogs
        .find(filter)
        .sort({ _id: -1 })
        .toArray();
      const decryptedCandidates = mapDocs(rawCandidates);
      const matched = decryptedCandidates.filter((item: any) =>
        turkishRecordMatches(
          item,
          [
            'kullanici_adi',
            'baslik',
            'detay',
            'hedef_kisi',
            'hedef_tc',
            'mahalle',
          ],
          q
        )
      );
      total = matched.length;
      const skip = (page - 1) * limit;
      logs = matched.slice(skip, skip + limit);
    }

    // Dynamic stats and personnel list across logs
    const allRaw = await activityLogs.find({}).sort({ _id: -1 }).limit(1000).toArray();
    const allLogs = mapDocs(allRaw);

    const personnelSet = new Set<string>();
    let teslimatCount = 0;
    let eksikTeslimatCount = 0;
    let iptalCount = 0;
    let rotaCount = 0;
    let excelCount = 0;
    let mesaiCount = 0;

    for (const log of allLogs) {
      if (log.kullanici_adi) {
        personnelSet.add(log.kullanici_adi);
      }
      const tip = log.islem_tipi;
      if (tip === 'TESLIMAT') teslimatCount++;
      else if (tip === 'EKSIK_TESLIMAT') eksikTeslimatCount++;
      else if (tip === 'IPTAL') iptalCount++;
      else if (tip?.startsWith('ROTA')) rotaCount++;
      else if (tip?.startsWith('EXCEL')) excelCount++;
      else if (tip?.startsWith('MESAI')) mesaiCount++;
    }

    return NextResponse.json({
      success: true,
      logs,
      total,
      page,
      limit,
      personelListesi: Array.from(personnelSet).sort((a, b) => a.localeCompare(b, 'tr')),
      stats: {
        toplamIslem: allLogs.length,
        teslimat: teslimatCount,
        eksikTeslimat: eksikTeslimatCount,
        iptal: iptalCount,
        rota: rotaCount,
        excel: excelCount,
        mesai: mesaiCount,
      },
    });
  } catch (error: any) {
    return serverError('activity-logs:GET', error);
  }
}

// POST /api/activity-logs - Record custom activity log (Requires authenticated session)
export async function POST(request: NextRequest) {
  try {
    const session = await verifySession(request);
    if (!session.valid) {
      return session.response || NextResponse.json({ success: false, error: 'Oturum gerekli' }, { status: 401 });
    }

    const body = await request.json();
    const { islem_tipi, baslik, detay, hedef_kisi, hedef_tc, mahalle, torba_sayisi, ek_bilgi } = body;

    const finalUser = session.ad_soyad || session.username || 'Kullanıcı';
    const finalRole = session.rol || 'PERSONEL';

    const cleanIslemTipi = asString(islem_tipi, 50);
    const cleanBaslik = asString(baslik, 150);
    const cleanDetay = asString(detay, 1000);

    if (!finalUser || !cleanIslemTipi || !cleanBaslik) {
      return NextResponse.json({ success: false, error: 'İşlem tipi ve başlık zorunludur' }, { status: 400 });
    }

    const recorded = await recordActivityLog({
      kullanici_adi: finalUser,
      kullanici_rolu: finalRole,
      islem_tipi: cleanIslemTipi,
      baslik: cleanBaslik,
      detay: cleanDetay,
      hedef_kisi: asString(hedef_kisi, 100) || undefined,
      hedef_tc: asString(hedef_tc, 20) || undefined,
      mahalle: asString(mahalle, 100) || undefined,
      torba_sayisi: typeof torba_sayisi === 'number' ? torba_sayisi : undefined,
      ek_bilgi: typeof ek_bilgi === 'object' && ek_bilgi !== null ? ek_bilgi : undefined,
    });

    return NextResponse.json({ success: true, log: recorded });
  } catch (error: any) {
    return serverError('activity-logs:POST', error);
  }
}
