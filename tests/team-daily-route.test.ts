import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';

process.env.ENCRYPTION_MASTER_KEY = crypto.randomBytes(32).toString('hex');
process.env.BLIND_INDEX_KEY = crypto.randomBytes(32).toString('hex');

import { ensureTeamDailyRoute, addBeneficiariesToTeamRoute } from '../src/app/api/routes/route';

test('1. Ekip Başına Günlük Tek Rota & Otomatik Oluşturma', async () => {
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

  const session = {
    valid: true,
    username: 'personel1',
    ad_soyad: 'Ahmet Personel',
    rol: 'PERSONEL',
    user: {
      ekip_adi: '1. Dağıtım Ekibi',
      ekip_arkadaslari: ['mehmet_yardimci']
    }
  };

  const localToday = '2026-11-05';
  const localTimeStr = '05.11.2026 10:00:00';

  // 1. Henüz rota yokken ensureTeamDailyRoute çağrıldığında otomatik oluşturulmalıdır
  const result1 = await ensureTeamDailyRoute({
    session,
    usersCol: fakeUsersCol,
    routeCol: fakeRouteCol,
    localToday,
    localTimeStr,
    preferredNeighborhood: 'Şükrüpaşa'
  });

  assert.equal(result1.created, true, 'İlk çağrıda rota otomatik oluşturulmalıdır');
  assert.equal(result1.route.tarih, localToday);
  assert.equal(result1.route.ekip_adi, '1. Dağıtım Ekibi');
  assert.equal(result1.route.durum, 'AKTIF');

  // 2. Aynı ekip aynı gün ikinci kez çağırdığında yeni rota OLUŞTURULMAMALI, mevcut rota dönmelidir
  const result2 = await ensureTeamDailyRoute({
    session,
    usersCol: fakeUsersCol,
    routeCol: fakeRouteCol,
    localToday,
    localTimeStr,
    preferredNeighborhood: 'Barutluk'
  });

  assert.equal(result2.created, false, 'Aynı ekip için aynı gün ikinci rota oluşturulmamalıdır');
  assert.equal(String(result2.route.id), String(result1.route.id), 'Mevcut günlük rota referansı dönmelidir');
  assert.equal(routesDb.length, 1, 'Veritabanında ekibin yalnızca tek bir günlük rotası bulunmalıdır');

  // 3. Ekip arkadaşı aynı gün çağırdığında da aynı rotayı bulmalıdır
  const partnerSession = {
    valid: true,
    username: 'mehmet_yardimci',
    ad_soyad: 'Mehmet Yardımcı',
    rol: 'PERSONEL',
    user: {
      ekip_adi: '1. Dağıtım Ekibi',
      ekip_arkadaslari: ['personel1']
    }
  };

  const resultPartner = await ensureTeamDailyRoute({
    session: partnerSession,
    usersCol: fakeUsersCol,
    routeCol: fakeRouteCol,
    localToday,
    localTimeStr
  });

  assert.equal(resultPartner.created, false, 'Ekip arkadaşı da aynı ekibin tek rotasını kullanmalıdır');
  assert.equal(String(resultPartner.route.id), String(result1.route.id));
});

