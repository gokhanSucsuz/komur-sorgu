import { MongoClient, Db, ObjectId, ServerApiVersion } from 'mongodb';
import { normalizeAddress, extractStreetAndDoor, normalizeMahalleName, getRecordStreetInfo, normalizeToTon, detectSettlement } from './normalizer';
import {
  encryptBeneficiary,
  decryptBeneficiary,
  encryptDeliveryHistory,
  decryptDeliveryHistory,
  encryptImportLog,
  decryptImportLog,
  encryptActivityLog,
  decryptActivityLog,
  encryptUser,
  decryptUser,
  encryptTruck,
  decryptTruck,
  encryptShift,
  decryptShift,
  encryptRouteStop,
  decryptRouteStop,
  encryptRoute,
  encryptField,
  decryptField,
  hashBlindIndex,
  hashTc,
  hashHane,
  hashAddress,
  hashPassword,
  isEncrypted,
} from './crypto';
import { getIstanbulDate } from './dateUtils';

const MONGODB_URI = process.env.MONGODB_URI || '';
const MONGODB_DB_NAME = process.env.MONGODB_DB_NAME || 'komur_db';

let cachedClient: MongoClient | null = null;
let cachedDb: Db | null = null;
let indexesInitialized = false;
let mahalleMigrationDone = false;

declare global {
  var _mongoClientPromise: Promise<MongoClient> | undefined;
  var _inMemoryMongoStore: Record<string, any[]> | undefined;
}

/**
 * Check if real MongoDB is configured
 */
export function isMongoConfigured(): boolean {
  return Boolean(MONGODB_URI && MONGODB_URI.trim().length > 0);
}

/**
 * Connect to MongoDB with connection pooling optimized for Vercel Serverless Functions
 */
export async function getMongoClient(): Promise<MongoClient> {
  if (!isMongoConfigured()) {
    throw new Error('MONGODB_URI tanımlı değil. Canlı MongoDB için .env.local veya Vercel ayarlarında MONGODB_URI belirtiniz.');
  }

  if (cachedClient) {
    return cachedClient;
  }

  // Use global cache to prevent connection exhaustion in serverless & HMR dev environments
  if (!global._mongoClientPromise) {
    const client = new MongoClient(MONGODB_URI, {
      serverApi: {
        version: ServerApiVersion.v1,
        strict: false,
        deprecationErrors: true,
      },
      maxPoolSize: 5,
      minPoolSize: 0,
      maxIdleTimeMS: 30000,
      serverSelectionTimeoutMS: 8000,
      connectTimeoutMS: 10000,
      socketTimeoutMS: 45000,
    });
    global._mongoClientPromise = client.connect();
  }

  cachedClient = await global._mongoClientPromise;
  return cachedClient;
}

/**
 * Get MongoDB Database Instance
 */
export async function getMongoDb(): Promise<Db> {
  if (cachedDb) {
    return cachedDb;
  }

  const client = await getMongoClient();
  const db = client.db(MONGODB_DB_NAME);
  cachedDb = db;

  if (!indexesInitialized) {
    try {
      await initializeIndexesAndSeed(db);
      indexesInitialized = true;
    } catch (err) {
      console.error('[MongoDB] Indexing/seed notice:', err);
    }
  }

  return db;
}

/**
 * Build MongoDB filter by ID supporting both ObjectId and string/number id
 */
export function buildIdFilter(id: any) {
  if (!id) return { _id: null };
  const strId = String(id).trim();
  if (ObjectId.isValid(strId) && strId.length === 24) {
    return {
      $or: [
        { _id: new ObjectId(strId) },
        { id: strId },
        { id: Number(strId) || 0 }
      ]
    };
  }
  return {
    $or: [
      { id: strId },
      { id: Number(strId) || 0 }
    ]
  };
}

/**
 * Normalize MongoDB document for frontend (guarantees string 'id' field)
 */
export function mapDoc<T = any>(doc: any): T {
  if (!doc) return doc;
  const mapped = { ...doc };
  if (!mapped.id && mapped._id) {
    mapped.id = mapped._id.toString();
  } else if (mapped.id) {
    mapped.id = String(mapped.id);
  }

  // Askeri Düzey AES-256-GCM Şifreli Alanları Belleğe Alırken Şeffafça Deşifre Et (Transparent Decryption)
  // MongoDB Atlas'ta veriler anlamsız rastgele hex olarak durur, yetkili uygulama kodunda şeffafça okunur.
  const piiFields = [
    'tc_no',
    'ad_soyad',
    'telefon',
    'telefon2',
    'acik_adres',
    'hane_no',
    'norm_adres',
    'sokak',
    'teslim_alan',
    'teslimat_notu',
    'uyari_notu',
    'notlar',
    'kapanis_notu',
    'iptal_nedeni',
    'hata_nedeni',
    'detay',
    'hedef_kisi',
    'hedef_tc',
    'sifre',
    'sofor_adi',
    'plaka',
    'dorse_plaka',
    'irsaliye_no',
    'personel_adi',
    'adres_guncelleme_notu',
    'cakisan_ad_soyad',
    'cakisan_tc',
    'cakisan_hane_no',
    'last_ip',
    'last_device',
    'totp_secret',
    'totp_pending_secret',
    'komur_iptal_nedeni',
    'komur_iptal_aciklama',
  ];

  for (const field of piiFields) {
    if (typeof mapped[field] === 'string' && isEncrypted(mapped[field])) {
      mapped[field] = decryptField(mapped[field]);
    }
  }

  // Transparently decrypt totp_recovery_codes array items on user documents
  if (Array.isArray(mapped.totp_recovery_codes)) {
    mapped.totp_recovery_codes = mapped.totp_recovery_codes.map((c: any) =>
      typeof c === 'string' && isEncrypted(c) ? decryptField(c) : c
    );
  }

  // Transparently decrypt uyarilar array items on beneficiary documents
  if (Array.isArray(mapped.uyarilar)) {
    mapped.uyarilar = mapped.uyarilar.map((u: any) =>
      typeof u === 'string' && isEncrypted(u) ? decryptField(u) : u
    );
  }

  // Transparently decrypt ek_bilgi on activity_logs documents
  if (typeof mapped.ek_bilgi === 'string' && isEncrypted(mapped.ek_bilgi)) {
    const decEk = decryptField(mapped.ek_bilgi);
    if (decEk) {
      try {
        mapped.ek_bilgi = JSON.parse(decEk);
      } catch {
        mapped.ek_bilgi = decEk;
      }
    }
  }

  // If route document with duraklar array, transparently decrypt each stop's PII fields
  if (Array.isArray(mapped.duraklar)) {
    mapped.duraklar = mapped.duraklar.map(decryptRouteStop);
  }

  // If beneficiary document and missing sira_no
  if (mapped.tc_no && !mapped.sira_no) {
    mapped.sira_no = String(mapped.mahalle_sira || mapped.id || '1');
    mapped.ek_liste_no = typeof mapped.ek_liste_no === 'number' ? mapped.ek_liste_no : 0;
    mapped.ek_liste_adi = mapped.ek_liste_adi || 'Ana Liste';
  }

  // KVKK: Hide deterministic HMAC blind-index hashes from JSON.stringify / NextResponse.json
  // while keeping them readable by server-side property access (e.g. doc.tc_hash).
  const blindHashFields = ['tc_hash', 'hane_hash', 'adres_hash', 'irsaliye_hash', 'cakisan_tc_hash', 'hedef_tc_hash'];
  for (const hf of blindHashFields) {
    if (hf in mapped) {
      Object.defineProperty(mapped, hf, {
        value: mapped[hf],
        enumerable: false,
        configurable: true,
        writable: true,
      });
    }
  }
  if (Array.isArray(mapped.duraklar)) {
    for (const stop of mapped.duraklar) {
      if (stop && typeof stop === 'object') {
        for (const hf of blindHashFields) {
          if (hf in stop) {
            Object.defineProperty(stop, hf, {
              value: stop[hf],
              enumerable: false,
              configurable: true,
              writable: true,
            });
          }
        }
      }
    }
  }

  return mapped;
}

export function mapDocs<T = any>(docs: any[]): T[] {
  if (!Array.isArray(docs)) return [];
  return docs.map(mapDoc);
}

// -------------------------------------------------------------
// In-Memory Fallback Implementation for Local Dev Without Atlas
// -------------------------------------------------------------
function getInMemoryStore() {
  if (!global._inMemoryMongoStore) {
    global._inMemoryMongoStore = {
      users: [],
      beneficiaries: [],
      delivery_history: [],
      truck_deliveries: [],
      import_logs: [],
      system_settings: [],
      work_shifts: [],
      import_batches: [],
      delivery_routes: [],
      activity_logs: [],
      season_archives: [],
      archived_beneficiaries: [],
      archived_truck_deliveries: [],
      archived_delivery_history: [],
      security_rate_limits: [],
      authorized_devices: [],
    };
    seedInMemoryStore(global._inMemoryMongoStore);
  }
  if (global._inMemoryMongoStore && Array.isArray(global._inMemoryMongoStore.users)) {
    const adminUser = global._inMemoryMongoStore.users.find((u: any) => u.username === 'admin');
    if (adminUser) {
      adminUser.ad_soyad = encryptField('Gökhan SUÇSUZ');
    }
  }
  return global._inMemoryMongoStore;
}

function matchDoc(doc: any, filter: any): boolean {
  if (!filter || Object.keys(filter).length === 0) return true;

  if (filter.$or && Array.isArray(filter.$or)) {
    if (!filter.$or.some((subFilter: any) => matchDoc(doc, subFilter))) {
      return false;
    }
  }
  if (filter.$and && Array.isArray(filter.$and)) {
    if (!filter.$and.every((subFilter: any) => matchDoc(doc, subFilter))) {
      return false;
    }
  }

  for (const key of Object.keys(filter)) {
    if (key === '$or' || key === '$and') continue;
    const cond = filter[key];
    const val = doc[key];

    if (cond && typeof cond === 'object' && !(cond instanceof ObjectId) && !(cond instanceof RegExp)) {
      if ('$in' in cond) {
        if (!Array.isArray(cond.$in) || !cond.$in.some((item: any) => String(item) === String(val))) return false;
      }
      if ('$gte' in cond) {
        if (val === undefined || val === null || val < cond.$gte) return false;
      }
      if ('$lte' in cond) {
        if (val === undefined || val === null || val > cond.$lte) return false;
      }
      if ('$ne' in cond) {
        if (String(val) === String(cond.$ne)) return false;
      }
      if ('$regex' in cond) {
        const re = new RegExp(cond.$regex, cond.$options || 'i');
        if (!re.test(String(val || ''))) return false;
      }
    } else if (cond instanceof RegExp) {
      if (!cond.test(String(val || ''))) return false;
    } else {
      if (String(val ?? '').toLocaleLowerCase('tr-TR') !== String(cond ?? '').toLocaleLowerCase('tr-TR')) {
        return false;
      }
    }
  }

  return true;
}

class InMemoryCollection {
  private colName: string;

  constructor(colName: string) {
    this.colName = colName;
  }

  private get items(): any[] {
    const store = getInMemoryStore();
    if (!store[this.colName]) {
      store[this.colName] = [];
    }
    return store[this.colName];
  }

  private set items(val: any[]) {
    const store = getInMemoryStore();
    store[this.colName] = val;
  }

  async findOne(filter: any = {}) {
    const found = this.items.find((item) => matchDoc(item, filter));
    return found ? JSON.parse(JSON.stringify(found)) : null;
  }

  find(filter: any = {}) {
    let results = this.items.filter((item) => matchDoc(item, filter)).map((i) => JSON.parse(JSON.stringify(i)));

    const cursor = {
      sort: (sortSpec: any) => {
        const keys = Object.keys(sortSpec);
        if (keys.length > 0) {
          const [k] = keys;
          const dir = sortSpec[k] >= 0 ? 1 : -1;
          results.sort((a, b) => {
            const va = a[k] ?? '';
            const vb = b[k] ?? '';
            if (va < vb) return -1 * dir;
            if (va > vb) return 1 * dir;
            return 0;
          });
        }
        return cursor;
      },
      skip: (n: number) => {
        results = results.slice(n);
        return cursor;
      },
      limit: (n: number) => {
        results = results.slice(0, n);
        return cursor;
      },
      toArray: async () => results,
    };

    return cursor;
  }

  async insertOne(doc: any) {
    const clone = { ...doc };
    if (!clone._id) clone._id = new ObjectId();
    if (!clone.id) clone.id = clone._id.toString();
    this.items.push(clone);
    return { acknowledged: true, insertedId: clone._id };
  }

  async insertMany(docs: any[]) {
    const insertedIds: any[] = [];
    for (const d of docs) {
      const res = await this.insertOne(d);
      insertedIds.push(res.insertedId);
    }
    return { acknowledged: true, insertedCount: docs.length, insertedIds };
  }

  async updateOne(filter: any, update: any, options: any = {}) {
    let index = this.items.findIndex((item) => matchDoc(item, filter));
    if (index === -1) {
      if (options.upsert) {
        const newDoc = { ...(update.$set || update), ...(filter.$set || filter) };
        await this.insertOne(newDoc);
        return { acknowledged: true, modifiedCount: 1, upsertedCount: 1 };
      }
      return { acknowledged: true, modifiedCount: 0 };
    }

    if (update.$set) {
      this.items[index] = { ...this.items[index], ...update.$set };
    } else {
      this.items[index] = { ...this.items[index], ...update };
    }
    return { acknowledged: true, modifiedCount: 1 };
  }

  async updateMany(filter: any, update: any) {
    let count = 0;
    this.items.forEach((item, index) => {
      if (matchDoc(item, filter)) {
        if (update.$set) {
          this.items[index] = { ...item, ...update.$set };
        } else {
          this.items[index] = { ...item, ...update };
        }
        count++;
      }
    });
    return { acknowledged: true, modifiedCount: count };
  }

  async deleteOne(filter: any) {
    const index = this.items.findIndex((item) => matchDoc(item, filter));
    if (index !== -1) {
      this.items.splice(index, 1);
      return { acknowledged: true, deletedCount: 1 };
    }
    return { acknowledged: true, deletedCount: 0 };
  }

  async deleteMany(filter: any = {}) {
    const initialLen = this.items.length;
    this.items = this.items.filter((item) => !matchDoc(item, filter));
    return { acknowledged: true, deletedCount: initialLen - this.items.length };
  }

  async countDocuments(filter: any = {}) {
    return this.items.filter((item) => matchDoc(item, filter)).length;
  }

  async distinct(field: string, filter: any = {}) {
    const values = new Set<any>();
    this.items.filter((item) => matchDoc(item, filter)).forEach((item) => {
      if (item[field] !== undefined && item[field] !== null) {
        values.add(item[field]);
      }
    });
    return Array.from(values);
  }

  async createIndex() {
    return 'ok';
  }
}

