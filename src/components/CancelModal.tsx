'use client';

import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { AlertTriangle, Undo2, Lock } from 'lucide-react';
import { isPastDeliveryDate } from '@/lib/dateUtils';

interface CancelModalProps {
  beneficiary: any;
  currentStaff: string;
  userRole?: 'ADMIN' | 'PERSONEL' | 'MUDUR';
  onClose: () => void;
  onSuccess: (updated: any) => void;
}

export default function CancelModal({
  beneficiary,
  currentStaff,
  userRole = 'PERSONEL',
  onClose,
  onSuccess
}: CancelModalProps) {
  const isSigned = beneficiary?.imza_durumu === 'IMZALANDI' || Boolean(beneficiary?.imza_tarihi);
  const [iptalNedeni, setIptalNedeni] = useState('');
  const [personel, setPersonel] = useState(currentStaff || 'Personel');
  const [revokeSignature, setRevokeSignature] = useState(isSigned);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  const deliveryDate = beneficiary?.teslimat_tarihi || beneficiary?.gun_tarihi || beneficiary?.tarih;
  const isPastDelivery = isPastDeliveryDate(deliveryDate);
  const isBlockedByRole = isPastDelivery && userRole !== 'ADMIN';

  const quickReasons = [
    'Yanlış kişiye tıklandı (Hatalı Giriş)',
    'Adreste kimse bulunamadı',
    'Adres/Hane bilgisi yanlış',
    'Vatandaş teslimatı reddetti'
  ];

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isBlockedByRole) {
      setErrorMsg('Geçmiş günlere ait kömür teslimatlarının iptal işlemi yalnızca Sistem Yöneticisi (ADMIN) yetkisindedir. Personel sadece aynı gün teslimatlarını iptal edebilir.');
      return;
    }
    if (!iptalNedeni.trim()) {
      setErrorMsg('Lütfen iptal gerekçesini belirtiniz');
      return;
    }

    setIsSubmitting(true);
    setErrorMsg('');

    try {
      const res = await fetch('/api/delivery', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'IPTAL',
          beneficiary_id: beneficiary.beneficiary_id || beneficiary.id,
          tc_no: beneficiary.tc_no,
          personel: personel,
          iptal_nedeni: iptalNedeni,
          revoke_signature: revokeSignature
        })
      });

      const data = await res.json();
      if (!data.success) {
        throw new Error(data.error || 'İptal işlemi başarısız oldu');
      }

      onSuccess(data.beneficiary);
    } catch (err: any) {
      setErrorMsg(err.message || 'Bağlantı hatası');
    } finally {
      setIsSubmitting(false);
    }
  };

  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    setMounted(true);
  }, []);

  const modalContent = (
    <div className="modal-overlay" style={{ zIndex: 200 }} onClick={onClose}>
      <div className="modal-sheet" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between pb-3 border-b border-slate-200 mb-4">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-rose-100 text-rose-700 flex items-center justify-center border border-rose-200">
              <AlertTriangle className="w-5 h-5 text-rose-600" />
            </div>
            <div>
              <h3 className="text-base font-extrabold text-slate-900">Teslimatı İptal Et</h3>
              <p className="text-xs text-slate-500">Hatalı teslimat geri alma tutanağı</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-700 p-1 rounded-lg text-sm"
          >
            ✕
          </button>
        </div>

        {/* Citizen Brief Box */}
        <div className="p-3.5 rounded-2xl bg-slate-50 border border-slate-200 mb-4 space-y-1">
          <div className="flex items-center justify-between">
            <span className="text-sm font-extrabold text-slate-900">{beneficiary.ad_soyad}</span>
            <span className="text-xs font-mono text-slate-600 font-bold bg-white px-2 py-0.5 rounded border border-slate-200">
              TC: {beneficiary.tc_no}
            </span>
          </div>
          <p className="text-xs text-slate-600">
            {beneficiary.mahalle} - {beneficiary.acik_adres}
          </p>
          <div className="mt-2 text-xs text-amber-900 bg-amber-50 px-2.5 py-1.5 rounded-xl border border-amber-200 font-medium">
            Bu işlem teslimat durumunu tekrar <strong>BEKLİYOR</strong> yapacak ve iptal arşivine kaydedecektir.
          </div>
        </div>

        {isBlockedByRole && (
          <div className="p-3 mb-4 rounded-xl bg-amber-50 border border-amber-300 text-amber-950 text-xs font-semibold flex items-start gap-2 shadow-xs">
            <Lock className="w-4 h-4 text-amber-700 shrink-0 mt-0.5" />
            <div>
              <strong className="text-amber-900 block font-bold">Yetki Sınırı: Geçmiş Gün Teslimat İptali (Sadece Yönetici)</strong>
              <p className="mt-0.5 font-normal text-amber-800 leading-relaxed">
                Bu hanenin kömür teslimatı önceki bir tarihte ({deliveryDate || 'geçmiş gün'}) yapılmıştır. Güvenlik kuralları gereğince, günü geçmiş teslimatların iptali yalnızca <strong>Sistem Yöneticisi (ADMIN)</strong> yetkisindedir. Saha personeli sadece aynı gün yapılan teslimatları iptal edebilir, geçmiş kayıtları yalnızca görüntüleyebilir.
              </p>
            </div>
          </div>
        )}

        {errorMsg && (
          <div className="p-3 mb-4 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs font-semibold">
            {errorMsg}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-bold text-rose-700 uppercase tracking-wider mb-1.5">
              İptal Gerekçesi (Zorunlu)
            </label>
            <textarea
              rows={3}
              value={iptalNedeni}
              onChange={(e) => setIptalNedeni(e.target.value)}
              placeholder="Örn: Butona yanlışlıkla basıldı veya adreste kimseye ulaşılamadı"
              className="w-full px-3.5 py-2.5 rounded-xl bg-slate-50 border border-rose-300 text-slate-900 placeholder-slate-400 text-sm focus:outline-none focus:border-rose-500 focus:bg-white"
              required
            />
            <div className="flex flex-wrap gap-1.5 mt-2">
              {quickReasons.map((reason) => (
                <button
                  key={reason}
                  type="button"
                  onClick={() => setIptalNedeni(reason)}
                  className="px-2.5 py-1 rounded-lg bg-slate-100 hover:bg-slate-200 border border-slate-200 text-[11px] text-slate-700 font-semibold"
                >
                  {reason}
                </button>
              ))}
            </div>
          </div>

          {/* Hak Sahibi İmza Durumu & Geri Çekme Seçimi */}
          <div className="p-3.5 rounded-2xl bg-amber-50/90 border border-amber-300 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-amber-950 flex items-center gap-1.5">
                <span>✍️</span>
                <span>Hak Sahibi Kapıda İmza Durumu</span>
              </span>
              <span
                className={`text-[11px] font-bold px-2.5 py-0.5 rounded-full border ${
                  isSigned
                    ? 'bg-emerald-100 text-emerald-800 border-emerald-300'
                    : 'bg-slate-100 text-slate-600 border-slate-300'
                }`}
              >
                {isSigned ? '✓ Islak İmza Alınmış' : '⏳ İmza Yok / Bekliyor'}
              </span>
            </div>

            <p className="text-xs text-amber-950 font-semibold leading-relaxed">
              Hak sahibinin imzasını da geri çekmek ister misiniz?
            </p>

            <div className="grid grid-cols-2 gap-2 pt-1">
              <button
                type="button"
                onClick={() => setRevokeSignature(true)}
                className={`px-3 py-2.5 rounded-xl text-xs font-black border text-left transition-all flex items-center gap-2 cursor-pointer ${
                  revokeSignature
                    ? 'bg-rose-600 text-white border-rose-700 shadow-xs'
                    : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
                }`}
              >
                <span className="text-sm">✓</span>
                <span>Evet, İmzayı da Geri Çek</span>
              </button>
              <button
                type="button"
                onClick={() => setRevokeSignature(false)}
                className={`px-3 py-2.5 rounded-xl text-xs font-bold border text-left transition-all flex items-center gap-2 cursor-pointer ${
                  !revokeSignature
                    ? 'bg-slate-800 text-white border-slate-900 shadow-xs'
                    : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
                }`}
              >
                <span className="text-sm">✕</span>
                <span>Hayır, İmza Kalsın</span>
              </button>
            </div>

            <p className="text-[11px] text-amber-900/80 font-medium leading-tight pt-0.5">
              {revokeSignature
                ? 'ℹ️ Teslimat geri alınırken hak sahibinin kapıda alınan ıslak imzası da iptal edilecek ve imza durumu "BEKLİYOR" yapılacaktır.'
                : 'ℹ️ Kömür teslimatı iptal edilecek ancak vatandaşın daha önce verdiği imza sistemde geçerli kalacaktır.'}
            </p>
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-600 uppercase tracking-wider mb-1.5">
              İptal Eden Yetkili / Personel
            </label>
            <input
              type="text"
              value={personel}
              onChange={(e) => setPersonel(e.target.value)}
              className="w-full px-3.5 py-2.5 rounded-xl bg-slate-50 border border-slate-300 text-slate-900 placeholder-slate-400 focus:outline-none focus:border-amber-500 focus:bg-white font-medium"
              required
            />
          </div>

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
              disabled={isSubmitting || isBlockedByRole}
              className={`btn-danger flex-1 font-bold ${isBlockedByRole ? 'opacity-50 cursor-not-allowed bg-slate-400 hover:bg-slate-400 border-slate-400' : ''}`}
            >
              {isBlockedByRole ? (
                <>
                  <Lock className="w-4 h-4" />
                  İptal Yetkisi Yok (Sadece Yönetici)
                </>
              ) : isSubmitting ? 'İptal Ediliyor...' : (
                <>
                  <Undo2 className="w-4 h-4" />
                  İptali Onayla
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );

  if (mounted && typeof document !== 'undefined') {
    return createPortal(modalContent, document.body);
  }

  return modalContent;
}
