import { readFileSync } from 'node:fs'
import { pinyin } from 'pinyin-pro'

// Mirror of src/lang/pinyin-syllable.ts's normalizePinyinSyllable. Duplicated
// because build scripts are plain ESM with no TypeScript pipeline;
// src/lang/pinyin-syllable.test.ts asserts the two stay in agreement.
const TONED = /^([a-z]+)([0-5]?)$/

export function normalizeSyllable(raw) {
  const s = String(raw)
    .trim()
    .toLowerCase()
    .replace(/ü/g, 'v')
    .replace(/u:/g, 'v')
  if (!s) return null
  const m = TONED.exec(s)
  if (!m) return null
  const [, letters, digit] = m
  const tone = digit === '' || digit === '5' ? '0' : digit
  return `${letters}${tone}`
}

/**
 * The set of Mandarin syllables the app can ever need, derived rather than
 * assumed, plus a representative character for each -- the input an offline
 * TTS frontend (Piper) needs, since unlike Polly it cannot be told a phoneme
 * directly and instead derives the reading from characters.
 *
 * Every CJK character appearing in a dictionary headword is fed through
 * pinyin-pro and ALL of its readings are collected (`multiple: true`), not
 * just the contextual default: a character read one way inside a word may be
 * read another way alone, and the inventory must cover both or a tap on that
 * character produces silence.
 *
 * For each syllable a representative character is chosen, preferring one
 * with EXACTLY ONE distinct normalized reading -- any competent Chinese TTS
 * must read such a character correctly in isolation, since there is no other
 * way to read it. Falling back to a multi-reading character is only safe
 * when that character's own *default* (citation) reading is the syllable in
 * question; otherwise a synthesizer given the bare character in isolation
 * would produce the wrong syllable.
 *
 * Some syllables have no representative at all -- structurally, not for lack
 * of searching. A character in isolation reverts to its citation tone, so a
 * syllable that only ever occurs as a NEUTRAL-tone or CONTEXTUAL reading (one
 * that is never any character's default) has no single-character spelling.
 * `le0` (了, which reads `liao3` alone) is the canonical example. These are
 * reported as `unreachable` rather than silently dropped.
 *
 * pinyin-pro's `multiple: true` output can repeat the same reading in more
 * than one notation (e.g. numeric and tone-mark) for a single true reading --
 * normalize each entry with normalizeSyllable and dedupe via a Set BEFORE
 * counting distinct readings, or characters that are not actually polyphonic
 * will appear to be.
 */
export function derivePinyinInventory(dictPath) {
  const dict = JSON.parse(readFileSync(dictPath, 'utf8'))
  const chars = new Set()
  for (const key of Object.keys(dict)) {
    for (const ch of key) {
      if (/\p{Script=Han}/u.test(ch)) chars.add(ch)
    }
  }

  const syllables = new Set()
  const singleReadingReps = new Map() // syllable -> character, highest priority
  const defaultMatchReps = new Map() // syllable -> character, fallback

  for (const ch of [...chars].sort()) {
    const rawMultiple = pinyin(ch, { toneType: 'num', type: 'array', multiple: true })
    const readingsList = Array.isArray(rawMultiple) ? rawMultiple : [rawMultiple]

    // Normalize + dedupe BEFORE counting distinct readings -- see the
    // "polyphonic" warning in the doc comment above.
    const normalizedReadings = new Set()
    for (const r of readingsList) {
      const syl = normalizeSyllable(r)
      if (syl) {
        normalizedReadings.add(syl)
        syllables.add(syl)
      }
    }
    if (normalizedReadings.size === 0) continue

    if (normalizedReadings.size === 1) {
      const [only] = normalizedReadings
      if (!singleReadingReps.has(only)) singleReadingReps.set(only, ch)
      continue
    }

    // Multi-reading character: only a fallback candidate, and only for the
    // syllable that matches its OWN default (citation) reading.
    const rawDefault = pinyin(ch, { toneType: 'num', type: 'array' })
    const defaultList = Array.isArray(rawDefault) ? rawDefault : [rawDefault]
    const defaultSyl = normalizeSyllable(defaultList[0])
    if (defaultSyl && normalizedReadings.has(defaultSyl) && !defaultMatchReps.has(defaultSyl)) {
      defaultMatchReps.set(defaultSyl, ch)
    }
  }

  const sortedSyllables = [...syllables].sort()
  const representatives = {}
  const unreachable = []
  for (const syl of sortedSyllables) {
    if (singleReadingReps.has(syl)) representatives[syl] = singleReadingReps.get(syl)
    else if (defaultMatchReps.has(syl)) representatives[syl] = defaultMatchReps.get(syl)
    else unreachable.push(syl)
  }

  return { syllables: sortedSyllables, representatives, unreachable: unreachable.sort() }
}
