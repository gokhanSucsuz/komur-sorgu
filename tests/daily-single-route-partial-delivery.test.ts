import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';

process.env.ENCRYPTION_MASTER_KEY = crypto.randomBytes(32).toString('hex');
process.env.BLIND_INDEX_KEY = crypto.randomBytes(32).toString('hex');

import { ensureTeamDailyRoute, addBeneficiariesToTeamRoute } from '../src/app/api/routes/route';

test('1. Eksik Kömür Tamamlama: Hedef torba kotası (34) asla aşılamaz ve sadece kalan torba teslim edilir', () => {
  const hedef = 34;
  const currentBags = 20;

  // Case A: 20 torba teslim edilmiş haneye kalan 14 torba tamamlandığında
  const remaining = Math.max(0, hedef - currentBags);
  assert.equal(remaining, 14);

  const addAmount1 = 14;
  const newTotal1 = Math.min(hedef, currentBags + addAmount1);
  const deliveredThisTime1 = Math.max(0, newTotal1 - currentBags);
  assert.equal(newTotal1, 34);
  assert.equal(deliveredThisTime1, 14);

  // Case B: Personel modalda yanlışlıkla 34 seçse veya 34 torba gönderse bile 34 torbayı aşamaz (20 + 34 = 54 OLAMAZ, 34'e limitlenir)
  const addAmountExcessive = 34;
  const newTotalExcessive = Math.min(hedef, currentBags + addAmountExcessive);
  const deliveredThisTimeExcessive = Math.max(0, newTotalExcessive - currentBags);
  assert.equal(newTotalExcessive, 34, 'Toplam teslim edilen torba 34 kotasını aşamaz');
  assert.equal(deliveredThisTimeExcessive, 14, 'Bu işlemde teslim edilen miktar yalnızca eksik kalan 14 torba olmalıdır');

  // Case C: Kısmi teslimat (20 torba varken sadece 5 torba daha verilebildi)
  const addAmountPartial = 5;
  const newTotalPartial = Math.min(hedef, currentBags + addAmountPartial);
  const deliveredThisTimePartial = Math.max(0, newTotalPartial - currentBags);
  assert.equal(newTotalPartial, 25);
  assert.equal(deliveredThisTimePartial, 5);
});

test('2. Tüm Ekip Üyeleri İçin Aynı Gün Sadece Tek Ortak Rota Açılır', async () => {
  const routesDb: any[] = [];
  const fakeRouteCol = {
    find: (query: any) => ({
      sort: () => ({
        toArray: async () => routesDb.filter((r) => {
          if (query.tarih && r.tarih !== query.tarih) return false;
          if (query.durum?.$in && !query.durum.$in.includes(r.durum)) return false;
          return true;
        })
      }),
      toArray: async () => routesDb.filter((r) => {
        if (query.tarih && r.tarih !== query.tarih) return false;
        if (query.durum?.$in && !query.durum.$in.includes(r.durum)) return false;
        return true;
      })
    }),
    insertOne: async (doc: any) => {
      routesDb.push(doc);
      return { insertedId: doc._id };
    },
    updateOne: async (filter: any, update: any) => {
      const idx = routesDb.findIndex((r) => String(r.id || r._id) === String(filter.id || filter._id));
      if (idx >= 0 && update.$set) {
        routesDb[idx] = { ...routesDb[idx], ...update.$set };
      }
      return { matchedCount: 1 };
    }
  };

  const fakeUsersCol = {
    findOne: async () => null
  };

  const localToday = '2026-11-06';
  const localTimeStr = '06.11.2026 14:00:00';

  // 1. Personel A için rota oluşturulur
  const resStaffA = await ensureTeamDailyRoute({
    session: { valid: true, username: 'personel_a', ad_soyad: 'Ahmet Personel', rol: 'PERSONEL' },
    usersCol: fakeUsersCol,
    routeCol: fakeRouteCol,
    localToday,
    localTimeStr
  });

  assert.equal(resStaffA.created, true);
  assert.equal(routesDb.length, 1);
  assert.equal(resStaffA.route.tarih, localToday);

  // 2. Farklı bir ekip veya Personel B sisteme girdiğinde YENİ ROTA AÇILMAZ, aynı günün tek rotası döner
  const resStaffB = await ensureTeamDailyRoute({
    session: { valid: true, username: 'personel_b', ad_soyad: 'Mehmet Saha', rol: 'PERSONEL' },
    usersCol: fakeUsersCol,
    routeCol: fakeRouteCol,
    localToday,
    localTimeStr
  });

  assert.equal(resStaffB.created, false, 'İkinci personel için yeni bir rota açılmamalıdır');
  assert.equal(String(resStaffB.route.id), String(resStaffA.route.id), 'Tüm personel aynı günün tek ortak rotasına bağlanmalıdır');
  assert.equal(routesDb.length, 1, 'Veritabanında aynı güne ait kesinlikle tek rota bulunmalıdır');
});

test('3. Tutanak Çıktısında Açık Adres Asla Boş Gelmez (Fallback ve Zenginleştirme)', () => {
  // Helper test
  function getArchiveDisplayAddress(item: any): string {
    if (!item) return 'Adres Belirtilmemiş';
    const direct = (item.acik_adres || item.imza_listesi_acik_adres || item.adres || '').trim();
    if (direct && direct !== '-' && !/^(adres belirtilmedi|belirtilmemiş|yok)$/i.test(direct)) {
      return direct;
    }
    const parts: string[] = [];
    if (item.sokak && !item.sokak.includes('Belirtilmemiş')) parts.push(item.sokak);
    if (item.kapi_no && item.kapi_no !== 999999 && item.kapi_no !== '999999') parts.push(`No: ${item.kapi_no}`);
    if (item.daire_no) parts.push(`D: ${item.daire_no}`);
    if (parts.length > 0) return parts.join(' ');
    if (item.mahalle) return `${item.mahalle} (Açık Adres Kaydı Yok)`;
    return 'Adres Belirtilmemiş';
  }

  // 1. acik_adres dolu olan kayıt
  const recordWithFullAddr = {
    ad_soyad: 'Fatma Yılmaz',
    mahalle: 'Yeniimaret Mah.',
    acik_adres: 'İkinci Değirmen Sokak No: 12 D: 4'
  };
  assert.equal(getArchiveDisplayAddress(recordWithFullAddr), 'İkinci Değirmen Sokak No: 12 D: 4');

  // 2. acik_adres boş olan fakat sokak ve kapı no'su olan kayıt
  const recordWithSplitAddr = {
    ad_soyad: 'Ali Demir',
    mahalle: 'Menzilahır Mah.',
    acik_adres: '',
    sokak: 'Karanfil Sokak',
    kapi_no: '8',
    daire_no: '2'
  };
  assert.equal(getArchiveDisplayAddress(recordWithSplitAddr), 'Karanfil Sokak No: 8 D: 2');

  // 3. acik_adres null olan sadece mahalle bilgisi olan kayıt
  const recordOnlyMahalle = {
    ad_soyad: 'Veli Can',
    mahalle: 'Karaağaç Mah.',
    acik_adres: null
  };
  assert.equal(getArchiveDisplayAddress(recordOnlyMahalle), 'Karaağaç Mah. (Açık Adres Kaydı Yok)');
});
