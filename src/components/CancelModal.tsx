'use client';

import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { AlertTriangle, Undo2, X } from 'lucide-react';

interface CancelModalProps {
  beneficiary: any;
  currentStaff: string;
  onClose: () => void;
  onSuccess: (updated: any) => void;
}

export default function CancelModal({
  beneficiary,
  currentStaff,
  onClose,
  onSuccess
}: CancelModalProps) {
  const [iptalNedeni, setIptalNedeni] = useState('');
  const [personel, setPersonel] = useState(currentStaff || 'Personel');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  const quickReasons = [
    'Yanlış kişiye tıklandı (Hatalı Giriş)',
    'Adreste kimse bulunamadı',
    'Adres/Hane bilgisi yanlış',
    'Vatandaş teslimatı reddetti'
  ];

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
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
          iptal_nedeni: iptalNedeni
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
              disabled={isSubmitting}
              className="btn-danger flex-1 font-bold"
            >
              {isSubmitting ? 'İptal Ediliyor...' : (
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
