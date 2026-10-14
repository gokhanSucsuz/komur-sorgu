import { MongoClient, Db, ObjectId, ServerApiVersion } from 'mongodb';
import { normalizeAddress } from './normalizer';

const MONGODB_URI = process.env.MONGODB_URI || '';
const MONGODB_DB_NAME = process.env.MONGODB_DB_NAME || 'komur_db';

let cachedClient: MongoClient | null = null;
let cachedDb: Db | null = null;
let indexesInitialized = false;

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
      };
    } catch (err) {
      console.warn('[MongoDB] Atlas connection warning, using memory fallback:', err);
    }
  }

  // Local / dev fallback when MONGODB_URI is not set
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
      beneficiaries.createIndex({ tc_no: 1 }, { unique: true }),
      beneficiaries.createIndex({ mahalle: 1 }),
      beneficiaries.createIndex({ norm_adres: 1 }),
      beneficiaries.createIndex({ teslimat_durumu: 1 }),

      users.createIndex({ username: 1 }, { unique: true }),
      users.createIndex({ rol: 1 }),

      history.createIndex({ gun_tarihi: -1 }),
      history.createIndex({ tc_no: 1 }),
      history.createIndex({ islem_tipi: 1 }),

      trucks.createIndex({ tarih: -1 }),
      trucks.createIndex({ tir_sirasi: -1 }),

      logs.createIndex({ batch_id: 1 }),
      logs.createIndex({ tarih: -1 }),

      settings.createIndex({ key: 1 }, { unique: true }),

      shifts.createIndex({ tarih: -1 }),
      shifts.createIndex({ personel_adi: 1 }),
      shifts.createIndex({ durum: 1 }),

      activityLogs.createIndex({ tarih_iso: -1 }),
      activityLogs.createIndex({ islem_tipi: 1 }),
      activityLogs.createIndex({ kullanici_adi: 1 }),
      activityLogs.createIndex({ gun_tarihi: -1 }),
    ]);
  } catch (err) {
    console.warn('[MongoDB] Index initialization notice:', err);
  }

  // 1. Seed Settings
  const existingSetting = await settings.findOne({ key: 'varsayilan_hedef_torba' });
  if (!existingSetting) {
    await settings.insertOne({ key: 'varsayilan_hedef_torba', value: '34' });
  }

  // 2. Seed Users
  const userCount = await users.countDocuments();
  if (userCount === 0) {
    const nowStr = new Date().toLocaleString('tr-TR');
    await users.insertMany([
      { id: '1', username: 'admin', ad_soyad: 'Sistem Yöneticisi', rol: 'ADMIN', sifre: '1234', telefon: '05551112233', aktif: 1, created_at: nowStr },
      { id: '2', username: 'murat', ad_soyad: 'Murat Dağıtım', rol: 'PERSONEL', sifre: '1234', telefon: '05321112233', aktif: 1, created_at: nowStr },
      { id: '3', username: 'ahmet', ad_soyad: 'Ahmet Saha', rol: 'PERSONEL', sifre: '1234', telefon: '05442223344', aktif: 1, created_at: nowStr },
      { id: '4', username: 'kemal', ad_soyad: 'Kemal Taş', rol: 'PERSONEL', sifre: '1234', telefon: '05334445566', aktif: 1, created_at: nowStr },
    ]);
  }

  // 3. Seed Beneficiaries
  const benCount = await beneficiaries.countDocuments();
  if (benCount === 0) {
    const nowStr = new Date().toLocaleString('tr-TR');
    await beneficiaries.insertMany(getSeedBeneficiaries(nowStr));
    await history.insertMany(getSeedHistory());
    await trucks.insertMany(getSeedTrucks(nowStr));
    await shifts.insertMany(getSeedShifts(nowStr));
  }

  // 4. Seed Activity Logs if empty
  const actCount = await activityLogs.countDocuments();
  if (actCount === 0) {
    const nowStr = new Date().toLocaleString('tr-TR');
    await activityLogs.insertMany(getSeedActivityLogs(nowStr));
  }
}

