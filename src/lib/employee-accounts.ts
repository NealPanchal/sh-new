import fs from 'fs';
import path from 'path';
import { EmployeeAccount } from '@/types';
import { safeWriteDataFile, safeReadDataFile } from '@/lib/server-storage';

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

export function getEmployeeAccounts(): EmployeeAccount[] {
  const accounts = safeReadDataFile<EmployeeAccount[]>('employees.json', DEFAULT_EMPLOYEES);
  if (Array.isArray(accounts) && accounts.length > 0) {
    return accounts;
  }
  return DEFAULT_EMPLOYEES;
}

export function saveEmployeeAccounts(accounts: EmployeeAccount[]): boolean {
  if (!Array.isArray(accounts)) return false;
  return safeWriteDataFile('employees.json', accounts);
}

export function updateEmployeePassword(
  usernameOrId: string,
  newPassword: string
): { success: boolean; employee?: EmployeeAccount; error?: string } {
  if (!usernameOrId || !newPassword || newPassword.trim().length < 6) {
    return { success: false, error: 'Password must be at least 6 characters long' };
  }

  const current = getEmployeeAccounts();
  const clean = usernameOrId.trim().toLowerCase();
  let found = false;

  const updated = current.map((emp) => {
    if (emp.id === usernameOrId || emp.username.trim().toLowerCase() === clean) {
      found = true;
      return {
        ...emp,
        password: newPassword.trim(),
      };
    }
    return emp;
  });

  if (!found) {
    return { success: false, error: `Employee "${usernameOrId}" not found` };
  }

  const saved = saveEmployeeAccounts(updated);
  if (!saved) {
    return { success: false, error: 'Failed to save updated password to database file' };
  }

  const updatedEmp = updated.find(
    (e) => e.id === usernameOrId || e.username.trim().toLowerCase() === clean
  );

  return { success: true, employee: updatedEmp };
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
