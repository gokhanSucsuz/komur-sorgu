/**
 * Kömür Dağıtımı Tonaj Sayfası Resmi Rapor Formatları (Format 1 & Format 2) Şablon Yönetimi
 * Yönetici tarafından başlıklar, alt başlıklar, belge kodları ve imza yetkilileri özelleştirilebilir.
 */

export interface Format1Template {
  title: string;          // Örn: "TESELLÜMLERİ İZLEME TABLOSU"
  subtitle: string;       // Örn: "(GÜNLÜK OLARAK VALİLİK GÖREVLİSİ TARAFINDAN DOLDURULACAKTIR)"
  ilIlce: string;         // Örn: "EDİRNE / MERKEZ"
  code: string;           // Örn: "TSL-VALILIK"
  isletmeAdi: string;     // Örn: "Çan Linyit İşletmesi Müdürlüğü"
  imza1_ad: string;       // Örn: "Cem PAZAR"
  imza1_unvan: string;    // Örn: "Sos. Yard. ve İnc. Gör."
  imza1_gorev: string;    // Örn: "Tesellüm Eden Görevli"
  imza2_ad: string;       // Örn: "Tezcan FİDAN"
  imza2_unvan: string;    // Örn: "Vakıf Müdürü"
  imza2_kurum: string;    // Örn: "Edirne SYDV Başkanlığı"
}

export interface Format2Template {
  ustBaslik: string;      // Örn: "TÜRKİYE KÖMÜR İŞLETMELERİ KURUMU"
  anaBaslik: string;      // Örn: "ÇAN LİNYİT İŞLETMESİ MÜDÜRLÜĞÜ {YIL} YILI EDİRNE/MERKEZ İLÇESİNE SOSYAL YARDIMLAŞMA VE DAYANIŞMA VAKIFLARI ARACILIĞI İLE VERİLEN KÖMÜR LİSTESİ"
  code: string;           // Örn: "TKI-DAGITIM"
  il: string;             // Örn: "EDİRNE"
  ilce: string;           // Örn: "MERKEZ"
  imza_ad: string;        // Örn: "Tezcan FİDAN"
  imza_unvan: string;     // Örn: "Vakıf Müdürü"
  imza_kurum: string;     // Örn: "Edirne SYDV Başkanlığı"
}

export interface TonnageReportTemplates {
  format1: Format1Template;
  format2: Format2Template;
}

export const DEFAULT_TONNAGE_TEMPLATES: TonnageReportTemplates = {
  format1: {
    title: 'TESELLÜMLERİ İZLEME TABLOSU',
    subtitle: '(GÜNLÜK OLARAK VALİLİK GÖREVLİSİ TARAFINDAN DOLDURULACAKTIR)',
    ilIlce: 'EDİRNE / MERKEZ',
    code: 'TSL-VALILIK',
    isletmeAdi: 'Çan Linyit İşletmesi Müdürlüğü',
    imza1_ad: 'Cem PAZAR',
    imza1_unvan: 'Sos. Yard. ve İnc. Gör.',
    imza1_gorev: 'Tesellüm Eden Görevli',
    imza2_ad: 'Tezcan FİDAN',
    imza2_unvan: 'Vakıf Müdürü',
    imza2_kurum: 'Edirne SYDV Başkanlığı',
  },
  format2: {
    ustBaslik: 'TÜRKİYE KÖMÜR İŞLETMELERİ KURUMU',
    anaBaslik: `ÇAN LİNYİT İŞLETMESİ MÜDÜRLÜĞÜ ${new Date().getFullYear()} YILI EDİRNE/MERKEZ İLÇESİNE SOSYAL YARDIMLAŞMA VE DAYANIŞMA VAKIFLARI ARACILIĞI İLE VERİLEN KÖMÜR LİSTESİ`,
    code: 'TKI-DAGITIM',
    il: 'EDİRNE',
    ilce: 'MERKEZ',
    imza_ad: 'Tezcan FİDAN',
    imza_unvan: 'Vakıf Müdürü',
    imza_kurum: 'Edirne SYDV Başkanlığı',
  },
};

/**
 * Ham ayar veya JSON verisini doğrular, eksik alanları varsayılanlarla tamamlar.
 */
export function parseTonnageTemplates(raw: any): TonnageReportTemplates {
  let parsed: any = null;
  if (typeof raw === 'string') {
    try {
      parsed = JSON.parse(raw);
    } catch {
      parsed = null;
    }
  } else if (raw && typeof raw === 'object') {
    parsed = raw;
  }

  const currentYear = new Date().getFullYear();
  const defAnaBaslik = DEFAULT_TONNAGE_TEMPLATES.format2.anaBaslik.replace('{YIL}', String(currentYear));

  return {
    format1: {
      title: parsed?.format1?.title?.trim() || DEFAULT_TONNAGE_TEMPLATES.format1.title,
      subtitle: parsed?.format1?.subtitle?.trim() || DEFAULT_TONNAGE_TEMPLATES.format1.subtitle,
      ilIlce: parsed?.format1?.ilIlce?.trim() || DEFAULT_TONNAGE_TEMPLATES.format1.ilIlce,
      code: parsed?.format1?.code?.trim() || DEFAULT_TONNAGE_TEMPLATES.format1.code,
      isletmeAdi: parsed?.format1?.isletmeAdi?.trim() || DEFAULT_TONNAGE_TEMPLATES.format1.isletmeAdi,
      imza1_ad: parsed?.format1?.imza1_ad?.trim() || DEFAULT_TONNAGE_TEMPLATES.format1.imza1_ad,
      imza1_unvan: parsed?.format1?.imza1_unvan?.trim() || DEFAULT_TONNAGE_TEMPLATES.format1.imza1_unvan,
      imza1_gorev: parsed?.format1?.imza1_gorev?.trim() || DEFAULT_TONNAGE_TEMPLATES.format1.imza1_gorev,
      imza2_ad: parsed?.format1?.imza2_ad?.trim() || DEFAULT_TONNAGE_TEMPLATES.format1.imza2_ad,
      imza2_unvan: parsed?.format1?.imza2_unvan?.trim() || DEFAULT_TONNAGE_TEMPLATES.format1.imza2_unvan,
      imza2_kurum: parsed?.format1?.imza2_kurum?.trim() || DEFAULT_TONNAGE_TEMPLATES.format1.imza2_kurum,
    },
    format2: {
      ustBaslik: parsed?.format2?.ustBaslik?.trim() || DEFAULT_TONNAGE_TEMPLATES.format2.ustBaslik,
      anaBaslik: parsed?.format2?.anaBaslik?.trim() || defAnaBaslik,
      code: parsed?.format2?.code?.trim() || DEFAULT_TONNAGE_TEMPLATES.format2.code,
      il: parsed?.format2?.il?.trim() || DEFAULT_TONNAGE_TEMPLATES.format2.il,
      ilce: parsed?.format2?.ilce?.trim() || DEFAULT_TONNAGE_TEMPLATES.format2.ilce,
      imza_ad: parsed?.format2?.imza_ad?.trim() || DEFAULT_TONNAGE_TEMPLATES.format2.imza_ad,
      imza_unvan: parsed?.format2?.imza_unvan?.trim() || DEFAULT_TONNAGE_TEMPLATES.format2.imza_unvan,
      imza_kurum: parsed?.format2?.imza_kurum?.trim() || DEFAULT_TONNAGE_TEMPLATES.format2.imza_kurum,
    },
  };
}
