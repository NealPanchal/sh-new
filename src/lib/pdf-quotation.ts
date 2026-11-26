/**
 * Production-Grade Quotation / Estimate PDF Generation for Showhouse
 * Matches the official Showhouse Delivery Challan, Proforma Invoice & Material Selection layout exactly
 * Optimized for standard A4 commercial printing (210mm × 297mm) with full A5 fallback.
 */
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { Quotation, BusinessProfile } from '@/types';
import { formatDateIndian, formatPhone, cleanChallanItemDescription, resolveSiteInchargeDetails } from '@/lib/utils';
import { SHOWHOUSE_EMBLEM_BASE64 } from '@/lib/logo-data';
import { SHOWHOUSE_PAYMENT_QR_BASE64 } from '@/lib/payment-qr';

import { lookupStaffPhone } from '@/lib/pdf';

function formatAmountNum(amount: number | null | undefined): string {
  if (amount == null || isNaN(Number(amount)) || Number(amount) === 0) return '0';
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

export function exportQuotationToPDF(
  quotation: Quotation,
  profile?: BusinessProfile | null,
  paperSize: 'a4' | 'a5' = 'a4'
) {
  // Paper Dimensions: Default A4 Portrait (210mm × 297mm), fallback A5 (148mm × 210mm)
  const isA4 = paperSize !== 'a5';
  const doc = new jsPDF('p', 'mm', isA4 ? 'a4' : 'a5');
  const pageWidth = doc.internal.pageSize.getWidth(); // 210mm on A4, 148mm on A5
  const pageHeight = doc.internal.pageSize.getHeight(); // 297mm on A4, 210mm on A5
  const margin = isA4 ? 10 : 7;
  const contentWidth = pageWidth - margin * 2; // 190mm on A4, 134mm on A5
  let y = margin;

  // Exact Brand Colors matching Delivery Challan PDF
  const blackColor: [number, number, number] = [20, 20, 20];
  const goldColor: [number, number, number] = [190, 142, 42]; // #BE8E2A Gold
  const blueColor: [number, number, number] = [43, 94, 167]; // #2B5EA7 Navy Blue

  // Helper for uppercase date
  const rawDate = new Date(quotation.quotation_date);
  const formattedDate = !isNaN(rawDate.getTime())
    ? rawDate.toLocaleDateString('en-GB', {
        day: '2-digit',
        month: 'long',
        year: 'numeric',
      }).toUpperCase()
    : (quotation.quotation_date ? quotation.quotation_date.toUpperCase() : formatDateIndian(new Date().toISOString()).toUpperCase());

  // ----------------------------------------------------
  // 1. TOP HEADER SECTION (PAGE 1)
  // ----------------------------------------------------

  // Left Brand: Gold Logo + SHOWHOUSE Decor Studio
  const logoSize = isA4 ? 16 : 13;
  try {
    doc.addImage(SHOWHOUSE_EMBLEM_BASE64, 'PNG', margin, y - 1, logoSize, logoSize);
  } catch {
    doc.setDrawColor(...goldColor);
    doc.setLineWidth(1.0);
    doc.ellipse(margin + logoSize / 2, y + logoSize / 2 - 1, logoSize / 2.5, logoSize / 3.5);
  }

  // Logo text
  doc.setFont('times', 'bold');
  doc.setFontSize(isA4 ? 17.5 : 14.5);
  doc.setTextColor(...goldColor);
  doc.text('SHOWHOUSE', margin + (isA4 ? 18 : 15), y + (isA4 ? 5.8 : 5.0));

  doc.setFont('times', 'normal');
  doc.setFontSize(isA4 ? 9.5 : 8.0);
  doc.setTextColor(...goldColor);
  doc.text('Decor Studio', margin + (isA4 ? 18 : 15), y + (isA4 ? 10.8 : 8.8));

  // Right Header: Rounded Pill Box ("QUOTATION / ESTIMATE")
  const titleText = 'QUOTATION / ESTIMATE';
  const boxWidth = isA4 ? 62 : 48;
  const boxHeight = isA4 ? 7.2 : 6.2;
  const boxX = pageWidth - margin - boxWidth;
  const headerPillY = y;

  doc.setDrawColor(...blueColor);
  doc.setLineWidth(0.5);
  doc.setFillColor(252, 254, 255);
  doc.roundedRect(boxX, headerPillY, boxWidth, boxHeight, 1.2, 1.2, 'FD');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(isA4 ? 9.5 : 8.4);
  doc.setTextColor(...blueColor);
  doc.text(titleText, boxX + boxWidth / 2, headerPillY + (isA4 ? 4.9 : 4.3), { align: 'center' });

  // Separate Document Metadata (Right side below pill)
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(isA4 ? 8.2 : 7.2);
  doc.setTextColor(...blackColor);

  let docInfoY = headerPillY + boxHeight + (isA4 ? 4.5 : 4.0);
  const docLineGap = isA4 ? 3.8 : 3.2;

  doc.text(`QUOTATION NO : ${quotation.quotation_number}`, boxX, docInfoY);
  docInfoY += docLineGap;

  const targetSiteText = (quotation.site_name || '').trim();
  if (targetSiteText) {
    doc.text(`TARGET SITE : ${targetSiteText.toUpperCase()}`, boxX, docInfoY);
    docInfoY += docLineGap;
  }

  doc.text(`DATE : ${formattedDate}`, boxX, docInfoY);
  docInfoY += docLineGap;

  const creator = quotation.prepared_by || quotation.created_by || 'ADMIN SH';
  doc.text(`PREPARED BY : ${creator.toUpperCase()}`, boxX, docInfoY);
  docInfoY += isA4 ? 4.2 : 3.8;

  // ----------------------------------------------------
  // 2. COMPANY DETAILS (RIGHT) & CUSTOMER DETAILS (LEFT)
  // ----------------------------------------------------
  const detailsY = Math.max(y + (isA4 ? 24 : 20), docInfoY + 2.5);

  // Left: Customer Details
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(isA4 ? 8.8 : 7.6);
  doc.setTextColor(...blackColor);
  doc.text(`CLIENT NAME : ${(quotation.customer_name || 'CLIENT').toUpperCase()}`, margin, detailsY);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(isA4 ? 8.0 : 7.0);
  doc.setTextColor(...blackColor);

  let leftDetailY = detailsY + (isA4 ? 3.6 : 3.2);
  const leftLineGap = isA4 ? 3.4 : 2.9;

  if (quotation.customer_phone) {
    doc.text(`Phone No: ${formatPhone(quotation.customer_phone)}`, margin, leftDetailY);
    leftDetailY += leftLineGap;
  }

  const rawAddr = quotation.site_name
    ? `Site: ${quotation.site_name}${quotation.delivery_address ? ` (${quotation.delivery_address})` : ''}`
    : (quotation.delivery_address || quotation.customer_address || 'THANE, MAHARASHTRA');
  const addrWrapWidth = isA4 ? 90 : 64;
  const addrLines = doc.splitTextToSize(rawAddr.toUpperCase(), addrWrapWidth);
  doc.text(addrLines, margin, leftDetailY);
  leftDetailY += addrLines.length * leftLineGap;

  let activeCustomer: any = undefined;
  if (typeof window !== 'undefined') {
    try {
      const { getState } = require('@/lib/demo-store');
      const st = getState();
      activeCustomer = (st?.customers || []).find((c: any) =>
        (c.id && quotation.customer_id && c.id === quotation.customer_id) ||
        (c.name && quotation.customer_name && c.name.toLowerCase() === quotation.customer_name.toLowerCase()) ||
        (c.business_name && quotation.customer_name && c.business_name.toLowerCase() === quotation.customer_name.toLowerCase())
      );
    } catch {}
  }

  const siteInchargeDetails = resolveSiteInchargeDetails(quotation, activeCustomer ? [activeCustomer] : undefined);
  if (siteInchargeDetails.inchargeName || siteInchargeDetails.inchargePhone) {
    const incText = `Site Incharge: ${siteInchargeDetails.inchargeName || ''}${siteInchargeDetails.inchargePhone ? ` (${siteInchargeDetails.inchargePhone})` : ''}`;
    doc.text(incText, margin, leftDetailY);
    leftDetailY += leftLineGap;
  }

  // Right: Showhouse Decor Studio Company Info
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(isA4 ? 8.8 : 7.6);
  doc.setTextColor(...blackColor);
  doc.text(profile?.legal_name || 'Showhouse Concept & Design LLP', boxX, detailsY);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(isA4 ? 8.0 : 7.0);
  doc.setTextColor(...blackColor);

  const rightLines = [
    'LBS marg Nr. Makhmali Talao Thane',
    'Phone : 022 2538 7683',
    'Mobile : +91 93248 69306',
    'Email : forshowhouse@gmail.com',
    `GST : ${profile?.gstin || '27ACMF53838C1ZY'}`,
  ];

  let rightDetailY = detailsY + (isA4 ? 3.6 : 3.2);
  rightLines.forEach((line) => {
    doc.text(line, boxX, rightDetailY);
    rightDetailY += leftLineGap;
  });

  y = Math.max(leftDetailY, rightDetailY) + (isA4 ? 3.5 : 2.5);

  // ----------------------------------------------------
  // 3. TABLE ITEMS PREPARATION
  // ----------------------------------------------------
  const headers = ['S/N', 'DESCRIPTION', 'QTY', 'UNIT PRICE\nIN INR', 'TOTAL\nIN INR'];
  const colWidths = isA4 ? [12, 102, 26, 25, 25] : [8, 63, 20, 21, 22];

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
      rateNum > 0 ? formatRateNum(rateNum) : '—',
      formatAmountNum(amountNum),
    ];
  });

  // Add Transportation Charges row if present
  if (quotation.transportation_charges && Number(quotation.transportation_charges) > 0) {
    allTableRows.push(['', 'DELIVERY / TRANSPORTATION CHARGES', '', '', formatAmountNum(Number(quotation.transportation_charges))]);
  }
  // Add Selection / Loading & Unloading Charges row if present
  if (quotation.selection_charges && Number(quotation.selection_charges) > 0) {
    allTableRows.push(['', 'LOADING & UNLOADING CHARGES', '', '', formatAmountNum(Number(quotation.selection_charges))]);
  }

  // Pagination: 8 items max on Page 1 (same as Delivery Challan PDF)
  const MAX_ITEMS_PAGE1 = isA4 ? 9 : 8;
  const isMultiPage = allTableRows.length > MAX_ITEMS_PAGE1;
  const page1Rows = isMultiPage ? allTableRows.slice(0, MAX_ITEMS_PAGE1) : allTableRows;
  const page2Rows = isMultiPage ? allTableRows.slice(MAX_ITEMS_PAGE1) : [];

  // Faint Watermark Helper (identical to Challan & Selection PDF)
  const drawWatermark = (watermarkY: number) => {
    const wmSize = isA4 ? 50 : 40;
    try {
      (doc as any).saveGraphicsState();
      (doc as any).setGState(new (doc as any).GState({ opacity: 0.04 }));
      doc.addImage(SHOWHOUSE_EMBLEM_BASE64, 'PNG', pageWidth / 2 - wmSize / 2, watermarkY, wmSize, wmSize);
      (doc as any).restoreGraphicsState();
    } catch {
      doc.setFont('times', 'bold');
      doc.setFontSize(isA4 ? 32 : 26);
      doc.setTextColor(245, 238, 215);
      doc.text('SHOWHOUSE', pageWidth / 2, watermarkY + 25, { align: 'center' });
    }
  };

  drawWatermark(y + 10);

  // Dynamic row sizing matching Challan PDF
  const p1Count = page1Rows.length;
  let p1CellPadding = isA4 ? 2.8 : 2.2;
  let p1MinHeight = isA4 ? 9.5 : 8.8;
  let p1FontSize = isA4 ? 8.5 : 7.3;

  if (p1Count <= 4) {
    p1CellPadding = isA4 ? 3.6 : 2.5;
    p1MinHeight = isA4 ? 12.0 : 12.0;
    p1FontSize = isA4 ? 9.0 : 7.6;
  } else if (p1Count <= 7) {
    p1CellPadding = isA4 ? 3.2 : 2.4;
    p1MinHeight = isA4 ? 10.5 : 10.5;
    p1FontSize = isA4 ? 8.8 : 7.5;
  }

  // Column styling
  const columnStyles = {
    0: { halign: 'center', cellWidth: colWidths[0] },
    1: { halign: 'left', cellWidth: colWidths[1], fontStyle: 'bold' },
    2: { halign: 'center', cellWidth: colWidths[2] },
    3: { halign: 'right', cellWidth: colWidths[3] },
    4: { halign: 'right', cellWidth: colWidths[4], fontStyle: 'bold' },
  };

  // Render Page 1 Table
  autoTable(doc, {
    startY: y,
    head: [headers],
    body: page1Rows,
    theme: 'grid',
    tableWidth: contentWidth,
    tableLineColor: [40, 40, 40],
    tableLineWidth: 0.3,
    styles: {
      lineColor: [60, 60, 60],
      lineWidth: 0.25,
    },
    headStyles: {
      fillColor: [248, 249, 250],
      textColor: blackColor,
      fontStyle: 'bold',
      fontSize: isA4 ? 8.2 : 7.0,
      cellPadding: isA4 ? 2.2 : 1.8,
      valign: 'middle',
      halign: 'center',
      lineColor: [40, 40, 40],
      lineWidth: 0.3,
    },
    bodyStyles: {
      fontSize: p1FontSize,
      textColor: blackColor,
      cellPadding: p1CellPadding,
      minCellHeight: p1MinHeight,
      lineColor: [60, 60, 60],
      lineWidth: 0.25,
      valign: 'middle',
    },
    columnStyles: columnStyles as any,
    margin: { left: margin, right: margin },
  });

  y = (doc as jsPDF & { lastAutoTable: { finalY: number } }).lastAutoTable.finalY;

  // ----------------------------------------------------
  // 4. MULTI-PAGE CONTINUATION IF NEEDED
  // ----------------------------------------------------
  if (isMultiPage) {
    doc.setFont('helvetica', 'italic');
    doc.setFontSize(isA4 ? 8.0 : 7.2);
    doc.setTextColor(110, 110, 110);
    doc.text('(Page 1 of 2 - Continued on Page 2)', pageWidth - margin, y + 4.5, { align: 'right' });

    doc.addPage(isA4 ? 'a4' : 'a5', 'p');
    let page2Y = margin + 2;

    doc.setFont('times', 'bold');
    doc.setFontSize(isA4 ? 13 : 11);
    doc.setTextColor(...goldColor);
    doc.text('SHOWHOUSE DECOR STUDIO', margin, page2Y + 4);

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(isA4 ? 8.5 : 7.5);
    doc.setTextColor(...blackColor);
    doc.text(`QUOTATION / ESTIMATE (Page 2 of 2 - Continued)`, pageWidth - margin, page2Y + 4, { align: 'right' });

    page2Y += 7.5;
    drawWatermark(page2Y + 15);

    autoTable(doc, {
      startY: page2Y,
      head: [headers],
      body: page2Rows,
      theme: 'grid',
      tableWidth: contentWidth,
      tableLineColor: [40, 40, 40],
      tableLineWidth: 0.3,
      styles: {
        lineColor: [60, 60, 60],
        lineWidth: 0.25,
      },
      headStyles: {
        fillColor: [248, 249, 250],
        textColor: blackColor,
        fontStyle: 'bold',
        fontSize: isA4 ? 8.2 : 7.0,
        cellPadding: isA4 ? 2.2 : 1.8,
        valign: 'middle',
        halign: 'center',
        lineColor: [40, 40, 40],
        lineWidth: 0.3,
      },
      bodyStyles: {
        fontSize: isA4 ? 8.0 : 7.0,
        textColor: blackColor,
        cellPadding: isA4 ? 2.2 : 1.8,
        minCellHeight: isA4 ? 8.5 : 7.5,
        lineColor: [60, 60, 60],
        lineWidth: 0.25,
        valign: 'middle',
      },
      columnStyles: columnStyles as any,
      margin: { left: margin, right: margin },
    });

    y = (doc as jsPDF & { lastAutoTable: { finalY: number } }).lastAutoTable.finalY;
  }

  // ----------------------------------------------------
  // 5. UNIFIED BOTTOM BOX & FINANCIAL TOTALS
  // Matches Delivery Challan, Proforma Invoice & Material Selection layout
  // ----------------------------------------------------
  const bottomHeight = isA4 ? 62 : 54;
  const leftColWidth = isA4 ? 112 : 78;
  const rightColWidth = contentWidth - leftColWidth;
  const targetBottomY = pageHeight - bottomHeight - margin - (isA4 ? 4 : 3);

  // If table ran too close to bottom, add final page
  if (y > targetBottomY) {
    doc.addPage(isA4 ? 'a4' : 'a5', 'p');
    y = margin + 4;
  }

  const boxY = Math.max(y + (isA4 ? 4 : 3), targetBottomY);

  // Outer border box around the bottom section
  doc.setDrawColor(40, 40, 40);
  doc.setLineWidth(0.25);
  doc.rect(margin, boxY, contentWidth, bottomHeight);

  // Vertical dividing line between left info and right totals
  doc.line(margin + leftColWidth, boxY, margin + leftColWidth, boxY + bottomHeight);

  // ---- LEFT COLUMN CONTENT ----
  const leftX = margin + (isA4 ? 3.0 : 2.0);

  // 1. Embedded Square Payment QR (Scannable UPI / PhonePe QR)
  const qrSize = isA4 ? 26 : 22;
  const qrX = margin + leftColWidth - qrSize - (isA4 ? 3.5 : 3.0);
  const qrY = boxY + 2.0;
  const termsDividerY = boxY + (isA4 ? 32.5 : 27.5);

  // Vertical separator between banking/prepared details and QR code
  doc.setDrawColor(215, 215, 215);
  doc.setLineWidth(0.2);
  doc.line(qrX - (isA4 ? 3.0 : 2.5), boxY, qrX - (isA4 ? 3.0 : 2.5), termsDividerY);

  try {
    doc.addImage(SHOWHOUSE_PAYMENT_QR_BASE64, 'JPEG', qrX, qrY, qrSize, qrSize);
    doc.setDrawColor(215, 215, 215);
    doc.setLineWidth(0.15);
    doc.rect(qrX, qrY, qrSize, qrSize);

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(isA4 ? 6.2 : 5.2);
    doc.setTextColor(...blackColor);
    doc.text('SCAN TO PAY', qrX + qrSize / 2, qrY + qrSize + (isA4 ? 2.6 : 2.4), { align: 'center' });
  } catch {}

  // 2. Streamlined Banking Details
  let bankY = boxY + (isA4 ? 3.6 : 3.0);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(isA4 ? 7.6 : 6.4);
  doc.setTextColor(...blackColor);
  doc.text('BANKING & PAYMENT DETAILS:', leftX, bankY);
  bankY += isA4 ? 3.8 : 3.3;

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(isA4 ? 7.2 : 6.0);
  doc.text('A/C NO : ', leftX, bankY);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(isA4 ? 7.6 : 6.4);
  doc.text('50200003880041', leftX + (isA4 ? 16.0 : 13.5), bankY);
  bankY += isA4 ? 3.8 : 3.2;

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(isA4 ? 7.2 : 6.0);
  doc.text('RTGS / IFSC : ', leftX, bankY);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(isA4 ? 7.5 : 6.2);
  doc.text('HDFC0000146', leftX + (isA4 ? 20.0 : 17.0), bankY);
  bankY += isA4 ? 3.6 : 3.1;

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(isA4 ? 6.8 : 5.6);
  doc.text('BANK : HDFC BANK LTD, THANE', leftX, bankY);

  // Line separating Banking Information and Prepared By
  const prepDividerY = boxY + (isA4 ? 17.5 : 14.8);
  doc.setDrawColor(215, 215, 215);
  doc.setLineWidth(0.2);
  doc.line(leftX, prepDividerY, qrX - (isA4 ? 3.0 : 2.5), prepDividerY);

  // Staff Prepared By & Mobile
  bankY = prepDividerY + (isA4 ? 3.2 : 2.8);
  const staffPhone = lookupStaffPhone(creator);
  const mobileText =
    staffPhone && staffPhone.trim() && staffPhone.trim() !== '+91 93248 69306'
      ? `${staffPhone.trim()} / +91 93248 69306`
      : `+91 93248 69306`;

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(isA4 ? 6.8 : 5.6);
  doc.text(`PREPARED BY : ${creator.toUpperCase()}`, leftX, bankY);
  bankY += isA4 ? 3.2 : 2.8;

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(isA4 ? 6.4 : 5.3);
  doc.text(`MOBILE : ${mobileText}`, leftX, bankY);
  bankY += isA4 ? 3.0 : 2.6;
  doc.text(`EMAIL : forshowhouse@gmail.com`, leftX, bankY);

  // 3. Fixed Terms & Conditions
  doc.setDrawColor(215, 215, 215);
  doc.setLineWidth(0.2);
  doc.line(leftX, termsDividerY, margin + leftColWidth - 2, termsDividerY);

  let termsY = termsDividerY + (isA4 ? 3.4 : 3.0);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(isA4 ? 6.8 : 5.7);
  doc.setTextColor(...blackColor);
  doc.text('TERMS & CONDITIONS :', leftX, termsY);
  termsY += isA4 ? 3.2 : 2.8;

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(isA4 ? 5.8 : 4.8);
  doc.setTextColor(50, 50, 50);
  doc.text('• Interest @ 21% will be charged if the payment of bill not made with 7 days', leftX, termsY);
  termsY += isA4 ? 2.8 : 2.4;
  doc.text('• 100% Advance Payment', leftX, termsY);
  termsY += isA4 ? 2.8 : 2.4;
  doc.text('• Goods once sold will not be taken back or exchanged', leftX, termsY);

  // 4. Client Acceptance Signature
  const termsEndDividerY = boxY + (isA4 ? 44.5 : 37.5);
  doc.setDrawColor(215, 215, 215);
  doc.setLineWidth(0.2);
  doc.line(leftX, termsEndDividerY, margin + leftColWidth - 2, termsEndDividerY);

  const sigLineY = boxY + (isA4 ? 54.0 : 46.5);
  doc.setDrawColor(180, 180, 180);
  doc.setLineWidth(0.2);
  doc.line(leftX + (isA4 ? 10 : 8), sigLineY, margin + leftColWidth - (isA4 ? 10 : 8), sigLineY);

  const receiverCenterX = leftX + (leftColWidth - (isA4 ? 5 : 4)) / 2;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(isA4 ? 7.2 : 6.2);
  doc.setTextColor(...blackColor);
  doc.text("CLIENT ACCEPTANCE SIGN", receiverCenterX, sigLineY + (isA4 ? 3.4 : 3.0), { align: 'center' });

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(isA4 ? 6.0 : 5.2);
  doc.setTextColor(80, 80, 80);
  doc.text('(Quotation Approved for Execution)', receiverCenterX, sigLineY + (isA4 ? 6.2 : 5.7), { align: 'center' });

  // ---- RIGHT COLUMN CONTENT (TOTALS & AUTHORIZED SIGNATORY) ----
  const rightX = margin + leftColWidth;
  let totalsY = boxY;

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

  const rightAmountColWidth = isA4 ? 26 : 21;
  const renderTotalRow = (label: string, value: string, isGrandTotal = false) => {
    const rowH = isGrandTotal ? (isA4 ? 5.8 : 5.0) : (isA4 ? 4.4 : 3.8);
    if (isGrandTotal) {
      doc.setFillColor(235, 238, 242);
      doc.rect(rightX, totalsY, rightColWidth, rowH, 'F');
    }
    doc.setDrawColor(40, 40, 40);
    doc.setLineWidth(0.2);
    doc.line(rightX, totalsY + rowH, rightX + rightColWidth, totalsY + rowH);
    doc.line(rightX + rightColWidth - rightAmountColWidth, totalsY, rightX + rightColWidth - rightAmountColWidth, totalsY + rowH);

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(isGrandTotal ? (isA4 ? 8.2 : 7.2) : (isA4 ? 7.2 : 6.3));
    doc.setTextColor(...blackColor);
    doc.text(label, rightX + 2.5, totalsY + (isGrandTotal ? (isA4 ? 4.0 : 3.5) : (isA4 ? 3.1 : 2.7)));
    doc.text(value, rightX + rightColWidth - 2.0, totalsY + (isGrandTotal ? (isA4 ? 4.0 : 3.5) : (isA4 ? 3.1 : 2.7)), {
      align: 'right',
    });

    totalsY += rowH;
  };

  // Render charges breakdown
  if (transportCharges > 0 || selectionCharges > 0) {
    renderTotalRow('ITEMS SUBTOTAL', formatAmountNum(itemsSubtotal));
    if (transportCharges > 0) {
      renderTotalRow('DELIVERY CHARGES', formatAmountNum(transportCharges));
    }
    if (selectionCharges > 0) {
      renderTotalRow('LOADING / UNLOADING', formatAmountNum(selectionCharges));
    }
  }

  // Render totals: If GST is applied, show Sub Total, CGST, SGST, Grand Total.
  // If NO GST, show Sub Total (if charges exist) + Grand Total
  if (applyGst) {
    renderTotalRow('SUB TOTAL', formatAmountNum(subtotalAmount));
    renderTotalRow('CGST 9%', formatAmountNum(cgstAmount));
    renderTotalRow('SGST 9%', formatAmountNum(sgstAmount));
    if (applyAdditional9 && additional9Amount > 0) {
      renderTotalRow('ADDITIONAL 9%', formatAmountNum(additional9Amount));
    }
    renderTotalRow('GRAND TOTAL', formatAmountNum(grandTotal), true);
  } else {
    if (transportCharges > 0 || selectionCharges > 0) {
      renderTotalRow('SUB TOTAL', formatAmountNum(subtotalAmount));
    }
    renderTotalRow('GRAND TOTAL', formatAmountNum(grandTotal), true);
  }

  // Authorized Signatory Box below Grand Total (Right Column)
  const authHeaderY = Math.max(totalsY + (isA4 ? 4.5 : 4.0), boxY + (isA4 ? 35.0 : 30.0));
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(isA4 ? 7.2 : 6.2);
  doc.setTextColor(...blackColor);
  doc.text('For and on behalf of', rightX + rightColWidth / 2, authHeaderY, { align: 'center' });
  doc.text('Showhouse Concepts & Designs LLP', rightX + rightColWidth / 2, authHeaderY + (isA4 ? 3.6 : 3.2), { align: 'center' });

  // Signature line aligned with left signature line
  doc.setDrawColor(180, 180, 180);
  doc.setLineWidth(0.2);
  doc.line(rightX + (isA4 ? 8 : 6), sigLineY, rightX + rightColWidth - (isA4 ? 8 : 6), sigLineY);

  // Text aligned with receiver signature
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(isA4 ? 7.2 : 6.2);
  doc.text('Authorized Signatory', rightX + rightColWidth / 2, sigLineY + (isA4 ? 3.4 : 3.0), { align: 'center' });

  // ----------------------------------------------------
  // 6. BRAND SLOGAN (BELOW THE BOX)
  // ----------------------------------------------------
  const taglineY = boxY + bottomHeight + (isA4 ? 3.8 : 3.0);
  doc.setFont('times', 'italic');
  doc.setFontSize(isA4 ? 9.2 : 7.8);
  doc.setTextColor(...blueColor);
  doc.text('" YOUR CONCEPTS, OUR DESIGNS "', pageWidth / 2, taglineY, { align: 'center' });

  // Save the PDF
  const cleanNum = quotation.quotation_number.replace(/[^a-zA-Z0-9_-]/g, '_');
  const safeCustomerName = (quotation.customer_name || 'Customer').replace(/\s+/g, '_');
  doc.save(`Quotation_${cleanNum}_${safeCustomerName}.pdf`);
  return doc;
}
