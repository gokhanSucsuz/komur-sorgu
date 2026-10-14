import { NextResponse } from 'next/server';
import { getDbCollections } from '@/lib/mongodb';

export async function GET() {
  try {
    const { systemSettings, deliveryHistory } = await getDbCollections();
    const syncDoc = await systemSettings.findOne({ key: 'last_delivery_sync_time' });
    const count = await deliveryHistory.countDocuments({});

    return NextResponse.json({
      success: true,
      lastSyncTime: syncDoc?.value || '',
      lastUpdatedBy: syncDoc?.updated_by || '',
      totalDeliveries: count,
      serverTime: new Date().toISOString()
    });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
