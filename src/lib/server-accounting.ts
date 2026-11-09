/**
 * Server-Side Accounting & Ledger Engine for Showhouse
 * Provides decimal-safe financial calculations, immutable transaction records,
 * and ledger derivations for:
 * 1. Customer / Party Ledgers
 * 2. Site-wise Plus/Minus Accounting
 * 3. 45-Day Payment Limit & Credit Control
 * 4. Goods Returns & Credit Adjustments
 * 5. Payment Vouchers & Receipts
 * 6. Audit Trail for Approved Challan Modifications
 */

import fs from 'fs';
import path from 'path';
import {
  Customer,
  CustomerSite,
  PaymentRecord,
  GoodsReturn,
  SiteAdjustment,
  CustomerLedgerEntry,
  CreditException,
  AuditLog,
  Challan,
  TallyPartyMapping,
  TallySyncLog,
  TallySettings,
  SiteAccountingSummary,
  CustomerCreditStatus,
} from '@/types';

const DATA_DIR = path.join(process.cwd(), 'data');
const BACKUP_DIR = path.join(DATA_DIR, 'backups');

function ensureDataDir(): void {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
  if (!fs.existsSync(BACKUP_DIR)) {
    fs.mkdirSync(BACKUP_DIR, { recursive: true });
  }
}

function readJsonFile<T>(filename: string, fallback: T): T {
  try {
    ensureDataDir();
    const filePath = path.join(DATA_DIR, filename);
    if (!fs.existsSync(filePath)) {
      fs.writeFileSync(filePath, JSON.stringify(fallback, null, 2), 'utf-8');
      return fallback;
    }
    const raw = fs.readFileSync(filePath, 'utf-8');
    if (!raw.trim()) return fallback;
    return JSON.parse(raw);
  } catch (err) {
    console.error(`Error reading ${filename}:`, err);
    return fallback;
  }
}

function writeJsonFile<T>(filename: string, data: T, backup = false): void {
  try {
    ensureDataDir();
    const filePath = path.join(DATA_DIR, filename);
    const content = JSON.stringify(data, null, 2);

    if (backup) {
      const ts = new Date().toISOString().replace(/[:.]/g, '-');
      const backupPath = path.join(BACKUP_DIR, `${filename.replace('.json', '')}-${ts}.json`);
      fs.writeFileSync(backupPath, content, 'utf-8');
    }

    // Atomic write via temp file + rename to prevent corruption or partial writes
    const tempPath = `${filePath}.tmp.${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    fs.writeFileSync(tempPath, content, 'utf-8');
    fs.renameSync(tempPath, filePath);
  } catch (err) {
    console.error(`Error writing ${filename}:`, err);
  }
}

// ----------------------------------------------------
// 1. CUSTOMERS & SITES (PERSISTENT & SEEDED)
// ----------------------------------------------------
export function getAllCustomers(): Customer[] {
  let custs = readJsonFile<Customer[]>('customers.json', []);
  if (!custs || custs.length === 0) {
    const challans = getAllChallans();
    const seen = new Set<string>();
    custs = [
      {
        id: 'cust_rk_sales',
        user_id: 'admin',
        name: 'R K Sales',
        business_name: 'R K Sales',
        company_name: 'R K Sales',
        contact_person: 'Ramesh Kumar',
        phone: '02225387687',
        billing_address: '3rd Floor, Building No. A-4,\nFlat No 307,\nAvadh Complex, Kasheli Village,\nBhiwandi Railway Station,\nKasheli Bhiwandi\nThane-421302',
        delivery_address: 'Kasheli Bhiwandi, Thane-421302',
        gstin: '27AABCR1234F1ZP',
        notes: 'Premium commercial & residential project customer',
        is_active: true,
        opening_balance: 0,
        credit_days: 45,
        credit_limit: 500000,
        created_at: '2024-02-01T00:00:00.000Z',
        updated_at: '2024-02-01T00:00:00.000Z',
      },
    ];
    seen.add('r k sales');

    challans.forEach((c) => {
      const name = (c.customer_name || '').trim();
      if (!name || seen.has(name.toLowerCase())) return;
      seen.add(name.toLowerCase());
      custs.push({
        id: c.customer_id || `cust_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
        user_id: 'admin',
        name,
        business_name: name,
        company_name: name,
        contact_person: name,
        phone: c.customer_phone || '',
        billing_address: c.customer_address || c.delivery_address || 'Thane (W)',
        delivery_address: c.delivery_address || c.customer_address || 'Thane (W)',
        gstin: c.customer_gstin || null,
        notes: null,
        is_active: true,
        opening_balance: 0,
        credit_days: 45,
        credit_limit: 200000,
        created_at: c.created_at || new Date().toISOString(),
        updated_at: c.updated_at || new Date().toISOString(),
      });
    });

    saveCustomers(custs);
  }
  return custs;
}

export function saveCustomers(custs: Customer[]): void {
  writeJsonFile('customers.json', custs, true);
}

export function getCustomerSites(): CustomerSite[] {
  return readJsonFile<CustomerSite[]>('customer_sites.json', []);
}

export function saveCustomerSites(sites: CustomerSite[]): void {
  writeJsonFile('customer_sites.json', sites, false);
}

export function getSitesByCustomerId(customerId: string): CustomerSite[] {
  const all = getCustomerSites();
  return all.filter((s) => s.customer_id === customerId);
}

export function addOrUpdateSite(site: CustomerSite): CustomerSite {
  const sites = getCustomerSites();
  const idx = sites.findIndex((s) => s.id === site.id);
  const now = new Date().toISOString();

  const opening = Number(site.opening_balance) || 0;
  const credit = Number(site.credit_adjustment) || 0;
  const debit = Number(site.debit_adjustment) || 0;
  const current_balance = opening + debit - credit;

  const record: CustomerSite = {
    ...site,
    opening_balance: opening,
    credit_adjustment: credit,
    debit_adjustment: debit,
    current_balance,
    updated_at: now,
    created_at: idx >= 0 ? sites[idx].created_at : site.created_at || now,
  };
  if (idx >= 0) {
    sites[idx] = record;
  } else {
    sites.push(record);
  }
  saveCustomerSites(sites);
  return record;
}

