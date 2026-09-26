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
  toothW = 8,
  toothH = 4
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

function drawDashedLine(
  ctx: CanvasRenderingContext2D,
  y: number,
  x1: number,
  x2: number,
  color = '#262931',
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
  color = '#2A2E38'
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
 * Generates an authentic, dark-background, minimalist POS receipt PNG image.
 */
export async function generateReceiptPng(
  customer: Customer,
  transactions: Transaction[] = [],
  lang: Language = 'en'
): Promise<ReceiptImageResult> {
  const customerName = customer?.name?.trim() || 'Customer';
  const customerPhone = customer?.phone?.trim() || (lang === 'bn' ? 'প্রযোজ্য নয়' : 'N/A');
  const outstandingDue = typeof customer?.outstandingDue === 'number' && !isNaN(customer.outstandingDue)
    ? customer.outstandingDue
    : Number(customer?.outstandingDue) || 0;

  const cleanPrefix = customerName.replace(/[^\w\u0980-\u09FF]/g, '_').replace(/_+/g, '_').trim() || 'Customer';
  const fileName = `${cleanPrefix}_Receipt.png`;
  const custId = customer?.id ? String(customer.id) : '000000';
  const slipNo = `CT-${custId.slice(-6).toUpperCase()}`;

  const safeTransactions = Array.isArray(transactions) ? transactions : [];

  const totalDuesCalculated = safeTransactions
    .filter(tx => tx && tx.type === 'due')
    .reduce((sum, tx) => sum + (Number(tx.amount) || 0), 0);

  const totalPaymentsCalculated = safeTransactions
    .filter(tx => tx && tx.type === 'payment')
    .reduce((sum, tx) => sum + (Number(tx.amount) || 0), 0);

  const isSettled = outstandingDue === 0;
  const isDue = outstandingDue > 0;

  // Layout Constants - Ultra-compact, clean 2-line layout
  const scale = 2; // 2x Retina resolution for sharp rendering
  const width = 480;
  const padX = 26;
  const contentWidth = width - padX * 2;
  const toothH = 4;

  const getRowHeight = (tx: Transaction) => (tx?.description?.trim() ? 40 : 26);
  const rowsHeight = safeTransactions.length > 0 
    ? safeTransactions.reduce((acc, tx) => acc + getRowHeight(tx), 0)
    : 34;

  const topPad = toothH + 16;
  const headerHeight = 44;
  const metaHeight = 60;
  const tableHeaderHeight = 22;
  const tableSpacing = 8;
  const totalsHeight = 46;
  const balanceHeight = 56;
  const barcodeHeight = 52;
  const footerHeight = 28;
  const bottomPad = 14 + toothH;

  const totalHeight = topPad 
    + headerHeight 
    + metaHeight 
    + tableHeaderHeight 
    + rowsHeight 
    + tableSpacing 
    + totalsHeight 
    + balanceHeight 
    + barcodeHeight 
    + footerHeight 
    + bottomPad;

  // Create canvas
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(width * scale);
  canvas.height = Math.round(totalHeight * scale);
  const ctx = canvas.getContext('2d');

  if (!ctx) {
    throw new Error('Canvas 2D context is not available');
  }

  ctx.scale(scale, scale);

  // Background: Dark, authentic thermal slip receipt
  ctx.save();
  drawReceiptSilhouette(ctx, width, totalHeight, 8, toothH);
  ctx.fillStyle = '#111215'; // Deep charcoal/black receipt paper
  ctx.fill();
  ctx.strokeStyle = '#23262D'; // Subtle outer edge line
  ctx.lineWidth = 1;
  ctx.stroke();
  ctx.restore();

  // Typography font families
  const monoFont = (size: number, weight = 'normal') =>
    `${weight} ${size}px "SF Mono", "Roboto Mono", Menlo, Consolas, "Noto Sans Bengali", monospace`;
  const sansFont = (size: number, weight = 'normal') =>
    `${weight} ${size}px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Inter", "Noto Sans Bengali", sans-serif`;

  let curY = topPad;

  // 1. BRAND & HEADER (Minimalist receipt style)
  ctx.textAlign = 'center';
  ctx.fillStyle = '#F3F4F6';
  ctx.font = monoFont(17, 'bold');
  ctx.fillText('CHALLAN TRACK', width / 2, curY + 16);

  ctx.fillStyle = '#9CA3AF';
  ctx.font = monoFont(10, 'normal');
  ctx.fillText(lang === 'bn' ? 'লেনদেন রসিদ ও হিসাব' : 'TRANSACTION RECEIPT', width / 2, curY + 32);

  curY += headerHeight;
  drawDashedLine(ctx, curY, padX, width - padX);
  curY += 8;

  // 2. METADATA SECTION (Compact key-value text)
  const now = new Date();
  const dateStr = now.toLocaleDateString(lang === 'bn' ? 'bn-BD' : 'en-US', { day: '2-digit', month: 'short', year: 'numeric' });
  const timeStr = now.toLocaleTimeString(lang === 'bn' ? 'bn-BD' : 'en-US', { hour: '2-digit', minute: '2-digit' });

  // Slip & Date
  ctx.textAlign = 'left';
  ctx.font = monoFont(10, 'bold');
  ctx.fillStyle = '#9CA3AF';
  ctx.fillText(`${lang === 'bn' ? 'রসিদ' : 'SLIP'}: `, padX, curY + 12);
  ctx.fillStyle = '#F3F4F6';
  ctx.fillText(slipNo, padX + 38, curY + 12);

  ctx.textAlign = 'right';
  ctx.fillStyle = '#9CA3AF';
  ctx.font = monoFont(9.5, 'normal');
  ctx.fillText(`${dateStr} ${timeStr}`, width - padX, curY + 12);

  // Client & Phone
  ctx.textAlign = 'left';
  ctx.fillStyle = '#9CA3AF';
  ctx.font = monoFont(10, 'bold');
  ctx.fillText(`${lang === 'bn' ? 'গ্রাহক' : 'CLIENT'}: `, padX, curY + 28);
  ctx.fillStyle = '#F3F4F6';
  ctx.font = sansFont(11.5, 'bold');
  ctx.fillText(customerName, padX + 54, curY + 28);

  ctx.textAlign = 'left';
  ctx.fillStyle = '#9CA3AF';
  ctx.font = monoFont(10, 'bold');
  ctx.fillText(`${lang === 'bn' ? 'ফোন' : 'PHONE'}: `, padX, curY + 44);
  ctx.fillStyle = '#D1D5DB';
  ctx.font = monoFont(10.5, 'normal');
  ctx.fillText(customerPhone, padX + 54, curY + 44);

  curY += metaHeight;
  drawDashedLine(ctx, curY, padX, width - padX);
  curY += 6;

  // 3. TABLE HEADER (Compact monospace columns)
  ctx.font = monoFont(9.5, 'bold');
  ctx.fillStyle = '#9CA3AF';

  ctx.textAlign = 'left';
  ctx.fillText(lang === 'bn' ? 'তারিখ / বিবরণ' : 'DATE / ITEM', padX, curY + 11);

  ctx.textAlign = 'center';
  ctx.fillText(lang === 'bn' ? 'ধরন' : 'TYPE', padX + contentWidth * 0.62, curY + 11);

  ctx.textAlign = 'right';
  ctx.fillText(lang === 'bn' ? 'টাকা' : 'AMOUNT', width - padX, curY + 11);

  curY += tableHeaderHeight;
  drawDashedLine(ctx, curY, padX, width - padX);
  curY += 6;

  // 4. TRANSACTION ROWS (Compact 2-line max design)
  if (safeTransactions.length === 0) {
    ctx.textAlign = 'center';
    ctx.fillStyle = '#6B7280';
    ctx.font = monoFont(10, 'normal');
    ctx.fillText(lang === 'bn' ? 'কোন লেনদেন নেই' : 'No transactions recorded', width / 2, curY + 18);
    curY += 34;
  } else {
    safeTransactions.forEach((tx) => {
      const txDate = parseTxDate(tx.date);
      const rowDateStr = txDate.toLocaleDateString(lang === 'bn' ? 'bn-BD' : 'en-US', { day: '2-digit', month: 'short' });
      const rowTimeStr = txDate.toLocaleTimeString(lang === 'bn' ? 'bn-BD' : 'en-US', { hour: '2-digit', minute: '2-digit' });
      const isTxDue = tx.type === 'due';
      const typeLabel = isTxDue ? (lang === 'bn' ? 'বকেয়া' : 'DUE') : (lang === 'bn' ? 'জমা' : 'PAID');
      const sign = isTxDue ? '+' : '-';
      const amountStr = `${sign}৳${safeFormatNumber(tx.amount, lang)}`;
      const hasDesc = !!tx.description?.trim();
      const rowH = hasDesc ? 40 : 26;

      // Line 1: Date, Type, Amount
      ctx.textAlign = 'left';
      ctx.fillStyle = '#E5E7EB';
      ctx.font = monoFont(10, 'normal');
      ctx.fillText(`${rowDateStr} ${rowTimeStr}`, padX, curY + 13);

      ctx.textAlign = 'center';
      ctx.fillStyle = isTxDue ? '#e0385e' : '#009966';
      ctx.font = monoFont(9.5, 'bold');
      ctx.fillText(`[${typeLabel}]`, padX + contentWidth * 0.62, curY + 13);

      ctx.textAlign = 'right';
      ctx.fillStyle = isTxDue ? '#e0385e' : '#009966';
      ctx.font = monoFont(11, 'bold');
      ctx.fillText(amountStr, width - padX, curY + 13);

      // Line 2: Note / Description (compact indented)
      if (hasDesc) {
        ctx.textAlign = 'left';
        ctx.fillStyle = '#9CA3AF';
        ctx.font = sansFont(9.5, 'italic');
        const descText = tx.description!.trim();
        const truncatedDesc = descText.length > 44 ? descText.slice(0, 42) + '...' : descText;
        ctx.fillText(`↳ ${truncatedDesc}`, padX + 8, curY + 28);
      }

      curY += rowH;
    });
  }

  curY += tableSpacing;
  drawDashedLine(ctx, curY, padX, width - padX);
  curY += 8;

  // 5. TOTALS SECTION (Clean inline lines without chunky boxes)
  ctx.font = monoFont(10, 'normal');
  ctx.fillStyle = '#9CA3AF';
  ctx.textAlign = 'left';
  ctx.fillText(lang === 'bn' ? 'মোট বকেয়া যুক্ত:' : 'Total Dues Added:', padX, curY + 12);
  ctx.textAlign = 'right';
  ctx.fillStyle = '#e0385e';
  ctx.font = monoFont(11, 'bold');
  ctx.fillText(`+৳${safeFormatNumber(totalDuesCalculated, lang)}`, width - padX, curY + 12);

  ctx.font = monoFont(10, 'normal');
  ctx.fillStyle = '#9CA3AF';
  ctx.textAlign = 'left';
  ctx.fillText(lang === 'bn' ? 'মোট জমা / পরিশোধ:' : 'Total Paid / Received:', padX, curY + 28);
  ctx.textAlign = 'right';
  ctx.fillStyle = '#009966';
  ctx.font = monoFont(11, 'bold');
  ctx.fillText(`-৳${safeFormatNumber(totalPaymentsCalculated, lang)}`, width - padX, curY + 28);

  curY += totalsHeight;
  drawDoubleLine(ctx, curY, padX, width - padX);
  curY += 10;

  // 6. BALANCE SECTION (Authentic receipt highlight, no bloated boxes)
  let statusColor = '#e0385e';
  let statusText = lang === 'bn' ? 'বকেয়া' : 'OUTSTANDING DUE';

  if (isSettled) {
    statusColor = '#009966';
    statusText = lang === 'bn' ? 'পরিশোধিত' : 'FULLY SETTLED';
  } else if (!isDue) {
    statusColor = '#00d3f2';
    statusText = lang === 'bn' ? 'অগ্রিম জমা' : 'CREDIT SURPLUS';
  }

  const balanceDisplay = isSettled
    ? '৳ 0'
    : `${outstandingDue < 0 ? '-' : ''}৳ ${safeFormatNumber(Math.abs(outstandingDue), lang)}`;

  ctx.textAlign = 'left';
  ctx.font = monoFont(10, 'bold');
  ctx.fillStyle = '#9CA3AF';
  ctx.fillText(lang === 'bn' ? 'বর্তমান মোট স্থিতি:' : 'CURRENT BALANCE:', padX, curY + 14);

  ctx.textAlign = 'right';
  ctx.font = monoFont(9.5, 'bold');
  ctx.fillStyle = statusColor;
  ctx.fillText(`[ ${statusText} ]`, width - padX, curY + 14);

  // Large crisp amount
  ctx.textAlign = 'center';
  ctx.font = monoFont(22, 'bold');
  ctx.fillStyle = statusColor;
  ctx.fillText(balanceDisplay, width / 2, curY + 38);

  curY += balanceHeight;
  drawDashedLine(ctx, curY, padX, width - padX);
  curY += 8;

  // 7. BARCODE STRIP (Classic minimalist POS barcode)
  ctx.save();
  const barcodeY = curY;
  const barcodeH = 20;
  const barPattern = [2, 1, 3, 1, 4, 2, 1, 3, 2, 1, 4, 1, 2, 3, 1, 4, 2, 1, 3, 2, 1, 3, 2, 1, 4, 2, 1, 3, 1, 2, 4];
  const barTotalW = barPattern.reduce((sum, w) => sum + w + 1.2, 0);
  let barCurX = (width - barTotalW) / 2;

  ctx.fillStyle = '#E5E7EB';
  barPattern.forEach((w) => {
    ctx.fillRect(barCurX, barcodeY, w, barcodeH);
    barCurX += w + 1.2;
  });

  ctx.font = monoFont(8.5, 'bold');
  ctx.fillStyle = '#6B7280';
  ctx.textAlign = 'center';
  ctx.fillText(`* ${slipNo} *`, width / 2, barcodeY + barcodeH + 12);

  curY += barcodeHeight;
  ctx.restore();

  // 8. MINIMAL FOOTER (Professional, zero fluffy AI words)
  ctx.textAlign = 'center';
  ctx.fillStyle = '#9CA3AF';
  ctx.font = monoFont(9.5, 'bold');
  ctx.fillText(
    lang === 'bn' ? '*** ধন্যবাদ ***' : '*** THANK YOU ***',
    width / 2,
    curY + 12
  );

  // Synchronous, rock-solid output
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
