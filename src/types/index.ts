// Database types for Showhouse ERP, Challan Management & Accounting System

export type ChallanStatus =
  | 'pending'
  | 'approved'
  | 'out_for_delivery'
  | 'delivered'
  | 'partially_delivered'
  | 'cancelled'
  | 'goods_returned'
  | 'draft'
  | 'final'
  | 'void';

export type ShareStatus = 'not_shared' | 'share_initiated' | 'user_marked_sent' | 'failed';
export type UnitType = 'sheets' | 'pieces' | 'boxes' | 'bundles' | 'sq.ft' | 'running ft' | 'nos';

export type UserRole = 'admin' | 'accountant' | 'employee';

export interface AuthUser {
  username: string;
  name: string;
  role: UserRole;
}

export interface EmployeeAccount {
  id: string;
  username: string;
  name: string;
  phone?: string;
  password: string;
  role: UserRole;
  is_active: boolean;
  po_prefix?: string;
  created_at?: string;
}

export interface BusinessProfile {
  id: string;
  user_id: string;
  business_name: string;
  tagline?: string | null;
  legal_name?: string | null;
  logo_url: string | null;
  address: string;
  phone: string;
  email: string | null;
  gstin: string | null;
  state?: string | null;
  state_code?: string | null;
  challan_prefix: string;
  challan_next_number?: number;
  pi_prefix?: string;
  pi_next_number?: number;
  financial_year_start_month: number; // 4 = April
  default_unit: UnitType;
  footer_message: string;
  bank_name?: string | null;
  bank_account?: string | null;
  bank_ifsc?: string | null;
  bank_branch?: string | null;
  terms_conditions?: string | null;
  employees?: string[];
  show_rate_column: boolean;
  show_amount_column: boolean;
  show_signature_area: boolean;
  show_prepared_by: boolean;
  tally_server_url?: string;
  tally_company_name?: string;
  default_credit_days?: number;
  created_at: string;
  updated_at: string;
}

export interface CustomerSite {
  id: string;
  customer_id: string;
  site_name: string;
  name?: string;
  site_address: string;
  location?: string;
  contact_person?: string;
  site_incharge?: string;
  phone?: string;
  contact_phone?: string;
  opening_balance?: number;
  credit_adjustment?: number; // Credit (+) adjustment (₹)
  debit_adjustment?: number;  // Debit (-) adjustment (₹)
  current_balance?: number;   // Calculated site balance
  is_verified?: boolean;      // Verified by accountant/admin
  verified_at?: string | null;
  verified_by?: string | null;
  audit_history?: Array<{
    action: string;
    user: string;
    timestamp: string;
    reason?: string;
    prev_values?: any;
    new_values?: any;
  }>;
  is_active?: boolean;
  created_at: string;
  updated_at?: string;
}

export interface Customer {
  id: string;
  user_id: string;
  business_name: string;
  name?: string;
  company_name?: string;
  contact_person: string | null;
  phone: string;
  billing_address: string;
  delivery_address: string | null;
  gstin: string | null;
  notes: string | null;
  is_active: boolean;
  opening_balance?: number;
  credit_days?: number; // Default 45 days
  credit_limit?: number; // e.g. ₹2,00,000
  is_credit_blocked?: boolean;
  credit_block_reason?: string;
  sites?: CustomerSite[];
  tally_ledger_name?: string;
  created_at: string;
  updated_at: string;
}

