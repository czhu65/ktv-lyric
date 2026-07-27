// Tone-numbered pinyin (the canonical key, see pinyin-syllable.ts) rendered
// with diacritics for display: wo3 -> wǒ. This is the Mandarin analogue of
// romanize/yale.ts, and like it, it is display-only -- the numbered form
// remains the audio key and is never derived back from the marked form.
const MARKS: Record<string, string[]> = {
  //         tone: 1    2    3    4
  a: ['ā', 'á', 'ǎ', 'à'],
  e: ['ē', 'é', 'ě', 'è'],
  i: ['ī', 'í', 'ǐ', 'ì'],
  o: ['ō', 'ó', 'ǒ', 'ò'],
  u: ['ū', 'ú', 'ǔ', 'ù'],
  v: ['ǜ', 'ǘ', 'ǚ', 'ǜ'], // placeholder row, replaced below
}
// ü's four marked forms don't follow the same table shape as the plain vowels,
// so they are spelled out rather than derived.
MARKS.v = ['ǖ', 'ǘ', 'ǚ', 'ǜ']

const CANONICAL = /^([a-z]+)([0-4])$/

/**
 * Which vowel carries the mark, per the standard rule:
 *   1. an `a` or `e` if present (never both in one syllable)
 *   2. otherwise the `o` of `ou`
 *   3. otherwise the LAST vowel
 * Returns -1 when the syllable has no vowel at all (syllabic n, hm, ng).
 */
function markIndex(letters: string): number {
  const a = letters.indexOf('a')
  if (a >= 0) return a
  const e = letters.indexOf('e')
  if (e >= 0) return e
  const ou = letters.indexOf('ou')
  if (ou >= 0) return ou
  for (let i = letters.length - 1; i >= 0; i--) {
    if ('aeiouv'.includes(letters[i])) return i
  }
  return -1
}

export function numToMark(syllable: string): string {
  const m = CANONICAL.exec(syllable)
  if (!m) return syllable

  const [, letters, tone] = m
  const plain = letters.replace(/v/g, 'ü')

  // Neutral tone carries no diacritic -- just drop the digit.
  if (tone === '0') return plain

  const i = markIndex(letters)
  if (i < 0) return syllable // nothing to mark; keep the digit rather than lie

  const marked = MARKS[letters[i]][Number(tone) - 1]
  return (letters.slice(0, i) + marked + letters.slice(i + 1)).replace(/v/g, 'ü')
}
