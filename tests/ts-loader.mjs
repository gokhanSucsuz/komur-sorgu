import { registerHooks } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (context.parentURL && context.parentURL.includes('node_modules')) {
      return nextResolve(specifier, context);
    }
    if (specifier === 'next/server') {
      return nextResolve('next/server.js', context);
    }
    // Support @/ alias -> src/
    if (specifier.startsWith('@/')) {
      const targetPath = path.join(projectRoot, 'src', specifier.slice(2));
      for (const ext of ['', '.ts', '.tsx', '/index.ts']) {
        if (fs.existsSync(targetPath + ext) && fs.statSync(targetPath + ext).isFile()) {
          return nextResolve(pathToFileURL(targetPath + ext).href, context);
        }
      }
    }

    // Support extensionless relative imports (./normalizer -> ./normalizer.ts)
    if ((specifier.startsWith('./') || specifier.startsWith('../')) && !path.extname(specifier) && context.parentURL) {
      const parentDir = path.dirname(fileURLToPath(context.parentURL));
      const candidate = path.resolve(parentDir, specifier);
      for (const ext of ['.ts', '.tsx', '.js', '/index.ts']) {
        if (fs.existsSync(candidate + ext) && fs.statSync(candidate + ext).isFile()) {
          return nextResolve(pathToFileURL(candidate + ext).href, context);
        }
      }
    }

    return nextResolve(specifier, context);
  },
});
