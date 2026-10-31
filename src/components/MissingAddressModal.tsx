'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
import {
  MapPin,
  X,
  Check,
  AlertTriangle,
  RefreshCw,
  Building,
  User,
  Phone,
  CheckCircle2,
  Sparkles,
  Search,
  Edit3,
  Info,
  Layers,
  ArrowRight,
  ShieldAlert,
} from 'lucide-react';
import { showToast } from './GlobalAlertManager';
import {
  EDIRNE_NEIGHBORHOODS_LIST,
  EDIRNE_VILLAGES_LIST,
  isBeneficiaryAddressMissing,
} from '@/lib/normalizer';

export interface MissingAddressBeneficiary {
  id: string;
  tc_no: string;
  ad_soyad: string;
  mahalle: string;
  acik_adres: string;
  telefon?: string;
  original_mahalle?: string;
  original_acik_adres?: string;
}

interface MissingAddressModalProps {
  isOpen: boolean;
  onClose: () => void;
  missingBeneficiaries?: MissingAddressBeneficiary[];
  onUpdated: () => void;
  userName?: string;
}

export default function MissingAddressModal({
  isOpen,
  onClose,
  missingBeneficiaries = [],
  onUpdated,
  userName = 'Yönetici',
}: MissingAddressModalProps) {
  // Local editable state for each beneficiary
  const [items, setItems] = useState<MissingAddressBeneficiary[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [isSavingAll, setIsSavingAll] = useState<boolean>(false);
  const [savedIds, setSavedIds] = useState<Set<string>>(new Set());
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [manualMahalleMode, setManualMahalleMode] = useState<Record<string, boolean>>({});

  // API'den güncel adresi eksik listeyi çekme (güvenilir fallback)
  const fetchMissingFromApi = useCallback(async () => {
    setIsLoading(true);
    try {
      const res = await fetch('/api/signature-lists');
      const data = await res.json();
      if (data.success && Array.isArray(data.missingAddressBeneficiaries)) {
        const mapped: MissingAddressBeneficiary[] = data.missingAddressBeneficiaries.map((b: any) => ({
          id: b.id || b._id?.toString() || '',
          tc_no: b.tc_no || '',
          ad_soyad: b.ad_soyad || '',
          original_mahalle: b.mahalle || '',
          original_acik_adres: b.acik_adres || '',
          mahalle:
            b.mahalle && !b.mahalle.toLowerCase().includes('belirtilme') && b.mahalle !== 'Genel'
              ? b.mahalle
              : '',
          acik_adres:
            b.acik_adres && !b.acik_adres.toLowerCase().includes('belirtilme')
              ? b.acik_adres
              : '',
          telefon: b.telefon || '',
        }));
        setItems(mapped);
      }
    } catch (err) {
      console.error('Adresi eksik kayıtları getirme hatası:', err);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!isOpen) return;

    if (missingBeneficiaries && missingBeneficiaries.length > 0) {
      setItems(
        missingBeneficiaries.map((b) => ({
          ...b,
          original_mahalle: b.original_mahalle || b.mahalle || '',
          original_acik_adres: b.original_acik_adres || b.acik_adres || '',
          mahalle:
            b.mahalle && !b.mahalle.toLowerCase().includes('belirtilme') && b.mahalle !== 'Genel'
              ? b.mahalle
              : '',
          acik_adres:
            b.acik_adres && !b.acik_adres.toLowerCase().includes('belirtilme')
              ? b.acik_adres
              : '',
        }))
      );
      setSavedIds(new Set());
    } else {
      // Eğer prop boş geldiyse doğrudan API'den sorgula
      fetchMissingFromApi();
      setSavedIds(new Set());
    }
  }, [isOpen, missingBeneficiaries, fetchMissingFromApi]);

  const handleInputChange = (id: string, field: 'mahalle' | 'acik_adres', value: string) => {
    setItems((prev) =>
      prev.map((item) => (item.id === id ? { ...item, [field]: value } : item))
    );
  };

  const toggleManualMahalle = (id: string) => {
    setManualMahalleMode((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const handleUseOriginalAddress = (id: string) => {
    setItems((prev) =>
      prev.map((item) => {
        if (item.id !== id) return item;
        const cleaned = (item.original_acik_adres || '')
          .replace(/no:\s*belirtilmemiş/gi, 'No: ')
          .replace(/kapi\s*no:\s*belirtilmemiş/gi, 'No: ')
          .trim();
        return {
          ...item,
          acik_adres: cleaned || item.original_acik_adres || '',
        };
      })
    );
  };

  const handleSaveSingle = async (item: MissingAddressBeneficiary): Promise<boolean> => {
    const trimmedMahalle = (item.mahalle || '').trim();
    const trimmedAdres = (item.acik_adres || '').trim();

    if (!trimmedMahalle) {
      showToast({
        type: 'warning',
        title: 'Mahalle Seçimi Gerekli',
        message: `${item.ad_soyad} için lütfen bir mahalle veya köy belirleyiniz.`,
      });
      return false;
    }

    if (!trimmedAdres) {
      showToast({
        type: 'warning',
        title: 'Açık Adres Gerekli',
        message: `${item.ad_soyad} için lütfen sokak, bina ve kapı numarası giriniz.`,
      });
      return false;
    }

    if (isBeneficiaryAddressMissing({ mahalle: trimmedMahalle, acik_adres: trimmedAdres })) {
      showToast({
        type: 'warning',
        title: 'Yetersiz Adres Girişi',
        message: 'Lütfen kapı/bina numarası içeren geçerli ve somut bir adres yazınız (Örn: No: 12 veya Köy İçi No: 25).',
      });
      return false;
    }

    setSavingId(item.id);
    try {
      const res = await fetch('/api/beneficiaries', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: item.id,
          mahalle: trimmedMahalle,
          acik_adres: trimmedAdres,
          guncelleme_notu: `İmza listesi öncesi adres eksikliği giderildi: ${trimmedMahalle} - ${trimmedAdres}`,
          updated_by: userName,
        }),
      });

      const data = await res.json();
      if (!data.success) {
        throw new Error(data.error || 'Adres güncellenemedi');
      }

      setSavedIds((prev) => new Set(prev).add(item.id));
      showToast({
        type: 'success',
        title: 'Adres Güncellendi',
        message: `${item.ad_soyad} kaydı "${trimmedMahalle}" listesine başarıyla aktarıldı.`,
      });
      onUpdated();
      return true;
    } catch (err: any) {
      showToast({
        type: 'error',
        title: 'Güncelleme Hatası',
        message: err.message || 'Adres kaydedilirken bir hata oluştu.',
      });
      return false;
    } finally {
      setSavingId(null);
    }
  };

  const handleSaveAllReady = async () => {
    const unsaved = items.filter((i) => !savedIds.has(i.id));
    const readyToSave = unsaved.filter((i) => {
      const m = (i.mahalle || '').trim();
      const a = (i.acik_adres || '').trim();
      return m && a && !isBeneficiaryAddressMissing({ mahalle: m, acik_adres: a });
    });

    if (readyToSave.length === 0) {
      showToast({
        type: 'warning',
        title: 'Kaydedilecek Hazır Adres Yok',
        message: 'Lütfen listedeki hanelerin mahalle ve açık adres bilgilerini doldurunuz.',
      });
      return;
    }

    setIsSavingAll(true);
    let successCount = 0;
    for (const item of readyToSave) {
      const ok = await handleSaveSingle(item);
      if (ok) successCount++;
    }
    setIsSavingAll(false);

    if (successCount > 0) {
      showToast({
        type: 'success',
        title: 'Toplu Kayıt Tamamlandı',
        message: `${successCount} hanenin adresi başarıyla güncellendi.`,
      });
      onUpdated();
    }
  };

  const remainingItems = items.filter((item) => !savedIds.has(item.id));
  const isAllSaved = items.length > 0 && remainingItems.length === 0;

  // Arama filtresi
  const filteredRemainingItems = useMemo(() => {
    if (!searchTerm.trim()) return remainingItems;
    const q = searchTerm.toLowerCase();
    return remainingItems.filter(
      (item) =>
        item.ad_soyad.toLowerCase().includes(q) ||
        item.tc_no.includes(q) ||
        (item.telefon && item.telefon.includes(q)) ||
        item.mahalle.toLowerCase().includes(q) ||
        item.acik_adres.toLowerCase().includes(q)
    );
  }, [remainingItems, searchTerm]);

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-[10000] bg-slate-950/75 backdrop-blur-xs flex items-center justify-center p-3 sm:p-5 overflow-y-auto no-print"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-3xl border border-slate-200 shadow-2xl max-w-4xl w-full p-4 sm:p-6 space-y-4 my-auto max-h-[92vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Üst Başlık & Kontroller */}
        <div className="flex items-start justify-between gap-3 border-b border-slate-100 pb-3 shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-2xl bg-gradient-to-br from-amber-500 to-amber-600 text-white flex items-center justify-center shrink-0 shadow-md">
              <MapPin className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h3 className="text-sm sm:text-base font-black text-slate-900">
                  Adresi Eksik Hak Sahipleri — Hızlı Adres Girişi
                </h3>
                <span
                  className={`px-2.5 py-0.5 rounded-full text-[10px] font-black border transition-all ${
                    remainingItems.length > 0
                      ? 'bg-rose-100 text-rose-800 border-rose-300'
                      : 'bg-emerald-100 text-emerald-800 border-emerald-300'
                  }`}
                >
                  {isLoading
                    ? 'Yükleniyor...'
                    : remainingItems.length > 0
                    ? `${remainingItems.length} Hane Kaldı`
                    : 'Tüm Adresler Tamam'}
                </span>
              </div>
              <p className="text-[11px] text-slate-500 font-semibold mt-0.5">
                Islak imza listesi çıktısı alınmadan önce bu kayıtların mahalle ve açık adreslerini liste üzerinden doğrudan belirleyin
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            <button
              type="button"
              onClick={() => fetchMissingFromApi()}
              disabled={isLoading}
              title="Listeyi Yeniden Sorgula"
              className="p-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 transition-colors disabled:opacity-50"
            >
              <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
            </button>
            <button
              type="button"
              onClick={onClose}
              className="p-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-600 transition-colors"
              title="Pencereyi Kapat"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Bilgilendirme Kutusu */}
        <div className="p-3.5 rounded-2xl bg-amber-50/90 border border-amber-300/80 text-xs text-amber-950 flex items-start gap-3 shrink-0 shadow-2xs">
          <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
          <div className="space-y-1">
            <p className="text-[11.5px] leading-relaxed font-semibold">
              Aşağıda listelenen hanelerin adres bilgisi Excel dosyasında boş bırakılmış veya yetersiz girilmiştir.{' '}
              <strong className="text-amber-950 underline decoration-amber-400 font-black">
                Islak imza listesi oluşturulabilmesi için her hanenin mahalle/köy ve açık adresinin tam olması ZORUNLUDUR.
              </strong>
            </p>
            <p className="text-[10.5px] text-amber-800 font-medium">
              Aşağıdaki liste üzerinden her hanenin mahallesini ve açık adresini doğrudan güncelleyip &quot;Kaydet&quot; butonuna basınız.
            </p>
          </div>
        </div>

        {/* Arama ve Toplu İşlem Çubuğu (Kayıt varsa) */}
        {remainingItems.length > 1 && (
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2 shrink-0">
            <div className="relative flex-1">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="İsim, T.C. Kimlik No veya telefon ile filtrele..."
                className="w-full pl-9 pr-3 py-1.5 rounded-xl bg-slate-50 border border-slate-200 text-xs font-semibold text-slate-900 placeholder:text-slate-400 focus:outline-none focus:border-amber-500 focus:bg-white"
              />
              {searchTerm && (
                <button
                  type="button"
                  onClick={() => setSearchTerm('')}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            <button
              type="button"
              onClick={handleSaveAllReady}
              disabled={isSavingAll}
              className="px-4 py-1.5 rounded-xl bg-amber-600 hover:bg-amber-700 active:scale-95 text-white font-black text-xs flex items-center justify-center gap-1.5 shadow-xs transition-all disabled:opacity-50 shrink-0"
            >
              {isSavingAll ? (
                <RefreshCw className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Check className="w-3.5 h-3.5" />
              )}
              <span>Doldurulanları Toplu Kaydet</span>
            </button>
          </div>
        )}

        {/* Liste Alanı */}
        <div className="flex-1 overflow-y-auto space-y-3 pr-1 min-h-[240px]">
          {isLoading ? (
            <div className="p-12 text-center space-y-3">
              <RefreshCw className="w-8 h-8 animate-spin text-amber-600 mx-auto" />
              <p className="text-xs font-bold text-slate-600">
                Adresi eksik hak sahipleri taranıyor, lütfen bekleyiniz...
              </p>
            </div>
          ) : isAllSaved ? (
            <div className="p-8 text-center space-y-3 my-auto">
              <div className="w-16 h-16 rounded-3xl bg-emerald-100 text-emerald-700 flex items-center justify-center mx-auto shadow-md">
                <CheckCircle2 className="w-9 h-9" />
              </div>
              <h4 className="text-base sm:text-lg font-black text-slate-900">
                🎉 Harika! Tüm Eksik Adresler Başarıyla Tamamlandı
              </h4>
              <p className="text-xs text-slate-600 font-medium max-w-md mx-auto leading-relaxed">
                Tüm hak sahiplerinin mahalle ve adres bilgileri eksiksiz kaydedildi. Artık ıslak imza listesini hatasız ve tam mahalle sıralı olarak oluşturup indirebilirsiniz.
              </p>
              <div className="pt-3">
                <button
                  type="button"
                  onClick={onClose}
                  className="px-6 py-2.5 rounded-2xl bg-slate-900 hover:bg-slate-800 text-white font-black text-xs shadow-md active:scale-95 transition-all"
                >
                  Tamamlandı, Pencereyi Kapat ve Listeyi Oluştur
                </button>
              </div>
            </div>
          ) : items.length === 0 ? (
            <div className="p-10 text-center space-y-3 my-auto">
              <div className="w-14 h-14 rounded-3xl bg-emerald-100 text-emerald-700 flex items-center justify-center mx-auto shadow-xs">
                <CheckCircle2 className="w-7 h-7" />
              </div>
              <h4 className="text-base font-black text-slate-900">
                Sistemde Adresi Eksik Kayıt Bulunmuyor
              </h4>
              <p className="text-xs text-slate-600 font-medium max-w-md mx-auto">
                Bekleyen tüm hak sahiplerinin mahalle ve adres bilgileri eksiksizdir. Islak imza listenizi güvenle oluşturabilirsiniz.
              </p>
              <div className="pt-2">
                <button
                  type="button"
                  onClick={onClose}
                  className="px-6 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-white font-black text-xs transition-all"
                >
                  Pencereyi Kapat
                </button>
              </div>
            </div>
          ) : filteredRemainingItems.length === 0 ? (
            <div className="p-8 text-center text-xs text-slate-500 font-bold">
              Arama kriterinize uygun adresi eksik kayıt bulunamadı.
            </div>
          ) : (
            filteredRemainingItems.map((item, idx) => {
              const isManual = Boolean(manualMahalleMode[item.id]);
              const isSavingThis = savingId === item.id;
              const hasCustomMahalleOption =
                item.mahalle &&
                !EDIRNE_NEIGHBORHOODS_LIST.includes(item.mahalle as any) &&
                !EDIRNE_VILLAGES_LIST.includes(item.mahalle as any);

              // Hata teşhisi
              const isMissingMahalle =
                !item.mahalle ||
                item.mahalle === 'Genel' ||
                item.mahalle.toLowerCase().includes('belirtilme');
              const isMissingAdres =
                !item.acik_adres ||
                isBeneficiaryAddressMissing({
                  mahalle: item.mahalle || item.original_mahalle,
                  acik_adres: item.acik_adres || item.original_acik_adres,
                });

              return (
                <div
                  key={item.id}
                  className="p-4 rounded-2xl bg-slate-50/90 border-2 border-slate-200 hover:border-amber-400 transition-all space-y-3 shadow-2xs"
                >
                  {/* Kişi Bilgisi & Mevcut Kayıt Durumu */}
                  <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200/80 pb-2.5">
                    <div className="flex items-center gap-2.5 flex-wrap">
                      <span className="w-6 h-6 rounded-lg bg-amber-500 text-white flex items-center justify-center text-[11px] font-black shrink-0 shadow-2xs">
                        {idx + 1}
                      </span>
                      <strong className="text-sm font-black text-slate-900">
                        {item.ad_soyad}
                      </strong>
                      <span className="text-[11px] font-mono font-bold text-slate-700 bg-white px-2 py-0.5 rounded-lg border border-slate-200">
                        T.C.: {item.tc_no}
                      </span>
                      {item.telefon && (
                        <a
                          href={`tel:${item.telefon}`}
                          className="text-[11px] font-bold text-emerald-700 hover:underline flex items-center gap-1 bg-emerald-50 px-2 py-0.5 rounded-lg border border-emerald-200"
                          title="Telefonla ara"
                        >
                          <Phone className="w-3 h-3 text-emerald-600" />
                          <span>{item.telefon}</span>
                        </a>
                      )}
                    </div>

                    {/* Eksiklik Teşhis Rozeti */}
                    <div className="flex items-center gap-1.5 flex-wrap">
                      {isMissingMahalle && (
                        <span className="px-2 py-0.5 rounded-md bg-rose-100 text-rose-800 text-[10px] font-black border border-rose-300">
                          ⚠️ Mahalle Seçilmeli
                        </span>
                      )}
                      {isMissingAdres && (
                        <span className="px-2 py-0.5 rounded-md bg-amber-100 text-amber-900 text-[10px] font-black border border-amber-300">
                          ⚠️ Açık Adres / Kapı No Girilmeli
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Excel'deki Mevcut Kayıt Bilgisi (Neden Hatalı Olduğunu Şeffafça Gösterir) */}
                  {(item.original_mahalle || item.original_acik_adres) && (
                    <div className="p-2.5 rounded-xl bg-amber-100/60 border border-amber-300/80 text-[11px] flex flex-wrap items-center justify-between gap-2">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-extrabold text-amber-950 uppercase text-[9.5px] tracking-wider flex items-center gap-1">
                          <Info className="w-3.5 h-3.5 text-amber-700" />
                          Excel&apos;deki Mevcut Bilgi:
                        </span>
                        <span className="font-semibold text-slate-800">
                          <strong>Mahalle/Köy:</strong> {item.original_mahalle || '—'}
                          {' | '}
                          <strong>Açık Adres:</strong> {item.original_acik_adres || '—'}
                        </span>
                      </div>

                      {item.original_acik_adres && !item.acik_adres && (
                        <button
                          type="button"
                          onClick={() => handleUseOriginalAddress(item.id)}
                          className="px-2 py-0.5 rounded bg-amber-200 hover:bg-amber-300 text-amber-950 font-bold text-[10px] transition-all"
                          title="Mevcut adres metnini düzenleme kutusuna aktar"
                        >
                          Mevcut Metni Doldur
                        </button>
                      )}
                    </div>
                  )}

                  {/* Doğrudan Düzenleme Alanları */}
                  <div className="grid grid-cols-1 sm:grid-cols-12 gap-2.5 items-end">
                    {/* Mahalle Seçimi */}
                    <div className="sm:col-span-5 space-y-1">
                      <div className="flex items-center justify-between">
                        <label className="text-[10px] font-extrabold uppercase text-slate-700 block">
                          Mahalle / Köy <span className="text-rose-600">*</span>
                        </label>
                        <button
                          type="button"
                          onClick={() => toggleManualMahalle(item.id)}
                          className="text-[10px] font-bold text-amber-800 hover:underline"
                        >
                          {isManual ? 'Listeden Seç' : 'Elle Yaz'}
                        </button>
                      </div>

                      {isManual ? (
                        <input
                          type="text"
                          value={item.mahalle}
                          onChange={(e) => handleInputChange(item.id, 'mahalle', e.target.value)}
                          placeholder="Mahalle veya köy adı yazınız..."
                          className="w-full px-3 py-2 rounded-xl bg-white border border-slate-300 text-xs font-bold text-slate-900 focus:outline-none focus:border-amber-500 focus:ring-1 focus:ring-amber-500"
                        />
                      ) : (
                        <select
                          value={item.mahalle}
                          onChange={(e) => handleInputChange(item.id, 'mahalle', e.target.value)}
                          className="w-full px-2.5 py-2 rounded-xl bg-white border border-slate-300 text-xs font-bold text-slate-900 focus:outline-none focus:border-amber-500 focus:ring-1 focus:ring-amber-500"
                        >
                          <option value="">-- Mahalle / Köy Seçiniz --</option>
                          {hasCustomMahalleOption && (
                            <option value={item.mahalle}>
                              📍 {item.mahalle} (Mevcut Kayıtlı)
                            </option>
                          )}
                          <optgroup label="🏢 Edirne Merkez Mahalleler">
                            {EDIRNE_NEIGHBORHOODS_LIST.map((m) => (
                              <option key={m} value={m}>
                                {m}
                              </option>
                            ))}
                          </optgroup>
                          <optgroup label="🌾 Edirne Köyleri">
                            {EDIRNE_VILLAGES_LIST.map((k) => (
                              <option key={k} value={k}>
                                {k}
                              </option>
                            ))}
                          </optgroup>
                        </select>
                      )}
                    </div>

                    {/* Açık Adres / Sokak / Kapı No */}
                    <div className="sm:col-span-5 space-y-1">
                      <label className="text-[10px] font-extrabold uppercase text-slate-700 block">
                        Açık Adres (Sokak, Bina No, Kapı No){' '}
                        <span className="text-rose-600">*</span>
                      </label>
                      <input
                        type="text"
                        value={item.acik_adres}
                        onChange={(e) => handleInputChange(item.id, 'acik_adres', e.target.value)}
                        placeholder="Örn: Atatürk Cad. No: 14 Daire: 2 veya Köy İçi No: 25"
                        className="w-full px-3 py-2 rounded-xl bg-white border border-slate-300 text-xs font-semibold text-slate-900 placeholder:text-slate-400 focus:outline-none focus:border-amber-500 focus:ring-1 focus:ring-amber-500"
                      />
                    </div>

                    {/* Kaydet Butonu */}
                    <div className="sm:col-span-2">
                      <button
                        type="button"
                        onClick={() => handleSaveSingle(item)}
                        disabled={isSavingThis}
                        className="w-full py-2.5 px-3 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-black text-xs flex items-center justify-center gap-1.5 shadow-xs active:scale-95 transition-all disabled:opacity-50"
                      >
                        {isSavingThis ? (
                          <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                        ) : (
                          <>
                            <Check className="w-3.5 h-3.5" />
                            <span>Kaydet</span>
                          </>
                        )}
                      </button>
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Alt Butonlar & Durum Bilgisi */}
        <div className="pt-2 border-t border-slate-100 flex items-center justify-between gap-2 shrink-0">
          <span className="text-[11px] text-slate-500 font-semibold">
            {remainingItems.length > 0
              ? `${remainingItems.length} hanenin adresi bekleniyor. Kaydedilenler anında ilgili mahalle listesine taşınır.`
              : 'Tüm adresler başarıyla kaydedildi.'}
          </span>

          <button
            type="button"
            onClick={onClose}
            className="px-5 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-white font-black text-xs transition-all active:scale-95 shadow-xs"
          >
            {isAllSaved ? 'Tamamlandı, Kapat' : 'Kapat'}
          </button>
        </div>
      </div>
    </div>
  );
}
