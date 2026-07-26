import type * as OpenCC from 'opencc-js'

export function normalize(text: string): string {
  return text.normalize('NFC')
}

// The installed opencc-js (1.4.1) ships its own bundled types
// (types/full.d.ts) which TypeScript prefers over @types/opencc-js. Those
// bundled types name the converter function type `ConverterFunction`, not
// `ConvertText` as older @types declare — use the type that actually
// resolves for this import.
let s2t: OpenCC.ConverterFunction | null = null
let t2s: OpenCC.ConverterFunction | null = null

async function converters() {
  if (!s2t || !t2s) {
    const OpenCC = await import('opencc-js')
    s2t = OpenCC.Converter({ from: 'cn', to: 'hk' })
    t2s = OpenCC.Converter({ from: 'hk', to: 'cn' })
  }
  return { s2t: s2t!, t2s: t2s! }
}

export async function toTraditional(text: string): Promise<string> {
  return (await converters()).s2t(text)
}

export async function toSimplified(text: string): Promise<string> {
  return (await converters()).t2s(text)
}

// Detection is an exact opencc round-trip, not a hand-maintained marker
// list: convert Simplified→Traditional and see if anything changed. A
// hand-picked "Simplified-only" character set missed the majority of real
// Simplified text (most common simplifications, e.g. 学说这时电见来对会,
// were absent from the list) and also flagged ordinary Traditional text
// whose characters happen to be script-neutral (向) or are themselves the
// standard Traditional/HK form (只, 台). Round-tripping through the real
// conversion table cannot miss a simplification and cannot flag a character
// that isn't one, and it needs no maintenance as new vocabulary shows up.
export async function isSimplified(text: string): Promise<boolean> {
  const normalized = normalize(text)
  const traditional = await toTraditional(normalized)
  return traditional !== normalized
}

// LRCLIB performs NO query-time script folding: 浮誇 and 浮夸 return zero
// shared results out of twenty. Every search must issue both variants.
export async function scriptVariants(query: string): Promise<string[]> {
  const q = normalize(query)
  const traditional = await toTraditional(q)
  if (traditional !== q) return [q, traditional]
  const simplified = await toSimplified(q)
  return simplified === q ? [q] : [q, simplified]
}
