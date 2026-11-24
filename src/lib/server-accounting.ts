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
import { cleanTallyParticulars } from './utils';
import { safeReadDataFile, safeWriteDataFile } from './server-storage';
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
  Quotation,
  TallyPartyMapping,
  TallySyncLog,
  TallySettings,
  SiteAccountingSummary,
  CustomerCreditStatus,
} from '@/types';

const SEED_DATA_DIR = path.join(process.cwd(), 'data');
const IS_SERVERLESS = Boolean(process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME);
const DATA_DIR = IS_SERVERLESS ? path.join('/tmp', 'showhouse-data') : SEED_DATA_DIR;
const BACKUP_DIR = path.join(DATA_DIR, 'backups');

function ensureDataDir(): void {
  try {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
      if (IS_SERVERLESS && fs.existsSync(SEED_DATA_DIR)) {
        try {
          const files = fs.readdirSync(SEED_DATA_DIR);
          files.forEach((file) => {
            const src = path.join(SEED_DATA_DIR, file);
            const dest = path.join(DATA_DIR, file);
            if (fs.statSync(src).isFile() && !fs.existsSync(dest)) {
              fs.copyFileSync(src, dest);
            }
          });
        } catch (err) {
          console.warn('Seed copy note:', err);
        }
      }
    }
    if (!fs.existsSync(BACKUP_DIR)) {
      fs.mkdirSync(BACKUP_DIR, { recursive: true });
    }
  } catch (err) {
    console.warn('ensureDataDir note:', err);
  }
}

interface FileCacheEntry<T> {
  mtimeMs: number;
  data: T;
}
const memoryFileCache = new Map<string, FileCacheEntry<any>>();

function readJsonFile<T>(filename: string, fallback: T): T {
  return safeReadDataFile<T>(filename, fallback);
}

function writeJsonFile<T>(filename: string, data: T, backup = false): void {
  safeWriteDataFile(filename, data);
}

