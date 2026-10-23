import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import { getAuthenticatedSession } from '@/lib/server-auth';
import { BusinessProfile } from '@/types';

const DATA_DIR = path.join(process.cwd(), 'data');
const BACKUP_DIR = path.join(DATA_DIR, 'backups');
const SETTINGS_FILE = path.join(DATA_DIR, 'settings.json');

function ensureDirs() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
  if (!fs.existsSync(BACKUP_DIR)) {
    fs.mkdirSync(BACKUP_DIR, { recursive: true });
  }
}

const DEFAULT_PROFILE: BusinessProfile = {
  id: 'sh_business_profile_01',
  user_id: 'adminsh',
  business_name: 'SHOWHOUSE',
  tagline: 'Decor Studio',
  legal_name: 'Showhouse Concept & Design LLP',
  logo_url: '/logo.png',
  address: 'Vishram Baug, Near Makhmali Talao, LBS Marg, Thane (W) - 400602',
  phone: '+91 93248 69306 / 022 - 2538 7683',
  email: 'foxshowhouse@gmail.com',
  gstin: '27ACMF53838C1ZY',
  state: 'Gujarat',
  state_code: '24',
  challan_prefix: 'SH/',
  challan_next_number: 1,
  financial_year_start_month: 4,
  default_unit: 'sheets',
  footer_message: 'Thank you for choosing Showhouse Decor Studio!',
  employees: ['Neal', 'Vrushank'],
  bank_name: '',
  bank_account: '',
  bank_ifsc: '',
  bank_branch: '',
  terms_conditions:
    '1. Goods once delivered and verified will not be taken back.\n2. Discrepancies if any must be reported within 24 hours.\n3. This is a Delivery Challan acknowledging goods receipt and not a tax invoice.\n4. Subject to local jurisdiction.',
  show_rate_column: true,
  show_amount_column: true,
  show_signature_area: true,
  show_prepared_by: true,
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
};

function readSettings(): BusinessProfile {
  try {
    ensureDirs();
    if (!fs.existsSync(SETTINGS_FILE)) {
      fs.writeFileSync(SETTINGS_FILE, JSON.stringify(DEFAULT_PROFILE, null, 2), 'utf-8');
      return DEFAULT_PROFILE;
    }
    const raw = fs.readFileSync(SETTINGS_FILE, 'utf-8');
    if (!raw.trim()) return DEFAULT_PROFILE;
    return JSON.parse(raw);
  } catch (err) {
    console.error('Error reading settings.json:', err);
    return DEFAULT_PROFILE;
  }
}

function writeSettings(profile: BusinessProfile): void {
  try {
    ensureDirs();
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const backupFile = path.join(BACKUP_DIR, `settings-backup-${timestamp}.json`);
    fs.writeFileSync(backupFile, JSON.stringify(profile, null, 2), 'utf-8');
    fs.writeFileSync(SETTINGS_FILE, JSON.stringify(profile, null, 2), 'utf-8');
  } catch (err) {
    console.error('Error writing settings.json:', err);
  }
}

export async function GET(req: NextRequest) {
  const session = getAuthenticatedSession(req);
  if (!session) {
    return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
  }

  const profile = readSettings();
  return NextResponse.json({ success: true, profile });
}

export async function POST(req: NextRequest) {
  const session = getAuthenticatedSession(req);
  if (!session) {
    return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const body = await req.json();
    if (!body || !body.profile) {
      return NextResponse.json(
        { success: false, error: 'Request body must contain profile payload' },
        { status: 400 }
      );
    }

    const current = readSettings();
    const updated: BusinessProfile = {
      ...current,
      ...body.profile,
      updated_at: new Date().toISOString(),
    };

    // Ensure employees is an array of non-empty strings
    if (Array.isArray(body.profile.employees)) {
      updated.employees = body.profile.employees.filter((e: any) => typeof e === 'string' && e.trim().length > 0);
    }

    writeSettings(updated);
    return NextResponse.json({ success: true, profile: updated });
  } catch (err: any) {
    console.error('Error saving settings:', err);
    return NextResponse.json(
      { success: false, error: err.message || 'Failed to save settings' },
      { status: 500 }
    );
  }
}
