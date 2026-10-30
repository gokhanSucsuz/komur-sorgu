import { execSync } from 'child_process';

let cachedVersion: string | null = null;

/**
 * Returns the current application version / git commit hash.
 * Works seamlessly in local dev, Docker, CI/CD, and Vercel/Railway deployments.
 */
export function getAppVersion(): string {
  if (cachedVersion) {
    return cachedVersion;
  }

  // 1. Direct environment variable (baked at build time or passed by CI/CD)
  const envVersion =
    process.env.NEXT_PUBLIC_APP_VERSION ||
    process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) ||
    process.env.RAILWAY_GIT_COMMIT_SHA?.slice(0, 7) ||
    process.env.GIT_COMMIT_SHA?.slice(0, 7);

  if (envVersion && envVersion.trim()) {
    cachedVersion = envVersion.trim();
    return cachedVersion;
  }

  // 2. Query git repository directly if running under Node.js with git available
  try {
    const gitHash = execSync('git rev-parse --short HEAD', {
      encoding: 'utf-8',
      timeout: 2000,
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();

    if (gitHash && gitHash.length >= 4) {
      cachedVersion = gitHash;
      return cachedVersion;
    }
  } catch {
    // Git is not available in production container or standalone directory
  }

  // 3. Fallback timestamp
  cachedVersion = 'v_' + (process.env.BUILD_TIMESTAMP || '20261030');
  return cachedVersion;
}
