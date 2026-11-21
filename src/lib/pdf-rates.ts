import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { CustomerMaterialRate } from '@/types';
import { formatDateIndian } from '@/lib/utils';
import { SHOWHOUSE_EMBLEM_BASE64, SHOWHOUSE_LOGO_BASE64 } from '@/lib/logo-data';

export interface ExportRatesPDFOptions {
  customerName: string;
  contactPerson?: string | null;
  phone?: string | null;
  deliveryAddress?: string | null;
  siteName?: string | null;
  selectedRates: CustomerMaterialRate[];
}

export function exportCustomerRatesToPDF(options: ExportRatesPDFOptions) {
  const { customerName, contactPerson, phone, deliveryAddress, siteName, selectedRates } = options;

  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4',
  });

  const pageWidth = doc.internal.pageSize.getWidth();

  // 1. Company Header (Logo + Brand Text on Left, Studio Address on Right)
  const logoSize = 16;
  const logoX = 14;
  const logoY = 10.5;
  const textX = logoX + logoSize + 3.5;

  try {
    const logoImg = SHOWHOUSE_EMBLEM_BASE64 || SHOWHOUSE_LOGO_BASE64;
    const format = logoImg.startsWith('data:image/png') ? 'PNG' : 'JPEG';
    doc.addImage(logoImg, format, logoX, logoY, logoSize, logoSize);
  } catch (err) {
    console.warn('Logo render note:', err);
  }

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(18);
  doc.setTextColor(234, 88, 12); // #ea580c orange
  doc.text('SHOWHOUSE', textX, 18);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8.5);
  doc.setTextColor(113, 113, 122);
  doc.text('DECOR STUDIO', textX, 23);

  // Studio Address & Contacts (Right-aligned)
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(60, 60, 60);
  doc.text('Vishram Baug, Near Makhmali Talao,', pageWidth - 14, 13, { align: 'right' });
  doc.text('LBS Marg, Thane (W) - 400602', pageWidth - 14, 17, { align: 'right' });
  doc.text('Phone: +91 93248 69306 / 022 - 2538 7683', pageWidth - 14, 21, { align: 'right' });
  doc.text('Email: foxshowhouse@gmail.com', pageWidth - 14, 25, { align: 'right' });

  // Divider Line
  doc.setDrawColor(220, 220, 220);
  doc.setLineWidth(0.4);
  doc.line(14, 29.5, pageWidth - 14, 29.5);

  // 2. Title Banner
  doc.setFillColor(248, 250, 252);
  doc.roundedRect(14, 32.5, pageWidth - 28, 9, 1.5, 1.5, 'F');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.setTextColor(24, 24, 27);
  doc.text('MATERIAL SELECTION & AGREED RATE CARD', pageWidth / 2, 38.5, { align: 'center' });

  // 3. Customer Info Box
  let curY = 48;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.setTextColor(24, 24, 27);
  doc.text('CUSTOMER / PARTY:', 14, curY);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.setTextColor(234, 88, 12);
  doc.text(customerName || 'Valued Customer', 14, curY + 5);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  doc.setTextColor(70, 70, 70);

  let custDetails = '';
  if (contactPerson) custDetails += `Attn: ${contactPerson}  |  `;
  if (phone) custDetails += `Phone: +91 ${phone}  |  `;
  custDetails += `Date: ${formatDateIndian(new Date().toISOString())}`;
  doc.text(custDetails, 14, curY + 10);

  let siteText = '';
  if (siteName) {
    siteText = `Site: ${siteName}`;
  } else if (deliveryAddress) {
    siteText = `Site / Delivery: ${deliveryAddress.split('\n')[0]}`;
  }

  if (siteText) {
    doc.text(siteText, 14, curY + 14);
    curY += 4;
  }
  curY += 14;

  // 4. Rate Table (Strictly NO Code, NO Company Name - Customer Confidentiality)
  const tableData = selectedRates.map((mr, idx) => {
    const desc = mr.particulars?.trim() || 'Material Finish / Specification';
    const rateFormatted = `₹ ${Number(mr.rate || 0).toLocaleString('en-IN', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })}`;
    return [
      String(idx + 1),
      mr.room || 'General Area',
      desc,
      rateFormatted,
    ];
  });

  autoTable(doc, {
    startY: curY,
    head: [['#', 'ROOM / AREA', 'SELECTED PARTICULARS', 'AGREED RATE (₹)']],
    body: tableData,
    theme: 'plain',
    headStyles: {
      fillColor: [24, 24, 27],
      textColor: [255, 255, 255],
      fontStyle: 'bold',
      fontSize: 8.5,
      halign: 'left',
      cellPadding: 3,
    },
    bodyStyles: {
      textColor: [30, 30, 30],
      fontSize: 8.5,
      cellPadding: 3,
    },
    columnStyles: {
      0: { cellWidth: 10, halign: 'center' },
      1: { cellWidth: 45, fontStyle: 'bold' },
      2: { cellWidth: 'auto' },
      3: { cellWidth: 35, halign: 'right', fontStyle: 'bold', textColor: [234, 88, 12] },
    },
    alternateRowStyles: {
      fillColor: [248, 250, 252],
    },
    didDrawPage: (data) => {
      // Bottom notes
      const footerY = doc.internal.pageSize.getHeight() - 20;
      doc.setFont('helvetica', 'italic');
      doc.setFontSize(7.5);
      doc.setTextColor(120, 120, 120);
      doc.text(
        'Note: Quantities will be verified & billed during delivery challan preparation. All rates are exclusive of GST unless specified.',
        14,
        footerY
      );
      doc.text(
        'SHOWHOUSE DECOR STUDIO · Architectural & Interior Studio · Vishram Baug, Thane (W)',
        14,
        footerY + 4
      );
    },
  });

  // Save the PDF
  const safeName = (customerName || 'Customer').replace(/[^a-z0-9]/gi, '_');
  doc.save(`${safeName}_Material_Selection.pdf`);
}

