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

let inMemoryEmployeesCache: EmployeeAccount[] | null = null;
const TMP_EMPLOYEES_FILE = path.join('/tmp', 'showhouse_employees.json');

function ensureDataDir(): void {
  try {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
  } catch (err) {
    console.warn('Could not create DATA_DIR, will use memory / tmp fallback:', err);
  }
}

export function getEmployeeAccounts(): EmployeeAccount[] {
  if (inMemoryEmployeesCache && inMemoryEmployeesCache.length > 0) {
    return inMemoryEmployeesCache;
  }

  try {
    ensureDataDir();
    if (fs.existsSync(EMPLOYEES_FILE)) {
      const raw = fs.readFileSync(EMPLOYEES_FILE, 'utf-8');
      if (raw.trim()) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed) && parsed.length > 0) {
          inMemoryEmployeesCache = parsed;
          return parsed;
        }
      }
    }
  } catch (err) {
    console.warn('Primary employees.json read error, checking fallback:', err);
  }

  // Check /tmp fallback
  try {
    if (fs.existsSync(TMP_EMPLOYEES_FILE)) {
      const raw = fs.readFileSync(TMP_EMPLOYEES_FILE, 'utf-8');
      if (raw.trim()) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed) && parsed.length > 0) {
          inMemoryEmployeesCache = parsed;
          return parsed;
        }
      }
    }
  } catch {}

  // Fallback to default
  inMemoryEmployeesCache = DEFAULT_EMPLOYEES;
  return DEFAULT_EMPLOYEES;
}

export function saveEmployeeAccounts(accounts: EmployeeAccount[]): boolean {
  if (!Array.isArray(accounts)) return false;

  // 1. Immediately store in memory cache
  inMemoryEmployeesCache = [...accounts];

  const content = JSON.stringify(accounts, null, 2);
  let savedToDisk = false;

  // 2. Primary write to data/employees.json
  try {
    ensureDataDir();
    const tempPath = `${EMPLOYEES_FILE}.tmp.${Date.now()}`;
    fs.writeFileSync(tempPath, content, 'utf-8');
    fs.renameSync(tempPath, EMPLOYEES_FILE);
    savedToDisk = true;
  } catch (err: any) {
    console.warn('Atomic write to employees.json failed, trying direct write:', err?.message);
    try {
      fs.writeFileSync(EMPLOYEES_FILE, content, 'utf-8');
      savedToDisk = true;
    } catch (directErr: any) {
      console.warn('Direct write to employees.json failed:', directErr?.message);
    }
  }

  // 3. Fallback write to /tmp for read-only / cloud / serverless containers
  try {
    fs.writeFileSync(TMP_EMPLOYEES_FILE, content, 'utf-8');
    savedToDisk = true;
  } catch (tmpErr) {
    console.warn('Writing to /tmp employees file failed:', tmpErr);
  }

  // As long as inMemory cache is updated or disk saved, return true so UI succeeds
  return true;
}

export function isEmployeeBanned(usernameOrId: string): boolean {
  const accounts = getEmployeeAccounts();
  const clean = usernameOrId.trim().toLowerCase();
  const emp = accounts.find(
    (a) => a.id === usernameOrId || a.username.trim().toLowerCase() === clean
  );
  if (!emp) return false;
  return emp.is_active === false || Boolean(emp.is_banned);
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