function seedInMemoryStore(store: Record<string, any[]>) {
  const nowStr = new Date().toLocaleString('tr-TR');
  store.system_settings = [{ key: 'varsayilan_hedef_torba', value: '34' }];
  store.users = [
    { id: '1', username: 'admin', ad_soyad: 'Sistem Yöneticisi', rol: 'ADMIN', sifre: '1234', telefon: '05551112233', aktif: 1, created_at: nowStr },
    { id: '2', username: 'murat', ad_soyad: 'Murat Dağıtım', rol: 'PERSONEL', sifre: '1234', telefon: '05321112233', aktif: 1, created_at: nowStr },
    { id: '3', username: 'ahmet', ad_soyad: 'Ahmet Saha', rol: 'PERSONEL', sifre: '1234', telefon: '05442223344', aktif: 1, created_at: nowStr },
    { id: '4', username: 'kemal', ad_soyad: 'Kemal Taş', rol: 'PERSONEL', sifre: '1234', telefon: '05334445566', aktif: 1, created_at: nowStr },
  ];
  store.beneficiaries = getSeedBeneficiaries(nowStr);
  store.delivery_history = getSeedHistory();
  store.truck_deliveries = getSeedTrucks(nowStr);
  store.work_shifts = getSeedShifts(nowStr);
  store.activity_logs = getSeedActivityLogs(nowStr);
  store.import_logs = [
    {
      id: '1',
      batch_id: 'BATCH-DEMO-01',
      satir_no: 4,
      tc_no: '12345678904',
      ad_soyad: 'Fatma Yılmaz',
      telefon: '05332223344',
      mahalle: 'Cumhuriyet Mah.',
      acik_adres: 'Karanfil Sokak No: 14 Daire: 2',
      hane_no: '101',
      hata_nedeni: 'Aynı Hanede Zaten Kayıt Var: Ahmet Yılmaz (TC: 12345678902)',
      durum: 'MUKERRER_HANE',
      tarih: nowStr
    }
  ];
}

