/**
 * WhatsApp sharing module for Delivery Challans
 * Uses wa.me links and Web Share API where supported.
 */

import { Challan, BusinessProfile } from '@/types';
import { getWhatsAppNumber, formatDateIndian } from '@/lib/utils';
import { getChallanPDFBlob } from '@/lib/pdf';
import { ChallanItem } from '@/types';

interface ShareOptions {
  challan: Challan;
  items: ChallanItem[];
  profile: BusinessProfile;
}

/**
 * Generate WhatsApp share message
 */
export function generateShareMessage(challan: Challan, profile: BusinessProfile): string {
  const businessName = profile.business_name || 'Showhouse';
  let message =
    `Hello ${challan.customer_name},\n\n` +
    `Please find your ${businessName} Delivery Challan *${challan.challan_number}*, ` +
    `dated ${formatDateIndian(challan.challan_date)}.\n\n`;

  if (challan.items && challan.items.length > 0) {
    message += `*Items Delivered:*\n`;
    challan.items.forEach((item, idx) => {
      const lineRate = item.rate ? Number(item.rate) : null;
      const lineAmt = item.amount ? Number(item.amount) : (lineRate ? lineRate * item.quantity : null);
      const rateInfo = lineRate ? ` @ ₹${lineRate.toLocaleString('en-IN')}` : '';
      const amtInfo = lineAmt ? ` = ₹${lineAmt.toLocaleString('en-IN')}` : '';
      message += `${idx + 1}. ${item.item_description} - ${item.quantity} ${item.unit}${rateInfo}${amtInfo}\n`;
    });
    message += `\n`;
  }

  message += `*Total Qty:* ${challan.total_quantity} items\n`;

  const itemsSubtotal =
    challan.items?.reduce(
      (sum, it) => sum + (Number(it.amount) || ((Number(it.rate) || 0) * (Number(it.quantity) || 0))),
      0
    ) || 0;

  const transport = Number(challan.transportation_charges) || 0;
  const loading = Number(challan.loading_charges) || 0;

  if (transport > 0) {
    message += `*Transportation:* ₹${transport.toLocaleString('en-IN')}\n`;
  }
  if (loading > 0) {
    message += `*Loading Charges:* ₹${loading.toLocaleString('en-IN')}\n`;
  }

  const taxableSubtotal = challan.subtotal_amount || (itemsSubtotal + transport + loading);

  if (challan.apply_gst) {
    const cgst = challan.cgst_amount ?? (taxableSubtotal > 0 ? Math.round(taxableSubtotal * 0.09 * 100) / 100 : 0);
    const sgst = challan.sgst_amount ?? (taxableSubtotal > 0 ? Math.round(taxableSubtotal * 0.09 * 100) / 100 : 0);
    if (transport > 0 || loading > 0) {
      message += `*Taxable Subtotal:* ₹${taxableSubtotal.toLocaleString('en-IN')}\n`;
    }
    message += `*CGST (9%):* ₹${cgst.toLocaleString('en-IN')}\n`;
    message += `*SGST (9%):* ₹${sgst.toLocaleString('en-IN')}\n`;
  }

  if (challan.apply_additional_9) {
    const addl9 = challan.additional_9_amount ?? (taxableSubtotal > 0 ? Math.round(taxableSubtotal * 0.09 * 100) / 100 : 0);
    message += `*Additional Tax (9%):* ₹${addl9.toLocaleString('en-IN')}\n`;
  }

  const totalAmt =
    challan.total_amount ||
    (taxableSubtotal +
      (challan.apply_gst
        ? (challan.cgst_amount ?? Math.round(taxableSubtotal * 0.09 * 100) / 100) +
          (challan.sgst_amount ?? Math.round(taxableSubtotal * 0.09 * 100) / 100)
        : 0) +
      (challan.apply_additional_9
        ? (challan.additional_9_amount ?? Math.round(taxableSubtotal * 0.09 * 100) / 100)
        : 0));

  if (totalAmt && totalAmt > 0) {
    const taxLabel = challan.apply_gst && challan.apply_additional_9
      ? 'Grand Total (Inc. 18% GST + 9% Addl)'
      : challan.apply_gst
      ? 'Grand Total (Inc. 18% GST)'
      : challan.apply_additional_9
      ? 'Grand Total (Inc. 9% Addl)'
      : 'Total Amount';
    message += `*${taxLabel}:* ₹${totalAmt.toLocaleString('en-IN')}\n`;
  }

  message += `\nThank you for your business!\n— ${businessName}`;
  return message;
}

/**
 * Open WhatsApp with the customer's phone and pre-filled message
 */
export function openWhatsApp(phone: string, message: string): void {
  const waNumber = getWhatsAppNumber(phone);
  const encodedMessage = encodeURIComponent(message);
  const url = `https://wa.me/${waNumber}?text=${encodedMessage}`;
  window.open(url, '_blank', 'noopener,noreferrer');
}

/**
 * Generate WhatsApp share message for Delivery Bill / Memo Slip
 */
