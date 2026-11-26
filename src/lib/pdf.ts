/**
 * Production-Grade PDF generation for Showhouse Proforma Invoice / Delivery Challan
 * Matches the official Showhouse Concepts & Designs LLP invoice layout exactly
 * Optimized for standard A4 commercial printing (210mm × 297mm) with full A5 fallback.
 */
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { Challan, ChallanItem, BusinessProfile, Customer } from '@/types';
import { formatDateIndian, formatPhone, cleanChallanItemDescription, extractItemOfficeDetails, resolveSiteInchargeDetails } from '@/lib/utils';
import { SHOWHOUSE_EMBLEM_BASE64 } from '@/lib/logo-data';
import { SHOWHOUSE_PAYMENT_QR_BASE64 } from '@/lib/payment-qr';

export interface PDFOptions {
  challan: Challan;
  customer?: Customer;
  customerMaterialRates?: Array<{
    particulars?: string | null;
    material?: string | null;
    room?: string | null;
    code?: string | null;
    company_name?: string | null;
    rate?: number | string | null;
  }> | null;
  items?: ChallanItem[];
  profile: BusinessProfile;
  documentType?: 'PROFORMA INVOICE' | 'DELIVERY CHALLAN';
  employeePhone?: string;
  hideRate?: boolean;
  paperSize?: 'a4' | 'a5';
  showBrandAndCode?: boolean; // When true: includes vendor company brand name and item code (Office / Warehouse Copy)
}

/**
 * Known staff phone directory fallback
 */
const STAFF_PHONE_DIRECTORY: Record<string, string> = {
  vrushank: '+91 81692 14522',
  bhavin: '+91 98203 31717',
  neal: '+91 79773 95952',
  umang: '+91 84510 78170',
  rishi: '+91 77000 03183',
  ronak: '+91 99202 91446',
  ronaksir: '+91 99202 91446',
  divya: '+91 91674 03210',
  deepak: '+91 93248 69306',
  ketan: '+91 93248 69306',
  kenil: '+91 93248 69306',
  jignesh: '+91 93248 69306',
};

export function cleanStaffKey(str: string): string {
  return (str || '')
    .replace(/\s*\(.*?\)/g, '') // remove parenthetical suffixes like (PO VS)
    .replace(/[^a-zA-Z0-9]/g, '')
    .toLowerCase();
}

export function formatStaffPhone(phone?: string | null): string {
  if (!phone) return '';
  const digits = String(phone).replace(/[^0-9]/g, '');
  if (!digits) return '';
  if (digits.length === 10) {
    return `+91 ${digits.slice(0, 5)} ${digits.slice(5)}`;
  }
  if (digits.length === 12 && digits.startsWith('91')) {
    const ten = digits.slice(2);
    return `+91 ${ten.slice(0, 5)} ${ten.slice(5)}`;
  }
  return String(phone).replace(/[^\x20-\x7E]/g, '').trim();
}

/**
 * Dynamically look up employee contact number from cache or profile
 */
