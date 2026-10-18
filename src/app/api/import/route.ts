import { NextRequest, NextResponse } from 'next/server';
import ExcelJS from 'exceljs';
import { getDbCollections, recordActivityLog, mapDocs, touchSyncPulse } from '@/lib/mongodb';
import { encryptBeneficiary, encryptImportLog } from '@/lib/crypto';
import { getIstanbulDate } from '@/lib/dateUtils';
import { verifySession } from '@/lib/auth';
import { 
  cleanTcNo, 
  isValidTcNo,
  normalizeAddress, 
  cleanPhone, 
  cleanTurkishText, 
  turkishIncludes, 
  extractPhoneNumbers, 
  detectSettlement, 
  extractStreetAndDoor,
  cleanHaneNo,
  cleanHaneKey,
  formatDeliveryStatusSummary,
  normalizeMahalleName
} from '@/lib/normalizer';

interface ExistingRecordInfo {
  ad_soyad: string;
  tc_no: string;
  hane_no?: string | null;
  mahalle?: string;
  acik_adres?: string;
  teslimat_durumu: string;
  torba_sayisi: number;
  hedef_torba: number;
  teslimat_tarihi?: string | null;
  teslim_alan?: string | null;
  teslim_eden_personel?: string | null;
  hasValidTc?: boolean;
}

interface BatchRecordInfo {
  rowNum: number;
  ad_soyad: string;
  tc_no: string;
  hane_no?: string | null;
  mahalle?: string;
  acik_adres?: string;
  hasValidTc?: boolean;
}

