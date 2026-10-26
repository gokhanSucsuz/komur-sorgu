'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  Calendar,
  Archive,
  CheckCircle2,
  AlertTriangle,
  FileSpreadsheet,
  Download,
  RefreshCw,
  X,
  Target,
  Layers,
  ShieldAlert,
  ChevronRight,
  TrendingUp,
  MapPin,
  Clock,
  HelpCircle
} from 'lucide-react';
import { showConfirm, showAlert, showToast } from './GlobalAlertManager';
import { formatTrAuto } from '@/lib/dateUtils';

interface SeasonManagementModalProps {
  isOpen: boolean;
  onClose: () => void;
  userRole: 'ADMIN' | 'PERSONEL' | 'MUDUR';
  userName: string;
  onSeasonChanged?: () => void;
}

export default function SeasonManagementModal({
  isOpen,
  onClose,
  userRole,
  userName,
  onSeasonChanged,
}: SeasonManagementModalProps) {
  const [activeTab, setActiveTab] = useState<'CURRENT' | 'CLOSE' | 'ARCHIVES'>('CURRENT');
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  // Active Season Data
  const [activeSeason, setActiveSeason] = useState<any>(null);
  const [activeQuota, setActiveQuota] = useState<number>(34);
  const [liveStats, setLiveStats] = useState<any>(null);
  const [archives, setArchives] = useState<any[]>([]);

  // Form states - Update Active Season
  const [editSeasonKod, setEditSeasonKod] = useState('');
  const [editSeasonBaslik, setEditSeasonBaslik] = useState('');
  const [editSeasonQuota, setEditSeasonQuota] = useState<number>(34);
  const [editStartDate, setEditStartDate] = useState('');

  // Form states - Close Season
  const [newSeasonKod, setNewSeasonKod] = useState('');
  const [newSeasonBaslik, setNewSeasonBaslik] = useState('');
  const [archiveNotes, setArchiveNotes] = useState('');
  const [confirmCheckbox, setConfirmCheckbox] = useState(false);

  // Archive inspection state
  const [selectedArchiveDetail, setSelectedArchiveDetail] = useState<any | null>(null);
  const [isLoadingArchiveDetail, setIsLoadingArchiveDetail] = useState(false);

  // Fetch season data
  const fetchSeasonData = useCallback(async () => {
    setIsLoading(true);
    setErrorMsg('');
    try {
      const res = await fetch('/api/seasons');
      const data = await res.json();
      if (data.success) {
        setActiveSeason(data.activeSeason || {});
        setActiveQuota(data.activeQuota || 34);
        setLiveStats(data.liveStats || null);
        setArchives(data.archives || []);

        if (data.activeSeason) {
          setEditSeasonKod(data.activeSeason.kod || '');
          setEditSeasonBaslik(data.activeSeason.baslik || '');
          setEditStartDate(data.activeSeason.baslangic_tarihi || '');
          setEditSeasonQuota(data.activeQuota || 34);

          // Suggest next season code based on current (e.g. 2026-2027 -> 2027-2028)
          const currentCode = data.activeSeason.kod || '';
          const match = currentCode.match(/(\d{4})\s*[-/]\s*(\d{4})/);
          if (match) {
            const nextStart = parseInt(match[1], 10) + 1;
            const nextEnd = parseInt(match[2], 10) + 1;
            const suggested = `${nextStart}-${nextEnd}`;
            setNewSeasonKod(suggested);
            setNewSeasonBaslik(`${suggested} Kömür Dağıtım Dönemi`);
          } else {
            setNewSeasonKod('');
            setNewSeasonBaslik('');
          }
        }
      } else {
        setErrorMsg(data.error || 'Dönem verileri alınamadı.');
      }
    } catch (err: any) {
      setErrorMsg(err.message || 'Sunucu bağlantı hatası.');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (isOpen) {
      fetchSeasonData();
      setSuccessMsg('');
      setErrorMsg('');
      setConfirmCheckbox(false);
      setSelectedArchiveDetail(null);
    }
  }, [isOpen, fetchSeasonData]);

  // Handle Update Active Season
  const handleUpdateSeason = async (e: React.FormEvent) => {
    e.preventDefault();
    if (userRole !== 'ADMIN') {
      setErrorMsg('Sadece sistem yöneticisi dönem bilgilerini güncelleyebilir.');
      return;
    }

    if (!editSeasonKod.trim()) {
      setErrorMsg('Dönem kodu (örn: 2026-2027) zorunludur.');
      return;
    }

    setIsSubmitting(true);
    setErrorMsg('');
    setSuccessMsg('');

    try {
      const res = await fetch('/api/seasons', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'SET_ACTIVE_SEASON',
          callerRole: userRole,
          kod: editSeasonKod.trim(),
          baslik: editSeasonBaslik.trim(),
          baslangic_tarihi: editStartDate,
          varsayilan_hedef_torba: editSeasonQuota,
        }),
      });

      const data = await res.json();
      if (!data.success) {
        throw new Error(data.error || 'Dönem güncellenemedi.');
      }

      setSuccessMsg(data.message || 'Dönem başarıyla güncellendi.');
      await fetchSeasonData();
      if (onSeasonChanged) onSeasonChanged();
    } catch (err: any) {
      setErrorMsg(err.message || 'İşlem sırasında hata oluştu.');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Handle Close & Archive Season
  const handleCloseAndArchive = async (e: React.FormEvent) => {
    e.preventDefault();
    if (userRole !== 'ADMIN') {
      setErrorMsg('Sadece sistem yöneticisi dağıtım dönemini sonlandırabilir.');
      return;
    }

    if (!confirmCheckbox) {
      setErrorMsg('Lütfen işlemi onayladığınızı belirten kutucuğu işaretleyin.');
      return;
    }

    if (!newSeasonKod.trim()) {
      setErrorMsg('Yeni başlatılacak dönem kodunu (örn: 2027-2028) giriniz.');
      return;
    }

    if (newSeasonKod.trim().toLowerCase() === (activeSeason?.kod || '').toLowerCase()) {
      setErrorMsg('Yeni dönem kodu mevcut dönem kodundan farklı olmalıdır.');
      return;
    }

    const confirmPrompt = await showConfirm({
      title: 'Dönemi Kalıcı Olarak Arşivle',
      message: `DİKKAT: "${activeSeason?.kod}" dönemi kalıcı olarak arşivlenecektir!\n\n` +
        `• Tüm teslimat ve mahalle kayıtları arşive kilitlenecek.\n` +
        `• Aktif hak sahibi listesi sıfırlanacak.\n` +
        `• Yeni dönem "${newSeasonKod}" olarak başlayacak.\n\n` +
        `Bu işlemi başlatmak istediğinizden emin misiniz?`,
      type: 'warning',
      confirmText: 'Evet, Dönemi Arşivle',
      cancelText: 'Vazgeç'
    });

    if (!confirmPrompt) return;

    setIsSubmitting(true);
    setErrorMsg('');
    setSuccessMsg('');

    try {
      const res = await fetch('/api/seasons', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'CLOSE_AND_ARCHIVE_SEASON',
          callerRole: userRole,
          closing_season_kod: activeSeason?.kod,
          closing_season_baslik: activeSeason?.baslik,
          new_season_kod: newSeasonKod.trim(),
          new_season_baslik: newSeasonBaslik.trim(),
          notlar: archiveNotes,
          kapatan_kullanici: userName,
        }),
      });

      const data = await res.json();
      if (!data.success) {
        throw new Error(data.error || 'Dönem arşivlenemedi.');
      }

      showToast({
        type: 'success',
        title: 'Dönem Arşivlendi',
        message: data.message || 'Dönem başarıyla arşivlendi ve yeni dönem başlatıldı!'
      });
      setSuccessMsg(data.message || 'Dönem başarıyla arşivlendi ve yeni dönem başlatıldı!');
      setConfirmCheckbox(false);
      setActiveTab('ARCHIVES');
      await fetchSeasonData();
      if (onSeasonChanged) onSeasonChanged();
    } catch (err: any) {
      setErrorMsg(err.message || 'Arşivleme işlemi sırasında hata oluştu.');
    } finally {
      setIsSubmitting(false);
    }
  };

  // View Detailed Mahalle Breakdown of a specific archive
  const handleViewArchiveDetail = async (donemKodu: string) => {
    setIsLoadingArchiveDetail(true);
    try {
      const res = await fetch(`/api/seasons?donem_kodu=${encodeURIComponent(donemKodu)}`);
      const data = await res.json();
      if (data.success && data.archive) {
        setSelectedArchiveDetail(data.archive);
      } else {
        showAlert({
          title: 'Hata',
          message: data.error || 'Arşiv detayı yüklenemedi.',
          type: 'error'
        });
      }
    } catch (err: any) {
      showAlert({
        title: 'Bağlantı Hatası',
        message: err.message || 'Bağlantı hatası.',
        type: 'error'
      });
    } finally {
      setIsLoadingArchiveDetail(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div
        className="modal-sheet max-w-4xl max-h-[92vh] flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal Header */}
        <div className="flex items-center justify-between pb-3 border-b border-slate-200 shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-xl bg-blue-50 border border-blue-200 flex items-center justify-center text-blue-700 shrink-0">
              <Calendar className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-base font-extrabold text-slate-900 leading-tight">
                  Kömür Dağıtım Dönemi & Arşiv Yönetimi
                </h3>
                <span className="text-[10px] font-black uppercase px-2 py-0.5 rounded-full bg-blue-100 text-blue-800 border border-blue-200">
                  {activeSeason?.kod || '2026-2027'}
                </span>
              </div>
              <p className="text-xs text-slate-500 font-medium mt-0.5">
                Dağıtım dönemini belirleyin, kış sezonu tamamlandığında güvenli arşivleyin ve geçmişi raporlayın.
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-slate-700 rounded-lg transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tab Navigation */}
        <div className="flex items-center gap-1 mt-3 p-1 bg-slate-100 rounded-xl border border-slate-200 shrink-0">
          <button
            type="button"
            onClick={() => setActiveTab('CURRENT')}
            className={`flex-1 py-2 px-3 rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-1.5 ${
              activeTab === 'CURRENT'
                ? 'bg-white text-blue-900 shadow-xs border border-slate-200'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <Target className="w-3.5 h-3.5 text-blue-600" />
            <span>Aktif Dönem & Kota</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('CLOSE')}
            className={`flex-1 py-2 px-3 rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-1.5 ${
              activeTab === 'CLOSE'
                ? 'bg-white text-rose-900 shadow-xs border border-slate-200'
                : 'text-slate-600 hover:text-rose-900'
            }`}
          >
            <ShieldAlert className="w-3.5 h-3.5 text-rose-600" />
            <span>Dönemi Sonlandır & Arşivle</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('ARCHIVES')}
            className={`flex-1 py-2 px-3 rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-1.5 ${
              activeTab === 'ARCHIVES'
                ? 'bg-white text-emerald-900 shadow-xs border border-slate-200'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <Archive className="w-3.5 h-3.5 text-emerald-600" />
            <span>Geçmiş Dönem Arşivleri ({archives.length})</span>
          </button>
        </div>

        {/* Feedback Messages */}
        {errorMsg && (
          <div className="mt-3 p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs flex items-center gap-2 font-medium shrink-0">
            <AlertTriangle className="w-4 h-4 shrink-0 text-rose-600" />
            <span>{errorMsg}</span>
          </div>
        )}

        {successMsg && (
          <div className="mt-3 p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs flex items-center gap-2 font-medium shrink-0">
            <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-600" />
            <span>{successMsg}</span>
          </div>
        )}

        {/* Tab Contents */}
        <div className="flex-1 overflow-y-auto mt-3 pr-1">
          {isLoading ? (
            <div className="py-12 flex flex-col items-center justify-center gap-2 text-slate-400">
              <RefreshCw className="w-7 h-7 animate-spin text-blue-600" />
              <span className="text-xs font-medium">Dönem ve arşiv verileri yükleniyor...</span>
            </div>
          ) : (
            <>
              {/* TAB 1: AKTİF DÖNEM BİLGİLERİ & CANLI İSTATİSTİK */}
              {activeTab === 'CURRENT' && (
                <div className="space-y-4">
                  {/* Live Stats Overview Card */}
                  <div className="p-4 rounded-2xl bg-gradient-to-br from-blue-900 to-indigo-950 text-white shadow-sm border border-blue-800">
                    <div className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-blue-800/60">
                      <div>
                        <span className="text-[10px] uppercase font-bold tracking-wider text-blue-300 block">
                          Şu Anda Yürürlükteki Kömür Dağıtım Dönemi
                        </span>
                        <h4 className="text-base sm:text-lg font-black text-white mt-0.5">
                          {activeSeason?.baslik || `${activeSeason?.kod || '2026-2027'} Kömür Dağıtım Dönemi`}
                        </h4>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="px-2.5 py-1 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-400/30 text-xs font-black flex items-center gap-1.5">
                          <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                          AKTİF DAĞITIM
                        </span>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 pt-3">
                      <div className="bg-white/10 rounded-xl p-2.5 backdrop-blur-xs">
                        <span className="text-[10px] text-blue-200 font-bold uppercase block">Kayıtlı Hak Sahibi</span>
                        <span className="text-lg font-black text-white">{liveStats?.totalBeneficiaries ?? 0} Hane</span>
                      </div>
                      <div className="bg-emerald-500/20 rounded-xl p-2.5 border border-emerald-500/30">
                        <span className="text-[10px] text-emerald-200 font-bold uppercase block">Tamamlanan</span>
                        <span className="text-lg font-black text-emerald-300">
                          {liveStats?.completedCount ?? 0} Hane (%{liveStats?.completionRate ?? 0})
                        </span>
                      </div>
                      <div className="bg-white/10 rounded-xl p-2.5 backdrop-blur-xs">
                        <span className="text-[10px] text-blue-200 font-bold uppercase block">Dağıtılan Kömür</span>
                        <span className="text-lg font-black text-amber-300">
                          {liveStats?.totalDeliveredBags ?? 0} Torba
                        </span>
                        <span className="text-[10px] text-blue-200 block">
                          ({((liveStats?.totalDeliveredBags || 0) * 0.025).toFixed(1)} Ton)
                        </span>
                      </div>
                      <div className="bg-white/10 rounded-xl p-2.5 backdrop-blur-xs">
                        <span className="text-[10px] text-blue-200 font-bold uppercase block">Hedef / Kota</span>
                        <span className="text-lg font-black text-white">
                          {activeQuota} Torba / Hane
                        </span>
                        <span className="text-[10px] text-blue-200 block">
                          ({activeQuota * 25} kg / Hane)
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Settings Form */}
                  <form onSubmit={handleUpdateSeason} className="p-4 rounded-2xl bg-slate-50 border border-slate-200 space-y-3">
                    <div className="flex items-center gap-2 pb-2 border-b border-slate-200">
                      <Target className="w-4 h-4 text-blue-700" />
                      <h4 className="text-xs font-bold text-slate-900 uppercase">
                        Aktif Dönem Bilgilerini & Hane Kotasını Düzenle
                      </h4>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <label className="text-xs font-bold text-slate-700 block mb-1">
                          Dönem Kodu <span className="text-rose-500">*</span>
                        </label>
                        <input
                          type="text"
                          value={editSeasonKod}
                          onChange={(e) => setEditSeasonKod(e.target.value)}
                          placeholder="Örn: 2026-2027"
                          disabled={userRole !== 'ADMIN'}
                          className="w-full px-3 py-2 bg-white border border-slate-300 rounded-xl text-xs font-bold text-slate-900 focus:outline-hidden focus:border-blue-500"
                        />
                        <span className="text-[10px] text-slate-500 mt-0.5 block">
                          Sistem genelinde rapor ve arşivleme için kullanılan benzersiz dönem kodu.
                        </span>
                      </div>

                      <div>
                        <label className="text-xs font-bold text-slate-700 block mb-1">
                          Dönem Başlığı / Resmi Adı
                        </label>
                        <input
                          type="text"
                          value={editSeasonBaslik}
                          onChange={(e) => setEditSeasonBaslik(e.target.value)}
                          placeholder="Örn: 2026-2027 Kömür Dağıtım Dönemi"
                          disabled={userRole !== 'ADMIN'}
                          className="w-full px-3 py-2 bg-white border border-slate-300 rounded-xl text-xs font-medium text-slate-900 focus:outline-hidden focus:border-blue-500"
                        />
                      </div>

                      <div>
                        <label className="text-xs font-bold text-slate-700 block mb-1">
                          Dönem Başlangıç Tarihi
                        </label>
                        <input
                          type="date"
                          value={editStartDate}
                          onChange={(e) => setEditStartDate(e.target.value)}
                          disabled={userRole !== 'ADMIN'}
                          className="w-full px-3 py-2 bg-white border border-slate-300 rounded-xl text-xs font-medium text-slate-900 focus:outline-hidden focus:border-blue-500"
                        />
                      </div>

                      <div>
                        <label className="text-xs font-bold text-slate-700 block mb-1">
                          Hane Başı Hedef Torba Kotası (Torba)
                        </label>
                        <div className="flex items-center gap-2">
                          <input
                            type="number"
                            min="1"
                            max="200"
                            value={editSeasonQuota}
                            onChange={(e) => setEditSeasonQuota(parseInt(e.target.value, 10) || 34)}
                            disabled={userRole !== 'ADMIN'}
                            className="w-full px-3 py-2 bg-white border border-slate-300 rounded-xl text-xs font-bold text-slate-900 focus:outline-hidden focus:border-blue-500"
                          />
                          <span className="text-xs font-extrabold text-slate-600 shrink-0">
                            = {editSeasonQuota * 25} kg
                          </span>
                        </div>
                      </div>
                    </div>

                    {userRole === 'ADMIN' ? (
                      <div className="pt-2 flex justify-end">
                        <button
                          type="submit"
                          disabled={isSubmitting}
                          className="px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-extrabold shadow-sm transition-all active:scale-95 disabled:opacity-50 flex items-center gap-1.5"
                        >
                          {isSubmitting ? (
                            <>
                              <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                              <span>Kaydediliyor...</span>
                            </>
                          ) : (
                            <>
                              <CheckCircle2 className="w-3.5 h-3.5" />
                              <span>Dönem Bilgilerini Güncelle</span>
                            </>
                          )}
                        </button>
                      </div>
                    ) : (
                      <p className="text-[11px] text-amber-800 bg-amber-50 p-2 rounded-lg border border-amber-200">
                        🔒 Bu ayarları yalnızca Sistem Yöneticisi değiştirebilir.
                      </p>
                    )}
                  </form>
                </div>
              )}

              {/* TAB 2: DÖNEMİ SONLANDIR & KALICI ARŞİVLE */}
              {activeTab === 'CLOSE' && (
                <div className="space-y-4">
                  {/* Warning Notice Box */}
                  <div className="p-4 rounded-2xl bg-rose-50 border border-rose-200 text-rose-900">
                    <div className="flex items-start gap-3">
                      <div className="w-9 h-9 rounded-xl bg-rose-100 border border-rose-300 flex items-center justify-center shrink-0 text-rose-700">
                        <ShieldAlert className="w-5 h-5" />
                      </div>
                      <div className="text-xs space-y-1">
                        <h4 className="font-extrabold text-rose-950 text-sm">
                          Resmi Dağıtım Dönemi Kapanışı ve Arşivleme Güvencesi
                        </h4>
                        <p className="text-rose-800 leading-relaxed">
                          Bu işlem yapıldığında; mevcut <strong>{activeSeason?.kod}</strong> dönemine ait tüm hak sahibi teslimatları, ıslak imzalar, mahalle icmalleri ve tır kömür girişleri <strong>kalıcı arşive</strong> taşınır.
                        </p>
                        <div className="pt-1.5 grid grid-cols-1 sm:grid-cols-2 gap-2 text-[11px] font-semibold text-rose-900">
                          <div className="flex items-center gap-1.5">
                            <CheckCircle2 className="w-3.5 h-3.5 text-rose-600" />
                            <span>Hiçbir veri kaybolmaz, arşivde saklanır</span>
                          </div>
                          <div className="flex items-center gap-1.5">
                            <CheckCircle2 className="w-3.5 h-3.5 text-rose-600" />
                            <span>MongoDB kotaları aşılmadan 500&apos;lük paketlerle taşınır</span>
                          </div>
                          <div className="flex items-center gap-1.5">
                            <CheckCircle2 className="w-3.5 h-3.5 text-rose-600" />
                            <span>Excel arşiv raporu istendiği an indirilebilir</span>
                          </div>
                          <div className="flex items-center gap-1.5">
                            <CheckCircle2 className="w-3.5 h-3.5 text-rose-600" />
                            <span>Aktif liste yeni dönem için tertemiz sıfırlanır</span>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Summary of what will be archived */}
                  <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200">
                    <h5 className="text-xs font-bold text-slate-900 uppercase mb-2">
                      Arşive Taşınacak Mevcut Dönem Özeti ({activeSeason?.kod})
                    </h5>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-center">
                      <div className="p-2.5 bg-white rounded-xl border border-slate-200">
                        <span className="text-[10px] font-bold text-slate-500 uppercase block">Toplam Hane</span>
                        <span className="text-sm font-black text-slate-900">{liveStats?.totalBeneficiaries ?? 0}</span>
                      </div>
                      <div className="p-2.5 bg-emerald-50 rounded-xl border border-emerald-200">
                        <span className="text-[10px] font-bold text-emerald-700 uppercase block">Tamamlanan</span>
                        <span className="text-sm font-black text-emerald-800">{liveStats?.completedCount ?? 0}</span>
                      </div>
                      <div className="p-2.5 bg-amber-50 rounded-xl border border-amber-200">
                        <span className="text-[10px] font-bold text-amber-700 uppercase block">Dağıtılan Torba</span>
                        <span className="text-sm font-black text-amber-900">{liveStats?.totalDeliveredBags ?? 0}</span>
                      </div>
                      <div className="p-2.5 bg-blue-50 rounded-xl border border-blue-200">
                        <span className="text-[10px] font-bold text-blue-700 uppercase block">Dağıtılan Ton</span>
                        <span className="text-sm font-black text-blue-900">
                          {((liveStats?.totalDeliveredBags || 0) * 0.025).toFixed(1)} Ton
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Closing Form */}
                  <form onSubmit={handleCloseAndArchive} className="p-4 rounded-2xl bg-white border border-slate-200 space-y-3">
                    <h5 className="text-xs font-bold text-slate-900 uppercase pb-2 border-b border-slate-200">
                      Yeni Dönem Başlatma Parametreleri
                    </h5>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <label className="text-xs font-bold text-slate-800 block mb-1">
                          Yeni Başlatılacak Dönem Kodu <span className="text-rose-500">*</span>
                        </label>
                        <input
                          type="text"
                          value={newSeasonKod}
                          onChange={(e) => setNewSeasonKod(e.target.value)}
                          placeholder="Örn: 2027-2028"
                          className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-xs font-bold text-slate-900 focus:outline-hidden focus:border-rose-500"
                        />
                        <span className="text-[10px] text-slate-500 mt-0.5 block">
                          Önceki dönem kapandıktan sonra aktifleşecek yeni dönem kodu.
                        </span>
                      </div>

                      <div>
                        <label className="text-xs font-bold text-slate-800 block mb-1">
                          Yeni Dönem Başlığı / Adı
                        </label>
                        <input
                          type="text"
                          value={newSeasonBaslik}
                          onChange={(e) => setNewSeasonBaslik(e.target.value)}
                          placeholder="Örn: 2027-2028 Kömür Dağıtım Dönemi"
                          className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-xs font-medium text-slate-900 focus:outline-hidden focus:border-rose-500"
                        />
                      </div>
                    </div>

                    <div>
                      <label className="text-xs font-bold text-slate-800 block mb-1">
                        Dönem Kapanış Notu / Rapor Açıklaması
                      </label>
                      <textarea
                        rows={2}
                        value={archiveNotes}
                        onChange={(e) => setArchiveNotes(e.target.value)}
                        placeholder="Örn: 2026-2027 kış sezonu kömür yardımı dağıtımı başarıyla tamamlandı. Kalan hak sahipleri için nihai liste arşive alındı."
                        className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-xs font-medium text-slate-900 focus:outline-hidden focus:border-rose-500"
                      />
                    </div>

                    <label className="flex items-start gap-2.5 p-3 rounded-xl bg-rose-50/60 border border-rose-200 cursor-pointer select-none">
                      <input
                        type="checkbox"
                        checked={confirmCheckbox}
                        onChange={(e) => setConfirmCheckbox(e.target.checked)}
                        className="mt-0.5 w-4 h-4 rounded text-rose-600 focus:ring-rose-500 border-slate-300"
                      />
                      <span className="text-xs text-rose-950 font-bold leading-tight">
                        &quot;{activeSeason?.kod}&quot; dönemine ait tüm verilerin arşive kilitlenmesini, aktif hak sahibi listesinin sıfırlanarak &quot;{newSeasonKod || 'yeni dönem'}&quot; döneminin açılmasını onaylıyorum.
                      </span>
                    </label>

                    <div className="pt-2 flex justify-end">
                      <button
                        type="submit"
                        disabled={!confirmCheckbox || isSubmitting || userRole !== 'ADMIN'}
                        className="px-5 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-extrabold shadow-sm transition-all active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-2"
                      >
                        {isSubmitting ? (
                          <>
                            <RefreshCw className="w-4 h-4 animate-spin" />
                            <span>Arşivleniyor & Sıfırlanıyor...</span>
                          </>
                        ) : (
                          <>
                            <Archive className="w-4 h-4" />
                            <span>Dönemi Arşivle & Yeni Dönemi Başlat</span>
                          </>
                        )}
                      </button>
                    </div>
                  </form>
                </div>
              )}

              {/* TAB 3: GEÇMİŞ DÖNEM ARŞİVLERİ & RAPORLAR */}
              {activeTab === 'ARCHIVES' && (
                <div className="space-y-4">
                  {archives.length === 0 ? (
                    <div className="py-12 text-center text-slate-400">
                      <Archive className="w-12 h-12 mx-auto stroke-1 text-slate-300 mb-2" />
                      <p className="text-xs font-bold text-slate-600">Henüz arşivlenmiş bir dönem bulunmuyor.</p>
                      <p className="text-[11px] text-slate-400 mt-0.5">
                        Aktif dağıtım dönemi tamamlandığında &quot;Dönemi Sonlandır & Arşivle&quot; sekmesinden ilk arşiv kaydını oluşturabilirsiniz.
                      </p>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {archives.map((arch) => {
                        const stats = arch.istatistikler || {};
                        return (
                          <div
                            key={arch.id || arch.donem_kodu}
                            className="p-4 rounded-2xl bg-white border border-slate-200 shadow-xs hover:border-blue-300 transition-all space-y-3"
                          >
                            <div className="flex flex-wrap items-center justify-between gap-2">
                              <div className="flex items-center gap-2">
                                <span className="px-2.5 py-1 rounded-lg bg-emerald-50 text-emerald-800 border border-emerald-200 text-xs font-black">
                                  {arch.donem_kodu}
                                </span>
                                <div>
                                  <h4 className="text-sm font-extrabold text-slate-900 leading-tight">
                                    {arch.baslik}
                                  </h4>
                                  <p className="text-[11px] text-slate-500 font-medium">
                                    Kapanış: {formatTrAuto(arch.kapanis_tarihi || arch.arsivlenme_zamani)} | Arşivleyen: {arch.kapatan_kullanici || 'Yönetici'}
                                  </p>
                                </div>
                              </div>

                              <div className="flex items-center gap-2">
                                <a
                                  href={`/api/export?type=season_archive&donem_kodu=${encodeURIComponent(arch.donem_kodu)}`}
                                  download={`Edirne_SYDV_${arch.donem_kodu}_Arsiv_Raporu.xlsx`}
                                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-300 text-xs font-bold transition-all active:scale-95 shadow-xs"
                                  title="Resmi Arşiv Excel Raporunu İndir"
                                >
                                  <Download className="w-3.5 h-3.5 text-emerald-700" />
                                  <span>Excel Raporu İndir</span>
                                </a>

                                <button
                                  type="button"
                                  onClick={() => handleViewArchiveDetail(arch.donem_kodu)}
                                  className="flex items-center gap-1 px-3 py-1.5 rounded-xl bg-blue-50 hover:bg-blue-100 text-blue-800 border border-blue-200 text-xs font-bold transition-all active:scale-95"
                                >
                                  <span>İcmal Detayı</span>
                                  <ChevronRight className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            </div>

                            {/* Archive Metrics Grid */}
                            <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 pt-1">
                              <div className="p-2 rounded-xl bg-slate-50 border border-slate-100 text-center">
                                <span className="text-[9px] font-bold text-slate-500 uppercase block">Toplam Hane</span>
                                <span className="text-xs font-black text-slate-900">{stats.toplam_hane ?? 0}</span>
                              </div>
                              <div className="p-2 rounded-xl bg-emerald-50 border border-emerald-100 text-center">
                                <span className="text-[9px] font-bold text-emerald-700 uppercase block">Tamamlanan</span>
                                <span className="text-xs font-black text-emerald-800">{stats.tamamlanan_hane ?? 0}</span>
                              </div>
                              <div className="p-2 rounded-xl bg-amber-50 border border-amber-100 text-center">
                                <span className="text-[9px] font-bold text-amber-700 uppercase block">Dağıtılan Torba</span>
                                <span className="text-xs font-black text-amber-900">{stats.toplam_dagitilan_torba ?? 0}</span>
                              </div>
                              <div className="p-2 rounded-xl bg-blue-50 border border-blue-100 text-center">
                                <span className="text-[9px] font-bold text-blue-700 uppercase block">Dağıtılan Ton</span>
                                <span className="text-xs font-black text-blue-900">{stats.toplam_dagitilan_ton ?? 0} Ton</span>
                              </div>
                              <div className="p-2 rounded-xl bg-purple-50 border border-purple-100 text-center">
                                <span className="text-[9px] font-bold text-purple-700 uppercase block">Başarı Oranı</span>
                                <span className="text-xs font-black text-purple-900">%{stats.tamamlanma_orani ?? 0}</span>
                              </div>
                            </div>

                            {arch.notlar && (
                              <p className="text-[11px] text-slate-600 bg-slate-50 p-2 rounded-lg border border-slate-100 italic">
                                &quot;{arch.notlar}&quot;
                              </p>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}
            </>
          )}
        </div>

        {/* Modal Footer */}
        <div className="pt-3 border-t border-slate-200 flex items-center justify-between mt-3 shrink-0">
          <div className="flex items-center gap-1.5 text-[11px] text-slate-500 font-medium">
            <span className="w-2 h-2 rounded-full bg-emerald-500" />
            <span>MongoDB Kota Korumalı ve İndeks Güvenceli Arşiv Sistemi</span>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="px-4 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold transition-all"
          >
            Kapat
          </button>
        </div>
      </div>

      {/* SUB-MODAL: Arşivlenmiş Dönem Mahalle İcmali Detay İnceleme */}
      {selectedArchiveDetail && (
        <div className="modal-overlay z-60" onClick={() => setSelectedArchiveDetail(null)}>
          <div
            className="modal-sheet max-w-3xl max-h-[85vh] flex flex-col overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between pb-3 border-b border-slate-200">
              <div>
                <h4 className="text-sm font-extrabold text-slate-900">
                  {selectedArchiveDetail.baslik} - Mahalle İcmali
                </h4>
                <p className="text-xs text-slate-500">
                  Dönem Kodu: {selectedArchiveDetail.donem_kodu} | Kapanış: {selectedArchiveDetail.kapanis_tarihi}
                </p>
              </div>
              <button
                onClick={() => setSelectedArchiveDetail(null)}
                className="p-1 text-slate-400 hover:text-slate-700 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="flex-1 min-h-0 overflow-y-auto my-3 pr-1">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="bg-slate-100 text-slate-700 font-bold border-b border-slate-200">
                    <th className="p-2">Mahalle / Köy</th>
                    <th className="p-2 text-center">Toplam Hane</th>
                    <th className="p-2 text-center">Hedef Torba</th>
                    <th className="p-2 text-center">Dağıtılan Torba</th>
                    <th className="p-2 text-center">Dağıtılan Ton</th>
                    <th className="p-2 text-center">Tamamlanan</th>
                    <th className="p-2 text-center">Oran</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {(selectedArchiveDetail.mahalle_ozetleri || []).map((m: any, idx: number) => (
                    <tr key={idx} className="hover:bg-slate-50">
                      <td className="p-2 font-bold text-slate-900">{m.mahalle}</td>
                      <td className="p-2 text-center">{m.toplam_hane}</td>
                      <td className="p-2 text-center">{m.hedef_torba}</td>
                      <td className="p-2 text-center font-bold text-emerald-700">{m.dagitilan_torba}</td>
                      <td className="p-2 text-center">{m.dagitilan_ton} Ton</td>
                      <td className="p-2 text-center">{m.tamamlanan_hane}</td>
                      <td className="p-2 text-center font-extrabold text-blue-700">%{m.tamamlanma_orani}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="pt-2 border-t border-slate-200 flex justify-between items-center">
              <a
                href={`/api/export?type=season_archive&donem_kodu=${encodeURIComponent(selectedArchiveDetail.donem_kodu)}`}
                download={`Edirne_SYDV_${selectedArchiveDetail.donem_kodu}_Arsiv_Raporu.xlsx`}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold shadow-xs transition-all"
              >
                <Download className="w-3.5 h-3.5" />
                <span>Bu Dönemi Excel Olarak İndir</span>
              </a>

              <button
                onClick={() => setSelectedArchiveDetail(null)}
                className="px-4 py-1.5 rounded-xl bg-slate-100 text-slate-700 text-xs font-bold"
              >
                Kapat
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
