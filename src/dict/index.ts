export interface Dict {
  lookup(word: string): string | null
  keys(): ReadonlySet<string>
  maxKeyLength: number
}

export function createDict(raw: Record<string, string>): Dict {
  const keys = new Set(Object.keys(raw))
  let maxKeyLength = 0
  for (const k of keys) if (k.length > maxKeyLength) maxKeyLength = k.length

  return {
    keys: () => keys,
    maxKeyLength,
    lookup(word) {
      const direct = raw[word]
      if (direct) return direct
      // ~1.2% of tokens have no entry. Decompose rather than showing nothing.
      const parts: string[] = []
      for (const ch of word) {
        const g = raw[ch]
        if (g) parts.push(`${ch} ${g}`)
      }
      return parts.length ? parts.join(' · ') : null
    },
  }
}

let cached: Promise<Dict> | null = null

export function loadDict(): Promise<Dict> {
  // The dictionary is a separate CC BY-SA file fetched at runtime, never
  // inlined into the JS bundle — ShareAlike binds the data, not the code.
  cached ??= fetch(`${import.meta.env.BASE_URL}data/dict.json`)
    .then((r) => {
      if (!r.ok) throw new Error(`dict.json -> HTTP ${r.status}`)
      return r.json()
    })
    .then(createDict)
    .catch((err) => {
      // Don't memoise a rejection: a transient network blip would otherwise
      // permanently break word lookup for the rest of the session.
      cached = null
      throw err
    })
  return cached
}
