/**
 * Server-Side Cloud Firestore REST Service
 * Directly interacts with Google Cloud Firestore REST API in Node.js / Vercel Serverless environment
 */

import { Challan } from '@/types';

const FIRESTORE_PROJECT_ID = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || 'showhouse-2ea0f';
const BASE_FIRESTORE_URL = `https://firestore.googleapis.com/v1/projects/${FIRESTORE_PROJECT_ID}/databases/(default)/documents`;

function convertFirestoreValue(val: any): any {
  if (!val || typeof val !== 'object') return val;
  if ('stringValue' in val) return val.stringValue;
  if ('integerValue' in val) return parseInt(val.integerValue, 10);
  if ('doubleValue' in val) return parseFloat(val.doubleValue);
  if ('booleanValue' in val) return val.booleanValue;
  if ('nullValue' in val) return null;
  if ('timestampValue' in val) return val.timestampValue;
  if ('arrayValue' in val) {
    const values = val.arrayValue?.values || [];
    return values.map(convertFirestoreValue);
  }
  if ('mapValue' in val) {
    const fields = val.mapValue?.fields || {};
    const res: Record<string, any> = {};
    for (const k of Object.keys(fields)) {
      res[k] = convertFirestoreValue(fields[k]);
    }
    return res;
  }
  return val;
}

export function firestoreDocToChallan(doc: any): Challan | null {
  if (!doc || !doc.fields) return null;
  const docId = doc.name ? doc.name.split('/').pop() : '';
  const res: Record<string, any> = { id: docId };

  for (const k of Object.keys(doc.fields)) {
    res[k] = convertFirestoreValue(doc.fields[k]);
  }

  // Ensure ID and items
  if (!res.id && docId) res.id = docId;
  if (!Array.isArray(res.items)) {
    res.items = [];
  }

  return res as Challan;
}

function jsToFirestoreValue(val: any): any {
  if (val === null || val === undefined) return { nullValue: null };
  if (typeof val === 'boolean') return { booleanValue: val };
  if (typeof val === 'number') {
    if (Number.isInteger(val)) return { integerValue: val.toString() };
    return { doubleValue: val };
  }
  if (typeof val === 'string') return { stringValue: val };
  if (Array.isArray(val)) {
    return {
      arrayValue: {
        values: val.map(jsToFirestoreValue),
      },
    };
  }
  if (typeof val === 'object') {
    const fields: Record<string, any> = {};
    for (const k of Object.keys(val)) {
      if (val[k] !== undefined) {
        fields[k] = jsToFirestoreValue(val[k]);
      }
    }
    return { mapValue: { fields } };
  }
  return { stringValue: String(val) };
}

export function challanToFirestoreFields(challan: Record<string, any>): Record<string, any> {
  const fields: Record<string, any> = {};
  for (const k of Object.keys(challan)) {
    if (challan[k] !== undefined) {
      fields[k] = jsToFirestoreValue(challan[k]);
    }
  }
  return fields;
}

/**
 * Fetch a single challan from Cloud Firestore REST API by Document ID or Challan Number
 */
export async function fetchSingleChallanFromFirestore(id: string): Promise<Challan | null> {
  if (!id) return null;

  // 1. Try direct doc lookup
  try {
    const res = await fetch(`${BASE_FIRESTORE_URL}/challans/${encodeURIComponent(id)}`, {
      method: 'GET',
      headers: { 'Content-Type': 'application/json' },
      cache: 'no-store',
    });

    if (res.ok) {
      const doc = await res.json();
      const parsed = firestoreDocToChallan(doc);
      if (parsed) return parsed;
    }
  } catch (err) {
    console.warn('fetchSingleChallanFromFirestore direct lookup note:', err);
  }

  // 2. Query by challan_number
  try {
    const queryUrl = `https://firestore.googleapis.com/v1/projects/${FIRESTORE_PROJECT_ID}/databases/(default)/documents:runQuery`;
    const queryBody = {
      structuredQuery: {
        from: [{ collectionId: 'challans' }],
        where: {
          fieldFilter: {
            field: { fieldPath: 'challan_number' },
            op: 'EQUAL',
            value: { stringValue: id },
          },
        },
        limit: 1,
      },
    };

    const res = await fetch(queryUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(queryBody),
      cache: 'no-store',
    });

    if (res.ok) {
      const results = await res.json();
      if (Array.isArray(results) && results.length > 0 && results[0].document) {
        return firestoreDocToChallan(results[0].document);
      }
    }
  } catch (err) {
    console.warn('fetchSingleChallanFromFirestore query lookup note:', err);
  }

  return null;
}

/**
 * Fetch all active challans from Cloud Firestore REST API
 */
export async function fetchAllChallansFromFirestore(): Promise<Challan[]> {
  try {
    const res = await fetch(`${BASE_FIRESTORE_URL}/challans?pageSize=300`, {
      method: 'GET',
      headers: { 'Content-Type': 'application/json' },
      cache: 'no-store',
    });

    if (res.ok) {
      const data = await res.json();
      if (data.documents && Array.isArray(data.documents)) {
        const list: Challan[] = [];
        for (const doc of data.documents) {
          const parsed = firestoreDocToChallan(doc);
          if (parsed && !parsed.is_deleted) {
            list.push(parsed);
          }
        }
        return list;
      }
    }
  } catch (err) {
    console.warn('fetchAllChallansFromFirestore error:', err);
  }
  return [];
}

/**
 * Persist or update a challan directly in Cloud Firestore via REST API
 */
export async function saveChallanToFirestoreRest(challan: Challan): Promise<boolean> {
  if (!challan || !challan.id) return false;
  try {
    const fields = challanToFirestoreFields({
      ...challan,
      updated_at: new Date().toISOString(),
    });

    const url = `${BASE_FIRESTORE_URL}/challans/${encodeURIComponent(challan.id)}`;
    const res = await fetch(url, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ fields }),
    });

    return res.ok;
  } catch (err) {
    console.warn('saveChallanToFirestoreRest error:', err);
    return false;
  }
}

/**
 * Delete a challan from Cloud Firestore via REST API
 */
export async function deleteChallanFromFirestoreRest(id: string): Promise<boolean> {
  if (!id) return false;
  try {
    const url = `${BASE_FIRESTORE_URL}/challans/${encodeURIComponent(id)}`;
    const res = await fetch(url, {
      method: 'DELETE',
    });
    return res.ok;
  } catch (err) {
    console.warn('deleteChallanFromFirestoreRest error:', err);
    return false;
  }
}
