'use client';

import { Dispatch, SetStateAction } from 'react';
import {
  CheckCircle2,
  AlertTriangle,
  XCircle,
  CheckSquare,
  Square,
  Trash2,
} from 'lucide-react';
import CancelModal from '@/components/CancelModal';

export interface RouteActionModalsProps {
  showStopModal: {
    stopIndex: number;
    stop: any;
    mode: 'TAMAMLANDI' | 'EKSIK' | 'TESLIM_EDILEMEDI';
  } | null;
  setShowStopModal: Dispatch<
    SetStateAction<{
      stopIndex: number;
      stop: any;
      mode: 'TAMAMLANDI' | 'EKSIK' | 'TESLIM_EDILEMEDI';
    } | null>
  >;
  stopTorbaInput: string;
  setStopTorbaInput: Dispatch<SetStateAction<string>>;
  stopRecipientInput: string;
  setStopRecipientInput: Dispatch<SetStateAction<string>>;
  stopNoteInput: string;
  setStopNoteInput: Dispatch<SetStateAction<string>>;
  stopDeferLaterInput: boolean;
  setStopDeferLaterInput: Dispatch<SetStateAction<boolean>>;
  handleStopActionSubmit: () => Promise<void>;
  showFinalizeModal: boolean;
  setShowFinalizeModal: Dispatch<SetStateAction<boolean>>;
  activeRoute: any | null;
  finalizeNote: string;
  setFinalizeNote: Dispatch<SetStateAction<string>>;
  handleFinalizeRouteSubmit: () => Promise<void>;
  showDeleteConfirm: boolean;
  setShowDeleteConfirm: Dispatch<SetStateAction<boolean>>;
  handleDeleteRoute: () => Promise<void>;
  cancelStopTarget: any | null;
  setCancelStopTarget: Dispatch<SetStateAction<any | null>>;
  userName: string;
  handleCancelStopSuccess: () => Promise<void>;
  isActionLoading: boolean;
}

