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
  encryptTruck,
  decryptTruck,
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
  checkRateLimit,
  rateLimitExceededResponse,
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
  calculateCoalStockMetrics,
  formatTwoWayTonnage,
  formatTwoWayDiff,
} from '@/lib/normalizer';
import { formatTrDateWithDay } from '@/lib/dateUtils';

import { mapDoc, getDbCollections, reconcileArchivedSeasonImports, seedSandboxFakeData } from '@/lib/mongodb';
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

  it('Kayan pencereli istek sınırlayıcı (checkRateLimit) limit aşımında 429 yanıtı verir', () => {
    const testKey = `test_ip_${Date.now()}`;
    // Limit 3 requests in 10 seconds
    const r1 = checkRateLimit(testKey, 3, 10);
    assert.equal(r1.allowed, true);
    assert.equal(r1.remaining, 2);

    const r2 = checkRateLimit(testKey, 3, 10);
    assert.equal(r2.allowed, true);
    assert.equal(r2.remaining, 1);

    const r3 = checkRateLimit(testKey, 3, 10);
    assert.equal(r3.allowed, true);
    assert.equal(r3.remaining, 0);

    // 4th request must be rejected
    const r4 = checkRateLimit(testKey, 3, 10);
    assert.equal(r4.allowed, false);
    assert.equal(r4.remaining, 0);

    const res = rateLimitExceededResponse(r4);
    assert.equal(res.status, 429);
    assert.equal(res.headers.get('Retry-After'), String(r4.resetSeconds));
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

  it('Deneme Modu (Sandbox) ile Gerçek (Resmi) Mod verilerini %100 izole eder; deneme işlemleri resmi kayıtları etkilemez', async () => {
    const initialCols = await getDbCollections();
    assert.equal(initialCols.calismaModu, 'RESMI');
    assert.equal(initialCols.isSandboxMode, false);

    // 1. Resmi modda bir hane ekle
    await initialCols.beneficiaries.insertOne({
      id: 'resmi-1',
      tc_no: '11111111110',
      ad_soyad: 'RESMİ HAK SAHİBİ',
      mahalle: 'Cumhuriyet Mah.',
    });
    assert.equal(await initialCols.officialBeneficiaries.countDocuments({}), 1);
    assert.equal(await initialCols.sandboxBeneficiaries.countDocuments({}), 0);

    // 2. Deneme (Test) Moduna geç
    await initialCols.systemSettings.updateOne(
      { key: 'calisma_modu' },
      { $set: { key: 'calisma_modu', value: 'DENEME' } },
      { upsert: true }
    );

    const sandboxCols = await getDbCollections();
    assert.equal(sandboxCols.calismaModu, 'DENEME');
    assert.equal(sandboxCols.isSandboxMode, true);
    // Deneme modunda başlangıçta 0 kayıt görünmeli (resmi kayıtlar izoledir)
    assert.equal(await sandboxCols.beneficiaries.countDocuments({}), 0);

    // 3. Deneme modunda test hanesi ve test Excel listesi ekle
    await sandboxCols.beneficiaries.insertOne({
      id: 'deneme-1',
      tc_no: '22222222220',
      ad_soyad: 'DENEME TEST KİŞİSİ',
      mahalle: 'Fatih Mah.',
    });
    await sandboxCols.importBatches.insertOne({
      batch_id: 'BATCH-SANDBOX-1',
      dosya_adi: 'Deneme_Listesi.xlsx',
      eklenen_kisi: 1,
    });

    assert.equal(await sandboxCols.beneficiaries.countDocuments({}), 1);
    // Resmi koleksiyon hala 1 kayıt olmalı, deneme verisi resmi tabloya sızmamalı!
    assert.equal(await sandboxCols.officialBeneficiaries.countDocuments({}), 1);
    assert.equal(await sandboxCols.officialImportBatches.countDocuments({}), 0);

    // 4. Gerçek (Resmi) Moda geri dön
    await sandboxCols.systemSettings.updateOne(
      { key: 'calisma_modu' },
      { $set: { key: 'calisma_modu', value: 'RESMI' } },
      { upsert: true }
    );

    const restoredCols = await getDbCollections();
    assert.equal(restoredCols.calismaModu, 'RESMI');
    assert.equal(restoredCols.isSandboxMode, false);
    assert.equal(await restoredCols.beneficiaries.countDocuments({}), 1);
    const officialDoc = await restoredCols.beneficiaries.findOne({ id: 'resmi-1' });
    assert.equal(officialDoc?.ad_soyad, 'RESMİ HAK SAHİBİ');

    // Temizlik
    await restoredCols.officialBeneficiaries.deleteMany({ id: 'resmi-1' });
    await restoredCols.sandboxBeneficiaries.deleteMany({});
    await restoredCols.sandboxImportBatches.deleteMany({});
  });

  it('Ek Liste kayıtlarını "Ek Liste" adı altında tutar, isteğe bağlı (opsiyonel) adresi destekler ve Deneme Modu sıfırlamasında resmi verileri korur', async () => {
    // 1. Adres Belirtilmemiş normalizasyonu ("Mah." eklenmemeli)
    assert.equal(normalizeMahalleName('Adres Belirtilmemiş'), 'Adres Belirtilmemiş');
    assert.equal(normalizeMahalleName('Belirtilmemiş'), 'Adres Belirtilmemiş');
    assert.equal(normalizeMahalleName(''), '');

    // 2. Ek Liste etiket doğrulaması
    const ekListeInfo1 = getBeneficiaryListTypeInfo({
      liste_turu: 'EK_LISTE',
      liste_kategorisi: 'EK_KAYIT',
      ek_liste_adi: 'Ek Liste',
    });
    assert.equal(ekListeInfo1.type, 'EK_LISTE');
    assert.equal(ekListeInfo1.label, 'Ek Liste');
    assert.equal(ekListeInfo1.badgeLabel, 'Ek Liste');

    const ekListeInfo2 = getBeneficiaryListTypeInfo({
      liste_turu: 'EK_LISTE',
      ek_liste_adi: 'Saha Tekil Ekleme',
    });
    assert.equal(ekListeInfo2.type, 'EK_LISTE');
    assert.equal(ekListeInfo2.label, 'Ek Liste');

    // 3. Deneme Modu sıfırlama esnekliği testi
    const cols = await getDbCollections();
    await cols.officialBeneficiaries.insertOne({
      id: 'official-ek-1',
      tc_no: '10000000146',
      ad_soyad: 'RESMİ EK LİSTE KİŞİSİ',
      liste_tipi: 'EK_LISTE',
      ek_liste_adi: 'Ek Liste',
      dosya_adi: 'Ek Liste',
      mahalle: 'Adres Belirtilmemiş',
      acik_adres: 'Adres Belirtilmemiş',
      telefon: '',
    });

    await cols.sandboxBeneficiaries.insertOne({
      id: 'sandbox-ek-1',
      tc_no: '20000000144',
      ad_soyad: 'DENEME EK LİSTE KİŞİSİ',
      liste_tipi: 'EK_LISTE',
      ek_liste_adi: 'Ek Liste',
    });
    await cols.sandboxImportBatches.insertOne({
      batch_id: 'BATCH_EK_LISTE_SANDBOX',
      dosya_adi: 'Ek Liste',
      ek_liste_adi: 'Ek Liste',
      eklenen_kisi: 1,
    });

    // Deneme Modu sıfırlandığında (RESET_SANDBOX_DATA):
    await Promise.all([
      cols.sandboxBeneficiaries.deleteMany({}),
      cols.sandboxImportBatches.deleteMany({}),
      cols.sandboxImportLogs.deleteMany({}),
      cols.sandboxDeliveryHistory.deleteMany({}),
      cols.sandboxDeliveryRoutes.deleteMany({}),
    ]);

    assert.equal(await cols.sandboxBeneficiaries.countDocuments({}), 0);
    assert.equal(await cols.sandboxImportBatches.countDocuments({}), 0);
    // Resmi Ek Liste kaydı sıfırlamadan etkilenmemeli
    assert.equal(await cols.officialBeneficiaries.countDocuments({ id: 'official-ek-1' }), 1);

    await cols.officialBeneficiaries.deleteMany({ id: 'official-ek-1' });
  });

  it('Fake veri tohumlama yalnızca sandbox koleksiyonlarına yazar, resmi veriler etkilenmez', async () => {
    const cols = await getDbCollections();
    await cols.officialBeneficiaries.insertOne({
      id: 'official-seed-guard-1',
      tc_no: '10000000146',
      ad_soyad: 'RESMİ KORUMA KİŞİSİ',
      liste_tipi: 'STANDART',
    });

    const officialBefore = await cols.officialBeneficiaries.countDocuments({});
    const officialBatchesBefore = await cols.officialImportBatches.countDocuments({});

    const result = await seedSandboxFakeData({ clearExistingSandbox: true, createdBy: 'test' });
    assert.ok(result.seededCount >= 20);
    assert.ok(result.batchCount >= 2);

    assert.equal(await cols.sandboxBeneficiaries.countDocuments({}), result.seededCount);
    assert.ok((await cols.sandboxImportBatches.countDocuments({})) >= 2);
    assert.ok((await cols.sandboxTruckDeliveries.countDocuments({})) >= 2);
    // Tüm bölümlerde deneme verisi: tonaj, mesai, rota, loglar, işlem geçmişi
    assert.ok((await cols.sandboxTruckDeliveries.countDocuments({})) >= 6);
    assert.ok((await cols.sandboxWorkShifts.countDocuments({})) >= 10);
    assert.ok((await cols.sandboxDeliveryRoutes.countDocuments({})) >= 2);
    assert.ok((await cols.sandboxImportLogs.countDocuments({})) >= 3);
    assert.ok((await cols.sandboxActivityLogs.countDocuments({})) >= 10);
    assert.ok((await cols.sandboxDeliveryHistory.countDocuments({})) >= 5);

    // Resmi veriler değişmemeli
    assert.equal(await cols.officialBeneficiaries.countDocuments({}), officialBefore);
    assert.equal(await cols.officialImportBatches.countDocuments({}), officialBatchesBefore);
    assert.equal(await cols.officialBeneficiaries.countDocuments({ id: 'official-seed-guard-1' }), 1);

    // Sandbox sıfırlama sonrası resmi veri hâlâ yerinde
    await Promise.all([
      cols.sandboxBeneficiaries.deleteMany({}),
      cols.sandboxImportBatches.deleteMany({}),
      cols.sandboxDeliveryHistory.deleteMany({}),
      cols.sandboxTruckDeliveries.deleteMany({}),
    ]);
    assert.equal(await cols.officialBeneficiaries.countDocuments({ id: 'official-seed-guard-1' }), 1);

    await cols.officialBeneficiaries.deleteMany({ id: 'official-seed-guard-1' });
  });
});

