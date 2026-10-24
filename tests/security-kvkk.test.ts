import { describe, it, before } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';

// Set deterministic test keys (32 bytes = 64 hex chars) before importing crypto modules
const TEST_MASTER_KEY_V1 = crypto.randomBytes(32).toString('hex');
const TEST_MASTER_KEY_V2 = crypto.randomBytes(32).toString('hex');
const TEST_BLIND_KEY = crypto.randomBytes(32).toString('hex');

process.env.ENCRYPTION_MASTER_KEY = TEST_MASTER_KEY_V1;
process.env.BLIND_INDEX_KEY = TEST_BLIND_KEY;

import {
  encryptField,
  decryptField,
  isEncrypted,
  hashTc,
  hashHane,
  hashAddress,
  hashPassword,
  verifyPassword,
  needsPasswordRehash,
  timingSafeTokenEqual,
  burnPasswordCheck,
  encryptBeneficiary,
  encryptRouteStop,
  decryptRouteStop,
} from '@/lib/crypto';

import {
  asString,
  clampInt,
  isSafeId,
  escapeRegex,
  getClientIp,
  validatePasswordPolicy,
  isSameOriginRequest,
  stripBlindHashes,
} from '@/lib/security';

import {
  generateTotpSecret,
  generateTotpCode,
  verifyTotpCode,
  generateRecoveryCodes,
  generateQrCodeSvgDataUrl,
} from '@/lib/totp';

import {
  cleanTcNo,
  normalizeMahalleName,
  normalizeAddress,
  detectSettlement,
  extractStreetAndDoor,
  normalizeStreetForCompare,
  getRecordStreetInfo,
  getBeneficiaryListTypeInfo,
} from '@/lib/normalizer';

import { mapDoc, getDbCollections, reconcileArchivedSeasonImports } from '@/lib/mongodb';
import { sanitizeUser, isSessionExpired, SESSION_MAX_AGE_MS } from '@/lib/auth';

describe('1. KVKK & AES-256-GCM Kriptografik Güvenlik Testleri', () => {
  it('Aynı açık metin (TC Kimlik No) her şifrelendiğinde benzersiz IV ile farklı şifreli metin üretir', () => {
    const tc = '12345678901';
    const enc1 = encryptField(tc);
    const enc2 = encryptField(tc);

    assert.ok(isEncrypted(enc1));
    assert.ok(isEncrypted(enc2));
    assert.notEqual(enc1, enc2, 'Rastgele IV sayesinde iki şifreleme çıktısı asla aynı olmamalıdır');
    assert.equal(decryptField(enc1), tc);
    assert.equal(decryptField(enc2), tc);
  });

  it('Şifreli metin veya AuthTag üzerinde 1 bitlik müdahaleyi (Tampering) tespit edip reddeder', () => {
    const original = 'Gökhan SUÇSUZ - Edirne SYDV';
    const encrypted = String(encryptField(original));
    const parts = encrypted.split(':');
    assert.equal(parts.length, 6);

    // Flip last hex char of ciphertext
    const lastChar = parts[5].slice(-1);
    const tamperedChar = lastChar === 'a' ? 'b' : 'a';
    parts[5] = parts[5].slice(0, -1) + tamperedChar;
    const tampered = parts.join(':');

    const result = decryptField(tampered);
    assert.notEqual(result, original, 'Bozulmuş/müdahale edilmiş veri asla açık metin olarak dönmemelidir');
  });

  it('Anahtar rotasyonunu (ENCRYPTION_MASTER_KEY_PREVIOUS) kesintisiz destekler', () => {
    process.env.ENCRYPTION_MASTER_KEY = TEST_MASTER_KEY_V1;
    delete process.env.ENCRYPTION_MASTER_KEY_PREVIOUS;

    const secretAddress = 'Sabuni Mah. Saraçlar Cad. No: 12 Daire: 4';
    const encryptedWithOldKey = encryptField(secretAddress);

    // Rotate key: V2 becomes primary, V1 becomes previous
    process.env.ENCRYPTION_MASTER_KEY = TEST_MASTER_KEY_V2;
    process.env.ENCRYPTION_MASTER_KEY_PREVIOUS = TEST_MASTER_KEY_V1;

    assert.equal(decryptField(encryptedWithOldKey), secretAddress);

    const encryptedWithNewKey = encryptField(secretAddress);
    assert.equal(decryptField(encryptedWithNewKey), secretAddress);
  });

  it('Deterministik HMAC-SHA256 kör indeks (Blind Index) özetleri tutarlı çalışır', () => {
    const h1 = hashTc('12345678901') || '';
    const h2 = hashTc('  12345678901 ') || '';
    const h3 = hashTc('10987654321') || '';

    assert.equal(h1.length, 64);
    assert.equal(h1, h2);
    assert.notEqual(h1, h3);
    assert.ok((hashHane('4501') || '').length === 64);
    assert.ok((hashAddress('Fatih Mah. 1. Sok. No:5') || '').length === 64);
  });

  it('Hak sahibi ve Rota Durağı PII alanlarını eksiksiz şifreler ve çözer', () => {
    const rawBen = {
      tc_no: '12345678901',
      ad_soyad: 'Ahmet Yılmaz',
      telefon: '05551234567',
      acik_adres: 'Cumhuriyet Mah. 10. Sok. No: 3',
      hane_no: '102',
    };
    const encBen = encryptBeneficiary(rawBen);
    assert.ok(isEncrypted(encBen.tc_no));
    assert.ok(isEncrypted(encBen.ad_soyad));
    assert.ok(isEncrypted(encBen.telefon));
    assert.ok(isEncrypted(encBen.acik_adres));
    assert.equal(encBen.tc_hash, hashTc('12345678901'));

    const rawStop = {
      beneficiary_id: '1',
      tc_no: '12345678901',
      ad_soyad: 'Ahmet Yılmaz',
      telefon: '05551234567',
      acik_adres: 'Cumhuriyet Mah. No: 3',
      sokak: '10. Sokak',
      teslim_alan: 'Ahmet Yılmaz',
      teslimat_notu: 'Tam teslim',
    };
    const encStop = encryptRouteStop(rawStop);
    assert.ok(isEncrypted(encStop.tc_no));
    assert.ok(isEncrypted(encStop.ad_soyad));
    const decStop = decryptRouteStop(encStop);
    assert.equal(decStop.tc_no, '12345678901');
    assert.equal(decStop.ad_soyad, 'Ahmet Yılmaz');
  });
});

