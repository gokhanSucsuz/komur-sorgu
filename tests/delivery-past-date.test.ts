import { test, describe } from 'node:test';
import assert from 'node:assert';
import { extractDateYmd, isPastDeliveryDate, getIstanbulDate } from '../src/lib/dateUtils';

describe('Geçmiş Tarihli Teslimat İptal Kısıtlaması & Tarih Ayrıştırma Testleri', () => {
  const referenceToday = '2026-11-05';

  test('1. extractDateYmd farklı tarih formatlarını güvenle YYYY-MM-DD olarak döndürür', () => {
    // DD.MM.YYYY
    assert.strictEqual(extractDateYmd('05.11.2026'), '2026-11-05');
    assert.strictEqual(extractDateYmd('04.11.2026 14:30:00'), '2026-11-04');
    assert.strictEqual(extractDateYmd('01.01.2025 09:15'), '2025-01-01');

    // YYYY-MM-DD
    assert.strictEqual(extractDateYmd('2026-11-05'), '2026-11-05');
    assert.strictEqual(extractDateYmd('2026-11-04T12:00:00.000Z'), '2026-11-04');

    // Boş veya geçersiz değerler
    assert.strictEqual(extractDateYmd(null), null);
    assert.strictEqual(extractDateYmd(undefined), null);
    assert.strictEqual(extractDateYmd(''), null);
    assert.strictEqual(extractDateYmd('gecersiz-tarih'), null);
  });

  test('2. isPastDeliveryDate önceki günlere ait teslimatları doğru tespit eder (referans gün: 2026-11-05)', () => {
    // Önceki gün (Dün): 04.11.2026 -> geçmiş gün olmalı (true)
    assert.strictEqual(isPastDeliveryDate('04.11.2026 18:30:00', referenceToday), true);
    assert.strictEqual(isPastDeliveryDate('2026-11-04', referenceToday), true);

    // Daha önceki günler / aylar: geçmiş gün olmalı (true)
    assert.strictEqual(isPastDeliveryDate('15.10.2026 10:00:00', referenceToday), true);
    assert.strictEqual(isPastDeliveryDate('2025-12-31', referenceToday), true);

    // Aynı gün (Bugün): 05.11.2026 -> geçmiş gün DEĞİLDİR (false, personele izin verilir)
    assert.strictEqual(isPastDeliveryDate('05.11.2026 09:00:00', referenceToday), false);
    assert.strictEqual(isPastDeliveryDate('05.11.2026 23:59:59', referenceToday), false);
    assert.strictEqual(isPastDeliveryDate('2026-11-05', referenceToday), false);

    // Gelecek gün (Yarın): 06.11.2026 -> geçmiş gün değildir (false)
    assert.strictEqual(isPastDeliveryDate('06.11.2026 10:00:00', referenceToday), false);

    // Boş / tanımsız girdiler false dönmeli
    assert.strictEqual(isPastDeliveryDate(null, referenceToday), false);
    assert.strictEqual(isPastDeliveryDate('', referenceToday), false);
  });

  test('3. Rol Tabanlı İptal Doğrulaması: Dünün teslimatını sadece ADMIN iptal edebilir, PERSONEL iptal edemez', () => {
    const pastDeliveryDate = '04.11.2026 15:45:00';
    const isPast = isPastDeliveryDate(pastDeliveryDate, referenceToday);
    assert.strictEqual(isPast, true);

    function checkCanCancel(role: string, deliveryDateStr: string, today: string) {
      if (role === 'MUDUR') {
        return { allowed: false, reason: 'Müdür rolü salt okunurdur, iptal yapamaz.' };
      }
      const isPastDeliv = isPastDeliveryDate(deliveryDateStr, today);
      if (isPastDeliv && role !== 'ADMIN') {
        return {
          allowed: false,
          code: 'PAST_DELIVERY_ADMIN_ONLY',
          reason: 'Geçmiş günlere ait kömür teslimatlarının iptal işlemi yalnızca Sistem Yöneticisi (ADMIN) yetkisindedir.'
        };
      }
      return { allowed: true };
    }

    // 1. Dünün teslimatı - PERSONEL denediğinde ENGELLENİR
    const personelYesterday = checkCanCancel('PERSONEL', pastDeliveryDate, referenceToday);
    assert.strictEqual(personelYesterday.allowed, false);
    assert.strictEqual(personelYesterday.code, 'PAST_DELIVERY_ADMIN_ONLY');

    // 2. Dünün teslimatı - ADMIN denediğinde İZİN VERİLİR
    const adminYesterday = checkCanCancel('ADMIN', pastDeliveryDate, referenceToday);
    assert.strictEqual(adminYesterday.allowed, true);

    // 3. Dünün teslimatı - MUDUR denediğinde ENGELLENİR
    const mudurYesterday = checkCanCancel('MUDUR', pastDeliveryDate, referenceToday);
    assert.strictEqual(mudurYesterday.allowed, false);

    // 4. Bugünün teslimatı (Aynı gün) - PERSONEL denediğinde İZİN VERİLİR (aynı vardiya hatalarını düzeltme)
    const todayDeliveryDate = '05.11.2026 11:30:00';
    const personelToday = checkCanCancel('PERSONEL', todayDeliveryDate, referenceToday);
    assert.strictEqual(personelToday.allowed, true);

    // 5. Bugünün teslimatı (Aynı gün) - ADMIN denediğinde İZİN VERİLİR
    const adminToday = checkCanCancel('ADMIN', todayDeliveryDate, referenceToday);
    assert.strictEqual(adminToday.allowed, true);
  });

  test('4. Canlı İstanbul zamanı ile aynı gün tespiti doğrulanır', () => {
    const { dateStr, fullStr } = getIstanbulDate();
    // Şu anki anlık tarih kesinlikle geçmiş tarih olmamalıdır
    assert.strictEqual(isPastDeliveryDate(fullStr), false);
    assert.strictEqual(isPastDeliveryDate(dateStr), false);
  });
});

