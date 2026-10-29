/**
 * WhatsApp sharing module for Showhouse Delivery Challans & Memo Bills
 * Shares directly to customer's WhatsApp phone number along with PDF download & live document link
 */

import { Challan, BusinessProfile, ChallanItem } from '@/types';
import { getWhatsAppNumber, formatDateIndian } from '@/lib/utils';
import { downloadChallanPDF, getChallanPDFBlob } from '@/lib/pdf';

interface ShareOptions {
  challan: Challan;
  items: ChallanItem[];
  profile: BusinessProfile;
}

/**
 * Generate WhatsApp share message for Delivery Challan
 */
export function generateShareMessage(
  challan: Challan,
  profile: BusinessProfile,
  viewUrl?: string
): string {
  const businessName = profile.business_name || 'Showhouse';
  let message =
    `Hello ${challan.customer_name},\n\n` +
    `Please find your *${businessName} Delivery Challan* details below:\n` +
    `📄 *Challan No:* ${challan.challan_number}\n` +
    `📅 *Date:* ${formatDateIndian(challan.challan_date)}\n`;

  if (challan.reference_number) {
    message += `🔖 *Ref / Order No:* ${challan.reference_number}\n`;
  }

  if (viewUrl) {
    message += `\n📥 *View & Download Official PDF:*\n${viewUrl}\n`;
  }

  if (challan.items && challan.items.length > 0) {
    message += `\n*Particulars:*\n`;
    challan.items.forEach((item, idx) => {
      const lineRate = item.rate ? Number(item.rate) : null;
      const lineAmt = item.amount ? Number(item.amount) : (lineRate ? lineRate * item.quantity : null);
      const rateInfo = lineRate ? ` @ ₹${lineRate.toLocaleString('en-IN')}` : '';
      const amtInfo = lineAmt ? ` = ₹${lineAmt.toLocaleString('en-IN')}` : '';
      message += `${idx + 1}. ${item.item_description} (${item.quantity} ${item.unit})${rateInfo}${amtInfo}\n`;
    });
  }

  message += `\n*Total Qty:* ${challan.total_quantity} items\n`;

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
    message += `*${taxLabel}:* ₹${Number(totalAmt).toLocaleString('en-IN')}\n`;
  }

  message += `\nThank you for your business!\n— ${businessName} Decor Studio`;
  return message;
}

/**
 * Generate WhatsApp share message for Delivery Bill / Memo Slip
 */
