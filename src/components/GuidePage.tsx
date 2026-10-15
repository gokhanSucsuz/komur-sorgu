'use client';

import { useState, useMemo } from 'react';
import {
  BookOpen,
  Search,
  CheckCircle2,
  AlertTriangle,
  Shield,
  Target,
  Route as RouteIcon,
  Clock,
  Archive,
  Truck,
  FileSpreadsheet,
  BarChart3,
  WifiOff,
  UserCheck,
  Phone,
  Navigation,
  Printer,
  ChevronRight,
  ChevronLeft,
  HelpCircle,
  Sparkles,
  Info,
  Users,
  PenTool,
  Download,
  Flame,
  Smartphone
} from 'lucide-react';

interface GuidePageProps {
  userRole?: 'ADMIN' | 'PERSONEL';
  onNavigateTab?: (tab: any) => void;
}

export default function GuidePage({ userRole = 'PERSONEL', onNavigateTab }: GuidePageProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [activeTab, setActiveTab] = useState<string>('intro');

  const categories = [
    { id: 'intro', order: 1, label: 'Giriş & Güvenlik', fullTitle: '1. Sisteme Giriş & Güvenlik', icon: Shield },
    { id: 'query', order: 2, label: 'Sorgu & Sayfalama', fullTitle: '2. Hak Sahibi Sorgulama', icon: Search },
    { id: 'delivery', order: 3, label: 'Teslimat & İmza', fullTitle: '3. Teslimat & Islak İmza', icon: PenTool },
    { id: 'route', order: 4, label: 'Çoklu Rota', fullTitle: '4. Çoklu Rota & Ekipler', icon: RouteIcon },
    { id: 'shift', order: 5, label: 'Çalışma Saatleri', fullTitle: '5. Çalışma Saati Girişi', icon: Clock },
    { id: 'season', order: 6, label: 'Dönem & Arşiv', fullTitle: '6. Kömür Dönemi & Arşivleme', icon: Archive },
    { id: 'analytics', order: 7, label: 'İstatistik & PDF', fullTitle: '7. İstatistikler & Raporlar', icon: BarChart3 },
    { id: 'tonnage', order: 8, label: 'Tonaj & Depo', fullTitle: '8. Kömür Tonajı & Depo Stoğu', icon: Truck },
    { id: 'import', order: 9, label: 'Excel Yükleme', fullTitle: '9. Excel Hak Sahibi Yükleme', icon: FileSpreadsheet },
    { id: 'offline', order: 10, label: 'Çevrimdışı & PWA', fullTitle: '10. Çevrimdışı Mod & Mobil PWA', icon: WifiOff },
  ];

  const guideSections = [
    // 1. GİRİŞ VE GÜVENLİK
    {
      id: 'intro',
      order: 1,
      title: '1. Sisteme Giriş, Güvenlik ve Tek Cihaz Oturumu',
      badge: 'GÜVENLİK',
      badgeColor: 'bg-indigo-50 text-indigo-700 border-indigo-200',
      description: 'Sistem kullanıcı rolleri, tek cihaz eşzamanlılık güvenliği ve şifre işlemleri.',
      content: (
        <div className="space-y-4 text-xs text-slate-700 leading-relaxed">
          <p>
            Edirne SYDV Kömür Dağıtım ve Sorgulama Sistemi, yüksek güvenlik standartlarına sahip rol tabanlı (Role-Based Access Control) bir mimariyle çalışır.
          </p>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div className="p-3.5 rounded-xl bg-amber-50/70 border border-amber-200">
              <div className="flex items-center gap-1.5 font-bold text-amber-900 mb-1">
                <Shield className="w-4 h-4 text-amber-600" />
                <span>Sistem Yöneticisi (ADMIN)</span>
              </div>
              <p className="text-[11px] text-amber-800">
                Excel hak sahibi listesi yükleme, kömür dönemi belirleme ve arşivleme, personel ekleme/şifre yönetimi, hane kömür kotası belirleme ve yapılan teslimatları iptal edebilme yetkilerine sahiptir.
              </p>
            </div>

            <div className="p-3.5 rounded-xl bg-sky-50/70 border border-sky-200">
              <div className="flex items-center gap-1.5 font-bold text-sky-900 mb-1">
                <UserCheck className="w-4 h-4 text-sky-600" />
                <span>Saha Personeli (PERSONEL)</span>
              </div>
              <p className="text-[11px] text-sky-800">
                Hak sahibi arama ve sorgulama, kömür teslimatı yapma, dokunmatik ıslak imza alma, saha dağıtım rotası oluşturma ve günlük/geriye dönük çalışma saatlerini sisteme kaydetme işlemlerini gerçekleştirir.
              </p>
            </div>
          </div>

          <div className="p-3.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-900">
            <div className="flex items-start gap-2.5">
              <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
              <div>
                <h5 className="font-extrabold text-xs text-rose-950">Önemli Güvenlik Kuralı: Tek Cihaz Oturumu (Single Active Device)</h5>
                <p className="text-[11px] text-rose-800 mt-1">
                  Aynı kullanıcı adı ve şifre ile <strong>yalnızca 1 cihaz</strong> aynı anda sisteme giriş yapabilir. Bir personelin hesabıyla yeni bir telefondan veya bilgisayardan giriş yapıldığında, önceki cihazdaki oturum otomatik olarak güvenlik sebebiyle sonlandırılır.
                </p>
              </div>
            </div>
          </div>

          <div className="bg-slate-50 p-3.5 rounded-xl border border-slate-200">
            <h5 className="font-bold text-slate-900 text-xs mb-1">Şifre & Kullanıcı Adı Güncelleme:</h5>
            <p className="text-[11px] text-slate-600">
              Herhangi bir kullanıcı veya yönetici, ekranın sağ üst köşesinde yer alan kendi ismine tıklayarak açılan <strong>Kullanıcı Profili</strong> penceresinden adını, kullanıcı adını veya şifresini istediği zaman kolayca güncelleyebilir.
            </p>
          </div>
        </div>
      ),
    },

    // 2. SORGULAMA, FİLTRELEME & SAYFALAMA
    {
      id: 'query',
      order: 2,
      title: '2. Hak Sahibi Arama, Filtreleme ve 250\'lik Modern Sayfalama',
      badge: 'SORGULAMA',
      badgeColor: 'bg-blue-50 text-blue-700 border-blue-200',
      description: '250 kayıtlık hızlı sayfalama, global anlık arama ve hane halkı mükerrerlik kontrolü.',
      content: (
        <div className="space-y-4 text-xs text-slate-700 leading-relaxed">
          <p>
            Sistemde binlerce hak sahibi kayıtlı olsa dahi, tarayıcının ve cihazların donmaması, kotaya takılmaması için modern <strong>250 kayıtlık sayfalama (pagination)</strong> mimarisi uygulanmıştır.
          </p>

          <div className="p-3.5 rounded-xl bg-blue-50/70 border border-blue-200">
            <h5 className="font-extrabold text-xs text-blue-950 flex items-center gap-1.5 mb-1">
              <Sparkles className="w-4 h-4 text-blue-600" />
              <span>Global Hızlı Arama Gücü</span>
            </h5>
            <p className="text-[11px] text-blue-800">
              Siz 1. sayfada olsanız dahi, 5. sayfadaki veya listenin en sonundaki bir vatandaşı arama kutusuna <strong>TC Kimlik Numarası</strong> veya <strong>Ad-Soyad</strong> yazarak anında bulabilirsiniz. Arama işlemi sadece mevcut sayfayı değil, tüm veritabanını tarayarak sonucu milisaniyeler içinde getirir.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-2.5 text-[11px]">
            <div className="p-3 rounded-xl bg-slate-50 border border-slate-200">
              <span className="font-bold text-slate-900 block mb-1">🔍 Arama Seçenekleri:</span>
              <ul className="list-disc list-inside text-slate-600 space-y-0.5">
                <li>11 Haneli TC Kimlik No</li>
                <li>Ad veya Soyad</li>
                <li>Mahalle / Köy Adı</li>
                <li>Sokak / Cadde / Kapı No</li>
              </ul>
            </div>

            <div className="p-3 rounded-xl bg-slate-50 border border-slate-200">
              <span className="font-bold text-slate-900 block mb-1">📑 Durum Sekmeleri:</span>
              <ul className="list-disc list-inside text-slate-600 space-y-0.5">
                <li><strong>Bekleyen & Kısmi:</strong> Dağıtım yapılacaklar</li>
                <li><strong>Teslim Edilenler:</strong> Tamamlananlar</li>
                <li><strong>Eksik Kalanlar:</strong> Kısmi teslimat</li>
              </ul>
            </div>

            <div className="p-3 rounded-xl bg-slate-50 border border-slate-200">
              <span className="font-bold text-slate-900 block mb-1">🏠 Hane Halkı Tespiti:</span>
              <p className="text-slate-600">
                Aynı adreste/hanede yaşayan birden fazla hak sahibi varsa sistem sarı uyarı rozetiyle bunu belirtir.
              </p>
            </div>
          </div>

          <div className="p-3.5 rounded-xl bg-emerald-50 border border-emerald-200">
            <h5 className="font-bold text-emerald-950 text-xs mb-1">İkametgah Adresi & Telefon Güncelleme:</h5>
            <p className="text-[11px] text-emerald-800">
              Sahaya gidildiğinde vatandaş taşınmış veya yeni telefon numarası almışsa, hak sahibi kartındaki <strong>&quot;Düzenle&quot;</strong> butonuna basılarak mahalle, açık adres ve telefon bilgisi anında güncellenir.
            </p>
          </div>
        </div>
      ),
    },

    // 3. TESLİMAT VE ISLAK İMZA
    {
      id: 'delivery',
      order: 3,
      title: '3. Kömür Teslimatı, Dokunmatik Islak İmza ve Eksik Dağıtım',
      badge: 'SAHA DAĞITIMI',
      badgeColor: 'bg-emerald-50 text-emerald-700 border-emerald-200',
      description: 'Sahada vatandaşa kömür teslim etme, dijital imza alma ve kısmi teslimat tamamlama adımları.',
      content: (
        <div className="space-y-4 text-xs text-slate-700 leading-relaxed">
          <p>
            Hak sahibi adresine ulaşıldığında kömür teslimatı 3 kolay adımda resmi kayıtlara geçirilir:
          </p>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div className="p-3.5 rounded-xl bg-white border border-slate-200 shadow-xs space-y-1">
              <span className="w-5 h-5 rounded-full bg-blue-100 text-blue-800 font-extrabold flex items-center justify-center text-xs">1</span>
              <h5 className="font-bold text-slate-900 text-xs">Torba Sayısını Belirleyin</h5>
              <p className="text-[11px] text-slate-600">
                Hedef kota (varsayılan 34 torba / 850 kg) otomatik gelir. İhtiyaç halinde teslim edilen miktar düzenlenebilir.
              </p>
            </div>

            <div className="p-3.5 rounded-xl bg-white border border-slate-200 shadow-xs space-y-1">
              <span className="w-5 h-5 rounded-full bg-blue-100 text-blue-800 font-extrabold flex items-center justify-center text-xs">2</span>
              <h5 className="font-bold text-slate-900 text-xs">Teslim Alanı Seçin</h5>
              <p className="text-[11px] text-slate-600">
                Kömürü hak sahibinin bizzat kendisi mi yoksa 1. derece yakını (eşi, çocuğu, annesi vb.) mı teslim alıyor seçin.
              </p>
            </div>

            <div className="p-3.5 rounded-xl bg-white border border-slate-200 shadow-xs space-y-1">
              <span className="w-5 h-5 rounded-full bg-blue-100 text-blue-800 font-extrabold flex items-center justify-center text-xs">3</span>
              <h5 className="font-bold text-slate-900 text-xs">Dokunmatik Islak İmza Alın</h5>
              <p className="text-[11px] text-slate-600">
                Vatandaş tablet veya telefon ekranına parmağıyla imzasını atar. &quot;Teslimatı Onayla&quot; butonuna basıldığında kayıt mühürlenir.
              </p>
            </div>
          </div>

          {/* ÖRNEK SENARYO */}
          <div className="p-3.5 rounded-2xl bg-amber-50 border border-amber-200 space-y-2">
            <div className="flex items-center gap-1.5 font-extrabold text-amber-950 text-xs">
              <Flame className="w-4 h-4 text-amber-600" />
              <span>Örnek Saha Senaryosu: Eksik / Kısmi Teslimat</span>
            </div>
            <p className="text-[11px] text-amber-900 leading-normal">
              <strong>Durum:</strong> Ayşe Hanım&apos;ın kömür hakkı 34 torbadır. Ancak dağıtım kamyonunda yalnızca 20 torba kömür kalmıştır.<br />
              <strong>Yapılacak İşlem:</strong> Teslimat penceresinde teslim edilen miktar olarak <strong>20 torba</strong> girilir ve imza alınır.<br />
              <strong>Sonuç:</strong> Sistem bu haneyi <strong>&quot;EKSİK TESLİMAT&quot;</strong> olarak işaretler. Kalan 14 torba sistemde borç olarak bekler. Daha sonra araç kömür yüklediğinde Ayşe Hanım&apos;a gidilip kalan 14 torba teslim edilerek durum &quot;TAMAMLANDI&quot;ya çekilir.
            </p>
          </div>
        </div>
      ),
    },

    // 4. ÇOKLU DAĞITIM ROTASI
    {
      id: 'route',
      order: 4,
      title: '4. Akıllı Dağıtım Rotası ve Aynı Gün Çoklu Ekip Yönetimi',
      badge: 'ÇOKLU EKİP',
      badgeColor: 'bg-sky-50 text-sky-700 border-sky-200',
      description: 'Aynı gün içinde 2 veya 3 farklı ekibin eş zamanlı rota oluşturması, navigasyon ve saha dağıtımı.',
      content: (
        <div className="space-y-4 text-xs text-slate-700 leading-relaxed">
          <p>
            Farklı mahallelerde aynı anda çalışan ekipler için sistemde <strong>eş zamanlı çoklu rota</strong> desteği mevcuttur.
          </p>

          <div className="p-3.5 rounded-xl bg-sky-50 border border-sky-200">
            <h5 className="font-extrabold text-xs text-sky-950 mb-1">Aynı Anda Birden Fazla Rota Oluşturma:</h5>
            <p className="text-[11px] text-sky-800 leading-normal">
              Örneğin 1. Ekip <strong>Şükrüpaşa Mahallesi</strong> rotasını çalıştırırken, 2. Ekip aynı gün içinde <strong>Fatih Mahallesi</strong> rotasını başlatabilir. Her ekip kendi aracını, personelini ve duraklarını bağımsız olarak takip eder.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="p-3.5 rounded-xl bg-white border border-slate-200">
              <span className="font-bold text-slate-900 block mb-1 flex items-center gap-1.5">
                <Navigation className="w-4 h-4 text-blue-600" />
                <span>Tek Tıkla Harita & Navigasyon</span>
              </span>
              <p className="text-[11px] text-slate-600">
                Rota listesindeki her durağın yanında bulunan <strong>&quot;Yol Tarifi&quot;</strong> butonuna basıldığında Google Haritalar açılır ve doğrudan kapıya kadar navigasyon başlatılır.
              </p>
            </div>

            <div className="p-3.5 rounded-xl bg-white border border-slate-200">
              <span className="font-bold text-slate-900 block mb-1 flex items-center gap-1.5">
                <Phone className="w-4 h-4 text-emerald-600" />
                <span>Doğrudan Telefonla Arama</span>
              </span>
              <p className="text-[11px] text-slate-600">
                Adrese yaklaşırken vatandaşı haberdar etmek için durak kartındaki telefon simgesine tıklanarak doğrudan arama yapılabilir.
              </p>
            </div>
          </div>
        </div>
      ),
    },

    // 5. SAHA MESAİ TAKİBİ
    {
      id: 'shift',
      order: 5,
      title: '5. Personel Günlük Çalışma Saati Girişi (Aynı Gün veya Geriye Dönük)',
      badge: 'ÇALIŞMA SAATLERİ',
      badgeColor: 'bg-indigo-50 text-indigo-700 border-indigo-200',
      description: 'Personelin günlük çalışma saatlerini pratikçe girmesi, aynı gün veya geçmiş günlere yönelik geriye dönük mesai kaydı oluşturabilmesi.',
      content: (
        <div className="space-y-4 text-xs text-slate-700 leading-relaxed">
          <p>
            Sistemde karmaşık ve baskıcı &quot;mesai başlat/bitir&quot; veya kronometre zorunluluğu <strong>bulunmaz</strong>. Personel, çalıştığı gün veya daha sonraki günlerde geriye dönük olarak çalıştığı saatleri özgürce sisteme işleyebilir.
          </p>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div className="p-3.5 rounded-xl bg-indigo-50/70 border border-indigo-200">
              <h5 className="font-bold text-indigo-950 text-xs mb-1">Aynı Gün veya Geriye Dönük Giriş</h5>
              <p className="text-[11px] text-indigo-800">
                Tarih seçiciden bugünü veya geçmiş bir tarihi seçebilirsiniz. Başlama ve bitiş saatlerini yazarak veya hızlı şablon butonlarına (08:30-17:30, 08:00-17:00, 09:00-18:00) tıklayarak tek tıkla saatleri doldurabilirsiniz. Sistem çalışma süresini otomatik hesaplar.
              </p>
            </div>

            <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200">
              <h5 className="font-bold text-slate-950 text-xs mb-1">Kayıt Geçmişi, Düzenleme & Silme</h5>
              <p className="text-[11px] text-slate-600">
                Girilen çalışma saatleri alt listede tarih sırasıyla listelenir. Hatalı girilen saatler &quot;Düzenle&quot; butonuyla düzeltilebilir, istenirse silinebilir. Ay ve personel bazında filtreleme yapılabilir.
              </p>
            </div>
          </div>
        </div>
      ),
    },

    // 6. KÖMÜR DÖNEMİ VE SEZON ARŞİVLEME
    {
      id: 'season',
      order: 6,
      title: '6. Kömür Dağıtım Dönemi Belirleme, Sezon Kapanışı ve Güvenli Arşivleme',
      badge: 'YÖNETİCİ ÖZEL',
      badgeColor: 'bg-rose-50 text-rose-700 border-rose-200',
      description: 'Kömür dönemi belirleme (2026-2027), sezon bittiğinde verileri arşive kilitleme, listeleri sıfırlama ve kota güvenliği.',
      content: (
        <div className="space-y-4 text-xs text-slate-700 leading-relaxed">
          <p>
            Yönetici, sistemin dağıtım dönemini belirleyebilir (örneğin <strong>2026-2027 Kömür Dağıtım Dönemi</strong>). Dağıtım sezonu sona erdiğinde tüm veriler mühürlenir ve arşivlenir.
          </p>

          <div className="p-4 rounded-2xl bg-gradient-to-r from-blue-900 to-indigo-950 text-white shadow-xs">
            <h5 className="font-black text-sm text-white flex items-center gap-1.5 mb-1">
              <Archive className="w-4 h-4 text-blue-300" />
              <span>Dönem Kapanışında Ne Olur?</span>
            </h5>
            <ul className="text-[11px] text-blue-100 space-y-1.5 list-disc list-inside mt-2">
              <li>Mevcut döneme ait tüm hak sahipleri, teslimatlar ve ıslak imzalar <strong>kalıcı arşive</strong> kilitlenir.</li>
              <li>Mahalle/köy bazında nihai icmal tablosu ve başarı oranı arşiv snapshot&apos;ı olarak saklanır.</li>
              <li>Aktif hak sahibi tablosu <strong>yeni dönem için tertemiz sıfırlanır</strong>.</li>
              <li>Yeni sezon (örneğin 2027-2028) başlar ve yeni Excel listesi yüklenmeye hazır hale gelir.</li>
              <li><strong>Hiçbir veri kaybolmaz;</strong> geçmiş dönemlerin dökümleri istenildiği an Excel olarak indirilebilir.</li>
            </ul>
          </div>

          <div className="p-3.5 rounded-xl bg-amber-50 border border-amber-200 text-amber-900">
            <div className="flex items-start gap-2">
              <Shield className="w-4 h-4 text-amber-700 shrink-0 mt-0.5" />
              <div>
                <h5 className="font-bold text-xs text-amber-950">MongoDB Kota ve Performans Güvencesi:</h5>
                <p className="text-[11px] text-amber-800 mt-1">
                  Arşivleme işlemi sırasında veritabanı 16MB BSON limitine takılmaması ve sunucu belleğinin şişmemesi için veriler <strong>500&apos;lük güvenli paketler</strong> halinde aktarılır. Bileşik indeksler sayesinde milyonlarca arşiv kaydı olsa dahi sorgulamalar milisaniyeler sürer.
                </p>
              </div>
            </div>
          </div>
        </div>
      ),
    },

    // 7. İSTATİSTİK VE RAPORLAR
    {
      id: 'analytics',
      order: 7,
      title: '7. İstatistiki Raporlar, Mahalle Cetvelleri ve Resmi PDF Dökümü',
      badge: 'RAPORLAMA',
      badgeColor: 'bg-emerald-50 text-emerald-700 border-emerald-200',
      description: 'Mahalle ve sokak bazlı icmal cetvelleri, grafik analizler ve Valilik formatında resmi PDF çıktıları.',
      content: (
        <div className="space-y-4 text-xs text-slate-700 leading-relaxed">
          <p>
            Vakıf yönetimi ve denetim organları için tüm dağıtım süreci canlı olarak raporlanır.
          </p>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div className="p-3.5 rounded-xl bg-white border border-slate-200">
              <span className="font-bold text-slate-900 block mb-1 flex items-center gap-1.5">
                <BarChart3 className="w-4 h-4 text-amber-600" />
                <span>Mahalle & Köy Dağılım Cetveli</span>
              </span>
              <p className="text-[11px] text-slate-600">
                Hangi mahallede kaç hane var, ne kadar kömür (torba ve ton) dağıtıldı, ne kadar kaldı ve tamamlanma yüzdesi nedir canlı olarak listelenir.
              </p>
            </div>

            <div className="p-3.5 rounded-xl bg-white border border-slate-200">
              <span className="font-bold text-slate-900 block mb-1 flex items-center gap-1.5">
                <Printer className="w-4 h-4 text-blue-600" />
                <span>Resmi PDF / Yazıcı Formatı</span>
              </span>
              <p className="text-[11px] text-slate-600">
                <strong>&quot;Resmi PDF Raporu Yazdır&quot;</strong> butonuna basıldığında A4 standartlarında, T.C. Edirne Valiliği SYDV başlıklı resmi döküm hazır hale gelir.
              </p>
            </div>
          </div>
        </div>
      ),
    },

    // 8. KÖMÜR TONAJ VE DEPO
    {
      id: 'tonnage',
      order: 8,
      title: '8. Kömür Tonajı, Tır Girişleri ve Depo Stok Takibi',
      badge: 'DEPO YÖNETİMİ',
      badgeColor: 'bg-slate-100 text-slate-700 border-slate-300',
      description: 'Kantar fişleri ile kömür tırı kaydı, toplam gelen tonaj ve sahada dağıtılan kömürün stok mutabakatı.',
      content: (
        <div className="space-y-4 text-xs text-slate-700 leading-relaxed">
          <p>
            Kömür ocaklarından depoya gelen sevkiyatlar ve sahada dağıtılan kömür miktarı anlık olarak karşılaştırılır.
          </p>

          <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200">
            <h5 className="font-bold text-slate-900 text-xs mb-1">Kantar Fişi Kaydı:</h5>
            <p className="text-[11px] text-slate-600">
              Depoya gelen her tır için Araç Plakası, İrsaliye No, Ocak Adı ve Net Kantar Tonajı girilir.
            </p>
          </div>

          <div className="p-3.5 rounded-xl bg-blue-50 border border-blue-200 text-blue-900">
            <h5 className="font-bold text-xs text-blue-950 mb-1">Otomatik Depo Stok Hesabı:</h5>
            <p className="text-[11px] text-blue-800">
              <strong>Depodaki Kalan Kömür</strong> = Gelen Toplam Kömür Tonajı - Sahada Hanelere Dağıtılan Kömür Tonajı formülü ile hiçbir fire ve açık olmadan otomatik hesaplanır.
            </p>
          </div>
        </div>
      ),
    },

    // 9. EXCEL VERİ YÜKLEME
    {
      id: 'import',
      order: 9,
      title: '9. Excel Hak Sahibi Listesi Yükleme & Şablon Kuralları',
      badge: 'YÖNETİCİ ÖZEL',
      badgeColor: 'bg-rose-50 text-rose-700 border-rose-200',
      description: 'Toplu hak sahibi yükleme şablonu, kolon kuralları, telefon ayıklama ve mükerrer kayıt güvenliği.',
      content: (
        <div className="space-y-4 text-xs text-slate-700 leading-relaxed">
          <p>
            Yeni bir kömür dönemi başladığında veya ek liste geldiğinde, Excel dosyası sisteme saniyeler içinde aktarılır.
          </p>

          <div className="p-3.5 rounded-xl bg-white border border-slate-200 space-y-2">
            <h5 className="font-bold text-slate-900 text-xs">Excel Dosyasında Bulunması Gereken Sütunlar:</h5>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 text-[11px] font-semibold text-slate-700">
              <span className="p-2 bg-slate-50 rounded border border-slate-200 text-center">TC Kimlik No (11 Hane)</span>
              <span className="p-2 bg-slate-50 rounded border border-slate-200 text-center">Adı Soyadı</span>
              <span className="p-2 bg-slate-50 rounded border border-slate-200 text-center">Telefon Numarası</span>
              <span className="p-2 bg-slate-50 rounded border border-slate-200 text-center">Mahalle / Köy</span>
              <span className="p-2 bg-slate-50 rounded border border-slate-200 text-center">Açık Adres (Cad/Sok/Kapı)</span>
              <span className="p-2 bg-slate-50 rounded border border-slate-200 text-center">Hane No (Varsa)</span>
            </div>
          </div>

          <div className="p-3.5 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-900">
            <h5 className="font-bold text-xs text-emerald-950 mb-1">Akıllı Normalizasyon:</h5>
            <p className="text-[11px] text-emerald-800">
              Yüklenen Excel dosyasındaki telefon numaralarında boşluk veya parantez olsa dahi sistem bunu otomatik olarak <code>05XXXXXXXXX</code> formatına dönüştürür.
            </p>
          </div>
        </div>
      ),
    },

    // 10. ÇEVRİMDISI VE PWA
    {
      id: 'offline',
      order: 10,
      title: '10. Çevrimdışı (Offline) Saha Modu ve PWA Mobil Uygulama Kurulumu',
      badge: 'OFFLINE & MOBİL',
      badgeColor: 'bg-amber-50 text-amber-700 border-amber-200',
      description: 'İnternet çekmeyen bölgelerde kesintisiz çalışma ve cep telefonuna uygulama olarak yükleme.',
      content: (
        <div className="space-y-4 text-xs text-slate-700 leading-relaxed">
          <p>
            Kırsal köylerde veya bodrum katlarda internet bağlantısı kopsa dahi dağıtım asla durmaz.
          </p>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div className="p-3.5 rounded-xl bg-amber-50/70 border border-amber-200">
              <span className="font-bold text-amber-950 block mb-1 flex items-center gap-1.5">
                <WifiOff className="w-4 h-4 text-amber-700" />
                <span>Çevrimdışı Çalışma (Offline Mode)</span>
              </span>
              <p className="text-[11px] text-amber-800">
                İnternet yokken teslimat yapabilir ve imza alabilirsiniz. Veriler cihazın güvenli hafızasında (IndexedDB) saklanır. İnternet geri geldiğinde <strong>&quot;Eşitle&quot;</strong> butonuna basılarak sunucuya aktarılır.
              </p>
            </div>

            <div className="p-3.5 rounded-xl bg-blue-50/70 border border-blue-200">
              <span className="font-bold text-blue-950 block mb-1 flex items-center gap-1.5">
                <Smartphone className="w-4 h-4 text-blue-700" />
                <span>Mobil Uygulama Olarak Ekleme (PWA)</span>
              </span>
              <p className="text-[11px] text-blue-800">
                Android veya iOS cihazınızda Chrome/Safari tarayıcısında <strong>&quot;Ana Ekrana Ekle&quot;</strong> seçeneğine tıklayarak sistemi telefonunuza gerçek bir mobil uygulama gibi yükleyebilirsiniz.
              </p>
            </div>
          </div>
        </div>
      ),
    },
  ];

  // Search filter
  const searchResults = useMemo(() => {
    if (!searchQuery.trim()) return [];
    const q = searchQuery.toLocaleLowerCase('tr');
    return guideSections.filter((sec) => {
      const titleMatch = sec.title.toLocaleLowerCase('tr').includes(q);
      const descMatch = sec.description.toLocaleLowerCase('tr').includes(q);
      const badgeMatch = sec.badge.toLocaleLowerCase('tr').includes(q);
      return titleMatch || descMatch || badgeMatch;
    });
  }, [guideSections, searchQuery]);

  // Current active section for single-tabbed view
  const currentSection = useMemo(() => {
    return guideSections.find((s) => s.id === activeTab) || guideSections[0];
  }, [guideSections, activeTab]);

  const currentIndex = categories.findIndex((c) => c.id === activeTab);
  const prevCategory = currentIndex > 0 ? categories[currentIndex - 1] : null;
  const nextCategory = currentIndex < categories.length - 1 ? categories[currentIndex + 1] : null;

  return (
    <div className="space-y-5 max-w-5xl mx-auto pb-16">
      {/* Banner / Header */}
      <div className="p-4 sm:p-6 rounded-3xl bg-gradient-to-br from-slate-900 via-blue-950 to-indigo-950 text-white shadow-md border border-slate-800 relative overflow-hidden">
        <div className="relative z-10 space-y-2.5">
          <div className="flex flex-wrap items-center gap-2">
            <span className="px-2.5 py-0.5 rounded-full bg-blue-500/20 text-blue-300 border border-blue-400/30 text-[10px] font-black uppercase tracking-wider">
              T.C. EDİRNE SYDV
            </span>
            <span className="px-2.5 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-400/30 text-[10px] font-black uppercase tracking-wider">
              KULLANIM KILAVUZU
            </span>
          </div>

          <div>
            <h2 className="text-lg sm:text-2xl font-black text-white tracking-tight leading-tight">
              Kömür Dağıtım ve Sorgulama Sistemi Kılavuzu
            </h2>
            <p className="text-xs text-slate-300 mt-1 max-w-xl font-medium leading-relaxed hidden sm:block">
              Saha personeli ve yöneticiler için hak sahibi sorgulamadan ıslak imzalı kömür teslimatına tüm süreçler.
            </p>
          </div>

          {/* Quick Search inside Guide with Fixed Mobile Positioning & Concise Placeholder */}
          <div className="pt-1 w-full max-w-sm">
            <div className="relative w-full flex items-center">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                <Search className="w-4 h-4 text-blue-200" />
              </div>
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Kılavuzda konu ara..."
                className="w-full pl-9 pr-8 py-2 bg-white/15 border border-white/25 rounded-xl text-xs text-white placeholder:text-blue-200/80 focus:outline-hidden focus:bg-white/25 focus:border-white transition-all shadow-inner"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery('')}
                  className="absolute inset-y-0 right-0 pr-3 flex items-center text-blue-200 hover:text-white text-xs font-bold"
                >
                  ✕
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Decorative background glow */}
        <div className="absolute right-0 top-0 w-72 h-72 bg-blue-500/10 rounded-full blur-3xl pointer-events-none" />
      </div>

      {/* SEARCH MODE: If user is actively searching, display search results */}
      {searchQuery.trim() ? (
        <div className="space-y-3">
          <div className="flex items-center justify-between text-xs text-slate-600 px-1">
            <span>
              <strong>&quot;{searchQuery}&quot;</strong> araması için <strong>{searchResults.length}</strong> sonuç bulundu:
            </span>
            <button
              onClick={() => setSearchQuery('')}
              className="text-blue-600 font-bold hover:underline"
            >
              Aramayı Kapat
            </button>
          </div>

          {searchResults.length === 0 ? (
            <div className="py-12 text-center text-slate-400 bg-white rounded-2xl border border-slate-200 p-8">
              <HelpCircle className="w-10 h-10 mx-auto text-slate-300 mb-2 stroke-1" />
              <p className="text-xs font-bold text-slate-600">Aradığınız kriterle eşleşen bir kılavuz başlığı bulunamadı.</p>
              <p className="text-[11px] text-slate-400 mt-1">Lütfen farklı bir arama terimi deneyin.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {searchResults.map((sec) => (
                <div
                  key={sec.id}
                  onClick={() => {
                    setActiveTab(sec.id);
                    setSearchQuery('');
                  }}
                  className="p-4 rounded-2xl bg-white border border-slate-200 shadow-xs hover:border-blue-400 hover:shadow-sm cursor-pointer transition-all flex items-center justify-between gap-3"
                >
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className={`px-2 py-0.5 rounded-md text-[9px] font-black uppercase tracking-wider border ${sec.badgeColor}`}>
                        {sec.badge}
                      </span>
                      <h4 className="text-sm font-extrabold text-slate-900">{sec.title}</h4>
                    </div>
                    <p className="text-xs text-slate-500">{sec.description}</p>
                  </div>
                  <ChevronRight className="w-5 h-5 text-blue-600 shrink-0" />
                </div>
              ))}
            </div>
          )}
        </div>
      ) : (
        /* NORMAL TABBED VIEW: Fully Responsive Tab Navigation + Single Focused Section */
        <div className="space-y-4">
          {/* Mobile Select Dropdown for Instant Jumping on Small Screens */}
          <div className="sm:hidden">
            <label className="text-[11px] font-bold text-slate-600 block mb-1">
              Kılavuz Bölümü Seçin:
            </label>
            <select
              value={activeTab}
              onChange={(e) => setActiveTab(e.target.value)}
              className="w-full px-3 py-2.5 bg-white border border-slate-300 rounded-xl text-xs font-bold text-slate-900 shadow-xs focus:outline-hidden focus:border-blue-500"
            >
              {categories.map((cat) => (
                <option key={cat.id} value={cat.id}>
                  {cat.fullTitle}
                </option>
              ))}
            </select>
          </div>

          {/* Horizontally Scrollable Modern Pill Tabs (Desktop & Tablet) */}
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1.5 no-print pt-0.5">
            {categories.map((cat) => {
              const Icon = cat.icon;
              const isActive = activeTab === cat.id;

              return (
                <button
                  key={cat.id}
                  type="button"
                  onClick={() => setActiveTab(cat.id)}
                  className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold whitespace-nowrap transition-all select-none ${
                    isActive
                      ? 'bg-blue-600 text-white shadow-xs scale-102 font-extrabold'
                      : 'bg-white text-slate-600 hover:text-slate-900 border border-slate-200 hover:border-slate-300'
                  }`}
                >
                  <span className={`w-4 h-4 rounded-full text-[10px] font-black flex items-center justify-center ${
                    isActive ? 'bg-white/20 text-white' : 'bg-slate-100 text-slate-600'
                  }`}>
                    {cat.order}
                  </span>
                  <Icon className="w-3.5 h-3.5" />
                  <span>{cat.label}</span>
                </button>
              );
            })}
          </div>

          {/* Active Tab Focused Content Card */}
          <div className="p-5 sm:p-6 rounded-2xl bg-white border border-slate-200 shadow-xs space-y-4 transition-all">
            {/* Header */}
            <div className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <span className={`px-2.5 py-1 rounded-lg text-[10px] font-black uppercase tracking-wider border ${currentSection.badgeColor}`}>
                  {currentSection.badge}
                </span>
                <h3 className="text-base sm:text-lg font-black text-slate-900 leading-tight">
                  {currentSection.title}
                </h3>
              </div>
            </div>

            {/* Sub-description */}
            <p className="text-xs text-slate-500 font-medium italic">
              {currentSection.description}
            </p>

            {/* Content Body */}
            <div className="pt-2">
              {currentSection.content}
            </div>

            {/* Bottom Chapter Navigation Bar (Previous / Next) */}
            <div className="pt-4 border-t border-slate-200/80 flex items-center justify-between gap-2">
              {prevCategory ? (
                <button
                  type="button"
                  onClick={() => setActiveTab(prevCategory.id)}
                  className="flex items-center gap-1.5 px-3 py-2 rounded-xl border border-slate-200 hover:bg-slate-50 text-slate-700 text-xs font-bold transition-all active:scale-95"
                >
                  <ChevronLeft className="w-4 h-4" />
                  <span className="hidden sm:inline">Önceki:</span>
                  <span>{prevCategory.label}</span>
                </button>
              ) : (
                <div />
              )}

              {nextCategory && (
                <button
                  type="button"
                  onClick={() => setActiveTab(nextCategory.id)}
                  className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-blue-50 border border-blue-200 hover:bg-blue-100 text-blue-900 text-xs font-bold transition-all active:scale-95 ml-auto"
                >
                  <span className="hidden sm:inline">Sonraki:</span>
                  <span>{nextCategory.label}</span>
                  <ChevronRight className="w-4 h-4" />
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Quick Field Checklist Footer */}
      <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200 space-y-2">
        <h4 className="text-xs font-bold text-slate-900 uppercase flex items-center gap-1.5">
          <CheckCircle2 className="w-4 h-4 text-emerald-600" />
          <span>Saha Personeli İçin Günlük Hızlı Dağıtım Kontrol Listesi</span>
        </h4>
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-2 text-[11px] text-slate-700">
          <div className="p-2 bg-white rounded-lg border border-slate-200 flex items-center gap-1.5">
            <span className="w-4 h-4 rounded-full bg-emerald-100 text-emerald-800 font-bold flex items-center justify-center text-[10px]">1</span>
            <span>Günün Rotasını Oluştur</span>
          </div>
          <div className="p-2 bg-white rounded-lg border border-slate-200 flex items-center gap-1.5">
            <span className="w-4 h-4 rounded-full bg-emerald-100 text-emerald-800 font-bold flex items-center justify-center text-[10px]">2</span>
            <span>Teslimat & Islak İmza Al</span>
          </div>
          <div className="p-2 bg-white rounded-lg border border-slate-200 flex items-center gap-1.5">
            <span className="w-4 h-4 rounded-full bg-emerald-100 text-emerald-800 font-bold flex items-center justify-center text-[10px]">3</span>
            <span>Eksik Haneleri Kontrol Et</span>
          </div>
          <div className="p-2 bg-white rounded-lg border border-slate-200 flex items-center gap-1.5">
            <span className="w-4 h-4 rounded-full bg-emerald-100 text-emerald-800 font-bold flex items-center justify-center text-[10px]">4</span>
            <span>Çalışma Saatini Kaydet</span>
          </div>
        </div>
      </div>
    </div>
  );
}
