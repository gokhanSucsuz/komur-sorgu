import { NextRequest, NextResponse } from 'next/server';
import { getDbCollections } from '@/lib/mongodb';
import { getIstanbulDate } from '@/lib/dateUtils';
import { verifySession } from '@/lib/auth';

export async function GET(request: NextRequest) {
  try {
    const session = await verifySession(request);
    if (!session.valid) {
      return session.response || NextResponse.json({ success: false, error: 'Oturum gerekli' }, { status: 401 });
    }

    const { systemSettings } = await getDbCollections();
    const syncDoc = await systemSettings.findOne({ key: 'last_delivery_sync_time' });
    const { nowIso } = getIstanbulDate();

    return NextResponse.json({
      success: true,
      lastSyncTime: syncDoc?.value || '',
      lastUpdatedBy: syncDoc?.updated_by || '',
      serverTime: nowIso,
    });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
