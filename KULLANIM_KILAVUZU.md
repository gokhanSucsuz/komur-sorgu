# T.C. EDİRNE VALİLİĞİ
## EDİRNE SOSYAL YARDIMLAŞMA VE DAYANIŞMA VAKFI BAŞKANLIĞI
### KÖMÜR DAĞITIM, SAHA TAKİP VE SORGULAMA SİSTEMİ RESMİ KULLANIM KILAVUZU

---

## İÇİNDEKİLER
1. [Giriş ve Sistemin Amacı](#1-giriş-ve-sistemin-amacı)
2. [Sisteme Giriş, Roller ve Güvenlik İlkeleri](#2-sisteme-giriş-roller-ve-güvenlik-ilkeleri)
   - 2.1. Kullanıcı Rolleri (Yönetici vs Personel)
   - 2.2. Tek Cihaz Eşzamanlılık Koruması (Single Active Session)
   - 2.3. Şifre ve Profil Güncelleme
   - 2.4. Kullanıcı Denetim ve İşlem Logları (Audit Logs)
3. [Hak Sahibi Arama, Filtreleme ve 250'lik Sayfalama](#3-hak-sahibi-arama-filtreleme-ve-250lik-sayfalama)
   - 3.1. 250 Kayıtlık Hızlı Sayfalama Mimarisi
   - 3.2. Global Arama Yeteneği (Sayfalar Arası Anlık Arama)
   - 3.3. Hane Halkı ve Mükerrer Başvuru Tespiti
   - 3.4. Adres ve Telefon Numarası Güncelleme
4. [Kömür Teslimatı, Dokunmatik Islak İmza ve Eksik Dağıtım](#4-kömür-teslimatı-dokunmatik-ıslak-imza-ve-eksik-dağıtım)
   - 4.1. Adım Adım Teslimat Süreci
   - 4.2. Dokunmatik Islak İmza Alma
   - 4.3. Teslim Alan Kişinin Belirlenmesi
   - 4.4. Kısmi / Eksik Teslimat Takibi (Örnek Senaryo)
   - 4.5. Hatalı Teslimat İptali (Yönetici PIN Onayı)
5. [Akıllı Dağıtım Rotası ve Aynı Gün Çoklu Ekip Yönetimi](#5-akıllı-dağıtım-rotası-ve-aynı-gün-çoklu-ekip-yönetimi)
   - 5.1. Eş Zamanlı Çoklu Rota Mimarisi (Ekip 1, Ekip 2, Ekip 3)
   - 5.2. Mahalle ve Sokak Bazlı Durak Oluşturma
   - 5.3. Tek Tıkla Navigasyon (Google Haritalar Yol Tarifi)
   - 5.4. Doğrudan Arama ve Rota İçi Teslimat
6. [Personel Çalışma Saatleri (Aynı Gün veya Geriye Dönük)](#6-personel-çalışma-saatleri-aynı-gün-veya-geriye-dönük)
   - 6.1. Serbest Çalışma Saati Girişi (Aynı Gün veya Geriye Dönük)
   - 6.2. Hızlı Şablonlar ve Otomatik Süre Hesabı
   - 6.3. Kayıt Geçmişi, Düzenleme ve Silme
7. [Kömür Dağıtım Dönemi ve Sezon Sonu Güvenli Arşivleme](#7-kömür-dağıtım-dönemi-ve-sezon-sonu-güvenli-arşivleme)
   - 7.1. Aktif Dönem Belirleme (Örn: 2026-2027 Kış Dönemi)
   - 7.2. Hane Başı Kömür Kotası Belirleme
   - 7.3. Sezon Kapanışı ve Kalıcı Arşive Kilitleme
   - 7.4. Aktif Listenin Sıfırlanması ve Yeni Dönem Başlangıcı
   - 7.5. Geçmiş Dönem Arşivlerinin İncelenmesi
   - 7.6. MongoDB Kota ve Performans Güvenceleri (16MB BSON Koruması & 500'lük Batch)
8. [Kömür Tonajı, Tır Girişleri ve Depo Stok Takibi](#8-kömür-tonajı-tır-girişleri-ve-depo-stok-takibi)
   - 8.1. Kantar Fişi ve Tır Kaydı
   - 8.2. Depo Stok Hesabı (Gelen Tonaj - Dağıtılan Tonaj = Kalan Stok)
9. [Excel Toplu Hak Sahibi Listesi Yükleme (Yönetici)](#9-excel-toplu-hak-sahibi-listesi-yükleme-yönetici)
   - 9.1. Resmi Şablon Formatı ve Kolon Kuralları
   - 9.2. Çoklu Sekme (Her Mahalle Ayrı Sekme) Desteği
   - 9.3. Otomatik Telefon ve Adres Normalizasyonu
10. [Raporlama, Excel İcmalleri ve Resmi PDF Dökümü](#10-raporlama-excel-icmalleri-ve-resmi-pdf-dökümü)
    - 10.1. Resmi Mahalle ve Köy İcmal Cetvelleri
    - 10.2. Kurumsal Excel Dökümleri (Zebra Desen, Lacivert Başlık)
    - 10.3. A4 Resmi PDF Yazdırma
11. [Çevrimdışı (Offline) Saha Modu ve PWA Mobil Kurulum](#11-çevrimdışı-offline-saha-modu-ve-pwa-mobil-kurulum)
    - 11.1. İnternetsiz Köy ve Bodrum Katlarında Kesintisiz Çalışma
    - 11.2. Sunucu Eşitleme (Sync)
    - 11.3. Cep Telefonuna Uygulama Olarak Yükleme (PWA)

---

## 1. GİRİŞ VE SİSTEMİN AMACI
Bu sistem; Edirne Sosyal Yardımlaşma ve Dayanışma Vakfı Başkanlığı tarafından ihtiyaç sahibi vatandaşlara ulaştırılan kışlık yakacak (kömür) yardımlarının başvuru aşamasından sahada kapıya teslimine, araç rotalamasından kantar fişi stok takibine ve dönem sonu arşivlenmesine kadar tüm aşamalarını dijital ortamda hatasız, şeffaf ve denetlenebilir şekilde yürütmek üzere geliştirilmiştir.

---

## 2. SİSTEME GİRİŞ, ROLLER VE GÜVENLİK İLKELERİ

### 2.1. Kullanıcı Rolleri
Sistemde iki ana rol tanımlanmıştır:
1. **Sistem Yöneticisi (`ADMIN`):**
   - Toplu Excel listesi yükleme / silme.
   - Kömür dağıtım dönemini açma, kapatma ve arşivleme.
   - Hane başı kömür kotasını (hedef torba) belirleme.
   - Personel ekleme, şifre sıfırlama ve hesap silme.
   - Yanlış veya mükerrer yapılan teslimatları şifreli PIN ile iptal edebilme.
   - Tüm kullanıcı denetim loglarını inceleme ve Excel olarak indirme.
2. **Saha Personeli (`PERSONEL`):**
   - Hak sahibi arama ve sorgulama.
   - Sahada adrese gidip torba teslim etme ve dokunmatik ıslak imza alma.
   - Ekipler halinde dağıtım rotası oluşturma ve harita yol tarifi alma.
   - Taşınan veya telefonu değişen vatandaşların bilgilerini güncelleme.
   - Günlük ve geriye dönük çalışma saatlerini sisteme kaydetme.

### 2.2. Tek Cihaz Eşzamanlılık Koruması (Single Active Session)
- **Güvenlik Kuralı:** Aynı kullanıcı adı ve şifre ile **aynı anda sadece 1 cihaz** oturum açabilir.
- **İşleyiş:** Bir personelin şifresiyle başka bir telefondan veya bilgisayardan sisteme girildiğinde, önceki cihazdaki oturum otomatik olarak sonlandırılır ve ekranda *"Başka bir cihazdan oturum açıldığı için bu cihazdaki oturumunuz güvenlik nedeniyle sonlandırıldı"* uyarısı görüntülenir.

### 2.3. Şifre ve Profil Güncelleme
- Her kullanıcı (yönetici veya personel), ekranın sağ üst köşesindeki ismine tıklayarak açılan **Kullanıcı Profili** ekranından kendi adını, kullanıcı adını veya şifresini istediği zaman güncelleyebilir.

### 2.4. Kullanıcı Denetim Logları (Audit Logs)
- Yapılan her işlem (teslimat, imza, adres güncellemesi, rota açılışı, excel yükleme, şifre değişimi) sunucuda saniyesi saniyesine kaydedilir.
- Kimin hangi saatte hangi TC numarası üzerinde ne işlem yaptığı asla silinemez; resmi teftişlere hazır şekilde saklanır.

---

## 3. HAK SAHİBİ ARAMA, FİLTRELEME VE 250'LİK SAYFALAMA

### 3.1. 250 Kayıtlık Hızlı Sayfalama (Pagination)
- Sistemde 2.000, 5.000 veya 10.000 kayıt yüklü olsa dahi tarayıcıyı yormamak ve MongoDB veri sınırlarını korumak için kayıtlar **sayfa başına 250 adet** olarak gösterilir.
- Listenin altındaki sayfa değiştirici (`1, 2, 3, 4 ... Son Sayfa`) butonları ile sayfalar arasında anında geçiş yapılır.

### 3.2. Global Arama Yeteneği
- **Örnek:** Siz 1. sayfada bulunuyorsunuz; ancak aradığınız vatandaş 5. sayfada veya 8. sayfada yer alıyor.
- Arama kutusuna vatandaşın **TC Kimlik Numarasını** veya **Adını Soyadını** yazdığınız anda sistem sayfa ayrımı yapmaksızın tüm veritabanını tarar ve o kaydı anında ekrana getirir.

### 3.3. Hane Halkı ve Mükerrer Başvuru Tespiti
- Aynı hanede yaşayan veya aynı adrese kayıtlı birden fazla hak sahibi varsa sistem hane kartında turuncu/sarı renkte **"Hane Halkı: 2 Başvuru"** rozeti gösterir.
- Bu butona tıklandığında aynı evde yaşayan tüm kişiler listelenir. Böylece aynı eve mükerrer (çift) kömür teslim edilmesi önlenir.

### 3.4. İkametgah Adresi ve Telefon Güncelleme
- Sahaya ulaşıldığında vatandaşın taşındığı veya telefonunun değiştiği tespit edilirse, kart üzerindeki **"Düzenle"** butonuna basılır.
- Yeni mahalle, güncel cadde/sokak/kapı no ve yeni telefon numarası girilerek anında kaydedilir.

---

## 4. KÖMÜR TESLİMATI, DOKUNMATİK ISLAK İMZA VE EKSİK DAĞITIM

### 4.1. Adım Adım Teslimat Süreci
1. Hak sahibi bulunup yeşil **"Teslimat Yap"** butonuna basılır.
2. Açılan pencerede varsayılan hedef torba (örn: 34 Torba = 850 kg) otomatik gelir.
3. Kömürün teslim edildiği kişi belirlenir (Hak Sahibinin Kendisi veya 1. Derece Yakını).
4. Islak İmza alanına dokunmatik ekran üzerinden parmak veya kalem ile imza attırılır.
5. **"Teslimatı Onayla ve Kaydet"** butonuna basılarak işlem tamamlanır.

### 4.2. Dokunmatik Islak İmza Alma
- İmza alanı yüksek çözünürlüklü dijital canvas olarak çalışır.
- Yanlış atılan imza **"Temizle"** butonuyla silinip tekrar attırılabilir.
- Alınan imza şifrelenmiş veri formatında arşive kaydedilir.

### 4.3. Kısmi / Eksik Teslimat Takibi (Örnek Senaryo)
- **Saha Senaryosu:** Mehmet Bey'in kömür hakkı 34 torbadır. Dağıtım kamyonunda yalnızca 20 torba kalmıştır.
- **İşlem:** Teslimat penceresinde torba sayısı **20** olarak girilir ve imza alınır.
- **Sistem Durumu:** Sistem bu haneyi **"EKSİK TESLİMAT"** olarak işaretler. Kalan 14 torba borç hanesinde bekler.
- **Tamamlama:** İlerleyen günlerde araca yeni kömür yüklendiğinde Mehmet Bey'e tekrar gidilir; kalan 14 torba teslim edilerek durum **"TAMAMLANDI"**ya çevrilir.

### 4.4. Hatalı Teslimat İptali
- Yanlış haneye teslimat yapıldıysa veya iptal gerekiyorsa, işlem sadece **Yönetici PIN / Şifresi** girilerek geri alınabilir. Bu sayede sahada kazara teslimat silinmesi engellenir.

---

## 5. AKILLI DAĞITIM ROTASI VE AYNI GÜN ÇOKLU EKİP YÖNETİMİ

### 5.1. Eş Zamanlı Çoklu Rota (Simultaneous Multi-Route)
- Aynı gün içinde 2, 3 veya daha fazla dağıtım ekibi farklı mahallelerde çalışabilir.
- **Örnek:**
  - *Ekip 1 (Ahmet & Murat - 22 AB 101):* Şükrüpaşa Mahallesi rotasını yürütür.
  - *Ekip 2 (Mehmet & Ali - 22 SYDV 02):* Fatih Mahallesi rotasını yürütür.
- Rota ekranının üstündeki **"Sahadaki Dağıtım Ekipleri"** butonları ile aktif rotalar arasında anlık geçiş yapılır.

### 5.2. Tek Tıkla Navigasyon (Yol Tarifi)
- Rota listesindeki her durağın yanında mavi **"Yol Tarifi"** butonu bulunur.
- Tıklandığında Google Haritalar açılarak kapıya kadar en hızlı güzergah çizilir.

### 5.3. Rota İçi Teslimat ve İmza
- Rota sayfasından ayrılmadan, durak kartındaki yeşil butonla anında teslimat penceresi açılır ve imza alınır. Teslim edilen durak rotada yeşile döner.

---

## 6. PERSONEL ÇALIŞMA SAATLERİ (AYNI GÜN VEYA GERİYE DÖNÜK)

Sistemde kronometre veya "mesai başlat/bitir" baskısı kaldırılmıştır. Personel, çalıştığı saatleri aynı gün içinde veya sonraki günlerde geriye dönük olarak istediği zaman sisteme girebilir.

### 6.1. Serbest Çalışma Saati Girişi (Aynı Gün veya Geriye Dönük)
- **"Çalışma Saatleri"** sekmesine geçilir.
- **Tarih:** Tarih seçiciden bugün veya geçmiş herhangi bir gün seçilebilir.
- **Personel:** Giriş yapan personelin adı otomatik gelir (istenirse değiştirilebilir).
- **Başlama & Bitiş Saati:** Çalışılan saatler seçilir.

### 6.2. Hızlı Şablonlar ve Otomatik Süre Hesabı
- Hızlı seçim butonları (`08:30 - 17:30`, `08:00 - 17:00`, `09:00 - 18:00`) ile tek tıkla saatler doldurulabilir.
- Sistem girilen saatler arasındaki toplam çalışma süresini (Örn: `9 sa 00 dk`) anında hesaplar.
- Çalışılan mahalleler ve saha notları eklenerek **"Çalışma Saatini Kaydet"** butonuna basılır.

### 6.3. Kayıt Geçmişi, Düzenleme ve Silme
- Girilen tüm mesai kayıtları tarih sırasına göre listelenir.
- Ay ve personel bazında filtreleme yapılabilir.
- Hatalı girilen bir kayıt mavi **"Düzenle"** butonu ile anında güncellenebilir veya silinebilir.

---

## 7. KÖMÜR DAĞITIM DÖNEMİ VE SEZON SONU GÜVENLİ ARŞİVLEME

### 7.1. Aktif Dönem Belirleme
- Yönetici, sağ üstteki mavi **Dönem Butonuna** tıklayarak açılan pencereden aktif dönemi belirler (Örn: `2026-2027 Kömür Dağıtım Dönemi`).
- Hane başı kota (örneğin 34 Torba = 850 kg) buradan tüm liste için geçerli olacak şekilde güncellenir.

### 7.2. Sezon Sonu Dönemi Kapatma ve Arşivleme (Örnek Senaryo)
- **Durum:** 2026-2027 kış sezonu tamamlanmış, tüm kömürler dağıtılmış veya sezon bitmiştir.
- **Adım 1:** Yönetici **"Dönemi Sonlandır & Arşivle"** sekmesine geçer.
- **Adım 2:** Kapatılan dönem özeti (Toplam hane, dağıtılan kömür tonajı, başarı oranı) incelenir.
- **Adım 3:** Yeni başlatılacak dönem kodu girilir (Örn: `2027-2028`).
- **Adım 4:** Onay kutusu işaretlenerek **"Dönemi Arşivle ve Yeni Dönemi Başlat"** butonuna basılır.
- **Sonuç:**
  1. `2026-2027` dönemine ait tüm hak sahipleri, teslimatlar ve ıslak imzalar kalıcı arşiv tablosuna (`archived_beneficiaries`) aktarılır.
  2. Dönemin mahalle bazlı nihai icmali ve istatistikleri `season_archives` koleksiyonuna kilitlenir.
  3. Aktif hak sahibi tablosu **sıfırlanır**.
  4. Yeni dönem (`2027-2028`) tertemiz başlar ve yeni Excel listesi yüklenmeye hazır hale gelir.
  5. **Hiçbir eski veri silinmez;** geçmiş dönemler arşiv sekmesinde kalıcı olarak saklanır.

### 7.3. MongoDB Kota ve Performans Önlemleri
- **16MB BSON Güvencesi:** Binlerce hanelik liste tek bir JSON dokümanının içine tıkıştırılmaz. İcmal özeti ile hak sahipleri ayrı koleksiyonlarda tutulur.
- **500'lük Batch Güvencesi:** Arşivleme sırasında veriler 500'lük parçalar halinde aktarılır. Bu sayede bellek şişmesi (RAM spike) ve bağlantı kopması yaşanmaz.
- **Bileşik İndeksler:** `{ donem_kodu: 1 }`, `{ donem_kodu: 1, tc_hash: 1 }` ve `{ donem_kodu: 1, mahalle: 1 }` indeksleri sayesinde yüzbinlerce kayıt arasında dahi aramalar milisaniyeler sürer.

### 7.4. Geçmiş Dönem Çift Sekmeli Excel İndirme
- Arşiv sekmesindeki herhangi bir geçmiş dönemin yanındaki **"Excel Raporu İndir"** butonuna basıldığında:
  - **1. Sekme ("Dönem İcmali"):** Mahalle mahalle toplam hane, hedef kömür, dağıtılan torba/ton ve genel toplam icmal cetveli.
  - **2. Sekme ("Hak Sahipleri"):** Arşivlenen tüm vatandaşların sıra, hane no, TC, adı soyadı, telefon, adres, teslim edilen torba ve ıslak imza durumu dökülür.

---

## 8. KÖMÜR TONAJI, TIR GİRİŞLERİ VE DEPO STOK TAKİBİ

### 8.1. Kantar Fişi Girişi
- Depoya gelen her kömür tırı için Araç Plakası, İrsaliye Numarası, Ocak Adı ve Net Kantar Tonajı sisteme kaydedilir.

### 8.2. Depo Stok Mutabakatı
- **Gelen Toplam Kömür Tonajı:** Kantardan geçen tırların net tonaj toplamı.
- **Dağıtılan Toplam Kömür Tonajı:** Sahada hanelere teslim edilen torbaların ton karşılığı (Torba x 25 kg).
- **Depodaki Kalan Kömür Stoğu:** Otomatik olarak `Gelen Ton - Dağıtılan Ton` formülü ile hesaplanır ve kaçak/açık riski ortadan kaldırılır.

---

## 9. EXCEL TOPLU HAK SAHİBİ LİSTESİ YÜKLEME (YÖNETİCİ)

### 9.1. Resmi Şablon Formatı
- Excel dosyasında şu sütunların yer alması yeterlidir:
  1. `TC Kimlik No` (11 haneli rakam)
  2. `Adı Soyadı`
  3. `Telefon` (Başında 0 olsun veya olmasın)
  4. `Mahalle`
  5. `Açık Adres` (Cadde, sokak, kapı ve daire no)
  6. `Hane No` (Varsa)

### 9.2. Çoklu Sekme Desteği
- İster tek bir sayfada tüm liste olsun, ister her mahalle ayrı bir Excel sekmesinde olsun; sistem tüm sekmeleri otomatik tarar, birleştirir ve veritabanına aktarır.

### 9.3. Otomatik Telefon ve Adres Normalizasyonu
- Telefon sütunundaki parantezler, tireler ve boşluklar otomatik ayıklanarak geçerli `05XXXXXXXXX` formatına getirilir.

---

## 10. RAPORLAMA, EXCEL İCMALLERİ VE RESMİ PDF DÖKÜMÜ

### 10.1. Kurumsal Excel Tasarımı
- İndirilen tüm Excel listeleri T.C. Edirne Valiliği kurumsal renk paletinde hazırlanır:
  - Koyu lacivert başlık ve beyaz kalın yazı.
  - Okumayı kolaylaştıran modern **Zebra Deseni** (açık gri / beyaz satırlar).
  - Tamamlananlar için zümrüt yeşili, eksikler için kehribar sarısı durum renklendirmesi.
  - Türkçe karakter güvenliği (RFC 6266 / UTF-8 uyumlu indirme).

### 10.2. Valilik Resmi PDF Çıktısı
- İstatistik sayfasındaki **"Resmi PDF Raporu Yazdır"** butonuna basıldığında ekrandaki gereksiz butonlar gizlenir; A4 kağıdına tam oturan resmi mühür ve imza alanlı icmal raporu yazdırılır.

---

## 11. ÇEVRİMDISI (OFFLINE) SAHA MODU VE PWA MOBİL KURULUM

### 11.1. İnternetsiz Köy Dağıtımı
- İnternetin çekmediği kırsal köylerde veya bodrum katlarda ekran donmaz; teslimat yapılabilir ve ıslak imza alınabilir.
- Yapılan teslimatlar cihazın yerel IndexedDB veritabanında güvenle saklanır.

### 11.2. Sunucu Eşitleme (Sync)
- İnternet bağlantısı sağlandığında ekranın üstünde sarı renkli **"Eşitle: X"** rozeti belirir.
- Rozete veya yenile butonuna tıklandığında çevrimdışı yapılan tüm teslimatlar sunucuya aktarılır ve kayıtlar mühürlenir.

### 11.3. Cep Telefonuna PWA Kurulumu
- **Android (Chrome):** Sağ üstteki üç noktaya basıp **"Uygulamayı Yükle"** veya **"Ana Ekrana Ekle"** seçilir.
- **iOS (Safari):** Alttaki Paylaş butonuna basıp **"Ana Ekrana Ekle"** seçilir.
- Uygulama masaüstüne Edirne SYDV logosuyla bir mobil uygulama gibi yerleşir.

---

**T.C. Edirne Valiliği • Sosyal Yardımlaşma ve Dayanışma Vakfı Başkanlığı**  
*Resmi Kömür Dağıtım ve Saha Takip Sistemi Kılavuz Dokümanı*
