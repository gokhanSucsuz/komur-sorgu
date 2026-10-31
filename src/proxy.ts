import { NextRequest, NextResponse } from 'next/server';

const ALLOWED_METHODS = new Set(['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS']);
const WRITE_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

const BLOCKED_PATH_PATTERNS = [
  /(?:^|\/)\.(?:env|git|svn|htaccess|htpasswd|aws|ssh)(?:\/|$|\.)/i,
  /(?:^|\/)(?:wp-admin|wp-login|phpmyadmin|pma|actuator|server-status|cgi-bin|vendor\/phpunit)(?:\/|$)/i,
  /\.\.[/\\]/,
  /%2e%2e/i,
  /%00/,
  /\0/,
];

const MAX_STANDARD_API_BODY_BYTES = 1024 * 1024; // 1 MB
const MAX_IMPORT_API_BODY_BYTES = 15 * 1024 * 1024; // 15 MB

function applyPerimeterHeaders(response: NextResponse, isApi: boolean): NextResponse {
  response.headers.set('X-Content-Type-Options', 'nosniff');
  response.headers.set('X-Frame-Options', 'DENY');
  response.headers.set('Referrer-Policy', 'no-referrer');
  response.headers.set('Cross-Origin-Opener-Policy', 'same-origin');
  response.headers.set('Cross-Origin-Resource-Policy', 'same-origin');
  response.headers.set('X-Permitted-Cross-Domain-Policies', 'none');
  response.headers.set('X-DNS-Prefetch-Control', 'off');
  if (isApi) {
    response.headers.set('Cache-Control', 'no-store, no-cache, must-revalidate, private');
    response.headers.set('Pragma', 'no-cache');
    response.headers.set('Expires', '0');
  }
  return response;
}

export function proxy(request: NextRequest) {
  const method = (request.method || 'GET').toUpperCase();
  const pathname = request.nextUrl.pathname || '/';
  const rawUrl = request.url || '';
  const isApi = pathname.startsWith('/api');

  // 1. HTTP Method Whitelist Enforcement
  if (!ALLOWED_METHODS.has(method)) {
    return applyPerimeterHeaders(
      NextResponse.json(
        { success: false, code: 'METHOD_NOT_ALLOWED', error: 'İzin verilmeyen HTTP metodu.' },
        { status: 405, headers: { Allow: 'GET, POST, PUT, PATCH, DELETE, HEAD, OPTIONS' } }
      ),
      isApi
    );
  }

  // 2. Path Traversal, Null-Byte & Scanner Exploit Probe Blocker
  if (BLOCKED_PATH_PATTERNS.some((rx) => rx.test(pathname) || rx.test(rawUrl))) {
    return applyPerimeterHeaders(
      NextResponse.json(
        { success: false, code: 'PERIMETER_BLOCKED', error: 'Güvenlik duvarı: Geçersiz veya engellenmiş istek yolu.' },
        { status: 403 }
      ),
      isApi
    );
  }

  // 3. API Perimeter Protections (Payload Ceiling + Cross-Origin CSRF Guard)
  if (isApi) {
    const contentLengthHeader = request.headers.get('content-length');
    if (contentLengthHeader) {
      const contentLength = Number(contentLengthHeader);
      const isImportRoute = pathname.startsWith('/api/import');
      const maxAllowed = isImportRoute ? MAX_IMPORT_API_BODY_BYTES : MAX_STANDARD_API_BODY_BYTES;
      if (Number.isFinite(contentLength) && contentLength > maxAllowed) {
        return applyPerimeterHeaders(
          NextResponse.json(
            {
              success: false,
              code: 'PAYLOAD_TOO_LARGE',
              error: `İstek boyutu güvenlik sınırını (${Math.round(maxAllowed / 1024 / 1024)} MB) aşıyor.`,
            },
            { status: 413 }
          ),
          true
        );
      }
    }

    if (WRITE_METHODS.has(method)) {
      const secFetchSite = request.headers.get('sec-fetch-site');
      if (secFetchSite === 'cross-site') {
        return applyPerimeterHeaders(
          NextResponse.json(
            {
              success: false,
              code: 'CSRF_PERIMETER_REJECTED',
              error: 'Güvenlik duvarı: Çapraz kaynak (Cross-Site) yazma isteği reddedildi.',
            },
            { status: 403 }
          ),
          true
        );
      }

      const origin = request.headers.get('origin');
      const host = request.headers.get('x-forwarded-host') || request.headers.get('host');
      if (origin && host) {
        try {
          const originHost = new URL(origin).host;
          if (originHost.toLowerCase() !== host.toLowerCase()) {
            return applyPerimeterHeaders(
              NextResponse.json(
                {
                  success: false,
                  code: 'CSRF_PERIMETER_REJECTED',
                  error: 'Güvenlik duvarı: Farklı kaynaktan (Origin) gelen yazma isteği reddedildi.',
                },
                { status: 403 }
              ),
              true
            );
          }
        } catch {
          return applyPerimeterHeaders(
            NextResponse.json(
              { success: false, code: 'CSRF_PERIMETER_REJECTED', error: 'Geçersiz Origin başlığı.' },
              { status: 403 }
            ),
            true
          );
        }
      }
    }
  }

  const response = NextResponse.next();
  return applyPerimeterHeaders(response, isApi);
}

export const config = {
  matcher: [
    /*
     * Tüm uygulama ve API yollarını korur; yalnızca statik derleme dosyalarını dışarıda bırakır.
     */
    '/((?!_next/static|_next/image|favicon.ico).*)',
  ],
};

