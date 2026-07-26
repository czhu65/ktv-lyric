// Jyutping -> Yale. Tones 4/5/6 insert an 'h' after the vowel nucleus;
// tones 1/2/4/5 add a diacritic to the first vowel letter.
const SYLLABLE = /^([a-z]*?)([aeiouy][a-z]*?)([ptkmn]|ng)?([1-6])$/

const DIACRITIC: Record<string, Record<string, string>> = {
  a: { 1: 'ā', 2: 'á', 4: 'à', 5: 'á' },
  e: { 1: 'ē', 2: 'é', 4: 'è', 5: 'é' },
  i: { 1: 'ī', 2: 'í', 4: 'ì', 5: 'í' },
  o: { 1: 'ō', 2: 'ó', 4: 'ò', 5: 'ó' },
  u: { 1: 'ū', 2: 'ú', 4: 'ù', 5: 'ú' },
}

// Syllabic nasals (m, ng, and their h-prefixed interjection forms hm, hng)
// have no vowel, so SYLLABLE above never matches them -- e.g. 唔 (m4), the
// Cantonese negation particle, would otherwise render with a leaking tone
// digit. They get their own regex and diacritic table, with the diacritic
// placed on the first letter of the nasal itself (n in "ng", m in "m").
const NASAL_SYLLABLE = /^(h?)(m|ng)([1-6])$/

const NASAL_DIACRITIC: Record<string, string> = {
  1: String.fromCodePoint(0x0304), // combining macron
  2: String.fromCodePoint(0x0301), // combining acute
  3: '',
  4: String.fromCodePoint(0x0300), // combining grave
  5: String.fromCodePoint(0x0301), // combining acute
  6: '',
}

function mapInitial(i: string): string {
  if (i === 'z') return 'j'
  if (i === 'c') return 'ch'
  if (i === 'j') return 'y'
  return i
}

function mapFinal(f: string): string {
  return f.replace(/^yu/, 'yu').replace(/eo/g, 'eu').replace(/oe/g, 'eu')
}

export function toYale(jyutping: string): string {
  const m = SYLLABLE.exec(jyutping)
  if (!m) {
    const nasal = NASAL_SYLLABLE.exec(jyutping)
    if (!nasal) return jyutping
    const [, h, nucleus, tone] = nasal
    const diacritic = NASAL_DIACRITIC[tone]
    const trailingH = tone === '4' || tone === '5' || tone === '6' ? 'h' : ''
    return h + nucleus[0] + diacritic + nucleus.slice(1) + trailingH
  }
  const [, rawInitial, rawFinal, coda = '', tone] = m

  let initial = mapInitial(rawInitial)
  let final = mapFinal(rawFinal)

  // jyutping "jyu" -> yale "yu": the initial j became y, so drop the doubled y.
  if (initial === 'y' && final.startsWith('yu')) final = final.slice(1)

  const vowelIndex = [...final].findIndex((c) => 'aeiou'.includes(c))
  if (vowelIndex >= 0 && DIACRITIC[final[vowelIndex]]?.[tone]) {
    final =
      final.slice(0, vowelIndex) +
      DIACRITIC[final[vowelIndex]][tone] +
      final.slice(vowelIndex + 1)
  }

  const h = tone === '4' || tone === '5' || tone === '6' ? 'h' : ''
  return initial + final + h + coda
}
