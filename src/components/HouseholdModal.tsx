'use client';

import { Users, Phone, MapPin, CheckCircle2, Clock, AlertTriangle, PackageCheck, Undo2, Edit3 } from 'lucide-react';
import { getRecordPhones, formatPhoneDisplay } from '@/lib/normalizer';

interface HouseholdModalProps {
  person: any;
  householdMembers: any[];
  onClose: () => void;
  onOpenDelivery: (person: any) => void;
  onOpenCancel?: (person: any) => void;
  onOpenEdit?: (person: any) => void;
}

export default function HouseholdModal({
  person,
  householdMembers,
  onClose,
  onOpenDelivery,
  onOpenCancel,
  onOpenEdit,
}: HouseholdModalProps) {
  const isComplete = person.teslimat_durumu === 'TAMAMLANDI' || person.teslimat_durumu === 'TESLIM_EDILDI';
  const isPartial = person.teslimat_durumu === 'EKSIK';

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-sheet" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between pb-3 border-b border-slate-200 mb-4">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-amber-100 text-amber-800 flex items-center justify-center border border-amber-200">
              <Users className="w-4 h-4 text-amber-700" />
            </div>
            <div>
              <h3 className="text-base font-extrabold text-slate-900">Vatandaş & Hane Detayı</h3>
              <p className="text-xs text-slate-500">Kişi ve adres inceleme kartı</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-700 p-1 rounded-lg text-sm"
          >
            ✕
          </button>
        </div>

        {/* Primary Person Card - Light Mode */}
        <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200 mb-4 space-y-3 shadow-xs">
          <div className="flex items-start justify-between gap-2">
            <div>
              <h4 className="text-lg font-black text-slate-900 leading-tight">{person.ad_soyad}</h4>
              <span className="text-xs font-mono font-bold text-amber-800 bg-amber-100 px-2 py-0.5 rounded border border-amber-200 inline-block mt-1">
                TC: {person.tc_no}
              </span>
            </div>
            <div className="shrink-0">
              {isComplete ? (
                <span className="badge badge-delivered">
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  Tam ({person.torba_sayisi} Torba)
                </span>
              ) : isPartial ? (
                <span className="badge badge-pending">
                  <AlertTriangle className="w-3.5 h-3.5" />
                  Eksik: {person.torba_sayisi}/{person.hedef_torba || 34}
                </span>
              ) : (
                <span className="badge badge-pending">
                  <Clock className="w-3.5 h-3.5" />
                  Bekliyor ({person.hedef_torba || 34})
                </span>
              )}
            </div>
          </div>

          {/* Phone Numbers Display */}
          {(() => {
            const phones = getRecordPhones(person);
            if (phones.length === 0) return null;
            return (
              <div className="space-y-1.5">
                {phones.map((ph, idx) => (
                  <div
                    key={idx}
                    className="flex items-center justify-between p-2.5 rounded-xl bg-white border border-slate-200 shadow-2xs"
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div className="w-8 h-8 rounded-lg bg-emerald-100 text-emerald-800 flex items-center justify-center shrink-0">
                        <Phone className="w-4 h-4 text-emerald-700" />
                      </div>
                      <div className="min-w-0">
                        <span className="text-[10px] font-extrabold text-slate-500 uppercase tracking-wider block">
                          {phones.length > 1 ? `${idx + 1}. Telefon Numarası` : 'Telefon'}
                        </span>
                        <span className="font-mono font-extrabold text-slate-900 text-sm">
                          {formatPhoneDisplay(ph)}
                        </span>
                      </div>
                    </div>
                    <a
                      href={`tel:${ph}`}
                      className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-extrabold flex items-center gap-1.5 active:scale-95 shadow-xs shrink-0"
                    >
                      <Phone className="w-3.5 h-3.5" />
                      <span>Ara</span>
                    </a>
                  </div>
                ))}
              </div>
            );
          })()}

          <div className="pt-2 border-t border-slate-200 text-xs space-y-1">
            <div className="flex items-center gap-1.5 text-slate-600 font-medium">
              <MapPin className="w-3.5 h-3.5 text-amber-600 shrink-0" />
              <span className="font-bold text-slate-900">{person.mahalle}</span>
              {person.hane_no && (
                <span className="bg-slate-200 px-2 py-0.5 rounded text-[11px] font-semibold text-slate-700">
                  Hane No: {person.hane_no}
                </span>
              )}
            </div>
            <p className="text-slate-800 bg-white p-3 rounded-xl border border-slate-200 leading-relaxed font-semibold">
              {person.acik_adres}
            </p>

            {person.fiili_adres_guncellendi && (
              <div className="flex items-center gap-1.5 text-[11px] font-bold text-sky-800 bg-sky-50 px-2.5 py-1 rounded-lg border border-sky-200">
                <MapPin className="w-3 h-3 text-sky-600 shrink-0" />
                <span>Fiili İkametgah Adresi Güncellendi</span>
                {person.son_adres_guncelleme_tarihi && (
                  <span className="text-slate-400 font-normal">({person.son_adres_guncelleme_tarihi})</span>
                )}
              </div>
            )}
            {person.adres_guncelleme_notu && (
              <p className="text-[11px] text-amber-900 bg-amber-50 p-2 rounded-lg border border-amber-200 font-medium">
                Saha Notu: {person.adres_guncelleme_notu}
              </p>
            )}

            {onOpenEdit && (
              <button
                type="button"
                onClick={() => {
                  onClose();
                  onOpenEdit(person);
                }}
                className="w-full mt-2 py-2 px-3 rounded-xl bg-amber-50 hover:bg-amber-100 border border-amber-300 text-amber-900 font-bold text-xs flex items-center justify-center gap-1.5 transition-all active:scale-95 shadow-2xs"
              >
                <Edit3 className="w-3.5 h-3.5 text-amber-700" />
                <span>Fiili İkametgah Adresi veya Telefon Numarası Güncelle</span>
              </button>
            )}
          </div>

          {isComplete && (
            <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-xs text-emerald-900 space-y-0.5">
              <p className="font-bold">✓ {person.torba_sayisi || 34} Torba Tamamlandı</p>
              <p className="text-[11px] text-emerald-700 font-medium">
                Teslim Alan: {person.teslim_alan || person.ad_soyad} • Personel: {person.teslim_eden_personel || '-'}
              </p>
              {person.teslimat_tarihi && (
                <p className="text-[11px] text-slate-500">Tarih: {person.teslimat_tarihi}</p>
              )}
            </div>
          )}

          {(isComplete || isPartial) && onOpenCancel && (
            <button
              onClick={() => {
                onClose();
                onOpenCancel(person);
              }}
              className="w-full mt-2 py-2 px-3 rounded-xl bg-rose-50 hover:bg-rose-100 border border-rose-200 text-rose-700 font-bold text-xs flex items-center justify-center gap-1.5 transition-all active:scale-95 shadow-2xs"
            >
              <Undo2 className="w-4 h-4 text-rose-600" />
              <span>Yanlışlıkla Yapıldıysa Teslimatı Geri Al / İptal Et</span>
            </button>
          )}

          {!isComplete && (
            <button
              onClick={() => {
                onClose();
                onOpenDelivery(person);
              }}
              className="btn-primary w-full mt-2 font-bold"
            >
              <PackageCheck className="w-4 h-4 text-white" />
              {isPartial ? `Kalan ${person.kalan_torba} Torbayı Tamamla` : 'Kömür Teslimatı Yap'}
            </button>
          )}
        </div>

        {/* HOUSEHOLD RELATIVES SECTION - Light Mode */}
        <div className="household-box">
          <div className="flex items-center justify-between mb-2">
            <h5 className="text-xs font-black uppercase tracking-wider text-purple-900 flex items-center gap-1.5">
              <Users className="w-4 h-4 text-purple-700" />
              Aynı Adreste / Hanede Kayıtlı Olanlar
            </h5>
            <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-purple-200 text-purple-900 border border-purple-300">
              {householdMembers.length} Kişi
            </span>
          </div>

          {householdMembers.length === 0 ? (
            <div className="text-xs text-slate-600 bg-white p-3 rounded-xl border border-purple-200 flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
              <span>Bu adreste sistemde kayıtlı başka bir hak sahibi bulunmamaktadır. (Tek Kayıt)</span>
            </div>
          ) : (
            <div className="space-y-2">
              <p className="text-[11px] text-purple-900 font-semibold leading-tight">
                ⚠️ Dikkat: Aynı hanede kayıtlı birden fazla vatandaş tespit edildi!
              </p>
              {householdMembers.map((member) => (
                <div
                  key={member.id}
                  className="p-3 rounded-xl bg-white border border-purple-200 flex items-center justify-between gap-2 shadow-xs"
                >
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-extrabold text-slate-900 truncate">{member.ad_soyad}</p>
                    <div className="flex items-center gap-2 text-xs text-slate-600 flex-wrap">
                      <span className="font-mono font-bold text-purple-800">TC: {member.tc_no}</span>
                      {(() => {
                        const mPhones = getRecordPhones(member);
                        if (mPhones.length === 0) return null;
                        return (
                          <>
                            {mPhones.map((mph, midx) => (
                              <a
                                key={midx}
                                href={`tel:${mph}`}
                                className="inline-flex items-center gap-1 font-mono text-[11px] font-bold text-emerald-700 hover:underline bg-emerald-50 px-1.5 py-0.5 rounded border border-emerald-200"
                                title="Numarayı Ara"
                              >
                                <Phone className="w-2.5 h-2.5" />
                                <span>{mPhones.length > 1 ? `${midx + 1}: ` : ''}{formatPhoneDisplay(mph)}</span>
                              </a>
                            ))}
                          </>
                        );
                      })()}
                    </div>
                  </div>

                  <div className="shrink-0 flex items-center gap-1.5">
                    {onOpenEdit && (
                      <button
                        type="button"
                        onClick={() => {
                          onClose();
                          onOpenEdit(member);
                        }}
                        className="p-1.5 bg-amber-50 hover:bg-amber-100 text-amber-800 rounded-lg text-xs font-bold border border-amber-200 shadow-2xs transition-all active:scale-95"
                        title="Bu vatandaşın adres veya telefon bilgilerini güncelle"
                      >
                        <Edit3 className="w-3.5 h-3.5" />
                      </button>
                    )}

                    {member.teslimat_durumu === 'TAMAMLANDI' || member.teslimat_durumu === 'TESLIM_EDILDI' ? (
                      <span className="badge badge-delivered text-[11px] py-0.5 px-2">
                        Teslim Edildi
                      </span>
                    ) : (
                      <button
                        type="button"
                        onClick={() => {
                          onClose();
                          onOpenDelivery(member);
                        }}
                        className="px-2.5 py-1 bg-amber-500 hover:bg-amber-600 text-white rounded-lg text-xs font-bold shadow-xs transition-all active:scale-95"
                      >
                        Teslim Et
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="pt-4">
          <button onClick={onClose} className="btn-secondary w-full">
            Kapat
          </button>
        </div>
      </div>
    </div>
  );
}
