'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  FileClock,
  Search,
  Download,
  RefreshCw,
  X,
  User,
  Shield,
  PackageCheck,
  AlertTriangle,
  RotateCcw,
  Route as RouteIcon,
  FileSpreadsheet,
  Clock,
  Settings,
  Calendar,
  CheckCircle2,
  Trash2,
  Truck,
  Lock,
  Unlock,
  ShieldCheck,
  LogOut,
  KeyRound,
} from 'lucide-react';
import { formatTrAuto } from '@/lib/dateUtils';
import { showToast } from './GlobalAlertManager';

interface AuditLogsModalProps {
  onClose: () => void;
}

export default function AuditLogsModal({ onClose }: AuditLogsModalProps) {
  const [activeView, setActiveView] = useState<'LOGS' | 'SECURITY'>('LOGS');
  const [logs, setLogs] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [personelList, setPersonelList] = useState<string[]>([]);
  const [integrity, setIntegrity] = useState<{
    valid: boolean;
    checkedCount: number;
    chainedCount: number;
    tamperedCount: number;
  } | null>(null);
  const [stats, setStats] = useState<any>({
    toplamIslem: 0,
    teslimat: 0,
    eksikTeslimat: 0,
    iptal: 0,
    rota: 0,
    excel: 0,
    mesai: 0,
  });

  // Security panel states
  const [securityData, setSecurityData] = useState<any>(null);
  const [isLoadingSecurity, setIsLoadingSecurity] = useState(false);

  // Filter states
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedAction, setSelectedAction] = useState('HEPSI');
  const [selectedPersonel, setSelectedPersonel] = useState('HEPSI');
  const [selectedDateRange, setSelectedDateRange] = useState<'ALL' | 'TODAY' | 'WEEK' | 'MONTH'>('ALL');

  const fetchLogs = useCallback(async () => {
    setIsLoading(true);
    try {
      const params = new URLSearchParams();
      if (searchQuery.trim()) params.set('q', searchQuery.trim());
      if (selectedAction !== 'HEPSI') params.set('islem_tipi', selectedAction);
      if (selectedPersonel !== 'HEPSI') params.set('personel', selectedPersonel);

      const now = new Date();
      if (selectedDateRange === 'TODAY') {
        const todayStr = now.toLocaleDateString('en-CA');
        params.set('gun', todayStr);
      } else if (selectedDateRange === 'WEEK') {
        const pastWeek = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        params.set('startDate', pastWeek.toLocaleDateString('en-CA'));
        params.set('endDate', now.toLocaleDateString('en-CA'));
      } else if (selectedDateRange === 'MONTH') {
        const pastMonth = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
        params.set('startDate', pastMonth.toLocaleDateString('en-CA'));
        params.set('endDate', now.toLocaleDateString('en-CA'));
      }

      const res = await fetch(`/api/activity-logs?${params.toString()}`);
      const data = await res.json();
      if (data.success) {
        setLogs(data.logs || []);
        if (data.personelListesi) setPersonelList(data.personelListesi);
        if (data.stats) setStats(data.stats);
        if (data.integrity) setIntegrity(data.integrity);
      }
    } catch (err) {
      console.error('Error loading activity logs:', err);
    } finally {
      setIsLoading(false);
    }
  }, [searchQuery, selectedAction, selectedPersonel, selectedDateRange]);

  const fetchSecurityOverview = useCallback(async () => {
    setIsLoadingSecurity(true);
    try {
      const res = await fetch('/api/auth?action=security_overview');
      const data = await res.json();
      if (data.success) {
        setSecurityData(data);
      }
    } catch (err) {
      console.error('Error loading security overview:', err);
    } finally {
      setIsLoadingSecurity(false);
    }
  }, []);

  useEffect(() => {
    fetchLogs();
  }, [fetchLogs]);

  useEffect(() => {
    if (activeView === 'SECURITY') {
      fetchSecurityOverview();
    }
  }, [activeView, fetchSecurityOverview]);

  const handleUnlockRateLimit = async (rateKey?: string, clearAll?: boolean) => {
    try {
      const res = await fetch('/api/auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'admin_unlock_rate_limit',
          rate_key: rateKey,
          clear_all: clearAll,
        }),
      });
      const data = await res.json();
      if (data.success) {
        showToast({ type: 'success', title: 'Kilit Açıldı', message: data.message });
        fetchSecurityOverview();
        fetchLogs();
      } else {
        showToast({ type: 'error', title: 'Hata', message: data.error || 'Kilit açılamadı.' });
      }
    } catch {
      showToast({ type: 'error', title: 'Hata', message: 'Sunucu bağlantı hatası.' });
    }
  };

  const handleForceLogout = async (targetUsername: string) => {
    try {
      const res = await fetch('/api/auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'admin_force_logout_user',
          target_username: targetUsername,
        }),
      });
      const data = await res.json();
      if (data.success) {
        showToast({ type: 'success', title: 'Oturum Sonlandırıldı', message: data.message });
        fetchSecurityOverview();
      } else {
        showToast({ type: 'error', title: 'Hata', message: data.error || 'Oturum kapatılamadı.' });
      }
    } catch {
      showToast({ type: 'error', title: 'Hata', message: 'Sunucu bağlantı hatası.' });
    }
  };

  const getActionBadge = (tip: string) => {
    switch (tip) {
      case 'TESLIMAT':
        return {
          icon: <PackageCheck className="w-3.5 h-3.5 text-emerald-700" />,
          label: 'Teslimat',
          className: 'bg-emerald-100 text-emerald-900 border-emerald-300',
        };
      case 'EKSIK_TESLIMAT':
        return {
          icon: <AlertTriangle className="w-3.5 h-3.5 text-amber-700" />,
          label: 'Eksik Teslimat',
          className: 'bg-amber-100 text-amber-950 border-amber-300',
        };
      case 'IPTAL':
        return {
          icon: <RotateCcw className="w-3.5 h-3.5 text-rose-700" />,
          label: 'İptal / Düzeltme',
          className: 'bg-rose-100 text-rose-900 border-rose-300',
        };
      case 'ROTA_OLUSTURMA':
      case 'ROTA_KAPATMA':
      case 'ROTA_GUNCELLEME':
        return {
          icon: <RouteIcon className="w-3.5 h-3.5 text-sky-700" />,
          label: 'Rota Hareketi',
          className: 'bg-sky-100 text-sky-900 border-sky-300',
        };
      case 'TIR_GIRIS':
      case 'TIR_GUNCELLEME':
        return {
          icon: <Truck className="w-3.5 h-3.5 text-amber-700" />,
          label: tip === 'TIR_GUNCELLEME' ? 'Tır Güncelleme' : 'Tır & Tonaj Girişi',
          className: 'bg-amber-100 text-amber-950 border-amber-300',
        };
      case 'TIR_SILME':
        return {
          icon: <Trash2 className="w-3.5 h-3.5 text-rose-700" />,
          label: 'Tır Kaydı Silme',
          className: 'bg-rose-100 text-rose-900 border-rose-300',
        };
      case 'EXCEL_YUKLEME':
        return {
          icon: <FileSpreadsheet className="w-3.5 h-3.5 text-purple-700" />,
          label: 'Excel Yükleme',
          className: 'bg-purple-100 text-purple-900 border-purple-300',
        };
      case 'EXCEL_SILME':
        return {
          icon: <Trash2 className="w-3.5 h-3.5 text-rose-700" />,
          label: 'Excel Geri Alma',
          className: 'bg-rose-100 text-rose-900 border-rose-300',
        };
      case 'MESAI_BASLAT':
      case 'MESAI_BITIR':
        return {
          icon: <Clock className="w-3.5 h-3.5 text-indigo-700" />,
          label: 'Mesai Hareketi',
          className: 'bg-indigo-100 text-indigo-900 border-indigo-300',
        };
      case 'KOTA_DEGISTIRME':
      case 'PERSONEL_ISLEM':
      case 'GUVENLIK_KILIT_ACMA':
        return {
          icon: <Settings className="w-3.5 h-3.5 text-orange-700" />,
          label: 'Sistem / Güvenlik',
          className: 'bg-orange-100 text-orange-900 border-orange-300',
        };
      default:
        return {
          icon: <FileClock className="w-3.5 h-3.5 text-slate-700" />,
          label: tip,
          className: 'bg-slate-100 text-slate-900 border-slate-300',
        };
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div
        className="modal-sheet max-w-4xl max-h-[90vh] flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between pb-3.5 border-b border-slate-200">
          <div className="flex items-center gap-2.5">
            <div
              className="w-11 h-11 rounded-full border-2 border-indigo-200 bg-white p-0.5 shadow-xs shrink-0 flex items-center justify-center overflow-hidden"
              style={{ width: '40px', height: '40px', minWidth: '40px', minHeight: '40px' }}
            >
              <img
                src="/edirne-sydv-logo.png"
                alt="Edirne Sosyal Yardımlaşma ve Dayanışma Vakfı Başkanlığı"
                width={36}
                height={36}
                className="modal-logo-img"
                style={{ width: '100%', height: '100%', objectFit: 'contain' }}
              />
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h3 className="text-base font-extrabold text-slate-900 leading-tight">
                  Denetim Logları & Güvenlik Merkezi
                </h3>
                <span className="text-[10px] font-black uppercase px-2 py-0.5 rounded-full bg-rose-50 text-rose-800 border border-rose-200">
                  T.C. EDİRNE SYDV
                </span>
                {integrity && (
                  <span
                    className={`text-[10px] font-bold px-2 py-0.5 rounded-full flex items-center gap-1 border ${
                      integrity.valid
                        ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                        : 'bg-rose-50 text-rose-800 border-rose-200'
                    }`}
                    title="HMAC-SHA256 Denetim Günlüğü Bütünlük Zinciri"
                  >
                    <ShieldCheck className="w-3 h-3" />
                    {integrity.valid
                      ? `HMAC Zinciri Doğrulandı (${integrity.chainedCount} imzalı)`
                      : `Bütünlük Uyarısı (${integrity.tamperedCount})`}
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-500 font-medium mt-0.5">
                Edirne Sosyal Yardımlaşma ve Dayanışma Vakfı Başkanlığı denetim, oturum ve güvenlik izleme merkezi
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <a
              href="/api/export?type=activity_logs"
              download="Edirne_SYDV_Kullanici_Islem_Loglari_Raporu.xlsx"
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-emerald-50 hover:bg-emerald-100 text-emerald-800 text-xs font-bold border border-emerald-300 transition-all active:scale-95 shadow-xs"
              title="Tüm Logları Excel İndir"
            >
              <Download className="w-3.5 h-3.5 text-emerald-700" />
              <span className="hidden sm:inline">Excel İndir</span>
            </a>

            <button
              onClick={onClose}
              className="p-1.5 text-slate-400 hover:text-slate-700 rounded-lg transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* View Switcher Tabs */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-3">
          <button
            type="button"
            onClick={() => setActiveView('LOGS')}
            className={`min-h-[42px] px-3.5 py-2 rounded-xl text-xs font-extrabold flex items-center justify-center gap-1.5 transition-all active:scale-95 ${
              activeView === 'LOGS'
                ? 'bg-indigo-600 text-white shadow-xs'
                : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
            }`}
          >
            <FileClock className="w-4 h-4 shrink-0" />
            <span>İşlem & Denetim Günlükleri</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveView('SECURITY')}
            className={`min-h-[42px] px-3.5 py-2 rounded-xl text-xs font-extrabold flex items-center justify-center gap-1.5 transition-all active:scale-95 ${
              activeView === 'SECURITY'
                ? 'bg-amber-600 text-white shadow-xs'
                : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
            }`}
          >
            <ShieldCheck className="w-4 h-4 shrink-0" />
            <span>Güvenlik, Oturumlar & Kilit Yönetimi</span>
          </button>
        </div>

        {activeView === 'SECURITY' ? (
          <div className="flex-1 min-h-0 overflow-y-auto pt-3 space-y-3 pr-1">
            {isLoadingSecurity || !securityData ? (
              <div className="p-12 text-center text-slate-500 text-xs font-semibold space-y-2">
                <div className="w-6 h-6 border-2 border-amber-600 border-t-transparent rounded-full animate-spin mx-auto" />
                <span>Güvenlik ve oturum durumu yükleniyor...</span>
              </div>
            ) : (
              <>
                {/* Crypto & Policy Status */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                  <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-200">
                    <div className="flex items-center gap-1.5 text-emerald-800 font-extrabold text-xs">
                      <KeyRound className="w-4 h-4" />
                      <span>AES-256-GCM & Kör Dizin</span>
                    </div>
                    <p className="text-[11px] text-emerald-700 font-semibold mt-1">
                      {securityData.cryptoHealth?.healthy
                        ? 'Kriptografik motor aktif ve doğrulandı.'
                        : 'Anahtar yapılandırmasını kontrol ediniz.'}
                    </p>
                  </div>
                  <div className="p-3 rounded-xl bg-indigo-50 border border-indigo-200">
                    <div className="flex items-center gap-1.5 text-indigo-800 font-extrabold text-xs">
                      <Shield className="w-4 h-4" />
                      <span>Aktif Cihaz Oturumu</span>
                    </div>
                    <p className="text-[11px] text-indigo-700 font-semibold mt-1">
                      {securityData.activeSessions?.length || 0} açık oturum (6 saat mutlak süre)
                    </p>
                  </div>
                  <div className="p-3 rounded-xl bg-amber-50 border border-amber-200">
                    <div className="flex items-center gap-1.5 text-amber-900 font-extrabold text-xs">
                      <Lock className="w-4 h-4" />
                      <span>Hız Sınırı / Kilit Kaydı</span>
                    </div>
                    <p className="text-[11px] text-amber-800 font-semibold mt-1">
                      {securityData.rateLimits?.filter((r: any) => r.locked).length || 0} aktif kilit /{' '}
                      {securityData.rateLimits?.length || 0} izlenen anahtar
                    </p>
                  </div>
                </div>

                {/* Rate Limit Lockouts */}
                <div className="p-3.5 rounded-xl bg-white border border-slate-200 space-y-2">
                  <div className="flex items-center justify-between">
                    <h4 className="text-xs font-extrabold text-slate-900 flex items-center gap-1.5">
                      <Lock className="w-3.5 h-3.5 text-rose-600" />
                      <span>Brute-Force Kilitleri & Hatalı Giriş Denemeleri</span>
                    </h4>
                    {(securityData.rateLimits?.length || 0) > 0 && (
                      <button
                        onClick={() => handleUnlockRateLimit(undefined, true)}
                        className="px-2.5 py-1 rounded-lg bg-rose-50 hover:bg-rose-100 text-rose-800 border border-rose-200 text-[11px] font-bold flex items-center gap-1"
                      >
                        <Unlock className="w-3 h-3" />
                        <span>Tüm Kilitleri Temizle</span>
                      </button>
                    )}
                  </div>
                  {!securityData.rateLimits || securityData.rateLimits.length === 0 ? (
                    <p className="text-xs text-slate-500 font-medium py-2">
                      Şu anda kilitli hesap veya hatalı giriş kaydı bulunmuyor.
                    </p>
                  ) : (
                    <div className="space-y-2">
                      {securityData.rateLimits.map((rl: any) => (
                        <div
                          key={rl.key}
                          className="flex flex-wrap items-center justify-between gap-2 p-2.5 rounded-xl bg-slate-50 border border-slate-200 text-xs"
                        >
                          <div className="min-w-0">
                            <span className="font-mono font-bold text-slate-800 break-all">{rl.key}</span>
                            <span className="ml-2 text-[11px] text-slate-600">
                              ({rl.count} deneme{rl.locked ? ` • ${rl.waitSeconds} sn kilitli` : ''})
                            </span>
                          </div>
                          <button
                            type="button"
                            onClick={() => handleUnlockRateLimit(rl.key, false)}
                            className="min-h-[38px] px-3 py-1.5 rounded-xl bg-emerald-100 hover:bg-emerald-200 text-emerald-900 border border-emerald-300 text-xs font-extrabold flex items-center gap-1.5 active:scale-95 transition-all shrink-0"
                          >
                            <Unlock className="w-3.5 h-3.5" />
                            <span>Kilidi Aç</span>
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Active Sessions & 2FA Status */}
                <div className="p-3.5 rounded-xl bg-white border border-slate-200 space-y-2">
                  <div className="flex items-center justify-between">
                    <h4 className="text-xs font-extrabold text-slate-900 flex items-center gap-1.5">
                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                      <span>Kullanıcı Hesapları, 2FA ve Açık Oturumlar</span>
                    </h4>
                    <button
                      onClick={fetchSecurityOverview}
                      className="p-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700"
                      title="Yenile"
                    >
                      <RefreshCw className="w-3.5 h-3.5" />
                    </button>
                  </div>
                  <div className="space-y-2">
                    {(securityData.accounts || []).map((acc: any) => (
                      <div
                        key={acc.username}
                        className="flex flex-wrap items-center justify-between gap-2 p-2.5 rounded-xl bg-slate-50 border border-slate-200 text-xs"
                      >
                        <div className="flex flex-wrap items-center gap-1.5">
                          <span className="font-extrabold text-slate-900">{acc.ad_soyad}</span>
                          <span className="text-[11px] text-slate-500">(@{acc.username})</span>
                          <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-slate-200 text-slate-800">
                            {acc.rol}
                          </span>
                          <span
                            className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                              acc.totp_enabled
                                ? 'bg-emerald-100 text-emerald-800'
                                : 'bg-amber-100 text-amber-800'
                            }`}
                          >
                            {acc.totp_enabled ? '2FA Aktif' : '2FA Kapalı'}
                          </span>
                        </div>
                        <div className="flex items-center gap-2 ml-auto">
                          {acc.has_active_session ? (
                            <>
                              <span className="text-[11px] font-bold text-emerald-700">Açık Oturum</span>
                              <button
                                type="button"
                                onClick={() => handleForceLogout(acc.username)}
                                className="min-h-[38px] px-3 py-1.5 rounded-xl bg-rose-100 hover:bg-rose-200 text-rose-800 border border-rose-300 text-xs font-extrabold flex items-center gap-1.5 active:scale-95 transition-all"
                              >
                                <LogOut className="w-3.5 h-3.5" />
                                <span>Oturumu Kapat</span>
                              </button>
                            </>
                          ) : (
                            <span className="text-[11px] text-slate-400 font-semibold">Çevrimdışı</span>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </>
            )}
          </div>
        ) : (
          <>
            {/* Overview Stats Bar */}
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 my-3">
              <div className="p-2.5 rounded-xl bg-slate-50 border border-slate-200 text-center">
                <span className="text-[10px] font-bold text-slate-500 uppercase block">Toplam İşlem</span>
                <span className="text-base font-black text-slate-900">{stats.toplamIslem}</span>
              </div>
              <div className="p-2.5 rounded-xl bg-emerald-50 border border-emerald-200 text-center">
                <span className="text-[10px] font-bold text-emerald-700 uppercase block">Tamamlanan Teslimat</span>
                <span className="text-base font-black text-emerald-700">{stats.teslimat}</span>
              </div>
              <div className="p-2.5 rounded-xl bg-amber-50 border border-amber-200 text-center">
                <span className="text-[10px] font-bold text-amber-800 uppercase block">Eksik Teslimat</span>
                <span className="text-base font-black text-amber-800">{stats.eksikTeslimat}</span>
              </div>
              <div className="p-2.5 rounded-xl bg-rose-50 border border-rose-200 text-center">
                <span className="text-[10px] font-bold text-rose-700 uppercase block">İptal / Geri Alma</span>
                <span className="text-base font-black text-rose-700">{stats.iptal}</span>
              </div>
              <div className="p-2.5 rounded-xl bg-sky-50 border border-sky-200 text-center col-span-2 sm:col-span-1">
                <span className="text-[10px] font-bold text-sky-800 uppercase block">Rota & Mesai</span>
                <span className="text-base font-black text-sky-800">{stats.rota + stats.mesai}</span>
              </div>
            </div>

            {/* Filter Toolbar */}
            <div className="space-y-2 pb-3 border-b border-slate-200">
              <div className="flex flex-col sm:flex-row gap-2">
                <div className="relative flex-1">
                  <Search className="w-4 h-4 absolute left-3 top-3 text-slate-400" />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Personel adı, hak sahibi, TC kimlik, açıklama ara..."
                    className="w-full pl-9 pr-3 py-2 rounded-xl bg-white border border-slate-300 text-slate-900 placeholder-slate-400 text-xs font-medium focus:outline-none focus:border-indigo-500 shadow-xs"
                  />
                </div>

                <select
                  value={selectedAction}
                  onChange={(e) => setSelectedAction(e.target.value)}
                  className="px-3 py-2 rounded-xl bg-white border border-slate-300 text-slate-800 text-xs font-bold focus:outline-none focus:border-indigo-500 shadow-xs"
                >
                  <option value="HEPSI">Tüm İşlem Türleri</option>
                  <option value="TESLIMAT">Teslimatlar (Tam & Eksik)</option>
                  <option value="EKSIK_TESLIMAT">Yalnızca Eksik Teslimatlar</option>
                  <option value="IPTAL">İptal Edilen Teslimatlar</option>
                  <option value="ROTA">Rota İşlemleri</option>
                  <option value="TIR">Tır & Tonaj İşlemleri</option>
                  <option value="EXCEL">Excel Yükleme & Geri Alma</option>
                  <option value="MESAI">Mesai Başlat / Bitir</option>
                  <option value="KOTA_DEGISTIRME">Kota Değişiklikleri</option>
                  <option value="PERSONEL_ISLEM">Personel İşlemleri</option>
                </select>

                <select
                  value={selectedPersonel}
                  onChange={(e) => setSelectedPersonel(e.target.value)}
                  className="px-3 py-2 rounded-xl bg-white border border-slate-300 text-slate-800 text-xs font-bold focus:outline-none focus:border-indigo-500 shadow-xs"
                >
                  <option value="HEPSI">Tüm Personeller</option>
                  {personelList.map((p) => (
                    <option key={p} value={p}>
                      {p}
                    </option>
                  ))}
                </select>

                <button
                  onClick={fetchLogs}
                  title="Yenile"
                  className="p-2 rounded-xl bg-slate-100 hover:bg-slate-200 border border-slate-200 text-slate-700 transition-all shrink-0 active:scale-95"
                >
                  <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin text-indigo-600' : ''}`} />
                </button>
              </div>

              <div className="flex items-center gap-1.5 overflow-x-auto pb-0.5 text-xs">
                <span className="text-[11px] font-bold text-slate-500 flex items-center gap-1 mr-1">
                  <Calendar className="w-3.5 h-3.5" /> Zaman:
                </span>
                <button
                  onClick={() => setSelectedDateRange('ALL')}
                  className={`px-2.5 py-1 rounded-lg font-bold text-xs transition-all ${
                    selectedDateRange === 'ALL'
                      ? 'bg-indigo-600 text-white shadow-xs'
                      : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                  }`}
                >
                  Tüm Zamanlar
                </button>
                <button
                  onClick={() => setSelectedDateRange('TODAY')}
                  className={`px-2.5 py-1 rounded-lg font-bold text-xs transition-all ${
                    selectedDateRange === 'TODAY'
                      ? 'bg-indigo-600 text-white shadow-xs'
                      : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                  }`}
                >
                  Bugün
                </button>
                <button
                  onClick={() => setSelectedDateRange('WEEK')}
                  className={`px-2.5 py-1 rounded-lg font-bold text-xs transition-all ${
                    selectedDateRange === 'WEEK'
                      ? 'bg-indigo-600 text-white shadow-xs'
                      : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                  }`}
                >
                  Son 7 Gün
                </button>
                <button
                  onClick={() => setSelectedDateRange('MONTH')}
                  className={`px-2.5 py-1 rounded-lg font-bold text-xs transition-all ${
                    selectedDateRange === 'MONTH'
                      ? 'bg-indigo-600 text-white shadow-xs'
                      : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                  }`}
                >
                  Son 30 Gün
                </button>
              </div>
            </div>

            {/* Logs List Area */}
            <div className="flex-1 min-h-0 overflow-y-auto pt-2 space-y-2.5 pr-1">
              {isLoading ? (
                <div className="p-12 text-center text-slate-500 text-xs font-semibold space-y-2">
                  <div className="w-6 h-6 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin mx-auto" />
                  <span>İşlem logları taranıyor ve yükleniyor...</span>
                </div>
              ) : logs.length === 0 ? (
                <div className="p-12 text-center bg-slate-50 rounded-2xl border border-slate-200 text-slate-500 text-xs font-medium">
                  Filtre kriterlerine uygun işlem logu bulunamadı.
                </div>
              ) : (
                logs.map((item) => {
                  const badge = getActionBadge(item.islem_tipi);
                  return (
                    <div
                      key={item.id || item._id}
                      className="p-3.5 rounded-xl bg-white border border-slate-200 hover:border-slate-300 transition-all space-y-2 shadow-xs"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <div className="w-7 h-7 rounded-lg bg-slate-100 border border-slate-200 flex items-center justify-center shrink-0">
                            {item.kullanici_rolu === 'ADMIN' ? (
                              <Shield className="w-4 h-4 text-amber-600" />
                            ) : (
                              <User className="w-4 h-4 text-sky-600" />
                            )}
                          </div>
                          <div>
                            <div className="flex items-center gap-1.5">
                              <span className="text-xs font-extrabold text-slate-900">
                                {item.kullanici_adi || 'Bilinmeyen Kullanıcı'}
                              </span>
                              <span
                                className={`text-[9px] font-bold px-1.5 py-0.2 rounded ${
                                  item.kullanici_rolu === 'ADMIN'
                                    ? 'bg-amber-100 text-amber-800'
                                    : 'bg-sky-100 text-sky-800'
                                }`}
                              >
                                {item.kullanici_rolu === 'ADMIN' ? 'Yönetici' : 'Saha Ekibi'}
                              </span>
                            </div>
                            <span className="text-[10px] text-slate-500 font-semibold block">
                              {item.tarih ? formatTrAuto(item.tarih) : '-'}
                            </span>
                          </div>
                        </div>

                        <div className="flex items-center gap-1.5 shrink-0">
                          {item.integrity_hash && (
                            <span
                              className="text-[9px] font-mono font-bold px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-700 border border-emerald-200"
                              title={`HMAC-SHA256: ${String(item.integrity_hash).slice(0, 16)}...`}
                            >
                              HMAC
                            </span>
                          )}
                          <span
                            className={`badge text-[10px] py-0.5 px-2 font-bold flex items-center gap-1 border ${badge.className}`}
                          >
                            {badge.icon}
                            <span>{badge.label}</span>
                          </span>
                        </div>
                      </div>

                      <div className="p-2.5 rounded-lg bg-slate-50 border border-slate-200 text-xs space-y-1">
                        <p className="font-extrabold text-slate-900 text-xs">{item.baslik}</p>
                        <p className="text-slate-700 text-xs leading-relaxed font-medium">{item.detay}</p>
                      </div>

                      {(item.hedef_kisi || item.hedef_tc || item.mahalle) && (
                        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 pt-1 text-[11px] text-slate-600 border-t border-slate-100">
                          {item.hedef_kisi && (
                            <span>
                              <strong className="text-slate-800">Hak Sahibi:</strong> {item.hedef_kisi}
                            </span>
                          )}
                          {item.hedef_tc && (
                            <span className="font-mono text-amber-800">
                              <strong>TC:</strong> {item.hedef_tc}
                            </span>
                          )}
                          {item.mahalle && (
                            <span>
                              <strong>Mahalle:</strong> {item.mahalle}
                            </span>
                          )}
                          {item.torba_sayisi !== undefined && item.torba_sayisi !== null && (
                            <span className="text-emerald-700 font-bold">
                              <strong>Kömür:</strong> {item.torba_sayisi} Torba
                            </span>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
