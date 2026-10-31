import type { NextConfig } from "next";
import { execSync } from "child_process";

let appVersion = 'dev';
try {
  appVersion =
    process.env.NEXT_PUBLIC_APP_VERSION ||
    process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) ||
    process.env.RAILWAY_GIT_COMMIT_SHA?.slice(0, 7) ||
    process.env.GIT_COMMIT_SHA?.slice(0, 7) ||
    execSync('git rev-parse --short HEAD', { encoding: 'utf-8', timeout: 2000 }).trim() ||
    'v_' + Date.now().toString().slice(-6);
} catch {
  appVersion = 'v_' + Date.now().toString().slice(-6);
}

const isDev = process.env.NODE_ENV !== 'production';
const isStandaloneBuild = process.env.DOCKER_BUILD === 'true' || process.env.NEXT_STANDALONE === 'true';

// Not: Next.js'in satır içi hydration betikleri nedeniyle 'unsafe-inline' gereklidir (nonce'lu CSP dinamik render ister).
// Yine de dış kaynaklı betik, eklenti (object), iframe ve veri sızdırma (connect-src) engellenir.
const contentSecurityPolicy = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ''}`,
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "font-src 'self' data: https://fonts.gstatic.com",
  "img-src 'self' data: blob:",
  "connect-src 'self'",
  "worker-src 'self'",
  "manifest-src 'self'",
  "frame-src 'none'",
  "frame-ancestors 'self'",
  "base-uri 'self'",
  "form-action 'self'",
  "object-src 'none'",
  ...(isDev ? [] : ['upgrade-insecure-requests']),
].join('; ');

const nextConfig: NextConfig = {
  poweredByHeader: false,
  ...(isStandaloneBuild ? { output: 'standalone' } : {}),
  env: {
    NEXT_PUBLIC_APP_VERSION: appVersion,
  },
  experimental: {
    agentUpgrade: 'security',
    optimizePackageImports: ['lucide-react'],
  },
  allowedDevOrigins: [
    '10.22.1.42',
    '10.22.1.*',
    'localhost',
    '127.0.0.1',
  ],
  cacheComponents: true,
  partialPrefetching: true,
  async headers() {
    return [
      {
        source: '/sw.js',
        headers: [
          {
            key: 'Cache-Control',
            value: 'no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0',
          },
          {
            key: 'Pragma',
            value: 'no-cache',
          },
          {
            key: 'Expires',
            value: '0',
          },
        ],
      },
      {
        source: '/api/:path*',
        headers: [
          {
            key: 'Cache-Control',
            value: 'no-store, no-cache, must-revalidate, proxy-revalidate',
          },
          {
            key: 'Pragma',
            value: 'no-cache',
          },
          {
            key: 'Expires',
            value: '0',
          },
        ],
      },
      {
        source: '/(.*)',
        headers: [
          {
            key: 'X-Frame-Options',
            value: 'SAMEORIGIN',
          },
          {
            key: 'X-Content-Type-Options',
            value: 'nosniff',
          },
          {
            key: 'Referrer-Policy',
            value: 'strict-origin-when-cross-origin',
          },
          {
            key: 'Strict-Transport-Security',
            value: 'max-age=63072000; includeSubDomains; preload',
          },
          {
            key: 'Permissions-Policy',
            value: 'camera=(), microphone=(), geolocation=(self), interest-cohort=()',
          },
          {
            key: 'X-DNS-Prefetch-Control',
            value: 'off',
          },
          {
            key: 'X-Permitted-Cross-Domain-Policies',
            value: 'none',
          },
          {
            key: 'Cross-Origin-Opener-Policy',
            value: 'same-origin',
          },
          {
            key: 'Cross-Origin-Resource-Policy',
            value: 'same-origin',
          },
          {
            key: 'Content-Security-Policy',
            value: contentSecurityPolicy,
          },
        ],
      },
    ];
  },
};

export default nextConfig;