function getSeedBeneficiaries(nowStr: string) {
  const seeds = [
    {
      id: '1',
      tc_no: '12345678902',
      ad_soyad: 'Ahmet Yılmaz',
      telefon: '05321112233',
      telefon2: '05449998877',
      mahalle: 'Cumhuriyet Mah.',
      acik_adres: 'Karanfil Sokak No: 14 Daire: 2',
      hane_no: '101',
      norm_adres: normalizeAddress('Cumhuriyet Mah.', 'Karanfil Sokak No: 14 Daire: 2', '101'),
      hedef_torba: 34,
      teslimat_durumu: 'TAMAMLANDI',
      teslimat_tarihi: '2026-10-12 11:30:00',
      teslim_alan: 'Ahmet Yılmaz (Kendisi)',
      torba_sayisi: 34,
      teslim_eden_personel: 'Murat Dağıtım',
      teslimat_notu: 'Tam teslimat yapıldı, 34 torba kömürlüğe istiflendi.',
      created_at: nowStr,
      updated_at: nowStr,
    },
    {
      id: '2',
      tc_no: '12345678904',
      ad_soyad: 'Fatma Yılmaz',
      telefon: '05332223344',
      telefon2: '',
      mahalle: 'Cumhuriyet Mah.',
      yerlesim_tipi: 'MAHALLE',
      sokak: 'Karanfil Sok.',
      kapi_no: 2,
      acik_adres: 'Karanfil Sokak No: 2 Daire: 1',
      hane_no: '101',
      norm_adres: normalizeAddress('Cumhuriyet Mah.', 'Karanfil Sokak No: 2 Daire: 1', '101'),
      hedef_torba: 34,
      teslimat_durumu: 'BEKLIYOR',
      teslimat_tarihi: null,
      teslim_alan: null,
      torba_sayisi: 0,
      teslim_eden_personel: null,
      teslimat_notu: 'Ahmet Yılmaz ile aynı ailede',
      created_at: nowStr,
      updated_at: nowStr,
    },
    {
      id: '3',
      tc_no: '23456789014',
      ad_soyad: 'Mehmet Demir',
      telefon: '05443334455',
      telefon2: '05051234567',
      mahalle: 'İstiklal Mah.',
      yerlesim_tipi: 'MAHALLE',
      sokak: 'Atatürk Cad.',
      kapi_no: 28,
      acik_adres: 'Atatürk Caddesi No: 28 Daire: 1',
      hane_no: '102',
      norm_adres: normalizeAddress('İstiklal Mah.', 'Atatürk Caddesi No: 28 Daire: 1', '102'),
      hedef_torba: 34,
      teslimat_durumu: 'BEKLIYOR',
      teslimat_tarihi: null,
      teslim_alan: null,
      torba_sayisi: 0,
      teslim_eden_personel: null,
      teslimat_notu: null,
      created_at: nowStr,
      updated_at: nowStr,
    },
    {
      id: '4',
      tc_no: '23456789016',
      ad_soyad: 'Ayşe Demir',
      telefon: '05454445566',
      mahalle: 'İstiklal Mah.',
      yerlesim_tipi: 'MAHALLE',
      sokak: 'Atatürk Cad.',
      kapi_no: 28,
      acik_adres: 'Atatürk Caddesi No: 28 Daire: 1',
      hane_no: '102',
      norm_adres: normalizeAddress('İstiklal Mah.', 'Atatürk Caddesi No: 28 Daire: 1', '102'),
      hedef_torba: 34,
      teslimat_durumu: 'BEKLIYOR',
      teslimat_tarihi: null,
      teslim_alan: null,
      torba_sayisi: 0,
      teslim_eden_personel: null,
      teslimat_notu: 'Mehmet Demir ile aynı hanede kayıtlı',
      created_at: nowStr,
      updated_at: nowStr,
    },
    {
      id: '5',
      tc_no: '34567890126',
      ad_soyad: 'Mustafa Öztürk',
      telefon: '05556667788',
      mahalle: 'Fatih Mah.',
      yerlesim_tipi: 'MAHALLE',
      sokak: 'Gül Sok.',
      kapi_no: 7,
      acik_adres: 'Gül Sokak No: 7',
      hane_no: '103',
      norm_adres: normalizeAddress('Fatih Mah.', 'Gül Sokak No: 7', '103'),
      hedef_torba: 34,
      teslimat_durumu: 'EKSIK',
      teslimat_tarihi: '2026-10-13 14:15:00',
      teslim_alan: 'Mustafa Öztürk',
      torba_sayisi: 25,
      teslim_eden_personel: 'Kemal Taş',
      teslimat_notu: 'Kamyonette kömür azaldığı için 25 torba verildi, kalan 9 torba ertesi gün tamamlanacak.',
      created_at: nowStr,
      updated_at: nowStr,
    },
    {
      id: '6',
      tc_no: '45678901238',
      ad_soyad: 'Hatice Kaya',
      telefon: '05057778899',
      mahalle: 'Dereköy Köyü',
      yerlesim_tipi: 'KOY',
      sokak: 'Köy İçi Mevkii',
      kapi_no: 12,
      acik_adres: 'Dereköy Köy İçi Mevkii No: 12',
      hane_no: '104',
      norm_adres: normalizeAddress('Dereköy Köyü', 'Dereköy Köy İçi Mevkii No: 12', '104'),
      hedef_torba: 34,
      teslimat_durumu: 'BEKLIYOR',
      teslimat_tarihi: null,
      teslim_alan: null,
      torba_sayisi: 0,
      teslim_eden_personel: null,
      teslimat_notu: 'Köy muhtarlığı yanı',
      created_at: nowStr,
      updated_at: nowStr,
    },
    {
      id: '7',
      tc_no: '56789012340',
      ad_soyad: 'Ali Şen',
      telefon: '05308889900',
      mahalle: 'Yeni Mahalle',
      acik_adres: 'Çınar Sokak No: 19',
      hane_no: '105',
      norm_adres: normalizeAddress('Yeni Mahalle', 'Çınar Sokak No: 19', '105'),
      hedef_torba: 34,
      teslimat_durumu: 'BEKLIYOR',
      teslimat_tarihi: null,
      teslim_alan: null,
      torba_sayisi: 0,
      teslim_eden_personel: null,
      teslimat_notu: null,
      created_at: nowStr,
      updated_at: nowStr,
    },
    {
      id: '8',
      tc_no: '67890123452',
      ad_soyad: 'Zeynep Aydın',
      telefon: '05359990011',
      mahalle: 'Cumhuriyet Mah.',
      acik_adres: 'Menekşe Sokak No: 3',
      hane_no: '106',
      norm_adres: normalizeAddress('Cumhuriyet Mah.', 'Menekşe Sokak No: 3', '106'),
      hedef_torba: 34,
      teslimat_durumu: 'BEKLIYOR',
      teslimat_tarihi: null,
      teslim_alan: null,
      torba_sayisi: 0,
      teslim_eden_personel: null,
      teslimat_notu: null,
      created_at: nowStr,
      updated_at: nowStr,
    },
    {
      id: '9',
      tc_no: '78901234564',
      ad_soyad: 'Emine Kaya',
      telefon: '05367771122',
      mahalle: 'Dereköy Köyü',
      yerlesim_tipi: 'KOY',
      sokak: 'Köy İçi Mevkii',
      kapi_no: 3,
      acik_adres: 'Dereköy Köy İçi Mevkii No: 3',
      hane_no: '107',
      norm_adres: normalizeAddress('Dereköy Köyü', 'Dereköy Köy İçi Mevkii No: 3', '107'),
      hedef_torba: 34,
      teslimat_durumu: 'BEKLIYOR',
      teslimat_tarihi: null,
      teslim_alan: null,
      torba_sayisi: 0,
      teslim_eden_personel: null,
      teslimat_notu: 'Köy girişi',
      created_at: nowStr,
      updated_at: nowStr,
    },
    {
      id: '10',
      tc_no: '89012345676',
      ad_soyad: 'Hasan Yılmaz',
      telefon: '05378882233',
      mahalle: 'Cumhuriyet Mah.',
      yerlesim_tipi: 'MAHALLE',
      sokak: 'Karanfil Sok.',
      kapi_no: 10,
      acik_adres: 'Karanfil Sokak No: 10',
      hane_no: '108',
      norm_adres: normalizeAddress('Cumhuriyet Mah.', 'Karanfil Sokak No: 10', '108'),
      hedef_torba: 34,
      teslimat_durumu: 'BEKLIYOR',
      teslimat_tarihi: null,
      teslim_alan: null,
      torba_sayisi: 0,
      teslim_eden_personel: null,
      teslimat_notu: null,
      created_at: nowStr,
      updated_at: nowStr,
    },
  ];

  const mahalleCounters = new Map<string, number>();
  return seeds.map((s) => {
    const m = s.mahalle || 'Merkez';
    const cnt = (mahalleCounters.get(m) || 0) + 1;
    mahalleCounters.set(m, cnt);
    return {
      ...s,
      sira_no: String(cnt),
      mahalle_sira: cnt,
      ek_liste_no: 0,
      ek_liste_adi: 'Ana Liste',
      batch_id: 'SEED-INITIAL',
    };
  });
}

