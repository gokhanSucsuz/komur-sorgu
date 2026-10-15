import { NextRequest, NextResponse } from 'next/server';
import * as XLSX from 'xlsx';
import { getDbCollections, mapDocs } from '@/lib/mongodb';
import { extractPhoneNumbers } from '@/lib/normalizer';

/**
 * Creates an official state foundation standard worksheet with institutional header block
 */
function createOfficialWorksheet(
  title: string,
  subtitle: string,
  data: any[],
  colWidths: { wch: number }[]
) {
  const numCols = colWidths.length;
  const nowStr = new Date().toLocaleString('tr-TR');

  const headerRows = [
    ['T.C. EDİRNE VALİLİĞİ'],
    ['EDİRNE SOSYAL YARDIMLAŞMA VE DAYANIŞMA VAKFI BAŞKANLIĞI'],
    [title.toUpperCase()],
    [`Rapor Kapsamı: ${subtitle} | Düzenleme Tarihi: ${nowStr} | Resmi Kömür Dağıtım Sistemi`],
    [], // Boş ayırıcı satır
  ];

  const worksheet = XLSX.utils.aoa_to_sheet(headerRows);

  if (data && data.length > 0) {
    XLSX.utils.sheet_add_json(worksheet, data, { origin: 'A6' });
  }

  worksheet['!cols'] = colWidths;
  worksheet['!merges'] = [
    { s: { r: 0, c: 0 }, e: { r: 0, c: Math.max(0, numCols - 1) } },
    { s: { r: 1, c: 0 }, e: { r: 1, c: Math.max(0, numCols - 1) } },
    { s: { r: 2, c: 0 }, e: { r: 2, c: Math.max(0, numCols - 1) } },
    { s: { r: 3, c: 0 }, e: { r: 3, c: Math.max(0, numCols - 1) } },
  ];

  return worksheet;
}

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const type = searchParams.get('type') || 'template';

    const workbook = XLSX.utils.book_new();
    workbook.Props = {
      Title: 'Edirne Sosyal Yardımlaşma ve Dayanışma Vakfı Başkanlığı Kömür Dağıtım Raporu',
      Subject: 'Resmi Kömür Dağıtım ve Saha Takip Çıktısı',
      Author: 'Edirne Sosyal Yardımlaşma ve Dayanışma Vakfı Başkanlığı',
      Company: 'T.C. Edirne Valiliği - Edirne SYDV',
      CreatedDate: new Date(),
    };

    // 1. Örnek Yükleme Şablonu
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

      const colWidths = [
        { wch: 16 }, // TC
        { wch: 24 }, // Ad Soyad
        { wch: 16 }, // Telefon
        { wch: 16 }, // Telefon 2
        { wch: 22 }, // Mahalle
        { wch: 45 }, // Açık Adres
        { wch: 14 }, // Hane No
      ];

      const worksheet = createOfficialWorksheet(
        'KÖMÜR YARDIMI HAK SAHİBİ LİSTESİ YÜKLEME ŞABLONU',
        'Toplu Excel Yükleme Formatı (TC, Ad Soyad, Telefon, Mahalle, Açık Adres, Hane No)',
        templateData,
        colWidths
      );

      XLSX.utils.book_append_sheet(workbook, worksheet, 'Hak Sahipleri');
      const buf = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });

      return new NextResponse(buf, {
        headers: {
          'Content-Disposition': 'attachment; filename="Edirne_SYDV_Komur_Yukleme_Sablonu.xlsx"',
          'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        },
      });
    }

    const { beneficiaries: benCol, importLogs: logsCol, deliveryHistory: histCol, activityLogs: actCol } = await getDbCollections();

    // 2. Günlük / Tarih Bazlı Teslimat Listesi
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

      const colWidths = [
        { wch: 6 },  // Sıra
        { wch: 20 }, // Tarih/Saat
        { wch: 16 }, // TC
        { wch: 24 }, // Ad Soyad
        { wch: 18 }, // Mahalle
        { wch: 38 }, // Açık Adres
        { wch: 20 }, // Torba
        { wch: 22 }, // Teslim Alan
        { wch: 20 }, // Personel
        { wch: 30 }, // Not
      ];

      const worksheet = createOfficialWorksheet(
        'KÖMÜR YARDIMI GÜNLÜK DAĞITIM VE TESLİMAT TUTANAĞI',
        `Dağıtım Tarihi: ${targetDate} | Toplam Hane: ${records.length} | Toplam Torba: ${totalBags} (${(totalBags * 0.025).toFixed(2)} Ton)`,
        exportData,
        colWidths
      );

      XLSX.utils.book_append_sheet(workbook, worksheet, 'Teslimat Listesi');
      const buf = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });

      return new NextResponse(buf, {
        headers: {
          'Content-Disposition': `attachment; filename="Edirne_SYDV_Gunluk_Komur_Teslimat_Listesi_${targetDate}.xlsx"`,
          'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        },
      });
    }

    // 3. Hak Sahipleri Genel Listesi
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
          'Durum': r.teslimat_durumu === 'TAMAMLANDI' || r.teslimat_durumu === 'TESLIM_EDILDI' 
            ? 'Teslim Edildi' 
            : r.teslimat_durumu === 'EKSIK' 
            ? `Eksik Teslimat (${r.torba_sayisi || 0}/${r.hedef_torba || 34})` 
            : 'Bekliyor',
          'Hedef Torba': r.hedef_torba || 34,
          'Teslim Edilen Torba': r.torba_sayisi || 0,
          'Kalan Torba': Math.max(0, (r.hedef_torba || 34) - (r.torba_sayisi || 0)),
          'Teslimat Tarihi': r.teslimat_tarihi || '-',
          'Teslim Alan': r.teslim_alan || '-',
          'Teslim Eden Personel': r.teslim_eden_personel || '-',
        };
      });

      const colWidths = [
        { wch: 6 },  // Sıra
        { wch: 16 }, // TC
        { wch: 24 }, // Ad Soyad
        { wch: 15 }, // Telefon
        { wch: 15 }, // Telefon 2
        { wch: 20 }, // Mahalle
        { wch: 40 }, // Açık Adres
        { wch: 12 }, // Hane No
        { wch: 22 }, // Durum
        { wch: 14 }, // Hedef
        { wch: 18 }, // Teslim
        { wch: 14 }, // Kalan
        { wch: 18 }, // Tarih
        { wch: 22 }, // Teslim Alan
        { wch: 20 }, // Personel
      ];

      const worksheet = createOfficialWorksheet(
        'KÖMÜR YARDIMI TÜM HAK SAHİPLERİ VE DAĞITIM DURUM LİSTESİ',
        `Toplam Kayıt: ${records.length} Hane`,
        exportData,
        colWidths
      );

      XLSX.utils.book_append_sheet(workbook, worksheet, 'Hak Sahipleri');
      const buf = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });

      return new NextResponse(buf, {
        headers: {
          'Content-Disposition': 'attachment; filename="Edirne_SYDV_Komur_Hak_Sahipleri_Listesi.xlsx"',
          'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        },
      });
    }

    // 4. Excel Yükleme Hata & Mükerrer Kayıt Raporu
    if (type === 'errors') {
      const batchId = (searchParams.get('batchId') || '').trim();
      const filter: any = {};
      if (batchId && batchId !== 'ALL') {
        filter.batch_id = batchId;
      }

      const rawRecords = await logsCol
        .find(filter)
        .sort({ satir_no: 1, _id: -1 })
        .toArray();

      const records = mapDocs(rawRecords);

      const exportData = records.map((r: any, idx: number) => ({
        'Sıra': idx + 1,
        'Excel Satır No': r.satir_no ? `Satır #${r.satir_no}` : '-',
        'Hata / Elenme Nedeni': r.hata_nedeni,
        'Kayıt Durumu': r.durum === 'MUKERRER_TC' ? 'Mükerrer TC' : (r.durum === 'MUKERRER_HANE' ? 'Mükerrer Hane/Adres' : 'Hatalı / Eksik'),
        'İşlem Sonucu': r.islem_sonucu || (r.durum === 'HATALI' && r.hata_nedeni?.includes('Kayıt Sisteme Eklendi') ? 'Eklendi (Uyarılı)' : 'EKLENMEDİ (ELENDİ)'),
        'Mevcut Kömür Teslim Durumu': r.teslimat_durumu_ozeti || (r.teslimat_durumu ? `${r.teslimat_durumu} (${r.torba_sayisi || 0} Torba)` : 'BEKLİYOR'),
        'TC Kimlik No': r.tc_no || '-',
        'Adı Soyadı': r.ad_soyad || '-',
        'Telefon': r.telefon || '-',
        'Mahalle': r.mahalle || '-',
        'Açık Adres': r.acik_adres || '-',
        'Hane No': r.hane_no || '-',
        'Tarih': r.tarih || '-',
      }));

      const colWidths = [
        { wch: 6 },  // Sıra
        { wch: 15 }, // Excel Satır No
        { wch: 55 }, // Hata Nedeni
        { wch: 20 }, // Durum
        { wch: 22 }, // İşlem Sonucu
        { wch: 35 }, // Teslim Durumu
        { wch: 16 }, // TC
        { wch: 24 }, // Ad Soyad
        { wch: 16 }, // Telefon
        { wch: 20 }, // Mahalle
        { wch: 35 }, // Açık Adres
        { wch: 12 }, // Hane No
        { wch: 18 }, // Tarih
      ];

      const reportTitle = batchId 
        ? `KÖMÜR YARDIMI YÜKLEME VE HANE DENETİMİ HATA RAPORU (${batchId})`
        : 'KÖMÜR YARDIMI YÜKLEME VE HANE DENETİMİ HATA RAPORU';
      const reportSub = `Mükerrer TC, Aynı Hane ve Hatalı/Elenen Kayıt Dökümü (${records.length} Kayıt)`;

      const worksheet = createOfficialWorksheet(
        reportTitle,
        reportSub,
        exportData,
        colWidths
      );

      XLSX.utils.book_append_sheet(workbook, worksheet, 'Yukleme Hatalari');
      const buf = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });
      const filename = batchId 
        ? `Edirne_SYDV_Elenen_Kayitlar_${batchId}.xlsx`
        : 'Edirne_SYDV_Komur_Yukleme_Hatalari_Raporu.xlsx';

      return new NextResponse(buf, {
        headers: {
          'Content-Disposition': `attachment; filename="${filename}"`,
          'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        },
      });
    }

    // 5. Sistem Yöneticisi Kullanıcı İşlem & Denetim Logları Raporu
    if (type === 'activity_logs') {
      const rawRecords = await actCol
        .find({})
        .sort({ _id: -1 })
        .toArray();

      const records = mapDocs(rawRecords);

      const exportData = records.map((r: any, idx: number) => ({
        'Sıra': idx + 1,
        'Tarih & Saat': r.tarih || '-',
        'Kullanıcı / Personel': r.kullanici_adi || '-',
        'Rol': r.kullanici_rolu || '-',
        'İşlem Türü': r.islem_tipi || '-',
        'Başlık': r.baslik || '-',
        'Detay Açıklama': r.detay || '-',
        'Hak Sahibi': r.hedef_kisi || '-',
        'TC Kimlik No': r.hedef_tc || '-',
        'Mahalle': r.mahalle || '-',
        'Torba Sayısı': r.torba_sayisi !== undefined && r.torba_sayisi !== null ? r.torba_sayisi : '-',
      }));

      const colWidths = [
        { wch: 6 },  // Sıra
        { wch: 20 }, // Tarih
        { wch: 22 }, // Personel
        { wch: 12 }, // Rol
        { wch: 18 }, // İşlem
        { wch: 30 }, // Başlık
        { wch: 55 }, // Detay
        { wch: 22 }, // Hak Sahibi
        { wch: 16 }, // TC
        { wch: 18 }, // Mahalle
        { wch: 14 }, // Torba
      ];

      const worksheet = createOfficialWorksheet(
        'KULLANICI VE SAHA İŞLEM DENETİM LOGLARI RAPORU',
        `Edirne SYDV Kömür Dağıtım Sistemi İşlem Geçmişi (${records.length} İşlem)`,
        exportData,
        colWidths
      );

      XLSX.utils.book_append_sheet(workbook, worksheet, 'Islem Loglari');
      const buf = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });

      return new NextResponse(buf, {
        headers: {
          'Content-Disposition': 'attachment; filename="Edirne_SYDV_Kullanici_Islem_Loglari_Raporu.xlsx"',
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
