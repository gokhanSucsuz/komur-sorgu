'use client';

import { useState, useEffect } from 'react';
import { Shield, User, KeyRound, LogIn, AlertCircle, CheckCircle2, Flame, Sparkles, Lock } from 'lucide-react';

interface LoginPageProps {
  onLoginSuccess: (user: { role: 'ADMIN' | 'PERSONEL'; name: string; username: string }) => void;
}

export default function LoginPage({ onLoginSuccess }: LoginPageProps) {
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
      setErrorMsg(err.message || 'Hatalı kullanıcı adı veya şifre! Lütfen kontrol ediniz.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen w-full bg-[#f8fafc] text-slate-900 flex flex-col items-center justify-center p-4 sm:p-6 selection:bg-amber-500 selection:text-white">
      {/* Brand Header */}
      <div className="w-full max-w-md text-center mb-5">
        <div className="w-16 h-16 mx-auto rounded-3xl bg-gradient-to-br from-amber-500 via-orange-500 to-amber-600 flex items-center justify-center shadow-lg shadow-amber-500/25 border border-amber-300/40 mb-3 animate-in zoom-in-95 duration-300">
          <Flame className="w-9 h-9 text-white fill-white" />
        </div>
        <div className="flex items-center justify-center gap-2">
          <h1 className="text-xl font-black text-slate-900 tracking-tight leading-none">
            KÖMÜR DAĞITIM VE TAKİP
          </h1>
          <span className="text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 border border-amber-300">
            PRO
          </span>
        </div>
        <p className="text-xs text-slate-500 font-semibold mt-1">
          Güvenli Kullanıcı Girişi & Saha Yönetim Portalı
        </p>
      </div>

      {/* Main Login Card */}
      <div className="w-full max-w-md bg-white rounded-3xl shadow-xl border border-slate-200/90 overflow-hidden flex flex-col animate-in fade-in slide-in-from-bottom-3 duration-300">
        {/* Tab Toggle: Personel vs Admin */}
        <div className="p-4 pb-2 border-b border-slate-100">
          <div className="p-1 rounded-2xl bg-slate-100 border border-slate-200 flex gap-1">
            <button
              type="button"
              onClick={() => {
                setActiveTab('PERSONEL');
                setErrorMsg('');
                setPassword('');
              }}
              className={`flex-1 py-3 px-3 rounded-xl text-xs font-bold flex items-center justify-center gap-2 transition-all ${
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
              }}
              className={`flex-1 py-3 px-3 rounded-xl text-xs font-bold flex items-center justify-center gap-2 transition-all ${
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

          {/* ADMIN LOGIN VIEW */}
          {activeTab === 'ADMIN' && (
            <div className="space-y-3.5">
              {/* Highlighted Admin Credentials Info Box */}
              <div className="p-3.5 rounded-2xl bg-amber-50/90 border border-amber-300 text-xs text-amber-900 space-y-1.5 shadow-xs">
                <div className="flex items-center gap-1.5 font-black text-amber-800">
                  <Sparkles className="w-4 h-4 text-amber-600" />
                  <span>Varsayılan Yönetici Bilgileri:</span>
                </div>
                <div className="grid grid-cols-2 gap-2 pt-1 font-mono text-[11px]">
                  <div className="bg-white p-2 rounded-xl border border-amber-200 shadow-xs">
                    <span className="text-slate-500 block text-[10px] uppercase font-bold">Kullanıcı Adı</span>
                    <strong className="text-slate-900 text-sm">admin</strong>
                  </div>
                  <div className="bg-white p-2 rounded-xl border border-amber-200 shadow-xs">
                    <span className="text-slate-500 block text-[10px] uppercase font-bold">Şifre / PIN</span>
                    <strong className="text-slate-900 text-sm">1234</strong>
                  </div>
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-600 uppercase tracking-wider mb-1.5">
                  Yönetici Kullanıcı Adı
                </label>
                <input
                  type="text"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="admin"
                  className="w-full px-4 py-3 rounded-xl bg-slate-50 border border-slate-300 text-slate-900 text-sm font-semibold focus:outline-none focus:border-amber-500 focus:bg-white shadow-xs"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-600 uppercase tracking-wider mb-1.5">
                  Yönetici Şifresi / PIN (1234)
                </label>
                <div className="relative">
                  <input
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Şifre veya 1234"
                    className="w-full px-4 py-3 rounded-xl bg-slate-50 border border-slate-300 text-slate-900 text-sm font-semibold focus:outline-none focus:border-amber-500 focus:bg-white pr-10 shadow-xs"
                    required
                  />
                  <KeyRound className="w-4 h-4 absolute right-3.5 top-3.5 text-slate-400" />
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
                              ? 'bg-sky-50 border-sky-400 text-slate-900 shadow-xs ring-1 ring-sky-300'
                              : 'bg-slate-50 border-slate-200 text-slate-700 hover:bg-slate-100'
                          }`}
                        >
                          <div className="flex items-center gap-2.5">
                            <div className={`w-8 h-8 rounded-lg flex items-center justify-center font-bold text-xs ${
                              isSelected
                                ? 'bg-sky-500 text-white shadow-xs'
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
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-xs font-bold text-slate-600 uppercase tracking-wider">
                    Personel PIN Kodu / Şifresi
                  </label>
                  <span className="text-[11px] text-amber-700 font-bold bg-amber-50 px-2 py-0.5 rounded border border-amber-200">
                    Varsayılan: 1234
                  </span>
                </div>
                <div className="relative">
                  <input
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="PIN Kodunuzu girin (Varsayılan: 1234)"
                    className="w-full px-4 py-3 rounded-xl bg-slate-50 border border-slate-300 text-slate-900 text-sm font-semibold focus:outline-none focus:border-sky-500 focus:bg-white pr-10 shadow-xs"
                    required
                  />
                  <KeyRound className="w-4 h-4 absolute right-3.5 top-3.5 text-slate-400" />
                </div>
              </div>
            </div>
          )}

          {/* Submit Button */}
          <div className="pt-2">
            <button
              type="submit"
              disabled={isSubmitting}
              className={`btn-primary w-full py-3.5 text-sm font-extrabold shadow-lg transition-all ${
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
                    {activeTab === 'ADMIN' ? 'Yönetici Olarak Giriş Yap' : 'Saha Dağıtımına Başla'}
                  </span>
                </>
              )}
            </button>
          </div>
        </form>

        {/* Security Notice Footer */}
        <div className="p-3 bg-slate-50 border-t border-slate-100 text-center text-[11px] text-slate-500 flex items-center justify-center gap-1.5">
          <Lock className="w-3.5 h-3.5 text-slate-400" />
          <span>Yetkisiz erişimler kayıt altına alınmaktadır. KVKK Uyumlu Güvenli Giriş.</span>
        </div>
      </div>
    </div>
  );
}
