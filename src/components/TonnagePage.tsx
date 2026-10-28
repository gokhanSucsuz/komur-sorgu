'use client';

import { useState, useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { Truck, Plus, Calendar, FileText, Weight, Trash2, AlertCircle, CheckCircle2, Printer, X, Download, Search, Filter, Copy, RotateCcw, Pencil, Target, ShieldCheck, Scale, LayoutGrid, ListFilter, FileSpreadsheet, Users } from 'lucide-react';
import { showConfirm, showToast, showAlert } from './GlobalAlertManager';
import { turkishIncludes, formatTonnage, normalizeToTon, formatTwoWayTonnage, formatTwoWayDiff } from '@/lib/normalizer';
import { formatTrDate, formatTrDateTime, formatTrAuto, formatTrDateWithDay } from '@/lib/dateUtils';
import InstitutionTonnageModal from './InstitutionTonnageModal';

interface TonnagePageProps {
  trucks: any[];
  stats: any;
  onRefresh: () => void;
  isLoading?: boolean;
  userRole?: 'ADMIN' | 'PERSONEL' | 'MUDUR';
}

export default function TonnagePage({
  trucks,
  stats,
  onRefresh,
  isLoading = false,
  userRole = 'PERSONEL'
}: TonnagePageProps) {
  const todayDefault = () => new Date().toISOString().split('T')[0];

  const [showAddModal, setShowAddModal] = useState(false);
  const [showTahsisModal, setShowTahsisModal] = useState(false);
  const [editingTruckId, setEditingTruckId] = useState<string | null>(null);
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>('');
  const [plaka, setPlaka] = useState('');
  const [dorsePlaka, setDorsePlaka] = useState('');
  const [irsaliyeNo, setIrsaliyeNo] = useState('');
  const [tutanakNo, setTutanakNo] = useState('');
  const [ocakCikisTarihi, setOcakCikisTarihi] = useState(todayDefault);
  const [tarih, setTarih] = useState(todayDefault);
  const [netTonaj, setNetTonaj] = useState('');
  const [brutTonaj, setBrutTonaj] = useState('');
  const [soforAdi, setSoforAdi] = useState('');
  const [notlar, setNotlar] = useState('');
  const [tirSirasi, setTirSirasi] = useState<number>(stats?.sonrakiTirSirasi || (trucks.length + 1));
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [mainViewMode, setMainViewMode] = useState<'TABLE' | 'CARDS'>('TABLE');
  const [reportFormat, setReportFormat] = useState<'TESELLUM' | 'TKI'>('TESELLUM');

  // Unique saved truck profiles (deduplicated by plaka + sofor_adi for quick 1-click template cards)
  const uniqueTruckTemplates = useMemo(() => {
    const seen = new Set<string>();
    const list: any[] = [];
    for (const t of trucks) {
      const key = `${(t.plaka || '').trim().toUpperCase()}|${(t.sofor_adi || '').trim().toUpperCase()}`;
      if (!seen.has(key) && t.plaka) {
        seen.add(key);
        list.push(t);
      }
    }
    return list;
  }, [trucks]);

  // Apply a saved truck record as a template into the form with 1 click
  // Note: İrsaliye / Teslimat No is a primary/unique key and cannot be reused, so it is cleared for the new entry.
  const applyTruckTemplate = (t: any) => {
    if (!t) return;
    setSelectedTemplateId(String(t.id || t._id || t.tir_sirasi));
    setPlaka((t.plaka || '').toUpperCase());
    setDorsePlaka('');
    setTutanakNo(t.tutanak_no || '');
    setSoforAdi(t.sofor_adi || '');
    setNotlar(t.notlar || '');
    setBrutTonaj(t.brut_tonaj !== undefined && t.brut_tonaj !== null ? String(t.brut_tonaj) : '');
    setNetTonaj(t.net_tonaj !== undefined && t.net_tonaj !== null ? String(t.net_tonaj) : '');
    if (!editingTruckId) {
      setIrsaliyeNo('');
    }
    if (t.ocak_cikis_tarihi) {
      setOcakCikisTarihi(t.ocak_cikis_tarihi);
    }
    setErrorMsg('');
  };

  // Open modal in Edit Mode for an existing truck record
  const openEditTruckModal = (t: any) => {
    if (!t) return;
    setEditingTruckId(String(t.id || t._id));
    setSelectedTemplateId('');
    setTirSirasi(Number(t.tir_sirasi) || 1);
    setPlaka((t.plaka || '').toUpperCase());
    setDorsePlaka('');
    setIrsaliyeNo((t.irsaliye_no || '').toLocaleUpperCase('tr-TR'));
    setTutanakNo(t.tutanak_no || '');
    setOcakCikisTarihi(t.ocak_cikis_tarihi || t.tarih || todayDefault());
    setTarih(t.tarih || todayDefault());
    setBrutTonaj(t.brut_tonaj !== undefined && t.brut_tonaj !== null ? String(t.brut_tonaj) : '');
    setNetTonaj(t.net_tonaj !== undefined && t.net_tonaj !== null ? String(t.net_tonaj) : '');
    setSoforAdi(t.sofor_adi || '');
    setNotlar(t.notlar || '');
    setErrorMsg('');
    setShowAddModal(true);
  };

  // Normalize waybill number for primary/unique key check
  const normalizeIrsaliyeClient = (val: string) =>
    String(val || '')
      .trim()
      .toLocaleUpperCase('tr-TR')
      .replace(/\s+/g, '');

  // Real-time duplicate check for İrsaliye / Teslimat No (Birincil Anahtar)
  const duplicateIrsaliyeTruck = useMemo(() => {
    const normInput = normalizeIrsaliyeClient(irsaliyeNo);
    if (!normInput) return null;
    return (
      trucks.find(
        (t: any) =>
          String(t.id || t._id) !== String(editingTruckId || '') &&
          normalizeIrsaliyeClient(t.irsaliye_no) === normInput
      ) || null
    );
  }, [irsaliyeNo, trucks, editingTruckId]);

  const resetAddForm = () => {
    const todayStr = todayDefault();
    setEditingTruckId(null);
    setSelectedTemplateId('');
    setTirSirasi(stats?.sonrakiTirSirasi || (trucks.length + 1));
    setPlaka('');
    setDorsePlaka('');
    setIrsaliyeNo('');
    setTutanakNo('');
    setOcakCikisTarihi(todayStr);
    setTarih(todayStr);
    setNetTonaj('');
    setBrutTonaj('');
    setSoforAdi('');
    setNotlar('');
    setErrorMsg('');
  };

  // Main Tonnage Page Search & Filter State (%100 Türkçe Karakter Uyumlu)
  const [mainSearchQuery, setMainSearchQuery] = useState('');
  const [mainDatePreset, setMainDatePreset] = useState<'ALL' | 'TODAY' | 'WEEK' | 'MONTH' | 'DIFF_DATE'>('ALL');
  const [mainStartDate, setMainStartDate] = useState('');
  const [mainEndDate, setMainEndDate] = useState('');
  const [mainPlakaFilter, setMainPlakaFilter] = useState('ALL');
  const [mainSortOrder, setMainSortOrder] = useState<'NEWEST' | 'OLDEST' | 'TON_DESC' | 'TON_ASC'>('NEWEST');

  const uniquePlakaList = useMemo(() => {
    const set = new Set<string>();
    for (const t of trucks) {
      if (t.plaka) set.add(String(t.plaka).trim().toUpperCase());
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b, 'tr'));
  }, [trucks]);

  const applyMainDatePreset = (preset: 'ALL' | 'TODAY' | 'WEEK' | 'MONTH' | 'DIFF_DATE') => {
    setMainDatePreset(preset);
    const today = new Date();
    const formatDate = (d: Date) => d.toLocaleDateString('en-CA');

    if (preset === 'TODAY') {
      const todayStr = formatDate(today);
      setMainStartDate(todayStr);
      setMainEndDate(todayStr);
    } else if (preset === 'WEEK') {
      const weekAgo = new Date(today);
      weekAgo.setDate(weekAgo.getDate() - 7);
      setMainStartDate(formatDate(weekAgo));
      setMainEndDate(formatDate(today));
    } else if (preset === 'MONTH') {
      const monthAgo = new Date(today);
      monthAgo.setDate(monthAgo.getDate() - 30);
      setMainStartDate(formatDate(monthAgo));
      setMainEndDate(formatDate(today));
    } else {
      setMainStartDate('');
      setMainEndDate('');
    }
  };

  const resetMainFilters = () => {
    setMainSearchQuery('');
    setMainDatePreset('ALL');
    setMainStartDate('');
    setMainEndDate('');
    setMainPlakaFilter('ALL');
    setMainSortOrder('NEWEST');
  };

  const hasActiveMainFilters = Boolean(
    mainSearchQuery.trim() ||
    mainDatePreset !== 'ALL' ||
    mainStartDate ||
    mainEndDate ||
    mainPlakaFilter !== 'ALL' ||
    mainSortOrder !== 'NEWEST'
  );

  const filteredMainTrucks = useMemo(() => {
    const q = mainSearchQuery.trim();
    const list = trucks.filter((t: any) => {
      if (mainPlakaFilter !== 'ALL' && String(t.plaka || '').trim().toUpperCase() !== mainPlakaFilter) {
        return false;
      }
      if (mainDatePreset === 'DIFF_DATE') {
        if (!t.ocak_cikis_tarihi || t.ocak_cikis_tarihi === t.tarih) {
          return false;
        }
      }
      if (mainStartDate && t.tarih < mainStartDate) return false;
      if (mainEndDate && t.tarih > mainEndDate) return false;

      if (q) {
        const cleanOrderQuery = q.replace(/^#/, '');
        const matchSira = String(t.tir_sirasi || '') === cleanOrderQuery;
        const matchPlaka = turkishIncludes(t.plaka || '', q);
        const matchTutanak = turkishIncludes(t.tutanak_no || '', q);
        const matchSofor = turkishIncludes(t.sofor_adi || '', q);
        const matchIrsaliye = turkishIncludes(t.irsaliye_no || '', q);
        const matchNotlar = turkishIncludes(t.notlar || '', q);
        if (!matchSira && !matchPlaka && !matchTutanak && !matchSofor && !matchIrsaliye && !matchNotlar) {
          return false;
        }
      }
      return true;
    });

    return [...list].sort((a: any, b: any) => {
      if (mainSortOrder === 'OLDEST') {
        if (a.tarih !== b.tarih) return (a.tarih || '').localeCompare(b.tarih || '');
        return Number(a.tir_sirasi || 0) - Number(b.tir_sirasi || 0);
      }
      if (mainSortOrder === 'TON_DESC') {
        return normalizeToTon(b.net_tonaj) - normalizeToTon(a.net_tonaj);
      }
      if (mainSortOrder === 'TON_ASC') {
        return normalizeToTon(a.net_tonaj) - normalizeToTon(b.net_tonaj);
      }
      // NEWEST default
      if (b.tarih !== a.tarih) return (b.tarih || '').localeCompare(a.tarih || '');
      return Number(b.tir_sirasi || 0) - Number(a.tir_sirasi || 0);
    });
  }, [trucks, mainSearchQuery, mainDatePreset, mainStartDate, mainEndDate, mainPlakaFilter, mainSortOrder]);

  const filteredMainNetTonaj = useMemo(
    () => filteredMainTrucks.reduce((acc: number, t: any) => acc + normalizeToTon(t.net_tonaj), 0),
    [filteredMainTrucks]
  );

  // Tonnage Report Modal State & Filters
  const [showReportModal, setShowReportModal] = useState(false);
  const [reportPreset, setReportPreset] = useState<'ALL' | 'TODAY' | 'WEEK' | 'MONTH'>('ALL');
  const [reportStartDate, setReportStartDate] = useState('');
  const [reportEndDate, setReportEndDate] = useState('');
  const [reportSearchQuery, setReportSearchQuery] = useState('');

  const applyReportPreset = (preset: 'ALL' | 'TODAY' | 'WEEK' | 'MONTH') => {
    setReportPreset(preset);
    const today = new Date();
    const formatDate = (d: Date) => d.toLocaleDateString('en-CA');

    if (preset === 'TODAY') {
      const todayStr = formatDate(today);
      setReportStartDate(todayStr);
      setReportEndDate(todayStr);
    } else if (preset === 'WEEK') {
      const weekAgo = new Date(today);
      weekAgo.setDate(weekAgo.getDate() - 7);
      setReportStartDate(formatDate(weekAgo));
      setReportEndDate(formatDate(today));
    } else if (preset === 'MONTH') {
      const monthAgo = new Date(today);
      monthAgo.setDate(monthAgo.getDate() - 30);
      setReportStartDate(formatDate(monthAgo));
      setReportEndDate(formatDate(today));
    } else {
      setReportStartDate('');
      setReportEndDate('');
    }
  };

  // ESC key listener to close report modal
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && showReportModal) {
        setShowReportModal(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [showReportModal]);

  // Filtered trucks for report (%100 Türkçe karakter uyumlu arama)
  const filteredReportTrucks = useMemo(() => {
    return trucks.filter((t: any) => {
      if (reportStartDate && t.tarih < reportStartDate) return false;
      if (reportEndDate && t.tarih > reportEndDate) return false;
      if (reportSearchQuery) {
        const matchPlaka = turkishIncludes(t.plaka || '', reportSearchQuery);
        const matchTutanak = turkishIncludes(t.tutanak_no || '', reportSearchQuery);
        const matchSofor = turkishIncludes(t.sofor_adi || '', reportSearchQuery);
        const matchIrsaliye = turkishIncludes(t.irsaliye_no || '', reportSearchQuery);
        const matchNotlar = turkishIncludes(t.notlar || '', reportSearchQuery);
        if (!matchPlaka && !matchTutanak && !matchSofor && !matchIrsaliye && !matchNotlar) {
          return false;
        }
      }
      return true;
    });
  }, [trucks, reportStartDate, reportEndDate, reportSearchQuery]);

  const reportTotalBrut = filteredReportTrucks.reduce((acc: number, t: any) => acc + normalizeToTon(t.brut_tonaj), 0);
  const reportTotalNet = filteredReportTrucks.reduce((acc: number, t: any) => acc + normalizeToTon(t.net_tonaj), 0);
  const reportTotalYuklenenKg = filteredReportTrucks.reduce((acc: number, t: any) => acc + Math.round(normalizeToTon(t.brut_tonaj) * 1000), 0);
  const reportTotalTeslimKg = filteredReportTrucks.reduce((acc: number, t: any) => acc + Math.round(normalizeToTon(t.net_tonaj) * 1000), 0);
  const reportTotalFarkKg = reportTotalTeslimKg - reportTotalYuklenenKg;
  const reportTotalTara = filteredReportTrucks.reduce((acc: number, t: any) => {
    const b = normalizeToTon(t.brut_tonaj);
    const n = normalizeToTon(t.net_tonaj);
    const tr = normalizeToTon(t.tara_tonaj);
    return acc + (tr > 0 ? tr : (b > n ? b - n : 0));
  }, 0);

  const netVal = normalizeToTon(netTonaj, true);
  const brutVal = normalizeToTon(brutTonaj, true);
  const autoTaraVal = brutVal > netVal ? parseFloat((brutVal - netVal).toFixed(3)) : 0;
  const autoTara = autoTaraVal.toFixed(3);

  const handleAddTruck = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!plaka || !irsaliyeNo || !tarih || !netTonaj || !brutTonaj) {
      setErrorMsg('Lütfen zorunlu alanları (Tır Plakası, İrsaliye No, Geliş Tarihi, Sevk ve Net Tonaj) doldurunuz');
      return;
    }

    if (duplicateIrsaliyeTruck) {
      setErrorMsg(
        `"${irsaliyeNo.trim().toLocaleUpperCase('tr-TR')}" İrsaliye / Teslimat No sistemde zaten kayıtlı (#${duplicateIrsaliyeTruck.tir_sirasi} - Plaka: ${duplicateIrsaliyeTruck.plaka} - Tarih: ${duplicateIrsaliyeTruck.tarih}). İrsaliye No birincil anahtardır; aynı irsaliye numarasıyla birden fazla kayıt açılamaz!`
      );
      return;
    }

    if (ocakCikisTarihi && tarih && ocakCikisTarihi > tarih) {
      setErrorMsg('Kömür ocağından çıkış tarihi, dağıtım sahasına geliş tarihinden ileri bir tarih olamaz!');
      return;
    }

    if (brutVal < netVal) {
      setErrorMsg('Sevk miktarı, teslim alınan net tonajdan küçük olamaz!');
      return;
    }

    setIsSubmitting(true);
    setErrorMsg('');

    try {
      const isEdit = Boolean(editingTruckId);
      const res = await fetch('/api/trucks', {
        method: isEdit ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...(isEdit ? { id: editingTruckId } : {}),
          tir_sirasi: tirSirasi,
          plaka,
          irsaliye_no: irsaliyeNo.trim().toLocaleUpperCase('tr-TR'),
          tutanak_no: tutanakNo.trim(),
          ocak_cikis_tarihi: ocakCikisTarihi || tarih,
          tarih,
          net_tonaj: netVal,
          brut_tonaj: brutVal,
          sofor_adi: soforAdi,
          notlar
        })
      });

      const data = await res.json();
      if (!data.success) {
        throw new Error(data.error || (isEdit ? 'Tır kaydı güncellenemedi' : 'Tır kaydı eklenemedi'));
      }

      showToast({
        type: 'success',
        title: isEdit ? 'Tır Kaydı Güncellendi' : 'Yeni Tır Kaydedildi',
        message: `"${plaka.toUpperCase()}" plakalı tır (${formatTonnage(netVal).combined}) ${isEdit ? 'güncellendi' : 'kaydedildi'}.`,
      });

      setShowAddModal(false);
      resetAddForm();
      onRefresh();
    } catch (err: any) {
      setErrorMsg(err.message || 'Hata oluştu');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDeleteTruck = async (id: number, plakaText: string) => {
    const confirmed = await showConfirm({
      title: 'Tır Kaydını Sil',
      message: `"${plakaText}" plakalı tır kaydını silmek istediğinize emin misiniz? Bu işlem geri alınamaz.`,
      type: 'warning',
      confirmText: 'Evet, Sil',
      cancelText: 'Vazgeç'
    });
    if (!confirmed) {
      return;
    }

    try {
      const res = await fetch(`/api/trucks?id=${id}`, { method: 'DELETE' });
      const data = await res.json();
      if (data.success) {
        showToast({
          type: 'success',
          title: 'Kayıt Silindi',
          message: `"${plakaText}" plakalı tır kaydı silindi.`
        });
        onRefresh();
      } else {
        showAlert({
          title: 'Hata',
          message: data.error || 'Silme işleminde hata oluştu',
          type: 'error'
        });
      }
    } catch (err: any) {
      showAlert({
        title: 'Hata',
        message: err.message || 'Silme işleminde hata oluştu',
        type: 'error'
      });
    }
  };

  return (
    <div className="space-y-4">
      {/* Stock & Tonnage Overview - Light Mode */}
      <div className="p-5 rounded-2xl bg-white border border-slate-200 shadow-sm space-y-3">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-xl bg-amber-100 text-amber-800 flex items-center justify-center border border-amber-200">
              <Truck className="w-5 h-5 text-amber-700" />
            </div>
            <div>
              <h3 className="text-base font-extrabold text-slate-900">Kömür Stok & Sevkiyat</h3>
              <p className="text-xs text-slate-500 font-medium">Gelen Tırlar, Tesellüm Kayıtları ve Net Tonaj Özeti</p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {userRole === 'ADMIN' && (
              <button
                type="button"
                onClick={() => setShowTahsisModal(true)}
                className="px-3 py-2 rounded-xl border border-indigo-200 bg-indigo-50/80 hover:bg-indigo-100 text-indigo-900 text-xs font-bold flex items-center gap-1.5 shadow-2xs transition-all active:scale-95"
                title="Kuruma Gelecek Sezonluk Toplam Kömür Tahsisini Belirle / Değiştir"
              >
                <Target className="w-4 h-4 text-indigo-700" />
                <span className="hidden sm:inline">Kurum Tahsisi Belirle</span>
                <span className="sm:hidden">Tahsis</span>
              </button>
            )}

            <button
              type="button"
              onClick={() => setShowReportModal(true)}
              className="px-3.5 py-2 rounded-xl border border-slate-300 bg-white hover:bg-slate-50 text-slate-800 text-xs font-bold flex items-center gap-1.5 shadow-2xs transition-all active:scale-95"
              title="Kömür Sevkiyatı ve Kantar Tonaj Raporunu Önizle ve Yazdır"
            >
              <Printer className="w-4 h-4 text-amber-600" />
              <span>Tonaj Raporunu Yazdır</span>
            </button>

            {userRole === 'MUDUR' && (
              <span className="px-2.5 py-1.5 bg-purple-50 text-purple-800 border border-purple-200 rounded-xl text-xs font-bold flex items-center gap-1 shadow-2xs">
                <ShieldCheck className="w-3.5 h-3.5 text-purple-700" />
                <span>İzleme Modu</span>
              </span>
            )}

            {userRole === 'ADMIN' && (
              <button
                onClick={() => {
                  resetAddForm();
                  setTirSirasi(stats?.sonrakiTirSirasi || (trucks.length + 1));
                  setShowAddModal(true);
                }}
                className="btn-primary text-xs py-2 px-3 shadow-md"
              >
                <Plus className="w-4 h-4 text-white" />
                Yeni Tır Girişi
              </button>
            )}
          </div>
        </div>

        {/* 5 Stats Cards & Institutional Progress - Light Mode */}
        <div className="pt-2 border-t border-slate-100 space-y-2.5">
          {(() => {
            const hasFazla = Number(stats?.fazlaDagitilanTonaj || 0) > 0;
            const quotaTorba = Number(stats?.varsayilanHedefTorba) || 34;
            const quotaTon = (quotaTorba * 25) / 1000;
            const haneKapasitesiGelen = Math.floor(normalizeToTon(stats?.toplamNetTonaj) / quotaTon);
            const haneKapasitesiKalanStok = Math.floor(normalizeToTon(stats?.kalanStokTonaj || 0) / quotaTon);
            const haneKapasitesiTahsis = Number(stats?.toplamTahsisTonaj || 0) > 0
              ? Math.floor(normalizeToTon(stats?.toplamTahsisTonaj) / quotaTon)
              : null;
            return (
              <>
                <div className={`grid grid-cols-2 sm:grid-cols-3 ${hasFazla ? 'lg:grid-cols-4 xl:grid-cols-7' : 'lg:grid-cols-3 xl:grid-cols-6'} gap-2`}>
                  {/* Card 1: Kurum Toplam Tahsisi */}
                  <div className="p-3 rounded-xl bg-indigo-50/70 border border-indigo-200 flex flex-col justify-between">
                    <div>
                      <span className="text-[10px] uppercase font-bold text-indigo-900 tracking-wider flex items-center gap-1">
                        <Target className="w-3 h-3 text-indigo-600" />
                        <span>Kurum Tahsisi</span>
                      </span>
                      {Number(stats?.toplamTahsisTonaj || 0) > 0 ? (
                        <>
                          <div className="text-lg font-black text-indigo-950 mt-0.5">
                            {formatTonnage(stats?.toplamTahsisTonaj).tonStr}
                          </div>
                          <div className="text-[10px] text-indigo-800 font-bold">
                            ({formatTonnage(stats?.toplamTahsisTonaj).kgStr})
                          </div>
                        </>
                      ) : (
                        <div className="text-sm font-extrabold text-slate-400 mt-1">
                          Belirlenmedi
                        </div>
                      )}
                    </div>
                    <div className="mt-1.5 pt-1 border-t border-indigo-100">
                      {userRole === 'ADMIN' ? (
                        <button
                          type="button"
                          onClick={() => setShowTahsisModal(true)}
                          className="text-[10px] font-bold text-indigo-700 hover:text-indigo-900 flex items-center gap-1 transition-colors"
                        >
                          <Pencil className="w-2.5 h-2.5" />
                          <span>{Number(stats?.toplamTahsisTonaj || 0) > 0 ? 'Tahsis Değiştir' : 'Tahsis Belirle'}</span>
                        </button>
                      ) : (
                        <span className="text-[10px] text-indigo-600 font-medium">Sezonluk Hedef</span>
                      )}
                    </div>
                  </div>

                  {/* Card 2: Gelen Net Kömür */}
                  <div className="p-3 rounded-xl bg-amber-50 border border-amber-200 flex flex-col justify-between">
                    <div>
                      <span className="text-[10px] uppercase font-bold text-amber-800 tracking-wider flex items-center gap-1">
                        <Truck className="w-3 h-3 text-amber-700" />
                        <span>Gelen Net Kömür</span>
                      </span>
                      <div className="text-lg font-black text-amber-900 mt-0.5">
                        {formatTonnage(stats?.toplamNetTonaj).tonStr}
                      </div>
                      <div className="text-[10px] text-amber-800 font-bold">
                        ({formatTonnage(stats?.toplamNetTonaj).kgStr})
                      </div>
                    </div>
                    <div className="mt-1.5 pt-1 border-t border-amber-100 text-[10px] text-amber-700 font-semibold">
                      {stats?.toplamTirSayisi || 0} Tır Sahaya İndi
                    </div>
                  </div>

                  {/* Card 3: 34 Torbalık Hane Kapasitesi */}
                  <div className="p-3 rounded-xl bg-teal-50/80 border border-teal-200 flex flex-col justify-between">
                    <div>
                      <span className="text-[10px] uppercase font-bold text-teal-900 tracking-wider flex items-center gap-1">
                        <Users className="w-3 h-3 text-teal-700" />
                        <span>34 Torbalık Hane Kapasitesi</span>
                      </span>
                      <div className="text-lg font-black text-teal-950 mt-0.5">
                        {haneKapasitesiGelen.toLocaleString('tr-TR')} Hane
                      </div>
                      <div className="text-[10px] text-teal-800 font-bold">
                        (1 Hane = {quotaTorba} Torba / {Math.round(quotaTon * 1000)} kg)
                      </div>
                    </div>
                    <div className="mt-1.5 pt-1 border-t border-teal-100 text-[10px] text-teal-700 font-semibold truncate flex items-center justify-between">
                      <span>Kalan Stok: <strong className="text-teal-900">{haneKapasitesiKalanStok.toLocaleString('tr-TR')} Hane</strong></span>
                      {haneKapasitesiTahsis !== null && (
                        <span className="text-[9px] text-teal-600 hidden xl:inline" title="Kurum tahsisinin toplam hane kapasitesi">
                          Tahsis: {haneKapasitesiTahsis.toLocaleString('tr-TR')}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Card 3: Sevkiyatı Bekleyen Kalan Kömür (User explicit request) */}
                  <div className="p-3 rounded-xl bg-sky-50 border border-sky-200 flex flex-col justify-between">
                    <div>
                      <span className="text-[10px] uppercase font-bold text-sky-800 tracking-wider flex items-center gap-1">
                        <Weight className="w-3 h-3 text-sky-600" />
                        <span>Sevkiyatı Bekleyen Kalan</span>
                      </span>
                      <div className="text-lg font-black text-sky-950 mt-0.5">
                        {formatTonnage(stats?.kalanTahsisTonaj).tonStr}
                      </div>
                      <div className="text-[10px] text-sky-800 font-bold">
                        ({formatTonnage(stats?.kalanTahsisTonaj).kgStr})
                      </div>
                    </div>
                    <div className="mt-1.5 pt-1 border-t border-sky-100 text-[10px] text-sky-700 font-semibold truncate">
                      {Number(stats?.toplamTahsisTonaj || 0) > 0 ? (
                        Number(stats?.kalanTahsisTonaj || 0) <= 0 ? (
                          <span className="text-emerald-700 font-bold">Tüm Tahsis Ulaştı (%100)</span>
                        ) : (
                          <span>Tahsisin %{stats?.tahsisTamamlanmaYuzdesi || 0}&apos;i Ulaştı</span>
                        )
                      ) : (
                        <span className="text-slate-400">Tahsis Belirlenmedi</span>
                      )}
                    </div>
                  </div>

                  {/* Card 4: Dağıtılan Kömür */}
                  <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-200 flex flex-col justify-between">
                    <div>
                      <span className="text-[10px] uppercase font-bold text-emerald-800 tracking-wider">Dağıtılan Kömür</span>
                      <div className="text-lg font-black text-emerald-800 mt-0.5">
                        {formatTonnage(stats?.dagitilanNetTonaj).tonStr}
                      </div>
                      <div className="text-[10px] text-emerald-800 font-bold">
                        ({formatTonnage(stats?.dagitilanNetTonaj).kgStr})
                      </div>
                    </div>
                    <div className="mt-1.5 pt-1 border-t border-emerald-100 text-[10px] text-emerald-700 font-semibold">
                      {stats?.toplamDagitilanTorba || 0} Torba Teslim Edildi
                    </div>
                  </div>

                  {/* Card 5: Sahada Kalan Güncel Stok */}
                  <div className="p-3 rounded-xl bg-slate-50 border border-slate-200 flex flex-col justify-between">
                    <div>
                      <span className="text-[10px] uppercase font-bold text-slate-600 tracking-wider">Kalan Saha Stoku</span>
                      <div className={`text-lg font-black mt-0.5 ${hasFazla ? 'text-slate-500' : (Number(stats?.kalanStokTonaj || 0) < 5 ? 'text-rose-600' : 'text-slate-900')}`}>
                        {formatTonnage(stats?.kalanStokTonaj || 0).tonStr}
                      </div>
                      <div className="text-[10px] text-slate-600 font-bold">
                        ({formatTonnage(stats?.kalanStokTonaj || 0).kgStr})
                      </div>
                    </div>
                    <div className="mt-1.5 pt-1 border-t border-slate-200 text-[10px] font-medium">
                      {hasFazla ? (
                        <span className="text-purple-700 font-bold">Depo Tükendi (Fazla Dağıtım)</span>
                      ) : (
                        <span className="text-slate-500">Dağıtıma Hazır Depo Stoku</span>
                      )}
                    </div>
                  </div>

                  {/* Card 6: Fazladan Dağıtılan Kömür (Standart Dışı Torba Toleransı) */}
                  {hasFazla && (
                    <div className="p-3 rounded-xl bg-purple-50/90 border border-purple-200 flex flex-col justify-between">
                      <div>
                        <span className="text-[10px] uppercase font-bold text-purple-900 tracking-wider flex items-center gap-1">
                          <Scale className="w-3 h-3 text-purple-700" />
                          <span>Fazladan Dağıtılan</span>
                        </span>
                        <div className="text-lg font-black text-purple-950 mt-0.5">
                          +{formatTonnage(stats?.fazlaDagitilanTonaj).tonStr}
                        </div>
                        <div className="text-[10px] text-purple-800 font-bold">
                          (+{formatTonnage(stats?.fazlaDagitilanTonaj).kgStr} • +{stats?.fazlaDagitilanTorba || 0} Torba)
                        </div>
                      </div>
                      <div className="mt-1.5 pt-1 border-t border-purple-100 text-[10px] text-purple-700 font-semibold truncate">
                        Torba Toleransı (~+{stats?.fazlaDagitilanHane || 0} Hane)
                      </div>
                    </div>
                  )}
                </div>

                {/* Torba Toleransı Kaynaklı Bilgilendirme Notu */}
                {hasFazla && (
                  <div className="p-3 rounded-xl bg-purple-50/90 border border-purple-200 flex items-start gap-2.5 text-xs text-purple-900 shadow-2xs">
                    <Scale className="w-4 h-4 text-purple-700 shrink-0 mt-0.5" />
                    <div className="leading-relaxed">
                      <strong className="font-extrabold text-purple-950">Torba Ağırlık Toleransı Kaydı: </strong>
                      Bazı kömür torbaları standart ağırlığın (25 kg) altında geldiği için saha kantar tonajı tükenmesine rağmen fiilen toplam <strong className="font-black text-purple-950">+{formatTonnage(stats?.fazlaDagitilanTonaj).combined}</strong> (+{stats?.fazlaDagitilanTorba || 0} Torba) fazladan kömür dağıtılmış ve yaklaşık <strong className="font-black text-purple-950">+{stats?.fazlaDagitilanHane || 0} hak sahibine</strong> ilave teslimat yapılmıştır. Sistem kuralı gereğince saha stoku eksiye düşürülmeyip <strong>0 Ton</strong> olarak korunmuş, aradaki fark resmi kayıtlara &ldquo;Fazladan Dağıtılan Kömür&rdquo; olarak işlenmiştir.
                    </div>
                  </div>
                )}
              </>
            );
          })()}

          {/* Sezonluk Kurum Sevkiyat İlerleme Çubuğu */}
          {Number(stats?.toplamTahsisTonaj || 0) > 0 && (
            <div className="p-2.5 rounded-xl bg-slate-50/70 border border-slate-200/80 space-y-1.5">
              <div className="flex items-center justify-between text-[11px] font-bold text-slate-600 flex-wrap gap-1">
                <span className="flex items-center gap-1.5 text-slate-700">
                  <Target className="w-3.5 h-3.5 text-indigo-600" />
                  <span>Kurumsal Kömür Sevkiyatı Gerçekleşme Durumu:</span>
                </span>
                <span>
                  <strong className="text-amber-800">{formatTonnage(stats?.toplamNetTonaj).combined}</strong>
                  {' / '}
                  <strong className="text-slate-900">{formatTonnage(stats?.toplamTahsisTonaj).combined}</strong>
                  {' '}
                  <span className="text-indigo-800 font-extrabold">
                    (%{stats?.tahsisTamamlanmaYuzdesi || 0} Ulaştı - Kalan: {formatTonnage(stats?.kalanTahsisTonaj).combined})
                  </span>
                </span>
              </div>
              <div className="w-full bg-slate-200 h-2.5 rounded-full overflow-hidden">
                <div
                  className="bg-gradient-to-r from-amber-500 via-indigo-600 to-emerald-600 h-full rounded-full transition-all duration-500"
                  style={{ width: `${Math.min(100, Math.max(0, Number(stats?.tahsisTamamlanmaYuzdesi) || 0))}%` }}
                />
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ======================================================== */}
      {/* ARA / BUL / FİLTRELE PANELİ (%100 TÜRKÇE KARAKTER UYUMLU) */}
      {/* ======================================================== */}
      <div className="p-4 rounded-2xl bg-white border border-slate-200 shadow-sm space-y-3">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div className="flex items-center gap-2">
            <Search className="w-4 h-4 text-amber-600" />
            <span className="text-xs font-extrabold text-slate-800 uppercase tracking-wider">
              Sevkiyat ve Tır Kayıtlarında Ara / Bul / Filtrele
            </span>
          </div>

          <div className="flex items-center gap-2 flex-wrap text-xs">
            <span className="px-2.5 py-1 rounded-lg bg-slate-100 border border-slate-200 text-slate-700 font-bold">
              Listelenen: <strong className="text-slate-900">{filteredMainTrucks.length}</strong> / {trucks.length} Tır
            </span>
            <span className="px-2.5 py-1 rounded-lg bg-amber-50 border border-amber-200 text-amber-900 font-bold">
              Filtre Net Tonaj: <strong className="font-mono">{formatTonnage(filteredMainNetTonaj).combined}</strong>
            </span>
            <span className="px-2.5 py-1 rounded-lg bg-teal-50 border border-teal-200 text-teal-900 font-bold" title="Filtrelenen tonajın 34 torbalık hane kapasitesi eşdeğeri">
              34 Torbalık Kapasite: <strong className="font-mono">{Math.floor(normalizeToTon(filteredMainNetTonaj) / 0.85).toLocaleString('tr-TR')} Hane</strong>
            </span>
            {hasActiveMainFilters && (
              <button
                type="button"
                onClick={resetMainFilters}
                className="px-2.5 py-1 rounded-lg bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 font-bold flex items-center gap-1 transition-colors"
              >
                <RotateCcw className="w-3 h-3" />
                <span>Filtreleri Temizle</span>
              </button>
            )}
          </div>
        </div>

        {/* Arama Kutusu + Plaka Seçimi + Sıralama */}
        <div className="grid grid-cols-1 md:grid-cols-12 gap-2.5">
          <div className="md:col-span-6 relative">
            <Search className="w-4 h-4 absolute left-3.5 top-2.5 text-slate-400" />
            <input
              type="text"
              value={mainSearchQuery}
              onChange={(e) => setMainSearchQuery(e.target.value)}
              placeholder="Tır plakası, tutanak no, irsaliye no, şoför adı veya açıklama ara..."
              className="w-full pl-9 pr-8 py-2 rounded-xl bg-slate-50 border border-slate-300 text-slate-900 placeholder-slate-400 text-xs font-semibold focus:outline-none focus:border-amber-500 focus:bg-white"
            />
            {mainSearchQuery && (
              <button
                type="button"
                onClick={() => setMainSearchQuery('')}
                className="absolute right-2.5 top-2 text-slate-400 hover:text-slate-700 p-0.5"
                title="Aramayı Temizle"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>

          <div className="md:col-span-3">
            <select
              value={mainPlakaFilter}
              onChange={(e) => setMainPlakaFilter(e.target.value)}
              className="w-full px-3 py-2 rounded-xl bg-slate-50 border border-slate-300 text-slate-900 text-xs font-bold focus:outline-none focus:border-amber-500 focus:bg-white"
              title="Tır Plakasına Göre Filtrele"
            >
              <option value="ALL">Tüm Tır Plakaları ({uniquePlakaList.length})</option>
              {uniquePlakaList.map((p) => (
                <option key={p} value={p}>
                  Plaka: {p}
                </option>
              ))}
            </select>
          </div>

          <div className="md:col-span-3">
            <select
              value={mainSortOrder}
              onChange={(e) => setMainSortOrder(e.target.value as any)}
              className="w-full px-3 py-2 rounded-xl bg-slate-50 border border-slate-300 text-slate-900 text-xs font-bold focus:outline-none focus:border-amber-500 focus:bg-white"
              title="Sıralama Ölçütü"
            >
              <option value="NEWEST">Sıralama: En Yeni Sevkiyat</option>
              <option value="OLDEST">Sıralama: En Eski Sevkiyat</option>
              <option value="TON_DESC">Net Tonaj: Yüksekten Düşüğe</option>
              <option value="TON_ASC">Net Tonaj: Düşükten Yükseğe</option>
            </select>
          </div>
        </div>

        {/* Hızlı Tarih Butonları ve Tarih Aralığı */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 pt-1 border-t border-slate-100">
          <div className="flex items-center gap-1.5 flex-wrap">
            {[
              { id: 'ALL', label: 'Tüm Sevkiyatlar' },
              { id: 'TODAY', label: 'Bugün Gelenler' },
              { id: 'WEEK', label: 'Son 7 Gün' },
              { id: 'MONTH', label: 'Son 30 Gün' },
              { id: 'DIFF_DATE', label: 'Ocak Çıkışı Farklı Gün Olanlar' }
            ].map((preset) => (
              <button
                key={preset.id}
                type="button"
                onClick={() => applyMainDatePreset(preset.id as any)}
                className={`px-2.5 py-1.5 rounded-xl text-[11px] font-bold border transition-all ${
                  mainDatePreset === preset.id
                    ? 'bg-amber-500 text-white border-amber-600 shadow-2xs'
                    : 'bg-slate-50 border-slate-200 text-slate-700 hover:bg-slate-100'
                }`}
              >
                {preset.label}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            <div className="flex items-center gap-1.5">
              <span className="text-[10px] font-bold text-slate-500 uppercase">Başlangıç:</span>
              <input
                type="date"
                value={mainStartDate}
                onChange={(e) => {
                  setMainStartDate(e.target.value);
                  setMainDatePreset('ALL');
                }}
                className="px-2.5 py-1 rounded-lg bg-slate-50 border border-slate-300 text-slate-900 text-xs font-semibold focus:outline-none focus:border-amber-500"
              />
            </div>
            <div className="flex items-center gap-1.5">
              <span className="text-[10px] font-bold text-slate-500 uppercase">Bitiş:</span>
              <input
                type="date"
                value={mainEndDate}
                onChange={(e) => {
                  setMainEndDate(e.target.value);
                  setMainDatePreset('ALL');
                }}
                className="px-2.5 py-1 rounded-lg bg-slate-50 border border-slate-300 text-slate-900 text-xs font-semibold focus:outline-none focus:border-amber-500"
              />
            </div>
          </div>
        </div>
      </div>

      {/* Trucks List Header & View Mode Switcher */}
      <div className="flex items-center justify-between px-1 flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wider">
            Gelen Tır Kayıtları ({filteredMainTrucks.length}{hasActiveMainFilters ? ` / ${trucks.length}` : ''})
          </h4>
          <span className="hidden sm:inline text-[11px] text-slate-500 font-medium">
            • Ocak çıkış, teslim ve tartım detayları
          </span>
        </div>

        {/* View Mode Toggle */}
        <div className="flex items-center bg-slate-100 p-0.5 rounded-xl border border-slate-200 text-xs">
          <button
            type="button"
            onClick={() => setMainViewMode('TABLE')}
            className={`flex items-center gap-1.5 px-3 py-1 rounded-lg font-bold transition-all ${
              mainViewMode === 'TABLE'
                ? 'bg-white text-slate-900 shadow-2xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
            title="Tablo Görünümü (Excel Sütun Sıralı)"
          >
            <ListFilter className="w-3.5 h-3.5" />
            <span>Tablo Görünümü</span>
          </button>
          <button
            type="button"
            onClick={() => setMainViewMode('CARDS')}
            className={`flex items-center gap-1.5 px-3 py-1 rounded-lg font-bold transition-all ${
              mainViewMode === 'CARDS'
                ? 'bg-white text-slate-900 shadow-2xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
            title="Kart Görünümü"
          >
            <LayoutGrid className="w-3.5 h-3.5" />
            <span>Kart Görünümü</span>
          </button>
        </div>
      </div>

      {/* List of Incoming Trucks - Table or Cards View */}
      {trucks.length === 0 ? (
        <div className="p-10 text-center rounded-2xl bg-white border border-slate-200 shadow-sm space-y-2">
          <Truck className="w-10 h-10 text-slate-400 mx-auto" />
          <p className="text-sm font-bold text-slate-800">Henüz tır kaydı bulunmuyor</p>
          <p className="text-xs text-slate-500">
            Kömür sahasına gelen tırları kaydetmek için &ldquo;Yeni Tır Girişi&rdquo; butonunu kullanın.
          </p>
        </div>
      ) : filteredMainTrucks.length === 0 ? (
        <div className="p-8 text-center rounded-2xl bg-white border border-slate-200 shadow-sm space-y-2.5">
          <Search className="w-8 h-8 text-slate-400 mx-auto" />
          <p className="text-sm font-bold text-slate-800">Arama veya filtre kriterlerine uygun tır kaydı bulunamadı</p>
          <p className="text-xs text-slate-500">
            Arama terimini değiştirebilir veya tüm kayıtları görmek için filtreleri sıfırlayabilirsiniz.
          </p>
          <button
            type="button"
            onClick={resetMainFilters}
            className="px-3.5 py-1.5 rounded-xl bg-amber-500 hover:bg-amber-600 text-white text-xs font-bold inline-flex items-center gap-1.5 shadow-xs transition-all"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>Filtreleri Temizle</span>
          </button>
        </div>
      ) : mainViewMode === 'TABLE' ? (
        <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="bg-slate-100 text-slate-800 border-b border-slate-200 font-bold uppercase text-[11px] tracking-wider">
                  <th className="p-3 text-center w-12">Sıra</th>
                  <th className="p-3">Tır Plakası & Şoför</th>
                  <th className="p-3">Sevk / Çıkış Tarihi</th>
                  <th className="p-3 text-right">Sevk Miktar (kg / Ton)</th>
                  <th className="p-3">Teslim Tarihi</th>
                  <th className="p-3 text-right">Teslim Miktar (kg / Ton)</th>
                  <th className="p-3 text-right">Fark (kg / Ton)</th>
                  <th className="p-3">İrsaliye No</th>
                  <th className="p-3">Tutanak No</th>
                  {userRole === 'ADMIN' && <th className="p-3 text-center w-28">İşlemler</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredMainTrucks.map((t) => {
                  const sevkFmt = formatTwoWayTonnage(t.brut_tonaj);
                  const teslimFmt = formatTwoWayTonnage(t.net_tonaj);
                  const diffFmt = formatTwoWayDiff(teslimFmt.kg - sevkFmt.kg);

                  return (
                    <tr key={t.id} className="hover:bg-slate-50/80 transition-colors">
                      <td className="p-3 text-center font-bold text-slate-600">
                        <span className="w-6 h-6 rounded-lg bg-amber-50 text-amber-800 border border-amber-200 inline-flex items-center justify-center font-bold text-xs">
                          #{t.tir_sirasi}
                        </span>
                      </td>
                      <td className="p-3">
                        <div className="font-mono font-bold text-slate-900 text-sm tracking-wider">
                          {t.plaka}
                        </div>
                        {t.sofor_adi && (
                          <div className="text-[11px] text-slate-500 font-medium">
                            {t.sofor_adi}
                          </div>
                        )}
                      </td>
                      <td className="p-3 text-slate-700 font-semibold whitespace-nowrap">
                        {formatTrDateWithDay(t.ocak_cikis_tarihi || t.tarih)}
                      </td>
                      <td className="p-3 text-right whitespace-nowrap">
                        <div className="font-mono font-bold text-slate-900">{sevkFmt.kgStr}</div>
                        <div className="text-[10px] text-slate-500 font-semibold font-mono">({sevkFmt.tonStr})</div>
                      </td>
                      <td className="p-3 text-slate-800 font-bold whitespace-nowrap">
                        {formatTrDateWithDay(t.tarih)}
                      </td>
                      <td className="p-3 text-right bg-amber-50/30 whitespace-nowrap">
                        <div className="font-mono font-black text-amber-900">{teslimFmt.kgStr}</div>
                        <div className="text-[10px] text-amber-800 font-bold font-mono">({teslimFmt.tonStr})</div>
                      </td>
                      <td className="p-3 text-right whitespace-nowrap">
                        <span className={`px-2 py-0.5 rounded-md text-xs font-mono font-bold inline-block ${
                          diffFmt.diffKg === 0
                            ? 'text-slate-600 bg-slate-100'
                            : diffFmt.diffKg > 0
                            ? 'text-emerald-700 bg-emerald-50 border border-emerald-200'
                            : 'text-rose-700 bg-rose-50 border border-rose-200'
                        }`}>
                          {diffFmt.combined}
                        </span>
                      </td>
                      <td className="p-3 font-mono font-bold text-slate-800 whitespace-nowrap">
                        {t.irsaliye_no}
                      </td>
                      <td className="p-3 font-mono text-slate-700 whitespace-nowrap">
                        {t.tutanak_no ? (
                          <span className="px-2 py-0.5 rounded-md bg-indigo-50 text-indigo-800 border border-indigo-200 font-bold text-xs">
                            {t.tutanak_no}
                          </span>
                        ) : (
                          <span className="text-slate-400">-</span>
                        )}
                      </td>
                      {userRole === 'ADMIN' && (
                        <td className="p-3 text-center whitespace-nowrap">
                          <div className="flex items-center justify-center gap-1">
                            <button
                              type="button"
                              onClick={() => openEditTruckModal(t)}
                              title="Düzenle"
                              className="p-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 transition-all"
                            >
                              <Pencil className="w-3.5 h-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                setEditingTruckId(null);
                                setTirSirasi(stats?.sonrakiTirSirasi || (trucks.length + 1));
                                const todayStr = todayDefault();
                                setTarih(todayStr);
                                setOcakCikisTarihi(todayStr);
                                applyTruckTemplate(t);
                                setShowAddModal(true);
                              }}
                              title="Şablon Al"
                              className="p-1.5 rounded-lg bg-amber-50 hover:bg-amber-100 text-amber-800 transition-all"
                            >
                              <Copy className="w-3.5 h-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={() => handleDeleteTruck(t.id, t.plaka)}
                              title="Sil"
                              className="p-1.5 rounded-lg hover:bg-rose-50 text-slate-400 hover:text-rose-600 transition-all"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3.5">
          {filteredMainTrucks.map((t) => {
            const hasDiffDeparture = Boolean(t.ocak_cikis_tarihi && t.ocak_cikis_tarihi !== t.tarih);
            return (
              <div
                key={t.id}
                className="p-4 rounded-2xl bg-white border border-slate-200 shadow-sm hover:border-slate-300 transition-all space-y-2.5"
              >
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="w-6 h-6 rounded-lg bg-amber-100 text-amber-800 border border-amber-300 flex items-center justify-center font-bold text-xs">
                      #{t.tir_sirasi}
                    </span>
                    <div
                      className="px-3 py-1 rounded-lg bg-slate-900 text-white font-mono font-bold tracking-wider text-sm shadow-inner"
                      title="Tır Plakası"
                    >
                      {t.plaka}
                    </div>
                    {t.tutanak_no && (
                      <div
                        className="px-2.5 py-1 rounded-lg bg-indigo-50 text-indigo-900 border border-indigo-200 font-mono font-bold tracking-wider text-xs"
                        title="Tutanak Numarası"
                      >
                        Tutanak: {t.tutanak_no}
                      </div>
                    )}
                  </div>

                  {userRole === 'ADMIN' && (
                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => openEditTruckModal(t)}
                        title="Bu tır kaydının bilgilerini düzenle"
                        className="px-2.5 py-1 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-800 border border-slate-300 text-[11px] font-bold flex items-center gap-1 transition-all active:scale-95"
                      >
                        <Pencil className="w-3 h-3 text-slate-600" />
                        <span>Düzenle</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setEditingTruckId(null);
                          setTirSirasi(stats?.sonrakiTirSirasi || (trucks.length + 1));
                          const todayStr = todayDefault();
                          setTarih(todayStr);
                          setOcakCikisTarihi(todayStr);
                          applyTruckTemplate(t);
                          setShowAddModal(true);
                        }}
                        title="Bu tırın bilgilerini şablon olarak kullanarak yeni tır girişi aç"
                        className="px-2.5 py-1 rounded-lg bg-amber-50 hover:bg-amber-100 text-amber-800 border border-amber-200 text-[11px] font-bold flex items-center gap-1 transition-all active:scale-95"
                      >
                        <Copy className="w-3 h-3" />
                        <span>Şablon Al</span>
                      </button>
                      <button
                        onClick={() => handleDeleteTruck(t.id, t.plaka)}
                        title="Tır Kaydını Sil"
                        className="p-1.5 text-slate-400 hover:text-rose-600 rounded-lg transition-colors"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  )}
                </div>

                {/* Ocak Çıkış & Sahaya Geliş Tarihleri Satırı */}
                <div className="flex flex-wrap items-center gap-2 text-[11px] font-semibold">
                  <span className="px-2.5 py-1 rounded-lg bg-slate-100 text-slate-700 border border-slate-200 flex items-center gap-1">
                    <Calendar className="w-3 h-3 text-slate-500" />
                    <span>Ocak Çıkış: <strong className="text-slate-900">{formatTrDateWithDay(t.ocak_cikis_tarihi || t.tarih)}</strong></span>
                  </span>
                  <span
                    className={`px-2.5 py-1 rounded-lg border flex items-center gap-1 ${
                      hasDiffDeparture
                        ? 'bg-amber-50 text-amber-900 border-amber-200'
                        : 'bg-emerald-50 text-emerald-900 border-emerald-200'
                    }`}
                  >
                    <Calendar className="w-3 h-3" />
                    <span>Sahaya Geliş: <strong>{formatTrDateWithDay(t.tarih)}</strong></span>
                  </span>
                </div>

                {/* Tonnage Detail Row (İki Gösterimli: kg ve Ton) */}
                {(() => {
                  const sevkFmt = formatTwoWayTonnage(t.brut_tonaj);
                  const teslimFmt = formatTwoWayTonnage(t.net_tonaj);
                  const diffFmt = formatTwoWayDiff(teslimFmt.kg - sevkFmt.kg);

                  return (
                    <div className="grid grid-cols-3 gap-2 p-2.5 rounded-xl bg-slate-50 border border-slate-200 text-center">
                      <div>
                        <span className="text-[10px] uppercase font-bold text-slate-500">Sevk Miktarı</span>
                        <p className="text-sm font-bold text-slate-900 mt-0.5 font-mono">{sevkFmt.kgStr}</p>
                        <span className="text-[10px] font-semibold text-slate-500 block font-mono">({sevkFmt.tonStr})</span>
                      </div>
                      <div className="border-x border-slate-200 bg-amber-50/60 rounded-lg py-0.5">
                        <span className="text-[10px] uppercase font-extrabold text-amber-900">Teslim Miktarı</span>
                        <p className="text-sm font-black text-amber-800 mt-0.5 font-mono">{teslimFmt.kgStr}</p>
                        <span className="text-[10px] font-bold text-amber-900 block font-mono">({teslimFmt.tonStr})</span>
                      </div>
                      <div>
                        <span className="text-[10px] uppercase font-bold text-slate-500">Tartı Farkı</span>
                        <p className={`text-sm font-black mt-0.5 font-mono ${
                          diffFmt.diffKg === 0 ? 'text-slate-700' : diffFmt.diffKg > 0 ? 'text-emerald-700' : 'text-rose-700'
                        }`}>
                          {diffFmt.kgStr}
                        </p>
                        <span className="text-[10px] font-semibold text-slate-500 block font-mono">
                          ({diffFmt.tonStr})
                        </span>
                      </div>
                    </div>
                  );
                })()}

                {/* Details (Irsaliye, Sofor, Notlar) */}
                <div className="flex items-center justify-between text-xs text-slate-600 pt-1 font-medium flex-wrap gap-1">
                  <span className="flex items-center gap-1">
                    <FileText className="w-3.5 h-3.5 text-slate-400" />
                    İrsaliye / Fiş No: <strong className="text-slate-900 font-bold">{t.irsaliye_no}</strong>
                  </span>
                  {t.sofor_adi && <span>Şoför: <strong className="text-slate-800">{t.sofor_adi}</strong></span>}
                </div>

                {t.notlar && (
                  <p className="text-[11px] text-slate-600 italic bg-slate-50 p-2 rounded-lg border border-slate-100">
                    {t.notlar}
                  </p>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Add / Edit Truck Modal - Light Mode */}
      {showAddModal && (
        <div className="modal-overlay" onClick={() => setShowAddModal(false)}>
          <div className="modal-sheet" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between pb-3 border-b border-slate-200 mb-3">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-amber-100 text-amber-800 flex items-center justify-center border border-amber-200">
                  <Truck className="w-5 h-5 text-amber-700" />
                </div>
                <div>
                  <h3 className="text-base font-extrabold text-slate-900">
                    {editingTruckId ? `Tır Kaydını Düzenle (#${tirSirasi})` : 'Yeni Gelen Tır Kaydı'}
                  </h3>
                  <p className="text-xs text-slate-500">
                    {editingTruckId
                      ? 'Mevcut tır sevkiyatı, plaka, tarih ve tonaj bilgilerini güncelleyin'
                      : 'Kömür sevkiyatı, tutanak no ve tonaj girişi'}
                  </p>
                </div>
              </div>
              <button
                onClick={() => setShowAddModal(false)}
                className="text-slate-400 hover:text-slate-700 p-1 rounded-lg text-sm"
              >
                ✕
              </button>
            </div>

            {errorMsg && (
              <div className="p-3 mb-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs flex items-center gap-2 font-medium">
                <AlertCircle className="w-4 h-4 shrink-0 text-rose-600" />
                <span>{errorMsg}</span>
              </div>
            )}

            {/* ÖNCEKİ KAYITLARDAN TEK TIKLA ŞABLON DOLDURMA ALANI (Sadece Yeni Kayıt Modunda) */}
            {!editingTruckId && trucks.length > 0 && (
              <div className="p-3 mb-3.5 rounded-xl bg-amber-50/70 border border-amber-200 space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-1.5 text-xs font-extrabold text-amber-950">
                    <Copy className="w-3.5 h-3.5 text-amber-700 shrink-0" />
                    <span>Önceki Kayıttan Tek Tıkla Doldur (Şablon Seç)</span>
                  </div>
                  {selectedTemplateId && (
                    <button
                      type="button"
                      onClick={resetAddForm}
                      className="text-[11px] font-bold text-slate-600 hover:text-rose-700 flex items-center gap-1 px-2 py-0.5 rounded-md bg-white border border-slate-200"
                    >
                      <RotateCcw className="w-3 h-3" />
                      <span>Temizle</span>
                    </button>
                  )}
                </div>

                {/* Hızlı Tır/Şoför Kartları (Tek Tıkla Seçim) */}
                <div className="flex items-center gap-1.5 overflow-x-auto pb-1 no-scrollbar">
                  {uniqueTruckTemplates.map((t) => {
                    const tid = String(t.id || t._id || t.tir_sirasi);
                    const isSelected = selectedTemplateId === tid;
                    return (
                      <button
                        key={tid}
                        type="button"
                        onClick={() => applyTruckTemplate(t)}
                        className={`px-2.5 py-1.5 rounded-xl border text-left shrink-0 transition-all active:scale-95 ${
                          isSelected
                            ? 'bg-amber-500 text-white border-amber-600 shadow-xs'
                            : 'bg-white hover:bg-amber-100/60 text-slate-800 border-amber-200/90'
                        }`}
                      >
                        <div className="flex items-center gap-1.5">
                          <span className="font-mono text-xs font-black">{t.plaka}</span>
                          {t.tutanak_no && (
                            <span
                              className={`font-mono text-[10px] font-bold px-1.5 py-0.2 rounded ${
                                isSelected ? 'bg-amber-700 text-white' : 'bg-indigo-50 text-indigo-900 border border-indigo-200'
                              }`}
                            >
                              Tutanak: {t.tutanak_no}
                            </span>
                          )}
                        </div>
                        <div
                          className={`text-[10px] font-semibold truncate max-w-[160px] mt-0.5 ${
                            isSelected ? 'text-amber-50' : 'text-slate-500'
                          }`}
                        >
                          {t.sofor_adi || 'Şoför Belirtilmemiş'} • {formatTonnage(t.net_tonaj).compact}
                        </div>
                      </button>
                    );
                  })}
                </div>

                {/* Tüm Geçmiş Kayıtlar Açılır Seçim Kutusu */}
                <div>
                  <select
                    value={selectedTemplateId}
                    onChange={(e) => {
                      const val = e.target.value;
                      if (!val) {
                        resetAddForm();
                        return;
                      }
                      const found = trucks.find((item) => String(item.id || item._id || item.tir_sirasi) === val);
                      if (found) applyTruckTemplate(found);
                    }}
                    className="w-full px-3 py-1.5 rounded-lg bg-white border border-amber-300 text-xs font-bold text-slate-800 focus:outline-none focus:border-amber-600"
                  >
                    <option value="">— Veya Tüm Geçmiş Tır Kayıtlarından Seçin ({trucks.length} Kayıt) —</option>
                    {trucks.map((t) => {
                      const tid = String(t.id || t._id || t.tir_sirasi);
                      return (
                        <option key={tid} value={tid}>
                          #{t.tir_sirasi} | {t.plaka}
                          {t.tutanak_no ? ` (Tutanak: ${t.tutanak_no})` : ''} — {t.sofor_adi || 'Şoför Yok'} — Net: {formatTonnage(t.net_tonaj).combined} ({t.tarih})
                        </option>
                      );
                    })}
                  </select>
                </div>
              </div>
            )}

            <form onSubmit={handleAddTruck} className="space-y-3.5">
              {/* Sıra ve İrsaliye */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-600 uppercase tracking-wider mb-1">
                    Gelen Tır Sırası
                  </label>
                  <input
                    type="number"
                    min="1"
                    value={tirSirasi}
                    onChange={(e) => setTirSirasi(parseInt(e.target.value, 10) || 1)}
                    className="w-full px-3.5 py-2 rounded-xl bg-slate-50 border border-slate-300 text-slate-900 font-bold focus:outline-none focus:border-amber-500 focus:bg-white text-sm"
                    required
                  />
                </div>

                <div>
                  <label className="flex items-center justify-between text-xs font-bold text-slate-600 uppercase tracking-wider mb-1">
                    <span>İrsaliye / Teslimat No</span>
                    <span className="px-1.5 py-0.5 rounded bg-amber-100 text-amber-800 border border-amber-300 text-[9px] font-black">
                      BİRİNCİL / TEKİL
                    </span>
                  </label>
                  <input
                    type="text"
                    value={irsaliyeNo}
                    onChange={(e) => setIrsaliyeNo(e.target.value.toLocaleUpperCase('tr-TR'))}
                    placeholder="Örn: IRS-2026-004"
                    className={`w-full px-3.5 py-2 rounded-xl font-mono font-bold focus:outline-none text-sm transition-colors ${
                      duplicateIrsaliyeTruck
                        ? 'bg-rose-50 border-2 border-rose-500 text-rose-900 focus:border-rose-600'
                        : 'bg-slate-50 border border-slate-300 text-slate-900 focus:border-amber-500 focus:bg-white'
                    }`}
                    required
                  />
                  {duplicateIrsaliyeTruck ? (
                    <p className="mt-1 text-[11px] font-bold text-rose-700 leading-tight">
                      ⚠️ Bu irsaliye no zaten kayıtlı: #{duplicateIrsaliyeTruck.tir_sirasi} ({duplicateIrsaliyeTruck.plaka} • {duplicateIrsaliyeTruck.tarih})
                    </p>
                  ) : irsaliyeNo.trim().length > 0 ? (
                    <p className="mt-1 text-[10px] font-bold text-emerald-700">
                      ✓ Benzersiz İrsaliye Numarası
                    </p>
                  ) : null}
                </div>
              </div>

              {/* Ocak Yükleme/Çıkış Tarihi & Dağıtım Sahasına Geliş Tarihi */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-600 uppercase tracking-wider mb-1">
                    Ocaktan Yükleme / Çıkış Tarihi
                  </label>
                  <input
                    type="date"
                    value={ocakCikisTarihi}
                    onChange={(e) => setOcakCikisTarihi(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl bg-slate-50 border border-slate-300 text-slate-900 focus:outline-none focus:border-amber-500 focus:bg-white font-medium text-xs sm:text-sm"
                    required
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-600 uppercase tracking-wider mb-1">
                    Sahaya Geliş Tarihi
                  </label>
                  <input
                    type="date"
                    value={tarih}
                    onChange={(e) => setTarih(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl bg-slate-50 border border-slate-300 text-slate-900 focus:outline-none focus:border-amber-500 focus:bg-white font-medium text-xs sm:text-sm"
                    required
                  />
                </div>
              </div>

              {/* Tır Plakası & Tutanak No */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-600 uppercase tracking-wider mb-1">
                    Tır Plakası
                  </label>
                  <input
                    type="text"
                    value={plaka}
                    onChange={(e) => setPlaka(e.target.value.toUpperCase())}
                    placeholder="Örn: 17 ACJ 824"
                    className="w-full px-3.5 py-2 rounded-xl bg-slate-50 border border-slate-300 text-slate-900 font-mono uppercase font-black focus:outline-none focus:border-amber-500 focus:bg-white text-sm"
                    required
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-600 uppercase tracking-wider mb-1">
                    Tutanak No (Opsiyonel)
                  </label>
                  <input
                    type="text"
                    value={tutanakNo}
                    onChange={(e) => setTutanakNo(e.target.value.toLocaleUpperCase('tr-TR'))}
                    placeholder="Örn: 2025/1 veya TUT-01"
                    className="w-full px-3.5 py-2 rounded-xl bg-slate-50 border border-slate-300 text-slate-900 font-mono uppercase font-bold focus:outline-none focus:border-amber-500 focus:bg-white text-sm"
                  />
                </div>
              </div>

              {/* Tonaj Alanları (İşletmeden Yüklenen & Sahada Teslim Alınan) */}
              <div className="p-3 rounded-xl bg-slate-50 border border-slate-200 space-y-2.5">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-bold text-slate-600 uppercase tracking-wider mb-1">
                      İşletmeden Yüklenen / Sevk (Ton / kg)
                    </label>
                    <input
                      type="number"
                      step="any"
                      value={brutTonaj}
                      onChange={(e) => setBrutTonaj(e.target.value)}
                      placeholder="Örn: 26.58 veya 26580"
                      className="w-full px-3 py-2 rounded-xl bg-white border border-slate-300 text-slate-900 font-bold focus:outline-none focus:border-amber-500 text-sm"
                      required
                    />
                    {brutTonaj && (
                      <span className="text-[11px] font-semibold text-slate-600 block mt-1">
                        Karşılığı: <strong className="text-slate-900">{formatTonnage(brutTonaj).combined}</strong>
                      </span>
                    )}
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-amber-800 uppercase tracking-wider mb-1">
                      Teslim Alınan Net Kömür (Ton / kg)
                    </label>
                    <input
                      type="number"
                      step="any"
                      value={netTonaj}
                      onChange={(e) => setNetTonaj(e.target.value)}
                      placeholder="Örn: 26.46 veya 26460"
                      className="w-full px-3 py-2 rounded-xl bg-white border border-amber-400 text-amber-900 font-black focus:outline-none focus:border-amber-500 text-sm"
                      required
                    />
                    {netTonaj && (
                      <span className="text-[11px] font-semibold text-amber-900 block mt-1">
                        Karşılığı: <strong className="text-amber-950 font-bold">{formatTonnage(netTonaj).combined}</strong>
                      </span>
                    )}
                  </div>
                </div>

                {/* Tesellüm / Tartı Farkı Gösterimi (Teslim - Sevk) */}
                {(() => {
                  const sevkTon = normalizeToTon(brutTonaj);
                  const teslimTon = normalizeToTon(netTonaj);
                  const diffKg = Math.round((teslimTon - sevkTon) * 1000);
                  return (
                    <div className="flex items-center justify-between text-xs text-slate-700 pt-2 border-t border-slate-200 font-medium">
                      <span>Tartı / Tesellüm Farkı (Teslim - Sevk):</span>
                      <span className={`font-mono font-bold px-2.5 py-1 rounded-md border ${
                        diffKg === 0
                          ? 'bg-white text-slate-700 border-slate-200'
                          : diffKg > 0
                          ? 'bg-emerald-50 text-emerald-800 border-emerald-300'
                          : 'bg-rose-50 text-rose-800 border-rose-300'
                      }`}>
                        {diffKg > 0 ? `+${diffKg.toLocaleString('tr-TR')}` : diffKg.toLocaleString('tr-TR')} kg
                      </span>
                    </div>
                  );
                })()}
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-600 uppercase tracking-wider mb-1">
                    Şoför Adı (Opsiyonel)
                  </label>
                  <input
                    type="text"
                    value={soforAdi}
                    onChange={(e) => setSoforAdi(e.target.value)}
                    placeholder="Örn: Kadir Vural"
                    className="w-full px-3.5 py-2 rounded-xl bg-slate-50 border border-slate-300 text-slate-900 text-sm focus:outline-none focus:border-amber-500 focus:bg-white"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-600 uppercase tracking-wider mb-1">
                    Açıklama / Menşe
                  </label>
                  <input
                    type="text"
                    value={notlar}
                    onChange={(e) => setNotlar(e.target.value)}
                    placeholder="Örn: Soma Linyit 1. Kalite"
                    className="w-full px-3.5 py-2 rounded-xl bg-slate-50 border border-slate-300 text-slate-900 text-sm focus:outline-none focus:border-amber-500 focus:bg-white"
                  />
                </div>
              </div>

              <div className="pt-2 flex gap-3">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  disabled={isSubmitting}
                  className="btn-secondary flex-1"
                >
                  İptal
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting || Boolean(duplicateIrsaliyeTruck)}
                  className="btn-primary flex-1 font-bold disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isSubmitting
                    ? 'Kaydediliyor...'
                    : duplicateIrsaliyeTruck
                      ? 'Mükerrer İrsaliye No!'
                      : editingTruckId
                        ? 'Değişiklikleri Kaydet'
                        : 'Tırı Kaydet'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
      {/* ======================================================== */}
      {/* RESMİ KÖMÜR SEVKİYATI VE KANTAR TONAJ RAPORU MODALI      */}
      {/* ======================================================== */}
      {showReportModal && typeof document !== 'undefined' && createPortal(
        <div 
          className="report-modal-overlay fixed inset-0 z-[100] flex items-center justify-center p-2 sm:p-4 md:p-6 bg-slate-950/80 backdrop-blur-xs"
          onClick={(e) => {
            if (e.target === e.currentTarget) {
              setShowReportModal(false);
            }
          }}
        >
          {/* Modal Panel: Sabit %92 ekran yüksekliği ve flex düzeni ile tüm içerik scroll edilir */}
          <div className="report-modal-card relative bg-white rounded-2xl sm:rounded-3xl w-full max-w-5xl h-[92vh] max-h-[92vh] flex flex-col shadow-2xl border border-slate-300 overflow-hidden z-10">
            
            {/* Modal Header: Daima üstte sabit kalır */}
            <div className="report-modal-header shrink-0 h-14 sm:h-16 px-4 sm:px-6 border-b border-slate-200 flex items-center justify-between bg-slate-100 z-20 no-print">
              <div className="flex items-center gap-2.5 min-w-0">
                <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl bg-amber-600 text-white flex items-center justify-center shadow-xs shrink-0">
                  <Truck className="w-5 h-5" />
                </div>
                <div className="truncate">
                  <h3 className="text-xs sm:text-sm md:text-base font-black text-slate-900 truncate">
                    Kömür Sevkiyatı ve Saha Kantar Tonaj Raporu
                  </h3>
                  <p className="text-[10px] sm:text-xs text-slate-500 font-semibold flex items-center gap-1.5 flex-wrap">
                    <span>Kapsam: <strong className="text-slate-800">{reportStartDate && reportEndDate ? `${reportStartDate} - ${reportEndDate}` : 'Tüm Sevkiyatlar'}</strong></span>
                    <span>•</span>
                    <span>Gelen Tır: <strong className="text-emerald-700">{filteredReportTrucks.length} Adet</strong></span>
                    <span>•</span>
                    <span>Net Kömür: <strong className="text-amber-800">{formatTonnage(reportTotalNet).combined}</strong></span>
                    {Number(stats?.toplamTahsisTonaj || 0) > 0 && (
                      <>
                        <span>•</span>
                        <span>Kurum Tahsisi: <strong className="text-indigo-800">{formatTonnage(stats?.toplamTahsisTonaj).combined}</strong></span>
                        <span>•</span>
                        <span>Kalan Sevkiyat: <strong className="text-sky-800">{formatTonnage(stats?.kalanTahsisTonaj).combined}</strong></span>
                      </>
                    )}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2 shrink-0 ml-2">
                <button
                  type="button"
                  onClick={() => setShowReportModal(false)}
                  className="px-3 py-1.5 rounded-xl bg-slate-200 hover:bg-rose-100 hover:text-rose-700 text-slate-700 text-xs font-black flex items-center gap-1.5 transition-all active:scale-95 shadow-2xs"
                  title="Pencereyi Kapat (ESC)"
                >
                  <X className="w-4 h-4" />
                  <span className="hidden sm:inline">Kapat (ESC)</span>
                </button>
              </div>
            </div>

            {/* Modal Body / Printable Content (Yalnızca içerik kayar, başlık ve butonlar asla kaybolmaz) */}
            <div 
              className="report-modal-body flex-1 min-h-0 overflow-y-auto overflow-x-auto p-3.5 sm:p-6 pb-14 space-y-4 text-xs text-slate-800 bg-white" 
              id="printableTonnageReport"
              style={{ overscrollBehavior: 'contain' }}
            >
              {/* Tarih Aralığı, Format Seçimi ve Arama Filtre Paneli (Baskıda Görünmez) */}
              <div className="p-3.5 sm:p-4 rounded-2xl bg-slate-50 border border-slate-200 space-y-3 no-print">
                {/* Rapor Formatı Seçim Sekmeleri */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 p-1.5 bg-white rounded-xl border border-slate-300">
                  <span className="text-[11px] font-black uppercase text-slate-700 px-2 shrink-0">Rapor Şablonu:</span>
                  <div className="flex items-center gap-1.5 flex-1 w-full">
                    <button
                      type="button"
                      onClick={() => setReportFormat('TESELLUM')}
                      className={`flex-1 py-1.5 px-3 rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-1.5 ${
                        reportFormat === 'TESELLUM'
                          ? 'bg-amber-600 text-white shadow-xs'
                          : 'text-slate-700 hover:bg-slate-100'
                      }`}
                    >
                      <FileSpreadsheet className="w-3.5 h-3.5" />
                      <span>Format 1: Tesellümleri İzleme Tablosu (Valilik / Günlük)</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setReportFormat('TKI')}
                      className={`flex-1 py-1.5 px-3 rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-1.5 ${
                        reportFormat === 'TKI'
                          ? 'bg-amber-600 text-white shadow-xs'
                          : 'text-slate-700 hover:bg-slate-100'
                      }`}
                    >
                      <FileSpreadsheet className="w-3.5 h-3.5" />
                      <span>Format 2: TKİ Dağıtım Listesi (Resmi / Tutanak)</span>
                    </button>
                  </div>
                </div>

                <div className="flex items-center justify-between pt-1">
                  <span className="text-xs font-bold text-slate-700 flex items-center gap-1.5 uppercase tracking-wider">
                    <Calendar className="w-4 h-4 text-amber-600" />
                    Rapor Tarih Aralığı ve Filtreleme
                  </span>
                  <span className="text-[11px] text-slate-500 font-medium">
                    Filtrelenen: <strong>{filteredReportTrucks.length}</strong> / {trucks.length} Tır
                  </span>
                </div>

                {/* Hızlı Tarih Butonları */}
                <div className="flex flex-wrap gap-1.5">
                  {[
                    { id: 'ALL', label: 'Tüm Sevkiyatlar' },
                    { id: 'TODAY', label: 'Bugün' },
                    { id: 'WEEK', label: 'Son 7 Gün' },
                    { id: 'MONTH', label: 'Son 30 Gün' }
                  ].map((preset) => (
                    <button
                      key={preset.id}
                      type="button"
                      onClick={() => applyReportPreset(preset.id as any)}
                      className={`px-3 py-1.5 rounded-xl text-xs font-bold border transition-all ${
                        reportPreset === preset.id
                          ? 'bg-amber-500 text-white border-amber-600 shadow-xs'
                          : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-100'
                      }`}
                    >
                      {preset.label}
                    </button>
                  ))}
                </div>

                {/* Tarih Girişleri ve Plaka / Şoför Arama */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 pt-1">
                  <div>
                    <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1">
                      Başlangıç Tarihi
                    </label>
                    <input
                      type="date"
                      value={reportStartDate}
                      onChange={(e) => {
                        setReportStartDate(e.target.value);
                        setReportPreset('CUSTOM' as any);
                      }}
                      className="w-full px-3 py-2 rounded-xl bg-white border border-slate-300 text-slate-900 text-xs font-semibold focus:outline-none focus:border-amber-500 shadow-2xs"
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1">
                      Bitiş Tarihi
                    </label>
                    <input
                      type="date"
                      value={reportEndDate}
                      onChange={(e) => {
                        setReportEndDate(e.target.value);
                        setReportPreset('CUSTOM' as any);
                      }}
                      className="w-full px-3 py-2 rounded-xl bg-white border border-slate-300 text-slate-900 text-xs font-semibold focus:outline-none focus:border-amber-500 shadow-2xs"
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1">
                      Plaka / İrsaliye / Şoför / Tutanak Ara
                    </label>
                    <div className="relative">
                      <Search className="w-3.5 h-3.5 absolute left-3 top-2.5 text-slate-400" />
                      <input
                        type="text"
                        value={reportSearchQuery}
                        onChange={(e) => setReportSearchQuery(e.target.value)}
                        placeholder="Örn: 17 ACJ, Uğurlu, TUT-01..."
                        className="w-full pl-8 pr-3 py-2 rounded-xl bg-white border border-slate-300 text-slate-900 text-xs font-semibold focus:outline-none focus:border-amber-500 shadow-2xs"
                      />
                    </div>
                  </div>
                </div>
              </div>

              {/* Institutional Official Header - Format 1 vs Format 2 */}
              <div className="p-3 sm:p-4 rounded-2xl bg-white border border-slate-300 text-center space-y-1 shadow-2xs">
                <div className="flex items-center justify-between pb-3 border-b-2 border-slate-900 gap-2">
                  <div className="w-12 h-12 sm:w-14 sm:h-14 shrink-0 flex items-center justify-center p-1 bg-white rounded-full border border-slate-200">
                    <img
                      src="/edirne-sydv-logo.png"
                      alt="Edirne Sosyal Yardımlaşma ve Dayanışma Vakfı Başkanlığı"
                      width={48}
                      height={48}
                      className="print-logo-img"
                      style={{ width: '100%', height: '100%', objectFit: 'contain' }}
                    />
                  </div>
                  <div className="text-center flex-1 px-1 sm:px-3 min-w-0">
                    {reportFormat === 'TESELLUM' ? (
                      <>
                        <h4 className="text-xs sm:text-base font-black uppercase text-slate-950 tracking-wide">
                          TESELLÜMLERİ İZLEME TABLOSU
                        </h4>
                        <p className="text-[10px] sm:text-xs font-bold text-slate-700 uppercase mt-0.5">
                          (GÜNLÜK OLARAK VALİLİK GÖREVLİSİ TARAFINDAN DOLDURULACAKTIR)
                        </p>
                        <div className="flex items-center justify-between text-xs font-extrabold text-slate-900 pt-1.5 mt-1 border-t border-slate-200">
                          <span>İLİ / İLÇESİ : EDİRNE / MERKEZ</span>
                          <span>TARİH : {reportEndDate ? formatTrDateWithDay(reportEndDate) : formatTrDateWithDay(new Date())}</span>
                        </div>
                      </>
                    ) : (
                      <>
                        <p className="text-[10px] sm:text-[11px] font-black uppercase text-slate-800 tracking-wider">
                          TÜRKİYE KÖMÜR İŞLETMELERİ KURUMU
                        </p>
                        <h4 className="text-xs sm:text-base font-black uppercase text-slate-950 tracking-wide mt-0.5">
                          ÇAN LİNYİT İŞLETMESİ MÜDÜRLÜĞÜ {new Date().getFullYear()} YILI EDİRNE/MERKEZ İLÇESİNE SOSYAL YARDIMLAŞMA VE DAYANIŞMA VAKIFLARI ARACILIĞI İLE VERİLEN KÖMÜR LİSTESİ
                        </h4>
                      </>
                    )}
                  </div>
                  <div className="w-12 sm:w-14 shrink-0 hidden sm:block text-right">
                    <span className="text-[9px] font-mono text-slate-400 block">KOD: {reportFormat === 'TESELLUM' ? 'TSL-VALILIK' : 'TKI-DAGITIM'}</span>
                    <span className="text-[9px] font-mono text-slate-400 block mt-0.5">{formatTrDateWithDay(new Date())}</span>
                  </div>
                </div>

                <div className="pt-2 flex flex-wrap items-center justify-between text-[11px] text-slate-600 gap-2 font-medium">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span>Rapor Kapsamı: <strong className="text-slate-900">{reportStartDate && reportEndDate ? `${formatTrDateWithDay(reportStartDate)} - ${formatTrDateWithDay(reportEndDate)}` : 'Tüm Kömür Sevkiyatı Dönemi'}</strong></span>
                    {reportSearchQuery && (
                      <>
                        <span>•</span>
                        <span>Filtre: <strong className="text-slate-900">&ldquo;{reportSearchQuery}&rdquo;</strong></span>
                      </>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <span>Rapor Tarihi: <strong className="text-slate-900">{formatTrDateTime(new Date())}</strong></span>
                  </div>
                </div>
              </div>

              {/* 4 Summary KPI Metric Cards */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-center text-xs">
                <div className="p-3 rounded-xl bg-slate-50 border border-slate-200">
                  <span className="text-[10px] font-bold text-slate-500 uppercase block">Gelen Tır Sayısı</span>
                  <div className="text-lg font-black text-slate-900 mt-0.5">
                    {filteredReportTrucks.length} <span className="text-xs font-normal text-slate-500">Adet</span>
                  </div>
                </div>

                <div className="p-3 rounded-xl bg-amber-50 border border-amber-200">
                  <span className="text-[10px] font-bold text-amber-800 uppercase block">Teslim Alınan Net Kömür</span>
                  <div className="text-lg font-black text-amber-900 mt-0.5">
                    {reportTotalTeslimKg.toLocaleString('tr-TR')} <span className="text-xs font-bold text-amber-800">kg</span>
                  </div>
                  <div className="text-[10px] text-amber-800 font-bold">
                    ({formatTonnage(reportTotalNet).tonStr})
                  </div>
                </div>

                <div className="p-3 rounded-xl bg-slate-50 border border-slate-200">
                  <span className="text-[10px] font-bold text-slate-500 uppercase block">İşletmeden Sevk Edilen</span>
                  <div className="text-lg font-black text-slate-900 mt-0.5">
                    {reportTotalYuklenenKg.toLocaleString('tr-TR')} <span className="text-xs font-bold text-slate-600">kg</span>
                  </div>
                  <div className="text-[10px] text-slate-600 font-bold">
                    ({formatTonnage(reportTotalBrut).tonStr})
                  </div>
                </div>

                <div className="p-3 rounded-xl bg-slate-50 border border-slate-200">
                  <span className="text-[10px] font-bold text-slate-500 uppercase block">Net Tartı / Tesellüm Farkı</span>
                  <div className={`text-lg font-black mt-0.5 ${
                    reportTotalFarkKg === 0 ? 'text-slate-900' : reportTotalFarkKg > 0 ? 'text-emerald-700' : 'text-rose-700'
                  }`}>
                    {reportTotalFarkKg > 0 ? `+${reportTotalFarkKg.toLocaleString('tr-TR')}` : reportTotalFarkKg.toLocaleString('tr-TR')} <span className="text-xs font-normal text-slate-500">kg</span>
                  </div>
                  <div className="text-[10px] text-slate-500 font-bold">
                    {reportTotalFarkKg === 0 ? 'Eşit Sevk' : reportTotalFarkKg > 0 ? 'Fazla Teslim' : 'Eksik Sevk'}
                  </div>
                </div>
              </div>

              {/* Kurumsal Sevkiyat, Tahsis ve Saha Stok Bilançosu */}
              <div className="p-3.5 sm:p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-2.5 text-xs">
                <div className="flex items-center justify-between border-b border-slate-200 pb-2 flex-wrap gap-2">
                  <span className="text-[11px] font-black uppercase tracking-wider text-slate-800 flex items-center gap-1.5">
                    <Target className="w-3.5 h-3.5 text-indigo-600 no-print" />
                    <span>Kurumsal Sevkiyat, Tahsis ve Saha Stok Bilançosu</span>
                  </span>
                  {Number(stats?.toplamTahsisTonaj || 0) > 0 && (
                    <span className="text-[11px] font-bold text-indigo-900">
                      Tahsis Gerçekleşme Oranı: <strong className="font-mono text-indigo-950">%{stats?.tahsisTamamlanmaYuzdesi || 0}</strong>
                    </span>
                  )}
                </div>

                <div className={`grid grid-cols-2 ${Number(stats?.fazlaDagitilanTonaj || 0) > 0 ? 'sm:grid-cols-3 lg:grid-cols-7' : 'sm:grid-cols-3 lg:grid-cols-6'} gap-2 text-center`}>
                  <div className="p-2.5 rounded-lg bg-white border border-indigo-200">
                    <span className="text-[9px] font-bold text-indigo-900 uppercase block">Kuruma Tahsis Edilen</span>
                    <div className="text-base font-black text-indigo-950 mt-0.5">
                      {formatTonnage(stats?.toplamTahsisTonaj).tonStr}
                    </div>
                    <div className="text-[9px] font-bold text-indigo-700">
                      ({formatTonnage(stats?.toplamTahsisTonaj).kgStr})
                    </div>
                  </div>

                  <div className="p-2.5 rounded-lg bg-white border border-amber-200">
                    <span className="text-[9px] font-bold text-amber-800 uppercase block">Sahaya Gelen Net</span>
                    <div className="text-base font-black text-amber-900 mt-0.5">
                      {formatTonnage(stats?.toplamNetTonaj).tonStr}
                    </div>
                    <div className="text-[9px] font-bold text-amber-700">
                      ({formatTonnage(stats?.toplamNetTonaj).kgStr})
                    </div>
                  </div>

                  <div className="p-2.5 rounded-lg bg-teal-50/70 border border-teal-200">
                    <span className="text-[9px] font-bold text-teal-900 uppercase block">34 Torbalık Hane Kapasitesi</span>
                    <div className="text-base font-black text-teal-950 mt-0.5">
                      {Math.floor(normalizeToTon(stats?.toplamNetTonaj) / 0.85).toLocaleString('tr-TR')} Hane
                    </div>
                    <div className="text-[9px] font-bold text-teal-700">
                      (Kalan Stok: ~{Math.floor(normalizeToTon(stats?.kalanStokTonaj || 0) / 0.85)} Hane)
                    </div>
                  </div>

                  <div className="p-2.5 rounded-lg bg-white border border-sky-200">
                    <span className="text-[9px] font-bold text-sky-800 uppercase block">Sevkiyatı Bekleyen Kalan</span>
                    <div className="text-base font-black text-sky-950 mt-0.5">
                      {formatTonnage(stats?.kalanTahsisTonaj).tonStr}
                    </div>
                    <div className="text-[9px] font-bold text-sky-700">
                      ({formatTonnage(stats?.kalanTahsisTonaj).kgStr})
                    </div>
                  </div>

                  <div className="p-2.5 rounded-lg bg-white border border-emerald-200">
                    <span className="text-[9px] font-bold text-emerald-800 uppercase block">Vatandaşa Dağıtılan</span>
                    <div className="text-base font-black text-emerald-800 mt-0.5">
                      {formatTonnage(stats?.dagitilanNetTonaj).tonStr}
                    </div>
                    <div className="text-[9px] font-bold text-emerald-600">
                      ({formatTonnage(stats?.dagitilanNetTonaj).kgStr})
                    </div>
                  </div>

                  <div className="p-2.5 rounded-lg bg-white border border-slate-200 col-span-2 sm:col-span-1">
                    <span className="text-[9px] font-bold text-slate-700 uppercase block">Sahada Kalan Stok</span>
                    <div className="text-base font-black text-slate-900 mt-0.5">
                      {formatTonnage(stats?.kalanStokTonaj).tonStr}
                    </div>
                    <div className="text-[9px] font-bold text-slate-500">
                      ({formatTonnage(stats?.kalanStokTonaj).kgStr})
                    </div>
                  </div>

                  {Number(stats?.fazlaDagitilanTonaj || 0) > 0 && (
                    <div className="p-2.5 rounded-lg bg-purple-50 border border-purple-200 col-span-2 sm:col-span-1">
                      <span className="text-[9px] font-bold text-purple-900 uppercase block">Fazladan Dağıtılan</span>
                      <div className="text-base font-black text-purple-950 mt-0.5">
                        +{formatTonnage(stats?.fazlaDagitilanTonaj).tonStr}
                      </div>
                      <div className="text-[9px] font-bold text-purple-800">
                        (+{formatTonnage(stats?.fazlaDagitilanTonaj).kgStr} • +{stats?.fazlaDagitilanTorba || 0} Torba)
                      </div>
                    </div>
                  )}
                </div>

                {Number(stats?.fazlaDagitilanTonaj || 0) > 0 && (
                  <div className="p-2.5 rounded-lg bg-purple-50/80 border border-purple-200 text-[10px] text-purple-900 leading-snug">
                    <strong>Resmi Torba Toleransı Kaydı:</strong> Bazı kömür torbalarının standart 25 kg ağırlığından düşük gelmesi nedeniyle kantar net tonajına oranla <strong>+{formatTonnage(stats?.fazlaDagitilanTonaj).combined}</strong> (+{stats?.fazlaDagitilanTorba || 0} Torba, yaklaşık +{stats?.fazlaDagitilanHane || 0} hane) fazladan kömür vatandaşa dağıtılmıştır. Depo stoku eksiye düşürülmeyip 0 Ton olarak kayda bağlanmıştır.
                  </div>
                )}
              </div>

              {/* Sevkiyat ve Tır Tartım Dökümü Tablosu (Format 1 vs Format 2) */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-black uppercase tracking-wider text-slate-700">
                    {reportFormat === 'TESELLUM'
                      ? 'Tesellüm Tartım ve Sevk Kayıtları'
                      : 'TKİ Çan Linyit İşletmesi Kömür Sevkiyatı Listesi'} ({filteredReportTrucks.length} Tır)
                  </h4>
                  <span className="text-[11px] font-bold text-amber-800">
                    {reportFormat === 'TESELLUM' ? 'Valilik Tesellüm Tablosu Formatı' : 'TKİ Resmi Dağıtım Listesi Formatı'}
                  </span>
                </div>

                {filteredReportTrucks.length === 0 ? (
                  <div className="p-8 text-center bg-slate-50 rounded-xl border border-slate-200 text-slate-500 text-xs font-medium">
                    Seçilen tarih aralığı veya filtre kriterlerine uygun tır kaydı bulunamadı.
                  </div>
                ) : reportFormat === 'TESELLUM' ? (
                  /* FORMAT 1: TESELLÜMLERİ İZLEME TABLOSU */
                  <div className="border border-slate-300 rounded-xl overflow-hidden shadow-2xs">
                    <table className="w-full text-left text-xs border-collapse">
                      <thead>
                        <tr className="bg-slate-100 text-slate-900 border-b border-slate-300 font-black">
                          <th className="p-2 text-center w-10">Sıra</th>
                          <th className="p-2">YÜKLEMEYİ YAPAN İŞLETME</th>
                          <th className="p-2 w-28">ÇIKIŞ TARİHİ</th>
                          <th className="p-2">VAGON Veya PLAKA NO / Şoför Adı</th>
                          <th className="p-2 text-right w-32">İŞLETMEDEN YÜKLENEN MİKTAR (kg / Ton)</th>
                          <th className="p-2 w-28">TESELLÜM TARİHİ</th>
                          <th className="p-2 w-28">TESELLÜM FİŞ NO veya ( Kantar tartı no)</th>
                          <th className="p-2 text-right w-32">TESLİM ALINAN MİKTAR (kg / Ton)</th>
                          <th className="p-2 text-right w-32">FARK (İşl.Yüklenen) ( Teslim Alınan) kg.</th>
                          <th className="p-2 w-24">TUTANAK NO</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-200">
                        {filteredReportTrucks.map((t: any, index: number) => {
                          const sevkFmt = formatTwoWayTonnage(t.brut_tonaj);
                          const teslimFmt = formatTwoWayTonnage(t.net_tonaj);
                          const diffFmt = formatTwoWayDiff(teslimFmt.kg - sevkFmt.kg);

                          return (
                            <tr key={t.id || index} className="hover:bg-slate-50 transition-colors">
                              <td className="p-2 text-center font-bold text-slate-600">#{t.tir_sirasi || index + 1}</td>
                              <td className="p-2 text-slate-800 font-semibold">{t.isletme_adi || 'Çan Linyit İşletmesi Müdürlüğü'}</td>
                              <td className="p-2 text-slate-700 font-medium whitespace-nowrap">{formatTrDateWithDay(t.ocak_cikis_tarihi || t.tarih)}</td>
                              <td className="p-2 font-mono font-bold text-slate-900">
                                {t.plaka}{t.sofor_adi ? ` - ${t.sofor_adi}` : ''}
                              </td>
                              <td className="p-2 text-right whitespace-nowrap">
                                <div className="font-mono font-bold text-slate-800">{sevkFmt.kgStr}</div>
                                <div className="text-[10px] text-slate-500 font-semibold font-mono">({sevkFmt.tonStr})</div>
                              </td>
                              <td className="p-2 text-slate-800 font-bold whitespace-nowrap">{formatTrDateWithDay(t.tarih)}</td>
                              <td className="p-2 font-mono text-slate-700 font-bold">{t.irsaliye_no}</td>
                              <td className="p-2 text-right bg-amber-50/50 whitespace-nowrap">
                                <div className="font-mono font-black text-amber-900">{teslimFmt.kgStr}</div>
                                <div className="text-[10px] text-amber-800 font-bold font-mono">({teslimFmt.tonStr})</div>
                              </td>
                              <td className="p-2 text-right whitespace-nowrap">
                                <div className={`font-mono font-bold ${diffFmt.diffKg === 0 ? 'text-slate-700' : diffFmt.diffKg > 0 ? 'text-emerald-700' : 'text-rose-700'}`}>
                                  {diffFmt.kgStr}
                                </div>
                                <div className="text-[10px] text-slate-500 font-semibold font-mono">({diffFmt.tonStr})</div>
                              </td>
                              <td className="p-2 font-mono font-semibold text-indigo-900">
                                {t.tutanak_no || '-'}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                      <tfoot>
                        <tr className="bg-slate-100 font-black text-slate-900 border-t-2 border-slate-300">
                          <td colSpan={4} className="p-2.5 text-right uppercase">
                            TOPLAM TESLİM ALINAN MİKTAR ({filteredReportTrucks.length} Adet):
                          </td>
                          <td className="p-2.5 text-right font-mono text-slate-900 whitespace-nowrap">
                            <div className="font-black">{reportTotalYuklenenKg.toLocaleString('tr-TR')} kg</div>
                            <div className="text-[10px] text-slate-600 font-bold font-mono">({formatTonnage(reportTotalBrut).tonStr})</div>
                          </td>
                          <td colSpan={2} className="p-2.5"></td>
                          <td className="p-2.5 text-right font-mono text-amber-950 bg-amber-100/60 font-black whitespace-nowrap">
                            <div className="font-black">{reportTotalTeslimKg.toLocaleString('tr-TR')} kg</div>
                            <div className="text-[10px] text-amber-800 font-bold font-mono">({formatTonnage(reportTotalNet).tonStr})</div>
                          </td>
                          <td className="p-2.5 text-right font-mono font-black whitespace-nowrap">
                            <div className={reportTotalFarkKg === 0 ? 'text-slate-900' : reportTotalFarkKg > 0 ? 'text-emerald-700' : 'text-rose-700'}>
                              {reportTotalFarkKg > 0 ? `+${reportTotalFarkKg.toLocaleString('tr-TR')}` : reportTotalFarkKg.toLocaleString('tr-TR')} kg
                            </div>
                            <div className="text-[10px] text-slate-600 font-bold font-mono">
                              ({(reportTotalFarkKg / 1000).toLocaleString('tr-TR', { minimumFractionDigits: 1, maximumFractionDigits: 3 })} Ton)
                            </div>
                          </td>
                          <td className="p-2.5"></td>
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                ) : (
                  /* FORMAT 2: TKİ RESMİ DAĞITIM LİSTESİ */
                  <div className="border border-slate-300 rounded-xl overflow-hidden shadow-2xs">
                    <table className="w-full text-left text-xs border-collapse">
                      <thead>
                        <tr className="bg-slate-100 text-slate-900 border-b border-slate-300 font-black">
                          <th className="p-2 text-center w-12">SIRA NO</th>
                          <th className="p-2 w-20">İL</th>
                          <th className="p-2 w-24">İLÇE</th>
                          <th className="p-2 w-28">PLAKA NO</th>
                          <th className="p-2 w-28">SEVK TARİHİ</th>
                          <th className="p-2 text-right w-32">SEVK MİKTAR (KG / TON)</th>
                          <th className="p-2 w-28">TESLİM TARİHİ</th>
                          <th className="p-2 text-right w-32">TESLİM MİKTARI(KG / TON)</th>
                          <th className="p-2 w-28">İRSALİYE NO</th>
                          <th className="p-2 w-24">TUTANAK NO</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-200">
                        {filteredReportTrucks.map((t: any, index: number) => {
                          const sevkFmt = formatTwoWayTonnage(t.brut_tonaj);
                          const teslimFmt = formatTwoWayTonnage(t.net_tonaj);

                          return (
                            <tr key={t.id || index} className="hover:bg-slate-50 transition-colors">
                              <td className="p-2 text-center font-bold text-slate-600">{t.tir_sirasi || index + 1}</td>
                              <td className="p-2 font-bold text-slate-800">{t.il || 'EDİRNE'}</td>
                              <td className="p-2 font-bold text-slate-800">{t.ilce || 'MERKEZ'}</td>
                              <td className="p-2 font-mono font-bold text-slate-900">{t.plaka}</td>
                              <td className="p-2 text-slate-700 font-medium whitespace-nowrap">{formatTrDateWithDay(t.ocak_cikis_tarihi || t.tarih)}</td>
                              <td className="p-2 text-right whitespace-nowrap">
                                <div className="font-mono font-bold text-slate-800">{sevkFmt.kgStr}</div>
                                <div className="text-[10px] text-slate-500 font-semibold font-mono">({sevkFmt.tonStr})</div>
                              </td>
                              <td className="p-2 text-slate-800 font-bold whitespace-nowrap">{formatTrDateWithDay(t.tarih)}</td>
                              <td className="p-2 text-right bg-amber-50/50 whitespace-nowrap">
                                <div className="font-mono font-black text-amber-900">{teslimFmt.kgStr}</div>
                                <div className="text-[10px] text-amber-800 font-bold font-mono">({teslimFmt.tonStr})</div>
                              </td>
                              <td className="p-2 font-mono text-slate-700 font-bold">{t.irsaliye_no}</td>
                              <td className="p-2 font-mono font-semibold text-indigo-900">
                                {t.tutanak_no || '-'}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                      <tfoot>
                        <tr className="bg-slate-100 font-black text-slate-900 border-t-2 border-slate-300">
                          <td colSpan={5} className="p-2.5 text-right uppercase">
                            Toplam:
                          </td>
                          <td className="p-2.5 text-right font-mono text-slate-900 whitespace-nowrap">
                            <div className="font-black">{reportTotalYuklenenKg.toLocaleString('tr-TR')} kg</div>
                            <div className="text-[10px] text-slate-600 font-bold font-mono">({formatTonnage(reportTotalBrut).tonStr})</div>
                          </td>
                          <td className="p-2.5"></td>
                          <td className="p-2.5 text-right font-mono text-amber-950 bg-amber-100/60 font-black whitespace-nowrap">
                            <div className="font-black">{reportTotalTeslimKg.toLocaleString('tr-TR')} kg</div>
                            <div className="text-[10px] text-amber-800 font-bold font-mono">({formatTonnage(reportTotalNet).tonStr})</div>
                          </td>
                          <td colSpan={2} className="p-2.5"></td>
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                )}
              </div>

              {/* Resmi İmza & Onay Alanı (Format 1: Cem Pazar & Tezcan Fidan, Format 2: Tezcan Fidan) */}
              <div className="p-4 sm:p-5 rounded-2xl bg-white border border-slate-300 space-y-4 print-signatures shadow-2xs">
                <h4 className="text-[10px] sm:text-xs font-bold text-center uppercase tracking-wider text-slate-500 border-b border-slate-200 pb-2">
                  {reportFormat === 'TESELLUM'
                    ? 'TESELLÜM KONTROL VE RESMİ ONAY ALANI'
                    : 'TÜRKİYE KÖMÜR İŞLETMELERİ KURUMU RESMİ DAĞITIM TUTANAĞI ONAY ALANI'}
                </h4>
                {reportFormat === 'TESELLUM' ? (
                  <div className="grid grid-cols-2 gap-4 sm:gap-8 max-w-2xl mx-auto text-center text-xs text-slate-700 pt-2">
                    <div className="space-y-6 sm:space-y-8 p-3 rounded-xl border border-dashed border-slate-300 bg-slate-50/50">
                      <div>
                        <p className="font-extrabold text-slate-900 text-xs sm:text-sm">Cem PAZAR</p>
                        <p className="text-[11px] font-bold text-slate-700 mt-0.5">Sos. Yard. ve İnc. Gör.</p>
                        <p className="text-[10px] text-slate-500 mt-0.5">Tesellüm Eden Görevli</p>
                      </div>
                      <div className="h-10 flex items-center justify-center">
                        <span className="text-[10px] text-slate-400 italic">İmza / Tarih</span>
                      </div>
                    </div>

                    <div className="space-y-6 sm:space-y-8 p-3 rounded-xl border border-dashed border-slate-300 bg-slate-50/50">
                      <div>
                        <p className="font-extrabold text-slate-900 text-xs sm:text-sm">Tezcan FİDAN</p>
                        <p className="text-[11px] font-bold text-slate-800 mt-0.5">Vakıf Müdürü</p>
                        <p className="text-[10px] text-slate-500 mt-0.5">Edirne SYDV Başkanlığı</p>
                      </div>
                      <div className="h-10 flex items-center justify-center">
                        <span className="text-[10px] text-slate-400 italic">İmza / Mühür</span>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="flex justify-end max-w-2xl mx-auto text-center text-xs text-slate-700 pt-2">
                    <div className="w-72 space-y-6 sm:space-y-8 p-3 rounded-xl border border-dashed border-slate-300 bg-slate-50/50">
                      <div>
                        <p className="text-[11px] text-slate-600 mb-1">{reportEndDate ? formatTrDateWithDay(reportEndDate) : formatTrDateWithDay(new Date())}</p>
                        <p className="font-extrabold text-slate-900 text-xs sm:text-sm">Tezcan FİDAN</p>
                        <p className="text-[11px] font-bold text-slate-800 mt-0.5">Vakıf Müdürü</p>
                        <p className="text-[10px] text-slate-500 mt-0.5">Edirne SYDV Başkanlığı</p>
                      </div>
                      <div className="h-10 flex items-center justify-center">
                        <span className="text-[10px] text-slate-400 italic">İmza / Mühür</span>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Modal Footer: Butonlar daima sabit kalır */}
            <div className="report-modal-footer shrink-0 p-3 sm:p-4 border-t border-slate-200 flex items-center justify-between bg-slate-100 z-20 no-print gap-2">
              <a
                href={`/api/export?type=trucks&format=${reportFormat.toLowerCase()}&startDate=${reportStartDate}&endDate=${reportEndDate}`}
                download={`Edirne_SYDV_${reportFormat === 'TESELLUM' ? 'Tesellum_Izleme_Tablosu' : 'TKI_Komur_Dagitim_Listesi'}_${reportStartDate || 'Baslangic'}_${reportEndDate || 'Bitis'}.xlsx`}
                className="px-3.5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold flex items-center gap-1.5 transition-all active:scale-95 shadow-xs"
              >
                <Download className="w-4 h-4" />
                <span className="hidden sm:inline">Excel İndir ({reportFormat === 'TESELLUM' ? 'Tesellüm Formatı' : 'TKİ Formatı'})</span>
              </a>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setShowReportModal(false)}
                  className="px-4 py-2 rounded-xl bg-slate-200 hover:bg-slate-300 text-slate-800 text-xs font-bold transition-all active:scale-95 shadow-2xs"
                >
                  Kapat (ESC)
                </button>
                <button
                  type="button"
                  onClick={() => window.print()}
                  className="px-4 py-2 rounded-xl bg-amber-600 hover:bg-amber-700 text-white text-xs font-black flex items-center gap-2 shadow-xs transition-all active:scale-95"
                >
                  <Printer className="w-4 h-4" />
                  <span>Yazdır / PDF Kaydet</span>
                </button>
              </div>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* Kurum Toplam Kömür Tahsisi Belirleme Modalı (Sadece Yönetici) */}
      {showTahsisModal && (
        <InstitutionTonnageModal
          currentQuotaTon={Number(stats?.toplamTahsisTonaj || 0)}
          toplamNetTonaj={Number(stats?.toplamNetTonaj || 0)}
          onClose={() => setShowTahsisModal(false)}
          onSuccess={() => {
            onRefresh();
            setShowTahsisModal(false);
          }}
        />
      )}
    </div>
  );
}