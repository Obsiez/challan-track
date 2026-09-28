import { Customer, Transaction } from '../types';
import { Language, formatNumber } from './translations';

function parseTxDate(raw: any): Date {
  if (!raw) return new Date();
  if (raw instanceof Date) return raw;
  if (typeof raw.toDate === 'function') {
    try {
      return raw.toDate();
    } catch {
      return new Date();
    }
  }
  if (typeof raw === 'number') return new Date(raw);
  const parsed = new Date(raw);
  return isNaN(parsed.getTime()) ? new Date() : parsed;
}

function safeFormatNumber(val: any, lang: Language): string {
  const num = typeof val === 'number' && !isNaN(val) ? val : Number(val) || 0;
  try {
    return formatNumber(num, lang);
  } catch {
    return String(num);
  }
}

/**
 * Draws an authentic jagged receipt cut edge at the top and bottom.
 */
function drawReceiptSilhouette(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  toothW = 6,
  toothH = 3.5
) {
  ctx.beginPath();
  ctx.moveTo(0, toothH);

  // Top zigzag teeth
  let x = 0;
  while (x < w) {
    ctx.lineTo(x + toothW / 2, 0);
    ctx.lineTo(Math.min(x + toothW, w), toothH);
    x += toothW;
  }

  // Right edge down
  ctx.lineTo(w, h - toothH);

  // Bottom zigzag teeth
  x = w;
  while (x > 0) {
    ctx.lineTo(x - toothW / 2, h);
    ctx.lineTo(Math.max(x - toothW, 0), h - toothH);
    x -= toothW;
  }

  // Left edge up
  ctx.lineTo(0, toothH);
  ctx.closePath();
}

/**
 * Draws Lucide 'corner-down-right' icon on canvas
 * polyline points="15 10 20 15 15 20", path d="M4 4v7a4 4 0 0 0 4 4h12"
 */
function drawCornerDownRight(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  size = 9,
  color = '#9CA3AF'
) {
  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineWidth = 1.3;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  const s = size / 24;

  // Down and turn right path: M4 4v7a4 4 0 0 0 4 4h12
  ctx.beginPath();
  ctx.moveTo(x + 4 * s, y + 4 * s);
  ctx.lineTo(x + 4 * s, y + 11 * s);
  ctx.arcTo(x + 4 * s, y + 15 * s, x + 8 * s, y + 15 * s, 4 * s);
  ctx.lineTo(x + 19 * s, y + 15 * s);
  ctx.stroke();

  // Arrowhead pointing right: polyline points="15 10 20 15 15 20"
  ctx.beginPath();
  ctx.moveTo(x + 14 * s, y + 10 * s);
  ctx.lineTo(x + 19 * s, y + 15 * s);
  ctx.lineTo(x + 14 * s, y + 20 * s);
  ctx.stroke();

  ctx.restore();
}

/**
 * Pre-warms Outfit, Hind Siliguri & Plus Jakarta Sans fonts before drawing on canvas.
 */
async function ensureReceiptFontsLoaded() {
  if (typeof document !== 'undefined' && document.fonts && typeof document.fonts.load === 'function') {
    try {
      await Promise.race([
        Promise.all([
          document.fonts.load('16px "Outfit"'),
          document.fonts.load('bold 16px "Outfit"'),
          document.fonts.load('800 16px "Outfit"'),
          document.fonts.load('14px "Hind Siliguri"'),
          document.fonts.load('bold 14px "Hind Siliguri"'),
          document.fonts.load('600 14px "Hind Siliguri"'),
          document.fonts.load('14px "Plus Jakarta Sans"'),
          document.fonts.load('bold 14px "Plus Jakarta Sans"'),
          document.fonts.load('600 14px "Plus Jakarta Sans"')
        ]),
        new Promise((resolve) => setTimeout(resolve, 600))
      ]);
    } catch {
      // Continue gracefully if offline or load fails
    }
  }
}

