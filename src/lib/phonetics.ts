/**
 * High-precision Phonetic Engine for English-to-Bengali and Bengali-to-English Transliterated Search.
 * Allows users to type in English (e.g. "rahim", "shakil", "tanvir", "mostafiz") to accurately find
 * Bengali customer names (e.g. "রহিম", "শাকিল", "তানভীর", "মোস্তাফিজ") and vice-versa.
 */

const BANGLA_TO_LATIN_MAP: Record<string, string> = {
  'অ': 'o', 'আ': 'a', 'া': 'a',
  'ই': 'i', 'ঈ': 'i', 'ি': 'i', 'ী': 'i',
  'উ': 'u', 'ঊ': 'u', 'ু': 'u', 'ূ': 'u',
  'ঋ': 'ri', 'ৃ': 'ri',
  'এ': 'e', 'ঐ': 'oi', 'ে': 'e', 'ৈ': 'oi',
  'ও': 'o', 'ঔ': 'ou', 'ো': 'o', 'ৌ': 'ou',
  'ক': 'k', 'খ': 'kh', 'গ': 'g', 'ঘ': 'gh', 'ঙ': 'ng',
  'চ': 'ch', 'ছ': 'ch', 'জ': 'j', 'ঝ': 'jh', 'ঞ': 'n',
  'ট': 't', 'ঠ': 'th', 'ড': 'd', 'ঢ': 'dh', 'ণ': 'n',
  'ত': 't', 'থ': 'th', 'দ': 'd', 'ধ': 'dh', 'ন': 'n',
  'প': 'p', 'ফ': 'f', 'ব': 'b', 'ভ': 'bh', 'ম': 'm',
  'য': 'j', 'য়': 'y', 'য়': 'y',
  'র': 'r', 'ড়': 'r', 'ঢ়': 'rh', 'ল': 'l',
  'শ': 'sh', 'ষ': 'sh', 'স': 's', 'হ': 'h',
  'ৎ': 't', 'ং': 'ng', 'ঃ': 'h', 'ঁ': '', '্': ''
};

const BANGLA_CONSONANTS = new Set([
  'ক','খ','গ','ঘ','ঙ','চ','ছ','জ','ঝ','ঞ',
  'ট','ঠ','ড','ঢ','ণ','ত','থ','দ','ধ','ন',
  'প','ফ','ব','ভ','ম','য','র','ল','শ','ষ',
  'স','হ','ড়','ঢ়','য়'
]);

const CONSONANT_MAP: Record<string, string> = {
  // Bengali consonants normalized
  'ক': 'k', 'খ': 'k', 'গ': 'g', 'ঘ': 'g', 'ঙ': 'n', 'ং': 'n',
  'চ': 'c', 'ছ': 'c', 'জ': 'j', 'ঝ': 'j', 'ঞ': 'n',
  'ট': 't', 'ঠ': 't', 'ড': 'd', 'ঢ': 'd', 'ণ': 'n',
  'ত': 't', 'থ': 't', 'দ': 'd', 'ধ': 'd', 'ন': 'n',
  'প': 'p', 'ফ': 'f', 'ব': 'b', 'ভ': 'b', 'ম': 'm',
  'য': 'j', 'য়': 'y', 'য়': 'y',
  'র': 'r', 'ড়': 'r', 'ঢ়': 'r', 'ল': 'l',
  'শ': 's', 'ষ': 's', 'স': 's', 'হ': 'h',
  'ৎ': 't',
  // English consonants normalized
  'k': 'k', 'g': 'g', 'c': 'c', 'j': 'j', 'z': 'j',
  't': 't', 'd': 'd', 'n': 'n', 'p': 'p', 'f': 'f',
  'b': 'b', 'v': 'b', 'm': 'm', 'r': 'r', 'l': 'l',
  's': 's', 'h': 'h', 'w': 'w', 'y': 'y'
};

