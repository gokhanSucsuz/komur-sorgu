'use client';

import { useState, useEffect } from 'react';
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
} from 'lucide-react';
import { showToast } from './GlobalAlertManager';
import { EDIRNE_NEIGHBORHOODS_LIST, EDIRNE_VILLAGES_LIST } from '@/lib/normalizer';

export interface MissingAddressBeneficiary {
  id: string;
  tc_no: string;
  ad_soyad: string;
  mahalle: string;
  acik_adres: string;
  telefon?: string;
}

interface MissingAddressModalProps {
  isOpen: boolean;
  onClose: () => void;
  missingBeneficiaries: MissingAddressBeneficiary[];
  onUpdated: () => void;
  userName?: string;
}

export default function MissingAddressModal({
  isOpen,
  onClose,
  missingBeneficiaries,
  onUpdated,
  userName = 'Yönetici',
}: MissingAddressModalProps) {
  // Local editable state for each beneficiary
  const [items, setItems] = useState<MissingAddressBeneficiary[]>([]);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [savedIds, setSavedIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (isOpen) {
      setItems(
        missingBeneficiaries.map((b) => ({
          ...b,
          mahalle: b.mahalle && !b.mahalle.toLowerCase().includes('belirtilme') && b.mahalle !== 'Genel' ? b.mahalle : '',
          acik_adres: b.acik_adres && !b.acik_adres.toLowerCase().includes('belirtilme') ? b.acik_adres : '',
        }))
      );
      setSavedIds(new Set());
    }
  }, [isOpen, missingBeneficiaries]);

  if (!isOpen) return null;

  const handleInputChange = (id: string, field: 'mahalle' | 'acik_adres', value: string) => {
    setItems((prev) =>
      prev.map((item) => (item.id === id ? { ...item, [field]: value } : item))
    );
  };

  const handleSaveSingle = async (item: MissingAddressBeneficiary) => {
    if (!item.mahalle || !item.mahalle.trim()) {
      showToast({
        type: 'warning',
        title: 'Mahalle Seçimi Gerekli',
        message: `${item.ad_soyad} için lütfen bir mahalle veya köy seçiniz.`,
      });
      return;
    }

    if (!item.acik_adres || !item.acik_adres.trim()) {
      showToast({
        type: 'warning',
        title: 'Açık Adres Gerekli',
        message: `${item.ad_soyad} için lütfen sokak, bina ve kapı numarası giriniz.`,
      });
      return;
    }

    setSavingId(item.id);
    try {
      const res = await fetch('/api/beneficiaries', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: item.id,
          mahalle: item.mahalle.trim(),
          acik_adres: item.acik_adres.trim(),
          guncelleme_notu: `İmza listesi öncesi adres eksikliği giderildi: ${item.mahalle} - ${item.acik_adres}`,
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
        message: `${item.ad_soyad} kaydı "${item.mahalle}" listesine aktarıldı.`,
      });
      onUpdated();
    } catch (err: any) {
      showToast({
        type: 'error',
        title: 'Güncelleme Hatası',
        message: err.message || 'Adres kaydedilirken bir hata oluştu.',
      });
    } finally {
      setSavingId(null);
    }
  };

  const remainingItems = items.filter((item) => !savedIds.has(item.id));
  const isAllSaved = items.length > 0 && remainingItems.length === 0;

  return (
    <div
      className="fixed inset-0 z-[10000] bg-slate-950/75 backdrop-blur-xs flex items-center justify-center p-3 sm:p-5 overflow-y-auto no-print"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-3xl border border-slate-200 shadow-2xl max-w-3xl w-full p-4 sm:p-6 space-y-4 my-auto max-h-[92vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Üst Başlık */}
        <div className="flex items-start justify-between gap-3 border-b border-slate-100 pb-3 shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-amber-500 text-white flex items-center justify-center shrink-0 shadow-xs">
              <MapPin className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-sm sm:text-base font-black text-slate-900">
                  Adresi Eksik Hak Sahipleri — Hızlı Adres Girişi
                </h3>
                <span className="px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 text-[10px] font-black border border-amber-300">
                  {remainingItems.length} Hane Kaldı
                </span>
              </div>
              <p className="text-[11px] text-slate-500 font-semibold mt-0.5">
                Islak imza listesi çıktısı alınmadan önce bu hanelerin mahallelerini belirleyin
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-600 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Bilgilendirme Kutusu */}
        <div className="p-3 rounded-2xl bg-amber-50/80 border border-amber-200 text-xs text-amber-950 flex items-start gap-2.5 shrink-0">
          <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
          <p className="text-[11px] leading-relaxed font-medium">
            Aşağıdaki kayıtların adres bilgisi Excel dosyasında boş bırakılmış veya eksik girilmiştir. Buradan vatandaşların hangi mahallede ikamet ettiğini ve açık adresini seçip kaydederseniz, kayıtlar <strong>kendi mahallesinin ıslak imza listesine</strong> dahil edilir. Güncellenmeyen kayıtlar ise imza listesi Excel dosyasında <strong>&quot;ADRESİ OLMAYANLAR&quot;</strong> sekmesinde toplanacaktır.
          </p>
        </div>

        {/* Liste Alanı */}
        <div className="flex-1 overflow-y-auto space-y-3 pr-1 min-h-[220px]">
          {isAllSaved ? (
            <div className="p-8 text-center space-y-3 my-auto">
              <div className="w-14 h-14 rounded-3xl bg-emerald-100 text-emerald-700 flex items-center justify-center mx-auto shadow-xs">
                <CheckCircle2 className="w-8 h-8" />
              </div>
              <h4 className="text-base font-black text-slate-900">
                🎉 Harika! Tüm Adresler Başarıyla Güncellendi
              </h4>
              <p className="text-xs text-slate-600 font-medium max-w-md mx-auto">
                Tüm hak sahiplerinin mahalle ve adres bilgileri eksiksiz kaydedildi. Artık ıslak imza listesini hatasız ve tam mahalle sıralı olarak indirebilirsiniz.
              </p>
              <div className="pt-2">
                <button
                  type="button"
                  onClick={onClose}
                  className="px-6 py-2.5 rounded-2xl bg-slate-900 hover:bg-slate-800 text-white font-black text-xs shadow-xs active:scale-95 transition-all"
                >
                  Tamamlandı, Pencereyi Kapat
                </button>
              </div>
            </div>
          ) : (
            remainingItems.map((item, idx) => (
              <div
                key={item.id}
                className="p-3.5 rounded-2xl bg-slate-50 border border-slate-200 hover:border-slate-300 transition-all space-y-2.5"
              >
                {/* Kişi Bilgisi */}
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200/60 pb-2">
                  <div className="flex items-center gap-2">
                    <span className="w-5 h-5 rounded-lg bg-amber-500 text-white flex items-center justify-center text-[10px] font-black shrink-0">
                      {idx + 1}
                    </span>
                    <span className="text-xs font-black text-slate-900">{item.ad_soyad}</span>
                    <span className="text-[11px] font-mono font-bold text-slate-500 bg-white px-2 py-0.5 rounded border border-slate-200">
                      T.C.: {item.tc_no}
                    </span>
                  </div>
                  {item.telefon && (
                    <span className="text-[10px] font-semibold text-slate-600 flex items-center gap-1">
                      <Phone className="w-3 h-3 text-slate-400" />
                      <span>{item.telefon}</span>
                    </span>
                  )}
                </div>

                {/* Düzenleme Alanları */}
                <div className="grid grid-cols-1 sm:grid-cols-12 gap-2.5 items-end">
                  {/* Mahalle Seçimi */}
                  <div className="sm:col-span-5 space-y-1">
                    <label className="text-[10px] font-extrabold uppercase text-slate-600 block">
                      Mahalle / Köy <span className="text-rose-600">*</span>
                    </label>
                    <select
                      value={item.mahalle}
                      onChange={(e) => handleInputChange(item.id, 'mahalle', e.target.value)}
                      className="w-full px-2.5 py-2 rounded-xl bg-white border border-slate-300 text-xs font-bold text-slate-900 focus:outline-none focus:border-amber-500 focus:ring-1 focus:ring-amber-500"
                    >
                      <option value="">-- Mahalle / Köy Seçiniz --</option>
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
                  </div>

                  {/* Açık Adres / Sokak / Kapı No */}
                  <div className="sm:col-span-5 space-y-1">
                    <label className="text-[10px] font-extrabold uppercase text-slate-600 block">
                      Açık Adres (Sokak / No) <span className="text-rose-600">*</span>
                    </label>
                    <input
                      type="text"
                      value={item.acik_adres}
                      onChange={(e) => handleInputChange(item.id, 'acik_adres', e.target.value)}
                      placeholder="Örn: Atatürk Bulvarı No: 14 Daire: 2"
                      className="w-full px-2.5 py-2 rounded-xl bg-white border border-slate-300 text-xs font-semibold text-slate-900 placeholder:text-slate-400 focus:outline-none focus:border-amber-500 focus:ring-1 focus:ring-amber-500"
                    />
                  </div>

                  {/* Kaydet Butonu */}
                  <div className="sm:col-span-2">
                    <button
                      type="button"
                      onClick={() => handleSaveSingle(item)}
                      disabled={savingId === item.id}
                      className="w-full py-2 px-3 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-black text-xs flex items-center justify-center gap-1 shadow-xs active:scale-95 transition-all disabled:opacity-50"
                    >
                      {savingId === item.id ? (
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
            ))
          )}
        </div>

        {/* Alt Butonlar */}
        <div className="pt-2 border-t border-slate-100 flex items-center justify-between gap-2 shrink-0">
          <span className="text-[11px] text-slate-500 font-semibold">
            {remainingItems.length > 0
              ? `Kaydedilenler anında kendi mahalle listesine taşınır.`
              : 'Tüm adresler kaydedildi.'}
          </span>

          <button
            type="button"
            onClick={onClose}
            className="px-5 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-white font-black text-xs transition-all active:scale-95"
          >
            Kapat
          </button>
        </div>
      </div>
    </div>
  );
}