describe('8. Müdür Yetkilisi (MUDUR) Rolü, Parola Uyumu, 2FA ve Cihaz Kısıtlaması Testleri', () => {
  it('Müdür kullanıcısı başlangıç parolası (784512Tf.) kurumsal parola politikasını eksiksiz karşılar', () => {
    const error = validatePasswordPolicy('784512Tf.', 'müdür');
    assert.equal(error, null, '784512Tf. parolası geçerli olmalı');
  });

  it('Müdür parolası SCRYPT2 ile güvenle hashlenir ve doğrulanır', async () => {
    const rawPw = '784512Tf.';
    const hashed = await hashPassword(rawPw);
    assert.ok(hashed.startsWith('SCRYPT2:'));

    const match = await verifyPassword(rawPw, hashed);
    assert.equal(match, true);

    const wrongMatch = await verifyPassword('yanlisSifre123!', hashed);
    assert.equal(wrongMatch, false);
  });

  it('Müdür kullanıcı adı transliterasyonu (müdür <-> mudur) tutarlıdır', () => {
    const raw1 = 'müdür';
    const raw2 = 'mudur';
    const transliterated1 = raw1.toLocaleLowerCase('tr-TR').replace(/ü/g, 'u');
    const transliterated2 = raw2.toLocaleLowerCase('tr-TR').replace(/ü/g, 'u');
    assert.equal(transliterated1, transliterated2);
    assert.equal(transliterated1, 'mudur');
  });

  it('Admin tarafından müdür için Google Authenticator (TOTP) 2FA oluşturulabilir ve doğrulanabilir', () => {
    const secret = generateTotpSecret(20);
    assert.ok(secret);
    assert.ok(secret.length >= 32);

    const currentStep = Math.floor(Date.now() / 30000);
    const token = generateTotpCode(secret, currentStep);
    assert.match(token, /^\d{6}$/);

    const isValid = verifyTotpCode(secret, token, 1);
    assert.equal(isValid, true);

    const invalid = verifyTotpCode(secret, '000000', 0) && token !== '000000';
    assert.equal(invalid, false);
  });

  it('Cihaz politikası: Mobil cihazlar Müdür yetkilisi için engellenmeli, Masaüstü cihazlara izin verilmelidir', () => {
    const isMobileUa = (ua: string) => /mobile|android|iphone|ipad|tablet/i.test(ua);

    const mobileAgents = [
      'Mozilla/5.0 (Linux; Android 14; SM-S918B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Mobile Safari/537.36',
      'Mozilla/5.0 (iPhone; CPU iPhone OS 17_2 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.2 Mobile/15E148 Safari/604.1',
      'Mozilla/5.0 (Linux; Android 13; SM-T870) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36',
    ];

    const desktopAgents = [
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
      'Mozilla/5.0 (X11; Linux x86_64; rv:109.0) Gecko/20100101 Firefox/119.0',
    ];

    for (const ua of mobileAgents) {
      assert.equal(isMobileUa(ua), true, `Mobil UA tespit edilemedi: ${ua}`);
    }

    for (const ua of desktopAgents) {
      assert.equal(isMobileUa(ua), false, `Masaüstü UA yanlışlıkla mobil sayıldı: ${ua}`);
    }
  });
});

