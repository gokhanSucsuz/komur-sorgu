'use client';

import { useState } from 'react';
import { Play, Clock, MapPin, X, AlertTriangle } from 'lucide-react';

interface ShiftStartModalProps {
  currentStaff: string;
  onClose: () => void;
  onSuccess: (newShift: any) => void;
}

export default function ShiftStartModal({ currentStaff, onClose, onSuccess }: ShiftStartModalProps) {
  const now = new Date();
  const defaultStartTime = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
  const defaultDate = now.toLocaleDateString('en-CA');

  const [personelName, setPersonelName] = useState(currentStaff || 'Murat Dağıtım');
  const [tarih, setTarih] = useState(defaultDate);
  const [startTime, setStartTime] = useState(defaultStartTime);
  const [notlar, setNotlar] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');

  const handleStart = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setError('');

    try {
      const res = await fetch('/api/shifts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'START',
          personel_adi: personelName.trim(),
          tarih,
          baslama_saati: startTime,
          notlar: notlar.trim()
        })
      });

      const data = await res.json();
      if (data.success) {
        onSuccess(data.shift);
        onClose();
      } else {
        setError(data.error || 'Mesai başlatılamadı.');
      }
    } catch (err: any) {
      setError(err.message || 'Bağlantı hatası oluştu.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-sheet max-w-md" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="flex items-center justify-between pb-3 border-b border-slate-200 mb-4">
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-xl bg-emerald-500 text-white flex items-center justify-center shadow-sm">
              <Play className="w-5 h-5 fill-white ml-0.5" />
            </div>
            <div>
              <h3 className="text-base font-extrabold text-slate-900 leading-tight">
                Günlük Kömür Dağıtımını Başlat
              </h3>
              <p className="text-xs text-slate-500 font-medium">
                Mesai başlangıç saati ve personel kaydı
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-slate-700 rounded-lg hover:bg-slate-100 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {error && (
          <div className="p-3 mb-4 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-xs font-semibold flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleStart} className="space-y-4">
          {/* Personnel Name */}
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">
              Personel Adı Soyadı
            </label>
            <input
              type="text"
              value={personelName}
              onChange={(e) => setPersonelName(e.target.value)}
              required
              className="w-full px-3 py-2.5 rounded-xl border border-slate-300 text-sm font-bold text-slate-900 bg-white focus:outline-none focus:border-amber-500 focus:ring-2 focus:ring-amber-500/20 shadow-xs"
            />
          </div>

          {/* Date & Start Time */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                Tarih
              </label>
              <input
                type="date"
                value={tarih}
                onChange={(e) => setTarih(e.target.value)}
                required
                className="w-full px-3 py-2.5 rounded-xl border border-slate-300 text-sm font-bold text-slate-900 bg-white focus:outline-none focus:border-amber-500 focus:ring-2 focus:ring-amber-500/20 shadow-xs"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                Başlama Saati
              </label>
              <input
                type="time"
                value={startTime}
                onChange={(e) => setStartTime(e.target.value)}
                required
                className="w-full px-3 py-2.5 rounded-xl border border-slate-300 text-sm font-bold text-slate-900 bg-white focus:outline-none focus:border-amber-500 focus:ring-2 focus:ring-amber-500/20 shadow-xs"
              />
            </div>
          </div>

          {/* Notes */}
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">
              Başlangıç Notu (Opsiyonel)
            </label>
            <textarea
              value={notlar}
              onChange={(e) => setNotlar(e.target.value)}
              rows={2}
              placeholder="Örn: 1. Kamyon yüklendi, dağıtıma başlanıyor..."
              className="w-full px-3 py-2 rounded-xl border border-slate-300 text-xs font-medium text-slate-900 bg-white placeholder-slate-400 focus:outline-none focus:border-amber-500 focus:ring-2 focus:ring-amber-500/20 shadow-xs"
            />
          </div>

          {/* Info pill */}
          <div className="p-3 rounded-xl bg-slate-50 border border-slate-200 text-xs text-slate-600 flex items-center gap-2">
            <Clock className="w-4 h-4 text-emerald-600 shrink-0" />
            <span>
              Mesai başlatıldığında gün boyu yaptığınız kömür dağıtımları ve saatler otomatik işlenecektir.
            </span>
          </div>

          {/* Action Buttons */}
          <div className="pt-2 border-t border-slate-200 flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              className="btn-secondary flex-1 py-2.5 text-xs font-bold"
            >
              Vazgeç
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="btn-primary flex-1 py-2.5 text-xs font-bold flex items-center justify-center gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white"
            >
              {isSubmitting ? (
                <>
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  <span>Başlatılıyor...</span>
                </>
              ) : (
                <>
                  <Play className="w-4 h-4 fill-white" />
                  <span>Mesaiyi Başlat</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
