'use client';

import { useState } from 'react';
import { 
  User, Shield, KeyRound, Lock, Eye, EyeOff, CheckCircle2, 
  AlertCircle, LogOut, X, Smartphone, Check, RefreshCw
} from 'lucide-react';

interface ProfileModalProps {
  isOpen: boolean;
  onClose: () => void;
  userRole: 'ADMIN' | 'PERSONEL';
  userName: string;
  onUserUpdated: (user: { name: string; username: string }) => void;
  onLogout?: () => void;
}

export default function ProfileModal({
  isOpen,
  onClose,
  userRole,
  userName,
  onUserUpdated,
  onLogout,
}: ProfileModalProps) {
  // Current logged in username from localStorage
  const currentUsername = typeof window !== 'undefined' ? (localStorage.getItem('komur_username') || '') : '';

  // Form states
  const [adSoyad, setAdSoyad] = useState(userName || '');
  const [username, setUsername] = useState(currentUsername);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  
  // Toggles
  const [showCurrentPass, setShowCurrentPass] = useState(false);
  const [showNewPass, setShowNewPass] = useState(false);

  // Status
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');
    setSuccessMsg('');

    if (!currentPassword.trim()) {
      setErrorMsg('Değişiklikleri kaydetmek için lütfen mevcut şifrenizi / PIN kodunuzu giriniz.');
      return;
    }

    if (!adSoyad.trim()) {
      setErrorMsg('Ad Soyad boş bırakılamaz.');
      return;
    }

    if (!username.trim() || username.trim().length < 3) {
      setErrorMsg('Kullanıcı adı en az 3 karakterden oluşmalıdır.');
      return;
    }

    if (newPassword.trim()) {
      if (newPassword.trim().length < 4) {
        setErrorMsg('Yeni şifreniz en az 4 karakter / rakam olmalıdır.');
        return;
      }
      if (newPassword.trim() !== confirmPassword.trim()) {
        setErrorMsg('Yeni şifreler birbiriyle eşleşmiyor! Lütfen kontrol ediniz.');
        return;
      }
    }

    setIsSubmitting(true);

    try {
      const res = await fetch('/api/auth', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: currentUsername || username.trim(),
          current_password: currentPassword.trim(),
          new_username: username.trim().toLowerCase(),
          new_ad_soyad: adSoyad.trim(),
          new_password: newPassword.trim() ? newPassword.trim() : undefined,
        }),
      });

      const data = await res.json();
      if (!data.success) {
        throw new Error(data.error || 'Bilgiler güncellenemedi');
      }

      setSuccessMsg(data.message || 'Profil ve şifre bilgileriniz başarıyla güncellendi!');
      
      // Update local storage
      if (data.user) {
        localStorage.setItem('komur_user_name', data.user.ad_soyad);
        localStorage.setItem('komur_username', data.user.username);
        onUserUpdated({
          name: data.user.ad_soyad,
          username: data.user.username,
        });
      }

      // Reset password fields
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');

      // Auto close after 2 seconds
      setTimeout(() => {
        onClose();
      }, 1800);
    } catch (err: any) {
      setErrorMsg(err.message || 'Bir hata oluştu. Lütfen tekrar deneyiniz.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div 
        className="modal-sheet max-w-md w-full" 
        onClick={(e) => e.stopPropagation()} 
        style={{ maxWidth: '440px' }}
      >
        {/* Header */}
        <div className="flex items-center justify-between pb-3 border-b border-slate-200 mb-4">
          <div className="flex items-center gap-2">
            <div className={`w-8 h-8 rounded-xl flex items-center justify-center ${
              userRole === 'ADMIN' ? 'bg-amber-100 text-amber-700' : 'bg-sky-100 text-sky-700'
            }`}>
              {userRole === 'ADMIN' ? <Shield className="w-4 h-4" /> : <User className="w-4 h-4" />}
            </div>
            <div>
              <h3 className="text-sm font-black text-slate-900 leading-tight">
                Hesap & Şifre Yönetimi
              </h3>
              <p className="text-[11px] text-slate-500 font-semibold">
                Kullanıcı adı ve şifre güncelleme
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-700 p-1.5 rounded-lg hover:bg-slate-100 transition-all"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* User Role & Single Device Info Card */}
        <div className="p-3 rounded-2xl bg-slate-50 border border-slate-200 mb-4 space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-black uppercase tracking-wider text-slate-500">
              Oturum Sahibi & Rol
            </span>
            <span className={`px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider ${
              userRole === 'ADMIN' ? 'bg-amber-100 text-amber-900 border border-amber-300' : 'bg-sky-100 text-sky-900 border border-sky-300'
            }`}>
              {userRole === 'ADMIN' ? 'Sistem Yöneticisi' : 'Saha Personeli'}
            </span>
          </div>

          <div className="flex items-center gap-2 text-xs font-bold text-slate-700">
            <Smartphone className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
            <span>Bu cihazda tek aktif oturum yetkilendirilmiştir.</span>
          </div>
        </div>

        {/* Feedback Alerts */}
        {errorMsg && (
          <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs font-semibold flex items-center gap-2 mb-3 animate-in shake">
            <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
            <span>{errorMsg}</span>
          </div>
        )}

        {successMsg && (
          <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-semibold flex items-center gap-2 mb-3">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            <span>{successMsg}</span>
          </div>
        )}

        {/* Profile & Password Update Form */}
        <form onSubmit={handleSubmit} className="space-y-3.5">
          {/* Adı Soyadı */}
          <div>
            <label className="block text-[11px] font-black text-slate-700 uppercase tracking-wider mb-1">
              Ad Soyad
            </label>
            <input
              type="text"
              value={adSoyad}
              onChange={(e) => setAdSoyad(e.target.value)}
              placeholder="Adınızı ve soyadınızı giriniz"
              className="w-full px-3 py-2 rounded-xl bg-slate-50 border border-slate-300 text-slate-900 text-xs font-semibold focus:outline-none focus:border-amber-500 focus:bg-white transition-all"
              required
            />
          </div>

          {/* Kullanıcı Adı */}
          <div>
            <label className="block text-[11px] font-black text-slate-700 uppercase tracking-wider mb-1">
              Kullanıcı Adı
            </label>
            <input
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="Kullanıcı adınızı giriniz"
              className="w-full px-3 py-2 rounded-xl bg-slate-50 border border-slate-300 text-slate-900 text-xs font-semibold focus:outline-none focus:border-amber-500 focus:bg-white transition-all"
              required
            />
            <p className="text-[10px] text-slate-400 mt-0.5">
              Sisteme giriş yaparken kullandığınız kullanıcı adı (en az 3 karakter).
            </p>
          </div>

          <div className="border-t border-slate-100 pt-3 space-y-3">
            <p className="text-[11px] font-black text-amber-900 uppercase tracking-wider flex items-center gap-1">
              <KeyRound className="w-3.5 h-3.5 text-amber-600" />
              Şifre Değişikliği (İsteğe Bağlı)
            </p>

            {/* Yeni Şifre */}
            <div>
              <label className="block text-[11px] font-bold text-slate-600 mb-1">
                Yeni Şifre / PIN <span className="text-slate-400 font-normal">(Değiştirmek istemiyorsanız boş bırakın)</span>
              </label>
              <div className="relative">
                <input
                  type={showNewPass ? 'text' : 'password'}
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="Yeni şifrenizi giriniz"
                  className="w-full px-3 py-2 pr-9 rounded-xl bg-slate-50 border border-slate-300 text-slate-900 text-xs font-semibold focus:outline-none focus:border-amber-500 focus:bg-white transition-all"
                />
                <button
                  type="button"
                  onClick={() => setShowNewPass(!showNewPass)}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 p-1"
                >
                  {showNewPass ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                </button>
              </div>
            </div>

            {/* Yeni Şifre Tekrar */}
            {newPassword.trim().length > 0 && (
              <div>
                <label className="block text-[11px] font-bold text-slate-600 mb-1">
                  Yeni Şifre Tekrarı
                </label>
                <input
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="Yeni şifrenizi tekrar giriniz"
                  className="w-full px-3 py-2 rounded-xl bg-slate-50 border border-slate-300 text-slate-900 text-xs font-semibold focus:outline-none focus:border-amber-500 focus:bg-white transition-all"
                  required
                />
              </div>
            )}

            {/* Mevcut Şifre (Zorunlu Güvenlik Doğrulaması) */}
            <div className="p-2.5 rounded-xl bg-amber-50/60 border border-amber-200 space-y-1">
              <label className="block text-[11px] font-black text-amber-950 uppercase tracking-wider">
                Mevcut Şifre / PIN <span className="text-rose-600">*</span>
              </label>
              <div className="relative">
                <input
                  type={showCurrentPass ? 'text' : 'password'}
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                  placeholder="İşlemi onaylamak için mevcut şifrenizi girin"
                  className="w-full px-3 py-2 pr-9 rounded-xl bg-white border border-amber-300 text-slate-900 text-xs font-bold focus:outline-none focus:border-amber-600 shadow-2xs"
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowCurrentPass(!showCurrentPass)}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-amber-700 hover:text-amber-900 p-1"
                >
                  {showCurrentPass ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                </button>
              </div>
              <p className="text-[10px] text-amber-800">
                Güvenlik gereği ad veya şifre güncellemelerinde mevcut şifreniz istenir.
              </p>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="pt-2 flex items-center gap-2">
            <button
              type="submit"
              disabled={isSubmitting}
              className="flex-1 py-2.5 px-3 rounded-xl bg-amber-500 hover:bg-amber-600 text-white text-xs font-black shadow-xs transition-all active:scale-95 flex items-center justify-center gap-1.5"
            >
              {isSubmitting ? (
                <>
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                  <span>Kaydediliyor...</span>
                </>
              ) : (
                <>
                  <Check className="w-3.5 h-3.5" />
                  <span>Değişiklikleri Kaydet</span>
                </>
              )}
            </button>

            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              className="py-2.5 px-3 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold transition-all active:scale-95"
            >
              Kapat
            </button>
          </div>
        </form>

        {/* Logout Option */}
        {onLogout && (
          <div className="mt-4 pt-3 border-t border-slate-100">
            <button
              type="button"
              onClick={() => {
                onClose();
                onLogout();
              }}
              className="w-full py-2 px-3 rounded-xl bg-rose-50 hover:bg-rose-100 border border-rose-200 text-rose-700 text-xs font-black flex items-center justify-center gap-2 transition-all active:scale-95 shadow-xs"
            >
              <LogOut className="w-3.5 h-3.5 text-rose-600" />
              Güvenli Oturumu Kapat (Çıkış Yap)
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