function getSeedHistory() {
  return [
    {
      id: '1',
      beneficiary_id: '1',
      tc_no: '12345678902',
      ad_soyad: 'Ahmet Yılmaz',
      mahalle: 'Cumhuriyet Mah.',
      acik_adres: 'Karanfil Sokak No: 14 Daire: 2',
      islem_tipi: 'TESLIMAT',
      torba_sayisi: 34,
      teslim_alan: 'Ahmet Yılmaz (Kendisi)',
      personel: 'Murat Dağıtım',
      notlar: 'Tam teslimat yapıldı, 34 torba',
      iptal_nedeni: null,
      tarih: '2026-10-12 11:30:00',
      gun_tarihi: '2026-10-12',
    },
    {
      id: '2',
      beneficiary_id: '5',
      tc_no: '34567890126',
      ad_soyad: 'Mustafa Öztürk',
      mahalle: 'Fatih Mah.',
      acik_adres: 'Gül Sokak No: 7',
      islem_tipi: 'TESLIMAT',
      torba_sayisi: 25,
      teslim_alan: 'Mustafa Öztürk',
      personel: 'Kemal Taş',
      notlar: 'Kısmi teslimat (25 torba verildi, 9 torba eksik kaldı)',
      iptal_nedeni: null,
      tarih: '2026-10-13 14:15:00',
      gun_tarihi: '2026-10-13',
    },
    {
      id: '3',
      beneficiary_id: '7',
      tc_no: '56789012340',
      ad_soyad: 'Ali Şen',
      mahalle: 'Yeni Mahalle',
      acik_adres: 'Çınar Sokak No: 19',
      islem_tipi: 'IPTAL',
      torba_sayisi: 25,
      teslim_alan: 'Ali Şen',
      personel: 'Yönetici',
      notlar: null,
      iptal_nedeni: 'Adres karışıklığı nedeniyle iptal edildi.',
      tarih: '2026-10-13 15:40:00',
      gun_tarihi: '2026-10-13',
    },
  ];
}

