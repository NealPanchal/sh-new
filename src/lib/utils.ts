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

export function formatDate(dateStr: string | null | undefined): string {
  if (!dateStr) return '—';
  return formatDateIndian(dateStr);
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

export function formatCurrency(amount: number | null | undefined): string {
  if (amount == null || isNaN(Number(amount))) return '₹0';
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 2,
  }).format(Number(amount));
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
  if (!phone) return '';
  let digits = phone.replace(/\D/g, '');
  if (digits.startsWith('0')) digits = digits.slice(1);
  if (digits.startsWith('91') && digits.length === 12) return digits;
  if (digits.length === 10) return `91${digits}`;
  if (digits.startsWith('910') && digits.length === 13) return `91${digits.slice(3)}`;
  return digits;
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
 * Generate monthly challan number in format: [PREFIX][MM]/[001]
 * e.g., SH/11/001, SH/12/001
 */
export function generateChallanNumber(
  prefix: string = 'SH/',
  dateOrFy: string | Date = new Date(),
  sequenceNumber: number = 1
): string {
  const cleanPrefix = (prefix || 'SH/').endsWith('/') ? (prefix || 'SH/') : `${prefix}/`;
  let monthPadded = String(new Date().getMonth() + 1).padStart(2, '0');

  if (dateOrFy instanceof Date) {
    monthPadded = String(dateOrFy.getMonth() + 1).padStart(2, '0');
  } else if (typeof dateOrFy === 'string' && dateOrFy.includes('-')) {
    const d = new Date(dateOrFy);
    if (!isNaN(d.getTime())) {
      monthPadded = String(d.getMonth() + 1).padStart(2, '0');
    }
  }

  const paddedSeq = String(sequenceNumber).padStart(3, '0');
  return `${cleanPrefix}${monthPadded}/${paddedSeq}`;
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

/**
 * Normalizes ledger entry particulars according to standard Tally ERP conventions:
 * - Sales / Receivables (Debit): "To ..." (e.g. "To SALE GST 18%", "To PVC Panel")
 * - Receipts / Payments (Credit): "By ..." (e.g. "By Cash", "By HDFC BANK", "By UPI")
 * Prevents and cleans corrupted prefixes like "To By Cash" or "By To Sale".
 */
export function cleanTallyParticulars(text: string | null | undefined, isDebit: boolean): string {
  let clean = (text || '').trim();
  // Strip any combination of "To", "By", "To By", "By To" from start (case-insensitive)
  clean = clean.replace(/^(to\s+by\s+|by\s+to\s+|to\s+|by\s+)+/i, '').trim();
  if (!clean) {
    return isDebit ? 'To SALE GST 18%' : 'By Cash';
  }
  return isDebit ? `To ${clean}` : `By ${clean}`;
}

/**
 * Strips internal supplier / vendor / company names from challan line item descriptions
 * (e.g. "[ SHIV SHAKTI ]", "[ SHARNAM ]", "[ ZURICH ]", "(SHIV SHAKTI)")
 * while preserving valid room names, discounts, and item specifications.
 */
export function cleanChallanItemDescription(rawDesc?: string | null, brand?: string | null): string {
  if (!rawDesc) return '';
  let cleaned = rawDesc.trim();

  // If a specific brand is passed, remove variations like [BRAND], [ BRAND ], (BRAND), ( BRAND )
  if (brand && brand.trim()) {
    const escapedBrand = brand.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    cleaned = cleaned.replace(new RegExp(`\\[\\s*${escapedBrand}\\s*\\]`, 'gi'), '');
    cleaned = cleaned.replace(new RegExp(`\\(\\s*${escapedBrand}\\s*\\)`, 'gi'), '');
    cleaned = cleaned.replace(new RegExp(`\\s*[-|/]\\s*${escapedBrand}\\s*[-|/]?\\s*`, 'gi'), ' ');
  }

  // Strip generic bracketed company/vendor names: e.g. [ SHIV SHAKTI ], [ SHARNAM ], [ ZURICH ]
  // Negative lookahead (?!\s*(?:disc|discount|qty|unit)[:\s]) ensures discount brackets like [ Disc: -10% ] are kept
  cleaned = cleaned.replace(/\[(?!\s*(?:disc|discount|qty|unit)[:\s])[^\]]{2,50}\]/gi, '');

  // Strip known internal suppliers if bracketed or separated by hyphens/pipes
  const knownSuppliers = [
    'SHIV\\s*SHAKTI',
    'SHARNAM',
    'ZURICH',
    'ROYAL\\s*OAK',
    'CENTURY',
    'GREENLAM',
    'MERINO',
    'ROYALE\\s*TOUCHE',
    'SUNDEK',
  ];
  for (const sup of knownSuppliers) {
    cleaned = cleaned.replace(new RegExp(`\\[\\s*${sup}\\s*\\]`, 'gi'), '');
    cleaned = cleaned.replace(new RegExp(`\\(\\s*${sup}\\s*\\)`, 'gi'), '');
    cleaned = cleaned.replace(new RegExp(`\\s*[-|]\\s*${sup}\\s*[-|]\\s*`, 'gi'), ' - ');
  }

  // Clean up punctuation artifacts: double hyphens, trailing/leading hyphens, extra whitespace
  cleaned = cleaned
    .replace(/\s+-\s+-\s+/g, ' - ')
    .replace(/\s{2,}/g, ' ')
    .replace(/^\s*[-|/]\s*/, '')
    .replace(/\s*[-|/]\s*$/, '')
    .trim();

  return cleaned;
}

