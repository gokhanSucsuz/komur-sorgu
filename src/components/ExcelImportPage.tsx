'use client';

import { useState, useRef, useEffect } from 'react';
import { 
  FileSpreadsheet, Upload, Download, AlertTriangle, CheckCircle2, 
  Trash2, Filter, Search, ShieldAlert, RefreshCw, FileText, X, Undo2, FolderSync, PackageCheck
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

  // Uploaded Excel Batches State & Rollback Target
  const [uploadedBatches, setUploadedBatches] = useState<any[]>([]);
  const [isLoadingBatches, setIsLoadingBatches] = useState<boolean>(false);
  const [batchDeleteTarget, setBatchDeleteTarget] = useState<any | null>(null);
  const [deleteDeliveredChoice, setDeleteDeliveredChoice] = useState<boolean>(false);
  const [isDeletingBatch, setIsDeletingBatch] = useState<boolean>(false);

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
    fetchUploadedBatches();
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
      fetchUploadedBatches();
      onRefreshAll();
    } catch (err: any) {
      setErrorMsg(err.message || 'Dosya yükleme başarısız');
    } finally {
      setIsUploading(false);
    }
  };

  const handleDeleteBatch = async (batchId: string, force: boolean) => {
    setIsDeletingBatch(true);
    try {
      const res = await fetch(`/api/import/batches?batchId=${encodeURIComponent(batchId)}&force=${force}`, {
        method: 'DELETE'
      });
      const data = await res.json();
      if (data.success) {
        setBatchDeleteTarget(null);
        fetchUploadedBatches();
        fetchLogs();
        onRefreshAll();
        alert(data.message || 'Excel dosyasına ait kayıtlar başarıyla silindi.');
      } else {
        alert(data.error || 'Dosya kayıtları silinemedi.');
      }
    } catch (err: any) {
      alert(err.message || 'Bağlantı hatası oluştu.');
    } finally {
      setIsDeletingBatch(false);
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
              {(uploadResult.mukerrerTcCount > 0 || uploadResult.mukerrerHaneCount > 0) && (
                <div className="flex flex-wrap gap-2 pt-1 text-[11px] font-bold">
                  {uploadResult.mukerrerTcCount > 0 && (
                    <span className="px-2 py-0.5 rounded-md bg-amber-100 text-amber-900 border border-amber-300">
                      Mükerrer TC: {uploadResult.mukerrerTcCount} adet (Yeniden Eklenmedi)
                    </span>
                  )}
                  {uploadResult.mukerrerHaneCount > 0 && (
                    <span className="px-2 py-0.5 rounded-md bg-indigo-100 text-indigo-900 border border-indigo-300">
                      Mükerrer Hane: {uploadResult.mukerrerHaneCount} adet (Yeniden Eklenmedi)
                    </span>
                  )}
                  {uploadResult.hataliCount > 0 && (
                    <span className="px-2 py-0.5 rounded-md bg-rose-100 text-rose-900 border border-rose-300">
                      Eksik/Geçersiz: {uploadResult.hataliCount} adet
                    </span>
                  )}
                </div>
              )}

              {/* Duplicate Warnings with Coal Delivery Status List */}
              {uploadResult.duplicateWarnings && uploadResult.duplicateWarnings.length > 0 && (
                <div className="mt-2 p-3 rounded-xl bg-amber-50/95 border border-amber-300 text-amber-950 space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1.5 font-black text-xs text-amber-900">
                      <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
                      <span>Mükerrer Kayıt & Kömür Teslimat Durumu Uyarıları ({uploadResult.duplicateWarnings.length} Kayıt Yeniden Eklenmedi)</span>
                    </div>
                    <span className="text-[10px] px-2 py-0.5 rounded-md bg-rose-100 text-rose-900 font-extrabold border border-rose-200">
                      Yeniden Eklenmedi
                    </span>
                  </div>
                  <p className="text-[11px] text-amber-900 leading-tight">
                    Aynı TC Kimlik No veya aynı Hane Numarası sistemde/dosyada zaten kayıtlı olduğu için bu kayıtlar <strong>atlandı ve tekrar eklenmedi</strong>. İlgili hanelerin mevcut kömür teslimat durumları aşağıdadır:
                  </p>
                  <div className="max-h-64 overflow-y-auto space-y-2 pr-1 pt-1">
                    {uploadResult.duplicateWarnings.map((dup: any, idx: number) => (
                      <div key={idx} className="p-2.5 rounded-lg bg-white border border-amber-200 text-xs shadow-xs space-y-1.5">
                        <div className="flex items-start justify-between gap-2">
                          <div>
                            <span className="font-extrabold text-slate-900">{dup.ad_soyad}</span>
                            <span className="text-slate-500 font-mono text-[11px] ml-2">TC: {dup.tc_no}</span>
                            {dup.hane_no && <span className="text-amber-800 text-[11px] font-bold ml-2">• Hane No: {dup.hane_no}</span>}
                            {dup.satir_no && <span className="text-slate-400 text-[11px] ml-1.5">• Satır #{dup.satir_no}</span>}
                          </div>
                          <span className={`badge text-[9px] py-0.5 px-2 shrink-0 ${
                            dup.teslimat_durumu === 'TAMAMLANDI'
                              ? 'badge-completed'
                              : dup.teslimat_durumu === 'EKSIK'
                              ? 'badge-pending'
                              : dup.teslimat_durumu === 'IPTAL'
                              ? 'badge-cancelled'
                              : 'badge-draft'
                          }`}>
                            {dup.teslimat_durumu === 'TAMAMLANDI' ? '✅ Teslim Edildi' :
                             dup.teslimat_durumu === 'EKSIK' ? '⚠️ Eksik Teslimat' :
                             dup.teslimat_durumu === 'IPTAL' ? '❌ İptal' : '⏳ Bekliyor'}
                          </span>
                        </div>

                        {dup.teslimat_durumu_ozeti && (
                          <div className="flex items-center gap-1.5 p-1.5 rounded-md bg-slate-50 border border-slate-200 text-[11px] font-bold text-slate-800">
                            <PackageCheck className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                            <span>Kömür Durumu:</span>
                            <span className="text-amber-900 font-black">{dup.teslimat_durumu_ozeti}</span>
                          </div>
                        )}

                        <div className="text-[11px] text-slate-700 bg-amber-50/70 p-1.5 rounded border border-amber-200 font-medium">
                          {dup.hata_nedeni}
                        </div>
                      </div>
                    ))}
                  </div>
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
        <div className="pt-2 border-t border-slate-100 flex items-center justify-between text-xs text-slate-500 font-medium">
          <span>Veritabanındaki güncel listeyi dışa aktarın:</span>
          <a
            href="/api/export?type=beneficiaries"
            download="Edirne_SYDV_Komur_Hak_Sahipleri_Listesi.xlsx"
            className="flex items-center gap-1 text-amber-800 hover:text-amber-900 font-bold underline"
          >
            <Download className="w-3.5 h-3.5" />
            Tüm Listeyi Excel İndir
          </a>
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
                className="p-4 rounded-xl bg-slate-50/80 border border-slate-200 hover:border-slate-300 transition-all flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-2xs"
              >
                <div className="min-w-0 flex-1 space-y-1.5">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-black text-slate-900 flex items-center gap-1.5">
                      <FileSpreadsheet className="w-4 h-4 text-emerald-600 shrink-0" />
                      <span className="truncate max-w-[240px] sm:max-w-none">{batch.dosya_adi}</span>
                    </span>
                    <span className="text-[11px] font-mono font-bold text-slate-600 bg-white px-2 py-0.5 rounded border border-slate-200">
                      {batch.created_at}
                    </span>
                  </div>

                  <div className="flex items-center gap-2 flex-wrap text-xs">
                    <span className="font-extrabold text-emerald-800 bg-emerald-100/80 px-2 py-0.5 rounded-md border border-emerald-200">
                      {batch.mevcut_kisi} Hak Sahibi Sistemde
                    </span>
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

                <button
                  type="button"
                  onClick={() => {
                    setBatchDeleteTarget(batch);
                    setDeleteDeliveredChoice(false);
                  }}
                  className="px-3.5 py-2 rounded-xl bg-white hover:bg-rose-50 text-rose-700 hover:text-rose-800 border border-rose-200 font-bold text-xs flex items-center justify-center gap-1.5 transition-all active:scale-95 shadow-2xs shrink-0 self-stretch sm:self-auto"
                >
                  <Trash2 className="w-4 h-4 text-rose-600" />
                  <span>Dosyayı ve Kayıtları Geri Al (Sil)</span>
                </button>
              </div>
            ))}
          </div>
        )}
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
                  download="Edirne_SYDV_Komur_Yukleme_Hatalari_Raporu.xlsx"
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
                className="p-3.5 rounded-xl bg-white border border-slate-200 hover:border-slate-300 transition-all space-y-2 shadow-xs"
              >
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <h5 className="text-sm font-extrabold text-slate-900">{item.ad_soyad}</h5>
                    <div className="flex items-center gap-2 text-xs text-slate-500 mt-0.5">
                      <span className="font-mono font-bold text-amber-800">TC: {item.tc_no}</span>
                      {item.hane_no && <span className="font-bold text-indigo-700">• Hane No: {item.hane_no}</span>}
                      {item.satir_no && <span>• Satır #{item.satir_no}</span>}
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
                        ? 'Aynı Hane'
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
    </div>
  );
}
