'use client';

import { useState, useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { Truck, Plus, Calendar, FileText, Weight, Trash2, AlertCircle, CheckCircle2, Printer, X, Download, Search, Filter, Copy, RotateCcw } from 'lucide-react';
import { showConfirm, showToast, showAlert } from './GlobalAlertManager';
import { turkishIncludes } from '@/lib/normalizer';

interface TonnagePageProps {
  trucks: any[];
  stats: any;
  onRefresh: () => void;
  isLoading?: boolean;
}

export default function TonnagePage({
  trucks,
  stats,
  onRefresh,
  isLoading = false
}: TonnagePageProps) {
  const todayDefault = () => new Date().toISOString().split('T')[0];

  const [showAddModal, setShowAddModal] = useState(false);
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>('');
  const [plaka, setPlaka] = useState('');
  const [dorsePlaka, setDorsePlaka] = useState('');
  const [irsaliyeNo, setIrsaliyeNo] = useState('');
  const [ocakCikisTarihi, setOcakCikisTarihi] = useState(todayDefault);
  const [tarih, setTarih] = useState(todayDefault);
  const [netTonaj, setNetTonaj] = useState('');
  const [brutTonaj, setBrutTonaj] = useState('');
  const [soforAdi, setSoforAdi] = useState('');
  const [notlar, setNotlar] = useState('');
  const [tirSirasi, setTirSirasi] = useState<number>(stats?.sonrakiTirSirasi || (trucks.length + 1));
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  // Unique saved truck profiles (deduplicated by plaka + dorse_plaka + sofor_adi for quick 1-click template cards)
  const uniqueTruckTemplates = useMemo(() => {
    const seen = new Set<string>();
    const list: any[] = [];
    for (const t of trucks) {
      const key = `${(t.plaka || '').trim().toUpperCase()}|${(t.dorse_plaka || '').trim().toUpperCase()}|${(t.sofor_adi || '').trim().toUpperCase()}`;
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
    setDorsePlaka((t.dorse_plaka || '').toUpperCase());
    setSoforAdi(t.sofor_adi || '');
    setNotlar(t.notlar || '');
    setBrutTonaj(t.brut_tonaj !== undefined && t.brut_tonaj !== null ? String(t.brut_tonaj) : '');
    setNetTonaj(t.net_tonaj !== undefined && t.net_tonaj !== null ? String(t.net_tonaj) : '');
    setIrsaliyeNo('');
    if (t.ocak_cikis_tarihi) {
      setOcakCikisTarihi(t.ocak_cikis_tarihi);
    }
    setErrorMsg('');
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
      trucks.find((t: any) => normalizeIrsaliyeClient(t.irsaliye_no) === normInput) || null
    );
  }, [irsaliyeNo, trucks]);

  const resetAddForm = () => {
    const todayStr = todayDefault();
    setSelectedTemplateId('');
    setTirSirasi(stats?.sonrakiTirSirasi || (trucks.length + 1));
    setPlaka('');
    setDorsePlaka('');
    setIrsaliyeNo('');
    setOcakCikisTarihi(todayStr);
    setTarih(todayStr);
    setNetTonaj('');
    setBrutTonaj('');
    setSoforAdi('');
    setNotlar('');
    setErrorMsg('');
  };

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
        const matchDorse = turkishIncludes(t.dorse_plaka || '', reportSearchQuery);
        const matchSofor = turkishIncludes(t.sofor_adi || '', reportSearchQuery);
        const matchIrsaliye = turkishIncludes(t.irsaliye_no || '', reportSearchQuery);
        const matchNotlar = turkishIncludes(t.notlar || '', reportSearchQuery);
        if (!matchPlaka && !matchDorse && !matchSofor && !matchIrsaliye && !matchNotlar) {
          return false;
        }
      }
      return true;
    });
  }, [trucks, reportStartDate, reportEndDate, reportSearchQuery]);

  const reportTotalBrut = filteredReportTrucks.reduce((acc: number, t: any) => acc + (Number(t.brut_tonaj) || 0), 0);
  const reportTotalNet = filteredReportTrucks.reduce((acc: number, t: any) => acc + (Number(t.net_tonaj) || 0), 0);
  const reportTotalTara = filteredReportTrucks.reduce((acc: number, t: any) => acc + (Number(t.tara_tonaj) || (Number(t.brut_tonaj) - Number(t.net_tonaj)) || 0), 0);

  const netVal = parseFloat(netTonaj) || 0;
  const brutVal = parseFloat(brutTonaj) || 0;
  const autoTara = brutVal > netVal ? (brutVal - netVal).toFixed(3) : '0.000';

  const handleAddTruck = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!plaka || !irsaliyeNo || !tarih || !netTonaj || !brutTonaj) {
      setErrorMsg('Lütfen zorunlu alanları (Tır Plakası, İrsaliye No, Geliş Tarihi, Brüt ve Net Tonaj) doldurunuz');
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
      setErrorMsg('Brüt tonaj, net tonajdan küçük olamaz!');
      return;
    }

    setIsSubmitting(true);
    setErrorMsg('');

    try {
      const res = await fetch('/api/trucks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tir_sirasi: tirSirasi,
          plaka,
          dorse_plaka: dorsePlaka,
          irsaliye_no: irsaliyeNo.trim().toLocaleUpperCase('tr-TR'),
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
        throw new Error(data.error || 'Tır kaydı eklenemedi');
      }

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
              <p className="text-xs text-slate-500 font-medium">Gelen Tırlar, Dorse Bilgileri ve Net Tonaj Özeti</p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setShowReportModal(true)}
              className="px-3.5 py-2 rounded-xl border border-slate-300 bg-white hover:bg-slate-50 text-slate-800 text-xs font-bold flex items-center gap-1.5 shadow-2xs transition-all active:scale-95"
              title="Kömür Sevkiyatı ve Kantar Tonaj Raporunu Önizle ve Yazdır"
            >
              <Printer className="w-4 h-4 text-amber-600" />
              <span>Tonaj Raporunu Yazdır</span>
            </button>

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
          </div>
        </div>

        {/* 4 Stats Cards - Light Mode */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-2 border-t border-slate-100">
          <div className="p-3 rounded-xl bg-slate-50 border border-slate-200">
            <span className="text-[10px] uppercase font-bold text-slate-500 tracking-wider">Gelen Tır Sayısı</span>
            <div className="text-xl font-black text-slate-900 mt-0.5">
              {stats?.toplamTirSayisi || 0} <span className="text-xs font-normal text-slate-500">Adet</span>
            </div>
          </div>

          <div className="p-3 rounded-xl bg-amber-50 border border-amber-200">
            <span className="text-[10px] uppercase font-bold text-amber-800 tracking-wider">Gelen Net Kömür</span>
            <div className="text-xl font-black text-amber-800 mt-0.5">
              {stats?.toplamNetTonaj?.toLocaleString('tr-TR') || '0'} <span className="text-xs font-normal text-slate-500">Ton</span>
            </div>
          </div>

          <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-200">
            <span className="text-[10px] uppercase font-bold text-emerald-800 tracking-wider">Dağıtılan Kömür</span>
            <div className="text-xl font-black text-emerald-700 mt-0.5">
              {stats?.dagitilanNetTonaj?.toLocaleString('tr-TR') || '0'} <span className="text-xs font-normal text-slate-500">Ton</span>
            </div>
            <div className="text-[10px] text-emerald-800 font-bold">({stats?.toplamDagitilanTorba || 0} Torba)</div>
          </div>

          <div className="p-3 rounded-xl bg-sky-50 border border-sky-200">
            <span className="text-[10px] uppercase font-bold text-sky-800 tracking-wider">Kalan Stok</span>
            <div className={`text-xl font-black mt-0.5 ${stats?.kalanStokTonaj < 5 ? 'text-rose-600' : 'text-sky-800'}`}>
              {stats?.kalanStokTonaj?.toLocaleString('tr-TR') || '0'} <span className="text-xs font-normal text-slate-500">Ton</span>
            </div>
          </div>
        </div>
      </div>

      {/* Trucks List Header */}
      <div className="flex items-center justify-between px-1">
        <h4 className="text-xs font-bold text-slate-600 uppercase tracking-wider">
          Gelen Tır Kayıtları ({trucks.length})
        </h4>
        <span className="text-[11px] text-slate-500 font-medium">
          Her tırın ocak çıkış, saha geliş ve kantar tartım detayları
        </span>
      </div>

      {/* List of Incoming Trucks - Light Mode */}
      {trucks.length === 0 ? (
        <div className="p-10 text-center rounded-2xl bg-white border border-slate-200 shadow-sm space-y-2">
          <Truck className="w-10 h-10 text-slate-400 mx-auto" />
          <p className="text-sm font-bold text-slate-800">Henüz tır kaydı bulunmuyor</p>
          <p className="text-xs text-slate-500">
            Kömür sahasına gelen tırları kaydetmek için &ldquo;Yeni Tır Girişi&rdquo; butonunu kullanın.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3.5">
          {trucks.map((t) => {
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
                      title="Tır (Çekici) Plakası"
                    >
                      {t.plaka}
                    </div>
                    {t.dorse_plaka && (
                      <div
                        className="px-2.5 py-1 rounded-lg bg-sky-50 text-sky-900 border border-sky-200 font-mono font-bold tracking-wider text-xs"
                        title="Dorse Plakası"
                      >
                        Dorse: {t.dorse_plaka}
                      </div>
                    )}
                  </div>

                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => {
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
                </div>

                {/* Ocak Çıkış & Sahaya Geliş Tarihleri Satırı */}
                <div className="flex flex-wrap items-center gap-2 text-[11px] font-semibold">
                  <span className="px-2.5 py-1 rounded-lg bg-slate-100 text-slate-700 border border-slate-200 flex items-center gap-1">
                    <Calendar className="w-3 h-3 text-slate-500" />
                    <span>Ocak Çıkış: <strong className="text-slate-900">{t.ocak_cikis_tarihi || t.tarih}</strong></span>
                  </span>
                  <span
                    className={`px-2.5 py-1 rounded-lg border flex items-center gap-1 ${
                      hasDiffDeparture
                        ? 'bg-amber-50 text-amber-900 border-amber-200'
                        : 'bg-emerald-50 text-emerald-900 border-emerald-200'
                    }`}
                  >
                    <Calendar className="w-3 h-3" />
                    <span>Sahaya Geliş: <strong>{t.tarih}</strong></span>
                  </span>
                </div>

                {/* Tonnage Detail Row */}
                <div className="grid grid-cols-3 gap-2 p-2.5 rounded-xl bg-slate-50 border border-slate-200 text-center">
                  <div>
                    <span className="text-[10px] uppercase font-bold text-slate-500">Brüt Tonaj</span>
                    <p className="text-sm font-bold text-slate-900 mt-0.5">{t.brut_tonaj} Ton</p>
                  </div>
                  <div className="border-x border-slate-200">
                    <span className="text-[10px] uppercase font-bold text-amber-800">Net Tonaj</span>
                    <p className="text-sm font-black text-amber-700 mt-0.5">{t.net_tonaj} Ton</p>
                  </div>
                  <div>
                    <span className="text-[10px] uppercase font-bold text-slate-500">Dara (Tara)</span>
                    <p className="text-sm font-bold text-slate-700 mt-0.5">{t.tara_tonaj} Ton</p>
                  </div>
                </div>

                {/* Details (Irsaliye, Sofor, Notlar) */}
                <div className="flex items-center justify-between text-xs text-slate-600 pt-1 font-medium flex-wrap gap-1">
                  <span className="flex items-center gap-1">
                    <FileText className="w-3.5 h-3.5 text-slate-400" />
                    İrsaliye / Teslimat No: <strong className="text-slate-900 font-bold">{t.irsaliye_no}</strong>
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

      {/* Add Truck Modal - Light Mode */}
      {showAddModal && (
        <div className="modal-overlay" onClick={() => setShowAddModal(false)}>
          <div className="modal-sheet" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between pb-3 border-b border-slate-200 mb-3">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-amber-100 text-amber-800 flex items-center justify-center border border-amber-200">
                  <Truck className="w-5 h-5 text-amber-700" />
                </div>
                <div>
                  <h3 className="text-base font-extrabold text-slate-900">Yeni Gelen Tır Kaydı</h3>
                  <p className="text-xs text-slate-500">Kömür sevkiyatı, dorse plakası ve tonaj girişi</p>
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

            {/* ÖNCEKİ KAYITLARDAN TEK TIKLA ŞABLON DOLDURMA ALANI */}
            {trucks.length > 0 && (
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
                          {t.dorse_plaka && (
                            <span
                              className={`font-mono text-[10px] font-bold px-1.5 py-0.2 rounded ${
                                isSelected ? 'bg-amber-700 text-white' : 'bg-slate-100 text-slate-700'
                              }`}
                            >
                              {t.dorse_plaka}
                            </span>
                          )}
                        </div>
                        <div
                          className={`text-[10px] font-semibold truncate max-w-[160px] mt-0.5 ${
                            isSelected ? 'text-amber-50' : 'text-slate-500'
                          }`}
                        >
                          {t.sofor_adi || 'Şoför Belirtilmemiş'} • {t.net_tonaj} T
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
                          {t.dorse_plaka ? ` (Dorse: ${t.dorse_plaka})` : ''} — {t.sofor_adi || 'Şoför Yok'} — Net: {t.net_tonaj} Ton ({t.tarih})
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

              {/* Tır (Çekici) Plakası & Dorse Plakası */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-600 uppercase tracking-wider mb-1">
                    Tır (Çekici) Plakası
                  </label>
                  <input
                    type="text"
                    value={plaka}
                    onChange={(e) => setPlaka(e.target.value.toUpperCase())}
                    placeholder="Örn: 06 KMR 101"
                    className="w-full px-3.5 py-2 rounded-xl bg-slate-50 border border-slate-300 text-slate-900 font-mono uppercase font-black focus:outline-none focus:border-amber-500 focus:bg-white text-sm"
                    required
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-600 uppercase tracking-wider mb-1">
                    Dorse Plakası (Opsiyonel)
                  </label>
                  <input
                    type="text"
                    value={dorsePlaka}
                    onChange={(e) => setDorsePlaka(e.target.value.toUpperCase())}
                    placeholder="Örn: 06 DRS 202"
                    className="w-full px-3.5 py-2 rounded-xl bg-slate-50 border border-slate-300 text-slate-900 font-mono uppercase font-bold focus:outline-none focus:border-amber-500 focus:bg-white text-sm"
                  />
                </div>
              </div>

              {/* Tonaj Alanları */}
              <div className="p-3 rounded-xl bg-slate-50 border border-slate-200 space-y-2.5">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-bold text-slate-600 uppercase tracking-wider mb-1">
                      Brüt Tonaj (Ton)
                    </label>
                    <input
                      type="number"
                      step="0.001"
                      value={brutTonaj}
                      onChange={(e) => setBrutTonaj(e.target.value)}
                      placeholder="Örn: 42.150"
                      className="w-full px-3 py-2 rounded-xl bg-white border border-slate-300 text-slate-900 font-bold focus:outline-none focus:border-amber-500 text-sm"
                      required
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-amber-800 uppercase tracking-wider mb-1">
                      Net Tonaj (Ton)
                    </label>
                    <input
                      type="number"
                      step="0.001"
                      value={netTonaj}
                      onChange={(e) => setNetTonaj(e.target.value)}
                      placeholder="Örn: 27.200"
                      className="w-full px-3 py-2 rounded-xl bg-white border border-amber-400 text-amber-900 font-black focus:outline-none focus:border-amber-500 text-sm"
                      required
                    />
                  </div>
                </div>

                {/* Otomatik Dara Gösterimi */}
                <div className="flex items-center justify-between text-xs text-slate-600 pt-2 border-t border-slate-200 font-medium">
                  <span>Hesaplanan Dara / Tara Miktarı:</span>
                  <span className="font-mono font-bold text-slate-900 bg-white px-2.5 py-1 rounded-md border border-slate-200">
                    {autoTara} Ton
                  </span>
                </div>
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
                  {isSubmitting ? 'Kaydediliyor...' : duplicateIrsaliyeTruck ? 'Mükerrer İrsaliye No!' : 'Tırı Kaydet'}
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
                    <span>Net Kömür: <strong className="text-amber-800">{reportTotalNet.toFixed(3)} Ton</strong></span>
                    <span>•</span>
                    <span>Brüt Ağırlık: <strong className="text-slate-800">{reportTotalBrut.toFixed(3)} Ton</strong></span>
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
              {/* Tarih Aralığı ve Arama Filtre Paneli (Baskıda Görünmez) */}
              <div className="p-3.5 sm:p-4 rounded-2xl bg-slate-50 border border-slate-200 space-y-3 no-print">
                <div className="flex items-center justify-between">
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
                      Plaka / İrsaliye / Şoför Ara
                    </label>
                    <div className="relative">
                      <Search className="w-3.5 h-3.5 absolute left-3 top-2.5 text-slate-400" />
                      <input
                        type="text"
                        value={reportSearchQuery}
                        onChange={(e) => setReportSearchQuery(e.target.value)}
                        placeholder="Örn: 06 KMR, Vural, IRS-2026..."
                        className="w-full pl-8 pr-3 py-2 rounded-xl bg-white border border-slate-300 text-slate-900 text-xs font-semibold focus:outline-none focus:border-amber-500 shadow-2xs"
                      />
                    </div>
                  </div>
                </div>
              </div>

              {/* Institutional Official Header */}
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
                    <p className="text-[10px] sm:text-[11px] font-black uppercase text-slate-800 tracking-wider">
                      T.C. EDİRNE VALİLİĞİ
                    </p>
                    <h4 className="text-xs sm:text-base font-black uppercase text-slate-950 tracking-wide mt-0.5">
                      SOSYAL YARDIMLAŞMA VE DAYANIŞMA VAKFI BAŞKANLIĞI
                    </h4>
                    <div className="inline-block mt-1 px-2.5 py-0.5 rounded-full bg-slate-100 border border-slate-300">
                      <span className="text-[10px] sm:text-xs font-extrabold text-slate-900">
                        KÖMÜR SEVKİYATI, SAHA KANTAR TARTIM VE TONAJ RAPORU
                      </span>
                    </div>
                  </div>
                  <div className="w-12 sm:w-14 shrink-0 hidden sm:block text-right">
                    <span className="text-[9px] font-mono text-slate-400 block">KOD: SYDV-TNJ</span>
                    <span className="text-[9px] font-mono text-slate-400 block mt-0.5">{new Date().toLocaleDateString('tr-TR')}</span>
                  </div>
                </div>

                <div className="pt-2 flex flex-wrap items-center justify-between text-[11px] text-slate-600 gap-2 font-medium">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span>Rapor Kapsamı: <strong className="text-slate-900">{reportStartDate && reportEndDate ? `${reportStartDate} - ${reportEndDate}` : 'Tüm Kömür Sevkiyatı Dönemi'}</strong></span>
                    {reportSearchQuery && (
                      <>
                        <span>•</span>
                        <span>Filtre: <strong className="text-slate-900">&ldquo;{reportSearchQuery}&rdquo;</strong></span>
                      </>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <span>Rapor Tarihi: <strong className="text-slate-900">{new Date().toLocaleDateString('tr-TR')} {new Date().toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })}</strong></span>
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
                  <span className="text-[10px] font-bold text-amber-800 uppercase block">Gelen Net Kömür</span>
                  <div className="text-lg font-black text-amber-800 mt-0.5">
                    {reportTotalNet.toFixed(3)} <span className="text-xs font-normal text-slate-500">Ton</span>
                  </div>
                </div>

                <div className="p-3 rounded-xl bg-slate-50 border border-slate-200">
                  <span className="text-[10px] font-bold text-slate-500 uppercase block">Toplam Brüt Ağırlık</span>
                  <div className="text-lg font-black text-slate-900 mt-0.5">
                    {reportTotalBrut.toFixed(3)} <span className="text-xs font-normal text-slate-500">Ton</span>
                  </div>
                </div>

                <div className="p-3 rounded-xl bg-slate-50 border border-slate-200">
                  <span className="text-[10px] font-bold text-slate-500 uppercase block">Toplam Dara / Tara</span>
                  <div className="text-lg font-black text-slate-700 mt-0.5">
                    {reportTotalTara.toFixed(3)} <span className="text-xs font-normal text-slate-500">Ton</span>
                  </div>
                </div>
              </div>

              {/* Sahadaki Kömür Stok & Dağıtım Dengesi */}
              <div className="p-3 sm:p-4 rounded-xl bg-slate-50 border border-slate-200 flex flex-wrap items-center justify-between gap-3 text-xs">
                <div className="space-y-0.5">
                  <span className="text-[10px] font-bold text-slate-500 uppercase block">Genel Kömür Stok & Dağıtım Bilançosu</span>
                  <p className="text-slate-700 font-medium">
                    Sahaya Giren Toplam: <strong className="text-amber-800 font-bold">{stats?.toplamNetTonaj || '0'} Ton</strong> ({stats?.toplamTirSayisi || 0} Tır)
                    <span className="mx-2">•</span>
                    Vatandaşa Dağıtılan: <strong className="text-emerald-700 font-bold">{stats?.dagitilanNetTonaj || '0'} Ton</strong> ({stats?.toplamDagitilanTorba || 0} Torba)
                  </p>
                </div>
                <div className="text-right">
                  <span className="text-[10px] font-bold text-slate-500 uppercase block">Sahada Kalan Güncel Stok:</span>
                  <span className="text-base font-black text-sky-800">{stats?.kalanStokTonaj || '0'} Ton</span>
                </div>
              </div>

              {/* Sevkiyat ve Tır Tartım Dökümü Tablosu */}
              <div className="space-y-1.5">
                <h4 className="text-xs font-black uppercase tracking-wider text-slate-700">
                  Sevkiyat ve Kantar Tartım Kayıtları ({filteredReportTrucks.length} Tır)
                </h4>

                {filteredReportTrucks.length === 0 ? (
                  <div className="p-8 text-center bg-slate-50 rounded-xl border border-slate-200 text-slate-500 text-xs font-medium">
                    Seçilen tarih aralığı veya filtre kriterlerine uygun tır kaydı bulunamadı.
                  </div>
                ) : (
                  <div className="border border-slate-300 rounded-xl overflow-hidden shadow-2xs">
                    <table className="w-full text-left text-xs border-collapse">
                      <thead>
                        <tr className="bg-slate-100 text-slate-900 border-b border-slate-300 font-black">
                          <th className="p-2 text-center w-10">Sıra</th>
                          <th className="p-2 w-24">Ocak Çıkış</th>
                          <th className="p-2 w-24">Saha Geliş</th>
                          <th className="p-2 w-24">Tır Plakası</th>
                          <th className="p-2 w-24">Dorse Plaka</th>
                          <th className="p-2 w-24">İrsaliye / Fiş</th>
                          <th className="p-2">Şoför Adı</th>
                          <th className="p-2 text-right w-20">Brüt (Ton)</th>
                          <th className="p-2 text-right w-20">Dara (Ton)</th>
                          <th className="p-2 text-right w-20">Net (Ton)</th>
                          <th className="p-2">Açıklama / Menşe</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-200">
                        {filteredReportTrucks.map((t: any, index: number) => {
                          const brut = Number(t.brut_tonaj) || 0;
                          const net = Number(t.net_tonaj) || 0;
                          const tara = Number(t.tara_tonaj) || (brut > net ? brut - net : 0);

                          return (
                            <tr key={t.id || index} className="hover:bg-slate-50 transition-colors">
                              <td className="p-2 text-center font-bold text-slate-600">#{t.tir_sirasi || index + 1}</td>
                              <td className="p-2 font-mono text-slate-600">{t.ocak_cikis_tarihi || t.tarih}</td>
                              <td className="p-2 font-mono text-slate-700 font-semibold">{t.tarih}</td>
                              <td className="p-2 font-mono font-bold text-slate-900">{t.plaka}</td>
                              <td className="p-2 font-mono font-semibold text-sky-900">{t.dorse_plaka || '-'}</td>
                              <td className="p-2 font-mono text-slate-600 font-semibold">{t.irsaliye_no}</td>
                              <td className="p-2 font-bold text-slate-800">{t.sofor_adi || '-'}</td>
                              <td className="p-2 text-right font-mono text-slate-700">{brut.toFixed(3)}</td>
                              <td className="p-2 text-right font-mono text-slate-500">{tara.toFixed(3)}</td>
                              <td className="p-2 text-right font-mono font-black text-amber-800 bg-amber-50/40">
                                {net.toFixed(3)}
                              </td>
                              <td className="p-2 text-slate-600 text-[11px]">{t.notlar || '-'}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                      <tfoot>
                        <tr className="bg-slate-100 font-black text-slate-900 border-t-2 border-slate-300">
                          <td colSpan={7} className="p-2.5 text-right uppercase">GENEL TOPLAM ({filteredReportTrucks.length} TIR):</td>
                          <td className="p-2.5 text-right font-mono">{reportTotalBrut.toFixed(3)} Ton</td>
                          <td className="p-2.5 text-right font-mono text-slate-600">{reportTotalTara.toFixed(3)} Ton</td>
                          <td className="p-2.5 text-right font-mono text-amber-800 bg-amber-100/50">{reportTotalNet.toFixed(3)} Ton</td>
                          <td className="p-2.5"></td>
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                )}
              </div>

              {/* 2-Kolonlu Resmi İmza & Onay Alanı */}
              <div className="p-4 sm:p-5 rounded-2xl bg-white border border-slate-300 space-y-4 print-signatures shadow-2xs">
                <h4 className="text-[10px] sm:text-xs font-bold text-center uppercase tracking-wider text-slate-500 border-b border-slate-200 pb-2">
                  RESMİ TUTANAK VE İMZA ONAY ALANI
                </h4>
                <div className="grid grid-cols-2 gap-4 sm:gap-8 max-w-2xl mx-auto text-center text-xs text-slate-700 pt-2">
                  <div className="space-y-6 sm:space-y-8 p-3 rounded-xl border border-dashed border-slate-300 bg-slate-50/50">
                    <div>
                      <p className="font-extrabold text-slate-900 text-xs sm:text-sm">KANTAR / DEPO KABUL GÖREVLİSİ</p>
                      <p className="text-[11px] font-bold text-slate-700 mt-0.5">Saha Kabul & Tartım Sorumlusu</p>
                    </div>
                    <div className="h-10 flex items-center justify-center">
                      <span className="text-[10px] text-slate-400 italic">İmza / Tarih</span>
                    </div>
                  </div>

                  <div className="space-y-6 sm:space-y-8 p-3 rounded-xl border border-dashed border-slate-300 bg-slate-50/50">
                    <div>
                      <p className="font-extrabold text-slate-900 text-xs sm:text-sm">VAKIF MÜDÜRÜ / ONAY</p>
                      <p className="text-[11px] font-bold text-slate-700 mt-0.5">Edirne SYDV Başkanlığı</p>
                    </div>
                    <div className="h-10 flex items-center justify-center">
                      <span className="text-[10px] text-slate-400 italic">İmza / Mühür</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Modal Footer: Butonlar daima sabit kalır */}
            <div className="report-modal-footer shrink-0 p-3 sm:p-4 border-t border-slate-200 flex items-center justify-between bg-slate-100 z-20 no-print gap-2">
              <a
                href={`/api/export?type=trucks&startDate=${reportStartDate}&endDate=${reportEndDate}`}
                download={`Edirne_SYDV_Komur_Tonaj_Raporu_${reportStartDate || 'Baslangic'}_${reportEndDate || 'Bitis'}.xlsx`}
                className="px-3.5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold flex items-center gap-1.5 transition-all active:scale-95 shadow-xs"
              >
                <Download className="w-4 h-4" />
                <span className="hidden sm:inline">Excel İndir</span>
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
    </div>
  );
}