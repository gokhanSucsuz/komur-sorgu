'use client';

import { createPortal } from 'react-dom';
import { Route as RouteIcon, X, Download, Printer } from 'lucide-react';
import { getBeneficiaryListTypeInfo } from '@/lib/normalizer';
import { formatTrDate } from '@/lib/dateUtils';

export interface RoutePrintReportModalProps {
  printRoute: any | null;
  routeStaffList: string[];
  onClose: () => void;
}

export default function RoutePrintReportModal({
  printRoute,
  routeStaffList,
  onClose,
}: RoutePrintReportModalProps) {
  if (!printRoute || typeof document === 'undefined') return null;

  return createPortal(
    <div
      className="report-modal-overlay fixed inset-0 z-[100] flex items-center justify-center p-2 sm:p-4 md:p-6 bg-slate-950/80 backdrop-blur-xs"
      onClick={(e) => {
        if (e.target === e.currentTarget) {
          onClose();
        }
      }}
    >
      {/* Modal Panel: Sabit %92 ekran yüksekliği ve flex düzeni ile tüm içerik scroll edilir */}
      <div className="report-modal-card relative bg-white rounded-2xl sm:rounded-3xl w-full max-w-5xl h-[92vh] max-h-[92vh] flex flex-col shadow-2xl border border-slate-300 overflow-hidden z-10">
        {/* Modal Header: Daima üstte sabit kalır */}
        <div className="report-modal-header shrink-0 h-14 sm:h-16 px-4 sm:px-6 border-b border-slate-200 flex items-center justify-between bg-slate-100 z-20 no-print">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl bg-amber-600 text-white flex items-center justify-center shadow-xs shrink-0">
              <RouteIcon className="w-5 h-5" />
            </div>
            <div className="truncate">
              <h3 className="text-xs sm:text-sm md:text-base font-black text-slate-900 truncate">
                {printRoute.rota_adi || 'Günlük Kömür Dağıtım Rotası Tutanağı'}
              </h3>
              <p className="text-[10px] sm:text-xs text-slate-500 font-semibold flex items-center gap-1.5 flex-wrap">
                <span>
                  Tarih: <strong className="text-slate-800">{formatTrDate(printRoute.tarih)}</strong>
                </span>
                <span>•</span>
                <span>
                  Personel: <strong className="text-slate-800">{routeStaffList.join(', ')}</strong>
                </span>
                {(printRoute.arac_plaka || printRoute.arac_plakasi) && (
                  <>
                    <span>•</span>
                    <span>
                      Plaka:{' '}
                      <strong className="text-slate-800">
                        {printRoute.arac_plaka || printRoute.arac_plakasi}
                      </strong>
                    </span>
                  </>
                )}
                <span>•</span>
                <span>
                  Toplam:{' '}
                  <strong className="text-emerald-700">
                    {printRoute.toplam_hane || printRoute.duraklar?.length || 0} Hane
                  </strong>
                </span>
                <span>•</span>
                <span>
                  <strong className="text-amber-800">
                    {(
                      (printRoute.toplam_dagitilan_torba ||
                        printRoute.duraklar?.reduce(
                          (acc: number, d: any) => acc + (d.teslim_edilen_torba || 0),
                          0
                        ) ||
                        0) * 0.025
                    ).toFixed(2)}{' '}
                    Ton
                  </strong>
                </span>
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0 ml-2">
            <button
              type="button"
              onClick={onClose}
              className="px-3 py-1.5 rounded-xl bg-slate-200 hover:bg-rose-100 hover:text-rose-700 text-slate-700 text-xs font-black flex items-center gap-1.5 transition-all active:scale-95 shadow-2xs"
              title="Pencereyi Kapat (ESC)"
            >
              <X className="w-4 h-4" />
              <span className="hidden sm:inline">Kapat (ESC)</span>
            </button>
          </div>
        </div>

        {/* Modal Body / Printable Content (Yalnızca içerik kayar, başlık ve butonlar asla kaybolmaz) */}
        <div
          className="report-modal-body flex-1 min-h-0 overflow-y-auto overflow-x-auto p-3.5 sm:p-6 pb-14 space-y-4 text-xs text-slate-800 bg-white"
          id="printableRouteReport"
          style={{ overscrollBehavior: 'contain' }}
        >
          {/* Institutional Official Header */}
          <div className="p-3 sm:p-4 rounded-2xl bg-white border border-slate-300 text-center space-y-1 shadow-2xs">
            <div className="flex items-center justify-between pb-3 border-b-2 border-slate-900 gap-2">
              <div className="w-12 h-12 sm:w-14 sm:h-14 shrink-0 flex items-center justify-center p-1 bg-white rounded-full border border-slate-200">
                <img
                  src="/edirne-sydv-logo.png"
                  alt="Edirne Sosyal Yardımlaşma ve Dayanışma Vakfı Başkanlığı"
                  width={48}
                  height={48}
                  className="print-logo-img"
                  style={{ width: '100%', height: '100%', objectFit: 'contain' }}
                />
              </div>
              <div className="text-center flex-1 px-1 sm:px-3 min-w-0">
                <p className="text-[10px] sm:text-[11px] font-black uppercase text-slate-800 tracking-wider">
                  T.C. EDİRNE VALİLİĞİ
                </p>
                <h4 className="text-xs sm:text-base font-black uppercase text-slate-950 tracking-wide mt-0.5">
                  SOSYAL YARDIMLAŞMA VE DAYANIŞMA VAKFI BAŞKANLIĞI
                </h4>
                <div className="inline-block mt-1 px-2.5 py-0.5 rounded-full bg-slate-100 border border-slate-300">
                  <span className="text-[10px] sm:text-xs font-extrabold text-slate-900">
                    GÜNLÜK KÖMÜR DAĞITIM ROTASI VE SAHA TESLİMAT TUTANAĞI
                  </span>
                </div>
              </div>
              <div className="w-12 sm:w-14 shrink-0 hidden sm:block text-right">
                <span className="text-[9px] font-mono text-slate-400 block">KOD: SYDV-RT</span>
                <span className="text-[9px] font-mono text-slate-400 block mt-0.5">
                  {formatTrDate(printRoute.tarih)}
                </span>
              </div>
            </div>

            <div className="pt-2 flex flex-wrap items-center justify-between text-[11px] text-slate-600 gap-2 font-medium">
              <div className="flex items-center gap-1.5 flex-wrap">
                <span>
                  Rota: <strong className="text-slate-900">{printRoute.rota_adi}</strong>
                </span>
                <span>•</span>
                <span>
                  Tarih: <strong className="text-slate-900">{formatTrDate(printRoute.tarih)}</strong>
                </span>
                {(printRoute.arac_plaka || printRoute.arac_plakasi) && (
                  <>
                    <span>•</span>
                    <span>
                      Araç:{' '}
                      <strong className="text-slate-900">
                        {printRoute.arac_plaka || printRoute.arac_plakasi}
                      </strong>
                    </span>
                  </>
                )}
              </div>
              <div className="flex items-center gap-2">
                <span>
                  Dağıtım Personeli:{' '}
                  <strong className="text-slate-900">{routeStaffList.join(', ')}</strong>
                </span>
              </div>
            </div>
          </div>

          {/* Route Metrics Bar */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-center text-xs">
            <div className="p-2.5 rounded-xl bg-slate-50 border border-slate-200">
              <span className="text-[10px] font-bold text-slate-500 uppercase block">
                Toplam Hedef Hane
              </span>
              <span className="text-base font-black text-slate-900">
                {printRoute.toplam_hane || printRoute.duraklar?.length || 0} Hane
              </span>
            </div>
            <div className="p-2.5 rounded-xl bg-emerald-50 border border-emerald-200">
              <span className="text-[10px] font-bold text-emerald-800 uppercase block">
                Tam Teslim Edilen
              </span>
              <span className="text-base font-black text-emerald-700">
                {printRoute.tamamlanan_hane ||
                  printRoute.duraklar?.filter((d: any) => d.durum === 'TAMAMLANDI').length ||
                  0}{' '}
                Hane
              </span>
            </div>
            <div className="p-2.5 rounded-xl bg-amber-50 border border-amber-200">
              <span className="text-[10px] font-bold text-amber-800 uppercase block">
                Eksik / Kalan
              </span>
              <span className="text-base font-black text-amber-800">
                {(printRoute.eksik_hane || 0) + (printRoute.teslim_edilemeyen_hane || 0)} Hane
              </span>
            </div>
            <div className="p-2.5 rounded-xl bg-sky-50 border border-sky-200">
              <span className="text-[10px] font-bold text-sky-800 uppercase block">
                Toplam Dağıtılan
              </span>
              <span className="text-base font-black text-sky-800">
                {printRoute.toplam_dagitilan_torba ||
                  printRoute.duraklar?.reduce(
                    (acc: number, d: any) => acc + (d.teslim_edilen_torba || 0),
                    0
                  ) ||
                  0}{' '}
                Torba (
                {(
                  (printRoute.toplam_dagitilan_torba ||
                    printRoute.duraklar?.reduce(
                      (acc: number, d: any) => acc + (d.teslim_edilen_torba || 0),
                      0
                    ) ||
                    0) * 0.025
                ).toFixed(2)}{' '}
                Ton)
              </span>
            </div>
          </div>

          {printRoute.kapanis_notu && (
            <div className="p-2.5 rounded-xl bg-slate-50 border border-slate-200 text-xs text-slate-700">
              <strong className="text-slate-900 font-bold block mb-0.5">
                Saha / Kapanış Notu:
              </strong>
              <p className="font-medium">{printRoute.kapanis_notu}</p>
            </div>
          )}

          {/* Stops Table */}
          <div className="border border-slate-300 rounded-xl overflow-hidden shadow-2xs">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="bg-slate-100 text-slate-900 border-b border-slate-300 font-black">
                  <th className="p-2.5 text-center w-10">Sıra</th>
                  <th className="p-2.5 w-28">T.C. Kimlik No</th>
                  <th className="p-2.5 w-36">Hak Sahibi</th>
                  <th className="p-2.5 w-44">Adres &amp; Yerleşim</th>
                  <th className="p-2.5 text-center w-24">Teslimat</th>
                  <th className="p-2.5 text-center w-24">Durum</th>
                  <th className="p-2.5 text-center w-28">İmza / Teslim Alan</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {printRoute.duraklar?.map((stop: any, index: number) => {
                  const isTamam = stop.durum === 'TAMAMLANDI';
                  const isEksik = stop.durum === 'EKSIK';
                  const isUndelivered = stop.durum === 'TESLIM_EDILEMEDI';
                  const stopListInfo = getBeneficiaryListTypeInfo(stop);
                  return (
                    <tr key={index} className="hover:bg-slate-50 transition-colors">
                      <td className="p-2.5 text-center font-bold text-slate-500">
                        <div>{stop.sira || index + 1}</div>
                        {stop.sira_no && (
                          <div className="text-[9px] text-slate-400 font-normal">
                            #{stop.sira_no}
                          </div>
                        )}
                      </td>
                      <td className="p-2.5 font-mono text-slate-800 font-semibold">
                        {stop.tc_no || '-'}
                      </td>
                      <td className="p-2.5 font-bold text-slate-900 break-words whitespace-normal max-w-[140px] leading-snug">
                        <div>{stop.ad_soyad}</div>
                        <span className="text-[10px] text-slate-500 font-normal block">
                          {stopListInfo.label}
                        </span>
                      </td>
                      <td className="p-2.5 text-slate-600 break-words whitespace-normal max-w-[180px] leading-snug">
                        <span className="font-semibold text-slate-900">{stop.mahalle}</span>
                        {stop.sokak && (
                          <span className="block text-[11px] text-slate-500 font-medium">
                            {stop.sokak}
                            {stop.kapi_no &&
                            stop.kapi_no !== 999999 &&
                            stop.kapi_no !== '999999'
                              ? ` No: ${stop.kapi_no}`
                              : ''}
                          </span>
                        )}
                      </td>
                      <td className="p-2.5 text-center font-black text-slate-900">
                        {stop.teslim_edilen_torba ? `${stop.teslim_edilen_torba} Torba` : '-'}
                      </td>
                      <td className="p-2.5 text-center">
                        {isTamam && (
                          <span className="text-[10px] font-black px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 border border-emerald-300">
                            ✓ TAM
                          </span>
                        )}
                        {isEksik && (
                          <span className="text-[10px] font-black px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 border border-amber-300">
                            EKSİK
                          </span>
                        )}
                        {isUndelivered && (
                          <span className="text-[10px] font-black px-2 py-0.5 rounded-full bg-rose-100 text-rose-800 border border-rose-300">
                            VERİLEMEDİ
                          </span>
                        )}
                        {!isTamam && !isEksik && !isUndelivered && (
                          <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 border border-slate-300">
                            BEKLİYOR
                          </span>
                        )}
                      </td>
                      <td className="p-2.5 text-center text-[10px] text-slate-700">
                        <div className="font-semibold text-slate-900">
                          {stop.teslim_alan ? stop.teslim_alan : '.....................'}
                        </div>
                        {(stop.manuel_ek_liste_imzasi || stop.ek_komur_verildi || stop.ek_liste_imza_notu) && (
                          <div className="text-[9px] font-black text-amber-900 bg-amber-50 border border-amber-300 px-1 py-0.5 rounded mt-1 leading-tight">
                            {stop.ek_liste_imza_notu || (stop.teslim_tarihi ? `${stop.teslim_tarihi} tarihinde ek listeye imzası alındı` : 'Ek listeye imzası alındı')}
                          </div>
                        )}
                        {(isTamam || isEksik) &&
                          (stop.teslim_eden_personel ||
                            printRoute.kapatan_personel ||
                            printRoute.dagitim_personeli) && (
                            <div className="text-[9px] text-slate-500 mt-0.5">
                              T. Eden:{' '}
                              {stop.teslim_eden_personel ||
                                printRoute.kapatan_personel ||
                                printRoute.dagitim_personeli}
                            </div>
                          )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Official Signature Section */}
          <div className="p-4 sm:p-5 rounded-2xl bg-white border border-slate-300 space-y-4 print-signatures shadow-2xs">
            <h4 className="text-[10px] sm:text-xs font-bold text-center uppercase tracking-wider text-slate-500 border-b border-slate-200 pb-2">
              RESMİ TUTANAK VE İMZA ONAY ALANI
            </h4>
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3 sm:gap-4 max-w-4xl mx-auto text-center text-xs text-slate-700 pt-2">
              {routeStaffList.map((staffName, idx) => (
                <div
                  key={`r-staff-${idx}-${staffName}`}
                  className="space-y-4 sm:space-y-6 p-3 sm:p-3.5 rounded-xl border border-dashed border-slate-300 bg-slate-50/50 flex flex-col justify-between min-h-[110px]"
                >
                  <div>
                    <p className="font-extrabold text-slate-900 text-xs sm:text-sm">
                      DAĞITIMI YAPAN PERSONEL
                    </p>
                    <p className="text-[11px] font-bold text-slate-800 mt-1 break-words">
                      {staffName}
                    </p>
                  </div>
                  <div className="h-8 flex items-center justify-center border-t border-dashed border-slate-200 pt-2">
                    <span className="text-[10px] text-slate-400 italic font-semibold">İmza</span>
                  </div>
                </div>
              ))}

              <div className="space-y-4 sm:space-y-6 p-3 sm:p-3.5 rounded-xl border border-dashed border-slate-300 bg-slate-50/50 flex flex-col justify-between min-h-[110px]">
                <div>
                  <p className="font-extrabold text-slate-900 text-xs sm:text-sm">
                    VAKIF MÜDÜRÜ / ONAY
                  </p>
                  <p className="text-[11px] font-bold text-slate-800 mt-1">
                    Edirne SYDV Başkanlığı
                  </p>
                </div>
                <div className="h-8 flex items-center justify-center border-t border-dashed border-slate-200 pt-2">
                  <span className="text-[10px] text-slate-400 italic font-semibold">
                    İmza / Mühür
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Modal Footer: Butonlar daima sabit kalır */}
        <div className="report-modal-footer shrink-0 p-3 sm:p-4 border-t border-slate-200 flex items-center justify-between bg-slate-100 z-20 no-print gap-2">
          <a
            href={`/api/export?type=daily_deliveries&date=${encodeURIComponent(String(printRoute.tarih || ''))}`}
            download={`Edirne_SYDV_Rota_Teslimat_Listesi_${String(printRoute.tarih || '').replace(/[^a-zA-Z0-9._-]/g, '_')}.xlsx`}
            className="px-3.5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold flex items-center gap-1.5 transition-all active:scale-95 shadow-xs"
          >
            <Download className="w-4 h-4" />
            <span className="hidden sm:inline">Excel İndir</span>
          </a>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl bg-slate-200 hover:bg-slate-300 text-slate-800 text-xs font-bold transition-all active:scale-95 shadow-2xs"
            >
              Kapat (ESC)
            </button>
            <button
              type="button"
              onClick={() => window.print()}
              className="px-4 py-2 rounded-xl bg-amber-600 hover:bg-amber-700 text-white text-xs font-black flex items-center gap-2 shadow-xs transition-all active:scale-95"
            >
              <Printer className="w-4 h-4" />
              <span>Yazdır / PDF Kaydet</span>
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}
