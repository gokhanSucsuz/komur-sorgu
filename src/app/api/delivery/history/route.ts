import { NextRequest, NextResponse } from 'next/server';
import { getDbCollections, mapDocs } from '@/lib/mongodb';
import { turkishRecordMatches } from '@/lib/normalizer';
import { getIstanbulDate } from '@/lib/dateUtils';
import { verifySession } from '@/lib/auth';

export async function GET(request: NextRequest) {
  try {
    const session = await verifySession(request);
    if (!session.valid) {
      return session.response || NextResponse.json({ success: false, error: 'Oturum gerekli' }, { status: 401 });
    }

    const { deliveryHistory: histCol } = await getDbCollections();
    const searchParams = request.nextUrl.searchParams;
    const islemTipi = (searchParams.get('tip') || '').trim(); // 'TESLIMAT', 'IPTAL', or all
    const gun = (searchParams.get('gun') || '').trim(); // YYYY-MM-DD
    const q = (searchParams.get('q') || '').trim();

    const filter: any = {};

    if (islemTipi && islemTipi !== 'HEPSI') {
      filter.islem_tipi = islemTipi;
    }

    if (gun) {
      filter.gun_tarihi = gun;
    }

    const rawRecords = await histCol
      .find(filter)
      .sort({ tarih: -1 })
      .toArray();

    let records = mapDocs(rawRecords);

    if (q) {
      records = records.filter((item: any) =>
        turkishRecordMatches(
          item,
          [
            'tc_no',
            'ad_soyad',
            'mahalle',
            'personel',
            'teslim_alan',
            'acik_adres',
            'notlar',
            'iptal_nedeni',
          ],
          q
        )
      );
    }

    // Group records by gun_tarihi
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
      if (item.islem_tipi === 'TESLIMAT' || item.islem_tipi === 'EKSIK_TESLIMAT') {
        dayGroup.toplamTorba += item.torba_sayisi || 0;
        dayGroup.teslimatSayisi += 1;
      } else if (item.islem_tipi === 'IPTAL') {
        dayGroup.iptalSayisi += 1;
      }
    }

    const groupedDays = Array.from(groupedDaysMap.values());

    // Summary Stats across entire history (reuse rawRecords when filter is empty)
    const allHistory = Object.keys(filter).length === 0 ? rawRecords : await histCol.find({}).toArray();
    const { nowEnCa: localToday } = getIstanbulDate();

    let toplamTeslimatSayisi = 0;
    let toplamTorbaSayisi = 0;
    let toplamIptalSayisi = 0;
    let bugunTeslimatSayisi = 0;
    let bugunTorbaSayisi = 0;

    for (const item of allHistory) {
      if (item.islem_tipi === 'TESLIMAT' || item.islem_tipi === 'EKSIK_TESLIMAT') {
        toplamTeslimatSayisi += 1;
        toplamTorbaSayisi += item.torba_sayisi || 0;
        if (item.gun_tarihi === localToday) {
          bugunTeslimatSayisi += 1;
          bugunTorbaSayisi += item.torba_sayisi || 0;
        }
      } else if (item.islem_tipi === 'IPTAL') {
        toplamIptalSayisi += 1;
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
    console.error('Error fetching delivery history:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