export interface Product {
  id: string;
  user_id: string;
  name: string;
  brand: string | null;
  sku: string | null;
  colour_design: string | null;
  colour_finish?: string | null;
  size_thickness: string | null;
  size?: string | null;
  unit: UnitType;
  default_rate: number | null;
  rate?: number | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface DeliveryHistoryEntry {
  status: ChallanStatus;
  updated_at: string;
  updated_by: string;
  remarks?: string;
}

export interface Challan {
  id: string;
  user_id: string;
  challan_number: string;
  pi_number?: string | null;
  document_type?: 'challan' | 'proforma_invoice' | 'both';
  challan_date: string;
  customer_id: string;
  customer_name: string;
  customer_phone: string;
  customer_address: string;
  customer_gstin: string | null;
  delivery_address: string | null;
  site_id?: string | null;
  site_name?: string | null;
  reference_number: string | null;
  notes: string | null;
  prepared_by: string | null;
  created_by?: string | null;
  status: ChallanStatus;
  delivery_status?: ChallanStatus;
  share_status: ShareStatus;
  is_approved?: boolean;
  is_delivered?: boolean;
  delivered_at?: string | null;
  delivered_by?: string | null;
  delivery_confirmed_at?: string | null;
  delivery_confirmed_by?: string | null;
  delivery_remarks?: string | null;
  proof_of_delivery?: string | null;
  delivery_history?: DeliveryHistoryEntry[];
  approved_at?: string | null;
  approved_by?: string | null;
  total_quantity: number;
  subtotal_amount?: number | null;
  discount_type?: 'percent' | 'amount' | null;
  discount_value?: number | null;
  discount_percent?: number | null;
  discount_amount?: number | null;
  total_amount: number | null;
  payment_status?: 'unpaid' | 'partial' | 'paid' | null;
  paid_amount?: number | null;
  paid_at?: string | null;
  transportation_charges?: number | null;
  loading_charges?: number | null;
  apply_gst?: boolean | null;
  cgst_amount?: number | null;
  sgst_amount?: number | null;
  apply_additional_9?: boolean | null;
  additional_9_amount?: number | null;
  is_deleted?: boolean;
  deleted_at?: string | null;
  created_at: string;
  updated_at: string;
  // Joined data
  items?: ChallanItem[];
  customer?: Customer;
}

export interface ChallanItem {
  id: string;
  challan_id: string;
  serial_number: number;
  product_id: string | null;
  item_description: string;
  description?: string;
  brand: string | null;
  colour_finish: string | null;
  size: string | null;
  unit: UnitType;
  quantity: number;
  rate: number | null;
  discount_type?: 'percent' | 'amount' | null;
  discount_value?: number | null;
  discount_percent?: number | null;
  discount_amount?: number | null;
  amount: number | null;
  length?: number | string | null;
  width?: number | string | null;
  dimension_unit?: 'ft' | 'in' | 'm' | null;
  calculated_sqft?: number | string | null;
  created_at: string;
}

// ----------------------------------------------------
// Goods Returns
// ----------------------------------------------------
export interface GoodsReturn {
  id: string;
  return_number: string;
  challan_id: string;
  challan_number: string;
  customer_id: string;
  customer_name: string;
  site_id?: string | null;
  site_name?: string | null;
  return_date: string;
  reason: string;
  total_return_quantity: number;
  total_return_amount: number;
  total_quantity?: number;
  total_amount?: number;
  created_by: string;
  created_at: string;
  items: GoodsReturnItem[];
}

export interface GoodsReturnItem {
  id: string;
  return_id: string;
  original_item_id: string;
  item_description: string;
  description?: string;
  unit: UnitType;
  delivered_quantity: number;
  previously_returned: number;
  return_quantity: number;
  rate: number;
  return_amount: number;
  amount?: number;
}

// ----------------------------------------------------
// Payments Received
// ----------------------------------------------------
export type PaymentMode = 'cash' | 'bank_transfer' | 'upi' | 'cheque' | 'other';

export interface PaymentRecord {
  id: string;
  receipt_number: string;
  customer_id: string;
  customer_name: string;
  site_id?: string | null;
  site_name?: string | null;
  challan_id?: string | null;
  challan_number?: string | null;
  amount: number;
  payment_mode: PaymentMode;
  payment_date: string;
  reference_no?: string | null;
  notes?: string | null;
  created_by: string;
  created_at: string;
}

// ----------------------------------------------------
// Site-Wise Accounting (PLUS/MINUS Adjustments)
// ----------------------------------------------------
export type SiteAdjustmentType = 'plus' | 'minus';

export interface SiteAdjustment {
  id: string;
  adjustment_number: string;
  site_id: string;
  site_name: string;
  customer_id: string;
  customer_name: string;
  type: SiteAdjustmentType;
  adjustment_type?: SiteAdjustmentType;
  amount: number;
  reason: string;
  category?: string;
  reference_no?: string | null;
  created_by: string;
  approved_by?: string | null;
  entry_date?: string;
  created_at: string;
}

export interface SiteAccountingSummary {
  siteId: string;
  siteName: string;
  siteAddress?: string;
  customerId: string;
  customerName: string;
  openingBalance: number;
  totalChallanAmount: number;
  challanCount?: number;
  totalPlusEntries?: number;
  totalPlusAdjustments?: number;
  totalMinusEntries?: number;
  totalMinusAdjustments?: number;
  totalPayments?: number;
  totalPaymentsReceived?: number;
  totalReturns?: number;
  totalGoodsReturns?: number;
  closingOutstanding?: number;
  closingOutstandingBalance: number;
}

// ----------------------------------------------------
// Party Ledger
// ----------------------------------------------------
export interface CustomerLedgerEntry {
  id: string;
  date: string;
  particulars: string;
  reference: string;
  voucher_type: 'challan' | 'payment' | 'goods_return' | 'site_plus' | 'site_minus' | 'opening' | 'sales_gst' | 'receipt' | 'journal';
  payment_type?: string; // 'Receipt' | 'Sales GST' | 'Payment' | 'Goods Return' | etc.
  site_name?: string;
  debit: number;
  credit: number;
  running_balance: number;
  challan_id?: string;
  payment_id?: string;
  return_id?: string;
  is_verified?: boolean;
  is_paid?: boolean;
  payment_status?: 'paid' | 'partial' | 'unpaid';
  paid_amount?: number;
}

// ----------------------------------------------------
// Party Credit Control & Exceptions
// ----------------------------------------------------
export interface CreditException {
  id: string;
  customer_id: string;
  customer_name: string;
  authorized_by: string;
  reason: string;
  expires_at: string;
  is_active?: boolean;
  created_at: string;
}

export interface CustomerCreditStatus {
  customerId: string;
  customerName: string;
  creditLimit: number;
  creditDays: number;
  totalOutstanding: number;
  isOverdue?: boolean;
  oldestOverdueDate?: string;
  daysOverdue?: number;
  isOverLimit?: boolean;
  isBlocked: boolean;
  blockReason?: string;
  hasException?: boolean;
  hasActiveException?: boolean;
  exceptionExpiresAt?: string;
  overdueAmount?: number;
  oldestPendingDate?: string;
  oldestOverdueDays?: number;
  canCreateChallan?: boolean;
}

// ----------------------------------------------------
// Tally Integration
// ----------------------------------------------------
export interface TallySettings {
  server_url: string;
  company_name: string;
  auto_sync: boolean;
  last_sync_at?: string | null;
}

export interface TallyPartyMapping {
  customer_id: string;
  customer_name: string;
  tally_ledger_name: string;
  tally_parent_group?: string;
  tally_guid?: string | null;
  is_synced: boolean;
  last_synced_at?: string | null;
}

export interface TallySyncLog {
  id: string;
  timestamp: string;
  voucher_type: 'Sales' | 'Receipt' | 'Credit Note' | 'Debit Note' | 'Ledger';
  reference_no: string;
  party_name: string;
  amount: number;
  status: 'success' | 'failed' | 'pending';
  action?: string;
  records_synced?: number;
  message?: string;
  error_message?: string | null;
  tally_guid?: string | null;
}

// ----------------------------------------------------
// Audit Trail
// ----------------------------------------------------
export interface AuditLog {
  id: string;
  entity_type: 'challan' | 'customer' | 'payment' | 'credit_control' | 'site_adjustment' | 'goods_return';
  entity_id: string;
  reference_no?: string;
  user_id: string;
  user_name: string;
  action: string;
  previous_values?: Record<string, any> | null;
  updated_values?: Record<string, any> | null;
  reason?: string | null;
  timestamp: string;
}

export interface ChallanActivityLog {
  id: string;
  challan_id: string;
  user_id: string;
  action: string;
  details: string | null;
  created_at: string;
}

// Form types
export interface ChallanFormData {
  challan_date: string;
  challan_number?: string;
  pi_number?: string;
  document_type?: 'challan' | 'proforma_invoice' | 'both';
  customer_id: string;
  customer_name: string;
  customer_phone: string;
  customer_address: string;
  customer_gstin: string;
  delivery_address: string;
  site_id?: string;
  site_name?: string;
  reference_number: string;
  notes: string;
  prepared_by: string;
  created_by?: string;
  discount_type?: 'percent' | 'amount';
  discount_value?: number | string;
  discount_amount?: number | string;
  transportation_charges?: number | string;
  loading_charges?: number | string;
  apply_gst?: boolean;
  apply_additional_9?: boolean;
  additional_9_amount?: number | null;
  items: ChallanItemFormData[];
}

export interface ChallanItemFormData {
  product_id: string;
  item_description: string;
  brand: string;
  colour_finish: string;
  size: string;
  unit: UnitType;
  quantity: number | string;
  rate: number | string;
  discount_type?: 'percent' | 'amount';
  discount_value?: number | string;
  discount_amount?: number | string;
  amount: number | string;
  length?: number | string;
  width?: number | string;
  dimension_unit?: 'ft' | 'in' | 'm';
  calculated_sqft?: number | string;
}

export interface CustomerFormData {
  business_name: string;
  contact_person: string;
  phone: string;
  billing_address: string;
  delivery_address: string;
  gstin: string;
  notes: string;
  opening_balance?: number | string;
  credit_days?: number | string;
  credit_limit?: number | string;
  sites?: Array<{ site_name: string; site_address: string; contact_person?: string; phone?: string }>;
}

export interface ProductFormData {
  name: string;
  brand: string;
  sku: string;
  colour_design: string;
  size_thickness: string;
  unit: UnitType;
  default_rate: number | string;
}

export interface BusinessSetupFormData {
  business_name: string;
  address: string;
  phone: string;
  email: string;
  gstin: string;
  challan_prefix: string;
  financial_year_start_month: number;
  default_unit: UnitType;
  footer_message: string;
  show_rate_column: boolean;
  show_amount_column: boolean;
  show_signature_area: boolean;
  show_prepared_by: boolean;
  employees?: string[];
}

export interface DashboardStats {
  totalChallans: number;
  challansToday: number;
  challansThisMonth: number;
  challansLastMonth?: number;
  thisMonthName?: string;
  lastMonthName?: string;
  recentChallans: Challan[];
  totalBilledThisMonth?: number;
  totalPaymentsThisMonth?: number;
  totalOutstanding?: number;
  overdueCount?: number;
  blockedCount?: number;
  pendingDeliveries?: number;
  goodsReturnsCount?: number;
}
