'use client';

import { useState } from 'react';
import { ShieldAlert, Eye, EyeOff, Lock, X, AlertCircle, Smartphone } from 'lucide-react';

interface AdminAuthModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (adminUser: { name: string; username: string; session_token?: string }) => void;
  title?: string;
  description?: string;
}

export default function AdminAuthModal({
  isOpen,
  onClose,
  onSuccess,
  title = 'Yönetici Yetkilendirmesi Gereklidir',
  description = 'Excel aktarımı ve hassas veri yönetimi işlemleri için Yönetici şifresi veya PIN kodu gerekmektedir.',
}: AdminAuthModalProps) {
  const [username, setUsername] = useState('admin');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [requires2fa, setRequires2fa] = useState(false);
  const [totpCode, setTotpCode] = useState('');

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!password.trim()) {
      setErrorMsg('Lütfen yönetici şifrenizi veya PIN kodunu giriniz.');
      return;
    }

    setIsSubmitting(true);
    setErrorMsg('');

    try {
      const res = await fetch('/api/auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          role: 'ADMIN',
          username: username.trim() || 'admin',
          password: password.trim(),
          is_elevation: true,
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

      if (!data.success || data.user?.rol !== 'ADMIN') {
        throw new Error(data.error || 'Hatalı yönetici şifresi veya yetkisiz kullanıcı! Yetkilendirme reddedildi.');
      }

      onSuccess({
        name: data.user.ad_soyad || 'Yönetici',
        username: data.user.username || 'admin',
        session_token: data.session_token,
      });
      setPassword('');
      setTotpCode('');
      setRequires2fa(false);
      setErrorMsg('');
      onClose();
    } catch (err: any) {
      setErrorMsg(err.message || 'Yetkilendirme başarısız! Lütfen bilgilerinizi kontrol ediniz.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div
        className="modal-sheet max-w-md"
        onClick={(e) => e.stopPropagation()}
        style={{ maxWidth: '440px' }}
      >
        {/* Header */}
        <div className="flex items-start justify-between pb-3 border-b border-slate-100">
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-2xl bg-amber-100 text-amber-800 flex items-center justify-center border border-amber-200 shadow-xs">
              <ShieldAlert className="w-5 h-5 text-amber-700" />
            </div>
            <div>
              <h3 className="text-sm sm:text-base font-black text-slate-900 leading-tight">
                {title}
              </h3>
              <p className="text-[11px] text-amber-800 font-bold uppercase tracking-wider mt-0.5">
                Güvenli Yetki Doğrulaması
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content */}
        <form onSubmit={handleSubmit} className="pt-4 space-y-4">
          <p className="text-xs text-slate-600 leading-relaxed font-medium">
            {description}
          </p>

          {errorMsg && (
            <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs flex items-center gap-2 font-medium animate-in shake">
              <AlertCircle className="w-4 h-4 shrink-0 text-rose-600" />
              <span>{errorMsg}</span>
            </div>
          )}

          {requires2fa ? (
            <div className="p-3.5 rounded-2xl bg-amber-50/90 border-2 border-amber-300 space-y-2.5">
              <div className="flex items-center gap-2">
                <Smartphone className="w-4 h-4 text-amber-700 shrink-0" />
                <span className="text-xs font-black text-amber-950">
                  Google Authenticator 6 Haneli Kodu Giriniz
                </span>
              </div>
              <input
                type="text"
                inputMode="numeric"
                autoFocus
                value={totpCode}
                onChange={(e) => setTotpCode(e.target.value.toUpperCase().slice(0, 10))}
                placeholder="6 Haneli Kod (veya Kurtarma Kodu)"
                className="w-full px-3.5 py-2.5 rounded-xl bg-white border-2 border-amber-400 text-slate-900 text-center font-mono text-base font-black tracking-[0.25em] focus:outline-none focus:border-amber-600"
                required
              />
            </div>
          ) : (
            <>
              <div>
                <label className="block text-xs font-bold text-slate-600 uppercase tracking-wider mb-1.5">
                  Yönetici Kullanıcı Adı
                </label>
                <input
                  type="text"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="admin"
                  className="w-full px-3.5 py-2.5 rounded-xl bg-slate-50 border border-slate-300 text-slate-900 text-sm font-semibold focus:outline-none focus:border-amber-500 focus:bg-white"
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
                    autoFocus
                    className="w-full px-3.5 py-2.5 rounded-xl bg-slate-50 border border-slate-300 text-slate-900 text-sm font-semibold focus:outline-none focus:border-amber-500 focus:bg-white pr-10"
                    required
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-3 text-slate-400 hover:text-slate-600"
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>
            </>
          )}

          <div className="pt-2 flex items-center gap-2.5">
            <button
              type="button"
              onClick={() => {
                setRequires2fa(false);
                setTotpCode('');
                onClose();
              }}
              disabled={isSubmitting}
              className="btn-secondary flex-1 py-2.5 text-xs font-bold"
            >
              İptal
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="btn-primary flex-1 py-2.5 text-xs font-black bg-gradient-to-r from-amber-500 to-orange-600 text-white shadow-md shadow-amber-500/20"
            >
              {isSubmitting ? 'Doğrulanıyor...' : requires2fa ? '2FA Doğrula ve Onayla' : 'Yetkiyi Onayla'}
            </button>
          </div>

          <div className="pt-1 text-center">
            <p className="text-[10px] text-slate-400 flex items-center justify-center gap-1">
              <Lock className="w-3 h-3 text-slate-400" />
              <span>Güvenli şifreli doğrulama ve denetim kaydı.</span>
            </p>
          </div>
        </form>
      </div>
    </div>
  );
}

