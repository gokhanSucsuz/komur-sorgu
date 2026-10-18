'use client';

import { useState, useEffect } from 'react';
import { 
  Smartphone, Shield, QrCode, RefreshCw, Trash2, Key, Check, Copy, 
  AlertTriangle, Clock, CheckCircle2, X, Edit3, SmartphoneCharging, Lock
} from 'lucide-react';
import { showConfirm, showToast, showAlert } from './GlobalAlertManager';
import { getSecureItem, setSecureItem } from '@/lib/secureStorage';

interface DeviceSlot {
  slot_no: number;
  slot_name: string;
  durum: 'BEKLIYOR' | 'AKTIF';
  device_model?: string | null;
  paired_at?: string | null;
  last_used_at?: string | null;
  last_personel?: string | null;
  has_active_code?: boolean;
  code_expires_at?: string | null;
}

interface DeviceManagementModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function DeviceManagementModal({ isOpen, onClose }: DeviceManagementModalProps) {
  const [slots, setSlots] = useState<DeviceSlot[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [activeCodeData, setActiveCodeData] = useState<{
    slot_no: number;
    slot_name: string;
    code: string;
    expires_at: string;
    qr_code_svg?: string;
  } | null>(null);

  const [editingSlotNo, setEditingSlotNo] = useState<number | null>(null);
  const [editingName, setEditingName] = useState('');
  const [copiedCode, setCopiedCode] = useState(false);
  const [actionLoading, setActionLoading] = useState<number | null>(null);

  const fetchSlots = async () => {
    setIsLoading(true);
    try {
      const sessionToken = typeof window !== 'undefined' ? (getSecureItem('komur_session_token') || '') : '';
      const res = await fetch('/api/devices', {
        headers: { 'x-session-token': sessionToken }
      });
      const data = await res.json();
      if (data.success && Array.isArray(data.slots)) {
        setSlots(data.slots);
      }
    } catch (err) {
      console.error('Error fetching device slots:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      fetchSlots();
      setActiveCodeData(null);
      setEditingSlotNo(null);
    }
  }, [isOpen]);

  const [isMobileDevice, setIsMobileDevice] = useState(false);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      setIsMobileDevice(/android|iphone|ipad|ipod|mobile/i.test(navigator.userAgent));
    }
  }, []);

  const handlePairAdminCurrentPhone = async () => {
    const confirmed = await showConfirm({
      title: 'Yönetici Telefonunu Eşle',
      message: 'Kullandığınız bu telefonu "1. Yönetici Telefonu (Admin - Gökhan SUÇSUZ)" olarak sisteme eşlemek istediğinize emin misiniz?\n\nBu işlemden sonra bu telefon sistemde tek yetkili Yönetici Cihazı olarak kilitlenecektir.',
      type: 'info',
      confirmText: 'Evet, Bu Telefonu Eşle',
      cancelText: 'Vazgeç',
    });

    if (!confirmed) return;

    setActionLoading(1);
    try {
      const sessionToken = typeof window !== 'undefined' ? (getSecureItem('komur_session_token') || '') : '';
      const res = await fetch('/api/devices', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-session-token': sessionToken,
        },
        body: JSON.stringify({
          action: 'PAIR_ADMIN_CURRENT_DEVICE',
          device_model: typeof navigator !== 'undefined' ? navigator.userAgent.substring(0, 100) : 'Yönetici Telefonu',
        }),
      });

      const data = await res.json();
      if (!data.success) {
        throw new Error(data.error || 'Cihaz eşlenemedi');
      }

      if (data.device_token && typeof window !== 'undefined') {
        localStorage.setItem('komur_device_token', data.device_token);
      }

      showToast({
        type: 'success',
        title: 'Yönetici Telefonu Eşlendi',
        message: 'Bu telefon başarıyla 1. Yönetici Telefonu olarak sisteme kilitlendi.',
      });

      fetchSlots();
    } catch (err: any) {
      showAlert({
        title: 'Hata',
        message: err.message || 'Cihaz eşlenirken hata oluştu',
        type: 'error',
      });
    } finally {
      setActionLoading(null);
    }
  };

  const handleGenerateCode = async (slot: DeviceSlot) => {
    setActionLoading(slot.slot_no);
    try {
      const sessionToken = typeof window !== 'undefined' ? (getSecureItem('komur_session_token') || '') : '';
      const res = await fetch('/api/devices', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-session-token': sessionToken,
        },
        body: JSON.stringify({
          action: 'GENERATE_ACTIVATION_CODE',
          slot_no: slot.slot_no,
        }),
      });

      const data = await res.json();
      if (!data.success) {
        throw new Error(data.error || 'Aktivasyon kodu üretilemedi');
      }

      const returnedCode = String(data.activation_code || data.code || '').trim();
      const returnedQr = data.qr_code_svg || data.qr_svg || '';
      const returnedName = data.slot_name || slot.slot_name || `${slot.slot_no}. Saha Dağıtım Telefonu`;

      setActiveCodeData({
        slot_no: data.slot_no || slot.slot_no,
        slot_name: returnedName,
        code: returnedCode,
        expires_at: data.expires_at || '',
        qr_code_svg: returnedQr,
      });

      showToast({
        type: 'success',
        title: 'Aktivasyon Kodu Hazır',
        message: `${returnedName} için 6 haneli eşleme kodu üretildi. (Geçerlilik: 15 dakika)`,
      });

      fetchSlots();
    } catch (err: any) {
      showAlert({
        title: 'Hata',
        message: err.message || 'Kod üretilirken hata oluştu',
        type: 'error',
      });
    } finally {
      setActionLoading(null);
    }
  };

  const handleRevokeDevice = async (slot: DeviceSlot) => {
    const confirmed = await showConfirm({
      title: 'Cihaz Yetkisini İptal Et',
      message: `"${slot.slot_name}" slotundaki eşlenmiş cihazın yetkisini kaldırmak istediğinize emin misiniz?\n\nBu telefondan artık personel girişi yapılamayacak ve yeni bir cihaz eşlemek için yeniden kod üretilmesi gerekecektir.`,
      type: 'warning',
      confirmText: 'Evet, Yetkiyi İptal Et',
      cancelText: 'Vazgeç',
    });

    if (!confirmed) return;

    setActionLoading(slot.slot_no);
    try {
      const sessionToken = typeof window !== 'undefined' ? (getSecureItem('komur_session_token') || '') : '';
      const res = await fetch('/api/devices', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-session-token': sessionToken,
        },
        body: JSON.stringify({
          action: 'REVOKE_DEVICE',
          slot_no: slot.slot_no,
        }),
      });

      const data = await res.json();
      if (!data.success) {
        throw new Error(data.error || 'Yetki kaldırılamadı');
      }

      showToast({
        type: 'success',
        title: 'Yetki İptal Edildi',
        message: `${slot.slot_name} başarıyla sıfırlandı. Yeni cihaz eşlemesi için boş durumdadır.`,
      });

      if (activeCodeData?.slot_no === slot.slot_no) {
        setActiveCodeData(null);
      }

      fetchSlots();
    } catch (err: any) {
      showAlert({
        title: 'Hata',
        message: err.message || 'İşlem sırasında hata oluştu',
        type: 'error',
      });
    } finally {
      setActionLoading(null);
    }
  };

  const handleSaveName = async (slotNo: number) => {
    if (!editingName.trim()) return;
    try {
      const sessionToken = typeof window !== 'undefined' ? (getSecureItem('komur_session_token') || '') : '';
      const res = await fetch('/api/devices', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-session-token': sessionToken,
        },
        body: JSON.stringify({
          action: 'RENAME_SLOT',
          slot_no: slotNo,
          slot_name: editingName.trim(),
        }),
      });

      const data = await res.json();
      if (!data.success) throw new Error(data.error || 'İsim güncellenemedi');

      setEditingSlotNo(null);
      fetchSlots();
    } catch (err: any) {
      showAlert({
        title: 'Hata',
        message: err.message || 'Slot ismi kaydedilemedi',
        type: 'error',
      });
    }
  };

  const copyToClipboard = (text: string) => {
    if (typeof navigator !== 'undefined' && navigator.clipboard) {
      navigator.clipboard.writeText(text);
      setCopiedCode(true);
      setTimeout(() => setCopiedCode(false), 2000);
      showToast({
        type: 'info',
        title: 'Kopyalandı',
        message: 'Aktivasyon kodu panoya kopyalandı.',
      });
    }
  };

  if (!isOpen) return null;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-sheet max-w-xl !p-4 sm:!p-6" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="flex items-center justify-between pb-3 border-b border-slate-200 mb-3.5">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-indigo-600 text-white flex items-center justify-center shadow-sm shrink-0">
              <Smartphone className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h3 className="text-sm sm:text-base font-black text-slate-900 leading-tight">Yetkili 4 Mobil Cihaz Yönetimi</h3>
                <span className="text-[9px] sm:text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-800 border border-emerald-200">
                  1 Admin + 3 Personel
                </span>
              </div>
              <p className="text-[11px] sm:text-xs text-slate-500 font-medium mt-0.5">
                1 Yönetici Telefonu + 3 Saha Personeli Telefonu sisteme bağlanabilir. Bilgisayar erişimi yalnızca Admin&apos;e aittir.
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-700 p-1.5 rounded-lg text-sm transition-colors shrink-0"
          >
            ✕
          </button>
        </div>

        {/* Security Rule Information Box */}
        <div className="p-2.5 sm:p-3 rounded-2xl bg-slate-50 border border-slate-200 mb-3 text-xs space-y-1">
          <div className="flex items-center gap-2 font-black text-slate-800">
            <Shield className="w-4 h-4 text-indigo-600 shrink-0" />
            <span>Merkezi Güvenlik & Cihaz Eşleme Kuralları</span>
          </div>
          <ul className="text-slate-600 space-y-1 pl-4 list-disc text-[11px] leading-relaxed">
            <li><b>Yönetici Cihazı (Slot 1):</b> Admin giriş yaptığında bu telefon otomatik eşlenir. Saha personeli bu slotu kullanamaz.</li>
            <li><b>Saha Telefonları (Slot 2, 3, 4):</b> Personeller yalnızca Admin onaylı bu 3 telefondan giriş yapabilir.</li>
            <li><b>Bilgisayar Kısıtı:</b> Bilgisayarlardan sisteme sadece Yönetici (Admin) giriş yapabilir.</li>
          </ul>
        </div>

        {/* Active Activation Code / QR Display Card (if generated) */}
        {activeCodeData && (
          <div className="p-3.5 sm:p-4 rounded-2xl bg-indigo-50/80 border-2 border-indigo-200 shadow-sm mb-4 animate-in fade-in">
            <div className="flex items-center justify-between pb-2 border-b border-indigo-100 mb-3">
              <div className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-ping" />
                <span className="text-xs font-black uppercase tracking-wider text-indigo-900">
                  {activeCodeData.slot_name} - Eşleme Kodu Aktif
                </span>
              </div>
              <button
                onClick={() => setActiveCodeData(null)}
                className="text-xs font-bold text-slate-400 hover:text-slate-700"
              >
                ✕ Kapat
              </button>
            </div>

            <div className="flex flex-col sm:flex-row items-center gap-4">
              {/* QR Code */}
              {activeCodeData.qr_code_svg && (
                <div className="p-2.5 bg-white rounded-2xl border-2 border-indigo-200 shadow-sm shrink-0 flex flex-col items-center">
                  <img
                    src={activeCodeData.qr_code_svg}
                    alt="Aktivasyon QR Kodu"
                    className="w-36 h-36 rounded-xl block"
                    style={{ minWidth: '144px', minHeight: '144px' }}
                  />
                  <p className="text-[10px] text-center font-bold text-slate-600 mt-1.5">Telefon Kamerasıyla Okutun</p>
                </div>
              )}

              {/* 6-Digit Code & Instructions */}
              <div className="flex-1 space-y-2 text-center sm:text-left w-full">
                <div>
                  <span className="text-[11px] font-bold text-indigo-900 uppercase tracking-wider block mb-1">
                    Telefon Ekranına Girilecek 6 Haneli Kod:
                  </span>
                  <div className="flex items-center justify-center sm:justify-start gap-2">
                    <span className="font-mono text-2xl sm:text-3xl font-black tracking-[0.2em] text-indigo-950 bg-white px-4 py-2 rounded-xl border-2 border-indigo-300 shadow-sm">
                      {activeCodeData.code && activeCodeData.code.length === 6
                        ? `${activeCodeData.code.slice(0, 3)} ${activeCodeData.code.slice(3)}`
                        : activeCodeData.code || '------'}
                    </span>
                    <button
                      onClick={() => copyToClipboard(activeCodeData.code)}
                      className="p-3 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white shadow-sm transition-all active:scale-95 shrink-0"
                      title="Kodu Kopyala"
                    >
                      {copiedCode ? <Check className="w-4 h-4 text-white" /> : <Copy className="w-4 h-4 text-white" />}
                    </button>
                  </div>
                </div>

                <div className="text-[11px] text-slate-600 space-y-0.5">
                  <p className="font-semibold text-indigo-950">Nasıl Eşlenir?</p>
                  <p>1. Yetkilendirilecek telefondan sisteme girip <b>&quot;Cihazı Eşle&quot;</b> butonuna basınız.</p>
                  <p>2. Bu 6 haneli kodu giriniz veya kamerayla QR kodu taratınız.</p>
                  <p className="text-[10px] text-amber-700 font-bold flex items-center gap-1 pt-0.5">
                    <Clock className="w-3 h-3" />
                    <span>Kod 15 dakika geçerlidir. Eşlendikten sonra cihaz yetkisi kalıcı olur.</span>
                  </p>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* 4 Device Slots List */}
        <div className="space-y-3 max-h-[60vh] sm:max-h-[420px] overflow-y-auto pr-0.5">
          {isLoading ? (
            <div className="p-8 text-center text-xs text-slate-500 flex flex-col items-center gap-2">
              <RefreshCw className="w-5 h-5 animate-spin text-indigo-600" />
              <span>Yetkili cihaz slotları kontrol ediliyor...</span>
            </div>
          ) : (
            slots.map((slot) => {
              const isAdminSlot = slot.slot_no === 1;
              const isPaired = slot.durum === 'AKTIF';
              const isBusy = actionLoading === slot.slot_no;

              return (
                <div
                  key={slot.slot_no}
                  className={`p-3.5 sm:p-4 rounded-2xl border transition-all ${
                    isAdminSlot
                      ? isPaired
                        ? 'bg-amber-50/40 border-amber-300 shadow-xs ring-1 ring-amber-200/60'
                        : 'bg-white border-amber-200 shadow-xs'
                      : isPaired
                        ? 'bg-emerald-50/30 border-emerald-300 shadow-xs ring-1 ring-emerald-200/60'
                        : 'bg-white border-slate-200 shadow-xs'
                  }`}
                >
                  {/* TOP ROW: Icon + Title & Badges */}
                  <div className="flex items-start gap-3">
                    <div
                      className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 shadow-2xs ${
                        isAdminSlot
                          ? isPaired
                            ? 'bg-amber-500 text-white'
                            : 'bg-amber-100 text-amber-800 border border-amber-300'
                          : isPaired
                            ? 'bg-emerald-500 text-white'
                            : 'bg-slate-100 text-slate-600 border border-slate-200'
                      }`}
                    >
                      <Smartphone className="w-5 h-5" />
                    </div>

                    <div className="min-w-0 flex-1">
                      {/* Title & Edit */}
                      <div className="flex items-center gap-1.5 flex-wrap">
                        {editingSlotNo === slot.slot_no ? (
                          <div className="flex items-center gap-1.5 w-full my-1">
                            <input
                              type="text"
                              value={editingName}
                              onChange={(e) => setEditingName(e.target.value)}
                              className="flex-1 px-2.5 py-1 rounded-lg border border-indigo-400 text-xs font-bold text-slate-900 focus:outline-none bg-white"
                              autoFocus
                            />
                            <button
                              onClick={() => handleSaveName(slot.slot_no)}
                              className="p-1.5 rounded-lg bg-indigo-600 text-white hover:bg-indigo-700 text-xs shrink-0"
                              title="Kaydet"
                            >
                              <Check className="w-3.5 h-3.5" />
                            </button>
                            <button
                              onClick={() => setEditingSlotNo(null)}
                              className="p-1.5 rounded-lg bg-slate-200 text-slate-700 text-xs shrink-0"
                              title="Vazgeç"
                            >
                              <X className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        ) : (
                          <div className="flex items-center gap-1.5 w-full">
                            <h4 className="text-xs sm:text-sm font-black text-slate-900 leading-snug break-words flex-1">
                              {slot.slot_name}
                            </h4>
                            <button
                              onClick={() => {
                                setEditingSlotNo(slot.slot_no);
                                setEditingName(slot.slot_name);
                              }}
                              className="text-slate-400 hover:text-slate-700 p-1 rounded-md hover:bg-slate-100 transition-colors shrink-0"
                              title="İsmi Düzenle"
                            >
                              <Edit3 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        )}
                      </div>

                      {/* Badges Row */}
                      <div className="flex items-center gap-1.5 flex-wrap mt-1">
                        {isAdminSlot ? (
                          <span className="text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded-md bg-amber-100 text-amber-950 border border-amber-300">
                            👑 Yönetici Slotu
                          </span>
                        ) : (
                          <span className="text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded-md bg-sky-100 text-sky-950 border border-sky-300">
                            📱 Saha Personeli
                          </span>
                        )}

                        <span
                          className={`text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded-md border ${
                            isPaired
                              ? isAdminSlot
                                ? 'bg-amber-100/90 text-amber-950 border-amber-400 font-bold'
                                : 'bg-emerald-50 text-emerald-900 border-emerald-300 font-bold'
                              : 'bg-slate-100 text-slate-600 border-slate-200'
                          }`}
                        >
                          {isPaired ? '✓ Eşlendi & Aktif' : 'Eşleme Bekliyor'}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* MIDDLE ROW: Device details or pending info (Full Width) */}
                  <div className="mt-2.5 pt-2 border-t border-slate-100 text-xs">
                    {isPaired ? (
                      <div className="bg-white/80 p-2.5 rounded-xl border border-slate-200/80 space-y-1.5 text-[11px] text-slate-700">
                        <div className="flex items-center gap-1.5 text-slate-800">
                          <Smartphone className="w-3.5 h-3.5 text-slate-500 shrink-0" />
                          <span className="font-semibold text-slate-500">Cihaz:</span>
                          <span className="font-mono font-bold text-slate-900 truncate flex-1">
                            {slot.device_model || 'Mobil Cihaz'}
                          </span>
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-1 pt-1 text-slate-600 border-t border-slate-100">
                          <div>
                            <span className="text-slate-400">Eşleşme: </span>
                            <span className="font-medium text-slate-700">
                              {slot.paired_at ? new Date(slot.paired_at).toLocaleDateString('tr-TR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '-'}
                            </span>
                          </div>
                          {slot.last_used_at && (
                            <div>
                              <span className="text-slate-400">Son Giriş: </span>
                              <span className="font-medium text-slate-700">
                                {new Date(slot.last_used_at).toLocaleDateString('tr-TR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
                              </span>
                            </div>
                          )}
                          {slot.last_personel && (
                            <div className="col-span-1 sm:col-span-2">
                              <span className="text-slate-400">Son Kullanıcı: </span>
                              <span className="font-bold text-slate-800">{slot.last_personel}</span>
                            </div>
                          )}
                        </div>
                      </div>
                    ) : (
                      <p className="text-[11px] text-slate-500 bg-slate-50 p-2.5 rounded-xl border border-slate-200/60 leading-relaxed">
                        {isAdminSlot
                          ? 'Bu slot boştur. Yönetici (Gökhan SUÇSUZ) telefonundan sisteme giriş yaptığında bu cihaz otomatik eşlenir veya aşağıdaki butonla doğrudan eşleyebilirsiniz.'
                          : 'Bu slot boş durumdadır. Saha personelinin telefonunu sisteme bağlamak için aktivasyon kodu veya QR üretiniz.'}
                      </p>
                    )}
                  </div>

                  {/* BOTTOM ROW: Action Buttons (Ergonomic full-width or auto flex) */}
                  <div className="mt-2.5 pt-2 border-t border-slate-100 flex items-center gap-2 flex-wrap">
                    {isAdminSlot && isMobileDevice && !isPaired && (
                      <button
                        onClick={handlePairAdminCurrentPhone}
                        disabled={isBusy}
                        className="w-full py-2.5 px-4 rounded-xl bg-amber-500 hover:bg-amber-600 text-white text-xs font-black transition-all active:scale-95 flex items-center justify-center gap-2 shadow-sm"
                        title="Kullandığınız bu telefonu Yönetici Cihazı olarak eşleyin"
                      >
                        <Smartphone className="w-4 h-4 text-white" />
                        <span>Bu Telefonu Yönetici Cihazı Olarak Eşle</span>
                      </button>
                    )}

                    {isPaired ? (
                      <>
                        <button
                          onClick={() => handleGenerateCode(slot)}
                          disabled={isBusy}
                          className="flex-1 min-w-[120px] py-2 px-3 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold transition-all active:scale-95 flex items-center justify-center gap-1.5 border border-slate-200"
                          title="Yeni Telefonla Değiştir / Yeniden Kod Üret"
                        >
                          <RefreshCw className={`w-3.5 h-3.5 ${isBusy ? 'animate-spin' : ''}`} />
                          <span>Yeniden Eşle</span>
                        </button>
                        <button
                          onClick={() => handleRevokeDevice(slot)}
                          disabled={isBusy}
                          className="flex-1 min-w-[120px] py-2 px-3 rounded-xl bg-rose-50 hover:bg-rose-100 text-rose-700 text-xs font-bold transition-all active:scale-95 flex items-center justify-center gap-1.5 border border-rose-200"
                          title="Cihazın Yetkisini Kaldır"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                          <span>Yetkiyi İptal Et</span>
                        </button>
                      </>
                    ) : (
                      <button
                        onClick={() => handleGenerateCode(slot)}
                        disabled={isBusy}
                        className="w-full py-2.5 px-4 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold transition-all active:scale-95 flex items-center justify-center gap-2 shadow-sm"
                      >
                        <QrCode className={`w-4 h-4 ${isBusy ? 'animate-spin' : ''}`} />
                        <span>Aktivasyon Kodu & QR Üret</span>
                      </button>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Footer */}
        <div className="pt-4 border-t border-slate-200 mt-4 flex items-center justify-between">
          <div className="flex items-center gap-1 text-[11px] text-slate-500">
            <Lock className="w-3.5 h-3.5 text-slate-400" />
            <span>Kriptografik SHA-256 donanım token kilit sistemi</span>
          </div>
          <button onClick={onClose} className="btn-secondary py-2 px-5 text-xs font-bold">
            Kapat
          </button>
        </div>
      </div>
    </div>
  );
}
