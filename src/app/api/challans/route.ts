import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import { z } from 'zod';
import { Challan } from '@/types';
import { getAuthenticatedSession } from '@/lib/server-auth';
import {
  fetchSingleChallanFromFirestore,
  fetchAllChallansFromFirestore,
  saveChallanToFirestoreRest,
  deleteChallanFromFirestoreRest,
} from '@/lib/server-firestore';
import {
  recordAuditLog,
  hasActiveCreditException,
  checkCustomerCreditStatus,
} from '@/lib/server-accounting';

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
  id: z.string().min(1).default(() => crypto.randomUUID()),
  challan_id: z.string().nullish(),
  serial_number: z.coerce.number().int().nullish(),
  product_id: z.string().nullish(),
  item_description: z.string().nullish().transform((v) => v || ''),
  brand: z.string().nullish(),
  colour_finish: z.string().nullish(),
  size: z.string().nullish(),
  unit: z.string().nullish().default('sheets'),
  quantity: z.coerce.number().nonnegative().default(0),
  rate: z.coerce.number().nullish(),
  discount_type: z.enum(['percent', 'amount']).nullish(),
  discount_value: z.coerce.number().nullish(),
  discount_amount: z.coerce.number().nullish(),
  amount: z.coerce.number().nullish(),
  created_at: z.string().nullish(),
});

