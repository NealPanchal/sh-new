/**
 * Production Excel (.xlsx) export utility for Showhouse monthly sales and challans.
 * Generates an executive-grade workbook containing both:
 * 1. Monthly Sales & Invoices Summary (with tax, transport, and grand total breakdowns)
 * 2. Itemized Line Items (detailed product breakdown by brand, color, unit, rate)
 */

import * as XLSX from 'xlsx';
import { Challan, ChallanItem, BusinessProfile } from '@/types';
import { formatDateIndian } from '@/lib/utils';

export interface ExportSalesExcelOptions {
  challans: Challan[];
  monthLabel?: string;
  profile?: BusinessProfile | null;
  customFilename?: string;
}

export function exportMonthSalesToExcel({
  challans,
  monthLabel = 'All Dates',
  profile,
  customFilename,
}: ExportSalesExcelOptions): void {
  const wb = XLSX.utils.book_new();
  const businessName = profile?.business_name || 'SHOWHOUSE';

  // Sort chronologically or by serial
  const sortedChallans = [...challans].sort((a, b) => {
    const da = new Date(a.challan_date || 0).getTime();
    const db = new Date(b.challan_date || 0).getTime();
    return da - db;
  });

  // ----------------------------------------------------
  // 1. SHEET 1: MONTHLY SALES SUMMARY
  // ----------------------------------------------------
  const sheet1Data: (string | number)[][] = [
    [`${businessName.toUpperCase()} DECOR STUDIO — OFFICIAL MONTHLY SALES REPORT`],
    [
      `Period: ${monthLabel}`,
      `Total Orders: ${sortedChallans.length}`,
      `Generated on: ${formatDateIndian(new Date().toISOString())}`,
      `Address: ${profile?.address || 'Near Makhmali Talao, LBS Road, Thane (W)'}`,
      `GSTIN: ${profile?.gstin || '27AATFS5783M1Z8'}`,
    ],
    [], // Blank separator row
    [
      'S.No.',
      'Challan No.',
      'PI No.',
      'Date',
      'Staff PO #',
      'Billed By',
      'Customer / Client',
      'Customer Phone',
      'Delivery Site Address',
      'Items Summary',
      'Total Qty',
      'Taxable Subtotal (₹)',
      'Transportation (₹)',
      'Loading (₹)',
      'CGST 9% (₹)',
      'SGST 9% (₹)',
      'Addl 9% (₹)',
      'Grand Total (₹)',
      'Status',
      'Delivery Date',
    ],
  ];

  let sumQty = 0;
  let sumSubtotal = 0;
  let sumTransport = 0;
  let sumLoading = 0;
  let sumCGST = 0;
  let sumSGST = 0;
  let sumAddl = 0;
  let sumGrandTotal = 0;

  sortedChallans.forEach((c, idx) => {
    const itemsList = c.items || [];
    const itemsText = itemsList
      .map((it) => `${it.item_description} (${it.quantity} ${it.unit})`)
      .join(', ');

    const qty = Number(c.total_quantity) || 0;
    const transport = Number(c.transportation_charges) || 0;
    const loading = Number(c.loading_charges) || 0;

    const itemsSub = itemsList.reduce(
      (s, it) => s + (Number(it.amount) || (Number(it.rate) || 0) * (Number(it.quantity) || 0)),
      0
    );
    const subtotal = c.subtotal_amount || (itemsSub + transport + loading);

    const cgst = c.cgst_amount ?? (c.apply_gst && subtotal > 0 ? Math.round(subtotal * 0.09) : 0);
    const sgst = c.sgst_amount ?? (c.apply_gst && subtotal > 0 ? Math.round(subtotal * 0.09) : 0);
    const addl =
      c.additional_9_amount ??
      (c.apply_additional_9 && subtotal > 0 ? Math.round(subtotal * 0.09) : 0);
    const grandTotal = c.total_amount || (subtotal + cgst + sgst + addl);

    sumQty += qty;
    sumSubtotal += subtotal;
    sumTransport += transport;
    sumLoading += loading;
    sumCGST += cgst;
    sumSGST += sgst;
    sumAddl += addl;
    sumGrandTotal += grandTotal;

    sheet1Data.push([
      idx + 1,
      c.challan_number,
      c.pi_number || '',
      formatDateIndian(c.challan_date),
      c.reference_number || '',
      c.created_by || c.prepared_by || '',
      c.customer_name || 'Walk-in Customer',
      c.customer_phone || '',
      c.delivery_address || c.customer_address || '',
      itemsText,
      qty,
      subtotal,
      transport,
      loading,
      cgst,
      sgst,
      addl,
      grandTotal,
      (c.status || 'draft').toUpperCase(),
      c.delivered_at ? formatDateIndian(c.delivered_at) : '',
    ]);
  });

  // Add Totals Row
  sheet1Data.push([
    '',
    'TOTALS',
    '',
    '',
    '',
    '',
    '',
    '',
    '',
    `${sortedChallans.length} Orders`,
    sumQty,
    sumSubtotal,
    sumTransport,
    sumLoading,
    sumCGST,
    sumSGST,
    sumAddl,
    sumGrandTotal,
    '',
    '',
  ]);

  // Executive KPI summary at the bottom
  sheet1Data.push([]);
  sheet1Data.push(['EXECUTIVE SALES SUMMARY:']);
  sheet1Data.push(['Total Challans / Invoices:', sortedChallans.length]);
  sheet1Data.push(['Total Material Sold (Sheets/Units):', sumQty]);
  sheet1Data.push(['Net Taxable Sales (₹):', sumSubtotal]);
  sheet1Data.push(['Total GST & Taxes (₹):', sumCGST + sumSGST + sumAddl]);
  sheet1Data.push(['TOTAL REVENUE / GRAND TOTAL (₹):', sumGrandTotal]);

  const ws1 = XLSX.utils.aoa_to_sheet(sheet1Data);

  // Set column widths for readability in Excel
  ws1['!cols'] = [
    { wch: 6 },  // S.No
    { wch: 18 }, // Challan No
    { wch: 18 }, // PI No
    { wch: 13 }, // Date
    { wch: 14 }, // Staff PO
    { wch: 14 }, // Billed By
    { wch: 25 }, // Customer Name
    { wch: 15 }, // Customer Phone
    { wch: 30 }, // Delivery Site
    { wch: 40 }, // Items Summary
    { wch: 12 }, // Total Qty
    { wch: 18 }, // Subtotal
    { wch: 16 }, // Transport
    { wch: 14 }, // Loading
    { wch: 14 }, // CGST
    { wch: 14 }, // SGST
    { wch: 14 }, // Addl
    { wch: 18 }, // Grand Total
    { wch: 12 }, // Status
    { wch: 14 }, // Delivered Date
  ];

  XLSX.utils.book_append_sheet(wb, ws1, 'Sales Summary');

  // ----------------------------------------------------
  // 2. SHEET 2: ITEMIZED PRODUCTS BREAKDOWN
  // ----------------------------------------------------
  const sheet2Data: (string | number)[][] = [
    [`${businessName.toUpperCase()} — ITEMIZED PRODUCTS DISPATCHED`],
    [`Period: ${monthLabel}`, `Total Invoices: ${sortedChallans.length}`],
    [],
    [
      'S.No.',
      'Challan No.',
      'Date',
      'Customer Name',
      'Item Description',
      'Brand',
      'Color / Finish',
      'Size / Thickness',
      'Quantity',
      'Unit',
      'Rate (₹)',
      'Amount (₹)',
      'Billed By',
    ],
  ];

  let itemSerial = 1;
  sortedChallans.forEach((c) => {
    const items = c.items || [];
    items.forEach((it) => {
      const rate = Number(it.rate) || 0;
      const amt = Number(it.amount) || (rate > 0 ? rate * Number(it.quantity) : 0);
      sheet2Data.push([
        itemSerial++,
        c.challan_number,
        formatDateIndian(c.challan_date),
        c.customer_name,
        it.item_description,
        it.brand || '',
        it.colour_finish || '',
        it.size || '',
        Number(it.quantity) || 0,
        it.unit || 'sheets',
        rate > 0 ? rate : '—',
        amt > 0 ? amt : '—',
        c.created_by || c.prepared_by || '',
      ]);
    });
  });

  const ws2 = XLSX.utils.aoa_to_sheet(sheet2Data);
  ws2['!cols'] = [
    { wch: 6 },
    { wch: 18 },
    { wch: 13 },
    { wch: 25 },
    { wch: 35 },
    { wch: 16 },
    { wch: 16 },
    { wch: 18 },
    { wch: 12 },
    { wch: 10 },
    { wch: 12 },
    { wch: 15 },
    { wch: 14 },
  ];

  XLSX.utils.book_append_sheet(wb, ws2, 'Itemized Items');

  // ----------------------------------------------------
  // 3. TRIGGER BROWSER DOWNLOAD
  // ----------------------------------------------------
  const cleanMonth = (monthLabel || 'Sales')
    .replace(/[^a-zA-Z0-9]/g, '_')
    .replace(/_+/g, '_');
  const filename = customFilename || `Showhouse_Sales_${cleanMonth}.xlsx`;

  XLSX.writeFile(wb, filename);
}

