import fs from 'fs';
import path from 'path';
import {
  saveDocToFirestoreRest,
  fetchDocFromFirestoreRest,
  fetchCollectionDocsFromFirestoreRest,
} from './server-firestore';
import {
  saveDocToSupabase,
  fetchDocFromSupabase,
  fetchCollectionDocsFromSupabase,
  deleteDocFromSupabase,
} from './server-supabase';

const DATA_DIR = path.join(process.cwd(), 'data');
const TMP_DATA_DIR = path.join('/tmp', 'showhouse_data');

// In-memory cache for ultra-fast, serverless-safe data access across Lambda invocations
const inMemoryCache = new Map<string, any>();
const firestoreHydrated = new Set<string>();

function ensureDirSafe(dirPath: string): boolean {
  try {
    if (!fs.existsSync(dirPath)) {
      fs.mkdirSync(dirPath, { recursive: true });
    }
    return true;
  } catch {
    return false;
  }
}

// Initialize directories safely
ensureDirSafe(DATA_DIR);
ensureDirSafe(TMP_DATA_DIR);

interface SyncConfig {
  collection: string;
  docId: string;
  wrapAs?: string;
  saveIndividualToCollection?: string;
  idField?: string;
}

const FIRESTORE_SYNC_MAP: Record<string, SyncConfig> = {
  'admin_credentials.json': { collection: 'auth_config', docId: 'admin_credentials' },
  'security_config.json': { collection: 'auth_config', docId: 'security_config' },
  'employees.json': {
    collection: 'auth_config',
    docId: 'employees',
    wrapAs: 'list',
    saveIndividualToCollection: 'employees',
    idField: 'username',
  },
  'settings.json': { collection: 'settings', docId: 'business_profile' },
  'security_audit_logs.json': { collection: 'auth_config', docId: 'security_audit_logs', wrapAs: 'list' },
  'customers.json': {
    collection: 'customers',
    docId: 'all_customers',
    wrapAs: 'list',
    saveIndividualToCollection: 'customers',
    idField: 'id',
  },
  'manual_ledger_entries.json': {
    collection: 'manual_ledger_entries',
    docId: 'all_entries',
    wrapAs: 'list',
    saveIndividualToCollection: 'manual_ledger_entries',
    idField: 'id',
  },
  'payments.json': {
    collection: 'payments',
    docId: 'all_payments',
    wrapAs: 'list',
    saveIndividualToCollection: 'payments',
    idField: 'id',
  },
  'goods_returns.json': { collection: 'goods_returns', docId: 'all_returns', wrapAs: 'list' },
  'site_adjustments.json': { collection: 'site_adjustments', docId: 'all_adjustments', wrapAs: 'list' },
  'quotations.json': {
    collection: 'quotations',
    docId: 'all_quotations',
    wrapAs: 'list',
    saveIndividualToCollection: 'quotations',
    idField: 'id',
  },
  'challans.json': {
    collection: 'challans',
    docId: 'all_challans',
    wrapAs: 'list',
    saveIndividualToCollection: 'challans',
    idField: 'id',
  },
  'customer_sites.json': {
    collection: 'customer_sites',
    docId: 'all_sites',
    wrapAs: 'list',
    saveIndividualToCollection: 'customer_sites',
    idField: 'id',
  },
  'user_totp_credentials.json': {
    collection: 'auth_config',
    docId: 'user_totp_credentials',
  },
};

/**
 * Universal safe data writer
 * Automatically handles serverless read-only file systems (EROFS on Vercel/Lambda)
 * Stores in memory -> writes to /tmp/showhouse_data -> attempts cwd/data -> dual-syncs to Firestore REST
 */