function getSeedTrucks(nowStr: string) {
  return [
    {
      id: '1',
      tir_sirasi: 1,
      plaka: '06 KMR 101',
      irsaliye_no: 'IRS-2026-1001',
      tarih: '2026-10-11',
      net_tonaj: 26.5,
      brut_tonaj: 41.2,
      tara_tonaj: 14.7,
      sofor_adi: 'Kadir Vural',
      notlar: '1. Sevkiyat Soma Linyit',
      created_at: nowStr,
    },
    {
      id: '2',
      tir_sirasi: 2,
      plaka: '06 KMR 102',
      irsaliye_no: 'IRS-2026-1002',
      tarih: '2026-10-12',
      net_tonaj: 27.1,
      brut_tonaj: 42.0,
      tara_tonaj: 14.9,
      sofor_adi: 'Hüseyin Er',
      notlar: '2. Sevkiyat Tunçbilek Torbalı',
      created_at: nowStr,
    },
    {
      id: '3',
      tir_sirasi: 3,
      plaka: '34 KMR 805',
      irsaliye_no: 'IRS-2026-1003',
      tarih: '2026-10-13',
      net_tonaj: 26.85,
      brut_tonaj: 41.65,
      tara_tonaj: 14.8,
      sofor_adi: 'Metin Sönmez',
      notlar: '3. Sevkiyat Kalorisi Yüksek',
      created_at: nowStr,
    },
  ];
}

function getSeedShifts(nowStr: string) {
  return [
    {
      id: '1',
      personel_adi: 'Murat Dağıtım',
      tarih: '2026-10-12',
      baslama_saati: '08:30',
      bitis_saati: '17:45',
      toplam_dakika: 555,
      durum: 'TAMAMLANDI',
      mahalleler: 'Cumhuriyet Mah.',
      teslim_edilen_torba: 136,
      teslim_edilen_hane: 4,
      notlar: 'Günlük dağıtım planı tamamlandı.',
      created_at: nowStr,
      updated_at: nowStr,
    },
    {
      id: '2',
      personel_adi: 'Ahmet Saha',
      tarih: '2026-10-12',
      baslama_saati: '08:00',
      bitis_saati: '16:30',
      toplam_dakika: 510,
      durum: 'TAMAMLANDI',
      mahalleler: 'Atatürk Mah.',
      teslim_edilen_torba: 102,
      teslim_edilen_hane: 3,
      notlar: 'Araç bakımı yapıldı.',
      created_at: nowStr,
      updated_at: nowStr,
    },
    {
      id: '3',
      personel_adi: 'Murat Dağıtım',
      tarih: '2026-10-11',
      baslama_saati: '08:00',
      bitis_saati: '17:00',
      toplam_dakika: 540,
      durum: 'TAMAMLANDI',
      mahalleler: 'Cumhuriyet Mah., Fatih Mah.',
      teslim_edilen_torba: 170,
      teslim_edilen_hane: 5,
      notlar: 'Pazar günü dağıtımı gerçekleştirildi.',
      created_at: nowStr,
      updated_at: nowStr,
    },
    {
      id: '4',
      personel_adi: 'Ahmet Saha',
      tarih: '2026-10-10',
      baslama_saati: '08:30',
      bitis_saati: '16:00',
      toplam_dakika: 450,
      durum: 'TAMAMLANDI',
      mahalleler: 'Fatih Mah.',
      teslim_edilen_torba: 102,
      teslim_edilen_hane: 3,
      notlar: 'Cumartesi mesaisi tamamlandı.',
      created_at: nowStr,
      updated_at: nowStr,
    },
  ];
}

