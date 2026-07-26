import { useEffect, useState } from 'react'
import type { SongCandidate } from '../types'

interface Props {
  onSearch(q: string): void
  onPick(c: SongCandidate): void
  results: SongCandidate[]
  busy: boolean
}

export default function SearchBar({ onSearch, onPick, results, busy }: Props) {
  const [q, setQ] = useState('')

  // 400ms debounce: iTunes Search enforces roughly 20 requests per minute.
  useEffect(() => {
    if (!q.trim()) return
    const t = setTimeout(() => onSearch(q.trim()), 400)
    return () => clearTimeout(t)
  }, [q, onSearch])

  return (
    <div className="search">
      <input
        type="search"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="歌名 — 繁體或簡體皆可 / song title, Traditional or Simplified"
        aria-label="Song title"
      />
      {busy && <p role="status">Searching…</p>}
      <ul className="results">
        {results.map((c, i) => (
          <li key={i}>
            <button onClick={() => onPick(c)}>
              <strong>{c.title}</strong> — {c.artist}
            </button>
          </li>
        ))}
      </ul>
    </div>
  )
}
