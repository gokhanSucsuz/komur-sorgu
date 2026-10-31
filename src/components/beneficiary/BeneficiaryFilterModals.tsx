'use client';

import { ArrowRight, CheckSquare, Compass, MapPin, Navigation, Phone, Search, Square } from 'lucide-react';
import { formatPhoneDisplay, getRecordPhones } from '@/lib/normalizer';
import type { BeneficiaryRecord, MahalleSummary, StreetCountItem } from '@/types/beneficiary';

interface BeneficiaryFilterModalsProps {
  showMahalleModal: boolean;
  onCloseMahalleModal: () => void;
  mahalleler: MahalleSummary[];
  selectedMahalleler: string[];
  onMahallelerChange: (next: string[]) => void;
  onToggleMahalle: (mahalleName: string) => void;
  onSelectAllMahalle: () => void;

  showSokakModal: boolean;
  onCloseSokakModal: () => void;
  sokakSearchTerm: string;
  onSokakSearchTermChange: (val: string) => void;
  selectedSokak: string;
  onSelectSokak: (sokak: string) => void;
  availableStreets: StreetCountItem[];
  totalMahalleFilteredCount: number;

  phoneSelectTarget: BeneficiaryRecord | null;
  onClosePhoneSelectModal: () => void;
}

export default function BeneficiaryFilterModals({
  showMahalleModal,
  onCloseMahalleModal,
  mahalleler,
  selectedMahalleler,
  onMahallelerChange,
  onToggleMahalle,
  onSelectAllMahalle,
  showSokakModal,
  onCloseSokakModal,
  sokakSearchTerm,
  onSokakSearchTermChange,
  selectedSokak,
  onSelectSokak,
  availableStreets,
  totalMahalleFilteredCount,
  phoneSelectTarget,
  onClosePhoneSelectModal,
}: BeneficiaryFilterModalsProps) {
  const filteredStreets = availableStreets.filter(
    (st) =>
      !sokakSearchTerm.trim() ||
      st.sokak.toLocaleLowerCase('tr').includes(sokakSearchTerm.toLocaleLowerCase('tr'))
  );

  return (
    <>
      {/* MULTI-MAHALLE SELECTION MODAL */}
      {showMahalleModal && (
        <div className="modal-overlay" onClick={onCloseMahalleModal}>
          <div className="modal-sheet" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between pb-3 border-b border-slate-200 mb-4">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-amber-100 text-amber-700 flex items-center justify-center border border-amber-200">
                  <MapPin className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-900">Mahalle & Köy Seçimi</h3>
                  <p className="text-xs text-slate-500">Dağıtım yapılacak mahalle veya köyleri seçin</p>
                </div>
              </div>
              <button
                type="button"
                onClick={onCloseMahalleModal}
                className="text-slate-400 hover:text-slate-700 p-1 rounded-lg text-sm"
                aria-label="Kapat"
              >
                ✕
              </button>
            </div>

            {/* Select All Bar */}
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <button
                type="button"
                onClick={onSelectAllMahalle}
                className="flex items-center gap-2 text-xs font-bold text-amber-800 hover:underline"
              >
                {selectedMahalleler.length === mahalleler.length ? (
                  <>
                    <CheckSquare className="w-4 h-4 text-amber-600" />
                    <span>Tüm Seçimleri Kaldır</span>
                  </>
                ) : (
                  <>
                    <Square className="w-4 h-4 text-slate-400" />
                    <span>Tüm Bölgeleri Seç ({mahalleler.length})</span>
                  </>
                )}
              </button>

              <span className="text-xs font-semibold text-slate-500">
                {selectedMahalleler.length} / {mahalleler.length} Seçili
              </span>
            </div>

            {/* Neighborhood / Village List with Checkboxes */}
            <div className="py-2 space-y-2 max-h-80 overflow-y-auto">
              {mahalleler.map((m) => {
                const isSelected = selectedMahalleler.includes(m.mahalle);
                const isKoy = m.tip === 'KOY' || /(?:Köyü|Koy|Koyu)$/i.test(m.mahalle);
                return (
                  <div
                    key={m.mahalle}
                    onClick={() => onToggleMahalle(m.mahalle)}
                    className={`p-3 rounded-xl border flex items-center justify-between cursor-pointer transition-all ${
                      isSelected
                        ? 'bg-amber-50 border-amber-300 text-slate-900 shadow-xs'
                        : 'bg-slate-50 border-slate-200 text-slate-700 hover:bg-slate-100'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <div
                        className={`w-5 h-5 rounded-md flex items-center justify-center border transition-all ${
                          isSelected
                            ? 'bg-amber-500 border-amber-600 text-white'
                            : 'border-slate-300 bg-white'
                        }`}
                      >
                        {isSelected && <CheckSquare className="w-4 h-4" />}
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-bold text-slate-900">{m.mahalle}</span>
                          <span
                            className={`text-[10px] font-extrabold px-1.5 py-0.2 rounded border uppercase ${
                              isKoy
                                ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                                : 'bg-amber-50 text-amber-800 border-amber-200'
                            }`}
                          >
                            {isKoy ? 'Köy' : 'Mahalle'}
                          </span>
                        </div>
                        <div className="text-[11px] text-slate-500 mt-0.5">
                          {m.kisi_sayisi} Hane • {m.tamamlanan || 0} Tamamlandı
                        </div>
                      </div>
                    </div>

                    <span className="text-xs font-bold text-amber-800 font-mono bg-white px-2 py-0.5 rounded border border-slate-200">
                      {m.kisi_sayisi} Hane
                    </span>
                  </div>
                );
              })}
            </div>

            <div className="pt-3 border-t border-slate-200 flex gap-2">
              <button
                type="button"
                onClick={() => {
                  onMahallelerChange([]);
                  onCloseMahalleModal();
                }}
                className="btn-secondary flex-1"
              >
                Tümünü Göster
              </button>
              <button
                type="button"
                onClick={onCloseMahalleModal}
                className="btn-primary flex-1 font-bold"
              >
                Filtreyi Uygula ({selectedMahalleler.length > 0 ? selectedMahalleler.length : 'Tümü'})
              </button>
            </div>
          </div>
        </div>
      )}

      {/* SOKAK / CADDE SEÇİM MODALI */}
      {showSokakModal && (
        <div className="modal-overlay" onClick={onCloseSokakModal}>
          <div className="modal-sheet" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between pb-3 border-b border-slate-200 mb-3">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-sky-100 text-sky-700 flex items-center justify-center">
                  <Navigation className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-base font-extrabold text-slate-900">Sokak / Cadde Seçimi</h3>
                  <p className="text-xs text-slate-500">Dağıtım yapacağınız sokağı seçin</p>
                </div>
              </div>
              <button
                type="button"
                onClick={onCloseSokakModal}
                className="text-slate-400 hover:text-slate-700 p-1"
                aria-label="Kapat"
              >
                ✕
              </button>
            </div>

            {/* Sokak Arama Çubuğu */}
            <div className="relative mb-3">
              <Search className="w-4 h-4 absolute left-3 top-3 text-slate-400 pointer-events-none" />
              <input
                type="text"
                value={sokakSearchTerm}
                onChange={(e) => onSokakSearchTermChange(e.target.value)}
                placeholder="Sokak veya cadde adı ara..."
                className="w-full pl-9 pr-8 py-2.5 rounded-xl bg-slate-50 border border-slate-200 text-xs font-medium text-slate-900 placeholder-slate-400 focus:outline-none focus:border-sky-500 focus:ring-1 focus:ring-sky-500"
              />
              {sokakSearchTerm && (
                <button
                  type="button"
                  onClick={() => onSokakSearchTermChange('')}
                  className="absolute right-2.5 top-2.5 text-xs text-slate-400 hover:text-slate-700 p-0.5"
                >
                  ✕
                </button>
              )}
            </div>

            {/* Sokak Listesi */}
            <div className="py-1 space-y-1.5 max-h-80 overflow-y-auto">
              <div
                onClick={() => {
                  onSelectSokak('HEPSI');
                  onCloseSokakModal();
                }}
                className={`p-3 rounded-xl border flex items-center justify-between cursor-pointer transition-all ${
                  selectedSokak === 'HEPSI'
                    ? 'bg-sky-50 border-sky-300 text-slate-900 shadow-xs'
                    : 'bg-slate-50 border-slate-200 text-slate-700 hover:bg-slate-100'
                }`}
              >
                <div className="flex items-center gap-2.5">
                  <Compass className={`w-4 h-4 ${selectedSokak === 'HEPSI' ? 'text-sky-600' : 'text-slate-400'}`} />
                  <span className="text-xs font-bold text-slate-900">Tüm Sokakları Göster</span>
                </div>
                <span className="text-xs font-bold text-sky-800 bg-white px-2 py-0.5 rounded border border-slate-200">
                  {totalMahalleFilteredCount} Hane
                </span>
              </div>

              {filteredStreets.map((st) => {
                const isSelected = selectedSokak === st.sokak;
                return (
                  <div
                    key={st.sokak}
                    onClick={() => {
                      onSelectSokak(st.sokak);
                      onCloseSokakModal();
                    }}
                    className={`p-3 rounded-xl border flex items-center justify-between cursor-pointer transition-all ${
                      isSelected
                        ? 'bg-sky-50 border-sky-300 text-slate-900 shadow-xs'
                        : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'
                    }`}
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <Navigation className={`w-4 h-4 shrink-0 ${isSelected ? 'text-sky-600' : 'text-slate-400'}`} />
                      <span className="text-xs font-bold text-slate-900 truncate">{st.sokak}</span>
                    </div>
                    <span className="text-xs font-bold text-sky-800 bg-sky-50/80 px-2 py-0.5 rounded border border-sky-200 shrink-0 ml-2">
                      {st.count} Hane
                    </span>
                  </div>
                );
              })}

              {filteredStreets.length === 0 && (
                <div className="p-6 text-center text-xs text-slate-500">
                  Aramanızla eşleşen sokak bulunamadı.
                </div>
              )}
            </div>

            <div className="pt-3 border-t border-slate-200 flex gap-2">
              <button
                type="button"
                onClick={() => {
                  onSelectSokak('HEPSI');
                  onCloseSokakModal();
                }}
                className="btn-secondary flex-1 text-xs py-2.5 font-bold"
              >
                Filtreyi Temizle
              </button>
              <button
                type="button"
                onClick={onCloseSokakModal}
                className="btn-primary flex-1 text-xs py-2.5 font-bold"
              >
                Kapat
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ÇİFT TELEFON NUMARASI ARAMA SEÇİM MODALI */}
      {phoneSelectTarget && (() => {
        const targetPhones = getRecordPhones(phoneSelectTarget);
        return (
          <div className="modal-overlay" onClick={onClosePhoneSelectModal}>
            <div className="modal-sheet" onClick={(e) => e.stopPropagation()}>
              <div className="flex items-center justify-between pb-3 border-b border-slate-200 mb-4">
                <div className="flex items-center gap-2.5">
                  <div className="w-10 h-10 rounded-xl bg-emerald-100 text-emerald-800 flex items-center justify-center border border-emerald-200">
                    <Phone className="w-5 h-5 text-emerald-700" />
                  </div>
                  <div>
                    <h3 className="text-base font-extrabold text-slate-900 leading-tight">Telefon Numarası Seçin</h3>
                    <p className="text-xs text-slate-500 font-medium">Aramak istediğiniz numarayı seçiniz</p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={onClosePhoneSelectModal}
                  className="text-slate-400 hover:text-slate-700 p-1.5 rounded-lg text-sm"
                  aria-label="Kapat"
                >
                  ✕
                </button>
              </div>

              <div className="p-3 rounded-xl bg-slate-50 border border-slate-200 mb-4">
                <h4 className="text-sm font-extrabold text-slate-900 truncate">{phoneSelectTarget.ad_soyad}</h4>
                <p className="text-xs text-slate-500 font-mono mt-0.5">
                  TC: {phoneSelectTarget.tc_no} • {phoneSelectTarget.mahalle}
                </p>
              </div>

              <div className="space-y-3">
                {targetPhones.map((ph, idx) => (
                  <a
                    key={idx}
                    href={`tel:${ph}`}
                    onClick={onClosePhoneSelectModal}
                    className="w-full p-3.5 rounded-2xl bg-white hover:bg-emerald-50/60 border-2 border-slate-200 hover:border-emerald-500 transition-all flex items-center justify-between shadow-xs active:scale-[0.98] group"
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-xl bg-emerald-600 text-white flex items-center justify-center font-bold text-sm shadow-sm group-hover:scale-105 transition-transform shrink-0">
                        <Phone className="w-5 h-5" />
                      </div>
                      <div>
                        <span className="text-[10px] font-extrabold uppercase tracking-wider text-emerald-800 bg-emerald-100/80 px-2 py-0.5 rounded border border-emerald-200 inline-block mb-0.5">
                          {idx === 0 ? '1. Telefon Numarası' : '2. Telefon Numarası'}
                        </span>
                        <p className="text-base font-mono font-black text-slate-900">
                          {formatPhoneDisplay(ph)}
                        </p>
                      </div>
                    </div>

                    <div className="px-3 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold text-xs flex items-center gap-1.5 shadow-sm shrink-0">
                      <span>Ara</span>
                      <ArrowRight className="w-3.5 h-3.5" />
                    </div>
                  </a>
                ))}
              </div>

              <div className="pt-4 mt-2">
                <button
                  type="button"
                  onClick={onClosePhoneSelectModal}
                  className="btn-secondary w-full py-2.5 font-bold"
                >
                  Vazgeç / Kapat
                </button>
              </div>
            </div>
          </div>
        );
      })()}
    </>
  );
}

