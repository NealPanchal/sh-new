/**
 * Production-Grade Quotation / Estimate PDF Generation for Showhouse
 * Matches the official Showhouse Delivery Challan & Selection PDF styling (A5, Typography, Dual-Branding & Signatures)
 * Specifically: No banking/payment details, no terms & conditions. Only material items and grand total (plus GST if applied).
 */
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { Quotation, BusinessProfile } from '@/types';
import { formatDateIndian, formatPhone, cleanChallanItemDescription } from '@/lib/utils';
import { SHOWHOUSE_EMBLEM_BASE64 } from '@/lib/logo-data';

function formatAmountNum(amount: number | null | undefined): string {
  if (amount == null || isNaN(Number(amount)) || Number(amount) === 0) return '0';
  return Number(amount).toLocaleString('en-IN', {
    maximumFractionDigits: 0,
  });
}

export function exportQuotationToPDF(quotation: Quotation, profile?: BusinessProfile | null) {
  // A5 Portrait Dimensions: 148mm × 210mm (Standard Showhouse Document Format)
  const doc = new jsPDF('p', 'mm', 'a5');
  const pageWidth = doc.internal.pageSize.getWidth(); // 148mm
  const pageHeight = doc.internal.pageSize.getHeight(); // 210mm
  const margin = 7;
  const contentWidth = pageWidth - margin * 2; // 134mm
  let y = margin;

  // Exact Brand Colors matching Challan PDF
  const blackColor: [number, number, number] = [20, 20, 20];
  const goldColor: [number, number, number] = [190, 142, 42]; // #BE8E2A Gold
  const blueColor: [number, number, number] = [43, 94, 167]; // #2B5EA7 Navy Blue

  // ----------------------------------------------------
  // 1. TOP HEADER SECTION
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

  // Right Header: Rounded Pill Box ("QUOTATION / ESTIMATE")
  const titleText = 'QUOTATION / ESTIMATE';
  const boxWidth = 46;
  const boxHeight = 6.2;
  const boxX = pageWidth - margin - boxWidth;
  const boxY = y;

  doc.setDrawColor(...blueColor);
  doc.setLineWidth(0.5);
  doc.setFillColor(252, 254, 255);
  doc.roundedRect(boxX, boxY, boxWidth, boxHeight, 1.2, 1.2, 'FD');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8.4);
  doc.setTextColor(...blueColor);
  doc.text(titleText, boxX + boxWidth / 2, boxY + 4.3, { align: 'center' });

  // Separate Document Metadata (Right side below pill)
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7.2);
  doc.setTextColor(...blackColor);

  let docInfoY = boxY + boxHeight + 4.0;
  doc.text(`QUOTATION NO : ${quotation.quotation_number}`, boxX, docInfoY);
  docInfoY += 3.2;

  const targetSiteText = (quotation.site_name || '').trim();
  if (targetSiteText) {
    doc.text(`TARGET SITE : ${targetSiteText.toUpperCase()}`, boxX, docInfoY);
    docInfoY += 3.2;
  }

  const quoteDateStr = formatDateIndian(quotation.quotation_date).toUpperCase();
  doc.text(`DATE : ${quoteDateStr}`, boxX, docInfoY);
  docInfoY += 3.2;

  const creator = quotation.prepared_by || 'VRUSHANK';
  doc.text(`PREPARED BY : ${creator.toUpperCase()}`, boxX, docInfoY);
  docInfoY += 3.8;

  // ----------------------------------------------------
  // 2. COMPANY DETAILS (RIGHT) & CUSTOMER DETAILS (LEFT)
  // ----------------------------------------------------
  const detailsY = Math.max(y + 20, docInfoY + 2.0);

  // Left: Customer Details
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7.6);
  doc.setTextColor(...blackColor);
  doc.text(`CLIENT NAME : ${(quotation.customer_name || 'CLIENT').toUpperCase()}`, margin, detailsY);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.0);
  doc.setTextColor(...blackColor);

  let leftDetailY = detailsY + 3.2;
  if (quotation.customer_phone) {
    doc.text(`Phone No: ${formatPhone(quotation.customer_phone)}`, margin, leftDetailY);
    leftDetailY += 2.9;
  }

  const rawAddr = quotation.site_name
    ? `Site: ${quotation.site_name}${quotation.delivery_address ? ` (${quotation.delivery_address})` : ''}`
    : (quotation.delivery_address || quotation.customer_address || 'THANE, MAHARASHTRA');
  const addrLines = doc.splitTextToSize(rawAddr.toUpperCase(), 64);
  doc.text(addrLines, margin, leftDetailY);
  leftDetailY += addrLines.length * 2.9;

  // Right: Showhouse Decor Studio Company Info
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7.6);
  doc.setTextColor(...blackColor);
  doc.text(profile?.legal_name || 'Showhouse Concept & Design LLP', boxX, detailsY);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.0);
  doc.setTextColor(...blackColor);

  const rightLines = [
    'LBS marg Nr. Makhmali Talao Thane',
    'Phone : 022 2538 7683',
    'Mobile : +91 93248 69306',
    'Email : forshowhouse@gmail.com',
    `GST : ${profile?.gstin || '27ACMF53838C1ZY'}`,
  ];

  let rightDetailY = detailsY + 3.2;
  rightLines.forEach((line) => {
    doc.text(line, boxX, rightDetailY);
    rightDetailY += 2.8;
  });

  y = Math.max(leftDetailY, rightDetailY) + 2.5;

  // ----------------------------------------------------
  // 3. TABLE ITEMS PREPARATION
  // ----------------------------------------------------
  const headers = ['S/N', 'DESCRIPTION', 'QTY', 'UNIT PRICE\nIN INR', 'TOTAL\nIN INR'];
  const colWidths = [8, 63, 20, 21, 22]; // Total = 134mm

  const items = quotation.items || [];
  const allTableRows: (string | number)[][] = items.map((it, idx) => {
    let desc = cleanChallanItemDescription(it.item_description, it.brand).toUpperCase();
    if (it.colour_finish) {
      const cleanFinish = cleanChallanItemDescription(it.colour_finish, it.brand).toUpperCase();
      if (cleanFinish && !desc.includes(cleanFinish)) {
        desc += ` - ${cleanFinish}`;
      }
    }
    if (it.size) desc += ` ( ${it.size} )`;

    const unitStr = it.unit === 'running ft' ? 'RFT' : (it.unit || 'Sheets').toUpperCase();
    const qtyStr = `${it.quantity} ${unitStr}`;

    const rateNum = Number(it.rate || 0);
    const amountNum = Number(it.amount || rateNum * Number(it.quantity || 0));

    return [
      idx + 1,
      desc,
      qtyStr,
      rateNum > 0 ? `₹ ${formatAmountNum(rateNum)}` : '—',
      `₹ ${formatAmountNum(amountNum)}`,
    ];
  });

  // Add Transportation Charges row if present
  if (quotation.transportation_charges && Number(quotation.transportation_charges) > 0) {
    allTableRows.push(['', 'DELIVERY / TRANSPORTATION CHARGES', '', '', `₹ ${formatAmountNum(Number(quotation.transportation_charges))}`]);
  }
  // Add Selection Charges row if present
  if (quotation.selection_charges && Number(quotation.selection_charges) > 0) {
    allTableRows.push(['', 'SELECTION & CONSULTATION CHARGES', '', '', `₹ ${formatAmountNum(Number(quotation.selection_charges))}`]);
  }

  // Pagination: 8 items max on Page 1 (same as Challan PDF)
  const MAX_ITEMS_PAGE1 = 8;
  const isMultiPage = allTableRows.length > MAX_ITEMS_PAGE1;
  const page1Rows = isMultiPage ? allTableRows.slice(0, MAX_ITEMS_PAGE1) : allTableRows;
  const page2Rows = isMultiPage ? allTableRows.slice(MAX_ITEMS_PAGE1) : [];

  // Faint Watermark Helper (identical to Challan & Selection PDF)
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

  // Dynamic row sizing matching Challan PDF
  const p1Count = page1Rows.length;
  let p1CellPadding = 2.2;
  let p1MinHeight = 8.8;
  let p1FontSize = 7.3;

  if (p1Count <= 3) {
    p1CellPadding = 2.5;
    p1MinHeight = 12.0;
    p1FontSize = 7.6;
  } else if (p1Count <= 5) {
    p1CellPadding = 2.4;
    p1MinHeight = 10.5;
    p1FontSize = 7.5;
  } else if (p1Count <= 8) {
    p1CellPadding = 2.2;
    p1MinHeight = 8.8;
    p1FontSize = 7.3;
  }

  // Render Page 1 Table
  autoTable(doc, {
    startY: y,
    head: [headers],
    body: page1Rows,
    theme: 'grid',
    tableWidth: contentWidth,
    headStyles: {
      fillColor: [248, 249, 250],
      textColor: blackColor,
      fontStyle: 'bold',
      fontSize: 7.0,
      cellPadding: 1.8,
      valign: 'middle',
      halign: 'center',
      lineColor: [40, 40, 40],
      lineWidth: 0.25,
    },
    bodyStyles: {
      fontSize: p1FontSize,
      textColor: blackColor,
      cellPadding: p1CellPadding,
      minCellHeight: p1MinHeight,
      lineColor: [180, 180, 180],
      lineWidth: 0.2,
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
    doc.text(`QUOTATION / ESTIMATE (Page 2 of 2 - Continued)`, pageWidth - margin, page2Y + 4, { align: 'right' });

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
        fillColor: [248, 249, 250],
        textColor: blackColor,
        fontStyle: 'bold',
        fontSize: 7.0,
        cellPadding: 1.8,
        valign: 'middle',
        halign: 'center',
        lineColor: [40, 40, 40],
        lineWidth: 0.25,
      },
      bodyStyles: {
        fontSize: 7.0,
        textColor: blackColor,
        cellPadding: 1.8,
        minCellHeight: 7.5,
        lineColor: [180, 180, 180],
        lineWidth: 0.2,
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
  }

  // ----------------------------------------------------
  // 4. TOTALS & SIGNATURES SECTION (ON FINAL PAGE)
  // Strictly: No banking details, no payment info, no QR code, no terms.
  // ONLY material summary and Grand Total (plus GST breakdown if applied).
  // ----------------------------------------------------
  const applyGst = Boolean(quotation.apply_gst);
  const transportCharges = Number(quotation.transportation_charges || 0);
  const selectionCharges = Number(quotation.selection_charges || 0);
  const itemsSubtotal = (quotation.items || []).reduce((sum, it) => sum + (Number(it.amount) || 0), 0);
  const subtotalAmount = Number(quotation.subtotal_amount || (itemsSubtotal + transportCharges + selectionCharges));
  const cgstAmount = quotation.cgst_amount ?? (applyGst ? Math.round(subtotalAmount * 0.09) : 0);
  const sgstAmount = quotation.sgst_amount ?? (applyGst ? Math.round(subtotalAmount * 0.09) : 0);
  const applyAdditional9 = Boolean(quotation.apply_additional_9);
  const additional9Amount = quotation.additional_9_amount ?? (applyAdditional9 ? Math.round(subtotalAmount * 0.09) : 0);
  const grandTotal = Number(quotation.total_amount || (subtotalAmount + cgstAmount + sgstAmount + additional9Amount));

  // Determine height needed for bottom section
  // Height: Totals rows (around 16-24mm) + Signatures block (around 22mm)
  const bottomSectionHeight = applyGst ? 46 : 38;
  const targetBottomY = pageHeight - bottomSectionHeight - margin - 2;

  if (y > targetBottomY) {
    doc.addPage('a5', 'p');
    y = margin + 4;
  } else {
    // Leave some breathing space after the table or anchor neatly
    y = Math.max(y + 4, targetBottomY - 5);
  }

  // Summary Table (Aligned cleanly on right)
  const totalsBoxWidth = 56;
  const totalsBoxX = pageWidth - margin - totalsBoxWidth;
  let totalsY = y;

  const renderTotalRow = (label: string, value: string, isGrandTotal = false) => {
    const rowH = isGrandTotal ? 5.5 : 4.0;
    if (isGrandTotal) {
      doc.setFillColor(235, 238, 242);
      doc.rect(totalsBoxX, totalsY, totalsBoxWidth, rowH, 'F');
    }
    doc.setDrawColor(40, 40, 40);
    doc.setLineWidth(0.2);
    doc.rect(totalsBoxX, totalsY, totalsBoxWidth, rowH, 'S');

    // Vertical line separating label and value
    const splitX = totalsBoxX + totalsBoxWidth - 25;
    doc.line(splitX, totalsY, splitX, totalsY + rowH);

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(isGrandTotal ? 7.4 : 6.4);
    doc.setTextColor(...blackColor);
    doc.text(label, totalsBoxX + 2, totalsY + (isGrandTotal ? 3.8 : 2.8));
    doc.text(value, totalsBoxX + totalsBoxWidth - 2, totalsY + (isGrandTotal ? 3.8 : 2.8), {
      align: 'right',
    });

    totalsY += rowH;
  };

  // Left side note opposite the totals table
  const leftNoteX = margin;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(6.8);
  doc.setTextColor(...blackColor);
  doc.text(`TOTAL ITEMS : ${items.length}`, leftNoteX, y + 4.0);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(6.2);
  doc.setTextColor(80, 80, 80);
  doc.text(`Total Qty: ${quotation.total_quantity} items`, leftNoteX, y + 7.5);
  if (quotation.prepared_by) {
    doc.text(`Prepared By: ${quotation.prepared_by.toUpperCase()}`, leftNoteX, y + 11.0);
  }

  // Render charges breakdown
  if (transportCharges > 0 || selectionCharges > 0) {
    renderTotalRow('ITEMS SUBTOTAL', `₹ ${formatAmountNum(itemsSubtotal)}`);
    if (transportCharges > 0) {
      renderTotalRow('DELIVERY CHARGES', `₹ ${formatAmountNum(transportCharges)}`);
    }
    if (selectionCharges > 0) {
      renderTotalRow('SELECTION CHARGES', `₹ ${formatAmountNum(selectionCharges)}`);
    }
  }

  // Render totals: If GST is applied, show Sub Total, CGST, SGST, Grand Total.
  // If NO GST, show Sub Total (if charges exist) + Grand Total
  if (applyGst) {
    renderTotalRow('SUB TOTAL', `₹ ${formatAmountNum(subtotalAmount)}`);
    renderTotalRow('CGST 9%', `₹ ${formatAmountNum(cgstAmount)}`);
    renderTotalRow('SGST 9%', `₹ ${formatAmountNum(sgstAmount)}`);
    if (applyAdditional9 && additional9Amount > 0) {
      renderTotalRow('ADDITIONAL 9%', `₹ ${formatAmountNum(additional9Amount)}`);
    }
    renderTotalRow('GRAND TOTAL', `₹ ${formatAmountNum(grandTotal)}`, true);
  } else {
    if (transportCharges > 0 || selectionCharges > 0) {
      renderTotalRow('SUB TOTAL', `₹ ${formatAmountNum(subtotalAmount)}`);
    }
    renderTotalRow('GRAND TOTAL', `₹ ${formatAmountNum(grandTotal)}`, true);
  }

  // ----------------------------------------------------
  // 5. FOOTER & SIGNATURES
  // ----------------------------------------------------
  const signY = pageHeight - margin - 12;

  // Thin separator line
  doc.setDrawColor(200, 200, 200);
  doc.setLineWidth(0.2);
  doc.line(margin, signY - 2, pageWidth - margin, signY - 2);

  // Center brand motto
  doc.setFont('times', 'italic');
  doc.setFontSize(8);
  doc.setTextColor(...blueColor);
  doc.text('" YOUR CONCEPTS, OUR DESIGNS "', pageWidth / 2, signY + 2.5, { align: 'center' });

  // Signature titles
  const sigLineY = signY + 7.5;
  doc.setDrawColor(180, 180, 180);
  doc.setLineWidth(0.2);
  doc.line(margin + 5, sigLineY, margin + 45, sigLineY);
  doc.line(pageWidth - margin - 45, sigLineY, pageWidth - margin - 5, sigLineY);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(6.4);
  doc.setTextColor(50, 50, 50);
  doc.text('CLIENT ACCEPTANCE SIGN', margin + 25, sigLineY + 3.8, { align: 'center' });
  doc.text('FOR SHOWHOUSE CONCEPTS & DESIGN LLP', pageWidth - margin - 25, sigLineY + 3.8, { align: 'center' });

  // Save the PDF
  const cleanNum = quotation.quotation_number.replace(/[^a-zA-Z0-9_-]/g, '_');
  const safeCustomerName = (quotation.customer_name || 'Customer').replace(/\s+/g, '_');
  doc.save(`Quotation_${cleanNum}_${safeCustomerName}.pdf`);
}