describe('2. SCRYPT2 Şifre Özetleme & Zamanlama Saldırısı Koruması Testleri', () => {
  it('SCRYPT2 ile şifreyi özetler, doğrular ve yanlış şifreyi reddeder', () => {
    const pass = 'EdirneSydv2026!';
    const hash = hashPassword(pass);

    assert.ok(hash.startsWith('SCRYPT2:'));
    assert.equal(verifyPassword(pass, hash), true);
    assert.equal(verifyPassword('YanlisSifre2026!', hash), false);
    assert.equal(needsPasswordRehash(hash), false);
  });

  it('Eski SCRYPT1 özetlerini doğrular ve yeniden özetleme (rehash) gereksinimini bildirir', () => {
    const salt = crypto.randomBytes(16).toString('hex');
    const derived = crypto.scryptSync('EskiSifre123', salt, 64).toString('hex');
    const legacyHash = `SCRYPT1:${salt}:${derived}`;

    assert.equal(verifyPassword('EskiSifre123', legacyHash), true);
    assert.equal(verifyPassword('Yanlis123', legacyHash), false);
    assert.equal(needsPasswordRehash(legacyHash), true);
  });

  it('Sabit zamanlı token karşılaştırması ve sahte parola yakma (burnPasswordCheck) hatasız çalışır', () => {
    const t1 = crypto.randomUUID();
    const t2 = crypto.randomUUID();
    assert.equal(timingSafeTokenEqual(t1, t1), true);
    assert.equal(timingSafeTokenEqual(t1, t2), false);
    assert.equal(timingSafeTokenEqual(t1, null), false);

    // Must execute without throwing
    burnPasswordCheck('NonExistentUserPassword123');
  });
});

