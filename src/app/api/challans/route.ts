import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import { z } from 'zod';
import { Challan } from '@/types';
import { getAuthenticatedSession } from '@/lib/server-auth';

const DATA_DIR = path.join(process.cwd(), 'data');
const BACKUP_DIR = path.join(DATA_DIR, 'backups');
const DATA_FILE = path.join(DATA_DIR, 'challans.json');

// Ensure database & backup directories exist
function ensureDirs() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
  if (!fs.existsSync(BACKUP_DIR)) {
    fs.mkdirSync(BACKUP_DIR, { recursive: true });
  }
}

// Zod Schema for robust validation & sanitization
const challanItemSchema = z.object({
  id: z.string().min(1),
  challan_id: z.string().optional(),
  serial_number: z.number().int().optional(),
  product_id: z.string().nullable().optional(),
  item_description: z.string().min(1).max(500),
  brand: z.string().nullable().optional(),
  colour_finish: z.string().nullable().optional(),
  size: z.string().nullable().optional(),
  unit: z.string().default('pieces'),
  quantity: z.number().nonnegative(),
  rate: z.number().nullable().optional(),
  amount: z.number().nullable().optional(),
  created_at: z.string().optional(),
});

const challanSchema = z.object({
  id: z.string().min(1).max(128),
  user_id: z.string().optional(),
  challan_number: z.string().min(1).max(64),
  challan_date: z.string().min(1).max(32),
  customer_id: z.string().default(''),
  customer_name: z.string().min(1).max(256),
  customer_phone: z.string().default(''),
  customer_address: z.string().default(''),
  customer_gstin: z.string().nullable().optional(),
  delivery_address: z.string().nullable().optional(),
  reference_number: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
  prepared_by: z.string().nullable().optional(),
  created_by: z.string().nullable().optional(),
  status: z.enum(['draft', 'final', 'cancelled', 'void']).default('draft'),
  share_status: z.enum(['not_shared', 'share_initiated', 'user_marked_sent', 'failed']).default('not_shared'),
  total_quantity: z.number().nonnegative().default(0),
  total_amount: z.number().nullable().optional(),
  subtotal_amount: z.number().nullable().optional(),
  transportation_charges: z.number().nullable().optional(),
  loading_charges: z.number().nullable().optional(),
  apply_gst: z.boolean().nullable().optional(),
  cgst_amount: z.number().nullable().optional(),
  sgst_amount: z.number().nullable().optional(),
  apply_additional_9: z.boolean().nullable().optional(),
  additional_9_amount: z.number().nullable().optional(),
  is_deleted: z.boolean().optional(),
  deleted_at: z.string().nullable().optional(),
  created_at: z.string().optional(),
  updated_at: z.string().optional(),
  items: z.array(challanItemSchema).max(500).optional(),
});

function createTimestampedBackup(data: any[]): void {
  try {
    ensureDirs();
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const backupFile = path.join(BACKUP_DIR, `challans-backup-${timestamp}.json`);
    fs.writeFileSync(backupFile, JSON.stringify(data, null, 2), 'utf-8');

    // Retain only latest 20 backups to avoid disk bloat
    const files = fs
      .readdirSync(BACKUP_DIR)
      .filter((f) => f.startsWith('challans-backup-') && f.endsWith('.json'))
      .sort();

    if (files.length > 20) {
      const toDelete = files.slice(0, files.length - 20);
      for (const f of toDelete) {
        try {
          fs.unlinkSync(path.join(BACKUP_DIR, f));
        } catch {}
      }
    }
  } catch (err) {
    console.error('Backup creation error:', err);
  }
}

function readDb(): any[] {
  try {
    ensureDirs();
    if (!fs.existsSync(DATA_FILE)) {
      return [];
    }
    const raw = fs.readFileSync(DATA_FILE, 'utf-8');
    if (!raw.trim()) return [];
    return JSON.parse(raw);
  } catch (err) {
    console.error('Error reading data/challans.json:', err);
    return [];
  }
}

function writeDb(challans: any[]): void {
  try {
    ensureDirs();
    createTimestampedBackup(challans);
    fs.writeFileSync(DATA_FILE, JSON.stringify(challans, null, 2), 'utf-8');
  } catch (err) {
    console.error('Error writing data/challans.json:', err);
  }
}

/**
 * GET /api/challans
 * Returns active challans for authenticated admin
 */
export async function GET(req: NextRequest) {
  const session = getAuthenticatedSession(req);
  if (!session) {
    return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const includeDeleted = searchParams.get('include_deleted') === 'true';

  const allChallans = readDb();
  const filtered = includeDeleted ? allChallans : allChallans.filter((c) => !c.is_deleted);

  return NextResponse.json({ success: true, challans: filtered });
}

/**
 * POST /api/challans
 * Creates or updates a challan with strict schema validation
 */
export async function POST(req: NextRequest) {
  const session = getAuthenticatedSession(req);
  if (!session) {
    return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const body = await req.json();
    if (!body || !body.challan) {
      return NextResponse.json(
        { success: false, error: 'Request body must contain challan payload' },
        { status: 400 }
      );
    }

    const validationResult = challanSchema.safeParse(body.challan);
    if (!validationResult.success) {
      const issue = validationResult.error.issues[0];
      const errorMsg = `${issue.path.join('.') || 'field'}: ${issue.message}`;
      return NextResponse.json({ success: false, error: errorMsg }, { status: 422 });
    }

    const validChallan = validationResult.data;
    const challans = readDb();
    const idx = challans.findIndex((c) => c.id === validChallan.id);

    const now = new Date().toISOString();
    const finalRecord = {
      ...validChallan,
      updated_at: now,
      created_at: idx >= 0 ? challans[idx].created_at || now : validChallan.created_at || now,
      is_deleted: false,
    };

    if (idx >= 0) {
      challans[idx] = finalRecord;
    } else {
      challans.push(finalRecord);
    }

    writeDb(challans);
    return NextResponse.json({ success: true, challan: finalRecord });
  } catch (err: any) {
    console.error('Error saving challan:', err);
    return NextResponse.json(
      { success: false, error: err.message || 'Failed to save challan' },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/challans?id=XYZ
 * Performs soft-delete with automated backup
 */
export async function DELETE(req: NextRequest) {
  const session = getAuthenticatedSession(req);
  if (!session) {
    return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const { searchParams } = new URL(req.url);
    const id = searchParams.get('id');
    const permanent = searchParams.get('permanent') === 'true';

    if (!id) {
      return NextResponse.json({ success: false, error: 'Missing challan id parameter' }, { status: 400 });
    }

    const challans = readDb();
    const targetIdx = challans.findIndex((c) => c.id === id);

    if (targetIdx === -1) {
      return NextResponse.json({ success: true, deleted: false, message: 'Challan not found' });
    }

    if (permanent) {
      challans.splice(targetIdx, 1);
    } else {
      // Soft delete
      challans[targetIdx] = {
        ...challans[targetIdx],
        is_deleted: true,
        deleted_at: new Date().toISOString(),
      };
    }

    writeDb(challans);

    return NextResponse.json({
      success: true,
      deleted: true,
      id,
      permanent,
    });
  } catch (err: any) {
    console.error('Error deleting challan:', err);
    return NextResponse.json(
      { success: false, error: err.message || 'Failed to delete challan' },
      { status: 500 }
    );
  }
}
