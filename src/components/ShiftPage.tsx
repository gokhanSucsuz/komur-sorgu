'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
import {
  Clock,
  Calendar,
  User,
  Plus,
  Trash2,
  Edit3,
  RefreshCw,
  CheckCircle2,
  AlertTriangle,
  MapPin,
  FileSpreadsheet,
  Printer,
  ChevronDown,
  X,
  History,
  Sparkles
} from 'lucide-react';

interface ShiftPageProps {
  userRole: 'ADMIN' | 'PERSONEL';
  userName: string;
  onRefreshAll?: () => void;
}

function calculateMinutes(start: string, end: string): number {
  if (!start || !end) return 0;
  const [sh, sm] = start.split(':').map(Number);
  const [eh, em] = end.split(':').map(Number);
  if (isNaN(sh) || isNaN(sm) || isNaN(eh) || isNaN(em)) return 0;
  let diff = (eh * 60 + em) - (sh * 60 + sm);
  if (diff < 0) diff += 24 * 60;
  return diff;
}

function formatMinutes(totalMin: number): string {
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  if (h === 0) return `${m} dk`;
  if (m === 0) return `${h} sa`;
  return `${h} sa ${m} dk`;
}

const TR_DAYS = ['Pazar', 'Pazartesi', 'Salı', 'Çarşamba', 'Perşembe', 'Cuma', 'Cumartesi'];

