/**
 * Production-Grade PDF generation for Showhouse Proforma Invoice / Delivery Challan
 * Matches the official Showhouse Concepts & Designs LLP invoice layout exactly
 */
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { Challan, ChallanItem, BusinessProfile } from '@/types';
import { formatDateIndian, formatPhone } from '@/lib/utils';
import { SHOWHOUSE_EMBLEM_BASE64 } from '@/lib/logo-data';

interface PDFOptions {
  challan: Challan;
  items: ChallanItem[];
  profile: BusinessProfile;
  documentType?: 'PROFORMA INVOICE' | 'DELIVERY CHALLAN';
}

function formatAmountNum(amount: number | null | undefined): string {
  if (amount == null || isNaN(Number(amount)) || Number(amount) === 0) return '—';
  return Number(amount).toLocaleString('en-IN', {
    maximumFractionDigits: 0,
  });
}

function formatRateNum(rate: number | null | undefined): string {
  if (rate == null || isNaN(Number(rate)) || Number(rate) === 0) return '—';
  return Number(rate).toLocaleString('en-IN', {
    maximumFractionDigits: 0,
  });
}

export function generateChallanPDF({
  challan,
  items,
  profile,
  documentType,
}: PDFOptions): jsPDF {
  const doc = new jsPDF('p', 'mm', 'a4');
  const pageWidth = doc.internal.pageSize.getWidth(); // 210mm
  const pageHeight = doc.internal.pageSize.getHeight(); // 297mm
  const margin = 14;
  const contentWidth = pageWidth - margin * 2; // 182mm
  let y = margin;

  // Resolve document type: 'DELIVERY CHALLAN' or 'PROFORMA INVOICE'
  const resolvedDocType: 'PROFORMA INVOICE' | 'DELIVERY CHALLAN' =
    documentType ||
    (challan.document_type === 'proforma_invoice' ? 'PROFORMA INVOICE' : 'DELIVERY CHALLAN');
  const isPI = resolvedDocType === 'PROFORMA INVOICE';

  // Colors
  const blackColor: [number, number, number] = [20, 20, 20];
  const goldColor: [number, number, number] = [190, 142, 42]; // #BE8E2A Gold
  const blueColor: [number, number, number] = [43, 94, 167]; // #2B5EA7 Navy Blue
  const grayColor: [number, number, number] = [80, 80, 80];

  // Helper for uppercase date
  const rawDate = new Date(challan.challan_date);
  const formattedDate = !isNaN(rawDate.getTime())
    ? rawDate.toLocaleDateString('en-GB', {
        day: '2-digit',
        month: 'long',
        year: 'numeric',
      }).toUpperCase()
    : challan.challan_date.toUpperCase();

  // ----------------------------------------------------
  // 1. TOP HEADER SECTION
  // ----------------------------------------------------

  // Left Brand: Gold Logo + SHOWHOUSE Decor Studio
  try {
    doc.addImage(SHOWHOUSE_EMBLEM_BASE64, 'PNG', margin, y - 2, 16, 16);
  } catch {
    doc.setDrawColor(...goldColor);
    doc.setLineWidth(1.2);
    doc.ellipse(margin + 8, y + 6, 7, 4);
  }

  // Logo text
  doc.setFont('times', 'bold');
  doc.setFontSize(18);
  doc.setTextColor(...goldColor);
  doc.text('SHOWHOUSE', margin + 18, y + 6);

  doc.setFont('times', 'normal');
  doc.setFontSize(9.5);
  doc.setTextColor(...goldColor);
  doc.text('Decor Studio', margin + 18, y + 10.5);

  // Right Header: Rounded Pill Box ("PROFORMA INVOICE" / "DELIVERY CHALLAN")
  const titleText = resolvedDocType;
  const boxWidth = isPI ? 52 : 56;
  const boxHeight = 7.5;
  const boxX = pageWidth - margin - boxWidth;
  const boxY = y;

  doc.setDrawColor(...blueColor);
  doc.setLineWidth(0.6);
  doc.setFillColor(252, 254, 255);
  doc.roundedRect(boxX, boxY, boxWidth, boxHeight, 1.5, 1.5, 'FD');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10.5);
  doc.setTextColor(...blueColor);
  doc.text(titleText, boxX + boxWidth / 2, boxY + 5.2, { align: 'center' });

  // Separate Document Number, Staff PO & Date (Right side below pill)
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8.2);
  doc.setTextColor(...blackColor);

  let docInfoY = y + 12.5;
  if (isPI) {
    const piNum = challan.pi_number || challan.challan_number.replace(/^SH\//, 'PI/');
    doc.text(`PI NO : ${piNum}`, boxX, docInfoY);
    docInfoY += 3.8;
    if (challan.reference_number) {
      doc.text(`PO NO : ${challan.reference_number}`, boxX, docInfoY);
      docInfoY += 3.8;
    }
  } else {
    doc.text(`CHALLAN NO : ${challan.challan_number}`, boxX, docInfoY);
    docInfoY += 3.8;
    if (challan.reference_number) {
      doc.text(`PO NO : ${challan.reference_number}`, boxX, docInfoY);
      docInfoY += 3.8;
    }
    if (challan.pi_number && challan.pi_number !== challan.challan_number) {
      doc.text(`PI REF : ${challan.pi_number}`, boxX, docInfoY);
      docInfoY += 3.8;
    }
  }
  doc.text(`DATE : ${formattedDate}`, boxX, docInfoY);
  docInfoY += 4.5;

  // ----------------------------------------------------
  // 2. COMPANY DETAILS (RIGHT) & CUSTOMER DETAILS (LEFT)
  // ----------------------------------------------------
  const detailsY = Math.max(y + 22, docInfoY);

  // Left: Customer Details
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8.5);
  doc.setTextColor(...blackColor);
  doc.text(`Kind Attn: ${(challan.customer_name || 'CLIENT').toUpperCase()}`, margin, detailsY);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(...blackColor);

  let leftDetailY = detailsY + 4;
  if (challan.customer_phone) {
    doc.text(`Phone No: ${formatPhone(challan.customer_phone)}`, margin, leftDetailY);
    leftDetailY += 3.8;
  }

  const rawAddr = challan.delivery_address || challan.customer_address || 'THANE, MAHARASHTRA';
  const addrLines = doc.splitTextToSize(`Address: ${rawAddr.toUpperCase()}`, 85);
  doc.text(addrLines, margin, leftDetailY);
  leftDetailY += addrLines.length * 3.8;

  if (challan.customer_gstin) {
    doc.text(`GSTIN: ${challan.customer_gstin}`, margin, leftDetailY);
    leftDetailY += 3.8;
  }

  // Right: Showhouse Decor Studio Company Info
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8.5);
  doc.setTextColor(...blackColor);
  doc.text(profile.legal_name || 'Showhouse Decor Studio', boxX, detailsY);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.8);
  doc.setTextColor(...blackColor);

  const rightLines = [
    'Vishram Baug, Lal Bahadur Shastri Rd',
    'Near Makhmali Talao, Thane',
    'Phone : 022 2538 7683',
    'Mobile : +91 93248 69306',
    'Email : forshowhouse@gmail.com',
    'Web : www.showhouse.co.in',
  ];

  let rightDetailY = detailsY + 4;
  rightLines.forEach((line) => {
    doc.text(line, boxX, rightDetailY);
    rightDetailY += 3.5;
  });

  y = Math.max(leftDetailY, rightDetailY) + 3;

  // ----------------------------------------------------
  // 3. ITEMS TABLE
  // ----------------------------------------------------
  const transportCharges = Number(challan.transportation_charges) || 0;
  const loadingCharges = Number(challan.loading_charges) || 0;
  const hasExtraCharges = transportCharges > 0 || loadingCharges > 0;
  const applyGst = Boolean(challan.apply_gst);
  const applyAdditional9 = Boolean(challan.apply_additional_9);

  const itemsSubtotal = items.reduce(
    (sum, it) =>
      sum +
      (Number(it.amount) || ((Number(it.rate) || 0) * (Number(it.quantity) || 0))),
    0
  );
  const taxableSubtotal = challan.subtotal_amount || (itemsSubtotal + transportCharges + loadingCharges);
  const cgstAmount = challan.cgst_amount ?? (applyGst && taxableSubtotal > 0 ? Math.round(taxableSubtotal * 0.09) : 0);
  const sgstAmount = challan.sgst_amount ?? (applyGst && taxableSubtotal > 0 ? Math.round(taxableSubtotal * 0.09) : 0);
  const additional9Amount = challan.additional_9_amount ?? (applyAdditional9 && taxableSubtotal > 0 ? Math.round(taxableSubtotal * 0.09) : 0);
  const grandTotal = challan.total_amount || (taxableSubtotal + cgstAmount + sgstAmount + additional9Amount);

  // Table Headers strictly matching Image 2
  const headers = ['S/N', 'DESCRIPTION', 'QTY', 'UNIT PRICE\nIN INR', 'TOTAL\nIN INR'];
  const colWidths = [12, 88, 24, 28, 30]; // Total = 182mm (exact contentWidth)

  const tableRows: (string | number)[][] = items.map((item, idx) => {
    let desc = (item.item_description || '').toUpperCase();
    if (item.brand) desc += ` [ ${item.brand.toUpperCase()} ]`;
    if (item.colour_finish) desc += ` - ${item.colour_finish.toUpperCase()}`;
    if (item.size) desc += ` ( ${item.size} )`;

    const qtyStr = `${item.quantity} ${item.unit === 'running ft' ? 'RFT' : (item.unit || 'PCS').toUpperCase()}`;
    const rate = Number(item.rate) || 0;
    const amount = Number(item.amount) || (rate > 0 ? rate * Number(item.quantity) : 0);

    return [
      idx + 1,
      desc,
      qtyStr,
      rate > 0 ? formatRateNum(rate) : '—',
      amount > 0 ? formatAmountNum(amount) : '—',
    ];
  });

  // Delivery Charges row matching Image 2 line
  if (transportCharges > 0) {
    tableRows.push(['', 'DELIVERY CHARGES', '', '', formatAmountNum(transportCharges)]);
  }

  if (loadingCharges > 0) {
    tableRows.push(['', 'LOADING / UNLOADING CHARGES', '', '', formatAmountNum(loadingCharges)]);
  }

  // Draw Faint Watermark before or in table
  try {
    (doc as any).saveGraphicsState();
    (doc as any).setGState(new (doc as any).GState({ opacity: 0.06 }));
    doc.addImage(SHOWHOUSE_EMBLEM_BASE64, 'PNG', pageWidth / 2 - 25, y + 15, 50, 50);
    (doc as any).restoreGraphicsState();
  } catch {
    doc.setFont('times', 'bold');
    doc.setFontSize(36);
    doc.setTextColor(245, 238, 215); // Very faint gold watermark
    doc.text('SHOWHOUSE', pageWidth / 2, y + 40, { align: 'center' });
    doc.setFontSize(14);
    doc.text('Decor Studio', pageWidth / 2, y + 48, { align: 'center' });
  }

  autoTable(doc, {
    startY: y,
    head: [headers],
    body: tableRows,
    theme: 'grid',
    tableWidth: contentWidth,
    headStyles: {
      fillColor: [255, 255, 255],
      textColor: blackColor,
      fontStyle: 'bold',
      fontSize: 8,
      cellPadding: 2,
      valign: 'middle',
      halign: 'center',
      lineColor: [0, 0, 0],
      lineWidth: 0.3,
    },
    bodyStyles: {
      fontSize: 8,
      textColor: blackColor,
      cellPadding: 2.2,
      lineColor: [0, 0, 0],
      lineWidth: 0.25,
      valign: 'middle',
    },
    columnStyles: {
      0: { halign: 'center', cellWidth: colWidths[0] },
      1: { halign: 'left', cellWidth: colWidths[1], fontStyle: 'bold' },
      2: { halign: 'center', cellWidth: colWidths[2] },
      3: { halign: 'right', cellWidth: colWidths[3] },
      4: { halign: 'right', cellWidth: colWidths[4], fontStyle: 'bold' },
    },
    margin: { left: margin, right: margin },
  });

  y = (doc as jsPDF & { lastAutoTable: { finalY: number } }).lastAutoTable.finalY;

  // ----------------------------------------------------
  // 4. BOTTOM LEDGER & BANKING INFORMATION
  // ----------------------------------------------------
  // If remaining page height is too small, add a new page
  if (y > pageHeight - 75) {
    doc.addPage();
    y = margin + 5;
  }

  const bottomHeight = 62;
  const leftColWidth = 114;
  const rightColWidth = contentWidth - leftColWidth; // 68mm

  // Outer border box around the bottom ledger
  doc.setDrawColor(0, 0, 0);
  doc.setLineWidth(0.3);
  doc.rect(margin, y, contentWidth, bottomHeight);

  // Vertical dividing line between left info and right totals
  doc.line(margin + leftColWidth, y, margin + leftColWidth, y + bottomHeight);

  // ---- LEFT COLUMN CONTENT ----
  let leftY = y + 4;
  const leftX = margin + 2.5;

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7.5);
  doc.setTextColor(...blackColor);
  doc.text('BANKING INFORMATION:', leftX, leftY);
  leftY += 3.5;

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7);
  doc.text('NAME OF THE BENEFICIARY - SHOW HOUSE CONCEPTS AND DESIGN LLP', leftX, leftY);
  leftY += 3.2;
  doc.text('ACCOUNT NUMBER: 50200003880041', leftX, leftY);
  leftY += 3.2;
  doc.text('BENEFICIARY BANK - HDFC BANK LTD, THANE', leftX, leftY);
  leftY += 3.2;
  doc.text('ADDRESS: DR. MOOSE RD, TALAO PALI, THANE (W)', leftX, leftY);
  leftY += 3.2;
  doc.text('RTGS: HDFC0000146', leftX, leftY);
  leftY += 4.5;

  // Divider
  doc.setDrawColor(200, 200, 200);
  doc.setLineWidth(0.2);
  doc.line(leftX, leftY - 1, margin + leftColWidth - 2, leftY - 1);

  // Prepared By / Contact
  const creator = challan.created_by || challan.prepared_by || 'NEAL PANCHAL';
  doc.text(`EMAIL : info@showhousedecor.com`, leftX, leftY + 2);
  doc.setFont('helvetica', 'bold');
  doc.text(`PREPARED BY : ${creator.toUpperCase()}`, leftX, leftY + 5.2);
  doc.setFont('helvetica', 'normal');
  doc.text(`MOBILE : +91 93248 69306 / +91 8169214522`, leftX, leftY + 8.4);
  leftY += 10.5;

  // Terms & Conditions
  doc.line(leftX, leftY - 1, margin + leftColWidth - 2, leftY - 1);
  doc.setFont('helvetica', 'bold');
  doc.text('TERMS :', leftX, leftY + 2);
  leftY += 5;

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(6.5);
  doc.text('VALIDITY: ONE (1) WEEK', leftX, leftY);
  leftY += 2.8;
  doc.text('WALL PAPER / LAMINATE RATES ARE INCLUDING INSTALLATION', leftX, leftY);
  leftY += 2.8;
  doc.text('DELIVERY: WITHIN (TWO) 2 DAYS AFTER CONFIRMATION OF ORDER', leftX, leftY);
  leftY += 2.8;
  doc.text('PAYMENT: 50% ADVANCE, REMAINING 50% ON THE TIME OF DELIVERY', leftX, leftY);

  // ---- RIGHT COLUMN CONTENT (TOTALS & SIGNATORY) ----
  const rightX = margin + leftColWidth;
  let totalsY = y;

  const renderTotalRow = (label: string, value: string, isGrandTotal = false) => {
    const rowH = isGrandTotal ? 6 : 5;
    if (isGrandTotal) {
      doc.setFillColor(220, 220, 220); // Shaded gray bar matching Image 2
      doc.rect(rightX, totalsY, rightColWidth, rowH, 'F');
    }
    doc.setDrawColor(0, 0, 0);
    doc.setLineWidth(0.25);
    doc.line(rightX, totalsY + rowH, rightX + rightColWidth, totalsY + rowH);
    doc.line(rightX + rightColWidth - 26, totalsY, rightX + rightColWidth - 26, totalsY + rowH);

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(isGrandTotal ? 8.5 : 7.5);
    doc.setTextColor(...blackColor);
    doc.text(label, rightX + 2, totalsY + (isGrandTotal ? 4.2 : 3.5));
    doc.text(value, rightX + rightColWidth - 2, totalsY + (isGrandTotal ? 4.2 : 3.5), {
      align: 'right',
    });

    totalsY += rowH;
  };

  renderTotalRow('SUB TOTAL', formatAmountNum(taxableSubtotal));

  if (applyGst) {
    renderTotalRow('CGST 9%', formatAmountNum(cgstAmount));
    renderTotalRow('SGST 9%', formatAmountNum(sgstAmount));
  }

  if (applyAdditional9) {
    renderTotalRow('ADDITIONAL 9%', formatAmountNum(additional9Amount));
  }

  renderTotalRow('GRAND TOTAL', formatAmountNum(grandTotal), true);

  // Authorized Signatory Box below Grand Total
  totalsY += 4;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7.5);
  doc.setTextColor(...blackColor);
  doc.text('For and on behalf of', rightX + rightColWidth / 2, totalsY, { align: 'center' });
  totalsY += 3.5;
  doc.text('Showhouse Concepts & Designs LLP', rightX + rightColWidth / 2, totalsY, { align: 'center' });

  // Signature line
  const sigY = y + bottomHeight - 4;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7.5);
  doc.text('Authorized Signatory', rightX + rightColWidth / 2, sigY, { align: 'center' });

  // ----------------------------------------------------
  // 5. BOTTOM TAGLINE (BLUE ITALIC BOLD)
  // ----------------------------------------------------
  const taglineY = y + bottomHeight + 6;
  doc.setFont('times', 'bolditalic');
  doc.setFontSize(11);
  doc.setTextColor(...blueColor);
  doc.text('" YOUR CONCEPTS, OUR DESIGNS "', pageWidth / 2, Math.min(taglineY, pageHeight - 8), {
    align: 'center',
  });

  return doc;
}

