/**
 * Utility functions for formatting and cleaning Bangladeshi phone numbers.
 * Converts international "+880" / "+88" / "880" prefixes to standard local "01..." format.
 */

export function cleanBangladeshiPhone(raw: string): string {
  if (!raw) return '';
  // Convert any Bengali numerals to standard ASCII numerals
  let str = raw.replace(/[০-৯]/g, d => String('০১২৩৪৫৬৭৮৯'.indexOf(d)));
  
  // Remove spaces, hyphens, parentheses, and dots
  let cleaned = str.trim().replace(/[\s\-\(\)\.]/g, '');

  // Remove Bangladeshi country code prefixes (+880, +88, 8801, 880)
  if (cleaned.startsWith('+880')) {
    cleaned = '0' + cleaned.slice(4);
  } else if (cleaned.startsWith('+88')) {
    cleaned = cleaned.slice(3);
    if (!cleaned.startsWith('0') && cleaned.startsWith('1')) {
      cleaned = '0' + cleaned;
    }
  } else if (cleaned.startsWith('8801')) {
    cleaned = cleaned.slice(2);
  } else if (cleaned.startsWith('880')) {
    cleaned = '0' + cleaned.slice(3);
  } else if (cleaned.startsWith('+')) {
    cleaned = cleaned.slice(1);
  }

  // Remove any remaining non-digit characters
  cleaned = cleaned.replace(/\D/g, '');

  return cleaned;
}

export function formatPhoneDisplay(phone: string): string {
  const cleaned = cleanBangladeshiPhone(phone);
  if (!cleaned) return '';
  if (cleaned.length === 11 && cleaned.startsWith('01')) {
    return `${cleaned.slice(0, 5)}-${cleaned.slice(5)}`;
  }
  return cleaned;
}

export interface OperatorInfo {
  name: string;
  short: string;
  badgeClass: string;
}

export function getBdOperator(phone: string): OperatorInfo {
  const cleaned = cleanBangladeshiPhone(phone);
  if (!cleaned || cleaned.length < 3) {
    return {
      name: 'Mobile',
      short: 'BD',
      badgeClass: 'bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300 border-zinc-200 dark:border-zinc-750'
    };
  }

  const prefix = cleaned.slice(0, 3);
  switch (prefix) {
    case '017':
    case '013':
      return {
        name: 'Grameenphone',
        short: 'GP',
        badgeClass: 'bg-sky-50 text-sky-700 dark:bg-sky-950/40 dark:text-sky-300 border-sky-200 dark:border-sky-800'
      };
    case '018':
      return {
        name: 'Robi',
        short: 'Robi',
        badgeClass: 'bg-rose-50 text-rose-700 dark:bg-rose-950/40 dark:text-rose-300 border-rose-200 dark:border-rose-800'
      };
    case '019':
    case '014':
      return {
        name: 'Banglalink',
        short: 'BL',
        badgeClass: 'bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300 border-amber-200 dark:border-amber-800'
      };
    case '016':
      return {
        name: 'Airtel',
        short: 'Airtel',
        badgeClass: 'bg-red-50 text-red-700 dark:bg-red-950/40 dark:text-red-300 border-red-200 dark:border-red-800'
      };
    case '015':
      return {
        name: 'Teletalk',
        short: 'Teletalk',
        badgeClass: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800'
      };
    default:
      return {
        name: 'Mobile',
        short: 'BD',
        badgeClass: 'bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300 border-zinc-200 dark:border-zinc-750'
      };
  }
}
