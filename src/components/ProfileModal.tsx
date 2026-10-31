'use client';

import Image from 'next/image';
import { useState, useEffect } from 'react';
import { User, Shield, KeyRound, Eye, EyeOff, CheckCircle2, AlertCircle, LogOut, X, Smartphone, Check, RefreshCw, QrCode, Copy, ShieldCheck, ShieldOff, Building2 } from 'lucide-react';
import { formatTrAuto } from '@/lib/dateUtils';
import { showToast } from './GlobalAlertManager';
import { applySafeCachePurge } from '@/lib/cacheManager';
import { getSecureItem, setSecureItem } from '@/lib/secureStorage';

interface ProfileModalProps {
  isOpen: boolean;
  onClose: () => void;
  userRole: 'ADMIN' | 'PERSONEL' | 'MUDUR';
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
  const currentUsername = typeof window !== 'undefined' ? (getSecureItem('komur_username') || '') : '';

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

  // 2FA (Google Authenticator) States for ADMIN
  const [totpEnabled, setTotpEnabled] = useState(false);
  const [totpEnabledAt, setTotpEnabledAt] = useState<string | null>(null);
  const [recoveryCodesCount, setRecoveryCodesCount] = useState(0);
  const [loading2faStatus, setLoading2faStatus] = useState(false);

  // 2FA Setup Flow
  const [setupMode, setSetupMode] = useState(false);
  const [qrSvgUrl, setQrSvgUrl] = useState('');
  const [totpSecret, setTotpSecret] = useState('');
  const [otpauthUri, setOtpauthUri] = useState('');
  const [totpVerifyCode, setTotpVerifyCode] = useState('');
  const [totpVerifyPassword, setTotpVerifyPassword] = useState('');
  const [totpSubmitting, setTotpSubmitting] = useState(false);
  const [generatedRecoveryCodes, setGeneratedRecoveryCodes] = useState<string[]>([]);
  const [copiedSecret, setCopiedSecret] = useState(false);
  const [copiedRecovery, setCopiedRecovery] = useState(false);

  // 2FA Disable Flow
  const [disableMode, setDisableMode] = useState(false);
  const [disableCode, setDisableCode] = useState('');
  const [disablePassword, setDisablePassword] = useState('');
  const [isPurgingCache, setIsPurgingCache] = useState(false);
  const appVersion = typeof window !== 'undefined' ? (localStorage.getItem('komur_app_version') || process.env.NEXT_PUBLIC_APP_VERSION || '') : '';

  const handleManualCachePurge = async () => {
    setIsPurgingCache(true);
    try {
      await applySafeCachePurge(appVersion);
      showToast({
        type: 'success',
        title: 'Önbellek Temizlendi',
        message: 'Cihazınızdaki eski önbellek güvenle temizlendi. Sayfa yenileniyor...',
      });
      setTimeout(() => {
        if (typeof window !== 'undefined') {
          window.location.reload();
        }
      }, 800);
    } catch {
      setIsPurgingCache(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      setAdSoyad(userName || '');
      setUsername(typeof window !== 'undefined' ? (getSecureItem('komur_username') || '') : '');
      setErrorMsg('');
      setSuccessMsg('');
      setSetupMode(false);
      setDisableMode(false);
      setTotpVerifyCode('');
      setTotpVerifyPassword('');
      setDisableCode('');
      setDisablePassword('');

      fetch2faStatus();
    }
  }, [isOpen, userRole, userName]);

  const fetch2faStatus = async () => {
    setLoading2faStatus(true);
    try {
      const res = await fetch('/api/auth?action=2fa_status');
      const data = await res.json();
      if (data.success) {
        setTotpEnabled(Boolean(data.totp_enabled));
        setTotpEnabledAt(data.totp_enabled_at || null);
        setRecoveryCodesCount(data.recovery_codes_count || 0);
      }
    } catch {
      // ignore status fetch error
    } finally {
      setLoading2faStatus(false);
    }
  };

  if (!isOpen) return null;

