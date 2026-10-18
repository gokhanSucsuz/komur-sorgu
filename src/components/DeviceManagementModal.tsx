'use client';

import { useState, useEffect } from 'react';
import { 
  Smartphone, Shield, QrCode, RefreshCw, Trash2, Key, Check, Copy, 
  AlertTriangle, Clock, CheckCircle2, X, Edit3, SmartphoneCharging, Lock
} from 'lucide-react';
import { showConfirm, showToast, showAlert } from './GlobalAlertManager';

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
      const sessionToken = typeof window !== 'undefined' ? (localStorage.getItem('komur_session_token') || '') : '';
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
      const sessionToken = typeof window !== 'undefined' ? (localStorage.getItem('komur_session_token') || '') : '';
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
      const sessionToken = typeof window !== 'undefined' ? (localStorage.getItem('komur_session_token') || '') : '';
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
      const sessionToken = typeof window !== 'undefined' ? (localStorage.getItem('komur_session_token') || '') : '';
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
      const sessionToken = typeof window !== 'undefined' ? (localStorage.getItem('komur_session_token') || '') : '';
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
      <div className="modal-sheet max-w-xl" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="flex items-center justify-between pb-3 border-b border-slate-200 mb-4">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-amber-500 to-indigo-600 text-white flex items-center justify-center shadow-sm">
              <Smartphone className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-base font-black text-slate-900">Yetkili 4 Mobil Cihaz Yönetimi</h3>
                <span className="text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-800 border border-emerald-200">
                  1 Admin + 3 Personel
                </span>
              </div>
              <p className="text-xs text-slate-500 font-medium">
                1 Yönetici Telefonu (Admin - Gökhan SUÇSUZ) + 3 Saha Personeli Telefonu olmak üzere toplam 4 mobil cihaz sisteme bağlanabilir. Bilgisayar erişimi yalnızca Admin&apos;e aittir.
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-700 p-1.5 rounded-lg text-sm transition-colors"
          >
            ✕
          </button>
        </div>

        {/* Security Rule Information Box */}
        <div className="p-3 rounded-2xl bg-slate-50 border border-slate-200 mb-4 text-xs space-y-1.5">
          <div className="flex items-center gap-2 font-black text-slate-800">
            <Shield className="w-4 h-4 text-indigo-600 shrink-0" />
            <span>Merkezi Güvenlik & Cihaz Eşleme Kuralları</span>
          </div>
          <ul className="text-slate-600 space-y-1 pl-5 list-disc text-[11px]">
            <li><b>Yönetici Cihazı (Slot 1):</b> Slot 1 özel olarak Yöneticiye (Admin - Gökhan SUÇSUZ) tahsis edilmiştir. Saha personelleri bu slotu kullanamaz. Admin telefondan giriş yaptığında telefonu otomatik olarak bu slota kilitlenir.</li>
            <li><b>Saha Personeli Telefonları (Slot 2, 3, 4):</b> Personeller şifrelerini bilseler dahi yalnızca Admin tarafından onaylanmış bu 3 telefondan sisteme girebilir.</li>
            <li><b>Bilgisayar Kısıtı:</b> Masaüstü / dizüstü bilgisayarlardan sisteme sadece Yönetici (Admin) giriş yapabilir; personeller bilgisayardan erişemez.</li>
            <li><b>Admin Tek Yetkili:</b> Telefon kaybolursa, arızalanırsa veya personel değişirse Admin dilediği slotu tek tıkla iptal edip yeni telefona kod üretebilir.</li>
          </ul>
        </div>

        {/* Active Activation Code / QR Display Card (if generated) */}
        {activeCodeData && (
          <div className="p-4 rounded-2xl bg-gradient-to-br from-indigo-50 via-purple-50 to-pink-50 border-2 border-indigo-300 shadow-md mb-4 animate-in fade-in">
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
              <div className="flex-1 space-y-2 text-center sm:text-left">
                <div>
                  <span className="text-[11px] font-bold text-indigo-900 uppercase tracking-wider block mb-1">
                    Telefon Ekranına Girilecek 6 Haneli Kod:
                  </span>
                  <div className="flex items-center justify-center sm:justify-start gap-2">
                    <span className="font-mono text-3xl font-black tracking-[0.2em] text-indigo-950 bg-white px-4 py-2 rounded-xl border-2 border-indigo-300 shadow-sm">
                      {activeCodeData.code && activeCodeData.code.length === 6
                        ? `${activeCodeData.code.slice(0, 3)} ${activeCodeData.code.slice(3)}`
                        : activeCodeData.code || '------'}
                    </span>
                    <button
                      onClick={() => copyToClipboard(activeCodeData.code)}
                      className="p-3 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white shadow-sm transition-all active:scale-95"
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
                    <span>Kod 15 dakika geçerlidir. Cihaz eşlendikten sonra token kalıcı olur.</span>
                  </p>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* 4 Device Slots List */}
        <div className="space-y-3 max-h-[380px] overflow-y-auto pr-0.5">
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
                  className={`p-3.5 rounded-2xl border transition-all ${
                    isAdminSlot
                      ? isPaired
                        ? 'bg-gradient-to-r from-amber-50/50 via-white to-amber-50/20 border-amber-300 shadow-xs ring-1 ring-amber-200'
                        : 'bg-amber-50/20 border-amber-200'
                      : isPaired
                        ? 'bg-white border-emerald-200 shadow-xs ring-1 ring-emerald-100'
                        : 'bg-slate-50/80 border-slate-200'
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    {/* Left: Slot Status & Info */}
                    <div className="flex items-start gap-3 min-w-0 flex-1">
                      <div
                        className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 shadow-2xs ${
                          isAdminSlot
                            ? isPaired
                              ? 'bg-amber-500 text-white'
                              : 'bg-amber-100 text-amber-800'
                            : isPaired
                              ? 'bg-emerald-500 text-white'
                              : 'bg-slate-200 text-slate-600'
                        }`}
                      >
                        <Smartphone className="w-5 h-5" />
                      </div>

                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          {editingSlotNo === slot.slot_no ? (
                            <div className="flex items-center gap-1.5">
                              <input
                                type="text"
                                value={editingName}
                                onChange={(e) => setEditingName(e.target.value)}
                                className="px-2 py-0.5 rounded-lg border border-indigo-400 text-xs font-bold text-slate-900 focus:outline-none"
                                autoFocus
                              />
                              <button
                                onClick={() => handleSaveName(slot.slot_no)}
                                className="p-1 rounded bg-indigo-600 text-white hover:bg-indigo-700 text-xs"
                              >
                                <Check className="w-3 h-3" />
                              </button>
                              <button
                                onClick={() => setEditingSlotNo(null)}
                                className="p-1 rounded bg-slate-200 text-slate-600 text-xs"
                              >
                                ✕
                              </button>
                            </div>
                          ) : (
                            <>
                              <span className="text-sm font-black text-slate-900 truncate">
                                {slot.slot_name}
                              </span>
                              <button
                                onClick={() => {
                                  setEditingSlotNo(slot.slot_no);
                                  setEditingName(slot.slot_name);
                                }}
                                className="text-slate-400 hover:text-slate-700"
                                title="İsmi Düzenle"
                              >
                                <Edit3 className="w-3 h-3" />
                              </button>
                            </>
                          )}

                          {isAdminSlot ? (
                            <span className="text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full bg-amber-100 text-amber-900 border border-amber-300">
                              👑 Yönetici Cihazı
                            </span>
                          ) : (
                            <span className="text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full bg-sky-50 text-sky-800 border border-sky-300">
                              📱 Saha Personeli
                            </span>
                          )}

                          <span
                            className={`text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full border ${
                              isPaired
                                ? isAdminSlot
                                  ? 'bg-amber-100 text-amber-900 border-amber-400'
                                  : 'bg-emerald-50 text-emerald-800 border-emerald-300'
                                : 'bg-slate-100 text-slate-700 border-slate-300'
                            }`}
                          >
                            {isPaired ? '✓ Eşlendi & Aktif' : 'Eşleme Bekliyor'}
                          </span>
                        </div>

                        {/* Device details if paired */}
                        {isPaired ? (
                          <div className="text-xs text-slate-600 mt-1 space-y-0.5">
                            <p className="font-semibold text-slate-800 truncate flex items-center gap-1">
                              <span>📱 Cihaz:</span>
                              <span className="font-mono text-emerald-900">{slot.device_model || 'Mobil Cihaz'}</span>
                            </p>
                            <div className="flex items-center gap-2 text-[11px] text-slate-500 flex-wrap">
                              <span>Eşleşme: {slot.paired_at ? new Date(slot.paired_at).toLocaleDateString('tr-TR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '-'}</span>
                              {slot.last_used_at && (
                                <>
                                  <span>•</span>
                                  <span>Son Giriş: {new Date(slot.last_used_at).toLocaleDateString('tr-TR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}</span>
                                </>
                              )}
                              {slot.last_personel && (
                                <>
                                  <span>•</span>
                                  <span className="font-bold text-slate-700">Son Kullanıcı: {slot.last_personel}</span>
                                </>
                              )}
                            </div>
                          </div>
                        ) : (
                          <p className="text-xs text-slate-500 mt-1">
                            {isAdminSlot
                              ? 'Bu slot boştur. Yönetici telefonundan sisteme giriş yaptığında bu telefon otomatik eşlenir veya aşağıdaki butonla doğrudan eşleyebilirsiniz.'
                              : 'Bu slot boş durumdadır. Saha personelinin telefonunu eşlemek için aktivasyon kodu üretiniz.'}
                          </p>
                        )}
                      </div>
                    </div>

                    {/* Right: Action Buttons */}
                    <div className="flex items-center gap-1.5 shrink-0 flex-wrap justify-end">
                      {isAdminSlot && isMobileDevice && (
                        <button
                          onClick={handlePairAdminCurrentPhone}
                          disabled={isBusy}
                          className="px-2.5 py-1.5 rounded-xl bg-amber-500 hover:bg-amber-600 text-white text-xs font-bold transition-all active:scale-95 flex items-center gap-1 shadow-sm"
                          title="Kullandığınız bu telefonu Yönetici Cihazı olarak eşleyin"
                        >
                          <Smartphone className="w-3.5 h-3.5 text-white" />
                          <span>Bu Telefonu Eşle</span>
                        </button>
                      )}

                      {isPaired ? (
                        <>
                          <button
                            onClick={() => handleGenerateCode(slot)}
                            disabled={isBusy}
                            className="px-2.5 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold transition-all active:scale-95 flex items-center gap-1 border border-slate-200"
                            title="Yeni Telefonla Değiştir / Yeniden Kod Üret"
                          >
                            <RefreshCw className={`w-3.5 h-3.5 ${isBusy ? 'animate-spin' : ''}`} />
                            <span className="hidden sm:inline">Yeniden Eşle</span>
                          </button>
                          <button
                            onClick={() => handleRevokeDevice(slot)}
                            disabled={isBusy}
                            className="px-2.5 py-1.5 rounded-xl bg-rose-50 hover:bg-rose-100 text-rose-700 text-xs font-bold transition-all active:scale-95 flex items-center gap-1 border border-rose-200"
                            title="Cihazın Yetkisini Kaldır"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                            <span className="hidden sm:inline">Yetkiyi İptal Et</span>
                          </button>
                        </>
                      ) : (
                        <button
                          onClick={() => handleGenerateCode(slot)}
                          disabled={isBusy}
                          className="px-3 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold transition-all active:scale-95 flex items-center gap-1.5 shadow-sm"
                        >
                          <QrCode className={`w-3.5 h-3.5 ${isBusy ? 'animate-spin' : ''}`} />
                          <span>Kod & QR Üret</span>
                        </button>
                      )}
                    </div>
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
