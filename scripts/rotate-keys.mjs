#!/usr/bin/env node
/**
 * Kurumsal Kriptografik Anahtar Rotasyon Aracı (AES-256-GCM & HMAC-SHA256 Kör Dizin)
 *
 * Kullanım:
 *   npm run security:rotate-keys -- validate   (Salt okunur: tüm şifreli alanların ve kör indekslerin sağlığını doğrular)
 *   npm run security:rotate-keys -- apply      (Yeni anahtarlarla tüm koleksiyonları yeniden şifreler ve .env.local dosyasını günceller)
 *   npm run security:rotate-keys -- verify     (Yalnızca yeni anahtarla tüm kayıtların çözülebildiğini doğrular)
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';

const root = process.cwd();
const mode = (process.argv[2] || 'validate').toLowerCase();
if (!['validate', 'apply', 'verify'].includes(mode)) {
  console.error('Kullanım: npm run security:rotate-keys -- [validate|apply|verify]');
  process.exit(1);
}

const envPath = path.join(root, '.env.local');
if (!fs.existsSync(envPath)) {
  console.error('Hata: .env.local dosyası bulunamadı.');
  process.exit(1);
}

const env = {};
for (const line of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
  const m = line.match(/^([A-Z_]+)=(.*)$/);
  if (m) env[m[1]] = m[2].trim().replace(/^["']|["']$/g, '');
}

if (!env.MONGODB_URI || !env.ENCRYPTION_MASTER_KEY || !env.BLIND_INDEX_KEY) {
  console.error('Hata: MONGODB_URI, ENCRYPTION_MASTER_KEY ve BLIND_INDEX_KEY .env.local içinde tanımlı olmalıdır.');
  process.exit(1);
}

const newMasterKey = mode === 'apply' ? crypto.randomBytes(32).toString('hex') : env.ENCRYPTION_MASTER_KEY;
const newBlindKey = mode === 'apply' ? crypto.randomBytes(32).toString('hex') : env.BLIND_INDEX_KEY;

process.env.MONGODB_URI = env.MONGODB_URI;
process.env.ENCRYPTION_MASTER_KEY = newMasterKey;
if (mode === 'apply') {
  process.env.ENCRYPTION_MASTER_KEY_PREVIOUS = env.ENCRYPTION_MASTER_KEY;
} else if (mode === 'verify') {
  delete process.env.ENCRYPTION_MASTER_KEY_PREVIOUS;
}
process.env.BLIND_INDEX_KEY = newBlindKey;

const require = createRequire(path.join(root, 'package.json'));
const { MongoClient } = require('mongodb');
const crypt = await import(pathToFileURL(path.join(root, 'src/lib/crypto.ts')).href);
const norm = await import(pathToFileURL(path.join(root, 'src/lib/normalizer.ts')).href);

const { isEncrypted, encryptField, decryptField, hashBlindIndex, normalizeIrsaliyeNo } = crypt;
const FAIL_PREFIX = '***[';

const HASH_SOURCES = {
  tc_hash: (o) => norm.cleanTcNo(String(o.tc_no || '')),
  hane_hash: (o) => norm.cleanHaneKey(String(o.hane_no || '')),
  adres_hash: (o) => String(o.norm_adres || '').trim(),
  irsaliye_hash: (o) => normalizeIrsaliyeNo(o.irsaliye_no),
  cakisan_tc_hash: (o) => norm.cleanTcNo(String(o.cakisan_tc || '')),
  hedef_tc_hash: (o) => norm.cleanTcNo(String(o.hedef_tc || '')),
};

let encryptedValues = 0;
let decryptFailures = 0;
let hashChecked = 0;
let hashMismatches = 0;

function isPlainObject(v) {
  return v && typeof v === 'object' && (Array.isArray(v) || Object.getPrototypeOf(v) === Object.prototype);
}

function transformValue(v) {
  if (typeof v === 'string' && isEncrypted(v)) {
    const plain = decryptField(v);
    if (typeof plain !== 'string' || plain.startsWith(FAIL_PREFIX)) {
      decryptFailures++;
      return [v, v, false, true];
    }
    encryptedValues++;
    return [mode === 'apply' ? encryptField(plain) : v, plain, mode === 'apply', false];
  }
  if (Array.isArray(v)) {
    let changed = false;
    let failed = false;
    const nextArr = [];
    const plainArr = [];
    for (const item of v) {
      const [n, p, c, f] = transformValue(item);
      nextArr.push(n);
      plainArr.push(p);
      changed ||= c;
      failed ||= f;
    }
    return [nextArr, plainArr, changed, failed];
  }
  if (isPlainObject(v)) {
    let changed = false;
    let failed = false;
    const nextObj = {};
    const plainObj = {};
    for (const [k, val] of Object.entries(v)) {
      const [n, p, c, f] = transformValue(val);
      nextObj[k] = n;
      plainObj[k] = p;
      changed ||= c;
      failed ||= f;
    }
    for (const [hKey, extractor] of Object.entries(HASH_SOURCES)) {
      if (!(hKey in v) || v[hKey] == null || v[hKey] === '') continue;
      const srcVal = extractor(plainObj);
      if (!srcVal) continue;
      const freshHash = hashBlindIndex(srcVal);
      hashChecked++;
      if (mode === 'apply') {
        if (freshHash !== v[hKey]) changed = true;
        nextObj[hKey] = freshHash;
      } else if (freshHash !== v[hKey]) {
        hashMismatches++;
      }
    }
    return [nextObj, plainObj, changed, failed];
  }
  return [v, v, false, false];
}

const client = new MongoClient(env.MONGODB_URI);
await client.connect();
const db = client.db(env.MONGODB_DB_NAME || 'komur_db');

let docsTotal = 0;
let docsChanged = 0;
let docsSkipped = 0;

for (const { name } of await db.listCollections({}, { nameOnly: true }).toArray()) {
  const col = db.collection(name);
  let ops = [];
  for await (const doc of col.find({})) {
    docsTotal++;
    const { _id, ...rest } = doc;
    const [nextDoc, , changed, failed] = transformValue(rest);
    if (failed) {
      docsSkipped++;
      continue;
    }
    if (mode === 'apply' && changed) {
      ops.push({ replaceOne: { filter: { _id }, replacement: nextDoc } });
      docsChanged++;
      if (ops.length >= 200) {
        await col.bulkWrite(ops, { ordered: false });
        ops = [];
      }
    }
  }
  if (ops.length > 0) {
    await col.bulkWrite(ops, { ordered: false });
  }
}

await client.close();

if (mode === 'apply' && decryptFailures === 0) {
  const lines = fs.readFileSync(envPath, 'utf8').split(/\r?\n/);
  const updatedLines = [];
  for (const line of lines) {
    if (line.startsWith('ENCRYPTION_MASTER_KEY=')) {
      updatedLines.push(`ENCRYPTION_MASTER_KEY=${newMasterKey}`);
      updatedLines.push(`ENCRYPTION_MASTER_KEY_PREVIOUS=${env.ENCRYPTION_MASTER_KEY}`);
    } else if (line.startsWith('BLIND_INDEX_KEY=')) {
      updatedLines.push(`BLIND_INDEX_KEY=${newBlindKey}`);
    } else if (!line.startsWith('ENCRYPTION_MASTER_KEY_PREVIOUS=')) {
      updatedLines.push(line);
    }
  }
  fs.writeFileSync(envPath, updatedLines.join('\r\n'), 'utf8');
}

console.log(
  JSON.stringify(
    {
      mode,
      docsTotal,
      docsChanged,
      docsSkipped,
      encryptedValues,
      decryptFailures,
      hashChecked,
      hashMismatches,
    },
    null,
    2
  )
);

process.exit(decryptFailures > 0 ? 1 : 0);

