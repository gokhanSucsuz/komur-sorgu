'use client';

import { useState, useRef, useEffect, useMemo } from 'react';
import { FileSpreadsheet, Upload, Download, AlertTriangle, CheckCircle2, Trash2, Filter, Search, ShieldAlert, Shield, RefreshCw, FileText, X, Undo2, FolderSync, PackageCheck, Eye, Phone, MapPin, Copy, Check, Users, Building2, Trees, ChevronDown, FlaskConical, Play, RotateCcw, Loader2, Printer, PenLine, FileCheck, Sparkles } from 'lucide-react';
import { showConfirm, showToast, showAlert } from './GlobalAlertManager';
import { isBirebirBeneficiaryMatch } from '@/lib/normalizer';
import { formatTrAuto } from '@/lib/dateUtils';
import MissingAddressModal, { MissingAddressBeneficiary } from './MissingAddressModal';

const isKoySettlement = (name: string, tip?: string) => {
  if (tip === 'KOY') return true;
  if (!name) return false;
  return /(?:Köyü|Koy|Koyu)$/i.test(name.trim());
};

interface ExcelImportPageProps {
  userRole: 'ADMIN' | 'PERSONEL' | 'MUDUR';
  activeSeasonCode?: string;
  calismaModu?: 'RESMI' | 'DENEME';
  sandboxStats?: {
    hane_sayisi: number;
    liste_sayisi: number;
    hata_log_sayisi: number;
    teslimat_sayisi: number;
  } | null;
  officialStats?: {
    hane_sayisi: number;
    liste_sayisi: number;
  } | null;
  onChangeCalismaModu?: (newMode: 'RESMI' | 'DENEME') => Promise<void>;
  onResetSandbox?: () => Promise<void>;
  onSwitchToAdmin: () => void;
  onRefreshAll: () => void;
}