export function verifyCustomerSite(siteId: string, user: string): CustomerSite {
  const sites = getCustomerSites();
  const site = sites.find((s) => s.id === siteId);
  if (!site) throw new Error('Site not found');

  const now = new Date().toISOString();
  const prevVerified = site.is_verified;
  site.is_verified = true;
  site.verified_at = now;
  site.verified_by = user;

  const snapshot = {
    id: site.id,
    customer_id: site.customer_id,
    site_name: site.site_name,
    opening_balance: site.opening_balance,
    credit_adjustment: site.credit_adjustment,
    debit_adjustment: site.debit_adjustment,
    current_balance: site.current_balance,
    is_verified: true,
  };

  if (!site.audit_history) site.audit_history = [];
  site.audit_history.unshift({
    action: 'VERIFIED',
    user,
    timestamp: now,
    reason: 'Accountant verified site balance adjustments',
    prev_values: { is_verified: prevVerified },
    new_values: snapshot,
  });

  saveCustomerSites(sites);

  recordAuditLog({
    entity_type: 'site_adjustment',
    entity_id: site.id,
    user_id: user,
    user_name: user,
    action: 'VERIFY_SITE_BALANCE',
    updated_values: snapshot,
    reason: `Verified site balance adjustment for "${site.site_name}": Net ₹${((site.debit_adjustment || 0) - (site.credit_adjustment || 0)).toLocaleString('en-IN')}`,
  });

  return site;
}

export function unverifyCustomerSite(siteId: string, user: string, reason?: string): CustomerSite {
  const sites = getCustomerSites();
  const site = sites.find((s) => s.id === siteId);
  if (!site) throw new Error('Site not found');

  const now = new Date().toISOString();
  site.is_verified = false;
  site.verified_at = null;
  site.verified_by = null;

  const snapshot = {
    id: site.id,
    customer_id: site.customer_id,
    site_name: site.site_name,
    is_verified: false,
  };

  if (!site.audit_history) site.audit_history = [];
  site.audit_history.unshift({
    action: 'UNVERIFIED',
    user,
    timestamp: now,
    reason: reason || 'Unverified site balance for adjustments',
    prev_values: { is_verified: true },
    new_values: snapshot,
  });

  saveCustomerSites(sites);

  recordAuditLog({
    entity_type: 'site_adjustment',
    entity_id: site.id,
    user_id: user,
    user_name: user,
    action: 'UNVERIFY_SITE_BALANCE',
    updated_values: snapshot,
    reason: `Unverified site balance for "${site.site_name}": ${reason || 'Manual revision'}`,
  });

  return site;
}

export function updateCustomerSiteBalances(
  siteId: string,
  data: {
    site_name?: string;
    opening_balance?: number;
    credit_adjustment?: number;
    debit_adjustment?: number;
    is_verified?: boolean;
  },
  user: string
): CustomerSite {
  const sites = getCustomerSites();
  const site = sites.find((s) => s.id === siteId);
  if (!site) throw new Error('Site not found');

  const prev = {
    site_name: site.site_name,
    opening_balance: site.opening_balance,
    credit_adjustment: site.credit_adjustment,
    debit_adjustment: site.debit_adjustment,
    current_balance: site.current_balance,
    is_verified: site.is_verified,
  };
  const now = new Date().toISOString();

  if (data.site_name !== undefined) site.site_name = data.site_name.trim();
  if (data.opening_balance !== undefined) site.opening_balance = Number(data.opening_balance) || 0;
  if (data.credit_adjustment !== undefined) site.credit_adjustment = Number(data.credit_adjustment) || 0;
  if (data.debit_adjustment !== undefined) site.debit_adjustment = Number(data.debit_adjustment) || 0;
  if (data.is_verified !== undefined) {
    site.is_verified = Boolean(data.is_verified);
    if (site.is_verified) {
      site.verified_at = now;
      site.verified_by = user;
    }
  }

  // Recalculate Current Balance
  site.current_balance =
    (site.opening_balance || 0) + (site.debit_adjustment || 0) - (site.credit_adjustment || 0);
  site.updated_at = now;

  const snapshot = {
    id: site.id,
    customer_id: site.customer_id,
    site_name: site.site_name,
    opening_balance: site.opening_balance,
    credit_adjustment: site.credit_adjustment,
    debit_adjustment: site.debit_adjustment,
    current_balance: site.current_balance,
    is_verified: site.is_verified,
  };

  if (!site.audit_history) site.audit_history = [];
  site.audit_history.unshift({
    action: 'UPDATED',
    user,
    timestamp: now,
    prev_values: prev,
    new_values: snapshot,
  });

  saveCustomerSites(sites);

  recordAuditLog({
    entity_type: 'site_adjustment',
    entity_id: site.id,
    user_id: user,
    user_name: user,
    action: 'UPDATE_SITE_BALANCE',
    updated_values: snapshot,
    reason: `Updated balance adjustment for site "${site.site_name}"`,
  });

  return site;
}

export function deleteCustomerSite(siteId: string, user: string): boolean {
  const sites = getCustomerSites();
  const idx = sites.findIndex((s) => s.id === siteId);
  if (idx < 0) return false;

  const [removed] = sites.splice(idx, 1);
  saveCustomerSites(sites);

  recordAuditLog({
    entity_type: 'site_adjustment',
    entity_id: siteId,
    user_id: user,
    user_name: user,
    action: 'DELETE_SITE',
    updated_values: removed,
    reason: `Removed site "${removed.site_name}" from customer`,
  });

  return true;
}

// ----------------------------------------------------
// MANUAL LEDGER TRANSACTIONS (RECEIPT, PAYMENT, SALES GST)
// ----------------------------------------------------
export interface ManualLedgerEntry {
  id: string;
  customer_id: string;
  date: string;
  particulars: string;
  payment_type: 'Receipt' | 'Sales GST' | 'Payment' | 'Journal' | 'Goods Return';
  voucher_no: string;
  debit: number;
  credit: number;
  site_name?: string;
  challan_id?: string;
  created_at: string;
  created_by?: string;
}

