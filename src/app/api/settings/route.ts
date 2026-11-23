import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedSession } from '@/lib/server-auth';
import { BusinessProfile } from '@/types';
import {
  safeWriteDataFile,
  safeWriteDataFileAsync,
  safeReadDataFile,
  syncFromFirestoreIfCold,
  invalidateDataCache,
} from '@/lib/server-storage';
import { saveDocToFirestoreRest } from '@/lib/server-firestore';

export const dynamic = 'force-dynamic';

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
  state: 'Maharashtra',
  state_code: '27',
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
    '1. Interest @ 21% will be charged if the payment of bill not made with 7 days\n2. 100% Advance Payment\n3. Goods once sold will not be taken back or exchanged',
  show_rate_column: true,
  show_amount_column: true,
  show_signature_area: true,
  show_prepared_by: true,
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
};

function readSettings(): BusinessProfile {
  return safeReadDataFile<BusinessProfile>('settings.json', DEFAULT_PROFILE);
}

async function writeSettingsAsync(profile: BusinessProfile): Promise<void> {
  await safeWriteDataFileAsync('settings.json', profile);
  try {
    await saveDocToFirestoreRest('settings', 'business_profile', profile);
  } catch {}
}

export async function GET(req: NextRequest) {
  const session = getAuthenticatedSession(req);
  if (!session) {
    return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
  }

  invalidateDataCache('settings.json');
  const profile = await syncFromFirestoreIfCold<BusinessProfile>('settings.json', DEFAULT_PROFILE);
  return NextResponse.json(
    { success: true, profile },
    {
      headers: {
        'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
        Pragma: 'no-cache',
        Expires: '0',
      },
    }
  );
}

export async function POST(req: NextRequest) {
  const session = getAuthenticatedSession(req);
  if (!session) {
    return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const body = await req.json().catch(() => ({}));
    const profilePayload = body.profile || body;
    if (!profilePayload || typeof profilePayload !== 'object') {
      return NextResponse.json(
        { success: false, error: 'Request body must contain profile payload' },
        { status: 400 }
      );
    }

    const current = readSettings();
    const updated: BusinessProfile = {
      ...current,
      ...profilePayload,
      updated_at: new Date().toISOString(),
    };

    // Ensure employees is an array of non-empty strings
    if (Array.isArray(profilePayload.employees)) {
      updated.employees = profilePayload.employees.filter(
        (e: any) => typeof e === 'string' && e.trim().length > 0
      );
    }

    await writeSettingsAsync(updated);
    invalidateDataCache('settings.json');
    return NextResponse.json(
      { success: true, profile: updated },
      {
        headers: {
          'Cache-Control': 'no-store, no-cache, must-revalidate',
        },
      }
    );
  } catch (err: any) {
    console.error('Error saving settings:', err);
    return NextResponse.json(
      { success: false, error: err.message || 'Failed to save settings' },
      { status: 500 }
    );
  }
}
