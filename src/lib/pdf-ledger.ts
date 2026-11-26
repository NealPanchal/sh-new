import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { cleanTallyParticulars } from './utils';
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
  sites?: CustomerSite[];
  isAccountPaid?: boolean;
}

function formatTallyDate(dateStr?: string | Date | null): string {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return String(dateStr);
  const day = d.getDate();
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const month = months[d.getMonth()];
  const year = String(d.getFullYear()).slice(-2);
  return `${day}-${month}-${year}`;
}

function formatAmount(val: number | undefined | null): string {
  if (val === undefined || val === null || val === 0) return '';
  return Number(val).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
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
  } = options;

  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4',
  });

  const pageWidth = doc.internal.pageSize.getWidth();

  // 1. Company Masthead (Centered, pure black classic Tally typography)
  let y = 14;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.setTextColor(0, 0, 0);
  doc.text('Show House Concepts & Designs LLP-(From 1 Apr-2023)', pageWidth / 2, y, { align: 'center' });

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(0, 0, 0);
  y += 4;
  doc.text('VISHRAM BAUG', pageWidth / 2, y, { align: 'center' });
  y += 3.5;
  doc.text('LBS ROAD, NEAR MAKHMALI TALAO', pageWidth / 2, y, { align: 'center' });
  y += 3.5;
  doc.text('THANE (WEST)', pageWidth / 2, y, { align: 'center' });
  y += 3.5;
  doc.text('91-25387683/25387687', pageWidth / 2, y, { align: 'center' });
  y += 3.5;
  doc.text('Contact : 02225387687', pageWidth / 2, y, { align: 'center' });
  y += 3.5;
  doc.text('E-Mail : accounts@showhousedecor.com', pageWidth / 2, y, { align: 'center' });

  // 2. Customer Ledger Details (Centered)
  y += 6;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  const custTitle = customer.name || customer.business_name || 'Customer Ledger';
  doc.text(custTitle, pageWidth / 2, y, { align: 'center' });

  y += 4;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  doc.text('Ledger Account', pageWidth / 2, y, { align: 'center' });

  const addrLines = (customer.billing_address || customer.delivery_address || 'Thane')
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean);

  doc.setFontSize(8);
  addrLines.forEach((line) => {
    y += 3.5;
    doc.text(line, pageWidth / 2, y, { align: 'center' });
  });

  const sitesList = (options.sites && options.sites.length > 0) ? options.sites : (customer.sites || []);
  const inchargeTexts = sitesList
    .map((s) => {
      const inc = (s.contact_person || s.site_incharge || '').trim();
      const ph = (s.phone || s.contact_phone || '').trim();
      if (!inc && !ph) return null;
      return `${s.site_name ? `${s.site_name}: ` : ''}${inc}${ph ? ` (${ph})` : ''}`;
    })
    .filter(Boolean);

  if (inchargeTexts.length > 0) {
    y += 3.5;
    doc.setFontSize(7.5);
    doc.setFont('helvetica', 'bold');
    doc.text(`Site Incharge: ${inchargeTexts.join(' | ')}`, pageWidth / 2, y, { align: 'center' });
    doc.setFont('helvetica', 'normal');
  }

  // Date Range (Centered, e.g. 1-Feb-24 to 31-Mar-27 or 21-Nov-26 to 31-Mar-27)
  y += 5;
  const isRK =
    customer.id === 'cust_rk_sales' ||
    custTitle.toLowerCase().includes('r k sales') ||
    (customer.business_name && customer.business_name.toLowerCase().includes('r k sales'));

  const startD = isRK
    ? '1-Feb-24'
    : (customer.created_at ? formatTallyDate(customer.created_at) : (fromDate ? formatTallyDate(fromDate) : '1-Apr-24'));
  const endD = toDate ? formatTallyDate(toDate) : '31-Mar-27';

  doc.setFontSize(8.5);
  doc.text(`${startD} to ${endD}`, pageWidth / 2, y, { align: 'center' });

  // Opening Balance mention directly at top of ledger statement
  y += 4.5;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.text(
    `Opening Balance: ₹ ${formatAmount(Math.abs(openingBalance))} ${openingBalance >= 0 ? 'Dr' : 'Cr'}`,
    pageWidth / 2,
    y,
    { align: 'center' }
  );

  // Page 1 indicator on right side above table
  y += 5;
  doc.setFontSize(8);
  doc.text('Page 1', pageWidth - 14, y, { align: 'right' });
  y += 1.5;

  // 3. Build Tally Table Rows
  const tableData: any[] = [];

  if (isRK) {
    // Multi-period R K Sales format strictly matching physical printout
    const p1 = entries.filter((e) => e.date < '2024-04-01');
    const p2 = entries.filter((e) => e.date >= '2024-04-01');

    let sumDr1 = 0;
    let sumCr1 = 0;

    // Period 1 Entries (Feb 2024)
    p1.forEach((entry) => {
      const isDr = (Number(entry.debit) || 0) > 0;
      const dr = Number(entry.debit) || 0;
      const cr = Number(entry.credit) || 0;
      sumDr1 += dr;
      sumCr1 += cr;

      tableData.push([
        entry.date ? formatTallyDate(entry.date) : '',
        cleanTallyParticulars(entry.particulars, isDr),
        entry.payment_type || (isDr ? 'Sales GST' : 'Receipt'),
        entry.reference || '',
        dr > 0 ? formatAmount(dr) : '',
        cr > 0 ? formatAmount(cr) : '',
      ]);
    });

    const closing1 = sumDr1 - sumCr1; // 27,500.00
    const balanced1 = Math.max(sumDr1, sumCr1 + closing1);

    // Period 1 Subtotal
    const subtotalRow1: any = ['', '', '', '', formatAmount(sumDr1), formatAmount(sumCr1)];
    subtotalRow1._isSubtotal = true;
    tableData.push(subtotalRow1);

    // Period 1 Closing Balance
    const closingRow1: any = ['', 'By     Closing Balance', '', '', '', formatAmount(closing1)];
    tableData.push(closingRow1);

    // Period 1 Balanced Total
    const balancedRow1: any = ['', '', '', '', formatAmount(balanced1), formatAmount(balanced1)];
    balancedRow1._isBalancedTotal = true;
    tableData.push(balancedRow1);

    // Empty separator row
    const sepRow: any = ['', '', '', '', '', ''];
    sepRow._isSeparator = true;
    tableData.push(sepRow);

    // Period 2 Opening Balance (1-Apr-24)
    const opRow2: any = ['1-Apr-24', 'To Opening Balance', '', '', formatAmount(closing1), ''];
    tableData.push(opRow2);

    let sumDr2 = closing1;
    let sumCr2 = 0;

    // Period 2 Entries (Apr 2024 - Jan 2025)
    p2.forEach((entry) => {
      const isDr = (Number(entry.debit) || 0) > 0;
      const dr = Number(entry.debit) || 0;
      const cr = Number(entry.credit) || 0;
      sumDr2 += dr;
      sumCr2 += cr;

      tableData.push([
        entry.date ? formatTallyDate(entry.date) : '',
        cleanTallyParticulars(entry.particulars, isDr),
        entry.payment_type || (isDr ? 'Sales GST' : 'Receipt'),
        entry.reference || '',
        dr > 0 ? formatAmount(dr) : '',
        cr > 0 ? formatAmount(cr) : '',
      ]);
    });

    const closing2 = sumDr2 - sumCr2; // 14,500.00
    const balanced2 = Math.max(sumDr2, sumCr2 + closing2);

    // Period 2 Subtotal
    const subtotalRow2: any = ['', '', '', '', formatAmount(sumDr2), formatAmount(sumCr2)];
    subtotalRow2._isSubtotal = true;
    tableData.push(subtotalRow2);

    // Period 2 Closing Balance
    const closingRow2: any = ['', 'By     Closing Balance', '', '', '', formatAmount(closing2)];
    tableData.push(closingRow2);

    // Period 2 Balanced Total
    const balancedRow2: any = ['', '', '', '', formatAmount(balanced2), formatAmount(balanced2)];
    balancedRow2._isBalancedTotal = true;
    tableData.push(balancedRow2);
  } else {
    // Standard Customer Continuous Ledger View
    let totDr = 0;
    let totCr = 0;

    // Always render Opening Balance row at the head of the statement table before any challans
    const opDate = customer.created_at
      ? formatTallyDate(customer.created_at)
      : (fromDate ? formatTallyDate(fromDate) : '');
    const isDr = openingBalance >= 0;
    const opAmount = Math.abs(openingBalance);

    if (isDr) totDr += opAmount;
    else totCr += opAmount;

    tableData.push([
      opDate,
      isDr ? 'To Opening Balance' : 'By Opening Balance',
      '',
      '',
      isDr ? (opAmount > 0 ? formatAmount(opAmount) : '0.00') : '',
      !isDr ? (opAmount > 0 ? formatAmount(opAmount) : '0.00') : '',
    ]);

    entries.forEach((entry) => {
      const isDr = (Number(entry.debit) || 0) > 0;
      const dr = Number(entry.debit) || 0;
      const cr = Number(entry.credit) || 0;
      totDr += dr;
      totCr += cr;

      tableData.push([
        entry.date ? formatTallyDate(entry.date) : '',
        cleanTallyParticulars(entry.particulars, isDr),
        entry.payment_type || (isDr ? 'Sales GST' : 'Receipt'),
        entry.reference || '',
        dr > 0 ? formatAmount(dr) : '',
        cr > 0 ? formatAmount(cr) : '',
      ]);
    });

    const netBal = totDr - totCr;
    const isNetDebit = netBal >= 0;
    const closingAmt = Math.abs(netBal);
    const balancedTotal = Math.max(totDr, totCr + (isNetDebit ? closingAmt : 0));

    // Subtotal Row
    const subtotalRow: any = ['', '', '', '', formatAmount(totDr), formatAmount(totCr)];
    subtotalRow._isSubtotal = true;
    tableData.push(subtotalRow);

    // Closing Balance Row
    const closingLabel = isNetDebit ? 'By     Closing Balance' : 'To     Closing Balance';
    const closingRow: any = [
      '',
      closingLabel,
      '',
      '',
      !isNetDebit ? formatAmount(closingAmt) : '',
      isNetDebit ? formatAmount(closingAmt) : '',
    ];
    tableData.push(closingRow);

    // Balanced Total Row
    const balancedRow: any = ['', '', '', '', formatAmount(balancedTotal), formatAmount(balancedTotal)];
    balancedRow._isBalancedTotal = true;
    tableData.push(balancedRow);
  }

  // 4. Render Table with exact Tally borders & styling
  autoTable(doc, {
    startY: y,
    head: [['Date', 'Particulars', 'Vch Type', 'Vch No.', 'Debit', 'Credit']],
    body: tableData,
    theme: 'plain',
    margin: { left: 14, right: 14 },
    headStyles: {
      fillColor: false,
      textColor: [0, 0, 0],
      fontStyle: 'bold',
      fontSize: 8,
      cellPadding: { top: 1.5, bottom: 1.5, left: 1, right: 1 },
    },
    styles: {
      font: 'helvetica',
      fontSize: 7.5,
      textColor: [0, 0, 0],
      cellPadding: { top: 1.2, bottom: 1.2, left: 1, right: 1 },
      lineWidth: 0,
    },
    columnStyles: {
      0: { cellWidth: 22, halign: 'left' },
      1: { cellWidth: 'auto', halign: 'left' },
      2: { cellWidth: 24, halign: 'left' },
      3: { cellWidth: 24, halign: 'right' },
      4: { cellWidth: 26, halign: 'right' },
      5: { cellWidth: 26, halign: 'right' },
    },
    didDrawCell: (data) => {
      const { row, column, cell } = data;
      const raw = row.raw as any;

      // Header row: top line and bottom line across the entire row
      if (row.section === 'head') {
        doc.setDrawColor(0, 0, 0);
        doc.setLineWidth(0.25);
        doc.line(cell.x, cell.y, cell.x + cell.width, cell.y);
        doc.line(cell.x, cell.y + cell.height, cell.x + cell.width, cell.y + cell.height);
      }

      // Subtotal row: line above Debit and Credit cells
      if (raw?._isSubtotal && (column.index === 4 || column.index === 5)) {
        doc.setDrawColor(0, 0, 0);
        doc.setLineWidth(0.2);
        doc.line(cell.x, cell.y, cell.x + cell.width, cell.y);
      }

      // Balanced Total row: top line above and double underline below Debit and Credit cells
      if (raw?._isBalancedTotal && (column.index === 4 || column.index === 5)) {
        doc.setDrawColor(0, 0, 0);
        doc.setLineWidth(0.2);
        // Top line
        doc.line(cell.x, cell.y, cell.x + cell.width, cell.y);
        // Double bottom line
        doc.line(cell.x, cell.y + cell.height - 0.7, cell.x + cell.width, cell.y + cell.height - 0.7);
        doc.line(cell.x, cell.y + cell.height, cell.x + cell.width, cell.y + cell.height);
      }
    },
  });

  // Save PDF
  const cleanName = (customer.name || customer.business_name || 'Party').replace(/[^a-zA-Z0-9]/g, '_');
  doc.save(`Showhouse_Ledger_${cleanName}.pdf`);
}
