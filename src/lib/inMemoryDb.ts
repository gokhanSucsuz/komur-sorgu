import crypto from 'crypto';
import { ObjectId } from 'mongodb';
import { encryptField, encryptUser, hashPassword } from './crypto';
import { getIstanbulDate } from './dateUtils';

declare global {
  var _inMemoryMongoStore: Record<string, Record<string, unknown>[]> | undefined;
}

/**
 * Ilk kurulum icin kaynak kodda SABIT parola bulunmaz. Ortam degiskeni yoksa rastgele,
 * guclu bir parola uretilir ve yalnizca sunucu konsoluna BIR KEZ yazilir; ilk giriste degistirilmelidir.
 */
export function generateBootstrapPassword(account: string): string {
  if (process.env.NODE_ENV === 'production' && process.env.ALLOW_EPHEMERAL_BOOTSTRAP !== 'true') {
    throw new Error(
      `[Güvenlik] Üretim ortamında "${account}" hesabı ilk kurulumu için ortam değişkeni (INITIAL_ADMIN_PASSWORD / INITIAL_MUDUR_PASSWORD) zorunludur.`
    );
  }
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';
  const bytes = crypto.randomBytes(20);
  let pass = '';
  for (let i = 0; i < bytes.length; i++) pass += alphabet[bytes[i] % alphabet.length];
  pass += '!7';
  return pass;
}

function seedInMemoryStore(store: Record<string, Record<string, unknown>[]>) {
  const { nowLocaleTr } = getIstanbulDate();
  const initialAdminPass =
    (process.env.INITIAL_ADMIN_PASSWORD || '').trim() || generateBootstrapPassword('admin');
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

export function getInMemoryStore(): Record<string, Record<string, unknown>[]> {
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
      signature_lists: [],
      sandbox_signature_lists: [],
    };
    seedInMemoryStore(global._inMemoryMongoStore);
  }
  if (global._inMemoryMongoStore && Array.isArray(global._inMemoryMongoStore.users)) {
    const adminUser = global._inMemoryMongoStore.users.find((u) => u.username === 'admin');
    if (adminUser) {
      adminUser.ad_soyad = encryptField('Gökhan SUÇSUZ');
    }
  }
  return global._inMemoryMongoStore;
}