export function safeWriteDataFile<T = any>(filename: string, data: T): boolean {
  if (!filename) return false;

  // 1. Keep in memory cache
  inMemoryCache.set(filename, data);
  firestoreHydrated.add(filename);

  const content = typeof data === 'string' ? data : JSON.stringify(data, null, 2);
  let writtenSuccessfully = false;

  // 2. Always write to /tmp/showhouse_data/ (guaranteed writable on Linux/Vercel/Lambda/Mac)
  try {
    ensureDirSafe(TMP_DATA_DIR);
    const tmpPath = path.join(TMP_DATA_DIR, filename);
    fs.writeFileSync(tmpPath, content, 'utf-8');
    writtenSuccessfully = true;
  } catch (tmpErr) {
    console.warn(`[server-storage] /tmp write fallback failed for ${filename}:`, tmpErr);
  }

  // 3. Try writing to primary process.cwd()/data/ (silently ignore EROFS on serverless)
  try {
    ensureDirSafe(DATA_DIR);
    const primaryPath = path.join(DATA_DIR, filename);
    fs.writeFileSync(primaryPath, content, 'utf-8');
    writtenSuccessfully = true;
  } catch (err: any) {
    // Expected on Vercel / AWS Lambda where /var/task is read-only (EROFS)
  }

  // 4. Background sync to Google Cloud Firestore REST API
  const mapping = FIRESTORE_SYNC_MAP[filename];
  if (mapping) {
    const payload = mapping.wrapAs
      ? { [mapping.wrapAs]: data, count: Array.isArray(data) ? data.length : 1 }
      : typeof data === 'object' && data !== null
      ? data
      : { value: data };

    // Primary document or aggregate bundle save
    saveDocToFirestoreRest(mapping.collection, mapping.docId, payload).catch((syncErr) => {
      console.warn(`[server-storage] Firestore REST sync warning for ${filename}:`, syncErr);
    });

    // Background sync to Supabase PostgreSQL (Unlimited Free)
    saveDocToSupabase(mapping.collection, mapping.docId, payload).catch(() => {});

    // Save individual documents in top-level collection so they are visible in Firebase Console
    if (mapping.saveIndividualToCollection && Array.isArray(data)) {
      data.forEach((item: any) => {
        if (item && typeof item === 'object') {
          const rawId = mapping.idField ? item[mapping.idField] : item.id || item.username;
          if (rawId) {
            const docId = String(rawId).trim().toLowerCase();
            saveDocToFirestoreRest(mapping.saveIndividualToCollection!, docId, item).catch(() => {});
          }
        }
      });
    }
  }

  return writtenSuccessfully || true;
}

/**
 * Universal async data writer for Serverless / Cloud environments
 * Guarantees that Cloud Firestore REST writes are AWAITED before returning,
 * preventing Vercel Lambda freeze from dropping pending network writes.
 */
export async function safeWriteDataFileAsync<T = any>(filename: string, data: T): Promise<boolean> {
  if (!filename) return false;

  // 1. Keep in memory cache
  inMemoryCache.set(filename, data);
  firestoreHydrated.add(filename);

  const content = typeof data === 'string' ? data : JSON.stringify(data, null, 2);
  let writtenSuccessfully = false;

  // 2. Always write to /tmp/showhouse_data/ (guaranteed writable on Linux/Vercel/Lambda/Mac)
  try {
    ensureDirSafe(TMP_DATA_DIR);
    const tmpPath = path.join(TMP_DATA_DIR, filename);
    fs.writeFileSync(tmpPath, content, 'utf-8');
    writtenSuccessfully = true;
  } catch (tmpErr) {
    console.warn(`[server-storage] /tmp write failed for ${filename}:`, tmpErr);
  }

  // 3. Try writing to primary process.cwd()/data/ (silently ignore EROFS on serverless)
  try {
    ensureDirSafe(DATA_DIR);
    const primaryPath = path.join(DATA_DIR, filename);
    fs.writeFileSync(primaryPath, content, 'utf-8');
    writtenSuccessfully = true;
  } catch {
    // Expected on Vercel / AWS Lambda where /var/task is read-only (EROFS)
  }

  // 4. Awaited sync to Google Cloud Firestore REST API
  const mapping = FIRESTORE_SYNC_MAP[filename];
  if (mapping) {
    const payload = mapping.wrapAs
      ? { [mapping.wrapAs]: data, count: Array.isArray(data) ? data.length : 1 }
      : typeof data === 'object' && data !== null
      ? data
      : { value: data };

    try {
      await saveDocToFirestoreRest(mapping.collection, mapping.docId, payload);
    } catch (syncErr) {
      console.warn(`[server-storage] Firestore REST sync warning for ${filename}:`, syncErr);
    }

    // Awaited sync to Supabase PostgreSQL (Unlimited Free storage)
    try {
      await saveDocToSupabase(mapping.collection, mapping.docId, payload);
    } catch (supaErr) {
      console.warn(`[server-storage] Supabase sync note for ${filename}:`, supaErr);
    }

    // Save individual documents in top-level collection so they are visible in Firebase Console
    if (mapping.saveIndividualToCollection && Array.isArray(data)) {
      const individualPromises = data.map((item: any) => {
        if (item && typeof item === 'object') {
          const rawId = mapping.idField ? item[mapping.idField] : item.id || item.username;
          if (rawId) {
            const docId = String(rawId).trim().toLowerCase();
            return saveDocToFirestoreRest(mapping.saveIndividualToCollection!, docId, item);
          }
        }
        return Promise.resolve();
      });
      await Promise.allSettled(individualPromises);
    }
  }

  return writtenSuccessfully || true;
}

