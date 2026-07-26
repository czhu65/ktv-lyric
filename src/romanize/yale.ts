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
  if (!m) return jyutping
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
