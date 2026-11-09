import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { Customer, CustomerLedgerEntry, CustomerSite } from '@/types';

interface ExportLedgerPDFOptions {
  customer: Customer;
  fromDate?: string;
  toDate?: string;
  openingBalance: number;
  totalDebit: number;
  totalCredit: number;
  closingBalance: number;
  entries: CustomerLedgerEntry[];
  sites: CustomerSite[];
  isAccountPaid?: boolean;
}

export function exportLedgerToPDF(options: ExportLedgerPDFOptions) {
  const {
    customer,
    fromDate,
    toDate,
    openingBalance,
    totalDebit,
    totalCredit,
    closingBalance,
    entries,
    sites,
    isAccountPaid = false,
  } = options;

  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4',
  });

  const pageWidth = doc.internal.pageSize.getWidth();

  // 1. Company Header (Centered)
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(14);
  doc.setTextColor(20, 20, 20);
  doc.text('Show House Concepts & Designs LLP-(From 1 Apr-2023)', pageWidth / 2, 14, { align: 'center' });

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(60, 60, 60);
  doc.text('VISHRAM BAUG', pageWidth / 2, 18.5, { align: 'center' });
  doc.text('LBS ROAD, NEAR MAKHMALI TALAO', pageWidth / 2, 22, { align: 'center' });
  doc.text('THANE (WEST)', pageWidth / 2, 25.5, { align: 'center' });
  doc.text('91-25387683/25387687 | Contact : 02225387687', pageWidth / 2, 29, { align: 'center' });
  doc.text('E-Mail : accounts@showhousedecor.com', pageWidth / 2, 32.5, { align: 'center' });

  // Divider line
  doc.setDrawColor(210, 210, 210);
  doc.setLineWidth(0.3);
  doc.line(14, 35, pageWidth - 14, 35);

  // 2. Customer Ledger Details (Centered)
  let y = 41;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(13);
  doc.setTextColor(15, 15, 15);
  doc.text(customer.name || customer.business_name || 'Customer Ledger', pageWidth / 2, y, { align: 'center' });

  y += 4.5;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(80, 80, 80);
  doc.text('Ledger Account', pageWidth / 2, y, { align: 'center' });

  const addrLines = (customer.billing_address || customer.delivery_address || 'Thane')
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean);

  addrLines.forEach((line) => {
    y += 4;
    doc.text(line, pageWidth / 2, y, { align: 'center' });
  });

  // Render compact PAID rubber stamp watermark in upper corner if account is settled
  const isSettled = Boolean(isAccountPaid && totalDebit > 0 && closingBalance <= 0);
  if (isSettled) {
    try {
      doc.saveGraphicsState();
      doc.setTextColor(22, 163, 74);
      doc.setDrawColor(22, 163, 74);
      doc.setLineWidth(0.6);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(11);
      doc.text('★ PAID ★', pageWidth - 24, 20, { angle: -6, align: 'center' });
      doc.setFontSize(6);
      doc.text('SETTLED', pageWidth - 24, 23.5, { angle: -6, align: 'center' });
      doc.restoreGraphicsState();
    } catch {}
  }

  // Date Range Bar
  y += 6;
  doc.setFillColor(248, 248, 248);
  doc.rect(14, y, pageWidth - 28, 6.5, 'F');
  doc.setDrawColor(220, 220, 220);
  doc.rect(14, y, pageWidth - 28, 6.5, 'S');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.setTextColor(50, 50, 50);
  doc.text(`From Date: ${fromDate || '01-Feb-2024'}`, 18, y + 4.3);
  doc.text(`To Date: ${toDate || '31-Mar-2027'}`, 80, y + 4.3);
  if (customer.gstin) {
    doc.text(`GSTIN: ${customer.gstin}`, pageWidth - 18, y + 4.3, { align: 'right' });
  }

  y += 9;

  // 3. Ledger Transactions Table
  const tableData: any[] = [];

  const hasOpeningEntry = entries.some((e) => e.particulars.toLowerCase().includes('opening balance'));
  if (openingBalance !== 0 && !hasOpeningEntry) {
    const isDr = openingBalance > 0;
    tableData.push([
      1,
      fromDate ? formatDateShort(fromDate) : '',
      isDr ? 'To Opening Balance' : 'By Opening Balance',
      '—',
      '—',
      isDr ? Math.abs(openingBalance).toLocaleString('en-IN', { minimumFractionDigits: 2 }) : '',
      !isDr ? Math.abs(openingBalance).toLocaleString('en-IN', { minimumFractionDigits: 2 }) : '',
    ]);
  }

  entries.forEach((entry) => {
    const isPaidChallan = entry.is_paid && entry.debit > 0;
    const refDisplay = isPaidChallan ? `${entry.reference} [PAID]` : entry.reference;

    tableData.push([
      tableData.length + 1,
      entry.date ? formatDateShort(entry.date) : '',
      entry.particulars,
      entry.payment_type || (entry.debit > 0 ? 'Sales GST' : 'Receipt'),
      refDisplay,
      entry.debit > 0 ? entry.debit.toLocaleString('en-IN', { minimumFractionDigits: 2 }) : '',
      entry.credit > 0 ? entry.credit.toLocaleString('en-IN', { minimumFractionDigits: 2 }) : '',
    ]);
  });

  // Calculate comprehensive debits & credits including opening balance
  const opDr = openingBalance > 0 ? openingBalance : 0;
  const opCr = openingBalance < 0 ? Math.abs(openingBalance) : 0;
  const effectiveTotalDebit = totalDebit + (hasOpeningEntry ? 0 : opDr);
  const effectiveTotalCredit = totalCredit + (hasOpeningEntry ? 0 : opCr);

  // Closing balance row
  const isNetDebit = effectiveTotalDebit >= effectiveTotalCredit;
  const closingLabel = isSettled
    ? 'By Closing Balance (PAID IN FULL / SETTLED)'
    : isNetDebit
    ? 'By Closing Balance'
    : 'To Closing Balance';

  tableData.push([
    '',
    '',
    closingLabel,
    '',
    '',
    !isNetDebit ? Math.abs(closingBalance).toLocaleString('en-IN', { minimumFractionDigits: 2 }) : '',
    isNetDebit ? Math.abs(closingBalance).toLocaleString('en-IN', { minimumFractionDigits: 2 }) : '',
  ]);

  // Grand total balanced row
  const balancedTotal = Math.max(effectiveTotalDebit, effectiveTotalCredit);
  tableData.push([
    '',
    '',
    'Total (Balanced)',
    '',
    '',
    balancedTotal.toLocaleString('en-IN', { minimumFractionDigits: 2 }),
    balancedTotal.toLocaleString('en-IN', { minimumFractionDigits: 2 }),
  ]);

  autoTable(doc, {
    startY: y,
    head: [['Sr. No.', 'Date', 'Particulars', 'Type', 'Vch No.', 'Debit (₹)', 'Credit (₹)']],
    body: tableData,
    theme: 'grid',
    headStyles: {
      fillColor: [20, 20, 20],
      textColor: [255, 255, 255],
      fontStyle: 'bold',
      fontSize: 8,
      halign: 'center',
    },
    styles: {
      fontSize: 7.5,
      cellPadding: 2,
      textColor: [30, 30, 30],
    },
    columnStyles: {
      0: { cellWidth: 14, halign: 'center' },
      1: { cellWidth: 20, halign: 'center' },
      2: { cellWidth: 'auto', fontStyle: 'bold' },
      3: { cellWidth: 22, halign: 'center' },
      4: { cellWidth: 24, halign: 'center', fontStyle: 'bold' },
      5: { cellWidth: 26, halign: 'right', fontStyle: 'bold' },
      6: { cellWidth: 26, halign: 'right', fontStyle: 'bold' },
    },
    didParseCell: (data) => {
      // Bold closing and total rows
      if (data.row.index >= tableData.length - 2) {
        data.cell.styles.fontStyle = 'bold';
        if (data.row.index === tableData.length - 1) {
          data.cell.styles.fillColor = [240, 240, 240];
        }
      }
    },
  });

  // 4. Sites / Balance Adjustment Table
  let finalY = (doc as any).lastAutoTable.finalY + 8;

  // Check page overflow
  if (finalY > 230) {
    doc.addPage();
    finalY = 16;
  }

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.setTextColor(217, 83, 79);
  doc.text('⚡ Sites / Balance Adjustment', 14, finalY);

  finalY += 3;

  const sitesData: any[] = [];
  let sumOpening = 0;
  let sumCredit = 0;
  let sumDebit = 0;
  let sumCurrent = 0;

  sites.forEach((site, idx) => {
    const op = Number(site.opening_balance) || 0;
    const cr = Number(site.credit_adjustment) || 0;
    const db = Number(site.debit_adjustment) || 0;
    const cur = op + db - cr;

    sumOpening += op;
    sumCredit += cr;
    sumDebit += db;
    sumCurrent += cur;

    sitesData.push([
      idx + 1,
      site.site_name,
      op.toLocaleString('en-IN', { minimumFractionDigits: 2 }),
      `+ ${cr.toLocaleString('en-IN', { minimumFractionDigits: 2 })}`,
      `- ${db.toLocaleString('en-IN', { minimumFractionDigits: 2 })}`,
      cur.toLocaleString('en-IN', { minimumFractionDigits: 2 }),
      site.is_verified ? '✓ Verified' : 'Pending',
    ]);
  });

  sitesData.push([
    '',
    'Total (Sites)',
    sumOpening.toLocaleString('en-IN', { minimumFractionDigits: 2 }),
    sumCredit.toLocaleString('en-IN', { minimumFractionDigits: 2 }),
    sumDebit.toLocaleString('en-IN', { minimumFractionDigits: 2 }),
    sumCurrent.toLocaleString('en-IN', { minimumFractionDigits: 2 }),
    '',
  ]);

  autoTable(doc, {
    startY: finalY,
    head: [['Sr. No.', 'Site', 'Opening Balance (₹)', 'Credit (+) (₹)', 'Debit (-) (₹)', 'Current Balance (₹)', 'Verified']],
    body: sitesData,
    theme: 'grid',
    headStyles: {
      fillColor: [20, 20, 20],
      textColor: [255, 255, 255],
      fontStyle: 'bold',
      fontSize: 8,
      halign: 'center',
    },
    styles: {
      fontSize: 7.5,
      cellPadding: 2,
    },
    columnStyles: {
      0: { cellWidth: 14, halign: 'center' },
      1: { cellWidth: 38, fontStyle: 'bold' },
      2: { cellWidth: 28, halign: 'right' },
      3: { cellWidth: 26, halign: 'right', textColor: [34, 139, 34] },
      4: { cellWidth: 26, halign: 'right', textColor: [178, 34, 34] },
      5: { cellWidth: 28, halign: 'right', fontStyle: 'bold' },
      6: { cellWidth: 22, halign: 'center', fontStyle: 'bold' },
    },
    didParseCell: (data) => {
      if (data.row.index === sitesData.length - 1) {
        data.cell.styles.fontStyle = 'bold';
        data.cell.styles.fillColor = [255, 243, 205];
      }
    },
  });

  const sitesFinalY = (doc as any).lastAutoTable.finalY + 4;
  doc.setFont('helvetica', 'italic');
  doc.setFontSize(7);
  doc.setTextColor(100, 100, 100);
  doc.text('ℹ On Verify, the balance will be updated in the Closing Balance.', pageWidth - 14, sitesFinalY, { align: 'right' });

  // Save PDF
  const cleanName = (customer.name || 'Party').replace(/[^a-zA-Z0-9]/g, '_');
  doc.save(`Showhouse_Ledger_${cleanName}.pdf`);
}

function formatDateShort(dateStr: string): string {
  try {
    const d = new Date(dateStr);
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    return `${d.getDate()}-${months[d.getMonth()]}-${String(d.getFullYear()).slice(-2)}`;
  } catch {
    return dateStr;
  }
}

