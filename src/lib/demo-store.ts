/**
 * Demo/Mock data store for local development without Supabase.
 * Uses in-memory state with localStorage persistence.
 */

import {
  BusinessProfile,
  Customer,
  Product,
  Challan,
  ChallanItem,
  ChallanActivityLog,
  ChallanStatus,
  ShareStatus,
  DashboardStats,
} from '@/types';
import { generateId, getFinancialYear, generateChallanNumber, getTodayISO } from '@/lib/utils';
import {
  saveChallanToFirebase,
  deleteChallanFromFirebase,
  saveCustomerToFirebase,
  deleteCustomerFromFirebase,
  saveProductToFirebase,
  deleteProductFromFirebase,
  saveProfileToFirebase,
  broadcastChallansUpdate,
} from '@/lib/firebase-service';

const STORAGE_KEY = 'showhouse_demo_data';
const DELETED_CHALLANS_KEY = 'showhouse_deleted_challans';
const DEMO_SEEDED_KEY = 'showhouse_demo_seeded_v1';

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function isUuid(str: string): boolean {
  return typeof str === 'string' && UUID_REGEX.test(str);
}

export function getDeletedChallanIdentifiers(): Set<string> {
  if (typeof window === 'undefined') return new Set();
  try {
    const raw = localStorage.getItem(DELETED_CHALLANS_KEY);
    if (raw) {
      const arr = JSON.parse(raw);
      if (Array.isArray(arr)) {
        return new Set(arr.filter((item: string) => isUuid(item)));
      }
    }
  } catch {}
  return new Set();
}

export function recordDeletedChallan(id: string): void {
  if (typeof window === 'undefined' || !isUuid(id)) return;
  try {
    const set = getDeletedChallanIdentifiers();
    set.add(id);
    localStorage.setItem(DELETED_CHALLANS_KEY, JSON.stringify(Array.from(set)));
  } catch {}
}

interface DemoState {
  profile: BusinessProfile | null;
  customers: Customer[];
  products: Product[];
  challans: Challan[];
  challanItems: ChallanItem[];
  activityLog: ChallanActivityLog[];
  isSetupComplete: boolean;
  challanSequence: number;
}

function getDefaultState(): DemoState {
  return {
    profile: null,
    customers: [],
    products: [],
    challans: [],
    challanItems: [],
    activityLog: [],
    isSetupComplete: false,
    challanSequence: 0,
  };
}

function loadState(): DemoState {
  if (typeof window === 'undefined') return getDefaultState();
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) return JSON.parse(saved);
  } catch {
    // ignore
  }
  return getDefaultState();
}

function saveState(state: DemoState): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // ignore
  }
}

let state: DemoState = getDefaultState();

export function initDemoStore() {
  state = loadState();

  // Clean up any non-UUID entries (such as human challan numbers) from showhouse_deleted_challans in localStorage
  if (typeof window !== 'undefined') {
    try {
      const raw = localStorage.getItem(DELETED_CHALLANS_KEY);
      if (raw) {
        const arr = JSON.parse(raw);
        if (Array.isArray(arr)) {
          const cleaned = arr.filter((item: string) => isUuid(item));
          if (cleaned.length !== arr.length) {
            localStorage.setItem(DELETED_CHALLANS_KEY, JSON.stringify(cleaned));
          }
        }
      }
    } catch {}
  }
}

// ============================================================
// Business Profile
// ============================================================

export function getProfile(): BusinessProfile | null {
  if (state.profile && (!state.profile.employees || !Array.isArray(state.profile.employees))) {
    state.profile.employees = ['Neal', 'Vrushank'];
  }
  return state.profile;
}

export function syncProfile(remoteProfile: BusinessProfile): void {
  if (!remoteProfile) return;
  state.profile = {
    ...state.profile,
    ...remoteProfile,
    employees:
      remoteProfile.employees && remoteProfile.employees.length > 0
        ? remoteProfile.employees
        : state.profile?.employees || ['Neal', 'Vrushank'],
  };
  state.isSetupComplete = true;
  saveState(state);
}

export function isSetupComplete(): boolean {
  return state.isSetupComplete;
}

export function saveProfile(data: Partial<BusinessProfile>): BusinessProfile {
  const now = new Date().toISOString();
  if (state.profile) {
    state.profile = {
      ...state.profile,
      ...data,
      employees: data.employees || state.profile.employees || ['Neal', 'Vrushank'],
      updated_at: now,
    };
  } else {
    state.profile = {
      id: generateId(),
      user_id: 'demo-user',
      business_name: 'SHOWHOUSE',
      tagline: 'Decor Studio',
      legal_name: 'Showhouse Concept & Design LLP',
      logo_url: '/logo.png',
      address: 'Vishram Baug, Near Makhmali Talao, LBS Marg, Thane (W) - 400602',
      phone: '+91 93248 69306 / 022 - 2538 7683',
      email: 'foxshowhouse@gmail.com',
      gstin: '27ACMF53838C1ZY',
      challan_prefix: 'SH',
      financial_year_start_month: 4,
      default_unit: 'sheets',
      footer_message: 'Thank you for your business!',
      show_rate_column: true,
      show_amount_column: true,
      show_signature_area: true,
      show_prepared_by: true,
      employees: data.employees || ['Neal', 'Vrushank'],
      created_at: now,
      updated_at: now,
      ...data,
    } as BusinessProfile;
  }
  state.isSetupComplete = true;
  saveState(state);
  if (state.profile) {
    saveProfileToFirebase(state.profile).catch((err) =>
      console.warn('Firebase profile sync:', err)
    );
  }
  return state.profile;
}