const ROOM_REGEX = /\b(?:LIVING(?:\s*ROOM)?|BED(?:ROOM)?|MASTER(?:\s*BEDROOM)?|KITCHEN|BATH(?:ROOM)?|BALCONY|DINING|FOYER|LOBBY|PASSAGE|COMMON(?:\s*INNER)?|PARENTS?(?:\s*ROOM)?|GUEST(?:\s*ROOM)?|KIDS?(?:\s*ROOM)?|STUDY|POOJA|DRESS(?:ING)?)\b/i;

export interface ItemOfficeDetails {
  description: string;
  brand: string;
  code: string;
}

/**
 * Extracts clean material specification, supplier brand, and product code
 * for internal office / warehouse copies.
 * Completely strips room tags (e.g. [ LIVING ROOM 1 ], [ MASTER ROOM 2 ]) from description.
 */
export function extractItemOfficeDetails(
  item: {
    item_description?: string | null;
    brand?: string | null;
    product_id?: string | null;
    code?: string | null;
    item_code?: string | null;
    colour_finish?: string | null;
    size?: string | null;
  },
  customerMaterialRates?: Array<{
    particulars?: string | null;
    material?: string | null;
    room?: string | null;
    code?: string | null;
    company_name?: string | null;
    rate?: number | string | null;
  }> | null
): ItemOfficeDetails {
  let cleanDesc = (item.item_description || '').trim();

  // Strip all leading bracketed rooms: e.g. [ LIVING ROOM 1 ], [ MASTER ROOM 2 ]
  while (/^\s*\[\s*([^\]]+?)\s*\]\s*/.test(cleanDesc)) {
    cleanDesc = cleanDesc.replace(/^\s*\[\s*([^\]]+?)\s*\]\s*/, '').trim();
  }

  // Strip trailing bracket if it is a room: e.g. [ LIVING ROOM ]
  const trailingRoomMatch = cleanDesc.match(/\[\s*([^\]]+?)\s*\]\s*$/);
  if (trailingRoomMatch && ROOM_REGEX.test(trailingRoomMatch[1])) {
    cleanDesc = cleanDesc.substring(0, cleanDesc.lastIndexOf(trailingRoomMatch[0])).trim();
  }

  // Also strip trailing room suffix without brackets: e.g. ' - LIVING ROOM'
  cleanDesc = cleanDesc.replace(new RegExp('\\s*[-|/]?\\s*' + ROOM_REGEX.source + '\\s*$', 'i'), '').trim();

  // Extract / resolve brand
  let brand = (item.brand || '').trim();
  if (brand) {
    const brandRegex = new RegExp('\\s*\\[?\\s*' + brand.replace(/[.*+?^${}()|[\\]\\]/g, '\\$&') + '\\s*\\]?\\s*', 'gi');
    cleanDesc = cleanDesc.replace(brandRegex, ' ').trim();
  } else {
    // Check trailing bracket for brand (if not a room)
    const trailingBracketMatch = cleanDesc.match(/\[\s*([^\]]+?)\s*\]\s*$/);
    if (trailingBracketMatch && !ROOM_REGEX.test(trailingBracketMatch[1])) {
      brand = trailingBracketMatch[1].trim();
      cleanDesc = cleanDesc.substring(0, cleanDesc.lastIndexOf(trailingBracketMatch[0])).trim();
    }
  }

  // Extract / resolve code: Check item properties first
  let code = (item.code || item.item_code || item.product_id || '').trim();
  if (code.startsWith('prod_') || code.startsWith('p_') || code.startsWith('it_')) {
    code = '';
  }

  // Check code badge in cleanDesc: e.g. [ CODE: 9571 szm ] or [ SHADE: 1001 ]
  const codeBadgeMatch = cleanDesc.match(/\[\s*(?:CODE|SHADE)[:\s]+([^\]]+?)\s*\]/i);
  if (codeBadgeMatch) {
    if (!code) code = codeBadgeMatch[1].trim();
    cleanDesc = cleanDesc.replace(codeBadgeMatch[0], ' ').trim();
  }

  // Auto-resolve code & brand from customer's agreed material rates / selection
  if (!code && Array.isArray(customerMaterialRates) && customerMaterialRates.length > 0) {
    const norm = (s?: string | null) => (s || '').toLowerCase().replace(/[^a-z0-9]/g, '');
    const cleanDescNorm = norm(cleanDesc);
    const itemDescNorm = norm(item.item_description);
    const brandNorm = norm(brand);
    const finishNorm = norm(item.colour_finish);

    let bestMatch: (typeof customerMaterialRates)[0] | null = null;
    let bestScore = 0;

    for (const mr of customerMaterialRates) {
      if (!mr) continue;
      const partNorm = norm(mr.particulars || mr.material);
      const mrBrandNorm = norm(mr.company_name);
      const mrRoomNorm = norm(mr.room);

      let score = 0;
      if (partNorm) {
        if (cleanDescNorm === partNorm || itemDescNorm === partNorm) {
          score += 10;
        } else if (cleanDescNorm.includes(partNorm) || itemDescNorm.includes(partNorm)) {
          score += 6;
        } else if (partNorm.includes(cleanDescNorm) && cleanDescNorm.length >= 3) {
          score += 5;
        }
      }

      if (mrBrandNorm && brandNorm && (mrBrandNorm === brandNorm || brandNorm.includes(mrBrandNorm) || mrBrandNorm.includes(brandNorm))) {
        score += 4;
      }

      if (mrRoomNorm && (finishNorm === mrRoomNorm || cleanDescNorm.includes(mrRoomNorm) || itemDescNorm.includes(mrRoomNorm))) {
        score += 3;
      }

      if (score > bestScore && score >= 4) {
        bestScore = score;
        bestMatch = mr;
      }
    }

    if (bestMatch) {
      if (bestMatch.code) {
        code = bestMatch.code.trim();
      }
      if ((!brand || brand === '—') && bestMatch.company_name) {
        brand = bestMatch.company_name.trim();
      }
    }
  }

  // Regex fallback: extract code patterns from trailing description
  if (!code) {
    const fullCodeMatch = cleanDesc.match(/^([A-Za-z]{1,4}\s*[-/]?\s*\d+[A-Za-z0-9\s\-/()]*)$/i);
    if (fullCodeMatch) {
      code = fullCodeMatch[1].trim();
    } else {
      const codeMatch = cleanDesc.match(/\s+([A-Za-z]{0,4}\s*[-/]?\s*\d+[A-Za-z0-9\s\-/()]*|[A-Za-z]{1,4}\s*[-]\s*[A-Za-z0-9]+)$/i);
      if (codeMatch) {
        code = codeMatch[1].trim();
        cleanDesc = cleanDesc.substring(0, cleanDesc.length - codeMatch[0].length).trim();
      }
    }
  }

  if (/^LAM(?:INATE)?\s+/i.test(code)) {
    code = code.replace(/^LAM(?:INATE)?\s+/i, '').trim();
    cleanDesc = `${cleanDesc} LAM`.trim();
  }
  if (/^LAM(?:INATE)?$/i.test(code)) {
    code = '';
    cleanDesc = `${cleanDesc} LAM`.trim();
  }
  cleanDesc = cleanDesc.replace(/\s*[-/:]\s*$/, '').trim();

  if (item.colour_finish) {
    const finish = item.colour_finish.trim();
    if (finish && !cleanDesc.toLowerCase().includes(finish.toLowerCase())) {
      cleanDesc += ` - ${finish}`;
    }
  }
  if (item.size) {
    cleanDesc += ` ( ${item.size} )`;
  }

  return {
    description: cleanDesc.toUpperCase(),
    brand: (brand || '—').toUpperCase(),
    code: (code || '—').toUpperCase(),
  };
}