export function getSeedActivityLogs(nowStr: string) {
  return [
    {
      id: '1',
      kullanici_adi: 'Murat Dağıtım',
      kullanici_rolu: 'PERSONEL',
      islem_tipi: 'TESLIMAT',
      baslik: 'Kömür Teslimatı Yapıldı',
      detay: 'Ahmet Yılmaz (TC: 12345678902) hanesine 34 torba kömür teslim edildi. Tam teslimat yapıldı, 34 torba kömürlüğe istiflendi.',
      hedef_kisi: 'Ahmet Yılmaz (Kendisi)',
      hedef_tc: '12345678902',
      mahalle: 'Cumhuriyet Mah.',
      torba_sayisi: 34,
      tarih: '12.10.2026 11:30:00',
      tarih_iso: '2026-10-12T08:30:00.000Z',
    },
    {
      id: '2',
      kullanici_adi: 'Kemal Taş',
      kullanici_rolu: 'PERSONEL',
      islem_tipi: 'EKSIK_TESLIMAT',
      baslik: 'Kısmi Kömür Teslimatı',
      detay: 'Mustafa Öztürk (TC: 34567890126) hanesine 25/34 torba verildi, 9 torba eksik kaldı. Kamyonette kömür azaldığı için 25 torba verildi, kalan 9 torba ertesi gün tamamlanacak.',
      hedef_kisi: 'Mustafa Öztürk',
      hedef_tc: '34567890126',
      mahalle: 'Fatih Mah.',
      torba_sayisi: 25,
      tarih: '13.10.2026 14:15:00',
      tarih_iso: '2026-10-13T11:15:00.000Z',
    },
    {
      id: '3',
      kullanici_adi: 'Sistem Yöneticisi',
      kullanici_rolu: 'ADMIN',
      islem_tipi: 'KOTA_DEGISTIRME',
      baslik: 'Varsayılan Hedef Kömür Kotası Güncellendi',
      detay: 'Hane başı dağıtım kotası 34 torba (0.85 Ton) olarak teyit edildi.',
      tarih: '14.10.2026 08:30:00',
      tarih_iso: '2026-10-14T05:30:00.000Z',
    },
    {
      id: '4',
      kullanici_adi: 'Murat Dağıtım',
      kullanici_rolu: 'PERSONEL',
      islem_tipi: 'MESAI_BASLAT',
      baslik: 'Günlük Mesai Başlatıldı',
      detay: '16 KMR 01 plakalı dağıtım kamyoneti ile saha mesaisi başlatıldı.',
      tarih: '14.10.2026 09:00:00',
      tarih_iso: '2026-10-14T06:00:00.000Z',
    },
    {
      id: '5',
      kullanici_adi: 'Murat Dağıtım',
      kullanici_rolu: 'PERSONEL',
      islem_tipi: 'ROTA_OLUSTURMA',
      baslik: 'Yeni Dağıtım Rotası Oluşturuldu',
      detay: '"14.10.2026 Kömür Dağıtım Rotası" oluşturuldu (2 durak, 68 torba hedef).',
      mahalle: 'Cumhuriyet Mah.',
      tarih: '14.10.2026 15:31:03',
      tarih_iso: '2026-10-14T12:31:03.000Z',
    },
    {
      id: '6',
      kullanici_adi: 'Murat Dağıtım',
      kullanici_rolu: 'PERSONEL',
      islem_tipi: 'ROTA_KAPATMA',
      baslik: 'Dağıtım Rotası Tamamlandı & Kapatıldı',
      detay: '"14.10.2026 Kömür Dağıtım Rotası" başarıyla tamamlandı ve kapatıldı. 2 haneye toplam 68 torba kömür teslim edildi.',
      mahalle: 'Cumhuriyet Mah.',
      tarih: '14.10.2026 15:31:37',
      tarih_iso: '2026-10-14T12:31:37.000Z',
    }
  ];
}

/**
 * Record a user operation / audit activity log
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
    const now = new Date();
    const doc = {
      ...item,
      kullanici_rolu: item.kullanici_rolu || (item.kullanici_adi?.toLowerCase().includes('admin') || item.kullanici_adi?.toLowerCase().includes('yönetici') ? 'ADMIN' : 'PERSONEL'),
      tarih: item.tarih || now.toLocaleString('tr-TR'),
      tarih_iso: item.tarih_iso || now.toISOString(),
      gun_tarihi: now.toLocaleDateString('en-CA'),
    };
    await activityLogs.insertOne(doc);
    return doc;
  } catch (err) {
    console.error('Error recording activity log:', err);
    return null;
  }
}

