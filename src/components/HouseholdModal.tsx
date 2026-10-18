'use client';

import { Users, Phone, MapPin, CheckCircle2, Clock, AlertTriangle, PackageCheck, Undo2, Edit3, Shield, FileSpreadsheet, FileText, Ban } from 'lucide-react';
import { getRecordPhones, formatPhoneDisplay, getBeneficiaryListTypeInfo } from '@/lib/normalizer';

interface HouseholdModalProps {
  person: any;
  householdMembers: any[];
  onClose: () => void;
  onOpenDelivery: (person: any) => void;
  onOpenCancel?: (person: any) => void;
  onOpenEdit?: (person: any) => void;
  onOpenKomurIptal?: (person: any) => void;
}

export default function HouseholdModal({
  person,
  householdMembers,
  onClose,
  onOpenDelivery,
  onOpenCancel,
  onOpenEdit,
  onOpenKomurIptal,
}: HouseholdModalProps) {
  const isComplete = person.teslimat_durumu === 'TAMAMLANDI' || person.teslimat_durumu === 'TESLIM_EDILDI';
  const isPartial = person.teslimat_durumu === 'EKSIK';
  const listInfo = getBeneficiaryListTypeInfo(person);

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
              {person.komur_verilmeyecek ? (
                <span className="badge badge-danger text-[11px] bg-rose-100 text-rose-800 border border-rose-300">
                  <Ban className="w-3.5 h-3.5 text-rose-600" />
                  Kömür Verilmeyecek
                </span>
              ) : isComplete ? (
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

          {/* Kömür İptal Bildirim Kutusu */}
          {person.komur_verilmeyecek && (
            <div className="p-3 rounded-xl bg-rose-50 border border-rose-300 text-xs text-rose-950 space-y-1">
              <div className="flex items-center gap-2 font-black text-rose-800">
                <Ban className="w-4 h-4 text-rose-600 shrink-0" />
                <span>Bu Hak Sahibine Kömür Yardımı İptal Edilmiştir</span>
              </div>
              <p className="text-[11px] text-rose-900 font-bold">
                Neden: {person.komur_iptal_nedeni || 'Belirtilmedi'}
              </p>
              {person.komur_iptal_aciklama && (
                <p className="text-[11px] text-rose-800">
                  Açıklama: {person.komur_iptal_aciklama}
                </p>
              )}
              {person.komur_iptal_tarihi && (
                <span className="text-[10px] text-rose-600 block">
                  İptal Tarihi: {person.komur_iptal_tarihi} {person.komur_iptal_eden ? `(${person.komur_iptal_eden})` : ''}
                </span>
              )}
            </div>
          )}

          {/* Islak İmza Formu ve Dosya Bilgisi Banner */}
          <div className={`p-3 rounded-xl border flex items-center justify-between gap-3 ${
            listInfo.type === 'SIGORTALI'
              ? 'bg-purple-50/80 border-purple-200 text-purple-950'
              : listInfo.type === 'EK_LISTE'
              ? 'bg-indigo-50/80 border-indigo-200 text-indigo-950'
              : 'bg-emerald-50/80 border-emerald-200 text-emerald-950'
          }`}>
            <div className="flex items-center gap-2.5 min-w-0">
              <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 border shadow-2xs ${
                listInfo.type === 'SIGORTALI'
                  ? 'bg-purple-100 text-purple-800 border-purple-300'
                  : listInfo.type === 'EK_LISTE'
                  ? 'bg-indigo-100 text-indigo-800 border-indigo-300'
                  : 'bg-emerald-100 text-emerald-800 border-emerald-300'
              }`}>
                {listInfo.type === 'SIGORTALI' && <Shield className="w-5 h-5 text-purple-700" />}
                {listInfo.type === 'EK_LISTE' && <FileSpreadsheet className="w-5 h-5 text-indigo-700" />}
                {listInfo.type === 'ANA_LISTE' && <FileText className="w-5 h-5 text-emerald-700" />}
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-1.5 flex-wrap">
                  <span className="text-[10px] font-black uppercase tracking-wider text-slate-500">
                    Islak İmza Dosyası
                  </span>
                  <span className={`text-[11px] font-black px-1.5 py-0.2 rounded border ${listInfo.badgeClass}`}>
                    {listInfo.label}
                  </span>
                </div>
                <p className="font-extrabold text-xs text-slate-900 mt-0.5">
                  📁 {listInfo.folderLabel}
                </p>
              </div>
            </div>
            <div className="text-right shrink-0">
              <span className="text-[10px] font-bold text-slate-500 block uppercase">Dosya Sıra No</span>
              <span className="font-mono font-black text-sm text-slate-900 bg-white px-2 py-0.5 rounded-lg border border-slate-300 shadow-2xs inline-block">
                #{person.sira_no || person.mahalle_sira || person.id}
              </span>
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
            <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-xs text-emerald-900 space-y-1.5 shadow-2xs">
              <div className="flex items-center justify-between">
                <p className="font-extrabold text-emerald-950 flex items-center gap-1.5">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                  {person.torba_sayisi || 34} Torba Tamamlandı
                </p>
                {person.teslimat_tarihi && (
                  <span className="text-[11px] font-mono text-emerald-800 bg-white/70 px-2 py-0.5 rounded border border-emerald-200">
                    {person.teslimat_tarihi}
                  </span>
                )}
              </div>
              <div className="grid grid-cols-2 gap-2 text-[11px] pt-1 border-t border-emerald-200/60">
                <div>
                  <span className="text-emerald-700 block text-[10px]">Teslim Eden Personel:</span>
                  <strong className="text-emerald-950 font-bold">{person.teslim_eden_personel || '-'}</strong>
                </div>
                <div>
                  <span className="text-emerald-700 block text-[10px]">Teslim Alan Kişi:</span>
                  <strong className="text-emerald-950 font-bold">{person.teslim_alan || person.ad_soyad}</strong>
                </div>
              </div>
            </div>
          )}

          {isPartial && (
            <div className="p-3 rounded-xl bg-amber-50 border border-amber-300 text-xs text-amber-950 space-y-1.5 shadow-2xs">
              <div className="flex items-center justify-between">
                <p className="font-extrabold text-amber-950 flex items-center gap-1.5">
                  <AlertTriangle className="w-4 h-4 text-amber-600" />
                  Kısmi Dağıtım: {person.teslim_edilen_torba || 0}/{person.torba_sayisi || 34} Torba
                </p>
                <span className="text-[11px] font-bold text-rose-700 bg-rose-50 px-2 py-0.5 rounded border border-rose-200 font-mono">
                  +{person.kalan_torba ?? ((person.torba_sayisi || 34) - (person.teslim_edilen_torba || 0))} Kalan
                </span>
              </div>
              <div className="grid grid-cols-2 gap-2 text-[11px] pt-1 border-t border-amber-200/60">
                <div>
                  <span className="text-amber-800 block text-[10px]">Teslim Eden Personel:</span>
                  <strong className="text-amber-950 font-bold">{person.teslim_eden_personel || '-'}</strong>
                </div>
                <div>
                  <span className="text-amber-800 block text-[10px]">Teslim Alan Kişi:</span>
                  <strong className="text-amber-950 font-bold">{person.teslim_alan || person.ad_soyad}</strong>
                </div>
              </div>
              {person.teslimat_tarihi && (
                <div className="text-[10px] text-amber-800 pt-0.5">
                  Son Teslimat Tarihi: <strong className="font-mono">{person.teslimat_tarihi}</strong>
                </div>
              )}
            </div>
          )}

          {/* Kömür İptal / Aktif Etme Butonu */}
          {onOpenKomurIptal && (
            <button
              onClick={() => {
                onClose();
                onOpenKomurIptal(person);
              }}
              className={`w-full mt-2 py-2 px-3 rounded-xl border font-bold text-xs flex items-center justify-center gap-1.5 transition-all active:scale-95 shadow-2xs ${
                person.komur_verilmeyecek
                  ? 'bg-rose-100 hover:bg-rose-200 text-rose-900 border-rose-300 font-black'
                  : 'bg-white hover:bg-rose-50 text-slate-700 hover:text-rose-700 border-slate-200'
              }`}
            >
              <Ban className="w-4 h-4 text-rose-600" />
              <span>
                {person.komur_verilmeyecek
                  ? 'Kömür İptal Gerekçesini Görüntüle / İptali Kaldır'
                  : 'Kömür Yardımını İptal Et (Eşi kömür aldı, doğalgaza geçti vb.)'}
              </span>
            </button>
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

          {!isComplete && !person.komur_verilmeyecek && (
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
              {householdMembers.map((member) => {
                const memberListInfo = getBeneficiaryListTypeInfo(member);
                return (
                  <div
                    key={member.id}
                    className="p-3 rounded-xl bg-white border border-purple-200 flex items-center justify-between gap-2 shadow-xs"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <p className="text-sm font-extrabold text-slate-900 truncate">{member.ad_soyad}</p>
                        <span
                          className={`text-[10px] font-extrabold px-1.5 py-0.2 rounded border ${memberListInfo.badgeClass}`}
                          title={`${memberListInfo.folderLabel} (Sıra: #${member.sira_no || member.mahalle_sira || member.id})`}
                        >
                          {memberListInfo.label} (#{member.sira_no || member.mahalle_sira || member.id})
                        </span>
                      </div>
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

                    {member.komur_verilmeyecek ? (
                      <button
                        type="button"
                        onClick={() => {
                          onClose();
                          if (onOpenKomurIptal) onOpenKomurIptal(member);
                        }}
                        className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-rose-50 hover:bg-rose-100 text-rose-800 text-[11px] font-bold border border-rose-200 shadow-2xs transition-all active:scale-95"
                        title={member.komur_iptal_nedeni ? `İptal Nedeni: ${member.komur_iptal_nedeni}` : 'Kömür Yardımı İptal Edildi'}
                      >
                        <Ban className="w-3 h-3 text-rose-600" />
                        <span>Kömür İptal</span>
                      </button>
                    ) : member.teslimat_durumu === 'TAMAMLANDI' || member.teslimat_durumu === 'TESLIM_EDILDI' ? (
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
              );
              })}
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
