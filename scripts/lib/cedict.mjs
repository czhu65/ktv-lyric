// CC-CEDICT / CC-Canto share the format:
//   TRAD SIMP [pinyin] {jyutping}? /gloss/gloss/
// Slashes can appear inside {} — match the braces before splitting on '/'.
// CC-Canto lines may also carry a trailing '#' comment after the closing '/'
// (e.g. "# adapted from cc-cedict"); allow and discard it.
const LINE = /^(\S+)\s+(\S+)\s+\[([^\]]*)\]\s*(?:\{([^}]*)\})?\s*\/(.*)\/\s*(?:#.*)?$/

const NOISE = [
  /^CL:/, /^Mandarin equivalent:/, /^variant of /, /^see /, /^old variant of /,
  /^surname /, /^used in /, /^abbr\. for /, /^\(bound form\)$/,
]

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
  // CC-Canto packs numbered senses into one segment:
  //   "(noun) 1. seminar; 2. meeting; 3."
  // Keep the part-of-speech tag, then the FIRST sense only.
  // A real sense enumerator is always followed by whitespace ("1. seminar");
  // a decimal point never is ("2.5 times"). Require \s+ after the period so
  // decimals aren't mistaken for enumerators and silently mangled.
  const m = /^(\([^)]*\)\s*)?(\d+)\.\s+(.+)$/.exec(out)
  if (m) out = (m[1] ?? '') + m[3].split(/\s*\d+\.\s+/)[0]
  out = out.replace(/[;,]\s*$/, '').trim()
  if (out.length > max) {
    const cut = out.slice(0, max)
    const sp = cut.lastIndexOf(' ')
    out = (sp > max * 0.5 ? cut.slice(0, sp) : cut).replace(/[;,(]\s*$/, '').trim()
  }
  return out || null
}