export default function ExcelImportPage({
  userRole,
  activeSeasonCode = '2026-2027',
  calismaModu = 'RESMI',
  sandboxStats = null,
  officialStats = null,
  onChangeCalismaModu,
  onResetSandbox,
  onSwitchToAdmin,
  onRefreshAll
}: ExcelImportPageProps) {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadResult, setUploadResult] = useState<any>(null);
  const [errorMsg, setErrorMsg] = useState('');
  const [selectedListeTuru, setSelectedListeTuru] = useState<'STANDART' | 'SIGORTALI' | 'EK_LISTE'>('STANDART');

  // Deneme Alanı (Sandbox) & Çalışma Modu Durumu
  const [localCalismaModu, setLocalCalismaModu] = useState<'RESMI' | 'DENEME'>(calismaModu);
  const [localSandboxStats, setLocalSandboxStats] = useState<any>(sandboxStats);
  const [localOfficialStats, setLocalOfficialStats] = useState<any>(officialStats);
  const [isSwitchingMode, setIsSwitchingMode] = useState<boolean>(false);
  const [isResettingSandbox, setIsResettingSandbox] = useState<boolean>(false);

  useEffect(() => {
    setLocalCalismaModu(calismaModu);
  }, [calismaModu]);

  useEffect(() => {
    if (sandboxStats) setLocalSandboxStats(sandboxStats);
  }, [sandboxStats]);

  useEffect(() => {
    if (officialStats) setLocalOfficialStats(officialStats);
  }, [officialStats]);

  const fetchModeStats = async () => {
    try {
      const res = await fetch('/api/settings');
      const data = await res.json();
      if (data.success && data.settings) {
        if (data.settings.calisma_modu) setLocalCalismaModu(data.settings.calisma_modu);
        if (data.settings.sandbox_stats) setLocalSandboxStats(data.settings.sandbox_stats);
        if (data.settings.official_stats) setLocalOfficialStats(data.settings.official_stats);
      }
    } catch {}
  };

  const handleModeSwitch = async (targetMode: 'RESMI' | 'DENEME') => {
    if (targetMode === localCalismaModu || isSwitchingMode) return;
    setIsSwitchingMode(true);
    try {
      if (onChangeCalismaModu) {
        await onChangeCalismaModu(targetMode);
      } else {
        const res = await fetch('/api/settings', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'SET_CALISMA_MODU', calisma_modu: targetMode }),
        });
        const data = await res.json();
        if (!data.success) throw new Error(data.error || 'Mod değiştirilemedi');
        showToast({
          type: targetMode === 'DENEME' ? 'info' : 'success',
          title: targetMode === 'DENEME' ? 'Deneme Modu Aktif Edildi' : 'Gerçek (Resmi) Moda Geçildi',
          message: data.message,
        });
      }
      setLocalCalismaModu(targetMode);
      setUploadResult(null);
      setSelectedSeasonView('AKTIF');
      await Promise.all([
        fetchLogs('AKTIF'),
        fetchUploadedBatches('AKTIF'),
        fetchSignatureData('AKTIF'),
        fetchModeStats(),
      ]);
      onRefreshAll();
    } catch (err: any) {
      showAlert({
        type: 'error',
        title: 'Mod Değiştirme Hatası',
        message: err.message || 'Çalışma modu değiştirilirken hata oluştu.',
      });
    } finally {
      setIsSwitchingMode(false);
    }
  };

  const handleResetSandboxData = async () => {
    const confirmed = await showConfirm({
      title: 'Deneme Alanı Verilerini Sıfırla',
      message:
        'Deneme (Test) modunda yüklediğiniz tüm test Excel listeleri, test haneleri ve deneme işlemleri tamamen silinecektir. Gerçek (Resmi) listelerinize hiçbir şekilde dokunulmaz. Onaylıyor musunuz?',
      type: 'warning',
      confirmText: 'Evet, Deneme Verilerini Temizle',
      cancelText: 'Vazgeç',
    });
    if (!confirmed) return;

    setIsResettingSandbox(true);
    try {
      if (onResetSandbox) {
        await onResetSandbox();
      } else {
        const res = await fetch('/api/settings', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'RESET_SANDBOX_DATA' }),
        });
        const data = await res.json();
        if (!data.success) throw new Error(data.error || 'Deneme verileri sıfırlanamadı');
        showToast({
          type: 'success',
          title: 'Deneme Alanı Temizlendi',
          message: data.message,
        });
      }
      setUploadResult(null);
      await Promise.all([
        fetchLogs('AKTIF'),
        fetchUploadedBatches('AKTIF'),
        fetchSignatureData('AKTIF'),
        fetchModeStats(),
      ]);
      onRefreshAll();
    } catch (err: any) {
      showAlert({
        type: 'error',
        title: 'Hata',
        message: err.message || 'Deneme verileri temizlenirken hata oluştu.',
      });
    } finally {
      setIsResettingSandbox(false);
    }
  };

  const handleSeedFakeSandboxData = async () => {
    const confirmed = await showConfirm({
      title: 'Örnek (Fake) Deneme Verilerini Yükle / Yenile',
      message:
        'Deneme alanı temizlenerek 20 adet örnek (fake) hane, fake dağıtım listesi, ek liste ve test tır kayıtları yüklenecektir. Gerçek (Resmi) listeleriniz %100 güvendedir ve etkilenmez. Devam edilsin mi?',
      type: 'info',
      confirmText: 'Evet, Fake Verileri Yükle',
      cancelText: 'Vazgeç',
    });
    if (!confirmed) return;

    setIsResettingSandbox(true);
    try {
      const res = await fetch('/api/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'RESET_SANDBOX_DATA', seed_fake_data: true }),
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.error || 'Fake veriler yüklenemedi');
      showToast({
        type: 'success',
        title: 'Fake Deneme Verileri Yüklendi',
        message: data.message,
      });
      setUploadResult(null);
      await Promise.all([
        fetchLogs('AKTIF'),
        fetchUploadedBatches('AKTIF'),
        fetchSignatureData('AKTIF'),
        fetchModeStats(),
      ]);
      onRefreshAll();
    } catch (err: any) {
      showAlert({
        type: 'error',
        title: 'Hata',
        message: err.message || 'Fake veriler yüklenirken hata oluştu.',
      });
    } finally {
      setIsResettingSandbox(false);
    }
  };
  
  // Logs state
  const [logs, setLogs] = useState<any[]>([]);
  const [, setBatches] = useState<any[]>([]);
  const [, setLogStats] = useState<any>(null);
  const [isLoadingLogs, setIsLoadingLogs] = useState(false);

  // Logs Accordion State
  const [isLogsSectionOpen, setIsLogsSectionOpen] = useState(false);
  const [expandedBatchIds, setExpandedBatchIds] = useState<Set<string>>(new Set());
  const [batchStatusFilter, setBatchStatusFilter] = useState<Record<string, string>>({});
  const [batchSearchTerm, setBatchSearchTerm] = useState<Record<string, string>>({});

  const toggleBatchAccordion = (batchId: string) => {
    setExpandedBatchIds((prev) => {
      const next = new Set(prev);
      if (next.has(batchId)) {
        next.delete(batchId);
      } else {
        next.add(batchId);
      }
      return next;
    });
  };

  const toggleAllBatches = (expand: boolean, allBatchIds: string[]) => {
    if (expand) {
      setExpandedBatchIds(new Set(allBatchIds));
    } else {
      setExpandedBatchIds(new Set());
    }
  };

  // Uploaded Excel Batches State & Rollback Target
  const [uploadedBatches, setUploadedBatches] = useState<any[]>([]);
  const [isLoadingBatches, setIsLoadingBatches] = useState<boolean>(false);
  const [archivedSeasons, setArchivedSeasons] = useState<any[]>([]);
  const [selectedSeasonView, setSelectedSeasonView] = useState<string>('AKTIF');
  const [batchDeleteTarget, setBatchDeleteTarget] = useState<any | null>(null);
  const [deleteDeliveredChoice, setDeleteDeliveredChoice] = useState<boolean>(false);
  const [isDeletingBatch, setIsDeletingBatch] = useState<boolean>(false);

  // Islak İmza Listesi Yönetim Durumu
  const [showMissingAddressModal, setShowMissingAddressModal] = useState<boolean>(false);
  const [signatureData, setSignatureData] = useState<{
    pendingCount: number;
    pendingMahalleCount: number;
    pendingMahalleler: { mahalle: string; count: number }[];
    totalCount: number;
    assignedCount: number;
    nextListNo: number;
    lists: any[];
    missingAddressCount?: number;
    missingAddressBeneficiaries?: MissingAddressBeneficiary[];
    ekKomurVerilenCount?: number;
    ekKomurVerilenTorba?: number;
    ekKomurVerilenBeneficiaries?: any[];
  }>({
    pendingCount: 0,
    pendingMahalleCount: 0,
    pendingMahalleler: [],
    totalCount: 0,
    assignedCount: 0,
    nextListNo: 1,
    lists: [],
    missingAddressCount: 0,
    missingAddressBeneficiaries: [],
    ekKomurVerilenCount: 0,
    ekKomurVerilenTorba: 0,
    ekKomurVerilenBeneficiaries: [],
  });
  const [isLoadingSignatureData, setIsLoadingSignatureData] = useState<boolean>(false);
  const [isGeneratingSignatureList, setIsGeneratingSignatureList] = useState<boolean>(false);
  const [isRollingBackListId, setIsRollingBackListId] = useState<string | null>(null);
  const [recentlyCreatedList, setRecentlyCreatedList] = useState<{
    id: string;
    name: string;
    no: number;
    count: number;
    timestamp: number;
  } | null>(null);
  const [rollbackModalTarget, setRollbackModalTarget] = useState<{
    id: string;
    name: string;
    listeNo?: number;
    count?: number;
    mahalleSayisi?: number;
    isAll?: boolean;
  } | null>(null);

  const fetchSignatureData = async (donemOverride?: string) => {
    const targetDonem = typeof donemOverride === 'string' ? donemOverride : selectedSeasonView;
    setIsLoadingSignatureData(true);
    try {
      const query = targetDonem && targetDonem !== 'AKTIF' ? `?donem_kodu=${encodeURIComponent(targetDonem)}` : '';
      const res = await fetch(`/api/signature-lists${query}`);
      const data = await res.json();
      if (data.success) {
        setSignatureData({
          pendingCount: data.pendingCount || 0,
          pendingMahalleCount: data.pendingMahalleCount || 0,
          pendingMahalleler: data.pendingMahalleler || [],
          totalCount: data.totalCount || 0,
          assignedCount: data.assignedCount || 0,
          nextListNo: data.nextListNo || 1,
          lists: data.lists || [],
          missingAddressCount: data.missingAddressCount || (data.missingAddressBeneficiaries?.length ?? 0),
          missingAddressBeneficiaries: data.missingAddressBeneficiaries || [],
          ekKomurVerilenCount: data.ekKomurVerilenCount || 0,
          ekKomurVerilenTorba: data.ekKomurVerilenTorba || 0,
          ekKomurVerilenBeneficiaries: data.ekKomurVerilenBeneficiaries || [],
        });
      }
    } catch (err) {
      console.error('Signature lists fetch error:', err);
    } finally {
      setIsLoadingSignatureData(false);
    }
  };

  const handleGenerateSignatureList = async () => {
    if (signatureData.pendingCount === 0 || isGeneratingSignatureList) return;

    // Islak imza listesi çıktısı almadan önce adresi eksik kayıt kontrolü - ZORUNLU GÜNCELLEME
    if (signatureData.missingAddressCount && signatureData.missingAddressCount > 0) {
      await showAlert({
        title: '⚠️ Islak İmza Listesi Oluşturulamaz!',
        message: `Sistemde mahallesi veya açık adresi eksik olan ${signatureData.missingAddressCount} hane bulunmaktadır.\n\nIslak imza listelerinde hiçbir kaydın adresi eksik kalamaz ve liste çıkarılmadan önce tüm adreslerin tamamlanması ZORUNLUDUR.\n\nLütfen açılan pencereden bu ${signatureData.missingAddressCount} hanenin mahalle ve adres bilgilerini güncelleyiniz.`,
        type: 'warning',
      });
      setShowMissingAddressModal(true);
      return;
    }

    const isFirstList = signatureData.lists.length === 0;
    const confirmTitle = isFirstList
      ? 'Toplu Islak İmza Listesi Oluşturulsun mu?'
      : `${signatureData.nextListNo}. Islak İmza Listesi (Yeni Eklenenler) Oluşturulsun mu?`;

    const confirmMessage = isFirstList
      ? `Sistemde kayıtlı henüz imza listesi çıkarılmamış ${signatureData.pendingCount} hak sahibi (${signatureData.pendingMahalleCount} mahalle) için resmi A4 yatay baskı formatında, adres A'dan Z'ye sıralı ve boş ıslak imza kutucuklu "1. Dağıtım Islak İmza Listesi" oluşturulacaktır.\n\nKURAL: Bir kayıt sadece tek bir imza listesinde yer alabilir; bu ${signatureData.pendingCount} hane oluşturulan listeye kilitlenecektir. Onaylıyor musunuz?`
      : `Daha önce imza listesi çıkarıldıktan sonra sisteme sonradan eklenen ${signatureData.pendingCount} YENİ hak sahibi (${signatureData.pendingMahalleCount} mahalle) için "${signatureData.nextListNo}. Dağıtım Islak İmza Listesi (Yeni Eklenen Kayıtlar)" oluşturulacaktır.\n\nÖnceki listelerde yer alan kayıtlar bu listeye dahil edilmez. Onaylıyor musunuz?`;

    const confirmed = await showConfirm({
      title: confirmTitle,
      message: confirmMessage,
      type: 'info',
      confirmText: 'Evet, Listeyi Oluştur ve İndir',
      cancelText: 'Vazgeç',
    });

    if (!confirmed) return;

    setIsGeneratingSignatureList(true);
    const abortCtrl = new AbortController();
    const timeoutTimer = setTimeout(() => abortCtrl.abort(), 25000);

    try {
      const res = await fetch('/api/signature-lists', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'GENERATE_NEW_LIST',
          donem_kodu: selectedSeasonView,
        }),
        signal: abortCtrl.signal,
      });
      clearTimeout(timeoutTimer);

      const data = await res.json();
      if (!data.success) {
        if (data.code === 'MISSING_ADDRESSES_MANDATORY_UPDATE' || data.missingAddressCount > 0) {
          if (data.missingAddressBeneficiaries) {
            setSignatureData((prev) => ({
              ...prev,
              missingAddressCount: data.missingAddressCount || data.missingAddressBeneficiaries.length,
              missingAddressBeneficiaries: data.missingAddressBeneficiaries,
            }));
          }
          await showAlert({
            title: '⚠️ Adres Güncellemesi Zorunludur!',
            message: data.error || 'Sistemde adresi eksik kayıtlar bulunmaktadır. Lütfen önce bu adresleri tamamlayınız.',
            type: 'warning',
          });
          setShowMissingAddressModal(true);
          return;
        }
        throw new Error(data.error || 'İmza listesi oluşturulamadı');
      }

      showToast({
        type: 'success',
        title: 'İmza Listesi Hazırlandı',
        message: data.message || `İmza listesi (${data.listName}) başarıyla oluşturuldu ve indiriliyor.`,
      });

      setRecentlyCreatedList({
        id: data.listId,
        name: data.listName,
        no: data.listeNo,
        count: data.count,
        timestamp: Date.now(),
      });

      // Otomatik İndirme
      const downloadUrl = `/api/export?type=signature_list&listId=${encodeURIComponent(data.listId)}&donem_kodu=${encodeURIComponent(selectedSeasonView)}`;
      const link = document.createElement('a');
      link.href = downloadUrl;
      link.download = `Edirne_SYDV_${(data.listName || 'Imza_Listesi').replace(/[^a-zA-Z0-9ÇŞĞÜÖİçşğüöı_-]/g, '_')}.xlsx`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);

      await fetchSignatureData();
      onRefreshAll();
    } catch (err: any) {
      showAlert({
        type: 'error',
        title: 'İmza Listesi Hatası',
        message: err.message || 'İmza listesi oluşturulurken hata oluştu.',
      });
    } finally {
      setIsGeneratingSignatureList(false);
    }
  };

  const executeRollback = async (target: { id: string; name: string; isAll?: boolean }) => {
    setIsRollingBackListId(target.id);
    try {
      const res = await fetch('/api/signature-lists', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: target.isAll ? 'RESET_ALL_LISTS' : 'ROLLBACK_LIST',
          listId: target.id,
        }),
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.error || 'İmza listesi iptal edilemedi');

      showToast({
        type: 'info',
        title: 'İmza Listesi İptal Edildi',
        message: data.message,
      });

      if (recentlyCreatedList && (target.isAll || recentlyCreatedList.id === target.id)) {
        setRecentlyCreatedList(null);
      }
      setRollbackModalTarget(null);

      await fetchSignatureData();
      onRefreshAll();
    } catch (err: any) {
      showAlert({
        type: 'error',
        title: 'İptal / Geri Alma Hatası',
        message: err.message || 'İmza listesi geri alınırken hata oluştu.',
      });
    } finally {
      setIsRollingBackListId(null);
    }
  };

  // Eliminated / Duplicate Records Detail Modal State
  const [eliminatedModalBatch, setEliminatedModalBatch] = useState<{
    batchId?: string;
    dosyaAdi?: string;
    records?: any[];
    title?: string;
  } | null>(null);
  const [modalRecords, setModalRecords] = useState<any[]>([]);
  const [isLoadingModalRecords, setIsLoadingModalRecords] = useState(false);
  const [modalSearch, setModalSearch] = useState('');
  const [modalFilter, setModalFilter] = useState<'ALL' | 'MUKERRER_TC' | 'MUKERRER_HANE' | 'HATALI'>('ALL');
  const [copiedTc, setCopiedTc] = useState<string | null>(null);

  const copyToClipboard = (text: string) => {
    if (!text) return;
    navigator.clipboard.writeText(text);
    setCopiedTc(text);
    setTimeout(() => setCopiedTc(null), 2000);
  };

  const openEliminatedModal = async (target: {
    batchId?: string;
    dosyaAdi?: string;
    records?: any[];
    title?: string;
  }) => {
    setEliminatedModalBatch(target);
    setModalSearch('');
    setModalFilter('ALL');

    if (target.records && target.records.length > 0) {
      setModalRecords(target.records);
      return;
    }

    if (target.batchId) {
      setIsLoadingModalRecords(true);
      try {
        const donemParam = selectedSeasonView !== 'AKTIF' ? `&donem_kodu=${encodeURIComponent(selectedSeasonView)}` : '';
        const res = await fetch(`/api/import/logs?batchId=${encodeURIComponent(target.batchId)}&islemSonucu=EKLENMEDI${donemParam}`);
        const data = await res.json();
        if (data.success) {
          setModalRecords(data.logs || []);
        } else {
          setModalRecords([]);
        }
      } catch (err) {
        console.error('Error fetching eliminated records:', err);
        setModalRecords([]);
      } finally {
        setIsLoadingModalRecords(false);
      }
    } else {
      setModalRecords([]);
    }
  };

  const filteredModalRecords = modalRecords.filter((item) => {
    if (modalFilter !== 'ALL' && item.durum !== modalFilter) {
      return false;
    }
    if (modalSearch.trim()) {
      if (isBirebirBeneficiaryMatch(item, modalSearch)) return true;
      if (
        (item.cakisan_tc || item.cakisan_ad_soyad) &&
        isBirebirBeneficiaryMatch({ tc_no: item.cakisan_tc, ad_soyad: item.cakisan_ad_soyad }, modalSearch)
      ) {
        return true;
      }
      return false;
    }
    return true;
  });

  const fileInputRef = useRef<HTMLInputElement>(null);

  const fetchUploadedBatches = async (donemOverride?: string) => {
    const targetDonem = typeof donemOverride === 'string' ? donemOverride : selectedSeasonView;
    setIsLoadingBatches(true);
    try {
      const query = targetDonem && targetDonem !== 'AKTIF' ? `?donem_kodu=${encodeURIComponent(targetDonem)}` : '';
      const res = await fetch(`/api/import/batches${query}`);
      const data = await res.json();
      if (data.success) {
        setUploadedBatches(data.batches || []);
        if (Array.isArray(data.archivedSeasons)) {
          setArchivedSeasons(data.archivedSeasons);
        }
      }
    } catch (err) {
      console.error('Batches fetch error:', err);
    } finally {
      setIsLoadingBatches(false);
    }
  };

  const fetchLogs = async (donemOverride?: string) => {
    const targetDonem = typeof donemOverride === 'string' ? donemOverride : selectedSeasonView;
    if (logs.length === 0) {
      setIsLoadingLogs(true);
    }
    try {
      const donemParam = targetDonem && targetDonem !== 'AKTIF' ? `&donem_kodu=${encodeURIComponent(targetDonem)}` : '';
      const res = await fetch(`/api/import/logs?durum=HEPSI${donemParam}`);
      const data = await res.json();
      if (data.success) {
        setLogs(data.logs || []);
        setBatches(data.batches || []);
        setLogStats(data.stats || null);
      }
    } catch (err) {
      console.error('Logs fetch error:', err);
    } finally {
      setIsLoadingLogs(false);
    }
  };

  useEffect(() => {
    if (userRole === 'ADMIN') {
      fetchLogs(selectedSeasonView);
      fetchUploadedBatches(selectedSeasonView);
      fetchSignatureData(selectedSeasonView);
      fetchModeStats();
    }
    // The loader functions are re-created every render; the effect must only re-run for these three inputs.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userRole, selectedSeasonView, localCalismaModu]);

  const isRecordElenen = (l: any) => {
    if (l.islem_sonucu === 'EKLENMEDİ') return true;
    if (l.islem_sonucu === 'EKLENDİ_UYARILI' || l.islem_sonucu === 'EKLENDİ') return false;
    return l.durum === 'MUKERRER_TC' || l.durum === 'MUKERRER_HANE';
  };

  const computedLogStats = useMemo(() => {
    let toplamElenen = 0;
    let mukerrerTc = 0;
    let mukerrerHane = 0;
    let eksikHataliElenen = 0;
    let uyariliEklenen = 0;

    for (const l of logs) {
      if (isRecordElenen(l)) {
        toplamElenen++;
        if (l.durum === 'MUKERRER_TC') mukerrerTc++;
        else if (l.durum === 'MUKERRER_HANE') mukerrerHane++;
        else eksikHataliElenen++;
      } else {
        uyariliEklenen++;
      }
    }

    return {
      toplamLog: logs.length,
      toplamHata: toplamElenen, // elenen kayıt sayısı
      toplamElenen,
      mukerrerTc,
      mukerrerHane,
      eksikHataliElenen,
      uyariliEklenen,
    };
  }, [logs]);

  const logsByBatch = useMemo(() => {
    const batchMap = new Map<string, {
      batchId: string;
      dosyaAdi: string;
      createdAt?: string;
      logs: any[];
    }>();

    // First populate from uploadedBatches to keep chronological order (newest first)
    uploadedBatches.forEach((b: any) => {
      const bId = b.batch_id || b.id;
      if (bId) {
        batchMap.set(bId, {
          batchId: bId,
          dosyaAdi: b.dosya_adi || 'Excel Dosyası',
          createdAt: b.created_at || b.tarih,
          logs: []
        });
      }
    });

    // Populate logs into batches
    logs.forEach((log: any) => {
      const bId = log.batch_id || 'UNKNOWN';
      if (!batchMap.has(bId)) {
        batchMap.set(bId, {
          batchId: bId,
          dosyaAdi: log.dosya_adi || 'Bilinmeyen Excel Listesi',
          createdAt: log.created_at || log.tarih,
          logs: []
        });
      }
      const entry = batchMap.get(bId)!;
      if (log.dosya_adi && (entry.dosyaAdi === 'Excel Dosyası' || entry.dosyaAdi === 'Bilinmeyen Excel Listesi')) {
        entry.dosyaAdi = log.dosya_adi;
      }
      entry.logs.push(log);
    });

    // Return batches with computed stats
    return Array.from(batchMap.values())
      .filter((b) => b.logs.length > 0)
      .map((b) => {
        let elenenSayisi = 0;
        let mukerrerTc = 0;
        let mukerrerHane = 0;
        let eksikHataliElenen = 0;
        let uyariliEklenen = 0;

        for (const l of b.logs) {
          if (isRecordElenen(l)) {
            elenenSayisi++;
            if (l.durum === 'MUKERRER_TC') mukerrerTc++;
            else if (l.durum === 'MUKERRER_HANE') mukerrerHane++;
            else eksikHataliElenen++;
          } else {
            uyariliEklenen++;
          }
        }

        return {
          ...b,
          stats: {
            total: b.logs.length,
            elenenSayisi,
            mukerrerTc,
            mukerrerHane,
            eksikHataliElenen,
            uyariliEklenen,
          }
        };
      });
  }, [logs, uploadedBatches]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setSelectedFile(e.target.files[0]);
      setErrorMsg('');
      setUploadResult(null);
    }
  };

  const handleUpload = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedFile) {
      setErrorMsg('Lütfen bir Excel dosyası seçiniz');
      return;
    }

    setIsUploading(true);
    setErrorMsg('');
    setUploadResult(null);

    const uploadedFileName = selectedFile.name;
    const formData = new FormData();
    formData.append('file', selectedFile);
    formData.append('userRole', userRole);
    formData.append('listeTuru', selectedListeTuru);

    try {
      const res = await fetch('/api/import', {
        method: 'POST',
        headers: {
          'x-user-role': userRole
        },
        body: formData
      });

      const data = await res.json();
      if (!data.success) {
        throw new Error(data.error || 'Yükleme sırasında hata oluştu');
      }

      setUploadResult(data);
      setSelectedFile(null);
      if (fileInputRef.current) fileInputRef.current.value = '';
      
      fetchLogs();
      fetchUploadedBatches();
      fetchSignatureData();
      onRefreshAll();

      // If there are eliminated / duplicate records, open modal immediately to inspect them in detail!
      if (data.elenenKayitlar && data.elenenKayitlar.length > 0) {
        openEliminatedModal({
          batchId: data.batchId,
          dosyaAdi: data.dosyaAdi || uploadedFileName,
          records: data.elenenKayitlar,
          title: `"${data.dosyaAdi || uploadedFileName}" Dosyasından Elenen Kayıtlar (${data.elenenKayitlar.length} Kayıt)`
        });
      }
    } catch (err: any) {
      setErrorMsg(err.message || 'Dosya yükleme başarısız');
    } finally {
      setIsUploading(false);
    }
  };

  const handleDeleteBatch = async (batchId: string, force: boolean) => {
    setIsDeletingBatch(true);
    try {
      const res = await fetch(`/api/import/batches?batchId=${encodeURIComponent(batchId)}&force=${force}&callerRole=${userRole}`, {
        method: 'DELETE',
        headers: {
          'x-user-role': userRole
        }
      });
      const data = await res.json();
      if (data.success) {
        setBatchDeleteTarget(null);
        fetchUploadedBatches();
        fetchLogs();
        onRefreshAll();
        showToast({
          type: 'success',
          title: 'Dosya Kayıtları Silindi',
          message: data.message || 'Excel dosyasına ait kayıtlar başarıyla silindi.'
        });
      } else {
        showAlert({
          title: 'Hata',
          message: data.error || 'Dosya kayıtları silinemedi.',
          type: 'error'
        });
      }
    } catch (err: any) {
      showAlert({
        title: 'Bağlantı Hatası',
        message: err.message || 'Bağlantı hatası oluştu.',
        type: 'error'
      });
    } finally {
      setIsDeletingBatch(false);
    }
  };

  const handleClearLogs = async () => {
    const confirmed = await showConfirm({
      title: 'Hata Kayıtlarını Temizle',
      message: 'Yükleme hata kayıtlarını temizlemek istediğinize emin misiniz? Bu işlem geri alınamaz.',
      type: 'warning',
      confirmText: 'Evet, Temizle',
      cancelText: 'Vazgeç'
    });
    if (!confirmed) return;

    try {
      const res = await fetch('/api/import/logs', { 
        method: 'DELETE',
        headers: {
          'x-user-role': userRole
        }
      });
      const data = await res.json();
      if (data.success) {
        showToast({
          type: 'info',
          title: 'Kayıtlar Temizlendi',
          message: 'Yükleme hata kayıtları temizlendi.'
        });
        fetchLogs();
      }
    } catch (err) {
      showAlert({
        title: 'Hata',
        message: 'Kayıtlar temizlenemedi',
        type: 'error'
      });
    }
  };

  if (userRole !== 'ADMIN') {
    return (
      <div className="max-w-md mx-auto my-12 p-6 rounded-3xl bg-white border border-slate-200 shadow-md text-center space-y-4">
        <div className="w-16 h-16 mx-auto rounded-2xl bg-rose-50 border border-rose-200 text-rose-600 flex items-center justify-center">
          <ShieldAlert className="w-8 h-8" />
        </div>
        <div className="space-y-1.5">
          <h3 className="text-base font-extrabold text-slate-800">Excel Aktarımı Sayfası Kilitli</h3>
          <p className="text-xs text-slate-600 font-medium leading-relaxed">
            Excel dosyası aktarımı, hak sahibi yükleme ve liste silme işlemleri yalnızca <strong>Yönetici (Admin)</strong> yetkisine sahip kullanıcılar tarafından yapılabilir.
          </p>
        </div>
        <div className="pt-2">
          <button
            onClick={onSwitchToAdmin}
            className="w-full py-2.5 px-4 rounded-xl bg-amber-500 hover:bg-amber-600 text-white text-xs font-black shadow-md transition-all active:scale-95 flex items-center justify-center gap-2"
          >
            <Shield className="w-4 h-4" />
            <span>Yönetici Doğrulaması Yap</span>
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* ===================================================================== */}
      {/* YÖNETİCİ DENEME ALANI (TEST & SİMÜLASYON MODU) KONTROL MERKEZİ        */}
      {/* ===================================================================== */}
      <div
        className={`rounded-2xl border-2 p-4 sm:p-5 shadow-sm transition-all ${
          localCalismaModu === 'DENEME'
            ? 'bg-gradient-to-br from-indigo-50 via-white to-amber-50/60 border-indigo-500 ring-2 ring-indigo-300/60'
            : 'bg-gradient-to-br from-slate-50 via-white to-emerald-50/40 border-slate-200'
        }`}
      >
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="flex items-start gap-3">
            <div
              className={`w-11 h-11 rounded-2xl flex items-center justify-center shrink-0 shadow-xs border ${
                localCalismaModu === 'DENEME'
                  ? 'bg-indigo-600 text-white border-indigo-700'
                  : 'bg-emerald-600 text-white border-emerald-700'
              }`}
            >
              {localCalismaModu === 'DENEME' ? (
                <FlaskConical className="w-6 h-6 text-white" />
              ) : (
                <Shield className="w-6 h-6 text-white" />
              )}
            </div>

            <div className="space-y-1">
              <div className="flex items-center gap-2 flex-wrap">
                <h3 className="text-sm sm:text-base font-black text-slate-900">
                  Excel Deneme Alanı & Çalışma Modu Yönetimi
                </h3>
                {localCalismaModu === 'DENEME' ? (
                  <span className="px-2.5 py-0.5 rounded-full bg-indigo-600 text-white text-[10px] font-black uppercase tracking-wider flex items-center gap-1">
                    <FlaskConical className="w-3 h-3" />
                    Deneme Modu Aktif (Resmi İşlem Değildir)
                  </span>
                ) : (
                  <span className="px-2.5 py-0.5 rounded-full bg-emerald-100 text-emerald-900 border border-emerald-300 text-[10px] font-black uppercase tracking-wider flex items-center gap-1">
                    <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                    Gerçek (Resmi) Mod Aktif
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-600 font-medium leading-relaxed">
                <strong>Deneme Alanı:</strong> Eklenecek Excel listelerini resmi veritabanına dokunmadan önce test amacıyla sisteme kaydedebilir; eksik veya değiştirilmesi gereken sütunları, mükerrer TC/hane kontrollerini, adres etiketlerini ve dağıtım işlemlerini güvenle deneyebilirsiniz. İstediğiniz an tek dokunuşla <strong>Gerçek Moda</strong> geçerek resmi listelerle çalışabilirsiniz.
              </p>
            </div>
          </div>

          {/* Deneme Verilerini Sıfırlama Butonu (Admin için Her Zaman Esnek Erişim) */}
          <button
            type="button"
            disabled={isResettingSandbox}
            onClick={handleResetSandboxData}
            className="self-start lg:self-center px-3.5 py-2.5 rounded-xl bg-rose-50 hover:bg-rose-100 text-rose-800 border border-rose-300 text-xs font-extrabold flex items-center gap-1.5 transition-all active:scale-95 shrink-0 disabled:opacity-50 shadow-2xs"
          >
            {isResettingSandbox ? (
              <Loader2 className="w-4 h-4 animate-spin text-rose-600" />
            ) : (
              <RotateCcw className="w-4 h-4 text-rose-600" />
            )}
            <span>Deneme Modunu Sıfırla</span>
          </button>
        </div>

        {/* İKİ MOD SEÇİM KARTLARI (MOBİL %100 ERGONOMİK) */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mt-4">
          {/* 1. GERÇEK (RESMİ) MOD KARTI */}
          <div
            onClick={() => handleModeSwitch('RESMI')}
            className={`p-3.5 rounded-2xl border-2 cursor-pointer transition-all flex flex-col justify-between gap-2.5 ${
              localCalismaModu === 'RESMI'
                ? 'border-emerald-600 bg-emerald-50/80 shadow-xs ring-2 ring-emerald-400/40'
                : 'border-slate-200 bg-white hover:border-emerald-300'
            }`}
          >
            <div className="flex items-start justify-between gap-2">
              <div className="flex items-center gap-2.5">
                <div
                  className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${
                    localCalismaModu === 'RESMI'
                      ? 'bg-emerald-600 text-white'
                      : 'bg-slate-100 text-slate-600'
                  }`}
                >
                  <Shield className="w-5 h-5" />
                </div>
                <div>
                  <div className="flex items-center gap-1.5">
                    <span className="text-xs sm:text-sm font-black text-slate-900">
                      🏛️ Gerçek (Resmi) Çalışma Modu
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-600 font-medium">
                    Resmi vakıf dağıtım listeleri ve canlı saha teslimatları
                  </p>
                </div>
              </div>
              <span
                className={`px-2.5 py-1 rounded-lg text-[10px] font-black uppercase shrink-0 ${
                  localCalismaModu === 'RESMI'
                    ? 'bg-emerald-600 text-white'
                    : 'bg-slate-100 text-slate-600 hover:bg-emerald-100 hover:text-emerald-900'
                }`}
              >
                {localCalismaModu === 'RESMI' ? '✓ Şu An Aktif' : 'Gerçek Moda Geç'}
              </span>
            </div>

            <div className="flex items-center justify-between pt-2 border-t border-emerald-200/60 text-[11px] font-bold text-slate-700">
              <span>
                Resmi Kayıtlı Hane:{' '}
                <strong className="text-emerald-900 font-black">
                  {localOfficialStats?.hane_sayisi ?? 0}
                </strong>
              </span>
              <span>
                Resmi Excel Listesi:{' '}
                <strong className="text-emerald-900 font-black">
                  {localOfficialStats?.liste_sayisi ?? 0}
                </strong>
              </span>
            </div>
          </div>

          {/* 2. DENEME ALANI (TEST & SİMÜLASYON MODU) KARTI */}
          <div
            onClick={() => handleModeSwitch('DENEME')}
            className={`p-3.5 rounded-2xl border-2 cursor-pointer transition-all flex flex-col justify-between gap-2.5 ${
              localCalismaModu === 'DENEME'
                ? 'border-indigo-600 bg-indigo-50/90 shadow-xs ring-2 ring-indigo-400/50'
                : 'border-slate-200 bg-white hover:border-indigo-300'
            }`}
          >
            <div className="flex items-start justify-between gap-2">
              <div className="flex items-center gap-2.5">
                <div
                  className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${
                    localCalismaModu === 'DENEME'
                      ? 'bg-indigo-600 text-white'
                      : 'bg-slate-100 text-slate-600'
                  }`}
                >
                  <FlaskConical className="w-5 h-5" />
                </div>
                <div>
                  <div className="flex items-center gap-1.5">
                    <span className="text-xs sm:text-sm font-black text-slate-900">
                      🧪 Deneme Alanı (Test & Simülasyon Modu)
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-600 font-medium">
                    Resmi olmayan liste testi, eksiklik kontrolü ve simülasyon alanı
                  </p>
                </div>
              </div>
              <span
                className={`px-2.5 py-1 rounded-lg text-[10px] font-black uppercase shrink-0 ${
                  localCalismaModu === 'DENEME'
                    ? 'bg-indigo-600 text-white'
                    : 'bg-indigo-50 text-indigo-800 border border-indigo-200 hover:bg-indigo-600 hover:text-white'
                }`}
              >
                {localCalismaModu === 'DENEME' ? '✓ Deneme Aktif' : 'Deneme Modunu Aç'}
              </span>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-indigo-200/60 text-[11px] font-bold text-slate-700">
              <span>
                Test Hanesi:{' '}
                <strong className="text-indigo-900 font-black">
                  {localSandboxStats?.hane_sayisi ?? 0}
                </strong>
              </span>
              <span>
                Test Listesi:{' '}
                <strong className="text-indigo-900 font-black">
                  {localSandboxStats?.liste_sayisi ?? 0}
                </strong>
              </span>
              <span>
                Tespit Edilen Eksik/Mükerrer:{' '}
                <strong className="text-amber-800 font-black">
                  {localSandboxStats?.hata_log_sayisi ?? 0}
                </strong>
              </span>
            </div>
          </div>
        </div>

        {/* Deneme Modu Aktifken Bilgilendirme Kutusu */}
        {localCalismaModu === 'DENEME' && (
          <div className="mt-3 p-3 rounded-xl bg-indigo-950 text-white flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
            <div className="flex items-start gap-2.5">
              <FlaskConical className="w-4 h-4 text-amber-300 shrink-0 mt-0.5" />
              <div className="leading-relaxed">
                <strong className="text-amber-300">Şu Anda Deneme Alanındasınız:</strong> Buradan yükleyeceğiniz Excel listeleri ve sistem genelinde (Sorgu, Tek Hane Ekleme, Teslimat, Rota) yapacağınız tüm denemeler <strong>izole test koleksiyonlarına</strong> kaydedilir; resmi kurum verilerinizi kesinlikle etkilemez. İstediğiniz an sıfırlayabilirsiniz.
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2 shrink-0">
              <button
                type="button"
                disabled={isResettingSandbox}
                onClick={handleSeedFakeSandboxData}
                className="px-3 py-2 rounded-xl bg-amber-500 hover:bg-amber-600 text-indigo-950 font-black text-xs flex items-center justify-center gap-1.5 shadow-xs transition-all active:scale-95 disabled:opacity-50"
              >
                <FlaskConical className="w-3.5 h-3.5" />
                <span>Örnek (Fake) Veri Yükle / Yenile</span>
              </button>
              <button
                type="button"
                disabled={isResettingSandbox}
                onClick={handleResetSandboxData}
                className="px-3 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 text-white font-black text-xs flex items-center justify-center gap-1.5 shadow-xs transition-all active:scale-95 disabled:opacity-50"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>Deneme Modunu Sıfırla</span>
              </button>
              <button
                type="button"
                onClick={() => handleModeSwitch('RESMI')}
                className="px-3.5 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-600 text-white font-black text-xs flex items-center justify-center gap-1.5 shadow-xs transition-all active:scale-95"
              >
                <Play className="w-3.5 h-3.5" />
                <span>Gerçek (Resmi) Moda Geç</span>
              </button>
            </div>
          </div>
        )}
      </div>

      {/* MASAÜSTÜ İKİ KOLONLU DÜZEN: Yükleme Paneli & Yüklenen Dosyalar */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 items-start">
        {/* Excel Upload Section - Light Mode */}
        <div
          className={`p-5 rounded-2xl bg-white border shadow-sm space-y-4 ${
            localCalismaModu === 'DENEME' ? 'border-indigo-400 ring-1 ring-indigo-200' : 'border-slate-200'
          }`}
        >
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <div
              className={`w-10 h-10 rounded-xl flex items-center justify-center border ${
                localCalismaModu === 'DENEME'
                  ? 'bg-indigo-100 text-indigo-800 border-indigo-200'
                  : 'bg-emerald-100 text-emerald-800 border-emerald-200'
              }`}
            >
              {localCalismaModu === 'DENEME' ? (
                <FlaskConical className="w-6 h-6 text-indigo-700" />
              ) : (
                <FileSpreadsheet className="w-6 h-6 text-emerald-700" />
              )}
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h3 className="text-base font-extrabold text-slate-900 leading-tight">
                  {localCalismaModu === 'DENEME'
                    ? 'Deneme Alanına Test Excel Listesi Yükle'
                    : 'Excel Dosyası Yükle'}
                </h3>
                {localCalismaModu === 'DENEME' ? (
                  <span className="px-2 py-0.5 rounded-full bg-indigo-100 text-indigo-900 border border-indigo-300 text-[10px] font-black flex items-center gap-1">
                    <FlaskConical className="w-3 h-3 text-indigo-600" />
                    Deneme Alanı (Resmi Değil)
                  </span>
                ) : (
                  <span className="px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 border border-emerald-300 text-[10px] font-black flex items-center gap-1">
                    <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                    Aktif Dönem: {activeSeasonCode}
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-500 font-medium">
                {localCalismaModu === 'DENEME'
                  ? 'Excel dosyanızdaki eksiklikleri, adres/mahalle ayrıştırmasını ve mükerrer kayıtları test edin'
                  : 'Hak sahibi vatandaş listesini otomatik aktarın (Eski dönem listeleri arşivde saklanır)'}
              </p>
            </div>
          </div>

          <a
            href="/api/export?type=template"
            download="Edirne_SYDV_Komur_Yukleme_Sablonu.xlsx"
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-xs font-bold text-slate-700 border border-slate-200 shrink-0 transition-all active:scale-95 shadow-xs"
            title="Örnek Excel Şablonu İndir"
          >
            <Download className="w-3.5 h-3.5 text-amber-600" />
            <span>Örnek Şablon</span>
          </a>
        </div>

        {/* Geçmiş Dönem Arşiv Görünümü Uyarısı */}
        {selectedSeasonView !== 'AKTIF' && (
          <div className="p-3 rounded-xl bg-amber-50 border border-amber-300 text-xs text-amber-900 flex items-start gap-2">
            <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
            <div className="space-y-0.5">
              <span className="font-black">Geçmiş Dönem Arşivi Görüntüleniyor ({selectedSeasonView})</span>
              <p className="text-[11px] text-amber-800">
                Şu anda geçmiş döneme ait arşivlenmiş listeleri incelemektesiniz. Yeni bir Excel yüklediğinizde bu liste otomatik olarak sıfırlanmış güncel aktif döneme (<strong>{activeSeasonCode}</strong>) eklenecektir. Eski dönem listeleri arşivde salt-okunur olarak kalır.
              </p>
            </div>
          </div>
        )}

        {/* Info Box on Automatic Checks */}
        <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 text-xs text-slate-700 space-y-1.5">
          <p className="font-extrabold text-amber-800 flex items-center gap-1">
            <span>⚡ Otomatik Kontroller ve Güvenlik:</span>
          </p>
          <ul className="list-disc list-inside space-y-0.5 text-slate-600 text-[11px] font-medium">
            <li><strong>Çift Telefon Numarası Desteği:</strong> Dosyada iki telefon varsa (ayrı sütunlarda veya tek sütunda &quot;/&quot;, &quot;-&quot; ile ayrılmış) otomatik tespit edilir, sahada arama yaparken seçim sunulur.</li>
            <li><strong>Mükerrer TC Kontrolü:</strong> Veritabanında veya dosyada aynı TC varsa ikinci kayıt reddedilir.</li>
            <li><strong>Mükerrer Hane No Kontrolü:</strong> Aynı hane numarası ikinci kez gelirse elenir; gecekondu ve müstakil bölgelerde aynı adreste oturan <strong>farklı TC kimlik numaralı</strong> aileler hata sayılmaz ve doğrudan sisteme eklenir.</li>
            <li><strong>Hatalı / Eksik Kayıtlar:</strong> Mükerrer TC, mükerrer hane no veya eksik TC/adres/telefon içeren kayıtlar aşağıdaki sonuç listesinde gösterilir.</li>
          </ul>
        </div>

        {/* Upload Form */}
        <form onSubmit={handleUpload} className="space-y-4">
          {/* Liste Türü Seçimi */}
          <div className="space-y-2">
            <label className="block text-xs font-black uppercase tracking-wider text-slate-700 flex items-center gap-1.5">
              <span>📋 Yüklenecek Liste Türü ve Islak İmza Dosya Kategorisi:</span>
            </label>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              {/* 1. Standart Liste */}
              <div
                onClick={() => setSelectedListeTuru('STANDART')}
                className={`p-3 rounded-2xl border-2 cursor-pointer transition-all flex flex-col justify-between gap-2 ${
                  selectedListeTuru === 'STANDART'
                    ? 'border-sky-500 bg-sky-50/70 shadow-sm ring-1 ring-sky-400/50'
                    : 'border-slate-200 bg-white hover:border-slate-300'
                }`}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className={`w-7 h-7 rounded-lg flex items-center justify-center ${selectedListeTuru === 'STANDART' ? 'bg-sky-600 text-white' : 'bg-slate-100 text-slate-600'}`}>
                      <FileText className="w-4 h-4" />
                    </div>
                    <span className="text-xs font-black text-slate-900">Standart Liste</span>
                  </div>
                  <span className={`w-4 h-4 rounded-full border-2 flex items-center justify-center ${selectedListeTuru === 'STANDART' ? 'border-sky-600 bg-sky-600' : 'border-slate-300'}`}>
                    {selectedListeTuru === 'STANDART' && <span className="w-1.5 h-1.5 rounded-full bg-white" />}
                  </span>
                </div>
                <p className="text-[11px] text-slate-600 font-medium leading-relaxed">
                  Mahallede ilk kayıt ise <strong>Ana Liste</strong> (1, 2...), önceden kayıt varsa otomatik <strong>Ek Liste</strong> olarak numaralandırılır.
                </p>
                <span className="text-[10px] font-bold text-sky-800 bg-sky-100/70 px-2 py-0.5 rounded-md self-start border border-sky-200">
                  Otomatik Gruplama
                </span>
              </div>

              {/* 2. Sigortalılar Listesi */}
              <div
                onClick={() => setSelectedListeTuru('SIGORTALI')}
                className={`p-3 rounded-2xl border-2 cursor-pointer transition-all flex flex-col justify-between gap-2 ${
                  selectedListeTuru === 'SIGORTALI'
                    ? 'border-purple-500 bg-purple-50/80 shadow-sm ring-1 ring-purple-400/50'
                    : 'border-slate-200 bg-white hover:border-purple-300'
                }`}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className={`w-7 h-7 rounded-lg flex items-center justify-center ${selectedListeTuru === 'SIGORTALI' ? 'bg-purple-600 text-white' : 'bg-slate-100 text-slate-600'}`}>
                      <Shield className="w-4 h-4" />
                    </div>
                    <span className="text-xs font-black text-slate-900">Sigortalılar Listesi</span>
                  </div>
                  <span className={`w-4 h-4 rounded-full border-2 flex items-center justify-center ${selectedListeTuru === 'SIGORTALI' ? 'border-purple-600 bg-purple-600' : 'border-slate-300'}`}>
                    {selectedListeTuru === 'SIGORTALI' && <span className="w-1.5 h-1.5 rounded-full bg-white" />}
                  </span>
                </div>
                <p className="text-[11px] text-slate-600 font-medium leading-relaxed">
                  Sigortalı hak sahipleri. Mahalle/köye göre gruplanır; sıra no <strong>Sigortalı - 1, Sigortalı - 2</strong> şeklinde verilir.
                </p>
                <span className="text-[10px] font-bold text-purple-900 bg-purple-100 px-2 py-0.5 rounded-md self-start border border-purple-200">
                  Ayrı Islak İmza Dosyası
                </span>
              </div>

              {/* 3. Zorunlu Ek Liste */}
              <div
                onClick={() => setSelectedListeTuru('EK_LISTE')}
                className={`p-3 rounded-2xl border-2 cursor-pointer transition-all flex flex-col justify-between gap-2 ${
                  selectedListeTuru === 'EK_LISTE'
                    ? 'border-amber-500 bg-amber-50/70 shadow-sm ring-1 ring-amber-400/50'
                    : 'border-slate-200 bg-white hover:border-slate-300'
                }`}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className={`w-7 h-7 rounded-lg flex items-center justify-center ${selectedListeTuru === 'EK_LISTE' ? 'bg-amber-600 text-white' : 'bg-slate-100 text-slate-600'}`}>
                      <FileSpreadsheet className="w-4 h-4" />
                    </div>
                    <span className="text-xs font-black text-slate-900">Zorunlu Ek Liste</span>
                  </div>
                  <span className={`w-4 h-4 rounded-full border-2 flex items-center justify-center ${selectedListeTuru === 'EK_LISTE' ? 'border-amber-600 bg-amber-600' : 'border-slate-300'}`}>
                    {selectedListeTuru === 'EK_LISTE' && <span className="w-1.5 h-1.5 rounded-full bg-white" />}
                  </span>
                </div>
                <p className="text-[11px] text-slate-600 font-medium leading-relaxed">
                  İlk yükleme olsa dahi doğrudan <strong>Ek Liste (Ek1, Ek2...)</strong> olarak işaretlenir ve dosyalanır.
                </p>
                <span className="text-[10px] font-bold text-amber-900 bg-amber-100/70 px-2 py-0.5 rounded-md self-start border border-amber-200">
                  Ek Dağıtım Dosyası
                </span>
              </div>
            </div>
          </div>

          <div
            onClick={() => fileInputRef.current?.click()}
            className={`border-2 border-dashed rounded-2xl p-6 text-center cursor-pointer transition-all ${
              selectedFile
                ? 'border-emerald-500 bg-emerald-50/50'
                : 'border-slate-300 bg-slate-50/60 hover:bg-slate-50 hover:border-amber-400'
            }`}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept=".xlsx, .xls, .csv"
              onChange={handleFileChange}
              className="hidden"
            />
            <Upload className={`w-8 h-8 mx-auto mb-2 ${selectedFile ? 'text-emerald-600' : 'text-slate-400'}`} />
            {selectedFile ? (
              <div>
                <p className="text-sm font-extrabold text-emerald-800 truncate max-w-xs mx-auto">
                  {selectedFile.name}
                </p>
                <p className="text-xs text-slate-500 mt-1 font-semibold">
                  {(selectedFile.size / 1024).toFixed(1)} KB • Yüklemeye hazır
                </p>
              </div>
            ) : (
              <div>
                <p className="text-sm font-bold text-slate-800">Excel dosyasını seçmek için dokunun</p>
                <p className="text-xs text-slate-500 mt-1 font-medium">.xlsx veya .xls formatı desteklenir</p>
              </div>
            )}
          </div>

          {errorMsg && (
            <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs flex items-center gap-2 font-medium">
              <AlertTriangle className="w-4 h-4 shrink-0 text-rose-600" />
              <span>{errorMsg}</span>
            </div>
          )}

          {/* Upload Success Banner */}
          {uploadResult && (
            <div className="p-4 rounded-xl bg-emerald-50 border border-emerald-300 text-emerald-900 space-y-3 animate-in fade-in">
              <div className="flex items-center gap-2 font-extrabold text-sm text-emerald-800">
                <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
                <span>Yükleme İşlemi Tamamlandı!</span>
              </div>
              <p className="text-xs font-medium text-emerald-950">{uploadResult.message}</p>
              
              <div className="grid grid-cols-3 gap-2 pt-1 border-t border-emerald-200 text-center">
                <div className="p-1.5 rounded-lg bg-white border border-emerald-200">
                  <span className="text-[10px] text-slate-500 font-bold">Toplam Satır</span>
                  <p className="text-sm font-black text-slate-900">{uploadResult.totalRows}</p>
                </div>
                <div className="p-1.5 rounded-lg bg-white border border-emerald-200">
                  <span className="text-[10px] text-emerald-700 font-bold">Eklenen</span>
                  <p className="text-sm font-black text-emerald-600">+{uploadResult.insertedCount}</p>
                </div>
                <div className="p-1.5 rounded-lg bg-white border border-rose-200">
                  <span className="text-[10px] text-rose-600 font-bold">Elenen / Mükerrer</span>
                  <p className="text-sm font-black text-rose-600">{uploadResult.failedCount}</p>
                </div>
              </div>

              {/* Duplicate Breakdown Chips */}
              {(uploadResult.mukerrerTcCount > 0 || uploadResult.mukerrerHaneCount > 0 || uploadResult.hataliCount > 0) && (
                <div className="flex flex-wrap gap-2 pt-1 text-[11px] font-bold">
                  {uploadResult.mukerrerTcCount > 0 && (
                    <span className="px-2 py-0.5 rounded-md bg-amber-100 text-amber-900 border border-amber-300">
                      Mükerrer TC: {uploadResult.mukerrerTcCount} adet (Yeniden Eklenmedi)
                    </span>
                  )}
                  {uploadResult.mukerrerHaneCount > 0 && (
                    <span className="px-2 py-0.5 rounded-md bg-indigo-100 text-indigo-900 border border-indigo-300">
                      Mükerrer Hane / Adres: {uploadResult.mukerrerHaneCount} adet (Yeniden Eklenmedi)
                    </span>
                  )}
                  {uploadResult.uyariliCount > 0 && (
                    <span className="px-2 py-0.5 rounded-md bg-blue-100 text-blue-900 border border-blue-300">
                      Uyarılı Eklenen: {uploadResult.uyariliCount} adet
                    </span>
                  )}
                </div>
              )}

              {/* Prominent Action Callout for Eliminated Records */}
              {uploadResult.failedCount > 0 && (
                <div className="mt-2 p-3.5 rounded-xl bg-amber-500/10 border-2 border-amber-400 text-amber-950 space-y-3">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
                    <div className="flex items-center gap-2">
                      <div className="w-8 h-8 rounded-lg bg-amber-600 text-white flex items-center justify-center shrink-0 shadow-2xs">
                        <AlertTriangle className="w-5 h-5 text-white" />
                      </div>
                      <div>
                        <h4 className="text-xs font-black text-amber-950 leading-tight">
                          {uploadResult.failedCount} Adet Kayıt Elendi (Sisteme Eklenmedi)
                        </h4>
                        <p className="text-[11px] text-amber-900 font-medium">
                          Mükerrer TC veya aynı hane çakışması nedeniyle atlanan hak sahipleri
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 flex-wrap">
                      <button
                        type="button"
                        onClick={() => openEliminatedModal({
                          batchId: uploadResult.batchId,
                          dosyaAdi: uploadResult.dosyaAdi,
                          records: uploadResult.elenenKayitlar,
                          title: `"${uploadResult.dosyaAdi || 'Yüklenen Dosya'}" Dosyasından Elenen Kayıtlar (${uploadResult.failedCount} Kayıt)`
                        })}
                        className="px-3 py-1.5 rounded-xl bg-amber-600 hover:bg-amber-700 text-white font-black text-xs flex items-center justify-center gap-1.5 shadow-xs transition-all active:scale-95"
                      >
                        <Eye className="w-4 h-4 text-white" />
                        <span>Elenen Kayıtları Detaylı İncele</span>
                      </button>

                      <a
                        href={`/api/export?type=errors&batchId=${encodeURIComponent(uploadResult.batchId)}`}
                        download={`Edirne_SYDV_Elenen_Kayitlar_${uploadResult.batchId}.xlsx`}
                        className="px-3 py-1.5 rounded-xl bg-white hover:bg-amber-50 text-amber-900 border border-amber-300 font-bold text-xs flex items-center justify-center gap-1.5 shadow-2xs transition-all active:scale-95"
                        title="Elenen kayıtları Excel olarak indir"
                      >
                        <Download className="w-3.5 h-3.5 text-emerald-700" />
                        <span>Excel İndir</span>
                      </a>
                    </div>
                  </div>

                  {/* Inline preview of first few eliminated records */}
                  {uploadResult.elenenKayitlar && uploadResult.elenenKayitlar.length > 0 && (
                    <div className="space-y-1.5 pt-2 border-t border-amber-300/80">
                      <div className="flex items-center justify-between text-[11px] font-bold text-amber-900">
                        <span>Elenen Kayıtlardan Özet (İlk {Math.min(3, uploadResult.elenenKayitlar.length)} Kayıt):</span>
                        <button
                          type="button"
                          onClick={() => openEliminatedModal({
                            batchId: uploadResult.batchId,
                            dosyaAdi: uploadResult.dosyaAdi,
                            records: uploadResult.elenenKayitlar,
                            title: `"${uploadResult.dosyaAdi || 'Yüklenen Dosya'}" Dosyasından Elenen Kayıtlar (${uploadResult.failedCount} Kayıt)`
                          })}
                          className="text-amber-800 hover:text-amber-950 underline font-black"
                        >
                          Tüm {uploadResult.failedCount} Elenen Kaydı Gör ({uploadResult.failedCount}) →
                        </button>
                      </div>

                      <div className="space-y-1.5">
                        {uploadResult.elenenKayitlar.slice(0, 3).map((item: any, idx: number) => (
                          <div key={idx} className="p-2.5 rounded-lg bg-white border border-amber-200 text-xs shadow-2xs space-y-1">
                            <div className="flex items-center justify-between gap-2">
                              <div className="font-extrabold text-slate-900 truncate">
                                {item.satir_no && <span className="text-slate-500 font-mono mr-1.5">Satır #{item.satir_no}:</span>}
                                <span>{item.ad_soyad}</span>
                                <span className="font-mono text-slate-500 text-[11px] ml-2 font-normal">TC: {item.tc_no}</span>
                              </div>
                              <span className="badge text-[9px] py-0.5 px-2 bg-rose-50 text-rose-700 border border-rose-200 shrink-0 font-bold">
                                {item.durum === 'MUKERRER_TC' ? 'Mükerrer TC' : 'Mükerrer Hane'}
                              </span>
                            </div>
                            <p className="text-[11px] text-slate-700 bg-amber-50/70 p-1 rounded font-medium leading-relaxed">
                              {item.hata_nedeni}
                            </p>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Mahallelere ve Köylere Göre Gruplanmış Kayıtlar */}
              {uploadResult.mahalleOzet && uploadResult.mahalleOzet.length > 0 && (() => {
                const uploadMahalles = uploadResult.mahalleOzet.filter((mo: any) => !isKoySettlement(mo.mahalle, mo.tip));
                const uploadKoys = uploadResult.mahalleOzet.filter((mo: any) => isKoySettlement(mo.mahalle, mo.tip));

                return (
                  <div className="pt-2.5 border-t border-emerald-200/90 space-y-2.5">
                    <div className="flex items-center justify-between text-xs font-extrabold text-emerald-950">
                      <span className="flex items-center gap-1.5">
                        <MapPin className="w-3.5 h-3.5 text-emerald-700 shrink-0" />
                        <span>Yerleşim Yerlerine Göre Dağılım ({uploadResult.mahalleOzet.length} Yerleşim):</span>
                      </span>
                      <div className="flex items-center gap-2 text-[11px] font-bold">
                        <span className="text-sky-800">{uploadMahalles.length} Mahalle</span>
                        <span>•</span>
                        <span className="text-emerald-800">{uploadKoys.length} Köy</span>
                        <span>•</span>
                        <span className="font-mono text-emerald-950">Toplam {uploadResult.insertedCount} Hak Sahibi</span>
                      </div>
                    </div>

                    {/* Şehir Mahalleleri */}
                    {uploadMahalles.length > 0 && (
                      <div className="space-y-1">
                        <div className="flex items-center gap-1.5 text-[11px] font-black text-sky-900 bg-sky-50 px-2.5 py-1 rounded-lg border border-sky-200">
                          <Building2 className="w-3.5 h-3.5 text-sky-700 shrink-0" />
                          <span>🏙️ Şehir Mahalleleri ({uploadMahalles.length})</span>
                        </div>
                        <div className="grid grid-cols-2 gap-1.5 max-h-48 overflow-y-auto pr-1">
                          {uploadMahalles.map((mo: any, idx: number) => (
                            <div
                              key={`up_mah_${idx}`}
                              className="p-1.5 px-2.5 rounded-lg bg-white border border-sky-200 text-[11px] flex items-center justify-between gap-1 shadow-2xs"
                            >
                              <strong className="text-slate-900 truncate" title={mo.mahalle}>
                                {mo.mahalle}:
                              </strong>
                              <div className="flex items-center gap-1 shrink-0 text-[10px]">
                                <span className="text-amber-800 font-extrabold">{mo.ek_liste_adi}</span>
                                <span className="text-sky-700 font-mono font-bold bg-sky-50 px-1 py-0.5 rounded border border-sky-100">
                                  ({mo.sira_araligi})
                                </span>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Köy Yerleşimleri */}
                    {uploadKoys.length > 0 && (
                      <div className="space-y-1">
                        <div className="flex items-center gap-1.5 text-[11px] font-black text-emerald-900 bg-emerald-50 px-2.5 py-1 rounded-lg border border-emerald-200">
                          <Trees className="w-3.5 h-3.5 text-emerald-700 shrink-0" />
                          <span>🌲 Köy Yerleşimleri ({uploadKoys.length})</span>
                        </div>
                        <div className="grid grid-cols-2 gap-1.5 max-h-48 overflow-y-auto pr-1">
                          {uploadKoys.map((mo: any, idx: number) => (
                            <div
                              key={`up_koy_${idx}`}
                              className="p-1.5 px-2.5 rounded-lg bg-white border border-emerald-200 text-[11px] flex items-center justify-between gap-1 shadow-2xs"
                            >
                              <strong className="text-slate-900 truncate" title={mo.mahalle}>
                                {mo.mahalle}:
                              </strong>
                              <div className="flex items-center gap-1 shrink-0 text-[10px]">
                                <span className="text-amber-800 font-extrabold">{mo.ek_liste_adi}</span>
                                <span className="text-emerald-700 font-mono font-bold bg-emerald-50 px-1 py-0.5 rounded border border-emerald-100">
                                  ({mo.sira_araligi})
                                </span>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })()}

              {/* Sekmeli Excel İndirme Butonu */}
              {uploadResult.insertedCount > 0 && (
                <div className="pt-2.5 border-t border-emerald-200/90 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <div className="flex items-center gap-1.5 text-xs text-emerald-900 font-semibold">
                    <FileSpreadsheet className="w-4 h-4 text-emerald-700 shrink-0" />
                    <span>Bu dosyadan sisteme eklenen {uploadResult.insertedCount} hak sahibini mahallelere göre ayrı sekmelerde indirin:</span>
                  </div>
                  <a
                    href={`/api/export?type=batch_by_mahalle&batchId=${encodeURIComponent(uploadResult.batchId)}`}
                    download={`Edirne_SYDV_${(uploadResult.dosyaAdi || 'Yuklenen_Excel').replace(/\.[^/.]+$/, '')}_Mahalle_Sekmeli.xlsx`}
                    className="px-3.5 py-1.5 rounded-xl bg-emerald-700 hover:bg-emerald-800 text-white font-extrabold text-xs flex items-center justify-center gap-1.5 shadow-xs transition-all active:scale-95"
                    title="Yüklenen dosyayı mahalle isimlerine göre sekmelere bölünmüş Excel çalışma kitabı olarak indirin"
                  >
                    <Download className="w-3.5 h-3.5 text-white" />
                    <span>Mahallelere Göre İndir</span>
                  </a>
                </div>
              )}
            </div>
          )}

          <div className="flex gap-2">
            {selectedFile && (
              <button
                type="button"
                onClick={() => {
                  setSelectedFile(null);
                  if (fileInputRef.current) fileInputRef.current.value = '';
                }}
                className="btn-secondary px-3"
              >
                Temizle
              </button>
            )}

            <button
              type="submit"
              disabled={isUploading || !selectedFile}
              className="btn-primary flex-1 py-3 text-sm font-bold disabled:opacity-50"
            >
              {isUploading ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin text-white" />
                  Excel Analiz Ediliyor & Aktarılıyor...
                </>
              ) : (
                <>
                  <Upload className="w-4 h-4 text-white" />
                  Excel Verilerini Sisteme Aktar
                </>
              )}
            </button>
          </div>
        </form>

        {/* Export All Beneficiaries Button */}
        <div className="pt-2 border-t border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs text-slate-500 font-medium">
          <span>Veritabanındaki güncel listeyi dışa aktarın:</span>
          <div className="flex items-center gap-3 flex-wrap">
            <a
              href="/api/export?type=batch_by_mahalle&batchId=ALL"
              download="Edirne_SYDV_Tum_Mahalleler_Sekmeli_Dagitim_Listesi.xlsx"
              className="flex items-center gap-1.5 text-emerald-800 hover:text-emerald-900 font-extrabold underline"
              title="Tüm hak sahiplerini mahalle mahalle ayrı sekmelerde indirin"
            >
              <FileSpreadsheet className="w-4 h-4 text-emerald-700" />
              <span>Mahallelere Göre Sekmeli İndir</span>
            </a>
            <span className="text-slate-300">•</span>
            <a
              href="/api/export?type=beneficiaries"
              download="Edirne_SYDV_Komur_Hak_Sahipleri_Listesi.xlsx"
              className="flex items-center gap-1 text-amber-800 hover:text-amber-900 font-bold underline"
              title="Tüm hak sahiplerini tek liste halinde indirin"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Tek Liste İndir</span>
            </a>
            <span className="text-slate-300">•</span>
            <a
              href={`/api/export?type=signature_list&listId=ALL&donem_kodu=${encodeURIComponent(selectedSeasonView)}`}
              download="Edirne_SYDV_Tum_Mahalleler_Toplu_Islak_Imza_Listesi.xlsx"
              className="flex items-center gap-1 text-indigo-800 hover:text-indigo-900 font-extrabold underline"
              title="Tüm mahallelerin ıslak imza listelerini A4 yatay formatta indirin"
            >
              <PenLine className="w-3.5 h-3.5 text-indigo-700" />
              <span>Toplu Islak İmza Listesi İndir</span>
            </a>
          </div>
        </div>
      </div>

      {/* 2. ISLAK İMZA LİSTESİ YÖNETİM ALANI (HER MAHALLE AYRI LİSTE, ADRES A-Z SIRALI, BOŞ İMZA ALANI, A4 YATAY BASKI) */}
      <div className="p-5 sm:p-6 rounded-2xl bg-white border border-slate-200 shadow-sm space-y-5">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 pb-3 border-b border-slate-100">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-2xl bg-gradient-to-br from-indigo-700 to-slate-900 text-white flex items-center justify-center shadow-sm shrink-0">
              <PenLine className="w-6 h-6 text-white" />
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h3 className="text-base sm:text-lg font-black text-slate-900">
                  Resmi Islak İmza Listeleri & Mahalle Dağıtım Çizelgesi
                </h3>
                <span className="px-2 py-0.5 rounded-md bg-indigo-100 text-indigo-800 text-[10px] font-black uppercase tracking-wider border border-indigo-200">
                  A4 Yatay Baskı Formatı
                </span>
              </div>
              <p className="text-xs text-slate-500 font-medium">
                Her mahalle için adres A'dan Z'ye sıralı, boş ıslak imza kutucuklu, üstten/yandan tam hizalı ve toplu yazdırmaya hazır resmi liste yönetimi.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 flex-wrap shrink-0">
            <button
              type="button"
              onClick={() => fetchSignatureData(selectedSeasonView)}
              disabled={isLoadingSignatureData}
              className="px-3 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold flex items-center gap-1.5 transition-all active:scale-95"
              title="İmza listesi durumunu yenile"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isLoadingSignatureData ? 'animate-spin text-indigo-600' : 'text-slate-600'}`} />
              <span>Yenile</span>
            </button>
          </div>
        </div>

        {/* 4'lü İstatistik Özeti */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 flex items-center justify-between">
            <div>
              <span className="text-[11px] font-bold text-slate-500 uppercase">Toplam Hak Sahibi</span>
              <p className="text-xl font-black text-slate-900">{signatureData.totalCount}</p>
            </div>
            <Users className="w-7 h-7 text-slate-400" />
          </div>

          <div className="p-3.5 rounded-xl bg-emerald-50/80 border border-emerald-200 flex items-center justify-between">
            <div>
              <span className="text-[11px] font-bold text-emerald-700 uppercase">İmza Listesi Çıkarılmış</span>
              <p className="text-xl font-black text-emerald-800">{signatureData.assignedCount}</p>
            </div>
            <CheckCircle2 className="w-7 h-7 text-emerald-600" />
          </div>

          <div className={`p-3.5 rounded-xl border flex items-center justify-between ${
            signatureData.pendingCount > 0
              ? 'bg-amber-50/90 border-amber-300 ring-2 ring-amber-400/20'
              : 'bg-slate-50 border-slate-200'
          }`}>
            <div>
              <span className={`text-[11px] font-bold uppercase ${
                signatureData.pendingCount > 0 ? 'text-amber-800' : 'text-slate-500'
              }`}>
                {signatureData.lists.length === 0 ? 'İmza Listesi Bekleyenler' : 'Yeni Eklenen Kayıtlar'}
              </span>
              <p className={`text-xl font-black ${
                signatureData.pendingCount > 0 ? 'text-amber-900' : 'text-slate-700'
              }`}>
                {signatureData.pendingCount}
                <span className="text-xs font-semibold ml-1.5 opacity-80">
                  ({signatureData.pendingMahalleCount} Mahalle)
                </span>
              </p>
            </div>
            <Sparkles className={`w-7 h-7 ${signatureData.pendingCount > 0 ? 'text-amber-600 animate-pulse' : 'text-slate-400'}`} />
          </div>

          <div className="p-3.5 rounded-xl bg-indigo-50/90 border border-indigo-200 flex items-center justify-between">
            <div>
              <span className="text-[11px] font-bold text-indigo-700 uppercase">Ek Kömür (Manuel İmza)</span>
              <p className="text-xl font-black text-indigo-900">
                {signatureData.ekKomurVerilenCount || 0}
                <span className="text-xs font-semibold text-indigo-700 ml-1.5 opacity-80">
                  ({signatureData.ekKomurVerilenTorba || 0} Torba)
                </span>
              </p>
            </div>
            <PenLine className="w-7 h-7 text-indigo-600" />
          </div>
        </div>

        {/* YANLIŞLIKLA ÇIKTI ALINDIĞINDA ANINDA GERİ ALMA BİLDİRİMİ (UNDO BANNER) */}
        {recentlyCreatedList && (
          <div className="p-4 rounded-xl bg-amber-500/10 border-2 border-amber-400 text-amber-950 flex flex-col md:flex-row md:items-center justify-between gap-3 shadow-xs">
            <div className="flex items-start sm:items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-amber-200 text-amber-800 flex items-center justify-center shrink-0 border border-amber-300">
                <AlertTriangle className="w-5 h-5 text-amber-700" />
              </div>
              <div className="space-y-0.5">
                <div className="flex items-center gap-2 flex-wrap">
                  <strong className="text-xs sm:text-sm font-black text-amber-950">
                    Az Önce Çıktı Alındı: {recentlyCreatedList.name} ({recentlyCreatedList.count} Hane)
                  </strong>
                  <span className="px-2 py-0.5 rounded bg-amber-200 text-amber-900 text-[10px] font-extrabold uppercase tracking-wide">
                    Hatalara Karşı Geri Alınabilir
                  </span>
                </div>
                <p className="text-[11px] text-amber-800 leading-tight">
                  Çıktıyı yanlışlıkla mı aldınız veya listeye henüz eklenmemiş kayıtlar mı vardı? Bu çıktıyı tek tıkla iptal edip tüm hak sahiplerini bekleyenler listesine iade edebilirsiniz.
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              <button
                type="button"
                onClick={() => setRollbackModalTarget({
                  id: recentlyCreatedList.id,
                  name: recentlyCreatedList.name,
                  listeNo: recentlyCreatedList.no,
                  count: recentlyCreatedList.count
                })}
                className="px-3.5 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 active:scale-95 text-white font-extrabold text-xs flex items-center gap-1.5 shadow-xs transition-all"
                title="Bu hatalı çıktıyı derhal iptal edin ve kayıtları bekleyene döndürün"
              >
                <Undo2 className="w-3.5 h-3.5" />
                <span>Yanlış Çıktıyı İptal Et / Geri Al</span>
              </button>
              <button
                type="button"
                onClick={() => setRecentlyCreatedList(null)}
                className="p-1.5 rounded-lg text-amber-800 hover:bg-amber-200/50 transition-all"
                title="Bildirimi Gizle"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}

        {/* ADRESİ EKSİK KAYITLAR İÇİN ZORUNLU GÜNCELLEME UYARI BANDI */}
        {signatureData.missingAddressCount && signatureData.missingAddressCount > 0 ? (
          <div className="p-4 rounded-2xl bg-rose-500/10 border-2 border-rose-500/60 text-rose-950 flex flex-col md:flex-row md:items-center justify-between gap-3 shadow-md">
            <div className="flex items-start sm:items-center gap-3">
              <div className="w-10 h-10 rounded-2xl bg-rose-600 text-white flex items-center justify-center shrink-0 shadow-sm">
                <AlertTriangle className="w-5 h-5 text-white" />
              </div>
              <div className="space-y-0.5">
                <div className="flex items-center gap-2 flex-wrap">
                  <strong className="text-sm font-black text-rose-900">
                    ⚠️ DİKKAT: Mahallesi veya Açık Adresi Eksik {signatureData.missingAddressCount} Hane Bulundu!
                  </strong>
                  <span className="px-2 py-0.5 rounded-full bg-rose-200 text-rose-800 text-[10px] font-black uppercase tracking-wider">
                    Zorunlu Güncelleme
                  </span>
                </div>
                <p className="text-xs text-rose-800 font-medium leading-tight">
                  Islak imza listesi çıktısı alınmadan önce bu hanelerin adreslerinin tamamlanması <strong>zorunludur</strong>. Eksik kayıt kalmayıncaya kadar imza listesi oluşturulamaz.
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={() => setShowMissingAddressModal(true)}
              className="px-4 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-700 active:scale-95 text-white font-black text-xs flex items-center justify-center gap-2 shadow-sm transition-all shrink-0"
            >
              <MapPin className="w-4 h-4" />
              <span>Eksik Adresleri Şimdi Güncelle ({signatureData.missingAddressCount} Hane)</span>
            </button>
          </div>
        ) : null}

        {/* Dinamik Eylem ve Bilgilendirme Alanı */}
        {signatureData.pendingCount > 0 ? (
          <div className={`p-4 rounded-xl border-2 space-y-3.5 transition-all ${
            signatureData.lists.length === 0
              ? 'bg-emerald-500/10 border-emerald-500/40 text-emerald-950'
              : 'bg-amber-500/10 border-amber-400 text-amber-950'
          }`}>
            <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <span className={`w-2.5 h-2.5 rounded-full ${
                    signatureData.lists.length === 0 ? 'bg-emerald-600 animate-ping' : 'bg-amber-600 animate-ping'
                  }`} />
                  <h4 className="text-sm font-black">
                    {signatureData.lists.length === 0
                      ? 'Tüm Mahallelerin 1. Dağıtım Islak İmza Listesi Hazır'
                      : `⚠️ Sisteme Sonradan Eklenen ${signatureData.pendingCount} Yeni Kayıt Tespit Edildi!`}
                  </h4>
                </div>
                <p className="text-xs leading-relaxed opacity-90 max-w-3xl">
                  {signatureData.lists.length === 0
                    ? `Sistemde henüz imza listesi çıkarılmamış toplam ${signatureData.pendingCount} hak sahibi bulunmaktadır. Tek tıkla tüm mahalleleri kendi sekmelerinde adresleri A'dan Z'ye sıralı ve boş imza kutucuklu resmi A4 yatay formatta indirebilirsiniz.`
                    : `Daha önce imza listesi çıkarıldıktan sonra sisteme ${signatureData.pendingCount} yeni kayıt eklendi. "Bir kayıt sadece tek bir imza listesinde yer alabilir" kuralı gereğince, bu yeni kayıtlar için özel ${signatureData.nextListNo}. Dağıtım Islak İmza Listesi oluşturulabilir.`}
                </p>
              </div>

              <button
                type="button"
                onClick={handleGenerateSignatureList}
                disabled={isGeneratingSignatureList}
                className={`px-4 py-2.5 rounded-xl font-black text-xs sm:text-sm text-white flex items-center justify-center gap-2 shadow-sm transition-all shrink-0 active:scale-95 disabled:opacity-50 ${
                  signatureData.lists.length === 0
                    ? 'bg-emerald-700 hover:bg-emerald-800'
                    : 'bg-amber-600 hover:bg-amber-700 ring-2 ring-amber-500/30'
                }`}
              >
                {isGeneratingSignatureList ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>İmza Listesi Hazırlanıyor...</span>
                  </>
                ) : (
                  <>
                    <Download className="w-4 h-4" />
                    <span>
                      {signatureData.missingAddressCount && signatureData.missingAddressCount > 0
                        ? `⚠️ Önce Eksik Adresleri Tamamlayınız (${signatureData.missingAddressCount} Hane)`
                        : signatureData.lists.length === 0
                        ? `Toplu Islak İmza Listesi Oluştur ve İndir (${signatureData.pendingCount} Hane)`
                        : `Yeni Kayıtlar İçin İmza Listesi Oluştur ve İndir (Liste #${signatureData.nextListNo})`}
                    </span>
                  </>
                )}
              </button>
            </div>

            {/* Yeni Eklenen Mahallelerin Dağılım Çipleri */}
            {signatureData.pendingMahalleler.length > 0 && (
              <div className="pt-2 border-t border-amber-200/60 flex items-center gap-1.5 flex-wrap">
                <span className="text-[11px] font-extrabold text-slate-700">İmza Listesi Bekleyen Mahalleler:</span>
                {signatureData.pendingMahalleler.slice(0, 10).map((pm, idx) => (
                  <span
                    key={`pm_${idx}`}
                    className="px-2 py-0.5 rounded-md bg-white border border-slate-300 text-[10px] font-bold text-slate-800 shadow-2xs"
                  >
                    {pm.mahalle}: <strong className="text-amber-700 font-extrabold">{pm.count}</strong>
                  </span>
                ))}
                {signatureData.pendingMahalleler.length > 10 && (
                  <span className="text-[10px] font-bold text-slate-500">
                    +{signatureData.pendingMahalleler.length - 10} mahalle daha
                  </span>
                )}
              </div>
            )}
          </div>
        ) : (
          <div className="p-3.5 rounded-xl bg-emerald-50 border border-emerald-200 flex items-center justify-between gap-3 text-xs text-emerald-900 font-medium">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
              <span>
                <strong>Tüm Kayıtların İmza Listesi Tamamlandı:</strong> Sistemde bekleyen yeni kayıt bulunmamaktadır. Sisteme yeni bir Excel yüklendiğinde veya tekil hane eklendiğinde, sadece yeni eklenen kayıtlara özel ek imza listesi oluşturma seçeneği burada otomatik açılacaktır.
              </span>
            </div>
            {signatureData.lists.length > 0 && (
              <span className="shrink-0 text-[11px] font-extrabold text-emerald-800 bg-white px-2.5 py-1 rounded-lg border border-emerald-200">
                {signatureData.lists.length} İmza Listesi Aktif
              </span>
            )}
          </div>
        )}

        {/* Kurumsal Format Güvenceleri Bilgi Kutusu */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2 text-xs">
          <div className="p-2.5 rounded-xl bg-slate-50 border border-slate-200 flex items-start gap-2">
            <Building2 className="w-4 h-4 text-indigo-700 shrink-0 mt-0.5" />
            <div>
              <strong className="block text-slate-900 font-bold">Her Mahalle Ayrı Sekme</strong>
              <span className="text-[11px] text-slate-500">Tüm mahalleler alfabetik sırayla ayrı çalışma sayfası olarak tek dosyada indirilir.</span>
            </div>
          </div>

          <div className="p-2.5 rounded-xl bg-slate-50 border border-slate-200 flex items-start gap-2">
            <Filter className="w-4 h-4 text-emerald-700 shrink-0 mt-0.5" />
            <div>
              <strong className="block text-slate-900 font-bold">Adres A'dan Z'ye Sıralı</strong>
              <span className="text-[11px] text-slate-500">Saha dağıtımında kolaylık için her mahalledeki haneler cadde/sokak/kapı sırasına göre dizilir.</span>
            </div>
          </div>

          <div className="p-2.5 rounded-xl bg-slate-50 border border-slate-200 flex items-start gap-2">
            <PenLine className="w-4 h-4 text-amber-700 shrink-0 mt-0.5" />
            <div>
              <strong className="block text-slate-900 font-bold">Boş Islak İmza Alanı</strong>
              <span className="text-[11px] text-slate-500">Vatandaşın ıslak imzasını rahatça atabilmesi için 45pt ferah satır yüksekliğinde boş kutu bırakılmıştır.</span>
            </div>
          </div>

          <div className="p-2.5 rounded-xl bg-slate-50 border border-slate-200 flex items-start gap-2">
            <Printer className="w-4 h-4 text-blue-700 shrink-0 mt-0.5" />
            <div>
              <strong className="block text-slate-900 font-bold">A4 Yatay Baskı & Sıfır Fire</strong>
              <span className="text-[11px] text-slate-500">Sayfa başlıkları her sayfada yinelenir (printTitlesRow). Kenar boşlukları taşma yapmadan sığar.</span>
            </div>
          </div>
        </div>

        {/* EK KÖMÜR VERİLENLER (MANUEL EK LİSTE İMZALI) BİLGİ VE İNDİRME ALANI */}
        {(signatureData.ekKomurVerilenCount || 0) > 0 && (
          <div className="p-4 rounded-xl bg-indigo-50/80 border-2 border-indigo-200 text-indigo-950 flex flex-col md:flex-row md:items-center justify-between gap-3 shadow-2xs">
            <div className="flex items-start sm:items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-indigo-100 text-indigo-800 flex items-center justify-center shrink-0 border border-indigo-300">
                <PenLine className="w-5 h-5 text-indigo-700" />
              </div>
              <div className="space-y-0.5">
                <div className="flex items-center gap-2 flex-wrap">
                  <strong className="text-xs sm:text-sm font-black text-indigo-950">
                    Ek Kömür Verilenler (Manuel Islak İmza Listesi): {signatureData.ekKomurVerilenCount} Hane
                  </strong>
                  <span className="px-2 py-0.5 rounded bg-indigo-200 text-indigo-900 text-[10px] font-extrabold uppercase">
                    {signatureData.ekKomurVerilenTorba || 0} Torba Teslim
                  </span>
                </div>
                <p className="text-[11px] text-indigo-800 leading-tight">
                  Islak imza listeleri çıkarıldıktan sonra eklenen ve teslimatı yapılan bu hanelerin ıslak imzaları elden manuel ek listeye alınmıştır.
                </p>
              </div>
            </div>

            <a
              href={`/api/export?type=ek_komur_verilenler&donem_kodu=${encodeURIComponent(selectedSeasonView)}`}
              download="Edirne_SYDV_Ek_Komur_Verilenler_Listesi.xlsx"
              className="px-3.5 py-2 rounded-xl bg-indigo-700 hover:bg-indigo-800 active:scale-95 text-white font-extrabold text-xs flex items-center gap-1.5 shadow-2xs transition-all shrink-0"
              title="Ek kömür verilenler resmi listesini Excel olarak indir"
            >
              <Download className="w-4 h-4 text-white" />
              <span>Ek Kömür İmza Listesi İndir (Excel)</span>
            </a>
          </div>
        )}

        {/* GEÇMİŞTE OLUŞTURULAN İMZA LİSTELERİ ARŞİVİ */}
        {signatureData.lists.length > 0 && (
          <div className="space-y-2 pt-2 border-t border-slate-100">
            <div className="flex items-center justify-between">
              <h4 className="text-xs font-black text-slate-800 uppercase tracking-wider flex items-center gap-1.5">
                <FileCheck className="w-4 h-4 text-indigo-700" />
                <span>Oluşturulan Islak İmza Listeleri ({signatureData.lists.length})</span>
              </h4>
              <div className="flex items-center gap-3">
                <a
                  href={`/api/export?type=signature_list&listId=ALL&donem_kodu=${encodeURIComponent(selectedSeasonView)}`}
                  download="Edirne_SYDV_Tum_Hak_Sahipleri_Arsiv_Islak_Imza_Listesi.xlsx"
                  className="text-[11px] font-extrabold text-indigo-700 hover:text-indigo-900 hover:underline flex items-center gap-1"
                  title="Tüm listeleri birleştirilmiş tek dosya olarak indir"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>Tüm Listeleri Tek Dosyada İndir (Genel Arşiv)</span>
                </a>
                {(signatureData.ekKomurVerilenCount || 0) > 0 && (
                  <a
                    href={`/api/export?type=ek_komur_verilenler&donem_kodu=${encodeURIComponent(selectedSeasonView)}`}
                    download="Edirne_SYDV_Ek_Komur_Verilenler_Listesi.xlsx"
                    className="text-[11px] font-extrabold text-amber-700 hover:text-amber-900 hover:underline flex items-center gap-1"
                    title="Ek kömür teslim edilenler resmi ıslak imza tutanağını Excel olarak indir"
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span>Ek Kömür Listesi İndir ({signatureData.ekKomurVerilenCount} Hane)</span>
                  </a>
                )}
                {signatureData.lists.length > 1 && (
                  <button
                    type="button"
                    onClick={() => setRollbackModalTarget({
                      id: 'ALL',
                      name: 'Tüm Islak İmza Listeleri',
                      count: signatureData.assignedCount,
                      isAll: true,
                    })}
                    className="text-[11px] font-bold text-rose-600 hover:text-rose-800 hover:underline flex items-center gap-1"
                    title="Tüm imza listelerini sıfırlayarak tüm kayıtları bekleyen havuzuna iade edin"
                  >
                    <RotateCcw className="w-3 h-3 text-rose-600" />
                    <span>Tümünü Sıfırla</span>
                  </button>
                )}
              </div>
            </div>

            <div className="space-y-2">
              {signatureData.lists.map((item: any) => {
                const isRollingBack = isRollingBackListId === item.id;
                return (
                  <div
                    key={item.id}
                    className="p-3 rounded-xl bg-slate-50 hover:bg-slate-100/80 border border-slate-200 transition-all flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                  >
                    <div className="space-y-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="px-2 py-0.5 rounded bg-indigo-700 text-white text-[10px] font-black">
                          Liste #{item.liste_no}
                        </span>
                        <strong className="text-xs sm:text-sm font-extrabold text-slate-900">
                          {item.liste_adi}
                        </strong>
                        <span className="text-[11px] text-slate-500 font-medium">
                          • {item.created_at || 'Tarih yok'}
                        </span>
                      </div>
                      <div className="flex items-center gap-3 text-[11px] text-slate-600 font-medium">
                        <span>👥 <strong>{item.toplam_kayit}</strong> Hane</span>
                        <span>🏘️ <strong>{item.mahalle_sayisi}</strong> Mahalle</span>
                        {item.olusturan_personel && (
                          <span className="text-slate-400">• Hazırlayan: {item.olusturan_personel}</span>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      <a
                        href={`/api/export?type=signature_list&listId=${encodeURIComponent(item.id)}&donem_kodu=${encodeURIComponent(selectedSeasonView)}`}
                        download={`Edirne_SYDV_${(item.liste_adi || 'Imza_Listesi').replace(/[^a-zA-Z0-9ÇŞĞÜÖİçşğüöı_-]/g, '_')}.xlsx`}
                        className="px-3 py-1.5 rounded-xl bg-emerald-700 hover:bg-emerald-800 active:scale-95 text-white text-xs font-bold flex items-center gap-1.5 shadow-2xs transition-all"
                        title="Bu imza listesini tüm mahalleleriyle toplu Excel indir"
                      >
                        <Download className="w-3.5 h-3.5 text-white" />
                        <span>Toplu İndir (Excel)</span>
                      </a>

                      <button
                        type="button"
                        onClick={() => setRollbackModalTarget({
                          id: item.id,
                          name: item.liste_adi,
                          listeNo: item.liste_no,
                          count: item.toplam_kayit,
                          mahalleSayisi: item.mahalle_sayisi
                        })}
                        disabled={isRollingBack}
                        className="px-3 py-1.5 rounded-xl bg-white hover:bg-rose-50 text-rose-700 border border-slate-200 hover:border-rose-300 text-xs font-bold flex items-center gap-1.5 transition-all active:scale-95 disabled:opacity-50 shadow-2xs"
                        title="Bu imza listesini iptal et ve kayıtları tekrar bekleyen durumuna aktar"
                      >
                        {isRollingBack ? (
                          <Loader2 className="w-3.5 h-3.5 animate-spin text-rose-600" />
                        ) : (
                          <Undo2 className="w-3.5 h-3.5 text-rose-600" />
                        )}
                        <span>İptal Et / Geri Al</span>
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* GEÇMİŞ DÖNEM ARŞİVLENEN EXCEL LİSTELERİ VE HATA KAYITLARI SEÇİCİSİ */}
      {archivedSeasons.length > 0 && (
        <div className="p-4 rounded-2xl bg-slate-900 text-white border border-slate-800 shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="space-y-0.5">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="px-2 py-0.5 rounded bg-emerald-500/20 border border-emerald-400/40 text-emerald-300 text-[10px] font-black uppercase tracking-wider">
                Dönem Arşiv Koruması Aktif
              </span>
              <h4 className="text-xs sm:text-sm font-black text-white">
                {selectedSeasonView === 'AKTIF'
                  ? 'Aktif Dönem Excel Aktarımı (Geçmiş Dönem Listeleri ve Hataları Arşivlendi)'
                  : `📦 Arşivlenen Dönem Görünümü: ${selectedSeasonView}`}
              </h4>
            </div>
            <p className="text-[11px] text-slate-300 font-medium">
              {selectedSeasonView === 'AKTIF'
                ? 'Yeni dönem başladığında önceki döneme ait yüklenen Excel listeleri ve hatalı kayıtlar otomatik arşivlenerek bu ekran sıfırlanmıştır.'
                : 'Şu anda arşivlenmiş geçmiş bir dönemin Excel listelerini ve elenen/hatalı kayıtlarını salt okunur olarak inceliyorsunuz.'}
            </p>
          </div>

          <div className="flex items-center gap-1.5 flex-wrap shrink-0">
            <button
              type="button"
              onClick={() => setSelectedSeasonView('AKTIF')}
              className={`px-3 py-1.5 rounded-xl text-xs font-extrabold transition-all ${
                selectedSeasonView === 'AKTIF'
                  ? 'bg-emerald-500 text-white shadow-xs'
                  : 'bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700'
              }`}
            >
              🟢 Aktif Dönem (Güncel)
            </button>
            {archivedSeasons.map((sa: any) => (
              <button
                key={sa.donem_kodu}
                type="button"
                onClick={() => setSelectedSeasonView(sa.donem_kodu)}
                className={`px-3 py-1.5 rounded-xl text-xs font-extrabold transition-all ${
                  selectedSeasonView === sa.donem_kodu
                    ? 'bg-amber-500 text-white shadow-xs'
                    : 'bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700'
                }`}
                title={`${sa.baslik} — ${sa.batch_count || 0} Excel Listesi, ${sa.log_count || 0} Hata/Mükerrer Kaydı`}
              >
                📦 {sa.donem_kodu} Arşivi ({sa.batch_count || 0} Liste)
              </button>
            ))}
          </div>
        </div>
      )}

      {/* YÜKLENEN EXCEL DOSYALARI VE GERİ ALMA (DOSYA SİLME) YÖNETİMİ */}
      <div className="p-5 rounded-2xl bg-white border border-slate-200 shadow-sm space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-3 border-b border-slate-100">
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-xl bg-amber-100 text-amber-800 flex items-center justify-center border border-amber-200">
              <FolderSync className="w-5 h-5 text-amber-700" />
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h3 className="text-base font-extrabold text-slate-900 leading-tight">
                  {selectedSeasonView === 'AKTIF'
                    ? 'Yüklenen Excel Dosyaları ve Geri Alma (İptal)'
                    : `Arşivlenen Excel Dosyaları (${selectedSeasonView} Dönemi)`}
                </h3>
                {selectedSeasonView !== 'AKTIF' && (
                  <span className="px-2 py-0.5 rounded bg-amber-100 text-amber-900 border border-amber-300 text-[10px] font-black">
                    ARŞİV KAYDI
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-500 font-medium">
                {selectedSeasonView === 'AKTIF'
                  ? 'Aktif dönemde yüklenen Excel dosyalarını görüntüleyin veya yanlış yüklenen dosyaları tek tıkla geri alın'
                  : `${selectedSeasonView} döneminde yüklenmiş ve dönem kapanışında arşivlenmiş Excel listeleri`}
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={() => fetchUploadedBatches(selectedSeasonView)}
            className="self-start sm:self-auto px-3 py-1.5 rounded-xl bg-slate-50 hover:bg-slate-100 border border-slate-200 text-xs font-bold text-slate-700 flex items-center gap-1.5 transition-all active:scale-95 shadow-2xs"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isLoadingBatches ? 'animate-spin text-amber-600' : ''}`} />
            <span>Listeyi Yenile</span>
          </button>
        </div>

        {isLoadingBatches ? (
          <div className="py-6 text-center text-xs font-semibold text-slate-400">
            Yükleme geçmişi kontrol ediliyor...
          </div>
        ) : uploadedBatches.length === 0 ? (
          <div className="p-6 text-center rounded-xl bg-slate-50 border border-dashed border-slate-200 text-xs text-slate-500 space-y-1">
            <p className="font-bold text-slate-700">Henüz yeni bir Excel dosyası yüklenmedi</p>
            <p className="text-[11px] text-slate-400">
              Yukarıdan yükleyeceğiniz her Excel dosyası burada etiketlenerek saklanır; yanlış dosya seçilmesi durumunda tek tıkla tüm kayıtlarıyla birlikte geri alabilirsiniz.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {uploadedBatches.map((batch) => (
              <div
                key={batch.batch_id || batch.id}
                className="p-4 rounded-xl bg-slate-50/80 border border-slate-200 hover:border-slate-300 transition-all flex flex-col gap-3 shadow-2xs"
              >
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
                  <div className="min-w-0 space-y-1.5">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-black text-slate-900 flex items-center gap-1.5">
                        <FileSpreadsheet className="w-4 h-4 text-emerald-600 shrink-0" />
                        <span className="truncate max-w-[240px] sm:max-w-none">{batch.dosya_adi}</span>
                      </span>
                      {(batch.liste_turu === 'SIGORTALI' || batch.liste_adi === 'Sigortalılar Listesi') && (
                        <span className="text-[10px] font-black text-purple-900 bg-purple-100 px-2 py-0.5 rounded border border-purple-300 flex items-center gap-1 shrink-0">
                          <Shield className="w-3 h-3 text-purple-700" />
                          <span>Sigortalılar Listesi</span>
                        </span>
                      )}
                      {batch.liste_turu === 'EK_LISTE' && (
                        <span className="text-[10px] font-black text-amber-900 bg-amber-100 px-2 py-0.5 rounded border border-amber-300 flex items-center gap-1 shrink-0">
                          <FileSpreadsheet className="w-3 h-3 text-amber-700" />
                          <span>Ek Liste</span>
                        </span>
                      )}
                      {batch.liste_turu === 'STANDART' && (
                        <span className="text-[10px] font-bold text-sky-900 bg-sky-100 px-2 py-0.5 rounded border border-sky-300 flex items-center gap-1 shrink-0">
                          <FileText className="w-3 h-3 text-sky-700" />
                          <span>Standart Liste</span>
                        </span>
                      )}
                      <span className="text-[11px] font-semibold text-slate-700 bg-white px-2 py-0.5 rounded border border-slate-200">
                        {formatTrAuto(batch.created_at)}
                      </span>
                    </div>

                    <div className="flex items-center gap-2 flex-wrap text-xs">
                      <span className="font-extrabold text-emerald-800 bg-emerald-100/80 px-2 py-0.5 rounded-md border border-emerald-200">
                        {batch.mevcut_kisi} Hak Sahibi Sistemde
                      </span>
                      {Number(batch.elenen_kisi || 0) > 0 ? (
                        <span className="font-extrabold text-rose-800 bg-rose-100/80 px-2 py-0.5 rounded-md border border-rose-200">
                          {batch.elenen_kisi} Elenen Kayıt
                        </span>
                      ) : (
                        <span className="font-bold text-emerald-800 bg-emerald-50 px-2 py-0.5 rounded-md border border-emerald-200">
                          0 Elenen (Tümü Eklendi)
                        </span>
                      )}
                      {Number(batch.uyarili_kisi || 0) > 0 && (
                        <span className="font-bold text-amber-800 bg-amber-50 px-2 py-0.5 rounded-md border border-amber-200">
                          {batch.uyarili_kisi} Uyarılı Eklenen
                        </span>
                      )}
                      <span className="font-bold text-slate-600 bg-white px-2 py-0.5 rounded border border-slate-200">
                        {batch.bekleyen} Bekliyor
                      </span>
                      {batch.teslim_edilen > 0 ? (
                        <span className="font-bold text-amber-900 bg-amber-100 px-2 py-0.5 rounded border border-amber-300">
                          {batch.teslim_edilen} Hanesine Teslimat Yapılmış
                        </span>
                      ) : (
                        <span className="font-medium text-slate-500 bg-white px-2 py-0.5 rounded border border-slate-200">
                          Henüz teslimat yapılmadı
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-2 shrink-0 self-start sm:self-auto flex-wrap">
                    <a
                      href={`/api/export?type=batch_by_mahalle&batchId=${encodeURIComponent(batch.batch_id || batch.id)}`}
                      download={`Edirne_SYDV_${(batch.dosya_adi || 'Dosya').replace(/\.[^/.]+$/, '')}_Mahalle_Sekmeli.xlsx`}
                      className="px-3 py-1.5 rounded-xl bg-emerald-50 hover:bg-emerald-100 text-emerald-900 border border-emerald-300 font-extrabold text-xs flex items-center justify-center gap-1.5 transition-all active:scale-95 shadow-2xs"
                      title="Bu Excel dosyasındaki hak sahiplerini mahalle isimlerine göre sekmelere ayrılmış çalışma kitabı olarak indirin"
                    >
                      <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-700" />
                      <span>Mahallelere Göre İndir</span>
                    </a>
                    {Number(batch.elenen_kisi || 0) > 0 && (
                      <>
                        <button
                          type="button"
                          onClick={() => openEliminatedModal({
                            batchId: batch.batch_id || batch.id,
                            dosyaAdi: batch.dosya_adi,
                            title: `"${batch.dosya_adi}" Dosyasından Elenen Kayıtlar (${batch.elenen_kisi} Kayıt)`
                          })}
                          className="px-3 py-1.5 rounded-xl bg-amber-50 hover:bg-amber-100 text-amber-900 border border-amber-300 font-extrabold text-xs flex items-center justify-center gap-1.5 transition-all active:scale-95 shadow-2xs"
                          title="Bu dosyadan elenen kayıtları detaylı incele"
                        >
                          <Eye className="w-3.5 h-3.5 text-amber-700" />
                          <span>Elenenler ({batch.elenen_kisi})</span>
                        </button>

                        <a
                          href={`/api/export?type=errors&batchId=${encodeURIComponent(batch.batch_id || batch.id)}`}
                          download={`Edirne_SYDV_Elenen_Kayitlar_${batch.batch_id || batch.id}.xlsx`}
                          className="px-2.5 py-1.5 rounded-xl bg-white hover:bg-slate-100 text-slate-700 border border-slate-200 text-xs font-bold flex items-center justify-center gap-1 transition-all shadow-2xs"
                          title="Bu dosyanın elenen kayıtlarını Excel indir"
                        >
                          <Download className="w-3.5 h-3.5 text-emerald-700" />
                        </a>
                      </>
                    )}

                    {selectedSeasonView === 'AKTIF' && (
                      <button
                        type="button"
                        onClick={() => {
                          setBatchDeleteTarget(batch);
                          setDeleteDeliveredChoice(false);
                        }}
                        className="px-3 py-1.5 rounded-xl bg-white hover:bg-rose-50 text-rose-700 hover:text-rose-800 border border-rose-200 font-bold text-xs flex items-center justify-center gap-1.5 transition-all active:scale-95 shadow-2xs"
                      >
                        <Trash2 className="w-3.5 h-3.5 text-rose-600" />
                        <span>Geri Al</span>
                      </button>
                    )}
                  </div>
                </div>

                {/* Mahalle ve Köy Dağılımı (Gruplanmış) */}
                {batch.mahalle_ozet && batch.mahalle_ozet.length > 0 && (() => {
                  const bMahalles = batch.mahalle_ozet.filter((mo: any) => !isKoySettlement(mo.mahalle, mo.tip));
                  const bKoys = batch.mahalle_ozet.filter((mo: any) => isKoySettlement(mo.mahalle, mo.tip));

                  return (
                    <div className="pt-2 border-t border-slate-200/80 space-y-2">
                      <div className="flex items-center justify-between text-[11px] font-extrabold text-slate-700">
                        <span className="flex items-center gap-1 text-slate-800">
                          <MapPin className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                          <span>Yerleşim Yerlerine Göre Dağılım ({batch.mahalle_ozet.length}):</span>
                        </span>
                        <div className="flex items-center gap-2 text-[10px] font-bold">
                          <span className="text-sky-800">{bMahalles.length} Mahalle</span>
                          <span>•</span>
                          <span className="text-emerald-800">{bKoys.length} Köy</span>
                        </div>
                      </div>

                      {/* Şehir Mahalleleri */}
                      {bMahalles.length > 0 && (
                        <div className="space-y-1">
                          <div className="flex items-center gap-1 text-[10px] font-bold text-sky-800 bg-sky-50 px-2 py-0.5 rounded border border-sky-200">
                            <Building2 className="w-3 h-3 text-sky-700 shrink-0" />
                            <span>🏙️ Şehir Mahalleleri ({bMahalles.length})</span>
                          </div>
                          <div className="grid grid-cols-2 gap-1.5 max-h-48 overflow-y-auto pr-1">
                            {bMahalles.map((mo: any, moIdx: number) => (
                              <div
                                key={`b_mah_${moIdx}`}
                                className="p-1.5 px-2.5 rounded-lg bg-white border border-slate-200 text-[11px] flex items-center justify-between gap-1 shadow-2xs hover:border-sky-300 transition-colors"
                              >
                                <strong className="text-slate-900 truncate" title={mo.mahalle}>
                                  {mo.mahalle}:
                                </strong>
                                <div className="flex items-center gap-1 shrink-0 text-[10px]">
                                  <span className="text-amber-800 font-extrabold">{mo.ek_liste_adi}</span>
                                  <span className="text-sky-700 font-mono font-bold bg-sky-50 px-1 py-0.5 rounded border border-sky-100">
                                    ({mo.sira_araligi})
                                  </span>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Köy Yerleşimleri */}
                      {bKoys.length > 0 && (
                        <div className="space-y-1">
                          <div className="flex items-center gap-1 text-[10px] font-bold text-emerald-800 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                            <Trees className="w-3 h-3 text-emerald-700 shrink-0" />
                            <span>🌲 Köy Yerleşimleri ({bKoys.length})</span>
                          </div>
                          <div className="grid grid-cols-2 gap-1.5 max-h-48 overflow-y-auto pr-1">
                            {bKoys.map((mo: any, moIdx: number) => (
                              <div
                                key={`b_koy_${moIdx}`}
                                className="p-1.5 px-2.5 rounded-lg bg-white border border-slate-200 text-[11px] flex items-center justify-between gap-1 shadow-2xs hover:border-emerald-300 transition-colors"
                              >
                                <strong className="text-slate-900 truncate" title={mo.mahalle}>
                                  {mo.mahalle}:
                                </strong>
                                <div className="flex items-center gap-1 shrink-0 text-[10px]">
                                  <span className="text-amber-800 font-extrabold">{mo.ek_liste_adi}</span>
                                  <span className="text-emerald-700 font-mono font-bold bg-emerald-50 px-1 py-0.5 rounded border border-emerald-100">
                                    ({mo.sira_araligi})
                                  </span>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })()}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>

      {/* YÜKLEME SONUÇLARI VE SORUNLU KAYITLAR - AKORDİYON MENÜ */}
      <div className="rounded-2xl border border-slate-200 bg-white shadow-xs overflow-hidden">
        {/* Master Accordion Başlığı (Varsayılan olarak KAPALI gelir) */}
        <div 
          onClick={() => setIsLogsSectionOpen(!isLogsSectionOpen)}
          className="p-4 sm:p-5 flex items-center justify-between cursor-pointer hover:bg-slate-50/80 transition-colors select-none"
        >
          <div className="flex items-center gap-3 min-w-0">
            <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 transition-colors ${
              computedLogStats.toplamHata > 0 
                ? 'bg-amber-50 text-amber-700 border border-amber-200' 
                : 'bg-emerald-50 text-emerald-700 border border-emerald-200'
            }`}>
              <AlertTriangle className="w-5 h-5 text-amber-600" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h3 className="text-base font-extrabold text-slate-900 truncate">
                  Eklenmeyen & Hatalı / Mükerrer Kayıtlar
                </h3>
                <span className={`text-xs px-2.5 py-0.5 rounded-full font-black shrink-0 ${
                  computedLogStats.toplamElenen > 0
                    ? 'bg-rose-100 text-rose-800 border border-rose-200'
                    : 'bg-emerald-100 text-emerald-800 border border-emerald-200'
                }`}>
                  {computedLogStats.toplamElenen} Elenen Kayıt
                </span>
                {computedLogStats.uyariliEklenen > 0 && (
                  <span className="text-[11px] px-2 py-0.5 rounded-full bg-amber-50 text-amber-800 font-bold border border-amber-200 shrink-0">
                    {computedLogStats.uyariliEklenen} Uyarılı Eklenen
                  </span>
                )}
                {logsByBatch.length > 0 && (
                  <span className="text-[11px] px-2 py-0.5 rounded-full bg-slate-100 text-slate-700 font-bold border border-slate-200 shrink-0">
                    {logsByBatch.length} Excel Listesi
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-500 font-medium truncate mt-0.5">
                Sisteme eklenmeyen mükerrer kayıtlar ve uyarılı eklenenler (Tıklayarak {isLogsSectionOpen ? 'kapatın' : 'genişletin'})
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0 ml-3">
            {logs.length > 0 && (
              <>
                <a
                  href="/api/export?type=errors"
                  download="Edirne_SYDV_Komur_Yukleme_Hatalari_Raporu.xlsx"
                  onClick={(e) => e.stopPropagation()}
                  className="p-2 sm:px-3 sm:py-1.5 rounded-xl bg-white hover:bg-slate-100 text-amber-800 border border-slate-200 shadow-2xs flex items-center gap-1.5 text-xs font-bold transition-all"
                  title="Tüm Hata Raporunu Excel İndir"
                >
                  <Download className="w-4 h-4 text-emerald-700" />
                  <span className="hidden md:inline">Tümünü İndir</span>
                </a>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleClearLogs();
                  }}
                  className="p-2 rounded-xl bg-white hover:bg-rose-50 text-slate-400 hover:text-rose-600 border border-slate-200 shadow-2xs transition-all"
                  title="Hata Kayıtlarını Temizle"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </>
            )}
            <div className={`w-8 h-8 rounded-lg bg-slate-100 flex items-center justify-center text-slate-600 transition-transform duration-200 ${
              isLogsSectionOpen ? 'rotate-180 bg-slate-200 text-slate-900' : ''
            }`}>
              <ChevronDown className="w-5 h-5" />
            </div>
          </div>
        </div>

        {/* Master Accordion İçeriği (Aşağı doğru açılan kısım) */}
        {isLogsSectionOpen && (
          <div className="p-4 sm:p-5 pt-2 border-t border-slate-200/80 bg-slate-50/40 space-y-4">
            {/* Toplam Özet İstatistik Kartları */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              <div className="p-3 rounded-xl bg-white border border-rose-200 shadow-2xs">
                <span className="text-[10px] uppercase font-bold block text-rose-600">Toplam Elenen</span>
                <span className="text-lg sm:text-xl font-black text-rose-800">{computedLogStats.toplamElenen || 0}</span>
                <span className="text-[9px] text-slate-400 block font-medium">Sisteme Eklenmeyen</span>
              </div>
              <div className="p-3 rounded-xl bg-white border border-amber-200 shadow-2xs">
                <span className="text-[10px] uppercase font-bold block text-amber-600">Mükerrer TC (Elenen)</span>
                <span className="text-lg sm:text-xl font-black text-amber-800">{computedLogStats.mukerrerTc || 0}</span>
                <span className="text-[9px] text-slate-400 block font-medium">Aynı TC'li Kayıt</span>
              </div>
              <div className="p-3 rounded-xl bg-white border border-purple-200 shadow-2xs">
                <span className="text-[10px] uppercase font-bold block text-purple-600">Mükerrer Hane (Elenen)</span>
                <span className="text-lg sm:text-xl font-black text-purple-800">{computedLogStats.mukerrerHane || 0}</span>
                <span className="text-[9px] text-slate-400 block font-medium">Aynı Haneli Kayıt</span>
              </div>
              <div className="p-3 rounded-xl bg-white border border-emerald-200 shadow-2xs">
                <span className="text-[10px] uppercase font-bold block text-emerald-700">Uyarılı Eklenen</span>
                <span className="text-lg sm:text-xl font-black text-emerald-800">{computedLogStats.uyariliEklenen || 0}</span>
                <span className="text-[9px] text-slate-400 block font-medium">Eksik Bilgiyle Eklenen</span>
              </div>
            </div>

            {/* Listeler Araç Çubuğu */}
            <div className="flex items-center justify-between text-xs font-semibold text-slate-600 pt-1">
              <span className="flex items-center gap-1.5 text-slate-800 font-bold">
                <FileSpreadsheet className="w-4 h-4 text-emerald-700" />
                <span>Yüklenen Excel Listeleri ({logsByBatch.length})</span>
              </span>
              {logsByBatch.length > 0 && (
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => toggleAllBatches(true, logsByBatch.map((b) => b.batchId))}
                    className="text-[11px] font-bold text-amber-800 hover:text-amber-900 hover:underline cursor-pointer"
                  >
                    Tüm Listeleri Aç
                  </button>
                  <span className="text-slate-300">•</span>
                  <button
                    type="button"
                    onClick={() => toggleAllBatches(false, [])}
                    className="text-[11px] font-bold text-slate-500 hover:text-slate-800 hover:underline cursor-pointer"
                  >
                    Tümünü Kapat
                  </button>
                </div>
              )}
            </div>

            {/* Listeler ve Her Listenin Kendi Akordiyonu */}
            {isLoadingLogs && logs.length === 0 ? (
              <div className="p-8 text-center text-slate-500 text-xs font-semibold bg-white rounded-xl border border-slate-200">
                Kayıtlar yükleniyor...
              </div>
            ) : logsByBatch.length === 0 ? (
              <div className="p-8 text-center bg-white rounded-xl border border-slate-200 text-slate-500 text-xs font-medium shadow-2xs">
                Sistemde kayıtlı herhangi bir hatalı, mükerrer veya elenen kayıt bulunmuyor.
              </div>
            ) : (
              <div className="space-y-3">
                {logsByBatch.map((batch) => {
                  const isExpanded = expandedBatchIds.has(batch.batchId);
                  const currentStatus = batchStatusFilter[batch.batchId] || 'HEPSI';
                  const currentSearch = (batchSearchTerm[batch.batchId] || '').trim();

                  const batchFilteredLogs = batch.logs.filter((item: any) => {
                    if (currentStatus === 'ELENEN' && !isRecordElenen(item)) {
                      return false;
                    }
                    if (currentStatus === 'UYARILI_EKLENEN' && isRecordElenen(item)) {
                      return false;
                    }
                    if (currentStatus === 'MUKERRER_TC' && item.durum !== 'MUKERRER_TC') {
                      return false;
                    }
                    if (currentStatus === 'MUKERRER_HANE' && item.durum !== 'MUKERRER_HANE') {
                      return false;
                    }
                    if (currentSearch) {
                      if (isBirebirBeneficiaryMatch(item, currentSearch)) return true;
                      if (
                        (item.cakisan_tc || item.cakisan_ad_soyad) &&
                        isBirebirBeneficiaryMatch({ tc_no: item.cakisan_tc, ad_soyad: item.cakisan_ad_soyad }, currentSearch)
                      ) {
                        return true;
                      }
                      return false;
                    }
                    return true;
                  });

                  return (
                    <div
                      key={batch.batchId}
                      className="rounded-xl border border-slate-200 bg-white shadow-2xs overflow-hidden transition-all"
                    >
                      {/* Listenin Akordiyon Başlığı */}
                      <div
                        onClick={() => toggleBatchAccordion(batch.batchId)}
                        className={`p-3.5 sm:p-4 flex flex-col md:flex-row md:items-center justify-between gap-3 cursor-pointer transition-colors select-none ${
                          isExpanded ? 'bg-amber-50/30 border-b border-slate-200' : 'hover:bg-slate-50'
                        }`}
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          <div className="p-1.5 rounded-lg bg-emerald-50 text-emerald-800 border border-emerald-200 shrink-0">
                            <FileSpreadsheet className="w-4 h-4 text-emerald-700" />
                          </div>
                          <div className="min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <h4 className="text-sm font-extrabold text-slate-900 truncate">
                                {batch.dosyaAdi}
                              </h4>
                              {batch.createdAt && (
                                <span className="text-[11px] text-slate-500 font-medium">
                                  • {formatTrAuto(batch.createdAt)}
                                </span>
                              )}
                            </div>
                            <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                              {batch.stats.elenenSayisi > 0 ? (
                                <span className="text-[11px] font-black text-rose-700 bg-rose-50 border border-rose-200 px-2 py-0.5 rounded-md">
                                  {batch.stats.elenenSayisi} Elenen Kayıt
                                </span>
                              ) : (
                                <span className="text-[11px] font-bold text-emerald-800 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-md">
                                  0 Elenen (Tüm Kayıtlar Eklendi)
                                </span>
                              )}
                              {batch.stats.mukerrerTc > 0 && (
                                <span className="text-[11px] font-bold text-amber-800 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded-md">
                                  {batch.stats.mukerrerTc} Mükerrer TC
                                </span>
                              )}
                              {batch.stats.mukerrerHane > 0 && (
                                <span className="text-[11px] font-bold text-purple-800 bg-purple-50 border border-purple-200 px-2 py-0.5 rounded-md">
                                  {batch.stats.mukerrerHane} Mükerrer Hane
                                </span>
                              )}
                              {batch.stats.uyariliEklenen > 0 && (
                                <span className="text-[11px] font-bold text-sky-800 bg-sky-50 border border-sky-200 px-2 py-0.5 rounded-md">
                                  {batch.stats.uyariliEklenen} Uyarılı Eklenen
                                </span>
                              )}
                            </div>
                          </div>
                        </div>

                        <div className="flex items-center justify-end gap-2 shrink-0">
                          <a
                            href={`/api/export?type=errors&batchId=${encodeURIComponent(batch.batchId)}`}
                            download={`${batch.dosyaAdi}_Hata_Raporu.xlsx`}
                            onClick={(e) => e.stopPropagation()}
                            className="p-1.5 px-2.5 rounded-lg bg-white hover:bg-slate-100 text-emerald-800 border border-slate-200 text-xs font-bold flex items-center gap-1.5 shadow-2xs transition-colors"
                            title="Bu Listenin Hatalı Kayıtlarını Excel Olarak İndir"
                          >
                            <Download className="w-3.5 h-3.5 text-emerald-700" />
                            <span>Excel İndir</span>
                          </a>

                          <div className={`w-7 h-7 rounded-lg bg-slate-100 flex items-center justify-center text-slate-500 transition-transform duration-200 ${
                            isExpanded ? 'rotate-180 bg-slate-200 text-slate-900' : ''
                          }`}>
                            <ChevronDown className="w-4 h-4" />
                          </div>
                        </div>
                      </div>

                      {/* Listenin Açılan İçeriği: Durum Seçenekleri, Arama ve Kayıt Listesi */}
                      {isExpanded && (
                        <div className="p-3.5 sm:p-4 space-y-3 bg-slate-50/50">
                          {/* Durum Seçenekleri Butonları */}
                          <div className="grid grid-cols-2 sm:grid-cols-5 gap-1.5">
                            <button
                              type="button"
                              onClick={() => setBatchStatusFilter((prev) => ({ ...prev, [batch.batchId]: 'HEPSI' }))}
                              className={`p-2 rounded-lg border text-left transition-all ${
                                currentStatus === 'HEPSI'
                                  ? 'bg-slate-800 border-slate-900 text-white shadow-xs'
                                  : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-100'
                              }`}
                            >
                              <span className={`text-[10px] uppercase font-bold block ${currentStatus === 'HEPSI' ? 'text-slate-300' : 'text-slate-500'}`}>
                                Tüm Kayıtlar
                              </span>
                              <span className="text-base font-black">{batch.stats.total}</span>
                            </button>

                            <button
                              type="button"
                              onClick={() => setBatchStatusFilter((prev) => ({
                                ...prev,
                                [batch.batchId]: currentStatus === 'ELENEN' ? 'HEPSI' : 'ELENEN'
                              }))}
                              className={`p-2 rounded-lg border text-left transition-all ${
                                currentStatus === 'ELENEN'
                                  ? 'bg-rose-700 border-rose-800 text-white shadow-xs'
                                  : 'bg-white border-slate-200 text-slate-700 hover:bg-rose-50'
                              }`}
                            >
                              <span className={`text-[10px] uppercase font-bold block ${currentStatus === 'ELENEN' ? 'text-rose-100' : 'text-slate-500'}`}>
                                Elenenler
                              </span>
                              <span className={`text-base font-black ${currentStatus === 'ELENEN' ? 'text-white' : 'text-rose-700'}`}>
                                {batch.stats.elenenSayisi}
                              </span>
                            </button>

                            <button
                              type="button"
                              onClick={() => setBatchStatusFilter((prev) => ({
                                ...prev,
                                [batch.batchId]: currentStatus === 'MUKERRER_TC' ? 'HEPSI' : 'MUKERRER_TC'
                              }))}
                              className={`p-2 rounded-lg border text-left transition-all ${
                                currentStatus === 'MUKERRER_TC'
                                  ? 'bg-amber-600 border-amber-700 text-white shadow-xs'
                                  : 'bg-white border-slate-200 text-slate-700 hover:bg-amber-50'
                              }`}
                            >
                              <span className={`text-[10px] uppercase font-bold block ${currentStatus === 'MUKERRER_TC' ? 'text-amber-100' : 'text-slate-500'}`}>
                                Mükerrer TC
                              </span>
                              <span className={`text-base font-black ${currentStatus === 'MUKERRER_TC' ? 'text-white' : 'text-amber-800'}`}>
                                {batch.stats.mukerrerTc}
                              </span>
                            </button>

                            <button
                              type="button"
                              onClick={() => setBatchStatusFilter((prev) => ({
                                ...prev,
                                [batch.batchId]: currentStatus === 'MUKERRER_HANE' ? 'HEPSI' : 'MUKERRER_HANE'
                              }))}
                              className={`p-2 rounded-lg border text-left transition-all ${
                                currentStatus === 'MUKERRER_HANE'
                                  ? 'bg-purple-700 border-purple-800 text-white shadow-xs'
                                  : 'bg-white border-slate-200 text-slate-700 hover:bg-purple-50'
                              }`}
                            >
                              <span className={`text-[10px] uppercase font-bold block ${currentStatus === 'MUKERRER_HANE' ? 'text-purple-200' : 'text-slate-500'}`}>
                                Mükerrer Hane
                              </span>
                              <span className={`text-base font-black ${currentStatus === 'MUKERRER_HANE' ? 'text-white' : 'text-purple-800'}`}>
                                {batch.stats.mukerrerHane}
                              </span>
                            </button>

                            <button
                              type="button"
                              onClick={() => setBatchStatusFilter((prev) => ({
                                ...prev,
                                [batch.batchId]: currentStatus === 'UYARILI_EKLENEN' ? 'HEPSI' : 'UYARILI_EKLENEN'
                              }))}
                              className={`p-2 rounded-lg border text-left transition-all ${
                                currentStatus === 'UYARILI_EKLENEN'
                                  ? 'bg-sky-700 border-sky-800 text-white shadow-xs'
                                  : 'bg-white border-slate-200 text-slate-700 hover:bg-sky-50'
                              }`}
                            >
                              <span className={`text-[10px] uppercase font-bold block ${currentStatus === 'UYARILI_EKLENEN' ? 'text-sky-100' : 'text-slate-500'}`}>
                                Uyarılı Eklenen
                              </span>
                              <span className={`text-base font-black ${currentStatus === 'UYARILI_EKLENEN' ? 'text-white' : 'text-sky-700'}`}>
                                {batch.stats.uyariliEklenen}
                              </span>
                            </button>
                          </div>

                          {/* Bu Listede Arama Kutusu */}
                          <div className="relative">
                            <Search className="w-4 h-4 absolute left-3 top-2.5 text-slate-400" />
                            <input
                              type="text"
                              value={batchSearchTerm[batch.batchId] || ''}
                              onChange={(e) => setBatchSearchTerm((prev) => ({ ...prev, [batch.batchId]: e.target.value }))}
                              placeholder={`"${batch.dosyaAdi}" listesinde ad, soyad veya TC kimlik no ile ara...`}
                              className="w-full pl-9 pr-3 py-2 rounded-lg bg-white border border-slate-300 text-slate-900 placeholder-slate-400 text-xs focus:outline-none focus:border-amber-500 font-medium shadow-2xs"
                            />
                            {batchSearchTerm[batch.batchId] && (
                              <button
                                type="button"
                                onClick={() => setBatchSearchTerm((prev) => ({ ...prev, [batch.batchId]: '' }))}
                                className="absolute right-2.5 top-2.5 text-slate-400 hover:text-slate-700 cursor-pointer"
                              >
                                <X className="w-4 h-4" />
                              </button>
                            )}
                          </div>

                          {/* Kayıt Listesi */}
                          {batchFilteredLogs.length === 0 ? (
                            <div className="p-6 text-center bg-white rounded-lg border border-slate-200 text-slate-500 text-xs font-medium shadow-2xs">
                              Bu filtreye veya aramaya uygun kayıt bulunamadı.
                            </div>
                          ) : (
                            <div className="space-y-2 max-h-[500px] overflow-y-auto pr-1">
                              {batchFilteredLogs.map((item: any) => (
                                <div
                                  key={item.id || item._id}
                                  className="p-3.5 rounded-lg bg-white border border-slate-200 hover:border-slate-300 transition-all space-y-2 shadow-2xs"
                                >
                                  <div className="flex items-start justify-between gap-2">
                                    <div>
                                      <h5 className="text-sm font-extrabold text-slate-900">{item.ad_soyad}</h5>
                                      <div className="flex items-center gap-2 text-xs text-slate-500 mt-0.5 flex-wrap">
                                        <span className="font-mono font-bold text-amber-800">TC: {item.tc_no}</span>
                                        {item.tc_no && item.tc_no.length === 11 && (
                                          <button
                                            type="button"
                                            onClick={() => copyToClipboard(item.tc_no)}
                                            className="text-slate-400 hover:text-slate-700 p-0.5 rounded transition-colors cursor-pointer"
                                            title="TC Kopyala"
                                          >
                                            {copiedTc === item.tc_no ? (
                                              <Check className="w-3.5 h-3.5 text-emerald-600 inline" />
                                            ) : (
                                              <Copy className="w-3.5 h-3.5 inline" />
                                            )}
                                          </button>
                                        )}
                                        {item.hane_no && <span className="font-bold text-indigo-700">• Hane No: {item.hane_no}</span>}
                                        {item.telefon && item.telefon !== 'Eksik' && (
                                          <span className="text-slate-600 font-semibold">• Tel: {item.telefon}</span>
                                        )}
                                        {item.satir_no && <span className="font-mono text-slate-400">• Satır #{item.satir_no}</span>}
                                      </div>
                                    </div>

                                    <div className="flex items-center gap-1.5 shrink-0">
                                      <span
                                        className={`badge text-[10px] py-0.5 px-2 ${
                                          item.durum === 'MUKERRER_TC'
                                            ? 'badge-pending'
                                            : item.durum === 'MUKERRER_HANE'
                                            ? 'badge-household'
                                            : 'badge-cancelled'
                                        }`}
                                      >
                                        {item.durum === 'MUKERRER_TC'
                                          ? 'Mükerrer TC'
                                          : item.durum === 'MUKERRER_HANE'
                                          ? 'Mükerrer Hane'
                                          : 'Eksik / Uyarılı'}
                                      </span>

                                      {isRecordElenen(item) ? (
                                        <span className="text-[9px] px-2 py-0.5 rounded bg-rose-50 border border-rose-200 text-rose-700 font-black">
                                          Sisteme Eklenmedi (Elendi)
                                        </span>
                                      ) : (
                                        <span className="text-[9px] px-2 py-0.5 rounded bg-emerald-50 border border-emerald-200 text-emerald-800 font-black">
                                          Sisteme Eklendi (Uyarılı)
                                        </span>
                                      )}
                                    </div>
                                  </div>

                                  {/* Kömür Teslim Durumu Rozeti & Özeti */}
                                  {item.teslimat_durumu_ozeti ? (
                                    <div className="flex items-center gap-2 p-2 rounded-lg bg-slate-50 border border-slate-200 text-xs font-bold text-slate-800">
                                      <PackageCheck className="w-4 h-4 text-amber-600 shrink-0" />
                                      <span className="text-slate-600">Kömür Teslim Durumu:</span>
                                      <span className={`font-black ${
                                        item.teslimat_durumu === 'TAMAMLANDI' ? 'text-emerald-700' :
                                        item.teslimat_durumu === 'EKSIK' ? 'text-amber-700' :
                                        item.teslimat_durumu === 'IPTAL' ? 'text-rose-700' : 'text-slate-800'
                                      }`}>
                                        {item.teslimat_durumu_ozeti}
                                      </span>
                                    </div>
                                  ) : item.teslimat_durumu ? (
                                    <div className="flex items-center gap-2 p-2 rounded-lg bg-slate-50 border border-slate-200 text-xs font-bold text-slate-800">
                                      <PackageCheck className="w-4 h-4 text-amber-600 shrink-0" />
                                      <span className="text-slate-600">Kömür Teslim Durumu:</span>
                                      <span className="text-slate-900 font-extrabold">
                                        {item.teslimat_durumu} ({item.torba_sayisi || 0} Torba)
                                      </span>
                                    </div>
                                  ) : null}

                                  {/* Hata Sebebi */}
                                  <div className="p-2.5 rounded-lg bg-amber-50/80 border border-amber-200 text-xs text-amber-950 font-semibold leading-relaxed">
                                    {item.hata_nedeni}
                                  </div>

                                  {/* Adres Bilgisi */}
                                  {(item.mahalle || item.acik_adres) && (
                                    <p className="text-[11px] text-slate-500 truncate font-medium">
                                      {item.mahalle} - {item.acik_adres}
                                    </p>
                                  )}
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>

      {/* ISLAK İMZA LİSTESİ İPTAL & GERİ ALMA GÜVENLİK MODALI */}
      {rollbackModalTarget && (
        <div
          className="modal-overlay"
          onClick={() => !isRollingBackListId && setRollbackModalTarget(null)}
        >
          <div className="modal-sheet max-w-lg" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between pb-3 border-b border-slate-200 mb-4">
              <div className="flex items-center gap-2.5">
                <div className="w-10 h-10 rounded-2xl bg-rose-100 text-rose-700 flex items-center justify-center border border-rose-200 shrink-0">
                  <Undo2 className="w-5 h-5 text-rose-600" />
                </div>
                <div>
                  <h3 className="text-base font-extrabold text-slate-900 leading-tight">
                    {rollbackModalTarget.isAll
                      ? 'Tüm Islak İmza Listelerini Sıfırla'
                      : 'Islak İmza Listesini İptal Et / Geri Al'}
                  </h3>
                  <p className="text-xs text-slate-500 font-medium">Hatalı veya erken çıktı alma önlemi</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => !isRollingBackListId && setRollbackModalTarget(null)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-all"
                title="Kapat"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-4 text-xs">
              <div className="p-3.5 rounded-xl bg-amber-50 border border-amber-200 text-amber-950 space-y-2">
                <div className="flex items-center gap-2 font-black text-amber-900">
                  <AlertTriangle className="w-4 h-4 text-amber-700 shrink-0" />
                  <span>
                    {rollbackModalTarget.isAll
                      ? 'Tüm listeler iptal edilecek'
                      : `"${rollbackModalTarget.name}" iptal edilecek`}
                  </span>
                </div>
                <p className="text-xs leading-relaxed text-amber-900">
                  Bu işlem, imza listesi çıktısı yanlışlıkla alındığında veya sisteme henüz eklenmesi gereken başka kayıtlar varken erken liste çıkarıldığında hataları önlemek için tasarlanmıştır.
                </p>
              </div>

              {/* İptal Edilecek Kapsam Detayı */}
              <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 space-y-2">
                <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider block">İptal Edilecek Liste Kapsamı</span>
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div className="p-2 rounded-lg bg-white border border-slate-200">
                    <span className="text-slate-400 block text-[10px]">Liste Adı / No:</span>
                    <strong className="text-slate-900 font-bold">{rollbackModalTarget.name}</strong>
                  </div>
                  <div className="p-2 rounded-lg bg-white border border-slate-200">
                    <span className="text-slate-400 block text-[10px]">Etkilenecek Hane:</span>
                    <strong className="text-indigo-700 font-black">{rollbackModalTarget.count || 0} Hane</strong>
                  </div>
                </div>
              </div>

              {/* Güvenlik Güvenceleri */}
              <div className="space-y-2 p-3 rounded-xl bg-emerald-50/70 border border-emerald-200 text-emerald-950">
                <span className="font-extrabold text-[11px] text-emerald-900 flex items-center gap-1.5">
                  <Shield className="w-3.5 h-3.5 text-emerald-700" />
                  <span>Veri Güvenliği ve Süreç Güvencesi:</span>
                </span>
                <ul className="space-y-1 text-[11px] text-emerald-900 list-disc list-inside">
                  <li><strong>Kayıt Kaybı Olmaz:</strong> Vatandaş ve hane bilgileri sistemden kesinlikle silinmez.</li>
                  <li><strong>Bekleyen Havuzuna İade:</strong> İlgili {rollbackModalTarget.count || 0} hane tekrar <em>"İmza Listesi Bekleyenler"</em> havuzuna aktarılır.</li>
                  <li><strong>Yeniden Çıkarılabilir:</strong> Yeni Excel yüklemelerinizi yaptıktan sonra dilediğiniz an tek tıkla yeniden güncel imza listesi oluşturabilirsiniz.</li>
                </ul>
              </div>

              {/* Eylem Butonları */}
              <div className="pt-3 border-t border-slate-200 flex items-center justify-end gap-2.5">
                <button
                  type="button"
                  onClick={() => setRollbackModalTarget(null)}
                  disabled={Boolean(isRollingBackListId)}
                  className="px-4 py-2.5 rounded-xl border border-slate-300 text-slate-700 hover:bg-slate-100 font-bold transition-all disabled:opacity-50"
                >
                  Vazgeç
                </button>
                <button
                  type="button"
                  onClick={() => executeRollback(rollbackModalTarget)}
                  disabled={Boolean(isRollingBackListId)}
                  className="px-4 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-700 active:scale-95 text-white font-black flex items-center gap-2 shadow-sm transition-all disabled:opacity-50"
                >
                  {isRollingBackListId ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin text-white" />
                      <span>İptal Ediliyor...</span>
                    </>
                  ) : (
                    <>
                      <Undo2 className="w-4 h-4 text-white" />
                      <span>{rollbackModalTarget.isAll ? 'Tümünü Sıfırla ve Geri Al' : 'Evet, Bu Listeyi İptal Et ve Geri Al'}</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* EXCEL DOSYASI VE KAYITLARI SİLME (ROLLBACK) ONAY MODALI */}
      {batchDeleteTarget && (
        <div className="modal-overlay" onClick={() => !isDeletingBatch && setBatchDeleteTarget(null)}>
          <div className="modal-sheet max-w-md" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between pb-3 border-b border-slate-200 mb-4">
              <div className="flex items-center gap-2">
                <div className="w-9 h-9 rounded-xl bg-rose-100 text-rose-700 flex items-center justify-center border border-rose-200 shrink-0">
                  <Trash2 className="w-5 h-5 text-rose-600" />
                </div>
                <div>
                  <h3 className="text-base font-extrabold text-slate-900 leading-tight">
                    Excel Dosyasını Geri Al (Kayıtları Sil)
                  </h3>
                  <p className="text-xs text-slate-500 font-medium">Hatalı yükleme geri alma işlemi</p>
                </div>
              </div>
              <button
                onClick={() => setBatchDeleteTarget(null)}
                disabled={isDeletingBatch}
                className="text-slate-400 hover:text-slate-700 p-1 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-3">
              <div className="p-3.5 rounded-xl bg-rose-50/80 border border-rose-200 text-xs text-rose-900 space-y-1.5">
                <div className="font-black text-rose-950 flex items-center gap-1.5">
                  <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
                  <span>Silinecek Dosya: {batchDeleteTarget.dosya_adi}</span>
                </div>
                <p className="text-slate-600 leading-relaxed">
                  Bu dosyadan sisteme yüklenmiş olan <strong>{batchDeleteTarget.mevcut_kisi} hak sahibi kaydı</strong> veritabanından tamamen silinecektir.
                </p>
              </div>

              {batchDeleteTarget.teslim_edilen > 0 ? (
                <div className="p-3.5 rounded-xl bg-amber-50 border border-amber-300 text-xs text-amber-950 space-y-2">
                  <div className="font-extrabold flex items-center gap-1 text-amber-900">
                    <span>⚠️ Teslimat Uyarısı:</span>
                  </div>
                  <p className="leading-relaxed">
                    Bu Excel dosyasından eklenen hanelerden <strong>{batchDeleteTarget.teslim_edilen} tanesine</strong> fiilen kömür teslimatı yapılmış görünüyor!
                  </p>

                  <div className="space-y-1.5 pt-1">
                    <label className="flex items-start gap-2 p-2 rounded-lg bg-white border border-amber-200 cursor-pointer">
                      <input
                        type="radio"
                        name="deleteMode"
                        checked={!deleteDeliveredChoice}
                        onChange={() => setDeleteDeliveredChoice(false)}
                        className="mt-0.5 text-amber-600 focus:ring-amber-500 cursor-pointer"
                      />
                      <div className="text-xs">
                        <strong className="block text-slate-900 font-bold">Yalnızca Teslim Edilmeyenleri Sil (Önerilen)</strong>
                        <span className="text-slate-500 text-[11px]">
                          Kömür teslimatı yapılmış {batchDeleteTarget.teslim_edilen} hane korunur, yalnızca bekleyen {batchDeleteTarget.bekleyen} hane silinir.
                        </span>
                      </div>
                    </label>

                    <label className="flex items-start gap-2 p-2 rounded-lg bg-white border border-rose-200 cursor-pointer">
                      <input
                        type="radio"
                        name="deleteMode"
                        checked={deleteDeliveredChoice}
                        onChange={() => setDeleteDeliveredChoice(true)}
                        className="mt-0.5 text-rose-600 focus:ring-rose-500 cursor-pointer"
                      />
                      <div className="text-xs">
                        <strong className="block text-rose-900 font-bold">Teslim Edilenler Dahil Dosyadaki Tümünü Sil</strong>
                        <span className="text-slate-500 text-[11px]">
                          Dosyadaki tüm {batchDeleteTarget.mevcut_kisi} hane veritabanından tamamen kaldırılır.
                        </span>
                      </div>
                    </label>
                  </div>
                </div>
              ) : (
                <div className="p-3 rounded-xl bg-slate-50 border border-slate-200 text-xs text-slate-600 flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                  <span>Bu dosyaya ait hanelere henüz hiçbir kömür teslimatı yapılmamıştır. Güvenle geri alabilirsiniz.</span>
                </div>
              )}

              <div className="pt-2 border-t border-slate-200 flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setBatchDeleteTarget(null)}
                  disabled={isDeletingBatch}
                  className="btn-secondary flex-1 py-2.5 text-xs font-bold"
                >
                  Vazgeç
                </button>
                <button
                  type="button"
                  disabled={isDeletingBatch}
                  onClick={() => handleDeleteBatch(batchDeleteTarget.batch_id || batchDeleteTarget.id, deleteDeliveredChoice)}
                  className="flex-1 py-2.5 px-3 rounded-xl bg-rose-600 hover:bg-rose-700 text-white font-extrabold text-xs shadow-sm transition-all active:scale-95 flex items-center justify-center gap-1.5 disabled:opacity-50"
                >
                  {isDeletingBatch ? (
                    <>
                      <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                      <span>Siliniyor...</span>
                    </>
                  ) : (
                    <>
                      <Trash2 className="w-4 h-4 text-white" />
                      <span>Kayıtları Sistemden Sil</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ELENEN VE MÜKERRER KAYITLAR DETAYLI İNCELEME MODALI */}
      {eliminatedModalBatch && (
        <div className="modal-overlay" onClick={() => setEliminatedModalBatch(null)}>
          <div 
            className="modal-sheet max-w-4xl max-h-[90vh] flex flex-col p-0 overflow-hidden bg-slate-50" 
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="p-4 sm:p-5 bg-white border-b border-slate-200 flex items-center justify-between gap-3 shrink-0">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-rose-100 text-rose-700 flex items-center justify-center border border-rose-200 shrink-0">
                  <AlertTriangle className="w-5 h-5 text-rose-600" />
                </div>
                <div>
                  <h3 className="text-base font-black text-slate-900 leading-tight">
                    {eliminatedModalBatch.title || 'Elenen ve Mükerrer Kayıtlar Listesi'}
                  </h3>
                  <p className="text-xs text-slate-500 font-medium mt-0.5">
                    Sistemde mükerrerlik veya adres çakışması tespit edildiği için aktarılmayan kayıtlar
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2 shrink-0">
                <a
                  href={`/api/export?type=errors${eliminatedModalBatch.batchId ? `&batchId=${encodeURIComponent(eliminatedModalBatch.batchId)}` : ''}`}
                  download={`Edirne_SYDV_Elenen_Kayitlar.xlsx`}
                  className="px-3 py-1.5 rounded-xl bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-300 font-bold text-xs flex items-center gap-1.5 transition-all shadow-xs"
                  title="Elenen Kayıtları Excel Olarak İndir"
                >
                  <Download className="w-4 h-4 text-emerald-700" />
                  <span className="hidden sm:inline">Excel İndir</span>
                </a>
                <button
                  type="button"
                  onClick={() => setEliminatedModalBatch(null)}
                  className="p-1.5 rounded-xl text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* Filter & Search Bar */}
            <div className="p-3 sm:p-4 bg-white border-b border-slate-200 flex flex-col sm:flex-row gap-2.5 shrink-0">
              <div className="relative flex-1">
                <Search className="w-4 h-4 absolute left-3 top-3 text-slate-400" />
                <input
                  type="text"
                  value={modalSearch}
                  onChange={(e) => setModalSearch(e.target.value)}
                  placeholder="İsim, TC kimlik, mahalle veya elenme nedenine göre ara..."
                  className="w-full pl-9 pr-3 py-2 rounded-xl bg-slate-50 border border-slate-200 text-slate-900 placeholder-slate-400 text-xs focus:outline-none focus:border-amber-500 font-medium"
                />
                {modalSearch && (
                  <button
                    onClick={() => setModalSearch('')}
                    className="absolute right-2.5 top-2.5 text-slate-400 hover:text-slate-600 text-xs font-bold"
                  >
                    Temizle
                  </button>
                )}
              </div>

              {/* Filter Tabs */}
              <div className="flex items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0 shrink-0">
                <button
                  type="button"
                  onClick={() => setModalFilter('ALL')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all shrink-0 ${
                    modalFilter === 'ALL'
                      ? 'bg-slate-900 text-white shadow-xs'
                      : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                  }`}
                >
                  Tümü ({modalRecords.length})
                </button>
                <button
                  type="button"
                  onClick={() => setModalFilter('MUKERRER_TC')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all shrink-0 ${
                    modalFilter === 'MUKERRER_TC'
                      ? 'bg-amber-600 text-white shadow-xs'
                      : 'bg-amber-50 text-amber-800 border border-amber-200 hover:bg-amber-100'
                  }`}
                >
                  Mükerrer TC ({modalRecords.filter(r => r.durum === 'MUKERRER_TC').length})
                </button>
                <button
                  type="button"
                  onClick={() => setModalFilter('MUKERRER_HANE')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all shrink-0 ${
                    modalFilter === 'MUKERRER_HANE'
                      ? 'bg-purple-600 text-white shadow-xs'
                      : 'bg-purple-50 text-purple-800 border border-purple-200 hover:bg-purple-100'
                  }`}
                >
                  Mükerrer Hane ({modalRecords.filter(r => r.durum === 'MUKERRER_HANE').length})
                </button>
              </div>
            </div>

            {/* Content List */}
            <div className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-3">
              {isLoadingModalRecords ? (
                <div className="py-12 text-center text-xs font-semibold text-slate-400 flex flex-col items-center justify-center gap-2">
                  <RefreshCw className="w-6 h-6 animate-spin text-amber-600" />
                  <span>Elenen kayıtlar getiriliyor...</span>
                </div>
              ) : filteredModalRecords.length === 0 ? (
                <div className="py-12 text-center bg-white rounded-2xl border border-dashed border-slate-200 text-slate-500 text-xs font-medium space-y-1">
                  <p className="font-bold text-slate-700">Kayıt bulunamadı</p>
                  <p className="text-[11px] text-slate-400">
                    Arama kriterinize veya filtrenize uygun elenen kayıt bulunmuyor.
                  </p>
                </div>
              ) : (
                filteredModalRecords.map((item, idx) => (
                  <div
                    key={item.id || idx}
                    className="p-4 rounded-2xl bg-white border border-slate-200/90 shadow-xs hover:border-slate-300 transition-all space-y-3"
                  >
                    {/* Top Row: Row Num + Badges */}
                    <div className="flex items-start justify-between gap-2 flex-wrap">
                      <div className="flex items-center gap-2 flex-wrap">
                        {item.satir_no && (
                          <span className="px-2.5 py-1 rounded-lg bg-slate-900 text-white text-[11px] font-black tracking-wide shadow-2xs flex items-center gap-1">
                            <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-400" />
                            Excel Satır #{item.satir_no}
                          </span>
                        )}
                        <span
                          className={`badge text-[10px] py-1 px-2.5 font-bold ${
                            item.durum === 'MUKERRER_TC'
                              ? 'badge-pending'
                              : item.durum === 'MUKERRER_HANE'
                              ? 'badge-household'
                              : 'badge-cancelled'
                          }`}
                        >
                          {item.durum === 'MUKERRER_TC'
                            ? 'Mükerrer TC Kimlik'
                            : item.durum === 'MUKERRER_HANE'
                            ? 'Aynı Hane / Adres'
                            : 'Eksik / Geçersiz'}
                        </span>
                        <span className="text-[10px] px-2 py-0.5 rounded-md bg-rose-50 text-rose-700 font-extrabold border border-rose-200">
                          Sisteme Eklenmedi (Elendi)
                        </span>
                      </div>

                      {/* Coal Delivery Status Badge */}
                      <span className={`badge text-[10px] py-1 px-2.5 font-bold shrink-0 ${
                        item.teslimat_durumu === 'TAMAMLANDI'
                          ? 'badge-completed'
                          : item.teslimat_durumu === 'EKSIK'
                          ? 'badge-pending'
                          : item.teslimat_durumu === 'IPTAL'
                          ? 'badge-cancelled'
                          : 'badge-draft'
                      }`}>
                        {item.teslimat_durumu === 'TAMAMLANDI' ? '✅ Mevcut Kömür Teslim Edildi' :
                         item.teslimat_durumu === 'EKSIK' ? '⚠️ Eksik Teslimat' :
                         item.teslimat_durumu === 'IPTAL' ? '❌ İptal' : '⏳ Kömür Bekliyor'}
                      </span>
                    </div>

                    {/* Citizen Info from Excel */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-2.5 p-3 rounded-xl bg-slate-50/80 border border-slate-200/80 text-xs">
                      <div>
                        <span className="text-[10px] font-bold text-slate-600 block">Hak Sahibi Adı Soyadı</span>
                        <span className="text-sm font-black text-slate-900">{item.ad_soyad || 'Bilinmiyor'}</span>
                      </div>

                      <div>
                        <span className="text-[10px] font-bold text-slate-600 block">TC Kimlik Numarası</span>
                        <div className="flex items-center gap-1.5 mt-0.5">
                          <span className="font-mono font-black text-amber-900 text-xs">{item.tc_no || 'Eksik'}</span>
                          {item.tc_no && item.tc_no.length === 11 && (
                            <button
                              type="button"
                              onClick={() => copyToClipboard(item.tc_no)}
                              className="text-slate-400 hover:text-slate-700 p-0.5 rounded"
                              title="TC Kopyala"
                            >
                              {copiedTc === item.tc_no ? (
                                <Check className="w-3.5 h-3.5 text-emerald-600" />
                              ) : (
                                <Copy className="w-3.5 h-3.5" />
                              )}
                            </button>
                          )}
                        </div>
                      </div>

                      <div>
                        <span className="text-[10px] font-bold text-slate-600 block">Telefon Bilgisi</span>
                        <div className="flex items-center gap-1 font-semibold text-slate-800 mt-0.5">
                          <Phone className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                          <span>{item.telefon || 'Belirtilmemiş'}</span>
                        </div>
                      </div>

                      <div>
                        <span className="text-[10px] font-bold text-slate-600 block">Hane No</span>
                        <span className="font-bold text-indigo-700 mt-0.5 block">
                          {item.hane_no ? `Hane No: ${item.hane_no}` : 'Belirtilmemiş'}
                        </span>
                      </div>
                    </div>

                    {/* Address Line */}
                    {(item.mahalle || item.acik_adres) && (
                      <div className="flex items-center gap-1.5 text-xs text-slate-600 px-1 font-medium">
                        <MapPin className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                        <span className="font-bold text-slate-800">{item.mahalle || 'Genel'}:</span>
                        <span className="truncate">{item.acik_adres || 'Adres belirtilmedi'}</span>
                      </div>
                    )}

                    {/* Collision & Elimination Reason Callout */}
                    <div className="p-3 rounded-xl bg-amber-50/90 border border-amber-300 text-xs text-amber-950 space-y-1.5">
                      <div className="flex items-center gap-1.5 font-black text-amber-900">
                        <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
                        <span>Elenme ve Çakışma Nedeni:</span>
                      </div>
                      <p className="font-medium text-slate-800 leading-relaxed text-[11px] sm:text-xs">
                        {item.hata_nedeni}
                      </p>

                      {/* Delivery summary pill if exists */}
                      {item.teslimat_durumu_ozeti && (
                        <div className="flex items-center gap-1.5 pt-1 mt-1 border-t border-amber-200/80 text-[11px] font-bold">
                          <PackageCheck className="w-3.5 h-3.5 text-amber-700 shrink-0" />
                          <span className="text-slate-600">Çakışan Hanenin Kömür Durumu:</span>
                          <span className="text-amber-950 font-black">{item.teslimat_durumu_ozeti}</span>
                        </div>
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>

            {/* Modal Footer */}
            <div className="p-3 sm:p-4 bg-white border-t border-slate-200 flex items-center justify-between gap-3 shrink-0">
              <span className="text-[11px] text-slate-500 font-medium hidden sm:inline">
                ⚡ Elenen kayıtlar sistemde mükerrer teslimat ve çakışma olmaması için korunmuştur.
              </span>
              <button
                type="button"
                onClick={() => setEliminatedModalBatch(null)}
                className="btn-secondary py-2 px-5 text-xs font-bold w-full sm:w-auto"
              >
                Kapat
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ADRESİ EKSİK HAK SAHİPLERİ HIZLI ADRES GÜNCELLEME MODALI */}
      {showMissingAddressModal && (
        <MissingAddressModal
          isOpen={showMissingAddressModal}
          onClose={() => {
            setShowMissingAddressModal(false);
            fetchSignatureData();
          }}
          missingBeneficiaries={signatureData.missingAddressBeneficiaries || []}
          onUpdated={() => {
            fetchSignatureData();
            onRefreshAll();
          }}
          userName={userRole === 'ADMIN' ? 'Yönetici' : 'Personel'}
        />
      )}
    </div>
  );
}
