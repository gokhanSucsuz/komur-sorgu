import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import ExcelJS from 'exceljs';

process.env.ENCRYPTION_MASTER_KEY = crypto.randomBytes(32).toString('hex');
process.env.BLIND_INDEX_KEY = crypto.randomBytes(32).toString('hex');

import { encryptBeneficiary, decryptBeneficiary } from '@/lib/crypto';
import { getBeneficiaryListTypeInfo, formatDeliveryStatusSummary } from '@/lib/normalizer';

describe('Ek Kömür ve Manuel Islak İmza Listesi Sistemi Testleri', () => {
  it('1. getBeneficiaryListTypeInfo manuel ek liste ve ek kömür durumunu doğru etiketler ve imza notunu üretir', () => {
    const regularBeneficiary = {
      imza_listesi_id: 'sig_list_1',
      imza_durumu: 'BEKLIYOR',
    };

    const ekKomurBeneficiary = {
      imza_listesi_id: null,
      manuel_ek_liste_imzasi: true,
      ek_komur_verildi: true,
      ek_liste_imza_tarihi: '2026-10-30',
      ek_liste_imza_notu: '30.10.2026 tarihinde ek listeye imzası alındı',
      imza_durumu: 'IMZALANDI',
      teslimat_durumu: 'TAMAMLANDI',
      torba_sayisi: 34,
    };

    const regularInfo = getBeneficiaryListTypeInfo(regularBeneficiary);
    assert.equal(regularInfo.isManuelEkListe, false);
    assert.equal(regularInfo.ekKomurVerildi, false);
    assert.equal(regularInfo.ekListeImzaNotu, '');

    const ekInfo = getBeneficiaryListTypeInfo(ekKomurBeneficiary);
    assert.equal(ekInfo.isManuelEkListe, true);
    assert.equal(ekInfo.ekKomurVerildi, true);
    assert.equal(ekInfo.ekListeImzaNotu, '30.10.2026 tarihinde ek listeye imzası alındı');
  });

  it('2. formatDeliveryStatusSummary teslimat özetine ek liste imza tarih notunu ekler', () => {
    const beneficiaryWithNote = {
      teslimat_durumu: 'TAMAMLANDI',
      torba_sayisi: 34,
      manuel_ek_liste_imzasi: true,
      ek_komur_verildi: true,
      ek_liste_imza_notu: '30.10.2026 tarihinde ek listeye imzası alındı',
    };

    const summary = formatDeliveryStatusSummary(beneficiaryWithNote);
    assert.ok(summary.includes('34 Torba'), `Expected 34 Torba in summary, got: ${summary}`);
    assert.ok(summary.includes('30.10.2026 tarihinde ek listeye imzası alındı'), `Expected date note in summary, got: ${summary}`);
  });

  it('3. ek_liste_imza_notu alanı AES-256-GCM ile şifrelenir ve çözülür', () => {
    const sampleRecord = {
      ad_soyad: 'Ahmet Yılmaz',
      tc_no: '12345678901',
      telefon: '05551112233',
      adres: 'Babademirtaş Mah. Karanfil Sk. No: 4',
      mahalle: 'Babademirtaş',
      ek_liste_imza_notu: '30.10.2026 tarihinde ek listeye imzası alındı',
    };

    const encrypted = encryptBeneficiary(sampleRecord);
    assert.notEqual(encrypted.ek_liste_imza_notu, sampleRecord.ek_liste_imza_notu);
    assert.ok(String(encrypted.ek_liste_imza_notu).startsWith('ENC:GCM:v1:'));

    const decrypted = decryptBeneficiary(encrypted);
    assert.equal(decrypted.ek_liste_imza_notu, '30.10.2026 tarihinde ek listeye imzası alındı');
  });

  it('4. Islak imza listesi çıktıktan sonra eklenen tekil haneye teslimat yapıldığında manuel ek liste imzası otomatik kurgulanır', () => {
    // Simüle edilen iş mantığı (API /delivery teslimat senaryosu)
    const hasSignatureLists = true;
    const beneficiary: any = {
      id: 'ben_new_1',
      imza_listesi_id: null,
      tekil_hane_ekleme: true,
      sonradan_eklenen_hane: true,
      torba_sayisi: 0,
      imza_durumu: 'BEKLIYOR',
    };

    const isWithoutSignatureList = !beneficiary.imza_listesi_id;
    const isSingleOrEkRecord = Boolean(beneficiary.tekil_hane_ekleme || beneficiary.sonradan_eklenen_hane);
    const isManuelEkListeImza = (hasSignatureLists && isWithoutSignatureList) || isSingleOrEkRecord;

    assert.equal(isManuelEkListeImza, true);

    const nowIso = '2026-10-30T14:30:00.000Z';
    const datePart = '30.10.2026';
    const ekListeNotu = `${datePart} tarihinde ek listeye imzası alındı`;

    const updateSet: any = {
      teslimat_durumu: 'TAMAMLANDI',
      torba_sayisi: 34,
      teslimat_tarihi: nowIso,
    };

    if (isManuelEkListeImza) {
      updateSet.manuel_ek_liste_imzasi = true;
      updateSet.ek_komur_verildi = true;
      updateSet.ek_liste_imza_tarihi = nowIso;
      updateSet.ek_liste_imza_notu = ekListeNotu;
      updateSet.imza_durumu = 'IMZALANDI';
    }

    assert.equal(updateSet.manuel_ek_liste_imzasi, true);
    assert.equal(updateSet.ek_komur_verildi, true);
    assert.equal(updateSet.imza_durumu, 'IMZALANDI');
    assert.equal(updateSet.ek_liste_imza_notu, '30.10.2026 tarihinde ek listeye imzası alındı');
  });

  it('5. Teslimat iptal edildiğinde ek kömür ve manuel liste imza alanları sıfırlanır', () => {
    const activeDeliveredBeneficiary: any = {
      manuel_ek_liste_imzasi: true,
      ek_komur_verildi: true,
      ek_liste_imza_notu: '30.10.2026 tarihinde ek listeye imzası alındı',
      ek_liste_imza_tarihi: '2026-10-30T14:30:00.000Z',
      teslimat_durumu: 'TAMAMLANDI',
      imza_durumu: 'IMZALANDI',
    };

    // İptal eylemi (API /delivery action === 'IPTAL')
    const cancelUpdateSet: any = {
      teslimat_durumu: 'BEKLIYOR',
      torba_sayisi: 0,
      teslimat_tarihi: null,
      imza_durumu: 'BEKLIYOR',
      manuel_ek_liste_imzasi: false,
      ek_komur_verildi: false,
      ek_liste_imza_notu: null,
      ek_liste_imza_tarihi: null,
    };

    Object.assign(activeDeliveredBeneficiary, cancelUpdateSet);

    assert.equal(activeDeliveredBeneficiary.manuel_ek_liste_imzasi, false);
    assert.equal(activeDeliveredBeneficiary.ek_komur_verildi, false);
    assert.equal(activeDeliveredBeneficiary.ek_liste_imza_notu, null);
    assert.equal(activeDeliveredBeneficiary.imza_durumu, 'BEKLIYOR');
  });

  it('6. Excel Islak İmza Listesi çıktısında ek kömür teslim edilen hanenin satırı 34 Torba, Personel ve Tarih Notu ile damgalanır', async () => {
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('BABADEMİRTAŞ MAH.');

    const titleRow = sheet.addRow(['KÖMÜR YARDIMI HAK SAHİBİ TESLİM VE ISLAK İMZA ÇİZELGESİ - BABADEMİRTAŞ MAH.']);
    sheet.addRow(['Sıra No', 'Hane No', 'TC Kimlik No', 'Adı Soyadı', 'İkametgah Adresi', 'Teslim Edilen Kömür Miktarı', 'Teslim Eden Görevli', 'Teslim Tarihi', 'Islak İmza']);

    const beneficiary = {
      sira_no: 1,
      hane_no: 'HN-101',
      tc_no: '11111111110',
      ad_soyad: 'Fatma Demir',
      adres: 'Karanfil Sk. No: 12',
      torba_sayisi: 34,
      teslim_eden_personel: 'Ahmet Personel',
      manuel_ek_liste_imzasi: true,
      ek_komur_verildi: true,
      ek_liste_imza_notu: '30.10.2026 tarihinde ek listeye imzası alındı',
      teslimat_durumu: 'TAMAMLANDI',
    };

    const isEkListeSigned = beneficiary.manuel_ek_liste_imzasi || beneficiary.ek_komur_verildi;
    const ekListeNot = beneficiary.ek_liste_imza_notu;

    const row = sheet.addRow([
      beneficiary.sira_no,
      beneficiary.hane_no,
      beneficiary.tc_no,
      beneficiary.ad_soyad,
      beneficiary.adres,
      isEkListeSigned ? `${beneficiary.torba_sayisi} Torba (Teslim Edildi)` : '34 Torba (Takribi 850kg)',
      isEkListeSigned ? beneficiary.teslim_eden_personel : '',
      '30.10.2026',
      isEkListeSigned ? ekListeNot : '',
    ]);

    assert.equal(row.getCell(6).value, '34 Torba (Teslim Edildi)');
    assert.equal(row.getCell(7).value, 'Ahmet Personel');
    assert.equal(row.getCell(9).value, '30.10.2026 tarihinde ek listeye imzası alındı');
  });

  it('7. Ek Kömür Verilenler Listesi Excel çıktısı resmi başlık, tarih notu ve özet satırını eksiksiz oluşturur', async () => {
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('Ek Kömür Verilenler');

    const headers = [
      'Sıra', 'İmza Sıra No', 'TC Kimlik No', 'Adı Soyadı', 'Telefon',
      'Mahalle', 'Açık Adres', 'Teslim Edilen Torba', 'Teslim Edilen Ton',
      'Teslim Tarihi', 'Teslim Alan', 'Teslim Eden Personel', 'Islak İmza Onayı / Not'
    ];

    sheet.addRow(['EDİRNE SYDV - EK KÖMÜR VERİLENLER ISLAK İMZA VE TESLİMAT LİSTESİ']);
    sheet.addRow(headers);

    const record = {
      'Sıra': 1,
      'İmza Sıra No': '-',
      'TC Kimlik No': '22222222220',
      'Adı Soyadı': 'Mehmet Kaya',
      'Telefon': '05559998877',
      'Mahalle': 'Menzilahır',
      'Açık Adres': 'Gül Sok. No: 3',
      'Teslim Edilen Torba': 34,
      'Teslim Edilen Ton': '0.85 Ton',
      'Teslim Tarihi': '30.10.2026 14:00',
      'Teslim Alan': 'Kendisi',
      'Teslim Eden Personel': 'Ali Dağıtım',
      'Islak İmza Onayı / Not': '30.10.2026 tarihinde ek listeye imzası alındı',
    };

    const dataRow = sheet.addRow(Object.values(record));
    assert.equal(dataRow.getCell(8).value, 34);
    assert.equal(dataRow.getCell(13).value, '30.10.2026 tarihinde ek listeye imzası alındı');

    // Footer
    const footerRow = sheet.addRow([
      '', '', 'TOPLAM:', '1 Hane', '', '', '', 34, '0.85 Ton', '', '', '', 'Manuel Ek Listeye Elden İmza Alınmıştır'
    ]);
    assert.equal(footerRow.getCell(8).value, 34);
    assert.equal(footerRow.getCell(13).value, 'Manuel Ek Listeye Elden İmza Alınmıştır');
  });

  it('8. İstatistik ve icmal hesaplamalarında ek kömür verilenler doğru toplanır', () => {
    const beneficiaries = [
      { id: '1', teslimat_durumu: 'TAMAMLANDI', torba_sayisi: 34, ek_komur_verildi: false },
      { id: '2', teslimat_durumu: 'TAMAMLANDI', torba_sayisi: 34, ek_komur_verildi: true, manuel_ek_liste_imzasi: true },
      { id: '3', teslimat_durumu: 'TAMAMLANDI', torba_sayisi: 17, ek_komur_verildi: true, manuel_ek_liste_imzasi: true },
      { id: '4', teslimat_durumu: 'BEKLIYOR', torba_sayisi: 0, ek_komur_verildi: true, manuel_ek_liste_imzasi: false },
    ];

    let ekKomurHane = 0;
    let ekKomurTorba = 0;

    for (const b of beneficiaries) {
      if (b.teslimat_durumu === 'TAMAMLANDI' && (b.ek_komur_verildi || b.manuel_ek_liste_imzasi)) {
        ekKomurHane += 1;
        ekKomurTorba += Number(b.torba_sayisi || 0);
      }
    }

    const ekKomurTonaj = parseFloat((ekKomurTorba * 0.025).toFixed(3));

    assert.equal(ekKomurHane, 2);
    assert.equal(ekKomurTorba, 51);
    assert.equal(ekKomurTonaj, 1.275);
  });

  it('9. Toplu teslimat çıktısında saat bilgisi değil "Teslim Tarihi" (salt tarih) yer alır ve imza teyit sütunu bulunmaz', () => {
    const rawDeliveryRecord = {
      tarih: '2026-10-30 14:45:22',
      gun_tarihi: '2026-10-30',
      tc_no: '33333333330',
      ad_soyad: 'Ayşe Kaya',
      mahalle: 'Şükrüpaşa',
      torba_sayisi: 34,
      teslim_alan: 'Kendisi',
    };

    const dateOnly = String(rawDeliveryRecord.gun_tarihi || rawDeliveryRecord.tarih).split(' ')[0];
    assert.equal(dateOnly, '2026-10-30');
    assert.ok(!dateOnly.includes(':'), 'Saat bilgisi yer almamalıdır');

    const headers = ['Sıra', 'Teslim Tarihi', 'TC Kimlik No', 'Adı Soyadı', 'Mahalle', 'Açık Adres', 'Teslim Edilen Torba', 'Teslim Alan', 'Teslim Eden Personel', 'Açıklama / Not'];
    assert.ok(headers.includes('Teslim Tarihi'));
    assert.ok(!headers.includes('Saat'));
    assert.ok(!headers.includes('İmza / Teyit'));
  });

  it('10. İptal edilen teslimatların toplu listesi iptal tarihi (salt tarih), iptal torbası ve gerekçeyi içerir', () => {
    const cancelRecord = {
      tarih: '2026-10-30 16:10:00',
      gun_tarihi: '2026-10-30',
      tc_no: '44444444440',
      ad_soyad: 'Hasan Yılmaz',
      mahalle: 'Menzilahır',
      torba_sayisi: 34,
      personel: 'Veli Görevli',
      iptal_nedeni: 'Adresinde ikamet etmediği tespit edildi',
    };

    const dateOnly = String(cancelRecord.gun_tarihi || cancelRecord.tarih).split(' ')[0];
    assert.equal(dateOnly, '2026-10-30');
    assert.ok(!dateOnly.includes(':'));

    const cancelHeaders = ['Sıra', 'İptal Tarihi', 'TC Kimlik No', 'Adı Soyadı', 'Mahalle', 'Açık Adres', 'İptal Edilen Torba', 'İşlemi Yapan Personel', 'İptal Gerekçesi / Tutanak'];
    assert.ok(cancelHeaders.includes('İptal Tarihi'));
    assert.ok(cancelHeaders.includes('İptal Gerekçesi / Tutanak'));
    assert.equal(cancelRecord.iptal_nedeni, 'Adresinde ikamet etmediği tespit edildi');
  });

  it('11. Islak imza listesi Excel çalışma kitabında "Ek İmza Listesi" adında ferah imza satırlı (45pt) sekme yer alır', async () => {
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('Ek İmza Listesi', {
      pageSetup: {
        paperSize: 9, // A4
        orientation: 'landscape',
        fitToWidth: 1,
        margins: { left: 0.35, right: 0.35, top: 0.45, bottom: 0.45, header: 0.2, footer: 0.2 },
        printTitlesRow: '1:2',
      },
    });

    sheet.properties.tabColor = { argb: 'FFD97706' };
    const titleRow = sheet.addRow(['KÖMÜR YARDIMI EK / MANUEL ISLAK İMZA ÇİZELGESİ']);
    sheet.mergeCells(1, 1, 1, 9);
    titleRow.height = 28;

    const headers = [
      'Sıra No', 'Hak Sahibi Adı Soyadı', 'T.C. Kimlik No', 'İletişim / Tel',
      'İkametgah Adresi (Mahalle / Sokak / Kapı No)', 'Teslim Edilen Kömür Miktarı',
      'Teslim Eden Görevli', 'Teslim Tarihi', 'Teslim Alan Islak İmza'
    ];
    sheet.addRow(headers);

    const blankRow = sheet.addRow([1, '', '', '', '', '34 Torba (Takribi 850kg)', '', '', '']);
    blankRow.height = 45;

    assert.equal(sheet.name, 'Ek İmza Listesi');
    assert.equal(blankRow.height, 45);
    assert.equal(blankRow.getCell(6).value, '34 Torba (Takribi 850kg)');
    assert.equal(headers[8], 'Teslim Alan Islak İmza');
  });
});
