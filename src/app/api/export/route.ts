import { NextRequest, NextResponse } from 'next/server';
import ExcelJS from 'exceljs';
import { getDbCollections, mapDocs, recordActivityLog } from '@/lib/mongodb';
import { extractPhoneNumbers, compareBySiraNo, normalizeMahalleName, normalizeToTon, formatTonnage, normalizeStaffName, formatTwoWayTonnage, formatTwoWayDiff } from '@/lib/normalizer';
import { formatTrDateWithDay } from '@/lib/dateUtils';
import { verifySession } from '@/lib/auth';
import { serverError, asString, getClientIp, checkRateLimit, rateLimitExceededResponse } from '@/lib/security';

/**
 * Neutralizes Excel formula injection (CSV/XLSX DDE attacks).
 * If a string begins with =, +, -, @, Tab, or CR, it is prefixed with a single quote.
 */
function sanitizeCellValue(v: any): any {
  if (typeof v === 'string' && /^[=+\-@\t\r]/.test(v)) {
    return `'${v}`;
  }
  return v;
}

/**
 * Builds standard secure Excel HTTP response with strict cache control and nosniff.
 */
async function buildExcelResponse(
  buf: ExcelJS.Buffer,
  filename: string,
  session?: any,
  exportType?: string
): Promise<NextResponse> {
  if (session?.valid && exportType && exportType !== 'template') {
    try {
      await recordActivityLog({
        kullanici_adi: session.ad_soyad || session.username || 'Kullanıcı',
        kullanici_rolu: session.rol || 'PERSONEL',
        islem_tipi: 'EXCEL_EXPORT',
        baslik: 'Veri Dışa Aktarıldı',
        detay: `"${exportType}" türünde Excel dosyası (${filename}) dışa aktarıldı.`,
        ek_bilgi: { exportType, filename },
      });
    } catch (e) {
      console.error('Failed to log export activity:', e);
    }
  }

  return new NextResponse(new Uint8Array(buf), {
    headers: {
      'Content-Disposition': buildContentDispositionHeader(filename),
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Cache-Control': 'no-store, no-cache, must-revalidate',
      'Pragma': 'no-cache',
      'X-Content-Type-Options': 'nosniff',
    },
  });
}

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
                         (item['Sıra'] === '' && item['Teslim Tarihi / Saati'] === 'TOPLAM:') ||
                         (item['YÜKLEMEYİ YAPAN İŞLETME'] === 'TOPLAM TESLİM ALINAN MİKTAR') ||
                         (item['PLAKA NO'] === 'GENEL TOPLAM:');

    const rowValues = headers.map(h => {
      const raw = item[h] !== undefined && item[h] !== null ? item[h] : '';
      return sanitizeCellValue(raw);
    });
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

      // Sola ve sağa yaslı alanlar
      const leftAligned = [
        'Adı Soyadı', 'Açık Adres', 'Cadde / Sokak', 'Mahalle',
        'Açıklama / Not', 'Detay Açıklama', 'Hata / Elenme Nedeni', 'Başlık'
      ];
      const rightAligned = [
        'İŞLETMEDEN YÜKLENEN MİKTAR (kg)',
        'İŞLETMEDEN YÜKLENEN MİKTAR (kg / Ton)',
        'TESLİM ALINAN MİKTAR(kg)',
        'TESLİM ALINAN MİKTAR(kg / Ton)',
        'FARK (İşl.Yüklenen) ( Teslim Alınan) kg.',
        'SEVK MİKTAR (KG)',
        'SEVK MİKTAR (KG / TON)',
        'TESLİM MİKTARI(KG)',
        'TESLİM MİKTARI(KG / TON)',
      ];
      if (leftAligned.includes(headerName)) {
        cell.alignment = { vertical: 'middle', horizontal: 'left' };
      } else if (rightAligned.includes(headerName)) {
        cell.alignment = { vertical: 'middle', horizontal: 'right' };
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

/**
 * Adres metninin uzunluğuna ve satır sayısına göre satır yüksekliğini hesaplar.
 * Standart ıslak imza yüksekliği 45pt'dir; adres standardın üzerinde ise yüksekliği artırır.
 */
function calculateAddressRowHeight(address: string, standardHeight = 45): number {
  if (!address) return standardHeight;
  const text = String(address).trim();
  if (!text) return standardHeight;

  // A4 yatay tabloda Adres kolon genişliği ~34 karakterdir.
  // Kelime kaydırmalarıyla satır başına ortalama 28-30 karakter düşer.
  const charsPerLine = 28;
  const paragraphs = text.split(/\r?\n/);
  let totalLines = 0;

  for (const para of paragraphs) {
    const trimmed = para.trim();
    if (!trimmed) {
      totalLines += 1;
      continue;
    }

    const words = trimmed.split(/\s+/);
    let currentLineLen = 0;
    let linesInPara = 1;

    for (const w of words) {
      if (w.length > charsPerLine) {
        if (currentLineLen > 0) {
          linesInPara += 1;
          currentLineLen = 0;
        }
        linesInPara += Math.ceil(w.length / charsPerLine) - 1;
        currentLineLen = w.length % charsPerLine || charsPerLine;
      } else if (currentLineLen === 0) {
        currentLineLen = w.length;
      } else if (currentLineLen + 1 + w.length <= charsPerLine) {
        currentLineLen += 1 + w.length;
      } else {
        linesInPara += 1;
        currentLineLen = w.length;
      }
    }
    totalLines += linesInPara;
  }

  // Segoe UI 10pt font: satır başına ~15pt + 8pt dikey padding
  const neededHeight = totalLines * 15 + 8;
  return Math.max(standardHeight, neededHeight);
}

/**
 * Resmi Islak İmza Listesi İçin Özel Mahalle Sekmesi Oluşturucu.
 * Kural Gereksinimleri:
 * - Adres A'dan Z'ye sıralı (localeCompare tr numeric)
 * - Kolonlar: Sıra No, Adı Soyadı, T.C. Kimlik No, Telefon, Adres, Teslim Edilen Kömür Miktarı, Teslim Eden Islak İmza, Teslim Tarihi, Teslim Alan Islak İmza
 * - İmza alanı tamamen boş ve ıslak imza atılacak yükseklikte (45pt)
 * - Her sayfa üstten/yandan hizalı ve kenar boşluksuz (0.35in A4 yatay)
 * - Her sayfada kurumsal başlıkların yinelenmesi (printTitlesRow: '1:2')
 */
function addOfficialSignatureSheet(
  workbook: ExcelJS.Workbook,
  mahName: string,
  listTitle: string,
  group: any[],
  seenSheetNames: Set<string>
) {
  // 1. ADRES A'DAN Z'YE SIRALAMA
  group.sort((a, b) =>
    (a.acik_adres || '').localeCompare((b.acik_adres || ''), 'tr', { sensitivity: 'base', numeric: true })
  );

  const safeSheetName = sanitizeSheetName(mahName, seenSheetNames);
  const sheet = workbook.addWorksheet(safeSheetName, {
    views: [{ state: 'frozen', ySplit: 2, showGridLines: true }],
    pageSetup: {
      paperSize: 9, // A4
      orientation: 'landscape',
      fitToWidth: 1,
      fitToHeight: 0,
      fitToPage: true,
      horizontalCentered: true,
      verticalCentered: false,
      margins: {
        left: 0.35,
        right: 0.35,
        top: 0.45,
        bottom: 0.45,
        header: 0.2,
        footer: 0.2,
      },
      printTitlesRow: '1:2',
    },
    headerFooter: {
      oddHeader: `&L&B&9 T.C. EDİRNE VALİLİĞİ - SYDV&R&B&9 RESMİ ISLAK İMZA LİSTESİ - ${mahName.toUpperCase()}`,
      oddFooter: '&L&8 T.C. Edirne SYDV Kömür Dağıtım Sistemi&C&8 Sayfa &P / &N&R&8 Tarih: &D',
    },
  });

  // 1. Mahalle Çizelge Başlığı (İlk sayfa [Özet İcmal] dışındaki tüm sayfalarda sadece bu başlık yer alır)
  const titleRow = sheet.addRow([`KÖMÜR YARDIMI HAK SAHİBİ TESLİM VE ISLAK İMZA ÇİZELGESİ - ${mahName.toUpperCase()}`]);
  sheet.mergeCells(1, 1, 1, 9);
  titleRow.height = 28;
  titleRow.alignment = { vertical: 'middle', horizontal: 'center' };
  titleRow.font = { name: 'Segoe UI', size: 12.5, bold: true, color: { argb: 'FFFFFFFF' } };
  titleRow.fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FF1E293B' },
  };

  // 2. Tablo Kolon Başlıkları (Row 2)
  const headers = [
    'Sıra No',
    'Adı Soyadı',
    'T.C. Kimlik No',
    'Telefon',
    "Adres (A'dan Z'ye Sıralı)",
    'Teslim Edilen Kömür Miktarı',
    'Teslim Eden Islak İmza',
    'Teslim Tarihi',
    'Teslim Alan Islak İmza',
  ];
  const headerRow = sheet.addRow(headers);
  headerRow.height = 28;
  headerRow.eachCell((cell, colNum) => {
    cell.font = { name: 'Segoe UI', size: 10.5, bold: true, color: { argb: 'FFFFFFFF' } };
    cell.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FF0F172A' },
    };
    cell.alignment = {
      vertical: 'middle',
      horizontal: colNum === 2 || colNum === 5 ? 'left' : 'center',
      wrapText: true,
    };
    cell.border = {
      top: { style: 'medium', color: { argb: 'FF000000' } },
      bottom: { style: 'medium', color: { argb: 'FF000000' } },
      left: { style: 'thin', color: { argb: 'FF475569' } },
      right: { style: 'thin', color: { argb: 'FF475569' } },
    };
  });

  // 3. Veri Satırları (Row 6+)
  let totalBags = 0;
  group.forEach((r: any, idx: number) => {
    const phones = extractPhoneNumbers(r.telefon, r.telefon2);
    const phoneStr = phones.length > 0
      ? phones.join('\n')
      : (r.telefon ? String(r.telefon).replace(/\s*[\/;|,]\s*/g, '\n') : '-');
    const target = Number(r.hedef_torba || 34);
    totalBags += target;

    const teslimTarihiStr = r.teslimat_tarihi
      ? formatTrDateWithDay(r.teslimat_tarihi) || r.teslimat_tarihi
      : '';

    const fullAddress = r.acik_adres || r.sokak || '-';

    const rowData = [
      idx + 1,
      r.ad_soyad || '-',
      r.tc_no || '-',
      phoneStr,
      fullAddress,
      '34 Torba (Takribi 850kg)',
      '', // Teslim Eden Islak İmza alanı kural gereği BOŞTUR
      teslimTarihiStr,
      '', // Teslim Alan Islak İmza alanı kural gereği BOŞTUR
    ];

    const dataRow = sheet.addRow(rowData);
    // Islak imza için ferah satır yüksekliği (45pt = ~16mm)
    const addressHeight = calculateAddressRowHeight(fullAddress, 45);
    const phoneLines = phoneStr.split('\n').length;
    const phoneHeight = phoneLines > 2 ? phoneLines * 15 + 8 : 45;
    dataRow.height = Math.max(45, addressHeight, phoneHeight);

    const isEven = idx % 2 === 1;
    const zebraBg = isEven ? 'FFF8FAFC' : 'FFFFFFFF';

    dataRow.eachCell({ includeEmpty: true }, (cell, colNumber) => {
      const isSignatureCol = colNumber === 7 || colNumber === 9;

      cell.font = {
        name: 'Segoe UI',
        size: colNumber === 2 ? 10.5 : 10,
        bold: colNumber === 2,
        color: { argb: 'FF0F172A' },
      };

      // İmza alanı her zaman temiz beyaz, diğer alanlar hafif zebra
      cell.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: isSignatureCol ? 'FFFFFFFF' : zebraBg },
      };

      // Belirgin imza çerçevesi
      cell.border = {
        top: { style: 'thin', color: { argb: 'FF94A3B8' } },
        bottom: { style: 'thin', color: { argb: 'FF94A3B8' } },
        left: { style: isSignatureCol ? 'medium' : 'thin', color: { argb: isSignatureCol ? 'FF475569' : 'FFE2E8F0' } },
        right: { style: isSignatureCol ? 'medium' : 'thin', color: { argb: isSignatureCol ? 'FF475569' : 'FFE2E8F0' } },
      };

      if (colNumber === 2) {
        cell.alignment = { vertical: 'middle', horizontal: 'left' };
      } else if (colNumber === 4) {
        cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
      } else if (colNumber === 5) {
        cell.alignment = { vertical: 'middle', horizontal: 'left', wrapText: true };

      } else if (colNumber === 6) {
        cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };

      } else {
        cell.alignment = { vertical: 'middle', horizontal: 'center' };
      }
    });
  });

  // 4. Mahalle Alt Toplam Satırı
  const summaryRow = sheet.addRow([
    '',
    `TOPLAM: ${group.length} HANE`,
    '',
    '',
    `Tahsis Kömür Miktarı: ${totalBags} Torba (${(totalBags * 0.025).toFixed(2)} Ton)`,
    '',
    '',
    '',
    '',
  ]);
  summaryRow.height = 26;
  summaryRow.eachCell({ includeEmpty: true }, (cell, colNumber) => {
    cell.font = { name: 'Segoe UI', size: 10, bold: true, color: { argb: 'FF0F172A' } };
    cell.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FFE2E8F0' },
    };
    cell.border = {
      top: { style: 'medium', color: { argb: 'FF475569' } },
      bottom: { style: 'medium', color: { argb: 'FF475569' } },
      left: { style: 'thin', color: { argb: 'FFCBD5E1' } },
      right: { style: 'thin', color: { argb: 'FFCBD5E1' } },
    };
    cell.alignment = { vertical: 'middle', horizontal: colNumber === 2 || colNumber === 5 ? 'left' : 'center' };
  });

  // Kolon Genişlikleri (A4 Yatay Sayfa Baskısına Tam Uyumlu)
  sheet.columns = [
    { width: 6.5 }, // Sıra No
    { width: 22 },   // Adı Soyadı
    { width: 14.5 }, // TC Kimlik No
    { width: 15 },   // Telefon
    { width: 34 },   // Açık Adres
    { width: 18 },   // Teslim Edilen Kömür Miktarı
    { width: 17 },   // Teslim Eden Islak İmza
    { width: 13.5 }, // Teslim Tarihi
    { width: 18 },   // Teslim Alan Islak İmza
  ];

  return sheet;
}

