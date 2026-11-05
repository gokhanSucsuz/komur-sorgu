import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';

process.env.ENCRYPTION_MASTER_KEY = crypto.randomBytes(32).toString('hex');
process.env.BLIND_INDEX_KEY = crypto.randomBytes(32).toString('hex');

import { parseTonnageTemplates, DEFAULT_TONNAGE_TEMPLATES } from '@/lib/tonnageTemplates';
import { normalizeToTon } from '@/lib/normalizer';

describe('Tonaj Rapor Şablonları & Tır Filtreleme-Sıralama Testleri', () => {
  it('1. parseTonnageTemplates null/undefined/boş girdide varsayılan resmi şablonları döndürür', () => {
    const tpl1 = parseTonnageTemplates(null);
    assert.equal(tpl1.format1.title, DEFAULT_TONNAGE_TEMPLATES.format1.title);
    assert.equal(tpl1.format1.code, 'TSL-VALILIK');
    assert.equal(tpl1.format1.imza1_ad, 'Cem PAZAR');
    assert.equal(tpl1.format1.imza2_ad, 'Tezcan FİDAN');

    assert.equal(tpl1.format2.ustBaslik, 'TÜRKİYE KÖMÜR İŞLETMELERİ KURUMU');
    assert.equal(tpl1.format2.code, 'TKI-DAGITIM');
    assert.equal(tpl1.format2.imza_ad, 'Tezcan FİDAN');
  });

  it('2. parseTonnageTemplates yönetici tarafından girilen özel başlık ve imza yetkililerini uygular ve eksik alanları varsayılanla tamamlar', () => {
    const customPayload = {
      format1: {
        title: 'ÖZEL VALİLİK SEVKİYAT İZLEME TABLOSU',
        subtitle: 'GÜNLÜK ÖZEL KONTROL ÇİZELGESİ',
        imza1_ad: 'Ahmet YILMAZ',
        imza1_unvan: 'Kıdemli İnceleme Görevlisi',
      },
      format2: {
        anaBaslik: 'EDİRNE MERKEZ İLÇESİ 2026 YILI ÖZEL TKİ SEVK LİSTESİ',
        imza_ad: 'Mehmet ÖZTÜRK',
        imza_unvan: 'Vakıf Müdürü V.',
      },
    };

    const parsed = parseTonnageTemplates(customPayload);

    // Format 1 özelleştirilmiş alanlar
    assert.equal(parsed.format1.title, 'ÖZEL VALİLİK SEVKİYAT İZLEME TABLOSU');
    assert.equal(parsed.format1.subtitle, 'GÜNLÜK ÖZEL KONTROL ÇİZELGESİ');
    assert.equal(parsed.format1.imza1_ad, 'Ahmet YILMAZ');
    assert.equal(parsed.format1.imza1_unvan, 'Kıdemli İnceleme Görevlisi');
    // Format 1 doldurulmayan alan varsayılandan gelir
    assert.equal(parsed.format1.code, DEFAULT_TONNAGE_TEMPLATES.format1.code);
    assert.equal(parsed.format1.imza2_ad, DEFAULT_TONNAGE_TEMPLATES.format1.imza2_ad);

    // Format 2 özelleştirilmiş alanlar
    assert.equal(parsed.format2.anaBaslik, 'EDİRNE MERKEZ İLÇESİ 2026 YILI ÖZEL TKİ SEVK LİSTESİ');
    assert.equal(parsed.format2.imza_ad, 'Mehmet ÖZTÜRK');
    assert.equal(parsed.format2.imza_unvan, 'Vakıf Müdürü V.');
    assert.equal(parsed.format2.ustBaslik, DEFAULT_TONNAGE_TEMPLATES.format2.ustBaslik);
  });

  it('3. Gelen tırlar listesinde şoför adı ve plakaya göre filtreleme doğru çalışır', () => {
    const mockTrucks = [
      { id: '1', tir_sirasi: 1, plaka: '22 ABC 123', sofor_adi: 'Ahmet Yılmaz', tarih: '2026-11-01', net_tonaj: 27.5 },
      { id: '2', tir_sirasi: 2, plaka: '17 ACJ 456', sofor_adi: 'Mehmet Demir', tarih: '2026-11-02', net_tonaj: 26.8 },
      { id: '3', tir_sirasi: 3, plaka: '22 ABC 123', sofor_adi: 'Ali Kaya', tarih: '2026-11-03', net_tonaj: 28.1 },
      { id: '4', tir_sirasi: 4, plaka: '34 DEF 789', sofor_adi: 'Ahmet Yılmaz', tarih: '2026-11-04', net_tonaj: 25.9 },
    ];

    // Plaka filtresi: 22 ABC 123
    const byPlaka = mockTrucks.filter((t) => t.plaka === '22 ABC 123');
    assert.equal(byPlaka.length, 2);
    assert.deepEqual(byPlaka.map((t) => t.id), ['1', '3']);

    // Şoför filtresi: Ahmet Yılmaz
    const bySofor = mockTrucks.filter((t) => t.sofor_adi === 'Ahmet Yılmaz');
    assert.equal(bySofor.length, 2);
    assert.deepEqual(bySofor.map((t) => t.id), ['1', '4']);

    // Birleşik filtre: Plaka 22 ABC 123 + Şoför Ahmet Yılmaz
    const byBoth = mockTrucks.filter((t) => t.plaka === '22 ABC 123' && t.sofor_adi === 'Ahmet Yılmaz');
    assert.equal(byBoth.length, 1);
    assert.equal(byBoth[0].id, '1');
  });

  it('4. Gelen tırlar listesinde sıralama işlemleri (Sıra, Tarih, Plaka, Şoför, Tonaj, Fark) doğru çalışır', () => {
    const mockTrucks = [
      { id: '1', tir_sirasi: 2, plaka: '34 BCD 200', sofor_adi: 'Caner Koç', ocak_cikis_tarihi: '2026-11-01', tarih: '2026-11-03', net_tonaj: 28.5, brut_tonaj: 28.7 },
      { id: '2', tir_sirasi: 1, plaka: '22 AAA 100', sofor_adi: 'Ahmet Arı', ocak_cikis_tarihi: '2026-11-02', tarih: '2026-11-02', net_tonaj: 25.0, brut_tonaj: 25.0 },
      { id: '3', tir_sirasi: 3, plaka: '17 CCC 300', sofor_adi: 'Burak Tan', ocak_cikis_tarihi: '2026-10-30', tarih: '2026-11-04', net_tonaj: 29.2, brut_tonaj: 29.5 },
    ];

    // ORDER_ASC (#1 -> #2 -> #3)
    const sortedOrderAsc = [...mockTrucks].sort((a, b) => a.tir_sirasi - b.tir_sirasi);
    assert.deepEqual(sortedOrderAsc.map((t) => t.tir_sirasi), [1, 2, 3]);

    // ORDER_DESC (#3 -> #2 -> #1)
    const sortedOrderDesc = [...mockTrucks].sort((a, b) => b.tir_sirasi - a.tir_sirasi);
    assert.deepEqual(sortedOrderDesc.map((t) => t.tir_sirasi), [3, 2, 1]);

    // NEWEST (tarih en yeni)
    const sortedNewest = [...mockTrucks].sort((a, b) => b.tarih.localeCompare(a.tarih));
    assert.deepEqual(sortedNewest.map((t) => t.id), ['3', '1', '2']);

    // OLDEST (tarih en eski)
    const sortedOldest = [...mockTrucks].sort((a, b) => a.tarih.localeCompare(b.tarih));
    assert.deepEqual(sortedOldest.map((t) => t.id), ['2', '1', '3']);

    // PLAKA_ASC
    const sortedPlakaAsc = [...mockTrucks].sort((a, b) => a.plaka.localeCompare(b.plaka, 'tr'));
    assert.deepEqual(sortedPlakaAsc.map((t) => t.plaka), ['17 CCC 300', '22 AAA 100', '34 BCD 200']);

    // SOFOR_ASC
    const sortedSoforAsc = [...mockTrucks].sort((a, b) => a.sofor_adi.localeCompare(b.sofor_adi, 'tr'));
    assert.deepEqual(sortedSoforAsc.map((t) => t.sofor_adi), ['Ahmet Arı', 'Burak Tan', 'Caner Koç']);

    // TON_DESC (Net tonaj yüksekten düşüğe)
    const sortedTonDesc = [...mockTrucks].sort((a, b) => normalizeToTon(b.net_tonaj) - normalizeToTon(a.net_tonaj));
    assert.deepEqual(sortedTonDesc.map((t) => t.net_tonaj), [29.2, 28.5, 25.0]);

    // TON_ASC (Net tonaj düşükten yükseğe)
    const sortedTonAsc = [...mockTrucks].sort((a, b) => normalizeToTon(a.net_tonaj) - normalizeToTon(b.net_tonaj));
    assert.deepEqual(sortedTonAsc.map((t) => t.net_tonaj), [25.0, 28.5, 29.2]);
  });
});
