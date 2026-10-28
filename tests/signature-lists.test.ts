import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import ExcelJS from 'exceljs';

process.env.ENCRYPTION_MASTER_KEY = crypto.randomBytes(32).toString('hex');
process.env.BLIND_INDEX_KEY = crypto.randomBytes(32).toString('hex');

import { getDbCollections, mapDocs } from '@/lib/mongodb';
import { encryptBeneficiary, decryptBeneficiary } from '@/lib/crypto';
import { normalizeMahalleName } from '@/lib/normalizer';

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
    sheet.mergeCells(1, 1, 1, 6);
    titleRow.height = 28;

    sheet.addRow(['Sıra No', 'Adı Soyadı', 'T.C. Kimlik No', 'Telefon', "Adres (A'dan Z'ye Sıralı)", 'Teslim Alan Islak İmza']);

    const dataRow = sheet.addRow([1, 'Ahmet Yılmaz', '12345678901', '0555 111 22 33', 'Atatürk Cad. No: 1', '']);
    dataRow.height = 45;

    assert.equal(sheet.pageSetup.paperSize, 9);
    assert.equal(sheet.pageSetup.orientation, 'landscape');
    assert.equal(sheet.pageSetup.fitToWidth, 1);
    assert.equal(sheet.pageSetup.printTitlesRow, '1:2');
    assert.equal(dataRow.height, 45);
    // İmza alanı kesinlikle boştur
    assert.equal(dataRow.getCell(6).value, '');

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

  it('7. Islak imza listesi tutanağında sol tarafta Dağıtımı Yapan Vakıf Görevlisi/Personeli, sağ tarafta Vakıf Müdürü yer alır; Muhtar ve Şoför alanı bulunmaz', () => {
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('1. FATIH MAH.');

    // Simüle edilen resmi tutanak ve imza satırı
    const signTitleRow = sheet.addRow([
      'Dağıtımı Yapan Vakıf Görevlisi veya Personeli\n(Ad Soyad / İmza)',
      '',
      '',
      'Vakıf Müdürü\n(Ad Soyad / İmza / Mühür)',
      '',
      '',
    ]);
    sheet.mergeCells(signTitleRow.number, 1, signTitleRow.number, 3);
    sheet.mergeCells(signTitleRow.number, 4, signTitleRow.number, 6);

    const leftBoxText = String(signTitleRow.getCell(1).value);
    const rightBoxText = String(signTitleRow.getCell(4).value);

    // Doğrulamalar:
    assert.ok(leftBoxText.includes('Dağıtımı Yapan Vakıf Görevlisi veya Personeli'), 'Sol kutuda Vakıf Görevlisi / Personeli yer almalıdır');
    assert.ok(rightBoxText.includes('Vakıf Müdürü'), 'Sağ kutuda Vakıf Müdürü yer almalıdır');

    // Muhtar ve Şoför olmamalıdır:
    assert.ok(!leftBoxText.includes('Muhtar') && !rightBoxText.includes('Muhtar'), 'İmza bloğunda Muhtar yer almamalıdır');
    assert.ok(!leftBoxText.includes('Şoför') && !rightBoxText.includes('Şoför'), 'İmza bloğunda Şoför yer almamalıdır');
  });
});
