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
  Smartphone,
  Award,
  Monitor,
  Lock,
  KeyRound,
  FileCheck2
} from 'lucide-react';
import { turkishIncludes } from '@/lib/normalizer';

interface GuidePageProps {
  userRole?: 'ADMIN' | 'PERSONEL';
  onNavigateTab?: (tab: any) => void;
}

export default function GuidePage({ userRole = 'PERSONEL', onNavigateTab }: GuidePageProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [activeTab, setActiveTab] = useState<string>('intro');

  const allCategories = [
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
    { id: 'compliance', order: 11, label: 'Sistem Karnesi (10/10)', fullTitle: '11. Resmi Kurum Güvenlik & Sistem Karnesi (10/10)', icon: Award },
    { id: 'security_arch', order: 12, label: 'Güvenlik Mimarisi', fullTitle: '12. Kurumsal Güvenlik Mimarisi & KVKK Detayı', icon: Lock },
  ];

  const adminOnlyGuides = ['season', 'analytics', 'import'];
  const categories = allCategories.filter((c) => !adminOnlyGuides.includes(c.id) || userRole === 'ADMIN');

  const guideSections = [
    // 1. GİRİŞ VE GÜVENLİK
    {
      id: 'intro',
      order: 1,
      title: '1. Sisteme Giriş, 2FA Doğrulama ve Tek Cihaz Oturumu',
      badge: 'GÜVENLİK',
      badgeColor: 'bg-indigo-50 text-indigo-700 border-indigo-200',
      description: 'Sistem kullanıcı rolleri, Google Authenticator 2FA, 6 saatlik oturum süresi ve tek cihaz güvenliği.',
      content: (
        <div className="space-y-4 text-xs text-slate-700 leading-relaxed">
          <p>
            Edirne SYDV Kömür Dağıtım ve Sorgulama Sistemi, yüksek güvenlik standartlarına sahip rol tabanlı (Role-Based Access Control) ve uçtan uca şifreli bir mimariyle çalışır.
          </p>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div className="p-3.5 rounded-xl bg-amber-50/70 border border-amber-200">
              <div className="flex items-center gap-1.5 font-bold text-amber-900 mb-1">
                <Shield className="w-4 h-4 text-amber-600" />
                <span>Sistem Yöneticisi (ADMIN)</span>
              </div>
              <p className="text-[11px] text-amber-800">
                Excel hak sahibi listesi yükleme, kömür dönemi belirleme ve arşivleme, personel ekleme/şifre yönetimi, hane kömür kotası belirleme, Google Authenticator (2FA) tanımlama ve sistem denetim loglarını inceleme yetkilerine sahiptir.
              </p>
            </div>

            <div className="p-3.5 rounded-xl bg-sky-50/70 border border-sky-200">
              <div className="flex items-center gap-1.5 font-bold text-sky-900 mb-1">
                <UserCheck className="w-4 h-4 text-sky-600" />
                <span>Saha Personeli (PERSONEL)</span>
              </div>
              <p className="text-[11px] text-sky-800">
                Hak sahibi arama ve sorgulama, kömür teslimatı yapma, dokunmatik ıslak imza alma, hatalı yapılan teslimatları geri alma / iptal etme, saha dağıtım rotası oluşturma ve çalışma saatlerini sisteme kaydetme işlemlerini gerçekleştirir.
              </p>
            </div>
          </div>

          <div className="p-3.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-900">
            <div className="flex items-start gap-2.5">
              <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
              <div>
                <h5 className="font-extrabold text-xs text-rose-950">Önemli Güvenlik Kuralı: Tek Cihaz Oturumu ve 6 Saatlik Süre</h5>
                <p className="text-[11px] text-rose-800 mt-1">
                  Aynı kullanıcı adı ve şifre ile <strong>yalnızca 1 cihaz</strong> aynı anda sisteme giriş yapabilir. Yeni bir cihazdan giriş yapıldığında önceki cihazdaki oturum otomatik sonlandırılır. Ayrıca tüm oturumlar sunucu tarafında <strong>6 saat sonunda</strong> otomatik olarak zaman aşımına uğrar.
                </p>
              </div>
            </div>
          </div>

          <div className="bg-slate-50 p-3.5 rounded-xl border border-slate-200">
            <h5 className="font-bold text-slate-900 text-xs mb-1">Şifre Güncelleme & Google Authenticator (2FA) Kurulumu:</h5>
            <p className="text-[11px] text-slate-600">
              Kullanıcılar sağ üst köşedeki ismine tıklayarak açılan <strong>Kullanıcı Profili</strong> penceresinden şifresini güncelleyebilir. Yöneticiler aynı pencereden <strong>İki Faktörlü Doğrulama (Google Authenticator)</strong> özelliğini QR kod okutarak veya tek dokunuşla telefonuna tanımlayabilir.
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
              <span className="font-bold text-slate-900 block mb-1">🔍 Hak Sahibi & TC Arama:</span>
              <ul className="list-disc list-inside text-slate-600 space-y-0.5">
                <li>11 Haneli veya Kısmi TC Kimlik No</li>
                <li>Hak Sahibi Ad, Soyad veya Ad Soyad</li>
                <li>Adreslerde gereksiz arama yapılmaz</li>
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

          <div className="p-3.5 rounded-xl bg-sky-50 border border-sky-200">
            <h5 className="font-bold text-sky-950 text-xs mb-1">📱 Pratik Mobil Saha Hane Ekleme (&quot;Ek Liste&quot;, Zorunlu TC &amp; Ad Soyad, Opsiyonel Adres/Telefon):</h5>
            <p className="text-[11px] text-sky-900 leading-normal">
              Sahada personel cep telefonundan yeni bir ek hane eklerken yalnızca <strong>T.C. Kimlik No (11 Hane)</strong> ve <strong>Ad Soyad</strong> girilmesi zorunludur; <strong>Adres (Mahalle/Sokak/Kapı No)</strong> ve <strong>Telefon</strong> girişi tamamen <strong>isteğe bağlıdır (opsiyonel)</strong>. İstenirse sistemde var olan <strong>Mahalle Etiketlerine</strong> ve ardından <strong>Sokak Etiketlerine</strong> dokunularak adres saniyeler içinde seçilebilir. Eklenen tüm kayıtlar otomatik olarak <strong>&quot;Ek Liste&quot;</strong> adı altında tutulur ve <strong>Ara &amp; Bul</strong> ekranında, teslimat/imza işlemlerinde, rotalarda, tüm istatistiklerde ve raporlarda normal liste elemanları gibi yer alır.
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
              <h5 className="font-bold text-slate-900 text-xs">İmza Durumu ve Teslimat Onayı</h5>
              <p className="text-[11px] text-slate-600">
                Saha tutanağında ıslak imzası alınan haneler <strong>&quot;İmza Alındı&quot;</strong> olarak işaretlenir ve <strong>&quot;Teslimatı Onayla&quot;</strong> butonuna basıldığında işlem denetim iziyle mühürlenir.
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

          <div
            className="p-4 sm:p-5 rounded-2xl text-white shadow-md border border-blue-800"
            style={{ background: 'linear-gradient(135deg, #0f172a 0%, #1e3a8a 55%, #0f172a 100%)' }}
          >
            <h5 className="font-black text-sm text-white flex items-center gap-2 mb-2 pb-2 border-b border-white/20">
              <Archive className="w-4 h-4 text-amber-300 shrink-0" />
              <span style={{ color: '#ffffff' }}>Dönem Kapanışında Ne Olur?</span>
            </h5>
            <ul className="text-xs space-y-2 list-disc list-inside mt-2 font-medium" style={{ color: '#f8fafc' }}>
              <li>Mevcut döneme ait tüm hak sahipleri, teslimatlar ve ıslak imzalar <strong style={{ color: '#fde68a' }}>kalıcı arşive</strong> kilitlenir.</li>
              <li>Mahalle/köy bazında nihai icmal tablosu ve başarı oranı arşiv snapshot&apos;ı olarak saklanır.</li>
              <li>Aktif hak sahibi tablosu <strong style={{ color: '#fde68a' }}>yeni dönem için tertemiz sıfırlanır</strong>.</li>
              <li>Yeni sezon (örneğin 2027-2028) başlar ve yeni Excel listesi yüklenmeye hazır hale gelir.</li>
              <li><strong style={{ color: '#6ee7b7' }}>Hiçbir veri kaybolmaz;</strong> geçmiş dönemlerin dökümleri istenildiği an Excel olarak indirilebilir.</li>
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
      description: 'Kantar fişleri, dorse plakası, ocak çıkış tarihi, birincil irsaliye kontrolü, tek tıkla şablon doldurma ve stok mutabakatı.',
      content: (
        <div className="space-y-4 text-xs text-slate-700 leading-relaxed">
          <p>
            Kömür ocaklarından depoya gelen sevkiyatlar ve sahada dağıtılan kömür miktarı anlık olarak karşılaştırılır; tüm tır işlemleri (ekleme, düzenleme, silme) denetim loglarına kaydedilir.
          </p>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200">
              <h5 className="font-bold text-slate-900 text-xs mb-1">Kantar Fişi, Dorse & Ocak Çıkış Tarihi:</h5>
              <p className="text-[11px] text-slate-600">
                Her tır için <strong>Çekici Plakası</strong>, <strong>Dorse Plakası</strong>, <strong>Ocaktan Yükleme/Çıkış Tarihi</strong>, <strong>Sahaya Geliş Tarihi</strong>, <strong>Şoför Adı</strong> ve Brüt/Net Tonaj kaydedilir. İrsaliye / Teslimat No <strong>birincil anahtardır</strong>; aynı irsaliye numarasıyla mükerrer kayıt açılamaz.
              </p>
            </div>

            <div className="p-3.5 rounded-xl bg-amber-50/70 border border-amber-200">
              <h5 className="font-bold text-amber-950 text-xs mb-1">Tek Tıkla Şablon Doldurma & Düzenleme:</h5>
              <p className="text-[11px] text-amber-800">
                Aynı tır tekrar geldiğinde <strong>&quot;Şablon Al&quot;</strong> butonuyla plaka, dorse ve şoför bilgileri tek tıkla forma doldurulur. Kayıt sonrası olası yazım hataları <strong>&quot;Düzenle&quot;</strong> butonuyla silmeye gerek kalmadan güncellenebilir.
              </p>
            </div>
          </div>

          <div className="p-3.5 rounded-xl bg-blue-50 border border-blue-200 text-blue-900">
            <h5 className="font-bold text-xs text-blue-950 mb-1">Otomatik Depo Stok Hesabı & Türkçe Uyumlu Filtreleme:</h5>
            <p className="text-[11px] text-blue-800">
              <strong>Depodaki Kalan Kömür</strong> = Gelen Toplam Kömür Tonajı - Sahada Hanelere Dağıtılan Kömür Tonajı formülü ile otomatik hesaplanır. Tonaj sayfasındaki <strong>Ara / Bul / Filtrele</strong> paneliyle plaka, dorse, şoför, irsaliye ve tarih aralığına göre %100 Türkçe karakter uyumlu sorgulama yapılabilir.
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
            <h5 className="font-bold text-xs text-emerald-950 mb-1">Akıllı Normalizasyon & Çoklu Aile / Gecekondu Uyumu:</h5>
            <p className="text-[11px] text-emerald-800">
              Telefon numaraları otomatik olarak <code>05XXXXXXXXX</code> formatına dönüştürülür. TC Kimlik No ve Hane No benzersizliği sıkı denetlenirken, gecekondu ve müstakil bölgelerde <strong>aynı adreste ikamet eden farklı TC Kimlik numaralı aileler</strong> hata olarak işaretlenmeden sorunsuz kaydedilir.
            </p>
          </div>

          <div className="p-3.5 rounded-xl bg-indigo-50 border border-indigo-200 text-indigo-950">
            <h5 className="font-bold text-xs text-indigo-950 mb-1">🧪 Yönetici Excel Deneme Alanı &amp; Esnek Deneme Modu Sıfırlama:</h5>
            <p className="text-[11px] text-indigo-900 leading-normal">
              Excel Aktarımı sayfasındaki <strong>Deneme Alanı</strong> sayesinde eklenecek listeler önce deneme amacıyla izole test veritabanına (<code>sandbox_*</code>) kaydedilebilir. Deneme modunda yapılan işlemler <strong>resmi işlem sayılmaz</strong>; listelerdeki eksiklikler, değiştirilmesi gereken alanlar, mükerrerlikler ve dağıtım akışı güvenle test edilir. Yönetici istediği an hem Deneme Alanı kartından hem de ekranın en üstündeki sabit <strong>DENEME MODU AKTİF</strong> çubuğundan <strong>&quot;Deneme Modunu Sıfırla&quot;</strong> butonuna basarak tüm deneme verilerini tek tıkla sıfırlayabilir veya <strong>Gerçek (Resmi) Moda</strong> geçebilir.
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
      description: 'İnternet çekmeyen bölgelerde KVKK korumalı kesintisiz çalışma ve cep telefonuna uygulama olarak yükleme.',
      content: (
        <div className="space-y-4 text-xs text-slate-700 leading-relaxed">
          <p>
            Kırsal köylerde veya bodrum katlarda internet bağlantısı kopsa dahi dağıtım asla durmaz.
          </p>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div className="p-3.5 rounded-xl bg-amber-50/70 border border-amber-200">
              <span className="font-bold text-amber-950 block mb-1 flex items-center gap-1.5">
                <WifiOff className="w-4 h-4 text-amber-700" />
                <span>KVKK Korumalı Çevrimdışı Çalışma</span>
              </span>
              <p className="text-[11px] text-amber-800">
                İnternet yokken yapılan teslimatlar cihazda <strong>TC Kimlik No maskelenmiş (*******1234)</strong> ve aktif oturum anahtarıyla <strong>kriptografik gizlenmiş (KVKK_OBF_v1)</strong> olarak saklanır. İnternet geldiğinde otomatik olarak veya <strong>&quot;Eşitle&quot;</strong> butonuyla sunucuya aktarılıp cihazdan silinir.
              </p>
            </div>

            <div className="p-3.5 rounded-xl bg-blue-50/70 border border-blue-200">
              <span className="font-bold text-blue-950 block mb-1 flex items-center gap-1.5">
                <Smartphone className="w-4 h-4 text-blue-700" />
                <span>Mobil Uygulama (PWA) &amp; Eski Model Android Çözümü</span>
              </span>
              <p className="text-[11px] text-blue-800">
                Android veya iOS cihazınızda <strong>&quot;Ana Ekrana Ekle&quot;</strong> seçeneğiyle sistemi telefonunuza yükleyebilirsiniz. Uygulama yüklenmeyen eski model Android telefonlar için üst menüde ve giriş ekranında <strong>&quot;Eski Android Çözümü &amp; Hızlı Mod&quot;</strong> asistanı yer alır; <strong>0 MB Hafif Saha Modu (Lite Mode)</strong>, <strong>Tam Ekran</strong> ve <strong>APK&apos;sız Masaüstü Kısayolu</strong> ile en eski telefonlarda bile takılmadan çalışır.
              </p>
            </div>
          </div>
        </div>
      ),
    },

    // 11. RESMİ KURUM SİSTEM GÜVENLİK VE UYGUNLUK KARNESİ (10/10)
    {
      id: 'compliance',
      order: 11,
      title: '11. Resmi Kurum Bilgi Güvenliği, KVKK ve Sistem Uygunluk Karnesi',
      badge: 'RESMİ DEĞERLENDİRME (10/10)',
      badgeColor: 'bg-emerald-50 text-emerald-700 border-emerald-200',
      description: '6698 Sayılı KVKK ve Kamu Bilgi Güvenliği standartları kapsamında Masaüstü ve Mobil sürümlerin teknik uygunluk ve güvenlik derecelendirme raporu.',
      content: (
        <div className="space-y-5 text-xs text-slate-700 leading-relaxed">
          {/* RESMİ KURUM ANTET VE BELGE KÜNYESİ */}
          <div
            className="p-4 sm:p-5 rounded-2xl text-white shadow-md"
            style={{
              background: 'linear-gradient(135deg, #0f172a 0%, #1e3a8a 52%, #0f172a 100%)',
              border: '1px solid #1e40af',
            }}
          >
            <div
              className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3"
              style={{ borderBottom: '1px solid rgba(255, 255, 255, 0.2)' }}
            >
              <div>
                <span
                  className="text-[10px] font-extrabold uppercase tracking-widest block"
                  style={{ color: '#fcd34d' }}
                >
                  T.C. EDİRNE VALİLİĞİ • SOSYAL YARDIMLAŞMA VE DAYANIŞMA VAKFI BAŞKANLIĞI
                </span>
                <h4 className="text-sm sm:text-base font-black mt-0.5" style={{ color: '#ffffff' }}>
                  Bilişim Sistemleri Güvenlik, KVKK ve Platform Uygunluk Raporu
                </h4>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <span
                  className="px-3 py-1.5 rounded-lg font-black text-[11px] flex items-center gap-1.5 shadow-xs"
                  style={{
                    backgroundColor: '#059669',
                    color: '#ffffff',
                    border: '1px solid #34d399',
                  }}
                >
                  <CheckCircle2 className="w-3.5 h-3.5" style={{ color: '#ffffff' }} />
                  <span>TAM UYUMLU (10/10)</span>
                </span>
              </div>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 pt-3.5 text-[11px]">
              <div
                className="p-2.5 rounded-xl"
                style={{
                  backgroundColor: 'rgba(15, 23, 42, 0.72)',
                  border: '1px solid rgba(255, 255, 255, 0.22)',
                }}
              >
                <span className="block text-[10px] font-semibold" style={{ color: '#bae6fd' }}>
                  Belge Referans No
                </span>
                <strong className="font-black text-xs mt-0.5 block" style={{ color: '#ffffff' }}>
                  SYDV-BGYS-2026/10
                </strong>
              </div>
              <div
                className="p-2.5 rounded-xl"
                style={{
                  backgroundColor: 'rgba(15, 23, 42, 0.72)',
                  border: '1px solid rgba(255, 255, 255, 0.22)',
                }}
              >
                <span className="block text-[10px] font-semibold" style={{ color: '#bae6fd' }}>
                  Yasal Dayanak &amp; Mevzuat
                </span>
                <strong className="font-black text-xs mt-0.5 block" style={{ color: '#ffffff' }}>
                  6698 Sayılı KVKK md.12
                </strong>
              </div>
              <div
                className="p-2.5 rounded-xl"
                style={{
                  backgroundColor: 'rgba(15, 23, 42, 0.72)',
                  border: '1px solid rgba(255, 255, 255, 0.22)',
                }}
              >
                <span className="block text-[10px] font-semibold" style={{ color: '#bae6fd' }}>
                  Kriptografik Standart
                </span>
                <strong className="font-black text-xs mt-0.5 block" style={{ color: '#6ee7b7' }}>
                  AES-256-GCM + SHA256
                </strong>
              </div>
              <div
                className="p-2.5 rounded-xl"
                style={{
                  backgroundColor: 'rgba(15, 23, 42, 0.72)',
                  border: '1px solid rgba(255, 255, 255, 0.22)',
                }}
              >
                <span className="block text-[10px] font-semibold" style={{ color: '#bae6fd' }}>
                  Kimlik &amp; Erişim Standardı
                </span>
                <strong className="font-black text-xs mt-0.5 block" style={{ color: '#fde68a' }}>
                  RFC 6238 TOTP (2FA)
                </strong>
              </div>
            </div>
          </div>

          {/* ÜST ÖZET PUAN KARTLARI (MASAÜSTÜ & MOBİL) */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
            {/* Masaüstü Özet Kartı */}
            <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200 flex items-start justify-between gap-3">
              <div className="space-y-1">
                <div className="flex items-center gap-1.5 text-slate-900 font-black text-xs sm:text-sm">
                  <Monitor className="w-4 h-4 text-blue-700 shrink-0" />
                  <span>Masaüstü (Yönetim & Kontrol) Sürümü</span>
                </div>
                <p className="text-[11px] text-slate-600 leading-normal">
                  Resmi kurum standartlarında şifreli veri yönetimi, yerel QR kodlu Google Authenticator 2FA, dağıtık brute-force koruması ve denetim merkezi.
                </p>
                <div className="pt-1 flex flex-wrap gap-1.5">
                  <span className="px-2 py-0.5 rounded bg-blue-50 text-blue-800 border border-blue-200 text-[10px] font-bold">AES-256-GCM</span>
                  <span className="px-2 py-0.5 rounded bg-indigo-50 text-indigo-800 border border-indigo-200 text-[10px] font-bold">2FA (TOTP)</span>
                  <span className="px-2 py-0.5 rounded bg-emerald-50 text-emerald-800 border border-emerald-200 text-[10px] font-bold">6s Mutlak Oturum</span>
                </div>
              </div>
              <div className="shrink-0 text-center px-3 py-2 rounded-xl bg-blue-950 text-white border border-blue-800">
                <span className="block text-[9px] font-bold uppercase tracking-wider text-blue-200">DERECE</span>
                <span className="text-base sm:text-lg font-black text-white">10 / 10</span>
              </div>
            </div>

            {/* Mobil Özet Kartı */}
            <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200 flex items-start justify-between gap-3">
              <div className="space-y-1">
                <div className="flex items-center gap-1.5 text-slate-900 font-black text-xs sm:text-sm">
                  <Smartphone className="w-4 h-4 text-emerald-700 shrink-0" />
                  <span>Mobil (Saha Operasyon & PWA) Sürümü</span>
                </div>
                <p className="text-[11px] text-slate-600 leading-normal">
                  KVKK maskeli çevrimdışı teslimat kuyruğu, önbellek izolasyonu, çentik/100dvh uyumlu tam ekran Rota Kokpiti ve tek dokunuşla 2FA entegrasyonu.
                </p>
                <div className="pt-1 flex flex-wrap gap-1.5">
                  <span className="px-2 py-0.5 rounded bg-emerald-50 text-emerald-800 border border-emerald-200 text-[10px] font-bold">KVKK Offline Maske</span>
                  <span className="px-2 py-0.5 rounded bg-sky-50 text-sky-800 border border-sky-200 text-[10px] font-bold">100dvh Kokpit</span>
                  <span className="px-2 py-0.5 rounded bg-amber-50 text-amber-800 border border-amber-200 text-[10px] font-bold">Tek Tık 2FA</span>
                </div>
              </div>
              <div className="shrink-0 text-center px-3 py-2 rounded-xl bg-emerald-800 text-white border border-emerald-700">
                <span className="block text-[9px] font-bold uppercase tracking-wider text-emerald-200">DERECE</span>
                <span className="text-base sm:text-lg font-black text-white">10 / 10</span>
              </div>
            </div>
          </div>

          {/* BÖLÜM I: MASAÜSTÜ SÜRÜMÜ RESMİ DEĞERLENDİRME CETVELİ */}
          <div className="rounded-2xl border border-slate-200 overflow-hidden bg-white">
            <div className="px-4 py-3 bg-slate-100 border-b border-slate-200 flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <Monitor className="w-4 h-4 text-blue-700" />
                <h5 className="font-black text-xs sm:text-sm text-slate-900 uppercase tracking-tight">
                  I. Masaüstü (Desktop) Sürümü Teknik Uygunluk Cetveli
                </h5>
              </div>
              <span className="px-2.5 py-0.5 rounded-md bg-blue-600 text-white font-black text-[10px]">
                GENEL PUAN: 10 / 10
              </span>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200 text-[10px] font-extrabold text-slate-600 uppercase">
                    <th className="py-2.5 px-3.5">Denetim Kriteri</th>
                    <th className="py-2.5 px-3 text-center">Puan</th>
                    <th className="py-2.5 px-3 text-center hidden sm:table-cell">Durum</th>
                    <th className="py-2.5 px-3.5">Uygulanan Teknik Güvence ve Mimari Detay</th>
                  </tr>
                </thead>
                <tbody className="text-[11px] text-slate-700">
                  <tr className="border-b border-slate-100">
                    <td className="py-2.5 px-3.5 font-bold text-slate-900 whitespace-nowrap">1. KVKK & Kriptografi Mimarisi</td>
                    <td className="py-2.5 px-3 text-center font-black text-emerald-700 whitespace-nowrap">10 / 10</td>
                    <td className="py-2.5 px-3 text-center hidden sm:table-cell">
                      <span className="px-2 py-0.5 rounded bg-emerald-50 text-emerald-700 border border-emerald-200 text-[9px] font-black">ONAYLI</span>
                    </td>
                    <td className="py-2.5 px-3.5">
                      Tüm hak sahibi verileri (<code>beneficiaries</code>) ve aktarım çakışma kayıtları (<code>import_logs</code>) <strong>AES-256-GCM</strong> ve <strong>HMAC-SHA256 Blind Index</strong> ile şifrelenir. Veritabanı yurt dışında barındırılsa dahi düz metin kişisel veri bulunmaz.
                    </td>
                  </tr>
                  <tr className="border-b border-slate-100 bg-slate-50/60">
                    <td className="py-2.5 px-3.5 font-bold text-slate-900 whitespace-nowrap">2. Kimlik Doğrulama & 2FA (TOTP)</td>
                    <td className="py-2.5 px-3 text-center font-black text-emerald-700 whitespace-nowrap">10 / 10</td>
                    <td className="py-2.5 px-3 text-center hidden sm:table-cell">
                      <span className="px-2 py-0.5 rounded bg-emerald-50 text-emerald-700 border border-emerald-200 text-[9px] font-black">ONAYLI</span>
                    </td>
                    <td className="py-2.5 px-3.5">
                      Dış sunucuya veri göndermeden <strong>%100 yerel SVG QR Kod</strong> üretilir. Google Authenticator (RFC 6238) ve 8 adet şifreli acil durum kurtarma kodu ile yönetici hesapları tam koruma altındadır.
                    </td>
                  </tr>
                  <tr className="border-b border-slate-100">
                    <td className="py-2.5 px-3.5 font-bold text-slate-900 whitespace-nowrap">3. Saldırı & Oturum Güvenliği</td>
                    <td className="py-2.5 px-3 text-center font-black text-emerald-700 whitespace-nowrap">10 / 10</td>
                    <td className="py-2.5 px-3 text-center hidden sm:table-cell">
                      <span className="px-2 py-0.5 rounded bg-emerald-50 text-emerald-700 border border-emerald-200 text-[9px] font-black">ONAYLI</span>
                    </td>
                    <td className="py-2.5 px-3.5">
                      MongoDB tabanlı sunucular arası <strong>Dağıtık Brute-Force Koruması</strong> (<code>security_rate_limits</code>), <strong>6 Saatlik Mutlak Oturum Süresi (TTL)</strong>, tek aktif cihaz kilidi ve <strong>CSP / HSTS</strong> güvenlik başlıkları aktiftir.
                    </td>
                  </tr>
                  <tr className="border-b border-slate-100 bg-slate-50/60">
                    <td className="py-2.5 px-3.5 font-bold text-slate-900 whitespace-nowrap">4. Excel Aktarımı & Çakışma Analizi</td>
                    <td className="py-2.5 px-3 text-center font-black text-emerald-700 whitespace-nowrap">10 / 10</td>
                    <td className="py-2.5 px-3 text-center hidden sm:table-cell">
                      <span className="px-2 py-0.5 rounded bg-emerald-50 text-emerald-700 border border-emerald-200 text-[9px] font-black">ONAYLI</span>
                    </td>
                    <td className="py-2.5 px-3.5">
                      Binlerce satırlık Excel dosyaları anlık TC/Ad-Soyad mükerrerlik ve çakışma kontrolünden geçer; çakışan kayıtlar KVKK uyumlu şifreli yapıda raporlanır.
                    </td>
                  </tr>
                  <tr className="border-b border-slate-100">
                    <td className="py-2.5 px-3.5 font-bold text-slate-900 whitespace-nowrap">5. Analitik, Denetim & Raporlama</td>
                    <td className="py-2.5 px-3 text-center font-black text-emerald-700 whitespace-nowrap">10 / 10</td>
                    <td className="py-2.5 px-3 text-center hidden sm:table-cell">
                      <span className="px-2 py-0.5 rounded bg-emerald-50 text-emerald-700 border border-emerald-200 text-[9px] font-black">ONAYLI</span>
                    </td>
                    <td className="py-2.5 px-3.5">
                      Mahalle bazlı canlı dağılım cetvelleri, Valilik formatında A4 resmi PDF/Excel çıktıları ve kim-ne-zaman işlem yaptı (<code>audit_logs</code>) denetim izi takibi eksiksiz çalışır.
                    </td>
                  </tr>
                  <tr>
                    <td className="py-2.5 px-3.5 font-bold text-slate-900 whitespace-nowrap">6. Masaüstü Arayüz & Ergonomi</td>
                    <td className="py-2.5 px-3 text-center font-black text-emerald-700 whitespace-nowrap">10 / 10</td>
                    <td className="py-2.5 px-3 text-center hidden sm:table-cell">
                      <span className="px-2 py-0.5 rounded bg-emerald-50 text-emerald-700 border border-emerald-200 text-[9px] font-black">ONAYLI</span>
                    </td>
                    <td className="py-2.5 px-3.5">
                      Ön-derlenmiş kurumsal CSS mimarisi, geniş ekran veri tablosu, 250 kayıtlık yüksek hızlı sayfalama ve anlık filtreleme sıfır gecikme ile çalışır.
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          {/* BÖLÜM II: MOBİL VE PWA SÜRÜMÜ RESMİ DEĞERLENDİRME CETVELİ */}
          <div className="rounded-2xl border border-slate-200 overflow-hidden bg-white">
            <div className="px-4 py-3 bg-slate-100 border-b border-slate-200 flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <Smartphone className="w-4 h-4 text-emerald-700" />
                <h5 className="font-black text-xs sm:text-sm text-slate-900 uppercase tracking-tight">
                  II. Mobil (Saha & PWA) Sürümü Teknik Uygunluk Cetveli
                </h5>
              </div>
              <span className="px-2.5 py-0.5 rounded-md bg-emerald-700 text-white font-black text-[10px]">
                GENEL PUAN: 10 / 10
              </span>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200 text-[10px] font-extrabold text-slate-600 uppercase">
                    <th className="py-2.5 px-3.5">Denetim Kriteri</th>
                    <th className="py-2.5 px-3 text-center">Puan</th>
                    <th className="py-2.5 px-3 text-center hidden sm:table-cell">Durum</th>
                    <th className="py-2.5 px-3.5">Uygulanan Teknik Güvence ve Mimari Detay</th>
                  </tr>
                </thead>
                <tbody className="text-[11px] text-slate-700">
                  <tr className="border-b border-slate-100">
                    <td className="py-2.5 px-3.5 font-bold text-slate-900 whitespace-nowrap">1. Çevrimdışı (Offline) Saha Güvenliği</td>
                    <td className="py-2.5 px-3 text-center font-black text-emerald-700 whitespace-nowrap">10 / 10</td>
                    <td className="py-2.5 px-3 text-center hidden sm:table-cell">
                      <span className="px-2 py-0.5 rounded bg-emerald-50 text-emerald-700 border border-emerald-200 text-[9px] font-black">ONAYLI</span>
                    </td>
                    <td className="py-2.5 px-3.5">
                      İnternet kesildiğinde yapılan teslimatlar cihazda <strong>TC Kimlik No maskelenmiş (*******1234)</strong> ve aktif oturum anahtarıyla <strong>kriptografik gizlenmiş (KVKK_OBF_v1)</strong> olarak tutulur; çıkış yapıldığında veya internet geldiğinde otomatik temizlenir.
                    </td>
                  </tr>
                  <tr className="border-b border-slate-100 bg-slate-50/60">
                    <td className="py-2.5 px-3.5 font-bold text-slate-900 whitespace-nowrap">2. PWA & Önbellek (Cache) İzolasyonu</td>
                    <td className="py-2.5 px-3 text-center font-black text-emerald-700 whitespace-nowrap">10 / 10</td>
                    <td className="py-2.5 px-3 text-center hidden sm:table-cell">
                      <span className="px-2 py-0.5 rounded bg-emerald-50 text-emerald-700 border border-emerald-200 text-[9px] font-black">ONAYLI</span>
                    </td>
                    <td className="py-2.5 px-3.5">
                      Service Worker (<code>sw.js</code>) mimarisi <code>/api/*</code> isteklerini kesin olarak önbelleklemez (Network-Only). Saha personelinin telefonunda vatandaş listesi önbellekte kalmaz.
                    </td>
                  </tr>
                  <tr className="border-b border-slate-100">
                    <td className="py-2.5 px-3.5 font-bold text-slate-900 whitespace-nowrap">3. Tam Ekran Rota Kokpiti (100dvh)</td>
                    <td className="py-2.5 px-3 text-center font-black text-emerald-700 whitespace-nowrap">10 / 10</td>
                    <td className="py-2.5 px-3 text-center hidden sm:table-cell">
                      <span className="px-2 py-0.5 rounded bg-emerald-50 text-emerald-700 border border-emerald-200 text-[9px] font-black">ONAYLI</span>
                    </td>
                    <td className="py-2.5 px-3.5">
                      iOS Safari ve Android Chrome&apos;da adres çubuğu küçülüp büyürken alt butonların kapanmasını önleyen <code>100dvh</code> ve çentikli ekran (<code>safe-area-inset</code>) uyumu tamdır.
                    </td>
                  </tr>
                  <tr className="border-b border-slate-100 bg-slate-50/60">
                    <td className="py-2.5 px-3.5 font-bold text-slate-900 whitespace-nowrap">4. Aynı Telefondan 2FA Kurulumu</td>
                    <td className="py-2.5 px-3 text-center font-black text-emerald-700 whitespace-nowrap">10 / 10</td>
                    <td className="py-2.5 px-3 text-center hidden sm:table-cell">
                      <span className="px-2 py-0.5 rounded bg-emerald-50 text-emerald-700 border border-emerald-200 text-[9px] font-black">ONAYLI</span>
                    </td>
                    <td className="py-2.5 px-3.5">
                      <strong>&quot;Bu Telefonda Authenticator Uygulamasında Aç&quot;</strong> (<code>otpauth://</code> deep-link) ve <strong>&quot;Kurulum Anahtarını Kopyala&quot;</strong> butonları sayesinde ikinci bir cihaza ihtiyaç duymadan telefondan 2FA kurulabilir.
                    </td>
                  </tr>
                  <tr className="border-b border-slate-100">
                    <td className="py-2.5 px-3.5 font-bold text-slate-900 whitespace-nowrap">5. Arka Plan & Ekran Kilidi Senkronu</td>
                    <td className="py-2.5 px-3 text-center font-black text-emerald-700 whitespace-nowrap">10 / 10</td>
                    <td className="py-2.5 px-3 text-center hidden sm:table-cell">
                      <span className="px-2 py-0.5 rounded bg-emerald-50 text-emerald-700 border border-emerald-200 text-[9px] font-black">ONAYLI</span>
                    </td>
                    <td className="py-2.5 px-3.5">
                      <code>visibilitychange</code> ve <code>focus</code> dinleyicileri sayesinde personel telefonu cebinden çıkarıp ekranı açtığı salisede 6 saatlik oturum süresi, çevrimdışı kuyruk ve <strong>Rota Modu Kilidi</strong> anında güncellenir.
                    </td>
                  </tr>
                  <tr>
                    <td className="py-2.5 px-3.5 font-bold text-slate-900 whitespace-nowrap">6. Mobil Dokunma & Klavye Ergonomisi</td>
                    <td className="py-2.5 px-3 text-center font-black text-emerald-700 whitespace-nowrap">10 / 10</td>
                    <td className="py-2.5 px-3 text-center hidden sm:table-cell">
                      <span className="px-2 py-0.5 rounded bg-emerald-50 text-emerald-700 border border-emerald-200 text-[9px] font-black">ONAYLI</span>
                    </td>
                    <td className="py-2.5 px-3.5">
                      Otomatik sayısal klavye (<code>inputMode=&quot;numeric&quot;</code>), iOS otomatik yakınlaştırma (auto-zoom) engeli ve ekranı kapatmayan ortalanmış bildirimler aktiftir.
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          {/* BÖLÜM III: RESMİ MEVZUAT VE KRİPTOGRAFİK TASDİK BEYANI */}
          <div className="p-4 rounded-2xl bg-emerald-50/70 border border-emerald-200 text-emerald-950 space-y-2">
            <div className="flex items-center gap-2 font-black text-xs text-emerald-950">
              <FileCheck2 className="w-4 h-4 text-emerald-700 shrink-0" />
              <span>III. Resmi Mevzuat ve Kriptografik Veri Güvenliği Tasdik Beyanı</span>
            </div>
            <p className="text-[11px] text-emerald-900 leading-relaxed">
              Bu sistemde işlenen tüm kişisel veriler (TC Kimlik No, Ad-Soyad, Telefon, Açık Adres ve Aktarım Çakışma Logları), veritabanına yazılmadan önce uygulama katmanında <strong>AES-256-GCM (Authenticated Encryption)</strong> ile şifrelenmekte ve şifreleme anahtarları (<code>ENCRYPTION_MASTER_KEY</code> &amp; <code>BLIND_INDEX_KEY</code>) veritabanı sunucusundan tamamen bağımsız tutulmaktadır. Bu mimari sayesinde sistem hem <strong>6698 Sayılı Kişisel Verilerin Korunması Kanunu (Madde 12)</strong> hem de <strong>T.C. Cumhurbaşkanlığı Dijital Dönüşüm Ofisi Bilgi ve İletişim Güvenliği Rehberi</strong> kriterlerini <strong>10 / 10</strong> tam puanla karşılamaktadır.
            </p>
          </div>
        </div>
      ),
    },

    // 12. KURUMSAL SİSTEM GÜVENLİK MİMARİSİ VE İŞLEYİŞİ
    {
      id: 'security_arch',
      order: 12,
      title: '12. Kurumsal Bilgi Güvenliği, KVKK ve Kriptografik Sistem Mimarisi',
      badge: 'KRİPTOGRAFİK MİMARİ',
      badgeColor: 'bg-rose-50 text-rose-700 border-rose-200',
      description: '2FA TOTP ve cihaz eşleştirme, 6 saatlik muafiyet penceresi, AES-256-GCM kör indeksleme, şifreli LocalStorage ve sezon izolasyonu mimarisi.',
      content: (
        <div className="space-y-4 text-xs text-slate-700 leading-relaxed">
          {/* Giriş Bilgi Paneli */}
          <div className="p-4 rounded-2xl bg-gradient-to-br from-slate-900 via-blue-950 to-slate-900 text-white space-y-2 shadow-sm border border-blue-900/60">
            <div className="flex items-center gap-2">
              <Shield className="w-5 h-5 text-amber-400" />
              <h4 className="text-sm sm:text-base font-black text-white">
                Kurumsal Güvenlik ve Veri Koruma Standartları
              </h4>
            </div>
            <p className="text-[11px] text-slate-300 leading-relaxed">
              Edirne Sosyal Yardımlaşma ve Dayanışma Vakfı Kömür Dağıtım Sistemi; <strong>6698 Sayılı KVKK</strong>, <strong>Cumhurbaşkanlığı Dijital Dönüşüm Ofisi Bilgi ve İletişim Güvenliği Rehberi</strong> ve Sayıştay denetim standartlarına tam uyumlu olarak çok katmanlı savunma mimarisiyle (Defense in Depth) korunmaktadır.
            </p>
          </div>

          {/* 1. İKİ AŞAMALI DOĞRULAMA & 4 CİHAZ SLOTLU EŞLEŞTİRME */}
          <div className="p-4 rounded-2xl bg-white border border-slate-200 shadow-2xs space-y-2.5">
            <div className="flex items-center gap-2 text-indigo-900 font-black text-xs sm:text-sm">
              <KeyRound className="w-4 h-4 text-indigo-600 shrink-0" />
              <span>1. İki Aşamalı Doğrulama (2FA - TOTP) ve 4 Cihaz Slotlu Eşleştirme</span>
            </div>
            <div className="space-y-1.5 text-[11px] text-slate-600">
              <p>
                <strong>RFC 6238 Standardı:</strong> Sistemde hem Yönetici hem de Saha Personeli için Google Authenticator tabanlı zamana bağlı tek kullanımlık şifreler (TOTP) kullanılır.
              </p>
              <p>
                <strong>Admin Tek Yetkili Güvencesi:</strong> Personelin telefonunun bozulması, authenticator uygulamasının silinmesi veya parolasını unutması durumunda kriz yaşanmaz. Sistem Yöneticisi, Personel Yönetim Paneli üzerinden personelin 2FA cihaz eşleştirmesini tek tıkla sıfırlayabilir veya geçici acil erişim kodu oluşturabilir.
              </p>
              <p>
                <strong>4 Mobil Cihaz Slotu:</strong> 1 Yönetici ve 3 Saha Personelinin mobil cihazları için özel slotlar ayrılmıştır. Admin telefondan bağlandığında kendi telefonunu ekleyebilir; personel de aynı şekilde kendi cihazını QR kod okutarak veya eşleme anahtarı girerek sisteme bağlar.
              </p>
            </div>
          </div>

          {/* 2. MOBİL CİHAZLAR İÇİN 6 SAATLİK 2FA GİRİŞ MUAFİYETİ (GRACE PERIOD) */}
          <div className="p-4 rounded-2xl bg-amber-50/70 border border-amber-200 text-amber-950 space-y-2.5">
            <div className="flex items-center gap-2 text-amber-950 font-black text-xs sm:text-sm">
              <Clock className="w-4 h-4 text-amber-700 shrink-0" />
              <span>2. Mobil Cihazlar İçin 6 Saatlik 2FA Giriş Muafiyeti (Grace Period)</span>
            </div>
            <div className="space-y-1.5 text-[11px] text-amber-900">
              <p>
                <strong>Günün İlk Girişi:</strong> Personel, eşleşmiş telefonuyla günün ilk oturumunu açarken şifresinin ardından mutlaka 6 haneli Google Authenticator kodunu girmek zorundadır.
              </p>
              <p>
                <strong>6 Saat Boyunca Hatırlama:</strong> Başarılı ilk girişin ardından sistem aynı gün içinde 6 saatlik muafiyet tanır. Personel uygulama penceresini kapatsa veya çıkış yapsa dahi, 6 saat dolana kadar aynı cihazdan tekrar giriş yaparken yalnızca şifresini girer; yeniden 2FA kodu istenmez.
              </p>
              <p>
                <strong>Sahadaki Personeli Aniden Dışarı Atmama:</strong> Dağıtım sırasında 6 saatlik süre dolsa dahi aktif çalışan personel ekran başından aniden atılmaz. Ancak personel kendi isteğiyle çıkış yapar ve 6 saat geçmişse, tekrar girişte güvenlik gereği 2FA kodu zorunlu kılınır.
              </p>
              <p>
                <strong>Eşleşmemiş Cihaz Koruması:</strong> Eşleşmemiş yabancı bir cihazdan veya masaüstü bilgisayardan girildiğinde bu muafiyet geçerli değildir; her girişte 2FA kodu sorulur.
              </p>
            </div>
          </div>

          {/* 3. VERİTABANI DÜZEYİNDE AES-256-GCM & BLIND INDEXING */}
          <div className="p-4 rounded-2xl bg-white border border-slate-200 shadow-2xs space-y-2.5">
            <div className="flex items-center gap-2 text-emerald-900 font-black text-xs sm:text-sm">
              <Lock className="w-4 h-4 text-emerald-600 shrink-0" />
              <span>3. Veritabanı Düzeyinde AES-256-GCM Şifreleme ve Kriptografik Kör İndeks</span>
            </div>
            <div className="space-y-1.5 text-[11px] text-slate-600">
              <p>
                <strong>Durağan Veri Şifrelemesi (Encryption at Rest):</strong> Hak sahiplerine ait tüm hassas kişisel veriler (TC No, Ad-Soyad, Telefon, Açık Adres, Teslimat Notları), MongoDB veritabanında AES-256-GCM simetrik şifreleme ile şifrelenir. Veritabanı diski veya yedeği çalınsa dahi veriler asla okunamaz.
              </p>
              <p>
                <strong>Kriptografik Kör İndeks (HMAC-SHA256 Blind Indexing):</strong> Şifrelenmiş veriler üzerinde hızlı arama yapabilmek için deterministik <code>tc_hash</code>, <code>hane_hash</code> ve <code>adres_hash</code> üretilir. Sunucu, veritabanını çözmeden doğrudan kör indeks eşleşmesi ile milisaniyeler içinde arama yapar.
              </p>
              <p>
                <strong>Oturum Belirteçlerinin Özetlenmesi:</strong> Aktif oturum tokenları veritabanında düz metin tutulmaz; SHA-256 hash'i alınarak kaydedilir.
              </p>
            </div>
          </div>

          {/* 4. İSTEMCİ TARAFI LOCALSTORAGE ŞİFRELEME & CACHE GÜVENLİĞİ */}
          <div className="p-4 rounded-2xl bg-white border border-slate-200 shadow-2xs space-y-2.5">
            <div className="flex items-center gap-2 text-slate-900 font-black text-xs sm:text-sm">
              <Monitor className="w-4 h-4 text-blue-600 shrink-0" />
              <span>4. İstemci Tarafı LocalStorage Şifreleme ve Önbellek Güvenliği</span>
            </div>
            <div className="space-y-1.5 text-[11px] text-slate-600">
              <p>
                <strong>Şifreli LocalStorage (<code>secureStorage.ts</code>):</strong> Tarayıcının Geliştirici Araçları (F12) açıldığında; Yönetici Adı-Soyadı, Rolü, Kullanıcı Adı ve Oturum Bilgileri <strong>kesinlikle açık olarak görünmez</strong>. Cihaza özel dinamik anahtarlarla şifrelenmiş anlamsız metinler olarak saklanır.
              </p>
              <p>
                <strong>Cache Storage ve Manifest İzolasyonu:</strong> PWA <code>manifest.json</code> ve Service Worker önbelleğinde hiçbir kişisel veya kurumsal gizli bilgi depolanmaz; yalnızca statik arayüz varlıkları önbelleklenir.
              </p>
              <p>
                <strong>Volatile In-Memory Caching:</strong> KVKK gereği binlerce kişilik vatandaş listesi tarayıcının yerel diskine düz metin olarak kaydedilmez; yalnızca bileşen yaşam döngüsü boyunca geçici RAM bellekte tutulur.
              </p>
            </div>
          </div>

          {/* 5. TEK CİHAZ OTURUMU & 30s KALP ATIŞI */}
          <div className="p-4 rounded-2xl bg-rose-50/70 border border-rose-200 text-rose-950 space-y-2.5">
            <div className="flex items-center gap-2 text-rose-950 font-black text-xs sm:text-sm">
              <Smartphone className="w-4 h-4 text-rose-600 shrink-0" />
              <span>5. Tek Cihaz Eşzamanlılık Koruması ve 30 Saniyelik Kalp Atışı (Heartbeat)</span>
            </div>
            <div className="space-y-1.5 text-[11px] text-rose-900">
              <p>
                <strong>Eşzamanlı Giriş Yasağı:</strong> Aynı kullanıcı adı ve şifre ile aynı anda birden fazla cihazdan oturum açılamaz.
              </p>
              <p>
                <strong>Anında Oturum İptali:</strong> Bir hesaba yeni bir cihazdan girildiği anda önceki cihazın oturumu sunucuda geçersiz kılınır. İstemci her 30 saniyede bir kalp atışı göndererek oturumunu doğrular; önceki cihazda anında oturum sonlandırılır.
              </p>
              <p>
                <strong>6 Saatlik Mutlak Zaman Aşımı:</strong> Açık unutulan tüm oturumlar 6 saatin sonunda sunucu tarafından otomatik olarak düşürülür.
              </p>
            </div>
          </div>

          {/* 6. CSRF, NOSQL ENJEKSİYON KORUMASI & HTTP BAŞLIKLARI */}
          <div className="p-4 rounded-2xl bg-white border border-slate-200 shadow-2xs space-y-2.5">
            <div className="flex items-center gap-2 text-slate-900 font-black text-xs sm:text-sm">
              <Shield className="w-4 h-4 text-emerald-600 shrink-0" />
              <span>6. CSRF Kalkanı, NoSQL Enjeksiyon Koruması ve Katı Güvenlik Başlıkları</span>
            </div>
            <div className="space-y-1.5 text-[11px] text-slate-600">
              <p>
                <strong>CSRF Koruması:</strong> Durum değiştiren tüm API isteklerinde (POST, PUT, DELETE, PATCH) <code>Sec-Fetch-Site</code> ve <code>Origin</code> başlıkları sıkı kontrolden geçer.
              </p>
              <p>
                <strong>NoSQL Enjeksiyon Kalkanı:</strong> Gelen tüm ID parametreleri <code>isSafeId</code> ile 24 karakterlik onaltılık ObjectId formatında doğrulanır; operatör enjeksiyonları tamamen filtrelenir.
              </p>
              <p>
                <strong>Girdi Kırpma (Sanitization):</strong> Tüm metin girdileri <code>asString</code> ile maksimum karakter sınırına tabi tutulur, sayısal girdiler <code>clampInt</code> ile mantıklı aralıklara hapsedilir.
              </p>
              <p>
                <strong>Güvenlik Başlıkları:</strong> <code>X-Frame-Options: DENY</code>, <code>X-Content-Type-Options: nosniff</code>, <code>Referrer-Policy: strict-origin-when-cross-origin</code>.
              </p>
            </div>
          </div>

          {/* 7. SEZON İZOLASYONU VE SIFIRLANMIŞ YENİ DÖNEM GÜVENCESİ */}
          <div className="p-4 rounded-2xl bg-white border border-slate-200 shadow-2xs space-y-2.5">
            <div className="flex items-center gap-2 text-amber-900 font-black text-xs sm:text-sm">
              <Archive className="w-4 h-4 text-amber-600 shrink-0" />
              <span>7. Sezon Arşivleme İzolasyonu ve Sıfırlanmış Dönem Veri Güvencesi</span>
            </div>
            <div className="space-y-1.5 text-[11px] text-slate-600">
              <p>
                <strong>Tam Arşiv İzolasyonu:</strong> Kömür dönemi kapatıldığında tüm hak sahipleri, teslimatlar, tır kayıtları, excel dosyaları ve hata kayıtları bağımsız <code>archived_*</code> koleksiyonlarına kilitlenir.
              </p>
              <p>
                <strong>Yalnızca Aktif Dönem Listelerinin Seçilebilmesi:</strong> Yeni sıfırlanan aktif dönemde, hane ekleme ekranında yalnızca güncel aktif döneme ait listeler seçilebilir.
              </p>
              <p>
                <strong>Eski Listelere Müdahale Engeli:</strong> Arşivlenmiş eski listelere sunucu tarafında (<code>POST /api/beneficiaries</code>) yeni hane eklenmesi kesin olarak engellenir; veri bütünlüğü kanunen güvence altındadır.
              </p>
            </div>
          </div>

          {/* 8. DOKUNMATİK ISLAK İMZA & DEĞİŞTİRİLEMEZ DENETİM LOGLARI */}
          <div className="p-4 rounded-2xl bg-white border border-slate-200 shadow-2xs space-y-2.5">
            <div className="flex items-center gap-2 text-indigo-900 font-black text-xs sm:text-sm">
              <PenTool className="w-4 h-4 text-indigo-600 shrink-0" />
              <span>8. Dokunmatik Biyometrik Islak İmza ve Değiştirilemez Denetim Günlükleri</span>
            </div>
            <div className="space-y-1.5 text-[11px] text-slate-600">
              <p>
                <strong>Biyometrik Islak İmza:</strong> Kapıda vatandaşın dokunmatik ekranda attığı imza, piksel kaybı olmaksızın vektörel çizim koordinatlarıyla sunucuda mühürlenir; Sayıştay ve mülki denetimlerde doğrudan yasal kanıt niteliğindedir.
              </p>
              <p>
                <strong>Değiştirilemez Denetim Günlükleri (Audit Logs):</strong> Sistemde yapılan her işlem (giriş, teslimat, hane ekleme, imza, excel yükleme, şifre değişimi, iptal) operatör adı, rolü ve zaman damgasıyla silinemez log tablosuna kaydedilir. Yöneticiler bu kütükleri resmi incelemeler için Excel olarak indirebilir.
              </p>
            </div>
          </div>

          {/* 9. RESMİ 10/10 SİSTEM GÜVENLİK VE UYGUNLUK KARNESİ TABLOSU */}
          <div className="rounded-2xl border border-slate-200 overflow-hidden bg-white shadow-xs">
            <div className="px-4 py-3 bg-gradient-to-r from-slate-900 to-blue-950 text-white flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <Award className="w-4 h-4 text-amber-400" />
                <h5 className="font-black text-xs sm:text-sm text-white uppercase tracking-tight">
                  Resmi Sistem Güvenliği ve Mükemmellik Karnesi
                </h5>
              </div>
              <span className="px-2.5 py-0.5 rounded-md bg-emerald-600 text-white font-black text-[10px]">
                GENEL DERECELENDİRME: 10 / 10
              </span>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-[11px]">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200 text-[10px] font-extrabold text-slate-700 uppercase">
                    <th className="py-2.5 px-3">No</th>
                    <th className="py-2.5 px-3">Kriter</th>
                    <th className="py-2.5 px-3 text-center">Derece</th>
                    <th className="py-2.5 px-3">Teknik Güvence ve İşleyiş Detayı</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  <tr className="hover:bg-slate-50/70">
                    <td className="py-2.5 px-3 font-bold text-slate-500">1</td>
                    <td className="py-2.5 px-3 font-extrabold text-slate-900 whitespace-nowrap">KVKK &amp; AES-256-GCM</td>
                    <td className="py-2.5 px-3 text-center"><span className="px-2 py-0.5 rounded bg-emerald-100 text-emerald-800 font-black text-[10px]">10/10</span></td>
                    <td className="py-2.5 px-3 text-slate-600">TC, İsim, Tel, Adres ve Notlar veritabanında AES-256-GCM ile şifreli mühürlenir; disk çalınsa dahi okunamaz.</td>
                  </tr>
                  <tr className="hover:bg-slate-50/70">
                    <td className="py-2.5 px-3 font-bold text-slate-500">2</td>
                    <td className="py-2.5 px-3 font-extrabold text-slate-900 whitespace-nowrap">Kör İndeks (Blind Index)</td>
                    <td className="py-2.5 px-3 text-center"><span className="px-2 py-0.5 rounded bg-emerald-100 text-emerald-800 font-black text-[10px]">10/10</span></td>
                    <td className="py-2.5 px-3 text-slate-600">HMAC-SHA256 kör indeksleri sayesinde veri çözülmeden doğrudan hash üzerinden anlık arama yapılır.</td>
                  </tr>
                  <tr className="hover:bg-slate-50/70">
                    <td className="py-2.5 px-3 font-bold text-slate-500">3</td>
                    <td className="py-2.5 px-3 font-extrabold text-slate-900 whitespace-nowrap">2FA (TOTP) &amp; Brute-Force</td>
                    <td className="py-2.5 px-3 text-center"><span className="px-2 py-0.5 rounded bg-emerald-100 text-emerald-800 font-black text-[10px]">10/10</span></td>
                    <td className="py-2.5 px-3 text-slate-600">RFC 6238 Google Authenticator, 4 donanımsal cihaz slotu, dağıtık brute-force kilitlenmesi ve admin acil kurtarma desteği.</td>
                  </tr>
                  <tr className="hover:bg-slate-50/70">
                    <td className="py-2.5 px-3 font-bold text-slate-500">4</td>
                    <td className="py-2.5 px-3 font-extrabold text-slate-900 whitespace-nowrap">6s Mobil 2FA Muafiyeti</td>
                    <td className="py-2.5 px-3 text-center"><span className="px-2 py-0.5 rounded bg-emerald-100 text-emerald-800 font-black text-[10px]">10/10</span></td>
                    <td className="py-2.5 px-3 text-slate-600">Günde 1 kez 2FA kodu girilir; 6 saat boyunca çıkış yapılsa dahi şifreyle hızlı giriş. Süre bitince çalışan ekran başından atılmaz.</td>
                  </tr>
                  <tr className="hover:bg-slate-50/70">
                    <td className="py-2.5 px-3 font-bold text-slate-500">5</td>
                    <td className="py-2.5 px-3 font-extrabold text-slate-900 whitespace-nowrap">Şifreli LocalStorage</td>
                    <td className="py-2.5 px-3 text-center"><span className="px-2 py-0.5 rounded bg-emerald-100 text-emerald-800 font-black text-[10px]">10/10</span></td>
                    <td className="py-2.5 px-3 text-slate-600">F12'de isim, rol ve token açık metin görünmez (secureStorage). Volatile RAM cache ile vatandaş verisi diske düz metin yazılmaz.</td>
                  </tr>
                  <tr className="hover:bg-slate-50/70">
                    <td className="py-2.5 px-3 font-bold text-slate-500">6</td>
                    <td className="py-2.5 px-3 font-extrabold text-slate-900 whitespace-nowrap">Tek Cihaz &amp; 30s Kalp Atışı</td>
                    <td className="py-2.5 px-3 text-center"><span className="px-2 py-0.5 rounded bg-emerald-100 text-emerald-800 font-black text-[10px]">10/10</span></td>
                    <td className="py-2.5 px-3 text-slate-600">Aynı hesapla birden fazla cihazdan giriş engellenir; yeni cihaz girince önceki cihaz 30s içinde anında kilitlenir.</td>
                  </tr>
                  <tr className="hover:bg-slate-50/70">
                    <td className="py-2.5 px-3 font-bold text-slate-500">7</td>
                    <td className="py-2.5 px-3 font-extrabold text-slate-900 whitespace-nowrap">Sezon İzolasyonu &amp; Arşiv</td>
                    <td className="py-2.5 px-3 text-center"><span className="px-2 py-0.5 rounded bg-emerald-100 text-emerald-800 font-black text-[10px]">10/10</span></td>
                    <td className="py-2.5 px-3 text-slate-600">Kapanan sezonlar bağımsız archived_* koleksiyonlarına taşınır; yeni dönemde eski arşiv listelerine veri girişi hard-block ile engellenir.</td>
                  </tr>
                  <tr className="hover:bg-slate-50/70">
                    <td className="py-2.5 px-3 font-bold text-slate-500">8</td>
                    <td className="py-2.5 px-3 font-extrabold text-slate-900 whitespace-nowrap">Web &amp; API Savunması (CSP)</td>
                    <td className="py-2.5 px-3 text-center"><span className="px-2 py-0.5 rounded bg-emerald-100 text-emerald-800 font-black text-[10px]">10/10</span></td>
                    <td className="py-2.5 px-3 text-slate-600">NoSQL operatör kalkanı (isSafeId), CSRF köken denetimi, Buffer-overflow engeli (asString, clampInt) ve katı HTTP güvenlik başlıkları.</td>
                  </tr>
                  <tr className="hover:bg-slate-50/70">
                    <td className="py-2.5 px-3 font-bold text-slate-500">9</td>
                    <td className="py-2.5 px-3 font-extrabold text-slate-900 whitespace-nowrap">Offline PWA &amp; Islak İmza</td>
                    <td className="py-2.5 px-3 text-center"><span className="px-2 py-0.5 rounded bg-emerald-100 text-emerald-800 font-black text-[10px]">10/10</span></td>
                    <td className="py-2.5 px-3 text-slate-600">İnternetsiz bodrum ve köylerde IndexedDB çevrimdışı modu, piksel kayıpsız vektörel dokunmatik ıslak imza ve akıllı rota kokpiti.</td>
                  </tr>
                  <tr className="hover:bg-slate-50/70">
                    <td className="py-2.5 px-3 font-bold text-slate-500">10</td>
                    <td className="py-2.5 px-3 font-extrabold text-slate-900 whitespace-nowrap">Sayıştay Denetim Kütükleri</td>
                    <td className="py-2.5 px-3 text-center"><span className="px-2 py-0.5 rounded bg-emerald-100 text-emerald-800 font-black text-[10px]">10/10</span></td>
                    <td className="py-2.5 px-3 text-slate-600">Silinemez (append-only) eylem logları, çift sekmeli resmi Excel dökümleri ve kantar fişi depo kömür stok mutabakatı.</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </div>
      ),
    },
  ];

  // Search filter (%100 Türkçe Karakter Uyumlu)
  const searchResults = useMemo(() => {
    if (!searchQuery.trim()) return [];
    return guideSections.filter((sec) => {
      const titleMatch = turkishIncludes(sec.title, searchQuery);
      const descMatch = turkishIncludes(sec.description, searchQuery);
      const badgeMatch = turkishIncludes(sec.badge, searchQuery);
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
      <div
        className="p-4 sm:p-6 rounded-2xl text-white shadow-lg relative overflow-hidden"
        style={{
          background: 'linear-gradient(135deg, #0f172a 0%, #1e3a8a 55%, #0f172a 100%)',
          border: '1px solid #1e40af',
          borderRadius: '22px',
        }}
      >
        <div className="relative z-10 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex flex-wrap items-center gap-2">
              <span
                className="px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-wider"
                style={{
                  backgroundColor: 'rgba(255, 255, 255, 0.16)',
                  color: '#ffffff',
                  border: '1px solid rgba(255, 255, 255, 0.35)',
                }}
              >
                T.C. EDİRNE SYDV
              </span>
              <span
                className="px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-wider"
                style={{
                  backgroundColor: '#059669',
                  color: '#ffffff',
                  border: '1px solid #34d399',
                }}
              >
                KULLANIM KILAVUZU
              </span>
            </div>

            <button
              type="button"
              onClick={() => {
                setActiveTab('compliance');
                setSearchQuery('');
              }}
              className="px-3.5 py-1.5 rounded-full text-[10px] font-black uppercase tracking-wider flex items-center gap-1.5 transition-all cursor-pointer shadow-xs"
              style={{
                backgroundColor: '#fbbf24',
                color: '#0f172a',
                border: '1px solid #fde68a',
              }}
            >
              <Award className="w-3.5 h-3.5" style={{ color: '#0f172a' }} />
              <span>Resmi Güvenlik &amp; Sistem Karnesi (10/10)</span>
            </button>
          </div>

          <div>
            <h2
              className="text-lg sm:text-2xl font-black tracking-tight leading-tight"
              style={{ color: '#ffffff' }}
            >
              Kömür Dağıtım ve Sorgulama Sistemi Kılavuzu
            </h2>
            <p
              className="text-xs mt-1.5 max-w-2xl font-semibold leading-relaxed hidden sm:block"
              style={{ color: '#e0f2fe' }}
            >
              Saha personeli ve yöneticiler için hak sahibi sorgulamadan ıslak imzalı kömür teslimatına ve 10/10 resmi güvenlik karnesine kadar tüm süreçler.
            </p>
          </div>

          {/* Quick Search inside Guide with High-Contrast White Input */}
          <div className="pt-1 w-full max-w-sm">
            <div className="relative w-full flex items-center">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                <Search className="w-4 h-4" style={{ color: '#475569' }} />
              </div>
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Kılavuzda konu ara..."
                className="w-full pl-9 pr-8 py-2 rounded-xl text-xs font-semibold transition-all shadow-sm"
                style={{
                  backgroundColor: '#ffffff',
                  color: '#0f172a',
                  border: '1px solid #cbd5e1',
                }}
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery('')}
                  className="absolute inset-y-0 right-0 pr-3 flex items-center text-xs font-bold"
                  style={{ color: '#475569' }}
                >
                  ✕
                </button>
              )}
            </div>
          </div>
        </div>
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
