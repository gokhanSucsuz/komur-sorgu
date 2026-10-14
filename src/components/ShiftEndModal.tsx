'use client';

import { useState } from 'react';
import { Clock, CheckCircle2, AlertTriangle, MapPin, Package, X, Sparkles, FileText } from 'lucide-react';

interface ShiftEndModalProps {
  shift: any;
  onClose: () => void;
  onSuccess: (updatedShift: any) => void;
}

export default function ShiftEndModal({ shift, onClose, onSuccess }: ShiftEndModalProps) {
  const now = new Date();
  const defaultEndTime = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;

  const [startTime, setStartTime] = useState(shift.baslama_saati || '08:30');
  const [endTime, setEndTime] = useState(shift.bitis_saati || defaultEndTime);
  const [mahalleler, setMahalleler] = useState(shift.mahalleler || '');
  const [notlar, setNotlar] = useState(shift.notlar || '');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');

  // Calculate live duration
  const calculateDuration = () => {
    if (!startTime || !endTime) return { totalMin: 0, formatted: '0 dk', overtime: 0, overtimeFormatted: 'Yok' };
    const [sh, sm] = startTime.split(':').map(Number);
    const [eh, em] = endTime.split(':').map(Number);
    if (isNaN(sh) || isNaN(sm) || isNaN(eh) || isNaN(em)) return { totalMin: 0, formatted: '0 dk', overtime: 0, overtimeFormatted: 'Yok' };
    
    let diff = (eh * 60 + em) - (sh * 60 + sm);
    if (diff < 0) diff += 24 * 60;

    const h = Math.floor(diff / 60);
    const m = diff % 60;
    const formatted = h > 0 ? (m > 0 ? `${h} saat ${m} dakika` : `${h} saat`) : `${m} dakika`;

    // Check day of week
    const shiftDate = new Date((shift.tarih || '') + 'T00:00:00');
    const dayIndex = isNaN(shiftDate.getTime()) ? 1 : shiftDate.getDay();
    const isSaturday = dayIndex === 6;
    const isSunday = dayIndex === 0;
    const isWeekend = isSaturday || isSunday;
    const dayNames = ['Pazar', 'Pazartesi', 'Salı', 'Çarşamba', 'Perşembe', 'Cuma', 'Cumartesi'];
    const dayName = dayNames[dayIndex] || '';

    // 11 hours maximum limit
    const exceeds11Hours = diff > 660;

    return { totalMin: diff, formatted, exceeds11Hours, isSaturday, isSunday, isWeekend, dayName };
  };

  const duration = calculateDuration();

  const handleFinish = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setError('');

    try {
      const res = await fetch('/api/shifts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'END',
          shiftId: shift.id || shift._id,
          personel_adi: shift.personel_adi,
          baslama_saati: startTime,
          bitis_saati: endTime,
          mahalleler: mahalleler.trim(),
          notlar: notlar.trim()
        })
      });

      const data = await res.json();
      if (data.success) {
        onSuccess(data.shift);
        onClose();
      } else {
        setError(data.error || 'Mesai kaydedilemedi.');
      }
    } catch (err: any) {
      setError(err.message || 'Bağlantı hatası oluştu.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-sheet max-w-lg" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="flex items-center justify-between pb-3 border-b border-slate-200 mb-4">
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-xl bg-amber-500 text-white flex items-center justify-center shadow-sm">
              <Clock className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-extrabold text-slate-900 leading-tight">
                Günü Bitir & Mesaiyi Kapat
              </h3>
              <p className="text-xs text-slate-500 font-medium">
                {shift.personel_adi} • {shift.tarih}
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

        <form onSubmit={handleFinish} className="space-y-4">
          {/* Time Picker Row */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                İşe Başlama Saati
              </label>
              <input
                type="time"
                value={startTime}
                onChange={(e) => setStartTime(e.target.value)}
                required
                className="w-full px-3 py-2.5 rounded-xl border border-slate-300 text-sm font-bold text-slate-900 bg-white focus:outline-none focus:border-amber-500 focus:ring-2 focus:ring-amber-500/20 shadow-xs"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                İş Bitiş Saati
              </label>
              <input
                type="time"
                value={endTime}
                onChange={(e) => setEndTime(e.target.value)}
                required
                className="w-full px-3 py-2.5 rounded-xl border border-slate-300 text-sm font-bold text-slate-900 bg-white focus:outline-none focus:border-amber-500 focus:ring-2 focus:ring-amber-500/20 shadow-xs"
              />
            </div>
          </div>

          {/* Duration Summary Box */}
          <div className="p-3.5 rounded-2xl bg-gradient-to-br from-amber-50 to-orange-50/60 border border-amber-200 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-slate-600">Günlük Çalışma Süresi:</span>
              <strong className="text-sm font-black text-slate-900">{duration.formatted}</strong>
            </div>

            <div className="flex items-center justify-between pt-1 border-t border-amber-200/60 text-xs">
              <span className="font-semibold text-slate-600 flex items-center gap-1">
                <Sparkles className="w-3.5 h-3.5 text-amber-600" />
                Gün Tipi / Mesai Niteliği:
              </span>
              <strong className={`font-black px-2.5 py-1 rounded-xl text-xs flex items-center gap-1 ${
                duration.isSaturday
                  ? 'text-amber-900 bg-amber-100 border border-amber-300'
                  : duration.isSunday
                  ? 'text-purple-900 bg-purple-100 border border-purple-300'
                  : 'text-slate-700 bg-slate-100 border border-slate-200'
              }`}>
                {duration.isSaturday
                  ? `💼 Cumartesi Mesaisi (${duration.dayName})`
                  : duration.isSunday
                  ? `⭐ Pazar Full Mesaisi (${duration.dayName})`
                  : `📅 Hafta İçi (${duration.dayName} - Sabit Maaş)`}
              </strong>
            </div>

            {duration.exceeds11Hours && (
              <div className="pt-1 border-t border-rose-200 text-xs font-bold text-rose-700 bg-rose-50 p-2 rounded-xl border border-rose-200 flex items-center gap-1.5">
                <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
                <span>Uyarı: Günlük çalışma süresi yasal 11 saatlik sınırı aşıyor!</span>
              </div>
            )}
          </div>

          {/* Neighborhoods Worked */}
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1 flex items-center gap-1">
              <MapPin className="w-3.5 h-3.5 text-amber-600" />
              Dağıtım Yapılan Mahalleler
            </label>
            <input
              type="text"
              value={mahalleler}
              onChange={(e) => setMahalleler(e.target.value)}
              placeholder="Örn: Cumhuriyet Mah., Atatürk Mah. (Boş bırakılırsa otomatik algılanır)"
              className="w-full px-3 py-2.5 rounded-xl border border-slate-300 text-xs font-medium text-slate-900 bg-white placeholder-slate-400 focus:outline-none focus:border-amber-500 focus:ring-2 focus:ring-amber-500/20 shadow-xs"
            />
            <p className="text-[11px] text-slate-500 mt-1">
              💡 Sistem bugün dağıtım yapılan hanelerden mahalleleri otomatik listeler.
            </p>
          </div>

          {/* Notes */}
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1 flex items-center gap-1">
              <FileText className="w-3.5 h-3.5 text-slate-500" />
              Mesai Notu (Opsiyonel)
            </label>
            <textarea
              value={notlar}
              onChange={(e) => setNotlar(e.target.value)}
              rows={2}
              placeholder="Günün dağıtımı, araç durumu veya özel durumlar hakkında not..."
              className="w-full px-3 py-2 rounded-xl border border-slate-300 text-xs font-medium text-slate-900 bg-white placeholder-slate-400 focus:outline-none focus:border-amber-500 focus:ring-2 focus:ring-amber-500/20 shadow-xs"
            />
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
              className="btn-primary flex-1 py-2.5 text-xs font-bold flex items-center justify-center gap-1.5"
            >
              {isSubmitting ? (
                <>
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  <span>Kaydediliyor...</span>
                </>
              ) : (
                <>
                  <CheckCircle2 className="w-4 h-4 text-white" />
                  <span>Mesaiyi Bitir & Kaydet</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