const challanSchema = z.object({
  id: z.string().min(1).max(128),
  user_id: z.string().nullish().default('adminsh'),
  challan_number: z.string().min(1).max(64),
  pi_number: z.string().nullish(),
  document_type: z.enum(['challan', 'proforma_invoice', 'both']).nullish(),
  challan_date: z.string().min(1).max(32),
  customer_id: z.string().nullish().default(''),
  customer_name: z.string().nullish().default(''),
  customer_phone: z.string().nullish().default(''),
  customer_address: z.string().nullish().default(''),
  customer_gstin: z.string().nullish(),
  delivery_address: z.string().nullish(),
  site_id: z.string().nullish(),
  site_name: z.string().nullish(),
  reference_number: z.string().nullish(),
  notes: z.string().nullish(),
  prepared_by: z.string().nullish(),
  created_by: z.string().nullish(),
  status: z
    .enum([
      'pending',
      'approved',
      'out_for_delivery',
      'delivered',
      'partially_delivered',
      'cancelled',
      'goods_returned',
      'draft',
      'final',
      'void',
    ])
    .nullish()
    .default('pending'),
  share_status: z
    .enum(['not_shared', 'share_initiated', 'user_marked_sent', 'failed'])
    .nullish()
    .default('not_shared'),
  is_delivered: z.boolean().nullish(),
  delivered_at: z.string().nullish(),
  delivered_by: z.string().nullish(),
  delivery_remarks: z.string().nullish(),
  proof_of_delivery: z.string().nullish(),
  approved_at: z.string().nullish(),
  approved_by: z.string().nullish(),
  total_quantity: z.coerce.number().nonnegative().default(0),
  discount_type: z.enum(['percent', 'amount']).nullish(),
  discount_value: z.coerce.number().nullish(),
  discount_amount: z.coerce.number().nullish(),
  total_amount: z.coerce.number().nullish(),
  subtotal_amount: z.coerce.number().nullish(),
  transportation_charges: z.coerce.number().nullish(),
  loading_charges: z.coerce.number().nullish(),
  apply_gst: z.boolean().nullish(),
  cgst_amount: z.coerce.number().nullish(),
  sgst_amount: z.coerce.number().nullish(),
  apply_additional_9: z.boolean().nullish(),
  additional_9_amount: z.coerce.number().nullish(),
  is_deleted: z.boolean().nullish(),
  deleted_at: z.string().nullish(),
  created_at: z.string().nullish(),
  updated_at: z.string().nullish(),
  items: z.array(challanItemSchema).max(500).nullish(),
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
    const content = JSON.stringify(challans, null, 2);
    const tempFile = `${DATA_FILE}.tmp.${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    fs.writeFileSync(tempFile, content, 'utf-8');
    fs.renameSync(tempFile, DATA_FILE);
  } catch (err) {
    console.error('Error writing data/challans.json:', err);
  }
}

/**
 * GET /api/challans
 * Returns active challans or a single challan by ID for authenticated admin
 */
export async function GET(req: NextRequest) {
  const session = getAuthenticatedSession(req);
  if (!session) {
    return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const id = searchParams.get('id');
  const challanNumber = searchParams.get('challan_number');
  const includeDeleted = searchParams.get('include_deleted') === 'true';

  // Single challan lookup
  const targetId = id || challanNumber;
  if (targetId) {
    const localChallans = readDb();
    const foundLocal = localChallans.find(
      (c) => (c.id === targetId || c.challan_number === targetId) && (includeDeleted || !c.is_deleted)
    );
    if (foundLocal) {
      if (session.role === 'employee') {
        const uName = (session.name || '').toLowerCase();
        const uUser = (session.username || '').toLowerCase();
        const prep = (foundLocal.prepared_by || '').toLowerCase();
        const cr = (foundLocal.created_by || '').toLowerCase();
        const belongs = (uName && (prep.includes(uName) || cr.includes(uName))) ||
                        (uUser && (prep === uUser || cr === uUser));
        if (!belongs) {
          return NextResponse.json({ success: false, error: 'Access denied. Employees can only view their own challans.' }, { status: 403 });
        }
      }
      return NextResponse.json({ success: true, challan: foundLocal });
    }

    // Direct lookup in Cloud Firestore REST
    try {
      const remote = await fetchSingleChallanFromFirestore(targetId);
      if (remote && (includeDeleted || !remote.is_deleted)) {
        if (session.role === 'employee') {
          const uName = (session.name || '').toLowerCase();
          const uUser = (session.username || '').toLowerCase();
          const prep = (remote.prepared_by || '').toLowerCase();
          const cr = (remote.created_by || '').toLowerCase();
          const belongs = (uName && (prep.includes(uName) || cr.includes(uName))) ||
                          (uUser && (prep === uUser || cr === uUser));
          if (!belongs) {
            return NextResponse.json({ success: false, error: 'Access denied. Employees can only view their own challans.' }, { status: 403 });
          }
        }
        return NextResponse.json({ success: true, challan: remote });
      }
    } catch (err) {
      console.warn('API GET single challan Firestore note:', err);
    }

    return NextResponse.json(
      { success: false, error: 'Challan not found' },
      { status: 404 }
    );
  }

  // All challans lookup: merge local database and Cloud Firestore
  const localChallans = readDb();
  const map = new Map<string, any>();

  for (const c of localChallans) {
    if (includeDeleted || !c.is_deleted) {
      map.set(c.id, c);
    }
  }

  try {
    const remote = await fetchAllChallansFromFirestore();
    for (const rc of remote) {
      if (includeDeleted || !rc.is_deleted) {
        const existing = map.get(rc.id);
        if (!existing) {
          map.set(rc.id, rc);
        } else {
          const tLocal = new Date(existing.updated_at || existing.created_at || 0).getTime();
          const tRemote = new Date(rc.updated_at || rc.created_at || 0).getTime();
          if (tRemote >= tLocal) {
            map.set(rc.id, rc);
          }
        }
      }
    }
  } catch (err) {
    console.warn('API GET all challans remote merge note:', err);
  }

  let list = Array.from(map.values()).sort((a, b) => {
    const da = new Date(b.challan_date || b.created_at || 0).getTime();
    const db = new Date(a.challan_date || a.created_at || 0).getTime();
    return da - db;
  });

  // Strict Data Leakage Protection: Employees can ONLY view challans they created
  if (session.role === 'employee') {
    const uName = (session.name || '').toLowerCase();
    const uUser = (session.username || '').toLowerCase();
    list = list.filter((c) => {
      const prep = (c.prepared_by || '').toLowerCase();
      const cr = (c.created_by || '').toLowerCase();
      return (uName && (prep.includes(uName) || cr.includes(uName))) ||
             (uUser && (prep === uUser || cr === uUser));
    });
  }

  return NextResponse.json({ success: true, challans: list });
}

/**
 * POST /api/challans
 * Creates or updates a challan with dual-sync: local JSON database + Cloud Firestore
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

    // 1. Role-Based Permission Check: Employees CANNOT edit approved or delivered challans (Requirement 3)
    if (idx >= 0) {
      const existingStatus = challans[idx].status;
      const isApprovedOrDelivered =
        challans[idx].is_approved ||
        existingStatus === 'approved' ||
        existingStatus === 'delivered' ||
        existingStatus === 'final';

      if (isApprovedOrDelivered && session.role !== 'admin') {
        return NextResponse.json(
          {
            success: false,
            error:
              'Permission denied. Approved or delivered challans can only be edited or modified by an Administrator.',
          },
          { status: 403 }
        );
      }

      if (session.role === 'employee') {
        const uName = (session.name || '').toLowerCase();
        const uUser = (session.username || '').toLowerCase();
        const prep = (challans[idx].prepared_by || '').toLowerCase();
        const cr = (challans[idx].created_by || '').toLowerCase();
        const belongs = (uName && (prep.includes(uName) || cr.includes(uName))) ||
                        (uUser && (prep === uUser || cr === uUser));
        if (!belongs) {
          return NextResponse.json(
            { success: false, error: 'Permission denied. Employees can only edit their own challans.' },
            { status: 403 }
          );
        }
      }

      // If Admin edits an approved challan, record an audit log (Requirement 3)
      if (
        session.role === 'admin' &&
        isApprovedOrDelivered
      ) {
        recordAuditLog({
          entity_type: 'challan',
          entity_id: validChallan.id,
          reference_no: validChallan.challan_number,
          user_id: session.username,
          user_name: session.name,
          action: 'ADMIN_EDIT_APPROVED_CHALLAN',
          previous_values: challans[idx],
          updated_values: validChallan,
          reason: body.modification_reason || 'Administrative correction/adjustment',
        });
      }
    }

    // 2. 45-Day Payment Limit & Credit Control Check on new challan creation (Requirement 11)
    if (idx < 0 && validChallan.customer_id && session.role !== 'admin') {
      const hasException = hasActiveCreditException(validChallan.customer_id);
      if (!hasException) {
        // Read customer profile if exists
        try {
          const custPath = path.join(DATA_DIR, 'customers.json');
          if (fs.existsSync(custPath)) {
            const customersList = JSON.parse(fs.readFileSync(custPath, 'utf-8'));
            const matchedCust = customersList.find((c: any) => c.id === validChallan.customer_id);
            if (matchedCust) {
              const creditStatus = checkCustomerCreditStatus(matchedCust, challans);
              if (creditStatus.isBlocked) {
                return NextResponse.json(
                  {
                    success: false,
                    error: `Customer is blocked from new challan creation: ${creditStatus.blockReason}. Only an Administrator can approve an exception.`,
                  },
                  { status: 403 }
                );
              }
            }
          }
        } catch (creditErr) {
          console.warn('Credit check note:', creditErr);
        }
      }
    }

    // 3. Concurrency Safety: Monthly Challan Numbering Conflict Prevention (Requirement 1)
    let assignedChallanNumber = validChallan.challan_number;
    if (
      idx < 0 &&
      challans.some((c) => c.challan_number === assignedChallanNumber && !c.is_deleted)
    ) {
      // Conflict detected! Auto-advance to the next unique sequence for this month
      const match = assignedChallanNumber.match(/^(.*?\/)(\d{2})\/(\d+)$/);
      if (match) {
        const prefix = match[1];
        const monthStr = match[2];
        let maxSeq = 0;
        const monthPattern = new RegExp(`^${prefix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}${monthStr}\\/(\\d+)$`, 'i');

        challans.forEach((c) => {
          if (!c.is_deleted && c.challan_number) {
            const m = c.challan_number.match(monthPattern);
            if (m && m[1]) {
              const n = parseInt(m[1], 10);
              if (!isNaN(n) && n > maxSeq) maxSeq = n;
            }
          }
        });

        let nextSeq = maxSeq + 1;
        while (
          challans.some(
            (c) =>
              c.challan_number === `${prefix}${monthStr}/${String(nextSeq).padStart(3, '0')}` &&
              !c.is_deleted
          )
        ) {
          nextSeq++;
        }
        assignedChallanNumber = `${prefix}${monthStr}/${String(nextSeq).padStart(3, '0')}`;
      }
    }

    const now = new Date().toISOString();
    const cleanItems = (validChallan.items || []).map((it, i) => ({
      ...it,
      id: it.id || crypto.randomUUID(),
      challan_id: validChallan.id,
      serial_number: it.serial_number || i + 1,
      unit: it.unit || 'sheets',
      quantity: Number(it.quantity) || 0,
      rate: it.rate != null ? Number(it.rate) : null,
      amount: it.amount != null ? Number(it.amount) : null,
      created_at: it.created_at || now,
    }));

    const finalRecord = {
      ...validChallan,
      challan_number: assignedChallanNumber,
      customer_id: validChallan.customer_id || '',
      customer_name: validChallan.customer_name || 'Walk-in Customer',
      customer_phone: validChallan.customer_phone || '',
      customer_address: validChallan.customer_address || '',
      delivery_address: validChallan.delivery_address || validChallan.customer_address || '',
      items: cleanItems,
      updated_at: now,
      created_at: idx >= 0 ? challans[idx].created_at || now : validChallan.created_at || now,
      is_deleted: false,
    };

    if (idx >= 0) {
      challans[idx] = finalRecord;
    } else {
      challans.push(finalRecord);
    }

    // 1. Dual persistence: Local File (server/dev)
    try {
      writeDb(challans);
    } catch (writeErr) {
      console.warn('Local writeDb skipped (read-only environment):', writeErr);
    }

    // 2. Dual persistence: Cloud Firestore REST API (works everywhere, including Vercel)
    try {
      await saveChallanToFirestoreRest(finalRecord as Challan);
    } catch (remoteErr) {
      console.warn('Firestore server sync note:', remoteErr);
    }

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
 * Performs soft-delete or permanent delete with dual sync
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
      return NextResponse.json(
        { success: false, error: 'Missing challan identifier (id required)' },
        { status: 400 }
      );
    }

    if (session.role === 'employee') {
      return NextResponse.json(
        {
          success: false,
          error: 'Permission denied. Staff members cannot delete challan records. Please contact an Administrator.',
        },
        { status: 403 }
      );
    }

    const challans = readDb();
    const targetIdx = challans.findIndex((c) => c.id === id);

    if (targetIdx >= 0) {
      const existingStatus = challans[targetIdx].status;
      const isApprovedOrDelivered =
        challans[targetIdx].is_approved ||
        existingStatus === 'approved' ||
        existingStatus === 'delivered' ||
        existingStatus === 'final';

      if (isApprovedOrDelivered && session.role !== 'admin') {
        return NextResponse.json(
          {
            success: false,
            error: 'Permission denied. Approved or delivered challans cannot be deleted by employees.',
          },
          { status: 403 }
        );
      }
    }

    let deletedItem: any = targetIdx >= 0 ? challans[targetIdx] : null;

    if (targetIdx >= 0) {
      if (permanent) {
        challans.splice(targetIdx, 1);
      } else {
        challans[targetIdx] = {
          ...challans[targetIdx],
          is_deleted: true,
          deleted_at: new Date().toISOString(),
        };
        deletedItem = challans[targetIdx];
      }

      try {
        writeDb(challans);
      } catch (err) {
        console.warn('writeDb delete note:', err);
      }
    }

    // Sync deletion to Cloud Firestore strictly for this document ID
    try {
      if (permanent) {
        await deleteChallanFromFirestoreRest(id);
      } else if (deletedItem) {
        await saveChallanToFirestoreRest({
          ...deletedItem,
          is_deleted: true,
          deleted_at: new Date().toISOString(),
        });
      }
    } catch (remoteErr) {
      console.warn('Remote deletion sync note:', remoteErr);
    }

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
