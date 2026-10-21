// Database types for Showhouse Challan Management System

export type ChallanStatus = 'draft' | 'final' | 'cancelled' | 'void';
export type ShareStatus = 'not_shared' | 'share_initiated' | 'user_marked_sent' | 'failed';
export type UnitType = 'sheets' | 'pieces' | 'boxes' | 'bundles' | 'sq.ft' | 'running ft' | 'nos';

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
  financial_year_start_month: number; // 4 = April
  default_unit: UnitType;
  footer_message: string;
  bank_name?: string | null;
  bank_account?: string | null;
  bank_ifsc?: string | null;
  bank_branch?: string | null;
  terms_conditions?: string | null;
  show_rate_column: boolean;
  show_amount_column: boolean;
  show_signature_area: boolean;
  show_prepared_by: boolean;
  created_at: string;
  updated_at: string;
}

export interface Customer {
  id: string;
  user_id: string;
  business_name: string;
  contact_person: string | null;
  phone: string;
  billing_address: string;
  delivery_address: string | null;
  gstin: string | null;
  notes: string | null;
  is_active: boolean;
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

export interface Challan {
  id: string;
  user_id: string;
  challan_number: string;
  challan_date: string;
  customer_id: string;
  customer_name: string;
  customer_phone: string;
  customer_address: string;
  customer_gstin: string | null;
  delivery_address: string | null;
  reference_number: string | null;
  notes: string | null;
  prepared_by: string | null;
  created_by?: string | null;
  status: ChallanStatus;
  share_status: ShareStatus;
  total_quantity: number;
  total_amount: number | null;
  subtotal_amount?: number | null;
  transportation_charges?: number | null;
  loading_charges?: number | null;
  apply_gst?: boolean | null;
  cgst_amount?: number | null;
  sgst_amount?: number | null;
  apply_additional_9?: boolean | null;
  additional_9_amount?: number | null;
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
  brand: string | null;
  colour_finish: string | null;
  size: string | null;
  unit: UnitType;
  quantity: number;
  rate: number | null;
  amount: number | null;
  created_at: string;
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
  customer_id: string;
  customer_name: string;
  customer_phone: string;
  customer_address: string;
  customer_gstin: string;
  delivery_address: string;
  reference_number: string;
  notes: string;
  prepared_by: string;
  created_by?: string;
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
  amount: number | string;
}

export interface CustomerFormData {
  business_name: string;
  contact_person: string;
  phone: string;
  billing_address: string;
  delivery_address: string;
  gstin: string;
  notes: string;
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
}

export interface DashboardStats {
  totalChallans: number;
  challansToday: number;
  challansThisMonth: number;
  recentChallans: Challan[];
}