function drawDashedLine(
  ctx: CanvasRenderingContext2D,
  y: number,
  x1: number,
  x2: number,
  color = '#2A2D35',
  dash = [4, 3]
) {
  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineWidth = 1;
  ctx.setLineDash(dash);
  ctx.beginPath();
  ctx.moveTo(x1, y);
  ctx.lineTo(x2, y);
  ctx.stroke();
  ctx.restore();
}

function drawDoubleLine(
  ctx: CanvasRenderingContext2D,
  y: number,
  x1: number,
  x2: number,
  color = '#353944'
) {
  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(x1, y - 1.5);
  ctx.lineTo(x2, y - 1.5);
  ctx.moveTo(x1, y + 1.5);
  ctx.lineTo(x2, y + 1.5);
  ctx.stroke();
  ctx.restore();
}

/**
 * Converts a data:image/png;base64 string to a Blob reliably and synchronously.
 */
function dataUrlToBlob(dataUrl: string): Blob {
  try {
    const parts = dataUrl.split(',');
    const mime = parts[0].match(/:(.*?);/)?.[1] || 'image/png';
    const binary = atob(parts[1]);
    const array = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      array[i] = binary.charCodeAt(i);
    }
    return new Blob([array], { type: mime });
  } catch (e) {
    console.warn('dataUrlToBlob fallback:', e);
    return new Blob([], { type: 'image/png' });
  }
}

export interface ReceiptImageResult {
  dataUrl: string;
  blob: Blob;
  fileName: string;
}

/**
 * Generates an ultra-sharp, high-DPI POS receipt PNG using Plus Jakarta Sans (English)
 * and Hind Siliguri (Bangla). Displays the last 5 transactions with transparent carry-forward
 * opening balance math so all numbers mathematically balance.
 */
