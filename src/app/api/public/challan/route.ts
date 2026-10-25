import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

import { fetchSingleChallanFromFirestore } from '@/lib/server-firestore';

const DATA_DIR = path.join(process.cwd(), 'data');
const DATA_FILE = path.join(DATA_DIR, 'challans.json');
const SETTINGS_FILE = path.join(DATA_DIR, 'settings.json');

/**
 * GET /api/public/challan?id=XYZ
 * Public read-only endpoint for customers to view their Delivery Challan / Memo Bill
 */
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const id = searchParams.get('id');

    if (!id) {
      return NextResponse.json(
        { success: false, error: 'Challan ID required' },
        { status: 400 }
      );
    }

    let challan: any = null;

    // 1. Try local data file
    if (fs.existsSync(DATA_FILE)) {
      try {
        const raw = fs.readFileSync(DATA_FILE, 'utf-8');
        if (raw.trim()) {
          const challans: any[] = JSON.parse(raw);
          challan = challans.find(
            (c) => (c.id === id || c.challan_number === id) && !c.is_deleted
          );
        }
      } catch {}
    }

    // 2. Fallback to Cloud Firestore REST API (essential for Vercel / Cloud deployments)
    if (!challan) {
      try {
        const remote = await fetchSingleChallanFromFirestore(id);
        if (remote && !remote.is_deleted) {
          challan = remote;
        }
      } catch (remoteErr) {
        console.warn('Public challan Firestore fetch note:', remoteErr);
      }
    }

    if (!challan) {
      return NextResponse.json(
        { success: false, error: 'Challan not found or expired' },
        { status: 404 }
      );
    }

    let profile: any = null;
    if (fs.existsSync(SETTINGS_FILE)) {
      const raw = fs.readFileSync(SETTINGS_FILE, 'utf-8');
      if (raw.trim()) profile = JSON.parse(raw);
    }

    return NextResponse.json({
      success: true,
      challan,
      profile,
    });
  } catch (err: any) {
    console.error('Public challan fetch error:', err);
    return NextResponse.json(
      { success: false, error: 'Failed to retrieve challan details' },
      { status: 500 }
    );
  }
}
