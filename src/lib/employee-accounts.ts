import fs from 'fs';
import path from 'path';
import { EmployeeAccount } from '@/types';

const DATA_DIR = path.join(process.cwd(), 'data');
const EMPLOYEES_FILE = path.join(DATA_DIR, 'employees.json');

export const DEFAULT_EMPLOYEES: EmployeeAccount[] = [
  {
    id: 'emp_1',
    username: 'vrushank',
    name: 'Vrushank',
    phone: '+91 81692 14522',
    password: 'vrushank@sh26',
    role: 'employee',
    is_active: true,
    po_prefix: 'PO VS',
  },
  {
    id: 'emp_2',
    username: 'bhavin',
    name: 'Bhavin',
    phone: '+91 93248 69306',
    password: 'bhavin@sh26',
    role: 'employee',
    is_active: true,
    po_prefix: 'PO BH',
  },
  {
    id: 'emp_3',
    username: 'neal',
    name: 'Neal',
    phone: '+91 93248 69306',
    password: 'neal@sh26',
    role: 'employee',
    is_active: true,
    po_prefix: 'PO NP',
  },
  {
    id: 'emp_4',
    username: 'rishi',
    name: 'Rishi',
    phone: '',
    password: 'rishi@sh26',
    role: 'employee',
    is_active: true,
    po_prefix: 'PO RS',
  },
  {
    id: 'emp_5',
    username: 'deepak',
    name: 'Deepak',
    phone: '',
    password: 'deepak@sh26',
    role: 'employee',
    is_active: true,
    po_prefix: 'PO DP',
  },
  {
    id: 'emp_6',
    username: 'umang',
    name: 'Umang',
    phone: '',
    password: 'umang@sh26',
    role: 'employee',
    is_active: true,
    po_prefix: 'PO UM',
  },
  {
    id: 'emp_7',
    username: 'kenil',
    name: 'Kenil',
    phone: '',
    password: 'kenil@sh26',
    role: 'employee',
    is_active: true,
    po_prefix: 'PO KN',
  },
  {
    id: 'emp_8',
    username: 'ronaksir',
    name: 'Ronak sir',
    phone: '',
    password: 'ronak@sh26',
    role: 'employee',
    is_active: true,
    po_prefix: 'PO RN',
  },
  {
    id: 'emp_9',
    username: 'staff1',
    name: 'Staff 1',
    phone: '',
    password: 'staff1@sh26',
    role: 'employee',
    is_active: true,
    po_prefix: 'PO ST1',
  },
  {
    id: 'emp_10',
    username: 'staff2',
    name: 'Staff 2',
    phone: '',
    password: 'staff2@sh26',
    role: 'employee',
    is_active: true,
    po_prefix: 'PO ST2',
  },
];

function ensureDataDir(): void {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
}

export function getEmployeeAccounts(): EmployeeAccount[] {
  try {
    ensureDataDir();
    if (!fs.existsSync(EMPLOYEES_FILE)) {
      fs.writeFileSync(EMPLOYEES_FILE, JSON.stringify(DEFAULT_EMPLOYEES, null, 2), 'utf-8');
      return DEFAULT_EMPLOYEES;
    }
    const raw = fs.readFileSync(EMPLOYEES_FILE, 'utf-8');
    if (!raw.trim()) {
      return DEFAULT_EMPLOYEES;
    }
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed) && parsed.length > 0) {
      return parsed;
    }
    return DEFAULT_EMPLOYEES;
  } catch (err) {
    console.error('Error reading employees.json:', err);
    return DEFAULT_EMPLOYEES;
  }
}

export function saveEmployeeAccounts(accounts: EmployeeAccount[]): boolean {
  try {
    ensureDataDir();
    fs.writeFileSync(EMPLOYEES_FILE, JSON.stringify(accounts, null, 2), 'utf-8');
    return true;
  } catch (err) {
    console.error('Error saving employees.json:', err);
    return false;
  }
}

export function findEmployeeByUsername(username: string): EmployeeAccount | undefined {
  const accounts = getEmployeeAccounts();
  const clean = username.trim().toLowerCase();
  return accounts.find((a) => a.username.trim().toLowerCase() === clean);
}

export function findEmployeeByName(name: string): EmployeeAccount | undefined {
  const accounts = getEmployeeAccounts();
  const clean = name.trim().toLowerCase();
  return accounts.find(
    (a) => a.name.trim().toLowerCase() === clean || a.username.trim().toLowerCase() === clean
  );
}

export function getEmployeePhone(nameOrUsername?: string | null): string | undefined {
  if (!nameOrUsername) return undefined;
  const emp = findEmployeeByName(nameOrUsername);
  return emp?.phone?.trim() || undefined;
}
