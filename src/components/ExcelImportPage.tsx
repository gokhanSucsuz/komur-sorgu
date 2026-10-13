'use client';

import { useState, useRef, useEffect } from 'react';
import { 
  FileSpreadsheet, Upload, Download, AlertTriangle, CheckCircle2, 
  Trash2, Filter, Search, ShieldAlert, RefreshCw, FileText, X
} from 'lucide-react';

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
  
  // Logs state
  const [logs, setLogs] = useState<any[]>([]);
  const [batches, setBatches] = useState<any[]>([]);
  const [logStats, setLogStats] = useState<any>(null);
  const [selectedBatch, setSelectedBatch] = useState<string>('');
  const [selectedDurum, setSelectedDurum] = useState<string>('HEPSI');
  const [searchLog, setSearchLog] = useState('');
  const [isLoadingLogs, setIsLoadingLogs] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const fetchLogs = async () => {
    setIsLoadingLogs(true);
    try {
      let url = `/api/import/logs?durum=${selectedDurum}&q=${encodeURIComponent(searchLog)}`;
      if (selectedBatch) {
        url += `&batchId=${selectedBatch}`;
      }
      const res = await fetch(url);
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
    fetchLogs();
  }, [selectedBatch, selectedDurum, searchLog]);

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

    const formData = new FormData();
    formData.append('file', selectedFile);

    try {
      const res = await fetch('/api/import', {
        method: 'POST',
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
      onRefreshAll();
    } catch (err: any) {
      setErrorMsg(err.message || 'Dosya yükleme başarısız');
    } finally {
      setIsUploading(false);
    }
  };

  const handleClearLogs = async () => {
    if (!confirm('Yükleme hata kayıtlarını temizlemek istediğinize emin misiniz?')) return;
    try {
      const res = await fetch('/api/import/logs', { method: 'DELETE' });
      const data = await res.json();
      if (data.success) {
        fetchLogs();
      }
    } catch (err) {
      alert('Kayıtlar temizlenemedi');
    }
  };

  return (
    <div className="space-y-6">
      {/* Admin Privilege Check Notice */}
      {userRole !== 'ADMIN' && (
        <div className="p-4 rounded-2xl bg-amber-50 border border-amber-300 text-amber-900 space-y-2 shadow-xs">
          <div className="flex items-center gap-2 font-black text-sm text-amber-800">
            <ShieldAlert className="w-5 h-5 text-amber-600" />
            <span>Yönetici (Admin) Yetkisi Gereklidir</span>
          </div>
          <p className="text-xs text-amber-900 leading-relaxed font-medium">
            Excel dosyası yükleme ve toplu veri aktarma işlemleri için Yönetici girişi yapmanız gerekmektedir.
          </p>
          <button
            onClick={onSwitchToAdmin}
            className="btn-primary text-xs py-2 px-3 mt-1 bg-gradient-to-r from-amber-500 to-amber-600 font-bold"
          >
            Yönetici Olarak Giriş Yap
          </button>
        </div>
      )}

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
            download="Komur_Yukleme_Sablonu.xlsx"
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
            <li><strong>Mükerrer TC Kontrolü:</strong> Veritabanında veya dosyada aynı TC varsa ikinci kayıt reddedilir.</li>
            <li><strong>Aynı Hane/Adres Kontrolü:</strong> Aynı adreste veya hanede oturan başka hak sahibi varsa elenir.</li>
            <li><strong>Hatalı Kayıtlar:</strong> Tüm reddedilen kayıtlar gerekçeleriyle aşağıdaki sonuç sayfasına kaydedilir.</li>
          </ul>
        </div>

        {/* Upload Form */}
        <form onSubmit={handleUpload} className="space-y-3">
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
            <div className="p-4 rounded-xl bg-emerald-50 border border-emerald-300 text-emerald-900 space-y-2 animate-in fade-in">
              <div className="flex items-center gap-2 font-extrabold text-sm text-emerald-800">
                <CheckCircle2 className="w-5 h-5 text-emerald-600" />
                <span>Yükleme Tamamlandı!</span>
              </div>
              <p className="text-xs font-medium">{uploadResult.message}</p>
              <div className="grid grid-cols-3 gap-2 pt-2 border-t border-emerald-200 text-center">
                <div className="p-1.5 rounded-lg bg-white border border-emerald-200">
                  <span className="text-[10px] text-slate-500 font-bold">Toplam Satır</span>
                  <p className="text-sm font-black text-slate-900">{uploadResult.totalRows}</p>
                </div>
                <div className="p-1.5 rounded-lg bg-white border border-emerald-200">
                  <span className="text-[10px] text-emerald-700 font-bold">Başarılı</span>
                  <p className="text-sm font-black text-emerald-600">+{uploadResult.insertedCount}</p>
                </div>
                <div className="p-1.5 rounded-lg bg-white border border-rose-200">
                  <span className="text-[10px] text-rose-600 font-bold">Elenen Hatalı</span>
                  <p className="text-sm font-black text-rose-600">{uploadResult.failedCount}</p>
                </div>
              </div>
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
        <div className="pt-2 border-t border-slate-100 flex items-center justify-between text-xs text-slate-500 font-medium">
          <span>Veritabanındaki güncel listeyi dışa aktarın:</span>
          <a
            href="/api/export?type=beneficiaries"
            download="Komur_Hak_Sahipleri_Listesi.xlsx"
            className="flex items-center gap-1 text-amber-800 hover:text-amber-900 font-bold underline"
          >
            <Download className="w-3.5 h-3.5" />
            Tüm Listeyi Excel İndir
          </a>
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
                  href="/api/export?type=errors"
                  download="Komur_Yukleme_Hatalari_Raporu.xlsx"
                  className="p-2 rounded-xl bg-white hover:bg-slate-100 text-amber-700 border border-slate-200 shadow-xs"
                  title="Hata Raporunu Excel İndir"
                >
                  <Download className="w-4 h-4" />
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
        {logStats && (
          <div className="grid grid-cols-3 gap-2">
            <button
              onClick={() => setSelectedDurum('MUKERRER_TC')}
              className={`p-3 rounded-xl border text-left transition-all ${
                selectedDurum === 'MUKERRER_TC'
                  ? 'bg-amber-50 border-amber-300 text-amber-900 shadow-xs'
                  : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
              }`}
            >
              <span className="text-[10px] uppercase font-bold block text-slate-500">Mükerrer TC</span>
              <span className="text-xl font-black text-amber-800">{logStats.mukerrerTc || 0}</span>
            </button>

            <button
              onClick={() => setSelectedDurum('MUKERRER_HANE')}
              className={`p-3 rounded-xl border text-left transition-all ${
                selectedDurum === 'MUKERRER_HANE'
                  ? 'bg-purple-50 border-purple-300 text-purple-900 shadow-xs'
                  : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
              }`}
            >
              <span className="text-[10px] uppercase font-bold block text-slate-500">Mükerrer Hane</span>
              <span className="text-xl font-black text-purple-800">{logStats.mukerrerHane || 0}</span>
            </button>

            <button
              onClick={() => setSelectedDurum('HATALI')}
              className={`p-3 rounded-xl border text-left transition-all ${
                selectedDurum === 'HATALI'
                  ? 'bg-rose-50 border-rose-300 text-rose-900 shadow-xs'
                  : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
              }`}
            >
              <span className="text-[10px] uppercase font-bold block text-slate-500">Eksik/Geçersiz</span>
              <span className="text-xl font-black text-rose-700">{logStats.eksikHatali || 0}</span>
            </button>
          </div>
        )}

        {/* Filter & Search Bar */}
        <div className="flex gap-2">
          <div className="relative flex-1">
            <Search className="w-4 h-4 absolute left-3 top-3 text-slate-400" />
            <input
              type="text"
              value={searchLog}
              onChange={(e) => setSearchLog(e.target.value)}
              placeholder="Hatalı kayıtlarda ara..."
              className="w-full pl-9 pr-3 py-2 rounded-xl bg-white border border-slate-300 text-slate-900 placeholder-slate-400 text-xs focus:outline-none focus:border-amber-500 font-medium"
            />
          </div>

          <select
            value={selectedDurum}
            onChange={(e) => setSelectedDurum(e.target.value)}
            className="px-2.5 py-2 rounded-xl bg-white border border-slate-300 text-slate-900 text-xs font-bold focus:outline-none focus:border-amber-500"
          >
            <option value="HEPSI">Tüm Hata Tipleri</option>
            <option value="MUKERRER_TC">Mükerrer TC</option>
            <option value="MUKERRER_HANE">Mükerrer Hane/Adres</option>
            <option value="HATALI">Eksik/Geçersiz</option>
          </select>
        </div>

        {/* Logs List - Light Mode */}
        {isLoadingLogs ? (
          <div className="p-8 text-center text-slate-500 text-xs font-semibold">Kayıtlar yükleniyor...</div>
        ) : logs.length === 0 ? (
          <div className="p-8 text-center bg-white rounded-2xl border border-slate-200 text-slate-500 text-xs font-medium shadow-xs">
            Sorunlu veya elenen kayıt bulunmuyor.
          </div>
        ) : (
          <div className="space-y-2">
            {logs.map((item) => (
              <div
                key={item.id}
                className="p-3.5 rounded-xl bg-white border border-slate-200 hover:border-slate-300 transition-all space-y-1.5 shadow-xs"
              >
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <h5 className="text-sm font-extrabold text-slate-900">{item.ad_soyad}</h5>
                    <div className="flex items-center gap-2 text-xs text-slate-500 mt-0.5">
                      <span className="font-mono font-bold text-amber-800">TC: {item.tc_no}</span>
                      {item.satir_no && <span>• Satır #{item.satir_no}</span>}
                    </div>
                  </div>

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
                      ? 'Aynı Hane'
                      : 'Hatalı Bilgi'}
                  </span>
                </div>

                {/* Hata Sebebi */}
                <div className="p-2 rounded-lg bg-amber-50/70 border border-amber-200 text-xs text-amber-900 font-semibold">
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
    </div>
  );
}
