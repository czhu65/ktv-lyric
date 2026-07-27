// The canonical Mandarin syllable key: /^[a-z]+[0-4]$/, neutral tone = 0.
//
// This single string is used three ways and they must not drift apart:
//   - the audio filename           public/audio/pin/wo3.mp3
//   - the manifest entry           public/data/pinyin.json
//   - the Polly synthesis input    <phoneme alphabet="x-amazon-pinyin" ph="wo3">
// Amazon's x-amazon-pinyin alphabet uses tones 0-4 with 0 for neutral, so
// aligning on Polly's convention removes a translation layer at build time.
//
// pinyin-pro is the only producer of the raw input, but which digit IT uses
// for neutral tone is version-dependent (5 in some releases, absent in
// others), so both are accepted and folded to 0 here rather than at the call
// site. Tone 5 as a DISTINCT tone does not exist in Mandarin -- unlike
// Cantonese, where 5 is a real tone -- so this fold is unambiguous.
const TONED = /^([a-z]+)([0-5]?)$/

export function normalizePinyinSyllable(raw: string): string | null {
  const s = raw
    .trim()
    .toLowerCase()
    // ü appears as ü, u:, or v depending on the producer. Polly wants v.
    .replace(/ü/g, 'v')
    .replace(/u:/g, 'v')
  if (!s) return null

  const m = TONED.exec(s)
  if (!m) return null

  const [, letters, digit] = m
  // '' (no digit) and '5' both mean neutral -> 0.
  const tone = digit === '' || digit === '5' ? '0' : digit
  return `${letters}${tone}`
}
