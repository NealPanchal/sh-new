/**
 * Production-Grade Material Selection & Rate Card PDF for Showhouse
 * Matches the official Showhouse Delivery Challan & Invoice styling exactly (A5, Typography, Dual-branding & Signatures)
 */
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { CustomerMaterialRate, BusinessProfile } from '@/types';
import { formatDateIndian, formatPhone } from '@/lib/utils';
import { SHOWHOUSE_EMBLEM_BASE64 } from '@/lib/logo-data';
import { SHOWHOUSE_PAYMENT_QR_BASE64 } from '@/lib/payment-qr';

export interface ExportRatesPDFOptions {
  customerName: string;
  contactPerson?: string | null;
  phone?: string | null;
  deliveryAddress?: string | null;
  siteName?: string | null;
  preparedBy?: string | null;
  profile?: BusinessProfile | null;
  selectedRates: CustomerMaterialRate[];
}

export function exportCustomerRatesToPDF(options: ExportRatesPDFOptions) {
  const {
    customerName,
    contactPerson,
    phone,
    deliveryAddress,
    siteName,
    preparedBy,
    profile,
    selectedRates,
  } = options;

  // A5 Portrait Dimensions: 148mm × 210mm (Exact match with Showhouse Delivery Challan PDF)
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
  // 1. TOP HEADER SECTION (Exact match to Challan PDF)
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

  // Right Header: Rounded Pill Box ("MATERIAL SELECTION")
  const titleText = 'MATERIAL SELECTION';
  const boxWidth = 48;
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

  // Separate Document Type, PO/Site & Date (Right side below pill)
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7.2);
  doc.setTextColor(...blackColor);

  let docInfoY = boxY + boxHeight + 4.0;
  doc.text('DOC TYPE : SELECTION RATE CARD', boxX, docInfoY);
  docInfoY += 3.2;

  const targetSiteText = (siteName || '').trim();
  if (targetSiteText) {
    doc.text(`TARGET SITE : ${targetSiteText.toUpperCase()}`, boxX, docInfoY);
    docInfoY += 3.2;
  }

  const todayStr = formatDateIndian(new Date().toISOString()).toUpperCase();
  doc.text(`DATE : ${todayStr}`, boxX, docInfoY);
  docInfoY += 3.8;

  // ----------------------------------------------------
  // 2. COMPANY DETAILS (RIGHT) & CUSTOMER DETAILS (LEFT)
  // ----------------------------------------------------
  const detailsY = Math.max(y + 20, docInfoY + 2.0);

  // Left: Customer Details
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7.6);
  doc.setTextColor(...blackColor);
  doc.text(`CLIENT NAME : ${(customerName || 'CLIENT').toUpperCase()}`, margin, detailsY);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.0);
  doc.setTextColor(...blackColor);

  let leftDetailY = detailsY + 3.2;
  if (contactPerson && contactPerson.trim() && contactPerson.toLowerCase() !== customerName.toLowerCase()) {
    doc.text(`Attn: ${contactPerson.trim().toUpperCase()}`, margin, leftDetailY);
    leftDetailY += 2.9;
  }

  if (phone) {
    doc.text(`Phone No: ${formatPhone(phone)}`, margin, leftDetailY);
    leftDetailY += 2.9;
  }

  const rawAddr = siteName ? `Site: ${siteName}` : (deliveryAddress || 'THANE, MAHARASHTRA');
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
  // Table Headers & Column Widths fitted for 134mm contentWidth
  const headers = ['S/N', 'ROOM / AREA', 'SELECTED MATERIAL SPECIFICATIONS', 'AGREED RATE'];
  const colWidths = [8, 34, 64, 28]; // Total = 134mm

  const allTableRows: (string | number)[][] = selectedRates.map((mr, idx) => {
    const room = (mr.room || 'General Area').toUpperCase();
    const desc = (mr.particulars?.trim() || 'Material Finish / Specification').toUpperCase();
    const rateFormatted = mr.rate > 0
      ? `₹ ${Number(mr.rate).toLocaleString('en-IN', { maximumFractionDigits: 0 })}`
      : '—';

    return [
      idx + 1,
      room,
      desc,
      rateFormatted,
    ];
  });

  // Pagination: 8 items max on Page 1 (same as Challan PDF)
  const MAX_ITEMS_PAGE1 = 8;
  const isMultiPage = allTableRows.length > MAX_ITEMS_PAGE1;
  const page1Rows = isMultiPage ? allTableRows.slice(0, MAX_ITEMS_PAGE1) : allTableRows;
  const page2Rows = isMultiPage ? allTableRows.slice(MAX_ITEMS_PAGE1) : [];

  // Faint Watermark Helper (identical to Challan PDF)
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
      2: { halign: 'left', cellWidth: colWidths[2] },
      3: { halign: 'right', cellWidth: colWidths[3], fontStyle: 'bold' },
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
    doc.text(`MATERIAL SELECTION (Page 2 of 2 - Continued)`, pageWidth - margin, page2Y + 4, { align: 'right' });

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
        2: { halign: 'left', cellWidth: colWidths[2] },
        3: { halign: 'right', cellWidth: colWidths[3], fontStyle: 'bold' },
      },
      margin: { left: margin, right: margin },
    });

    y = (doc as jsPDF & { lastAutoTable: { finalY: number } }).lastAutoTable.finalY;
  }

  // ----------------------------------------------------
  // 4. BOTTOM SECTION: BANKING, QR, TERMS & SIGNATURES (ON FINAL PAGE)
  // Exactly matching Challan PDF bottom box structure
  // ----------------------------------------------------
  const bottomHeight = 52;
  const leftColWidth = 78;
  const rightColWidth = contentWidth - leftColWidth; // 56mm

  // Position bottom section cleanly anchored to the bottom margin
  const targetBottomY = pageHeight - bottomHeight - margin - 2;
  if (y > targetBottomY) {
    doc.addPage('a5', 'p');
    y = margin + 4;
  } else {
    y = targetBottomY;
  }

  // Outer border box around the bottom section
  doc.setDrawColor(40, 40, 40);
  doc.setLineWidth(0.25);
  doc.rect(margin, y, contentWidth, bottomHeight);

  // Vertical dividing line between left info and right totals
  doc.line(margin + leftColWidth, y, margin + leftColWidth, y + bottomHeight);

  // ---- LEFT COLUMN CONTENT ----
  const leftX = margin + 2;

  // 1. Embedded Square Payment QR (Scannable UPI / PhonePe QR)
  const qrSize = 21;
  const qrX = margin + leftColWidth - qrSize - 2.5;
  const qrY = y + 2.0;
  const termsDividerY = y + 26.5;

  // Vertical separator between banking/prepared details and QR code
  doc.setDrawColor(215, 215, 215);
  doc.setLineWidth(0.2);
  doc.line(qrX - 2.5, y, qrX - 2.5, termsDividerY);

  try {
    doc.addImage(SHOWHOUSE_PAYMENT_QR_BASE64, 'JPEG', qrX, qrY, qrSize, qrSize);
    doc.setDrawColor(215, 215, 215);
    doc.setLineWidth(0.15);
    doc.rect(qrX, qrY, qrSize, qrSize);

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(5.0);
    doc.setTextColor(...blackColor);
    doc.text('SCAN TO PAY', qrX + qrSize / 2, qrY + qrSize + 2.2, { align: 'center' });
  } catch {}

  // 2. Streamlined Banking Details
  let bankY = y + 3.0;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(6.4);
  doc.setTextColor(...blackColor);
  doc.text('BANKING & PAYMENT DETAILS:', leftX, bankY);
  bankY += 3.2;

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(6.0);
  doc.text('A/C NO : ', leftX, bankY);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(6.4);
  doc.text('50200003880041', leftX + 13.5, bankY);
  bankY += 3.1;

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(6.0);
  doc.text('RTGS / IFSC : ', leftX, bankY);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(6.2);
  doc.text('HDFC0000146', leftX + 17, bankY);
  bankY += 3.0;

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(5.6);
  doc.text('BANK : HDFC BANK LTD, THANE', leftX, bankY);

  // Line separating Banking Information and Prepared By
  const prepDividerY = y + 14.5;
  doc.setDrawColor(215, 215, 215);
  doc.setLineWidth(0.2);
  doc.line(leftX, prepDividerY, qrX - 2.5, prepDividerY);

  // Staff Prepared By & Mobile
  bankY = prepDividerY + 2.8;
  const creator = preparedBy || 'VRUSHANK';
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(5.6);
  doc.text(`PREPARED BY : ${creator.toUpperCase()}`, leftX, bankY);
  bankY += 2.8;

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(5.3);
  doc.text(`MOBILE : +91 93248 69306`, leftX, bankY);
  bankY += 2.6;
  doc.text(`EMAIL : forshowhouse@gmail.com`, leftX, bankY);

  // 3. Terms & Conditions
  doc.setDrawColor(215, 215, 215);
  doc.setLineWidth(0.2);
  doc.line(leftX, termsDividerY, margin + leftColWidth - 2, termsDividerY);

  let termsY = termsDividerY + 2.8;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(5.6);
  doc.setTextColor(...blackColor);
  doc.text('TERMS & NOTES :', leftX, termsY);
  termsY += 2.8;

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(5.0);
  doc.setTextColor(50, 50, 50);
  doc.text('• Validity: 15 Days | Agreed rates locked for approved site scope.', leftX, termsY);
  termsY += 2.6;
  doc.text('• Quantities verified & billed during delivery challan dispatch. Rates excl. GST.', leftX, termsY);

  // 4. Client / Architect Approval Signature line
  const sigDividerY = y + 38.5;
  doc.setDrawColor(215, 215, 215);
  doc.setLineWidth(0.15);
  doc.line(leftX + 4, sigDividerY, margin + leftColWidth - 6, sigDividerY);

  const receiverCenterX = leftX + (leftColWidth - 4) / 2;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(6.2);
  doc.setTextColor(...blackColor);
  doc.text('CLIENT / ARCHITECT APPROVAL', receiverCenterX, y + 43.5, { align: 'center' });

  doc.setFont('helvetica', 'italic');
  doc.setFontSize(4.8);
  doc.setTextColor(110, 110, 110);
  doc.text('(Sign & Confirm - Selected finishes approved for site execution)', receiverCenterX, y + 47.0, { align: 'center' });

  // ---- RIGHT COLUMN CONTENT (SUMMARY & AUTHORIZED SIGNATORY) ----
  const rightX = margin + leftColWidth;
  let totalsY = y;

  // Header Box
  doc.setFillColor(242, 244, 246);
  doc.rect(rightX, totalsY, rightColWidth, 5.0, 'F');
  doc.setDrawColor(40, 40, 40);
  doc.setLineWidth(0.2);
  doc.line(rightX, totalsY + 5.0, rightX + rightColWidth, totalsY + 5.0);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(6.8);
  doc.setTextColor(...blackColor);
  doc.text('SELECTION SUMMARY', rightX + rightColWidth / 2, totalsY + 3.5, { align: 'center' });
  totalsY += 8.0;

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(6.4);
  doc.text(`TOTAL ITEMS : ${selectedRates.length}`, rightX + 3.5, totalsY);
  totalsY += 4.0;
  if (siteName) {
    doc.text(`TARGET SITE : ${siteName.toUpperCase()}`, rightX + 3.5, totalsY);
    totalsY += 4.0;
  }
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(5.8);
  doc.text('[   ] Verified & Approved for PO', rightX + 3.5, totalsY);

  // Signatory
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(6.2);
  doc.text('For Showhouse Concept & Design LLP', rightX + rightColWidth / 2, y + 29.5, { align: 'center' });

  doc.setDrawColor(180, 180, 180);
  doc.setLineWidth(0.2);
  doc.line(rightX + 6, sigDividerY, rightX + rightColWidth - 6, sigDividerY);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(6.4);
  doc.text('Authorised Signatory', rightX + rightColWidth / 2, y + 43.5, { align: 'center' });

  // Save the PDF
  const safeName = (customerName || 'Customer').replace(/[^a-z0-9]/gi, '_');
  doc.save(`${safeName}_Material_Selection.pdf`);
}
