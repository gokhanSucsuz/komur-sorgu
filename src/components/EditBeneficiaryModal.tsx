'use client';

import React, { useState } from 'react';
import {
  MapPin,
  Phone,
  Home,
  Save,
  X,
  AlertTriangle,
  CheckCircle2,
  Navigation,
  FileText,
  Building,
  Hash,
  Loader2,
  Info,
} from 'lucide-react';
import { extractPhoneNumbers, formatPhoneDisplay } from '@/lib/normalizer';

interface EditBeneficiaryModalProps {
  beneficiary: any;
  mahalleler?: any[];
  currentStaff: string;
  onClose: () => void;
  onSuccess: (updatedBeneficiary: any) => void;
}

export default function EditBeneficiaryModal({
  beneficiary,
  mahalleler = [],
  currentStaff,
  onClose,
  onSuccess,
}: EditBeneficiaryModalProps) {
  const existingPhones = extractPhoneNumbers(beneficiary.telefon, beneficiary.telefon2);

  const [mahalle, setMahalle] = useState<string>(beneficiary.mahalle || '');
  const [acikAdres, setAcikAdres] = useState<string>(beneficiary.acik_adres || '');
  const [sokak, setSokak] = useState<string>(beneficiary.sokak || '');
  const [kapiNo, setKapiNo] = useState<string>(
    beneficiary.kapi_no && beneficiary.kapi_no !== 999999 ? String(beneficiary.kapi_no) : ''
  );
  const [daireNo, setDaireNo] = useState<string>(
    beneficiary.daire_no && beneficiary.daire_no > 0 ? String(beneficiary.daire_no) : ''
  );
  const [telefon1, setTelefon1] = useState<string>(existingPhones[0] || '');
  const [telefon2, setTelefon2] = useState<string>(existingPhones[1] || '');
  const [haneNo, setHaneNo] = useState<string>(beneficiary.hane_no || '');
  const [guncellemeNotu, setGuncellemeNotu] = useState<string>(
    beneficiary.adres_guncelleme_notu || 'Fiili olarak bu adreste ikamet ediyor'
  );

  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const quickReasons = [
    'Fiili olarak bu adreste ikamet ediyor',
    'Başka adrese/mahalleye taşındı',
    'Telefon numarası değişti/güncellendi',
    'Resmi adresi hatalı girilmiş',
    'Kiracı olarak farklı adrese geçti',
  ];

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);

    if (!acikAdres.trim()) {
      setErrorMessage('Lütfen geçerli bir açık adres giriniz.');
      return;
    }

    if (!mahalle.trim()) {
      setErrorMessage('Lütfen mahalle / köy bilgisini seçiniz.');
      return;
    }

    setIsLoading(true);

    try {
      const payload = {
        id: beneficiary.id || beneficiary._id,
        mahalle: mahalle.trim(),
        acik_adres: acikAdres.trim(),
        sokak: sokak.trim(),
        kapi_no: kapiNo.trim(),
        daire_no: daireNo.trim() ? parseInt(daireNo.trim(), 10) : 0,
        telefon: telefon1.trim(),
        telefon2: telefon2.trim(),
        hane_no: haneNo.trim(),
        guncelleme_notu: guncellemeNotu.trim(),
        updated_by: currentStaff || 'Saha Personeli',
      };

      const res = await fetch('/api/beneficiaries', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const data = await res.json();

      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Güncelleme sırasında bir hata oluştu');
      }

      onSuccess(data.data || { ...beneficiary, ...payload });
    } catch (err: any) {
      console.error('Error updating beneficiary address/phone:', err);
      setErrorMessage(err.message || 'Güncelleme kaydedilemedi');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div
        className="modal-sheet max-w-xl max-h-[92vh] flex flex-col p-0 overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div
          className="p-4 sm:p-5 bg-gradient-to-r from-amber-500 to-orange-600 border-b border-amber-600/30 flex items-start justify-between gap-3 shrink-0"
          style={{
            background: 'linear-gradient(135deg, #f59e0b 0%, #ea580c 100%)',
            color: '#ffffff',
          }}
        >
          <div className="flex items-start gap-3">
            <div
              className="w-10 h-10 rounded-2xl flex items-center justify-center shrink-0 shadow-md"
              style={{
                backgroundColor: 'rgba(255, 255, 255, 0.22)',
                border: '1px solid rgba(255, 255, 255, 0.35)',
                color: '#ffffff',
              }}
            >
              <Home className="w-5 h-5 text-white" />
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h3
                  className="text-base sm:text-lg font-black text-white leading-tight"
                  style={{ color: '#ffffff' }}
                >
                  {beneficiary.ad_soyad}
                </h3>
                <span
                  className="font-mono text-xs font-extrabold px-2.5 py-0.5 rounded-md shadow-2xs"
                  style={{
                    backgroundColor: '#ffffff',
                    color: '#78350f',
                    border: '1px solid #fde68a',
                  }}
                >
                  TC: {beneficiary.tc_no}
                </span>
                {beneficiary.hane_no && (
                  <span
                    className="font-mono text-xs font-extrabold px-2.5 py-0.5 rounded-md shadow-2xs"
                    style={{
                      backgroundColor: '#eef2ff',
                      color: '#312e81',
                      border: '1px solid #c7d2fe',
                    }}
                  >
                    Hane: {beneficiary.hane_no}
                  </span>
                )}
              </div>
              <p
                className="text-xs font-semibold mt-1"
                style={{ color: '#fffbeb' }}
              >
                Fiili ikametgah adresi ve iletişim bilgilerini güncelleme formu
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-xl hover:bg-white/25 transition-colors shrink-0"
            style={{
              backgroundColor: 'rgba(255, 255, 255, 0.16)',
              color: '#ffffff',
            }}
            title="Pencereyi Kapat"
          >
            <X className="w-5 h-5 text-white" />
          </button>
        </div>

        {/* Scrollable Form Content */}
        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-4">
          {/* Informational Callout */}
          <div className="p-3 rounded-xl bg-sky-50 border border-sky-200 flex items-start gap-2.5 text-xs text-sky-900 leading-relaxed shadow-2xs">
            <Info className="w-4 h-4 text-sky-600 shrink-0 mt-0.5" />
            <div>
              <span className="font-black block">Resmi Adreste Yaşamayan Vatandaşlar:</span>
              <span>
                Vatandaş resmi ikametinde değil de farklı bir adreste yaşıyorsa fiili adresini buradan
                güncelleyebilirsiniz. Güncellenen adres kömür dağıtım rotasında ve sorgu ekranında derhal aktif olur.
              </span>
            </div>
          </div>

          {errorMessage && (
            <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 flex items-start gap-2 text-xs text-rose-900 font-semibold animate-in fade-in">
              <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
              <span>{errorMessage}</span>
            </div>
          )}

          {/* Mahalle & Köy Seçimi */}
          <div className="space-y-1.5">
            <label className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
              <Building className="w-3.5 h-3.5 text-amber-600" />
              <span>Mahalle veya Köy *</span>
            </label>
            <div className="relative">
              <input
                type="text"
                list="mahalle-listesi"
                value={mahalle}
                onChange={(e) => setMahalle(e.target.value)}
                placeholder="Mahalle veya Köy adı giriniz veya seçiniz"
                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 bg-white text-slate-900 text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-amber-500 focus:border-amber-500 shadow-2xs"
                required
              />
              <datalist id="mahalle-listesi">
                {mahalleler.map((m: any, idx: number) => {
                  const name = typeof m === 'string' ? m : m.mahalle || '';
                  return <option key={idx} value={name} />;
                })}
              </datalist>
            </div>
          </div>

          {/* Açık Adres / Fiili İkamet */}
          <div className="space-y-1.5">
            <label className="text-xs font-bold text-slate-700 flex items-center justify-between">
              <span className="flex items-center gap-1.5">
                <MapPin className="w-3.5 h-3.5 text-amber-600" />
                <span>Yeni / Fiili İkamet Açık Adresi *</span>
              </span>
              <span className="text-[10px] text-slate-400 font-normal">Cadde, Sokak, No ve Tarif</span>
            </label>
            <textarea
              rows={3}
              value={acikAdres}
              onChange={(e) => setAcikAdres(e.target.value)}
              placeholder="Örn: Şükrüpaşa Mah. Abdi İpekçi Cad. No: 14 Daire: 3 (Okulun karşısındaki sarı bina)"
              className="w-full px-3.5 py-2 rounded-xl border border-slate-300 bg-white text-slate-900 text-xs sm:text-sm font-medium focus:outline-none focus:ring-2 focus:ring-amber-500 focus:border-amber-500 shadow-2xs leading-relaxed"
              required
            />
          </div>

          {/* Sokak, Kapı No, Daire No */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="space-y-1 sm:col-span-1">
              <label className="text-[11px] font-bold text-slate-700 flex items-center gap-1">
                <Navigation className="w-3 h-3 text-sky-600" />
                <span>Sokak / Cadde</span>
              </label>
              <input
                type="text"
                value={sokak}
                onChange={(e) => setSokak(e.target.value)}
                placeholder="Örn: 102. Sokak"
                className="w-full px-3 py-2 rounded-xl border border-slate-300 bg-white text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-amber-500"
              />
            </div>

            <div className="space-y-1">
              <label className="text-[11px] font-bold text-slate-700 flex items-center gap-1">
                <Hash className="w-3 h-3 text-slate-500" />
                <span>Kapı / Bina No</span>
              </label>
              <input
                type="text"
                value={kapiNo}
                onChange={(e) => setKapiNo(e.target.value)}
                placeholder="Örn: 12 veya 12/A"
                className="w-full px-3 py-2 rounded-xl border border-slate-300 bg-white text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-amber-500"
              />
            </div>

            <div className="space-y-1">
              <label className="text-[11px] font-bold text-slate-700 flex items-center gap-1">
                <Building className="w-3 h-3 text-slate-500" />
                <span>İç Kapı / Daire</span>
              </label>
              <input
                type="text"
                value={daireNo}
                onChange={(e) => setDaireNo(e.target.value)}
                placeholder="Örn: 3"
                className="w-full px-3 py-2 rounded-xl border border-slate-300 bg-white text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-amber-500"
              />
            </div>
          </div>

          {/* Telefon Numaraları */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
                <Phone className="w-3.5 h-3.5 text-emerald-600" />
                <span>Birincil Telefon (Telefon 1)</span>
              </label>
              <div className="relative">
                <input
                  type="tel"
                  value={telefon1}
                  onChange={(e) => setTelefon1(e.target.value)}
                  placeholder="05XX XXX XX XX"
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 bg-white text-slate-900 text-sm font-mono font-bold focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 shadow-2xs"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
                <Phone className="w-3.5 h-3.5 text-teal-600" />
                <span>İkincil Telefon (Telefon 2 / Yakını)</span>
              </label>
              <div className="relative">
                <input
                  type="tel"
                  value={telefon2}
                  onChange={(e) => setTelefon2(e.target.value)}
                  placeholder="05XX XXX XX XX (İsteğe bağlı)"
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 bg-white text-slate-900 text-sm font-mono font-bold focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-teal-500 shadow-2xs"
                />
              </div>
            </div>
          </div>

          {/* Hane Numarası */}
          <div className="space-y-1.5 pt-1">
            <label className="text-xs font-bold text-slate-700 flex items-center justify-between">
              <span className="flex items-center gap-1.5">
                <Home className="w-3.5 h-3.5 text-indigo-600" />
                <span>Hane Numarası</span>
              </span>
              <span className="text-[10px] text-indigo-700 font-semibold">
                Sistemde yalnızca 1 adet olabilir
              </span>
            </label>
            <input
              type="text"
              value={haneNo}
              onChange={(e) => setHaneNo(e.target.value)}
              placeholder="Örn: 10452 (Değişmediyse aynı bırakınız)"
              className="w-full px-3.5 py-2 rounded-xl border border-slate-300 bg-white text-xs sm:text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-indigo-500 shadow-2xs"
            />
          </div>

          {/* Güncelleme Nedeni & Hızlı Etiketler */}
          <div className="space-y-2 pt-2 border-t border-slate-200">
            <label className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
              <FileText className="w-3.5 h-3.5 text-slate-600" />
              <span>Güncelleme Gerekçesi / Saha Notu</span>
            </label>

            {/* Quick tag buttons */}
            <div className="flex flex-wrap gap-1.5">
              {quickReasons.map((reason, idx) => (
                <button
                  key={idx}
                  type="button"
                  onClick={() => setGuncellemeNotu(reason)}
                  className={`text-[11px] px-2.5 py-1 rounded-lg border font-semibold transition-all active:scale-95 ${
                    guncellemeNotu === reason
                      ? 'bg-amber-100 text-amber-900 border-amber-300 font-bold shadow-2xs'
                      : 'bg-slate-50 hover:bg-slate-100 text-slate-600 border-slate-200'
                  }`}
                >
                  {reason}
                </button>
              ))}
            </div>

            <input
              type="text"
              value={guncellemeNotu}
              onChange={(e) => setGuncellemeNotu(e.target.value)}
              placeholder="Açıklama veya ek yön tarifi yazınız"
              className="w-full px-3 py-2 rounded-xl border border-slate-300 bg-white text-xs font-medium focus:outline-none focus:ring-2 focus:ring-amber-500"
            />
          </div>
        </form>

        {/* Footer */}
        <div className="p-3.5 sm:p-4 bg-slate-50 border-t border-slate-200 flex items-center justify-between gap-3 shrink-0">
          <button
            type="button"
            onClick={onClose}
            disabled={isLoading}
            className="px-4 py-2.5 rounded-xl border border-slate-300 bg-white hover:bg-slate-100 text-slate-700 text-xs font-bold transition-all disabled:opacity-50"
          >
            İptal
          </button>

          <button
            type="button"
            onClick={handleSubmit}
            disabled={isLoading}
            className="btn-primary px-5 py-2.5 text-xs font-bold flex items-center gap-2 shadow-md shadow-amber-500/20 disabled:opacity-50"
          >
            {isLoading ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>Kaydediliyor...</span>
              </>
            ) : (
              <>
                <Save className="w-4 h-4 text-white" />
                <span>Bilgileri Güncelle ve Kaydet</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