// ============================================================
// Customers
// ============================================================

export function getCustomers(search?: string): Customer[] {
  let customers = state.customers.filter((c) => c.is_active);
  if (search) {
    const q = search.toLowerCase();
    customers = customers.filter(
      (c) =>
        c.business_name.toLowerCase().includes(q) ||
        c.phone.includes(q) ||
        (c.contact_person && c.contact_person.toLowerCase().includes(q))
    );
  }
  return customers.sort(
    (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
  );
}

export function getCustomer(id: string): Customer | undefined {
  return state.customers.find((c) => c.id === id);
}

export function createCustomer(data: Partial<Customer>): Customer {
  const now = new Date().toISOString();
  const customer: Customer = {
    id: generateId(),
    user_id: 'demo-user',
    business_name: '',
    contact_person: null,
    phone: '',
    billing_address: '',
    delivery_address: null,
    gstin: null,
    notes: null,
    is_active: true,
    created_at: now,
    updated_at: now,
    ...data,
  } as Customer;
  state.customers.push(customer);
  saveState(state);
  saveCustomerToFirebase(customer).catch((err) =>
    console.warn('Firebase saveCustomer sync:', err)
  );
  return customer;
}

export function updateCustomer(id: string, data: Partial<Customer>): Customer | null {
  const idx = state.customers.findIndex((c) => c.id === id);
  if (idx === -1) return null;
  state.customers[idx] = {
    ...state.customers[idx],
    ...data,
    updated_at: new Date().toISOString(),
  };
  saveState(state);
  saveCustomerToFirebase(state.customers[idx]).catch((err) =>
    console.warn('Firebase updateCustomer sync:', err)
  );
  return state.customers[idx];
}

export function deleteCustomer(id: string): boolean {
  const idx = state.customers.findIndex((c) => c.id === id);
  if (idx === -1) return false;
  state.customers[idx].is_active = false;
  saveState(state);
  deleteCustomerFromFirebase(id).catch((err) =>
    console.warn('Firebase deleteCustomer sync:', err)
  );
  return true;
}

export function syncCustomersFromFirebase(remoteCustomers: Customer[]): void {
  if (!remoteCustomers || !Array.isArray(remoteCustomers) || remoteCustomers.length === 0) return;
  const map = new Map<string, Customer>();
  state.customers.forEach((c) => map.set(c.id, c));
  remoteCustomers.forEach((rc) => {
    const existing = map.get(rc.id);
    if (!existing) {
      map.set(rc.id, rc);
    } else {
      const tLocal = new Date(existing.updated_at || existing.created_at || 0).getTime();
      const tRemote = new Date(rc.updated_at || rc.created_at || 0).getTime();
      if (tRemote >= tLocal) {
        map.set(rc.id, rc);
      }
    }
  });
  state.customers = Array.from(map.values()).sort(
    (a, b) => new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime()
  );
  saveState(state);
}

// ============================================================
// Products
// ============================================================

export function getProducts(search?: string): Product[] {
  let products = state.products.filter((p) => p.is_active);
  if (search) {
    const q = search.toLowerCase();
    products = products.filter(
      (p) =>
        p.name.toLowerCase().includes(q) ||
        (p.brand && p.brand.toLowerCase().includes(q)) ||
        (p.sku && p.sku.toLowerCase().includes(q))
    );
  }
  return products.sort(
    (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
  );
}

export function getProduct(id: string): Product | undefined {
  return state.products.find((p) => p.id === id);
}

export function createProduct(data: Partial<Product>): Product {
  const now = new Date().toISOString();
  const product: Product = {
    id: generateId(),
    user_id: 'demo-user',
    name: '',
    brand: null,
    sku: null,
    colour_design: null,
    size_thickness: null,
    unit: 'sheets',
    default_rate: null,
    is_active: true,
    created_at: now,
    updated_at: now,
    ...data,
  } as Product;
  state.products.push(product);
  saveState(state);
  saveProductToFirebase(product).catch((err) =>
    console.warn('Firebase saveProduct sync:', err)
  );
  return product;
}

export function updateProduct(id: string, data: Partial<Product>): Product | null {
  const idx = state.products.findIndex((p) => p.id === id);
  if (idx === -1) return null;
  state.products[idx] = {
    ...state.products[idx],
    ...data,
    updated_at: new Date().toISOString(),
  };
  saveState(state);
  saveProductToFirebase(state.products[idx]).catch((err) =>
    console.warn('Firebase updateProduct sync:', err)
  );
  return state.products[idx];
}

export function deleteProduct(id: string): boolean {
  const idx = state.products.findIndex((p) => p.id === id);
  if (idx === -1) return false;
  state.products[idx].is_active = false;
  saveState(state);
  deleteProductFromFirebase(id).catch((err) =>
    console.warn('Firebase deleteProduct sync:', err)
  );
  return true;
}

export function syncProductsFromFirebase(remoteProducts: Product[]): void {
  if (!remoteProducts || !Array.isArray(remoteProducts) || remoteProducts.length === 0) return;
  const map = new Map<string, Product>();
  state.products.forEach((p) => map.set(p.id, p));
  remoteProducts.forEach((rp) => {
    const existing = map.get(rp.id);
    if (!existing) {
      map.set(rp.id, rp);
    } else {
      const tLocal = new Date(existing.updated_at || existing.created_at || 0).getTime();
      const tRemote = new Date(rp.updated_at || rp.created_at || 0).getTime();
      if (tRemote >= tLocal) {
        map.set(rp.id, rp);
      }
    }
  });
  state.products = Array.from(map.values()).sort(
    (a, b) => new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime()
  );
  saveState(state);
}

// ============================================================
// Challans
// ============================================================

export function peekNextChallanNumber(): string {
  const profile = state.profile;
  const prefix = profile?.challan_prefix || 'SH';
  const startMonth = profile?.financial_year_start_month || 4;
  const fy = getFinancialYear(new Date(), startMonth);

  let maxSeq = 0;
  const prefixFyPattern = new RegExp(`^${prefix}\\/${fy}\\/(\\d+)$`, 'i');

  for (const c of state.challans) {
    if (c.challan_number) {
      const m = c.challan_number.match(prefixFyPattern);
      if (m && m[1]) {
        const num = parseInt(m[1], 10);
        if (!isNaN(num) && num > maxSeq) {
          maxSeq = num;
        }
      }
    }
  }

  if (state.challanSequence > maxSeq) {
    maxSeq = state.challanSequence;
  }

  let nextSeq = maxSeq + 1;
  while (state.challans.some((c) => c.challan_number === generateChallanNumber(prefix, fy, nextSeq) && !c.is_deleted)) {
    nextSeq++;
  }

  return generateChallanNumber(prefix, fy, nextSeq);
}

export function getNextChallanNumber(): string {
  const profile = state.profile;
  const prefix = profile?.challan_prefix || 'SH';
  const startMonth = profile?.financial_year_start_month || 4;
  const fy = getFinancialYear(new Date(), startMonth);

  let maxSeq = 0;
  const prefixFyPattern = new RegExp(`^${prefix}\\/${fy}\\/(\\d+)$`, 'i');

  for (const c of state.challans) {
    if (c.challan_number) {
      const m = c.challan_number.match(prefixFyPattern);
      if (m && m[1]) {
        const num = parseInt(m[1], 10);
        if (!isNaN(num) && num > maxSeq) {
          maxSeq = num;
        }
      }
    }
  }

  if (state.challanSequence > maxSeq) {
    maxSeq = state.challanSequence;
  }

  let nextSeq = maxSeq + 1;
  while (state.challans.some((c) => c.challan_number === generateChallanNumber(prefix, fy, nextSeq) && !c.is_deleted)) {
    nextSeq++;
  }

  state.challanSequence = nextSeq;
  saveState(state);
  return generateChallanNumber(prefix, fy, nextSeq);
}

export function getChallans(filters?: {
  search?: string;
  status?: ChallanStatus;
  shareStatus?: ShareStatus;
  fromDate?: string;
  toDate?: string;
  customerId?: string;
}): Challan[] {
  let challans = state.challans.filter((c) => c.status !== 'void' && !c.is_deleted);

  if (filters) {
    if (filters.search) {
      const q = filters.search.toLowerCase().trim();
      if (q) {
        challans = challans.filter(
          (c) =>
            (c.challan_number && c.challan_number.toLowerCase().includes(q)) ||
            (c.customer_name && c.customer_name.toLowerCase().includes(q)) ||
            (c.customer_phone && c.customer_phone.toLowerCase().includes(q)) ||
            (c.reference_number && c.reference_number.toLowerCase().includes(q)) ||
            (c.created_by && c.created_by.toLowerCase().includes(q)) ||
            (c.prepared_by && c.prepared_by.toLowerCase().includes(q)) ||
            (c.items &&
              c.items.some(
                (it) => it.item_description && it.item_description.toLowerCase().includes(q)
              ))
        );
      }
    }
    if (filters.status) {
      challans = challans.filter((c) => c.status === filters.status);
    }
    if (filters.shareStatus) {
      challans = challans.filter((c) => c.share_status === filters.shareStatus);
    }
    if (filters.fromDate) {
      challans = challans.filter((c) => (c.challan_date || '') >= filters.fromDate!);
    }
    if (filters.toDate) {
      challans = challans.filter((c) => (c.challan_date || '') <= filters.toDate!);
    }
    if (filters.customerId) {
      challans = challans.filter((c) => c.customer_id === filters.customerId);
    }
  }

  // Ensure items are populated for every returned challan
  return challans
    .map((c) => {
      if (!c.items || c.items.length === 0) {
        const items = state.challanItems
          .filter((i) => i.challan_id === c.id)
          .sort((a, b) => (a.serial_number || 0) - (b.serial_number || 0));
        if (items.length > 0) {
          return { ...c, items };
        }
      }
      return c;
    })
    .sort(
      (a, b) =>
        new Date(b.created_at || b.challan_date || 0).getTime() -
        new Date(a.created_at || a.challan_date || 0).getTime()
    );
}

export function getChallan(id: string): Challan | undefined {
  if (!id) return undefined;
  const challan = state.challans.find((c) => c.id === id || c.challan_number === id);
  if (challan) {
    const items = state.challanItems
      .filter((i) => i.challan_id === challan.id)
      .sort((a, b) => (a.serial_number || 0) - (b.serial_number || 0));
    return {
      ...challan,
      items: items.length > 0 ? items : challan.items || [],
    };
  }
  return undefined;
}

export function createChallan(
  data: Partial<Challan>,
  items: Partial<ChallanItem>[]
): Challan {
  const now = new Date().toISOString();
  const challanId = data.id || generateId();

  // Assign or validate unique challan number
  let challanNumber = data.challan_number;
  const isDuplicateNumber =
    challanNumber &&
    state.challans.some(
      (c) => c.challan_number === challanNumber && c.id !== challanId && !c.is_deleted
    );

  if (!challanNumber || isDuplicateNumber) {
    challanNumber = getNextChallanNumber();
  }

  // If a specific challan_number was provided, make sure state.challanSequence tracks it
  const prefix = state.profile?.challan_prefix || 'SH';
  const startMonth = state.profile?.financial_year_start_month || 4;
  const fy = getFinancialYear(new Date(), startMonth);
  const m = challanNumber.match(new RegExp(`^${prefix}\\/${fy}\\/(\\d+)$`, 'i'));
  if (m && m[1]) {
    const parsed = parseInt(m[1], 10);
    if (!isNaN(parsed) && parsed > state.challanSequence) {
      state.challanSequence = parsed;
    }
  }

  // Calculate totals
  let totalQuantity = 0;
  let totalAmount: number | null = null;

  const challanItems: ChallanItem[] = items.map((item, idx) => {
    const qty = Number(item.quantity) || 0;
    totalQuantity += qty;
    const rate = Number(item.rate) || 0;
    const amount = rate > 0 ? qty * rate : null;
    if (amount !== null) {
      totalAmount = (totalAmount || 0) + amount;
    }

    return {
      id: item.id || generateId(),
      challan_id: challanId,
      serial_number: idx + 1,
      product_id: item.product_id || null,
      item_description: item.item_description || '',
      brand: item.brand || null,
      colour_finish: item.colour_finish || null,
      size: item.size || null,
      unit: item.unit || 'sheets',
      quantity: qty,
      rate: rate > 0 ? rate : null,
      amount: amount,
      created_at: now,
    } as ChallanItem;
  });

  const transport = Number(data.transportation_charges) || 0;
  const loading = Number(data.loading_charges) || 0;
  const applyGst = Boolean(data.apply_gst);
  const applyAdditional9 = Boolean(data.apply_additional_9);

  const itemsTotal = totalAmount || 0;
  const subtotal = itemsTotal + transport + loading;
  const cgst = applyGst && subtotal > 0 ? Math.round(subtotal * 0.09 * 100) / 100 : 0;
  const sgst = applyGst && subtotal > 0 ? Math.round(subtotal * 0.09 * 100) / 100 : 0;
  const additional9 = applyAdditional9 && subtotal > 0 ? Math.round(subtotal * 0.09 * 100) / 100 : 0;
  const finalTotal =
    data.total_amount !== undefined && data.total_amount !== null
      ? data.total_amount
      : subtotal > 0
      ? subtotal + cgst + sgst + additional9
      : null;

  const challan: Challan = {
    id: challanId,
    user_id: 'demo-user',
    challan_number: challanNumber,
    challan_date: data.challan_date || getTodayISO(),
    customer_id: data.customer_id || '',
    customer_name: data.customer_name || 'Walk-in Customer',
    customer_phone: data.customer_phone || '',
    customer_address: data.customer_address || '',
    customer_gstin: data.customer_gstin || null,
    delivery_address: data.delivery_address || data.customer_address || '',
    reference_number: data.reference_number || null,
    notes: data.notes || null,
    prepared_by: data.prepared_by || data.created_by || state.profile?.employees?.[0] || 'Neal',
    created_by: data.created_by || data.prepared_by || state.profile?.employees?.[0] || 'Neal',
    status: data.status || 'draft',
    share_status: data.share_status || 'not_shared',
    total_quantity: totalQuantity,
    subtotal_amount: subtotal > 0 ? subtotal : null,
    transportation_charges: transport > 0 ? transport : null,
    loading_charges: loading > 0 ? loading : null,
    apply_gst: applyGst,
    cgst_amount: cgst > 0 ? cgst : null,
    sgst_amount: sgst > 0 ? sgst : null,
    apply_additional_9: applyAdditional9,
    additional_9_amount: additional9 > 0 ? additional9 : null,
    total_amount: finalTotal,
    created_at: data.created_at || now,
    updated_at: now,
    items: challanItems,
  } as Challan;

  // Insert or update in state.challans
  const existingIdx = state.challans.findIndex((c) => c.id === challanId);
  if (existingIdx >= 0) {
    state.challans[existingIdx] = challan;
  } else {
    state.challans.push(challan);
  }

  // Update state.challanItems
  state.challanItems = state.challanItems.filter((i) => i.challan_id !== challanId);
  state.challanItems.push(...challanItems);

  // Log activity
  addActivityLog(challanId, 'created', `Challan ${challanNumber} created as ${data.status || 'draft'}`);

  saveState(state);
  saveChallanToFirebase(challan).catch((err) =>
    console.warn('Firebase saveChallan sync:', err)
  );
  broadcastChallansUpdate(state.challans);
  return challan;
}

export function updateChallan(
  id: string,
  data: Partial<Challan>,
  items?: Partial<ChallanItem>[]
): Challan | null {
  const idx = state.challans.findIndex((c) => c.id === id);
  if (idx === -1) return null;
  const now = new Date().toISOString();

  if (items) {
    // Remove old items
    state.challanItems = state.challanItems.filter((i) => i.challan_id !== id);

    // Add new items
    let totalQuantity = 0;
    let totalAmount: number | null = null;

    const newItems: ChallanItem[] = items.map((item, i) => {
      const qty = Number(item.quantity) || 0;
      totalQuantity += qty;
      const rate = Number(item.rate) || 0;
      const amount = rate > 0 ? qty * rate : null;
      if (amount !== null) {
        totalAmount = (totalAmount || 0) + amount;
      }
      return {
        id: generateId(),
        challan_id: id,
        serial_number: i + 1,
        product_id: item.product_id || null,
        item_description: item.item_description || '',
        brand: item.brand || null,
        colour_finish: item.colour_finish || null,
        size: item.size || null,
        unit: item.unit || 'sheets',
        quantity: qty,
        rate: rate > 0 ? rate : null,
        amount: amount,
        created_at: now,
      } as ChallanItem;
    });

    const transport =
      data.transportation_charges !== undefined
        ? Number(data.transportation_charges) || 0
        : Number(state.challans[idx].transportation_charges) || 0;
    const loading =
      data.loading_charges !== undefined
        ? Number(data.loading_charges) || 0
        : Number(state.challans[idx].loading_charges) || 0;
    const applyGst =
      data.apply_gst !== undefined
        ? Boolean(data.apply_gst)
        : Boolean(state.challans[idx].apply_gst);
    const applyAdditional9 =
      data.apply_additional_9 !== undefined
        ? Boolean(data.apply_additional_9)
        : Boolean(state.challans[idx].apply_additional_9);

    const itemsTotal = totalAmount !== null ? totalAmount : 0;
    const subtotal = itemsTotal + transport + loading;
    const cgst = applyGst && subtotal > 0 ? Math.round(subtotal * 0.09 * 100) / 100 : 0;
    const sgst = applyGst && subtotal > 0 ? Math.round(subtotal * 0.09 * 100) / 100 : 0;
    const additional9 = applyAdditional9 && subtotal > 0 ? Math.round(subtotal * 0.09 * 100) / 100 : 0;
    const finalTotal =
      data.total_amount !== undefined && data.total_amount !== null
        ? data.total_amount
        : subtotal > 0
        ? subtotal + cgst + sgst + additional9
        : null;

    state.challanItems.push(...newItems);
    data.total_quantity = totalQuantity;
    data.subtotal_amount = subtotal > 0 ? subtotal : null;
    data.transportation_charges = transport > 0 ? transport : null;
    data.loading_charges = loading > 0 ? loading : null;
    data.apply_gst = applyGst;
    data.cgst_amount = cgst > 0 ? cgst : null;
    data.sgst_amount = sgst > 0 ? sgst : null;
    data.apply_additional_9 = applyAdditional9;
    data.additional_9_amount = additional9 > 0 ? additional9 : null;
    data.total_amount = finalTotal;
  }

  state.challans[idx] = {
    ...state.challans[idx],
    ...data,
    updated_at: now,
  };

  addActivityLog(id, 'updated', `Challan updated`);
  saveState(state);

  const updated = getChallan(id);
  if (updated) {
    saveChallanToFirebase(updated).catch((err) =>
      console.warn('Firebase updateChallan sync:', err)
    );
  }
  broadcastChallansUpdate(state.challans);

  return updated || null;
}

export function updateChallanStatus(id: string, status: ChallanStatus): Challan | null {
  const idx = state.challans.findIndex((c) => c.id === id);
  if (idx === -1) return null;
  state.challans[idx].status = status;
  state.challans[idx].updated_at = new Date().toISOString();
  addActivityLog(id, `status_changed`, `Status changed to ${status}`);
  saveState(state);
  const updated = getChallan(id);
  if (updated) {
    saveChallanToFirebase(updated).catch((err) =>
      console.warn('Firebase statusChallan sync:', err)
    );
  }
  broadcastChallansUpdate(state.challans);
  return state.challans[idx];
}

export function updateShareStatus(id: string, shareStatus: ShareStatus): Challan | null {
  const idx = state.challans.findIndex((c) => c.id === id);
  if (idx === -1) return null;
  state.challans[idx].share_status = shareStatus;
  state.challans[idx].updated_at = new Date().toISOString();
  addActivityLog(id, `share_${shareStatus}`, `Share status: ${shareStatus}`);
  saveState(state);
  const updated = getChallan(id);
  if (updated) {
    saveChallanToFirebase(updated).catch((err) =>
      console.warn('Firebase shareStatus sync:', err)
    );
  }
  broadcastChallansUpdate(state.challans);
  return state.challans[idx];
}

export function deleteChallan(id: string): boolean {
  const initialLen = state.challans.length;

  // Record strictly document UUID into persistent deleted identifiers set
  recordDeletedChallan(id);

  // Remove from in-memory state
  state.challans = state.challans.filter((c) => c.id !== id);
  state.challanItems = state.challanItems.filter((i) => i.challan_id !== id);
  state.activityLog = state.activityLog.filter((l) => l.challan_id !== id);
  saveState(state);

  deleteChallanFromFirebase(id).catch((err) =>
    console.warn('Firebase deleteChallan sync:', err)
  );
  broadcastChallansUpdate(state.challans);
  return state.challans.length < initialLen;
}

export function syncFromFirebase(firebaseChallans: Challan[]): void {
  if (!firebaseChallans || !Array.isArray(firebaseChallans)) return;

  const deletedSet = getDeletedChallanIdentifiers();

  // Filter out any challans that have been deleted locally or marked is_deleted
  const activeRemote = firebaseChallans.filter(
    (c) => !c.is_deleted && !deletedSet.has(c.id)
  );

  // If remote is empty and we have local challans, DO NOT wipe local challans!
  if (activeRemote.length === 0 && state.challans.length > 0) {
    return;
  }

  // Merge local and remote safely
  const map = new Map<string, Challan>();

  // 1. Keep existing local non-deleted challans
  state.challans.forEach((c) => {
    if (!c.is_deleted && !deletedSet.has(c.id)) {
      map.set(c.id, c);
    }
  });

  // 2. Overlay remote challans (take newer if conflict)
  activeRemote.forEach((rc) => {
    const existing = map.get(rc.id);
    if (!existing) {
      map.set(rc.id, rc);
    } else {
      const tLocal = new Date(existing.updated_at || existing.created_at || 0).getTime();
      const tRemote = new Date(rc.updated_at || rc.created_at || 0).getTime();
      if (tRemote >= tLocal) {
        map.set(rc.id, rc);
      }
    }
  });

  const merged = Array.from(map.values());
  state.challans = merged.sort((a, b) => {
    const da = new Date(b.challan_date || b.created_at || 0).getTime();
    const db = new Date(a.challan_date || a.created_at || 0).getTime();
    return da - db;
  });

  const allItems: ChallanItem[] = [];
  state.challans.forEach((fc) => {
    if (fc.items && Array.isArray(fc.items)) {
      allItems.push(...fc.items);
    }
  });
  if (allItems.length > 0) {
    state.challanItems = allItems;
  }

  // Update sequence to the maximum of existing challans
  const prefix = state.profile?.challan_prefix || 'SH';
  const startMonth = state.profile?.financial_year_start_month || 4;
  const fy = getFinancialYear(new Date(), startMonth);
  const prefixFyPattern = new RegExp(`^${prefix}\\/${fy}\\/(\\d+)$`, 'i');
  let maxSeq = state.challanSequence || 0;
  for (const c of state.challans) {
    if (c.challan_number) {
      const m = c.challan_number.match(prefixFyPattern);
      if (m && m[1]) {
        const num = parseInt(m[1], 10);
        if (!isNaN(num) && num > maxSeq) {
          maxSeq = num;
        }
      }
    }
  }
  state.challanSequence = maxSeq;

  saveState(state);
}

export function duplicateChallan(id: string): Challan | null {
  const original = getChallan(id);
  if (!original) return null;

  const items = (original.items || []).map((item) => ({
    product_id: item.product_id,
    item_description: item.item_description,
    brand: item.brand,
    colour_finish: item.colour_finish,
    size: item.size,
    unit: item.unit,
    quantity: item.quantity,
    rate: item.rate,
  }));

  return createChallan(
    {
      challan_date: getTodayISO(),
      customer_id: original.customer_id,
      customer_name: original.customer_name,
      customer_phone: original.customer_phone,
      customer_address: original.customer_address,
      customer_gstin: original.customer_gstin,
      delivery_address: original.delivery_address,
      reference_number: original.reference_number,
      notes: original.notes,
      prepared_by: original.prepared_by,
      status: 'draft',
    },
    items
  );
}

// ============================================================
// Activity Log
// ============================================================

function addActivityLog(challanId: string, action: string, details: string): void {
  state.activityLog.push({
    id: generateId(),
    challan_id: challanId,
    user_id: 'demo-user',
    action,
    details,
    created_at: new Date().toISOString(),
  });
}

export function getActivityLog(challanId: string): ChallanActivityLog[] {
  return state.activityLog
    .filter((l) => l.challan_id === challanId)
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
}

// ============================================================
// Dashboard Stats
// ============================================================

export function getDashboardStats(): DashboardStats {
  const today = getTodayISO();
  const thisMonthStart = today.slice(0, 7); // YYYY-MM

  const activeChallans = state.challans.filter((c) => c.status !== 'void');

  return {
    totalChallans: activeChallans.length,
    challansToday: activeChallans.filter((c) => c.challan_date === today).length,
    challansThisMonth: activeChallans.filter((c) =>
      c.challan_date.startsWith(thisMonthStart)
    ).length,
    recentChallans: activeChallans
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
      .slice(0, 10),
  };
}

// ============================================================
// Seed Data
// ============================================================

export function seedDemoData(): void {
  if (typeof window !== 'undefined' && localStorage.getItem(DEMO_SEEDED_KEY)) {
    return; // Already seeded once, do not resurrect deleted demo challans
  }
  if (state.customers.length > 0) return; // Already seeded

  if (typeof window !== 'undefined') {
    localStorage.setItem(DEMO_SEEDED_KEY, 'true');
  }

  // Create demo profile
  saveProfile({
    business_name: 'SHOWHOUSE',
    tagline: 'Decor Studio',
    legal_name: 'Showhouse Concept & Design LLP',
    logo_url: '/logo.png',
    address: 'Vishram Baug, Near Makhmali Talao, LBS Marg, Thane (W) - 400602',
    phone: '+91 93248 69306 / 022 - 2538 7683',
    email: 'foxshowhouse@gmail.com',
    gstin: '27ACMF53838C1ZY',
    challan_prefix: 'SH',
    financial_year_start_month: 4,
    default_unit: 'sheets',
    footer_message: 'Thank you for choosing Showhouse Decor Studio!',
    show_rate_column: true,
    show_amount_column: true,
    show_signature_area: true,
    show_prepared_by: true,
  });

  // Create demo customers
  const c0 = createCustomer({
    business_name: 'Harshad Fadnis Sir',
    contact_person: 'Harshad Fadnis',
    phone: '9819098961',
    billing_address: '314, 3rd floor, Blue Nile Commercial Complex, Thane (W)',
    delivery_address: '314, 3rd floor, Blue Nile Commercial Complex, Thane (W)',
  });

  const c1 = createCustomer({
    business_name: 'Sharma Interiors',
    contact_person: 'Rajesh Sharma',
    phone: '9812345678',
    billing_address: 'Shop No. 45, Furniture Market\nSector 34, Chandigarh',
    delivery_address: 'Plot 22, Phase 7, Industrial Area, Mohali',
    gstin: '03AADCS5678F2ZP',
  });

  const c2 = createCustomer({
    business_name: 'Modern Kitchen Studio',
    contact_person: 'Priya Mehta',
    phone: '9988776655',
    billing_address: '201, Mall Road\nLudhiana, Punjab',
  });

  const c3 = createCustomer({
    business_name: 'Gupta Plywood & Laminates',
    contact_person: 'Amit Gupta',
    phone: '9123456789',
    billing_address: '78, Timber Market\nYamunanagar, Haryana',
    gstin: '06AADCG1234H1ZK',
  });

  // Create demo products
  const p1 = createProduct({
    name: 'Century Laminates - Walnut Matte',
    brand: 'Century',
    sku: 'CEN-WM-001',
    colour_design: 'Walnut',
    size_thickness: '8x4 ft / 0.8mm',
    unit: 'sheets',
    default_rate: 1450,
  });

  const p2 = createProduct({
    name: 'Greenlam HPL - White Glossy',
    brand: 'Greenlam',
    sku: 'GL-WG-102',
    colour_design: 'White Glossy',
    size_thickness: '8x4 ft / 1mm',
    unit: 'sheets',
    default_rate: 1800,
  });

  const p3 = createProduct({
    name: 'Merino Laminates - Oak Texture',
    brand: 'Merino',
    sku: 'MER-OT-205',
    colour_design: 'Natural Oak',
    size_thickness: '8x4 ft / 0.8mm',
    unit: 'sheets',
    default_rate: 1350,
  });

  createProduct({
    name: 'Royale Touche - Marble Finish',
    brand: 'Royale Touche',
    sku: 'RT-MF-310',
    colour_design: 'Carrara Marble',
    size_thickness: '8x4 ft / 1mm',
    unit: 'sheets',
    default_rate: 2100,
  });

  createProduct({
    name: 'Sundek Acrylic Sheet',
    brand: 'Sundek',
    sku: 'SDK-AS-401',
    colour_design: 'Solid White',
    size_thickness: '8x4 ft / 1.5mm',
    unit: 'sheets',
    default_rate: 3200,
  });

  // Create demo challans
  createChallan(
    {
      challan_date: '2026-03-02',
      customer_id: c0.id,
      customer_name: c0.business_name,
      customer_phone: c0.phone,
      customer_address: c0.billing_address,
      delivery_address: c0.delivery_address,
      reference_number: '0120',
      notes: 'Confirm By Rushank',
      prepared_by: 'Rushank',
      status: 'final',
    },
    [
      {
        item_description: 'Vinyl flooring',
        unit: 'running ft',
        quantity: 250,
        rate: 58,
        amount: 16240,
      },
    ]
  );

  createChallan(
    {
      challan_date: '2026-10-20',
      customer_id: c1.id,
      customer_name: c1.business_name,
      customer_phone: c1.phone,
      customer_address: c1.billing_address,
      customer_gstin: c1.gstin,
      delivery_address: c1.delivery_address,
      notes: 'Handle with care. Delivery before 5 PM.',
      prepared_by: 'Rahul',
      status: 'final',
    },
    [
      {
        product_id: p1.id,
        item_description: p1.name,
        brand: p1.brand,
        unit: p1.unit,
        quantity: 25,
        rate: 1450,
        amount: 36250,
      },
      {
        product_id: p2.id,
        item_description: p2.name,
        brand: p2.brand,
        unit: p2.unit,
        quantity: 15,
        rate: 1800,
        amount: 27000,
      },
    ]
  );

  createChallan(
    {
      challan_date: '2026-10-19',
      customer_id: c2.id,
      customer_name: c2.business_name,
      customer_phone: c2.phone,
      customer_address: c2.billing_address,
      notes: 'Kitchen modular project delivery.',
      status: 'final',
      share_status: 'user_marked_sent',
    },
    [
      {
        product_id: p3.id,
        item_description: p3.name,
        brand: p3.brand,
        unit: p3.unit,
        quantity: 30,
        rate: 1350,
        amount: 40500,
      },
    ]
  );

  createChallan(
    {
      challan_date: '2026-10-20',
      customer_id: c3.id,
      customer_name: c3.business_name,
      customer_phone: c3.phone,
      customer_address: c3.billing_address,
      customer_gstin: c3.gstin,
      reference_number: 'PO-2026-112',
      status: 'draft',
    },
    [
      {
        item_description: 'Assorted Laminate Samples',
        unit: 'pieces',
        quantity: 50,
        rate: 120,
        amount: 6000,
      },
      {
        product_id: p1.id,
        item_description: p1.name,
        brand: p1.brand,
        unit: p1.unit,
        quantity: 10,
        rate: 1450,
        amount: 14500,
      },
    ]
  );

  saveState(state);
}

// ============================================================
// Customer challan history
// ============================================================
export function getCustomerChallans(customerId: string): Challan[] {
  return state.challans
    .filter((c) => c.customer_id === customerId && c.status !== 'void')
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
}

// ============================================================
// Reset demo data
// ============================================================
export function importBackupData(parsed: {
  profile?: BusinessProfile;
  customers?: Customer[];
  products?: Product[];
  challans?: Challan[];
}): void {
  if (parsed.profile) {
    state.profile = parsed.profile;
    saveProfileToFirebase(parsed.profile).catch(() => {});
  }
  if (Array.isArray(parsed.customers) && parsed.customers.length > 0) {
    state.customers = parsed.customers;
  }
  if (Array.isArray(parsed.products) && parsed.products.length > 0) {
    state.products = parsed.products;
  }
  if (Array.isArray(parsed.challans) && parsed.challans.length > 0) {
    state.challans = parsed.challans;
    const allItems: ChallanItem[] = [];
    parsed.challans.forEach((c) => {
      if (c.items && Array.isArray(c.items)) {
        allItems.push(...c.items);
      }
      // Save each challan to the server database
      saveChallanToFirebase(c).catch(() => {});
    });
    state.challanItems = allItems;
  }
  state.isSetupComplete = true;
  saveState(state);
  broadcastChallansUpdate(state.challans);
}

export function clearAllData(): void {
  state = getDefaultState();
  saveState(state);
}
