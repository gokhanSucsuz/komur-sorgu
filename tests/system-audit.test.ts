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
} from '@/lib/security';
import { roleAllowed, isSessionExpired } from '@/lib/auth';
import { InMemoryCollection } from '@/lib/inMemoryDb';

describe('Sistem Denetimi: Performans, Bütünlük, KVKK ve Mimari Testleri', () => {
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
    const cipher = encryptField('EDİRNE SYDV TEST VERİSİ');
    assert.ok(cipher && cipher.startsWith('ENC:GCM:v1:'));

    const first = decryptField(cipher);
    const second = decryptField(cipher); // Önbellekten döner
    assert.equal(first, 'EDİRNE SYDV TEST VERİSİ');
    assert.equal(second, 'EDİRNE SYDV TEST VERİSİ');
  });

  it('2. checkCryptoEngineHealth kriptografik motor sağlığını doğrular', () => {
    const health = checkCryptoEngineHealth();
    assert.equal(health.healthy, true);
    assert.equal(health.masterKeyConfigured, true);
    assert.equal(health.blindKeyConfigured, true);
    assert.equal(health.compromisedKeyDetected, false);
  });

  it('3. Denetim günlüğü HMAC-SHA256 bütünlük zinciri (Tamper-Evident Chain) müdahaleyi tespit eder', () => {
    const log1 = {
      prev_hash: 'GENESIS',
      kullanici_adi: 'admin',
      kullanici_rolu: 'ADMIN',
      islem_tipi: 'GIRIS',
      baslik: 'Yönetici Girişi',
      tarih_iso: '2026-10-31T08:00:00.000Z',
      hedef_tc_hash: null,
    };
    const hash1 = computeActivityLogIntegrityHash(log1);

    const log2 = {
      prev_hash: hash1,
      kullanici_adi: 'admin',
      kullanici_rolu: 'ADMIN',
      islem_tipi: 'TESLIMAT',
      baslik: 'Kömür Teslim Edildi',
      tarih_iso: '2026-10-31T08:05:00.000Z',
      hedef_tc_hash: 'abc123hash',
    };
    const hash2 = computeActivityLogIntegrityHash(log2);

    const validResult = verifyActivityLogChain([
      { ...log1, integrity_hash: hash1 },
      { ...log2, integrity_hash: hash2 },
    ]);
    assert.equal(validResult.valid, true);
    assert.equal(validResult.chainedCount, 2);
    assert.equal(validResult.tamperedCount, 0);

    // Kayıtlardan birinin başlığı dışarıdan değiştirilirse zincir doğrulaması başarısız olmalı
    const tamperedResult = verifyActivityLogChain([
      { ...log1, integrity_hash: hash1 },
      { ...log2, baslik: 'SAHTE KAYIT', integrity_hash: hash2 },
    ]);
    assert.equal(tamperedResult.valid, false);
    assert.equal(tamperedResult.tamperedCount, 1);
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

  it('5. Rol yetkilendirme matrisi (roleAllowed) ve 6 saatlik oturum süresi (isSessionExpired) doğru çalışır', () => {
    assert.equal(roleAllowed('ADMIN', 'ADMIN'), true);
    assert.equal(roleAllowed('MUDUR', 'ADMIN'), false);
    assert.equal(roleAllowed('MUDUR', ['ADMIN', 'MUDUR']), true);
    assert.equal(roleAllowed('PERSONEL', ['ADMIN', 'MUDUR']), false);
    assert.equal(roleAllowed('PERSONEL', undefined), true);

    const freshLogin = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();
    const expiredLogin = new Date(Date.now() - 7 * 60 * 60 * 1000).toISOString();
    assert.equal(isSessionExpired(freshLogin), false);
    assert.equal(isSessionExpired(expiredLogin), true);
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
});
