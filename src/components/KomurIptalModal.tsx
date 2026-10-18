'use client';

import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Ban, CheckCircle2, AlertTriangle, X, Shield, FileSpreadsheet, FileText, MapPin, Phone } from 'lucide-react';
import { getBeneficiaryListTypeInfo, formatPhoneDisplay } from '@/lib/normalizer';
import { showToast } from './GlobalAlertManager';

interface KomurIptalModalProps {
  beneficiary: any;
  currentStaff: string;
  onClose: () => void;
  onSuccess: (updated: any) => void;
}

const QUICK_REASONS = [
  'Eşi Kömür Aldı (Mükerrer Hane)',
  'Doğalgaza Geçti',
  'Adresten Taşındı / İl Dışı',
  'Vefat Etti',
  'Kendi İsteğiyle Feragat Etti',
  'Sosyal Güvence / Gelir Kriteri Değişti',
  'Diğer (Açıklama Belirtiniz)'
];

export default function KomurIptalModal({
  beneficiary,
  currentStaff,
  onClose,
  onSuccess
}: KomurIptalModalProps) {
  const isAlreadyCancelled = Boolean(beneficiary?.komur_verilmeyecek);
  
  const [selectedQuickReason, setSelectedQuickReason] = useState<string>(
    isAlreadyCancelled ? (beneficiary?.komur_iptal_nedeni || '') : QUICK_REASONS[0]
  );
  const [customReason, setCustomReason] = useState<string>('');
  const [aciklama, setAciklama] = useState<string>(
    isAlreadyCancelled ? (beneficiary?.komur_iptal_aciklama || '') : ''
  );
  const [personel, setPersonel] = useState<string>(currentStaff || 'Yetkili Personel');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const listInfo = getBeneficiaryListTypeInfo(beneficiary);

  const handleCancelSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const finalReason = selectedQuickReason === 'Diğer (Açıklama Belirtiniz)'
      ? (customReason.trim() || aciklama.trim() || 'Diğer Gerekçe')
      : selectedQuickReason;

    if (!finalReason) {
      setErrorMsg('Lütfen kömür iptal gerekçesini belirtiniz');
      return;
    }

    setIsSubmitting(true);
    setErrorMsg('');

    try {
      const res = await fetch('/api/beneficiaries', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'KOMUR_IPTAL',
          id: beneficiary.id || beneficiary._id,
          neden: finalReason,
          aciklama: aciklama.trim(),
          personel: personel.trim()
        })
      });

      const data = await res.json();
      if (!data.success) {
        throw new Error(data.error || 'İşlem başarısız oldu');
      }

      showToast({
        type: 'success',
        title: 'Kömür Yardımı İptal Edildi',
        message: `${beneficiary.ad_soyad} için kömür yardımı iptal edildi ve Kömür Verilmeyecekler listesine eklendi.`
      });

      onSuccess(data.beneficiary);
    } catch (err: any) {
      setErrorMsg(err.message || 'Bağlantı hatası oluştu');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleRestoreSubmit = async () => {
    setIsSubmitting(true);
    setErrorMsg('');

    try {
      const res = await fetch('/api/beneficiaries', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'KOMUR_IPTAL_GERI_AL',
          id: beneficiary.id || beneficiary._id,
          personel: personel.trim()
        })
      });

      const data = await res.json();
      if (!data.success) {
        throw new Error(data.error || 'İptal geri alma işlemi başarısız oldu');
      }

      showToast({
        type: 'success',
        title: 'Kömür Yardımı Yeniden Aktif',
        message: `${beneficiary.ad_soyad} için kömür iptali kaldırıldı ve hak sahipliği yeniden aktif edildi.`
      });

      onSuccess(data.beneficiary);
    } catch (err: any) {
      setErrorMsg(err.message || 'Bağlantı hatası oluştu');
    } finally {
      setIsSubmitting(false);
    }
  };

  const modalContent = (
    <div className="modal-overlay" style={{ zIndex: 250 }} onClick={onClose}>
      <div 
        className="modal-sheet max-w-xl max-h-[90vh] overflow-y-auto" 
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal Başlık */}
        <div className="flex items-center justify-between pb-3 border-b border-slate-200 mb-4">
          <div className="flex items-center gap-2.5">
            <div className={`w-9 h-9 rounded-xl flex items-center justify-center border shadow-2xs ${
              isAlreadyCancelled
                ? 'bg-rose-100 text-rose-800 border-rose-300'
                : 'bg-rose-50 text-rose-700 border-rose-200'
            }`}>
              <Ban className="w-5 h-5 text-rose-600" />
            </div>
            <div>
              <h3 className="text-base font-black text-slate-900">
                {isAlreadyCancelled ? 'Kömür İptal Kaydı & Gerekçesi' : 'Kömür Yardımı İptal (Kömür Verilmeyecek)'}
              </h3>
              <p className="text-xs text-slate-500">
                {isAlreadyCancelled 
                  ? 'Kömür verilmeme nedeni ve hak sahipliği durumu' 
                  : 'Eşi kömür almış, doğalgaza geçmiş vb. hak sahipliği iptal formu'}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-700 p-1.5 rounded-lg text-sm transition-colors"
            title="Kapat"
          >
            ✕
          </button>
        </div>

        {/* Hak Sahibi Özet Kartı */}
        <div className="p-3.5 rounded-2xl bg-slate-50 border border-slate-200 mb-4 space-y-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <span className="text-base font-extrabold text-slate-900">{beneficiary.ad_soyad}</span>
              <span className="text-xs font-mono font-bold text-amber-900 bg-amber-100/90 px-2 py-0.5 rounded border border-amber-300">
                TC: {beneficiary.tc_no}
              </span>
            </div>

            <span className={`text-[11px] font-bold px-2 py-0.5 rounded-lg border flex items-center gap-1 ${listInfo.badgeClass}`}>
              {listInfo.type === 'SIGORTALI' && <Shield className="w-3 h-3 text-purple-600" />}
              {listInfo.type === 'EK_LISTE' && <FileSpreadsheet className="w-3 h-3 text-indigo-600" />}
              {listInfo.type === 'ANA_LISTE' && <FileText className="w-3 h-3 text-emerald-600" />}
              <span>{listInfo.label}</span>
            </span>
          </div>

          <div className="text-xs text-slate-600 flex flex-wrap items-center gap-1.5">
            <MapPin className="w-3.5 h-3.5 text-amber-600 shrink-0" />
            <strong className="text-slate-800">{beneficiary.mahalle}</strong>
            {beneficiary.sokak && <span>- {beneficiary.sokak}</span>}
            {beneficiary.kapi_no && <span>No: {beneficiary.kapi_no}</span>}
            {beneficiary.acik_adres && (
              <span className="text-slate-500 block w-full mt-0.5 pl-5 text-[11px] truncate">
                {beneficiary.acik_adres}
              </span>
            )}
          </div>

          {beneficiary.telefon && (
            <div className="text-xs text-emerald-800 flex items-center gap-1.5 pt-1 border-t border-slate-200/80">
              <Phone className="w-3 h-3 text-emerald-600" />
              <span className="font-mono font-bold">{formatPhoneDisplay(beneficiary.telefon)}</span>
            </div>
          )}
        </div>

        {/* Hata Mesajı */}
        {errorMsg && (
          <div className="p-3 mb-4 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs font-bold flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
            <span>{errorMsg}</span>
          </div>
        )}

        {/* EĞER ZATEN İPTAL EDİLMİŞSE: Mevcut Gerekçe Bilgisi ve Yeniden Aktif Etme Seçeneği */}
        {isAlreadyCancelled ? (
          <div className="space-y-4">
            <div className="p-4 rounded-2xl bg-rose-50 border-2 border-rose-300 text-rose-950 space-y-2.5 shadow-2xs">
              <div className="flex items-center gap-2 text-rose-800 font-black text-sm">
                <Ban className="w-5 h-5 text-rose-600 shrink-0" />
                <span>Bu Hak Sahibine Kömür Yardımı İptal Edilmiştir</span>
              </div>

              <div className="space-y-1.5 text-xs pt-1 border-t border-rose-200">
                <div>
                  <span className="text-rose-700 font-bold">İptal / Verilmeme Nedeni:</span>
                  <p className="text-rose-950 font-extrabold text-sm mt-0.5 bg-white p-2.5 rounded-xl border border-rose-200">
                    {beneficiary.komur_iptal_nedeni || 'Belirtilmedi'}
                  </p>
                </div>

                {beneficiary.komur_iptal_aciklama && (
                  <div className="mt-2">
                    <span className="text-rose-700 font-bold">Detaylı Açıklama:</span>
                    <p className="text-rose-900 font-medium text-xs mt-0.5 bg-white/80 p-2.5 rounded-xl border border-rose-200 whitespace-pre-wrap">
                      {beneficiary.komur_iptal_aciklama}
                    </p>
                  </div>
                )}

                <div className="flex flex-wrap items-center justify-between gap-2 pt-2 text-[11px] text-rose-700">
                  {beneficiary.komur_iptal_eden && (
                    <span>İşlemi Yapan Yetkili: <strong className="text-rose-950">{beneficiary.komur_iptal_eden}</strong></span>
                  )}
                  {beneficiary.komur_iptal_tarihi && (
                    <span>İptal Tarihi: <strong className="font-mono text-rose-950">{beneficiary.komur_iptal_tarihi}</strong></span>
                  )}
                </div>
              </div>
            </div>

            <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 text-xs text-slate-600 leading-relaxed">
              Bu vatandaşın durumu değiştiyse (örneğin taşınmaktan vazgeçti, eşiyle ayrı ikamet ediyor veya resmi itirazı kabul edildi) iptali kaldırarak hak sahibini tekrar normal dağıtım listesine alabilirsiniz.
            </div>

            <div className="pt-2 flex gap-3">
              <button
                type="button"
                onClick={onClose}
                disabled={isSubmitting}
                className="btn-secondary flex-1"
              >
                Pencereyi Kapat
              </button>
              <button
                type="button"
                onClick={handleRestoreSubmit}
                disabled={isSubmitting}
                className="flex-1 py-2.5 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold text-xs flex items-center justify-center gap-1.5 shadow-md shadow-emerald-600/20 active:scale-95 transition-all disabled:opacity-50"
              >
                {isSubmitting ? (
                  <span>İşlem Yapılıyor...</span>
                ) : (
                  <>
                    <CheckCircle2 className="w-4 h-4" />
                    <span>İptali Kaldır (Yeniden Aktif Et)</span>
                  </>
                )}
              </button>
            </div>
          </div>
        ) : (
          /* AKTİF KAYIT İÇİN: Kömür İptal Formu */
          <form onSubmit={handleCancelSubmit} className="space-y-4">
            {/* Bilgilendirme Notu */}
            <div className="p-3 rounded-xl bg-amber-50 border border-amber-200 text-xs text-amber-950 leading-relaxed">
              <strong className="font-bold text-amber-900 block mb-0.5">Önemli Bilgilendirme:</strong>
              Bu işlem, hak sahibinin kömür tahsisini iptal eder. Kayıt <strong>&ldquo;Kömür Verilmeyecekler&rdquo;</strong> listesinde gerekçesiyle saklanır ve dağıtım rotalarından çıkarılır.
              <span className="block text-[11px] text-amber-800 mt-1 font-semibold">
                (Not: Bu işlem hatalı teslimat geri alma tutanağı değildir; hak sahipliğinin iptalidir.)
              </span>
            </div>

            {/* İptal Nedeni Hızlı Seçim */}
            <div>
              <label className="block text-xs font-black text-rose-800 uppercase tracking-wider mb-2">
                Kömür Verilmeme / İptal Gerekçesi (Zorunlu)
              </label>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 mb-2.5">
                {QUICK_REASONS.map((reason) => {
                  const isSelected = selectedQuickReason === reason;
                  return (
                    <button
                      key={reason}
                      type="button"
                      onClick={() => {
                        setSelectedQuickReason(reason);
                        if (reason !== 'Diğer (Açıklama Belirtiniz)') {
                          setCustomReason('');
                        }
                      }}
                      className={`py-2 px-2.5 rounded-xl text-xs font-bold text-left border transition-all flex items-center justify-between ${
                        isSelected
                          ? 'bg-rose-50 border-rose-400 text-rose-950 ring-2 ring-rose-300 font-black shadow-2xs'
                          : 'bg-white hover:bg-slate-50 border-slate-200 text-slate-700'
                      }`}
                    >
                      <span className="truncate">{reason}</span>
                      {isSelected && <Ban className="w-3.5 h-3.5 text-rose-600 shrink-0 ml-1" />}
                    </button>
                  );
                })}
              </div>

              {selectedQuickReason === 'Diğer (Açıklama Belirtiniz)' && (
                <div className="mt-2">
                  <input
                    type="text"
                    value={customReason}
                    onChange={(e) => setCustomReason(e.target.value)}
                    placeholder="Özel gerekçe başlığı giriniz..."
                    className="w-full px-3.5 py-2 rounded-xl bg-white border border-rose-300 text-slate-900 text-xs font-bold focus:outline-none focus:border-rose-500 focus:ring-2 focus:ring-rose-200 shadow-2xs"
                    required
                  />
                </div>
              )}
            </div>

            {/* Detaylı Açıklama */}
            <div>
              <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                Detaylı Açıklama & Saha Notu (İsteğe Bağlı / Önerilir)
              </label>
              <textarea
                rows={3}
                value={aciklama}
                onChange={(e) => setAciklama(e.target.value)}
                placeholder="Örn: Eşi Ahmet Demir 14.10.2026 tarihinde Barutluk Mahallesindeki haneye 34 torba teslim aldı. Mükerrer teslimat olmaması için bu kayıt iptal edildi."
                className="w-full px-3.5 py-2.5 rounded-xl bg-white border border-slate-300 text-slate-900 placeholder-slate-400 text-xs focus:outline-none focus:border-amber-500 focus:ring-2 focus:ring-amber-200 shadow-2xs"
              />
            </div>

            {/* Yetkili Personel Adı */}
            <div>
              <label className="block text-xs font-bold text-slate-600 uppercase tracking-wider mb-1.5">
                İşlemi Yapan Yetkili / Personel
              </label>
              <input
                type="text"
                value={personel}
                onChange={(e) => setPersonel(e.target.value)}
                className="w-full px-3.5 py-2 rounded-xl bg-slate-50 border border-slate-300 text-slate-900 font-bold text-xs focus:outline-none focus:border-amber-500 focus:bg-white"
                required
              />
            </div>

            {/* İşlem Butonları */}
            <div className="pt-2 flex gap-3">
              <button
                type="button"
                onClick={onClose}
                disabled={isSubmitting}
                className="btn-secondary flex-1"
              >
                Vazgeç
              </button>
              <button
                type="submit"
                disabled={isSubmitting}
                className="flex-1 py-2.5 px-4 rounded-xl bg-rose-600 hover:bg-rose-700 text-white font-extrabold text-xs flex items-center justify-center gap-1.5 shadow-md shadow-rose-600/20 active:scale-95 transition-all disabled:opacity-50"
              >
                {isSubmitting ? (
                  <span>İşlem Yapılıyor...</span>
                ) : (
                  <>
                    <Ban className="w-4 h-4" />
                    <span>Kömür Verilmeyecek Olarak İşaretle</span>
                  </>
                )}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );

  if (mounted && typeof document !== 'undefined') {
    return createPortal(modalContent, document.body);
  }

  return modalContent;
}