export function lookupStaffPhone(staffName?: string | null): string | undefined {
  if (!staffName) return undefined;
  const key = cleanStaffKey(staffName);
  if (!key) return undefined;

  // 1. Try to read from localStorage cache (populated by Settings / API)
  if (typeof window !== 'undefined') {
    try {
      const raw = localStorage.getItem('showhouse_employee_cache');
      if (raw) {
        const list = JSON.parse(raw);
        if (Array.isArray(list)) {
          const found = list.find((e: any) => {
            const eNameKey = cleanStaffKey(e.name || '');
            const eUserKey = cleanStaffKey(e.username || '');
            return (
              (eNameKey && (eNameKey === key || key.includes(eNameKey) || eNameKey.includes(key))) ||
              (eUserKey && (eUserKey === key || key.includes(eUserKey) || eUserKey.includes(key)))
            );
          });
          if (found?.phone && String(found.phone).trim()) {
            const formatted = formatStaffPhone(found.phone);
            if (formatted) return formatted;
          }
        }
      }
    } catch {}
  }

  // 2. Check built-in fallback directory
  for (const [k, ph] of Object.entries(STAFF_PHONE_DIRECTORY)) {
    if (key === k || key.includes(k) || k.includes(key)) {
      return ph;
    }
  }

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
  customer,
  customerMaterialRates,
  items,
  profile,
  documentType,
  employeePhone,
  hideRate = false,
  paperSize = 'a4',
  showBrandAndCode = false,
}: PDFOptions): jsPDF {
  // Paper Dimensions: Default A4 Portrait (210mm × 297mm), fallback A5 (148mm × 210mm)
  const isA4 = paperSize !== 'a5';
  const doc = new jsPDF('p', 'mm', isA4 ? 'a4' : 'a5');
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = isA4 ? 10 : 7;
  const contentWidth = pageWidth - margin * 2;
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

  // Right Header: Rounded Pill Box ("GOODS RETURN" / "PROFORMA INVOICE" / "DELIVERY CHALLAN" / "DELIVERY SLIP" / "OFFICE COPY")
  const isGoodsReturnChallan =
    Boolean((challan as any)?.is_goods_return) ||
    challan.status === 'goods_returned' ||
    Boolean(challan.reference_number && challan.reference_number.toUpperCase().includes('REPL/')) ||
    Boolean(challan.notes && /goods return|replacement/i.test(challan.notes));

  const isOfficeCopy = Boolean(showBrandAndCode);
  const titleText = isGoodsReturnChallan
    ? 'GOODS RETURN'
    : isOfficeCopy
    ? 'DELIVERY CHALLAN (OFFICE COPY)'
    : hideRate
    ? 'DELIVERY SLIP'
    : resolvedDocType;

  const boxWidth = isA4
    ? (isGoodsReturnChallan ? 54 : isOfficeCopy ? 72 : hideRate ? 48 : isPI ? 54 : 58)
    : (isGoodsReturnChallan ? 44 : isOfficeCopy ? 60 : hideRate ? 40 : isPI ? 44 : 48);
  const boxHeight = isA4 ? 7.2 : 6.2;
  const boxX = pageWidth - margin - boxWidth;
  const boxY = y;

  const pillBorderColor: [number, number, number] = isGoodsReturnChallan ? [220, 38, 38] : blueColor;
  const pillFillColor: [number, number, number] = isGoodsReturnChallan ? [254, 242, 242] : [252, 254, 255];

  doc.setDrawColor(...pillBorderColor);
  doc.setLineWidth(0.5);
  doc.setFillColor(...pillFillColor);
  doc.roundedRect(boxX, boxY, boxWidth, boxHeight, 1.2, 1.2, 'FD');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(isA4 ? (isOfficeCopy ? 8.2 : 9.8) : (isOfficeCopy ? 7.2 : 8.8));
  doc.setTextColor(...pillBorderColor);
  doc.text(titleText, boxX + boxWidth / 2, boxY + (isA4 ? 4.9 : 4.3), { align: 'center' });

  // Separate Document Number, Staff PO & Date (Right side below pill)
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(isA4 ? 8.2 : 7.2);
  doc.setTextColor(...blackColor);

  let docInfoY = boxY + boxHeight + (isA4 ? 4.5 : 4.0);
  const docLineGap = isA4 ? 3.8 : 3.2;

  if (isPI) {
    const piNum = challan.pi_number || challan.challan_number.replace(/^SH\//, 'PI/');
    doc.text(`PI NO : ${piNum}`, boxX, docInfoY);
    docInfoY += docLineGap;
    if (challan.reference_number) {
      doc.text(`PO NO : ${challan.reference_number}`, boxX, docInfoY);
      docInfoY += docLineGap;
    }
  } else {
    doc.text(`CHALLAN NO : ${challan.challan_number}`, boxX, docInfoY);
    docInfoY += docLineGap;
    if (challan.reference_number) {
      doc.text(`PO NO : ${challan.reference_number}`, boxX, docInfoY);
      docInfoY += docLineGap;
    }
  }
  doc.text(`DATE : ${formattedDate}`, boxX, docInfoY);
  docInfoY += isA4 ? 4.2 : 3.8;

  // ----------------------------------------------------
  // 2. COMPANY DETAILS (RIGHT) & CUSTOMER DETAILS (LEFT)
  // ----------------------------------------------------
  const detailsY = Math.max(y + (isA4 ? 24 : 20), docInfoY + 2.5);

  // Left: Customer Details
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(isA4 ? 8.8 : 7.6);
  doc.setTextColor(...blackColor);
  doc.text(`CLIENT NAME : ${(challan.customer_name || 'CLIENT').toUpperCase()}`, margin, detailsY);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(isA4 ? 8.0 : 7.0);
  doc.setTextColor(...blackColor);

  let leftDetailY = detailsY + (isA4 ? 3.6 : 3.2);
  const leftLineGap = isA4 ? 3.4 : 2.9;

  if (challan.customer_phone) {
    doc.text(`Phone No: ${formatPhone(challan.customer_phone)}`, margin, leftDetailY);
    leftDetailY += leftLineGap;
  }

  const rawAddr = challan.delivery_address || challan.customer_address || 'THANE, MAHARASHTRA';
  const addrWrapWidth = isA4 ? 90 : 64;
  const addrLines = doc.splitTextToSize(`Address: ${rawAddr.toUpperCase()}`, addrWrapWidth);
  doc.text(addrLines, margin, leftDetailY);
  leftDetailY += addrLines.length * leftLineGap;

  if (challan.customer_gstin) {
    doc.text(`GSTIN: ${challan.customer_gstin}`, margin, leftDetailY);
    leftDetailY += leftLineGap;
  }

  let activeCustomer = customer;
  if (!activeCustomer && typeof window !== 'undefined') {
    try {
      const { getState } = require('@/lib/demo-store');
      const st = getState();
      activeCustomer = (st?.customers || []).find((c: any) =>
        (c.id && challan.customer_id && c.id === challan.customer_id) ||
        (c.name && challan.customer_name && c.name.toLowerCase() === challan.customer_name.toLowerCase()) ||
        (c.business_name && challan.customer_name && c.business_name.toLowerCase() === challan.customer_name.toLowerCase())
      );
    } catch {}
  }

  const siteInchargeDetails = resolveSiteInchargeDetails(challan, activeCustomer ? [activeCustomer] : undefined);
  if (siteInchargeDetails.siteName) {
    const sNameUpper = siteInchargeDetails.siteName.toUpperCase();
    if (!rawAddr.toUpperCase().includes(sNameUpper)) {
      doc.text(`Site: ${sNameUpper}`, margin, leftDetailY);
      leftDetailY += leftLineGap;
    }
  }

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
  const rightLineGap = isA4 ? 3.3 : 2.8;
  rightLines.forEach((line) => {
    doc.text(line, boxX, rightDetailY);
    rightDetailY += rightLineGap;
  });

  y = Math.max(leftDetailY, rightDetailY) + (isA4 ? 3.5 : 2.5);

  // ----------------------------------------------------
  // 3. ITEMS PREPARATION & CALCULATIONS
  // ----------------------------------------------------
  const itemList = items && items.length > 0 ? items : (challan.items || []);
  const transportCharges = Number(challan.transportation_charges) || 0;
  const loadingCharges = Number(challan.loading_charges) || 0;
  const applyGst = Boolean(challan.apply_gst);
  const applyAdditional9 = Boolean(challan.apply_additional_9);

  const itemsSubtotal = itemList.reduce(
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

  // Table Headers & Column Widths
  const headers = isOfficeCopy
    ? (hideRate
        ? ['S/N', 'ITEM DESCRIPTION', 'BRAND', 'CODE', 'QTY', 'RATE\nIN INR', 'AMOUNT\nIN INR']
        : ['S/N', 'DESCRIPTION', 'BRAND', 'CODE', 'QTY', 'UNIT PRICE\nIN INR', 'TOTAL\nIN INR'])
    : (hideRate
        ? ['S/N', 'ITEM DESCRIPTION', 'QTY', 'RATE\nIN INR', 'AMOUNT\nIN INR']
        : ['S/N', 'DESCRIPTION', 'QTY', 'UNIT PRICE\nIN INR', 'TOTAL\nIN INR']);

  const colWidths = isOfficeCopy
    ? (isA4
        ? [10, 56, 28, 22, 22, 26, 26] // Total = 190mm
        : [7, 39, 20, 16, 16, 18, 18]) // Total = 134mm
    : (isA4
        ? [12, 92, 28, 28, 30] // Total = 190mm
        : [8, 63, 20, 21, 22]); // Total = 134mm

  const columnStyles = isOfficeCopy
    ? {
        0: { halign: 'center', cellWidth: colWidths[0] },
        1: { halign: 'left', cellWidth: colWidths[1], fontStyle: 'bold' },
        2: { halign: 'left', cellWidth: colWidths[2], fontStyle: 'bold' },
        3: { halign: 'center', cellWidth: colWidths[3], fontStyle: 'bold' },
        4: { halign: 'center', cellWidth: colWidths[4] },
        5: { halign: 'right', cellWidth: colWidths[5] },
        6: { halign: 'right', cellWidth: colWidths[6], fontStyle: 'bold' },
      }
    : {
        0: { halign: 'center', cellWidth: colWidths[0] },
        1: { halign: 'left', cellWidth: colWidths[1], fontStyle: 'bold' },
        2: { halign: 'center', cellWidth: colWidths[2] },
        3: { halign: 'right', cellWidth: colWidths[3] },
        4: { halign: 'right', cellWidth: colWidths[4], fontStyle: 'bold' },
      };

  if (!activeCustomer && challan.customer) {
    activeCustomer = challan.customer;
  }
  const resolvedCustomerMaterialRates = customerMaterialRates || activeCustomer?.material_rates || (() => {
    if (typeof window !== 'undefined') {
      try {
        const raw = localStorage.getItem('showhouse_customers_cache') || localStorage.getItem('showhouse_state');
        if (raw) {
          const parsed = JSON.parse(raw);
          const custList = Array.isArray(parsed) ? parsed : (parsed.customers || []);
          const found = custList.find((c: any) =>
            (c.id && c.id === challan.customer_id) ||
            (c.business_name && c.business_name.toLowerCase() === (challan.customer_name || '').toLowerCase()) ||
            (c.name && c.name.toLowerCase() === (challan.customer_name || '').toLowerCase())
          );
          if (found && Array.isArray(found.material_rates)) {
            return found.material_rates;
          }
        }
      } catch {}
    }
    return [];
  })();

  const allTableRows: (string | number)[][] = itemList.map((item, idx) => {
    let desc = '';
    if (isOfficeCopy) {
      // Internal Office Copy: Dedicated BRAND & CODE columns, room name stripped from description
      const details = extractItemOfficeDetails(item, resolvedCustomerMaterialRates);
      desc = details.description;
      const brandStr = details.brand;
      const codeStr = details.code;

      const unitStr = item.unit === 'running ft' ? 'RFT' : (item.unit || 'Sheets').toUpperCase();
      const qtyStr = `${item.quantity} ${unitStr}`;

      if (hideRate) {
        return [idx + 1, desc, brandStr, codeStr, qtyStr, '', ''];
      }

      if (item.discount_amount && Number(item.discount_amount) > 0) {
        const discText = item.discount_type === 'percent' ? `${item.discount_value}%` : `₹${item.discount_amount}`;
        desc += ` [ Disc: -${discText} ]`;
      }

      const rate = Number(item.rate) || 0;
      const amount = Number(item.amount) || (rate > 0 ? rate * Number(item.quantity) : 0);

      return [
        idx + 1,
        desc,
        brandStr,
        codeStr,
        qtyStr,
        rate > 0 ? formatRateNum(rate) : '—',
        amount > 0 ? formatAmountNum(amount) : '—',
      ];
    } else {
      // Clean description without supplier company name for client
      desc = cleanChallanItemDescription(item.item_description, item.brand).toUpperCase();
      if (item.colour_finish) {
        const cleanFinish = cleanChallanItemDescription(item.colour_finish, item.brand).toUpperCase();
        if (cleanFinish && !desc.includes(cleanFinish)) {
          desc += ` - ${cleanFinish}`;
        }
      }
    }
    if (item.size) desc += ` ( ${item.size} )`;

    const unitStr = item.unit === 'running ft' ? 'RFT' : (item.unit || 'Sheets').toUpperCase();
    const qtyStr = `${item.quantity} ${unitStr}`;

    if (hideRate) {
      return [
        idx + 1,
        desc,
        qtyStr,
        '',
        '',
      ];
    }

    if (item.discount_amount && Number(item.discount_amount) > 0) {
      const discText = item.discount_type === 'percent' ? `${item.discount_value}%` : `₹${item.discount_amount}`;
      desc += ` [ Disc: -${discText} ]`;
    }

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
    if (isOfficeCopy) {
      allTableRows.push(['', 'DELIVERY CHARGES', '', '', '', '', formatAmountNum(transportCharges)]);
    } else {
      allTableRows.push(['', 'DELIVERY CHARGES', '', '', formatAmountNum(transportCharges)]);
    }
  }
  if (!hideRate && loadingCharges > 0) {
    if (isOfficeCopy) {
      allTableRows.push(['', 'LOADING / UNLOADING CHARGES', '', '', '', '', formatAmountNum(loadingCharges)]);
    } else {
      allTableRows.push(['', 'LOADING / UNLOADING CHARGES', '', '', formatAmountNum(loadingCharges)]);
    }
  }

  // ----------------------------------------------------
  // 4. PAGINATION: 10 ITEMS MAX ON PAGE 1 (A4), 8 (A5)
  // Extra items shift to Page 2 (Continued), with totals on final page
  // ----------------------------------------------------
  const MAX_ITEMS_PAGE1 = isA4 ? 10 : 8;
  const isMultiPage = allTableRows.length > MAX_ITEMS_PAGE1;
  const page1Rows = isMultiPage ? allTableRows.slice(0, MAX_ITEMS_PAGE1) : allTableRows;
  const page2Rows = isMultiPage ? allTableRows.slice(MAX_ITEMS_PAGE1) : [];

  // Faint Watermark Helper
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

  // Dynamically size rows so Page 1 fully utilizes the page gracefully
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
  // 5. BOTTOM LEDGER, BANKING & DUAL SIGNATURES
  // ----------------------------------------------------
  const bottomHeight = isA4 ? 62 : 54;
  const leftColWidth = isA4 ? 112 : 78;
  const rightColWidth = contentWidth - leftColWidth;
  const targetBottomY = pageHeight - bottomHeight - margin - (isA4 ? 4 : 3);

  const renderBottomBoxAndTagline = (boxY: number, _pageNum: number, _totalPages: number) => {
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
    const creator = (challan.prepared_by || challan.created_by || 'VRUSHANK').trim();
    const staffPhone = employeePhone || lookupStaffPhone(creator);
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

    let termsY = termsDividerY + (isA4 ? 3.2 : 2.8);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(isA4 ? 6.8 : 5.7);
    doc.setTextColor(...blackColor);
    doc.text('TERMS & CONDITIONS :', leftX, termsY);
    termsY += isA4 ? 3.0 : 2.6;

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(isA4 ? 5.8 : 4.8);
    doc.setTextColor(50, 50, 50);
    doc.text('• Interest @ 21% will be charged if the payment of bill not made with 7 days', leftX, termsY);
    termsY += isA4 ? 2.8 : 2.4;
    doc.text('• 100% Advance Payment', leftX, termsY);
    termsY += isA4 ? 2.8 : 2.4;
    doc.text('• Goods once sold will not be taken back or exchanged', leftX, termsY);

    // 4. Receiver's Signature
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
    doc.text("RECEIVER'S SIGNATURE", receiverCenterX, sigLineY + (isA4 ? 3.4 : 3.0), { align: 'center' });

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(isA4 ? 6.0 : 5.2);
    doc.setTextColor(80, 80, 80);
    doc.text('(Goods Received)', receiverCenterX, sigLineY + (isA4 ? 6.2 : 5.7), { align: 'center' });

    // ---- RIGHT COLUMN CONTENT (TOTALS & AUTHORIZED SIGNATORY) ----
    const rightX = margin + leftColWidth;
    let totalsY = boxY;

    if (hideRate) {
      // Delivery Slip / No-Rate: Matches standard layout with blank amount boxes for hand writing
      const rightAmountColWidth = isA4 ? 26 : 21;
      const renderTotalRow = (label: string, value: string, isGrandTotal = false) => {
        const rowH = isGrandTotal ? (isA4 ? 5.2 : 4.6) : (isA4 ? 4.0 : 3.5);
        if (isGrandTotal) {
          doc.setFillColor(235, 238, 242);
          doc.rect(rightX, totalsY, rightColWidth, rowH, 'F');
        }
        doc.setDrawColor(40, 40, 40);
        doc.setLineWidth(0.2);
        doc.line(rightX, totalsY + rowH, rightX + rightColWidth, totalsY + rowH);
        doc.line(rightX + rightColWidth - rightAmountColWidth, totalsY, rightX + rightColWidth - rightAmountColWidth, totalsY + rowH);

        doc.setFont('helvetica', 'bold');
        doc.setFontSize(isGrandTotal ? (isA4 ? 8.0 : 7.0) : (isA4 ? 6.8 : 6.0));
        doc.setTextColor(...blackColor);
        doc.text(label, rightX + 2.5, totalsY + (isGrandTotal ? (isA4 ? 3.6 : 3.2) : (isA4 ? 2.8 : 2.5)));
        if (value) {
          doc.text(value, rightX + rightColWidth - 2.0, totalsY + (isGrandTotal ? (isA4 ? 3.6 : 3.2) : (isA4 ? 2.8 : 2.5)), {
            align: 'right',
          });
        }

        totalsY += rowH;
      };

      renderTotalRow('SUB TOTAL', '');
      renderTotalRow('TRANSPORTATION CHARGES', '');
      renderTotalRow('LOADING / UNLOADING CHARGES', '');
      renderTotalRow('CGST 9%', '');
      renderTotalRow('SGST 9%', '');
      renderTotalRow('GRAND TOTAL', '', true);

      // Authorized Signatory Box below Grand Total (Right Column)
      const authHeaderY = Math.max(totalsY + (isA4 ? 4.5 : 4.0), boxY + (isA4 ? 33.0 : 28.0));
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
    } else {
      // Standard Totals Rows
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
      const authHeaderY = Math.max(totalsY + (isA4 ? 4.5 : 4.0), boxY + (isA4 ? 33.0 : 28.0));
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
    }

    // ----------------------------------------------------
    // 6. BOTTOM TAGLINE (BLUE ITALIC BOLD)
    // ----------------------------------------------------
    const taglineY = boxY + bottomHeight + (isA4 ? 4.8 : 4.0);
    doc.setFont('times', 'bolditalic');
    doc.setFontSize(isA4 ? 10.5 : 9.0);
    doc.setTextColor(...blueColor);
    doc.text('" YOUR CONCEPTS, OUR DESIGNS "', pageWidth / 2, Math.min(taglineY, pageHeight - (isA4 ? 3.5 : 3.2)), {
      align: 'center',
    });
  };

  // If there are more than MAX items, create Page 2 and render bottom box on BOTH pages!
  if (isMultiPage) {
    // Add continuation note at bottom of Page 1
    doc.setFont('helvetica', 'italic');
    doc.setFontSize(isA4 ? 7.8 : 6.8);
    doc.setTextColor(110, 110, 110);
    doc.text('(Page 1 of 2 - Continued on Page 2...)', pageWidth - margin, targetBottomY - 2.0, { align: 'right' });

    // Render Bottom Framed Box on Page 1
    renderBottomBoxAndTagline(targetBottomY, 1, 2);

    // Page 2
    doc.addPage(isA4 ? 'a4' : 'a5', 'p');
    let page2Y = margin + 2;

    // Page 2 Mini Header
    doc.setFont('times', 'bold');
    doc.setFontSize(isA4 ? 13 : 11);
    doc.setTextColor(...goldColor);
    doc.text('SHOWHOUSE DECOR STUDIO', margin, page2Y + 4);

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(isA4 ? 8.5 : 7.5);
    doc.setTextColor(...blackColor);
    const page2DocNo = isPI
      ? (challan.pi_number || challan.challan_number.replace(/^SH\//, 'PI/'))
      : challan.challan_number;
    doc.text(`${page2DocNo} (Page 2 of 2 - Continued)`, pageWidth - margin, page2Y + 4, { align: 'right' });

    page2Y += isA4 ? 9.0 : 7.5;
    drawWatermark(page2Y + 15);

    // Page 2 Table (remaining items)
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
        fontSize: isA4 ? 8.2 : 7.0,
        textColor: blackColor,
        cellPadding: isA4 ? 2.4 : 1.8,
        minCellHeight: isA4 ? 8.5 : 7.5,
        lineColor: [60, 60, 60],
        lineWidth: 0.25,
        valign: 'middle',
      },
      columnStyles: columnStyles as any,
      margin: { left: margin, right: margin },
    });

    // Render Bottom Framed Box on Page 2
    renderBottomBoxAndTagline(targetBottomY, 2, 2);
  } else {
    // Single page challan: Render Bottom Framed Box on Page 1
    renderBottomBoxAndTagline(targetBottomY, 1, 1);
  }

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
      doc.setFontSize(isA4 ? 12 : 10);
      doc.text('★ PAID ★', pageWidth - (isA4 ? 25 : 20), isA4 ? 22 : 18, { angle: -6, align: 'center' });
      doc.setFontSize(isA4 ? 6.2 : 5.2);
      doc.text('SHOWHOUSE VERIFIED', pageWidth - (isA4 ? 25 : 20), isA4 ? 26 : 21, { angle: -6, align: 'center' });
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
  const filePrefix = options.showBrandAndCode
    ? 'Showhouse_Office_Copy_'
    : options.hideRate
    ? 'Showhouse_Delivery_Slip_'
    : isPI
    ? 'Showhouse_PI_'
    : 'Showhouse_Challan_';
  doc.save(`${filePrefix}${safeNum}.pdf`);
}

export function downloadInternalChallanPDF(options: Omit<PDFOptions, 'showBrandAndCode'>): void {
  downloadChallanPDF({ ...options, showBrandAndCode: true });
}

export function printInternalChallanPDF(options: Omit<PDFOptions, 'showBrandAndCode'>): void {
  printChallanPDF({ ...options, showBrandAndCode: true });
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
