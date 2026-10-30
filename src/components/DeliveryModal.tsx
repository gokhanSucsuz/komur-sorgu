'use client';

import { useState } from 'react';
import { PackageCheck, Minus, Plus, User, MapPin, AlertCircle, CheckCircle2, AlertTriangle, PackagePlus, PenTool } from 'lucide-react';
import { saveOfflineDelivery } from '@/lib/offlineSync';
import { showAlert } from './GlobalAlertManager';
import { getBeneficiaryListTypeInfo } from '@/lib/normalizer';

interface DeliveryModalProps {
  beneficiary: any;
  currentStaff: string;
  defaultQuota?: number;
  onClose: () => void;
  onSuccess: (updated: any) => void;
}

export default function DeliveryModal({
  beneficiary,
  currentStaff,
  defaultQuota = 34,
  onClose,
  onSuccess
}: DeliveryModalProps) {
  const hedefTorba = beneficiary.hedef_torba || defaultQuota;
  const mevcutTorba = beneficiary.torba_sayisi || 0;
  const kalanTorba = Math.max(0, hedefTorba - mevcutTorba);

  const initialDeliveryAmount = kalanTorba > 0 ? (mevcutTorba > 0 ? kalanTorba : hedefTorba) : hedefTorba;

  const [torbaSayisi, setTorbaSayisi] = useState(initialDeliveryAmount);
  const [deliveryMode, setDeliveryMode] = useState<'REMAINING' | 'CUSTOM'>(mevcutTorba > 0 ? 'REMAINING' : 'CUSTOM');
  const [teslimAlan, setTeslimAlan] = useState(`${beneficiary.ad_soyad} (Kendisi)`);
  const [personel, setPersonel] = useState(currentStaff || 'Saha Personeli');
  const [notlar, setNotlar] = useState(
    mevcutTorba > 0
      ? `Eksik kalan ${kalanTorba} torba kömür tamamlandı.`
      : ''
  );
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const isWithoutSigList = !beneficiary.imza_listesi_id || String(beneficiary.imza_listesi_id).trim() === '';
  const isManuelEkListeCandidate = Boolean(
    beneficiary.manuel_ek_liste_imzasi ||
    beneficiary.ek_komur_verildi ||
    (isWithoutSigList && (beneficiary.tekil_hane_ekleme || beneficiary.sonradan_eklenen_hane || beneficiary.liste_turu === 'EK_LISTE'))
  );

  const [isSigned, setIsSigned] = useState<boolean>(
    beneficiary.imza_durumu === 'IMZALANDI' || isManuelEkListeCandidate
  );
  const listInfo = getBeneficiaryListTypeInfo(beneficiary);

  const projectedTotal = mevcutTorba > 0
    ? (deliveryMode === 'REMAINING' ? hedefTorba : mevcutTorba + torbaSayisi)
    : torbaSayisi;

  const willBeComplete = projectedTotal >= hedefTorba;
  const willBeMissing = Math.max(0, hedefTorba - projectedTotal);

  const quickRecipients = [
    `${beneficiary.ad_soyad} (Kendisi)`,
    'Eşi',
    'Oğlu / Kızı',
    'Yakını / Komşusu'
  ];

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (torbaSayisi <= 0) {
      setErrorMsg('Teslim edilecek torba sayısı en az 1 olmalıdır');
      return;
    }

    if (!isSigned) {
      setErrorMsg('⚠️ Teslimatı tamamlamadan önce lütfen kapıda ıslak imzanın alındığını onaylayınız ("✍️ İmzalandı Olarak İşaretle" butonuna basınız).');
      return;
    }

    setIsSubmitting(true);
    setErrorMsg('');

    // 1. Offline Mode Check
    const isOffline = typeof navigator !== 'undefined' && !navigator.onLine;
    if (isOffline) {
      saveOfflineDelivery({
        beneficiary_id: beneficiary.id,
        tc_no: beneficiary.tc_no,
        ad_soyad: beneficiary.ad_soyad,
        eklenen_torba: mevcutTorba > 0 ? torbaSayisi : undefined,
        torba_sayisi: mevcutTorba === 0 ? torbaSayisi : undefined,
        teslim_alan: teslimAlan,
        personel: personel,
        notlar: notlar
      });

      if (typeof window !== 'undefined' && 'navigator' in window && 'vibrate' in navigator) {
        navigator.vibrate([100, 50, 100]);
      }

      showAlert({
        title: '📶 Çevrimdışı Teslimat Kaydedildi',
        message: `${beneficiary.ad_soyad} için yapılan teslimat cihazınıza yerel olarak depolandı.\n\nİnternet bağlantısı kurulduğunda anlık olarak sisteme aktarılacaktır.`,
        type: 'warning'
      });

      onSuccess({
        ...beneficiary,
        torba_sayisi: projectedTotal,
        teslimat_durumu: willBeComplete ? 'TAMAMLANDI' : 'EKSIK',
        teslim_eden_personel: `${personel} (Çevrimdışı)`,
        teslimat_tarihi: new Date().toLocaleTimeString('tr-TR')
      });
      return;
    }

    try {
      const res = await fetch('/api/delivery', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'TESLIMAT',
          beneficiary_id: beneficiary.id,
          eklenen_torba: mevcutTorba > 0 ? torbaSayisi : undefined,
          torba_sayisi: mevcutTorba === 0 ? torbaSayisi : undefined,
          teslim_alan: teslimAlan,
          personel: personel,
          notlar: notlar
        })
      });

      const data = await res.json();

      if (res.status === 409 || data.conflict) {
        // Double delivery detected!
        setErrorMsg(data.error || 'UYARI: Bu vatandaşa başka bir personel tarafından zaten teslimat yapılmıştır!');
        return;
      }

      if (!data.success) {
        throw new Error(data.error || 'Teslimat kaydedilemedi');
      }

      if (typeof window !== 'undefined' && 'navigator' in window && 'vibrate' in navigator) {
        navigator.vibrate([100, 50, 100]);
      }

      onSuccess(data.beneficiary);
    } catch (err: any) {
      // If network failed suddenly, save to offline queue
      if (err.name === 'TypeError' || err.message?.includes('fetch') || err.message?.includes('Failed')) {
        saveOfflineDelivery({
          beneficiary_id: beneficiary.id,
          tc_no: beneficiary.tc_no,
          ad_soyad: beneficiary.ad_soyad,
          eklenen_torba: mevcutTorba > 0 ? torbaSayisi : undefined,
          torba_sayisi: mevcutTorba === 0 ? torbaSayisi : undefined,
          teslim_alan: teslimAlan,
          personel: personel,
          notlar: notlar
        });

        showAlert({
          title: '📶 İnternet Bağlantısı Kesildi',
          message: `Teslimat işlemi cihazınıza güvenle kaydedildi.\n\nİnternet tekrar sağlandığında anlık olarak sisteme aktarılacaktır.`,
          type: 'warning'
        });

        onSuccess({
          ...beneficiary,
          torba_sayisi: projectedTotal,
          teslimat_durumu: willBeComplete ? 'TAMAMLANDI' : 'EKSIK',
          teslim_eden_personel: `${personel} (Çevrimdışı Kuyrukta)`,
          teslimat_tarihi: new Date().toLocaleTimeString('tr-TR')
        });
        return;
      }

      setErrorMsg(err.message || 'Bağlantı hatası oluştu');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-sheet" onClick={(e) => e.stopPropagation()}>
        {/* Header - Light Mode */}
        <div className="flex items-center justify-between pb-3 border-b border-slate-200 mb-4">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-emerald-100 text-emerald-800 flex items-center justify-center border border-emerald-200">
              <PackageCheck className="w-5 h-5 text-emerald-700" />
            </div>
            <div>
              <h3 className="text-base font-extrabold text-slate-900">
                {mevcutTorba > 0 ? 'Eksik Kömürü Tamamla' : 'Kömür Teslimatı Yap'}
              </h3>
              <p className="text-xs text-slate-500 font-medium">Hedef Kota: {hedefTorba} Torba / Hane</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-700 p-1 rounded-lg text-sm"
          >
            ✕
          </button>
        </div>

        {/* Citizen Brief Box - Light Mode */}
        <div className="p-3.5 rounded-2xl bg-slate-50 border border-slate-200 mb-3 space-y-1.5 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-sm font-extrabold text-slate-900">{beneficiary.ad_soyad}</span>
            <span className="text-xs font-mono font-bold text-amber-800 bg-amber-100 px-2 py-0.5 rounded border border-amber-200">
              TC: {beneficiary.tc_no}
            </span>
          </div>
          <p className="text-xs text-slate-600 flex items-center gap-1 font-medium">
            <MapPin className="w-3.5 h-3.5 text-amber-600 shrink-0" />
            <span className="font-bold text-slate-900">{beneficiary.mahalle}</span> - {beneficiary.acik_adres}
          </p>

          {/* Previous Delivery Status Banner */}
          {mevcutTorba > 0 ? (
            <div className="mt-2 p-2 rounded-xl bg-amber-50 border border-amber-200 text-xs text-amber-900 flex items-center justify-between font-semibold">
              <div>
                <span className="font-bold text-amber-800">Önceki Teslimat: </span>
                <span>{mevcutTorba} / {hedefTorba} Torba verildi</span>
              </div>
              <span className="text-rose-700 font-bold bg-rose-100 px-2 py-0.5 rounded border border-rose-200">
                {kalanTorba} Torba Eksik
              </span>
            </div>
          ) : (
            <div className="mt-2 p-2 rounded-xl bg-white border border-slate-200 text-xs text-slate-600 flex items-center justify-between font-medium">
              <span>Hane Kotası: <strong className="text-amber-800">{hedefTorba} Torba</strong></span>
              <span className="text-emerald-700 font-bold">≈ {(hedefTorba * 25).toLocaleString('tr-TR')} kg ({(hedefTorba * 0.025).toFixed(2)} Ton)</span>
            </div>
          )}
        </div>

        {errorMsg && (
          <div className="p-3 mb-4 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs flex items-center gap-2 font-medium">
            <AlertCircle className="w-4 h-4 shrink-0 text-rose-600" />
            <span>{errorMsg}</span>
          </div>
        )}
        {/* Manuel Ek Liste İmzası Bilgilendirmesi */}
        {(isWithoutSigList || isManuelEkListeCandidate) && (
          <div className="p-3 mb-3 rounded-2xl bg-gradient-to-r from-amber-50 to-orange-50 border border-amber-300 text-amber-950 text-xs shadow-xs space-y-1">
            <div className="flex items-center gap-1.5 font-black text-amber-900">
              <span className="text-sm">📋</span>
              <span>Manuel Ek Listeye İmza Alındı Kabul Edilecek</span>
            </div>
            <p className="text-[11px] text-amber-800 leading-relaxed font-medium">
              Bu hane için basılı ıslak imza listesi henüz çıkmadığından, kömür teslimatı yapıldığında imza saha manuel ek listesine elden alınmış kabul edilir ve sistemde <strong>Ek Kömür Verilenler Listesi</strong> olarak takip edilir.
            </p>
          </div>
        )}

        {/* Islak İmza Durumu ve Onayı */}
        <div className={`p-3 rounded-2xl border mb-3 flex items-center justify-between text-xs transition-all shadow-xs ${
          isSigned
            ? 'bg-emerald-50/90 border-emerald-300 text-emerald-950'
            : 'bg-amber-50/90 border-amber-300 text-amber-950'
        }`}>
          <div className="flex items-center gap-2.5 min-w-0">
            <div className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 border shadow-2xs ${
              isSigned ? 'bg-emerald-100 border-emerald-300 text-emerald-700' : 'bg-amber-100 border-amber-300 text-amber-700'
            }`}>
              <PenTool className="w-4 h-4" />
            </div>
            <div className="min-w-0">
              <span className="block font-black text-xs leading-tight">
                {isManuelEkListeCandidate
                  ? '✓ Manuel Ek Listeye İmza Alındı Kabul Edildi'
                  : isSigned
                  ? '✓ Kapıda Islak İmza Formu Alındı'
                  : '⚠️ Kapıda Islak İmza Alınmalıdır'}
              </span>
              <span className="text-[11px] text-slate-600 font-medium block truncate mt-0.5">
                {listInfo.folderLabel} • #{beneficiary.sira_no || beneficiary.mahalle_sira || beneficiary.id}
              </span>
            </div>
          </div>
          <button
            type="button"
            onClick={() => {
              setIsSigned(!isSigned);
              if (errorMsg) setErrorMsg('');
            }}
            className={`px-3 py-1.5 rounded-xl border text-xs font-black transition-all active:scale-95 shadow-2xs shrink-0 ${
              isSigned
                ? 'bg-white hover:bg-emerald-100 text-emerald-800 border-emerald-300'
                : 'bg-amber-500 hover:bg-amber-600 text-white border-amber-600'
            }`}
          >
            {isSigned ? 'İmzayı Kaldır' : '✍️ İmzalandı'}
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Quick Option for Partial Beneficiaries: Complete with Remaining */}
          {mevcutTorba > 0 && kalanTorba > 0 && (
            <button
              type="button"
              onClick={() => {
                setTorbaSayisi(kalanTorba);
                setDeliveryMode('REMAINING');
              }}
              className="w-full p-3 rounded-xl bg-emerald-50 border-2 border-emerald-300 text-emerald-900 font-extrabold text-xs flex items-center justify-center gap-2 hover:bg-emerald-100 active:scale-98 transition-all shadow-xs"
            >
              <PackagePlus className="w-4 h-4 text-emerald-700" />
              <span>Tek Tıkla Kalan {kalanTorba} Torbayı Tamamla (Hedef: {hedefTorba})</span>
            </button>
          )}

          {/* Torba Sayısı Selector - Light Mode */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-xs font-bold text-slate-600 uppercase tracking-wider">
                {mevcutTorba > 0 ? 'Şimdi Teslim Edilecek Torba' : 'Teslim Edilecek Torba'}
              </label>
              <span className="text-xs font-bold text-amber-800">
                Hedef: {hedefTorba} Torba
              </span>
            </div>

            <div className="flex items-center justify-between gap-3 bg-slate-50 p-2.5 rounded-2xl border border-slate-300">
              <button
                type="button"
                onClick={() => setTorbaSayisi(Math.max(1, torbaSayisi - (torbaSayisi <= 5 ? 1 : 5)))}
                className="w-12 h-12 rounded-xl bg-white hover:bg-slate-100 text-slate-800 border border-slate-300 flex items-center justify-center font-bold text-lg active:scale-95 transition-all shadow-xs"
              >
                <Minus className="w-5 h-5 text-slate-700" />
              </button>

              <div className="text-center flex-1">
                <span className="text-3xl font-black text-slate-900 tracking-tight">
                  {torbaSayisi}
                </span>
                <span className="text-xs text-slate-500 font-bold ml-1">Torba</span>
                <div className="text-[11px] text-emerald-700 font-bold">
                  ≈ {(torbaSayisi * 25).toLocaleString('tr-TR')} kg ({(torbaSayisi * 0.025).toFixed(2)} Ton)
                </div>
              </div>

              <button
                type="button"
                onClick={() => setTorbaSayisi(torbaSayisi + (torbaSayisi < 5 ? 1 : 5))}
                className="w-12 h-12 rounded-xl bg-white hover:bg-slate-100 text-slate-800 border border-slate-300 flex items-center justify-center font-bold text-lg active:scale-95 transition-all shadow-xs"
              >
                <Plus className="w-5 h-5 text-slate-700" />
              </button>
            </div>

            {/* Quick Bag Pills */}
            <div className="flex gap-2 mt-2">
              {[hedefTorba, 25, 20, 15, kalanTorba > 0 ? kalanTorba : 10].map((val, idx) => (
                <button
                  key={`${val}-${idx}`}
                  type="button"
                  onClick={() => setTorbaSayisi(val)}
                  className={`flex-1 py-1.5 rounded-xl text-xs font-bold border transition-all ${
                    torbaSayisi === val
                      ? 'bg-amber-500 border-amber-600 text-white shadow-sm'
                      : 'bg-white border-slate-300 text-slate-700 hover:bg-slate-50'
                  }`}
                >
                  {val === hedefTorba ? `${val} (Tam)` : `${val}`}
                </button>
              ))}
            </div>

            {/* Delivery Completion Prediction Warning */}
            <div className="mt-3">
              {willBeComplete ? (
                <div className="p-2.5 rounded-xl bg-emerald-50 border border-emerald-200 text-xs text-emerald-900 flex items-center gap-2 font-medium">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                  <span>
                    ✓ Bu teslimatla hane toplam <strong>{projectedTotal} Torba</strong> alacak ve <strong>TAMAMLANDI</strong> olarak işaretlenecektir.
                  </span>
                </div>
              ) : (
                <div className="p-2.5 rounded-xl bg-amber-50 border border-amber-300 text-xs text-amber-900 flex items-center gap-2 font-medium">
                  <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
                  <span>
                    ⚠️ Bu teslimat sonrası haneye <strong>{willBeMissing} torba eksik</strong> kalacaktır. Günün ve ertesi günün eksik teslimat uyarısında görüntülenecektir.
                  </span>
                </div>
              )}
            </div>
          </div>

          {/* Teslim Alan Kişi */}
          <div>
            <label className="block text-xs font-bold text-slate-600 uppercase tracking-wider mb-1.5">
              Teslim Alan Kişi
            </label>
            <input
              type="text"
              value={teslimAlan}
              onChange={(e) => setTeslimAlan(e.target.value)}
              placeholder="Adı Soyadı veya Akrabalık bağı"
              className="w-full px-3.5 py-2.5 rounded-xl bg-slate-50 border border-slate-300 text-slate-900 placeholder-slate-400 focus:outline-none focus:border-amber-500 focus:bg-white font-medium"
              required
            />
            <div className="flex flex-wrap gap-1.5 mt-2">
              {quickRecipients.map((rec) => (
                <button
                  key={rec}
                  type="button"
                  onClick={() => setTeslimAlan(rec)}
                  className="px-2.5 py-1 rounded-lg bg-slate-100 hover:bg-slate-200 border border-slate-200 text-[11px] text-slate-700 font-semibold"
                >
                  {rec}
                </button>
              ))}
            </div>
          </div>

          {/* Teslim Eden Personel */}
          <div>
            <label className="block text-xs font-bold text-slate-600 uppercase tracking-wider mb-1.5">
              Teslim Eden Personel
            </label>
            <input
              type="text"
              value={personel}
              onChange={(e) => setPersonel(e.target.value)}
              className="w-full px-3.5 py-2.5 rounded-xl bg-slate-50 border border-slate-300 text-slate-900 placeholder-slate-400 focus:outline-none focus:border-amber-500 focus:bg-white font-medium"
              required
            />
          </div>

          {/* Teslimat Notu */}
          <div>
            <label className="block text-xs font-bold text-slate-600 uppercase tracking-wider mb-1.5">
              Teslimat Notu / Açıklama (İsteğe Bağlı)
            </label>
            <textarea
              rows={2}
              value={notlar}
              onChange={(e) => setNotlar(e.target.value)}
              placeholder="Örn: Kapı önüne teslim edildi, komşuya bilgi verildi"
              className="w-full px-3.5 py-2 rounded-xl bg-slate-50 border border-slate-300 text-slate-900 placeholder-slate-400 text-sm focus:outline-none focus:border-amber-500 focus:bg-white"
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
              className={`btn-primary flex-1 font-bold ${
                willBeComplete
                  ? 'bg-emerald-600 bg-linear-to-r from-emerald-600 to-teal-700 text-white shadow-emerald-600/20'
                  : 'bg-amber-500 bg-linear-to-r from-amber-500 to-orange-600 text-white shadow-amber-500/20'
              }`}
              style={{
                background: willBeComplete
                  ? 'linear-gradient(135deg, #059669 0%, #0f766e 100%)'
                  : 'linear-gradient(135deg, #f59e0b 0%, #ea580c 100%)',
                color: '#ffffff'
              }}
            >
              {isSubmitting ? (
                'Kaydediliyor...'
              ) : (
                <>
                  <CheckCircle2 className="w-5 h-5" />
                  {mevcutTorba > 0
                    ? `+${torbaSayisi} Torbayı Kaydet`
                    : `${torbaSayisi} Torbayı Teslim Et`}
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
