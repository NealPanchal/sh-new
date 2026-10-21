import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import { Challan } from '@/types';

const DATA_FILE = path.join(process.cwd(), 'data', 'challans.json');

function readDb(): Challan[] {
  try {
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

function writeDb(challans: Challan[]): void {
  try {
    const dir = path.dirname(DATA_FILE);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(DATA_FILE, JSON.stringify(challans, null, 2), 'utf-8');
  } catch (err) {
    console.error('Error writing data/challans.json:', err);
  }
}

export async function GET() {
  const challans = readDb();
  return NextResponse.json({ success: true, challans });
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const challan: Challan = body.challan;
    if (!challan || !challan.id) {
      return NextResponse.json({ success: false, error: 'Invalid challan data' }, { status: 400 });
    }

    const challans = readDb();
    const idx = challans.findIndex((c) => c.id === challan.id);
    if (idx >= 0) {
      challans[idx] = challan;
    } else {
      challans.push(challan);
    }
    writeDb(challans);
    return NextResponse.json({ success: true, challan });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const id = searchParams.get('id');
    if (!id) {
      return NextResponse.json({ success: false, error: 'Missing challan id' }, { status: 400 });
    }

    let challans = readDb();
    const initialLen = challans.length;
    challans = challans.filter((c) => c.id !== id);
    writeDb(challans);

    return NextResponse.json({
      success: true,
      deleted: challans.length < initialLen,
      id,
    });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
