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
 * Try native Web Share API with PDF file
 */
export async function tryNativeShare(options: ShareOptions): Promise<boolean> {
  const { challan, items, profile } = options;

  if (!navigator.share || !navigator.canShare) {
    return false;
  }

  try {
    const blob = getChallanPDFBlob({ challan, items, profile });
    const fileName = `Challan_${challan.challan_number.replace(/\//g, '-')}.pdf`;
    const file = new File([blob], fileName, { type: 'application/pdf' });

    const shareData = {
      title: `Delivery Challan - ${challan.challan_number}`,
      text: generateShareMessage(challan, profile),
      files: [file],
    };

    if (navigator.canShare(shareData)) {
      await navigator.share(shareData);
      return true;
    }
  } catch (err) {
    if ((err as Error).name === 'AbortError') {
      // User cancelled
      return false;
    }
    console.error('Native share failed:', err);
  }

  return false;
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
