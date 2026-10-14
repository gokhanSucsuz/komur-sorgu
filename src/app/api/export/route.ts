import { NextRequest, NextResponse } from 'next/server';
import * as XLSX from 'xlsx';
import { getDbCollections, mapDocs } from '@/lib/mongodb';
import { extractPhoneNumbers } from '@/lib/normalizer';

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
          'Telefon 2': '05321112233',
          'Mahalle': 'Cumhuriyet Mah.',
          'Açık Adres': 'Karanfil Cad. Lale Sokak No: 12 Daire: 4',
          'Hane No': '101',
        },
        {
          'TC Kimlik No': '23456789012',
          'Adı Soyadı': 'Fatma Demir',
          'Telefon': '05429876543',
          'Telefon 2': '',
          'Mahalle': 'İstiklal Mah.',
          'Açık Adres': 'Atatürk Bulvarı No: 45',
          'Hane No': '102',
        },
        {
          'TC Kimlik No': '34567890123',
          'Adı Soyadı': 'Mehmet Çelik',
          'Telefon': '05335554433',
          'Telefon 2': '05051234567',
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
        { wch: 15 }, // Telefon 2
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

    const { beneficiaries: benCol, importLogs: logsCol, deliveryHistory: histCol } = await getDbCollections();

    if (type === 'daily_deliveries') {
      const targetDate = searchParams.get('date') || new Date().toLocaleDateString('en-CA');
      
      const filter: any = { islem_tipi: 'TESLIMAT' };
      if (targetDate && targetDate !== 'ALL') {
        filter.gun_tarihi = targetDate;
      }

      const rawRecords = await histCol
        .find(filter)
        .sort({ tarih: 1 })
        .toArray();

      const records = mapDocs(rawRecords);

      let totalBags = 0;
      const exportData = records.map((r: any, idx: number) => {
        const bag = r.torba_sayisi || 0;
        totalBags += bag;
        return {
          'Sıra': idx + 1,
          'Teslim Tarihi / Saati': r.tarih || '-',
          'TC Kimlik No': r.tc_no,
          'Adı Soyadı': r.ad_soyad,
          'Mahalle': r.mahalle,
          'Açık Adres': r.acik_adres || '-',
          'Teslim Edilen Torba': bag,
          'Teslim Alan': r.teslim_alan || r.ad_soyad,
          'Teslim Eden Personel': r.personel || '-',
          'Açıklama / Not': r.notlar || '-',
        };
      });

      // Summary row at the bottom
      if (exportData.length > 0) {
        exportData.push({
          'Sıra': '' as any,
          'Teslim Tarihi / Saati': 'TOPLAM:',
          'TC Kimlik No': `${exportData.length} Hane`,
          'Adı Soyadı': '',
          'Mahalle': '',
          'Açık Adres': '',
          'Teslim Edilen Torba': `${totalBags} Torba (${(totalBags * 0.025).toFixed(2)} Ton)` as any,
          'Teslim Alan': '',
          'Teslim Eden Personel': '',
          'Açıklama / Not': '',
        });
      }

      const worksheet = XLSX.utils.json_to_sheet(exportData);
      worksheet['!cols'] = [
        { wch: 6 },  // Sıra
        { wch: 20 }, // Tarih/Saat
        { wch: 15 }, // TC
        { wch: 24 }, // Ad Soyad
        { wch: 18 }, // Mahalle
        { wch: 35 }, // Açık Adres
        { wch: 18 }, // Torba
        { wch: 22 }, // Teslim Alan
        { wch: 20 }, // Personel
        { wch: 30 }, // Not
      ];

      XLSX.utils.book_append_sheet(workbook, worksheet, 'Teslimat Listesi');
      const buf = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });
      return new NextResponse(buf, {
        headers: {
          'Content-Disposition': `attachment; filename="Gunluk_Komur_Teslimat_Listesi_${targetDate}.xlsx"`,
          'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        },
      });
    }

    if (type === 'beneficiaries') {
      const rawRecords = await benCol
        .find({})
        .sort({ mahalle: 1, ad_soyad: 1 })
        .toArray();

      const records = mapDocs(rawRecords);

      const exportData = records.map((r: any, idx: number) => {
        const phones = extractPhoneNumbers(r.telefon, r.telefon2);
        return {
          'Sıra': idx + 1,
          'TC Kimlik No': r.tc_no,
          'Adı Soyadı': r.ad_soyad,
          'Telefon': phones[0] || r.telefon || '-',
          'Telefon 2': phones[1] || r.telefon2 || '-',
          'Mahalle': r.mahalle,
          'Açık Adres': r.acik_adres,
          'Hane No': r.hane_no || '-',
          'Durum': r.teslimat_durumu === 'TAMAMLANDI' || r.teslimat_durumu === 'TESLIM_EDILDI' ? 'Teslim Edildi' : 'Bekliyor',
          'Torba Sayısı': r.torba_sayisi || 0,
          'Teslimat Tarihi': r.teslimat_tarihi || '-',
          'Teslim Alan': r.teslim_alan || '-',
          'Teslim Eden Personel': r.teslim_eden_personel || '-',
        };
      });

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
