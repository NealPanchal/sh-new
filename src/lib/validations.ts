import { z } from 'zod';

export const UNIT_OPTIONS = [
  'sheets',
  'pieces',
  'boxes',
  'bundles',
  'sq.ft',
  'running ft',
  'nos',
] as const;

const indianPhoneRegex = /^[6-9]\d{9}$/;
const gstinRegex = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/;

export const customerSchema = z.object({
  business_name: z.string().min(1, 'Business name is required').max(200),
  contact_person: z.string().max(100).optional().or(z.literal('')),
  phone: z
    .string()
    .min(10, 'Phone number is required')
    .refine((val) => {
      const cleaned = val.replace(/\D/g, '');
      if (cleaned.length === 10) return indianPhoneRegex.test(cleaned);
      if (cleaned.length === 12 && cleaned.startsWith('91'))
        return indianPhoneRegex.test(cleaned.slice(2));
      return false;
    }, 'Enter a valid 10-digit Indian mobile number'),
  billing_address: z.string().min(1, 'Billing address is required').max(500),
  delivery_address: z.string().max(500).optional().or(z.literal('')),
  gstin: z
    .string()
    .optional()
    .or(z.literal(''))
    .refine((val) => {
      if (!val) return true;
      return gstinRegex.test(val.toUpperCase());
    }, 'Enter a valid 15-character GSTIN'),
  notes: z.string().max(1000).optional().or(z.literal('')),
});

export const productSchema = z.object({
  name: z.string().min(1, 'Product name is required').max(200),
  brand: z.string().max(100).optional().or(z.literal('')),
  sku: z.string().max(50).optional().or(z.literal('')),
  colour_design: z.string().max(100).optional().or(z.literal('')),
  size_thickness: z.string().max(100).optional().or(z.literal('')),
  unit: z.enum(UNIT_OPTIONS),
  default_rate: z.union([z.number().min(0), z.string()]).optional().or(z.literal('')),
});

export const challanItemSchema = z.object({
  product_id: z.string().optional().or(z.literal('')),
  item_description: z.string().min(1, 'Item description is required'),
  brand: z.string().optional().or(z.literal('')),
  colour_finish: z.string().optional().or(z.literal('')),
  size: z.string().optional().or(z.literal('')),
  unit: z.enum(UNIT_OPTIONS),
  quantity: z.union([z.number().min(0.01, 'Quantity is required'), z.string().min(1)]),
  rate: z.union([z.number().min(0), z.string()]).optional().or(z.literal('')),
  amount: z.union([z.number(), z.string()]).optional().or(z.literal('')),
});

export const challanSchema = z.object({
  challan_date: z.string().min(1, 'Date is required'),
  customer_id: z.string().min(1, 'Please select a customer'),
  customer_name: z.string().min(1),
  customer_phone: z.string().min(1),
  customer_address: z.string().min(1),
  customer_gstin: z.string().optional().or(z.literal('')),
  delivery_address: z.string().optional().or(z.literal('')),
  reference_number: z.string().optional().or(z.literal('')),
  notes: z.string().optional().or(z.literal('')),
  prepared_by: z.string().optional().or(z.literal('')),
  items: z.array(challanItemSchema).min(1, 'Add at least one item'),
});

export const businessSetupSchema = z.object({
  business_name: z.string().min(1, 'Business name is required').max(200),
  address: z.string().min(1, 'Address is required').max(500),
  phone: z
    .string()
    .min(10, 'Phone number is required')
    .refine((val) => {
      const cleaned = val.replace(/\D/g, '');
      if (cleaned.length === 10) return indianPhoneRegex.test(cleaned);
      if (cleaned.length === 12 && cleaned.startsWith('91'))
        return indianPhoneRegex.test(cleaned.slice(2));
      return false;
    }, 'Enter a valid 10-digit Indian mobile number'),
  email: z.string().email('Enter a valid email').optional().or(z.literal('')),
  gstin: z
    .string()
    .optional()
    .or(z.literal(''))
    .refine((val) => {
      if (!val) return true;
      return gstinRegex.test(val.toUpperCase());
    }, 'Enter a valid 15-character GSTIN'),
  challan_prefix: z.string().min(1, 'Prefix is required').max(10),
  financial_year_start_month: z.number().min(1).max(12),
  default_unit: z.enum(UNIT_OPTIONS),
  footer_message: z.string().max(500).optional().or(z.literal('')),
  show_rate_column: z.boolean(),
  show_amount_column: z.boolean(),
  show_signature_area: z.boolean(),
  show_prepared_by: z.boolean(),
});

export type CustomerFormValues = z.infer<typeof customerSchema>;
export type ProductFormValues = z.infer<typeof productSchema>;
export type ChallanFormValues = z.infer<typeof challanSchema>;
export type BusinessSetupFormValues = z.infer<typeof businessSetupSchema>;
