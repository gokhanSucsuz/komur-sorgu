export type AppRole = 'ADMIN' | 'PERSONEL' | 'MUDUR';

export type CalismaModu = 'RESMI' | 'DENEME';

export type TeslimatDurumu = 'BEKLIYOR' | 'TAMAMLANDI' | 'TESLIM_EDILDI' | 'EKSIK' | 'IPTAL';

export type ImzaDurumu = 'BEKLIYOR' | 'IMZALANDI';

export interface TotpDeviceGrace {
  slot_no: number;
  slot_name?: string;
  verified_at: string;
  expires_at: string;
}

export interface UserRecord {
  _id?: unknown;
  id?: string;
  username: string;
  ad_soyad?: string | null;
  rol: AppRole;
  sifre_hash?: string;
  sifre?: string;
  telefon?: string | null;
  aktif: number;
  ekip_adi?: string;
  ekip_arkadaslari?: string[];
  ekip_arkadasi?: string;
  active_session_token?: string | null;
  session_ua_hash?: string | null;
  last_login_at?: string | null;
  last_activity_at?: string | null;
  last_logout_at?: string | null;
  last_ip?: string | null;
  last_device?: string | null;
  totp_enabled?: boolean;
  totp_secret?: string | null;
  totp_pending_secret?: string | null;
  totp_recovery_codes?: string[];
  totp_device_graces?: TotpDeviceGrace[];
  totp_enabled_at?: string | null;
  created_at?: string;
  updated_at?: string;
}

export interface BeneficiaryRecord {
  _id?: unknown;
  id?: string;
  tc_no?: string | null;
  tc_hash?: string | null;
  ad_soyad?: string | null;
  telefon?: string | null;
  telefon2?: string | null;
  mahalle: string;
  yerlesim_tipi?: 'MAHALLE' | 'KOY';
  sokak?: string | null;
  kapi_no?: string | number | null;
  daire_no?: string | number | null;
  acik_adres?: string | null;
  hane_no?: string | null;
  hane_hash?: string | null;
  norm_adres?: string | null;
  adres_hash?: string | null;
  hedef_torba: number;
  teslimat_durumu: TeslimatDurumu;
  torba_sayisi: number;
  teslimat_tarihi?: string | null;
  teslim_alan?: string | null;
  teslim_eden_personel?: string | null;
  teslimat_notu?: string | null;
  imza_durumu?: ImzaDurumu;
  imza_tarihi?: string | null;
  imza_alan_personel?: string | null;
  imza_listesi_id?: string | null;
  imza_listesi_no?: number | null;
  sira_no?: string;
  mahalle_sira?: number;
  liste_turu?: 'ANA_LISTE' | 'EK_LISTE';
  liste_kategorisi?: string;
  ek_liste_no?: number | null;
  ek_liste_adi?: string | null;
  komur_verilmeyecek?: boolean;
  komur_iptal_nedeni?: string | null;
  komur_iptal_aciklama?: string | null;
  ek_komur_verildi?: boolean;
  manuel_ek_liste_imzasi?: boolean;
  imza_sonrasi_adres_degisti?: boolean;
  onceki_mahalle?: string | null;
  onceki_acik_adres?: string | null;
  onceki_sokak?: string | null;
  imza_listesi_mahalle?: string | null;
  imza_listesi_acik_adres?: string | null;
  imza_listesi_sokak?: string | null;
  uyarilar?: string[];
  uyari_notu?: string | null;
  batch_id?: string;
  donem_kodu?: string;
  created_at?: string;
  updated_at?: string;
}

export interface DeliveryHistoryRecord {
  _id?: unknown;
  id?: string;
  beneficiary_id: string;
  tc_no?: string | null;
  tc_hash?: string | null;
  ad_soyad?: string | null;
  mahalle: string;
  acik_adres?: string | null;
  islem_tipi: 'TESLIMAT' | 'IPTAL';
  torba_sayisi: number;
  teslim_alan?: string | null;
  personel: string;
  notlar?: string | null;
  iptal_nedeni?: string | null;
  tarih: string;
  gun_tarihi: string;
}

export interface ActivityLogRecord {
  _id?: unknown;
  id?: string;
  kullanici_adi: string;
  kullanici_rolu?: AppRole;
  islem_tipi: string;
  baslik: string;
  detay: string;
  hedef_kisi?: string | null;
  hedef_tc?: string | null;
  hedef_tc_hash?: string | null;
  mahalle?: string | null;
  torba_sayisi?: number | null;
  calisma_modu?: CalismaModu;
  tarih: string;
  tarih_iso: string;
  gun_tarihi: string;
  ek_bilgi?: unknown;
  prev_hash?: string;
  integrity_hash?: string;
}

export interface AuthorizedDeviceSlot {
  _id?: unknown;
  slot_no: number;
  slot_name: string;
  durum: 'AKTIF' | 'BEKLIYOR' | 'IPTAL';
  device_token_hash?: string | null;
  device_model?: string | null;
  paired_at?: string | null;
  last_used_at?: string | null;
  last_ip?: string | null;
  activation_code?: string | null;
  activation_code_expires_at?: string | null;
  created_at?: string;
}

export interface RateLimitRecord {
  _id?: unknown;
  key: string;
  count: number;
  first_attempt_at: number;
  locked_until: number;
  expires_at: Date;
  updated_at: string;
}

