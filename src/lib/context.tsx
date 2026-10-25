'use client';

import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { BusinessProfile, Customer, Product, Challan, ChallanItem, DashboardStats, ChallanStatus, ShareStatus, ChallanActivityLog } from '@/types';
import * as store from '@/lib/demo-store';

interface AppContextType {
  // State
  isLoading: boolean;
  isSetupComplete: boolean;
  profile: BusinessProfile | null;
  customers: Customer[];
  products: Product[];

  // Profile
  saveProfile: (data: Partial<BusinessProfile>) => BusinessProfile;

  // Customers
  refreshCustomers: (search?: string) => void;
  getCustomer: (id: string) => Customer | undefined;
  createCustomer: (data: Partial<Customer>) => Customer;
  updateCustomer: (id: string, data: Partial<Customer>) => Customer | null;
  deleteCustomer: (id: string) => boolean;
  getCustomerChallans: (customerId: string) => Challan[];

  // Products
  refreshProducts: (search?: string) => void;
  getProduct: (id: string) => Product | undefined;
  createProduct: (data: Partial<Product>) => Product;
  updateProduct: (id: string, data: Partial<Product>) => Product | null;
  deleteProduct: (id: string) => boolean;

  // Challans
  challans: Challan[];
  dataVersion: number;
  peekNextChallanNumber: () => string;
  getNextChallanNumber: () => string;
  getChallans: (filters?: {
    search?: string;
    status?: ChallanStatus;
    shareStatus?: ShareStatus;
    fromDate?: string;
    toDate?: string;
    customerId?: string;
  }) => Challan[];
  getChallan: (id: string) => Challan | undefined;
  createChallan: (data: Partial<Challan>, items: Partial<ChallanItem>[]) => Promise<Challan>;
  updateChallan: (id: string, data: Partial<Challan>, items?: Partial<ChallanItem>[]) => Promise<Challan | null>;
  deleteChallan: (id: string) => Promise<boolean>;
  updateChallanStatus: (id: string, status: ChallanStatus) => Promise<Challan | null>;
  updateShareStatus: (id: string, status: ShareStatus) => Promise<Challan | null>;
  duplicateChallan: (id: string) => Promise<Challan | null>;
  getActivityLog: (challanId: string) => ChallanActivityLog[];

  // Dashboard
  getDashboardStats: () => DashboardStats;

  // Toast
  showToast: (message: string, type?: 'success' | 'error' | 'info') => void;
  toast: { message: string; type: string } | null;
}

const AppContext = createContext<AppContextType | null>(null);

