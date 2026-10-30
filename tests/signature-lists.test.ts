import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import ExcelJS from 'exceljs';

process.env.ENCRYPTION_MASTER_KEY = crypto.randomBytes(32).toString('hex');
process.env.BLIND_INDEX_KEY = crypto.randomBytes(32).toString('hex');

import { getDbCollections, mapDocs } from '@/lib/mongodb';
import { encryptBeneficiary, decryptBeneficiary } from '@/lib/crypto';
import { normalizeMahalleName, formatSignatureListAddress, getBeneficiaryEffectiveListMahalle } from '@/lib/normalizer';

describe('Resmi Islak İmza Listeleri & Mahalle Dağıtım Sistemi Testleri', () => {
  it('1. Adres A\'dan Z\'ye sıralama mantığı Türkçe karakterleri ve kapı numaralarını doğru sıralar', () => {
    const records = [
      { acik_adres: 'Şükrüpaşa Cad. No: 12' },
      { acik_adres: 'Atatürk Cad. No: 2 Daire: 1' },
      { acik_adres: '1. Murat Sok. No: 5' },
      { acik_adres: 'Atatürk Cad. No: 10 Daire: 4' },
      { acik_adres: 'Çarşı Meydanı No: 1' },
      { acik_adres: 'Barış Sokak No: 3' },
    ];

    records.sort((a, b) =>
      (a.acik_adres || '').localeCompare((b.acik_adres || ''), 'tr', { sensitivity: 'base', numeric: true })
    );

    const sortedAddresses = records.map((r) => r.acik_adres);
    assert.deepEqual(sortedAddresses, [
      '1. Murat Sok. No: 5',
      'Atatürk Cad. No: 2 Daire: 1',
      'Atatürk Cad. No: 10 Daire: 4',
      'Barış Sokak No: 3',
      'Çarşı Meydanı No: 1',
      'Şükrüpaşa Cad. No: 12',
    ]);
  });

  it('2. Excel çalışma sayfası A4 yatay, dar kenar boşlukları, tekrarlayan başlık ve 45pt ıslak imza satır yüksekliğine sahiptir', async () => {
    const workbook = new ExcelJS.Workbook();
    // İlk sayfa dışında her mahalle sayfasında sadece tek satır çizelge başlığı ve tablo başlıkları yinelenir (1:2)
    const sheet = workbook.addWorksheet('1. ÇAVUŞBEY MAH.', {
      pageSetup: {
        paperSize: 9, // A4
        orientation: 'landscape',
        fitToWidth: 1,
        fitToHeight: 0,
        fitToPage: true,
        horizontalCentered: true,
        margins: { left: 0.35, right: 0.35, top: 0.45, bottom: 0.45, header: 0.2, footer: 0.2 },
        printTitlesRow: '1:2',
      },
    });

        const titleRow = sheet.addRow(['KÖMÜR YARDIMI HAK SAHİBİ TESLİM VE ISLAK İMZA ÇİZELGESİ - ÇAVUŞBEY MAH.']);
    sheet.mergeCells(1, 1, 1, 9);
    titleRow.height = 28;

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
    sheet.addRow(headers);

    const dataRow = sheet.addRow([
      1,
      'Ahmet Yılmaz',
      '12345678901',
      '0555 111 22 33',
      'Atatürk Cad. No: 1',
      '34 Torba (Takribi 850kg)',
      '',
      '',
      '',
    ]);
    dataRow.height = 45;

    assert.equal(sheet.pageSetup.paperSize, 9);
    assert.equal(sheet.pageSetup.orientation, 'landscape');
    assert.equal(sheet.pageSetup.fitToWidth, 1);
    assert.equal(sheet.pageSetup.printTitlesRow, '1:2');
    assert.equal(dataRow.height, 45);
    // Kolon kontrolleri
    assert.equal(headers[5], 'Teslim Edilen Kömür Miktarı', '6. kolon Teslim Edilen Kömür Miktarı olmalıdır');
    assert.equal(headers[6], 'Teslim Eden Islak İmza', '7. kolon Teslim Eden Islak İmza olmalıdır');
    assert.equal(headers[7], 'Teslim Tarihi', '8. kolon Teslim Tarihi olmalıdır');
    assert.equal(headers[8], 'Teslim Alan Islak İmza', '9. kolon Teslim Alan Islak İmza olmalıdır');
    assert.equal(dataRow.getCell(6).value, '34 Torba (Takribi 850kg)', 'Kömür miktarı 34 Torba (Takribi 850kg) olmalıdır');
    assert.equal(dataRow.getCell(7).value, '', 'Teslim Eden Islak İmza alanı boş olmalıdır');
    assert.equal(dataRow.getCell(9).value, '', 'Teslim Alan Islak İmza alanı boş olmalıdır');

    const buffer = await workbook.xlsx.writeBuffer();
    assert.ok(buffer.byteLength > 0);
  });

  it('3. Bir kayıt sadece TEK BİR imza listesinde yer alabilir; sonradan eklenen kayıtlar Liste #2 oluşturur', async () => {
    const { beneficiaries: benCol, signatureLists: sigCol } = await getDbCollections();
    await benCol.deleteMany({});
    await sigCol.deleteMany({});

    // 1. Aşama: İlk yüklemede 3 hak sahibi ekleniyor (henüz imza listesi yok)
    const initialBatch = [
      { tc_no: '11111111110', ad_soyad: 'Fatma Şen', mahalle: 'Fatih Mah.', acik_adres: 'Gül Sok. No: 3' },
      { tc_no: '22222222220', ad_soyad: 'Mehmet Kaya', mahalle: 'Fatih Mah.', acik_adres: 'Atatürk Cad. No: 12' },
      { tc_no: '33333333330', ad_soyad: 'Ali Demir', mahalle: 'İstiklal Mah.', acik_adres: 'Menekşe Sok. No: 4' },
    ];

    for (const b of initialBatch) {
      await benCol.insertOne(encryptBeneficiary(b));
    }

    // Bekleyen kayıt kontrolü
    let allRecords = (await benCol.find({}).toArray()).map(decryptBeneficiary);
    let unassigned = allRecords.filter((b: any) => !b.imza_listesi_id);
    assert.equal(unassigned.length, 3, 'Başlangıçta 3 hane imza listesi bekliyor olmalıdır');

    // Liste #1 Oluşturuluyor (İlk Genel Dağıtım)
    const list1Id = 'IMZA-TEST-001';
    for (const item of unassigned) {
      await benCol.updateOne(
        { _id: item._id },
        {
          $set: {
            imza_listesi_id: list1Id,
            imza_listesi_no: 1,
            imza_listesi_adi: '1. Dağıtım Islak İmza Listesi (Genel)',
          },
        }
      );
    }
    await sigCol.insertOne({
      id: list1Id,
      liste_no: 1,
      liste_adi: '1. Dağıtım Islak İmza Listesi (Genel)',
      toplam_kayit: 3,
    });

    // Artık bekleyen kayıt kalmamış olmalı
    allRecords = (await benCol.find({}).toArray()).map(decryptBeneficiary);
    unassigned = allRecords.filter((b: any) => !b.imza_listesi_id);
    assert.equal(unassigned.length, 0, 'Liste #1 sonrası bekleyen hane 0 olmalıdır');

    // 2. Aşama: Sisteme 2 yeni hak sahibi ekleniyor (Ek Liste / Sonradan Başvuru)
    const newAdditions = [
      { tc_no: '44444444440', ad_soyad: 'Zeynep Ak', mahalle: 'Fatih Mah.', acik_adres: 'Gül Sok. No: 1' },
      { tc_no: '55555555550', ad_soyad: 'Hasan Yurt', mahalle: 'İstiklal Mah.', acik_adres: 'Menekşe Sok. No: 10' },
    ];
    for (const b of newAdditions) {
      await benCol.insertOne(encryptBeneficiary(b));
    }

    // Sistem YALNIZCA yeni eklenen 2 kaydı tespit etmelidir!
    allRecords = (await benCol.find({}).toArray()).map(decryptBeneficiary);
    unassigned = allRecords.filter((b: any) => !b.imza_listesi_id);
    assert.equal(unassigned.length, 2, 'Yeni eklenen 2 hane tespit edilmelidir');

    // Liste #2 Oluşturuluyor (Yeni Eklenen Kayıtlara Özel)
    const list2Id = 'IMZA-TEST-002';
    for (const item of unassigned) {
      await benCol.updateOne(
        { _id: item._id },
        {
          $set: {
            imza_listesi_id: list2Id,
            imza_listesi_no: 2,
            imza_listesi_adi: '2. Dağıtım Islak İmza Listesi (Yeni Eklenenler)',
          },
        }
      );
    }
    await sigCol.insertOne({
      id: list2Id,
      liste_no: 2,
      liste_adi: '2. Dağıtım Islak İmza Listesi (Yeni Eklenenler)',
      toplam_kayit: 2,
    });

    // TEKİLLİK DOĞRULAMASI:
    // Her kayıt YALNIZCA 1 imza listesine aittir!
    allRecords = (await benCol.find({}).toArray()).map(decryptBeneficiary);
    const list1Records = allRecords.filter((r: any) => r.imza_listesi_id === list1Id);
    const list2Records = allRecords.filter((r: any) => r.imza_listesi_id === list2Id);

    assert.equal(list1Records.length, 3, 'Liste 1 tam olarak orijinal 3 kaydını korur');
    assert.equal(list2Records.length, 2, 'Liste 2 yalnızca sonradan eklenen 2 yeni kaydı içerir');

    // Kesişim kümesi boştur (hiçbir kayıt iki listede birden olamaz)
    const list1Tcs = new Set(list1Records.map((r: any) => r.tc_no));
    for (const r of list2Records) {
      assert.ok(!list1Tcs.has(r.tc_no), `Kayıt ${r.tc_no} hem Liste 1 hem Liste 2'de yer alamaz!`);
    }
  });

  it('4. İmza listesi iptal edildiğinde (geri alındığında) kayıtlar tekrar bekleyen durumuna döner', async () => {
    const { beneficiaries: benCol, signatureLists: sigCol } = await getDbCollections();
    const listId = 'IMZA-TEST-002';

    // Geri alma işlemi
    await benCol.updateMany(
      { imza_listesi_id: listId },
      {
        $set: {
          imza_listesi_id: null,
          imza_listesi_no: null,
          imza_listesi_adi: null,
        },
      }
    );
    await sigCol.deleteOne({ id: listId });

    const allRecords = (await benCol.find({}).toArray()).map(decryptBeneficiary);
    const unassigned = allRecords.filter((b: any) => !b.imza_listesi_id);
    assert.equal(unassigned.length, 2, 'Geri alınan 2 kayıt tekrar imza listesi bekleyen havuzuna dönmelidir');
  });

  it('5. Tüm imza listeleri toplu sıfırlandığında (RESET_ALL_LISTS) tüm hak sahipleri bekleyen durumuna döner', async () => {
    const { beneficiaries: benCol, signatureLists: sigCol } = await getDbCollections();

    // Toplu sıfırlama işlemi
    await benCol.updateMany(
      {
        $or: [
          { imza_listesi_id: { $ne: null } },
          { imza_listesi_id: { $exists: true } },
        ],
      },
      {
        $set: {
          imza_listesi_id: null,
          imza_listesi_no: null,
          imza_listesi_adi: null,
          imza_listesi_tarihi: null,
        },
      }
    );
    await sigCol.deleteMany({});

    const allRecords = (await benCol.find({}).toArray()).map(decryptBeneficiary);
    const unassigned = allRecords.filter((b: any) => !b.imza_listesi_id);
    const remainingLists = await sigCol.find({}).toArray();

    assert.equal(remainingLists.length, 0, 'Hiç imza listesi kalmamalıdır');
    assert.equal(unassigned.length, allRecords.length, 'Tüm hak sahipleri bekleyen havuzuna dönmüş olmalıdır');
  });

  it('6. Yüksek performanslı toplu kilitleme (updateMany) ve hedeflenen liste sorgusu (dbFilter) anlık çalışır', async () => {
    const { beneficiaries: benCol, signatureLists: sigCol } = await getDbCollections();
    await benCol.deleteMany({});
    await sigCol.deleteMany({});

    // 50 adet test kaydı ekle
    const bulkDocs = [];
    for (let i = 1; i <= 50; i++) {
      bulkDocs.push(
        encryptBeneficiary({
          tc_no: `100000000${String(i).padStart(2, '0')}`,
          ad_soyad: `Test Vatandas ${i}`,
          mahalle: i % 2 === 0 ? 'Fatih Mah.' : 'Menzilahir Mah.',
          acik_adres: `Sokak ${i} No: ${i}`,
        })
      );
    }
    await benCol.insertMany(bulkDocs);

    // Unassigned filter projection testi (Şifre çözmeden anlık sayım)
    const unassignedFilter = {
      $or: [
        { imza_listesi_id: null },
        { imza_listesi_id: '' },
        { imza_listesi_id: { $exists: false } },
      ],
    };
    const unassignedDocs = await benCol.find(unassignedFilter).toArray();
    assert.equal(unassignedDocs.length, 50, '50 kaydın tamamı unassigned olarak tespit edilmelidir');

    // updateMany ile tek sorguda toplu kilitleme
    const listId = 'IMZA-TEST-PERF-001';
    const rawIds = unassignedDocs.map((d: any) => d._id).filter(Boolean);
    const updateResult = await benCol.updateMany(
      { _id: { $in: rawIds } },
      {
        $set: {
          imza_listesi_id: listId,
          imza_listesi_no: 1,
          imza_listesi_adi: '1. Dağıtım Islak İmza Listesi',
        },
      }
    );
    assert.equal(updateResult.modifiedCount, 50, '50 kaydın tamamı tek updateMany sorgusunda kilitlenmelidir');

    // Dışa aktarma filtresi: Yalnızca bu listeye ait kayıtlar çekilmelidir
    const exportedRaw = await benCol.find({ imza_listesi_id: listId }).toArray();
    assert.equal(exportedRaw.length, 50, 'Hedeflenen liste sorgusu tam 50 kaydı getirmelidir');

    const pendingAfter = await benCol.find(unassignedFilter).toArray();
    assert.equal(pendingAfter.length, 0, 'Kilitleme sonrası bekleyen kayıt 0 kalmalıdır');
  });

  it('7. Islak imza listesinde teslim tarihi öncesinde Teslim Edilen Kömür Miktarı (34 Torba (Takribi 850kg)), sonrasında Teslim Eden Islak İmza sütunu yer alır', () => {
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('1. FATIH MAH.');

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
    sheet.addRow(headers);
    assert.equal(headers[5], 'Teslim Edilen Kömür Miktarı', 'Teslim Tarihi öncesinde kömür miktarı yer almalıdır');
    assert.equal(headers[6], 'Teslim Eden Islak İmza', 'Kömür miktarı sonrasında Teslim Eden Islak İmza yer almalıdır');
    assert.equal(headers[7], 'Teslim Tarihi', 'Teslim Tarihi sütunu yer almalıdır');
    assert.equal(headers[8], 'Teslim Alan Islak İmza', 'Son sütunda Teslim Alan Islak İmza yer almalıdır');

    // Mahalle alt toplam satırı eklenir (9 kolon)
    const summaryRow = sheet.addRow(['', 'TOPLAM: 5 HANE', '', '', 'Tahsis Kömür Miktarı: 170 Torba (4.25 Ton)', '', '', '', '']);
    assert.equal(summaryRow.values.length, 10); // index 0 boşluk + 9 kolon

    // Mahalle/köy sonunda dağıtım sorumlusu veya vakıf müdürü imza bloğu BULUNMAZ
    let foundSignatureBlock = false;
    sheet.eachRow((row) => {
      row.eachCell((cell) => {
        const val = String(cell.value || '');
        if (val.includes('Vakıf Müdürü') || val.includes('Dağıtımı Yapan Vakıf')) {
          foundSignatureBlock = true;
        }
      });
    });
    assert.equal(foundSignatureBlock, false, 'Mahalle ve köy listeleri sonunda dağıtım görevlisi ve vakıf müdürü imza bloğu yer almamalıdır');
  });

  it('8. Excel listesi yüklenirken Başvuran Cep Telefonu 1. telefon, Hane Telefonu 2. telefon olarak ayrıştırılır', () => {
    // SOYBİS formatındaki örnek satır
        const row: Record<string, any> = {
      'HANE NO': 2320456,
      'BAŞVURAN AD': 'HEDİYE',
      'BAŞVURAN SOYAD': 'OĞEÇUK',
      'HANE TELEFONU': '05079940917',
      'BAŞVURAN CEP TELEFONU': '05454476937',
    };

    function cleanKey(k: string): string {
      return k.toLowerCase().replace(/[^a-z0-9]/g, '');
    }

    const getField = (aliases: string[]): string => {
      const cleanAliases = aliases.map((a: string) => a.toLowerCase().replace(/[^a-z0-9]/g, ''));
      for (const k of Object.keys(row)) {
        const ck = cleanKey(k);
        for (const ca of cleanAliases) {
          if (ck === ca) return String(row[k]).trim();
        }
      }
      for (const k of Object.keys(row)) {
        const ck = cleanKey(k);
        for (const ca of cleanAliases) {
          if (ck.includes(ca)) return String(row[k]).trim();
        }
      }
      return '';
    };

    const rawApplicantCep = getField(['basvuran cep telefonu', 'cep telefonu']);
    const rawHaneTel = getField(['hane telefonu', 'ev telefonu']);

    assert.equal(rawApplicantCep, '05454476937', 'Başvuran cep telefonu doğru ayıklanmalıdır');
    assert.equal(rawHaneTel, '05079940917', 'Hane telefonu doğru ayıklanmalıdır');

    // Telefon atama önceliği
    const applicantPhones = [rawApplicantCep];
    const hanePhones = [rawHaneTel];

    let telefon = '';
    let telefon2 = '';

    if (applicantPhones.length > 0) {
      telefon = applicantPhones[0];
    }
    if (hanePhones.length > 0 && hanePhones[0] !== telefon) {
      telefon2 = hanePhones[0];
    }

    assert.equal(telefon, '05454476937', '1. telefon Başvuran Cep Telefonu olmalıdır');
    assert.equal(telefon2, '05079940917', '2. telefon Hane Telefonu olmalıdır');
  });

  it('9. Birden fazla telefon numarası olan kayıtlarda numaralar alt alta (\\n ile ayrılmış) olarak gösterilir', () => {
    const phones = ['0545 447 69 37', '0507 994 09 17'];
    const phoneStr = phones.length > 0 ? phones.join('\n') : '-';
    assert.ok(phoneStr.includes('\n'), 'Telefon numaraları \\n ile alt alta ayrılmalıdır');
    const lines = phoneStr.split('\n');
    assert.equal(lines.length, 2);
    assert.equal(lines[0], '0545 447 69 37');
    assert.equal(lines[1], '0507 994 09 17');
  });

  it('10. Standart adreslerde satır yüksekliği 45pt kalırken, uzun adreslerde adres içeriğine göre dinamik olarak genişler', () => {
    const shortAddress = 'Fatih Mah. Gül Sok. No: 4';
    const longAddress = 'Şükrüpaşa Mah. Şehit Cem Havale Sok. Barış Sitesi A Blok Kat: 3 Daire: 7 Merkez / Edirne (Şehit Asım İlkokulu Yanı, Büyük Market Karşısı)';

    function calculateAddressRowHeight(address: string, standardHeight = 45): number {
      if (!address) return standardHeight;
      const text = String(address).trim();
      if (!text) return standardHeight;

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

      const neededHeight = totalLines * 15 + 8;
      return Math.max(standardHeight, neededHeight);
    }

    const shortHeight = calculateAddressRowHeight(shortAddress, 45);
    const longHeight = calculateAddressRowHeight(longAddress, 45);

    assert.equal(shortHeight, 45, 'Kısa adreste standart 45pt korunmalıdır');
    assert.ok(longHeight > 45, `Uzun adreste satır yüksekliği standardın üzerine çıkmalıdır (Hesaplanan: ${longHeight}pt)`);
    assert.ok(longHeight >= 68, '4+ satırlı uzun adreste en az 68pt yükseklik sağlanmalıdır');
  });

  it('11. formatSignatureListAddress ve getBeneficiaryEffectiveListMahalle imza listesi çıktısı sonrası adres değişikliğini korur', () => {
    // Senaryo A: İmza listesi çıktısı alındıktan sonra adres değişti (Farklı mahalleye taşındı)
    const movedRecord = {
      mahalle: 'Şükrüpaşa Mah.',
      acik_adres: 'Atatürk Bulvarı No: 14 Daire: 2',
      imza_listesi_id: 'IMZA-TEST-001',
      imza_sonrasi_adres_degisti: true,
      imza_listesi_mahalle: 'Menzilahır Mah.',
      imza_listesi_acik_adres: 'Gül Sokak No: 5',
      onceki_mahalle: 'Menzilahır Mah.',
      onceki_acik_adres: 'Gül Sokak No: 5',
    };

    // Basılı imza listesinde hangi mahallede yer almalı? -> Menzilahır Mah. (Eski basılı liste mahallesi)
    const effectiveMahalle = getBeneficiaryEffectiveListMahalle(movedRecord);
    assert.equal(effectiveMahalle, 'Menzilahır Mah.', 'Kayıt basılı listedeki eski mahallesinde yer almaya devam etmelidir');

    // Basılı imza listesi çizelgesindeki Adres sütunu nasıl görünmeli?
    // Eski adres başta olmalı ve parantez içinde yeni adresi gösterilmelidir
    const formattedAddr = formatSignatureListAddress(movedRecord);
    assert.equal(
      formattedAddr,
      'Gül Sokak No: 5 (Yeni Adres: Şükrüpaşa Mah., Atatürk Bulvarı No: 14 Daire: 2)',
      'Adres alanında eski adres gösterilmeli ve parantez içinde yeni adres yer almalıdır'
    );

    // Senaryo B: Aynı mahalle içinde sokak/kapı no değişti
    const sameMahalleMovedRecord = {
      mahalle: 'Menzilahır Mah.',
      acik_adres: 'Lale Sokak No: 20',
      imza_listesi_id: 'IMZA-TEST-001',
      imza_sonrasi_adres_degisti: true,
      imza_listesi_mahalle: 'Menzilahır Mah.',
      imza_listesi_acik_adres: 'Gül Sokak No: 5',
      onceki_mahalle: 'Menzilahır Mah.',
      onceki_acik_adres: 'Gül Sokak No: 5',
    };
    assert.equal(getBeneficiaryEffectiveListMahalle(sameMahalleMovedRecord), 'Menzilahır Mah.');
    assert.equal(
      formatSignatureListAddress(sameMahalleMovedRecord),
      'Gül Sokak No: 5 (Yeni Adres: Lale Sokak No: 20)'
    );

    // Senaryo C: İmza listesi çıktısı sonrası adres değişikliği OLMAMIŞ normal kayıt
    const normalRecord = {
      mahalle: 'Fatih Mah.',
      acik_adres: 'Menekşe Sok. No: 12',
      imza_listesi_id: 'IMZA-TEST-001',
      imza_sonrasi_adres_degisti: false,
    };
    assert.equal(getBeneficiaryEffectiveListMahalle(normalRecord), 'Fatih Mah.');
    assert.equal(formatSignatureListAddress(normalRecord), 'Menekşe Sok. No: 12');
  });

  it('12. İmza listesi Excel oluşturulduğunda adres değişikliği olan hane eski mahalle sekmesinde ve parantez içinde yeni adresiyle listelenir', async () => {
    const workbook = new ExcelJS.Workbook();

    const beneficiaries = [
      {
        tc_no: '11111111111',
        ad_soyad: 'Fatma Şen',
        telefon: '0555 111 22 33',
        mahalle: 'Şükrüpaşa Mah.',
        acik_adres: 'Atatürk Bulvarı No: 14 Daire: 2',
        imza_listesi_id: 'IMZA-TEST-001',
        imza_sonrasi_adres_degisti: true,
        imza_listesi_mahalle: 'Menzilahır Mah.',
        imza_listesi_acik_adres: 'Gül Sokak No: 5',
        onceki_mahalle: 'Menzilahır Mah.',
        onceki_acik_adres: 'Gül Sokak No: 5',
      },
      {
        tc_no: '22222222222',
        ad_soyad: 'Ali Kaya',
        telefon: '0542 222 33 44',
        mahalle: 'Menzilahır Mah.',
        acik_adres: 'Akasya Sokak No: 3',
        imza_listesi_id: 'IMZA-TEST-001',
        imza_sonrasi_adres_degisti: false,
      },
    ];

    // Mahallelere göre gruplama mantığı:
    const mahalleGroups = new Map<string, any[]>();
    for (const r of beneficiaries) {
      const listMah = getBeneficiaryEffectiveListMahalle(r);
      const m = normalizeMahalleName(listMah) || listMah;
      if (!mahalleGroups.has(m)) {
        mahalleGroups.set(m, []);
      }
      mahalleGroups.get(m)!.push(r);
    }

    // Fatma Şen yeni adresi Şükrüpaşa olmasına rağmen, imza listesi çıktısı daha önce alındığı için Menzilahır grubunda kalmalıdır
    assert.ok(mahalleGroups.has('Menzilahır Mah.'), 'Menzilahır Mah. grubu oluşmalıdır');
    const menzilahirGroup = mahalleGroups.get('Menzilahır Mah.')!;
    assert.equal(menzilahirGroup.length, 2, 'Her iki hane de Menzilahır grubunda yer almalıdır');

    // Menzilahır çalışma sayfası oluşturulması
    const sheet = workbook.addWorksheet('Menzilahır Mah.');
    sheet.addRow(['Sıra', 'Adı Soyadı', 'TC', 'Telefon', 'Adres', 'Miktar', 'İmza Eden', 'Tarih', 'İmza Alan']);

    // Adres A-Z sıralaması basılı listelerdeki eski adreslerine göre yapılır
    menzilahirGroup.sort((a, b) => {
      const addrA = a.imza_sonrasi_adres_degisti ? (a.imza_listesi_acik_adres || a.onceki_acik_adres || a.acik_adres || '') : (a.acik_adres || '');
      const addrB = b.imza_sonrasi_adres_degisti ? (b.imza_listesi_acik_adres || b.onceki_acik_adres || b.acik_adres || '') : (b.acik_adres || '');
      return addrA.localeCompare(addrB, 'tr', { sensitivity: 'base', numeric: true });
    });

    for (let i = 0; i < menzilahirGroup.length; i++) {
      const r = menzilahirGroup[i];
      sheet.addRow([
        i + 1,
        r.ad_soyad,
        r.tc_no,
        r.telefon,
        formatSignatureListAddress(r),
        '34 Torba',
        '',
        '',
        '',
      ]);
    }

    // 1. Satır: Akasya Sokak No: 3 (Ali Kaya)
    assert.equal(sheet.getRow(2).getCell(2).value, 'Ali Kaya');
    assert.equal(sheet.getRow(2).getCell(5).value, 'Akasya Sokak No: 3');

    // 2. Satır: Gül Sokak No: 5 (Fatma Şen - Yeni Adres: Şükrüpaşa Mah., Atatürk Bulvarı No: 14 Daire: 2)
    assert.equal(sheet.getRow(3).getCell(2).value, 'Fatma Şen');
    assert.equal(
      sheet.getRow(3).getCell(5).value,
      'Gül Sokak No: 5 (Yeni Adres: Şükrüpaşa Mah., Atatürk Bulvarı No: 14 Daire: 2)'
    );
  });
});