/**
 * Universal safe data reader
 * Reads from memory cache -> /tmp -> primary data/ -> fallback
 */
export function safeReadDataFile<T = any>(filename: string, fallback: T): T {
  if (!filename) return fallback;

  // 1. In-memory cache
  if (inMemoryCache.has(filename)) {
    return inMemoryCache.get(filename);
  }

  // 2. /tmp data file (contains latest serverless writes)
  try {
    const tmpPath = path.join(TMP_DATA_DIR, filename);
    if (fs.existsSync(tmpPath)) {
      const raw = fs.readFileSync(tmpPath, 'utf-8');
      if (raw.trim()) {
        const parsed = JSON.parse(raw);
        inMemoryCache.set(filename, parsed);
        return parsed;
      }
    }
  } catch {}

  // 3. Primary data/ file
  try {
    const primaryPath = path.join(DATA_DIR, filename);
    if (fs.existsSync(primaryPath)) {
      const raw = fs.readFileSync(primaryPath, 'utf-8');
      if (raw.trim()) {
        const parsed = JSON.parse(raw);
        inMemoryCache.set(filename, parsed);
        return parsed;
      }
    }
  } catch {}

  return fallback;
}

/**
 * Invalidate memory cache key
 */
export function invalidateDataCache(filename: string): void {
  inMemoryCache.delete(filename);
  firestoreHydrated.delete(filename);
}

/**
 * Normalize and merge remote datasets with local persistence
 * Prevents dropping customer sites, custom material rates, or local challans during hydration
 */
