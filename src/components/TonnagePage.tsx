'use client';

import { useState } from 'react';
import { Truck, Plus, Calendar, FileText, Weight, Trash2, AlertCircle, CheckCircle2 } from 'lucide-react';

interface TonnagePageProps {
  trucks: any[];
  stats: any;
  onRefresh: () => void;
  isLoading?: boolean;
}

export default function TonnagePage({
  trucks,
  stats,
  onRefresh,
  isLoading = false
}: TonnagePageProps) {
  const [showAddModal, setShowAddModal] = useState(false);
  const [plaka, setPlaka] = useState('');
  const [irsaliyeNo, setIrsaliyeNo] = useState('');
  const [tarih, setTarih] = useState(() => new Date().toISOString().split('T')[0]);
  const [netTonaj, setNetTonaj] = useState('');
  const [brutTonaj, setBrutTonaj] = useState('');
  const [soforAdi, setSoforAdi] = useState('');
  const [notlar, setNotlar] = useState('');
  const [tirSirasi, setTirSirasi] = useState<number>(stats?.sonrakiTirSirasi || (trucks.length + 1));
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  const netVal = parseFloat(netTonaj) || 0;
  const brutVal = parseFloat(brutTonaj) || 0;
  const autoTara = brutVal > netVal ? (brutVal - netVal).toFixed(3) : '0.000';

  const handleAddTruck = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!plaka || !irsaliyeNo || !tarih || !netTonaj || !brutTonaj) {
      setErrorMsg('Lütfen zorunlu alanları doldurunuz');
      return;
    }

    if (brutVal < netVal) {
      setErrorMsg('Brüt tonaj, net tonajdan küçük olamaz!');
      return;
    }

    setIsSubmitting(true);
    setErrorMsg('');

    try {
      const res = await fetch('/api/trucks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tir_sirasi: tirSirasi,
          plaka,
          irsaliye_no: irsaliyeNo,
          tarih,
          net_tonaj: netVal,
          brut_tonaj: brutVal,
          sofor_adi: soforAdi,
          notlar
        })
      });

      const data = await res.json();
      if (!data.success) {
        throw new Error(data.error || 'Tır kaydı eklenemedi');
      }

      setShowAddModal(false);
      setPlaka('');
      setIrsaliyeNo('');
      setNetTonaj('');
      setBrutTonaj('');
      setSoforAdi('');
      setNotlar('');
      onRefresh();
    } catch (err: any) {
      setErrorMsg(err.message || 'Hata oluştu');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDeleteTruck = async (id: number, plakaText: string) => {
    if (!confirm(`${plakaText} plakalı tır kaydını silmek istediğinize emin misiniz?`)) {
      return;
    }

    try {
      const res = await fetch(`/api/trucks?id=${id}`, { method: 'DELETE' });
      const data = await res.json();
      if (data.success) {
        onRefresh();
      }
    } catch (err) {
      alert('Silme işleminde hata oluştu');
    }
  };

  return (
    <div className="space-y-4">
      {/* Stock & Tonnage Overview - Light Mode */}
      <div className="p-5 rounded-2xl bg-white border border-slate-200 shadow-sm space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-xl bg-amber-100 text-amber-800 flex items-center justify-center border border-amber-200">
              <Truck className="w-5 h-5 text-amber-700" />
            </div>
            <div>
              <h3 className="text-base font-extrabold text-slate-900">Kömür Stok & Sevkiyat</h3>
              <p className="text-xs text-slate-500 font-medium">Gelen Tırlar ve Net Tonaj Özeti</p>
            </div>
          </div>

          <button
            onClick={() => {
              setTirSirasi(stats?.sonrakiTirSirasi || (trucks.length + 1));
              setShowAddModal(true);
            }}
            className="btn-primary text-xs py-2 px-3 shadow-md"
          >
            <Plus className="w-4 h-4 text-white" />
            Yeni Tır Girişi
          </button>
        </div>

        {/* 4 Stats Cards - Light Mode */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-2 border-t border-slate-100">
          <div className="p-3 rounded-xl bg-slate-50 border border-slate-200">
            <span className="text-[10px] uppercase font-bold text-slate-500 tracking-wider">Gelen Tır Sayısı</span>
            <div className="text-xl font-black text-slate-900 mt-0.5">
              {stats?.toplamTirSayisi || 0} <span className="text-xs font-normal text-slate-500">Adet</span>
            </div>
          </div>

          <div className="p-3 rounded-xl bg-amber-50 border border-amber-200">
            <span className="text-[10px] uppercase font-bold text-amber-800 tracking-wider">Gelen Net Kömür</span>
            <div className="text-xl font-black text-amber-800 mt-0.5">
              {stats?.toplamNetTonaj?.toLocaleString('tr-TR') || '0'} <span className="text-xs font-normal text-slate-500">Ton</span>
            </div>
          </div>

          <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-200">
            <span className="text-[10px] uppercase font-bold text-emerald-800 tracking-wider">Dağıtılan Kömür</span>
            <div className="text-xl font-black text-emerald-700 mt-0.5">
              {stats?.dagitilanNetTonaj?.toLocaleString('tr-TR') || '0'} <span className="text-xs font-normal text-slate-500">Ton</span>
            </div>
            <div className="text-[10px] text-emerald-800 font-bold">({stats?.toplamDagitilanTorba || 0} Torba)</div>
          </div>

          <div className="p-3 rounded-xl bg-sky-50 border border-sky-200">
            <span className="text-[10px] uppercase font-bold text-sky-800 tracking-wider">Kalan Stok</span>
            <div className={`text-xl font-black mt-0.5 ${stats?.kalanStokTonaj < 5 ? 'text-rose-600' : 'text-sky-800'}`}>
              {stats?.kalanStokTonaj?.toLocaleString('tr-TR') || '0'} <span className="text-xs font-normal text-slate-500">Ton</span>
            </div>
          </div>
        </div>
      </div>

      {/* Trucks List Header */}
      <div className="flex items-center justify-between px-1">
        <h4 className="text-xs font-bold text-slate-600 uppercase tracking-wider">
          Gelen Tır Kayıtları ({trucks.length})
        </h4>
        <span className="text-[11px] text-slate-500 font-medium">
          Her tırın net ve brüt tartım detayları
        </span>
      </div>

      {/* List of Incoming Trucks - Light Mode */}
      {trucks.length === 0 ? (
        <div className="p-10 text-center rounded-2xl bg-white border border-slate-200 shadow-sm space-y-2">
          <Truck className="w-10 h-10 text-slate-400 mx-auto" />
          <p className="text-sm font-bold text-slate-800">Henüz tır kaydı bulunmuyor</p>
          <p className="text-xs text-slate-500">
            Kömür sahasına gelen tırları kaydetmek için &ldquo;Yeni Tır Girişi&rdquo; butonunu kullanın.
          </p>
        </div>
      ) : (
        <div className="space-y-2.5">
          {trucks.map((t) => (
            <div
              key={t.id}
              className="p-4 rounded-2xl bg-white border border-slate-200 shadow-sm hover:border-slate-300 transition-all space-y-2.5"
            >
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <span className="w-6 h-6 rounded-lg bg-amber-100 text-amber-800 border border-amber-300 flex items-center justify-center font-bold text-xs">
                    #{t.tir_sirasi}
                  </span>
                  <div className="px-3 py-1 rounded-lg bg-slate-900 text-white font-mono font-bold tracking-wider text-sm shadow-inner">
                    {t.plaka}
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <span className="text-xs text-slate-500 flex items-center gap-1 font-semibold">
                    <Calendar className="w-3.5 h-3.5" />
                    {t.tarih}
                  </span>
                  <button
                    onClick={() => handleDeleteTruck(t.id, t.plaka)}
                    title="Tır Kaydını Sil"
                    className="p-1.5 text-slate-400 hover:text-rose-600 rounded-lg transition-colors"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>

              {/* Tonnage Detail Row */}
              <div className="grid grid-cols-3 gap-2 p-2.5 rounded-xl bg-slate-50 border border-slate-200 text-center">
                <div>
                  <span className="text-[10px] uppercase font-bold text-slate-500">Brüt Tonaj</span>
                  <p className="text-sm font-bold text-slate-900 mt-0.5">{t.brut_tonaj} Ton</p>
                </div>
                <div className="border-x border-slate-200">
                  <span className="text-[10px] uppercase font-bold text-amber-800">Net Tonaj</span>
                  <p className="text-sm font-black text-amber-700 mt-0.5">{t.net_tonaj} Ton</p>
                </div>
                <div>
                  <span className="text-[10px] uppercase font-bold text-slate-500">Dara (Tara)</span>
                  <p className="text-sm font-bold text-slate-700 mt-0.5">{t.tara_tonaj} Ton</p>
                </div>
              </div>

              {/* Details (Irsaliye, Sofor, Notlar) */}
              <div className="flex items-center justify-between text-xs text-slate-600 pt-1 font-medium">
                <span className="flex items-center gap-1">
                  <FileText className="w-3.5 h-3.5 text-slate-400" />
                  İrsaliye / Teslimat No: <strong className="text-slate-900 font-bold">{t.irsaliye_no}</strong>
                </span>
                {t.sofor_adi && <span>Şoför: {t.sofor_adi}</span>}
              </div>

              {t.notlar && (
                <p className="text-[11px] text-slate-600 italic bg-slate-50 p-2 rounded-lg border border-slate-100">
                  {t.notlar}
                </p>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Add Truck Modal - Light Mode */}
      {showAddModal && (
        <div className="modal-overlay" onClick={() => setShowAddModal(false)}>
          <div className="modal-sheet" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between pb-3 border-b border-slate-200 mb-4">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-amber-100 text-amber-800 flex items-center justify-center border border-amber-200">
                  <Truck className="w-5 h-5 text-amber-700" />
                </div>
                <div>
                  <h3 className="text-base font-extrabold text-slate-900">Yeni Gelen Tır Kaydı</h3>
                  <p className="text-xs text-slate-500">Kömür sevkiyatı ve tonaj girişi</p>
                </div>
              </div>
              <button
                onClick={() => setShowAddModal(false)}
                className="text-slate-400 hover:text-slate-700 p-1 rounded-lg text-sm"
              >
                ✕
              </button>
            </div>

            {errorMsg && (
              <div className="p-3 mb-4 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs flex items-center gap-2 font-medium">
                <AlertCircle className="w-4 h-4 shrink-0 text-rose-600" />
                <span>{errorMsg}</span>
              </div>
            )}

            <form onSubmit={handleAddTruck} className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-600 uppercase tracking-wider mb-1.5">
                    Gelen Tır Sırası
                  </label>
                  <input
                    type="number"
                    min="1"
                    value={tirSirasi}
                    onChange={(e) => setTirSirasi(parseInt(e.target.value, 10) || 1)}
                    className="w-full px-3.5 py-2.5 rounded-xl bg-slate-50 border border-slate-300 text-slate-900 font-bold focus:outline-none focus:border-amber-500 focus:bg-white"
                    required
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-600 uppercase tracking-wider mb-1.5">
                    Geliş Tarihi
                  </label>
                  <input
                    type="date"
                    value={tarih}
                    onChange={(e) => setTarih(e.target.value)}
                    className="w-full px-3.5 py-2.5 rounded-xl bg-slate-50 border border-slate-300 text-slate-900 focus:outline-none focus:border-amber-500 focus:bg-white font-medium"
                    required
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-600 uppercase tracking-wider mb-1.5">
                    Tır Plakası
                  </label>
                  <input
                    type="text"
                    value={plaka}
                    onChange={(e) => setPlaka(e.target.value.toUpperCase())}
                    placeholder="Örn: 06 KMR 101"
                    className="w-full px-3.5 py-2.5 rounded-xl bg-slate-50 border border-slate-300 text-slate-900 font-mono uppercase font-black focus:outline-none focus:border-amber-500 focus:bg-white"
                    required
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-600 uppercase tracking-wider mb-1.5">
                    İrsaliye / Teslimat No
                  </label>
                  <input
                    type="text"
                    value={irsaliyeNo}
                    onChange={(e) => setIrsaliyeNo(e.target.value)}
                    placeholder="Örn: IRS-2026-004"
                    className="w-full px-3.5 py-2.5 rounded-xl bg-slate-50 border border-slate-300 text-slate-900 font-mono font-bold focus:outline-none focus:border-amber-500 focus:bg-white"
                    required
                  />
                </div>
              </div>

              {/* Tonaj Alanları */}
              <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-bold text-slate-600 uppercase tracking-wider mb-1.5">
                      Brüt Tonaj (Ton)
                    </label>
                    <input
                      type="number"
                      step="0.001"
                      value={brutTonaj}
                      onChange={(e) => setBrutTonaj(e.target.value)}
                      placeholder="Örn: 42.150"
                      className="w-full px-3 py-2 rounded-xl bg-white border border-slate-300 text-slate-900 font-bold focus:outline-none focus:border-amber-500"
                      required
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-amber-800 uppercase tracking-wider mb-1.5">
                      Net Tonaj (Ton)
                    </label>
                    <input
                      type="number"
                      step="0.001"
                      value={netTonaj}
                      onChange={(e) => setNetTonaj(e.target.value)}
                      placeholder="Örn: 27.200"
                      className="w-full px-3 py-2 rounded-xl bg-white border border-amber-400 text-amber-900 font-black focus:outline-none focus:border-amber-500"
                      required
                    />
                  </div>
                </div>

                {/* Otomatik Dara Gösterimi */}
                <div className="flex items-center justify-between text-xs text-slate-600 pt-2 border-t border-slate-200 font-medium">
                  <span>Hesaplanan Dara / Tara Miktarı:</span>
                  <span className="font-mono font-bold text-slate-900 bg-white px-2.5 py-1 rounded-md border border-slate-200">
                    {autoTara} Ton
                  </span>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-600 uppercase tracking-wider mb-1.5">
                    Şoför Adı (Opsiyonel)
                  </label>
                  <input
                    type="text"
                    value={soforAdi}
                    onChange={(e) => setSoforAdi(e.target.value)}
                    placeholder="Örn: Kadir Vural"
                    className="w-full px-3.5 py-2 rounded-xl bg-slate-50 border border-slate-300 text-slate-900 text-sm focus:outline-none focus:border-amber-500 focus:bg-white"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-600 uppercase tracking-wider mb-1.5">
                    Açıklama / Menşe
                  </label>
                  <input
                    type="text"
                    value={notlar}
                    onChange={(e) => setNotlar(e.target.value)}
                    placeholder="Örn: Soma Linyit 1. Kalite"
                    className="w-full px-3.5 py-2 rounded-xl bg-slate-50 border border-slate-300 text-slate-900 text-sm focus:outline-none focus:border-amber-500 focus:bg-white"
                  />
                </div>
              </div>

              <div className="pt-2 flex gap-3">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  disabled={isSubmitting}
                  className="btn-secondary flex-1"
                >
                  İptal
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="btn-primary flex-1 font-bold"
                >
                  {isSubmitting ? 'Kaydediliyor...' : 'Tırı Kaydet'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
