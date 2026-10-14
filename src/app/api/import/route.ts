import { NextRequest, NextResponse } from 'next/server';
import * as XLSX from 'xlsx';
import { getDbCollections } from '@/lib/mongodb';
import { cleanTcNo, normalizeAddress, cleanPhone, cleanTurkishText, turkishIncludes, extractPhoneNumbers, detectSettlement, extractStreetAndDoor } from '@/lib/normalizer';

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get('file') as File | null;

    if (!file) {
      return NextResponse.json({ success: false, error: 'Excel dosyası seçilmedi' }, { status: 400 });
    }

    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    // Read Excel workbook
    const workbook = XLSX.read(buffer, { type: 'buffer' });
    const sheetName = workbook.SheetNames[0];
    if (!sheetName) {
      return NextResponse.json({ success: false, error: 'Excel dosyasında sayfa bulunamadı' }, { status: 400 });
    }

    const worksheet = workbook.Sheets[sheetName];
    const rawRows: any[] = XLSX.utils.sheet_to_json(worksheet, { defval: '' });

    if (!rawRows || rawRows.length === 0) {
      return NextResponse.json({ success: false, error: 'Excel dosyasında veri satırı bulunamadı' }, { status: 400 });
    }

    const { beneficiaries: benCol, importLogs: logsCol, importBatches: batchesCol, systemSettings } = await getDbCollections();
    const batchId = `BATCH-${Date.now()}`;
    const nowStr = new Date().toLocaleString('tr-TR');

    let totalRows = 0;
    let insertedCount = 0;
    let failedCount = 0;

    const settingDoc = await systemSettings.findOne({ key: 'varsayilan_hedef_torba' });
    const defaultQuota = settingDoc ? parseInt(settingDoc.value, 10) : 34;

    // Cache existing TCs and households in memory for ultra-fast duplicate checks
    const existingList = await benCol
      .find({}, { projection: { tc_no: 1, ad_soyad: 1, norm_adres: 1, hane_no: 1 } })
      .toArray();

    const existingTcMap = new Map<string, string>();
    const existingAddressMap = new Map<string, { ad_soyad: string; tc_no: string }>();

    for (const b of existingList) {
      if (b.tc_no) existingTcMap.set(b.tc_no, b.ad_soyad || 'Bilinmiyor');
      if (b.norm_adres) {
        existingAddressMap.set(b.norm_adres, { ad_soyad: b.ad_soyad || 'Bilinmiyor', tc_no: b.tc_no || '' });
      }
      if (b.hane_no) {
        existingAddressMap.set(`HANE_${b.hane_no}`, { ad_soyad: b.ad_soyad || 'Bilinmiyor', tc_no: b.tc_no || '' });
      }
    }

    const seenTcsInBatch = new Set<string>();
    const seenAddressesInBatch = new Set<string>();

    const toInsertBeneficiaries: any[] = [];
    const toInsertLogs: any[] = [];

    for (let i = 0; i < rawRows.length; i++) {
      totalRows++;
      const row = rawRows[i];
      const rowNum = i + 2; // Excel row index

      // Helper to extract field case-insensitively
      const getField = (fieldAliases: string[]): string => {
        for (const key of Object.keys(row)) {
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

      let tcNo = cleanTcNo(getField(['tc', 'tcno', 'tckimlik', 'tckimlikno', 'kimlikno', 'tc kimlik']));
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

      // Settlement detection: Mahalle or Köy
      const rawMahalle = getField(['mahalle', 'mahalle adi', 'mah', 'mh']);
      const rawKoy = getField(['koy', 'koyu', 'koy adi', 'koyu adi', 'koy/mahalle', 'mahalle/koy', 'yerlesim', 'belde']);
      let acikAdres = getField(['adres', 'acik adres', 'acikadres', 'ikametgah']);
      const rawStreet = getField(['sokak', 'cadde', 'sokak cadde', 'cadde sokak', 'cadde/sokak', 'sokak/cadde', 'sk', 'cad', 'yol', 'mevkii', 'kume evleri', 'küme evleri', 'sok', 'bulvar', 'bulvari']);
      const haneNo = getField(['hane no', 'haneno', 'hane', 'kapi no', 'bina no', 'kapino', 'daire no']);

      // Auto-detect settlement (Mahalle vs Köy)
      const settlement = detectSettlement(rawMahalle, rawKoy, acikAdres);
      const mahalle = settlement.name; // e.g. "Cumhuriyet Mah." or "Dereköy Köyü"
      const yerlesimTipi = settlement.type; // 'MAHALLE' or 'KOY'

      if (!acikAdres && (rawStreet || haneNo)) {
        acikAdres = `${rawStreet ? rawStreet + ' ' : ''}${haneNo ? 'No: ' + haneNo : ''}`.trim();
      }

      if (!acikAdres && mahalle) {
        acikAdres = `${mahalle} No: Belirtilmemiş`;
      }

      // Auto-extract Street and Door info for natural ordering and street-level filtering
      const streetInfo = extractStreetAndDoor(acikAdres, rawStreet, haneNo, mahalle);
      const sokak = streetInfo.sokak;
      const kapiNo = streetInfo.kapiNo;
      const daireNo = streetInfo.daireNo;

      // Validation 1: TC Invalid Length
      if (!tcNo || tcNo.length !== 11) {
        failedCount++;
        toInsertLogs.push({
          batch_id: batchId,
          satir_no: rowNum,
          tc_no: tcNo || 'Eksik',
          ad_soyad: adSoyad || 'Bilinmiyor',
          telefon: displayPhoneLog,
          mahalle,
          acik_adres: acikAdres,
          hane_no: haneNo,
          hata_nedeni: 'Geçersiz veya Eksik TC Kimlik Numarası (11 haneli olmalı)',
          durum: 'HATALI',
          tarih: nowStr,
        });
        continue;
      }

      // Validation 2: Name Missing
      if (!adSoyad || adSoyad.length < 2) {
        failedCount++;
        toInsertLogs.push({
          batch_id: batchId,
          satir_no: rowNum,
          tc_no: tcNo,
          ad_soyad: adSoyad || 'Eksik',
          telefon: displayPhoneLog,
          mahalle,
          acik_adres: acikAdres,
          hane_no: haneNo,
          hata_nedeni: 'Ad Soyad bilgisi boş veya çok kısa',
          durum: 'HATALI',
          tarih: nowStr,
        });
        continue;
      }

      // Validation 3: Address Missing
      if (!mahalle && !acikAdres) {
        failedCount++;
        toInsertLogs.push({
          batch_id: batchId,
          satir_no: rowNum,
          tc_no: tcNo,
          ad_soyad: adSoyad,
          telefon: displayPhoneLog,
          mahalle,
          acik_adres: acikAdres,
          hane_no: haneNo,
          hata_nedeni: 'Mahalle veya Açık Adres bilgisi bulunamadı',
          durum: 'HATALI',
          tarih: nowStr,
        });
        continue;
      }

      // Validation 4: Duplicate TC in current file
      if (seenTcsInBatch.has(tcNo)) {
        failedCount++;
        toInsertLogs.push({
          batch_id: batchId,
          satir_no: rowNum,
          tc_no: tcNo,
          ad_soyad: adSoyad,
          telefon: displayPhoneLog,
          mahalle,
          acik_adres: acikAdres,
          hane_no: haneNo,
          hata_nedeni: 'Mükerrer TC: Yüklenen Excel dosyası içerisinde birden fazla satırda tekrarlanıyor',
          durum: 'MUKERRER_TC',
          tarih: nowStr,
        });
        continue;
      }

      // Validation 5: Duplicate TC in Database
      if (existingTcMap.has(tcNo)) {
        failedCount++;
        toInsertLogs.push({
          batch_id: batchId,
          satir_no: rowNum,
          tc_no: tcNo,
          ad_soyad: adSoyad,
          telefon: displayPhoneLog,
          mahalle,
          acik_adres: acikAdres,
          hane_no: haneNo,
          hata_nedeni: `Mükerrer TC: Sistemde zaten kayıtlı (Mevcut Kayıt: ${existingTcMap.get(tcNo)})`,
          durum: 'MUKERRER_TC',
          tarih: nowStr,
        });
        continue;
      }

      const normAdres = normalizeAddress(mahalle, acikAdres, haneNo);

      // Validation 6: Duplicate Household in current file
      if (normAdres && seenAddressesInBatch.has(normAdres)) {
        failedCount++;
        toInsertLogs.push({
          batch_id: batchId,
          satir_no: rowNum,
          tc_no: tcNo,
          ad_soyad: adSoyad,
          telefon: displayPhoneLog,
          mahalle,
          acik_adres: acikAdres,
          hane_no: haneNo,
          hata_nedeni: 'Aynı Hanede Birden Fazla Kayıt: Bu Excel dosyası içinde aynı adreste/hanede başka kişi de bulunuyor',
          durum: 'MUKERRER_HANE',
          tarih: nowStr,
        });
        continue;
      }

      // Validation 7: Duplicate Household in Database
      const existingHane =
        existingAddressMap.get(normAdres) || (haneNo ? existingAddressMap.get(`HANE_${haneNo}`) : undefined);

      if (existingHane) {
        failedCount++;
        toInsertLogs.push({
          batch_id: batchId,
          satir_no: rowNum,
          tc_no: tcNo,
          ad_soyad: adSoyad,
          telefon: displayPhoneLog,
          mahalle,
          acik_adres: acikAdres,
          hane_no: haneNo,
          hata_nedeni: `Aynı Hanede Zaten Kayıt Var: Sistemde bu adreste ikamet eden başka hak sahibi var (${existingHane.ad_soyad} - TC: ${existingHane.tc_no})`,
          durum: 'MUKERRER_HANE',
          tarih: nowStr,
        });
        continue;
      }

      // Passed all checks!
      seenTcsInBatch.add(tcNo);
      existingTcMap.set(tcNo, adSoyad);
      if (normAdres) {
        seenAddressesInBatch.add(normAdres);
        existingAddressMap.set(normAdres, { ad_soyad: adSoyad, tc_no: tcNo });
      }
      if (haneNo) {
        existingAddressMap.set(`HANE_${haneNo}`, { ad_soyad: adSoyad, tc_no: tcNo });
      }

      toInsertBeneficiaries.push({
        batch_id: batchId,
        dosya_adi: file.name,
        tc_no: tcNo,
        ad_soyad: adSoyad,
        telefon: telefon || '',
        telefon2: telefon2 || '',
        mahalle: mahalle || 'Merkez Mah.',
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
        created_at: nowStr,
        updated_at: nowStr,
      });
      insertedCount++;
    }

    // Insert batches into MongoDB
    if (toInsertBeneficiaries.length > 0) {
      await benCol.insertMany(toInsertBeneficiaries);
    }
    if (toInsertLogs.length > 0) {
      await logsCol.insertMany(toInsertLogs);
    }

    // Record batch metadata in import_batches
    await batchesCol.insertOne({
      batch_id: batchId,
      dosya_adi: file.name,
      dosya_boyutu: file.size,
      toplam_satir: totalRows,
      eklenen_kisi: insertedCount,
      hatali_kisi: failedCount,
      created_at: nowStr,
      tarih_iso: new Date().toISOString(),
    });

    return NextResponse.json({
      success: true,
      batchId,
      totalRows,
      insertedCount,
      failedCount,
      message: `${totalRows} satırdan ${insertedCount} hak sahibi başarıyla sisteme aktarıldı. ${failedCount} kayıt sorunlu/mükerrer olduğundan elendi.`,
    });
  } catch (error: any) {
    console.error('Error processing Excel import:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