export function generateBillShareMessage(
  challan: Challan,
  profile: BusinessProfile,
  memoNoOverride?: string,
  confirmByOverride?: string,
  viewUrl?: string
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
    `*Memo No:* ${memoNo}\n` +
    `*Date:* ${formatDateIndian(challan.challan_date)}\n`;

  if (viewUrl) {
    msg += `\n📥 *View & Download Official PDF:*\n${viewUrl}\n`;
  }

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

/**
 * Generate Delivery Confirmation WhatsApp message for customer
 */
export function generateDeliveryConfirmationMessage(
  challan: Challan,
  profile: BusinessProfile,
  viewUrl?: string
): string {
  const businessName = profile.business_name || 'Showhouse';
  const deliveryDate = challan.delivered_at
    ? formatDateIndian(challan.delivered_at)
    : formatDateIndian(new Date().toISOString());

  let msg =
    `Hello ${challan.customer_name},\n\n` +
    `🚚 *GOOD NEWS! ORDER DELIVERED*\n` +
    `Your goods for *${businessName} Delivery Challan* have been successfully *DELIVERED* to your address.\n\n` +
    `📄 *Challan No:* ${challan.challan_number}\n` +
    `📅 *Delivery Date:* ${deliveryDate}\n`;

  if (challan.reference_number) {
    msg += `🔖 *Ref / Order No:* ${challan.reference_number}\n`;
  }

  if (challan.delivery_address) {
    msg += `📍 *Delivery Address:* ${challan.delivery_address}\n`;
  }

  if (challan.items && challan.items.length > 0) {
    msg += `\n*Items Delivered:*\n`;
    challan.items.forEach((item, idx) => {
      msg += `${idx + 1}. ${item.item_description} (${item.quantity} ${item.unit})\n`;
    });
  }

  msg += `\n*Total Delivered Qty:* ${challan.total_quantity} items\n`;

  if (viewUrl) {
    msg += `\n📥 *View & Verify Delivery Challan:*\n${viewUrl}\n`;
  }

  msg +=
    `\nKindly inspect and check all items delivered.\n` +
    `If you have any questions or discrepancies, please inform us within 24 hours.\n\n` +
    `Thank you for choosing ${businessName} Decor Studio!\n` +
    `— Thane (W) | +91 93248 69306`;

  return msg;
}

/**
 * Automatically resolve customer phone number:
 * 1. Checks challan.customer_phone
 * 2. Checks customer table by id or exact/fuzzy name
 * 3. Checks other challans by customer name
 */
export function resolveCustomerPhone(
  challan: Challan,
  customers?: any[],
  allChallans?: Challan[]
): string {
  if (challan.customer_phone && challan.customer_phone.trim()) {
    return challan.customer_phone.trim();
  }
  if (challan.customer_id && customers && customers.length > 0) {
    const c = customers.find((cust: any) => cust.id === challan.customer_id);
    if (c?.phone && c.phone.trim()) return c.phone.trim();
  }
  if (challan.customer_name && customers && customers.length > 0) {
    const cName = challan.customer_name.toLowerCase().trim();
    // Exact match
    let c = customers.find(
      (cust: any) =>
        (cust.business_name && cust.business_name.toLowerCase().trim() === cName) ||
        (cust.name && cust.name.toLowerCase().trim() === cName) ||
        (cust.contact_person && cust.contact_person.toLowerCase().trim() === cName)
    );
    if (c?.phone && c.phone.trim()) return c.phone.trim();

    // Partial/fuzzy match
    c = customers.find(
      (cust: any) =>
        cust.phone &&
        cust.phone.trim() &&
        ((cust.business_name &&
          (cName.includes(cust.business_name.toLowerCase().trim()) ||
            cust.business_name.toLowerCase().trim().includes(cName))) ||
          (cust.contact_person &&
            (cName.includes(cust.contact_person.toLowerCase().trim()) ||
              cust.contact_person.toLowerCase().trim().includes(cName))))
    );
    if (c?.phone && c.phone.trim()) return c.phone.trim();
  }
  if (challan.customer_name && allChallans && allChallans.length > 0) {
    const cName = challan.customer_name.toLowerCase().trim();
    const other = allChallans.find(
      (c) =>
        c.customer_name &&
        (c.customer_name.toLowerCase().trim() === cName ||
          cName.includes(c.customer_name.toLowerCase().trim()) ||
          c.customer_name.toLowerCase().trim().includes(cName)) &&
        c.customer_phone &&
        c.customer_phone.trim()
    );
    if (other?.customer_phone && other.customer_phone.trim()) {
      return other.customer_phone.trim();
    }
  }
  return '';
}

/**
 * Open WhatsApp with the customer's phone and pre-filled message
 * Works seamlessly on Mobile (native WhatsApp app via wa.me) and Desktop (WhatsApp Web / App)
 */
export function openWhatsApp(phone: string, message: string): boolean {
  const waNumber = getWhatsAppNumber(phone);
  if (!waNumber) return false;
  const encodedMessage = encodeURIComponent(message);
  // Universal WhatsApp deep-link recognized by all devices
  const url = `https://wa.me/${waNumber}?text=${encodedMessage}`;

  if (typeof window !== 'undefined') {
    const isMobile =
      /Android|iPhone|iPad|iPod/i.test(navigator.userAgent) ||
      (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

    if (isMobile) {
      window.location.href = url;
      return true;
    } else {
      // Desktop: Attempt standard window.open first
      const win = window.open(url, '_blank', 'noopener,noreferrer');
      // If popup blocker blocked the new window, navigate current tab as foolproof fallback
      if (!win || win.closed || typeof win.closed === 'undefined') {
        window.location.href = url;
      } else {
        try {
          win.focus();
        } catch {}
      }
      return true;
    }
  }
  return false;
}

export interface ShareWhatsAppOptions {
  challan: Challan;
  items?: ChallanItem[];
  profile: BusinessProfile;
  customMessage?: string;
  phoneOverride?: string;
  documentType?: 'PROFORMA INVOICE' | 'DELIVERY CHALLAN';
  isBillMemo?: boolean;
  memoNo?: string;
  confirmBy?: string;
  autoDownloadPDF?: boolean;
  onToast?: (message: string, type?: 'success' | 'error' | 'info') => void;
}

/**
 * Universal WhatsApp sharing function:
 * 1. Directly opens WhatsApp to the customer's phone number without popup blocker delay
 * 2. Safely handles PDF download so it never aborts mobile app redirection
 */
export async function shareChallanViaWhatsApp(options: ShareWhatsAppOptions): Promise<{
  success: boolean;
  method: 'whatsapp_direct';
}> {
  const { challan, profile } = options;
  const items = options.items || challan.items || [];
  const targetPhone = (options.phoneOverride || challan.customer_phone || '').trim();

  if (!targetPhone) {
    options.onToast?.('Customer phone number not available to share on WhatsApp', 'error');
    return { success: false, method: 'whatsapp_direct' };
  }

  const fileDocNum = (challan.reference_number || challan.challan_number).replace(/[\/\\]/g, '-');
  const fileName = `Showhouse_${fileDocNum}.pdf`;

  // Generate live official PDF view / download link for customer
  let viewUrl = '';
  if (typeof window !== 'undefined' && window.location?.origin) {
    viewUrl = `${window.location.origin}/view/challan/${challan.id}`;
  }

  // Clean, professional WhatsApp message with live view & download link
  const message =
    options.customMessage ||
    (options.isBillMemo
      ? generateBillShareMessage(challan, profile, options.memoNo, options.confirmBy, viewUrl)
      : generateShareMessage(challan, profile, viewUrl));

  // 1. Mobile devices: share the downloaded PDF file directly into WhatsApp!
  if (
    typeof navigator !== 'undefined' &&
    typeof navigator.share === 'function' &&
    typeof navigator.canShare === 'function'
  ) {
    try {
      const blob = getChallanPDFBlob({
        challan,
        items,
        profile,
        documentType: options.documentType,
      });
      const file = new File([blob], fileName, { type: 'application/pdf' });

      if (navigator.canShare({ files: [file] })) {
        await navigator.share({
          title: `Showhouse - ${challan.challan_number}`,
          text: message,
          files: [file],
        });
        options.onToast?.(`Challan PDF shared successfully!`, 'success');
        return { success: true, method: 'whatsapp_direct' };
      }
    } catch (err: any) {
      if (err?.name === 'AbortError') {
        // User cancelled native share drawer
        return { success: false, method: 'whatsapp_direct' };
      }
      console.warn('Native PDF share error:', err);
    }
  }

  // 2. Desktop / fallback: automatically download the PDF file directly!
  if (options.autoDownloadPDF !== false) {
    try {
      downloadChallanPDF({
        challan,
        items,
        profile,
        documentType: options.documentType,
      });
    } catch (err) {
      console.warn('PDF auto-download note:', err);
    }
  }

  // 3. Open WhatsApp to customer's chat with clean text summary (no website link)
  openWhatsApp(targetPhone, message);

  options.onToast?.(
    `PDF downloaded! Attach ${fileName} in WhatsApp chat.`,
    'success'
  );

  return { success: true, method: 'whatsapp_direct' };
}

/**
 * Native file sharing (for sharing raw PDF file directly via OS share drawer on mobile)
 */
export async function sharePDFFileNative(options: ShareWhatsAppOptions): Promise<boolean> {
  const { challan, profile } = options;
  const items = options.items || challan.items || [];
  const fileDocNum = (challan.reference_number || challan.challan_number).replace(/[\/\\]/g, '-');
  const fileName = `Showhouse_${fileDocNum}.pdf`;

  if (typeof navigator !== 'undefined' && typeof navigator.share === 'function') {
    try {
      const blob = getChallanPDFBlob({
        challan,
        items,
        profile,
        documentType: options.documentType,
      });
      const file = new File([blob], fileName, { type: 'application/pdf' });

      if (typeof navigator.canShare === 'function' && navigator.canShare({ files: [file] })) {
        const message = generateShareMessage(challan, profile);
        await navigator.share({
          title: `Showhouse - ${challan.challan_number}`,
          text: message,
          files: [file],
        });
        options.onToast?.(`Challan PDF shared successfully!`, 'success');
        return true;
      }
    } catch (err: any) {
      if (err?.name !== 'AbortError') {
        console.warn('Native share failed:', err);
      }
    }
  }

  // Fallback to regular WhatsApp share
  await shareChallanViaWhatsApp(options);
  return true;
}

/**
 * Try native Web Share API with PDF file
 */
export async function tryNativeShare(options: ShareOptions): Promise<boolean> {
  return sharePDFFileNative({
    challan: options.challan,
    items: options.items,
    profile: options.profile,
  });
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
    const textArea = document.createElement('textarea');
    textArea.value = message;
    document.body.appendChild(textArea);
    textArea.select();
    document.execCommand('copy');
    document.body.removeChild(textArea);
    return true;
  }
}

/**
 * Send WhatsApp Delivery Confirmation directly to customer
 */
export async function shareDeliveryConfirmationViaWhatsApp(options: {
  challan: Challan;
  profile: BusinessProfile;
  phoneOverride?: string;
  onToast?: (msg: string, type?: 'success' | 'error' | 'info') => void;
}): Promise<boolean> {
  const { challan, profile } = options;
  const targetPhone = (options.phoneOverride || challan.customer_phone || '').trim();

  if (!targetPhone) {
    options.onToast?.('Customer phone number not available for delivery notification', 'error');
    return false;
  }

  let viewUrl = '';
  if (typeof window !== 'undefined' && window.location?.origin) {
    viewUrl = `${window.location.origin}/view/challan/${challan.id}`;
  }

  const message = generateDeliveryConfirmationMessage(challan, profile, viewUrl);

  // Auto-download PDF for desktop drag-drop
  try {
    downloadChallanPDF({
      challan,
      items: challan.items || [],
      profile,
    });
  } catch {}

  openWhatsApp(targetPhone, message);
  options.onToast?.(`WhatsApp opened with Delivery Confirmation for ${challan.customer_name}!`, 'success');
  return true;
}
