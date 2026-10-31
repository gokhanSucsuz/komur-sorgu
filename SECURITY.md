# Kurumsal Güvenlik, Şifreleme ve KVKK Politikası (`SECURITY.md`)

Bu belge, **Edirne Sosyal Yardımlaşma ve Dayanışma Vakfı Başkanlığı Kömür Dağıtım ve Sorgulama Sistemi**'nin güvenlik mimarisini, anahtar rotasyonu ve yedekleme prosedürlerini açıklar.

---

## 1. Kriptografik Mimari

1. **Alan Bazlı Şifreleme (Field-Level Encryption – AES-256-GCM):**
   - Hak sahipleri, teslimat geçmişi, personel, tır sevkiyatları, saha rotaları ve işlem günlüklerindeki tüm kişisel veriler (`tc_no`, `ad_soyad`, `telefon`, `acik_adres`, `hane_no`, `totp_secret` vb.) veritabanına yazılmadan önce **256-bit AES-GCM** (`ENC:GCM:v1:<iv>:<tag>:<ciphertext>`) ile şifrelenir.
   - Her şifreleme işleminde kriptografik rastgele **96-bit (12 byte) IV** ve **128-bit kimlik doğrulama etiketi (Auth Tag)** kullanılır.
   - `ENCRYPTION_MASTER_KEY` tanımlı değilse uygulama varsayılan anahtara dönmez (**Fail-Closed**).

2. **Deterministik Kör Dizin (Blind Index – HMAC-SHA256):**
   - Şifreli alanlarda tam eşleşme araması ve mükerrerlik kontrolü için `BLIND_INDEX_KEY` ile **HMAC-SHA256** kör indeks özetleri (`tc_hash`, `hane_hash`, `adres_hash`, `irsaliye_hash`) üretilir.
   - Bu özetler API yanıtlarından otomatik olarak temizlenir (`stripBlindHashes` ve enumerable olmayan özellik tanımı).

3. **Parola ve Oturum Güvenliği:**
   - Parolalar **scrypt** (`N=32768, r=8, p=1`, 16 bayt rastgele tuz) ile özetlenir ve sabit zamanlı (`timingSafeEqual`) doğrulanır.
   - Oturum belirteçleri istemcide `HttpOnly`, `SameSite=Lax`, `Secure` çerezde tutulur; veritabanında ise yalnızca **SHA-256 özeti** saklanır.
   - Mutlak oturum süresi **6 saat**tir ve aynı anda yalnızca **tek aktif cihaz oturumuna** izin verilir.

4. **Denetim Günlüğü Bütünlük Zinciri (Tamper-Evident Audit Log Chain):**
   - `activity_logs` koleksiyonuna yazılan her kayıt, bir önceki kaydın özetine (`prev_hash`) bağlı `HMAC-SHA256` imzası (`integrity_hash`) içerir.

---

## 2. Anahtar Rotasyonu (`npm run security:rotate-keys`)

Anahtarların periyodik olarak veya şüphe durumunda yenilenmesi için yerleşik araç kullanılır:

```bash
# 1. İşlem öncesi tam veritabanı yedeği alın
npm run db:backup

# 2. Mevcut şifreli verileri ve kör indeksleri doğrulayın (salt okunur)
npm run security:rotate-keys -- validate

# 3. Yeni 256-bit anahtarlar üretip tüm koleksiyonları yeniden şifreleyin
npm run security:rotate-keys -- apply

# 4. Yalnızca yeni anahtarla tüm verilerin çözülebildiğini doğrulayın
npm run security:rotate-keys -- verify
```

İşlem tamamlandıktan ve uygulama yeniden başlatıldıktan sonra `.env.local` içindeki `ENCRYPTION_MASTER_KEY_PREVIOUS` satırını silebilirsiniz.

---

## 3. Yedekleme ve Geri Yükleme

- **Tam Yedekleme:** `npm run db:backup` komutu tüm koleksiyonları BSON tipleri korunarak (EJSON) dışa aktarır ve kayıt sayılarını doğrular.
- **Geri Yükleme:** `npm run db:restore -- <yedek_klasor_yolu>` komutu belirtilen yedek klasörünü veritabanına geri yükler.

---

## 4. KVKK Veri Saklama ve Anonimleştirme (Madde 7)

- Sosyal yardım ve teslimat tutanakları için kurumsal saklama süresi **10 yıl** (`KVKK_RETENTION_YEARS = 10`) olarak tanımlanmıştır.
- Saklama süresi dolan kayıtlarda istatistiksel bütünlük (`mahalle`, `torba_sayisi`, `donem_kodu`) korunarak kimlik ve adres verileri `anonymizeBeneficiaryRecord` yardımcısıyla geri döndürülemez biçimde anonimleştirilir.

