'use client';

import { useState, useEffect } from 'react';
import { Shield, User, KeyRound, LogIn, AlertCircle, CheckCircle2, Lock, Eye, EyeOff, Smartphone, QrCode, RefreshCw, X, Check } from 'lucide-react';

interface LoginPageProps {
  onLoginSuccess: (user: {
    role: 'ADMIN' | 'PERSONEL';
    name: string;
    username: string;
    session_token?: string;
    ekip_adi?: string;
    ekip_arkadaslari?: string[];
    ekip_arkadasi?: string;
  }) => void;
  sessionTerminatedReason?: string | null;
}

export default function LoginPage({ onLoginSuccess, sessionTerminatedReason }: LoginPageProps) {
  const [activeTab, setActiveTab] = useState<'ADMIN' | 'PERSONEL'>('PERSONEL');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [selectedStaff, setSelectedStaff] = useState<any | null>(null);
  const [staffList, setStaffList] = useState<any[]>([]);
  const [isLoadingStaff, setIsLoadingStaff] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState(sessionTerminatedReason || '');

  // 2FA (Google Authenticator) Challenge State
  const [requires2fa, setRequires2fa] = useState(false);
  const [totpCode, setTotpCode] = useState('');

  // Device Whitelisting & Method A Pairing States
  const [isMobileDevice, setIsMobileDevice] = useState(false);
  const [isDeviceChecking, setIsDeviceChecking] = useState(true);
  const [isDeviceAuthorized, setIsDeviceAuthorized] = useState(false);
  const [deviceSlotName, setDeviceSlotName] = useState('');

  // Activation modal state for mobile
  const [showActivationModal, setShowActivationModal] = useState(false);
  const [activationCodeInput, setActivationCodeInput] = useState('');
  const [isActivating, setIsActivating] = useState(false);
  const [activationError, setActivationError] = useState('');
  const [activationSuccess, setActivationSuccess] = useState('');

  // Check device authorization and mobile status
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const isMobile = /android|iphone|ipad|ipod|mobile/i.test(navigator.userAgent);
      setIsMobileDevice(isMobile);

      const checkDevice = async () => {
        try {
          const savedDeviceToken = localStorage.getItem('komur_device_token') || '';
          if (!savedDeviceToken) {
            setIsDeviceAuthorized(false);
            setIsDeviceChecking(false);
            return;
          }

          const res = await fetch('/api/devices?action=check_status', {
            headers: { 'x-device-token': savedDeviceToken },
          });
          const data = await res.json();
          if (data.success && data.authorized) {
            setIsDeviceAuthorized(true);
            setDeviceSlotName(data.slot_name || '');
          } else {
            setIsDeviceAuthorized(false);
            localStorage.removeItem('komur_device_token');
          }
        } catch (e) {
          console.error('Error checking device status:', e);
        } finally {
          setIsDeviceChecking(false);
        }
      };

      checkDevice();

      // Auto-detect pair_code from URL query (when scanning QR code with phone camera)
      try {
        const urlParams = new URLSearchParams(window.location.search);
        const urlCode = urlParams.get('pair_code') || urlParams.get('code');
        if (urlCode && /^\d{6}$/.test(urlCode.trim())) {
          setActivationCodeInput(urlCode.trim());
          setShowActivationModal(true);
        }
      } catch (e) {}
    }
  }, []);

  // Fetch registered staff on mount (sends device token if mobile paired)
  useEffect(() => {
    const fetchStaff = async () => {
      setIsLoadingStaff(true);
      try {
        const savedToken = typeof window !== 'undefined' ? localStorage.getItem('komur_device_token') || '' : '';
        const headers: Record<string, string> = {};
        if (savedToken) {
          headers['x-device-token'] = savedToken;
        }
        const res = await fetch('/api/auth', { headers });
        const data = await res.json();
        if (data.success && data.personnel) {
          setStaffList(data.personnel);
          if (data.personnel.length > 0) {
            setSelectedStaff(data.personnel[0]);
            setUsername(data.personnel[0].username);
          }
        }
      } catch (err) {
        console.error('Error fetching staff list:', err);
      } finally {
        setIsLoadingStaff(false);
      }
    };
    fetchStaff();
  }, []);

  const handleActivateDevice = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsActivating(true);
    setActivationError('');
    setActivationSuccess('');

    try {
      const codeClean = activationCodeInput.trim().toUpperCase().replace(/\s+/g, '');
      if (codeClean.length !== 6) {
        throw new Error('Lütfen 6 haneli aktivasyon kodunu eksiksiz giriniz.');
      }

      const res = await fetch('/api/devices', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'ACTIVATE_DEVICE',
          code: codeClean,
          device_model: typeof navigator !== 'undefined' ? navigator.userAgent.substring(0, 150) : 'Mobil Cihaz',
        }),
      });

      const data = await res.json();
      if (!data.success) {
        throw new Error(data.error || 'Aktivasyon kodu doğrulanamadı.');
      }

      localStorage.setItem('komur_device_token', data.device_token);
      setIsDeviceAuthorized(true);
      setDeviceSlotName(data.slot_name || '');
      setActivationSuccess(`Başarılı! Bu telefon "${data.slot_name}" olarak eşlendi.`);

      setTimeout(() => {
        setShowActivationModal(false);
        setActivationCodeInput('');
        setActivationSuccess('');
      }, 1400);
    } catch (err: any) {
      setActivationError(err.message || 'Cihaz aktivasyonu başarısız oldu');
    } finally {
      setIsActivating(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setErrorMsg('');

    try {
      let targetUser = username;
      if (activeTab === 'ADMIN') {
        targetUser = username.trim() || 'admin';
      } else if (selectedStaff) {
        targetUser = selectedStaff.username;
      }

      const deviceToken = typeof window !== 'undefined' ? (localStorage.getItem('komur_device_token') || '') : '';

      const res = await fetch('/api/auth', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'x-device-token': deviceToken,
        },
        body: JSON.stringify({
          role: activeTab,
          username: targetUser,
          password: password.trim(),
          totp_code: requires2fa ? totpCode.trim() : undefined,
          device_token: deviceToken,
        }),
      });

      const data = await res.json();

      if (data.requires_2fa && !data.success) {
        setRequires2fa(true);
        if (data.error) {
          setErrorMsg(data.error);
        }
        return;
      }

      if (!data.success) {
        throw new Error(data.error || 'Giriş yapılamadı');
      }

      if (data.device_token && typeof window !== 'undefined') {
        localStorage.setItem('komur_device_token', data.device_token);
      }

      onLoginSuccess({
        role: data.user.rol,
        name: data.user.ad_soyad,
        username: data.user.username,
        session_token: data.session_token,
        ekip_adi: data.user.ekip_adi,
        ekip_arkadaslari: data.user.ekip_arkadaslari,
        ekip_arkadasi: data.user.ekip_arkadasi,
      });
    } catch (err: any) {
      setErrorMsg(err.message || 'Hatalı kullanıcı adı veya şifre! Lütfen kontrol ediniz.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="login-page-bg selection:bg-amber-500 selection:text-white">
      {/* Brand Header */}
      <div className="login-card-container text-center mb-6">
        <div className="login-logo-container" style={{ width: '76px', height: '76px', minWidth: '76px', minHeight: '76px', margin: '0 auto 12px auto' }}>
          <img
            src="/edirne-sydv-logo.png"
            alt="Edirne Sosyal Yardımlaşma ve Dayanışma Vakfı Başkanlığı"
            width={76}
            height={76}
            style={{ width: '100%', height: '100%', objectFit: 'contain' }}
          />
        </div>
        <div className="space-y-1">
          <p className="text-[11px] font-black uppercase tracking-widest text-rose-800">
            T.C. EDİRNE VALİLİĞİ
          </p>
          <h1 className="text-base sm:text-lg font-black text-slate-900 tracking-tight leading-tight">
            Edirne Sosyal Yardımlaşma ve Dayanışma Vakfı Başkanlığı
          </h1>
          <p className="text-xs text-amber-900 font-bold mt-1.5 bg-amber-50/90 inline-block px-3 py-1 rounded-full border border-amber-200 shadow-2xs">
            Kömür Dağıtım ve Saha Takip Sistemi
          </p>
        </div>
      </div>

      {/* Main Login Card - Constrained on Desktop & Fluid on Mobile */}
      <div className="login-card-container">
        <div className="login-main-card">
          {/* Tab Toggle: Personel vs Admin */}
          <div className="p-4 pb-2 border-b border-slate-100">
            <div className="p-1 rounded-2xl bg-slate-100 border border-slate-200 flex gap-1.5">
              <button
                type="button"
                onClick={() => {
                  setActiveTab('PERSONEL');
                  setErrorMsg('');
                  setPassword('');
                  setRequires2fa(false);
                  setTotpCode('');
                }}
                className={`flex-1 py-2.5 px-3 rounded-xl text-xs font-extrabold flex items-center justify-center gap-2 transition-all ${
                  activeTab === 'PERSONEL'
                    ? 'bg-white text-sky-900 shadow-md border border-slate-200'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <User className="w-4 h-4 text-sky-600" />
                <span>Saha Personeli</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  setActiveTab('ADMIN');
                  setErrorMsg('');
                  setPassword('');
                  setUsername('admin');
                  setRequires2fa(false);
                  setTotpCode('');
                }}
                className={`flex-1 py-2.5 px-3 rounded-xl text-xs font-extrabold flex items-center justify-center gap-2 transition-all ${
                  activeTab === 'ADMIN'
                    ? 'bg-white text-amber-900 shadow-md border border-slate-200'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <Shield className="w-4 h-4 text-amber-600" />
                <span>Yönetici (Admin)</span>
              </button>
            </div>
          </div>

          {/* Hardware & Device Enforcement Banners */}
          {activeTab === 'ADMIN' && isMobileDevice && (
            <div className="px-6 pt-3 pb-0">
              <div className="p-3 rounded-2xl bg-amber-50/90 border border-amber-300 text-amber-950 text-xs flex items-start gap-2.5 shadow-2xs">
                <Smartphone className="w-4 h-4 shrink-0 text-amber-600 mt-0.5" />
                <div>
                  <p className="font-extrabold text-amber-950">Yönetici Mobil Cihazı (Slot 1)</p>
                  <p className="text-[11px] text-amber-800 font-medium mt-0.5">
                    Giriş yaptığınızda bu telefon sistemde otomatik olarak <b>1. Yönetici Telefonu (Admin - Gökhan SUÇSUZ)</b> olarak eşlenecek ve yetkilendirilecektir.
                  </p>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'PERSONEL' && (
            <div className="px-6 pt-3 pb-0">
              {!isMobileDevice ? (
                <div className="p-3 rounded-2xl bg-amber-50/90 border border-amber-300 text-amber-950 text-xs flex items-start gap-2.5 shadow-2xs">
                  <AlertCircle className="w-4 h-4 shrink-0 text-amber-700 mt-0.5" />
                  <div>
                    <p className="font-extrabold text-amber-950">Masaüstü / Bilgisayar Kısıtı Aktiftir</p>
                    <p className="text-[11px] text-amber-800 font-medium mt-0.5">
                      Saha personelleri sisteme yalnızca kurumca yetkilendirilmiş 3 saha telefonundan (Slot 2, 3, 4) giriş yapabilir. Bilgisayar erişimi yalnızca Yönetici (Admin) hesabına aittir.
                    </p>
                  </div>
                </div>
              ) : isDeviceChecking ? (
                <div className="p-2.5 rounded-xl bg-slate-50 border border-slate-200 text-slate-500 text-xs flex items-center justify-center gap-2">
                  <RefreshCw className="w-3.5 h-3.5 animate-spin text-slate-400" />
                  <span className="text-[11px]">Cihaz yetki durumu denetleniyor...</span>
                </div>
              ) : isDeviceAuthorized ? (
                <div className="p-2.5 rounded-xl bg-emerald-50 border border-emerald-300 text-emerald-950 text-xs flex items-center justify-between shadow-2xs">
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                    <span className="font-extrabold text-[11px]">Yetkili Cihaz: {deviceSlotName || 'Saha Telefonu'}</span>
                  </div>
                  <span className="text-[9px] font-black uppercase tracking-wider px-2 py-0.5 bg-emerald-600 text-white rounded">
                    ONAYLI
                  </span>
                </div>
              ) : (
                <div className="p-3.5 rounded-2xl bg-rose-50 border border-rose-300 text-rose-950 text-xs space-y-2 shadow-2xs">
                  <div className="flex items-start gap-2">
                    <AlertCircle className="w-4 h-4 shrink-0 text-rose-600 mt-0.5" />
                    <div>
                      <p className="font-extrabold text-rose-950">Yetkisiz Saha Cihazı</p>
                      <p className="text-[11px] text-rose-800 font-medium mt-0.5">
                        Bu telefon henüz 3 yetkili saha cihazı arasına kaydedilmemiştir. Personel girişi için Yönetici aktivasyon kodu gereklidir.
                      </p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setShowActivationModal(true);
                      setActivationError('');
                      setActivationSuccess('');
                    }}
                    className="w-full py-2 px-3 rounded-xl bg-rose-600 bg-linear-to-r from-rose-600 to-indigo-600 text-white font-black text-xs flex items-center justify-center gap-1.5 shadow-sm active:scale-95 transition-all"
                    style={{ background: 'linear-gradient(135deg, #e11d48 0%, #4f46e5 100%)', color: '#ffffff' }}
                  >
                    <Smartphone className="w-3.5 h-3.5 text-white" />
                    <span>Cihazı Eşle / Aktivasyon Kodu Gir</span>
                  </button>
                </div>
              )}
            </div>
          )}

          {/* Form Body */}
          <form onSubmit={handleSubmit} className="p-6 space-y-4">
            {errorMsg && (
              <div className="p-3.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs flex items-center gap-2.5 font-medium animate-in shake">
                <AlertCircle className="w-4 h-4 shrink-0 text-rose-600" />
                <span>{errorMsg}</span>
              </div>
            )}

            {/* 2FA VERIFICATION VIEW */}
            {requires2fa ? (
              <div className="p-4 rounded-2xl bg-amber-50/90 border-2 border-amber-300 space-y-3">
                <div className="flex items-center gap-2.5">
                  <div className="w-9 h-9 rounded-xl bg-amber-500 text-white flex items-center justify-center shrink-0 shadow-xs">
                    <Smartphone className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="text-xs font-black text-amber-950 uppercase tracking-wide">
                      İki Faktörlü Doğrulama (2FA)
                    </h3>
                    <p className="text-[11px] text-amber-800 font-semibold">
                      Google Authenticator uygulamasındaki 6 haneli kodu giriniz
                    </p>
                  </div>
                </div>

                <input
                  type="text"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  enterKeyHint="go"
                  autoFocus
                  value={totpCode}
                  onChange={(e) => setTotpCode(e.target.value.toUpperCase().slice(0, 10))}
                  placeholder="6 Haneli Kod (veya Kurtarma Kodu)"
                  className="w-full px-4 py-3 rounded-xl bg-white border-2 border-amber-400 text-slate-900 text-center font-mono text-lg font-black tracking-[0.25em] focus:outline-none focus:border-amber-600 shadow-2xs"
                  style={{ letterSpacing: '0.25em' }}
                  required
                />

                <div className="flex items-center justify-between text-[11px] text-amber-900 pt-1">
                  <span>Telefonunuz yanınızda değilse yedek kurtarma kodunu girebilirsiniz.</span>
                  <button
                    type="button"
                    onClick={() => {
                      setRequires2fa(false);
                      setTotpCode('');
                      setErrorMsg('');
                    }}
                    className="font-black underline hover:text-amber-700 shrink-0 ml-2"
                  >
                    Geri Dön
                  </button>
                </div>
              </div>
            ) : (
              <>
                {/* ADMIN LOGIN VIEW */}
                {activeTab === 'ADMIN' && (
                  <div className="space-y-3.5">
                    <div>
                      <label className="block text-xs font-bold text-slate-600 uppercase tracking-wider mb-1.5">
                        Yönetici Kullanıcı Adı
                      </label>
                      <input
                        type="text"
                        autoComplete="username"
                        enterKeyHint="next"
                        value={username}
                        onChange={(e) => setUsername(e.target.value)}
                        placeholder="Kullanıcı adınızı girin"
                        className="w-full px-4 py-2.5 rounded-xl bg-slate-50 border border-slate-300 text-slate-900 text-sm font-semibold focus:outline-none focus:border-amber-500 focus:bg-white shadow-2xs"
                        required
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-bold text-slate-600 uppercase tracking-wider mb-1.5">
                        Yönetici Şifresi / PIN
                      </label>
                      <div className="relative">
                        <input
                          type={showPassword ? 'text' : 'password'}
                          autoComplete="current-password"
                          enterKeyHint="go"
                          value={password}
                          onChange={(e) => setPassword(e.target.value)}
                          placeholder="Şifrenizi girin"
                          className="w-full px-4 py-2.5 rounded-xl bg-slate-50 border border-slate-300 text-slate-900 text-sm font-semibold focus:outline-none focus:border-amber-500 focus:bg-white pr-10 shadow-2xs"
                          required
                        />
                        <button
                          type="button"
                          onClick={() => setShowPassword(!showPassword)}
                          className="absolute right-3.5 top-3 text-slate-400 hover:text-slate-600 transition-colors"
                          tabIndex={-1}
                        >
                          {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                        </button>
                      </div>
                    </div>
                  </div>
                )}

                {/* STAFF LOGIN VIEW */}
                {activeTab === 'PERSONEL' && (
                  <div className="space-y-3.5">
                    <div>
                      <label className="block text-xs font-bold text-slate-600 uppercase tracking-wider mb-1.5">
                        Giriş Yapacak Personeli Seçiniz
                      </label>
                      {isLoadingStaff ? (
                        <div className="p-4 text-center text-xs text-slate-500 bg-slate-50 rounded-xl">
                          Personel listesi yükleniyor...
                        </div>
                      ) : (
                        <div className="space-y-1.5 max-h-52 overflow-y-auto pr-0.5">
                          {staffList.map((person) => {
                            const isSelected = selectedStaff?.id === person.id;
                            return (
                              <div
                                key={person.id}
                                onClick={() => {
                                  setSelectedStaff(person);
                                  setUsername(person.username);
                                }}
                                className={`p-3 rounded-xl border flex items-center justify-between cursor-pointer transition-all ${
                                  isSelected
                                    ? 'bg-sky-50 border-sky-400 text-slate-900 shadow-2xs ring-1 ring-sky-300'
                                    : 'bg-slate-50 border-slate-200 text-slate-700 hover:bg-slate-100'
                                }`}
                              >
                                <div className="flex items-center gap-2.5">
                                  <div
                                    className={`w-8 h-8 rounded-lg flex items-center justify-center font-bold text-xs ${
                                      isSelected
                                        ? 'bg-sky-500 text-white shadow-2xs'
                                        : 'bg-slate-200 text-slate-600'
                                    }`}
                                  >
                                    <User className="w-4 h-4" />
                                  </div>
                                  <div>
                                    <p className="text-xs font-extrabold text-slate-900">{person.ad_soyad}</p>
                                    <p className="text-[11px] text-slate-500 font-mono">@{person.username}</p>
                                  </div>
                                </div>
                                {isSelected && <CheckCircle2 className="w-4 h-4 text-sky-600" />}
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>

                    <div>
                      <div className="flex items-center justify-between mb-1.5">
                        <label className="text-xs font-bold text-slate-600 uppercase tracking-wider">
                          Personel PIN Kodu / Şifresi
                        </label>
                      </div>
                      <div className="relative">
                        <input
                          type={showPassword ? 'text' : 'password'}
                          autoComplete="current-password"
                          enterKeyHint="go"
                          value={password}
                          onChange={(e) => setPassword(e.target.value)}
                          placeholder="PIN Kodunuzu girin"
                          className="w-full px-4 py-2.5 rounded-xl bg-slate-50 border border-slate-300 text-slate-900 text-sm font-semibold focus:outline-none focus:border-sky-500 focus:bg-white pr-10 shadow-2xs"
                          required
                        />
                        <button
                          type="button"
                          onClick={() => setShowPassword(!showPassword)}
                          className="absolute right-3.5 top-3 text-slate-400 hover:text-slate-600 transition-colors"
                          tabIndex={-1}
                        >
                          {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                        </button>
                      </div>
                    </div>
                  </div>
                )}
              </>
            )}

            {/* Submit Button - Perfectly proportioned on desktop and mobile */}
            <div className="pt-3 flex justify-center">
              <button
                type="submit"
                disabled={isSubmitting}
                className={`login-submit-btn ${activeTab === 'ADMIN' ? 'admin-mode bg-amber-500' : 'bg-sky-600'} text-sm font-black shadow-lg transition-all text-white`}
                style={{
                  backgroundColor: activeTab === 'ADMIN' ? '#f59e0b' : '#0284c7',
                  backgroundImage: activeTab === 'ADMIN'
                    ? 'linear-gradient(135deg, #f59e0b 0%, #ea580c 100%)'
                    : 'linear-gradient(135deg, #0284c7 0%, #4f46e5 100%)',
                  color: '#ffffff'
                }}
              >
                {isSubmitting ? (
                  'Giriş Doğrulanıyor...'
                ) : (
                  <>
                    <LogIn className="w-4 h-4 text-white" />
                    <span>
                      {requires2fa
                        ? '2FA Kodunu Doğrula ve Giriş Yap'
                        : activeTab === 'ADMIN'
                          ? 'Yönetici Olarak Giriş Yap'
                          : 'Saha Dağıtımına Başla'}
                    </span>
                  </>
                )}
              </button>
            </div>
          </form>

          {/* Security & KVKK Notice Footer */}
          <div className="p-3.5 bg-slate-50 border-t border-slate-200 text-center text-[11px] text-slate-600 space-y-2.5">
            <div className="flex justify-center">
              <button
                type="button"
                onClick={() => {
                  if (typeof window !== 'undefined') {
                    window.dispatchEvent(new CustomEvent('komur_open_android_helper'));
                  }
                }}
                className="px-3 py-1.5 rounded-xl bg-amber-50 hover:bg-amber-100 text-amber-900 border border-amber-300 text-[11px] font-extrabold inline-flex items-center gap-1.5 shadow-2xs transition-all active:scale-95"
              >
                <Smartphone className="w-3.5 h-3.5 text-amber-700 shrink-0" />
                <span>Uygulama Yüklenmiyor mu? (Eski Android Çözümü & Hızlı Mod)</span>
              </button>
            </div>
            <div className="flex items-center justify-center gap-1.5 font-bold text-slate-700">
              <Shield className="w-3.5 h-3.5 text-indigo-600 shrink-0" />
              <span>Resmi Kurum Bilgi Sistemi & KVKK Bildirimi</span>
            </div>
            <p className="text-[10px] text-slate-500 leading-relaxed max-w-sm mx-auto">
              Bu sistem yalnızca yetkili kurum personeli içindir. Tüm işlemler ve erişimler kayıt altına alınmaktadır; yetkisiz erişim yasal işleme tabidir. Kişisel veriler 6698 sayılı KVKK kapsamında işlenmektedir.
            </p>
            <div className="flex items-center justify-center gap-1 text-[10px] text-slate-400 font-medium">
              <Lock className="w-3 h-3 text-amber-600 inline" />
              <span>Tek aktif oturum & yetkili cihaz güvenlik kalkanı devrededir.</span>
            </div>
          </div>
        </div>
      </div>

      {/* Device Activation Modal for Mobile Phones */}
      {showActivationModal && (
        <div className="modal-overlay" onClick={() => setShowActivationModal(false)}>
          <div className="modal-sheet max-w-sm" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between pb-3 border-b border-slate-200 mb-3">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-xl bg-indigo-600 text-white flex items-center justify-center shadow-xs">
                  <Smartphone className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-sm font-black text-slate-900">Saha Telefonunu Eşle</h3>
                  <p className="text-[11px] text-slate-500 font-medium">Yönetici Aktivasyon Kodu</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowActivationModal(false)}
                className="text-slate-400 hover:text-slate-700 p-1"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleActivateDevice} className="space-y-3">
              <p className="text-xs text-slate-600">
                Sistem Yöneticinizin (Admin - Gökhan SUÇSUZ) panelinden bu telefon için ürettiği <b>6 haneli aktivasyon kodunu</b> giriniz:
              </p>

              {activationError && (
                <div className="p-2.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0 text-rose-600" />
                  <span>{activationError}</span>
                </div>
              )}

              {activationSuccess && (
                <div className="p-2.5 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs flex items-center gap-2 font-bold">
                  <Check className="w-4 h-4 text-emerald-600" />
                  <span>{activationSuccess}</span>
                </div>
              )}

              <div>
                <input
                  type="text"
                  inputMode="numeric"
                  maxLength={6}
                  autoFocus
                  value={activationCodeInput}
                  onChange={(e) => setActivationCodeInput(e.target.value.replace(/\D/g, '').slice(0, 6))}
                  placeholder="6 Haneli Kod (Örn: 482915)"
                  className="w-full px-4 py-3 rounded-xl bg-slate-50 border-2 border-indigo-400 text-slate-900 text-center font-mono text-2xl font-black tracking-[0.25em] focus:outline-none focus:border-indigo-600 focus:bg-white shadow-inner"
                  required
                />
              </div>

              <div className="pt-2 flex gap-2">
                <button
                  type="button"
                  onClick={() => setShowActivationModal(false)}
                  className="btn-secondary flex-1 py-2 text-xs"
                >
                  Vazgeç
                </button>
                <button
                  type="submit"
                  disabled={isActivating || activationCodeInput.length !== 6}
                  className="btn-primary flex-1 py-2 text-xs font-bold bg-indigo-600 hover:bg-indigo-700 text-white disabled:opacity-50"
                >
                  {isActivating ? 'Eşleniyor...' : 'Cihazı Onayla'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
