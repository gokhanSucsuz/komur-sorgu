import { NextRequest, NextResponse } from 'next/server';
import { getDbCollections, mapDocs, recordActivityLog } from '@/lib/mongodb';
import { buildTurkishSearchFilter } from '@/lib/normalizer';
import { verifySession } from '@/lib/auth';

// GET /api/activity-logs - Query user activity/audit logs
export async function GET(request: NextRequest) {
  try {
    const session = await verifySession(request, { requiredRole: 'ADMIN' });
    if (!session.valid) {
      return session.response || NextResponse.json(
        { success: false, error: 'Yetkisiz erişim! Güvenlik ve denetim loglarını sadece Sistem Yöneticisi görüntüleyebilir.' },
        { status: 401 }
      );
    }

    const { activityLogs } = await getDbCollections();

    const searchParams = request.nextUrl.searchParams;

    const q = (searchParams.get('q') || '').trim();
    const islemTipi = (searchParams.get('islem_tipi') || '').trim();
    const personel = (searchParams.get('personel') || '').trim();
    const startDate = (searchParams.get('startDate') || '').trim();
    const endDate = (searchParams.get('endDate') || '').trim();
    const gun = (searchParams.get('gun') || '').trim();
    const limit = parseInt(searchParams.get('limit') || '200', 10);
    const page = parseInt(searchParams.get('page') || '1', 10);

    const filter: any = {};

    if (q) {
      const searchFilter = buildTurkishSearchFilter(q, [
        'kullanici_adi',
        'baslik',
        'detay',
        'hedef_kisi',
        'hedef_tc',
        'mahalle',
      ]);
      if (searchFilter.$and) {
        filter.$and = searchFilter.$and;
      } else if (searchFilter.$or) {
        filter.$or = searchFilter.$or;
      }
    }

    if (islemTipi && islemTipi !== 'HEPSI') {
      if (islemTipi === 'TESLIMAT') {
        filter.islem_tipi = { $in: ['TESLIMAT', 'EKSIK_TESLIMAT'] };
      } else if (islemTipi === 'ROTA') {
        filter.islem_tipi = { $in: ['ROTA_OLUSTURMA', 'ROTA_KAPATMA', 'ROTA_GUNCELLEME'] };
      } else if (islemTipi === 'EXCEL') {
        filter.islem_tipi = { $in: ['EXCEL_YUKLEME', 'EXCEL_SILME'] };
      } else if (islemTipi === 'MESAI') {
        filter.islem_tipi = { $in: ['MESAI_BASLAT', 'MESAI_BITIR'] };
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

    const rawLogs = await activityLogs
      .find(filter)
      .sort({ _id: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .toArray();

    const total = await activityLogs.countDocuments(filter);
    const logs = mapDocs(rawLogs);

    // Dynamic stats and personnel list across all logs
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
    console.error('Error fetching activity logs:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

// POST /api/activity-logs - Record custom activity log
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { kullanici_adi, kullanici_rolu, islem_tipi, baslik, detay, hedef_kisi, hedef_tc, mahalle, torba_sayisi, ek_bilgi } = body;

    if (!kullanici_adi || !islem_tipi || !baslik) {
      return NextResponse.json({ success: false, error: 'Kullanıcı adı, işlem tipi ve başlık zorunludur' }, { status: 400 });
    }

    const recorded = await recordActivityLog({
      kullanici_adi,
      kullanici_rolu,
      islem_tipi,
      baslik,
      detay: detay || '',
      hedef_kisi,
      hedef_tc,
      mahalle,
      torba_sayisi,
      ek_bilgi,
    });

    return NextResponse.json({ success: true, log: recorded });
  } catch (error: any) {
    console.error('Error creating activity log:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
