/**
 * PDF generation for Delivery Challans using jsPDF
 */
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { Challan, ChallanItem, BusinessProfile } from '@/types';
import { formatDateIndian, formatPhone } from '@/lib/utils';

interface PDFOptions {
  challan: Challan;
  items: ChallanItem[];
  profile: BusinessProfile;
}

/**
 * Format currency numbers safely for standard jsPDF fonts without Unicode encoding corruption
 * Avoids raw unicode Rupee symbols (₹) which render as broken superscript '¹' in standard Helvetica
 */
function formatPdfNum(amount: number | null | undefined): string {
  if (amount == null || isNaN(Number(amount))) return '—';
  return Number(amount).toLocaleString('en-IN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

export function generateChallanPDF({ challan, items, profile }: PDFOptions): jsPDF {
  const doc = new jsPDF('p', 'mm', 'a4');
  const pageWidth = doc.internal.pageSize.getWidth(); // 210mm
  const pageHeight = doc.internal.pageSize.getHeight(); // 297mm
  const margin = 15;
  const contentWidth = pageWidth - margin * 2; // 180mm
  let y = margin;

  // Colors
  const darkColor: [number, number, number] = [33, 33, 33];
  const grayColor: [number, number, number] = [100, 100, 100];
  const lightGrayColor: [number, number, number] = [190, 190, 190];
  const accentColor: [number, number, number] = [214, 120, 41]; // Orange accent

  // ---- HEADER: Business Name ----
  doc.setFontSize(22);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...darkColor);
  doc.text(profile.business_name || 'SHOWHOUSE', margin, y + 8);
  y += 12;

  // Business details
  doc.setFontSize(8.5);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(...grayColor);

  const addressLines = (profile.address || '').split('\n');
  addressLines.forEach((line) => {
    if (line.trim()) {
      doc.text(line.trim(), margin, y + 4);
      y += 3.5;
    }
  });

  if (profile.phone) {
    doc.text(`Phone: ${formatPhone(profile.phone)}`, margin, y + 4);
    y += 3.5;
  }
  if (profile.email) {
    doc.text(`Email: ${profile.email}`, margin, y + 4);
    y += 3.5;
  }
  if (profile.gstin) {
    doc.text(`GSTIN: ${profile.gstin}`, margin, y + 4);
    y += 3.5;
  }

  y += 4;

  // ---- TITLE: DELIVERY CHALLAN ----
  doc.setDrawColor(...accentColor);
  doc.setLineWidth(0.8);
  doc.line(margin, y, pageWidth - margin, y);
  y += 6;

  doc.setFontSize(13);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...darkColor);
  doc.text('DELIVERY CHALLAN', pageWidth / 2, y, { align: 'center' });
  y += 7;

  doc.setDrawColor(...lightGrayColor);
  doc.setLineWidth(0.3);
  doc.line(margin, y, pageWidth - margin, y);
  y += 6;

  // ---- CHALLAN INFO + CUSTOMER INFO ----
  const leftCol = margin;
  const rightCol = pageWidth / 2 + 5;
  const colMaxTextWidth = pageWidth - margin - rightCol;

  // Left side: Challan details
  doc.setFontSize(8.5);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...darkColor);
  doc.text('Challan No:', leftCol, y);
  doc.setFont('helvetica', 'normal');
  doc.text(challan.challan_number, leftCol + 26, y);

  doc.setFont('helvetica', 'bold');
  doc.text('Date:', leftCol, y + 5);
  doc.setFont('helvetica', 'normal');
  doc.text(formatDateIndian(challan.challan_date), leftCol + 26, y + 5);

  if (challan.reference_number) {
    doc.setFont('helvetica', 'bold');
    doc.text('Ref/Order No:', leftCol, y + 10);
    doc.setFont('helvetica', 'normal');
    doc.text(challan.reference_number, leftCol + 26, y + 10);
  }

  // Right side: Customer details (safe text wrapping so nothing overflows right edge)
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...darkColor);
  doc.text('Customer:', rightCol, y);

  const customerNameLines = doc.splitTextToSize(challan.customer_name || '—', colMaxTextWidth - 20);
  doc.text(customerNameLines, rightCol + 20, y);

  let rightY = y + (customerNameLines.length * 4);

  doc.setFont('helvetica', 'normal');
  doc.setTextColor(...grayColor);

  if (challan.customer_phone) {
    doc.text(`Ph: ${formatPhone(challan.customer_phone)}`, rightCol, rightY);
    rightY += 4;
  }
  if (challan.customer_gstin) {
    doc.text(`GSTIN: ${challan.customer_gstin}`, rightCol, rightY);
    rightY += 4;
  }

  const customerAddrRaw = (challan.delivery_address || challan.customer_address || '').split('\n');
  customerAddrRaw.forEach((line) => {
    if (line.trim()) {
      const wrapped = doc.splitTextToSize(line.trim(), colMaxTextWidth);
      doc.text(wrapped, rightCol, rightY);
      rightY += wrapped.length * 3.5;
    }
  });

  const leftY = y + (challan.reference_number ? 16 : 12);
  y = Math.max(leftY, rightY) + 4;

  // ---- ITEMS TABLE ----
  const transportCharges = Number(challan.transportation_charges) || 0;
  const loadingCharges = Number(challan.loading_charges) || 0;
  const hasExtraCharges = transportCharges > 0 || loadingCharges > 0;
  const applyGst = Boolean(challan.apply_gst);

  const hasRates = items.some((i) => (i.rate && Number(i.rate) > 0) || (i.amount && Number(i.amount) > 0));
  const hasAmounts =
    hasRates ||
    Boolean(challan.total_amount && challan.total_amount > 0) ||
    hasExtraCharges ||
    applyGst;

  // Explicit Column Headers & Widths (Total strictly equals contentWidth = 180mm)
  const headers: string[] = ['Sr. No.', 'Item Description', 'Unit', 'Qty'];

  const srWidth = 14;
  const unitWidth = 16;
  const qtyWidth = 16;
  const rateWidth = hasRates ? 24 : 0;
  const amountWidth = hasAmounts ? 28 : 0;
  const descWidth = contentWidth - (srWidth + unitWidth + qtyWidth + rateWidth + amountWidth);

  const colWidths: number[] = [srWidth, descWidth, unitWidth, qtyWidth];

  if (hasRates) {
    headers.push('Rate (Rs.)');
    colWidths.push(rateWidth);
  }
  if (hasAmounts) {
    headers.push('Amount (Rs.)');
    colWidths.push(amountWidth);
  }

  const itemsSubtotal = items.reduce(
    (sum, it) =>
      sum +
      (Number(it.amount) || ((Number(it.rate) || 0) * (Number(it.quantity) || 0))),
    0
  );
  const taxableSubtotal = challan.subtotal_amount || (itemsSubtotal + transportCharges + loadingCharges);
  const cgstAmount = challan.cgst_amount ?? (applyGst && taxableSubtotal > 0 ? Math.round(taxableSubtotal * 0.09 * 100) / 100 : 0);
  const sgstAmount = challan.sgst_amount ?? (applyGst && taxableSubtotal > 0 ? Math.round(taxableSubtotal * 0.09 * 100) / 100 : 0);

  const tableData: (string | number)[][] = items.map((item, idx) => {
    let desc = item.item_description;
    if (item.brand) desc += ` (${item.brand})`;
    if (item.colour_finish) desc += ` - ${item.colour_finish}`;
    if (item.size) desc += ` [${item.size}]`;

    const lineRate = item.rate ? Number(item.rate) : null;
    const lineAmount = item.amount ? Number(item.amount) : (lineRate ? lineRate * item.quantity : null);

    const row: (string | number)[] = [
      idx + 1,
      desc,
      item.unit || 'sheets',
      item.quantity,
    ];

    if (hasRates) {
      row.push(lineRate ? formatPdfNum(lineRate) : '—');
    }
    if (hasAmounts) {
      row.push(lineAmount ? formatPdfNum(lineAmount) : '—');
    }

    return row;
  });

  // Additional Charges Rows in PDF table
  if (transportCharges > 0) {
    const row: (string | number)[] = ['•', 'Transportation / Cartage Charges', '—', '—'];
    if (hasRates) row.push('—');
    if (hasAmounts) row.push(formatPdfNum(transportCharges));
    tableData.push(row);
  }

  if (loadingCharges > 0) {
    const row: (string | number)[] = ['•', 'Loading / Unloading Charges', '—', '—'];
    if (hasRates) row.push('—');
    if (hasAmounts) row.push(formatPdfNum(loadingCharges));
    tableData.push(row);
  }

  if (applyGst) {
    if (hasExtraCharges) {
      const subRow: (string | number)[] = ['•', 'Taxable Subtotal', '—', '—'];
      if (hasRates) subRow.push('—');
      if (hasAmounts) subRow.push(formatPdfNum(taxableSubtotal));
      tableData.push(subRow);
    }

    const cgstRow: (string | number)[] = ['•', 'CGST (9%)', '—', '9%'];
    if (hasRates) cgstRow.push('—');
    if (hasAmounts) cgstRow.push(formatPdfNum(cgstAmount));
    tableData.push(cgstRow);

    const sgstRow: (string | number)[] = ['•', 'SGST (9%)', '—', '9%'];
    if (hasRates) sgstRow.push('—');
    if (hasAmounts) sgstRow.push(formatPdfNum(sgstAmount));
    tableData.push(sgstRow);
  }

  const rateColIdx = headers.indexOf('Rate (Rs.)');
  const amountColIdx = headers.indexOf('Amount (Rs.)');

  autoTable(doc, {
    startY: y,
    head: [headers],
    body: tableData as (string | number)[][],
    theme: 'grid',
    tableWidth: contentWidth,
    headStyles: {
      fillColor: [248, 248, 248] as [number, number, number],
      textColor: darkColor,
      fontStyle: 'bold',
      fontSize: 8.5,
      cellPadding: 2.2,
      valign: 'middle',
      lineColor: [205, 205, 205] as [number, number, number],
      lineWidth: 0.25,
    },
    bodyStyles: {
      fontSize: 8.5,
      textColor: darkColor,
      cellPadding: 2.5,
      valign: 'middle',
      lineColor: [220, 220, 220] as [number, number, number],
      lineWidth: 0.2,
    },
    alternateRowStyles: {
      fillColor: [253, 253, 253] as [number, number, number],
    },
    columnStyles: {
      0: { halign: 'center', cellWidth: colWidths[0] },
      1: { halign: 'left', cellWidth: colWidths[1] },
      2: { halign: 'center', cellWidth: colWidths[2] },
      3: { halign: 'right', cellWidth: colWidths[3] },
      ...(rateColIdx !== -1 ? { [rateColIdx]: { halign: 'right', cellWidth: colWidths[rateColIdx] } } : {}),
      ...(amountColIdx !== -1 ? { [amountColIdx]: { halign: 'right', cellWidth: colWidths[amountColIdx] } } : {}),
    },
    margin: { left: margin, right: margin },
  });

  y = (doc as jsPDF & { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 4;

  // Check if we need a new page for totals, notes & signature
  if (y > pageHeight - 65) {
    doc.addPage();
    y = margin + 10;
  }

  // ---- TOTAL SUMMARY BOX ----
  // Clean bordered summary box that exactly aligns with the table margins (x: 15mm to 195mm)
  doc.setFillColor(250, 250, 250);
  doc.setDrawColor(210, 210, 210);
  doc.setLineWidth(0.25);
  doc.rect(margin, y, contentWidth, 8.5, 'FD');

  doc.setFontSize(9);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...darkColor);
  doc.text(`Total Quantity: ${challan.total_quantity}`, margin + 3, y + 5.5);

  const grandTotalAmount =
    challan.total_amount ||
    (taxableSubtotal + cgstAmount + sgstAmount);

  if (grandTotalAmount > 0) {
    const label = applyGst ? 'Grand Total (Inc. 18% GST):' : 'Total Amount:';
    const totalText = `${label} Rs. ${formatPdfNum(grandTotalAmount)}`;
    // Aligns right exactly inside the box with 3mm right inset
    doc.text(totalText, pageWidth - margin - 3, y + 5.5, {
      align: 'right',
    });
  }

  y += 13;

  // ---- NOTES ----
  if (challan.notes) {
    doc.setDrawColor(...lightGrayColor);
    doc.setLineWidth(0.2);
    doc.line(margin, y, pageWidth - margin, y);
    y += 5;

    doc.setFontSize(8.5);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(...darkColor);
    doc.text('Notes / Delivery Instructions:', margin, y);
    y += 4;

    doc.setFont('helvetica', 'normal');
    doc.setTextColor(...grayColor);
    const noteLines = doc.splitTextToSize(challan.notes, contentWidth);
    doc.text(noteLines, margin, y);
    y += noteLines.length * 3.5 + 4;
  }

  // ---- SIGNATURE AREA ----
  const signatureY = Math.max(y + 8, pageHeight - 50);

  if (profile.show_prepared_by || profile.show_signature_area) {
    doc.setDrawColor(...lightGrayColor);
    doc.setLineWidth(0.2);
    doc.line(margin, signatureY - 4, pageWidth - margin, signatureY - 4);
  }

  if (profile.show_prepared_by) {
    doc.setFontSize(8.5);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(...grayColor);
    doc.text('Prepared By:', margin, signatureY + 2);
    const creator = challan.prepared_by || challan.created_by || 'Rushank';
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(...darkColor);
    doc.text(creator, margin + 25, signatureY + 2);
  }

  if (profile.show_signature_area) {
    const sigBoxLeft = pageWidth - margin - 65;
    doc.setFontSize(8.5);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(...grayColor);
    doc.text("Receiver's Signature:", sigBoxLeft, signatureY + 2);

    doc.setDrawColor(...lightGrayColor);
    doc.setLineWidth(0.3);
    doc.line(sigBoxLeft, signatureY + 16, sigBoxLeft + 60, signatureY + 16);

    doc.setFontSize(7);
    doc.text('(Name & Date)', sigBoxLeft + 16, signatureY + 20.5);
  }

  // ---- FOOTER ----
  if (profile.footer_message) {
    doc.setFontSize(8);
    doc.setFont('helvetica', 'italic');
    doc.setTextColor(...grayColor);
    doc.text(profile.footer_message, pageWidth / 2, pageHeight - 12, {
      align: 'center',
    });
  }

  // Page border accent (left vertical bar)
  doc.setDrawColor(...accentColor);
  doc.setLineWidth(1.5);
  doc.line(margin - 2, margin - 4, margin - 2, pageHeight - 8);

  return doc;
}

export function downloadChallanPDF(options: PDFOptions): void {
  const doc = generateChallanPDF(options);
  doc.save(`Challan_${options.challan.challan_number.replace(/\//g, '-')}.pdf`);
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
