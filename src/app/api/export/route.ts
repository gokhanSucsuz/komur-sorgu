import { NextRequest, NextResponse } from 'next/server';
import ExcelJS from 'exceljs';
import { getDbCollections, mapDocs } from '@/lib/mongodb';
import { extractPhoneNumbers, compareBySiraNo, normalizeMahalleName } from '@/lib/normalizer';

/**
 * Sanitizes worksheet name to comply with strict Excel rules:
 * - Max 31 characters
 * - Cannot contain \ / ? * [ ] :
 * - Must be unique within the workbook
 */
function sanitizeSheetName(name: string, seenNames: Set<string>): string {
  let clean = name.replace(/[\\/?*\[\]:]/g, ' ').replace(/\s+/g, ' ').trim();
  if (!clean) clean = 'Mahalle';
  if (clean.length > 31) {
    clean = clean.substring(0, 31).trim();
  }
  let uniqueName = clean;
  let counter = 1;
  while (seenNames.has(uniqueName.toLocaleLowerCase('tr-TR'))) {
    const suffix = ` (${counter})`;
    const maxBaseLen = 31 - suffix.length;
    uniqueName = clean.substring(0, maxBaseLen).trim() + suffix;
    counter++;
  }
  seenNames.add(uniqueName.toLocaleLowerCase('tr-TR'));
  return uniqueName;
}

/**
 * Generates an RFC 6266 / RFC 5987 compliant Content-Disposition header.
 * Encodes Unicode/Turkish characters safely using filename*=UTF-8'' while
 * providing a transliterated ASCII fallback to avoid Node.js ByteString (char > 255)
 * crashes that cause "Siteye ulaşılamadı" errors in browsers.
 */