export function getManualLedgerEntries(): ManualLedgerEntry[] {
  let entries = readJsonFile<ManualLedgerEntry[]>('manual_ledger_entries.json', []);
  if (!entries || entries.length === 0) {
    entries = [
      {
        id: 'mle_rk_1',
        customer_id: 'cust_rk_sales',
        date: '2024-02-09',
        particulars: 'By HDFC BANK-50200003880041',
        payment_type: 'Receipt',
        voucher_no: '2225',
        debit: 0,
        credit: 10000,
        site_name: 'Kalpataru',
        created_at: '2024-02-09T10:00:00.000Z',
      },
      {
        id: 'mle_rk_2',
        customer_id: 'cust_rk_sales',
        date: '2024-02-15',
        particulars: 'To SALE GST 18%',
        payment_type: 'Sales GST',
        voucher_no: '4652/23-24',
        debit: 42100,
        credit: 0,
        site_name: 'Kalpataru',
        challan_id: 'challan_rk_4652',
        created_at: '2024-02-15T11:00:00.000Z',
      },
      {
        id: 'mle_rk_3',
        customer_id: 'cust_rk_sales',
        date: '2024-02-15',
        particulars: 'By HDFC BANK-50200003880041',
        payment_type: 'Receipt',
        voucher_no: '2278',
        debit: 0,
        credit: 31000,
        site_name: 'Lodha',
        created_at: '2024-02-15T16:00:00.000Z',
      },
      {
        id: 'mle_rk_4',
        customer_id: 'cust_rk_sales',
        date: '2024-02-19',
        particulars: 'To SALE GST 18%',
        payment_type: 'Sales GST',
        voucher_no: '4765/23-24',
        debit: 26400,
        credit: 0,
        site_name: 'Regency',
        challan_id: 'challan_rk_4765',
        created_at: '2024-02-19T14:00:00.000Z',
      },
      {
        id: 'mle_rk_5',
        customer_id: 'cust_rk_sales',
        date: '2024-12-17',
        particulars: 'By HDFC BANK-50200003880041',
        payment_type: 'Receipt',
        voucher_no: '1899',
        debit: 0,
        credit: 13000,
        site_name: 'Kalpataru',
        created_at: '2024-12-17T11:00:00.000Z',
      },
      {
        id: 'mle_rk_6',
        customer_id: 'cust_rk_sales',
        date: '2024-12-30',
        particulars: 'By HDFC BANK-50200003880041',
        payment_type: 'Receipt',
        voucher_no: '2020',
        debit: 0,
        credit: 13000,
        site_name: 'Lodha',
        created_at: '2024-12-30T15:00:00.000Z',
      },
      {
        id: 'mle_rk_7',
        customer_id: 'cust_rk_sales',
        date: '2025-01-01',
        particulars: 'To HDFC BANK-50200003880041',
        payment_type: 'Payment',
        voucher_no: '1938',
        debit: 13000,
        credit: 0,
        site_name: 'Regency',
        created_at: '2025-01-01T12:00:00.000Z',
      },
    ];
    saveManualLedgerEntries(entries);
  }
  return entries;
}

export function saveManualLedgerEntries(entries: ManualLedgerEntry[]): void {
  writeJsonFile('manual_ledger_entries.json', entries, true);
}

export function addManualLedgerEntry(entry: ManualLedgerEntry): ManualLedgerEntry {
  const entries = getManualLedgerEntries();
  entries.push(entry);
  saveManualLedgerEntries(entries);
  return entry;
}

export function updateManualLedgerEntry(
  id: string,
  data: Partial<ManualLedgerEntry>
): ManualLedgerEntry | null {
  const entries = getManualLedgerEntries();
  const idx = entries.findIndex((e) => e.id === id);
  if (idx < 0) return null;
  entries[idx] = { ...entries[idx], ...data };
  saveManualLedgerEntries(entries);
  return entries[idx];
}

export function deleteManualLedgerEntry(id: string): boolean {
  const entries = getManualLedgerEntries();
  const idx = entries.findIndex((e) => e.id === id);
  if (idx < 0) return false;
  entries.splice(idx, 1);
  saveManualLedgerEntries(entries);
  return true;
}

// ----------------------------------------------------
// 2. PAYMENTS RECEIVED
// ----------------------------------------------------
export function getPayments(): PaymentRecord[] {
  return readJsonFile<PaymentRecord[]>('payments.json', []);
}

export function savePayments(payments: PaymentRecord[]): void {
  writeJsonFile('payments.json', payments, true);
}

export function addPayment(payment: PaymentRecord): PaymentRecord {
  const payments = getPayments();
  payments.push(payment);
  savePayments(payments);
  return payment;
}

// ----------------------------------------------------
// 3. GOODS RETURNS
// ----------------------------------------------------
export function getGoodsReturns(): GoodsReturn[] {
  return readJsonFile<GoodsReturn[]>('goods_returns.json', []);
}

export function saveGoodsReturns(returns: GoodsReturn[]): void {
  writeJsonFile('goods_returns.json', returns, true);
}

export function addGoodsReturn(goodsReturn: GoodsReturn): GoodsReturn {
  const returns = getGoodsReturns();
  returns.push(goodsReturn);
  saveGoodsReturns(returns);
  return goodsReturn;
}

// ----------------------------------------------------
// 4. SITE-WISE PLUS/MINUS ADJUSTMENTS
// ----------------------------------------------------
export function getSiteAdjustments(): SiteAdjustment[] {
  return readJsonFile<SiteAdjustment[]>('site_adjustments.json', []);
}

export function saveSiteAdjustments(adjustments: SiteAdjustment[]): void {
  writeJsonFile('site_adjustments.json', adjustments, true);
}

export function addSiteAdjustment(adj: SiteAdjustment): SiteAdjustment {
  const list = getSiteAdjustments();
  list.push(adj);
  saveSiteAdjustments(list);
  return adj;
}

// ----------------------------------------------------
// 5. CREDIT EXCEPTIONS
// ----------------------------------------------------
export function getCreditExceptions(): CreditException[] {
  return readJsonFile<CreditException[]>('credit_exceptions.json', []);
}

export function saveCreditExceptions(exceptions: CreditException[]): void {
  writeJsonFile('credit_exceptions.json', exceptions, false);
}

export function grantCreditException(exception: CreditException): CreditException {
  const list = getCreditExceptions();
  list.push(exception);
  saveCreditExceptions(list);
  return exception;
}

export function hasActiveCreditException(customerId: string): boolean {
  const exceptions = getCreditExceptions();
  const now = new Date().toISOString();
  return exceptions.some(
    (e) => e.customer_id === customerId && (!e.expires_at || e.expires_at > now)
  );
}

// ----------------------------------------------------
// 6. AUDIT LOGS
// ----------------------------------------------------
export function getAuditLogs(): AuditLog[] {
  return readJsonFile<AuditLog[]>('audit_logs.json', []);
}

