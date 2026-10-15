import { NextRequest, NextResponse } from 'next/server';
import * as XLSX from 'xlsx';
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

      const summarySheet = createOfficialWorksheet(
        'KÖMÜR YARDIMI MAHALLE BAZLI GENEL DAĞITIM VE İCMAL CETVELİ',
        `Dosya: ${dosyaAdi} | Toplam Yerleşim: ${sortedMahalles.length} | Toplam Hane: ${totalAllHanes} | Toplam Hedef: ${totalAllTargetBags} Torba (${(totalAllTargetBags * 0.025).toFixed(2)} Ton)`,
        summaryData,
        summaryColWidths
      );

      const summarySheetName = sanitizeSheetName('Özet İcmal', seenSheetNames);
      XLSX.utils.book_append_sheet(workbook, summarySheet, summarySheetName);

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

        const mahWorksheet = createOfficialWorksheet(
          `KÖMÜR YARDIMI DAĞITIM VE İMZA ÇİZELGESİ - ${mahName.toUpperCase()}`,
          `Dosya: ${dosyaAdi} | Mahalle/Köy: ${mahName} | Hane: ${group.length} | Hedef: ${groupTarget} Torba (${(groupTarget * 0.025).toFixed(2)} Ton)`,
          sheetRows,
          mahColWidths
        );

        const safeSheetName = sanitizeSheetName(mahName, seenSheetNames);
        XLSX.utils.book_append_sheet(workbook, mahWorksheet, safeSheetName);
      }

      const buf = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });
      const downloadFilename = `Edirne_SYDV_${cleanFileBase}_Mahalle_Sekmeli.xlsx`;

      return new NextResponse(buf, {
        headers: {
          'Content-Disposition': `attachment; filename="${downloadFilename}"`,
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