test('2. İmzası Alınan Vatandaşın Ekip Rotasına Otomatik Eklenmesi ve Teslimat Durumu', async () => {
  const routesDb: any[] = [];
  const fakeRouteCol = {
    updateOne: async (filter: any, update: any) => {
      const idx = routesDb.findIndex((r) => String(r.id || r._id) === String(filter.id || filter._id));
      if (idx >= 0 && update.$set) {
        routesDb[idx] = { ...routesDb[idx], ...update.$set };
      }
      return { matchedCount: 1 };
    }
  };

  const session = {
    username: 'personel1',
    ad_soyad: 'Ahmet Personel',
    rol: 'PERSONEL'
  };

  const testRoute: any = {
    id: 'route_daily_1',
    rota_adi: '2026-11-05 Günlük Rota',
    durum: 'AKTIF',
    duraklar: []
  };
  routesDb.push(testRoute);

  const localTimeStr = '05.11.2026 11:00:00';

  // 1. İmzası alınan vatandaş otomatik durak olarak eklenir
  const beneficiary1 = {
    id: 'ben_1',
    tc_no: '11111111110',
    ad_soyad: 'Ayşe Kaya',
    mahalle: 'Şükrüpaşa',
    sokak: 'Gül Sokak',
    kapi_no: '5',
    hedef_torba: 34,
    imza_durumu: 'IMZALANDI',
    imza_tarihi: localTimeStr,
    teslimat_durumu: 'BEKLIYOR'
  };

  await addBeneficiariesToTeamRoute({
    route: testRoute,
    beneficiaries: [beneficiary1],
    session,
    routeCol: fakeRouteCol,
    localTimeStr
  });

  assert.equal(testRoute.duraklar.length, 1);
  assert.equal(testRoute.duraklar[0].ad_soyad, 'Ayşe Kaya');
  assert.equal(testRoute.duraklar[0].imza_durumu, 'IMZALANDI');
  assert.equal(testRoute.duraklar[0].durum, 'BEKLIYOR');

  // 2. İmza alınıp doğrudan teslimat yapıldığında (hızlı teslimat) rotada teslim edildi olarak işaretlenmelidir
  const beneficiaryDelivered = {
    id: 'ben_1',
    tc_no: '11111111110',
    ad_soyad: 'Ayşe Kaya',
    mahalle: 'Şükrüpaşa',
    hedef_torba: 34,
    torba_sayisi: 34,
    teslimat_durumu: 'TAMAMLANDI',
    teslim_alan: 'Ayşe Kaya',
    imza_durumu: 'IMZALANDI'
  };

  await addBeneficiariesToTeamRoute({
    route: testRoute,
    beneficiaries: [beneficiaryDelivered],
    session,
    routeCol: fakeRouteCol,
    localTimeStr
  });

  assert.equal(testRoute.duraklar.length, 1, 'Mükerrer durak eklenmemeli, mevcut durak güncellenmelidir');
  assert.equal(testRoute.duraklar[0].durum, 'TAMAMLANDI', 'Doğrudan teslimatta rotada TAMAMLANDI olarak işaretlenmelidir');
  assert.equal(testRoute.duraklar[0].teslim_edilen_torba, 34);
  assert.equal(testRoute.tamamlanan_hane, 1);
  assert.equal(testRoute.toplam_dagitilan_torba, 34);

  // 3. Eksik kömür teslimatı yapıldığında rotada EKSIK olarak işaretlenmelidir
  const beneficiaryEksik = {
    id: 'ben_2',
    tc_no: '22222222220',
    ad_soyad: 'Mehmet Demir',
    mahalle: 'Fatih',
    hedef_torba: 34,
    torba_sayisi: 20,
    teslimat_durumu: 'EKSIK',
    imza_durumu: 'IMZALANDI'
  };

  await addBeneficiariesToTeamRoute({
    route: testRoute,
    beneficiaries: [beneficiaryEksik],
    session,
    routeCol: fakeRouteCol,
    localTimeStr
  });

  assert.equal(testRoute.duraklar.length, 2);
  assert.equal(testRoute.duraklar[1].durum, 'EKSIK', 'Eksik teslimatta rotada EKSIK durumu korunmalıdır');
  assert.equal(testRoute.duraklar[1].teslim_edilen_torba, 20);
  assert.equal(testRoute.eksik_hane, 1);
  assert.equal(testRoute.toplam_dagitilan_torba, 54);
});

test('3. KÖMÜR YARDIMI DAĞITIM VE İSTATİSTİKİ İCMAL RAPORUNDA İptal Bilgisi ve Personel Performans Cetveli Yer Almaz', () => {
  const analyticsPageSrc = fs.readFileSync('src/components/AnalyticsPage.tsx', 'utf-8');
  const modalStart = analyticsPageSrc.indexOf('{/* RESMİ KÖMÜR DAĞITIM VE İSTATİSTİKİ İCMAL RAPORU MODALI');
  assert.ok(modalStart > 0, 'İcmal Raporu modalı bulunmalıdır');
  const modalContent = analyticsPageSrc.slice(modalStart);

  // 1. Resmi İcmal Raporu modalında "KÖMÜR DAĞITIM VE PERSONEL PERFORMANS CETVELİ" tablosu bulunmamalıdır
  assert.equal(
    modalContent.includes('KÖMÜR DAĞITIM VE PERSONEL PERFORMANS CETVELİ'),
    false,
    'Resmi İcmal Raporunda Personel Performans Cetveli yer almamalıdır'
  );

  // 2. İcmal Raporu modalı içinde İptal Edilenler kutusu veya butonu bulunmamalıdır
  assert.equal(
    modalContent.includes('İptal Edilenler'),
    false,
    'İcmal raporu modalında iptal edilenler bilgisi bulunmamalıdır'
  );

  // 3. İcmal raporu özet kartlarında iptal edilenler rozeti kaldırılmış olmalıdır
  assert.equal(
    modalContent.includes('• İptal: {summary?.komurVerilmeyecekHane'),
    false,
    'İcmal raporunda iptal edilenler sayısı yer almamalıdır'
  );
});