export async function generateReceiptPng(
  customer: Customer,
  transactions: Transaction[] = [],
  lang: Language = 'en'
): Promise<ReceiptImageResult> {
  await ensureReceiptFontsLoaded();

  const customerName = customer?.name?.trim() || (lang === 'bn' ? 'সম্মানিত গ্রাহক' : 'Valued Customer');
  const customerPhone = customer?.phone?.trim() || (lang === 'bn' ? 'প্রযোজ্য নয়' : 'N/A');
  const outstandingDue = typeof customer?.outstandingDue === 'number' && !isNaN(customer.outstandingDue)
    ? customer.outstandingDue
    : Number(customer?.outstandingDue) || 0;

  const cleanPrefix = customerName.replace(/[^\w\u0980-\u09FF]/g, '_').replace(/_+/g, '_').trim() || 'Customer';
  const custId = customer?.id ? String(customer.id) : '000000';
  const safeTransactions = Array.isArray(transactions) ? transactions : [];

  // Default to the last 5 transactions
  const displayTxs = safeTransactions.slice(0, 5);
  const fileName = `${cleanPrefix}_Receipt.png`;

  // 3x Retina resolution (360px base width * 3 = 1080px ultra-HD output)
  const scale = 3;
  const width = 360;
  const padX = 16;
  const contentWidth = width - padX * 2;
  const toothH = 4;

  const fontStack = (size: number, weight: 'normal' | '500' | '600' | 'bold' | '800' = 'normal') =>
    `${weight} ${size}px "Outfit", "Plus Jakarta Sans", "Hind Siliguri", "Noto Sans Bengali", system-ui, -apple-system, sans-serif`;

  const getRowHeight = (tx: Transaction) => (tx?.description?.trim() ? 42 : 27);
  const rowsHeight = displayTxs.length > 0 
    ? displayTxs.reduce((acc, tx) => acc + getRowHeight(tx), 0)
    : 36;

  const topPad = toothH + 16;
  const headerHeight = 46;
  const metaHeight = 68;
  const openingBalHeight = 32;
  const tableHeaderHeight = 22;
  const tableSpacing = 8;
  const totalsHeight = 66;
  const balanceHeight = 60;
  const barcodeHeight = 48;
  const bottomPad = 12 + toothH;

  const totalHeight = topPad 
    + headerHeight 
    + metaHeight 
    + openingBalHeight 
    + tableHeaderHeight 
    + rowsHeight 
    + tableSpacing 
    + totalsHeight 
    + balanceHeight 
    + barcodeHeight 
    + bottomPad;

  // Create high-resolution canvas
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(width * scale);
  canvas.height = Math.round(totalHeight * scale);
  const ctx = canvas.getContext('2d');

  if (!ctx) {
    throw new Error('Canvas 2D context is not available');
  }

  ctx.scale(scale, scale);
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';

  // Deep dark authentic receipt paper
  ctx.save();
  drawReceiptSilhouette(ctx, width, totalHeight, 6, toothH);
  ctx.fillStyle = '#111215'; // Deep charcoal thermal receipt background
  ctx.fill();
  ctx.strokeStyle = '#23262E'; // Subtle outer edge stroke
  ctx.lineWidth = 1;
  ctx.stroke();
  ctx.restore();

  let curY = toothH + 16;

  // 1. BRAND & HEADER (Clean typography matching main website for both Bangla and English)
  const brandTitle = lang === 'bn' ? 'চালান ট্র্যাক' : 'CHALLAN TRACK';
  ctx.textAlign = 'center';
  ctx.fillStyle = '#FFFFFF';
  ctx.font = fontStack(16, 'bold');
  ctx.fillText(brandTitle, width / 2, curY + 14);

  ctx.fillStyle = '#9CA3AF';
  ctx.font = fontStack(9, '500');
  const subText = lang === 'bn' ? 'লেনদেন রসিদ ও হিসাব' : 'TRANSACTION RECEIPT';
  ctx.fillText(subText, width / 2, curY + 31);

  curY += 46;
  drawDashedLine(ctx, curY, padX, width - padX);
  curY += 8;

  // 2. METADATA SECTION
  const now = new Date();
  const dateStr = now.toLocaleDateString(lang === 'bn' ? 'bn-BD' : 'en-US', { day: '2-digit', month: 'short', year: 'numeric' });
  const timeStr = now.toLocaleTimeString(lang === 'bn' ? 'bn-BD' : 'en-US', { hour: '2-digit', minute: '2-digit' });
  const slipNo = `CT-${custId.slice(-6).toUpperCase()}`;

  ctx.textAlign = 'left';
  ctx.font = fontStack(9, '600');
  ctx.fillStyle = '#9CA3AF';
  ctx.fillText(`${lang === 'bn' ? 'রসিদ নং' : 'SLIP NO'}: `, padX, curY + 11);
  ctx.fillStyle = '#F3F4F6';
  ctx.fillText(slipNo, padX + 48, curY + 11);

  ctx.textAlign = 'right';
  ctx.fillStyle = '#9CA3AF';
  ctx.font = fontStack(8.5, 'normal');
  ctx.fillText(`${dateStr} ${timeStr}`, width - padX, curY + 11);

  const displayCustName = customerName.length > 22 ? customerName.slice(0, 20) + '..' : customerName;
  ctx.textAlign = 'left';
  ctx.font = fontStack(9, '600');
  ctx.fillStyle = '#9CA3AF';
  ctx.fillText(`${lang === 'bn' ? 'গ্রাহক' : 'CLIENT'}: `, padX, curY + 27);
  ctx.fillStyle = '#FFFFFF';
  ctx.font = fontStack(9.5, 'bold');
  ctx.fillText(displayCustName, padX + 44, curY + 27);

  ctx.textAlign = 'left';
  ctx.font = fontStack(9, '600');
  ctx.fillStyle = '#9CA3AF';
  ctx.fillText(`${lang === 'bn' ? 'ফোন' : 'PHONE'}: `, padX, curY + 43);
  ctx.fillStyle = '#D1D5DB';
  ctx.font = fontStack(9, 'normal');
  ctx.fillText(customerPhone, padX + 44, curY + 43);

  // Scope Note
  ctx.textAlign = 'left';
  ctx.font = fontStack(8.5, '500');
  ctx.fillStyle = '#06B6D4';
  ctx.fillText(
    lang === 'bn' 
      ? `* সর্বশেষ ${safeFormatNumber(displayTxs.length, lang)}টি লেনদেনের বিবরণী` 
      : `* Recent ${displayTxs.length} Transactions Activity`,
    padX,
    curY + 58
  );

  curY += 68;
  drawDashedLine(ctx, curY, padX, width - padX);
  curY += 6;

  // 3. CARRY-FORWARD OPENING BALANCE CALCULATION
  // periodNet = periodDues - periodPayments
  // openingBalance = currentBalance - periodNet
  const periodDues = displayTxs
    .filter(tx => tx && tx.type === 'due')
    .reduce((sum, tx) => sum + (Number(tx.amount) || 0), 0);

  const periodPayments = displayTxs
    .filter(tx => tx && tx.type === 'payment')
    .reduce((sum, tx) => sum + (Number(tx.amount) || 0), 0);

  const netPeriodMovement = periodDues - periodPayments;
  const currentBalance = outstandingDue;
  const openingBalance = currentBalance - netPeriodMovement;

  // Opening Balance Row
  ctx.font = fontStack(9, '600');
  ctx.fillStyle = '#9CA3AF';
  ctx.textAlign = 'left';
  ctx.fillText(lang === 'bn' ? 'পূর্বের জের (Carried Fwd):' : 'Opening Balance (B/F):', padX, curY + 11);
  ctx.textAlign = 'right';
  ctx.fillStyle = '#F3F4F6';
  ctx.font = fontStack(9.5, 'bold');
  ctx.fillText(`৳${safeFormatNumber(openingBalance, lang)}`, width - padX, curY + 11);

  curY += 24;
  drawDashedLine(ctx, curY, padX, width - padX);
  curY += 6;

  // 4. TABLE HEADER
  ctx.font = fontStack(8.5, 'bold');
  ctx.fillStyle = '#9CA3AF';

  ctx.textAlign = 'left';
  ctx.fillText(lang === 'bn' ? 'তারিখ ও বিবরণ' : 'DATE & DETAILS', padX, curY + 10);

  ctx.textAlign = 'center';
  ctx.fillText(lang === 'bn' ? 'ধরন' : 'TYPE', padX + contentWidth * 0.54, curY + 10);

  ctx.textAlign = 'right';
  ctx.fillText(lang === 'bn' ? 'টাকা' : 'AMOUNT', width - padX, curY + 10);

  curY += 22;
  drawDashedLine(ctx, curY, padX, width - padX);
  curY += 6;

  // 5. TRANSACTION ROWS
  if (displayTxs.length === 0) {
    ctx.textAlign = 'center';
    ctx.fillStyle = '#6B7280';
    ctx.font = fontStack(9, 'normal');
    ctx.fillText(lang === 'bn' ? 'কোন লেনদেন নেই' : 'No transactions recorded', width / 2, curY + 18);
    curY += 36;
  } else {
    displayTxs.forEach((tx) => {
      const txDate = parseTxDate(tx.date);
      const rowDateStr = txDate.toLocaleDateString(lang === 'bn' ? 'bn-BD' : 'en-US', { day: '2-digit', month: 'short' });
      const rowTimeStr = txDate.toLocaleTimeString(lang === 'bn' ? 'bn-BD' : 'en-US', { hour: '2-digit', minute: '2-digit' });
      const isTxDue = tx.type === 'due';
      const typeLabel = isTxDue ? (lang === 'bn' ? 'বকেয়া' : 'DUE') : (lang === 'bn' ? 'জমা' : 'PAID');
      const sign = isTxDue ? '+' : '-';
      const amountStr = `${sign}৳${safeFormatNumber(tx.amount, lang)}`;
      const hasDesc = !!tx.description?.trim();
      const rowH = hasDesc ? 42 : 27;

      // Date, Type, Amount
      ctx.textAlign = 'left';
      ctx.fillStyle = '#E5E7EB';
      ctx.font = fontStack(9, 'normal');
      ctx.fillText(`${rowDateStr} ${rowTimeStr}`, padX, curY + 12);

      ctx.textAlign = 'center';
      ctx.fillStyle = isTxDue ? '#F43F5E' : '#10B981';
      ctx.font = fontStack(8.5, 'bold');
      ctx.fillText(`[${typeLabel}]`, padX + contentWidth * 0.54, curY + 12);

      ctx.textAlign = 'right';
      ctx.fillStyle = isTxDue ? '#F43F5E' : '#10B981';
      ctx.font = fontStack(10, 'bold');
      ctx.fillText(amountStr, width - padX, curY + 12);

      // Sub-line description
      if (hasDesc) {
        const descText = tx.description!.trim();
        const truncatedDesc = descText.length > 32 ? descText.slice(0, 30) + '..' : descText;

        // Draw Lucide 'corner-down-right' icon
        drawCornerDownRight(ctx, padX + 5, curY + 18, 9, '#9CA3AF');

        ctx.textAlign = 'left';
        ctx.fillStyle = '#9CA3AF';
        ctx.font = fontStack(8.5, 'normal');
        ctx.fillText(truncatedDesc, padX + 17, curY + 27);
      }

      curY += rowH;
    });
  }

  curY += 6;
  drawDashedLine(ctx, curY, padX, width - padX);
  curY += 8;

  // 6. PERIOD TOTALS
  ctx.font = fontStack(9, 'normal');
  ctx.fillStyle = '#9CA3AF';
  ctx.textAlign = 'left';
  ctx.fillText(lang === 'bn' ? 'এই সময়ের মোট বকেয়া:' : 'Period Total Dues:', padX, curY + 11);
  ctx.textAlign = 'right';
  ctx.fillStyle = '#F43F5E';
  ctx.font = fontStack(9.5, 'bold');
  ctx.fillText(`+৳${safeFormatNumber(periodDues, lang)}`, width - padX, curY + 11);

  ctx.font = fontStack(9, 'normal');
  ctx.fillStyle = '#9CA3AF';
  ctx.textAlign = 'left';
  ctx.fillText(lang === 'bn' ? 'এই সময়ের মোট জমা:' : 'Period Total Paid:', padX, curY + 26);
  ctx.textAlign = 'right';
  ctx.fillStyle = '#10B981';
  ctx.font = fontStack(9.5, 'bold');
  ctx.fillText(`-৳${safeFormatNumber(periodPayments, lang)}`, width - padX, curY + 26);

  ctx.font = fontStack(9, '600');
  ctx.fillStyle = '#D1D5DB';
  ctx.textAlign = 'left';
  ctx.fillText(lang === 'bn' ? 'এই সময়ের নিট পরিবর্তন:' : 'Period Net Change:', padX, curY + 41);
  ctx.textAlign = 'right';
  ctx.fillStyle = netPeriodMovement >= 0 ? '#F43F5E' : '#10B981';
  ctx.font = fontStack(9.5, 'bold');
  ctx.fillText(`${netPeriodMovement >= 0 ? '+' : '-'}৳${safeFormatNumber(Math.abs(netPeriodMovement), lang)}`, width - padX, curY + 41);

  curY += 52;
  drawDoubleLine(ctx, curY, padX, width - padX);
  curY += 10;

  // 7. CURRENT BALANCE
  const isSettled = outstandingDue === 0;
  const isDue = outstandingDue > 0;

  let statusColor = '#F43F5E';
  let statusText = lang === 'bn' ? 'বকেয়া রয়েছে' : 'OUTSTANDING DUE';

  if (isSettled) {
    statusColor = '#10B981';
    statusText = lang === 'bn' ? 'সম্পূর্ণ পরিশোধিত' : 'FULLY SETTLED';
  } else if (!isDue) {
    statusColor = '#06B6D4';
    statusText = lang === 'bn' ? 'অগ্রিম জমা' : 'CREDIT SURPLUS';
  }

  const balanceDisplay = isSettled
    ? '৳ 0'
    : `${outstandingDue < 0 ? '-' : ''}৳ ${safeFormatNumber(Math.abs(outstandingDue), lang)}`;

  ctx.textAlign = 'left';
  ctx.font = fontStack(9.5, 'bold');
  ctx.fillStyle = '#9CA3AF';
  ctx.fillText(lang === 'bn' ? 'সর্বশেষ মোট স্থিতি:' : 'CURRENT BALANCE:', padX, curY + 12);

  ctx.textAlign = 'right';
  ctx.font = fontStack(8.5, 'bold');
  ctx.fillStyle = statusColor;
  ctx.fillText(`[ ${statusText} ]`, width - padX, curY + 12);

  // Large crisp balance
  ctx.textAlign = 'center';
  ctx.font = fontStack(22, 'bold');
  ctx.fillStyle = statusColor;
  ctx.fillText(balanceDisplay, width / 2, curY + 38);

  curY += 56;
  drawDashedLine(ctx, curY, padX, width - padX);
  curY += 8;

  // 8. BARCODE STRIP (No "Thank you" footer text as requested)
  ctx.save();
  const barcodeY = curY;
  const barcodeH = 16;
  const barPattern = [2, 1, 3, 1, 4, 2, 1, 3, 2, 1, 4, 1, 2, 3, 1, 4, 2, 1, 3, 2, 1, 3, 2, 1, 4, 2, 1, 3, 1, 2, 4];
  const barTotalW = barPattern.reduce((sum, w) => sum + w + 1.2, 0);
  let barCurX = (width - barTotalW) / 2;

  ctx.fillStyle = '#E5E7EB';
  barPattern.forEach((w) => {
    ctx.fillRect(barCurX, barcodeY, w, barcodeH);
    barCurX += w + 1.2;
  });

  ctx.font = fontStack(8, '600');
  ctx.fillStyle = '#6B7280';
  ctx.textAlign = 'center';
  ctx.fillText(`* ${slipNo} *`, width / 2, barcodeY + barcodeH + 12);

  ctx.restore();

  // Convert canvas to Data URL and Blob
  try {
    const dataUrl = canvas.toDataURL('image/png');
    const blob = dataUrlToBlob(dataUrl);
    return { dataUrl, blob, fileName };
  } catch (err) {
    return new Promise<ReceiptImageResult>((resolve, reject) => {
      if (typeof canvas.toBlob === 'function') {
        canvas.toBlob((b) => {
          if (b) {
            const dataUrl = URL.createObjectURL(b);
            resolve({ dataUrl, blob: b, fileName });
          } else {
            reject(new Error('Failed to export canvas to PNG blob'));
          }
        }, 'image/png');
      } else {
        reject(err instanceof Error ? err : new Error(String(err)));
      }
    });
  }
}

