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
    password: 'vrushank@sh26',
    role: 'employee',
    is_active: true,
    po_prefix: 'PO VS',
  },
  {
    id: 'emp_2',
    username: 'bhavin',
    name: 'Bhavin',
    password: 'bhavin@sh26',
    role: 'employee',
    is_active: true,
    po_prefix: 'PO BH',
  },
  {
    id: 'emp_3',
    username: 'neal',
    name: 'Neal',
    password: 'neal@sh26',
    role: 'employee',
    is_active: true,
    po_prefix: 'PO NP',
  },
  {
    id: 'emp_4',
    username: 'staff1',
    name: 'Staff 1',
    password: 'staff1@sh26',
    role: 'employee',
    is_active: true,
    po_prefix: 'PO ST1',
  },
  {
    id: 'emp_5',
    username: 'staff2',
    name: 'Staff 2',
    password: 'staff2@sh26',
    role: 'employee',
    is_active: true,
    po_prefix: 'PO ST2',
  },
  {
    id: 'emp_6',
    username: 'staff3',
    name: 'Staff 3',
    password: 'staff3@sh26',
    role: 'employee',
    is_active: true,
    po_prefix: 'PO ST3',
  },
  {
    id: 'emp_7',
    username: 'staff4',
    name: 'Staff 4',
    password: 'staff4@sh26',
    role: 'employee',
    is_active: true,
    po_prefix: 'PO ST4',
  },
  {
    id: 'emp_8',
    username: 'staff5',
    name: 'Staff 5',
    password: 'staff5@sh26',
    role: 'employee',
    is_active: true,
    po_prefix: 'PO ST5',
  },
  {
    id: 'emp_9',
    username: 'staff6',
    name: 'Staff 6',
    password: 'staff6@sh26',
    role: 'employee',
    is_active: true,
    po_prefix: 'PO ST6',
  },
  {
    id: 'emp_10',
    username: 'staff7',
    name: 'Staff 7',
    password: 'staff7@sh26',
    role: 'employee',
    is_active: true,
    po_prefix: 'PO ST7',
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