export default function ShiftPage({
  userRole,
  userName,
  onRefreshAll,
}: ShiftPageProps) {
  const todayStr = new Date().toLocaleDateString('en-CA');

  // Work Shifts Data State
  const [shifts, setShifts] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [feedbackMsg, setFeedbackMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Filter States
  const [selectedPersonnel, setSelectedPersonnel] = useState<string>('ALL');
  const [selectedMonth, setSelectedMonth] = useState<string>('ALL');
  const [availableMonths, setAvailableMonths] = useState<any[]>([]);
  const [availableStaff, setAvailableStaff] = useState<string[]>([]);

  // Entry Form States (Retrospective or Same Day)
  const [entryDate, setEntryDate] = useState<string>(todayStr);
  const [entryStaff, setEntryStaff] = useState<string>(userName || 'Saha Personeli');
  const [entryStartTime, setEntryStartTime] = useState<string>('08:30');
  const [entryEndTime, setEntryEndTime] = useState<string>('17:30');
  const [entryAreas, setEntryAreas] = useState<string>('');
  const [entryNotes, setEntryNotes] = useState<string>('');

  // Edit Modal State
  const [editingShift, setEditingShift] = useState<any | null>(null);
  const [isUpdating, setIsUpdating] = useState(false);

  // Live Calculated Duration
  const calculatedMinutes = useMemo(() => {
    return calculateMinutes(entryStartTime, entryEndTime);
  }, [entryStartTime, entryEndTime]);

  // Fetch Work Shifts
  const fetchShifts = useCallback(async () => {
    setIsLoading(true);
    try {
      const params = new URLSearchParams();
      if (selectedPersonnel !== 'ALL') {
        params.append('personel', selectedPersonnel);
      }
      if (selectedMonth !== 'ALL') {
        params.append('month', selectedMonth);
      }

      const res = await fetch(`/api/shifts?${params.toString()}`);
      const data = await res.json();
      if (data.success) {
        const shiftList = data.shifts || [];
        setShifts(shiftList);
        if (data.availableMonths) setAvailableMonths(data.availableMonths);

        // Collect unique staff list
        const staffSet = new Set<string>();
        shiftList.forEach((s: any) => {
          if (s.personel_adi) staffSet.add(s.personel_adi);
        });
        if (userName) staffSet.add(userName);
        setAvailableStaff(Array.from(staffSet));
      }
    } catch (err) {
      console.error('Error fetching shifts:', err);
    } finally {
      setIsLoading(false);
    }
  }, [selectedPersonnel, selectedMonth, userName]);

  useEffect(() => {
    fetchShifts();
  }, [fetchShifts]);

  // Handle Form Submit: Add Work Hours (Same Day or Retrospective)
  const handleCreateWorkHours = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!entryDate || !entryStaff.trim() || !entryStartTime || !entryEndTime) {
      setFeedbackMsg({ type: 'error', text: 'Lütfen tarih, personel adı, başlama ve bitiş saatlerini eksiksiz giriniz.' });
      return;
    }

    setIsSubmitting(true);
    setFeedbackMsg(null);

    try {
      const res = await fetch('/api/shifts', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-user-role': userRole,
          'x-user-name': userName,
        },
        body: JSON.stringify({
          action: 'CREATE',
          personel_adi: entryStaff.trim(),
          tarih: entryDate,
          baslama_saati: entryStartTime,
          bitis_saati: entryEndTime,
          mahalleler: entryAreas,
          notlar: entryNotes,
          toplam_dakika: calculatedMinutes,
        }),
      });

      const data = await res.json();
      if (!data.success) {
        throw new Error(data.error || 'Kayıt eklenemedi.');
      }

      setFeedbackMsg({ type: 'success', text: `${entryDate} tarihli çalışma saati (${entryStartTime} - ${entryEndTime}) başarıyla kaydedildi.` });
      setEntryNotes('');
      await fetchShifts();
      if (onRefreshAll) onRefreshAll();
    } catch (err: any) {
      setFeedbackMsg({ type: 'error', text: err.message || 'İşlem sırasında bağlantı hatası oluştu.' });
    } finally {
      setIsSubmitting(false);
    }
  };

  // Handle Edit Submit
  const handleUpdateShift = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingShift) return;

    setIsUpdating(true);
    try {
      const res = await fetch('/api/shifts', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'x-user-role': userRole,
          'x-user-name': userName,
        },
        body: JSON.stringify({
          id: editingShift.id || editingShift._id,
          tarih: editingShift.tarih,
          baslama_saati: editingShift.baslama_saati,
          bitis_saati: editingShift.bitis_saati,
          mahalleler: editingShift.mahalleler,
          notlar: editingShift.notlar,
          durum: 'TAMAMLANDI',
        }),
      });

      const data = await res.json();
      if (!data.success) {
        throw new Error(data.error || 'Güncellenemedi.');
      }

      setEditingShift(null);
      await fetchShifts();
    } catch (err: any) {
      alert(err.message || 'Güncelleme hatası.');
    } finally {
      setIsUpdating(false);
    }
  };

  // Handle Delete Shift
  const handleDeleteShift = async (shift: any) => {
    const confirmPrompt = window.confirm(
      `${shift.tarih} tarihli "${shift.personel_adi}" çalışma saati kaydını (${shift.baslama_saati} - ${shift.bitis_saati}) silmek istediğinize emin misiniz?`
    );
    if (!confirmPrompt) return;

    try {
      const res = await fetch('/api/shifts', {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
          'x-user-role': userRole,
          'x-user-name': userName,
        },
        body: JSON.stringify({
          id: shift.id || shift._id,
          callerName: userName,
        }),
      });

      const data = await res.json();
      if (!data.success) {
        throw new Error(data.error || 'Silinemedi.');
      }

      await fetchShifts();
    } catch (err: any) {
      alert(err.message || 'Silme hatası.');
    }
  };

  // Quick Time Presets
  const applyPreset = (start: string, end: string) => {
    setEntryStartTime(start);
    setEntryEndTime(end);
  };

  // Aggregate Stats
  const totalMinutesAll = useMemo(() => {
    return shifts.reduce((acc, s) => acc + (s.toplam_dakika || 0), 0);
  }, [shifts]);

  const uniqueDaysCount = useMemo(() => {
    const dates = new Set<string>();
    shifts.forEach((s) => {
      if (s.tarih) dates.add(s.tarih);
    });
    return dates.size;
  }, [shifts]);

  return (
    <div className="space-y-6 max-w-5xl mx-auto pb-16">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-black text-slate-900 flex items-center gap-2">
            <Clock className="w-5 h-5 text-emerald-600" />
            <span>Günlük Çalışma Saatleri & Mesai Takip Cetveli</span>
          </h2>
          <p className="text-xs text-slate-500 font-medium">
            Personel çalışma saatlerinizi aynı gün veya geriye dönük istediğiniz tarihe kolayca kaydedin ve takip edin.
          </p>
        </div>

        <button
          onClick={fetchShifts}
          disabled={isLoading}
          className="p-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold transition-all flex items-center gap-1.5 self-start sm:self-auto"
          title="Listeyi Yenile"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin text-emerald-600' : ''}`} />
          <span>Yenile</span>
        </button>
      </div>

      {/* QUICK ENTRY FORM CARD: Same Day or Retrospective Work Hours Logging */}
      <div className="p-5 sm:p-6 rounded-3xl bg-white border border-slate-200 shadow-sm space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-slate-100">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-xl bg-emerald-50 text-emerald-700 flex items-center justify-center font-bold">
              <Plus className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-extrabold text-slate-900">
                Çalışma Saati Girişi (Aynı Gün veya Geriye Dönük)
              </h3>
              <p className="text-[11px] text-slate-500">
                Bugün veya geçmiş günlerde çalıştığınız saatleri buraya girip kaydedebilirsiniz.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1.5">
            <span className="text-[11px] font-bold text-slate-500">Hızlı Saat:</span>
            <button
              type="button"
              onClick={() => applyPreset('08:30', '17:30')}
              className="px-2 py-1 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 text-[10px] font-bold"
            >
              08:30 - 17:30
            </button>
            <button
              type="button"
              onClick={() => applyPreset('08:00', '17:00')}
              className="px-2 py-1 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 text-[10px] font-bold"
            >
              08:00 - 17:00
            </button>
            <button
              type="button"
              onClick={() => applyPreset('09:00', '18:00')}
              className="px-2 py-1 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 text-[10px] font-bold"
            >
              09:00 - 18:00
            </button>
          </div>
        </div>

        {/* Feedback Alert */}
        {feedbackMsg && (
          <div className={`p-3 rounded-xl text-xs flex items-center gap-2 font-medium ${
            feedbackMsg.type === 'success'
              ? 'bg-emerald-50 border border-emerald-200 text-emerald-800'
              : 'bg-rose-50 border border-rose-200 text-rose-800'
          }`}>
            {feedbackMsg.type === 'success' ? (
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            ) : (
              <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
            )}
            <span>{feedbackMsg.text}</span>
          </div>
        )}

        <form onSubmit={handleCreateWorkHours} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3">
            {/* 1. Tarih Seçici (Geriye Dönük Destekli) */}
            <div>
              <label className="text-xs font-bold text-slate-700 block mb-1">
                Çalışma Tarihi <span className="text-rose-500">*</span>
              </label>
              <input
                type="date"
                value={entryDate}
                onChange={(e) => setEntryDate(e.target.value)}
                required
                className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-xs font-bold text-slate-900 focus:outline-hidden focus:border-emerald-500"
              />
              <span className="text-[10px] text-slate-500 mt-0.5 block">
                Geçmiş tarih seçerek geriye dönük giriş yapabilirsiniz.
              </span>
            </div>

            {/* 2. Personel Adı */}
            <div>
              <label className="text-xs font-bold text-slate-700 block mb-1">
                Personel Adı <span className="text-rose-500">*</span>
              </label>
              {userRole === 'ADMIN' && availableStaff.length > 0 ? (
                <div className="relative">
                  <input
                    type="text"
                    list="staff-list"
                    value={entryStaff}
                    onChange={(e) => setEntryStaff(e.target.value)}
                    required
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-xs font-bold text-slate-900 focus:outline-hidden focus:border-emerald-500"
                  />
                  <datalist id="staff-list">
                    {availableStaff.map((st) => (
                      <option key={st} value={st} />
                    ))}
                  </datalist>
                </div>
              ) : (
                <input
                  type="text"
                  value={entryStaff}
                  onChange={(e) => setEntryStaff(e.target.value)}
                  required
                  readOnly={userRole !== 'ADMIN'}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-xs font-bold text-slate-900 focus:outline-hidden focus:border-emerald-500 cursor-default"
                />
              )}
            </div>

            {/* 3. Başlama Saati */}
            <div>
              <label className="text-xs font-bold text-slate-700 block mb-1">
                Başlama Saati <span className="text-rose-500">*</span>
              </label>
              <input
                type="time"
                value={entryStartTime}
                onChange={(e) => setEntryStartTime(e.target.value)}
                required
                className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-xs font-bold text-slate-900 focus:outline-hidden focus:border-emerald-500"
              />
            </div>

            {/* 4. Bitiş Saati */}
            <div>
              <label className="text-xs font-bold text-slate-700 block mb-1">
                Bitiş Saati <span className="text-rose-500">*</span>
              </label>
              <input
                type="time"
                value={entryEndTime}
                onChange={(e) => setEntryEndTime(e.target.value)}
                required
                className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-xs font-bold text-slate-900 focus:outline-hidden focus:border-emerald-500"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {/* Çalışılan Mahalle / Bölge */}
            <div>
              <label className="text-xs font-bold text-slate-700 block mb-1">
                Çalışılan Mahalle / Dağıtım Bölgesi (Opsiyonel)
              </label>
              <input
                type="text"
                value={entryAreas}
                onChange={(e) => setEntryAreas(e.target.value)}
                placeholder="Örn: Şükrüpaşa Mah., Fatih Mah."
                className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-xs font-medium text-slate-900 focus:outline-hidden focus:border-emerald-500"
              />
            </div>

            {/* Notlar / Açıklama */}
            <div>
              <label className="text-xs font-bold text-slate-700 block mb-1">
                Açıklama / Saha Notları (Opsiyonel)
              </label>
              <input
                type="text"
                value={entryNotes}
                onChange={(e) => setEntryNotes(e.target.value)}
                placeholder="Örn: Kömür tırı boşaltıldı ve 50 hane dağıtımı yapıldı"
                className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-xs font-medium text-slate-900 focus:outline-hidden focus:border-emerald-500"
              />
            </div>
          </div>

          {/* Duration Indicator & Submit Button */}
          <div className="pt-2 flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold text-slate-600">Hesaplanan Çalışma Süresi:</span>
              <span className="px-3 py-1 rounded-xl bg-emerald-50 text-emerald-800 border border-emerald-200 text-xs font-black flex items-center gap-1.5">
                <Clock className="w-3.5 h-3.5 text-emerald-600" />
                <span>{formatMinutes(calculatedMinutes)}</span>
              </span>
            </div>

            <button
              type="submit"
              disabled={isSubmitting}
              className="px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-extrabold shadow-sm transition-all active:scale-95 disabled:opacity-50 flex items-center gap-1.5 ml-auto"
            >
              {isSubmitting ? (
                <>
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                  <span>Kaydediliyor...</span>
                </>
              ) : (
                <>
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  <span>Çalışma Saatini Kaydet</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>

      {/* OVERVIEW STATS CARDS */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="p-3.5 rounded-2xl bg-white border border-slate-200 shadow-xs">
          <span className="text-[10px] font-bold text-slate-500 uppercase block">Kayıtlı Çalışma Günü</span>
          <span className="text-lg font-black text-slate-900">{uniqueDaysCount} Gün</span>
        </div>

        <div className="p-3.5 rounded-2xl bg-emerald-50/70 border border-emerald-200 shadow-xs">
          <span className="text-[10px] font-bold text-emerald-700 uppercase block">Toplam Çalışma Süresi</span>
          <span className="text-lg font-black text-emerald-800">{formatMinutes(totalMinutesAll)}</span>
        </div>

        <div className="p-3.5 rounded-2xl bg-blue-50/70 border border-blue-200 shadow-xs">
          <span className="text-[10px] font-bold text-blue-700 uppercase block">Toplam Kayıt Sayısı</span>
          <span className="text-lg font-black text-blue-900">{shifts.length} Mesai</span>
        </div>

        <div className="p-3.5 rounded-2xl bg-purple-50/70 border border-purple-200 shadow-xs">
          <span className="text-[10px] font-bold text-purple-700 uppercase block">Günlük Ortalama</span>
          <span className="text-lg font-black text-purple-900">
            {uniqueDaysCount > 0 ? formatMinutes(Math.round(totalMinutesAll / uniqueDaysCount)) : '0 dk'}
          </span>
        </div>
      </div>

      {/* FILTER BAR */}
      <div className="p-3.5 rounded-2xl bg-slate-100/90 border border-slate-200 flex flex-wrap items-center justify-between gap-2.5">
        <div className="flex flex-wrap items-center gap-2">
          {/* Month Filter */}
          <select
            value={selectedMonth}
            onChange={(e) => setSelectedMonth(e.target.value)}
            className="px-3 py-1.5 bg-white border border-slate-300 rounded-xl text-xs font-bold text-slate-800 shadow-xs focus:outline-hidden"
          >
            <option value="ALL">Tüm Aylar</option>
            {availableMonths.map((m) => (
              <option key={m.id} value={m.id}>{m.label}</option>
            ))}
          </select>

          {/* Personnel Filter (Admin Only) */}
          {userRole === 'ADMIN' && (
            <select
              value={selectedPersonnel}
              onChange={(e) => setSelectedPersonnel(e.target.value)}
              className="px-3 py-1.5 bg-white border border-slate-300 rounded-xl text-xs font-bold text-slate-800 shadow-xs focus:outline-hidden"
            >
              <option value="ALL">Tüm Personeller</option>
              {availableStaff.map((st) => (
                <option key={st} value={st}>{st}</option>
              ))}
            </select>
          )}
        </div>

        <span className="text-xs text-slate-500 font-medium">
          Toplam <strong>{shifts.length}</strong> çalışma saati listeleniyor
        </span>
      </div>

      {/* WORK HOURS RECORDS LIST / TABLE */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
        {isLoading ? (
          <div className="py-12 flex flex-col items-center justify-center gap-2 text-slate-400">
            <RefreshCw className="w-6 h-6 animate-spin text-emerald-600" />
            <span className="text-xs font-medium">Çalışma saatleri yükleniyor...</span>
          </div>
        ) : shifts.length === 0 ? (
          <div className="py-12 text-center text-slate-400 p-6">
            <Clock className="w-10 h-10 mx-auto text-slate-300 mb-2 stroke-1" />
            <p className="text-xs font-bold text-slate-600">Henüz girilmiş bir çalışma saati bulunamadı.</p>
            <p className="text-[11px] text-slate-400 mt-1">
              Yukarıdaki formu kullanarak bugün veya geriye dönük çalışma saatlerinizi ekleyebilirsiniz.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="bg-slate-50 text-slate-700 font-bold border-b border-slate-200">
                  <th className="p-3">Tarih</th>
                  <th className="p-3">Personel</th>
                  <th className="p-3 text-center">Saat Aralığı</th>
                  <th className="p-3 text-center">Toplam Süre</th>
                  <th className="p-3">Çalışılan Bölge / Not</th>
                  <th className="p-3 text-right">İşlemler</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {shifts.map((shift) => {
                  const sDate = new Date(shift.tarih + 'T00:00:00');
                  const dayName = isNaN(sDate.getTime()) ? '' : TR_DAYS[sDate.getDay()];

                  return (
                    <tr key={shift.id || shift._id} className="hover:bg-slate-50 transition-colors">
                      {/* Tarih */}
                      <td className="p-3 whitespace-nowrap">
                        <span className="font-extrabold text-slate-900 block">{shift.tarih}</span>
                        <span className="text-[10px] text-slate-500 font-medium">{dayName}</span>
                      </td>

                      {/* Personel */}
                      <td className="p-3 font-bold text-slate-800 whitespace-nowrap">
                        {shift.personel_adi}
                      </td>

                      {/* Saat Aralığı */}
                      <td className="p-3 text-center whitespace-nowrap">
                        <span className="px-2.5 py-1 rounded-lg bg-slate-100 font-bold text-slate-800 text-[11px]">
                          {shift.baslama_saati || '-'} — {shift.bitis_saati || '-'}
                        </span>
                      </td>

                      {/* Toplam Süre */}
                      <td className="p-3 text-center whitespace-nowrap">
                        <span className="font-extrabold text-emerald-700 text-xs">
                          {formatMinutes(shift.toplam_dakika || 0)}
                        </span>
                      </td>

                      {/* Bölge & Not */}
                      <td className="p-3 text-slate-600">
                        {shift.mahalleler && (
                          <span className="font-semibold text-slate-800 block text-[11px]">
                            📍 {shift.mahalleler}
                          </span>
                        )}
                        {shift.notlar && (
                          <span className="text-[11px] text-slate-500 italic block">
                            {shift.notlar}
                          </span>
                        )}
                        {!shift.mahalleler && !shift.notlar && (
                          <span className="text-slate-400">-</span>
                        )}
                      </td>

                      {/* İşlemler (Düzenle & Sil) */}
                      <td className="p-3 text-right whitespace-nowrap">
                        <div className="flex items-center justify-end gap-1">
                          <button
                            type="button"
                            onClick={() => setEditingShift(shift)}
                            className="p-1.5 rounded-lg text-slate-600 hover:text-blue-700 hover:bg-blue-50 transition-colors"
                            title="Çalışma Saatini Düzenle"
                          >
                            <Edit3 className="w-3.5 h-3.5" />
                          </button>

                          <button
                            type="button"
                            onClick={() => handleDeleteShift(shift)}
                            className="p-1.5 rounded-lg text-slate-400 hover:text-rose-700 hover:bg-rose-50 transition-colors"
                            title="Kaydı Sil"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* EDIT MODAL: Düzenleme Penceresi */}
      {editingShift && (
        <div className="modal-overlay" onClick={() => setEditingShift(null)}>
          <div
            className="modal-sheet max-w-md flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between pb-3 border-b border-slate-200">
              <div className="flex items-center gap-2">
                <Edit3 className="w-4 h-4 text-blue-600" />
                <h4 className="text-sm font-extrabold text-slate-900">Çalışma Saatini Düzenle</h4>
              </div>
              <button
                type="button"
                onClick={() => setEditingShift(null)}
                className="p-1 text-slate-400 hover:text-slate-700 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleUpdateShift} className="space-y-3 my-4">
              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1">Tarih</label>
                <input
                  type="date"
                  value={editingShift.tarih || ''}
                  onChange={(e) => setEditingShift({ ...editingShift, tarih: e.target.value })}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-xs font-bold"
                  required
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-xs font-bold text-slate-700 block mb-1">Başlama Saati</label>
                  <input
                    type="time"
                    value={editingShift.baslama_saati || ''}
                    onChange={(e) => setEditingShift({ ...editingShift, baslama_saati: e.target.value })}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-xs font-bold"
                    required
                  />
                </div>

                <div>
                  <label className="text-xs font-bold text-slate-700 block mb-1">Bitiş Saati</label>
                  <input
                    type="time"
                    value={editingShift.bitis_saati || ''}
                    onChange={(e) => setEditingShift({ ...editingShift, bitis_saati: e.target.value })}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-xs font-bold"
                    required
                  />
                </div>
              </div>

              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1">Bölge / Mahalleler</label>
                <input
                  type="text"
                  value={editingShift.mahalleler || ''}
                  onChange={(e) => setEditingShift({ ...editingShift, mahalleler: e.target.value })}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-xs"
                />
              </div>

              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1">Notlar / Açıklama</label>
                <input
                  type="text"
                  value={editingShift.notlar || ''}
                  onChange={(e) => setEditingShift({ ...editingShift, notlar: e.target.value })}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-xs"
                />
              </div>

              <div className="pt-2 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setEditingShift(null)}
                  className="px-3 py-2 rounded-xl bg-slate-100 text-slate-700 text-xs font-bold"
                >
                  İptal
                </button>
                <button
                  type="submit"
                  disabled={isUpdating}
                  className="px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold"
                >
                  {isUpdating ? 'Kaydediliyor...' : 'Değişiklikleri Kaydet'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
