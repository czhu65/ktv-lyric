import { useEffect, useState } from 'react'
import type { SongCandidate } from '../types'
import { SearchIcon } from './icons'

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
      <div className="search-field">
        <SearchIcon />
        <input
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="搜尋歌名 · Search a song title"
          aria-label="Song title"
        />
      </div>

      {busy && <p className="search-status" role="status">Searching…</p>}

      {results.length > 0 && (
        <ul className="results">
          {results.map((c, i) => (
            <li key={i}>
              <button type="button" onClick={() => onPick(c)}>
                <strong>{c.title}</strong>
                <span className="artist">{c.artist}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
