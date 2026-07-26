import type * as OpenCC from 'opencc-js'

// A small set of high-frequency Simplified-only characters. Detection must
// not require loading opencc — that chunk is ~440 KB gzip and is only pulled
// in when a conversion is actually needed.
const SIMPLIFIED_ONLY = new Set(
  '为个们东乐么义乌书买乱争于亏云亚产亲亿仅从仑仓仪们价众优会伟传伤伦体余佣',
)
// Note: 奕 is deliberately excluded — it is identical in Simplified and
// Traditional (not a simplification pair), so including it caused false
// positives on genuine Traditional text such as 陳奕迅.
const SIMPLIFIED_ONLY_2 = new Set(
  '夸陈华丽单卖医参双发变叠只台叶号叹后向吗听启园国图圣场坏块坚报壶备够头',
)

export function normalize(text: string): string {
  return text.normalize('NFC')
}

export function isSimplified(text: string): boolean {
  for (const ch of text) {
    if (SIMPLIFIED_ONLY.has(ch) || SIMPLIFIED_ONLY_2.has(ch)) return true
  }
  return false
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
  return { s2t, t2s }
}

export async function toTraditional(text: string): Promise<string> {
  return (await converters()).s2t!(text)
}

export async function toSimplified(text: string): Promise<string> {
  return (await converters()).t2s!(text)
}

// LRCLIB performs NO query-time script folding: 浮誇 and 浮夸 return zero
// shared results out of twenty. Every search must issue both variants.
export async function scriptVariants(query: string): Promise<string[]> {
  const q = normalize(query)
  const other = isSimplified(q) ? await toTraditional(q) : await toSimplified(q)
  return other === q ? [q] : [q, other]
}