  const copyTextSafe = (text: string) => {
    if (!text) return;
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).catch(() => {
        const ta = document.createElement('textarea');
        ta.value = text;
        ta.style.position = 'fixed';
        ta.style.opacity = '0';
        document.body.appendChild(ta);
        ta.select();
        document.execCommand('copy');
        document.body.removeChild(ta);
      });
    } else {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
    }
  };

  const handleStart2faSetup = async () => {
    setErrorMsg('');
    setSuccessMsg('');
    setTotpSubmitting(true);
    setGeneratedRecoveryCodes([]);
    try {
      const res = await fetch('/api/auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: '2fa_setup_init' }),
      });
      const data = await res.json();
      if (!data.success) {
        throw new Error(data.error || '2FA kurulum anahtarı oluşturulamadı.');
      }
      setQrSvgUrl(data.qr_svg_data_url);
      setTotpSecret(data.secret);
      setOtpauthUri(data.otpauth_uri || '');
      setSetupMode(true);
    } catch (err: any) {
      setErrorMsg(err.message || '2FA kurulumu başlatılamadı.');
    } finally {
      setTotpSubmitting(false);
    }
  };

  const handleVerifyAndEnable2fa = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');
    setSuccessMsg('');

    if (!totpVerifyCode.trim() || totpVerifyCode.trim().length < 6) {
      setErrorMsg('Lütfen Google Authenticator uygulamasındaki 6 haneli doğrulama kodunu giriniz.');
      return;
    }
    if (!totpVerifyPassword.trim()) {
      setErrorMsg('İşlemi onaylamak için lütfen mevcut şifrenizi / PIN kodunuzu giriniz.');
      return;
    }

    setTotpSubmitting(true);
    try {
      const res = await fetch('/api/auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: '2fa_setup_verify',
          totp_code: totpVerifyCode.trim(),
          current_password: totpVerifyPassword.trim(),
        }),
      });
      const data = await res.json();
      if (!data.success) {
        throw new Error(data.error || 'Doğrulama başarısız oldu.');
      }

      setTotpEnabled(true);
      setTotpEnabledAt(data.totp_enabled_at || null);
      setGeneratedRecoveryCodes(data.recovery_codes || []);
      setRecoveryCodesCount((data.recovery_codes || []).length);
      setSetupMode(false);
      setTotpVerifyCode('');
      setTotpVerifyPassword('');
      setSuccessMsg(data.message || 'Google Authenticator (2FA) başarıyla etkinleştirildi!');
    } catch (err: any) {
      setErrorMsg(err.message || '2FA doğrulanamadı.');
    } finally {
      setTotpSubmitting(false);
    }
  };

  const handleDisable2fa = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');
    setSuccessMsg('');

    if (!disablePassword.trim() || !disableCode.trim()) {
      setErrorMsg('Lütfen mevcut yönetici şifrenizi ve 6 haneli Google Authenticator (veya kurtarma) kodunuzu giriniz.');
      return;
    }

    setTotpSubmitting(true);
    try {
      const res = await fetch('/api/auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: '2fa_disable',
          current_password: disablePassword.trim(),
          totp_code: disableCode.trim(),
        }),
      });
      const data = await res.json();
      if (!data.success) {
        throw new Error(data.error || '2FA devre dışı bırakılamadı.');
      }

      setTotpEnabled(false);
      setTotpEnabledAt(null);
      setRecoveryCodesCount(0);
      setGeneratedRecoveryCodes([]);
      setDisableMode(false);
      setDisableCode('');
      setDisablePassword('');
      setSuccessMsg('İki Faktörlü Doğrulama (2FA) devre dışı bırakıldı.');
    } catch (err: any) {
      setErrorMsg(err.message || '2FA kapatılamadı.');
    } finally {
      setTotpSubmitting(false);
    }
  };

  const handleCopySecret = () => {
    if (!totpSecret) return;
    copyTextSafe(totpSecret);
    setCopiedSecret(true);
    setTimeout(() => setCopiedSecret(false), 2000);
  };

  const handleCopyRecoveryCodes = () => {
    if (!generatedRecoveryCodes.length) return;
    copyTextSafe(generatedRecoveryCodes.join('\n'));
    setCopiedRecovery(true);
    setTimeout(() => setCopiedRecovery(false), 2000);
  };

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
      if (newPassword.trim().length < 8) {
        setErrorMsg('Yeni şifreniz en az 8 karakter uzunluğunda olmalı ve harf ile rakam içermelidir.');
        return;
      }
      if (!/[a-zA-ZçğıöşüÇĞİÖŞÜ]/.test(newPassword) || !/[0-9]/.test(newPassword)) {
        setErrorMsg('Yeni şifre en az bir harf ve bir rakam içermelidir.');
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
        setSecureItem('komur_user_name', data.user.ad_soyad);
        setSecureItem('komur_username', data.user.username);
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
        className="modal-sheet max-w-md w-full max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
        style={{ maxWidth: '460px' }}
      >
        {/* Header */}
        <div className="flex items-center justify-between pb-3 border-b border-slate-200 mb-4">
          <div className="flex items-center gap-2">
            <div
              className={`w-8 h-8 rounded-xl flex items-center justify-center ${
                userRole === 'ADMIN'
                  ? 'bg-amber-100 text-amber-700'
                  : userRole === 'MUDUR'
                  ? 'bg-purple-100 text-purple-700'
                  : 'bg-sky-100 text-sky-700'
              }`}
            >
              {userRole === 'ADMIN' ? (
                <Shield className="w-4 h-4" />
              ) : userRole === 'MUDUR' ? (
                <Building2 className="w-4 h-4" />
              ) : (
                <User className="w-4 h-4" />
              )}
            </div>
            <div>
              <h3 className="text-sm font-black text-slate-900 leading-tight">
                Hesap, Şifre & Güvenlik Yönetimi
              </h3>
              <p className="text-[11px] text-slate-500 font-semibold">
                {userRole === 'ADMIN'
                  ? 'Profil, şifre ve Google Authenticator (2FA) ayarları'
                  : userRole === 'MUDUR'
                  ? 'Müdür Yetkilisi profil ve şifre güncelleme'
                  : 'Kullanıcı adı ve şifre güncelleme'}
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
            <span
              className={`px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider ${
                userRole === 'ADMIN'
                  ? 'bg-amber-100 text-amber-900 border border-amber-300'
                  : userRole === 'MUDUR'
                  ? 'bg-purple-100 text-purple-900 border border-purple-300'
                  : 'bg-sky-100 text-sky-900 border border-sky-300'
              }`}
            >
              {userRole === 'ADMIN' ? 'Sistem Yöneticisi' : userRole === 'MUDUR' ? 'Müdür Yetkilisi' : 'Saha Personeli'}
            </span>
          </div>

          <div className="flex items-center gap-2 text-xs font-bold text-slate-700">
            <Smartphone className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
            <span>Bu cihazda tek aktif oturum (6 saat süreli) yetkilendirilmiştir.</span>
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

        {/* Newly Generated Recovery Codes Banner (Shown immediately after activating 2FA) */}
        {generatedRecoveryCodes.length > 0 && (
          <div className="p-3.5 rounded-2xl bg-amber-50 border-2 border-amber-300 mb-4 space-y-2.5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-black text-amber-950 flex items-center gap-1.5">
                <ShieldCheck className="w-4 h-4 text-amber-700" />
                Yedek Kurtarma Kodlarınız (Önemli!)
              </span>
              <button
                type="button"
                onClick={handleCopyRecoveryCodes}
                className="px-2 py-1 rounded-lg bg-white hover:bg-amber-100 text-amber-900 border border-amber-300 text-[10px] font-black flex items-center gap-1 transition-all"
              >
                <Copy className="w-3 h-3" />
                {copiedRecovery ? 'Kopyalandı!' : 'Tümünü Kopyala'}
              </button>
            </div>
            <p className="text-[11px] text-amber-900 font-medium leading-relaxed">
              Telefonunuza erişemediğiniz acil durumlarda bu tek kullanımlık kodlarla giriş yapabilirsiniz. Lütfen güvenli bir yere kaydedin:
            </p>
            <div className="grid grid-cols-2 gap-1.5">
              {generatedRecoveryCodes.map((code, idx) => (
                <div
                  key={idx}
                  className="px-2.5 py-1.5 rounded-lg bg-white border border-amber-200 font-mono text-xs font-black text-slate-900 text-center tracking-wider"
                >
                  {code}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* GOOGLE AUTHENTICATOR (2FA) SECTION */}
        <div
          className="p-3.5 rounded-2xl bg-gradient-to-br from-slate-900 to-slate-800 text-white mb-4 space-y-3 shadow-sm border border-slate-700"
            style={{ background: 'linear-gradient(135deg, #0f172a 0%, #1e293b 100%)', color: '#ffffff' }}
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-xl bg-amber-500/20 border border-amber-400/30 flex items-center justify-center text-amber-400">
                  <QrCode className="w-4 h-4" />
                </div>
                <div>
                  <h4 className="text-xs font-black tracking-wide text-white">
                    Google Authenticator (2FA)
                  </h4>
                  <p className="text-[10px] text-slate-300 font-medium">
                    {userRole === 'ADMIN' ? 'İki Faktörlü Yönetici Koruması' : 'İki Faktörlü Saha Personeli Koruması'}
                  </p>
                </div>
              </div>

              {loading2faStatus ? (
                <span className="text-[10px] text-slate-400 font-bold">Kontrol ediliyor...</span>
              ) : totpEnabled ? (
                <span className="px-2.5 py-1 rounded-full bg-emerald-500/20 border border-emerald-400/40 text-emerald-300 text-[10px] font-black uppercase tracking-wider flex items-center gap-1">
                  <ShieldCheck className="w-3 h-3" />
                  AKTİF
                </span>
              ) : (
                <span className="px-2.5 py-1 rounded-full bg-amber-500/20 border border-amber-400/40 text-amber-300 text-[10px] font-black uppercase tracking-wider">
                  KAPALI
                </span>
              )}
            </div>

            {/* State 1: 2FA Disabled & Not in Setup Mode */}
            {!totpEnabled && !setupMode && (
              <div className="space-y-2.5 pt-1">
                <p className="text-[11px] text-slate-300 leading-relaxed">
                  {userRole === 'ADMIN'
                    ? 'Yönetici hesabınızı en üst düzeyde korumak için telefonunuzdaki Google Authenticator uygulamasını tanımlayın.'
                    : 'Saha personeli hesabınız için Google Authenticator koruması. Eşleşmiş yetkili telefonunuzda 6 saatte bir kod istenir, gün boyu 6 saat dolana dek tekrar kod istemeden PIN ile hızlıca girebilirsiniz.'}
                </p>
                <button
                  type="button"
                  onClick={handleStart2faSetup}
                  disabled={totpSubmitting}
                  className="w-full py-2.5 px-3 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 text-xs font-black transition-all active:scale-95 flex items-center justify-center gap-1.5 shadow-xs"
                >
                  {totpSubmitting ? (
                    <>
                      <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                      <span>QR Kod Hazırlanıyor...</span>
                    </>
                  ) : (
                    <>
                      <QrCode className="w-4 h-4" />
                      <span>Google Authenticator (2FA) Tanımla / Aç</span>
                    </>
                  )}
                </button>
              </div>
            )}

            {/* State 2: 2FA Setup Mode (Show QR Code + Mobile Deep Link + Secret + Verification Input) */}
            {!totpEnabled && setupMode && (
              <div className="space-y-3 pt-2 border-t border-slate-700/80">
                <div className="text-[11px] text-slate-200 space-y-1 leading-relaxed">
                  <p>
                    <strong className="text-amber-400">1. Adım:</strong> Telefonunuzdan{' '}
                    <strong>Google Authenticator</strong> uygulamasını açıp aşağıdaki QR kodu okutun (veya telefondan
                    girdiyseniz doğrudan aşağıdaki butona dokunun):
                  </p>
                </div>

                {/* Offline SVG QR Code Box */}
                {qrSvgUrl && (
                  <div
                    className="flex flex-col items-center justify-center p-3 bg-white rounded-2xl mx-auto w-fit shadow-inner"
                    style={{ width: 'fit-content' }}
                  >
                    <Image unoptimized width={176} height={176}
                      src={qrSvgUrl}
                      alt="Google Authenticator QR Kodu"
                      className="w-44 h-44 object-contain"
                      style={{ width: '176px', height: '176px', objectFit: 'contain' }}
                    />
                  </div>
                )}

                {/* One-Tap Mobile Deep-Link Button for Same-Phone Setup */}
                {otpauthUri && (
                  <a
                    href={otpauthUri}
                    className="w-full py-2 px-3 rounded-xl bg-sky-500/20 hover:bg-sky-500/30 border border-sky-400/40 text-sky-200 text-xs font-black flex items-center justify-center gap-1.5 transition-all text-center"
                    style={{ textDecoration: 'none' }}
                  >
                    <Smartphone className="w-3.5 h-3.5 text-sky-300 shrink-0" />
                    <span>Bu Telefonda Authenticator Uygulamasında Aç</span>
                  </a>
                )}

                {/* Manual Secret Key Copy */}
                <div
                  className="p-2.5 rounded-xl bg-slate-950/70 border border-slate-700 space-y-1"
                  style={{ backgroundColor: 'rgba(2, 6, 23, 0.7)' }}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                      Manuel Kurulum Anahtarı:
                    </span>
                    <button
                      type="button"
                      onClick={handleCopySecret}
                      className="text-[10px] font-black text-amber-400 hover:text-amber-300 flex items-center gap-1"
                    >
                      <Copy className="w-3 h-3" />
                      {copiedSecret ? 'Kopyalandı!' : 'Anahtarı Kopyala'}
                    </button>
                  </div>
                  <div className="font-mono text-xs font-black text-amber-200 tracking-widest break-all select-all">
                    {totpSecret.replace(/(.{4})/g, '$1 ').trim()}
                  </div>
                </div>

                {/* Verify 6-Digit Code Form */}
                <div className="space-y-2.5 pt-1">
                  <div>
                    <label className="block text-[10px] font-black text-amber-300 uppercase tracking-wider mb-1">
                      2. Adım: Uygulamadaki 6 Haneli Doğrulama Kodu
                    </label>
                    <input
                      type="text"
                      inputMode="numeric"
                      autoComplete="one-time-code"
                      enterKeyHint="done"
                      maxLength={6}
                      value={totpVerifyCode}
                      onChange={(e) => setTotpVerifyCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                      placeholder="Örn: 123456"
                      className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-600 text-white text-center font-mono text-base font-black tracking-[0.35em] focus:outline-none focus:border-amber-400"
                      style={{ backgroundColor: '#020617', color: '#ffffff', letterSpacing: '0.35em' }}
                    />
                  </div>

                  <div>
                    <label className="block text-[10px] font-black text-slate-300 uppercase tracking-wider mb-1">
                      {userRole === 'ADMIN' ? 'Mevcut Yönetici Şifreniz' : 'Mevcut Şifreniz / PIN Kodunuz'}
                    </label>
                    <input
                      type="password"
                      autoComplete="current-password"
                      enterKeyHint="done"
                      value={totpVerifyPassword}
                      onChange={(e) => setTotpVerifyPassword(e.target.value)}
                      placeholder="Mevcut şifrenizi giriniz"
                      className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-600 text-white text-xs font-bold focus:outline-none focus:border-amber-400"
                      style={{ backgroundColor: '#020617', color: '#ffffff' }}
                    />
                  </div>

                  <div className="flex items-center gap-2 pt-1">
                    <button
                      type="button"
                      onClick={handleVerifyAndEnable2fa}
                      disabled={totpSubmitting}
                      className="flex-1 py-2.5 px-3 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 text-xs font-black transition-all active:scale-95 flex items-center justify-center gap-1.5"
                    >
                      {totpSubmitting ? (
                        <>
                          <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                          <span>Doğrulanıyor...</span>
                        </>
                      ) : (
                        <>
                          <ShieldCheck className="w-4 h-4" />
                          <span>Doğrula ve 2FA Aktif Et</span>
                        </>
                      )}
                    </button>
                    <button
                      type="button"
                      onClick={() => setSetupMode(false)}
                      disabled={totpSubmitting}
                      className="py-2.5 px-3 rounded-xl bg-slate-700 hover:bg-slate-600 text-slate-200 text-xs font-bold transition-all"
                    >
                      İptal
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* State 3: 2FA Enabled */}
            {totpEnabled && (
              <div className="space-y-2.5 pt-1 border-t border-slate-700/80">
                <div className="flex items-center justify-between text-[11px] text-slate-300">
                  <span>Kalan Yedek Kurtarma Kodu:</span>
                  <span className="font-black text-emerald-300">{recoveryCodesCount} Adet</span>
                </div>
                {totpEnabledAt && (
                  <div className="flex items-center justify-between text-[10px] text-slate-400">
                    <span>Etkinleştirme Tarihi:</span>
                    <span className="font-semibold text-slate-300">{formatTrAuto(totpEnabledAt)}</span>
                  </div>
                )}

                {!disableMode ? (
                  <button
                    type="button"
                    onClick={() => setDisableMode(true)}
                    className="w-full py-2 px-3 rounded-xl bg-rose-500/15 hover:bg-rose-500/25 border border-rose-400/30 text-rose-300 text-[11px] font-black transition-all flex items-center justify-center gap-1.5"
                  >
                    <ShieldOff className="w-3.5 h-3.5" />
                    <span>2FA Korumasını Devre Dışı Bırak</span>
                  </button>
                ) : (
                  <div
                    className="p-2.5 rounded-xl bg-slate-950/80 border border-rose-500/40 space-y-2"
                    style={{ backgroundColor: 'rgba(2, 6, 23, 0.85)' }}
                  >
                    <p className="text-[11px] text-rose-300 font-bold">
                      2FA korumasını kapatmak için şifrenizi ve güncel 6 haneli Google Authenticator (veya kurtarma) kodunuzu giriniz:
                    </p>
                    <input
                      type="password"
                      value={disablePassword}
                      onChange={(e) => setDisablePassword(e.target.value)}
                      placeholder={userRole === 'ADMIN' ? 'Mevcut Yönetici Şifreniz' : 'Mevcut Şifreniz / PIN'}
                      className="w-full px-2.5 py-1.5 rounded-lg bg-slate-900 border border-slate-700 text-white text-xs font-semibold focus:outline-none focus:border-rose-400"
                    />
                    <input
                      type="text"
                      value={disableCode}
                      onChange={(e) => setDisableCode(e.target.value)}
                      placeholder="6 Haneli 2FA Kodu veya Kurtarma Kodu"
                      className="w-full px-2.5 py-1.5 rounded-lg bg-slate-900 border border-slate-700 text-white text-xs font-mono font-bold tracking-wider focus:outline-none focus:border-rose-400"
                    />
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={handleDisable2fa}
                        disabled={totpSubmitting}
                        className="flex-1 py-2 px-3 rounded-lg bg-rose-600 hover:bg-rose-500 text-white text-xs font-black transition-all"
                      >
                        {totpSubmitting ? 'İşleniyor...' : 'Onayla ve 2FA Kapat'}
                      </button>
                      <button
                        type="button"
                        onClick={() => setDisableMode(false)}
                        className="py-2 px-3 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-bold"
                      >
                        Vazgeç
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

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
                Yeni Şifre{' '}
                <span className="text-slate-400 font-normal">(En az 8 karakter, harf ve rakam - opsiyonel)</span>
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

        {/* Sürüm & Cihaz Önbelleği Temizleme */}
        <div className="mt-3 pt-3 border-t border-slate-100 flex items-center justify-between gap-2 text-[11px] text-slate-500">
          <div className="flex items-center gap-1.5 font-medium truncate">
            <span className="w-2 h-2 rounded-full bg-emerald-500 inline-block shrink-0"></span>
            <span className="truncate">Sürüm: <strong>{appVersion || 'Güncel'}</strong></span>
          </div>
          <button
            type="button"
            onClick={handleManualCachePurge}
            disabled={isPurgingCache}
            className="text-[11px] font-bold text-amber-700 hover:text-amber-800 bg-amber-50 hover:bg-amber-100 border border-amber-200 px-2.5 py-1 rounded-lg flex items-center gap-1 transition-all active:scale-95 shrink-0"
            title="Eski önbelleği ve geçici verileri temizleyip sistemi yeniler. Oturumunuz ve bekleyen çevrimdışı teslimatlarınız korunur."
          >
            <RefreshCw className={`w-3 h-3 ${isPurgingCache ? 'animate-spin text-amber-600' : ''}`} />
            <span>{isPurgingCache ? 'Temizleniyor...' : 'Önbelleği Temizle & Yenile'}</span>
          </button>
        </div>

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