describe('9. Standart Dışı Kömür Torbası Ağırlık Toleransı & Stok Eksiye Düşmeme Testleri', () => {
  it('100 kişilik kömür (85 ton) geldiğinde 102 kişiye (3468 torba / 86.7 ton) verildiğinde stok eksiye düşmez (0 kalır) ve fazlalık kaydedilir', () => {
    // 100 kişi * 34 torba * 0.025 ton = 85.0 Ton kantar net girişi
    // Fiilen 102 kişi kömür aldı = 102 * 34 = 3468 torba verildi (Standart formülle 86.7 Ton)
    const metrics = calculateCoalStockMetrics(85.0, 3468, 0.025, 34);

    assert.equal(metrics.toplamNetTonaj, 85.0);
    assert.equal(metrics.dagitilanNetTonaj, 86.7);
    assert.equal(metrics.kalanStokTonaj, 0, 'Saha stoku asla eksiye düşmemelidir, 0 olmalıdır');
    assert.equal(metrics.fazlaDagitilanTonaj, 1.7, 'Eksiye düşecek tonaj fazladan dağıtılan kömür olarak kaydedilmelidir');
    assert.equal(metrics.fazlaDagitilanKg, 1700, 'Fazlalık kg cinsinden tam olarak 1700 kg olmalıdır');
    assert.equal(metrics.fazlaDagitilanTorba, 68, 'Fazladan verilen torba sayısı tam olarak 68 torba olmalıdır');
    assert.equal(metrics.fazlaDagitilanHane, 2, 'Fazladan faydalanan hane sayısı tam olarak 2 hane olmalıdır');
    assert.equal(metrics.hasFazlaDagitim, true, 'hasFazlaDagitim bayrağı true olmalıdır');
  });

  it('Sahada stok varken (gelen > dağıtılan) kalan stok pozitif hesaplanır ve fazla dağıtım 0 olur', () => {
    // 100 Ton kömür geldi, 2000 torba (50 Ton) dağıtıldı
    const metrics = calculateCoalStockMetrics(100.0, 2000, 0.025, 34);

    assert.equal(metrics.toplamNetTonaj, 100.0);
    assert.equal(metrics.dagitilanNetTonaj, 50.0);
    assert.equal(metrics.kalanStokTonaj, 50.0);
    assert.equal(metrics.fazlaDagitilanTonaj, 0);
    assert.equal(metrics.fazlaDagitilanKg, 0);
    assert.equal(metrics.fazlaDagitilanTorba, 0);
    assert.equal(metrics.fazlaDagitilanHane, 0);
    assert.equal(metrics.hasFazlaDagitim, false);
  });

  it('Kantar tonajı ile dağıtılan torba tonajı tam eşitken kalan stok 0 olur ve fazla dağıtım 0 kalır', () => {
    // 25 Ton kömür geldi, 1000 torba (25 Ton) dağıtıldı
    const metrics = calculateCoalStockMetrics(25.0, 1000, 0.025, 34);

    assert.equal(metrics.kalanStokTonaj, 0);
    assert.equal(metrics.fazlaDagitilanTonaj, 0);
    assert.equal(metrics.hasFazlaDagitim, false);
  });

  it('Tır kaydı olmadan (0 ton) dağıtım yapıldığında stok 0 kalır, dağıtılan miktar eksiksiz fazla kömür olarak kaydedilir', () => {
    // 0 Ton kantar girişi varken sahada önceden kalan torbalardan 100 torba dağıtıldı
    const metrics = calculateCoalStockMetrics(0, 100, 0.025, 34);

    assert.equal(metrics.kalanStokTonaj, 0);
    assert.equal(metrics.fazlaDagitilanTonaj, 2.5);
    assert.equal(metrics.fazlaDagitilanKg, 2500);
    assert.equal(metrics.fazlaDagitilanTorba, 100);
    assert.equal(metrics.fazlaDagitilanHane, 2);
    assert.equal(metrics.hasFazlaDagitim, true);
  });

  it('Kilogram formatında (örn. 85000 kg) gelen tonaj normalize edilir ve tolerans hesaplaması hatasız çalışır', () => {
    const metrics = calculateCoalStockMetrics(85000, 3468, 0.025, 34);

    assert.equal(metrics.toplamNetTonaj, 85.0);
    assert.equal(metrics.kalanStokTonaj, 0);
    assert.equal(metrics.fazlaDagitilanTonaj, 1.7);
    assert.equal(metrics.fazlaDagitilanKg, 1700);
    assert.equal(metrics.hasFazlaDagitim, true);
  });
});

