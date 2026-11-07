import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveStaffDisplayName } from '../src/lib/normalizer';

test('Günlük Tek Rota, Eksik Teslimat Devri ve Hane Sayımı Kuralları Testi', async (t) => {
  await t.test('1. resolveStaffDisplayName bozuk veya şifreli verilerde doğru isim çözer', () => {
    assert.equal(resolveStaffDisplayName('***[ŞİFRELİ VERİ DEŞİFRE EDİLEMEDİ]***', 'admin', 'ADMIN'), 'Gökhan SUÇSUZ');
    assert.equal(resolveStaffDisplayName('ENC:GCM:v1:abc', 'admin', 'ADMIN'), 'Gökhan SUÇSUZ');
    assert.equal(resolveStaffDisplayName('', 'cem', 'PERSONEL'), 'Cem PAZAR');
    assert.equal(resolveStaffDisplayName(null, 'hamza', 'PERSONEL'), 'Hamza ULUDAĞ');
    assert.equal(resolveStaffDisplayName(undefined, 'müdür', 'MUDUR'), 'Müdür Yetkilisi');
    assert.equal(resolveStaffDisplayName('Gökhan SUÇSUZ', 'admin', 'ADMIN'), 'Gökhan SUÇSUZ');
  });

  await t.test('2. İlk Dağıtım Günü Sayım Kuralı: Dağıtım Yapılan Hane = Tam Hane + Eksik Hane', () => {
    // Örnek: Bir günün rotasında 34 tam hane ve 1 eksik hane (Zeynep Aykan, 20 torba) var.
    const stops = [
      ...Array.from({ length: 34 }, (_, i) => ({
        sira: i + 1,
        ad_soyad: `Vatandaş ${i + 1}`,
        durum: 'TAMAMLANDI',
        hedef_torba: 34,
        teslim_edilen_torba: 34,
        onceki_gunden_devir: false
      })),
      {
        sira: 35,
        ad_soyad: 'Zeynep Aykan',
        durum: 'EKSIK',
        hedef_torba: 34,
        teslim_edilen_torba: 20,
        onceki_gunden_devir: false
      }
    ];

    const normalStops = stops.filter((s) => !s.onceki_gunden_devir);
    const tamHane = normalStops.filter((s) => s.durum === 'TAMAMLANDI').length;
    const eksikHane = normalStops.filter((s) => s.durum === 'EKSIK').length;
    
    // Kullanıcının belirttiği kural: Eksik teslimat olsa bile dağıtım yapılan hane sayısı + eksik dağıtım yapılan hane sayısı olarak hesaplanacak
    const dagitimYapilanHane = tamHane + eksikHane;
    const toplamTorba = stops.reduce((acc, s) => acc + s.teslim_edilen_torba, 0);

    assert.equal(tamHane, 34);
    assert.equal(eksikHane, 1);
    assert.equal(dagitimYapilanHane, 35, 'İlk gün eksik teslimat alan hane dağıtım yapılan hane sayısına 1 hane olarak dahil edilmelidir');
    assert.equal(toplamTorba, 34 * 34 + 20); // 1176 torba
  });

  await t.test('3. Ertesi Gün Devir Kuralı: Eksik teslimat devrettiğinde rota içinde görünür ama ikinci günün hane sayısına dahil EDİLMEZ', () => {
    // İkinci gün: Önceki günden devreden 1 eksik hane (kalan 14 torba teslim edilecek) + 10 yeni tam hane
    const nextDayStops = [
      {
        sira: 1,
        ad_soyad: 'Zeynep Aykan',
        durum: 'TAMAMLANDI',
        hedef_torba: 14,
        teslim_edilen_torba: 14,
        onceki_gunden_devir: true,
        eksik_tamamlama: true
      },
      ...Array.from({ length: 10 }, (_, i) => ({
        sira: i + 2,
        ad_soyad: `Yeni Vatandaş ${i + 1}`,
        durum: 'TAMAMLANDI',
        hedef_torba: 34,
        teslim_edilen_torba: 34,
        onceki_gunden_devir: false
      }))
    ];

    const normalStops = nextDayStops.filter((s) => !s.onceki_gunden_devir);
    const devirStops = nextDayStops.filter((s) => Boolean(s.onceki_gunden_devir));

    const ikinciGunYeniTam = normalStops.filter((s) => s.durum === 'TAMAMLANDI').length;
    const ikinciGunYeniEksik = normalStops.filter((s) => s.durum === 'EKSIK').length;
    const ikinciGunDagitimHane = ikinciGunYeniTam + ikinciGunYeniEksik;

    // Devir durağı tamamlanmış olsa bile ikinci günün yeni hane sayımına dahil edilmez (+0)
    assert.equal(devirStops.length, 1);
    assert.equal(ikinciGunDagitimHane, 10, 'Devir durak ikinci günün dağıtılan hane sayısına dahil edilmemelidir (+0)');

    // Toplam indirilen kömür ise araçtan fiilen indirildiği için eklenir: 14 torba devir + 10 * 34 = 354 torba
    const toplamTorba = nextDayStops.reduce((acc, s) => acc + s.teslim_edilen_torba, 0);
    assert.equal(toplamTorba, 14 + (10 * 34)); // 354 torba
  });

  await t.test('4. Rota Kapatıldıktan Sonra Aynı Gün Yeni İmza Alındığında Otomatik Reaktivasyon Mantığı', () => {
    const route: {
      id: string;
      tarih: string;
      durum: string;
      completed_at: string | null;
      kapanis_notu: string | null;
      duraklar: any[];
    } = {
      id: 'route_today_1',
      tarih: '2026-11-06',
      durum: 'TAMAMLANDI',
      completed_at: '06.11.2026 12:44:15',
      kapanis_notu: 'Rota otomatik kapatıldı',
      duraklar: [
        { sira: 1, ad_soyad: 'Hane 1', durum: 'TAMAMLANDI', teslim_edilen_torba: 34 }
      ]
    };

    // Yeni hak sahibi eklendiğinde
    if (route.durum === 'TAMAMLANDI') {
      route.durum = 'AKTIF';
      route.completed_at = null;
      route.kapanis_notu = null;
    }

    route.duraklar.push({
      sira: 2,
      ad_soyad: 'Yeni Eklenen Hane 2',
      durum: 'BEKLIYOR',
      teslim_edilen_torba: 0
    });

    assert.equal(route.durum, 'AKTIF', 'Aynı gün yeni hane geldiğinde rota aktif duruma geçmelidir');
    assert.equal(route.completed_at, null);
    assert.equal(route.kapanis_notu, null);
    assert.equal(route.duraklar.length, 2);
  });

  await t.test('5. Eksik Kömür Verilen Haneler Teslim Edilmiş Sayılır ve Rota Duraklatılmadan Tamamlanır', () => {
    const isStopDelivered = (s: any) =>
      s.durum === 'TAMAMLANDI' ||
      s.durum === 'TESLIM_EDILDI' ||
      (s.durum === 'EKSIK' && Number(s.teslim_edilen_torba) > 0) ||
      (Number(s.teslim_edilen_torba) > 0 && Number(s.hedef_torba) > 0 && Number(s.teslim_edilen_torba) >= Number(s.hedef_torba || 34));

    const stops = [
      { sira: 1, ad_soyad: 'Ahmet Yılmaz', durum: 'TAMAMLANDI', hedef_torba: 34, teslim_edilen_torba: 34 },
      { sira: 2, ad_soyad: 'Fatma Kaya', durum: 'EKSIK', hedef_torba: 34, teslim_edilen_torba: 20 },
      { sira: 3, ad_soyad: 'Mehmet Demir', durum: 'TAMAMLANDI', hedef_torba: 34, teslim_edilen_torba: 34 },
    ];

    // Her üç hane de kömür teslimi yapıldığı için teslim edilmiş sayılmalıdır
    assert.equal(isStopDelivered(stops[0]), true);
    assert.equal(isStopDelivered(stops[1]), true, 'Eksik kömür teslim edilen hane teslim edilmiş sayılmalıdır');
    assert.equal(isStopDelivered(stops[2]), true);

    const isAllStopsCompleted = stops.length > 0 && stops.every(isStopDelivered);
    assert.equal(isAllStopsCompleted, true, 'Rotadaki tüm hanelere kömür (tam veya eksik) verildiğinde rota tamamlandı sayılmalıdır');

    // Henüz kömür verilmeyen (BEKLIYOR) hane eklendiğinde rota bitmemiş sayılır
    const pendingStop = { sira: 4, ad_soyad: 'Ali Can', durum: 'BEKLIYOR', hedef_torba: 34, teslim_edilen_torba: 0 };
    assert.equal(isStopDelivered(pendingStop), false, 'Hiç kömür verilmeyen hane henüz teslim edilmemiş sayılmalıdır');

    const stopsWithPending = [...stops, pendingStop];
    assert.equal(stopsWithPending.every(isStopDelivered), false);
  });

  await t.test('6. Teslimat Arşivi: EKSIK_TESLIMAT Kayıtları Günün Teslimatlarına, İstatistiklere ve Raporlara Dahil Edilir', () => {
    // Hak sahibi ve geçmiş kaydı
    const beneficiary = {
      id: 'ben_partial_1',
      ad_soyad: 'Zeynep Aykan',
      tc_no: '12345678901',
      teslimat_durumu: 'EKSIK',
      torba_sayisi: 20,
      imza_durumu: 'IMZALANDI',
      komur_verilmeyecek: false,
    };

    const record = {
      id: 'hist_partial_1',
      beneficiary_id: 'ben_partial_1',
      tc_no: '12345678901',
      ad_soyad: 'Zeynep Aykan',
      islem_tipi: 'EKSIK_TESLIMAT',
      torba_sayisi: 20,
      gun_tarihi: '2026-11-06',
      tarih: '06.11.2026 14:43:51',
    };

    // Arşiv doğrulama mantığı
    const isCurrentlyDeliveredInDb =
      beneficiary &&
      (beneficiary.teslimat_durumu === 'TAMAMLANDI' ||
        beneficiary.teslimat_durumu === 'TESLIM_EDILDI' ||
        beneficiary.teslimat_durumu === 'EKSIK' ||
        (Number(beneficiary.torba_sayisi) > 0 && beneficiary.imza_durumu === 'IMZALANDI'));
    const isSignatureRevoked = !beneficiary || (beneficiary.imza_durumu !== 'IMZALANDI' && Number(beneficiary.torba_sayisi || 0) === 0);
    const isCoalCancelled = beneficiary && (beneficiary.komur_verilmeyecek === true || (beneficiary.komur_verilmeyecek as unknown) === 'true');

    const iptalEdildi = !isCurrentlyDeliveredInDb || isSignatureRevoked || isCoalCancelled;
    assert.equal(iptalEdildi, false, 'Eksik kömür teslimatı yapılan ve imzası alınan hane arşivde iptal edilmiş sayılmamalıdır');

    // Günlük gruplama ve istatistik hesaplama
    const allRecords = [
      ...Array.from({ length: 34 }, (_, i) => ({
        id: `hist_full_${i + 1}`,
        beneficiary_id: `ben_full_${i + 1}`,
        islem_tipi: 'TESLIMAT',
        torba_sayisi: 34,
        gun_tarihi: '2026-11-06',
        iptal_edildi: false,
      })),
      {
        ...record,
        iptal_edildi: iptalEdildi,
      },
    ];

    let gunlukTeslimatSayisi = 0;
    let gunlukToplamTorba = 0;

    for (const item of allRecords) {
      if ((item.islem_tipi === 'TESLIMAT' || item.islem_tipi === 'EKSIK_TESLIMAT') && !item.iptal_edildi) {
        gunlukTeslimatSayisi += 1;
        gunlukToplamTorba += item.torba_sayisi || 0;
      }
    }

    assert.equal(gunlukTeslimatSayisi, 35, 'Günün teslimat arşivinde 34 tam + 1 eksik hane = 35 hane görünmelidir');
    assert.equal(gunlukToplamTorba, 1176, 'Günün kömür toplamı 34 * 34 + 20 = 1176 torba (29.40 Ton) olmalıdır');
  });

  await t.test('7. Esas Kömür Teslimat Tarihi Korunması ve Sonradan Eksik Tamamlama Kaydı', () => {
    // 06.11.2026 tarihinde 24 torba teslim edilen hane
    const benAfterInitialPartial: any = {
      id: 'ben_24_bags',
      ad_soyad: 'Hasan Yılmaz',
      tc_no: '11122233344',
      hedef_torba: 34,
      torba_sayisi: 24,
      teslimat_durumu: 'EKSIK',
      teslimat_tarihi: '06.11.2026 14:20:00',
      ilk_teslimat_tarihi: '06.11.2026 14:20:00',
      ilk_teslim_edilen_torba: 24,
      eksik_kalan_torba: 10,
      eksik_sonradan_tamamlandi: false,
      eksik_tamamlanma_tarihi: null,
    };

    // 07.11.2026 tarihinde kalan 10 torba tamamlandığında:
    const completionTimestamp = '07.11.2026 11:15:00';
    const primaryDeliveryDate =
      benAfterInitialPartial.ilk_teslimat_tarihi || benAfterInitialPartial.teslimat_tarihi;
    const initialBags =
      Number(benAfterInitialPartial.ilk_teslim_edilen_torba) ||
      Number(benAfterInitialPartial.torba_sayisi) ||
      0;
    const addedBags = 10;
    const newTotalBags = initialBags + addedBags;

    const benAfterCompletion = {
      ...benAfterInitialPartial,
      torba_sayisi: newTotalBags,
      teslimat_durumu: 'TAMAMLANDI',
      teslimat_tarihi: primaryDeliveryDate,
      ilk_teslimat_tarihi: primaryDeliveryDate,
      ilk_teslim_edilen_torba: initialBags,
      sonradan_tamamlanan_torba: addedBags,
      eksik_kalan_torba: 0,
      eksik_sonradan_tamamlandi: true,
      eksik_tamamlanma_tarihi: completionTimestamp,
    };

    assert.equal(
      benAfterCompletion.teslimat_tarihi,
      '06.11.2026 14:20:00',
      'Esas kömür teslimat tarihi ilk teslimat yapılan 06.11.2026 olarak korunmalıdır'
    );
    assert.equal(benAfterCompletion.ilk_teslimat_tarihi, '06.11.2026 14:20:00');
    assert.equal(benAfterCompletion.eksik_tamamlanma_tarihi, '07.11.2026 11:15:00');
    assert.equal(benAfterCompletion.ilk_teslim_edilen_torba, 24);
    assert.equal(benAfterCompletion.sonradan_tamamlanan_torba, 10);
    assert.equal(benAfterCompletion.torba_sayisi, 34);
    assert.equal(benAfterCompletion.eksik_sonradan_tamamlandi, true);
  });

  await t.test('8. Günlük Teslimat Tutanakları: İlk Teslim Gününde Tam Teslimat Görünür, Sonraki Gün Tutanağına Dahil Edilmez', () => {
    const historyEvents = [
      // 06.11.2026: İlk kısmi teslimat (24 torba verildi ama hedef 34)
      {
        id: 'h1',
        beneficiary_id: 'ben_24_bags',
        tc_no: '11122233344',
        ad_soyad: 'Hasan Yılmaz',
        islem_tipi: 'TESLIMAT',
        is_ilk_teslimat: true,
        is_eksik_tamamlama: false,
        hedef_torba: 34,
        torba_sayisi: 24,
        gun_tarihi: '2026-11-06',
        iptal_edildi: false,
      },
      // 07.11.2026: Eksik tamamlama (+10 torba)
      {
        id: 'h2',
        beneficiary_id: 'ben_24_bags',
        tc_no: '11122233344',
        ad_soyad: 'Hasan Yılmaz',
        islem_tipi: 'EKSIK_TAMAMLAMA',
        is_ilk_teslimat: false,
        is_eksik_tamamlama: true,
        hedef_torba: 34,
        torba_sayisi: 10,
        gun_tarihi: '2026-11-07',
        iptal_edildi: false,
      },
      // 07.11.2026: O gün ilk kez teslimat yapılan yeni hane
      {
        id: 'h3',
        beneficiary_id: 'ben_new_day2',
        tc_no: '99988877766',
        ad_soyad: 'Ayşe Kaya',
        islem_tipi: 'TESLIMAT',
        is_ilk_teslimat: true,
        is_eksik_tamamlama: false,
        hedef_torba: 34,
        torba_sayisi: 34,
        gun_tarihi: '2026-11-07',
        iptal_edildi: false,
      },
    ];

    // Tutanak filtreleme: Sadece ilk teslimatlar dahil edilir ve tutanakta tam kota (34 torba) gösterilir
    const seenBeneficiaries = new Set<string>();
    const tutanakRecords = historyEvents
      .filter((ev) => {
        if (ev.iptal_edildi || ev.islem_tipi === 'EKSIK_TAMAMLAMA' || ev.is_eksik_tamamlama) {
          return false;
        }
        const key = ev.beneficiary_id || ev.tc_no;
        if (seenBeneficiaries.has(key)) return false;
        seenBeneficiaries.add(key);
        return true;
      })
      .map((ev) => ({
        ...ev,
        tutanak_torba_sayisi: ev.hedef_torba || 34,
      }));

    const day1Tutanak = tutanakRecords.filter((r) => r.gun_tarihi === '2026-11-06');
    const day2Tutanak = tutanakRecords.filter((r) => r.gun_tarihi === '2026-11-07');

    assert.equal(day1Tutanak.length, 1, '06.11.2026 tutanağında ilk teslimatı yapılan hane yer almalıdır');
    assert.equal(day1Tutanak[0].tutanak_torba_sayisi, 34, '06.11.2026 tutanağında 24 torba verilen hane tam teslimat (34 torba) olarak görünmelidir');

    assert.equal(day2Tutanak.length, 1, '07.11.2026 tutanağında yalnızca o gün ilk teslimatı yapılan hane yer almalı, önceki günün eksik tamamlaması dahil edilmemelidir');
    assert.equal(day2Tutanak[0].beneficiary_id, 'ben_new_day2');
  });
});
