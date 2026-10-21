/**
 * Firebase Firestore Cloud Sync Service
 * Real-time synchronization for Showhouse Challans, Customers, Products, and Business Profile
 */

import {
  collection,
  doc,
  setDoc,
  deleteDoc,
  getDocs,
  onSnapshot,
  query,
  orderBy,
  where,
} from 'firebase/firestore';
import { firestore } from '@/lib/firebase';
import { Challan, Customer, Product, BusinessProfile } from '@/types';

const COLLECTIONS = {
  CHALLANS: 'challans',
  CUSTOMERS: 'customers',
  PRODUCTS: 'products',
  SETTINGS: 'settings',
};

// Clean undefined values before writing to Firestore
function sanitizeForFirestore<T extends Record<string, any>>(obj: T): T {
  const clean: Record<string, any> = {};
  for (const key of Object.keys(obj)) {
    const val = obj[key];
    if (val !== undefined) {
      if (val !== null && typeof val === 'object' && !Array.isArray(val) && !(val instanceof Date)) {
        clean[key] = sanitizeForFirestore(val);
      } else if (Array.isArray(val)) {
        clean[key] = val.map((item) =>
          typeof item === 'object' && item !== null ? sanitizeForFirestore(item) : item
        );
      } else {
        clean[key] = val;
      }
    }
  }
  return clean as T;
}

/**
 * Save / Update a challan in Firebase Firestore & Server Database
 */
export async function saveChallanToFirebase(challan: Challan): Promise<void> {
  const data = sanitizeForFirestore({
    ...challan,
    id: challan.id,
    updated_at: new Date().toISOString(),
  });

  // 1. Dual sync to Next.js server API
  if (typeof window !== 'undefined') {
    fetch('/api/challans', {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ challan: data }),
    }).catch(() => {});
  }

  // 2. Sync to Cloud Firestore
  try {
    const docRef = doc(firestore, COLLECTIONS.CHALLANS, challan.id);
    await setDoc(docRef, data, { merge: true });
  } catch (err: any) {
    console.warn('Firebase saveChallan warning:', err?.message || err);
  }
}

/**
 * Delete a challan from Firebase Firestore & Server Database
 */
export async function deleteChallanFromFirebase(id: string, challanNumber?: string | null): Promise<void> {
  // 1. Dual sync to Next.js server API
  if (typeof window !== 'undefined') {
    const params = new URLSearchParams();
    if (id) params.set('id', id);
    if (challanNumber) params.set('challan_number', challanNumber);
    params.set('permanent', 'true');
    fetch(`/api/challans?${params.toString()}`, {
      method: 'DELETE',
      credentials: 'same-origin',
    }).catch(() => {});
  }

  // 2. Sync to Cloud Firestore
  try {
    if (id) {
      const docRef = doc(firestore, COLLECTIONS.CHALLANS, id);
      await deleteDoc(docRef);
    }
    // Also delete any document matching challan_number
    if (challanNumber) {
      const q = query(
        collection(firestore, COLLECTIONS.CHALLANS),
        where('challan_number', '==', challanNumber)
      );
      const snaps = await getDocs(q);
      for (const d of snaps.docs) {
        await deleteDoc(d.ref);
      }
    }
  } catch (err: any) {
    console.warn('Firebase deleteChallan warning:', err?.message || err);
  }
}

/**
 * Save / Update a customer in Firebase Firestore
 */
export async function saveCustomerToFirebase(customer: Customer): Promise<void> {
  try {
    const docRef = doc(firestore, COLLECTIONS.CUSTOMERS, customer.id);
    const data = sanitizeForFirestore({
      ...customer,
      updated_at: new Date().toISOString(),
    });
    await setDoc(docRef, data, { merge: true });
  } catch (err) {
    console.warn('Firebase saveCustomer failed:', err);
  }
}

/**
 * Delete a customer from Firebase Firestore
 */
export async function deleteCustomerFromFirebase(id: string): Promise<void> {
  try {
    const docRef = doc(firestore, COLLECTIONS.CUSTOMERS, id);
    await deleteDoc(docRef);
  } catch (err) {
    console.warn('Firebase deleteCustomer failed:', err);
  }
}

/**
 * Save / Update a product in Firebase Firestore
 */
