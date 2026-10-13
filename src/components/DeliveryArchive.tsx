'use client';

import { useState } from 'react';
import { Calendar, PackageCheck, AlertTriangle, Undo2, Search, Download, Clock, User, MapPin } from 'lucide-react';

interface DeliveryArchiveProps {
  groupedDays: any[];
  allRecords: any[];
  stats: any;
  onOpenCancel: (record: any) => void;
  isLoading?: boolean;
}

export default function DeliveryArchive({
  groupedDays,
  allRecords,
  stats,
  onOpenCancel,
  isLoading = false
}: DeliveryArchiveProps) {
  const [subTab, setSubTab] = useState<'DELIVERIES' | 'CANCELLATIONS'>('DELIVERIES');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedDay, setSelectedDay] = useState<string>('ALL');

  // Filter cancelled items
  const cancelledItems = allRecords.filter((r) => r.islem_tipi === 'IPTAL');

  // Filter delivered items
  const deliveredItems = allRecords.filter((r) => r.islem_tipi === 'TESLIMAT');

  // Search filter for deliveries
  const filteredDelivered = deliveredItems.filter((r) => {
    if (selectedDay !== 'ALL' && r.gun_tarihi !== selectedDay) return false;
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    return (
      r.tc_no.includes(q) ||
      r.ad_soyad.toLowerCase().includes(q) ||
      r.mahalle.toLowerCase().includes(q) ||
      (r.personel && r.personel.toLowerCase().includes(q))
    );
  });

  // Search filter for cancellations
  const filteredCancelled = cancelledItems.filter((r) => {
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    return (
      r.tc_no.includes(q) ||
      r.ad_soyad.toLowerCase().includes(q) ||
      (r.iptal_nedeni && r.iptal_nedeni.toLowerCase().includes(q)) ||
      (r.personel && r.personel.toLowerCase().includes(q))
    );
  });

  // Re-group filtered deliveries by date
  const filteredGroupedDays = groupedDays.map((group) => ({
    ...group,
    items: group.items.filter((item: any) => {
      if (item.islem_tipi !== 'TESLIMAT') return false;
      if (selectedDay !== 'ALL' && item.gun_tarihi !== selectedDay) return false;
      if (!searchQuery) return true;
      const q = searchQuery.toLowerCase();
      return (
        item.tc_no.includes(q) ||
        item.ad_soyad.toLowerCase().includes(q) ||
        item.mahalle.toLowerCase().includes(q)
      );
    })
  })).filter((group) => group.items.length > 0);

  return (
    <div className="space-y-4">
      {/* Metrics Banner - Light Mode */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
        <div className="stat-card">
          <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Toplam Teslimat</span>
          <div className="mt-1 flex items-baseline gap-1">
            <span className="text-2xl font-black text-emerald-600">{stats?.toplamTeslimatSayisi || 0}</span>
            <span className="text-xs text-slate-500 font-semibold">Kişi</span>
          </div>
        </div>

        <div className="stat-card">
          <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Toplam Kömür</span>
          <div className="mt-1 flex items-baseline gap-1">
            <span className="text-2xl font-black text-amber-700">
              {((stats?.toplamTorbaSayisi || 0) * 0.025).toFixed(1)}
            </span>
            <span className="text-xs text-slate-500 font-semibold">Ton</span>
          </div>
        </div>

        <div className="stat-card">
          <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Bugün Dağıtılan</span>
          <div className="mt-1 flex items-baseline gap-1">
            <span className="text-2xl font-black text-sky-700">{stats?.bugunTeslimatSayisi || 0}</span>
            <span className="text-xs text-slate-500 font-semibold">Kişi</span>
          </div>
        </div>

        <div className="stat-card">
          <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">İptal Edilenler</span>
          <div className="mt-1 flex items-baseline gap-1">
            <span className="text-2xl font-black text-rose-600">{stats?.toplamIptalSayisi || 0}</span>
            <span className="text-xs text-slate-500 font-semibold">Kayıt</span>
          </div>
        </div>
      </div>

      {/* Sub Tabs: Günlük Arşiv vs İptal Edilen Teslimatlar - Light Mode */}
      <div className="flex rounded-2xl bg-slate-200/80 p-1 border border-slate-300 text-xs font-bold shadow-inner">
        <button
          onClick={() => setSubTab('DELIVERIES')}
          className={`flex-1 py-2.5 rounded-xl flex items-center justify-center gap-2 transition-all ${
            subTab === 'DELIVERIES'
              ? 'bg-white text-slate-900 shadow-md font-extrabold'
              : 'text-slate-600 hover:text-slate-900'
          }`}
        >
          <PackageCheck className="w-4 h-4 text-amber-600" />
          <span>Günlük Teslimat Arşivi ({deliveredItems.length})</span>
        </button>

        <button
          onClick={() => setSubTab('CANCELLATIONS')}
          className={`flex-1 py-2.5 rounded-xl flex items-center justify-center gap-2 transition-all ${
            subTab === 'CANCELLATIONS'
              ? 'bg-white text-rose-800 shadow-md font-extrabold'
              : 'text-slate-600 hover:text-slate-900'
          }`}
        >
          <Undo2 className="w-4 h-4 text-rose-600" />
          <span>İptal Edilenler ({cancelledItems.length})</span>
        </button>
      </div>

      {/* Search & Date Filter Bar */}
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Search className="w-4 h-4 absolute left-3 top-3 text-slate-400" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Arşivde TC, isim veya mahalle ara..."
            className="w-full pl-9 pr-3 py-2 rounded-xl bg-white border border-slate-300 text-slate-900 placeholder-slate-400 text-xs focus:outline-none focus:border-amber-500 font-medium"
          />
        </div>

        {subTab === 'DELIVERIES' && (
          <select
            value={selectedDay}
            onChange={(e) => setSelectedDay(e.target.value)}
            className="px-2.5 py-2 rounded-xl bg-white border border-slate-300 text-slate-900 text-xs font-bold focus:outline-none focus:border-amber-500"
          >
            <option value="ALL">Tüm Günler</option>
            {groupedDays.map((g) => (
              <option key={g.gun_tarihi} value={g.gun_tarihi}>
                {g.gun_tarihi} ({g.teslimatSayisi})
              </option>
            ))}
          </select>
        )}
      </div>

      {/* VIEW 1: Günlük Teslimat Arşivi - Light Mode */}
      {subTab === 'DELIVERIES' && (
        <div className="space-y-4">
          {filteredGroupedDays.length === 0 ? (
            <div className="p-8 text-center bg-white rounded-2xl border border-slate-200 text-slate-500 text-xs shadow-sm">
              Seçilen kriterlerde teslimat kaydı bulunamadı.
            </div>
          ) : (
            filteredGroupedDays.map((dayGroup) => (
              <div key={dayGroup.gun_tarihi} className="space-y-2">
                {/* Date Group Header */}
                <div className="py-2.5 px-3.5 rounded-xl bg-slate-100 border border-slate-200 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Calendar className="w-4 h-4 text-amber-700" />
                    <span className="text-xs font-extrabold text-slate-900 tracking-wide">
                      {dayGroup.gun_tarihi}
                    </span>
                  </div>
                  <div className="text-[11px] text-slate-600 font-bold">
                    <span className="text-emerald-700">{dayGroup.items.length}</span> Teslimat •{' '}
                    <span className="text-amber-800">
                      {(dayGroup.items.reduce((acc: number, curr: any) => acc + (curr.torba_sayisi || 0), 0) * 0.025).toFixed(2)}
                    </span> Ton
                  </div>
                </div>

                {/* Delivered Items */}
                <div className="space-y-2">
                  {dayGroup.items.map((item: any) => (
                    <div
                      key={item.id}
                      className="p-3.5 rounded-2xl bg-white border border-slate-200 hover:border-slate-300 transition-all space-y-2 shadow-xs"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <h4 className="text-sm font-extrabold text-slate-900">{item.ad_soyad}</h4>
                          <div className="flex items-center gap-2 text-xs text-slate-500 mt-0.5">
                            <span className="font-mono font-bold text-amber-800">TC: {item.tc_no}</span>
                            <span>•</span>
                            <span className="text-slate-700 font-medium">{item.mahalle}</span>
                          </div>
                        </div>

                        <div className="text-right">
                          <span className="text-xs font-extrabold text-emerald-800 bg-emerald-100 px-2 py-0.5 rounded-lg border border-emerald-200">
                            {item.torba_sayisi} Torba
                          </span>
                          <div className="text-[10px] text-slate-500 mt-1 font-medium">
                            {item.tarih ? item.tarih.split(' ')[1] : ''}
                          </div>
                        </div>
                      </div>

                      {/* Details row & Cancel Button */}
                      <div className="pt-2 border-t border-slate-100 flex items-center justify-between gap-2 text-xs text-slate-600">
                        <div className="truncate">
                          <span>Teslim Alan: <strong className="text-slate-900">{item.teslim_alan || item.ad_soyad}</strong></span>
                          {item.personel && <span> • Pers: {item.personel}</span>}
                        </div>

                        {/* Teslimat İptal Butonu */}
                        <button
                          onClick={() => onOpenCancel(item)}
                          className="px-2.5 py-1 rounded-lg bg-rose-50 hover:bg-rose-100 border border-rose-200 text-rose-700 text-[11px] font-bold shrink-0 flex items-center gap-1 active:scale-95 transition-all shadow-xs"
                        >
                          <Undo2 className="w-3 h-3" />
                          Hatalı Teslimat İptal Et
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {/* VIEW 2: İptal Edilen Teslimatlar Sayfası - Light Mode */}
      {subTab === 'CANCELLATIONS' && (
        <div className="space-y-3">
          <div className="p-3.5 rounded-xl bg-rose-50 border border-rose-200 text-xs text-rose-800 flex items-center gap-2 font-medium">
            <AlertTriangle className="w-4 h-4 shrink-0 text-rose-600" />
            <span>
              Bu sayfada daha önce yapılan fakat hata veya tutanak nedeniyle iptal edilen tüm teslimatlar arşivlenmektedir.
            </span>
          </div>

          {filteredCancelled.length === 0 ? (
            <div className="p-8 text-center bg-white rounded-2xl border border-slate-200 text-slate-500 text-xs shadow-sm">
              Henüz iptal edilmiş bir teslimat kaydı bulunmuyor.
            </div>
          ) : (
            filteredCancelled.map((item) => (
              <div
                key={item.id}
                className="p-4 rounded-2xl bg-white border border-rose-200 space-y-2 shadow-xs"
              >
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <h4 className="text-sm font-extrabold text-slate-900">{item.ad_soyad}</h4>
                    <div className="flex items-center gap-2 text-xs text-slate-500 mt-0.5">
                      <span className="font-mono font-bold text-rose-700">TC: {item.tc_no}</span>
                      <span>•</span>
                      <span className="text-slate-700 font-medium">{item.mahalle}</span>
                    </div>
                  </div>

                  <span className="badge badge-cancelled text-[11px]">
                    İptal Edildi
                  </span>
                </div>

                {/* Cancellation Reason */}
                <div className="p-2.5 rounded-xl bg-rose-50/70 border border-rose-200 text-xs text-rose-900">
                  <p className="font-bold text-rose-800">İptal Gerekçesi:</p>
                  <p className="mt-0.5 font-medium">{item.iptal_nedeni || 'Gerekçe belirtilmedi'}</p>
                </div>

                <div className="flex items-center justify-between text-[11px] text-slate-500 pt-1 border-t border-slate-100 font-medium">
                  <span>İşlemi Yapan: <strong className="text-slate-800">{item.personel}</strong></span>
                  <span>{item.tarih}</span>
                </div>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}
