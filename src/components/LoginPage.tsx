'use client';

import { useState, useEffect } from 'react';
import { Shield, User, KeyRound, LogIn, AlertCircle, CheckCircle2, Lock, Eye, EyeOff, Smartphone } from 'lucide-react';

interface LoginPageProps {
  onLoginSuccess: (user: { role: 'ADMIN' | 'PERSONEL'; name: string; username: string; session_token?: string }) => void;
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

  // Fetch registered staff on mount
  useEffect(() => {
    const fetchStaff = async () => {
      setIsLoadingStaff(true);
      try {
        const res = await fetch('/api/auth');
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

      const res = await fetch('/api/auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          role: activeTab,
          username: targetUser,
          password: password.trim(),
          totp_code: requires2fa ? totpCode.trim() : undefined,
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

      onLoginSuccess({
        role: data.user.rol,
        name: data.user.ad_soyad,
        username: data.user.username,
        session_token: data.session_token,
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
                  autoFocus
                  value={totpCode}
                  onChange={(e) => setTotpCode(e.target.value.toUpperCase().slice(0, 10))}
                  placeholder="6 Haneli Kod (veya Kurtarma Kodu)"
                  className="w-full px-4 py-3 rounded-xl bg-white border-2 border-amber-400 text-slate-900 text-center font-mono text-lg font-black tracking-[0.25em] focus:outline-none focus:border-amber-600 shadow-2xs"
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
                className={`login-submit-btn text-sm font-black shadow-lg transition-all ${
                  activeTab === 'ADMIN'
                    ? 'bg-gradient-to-r from-amber-500 to-orange-600 text-white shadow-amber-500/25 hover:from-amber-600 hover:to-orange-700'
                    : 'bg-gradient-to-r from-sky-600 to-indigo-600 text-white shadow-sky-600/25 hover:from-sky-700 hover:to-indigo-700'
                }`}
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

          {/* Security Notice Footer */}
          <div className="p-3 bg-slate-50 border-t border-slate-100 text-center text-[11px] text-slate-500 space-y-1">
            <div className="flex items-center justify-center gap-1.5 font-bold text-slate-600">
              <Lock className="w-3.5 h-3.5 text-amber-600 shrink-0" />
              <span>Tek Cihaz Koruması Aktiftir</span>
            </div>
            <p className="text-[10px] text-slate-400">
              Aynı kullanıcı adı ile aynı anda yalnızca 1 cihaz sisteme girebilir. Başka bir cihazdan giriş yapıldığında önceki oturum otomatik sonlandırılır.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
