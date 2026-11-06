import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveStaffDisplayName, normalizeStaffName, isBirebirBeneficiaryMatch } from '../src/lib/normalizer';
import { encryptBeneficiary, encryptRouteStop, isEncrypted } from '../src/lib/crypto';
import { mapDoc } from '../src/lib/mongodb';

test('Şehit / Gazi Rozeti ve Personel İsim Çözümleme Testleri', async (t) => {
  await t.test('1. resolveStaffDisplayName şifreli/bozuk metinleri temizleyerek gerçek personel adını çözer', () => {
    // Admin corrupted display name
    assert.equal(
      resolveStaffDisplayName('***[ŞİFRELİ VERİ DEŞİFRE EDİLEMEDİ]***', 'admin', 'ADMIN'),
      'Gökhan SUÇSUZ'
    );
    assert.equal(
      resolveStaffDisplayName('ENC:GCM:abcdef123456', 'admin', 'ADMIN'),
      'Gökhan SUÇSUZ'
    );
    assert.equal(
      resolveStaffDisplayName('', 'admin', 'ADMIN'),
      'Gökhan SUÇSUZ'
    );
    assert.equal(
      resolveStaffDisplayName(null, 'admin', 'ADMIN'),
      'Gökhan SUÇSUZ'
    );

    // Personel users (cem, hamza, ismail, müdür)
    assert.equal(
      resolveStaffDisplayName('***[ŞİFRELİ VERİ DEŞİFRE EDİLEMEDİ]***', 'cem', 'PERSONEL'),
      'Cem PAZAR'
    );
    assert.equal(
      resolveStaffDisplayName('***[ŞİFRELİ VERİ DEŞİFRE EDİLEMEDİ]***', 'hamza', 'PERSONEL'),
      'Hamza ULUDAĞ'
    );
    assert.equal(
      resolveStaffDisplayName('***[ŞİFRELİ VERİ DEŞİFRE EDİLEMEDİ]***', 'ismail', 'PERSONEL'),
      'İsmail'
    );
    assert.equal(
      resolveStaffDisplayName('***[ŞİFRELİ VERİ DEŞİFRE EDİLEMEDİ]***', 'müdür', 'MUDUR'),
      'Müdür Yetkilisi'
    );

    // Valid decrypted name is preserved
    assert.equal(
      resolveStaffDisplayName('Gökhan SUÇSUZ', 'admin', 'ADMIN'),
      'Gökhan SUÇSUZ'
    );
    assert.equal(
      resolveStaffDisplayName('Cem PAZAR', 'cem', 'PERSONEL'),
      'Cem PAZAR'
    );
  });

  await t.test('2. sehit_gazi_notu alanı AES-256-GCM ile şifrelenir ve mapDoc ile şeffafça deşifre edilir', () => {
    const rawRecord = {
      tc_no: '12345678901',
      ad_soyad: 'Ahmet Yılmaz',
      mahalle: 'Karaağaç Mah.',
      sehit_gazi: true,
      sehit_gazi_notu: '15 Temmuz Gazisi Yakını',
      sehit_gazi_tarihi: '2026-11-06 14:00',
      sehit_gazi_atanan_personel: 'Gökhan SUÇSUZ',
    };

    const encrypted = encryptBeneficiary(rawRecord);
    // Veritabanında not şifreli (ENC:GCM:...) olarak saklanmalıdır
    assert.ok(isEncrypted(encrypted.sehit_gazi_notu), 'sehit_gazi_notu alanı şifreli olmalıdır');
    assert.equal(encrypted.sehit_gazi, true);

    // mapDoc transparent decryption
    const decrypted = mapDoc(encrypted);
    assert.equal(decrypted.sehit_gazi_notu, '15 Temmuz Gazisi Yakını');
    assert.equal(decrypted.sehit_gazi, true);
    assert.equal(decrypted.sehit_gazi_atanan_personel, 'Gökhan SUÇSUZ');
  });

  await t.test('3. Rota duraklarında sehit_gazi_notu şifrelenir ve korunur', () => {
    const rawStop = {
      beneficiary_id: 'ben-001',
      tc_no: '12345678901',
      ad_soyad: 'Mehmet Demir',
      sehit_gazi: true,
      sehit_gazi_notu: 'Kıbrıs Gazisi',
    };

    const encStop = encryptRouteStop(rawStop);
    assert.ok(isEncrypted(encStop.sehit_gazi_notu), 'Durak sehit_gazi_notu şifrelenmelidir');
    assert.equal(encStop.sehit_gazi, true);

    const decStop = mapDoc(encStop);
    assert.equal(decStop.sehit_gazi_notu, 'Kıbrıs Gazisi');
  });

  await t.test('4. isBirebirBeneficiaryMatch şehit/gazi sorgularını ve rozetli kayıtları doğru eşleştirir', () => {
    const martyrRecord = {
      id: '1',
      tc_no: '11111111110',
      ad_soyad: 'Ali Vatansever',
      sehit_gazi: true,
      sehit_gazi_notu: 'Şehit Babası',
    };

    const regularRecord = {
      id: '2',
      tc_no: '22222222220',
      ad_soyad: 'Hasan Yılmaz',
      sehit_gazi: false,
    };

    // 'şehit' araması
    assert.equal(isBirebirBeneficiaryMatch(martyrRecord, 'şehit'), true);
    assert.equal(isBirebirBeneficiaryMatch(martyrRecord, 'sehit'), true);
    assert.equal(isBirebirBeneficiaryMatch(martyrRecord, 'gazi'), true);
    assert.equal(isBirebirBeneficiaryMatch(regularRecord, 'şehit'), false);

    // Normal isim veya TC araması da kusursuz devam eder
    assert.equal(isBirebirBeneficiaryMatch(martyrRecord, 'Ali'), true);
    assert.equal(isBirebirBeneficiaryMatch(martyrRecord, '11111111110'), true);
  });
});

