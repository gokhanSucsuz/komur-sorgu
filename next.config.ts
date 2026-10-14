import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  allowedDevOrigins: [
    '10.22.1.42',
    '10.22.1.*',
    'localhost',
    '127.0.0.1',
  ],
  cacheComponents: true,
  partialPrefetching: true,
};

export default nextConfig;