/**
 * Resmi Islak İmza Listesi İçin Genel Özet İcmal Sekmesi Oluşturucu.
 */
function addOfficialSignatureSummarySheet(
  workbook: ExcelJS.Workbook,
  listTitle: string,
  subtitle: string,
  sortedMahalles: string[],
  mahalleGroups: Map<string, any[]>,
  seenSheetNames: Set<string>
) {
  const safeSheetName = sanitizeSheetName('Özet İcmal', seenSheetNames);
  const sheet = workbook.addWorksheet(safeSheetName, {
    views: [{ state: 'frozen', ySplit: 5, showGridLines: true }],
    pageSetup: {
      paperSize: 9,
      orientation: 'landscape',
      fitToWidth: 1,
      fitToHeight: 0,
      fitToPage: true,
      horizontalCentered: true,
      margins: { left: 0.35, right: 0.35, top: 0.45, bottom: 0.45, header: 0.2, footer: 0.2 },
      printTitlesRow: '1:5',
    },
    headerFooter: {
      oddFooter: '&L&8 T.C. Edirne SYDV Kömür Dağıtım Sistemi&C&8 Sayfa &P / &N&R&8 Tarih: &D',
    },
  });

  const nowStr = new Date().toLocaleString('tr-TR');

  sheet.addRow(['T.C. EDİRNE VALİLİĞİ']);
  sheet.addRow(['EDİRNE SOSYAL YARDIMLAŞMA VE DAYANIŞMA VAKFI BAŞKANLIĞI']);
  sheet.addRow([listTitle.toUpperCase()]);
  sheet.addRow([`Rapor Kapsamı: ${subtitle} | Düzenleme Tarihi: ${nowStr} | Resmi Kömür Dağıtım Sistemi`]);

  for (let r = 1; r <= 4; r++) {
    sheet.mergeCells(r, 1, r, 6);
    const row = sheet.getRow(r);
    row.alignment = { vertical: 'middle', horizontal: 'center' };
    if (r === 1) {
      row.font = { name: 'Segoe UI', size: 10, bold: true, color: { argb: 'FF475569' } };
      row.height = 18;
    } else if (r === 2) {
      row.font = { name: 'Segoe UI', size: 12, bold: true, color: { argb: 'FF0F172A' } };
      row.height = 22;
    } else if (r === 3) {
      row.font = { name: 'Segoe UI', size: 13, bold: true, color: { argb: 'FFFFFFFF' } };
      row.height = 26;
      row.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E3A8A' } };
    } else if (r === 4) {
      row.font = { name: 'Segoe UI', size: 9, italic: true, color: { argb: 'FF475569' } };
      row.height = 18;
      row.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF1F5F9' } };
    }
  }

  const headers = ['Sıra', 'Mahalle / Köy Adı', 'Yerleşim Tipi', 'Hane Sayısı (İmza Çıkartılan)', 'Tahsis Kömür (Torba)', 'Tahsis Kömür (Ton)'];
  const headerRow = sheet.addRow(headers);
  headerRow.height = 28;
  headerRow.eachCell((cell, colNum) => {
    cell.font = { name: 'Segoe UI', size: 10.5, bold: true, color: { argb: 'FFFFFFFF' } };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0F172A' } };
    cell.alignment = { vertical: 'middle', horizontal: colNum === 2 ? 'left' : 'center' };
    cell.border = {
      top: { style: 'medium', color: { argb: 'FF000000' } },
      bottom: { style: 'medium', color: { argb: 'FF000000' } },
      left: { style: 'thin', color: { argb: 'FF475569' } },
      right: { style: 'thin', color: { argb: 'FF475569' } },
    };
  });

  let grandTotalHanes = 0;
  let grandTotalBags = 0;

  sortedMahalles.forEach((mName, idx) => {
    const group = mahalleGroups.get(mName) || [];
    let mBags = 0;
    for (const b of group) {
      mBags += Number(b.hedef_torba || 34);
    }
    grandTotalHanes += group.length;
    grandTotalBags += mBags;

    const tip = /(?:Köyü|Koy|Koyu)$/i.test(mName) ? 'KÖY' : 'MAHALLE';
    const row = sheet.addRow([
      idx + 1,
      mName,
      tip,
      group.length,
      mBags,
      `${(mBags * 0.025).toFixed(2)} Ton`,
    ]);
    row.height = 22;
    const isEven = idx % 2 === 1;
    row.eachCell({ includeEmpty: true }, (cell, colNumber) => {
      cell.font = { name: 'Segoe UI', size: 10, color: { argb: 'FF0F172A' }, bold: colNumber === 2 };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: isEven ? 'FFF8FAFC' : 'FFFFFFFF' } };
      cell.border = {
        top: { style: 'thin', color: { argb: 'FFE2E8F0' } },
        bottom: { style: 'thin', color: { argb: 'FFE2E8F0' } },
        left: { style: 'thin', color: { argb: 'FFE2E8F0' } },
        right: { style: 'thin', color: { argb: 'FFE2E8F0' } },
      };
      cell.alignment = { vertical: 'middle', horizontal: colNumber === 2 ? 'left' : 'center' };
    });
  });

  // Genel Toplam Satırı
  const grandRow = sheet.addRow([
    '',
    'GENEL TOPLAM:',
    `${sortedMahalles.length} Yerleşim`,
    grandTotalHanes,
    grandTotalBags,
    `${(grandTotalBags * 0.025).toFixed(2)} Ton`,
  ]);
  grandRow.height = 26;
  grandRow.eachCell({ includeEmpty: true }, (cell, colNumber) => {
    cell.font = { name: 'Segoe UI', size: 10.5, bold: true, color: { argb: 'FF0F172A' } };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF1F5F9' } };
    cell.border = {
      top: { style: 'medium', color: { argb: 'FF94A3B8' } },
      bottom: { style: 'double', color: { argb: 'FF0F172A' } },
      left: { style: 'thin', color: { argb: 'FFE2E8F0' } },
      right: { style: 'thin', color: { argb: 'FFE2E8F0' } },
    };
    cell.alignment = { vertical: 'middle', horizontal: colNumber === 2 ? 'left' : 'center' };
  });

  sheet.columns = [
    { width: 8 },  // Sıra
    { width: 28 }, // Mahalle Adı
    { width: 16 }, // Tip
    { width: 24 }, // Hane Sayısı
    { width: 22 }, // Kömür Torba
    { width: 20 }, // Kömür Ton
  ];

  sheet.addRow([]); // boşluk

  // Özet İcmal Resmi Yetkili İmzaları
  const summarySignRow = sheet.addRow([
    'Dağıtımı Yapan Vakıf Görevlisi veya Personeli\n(Ad Soyad / İmza)',
    '',
    '',
    'Vakıf Müdürü\n(Ad Soyad / İmza / Mühür)',
    '',
    '',
  ]);
  summarySignRow.height = 55;
  sheet.mergeCells(summarySignRow.number, 1, summarySignRow.number, 3);
  sheet.mergeCells(summarySignRow.number, 4, summarySignRow.number, 6);

  for (let col = 1; col <= 6; col++) {
    const c = summarySignRow.getCell(col);
    c.border = {
      top: { style: 'thin', color: { argb: 'FF94A3B8' } },
      bottom: { style: 'thin', color: { argb: 'FF94A3B8' } },
      left: col === 1 || col === 4 ? { style: 'thin', color: { argb: 'FF94A3B8' } } : undefined,
      right: col === 3 || col === 6 ? { style: 'thin', color: { argb: 'FF94A3B8' } } : undefined,
    };
  }

  [1, 4].forEach((col) => {
    const c = summarySignRow.getCell(col);
    c.font = { name: 'Segoe UI', size: 9.5, bold: true, color: { argb: 'FF0F172A' } };
    c.alignment = { vertical: 'top', horizontal: 'center', wrapText: true };
  });

  return sheet;
}

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const type = asString(searchParams.get('type'), 64) || 'template';

    const session = await verifySession(request);
    // Public download only allowed for empty template; all data exports require active session
    if (type !== 'template') {
      if (!session.valid) {
        return session.response || NextResponse.json({ success: false, error: 'Oturum gerekli' }, { status: 401 });
      }

      // Rate limit bulk exports: max 15 export requests per minute per user/IP
      const clientIp = getClientIp(request);
      const rateLimitKey = `export:${session.id || clientIp}`;
      const rateLimit = checkRateLimit(rateLimitKey, 15, 60);
      if (!rateLimit.allowed) {
        return rateLimitExceededResponse(rateLimit, 'Kısa süre içinde çok fazla Excel indirme isteği gönderildi. Lütfen bir süre bekleyiniz.');
      }

      // Restrict bulk PII and sensitive system exports to ADMIN
      const adminOnlyTypes = [
        'beneficiaries',
        'batch_by_mahalle',
        'beneficiaries_by_mahalle',
        'signature_list',
        'errors',
        'season_archive',
        'activity_logs',
      ];
      if (adminOnlyTypes.includes(type) && session.rol !== 'ADMIN') {
        return NextResponse.json({
          success: false,
          error: 'Yetkisiz erişim. Toplu hak sahibi verilerini veya sistem kayıtlarını dışa aktarma yetkisi yalnızca Yöneticilere aittir.'
        }, { status: 403 });
      }
    }

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
      return buildExcelResponse(buf, 'Edirne_SYDV_Komur_Yukleme_Sablonu.xlsx', session, type);
    }


    const { 
      beneficiaries: benCol, 
      importLogs: logsCol, 
      deliveryHistory: histCol, 
      activityLogs: actCol,
      seasonArchives: seasonCol,
      archivedBeneficiaries: archBenCol,
      workShifts: shiftsCol,
      truckDeliveries: trucksCol,
      systemSettings: settingsCol,
      signatureLists: sigCol
    } = await getDbCollections();

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
      return buildExcelResponse(buf, `Edirne_SYDV_Gunluk_Komur_Teslimat_Listesi_${targetDate}.xlsx`, session, type);
    }

    // 2.5. Personel Mesai ve Günlük Çalışma Saatleri Listesi
    if (type === 'shifts') {
      const month = searchParams.get('month') || 'ALL'; // 'YYYY-MM' or 'ALL'
      const personel = searchParams.get('personel') || 'ALL';
      const targetDate = searchParams.get('date');

      const filter: any = {};
      if (targetDate && targetDate !== 'ALL') {
        filter.tarih = targetDate;
      } else if (month && month !== 'ALL') {
        filter.tarih = { $regex: `^${month}` };
      }

      const rawRecords = await shiftsCol
        .find(filter)
        .sort({ tarih: 1, baslama_saati: 1 })
        .toArray();

      let records = mapDocs(rawRecords);
      if (personel && personel !== 'ALL') {
        records = records.filter((s: any) => s.personel_adi === personel);
      }

      const dayNames = ['Pazar', 'Pazartesi', 'Salı', 'Çarşamba', 'Perşembe', 'Cuma', 'Cumartesi'];
      let totalMinutes = 0;
      const uniqueDays = new Set<string>();

      const exportData = records.map((s: any, idx: number) => {
        const mins = Number(s.toplam_dakika) || 0;
        totalMinutes += mins;
        if (s.tarih) uniqueDays.add(s.tarih);

        const sDate = new Date(s.tarih + 'T00:00:00');
        const dayName = isNaN(sDate.getTime()) ? '-' : (dayNames[sDate.getDay()] || '-');

        const hours = Math.floor(mins / 60);
        const remMins = mins % 60;
        const durationFmt = hours > 0 ? (remMins > 0 ? `${hours} sa ${remMins} dk` : `${hours} sa`) : `${remMins} dk`;

        return {
          'Sıra': idx + 1,
          'Çalışma Tarihi': s.tarih || '-',
          'Gün': dayName,
          'Personel Adı': s.personel_adi || '-',
          'Başlama Saati': s.baslama_saati || '-',
          'Bitiş Saati': s.bitis_saati || '-',
          'Toplam Süre': durationFmt,
          'Toplam Dakika': mins,
          'Çalışılan Mahalle / Bölge': s.mahalleler || '-',
          'Açıklama / Saha Notu': s.notlar || '-',
        };
      });

      // Summary row at the bottom
      if (exportData.length > 0) {
        const totHours = Math.floor(totalMinutes / 60);
        const totRemMins = totalMinutes % 60;
        const totDurationFmt = totHours > 0 ? (totRemMins > 0 ? `${totHours} sa ${totRemMins} dk` : `${totHours} sa`) : `${totRemMins} dk`;

        exportData.push({
          'Sıra': '' as any,
          'Çalışma Tarihi': 'TOPLAM:',
          'Gün': `${uniqueDays.size} Gün`,
          'Personel Adı': `${records.length} Mesai Kaydı`,
          'Başlama Saati': '',
          'Bitiş Saati': '',
          'Toplam Süre': totDurationFmt,
          'Toplam Dakika': totalMinutes,
          'Çalışılan Mahalle / Bölge': '',
          'Açıklama / Saha Notu': '',
        });
      }

      const colWidths = [
        { wch: 6 },  // Sıra
        { wch: 15 }, // Tarih
        { wch: 14 }, // Gün
        { wch: 22 }, // Personel
        { wch: 14 }, // Başlama
        { wch: 14 }, // Bitiş
        { wch: 16 }, // Toplam Süre
        { wch: 14 }, // Toplam Dakika
        { wch: 32 }, // Mahalleler
        { wch: 40 }, // Not
      ];

      const periodLabel = targetDate && targetDate !== 'ALL'
        ? `Tarih: ${targetDate}`
        : (month && month !== 'ALL' ? `Dönem/Ay: ${month}` : 'Tüm Dönemler');
      const staffLabel = personel && personel !== 'ALL' ? `Personel: ${personel}` : 'Tüm Personeller';
      const hoursAll = Math.floor(totalMinutes / 60);
      const minsRemAll = totalMinutes % 60;

      addStyledWorksheet(
        workbook,
        'PERSONEL ÇALIŞMA SAATLERİ VE SAHA MESAİ TAKİP CETVELİ',
        `${periodLabel} | ${staffLabel} | Toplam: ${records.length} Kayıt (${uniqueDays.size} Gün, ${hoursAll} Saat ${minsRemAll} Dk)`,
        'Mesai Cetveli',
        exportData,
        colWidths
      );

      const buf = await workbook.xlsx.writeBuffer();
      const safeMonth = (month || 'Genel').replace(/[^a-zA-Z0-9_-]/g, '_');
      const safeStaff = (personel || 'Tum_Personel').replace(/[^a-zA-Z0-9_-]/g, '_');
      return buildExcelResponse(buf, `Edirne_SYDV_Personel_Mesai_Raporu_${safeMonth}_${safeStaff}.xlsx`, session, type);
    }


    // 2.6. Kömür Sevkiyatı ve Saha Kantar Tonaj Listesi (Tesellüm & TKİ Formatları)
    if (type === 'trucks') {
      const startDate = searchParams.get('startDate');
      const endDate = searchParams.get('endDate');
      const formatParam = (searchParams.get('format') || 'all').toLowerCase();

      const filter: any = {};
      if (startDate && endDate) {
        filter.tarih = { $gte: startDate, $lte: endDate };
      } else if (startDate) {
        filter.tarih = { $gte: startDate };
      } else if (endDate) {
        filter.tarih = { $lte: endDate };
      }

      const rawTrucks = await trucksCol
        .find(filter)
        .sort({ tir_sirasi: 1, tarih: 1 })
        .toArray();

      const records = mapDocs(rawTrucks);

      let totalYuklenenKg = 0;
      let totalTeslimKg = 0;
      let totalFarkKg = 0;

      // Format 1: Günlük Tesellüm İzleme Tablosu (Valilik Formatı)
      const exportDataTesellum = records.map((t: any, idx: number) => {
        const yuklenenTon = normalizeToTon(t.brut_tonaj);
        const teslimTon = normalizeToTon(t.net_tonaj);
        const yuklenenKg = Math.round(yuklenenTon * 1000);
        const teslimKg = Math.round(teslimTon * 1000);
        const farkKg = teslimKg - yuklenenKg;

        totalYuklenenKg += yuklenenKg;
        totalTeslimKg += teslimKg;
        totalFarkKg += farkKg;

        const yuklenenFmt = formatTwoWayTonnage(t.brut_tonaj).slash;
        const teslimFmt = formatTwoWayTonnage(t.net_tonaj).slash;
        const farkFmt = formatTwoWayDiff(farkKg).slash;

        return {
          'Sıra': t.tir_sirasi || idx + 1,
          'YÜKLEMEYİ YAPAN İŞLETME': t.isletme_adi || 'Çan Linyit İşletmesi Müdürlüğü',
          'ÇIKIŞ TARİHİ': t.ocak_cikis_tarihi || t.tarih ? formatTrDateWithDay(t.ocak_cikis_tarihi || t.tarih) : '-',
          'VAGON Veya PLAKA NO / Şoför Adı': `${t.plaka || '-'}${t.sofor_adi ? ` - ${t.sofor_adi}` : ''}`,
          'İŞLETMEDEN YÜKLENEN MİKTAR (kg)': yuklenenFmt,
          'TESELLÜM TARİHİ': t.tarih ? formatTrDateWithDay(t.tarih) : '-',
          'TESELLÜM FİŞ NO veya ( Kantar tartı no)': t.irsaliye_no || '-',
          'TESLİM ALINAN MİKTAR(kg)': teslimFmt,
          'FARK (İşl.Yüklenen) ( Teslim Alınan) kg.': farkFmt,
          'TUTANAK NO': t.tutanak_no || '-'
        };
      });

      // Format 2: TKİ Resmi Kömür Dağıtım Listesi (Dönemsel / Tutanak Formatı)
      const exportDataTki = records.map((t: any, idx: number) => {
        const sevkFmt = formatTwoWayTonnage(t.brut_tonaj).slash;
        const teslimFmt = formatTwoWayTonnage(t.net_tonaj).slash;

        return {
          'SIRA NO': t.tir_sirasi || idx + 1,
          'İL': t.il || 'EDİRNE',
          'İLÇE': t.ilce || 'MERKEZ',
          'PLAKA NO': t.plaka || '-',
          'SEVK TARİHİ': t.ocak_cikis_tarihi || t.tarih ? formatTrDateWithDay(t.ocak_cikis_tarihi || t.tarih) : '-',
          'SEVK MİKTAR (KG)': sevkFmt,
          'TESLİM TARİHİ': t.tarih ? formatTrDateWithDay(t.tarih) : '-',
          'TESLİM MİKTARI(KG)': teslimFmt,
          'İRSALİYE NO': t.irsaliye_no || '-',
          'TUTANAK NO': t.tutanak_no || '-'
        };
      });

      // Summary rows at bottom
      if (exportDataTesellum.length > 0) {
        const totalYuklenenFmt = formatTwoWayTonnage(totalYuklenenKg / 1000).slash;
        const totalTeslimFmt = formatTwoWayTonnage(totalTeslimKg / 1000).slash;
        const totalFarkFmt = formatTwoWayDiff(totalFarkKg).slash;

        exportDataTesellum.push({
          'Sıra': '' as any,
          'YÜKLEMEYİ YAPAN İŞLETME': 'TOPLAM TESLİM ALINAN MİKTAR',
          'ÇIKIŞ TARİHİ': '',
          'VAGON Veya PLAKA NO / Şoför Adı': `${records.length} Tır`,
          'İŞLETMEDEN YÜKLENEN MİKTAR (kg)': totalYuklenenFmt,
          'TESELLÜM TARİHİ': '',
          'TESELLÜM FİŞ NO veya ( Kantar tartı no)': '',
          'TESLİM ALINAN MİKTAR(kg)': totalTeslimFmt,
          'FARK (İşl.Yüklenen) ( Teslim Alınan) kg.': totalFarkFmt,
          'TUTANAK NO': ''
        });

        exportDataTki.push({
          'SIRA NO': '' as any,
          'İL': '',
          'İLÇE': '',
          'PLAKA NO': 'GENEL TOPLAM:',
          'SEVK TARİHİ': 'Toplam',
          'SEVK MİKTAR (KG)': totalYuklenenFmt,
          'TESLİM TARİHİ': 'Toplam',
          'TESLİM MİKTARI(KG)': totalTeslimFmt,
          'İRSALİYE NO': `${records.length} Tır`,
          'TUTANAK NO': ''
        });
      }

      const dateLabel = startDate && endDate ? `${startDate} - ${endDate}` : (startDate ? `${startDate} Sonrası` : (endDate ? `${endDate} Öncesi` : 'Tüm Dönem'));

      // Sayfa eklemeleri: İstenen formata göre veya ikisi birden
      if (formatParam === 'tesellum') {
        const sheet = addStyledWorksheet(
          workbook,
          'TESELLÜMLERİ İZLEME TABLOSU',
          `(GÜNLÜK OLARAK VALİLİK GÖREVLİSİ TARAFINDAN DOLDURULACAKTIR) | Kapsam: ${dateLabel}`,
          'Tesellüm İzleme Tablosu',
          exportDataTesellum,
          [
            { wch: 8 },
            { wch: 32 },
            { wch: 24 },
            { wch: 32 },
            { wch: 28 },
            { wch: 24 },
            { wch: 24 },
            { wch: 28 },
            { wch: 28 },
            { wch: 18 }
          ]
        );
        // İmza satırları
        sheet.addRow([]);
        const sigRow1 = sheet.addRow(['', '', '', 'Cem PAZAR', '', '', '', 'Tezcan FİDAN']);
        sigRow1.font = { name: 'Segoe UI', size: 10, bold: true };
        const sigRow2 = sheet.addRow(['', '', '', 'Sos. Yard. ve İnc. Gör.', '', '', '', 'Vakıf Müdürü']);
        sigRow2.font = { name: 'Segoe UI', size: 9, italic: true };
      } else if (formatParam === 'tki') {
        const sheet = addStyledWorksheet(
          workbook,
          'TÜRKİYE KÖMÜR İŞLETMELERİ KURUMU',
          `ÇAN LİNYİT İŞLETMESİ MÜDÜRLÜĞÜ EDİRNE/MERKEZ İLÇESİ KÖMÜR LİSTESİ | Kapsam: ${dateLabel}`,
          'TKİ Kömür Listesi',
          exportDataTki,
          [
            { wch: 10 },
            { wch: 14 },
            { wch: 14 },
            { wch: 20 },
            { wch: 24 },
            { wch: 28 },
            { wch: 24 },
            { wch: 28 },
            { wch: 20 },
            { wch: 18 }
          ]
        );
        // İmza satırları
        sheet.addRow([]);
        const sigRow1 = sheet.addRow(['', '', '', '', '', '', '', '', 'Tezcan FİDAN']);
        sigRow1.font = { name: 'Segoe UI', size: 10, bold: true };
        const sigRow2 = sheet.addRow(['', '', '', '', '', '', '', '', 'Vakıf Müdürü']);
        sigRow2.font = { name: 'Segoe UI', size: 9, italic: true };
      } else {
        // Her iki formatı ayrı sekmelerde sun
        const sheet1 = addStyledWorksheet(
          workbook,
          'TESELLÜMLERİ İZLEME TABLOSU',
          `(GÜNLÜK OLARAK VALİLİK GÖREVLİSİ TARAFINDAN DOLDURULACAKTIR) | Kapsam: ${dateLabel}`,
          'Tesellüm İzleme Tablosu',
          exportDataTesellum,
          [
            { wch: 8 },
            { wch: 32 },
            { wch: 24 },
            { wch: 32 },
            { wch: 28 },
            { wch: 24 },
            { wch: 24 },
            { wch: 28 },
            { wch: 28 },
            { wch: 18 }
          ]
        );
        sheet1.addRow([]);
        const sigRow1 = sheet1.addRow(['', '', '', 'Cem PAZAR', '', '', '', 'Tezcan FİDAN']);
        sigRow1.font = { name: 'Segoe UI', size: 10, bold: true };
        const sigRow2 = sheet1.addRow(['', '', '', 'Sos. Yard. ve İnc. Gör.', '', '', '', 'Vakıf Müdürü']);
        sigRow2.font = { name: 'Segoe UI', size: 9, italic: true };

        const sheet2 = addStyledWorksheet(
          workbook,
          'TÜRKİYE KÖMÜR İŞLETMELERİ KURUMU',
          `ÇAN LİNYİT İŞLETMESİ MÜDÜRLÜĞÜ EDİRNE/MERKEZ İLÇESİ KÖMÜR LİSTESİ | Kapsam: ${dateLabel}`,
          'TKİ Kömür Listesi',
          exportDataTki,
          [
            { wch: 10 },
            { wch: 14 },
            { wch: 14 },
            { wch: 20 },
            { wch: 24 },
            { wch: 28 },
            { wch: 24 },
            { wch: 28 },
            { wch: 20 },
            { wch: 18 }
          ]
        );
        sheet2.addRow([]);
        const sigRow2_1 = sheet2.addRow(['', '', '', '', '', '', '', '', 'Tezcan FİDAN']);
        sigRow2_1.font = { name: 'Segoe UI', size: 10, bold: true };
        const sigRow2_2 = sheet2.addRow(['', '', '', '', '', '', '', '', 'Vakıf Müdürü']);
        sigRow2_2.font = { name: 'Segoe UI', size: 9, italic: true };
      }

      const buf = await workbook.xlsx.writeBuffer();
      const safeStart = (startDate || 'Baslangic').replace(/[^a-zA-Z0-9_-]/g, '_');
      const safeEnd = (endDate || 'Bitis').replace(/[^a-zA-Z0-9_-]/g, '_');
      const filePrefix = formatParam === 'tesellum' ? 'Tesellum_Izleme_Tablosu' : (formatParam === 'tki' ? 'TKI_Komur_Listesi' : 'Edirne_SYDV_Komur_Tonaj_Raporu');
      return buildExcelResponse(buf, `${filePrefix}_${safeStart}_${safeEnd}.xlsx`, session, type);
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
          'Teslim Eden Personel': normalizeStaffName(r.teslim_eden_personel) || r.teslim_eden_personel || '-',
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
      return buildExcelResponse(buf, 'Edirne_SYDV_Komur_Hak_Sahipleri_Listesi.xlsx', session, type);
    }


    // 3.5. Yüklenen Excel Dosyası / Hak Sahipleri - Mahalle İsimlerine Göre Sekmelere Bölünmüş Çalışma Kitabı
    if (type === 'batch_by_mahalle' || type === 'beneficiaries_by_mahalle') {
      const batchId = (searchParams.get('batchId') || '').trim();
      const donemKodu = (searchParams.get('donem_kodu') || '').trim();
      const { importBatches: batchesCol, archivedImportBatches, archivedBeneficiaries } = await getDbCollections();

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
        if (!batchDoc) {
          batchDoc = await archivedImportBatches.findOne({
            $or: [
              { batch_id: batchId },
              { id: batchId },
            ],
          });
        }
      }

      let rawRecords = donemKodu && donemKodu !== 'AKTIF'
        ? await archivedBeneficiaries.find({ ...filter, donem_kodu: donemKodu }).toArray()
        : await benCol.find(filter).toArray();

      if (rawRecords.length === 0 && batchId && batchId !== 'ALL') {
        rawRecords = await archivedBeneficiaries.find(filter).toArray();
      }
      const records = mapDocs(rawRecords);

      const dosyaAdi = batchDoc?.dosya_adi || (batchId && batchId !== 'ALL' ? `Dosya_${batchId}` : 'Tum_Hak_Sahipleri');
      const cleanFileBase = dosyaAdi.replace(/\.[^/.]+$/, '').replace(/[^a-zA-Z0-9ÇŞĞÜÖİçşğüöı_-]/g, '_');

      // Group records by Mahalle
      const mahalleGroups = new Map<string, any[]>();
      for (const r of records) {
        const m = normalizeMahalleName(r.mahalle) || r.mahalle || 'Genel';
        if (!mahalleGroups.has(m)) {
          mahalleGroups.set(m, []);
        }
        mahalleGroups.get(m)!.push(r);
      }

      // Sort mahalle names: Mahalleler A-Z first, then Köyler A-Z
      const allMahalleKeys = Array.from(mahalleGroups.keys());
      const onlyMahalles = allMahalleKeys
        .filter((m) => !/(?:Köyü|Koy|Koyu)$/i.test(m))
        .sort((a, b) => a.localeCompare(b, 'tr', { sensitivity: 'base' }));
      const onlyKoys = allMahalleKeys
        .filter((m) => /(?:Köyü|Koy|Koyu)$/i.test(m))
        .sort((a, b) => a.localeCompare(b, 'tr', { sensitivity: 'base' }));
      const sortedMahalles = [...onlyMahalles, ...onlyKoys];

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

        let groupTargetTorba = 0;
        let groupDeliveredTorba = 0;

        const sheetRows = group.map((r: any, idx: number) => {
          const phones = extractPhoneNumbers(r.telefon, r.telefon2);
          const phoneStr = phones.length > 0 ? phones.join(' / ') : (r.telefon || '-');
          const target = Number(r.hedef_torba || 34);
          const delivered = Number(r.torba_sayisi || 0);
          groupTargetTorba += target;
          groupDeliveredTorba += delivered;

          const durumText = r.teslimat_durumu === 'TAMAMLANDI' || r.teslimat_durumu === 'TESLIM_EDILDI'
            ? 'Teslim Edildi'
            : (r.teslimat_durumu === 'EKSIK' ? `Eksik (${delivered}/${target})` : 'Bekliyor');

          const listeTuruText = r.liste_turu === 'SIGORTALI'
            ? 'Sigortalılar Listesi'
            : (r.liste_turu === 'EK_LISTE' ? (r.ek_liste_adi || 'Ek Liste') : 'Ana Liste');

          return {
            'Sıra': idx + 1,
            'İmza Sıra No': r.sira_no || '-',
            'Mahalle Sırası': r.mahalle_sira || idx + 1,
            'Ek Excel Sırası': r.excel_sira_no || r.ek_excel_sira || '-',
            'Liste Türü': listeTuruText,
            'Hane No': r.hane_no || '-',
            'TC Kimlik No': r.tc_no,
            'Adı Soyadı': r.ad_soyad,
            'Telefon': phoneStr,
            'Açık Adres': r.acik_adres || '-',
            'Hedef (Torba)': target,
            'Teslim (Torba)': delivered,
            'Durum': durumText,
          };
        });

        // Add Mahalle summary footer row
        if (sheetRows.length > 0) {
          sheetRows.push({
            'Sıra': '' as any,
            'İmza Sıra No': '',
            'Mahalle Sırası': '',
            'Ek Excel Sırası': '',
            'Liste Türü': '',
            'Hane No': '',
            'TC Kimlik No': `TOPLAM: ${group.length} Hane`,
            'Adı Soyadı': '',
            'Telefon': '',
            'Açık Adres': '',
            'Hedef (Torba)': groupTargetTorba,
            'Teslim (Torba)': groupDeliveredTorba,
            'Durum': '',
          });
        }

        const mahColWidths = [
          { wch: 8 },  // Sıra
          { wch: 14 }, // İmza Sıra No
          { wch: 14 }, // Mahalle Sırası
          { wch: 14 }, // Ek Excel Sırası
          { wch: 18 }, // Liste Türü
          { wch: 12 }, // Hane No
          { wch: 18 }, // TC Kimlik No
          { wch: 28 }, // Adı Soyadı
          { wch: 20 }, // Telefon
          { wch: 45 }, // Açık Adres
          { wch: 14 }, // Hedef
          { wch: 14 }, // Teslim
          { wch: 18 }, // Durum
        ];

        const safeSheetName = sanitizeSheetName(mahName, seenSheetNames);
        addStyledWorksheet(
          workbook,
          `KÖMÜR YARDIMI DAĞITIM VE İMZA ÇİZELGESİ - ${mahName.toUpperCase()}`,
          `Dosya: ${dosyaAdi} | Mahalle/Köy: ${mahName} | Toplam: ${group.length} Hane | Hedef: ${groupTargetTorba} Torba | Teslim Edilen: ${groupDeliveredTorba} Torba`,
          safeSheetName,
          sheetRows,
          mahColWidths
        );
      }

      const buf = await workbook.xlsx.writeBuffer();
      const downloadFilename = `Edirne_SYDV_${cleanFileBase}_Mahalle_Sekmeli.xlsx`;
      return buildExcelResponse(buf, downloadFilename, session, type);
    }

    // 3B. Resmi Islak İmza Listesi (Mahalle Mahalle Sekmeli, Adres A-Z Sıralı, Islak İmza Kutucuklu, A4 Baskıya Hazır)
    if (type === 'signature_list') {
      const listId = (searchParams.get('listId') || '').trim();
      const donemKodu = (searchParams.get('donem_kodu') || '').trim();

      let targetListDoc: any = null;
      if (listId && listId !== 'ALL' && listId !== 'PENDING') {
        targetListDoc = await sigCol.findOne({
          $or: [{ id: listId }, { _id: listId }],
        });
      }

      const targetBenCol = donemKodu && donemKodu !== 'AKTIF' ? archBenCol : benCol;

      // PERFORMANS OPTİMİZASYONU:
      // Tüm veritabanını çekip bellekte şifre çözmek yerine doğrudan MongoDB sorgu filtresi uygulanır.
      // Yalnızca dışa aktarılacak listeye ait kayıtlar çekilir ve çözülür (50-100x daha hızlı).
      const dbFilter: any = {};
      if (donemKodu && donemKodu !== 'AKTIF') {
        dbFilter.donem_kodu = donemKodu;
      }

      let listTitle = targetListDoc?.liste_adi || 'Toplu Islak İmza Dağıtım Listesi';

      if (listId && listId !== 'ALL' && listId !== 'PENDING') {
        dbFilter.imza_listesi_id = listId;
        if (targetListDoc?.liste_adi) {
          listTitle = targetListDoc.liste_adi;
        } else {
          listTitle = `Islak İmza Listesi (${listId})`;
        }
      } else if (listId === 'PENDING') {
        dbFilter.$or = [
          { imza_listesi_id: null },
          { imza_listesi_id: '' },
          { imza_listesi_id: { $exists: false } },
        ];
        listTitle = 'Yeni Eklenen Kayıtlar Islak İmza Listesi (Taslak / Bekleyenler)';
      } else {
        listTitle = 'Tüm Mahalleler Genel Islak İmza Listesi (Tüm Kayıtlar)';
      }

      const rawRecords = await targetBenCol.find(dbFilter).toArray();
      const records = mapDocs(rawRecords);

      if (records.length === 0) {
        const emptySheet = workbook.addWorksheet('Bilgi', {
          pageSetup: { paperSize: 9, orientation: 'landscape' },
        });
        emptySheet.addRow(['T.C. EDİRNE VALİLİĞİ']);
        emptySheet.addRow(['EDİRNE SOSYAL YARDIMLAŞMA VE DAYANIŞMA VAKFI BAŞKANLIĞI']);
        emptySheet.addRow([listTitle.toUpperCase()]);
        emptySheet.addRow(['Bu filtreleme kriterine veya imza listesine ait hak sahibi kaydı bulunamadı.']);
        for (let r = 1; r <= 4; r++) {
          emptySheet.mergeCells(r, 1, r, 9);
          emptySheet.getRow(r).alignment = { vertical: 'middle', horizontal: 'center' };
        }
        const buf = await workbook.xlsx.writeBuffer();
        return buildExcelResponse(buf, `Edirne_SYDV_Islak_Imza_Listesi_Bos.xlsx`, session, type);
      }

      // Group records by Mahalle
      const mahalleGroups = new Map<string, any[]>();
      for (const r of records) {
        const m = normalizeMahalleName(r.mahalle) || r.mahalle || 'Genel';
        if (!mahalleGroups.has(m)) {
          mahalleGroups.set(m, []);
        }
        mahalleGroups.get(m)!.push(r);
      }

      // Sort mahalle names: Mahalles A-Z first, then Köys A-Z
      const allMahalleKeys = Array.from(mahalleGroups.keys());
      const onlyMahalles = allMahalleKeys
        .filter((m) => !/(?:Köyü|Koy|Koyu)$/i.test(m))
        .sort((a, b) => a.localeCompare(b, 'tr', { sensitivity: 'base' }));
      const onlyKoys = allMahalleKeys
        .filter((m) => /(?:Köyü|Koy|Koyu)$/i.test(m))
        .sort((a, b) => a.localeCompare(b, 'tr', { sensitivity: 'base' }));
      const sortedMahalles = [...onlyMahalles, ...onlyKoys];

      const seenSheetNames = new Set<string>();

      // 1. SEKME: ÖZET İCMAL
      addOfficialSignatureSummarySheet(
        workbook,
        listTitle,
        `Toplam Yerleşim: ${sortedMahalles.length} | Toplam Hane: ${records.length}`,
        sortedMahalles,
        mahalleGroups,
        seenSheetNames
      );

      // 2..N. SEKMELER: HER MAHALLE İÇİN AYRI SEKME
      for (const mahName of sortedMahalles) {
        const group = mahalleGroups.get(mahName)!;
        addOfficialSignatureSheet(
          workbook,
          mahName,
          listTitle,
          group,
          seenSheetNames
        );
      }

      const buf = await workbook.xlsx.writeBuffer();
      const cleanTitle = listTitle.replace(/[^a-zA-Z0-9ÇŞĞÜÖİçşğüöı_-]/g, '_');
      const downloadFilename = `Edirne_SYDV_${cleanTitle}.xlsx`;
      return buildExcelResponse(buf, downloadFilename, session, type);
    }

    // 4. Excel Yükleme Hata & Mükerrer Kayıt Raporu
    if (type === 'errors') {
      const batchId = (searchParams.get('batchId') || '').trim();
      const donemKodu = (searchParams.get('donem_kodu') || '').trim();
      const { archivedImportLogs } = await getDbCollections();
      const filter: any = {};
      if (batchId && batchId !== 'ALL') {
        filter.batch_id = batchId;
      }

      let rawRecords =
        donemKodu && donemKodu !== 'AKTIF'
          ? await archivedImportLogs
              .find({ ...filter, donem_kodu: donemKodu })
              .sort({ satir_no: 1, _id: -1 })
              .toArray()
          : await logsCol
              .find(filter)
              .sort({ satir_no: 1, _id: -1 })
              .toArray();

      if (rawRecords.length === 0 && batchId && batchId !== 'ALL') {
        rawRecords = await archivedImportLogs
          .find(filter)
          .sort({ satir_no: 1, _id: -1 })
          .toArray();
      }

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

      return buildExcelResponse(buf, filename, session, type);
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
      return buildExcelResponse(buf, 'Edirne_SYDV_Kullanici_Islem_Loglari_Raporu.xlsx', session, type);
    }

    // =========================================================================
    // 6. Arşivlenmiş Dönem Raporu (Özet İcmal + Arşiv Hak Sahipleri Listesi)
    // =========================================================================
    if (type === 'season_archive') {
      const donemKodu = (searchParams.get('donem_kodu') || '').trim();
      if (!donemKodu) {
        return NextResponse.json({ success: false, error: 'Dönem kodu belirtilmedi' }, { status: 400 });
      }

      const archive = await seasonCol.findOne({ donem_kodu: donemKodu });
      if (!archive) {
        return NextResponse.json({ success: false, error: `"${donemKodu}" kodlu arşivlenmiş dönem bulunamadı.` }, { status: 404 });
      }

      // Fetch all beneficiaries archived for this period
      const rawArchivedBens = await archBenCol
        .find({ donem_kodu: donemKodu })
        .sort({ sira_no: 1, mahalle: 1 })
        .toArray();
      const archivedBens = mapDocs(rawArchivedBens);

      const seenSheetNames = new Set<string>();

      // Tab 1: Mahalle Bazlı Dönem İcmali
      const mahalleOzetleri = archive.mahalle_ozetleri || [];
      const icmalData = mahalleOzetleri.map((m: any, idx: number) => ({
        'Sıra': idx + 1,
        'Mahalle / Köy Adı': m.mahalle,
        'Yerleşim Tipi': m.tip || 'MAHALLE',
        'Toplam Hane': m.toplam_hane,
        'Hedef Kömür (Torba)': m.hedef_torba,
        'Hedef Kömür (Ton)': `${m.hedef_ton || (m.hedef_torba * 0.025).toFixed(2)} Ton`,
        'Dağıtılan (Torba)': m.dagitilan_torba,
        'Dağıtılan (Ton)': `${m.dagitilan_ton || (m.dagitilan_torba * 0.025).toFixed(2)} Ton`,
        'Kalan Kömür (Torba)': Math.max(0, m.hedef_torba - m.dagitilan_torba),
        'Tamamlanan Hane': m.tamamlanan_hane,
        'Eksik Hane': m.eksik_hane,
        'Bekleyen Hane': m.bekleyen_hane,
        'Tamamlanma Oranı': `%${m.tamamlanma_orani || 0}`,
      }));

      // Genel Toplam Satırı
      const stats = archive.istatistikler || {};
      if (icmalData.length > 0) {
        icmalData.push({
          'Sıra': '' as any,
          'Mahalle / Köy Adı': 'GENEL TOPLAM:',
          'Yerleşim Tipi': `${mahalleOzetleri.length} Yerleşim`,
          'Toplam Hane': stats.toplam_hane || 0,
          'Hedef Kömür (Torba)': stats.hedef_toplam_torba || 0,
          'Hedef Kömür (Ton)': `${stats.hedef_toplam_ton || 0} Ton`,
          'Dağıtılan (Torba)': stats.toplam_dagitilan_torba || 0,
          'Dağıtılan (Ton)': `${stats.toplam_dagitilan_ton || 0} Ton`,
          'Kalan Kömür (Torba)': Math.max(0, (stats.hedef_toplam_torba || 0) - (stats.toplam_dagitilan_torba || 0)),
          'Tamamlanan Hane': stats.tamamlanan_hane || 0,
          'Eksik Hane': stats.eksik_hane || 0,
          'Bekleyen Hane': stats.bekleyen_hane || 0,
          'Tamamlanma Oranı': `%${stats.tamamlanma_orani || 0}`,
        });
      }

      const icmalColWidths = [
        { wch: 6 },  // Sıra
        { wch: 24 }, // Mahalle
        { wch: 14 }, // Tip
        { wch: 14 }, // Toplam Hane
        { wch: 20 }, // Hedef Torba
        { wch: 18 }, // Hedef Ton
        { wch: 18 }, // Dağıtılan Torba
        { wch: 16 }, // Dağıtılan Ton
        { wch: 20 }, // Kalan Torba
        { wch: 16 }, // Tamamlanan
        { wch: 14 }, // Eksik
        { wch: 14 }, // Bekleyen
        { wch: 18 }, // Oran
      ];

      addStyledWorksheet(
        workbook,
        `${(archive.baslik || archive.donem_kodu).toUpperCase()} - DÖNEM SONU İCMAL VE DAĞITIM RAPORU`,
        `Dönem: ${archive.donem_kodu} | Kapanış: ${archive.kapanis_tarihi || archive.arsivlenme_zamani} | Kapatan: ${archive.kapatan_kullanici || 'Yönetici'}`,
        sanitizeSheetName('Dönem İcmali', seenSheetNames),
        icmalData,
        icmalColWidths
      );

      // Tab 2: Arşivlenen Hak Sahipleri Detay Listesi
      const bensData = archivedBens.map((b: any, idx: number) => {
        const target = Number(b.hedef_torba || 34);
        const delivered = Number(b.torba_sayisi || 0);
        return {
          'Sıra': b.sira_no || idx + 1,
          'Mahalle': b.mahalle || '-',
          'Hane No': b.hane_no || '-',
          'TC Kimlik No': b.tc_no || '-',
          'Adı Soyadı': b.ad_soyad || '-',
          'Telefon': b.telefon || '-',
          'Açık Adres': b.acik_adres || '-',
          'Hedef (Torba)': target,
          'Teslim (Torba)': delivered,
          'Durum': b.teslimat_durumu === 'TAMAMLANDI' ? 'TAMAMLANDI' : (b.teslimat_durumu === 'EKSIK' ? 'EKSİK' : 'BEKLİYOR'),
          'Teslim Alan': b.teslim_alan || '-',
          'Teslim Tarihi': b.teslim_tarihi || '-',
          'Teslim Eden Personel': normalizeStaffName(b.teslim_eden_personel) || b.teslim_eden_personel || '-',
          'İmza Durumu': b.imza_durumu === 'IMZALANDI' ? 'İMZALANDI' : 'İMZASIZ',
        };
      });

      const bensColWidths = [
        { wch: 8 },  // Sıra
        { wch: 20 }, // Mahalle
        { wch: 12 }, // Hane No
        { wch: 16 }, // TC Kimlik No
        { wch: 24 }, // Ad Soyad
        { wch: 16 }, // Telefon
        { wch: 45 }, // Açık Adres
        { wch: 14 }, // Hedef
        { wch: 14 }, // Teslim
        { wch: 16 }, // Durum
        { wch: 22 }, // Teslim Alan
        { wch: 20 }, // Teslim Tarihi
        { wch: 22 }, // Teslim Eden Personel
        { wch: 14 }, // İmza Durumu
      ];

      addStyledWorksheet(
        workbook,
        `${(archive.baslik || archive.donem_kodu).toUpperCase()} - ARŞİVLENEN HAK SAHİBİ LİSTESİ`,
        `Toplam ${archivedBens.length} Kayıt Arşivlendi | Veritabanı Arşiv Güvencesi`,
        sanitizeSheetName('Hak Sahipleri', seenSheetNames),
        bensData,
        bensColWidths
      );

      const buf = await workbook.xlsx.writeBuffer();
      const filename = `Edirne_SYDV_${archive.donem_kodu.replace(/[^a-zA-Z0-9_-]/g, '_')}_Donemi_Arsiv_Raporu.xlsx`;
      return buildExcelResponse(buf, filename, session, type);
    }

    // =========================================================================
    // 7. İstatistiksel Analiz ve Mahalle İcmal Raporu (type=analytics)
    // =========================================================================
    if (type === 'analytics') {
      const rawRecords = await benCol.find({}).toArray();
      const records = mapDocs(rawRecords);
      const seenSheetNames = new Set<string>();

      const mahalleGroups = new Map<string, any[]>();
      const eksikList: any[] = [];

      for (const r of records) {
        const m = normalizeMahalleName(r.mahalle) || r.mahalle || 'Genel';
        if (!mahalleGroups.has(m)) {
          mahalleGroups.set(m, []);
        }
        mahalleGroups.get(m)!.push(r);

        if (r.teslimat_durumu === 'EKSIK') {
          eksikList.push(r);
        }
      }

      const allMahalleKeys = Array.from(mahalleGroups.keys());
      const onlyMahalles = allMahalleKeys
        .filter((m) => !/(?:Köyü|Koy|Koyu)$/i.test(m))
        .sort((a, b) => a.localeCompare(b, 'tr', { sensitivity: 'base' }));
      const onlyKoys = allMahalleKeys
        .filter((m) => /(?:Köyü|Koy|Koyu)$/i.test(m))
        .sort((a, b) => a.localeCompare(b, 'tr', { sensitivity: 'base' }));
      const sortedMahalles = [...onlyMahalles, ...onlyKoys];

      let totalHane = 0;
      let totalTargetBags = 0;
      let totalDeliveredBags = 0;
      let totalTamamlanan = 0;
      let totalEksik = 0;
      let totalBekleyen = 0;
      let totalImzali = 0;

      const icmalRows = sortedMahalles.map((mahName, idx) => {
        const group = mahalleGroups.get(mahName)!;
        let mTarget = 0;
        let mDelivered = 0;
        let mTamamlanan = 0;
        let mEksik = 0;
        let mBekleyen = 0;
        let mImzali = 0;

        for (const item of group) {
          const t = Number(item.hedef_torba || 34);
          const d = Number(item.torba_sayisi || 0);
          mTarget += t;
          mDelivered += d;
          if (item.imza_durumu === 'IMZALANDI') mImzali++;
          if (item.teslimat_durumu === 'TAMAMLANDI' || item.teslimat_durumu === 'TESLIM_EDILDI') {
            mTamamlanan++;
          } else if (item.teslimat_durumu === 'EKSIK') {
            mEksik++;
          } else {
            mBekleyen++;
          }
        }

        totalHane += group.length;
        totalTargetBags += mTarget;
        totalDeliveredBags += mDelivered;
        totalTamamlanan += mTamamlanan;
        totalEksik += mEksik;
        totalBekleyen += mBekleyen;
        totalImzali += mImzali;

        const isKoy = /(?:Köyü|Koy|Koyu)$/i.test(mahName);
        const ratio = group.length > 0 ? Math.round((mTamamlanan / group.length) * 100) : 0;

        return {
          'Sıra': idx + 1,
          'Mahalle / Köy Adı': mahName,
          'Yerleşim Tipi': isKoy ? 'KÖY' : 'MAHALLE',
          'Toplam Hane': group.length,
          'İmzalı Hane': mImzali,
          'Tamamlanan Hane': mTamamlanan,
          'Eksik Alan Hane': mEksik,
          'Bekleyen Hane': mBekleyen,
          'Hedef Kömür (Torba)': mTarget,
          'Hedef Kömür (Ton)': Number((mTarget * 0.025).toFixed(2)),
          'Dağıtılan (Torba)': mDelivered,
          'Dağıtılan (Ton)': Number((mDelivered * 0.025).toFixed(2)),
          'Kalan Kömür (Torba)': Math.max(0, mTarget - mDelivered),
          'Tamamlanma Oranı': `%${ratio}`,
        };
      });

      if (icmalRows.length > 0) {
        const totalRatio = totalHane > 0 ? Math.round((totalTamamlanan / totalHane) * 100) : 0;
        icmalRows.push({
          'Sıra': '' as any,
          'Mahalle / Köy Adı': 'GENEL TOPLAM:',
          'Yerleşim Tipi': `${sortedMahalles.length} Yerleşim`,
          'Toplam Hane': totalHane,
          'İmzalı Hane': totalImzali,
          'Tamamlanan Hane': totalTamamlanan,
          'Eksik Alan Hane': totalEksik,
          'Bekleyen Hane': totalBekleyen,
          'Hedef Kömür (Torba)': totalTargetBags,
          'Hedef Kömür (Ton)': Number((totalTargetBags * 0.025).toFixed(2)),
          'Dağıtılan (Torba)': totalDeliveredBags,
          'Dağıtılan (Ton)': Number((totalDeliveredBags * 0.025).toFixed(2)),
          'Kalan Kömür (Torba)': Math.max(0, totalTargetBags - totalDeliveredBags),
          'Tamamlanma Oranı': `%${totalRatio}`,
        });
      }

      addStyledWorksheet(
        workbook,
        'KÖMÜR YARDIMI GENEL İSTATİSTİK VE MAHALLE/KÖY İCMAL RAPORU',
        `Toplam Yerleşim: ${sortedMahalles.length} | Toplam Hane: ${totalHane} | Dağıtılan: ${totalDeliveredBags} Torba (${(totalDeliveredBags * 0.025).toFixed(2)} Ton)`,
        sanitizeSheetName('Genel İcmal Analizi', seenSheetNames),
        icmalRows,
        [
          { wch: 6 },
          { wch: 24 },
          { wch: 14 },
          { wch: 14 },
          { wch: 14 },
          { wch: 16 },
          { wch: 16 },
          { wch: 14 },
          { wch: 18 },
          { wch: 16 },
          { wch: 18 },
          { wch: 16 },
          { wch: 18 },
          { wch: 16 },
        ]
      );

      if (eksikList.length > 0) {
        const eksikRows = eksikList.map((h: any, idx: number) => {
          const target = Number(h.hedef_torba || 34);
          const given = Number(h.torba_sayisi || 0);
          return {
            'Sıra': idx + 1,
            'TC Kimlik No': h.tc_no || '-',
            'Adı Soyadı': h.ad_soyad || '-',
            'Telefon': h.telefon || '-',
            'Mahalle / Köy': h.mahalle || '-',
            'Hedef (Torba)': target,
            'Alınan (Torba)': given,
            'Kalan Eksik (Torba)': Math.max(0, target - given),
            'Teslim Eden Personel': normalizeStaffName(h.teslim_eden_personel) || h.teslim_eden_personel || '-',
            'Teslim Alan': h.teslim_alan || '-',
            'Açıklama / Not': h.teslimat_notu || h.aciklama || '-',
          };
        });

        addStyledWorksheet(
          workbook,
          'EKSİK / KISMİ KÖMÜR TESLİMATI YAPILAN HANELER LİSTESİ',
          `Toplam Eksik Kömür Alan Hane: ${eksikList.length} Hane`,
          sanitizeSheetName('Eksik Alan Haneler', seenSheetNames),
          eksikRows,
          [
            { wch: 6 },
            { wch: 16 },
            { wch: 24 },
            { wch: 16 },
            { wch: 20 },
            { wch: 14 },
            { wch: 14 },
            { wch: 18 },
            { wch: 22 },
            { wch: 20 },
            { wch: 35 },
          ]
        );
      }

      // C) Personel Dağıtım Performansı Cetveli
      const pStatsMap = new Map<string, { personel: string; tam: number; eksik: number; torba: number; sonTarih: string }>();
      for (const r of records) {
        if (r.teslimat_durumu === 'TAMAMLANDI' || r.teslimat_durumu === 'TESLIM_EDILDI' || r.teslimat_durumu === 'EKSIK') {
          const rawP = (r.teslim_eden_personel || '').trim();
          const p = normalizeStaffName(rawP) || rawP || 'Belirtilmemiş Personel';
          if (!pStatsMap.has(p)) pStatsMap.set(p, { personel: p, tam: 0, eksik: 0, torba: 0, sonTarih: '' });
          const ent = pStatsMap.get(p)!;
          if (r.teslimat_durumu === 'EKSIK') ent.eksik++; else ent.tam++;
          ent.torba += Number(r.torba_sayisi || r.hedef_torba || 34);
          if (r.teslimat_tarihi && (!ent.sonTarih || r.teslimat_tarihi > ent.sonTarih)) ent.sonTarih = r.teslimat_tarihi;
        }
      }

      const pStatsRows = Array.from(pStatsMap.values())
        .sort((a, b) => b.torba - a.torba)
        .map((p, idx) => ({
          'Sıra': idx + 1,
          'Personel Adı Soyadı': p.personel,
          'Tam Teslimat (Hane)': p.tam,
          'Eksik Teslimat (Hane)': p.eksik,
          'Toplam Teslim Edilen Hane': p.tam + p.eksik,
          'Toplam Dağıtılan Torba': p.torba,
          'Toplam Dağıtılan Ton': `${(p.torba * 0.025).toFixed(2)} Ton`,
          'Son Teslimat Tarihi': p.sonTarih || '-',
        }));

      addStyledWorksheet(
        workbook,
        'KÖMÜR YARDIMI PERSONEL DAĞITIM VE PERFORMANS CETVELİ',
        `Toplam Dağıtım Yapan Personel: ${pStatsRows.length} Kişi`,
        sanitizeSheetName('Personel Performans', seenSheetNames),
        pStatsRows,
        [
          { wch: 6 },
          { wch: 28 },
          { wch: 20 },
          { wch: 20 },
          { wch: 24 },
          { wch: 22 },
          { wch: 20 },
          { wch: 20 },
        ]
      );

      const buf = await workbook.xlsx.writeBuffer();
      const todayStr = new Date().toLocaleDateString('en-CA');
      const filename = `Edirne_SYDV_Istatistik_Raporu_${todayStr}.xlsx`;
      return buildExcelResponse(buf, filename, session, type);
    }

    return NextResponse.json({ success: false, error: 'Geçersiz export tipi' }, { status: 400 });
  } catch (error: any) {
    if (error?.digest === 'NEXT_PRERENDER_INTERRUPTED') throw error;
    return serverError('export:GET', error);
  }
}
