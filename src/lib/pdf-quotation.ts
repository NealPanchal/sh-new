import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { Quotation, BusinessProfile } from '@/types';
import { formatDateIndian } from '@/lib/utils';
import { SHOWHOUSE_EMBLEM_BASE64 } from '@/lib/logo-data';
import { SHOWHOUSE_PAYMENT_QR_BASE64 } from '@/lib/payment-qr';

export function exportQuotationToPDF(quotation: Quotation, profile?: BusinessProfile | null) {
  // A5 Portrait (148mm × 210mm)
  const doc = new jsPDF('p', 'mm', 'a5');
  const pageWidth = doc.internal.pageSize.getWidth(); // 148mm
  const pageHeight = doc.internal.pageSize.getHeight(); // 210mm
  const margin = 7;
  const contentWidth = pageWidth - margin * 2; // 134mm
  let y = margin;

  const goldColor: [number, number, number] = [190, 142, 42]; // #BE8E2A Gold
  const blueColor: [number, number, number] = [43, 94, 167]; // #2B5EA7 Navy Blue
  const blackColor: [number, number, number] = [20, 20, 20];

  // 1. Header (Left: Logo + Showhouse, Right: Document badge + QTN details)
  try {
    doc.addImage(SHOWHOUSE_EMBLEM_BASE64, 'PNG', margin, y - 1, 12, 12);
  } catch {
    doc.setDrawColor(...goldColor);
    doc.ellipse(margin + 6, y + 5, 5, 3.5);
  }

  doc.setFont('times', 'bold');
  doc.setFontSize(14);
  doc.setTextColor(...goldColor);
  doc.text('SHOWHOUSE', margin + 14, y + 4.5);

  doc.setFont('times', 'normal');
  doc.setFontSize(7.5);
  doc.setTextColor(...goldColor);
  doc.text('Decor Studio', margin + 14, y + 8);

  // Document Badge (Right)
  const badgeWidth = 42;
  const badgeHeight = 6.5;
  const badgeX = pageWidth - margin - badgeWidth;
  doc.setDrawColor(...blueColor);
  doc.setLineWidth(0.4);
  doc.roundedRect(badgeX, y, badgeWidth, badgeHeight, 1.5, 1.5, 'S');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.setTextColor(...blueColor);
  doc.text('QUOTATION / ESTIMATE', badgeX + badgeWidth / 2, y + 4.3, { align: 'center' });

  // Metadata block
  const metaY = y + badgeHeight + 2.5;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(6.8);
  doc.setTextColor(...blackColor);
  doc.text(`QUOTATION NO : ${quotation.quotation_number}`, pageWidth - margin, metaY, { align: 'right' });
  doc.text(`DATE : ${formatDateIndian(quotation.quotation_date).toUpperCase()}`, pageWidth - margin, metaY + 3.2, { align: 'right' });
  if (quotation.prepared_by) {
    doc.text(`PREPARED BY : ${quotation.prepared_by.toUpperCase()}`, pageWidth - margin, metaY + 6.4, { align: 'right' });
  }

  // Company Address block (Right below metadata)
  const compY = metaY + 9.5;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(6.8);
  doc.text('Showhouse Concept & Design LLP', pageWidth - margin, compY, { align: 'right' });
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(6.2);
  doc.setTextColor(50, 50, 50);
  doc.text('LBS marg Nr. Makhmali Talao Thane', pageWidth - margin, compY + 2.8, { align: 'right' });
  doc.text('Phone : 022 2538 7683 / Mobile : +91 93248 69306', pageWidth - margin, compY + 5.6, { align: 'right' });
  doc.text('GST : 27ACMF53838C1ZY', pageWidth - margin, compY + 8.4, { align: 'right' });

  // Client Details (Left)
  const clientY = y + 14;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7.5);
  doc.setTextColor(...blackColor);
  doc.text(`CLIENT NAME : ${quotation.customer_name.toUpperCase()}`, margin, clientY);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(6.8);
  if (quotation.customer_phone) {
    doc.text(`Phone No: ${quotation.customer_phone}`, margin, clientY + 3.5);
  }
  if (quotation.site_name || quotation.delivery_address) {
    const siteTitle = quotation.site_name ? `Target Site: ${quotation.site_name}` : 'Site:';
    doc.setFont('helvetica', 'bold');
    doc.text(siteTitle, margin, clientY + 7);
    doc.setFont('helvetica', 'normal');
    const addr = quotation.delivery_address || quotation.customer_address;
    if (addr) {
      const splitAddr = doc.splitTextToSize(addr, 65);
      doc.text(splitAddr, margin, clientY + 10);
    }
  }

  // Table starts
  y = Math.max(clientY + 18, compY + 12);

  const tableBody = quotation.items.map((it, idx) => [
    String(idx + 1),
    it.item_description.toUpperCase(),
    `${it.quantity} ${it.unit || 'SHEETS'}`.toUpperCase(),
    Number(it.rate || 0).toLocaleString('en-IN'),
    Number(it.amount || 0).toLocaleString('en-IN'),
  ]);

  autoTable(doc, {
    startY: y,
    margin: { left: margin, right: margin },
    head: [['S/N', 'DESCRIPTION', 'QTY', 'UNIT PRICE\nIN INR', 'TOTAL\nIN INR']],
    body: tableBody,
    theme: 'plain',
    headStyles: {
      fillColor: [255, 255, 255],
      textColor: [0, 0, 0],
      font: 'helvetica',
      fontStyle: 'bold',
      fontSize: 6.8,
      halign: 'center',
      valign: 'middle',
      lineWidth: 0.25,
      lineColor: [0, 0, 0],
      cellPadding: 1.5,
    },
    bodyStyles: {
      font: 'helvetica',
      fontSize: 6.8,
      textColor: [0, 0, 0],
      lineWidth: 0.2,
      lineColor: [180, 180, 180],
      cellPadding: 1.6,
    },
    columnStyles: {
      0: { cellWidth: 8, halign: 'center' },
      1: { cellWidth: 64, halign: 'left', fontStyle: 'bold' },
      2: { cellWidth: 20, halign: 'center' },
      3: { cellWidth: 21, halign: 'right' },
      4: { cellWidth: 21, halign: 'right', fontStyle: 'bold' },
    },
  });

  const finalY = (doc as any).lastAutoTable.finalY || y + 40;

  // Bottom Summary Table
  const summaryX = pageWidth - margin - 48;
  const summaryW = 48;
  let curSumY = finalY;

  autoTable(doc, {
    startY: curSumY,
    margin: { left: summaryX, right: margin },
    tableWidth: summaryW,
    theme: 'plain',
    body: [
      ['SUB TOTAL', Number(quotation.subtotal_amount || 0).toLocaleString('en-IN')],
      ...(quotation.apply_gst
        ? [
            ['CGST 9%', Number(quotation.cgst_amount || 0).toLocaleString('en-IN')],
            ['SGST 9%', Number(quotation.sgst_amount || 0).toLocaleString('en-IN')],
          ]
        : []),
      ['GRAND TOTAL', Number(quotation.total_amount || 0).toLocaleString('en-IN')],
    ],
    bodyStyles: {
      font: 'helvetica',
      fontSize: 6.8,
      lineWidth: 0.2,
      lineColor: [150, 150, 150],
      cellPadding: 1.4,
    },
    columnStyles: {
      0: { cellWidth: 24, fontStyle: 'bold' },
      1: { cellWidth: 24, halign: 'right', fontStyle: 'bold' },
    },
  });

  // Banking & Terms (Left)
  const bankW = summaryX - margin - 2;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(6.8);
  doc.text('BANKING & PAYMENT DETAILS:', margin, curSumY + 4);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(6.2);
  doc.text('A/C NO : 50200003880041', margin, curSumY + 7.5);
  doc.text('RTGS / IFSC : HDFC0000146', margin, curSumY + 10.5);
  doc.text('BANK : HDFC BANK LTD, THANE', margin, curSumY + 13.5);
  doc.text('PREPARED BY : ' + (quotation.prepared_by || 'VRUSHANK').toUpperCase(), margin, curSumY + 16.5);

  // Small QR Code if available
  try {
    doc.addImage(SHOWHOUSE_PAYMENT_QR_BASE64, 'PNG', margin + bankW - 20, curSumY + 2, 18, 18);
  } catch {}

  // Terms & Validity
  const termsY = curSumY + 21;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(6.5);
  doc.text('TERMS & CONDITIONS :', margin, termsY);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(6);
  doc.text('• Validity: 1 Week | Material rates inclusive of standard supply', margin, termsY + 3);
  doc.text('• Delivery: Within 2 days of confirmation | 50% advance, 50% on delivery', margin, termsY + 6);

  // Footer: Signatures
  const signY = pageHeight - margin - 10;
  doc.setDrawColor(200, 200, 200);
  doc.line(margin, signY - 2, pageWidth - margin, signY - 2);

  doc.setFont('times', 'italic');
  doc.setFontSize(8);
  doc.setTextColor(...blueColor);
  doc.text('" YOUR CONCEPTS, OUR DESIGNS "', pageWidth / 2, signY + 2, { align: 'center' });

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(6.5);
  doc.setTextColor(80, 80, 80);
  doc.text('CLIENT ACCEPTANCE SIGN', margin + 15, signY + 7, { align: 'center' });
  doc.text('FOR SHOWHOUSE CONCEPTS & DESIGNS LLP', pageWidth - margin - 25, signY + 7, { align: 'center' });

  // Save / Download
  const cleanNum = quotation.quotation_number.replace(/[^a-zA-Z0-9_-]/g, '_');
  doc.save(`Quotation_${cleanNum}_${quotation.customer_name.replace(/\s+/g, '_')}.pdf`);
}
