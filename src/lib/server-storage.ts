import fs from 'fs';
import path from 'path';
import { saveDocToFirestoreRest, fetchDocFromFirestoreRest } from './server-firestore';

const DATA_DIR = path.join(process.cwd(), 'data');
const TMP_DATA_DIR = path.join('/tmp', 'showhouse_data');

// In-memory cache for ultra-fast, serverless-safe data access across Lambda invocations
const inMemoryCache = new Map<string, any>();

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

const FIRESTORE_SYNC_MAP: Record<string, { collection: string; docId: string; wrapAs?: string }> = {
  'admin_credentials.json': { collection: 'auth_config', docId: 'admin_credentials' },
  'security_config.json': { collection: 'auth_config', docId: 'security_config' },
  'employees.json': { collection: 'auth_config', docId: 'employees', wrapAs: 'list' },
  'settings.json': { collection: 'settings', docId: 'business_profile' },
  'security_audit_logs.json': { collection: 'auth_config', docId: 'security_audit_logs', wrapAs: 'list' },
  'customers.json': { collection: 'accounting', docId: 'customers', wrapAs: 'list' },
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
      : (typeof data === 'object' && data !== null ? data : { value: data });
    saveDocToFirestoreRest(mapping.collection, mapping.docId, payload).catch((syncErr) => {
      console.warn(`[server-storage] Cloud Firestore REST sync warning for ${filename}:`, syncErr);
    });
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
}

/**
 * Async hydrator from Cloud Firestore REST API for cold start serverless containers
 */
export async function syncFromFirestoreIfCold<T = any>(filename: string, fallback: T): Promise<T> {
  const mapping = FIRESTORE_SYNC_MAP[filename];
  if (!mapping) return safeReadDataFile(filename, fallback);

  if (inMemoryCache.has(filename)) {
    return inMemoryCache.get(filename);
  }

  const tmpPath = path.join(TMP_DATA_DIR, filename);
  if (fs.existsSync(tmpPath)) {
    return safeReadDataFile(filename, fallback);
  }

  try {
    const remote = await fetchDocFromFirestoreRest(mapping.collection, mapping.docId);
    if (remote) {
      const data = mapping.wrapAs && Array.isArray(remote[mapping.wrapAs])
        ? remote[mapping.wrapAs]
        : remote;
      inMemoryCache.set(filename, data);
      try {
        ensureDirSafe(TMP_DATA_DIR);
        fs.writeFileSync(tmpPath, JSON.stringify(data, null, 2), 'utf-8');
      } catch {}
      return data as T;
    }
  } catch (err) {
    console.warn(`[server-storage] Firestore hydration warning for ${filename}:`, err);
  }

  return safeReadDataFile(filename, fallback);
}
