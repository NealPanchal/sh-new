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
 * Save / Update a challan in Firebase Firestore
 */
export async function saveChallanToFirebase(challan: Challan): Promise<void> {
  try {
    const docRef = doc(firestore, COLLECTIONS.CHALLANS, challan.id);
    const data = sanitizeForFirestore({
      ...challan,
      updated_at: new Date().toISOString(),
    });
    await setDoc(docRef, data, { merge: true });
  } catch (err) {
    console.warn('Firebase saveChallan failed (offline mode active):', err);
  }
}

/**
 * Delete a challan from Firebase Firestore
 */
export async function deleteChallanFromFirebase(id: string): Promise<void> {
  try {
    const docRef = doc(firestore, COLLECTIONS.CHALLANS, id);
    await deleteDoc(docRef);
  } catch (err) {
    console.warn('Firebase deleteChallan failed (offline mode active):', err);
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
 * Subscribe to real-time challans changes from Firestore
 */
export function subscribeToChallans(onUpdate: (challans: Challan[]) => void): () => void {
  try {
    const colRef = collection(firestore, COLLECTIONS.CHALLANS);
    return onSnapshot(
      colRef,
      (snapshot) => {
        const list: Challan[] = [];
        snapshot.forEach((d) => {
          list.push(d.data() as Challan);
        });
        if (list.length > 0) {
          onUpdate(list);
        }
      },
      (error) => {
        console.warn('Firestore challans subscription error:', error);
      }
    );
  } catch (err) {
    console.warn('subscribeToChallans initialization failed:', err);
    return () => {};
  }
}
