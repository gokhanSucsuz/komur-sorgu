'use client';

import { useState, useRef, useEffect, useMemo } from 'react';
import { 
  FileSpreadsheet, Upload, Download, AlertTriangle, CheckCircle2, 
  Trash2, Filter, Search, ShieldAlert, Shield, RefreshCw, FileText, X, Undo2, FolderSync, PackageCheck,
  Eye, Phone, MapPin, Copy, Check, Users, Info, Hash, Building2, Trees
} from 'lucide-react';
import { showConfirm, showToast, showAlert } from './GlobalAlertManager';
import { isBirebirBeneficiaryMatch } from '@/lib/normalizer';

const isKoySettlement = (name: string, tip?: string) => {
  if (tip === 'KOY') return true;
  if (!name) return false;
  return /(?:Köyü|Koy|Koyu)$/i.test(name.trim());
};

interface ExcelImportPageProps {
  userRole: 'ADMIN' | 'PERSONEL';
  onSwitchToAdmin: () => void;
  onRefreshAll: () => void;
}

export default function ExcelImportPage({
  userRole,
  onSwitchToAdmin,
  onRefreshAll
}: ExcelImportPageProps) {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadResult, setUploadResult] = useState<any>(null);
  const [errorMsg, setErrorMsg] = useState('');
  const [selectedListeTuru, setSelectedListeTuru] = useState<'STANDART' | 'SIGORTALI' | 'EK_LISTE'>('STANDART');
  
  // Logs state
  const [logs, setLogs] = useState<any[]>([]);
  const [batches, setBatches] = useState<any[]>([]);
  const [logStats, setLogStats] = useState<any>(null);
  const [selectedBatch, setSelectedBatch] = useState<string>('');
  const [selectedDurum, setSelectedDurum] = useState<string>('HEPSI');
  const [searchLog, setSearchLog] = useState('');
  const [isLoadingLogs, setIsLoadingLogs] = useState(false);

  // Uploaded Excel Batches State & Rollback Target
  const [uploadedBatches, setUploadedBatches] = useState<any[]>([]);
  const [isLoadingBatches, setIsLoadingBatches] = useState<boolean>(false);
  const [batchDeleteTarget, setBatchDeleteTarget] = useState<any | null>(null);
  const [deleteDeliveredChoice, setDeleteDeliveredChoice] = useState<boolean>(false);
  const [isDeletingBatch, setIsDeletingBatch] = useState<boolean>(false);

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
        const res = await fetch(`/api/import/logs?batchId=${encodeURIComponent(target.batchId)}&islemSonucu=EKLENMEDI`);
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

  const fetchUploadedBatches = async () => {
    setIsLoadingBatches(true);
    try {
      const res = await fetch('/api/import/batches');
      const data = await res.json();
      if (data.success) {
        setUploadedBatches(data.batches || []);
      }
    } catch (err) {
      console.error('Batches fetch error:', err);
    } finally {
      setIsLoadingBatches(false);
    }
  };

  const fetchLogs = async () => {
    // Only show full loading skeleton on initial empty load so existing scroll height never collapses
    if (logs.length === 0) {
      setIsLoadingLogs(true);
    }
    try {
      const res = await fetch('/api/import/logs?durum=HEPSI');
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
      fetchLogs();
      fetchUploadedBatches();
    }
  }, [userRole]);

  const computedLogStats = useMemo(() => {
    const baseList = selectedBatch
      ? logs.filter((l: any) => l.batch_id === selectedBatch)
      : logs;
    let mukerrerTc = 0;
    let mukerrerHane = 0;
    let eksikHatali = 0;
    for (const l of baseList) {
      if (l.durum === 'MUKERRER_TC') mukerrerTc++;
      else if (l.durum === 'MUKERRER_HANE') mukerrerHane++;
      else if (l.durum === 'HATALI') eksikHatali++;
    }
    return {
      toplamHata: baseList.length,
      mukerrerTc,
      mukerrerHane,
      eksikHatali,
    };
  }, [logs, selectedBatch]);

  const filteredLogs = useMemo(() => {
    const q = searchLog.trim();
    return logs.filter((item: any) => {
      if (selectedBatch && item.batch_id !== selectedBatch) return false;
      if (selectedDurum && selectedDurum !== 'HEPSI' && item.durum !== selectedDurum) return false;
      if (q) {
        if (isBirebirBeneficiaryMatch(item, q)) return true;
        if (
          (item.cakisan_tc || item.cakisan_ad_soyad) &&
          isBirebirBeneficiaryMatch({ tc_no: item.cakisan_tc, ad_soyad: item.cakisan_ad_soyad }, q)
        ) {
          return true;
        }
        return false;
      }
      return true;
    });
  }, [logs, selectedBatch, selectedDurum, searchLog]);

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

      {/* MASAÜSTÜ İKİ KOLONLU DÜZEN: Yükleme Paneli & Yüklenen Dosyalar */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 items-start">
        {/* Excel Upload Section - Light Mode */}
        <div className="p-5 rounded-2xl bg-white border border-slate-200 shadow-sm space-y-4">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-xl bg-emerald-100 text-emerald-800 flex items-center justify-center border border-emerald-200">
              <FileSpreadsheet className="w-6 h-6 text-emerald-700" />
            </div>
            <div>
              <h3 className="text-base font-extrabold text-slate-900 leading-tight">Excel Dosyası Yükle</h3>
              <p className="text-xs text-slate-500 font-medium">Hak sahibi vatandaş listesini otomatik aktarın</p>
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
          </div>
        </div>
      </div>

      {/* YÜKLENEN EXCEL DOSYALARI VE GERİ ALMA (DOSYA SİLME) YÖNETİMİ */}
      <div className="p-5 rounded-2xl bg-white border border-slate-200 shadow-sm space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-3 border-b border-slate-100">
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-xl bg-amber-100 text-amber-800 flex items-center justify-center border border-amber-200">
              <FolderSync className="w-5 h-5 text-amber-700" />
            </div>
            <div>
              <h3 className="text-base font-extrabold text-slate-900 leading-tight">
                Yüklenen Excel Dosyaları ve Geri Alma (İptal)
              </h3>
              <p className="text-xs text-slate-500 font-medium">
                Yanlış yüklenen Excel dosyalarını ve bu dosyalardan eklenen kayıtları tek tıkla geri alın
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={fetchUploadedBatches}
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
                      <span className="text-[11px] font-mono font-bold text-slate-600 bg-white px-2 py-0.5 rounded border border-slate-200">
                        {batch.created_at}
                      </span>
                    </div>

                    <div className="flex items-center gap-2 flex-wrap text-xs">
                      <span className="font-extrabold text-emerald-800 bg-emerald-100/80 px-2 py-0.5 rounded-md border border-emerald-200">
                        {batch.mevcut_kisi} Hak Sahibi Sistemde
                      </span>
                      {(batch.elenen_kisi > 0 || batch.hata_kayit_sayisi > 0) && (
                        <span className="font-extrabold text-rose-800 bg-rose-100/80 px-2 py-0.5 rounded-md border border-rose-200">
                          {batch.elenen_kisi || batch.hata_kayit_sayisi} Elenen / Mükerrer
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
                    {(batch.elenen_kisi > 0 || batch.hata_kayit_sayisi > 0) && (
                      <>
                        <button
                          type="button"
                          onClick={() => openEliminatedModal({
                            batchId: batch.batch_id || batch.id,
                            dosyaAdi: batch.dosya_adi,
                            title: `"${batch.dosya_adi}" Dosyasından Elenen Kayıtlar (${batch.elenen_kisi || batch.hata_kayit_sayisi} Kayıt)`
                          })}
                          className="px-3 py-1.5 rounded-xl bg-amber-50 hover:bg-amber-100 text-amber-900 border border-amber-300 font-extrabold text-xs flex items-center justify-center gap-1.5 transition-all active:scale-95 shadow-2xs"
                          title="Bu dosyadan elenen kayıtları detaylı incele"
                        >
                          <Eye className="w-3.5 h-3.5 text-amber-700" />
                          <span>Elenenler ({batch.elenen_kisi || batch.hata_kayit_sayisi})</span>
                        </button>

                        <a
                          href={`/api/export?type=errors&batchId=${encodeURIComponent(batch.batch_id || batch.id)}`}
                          download={`Edirne_SYDV_Elenen_Kayitlar_${batch.batch_id || batch.id}.xlsx`}
                          className="px-2.5 py-1.5 rounded-xl bg-white hover:bg-slate-100 text-slate-700 border border-slate-200 text-xs font-bold flex items-center justify-center gap-1 transition-all shadow-2xs"
                          title="Bu dosyanın elenen kayıtlarını Excel indir"
                        >
                          <Download className="w-3.5 h-3.5 text-emerald-700" />
                          <span className="hidden sm:inline">Excel</span>
                        </a>
                      </>
                    )}

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

      {/* YÜKLEME SONUÇLARI VE SORUNLU KAYITLAR SAYFASI - Light Mode */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-base font-extrabold text-slate-900 flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-amber-600" />
              Yükleme Sonuçları & Hatalı/Mükerrer Kayıtlar
            </h3>
            <p className="text-xs text-slate-500 font-medium">
              Sisteme eklenmeyen mükerrer TC veya aynı hanede bulunan kayıtlar
            </p>
          </div>

          <div className="flex items-center gap-1.5">
            {logs.length > 0 && (
              <>
                <a
                  href={`/api/export?type=errors${selectedBatch ? `&batchId=${encodeURIComponent(selectedBatch)}` : ''}`}
                  download="Edirne_SYDV_Komur_Yukleme_Hatalari_Raporu.xlsx"
                  className="p-2 rounded-xl bg-white hover:bg-slate-100 text-amber-700 border border-slate-200 shadow-xs flex items-center gap-1.5 text-xs font-bold"
                  title="Hata Raporunu Excel İndir"
                >
                  <Download className="w-4 h-4 text-emerald-700" />
                  <span className="hidden sm:inline">Excel İndir</span>
                </a>
                <button
                  onClick={handleClearLogs}
                  className="p-2 rounded-xl bg-white hover:bg-rose-50 text-slate-400 hover:text-rose-600 border border-slate-200 shadow-xs"
                  title="Hata Kayıtlarını Temizle"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </>
            )}
          </div>
        </div>

        {/* Error Stats Badges */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          <button
            type="button"
            onClick={() => setSelectedDurum('HEPSI')}
            className={`p-3 rounded-xl border text-left transition-all ${
              selectedDurum === 'HEPSI'
                ? 'bg-slate-100 border-slate-400 text-slate-900 shadow-xs'
                : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
            }`}
          >
            <span className="text-[10px] uppercase font-bold block text-slate-500">Tüm Durumlar</span>
            <span className="text-xl font-black text-slate-900">{computedLogStats.toplamHata || 0}</span>
          </button>

          <button
            type="button"
            onClick={() => setSelectedDurum(selectedDurum === 'MUKERRER_TC' ? 'HEPSI' : 'MUKERRER_TC')}
            className={`p-3 rounded-xl border text-left transition-all ${
              selectedDurum === 'MUKERRER_TC'
                ? 'bg-amber-50 border-amber-300 text-amber-900 shadow-xs'
                : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
            }`}
          >
            <span className="text-[10px] uppercase font-bold block text-slate-500">Mükerrer TC</span>
            <span className="text-xl font-black text-amber-800">{computedLogStats.mukerrerTc || 0}</span>
          </button>

          <button
            type="button"
            onClick={() => setSelectedDurum(selectedDurum === 'MUKERRER_HANE' ? 'HEPSI' : 'MUKERRER_HANE')}
            className={`p-3 rounded-xl border text-left transition-all ${
              selectedDurum === 'MUKERRER_HANE'
                ? 'bg-purple-50 border-purple-300 text-purple-900 shadow-xs'
                : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
            }`}
          >
            <span className="text-[10px] uppercase font-bold block text-slate-500">Mükerrer Hane</span>
            <span className="text-xl font-black text-purple-800">{computedLogStats.mukerrerHane || 0}</span>
          </button>

          <button
            type="button"
            onClick={() => setSelectedDurum(selectedDurum === 'HATALI' ? 'HEPSI' : 'HATALI')}
            className={`p-3 rounded-xl border text-left transition-all ${
              selectedDurum === 'HATALI'
                ? 'bg-rose-50 border-rose-300 text-rose-900 shadow-xs'
                : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
            }`}
          >
            <span className="text-[10px] uppercase font-bold block text-slate-500">Eksik/Geçersiz</span>
            <span className="text-xl font-black text-rose-700">{computedLogStats.eksikHatali || 0}</span>
          </button>
        </div>

        {/* Filter & Search Bar */}
        <div className="flex flex-col sm:flex-row gap-2">
          <div className="relative flex-1">
            <Search className="w-4 h-4 absolute left-3 top-3 text-slate-400" />
            <input
              type="text"
              value={searchLog}
              onChange={(e) => setSearchLog(e.target.value)}
              placeholder="Hak sahibi adı soyadı veya TC kimlik no ile ara..."
              className="w-full pl-9 pr-3 py-2 rounded-xl bg-white border border-slate-300 text-slate-900 placeholder-slate-400 text-xs focus:outline-none focus:border-amber-500 font-medium"
            />
          </div>

          <div className="flex gap-2 shrink-0">
            <select
              value={selectedBatch}
              onChange={(e) => setSelectedBatch(e.target.value)}
              className="px-2.5 py-2 rounded-xl bg-white border border-slate-300 text-slate-900 text-xs font-bold focus:outline-none focus:border-amber-500 max-w-[180px] truncate"
              title="Excel Dosyasına Göre Filtrele"
            >
              <option value="">Tüm Dosyalar</option>
              {uploadedBatches.map((b) => (
                <option key={b.batch_id || b.id} value={b.batch_id || b.id}>
                  {b.dosya_adi} ({b.elenen_kisi || b.hata_kayit_sayisi || 0} Elenen)
                </option>
              ))}
            </select>

            <select
              value={selectedDurum}
              onChange={(e) => setSelectedDurum(e.target.value)}
              className="px-2.5 py-2 rounded-xl bg-white border border-slate-300 text-slate-900 text-xs font-bold focus:outline-none focus:border-amber-500"
            >
              <option value="HEPSI">Tüm Durumlar ({computedLogStats.toplamHata || 0})</option>
              <option value="MUKERRER_TC">Mükerrer TC ({computedLogStats.mukerrerTc || 0})</option>
              <option value="MUKERRER_HANE">Mükerrer Hane ({computedLogStats.mukerrerHane || 0})</option>
              <option value="HATALI">Eksik/Geçersiz ({computedLogStats.eksikHatali || 0})</option>
            </select>
          </div>
        </div>

        {/* Logs List - Light Mode */}
        {isLoadingLogs && logs.length === 0 ? (
          <div className="p-8 text-center text-slate-500 text-xs font-semibold">Kayıtlar yükleniyor...</div>
        ) : filteredLogs.length === 0 ? (
          <div className="p-8 text-center bg-white rounded-2xl border border-slate-200 text-slate-500 text-xs font-medium shadow-xs">
            Seçilen filtreye uygun sorunlu veya elenen kayıt bulunmuyor.
          </div>
        ) : (
          <div className="space-y-2">
            {filteredLogs.map((item) => (
              <div
                key={item.id}
                className="p-3.5 rounded-xl bg-white border border-slate-200 hover:border-slate-300 transition-all space-y-2 shadow-xs"
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
                          className="text-slate-400 hover:text-slate-700 p-0.5 rounded transition-colors"
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
                        : 'Hatalı Bilgi'}
                    </span>

                    {(item.durum === 'MUKERRER_TC' || item.durum === 'MUKERRER_HANE') && (
                      <span className="text-[9px] px-1.5 py-0.5 rounded bg-rose-50 border border-rose-200 text-rose-700 font-black">
                        Eklenmedi
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

                {/* Address info */}
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
    </div>
  );
}
