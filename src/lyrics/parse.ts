const TIME = /^\[(\d{1,2}):(\d{2})[.:](\d{2,3})\]/
const META = /^\[[a-z]{2,10}:.*\]$/i

export interface SourceLine {
  text: string
  timeMs?: number
}

/** Handles both LRCLIB `syncedLyrics`/`plainLyrics` and arbitrary pasted text. */
export function parseLyricText(text: string): SourceLine[] {
  const out: SourceLine[] = []
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim()
    if (!line || META.test(line)) continue

    const m = TIME.exec(line)
    let timeMs: number | undefined
    let body = line
    if (m) {
      const [, mm, ss, frac] = m
      const ms = frac.length === 3 ? Number(frac) : Number(frac) * 10
      timeMs = Number(mm) * 60_000 + Number(ss) * 1_000 + ms
      body = line.slice(m[0].length)

      // Some LRC sources stack several timestamp tags before one line of text
      // to mark the same lyric repeating at multiple times. We keep only the
      // first as this line's timeMs; without this loop the later tags would
      // leak into `body` as literal text.
      let extra: RegExpExecArray | null
      while ((extra = TIME.exec(body))) {
        body = body.slice(extra[0].length)
      }
    }

    body = body.replace(/　/g, ' ').trim()
    if (!body) continue
    out.push(timeMs === undefined ? { text: body } : { text: body, timeMs })
  }
  return out
}
