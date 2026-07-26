// CC-CEDICT / CC-Canto share the format:
//   TRAD SIMP [pinyin] {jyutping}? /gloss/gloss/
// Slashes can appear inside {} — match the braces before splitting on '/'.
// CC-Canto lines may also carry a trailing '#' comment after the closing '/'
// (e.g. "# adapted from cc-cedict"); allow and discard it.
const LINE = /^(\S+)\s+(\S+)\s+\[([^\]]*)\]\s*(?:\{([^}]*)\})?\s*\/(.*)\/\s*(?:#.*)?$/

const NOISE = [/^CL:/, /^Mandarin equivalent:/, /^variant of /, /^see /, /^old variant of /]

export function parseLine(line) {
  if (!line || line.startsWith('#') || line.startsWith('%')) return null
  const m = LINE.exec(line.trim())
  if (!m) return null
  const [, trad, simp, pinyin, jyutping, rest] = m
  return {
    trad,
    simp,
    pinyin,
    jyutping: jyutping ?? null,
    glosses: rest.split('/').filter(Boolean),
  }
}

export function cleanGloss(glosses, max = 40) {
  const kept = glosses.filter((g) => !NOISE.some((re) => re.test(g)))
  if (kept.length === 0) return null
  let out = kept[0].trim()
  if (out.length <= max) return out
  const cut = out.slice(0, max)
  const sp = cut.lastIndexOf(' ')
  return (sp > max * 0.5 ? cut.slice(0, sp) : cut).trim()
}