// ----------------------------------------------------
// 1. CUSTOMERS & SITES (PERSISTENT & SEEDED)
// ----------------------------------------------------
export function getAllCustomers(): Customer[] {
  let custs = readJsonFile<Customer[]>('customers.json', []);
  if (!Array.isArray(custs)) custs = [];

  let modified = false;

  // Ensure all customers have standard name and profile fields
  custs.forEach((c) => {
    if (!c.name && (c.business_name || c.contact_person)) {
      c.name = (c.business_name || c.contact_person || 'Customer').trim();
      modified = true;
    }
    if (!c.business_name && c.name) {
      c.business_name = c.name;
      modified = true;
    }
  });

  // Dynamic Scan: Auto-detect any missing party from all delivery challans
  try {
    const challans = getAllChallans();
    const existingKeys = new Set<string>();

    custs.forEach((c) => {
      if (c.id) existingKeys.add(c.id.toLowerCase());
      if (c.name) existingKeys.add(c.name.trim().toLowerCase());
      if (c.business_name) existingKeys.add(c.business_name.trim().toLowerCase());
    });

    challans.forEach((c) => {
      const name = (c.customer_name || '').trim();
      if (!name) return;
      const lowerName = name.toLowerCase();
      const cId = (c.customer_id || '').trim();

      const isKnown =
        (cId && existingKeys.has(cId.toLowerCase())) ||
        existingKeys.has(lowerName) ||
        (lowerName.includes('r k') && existingKeys.has('r k sales'));

      if (!isKnown) {
        existingKeys.add(lowerName);
        if (cId) existingKeys.add(cId.toLowerCase());
        const newCust: Customer = {
          id: cId || `cust_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
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
          sites: [
            {
              id: `site_1_${cId || Date.now()}`,
              customer_id: cId || `cust_${Date.now()}`,
              site_name: c.site_name || 'Site 1',
              name: c.site_name || 'Site 1',
              site_address: c.delivery_address || c.customer_address || 'Thane (W)',
              location: c.delivery_address || c.customer_address || 'Thane (W)',
              is_active: true,
              created_at: c.challan_date || new Date().toISOString(),
            },
          ],
          created_at: c.created_at || new Date().toISOString(),
          updated_at: c.updated_at || new Date().toISOString(),
        };
        custs.push(newCust);
        modified = true;
      }
    });

    // Ensure all existing customers have at least their default site or challan sites configured
    custs.forEach((c) => {
      const cChallans = challans.filter((ch) =>
        (ch.customer_id && ch.customer_id === c.id) ||
        (ch.customer_name && c.name && ch.customer_name.trim().toLowerCase() === c.name.trim().toLowerCase())
      );
      const challanSiteNames = Array.from(new Set(cChallans.map((ch) => (ch.site_name || '').trim()).filter(Boolean)));
      
      const currentSites = Array.isArray(c.sites) ? [...c.sites] : [];
      let sitesUpdated = false;

      // If no sites at all, add default Site 1
      if (currentSites.length === 0) {
        currentSites.push({
          id: `site_1_${c.id}`,
          customer_id: c.id,
          site_name: challanSiteNames[0] || 'Site 1',
          name: challanSiteNames[0] || 'Site 1',
          site_address: c.delivery_address || c.billing_address || 'Thane (W)',
          location: c.delivery_address || c.billing_address || 'Thane (W)',
          is_active: true,
          created_at: c.created_at || new Date().toISOString(),
        });
        sitesUpdated = true;
      }

      // If challans contain additional site names (e.g. Site 2) not in currentSites, add them
      challanSiteNames.forEach((sName) => {
        const has = currentSites.some((s) => (s.site_name || s.name || '').trim().toLowerCase() === sName.toLowerCase());
        if (!has) {
          const matchingChallan = cChallans.find((ch) => (ch.site_name || '').trim().toLowerCase() === sName.toLowerCase());
          currentSites.push({
            id: `site_${c.id}_${sName.toLowerCase().replace(/[^a-z0-9]/g, '_')}_${Date.now()}`,
            customer_id: c.id,
            site_name: sName,
            name: sName,
            site_address: matchingChallan?.delivery_address || c.delivery_address || `${sName} Site`,
            location: matchingChallan?.delivery_address || c.delivery_address || `${sName} Site`,
            is_active: true,
            created_at: matchingChallan?.challan_date || new Date().toISOString(),
          });
          sitesUpdated = true;
        }
      });

      if (sitesUpdated) {
        c.sites = currentSites;
        modified = true;
      }
    });
  } catch (err) {
    console.warn('Auto-detect customers from challans note:', err);
  }

  if (modified) {
    saveCustomers(custs);
  }
  return custs;
}

export function saveCustomers(custs: Customer[]): void {
  writeJsonFile('customers.json', custs, true);
  // Auto-sync customer sites into customer_sites.json
  try {
    const allSitesMap = new Map<string, CustomerSite>();
    const existingSites = getCustomerSites();
    existingSites.forEach((s) => allSitesMap.set(s.id, s));
    custs.forEach((c) => {
      if (Array.isArray(c.sites)) {
        c.sites.forEach((s, idx) => {
          if (!s || !s.id) return;
          allSitesMap.set(s.id, {
            ...s,
            customer_id: c.id,
            site_name: s.site_name || s.name || `Site ${idx + 1}`,
            site_address: s.site_address || s.location || c.delivery_address || 'Thane (W)',
            is_active: s.is_active !== false,
          });
        });
      }
    });
    saveCustomerSites(Array.from(allSitesMap.values()));
  } catch {}
}

export async function saveCustomersAsync(custs: Customer[]): Promise<boolean> {
  const { safeWriteDataFileAsync } = await import('@/lib/server-storage');
  saveCustomers(custs);
  return safeWriteDataFileAsync('customers.json', custs);
}

export function getCustomerSites(): CustomerSite[] {
  return readJsonFile<CustomerSite[]>('customer_sites.json', []);
}

export function saveCustomerSites(sites: CustomerSite[]): void {
  writeJsonFile('customer_sites.json', sites, false);
}

export function getSitesByCustomerId(customerId: string, externalChallans?: Challan[]): CustomerSite[] {
  const all = getCustomerSites();
  const allCusts = getAllCustomers();
  const cust = allCusts.find(
    (c) =>
      c.id === customerId ||
      c.name?.toLowerCase() === customerId.toLowerCase() ||
      c.business_name?.toLowerCase() === customerId.toLowerCase()
  );

  const targetId = (customerId || '').trim().toLowerCase();
  const custId = (cust?.id || '').trim().toLowerCase();
  const custName = (cust?.name || '').trim().toLowerCase();
  const custBiz = (cust?.business_name || '').trim().toLowerCase();

  let sites = all.filter(
    (s) =>
      s.customer_id === customerId ||
      (custId && s.customer_id.toLowerCase() === custId) ||
      (targetId && s.customer_id.toLowerCase() === targetId)
  );

  // Merge customer profile's explicit sites
  if (Array.isArray(cust?.sites)) {
    cust.sites.forEach((cs) => {
      const lowerName = (cs.site_name || cs.name || '').trim().toLowerCase();
      if (!sites.some((s) => s.id === cs.id || s.site_name.trim().toLowerCase() === lowerName)) {
        sites.push({
          ...cs,
          customer_id: cust.id,
          site_name: cs.site_name || cs.name || 'Site 1',
          site_address: cs.site_address || cs.location || cust.delivery_address || 'Thane (W)',
          is_active: cs.is_active !== false,
        });
      }
    });
  }

  // Auto-fetch and detect all sites from customer's challans
  try {
    const challans = externalChallans || getAllChallans();
    const isMatchThisCust = (c: Challan) => {
      const cCustId = (c.customer_id || '').trim().toLowerCase();
      const cCustName = (c.customer_name || '').trim().toLowerCase();

      if (targetId && (cCustId === targetId || cCustName === targetId)) return true;
      if (targetId && (cCustName.includes(targetId) || targetId.includes(cCustName))) return true;
      if (custId && (cCustId === custId || cCustName === custId)) return true;
      if (custName && (cCustName === custName || cCustName.includes(custName) || custName.includes(cCustName))) return true;
      if (custBiz && (cCustName === custBiz || cCustName.includes(custBiz) || custBiz.includes(cCustName))) return true;
      if (
        (targetId === 'cust_rk_sales' || targetId.includes('rk') || custName.includes('rk')) &&
        (cCustName.includes('r k') || cCustName.includes('rk sales'))
      ) {
        return true;
      }
      return false;
    };

    const custChallans = challans.filter(
      (c) =>
        isMatchThisCust(c) &&
        !c.is_deleted &&
        c.status !== 'cancelled' &&
        c.status !== 'void' &&
        (c.status === 'approved' || Boolean((c as any).is_approved) || c.status === 'delivered' || (c as any).delivery_status === 'delivered' || Boolean((c as any).is_delivered))
    );

    const existingSiteNames = new Set(sites.map((s) => s.site_name.trim().toLowerCase()));
    let modified = false;

    custChallans.forEach((c) => {
      const detectedNames: string[] = [];
      if (c.site_name && c.site_name.trim()) {
        detectedNames.push(c.site_name.trim());
      } else if (c.delivery_address && c.delivery_address.trim()) {
        const parts = c.delivery_address.split(',').map((p) => p.trim()).filter(Boolean);
        if (parts.length > 0) {
          detectedNames.push(parts[0]);
        }
      }

      detectedNames.forEach((sName) => {
        if (!sName || sName.length < 2) return;
        const lowerSite = sName.toLowerCase();
        const found = sites.find((s) => s.site_name.trim().toLowerCase() === lowerSite);

        // Sum of all challan amounts for this site
        const siteChallansTotal = custChallans
          .filter((ch) => {
            const sn = (ch.site_name || '').trim().toLowerCase();
            const da = (ch.delivery_address || '').trim().toLowerCase();
            return sn === lowerSite || (sn === '' && (da.startsWith(lowerSite) || da.includes(lowerSite)));
          })
          .reduce((sum, ch) => sum + (Number(ch.total_amount) || 0), 0);

        if (!found && !existingSiteNames.has(lowerSite)) {
          existingSiteNames.add(lowerSite);
          const newSite: CustomerSite = {
            id: `site_${cust?.id || customerId}_${sName.toLowerCase().replace(/[^a-z0-9]/g, '_')}_${Date.now()}_${Math.random().toString(36).substring(2, 5)}`,
            customer_id: cust?.id || customerId,
            site_name: sName,
            site_address: c.delivery_address || `${sName} Site`,
            opening_balance: 0,
            credit_adjustment: 0,
            debit_adjustment: siteChallansTotal > 0 ? siteChallansTotal : (Number(c.total_amount) || 0),
            current_balance: siteChallansTotal > 0 ? siteChallansTotal : (Number(c.total_amount) || 0),
            challan_id: c.id,
            challan_number: c.challan_number,
            order_index: sites.length,
            is_verified: true,
            verified_at: new Date().toISOString(),
            verified_by: 'Auto (Challan)',
            is_active: true,
            created_at: c.challan_date || new Date().toISOString(),
          };
          sites.push(newSite);
          all.push(newSite);
          modified = true;
        } else if (found) {
          if (!found.challan_number || found.challan_number.startsWith('SH/')) {
            found.challan_id = c.id;
            found.challan_number = c.challan_number;
            if (c.delivery_address) found.site_address = c.delivery_address;
          }
          if (siteChallansTotal > 0) {
            found.debit_adjustment = siteChallansTotal;
            found.current_balance = (Number(found.opening_balance) || 0) + siteChallansTotal - (Number(found.credit_adjustment) || 0);
          }
          const allIdx = all.findIndex((s) => s.id === found.id);
          if (allIdx >= 0) all[allIdx] = found;
          modified = true;
        }
      });
    });

    if (modified) {
      saveCustomerSites(all);
    }
  } catch (err) {
    console.warn('Auto-fetch sites note:', err);
  }

  sites.sort((a, b) => {
    const idxA = a.order_index ?? 9999;
    const idxB = b.order_index ?? 9999;
    if (idxA !== idxB) return idxA - idxB;
    return new Date(a.created_at || 0).getTime() - new Date(b.created_at || 0).getTime();
  });
  return sites;
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
    challan_id: site.challan_id || undefined,
    challan_number: site.challan_number || undefined,
    order_index: site.order_index !== undefined ? site.order_index : (idx >= 0 ? sites[idx].order_index : sites.length),
    updated_at: now,
    created_at: idx >= 0 ? sites[idx].created_at : site.created_at || now,
  };
  if (idx >= 0) {
    sites[idx] = record;
  } else {
    sites.push(record);
  }
  saveCustomerSites(sites);

  // Sync updated site balance directly to customer profile in customers.json
  try {
    const custs = readJsonFile<Customer[]>('customers.json', []);
    const cIdx = custs.findIndex(
      (c) =>
        c.id === site.customer_id ||
        (c.name && site.customer_id && c.name.toLowerCase() === site.customer_id.toLowerCase())
    );
    if (cIdx >= 0) {
      const c = custs[cIdx];
      const cSites = Array.isArray(c.sites) ? [...c.sites] : [];
      const sIdx = cSites.findIndex((s) => s.id === site.id || s.site_name.trim().toLowerCase() === site.site_name.trim().toLowerCase());
      if (sIdx >= 0) {
        cSites[sIdx] = site;
      } else {
        cSites.push(site);
      }
      c.sites = cSites;
      c.updated_at = now;
      writeJsonFile('customers.json', custs, true);
    }
  } catch (syncErr) {
    console.warn('Sync site balance to customer profile note:', syncErr);
  }

  // Sync site update directly into customer profile in customers.json
  try {
    const custs = readJsonFile<Customer[]>('customers.json', []);
    const cIdx = custs.findIndex(
      (c) =>
        c.id === record.customer_id ||
        (c.name && record.customer_id && c.name.toLowerCase() === record.customer_id.toLowerCase())
    );
    if (cIdx >= 0) {
      const c = custs[cIdx];
      const cSites = Array.isArray(c.sites) ? [...c.sites] : [];
      const sIdx = cSites.findIndex((s) => s.id === record.id || s.site_name.trim().toLowerCase() === record.site_name.trim().toLowerCase());
      if (sIdx >= 0) {
        cSites[sIdx] = record;
      } else {
        cSites.push(record);
      }
      c.sites = cSites;
      c.updated_at = now;
      writeJsonFile('customers.json', custs, true);
    }
  } catch (syncErr) {
    console.warn('Sync site to customer profile note:', syncErr);
  }

  return record;
}

export function reorderCustomerSites(
  customerId: string,
  orderedSiteIds: string[],
  user: string
): CustomerSite[] {
  const allSites = getCustomerSites();
  const custSites = allSites.filter((s) => s.customer_id === customerId);
  const otherSites = allSites.filter((s) => s.customer_id !== customerId);

  const siteMap = new Map(custSites.map((s) => [s.id, s]));
  const reordered: CustomerSite[] = [];

  orderedSiteIds.forEach((id, idx) => {
    const s = siteMap.get(id);
    if (s) {
      s.order_index = idx;
      s.updated_at = new Date().toISOString();
      reordered.push(s);
      siteMap.delete(id);
    }
  });

  siteMap.forEach((s) => {
    s.order_index = reordered.length;
    reordered.push(s);
  });

  const finalSites = [...otherSites, ...reordered];
  saveCustomerSites(finalSites);

  recordAuditLog({
    entity_type: 'site_adjustment',
    entity_id: customerId,
    user_id: user,
    user_name: user,
    action: 'REORDER_SITES',
    updated_values: { orderedSiteIds },
    reason: `Reordered ${orderedSiteIds.length} sites for customer ${customerId}`,
  });

  return reordered;
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

  // Sync updated site balance directly to customer profile in customers.json
  try {
    const custs = readJsonFile<Customer[]>('customers.json', []);
    const cIdx = custs.findIndex(
      (c) =>
        c.id === site.customer_id ||
        (c.name && site.customer_id && c.name.toLowerCase() === site.customer_id.toLowerCase())
    );
    if (cIdx >= 0) {
      const c = custs[cIdx];
      const cSites = Array.isArray(c.sites) ? [...c.sites] : [];
      const sIdx = cSites.findIndex((s) => s.id === site.id || s.site_name.trim().toLowerCase() === site.site_name.trim().toLowerCase());
      if (sIdx >= 0) {
        cSites[sIdx] = site;
      } else {
        cSites.push(site);
      }
      c.sites = cSites;
      c.updated_at = now;
      writeJsonFile('customers.json', custs, true);
    }
  } catch (syncErr) {
    console.warn('Sync site balance to customer profile note:', syncErr);
  }

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

  // Sync updated site balance directly to customer profile in customers.json
  try {
    const custs = readJsonFile<Customer[]>('customers.json', []);
    const cIdx = custs.findIndex(
      (c) =>
        c.id === site.customer_id ||
        (c.name && site.customer_id && c.name.toLowerCase() === site.customer_id.toLowerCase())
    );
    if (cIdx >= 0) {
      const c = custs[cIdx];
      const cSites = Array.isArray(c.sites) ? [...c.sites] : [];
      const sIdx = cSites.findIndex((s) => s.id === site.id || s.site_name.trim().toLowerCase() === site.site_name.trim().toLowerCase());
      if (sIdx >= 0) {
        cSites[sIdx] = site;
      } else {
        cSites.push(site);
      }
      c.sites = cSites;
      c.updated_at = now;
      writeJsonFile('customers.json', custs, true);
    }
  } catch (syncErr) {
    console.warn('Sync site balance to customer profile note:', syncErr);
  }

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
    challan_id?: string;
    challan_number?: string;
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
    challan_id: site.challan_id,
    challan_number: site.challan_number,
  };
  const now = new Date().toISOString();

  if (data.site_name !== undefined) site.site_name = data.site_name.trim();
  if (data.opening_balance !== undefined) site.opening_balance = Number(data.opening_balance) || 0;
  if (data.credit_adjustment !== undefined) site.credit_adjustment = Number(data.credit_adjustment) || 0;
  if (data.debit_adjustment !== undefined) site.debit_adjustment = Number(data.debit_adjustment) || 0;
  if (data.challan_id !== undefined) site.challan_id = data.challan_id || undefined;
  if (data.challan_number !== undefined) site.challan_number = data.challan_number || undefined;
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

  // Sync updated site balance directly to customer profile in customers.json
  try {
    const custs = readJsonFile<Customer[]>('customers.json', []);
    const cIdx = custs.findIndex(
      (c) =>
        c.id === site.customer_id ||
        (c.name && site.customer_id && c.name.toLowerCase() === site.customer_id.toLowerCase())
    );
    if (cIdx >= 0) {
      const c = custs[cIdx];
      const cSites = Array.isArray(c.sites) ? [...c.sites] : [];
      const sIdx = cSites.findIndex((s) => s.id === site.id || s.site_name.trim().toLowerCase() === site.site_name.trim().toLowerCase());
      if (sIdx >= 0) {
        cSites[sIdx] = site;
      } else {
        cSites.push(site);
      }
      c.sites = cSites;
      c.updated_at = now;
      writeJsonFile('customers.json', custs, true);
    }
  } catch (syncErr) {
    console.warn('Sync site balance to customer profile note:', syncErr);
  }

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

  // Sync site deletion from customer profile in customers.json
  try {
    const custs = readJsonFile<Customer[]>('customers.json', []);
    const cIdx = custs.findIndex(
      (c) =>
        c.id === removed.customer_id ||
        (c.name && removed.customer_id && c.name.toLowerCase() === removed.customer_id.toLowerCase())
    );
    if (cIdx >= 0) {
      const c = custs[cIdx];
      if (Array.isArray(c.sites)) {
        c.sites = c.sites.filter((s) => s.id !== siteId && s.id !== removed.id);
        c.updated_at = new Date().toISOString();
        writeJsonFile('customers.json', custs, true);
      }
    }
  } catch (err) {
    console.warn('Sync site deletion to customer profile note:', err);
  }

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
  customer_name?: string;
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
  cleared_at?: string;
  retention_expires_at?: string;
  is_cleared?: boolean;
  last_updated?: string;
  updated_by?: string;
  reason?: string;
  revision_history?: Array<{
    timestamp: string;
    edited_by: string;
    reason: string;
    changes?: string[];
  }>;
}

export function getManualLedgerEntries(): ManualLedgerEntry[] {
  return readJsonFile<ManualLedgerEntry[]>('manual_ledger_entries.json', []);
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

export function deletePayment(id: string): boolean {
  const payments = getPayments();
  const idx = payments.findIndex((p) => p.id === id);
  if (idx < 0) return false;
  payments.splice(idx, 1);
  savePayments(payments);
  return true;
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

export function deleteGoodsReturn(id: string): boolean {
  const returns = getGoodsReturns();
  const idx = returns.findIndex((r) => r.id === id);
  if (idx < 0) return false;
  returns.splice(idx, 1);
  saveGoodsReturns(returns);
  return true;
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

export function deleteSiteAdjustment(id: string): boolean {
  const list = getSiteAdjustments();
  const idx = list.findIndex((a) => a.id === id);
  if (idx < 0) return false;
  list.splice(idx, 1);
  saveSiteAdjustments(list);
  return true;
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

export function deleteChallanRecord(challanId: string, user: string): boolean {
  const challans = getAllChallans();
  const lower = challanId.trim().toLowerCase();
  const stripped = lower.replace(/^entry_ch_/, '');
  const idx = challans.findIndex(
    (c) =>
      c.id === challanId ||
      c.id.toLowerCase() === lower ||
      c.id.toLowerCase() === stripped ||
      (c.challan_number && c.challan_number.trim().toLowerCase() === lower) ||
      (c.challan_number && c.challan_number.trim().toLowerCase() === stripped)
  );
  if (idx < 0) return false;

  challans[idx].is_deleted = true;
  challans[idx].status = 'void';
  challans[idx].updated_at = new Date().toISOString();
  saveAllChallans(challans);
  return true;
}

export function deleteLedgerEntry(
  options: {
    entryId?: string;
    sourceType?: string;
    challanId?: string;
    paymentId?: string;
    returnId?: string;
    manualId?: string;
  },
  user: string
): { success: boolean; deletedType?: string } {
  const { entryId, sourceType, challanId, paymentId, returnId, manualId } = options;

  // 1. Manual Ledger Entry
  if (sourceType === 'manual' || manualId || (entryId && entryId.startsWith('mle_'))) {
    const idToDelete = manualId || entryId!;
    const ok = deleteManualLedgerEntry(idToDelete);
    if (ok) {
      recordAuditLog({
        entity_type: 'site_adjustment',
        entity_id: idToDelete,
        user_id: user,
        user_name: user,
        action: 'DELETE_LEDGER_ENTRY',
        reason: `Deleted manual ledger entry: ${idToDelete}`,
      });
      return { success: true, deletedType: 'manual' };
    }
  }

  // 2. Payment Entry
  if (sourceType === 'payment' || paymentId) {
    const idToDelete = paymentId || entryId!;
    const ok = deletePayment(idToDelete);
    if (ok) {
      recordAuditLog({
        entity_type: 'payment',
        entity_id: idToDelete,
        user_id: user,
        user_name: user,
        action: 'DELETE_LEDGER_ENTRY',
        reason: `Deleted payment receipt entry from ledger: ${idToDelete}`,
      });
      return { success: true, deletedType: 'payment' };
    }
  }

  // 3. Goods Return Entry
  if (sourceType === 'goods_return' || returnId) {
    const idToDelete = returnId || entryId!;
    const ok = deleteGoodsReturn(idToDelete);
    if (ok) {
      recordAuditLog({
        entity_type: 'goods_return',
        entity_id: idToDelete,
        user_id: user,
        user_name: user,
        action: 'DELETE_LEDGER_ENTRY',
        reason: `Deleted goods return entry from ledger: ${idToDelete}`,
      });
      return { success: true, deletedType: 'goods_return' };
    }
  }

  // 4. Challan Entry
  if (sourceType === 'challan' || challanId) {
    const idToDelete = challanId || entryId!;
    const ok = deleteChallanRecord(idToDelete, user);
    if (ok) {
      recordAuditLog({
        entity_type: 'challan',
        entity_id: idToDelete,
        user_id: user,
        user_name: user,
        action: 'DELETE_LEDGER_ENTRY',
        reason: `Deleted/voided challan entry from ledger: ${idToDelete}`,
      });
      return { success: true, deletedType: 'challan' };
    }
  }

  // 5. Site Adjustment Entry
  if (sourceType === 'site_adjustment') {
    const idToDelete = entryId!;
    const ok = deleteSiteAdjustment(idToDelete);
    if (ok) {
      recordAuditLog({
        entity_type: 'site_adjustment',
        entity_id: idToDelete,
        user_id: user,
        user_name: user,
        action: 'DELETE_LEDGER_ENTRY',
        reason: `Deleted site adjustment entry from ledger: ${idToDelete}`,
      });
      return { success: true, deletedType: 'site_adjustment' };
    }
  }

  // Fallback search across all entities if not explicitly tagged
  if (entryId) {
    if (deleteManualLedgerEntry(entryId)) return { success: true, deletedType: 'manual' };
    if (deletePayment(entryId)) return { success: true, deletedType: 'payment' };
    if (deleteGoodsReturn(entryId)) return { success: true, deletedType: 'goods_return' };
    if (deleteSiteAdjustment(entryId)) return { success: true, deletedType: 'site_adjustment' };
    if (deleteChallanRecord(entryId, user)) return { success: true, deletedType: 'challan' };
  }

  return { success: false };
}

const RETENTION_MS = 45 * 24 * 60 * 60 * 1000; // 45 days

/**
 * Auto-delete records that were marked cleared/settled and have passed the 45-day retention window
 */
export function purgeExpiredClearedRecords(): { purgedChallans: number; purgedManual: number; purgedPayments: number } {
  const now = Date.now();
  let purgedChallans = 0;
  let purgedManual = 0;
  let purgedPayments = 0;

  // 1. Challans: delete only when cleared_at is older than 45 days
  const allChallans = getAllChallans();
  const survivingChallans = allChallans.filter((c) => {
    if (c.cleared_at) {
      const clearedTime = new Date(c.cleared_at).getTime();
      if (now - clearedTime >= RETENTION_MS) {
        purgedChallans++;
        return false;
      }
    }
    return true;
  });
  if (purgedChallans > 0) {
    saveAllChallans(survivingChallans);
  }

  // 2. Manual entries
  const allManual = getManualLedgerEntries();
  const survivingManual = allManual.filter((m) => {
    if (m.cleared_at) {
      const clearedTime = new Date(m.cleared_at).getTime();
      if (now - clearedTime >= RETENTION_MS) {
        purgedManual++;
        return false;
      }
    }
    return true;
  });
  if (purgedManual > 0) {
    saveManualLedgerEntries(survivingManual);
  }

  // 3. Payments
  const allPayments = getPayments();
  const survivingPayments = allPayments.filter((p) => {
    if (p.cleared_at) {
      const clearedTime = new Date(p.cleared_at).getTime();
      if (now - clearedTime >= RETENTION_MS) {
        purgedPayments++;
        return false;
      }
    }
    return true;
  });
  if (purgedPayments > 0) {
    savePayments(survivingPayments);
  }

  return { purgedChallans, purgedManual, purgedPayments };
}

/**
 * Clear customer ledger with 45-day retention period.
 * Does NOT immediately delete records — keeps them intact in ledger history for 45 days,
 * after which purgeExpiredClearedRecords() will automatically delete them.
 */
export function clearCustomerLedger(
  customerId: string,
  user: string
): { success: boolean; clearedCount: number; retentionExpiresAt: string } {
  // First, purge any previously expired records (>45 days)
  purgeExpiredClearedRecords();

  const allCusts = getAllCustomers();
  const cust = allCusts.find(
    (c) =>
      c.id === customerId ||
      c.name?.toLowerCase() === customerId.toLowerCase() ||
      c.business_name?.toLowerCase() === customerId.toLowerCase()
  );

  const targetId = (customerId || '').trim().toLowerCase();
  const custId = (cust?.id || '').trim().toLowerCase();
  const custName = (cust?.name || '').trim().toLowerCase();
  const custBiz = (cust?.business_name || '').trim().toLowerCase();

  const isMatchThisCust = (itemCustId?: string, itemCustName?: string) => {
    const id = (itemCustId || '').trim().toLowerCase();
    const name = (itemCustName || '').trim().toLowerCase();
    if (targetId && (id === targetId || name === targetId)) return true;
    if (targetId && (name.includes(targetId) || targetId.includes(name))) return true;
    if (custId && (id === custId || name === custId)) return true;
    if (custName && (name === custName || name.includes(custName) || custName.includes(name))) return true;
    if (custBiz && (name === custBiz || name.includes(custBiz) || custBiz.includes(name))) return true;
    if (
      (targetId === 'cust_rk_sales' || targetId.includes('rk') || custName.includes('rk')) &&
      (name.includes('r k') || name.includes('rk sales'))
    ) {
      return true;
    }
    return false;
  };

  const nowIso = new Date().toISOString();
  const retentionExpiresAt = new Date(Date.now() + RETENTION_MS).toISOString();
  let clearedCount = 0;

  // 1. Mark manual ledger entries as cleared with 45-day retention (DO NOT delete immediately)
  const allManual = getManualLedgerEntries();
  let manualChanged = false;
  allManual.forEach((m) => {
    if (isMatchThisCust(m.customer_id) && !m.cleared_at) {
      m.cleared_at = nowIso;
      m.retention_expires_at = retentionExpiresAt;
      m.is_cleared = true;
      manualChanged = true;
      clearedCount++;
    }
  });
  if (manualChanged) {
    saveManualLedgerEntries(allManual);
  }

  // 2. Mark payments as cleared with 45-day retention (DO NOT delete immediately)
  const allPayments = getPayments();
  let paymentsChanged = false;
  allPayments.forEach((p: PaymentRecord) => {
    if (isMatchThisCust(p.customer_id, p.customer_name) && !p.cleared_at) {
      p.cleared_at = nowIso;
      p.retention_expires_at = retentionExpiresAt;
      p.is_cleared = true;
      paymentsChanged = true;
      clearedCount++;
    }
  });
  if (paymentsChanged) {
    savePayments(allPayments);
  }

  // 3. Mark customer challans as cleared with 45-day retention (DO NOT delete immediately)
  const allChallans = getAllChallans();
  let challanChanged = false;
  allChallans.forEach((c) => {
    if (isMatchThisCust(c.customer_id, c.customer_name) && !c.cleared_at && !c.is_deleted) {
      c.cleared_at = nowIso;
      c.retention_expires_at = retentionExpiresAt;
      c.is_cleared = true;
      c.updated_at = nowIso;
      challanChanged = true;
      clearedCount++;
    }
  });
  if (challanChanged) {
    saveAllChallans(allChallans);
  }

  recordAuditLog({
    entity_type: 'site_adjustment',
    entity_id: customerId,
    user_id: user,
    user_name: user,
    action: 'CLEAR_CUSTOMER_LEDGER_45_DAY_RETENTION',
    reason: `Cleared ledger for customer: ${customerId}. Retained for 45 days until ${retentionExpiresAt}`,
  });

  return { success: true, clearedCount, retentionExpiresAt };
}

/**
 * Rebuild / initialize a customer's ledger from all delivery challans with 1-click
 */
export function rebuildCustomerLedgerFromChallans(
  customerId: string,
  user: string
): { success: boolean; challansAttached: number; sitesCreated: number } {
  const allCusts = getAllCustomers();
  const cust = allCusts.find(
    (c) =>
      c.id === customerId ||
      c.name?.toLowerCase() === customerId.toLowerCase() ||
      c.business_name?.toLowerCase() === customerId.toLowerCase()
  );

  const targetId = (customerId || '').trim().toLowerCase();
  const custId = (cust?.id || customerId).trim();
  const custName = (cust?.name || cust?.business_name || '').trim().toLowerCase();

  const isMatchThisCust = (c: Challan) => {
    const cId = (c.customer_id || '').trim().toLowerCase();
    const cName = (c.customer_name || '').trim().toLowerCase();
    if (targetId && (cId === targetId || cName === targetId)) return true;
    if (targetId && (cName.includes(targetId) || targetId.includes(cName))) return true;
    if (custName && (cName === custName || cName.includes(custName) || custName.includes(cName))) return true;
    if (
      (targetId === 'cust_rk_sales' || targetId.includes('rk') || custName.includes('rk')) &&
      (cName.includes('r k') || cName.includes('rk sales'))
    ) {
      return true;
    }
    return false;
  };

  const allChallans = getAllChallans();
  const matchedChallans = allChallans.filter(
    (c) =>
      isMatchThisCust(c) &&
      !c.is_deleted &&
      c.status !== 'cancelled' &&
      c.status !== 'void' &&
      (c.status === 'approved' || Boolean((c as any).is_approved) || c.status === 'delivered' || (c as any).delivery_status === 'delivered' || Boolean((c as any).is_delivered))
  );

  // Auto-detect sites and save
  const detectedSites = getSitesByCustomerId(custId, matchedChallans);

  recordAuditLog({
    entity_type: 'challan',
    entity_id: custId,
    user_id: user,
    user_name: user,
    action: 'REBUILD_LEDGER_FROM_CHALLANS',
    reason: `Rebuilt ledger with ${matchedChallans.length} challans and ${detectedSites.length} sites`,
  });

  return {
    success: true,
    challansAttached: matchedChallans.length,
    sitesCreated: detectedSites.length,
  };
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
    customerName?: string;
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
  const customerSites = getSitesByCustomerId(customerId, challans);

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
    const targetName = (options?.customerName || '').trim().toLowerCase();
    const rId = (recCustId || '').trim().toLowerCase();
    const rName = (recCustName || '').trim().toLowerCase();

    if (rId && (rId === target || (targetName && rId === targetName))) return true;
    if (rName && (rName === target || (targetName && rName === targetName))) return true;
    if (target && rName && (rName.includes(target) || target.includes(rName))) return true;
    if (targetName && rName && (rName.includes(targetName) || targetName.includes(rName))) return true;
    if (target && rId && (rId.includes(target) || target.includes(rId))) return true;
    if (targetName && rId && (rId.includes(targetName) || targetName.includes(rId))) return true;

    if (cust) {
      const cId = (cust.id || '').trim().toLowerCase();
      const cName = (cust.name || '').trim().toLowerCase();
      const cBiz = (cust.business_name || '').trim().toLowerCase();
      const cComp = (cust.company_name || '').trim().toLowerCase();

      if (rId && (rId === cId || rId === cName || rId === cBiz || rId === cComp)) return true;
      if (rName && (rName === cId || rName === cName || rName === cBiz || rName === cComp)) return true;
      if (cName && (rName.includes(cName) || cName.includes(rName))) return true;
      if (cBiz && (rName.includes(cBiz) || cBiz.includes(rName))) return true;
    }
    return false;
  };

  // Run auto-purge for any cleared ledger records that exceeded the 45-day retention window
  purgeExpiredClearedRecords();

  const rawEntries: Array<{
    date: string;
    particulars: string;
    reference: string;
    voucher_type: CustomerLedgerEntry['voucher_type'];
    source_type?: CustomerLedgerEntry['source_type'];
    payment_type?: string;
    site_name?: string;
    debit: number;
    credit: number;
    challan_id?: string;
    payment_id?: string;
    return_id?: string;
    manual_id?: string;
    is_paid?: boolean;
    paid_amount?: number;
    payment_status?: 'paid' | 'partial' | 'unpaid';
    created_at: string;
    last_updated?: string;
    updated_by?: string;
    reason?: string;
    revision_history?: any[];
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

  // 1. Manual Ledger Entries (processed first so manual overrides & admin edits take precedence)
  manualEntries.forEach((mle) => {
    if (!isMatchCust(mle.customer_id, mle.customer_name || mle.customer_id)) {
      return;
    }
    if (options?.siteName && mle.site_name && mle.site_name.toLowerCase() !== options.siteName.toLowerCase()) return;

    // Auto-heal any legacy entry with payment mode / "To By Cash" having debit > 0
    const isPaymentMode =
      (mle.payment_type && ['cash', 'upi', 'cheque', 'bank transfer', 'receipt', 'payment', 'credit adjustment'].includes(mle.payment_type.toLowerCase())) ||
      (mle.particulars && /(by\s+(cash|upi|cheque|bank|hdfc)|to\s+by\s+(cash|upi|cheque|bank|hdfc))/i.test(mle.particulars));

    if (isPaymentMode && Number(mle.debit) > 0 && Number(mle.credit) === 0) {
      mle.credit = Number(mle.debit);
      mle.debit = 0;
      mle.particulars = cleanTallyParticulars(mle.particulars, false);
    }

    const isDebit = (Number(mle.debit) || 0) > 0;
    const formattedParticulars = cleanTallyParticulars(mle.particulars, isDebit);

    // CRITICAL: Only DEBIT manual entries (sales challan adjustments) override sales challans.
    // A Credit receipt (payment) referencing the challan number must NEVER suppress the challan debit!
    if (isDebit) {
      const refKey = (mle.voucher_no || '').trim().toLowerCase();
      const idKey = (mle.challan_id || '').toLowerCase();
      if (refKey) addedChallanKeys.add(refKey);
      if (idKey) addedChallanKeys.add(idKey);
    }

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

    const revs = Array.isArray(mle.revision_history) && mle.revision_history.length > 0
      ? mle.revision_history[mle.revision_history.length - 1]
      : null;

    rawEntries.push({
      date: mle.date,
      particulars: formattedParticulars,
      reference: mle.voucher_no,
      voucher_type: isDebit ? 'sales_gst' : 'receipt',
      source_type: 'manual',
      manual_id: mle.id,
      payment_type: mle.payment_type || (isDebit ? 'Sales GST' : 'Receipt'),
      site_name: mle.site_name,
      debit: Number(mle.debit) || 0,
      credit: Number(mle.credit) || 0,
      challan_id: linkedId,
      is_paid: isPaid,
      created_at: mle.created_at,
      last_updated: mle.last_updated || (revs ? revs.timestamp : undefined),
      updated_by: mle.updated_by || (revs ? revs.edited_by : undefined),
      reason: mle.reason || (revs ? revs.reason : undefined),
      revision_history: mle.revision_history,
    });
  });

  // 2. Challans / Invoices -> DEBIT (Sales GST) - auto-fetched immediately upon creation
  challans.forEach((c) => {
    if (!isMatchCust(c.customer_id, c.customer_name)) {
      return;
    }
    if (c.is_deleted || c.status === 'cancelled' || c.status === 'void') return;

    // Delivery & Admin Approval Gate:
    // Only challans approved by Admin (confirming delivered) enter the party ledger.
    // Unapproved challans must be approved in Delivery Status by Admin before entering ledger.
    const isApproved = Boolean((c as any).is_approved) || c.status === 'approved' || (c as any).delivery_status === 'approved';
    const isDelivered = Boolean((c as any).is_delivered) || c.status === 'delivered' || (c as any).delivery_status === 'delivered';
    const isApprovedAndDelivered = isApproved && (isDelivered || Boolean((c as any).approved_at));
    if (!isApprovedAndDelivered) return;

    if (options?.siteId && c.site_id && c.site_id !== options.siteId) return;
    if (options?.siteName && c.site_name && c.site_name.toLowerCase() !== options.siteName.toLowerCase()) return;

    // Skip if already overridden by manual entry
    if (c.id && addedChallanKeys.has(c.id.toLowerCase())) return;
    if (c.challan_number && addedChallanKeys.has(c.challan_number.trim().toLowerCase())) return;
    if (c.reference_number && addedChallanKeys.has(c.reference_number.trim().toLowerCase())) return;

    const amt = Number(c.total_amount) || 0;
    if (amt > 0) {
      if (c.id) addedChallanKeys.add(c.id.toLowerCase());
      if (c.challan_number) addedChallanKeys.add(c.challan_number.trim().toLowerCase());
      if (c.reference_number) addedChallanKeys.add(c.reference_number.trim().toLowerCase());

      const itemsCount = (c.items || []).length;
      let itemSummary = '';
      if (Array.isArray(c.items) && c.items.length > 0) {
        const itemNames = c.items
          .map((it) => {
            const desc = (it.item_description || it.brand || '').trim();
            const qty = it.quantity ? ` (${it.quantity} ${it.unit || ''})`.trim() : '';
            return `${desc}${qty}`.trim();
          })
          .filter(Boolean);
        if (itemNames.length > 0) {
          itemSummary = itemNames.slice(0, 3).join(', ') + (itemNames.length > 3 ? ` +${itemNames.length - 3} more` : '');
        }
      }

      const basePrefix = c.apply_gst ? 'To SALE GST 18%' : 'To SALE';
      const desc = (c as any).particulars && (c as any).particulars.trim()
        ? (c as any).particulars.trim()
        : itemSummary
        ? `${basePrefix}: ${itemSummary}`
        : `${basePrefix} (${itemsCount} items)`;

      const paidSum = (paymentsByChallan.get(c.id) || 0) + (paymentsByChallan.get(c.challan_number?.trim().toLowerCase()) || 0);
      const isPaid = Boolean(c.payment_status === 'paid' || (amt > 0 && paidSum >= amt));

      const revs = Array.isArray(c.revision_history) && c.revision_history.length > 0
        ? c.revision_history[c.revision_history.length - 1]
        : null;

      rawEntries.push({
        date: c.challan_date || c.created_at,
        particulars: desc,
        reference: c.challan_number,
        voucher_type: 'sales_gst',
        source_type: 'challan',
        payment_type: 'Sales GST',
        site_name: c.site_name || c.delivery_address || undefined,
        debit: amt,
        credit: 0,
        challan_id: c.id,
        is_paid: isPaid,
        paid_amount: paidSum,
        payment_status: isPaid ? 'paid' : (paidSum > 0 ? 'partial' : 'unpaid'),
        created_at: c.created_at || c.challan_date,
        last_updated: revs ? revs.timestamp : (c.updated_at && c.updated_at !== c.created_at ? c.updated_at : undefined),
        updated_by: revs ? revs.edited_by : undefined,
        reason: revs ? revs.reason : undefined,
        revision_history: c.revision_history,
      });
    }
  });

  // 3. Payments Received -> CREDIT (Receipt)
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
        source_type: 'payment',
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

  // 4. Goods Returns -> CREDIT
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
        source_type: 'goods_return',
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
        source_type: 'site_adjustment',
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
        source_type: 'site_adjustment',
        payment_type: 'Credit Adjustment',
        site_name: adj.site_name,
        debit: 0,
        credit: amt,
        created_at: adj.created_at,
      });
    }
  });

  // Sort raw entries chronologically downwards (oldest at top, newest at bottom)
  // On the same date/day: Debit entries first, then Credit entries below it
  rawEntries.sort((a, b) => {
    const da = new Date(a.date).getTime() || 0;
    const db = new Date(b.date).getTime() || 0;
    if (da !== db) return da - db;
    // Sequence: Debit first (weight 0), then Credit (weight 1)
    const aWeight = (a.debit || 0) > 0 ? 0 : 1;
    const bWeight = (b.debit || 0) > 0 ? 0 : 1;
    if (aWeight !== bWeight) return aWeight - bWeight;
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
    if (tf.includes('challan') || tf.includes('party')) {
      filtered = filtered.filter(
        (e) =>
          e.source_type === 'challan' ||
          e.voucher_type === 'sales_gst' ||
          (e.payment_type || '').toLowerCase().includes('sales')
      );
    } else {
      filtered = filtered.filter((e) => (e.payment_type || '').toLowerCase().includes(tf));
    }
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
      source_type: item.source_type,
      payment_type: item.payment_type || (item.debit > 0 ? 'Sales GST' : 'Receipt'),
      site_name: item.site_name,
      debit: item.debit,
      credit: item.credit,
      running_balance: running,
      challan_id: item.challan_id,
      payment_id: item.payment_id,
      return_id: item.return_id,
      manual_id: item.manual_id,
      is_paid: item.is_paid,
      paid_amount: item.paid_amount,
      payment_status: item.payment_status,
      last_updated: item.last_updated,
      updated_by: item.updated_by,
      reason: item.reason,
      revision_history: item.revision_history,
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

  const finalClosingBalance = Math.round(running * 100) / 100;
  const is_account_settled = finalClosingBalance <= 0;

  return {
    openingBalance: periodOpeningBalance,
    totalDebit: Math.round(totalDebit * 100) / 100,
    totalCredit: Math.round(totalCredit * 100) / 100,
    closingBalance: finalClosingBalance,
    verifiedSiteDebits: Math.round(verifiedSiteDebits * 100) / 100,
    verifiedSiteCredits: Math.round(verifiedSiteCredits * 100) / 100,
    netVerifiedSiteAdjustment: 0,
    verifiedClosingBalance: finalClosingBalance,
    is_account_settled,
    entries,
    sites: customerSites,
  };
}

/**
 * Compute Overall Ledger Calculation Summary for All Parties
 */
export function computeAllPartiesLedgerSummary(): {
  summary: {
    totalParties: number;
    totalDebit: number;
    totalCredit: number;
    totalOutstanding: number;
    totalReceivable: number;
    totalPayable: number;
  };
  parties: Array<{
    id: string;
    name: string;
    business_name: string;
    contact_person: string;
    phone: string;
    is_architect: boolean;
    credit_status: string;
    sites_count: number;
    sites: string[];
    opening_balance: number;
    total_debit: number;
    total_credit: number;
    closing_balance: number;
    last_activity_date?: string;
  }>;
} {
  const allCusts = getAllCustomers();
  const allChallans = getAllChallans();

  let totDebit = 0;
  let totCredit = 0;
  let totOutstanding = 0;
  let totReceivable = 0;
  let totPayable = 0;

  const parties = allCusts.map((c) => {
    const l = computeCustomerLedger(c.id, {
      customerName: c.name || c.business_name,
      allChallans,
      customers: allCusts,
    });

    const dr = Math.round(l.totalDebit * 100) / 100;
    const cr = Math.round(l.totalCredit * 100) / 100;
    const bal = Math.round(l.closingBalance * 100) / 100;

    totDebit += dr;
    totCredit += cr;
    totOutstanding += bal;
    if (bal > 0) totReceivable += bal;
    else if (bal < 0) totPayable += Math.abs(bal);

    const siteNames = (l.sites || []).map((s) => s.site_name).filter(Boolean);
    const lastEntry = l.entries && l.entries.length > 0 ? l.entries[l.entries.length - 1] : undefined;

    return {
      id: c.id,
      name: c.name || c.business_name || 'Party',
      business_name: c.business_name || c.name || 'Party',
      contact_person: c.contact_person || '',
      phone: c.phone || '',
      is_architect: Boolean(c.is_architect || c.customer_type === 'architect'),
      credit_status: c.credit_status || 'credit',
      sites_count: siteNames.length,
      sites: siteNames,
      opening_balance: Math.round((Number(l.openingBalance) || 0) * 100) / 100,
      total_debit: dr,
      total_credit: cr,
      closing_balance: bal,
      last_activity_date: lastEntry?.date,
    };
  });

  return {
    summary: {
      totalParties: parties.length,
      totalDebit: Math.round(totDebit * 100) / 100,
      totalCredit: Math.round(totCredit * 100) / 100,
      totalOutstanding: Math.round(totOutstanding * 100) / 100,
      totalReceivable: Math.round(totReceivable * 100) / 100,
      totalPayable: Math.round(totPayable * 100) / 100,
    },
    parties,
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

// ----------------------------------------------------
// 8. QUOTATIONS (PRE-CHALLAN ESTIMATES & SELECTIONS)
// ----------------------------------------------------
export function getAllQuotations(): Quotation[] {
  let quotes = readJsonFile<Quotation[]>('quotations.json', []);
  if (!Array.isArray(quotes)) quotes = [];
  return quotes;
}

export function saveQuotations(quotes: Quotation[]): void {
  writeJsonFile('quotations.json', quotes, true);
}

export async function saveQuotationsAsync(quotes: Quotation[]): Promise<boolean> {
  const { safeWriteDataFileAsync } = await import('@/lib/server-storage');
  return safeWriteDataFileAsync('quotations.json', quotes);
}