describe('3. NoSQL Enjeksiyon Koruması, Parola Politikası, CSRF ve Kör İndeks Gizleme Testleri', () => {
  it('asString NoSQL operatör nesnelerini ({"$ne": ""}) güvenli biçimde reddeder', () => {
    assert.equal(asString({ $ne: '' }), '');
    assert.equal(asString({ $gt: '' }), '');
    assert.equal(asString(['admin']), '');
    assert.equal(asString(12345), '');
    assert.equal(asString('  test_user  ', 20), 'test_user');
    assert.equal(asString('abcdef', 3), 'abc');
  });

  it('clampInt, isSafeId ve escapeRegex sınır ve enjeksiyon kontrollerini sağlar', () => {
    assert.equal(clampInt('500', 1, 100, 10), 100);
    assert.equal(clampInt('-5', 0, 100, 10), 0);
    assert.equal(clampInt('abc', 1, 100, 25), 25);

    assert.equal(isSafeId('65f1a2b3c4d5e6f7a8b9c0d1'), true);
    assert.equal(isSafeId({ $ne: null }), false);
    assert.equal(isSafeId('id; DROP TABLE'), false);

    const escaped = escapeRegex('100. Yıl (Test)+');
    const re = new RegExp(escaped);
    assert.ok(re.test('100. Yıl (Test)+'));
  });

  it('getClientIp güvenilmeyen X-Forwarded-For başlıklarını yoksayar', () => {
    delete process.env.TRUSTED_PROXY_HOPS;
    const spoofedHeaders = new Headers({ 'x-forwarded-for': '1.2.3.4' });
    assert.equal(getClientIp({ headers: spoofedHeaders }), 'bilinmiyor');

    process.env.TRUSTED_PROXY_HOPS = '1';
    const proxyHeaders = new Headers({ 'x-forwarded-for': '9.9.9.9, 195.175.39.40' });
    assert.equal(getClientIp({ headers: proxyHeaders }), '195.175.39.40');
    delete process.env.TRUSTED_PROXY_HOPS;
  });

  it('Kurumsal parola politikasını (validatePasswordPolicy) eksiksiz uygular', () => {
    assert.notEqual(validatePasswordPolicy('1234'), null, 'Kısa şifre reddedilmeli');
    assert.notEqual(validatePasswordPolicy('12345678'), null, 'Sadece rakam reddedilmeli');
    assert.notEqual(validatePasswordPolicy('abcdefgh'), null, 'Sadece harf reddedilmeli');
    assert.notEqual(validatePasswordPolicy('admin123'), null, 'Yaygın zayıf şifre reddedilmeli');
    assert.notEqual(validatePasswordPolicy('gokhan1234', 'gokhan'), null, 'Kullanıcı adı içeren şifre reddedilmeli');
    assert.equal(validatePasswordPolicy('GucluSifre2026', 'gokhan'), null, 'Kurallara uygun güçlü şifre kabul edilmeli');
  });

  it('CSRF / Same-Origin kontrolü (isSameOriginRequest) farklı kaynaktan gelen istekleri engeller', () => {
    const sameOriginReq = {
      headers: new Headers({ 'sec-fetch-site': 'same-origin' }),
    };
    const crossSiteReq = {
      headers: new Headers({ 'sec-fetch-site': 'cross-site' }),
    };
    const evilOriginReq = {
      headers: new Headers({ origin: 'https://evil.example.com', host: 'komur.edirnesydv.gov.tr' }),
    };
    const matchingOriginReq = {
      headers: new Headers({ origin: 'https://komur.edirnesydv.gov.tr', host: 'komur.edirnesydv.gov.tr' }),
    };

    assert.equal(isSameOriginRequest(sameOriginReq), true);
    assert.equal(isSameOriginRequest(crossSiteReq), false);
    assert.equal(isSameOriginRequest(evilOriginReq), false);
    assert.equal(isSameOriginRequest(matchingOriginReq), true);
  });

  it('stripBlindHashes tüm kör indeks özetlerini (tc_hash, hane_hash, adres_hash vb.) yanıtlardan temizler', () => {
    const sample = {
      id: '10',
      tc_no: '12345678901',
      tc_hash: 'secret_hmac_1',
      hane_hash: 'secret_hmac_2',
      adres_hash: 'secret_hmac_3',
      duraklar: [
        { sira: 1, ad_soyad: 'Test', tc_hash: 'stop_hmac' },
      ],
    };
    const cleaned: any = stripBlindHashes(sample);
    assert.equal(cleaned.tc_no, '12345678901');
    assert.equal('tc_hash' in cleaned, false);
    assert.equal('hane_hash' in cleaned, false);
    assert.equal('adres_hash' in cleaned, false);
    assert.equal('tc_hash' in cleaned.duraklar[0], false);
  });
});