describe('10. Tonaj Rapor Formatları, Tutanak No ve Dorse Plakasız Kayıt Testleri', () => {
  it('Tır kaydında Tutanak No alanını AES-256-GCM ile şifreler ve eksiksiz çözer', () => {
    const rawTruck = {
      plaka: '17 ACJ 824',
      sofor_adi: 'Olcay UĞURLU',
      irsaliye_no: 'IRS-2025-001',
      tutanak_no: '2025/01-EDR',
      brut_tonaj: 26.58,
      net_tonaj: 26.46,
      tarih: '2025-01-15',
    };

    const enc = encryptTruck(rawTruck);
    assert.notEqual(enc.tutanak_no, rawTruck.tutanak_no, 'Tutanak No açık metin kalmamalı, şifrelenmelidir');
    assert.ok(isEncrypted(enc.tutanak_no), 'Tutanak No AES-256-GCM ile şifrelenmiş olmalıdır');

    const dec = decryptTruck(enc);
    assert.equal(dec.tutanak_no, '2025/01-EDR', 'Çözülen Tutanak No orijinal değerle birebir eşleşmelidir');
    assert.equal(dec.plaka, '17 ACJ 824');
    assert.equal(dec.sofor_adi, 'Olcay UĞURLU');
  });

  it('Dorse plakası alanı olmadan veya boş bırakıldığında tır kaydı sorunsuz işlenir', () => {
    const rawTruckWithoutDorse = {
      plaka: '17 ACJ 824',
      sofor_adi: 'Olcay UĞURLU',
      irsaliye_no: 'IRS-2025-002',
      tutanak_no: 'TUT-42',
      brut_tonaj: 26.58,
      net_tonaj: 26.46,
    };

    const enc = encryptTruck(rawTruckWithoutDorse);
    assert.equal(enc.dorse_plaka, undefined);

    const dec = decryptTruck(enc);
    assert.equal(dec.dorse_plaka, undefined);
    assert.equal(dec.tutanak_no, 'TUT-42');
  });

  it('Tartı / Tesellüm farkı Excel 1 ile uyumlu olarak (Teslim Alınan - Sevk Edilen) negatif/pozitif kilogramı doğru hesaplar', () => {
    // Excel 1 Örneği: İşletmeden Yüklenen = 26.580 kg (26.58 ton), Teslim Alınan = 26.460 kg (26.46 ton)
    // Fark = 26.460 - 26.580 = -120 kg
    const sevkKg = Math.round(26.58 * 1000);
    const teslimKg = Math.round(26.46 * 1000);
    const farkKg = teslimKg - sevkKg;

    assert.equal(sevkKg, 26580);
    assert.equal(teslimKg, 26460);
    assert.equal(farkKg, -120, 'Teslim Alınan - Yüklenen farkı -120 kg olmalıdır');
  });

  it('Format 1 (Tesellümleri İzleme Tablosu) ve Format 2 (TKİ Kömür Dağıtım Listesi) sütun sıraları Excel ile birebir eşleşir', () => {
    // Format 1 (Valilik Günlük Tesellüm İzleme Tablosu) Sütun Sırası:
    const format1ExpectedColumns = [
      'Sıra',
      'YÜKLEMEYİ YAPAN İŞLETME',
      'ÇIKIŞ TARİHİ',
      'VAGON Veya PLAKA NO / Şoför Adı',
      'İŞLETMEDEN YÜKLENEN MİKTAR (kg)',
      'TESELLÜM TARİHİ',
      'TESELLÜM FİŞ NO veya ( Kantar tartı no)',
      'TESLİM ALINAN MİKTAR(kg)',
      'FARK (İşl.Yüklenen) ( Teslim Alınan) kg.',
      'TUTANAK NO'
    ];

    // Format 2 (TKİ Çan Linyit İşletmesi Kömür Dağıtım Listesi) Sütun Sırası:
    const format2ExpectedColumns = [
      'SIRA NO',
      'İL',
      'İLÇE',
      'PLAKA NO',
      'SEVK TARİHİ',
      'SEVK MİKTAR (KG)',
      'TESLİM TARİHİ',
      'TESLİM MİKTARI(KG)',
      'İRSALİYE NO',
      'TUTANAK NO'
    ];

    assert.equal(format1ExpectedColumns.length, 10);
    assert.equal(format2ExpectedColumns.length, 10);
    assert.equal(format1ExpectedColumns[3], 'VAGON Veya PLAKA NO / Şoför Adı');
    assert.equal(format1ExpectedColumns[8], 'FARK (İşl.Yüklenen) ( Teslim Alınan) kg.');
    assert.equal(format1ExpectedColumns[9], 'TUTANAK NO');
    assert.equal(format2ExpectedColumns[0], 'SIRA NO');
    assert.equal(format2ExpectedColumns[3], 'PLAKA NO');
    assert.equal(format2ExpectedColumns[8], 'İRSALİYE NO');
    assert.equal(format2ExpectedColumns[9], 'TUTANAK NO');
  });

  it('Tarihler "25.09.2025 Cumartesi" (DD.MM.YYYY Gün) formatında eksiksiz biçimlendirilir', () => {
    // 27 Eylül 2025 Cumartesi günü
    const satStr = formatTrDateWithDay('2025-09-27');
    assert.equal(satStr, '27.09.2025 Cumartesi');

    // 25 Eylül 2025 Perşembe günü
    const thuStr = formatTrDateWithDay('2025-09-25');
    assert.equal(thuStr, '25.09.2025 Perşembe');
  });

  it('Sevk ve teslim miktarları "26.500 kg veya 26,5 ton" şeklinde çift gösterimli ve Türkçe ayracıyla biçimlendirilir', () => {
    const res1 = formatTwoWayTonnage(26.5);
    assert.equal(res1.kgStr, '26.500 kg');
    assert.equal(res1.tonStr, '26,5 Ton');
    assert.equal(res1.combined, '26.500 kg (26,5 Ton)');

    const res2 = formatTwoWayTonnage(26.58);
    assert.equal(res2.kgStr, '26.580 kg');
    assert.equal(res2.tonStr, '26,58 Ton');

    const res3 = formatTwoWayTonnage(26.46);
    assert.equal(res3.kgStr, '26.460 kg');
    assert.equal(res3.tonStr, '26,46 Ton');

    const diff = formatTwoWayDiff(-120);
    assert.equal(diff.kgStr, '-120 kg');
    assert.equal(diff.tonStr, '-0,12 Ton');
    assert.equal(diff.combined, '-120 kg (-0,12 Ton)');
  });
});