function normalizeAndMergeWithLocal(filename: string, remoteData: any): any {
  if (!remoteData) return remoteData;
  if (filename === 'customers.json') {
    const local = safeReadDataFile<any[]>('customers.json', []);
    const remoteList = Array.isArray(remoteData) ? remoteData : [];
    const map = new Map<string, any>();
    for (const c of local) {
      if (c && c.id) map.set(c.id, c);
    }
    for (const rc of remoteList) {
      if (!rc || !rc.id) continue;
      const existing = map.get(rc.id);
      if (!existing) {
        map.set(rc.id, rc);
      } else {
        const mergedSites =
          Array.isArray(rc.sites) && rc.sites.length > 0
            ? rc.sites
            : Array.isArray(existing.sites) && existing.sites.length > 0
            ? existing.sites
            : [];
        // Intelligently merge material rates: union all distinct materials, keeping latest rate
        const rateMap = new Map<string, any>();
        const getRateKey = (mr: any) => {
          const siteKey = (mr.site_name || mr.site_id || '').trim().toLowerCase();
          const matKey = (mr.particulars || mr.material || mr.id || '').trim().toLowerCase();
          return `${siteKey}::${matKey}`;
        };
        (Array.isArray(existing.material_rates) ? existing.material_rates : []).forEach((mr: any) => {
          if (mr && (mr.particulars || mr.material || mr.rate)) rateMap.set(getRateKey(mr), mr);
        });
        (Array.isArray(rc.material_rates) ? rc.material_rates : []).forEach((mr: any) => {
          if (mr && (mr.particulars || mr.material || mr.rate)) {
            const k = getRateKey(mr);
            const prev = rateMap.get(k);
            if (!prev) {
              rateMap.set(k, mr);
            } else {
              rateMap.set(k, {
                ...prev,
                ...mr,
                particulars: mr.particulars || prev.particulars || mr.material || prev.material,
                material: mr.material || prev.material || mr.particulars || prev.particulars,
                company_name: mr.company_name || prev.company_name || '',
                rate: Number(mr.rate) || Number(prev.rate) || 0,
                room: mr.room || prev.room || 'General',
              });
            }
          }
        });
        const mergedRates = Array.from(rateMap.values());
        const tLocal = new Date(existing.updated_at || existing.created_at || 0).getTime();
        const tRemote = new Date(rc.updated_at || rc.created_at || 0).getTime();
        const base = tRemote >= tLocal ? { ...existing, ...rc } : { ...rc, ...existing };
        map.set(rc.id, {
          ...base,
          name: (base.name || base.business_name || base.contact_person || 'Customer').trim(),
          business_name: (base.business_name || base.name || 'Customer').trim(),
          company_name: (base.company_name || base.business_name || base.name || 'Customer').trim(),
          contact_person: (base.contact_person || base.name || 'Customer').trim(),
          sites: mergedSites,
          material_rates: mergedRates,
        });
      }
    }
    return Array.from(map.values());
  }

  if (filename === 'challans.json') {
    const local = safeReadDataFile<any[]>('challans.json', []);
    const remoteList = Array.isArray(remoteData) ? remoteData : [];
    const map = new Map<string, any>();
    for (const c of local) {
      if (c && (c.id || c.challan_number)) map.set(c.id || c.challan_number, c);
    }
    for (const rc of remoteList) {
      if (!rc || (!rc.id && !rc.challan_number)) continue;
      const key = rc.id || rc.challan_number;
      const existing = map.get(key);
      if (!existing) {
        map.set(key, rc);
      } else {
        const tLocal = new Date(existing.updated_at || existing.created_at || 0).getTime();
        const tRemote = new Date(rc.updated_at || rc.created_at || 0).getTime();
        map.set(key, tRemote >= tLocal ? { ...existing, ...rc } : { ...rc, ...existing });
      }
    }
    return Array.from(map.values()).sort((a, b) => {
      const da = new Date(b.challan_date || b.created_at || 0).getTime();
      const db = new Date(a.challan_date || a.created_at || 0).getTime();
      return da - db;
    });
  }

  if (filename === 'customer_sites.json') {
    const local = safeReadDataFile<any[]>('customer_sites.json', []);
    const remoteList = Array.isArray(remoteData) ? remoteData : [];
    const map = new Map<string, any>();
    for (const s of local) {
      if (s && s.id) map.set(s.id, s);
    }
    for (const rs of remoteList) {
      if (!rs || !rs.id) continue;
      map.set(rs.id, rs);
    }
    return Array.from(map.values());
  }

  return remoteData;
}

/**
 * Async hydrator from Cloud Firestore REST API for cold start serverless containers
 */