/**
 * Get typed collection handles - automatically handles MongoDB Atlas or fallback
 * Supports isolated Sandbox/Test Mode ('DENEME') vs Official Mode ('RESMI').
 */
export async function getDbCollections(options?: { forceMode?: 'RESMI' | 'DENEME' }) {
  if (isMongoConfigured()) {
    try {
      const db = await getMongoDb();
      if (!mahalleMigrationDone) {
        mahalleMigrationDone = true;
        await migrateMahalleNames(db);
        await migrateFixMerkezAndStreets(db);
      }
      const systemSettings = db.collection<any>('system_settings');
      let calismaModu: 'RESMI' | 'DENEME' = 'RESMI';
      if (options?.forceMode === 'RESMI' || options?.forceMode === 'DENEME') {
        calismaModu = options.forceMode;
      } else {
        try {
          const modeDoc = await systemSettings.findOne({ key: 'calisma_modu' });
          if (modeDoc?.value === 'DENEME') {
            calismaModu = 'DENEME';
          }
        } catch {}
      }
      const isSandboxMode = calismaModu === 'DENEME';

      return {
        isFallback: false,
        db,
        calismaModu,
        isSandboxMode,
        beneficiaries: db.collection<any>(isSandboxMode ? 'sandbox_beneficiaries' : 'beneficiaries'),
        users: db.collection<any>('users'),
        deliveryHistory: db.collection<any>(isSandboxMode ? 'sandbox_delivery_history' : 'delivery_history'),
        truckDeliveries: db.collection<any>(isSandboxMode ? 'sandbox_truck_deliveries' : 'truck_deliveries'),
        importLogs: db.collection<any>(isSandboxMode ? 'sandbox_import_logs' : 'import_logs'),
        systemSettings,
        workShifts: db.collection<any>(isSandboxMode ? 'sandbox_work_shifts' : 'work_shifts'),
        importBatches: db.collection<any>(isSandboxMode ? 'sandbox_import_batches' : 'import_batches'),
        deliveryRoutes: db.collection<any>(isSandboxMode ? 'sandbox_delivery_routes' : 'delivery_routes'),
        activityLogs: db.collection<any>(isSandboxMode ? 'sandbox_activity_logs' : 'activity_logs'),
        seasonArchives: db.collection<any>('season_archives'),
        archivedBeneficiaries: db.collection<any>('archived_beneficiaries'),
        archivedTruckDeliveries: db.collection<any>('archived_truck_deliveries'),
        archivedDeliveryHistory: db.collection<any>('archived_delivery_history'),
        archivedImportBatches: db.collection<any>('archived_import_batches'),
        archivedImportLogs: db.collection<any>('archived_import_logs'),
        securityRateLimits: db.collection<any>('security_rate_limits'),
        authorizedDevices: db.collection<any>('authorized_devices'),
        officialBeneficiaries: db.collection<any>('beneficiaries'),
        officialImportBatches: db.collection<any>('import_batches'),
        officialActivityLogs: db.collection<any>('activity_logs'),
        sandboxBeneficiaries: db.collection<any>('sandbox_beneficiaries'),
        sandboxDeliveryHistory: db.collection<any>('sandbox_delivery_history'),
        sandboxTruckDeliveries: db.collection<any>('sandbox_truck_deliveries'),
        sandboxImportLogs: db.collection<any>('sandbox_import_logs'),
        sandboxImportBatches: db.collection<any>('sandbox_import_batches'),
        sandboxDeliveryRoutes: db.collection<any>('sandbox_delivery_routes'),
        sandboxWorkShifts: db.collection<any>('sandbox_work_shifts'),
        sandboxActivityLogs: db.collection<any>('sandbox_activity_logs'),
      };
    } catch (err) {
      console.error('[MongoDB] Atlas connection failure:', err);
      throw new Error(`Canlı MongoDB Atlas veritabanına bağlanılamadı: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  // Local / dev fallback ONLY when MONGODB_URI is not set at all
  if (!mahalleMigrationDone) {
    mahalleMigrationDone = true;
    await migrateMahalleNames(null);
    await migrateFixMerkezAndStreets(null);
  }
  const systemSettings = new InMemoryCollection('system_settings') as any;
  let calismaModu: 'RESMI' | 'DENEME' = 'RESMI';
  if (options?.forceMode === 'RESMI' || options?.forceMode === 'DENEME') {
    calismaModu = options.forceMode;
  } else {
    try {
      const modeDoc = await systemSettings.findOne({ key: 'calisma_modu' });
      if (modeDoc?.value === 'DENEME') {
        calismaModu = 'DENEME';
      }
    } catch {}
  }
  const isSandboxMode = calismaModu === 'DENEME';

  return {
    isFallback: true,
    db: null as any,
    calismaModu,
    isSandboxMode,
    beneficiaries: new InMemoryCollection(isSandboxMode ? 'sandbox_beneficiaries' : 'beneficiaries') as any,
    users: new InMemoryCollection('users') as any,
    deliveryHistory: new InMemoryCollection(isSandboxMode ? 'sandbox_delivery_history' : 'delivery_history') as any,
    truckDeliveries: new InMemoryCollection(isSandboxMode ? 'sandbox_truck_deliveries' : 'truck_deliveries') as any,
    importLogs: new InMemoryCollection(isSandboxMode ? 'sandbox_import_logs' : 'import_logs') as any,
    systemSettings,
    workShifts: new InMemoryCollection(isSandboxMode ? 'sandbox_work_shifts' : 'work_shifts') as any,
    importBatches: new InMemoryCollection(isSandboxMode ? 'sandbox_import_batches' : 'import_batches') as any,
    deliveryRoutes: new InMemoryCollection(isSandboxMode ? 'sandbox_delivery_routes' : 'delivery_routes') as any,
    activityLogs: new InMemoryCollection(isSandboxMode ? 'sandbox_activity_logs' : 'activity_logs') as any,
    seasonArchives: new InMemoryCollection('season_archives') as any,
    archivedBeneficiaries: new InMemoryCollection('archived_beneficiaries') as any,
    archivedTruckDeliveries: new InMemoryCollection('archived_truck_deliveries') as any,
    archivedDeliveryHistory: new InMemoryCollection('archived_delivery_history') as any,
    archivedImportBatches: new InMemoryCollection('archived_import_batches') as any,
    archivedImportLogs: new InMemoryCollection('archived_import_logs') as any,
    securityRateLimits: new InMemoryCollection('security_rate_limits') as any,
    authorizedDevices: new InMemoryCollection('authorized_devices') as any,
    officialBeneficiaries: new InMemoryCollection('beneficiaries') as any,
    officialImportBatches: new InMemoryCollection('import_batches') as any,
    officialActivityLogs: new InMemoryCollection('activity_logs') as any,
    sandboxBeneficiaries: new InMemoryCollection('sandbox_beneficiaries') as any,
    sandboxDeliveryHistory: new InMemoryCollection('sandbox_delivery_history') as any,
    sandboxTruckDeliveries: new InMemoryCollection('sandbox_truck_deliveries') as any,
    sandboxImportLogs: new InMemoryCollection('sandbox_import_logs') as any,
    sandboxImportBatches: new InMemoryCollection('sandbox_import_batches') as any,
    sandboxDeliveryRoutes: new InMemoryCollection('sandbox_delivery_routes') as any,
    sandboxWorkShifts: new InMemoryCollection('sandbox_work_shifts') as any,
    sandboxActivityLogs: new InMemoryCollection('sandbox_activity_logs') as any,
  };
}

/**
 * Initialize MongoDB Indexes and Seed Data on MongoDB Atlas
 */
async function initializeIndexesAndSeed(db: Db) {
  const beneficiaries = db.collection('beneficiaries');
  const users = db.collection('users');
  const history = db.collection('delivery_history');
  const trucks = db.collection('truck_deliveries');
  const logs = db.collection('import_logs');
  const settings = db.collection('system_settings');
  const shifts = db.collection('work_shifts');
  const activityLogs = db.collection('activity_logs');
  const rateLimits = db.collection('security_rate_limits');

  try {
    await Promise.allSettled([
      // Askeri Düzey AES-256-GCM ve Kör Dizin (Blind Index - HMAC-SHA256) İndeksleri
      beneficiaries.createIndex({ tc_hash: 1 }, { unique: true, sparse: true }),
      beneficiaries.createIndex({ hane_hash: 1 }, { sparse: true }),
      beneficiaries.createIndex({ adres_hash: 1 }, { sparse: true }),
      beneficiaries.createIndex({ mahalle: 1 }),
      beneficiaries.createIndex({ teslimat_durumu: 1 }),
      beneficiaries.createIndex({ imza_durumu: 1, teslimat_durumu: 1 }),

      users.createIndex({ username: 1 }, { unique: true }),
      users.createIndex({ rol: 1 }),
      users.createIndex({ active_session_token: 1 }, { sparse: true }),

      db.collection('delivery_routes').createIndex({ durum: 1 }),
      db.collection('delivery_routes').createIndex({ olusturma_tarihi: -1 }),

      history.createIndex({ gun_tarihi: -1 }),
      history.createIndex({ tc_hash: 1 }, { sparse: true }),
      history.createIndex({ islem_tipi: 1 }),

      trucks.createIndex({ tarih: -1 }),
      trucks.createIndex({ tir_sirasi: -1 }),
      trucks.createIndex({ irsaliye_hash: 1 }, { unique: true, sparse: true }),

      logs.createIndex({ batch_id: 1 }),
      logs.createIndex({ tc_hash: 1 }, { sparse: true }),
      logs.createIndex({ cakisan_tc_hash: 1 }, { sparse: true }),
      logs.createIndex({ tarih: -1 }),

      settings.createIndex({ key: 1 }, { unique: true }),

      shifts.createIndex({ tarih: -1 }),
      shifts.createIndex({ personel_adi: 1 }),
      shifts.createIndex({ durum: 1 }),

      activityLogs.createIndex({ tarih_iso: -1 }),
      activityLogs.createIndex({ hedef_tc_hash: 1 }, { sparse: true }),
      activityLogs.createIndex({ islem_tipi: 1 }),
      activityLogs.createIndex({ kullanici_adi: 1 }),
      activityLogs.createIndex({ gun_tarihi: -1 }),

      // Kömür Dönemleri ve Arşiv İndeksleri
      db.collection('season_archives').createIndex({ donem_kodu: 1 }, { unique: true }),
      db.collection('season_archives').createIndex({ kapanis_tarihi: -1 }),
      db.collection('archived_beneficiaries').createIndex({ donem_kodu: 1 }),
      db.collection('archived_beneficiaries').createIndex({ donem_kodu: 1, tc_hash: 1 }),
      db.collection('archived_beneficiaries').createIndex({ donem_kodu: 1, mahalle: 1 }),
      db.collection('archived_truck_deliveries').createIndex({ donem_kodu: 1 }),
      db.collection('archived_delivery_history').createIndex({ donem_kodu: 1 }),
      db.collection('archived_import_batches').createIndex({ donem_kodu: 1 }),
      db.collection('archived_import_batches').createIndex({ batch_id: 1 }),
      db.collection('archived_import_logs').createIndex({ donem_kodu: 1 }),
      db.collection('archived_import_logs').createIndex({ batch_id: 1 }),

      // Dağıtık Brute-Force Koruma İndeksleri (TTL otomatik temizleme dahil)
      rateLimits.createIndex({ key: 1 }, { unique: true }),
      rateLimits.createIndex({ expires_at: 1 }, { expireAfterSeconds: 0 }),

      // Deneme Alanı / Sandbox Koleksiyon İndeksleri (Gerçek Mod ile Birebir Aynı Güvenlik & Mükerrerlik Koruması)
      db.collection('sandbox_beneficiaries').createIndex({ tc_hash: 1 }, { unique: true, sparse: true }),
      db.collection('sandbox_beneficiaries').createIndex({ hane_hash: 1 }, { sparse: true }),
      db.collection('sandbox_beneficiaries').createIndex({ adres_hash: 1 }, { sparse: true }),
      db.collection('sandbox_beneficiaries').createIndex({ mahalle: 1 }),
      db.collection('sandbox_beneficiaries').createIndex({ teslimat_durumu: 1 }),
      db.collection('sandbox_import_logs').createIndex({ batch_id: 1 }),
      db.collection('sandbox_delivery_history').createIndex({ gun_tarihi: -1 }),
    ]);
  } catch (err) {
    console.warn('[MongoDB] Index initialization notice:', err);
  }

  // 1. Seed Settings (Quota, Total Allocation, Active Season & Working Mode)
  const existingSetting = await settings.findOne({ key: 'varsayilan_hedef_torba' });
  if (!existingSetting) {
    await settings.insertOne({ key: 'varsayilan_hedef_torba', value: '34' });
  }

  const existingTahsis = await settings.findOne({ key: 'toplam_tahsis_tonaj' });
  if (!existingTahsis) {
    await settings.insertOne({ key: 'toplam_tahsis_tonaj', value: '0' });
  }

  const existingCalismaModu = await settings.findOne({ key: 'calisma_modu' });
  if (!existingCalismaModu) {
    await settings.insertOne({ key: 'calisma_modu', value: 'RESMI' });
  }

  const existingSeason = await settings.findOne({ key: 'aktif_donem' });
  if (!existingSeason) {
    await settings.insertOne({
      key: 'aktif_donem',
      value: JSON.stringify({
        kod: '2026-2027',
        baslik: '2026-2027 Kömür Dağıtım Dönemi',
        baslangic_tarihi: '2026-10-01',
        durum: 'AKTIF',
      }),
    });
  }

  // 2. Initial Admin User if none exists or update existing admin name to Gökhan SUÇSUZ
  const userCount = await users.countDocuments();
  let initialAdminPass = (process.env.INITIAL_ADMIN_PASSWORD || '').trim();
  if (!initialAdminPass) {
    if (process.env.NODE_ENV === 'production') {
      console.warn('[Güvenlik Uyarısı] INITIAL_ADMIN_PASSWORD ortam değişkeni tanımlanmamış. İlk kurulum için güçlü bir şifre belirleyiniz.');
    }
    initialAdminPass = 'EdirneSydv2026!';
  }
  const nowStr = new Date().toLocaleString('tr-TR');

  if (userCount === 0) {
    await users.insertOne(encryptUser({
      id: '1',
      username: 'admin',
      ad_soyad: 'Gökhan SUÇSUZ',
      rol: 'ADMIN',
      sifre_hash: hashPassword(initialAdminPass),
      telefon: '05551112233',
      aktif: 1,
      created_at: nowStr,
    }));
  } else {
    // Ensure admin user ad_soyad is updated to 'Gökhan SUÇSUZ'
    await users.updateOne(
      { username: 'admin' },
      { $set: { ad_soyad: encryptField('Gökhan SUÇSUZ') } }
    );
  }

  // 3. Otomatik Şifreleme Migrasyonu: Veritabanındaki tüm kullanıcılar, şoförler, rotalar ve kişisel verileri AES-256-GCM ile şifrele
  await migrateAndEncryptExistingData(db);

  // 4. Mahalle İsimleri İyileştirme Migrasyonu: "Yıl Mahallesi", "Yıl Mah." -> "100. Yıl Mah."
  await migrateMahalleNames(db);

  // 5. Kapı No ve Sokak Senkronizasyonu: Açık adresteki gerçek kapı no ve sokak ile eşitle
  await migrateKapiNoAndStreets(db);

  // 6. Merkez Mahallesi ve Sokak İyileştirmesi: Merkez Mah. kayıtlarını gerçek köy/mahallere dönüştür, kadastro _ eklerini temizle ve Köy İçi etiketini düzelt
  await migrateFixMerkezAndStreets(db);

  // 7. Initial 4 Authorized Device Slots (Kurumsal 4 Saha Telefonu Kuralı)
  const devicesCol = db.collection('authorized_devices');
  const deviceSlotCount = await devicesCol.countDocuments();
  if (deviceSlotCount === 0) {
    const initialSlots = [
      { slot_no: 1, slot_name: '1. Saha Dağıtım Telefonu', durum: 'BEKLIYOR', device_token_hash: null, device_model: null, paired_at: null, last_used_at: null, created_at: nowStr },
      { slot_no: 2, slot_name: '2. Saha Dağıtım Telefonu', durum: 'BEKLIYOR', device_token_hash: null, device_model: null, paired_at: null, last_used_at: null, created_at: nowStr },
      { slot_no: 3, slot_name: '3. Saha Dağıtım Telefonu', durum: 'BEKLIYOR', device_token_hash: null, device_model: null, paired_at: null, last_used_at: null, created_at: nowStr },
      { slot_no: 4, slot_name: '4. Saha Dağıtım Telefonu', durum: 'BEKLIYOR', device_token_hash: null, device_model: null, paired_at: null, last_used_at: null, created_at: nowStr },
    ];
    await devicesCol.insertMany(initialSlots);
  }
}

function seedInMemoryStore(store: Record<string, any[]>) {
  const { nowLocaleTr } = getIstanbulDate();
  const initialAdminPass = (process.env.INITIAL_ADMIN_PASSWORD || 'EdirneSydv2026!').trim();
  store.system_settings = [
    { key: 'varsayilan_hedef_torba', value: '34' },
    { key: 'toplam_tahsis_tonaj', value: '0' },
    { key: 'calisma_modu', value: 'RESMI' },
  ];
  store.users = [
    encryptUser({
      id: '1',
      username: 'admin',
      ad_soyad: 'Gökhan SUÇSUZ',
      rol: 'ADMIN',
      sifre_hash: hashPassword(initialAdminPass),
      telefon: '05551112233',
      aktif: 1,
      created_at: nowLocaleTr,
    }),
  ];
  store.beneficiaries = [];
  store.delivery_history = [];
  store.truck_deliveries = [];
  store.work_shifts = [];
  store.activity_logs = [];
  store.import_logs = [];
  store.import_batches = [];
  store.delivery_routes = [];
  store.sandbox_beneficiaries = [];
  store.sandbox_delivery_history = [];
  store.sandbox_truck_deliveries = [];
  store.sandbox_work_shifts = [];
  store.sandbox_activity_logs = [];
  store.sandbox_import_logs = [];
  store.sandbox_import_batches = [];
  store.sandbox_delivery_routes = [];
  store.season_archives = [];
  store.archived_beneficiaries = [];
  store.archived_truck_deliveries = [];
  store.archived_delivery_history = [];
  store.archived_import_batches = [];
  store.archived_import_logs = [];
  store.authorized_devices = [
    { slot_no: 1, slot_name: '1. Saha Dağıtım Telefonu', durum: 'BEKLIYOR', device_token_hash: null, device_model: null, paired_at: null, last_used_at: null, created_at: nowLocaleTr },
    { slot_no: 2, slot_name: '2. Saha Dağıtım Telefonu', durum: 'BEKLIYOR', device_token_hash: null, device_model: null, paired_at: null, last_used_at: null, created_at: nowLocaleTr },
    { slot_no: 3, slot_name: '3. Saha Dağıtım Telefonu', durum: 'BEKLIYOR', device_token_hash: null, device_model: null, paired_at: null, last_used_at: null, created_at: nowLocaleTr },
    { slot_no: 4, slot_name: '4. Saha Dağıtım Telefonu', durum: 'BEKLIYOR', device_token_hash: null, device_model: null, paired_at: null, last_used_at: null, created_at: nowLocaleTr },
  ];
}

/**
 * Record a user operation / audit activity log (with AES-256-GCM encryption for PII)
 */
export async function recordActivityLog(item: {
  kullanici_adi: string;
  kullanici_rolu?: 'ADMIN' | 'PERSONEL';
  islem_tipi: string;
  baslik: string;
  detay: string;
  hedef_kisi?: string | null;
  hedef_tc?: string | null;
  mahalle?: string | null;
  torba_sayisi?: number | null;
  tarih?: string;
  tarih_iso?: string;
  ek_bilgi?: any;
  forceOfficial?: boolean;
}) {
  try {
    const { activityLogs, officialActivityLogs, calismaModu } = await getDbCollections();
    const { nowIso, nowLocaleTr, nowEnCa } = getIstanbulDate();
    const { forceOfficial, ...restItem } = item;
    const doc = {
      ...restItem,
      calisma_modu: calismaModu,
      kullanici_rolu: item.kullanici_rolu || (item.kullanici_adi?.toLowerCase().includes('admin') || item.kullanici_adi?.toLowerCase().includes('yönetici') ? 'ADMIN' : 'PERSONEL'),
      tarih: item.tarih || nowLocaleTr,
      tarih_iso: item.tarih_iso || nowIso,
      gun_tarihi: item.ek_bilgi?.gun_tarihi || nowEnCa,
    };
    // Encrypt sensitive details before writing to MongoDB Atlas
    const encryptedDoc = encryptActivityLog(doc);
    const targetCol = forceOfficial ? officialActivityLogs : activityLogs;
    await targetCol.insertOne(encryptedDoc);
    return doc;
  } catch (err) {
    console.error('Error recording activity log:', err);
    return null;
  }
}

/**
 * Automatically migrate and encrypt any unencrypted plaintext documents in MongoDB Atlas
 * using military/banking-grade AES-256-GCM and HMAC-SHA256 blind indexing.
 * Ensures zero plaintext personal data remains in the database.
 */
export async function migrateAndEncryptExistingData(db: Db) {
  try {
    const settings = db.collection('system_settings');
    const migFlag = await settings.findOne({ key: 'migrations_complete_v2' });
    if (migFlag?.value !== 'true') {
      const beneficiaries = db.collection('beneficiaries');
      const history = db.collection('delivery_history');
      const logs = db.collection('import_logs');
      const activityLogs = db.collection('activity_logs');
      const routesCol = db.collection('delivery_routes');

    // 1. Hak Sahipleri (Beneficiaries) Şifreleme Migrasyonu
    const unencryptedBens = await beneficiaries.find({
      $or: [
        { tc_hash: { $exists: false } },
        { tc_no: { $not: /^ENC:GCM:v1:/ } },
        { teslim_alan: { $exists: true, $ne: null, $not: /^ENC:GCM:v1:/ } },
        { teslimat_notu: { $exists: true, $ne: null, $not: /^ENC:GCM:v1:/ } }
      ]
    }).toArray();

    if (unencryptedBens.length > 0) {
      console.log(`[AES-256-GCM] Veritabanında ${unencryptedBens.length} adet açık kayıt tespit edildi, şifreleniyor...`);
      for (const b of unencryptedBens) {
        const plainTc = isEncrypted(b.tc_no) ? decryptField(b.tc_no) : b.tc_no;
        const plainName = isEncrypted(b.ad_soyad) ? decryptField(b.ad_soyad) : b.ad_soyad;
        const plainTel = isEncrypted(b.telefon) ? decryptField(b.telefon) : b.telefon;
        const plainTel2 = isEncrypted(b.telefon2) ? decryptField(b.telefon2) : b.telefon2;
        const plainAdres = isEncrypted(b.acik_adres) ? decryptField(b.acik_adres) : b.acik_adres;
        const plainHane = isEncrypted(b.hane_no) ? decryptField(b.hane_no) : b.hane_no;
        const plainNorm = isEncrypted(b.norm_adres) ? decryptField(b.norm_adres) : b.norm_adres;
        const plainSokak = isEncrypted(b.sokak) ? decryptField(b.sokak) : b.sokak;
        const plainTeslimAlan = isEncrypted(b.teslim_alan) ? decryptField(b.teslim_alan) : b.teslim_alan;
        const plainNot = isEncrypted(b.teslimat_notu) ? decryptField(b.teslimat_notu) : b.teslimat_notu;
        const plainUyari = isEncrypted(b.uyari_notu) ? decryptField(b.uyari_notu) : b.uyari_notu;

        const updateFields: any = {
          tc_no: encryptField(plainTc),
          tc_hash: hashTc(plainTc),
          ad_soyad: encryptField(plainName),
          telefon: encryptField(plainTel),
          telefon2: encryptField(plainTel2),
          acik_adres: encryptField(plainAdres),
          hane_no: encryptField(plainHane),
          hane_hash: hashHane(plainHane),
          norm_adres: encryptField(plainNorm),
          adres_hash: hashAddress(plainNorm),
          sokak: encryptField(plainSokak),
          teslim_alan: encryptField(plainTeslimAlan),
          teslimat_notu: encryptField(plainNot),
          uyari_notu: encryptField(plainUyari),
        };

        await beneficiaries.updateOne({ _id: b._id }, { $set: updateFields });
      }
      console.log(`[AES-256-GCM] ${unencryptedBens.length} hak sahibi başarıyla AES-256-GCM ile şifrelendi.`);
    }

    // 2. Teslimat Geçmişi (Delivery History) Şifreleme Migrasyonu
    const unencryptedHist = await history.find({
      $or: [
        { tc_hash: { $exists: false } },
        { tc_no: { $not: /^ENC:GCM:v1:/ } }
      ]
    }).toArray();

    if (unencryptedHist.length > 0) {
      console.log(`[AES-256-GCM] ${unencryptedHist.length} teslimat geçmişi kaydı şifreleniyor...`);
      for (const h of unencryptedHist) {
        const plainTc = isEncrypted(h.tc_no) ? decryptField(h.tc_no) : h.tc_no;
        const plainName = isEncrypted(h.ad_soyad) ? decryptField(h.ad_soyad) : h.ad_soyad;
        const plainAdres = isEncrypted(h.acik_adres) ? decryptField(h.acik_adres) : h.acik_adres;
        const plainTeslimAlan = isEncrypted(h.teslim_alan) ? decryptField(h.teslim_alan) : h.teslim_alan;
        const plainNot = isEncrypted(h.notlar) ? decryptField(h.notlar) : h.notlar;
        const plainIptal = isEncrypted(h.iptal_nedeni) ? decryptField(h.iptal_nedeni) : h.iptal_nedeni;

        const updateFields: any = {
          tc_no: encryptField(plainTc),
          tc_hash: hashTc(plainTc),
          ad_soyad: encryptField(plainName),
          acik_adres: encryptField(plainAdres),
          teslim_alan: encryptField(plainTeslimAlan),
          notlar: encryptField(plainNot),
          iptal_nedeni: encryptField(plainIptal),
        };

        await history.updateOne({ _id: h._id }, { $set: updateFields });
      }
    }

    // 3. Sistem İşlem Kayıtları (Activity Logs) Şifreleme Migrasyonu
    const unencryptedActs = await activityLogs.find({
      $or: [
        { hedef_tc_hash: { $exists: false } },
        { detay: { $not: /^ENC:GCM:v1:/ } }
      ]
    }).toArray();

    if (unencryptedActs.length > 0) {
      console.log(`[AES-256-GCM] ${unencryptedActs.length} işlem kaydı şifreleniyor...`);
      for (const a of unencryptedActs) {
        const plainTc = isEncrypted(a.hedef_tc) ? decryptField(a.hedef_tc) : a.hedef_tc;
        const plainKisi = isEncrypted(a.hedef_kisi) ? decryptField(a.hedef_kisi) : a.hedef_kisi;
        const plainDetay = isEncrypted(a.detay) ? decryptField(a.detay) : a.detay;

        const updateFields: any = {
          detay: encryptField(plainDetay),
          hedef_kisi: encryptField(plainKisi),
          hedef_tc: encryptField(plainTc),
          hedef_tc_hash: hashTc(plainTc),
        };

        await activityLogs.updateOne({ _id: a._id }, { $set: updateFields });
      }
    }

    // 4. Excel Yükleme Hata Günlükleri (Import Logs) Şifreleme Migrasyonu
    const unencryptedLogs = await logs.find({
      $or: [
        { tc_hash: { $exists: false } },
        { tc_no: { $not: /^ENC:GCM:v1:/ } }
      ]
    }).toArray();

    if (unencryptedLogs.length > 0) {
      for (const l of unencryptedLogs) {
        const plainTc = isEncrypted(l.tc_no) ? decryptField(l.tc_no) : l.tc_no;
        const plainName = isEncrypted(l.ad_soyad) ? decryptField(l.ad_soyad) : l.ad_soyad;
        const plainTel = isEncrypted(l.telefon) ? decryptField(l.telefon) : l.telefon;
        const plainAdres = isEncrypted(l.acik_adres) ? decryptField(l.acik_adres) : l.acik_adres;
        const plainHane = isEncrypted(l.hane_no) ? decryptField(l.hane_no) : l.hane_no;
        const plainHata = isEncrypted(l.hata_nedeni) ? decryptField(l.hata_nedeni) : l.hata_nedeni;
        const plainCakisanAdSoyad = isEncrypted(l.cakisan_ad_soyad) ? decryptField(l.cakisan_ad_soyad) : l.cakisan_ad_soyad;
        const plainCakisanTc = isEncrypted(l.cakisan_tc) ? decryptField(l.cakisan_tc) : l.cakisan_tc;
        const plainCakisanHane = isEncrypted(l.cakisan_hane_no) ? decryptField(l.cakisan_hane_no) : l.cakisan_hane_no;

        const updateFields: any = {
          tc_no: encryptField(plainTc),
          tc_hash: hashTc(plainTc),
          ad_soyad: encryptField(plainName),
          telefon: encryptField(plainTel),
          acik_adres: encryptField(plainAdres),
          hane_no: encryptField(plainHane),
          hata_nedeni: encryptField(plainHata),
        };

        if (plainCakisanAdSoyad) {
          updateFields.cakisan_ad_soyad = encryptField(plainCakisanAdSoyad);
        }
        if (plainCakisanTc) {
          updateFields.cakisan_tc = encryptField(plainCakisanTc);
          updateFields.cakisan_tc_hash = hashTc(plainCakisanTc);
        }
        if (plainCakisanHane) {
          updateFields.cakisan_hane_no = encryptField(plainCakisanHane);
        }

        await logs.updateOne({ _id: l._id }, { $set: updateFields });
      }
    }

    // 5. Kullanıcı Hesapları (Users) Şifreleme Migrasyonu (Ad Soyad, Telefon, tek yönlü scrypt Hash)
    const usersCol = db.collection('users');
    const unencryptedUsers = await usersCol.find({
      $or: [
        { sifre: { $exists: true } },
        { ad_soyad: { $not: /^ENC:GCM:v1:/ } },
        { telefon: { $not: /^ENC:GCM:v1:/ } },
        { sifre_hash: { $exists: false } }
      ]
    }).toArray();

    if (unencryptedUsers.length > 0) {
      console.log(`[AES-256-GCM] ${unencryptedUsers.length} kullanıcı hesabı şifreleniyor...`);
      for (const u of unencryptedUsers) {
        const plainName = isEncrypted(u.ad_soyad) ? decryptField(u.ad_soyad) : u.ad_soyad;
        const plainPass = u.sifre ? (isEncrypted(u.sifre) ? decryptField(u.sifre) : u.sifre) : '';
        const plainTel = isEncrypted(u.telefon) ? decryptField(u.telefon) : u.telefon;

        const updateFields: any = {
          ad_soyad: encryptField(plainName),
          telefon: encryptField(plainTel),
        };
        if (!u.sifre_hash && plainPass) {
          updateFields.sifre_hash = hashPassword(String(plainPass));
        }
        const updateOp: any = { $set: updateFields };
        if (u.sifre !== undefined && (u.sifre_hash || plainPass)) {
          updateOp.$unset = { sifre: '' };
        }
        await usersCol.updateOne({ _id: u._id }, updateOp);
      }
      console.log(`[AES-256-GCM] Kullanıcı hesapları (şifre hash, telefon, isim) başarıyla şifrelendi.`);
    }

    // 6. Şoförler ve Tır Sevkiyatları (Truck Deliveries) Şifreleme Migrasyonu
    const trucksCol = db.collection('truck_deliveries');
    const unencryptedTrucks = await trucksCol.find({
      $or: [
        { sofor_adi: { $not: /^ENC:GCM:v1:/ } },
        { plaka: { $not: /^ENC:GCM:v1:/ } },
        { irsaliye_no: { $not: /^ENC:GCM:v1:/ } }
      ]
    }).toArray();

    if (unencryptedTrucks.length > 0) {
      console.log(`[AES-256-GCM] ${unencryptedTrucks.length} şoför ve tır sevkiyatı kaydı şifreleniyor...`);
      for (const t of unencryptedTrucks) {
        const plainSofor = isEncrypted(t.sofor_adi) ? decryptField(t.sofor_adi) : t.sofor_adi;
        const plainPlaka = isEncrypted(t.plaka) ? decryptField(t.plaka) : t.plaka;
        const plainIrsaliye = isEncrypted(t.irsaliye_no) ? decryptField(t.irsaliye_no) : t.irsaliye_no;
        const plainNot = isEncrypted(t.notlar) ? decryptField(t.notlar) : t.notlar;

        const updateFields: any = {
          sofor_adi: encryptField(plainSofor),
          plaka: encryptField(plainPlaka),
          irsaliye_no: encryptField(plainIrsaliye),
          notlar: encryptField(plainNot),
        };
        await trucksCol.updateOne({ _id: t._id }, { $set: updateFields });
      }
      console.log(`[AES-256-GCM] Şoförler ve tır sevkiyatları başarıyla şifrelendi.`);
    }

    // 7. Personel Mesaileri (Work Shifts) Şifreleme Migrasyonu
    const shiftsCol = db.collection('work_shifts');
    const unencryptedShifts = await shiftsCol.find({
      $or: [
        { personel_adi: { $not: /^ENC:GCM:v1:/ } }
      ]
    }).toArray();

    if (unencryptedShifts.length > 0) {
      for (const s of unencryptedShifts) {
        const plainPersonel = isEncrypted(s.personel_adi) ? decryptField(s.personel_adi) : s.personel_adi;
        const plainNot = isEncrypted(s.notlar) ? decryptField(s.notlar) : s.notlar;
        const updateFields: any = {
          personel_adi: encryptField(plainPersonel),
          notlar: encryptField(plainNot),
        };
        await shiftsCol.updateOne({ _id: s._id }, { $set: updateFields });
      }
    }

    // 8. Dağıtım Rotaları (Delivery Routes) Durak Kişisel Verileri Şifreleme Migrasyonu
    const allRoutes = await routesCol.find({}).toArray();
    for (const r of allRoutes) {
      const stops = Array.isArray(r.duraklar) ? r.duraklar : [];
      const needsEncryption = stops.some((s: any) => (s.tc_no && !isEncrypted(s.tc_no)) || (s.ad_soyad && !isEncrypted(s.ad_soyad))) ||
        (r.notlar && !isEncrypted(r.notlar)) ||
        (r.kapanis_notu && !isEncrypted(r.kapanis_notu));

      if (needsEncryption) {
        const encryptedStops = stops.map(encryptRouteStop);
        await routesCol.updateOne(
          { _id: r._id },
          {
            $set: {
              duraklar: encryptedStops,
              notlar: r.notlar ? encryptField(isEncrypted(r.notlar) ? decryptField(r.notlar) : r.notlar) : r.notlar,
              kapanis_notu: r.kapanis_notu ? encryptField(isEncrypted(r.kapanis_notu) ? decryptField(r.kapanis_notu) : r.kapanis_notu) : r.kapanis_notu,
            },
          }
        );
      }
    }

    // Mark migration complete in system_settings so subsequent cold starts skip this check
    await settings.updateOne(
      { key: 'migrations_complete_v2' },
      { $set: { key: 'migrations_complete_v2', value: 'true', completed_at: new Date().toISOString() } },
      { upsert: true }
    );
  }

  // 6. KVKK / AES-256-GCM Migrasyonu: import_logs tablosundaki cakisan_ad_soyad, cakisan_tc ve cakisan_hane_no alanları
  const migV3Flag = await settings.findOne({ key: 'migrations_complete_v3_cakisan_kvkk' });
  if (migV3Flag?.value !== 'true') {
    const logs = db.collection('import_logs');
    const unencryptedImportLogs = await logs.find({
      $or: [
        { cakisan_tc: { $exists: true, $ne: null, $not: /^ENC:GCM:v1:/ } },
        { cakisan_ad_soyad: { $exists: true, $ne: null, $not: /^ENC:GCM:v1:/ } },
        { cakisan_hane_no: { $exists: true, $ne: null, $not: /^ENC:GCM:v1:/ } },
        { cakisan_tc_hash: { $exists: false } },
      ]
    }).toArray();

    if (unencryptedImportLogs.length > 0) {
      console.log(`[KVKK / AES-256-GCM] import_logs tablosunda ${unencryptedImportLogs.length} adet açık/kısmi şifreli kayıt tespit edildi, şifreleniyor...`);
      for (const l of unencryptedImportLogs) {
        const updateFields: any = {};

        if (l.cakisan_ad_soyad && !isEncrypted(l.cakisan_ad_soyad)) {
          updateFields.cakisan_ad_soyad = encryptField(String(l.cakisan_ad_soyad));
        }
        if (l.cakisan_tc) {
          const rawTc = isEncrypted(l.cakisan_tc) ? decryptField(l.cakisan_tc) : l.cakisan_tc;
          if (!isEncrypted(l.cakisan_tc)) {
            updateFields.cakisan_tc = encryptField(String(l.cakisan_tc));
          }
          if (!l.cakisan_tc_hash && rawTc) {
            updateFields.cakisan_tc_hash = hashTc(String(rawTc));
          }
        }
        if (l.cakisan_hane_no && !isEncrypted(l.cakisan_hane_no)) {
          updateFields.cakisan_hane_no = encryptField(String(l.cakisan_hane_no));
        }
        if (l.tc_no && !isEncrypted(l.tc_no)) {
          updateFields.tc_no = encryptField(String(l.tc_no));
          updateFields.tc_hash = hashTc(String(l.tc_no));
        }
        if (l.ad_soyad && !isEncrypted(l.ad_soyad)) {
          updateFields.ad_soyad = encryptField(String(l.ad_soyad));
        }
        if (l.hata_nedeni && !isEncrypted(l.hata_nedeni)) {
          updateFields.hata_nedeni = encryptField(String(l.hata_nedeni));
        }

        if (Object.keys(updateFields).length > 0) {
          await logs.updateOne({ _id: l._id }, { $set: updateFields });
        }
      }
      console.log(`[KVKK / AES-256-GCM] ${unencryptedImportLogs.length} adet import_logs kaydı başarıyla AES-256-GCM ile şifrelendi.`);
    }

    await settings.updateOne(
      { key: 'migrations_complete_v3_cakisan_kvkk' },
      { $set: { key: 'migrations_complete_v3_cakisan_kvkk', value: 'true', completed_at: new Date().toISOString() } },
      { upsert: true }
    );
  }

  // 7. Resmi Kurum Üst Düzey KVKK v4 Migrasyonu:
  // beneficiaries/archived_beneficiaries uyarilar dizisi & uyari_notu, activity_logs ek_bilgi, users last_ip & last_device
  const migV4Flag = await settings.findOne({ key: 'migrations_complete_v4_gov_security' });
  if (migV4Flag?.value !== 'true') {
    const beneficiariesCol = db.collection('beneficiaries');
    const archivedBenCol = db.collection('archived_beneficiaries');
    const activityLogsCol = db.collection('activity_logs');
    const usersCol = db.collection('users');

    // A) Beneficiaries & Archived Beneficiaries uyarilar array + uyari_notu
    for (const col of [beneficiariesCol, archivedBenCol]) {
      const docsWithWarnings = await col.find({
        $or: [
          { 'uyarilar.0': { $exists: true } },
          { uyari_notu: { $exists: true, $ne: null, $not: /^ENC:GCM:v1:/ } },
          { adres_guncelleme_notu: { $exists: true, $ne: null, $not: /^ENC:GCM:v1:/ } },
        ]
      }).toArray();

      for (const b of docsWithWarnings) {
        const updateSet: any = {};
        if (Array.isArray(b.uyarilar) && b.uyarilar.some((u: any) => typeof u === 'string' && !isEncrypted(u))) {
          updateSet.uyarilar = b.uyarilar.map((u: any) =>
            typeof u === 'string' && !isEncrypted(u) ? encryptField(u) : u
          );
        }
        if (b.uyari_notu && !isEncrypted(b.uyari_notu)) {
          updateSet.uyari_notu = encryptField(String(b.uyari_notu));
        }
        if (b.adres_guncelleme_notu && !isEncrypted(b.adres_guncelleme_notu)) {
          updateSet.adres_guncelleme_notu = encryptField(String(b.adres_guncelleme_notu));
        }
        if (Object.keys(updateSet).length > 0) {
          await col.updateOne({ _id: b._id }, { $set: updateSet });
        }
      }
    }

    // B) Activity Logs ek_bilgi encryption
    const unencryptedEkBilgiLogs = await activityLogsCol.find({
      ek_bilgi: { $exists: true, $ne: null, $not: /^ENC:GCM:v1:/ }
    }).toArray();

    for (const act of unencryptedEkBilgiLogs) {
      if (act.ek_bilgi && !isEncrypted(act.ek_bilgi)) {
        const serialized = typeof act.ek_bilgi === 'string' ? act.ek_bilgi : JSON.stringify(act.ek_bilgi);
        await activityLogsCol.updateOne(
          { _id: act._id },
          { $set: { ek_bilgi: encryptField(serialized) } }
        );
      }
    }

    // C) Users last_ip & last_device encryption
    const allUsers = await usersCol.find({}).toArray();
    for (const u of allUsers) {
      const uSet: any = {};
      if (u.last_ip && !isEncrypted(u.last_ip)) {
        uSet.last_ip = encryptField(String(u.last_ip));
      }
      if (u.last_device && !isEncrypted(u.last_device)) {
        uSet.last_device = encryptField(String(u.last_device));
      }
      if (Object.keys(uSet).length > 0) {
        await usersCol.updateOne({ _id: u._id }, { $set: uSet });
      }
    }

    await settings.updateOne(
      { key: 'migrations_complete_v4_gov_security' },
      { $set: { key: 'migrations_complete_v4_gov_security', value: 'true', completed_at: new Date().toISOString() } },
      { upsert: true }
    );
  }

  // 8. Tır Sevkiyatları ve Tonaj Ölçekleme Migrasyonu (kg -> Ton standardizasyonu)
  const migV5Flag = await settings.findOne({ key: 'migrations_trucks_tonnage_scale_v1_done' });
  if (migV5Flag?.value !== 'true') {
    const trucksCol = db.collection('truck_deliveries');
    const allTrucks = await trucksCol.find({
      $or: [
        { net_tonaj: { $gte: 1000 } },
        { brut_tonaj: { $gte: 1000 } },
      ]
    }).toArray();

    if (allTrucks.length > 0) {
      console.log(`[Tır Tonajı] ${allTrucks.length} tır kaydında kg cinsinden girilmiş veriler Ton birimine ölçekleniyor...`);
      for (const t of allTrucks) {
        const normNet = normalizeToTon(t.net_tonaj);
        const normBrut = normalizeToTon(t.brut_tonaj);
        const normTara = parseFloat((normBrut - normNet).toFixed(3));
        await trucksCol.updateOne(
          { _id: t._id },
          {
            $set: {
              net_tonaj: normNet,
              brut_tonaj: normBrut,
              tara_tonaj: normTara,
            }
          }
        );
      }
      console.log(`[Tır Tonajı] ${allTrucks.length} tır kaydı başarıyla Ton birimine ölçeklendi.`);
    }

    await settings.updateOne(
      { key: 'migrations_trucks_tonnage_scale_v1_done' },
      { $set: { key: 'migrations_trucks_tonnage_scale_v1_done', value: 'true', completed_at: new Date().toISOString() } },
      { upsert: true }
    );
  }

  // 9. KVKK v6: Geri döndürülebilir sifre alanlarını kalıcı olarak kaldır (yalnızca tek yönlü scrypt sifre_hash tut)
  const migV6Flag = await settings.findOne({ key: 'migrations_complete_v6_drop_reversible_sifre' });
  if (migV6Flag?.value !== 'true') {
    const usersCol = db.collection('users');
    const legacyPassUsers = await usersCol.find({ sifre: { $exists: true } }).toArray();
    for (const u of legacyPassUsers) {
      const plainPass = u.sifre ? (isEncrypted(u.sifre) ? decryptField(u.sifre) : String(u.sifre)) : '';
      const updateOp: any = { $unset: { sifre: '' } };
      if (!u.sifre_hash && plainPass) {
        updateOp.$set = { sifre_hash: hashPassword(plainPass) };
      }
      await usersCol.updateOne({ _id: u._id }, updateOp);
    }
    await settings.updateOne(
      { key: 'migrations_complete_v6_drop_reversible_sifre' },
      { $set: { key: 'migrations_complete_v6_drop_reversible_sifre', value: 'true', completed_at: new Date().toISOString() } },
      { upsert: true }
    );
  }
  } catch (err) {
    console.error('[AES-256-GCM] Migration error:', err);
  }
}

/**
 * Migrates and normalizes neighborhood names in MongoDB Atlas and in-memory store.
 * Specifically repairs "Yıl Mahallesi", "Yıl Mah.", "Yıl", "100.Yıl Mah." etc. into canonical "100. Yıl Mah."
 * and updates norm_adres and adres_hash accordingly.
 */
export async function migrateMahalleNames(db?: Db | null) {
  const targetVariants = [
    'Yıl Mahallesi',
    'Yıl Mah.',
    'Yıl',
    'yil',
    'yıl',
    '100.Yıl Mah.',
    '100 Yıl Mah.',
    '100. Yıl Mahallesi',
    '100.Yıl Mahallesi',
    '100 Yıl Mahallesi',
    '100.Yıl',
    '100 Yıl',
  ];

  if (db) {
    try {
      const settings = db.collection('system_settings');
      const migFlag = await settings.findOne({ key: 'migrations_mahalle_100yil_done' });
      if (migFlag?.value === 'true') {
        return;
      }

      const beneficiaries = db.collection('beneficiaries');
      const history = db.collection('delivery_history');
      const logs = db.collection('import_logs');
      const routes = db.collection('delivery_routes');
      const activityLogs = db.collection('activity_logs');

      // 1. Beneficiaries
      const badBens = await beneficiaries.find({
        mahalle: { $in: targetVariants }
      }).toArray();

      for (const b of badBens) {
        const plainAdres = isEncrypted(b.acik_adres) ? decryptField(b.acik_adres) : b.acik_adres;
        const plainHane = isEncrypted(b.hane_no) ? decryptField(b.hane_no) : b.hane_no;
        const newNorm = normalizeAddress('100. Yıl Mah.', plainAdres, plainHane);
        const streetInfo = extractStreetAndDoor(plainAdres, null, plainHane, '100. Yıl Mah.');

        const updateSet: any = {
          mahalle: '100. Yıl Mah.',
          norm_adres: encryptField(newNorm),
          adres_hash: hashAddress(newNorm),
        };
        if (streetInfo.sokak && streetInfo.sokak !== 'Köy İçi / Sokak Belirtilmemiş') {
          updateSet.sokak = encryptField(streetInfo.sokak);
          updateSet.kapi_no = streetInfo.kapiNo;
          updateSet.daire_no = streetInfo.daireNo;
        }
        await beneficiaries.updateOne({ _id: b._id }, { $set: updateSet });
      }

      // 2. Delivery History
      await history.updateMany(
        { mahalle: { $in: targetVariants } },
        { $set: { mahalle: '100. Yıl Mah.' } }
      );

      // 3. Import Logs
      await logs.updateMany(
        { mahalle: { $in: targetVariants } },
        { $set: { mahalle: '100. Yıl Mah.' } }
      );

      // 4. Delivery Routes
      await routes.updateMany(
        { mahalle: { $in: targetVariants } },
        { $set: { mahalle: '100. Yıl Mah.' } }
      );

      // 5. Activity Logs
      await activityLogs.updateMany(
        { mahalle: { $in: targetVariants } },
        { $set: { mahalle: '100. Yıl Mah.' } }
      );

      await settings.updateOne(
        { key: 'migrations_mahalle_100yil_done' },
        { $set: { key: 'migrations_mahalle_100yil_done', value: 'true', completed_at: new Date().toISOString() } },
        { upsert: true }
      );
    } catch (err) {
      console.error('[Migration] 100. Yıl Mah migration error:', err);
    }
  }

  // Also migrate in-memory store if active
  if (global._inMemoryMongoStore) {
    const store = global._inMemoryMongoStore;
    if (store.beneficiaries) {
      for (const b of store.beneficiaries) {
        if (targetVariants.includes(b.mahalle) || (b.mahalle && /^(?:100\s*\.?\s*)?y[ıi]l(?:\s*mah.*)?$/i.test(b.mahalle))) {
          b.mahalle = '100. Yıl Mah.';
          const plainAdres = isEncrypted(b.acik_adres) ? decryptField(b.acik_adres) : b.acik_adres;
          const plainHane = isEncrypted(b.hane_no) ? decryptField(b.hane_no) : b.hane_no;
          const newNorm = normalizeAddress('100. Yıl Mah.', plainAdres, plainHane);
          b.norm_adres = encryptField(newNorm);
          b.adres_hash = hashAddress(newNorm);
        }
      }
    }
    if (store.delivery_history) {
      for (const h of store.delivery_history) {
        if (targetVariants.includes(h.mahalle) || (h.mahalle && /^(?:100\s*\.?\s*)?y[ıi]l(?:\s*mah.*)?$/i.test(h.mahalle))) {
          h.mahalle = '100. Yıl Mah.';
        }
      }
    }
    if (store.import_logs) {
      for (const l of store.import_logs) {
        if (targetVariants.includes(l.mahalle) || (l.mahalle && /^(?:100\s*\.?\s*)?y[ıi]l(?:\s*mah.*)?$/i.test(l.mahalle))) {
          l.mahalle = '100. Yıl Mah.';
        }
        if (l.cakisan_ad_soyad && !isEncrypted(l.cakisan_ad_soyad)) {
          l.cakisan_ad_soyad = encryptField(l.cakisan_ad_soyad);
        }
        if (l.cakisan_tc && !isEncrypted(l.cakisan_tc)) {
          l.cakisan_tc_hash = hashTc(l.cakisan_tc);
          l.cakisan_tc = encryptField(l.cakisan_tc);
        }
        if (l.cakisan_hane_no && !isEncrypted(l.cakisan_hane_no)) {
          l.cakisan_hane_no = encryptField(l.cakisan_hane_no);
        }
      }
    }
  }
}

/**
 * Migrates and synchronizes door numbers (kapi_no) and street names from acik_adres.
 * Repairs records where kapi_no was previously contaminated with hane_no or where door numbers in acik_adres were not reflected.
 */
export async function migrateKapiNoAndStreets(db?: Db | null) {
  if (db) {
    try {
      const settings = db.collection('system_settings');
      const migFlag = await settings.findOne({ key: 'migrations_kapi_no_sync_v4_nodairekat_done' });
      if (migFlag?.value === 'true') {
        return;
      }

      const benCol = db.collection('beneficiaries');
      const allBens = await benCol.find({}).toArray();
      let updatedCount = 0;

      for (const rawB of allBens) {
        const b = mapDoc(rawB);
        if (!b.acik_adres) continue;

        const streetInfo = getRecordStreetInfo(b);
        const shouldUpdateKapi = streetInfo.kapiNo !== 999999 && streetInfo.kapiNo !== '999999' && b.kapi_no !== streetInfo.kapiNo;
        const shouldUpdateSokak = streetInfo.sokak && streetInfo.sokak !== 'Köy İçi / Sokak Belirtilmemiş' && b.sokak !== streetInfo.sokak;
        const shouldUpdateDaire = (b.daire_no || 0) !== streetInfo.daireNo;

        if (shouldUpdateKapi || shouldUpdateSokak || shouldUpdateDaire) {
          const updateFields: any = {
            updated_at: new Date().toLocaleString('tr-TR'),
          };
          if (streetInfo.kapiNo !== 999999 && streetInfo.kapiNo !== '999999') {
            updateFields.kapi_no = streetInfo.kapiNo;
          }
          updateFields.daire_no = streetInfo.daireNo;

          if (streetInfo.sokak && streetInfo.sokak !== 'Köy İçi / Sokak Belirtilmemiş') {
            updateFields.sokak = isEncrypted(rawB.sokak) ? encryptField(streetInfo.sokak) : streetInfo.sokak;
          }

          await benCol.updateOne({ _id: rawB._id }, { $set: updateFields });
          updatedCount++;
        }
      }

      await settings.updateOne(
        { key: 'migrations_kapi_no_sync_v4_nodairekat_done' },
        { $set: { key: 'migrations_kapi_no_sync_v4_nodairekat_done', value: 'true', updated_count: updatedCount, completed_at: new Date().toISOString() } },
        { upsert: true }
      );
    } catch (err) {
      console.error('[Migration] Kapı No ve Sokak senkronizasyon hatası:', err);
    }
  }

  // Also migrate in-memory store if active
  if (global._inMemoryMongoStore && global._inMemoryMongoStore.beneficiaries) {
    for (const b of global._inMemoryMongoStore.beneficiaries) {
      if (!b.acik_adres) continue;
      const streetInfo = getRecordStreetInfo(b);
      if (streetInfo.kapiNo !== 999999 && streetInfo.kapiNo !== '999999') {
        b.kapi_no = streetInfo.kapiNo;
      }
      b.daire_no = streetInfo.daireNo;
      if (streetInfo.sokak && streetInfo.sokak !== 'Köy İçi / Sokak Belirtilmemiş') {
        b.sokak = streetInfo.sokak;
      }
    }
  }
}

/**
 * Migration 6: Converts non-existent "Merkez Mah." / "Merkez Mahallesi" records into their true Edirne villages/neighborhoods,
 * cleans cadastre/GIS revision tags (e.g. 2._2 SK. -> 2. Sok.), and ensures non-village records are never labeled "Köy İçi".
 */
export async function migrateFixMerkezAndStreets(db?: Db | null) {
  if (db) {
    try {
      const settings = db.collection('system_settings');
      const migFlag = await settings.findOne({ key: 'migrations_fix_merkez_and_streets_v2_village_name_done' });
      if (migFlag?.value === 'true') {
        return;
      }

      const benCol = db.collection('beneficiaries');
      const allBens = await benCol.find({}).toArray();
      let updatedCount = 0;

      for (const rawB of allBens) {
        const plainAdres = isEncrypted(rawB.acik_adres) ? decryptField(rawB.acik_adres) : (rawB.acik_adres || '');
        const plainSokak = isEncrypted(rawB.sokak) ? decryptField(rawB.sokak) : (rawB.sokak || '');
        const plainHane = isEncrypted(rawB.hane_no) ? decryptField(rawB.hane_no) : (rawB.hane_no || null);
        const currentMahalle = rawB.mahalle || '';
        const currentYerlesim = rawB.yerlesim_tipi || 'MAHALLE';

        let newMahalle = currentMahalle;
        let newYerlesim = currentYerlesim;

        // 1. Merkez Mah. veya Merkez mahallesini açık adresteki gerçek köy veya mahalleye dönüştür
        if (/^(?:Edirne\s+)?Merkez(?:\s+Mahallesi|\s+Mah\.?|\s+Mh\.?)?$/i.test(currentMahalle) || currentMahalle === 'Merkez Mah.') {
          const det = detectSettlement(null, null, plainAdres);
          newMahalle = det.name;
          newYerlesim = det.type;
        }

        // 2. Sokak ve Kapı No ayıklama ve kadastro '_' temizliği
        const streetInfo = extractStreetAndDoor(plainAdres, plainSokak, rawB.kapi_no, newMahalle);

        const isCurrentVillage = (newMahalle && /(?:Köyü|Koy|Koyu)$/i.test(newMahalle)) || newYerlesim === 'KOY';
        if (isCurrentVillage) {
          // Köylerde sokak adı olmadığı için sokak doğrudan köy adı olarak atanır
          streetInfo.sokak = newMahalle;
        }

        const mahalleChanged = newMahalle !== currentMahalle;
        const yerlesimChanged = newYerlesim !== currentYerlesim;
        const sokakChanged = streetInfo.sokak && streetInfo.sokak !== plainSokak;
        const kapiChanged = streetInfo.kapiNo !== 999999 && streetInfo.kapiNo !== '999999' && rawB.kapi_no !== streetInfo.kapiNo;
        const daireChanged = (rawB.daire_no || 0) !== streetInfo.daireNo;

        if (mahalleChanged || yerlesimChanged || sokakChanged || kapiChanged || daireChanged) {
          const updateFields: any = {
            updated_at: new Date().toLocaleString('tr-TR'),
          };

          if (mahalleChanged) {
            updateFields.mahalle = newMahalle;
          }
          if (yerlesimChanged) {
            updateFields.yerlesim_tipi = newYerlesim;
          }
          if (sokakChanged) {
            updateFields.sokak = isEncrypted(rawB.sokak) ? encryptField(streetInfo.sokak) : streetInfo.sokak;
          }
          if (kapiChanged) {
            updateFields.kapi_no = streetInfo.kapiNo;
          }
          if (daireChanged) {
            updateFields.daire_no = streetInfo.daireNo;
          }

          if (mahalleChanged || sokakChanged || kapiChanged) {
            const newNorm = normalizeAddress(newMahalle, plainAdres, plainHane);
            updateFields.norm_adres = encryptField(newNorm);
            updateFields.adres_hash = hashAddress(newNorm);
          }

          await benCol.updateOne({ _id: rawB._id }, { $set: updateFields });
          updatedCount++;
        }
      }

      // Also update delivery_history, import_logs, and delivery_routes if they contain "Merkez Mah."
      const historyCol = db.collection('delivery_history');
      const logsCol = db.collection('import_logs');

      await historyCol.updateMany(
        { mahalle: { $in: ['Merkez Mah.', 'Merkez Mahallesi', 'Merkez'] } },
        { $set: { mahalle: 'Genel (Belirtilmemiş)' } }
      );

      await logsCol.updateMany(
        { mahalle: { $in: ['Merkez Mah.', 'Merkez Mahallesi', 'Merkez'] } },
        { $set: { mahalle: 'Genel (Belirtilmemiş)' } }
      );

      await settings.updateOne(
        { key: 'migrations_fix_merkez_and_streets_v2_village_name_done' },
        { $set: { key: 'migrations_fix_merkez_and_streets_v2_village_name_done', value: 'true', updated_count: updatedCount, completed_at: new Date().toISOString() } },
        { upsert: true }
      );
      console.log(`[Migration] fix_merkez_and_streets tamamlandı. ${updatedCount} kayıt güncellendi.`);
    } catch (err) {
      console.error('[Migration] fix_merkez_and_streets hatası:', err);
    }
  }

  // Also migrate in-memory store if active
  if (global._inMemoryMongoStore && global._inMemoryMongoStore.beneficiaries) {
    for (const b of global._inMemoryMongoStore.beneficiaries) {
      if (!b.acik_adres) continue;
      if (/^(?:Edirne\s+)?Merkez(?:\s+Mahallesi|\s+Mah\.?|\s+Mh\.?)?$/i.test(b.mahalle) || b.mahalle === 'Merkez Mah.') {
        const det = detectSettlement(null, null, b.acik_adres);
        b.mahalle = det.name;
        b.yerlesim_tipi = det.type;
      }
      const isVillage = (b.mahalle && /(?:Köyü|Koy|Koyu)$/i.test(b.mahalle)) || b.yerlesim_tipi === 'KOY';
      const streetInfo = extractStreetAndDoor(b.acik_adres, b.sokak, b.kapi_no, b.mahalle);
      b.sokak = isVillage ? b.mahalle : (streetInfo.sokak || b.sokak);
      if (streetInfo.kapiNo !== 999999 && streetInfo.kapiNo !== '999999') {
        b.kapi_no = streetInfo.kapiNo;
      }
      b.daire_no = streetInfo.daireNo;
    }
  }
}

/**
 * Update sync pulse in systemSettings so all active browsers and workers auto-detect dataset changes
 */
export async function touchSyncPulse(updatedBy: string = 'Sistem'): Promise<string> {
  const { nowIso } = getIstanbulDate();
  try {
    const { systemSettings } = await getDbCollections();
    await systemSettings.updateOne(
      { key: 'last_delivery_sync_time' },
      { $set: { key: 'last_delivery_sync_time', value: nowIso, updated_by: updatedBy } },
      { upsert: true }
    );
  } catch (err) {
    console.error('Error touching sync pulse:', err);
  }
  return nowIso;
}

/**
 * Geçmiş dönem arşivlendiğinde (veya daha önce arşivlenmiş bir dönem varsa)
 * o döneme ait yüklenen Excel listelerini (import_batches) ve hatalı/mükerrer kayıtları (import_logs)
 * otomatik olarak archived_import_batches ve archived_import_logs koleksiyonlarına taşır
 * ve yeni dönem için aktif Excel Aktarımı bölümünü tertemiz sıfırlar.
 */
export async function reconcileArchivedSeasonImports(): Promise<void> {
  try {
    // Her zaman yalnızca resmi (RESMI) veri koleksiyonlarını arşivle eşleştir; Deneme Alanı (sandbox_*) verilerini asla arşive taşıma!
    const {
      systemSettings,
      seasonArchives,
      beneficiaries: benCol,
      importBatches: batchesCol,
      importLogs: logsCol,
      archivedBeneficiaries,
      archivedImportBatches,
      archivedImportLogs,
    } = await getDbCollections({ forceMode: 'RESMI' });

    const rawArchives = await seasonArchives
      .find({})
      .sort({ kapanis_tarihi_iso: -1, _id: -1 })
      .toArray();

    if (!rawArchives || rawArchives.length === 0) {
      return;
    }

    const latestArchive = rawArchives[0];
    const archivedSeasonCodes = new Set(
      rawArchives.map((a: any) => String(a.donem_kodu || '').trim()).filter(Boolean)
    );

    const seasonDoc = await systemSettings.findOne({ key: 'aktif_donem' });
    let activeSeasonCode = '';
    if (seasonDoc && seasonDoc.value) {
      try {
        const parsed = typeof seasonDoc.value === 'string' ? JSON.parse(seasonDoc.value) : seasonDoc.value;
        activeSeasonCode = String(parsed?.kod || '').trim();
      } catch {
        activeSeasonCode = String(seasonDoc.value).trim();
      }
    }

    const { nowEnCa } = getIstanbulDate();

    // 1. Aktif import_batches içindeki geçmiş döneme ait listeleri tespit et ve arşivle
    const activeBatches = await batchesCol.find({}).toArray();
    for (const b of activeBatches) {
      const batchId = b.batch_id || b.id || (b._id ? b._id.toString() : '');
      if (!batchId) continue;

      const activeBenCount = await benCol.countDocuments({ batch_id: batchId });
      const batchDonem = String(b.donem_kodu || '').trim();

      // Eğer bu batch açıkça yeni aktif döneme aitse ve aktif hak sahipleri duruyorsa dokunma
      if (
        activeSeasonCode &&
        batchDonem === activeSeasonCode &&
        !archivedSeasonCodes.has(batchDonem) &&
        activeBenCount > 0
      ) {
        continue;
      }

      let targetDonemKodu = '';
      let targetArchiveDate = latestArchive.kapanis_tarihi || nowEnCa;

      if (batchDonem && archivedSeasonCodes.has(batchDonem)) {
        targetDonemKodu = batchDonem;
      } else {
        // Arşivlenen hak sahipleri tablosunda bu batch_id var mı kontrol et
        const sampleArchivedBen = await archivedBeneficiaries.findOne(
          { batch_id: batchId },
          { projection: { donem_kodu: 1, arsivlenme_tarihi: 1 } }
        );
        if (sampleArchivedBen && sampleArchivedBen.donem_kodu) {
          targetDonemKodu = sampleArchivedBen.donem_kodu;
          targetArchiveDate = sampleArchivedBen.arsivlenme_tarihi || targetArchiveDate;
        } else if (activeBenCount === 0) {
          // Aktif hak sahipleri tablosunda hiç kaydı kalmamışsa (dönem arşivlenip sıfırlanmışsa)
          // veya yükleme tarihi son arşiv kapanışından önceyse geçmiş döneme aittir
          const batchIso = b.tarih_iso || '';
          const matchedArchive =
            rawArchives.find((a: any) => batchIso && a.kapanis_tarihi_iso && batchIso <= a.kapanis_tarihi_iso) ||
            latestArchive;
          targetDonemKodu = matchedArchive.donem_kodu;
          targetArchiveDate = matchedArchive.kapanis_tarihi || targetArchiveDate;
        }
      }

      if (targetDonemKodu) {
        const alreadyInArchive = await archivedImportBatches.findOne({
          batch_id: batchId,
          donem_kodu: targetDonemKodu,
        });

        if (!alreadyInArchive) {
          await archivedImportBatches.insertOne({
            ...b,
            _id: new ObjectId(),
            original_id: b.id || (b._id ? b._id.toString() : ''),
            batch_id: batchId,
            donem_kodu: targetDonemKodu,
            arsivlenme_tarihi: targetArchiveDate,
          });
        }

        // Bu batch'e ait tüm hata/mükerrer kayıtlarını da arşivle
        const batchLogs = await logsCol.find({ batch_id: batchId }).toArray();
        if (batchLogs.length > 0) {
          const CHUNK_SIZE = 500;
          for (let i = 0; i < batchLogs.length; i += CHUNK_SIZE) {
            const chunk = batchLogs.slice(i, i + CHUNK_SIZE).map((l: any) => ({
              ...l,
              _id: new ObjectId(),
              original_id: l.id || (l._id ? l._id.toString() : ''),
              donem_kodu: targetDonemKodu,
              arsivlenme_tarihi: targetArchiveDate,
            }));
            await archivedImportLogs.insertMany(chunk, { ordered: false }).catch(() => {});
          }
          await logsCol.deleteMany({ batch_id: batchId });
        }

        await batchesCol.deleteOne({ _id: b._id });
      }
    }

    // 2. Aktif import_logs içinde kalan ama geçmiş döneme ait olan yetim hata kayıtlarını da arşivle ve temizle
    const remainingBatches = await batchesCol.find({}, { projection: { batch_id: 1, id: 1 } }).toArray();
    const activeBatchIds = new Set(
      remainingBatches.map((b: any) => b.batch_id || b.id).filter(Boolean)
    );

    const orphanFilter: any =
      activeBatchIds.size > 0
        ? {
            $or: [
              { batch_id: { $nin: Array.from(activeBatchIds) } },
              { donem_kodu: { $in: Array.from(archivedSeasonCodes) } },
            ],
          }
        : {};

    const orphanLogs = await logsCol.find(orphanFilter).toArray();
    if (orphanLogs.length > 0) {
      const targetDonemKodu = latestArchive.donem_kodu;
      const targetArchiveDate = latestArchive.kapanis_tarihi || nowEnCa;
      const CHUNK_SIZE = 500;
      for (let i = 0; i < orphanLogs.length; i += CHUNK_SIZE) {
        const chunk = orphanLogs.slice(i, i + CHUNK_SIZE).map((l: any) => ({
          ...l,
          _id: new ObjectId(),
          original_id: l.id || (l._id ? l._id.toString() : ''),
          donem_kodu: l.donem_kodu && archivedSeasonCodes.has(l.donem_kodu) ? l.donem_kodu : targetDonemKodu,
          arsivlenme_tarihi: targetArchiveDate,
        }));
        await archivedImportLogs.insertMany(chunk, { ordered: false }).catch(() => {});
      }
      const orphanIds = orphanLogs.map((l: any) => l._id).filter(Boolean);
      if (orphanIds.length > 0) {
        await logsCol.deleteMany({ _id: { $in: orphanIds } });
      } else {
        await logsCol.deleteMany(orphanFilter);
      }
    }
  } catch (err) {
    console.warn('[reconcileArchivedSeasonImports] Notice:', err);
  }
}

function buildValidFakeTc(nineDigitPrefix: number): string {
  const s = String(nineDigitPrefix).padStart(9, '1').slice(0, 9);
  const d = s.split('').map(Number);
  const oddSum = d[0] + d[2] + d[4] + d[6] + d[8];
  const evenSum = d[1] + d[3] + d[5] + d[7];
  const d10 = (((oddSum * 7) - evenSum) % 10 + 10) % 10;
  const d11 = (oddSum + evenSum + d10) % 10;
  return `${s}${d10}${d11}`;
}

/**
 * Deneme Modu (Sandbox) için gerçeğe birebir uygun sahte (fake) listeler, haneler,
 * teslimat geçmişi ve kömür tırı verileri üretir.
 * KESİN GÜVENLİK KURALI: Yalnızca `sandbox_*` koleksiyonlarına yazar; asıl (RESMİ) verilere asla dokunmaz!
 */
export async function seedSandboxFakeData(options?: {
  clearExistingSandbox?: boolean;
  createdBy?: string;
}): Promise<{ seededCount: number; batchCount: number }> {
  const {
    systemSettings,
    sandboxBeneficiaries,
    sandboxImportBatches,
    sandboxImportLogs,
    sandboxDeliveryHistory,
    sandboxDeliveryRoutes,
    sandboxTruckDeliveries,
    sandboxWorkShifts,
    sandboxActivityLogs,
  } = await getDbCollections({ forceMode: 'DENEME' });

  if (options?.clearExistingSandbox) {
    await Promise.all([
      sandboxBeneficiaries.deleteMany({}),
      sandboxImportBatches.deleteMany({}),
      sandboxImportLogs.deleteMany({}),
      sandboxDeliveryHistory.deleteMany({}),
      sandboxDeliveryRoutes.deleteMany({}),
      sandboxTruckDeliveries.deleteMany({}),
      sandboxWorkShifts.deleteMany({}),
      sandboxActivityLogs.deleteMany({}),
    ]);
  } else {
    const existingCount = await sandboxBeneficiaries.countDocuments({});
    if (existingCount > 0) {
      const bCount = await sandboxImportBatches.countDocuments({});
      return { seededCount: existingCount, batchCount: bCount };
    }
  }

  const { nowLocaleTr, nowIso, nowEnCa } = getIstanbulDate();
  const seasonDoc = await systemSettings.findOne({ key: 'aktif_donem' });
  let activeSeasonCode = '2026-2027';
  if (seasonDoc?.value) {
    try {
      const parsed = typeof seasonDoc.value === 'string' ? JSON.parse(seasonDoc.value) : seasonDoc.value;
      if (parsed?.kod) activeSeasonCode = String(parsed.kod).trim();
    } catch {
      activeSeasonCode = String(seasonDoc.value).trim() || '2026-2027';
    }
  }

  const quotaDoc = await systemSettings.findOne({ key: 'varsayilan_hedef_torba' });
  const defaultQuota = quotaDoc ? parseInt(quotaDoc.value, 10) || 34 : 34;
  const creator = options?.createdBy || 'Sistem Yöneticisi (Deneme Modu)';

  const mainBatchId = `BATCH_DENEME_ANA_${activeSeasonCode}`;
  const ekBatchId = `BATCH_EK_LISTE_${activeSeasonCode}`;

  const fakeHouseholdsRaw = [
    // Şükrüpaşa Mah.
    { prefix: 900100101, ad_soyad: 'AHMET YILMAZ (DENEME)', mahalle: 'Şükrüpaşa Mah.', sokak: 'Zübeyde Hanım Cad.', kapi_no: 12, daire_no: 1, telefon: '05550001001', durum: 'BEKLIYOR', torba: 0, imza: 'BEKLIYOR', liste: 'ANA_LISTE' },
    { prefix: 900100102, ad_soyad: 'AYŞE KAYA (DENEME)', mahalle: 'Şükrüpaşa Mah.', sokak: 'Zübeyde Hanım Cad.', kapi_no: 18, daire_no: 3, telefon: '05550001002', durum: 'BEKLIYOR', torba: 0, imza: 'IMZALANDI', liste: 'ANA_LISTE' },
    { prefix: 900100103, ad_soyad: 'MEHMET DEMİR (DENEME)', mahalle: 'Şükrüpaşa Mah.', sokak: 'İlhami Ertem Cad.', kapi_no: 24, daire_no: 2, telefon: '05550001003', durum: 'TAMAMLANDI', torba: defaultQuota, imza: 'IMZALANDI', liste: 'ANA_LISTE' },
    { prefix: 900100104, ad_soyad: 'FATMA ÇELİK (DENEME)', mahalle: 'Şükrüpaşa Mah.', sokak: 'Bahriye Üçok Cad.', kapi_no: 7, daire_no: 1, telefon: '05550001004', durum: 'EKSIK', torba: 20, imza: 'IMZALANDI', liste: 'ANA_LISTE' },

    // Fatih Mah.
    { prefix: 900100201, ad_soyad: 'MUSTAFA ŞAHİN (DENEME)', mahalle: 'Fatih Mah.', sokak: 'İbrahim Zagra Cad.', kapi_no: 5, daire_no: 4, telefon: '05550002001', durum: 'BEKLIYOR', torba: 0, imza: 'BEKLIYOR', liste: 'ANA_LISTE' },
    { prefix: 900100202, ad_soyad: 'ZEYNEP YILDIZ (DENEME)', mahalle: 'Fatih Mah.', sokak: 'Ümran Akkan Cad.', kapi_no: 14, daire_no: 2, telefon: '05550002002', durum: 'TAMAMLANDI', torba: defaultQuota, imza: 'IMZALANDI', liste: 'ANA_LISTE' },
    { prefix: 900100203, ad_soyad: 'HASAN ÖZTÜRK (DENEME)', mahalle: 'Fatih Mah.', sokak: 'Muammer Aksoy Cad.', kapi_no: 9, daire_no: 1, telefon: '05550002003', durum: 'BEKLIYOR', torba: 0, imza: 'BEKLIYOR', liste: 'EK_LISTE' },

    // Cumhuriyet Mah.
    { prefix: 900100301, ad_soyad: 'EMİNE AYDIN (DENEME)', mahalle: 'Cumhuriyet Mah.', sokak: 'Kuvayi Milliye Bulvarı', kapi_no: 31, daire_no: 5, telefon: '05550003001', durum: 'BEKLIYOR', torba: 0, imza: 'BEKLIYOR', liste: 'ANA_LISTE' },
    { prefix: 900100302, ad_soyad: 'ALİ ÖZDEMİR (DENEME)', mahalle: 'Cumhuriyet Mah.', sokak: '101. Sok.', kapi_no: 4, daire_no: 1, telefon: '05550003002', durum: 'EKSIK', torba: 18, imza: 'IMZALANDI', liste: 'ANA_LISTE' },
    { prefix: 900100303, ad_soyad: 'HATİCE ARSLAN (DENEME)', mahalle: 'Cumhuriyet Mah.', sokak: '101. Sok.', kapi_no: 10, daire_no: 2, telefon: '05550003003', durum: 'BEKLIYOR', torba: 0, imza: 'IMZALANDI', liste: 'EK_LISTE' },

    // 100. Yıl Mah.
    { prefix: 900100401, ad_soyad: 'HÜSEYİN DOĞAN (DENEME)', mahalle: '100. Yıl Mah.', sokak: 'Mimar Sinan Cad.', kapi_no: 16, daire_no: 1, telefon: '05550004001', durum: 'BEKLIYOR', torba: 0, imza: 'BEKLIYOR', liste: 'ANA_LISTE' },
    { prefix: 900100402, ad_soyad: 'ELİF KILIÇ (DENEME)', mahalle: '100. Yıl Mah.', sokak: 'Lalezar Sok.', kapi_no: 8, daire_no: 3, telefon: '05550004002', durum: 'TAMAMLANDI', torba: defaultQuota, imza: 'IMZALANDI', liste: 'ANA_LISTE' },

    // Yıldırım Beyazıt Mah. & Karaağaç Mah.
    { prefix: 900100501, ad_soyad: 'İBRAHİM ASLAN (DENEME)', mahalle: 'Yıldırım Beyazıt Mah.', sokak: 'Kıyık Cad.', kapi_no: 42, daire_no: 1, telefon: '05550005001', durum: 'BEKLIYOR', torba: 0, imza: 'BEKLIYOR', liste: 'ANA_LISTE' },
    { prefix: 900100502, ad_soyad: 'MERYEM ÇETİN (DENEME)', mahalle: 'Yıldırım Beyazıt Mah.', sokak: 'Balkan Cad.', kapi_no: 15, daire_no: 1, telefon: '05550005002', durum: 'BEKLIYOR', torba: 0, imza: 'BEKLIYOR', liste: 'EK_LISTE' },
    { prefix: 900100601, ad_soyad: 'ÖMER KARA (DENEME)', mahalle: 'Karaağaç Mah.', sokak: 'Lozan Cad.', kapi_no: 22, daire_no: 1, telefon: '05550006001', durum: 'BEKLIYOR', torba: 0, imza: 'BEKLIYOR', liste: 'ANA_LISTE' },
    { prefix: 900100602, ad_soyad: 'SULTAN KOÇ (DENEME)', mahalle: 'Karaağaç Mah.', sokak: 'İstasyon Cad.', kapi_no: 6, daire_no: 2, telefon: '05550006002', durum: 'TAMAMLANDI', torba: defaultQuota, imza: 'IMZALANDI', liste: 'ANA_LISTE' },

    // Köyler (Tayakadın Köyü & Büyükdöllük Köyü)
    { prefix: 900100701, ad_soyad: 'RAMAZAN KURT (DENEME)', mahalle: 'Tayakadın Köyü', sokak: 'Köy İçi', kapi_no: 35, daire_no: 1, telefon: '05550007001', durum: 'BEKLIYOR', torba: 0, imza: 'BEKLIYOR', liste: 'ANA_LISTE' },
    { prefix: 900100702, ad_soyad: 'FADİME ÖZKAN (DENEME)', mahalle: 'Tayakadın Köyü', sokak: 'Köy İçi', kapi_no: 48, daire_no: 1, telefon: '05550007002', durum: 'BEKLIYOR', torba: 0, imza: 'BEKLIYOR', liste: 'EK_LISTE' },
    { prefix: 900100801, ad_soyad: 'SÜLEYMAN ŞİMŞEK (DENEME)', mahalle: 'Büyükdöllük Köyü', sokak: 'Köy İçi', kapi_no: 11, daire_no: 1, telefon: '05550008001', durum: 'BEKLIYOR', torba: 0, imza: 'BEKLIYOR', liste: 'ANA_LISTE' },
    { prefix: 900100802, ad_soyad: 'HALİME POLAT (DENEME)', mahalle: 'Büyükdöllük Köyü', sokak: 'Köy İçi', kapi_no: 19, daire_no: 1, telefon: '05550008002', durum: 'TAMAMLANDI', torba: defaultQuota, imza: 'IMZALANDI', liste: 'ANA_LISTE' },
  ];

  const dayAt = (offsetDays: number, hour = 10, minute = 0) => {
    const d = new Date(Date.now() - offsetDays * 86400000);
    const trDate = d.toLocaleDateString('tr-TR', { timeZone: 'Europe/Istanbul' });
    const p = trDate.split('.');
    const hh = String(hour).padStart(2, '0');
    const mm = String(minute).padStart(2, '0');
    return {
      tr: `${trDate} ${hh}:${mm}:00`,
      en: `${p[2]}-${p[1].padStart(2, '0')}-${p[0].padStart(2, '0')}`,
      iso: d.toISOString(),
      time: `${hh}:${mm}`,
    };
  };

  const mahalleCounters = new Map<string, number>();
  const docsToInsert: any[] = [];
  const historyToInsert: any[] = [];
  const fakeBeneficiaryIds: string[] = [];
  let anaCount = 0;
  let ekCount = 0;

  for (let i = 0; i < fakeHouseholdsRaw.length; i++) {
    const item = fakeHouseholdsRaw[i];
    const tcNo = buildValidFakeTc(item.prefix);
    const isVillage = item.mahalle.endsWith('Köyü');
    const mSira = (mahalleCounters.get(item.mahalle) || 0) + 1;
    mahalleCounters.set(item.mahalle, mSira);

    const isEk = item.liste === 'EK_LISTE';
    if (isEk) ekCount++;
    else anaCount++;

    const acikAdres = `${item.mahalle} ${item.sokak} No: ${item.kapi_no}${item.daire_no > 1 ? ` Daire: ${item.daire_no}` : ''}`;
    const normAdres = normalizeAddress(item.mahalle, acikAdres);
    const isDelivered = item.durum === 'TAMAMLANDI' || item.durum === 'EKSIK';
    const deliveredAt = dayAt(isDelivered ? i % 5 : 0, 9 + (i % 7), (i * 7) % 60);
    const benObjectId = new ObjectId();
    fakeBeneficiaryIds.push(benObjectId.toString());

    const doc: any = {
      _id: benObjectId,
      tc_no: tcNo,
      ad_soyad: item.ad_soyad,
      telefon: item.telefon,
      telefon2: '',
      mahalle: item.mahalle,
      yerlesim_tipi: isVillage ? 'KOY' : 'MAHALLE',
      sokak: item.sokak,
      kapi_no: item.kapi_no,
      daire_no: item.daire_no,
      acik_adres: acikAdres,
      hane_no: `DENEME-H${100 + i}`,
      norm_adres: normAdres,
      hedef_torba: defaultQuota,
      teslimat_durumu: item.durum,
      torba_sayisi: item.torba,
      teslimat_tarihi: isDelivered ? deliveredAt.tr : null,
      teslim_alan: isDelivered ? item.ad_soyad : null,
      teslim_eden_personel: isDelivered ? 'Deneme Saha Ekibi' : null,
      teslimat_notu: item.durum === 'EKSIK' ? 'Deneme kısmi teslimat kaydı' : null,
      imza_durumu: item.imza,
      imza_tarihi: item.imza === 'IMZALANDI' ? deliveredAt.tr : null,
      imza_alan_personel: item.imza === 'IMZALANDI' ? 'Deneme Saha Ekibi' : null,
      sira_no: isEk ? `Ek1 - ${mSira}` : String(mSira),
      mahalle_sira: mSira,
      liste_turu: isEk ? 'EK_LISTE' : 'ANA_LISTE',
      liste_kategorisi: isEk ? 'EK_KAYIT' : 'ANA_LISTE',
      ek_liste_no: isEk ? 1 : 0,
      ek_liste_adi: isEk ? 'Ek Liste' : 'Ana Liste',
      kaynak_dosya: isEk ? 'Ek Liste' : 'Deneme Ana Dağıtım Listesi (Fake Veri).xlsx',
      batch_id: isEk ? ekBatchId : mainBatchId,
      import_batch_id: isEk ? ekBatchId : mainBatchId,
      donem_kodu: activeSeasonCode,
      ekleyen_personel: creator,
      ekleyen_rol: 'ADMIN',
      uyarilar: [],
      uyari_notu: null,
      created_at: nowLocaleTr,
      updated_at: nowLocaleTr,
    };

    docsToInsert.push(encryptBeneficiary(doc));

    if (isDelivered) {
      historyToInsert.push(
        encryptDeliveryHistory({
          beneficiary_id: benObjectId.toString(),
          tc_no: tcNo,
          ad_soyad: item.ad_soyad,
          mahalle: item.mahalle,
          acik_adres: acikAdres,
          islem_tipi: 'TESLIMAT',
          torba_sayisi: item.torba,
          teslim_alan: item.ad_soyad,
          personel: 'Deneme Saha Ekibi',
          notlar: 'Deneme Modu örnek teslimat kaydı',
          iptal_nedeni: null,
          tarih: deliveredAt.tr,
          gun_tarihi: deliveredAt.en,
        })
      );
    }
  }

  await sandboxBeneficiaries.insertMany(docsToInsert);
  if (historyToInsert.length > 0) {
    await sandboxDeliveryHistory.insertMany(historyToInsert);
  }

  await sandboxImportBatches.insertMany([
    {
      batch_id: mainBatchId,
      dosya_adi: 'Deneme Ana Dağıtım Listesi (Fake Veri).xlsx',
      ek_liste_adi: 'Ana Liste',
      ek_liste_no: 0,
      liste_turu: 'ANA_LISTE',
      donem_kodu: activeSeasonCode,
      toplam_satir: anaCount,
      eklenen_kisi: anaCount,
      mevcut_kisi: anaCount,
      mukerrer_tc: 0,
      mukerrer_hane: 0,
      hatali_kayit: 0,
      yukleyen: creator,
      tarih: nowLocaleTr,
      tarih_iso: nowIso,
      created_at: nowLocaleTr,
      updated_at: nowLocaleTr,
    },
    {
      batch_id: ekBatchId,
      dosya_adi: 'Ek Liste',
      ek_liste_adi: 'Ek Liste',
      ek_liste_no: 1,
      liste_turu: 'EK_LISTE',
      donem_kodu: activeSeasonCode,
      toplam_satir: ekCount,
      eklenen_kisi: ekCount,
      mevcut_kisi: ekCount,
      mukerrer_tc: 0,
      mukerrer_hane: 0,
      hatali_kayit: 0,
      yukleyen: creator,
      tarih: nowLocaleTr,
      tarih_iso: nowIso,
      created_at: nowLocaleTr,
      updated_at: nowLocaleTr,
    },
  ]);

  const existingTruckCount = await sandboxTruckDeliveries.countDocuments({});
  if (existingTruckCount === 0) {
    await sandboxTruckDeliveries.insertMany([
      encryptTruck({
        tir_sirasi: 1,
        plaka: '22 TEST 001',
        dorse_plaka: '22 DENEME 01',
        irsaliye_no: 'DENEME-IRS-2026-001',
        ocak_cikis_tarihi: nowEnCa,
        tarih: nowEnCa,
        net_tonaj: 26.5,
        brut_tonaj: 41.2,
        tara_tonaj: 14.7,
        sofor_adi: 'Deneme Şoför 1',
        notlar: 'Deneme Modu Örnek Kömür Tırı Sevkiyatı',
        created_at: nowLocaleTr,
      }),
      encryptTruck({
        tir_sirasi: 2,
        plaka: '22 TEST 002',
        dorse_plaka: '22 DENEME 02',
        irsaliye_no: 'DENEME-IRS-2026-002',
        ocak_cikis_tarihi: nowEnCa,
        tarih: nowEnCa,
        net_tonaj: 25.8,
        brut_tonaj: 40.3,
        tara_tonaj: 14.5,
        sofor_adi: 'Deneme Şoför 2',
        notlar: 'Deneme Modu Örnek Kömür Tırı Sevkiyatı',
        created_at: nowLocaleTr,
      }),
    ]);
  }

  // ======================================================================
  // DENEME MODU: Sistemin HER bölümünde örnek veri (tonaj, istatistik, mesai, rota, loglar...)
  // Tüm yazmalar yalnızca sandbox_* koleksiyonlarına ve sandbox_* ayar anahtarlarına yapılır.
  // ======================================================================

  // 1) TONAJ: Daha önce gelen ek kömür tırları + kuruma gelecek toplam tahsis (sandbox ayarı)
  const extraTrucksRaw = [
    { order: 3, plaka: '22 TEST 003', dorse: '22 DENEME 03', irs: 'DENEME-IRS-2026-003', off: 1, net: 27.1, brut: 41.9, tara: 14.8, sofor: 'Deneme Şoför 3' },
    { order: 4, plaka: '22 TEST 004', dorse: '22 DENEME 04', irs: 'DENEME-IRS-2026-004', off: 2, net: 25.4, brut: 39.8, tara: 14.4, sofor: 'Deneme Şoför 4' },
    { order: 5, plaka: '22 TEST 005', dorse: '22 DENEME 05', irs: 'DENEME-IRS-2026-005', off: 3, net: 26.9, brut: 41.5, tara: 14.6, sofor: 'Deneme Şoför 5' },
    { order: 6, plaka: '22 TEST 006', dorse: '22 DENEME 06', irs: 'DENEME-IRS-2026-006', off: 4, net: 24.8, brut: 39.2, tara: 14.4, sofor: 'Deneme Şoför 6' },
  ];
  const trucksNow = await sandboxTruckDeliveries.countDocuments({});
  if (trucksNow < 3) {
    await sandboxTruckDeliveries.insertMany(
      extraTrucksRaw.map((t) =>
        encryptTruck({
          tir_sirasi: t.order,
          plaka: t.plaka,
          dorse_plaka: t.dorse,
          irsaliye_no: t.irs,
          ocak_cikis_tarihi: dayAt(t.off + 1).en,
          tarih: dayAt(t.off).en,
          net_tonaj: t.net,
          brut_tonaj: t.brut,
          tara_tonaj: t.tara,
          sofor_adi: t.sofor,
          notlar: 'Deneme Modu Örnek Kömür Tırı Sevkiyatı',
          created_at: dayAt(t.off, 14).tr,
        })
      )
    );
  }
  await systemSettings.updateOne(
    { key: 'sandbox_toplam_tahsis_tonaj' },
    { $set: { key: 'sandbox_toplam_tahsis_tonaj', value: '400' } },
    { upsert: true }
  );

  // 2) ÇALIŞMA SAATLERİ (MESAİ): Son 5 gün için 3 örnek personel + bugün devam eden 1 mesai
  const fakeStaff = ['Deneme Personel - Murat', 'Deneme Personel - Selin', 'Deneme Personel - Kemal'];
  const shiftsToInsert: any[] = [];
  for (let off = 1; off <= 5; off++) {
    fakeStaff.forEach((staff, si) => {
      const startH = 8;
      const startM = si * 15;
      const endH = 16 + ((off + si) % 3);
      const endM = (off * 10 + si * 5) % 60;
      const total = (endH * 60 + endM) - (startH * 60 + startM);
      const d = dayAt(off);
      const hane = 6 + ((off * 3 + si * 2) % 9);
      shiftsToInsert.push(
        encryptShift({
          personel_adi: staff,
          tarih: d.en,
          baslama_saati: `${String(startH).padStart(2, '0')}:${String(startM).padStart(2, '0')}`,
          bitis_saati: `${String(endH).padStart(2, '0')}:${String(endM).padStart(2, '0')}`,
          toplam_dakika: total,
          durum: 'TAMAMLANDI',
          mahalleler: ['Şükrüpaşa Mah.', 'Fatih Mah.', 'Cumhuriyet Mah.'][(off + si) % 3],
          teslim_edilen_torba: hane * 34,
          teslim_edilen_hane: hane,
          notlar: 'Deneme Modu örnek mesai kaydı',
          created_at: d.tr,
          updated_at: d.tr,
        })
      );
    });
  }
  shiftsToInsert.push(
    encryptShift({
      personel_adi: fakeStaff[0],
      tarih: nowEnCa,
      baslama_saati: '08:00',
      bitis_saati: null,
      toplam_dakika: 0,
      durum: 'DEVAM_EDIYOR',
      mahalleler: '',
      teslim_edilen_torba: 0,
      teslim_edilen_hane: 0,
      notlar: 'Deneme Modu örnek devam eden mesai',
      created_at: nowLocaleTr,
      updated_at: nowLocaleTr,
    })
  );
  await sandboxWorkShifts.insertMany(shiftsToInsert);

  // 3) EXCEL HATA / MÜKERRER KAYITLARI (Yükleme günlüğü örnekleri)
  const importLogDefaults = {
    batch_id: mainBatchId,
    donem_kodu: activeSeasonCode,
    teslimat_durumu: 'BEKLIYOR',
    torba_sayisi: 0,
    hedef_torba: defaultQuota,
    teslimat_tarihi: null,
    teslim_alan: null,
    teslimat_durumu_ozeti: 'BEKLİYOR - Henüz Dağıtıma Çıkmadı',
    tarih: nowLocaleTr,
  };
  await sandboxImportLogs.insertMany([
    encryptImportLog({
      ...importLogDefaults,
      satir_no: 7,
      tc_no: 'Eksik',
      ad_soyad: 'DENEME EKSİK TC KİŞİSİ',
      telefon: '05550009001',
      mahalle: 'Fatih Mah.',
      acik_adres: 'Fatih Mah. Örnek Sok. No: 3',
      hane_no: null,
      hata_nedeni: 'Geçersiz veya Eksik TC Kimlik Numarası (Kayıt Geçici TC ile Sisteme Eklendi)',
      durum: 'HATALI',
      islem_sonucu: 'EKLENDİ_UYARILI',
    }),
    encryptImportLog({
      ...importLogDefaults,
      satir_no: 12,
      tc_no: buildValidFakeTc(900100101),
      ad_soyad: 'AHMET YILMAZ (DENEME) - TEKRAR',
      telefon: '05550001001',
      mahalle: 'Şükrüpaşa Mah.',
      acik_adres: 'Şükrüpaşa Mah. Zübeyde Hanım Cad. No: 12',
      hane_no: null,
      hata_nedeni: 'Mükerrer T.C. Kimlik No: Bu kişi sistemde zaten kayıtlı (kayıt atlandı)',
      durum: 'MUKERRER_TC',
      islem_sonucu: 'EKLENMEDİ',
    }),
    encryptImportLog({
      ...importLogDefaults,
      satir_no: 15,
      tc_no: buildValidFakeTc(900100301),
      ad_soyad: 'EMİNE AYDIN (DENEME) - AYNI HANE',
      telefon: '05550003001',
      mahalle: 'Cumhuriyet Mah.',
      acik_adres: 'Cumhuriyet Mah. Kuvayi Milliye Bulvarı No: 31 Daire: 5',
      hane_no: 'DENEME-H107',
      hata_nedeni: 'Mükerrer Hane: Aynı adreste kayıtlı başka hane mevcut (kayıt atlandı)',
      durum: 'MUKERRER_HANE',
      islem_sonucu: 'EKLENMEDİ',
    }),
  ]);
  await sandboxImportBatches.updateOne(
    { batch_id: mainBatchId },
    { $set: { hatali_kayit: 1, mukerrer_tc: 1, mukerrer_hane: 1, toplam_satir: anaCount + 3 } }
  );

  // 4) ROTALAR: 1 aktif rota (karışık durumlu duraklar) + 1 tamamlanmış rota
  const buildFakeStop = (idx: number, order: number) => {
    const item = fakeHouseholdsRaw[idx];
    const done = item.durum === 'TAMAMLANDI';
    const partial = item.durum === 'EKSIK';
    const at = dayAt(done || partial ? idx % 5 : 0, 9 + (idx % 7), (idx * 7) % 60);
    return {
      sira: order,
      beneficiary_id: fakeBeneficiaryIds[idx],
      tc_no: buildValidFakeTc(item.prefix),
      ad_soyad: item.ad_soyad,
      sira_no: item.liste === 'EK_LISTE' ? `Ek1 - ${order}` : String(order),
      liste_turu: item.liste === 'EK_LISTE' ? 'EK_LISTE' : 'ANA_LISTE',
      ek_liste_no: item.liste === 'EK_LISTE' ? 1 : null,
      ek_liste_adi: item.liste === 'EK_LISTE' ? 'Ek Liste' : 'Ana Liste',
      telefon: item.telefon,
      telefon2: '',
      mahalle: item.mahalle,
      sokak: item.sokak,
      kapi_no: item.kapi_no,
      daire_no: item.daire_no > 1 ? item.daire_no : '',
      acik_adres: `${item.mahalle} ${item.sokak} No: ${item.kapi_no}${item.daire_no > 1 ? ` Daire: ${item.daire_no}` : ''}`,
      hedef_torba: defaultQuota,
      imza_durumu: item.imza === 'IMZALANDI' ? 'IMZALANDI' : 'BEKLIYOR',
      imza_tarihi: item.imza === 'IMZALANDI' ? at.tr : null,
      imza_alan_personel: item.imza === 'IMZALANDI' ? 'Deneme Saha Ekibi' : null,
      durum: done ? 'TAMAMLANDI' : partial ? 'EKSIK' : 'BEKLIYOR',
      teslim_edilen_torba: done || partial ? item.torba : 0,
      teslim_tarihi: done || partial ? at.tr : null,
      teslim_eden_personel: done || partial ? 'Deneme Saha Ekibi' : null,
      teslimat_notu: partial ? 'Deneme kısmi teslimat kaydı' : '',
    };
  };
  const summarizeRoute = (stops: any[]) => ({
    toplam_hane: stops.length,
    tamamlanan_hane: stops.filter((s) => s.durum === 'TAMAMLANDI').length,
    eksik_hane: stops.filter((s) => s.durum === 'EKSIK').length,
    teslim_edilemeyen_hane: 0,
    toplam_dagitilan_torba: stops.reduce((a, s) => a + (s.teslim_edilen_torba || 0), 0),
    hedef_toplam_torba: stops.reduce((a, s) => a + (s.hedef_torba || 0), 0),
  });

  const activeRouteStops = [0, 1, 2, 3, 4, 5, 6].map((idx, k) => buildFakeStop(idx, k + 1));
  const doneRouteStops = [11, 14, 17].map((idx, k) => buildFakeStop(idx, k + 1));
  const activeRouteId = new ObjectId();
  const doneRouteId = new ObjectId();
  const doneAt = dayAt(2, 17, 30);
  await sandboxDeliveryRoutes.insertMany([
    encryptRoute({
      _id: activeRouteId,
      id: activeRouteId.toString(),
      rota_adi: `${nowEnCa} Şükrüpaşa - Fatih Dağıtım Rotası (Deneme)`,
      tarih: nowEnCa,
      durum: 'AKTIF',
      olusturan_personel: creator,
      olusturan_username: 'deneme',
      dagitim_personeli: 'Deneme Saha Ekibi',
      isleten_personel: 'Deneme Saha Ekibi',
      isleten_username: 'deneme',
      ekip_adi: 'Deneme Ekibi 1',
      ekip_arkadaslari: [],
      arac_plaka: '22 TEST 001',
      mahalleler: ['Şükrüpaşa Mah.', 'Fatih Mah.'],
      duraklar: activeRouteStops,
      ...summarizeRoute(activeRouteStops),
      notlar: 'Deneme Modu örnek aktif rota',
      created_at: nowLocaleTr,
      completed_at: null,
    }),
    encryptRoute({
      _id: doneRouteId,
      id: doneRouteId.toString(),
      rota_adi: `${doneAt.en} 100. Yıl - Karaağaç - Köyler Rotası (Deneme)`,
      tarih: doneAt.en,
      durum: 'TAMAMLANDI',
      olusturan_personel: creator,
      olusturan_username: 'deneme',
      dagitim_personeli: 'Deneme Saha Ekibi',
      isleten_personel: 'Deneme Saha Ekibi',
      isleten_username: 'deneme',
      ekip_adi: 'Deneme Ekibi 2',
      ekip_arkadaslari: [],
      arac_plaka: '22 TEST 002',
      mahalleler: ['100. Yıl Mah.', 'Karaağaç Mah.', 'Büyükdöllük Köyü'],
      duraklar: doneRouteStops,
      ...summarizeRoute(doneRouteStops),
      aktif_rota_modu: false,
      notlar: 'Deneme Modu örnek tamamlanmış rota',
      kapanis_notu: 'Tüm duraklar eksiksiz tamamlandığı için rota otomatik kapatıldı.',
      created_at: doneAt.tr,
      completed_at: doneAt.tr,
    }),
  ]);

  // 5) İŞLEM GEÇMİŞİ (Aktivite günlüğü) örnekleri
  const logEntry = (off: number, hour: number, kullanici: string, rol: 'ADMIN' | 'PERSONEL', tip: string, baslik: string, detay: string, extra: any = {}) => {
    const d = dayAt(off, hour, (hour * 11) % 60);
    return encryptActivityLog({
      kullanici_adi: kullanici,
      kullanici_rolu: rol,
      islem_tipi: tip,
      baslik,
      detay,
      calisma_modu: 'DENEME',
      tarih: d.tr,
      tarih_iso: d.iso,
      gun_tarihi: d.en,
      ...extra,
    });
  };
  const deliveredFake = fakeHouseholdsRaw
    .map((h, idx) => ({ h, idx }))
    .filter(({ h }) => h.durum === 'TAMAMLANDI' || h.durum === 'EKSIK');
  const activityDocs: any[] = [
    logEntry(5, 9, creator, 'ADMIN', 'EXCEL_YUKLEME', '[DENEME] Excel Listesi Yüklendi', `Deneme Ana Dağıtım Listesi (Fake Veri).xlsx dosyasından ${anaCount} hane yüklendi.`),
    logEntry(5, 10, creator, 'ADMIN', 'TAHSIS_GUNCELLEME', '[DENEME] Kömür Tahsisi Güncellendi', 'Kuruma gelecek toplam kömür miktarı 400 ton olarak belirlendi.'),
    ...extraTrucksRaw.map((t) =>
      logEntry(t.off, 14, creator, 'ADMIN', 'TIR_GIRIS', '[DENEME] Yeni Kömür Tırı Girişi', `#${t.order} Sıra No | Tır Plakası: ${t.plaka} | İrsaliye No: ${t.irs} | Net Tonaj: ${t.net} ton`)
    ),
    ...fakeStaff.map((s, si) =>
      logEntry(1, 8, s, 'PERSONEL', 'MESAI_GIRIS', 'Günlük Çalışma Saati Kaydedildi', `${s} için ${dayAt(1).en} tarihli mesai kaydı eklendi.`, { ek_bilgi: { gun_tarihi: dayAt(1).en, sira: si } })
    ),
    logEntry(2, 17, 'Deneme Saha Ekibi', 'PERSONEL', 'ROTA_OLUSTURMA', 'Yeni Dağıtım Rotası Oluşturuldu', `"${doneAt.en} 100. Yıl - Karaağaç - Köyler Rotası (Deneme)" oluşturuldu. Toplam ${doneRouteStops.length} durak.`),
    logEntry(2, 18, 'Deneme Saha Ekibi', 'PERSONEL', 'ROTA_KAPATMA', 'Rota Tamamlandı', `Rota duraklarının tamamı teslim edildiği için TAMAMLANDI durumuna alındı.`),
    logEntry(0, 8, creator, 'ADMIN', 'ROTA_OLUSTURMA', 'Yeni Dağıtım Rotası Oluşturuldu', `"${nowEnCa} Şükrüpaşa - Fatih Dağıtım Rotası (Deneme)" oluşturuldu. Toplam ${activeRouteStops.length} durak.`),
    logEntry(0, 8, creator, 'ADMIN', 'HANE_EKLEME', '[DENEME] Ek Liste Kaydı Eklendi', 'HASAN ÖZTÜRK (DENEME) Ek Liste altına eklendi.'),
    ...deliveredFake.map(({ h, idx }) => {
      const at = dayAt(idx % 5, 9 + (idx % 7), (idx * 7) % 60);
      return logEntry(
        idx % 5,
        9 + (idx % 7),
        'Deneme Saha Ekibi',
        'PERSONEL',
        h.durum === 'EKSIK' ? 'EKSIK_TESLIMAT' : 'TESLIMAT',
        h.durum === 'EKSIK' ? 'Eksik Kömür Teslimatı' : 'Kömür Teslim Edildi',
        `${h.ad_soyad} (${h.mahalle}) hanesine ${h.torba} torba kömür teslim edildi.`,
        { hedef_kisi: h.ad_soyad, hedef_tc: buildValidFakeTc(h.prefix), mahalle: h.mahalle, torba_sayisi: h.torba, tarih: at.tr }
      );
    }),
  ];
  await sandboxActivityLogs.insertMany(activityDocs);

  return { seededCount: docsToInsert.length, batchCount: 2 };
}