export default function RouteActionModals({
  showStopModal,
  setShowStopModal,
  stopTorbaInput,
  setStopTorbaInput,
  stopRecipientInput,
  setStopRecipientInput,
  stopNoteInput,
  setStopNoteInput,
  stopDeferLaterInput,
  setStopDeferLaterInput,
  handleStopActionSubmit,
  showFinalizeModal,
  setShowFinalizeModal,
  activeRoute,
  finalizeNote,
  setFinalizeNote,
  handleFinalizeRouteSubmit,
  showDeleteConfirm,
  setShowDeleteConfirm,
  handleDeleteRoute,
  cancelStopTarget,
  setCancelStopTarget,
  userName,
  handleCancelStopSuccess,
  isActionLoading,
}: RouteActionModalsProps) {
  return (
    <>
      {/* ======================================================== */}
      {/* MODAL 2: DURAK İŞLEM MODALI (Tamam / Eksik / Verilemedi)  */}
      {/* ======================================================== */}
      {showStopModal && (
        <div className="modal-overlay" onClick={() => setShowStopModal(null)}>
          <div className="modal-sheet" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between pb-3 border-b border-slate-200 mb-3">
              <div className="flex items-center gap-2">
                <div
                  className={`w-8 h-8 rounded-lg flex items-center justify-center ${
                    showStopModal.mode === 'TAMAMLANDI'
                      ? 'bg-emerald-100 text-emerald-800'
                      : showStopModal.mode === 'EKSIK'
                      ? 'bg-amber-100 text-amber-800'
                      : 'bg-rose-100 text-rose-800'
                  }`}
                >
                  {showStopModal.mode === 'TAMAMLANDI' ? (
                    <CheckCircle2 className="w-4 h-4" />
                  ) : showStopModal.mode === 'EKSIK' ? (
                    <AlertTriangle className="w-4 h-4" />
                  ) : (
                    <XCircle className="w-4 h-4" />
                  )}
                </div>
                <div>
                  <h3 className="text-base font-extrabold text-slate-900">
                    {showStopModal.mode === 'TAMAMLANDI'
                      ? 'Tam Teslimat Kaydı'
                      : showStopModal.mode === 'EKSIK'
                      ? 'Eksik Kömür Teslimatı'
                      : 'Teslim Edilemedi / Daha Sonra'}
                  </h3>
                  <p className="text-xs text-slate-500 font-medium">
                    {showStopModal.stop?.sira}. Durak: {showStopModal.stop?.ad_soyad}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowStopModal(null)}
                className="text-slate-400 hover:text-slate-700 p-1"
              >
                ✕
              </button>
            </div>

            {/* Vatandaş Özet Kartı */}
            <div className="p-3 rounded-xl bg-slate-50 border border-slate-200 mb-3 space-y-1">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-slate-900">
                  {showStopModal.stop?.ad_soyad}
                </span>
                <span className="text-xs font-mono font-bold text-amber-800">
                  TC: {showStopModal.stop?.tc_no}
                </span>
              </div>
              <p className="text-xs text-slate-600 truncate">
                {showStopModal.stop?.acik_adres}
              </p>
              <div className="text-[11px] font-bold text-slate-500">
                Hedef Kota:{' '}
                <strong className="text-slate-900">
                  {showStopModal.stop?.hedef_torba || 34} Torba
                </strong>
              </div>
            </div>

            {/* Form Alanları */}
            <div className="space-y-3">
              {showStopModal.mode !== 'TESLIM_EDILEMEDI' && (
                <div>
                  <label className="text-xs font-bold text-slate-700 block mb-1">
                    {showStopModal.mode === 'TAMAMLANDI'
                      ? 'Teslim Edilen Torba'
                      : 'Kamyondan Verilen Torba'}
                  </label>
                  <input
                    type="number"
                    value={stopTorbaInput}
                    onChange={(e) => setStopTorbaInput(e.target.value)}
                    min="1"
                    max={showStopModal.stop?.hedef_torba || 34}
                    className="w-full px-3 py-2.5 rounded-xl bg-white border border-slate-200 text-sm font-mono font-black text-slate-900 focus:outline-none focus:border-sky-500"
                  />
                  {showStopModal.mode === 'EKSIK' && (
                    <p className="text-[11px] font-bold text-amber-800 mt-1">
                      Kalan Eksik Kömür:{' '}
                      {Math.max(
                        0,
                        (showStopModal.stop?.hedef_torba || 34) -
                          (parseInt(stopTorbaInput, 10) || 0)
                      )}{' '}
                      Torba
                    </p>
                  )}
                </div>
              )}

              {showStopModal.mode !== 'TESLIM_EDILEMEDI' && (
                <div>
                  <label className="text-xs font-bold text-slate-700 block mb-1">
                    Teslim Alan Kişi
                  </label>
                  <input
                    type="text"
                    value={stopRecipientInput}
                    onChange={(e) => setStopRecipientInput(e.target.value)}
                    placeholder="Ad Soyad veya Yakını"
                    className="w-full px-3 py-2 rounded-xl bg-white border border-slate-200 text-xs font-medium text-slate-900 focus:outline-none focus:border-sky-500"
                  />
                </div>
              )}

              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1">
                  {showStopModal.mode === 'TESLIM_EDILEMEDI'
                    ? 'Teslim Edilememe / Erteleme Nedeni'
                    : 'Açıklama / Not'}
                </label>
                <input
                  type="text"
                  value={stopNoteInput}
                  onChange={(e) => setStopNoteInput(e.target.value)}
                  placeholder={
                    showStopModal.mode === 'TESLIM_EDILEMEDI'
                      ? 'Örn: Evde yok - Daha sonra tamamlanacak...'
                      : 'Opsiyonel not ekleyin'
                  }
                  className="w-full px-3 py-2 rounded-xl bg-white border border-slate-200 text-xs font-medium text-slate-900 focus:outline-none focus:border-sky-500"
                />
              </div>

              {/* Daha Sonra Tamamlanacak Seçeneği (Eksik veya Verilemedi ise) */}
              {showStopModal.mode !== 'TAMAMLANDI' && (
                <button
                  type="button"
                  onClick={() => setStopDeferLaterInput((v) => !v)}
                  className={`w-full p-2.5 rounded-xl border text-left flex items-center justify-between gap-2 transition-all ${
                    stopDeferLaterInput
                      ? 'bg-amber-50 border-amber-400 text-amber-950'
                      : 'bg-slate-50 border-slate-200 text-slate-600'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    {stopDeferLaterInput ? (
                      <CheckSquare className="w-4 h-4 text-amber-700 shrink-0" />
                    ) : (
                      <Square className="w-4 h-4 text-slate-400 shrink-0" />
                    )}
                    <div>
                      <span className="text-xs font-black block">
                        ⏳ Daha Sonra Tamamlanacak Olarak İşaretle
                      </span>
                      <span className="text-[10px] font-medium opacity-80 block">
                        Sonraki kayda geçilir; son kayıt ise rota geçici olarak durdurulur.
                      </span>
                    </div>
                  </div>
                </button>
              )}

              {/* Hızlı Seçim Butonları (Teslim Edilemediğinde) */}
              {showStopModal.mode === 'TESLIM_EDILEMEDI' && (
                <div className="flex flex-wrap gap-1.5 pt-1">
                  {[
                    'Evde yok - Daha sonra tamamlanacak',
                    'Kamyonda kömür bitti - Sonra verilecek',
                    'Sokak kapalı - Daha sonra girilecek',
                    'Adreste bulunamadı',
                  ].map((quick) => (
                    <button
                      key={quick}
                      type="button"
                      onClick={() => setStopNoteInput(quick)}
                      className="text-[11px] font-semibold px-2.5 py-1 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-200"
                    >
                      {quick}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Modal Butonları */}
            <div className="pt-4 border-t border-slate-200 flex gap-2 mt-4">
              <button
                type="button"
                onClick={() => setShowStopModal(null)}
                className="btn-secondary flex-1 text-xs py-2.5 font-bold"
              >
                Vazgeç
              </button>
              <button
                type="button"
                onClick={handleStopActionSubmit}
                disabled={isActionLoading}
                className={`flex-1 text-xs py-2.5 font-black text-white rounded-xl shadow-xs transition-all active:scale-95 ${
                  showStopModal.mode === 'TAMAMLANDI'
                    ? 'bg-emerald-600 hover:bg-emerald-700'
                    : showStopModal.mode === 'EKSIK'
                    ? 'bg-amber-600 hover:bg-amber-700'
                    : 'bg-rose-600 hover:bg-rose-700'
                }`}
              >
                {isActionLoading ? 'Kaydediliyor...' : 'Kaydet ve İlerle'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ======================================================== */}
      {/* MODAL 3: GÜNÜ BİTİR / ROTAYI TAMAMLA & ARŞİVLE MODALI     */}
      {/* ======================================================== */}
      {showFinalizeModal && activeRoute && (
        <div className="modal-overlay" onClick={() => setShowFinalizeModal(false)}>
          <div className="modal-sheet" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between pb-3 border-b border-slate-200 mb-3">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-emerald-100 text-emerald-800 flex items-center justify-center">
                  <CheckCircle2 className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-base font-extrabold text-slate-900">Rotayı Tamamla</h3>
                  <p className="text-xs text-slate-500">Rotayı tamamla ve arşive kaldır</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowFinalizeModal(false)}
                className="text-slate-400 hover:text-slate-700 p-1"
              >
                ✕
              </button>
            </div>

            {/* Rota Özeti */}
            <div className="p-3.5 rounded-2xl bg-slate-50 border border-slate-200 space-y-2 mb-3">
              <h4 className="text-xs font-black uppercase text-slate-700">Dağıtım Sonuçları:</h4>
              <div className="grid grid-cols-3 gap-2 text-center text-xs">
                <div className="p-2 rounded-xl bg-white border border-slate-200">
                  <span className="text-emerald-700 font-black text-sm block">
                    {activeRoute.tamamlanan_hane || 0}
                  </span>
                  <span className="text-[10px] text-slate-500 font-bold">Tam Hane</span>
                </div>
                <div className="p-2 rounded-xl bg-white border border-slate-200">
                  <span className="text-amber-700 font-black text-sm block">
                    {activeRoute.eksik_hane || 0}
                  </span>
                  <span className="text-[10px] text-slate-500 font-bold">Eksik Hane</span>
                </div>
                <div className="p-2 rounded-xl bg-white border border-slate-200">
                  <span className="text-rose-700 font-black text-sm block">
                    {activeRoute.teslim_edilemeyen_hane || 0}
                  </span>
                  <span className="text-[10px] text-slate-500 font-bold">Verilemedi</span>
                </div>
              </div>
              <p className="text-xs text-slate-600 font-medium pt-1">
                Toplam Dağıtılan Kömür:{' '}
                <strong className="text-slate-900 font-black">
                  {activeRoute.toplam_dagitilan_torba || 0} Torba
                </strong>
              </p>
            </div>

            {/* Rota Tamamlanma Durumu & Kural Kontrolü */}
            {(() => {
              const stops = activeRoute.duraklar || [];
              const noCoal = stops.filter((s: any) => {
                const delivered =
                  Number(s.teslim_edilen_torba) ||
                  (s.durum === 'TAMAMLANDI' ? Number(s.hedef_torba) || 34 : 0);
                const hasCoal =
                  (s.durum === 'TAMAMLANDI' || s.durum === 'EKSIK') && delivered > 0;
                return !hasCoal;
              });

              if (noCoal.length > 0) {
                return (
                  <div className="p-3.5 rounded-2xl bg-rose-50 border border-rose-300 text-rose-950 space-y-2 mb-3">
                    <div className="flex items-start gap-2">
                      <XCircle className="w-5 h-5 text-rose-600 shrink-0 mt-0.5" />
                      <div>
                        <strong className="text-xs font-black text-rose-900 block">
                          ⛔ Rota Tamamlanamaz: Hiç Kömür Verilmeyen {noCoal.length} Hane Var!
                        </strong>
                        <p className="text-[11px] font-medium text-rose-800 mt-1 leading-relaxed">
                          Rotayı tamamlayabilmek için rotadaki tüm hanelere kömür teslim
                          edilmesi gerekmektedir. İstisna olarak eksik kömür verilen olsa
                          bile tamamlama yapılabilir;{' '}
                          <strong>
                            ancak hiç kömür verilmeyen hane var ise tamamlanamaz.
                          </strong>
                        </p>
                      </div>
                    </div>

                    <div className="pt-1.5 border-t border-rose-200">
                      <span className="text-[10px] font-black uppercase tracking-wider text-rose-700 block mb-1">
                        Kömür Teslim Edilmeyen Haneler ({noCoal.length}):
                      </span>
                      <div className="max-h-28 overflow-y-auto space-y-1 pr-1">
                        {noCoal.map((s: any) => (
                          <div
                            key={s.beneficiary_id || s.sira}
                            className="flex items-center justify-between text-[11px] bg-white/90 px-2 py-1 rounded-lg border border-rose-200"
                          >
                            <span className="font-bold text-slate-800 truncate mr-2">
                              #{s.sira} {s.ad_soyad} {s.mahalle ? `(${s.mahalle})` : ''}
                            </span>
                            <span
                              className={`text-[10px] font-black px-1.5 py-0.5 rounded shrink-0 ${
                                s.durum === 'TESLIM_EDILEMEDI'
                                  ? 'bg-rose-100 text-rose-800'
                                  : 'bg-slate-100 text-slate-700'
                              }`}
                            >
                              {s.durum === 'TESLIM_EDILEMEDI'
                                ? 'Verilemedi (0 Torba)'
                                : 'Bekliyor'}
                            </span>
                          </div>
                        ))}
                      </div>
                      <p className="text-[10px] text-slate-500 font-medium mt-1">
                        İpucu: Hanelere kömür teslim edebilir veya ulaşılamayan haneleri
                        rotadan çıkararak kalan hanelerle rotayı kapatabilirsiniz.
                      </p>
                    </div>
                  </div>
                );
              }

              return (
                <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-300 text-emerald-900 text-xs font-semibold flex items-center gap-2 mb-3">
                  <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
                  <div>
                    <strong className="block text-emerald-950">
                      ✓ Tüm Hanelere Kömür Teslim Edildi
                    </strong>
                    <p className="text-[11px] font-normal text-emerald-800 mt-0.5">
                      Rotadaki tüm hanelere kömür verildi ({activeRoute.tamamlanan_hane || 0}{' '}
                      tam, {activeRoute.eksik_hane || 0} eksik teslimat). Rota arşive
                      kaldırılmaya uygundur.
                    </p>
                  </div>
                </div>
              );
            })()}

            <div>
              <label className="text-xs font-bold text-slate-700 block mb-1">
                Kapanış / Vardiya Notu
              </label>
              <textarea
                value={finalizeNote}
                onChange={(e) => setFinalizeNote(e.target.value)}
                placeholder="Örn: Rota dağıtımı tamamlandı. Araçta 15 torba kömür kaldı."
                rows={2}
                className="w-full px-3 py-2 rounded-xl bg-white border border-slate-200 text-xs font-medium text-slate-900 focus:outline-none focus:border-sky-500"
              />
            </div>

            {/* Modal Butonları */}
            {(() => {
              const stops = activeRoute.duraklar || [];
              const noCoal = stops.filter((s: any) => {
                const delivered =
                  Number(s.teslim_edilen_torba) ||
                  (s.durum === 'TAMAMLANDI' ? Number(s.hedef_torba) || 34 : 0);
                const hasCoal =
                  (s.durum === 'TAMAMLANDI' || s.durum === 'EKSIK') && delivered > 0;
                return !hasCoal;
              });
              const canFinalize = stops.length > 0 && noCoal.length === 0;

              return (
                <div className="pt-3 border-t border-slate-200 flex gap-2 mt-3">
                  <button
                    type="button"
                    onClick={() => setShowFinalizeModal(false)}
                    className="btn-secondary flex-1 text-xs py-2.5 font-bold"
                  >
                    Vazgeç
                  </button>
                  <button
                    type="button"
                    onClick={handleFinalizeRouteSubmit}
                    disabled={isActionLoading || !canFinalize}
                    className={`flex-1 text-xs py-2.5 font-black rounded-xl shadow-xs transition-all ${
                      canFinalize
                        ? 'text-white bg-emerald-600 hover:bg-emerald-700 active:scale-95'
                        : 'text-slate-400 bg-slate-200 cursor-not-allowed border border-slate-300'
                    }`}
                    title={
                      !canFinalize
                        ? 'Hiç kömür verilmeyen hane varken rota tamamlanamaz'
                        : undefined
                    }
                  >
                    {isActionLoading
                      ? 'Tamamlanıyor...'
                      : canFinalize
                      ? 'Onayla ve Arşivle'
                      : 'Hiç Kömür Verilmeyen Hane Var (Kapatılamaz)'}
                  </button>
                </div>
              );
            })()}
          </div>
        </div>
      )}

      {/* ======================================================== */}
      {/* MODAL 4: ROTA SİLME ONAYI                                */}
      {/* ======================================================== */}
      {showDeleteConfirm && (
        <div className="modal-overlay" onClick={() => setShowDeleteConfirm(false)}>
          <div className="modal-sheet" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center gap-3 mb-3">
              <div className="w-10 h-10 rounded-xl bg-rose-100 text-rose-700 flex items-center justify-center shrink-0">
                <Trash2 className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-base font-extrabold text-slate-900">Rotayı Sil</h3>
                <p className="text-xs text-slate-500">
                  Aktif dağıtım rotasını kaldırmak üzeresiniz
                </p>
              </div>
            </div>

            <p className="text-xs text-slate-600 leading-relaxed mb-4">
              Bu işlem aktif rotayı sistemden silecektir. Tamamlanmış olan kömür teslimat
              kayıtları vatandaş geçmişinde korunur. Devam etmek istiyor musunuz?
            </p>

            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setShowDeleteConfirm(false)}
                className="btn-secondary flex-1 text-xs py-2.5 font-bold"
              >
                Vazgeç
              </button>
              <button
                type="button"
                onClick={handleDeleteRoute}
                disabled={isActionLoading}
                className="flex-1 text-xs py-2.5 font-bold text-white bg-rose-600 hover:bg-rose-700 rounded-xl shadow-xs"
              >
                {isActionLoading ? 'Siliniyor...' : 'Evet, Rotayı Sil'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Teslimatı Geri Al / İptal Et Modal (Rota & Rota Modu) */}
      {cancelStopTarget && (
        <CancelModal
          beneficiary={cancelStopTarget}
          currentStaff={userName}
          onClose={() => setCancelStopTarget(null)}
          onSuccess={handleCancelStopSuccess}
        />
      )}
    </>
  );
}
