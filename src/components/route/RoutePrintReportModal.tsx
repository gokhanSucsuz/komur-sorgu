'use client';

import { useEffect, useState } from 'react';
import Image from 'next/image';
import { createPortal } from 'react-dom';
import { Route as RouteIcon, X, Download, Printer, AlertTriangle, RefreshCw, Truck } from 'lucide-react';
import { getBeneficiaryListTypeInfo, resolveStaffDisplayName } from '@/lib/normalizer';
import { formatTrDate, formatDottedTrDate, replaceYmdWithDdmmyyyy, buildReportPdfTitle, printReportWithTitle } from '@/lib/dateUtils';

export interface RoutePrintReportModalProps {
  printRoute: any | null;
  routeStaffList: string[];
  onClose: () => void;
}

function cleanDecryptedText(text?: string | null, fallback = ''): string {
  if (!text) return fallback;
  const str = String(text).trim();
  if (
    str.includes('ŞİFRELİ VERİ DEŞİFRE EDİLEMEDİ') ||
    str.includes('DEŞİFRE') ||
    str.startsWith('ENC:GCM:')
  ) {
    return fallback;
  }
  return str;
}

export default function RoutePrintReportModal({
  printRoute,
  routeStaffList,
  onClose,
}: RoutePrintReportModalProps) {
  useEffect(() => {
    if (!printRoute || typeof document === 'undefined') return;
    const repTitle = `Dağıtım Rotası Teslimat Tutanağı - ${printRoute.rota_adi || 'Saha Rotası'}`;
    const prevTitle = document.title;
    document.title = buildReportPdfTitle(repTitle, printRoute.tarih);
    return () => {
      document.title = prevTitle;
    };
  }, [printRoute]);

  if (!printRoute || typeof document === 'undefined') return null;

  const stops = Array.isArray(printRoute.duraklar) ? printRoute.duraklar : [];

  // Devir vs Yeni Duraklar ayrımı
  const normalStops = stops.filter((s: any) => !s.onceki_gunden_devir);
  const devirStops = stops.filter((s: any) => Boolean(s.onceki_gunden_devir));

  // Yeni hanelerden tamamlanan ve eksik olanlar
  const tamHane = normalStops.filter((s: any) => s.durum === 'TAMAMLANDI').length;
  const eksikHane = normalStops.filter((s: any) => s.durum === 'EKSIK').length;
  const verilemeyenHane = normalStops.filter((s: any) => s.durum === 'TESLIM_EDILEMEDI').length;
  
  // Resmi Kural: Dağıtım Yapılan Hane = Tam Dağıtım Yapılan Hane + Eksik Dağıtım Yapılan Hane
  const toplamDagitimYapilanHane = tamHane + eksikHane;

  // Devir duraklardan tamamlananlar
  const devirTamamlanan = devirStops.filter(
    (s: any) => s.durum === 'TAMAMLANDI' || Number(s.teslim_edilen_torba) > 0
  ).length;

  // Toplam dağıtılan torba (fiziki olarak araçtan indirilen tüm kömürler)
  const toplamTorba = stops.reduce(
    (acc: number, d: any) => acc + (Number(d.teslim_edilen_torba) || 0),
    0
  );

  // Kural: Günlük tutanakta o gün gelen tonaj sayısı yazar; verilen kişi sayısına göre tonaj hesaplanmaz!
  // Kömür torbalarının takribi 25 kg ağırlıkta olması sebebiyle sahaya gelen kantar tonajı esas alınır.
  const [customGelenTonaj, setCustomGelenTonaj] = useState<string>(
    printRoute.gelen_tonaj ? String(printRoute.gelen_tonaj) : ''
  );

  const routeGelenTonajNum = customGelenTonaj !== ''
    ? parseFloat(customGelenTonaj) || 0
    : (Number(printRoute.gelen_tonaj) || 0);

  const displayGelenTonaj = routeGelenTonajNum > 0
    ? routeGelenTonajNum.toFixed(2)
    : (toplamTorba * 0.025).toFixed(2);

  const cleanStaffList = routeStaffList.map((st) => resolveStaffDisplayName(st, st, 'PERSONEL'));

  return createPortal(
    <div
      className="report-modal-overlay fixed inset-0 z-[100] flex items-center justify-center p-2 sm:p-4 md:p-6 bg-slate-950/80 backdrop-blur-xs"
      onClick={(e) => {
        if (e.target === e.currentTarget) {
          onClose();
        }
      }}
    >
      {/* Modal Panel */}
      <div className="report-modal-card relative bg-white rounded-2xl sm:rounded-3xl w-full max-w-5xl h-[92vh] max-h-[92vh] flex flex-col shadow-2xl border border-slate-300 overflow-hidden z-10">
        {/* Modal Header */}
        <div className="report-modal-header shrink-0 h-14 sm:h-16 px-4 sm:px-6 border-b border-slate-200 flex items-center justify-between bg-slate-100 z-20 no-print">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl bg-amber-600 text-white flex items-center justify-center shadow-xs shrink-0">
              <RouteIcon className="w-5 h-5" />
            </div>
            <div className="truncate">
              <h3 className="text-xs sm:text-sm md:text-base font-black text-slate-900 truncate">
                {replaceYmdWithDdmmyyyy(printRoute.rota_adi || 'Günlük Kömür Dağıtım Rotası Tutanağı')}
              </h3>
              <p className="text-[10px] sm:text-xs text-slate-500 font-semibold flex items-center gap-1.5 flex-wrap">
                <span>
                  Tarih: <strong className="text-slate-800">{formatTrDate(printRoute.tarih)}</strong>
                </span>
                <span>•</span>
                <span>
                  Personel: <strong className="text-slate-800">{cleanStaffList.join(', ')}</strong>
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
                  Dağıtım Yapılan:{' '}
                  <strong className="text-emerald-700">
                    {toplamDagitimYapilanHane} Hane
                  </strong>
                  {eksikHane > 0 && (
                    <span className="text-amber-800 font-bold ml-1">
                      ({tamHane} Tam + {eksikHane} Eksik)
                    </span>
                  )}
                </span>
                <span>•</span>
                <span>
                  <strong className="text-amber-800">
                    {toplamTorba} Torba (Gelen Tonaj: {displayGelenTonaj} Ton)
                  </strong>
                </span>
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0 ml-2">
            {/* O Gün Gelen Tonaj Girişi / Teyidi (no-print) */}
            <div className="hidden sm:flex items-center gap-1.5 bg-white border border-slate-300 rounded-xl px-2.5 py-1.5 shadow-2xs">
              <Truck className="w-3.5 h-3.5 text-sky-600" />
              <span className="text-[11px] font-bold text-slate-700">Gelen Tonaj:</span>
              <input
                type="number"
                step="0.01"
                value={customGelenTonaj}
                onChange={(e) => setCustomGelenTonaj(e.target.value)}
                placeholder={printRoute.gelen_tonaj ? String(printRoute.gelen_tonaj) : '27.40'}
                className="w-20 text-xs font-black text-sky-950 bg-slate-50 border border-slate-200 rounded px-1.5 py-0.5 focus:outline-none focus:border-sky-500"
                title="O gün gelen kantar tonajı (tutanakta yazacak resmi miktar)"
              />
              <span className="text-[11px] font-bold text-slate-500">Ton</span>
            </div>

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

        {/* Modal Body / Printable Content */}
        <div
          className="report-modal-body flex-1 min-h-0 overflow-y-auto overflow-x-auto p-3.5 sm:p-6 pb-14 space-y-4 text-xs text-slate-800 bg-white"
          id="printableRouteReport"
          style={{ overscrollBehavior: 'contain' }}
        >
          {/* Institutional Official Header */}
          <div className="p-3 sm:p-4 rounded-2xl bg-white border border-slate-300 text-center space-y-1 shadow-2xs">
            <div className="flex items-center justify-between pb-3 border-b-2 border-slate-900 gap-2">
              <div className="w-12 h-12 sm:w-14 sm:h-14 shrink-0 flex items-center justify-center p-1 bg-white rounded-full border border-slate-200">
                <Image
                  unoptimized
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
                  Rota: <strong className="text-slate-900">{replaceYmdWithDdmmyyyy(printRoute.rota_adi || '')}</strong>
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
                  <strong className="text-slate-900">{cleanStaffList.join(', ')}</strong>
                </span>
              </div>
            </div>
          </div>

          {/* Route Metrics Bar */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-center text-xs">
            <div className="p-2.5 rounded-xl bg-slate-50 border border-slate-200">
              <span className="text-[10px] font-bold text-slate-500 uppercase block">
                Dağıtım Yapılan Hane
              </span>
              <span className="text-base font-black text-slate-900 block">
                {toplamDagitimYapilanHane} Hane
              </span>
              <span className="text-[9px] text-slate-500 font-semibold block mt-0.5">
                ({tamHane} Tam + {eksikHane} Eksik)
              </span>
            </div>
            <div className="p-2.5 rounded-xl bg-emerald-50 border border-emerald-200">
              <span className="text-[10px] font-bold text-emerald-800 uppercase block">
                Tam Teslim Edilen
              </span>
              <span className="text-base font-black text-emerald-700 block">
                {tamHane} Hane
              </span>
              <span className="text-[9px] text-emerald-600 font-semibold block mt-0.5">
                (34 Torba Eksiksiz)
              </span>
            </div>
            <div className="p-2.5 rounded-xl bg-amber-50 border border-amber-200">
              <span className="text-[10px] font-bold text-amber-800 uppercase block">
                Eksik Teslimat
              </span>
              <span className="text-base font-black text-amber-800 block">
                {eksikHane} Hane
              </span>
              <span className="text-[9px] text-amber-700 font-semibold block mt-0.5">
                (Kalan Sonraki Güne Devir)
              </span>
            </div>
            <div className="p-2.5 rounded-xl bg-sky-50 border border-sky-200">
              <span className="text-[10px] font-bold text-sky-800 uppercase block">
                O Gün Gelen Tonaj
              </span>
              <span className="text-base font-black text-sky-800 block">
                {displayGelenTonaj} Ton
              </span>
              <span className="text-[9px] text-sky-700 font-semibold block mt-0.5">
                ({toplamTorba} Torba Dağıtıldı • Takribi ~25kg)
              </span>
            </div>
          </div>

          {/* Resmi Tonaj ve Torba Toleransı Bilgilendirme Notu */}
          <div className="p-2.5 rounded-xl bg-sky-50/60 border border-sky-200 text-[11px] text-sky-950 space-y-0.5">
            <span className="font-bold text-sky-900 block">
              ⚖️ Resmi Kantar Tonajı Esası:
            </span>
            <p>
              Kömür torbalarının takribi 25 kg ağırlıkta olması sebebiyle bu tutanakta yer alan tonaj miktarı <strong>o gün sahaya intikal eden fiili kantar/tır tonajı ({displayGelenTonaj} Ton)</strong> olarak esas alınmıştır; verilen kişi sayısına göre tonaj hesaplanmamıştır.
            </p>
          </div>

          {/* Devir Uyarısı / Bilgilendirme Bandı */}
          {devirStops.length > 0 && (
            <div className="p-2.5 rounded-xl bg-amber-50 border border-amber-300 text-amber-950 text-xs font-semibold flex items-center gap-2">
              <RefreshCw className="w-4 h-4 text-amber-700 shrink-0" />
              <span>
                <strong>Önceki Günden Devir Teslimatlar:</strong> Bu rotada önceki günlerden eksik devreden <strong>{devirStops.length} hane</strong> bulunmaktadır ({devirTamamlanan} tanesi teslim edilmiştir). Resmi sayım kuralı gereği hane ilk eksik teslimat yapıldığı günün hanesine sayıldığından, bu rotadaki hane sayımına mükerrerliği önlemek için dahil edilmemiştir (+0).
              </span>
            </div>
          )}

          {printRoute.kapanis_notu && (
            <div className="p-2.5 rounded-xl bg-slate-50 border border-slate-200 text-xs text-slate-700">
              <strong className="text-slate-900 font-bold block mb-0.5">
                Saha / Kapanış Notu:
              </strong>
              <p className="font-medium">{cleanDecryptedText(printRoute.kapanis_notu, printRoute.kapanis_notu)}</p>
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
                  <th className="p-2.5 w-48">Açık Adres &amp; Yerleşim</th>
                  <th className="p-2.5 text-center w-28">Teslimat</th>
                  <th className="p-2.5 text-center w-28">Durum</th>
                  <th className="p-2.5 text-center w-32">İmza / Teslim Alan</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {stops.map((stop: any, index: number) => {
                  const isDevir = Boolean(stop.onceki_gunden_devir);
                  const isTamam = stop.durum === 'TAMAMLANDI';
                  const isEksik = stop.durum === 'EKSIK';
                  const isUndelivered = stop.durum === 'TESLIM_EDILEMEDI';
                  const stopListInfo = getBeneficiaryListTypeInfo(stop);

                  const cleanAdSoyad = cleanDecryptedText(stop.ad_soyad, `Hak Sahibi #${stop.sira || index + 1}`);
                  const cleanTeslimAlan = cleanDecryptedText(stop.teslim_alan, cleanAdSoyad);
                  const rawAcikAdres = cleanDecryptedText(stop.acik_adres, '');
                  const rawSokak = cleanDecryptedText(stop.sokak, '');
                  
                  // Açık adres daima eksiksiz ve dolu gösterilsin
                  let displayAddress = rawAcikAdres;
                  if (!displayAddress) {
                    const parts = [
                      rawSokak,
                      stop.kapi_no && stop.kapi_no !== 999999 && stop.kapi_no !== '999999' ? `No: ${stop.kapi_no}` : '',
                      stop.daire_no ? `D: ${stop.daire_no}` : ''
                    ].filter(Boolean).join(' ');
                    displayAddress = parts ? `${stop.mahalle || 'Edirne Merkez'} ${parts}` : (stop.mahalle || 'Adres Kaydı Belirtilmemiş');
                  }

                  const targetQuota = Number(stop.hedef_torba) || 34;
                  const deliveredBags = Number(stop.teslim_edilen_torba) || 0;
                  const remainingBags = Math.max(0, targetQuota - deliveredBags);

                  return (
                    <tr key={index} className={`hover:bg-slate-50 transition-colors ${isDevir ? 'bg-amber-50/40' : ''}`}>
                      <td className="p-2.5 text-center font-bold text-slate-500">
                        <div>{stop.sira || index + 1}</div>
                        {stop.sira_no && (
                          <div className="text-[9px] text-slate-400 font-normal">
                            #{stop.sira_no}
                          </div>
                        )}
                      </td>
                      <td className="p-2.5 font-mono text-slate-800 font-semibold">
                        {stop.tc_no && !stop.tc_no.includes('ŞİFRELİ') ? stop.tc_no : '-'}
                      </td>
                      <td className="p-2.5 font-bold text-slate-900 break-words whitespace-normal max-w-[150px] leading-snug">
                        <div>{cleanAdSoyad}</div>
                        <span className="text-[10px] text-slate-500 font-normal block">
                          {stopListInfo.label}
                        </span>
                        {stop.sehit_gazi && (
                          <span className="inline-block mt-0.5 px-1.5 py-0.2 rounded bg-amber-100 text-amber-900 text-[9px] font-black border border-amber-300">
                            🎖️ Şehit / Gazi Yakını
                          </span>
                        )}
                      </td>
                      <td className="p-2.5 text-slate-700 break-words whitespace-normal max-w-[200px] leading-snug">
                        <span className="font-extrabold text-slate-900 block text-[11px]">{stop.mahalle || 'Edirne Merkez'}</span>
                        <span className="block text-[11px] text-slate-700 font-medium mt-0.5">
                          {displayAddress}
                        </span>
                        {isDevir && (
                          <span className="block text-[10px] text-amber-900 font-bold italic mt-1 bg-amber-100/70 p-1 rounded border border-amber-200">
                            *(Önceki gün eksik teslimat tamamlaması - Hane sayımına dahil edilmemiştir)*
                          </span>
                        )}
                      </td>
                      <td className="p-2.5 text-center font-black text-slate-900">
                        <div>{deliveredBags ? `${deliveredBags} Torba` : '-'}</div>
                        {isEksik && (
                          <div className="text-[10px] text-amber-800 font-extrabold mt-0.5">
                            Kalan: {remainingBags} Torba
                          </div>
                        )}
                      </td>
                      <td className="p-2.5 text-center">
                        {isDevir ? (
                          <span className="text-[10px] font-black px-2 py-0.5 rounded-full bg-amber-100 text-amber-900 border border-amber-400 inline-block">
                            🔄 DEVİR {isTamam ? 'TAMAMLANDI' : 'TAMAMLAMA'}
                          </span>
                        ) : isTamam ? (
                          <span className="text-[10px] font-black px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 border border-emerald-300 inline-block">
                            ✓ TAM
                          </span>
                        ) : isEksik ? (
                          <div className="space-y-0.5">
                            <span className="text-[10px] font-black px-2 py-0.5 rounded-full bg-amber-100 text-amber-900 border border-amber-300 inline-block">
                              ⚠️ EKSİK
                            </span>
                            <span className="block text-[9px] text-amber-800 font-bold">
                              Sonraki güne devir
                            </span>
                          </div>
                        ) : isUndelivered ? (
                          <span className="text-[10px] font-black px-2 py-0.5 rounded-full bg-rose-100 text-rose-800 border border-rose-300 inline-block">
                            VERİLEMEDİ
                          </span>
                        ) : (
                          <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 border border-slate-300 inline-block">
                            BEKLİYOR
                          </span>
                        )}
                        {(isTamam || isEksik) && stop.teslim_tarihi && (
                          <div className="text-[9px] font-mono font-bold text-amber-900 bg-amber-50 rounded px-1 py-0.5 mt-1 border border-amber-200 whitespace-nowrap">
                            🕒 {stop.teslim_tarihi}
                          </div>
                        )}
                      </td>
                      <td className="p-2.5 text-center text-[10px] text-slate-700">
                        <div className="font-bold text-slate-900">
                          {cleanTeslimAlan || '.....................'}
                        </div>
                        {(stop.manuel_ek_liste_imzasi || stop.ek_komur_verildi || stop.ek_liste_imza_notu) && (
                          <div className="text-[9px] font-black text-amber-900 bg-amber-50 border border-amber-300 px-1 py-0.5 rounded mt-1 leading-tight">
                            {stop.ek_liste_imza_notu || (stop.teslim_tarihi ? `${stop.teslim_tarihi} tarihinde ek listeye imzası alındı` : 'Ek listeye imzası alındı')}
                          </div>
                        )}
                        {(isTamam || isEksik) && (
                          <div className="text-[9px] text-slate-500 mt-0.5 font-medium">
                            T. Eden:{' '}
                            {resolveStaffDisplayName(
                              stop.teslim_eden_personel || printRoute.kapatan_personel || printRoute.dagitim_personeli,
                              'admin',
                              'ADMIN'
                            )}
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
              {cleanStaffList.map((staffName, idx) => (
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

        {/* Modal Footer */}
        <div className="report-modal-footer shrink-0 p-3 sm:p-4 border-t border-slate-200 flex items-center justify-between bg-slate-100 z-20 no-print gap-2">
          <a
            href={`/api/export?type=daily_deliveries&date=${encodeURIComponent(String(printRoute.tarih || ''))}`}
            download={`Edirne_SYDV_Rota_Teslimat_Listesi_${formatDottedTrDate(printRoute.tarih)}.xlsx`}
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
              onClick={() => {
                const repTitle = `Dağıtım Rotası Teslimat Tutanağı - ${printRoute.rota_adi || 'Saha Rotası'}`;
                printReportWithTitle(repTitle, printRoute.tarih);
              }}
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
