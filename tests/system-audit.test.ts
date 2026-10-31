import { describe, it, before } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import {
  encryptField,
  decryptField,
  clearDecryptionCache,
  computeActivityLogIntegrityHash,
  verifyActivityLogChain,
  checkCryptoEngineHealth,
} from '@/lib/crypto';
import {
  maskTcNo,
  maskPhone,
  maskName,
  isRetentionExpired,
  anonymizeBeneficiaryRecord,
  sanitizeJsonPayload,
  sanitizeSpreadsheetCell,
} from '@/lib/security';
import {
  roleAllowed,
  isSessionExpired,
  isSessionIdleExpired,
  computeSessionContextHash,
} from '@/lib/auth';
import { InMemoryCollection } from '@/lib/inMemoryDb';

describe('Sistem Denetimi: Performans, Bütünlük, KVKK ve Sıfır-Güven (Zero-Trust) Testleri', () => {
  before(() => {
    if (!process.env.ENCRYPTION_MASTER_KEY) {
      process.env.ENCRYPTION_MASTER_KEY = crypto.randomBytes(32).toString('hex');
    }
    if (!process.env.BLIND_INDEX_KEY) {
      process.env.BLIND_INDEX_KEY = crypto.randomBytes(32).toString('hex');
    }
  });

  it('1. AES-256-GCM şifre çözme mikro-önbelleği (LRU cache) doğru çalışır ve anahtar değişiminde sıfırlanır', () => {
    clearDecryptionCache();
    const plain = 'EDİRNE MERKEZ ŞÜKRÜPAŞA MAH. 123. SOK NO: 4';
    const cipher = encryptField(plain);
    assert.ok(cipher && cipher.startsWith('ENC:GCM:v1:'));

    const first = decryptField(cipher);
    const second = decryptField(cipher);
    assert.equal(first, plain);
    assert.equal(second, plain);

    // Anahtar değiştiğinde önbellek otomatik temizlenmeli
    const oldKey = process.env.ENCRYPTION_MASTER_KEY;
    process.env.ENCRYPTION_MASTER_KEY = crypto.randomBytes(32).toString('hex');
    const wrongKeyResult = decryptField(cipher);
    assert.equal(wrongKeyResult, '***[ŞİFRELİ VERİ DEŞİFRE EDİLEMEDİ]***');
    process.env.ENCRYPTION_MASTER_KEY = oldKey;
    assert.equal(decryptField(cipher), plain);
  });

  it('2. checkCryptoEngineHealth kriptografik motor sağlığını doğrular ve aşırı büyük şifreli metinleri reddeder', () => {
    const status = checkCryptoEngineHealth();
    assert.equal(status.healthy, true);
    assert.equal(status.masterKeyConfigured, true);

    const oversized = 'ENC:GCM:v1:' + 'a'.repeat(70000);
    assert.equal(decryptField(oversized), '***[ŞİFRELİ VERİ DEŞİFRE EDİLEMEDİ]***');
  });

  it('3. Denetim günlüğü HMAC-SHA256 bütünlük zinciri (Tamper-Evident Chain) müdahaleyi tespit eder', () => {
    const log1 = {
      kullanici_adi: 'admin',
      islem_tipi: 'GIRIS',
      baslik: 'Yönetici Girişi',
      detay: 'Başarılı giriş',
      tarih: '2026-10-31 10:00:00',
      timestamp: 1761904800000,
      prev_hash: 'GENESIS',
      integrity_hash: '',
    };
    log1.integrity_hash = computeActivityLogIntegrityHash(log1);

    const log2 = {
      kullanici_adi: 'personel1',
      islem_tipi: 'TESLIMAT',
      baslik: 'Kömür Teslimatı',
      detay: '34 Torba teslim edildi',
      tarih: '2026-10-31 10:05:00',
      timestamp: 1761905100000,
      prev_hash: log1.integrity_hash,
      integrity_hash: '',
    };
    log2.integrity_hash = computeActivityLogIntegrityHash(log2);

    const validResult = verifyActivityLogChain([log2, log1]);
    assert.equal(validResult.valid, true);
    assert.equal(validResult.tamperedCount, 0);

    // Kayıt üzerinde yetkisiz değişiklik simülasyonu
    const tamperedLog2 = { ...log2, baslik: '10 Torba teslim edildi (DEĞİŞTİRİLDİ)' };
    const invalidResult = verifyActivityLogChain([tamperedLog2, log1]);
    assert.equal(invalidResult.valid, false);
    assert.equal(invalidResult.tamperedCount, 1);
  });

  it('4. KVKK Madde 7 maskeleme, saklama süresi ve anonimleştirme yardımcıları kişisel verileri temizler', () => {
    assert.equal(maskTcNo('12345678901'), '123*****901');
    assert.equal(maskPhone('05551234567'), '0555***4567');
    assert.equal(maskName('AHMET YILMAZ'), 'AH*** YI****');

    assert.equal(isRetentionExpired('2010-01-01T00:00:00.000Z', 10), true);
    assert.equal(isRetentionExpired(new Date().toISOString(), 10), false);

    const anon = anonymizeBeneficiaryRecord({
      tc_no: '12345678901',
      tc_hash: 'secret_hash',
      ad_soyad: 'AHMET YILMAZ',
      telefon: '05551234567',
      mahalle: 'Şükrüpaşa Mah.',
      acik_adres: 'Şükrüpaşa Mah. 1. Sok No: 5',
      hane_no: 'H101',
      hane_hash: 'secret_hane_hash',
      torba_sayisi: 34,
      teslimat_durumu: 'TAMAMLANDI',
      teslim_alan: 'AHMET YILMAZ',
    });

    assert.equal(anon.tc_no, 'ANONIM');
    assert.equal(anon.tc_hash, null);
    assert.equal(anon.hane_hash, null);
    assert.equal(anon.telefon, null);
    assert.equal(anon.mahalle, 'Şükrüpaşa Mah.');
    assert.equal(anon.torba_sayisi, 34);
  });

  it('5. Rol yetkilendirme matrisi, 6 saat mutlak oturum, 60 dk hareketsizlik ve User-Agent bağlam imzası doğru çalışır', () => {
    assert.equal(roleAllowed('ADMIN', 'ADMIN'), true);
    assert.equal(roleAllowed('MUDUR', 'ADMIN'), false);
    assert.equal(roleAllowed('MUDUR', ['ADMIN', 'MUDUR']), true);
    assert.equal(roleAllowed('PERSONEL', ['ADMIN', 'MUDUR']), false);
    assert.equal(roleAllowed('PERSONEL', undefined), true);

    const freshLogin = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();
    const expiredLogin = new Date(Date.now() - 7 * 60 * 60 * 1000).toISOString();
    assert.equal(isSessionExpired(freshLogin), false);
    assert.equal(isSessionExpired(expiredLogin), true);

    const activeRecent = new Date(Date.now() - 15 * 60 * 1000).toISOString();
    const idleTooLong = new Date(Date.now() - 75 * 60 * 1000).toISOString();
    assert.equal(isSessionIdleExpired(activeRecent), false);
    assert.equal(isSessionIdleExpired(idleTooLong), true);

    const reqChrome = { headers: { get: (k: string) => (k === 'user-agent' ? 'Mozilla/5.0 Chrome/130' : null) } };
    const reqCurl = { headers: { get: (k: string) => (k === 'user-agent' ? 'curl/8.5.0' : null) } };
    assert.notEqual(computeSessionContextHash(reqChrome), computeSessionContextHash(reqCurl));
    assert.equal(computeSessionContextHash(reqChrome), computeSessionContextHash(reqChrome));
  });

  it('6. Ayrıştırılmış InMemoryCollection modülü CRUD ve filtreleme işlemlerini eksiksiz yürütür', async () => {
    const col = new InMemoryCollection('test_audit_collection');
    await col.deleteMany({});
    await col.insertMany([
      { kod: 'A1', miktar: 10 },
      { kod: 'A2', miktar: 30 },
    ]);
    const count = await col.countDocuments({ miktar: { $gte: 20 } });
    assert.equal(count, 1);
    await col.updateOne({ kod: 'A1' }, { $set: { miktar: 25 }, $unset: { gecici: '' } });
    const updated = await col.findOne({ kod: 'A1' });
    assert.equal(updated?.miktar, 25);
    await col.deleteMany({});
  });

  it('7. sanitizeJsonPayload Prototype Pollution, NoSQL operatör enjeksiyonu ve null-byte saldırılarını temizler', () => {
    const rawMalicious = JSON.parse(
      '{"username":"admin\\u0000","$where":"this.a == 1","nested":{"$gt":"","safe":"ok","a.b":"dot"},"__proto__":{"polluted":true}}'
    );
    const cleaned = sanitizeJsonPayload(rawMalicious);
    assert.equal(cleaned.username, 'admin');
    assert.equal('$where' in cleaned, false);
    assert.equal('$gt' in cleaned.nested, false);
    assert.equal('a.b' in cleaned.nested, false);
    assert.equal(cleaned.nested.safe, 'ok');
    assert.equal(({} as Record<string, unknown>).polluted, undefined);
  });

  it('8. sanitizeSpreadsheetCell Excel/CSV formül (DDE) enjeksiyonlarını etkisizleştirir ve negatif sayıları korur', () => {
    assert.equal(sanitizeSpreadsheetCell('=cmd|\' /C calc\'!A0'), '\'=cmd|\' /C calc\'!A0');
    assert.equal(sanitizeSpreadsheetCell('+HYPERLINK("http://evil.tld")'), '\'+HYPERLINK("http://evil.tld")');
    assert.equal(sanitizeSpreadsheetCell('@SUM(A1:A10)'), '\'@SUM(A1:A10)');
    assert.equal(sanitizeSpreadsheetCell('-150'), '-150');
    assert.equal(sanitizeSpreadsheetCell('Şükrüpaşa Mah.'), 'Şükrüpaşa Mah.');
  });

  it('9. Bootstrap parola üretimi CWE-532 log sızıntısı içermez ve üretim ortamında fail-closed davranır', async () => {
    const fs = await import('node:fs');
    const inMemorySrc = fs.readFileSync('src/lib/inMemoryDb.ts', 'utf8');
    assert.equal(
      inMemorySrc.includes('Generated ephemeral bootstrap password'),
      false,
      'inMemoryDb.ts must never log plaintext bootstrap passwords to console'
    );
    assert.equal(
      inMemorySrc.includes("process.env.NODE_ENV === 'production'"),
      true,
      'inMemoryDb.ts must enforce fail-closed bootstrap password check in production'
    );
  });
});