export function downloadChallanPDF(options: PDFOptions): void {
  const doc = generateChallanPDF(options);
  const resolvedType =
    options.documentType ||
    (options.challan.document_type === 'proforma_invoice' ? 'PROFORMA INVOICE' : 'DELIVERY CHALLAN');
  const isPI = resolvedType === 'PROFORMA INVOICE';
  const docNum = isPI
    ? (options.challan.pi_number || options.challan.challan_number.replace(/^SH\//, 'PI/'))
    : options.challan.challan_number;
  const safeNum = docNum.replace(/[\/\\]/g, '-');
  const filePrefix = isPI ? 'Showhouse_PI_' : 'Showhouse_Challan_';
  doc.save(`${filePrefix}${safeNum}.pdf`);
}

export function printChallanPDF(options: PDFOptions): void {
  const doc = generateChallanPDF(options);
  doc.autoPrint();
  const blobUrl = String(doc.output('bloburl'));

  const printWindow = window.open(blobUrl, '_blank');
  if (printWindow) {
    printWindow.onload = () => {
      try {
        printWindow.print();
      } catch {
        // Handled by autoPrint
      }
    };
  } else {
    // Fallback if popup blocked
    const iframe = document.createElement('iframe');
    iframe.style.position = 'fixed';
    iframe.style.right = '0';
    iframe.style.bottom = '0';
    iframe.style.width = '0';
    iframe.style.height = '0';
    iframe.style.border = '0';
    iframe.src = blobUrl;
    document.body.appendChild(iframe);
    iframe.onload = () => {
      iframe.contentWindow?.print();
    };
  }
}

export function getChallanPDFBlob(options: PDFOptions): Blob {
  const doc = generateChallanPDF(options);
  return doc.output('blob');
}
