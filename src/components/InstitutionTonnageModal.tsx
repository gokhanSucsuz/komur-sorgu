'use client';

import { useState, useEffect } from 'react';
import { Target, CheckCircle2, AlertCircle, X, Truck, Package, Layers, Info } from 'lucide-react';
import { formatTonnage, normalizeToTon } from '@/lib/normalizer';
import { showToast } from './GlobalAlertManager';

interface InstitutionTonnageModalProps {
  currentQuotaTon: number;
  toplamNetTonaj?: number;
  onClose: () => void;
  onSuccess: () => void;
}

export default function InstitutionTonnageModal({
  currentQuotaTon,
  toplamNetTonaj = 0,
  onClose,
  onSuccess
}: InstitutionTonnageModalProps) {
  const [inputValue, setInputValue] = useState<string>(
    currentQuotaTon > 0 ? String(currentQuotaTon) : ''
  );
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  // ESC key listener to close modal
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  const parsedTon = normalizeToTon(inputValue);
  const fmt = formatTonnage(parsedTon);

  // Bag & Household equivalents (1 bag = 25 kg = 0.025 tons; 1 household standard = 34 bags = 850 kg)
  const totalBags = Math.round(parsedTon * 40);
  const estHouseholds = Math.floor((parsedTon * 1000) / 850);
  const remainingShipmentTon = Math.max(0, parsedTon - toplamNetTonaj);
  const remainingFmt = formatTonnage(remainingShipmentTon);

  const presets = [1000, 1500, 2000, 2500, 3000, 5000];

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (parsedTon <= 0) {
      setErrorMsg('Lütfen geçerli bir toplam kömür tonaj miktarı giriniz (0\'dan büyük olmalıdır).');
      return;
    }

    setIsSubmitting(true);
    setErrorMsg('');

    try {
      const res = await fetch('/api/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          toplam_tahsis_tonaj: parsedTon
        })
      });

      const data = await res.json();
      if (!data.success) {
        throw new Error(data.error || 'Toplam tahsis miktarı kaydedilemedi');
      }

      showToast({
        type: 'success',
        title: 'Kurum Tahsisi Kaydedildi',
        message: `Kuruma gelecek toplam kömür miktarı ${fmt.combined} olarak belirlendi.`,
      });

      onSuccess();
      onClose();
    } catch (err: any) {
      setErrorMsg(err.message || 'Bağlantı hatası oluştu');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div 
        className="modal-sheet max-w-lg w-full" 
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
      >
        {/* Modal Header */}
        <div className="flex items-center justify-between pb-3.5 border-b border-slate-200 mb-4">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-amber-100 text-amber-800 flex items-center justify-center border border-amber-300 shadow-2xs">
              <Target className="w-5 h-5 text-amber-700" />
            </div>
            <div>
              <h3 className="text-base font-black text-slate-900">
                Kurum Toplam Kömür Tahsisini Belirle
              </h3>
              <p className="text-xs text-slate-500 font-medium">
                Bu dağıtım döneminde kuruma sevk edilecek toplam kömür kotası
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-slate-400 hover:text-slate-700 p-1.5 rounded-lg text-sm transition-colors hover:bg-slate-100"
            title="Kapat (ESC)"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {errorMsg && (
          <div className="p-3 mb-4 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs flex items-center gap-2 font-semibold">
            <AlertCircle className="w-4 h-4 shrink-0 text-rose-600" />
            <span>{errorMsg}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Main Input Field */}
          <div>
            <label className="block text-xs font-black text-slate-700 uppercase tracking-wider mb-2">
              Kuruma Gelecek Toplam Miktar (Ton veya kg)
            </label>
            <div className="relative">
              <input
                type="number"
                step="any"
                min="1"
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                placeholder="Örn: 1500 (Ton) veya 1500000 (kg)"
                className="w-full px-4 py-3.5 rounded-2xl bg-slate-50 border-2 border-amber-300 text-slate-900 font-black text-2xl tracking-tight focus:outline-none focus:border-amber-500 focus:bg-white text-center shadow-xs"
                autoFocus
                required
              />
              <span className="absolute right-4 top-4 text-xs font-black text-slate-400 uppercase">
                Ton / kg
              </span>
            </div>

            {/* Live Format Conversion Preview */}
            {parsedTon > 0 && (
              <div className="mt-2.5 p-3 rounded-xl bg-amber-50/80 border border-amber-200 text-xs space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-amber-900 font-semibold">Matematiksel Karşılığı:</span>
                  <span className="font-mono font-black text-amber-950 text-sm">
                    {fmt.combined}
                  </span>
                </div>

                <div className="grid grid-cols-2 gap-2 pt-2 border-t border-amber-200/80 text-[11px]">
                  <div className="p-2 rounded-lg bg-white border border-amber-200">
                    <span className="text-slate-500 block font-medium">25 kg'lık Torba Eşdeğeri</span>
                    <strong className="text-slate-900 font-black font-mono">
                      {totalBags.toLocaleString('tr-TR')} Torba
                    </strong>
                  </div>
                  <div className="p-2 rounded-lg bg-white border border-amber-200">
                    <span className="text-slate-500 block font-medium">34 Torbalık Hane Kapasitesi</span>
                    <strong className="text-emerald-800 font-black font-mono">
                      ~{estHouseholds.toLocaleString('tr-TR')} Hane
                    </strong>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Quick Preset Buttons */}
          <div>
            <span className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1.5">
              Hızlı Miktar Seçimi (Ton)
            </span>
            <div className="grid grid-cols-3 sm:grid-cols-6 gap-1.5">
              {presets.map((ton) => (
                <button
                  key={ton}
                  type="button"
                  onClick={() => setInputValue(String(ton))}
                  className={`py-1.5 px-2 rounded-xl text-xs font-black border transition-all ${
                    parsedTon === ton
                      ? 'bg-amber-600 text-white border-amber-700 shadow-xs'
                      : 'bg-slate-50 hover:bg-amber-50 text-slate-700 border-slate-200 hover:border-amber-300'
                  }`}
                >
                  {ton.toLocaleString('tr-TR')} T
                </button>
              ))}
            </div>
          </div>

          {/* Status comparison card */}
          {parsedTon > 0 && (
            <div className="p-3 rounded-xl bg-slate-50 border border-slate-200 space-y-1.5 text-xs text-slate-700">
              <div className="flex items-center justify-between">
                <span className="text-slate-600 font-medium flex items-center gap-1">
                  <Truck className="w-3.5 h-3.5 text-slate-400" />
                  Şu Ana Kadar Gelen Net Kömür:
                </span>
                <strong className="font-mono text-slate-900">
                  {formatTonnage(toplamNetTonaj).combined}
                </strong>
              </div>
              <div className="flex items-center justify-between pt-1 border-t border-slate-200">
                <span className="text-rose-800 font-bold flex items-center gap-1">
                  <Package className="w-3.5 h-3.5 text-rose-500" />
                  Sevkiyatı Bekleyen Kalan Kömür:
                </span>
                <strong className="font-mono text-rose-700 font-black">
                  {remainingFmt.combined}
                </strong>
              </div>
              <p className="text-[10px] text-slate-500 italic pt-1">
                * Tırlar sahaya giriş yaptıkça geriye verilecek kalan miktar otomatik olarak güncellenecek ve tonaj kartlarında gösterilecektir.
              </p>
            </div>
          )}

          {/* Action Buttons */}
          <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-200">
            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              className="px-4 py-2.5 rounded-xl border border-slate-300 text-slate-700 font-bold text-xs hover:bg-slate-100 transition-colors"
            >
              Vazgeç
            </button>
            <button
              type="submit"
              disabled={isSubmitting || parsedTon <= 0}
              className="px-5 py-2.5 rounded-xl bg-amber-600 hover:bg-amber-700 text-white font-black text-xs flex items-center gap-2 shadow-xs transition-colors disabled:opacity-50"
            >
              <CheckCircle2 className="w-4 h-4" />
              <span>{isSubmitting ? 'Kaydediliyor...' : 'Toplam Tahsisi Kaydet'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
