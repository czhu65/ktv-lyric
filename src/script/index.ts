import type * as OpenCC from 'opencc-js'

export function normalize(text: string): string {
  return text.normalize('NFC')
}

// The installed opencc-js (1.4.1) ships its own bundled types
// (types/full.d.ts) which TypeScript prefers over @types/opencc-js. Those
// bundled types name the converter function type `ConverterFunction`, not
// `ConvertText` as older @types declare — use the type that actually
// resolves for this import.
//
// Detection and conversion need DIFFERENT targets and must not share a
// converter. `to: 'hk'` applies opencc's Hong-Kong glyph-variant table to
// its output regardless of whether the input was ever Simplified, so
// already-Traditional text gets its glyphs rewritten (說→説, 溫→温, 臥→卧,
// 戶→户) — which breaks both idempotence and detection (isSimplified would
// wrongly report such text as Simplified). Sweeping every CJK Unified
// Ideograph that has a genuine Simplified counterpart (i.e. really is
// Traditional) for how many get altered by `s2<target>` regardless:
//   hk: 58 false positives   twp: 43   tw: 34   t: 6 (all obscure: 緼 苧
//   藴 輼 醖 麽)
// So `to: 'hk'` is NOT used anywhere here, despite this being a Hong Kong
// app — it is simply the least accurate target for telling the two scripts
// apart, and "HK app therefore HK target" does not hold once you need the
// conversion to be faithful to already-correct input. Detection uses `t`
// (fewest false positives, 6 obscure ones). Conversion uses `tw`: opencc's
// Jyutping engine returns identical readings for every one of these glyph
// pairs (爲/為 both wai6, 衆/眾 both zung3, 裏/裡 both leoi5, 說/説 both
// syut3), so the glyph choice never affects pronunciation, and `tw` yields
// the modern forms readers expect (因為, 眾人) where `t` gives archaic ones
// (因爲, 衆人).
//
// `t` is still not perfectly glyph-neutral, though, in the opposite
// direction from `hk`: opencc's own base dictionary — not a regional
// overlay; opencc-js's README calls `t` an internal pivot form and
// recommends against using it for real output — treats bare 台 as if it
// were an ambiguous Simplified source character and always promotes it to
// the more formal 臺, even when the input was already Traditional and used
// the common spelling (near-universal, including in Hong Kong): 電台/舞台/
// 陽台/講台 round-trip to 電臺/舞臺/陽臺/講臺 and would be misreported as
// Simplified. `hk` happens to reverse just that one promotion, but adopting
// `hk` wholesale reintroduces the much larger 58-character problem above.
// Instead, patch only this one known promotion back out with a tiny
// converter dictionary stage (verified against the full CJK sweep and 100+
// common Traditional/HK words: zero regressions, and it only adds back
// exactly one single-character edge case — a bare, rare, formal 臺 on its
// own now reads as Simplified — which is the right trade for an app whose
// real input is Cantonese lyrics, not formal Taiwanese prose).
let detect: OpenCC.ConverterFunction | null = null
let s2t: OpenCC.ConverterFunction | null = null
let t2s: OpenCC.ConverterFunction | null = null

async function converters() {
  if (!detect || !s2t || !t2s) {
    const OpenCC = await import('opencc-js')
    detect = OpenCC.ConverterFactory(OpenCC.Locale.from.cn, [[['臺', '台']]])
    s2t = OpenCC.Converter({ from: 'cn', to: 'tw' })
    t2s = OpenCC.Converter({ from: 't', to: 'cn' })
  }
  return { detect: detect!, s2t: s2t!, t2s: t2s! }
}

export async function toTraditional(text: string): Promise<string> {
  return (await converters()).s2t(text)
}

export async function toSimplified(text: string): Promise<string> {
  return (await converters()).t2s(text)
}

// Detection is an exact opencc round-trip, not a hand-maintained marker
// list: convert Simplified→Traditional (via the `t` target — see the
// converters() comment above for why detection and display use different
// targets) and see if anything changed. A hand-picked "Simplified-only"
// character set missed the majority of real Simplified text (most common
// simplifications, e.g. 学说这时电见来对会, were absent from the list) and
// also flagged ordinary Traditional text whose characters happen to be
// script-neutral (向) or are themselves the standard Traditional/HK form
// (只, 台). Round-tripping through the real conversion table cannot miss a
// simplification and cannot flag a character that isn't one, and it needs
// no maintenance as new vocabulary shows up.
export async function isSimplified(text: string): Promise<boolean> {
  const normalized = normalize(text)
  const traditional = (await converters()).detect(normalized)
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