function buildContentDispositionHeader(filename: string): string {
  const asciiFallback = filename
    .replace(/[çÇ]/g, 'c')
    .replace(/[ğĞ]/g, 'g')
    .replace(/[ıİiîÎ]/g, 'i')
    .replace(/[öÖ]/g, 'o')
    .replace(/[şŞ]/g, 's')
    .replace(/[üÜûÛ]/g, 'u')
    .replace(/[^a-zA-Z0-9._ -]/g, '_');

  const utf8Encoded = encodeURIComponent(filename)
    .replace(/['()]/g, escape)
    .replace(/\*/g, '%2A');

  return `attachment; filename="${asciiFallback}"; filename*=UTF-8''${utf8Encoded}`;
}

/**
 * Creates an official state foundation standard worksheet with:
 * - Institutional state header with merged banner
 * - Sleek dark navy table header with crisp white bold text
 * - Zebra striped data rows (alternating #FFFFFF and #F8FAFC)
 * - Subtle borders on all cells
 * - Contextual status font coloring (Emerald green for delivered, Amber for partial, Rose for eliminated)
 * - Auto-tailored column widths and frozen header panes
 */
function addStyledWorksheet(
  workbook: ExcelJS.Workbook,
  title: string,
  subtitle: string,
  sheetName: string,
  data: any[],
  colWidths?: { wch?: number; width?: number }[]
) {
  const numCols = colWidths ? colWidths.length : (data[0] ? Object.keys(data[0]).length : 10);
  const nowStr = new Date().toLocaleString('tr-TR');

  const sheet = workbook.addWorksheet(sheetName, {
    views: [{ state: 'frozen', ySplit: 6, showGridLines: true }],
    pageSetup: { paperSize: 9, orientation: 'landscape', fitToWidth: 1 }
  });

  // 1. Kurumsal Resmi Başlık Satırları (1 - 4)
  sheet.addRow(['T.C. EDİRNE VALİLİĞİ']);
  sheet.addRow(['EDİRNE SOSYAL YARDIMLAŞMA VE DAYANIŞMA VAKFI BAŞKANLIĞI']);
  sheet.addRow([title.toUpperCase()]);
  sheet.addRow([`Rapor Kapsamı: ${subtitle} | Düzenleme Tarihi: ${nowStr} | Resmi Kömür Dağıtım Sistemi`]);
  sheet.addRow([]); // 5. Satır: Boşluk ayırıcı

  for (let r = 1; r <= 4; r++) {
    sheet.mergeCells(r, 1, r, numCols);
    const row = sheet.getRow(r);
    row.alignment = { vertical: 'middle', horizontal: 'center' };
    if (r === 1) {
      row.font = { name: 'Segoe UI', size: 10, bold: true, color: { argb: 'FF475569' } };
      row.height = 18;
    } else if (r === 2) {
      row.font = { name: 'Segoe UI', size: 12, bold: true, color: { argb: 'FF0F172A' } };
      row.height = 22;
    } else if (r === 3) {
      row.font = { name: 'Segoe UI', size: 13, bold: true, color: { argb: 'FF1E3A8A' } };
      row.height = 26;
      row.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FFF1F5F9' }
      };
    } else if (r === 4) {
      row.font = { name: 'Segoe UI', size: 9, italic: true, color: { argb: 'FF64748B' } };
      row.height = 18;
    }
  }
  sheet.getRow(5).height = 8;

  if (!data || data.length === 0) return sheet;

  // 2. Tablo Başlıkları (Row 6)
  const headers = Object.keys(data[0]);
  const headerRow = sheet.addRow(headers);
  headerRow.height = 28;
  headerRow.eachCell((cell) => {
    cell.font = { name: 'Segoe UI', size: 10, bold: true, color: { argb: 'FFFFFFFF' } };
    cell.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FF1E293B' } // Koyu Kurumsal Lacivert/Arduvaz
    };
    cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
    cell.border = {
      top: { style: 'medium', color: { argb: 'FF0F172A' } },
      bottom: { style: 'medium', color: { argb: 'FF0F172A' } },
      left: { style: 'thin', color: { argb: 'FF334155' } },
      right: { style: 'thin', color: { argb: 'FF334155' } },
    };
  });

  // 3. Veri Satırları & Zebra Deseni (Rows 7+)
  data.forEach((item, idx) => {
    const isSummaryRow = (item['TC Kimlik No'] && String(item['TC Kimlik No']).startsWith('TOPLAM:')) ||
                         (item['Sıra'] === '' && item['Teslim Tarihi / Saati'] === 'TOPLAM:');

    const rowValues = headers.map(h => item[h] !== undefined && item[h] !== null ? item[h] : '');
    const row = sheet.addRow(rowValues);
    row.height = isSummaryRow ? 26 : 22;

    const isEven = idx % 2 === 1;
    const rowBg = isSummaryRow ? 'FFF1F5F9' : (isEven ? 'FFF8FAFC' : 'FFFFFFFF');

    row.eachCell({ includeEmpty: true }, (cell, colNumber) => {
      const headerName = headers[colNumber - 1];
      const valStr = String(cell.value || '');

      cell.font = {
        name: 'Segoe UI',
        size: isSummaryRow ? 10.5 : 10,
        bold: isSummaryRow || headerName === 'Adı Soyadı',
        color: { argb: isSummaryRow ? 'FF0F172A' : 'FF1E293B' }
      };

      cell.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: rowBg }
      };

      if (isSummaryRow) {
        cell.border = {
          top: { style: 'medium', color: { argb: 'FF94A3B8' } },
          bottom: { style: 'double', color: { argb: 'FF0F172A' } },
          left: { style: 'thin', color: { argb: 'FFE2E8F0' } },
          right: { style: 'thin', color: { argb: 'FFE2E8F0' } },
        };
      } else {
        cell.border = {
          top: { style: 'thin', color: { argb: 'FFE2E8F0' } },
          bottom: { style: 'thin', color: { argb: 'FFE2E8F0' } },
          left: { style: 'thin', color: { argb: 'FFE2E8F0' } },
          right: { style: 'thin', color: { argb: 'FFE2E8F0' } },
        };
      }

      // Sola yaslı geniş metin alanları
      const leftAligned = [
        'Adı Soyadı', 'Açık Adres', 'Cadde / Sokak', 'Mahalle',
        'Açıklama / Not', 'Detay Açıklama', 'Hata / Elenme Nedeni', 'Başlık'
      ];
      if (leftAligned.includes(headerName)) {
        cell.alignment = { vertical: 'middle', horizontal: 'left' };
      } else {
        cell.alignment = { vertical: 'middle', horizontal: 'center' };
      }

      // Durum Vurguları (Renkler)
      if (headerName === 'Teslimat Durumu' || headerName === 'Durum') {
        if (valStr.includes('Teslim Edildi') || valStr.includes('Tamamlandı')) {
          cell.font = { name: 'Segoe UI', size: 9.5, bold: true, color: { argb: 'FF047857' } };
        } else if (valStr.includes('Eksik')) {
          cell.font = { name: 'Segoe UI', size: 9.5, bold: true, color: { argb: 'FFB45309' } };
        } else if (valStr.includes('Bekliyor')) {
          cell.font = { name: 'Segoe UI', size: 9.5, color: { argb: 'FF475569' } };
        }
      }

      if (headerName === 'İşlem Sonucu' && valStr.includes('ELENDİ')) {
        cell.font = { name: 'Segoe UI', size: 9.5, bold: true, color: { argb: 'FFBE123C' } };
      }
    });
  });

  // 4. Kolon Genişlikleri
  if (colWidths && colWidths.length > 0) {
    sheet.columns = colWidths.map(cw => ({
      width: Math.max(8, (cw.wch || cw.width || 12) + 3)
    }));
  }

  return sheet;
}

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const type = searchParams.get('type') || 'template';

    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'Edirne Sosyal Yardımlaşma ve Dayanışma Vakfı Başkanlığı';
    workbook.created = new Date();

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

      addStyledWorksheet(
        workbook,
        'KÖMÜR YARDIMI HAK SAHİBİ LİSTESİ YÜKLEME ŞABLONU',
        'Toplu Excel Yükleme Formatı (TC, Ad Soyad, Telefon, Mahalle, Açık Adres, Hane No)',
        'Hak Sahipleri',
        templateData,
        colWidths
      );

      const buf = await workbook.xlsx.writeBuffer();

      return new NextResponse(new Uint8Array(buf), {
        headers: {
          'Content-Disposition': buildContentDispositionHeader('Edirne_SYDV_Komur_Yukleme_Sablonu.xlsx'),
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

      addStyledWorksheet(
        workbook,
        'KÖMÜR YARDIMI GÜNLÜK DAĞITIM VE TESLİMAT TUTANAĞI',
        `Dağıtım Tarihi: ${targetDate} | Toplam Hane: ${records.length} | Toplam Torba: ${totalBags} (${(totalBags * 0.025).toFixed(2)} Ton)`,
        'Teslimat Listesi',
        exportData,
        colWidths
      );

      const buf = await workbook.xlsx.writeBuffer();

      return new NextResponse(new Uint8Array(buf), {
        headers: {
          'Content-Disposition': buildContentDispositionHeader(`Edirne_SYDV_Gunluk_Komur_Teslimat_Listesi_${targetDate}.xlsx`),
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

      addStyledWorksheet(
        workbook,
        'KÖMÜR YARDIMI TÜM HAK SAHİPLERİ VE DAĞITIM DURUM LİSTESİ',
        `Toplam Kayıt: ${records.length} Hane`,
        'Hak Sahipleri',
        exportData,
        colWidths
      );

      const buf = await workbook.xlsx.writeBuffer();

      return new NextResponse(new Uint8Array(buf), {
        headers: {
          'Content-Disposition': buildContentDispositionHeader('Edirne_SYDV_Komur_Hak_Sahipleri_Listesi.xlsx'),
          'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        },
      });
    }


    // 3.5. Yüklenen Excel Dosyası / Hak Sahipleri - Mahalle İsimlerine Göre Sekmelere Bölünmüş Çalışma Kitabı
    if (type === 'batch_by_mahalle' || type === 'beneficiaries_by_mahalle') {
      const batchId = (searchParams.get('batchId') || '').trim();
      const { importBatches: batchesCol } = await getDbCollections();

      let batchDoc: any = null;
      let filter: any = {};

      if (batchId && batchId !== 'ALL') {
        filter = {
          $or: [
            { batch_id: batchId },
            { batch_id: String(batchId) },
            { id: batchId },
          ],
        };
        batchDoc = await batchesCol.findOne({
          $or: [
            { batch_id: batchId },
            { id: batchId },
          ],
        });
      }

      const rawRecords = await benCol.find(filter).toArray();
      const records = mapDocs(rawRecords);

      const dosyaAdi = batchDoc?.dosya_adi || (batchId && batchId !== 'ALL' ? `Dosya_${batchId}` : 'Tum_Hak_Sahipleri');
      const cleanFileBase = dosyaAdi.replace(/\.[^/.]+$/, '').replace(/[^a-zA-Z0-9ÇŞĞÜÖİçşğüöı_-]/g, '_');

      // Group records by Mahalle
      const mahalleGroups = new Map<string, any[]>();
      for (const r of records) {
        const m = normalizeMahalleName(r.mahalle || 'Merkez Mah.');
        if (!mahalleGroups.has(m)) {
          mahalleGroups.set(m, []);
        }
        mahalleGroups.get(m)!.push(r);
      }

      // Sort mahalle names alphabetically
      const sortedMahalles = Array.from(mahalleGroups.keys()).sort((a, b) =>
        a.localeCompare(b, 'tr', { sensitivity: 'base' })
      );

      const seenSheetNames = new Set<string>();

      // A) 1. SEKME: GENEL DAĞITIM VE ÖZET İCMAL CETVELİ
      let totalAllHanes = 0;
      let totalAllTargetBags = 0;
      let totalAllDeliveredBags = 0;
      let totalAllPendingBags = 0;
      let totalAllTamamlanan = 0;
      let totalAllEksik = 0;
      let totalAllBekleyen = 0;
      let totalAllImzali = 0;

      const summaryData = sortedMahalles.map((mahName, idx) => {
        const group = mahalleGroups.get(mahName)!;
        const haneCount = group.length;

        let mahTarget = 0;
        let mahDelivered = 0;
        let mahTamamlanan = 0;
        let mahEksik = 0;
        let mahBekleyen = 0;
        let mahImzali = 0;

        for (const item of group) {
          const target = Number(item.hedef_torba || 34);
          const delivered = Number(item.torba_sayisi || 0);
          mahTarget += target;
          mahDelivered += delivered;

          if (item.imza_durumu === 'IMZALANDI') {
            mahImzali++;
          }

          if (item.teslimat_durumu === 'TAMAMLANDI' || item.teslimat_durumu === 'TESLIM_EDILDI') {
            mahTamamlanan++;
          } else if (item.teslimat_durumu === 'EKSIK') {
            mahEksik++;
          } else {
            mahBekleyen++;
          }
        }

        const mahPending = Math.max(0, mahTarget - mahDelivered);
        const completionRate = mahTarget > 0 ? Math.round((mahDelivered / mahTarget) * 100) : 0;
        const tip = /(?:Köyü|Koy|Koyu)$/i.test(mahName) ? 'KÖY' : 'MAHALLE';

        totalAllHanes += haneCount;
        totalAllTargetBags += mahTarget;
        totalAllDeliveredBags += mahDelivered;
        totalAllPendingBags += mahPending;
        totalAllTamamlanan += mahTamamlanan;
        totalAllEksik += mahEksik;
        totalAllBekleyen += mahBekleyen;
        totalAllImzali += mahImzali;

        return {
          'Sıra': idx + 1,
          'Mahalle / Köy Adı': mahName,
          'Yerleşim Tipi': tip,
          'Toplam Hane': haneCount,
          'Hedef Kömür (Torba)': mahTarget,
          'Hedef Kömür (Ton)': `${(mahTarget * 0.025).toFixed(2)} Ton`,
          'Dağıtılan (Torba)': mahDelivered,
          'Dağıtılan (Ton)': `${(mahDelivered * 0.025).toFixed(2)} Ton`,
          'Kalan Kömür (Torba)': mahPending,
          'Tamamlanan Hane': mahTamamlanan,
          'Eksik Hane': mahEksik,
          'Bekleyen Hane': mahBekleyen,
          'İmzalı Hane': mahImzali,
          'Tamamlanma Oranı': `%${completionRate}`,
        };
      });

      if (summaryData.length > 0) {
        const grandRate = totalAllTargetBags > 0 ? Math.round((totalAllDeliveredBags / totalAllTargetBags) * 100) : 0;
        summaryData.push({
          'Sıra': '' as any,
          'Mahalle / Köy Adı': 'GENEL TOPLAM:',
          'Yerleşim Tipi': `${sortedMahalles.length} Yerleşim`,
          'Toplam Hane': totalAllHanes,
          'Hedef Kömür (Torba)': totalAllTargetBags,
          'Hedef Kömür (Ton)': `${(totalAllTargetBags * 0.025).toFixed(2)} Ton`,
          'Dağıtılan (Torba)': totalAllDeliveredBags,
          'Dağıtılan (Ton)': `${(totalAllDeliveredBags * 0.025).toFixed(2)} Ton`,
          'Kalan Kömür (Torba)': totalAllPendingBags,
          'Tamamlanan Hane': totalAllTamamlanan,
          'Eksik Hane': totalAllEksik,
          'Bekleyen Hane': totalAllBekleyen,
          'İmzalı Hane': totalAllImzali,
          'Tamamlanma Oranı': `%${grandRate}`,
        });
      }

      const summaryColWidths = [
        { wch: 6 },  // Sıra
        { wch: 24 }, // Mahalle Adı
        { wch: 14 }, // Tip
        { wch: 14 }, // Hane
        { wch: 20 }, // Hedef Torba
        { wch: 18 }, // Hedef Ton
        { wch: 18 }, // Dağıtılan Torba
        { wch: 16 }, // Dağıtılan Ton
        { wch: 20 }, // Kalan Torba
        { wch: 16 }, // Tamamlanan
        { wch: 14 }, // Eksik
        { wch: 14 }, // Bekleyen
        { wch: 14 }, // İmzalı
        { wch: 18 }, // Oran
      ];

      const summarySheetName = sanitizeSheetName('Özet İcmal', seenSheetNames);
      addStyledWorksheet(
        workbook,
        'KÖMÜR YARDIMI MAHALLE BAZLI GENEL DAĞITIM VE İCMAL CETVELİ',
        `Dosya: ${dosyaAdi} | Toplam Yerleşim: ${sortedMahalles.length} | Toplam Hane: ${totalAllHanes} | Toplam Hedef: ${totalAllTargetBags} Torba (${(totalAllTargetBags * 0.025).toFixed(2)} Ton)`,
        summarySheetName,
        summaryData,
        summaryColWidths
      );

      // B) HER MAHALLE İÇİN AYRI SEKME
      for (const mahName of sortedMahalles) {
        const group = mahalleGroups.get(mahName)!;
        // Sort within neighborhood naturally by order number
        group.sort(compareBySiraNo);

        let groupTarget = 0;
        let groupDelivered = 0;
        let groupTamamlanan = 0;
        let groupEksik = 0;
        let groupBekleyen = 0;
        let groupImzali = 0;

        const sheetRows = group.map((r: any, idx: number) => {
          const phones = extractPhoneNumbers(r.telefon, r.telefon2);
          const target = Number(r.hedef_torba || 34);
          const delivered = Number(r.torba_sayisi || 0);
          const remaining = Math.max(0, target - delivered);

          groupTarget += target;
          groupDelivered += delivered;

          if (r.imza_durumu === 'IMZALANDI') groupImzali++;
          if (r.teslimat_durumu === 'TAMAMLANDI' || r.teslimat_durumu === 'TESLIM_EDILDI') {
            groupTamamlanan++;
          } else if (r.teslimat_durumu === 'EKSIK') {
            groupEksik++;
          } else {
            groupBekleyen++;
          }

          const kapiStr = r.kapi_no && r.kapi_no !== 999999 ? String(r.kapi_no) : '-';
          const daireStr = r.daire_no && r.daire_no > 0 ? String(r.daire_no) : '-';

          return {
            'Sıra': idx + 1,
            'İmza Sırası': r.sira_no || r.mahalle_sira || idx + 1,
            'Liste Türü': r.ek_liste_adi || (r.ek_liste_no ? `Ek ${r.ek_liste_no}` : 'Ana Liste'),
            'TC Kimlik No': r.tc_no,
            'Adı Soyadı': r.ad_soyad,
            'Telefon': phones[0] || r.telefon || '-',
            'Telefon 2': phones[1] || r.telefon2 || '-',
            'Cadde / Sokak': r.sokak || '-',
            'Kapı No': kapiStr,
            'Daire No': daireStr,
            'Açık Adres': r.acik_adres || '-',
            'Hane No': r.hane_no || '-',
            'Hedef Torba': target,
            'Teslim Edilen': delivered,
            'Kalan Torba': remaining,
            'Teslimat Durumu': r.teslimat_durumu === 'TAMAMLANDI' || r.teslimat_durumu === 'TESLIM_EDILDI'
              ? 'Teslim Edildi'
              : r.teslimat_durumu === 'EKSIK'
              ? `Eksik Teslimat (${delivered}/${target})`
              : 'Bekliyor',
            'İmza Durumu': r.imza_durumu === 'IMZALANDI' ? 'İmzalandı' : 'Bekliyor',
            'Teslim Alan': r.teslim_alan || '-',
            'Teslim Tarihi': r.teslimat_tarihi || '-',
            'Teslim Eden Personel': r.teslim_eden_personel || '-',
            'Hak Sahibi İmzası': '', // Boş imza kutusu
          };
        });

        // Add Mahalle summary footer row
        if (sheetRows.length > 0) {
          const groupPending = Math.max(0, groupTarget - groupDelivered);
          sheetRows.push({
            'Sıra': '' as any,
            'İmza Sırası': '',
            'Liste Türü': '',
            'TC Kimlik No': `TOPLAM: ${group.length} Hane`,
            'Adı Soyadı': '',
            'Telefon': '',
            'Telefon 2': '',
            'Cadde / Sokak': '',
            'Kapı No': '',
            'Daire No': '',
            'Açık Adres': '',
            'Hane No': '',
            'Hedef Torba': groupTarget as any,
            'Teslim Edilen': groupDelivered as any,
            'Kalan Torba': groupPending as any,
            'Teslimat Durumu': `${groupTamamlanan} Teslim, ${groupBekleyen} Bekleyen`,
            'İmza Durumu': `${groupImzali} İmzalı`,
            'Teslim Alan': '',
            'Teslim Tarihi': '',
            'Teslim Eden Personel': '',
            'Hak Sahibi İmzası': '',
          });
        }

        const mahColWidths = [
          { wch: 6 },  // Sıra
          { wch: 14 }, // İmza Sırası
          { wch: 13 }, // Liste Türü
          { wch: 16 }, // TC
          { wch: 24 }, // Adı Soyadı
          { wch: 16 }, // Tel
          { wch: 16 }, // Tel 2
          { wch: 22 }, // Cadde/Sokak
          { wch: 10 }, // Kapı
          { wch: 10 }, // Daire
          { wch: 40 }, // Adres
          { wch: 12 }, // Hane
          { wch: 13 }, // Hedef
          { wch: 14 }, // Teslim
          { wch: 13 }, // Kalan
          { wch: 20 }, // Durum
          { wch: 13 }, // İmza Durum
          { wch: 22 }, // Teslim Alan
          { wch: 18 }, // Teslim Tarih
          { wch: 20 }, // Personel
          { wch: 20 }, // İmza
        ];

        const safeSheetName = sanitizeSheetName(mahName, seenSheetNames);
        addStyledWorksheet(
          workbook,
          `KÖMÜR YARDIMI DAĞITIM VE İMZA ÇİZELGESİ - ${mahName.toUpperCase()}`,
          `Dosya: ${dosyaAdi} | Mahalle/Köy: ${mahName} | Hane: ${group.length} | Hedef: ${groupTarget} Torba (${(groupTarget * 0.025).toFixed(2)} Ton)`,
          safeSheetName,
          sheetRows,
          mahColWidths
        );
      }

      const buf = await workbook.xlsx.writeBuffer();
      const downloadFilename = `Edirne_SYDV_${cleanFileBase}_Mahalle_Sekmeli.xlsx`;

      return new NextResponse(new Uint8Array(buf), {
        headers: {
          'Content-Disposition': buildContentDispositionHeader(downloadFilename),
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

      addStyledWorksheet(
        workbook,
        reportTitle,
        reportSub,
        'Yukleme Hatalari',
        exportData,
        colWidths
      );

      const buf = await workbook.xlsx.writeBuffer();
      const filename = batchId 
        ? `Edirne_SYDV_Elenen_Kayitlar_${batchId}.xlsx`
        : 'Edirne_SYDV_Komur_Yukleme_Hatalari_Raporu.xlsx';

      return new NextResponse(new Uint8Array(buf), {
        headers: {
          'Content-Disposition': buildContentDispositionHeader(filename),
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

      addStyledWorksheet(
        workbook,
        'KULLANICI VE SAHA İŞLEM DENETİM LOGLARI RAPORU',
        `Edirne SYDV Kömür Dağıtım Sistemi İşlem Geçmişi (${records.length} İşlem)`,
        'Islem Loglari',
        exportData,
        colWidths
      );

      const buf = await workbook.xlsx.writeBuffer();

      return new NextResponse(new Uint8Array(buf), {
        headers: {
          'Content-Disposition': buildContentDispositionHeader('Edirne_SYDV_Kullanici_Islem_Loglari_Raporu.xlsx'),
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
