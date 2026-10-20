import { format, parse, isValid } from 'date-fns';

/**
 * Format a date string to DD/MM/YYYY (Indian format)
 */
export function formatDateIndian(dateStr: string): string {
  if (!dateStr) return '';
  const date = new Date(dateStr);
  if (!isValid(date)) return dateStr;
  return format(date, 'dd/MM/yyyy');
}

/**
 * Format a date for display with time
 */
export function formatDateTimeIndian(dateStr: string): string {
  if (!dateStr) return '';
  const date = new Date(dateStr);
  if (!isValid(date)) return dateStr;
  return format(date, 'dd/MM/yyyy, hh:mm a');
}

/**
 * Get today's date in YYYY-MM-DD format for input fields
 */
export function getTodayISO(): string {
  return format(new Date(), 'yyyy-MM-dd');
}

/**
 * Format INR currency
 */
export function formatINR(amount: number | null | undefined): string {
  if (amount == null || amount === 0) return '';
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);
}

/**
 * Format Indian phone number
 */
export function formatPhone(phone: string): string {
  if (!phone) return '';
  const cleaned = phone.replace(/\D/g, '');
  if (cleaned.length === 10) {
    return `+91 ${cleaned.slice(0, 5)} ${cleaned.slice(5)}`;
  }
  if (cleaned.length === 12 && cleaned.startsWith('91')) {
    return `+91 ${cleaned.slice(2, 7)} ${cleaned.slice(7)}`;
  }
  return phone;
}

/**
 * Get phone number for WhatsApp (without + prefix, with country code)
 */
export function getWhatsAppNumber(phone: string): string {
  const cleaned = phone.replace(/\D/g, '');
  if (cleaned.length === 10) return `91${cleaned}`;
  if (cleaned.startsWith('91') && cleaned.length === 12) return cleaned;
  return cleaned;
}

/**
 * Generate a financial year string (e.g. 2026-27)
 */
export function getFinancialYear(date: Date = new Date(), startMonth: number = 4): string {
  const year = date.getFullYear();
  const month = date.getMonth() + 1; // 1-indexed
  const fyStartYear = month >= startMonth ? year : year - 1;
  const fyEndYear = fyStartYear + 1;
  return `${fyStartYear}-${String(fyEndYear).slice(2)}`;
}

/**
 * Generate the next challan number
 */
export function generateChallanNumber(
  prefix: string,
  financialYear: string,
  sequenceNumber: number
): string {
  const paddedSeq = String(sequenceNumber).padStart(4, '0');
  return `${prefix}/${financialYear}/${paddedSeq}`;
}

/**
 * Debounce function
 */
export function debounce<T extends (...args: unknown[]) => unknown>(
  fn: T,
  delay: number
): (...args: Parameters<T>) => void {
  let timeoutId: ReturnType<typeof setTimeout>;
  return (...args: Parameters<T>) => {
    clearTimeout(timeoutId);
    timeoutId = setTimeout(() => fn(...args), delay);
  };
}

/**
 * Generate a UUID (browser-safe)
 */
export function generateId(): string {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

/**
 * Truncate text
 */
export function truncate(str: string, length: number): string {
  if (!str) return '';
  return str.length > length ? str.slice(0, length) + '...' : str;
}

/**
 * Validate Indian phone number
 */
export function isValidIndianPhone(phone: string): boolean {
  const cleaned = phone.replace(/\D/g, '');
  if (cleaned.length === 10) return /^[6-9]\d{9}$/.test(cleaned);
  if (cleaned.length === 12 && cleaned.startsWith('91')) {
    return /^91[6-9]\d{9}$/.test(cleaned);
  }
  return false;
}

/**
 * Validate GSTIN
 */
export function isValidGSTIN(gstin: string): boolean {
  if (!gstin) return true; // Optional field
  return /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/.test(gstin.toUpperCase());
}

/**
 * Classname helper
 */
export function cn(...classes: (string | boolean | undefined | null)[]): string {
  return classes.filter(Boolean).join(' ');
}

/**
 * Convert number to Indian currency words
 */
export function amountToWords(num: number): string {
  if (!num || isNaN(num)) return 'Zero Rupees Only';

  const a = [
    '',
    'One ',
    'Two ',
    'Three ',
    'Four ',
    'Five ',
    'Six ',
    'Seven ',
    'Eight ',
    'Nine ',
    'Ten ',
    'Eleven ',
    'Twelve ',
    'Thirteen ',
    'Fourteen ',
    'Fifteen ',
    'Sixteen ',
    'Seventeen ',
    'Eighteen ',
    'Nineteen ',
  ];
  const b = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];

  const n = Math.floor(num);
  if (n === 0) return 'Zero Rupees Only';

  function convert(val: number): string {
    if (val === 0) return '';
    if (val < 20) return a[val];
    if (val < 100) return b[Math.floor(val / 10)] + ' ' + a[val % 10];
    if (val < 1000) return a[Math.floor(val / 100)] + 'Hundred ' + convert(val % 100);
    if (val < 100000) return convert(Math.floor(val / 1000)) + 'Thousand ' + convert(val % 1000);
    if (val < 10000000) return convert(Math.floor(val / 100000)) + 'Lakh ' + convert(val % 100000);
    return convert(Math.floor(val / 10000000)) + 'Crore ' + convert(val % 10000000);
  }

  const integerPart = Math.floor(num);
  const words = convert(integerPart).trim();
  return `${words} Rupees Only`;
}
