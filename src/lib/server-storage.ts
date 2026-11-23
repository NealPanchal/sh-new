import fs from 'fs';
import path from 'path';
import {
  saveDocToFirestoreRest,
  fetchDocFromFirestoreRest,
  fetchCollectionDocsFromFirestoreRest,
} from './server-firestore';

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
 * Async hydrator from Cloud Firestore REST API for cold start serverless containers
 */
export async function syncFromFirestoreIfCold<T = any>(filename: string, fallback: T): Promise<T> {
  const mapping = FIRESTORE_SYNC_MAP[filename];
  if (!mapping) return safeReadDataFile(filename, fallback);

  // If already hydrated from Firestore during this process life, return memory cache
  if (firestoreHydrated.has(filename) && inMemoryCache.has(filename)) {
    return inMemoryCache.get(filename);
  }

  try {
    // 1. If mapping saves individual items to a collection, query the individual collection documents first
    if (mapping.saveIndividualToCollection) {
      const [colDocs, remoteBundle] = await Promise.all([
        fetchCollectionDocsFromFirestoreRest(mapping.saveIndividualToCollection).catch(() => []),
        fetchDocFromFirestoreRest(mapping.collection, mapping.docId).catch(() => null),
      ]);

      const keyField = mapping.idField || 'id';
      const mergedMap = new Map<string, any>();

      // A. Populate from individual docs (excluding meta documents like all_customers, all_entries)
      if (Array.isArray(colDocs)) {
        colDocs.forEach((doc) => {
          if (!doc || typeof doc !== 'object') return;
          const docId = String(doc.id || '').trim();
          if (docId.startsWith('all_')) return;
          const k = String(doc[keyField] || doc.id || '').trim().toLowerCase();
          if (k) mergedMap.set(k, doc);
        });
      }

      // B. Supplement from bundle doc if any items were not individually listed
      if (remoteBundle) {
        const bundleList = mapping.wrapAs && Array.isArray(remoteBundle[mapping.wrapAs])
          ? remoteBundle[mapping.wrapAs]
          : Array.isArray(remoteBundle)
          ? remoteBundle
          : [];

        bundleList.forEach((item: any) => {
          if (!item || typeof item !== 'object') return;
          const k = String(item[keyField] || item.id || item.username || '').trim().toLowerCase();
          if (k && !mergedMap.has(k)) {
            mergedMap.set(k, item);
          }
        });
      }

      if (mergedMap.size > 0) {
        const consolidated = Array.from(mergedMap.values());
        inMemoryCache.set(filename, consolidated);
        firestoreHydrated.add(filename);
        try {
          ensureDirSafe(TMP_DATA_DIR);
          const tmpPath = path.join(TMP_DATA_DIR, filename);
          fs.writeFileSync(tmpPath, JSON.stringify(consolidated, null, 2), 'utf-8');
        } catch {}
        return consolidated as T;
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
        return data as T;
      }
    }
  } catch (err) {
    console.warn(`[server-storage] Firestore hydration warning for ${filename}:`, err);
  }

  const localFallback = safeReadDataFile(filename, fallback);
  return localFallback;
}