export function generateBillShareMessage(
  challan: Challan,
  profile: BusinessProfile,
  memoNoOverride?: string,
  confirmByOverride?: string
): string {
  const businessName = profile.business_name || 'Showhouse';
  const memoNo =
    memoNoOverride ||
    challan.reference_number ||
    challan.challan_number.split('/').pop() ||
    '0120';
  const confirmBy =
    confirmByOverride ||
    challan.notes ||
    (challan.created_by || challan.prepared_by
      ? `Confirm By ${challan.created_by || challan.prepared_by}`
      : '');

  const totalAmt =
    challan.total_amount ||
    (challan.items || []).reduce(
      (sum, it) => sum + (Number(it.amount) || ((Number(it.rate) || 0) * (Number(it.quantity) || 0))),
      0
    );

  let msg =
    `Hello ${challan.customer_name},\n\n` +
    `Here is your *${businessName} Decor Studio Delivery Bill / Memo*.\n` +
    `📄 *Official PDF attached*\n\n` +
    `*Memo No:* ${memoNo}\n` +
    `*Date:* ${formatDateIndian(challan.challan_date)}\n`;

  if (challan.items && challan.items.length > 0) {
    msg += `\n*Particulars:*\n`;
    challan.items.forEach((it, idx) => {
      const lineRate = it.rate ? Number(it.rate) : null;
      const rateInfo = lineRate ? ` @ ₹${lineRate.toLocaleString('en-IN')}` : '';
      msg += `${idx + 1}. ${it.item_description} (${it.quantity} ${it.unit})${rateInfo}\n`;
    });
  }

  msg += `\n*GRAND TOTAL:* ₹${Number(totalAmt).toLocaleString('en-IN')}\n`;

  if (confirmBy) {
    msg += `*Note:* ${confirmBy}\n`;
  }

  msg +=
    `\nThank you for choosing ${businessName} Decor Studio!\n` +
    `— Thane (W) | +91 93248 69306`;

  return msg;
}

export interface ShareWhatsAppOptions {
  challan: Challan;
  items?: ChallanItem[];
  profile: BusinessProfile;
  customMessage?: string;
  documentType?: 'PROFORMA INVOICE' | 'DELIVERY CHALLAN';
  isBillMemo?: boolean;
  memoNo?: string;
  confirmBy?: string;
  onToast?: (message: string, type?: 'success' | 'error' | 'info') => void;
}

/**
 * Universal WhatsApp sharing function:
 * - On Mobile (or supported browsers): Shares BOTH the PDF file and text caption directly via native Web Share API
 * - On Desktop: Auto-downloads the official PDF and opens WhatsApp Web with the pre-filled text
 */
export async function shareChallanViaWhatsApp(options: ShareWhatsAppOptions): Promise<{
  success: boolean;
  method: 'native' | 'download_and_web';
}> {
  const { challan, profile } = options;
  const items = options.items || challan.items || [];
  const message =
    options.customMessage ||
    (options.isBillMemo
      ? generateBillShareMessage(challan, profile, options.memoNo, options.confirmBy)
      : generateShareMessage(challan, profile));

  if (!challan.customer_phone) {
    options.onToast?.('Customer phone number not available', 'error');
    return { success: false, method: 'download_and_web' };
  }

  const fileDocNum = (challan.reference_number || challan.challan_number).replace(/[\/\\]/g, '-');
  const fileName = `Showhouse_${fileDocNum}.pdf`;

  // 1. Try Native Web Share API (Mobile / supported desktop browsers)
  // This sends the actual PDF file AND the text caption directly into WhatsApp!
  if (typeof navigator !== 'undefined' && typeof navigator.share === 'function') {
    try {
      const blob = getChallanPDFBlob({
        challan,
        items,
        profile,
        documentType: options.documentType,
      });
      const file = new File([blob], fileName, { type: 'application/pdf' });

      let canShareFiles = false;
      if (typeof navigator.canShare === 'function') {
        try {
          canShareFiles = navigator.canShare({ files: [file] });
        } catch {
          canShareFiles = false;
        }
      }

      if (canShareFiles) {
        await navigator.share({
          title: `Showhouse - ${challan.challan_number}`,
          text: message,
          files: [file],
        });
        options.onToast?.(`Challan PDF & WhatsApp message shared!`, 'success');
        return { success: true, method: 'native' };
      }
    } catch (err: any) {
      if (err?.name === 'AbortError') {
        // User cancelled native share sheet
        return { success: false, method: 'native' };
      }
      console.warn('Native share with PDF failed or not supported, falling back to download + web:', err);
    }
  }

  // 2. Desktop Fallback (WhatsApp Web)
  // Automatically download the official PDF directly to user's computer
  try {
    const { downloadChallanPDF } = await import('@/lib/pdf');
    downloadChallanPDF({
      challan,
      items,
      profile,
      documentType: options.documentType,
    });
  } catch (err) {
    console.error('Failed to download PDF:', err);
  }

  // Open WhatsApp chat with pre-filled message
  openWhatsApp(challan.customer_phone, message);

  options.onToast?.(
    `📄 PDF downloaded (${fileName}) & WhatsApp opened! Attach the PDF in the chat to send both.`,
    'success'
  );

  return { success: true, method: 'download_and_web' };
}

/**
 * Try native Web Share API with PDF file
 */
export async function tryNativeShare(options: ShareOptions): Promise<boolean> {
  const result = await shareChallanViaWhatsApp({
    challan: options.challan,
    items: options.items,
    profile: options.profile,
  });
  return result.success && result.method === 'native';
}

/**
 * Copy share message to clipboard
 */
export async function copyShareMessage(
  challan: Challan,
  profile: BusinessProfile
): Promise<boolean> {
  const message = generateShareMessage(challan, profile);
  try {
    await navigator.clipboard.writeText(message);
    return true;
  } catch {
    // Fallback
    const textArea = document.createElement('textarea');
    textArea.value = message;
    document.body.appendChild(textArea);
    textArea.select();
    document.execCommand('copy');
    document.body.removeChild(textArea);
    return true;
  }
}
