'use client';

import { Dispatch, SetStateAction } from 'react';
import {
  Route as RouteIcon,
  Plus,
  ArrowUp,
  ArrowDown,
  CheckSquare,
  Square,
  Search,
  PenTool,
  Check,
  ArrowRight,
  ArrowUpDown,
  Play,
} from 'lucide-react';
import { getRecordStreetInfo, getBeneficiaryListTypeInfo } from '@/lib/normalizer';

export interface RouteCreationModalsProps {
  showAddToExistingModal: boolean;
  setShowAddToExistingModal: Dispatch<SetStateAction<boolean>>;
  addToRouteTargetId: string;
  setAddToRouteTargetId: Dispatch<SetStateAction<string>>;
  activeRoutes: any[];
  addToRouteSelectedIds: string[];
  setAddToRouteSelectedIds: Dispatch<SetStateAction<string[]>>;
  availableSignedBeneficiaries: any[];
  addToRouteSearch: string;
  setAddToRouteSearch: Dispatch<SetStateAction<string>>;
  handleAddStopsToExistingRoute: () => Promise<void>;
  showCreateModal: boolean;
  setShowCreateModal: Dispatch<SetStateAction<boolean>>;
  newRouteName: string;
  setNewRouteName: Dispatch<SetStateAction<string>>;
  newRoutePlate: string;
  setNewRoutePlate: Dispatch<SetStateAction<string>>;
  newRouteStaff: string;
  setNewRouteStaff: Dispatch<SetStateAction<string>>;
  createModalStep: 'SELECT' | 'ORDER';
  setCreateModalStep: Dispatch<SetStateAction<'SELECT' | 'ORDER'>>;
  selectedBeneficiaryIds: string[];
  createSearchQuery: string;
  setCreateSearchQuery: Dispatch<SetStateAction<string>>;
  modalDisplayList: any[];
  handleSelectAllInView: (list: any[]) => void;
  handleToggleBeneficiary: (id: string) => void;
  orderedCreateStops: any[];
  handleSortCreateStopsByAddress: () => void;
  handleReverseCreateStops: () => void;
  handleMoveCreateStop: (index: number, direction: 'UP' | 'DOWN') => void;
  handleRemoveCreateStop: (id: string) => void;
  handleCreateRouteSubmit: (startRouteModeImmediately?: boolean) => Promise<void>;
  isActionLoading: boolean;
}