export function AppProvider({ children }: { children: React.ReactNode }) {
  const [isLoading, setIsLoading] = useState(true);
  const [isSetupComplete, setIsSetupComplete] = useState(false);
  const [profile, setProfile] = useState<BusinessProfile | null>(null);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [challans, setChallans] = useState<Challan[]>([]);
  const [toast, setToast] = useState<{ message: string; type: string } | null>(null);
  const [dataVersion, setDataVersion] = useState(0);

  useEffect(() => {
    store.initDemoStore();

    setProfile(store.getProfile());
    setIsSetupComplete(store.isSetupComplete());
    setCustomers(store.getCustomers());
    setProducts(store.getProducts());
    setChallans(store.getChallans());
    setIsLoading(false);

    // Initial fetch from Cloud Firestore & Server Database API
    import('@/lib/firebase-service').then(async ({ fetchChallansFromFirebase, fetchChallansFromServer }) => {
      try {
        const [firestoreChallans, serverChallans] = await Promise.all([
          fetchChallansFromFirebase().catch(() => []),
          fetchChallansFromServer().catch(() => []),
        ]);
        const combined = [...firestoreChallans, ...serverChallans];
        if (combined.length > 0) {
          store.syncFromFirebase(combined);
          setChallans([...store.getChallans()]);
          setDataVersion((v) => v + 1);
        }
      } catch (err) {
        console.warn('Challans initial cloud sync note:', err);
      }
    }).catch(() => {});

    // Fetch and sync customers from Cloud Firestore
    import('@/lib/firebase-service').then(({ fetchCustomersFromFirebase, subscribeToCustomers }) => {
      fetchCustomersFromFirebase().then((remoteCustomers) => {
        if (remoteCustomers && remoteCustomers.length > 0) {
          store.syncCustomersFromFirebase(remoteCustomers);
          setCustomers(store.getCustomers());
          setDataVersion((v) => v + 1);
        }
      });
      subscribeToCustomers((remoteCustomers) => {
        if (remoteCustomers && remoteCustomers.length > 0) {
          store.syncCustomersFromFirebase(remoteCustomers);
          setCustomers(store.getCustomers());
          setDataVersion((v) => v + 1);
        }
      });
    }).catch(() => {});

    // Fetch and sync products from Cloud Firestore
    import('@/lib/firebase-service').then(({ fetchProductsFromFirebase, subscribeToProducts }) => {
      fetchProductsFromFirebase().then((remoteProducts) => {
        if (remoteProducts && remoteProducts.length > 0) {
          store.syncProductsFromFirebase(remoteProducts);
          setProducts(store.getProducts());
          setDataVersion((v) => v + 1);
        }
      });
      subscribeToProducts((remoteProducts) => {
        if (remoteProducts && remoteProducts.length > 0) {
          store.syncProductsFromFirebase(remoteProducts);
          setProducts(store.getProducts());
          setDataVersion((v) => v + 1);
        }
      });
    }).catch(() => {});

    // Fetch and subscribe to profile / employees from Firebase Firestore & Server API
    import('@/lib/firebase-service').then(({ fetchProfileFromFirebase, subscribeToProfile }) => {
      fetchProfileFromFirebase().then((remoteProfile) => {
        if (remoteProfile) {
          store.syncProfile(remoteProfile);
          setProfile(store.getProfile());
        }
      });

      subscribeToProfile((remoteProfile) => {
        if (remoteProfile) {
          store.syncProfile(remoteProfile);
          setProfile(store.getProfile());
        }
      });
    }).catch(() => {});

    // Dynamic real-time sync with Firebase, Server API, and BroadcastChannel
    import('@/lib/firebase-service').then(({ subscribeToChallans }) => {
      const unsub = subscribeToChallans((remoteChallans) => {
        if (remoteChallans && Array.isArray(remoteChallans) && remoteChallans.length > 0) {
          store.syncFromFirebase(remoteChallans);
          setChallans([...store.getChallans()]);
          setDataVersion((v) => v + 1);
        }
      });
      return unsub;
    }).catch((err) => {
      console.warn('Firebase sync listener initialization skipped:', err);
    });
  }, []);

  const showToast = useCallback((message: string, type: 'success' | 'error' | 'info' = 'success') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 4000);
  }, []);

  const saveProfileFn = useCallback((data: Partial<BusinessProfile>) => {
    const p = store.saveProfile(data);
    setProfile(p);
    setIsSetupComplete(true);
    return p;
  }, []);

  const refreshCustomers = useCallback((search?: string) => {
    setCustomers(store.getCustomers(search));
  }, []);

  const refreshProducts = useCallback((search?: string) => {
    setProducts(store.getProducts(search));
  }, []);

  const createCustomerFn = useCallback((data: Partial<Customer>) => {
    const c = store.createCustomer(data);
    setCustomers(store.getCustomers());
    return c;
  }, []);

  const updateCustomerFn = useCallback((id: string, data: Partial<Customer>) => {
    const c = store.updateCustomer(id, data);
    setCustomers(store.getCustomers());
    return c;
  }, []);

  const deleteCustomerFn = useCallback((id: string) => {
    const result = store.deleteCustomer(id);
    setCustomers(store.getCustomers());
    return result;
  }, []);

  const createProductFn = useCallback((data: Partial<Product>) => {
    const p = store.createProduct(data);
    setProducts(store.getProducts());
    return p;
  }, []);

  const updateProductFn = useCallback((id: string, data: Partial<Product>) => {
    const p = store.updateProduct(id, data);
    setProducts(store.getProducts());
    return p;
  }, []);

  const deleteProductFn = useCallback((id: string) => {
    const result = store.deleteProduct(id);
    setProducts(store.getProducts());
    return result;
  }, []);

  const deleteChallanFn = useCallback(async (id: string) => {
    const res = store.deleteChallan(id);
    setChallans([...store.getChallans()]);
    setDataVersion((v) => v + 1);
    try {
      const { deleteChallanFromFirebase } = await import('@/lib/firebase-service');
      await deleteChallanFromFirebase(id);
    } catch {}
    return res;
  }, []);

  const createChallanFn = useCallback(async (data: Partial<Challan>, items: Partial<ChallanItem>[]) => {
    const res = store.createChallan(data, items);
    setChallans([...store.getChallans()]);
    setDataVersion((v) => v + 1);
    try {
      const { saveChallanToFirebase } = await import('@/lib/firebase-service');
      await saveChallanToFirebase(res);
    } catch {}
    return res;
  }, []);

  const updateChallanFn = useCallback(async (id: string, data: Partial<Challan>, items?: Partial<ChallanItem>[]) => {
    const res = store.updateChallan(id, data, items);
    setChallans([...store.getChallans()]);
    setDataVersion((v) => v + 1);
    if (res) {
      try {
        const { saveChallanToFirebase } = await import('@/lib/firebase-service');
        await saveChallanToFirebase(res);
      } catch {}
    }
    return res;
  }, []);

  const updateChallanStatusFn = useCallback(async (id: string, status: ChallanStatus) => {
    const res = store.updateChallanStatus(id, status);
    setChallans([...store.getChallans()]);
    setDataVersion((v) => v + 1);
    if (res) {
      try {
        const { saveChallanToFirebase } = await import('@/lib/firebase-service');
        await saveChallanToFirebase(res);
      } catch {}
    }
    return res;
  }, []);

  const updateShareStatusFn = useCallback(async (id: string, status: ShareStatus) => {
    const res = store.updateShareStatus(id, status);
    setChallans([...store.getChallans()]);
    setDataVersion((v) => v + 1);
    if (res) {
      try {
        const { saveChallanToFirebase } = await import('@/lib/firebase-service');
        await saveChallanToFirebase(res);
      } catch {}
    }
    return res;
  }, []);

  const duplicateChallanFn = useCallback(async (id: string) => {
    const res = store.duplicateChallan(id);
    setChallans([...store.getChallans()]);
    setDataVersion((v) => v + 1);
    if (res) {
      try {
        const { saveChallanToFirebase } = await import('@/lib/firebase-service');
        await saveChallanToFirebase(res);
      } catch {}
    }
    return res;
  }, []);

  const getChallansFn = useCallback(
    (filters?: Parameters<typeof store.getChallans>[0]) => {
      return store.getChallans(filters);
    },
    [dataVersion, challans]
  );

  const getDashboardStatsFn = useCallback(() => {
    return store.getDashboardStats();
  }, [dataVersion, challans]);

  const value: AppContextType = {
    isLoading,
    isSetupComplete,
    profile,
    customers,
    products,
    challans,
    dataVersion,
    saveProfile: saveProfileFn,
    refreshCustomers,
    getCustomer: store.getCustomer,
    createCustomer: createCustomerFn,
    updateCustomer: updateCustomerFn,
    deleteCustomer: deleteCustomerFn,
    getCustomerChallans: store.getCustomerChallans,
    refreshProducts,
    getProduct: store.getProduct,
    createProduct: createProductFn,
    updateProduct: updateProductFn,
    deleteProduct: deleteProductFn,
    peekNextChallanNumber: store.peekNextChallanNumber,
    getNextChallanNumber: store.getNextChallanNumber,
    getChallans: getChallansFn,
    getChallan: store.getChallan,
    createChallan: createChallanFn,
    updateChallan: updateChallanFn,
    deleteChallan: deleteChallanFn,
    updateChallanStatus: updateChallanStatusFn,
    updateShareStatus: updateShareStatusFn,
    duplicateChallan: duplicateChallanFn,
    getActivityLog: store.getActivityLog,
    getDashboardStats: getDashboardStatsFn,
    showToast,
    toast,
  };

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useApp() {
  const context = useContext(AppContext);
  if (!context) {
    throw new Error('useApp must be used within AppProvider');
  }
  return context;
}
