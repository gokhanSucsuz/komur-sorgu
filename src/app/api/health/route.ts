import { NextRequest, NextResponse } from 'next/server';
import { getDbCollections } from '@/lib/mongodb';
import { checkCryptoEngineHealth } from '@/lib/crypto';
import { verifySession } from '@/lib/auth';
import { getAppVersion } from '@/lib/version';

export async function GET(request: NextRequest) {
  const startedAt = Date.now();
  let dbConnected = false;
  let isFallback = false;
  let calismaModu: 'RESMI' | 'DENEME' = 'RESMI';
  let dbLatencyMs = 0;

  try {
    const dbStart = Date.now();
    const cols = await getDbCollections();
    isFallback = cols.isFallback;
    calismaModu = cols.calismaModu;
    if (cols.db) {
      await cols.db.command({ ping: 1 });
    } else {
      await cols.systemSettings.findOne({ key: 'calisma_modu' });
    }
    dbLatencyMs = Date.now() - dbStart;
    dbConnected = true;
  } catch {
    dbConnected = false;
  }

  const cryptoHealth = checkCryptoEngineHealth();
  const overallHealthy = dbConnected && cryptoHealth.healthy;

  // Yalnızca ADMIN oturumu varsa ayrıntılı sistem teşhisi döndürülür; dış çağrılara iç yapı sızdırılmaz.
  const session = await verifySession(request);
  const isAdmin = session.valid && session.rol === 'ADMIN';

  if (!isAdmin) {
    return NextResponse.json(
      {
        success: overallHealthy,
        status: overallHealthy ? 'ok' : 'degraded',
        version: getAppVersion(),
        timestamp: new Date().toISOString(),
      },
      { status: overallHealthy ? 200 : 503 }
    );
  }

  const mem = process.memoryUsage();
  return NextResponse.json(
    {
      success: overallHealthy,
      status: overallHealthy ? 'ok' : 'degraded',
      version: getAppVersion(),
      timestamp: new Date().toISOString(),
      uptimeSeconds: Math.floor(process.uptime()),
      responseTimeMs: Date.now() - startedAt,
      database: {
        connected: dbConnected,
        mode: isFallback ? 'in-memory-fallback' : 'mongodb-atlas',
        latencyMs: dbLatencyMs,
        calismaModu,
      },
      crypto: cryptoHealth,
      memory: {
        rssMb: Math.round((mem.rss / 1024 / 1024) * 10) / 10,
        heapUsedMb: Math.round((mem.heapUsed / 1024 / 1024) * 10) / 10,
      },
    },
    { status: overallHealthy ? 200 : 503 }
  );
}