export async function syncFromFirestoreIfCold<T = any>(filename: string, fallback: T): Promise<T> {
  const mapping = FIRESTORE_SYNC_MAP[filename];
  if (!mapping) return safeReadDataFile(filename, fallback);

  // If already hydrated from Firestore/Supabase during this process life, return memory cache
  if (firestoreHydrated.has(filename) && inMemoryCache.has(filename)) {
    return inMemoryCache.get(filename);
  }

  try {
    // 0. Primary Check: Supabase PostgreSQL (Immediate, high-speed, unlimited free storage)
    try {
      const supaDoc = await fetchDocFromSupabase(mapping.collection, mapping.docId);
      if (supaDoc) {
        const rawSupaData =
          mapping.wrapAs && Array.isArray(supaDoc[mapping.wrapAs])
            ? supaDoc[mapping.wrapAs]
            : supaDoc;

        const supaData = normalizeAndMergeWithLocal(filename, rawSupaData);

        inMemoryCache.set(filename, supaData);
        firestoreHydrated.add(filename);
        try {
          ensureDirSafe(TMP_DATA_DIR);
          const tmpPath = path.join(TMP_DATA_DIR, filename);
          fs.writeFileSync(tmpPath, JSON.stringify(supaData, null, 2), 'utf-8');
        } catch {}
        try {
          ensureDirSafe(DATA_DIR);
          const primaryPath = path.join(DATA_DIR, filename);
          fs.writeFileSync(primaryPath, JSON.stringify(supaData, null, 2), 'utf-8');
        } catch {}
        return supaData as T;
      }
    } catch {}

    // 1. If mapping saves individual items to a collection
    if (mapping.saveIndividualToCollection) {
      // First try fetching the primary bundle doc (single fast read, always reflects exact saved state)
      const remoteBundle = await fetchDocFromFirestoreRest(mapping.collection, mapping.docId).catch(() => null);

      const rawBundleList = mapping.wrapAs && Array.isArray(remoteBundle?.[mapping.wrapAs])
        ? remoteBundle[mapping.wrapAs]
        : Array.isArray(remoteBundle)
        ? remoteBundle
        : null;

      if (rawBundleList && Array.isArray(rawBundleList) && rawBundleList.length > 0) {
        const bundleList = normalizeAndMergeWithLocal(filename, rawBundleList);
        inMemoryCache.set(filename, bundleList);
        firestoreHydrated.add(filename);
        try {
          ensureDirSafe(TMP_DATA_DIR);
          const tmpPath = path.join(TMP_DATA_DIR, filename);
          fs.writeFileSync(tmpPath, JSON.stringify(bundleList, null, 2), 'utf-8');
        } catch {}
        try {
          ensureDirSafe(DATA_DIR);
          const primaryPath = path.join(DATA_DIR, filename);
          fs.writeFileSync(primaryPath, JSON.stringify(bundleList, null, 2), 'utf-8');
        } catch {}
        return bundleList as T;
      }

      // Fallback: only if bundle doc does not exist, query individual collection documents
      const colDocs = await fetchCollectionDocsFromFirestoreRest(mapping.saveIndividualToCollection).catch(() => []);
      if (Array.isArray(colDocs) && colDocs.length > 0) {
        const keyField = mapping.idField || 'id';
        const mergedMap = new Map<string, any>();
        colDocs.forEach((doc) => {
          if (!doc || typeof doc !== 'object') return;
          const docId = String(doc.id || '').trim();
          if (docId.startsWith('all_')) return;
          const k = String(doc[keyField] || doc.id || '').trim().toLowerCase();
          if (k) mergedMap.set(k, doc);
        });

        if (mergedMap.size > 0) {
          const rawConsolidated = Array.from(mergedMap.values());
          const consolidated = normalizeAndMergeWithLocal(filename, rawConsolidated);
          inMemoryCache.set(filename, consolidated);
          firestoreHydrated.add(filename);
          try {
            ensureDirSafe(TMP_DATA_DIR);
            const tmpPath = path.join(TMP_DATA_DIR, filename);
            fs.writeFileSync(tmpPath, JSON.stringify(consolidated, null, 2), 'utf-8');
          } catch {}
          try {
            ensureDirSafe(DATA_DIR);
            const primaryPath = path.join(DATA_DIR, filename);
            fs.writeFileSync(primaryPath, JSON.stringify(consolidated, null, 2), 'utf-8');
          } catch {}
          return consolidated as T;
        }
      }
    } else {
      // 2. Single document mapping (e.g. settings/business_profile, auth_config/admin_credentials)
      const remote = await fetchDocFromFirestoreRest(mapping.collection, mapping.docId);
      if (remote) {
        const data =
          mapping.wrapAs && Array.isArray(remote[mapping.wrapAs])
            ? remote[mapping.wrapAs]
            : remote;
        inMemoryCache.set(filename, data);
        firestoreHydrated.add(filename);
        try {
          ensureDirSafe(TMP_DATA_DIR);
          const tmpPath = path.join(TMP_DATA_DIR, filename);
          fs.writeFileSync(tmpPath, JSON.stringify(data, null, 2), 'utf-8');
        } catch {}
        try {
          ensureDirSafe(DATA_DIR);
          const primaryPath = path.join(DATA_DIR, filename);
          fs.writeFileSync(primaryPath, JSON.stringify(data, null, 2), 'utf-8');
        } catch {}
        return data as T;
      }
    }
  } catch (err) {
    console.warn(`[server-storage] Firestore hydration warning for ${filename}:`, err);
  }

  const localFallback = safeReadDataFile(filename, fallback);
  return localFallback;
}
