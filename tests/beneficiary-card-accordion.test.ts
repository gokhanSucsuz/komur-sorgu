import { test } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';

test('Vatandaş Sorgu Ekranı Akordiyon Kart Menü Mimarisi ve Mobil Alan Tasarrufu Testi', async (t) => {
  const beneficiaryListPath = path.join(process.cwd(), 'src/components/BeneficiaryList.tsx');
  const globalsCssPath = path.join(process.cwd(), 'src/app/globals.css');

  const beneficiaryListSrc = fs.readFileSync(beneficiaryListPath, 'utf8');
  const globalsCssSrc = fs.readFileSync(globalsCssPath, 'utf8');

  await t.test('1. Kart Akordiyon Durumu: expandedCardIds ve allCardsExpanded durum yönetimi', () => {
    assert.ok(
      beneficiaryListSrc.includes('const [allCardsExpanded, setAllCardsExpanded] = useState(false);') &&
      beneficiaryListSrc.includes('const [expandedCardIds, setExpandedCardIds] = useState<Record<string, boolean>>({});'),
      'BeneficiaryList.tsx allCardsExpanded ve expandedCardIds state tanımlarını içermelidir'
    );

    assert.ok(
      beneficiaryListSrc.includes('const toggleCardExpand = (id: string | number)') &&
      beneficiaryListSrc.includes('const handleToggleAllCards = ()'),
      'BeneficiaryList.tsx tekil (toggleCardExpand) ve toplu (handleToggleAllCards) akordiyon toggle fonksiyonlarına sahip olmalıdır'
    );
  });

  await t.test('2. Kapalı Durum (Collapsed Header): İsim Altında TC, Sağında Konum Butonu, Mahalle ve Sokak Alt Alta', () => {
    // A. Ad Soyad ve altında TC Kimlik No, en sağında Konum butonu
    assert.ok(
      beneficiaryListSrc.includes('{person.ad_soyad}') &&
      beneficiaryListSrc.includes('{person.tc_no}') &&
      beneficiaryListSrc.includes('<span>Konum</span>') &&
      beneficiaryListSrc.includes('title="Yandex Navigasyon ile kapıya yol tarifi al"'),
      'Kart başlığında hak sahibi adı soyadı, altında TC kimlik numarası ve en sağında Konum butonu yer almalıdır'
    );

    // B. Mahalle ve Sokak etiketleri alt alta (flex-col w-full), aynı puntoda ve sokak baş harfleri büyük & kesilmeden tam görünür
    assert.ok(
      beneficiaryListSrc.includes('flex flex-col gap-1.5 w-full') &&
      beneficiaryListSrc.includes('{person.mahalle}') &&
      beneficiaryListSrc.includes('toTitleCaseTurkish(stInfo.sokak)'),
      'Mahalle ve Sokak etiketleri alt alta (flex-col w-full) olmalı ve sokak baş harfleri büyük yazılmalıdır'
    );
    assert.ok(
      beneficiaryListSrc.includes('whitespace-normal break-words leading-snug') &&
      !beneficiaryListSrc.includes('<span className="truncate">{stInfo.sokak}</span>'),
      'Sokak etiketi mobilde kesilmeden ve kısaltılmadan içeriği tamamen görünür olmalıdır'
    );
    assert.ok(
      beneficiaryListSrc.includes('px-2.5 py-1.5 rounded-xl bg-slate-50 border border-slate-200 text-slate-800 text-xs font-bold') &&
      beneficiaryListSrc.includes('px-2.5 py-1.5 rounded-xl bg-sky-50 hover:bg-sky-100 active:bg-sky-200 border border-sky-200 text-sky-950 text-xs font-bold'),
      'Mahalle ve Sokak etiketleri aynı büyüklük, padding ve puntoda (text-xs font-bold px-2.5 py-1.5) olmalıdır'
    );

    // C. Tıklanabilir akordiyon başlığı ve Chevron indikatörü
    assert.ok(
      beneficiaryListSrc.includes('role="button"') &&
      beneficiaryListSrc.includes('aria-expanded={isCardExpanded}') &&
      beneficiaryListSrc.includes('toggleCardExpand(person.id)'),
      'Kart başlığı tıklanabilir buton rolüne ve aria-expanded niteliğine sahip olmalıdır'
    );
  });

  await t.test('3. Açık Durum (Expanded Body): Telefon, Navigasyon, Açık Adres ve Teslimat Butonları Açılır', () => {
    // A. Akordiyon gövdesi isCardExpanded koşuluna bağlıdır
    assert.ok(
      beneficiaryListSrc.includes('{isCardExpanded && (') &&
      beneficiaryListSrc.includes('animate-in fade-in slide-in-from-top-2'),
      'Akordiyon gövdesi yalnızca isCardExpanded açıkken animasyonla aşağı doğru render edilmelidir'
    );

    // B. Telefon ve Arama Butonları
    assert.ok(
      beneficiaryListSrc.includes('href={`tel:${phones[0]}`}') &&
      beneficiaryListSrc.includes('Hemen Ara'),
      'Açılan gövdede telefon arama butonu yer almalıdır'
    );

    // C. Yandex ve Google Navigasyon Butonları
    assert.ok(
      beneficiaryListSrc.includes('getYandexNaviUrl(person)') &&
      beneficiaryListSrc.includes('getGoogleMapsUrl(person)'),
      'Açılan gövdede kapıya teslimat için canlı navigasyon butonları yer almalıdır'
    );

    // D. Resmi Açık Adres ve Saha Notu
    assert.ok(
      beneficiaryListSrc.includes('Resmi Açık Adres') &&
      beneficiaryListSrc.includes('{person.acik_adres ||'),
      'Açılan gövdede resmi açık adres alanı yer almalıdır'
    );

    // E. Eylem Butonları: Islak İmza ve Kömür Teslimatı
    assert.ok(
      beneficiaryListSrc.includes('handleToggleSignature(person)') &&
      beneficiaryListSrc.includes('onOpenDelivery(person)'),
      'Açılan gövdede kapıda ıslak imza alma ve kömür teslim etme butonları yer almalıdır'
    );
  });

  await t.test('4. İzolasyon: Buton ve link tıklamalarında kartın istemsiz kapanmasını önleme (e.stopPropagation)', () => {
    assert.ok(
      beneficiaryListSrc.includes('e.stopPropagation();') &&
      beneficiaryListSrc.includes('onOpenDelivery(person);') &&
      beneficiaryListSrc.includes('handleToggleSignature(person);'),
      'Teslimat ve imza butonları kartın kapanmasını önlemek için e.stopPropagation() kullanmalıdır'
    );
  });

  await t.test('5. Araç Çubuğunda Toplu Aç / Kapat Butonu', () => {
    assert.ok(
      beneficiaryListSrc.includes('Tümünü Aç') &&
      beneficiaryListSrc.includes('Tümünü Kapat') &&
      beneficiaryListSrc.includes('onClick={handleToggleAllCards}'),
      'Filtreleme araç çubuğunda tüm kartları tek tıkla açıp kapatan buton yer almalıdır'
    );
  });

  await t.test('6. CSS Optimizasyonu: Mobil Performans ve Kompakt Yükseklik', () => {
    assert.ok(
      globalsCssSrc.includes('contain-intrinsic-size: auto 90px;'),
      'globals.css içinde kapalı kartlar için optimize edilmiş intrinsic yükseklik bulunmalıdır'
    );
    assert.ok(
      globalsCssSrc.includes('align-items: start;'),
      'Masaüstü grid görünümünde kartların gereksiz esnemesini önlemek için align-items: start kullanılmalıdır'
    );
  });
});