/**
 * Triggers download of the generated receipt PNG on user action.
 */
export function downloadReceiptImage(dataUrl: string, fileName: string) {
  try {
    const link = document.createElement('a');
    link.download = fileName;
    link.href = dataUrl;
    document.body.appendChild(link);
    link.click();
    setTimeout(() => {
      if (link.parentNode) {
        link.parentNode.removeChild(link);
      }
    }, 200);
  } catch (err) {
    console.warn('downloadReceiptImage error:', err);
  }
}

/**
 * Copies the receipt PNG to the system clipboard (if supported).
 */
export async function copyReceiptImage(blob: Blob): Promise<boolean> {
  try {
    if (typeof navigator !== 'undefined' && navigator.clipboard && typeof window.ClipboardItem !== 'undefined') {
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
    if (typeof navigator !== 'undefined' && 'canShare' in navigator && typeof File !== 'undefined') {
      const file = new File([blob], fileName, { type: 'image/png' });
      if (navigator.canShare({ files: [file] })) {
        await navigator.share({
          files: [file],
          title: `Challan Track - ${customerName}`,
          text: `Transaction Receipt for ${customerName}`
        });
        return true;
      }
    }
  } catch (err) {
    if ((err as Error)?.name !== 'AbortError') {
      console.error('Web share failed:', err);
    }
  }
  return false;
}
