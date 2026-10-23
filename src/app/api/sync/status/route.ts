import { NextRequest, NextResponse } from 'next/server';
import { getDbCollections } from '@/lib/mongodb';
import { getIstanbulDate } from '@/lib/dateUtils';
import { verifySession } from '@/lib/auth';
import { serverError } from '@/lib/security';

export async function GET(request: NextRequest) {
  try {
    const session = await verifySession(request);
    if (!session.valid) {
      return session.response || NextResponse.json({ success: false, error: 'Oturum gerekli' }, { status: 401 });
    }

    const { systemSettings, deliveryRoutes: routeCol } = await getDbCollections();
    const syncDoc = await systemSettings.findOne({ key: 'last_delivery_sync_time' });
    const { nowIso } = getIstanbulDate();

    // Fast live lock & progress projection of active routes for real-time multi-staff cockpit sync
    const activeRouteDocs = await routeCol
      .find({ durum: { $in: ['AKTIF', 'DURAKLATILDI'] } })
      .project({
        _id: 1,
        id: 1,
        rota_adi: 1,
        durum: 1,
        kilitli_personel: 1,
        kilitli_client_id: 1,
        kilit_timestamp: 1,
        kilit_tarihi: 1,
        aktif_durak_index: 1,
        tamamlanan_hane: 1,
        eksik_hane: 1,
        teslim_edilemeyen_hane: 1,
        toplam_dagitilan_torba: 1,
        updated_at: 1
      })
      .toArray();

    const activeRouteLocks = activeRouteDocs.map((r: any) => ({
      id: r.id || r._id.toString(),
      rota_adi: r.rota_adi || '',
      durum: r.durum || 'AKTIF',
      kilitli_personel: r.kilitli_personel || null,
      kilitli_client_id: r.kilitli_client_id || null,
      kilit_timestamp: r.kilit_timestamp || null,
      aktif_durak_index: r.aktif_durak_index ?? 0,
      tamamlanan_hane: r.tamamlanan_hane || 0,
      eksik_hane: r.eksik_hane || 0,
      teslim_edilemeyen_hane: r.teslim_edilemeyen_hane || 0,
      toplam_dagitilan_torba: r.toplam_dagitilan_torba || 0,
      updated_at: r.updated_at || ''
    }));

    return NextResponse.json(
      {
        success: true,
        lastSyncTime: syncDoc?.value || '',
        lastUpdatedBy: syncDoc?.updated_by || '',
        serverTime: nowIso,
        activeRouteLocks
      },
      {
        headers: {
          'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
          'Pragma': 'no-cache',
          'Expires': '0'
        }
      }
    );
  } catch (error: any) {
    if (error?.digest === 'NEXT_PRERENDER_INTERRUPTED') throw error;
    return serverError('sync/status:GET', error);
  }
}