/**
 * Transliterates Bengali unicode text to phonetically readable English/Latin.
 * Correctly inserts inherent vowels ('a') between consecutive non-joined consonants.
 */
export function transliterateBanglaToLatin(str: string): string {
  if (!str) return '';
  str = str.toLowerCase()
    .replace(/য\u09bc/g, 'য়')
    .replace(/ড\u09bc/g, 'ড়')
    .replace(/ঢ\u09bc/g, 'ঢ়');

  let out = '';
  for (let i = 0; i < str.length; i++) {
    const ch = str[i];
    out += BANGLA_TO_LATIN_MAP[ch] !== undefined ? BANGLA_TO_LATIN_MAP[ch] : ch;
    if (BANGLA_CONSONANTS.has(ch)) {
      const next = str[i + 1];
      if (next && BANGLA_CONSONANTS.has(next) && next !== '্') {
        out += 'a';
      }
    }
  }
  return out.toLowerCase();
}

/**
 * Extracts a normalized consonant skeleton, filtering out vowels and merging equivalent sound pairs.
 */
export function normalizeConsonants(str: string): string {
  if (!str) return '';
  str = str.toLowerCase()
    .replace(/য\u09bc/g, 'য়')
    .replace(/ড\u09bc/g, 'ড়')
    .replace(/ঢ\u09bc/g, 'ঢ়')
    .replace(/kh/g, 'k')
    .replace(/gh/g, 'g')
    .replace(/ch/g, 'c')
    .replace(/jh/g, 'j')
    .replace(/th/g, 't')
    .replace(/dh/g, 'd')
    .replace(/ph/g, 'f')
    .replace(/bh/g, 'b')
    .replace(/sh/g, 's')
    .replace(/ee/g, 'i')
    .replace(/oo/g, 'u')
    .replace(/qu/g, 'k')
    .replace(/q/g, 'k');

  let res = '';
  for (let i = 0; i < str.length; i++) {
    const ch = str[i];
    if (CONSONANT_MAP[ch]) {
      res += CONSONANT_MAP[ch];
    }
  }
  return res.replace(/(.)\1+/g, '$1');
}

/**
 * Full phonetic match evaluator between a candidate name and a search query.
 * Evaluates transliterations, alternate vowels (o/a, ee/i, v/bh, etc.), and consonant sequences.
 */
export function matchesPhonetic(name: string, query: string): boolean {
  if (!name || !query) return false;
  name = name.toLowerCase().trim();
  query = query.toLowerCase().trim();

  // 1. Direct lowercase substring
  if (name.includes(query)) return true;

  // 2. Direct Latin transliteration match (e.g. 'রহিম' -> 'rahim' matches 'rah')
  const latinName = transliterateBanglaToLatin(name);
  if (latinName.includes(query)) return true;

  // 3. Normalized query vs transliteration (handling digraphs like ee/i, oo/u, v/bh, z/j)
  const normQuery = query
    .replace(/ee/g, 'i')
    .replace(/oo/g, 'u')
    .replace(/v/g, 'bh')
    .replace(/z/g, 'j')
    .replace(/ph/g, 'f')
    .replace(/qu/g, 'k')
    .replace(/q/g, 'k');
  if (latinName.includes(normQuery)) return true;

  // 4. Inherent vowel 'o' <-> 'a' interchangeability check
  const altLatinName = latinName.replace(/o/g, 'a');
  const altQuery = normQuery.replace(/o/g, 'a');
  if (altLatinName.includes(altQuery)) return true;

  // 5. Consonant skeleton match (e.g. 'rohim' / 'rahim' -> 'rhm' vs 'rhm')
  const qSkel = normalizeConsonants(query);
  const nSkel = normalizeConsonants(name);
  if (qSkel.length >= 2 && nSkel.includes(qSkel)) return true;

  return false;
}

/**
 * Backward-compatible helper that returns a phonetic key for legacy callers.
 */
export function getPhoneticKey(str: string): string {
  return normalizeConsonants(str);
}
