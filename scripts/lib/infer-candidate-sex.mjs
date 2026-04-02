/**
 * Infer display sex (ECI-style M/F) from Indian press / voterlist name strings.
 * Returns '' when unknown so the UI does not show a wrong badge.
 */

const PREFIX_STRIP =
  /^(Dr\.?|Prof\.?|Adv\.?|Justice|Lt\.?\s*Col\.?|Col\.?|Major|Capt\.?|Er\.?|Wing\s+Cmdr\.?)\s+/i;

/** After honorifics / strips, common female given names or tokens in South/press lists. */
const FEMALE_NAME_RE = new RegExp(
  String.raw`\b(` +
    [
      'poornima',
      'purnima',
      'rajeswari',
      'raajeswari',
      'kiruthika',
      'kiruthiga',
      'latha',
      'kanimozhi',
      'tamilisai',
      'vasanthi',
      'malathi',
      'malathy',
      'deepa',
      'divya',
      'priya',
      'lakshmi',
      'usha',
      'jayanthi',
      'jayanthy',
      'saroja',
      'kavitha',
      'kavita',
      'vijaya',
      'sumathi',
      'sumathy',
      'baby',
      'pushpa',
      'sundari',
      'andal',
      'thamarai',
      'rani',
      'devi',
      'amma',
      'bai',
      'begum',
    ].join('|') +
    String.raw`)\b`,
  'i'
);

function stripLeadingPrefixes(str) {
  let t = str.replace(/\s+/g, ' ').trim();
  let again = true;
  while (again) {
    again = false;
    const m = t.match(PREFIX_STRIP);
    if (m) {
      t = t.slice(m[0].length).trim();
      again = true;
    }
  }
  return t;
}

function honorificSex(str) {
  const s = str.replace(/\s+/g, ' ').trim();
  if (!s) return '';

  if (/^smt\.?\s/i.test(s)) return 'F';
  if (/^shrimati\.?\s/i.test(s)) return 'F';
  if (/^ms\.?\s/i.test(s)) return 'F';
  if (/^mrs\.?\s/i.test(s)) return 'F';
  if (/^miss\s/i.test(s)) return 'F';
  if (/^thirumathi\.?\s/i.test(s)) return 'F';
  if (/\bkumari\b/i.test(s)) return 'F';

  if (/^shri\.?\s/i.test(s)) return 'M';
  if (/^sh\.?\s/i.test(s)) return 'M';
  if (/^thiru\.?\s/i.test(s)) return 'M';
  // Leading "Sri " / "Sri. " as honorific (not a place name like Sriperumbudur at start of token)
  if (/^sri\.?\s/i.test(s) && !/^sriper/i.test(s)) return 'M';

  return '';
}

/**
 * @param {string} [raw]
 * @returns {'M' | 'F' | ''}
 */
export function inferSexFromAnnouncedName(raw) {
  const head = String(raw ?? '').replace(/\s+/g, ' ').trim();
  if (!head) return '';

  let sex = honorificSex(head);
  if (sex) return sex;

  const stripped = stripLeadingPrefixes(head);
  sex = honorificSex(stripped);
  if (sex) return sex;

  if (FEMALE_NAME_RE.test(stripped)) return 'F';

  return '';
}