describe('4. Google Authenticator (RFC 6238 TOTP) 2FA Testleri', () => {
  it('160-bit Base32 TOTP sırrı üretir, güncel 6 haneli kodu doğrular ve çevrimdışı SVG QR üretir', () => {
    const secret = generateTotpSecret(20);
    assert.ok(secret.length >= 32);

    const nowMs = Date.now();
    const currentStep = Math.floor(nowMs / 30000);
    const validCode = generateTotpCode(secret, currentStep);
    assert.match(validCode, /^\d{6}$/);
    assert.equal(verifyTotpCode(secret, validCode, 1), true);
    assert.equal(verifyTotpCode(secret, '000000', 0) && validCode !== '000000', false);

    const recoveryCodes = generateRecoveryCodes(6);
    assert.equal(recoveryCodes.length, 6);

    const qrDataUrl = generateQrCodeSvgDataUrl('otpauth://totp/EdirneSYDV?secret=' + secret);
    assert.ok(qrDataUrl.startsWith('data:image/svg+xml;utf8,'));
  });
});

describe('5. Adres, Mahalle ve Vatandaş Normalizasyon Testleri', () => {
  it('TC Kimlik No temizleme, mahalle kanonikleştirme ve sokak/kapı ayrıştırma doğru çalışır', () => {
    assert.equal(cleanTcNo(' 123 456 789 01 '), '12345678901');
    assert.equal(normalizeMahalleName('100.Yıl Mahallesi'), '100. Yıl Mah.');
    assert.equal(normalizeMahalleName('Sabuni Mah'), 'Sabuni Mah.');

    const parsed = getRecordStreetInfo({ acik_adres: 'Cumhuriyet Mah. Atatürk Cad. No: 15 D: 3' });
    assert.equal(String(parsed.kapiNo), '15');
    assert.equal(parsed.daireNo, 3);

    const listInfo = getBeneficiaryListTypeInfo({ sira_no: 'Ek1 - 5', ek_liste_no: 1 });
    assert.equal(listInfo.type, 'EK_LISTE');
  });
});

describe('6. Oturum Yaşam Döngüsü, Kullanıcı Arındırma (sanitizeUser) ve mapDoc JSON Koruması Testleri', () => {
  it('mapDoc şifreli alanları şeffafça çözer ve kör indeks özetlerini (tc_hash vb.) JSON çıktısından gizler', () => {
    const encBen = encryptBeneficiary({
      id: '42',
      tc_no: '12345678901',
      ad_soyad: 'Fatma Kaya',
      telefon: '05320001122',
      acik_adres: 'Fatih Mah. No: 10',
      hane_no: '77',
    });

    const mapped: any = mapDoc(encBen);
    // Server-side code can read decrypted PII and non-enumerable tc_hash
    assert.equal(mapped.tc_no, '12345678901');
    assert.equal(mapped.ad_soyad, 'Fatma Kaya');
    assert.equal(mapped.tc_hash, hashTc('12345678901'));

    // JSON serialization (NextResponse.json) automatically omits non-enumerable blind hashes
    const jsonParsed = JSON.parse(JSON.stringify(mapped));
    assert.equal(jsonParsed.tc_no, '12345678901');
    assert.equal('tc_hash' in jsonParsed, false);
    assert.equal('hane_hash' in jsonParsed, false);
    assert.equal('adres_hash' in jsonParsed, false);
  });

  it('sanitizeUser parola özeti, oturum tokenı ve 2FA sırlarını istemci yanıtından tamamen temizler', () => {
    const rawUser = {
      id: '1',
      username: 'gokhan',
      ad_soyad: 'Gökhan SUÇSUZ',
      rol: 'ADMIN',
      sifre: 'eski_sifre',
      sifre_hash: hashPassword('TestSifre2026'),
      active_session_token: 'sha256_session_token_hash',
      totp_secret: 'JBSWY3DPEHPK3PXP',
      totp_pending_secret: 'JBSWY3DPEHPK3PXP',
      totp_recovery_codes: ['ABCD-1234'],
      totp_enabled: true,
    };

    const safe = sanitizeUser(rawUser);
    assert.equal(safe.username, 'gokhan');
    assert.equal(safe.rol, 'ADMIN');
    assert.equal('sifre' in safe, false);
    assert.equal('sifre_hash' in safe, false);
    assert.equal('active_session_token' in safe, false);
    assert.equal('totp_secret' in safe, false);
    assert.equal('totp_pending_secret' in safe, false);
    assert.equal('totp_recovery_codes' in safe, false);
  });

  it('6 saatlik kurumsal mutlak oturum süresini (isSessionExpired) doğru denetler', () => {
    const freshLogin = new Date(Date.now() - 30 * 60 * 1000).toISOString();
    const expiredLogin = new Date(Date.now() - SESSION_MAX_AGE_MS - 60 * 1000).toISOString();

    assert.equal(isSessionExpired(freshLogin), false);
    assert.equal(isSessionExpired(expiredLogin), true);
  });
});