export interface ExportLedgerExcelOptions {
  customerName: string;
  openingBalance: number;
  totalDebit: number;
  totalCredit: number;
  closingBalance: number;
  entries: Array<{
    date: string;
    particulars: string;
    reference: string;
    site_name?: string;
    debit: number;
    credit: number;
    running_balance: number;
  }>;
  dateRangeLabel?: string;
  customFilename?: string;
}

export function exportCustomerLedgerToExcel(opts: ExportLedgerExcelOptions): void {
  const wb = XLSX.utils.book_new();

  const data: (string | number)[][] = [
    ['SHOWHOUSE DECOR STUDIO — OFFICIAL PARTY STATEMENT OF ACCOUNT / LEDGER'],
    [`Party / Customer: ${opts.customerName}`],
    [`Period: ${opts.dateRangeLabel || 'All Transactions'}`],
    [`Generated Date: ${formatDateIndian(new Date().toISOString())}`],
    [],
    [
      'Date',
      'Particulars',
      'Site / Project',
      'Voucher / Ref No.',
      'Debit (₹)',
      'Credit (₹)',
      'Balance (₹)',
    ],
    [
      '',
      'Opening Balance b/f',
      '',
      '',
      opts.openingBalance > 0 ? opts.openingBalance : 0,
      opts.openingBalance < 0 ? Math.abs(opts.openingBalance) : 0,
      opts.openingBalance,
    ],
  ];

  opts.entries.forEach((row) => {
    data.push([
      formatDateIndian(row.date),
      row.particulars,
      row.site_name || 'General',
      row.reference || '',
      row.debit > 0 ? row.debit : '',
      row.credit > 0 ? row.credit : '',
      row.running_balance,
    ]);
  });

  // Total summary footer
  data.push([]);
  data.push([
    'TOTALS',
    'Summary of Debit / Credit Totals',
    '',
    '',
    opts.totalDebit,
    opts.totalCredit,
    opts.closingBalance,
  ]);
  data.push([
    'CLOSING OUTSTANDING',
    `Net Balance Due: ₹${opts.closingBalance.toLocaleString('en-IN')}`,
    '',
    '',
    '',
    '',
    opts.closingBalance,
  ]);

  const ws = XLSX.utils.aoa_to_sheet(data);
  ws['!cols'] = [
    { wch: 14 },
    { wch: 38 },
    { wch: 22 },
    { wch: 20 },
    { wch: 16 },
    { wch: 16 },
    { wch: 18 },
  ];

  XLSX.utils.book_append_sheet(wb, ws, 'Party Ledger');

  const safeName = opts.customerName.replace(/[^a-zA-Z0-9]/g, '_');
  const filename = opts.customFilename || `Ledger_${safeName}_${new Date().toISOString().substring(0, 10)}.xlsx`;

  XLSX.writeFile(wb, filename);
}

