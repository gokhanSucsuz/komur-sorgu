import { NextRequest, NextResponse } from 'next/server';
import * as XLSX from 'xlsx';
import { getDbCollections, mapDocs } from '@/lib/mongodb';

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const type = searchParams.get('type') || 'template'; // 'template', 'beneficiaries', 'errors', 'deliveries'

    const workbook = XLSX.utils.book_new();

    if (type === 'template') {
      const templateData = [
        {
          'TC Kimlik No': '12345678901',
          'Adı Soyadı': 'Ahmet Yılmaz',
          'Telefon': '05551234567',
          'Mahalle': 'Cumhuriyet Mah.',
          'Açık Adres': 'Karanfil Cad. Lale Sokak No: 12 Daire: 4',
          'Hane No': '101',
        },
        {
          'TC Kimlik No': '23456789012',
          'Adı Soyadı': 'Fatma Demir',
          'Telefon': '05429876543',
          'Mahalle': 'İstiklal Mah.',
          'Açık Adres': 'Atatürk Bulvarı No: 45',
          'Hane No': '102',
        },
        {
          'TC Kimlik No': '34567890123',
          'Adı Soyadı': 'Mehmet Çelik',
          'Telefon': '05335554433',
          'Mahalle': 'Fatih Mah.',
          'Açık Adres': 'Menekşe Sok. No: 8',
          'Hane No': '103',
        },
      ];

      const worksheet = XLSX.utils.json_to_sheet(templateData);
      worksheet['!cols'] = [
        { wch: 15 }, // TC
        { wch: 22 }, // Ad Soyad
        { wch: 15 }, // Telefon
        { wch: 20 }, // Mahalle
        { wch: 40 }, // Açık Adres
        { wch: 12 }, // Hane No
      ];
      XLSX.utils.book_append_sheet(workbook, worksheet, 'Hak Sahipleri');

      const buf = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });
      return new NextResponse(buf, {
        headers: {
          'Content-Disposition': 'attachment; filename="Komur_Yukleme_Sablonu.xlsx"',
          'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        },
      });
    }

    const { beneficiaries: benCol, importLogs: logsCol } = await getDbCollections();

    if (type === 'beneficiaries') {
      const rawRecords = await benCol
        .find({})
        .sort({ mahalle: 1, ad_soyad: 1 })
        .toArray();

      const records = mapDocs(rawRecords);

      const exportData = records.map((r: any, idx: number) => ({
        'Sıra': idx + 1,
        'TC Kimlik No': r.tc_no,
        'Adı Soyadı': r.ad_soyad,
        'Telefon': r.telefon || '-',
        'Mahalle': r.mahalle,
        'Açık Adres': r.acik_adres,
        'Hane No': r.hane_no || '-',
        'Durum': r.teslimat_durumu === 'TAMAMLANDI' || r.teslimat_durumu === 'TESLIM_EDILDI' ? 'Teslim Edildi' : 'Bekliyor',
        'Torba Sayısı': r.torba_sayisi || 0,
        'Teslimat Tarihi': r.teslimat_tarihi || '-',
        'Teslim Alan': r.teslim_alan || '-',
        'Teslim Eden Personel': r.teslim_eden_personel || '-',
      }));

      const worksheet = XLSX.utils.json_to_sheet(exportData);
      XLSX.utils.book_append_sheet(workbook, worksheet, 'Hak Sahipleri');
      const buf = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });
      return new NextResponse(buf, {
        headers: {
          'Content-Disposition': 'attachment; filename="Komur_Hak_Sahipleri_Listesi.xlsx"',
          'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        },
      });
    }

    if (type === 'errors') {
      const rawRecords = await logsCol
        .find({})
        .sort({ _id: -1 })
        .toArray();

      const records = mapDocs(rawRecords);

      const exportData = records.map((r: any, idx: number) => ({
        'Sıra': idx + 1,
        'Hata Nedeni': r.hata_nedeni,
        'Durum / Tip': r.durum,
        'TC Kimlik No': r.tc_no || '-',
        'Adı Soyadı': r.ad_soyad || '-',
        'Telefon': r.telefon || '-',
        'Mahalle': r.mahalle || '-',
        'Açık Adres': r.acik_adres || '-',
        'Hane No': r.hane_no || '-',
        'Tarih': r.tarih || '-',
      }));

      const worksheet = XLSX.utils.json_to_sheet(exportData);
      XLSX.utils.book_append_sheet(workbook, worksheet, 'Yukleme Hatalari');
      const buf = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });
      return new NextResponse(buf, {
        headers: {
          'Content-Disposition': 'attachment; filename="Komur_Yukleme_Hatalari_Raporu.xlsx"',
          'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        },
      });
    }

    return NextResponse.json({ success: false, error: 'Geçersiz export tipi' }, { status: 400 });
  } catch (error: any) {
    console.error('Error generating export:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
