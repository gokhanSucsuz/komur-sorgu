'use client';

import { useState } from 'react';
import { Target, CheckCircle2, AlertCircle, X, ShieldAlert } from 'lucide-react';
import { showConfirm, showToast } from './GlobalAlertManager';

interface QuotaModalProps {
  currentQuota: number;
  onClose: () => void;
  onSuccess: () => void;
}

export default function QuotaModal({
  currentQuota,
  onClose,
  onSuccess
}: QuotaModalProps) {
  const [quotaVal, setQuotaVal] = useState<number>(currentQuota || 34);
  const [updateExisting, setUpdateExisting] = useState<boolean>(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (quotaVal <= 0) {
      setErrorMsg('Geçerli bir torba sayısı giriniz');
      return;
    }

    // Yanlışlıkla basılmaları önlemek için zorunlu kullanıcı onayı
    const confirmed = await showConfirm({
      title: 'Hane Kömür Kotasını Değiştir',
      message: `Hane başı kömür dağıtım kotasını ${currentQuota || 34} torbadan ${quotaVal} torbaya (${(quotaVal * 25).toLocaleString('tr-TR')} kg / hane) güncellemek istediğinize emin misiniz?${
        updateExisting
          ? '\n\n⚠️ Dikkat: Mevcut bekleyen ve eksik teslimatlı tüm hanelerin hedef kotası da güncellenecektir.'
          : '\n\nℹ️ Not: Sadece bundan sonra eklenecek yeni haneler bu kotayı alacaktır.'
      }`,
      type: 'warning',
      confirmText: 'Evet, Kotayı Güncelle',
      cancelText: 'Vazgeç',
    });
    if (!confirmed) return;

    setIsSubmitting(true);
    setErrorMsg('');

    try {
      const res = await fetch('/api/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          varsayilan_hedef_torba: quotaVal,
          updateExisting
        })
      });

      const data = await res.json();
      if (!data.success) {
        throw new Error(data.error || 'Ayar kaydedilemedi');
      }

      showToast({
        type: 'success',
        title: 'Kota Başarıyla Güncellendi',
        message: `Hane kömür kotası ${quotaVal} torba olarak kaydedildi.`
      });

      onSuccess();
      onClose();
    } catch (err: any) {
      setErrorMsg(err.message || 'Bağlantı hatası');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-sheet" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between pb-3 border-b border-slate-200 mb-4">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-amber-100 text-amber-800 flex items-center justify-center border border-amber-200">
              <Target className="w-5 h-5 text-amber-700" />
            </div>
            <div>
              <h3 className="text-base font-extrabold text-slate-900">Hane Kömür Kotası Belirle</h3>
              <p className="text-xs text-slate-500">Tüm liste için geçerli dağıtım hedefi</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-700 p-1 rounded-lg text-sm"
          >
            ✕
          </button>
        </div>

        {errorMsg && (
          <div className="p-3 mb-4 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs flex items-center gap-2 font-medium">
            <AlertCircle className="w-4 h-4 shrink-0 text-rose-600" />
            <span>{errorMsg}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-bold text-slate-600 uppercase tracking-wider mb-2">
              Her Haneye Dağıtılacak Torba Sayısı
            </label>
            <div className="relative">
              <input
                type="number"
                min="1"
                max="200"
                value={quotaVal}
                onChange={(e) => setQuotaVal(parseInt(e.target.value, 10) || 1)}
                className="w-full px-4 py-3.5 rounded-2xl bg-slate-50 border-2 border-amber-300 text-slate-900 font-black text-3xl tracking-tight focus:outline-none focus:border-amber-500 focus:bg-white text-center shadow-xs"
                required
              />
              <span className="absolute right-4 top-4 text-xs font-bold text-slate-500">
                Torba / Hane
              </span>
            </div>

            <div className="flex justify-between items-center text-xs text-slate-500 mt-2 px-1">
              <span>Ağırlık Karşılığı:</span>
              <span className="font-bold text-amber-800">
                ≈ {(quotaVal * 25).toLocaleString('tr-TR')} kg ({(quotaVal * 0.025).toFixed(3)} Ton)
              </span>
            </div>

            {/* Quick Presets */}
            <div className="flex gap-2 mt-3">
              {[20, 25, 30, 34, 40].map((val) => (
                <button
                  key={val}
                  type="button"
                  onClick={() => setQuotaVal(val)}
                  className={`flex-1 py-1.5 rounded-xl text-xs font-extrabold border transition-all ${
                    quotaVal === val
                      ? 'bg-amber-500 border-amber-600 text-white shadow-xs'
                      : 'bg-white border-slate-300 text-slate-700 hover:bg-slate-50'
                  }`}
                >
                  {val}
                </button>
              ))}
            </div>
          </div>

          {/* Update existing checkbox */}
          <div className="p-3 rounded-xl bg-slate-50 border border-slate-200 space-y-1">
            <label className="flex items-center gap-2 cursor-pointer text-xs text-slate-800 font-semibold">
              <input
                type="checkbox"
                checked={updateExisting}
                onChange={(e) => setUpdateExisting(e.target.checked)}
                className="w-4 h-4 rounded text-amber-600 focus:ring-0"
              />
              <span>Mevcut bekleyen hanelerin hedefini de bu sayıya güncelle</span>
            </label>
            <p className="text-[11px] text-slate-500 pl-6 leading-relaxed">
              Önceden daha az torba almış haneler otomatik olarak <strong>&ldquo;Eksik Teslimat&rdquo;</strong> durumuna geçecek ve eksik torbalar takip edilecektir.
            </p>
          </div>

          <div className="pt-2 flex gap-3">
            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              className="btn-secondary flex-1"
            >
              İptal
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="btn-primary flex-1 font-bold"
            >
              {isSubmitting ? 'Kaydediliyor...' : 'Kotayı Uygula'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
