import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, it, expect, vi } from 'vitest'
import SearchBar from './SearchBar'

describe('SearchBar', () => {
  it('debounces and reports the query once', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    const onSearch = vi.fn()
    render(<SearchBar onSearch={onSearch} results={[]} onPick={() => {}} busy={false} />)
    await userEvent.type(screen.getByRole('searchbox'), '唱歌')
    expect(onSearch).not.toHaveBeenCalled()
    vi.advanceTimersByTime(400)
    await waitFor(() => expect(onSearch).toHaveBeenCalledExactlyOnceWith('唱歌'))
    vi.useRealTimers()
  })

  it('lists results with title and artist', () => {
    render(<SearchBar onSearch={() => {}} busy={false} onPick={() => {}}
      results={[{ title: 'T', artist: 'A' }]} />)
    expect(screen.getByRole('button', { name: /T.*A/ })).toBeInTheDocument()
  })

  it('accepts Simplified input without complaint', async () => {
    const onSearch = vi.fn()
    render(<SearchBar onSearch={onSearch} results={[]} onPick={() => {}} busy={false} />)
    await userEvent.type(screen.getByRole('searchbox'), '浮夸')
    expect(screen.getByRole('searchbox')).toHaveValue('浮夸')
  })
})
