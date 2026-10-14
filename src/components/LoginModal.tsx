'use client';

import { useState, useEffect } from 'react';
import { Shield, User, KeyRound, LogIn, AlertCircle, CheckCircle2, Flame, Sparkles } from 'lucide-react';

interface LoginModalProps {
  isOpen: boolean;
  onLoginSuccess: (user: { role: 'ADMIN' | 'PERSONEL'; name: string; username: string }) => void;
}

export default function LoginModal({ isOpen, onLoginSuccess }: LoginModalProps) {
  const [activeTab, setActiveTab] = useState<'ADMIN' | 'PERSONEL'>('PERSONEL');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [selectedStaff, setSelectedStaff] = useState<any | null>(null);
  const [staffList, setStaffList] = useState<any[]>([]);
  const [isLoadingStaff, setIsLoadingStaff] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  // Fetch registered staff on mount
  useEffect(() => {
    if (!isOpen) return;
    const fetchStaff = async () => {
      setIsLoadingStaff(true);
      try {
        const res = await fetch('/api/auth');
        const data = await res.json();
        if (data.success && data.personnel) {
          setStaffList(data.personnel);
          if (data.personnel.length > 0) {
            setSelectedStaff(data.personnel[0]);
          }
        }
      } catch (err) {
        console.error('Error fetching staff list:', err);
      } finally {
        setIsLoadingStaff(false);
      }
    };
    fetchStaff();
  }, [isOpen]);

  if (!isOpen) return null;

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
          password: password.trim()
        })
      });

      const data = await res.json();
      if (!data.success) {
        throw new Error(data.error || 'Giriş yapılamadı');
      }

      onLoginSuccess({
        role: data.user.rol,
        name: data.user.ad_soyad,
        username: data.user.username
      });
    } catch (err: any) {
      setErrorMsg(err.message || 'Bağlantı hatası oluştu');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-100 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-md animate-in fade-in duration-200">
      <div className="login-card-container" style={{ maxWidth: '460px' }}>
        <div className="login-main-card max-h-[92vh] overflow-hidden flex flex-col shadow-2xl">
        {/* Top Header Banner */}
        <div className="p-6 bg-gradient-to-br from-amber-500 via-orange-500 to-amber-600 text-white text-center relative">
          <div className="w-14 h-14 mx-auto rounded-2xl bg-white/20 backdrop-blur border border-white/30 flex items-center justify-center shadow-lg mb-3">
            <Flame className="w-8 h-8 text-white fill-white" />
          </div>
          <h2 className="text-xl font-black tracking-tight leading-tight">
            KÖMÜR DAĞITIM VE TAKİP
          </h2>
          <p className="text-xs text-amber-100 font-medium mt-1">
            Giriş Yaparak Dağıtıma Başlayınız
          </p>
        </div>

        {/* Tab Toggle: Personel vs Admin */}
        <div className="p-4 pb-0">
          <div className="p-1 rounded-2xl bg-slate-100 border border-slate-200 flex gap-1">
            <button
              type="button"
              onClick={() => {
                setActiveTab('PERSONEL');
                setErrorMsg('');
                setPassword('');
              }}
              className={`flex-1 py-2.5 px-3 rounded-xl text-xs font-bold flex items-center justify-center gap-2 transition-all ${
                activeTab === 'PERSONEL'
                  ? 'bg-white text-sky-900 shadow-md border border-slate-200'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <User className="w-4 h-4 text-sky-600" />
              <span>Saha Personeli Girişi</span>
            </button>

            <button
              type="button"
              onClick={() => {
                setActiveTab('ADMIN');
                setErrorMsg('');
                setPassword('');
                setUsername('admin');
              }}
              className={`flex-1 py-2.5 px-3 rounded-xl text-xs font-bold flex items-center justify-center gap-2 transition-all ${
                activeTab === 'ADMIN'
                  ? 'bg-white text-amber-900 shadow-md border border-slate-200'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Shield className="w-4 h-4 text-amber-600" />
              <span>Yönetici (Admin) Girişi</span>
            </button>
          </div>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-5 pt-3 space-y-4 overflow-y-auto flex-1">
          {errorMsg && (
            <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs flex items-center gap-2 font-medium">
              <AlertCircle className="w-4 h-4 shrink-0 text-rose-600" />
              <span>{errorMsg}</span>
            </div>
          )}

            {/* ADMIN LOGIN VIEW */}
            {activeTab === 'ADMIN' && (
              <div className="space-y-3">
                <div>
                  <label className="block text-xs font-bold text-slate-600 uppercase tracking-wider mb-1">
                    Yönetici Kullanıcı Adı
                  </label>
                  <input
                    type="text"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    placeholder="Kullanıcı adınızı girin"
                    className="w-full px-3.5 py-2.5 rounded-xl bg-slate-50 border border-slate-300 text-slate-900 text-sm font-semibold focus:outline-none focus:border-amber-500 focus:bg-white"
                    required
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-600 uppercase tracking-wider mb-1">
                    Yönetici Şifresi / PIN
                  </label>
                  <div className="relative">
                    <input
                      type="password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="Şifrenizi girin"
                      className="w-full px-3.5 py-2.5 rounded-xl bg-slate-50 border border-slate-300 text-slate-900 text-sm font-semibold focus:outline-none focus:border-amber-500 focus:bg-white pr-10"
                      required
                    />
                    <KeyRound className="w-4 h-4 absolute right-3.5 top-3 text-slate-400" />
                  </div>
                </div>
              </div>
            )}

            {/* STAFF LOGIN VIEW */}
            {activeTab === 'PERSONEL' && (
              <div className="space-y-3">
                <div>
                  <label className="block text-xs font-bold text-slate-600 uppercase tracking-wider mb-1.5">
                    Giriş Yapacak Personeli Seçiniz
                  </label>
                  {isLoadingStaff ? (
                    <div className="p-3 text-center text-xs text-slate-500 bg-slate-50 rounded-xl">
                      Personel listesi yükleniyor...
                    </div>
                  ) : (
                    <div className="space-y-1.5 max-h-48 overflow-y-auto pr-0.5">
                      {staffList.map((person) => {
                        const isSelected = selectedStaff?.id === person.id;
                        return (
                          <div
                            key={person.id}
                            onClick={() => {
                              setSelectedStaff(person);
                              setUsername(person.username);
                            }}
                            className={`p-2.5 rounded-xl border flex items-center justify-between cursor-pointer transition-all ${
                              isSelected
                                ? 'bg-sky-50 border-sky-400 text-slate-900 shadow-xs'
                                : 'bg-slate-50 border-slate-200 text-slate-700 hover:bg-slate-100'
                            }`}
                          >
                            <div className="flex items-center gap-2.5">
                              <div className={`w-8 h-8 rounded-lg flex items-center justify-center font-bold text-xs ${
                                isSelected
                                  ? 'bg-sky-500 text-white'
                                  : 'bg-slate-200 text-slate-600'
                              }`}>
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
                  <div className="flex items-center justify-between mb-1">
                    <label className="text-xs font-bold text-slate-600 uppercase tracking-wider">
                      Personel PIN Kodu / Şifresi
                    </label>
                  </div>
                  <div className="relative">
                    <input
                      type="password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="PIN Kodunuzu girin"
                      className="w-full px-3.5 py-2.5 rounded-xl bg-slate-50 border border-slate-300 text-slate-900 text-sm font-semibold focus:outline-none focus:border-sky-500 focus:bg-white pr-10"
                      required
                    />
                    <KeyRound className="w-4 h-4 absolute right-3.5 top-3 text-slate-400" />
                  </div>
                </div>
              </div>
            )}

          {/* Submit Button */}
          <div className="pt-2 flex justify-center">
            <button
              type="submit"
              disabled={isSubmitting}
              className={`login-submit-btn text-sm font-extrabold shadow-lg ${
                activeTab === 'ADMIN'
                  ? 'bg-gradient-to-r from-amber-500 to-orange-600 text-white shadow-amber-500/25 hover:from-amber-600 hover:to-orange-700'
                  : 'bg-gradient-to-r from-sky-600 to-indigo-600 text-white shadow-sky-600/25 hover:from-sky-700 hover:to-indigo-700'
              }`}
            >
              {isSubmitting ? (
                'Giriş Yapılıyor...'
              ) : (
                <>
                  <LogIn className="w-4 h-4 text-white" />
                  <span>
                    {activeTab === 'ADMIN' ? 'Yönetici Olarak Giriş Yap' : 'Saha Dağıtımına Başla'}
                  </span>
                </>
              )}
            </button>
          </div>
        </form>
        </div>
      </div>
    </div>
  );
}
