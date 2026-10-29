import { Challan, EmployeeAccount } from '@/types';

/**
 * Standard PO Prefix derivation for Showhouse Staff Members
 * Format: "PO <STAFF_INITIALS>"
 * e.g. Vrushank -> "PO VS"
 *      Bhavin   -> "PO BH"
 *      Neal     -> "PO NP"
 */
export function getStaffPrefix(staffName: string, employees?: EmployeeAccount[]): string {
  if (!staffName) return 'PO';
  const cleanName = staffName.trim();
  const lowerName = cleanName.toLowerCase();

  // 1. Check if configured in employee accounts
  if (employees && employees.length > 0) {
    const emp = employees.find(
      (e) =>
        e.name.toLowerCase() === lowerName ||
        e.username.toLowerCase() === lowerName
    );
    if (emp?.po_prefix && emp.po_prefix.trim()) {
      return emp.po_prefix.trim().toUpperCase();
    }
  }

  // 2. Standard Known Staff mappings
  if (lowerName.includes('vrushank')) return 'PO VS';
  if (lowerName.includes('bhavin')) return 'PO BH';
  if (lowerName.includes('neal')) return 'PO NP';
  if (lowerName.includes('raunak')) return 'PO RN';

  // 3. Auto-derive from multi-word name (e.g. "Neal Panchal" -> "PO NP")
  const words = cleanName.split(/\s+/).filter(Boolean);
  if (words.length >= 2) {
    const firstChar = words[0][0].toUpperCase();
    const secondChar = words[1][0].toUpperCase();
    return `PO ${firstChar}${secondChar}`;
  }

  // 4. Single word or username (e.g. "Staff1" -> "PO ST1", "Ron" -> "PO RO")
  const letters = cleanName.replace(/[^a-zA-Z0-9]/g, '');
  if (letters.length >= 2) {
    return `PO ${letters.slice(0, 2).toUpperCase()}`;
  }

  return `PO ${cleanName.toUpperCase()}`;
}

/**
 * Get the next auto-incrementing PO number for a specific staff member.
 * Each staff member maintains their own continuous sequence:
 * Vrushank: PO VS 001, PO VS 002, PO VS 003...
 * Bhavin:   PO BH 001, PO BH 002, PO BH 003...
 * Neal:     PO NP 001, PO NP 002, PO NP 003...
 */
export function getNextStaffPONumber(
  staffName: string,
  challans: Challan[] = [],
  employees?: EmployeeAccount[]
): string {
  if (!staffName) return 'PO 001';
  const prefix = getStaffPrefix(staffName, employees);

  // Build flexible regex pattern matching historical and standard formats
  let patternStr = prefix.replace(/\s+/g, '\\s*');
  if (prefix === 'PO VS') {
    patternStr = '(?:PO\\s*VS|VS\\s*PO|VS)';
  } else if (prefix === 'PO BH') {
    patternStr = '(?:PO\\s*BH|BH\\s*PO|BH)';
  } else if (prefix === 'PO NP') {
    patternStr = '(?:PO\\s*NP|NP\\s*PO|NP)';
  } else if (prefix === 'PO RN') {
    patternStr = '(?:PO\\s*RN|RN\\s*PO|RN)';
  }

  const regex = new RegExp(`^${patternStr}[\\s\\-_]*(\\d+)$`, 'i');

  let maxSeq = 0;
  for (const c of challans) {
    if (c.is_deleted) continue;

    // Check if reference number matches the staff's PO pattern
    if (c.reference_number) {
      const match = c.reference_number.trim().match(regex);
      if (match && match[1]) {
        const num = parseInt(match[1], 10);
        if (!isNaN(num) && num > maxSeq) {
          maxSeq = num;
        }
      }
    }
  }

  const nextSeq = maxSeq + 1;
  const padded = String(nextSeq).padStart(3, '0');
  return `${prefix} ${padded}`;
}

/**
 * Format a staff PO number given a prefix and sequence number
 */
export function formatStaffPONumber(prefix: string, seq: number): string {
  const cleanPrefix = prefix.trim().toUpperCase();
  const padded = String(seq).padStart(3, '0');
  return `${cleanPrefix} ${padded}`;
}
