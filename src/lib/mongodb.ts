import { MongoClient, Db, ObjectId, ServerApiVersion } from 'mongodb';
import { normalizeAddress, extractStreetAndDoor, normalizeMahalleName } from './normalizer';
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
      maxPoolSize: 10,
      minPoolSize: 1,
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
    'irsaliye_no',
    'personel_adi',
    'adres_guncelleme_notu',
  ];

  for (const field of piiFields) {
    if (typeof mapped[field] === 'string' && isEncrypted(mapped[field])) {
      mapped[field] = decryptField(mapped[field]);
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
    };
    seedInMemoryStore(global._inMemoryMongoStore);
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
 */
export async function getDbCollections() {
  if (isMongoConfigured()) {
    try {
      const db = await getMongoDb();
      if (!mahalleMigrationDone) {
        mahalleMigrationDone = true;
        await migrateMahalleNames(db);
      }
      return {
        isFallback: false,
        db,
        beneficiaries: db.collection<any>('beneficiaries'),
        users: db.collection<any>('users'),
        deliveryHistory: db.collection<any>('delivery_history'),
        truckDeliveries: db.collection<any>('truck_deliveries'),
        importLogs: db.collection<any>('import_logs'),
        systemSettings: db.collection<any>('system_settings'),
        workShifts: db.collection<any>('work_shifts'),
        importBatches: db.collection<any>('import_batches'),
        deliveryRoutes: db.collection<any>('delivery_routes'),
        activityLogs: db.collection<any>('activity_logs'),
        seasonArchives: db.collection<any>('season_archives'),
        archivedBeneficiaries: db.collection<any>('archived_beneficiaries'),
        archivedTruckDeliveries: db.collection<any>('archived_truck_deliveries'),
        archivedDeliveryHistory: db.collection<any>('archived_delivery_history'),
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
  }
  return {
    isFallback: true,
    db: null as any,
    beneficiaries: new InMemoryCollection('beneficiaries') as any,
    users: new InMemoryCollection('users') as any,
    deliveryHistory: new InMemoryCollection('delivery_history') as any,
    truckDeliveries: new InMemoryCollection('truck_deliveries') as any,
    importLogs: new InMemoryCollection('import_logs') as any,
    systemSettings: new InMemoryCollection('system_settings') as any,
    workShifts: new InMemoryCollection('work_shifts') as any,
    importBatches: new InMemoryCollection('import_batches') as any,
    deliveryRoutes: new InMemoryCollection('delivery_routes') as any,
    activityLogs: new InMemoryCollection('activity_logs') as any,
    seasonArchives: new InMemoryCollection('season_archives') as any,
    archivedBeneficiaries: new InMemoryCollection('archived_beneficiaries') as any,
    archivedTruckDeliveries: new InMemoryCollection('archived_truck_deliveries') as any,
    archivedDeliveryHistory: new InMemoryCollection('archived_delivery_history') as any,
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

  try {
    await Promise.allSettled([
      // Askeri Düzey AES-256-GCM ve Kör Dizin (Blind Index - HMAC-SHA256) İndeksleri
      beneficiaries.createIndex({ tc_hash: 1 }, { unique: true, sparse: true }),
      beneficiaries.createIndex({ hane_hash: 1 }, { sparse: true }),
      beneficiaries.createIndex({ adres_hash: 1 }, { sparse: true }),
      beneficiaries.createIndex({ mahalle: 1 }),
      beneficiaries.createIndex({ teslimat_durumu: 1 }),

      users.createIndex({ username: 1 }, { unique: true }),
      users.createIndex({ rol: 1 }),

      history.createIndex({ gun_tarihi: -1 }),
      history.createIndex({ tc_hash: 1 }, { sparse: true }),
      history.createIndex({ islem_tipi: 1 }),

      trucks.createIndex({ tarih: -1 }),
      trucks.createIndex({ tir_sirasi: -1 }),

      logs.createIndex({ batch_id: 1 }),
      logs.createIndex({ tc_hash: 1 }, { sparse: true }),
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
    ]);
  } catch (err) {
    console.warn('[MongoDB] Index initialization notice:', err);
  }

  // 1. Seed Settings (Quota & Active Season)
  const existingSetting = await settings.findOne({ key: 'varsayilan_hedef_torba' });
  if (!existingSetting) {
    await settings.insertOne({ key: 'varsayilan_hedef_torba', value: '34' });
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

  // 2. Initial Admin User if none exists (AES-256-GCM encrypted + scrypt password hash)
  const userCount = await users.countDocuments();
  if (userCount === 0) {
    const nowStr = new Date().toLocaleString('tr-TR');
    const initialAdminPass = (process.env.INITIAL_ADMIN_PASSWORD || '784512Gg.').trim();
    await users.insertOne(encryptUser({
      id: '1',
      username: 'admin',
      ad_soyad: 'Sistem Yöneticisi',
      rol: 'ADMIN',
      sifre: initialAdminPass,
      sifre_hash: hashPassword(initialAdminPass),
      telefon: '05551112233',
      aktif: 1,
      created_at: nowStr,
    }));
  }

  // 3. Otomatik Şifreleme Migrasyonu: Veritabanındaki tüm kullanıcılar, şoförler, rotalar ve kişisel verileri AES-256-GCM ile şifrele
  await migrateAndEncryptExistingData(db);

  // 4. Mahalle İsimleri İyileştirme Migrasyonu: "Yıl Mahallesi", "Yıl Mah." -> "100. Yıl Mah."
  await migrateMahalleNames(db);
}

function seedInMemoryStore(store: Record<string, any[]>) {
  const { nowLocaleTr } = getIstanbulDate();
  const initialAdminPass = (process.env.INITIAL_ADMIN_PASSWORD || '784512Gg.').trim();
  store.system_settings = [{ key: 'varsayilan_hedef_torba', value: '34' }];
  store.users = [
    encryptUser({
      id: '1',
      username: 'admin',
      ad_soyad: 'Sistem Yöneticisi',
      rol: 'ADMIN',
      sifre: initialAdminPass,
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
  store.season_archives = [];
  store.archived_beneficiaries = [];
  store.archived_truck_deliveries = [];
  store.archived_delivery_history = [];
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
}) {
  try {
    const { activityLogs } = await getDbCollections();
    const { nowIso, nowLocaleTr, nowEnCa } = getIstanbulDate();
    const doc = {
      ...item,
      kullanici_rolu: item.kullanici_rolu || (item.kullanici_adi?.toLowerCase().includes('admin') || item.kullanici_adi?.toLowerCase().includes('yönetici') ? 'ADMIN' : 'PERSONEL'),
      tarih: item.tarih || nowLocaleTr,
      tarih_iso: item.tarih_iso || nowIso,
      gun_tarihi: item.ek_bilgi?.gun_tarihi || nowEnCa,
    };
    // Encrypt sensitive details before writing to MongoDB Atlas
    const encryptedDoc = encryptActivityLog(doc);
    await activityLogs.insertOne(encryptedDoc);
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
    if (migFlag?.value === 'true') {
      return;
    }

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

        const updateFields: any = {
          tc_no: encryptField(plainTc),
          tc_hash: hashTc(plainTc),
          ad_soyad: encryptField(plainName),
          telefon: encryptField(plainTel),
          acik_adres: encryptField(plainAdres),
          hane_no: encryptField(plainHane),
          hata_nedeni: encryptField(plainHata),
        };

        await logs.updateOne({ _id: l._id }, { $set: updateFields });
      }
    }

    // 5. Kullanıcı Hesapları (Users) Şifreleme Migrasyonu (Ad Soyad, Şifre, Telefon, scrypt Hash)
    const usersCol = db.collection('users');
    const unencryptedUsers = await usersCol.find({
      $or: [
        { sifre: { $not: /^ENC:GCM:v1:/ } },
        { ad_soyad: { $not: /^ENC:GCM:v1:/ } },
        { telefon: { $not: /^ENC:GCM:v1:/ } },
        { sifre_hash: { $exists: false } }
      ]
    }).toArray();

    if (unencryptedUsers.length > 0) {
      console.log(`[AES-256-GCM] ${unencryptedUsers.length} kullanıcı hesabı şifreleniyor...`);
      for (const u of unencryptedUsers) {
        const plainName = isEncrypted(u.ad_soyad) ? decryptField(u.ad_soyad) : u.ad_soyad;
        const plainPass = isEncrypted(u.sifre) ? decryptField(u.sifre) : u.sifre;
        const plainTel = isEncrypted(u.telefon) ? decryptField(u.telefon) : u.telefon;

        const updateFields: any = {
          ad_soyad: encryptField(plainName),
          sifre: encryptField(plainPass),
          telefon: encryptField(plainTel),
        };
        if (!u.sifre_hash && plainPass) {
          updateFields.sifre_hash = hashPassword(String(plainPass));
        }
        await usersCol.updateOne({ _id: u._id }, { $set: updateFields });
      }
      console.log(`[AES-256-GCM] Kullanıcı hesapları (şifre, telefon, isim) başarıyla şifrelendi.`);
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
      const beneficiaries = db.collection('beneficiaries');
      const history = db.collection('delivery_history');
      const logs = db.collection('import_logs');
      const routes = db.collection('delivery_routes');
      const shifts = db.collection('work_shifts');
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
      }
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



