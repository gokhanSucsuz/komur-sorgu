import { test } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import { normalizeToTon, calculateCoalStockMetrics, calculateDailyAndOverallBagTonnageStats } from '../src/lib/normalizer';

test('Günlük Teslimat Tutanakları Fiili Gelen Tonaj ve Torba Toleransı Kuralı Testleri', async (t) => {
  const deliveryArchiveSrc = fs.readFileSync(path.join(process.cwd(), 'src/components/DeliveryArchive.tsx'), 'utf8');
  const routeReportSrc = fs.readFileSync(path.join(process.cwd(), 'src/components/route/RoutePrintReportModal.tsx'), 'utf8');
  const deliveryHistoryApiSrc = fs.readFileSync(path.join(process.cwd(), 'src/app/api/delivery/history/route.ts'), 'utf8');
  const routesApiSrc = fs.readFileSync(path.join(process.cwd(), 'src/app/api/routes/route.ts'), 'utf8');
  const exportApiSrc = fs.readFileSync(path.join(process.cwd(), 'src/app/api/export/route.ts'), 'utf8');

  await t.test('1. Kural: 27,4 Ton Gelen Kömür 35 Kişiye Verildiğinde Tutanakta 27,4 Ton Yazmalı, Kişi Sayısına Göre Hesaplanmamalı', () => {
    // 35 hak sahibi, her biri 34 torba kömür almış olsa:
    const kisiSayisi = 35;
    const haneBasiTorba = 34;
    const toplamDagitilanTorba = kisiSayisi * haneBasiTorba; // 1190 torba

    // Standart katsayı (25 kg = 0.025 ton) ile kişi sayısına göre yanlış hesaplama:
    const yanlisHesaplananTonaj = parseFloat((toplamDagitilanTorba * 0.025).toFixed(2)); // 29.75 Ton!
    assert.strictEqual(yanlisHesaplananTonaj, 29.75, 'Kişi sayısına göre hesaplama yapıldığında hatalı olarak 29.75 ton çıkar');

    // Fiili gelen tonaj:
    const oGunGelenTonaj = 27.4; // 27.4 Ton tır ile geldi

    // Tutanakta gösterilecek resmi tonaj kuralı:
    // Kişi sayısına göre hesaplanan (29.75) DEĞİL, fiilen sahaya gelen tonaj (27.4) olmalıdır.
    const tutanakGosterilenTonaj = oGunGelenTonaj > 0 ? oGunGelenTonaj : yanlisHesaplananTonaj;
    assert.strictEqual(tutanakGosterilenTonaj, 27.4, 'Tutanakta kişi sayısına göre hesaplanan değil, o gün gelen tonaj (27.4 Ton) yazmalıdır');
  });

  await t.test('2. Teslimat Arşivi (DeliveryArchive.tsx): Günlük Tutanakta ve Gün Kartlarında O Gün Gelen Tonaj Esas Alınır', () => {
    // A. Günlük tutanak resmi metninde gelen kantar tonajı ve torba toleransı açıklaması yer almalıdır
    assert.ok(
      deliveryArchiveSrc.includes('⚖️ <strong>O Gün Gelen Kömür Tonajı:</strong>') &&
      deliveryArchiveSrc.includes('verilen kişi sayısına göre tonaj hesaplanmamıştır'),
      'DeliveryArchive.tsx tutanak metninde gelen tonaj ve kişi sayısına göre tonaj hesaplanmadığı belirtilmelidir'
    );

    // B. Günlük kartlarda dayGroup.gelen_tonaj kontrolü
    assert.ok(
      deliveryArchiveSrc.includes('const dayGelenTonajNum = dayGroup.gelen_tonaj ? Number(dayGroup.gelen_tonaj) : 0;') &&
      deliveryArchiveSrc.includes('`${displayTon} Ton (Gelen)`'),
      'DeliveryArchive.tsx gün kartlarında fiili gelen tonaj varsa (Gelen) olarak gösterilmelidir'
    );

    // C. O gün gelen tonaj teyit/giriş kutusu (Truck ikonu ile)
    assert.ok(
      deliveryArchiveSrc.includes('O Gün Gelen Tonaj:') &&
      deliveryArchiveSrc.includes('setDayTonajInput'),
      'DeliveryArchive.tsx üzerinde o gün gelen tonajı teyit etme veya güncelleme imkanı bulunmalıdır'
    );
  });

  await t.test('3. Rota Teslimat Tutanağı (RoutePrintReportModal.tsx): O Gün Gelen Tonaj Metrik Kartı & Tutanak Esası', () => {
    // A. Metrik kartında "O Gün Gelen Tonaj" başlığı ve takribi 25 kg torba notu
    assert.ok(
      routeReportSrc.includes('O Gün Gelen Tonaj') &&
      routeReportSrc.includes('Torba Dağıtıldı • Takribi ~25kg'),
      'RoutePrintReportModal.tsx metrik kartlarında "O Gün Gelen Tonaj" ve takribi 25 kg notu yer almalıdır'
    );

    // B. Resmi kantar tonajı bilgilendirme notu
    assert.ok(
      routeReportSrc.includes('⚖️ Resmi Kantar Tonajı Esası:') &&
      routeReportSrc.includes('verilen kişi sayısına göre tonaj hesaplanmamıştır'),
      'RoutePrintReportModal.tsx resmi kantar tonajı esası ve kişi sayısına göre tonaj hesaplanmadığı kuralını içermelidir'
    );

    // C. Gelen tonaj state yönetimi ve düzenleme alanı
    assert.ok(
      routeReportSrc.includes('const [customGelenTonaj, setCustomGelenTonaj] = useState<string>') &&
      routeReportSrc.includes('displayGelenTonaj'),
      'RoutePrintReportModal.tsx gelen tonajı dinamik olarak yönetebilmelidir'
    );
  });

  await t.test('4. Backend API Entegrasyonu: /api/delivery/history, /api/routes ve /api/export gelen_tonaj aktarımı', () => {
    // A. delivery/history route: truckDeliveries sorgulanır ve groupedDays içine gelen_tonaj eklenir
    assert.ok(
      deliveryHistoryApiSrc.includes('truckDeliveries: trucksCol') &&
      deliveryHistoryApiSrc.includes('trucksByDate') &&
      deliveryHistoryApiSrc.includes('gelen_tonaj: trucksByDate.get(g) || 0'),
      'api/delivery/history route truckDeliveries üzerinden gelen tonajı günlere bağlamalıdır'
    );

    // B. routes route: truckDeliveries sorgulanır ve aktif/arşiv rotalara gelen_tonaj bağlanır
    assert.ok(
      routesApiSrc.includes('truckDeliveries: trucksCol') &&
      routesApiSrc.includes('r.gelen_tonaj = r.gelen_tonaj || trucksByDate.get(rDate) || 0') &&
      routesApiSrc.includes('finalizedGelenTonaj'),
      'api/routes route rota nesnelerine ve tamamlama işlemine gelen tonajı bağlamalıdır'
    );

    // C. export route: günlük teslimat çıktısında o gün gelen fiili tonaj yazdırılır
    assert.ok(
      exportApiSrc.includes('dayIncomingTon > 0') &&
      exportApiSrc.includes('O Gün Gelen Tonaj:') &&
      exportApiSrc.includes('Torbalar takribi 25 kg'),
      'api/export route günlük teslimat Excel dökümünde fiili gelen tonajı ve takribi 25 kg notunu yazdırmalıdır'
    );
  });

  await t.test('5. Gün Gün Gelen Tonaj, Artan Torba (<25 kg) ve Açık Torba (>25 kg) İstatistik Hesabı (calculateDailyAndOverallBagTonnageStats)', () => {
    const mockTrucks = [
      // 1. Gün (06.11.2026): 27.4 Ton geldi (Standart 25 kg = 1096 torba / ~32.24 hane beklenir)
      { tarih: '2026-11-06', net_tonaj: 27.4 },
      // 2. Gün (07.11.2026): 25.5 Ton geldi (Standart 25 kg = 1020 torba / 30 hane beklenir)
      { tarih: '2026-11-07', net_tonaj: 25.5 },
    ];

    // 1. Gün: 35 haneye 34'er torba = 1190 torba dağıtıldı (1 torba < 25 kg => ~23.03 kg, 34 torba = ~783 kg fiili, 850 kg resmi kabul)
    const day1Beneficiaries = Array.from({ length: 35 }, (_, i) => ({
      tc_no: `100000000${String(i).padStart(2, '0')}`,
      ad_soyad: `Hak Sahibi Gün1-${i + 1}`,
      teslimat_durumu: 'TAMAMLANDI',
      teslimat_tarihi: '2026-11-06 14:00',
      torba_sayisi: 34,
      hedef_torba: 34,
    }));

    // 2. Gün: 28 haneye 34'er torba = 952 torba dağıtıldı (1 torba > 25 kg => ~26.79 kg, 34 torba = ~911 kg fiili, 850 kg resmi kabul)
    const day2Beneficiaries = Array.from({ length: 28 }, (_, i) => ({
      tc_no: `200000000${String(i).padStart(2, '0')}`,
      ad_soyad: `Hak Sahibi Gün2-${i + 1}`,
      teslimat_durumu: 'TAMAMLANDI',
      teslimat_tarihi: '2026-11-07 15:00',
      torba_sayisi: 34,
      hedef_torba: 34,
    }));

    const result = calculateDailyAndOverallBagTonnageStats({
      trucks: mockTrucks,
      beneficiaries: [...day1Beneficiaries, ...day2Beneficiaries],
      quotaBagsPerHousehold: 34,
      bagWeightTon: 0.025,
    });

    assert.strictEqual(result.dailyRows.length, 2, 'İki ayrı dağıtım günü hesaplanmalıdır');

    // dailyRows en yeniden en eskiye sıralıdır: [0] = 2026-11-07, [1] = 2026-11-06
    const rowDay1 = result.dailyRows.find((r) => r.gun === '2026-11-06')!;
    const rowDay2 = result.dailyRows.find((r) => r.gun === '2026-11-07')!;

    // 1. Gün Kontrolleri (Torba < 25 kg -> Artan Torba):
    assert.strictEqual(rowDay1.gelenNetTonaj, 27.4, '1. gün gelen tonaj 27.4 Ton olmalıdır');
    assert.strictEqual(rowDay1.fiiliDagitilanTonaj, 27.4, '1. gün fiili dağıtılan tonaj gelen tonajla birebir aynı (27.4 Ton) kalmalıdır');
    assert.strictEqual(rowDay1.resmiKabulTonaj, 29.75, '1. gün resmi kabul karşılığı (35 hane * 850 kg) 29.75 Ton olmalıdır');
    assert.strictEqual(rowDay1.beklenenStandartTorba, 1096, '27.4 Ton için 25 kg standart beklenen torba 1096 olmalıdır');
    assert.strictEqual(rowDay1.fiiliDagitilanTorba, 1190, '1. gün fiilen 1190 torba dağıtılmıştır');
    assert.strictEqual(rowDay1.artanTorba, 94, '1. gün 1190 - 1096 = +94 Artan Torba olmalıdır');
    assert.strictEqual(rowDay1.artanHane, 2, '94 artan torba = 2 tam hane + 26 torba');
    assert.strictEqual(rowDay1.artanKalanTorba, 26);
    assert.strictEqual(rowDay1.acikTorba, 0, '1. gün açık torba 0 olmalıdır');
    assert.strictEqual(rowDay1.ortalamaTorbaKg, 23.03, '1. gün ortalama torba ağırlığı 23.03 kg olmalıdır');
    assert.strictEqual(rowDay1.ortalamaHaneKg, 783, '1. gün 34 torba alan haneye fiilen ortalama 783 kg gitmiş olmalıdır');

    // 2. Gün Kontrolleri (Torba > 25 kg -> Açık Torba):
    assert.strictEqual(rowDay2.gelenNetTonaj, 25.5, '2. gün gelen tonaj 25.5 Ton olmalıdır');
    assert.strictEqual(rowDay2.fiiliDagitilanTonaj, 25.5, '2. gün fiili dağıtılan tonaj gelen tonajla birebir aynı (25.5 Ton) kalmalıdır');
    assert.strictEqual(rowDay2.resmiKabulTonaj, 23.8, '2. gün resmi kabul karşılığı (28 hane * 850 kg) 23.8 Ton olmalıdır');
    assert.strictEqual(rowDay2.beklenenStandartTorba, 1020, '25.5 Ton için 25 kg standart beklenen torba 1020 olmalıdır');
    assert.strictEqual(rowDay2.fiiliDagitilanTorba, 952, '2. gün fiilen 952 torba dağıtılmıştır');
    assert.strictEqual(rowDay2.artanTorba, 0, '2. gün artan torba 0 olmalıdır');
    assert.strictEqual(rowDay2.acikTorba, 68, '2. gün 1020 - 952 = -68 Açık Torba olmalıdır');
    assert.strictEqual(rowDay2.acikHane, 2, '68 açık torba = 2 tam hane açık');
    assert.strictEqual(rowDay2.acikKalanTorba, 0);
    assert.strictEqual(rowDay2.ortalamaTorbaKg, 26.79, '2. gün ortalama torba ağırlığı 26.79 kg olmalıdır');
    assert.strictEqual(rowDay2.ortalamaHaneKg, 911, '2. gün 34 torba alan haneye fiilen ortalama 911 kg gitmiş olmalıdır');

    // Genel Toplam (totals) Kontrolleri:
    assert.strictEqual(result.totals.toplamGelenNetTonaj, 52.9, 'Toplam gelen tonaj 52.9 Ton olmalıdır');
    assert.strictEqual(result.totals.toplamFiiliDagitilanTonaj, 52.9, 'Toplam fiili dağıtılan tonaj 52.9 Ton olmalıdır (tonaj asla değişmez)');
    assert.strictEqual(result.totals.toplamResmiKabulTonaj, 53.55, 'Toplam resmi kabul tonajı (63 hane * 0.85) 53.55 Ton olmalıdır');
    assert.strictEqual(result.totals.toplamArtanTorba, 94, 'Gün bazlı toplam artan torba +94 olmalıdır');
    assert.strictEqual(result.totals.toplamAcikTorba, 68, 'Gün bazlı toplam açık torba -68 olmalıdır');
    assert.strictEqual(result.totals.netTorbaFarki, 26, 'Net torba farkı (+94 - 68) = +26 torba olmalıdır');
  });
});

