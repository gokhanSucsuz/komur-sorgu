export type UserRoleType = 'ADMIN' | 'PERSONEL' | 'MUDUR';

export type QueueTabType = 'PENDING_AND_PARTIAL' | 'DELIVERED' | 'EXCLUDED' | 'ALL';

export type ListTypeFilter = 'HEPSI' | 'ANA_LISTE' | 'EK_LISTE' | 'SIGORTALI' | 'EK_KOMUR';

export interface MahalleSummary {
  mahalle: string;
  tip?: 'MAHALLE' | 'KOY' | string;
  kisi_sayisi?: number;
  tamamlanan?: number;
  eksik?: number;
  bekleyen?: number;
}

export interface StreetCountItem {
  sokak: string;
  count: number;
}

export interface BeneficiaryRecord {
  id: string | number;
  _id?: string;
  sira_no?: number | string;
  mahalle_sira?: number | string | null;
  excel_sira_no?: number | string | null;
  ek_excel_sira?: number | string | null;
  tc_no: string;
  ad_soyad: string;
  mahalle: string;
  yerlesim_tipi?: 'MAHALLE' | 'KOY' | string;
  acik_adres?: string;
  norm_adres?: string;
  telefon?: string;
  telefon2?: string;
  hane_no?: string | number;
  hedef_torba?: number;
  torba_sayisi?: number;
  teslimat_durumu?: 'BEKLIYOR' | 'EKSIK' | 'TAMAMLANDI' | 'TESLIM_EDILDI' | string;
  teslim_eden_personel?: string;
  teslim_alan?: string;
  teslimat_tarihi?: string;
  imza_durumu?: 'BEKLIYOR' | 'IMZALANDI' | string;
  manuel_ek_liste_imzasi?: boolean;
  ek_komur_verildi?: boolean;
  ek_liste_imza_notu?: string;
  komur_verilmeyecek?: boolean;
  komur_iptal_nedeni?: string;
  komur_iptal_aciklama?: string;
  uyari_notu?: string;
  fiili_adres_guncellendi?: boolean;
  son_adres_guncelleme_tarihi?: string;
  adres_guncelleme_notu?: string;
  imza_sonrasi_adres_degisti?: boolean;
  imza_listesi_mahalle?: string;
  onceki_mahalle?: string;
  imza_listesi_acik_adres?: string;
  onceki_acik_adres?: string;
  [key: string]: unknown;
}

