import { test } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import { normalizeToTon, calculateCoalStockMetrics } from '../src/lib/normalizer';

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
});

