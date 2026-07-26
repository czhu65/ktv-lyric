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

    // Some LRC sources stack several timestamp tags before one line of text
    // to mark the same lyric repeating at multiple times (e.g. a chorus).
    // Collect every leading tag and emit one entry per timestamp, all
    // sharing the same text, in the order the tags appeared. Re-trimming
    // `body` between iterations lets this consume tags separated by
    // whitespace, not just tags butted directly against each other.
    const times: number[] = []
    let body = line
    let m: RegExpExecArray | null
    while ((m = TIME.exec(body))) {
      const [, mm, ss, frac] = m
      const ms = frac.length === 3 ? Number(frac) : Number(frac) * 10
      times.push(Number(mm) * 60_000 + Number(ss) * 1_000 + ms)
      body = body.slice(m[0].length).trim()
    }

    body = body.replace(/　/g, ' ').trim()
    if (!body) continue

    if (times.length === 0) {
      out.push({ text: body })
    } else {
      for (const timeMs of times) out.push({ text: body, timeMs })
    }
  }
  return out
}