export async function saveProductToFirebase(product: Product): Promise<void> {
  try {
    const docRef = doc(firestore, COLLECTIONS.PRODUCTS, product.id);
    const data = sanitizeForFirestore({
      ...product,
      updated_at: new Date().toISOString(),
    });
    await setDoc(docRef, data, { merge: true });
  } catch (err) {
    console.warn('Firebase saveProduct failed:', err);
  }
}

/**
 * Delete a product from Firebase Firestore
 */
export async function deleteProductFromFirebase(id: string): Promise<void> {
  try {
    const docRef = doc(firestore, COLLECTIONS.PRODUCTS, id);
    await deleteDoc(docRef);
  } catch (err) {
    console.warn('Firebase deleteProduct failed:', err);
  }
}

/**
 * Save Business Profile in Firebase Firestore
 */
export async function saveProfileToFirebase(profile: BusinessProfile): Promise<void> {
  try {
    const docRef = doc(firestore, COLLECTIONS.SETTINGS, 'business_profile');
    const data = sanitizeForFirestore({
      ...profile,
      updated_at: new Date().toISOString(),
    });
    await setDoc(docRef, data, { merge: true });
  } catch (err) {
    console.warn('Firebase saveProfile failed:', err);
  }
}

/**
 * Fetch all challans from Firebase Firestore
 */
export async function fetchChallansFromFirebase(): Promise<Challan[]> {
  try {
    const colRef = collection(firestore, COLLECTIONS.CHALLANS);
    const snap = await getDocs(colRef);
    const list: Challan[] = [];
    snap.forEach((d) => {
      list.push(d.data() as Challan);
    });
    return list;
  } catch (err) {
    console.warn('Firebase fetchChallans failed:', err);
    return [];
  }
}

/**
 * Subscribe to real-time challans changes from Firestore, Server API, and BroadcastChannel
 */
export function subscribeToChallans(onUpdate: (challans: Challan[]) => void): () => void {
  let isFirestoreActive = false;

  // 1. Cross-tab real-time BroadcastChannel (0ms delay across tabs/windows on same device)
  let broadcastChannel: BroadcastChannel | null = null;
  if (typeof window !== 'undefined' && 'BroadcastChannel' in window) {
    try {
      broadcastChannel = new BroadcastChannel('showhouse_challans_sync');
      broadcastChannel.onmessage = (event) => {
        if (event.data?.type === 'CHALLANS_UPDATED' && Array.isArray(event.data.challans)) {
          onUpdate(event.data.challans);
        }
      };
    } catch {}
  }

  // 2. Real-time Cloud Firestore onSnapshot (Multi-Device Cloud)
  let unsubFirestore: (() => void) | null = null;
  try {
    const colRef = collection(firestore, COLLECTIONS.CHALLANS);
    unsubFirestore = onSnapshot(
      colRef,
      (snapshot) => {
        isFirestoreActive = true;
        const list: Challan[] = [];
        snapshot.forEach((d) => {
          const item = d.data() as Challan;
          list.push({ ...item, id: d.id || item.id });
        });
        onUpdate(list);
      },
      (error) => {
        console.warn('Firestore real-time subscription note:', error.message);
      }
    );
  } catch (err) {
    console.warn('subscribeToChallans Firestore init:', err);
  }

  // 3. Multi-device Server API sync polling (Runs every 3 seconds for 10 employees on LAN/Server)
  let pollInterval: any = null;
  if (typeof window !== 'undefined') {
    pollInterval = setInterval(async () => {
      try {
        const res = await fetch('/api/challans', { cache: 'no-store', credentials: 'same-origin' });
        if (res.ok) {
          const data = await res.json();
          if (data.success && Array.isArray(data.challans)) {
            // When firestore is unavailable or empty, server API provides the live list
            if (!isFirestoreActive || data.challans.length > 0) {
              onUpdate(data.challans);
            }
          }
        }
      } catch {}
    }, 3000);
  }

  return () => {
    if (unsubFirestore) unsubFirestore();
    if (broadcastChannel) broadcastChannel.close();
    if (pollInterval) clearInterval(pollInterval);
  };
}

/**
 * Broadcast local update to other tabs/windows immediately
 */
export function broadcastChallansUpdate(challans: Challan[]): void {
  if (typeof window !== 'undefined' && 'BroadcastChannel' in window) {
    try {
      const bc = new BroadcastChannel('showhouse_challans_sync');
      bc.postMessage({ type: 'CHALLANS_UPDATED', challans });
      bc.close();
    } catch {}
  }
}