function matchDoc(doc: Record<string, unknown>, filter: Record<string, unknown>): boolean {
  if (!filter || Object.keys(filter).length === 0) return true;

  if (Array.isArray(filter.$or)) {
    if (!filter.$or.some((subFilter) => matchDoc(doc, subFilter as Record<string, unknown>))) {
      return false;
    }
  }
  if (Array.isArray(filter.$and)) {
    if (!filter.$and.every((subFilter) => matchDoc(doc, subFilter as Record<string, unknown>))) {
      return false;
    }
  }

  for (const key of Object.keys(filter)) {
    if (key === '$or' || key === '$and') continue;
    const cond = filter[key];
    const val = doc[key];

    if (cond && typeof cond === 'object' && !(cond instanceof ObjectId) && !(cond instanceof RegExp)) {
      const condObj = cond as Record<string, unknown>;
      if ('$in' in condObj) {
        if (!Array.isArray(condObj.$in) || !condObj.$in.some((item) => String(item) === String(val))) return false;
      }
      if ('$nin' in condObj) {
        if (Array.isArray(condObj.$nin) && condObj.$nin.some((item) => String(item) === String(val))) return false;
      }
      if ('$exists' in condObj) {
        const exists = val !== undefined && val !== null && val !== '';
        if (Boolean(condObj.$exists) !== exists) return false;
      }
      if ('$gte' in condObj) {
        if (val === undefined || val === null || (val as string | number) < (condObj.$gte as string | number)) return false;
      }
      if ('$lte' in condObj) {
        if (val === undefined || val === null || (val as string | number) > (condObj.$lte as string | number)) return false;
      }
      if ('$ne' in condObj) {
        if (String(val) === String(condObj.$ne)) return false;
      }
      if ('$regex' in condObj) {
        const re = new RegExp(String(condObj.$regex), String(condObj.$options || 'i'));
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

export class InMemoryCollection {
  private colName: string;

  constructor(colName: string) {
    this.colName = colName;
  }

  private get items(): Record<string, unknown>[] {
    const store = getInMemoryStore();
    if (!store[this.colName]) {
      store[this.colName] = [];
    }
    return store[this.colName];
  }

  private set items(val: Record<string, unknown>[]) {
    const store = getInMemoryStore();
    store[this.colName] = val;
  }

  async findOne(filter: Record<string, unknown> = {}) {
    const found = this.items.find((item) => matchDoc(item, filter));
    return found ? JSON.parse(JSON.stringify(found)) : null;
  }

  find(filter: Record<string, unknown> = {}) {
    let results = this.items
      .filter((item) => matchDoc(item, filter))
      .map((i) => JSON.parse(JSON.stringify(i)));

    const cursor = {
      sort: (sortSpec: Record<string, number>) => {
        const keys = Object.keys(sortSpec);
        if (keys.length > 0) {
          const [k] = keys;
          const dir = sortSpec[k] >= 0 ? 1 : -1;
          results.sort((a, b) => {
            const va = (a[k] ?? '') as string | number;
            const vb = (b[k] ?? '') as string | number;
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

  async insertOne(doc: Record<string, unknown>) {
    const clone: Record<string, unknown> = { ...doc };
    if (!clone._id) clone._id = new ObjectId();
    if (!clone.id) clone.id = String(clone._id);
    this.items.push(clone);
    return { acknowledged: true, insertedId: clone._id };
  }

  async insertMany(docs: Record<string, unknown>[]) {
    const insertedIds: unknown[] = [];
    for (const d of docs) {
      const res = await this.insertOne(d);
      insertedIds.push(res.insertedId);
    }
    return { acknowledged: true, insertedCount: docs.length, insertedIds };
  }

  async updateOne(filter: Record<string, unknown>, update: Record<string, unknown>, options: { upsert?: boolean } = {}) {
    const index = this.items.findIndex((item) => matchDoc(item, filter));
    if (index === -1) {
      if (options.upsert) {
        const setObj = (update.$set as Record<string, unknown>) || update;
        const filterObj = (filter.$set as Record<string, unknown>) || filter;
        const newDoc = { ...setObj, ...filterObj };
        await this.insertOne(newDoc);
        return { acknowledged: true, modifiedCount: 1, upsertedCount: 1 };
      }
      return { acknowledged: true, modifiedCount: 0 };
    }

    if (update.$set && typeof update.$set === 'object') {
      this.items[index] = { ...this.items[index], ...(update.$set as Record<string, unknown>) };
    } else if (!update.$unset) {
      this.items[index] = { ...this.items[index], ...update };
    }
    if (update.$unset && typeof update.$unset === 'object') {
      for (const k of Object.keys(update.$unset as Record<string, unknown>)) {
        delete this.items[index][k];
      }
    }
    return { acknowledged: true, modifiedCount: 1 };
  }

  async updateMany(filter: Record<string, unknown>, update: Record<string, unknown>) {
    let count = 0;
    this.items.forEach((item, index) => {
      if (matchDoc(item, filter)) {
        if (update.$set && typeof update.$set === 'object') {
          this.items[index] = { ...item, ...(update.$set as Record<string, unknown>) };
        } else {
          this.items[index] = { ...item, ...update };
        }
        count++;
      }
    });
    return { acknowledged: true, modifiedCount: count };
  }

  async deleteOne(filter: Record<string, unknown>) {
    const index = this.items.findIndex((item) => matchDoc(item, filter));
    if (index !== -1) {
      this.items.splice(index, 1);
      return { acknowledged: true, deletedCount: 1 };
    }
    return { acknowledged: true, deletedCount: 0 };
  }

  async deleteMany(filter: Record<string, unknown> = {}) {
    const initialLen = this.items.length;
    this.items = this.items.filter((item) => !matchDoc(item, filter));
    return { acknowledged: true, deletedCount: initialLen - this.items.length };
  }

  async countDocuments(filter: Record<string, unknown> = {}) {
    return this.items.filter((item) => matchDoc(item, filter)).length;
  }

  async distinct(field: string, filter: Record<string, unknown> = {}) {
    const values = new Set<unknown>();
    this.items
      .filter((item) => matchDoc(item, filter))
      .forEach((item) => {
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