describe('7. Saha Tek Hane Ekleme: Mükerrer TC Engeli & Aynı Adres Uyarı Tespiti Testleri', () => {
  it('Aynı T.C. Kimlik Numarası (farklı formatlarda girilse bile) blind index ile kesin olarak yakalanır', () => {
    const existingTc = cleanTcNo('12345678901');
    const inputTcWithSpaces = cleanTcNo(' 123 456 789 01 ');
    assert.equal(existingTc, inputTcWithSpaces);
    assert.equal(hashTc(existingTc), hashTc(inputTcWithSpaces));
  });

  it('Aynı adreste farklı yazım biçimleriyle (Sokak/Sk., Mah./Mahallesi, No/Kapı) kayıtlı başka hane olduğunda adres uyarısını yakalar', () => {
    const existingSettlement = detectSettlement('Yıldırım Beyazıt Mahallesi', '', 'Karanfil Sokak No: 14');
    const existingNorm = normalizeAddress(existingSettlement.name, 'Karanfil Sokak No: 14');

    const newSettlement = detectSettlement('Yıldırım Beyazıt Mah.', '', 'Karanfil Sk. Kapı No:14');
    const newNorm = normalizeAddress(newSettlement.name, 'Karanfil Sk. Kapı No:14');

    assert.equal(existingSettlement.name, newSettlement.name);
    assert.equal(existingNorm, newNorm);
    assert.equal(hashAddress(existingNorm), hashAddress(newNorm));

    // Sokak + Kapı No bazlı bina eşleşmesi (farklı daire veya tarif olsa bile aynı bina tespiti)
    const st1 = extractStreetAndDoor('Karanfil Sokak No: 14 Daire: 1', '', '', existingSettlement.name);
    const st2 = extractStreetAndDoor('Karanfil Sk. No: 14 D: 2 (Bahçe katı)', 'Karanfil Sk.', '14', newSettlement.name);

    assert.equal(normalizeStreetForCompare(st1.sokak), normalizeStreetForCompare(st2.sokak));
    assert.equal(st1.kapiNo, st2.kapiNo);
  });

  it('Önceki dönem arşivlendiğinde geçmiş dönem yüklenen Excel listeleri ve hatalı kayıtlar arşivlenir ve yeni dönemde sıfırlanır', async () => {
    const cols = await getDbCollections();

    // Önceki dönemden (2025-2026) kalan bir Excel listesi ve hata kaydı simüle et
    await cols.seasonArchives.insertOne({
      donem_kodu: '2025-2026',
      baslik: '2025-2026 Kömür Dağıtım Dönemi',
      kapanis_tarihi: '2026-05-01',
      kapanis_tarihi_iso: '2026-05-01T12:00:00.000Z',
    });

    await cols.archivedBeneficiaries.insertOne({
      batch_id: 'BATCH-OLD-2025',
      donem_kodu: '2025-2026',
      tc_no: '12345678901',
      ad_soyad: 'ESKİ DÖNEM VATANDAŞ',
    });

    await cols.importBatches.insertOne({
      batch_id: 'BATCH-OLD-2025',
      dosya_adi: 'Eski_Donem_Listesi.xlsx',
      eklenen_kisi: 100,
      elenen_kisi: 2,
      tarih_iso: '2025-11-10T10:00:00.000Z',
    });

    await cols.importLogs.insertOne({
      batch_id: 'BATCH-OLD-2025',
      durum: 'MUKERRER_TC',
      islem_sonucu: 'EKLENMEDİ',
      tc_no: '99999999999',
      ad_soyad: 'MÜKERRER KİŞİ',
    });

    // Otomatik uzlaştırma ve arşivleme çalıştığında:
    await reconcileArchivedSeasonImports();

    // Aktif dönem Excel listeleri ve hatalı kayıtlar sıfırlanmış (0) olmalı
    const activeBatchCount = await cols.importBatches.countDocuments({});
    const activeLogCount = await cols.importLogs.countDocuments({});
    assert.equal(activeBatchCount, 0);
    assert.equal(activeLogCount, 0);

    // Arşiv koleksiyonlarına geçmiş dönem koduyla taşınmış olmalı
    const archivedBatchCount = await cols.archivedImportBatches.countDocuments({ donem_kodu: '2025-2026' });
    const archivedLogCount = await cols.archivedImportLogs.countDocuments({ donem_kodu: '2025-2026' });
    assert.equal(archivedBatchCount, 1);
    assert.equal(archivedLogCount, 1);
  });
});
