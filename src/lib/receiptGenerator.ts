import { Customer, Transaction } from '../types';
import { Language, formatNumber } from './translations';

function parseTxDate(raw: any): Date {
  if (!raw) return new Date();
  if (raw instanceof Date) return raw;
  if (typeof raw.toDate === 'function') return raw.toDate();
  if (typeof raw === 'number') return new Date(raw);
  const parsed = new Date(raw);
  return isNaN(parsed.getTime()) ? new Date() : parsed;
}

export interface ReceiptImageResult {
  dataUrl: string;
  blob: Blob;
  fileName: string;
}

/**
 * Generates a high-resolution, professionally designed PNG receipt image for a customer's ledger.
 */
export async function generateReceiptPng(
  customer: Customer,
  transactions: Transaction[],
  lang: Language = 'en'
): Promise<ReceiptImageResult> {
  const customerName = customer.name;
  const customerPhone = customer.phone?.trim() || (lang === 'bn' ? 'প্রযোজ্য নয়' : 'N/A');
  const outstandingDue = customer.outstandingDue;

  const cleanPrefix = customerName.replace(/[^\w\u0980-\u09FF]/g, '_').replace(/_+/g, '_').trim() || 'Customer';
  const fileName = `${cleanPrefix}_Receipt.png`;
  const slipNo = `CT-${customer.id.slice(-6).toUpperCase()}`;

  const totalDuesCalculated = transactions
    .filter(tx => tx.type === 'due')
    .reduce((sum, tx) => sum + tx.amount, 0);

  const totalPaymentsCalculated = transactions
    .filter(tx => tx.type === 'payment')
    .reduce((sum, tx) => sum + tx.amount, 0);

  const isSettled = outstandingDue === 0;
  const isDue = outstandingDue > 0;

  // Visual layout dimensions
  const scale = 2; // 2x Retina resolution
  const width = 640;
  const padX = 36;
  const contentWidth = width - padX * 2;

  // Exact section heights for pixel-perfect vertical alignment
  const getRowHeight = (tx: Transaction) => (tx.description?.trim() ? 56 : 42);
  const rowsHeight = transactions.length > 0 
    ? transactions.reduce((acc, tx) => acc + getRowHeight(tx), 0)
    : 52;

  const topPad = 32;
  const headerHeight = 86;
  const tear1Spacing = 16;
  const metaBoxHeight = 88;
  const metaSpacing = 16;
  const tableHeaderHeight = 32;
  const tableMargin = 6;
  const totalsBoxHeight = 68;
  const totalsSpacing = 14;
  const netBoxHeight = 84;
  const netSpacing = 14;
  const barcodeSectionHeight = 74;
  const tear2Spacing = 16;
  const footerHeight = 44;
  const bottomPad = 28;

  const totalHeight = topPad 
    + headerHeight 
    + tear1Spacing 
    + metaBoxHeight 
    + metaSpacing 
    + tableHeaderHeight 
    + tableMargin 
    + rowsHeight 
    + totalsBoxHeight 
    + totalsSpacing 
    + netBoxHeight 
    + netSpacing 
    + barcodeSectionHeight 
    + tear2Spacing 
    + footerHeight 
    + bottomPad;

  // Create canvas
  const canvas = document.createElement('canvas');
  canvas.width = width * scale;
  canvas.height = totalHeight * scale;
  const ctx = canvas.getContext('2d');

  if (!ctx) {
    throw new Error('Canvas 2D context is not available');
  }

  // Scale all drawing operations by scale factor for Retina sharpness
  ctx.scale(scale, scale);

  // Background - Pure white
  ctx.fillStyle = '#FFFFFF';
  ctx.fillRect(0, 0, width, totalHeight);

  // Outer border & soft inner frame
  ctx.strokeStyle = '#E5E7EB';
  ctx.lineWidth = 1.5;
  ctx.strokeRect(10, 10, width - 20, totalHeight - 20);

  let curY = topPad;

  // 1. BRAND & HEADER
  ctx.textAlign = 'center';
  ctx.fillStyle = '#111827';
  ctx.font = 'bold 22px "Inter", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "SolaimanLipi", sans-serif';
  ctx.fillText('CHALLAN TRACK', width / 2, curY + 22);

  ctx.fillStyle = '#4B5563';
  ctx.font = '600 11px "Inter", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "SolaimanLipi", sans-serif';
  ctx.fillText(
    lang === 'bn' ? 'ডিজিটাল হিসাব খতিয়ান রসিদ' : 'TRANSACTION MEMO & STATEMENT',
    width / 2,
    curY + 42
  );

  // Decorative tag badge
  const tagText = lang === 'bn' ? '★ গ্রাহক একাউন্ট বিবরণী ★' : '★ OFFICIAL CUSTOMER SLIP ★';
  ctx.font = '700 9px "Inter", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "SolaimanLipi", sans-serif';
  const tagWidth = ctx.measureText(tagText).width + 20;
  ctx.fillStyle = '#F3F4F6';
  ctx.beginPath();
  ctx.roundRect((width - tagWidth) / 2, curY + 54, tagWidth, 20, 10);
  ctx.fill();
  ctx.fillStyle = '#4B5563';
  ctx.fillText(tagText, width / 2, curY + 68);

  curY += headerHeight;

  // Perforated tear line
  ctx.save();
  ctx.strokeStyle = '#D1D5DB';
  ctx.lineWidth = 1;
  ctx.setLineDash([4, 4]);
  ctx.beginPath();
  ctx.moveTo(padX, curY);
  ctx.lineTo(width - padX, curY);
  ctx.stroke();
  ctx.restore();

  curY += tear1Spacing;

  // 2. METADATA SECTION BOX
  const metaBoxY = curY;
  ctx.fillStyle = '#F9FAFB';
  ctx.beginPath();
  ctx.roundRect(padX, metaBoxY, contentWidth, metaBoxHeight, 12);
  ctx.fill();
  ctx.strokeStyle = '#E5E7EB';
  ctx.lineWidth = 1;
  ctx.stroke();

  const now = new Date();
  const dateStr = now.toLocaleDateString(lang === 'bn' ? 'bn-BD' : 'en-US', { day: '2-digit', month: 'short', year: 'numeric' });
  const timeStr = now.toLocaleTimeString(lang === 'bn' ? 'bn-BD' : 'en-US', { hour: '2-digit', minute: '2-digit' });

  // Row 1: Slip No & Date
  ctx.textAlign = 'left';
  ctx.font = '700 10px "SF Mono", "Roboto Mono", Consolas, monospace';
  ctx.fillStyle = '#6B7280';
  ctx.fillText(`${lang === 'bn' ? 'রসিদ নং' : 'SLIP NO'}: `, padX + 16, metaBoxY + 26);
  ctx.fillStyle = '#111827';
  ctx.font = 'bold 11px "SF Mono", "Roboto Mono", Consolas, monospace';
  ctx.fillText(slipNo, padX + 80, metaBoxY + 26);

  ctx.textAlign = 'right';
  ctx.font = '600 10.5px "Inter", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "SolaimanLipi", sans-serif';
  ctx.fillStyle = '#4B5563';
  ctx.fillText(`${dateStr} • ${timeStr}`, width - padX - 16, metaBoxY + 26);

  // Dividing line inside meta
  ctx.strokeStyle = '#E5E7EB';
  ctx.beginPath();
  ctx.moveTo(padX + 16, metaBoxY + 38);
  ctx.lineTo(width - padX - 16, metaBoxY + 38);
  ctx.stroke();

  // Row 2: Customer Name & Phone
  ctx.textAlign = 'left';
  ctx.font = '700 10px "Inter", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "SolaimanLipi", sans-serif';
  ctx.fillStyle = '#6B7280';
  ctx.fillText(`${lang === 'bn' ? 'গ্রাহক' : 'CLIENT'}:`, padX + 16, metaBoxY + 58);
  ctx.fillStyle = '#111827';
  ctx.font = 'bold 13px "Inter", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "SolaimanLipi", sans-serif';
  ctx.fillText(customerName, padX + 66, metaBoxY + 58);

  ctx.textAlign = 'left';
  ctx.font = '700 10px "Inter", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "SolaimanLipi", sans-serif';
  ctx.fillStyle = '#6B7280';
  ctx.fillText(`${lang === 'bn' ? 'মোবাইল' : 'PHONE'}:`, padX + 16, metaBoxY + 76);
  ctx.fillStyle = '#374151';
  ctx.font = '600 11px "SF Mono", "Roboto Mono", Consolas, monospace';
  ctx.fillText(customerPhone, padX + 66, metaBoxY + 76);

  curY += metaBoxHeight + metaSpacing;

  // 3. TABLE HEADER
  ctx.fillStyle = '#111827';
  ctx.beginPath();
  ctx.roundRect(padX, curY, contentWidth, tableHeaderHeight, 6);
  ctx.fill();

  ctx.fillStyle = '#FFFFFF';
  ctx.font = 'bold 10px "Inter", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "SolaimanLipi", sans-serif';
  ctx.textAlign = 'left';
  ctx.fillText(lang === 'bn' ? 'তারিখ ও বিবরণ' : 'DATE & DETAILS', padX + 12, curY + 20);

  ctx.textAlign = 'center';
  ctx.fillText(lang === 'bn' ? 'ধরন' : 'TYPE', padX + contentWidth * 0.62, curY + 20);

  ctx.textAlign = 'right';
  ctx.fillText(lang === 'bn' ? 'পরিমাণ' : 'AMOUNT', width - padX - 12, curY + 20);

  curY += tableHeaderHeight + tableMargin;

  // 4. TRANSACTION ROWS
  if (transactions.length === 0) {
    ctx.textAlign = 'center';
    ctx.fillStyle = '#9CA3AF';
    ctx.font = '600 12px "Inter", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "SolaimanLipi", sans-serif';
    ctx.fillText(lang === 'bn' ? 'কোন লেনদেন পাওয়া যায়নি' : 'No transactions recorded', width / 2, curY + 28);
    curY += 50;
  } else {
    transactions.forEach((tx) => {
      const txDate = parseTxDate(tx.date);
      const rowDateStr = txDate.toLocaleDateString(lang === 'bn' ? 'bn-BD' : 'en-US', { day: '2-digit', month: 'short', year: '2-digit' });
      const rowTimeStr = txDate.toLocaleTimeString(lang === 'bn' ? 'bn-BD' : 'en-US', { hour: '2-digit', minute: '2-digit' });
      const isTxDue = tx.type === 'due';
      const typeLabel = isTxDue ? (lang === 'bn' ? 'বকেয়া' : 'DUE') : (lang === 'bn' ? 'জমা' : 'PAID');
      const sign = isTxDue ? '+' : '-';
      const amountStr = `${sign} ৳${formatNumber(tx.amount, lang)}`;
      const hasDesc = !!tx.description?.trim();
      const rowH = hasDesc ? 56 : 42;

      // Date / Time
      ctx.textAlign = 'left';
      ctx.fillStyle = '#111827';
      ctx.font = '600 11px "Inter", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "SolaimanLipi", sans-serif';
      ctx.fillText(`${rowDateStr} ${rowTimeStr}`, padX + 12, curY + 18);

      // Description (if present)
      if (hasDesc) {
        ctx.fillStyle = '#6B7280';
        ctx.font = 'italic 10px "Inter", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "SolaimanLipi", sans-serif';
        const descText = tx.description!.trim();
        const truncatedDesc = descText.length > 36 ? descText.slice(0, 34) + '...' : descText;
        ctx.fillText(truncatedDesc, padX + 12, curY + 34);
      }

      // Type Badge Pill
      const typeBadgeWidth = 48;
      const typeBadgeHeight = 18;
      const typeBadgeX = padX + contentWidth * 0.62 - typeBadgeWidth / 2;
      const typeBadgeY = curY + 6;

      ctx.beginPath();
      ctx.roundRect(typeBadgeX, typeBadgeY, typeBadgeWidth, typeBadgeHeight, 4);
      if (isTxDue) {
        ctx.fillStyle = '#FFF1F2';
        ctx.fill();
        ctx.strokeStyle = '#FECDD3';
        ctx.lineWidth = 1;
        ctx.stroke();
        ctx.fillStyle = '#e0385e';
      } else {
        ctx.fillStyle = '#ECFDF5';
        ctx.fill();
        ctx.strokeStyle = '#A7F3D0';
        ctx.lineWidth = 1;
        ctx.stroke();
        ctx.fillStyle = '#009966';
      }
      ctx.font = 'bold 9.5px "Inter", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "SolaimanLipi", sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(typeLabel, typeBadgeX + typeBadgeWidth / 2, typeBadgeY + 12.5);

      // Amount
      ctx.textAlign = 'right';
      ctx.font = 'bold 12.5px "SF Mono", "Inter", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "SolaimanLipi", sans-serif';
      ctx.fillStyle = isTxDue ? '#e0385e' : '#009966';
      ctx.fillText(amountStr, width - padX - 12, curY + 18);

      // Row separator
      ctx.save();
      ctx.strokeStyle = '#F3F4F6';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(padX + 8, curY + rowH);
      ctx.lineTo(width - padX - 8, curY + rowH);
      ctx.stroke();
      ctx.restore();

      curY += rowH;
    });
  }

  curY += tableSpacing;

  // 5. TOTALS SECTION
  ctx.fillStyle = '#F9FAFB';
  ctx.beginPath();
  ctx.roundRect(padX, curY, contentWidth, totalsBoxHeight, 12);
  ctx.fill();
  ctx.strokeStyle = '#E5E7EB';
  ctx.lineWidth = 1;
  ctx.stroke();

  // Total Dues
  ctx.textAlign = 'left';
  ctx.font = '600 11px "Inter", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "SolaimanLipi", sans-serif';
  ctx.fillStyle = '#4B5563';
  ctx.fillText(lang === 'bn' ? 'মোট বকেয়া যুক্ত' : 'TOTAL DUES BILLED', padX + 16, curY + 26);
  ctx.textAlign = 'right';
  ctx.font = 'bold 12px "SF Mono", "Inter", sans-serif';
  ctx.fillStyle = '#e0385e';
  ctx.fillText(`+ ৳${formatNumber(totalDuesCalculated, lang)}`, width - padX - 16, curY + 26);

  // Total Paid
  ctx.textAlign = 'left';
  ctx.font = '600 11px "Inter", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "SolaimanLipi", sans-serif';
  ctx.fillStyle = '#4B5563';
  ctx.fillText(lang === 'bn' ? 'মোট জমা / পরিশোধ' : 'TOTAL PAID / RECEIVED', padX + 16, curY + 50);
  ctx.textAlign = 'right';
  ctx.font = 'bold 12px "SF Mono", "Inter", sans-serif';
  ctx.fillStyle = '#009966';
  ctx.fillText(`- ৳${formatNumber(totalPaymentsCalculated, lang)}`, width - padX - 16, curY + 50);

  curY += totalsBoxHeight + totalsSpacing;

  // 6. NET BALANCE HIGHLIGHT CARD
  ctx.beginPath();
  ctx.roundRect(padX, curY, contentWidth, netBoxHeight, 14);

  let netBg = '#FFF1F2';
  let netBorder = '#FECDD3';
  let netColor = '#e0385e';
  let statusText = lang === 'bn' ? '[ অপরিশোধিত বকেয়া ]' : '[ OUTSTANDING BALANCE ]';

  if (isSettled) {
    netBg = '#F0FDF4';
    netBorder = '#BBF7D0';
    netColor = '#009966';
    statusText = lang === 'bn' ? '[ সম্পূর্ণ পরিশোধিত ]' : '[ FULLY SETTLED ]';
  } else if (!isDue) {
    netBg = '#ECFEFF';
    netBorder = '#A5F3FC';
    netColor = '#009bb3';
    statusText = lang === 'bn' ? '[ অতিরিক্ত অগ্রিম জমা ]' : '[ ADVANCE CREDIT SURPLUS ]';
  }

  ctx.fillStyle = netBg;
  ctx.fill();
  ctx.strokeStyle = netBorder;
  ctx.lineWidth = 1.5;
  ctx.stroke();

  ctx.textAlign = 'center';
  ctx.font = 'bold 10px "Inter", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "SolaimanLipi", sans-serif';
  ctx.fillStyle = netColor;
  ctx.fillText(lang === 'bn' ? 'বর্তমান মোট স্থিতি' : 'CURRENT NET BALANCE', width / 2, curY + 22);

  const balanceDisplay = isSettled
    ? '৳ 0'
    : `${outstandingDue < 0 ? '-' : ''}৳ ${formatNumber(Math.abs(outstandingDue), lang)}`;

  ctx.font = 'bold 24px "Inter", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "SolaimanLipi", sans-serif';
  ctx.fillStyle = netColor;
  ctx.fillText(balanceDisplay, width / 2, curY + 52);

  ctx.font = '700 9.5px "Inter", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "SolaimanLipi", sans-serif';
  ctx.fillText(statusText, width / 2, curY + 70);

  curY += netBoxHeight + netSpacing;

  // 7. BARCODE & DIGITAL STAMP
  ctx.save();
  ctx.textAlign = 'center';

  // Realistic barcode bars
  const barcodeY = curY;
  const barcodeH = 26;
  const barPattern = [2, 1, 3, 1, 4, 2, 1, 3, 2, 1, 4, 1, 2, 3, 1, 4, 2, 1, 3, 2, 1, 3, 2, 1, 4, 2, 1, 3, 1, 2, 4];
  const barTotalW = barPattern.reduce((sum, w) => sum + w + 1.5, 0);
  let barCurX = (width - barTotalW) / 2;

  ctx.fillStyle = '#111827';
  barPattern.forEach((w) => {
    ctx.fillRect(barCurX, barcodeY, w, barcodeH);
    barCurX += w + 1.5;
  });

  ctx.font = '700 9px "SF Mono", "Roboto Mono", Consolas, monospace';
  ctx.fillStyle = '#4B5563';
  ctx.fillText(`* ${slipNo} *`, width / 2, barcodeY + barcodeH + 14);

  curY += barcodeSectionHeight;
  ctx.restore();

  // Perforated bottom tear line
  ctx.save();
  ctx.strokeStyle = '#D1D5DB';
  ctx.lineWidth = 1;
  ctx.setLineDash([4, 4]);
  ctx.beginPath();
  ctx.moveTo(padX, curY);
  ctx.lineTo(width - padX, curY);
  ctx.stroke();
  ctx.restore();

  curY += tear2Spacing;

  // 8. FOOTER NOTES
  ctx.textAlign = 'center';
  ctx.fillStyle = '#374151';
  ctx.font = 'bold 10px "Inter", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "SolaimanLipi", sans-serif';
  ctx.fillText(
    lang === 'bn' ? '*** আমাদের সাথে লেনদেন করার জন্য ধন্যবাদ ***' : '*** THANK YOU FOR YOUR BUSINESS ***',
    width / 2,
    curY + 12
  );

  ctx.fillStyle = '#6B7280';
  ctx.font = '600 8.5px "Inter", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "SolaimanLipi", sans-serif';
  ctx.fillText(
    'GENERATED VIA CHALLAN TRACK • DIGITAL POS RECORD • VALID WITHOUT SIGNATURE',
    width / 2,
    curY + 28
  );

  // Return PNG Blob and Data URL
  return new Promise<ReceiptImageResult>((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (!blob) {
        reject(new Error('Failed to create PNG blob from canvas'));
        return;
      }
      const dataUrl = canvas.toDataURL('image/png');
      resolve({ dataUrl, blob, fileName });
    }, 'image/png');
  });
}

/**
 * Triggers an instant download of the generated receipt PNG.
 */
export function downloadReceiptImage(dataUrl: string, fileName: string) {
  const link = document.createElement('a');
  link.download = fileName;
  link.href = dataUrl;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

/**
 * Copies the receipt PNG to the system clipboard (if supported).
 */
export async function copyReceiptImage(blob: Blob): Promise<boolean> {
  try {
    if (navigator.clipboard && typeof window.ClipboardItem !== 'undefined') {
      const item = new ClipboardItem({ 'image/png': blob });
      await navigator.clipboard.write([item]);
      return true;
    }
  } catch (err) {
    console.error('Clipboard copy failed:', err);
  }
  return false;
}

/**
 * Native file share via Web Share API (if supported on mobile/tablet).
 */
export async function shareReceiptImage(blob: Blob, fileName: string, customerName: string): Promise<boolean> {
  try {
    const file = new File([blob], fileName, { type: 'image/png' });
    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      await navigator.share({
        files: [file],
        title: `Challan Track - ${customerName}`,
        text: `Transaction Receipt for ${customerName}`
      });
      return true;
    }
  } catch (err) {
    if ((err as Error).name !== 'AbortError') {
      console.error('Web share failed:', err);
    }
  }
  return false;
}
