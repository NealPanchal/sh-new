/**
 * Production-Grade PDF generation for Showhouse Proforma Invoice / Delivery Challan
 * Matches the official Showhouse Concepts & Designs LLP invoice layout exactly
 */
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { Challan, ChallanItem, BusinessProfile } from '@/types';
import { formatDateIndian, formatPhone } from '@/lib/utils';
import { SHOWHOUSE_EMBLEM_BASE64 } from '@/lib/logo-data';

export interface PDFOptions {
  challan: Challan;
  items: ChallanItem[];
  profile: BusinessProfile;
  documentType?: 'PROFORMA INVOICE' | 'DELIVERY CHALLAN';
  employeePhone?: string;
  hideRate?: boolean;
}

/**
 * Dynamically look up employee contact number from cache or profile
 */
function lookupStaffPhone(staffName?: string | null): string | undefined {
  if (!staffName || typeof window === 'undefined') return undefined;
  try {
    const raw = localStorage.getItem('showhouse_employee_cache');
    if (raw) {
      const list = JSON.parse(raw);
      if (Array.isArray(list)) {
        const clean = staffName.trim().toLowerCase();
        const found = list.find(
          (e: any) =>
            (e.name && e.name.trim().toLowerCase() === clean) ||
            (e.username && e.username.trim().toLowerCase() === clean)
        );
        if (found?.phone && found.phone.trim()) {
          return found.phone.trim();
        }
      }
    }
  } catch {}
  return undefined;
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
  employeePhone,
  hideRate = false,
}: PDFOptions): jsPDF {
  // A5 Portrait Dimensions: 148mm × 210mm
  const doc = new jsPDF('p', 'mm', 'a5');
  const pageWidth = doc.internal.pageSize.getWidth(); // 148mm
  const pageHeight = doc.internal.pageSize.getHeight(); // 210mm
  const margin = 7;
  const contentWidth = pageWidth - margin * 2; // 134mm
  let y = margin;

  // Resolve document type: 'DELIVERY CHALLAN' or 'PROFORMA INVOICE'
  const resolvedDocType: 'PROFORMA INVOICE' | 'DELIVERY CHALLAN' =
    documentType ||
    (challan.document_type === 'proforma_invoice' ? 'PROFORMA INVOICE' : 'DELIVERY CHALLAN');
  const isPI = !hideRate && resolvedDocType === 'PROFORMA INVOICE';

  // Colors
  const blackColor: [number, number, number] = [20, 20, 20];
  const goldColor: [number, number, number] = [190, 142, 42]; // #BE8E2A Gold
  const blueColor: [number, number, number] = [43, 94, 167]; // #2B5EA7 Navy Blue

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
  // 1. TOP HEADER SECTION (PAGE 1)
  // ----------------------------------------------------

  // Left Brand: Gold Logo + SHOWHOUSE Decor Studio
  try {
    doc.addImage(SHOWHOUSE_EMBLEM_BASE64, 'PNG', margin, y - 1, 13, 13);
  } catch {
    doc.setDrawColor(...goldColor);
    doc.setLineWidth(1.0);
    doc.ellipse(margin + 6, y + 5, 5, 3.5);
  }

  // Logo text
  doc.setFont('times', 'bold');
  doc.setFontSize(14.5);
  doc.setTextColor(...goldColor);
  doc.text('SHOWHOUSE', margin + 15, y + 5);

  doc.setFont('times', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(...goldColor);
  doc.text('Decor Studio', margin + 15, y + 8.8);

  // Right Header: Rounded Pill Box ("PROFORMA INVOICE" / "DELIVERY CHALLAN" / "DELIVERY SLIP")
  const titleText = hideRate ? 'DELIVERY SLIP' : resolvedDocType;
  const boxWidth = hideRate ? 40 : isPI ? 44 : 48;
  const boxHeight = 6.2;
  const boxX = pageWidth - margin - boxWidth;
  const boxY = y;

  doc.setDrawColor(...blueColor);
  doc.setLineWidth(0.5);
  doc.setFillColor(252, 254, 255);
  doc.roundedRect(boxX, boxY, boxWidth, boxHeight, 1.2, 1.2, 'FD');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8.8);
  doc.setTextColor(...blueColor);
  doc.text(titleText, boxX + boxWidth / 2, boxY + 4.3, { align: 'center' });

  // Separate Document Number, Staff PO & Date (Right side below pill)
  // Note: "PI REF" has been completely removed as requested
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7.2);
  doc.setTextColor(...blackColor);

  let docInfoY = y + 10;
  if (isPI) {
    const piNum = challan.pi_number || challan.challan_number.replace(/^SH\//, 'PI/');
    doc.text(`PI NO : ${piNum}`, boxX, docInfoY);
    docInfoY += 3.2;
    if (challan.reference_number) {
      doc.text(`PO NO : ${challan.reference_number}`, boxX, docInfoY);
      docInfoY += 3.2;
    }
  } else {
    doc.text(`CHALLAN NO : ${challan.challan_number}`, boxX, docInfoY);
    docInfoY += 3.2;
    if (challan.reference_number) {
      doc.text(`PO NO : ${challan.reference_number}`, boxX, docInfoY);
      docInfoY += 3.2;
    }
  }
  doc.text(`DATE : ${formattedDate}`, boxX, docInfoY);
  docInfoY += 3.8;

  // ----------------------------------------------------
  // 2. COMPANY DETAILS (RIGHT) & CUSTOMER DETAILS (LEFT)
  // ----------------------------------------------------
  const detailsY = Math.max(y + 19, docInfoY);

  // Left: Customer Details (Kind Attn replaced with CLIENT NAME)
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7.5);
  doc.setTextColor(190, 50, 50);
  doc.text('CLIENT', margin, detailsY);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7.8);
  doc.setTextColor(...blackColor);
  doc.text(`CLIENT NAME : ${(challan.customer_name || 'CLIENT').toUpperCase()}`, margin, detailsY + 3.5);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.2);
  doc.setTextColor(...blackColor);

  let leftDetailY = detailsY + 6.8;
  if (challan.customer_phone) {
    doc.text(`Phone No: ${formatPhone(challan.customer_phone)}`, margin, leftDetailY);
    leftDetailY += 3.2;
  }

  const rawAddr = challan.delivery_address || challan.customer_address || 'THANE, MAHARASHTRA';
  const addrLines = doc.splitTextToSize(`Address: ${rawAddr.toUpperCase()}`, 64);
  doc.text(addrLines, margin, leftDetailY);
  leftDetailY += addrLines.length * 3.2;

  if (challan.customer_gstin) {
    doc.text(`GSTIN: ${challan.customer_gstin}`, margin, leftDetailY);
    leftDetailY += 3.2;
  }

  // Right: Showhouse Decor Studio Company Info
  // Strictly: LBS marg Nr. Makhmali Talao Thane, Web removed, GST placed below email
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7.8);
  doc.setTextColor(...blackColor);
  doc.text(profile.legal_name || 'Showhouse Concept & Design LLP', boxX, detailsY);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.0);
  doc.setTextColor(...blackColor);

  const rightLines = [
    'LBS marg Nr. Makhmali Talao Thane',
    'Phone : 022 2538 7683',
    'Mobile : +91 93248 69306',
    'Email : forshowhouse@gmail.com',
    `GST : ${profile.gstin || '27ACMF53838C1ZY'}`,
  ];

  let rightDetailY = detailsY + 3.5;
  rightLines.forEach((line) => {
    doc.text(line, boxX, rightDetailY);
    rightDetailY += 3.0;
  });

  y = Math.max(leftDetailY, rightDetailY) + 2.5;

  // ----------------------------------------------------
  // 3. ITEMS PREPARATION & CALCULATIONS
  // ----------------------------------------------------
  const transportCharges = Number(challan.transportation_charges) || 0;
  const loadingCharges = Number(challan.loading_charges) || 0;
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

  // Table Headers & Column Widths fitted for 134mm contentWidth
  const headers = hideRate
    ? ['S/N', 'ITEM DESCRIPTION & BRAND', 'QUANTITY', 'UNIT']
    : ['S/N', 'DESCRIPTION', 'QTY', 'UNIT PRICE\nIN INR', 'TOTAL\nIN INR'];
  const colWidths = hideRate
    ? [8, 86, 20, 20] // Total = 134mm
    : [8, 64, 18, 21, 23]; // Total = 134mm

  const allTableRows: (string | number)[][] = items.map((item, idx) => {
    let desc = (item.item_description || '').toUpperCase();
    if (item.brand) desc += ` [ ${item.brand.toUpperCase()} ]`;
    if (item.colour_finish) desc += ` - ${item.colour_finish.toUpperCase()}`;
    if (item.size) desc += ` ( ${item.size} )`;

    const unitStr = item.unit === 'running ft' ? 'RFT' : (item.unit || 'Sheets').toUpperCase();

    if (hideRate) {
      return [
        idx + 1,
        desc,
        item.quantity,
        unitStr,
      ];
    }

    if (item.discount_amount && Number(item.discount_amount) > 0) {
      const discText = item.discount_type === 'percent' ? `${item.discount_value}%` : `₹${item.discount_amount}`;
      desc += ` [ Disc: -${discText} ]`;
    }

    const qtyStr = `${item.quantity} ${unitStr}`;
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

  // Extra charges rows
  if (!hideRate && transportCharges > 0) {
    allTableRows.push(['', 'DELIVERY CHARGES', '', '', formatAmountNum(transportCharges)]);
  }
  if (!hideRate && loadingCharges > 0) {
    allTableRows.push(['', 'LOADING / UNLOADING CHARGES', '', '', formatAmountNum(loadingCharges)]);
  }

  // ----------------------------------------------------
  // 4. PAGINATION: EXACTLY 8 ITEMS MAX ON PAGE 1
  // Extra items shift to Page 2 (Continued), with totals on final page
  // ----------------------------------------------------
  const MAX_ITEMS_PAGE1 = 8;
  const isMultiPage = allTableRows.length > MAX_ITEMS_PAGE1;
  const page1Rows = isMultiPage ? allTableRows.slice(0, MAX_ITEMS_PAGE1) : allTableRows;
  const page2Rows = isMultiPage ? allTableRows.slice(MAX_ITEMS_PAGE1) : [];

  // Faint Watermark Helper
  const drawWatermark = (watermarkY: number) => {
    try {
      (doc as any).saveGraphicsState();
      (doc as any).setGState(new (doc as any).GState({ opacity: 0.05 }));
      doc.addImage(SHOWHOUSE_EMBLEM_BASE64, 'PNG', pageWidth / 2 - 20, watermarkY, 40, 40);
      (doc as any).restoreGraphicsState();
    } catch {
      doc.setFont('times', 'bold');
      doc.setFontSize(26);
      doc.setTextColor(245, 238, 215);
      doc.text('SHOWHOUSE', pageWidth / 2, watermarkY + 25, { align: 'center' });
    }
  };

  drawWatermark(y + 10);

  // Render Page 1 Table (up to 8 items)
  autoTable(doc, {
    startY: y,
    head: [headers],
    body: page1Rows,
    theme: 'grid',
    tableWidth: contentWidth,
    headStyles: {
      fillColor: [255, 255, 255],
      textColor: blackColor,
      fontStyle: 'bold',
      fontSize: 6.8,
      cellPadding: 1.5,
      valign: 'middle',
      halign: 'center',
      lineColor: [0, 0, 0],
      lineWidth: 0.25,
    },
    bodyStyles: {
      fontSize: 6.8,
      textColor: blackColor,
      cellPadding: 1.6,
      lineColor: [0, 0, 0],
      lineWidth: 0.2,
      valign: 'middle',
    },
    columnStyles: hideRate
      ? {
          0: { halign: 'center', cellWidth: colWidths[0] },
          1: { halign: 'left', cellWidth: colWidths[1], fontStyle: 'bold' },
          2: { halign: 'center', cellWidth: colWidths[2], fontStyle: 'bold' },
          3: { halign: 'center', cellWidth: colWidths[3] },
        }
      : {
          0: { halign: 'center', cellWidth: colWidths[0] },
          1: { halign: 'left', cellWidth: colWidths[1], fontStyle: 'bold' },
          2: { halign: 'center', cellWidth: colWidths[2] },
          3: { halign: 'right', cellWidth: colWidths[3] },
          4: { halign: 'right', cellWidth: colWidths[4], fontStyle: 'bold' },
        },
    margin: { left: margin, right: margin },
  });

  y = (doc as jsPDF & { lastAutoTable: { finalY: number } }).lastAutoTable.finalY;

  // If there are more than 8 items, create Page 2 and continue items
  if (isMultiPage) {
    // Add continuation note at bottom of page 1
    doc.setFont('helvetica', 'italic');
    doc.setFontSize(7.2);
    doc.setTextColor(110, 110, 110);
    doc.text('(Continued on Page 2...)', pageWidth - margin, y + 4.5, { align: 'right' });

    // Page 2
    doc.addPage('a5', 'p');
    let page2Y = margin + 2;

    // Page 2 Mini Header
    doc.setFont('times', 'bold');
    doc.setFontSize(11);
    doc.setTextColor(...goldColor);
    doc.text('SHOWHOUSE DECOR STUDIO', margin, page2Y + 4);

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7.5);
    doc.setTextColor(...blackColor);
    const page2DocNo = isPI
      ? (challan.pi_number || challan.challan_number.replace(/^SH\//, 'PI/'))
      : challan.challan_number;
    doc.text(`${page2DocNo} (Page 2 of 2 - Continued)`, pageWidth - margin, page2Y + 4, { align: 'right' });

    page2Y += 7.5;
    drawWatermark(page2Y + 15);

    // Page 2 Table (remaining items)
    autoTable(doc, {
      startY: page2Y,
      head: [headers],
      body: page2Rows,
      theme: 'grid',
      tableWidth: contentWidth,
      headStyles: {
        fillColor: [255, 255, 255],
        textColor: blackColor,
        fontStyle: 'bold',
        fontSize: 6.8,
        cellPadding: 1.5,
        valign: 'middle',
        halign: 'center',
        lineColor: [0, 0, 0],
        lineWidth: 0.25,
      },
      bodyStyles: {
        fontSize: 6.8,
        textColor: blackColor,
        cellPadding: 1.6,
        lineColor: [0, 0, 0],
        lineWidth: 0.2,
        valign: 'middle',
      },
      columnStyles: hideRate
        ? {
            0: { halign: 'center', cellWidth: colWidths[0] },
            1: { halign: 'left', cellWidth: colWidths[1], fontStyle: 'bold' },
            2: { halign: 'center', cellWidth: colWidths[2], fontStyle: 'bold' },
            3: { halign: 'center', cellWidth: colWidths[3] },
          }
        : {
            0: { halign: 'center', cellWidth: colWidths[0] },
            1: { halign: 'left', cellWidth: colWidths[1], fontStyle: 'bold' },
            2: { halign: 'center', cellWidth: colWidths[2] },
            3: { halign: 'right', cellWidth: colWidths[3] },
            4: { halign: 'right', cellWidth: colWidths[4], fontStyle: 'bold' },
          },
      margin: { left: margin, right: margin },
    });

    y = (doc as jsPDF & { lastAutoTable: { finalY: number } }).lastAutoTable.finalY;
  }

  // ----------------------------------------------------
  // 5. BOTTOM LEDGER, BANKING & DUAL SIGNATURES (ON FINAL PAGE)
  // ----------------------------------------------------
  const bottomHeight = 54;
  const leftColWidth = 78;
  const rightColWidth = contentWidth - leftColWidth; // 56mm

  // If table ran very long on page, adjust y or add new page
  if (y > pageHeight - bottomHeight - 12) {
    doc.addPage('a5', 'p');
    y = margin + 4;
  } else {
    y = Math.max(y + 2.5, pageHeight - bottomHeight - margin - 8);
  }

  // Outer border box around the bottom section
  doc.setDrawColor(0, 0, 0);
  doc.setLineWidth(0.25);
  doc.rect(margin, y, contentWidth, bottomHeight);

  // Vertical dividing line between left info and right totals
  doc.line(margin + leftColWidth, y, margin + leftColWidth, y + bottomHeight);

  // ---- LEFT COLUMN CONTENT ----
  let leftY = y + 3;
  const leftX = margin + 2;

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(6.5);
  doc.setTextColor(...blackColor);
  doc.text('BANKING INFORMATION:', leftX, leftY);
  leftY += 2.8;

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(5.8);
  doc.text('BENEFICIARY - SHOW HOUSE CONCEPTS AND DESIGN LLP', leftX, leftY);
  leftY += 2.4;
  doc.text('A/C NO: 50200003880041 | HDFC BANK LTD, THANE', leftX, leftY);
  leftY += 2.4;
  doc.text('ADDRESS: DR. MOOSE RD, TALAO PALI, THANE (W) | RTGS: HDFC0000146', leftX, leftY);
  leftY += 3.2;

  // Divider
  doc.setDrawColor(210, 210, 210);
  doc.setLineWidth(0.15);
  doc.line(leftX, leftY - 0.8, margin + leftColWidth - 2, leftY - 0.8);

  // Prepared By / Contact
  const creator = challan.created_by || challan.prepared_by || 'VRUSHANK';
  doc.text(`EMAIL : info@showhousedecor.com`, leftX, leftY + 1.2);
  doc.setFont('helvetica', 'bold');
  doc.text(`PREPARED BY : ${creator.toUpperCase()}`, leftX, leftY + 3.8);
  doc.setFont('helvetica', 'normal');

  const staffPhone = employeePhone || lookupStaffPhone(creator);
  const mobileText =
    staffPhone && staffPhone.trim() && staffPhone !== '+91 93248 69306'
      ? `MOBILE : +91 93248 69306 / ${staffPhone.trim()}`
      : `MOBILE : +91 93248 69306`;
  doc.text(mobileText, leftX, leftY + 6.4);
  leftY += 8.2;

  // Terms & Conditions
  doc.line(leftX, leftY - 0.8, margin + leftColWidth - 2, leftY - 0.8);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(5.8);
  doc.text('TERMS : VALIDITY: 1 WEEK | WALLPAPER/LAMINATE RATES INCL. INSTALLATION', leftX, leftY + 1.4);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(5.4);
  doc.text('DELIVERY: WITHIN 2 DAYS OF CONFIRMATION | PAYMENT: 50% ADVANCE, 50% ON DELIVERY', leftX, leftY + 3.8);
  leftY += 5.5;

  // Left Signature: RECEIVER'S SIGNATURE (Distinct column)
  doc.line(leftX, leftY, margin + leftColWidth - 2, leftY);
  const receiverSigY = y + bottomHeight - 3.2;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(6.5);
  doc.setTextColor(...blackColor);
  doc.text("RECEIVER'S SIGNATURE", leftX + (leftColWidth - 4) / 2, receiverSigY - 3, { align: 'center' });
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(5.2);
  doc.setTextColor(90, 90, 90);
  doc.text('(Goods received in good condition)', leftX + (leftColWidth - 4) / 2, receiverSigY, { align: 'center' });

  // ---- RIGHT COLUMN CONTENT (TOTALS & AUTHORIZED SIGNATORY) ----
  const rightX = margin + leftColWidth;
  let totalsY = y;

  if (hideRate) {
    // Delivery Verification (No Prices)
    doc.setFillColor(240, 240, 240);
    doc.rect(rightX, totalsY, rightColWidth, 5, 'F');
    doc.setDrawColor(0, 0, 0);
    doc.setLineWidth(0.2);
    doc.line(rightX, totalsY + 5, rightX + rightColWidth, totalsY + 5);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(6.8);
    doc.setTextColor(...blackColor);
    doc.text('DELIVERY ACKNOWLEDGMENT', rightX + rightColWidth / 2, totalsY + 3.5, { align: 'center' });
    totalsY += 7.5;

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(6.5);
    doc.text(`TOTAL ITEMS : ${items.length}`, rightX + 3, totalsY);
    totalsY += 3.5;
    doc.text(`TOTAL QUANTITY : ${challan.total_quantity}`, rightX + 3, totalsY);
    totalsY += 4.5;

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(5.8);
    doc.text('[   ] Verified and Received', rightX + 3, totalsY);
    totalsY += 5;

    // Authorized Signatory
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(6.5);
    doc.text('For Showhouse Concepts & Designs LLP', rightX + rightColWidth / 2, totalsY + 6, { align: 'center' });
    doc.text('Authorized Signatory', rightX + rightColWidth / 2, y + bottomHeight - 3.2, { align: 'center' });
  } else {
    // Standard Totals Rows
    const renderTotalRow = (label: string, value: string, isGrandTotal = false) => {
      const rowH = isGrandTotal ? 5.2 : 4.2;
      if (isGrandTotal) {
        doc.setFillColor(225, 225, 225); // Shaded gray bar
        doc.rect(rightX, totalsY, rightColWidth, rowH, 'F');
      }
      doc.setDrawColor(0, 0, 0);
      doc.setLineWidth(0.2);
      doc.line(rightX, totalsY + rowH, rightX + rightColWidth, totalsY + rowH);
      doc.line(rightX + rightColWidth - 21, totalsY, rightX + rightColWidth - 21, totalsY + rowH);

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(isGrandTotal ? 7.2 : 6.4);
      doc.setTextColor(...blackColor);
      doc.text(label, rightX + 2, totalsY + (isGrandTotal ? 3.6 : 3.0));
      doc.text(value, rightX + rightColWidth - 1.5, totalsY + (isGrandTotal ? 3.6 : 3.0), {
        align: 'right',
      });

      totalsY += rowH;
    };

    renderTotalRow('SUB TOTAL', formatAmountNum(taxableSubtotal));

    if (challan.discount_amount && Number(challan.discount_amount) > 0) {
      const discLabel = challan.discount_type === 'percent' ? `DISCOUNT (${challan.discount_value}%)` : 'DISCOUNT';
      renderTotalRow(discLabel, `-${formatAmountNum(challan.discount_amount)}`);
    }

    if (applyGst) {
      renderTotalRow('CGST 9%', formatAmountNum(cgstAmount));
      renderTotalRow('SGST 9%', formatAmountNum(sgstAmount));
    }

    if (applyAdditional9) {
      renderTotalRow('ADDITIONAL 9%', formatAmountNum(additional9Amount));
    }

    renderTotalRow('GRAND TOTAL', formatAmountNum(grandTotal), true);

    // Authorized Signatory Box below Grand Total (Right Column)
    totalsY += 3.0;
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(6.4);
    doc.setTextColor(...blackColor);
    doc.text('For and on behalf of', rightX + rightColWidth / 2, totalsY, { align: 'center' });
    totalsY += 2.8;
    doc.text('Showhouse Concepts & Designs LLP', rightX + rightColWidth / 2, totalsY, { align: 'center' });

    // Signature line
    const authSigY = y + bottomHeight - 3.2;
    doc.setDrawColor(180, 180, 180);
    doc.setLineWidth(0.2);
    doc.line(rightX + 6, authSigY - 4.5, rightX + rightColWidth - 6, authSigY - 4.5);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(6.5);
    doc.text('Authorized Signatory', rightX + rightColWidth / 2, authSigY, { align: 'center' });
  }

  // ----------------------------------------------------
  // 6. BOTTOM TAGLINE (BLUE ITALIC BOLD)
  // ----------------------------------------------------
  const taglineY = y + bottomHeight + 4.5;
  doc.setFont('times', 'bolditalic');
  doc.setFontSize(9.5);
  doc.setTextColor(...blueColor);
  doc.text('" YOUR CONCEPTS, OUR DESIGNS "', pageWidth / 2, Math.min(taglineY, pageHeight - 3), {
    align: 'center',
  });

  // ----------------------------------------------------
  // 7. PAID RUBBER STAMP (IF PAID)
  // ----------------------------------------------------
  if (challan.payment_status === 'paid') {
    try {
      doc.saveGraphicsState();
      doc.setDrawColor(22, 163, 74);
      doc.setTextColor(22, 163, 74);
      doc.setLineWidth(0.5);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(10);
      doc.text('★ PAID ★', pageWidth - 20, 18, { angle: -6, align: 'center' });
      doc.setFontSize(5.2);
      doc.text('SHOWHOUSE VERIFIED', pageWidth - 20, 21, { angle: -6, align: 'center' });
      doc.restoreGraphicsState();
    } catch {}
  }

  return doc;
}

export function downloadChallanPDF(options: PDFOptions): void {
  const doc = generateChallanPDF(options);
  const resolvedType =
    options.documentType ||
    (options.challan.document_type === 'proforma_invoice' ? 'PROFORMA INVOICE' : 'DELIVERY CHALLAN');
  const isPI = !options.hideRate && resolvedType === 'PROFORMA INVOICE';
  const docNum = isPI
    ? (options.challan.pi_number || options.challan.challan_number.replace(/^SH\//, 'PI/'))
    : options.challan.challan_number;
  const safeNum = docNum.replace(/[\/\\]/g, '-');
  const filePrefix = options.hideRate
    ? 'Showhouse_Delivery_Slip_'
    : isPI
    ? 'Showhouse_PI_'
    : 'Showhouse_Challan_';
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