export default function RouteCreationModals({
  showAddToExistingModal,
  setShowAddToExistingModal,
  addToRouteTargetId,
  setAddToRouteTargetId,
  activeRoutes,
  addToRouteSelectedIds,
  setAddToRouteSelectedIds,
  availableSignedBeneficiaries,
  addToRouteSearch,
  setAddToRouteSearch,
  handleAddStopsToExistingRoute,
  showCreateModal,
  setShowCreateModal,
  newRouteName,
  setNewRouteName,
  newRoutePlate,
  setNewRoutePlate,
  newRouteStaff,
  setNewRouteStaff,
  createModalStep,
  setCreateModalStep,
  selectedBeneficiaryIds,
  createSearchQuery,
  setCreateSearchQuery,
  modalDisplayList,
  handleSelectAllInView,
  handleToggleBeneficiary,
  orderedCreateStops,
  handleSortCreateStopsByAddress,
  handleReverseCreateStops,
  handleMoveCreateStop,
  handleRemoveCreateStop,
  handleCreateRouteSubmit,
  isActionLoading,
}: RouteCreationModalsProps) {
  return (
    <>
      {/* ======================================================== */}
      {/* MODAL: VAR OLAN ROTAYA İMZALI HANE EKLEME MODALI         */}
      {/* ======================================================== */}
      {showAddToExistingModal && (
        <div className="modal-overlay" onClick={() => setShowAddToExistingModal(false)}>
          <div className="modal-sheet max-w-xl" onClick={(e) => e.stopPropagation()}>
            {/* Modal Header */}
            <div className="flex items-center justify-between pb-3 border-b border-slate-200 mb-3">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-emerald-100 text-emerald-800 flex items-center justify-center">
                  <Plus className="w-4 h-4 stroke-[2.5]" />
                </div>
                <div>
                  <h3 className="text-base font-extrabold text-slate-900">
                    Var Olan Rotaya İmzalı Hane Ekle
                  </h3>
                  <p className="text-xs text-slate-500">
                    Boştaki imzalı haneleri sahadaki aktif bir ekibe dahil edin
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowAddToExistingModal(false)}
                className="w-8 h-8 rounded-lg flex items-center justify-center text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors"
              >
                ✕
              </button>
            </div>

            {/* Target Route Selector */}
            <div className="space-y-3.5">
              <div>
                <label className="block text-xs font-black uppercase tracking-wider text-slate-700 mb-1.5">
                  1. Hedef Dağıtım Ekibi / Rota Seçiniz:
                </label>
                <select
                  value={addToRouteTargetId}
                  onChange={(e) => setAddToRouteTargetId(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 bg-white font-bold text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-500 shadow-2xs"
                >
                  {activeRoutes.map((r) => (
                    <option key={r.id || r._id} value={r.id || r._id}>
                      {r.rota_adi} — {r.dagitim_personeli || 'Personel'} (
                      {r.duraklar?.length || 0} Hane Mevcut)
                    </option>
                  ))}
                </select>
              </div>

              {/* Beneficiaries Selection */}
              <div>
                <div className="flex items-center justify-between mb-1.5 flex-wrap gap-2">
                  <label className="text-xs font-black uppercase tracking-wider text-slate-700">
                    2. Eklenecek İmzalı Haneleri Seçiniz ({addToRouteSelectedIds.length} /{' '}
                    {availableSignedBeneficiaries.length}):
                  </label>
                  <button
                    type="button"
                    onClick={() => {
                      const allIds = availableSignedBeneficiaries.map((b: any) =>
                        String(b.id || b._id)
                      );
                      if (addToRouteSelectedIds.length === allIds.length) {
                        setAddToRouteSelectedIds([]);
                      } else {
                        setAddToRouteSelectedIds(allIds);
                      }
                    }}
                    className="text-xs font-extrabold text-emerald-800 hover:underline cursor-pointer"
                  >
                    {addToRouteSelectedIds.length === availableSignedBeneficiaries.length
                      ? 'Seçimi Temizle'
                      : 'Tümünü Seç'}
                  </button>
                </div>

                {/* Filter / Search input */}
                <div className="relative mb-2">
                  <input
                    type="text"
                    value={addToRouteSearch}
                    onChange={(e) => setAddToRouteSearch(e.target.value)}
                    placeholder="Hane adı, soyadı veya mahalle ara..."
                    className="w-full px-3 py-1.5 pl-8 rounded-lg border border-slate-300 text-xs text-slate-800 focus:outline-none focus:border-emerald-500"
                  />
                  <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-2.5" />
                  {addToRouteSearch && (
                    <button
                      type="button"
                      onClick={() => setAddToRouteSearch('')}
                      className="absolute right-2.5 top-2 text-slate-400 hover:text-slate-600 text-xs font-bold"
                    >
                      ✕
                    </button>
                  )}
                </div>

                {/* Scrollable List */}
                <div className="max-h-60 overflow-y-auto space-y-1.5 border border-slate-200 rounded-xl p-2 bg-slate-50/50">
                  {availableSignedBeneficiaries
                    .filter((b: any) => {
                      if (!addToRouteSearch.trim()) return true;
                      const q = addToRouteSearch.toLowerCase();
                      return (
                        (b.ad_soyad || '').toLowerCase().includes(q) ||
                        (b.mahalle || '').toLowerCase().includes(q) ||
                        (b.tc_no || '').includes(q)
                      );
                    })
                    .map((b: any) => {
                      const bId = String(b.id || b._id);
                      const isSelected = addToRouteSelectedIds.includes(bId);
                      const stInfo = getRecordStreetInfo(b);
                      return (
                        <div
                          key={bId}
                          onClick={() => {
                            setAddToRouteSelectedIds((prev) =>
                              prev.includes(bId)
                                ? prev.filter((id) => id !== bId)
                                : [...prev, bId]
                            );
                          }}
                          className={`p-2.5 rounded-xl border flex items-center justify-between gap-2.5 cursor-pointer transition-all ${
                            isSelected
                              ? 'bg-emerald-50/90 border-emerald-400 ring-1 ring-emerald-400'
                              : 'bg-white border-slate-200 hover:bg-slate-50'
                          }`}
                        >
                          <div className="flex items-center gap-2.5 min-w-0">
                            <input
                              type="checkbox"
                              checked={isSelected}
                              onChange={() => {}}
                              className="w-4 h-4 rounded text-emerald-600 focus:ring-emerald-500 shrink-0"
                            />
                            <div className="min-w-0">
                              <div className="flex items-center gap-1.5">
                                <span className="text-xs font-black text-slate-900 truncate">
                                  {b.ad_soyad}
                                </span>
                                <span className="text-[10px] font-mono text-slate-500 font-semibold">
                                  {b.tc_no}
                                </span>
                              </div>
                              <p className="text-[11px] text-slate-500 font-medium truncate">
                                {b.mahalle ? `${b.mahalle} Mah.` : ''}{' '}
                                {stInfo.sokak
                                  ? `${stInfo.sokak} No:${stInfo.kapiNo || ''}`
                                  : b.adres || ''}
                              </p>
                            </div>
                          </div>

                          <span className="text-[11px] font-mono font-bold bg-amber-100 text-amber-900 px-2 py-0.5 rounded-md border border-amber-300 shrink-0">
                            {b.hedef_torba || 34} Torba
                          </span>
                        </div>
                      );
                    })}

                  {availableSignedBeneficiaries.length === 0 && (
                    <div className="p-4 text-center text-xs text-slate-500">
                      Rotaya eklenebilecek boşta imzalı hane bulunmuyor.
                    </div>
                  )}
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-200">
                <button
                  type="button"
                  onClick={() => setShowAddToExistingModal(false)}
                  className="px-4 py-2 rounded-xl border border-slate-300 bg-white hover:bg-slate-100 text-slate-700 text-xs font-bold transition-all active:scale-95 cursor-pointer"
                >
                  Vazgeç
                </button>
                <button
                  type="button"
                  onClick={handleAddStopsToExistingRoute}
                  disabled={isActionLoading || addToRouteSelectedIds.length === 0}
                  className="px-5 py-2 rounded-xl text-xs font-black text-white bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1.5 transition-all active:scale-95 shadow-xs cursor-pointer"
                  style={{
                    background: 'linear-gradient(135deg, #059669 0%, #0f766e 100%)',
                    color: '#ffffff',
                  }}
                >
                  <Plus className="w-4 h-4 stroke-[2.5]" />
                  <span>
                    {addToRouteSelectedIds.length > 0
                      ? `Seçilen ${addToRouteSelectedIds.length} Haneyi Rotaya Ekle`
                      : 'Hane Seçiniz'}
                  </span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ======================================================== */}
      {/* MODAL 1: YENİ ROTA OLUŞTURMA MODALI                      */}
      {/* ======================================================== */}
      {showCreateModal && (
        <div className="modal-overlay" onClick={() => setShowCreateModal(false)}>
          <div className="modal-sheet" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between pb-3 border-b border-slate-200 mb-3">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-sky-100 text-sky-800 flex items-center justify-center">
                  <RouteIcon className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-base font-extrabold text-slate-900">Yeni Dağıtım Rotası</h3>
                  <p className="text-xs text-slate-500">
                    Kamyon dağıtımı için durakları belirleyin
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowCreateModal(false)}
                className="text-slate-400 hover:text-slate-700 p-1"
              >
                ✕
              </button>
            </div>

            {/* Rota Adı & Araç Bilgileri Formu */}
            <div className="space-y-2.5 mb-3">
              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1">Rota Başlığı</label>
                <input
                  type="text"
                  value={newRouteName}
                  onChange={(e) => setNewRouteName(e.target.value)}
                  placeholder="Örn: 14 Ekim Cumhuriyet & Fatih Dağıtımı"
                  className="w-full px-3 py-2 rounded-xl bg-slate-50 border border-slate-200 text-xs font-medium text-slate-900 focus:outline-none focus:border-sky-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-xs font-bold text-slate-700 block mb-1">Araç Plakası</label>
                  <input
                    type="text"
                    value={newRoutePlate}
                    onChange={(e) => setNewRoutePlate(e.target.value)}
                    placeholder="Örn: 34 KM 101"
                    className="w-full px-3 py-2 rounded-xl bg-slate-50 border border-slate-200 text-xs font-medium text-slate-900 focus:outline-none focus:border-sky-500"
                  />
                </div>
                <div>
                  <label className="text-xs font-bold text-slate-700 block mb-1">
                    Dağıtım Personeli
                  </label>
                  <input
                    type="text"
                    value={newRouteStaff}
                    onChange={(e) => setNewRouteStaff(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl bg-slate-50 border border-slate-200 text-xs font-medium text-slate-900 focus:outline-none focus:border-sky-500"
                  />
                </div>
              </div>
            </div>

            {/* 2 ADIMLI MODAL SEÇİMİ: 1. Haneleri Seç | 2. Sıralamayı Belirle */}
            <div className="flex items-center gap-1.5 p-1 bg-slate-100 rounded-xl border border-slate-200 mb-3">
              <button
                type="button"
                onClick={() => setCreateModalStep('SELECT')}
                className={`flex-1 py-1.5 px-2 rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-1.5 ${
                  createModalStep === 'SELECT'
                    ? 'bg-white text-slate-900 shadow-xs font-black'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <CheckSquare className="w-3.5 h-3.5 text-sky-600" />
                <span>1. Haneleri Seç ({selectedBeneficiaryIds.length})</span>
              </button>

              <button
                type="button"
                onClick={() => setCreateModalStep('ORDER')}
                className={`flex-1 py-1.5 px-2 rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-1.5 ${
                  createModalStep === 'ORDER'
                    ? 'bg-white text-slate-900 shadow-xs font-black'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <RouteIcon className="w-3.5 h-3.5 text-emerald-600" />
                <span>2. Sırayı Belirle ({selectedBeneficiaryIds.length})</span>
              </button>
            </div>

            {/* ADIM 1: HANE SEÇİMİ */}
            {createModalStep === 'SELECT' && (
              <>
                {/* Hane Kaynak Bilgisi: Yalnızca İmzası Alınmış ve Teslim Edilmemiş Haneler */}
                <div className="p-2.5 bg-emerald-50 rounded-xl border border-emerald-200 flex items-center justify-between gap-2 mb-2.5">
                  <div className="flex items-center gap-2 text-xs font-extrabold text-emerald-900">
                    <PenTool className="w-4 h-4 text-emerald-700 shrink-0" />
                    <span>
                      İmzası Alınan &amp; Teslimat Bekleyen Haneler (
                      {availableSignedBeneficiaries.length})
                    </span>
                  </div>
                </div>

                {/* Arama & Toplu Seçim */}
                <div className="flex items-center justify-between gap-2 mb-2">
                  <div className="relative flex-1">
                    <Search className="w-3.5 h-3.5 absolute left-2.5 top-2.5 text-slate-400 pointer-events-none" />
                    <input
                      type="text"
                      value={createSearchQuery}
                      onChange={(e) => setCreateSearchQuery(e.target.value)}
                      placeholder="TC Kimlik No veya Adı Soyadı ara..."
                      className="w-full pl-8 pr-3 py-1.5 rounded-lg bg-slate-50 border border-slate-200 text-xs text-slate-900 focus:outline-none focus:border-sky-500"
                    />
                  </div>

                  <button
                    type="button"
                    onClick={() => handleSelectAllInView(modalDisplayList)}
                    className="px-2.5 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold flex items-center gap-1 shrink-0"
                  >
                    {modalDisplayList.length > 0 &&
                    modalDisplayList.every((b) =>
                      selectedBeneficiaryIds.includes(String(b.id))
                    ) ? (
                      <>
                        <CheckSquare className="w-3.5 h-3.5 text-sky-600" />
                        <span>Seçimi Kaldır</span>
                      </>
                    ) : (
                      <>
                        <Square className="w-3.5 h-3.5 text-slate-400" />
                        <span>Tümünü Seç</span>
                      </>
                    )}
                  </button>
                </div>

                {/* Hane Listesi */}
                <div className="py-1 space-y-1.5 max-h-56 overflow-y-auto pr-0.5">
                  {modalDisplayList.map((person) => {
                    const isSelected = selectedBeneficiaryIds.includes(String(person.id));
                    const st = getRecordStreetInfo(person);
                    const personListInfo = getBeneficiaryListTypeInfo(person);

                    return (
                      <div
                        key={person.id}
                        onClick={() => handleToggleBeneficiary(String(person.id))}
                        className={`p-2.5 rounded-xl border flex items-center justify-between cursor-pointer transition-all ${
                          isSelected
                            ? 'bg-sky-50 border-sky-300 text-slate-900 shadow-2xs'
                            : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'
                        }`}
                      >
                        <div className="flex items-center gap-2.5 min-w-0">
                          <div
                            className={`w-4 h-4 rounded flex items-center justify-center border shrink-0 ${
                              isSelected
                                ? 'bg-sky-600 border-sky-700 text-white'
                                : 'border-slate-300 bg-white'
                            }`}
                          >
                            {isSelected && <Check className="w-3 h-3" />}
                          </div>

                          <div className="min-w-0">
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <span className="text-xs font-bold text-slate-900 truncate">
                                {person.ad_soyad}
                              </span>
                              <span
                                className={`text-[9px] font-extrabold px-1.5 py-0.2 rounded border ${personListInfo.badgeClass}`}
                                title={`${personListInfo.folderLabel} (Sıra: #${person.sira_no || person.mahalle_sira || person.id})`}
                              >
                                {personListInfo.badgeLabel}
                              </span>
                              {person.imza_durumu === 'IMZALANDI' && (
                                <span className="text-[9px] font-extrabold text-emerald-800 bg-emerald-100 px-1 py-0.2 rounded border border-emerald-200">
                                  İmzalı
                                </span>
                              )}
                            </div>
                            <div className="text-[11px] text-slate-500 truncate">
                              {person.mahalle} • {st.sokak || person.acik_adres}{' '}
                              {st.kapiNo && st.kapiNo !== 999999 && st.kapiNo !== '999999'
                                ? `No: ${st.kapiNo}`
                                : ''}
                              {st.daireNo > 0 ? ` D: ${st.daireNo}` : ''}
                            </div>
                          </div>
                        </div>

                        <span className="text-[11px] font-bold text-slate-700 shrink-0 ml-2">
                          {person.hedef_torba || 34} Torba
                        </span>
                      </div>
                    );
                  })}

                  {modalDisplayList.length === 0 && (
                    <div className="p-6 text-center text-xs text-slate-500">
                      İmzası alınmış ve kömürü teslim edilmemiş eşleşen hane bulunamadı.
                    </div>
                  )}
                </div>

                {/* Adım 1 Alt Butonlar */}
                <div className="pt-3 border-t border-slate-200 flex gap-2">
                  <button
                    type="button"
                    onClick={() => setShowCreateModal(false)}
                    className="btn-secondary flex-1 text-xs py-2.5 font-bold"
                  >
                    Vazgeç
                  </button>
                  <button
                    type="button"
                    onClick={() => setCreateModalStep('ORDER')}
                    disabled={selectedBeneficiaryIds.length === 0}
                    className="btn-primary flex-1 text-xs py-2.5 font-bold flex items-center justify-center gap-1.5"
                  >
                    <span>Sıralamayı Belirle ({selectedBeneficiaryIds.length})</span>
                    <ArrowRight className="w-4 h-4" />
                  </button>
                </div>
              </>
            )}

            {/* ADIM 2: DURAK SIRALAMASINI PERSONELİN BELİRLEMESİ */}
            {createModalStep === 'ORDER' && (
              <>
                {/* Sıralama Araç Çubuğu */}
                <div className="p-2.5 bg-sky-50 rounded-xl border border-sky-200 mb-2.5 space-y-2">
                  <div className="flex items-center justify-between">
                    <div>
                      <h4 className="text-xs font-black text-sky-950 flex items-center gap-1">
                        <RouteIcon className="w-3.5 h-3.5 text-sky-700" />
                        <span>Kamyon Dağıtım Sırası</span>
                      </h4>
                      <p className="text-[11px] text-sky-800">
                        Sırayı telefonunuzdan{' '}
                        <strong className="font-extrabold">▲ / ▼</strong> butonlarıyla
                        belirleyin.
                      </p>
                    </div>

                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={handleSortCreateStopsByAddress}
                        className="px-2 py-1 rounded-lg bg-white hover:bg-sky-100 text-sky-900 text-[11px] font-bold border border-sky-300 flex items-center gap-1 shadow-2xs active:scale-95"
                        title="Adrese ve kapı numarasına göre doğal sırala"
                      >
                        <ArrowUpDown className="w-3 h-3 text-sky-700" />
                        <span className="hidden sm:inline">Adrese Göre</span> Diz
                      </button>
                      <button
                        type="button"
                        onClick={handleReverseCreateStops}
                        className="px-2 py-1 rounded-lg bg-white hover:bg-sky-100 text-sky-900 text-[11px] font-bold border border-sky-300 flex items-center gap-1 shadow-2xs active:scale-95"
                        title="Sırayı tersine çevir"
                      >
                        <span>🔄</span>
                        <span className="hidden sm:inline">Ters</span> Çevir
                      </button>
                    </div>
                  </div>
                </div>

                {/* Sıralı Duraklar Listesi */}
                <div className="py-1 space-y-2 max-h-60 overflow-y-auto pr-0.5">
                  {orderedCreateStops.map((person, index) => {
                    const st = getRecordStreetInfo(person);
                    const isFirst = index === 0;
                    const isLast = index === orderedCreateStops.length - 1;

                    return (
                      <div
                        key={person.id}
                        className="p-2.5 rounded-xl bg-white border border-slate-200 flex items-center justify-between gap-2 shadow-2xs hover:border-sky-300 transition-all"
                      >
                        {/* Sol Taraf: Sıra Numarası & Hane Bilgisi */}
                        <div className="flex items-center gap-2.5 min-w-0 flex-1">
                          <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-lg bg-sky-600 text-white font-black text-xs sm:text-sm flex items-center justify-center shrink-0 shadow-xs">
                            #{index + 1}
                          </div>

                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <span className="text-xs font-extrabold text-slate-900 truncate">
                                {person.ad_soyad}
                              </span>
                              {person.imza_durumu === 'IMZALANDI' ? (
                                <span className="text-[9px] font-extrabold text-emerald-800 bg-emerald-100 px-1.5 py-0.2 rounded border border-emerald-200 flex items-center gap-0.5">
                                  <PenTool className="w-2.5 h-2.5 text-emerald-700" />
                                  İmzalı
                                </span>
                              ) : (
                                <span className="text-[9px] font-bold text-slate-500 bg-slate-100 px-1 py-0.2 rounded">
                                  İmzasız
                                </span>
                              )}
                              <span className="text-[10px] font-bold text-slate-600 font-mono">
                                ({person.hedef_torba || 34} T)
                              </span>
                            </div>

                            <div className="text-[11px] text-slate-600 truncate mt-0.5">
                              <strong className="text-slate-800">{person.mahalle}</strong>
                              {st.sokak && <span> • {st.sokak}</span>}
                              {st.kapiNo &&
                              st.kapiNo !== 999999 &&
                              st.kapiNo !== '999999' ? (
                                <span> No:{st.kapiNo}</span>
                              ) : null}
                              {st.daireNo && st.daireNo > 0 ? (
                                <span> D:{st.daireNo}</span>
                              ) : null}
                            </div>
                          </div>
                        </div>

                        {/* Sağ Taraf: Dokunmatik Büyük ▲ / ▼ Butonları ve Çıkar */}
                        <div className="flex items-center gap-1 shrink-0">
                          {/* YUKARI BUTONU */}
                          <button
                            type="button"
                            onClick={() => handleMoveCreateStop(index, 'UP')}
                            disabled={isFirst}
                            className={`w-9 h-9 rounded-lg flex items-center justify-center border font-bold transition-all active:scale-90 ${
                              isFirst
                                ? 'bg-slate-50 border-slate-200 text-slate-300 cursor-not-allowed'
                                : 'bg-slate-100 hover:bg-sky-100 border-slate-300 text-slate-800 hover:text-sky-900 shadow-2xs'
                            }`}
                            title="Yukarı Taşı"
                            aria-label={`Durak ${index + 1} yukarı taşı`}
                          >
                            <ArrowUp className="w-4 h-4 stroke-[2.5]" />
                          </button>

                          {/* AŞAĞI BUTONU */}
                          <button
                            type="button"
                            onClick={() => handleMoveCreateStop(index, 'DOWN')}
                            disabled={isLast}
                            className={`w-9 h-9 rounded-lg flex items-center justify-center border font-bold transition-all active:scale-90 ${
                              isLast
                                ? 'bg-slate-50 border-slate-200 text-slate-300 cursor-not-allowed'
                                : 'bg-slate-100 hover:bg-sky-100 border-slate-300 text-slate-800 hover:text-sky-900 shadow-2xs'
                            }`}
                            title="Aşağı Taşı"
                            aria-label={`Durak ${index + 1} aşağı taşı`}
                          >
                            <ArrowDown className="w-4 h-4 stroke-[2.5]" />
                          </button>

                          {/* LİSTEDEN ÇIKAR BUTONU */}
                          <button
                            type="button"
                            onClick={() => handleRemoveCreateStop(String(person.id))}
                            className="w-8 h-8 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 flex items-center justify-center transition-all ml-0.5"
                            title="Listeden Kaldır"
                            aria-label="Listeden kaldır"
                          >
                            ✕
                          </button>
                        </div>
                      </div>
                    );
                  })}

                  {orderedCreateStops.length === 0 && (
                    <div className="p-8 text-center text-xs text-slate-500">
                      Henüz rotaya eklenmiş hane yok. Lütfen &quot;1. Haneleri Seç&quot;
                      sekmesine dönerek hane seçiniz.
                    </div>
                  )}
                </div>

                {/* Adım 2 Alt Butonlar */}
                <div className="pt-3 border-t border-slate-200 flex flex-col sm:flex-row gap-2">
                  <button
                    type="button"
                    onClick={() => setCreateModalStep('SELECT')}
                    className="btn-secondary text-xs py-2.5 px-3 font-bold"
                  >
                    ← Hane Seçimi
                  </button>
                  <button
                    type="button"
                    onClick={() => handleCreateRouteSubmit(false)}
                    disabled={isActionLoading || selectedBeneficiaryIds.length === 0}
                    className="btn-secondary flex-1 text-xs py-2.5 font-bold flex items-center justify-center gap-1.5"
                  >
                    <span>Sadece Rotayı Kaydet</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => handleCreateRouteSubmit(true)}
                    disabled={isActionLoading || selectedBeneficiaryIds.length === 0}
                    className="btn-primary flex-1 text-xs py-2.5 font-black flex items-center justify-center gap-1.5"
                  >
                    {isActionLoading ? (
                      <span>Oluşturuluyor...</span>
                    ) : (
                      <>
                        <Play className="w-4 h-4 fill-white" />
                        <span>
                          Rotayı Başlat &amp; Rota Moduna Gir ({selectedBeneficiaryIds.length})
                        </span>
                      </>
                    )}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </>
  );
}
