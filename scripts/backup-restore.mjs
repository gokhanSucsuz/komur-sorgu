#!/usr/bin/env node
/**
 * Kurumsal Veritabanı Yedekleme ve Geri Yükleme Aracı (MongoDB EJSON)
 *
 * Kullanım:
 *   npm run db:backup                         (Masaüstüne veya BACKUP_DIR dizinine tam EJSON yedeği alır ve doğrular)
 *   npm run db:restore -- <yedek_klasor_yolu> (Belirtilen EJSON yedeğini koleksiyonlara geri yükler)
 */
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

const root = process.cwd();
const require = createRequire(path.join(root, 'package.json'));
const { MongoClient } = require('mongodb');
const { EJSON } = require('bson');

const envPath = path.join(root, '.env.local');
const env = {};
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^([A-Z_]+)=(.*)$/);
    if (m) env[m[1]] = m[2].trim().replace(/^["']|["']$/g, '');
  }
}

const mongoUri = process.env.MONGODB_URI || env.MONGODB_URI;
const dbName = process.env.MONGODB_DB_NAME || env.MONGODB_DB_NAME || 'komur_db';

if (!mongoUri) {
  console.error('Hata: MONGODB_URI tanımlı değil.');
  process.exit(1);
}

const args = process.argv.slice(2);
const isRestore = args[0] === '--restore' || args[0] === 'restore';

const client = new MongoClient(mongoUri);
await client.connect();
const db = client.db(dbName);

if (isRestore) {
  const sourceDir = args[1];
  if (!sourceDir || !fs.existsSync(sourceDir)) {
    console.error('Kullanım: npm run db:restore -- <yedek_klasoru>');
    await client.close();
    process.exit(1);
  }
  const files = fs.readdirSync(sourceDir).filter((f) => f.endsWith('.json') && !f.startsWith('_') && !f.includes('KEYS'));
  const restored = {};
  for (const file of files) {
    const colName = file.slice(0, -5);
    const docs = EJSON.parse(fs.readFileSync(path.join(sourceDir, file), 'utf8'));
    const col = db.collection(colName);
    await col.deleteMany({});
    if (Array.isArray(docs) && docs.length > 0) {
      await col.insertMany(docs);
    }
    restored[colName] = Array.isArray(docs) ? docs.length : 0;
  }
  console.table(restored);
  await client.close();
  process.exit(0);
}

const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
const backupDir = process.env.BACKUP_DIR || path.resolve(root, '..', `komur-yedek-${ts}`);
fs.mkdirSync(backupDir, { recursive: true });

const summary = {};
for (const { name } of await db.listCollections({}, { nameOnly: true }).toArray()) {
  const docs = await db.collection(name).find({}).toArray();
  const outFile = path.join(backupDir, `${name}.json`);
  fs.writeFileSync(outFile, EJSON.stringify(docs, { relaxed: false }), 'utf8');
  const parsed = EJSON.parse(fs.readFileSync(outFile, 'utf8'));
  summary[name] = { dbCount: docs.length, fileCount: parsed.length, verified: docs.length === parsed.length };
}

fs.writeFileSync(path.join(backupDir, '_ozet.json'), JSON.stringify(summary, null, 2), 'utf8');
console.log('BACKUP_DIR=' + backupDir);
console.table(summary);
await client.close();
process.exit(Object.values(summary).every((s) => s.verified) ? 0 : 1);