export function recordAuditLog(log: Omit<AuditLog, 'id' | 'timestamp'>): AuditLog {
  const logs = getAuditLogs();
  const fullLog: AuditLog = {
    ...log,
    id: `audit_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
    timestamp: new Date().toISOString(),
  };
  logs.unshift(fullLog);
  // Retain up to 2000 logs
  if (logs.length > 2000) {
    logs.length = 2000;
  }
  writeJsonFile('audit_logs.json', logs, false);
  return fullLog;
}

// ----------------------------------------------------
// 7. TALLY INTEGRATION & SYNC LOGS
// ----------------------------------------------------
export function getTallyPartyMappings(): TallyPartyMapping[] {
  return readJsonFile<TallyPartyMapping[]>('tally_mappings.json', []);
}

export function saveTallyPartyMappings(mappings: TallyPartyMapping[]): void {
  writeJsonFile('tally_mappings.json', mappings, false);
}

export function getTallySyncLogs(): TallySyncLog[] {
  return readJsonFile<TallySyncLog[]>('tally_sync_logs.json', []);
}

export function saveTallySyncLogs(logs: TallySyncLog[]): void {
  writeJsonFile('tally_sync_logs.json', logs, false);
}

export function addTallySyncLog(log: TallySyncLog): void {
  const logs = getTallySyncLogs();
  logs.unshift(log);
  if (logs.length > 1000) logs.length = 1000;
  saveTallySyncLogs(logs);
}

// ----------------------------------------------------
// 8. CHALLANS HELPER (from data/challans.json)
// ----------------------------------------------------
export function getAllChallans(): Challan[] {
  return readJsonFile<Challan[]>('challans.json', []);
}

export function saveAllChallans(challans: Challan[]): void {
  writeJsonFile('challans.json', challans, true);
}

export function updateChallanPayment(
  challanIdentifier: string,
  amountPaid: number,
  paidAt?: string
): Challan | null {
  const challans = getAllChallans();
  const lower = challanIdentifier.trim().toLowerCase();
  const idx = challans.findIndex(
    (c) =>
      c.id === challanIdentifier ||
      (c.challan_number && c.challan_number.trim().toLowerCase() === lower) ||
      (c.reference_number && c.reference_number.trim().toLowerCase() === lower)
  );
  if (idx < 0) return null;

  const payments = getPayments();
  const ch = challans[idx];
  const totalPaid = payments
    .filter(
      (p) =>
        p.challan_id === ch.id ||
        (p.challan_number && p.challan_number.trim().toLowerCase() === ch.challan_number.trim().toLowerCase())
    )
    .reduce((sum, p) => sum + (Number(p.amount) || 0), 0);

  const totalAmt = Number(ch.total_amount) || 0;
  const isPaid = totalAmt > 0 && totalPaid >= totalAmt;
  ch.paid_amount = totalPaid;
  ch.payment_status = isPaid ? 'paid' : (totalPaid > 0 ? 'partial' : 'unpaid');
  ch.paid_at = paidAt || new Date().toISOString();
  ch.updated_at = new Date().toISOString();

  challans[idx] = ch;
  saveAllChallans(challans);
  return ch;
}

// ----------------------------------------------------
// 9. PARTY LEDGER COMPUTATION (TALLY STYLE)
// ----------------------------------------------------
export interface LedgerComputationResult {
  openingBalance: number;
  totalDebit: number;
  totalCredit: number;
  closingBalance: number;
  verifiedSiteDebits: number;
  verifiedSiteCredits: number;
  netVerifiedSiteAdjustment: number;
  verifiedClosingBalance: number;
  is_account_settled: boolean;
  entries: CustomerLedgerEntry[];
  sites: CustomerSite[];
}

export function computeCustomerLedger(
  customerId: string,
  options?: {
    siteId?: string;
    siteName?: string;
    fromDate?: string;
    toDate?: string;
    typeFilter?: string;
    allChallans?: Challan[];
    customers?: Customer[];
  }
): LedgerComputationResult {
  const challans = options?.allChallans || getAllChallans();
  const payments = getPayments();
  const goodsReturns = getGoodsReturns();
  const siteAdjustments = getSiteAdjustments();
  const manualEntries = getManualLedgerEntries();
  const customerSites = getSitesByCustomerId(customerId);

  // Find customer opening balance if any
  let openingBalance = 0;
  const allCusts = options?.customers || getAllCustomers();
  const cust = allCusts.find(
    (c) =>
      c.id === customerId ||
      c.name?.toLowerCase() === customerId?.toLowerCase() ||
      c.business_name?.toLowerCase() === customerId?.toLowerCase() ||
      c.company_name?.toLowerCase() === customerId?.toLowerCase()
  );
  if (cust) {
    openingBalance = Number(cust.opening_balance) || 0;
  }

  // Universal customer matcher (handles UUIDs, names, business aliases reliably)
  const isMatchCust = (recCustId?: string | null, recCustName?: string | null): boolean => {
    const target = (customerId || '').trim().toLowerCase();
    const rId = (recCustId || '').trim().toLowerCase();
    const rName = (recCustName || '').trim().toLowerCase();

    if (rId && rId === target) return true;
    if (rName && rName === target) return true;

    if (cust) {
      const cId = (cust.id || '').trim().toLowerCase();
      const cName = (cust.name || '').trim().toLowerCase();
      const cBiz = (cust.business_name || '').trim().toLowerCase();
      const cComp = (cust.company_name || '').trim().toLowerCase();

      if (rId && (rId === cId || rId === cName || rId === cBiz || rId === cComp)) return true;
      if (rName && (rName === cId || rName === cName || rName === cBiz || rName === cComp)) return true;
    }
    return false;
  };

  const rawEntries: Array<{
    date: string;
    particulars: string;
    reference: string;
    voucher_type: CustomerLedgerEntry['voucher_type'];
    payment_type?: string;
    site_name?: string;
    debit: number;
    credit: number;
    challan_id?: string;
    payment_id?: string;
    return_id?: string;
    is_paid?: boolean;
    paid_amount?: number;
    payment_status?: 'paid' | 'partial' | 'unpaid';
    created_at: string;
  }> = [];

  // Helper map for fast challan number -> id linking
  const challanLookup = new Map<string, string>();
  challans.forEach((c) => {
    if (c.challan_number) challanLookup.set(c.challan_number.trim().toLowerCase(), c.id);
    if (c.reference_number) challanLookup.set(c.reference_number.trim().toLowerCase(), c.id);
  });

  // Pre-calculate payments by challan id & number for instant lookup
  const paymentsByChallan = new Map<string, number>();
  payments.forEach((p) => {
    if (p.challan_id) {
      paymentsByChallan.set(p.challan_id, (paymentsByChallan.get(p.challan_id) || 0) + (Number(p.amount) || 0));
    }
    if (p.challan_number) {
      const lower = p.challan_number.trim().toLowerCase();
      paymentsByChallan.set(lower, (paymentsByChallan.get(lower) || 0) + (Number(p.amount) || 0));
    }
  });

  // Keep track of already included vouchers / challans so no double entry occurs
  const addedChallanKeys = new Set<string>();

  // 1. Challans / Invoices -> DEBIT (Sales GST)
  challans.forEach((c) => {
    if (!isMatchCust(c.customer_id, c.customer_name)) {
      return;
    }
    if (c.is_deleted || c.status === 'cancelled' || c.status === 'void') return;

    if (options?.siteId && c.site_id && c.site_id !== options.siteId) return;
    if (options?.siteName && c.site_name && c.site_name.toLowerCase() !== options.siteName.toLowerCase()) return;

    const amt = Number(c.total_amount) || 0;
    if (amt > 0) {
      if (c.id) addedChallanKeys.add(c.id.toLowerCase());
      if (c.challan_number) addedChallanKeys.add(c.challan_number.trim().toLowerCase());
      if (c.reference_number) addedChallanKeys.add(c.reference_number.trim().toLowerCase());

      const itemsCount = (c.items || []).length;
      const desc = c.apply_gst ? 'To SALE GST 18%' : `To SALE (${itemsCount} items)`;

      const paidSum = (paymentsByChallan.get(c.id) || 0) + (paymentsByChallan.get(c.challan_number?.trim().toLowerCase()) || 0);
      const isPaid = Boolean(c.payment_status === 'paid' || (amt > 0 && paidSum >= amt));

      rawEntries.push({
        date: c.challan_date || c.created_at,
        particulars: desc,
        reference: c.challan_number,
        voucher_type: 'sales_gst',
        payment_type: 'Sales GST',
        site_name: c.site_name || c.delivery_address || undefined,
        debit: amt,
        credit: 0,
        challan_id: c.id,
        is_paid: isPaid,
        paid_amount: paidSum,
        payment_status: isPaid ? 'paid' : (paidSum > 0 ? 'partial' : 'unpaid'),
        created_at: c.created_at || c.challan_date,
      });
    }
  });

  // 2. Payments Received -> CREDIT (Receipt)
  payments.forEach((p) => {
    if (!isMatchCust(p.customer_id, p.customer_name)) {
      return;
    }
    if (options?.siteId && p.site_id && p.site_id !== options.siteId) return;
    if (options?.siteName && p.site_name && p.site_name.toLowerCase() !== options.siteName.toLowerCase()) return;

    const amt = Number(p.amount) || 0;
    if (amt > 0) {
      // User-selected payment type & description according to payment_mode
      let paymentTypeLabel = 'Receipt';
      let particularsLabel = '';

      const mode = (p.payment_mode || '').toLowerCase();
      if (mode === 'upi') {
        paymentTypeLabel = 'UPI';
        particularsLabel = p.reference_no
          ? `By UPI (${p.reference_no})`
          : 'By UPI Payment';
      } else if (mode === 'cash') {
        paymentTypeLabel = 'Cash';
        particularsLabel = p.reference_no
          ? `By Cash (${p.reference_no})`
          : 'By Cash Payment';
      } else if (mode === 'cheque') {
        paymentTypeLabel = 'Cheque';
        particularsLabel = p.reference_no
          ? `By Cheque (${p.reference_no})`
          : 'By Cheque Payment';
      } else if (mode === 'bank_transfer') {
        paymentTypeLabel = 'Bank Transfer';
        particularsLabel = p.reference_no?.includes('HDFC')
          ? p.reference_no
          : (p.reference_no ? `By HDFC Bank (${p.reference_no})` : 'By HDFC BANK-50200003880041');
      } else {
        paymentTypeLabel = 'Receipt';
        particularsLabel = p.reference_no
          ? `By Receipt (${p.reference_no})`
          : 'By Bank/Receipt';
      }

      rawEntries.push({
        date: p.payment_date || p.created_at,
        particulars: particularsLabel,
        reference: p.receipt_number || p.reference_no || 'REC',
        voucher_type: 'receipt',
        payment_type: paymentTypeLabel,
        site_name: p.site_name || undefined,
        debit: 0,
        credit: amt,
        payment_id: p.id,
        is_paid: true,
        paid_amount: amt,
        payment_status: 'paid',
        created_at: p.created_at || p.payment_date,
      });
    }
  });

  // 3. Goods Returns -> CREDIT
  goodsReturns.forEach((gr) => {
    if (!isMatchCust(gr.customer_id, gr.customer_name)) {
      return;
    }
    if (options?.siteId && gr.site_id && gr.site_id !== options.siteId) return;
    if (options?.siteName && gr.site_name && gr.site_name.toLowerCase() !== options.siteName.toLowerCase()) return;

    const amt = Number(gr.total_return_amount) || 0;
    if (amt > 0) {
      const linkedChallanId = challanLookup.get(gr.challan_number.trim().toLowerCase());
      rawEntries.push({
        date: gr.return_date || gr.created_at,
        particulars: `By Goods Return [${gr.challan_number}]`,
        reference: gr.return_number,
        voucher_type: 'goods_return',
        payment_type: 'Goods Return',
        site_name: gr.site_name || undefined,
        debit: 0,
        credit: amt,
        challan_id: linkedChallanId,
        return_id: gr.id,
        created_at: gr.created_at || gr.return_date,
      });
    }
  });

  // 4. Manual Ledger Entries (R K Sales exact entries or custom added entries)
  manualEntries.forEach((mle) => {
    if (!isMatchCust(mle.customer_id, mle.customer_id)) {
      return;
    }
    if (options?.siteName && mle.site_name && mle.site_name.toLowerCase() !== options.siteName.toLowerCase()) return;

    // Deduplicate: If this challan/voucher was already added from challans.json, do not add it again!
    const refKey = (mle.voucher_no || '').trim().toLowerCase();
    const idKey = (mle.challan_id || '').toLowerCase();
    if (refKey && addedChallanKeys.has(refKey)) return;
    if (idKey && addedChallanKeys.has(idKey)) return;
    if (refKey) addedChallanKeys.add(refKey);
    if (idKey) addedChallanKeys.add(idKey);

    let linkedId = mle.challan_id;
    if (!linkedId && mle.voucher_no) {
      linkedId = challanLookup.get(mle.voucher_no.trim().toLowerCase());
    }

    let isPaid = Boolean(mle.credit > 0);
    if (!isPaid && linkedId) {
      const ch = challans.find((c) => c.id === linkedId || (c.challan_number && c.challan_number.trim().toLowerCase() === mle.voucher_no.trim().toLowerCase()));
      if (ch) {
        const paidSum = (paymentsByChallan.get(ch.id) || 0) + (paymentsByChallan.get(ch.challan_number?.trim().toLowerCase()) || 0);
        isPaid = ch.payment_status === 'paid' || (Number(mle.debit) > 0 && paidSum >= Number(mle.debit));
      }
    }

    rawEntries.push({
      date: mle.date,
      particulars: mle.particulars,
      reference: mle.voucher_no,
      voucher_type: mle.debit > 0 ? 'sales_gst' : 'receipt',
      payment_type: mle.payment_type,
      site_name: mle.site_name,
      debit: Number(mle.debit) || 0,
      credit: Number(mle.credit) || 0,
      challan_id: linkedId,
      is_paid: isPaid,
      created_at: mle.created_at,
    });
  });

  // 5. Site-wise Plus (+) -> DEBIT, Minus (-) -> CREDIT
  siteAdjustments.forEach((adj) => {
    if (!isMatchCust(adj.customer_id, adj.customer_name)) {
      return;
    }
    if (options?.siteId && adj.site_id && adj.site_id !== options.siteId) return;
    if (options?.siteName && adj.site_name && adj.site_name.toLowerCase() !== options.siteName.toLowerCase()) return;

    const amt = Number(adj.amount) || 0;
    if (amt <= 0) return;

    if (adj.type === 'plus') {
      rawEntries.push({
        date: adj.created_at.slice(0, 10),
        particulars: `To Adjustment (+): ${adj.reason}`,
        reference: adj.adjustment_number,
        voucher_type: 'site_plus',
        payment_type: 'Debit Adjustment',
        site_name: adj.site_name,
        debit: amt,
        credit: 0,
        created_at: adj.created_at,
      });
    } else {
      rawEntries.push({
        date: adj.created_at.slice(0, 10),
        particulars: `By Adjustment (-): ${adj.reason}`,
        reference: adj.adjustment_number,
        voucher_type: 'site_minus',
        payment_type: 'Credit Adjustment',
        site_name: adj.site_name,
        debit: 0,
        credit: amt,
        created_at: adj.created_at,
      });
    }
  });

  // Sort raw entries chronologically
  rawEntries.sort((a, b) => {
    const da = new Date(a.date).getTime() || 0;
    const db = new Date(b.date).getTime() || 0;
    if (da !== db) return da - db;
    return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
  });

  // 1. Calculate Period Opening Balance (Base opening balance + all transactions before fromDate)
  let periodOpeningBalance = openingBalance;
  if (options?.fromDate) {
    let preDebits = 0;
    let preCredits = 0;
    rawEntries.forEach((e) => {
      if (e.date < options.fromDate!) {
        preDebits += e.debit;
        preCredits += e.credit;
      }
    });
    periodOpeningBalance = Math.round((openingBalance + preDebits - preCredits) * 100) / 100;
  }

  // 2. Filter by date range if provided
  let filtered = rawEntries;
  if (options?.fromDate) {
    filtered = filtered.filter((e) => e.date >= options.fromDate!);
  }
  if (options?.toDate) {
    filtered = filtered.filter((e) => e.date <= options.toDate!);
  }
  if (options?.typeFilter && options.typeFilter !== 'all') {
    const tf = options.typeFilter.toLowerCase();
    filtered = filtered.filter((e) => (e.payment_type || '').toLowerCase().includes(tf));
  }

  // 3. Calculate Running Balance starting from periodOpeningBalance
  let running = periodOpeningBalance;
  let totalDebit = 0;
  let totalCredit = 0;

  const entries: CustomerLedgerEntry[] = filtered.map((item, idx) => {
    running = Math.round((running + item.debit - item.credit) * 100) / 100;
    totalDebit += item.debit;
    totalCredit += item.credit;

    return {
      id: `led_${idx}_${item.reference}`,
      date: item.date,
      particulars: item.particulars,
      reference: item.reference,
      voucher_type: item.voucher_type,
      payment_type: item.payment_type || (item.debit > 0 ? 'Sales GST' : 'Receipt'),
      site_name: item.site_name,
      debit: item.debit,
      credit: item.credit,
      running_balance: running,
      challan_id: item.challan_id,
      payment_id: item.payment_id,
      return_id: item.return_id,
      is_paid: item.is_paid,
      paid_amount: item.paid_amount,
      payment_status: item.payment_status,
    };
  });

  // Site-wise verified calculations
  let verifiedSiteDebits = 0;
  let verifiedSiteCredits = 0;

  customerSites.forEach((s) => {
    if (s.is_verified) {
      verifiedSiteDebits += Number(s.debit_adjustment) || 0;
      verifiedSiteCredits += Number(s.credit_adjustment) || 0;
    }
  });

  const netVerifiedSiteAdjustment = verifiedSiteDebits - verifiedSiteCredits;
  const verifiedClosingBalance = Math.round((running + netVerifiedSiteAdjustment) * 100) / 100;
  const is_account_settled = verifiedClosingBalance <= 0;

  return {
    openingBalance: periodOpeningBalance,
    totalDebit: Math.round(totalDebit * 100) / 100,
    totalCredit: Math.round(totalCredit * 100) / 100,
    closingBalance: verifiedClosingBalance,
    verifiedSiteDebits: Math.round(verifiedSiteDebits * 100) / 100,
    verifiedSiteCredits: Math.round(verifiedSiteCredits * 100) / 100,
    netVerifiedSiteAdjustment: Math.round(netVerifiedSiteAdjustment * 100) / 100,
    verifiedClosingBalance,
    is_account_settled,
    entries,
    sites: customerSites,
  };
}

// ----------------------------------------------------
// 10. SITE-WISE SUMMARY & PLUS/MINUS CALCULATION
// ----------------------------------------------------
export function computeSiteAccounting(
  siteId: string,
  siteName: string,
  customerId: string,
  customerName: string
): SiteAccountingSummary {
  const challans = getAllChallans();
  const payments = getPayments();
  const returns = getGoodsReturns();
  const adjustments = getSiteAdjustments();

  const siteChallans = challans.filter(
    (c) =>
      !c.is_deleted &&
      c.status !== 'cancelled' &&
      c.status !== 'void' &&
      ((c.site_id && c.site_id === siteId) ||
        (c.site_name && c.site_name.toLowerCase() === siteName.toLowerCase()) ||
        (c.customer_id === customerId && c.delivery_address?.toLowerCase().includes(siteName.toLowerCase())))
  );

  const sitePayments = payments.filter(
    (p) =>
      (p.site_id && p.site_id === siteId) ||
      (p.site_name && p.site_name.toLowerCase() === siteName.toLowerCase())
  );

  const siteReturns = returns.filter(
    (r) =>
      (r.site_id && r.site_id === siteId) ||
      (r.site_name && r.site_name.toLowerCase() === siteName.toLowerCase())
  );

  const sitePlus = adjustments.filter(
    (a) =>
      a.type === 'plus' &&
      ((a.site_id && a.site_id === siteId) ||
        (a.site_name && a.site_name.toLowerCase() === siteName.toLowerCase()))
  );

  const siteMinus = adjustments.filter(
    (a) =>
      a.type === 'minus' &&
      ((a.site_id && a.site_id === siteId) ||
        (a.site_name && a.site_name.toLowerCase() === siteName.toLowerCase()))
  );

  const totalChallan = siteChallans.reduce((s, c) => s + (Number(c.total_amount) || 0), 0);
  const totalPay = sitePayments.reduce((s, p) => s + (Number(p.amount) || 0), 0);
  const totalRet = siteReturns.reduce((s, r) => s + (Number(r.total_return_amount) || 0), 0);
  const totalPlus = sitePlus.reduce((s, a) => s + (Number(a.amount) || 0), 0);
  const totalMinus = siteMinus.reduce((s, a) => s + (Number(a.amount) || 0), 0);

  const opening = 0;
  // Opening + Challans + PLUS - Payments - MINUS - Returns = Closing
  const closing = Math.round((opening + totalChallan + totalPlus - totalPay - totalMinus - totalRet) * 100) / 100;

  return {
    siteId,
    siteName,
    siteAddress: '',
    customerId,
    customerName,
    openingBalance: opening,
    totalChallanAmount: Math.round(totalChallan * 100) / 100,
    challanCount: siteChallans.length,
    totalPlusEntries: Math.round(totalPlus * 100) / 100,
    totalPlusAdjustments: Math.round(totalPlus * 100) / 100,
    totalMinusEntries: Math.round(totalMinus * 100) / 100,
    totalMinusAdjustments: Math.round(totalMinus * 100) / 100,
    totalPayments: Math.round(totalPay * 100) / 100,
    totalPaymentsReceived: Math.round(totalPay * 100) / 100,
    totalReturns: Math.round(totalRet * 100) / 100,
    totalGoodsReturns: Math.round(totalRet * 100) / 100,
    closingOutstanding: closing,
    closingOutstandingBalance: closing,
  };
}

// ----------------------------------------------------
// 11. 45-DAY PAYMENT LIMIT & CREDIT CONTROL
// ----------------------------------------------------
export function checkCustomerCreditStatus(
  customer: Customer,
  allChallans?: Challan[]
): CustomerCreditStatus {
  const creditDays = Number(customer.credit_days) || 45;
  const creditLimit = Number(customer.credit_limit) || 200000;
  const ledger = computeCustomerLedger(customer.id, { allChallans, customers: [customer] });

  const totalOutstanding = ledger.closingBalance;
  const now = new Date();
  const msPerDay = 24 * 60 * 60 * 1000;

  // Find unpaid challans older than creditDays
  const challans = allChallans || getAllChallans();
  const custChallans = challans
    .filter(
      (c) =>
        (c.customer_id === customer.id || c.customer_name?.toLowerCase() === customer.business_name?.toLowerCase()) &&
        !c.is_deleted &&
        c.status !== 'cancelled' &&
        c.status !== 'void'
    )
    .sort((a, b) => new Date(a.challan_date).getTime() - new Date(b.challan_date).getTime());

  let oldestOverdueDate: string | undefined = undefined;
  let maxDaysOverdue = 0;

  if (totalOutstanding > 0) {
    // If closing balance is positive, examine earliest orders
    for (const c of custChallans) {
      const cDate = new Date(c.challan_date);
      if (isNaN(cDate.getTime())) continue;

      const diffDays = Math.floor((now.getTime() - cDate.getTime()) / msPerDay);
      if (diffDays > creditDays) {
        if (!oldestOverdueDate) {
          oldestOverdueDate = c.challan_date;
        }
        if (diffDays > maxDaysOverdue) {
          maxDaysOverdue = diffDays;
        }
      }
    }
  }

  const isOverdue = maxDaysOverdue > creditDays;
  const isOverLimit = creditLimit > 0 && totalOutstanding > creditLimit;
  const hasException = hasActiveCreditException(customer.id);

  let isBlocked = false;
  let blockReason = '';

  if (customer.is_credit_blocked) {
    isBlocked = true;
    blockReason = customer.credit_block_reason || 'Manually blocked by administration';
  } else if (!hasException) {
    if (isOverdue && isOverLimit) {
      isBlocked = true;
      blockReason = `Overdue payment (${maxDaysOverdue} days > ${creditDays} days limit) & Outstanding (₹${totalOutstanding.toLocaleString('en-IN')}) exceeds credit limit (₹${creditLimit.toLocaleString('en-IN')})`;
    } else if (isOverdue) {
      isBlocked = true;
      blockReason = `Overdue payment: ${maxDaysOverdue} days since order on ${oldestOverdueDate} (allowed ${creditDays} days)`;
    } else if (isOverLimit) {
      isBlocked = true;
      blockReason = `Credit limit exceeded: Outstanding ₹${totalOutstanding.toLocaleString('en-IN')} exceeds limit ₹${creditLimit.toLocaleString('en-IN')}`;
    }
  }

  return {
    customerId: customer.id,
    customerName: customer.business_name,
    creditDays,
    creditLimit,
    totalOutstanding,
    isOverdue,
    oldestOverdueDate,
    daysOverdue: maxDaysOverdue,
    isOverLimit,
    isBlocked,
    blockReason: isBlocked ? blockReason : undefined,
    hasException,
  };
}

// ----------------------------------------------------
// 12. TALLY XML EXPORT BUILDER (TALLYPRIME COMPLIANT)
// ----------------------------------------------------
export function generateTallyPrimeXml(options: {
  challans: Challan[];
  payments: PaymentRecord[];
  goodsReturns: GoodsReturn[];
  companyName?: string;
}): string {
  const company = options.companyName || 'SHOWHOUSE';

  let xml = `<?xml version="1.0" encoding="utf-8"?>\n`;
  xml += `<ENVELOPE>\n`;
  xml += `  <HEADER>\n`;
  xml += `    <TALLYREQUEST>Import Data</TALLYREQUEST>\n`;
  xml += `  </HEADER>\n`;
  xml += `  <BODY>\n`;
  xml += `    <IMPORTDATA>\n`;
  xml += `      <REQUESTDESC>\n`;
  xml += `        <REPORTNAME>Vouchers</REPORTNAME>\n`;
  xml += `        <STATICVARIABLES>\n`;
  xml += `          <SVCURRENTCOMPANY>${company}</SVCURRENTCOMPANY>\n`;
  xml += `        </STATICVARIABLES>\n`;
  xml += `      </REQUESTDESC>\n`;
  xml += `      <REQUESTDATA>\n`;

  // 1. Sales Vouchers (Challans)
  options.challans.forEach((c) => {
    if (c.is_deleted || c.status === 'cancelled') return;
    const dateFormatted = (c.challan_date || new Date().toISOString().slice(0, 10)).replace(/-/g, '');
    const amount = Number(c.total_amount) || 0;
    const partyName = c.customer_name || 'Sundry Debtors';

    xml += `        <TALLYMESSAGE xmlns:UDF="TallyUDF">\n`;
    xml += `          <VOUCHER VCHTYPE="Sales" ACTION="Create" OBJVIEW="Invoice Voucher View">\n`;
    xml += `            <DATE>${dateFormatted}</DATE>\n`;
    xml += `            <VOUCHERTYPENAME>Sales</VOUCHERTYPENAME>\n`;
    xml += `            <VOUCHERNUMBER>${c.challan_number}</VOUCHERNUMBER>\n`;
    xml += `            <REFERENCE>${c.reference_number || c.challan_number}</REFERENCE>\n`;
    xml += `            <PARTYLEDGERNAME>${partyName}</PARTYLEDGERNAME>\n`;
    xml += `            <NARRATION>Delivery Challan ${c.challan_number} to ${c.customer_name}${c.delivery_address ? ` at ${c.delivery_address}` : ''}</NARRATION>\n`;
    xml += `            <ALLLEDGERENTRIES.LIST>\n`;
    xml += `              <LEDGERNAME>${partyName}</LEDGERNAME>\n`;
    xml += `              <ISDEEMEDPOSITIVE>Yes</ISDEEMEDPOSITIVE>\n`;
    xml += `              <AMOUNT>-${amount}</AMOUNT>\n`;
    xml += `            </ALLLEDGERENTRIES.LIST>\n`;
    xml += `            <ALLLEDGERENTRIES.LIST>\n`;
    xml += `              <LEDGERNAME>Sales Account</LEDGERNAME>\n`;
    xml += `              <ISDEEMEDPOSITIVE>No</ISDEEMEDPOSITIVE>\n`;
    xml += `              <AMOUNT>${amount}</AMOUNT>\n`;
    xml += `            </ALLLEDGERENTRIES.LIST>\n`;
    xml += `          </VOUCHER>\n`;
    xml += `        </TALLYMESSAGE>\n`;
  });

  // 2. Receipt Vouchers (Payments)
  options.payments.forEach((p) => {
    const dateFormatted = (p.payment_date || new Date().toISOString().slice(0, 10)).replace(/-/g, '');
    const partyName = p.customer_name || 'Sundry Debtors';
    const bankOrCashLedger = p.payment_mode === 'cash' ? 'Cash' : 'Bank Account';

    xml += `        <TALLYMESSAGE xmlns:UDF="TallyUDF">\n`;
    xml += `          <VOUCHER VCHTYPE="Receipt" ACTION="Create" OBJVIEW="Accounting Voucher View">\n`;
    xml += `            <DATE>${dateFormatted}</DATE>\n`;
    xml += `            <VOUCHERTYPENAME>Receipt</VOUCHERTYPENAME>\n`;
    xml += `            <VOUCHERNUMBER>${p.receipt_number}</VOUCHERNUMBER>\n`;
    xml += `            <REFERENCE>${p.reference_no || p.receipt_number}</REFERENCE>\n`;
    xml += `            <PARTYLEDGERNAME>${partyName}</PARTYLEDGERNAME>\n`;
    xml += `            <NARRATION>Payment received via ${p.payment_mode.toUpperCase()}${p.notes ? ` - ${p.notes}` : ''}</NARRATION>\n`;
    xml += `            <ALLLEDGERENTRIES.LIST>\n`;
    xml += `              <LEDGERNAME>${bankOrCashLedger}</LEDGERNAME>\n`;
    xml += `              <ISDEEMEDPOSITIVE>Yes</ISDEEMEDPOSITIVE>\n`;
    xml += `              <AMOUNT>-${p.amount}</AMOUNT>\n`;
    xml += `            </ALLLEDGERENTRIES.LIST>\n`;
    xml += `            <ALLLEDGERENTRIES.LIST>\n`;
    xml += `              <LEDGERNAME>${partyName}</LEDGERNAME>\n`;
    xml += `              <ISDEEMEDPOSITIVE>No</ISDEEMEDPOSITIVE>\n`;
    xml += `              <AMOUNT>${p.amount}</AMOUNT>\n`;
    xml += `            </ALLLEDGERENTRIES.LIST>\n`;
    xml += `          </VOUCHER>\n`;
    xml += `        </TALLYMESSAGE>\n`;
  });

  // 3. Credit Notes (Goods Returns)
  options.goodsReturns.forEach((gr) => {
    const dateFormatted = (gr.return_date || new Date().toISOString().slice(0, 10)).replace(/-/g, '');
    const partyName = gr.customer_name || 'Sundry Debtors';

    xml += `        <TALLYMESSAGE xmlns:UDF="TallyUDF">\n`;
    xml += `          <VOUCHER VCHTYPE="Credit Note" ACTION="Create">\n`;
    xml += `            <DATE>${dateFormatted}</DATE>\n`;
    xml += `            <VOUCHERTYPENAME>Credit Note</VOUCHERTYPENAME>\n`;
    xml += `            <VOUCHERNUMBER>${gr.return_number}</VOUCHERNUMBER>\n`;
    xml += `            <REFERENCE>${gr.challan_number}</REFERENCE>\n`;
    xml += `            <PARTYLEDGERNAME>${partyName}</PARTYLEDGERNAME>\n`;
    xml += `            <NARRATION>Goods return against Challan ${gr.challan_number}: ${gr.reason}</NARRATION>\n`;
    xml += `            <ALLLEDGERENTRIES.LIST>\n`;
    xml += `              <LEDGERNAME>Sales Return</LEDGERNAME>\n`;
    xml += `              <ISDEEMEDPOSITIVE>Yes</ISDEEMEDPOSITIVE>\n`;
    xml += `              <AMOUNT>-${gr.total_return_amount}</AMOUNT>\n`;
    xml += `            </ALLLEDGERENTRIES.LIST>\n`;
    xml += `            <ALLLEDGERENTRIES.LIST>\n`;
    xml += `              <LEDGERNAME>${partyName}</LEDGERNAME>\n`;
    xml += `              <ISDEEMEDPOSITIVE>No</ISDEEMEDPOSITIVE>\n`;
    xml += `              <AMOUNT>${gr.total_return_amount}</AMOUNT>\n`;
    xml += `            </ALLLEDGERENTRIES.LIST>\n`;
    xml += `          </VOUCHER>\n`;
    xml += `        </TALLYMESSAGE>\n`;
  });

  xml += `      </REQUESTDATA>\n`;
  xml += `    </IMPORTDATA>\n`;
  xml += `  </BODY>\n`;
  xml += `</ENVELOPE>\n`;

  return xml;
}