export async function POST(request: NextRequest) {
  try {
    const session = await verifySession(request, { requiredRole: 'ADMIN' });
    if (!session.valid) {
      return session.response || NextResponse.json(
        { success: false, error: 'Yetkisiz erişim! Excel aktarımı ve yükleme işlemleri sadece Yönetici (Admin) yetkisiyle yapılabilir.' },
        { status: 401 }
      );
    }

    const formData = await request.formData();
    const file = formData.get('file') as File | null;
    const listeTuru = (formData.get('listeTuru') as string) || 'STANDART';

    if (!file) {
      return NextResponse.json({ success: false, error: 'Excel dosyası seçilmedi' }, { status: 400 });
    }

    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    // Read Excel workbook with ExcelJS (supports single-sheet and multi-sheet workbooks)
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(buffer as any);
    if (!workbook.worksheets || workbook.worksheets.length === 0) {
      return NextResponse.json({ success: false, error: 'Excel dosyasında sayfa bulunamadı' }, { status: 400 });
    }

    const rawRows: any[] = [];
    const totalSheets = workbook.worksheets.length;
    const headerKeywords = ['tc', 'kimlik', 'adsoyad', 'adisoyadi', 'isim', 'mahalle', 'adres', 'telefon', 'tel', 'hane'];

    for (const worksheet of workbook.worksheets) {
      const sheetTitle = (worksheet.name || '').trim();
      // If workbook has multiple sheets, skip pure summary/icmal sheets
      if (
        totalSheets > 1 &&
        /^(genel\s*icmal|ozet\s*icmal|donem\s*icmali|icmal\s*cetveli)/i.test(cleanTurkishText(sheetTitle))
      ) {
        continue;
      }

      // Auto-detect header row within rows 1..10 (handles institutional 5-row banners)
      let headerRowIndex = 1;
      let bestMatchScore = 0;
      const maxScanRow = Math.min(10, worksheet.rowCount || 1);

      for (let r = 1; r <= maxScanRow; r++) {
        const candidateRow = worksheet.getRow(r);
        let score = 0;
        candidateRow.eachCell({ includeEmpty: false }, (cell) => {
          let val = cell.value;
          if (val !== null && typeof val === 'object') {
            if ('text' in val) val = (val as any).text;
            else if ('result' in val) val = (val as any).result;
          }
          const cleanCell = cleanTurkishText(String(val || '')).replace(/[^a-z0-9]/g, '');
          if (cleanCell && cleanCell.length <= 30) {
            if (headerKeywords.some((kw) => cleanCell === kw || cleanCell.includes(kw))) {
              score++;
            }
          }
        });
        if (score > bestMatchScore) {
          bestMatchScore = score;
          headerRowIndex = r;
        }
      }

      const headerRow = worksheet.getRow(headerRowIndex);
      const headers: Record<number, string> = {};
      headerRow.eachCell({ includeEmpty: true }, (cell, colNumber) => {
        let val = cell.value;
        if (val !== null && typeof val === 'object') {
          if ('text' in val) val = (val as any).text;
          else if ('result' in val) val = (val as any).result;
        }
        headers[colNumber] = String(val || '').trim();
      });

      worksheet.eachRow((row, rowNumber) => {
        if (rowNumber <= headerRowIndex) return;
        const rowObj: Record<string, any> = {
          __sheetName: sheetTitle,
          __rowNum: rowNumber,
        };
        let hasData = false;
        let isSummaryFooter = false;

        row.eachCell({ includeEmpty: true }, (cell, colNumber) => {
          const header = headers[colNumber];
          if (header) {
            let cellVal = cell.value;
            if (cellVal !== null && typeof cellVal === 'object') {
              if ('text' in cellVal) cellVal = (cellVal as any).text;
              else if ('result' in cellVal) cellVal = (cellVal as any).result;
            }
            const strVal = cellVal !== undefined && cellVal !== null ? String(cellVal).trim() : '';
            if (/^(TOPLAM|GENEL TOPLAM)\s*:/i.test(strVal)) {
              isSummaryFooter = true;
            }
            rowObj[header] = strVal;
            if (strVal) hasData = true;
          }
        });

        if (hasData && !isSummaryFooter) {
          rawRows.push(rowObj);
        }
      });
    }

    if (rawRows.length === 0) {
      return NextResponse.json({ success: false, error: 'Excel dosyasında veri satırı bulunamadı' }, { status: 400 });
    }

    const { beneficiaries: benCol, importLogs: logsCol, importBatches: batchesCol, systemSettings } = await getDbCollections();
    const { nowIso, nowLocaleTr } = getIstanbulDate();
    const batchId = `BATCH-${Date.now()}`;
    const nowStr = nowLocaleTr;

    let totalRows = 0;
    let insertedCount = 0;
    let elenenCount = 0;
    let uyariliCount = 0;

    const settingDoc = await systemSettings.findOne({ key: 'varsayilan_hedef_torba' });
    const defaultQuota = settingDoc ? parseInt(settingDoc.value, 10) : 34;

    // Cache existing TCs, Hanes, and Addresses with their Coal Delivery Status (Transparently Decrypted)
    const rawExistingList = await benCol.find({}).toArray();
    const existingList = mapDocs(rawExistingList);

    // Check which neighborhoods already have records in DB and determine their highest ek_liste_no
    const existingMahalleEkMap = new Map<string, { maxEkNo: number; hasRecords: boolean }>();
    for (const b of existingList) {
      const rawM = b.mahalle ? b.mahalle.trim() : '';
      if (!rawM) continue;
      const m = normalizeMahalleName(rawM);
      if (!existingMahalleEkMap.has(m)) {
        existingMahalleEkMap.set(m, { maxEkNo: 0, hasRecords: true });
      }
      const curr = existingMahalleEkMap.get(m)!;
      let ekNo = typeof b.ek_liste_no === 'number' ? b.ek_liste_no : 0;
      if (!ekNo && b.sira_no && typeof b.sira_no === 'string') {
        const match = b.sira_no.match(/^Ek\s*(\d+)/i);
        if (match) ekNo = parseInt(match[1], 10);
      }
      if (ekNo > curr.maxEkNo) {
        curr.maxEkNo = ekNo;
      }
    }

    // Sigortalılar listesi için mahalle bazında önceden kayıtlı kişi sayısını tespit et
    const existingMahalleSigortaliCountMap = new Map<string, number>();
    for (const b of existingList) {
      const rawM = b.mahalle ? b.mahalle.trim() : '';
      if (!rawM) continue;
      const m = normalizeMahalleName(rawM);
      const isSig =
        b.liste_turu === 'SIGORTALI' ||
        b.ek_liste_adi === 'Sigortalılar Listesi' ||
        b.ek_liste_adi === 'Sigortalı Listesi' ||
        (b.sira_no && typeof b.sira_no === 'string' && /^(sigortal[ıi]|sigortali)/i.test(b.sira_no.trim())) ||
        b.ek_liste_no === 1000 ||
        b.ek_liste_no === -1;
      if (isSig) {
        existingMahalleSigortaliCountMap.set(m, (existingMahalleSigortaliCountMap.get(m) || 0) + 1);
      }
    }

    const mahalleCounters = new Map<string, number>();

    const existingTcMap = new Map<string, ExistingRecordInfo>();
    const existingHaneMap = new Map<string, ExistingRecordInfo>();
    const existingAddressMap = new Map<string, ExistingRecordInfo[]>();

    for (const b of existingList) {
      const hasValidTc = Boolean(b.tc_no && b.tc_no.length === 11 && !b.tc_no.startsWith('EKSİK_TC'));
      const info: ExistingRecordInfo = {
        ad_soyad: b.ad_soyad || 'Bilinmiyor',
        tc_no: b.tc_no || '',
        hane_no: b.hane_no || null,
        mahalle: b.mahalle || '',
        acik_adres: b.acik_adres || '',
        teslimat_durumu: b.teslimat_durumu || 'BEKLIYOR',
        torba_sayisi: Number(b.torba_sayisi || 0),
        hedef_torba: Number(b.hedef_torba || defaultQuota),
        teslimat_tarihi: b.teslimat_tarihi || null,
        teslim_alan: b.teslim_alan || null,
        teslim_eden_personel: b.teslim_eden_personel || null,
        hasValidTc,
      };

      if (b.tc_no && hasValidTc) {
        existingTcMap.set(b.tc_no, info);
      }

      if (b.hane_no) {
        const cleanH = cleanHaneKey(b.hane_no);
        if (cleanH) {
          existingHaneMap.set(cleanH, info);
        }
      }

      if (b.norm_adres) {
        if (!existingAddressMap.has(b.norm_adres)) {
          existingAddressMap.set(b.norm_adres, []);
        }
        existingAddressMap.get(b.norm_adres)!.push(info);
      }

      if (b.mahalle && b.acik_adres) {
        const physicalNorm = normalizeAddress(b.mahalle, b.acik_adres);
        if (physicalNorm && physicalNorm !== b.norm_adres && physicalNorm.length > 5) {
          if (!existingAddressMap.has(physicalNorm)) {
            existingAddressMap.set(physicalNorm, []);
          }
          existingAddressMap.get(physicalNorm)!.push(info);
        }
      }
    }

    const seenTcsInBatch = new Map<string, BatchRecordInfo>();
    const seenHanesInBatch = new Map<string, BatchRecordInfo>();
    const seenAddressesInBatch = new Map<string, BatchRecordInfo[]>();

    const toInsertBeneficiaries: any[] = [];
    const toInsertLogs: any[] = [];

    for (let i = 0; i < rawRows.length; i++) {
      totalRows++;
      const row = rawRows[i];
      const rowNum = row.__rowNum || (i + 2); // Excel row index
      const sheetName = String(row.__sheetName || '').trim();

      // Helper to extract field case-insensitively
      const getField = (fieldAliases: string[]): string => {
        for (const key of Object.keys(row)) {
          if (key.startsWith('__')) continue;
          const cleanKey = cleanTurkishText(key).replace(/[^a-z0-9]/g, '');
          for (const alias of fieldAliases) {
            const cleanAlias = cleanTurkishText(alias).replace(/[^a-z0-9]/g, '');
            if (cleanKey === cleanAlias || cleanKey.includes(cleanAlias)) {
              return row[key] !== undefined && row[key] !== null ? String(row[key]).trim() : '';
            }
          }
        }
        return '';
      };

      let tcNo = cleanTcNo(getField(['tc', 'tcno', 'tckimlik', 'tckimlikno', 'kimlikno', 'tc kimlik', 'tc no', 't.c.', 't.c', 'kimlik']));
      let adSoyad = getField(['ad soyad', 'adi soyadi', 'isim soyisim', 'adsoyad', 'ad', 'isim']);
      const soyad = getField(['soyad', 'soyadi']);
      if (soyad && !turkishIncludes(adSoyad, soyad)) {
        adSoyad = `${adSoyad} ${soyad}`.trim();
      }

      // Check both primary phone column and secondary phone column
      const rawPhone1 = getField(['telefon', 'tel', 'gsm', 'cep', 'cep telefonu', 'iletisim', 'telefon 1', 'tel 1', '1 telefon']);
      const rawPhone2 = getField(['telefon 2', 'tel 2', 'telefon2', 'tel2', 'gsm 2', 'gsm2', 'cep 2', 'cep2', 'ikinci telefon', '2 telefon', 'yedek tel', 'yedek telefon', 'es tel', 'es telefonu', 'iletisim 2', 'diger telefon', 'diger tel']);

      // Parse both numbers whether in separate columns or delimited in a single column
      const phones = extractPhoneNumbers(rawPhone1, rawPhone2);
      const telefon = phones[0] || '';
      const telefon2 = phones[1] || '';
      const displayPhoneLog = phones.length > 1 ? phones.join(' / ') : telefon;

      // Settlement detection: Mahalle or Köy (fallback to sheet name on multi-sheet workbooks)
      let rawMahalle = getField(['mahalle', 'mahalle adi', 'mah', 'mh']);
      const rawKoy = getField(['koy', 'koyu', 'koy adi', 'koyu adi', 'koy/mahalle', 'mahalle/koy', 'yerlesim', 'belde']);
      if (
        !rawMahalle &&
        !rawKoy &&
        sheetName &&
        !/^(sayfa\s*\d*|sheet\s*\d*|hak\s*sahipleri|genel\s*liste|liste|tablo\s*\d*)$/i.test(cleanTurkishText(sheetName))
      ) {
        rawMahalle = sheetName;
      }
      let acikAdres = getField(['adres', 'acik adres', 'acikadres', 'ikametgah']);
      const rawStreet = getField(['sokak', 'cadde', 'sokak cadde', 'cadde sokak', 'cadde/sokak', 'sokak/cadde', 'sk', 'cad', 'yol', 'mevkii', 'kume evleri', 'küme evleri', 'sok', 'bulvar', 'bulvari']);
      
      // Hane No vs Door No
      const explicitHaneNo = getField(['hane no', 'haneno', 'hane', 'hane numarasi', 'hane no / sira no', 'hane sira no', 'hane id', 'dosya no', 'aile no']);
      const rawKapiNo = getField(['kapi no', 'kapino', 'bina no', 'dis kapi no', 'dis kapi']);
      const rawDaireNo = getField(['daire no', 'daire', 'ic kapi', 'ic kapi no', 'daireno', 'kat']);

      const haneNo = cleanHaneNo(explicitHaneNo);
      const cleanHane = cleanHaneKey(haneNo);

      // Auto-detect settlement (Mahalle vs Köy)
      const settlement = detectSettlement(rawMahalle, rawKoy, acikAdres);
      const mahalle = settlement.name; // e.g. "Cumhuriyet Mah." or "Dereköy Köyü"
      const yerlesimTipi = settlement.type; // 'MAHALLE' or 'KOY'

      if (!acikAdres && (rawStreet || rawKapiNo)) {
        acikAdres = `${rawStreet ? rawStreet + ' ' : ''}${rawKapiNo ? 'No: ' + rawKapiNo : ''}`.trim();
      }

      if (!acikAdres && mahalle) {
        acikAdres = `${mahalle} No: Belirtilmemiş`;
      }

      // Auto-extract Street and Door info for natural ordering and street-level filtering
      const streetInfo = extractStreetAndDoor(acikAdres, rawStreet, rawKapiNo, mahalle);
      const sokak = streetInfo.sokak;
      const kapiNo = streetInfo.kapiNo;
      let daireNo = streetInfo.daireNo;
      if (daireNo === 0 && rawDaireNo) {
        const parsedDaire = parseInt(rawDaireNo.replace(/[^0-9]/g, ''), 10);
        if (!isNaN(parsedDaire) && parsedDaire > 0) daireNo = parsedDaire;
      }

      // Collect warnings for missing data without skipping the row
      const rowWarnings: string[] = [];

      // Check 1: TC Kimlik (11 digits + official Turkish Republic algorithmic checksum)
      const hasValidTc = Boolean(tcNo && tcNo.length === 11);
      const hasAlgorithmicValidTc = hasValidTc && isValidTcNo(tcNo);
      if (!hasValidTc) {
        uyariliCount++;
        toInsertLogs.push({
          batch_id: batchId,
          satir_no: rowNum,
          tc_no: tcNo || 'Eksik',
          ad_soyad: adSoyad || 'Bilinmiyor',
          telefon: displayPhoneLog,
          mahalle: mahalle || 'Adres Eksik',
          acik_adres: acikAdres || 'Adres Eksik',
          hane_no: haneNo || null,
          hata_nedeni: 'Geçersiz veya Eksik TC Kimlik Numarası (Kayıt Geçici TC ile Sisteme Eklendi)',
          durum: 'HATALI',
          islem_sonucu: 'EKLENDİ_UYARILI',
          teslimat_durumu: 'BEKLIYOR',
          torba_sayisi: 0,
          hedef_torba: defaultQuota,
          teslimat_tarihi: null,
          teslim_alan: null,
          teslimat_durumu_ozeti: 'BEKLİYOR - Henüz Dağıtıma Çıkmadı',
          tarih: nowStr,
        });
        rowWarnings.push('TC Kimlik Eksik/Geçersiz');
        // Assign a unique placeholder so database indexing never collides
        if (!tcNo || tcNo.length !== 11) {
          tcNo = `EKSİK_TC_${batchId.slice(-4)}_${i + 2}`;
        }
      } else if (!hasAlgorithmicValidTc) {
        uyariliCount++;
        toInsertLogs.push({
          batch_id: batchId,
          satir_no: rowNum,
          tc_no: tcNo,
          ad_soyad: adSoyad || 'Bilinmiyor',
          telefon: displayPhoneLog,
          mahalle: mahalle || 'Adres Eksik',
          acik_adres: acikAdres || 'Adres Eksik',
          hane_no: haneNo || null,
          hata_nedeni: 'TC Kimlik Numarası Algoritmik Doğrulamadan Geçemedi (Kontrol Basamağı Hatalı - Kayıt Uyarılı Olarak Eklendi)',
          durum: 'HATALI',
          islem_sonucu: 'EKLENDİ_UYARILI',
          teslimat_durumu: 'BEKLIYOR',
          torba_sayisi: 0,
          hedef_torba: defaultQuota,
          teslimat_tarihi: null,
          teslim_alan: null,
          teslimat_durumu_ozeti: 'BEKLİYOR - Henüz Dağıtıma Çıkmadı',
          tarih: nowStr,
        });
        rowWarnings.push('TC Kimlik Algoritmik Kontrol Hatası');
      }

      // Check 2: Name Missing (skip only if entire row is empty/corrupted)
      if (!adSoyad || adSoyad.length < 2) {
        if (!hasValidTc && !acikAdres && !rawMahalle && !rawStreet && !haneNo) {
          // Completely blank row in Excel, skip safely
          continue;
        }
        adSoyad = adSoyad || 'İsimsiz Hak Sahibi';
        rowWarnings.push('İsim Bilgisi Eksik');
      }

      // Check 3: Address Missing (still insert into system, record warning)
      if (!mahalle && !acikAdres) {
        uyariliCount++;
        toInsertLogs.push({
          batch_id: batchId,
          satir_no: rowNum,
          tc_no: tcNo,
          ad_soyad: adSoyad,
          telefon: displayPhoneLog,
          mahalle: 'Adres Belirtilmedi',
          acik_adres: 'Açık Adres Belirtilmedi',
          hane_no: haneNo || null,
          hata_nedeni: 'Mahalle veya Açık Adres Bilgisi Eksik (Kayıt Sisteme Eklendi)',
          durum: 'HATALI',
          islem_sonucu: 'EKLENDİ_UYARILI',
          teslimat_durumu: 'BEKLIYOR',
          torba_sayisi: 0,
          hedef_torba: defaultQuota,
          teslimat_tarihi: null,
          teslim_alan: null,
          teslimat_durumu_ozeti: 'BEKLİYOR - Henüz Dağıtıma Çıkmadı',
          tarih: nowStr,
        });
        rowWarnings.push('Adres Bilgisi Eksik');
      }

      // Check 4: Phone Missing (still insert into system, record warning)
      if (!telefon && !telefon2) {
        uyariliCount++;
        toInsertLogs.push({
          batch_id: batchId,
          satir_no: rowNum,
          tc_no: tcNo,
          ad_soyad: adSoyad,
          telefon: 'Eksik',
          mahalle: mahalle || 'Genel (Belirtilmemiş)',
          acik_adres: acikAdres || 'Belirtilmedi',
          hane_no: haneNo || null,
          hata_nedeni: 'Telefon Numarası Eksik (Kayıt Sisteme Eklendi)',
          durum: 'HATALI',
          islem_sonucu: 'EKLENDİ_UYARILI',
          teslimat_durumu: 'BEKLIYOR',
          torba_sayisi: 0,
          hedef_torba: defaultQuota,
          teslimat_tarihi: null,
          teslim_alan: null,
          teslimat_durumu_ozeti: 'BEKLİYOR - Henüz Dağıtıma Çıkmadı',
          tarih: nowStr,
        });
        rowWarnings.push('Telefon Numarası Eksik');
      }

      // ==========================================
      // CHECK 5: AYNI TC KİMLİK NUMARALI KAYIT KONTROLÜ
      // ==========================================

      // 5A: Yüklenen Excel dosyası içerisinde (Aynı batch'te) tekrarlanan TC
      if (hasValidTc && seenTcsInBatch.has(tcNo)) {
        elenenCount++;
        const prev = seenTcsInBatch.get(tcNo)!;
        toInsertLogs.push({
          batch_id: batchId,
          satir_no: rowNum,
          tc_no: tcNo,
          ad_soyad: adSoyad,
          telefon: displayPhoneLog,
          mahalle: mahalle || 'Genel (Belirtilmemiş)',
          acik_adres: acikAdres || 'Belirtilmedi',
          hane_no: haneNo || null,
          hata_nedeni: `Mükerrer TC: Yüklenen Excel dosyası içerisinde aynı TC kimlik numarası (${tcNo}) birden fazla satırda tekrarlanıyor. Önceki Satır #${prev.rowNum}: ${prev.ad_soyad} | Kömür Teslim Durumu: BEKLİYOR (Henüz Dağıtıma Çıkmadı). Kayıt sisteme eklenmedi ve elendi.`,
          durum: 'MUKERRER_TC',
          islem_sonucu: 'EKLENMEDİ',
          teslimat_durumu: 'BEKLIYOR',
          torba_sayisi: 0,
          hedef_torba: defaultQuota,
          teslimat_tarihi: null,
          teslim_alan: null,
          teslimat_durumu_ozeti: 'BEKLİYOR - Henüz Dağıtıma Çıkmadı (Aynı Dosyada Yeni Yüklenen Satır)',
          cakisan_ad_soyad: prev.ad_soyad,
          cakisan_tc: prev.tc_no,
          cakisan_satir: prev.rowNum,
          tarih: nowStr,
        });
        continue;
      }

      // 5B: Sistemde (Veritabanında) Zaten Kayıtlı Olan TC
      if (hasValidTc && existingTcMap.has(tcNo)) {
        elenenCount++;
        const existing = existingTcMap.get(tcNo)!;
        const statusSummary = formatDeliveryStatusSummary(existing);
        toInsertLogs.push({
          batch_id: batchId,
          satir_no: rowNum,
          tc_no: tcNo,
          ad_soyad: adSoyad,
          telefon: displayPhoneLog,
          mahalle: mahalle || existing.mahalle || 'Genel (Belirtilmemiş)',
          acik_adres: acikAdres || existing.acik_adres || 'Belirtilmedi',
          hane_no: haneNo || existing.hane_no || null,
          hata_nedeni: `Mükerrer TC: Sistemde bu TC kimlik numarası (${tcNo}) ile kayıtlı hak sahibi zaten mevcuttur. [Mevcut Hak Sahibi: ${existing.ad_soyad} - Hane No: ${existing.hane_no || 'Belirtilmemiş'}] | Kömür Teslim Durumu: ${statusSummary}. Kayıt sisteme eklenmedi ve elendi.`,
          durum: 'MUKERRER_TC',
          islem_sonucu: 'EKLENMEDİ',
          teslimat_durumu: existing.teslimat_durumu || 'BEKLIYOR',
          torba_sayisi: existing.torba_sayisi || 0,
          hedef_torba: existing.hedef_torba || defaultQuota,
          teslimat_tarihi: existing.teslimat_tarihi || null,
          teslim_alan: existing.teslim_alan || null,
          teslimat_durumu_ozeti: statusSummary,
          cakisan_ad_soyad: existing.ad_soyad,
          cakisan_tc: existing.tc_no,
          cakisan_hane_no: existing.hane_no || null,
          tarih: nowStr,
        });
        continue;
      }

      // ==========================================
      // CHECK 6 & 7: AYNI ADRES VE HANE KONTROLÜ
      // ==========================================
      // CHECK 6: AYNI HANE NUMARASI KONTROLÜ
      // KURAL: Hane numarası sistemde TC kimlik gibi yalnızca BİR ADET olabilir.
      // Aynı hane numarası ikinci kez gelirse sisteme eklenmez ve elenir!
      // ==========================================

      // 6A: Yüklenen Excel dosyası içerisinde (Aynı batch'te) tekrarlanan hane numarası
      if (cleanHane && seenHanesInBatch.has(cleanHane)) {
        elenenCount++;
        const prev = seenHanesInBatch.get(cleanHane)!;
        toInsertLogs.push({
          batch_id: batchId,
          satir_no: rowNum,
          tc_no: tcNo || 'Eksik',
          ad_soyad: adSoyad,
          telefon: displayPhoneLog,
          mahalle: mahalle || 'Genel (Belirtilmemiş)',
          acik_adres: acikAdres || 'Belirtilmedi',
          hane_no: haneNo,
          hata_nedeni: `Mükerrer Hane Numarası: Yüklenen Excel dosyası içerisinde aynı hane numarası (Hane No: ${haneNo}) birden fazla satırda tekrarlanıyor. Sistemde her hane numarası TC kimlik gibi yalnızca 1 adet bulunabilir. [Önceki Satır #${prev.rowNum}: ${prev.ad_soyad} - TC: ${prev.tc_no} | Kömür Teslim Durumu: BEKLİYOR]. Aynı haneye mükerrer kömür yardımı tahsis edilmemesi için bu kayıt sisteme eklenmedi ve elendi.`,
          durum: 'MUKERRER_HANE',
          islem_sonucu: 'EKLENMEDİ',
          teslimat_durumu: 'BEKLIYOR',
          torba_sayisi: 0,
          hedef_torba: defaultQuota,
          teslimat_tarihi: null,
          teslim_alan: null,
          teslimat_durumu_ozeti: 'BEKLİYOR - Henüz Dağıtıma Çıkmadı (Aynı Dosyada Yeni Yüklenen Satır)',
          cakisan_ad_soyad: prev.ad_soyad,
          cakisan_tc: prev.tc_no,
          cakisan_satir: prev.rowNum,
          cakisan_hane_no: haneNo,
          tarih: nowStr,
        });
        continue;
      }

      // 6B: Sistemde (Veritabanında) Zaten Kayıtlı Olan Hane Numarası
      if (cleanHane && existingHaneMap.has(cleanHane)) {
        elenenCount++;
        const existing = existingHaneMap.get(cleanHane)!;
        const statusSummary = formatDeliveryStatusSummary(existing);
        toInsertLogs.push({
          batch_id: batchId,
          satir_no: rowNum,
          tc_no: tcNo || 'Eksik',
          ad_soyad: adSoyad,
          telefon: displayPhoneLog,
          mahalle: mahalle || existing.mahalle || 'Genel (Belirtilmemiş)',
          acik_adres: acikAdres || existing.acik_adres || 'Belirtilmedi',
          hane_no: haneNo,
          hata_nedeni: `Mükerrer Hane Numarası: Sistemde bu hane numarası (Hane No: ${haneNo}) ile kayıtlı hane zaten mevcuttur. Sistemde her hane numarası TC kimlik gibi yalnızca 1 adet bulunabilir. [Mevcut Hak Sahibi: ${existing.ad_soyad} - TC: ${existing.tc_no} | Mahalle: ${existing.mahalle || '-'}] | Kömür Teslim Durumu: ${statusSummary}. Aynı haneye mükerrer kömür yardımı tahsis edilmemesi için bu kayıt sisteme eklenmedi ve elendi.`,
          durum: 'MUKERRER_HANE',
          islem_sonucu: 'EKLENMEDİ',
          teslimat_durumu: existing.teslimat_durumu || 'BEKLIYOR',
          torba_sayisi: existing.torba_sayisi || 0,
          hedef_torba: existing.hedef_torba || defaultQuota,
          teslimat_tarihi: existing.teslimat_tarihi || null,
          teslim_alan: existing.teslim_alan || null,
          teslimat_durumu_ozeti: statusSummary,
          cakisan_ad_soyad: existing.ad_soyad,
          cakisan_tc: existing.tc_no,
          cakisan_hane_no: existing.hane_no || haneNo,
          tarih: nowStr,
        });
        continue;
      }

      // ==========================================
      // CHECK 7: AYNI FİZİKSEL ADRES KONTROLÜ
      // KURAL: Aynı adreste farklı TC kimlik ve farklı hane no var ise sisteme eklenir.
      // Sadece aynı TC (Check 5), aynı hane no (Check 6) veya TC'siz mükerrer aynı isim varsa elenir.
      // ==========================================
      const normAdres = normalizeAddress(mahalle || '', acikAdres || 'Adres Belirtilmedi');

      const batchAddressMatches: BatchRecordInfo[] = [];
      if (normAdres && normAdres.length > 5 && seenAddressesInBatch.has(normAdres)) {
        batchAddressMatches.push(...seenAddressesInBatch.get(normAdres)!);
      }

      const dbAddressMatches: ExistingRecordInfo[] = [];
      if (normAdres && normAdres.length > 5 && existingAddressMap.has(normAdres)) {
        dbAddressMatches.push(...existingAddressMap.get(normAdres)!);
      }

      const cleanCurrentName = cleanTurkishText(adSoyad).replace(/[^a-z0-9]/g, '');

      // 7A: Sadece TC eksik/geçersiz olduğunda ve aynı adreste aynı isim varsa mükerrer kabul edilir.
      // Eğer geçerli bir TC kimlik numarası varsa, isim aynı olsa dahi farklı birey kabul edilir ve sisteme eklenir!
      if (!hasValidTc) {
        const duplicateNameInBatch = batchAddressMatches.find(prev => {
          const cleanPrevName = cleanTurkishText(prev.ad_soyad).replace(/[^a-z0-9]/g, '');
          return cleanCurrentName && cleanPrevName && cleanCurrentName === cleanPrevName;
        });

        if (duplicateNameInBatch) {
          elenenCount++;
          toInsertLogs.push({
            batch_id: batchId,
            satir_no: rowNum,
            tc_no: tcNo || 'Eksik',
            ad_soyad: adSoyad,
            telefon: displayPhoneLog,
            mahalle: mahalle || 'Genel (Belirtilmemiş)',
            acik_adres: acikAdres || 'Belirtilmedi',
            hane_no: haneNo || null,
            hata_nedeni: `Mükerrer Kayıt (Eksik TC): Yüklenen Excel dosyası içerisinde aynı adreste aynı isimle (${adSoyad}) kayıt tekrarlanıyor ve satırda geçerli bir TC bulunmadığından mükerrer kabul edildi (Önceki Satır #${duplicateNameInBatch.rowNum}). Mükerrer kayıt oluşturulmaması için bu satır sisteme eklenmedi ve elendi.`,
            durum: 'MUKERRER_HANE',
            islem_sonucu: 'EKLENMEDİ',
            teslimat_durumu: 'BEKLIYOR',
            torba_sayisi: 0,
            hedef_torba: defaultQuota,
            teslimat_tarihi: null,
            teslim_alan: null,
            teslimat_durumu_ozeti: 'BEKLİYOR - Henüz Dağıtıma Çıkmadı (Aynı Dosyada Yeni Yüklenen Satır)',
            cakisan_ad_soyad: duplicateNameInBatch.ad_soyad,
            cakisan_tc: duplicateNameInBatch.tc_no,
            cakisan_satir: duplicateNameInBatch.rowNum,
            tarih: nowStr,
          });
          continue;
        }

        // 7B: Veritabanında aynı adreste aynı isimle ve eksik TC ile mükerrer kayıt kontrolü
        const duplicateNameInDb = dbAddressMatches.find(existing => {
          const cleanDbName = cleanTurkishText(existing.ad_soyad).replace(/[^a-z0-9]/g, '');
          return cleanCurrentName && cleanDbName && cleanCurrentName === cleanDbName;
        });

        if (duplicateNameInDb) {
          elenenCount++;
          const statusSummary = formatDeliveryStatusSummary(duplicateNameInDb);
          toInsertLogs.push({
            batch_id: batchId,
            satir_no: rowNum,
            tc_no: tcNo || 'Eksik',
            ad_soyad: adSoyad,
            telefon: displayPhoneLog,
            mahalle: mahalle || duplicateNameInDb.mahalle || 'Genel (Belirtilmemiş)',
            acik_adres: acikAdres || duplicateNameInDb.acik_adres || 'Belirtilmedi',
            hane_no: haneNo || null,
            hata_nedeni: `Mükerrer Kayıt (Eksik TC): Sistemde bu adreste aynı isimle (${duplicateNameInDb.ad_soyad}) hak sahibi zaten mevcuttur ve bu satırda geçerli bir TC bulunmadığından mükerrer kabul edildi [Mevcut TC: ${duplicateNameInDb.tc_no} | Durum: ${statusSummary}]. Mükerrer kayıt oluşturulmaması için bu satır sisteme eklenmedi ve elendi.`,
            durum: 'MUKERRER_HANE',
            islem_sonucu: 'EKLENMEDİ',
            teslimat_durumu: duplicateNameInDb.teslimat_durumu || 'BEKLIYOR',
            torba_sayisi: duplicateNameInDb.torba_sayisi || 0,
            hedef_torba: duplicateNameInDb.hedef_torba || defaultQuota,
            teslimat_tarihi: duplicateNameInDb.teslimat_tarihi || null,
            teslim_alan: duplicateNameInDb.teslim_alan || null,
            teslimat_durumu_ozeti: statusSummary,
            cakisan_ad_soyad: duplicateNameInDb.ad_soyad,
            cakisan_tc: duplicateNameInDb.tc_no,
            cakisan_hane_no: duplicateNameInDb.hane_no || null,
            tarih: nowStr,
          });
          continue;
        }
      }

      // Gecekondu / müstakil yoğun bölgelerde aynı adreste birden fazla farklı aile (farklı TC Kimlik No ile)
      // ikamet edebildiğinden, farklı TC'ye sahip aynı adresli kayıtlar hata veya uyarı olarak işaretlenmez;
      // doğrudan geçerli hak sahibi olarak sisteme eklenir.

      // Passed all checks!
      const targetMahalle = mahalle || 'Genel (Belirtilmemiş)';
      const batchItem: BatchRecordInfo = {
        rowNum,
        ad_soyad: adSoyad,
        tc_no: tcNo,
        hane_no: haneNo || null,
        mahalle: targetMahalle,
        acik_adres: acikAdres || '',
        hasValidTc,
      };

      const recordInfo: ExistingRecordInfo = {
        ad_soyad: adSoyad,
        tc_no: tcNo,
        hane_no: haneNo || null,
        mahalle: targetMahalle,
        acik_adres: acikAdres || '',
        teslimat_durumu: 'BEKLIYOR',
        torba_sayisi: 0,
        hedef_torba: defaultQuota,
        teslimat_tarihi: null,
        teslim_alan: null,
        hasValidTc,
      };

      if (hasValidTc) {
        seenTcsInBatch.set(tcNo, batchItem);
        existingTcMap.set(tcNo, recordInfo);
      }
      if (cleanHane) {
        seenHanesInBatch.set(cleanHane, batchItem);
        existingHaneMap.set(cleanHane, recordInfo);
      }
      if (normAdres) {
        if (!seenAddressesInBatch.has(normAdres)) seenAddressesInBatch.set(normAdres, []);
        seenAddressesInBatch.get(normAdres)!.push(batchItem);

        if (!existingAddressMap.has(normAdres)) existingAddressMap.set(normAdres, []);
        existingAddressMap.get(normAdres)!.push(recordInfo);
      }

      // Mahalle bazında sıra numarası belirleme (Her mahalle kendi içinde 1'den başlar; önceden kayıt varsa Ek1 - 1, Ek1 - 2...)
      const counter = (mahalleCounters.get(targetMahalle) || 0) + 1;
      mahalleCounters.set(targetMahalle, counter);

      const existingData = existingMahalleEkMap.get(targetMahalle);
      let siraNo: string;
      let ekListeNo: number;
      let ekListeAdi: string;
      let recordListeTuru: string;

      if (listeTuru === 'SIGORTALI') {
        // Sigortalılar Listesi: Mahalle ve köye göre gruplanır, sıra no "Sigortalı - 1", "Sigortalı - 2"...
        const existingSigCount = existingMahalleSigortaliCountMap.get(targetMahalle) || 0;
        const sigSira = existingSigCount + counter;
        siraNo = `Sigortalı - ${sigSira}`;
        ekListeNo = 1000;
        ekListeAdi = 'Sigortalılar Listesi';
        recordListeTuru = 'SIGORTALI';
      } else if (listeTuru === 'EK_LISTE') {
        const nextEkNo = (!existingData || !existingData.hasRecords || existingData.maxEkNo === 0) ? 1 : existingData.maxEkNo + 1;
        siraNo = `Ek${nextEkNo} - ${counter}`;
        ekListeNo = nextEkNo;
        ekListeAdi = `Ek ${nextEkNo}`;
        recordListeTuru = 'EK_LISTE';
      } else {
        // STANDART (Otomatik: ilk yükleme Ana Liste, sonraki Ek Liste)
        if (!existingData || !existingData.hasRecords) {
          siraNo = String(counter);
          ekListeNo = 0;
          ekListeAdi = 'Ana Liste';
          recordListeTuru = 'ANA_LISTE';
        } else {
          const nextEkNo = existingData.maxEkNo + 1;
          siraNo = `Ek${nextEkNo} - ${counter}`;
          ekListeNo = nextEkNo;
          ekListeAdi = `Ek ${nextEkNo}`;
          recordListeTuru = 'EK_LISTE';
        }
      }

      toInsertBeneficiaries.push({
        batch_id: batchId,
        dosya_adi: file.name,
        liste_turu: recordListeTuru,
        sira_no: siraNo,
        mahalle_sira: counter,
        ek_liste_no: ekListeNo,
        ek_liste_adi: ekListeAdi,
        tc_no: tcNo,
        ad_soyad: adSoyad,
        telefon: telefon || '',
        telefon2: telefon2 || '',
        mahalle: targetMahalle,
        yerlesim_tipi: yerlesimTipi,
        sokak: sokak,
        kapi_no: kapiNo,
        daire_no: daireNo,
        acik_adres: acikAdres || 'Adres belirtilmedi',
        hane_no: haneNo || null,
        norm_adres: normAdres,
        hedef_torba: defaultQuota,
        teslimat_durumu: 'BEKLIYOR',
        torba_sayisi: 0,
        teslimat_tarihi: null,
        teslim_alan: null,
        teslim_eden_personel: null,
        teslimat_notu: null,
        uyarilar: rowWarnings,
        uyari_notu: rowWarnings.length > 0 ? rowWarnings.join(', ') : null,
        created_at: nowStr,
        updated_at: nowStr,
      });
      insertedCount++;
    }

    // Insert batches into MongoDB (AES-256-GCM Şifreleme ve HMAC-SHA256 Kör Dizinler ile)
    if (toInsertBeneficiaries.length > 0) {
      const encryptedBeneficiaries = toInsertBeneficiaries.map(encryptBeneficiary);
      await benCol.insertMany(encryptedBeneficiaries);
    }
    if (toInsertLogs.length > 0) {
      const encryptedLogs = toInsertLogs.map(encryptImportLog);
      await logsCol.insertMany(encryptedLogs);
    }

    // Mahalle bazında yükleme özetleri (Hangi mahalleden kaç kişi, hangi liste türü ve sıra aralığıyla yüklendi)
    const mahalleOzet = Array.from(mahalleCounters.entries()).map(([m, cnt]) => {
      if (listeTuru === 'SIGORTALI') {
        const existingSigCount = existingMahalleSigortaliCountMap.get(m) || 0;
        const startNo = existingSigCount + 1;
        const endNo = existingSigCount + cnt;
        return {
          mahalle: m,
          kayit_sayisi: cnt,
          ek_liste_no: 1000,
          ek_liste_adi: 'Sigortalılar Listesi',
          liste_turu: 'SIGORTALI',
          sira_araligi: startNo === endNo ? `Sigortalı - ${startNo}` : `Sigortalı - ${startNo}'den Sigortalı - ${endNo}'ye`,
        };
      } else if (listeTuru === 'EK_LISTE') {
        const info = existingMahalleEkMap.get(m);
        const ekNo = (!info || !info.hasRecords || info.maxEkNo === 0) ? 1 : info.maxEkNo + 1;
        return {
          mahalle: m,
          kayit_sayisi: cnt,
          ek_liste_no: ekNo,
          ek_liste_adi: `Ek ${ekNo}`,
          liste_turu: 'EK_LISTE',
          sira_araligi: `Ek${ekNo} - 1'den Ek${ekNo} - ${cnt}'e`,
        };
      } else {
        const info = existingMahalleEkMap.get(m);
        const ekNo = (!info || !info.hasRecords) ? 0 : info.maxEkNo + 1;
        return {
          mahalle: m,
          kayit_sayisi: cnt,
          ek_liste_no: ekNo,
          ek_liste_adi: ekNo === 0 ? 'Ana Liste' : `Ek ${ekNo}`,
          liste_turu: ekNo === 0 ? 'ANA_LISTE' : 'EK_LISTE',
          sira_araligi: ekNo === 0 ? `1 - ${cnt}` : `Ek${ekNo} - 1'den Ek${ekNo} - ${cnt}'e`,
        };
      }
    });

    const elenenKayitlar = toInsertLogs.filter(
      l => l.islem_sonucu === 'EKLENMEDİ' || l.durum === 'MUKERRER_TC' || l.durum === 'MUKERRER_HANE'
    );
    const uyariliKayitlar = toInsertLogs.filter(
      l => l.islem_sonucu === 'EKLENDİ_UYARILI'
    );

    const listeAdiLabel =
      listeTuru === 'SIGORTALI'
        ? 'Sigortalılar Listesi'
        : listeTuru === 'EK_LISTE'
        ? 'Ek Liste'
        : 'Standart Liste';

    // Record batch metadata in import_batches
    await batchesCol.insertOne({
      batch_id: batchId,
      dosya_adi: file.name,
      dosya_boyutu: file.size,
      liste_turu: listeTuru,
      liste_adi: listeAdiLabel,
      toplam_satir: totalRows,
      eklenen_kisi: insertedCount,
      elenen_kisi: elenenKayitlar.length,
      hatali_kisi: elenenKayitlar.length,
      uyarili_kisi: uyariliKayitlar.length,
      mahalle_ozet: mahalleOzet,
      created_at: nowStr,
      tarih_iso: nowIso,
    });

    await recordActivityLog({
      kullanici_adi: session.ad_soyad || session.username || 'Sistem Yöneticisi',
      kullanici_rolu: 'ADMIN',
      islem_tipi: 'EXCEL_YUKLEME',
      baslik: `Excel Dosyası Yüklendi (${listeAdiLabel})`,
      detay: `"${file.name}" dosyasından [${listeAdiLabel}] kapsamında ${totalRows} satır işlendi: ${insertedCount} hak sahibi sisteme başarıyla aktarıldı, ${elenenKayitlar.length} mükerrer kayıt elendi.`,
      ek_bilgi: { batch_id: batchId, listeTuru, listeAdi: listeAdiLabel, totalRows, insertedCount, elenenCount: elenenKayitlar.length, uyariliCount: uyariliKayitlar.length },
    });

    const mukerrerTcCount = toInsertLogs.filter(l => l.durum === 'MUKERRER_TC').length;
    const mukerrerHaneCount = toInsertLogs.filter(l => l.durum === 'MUKERRER_HANE').length;
    const hataliCount = toInsertLogs.filter(l => l.durum === 'HATALI').length;

    // Trigger instant synchronization pulse for all clients & invalidate cache
    await touchSyncPulse('Excel Yükleme');

    return NextResponse.json({
      success: true,
      batchId,
      dosyaAdi: file.name,
      listeTuru,
      listeAdi: listeAdiLabel,
      totalRows,
      insertedCount,
      failedCount: elenenKayitlar.length,
      elenenCount: elenenKayitlar.length,
      uyariliCount: uyariliKayitlar.length,
      mukerrerTcCount,
      mukerrerHaneCount,
      hataliCount,
      mahalleOzet,
      elenenKayitlar, // Full array of eliminated records
      duplicateWarnings: elenenKayitlar, // backwards compatibility
      message: `${totalRows} satırdan ${insertedCount} hak sahibi başarıyla sisteme aktarıldı. ${elenenKayitlar.length} mükerrer kayıt elendi ve sisteme eklenmedi.`,
    });
  } catch (error: any) {
    console.error('Error processing Excel import:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
