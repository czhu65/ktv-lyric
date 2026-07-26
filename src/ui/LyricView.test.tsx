import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, it, expect, vi } from 'vitest'
import LyricView from './LyricView'
import { createDict } from '../dict'
import { DEFAULT_SETTINGS } from '../storage'

// NOTE on 'coeng3' -> 'coeng1': the brief's fixture paired 唱 with tone 3 but
// asserted the Yale output 'chēung' (a macron). Real Yale (see
// src/romanize/yale.ts) only puts a diacritic on tones 1/2/4/5 — tone 3 is
// mid-level and unmarked, so toYale('coeng3') is legitimately 'cheung', not
// 'chēung'. Verified directly against the shipped toYale(). Tone 1 is the
// smallest change that makes the fixture internally consistent while keeping
// every other value from the brief verbatim.
const lines = [{
  tokens: [
    { chars: [{ char: '唱', syllables: ['coeng1'] }, { char: '歌', syllables: ['go1'] }] },
    { chars: [{ char: '，', syllables: [] }] },
  ],
}]
const dict = createDict({ '唱歌': 'to sing a song' })

const engine = () => ({
  unlock: vi.fn(async () => {}), has: (_s: string) => true, duration: () => 0.4,
  load: vi.fn(async () => null), prefetch: vi.fn(async () => {}), play: vi.fn(() => 0.4),
})

const setup = (over: Record<string, unknown> = {}) => {
  const e = engine()
  render(<LyricView lines={lines} dict={dict} engine={e} settings={DEFAULT_SETTINGS}
    activeLine={-1} activeChar={-1} onPlayLine={() => {}} {...over} />)
  return e
}

describe('LyricView', () => {
  it('renders jyutping above every Chinese character', () => {
    setup()
    expect(screen.getByText('coeng1')).toBeInTheDocument()
    expect(screen.getByText('go1')).toBeInTheDocument()
  })

  it('renders Yale when the setting says so', () => {
    setup({ settings: { ...DEFAULT_SETTINGS, romanization: 'yale' } })
    expect(screen.getByText('chēung')).toBeInTheDocument()
  })

  it('makes each Chinese character a button', () => {
    setup()
    expect(screen.getByRole('button', { name: /唱/ })).toBeInTheDocument()
  })

  it('does not make punctuation a button', () => {
    setup()
    expect(screen.queryByRole('button', { name: /，/ })).toBeNull()
  })

  it('plays the character audio on tap', async () => {
    const e = setup()
    await userEvent.click(screen.getByRole('button', { name: /唱/ }))
    expect(e.play).toHaveBeenCalledWith('coeng1')
  })

  it('opens the gloss for the enclosing TOKEN, not the character', async () => {
    setup()
    await userEvent.click(screen.getByRole('button', { name: /唱/ }))
    expect(await screen.findByText('to sing a song')).toBeInTheDocument()
  })

  it('unlocks the audio context on the first gesture', async () => {
    const e = setup()
    await userEvent.click(screen.getByRole('button', { name: /唱/ }))
    expect(e.unlock).toHaveBeenCalled()
  })

  it('marks the active character while playing', () => {
    setup({ activeLine: 0, activeChar: 1 })
    expect(screen.getByRole('button', { name: /歌/ })).toHaveAttribute('data-active', 'true')
  })

  it('gives every line its own play button', async () => {
    const onPlayLine = vi.fn()
    setup({ onPlayLine })
    await userEvent.click(screen.getByRole('button', { name: /play line 1/i }))
    expect(onPlayLine).toHaveBeenCalledWith(0)
  })

  it('marks a character whose syllable has no audio', () => {
    const e = engine()
    e.has = (s: string) => s !== 'go1'
    render(<LyricView lines={lines} dict={dict} engine={e} settings={DEFAULT_SETTINGS}
      activeLine={-1} activeChar={-1} onPlayLine={() => {}} />)
    expect(screen.getByRole('button', { name: /歌/ })).toHaveAttribute('data-noaudio', 'true')
    expect(screen.getByRole('button', { name: /唱/ })).not.toHaveAttribute('data-noaudio')
  })

  // --- Beyond the brief: checks requested in the task, not in the original spec ---

  it('renders a pure-punctuation line without crashing and without character buttons', () => {
    const punctLines = [{ tokens: [{ chars: [{ char: '…', syllables: [] }, { char: '！', syllables: [] }] }] }]
    render(<LyricView lines={punctLines} dict={dict} engine={engine()} settings={DEFAULT_SETTINGS}
      activeLine={-1} activeChar={-1} onPlayLine={() => {}} />)
    // Only the line's own play button should be a button; no character is.
    expect(screen.getAllByRole('button')).toHaveLength(1)
    expect(screen.getByText('…')).toBeInTheDocument()
    expect(screen.getByText('！')).toBeInTheDocument()
  })

  it('shows a graceful fallback when the tapped token has no dictionary entry', async () => {
    const noEntryLines = [{ tokens: [{ chars: [{ char: '氹', syllables: ['tam5'] }] }] }]
    render(<LyricView lines={noEntryLines} dict={dict} engine={engine()} settings={DEFAULT_SETTINGS}
      activeLine={-1} activeChar={-1} onPlayLine={() => {}} />)
    await userEvent.click(screen.getByRole('button', { name: /氹/ }))
    expect(await screen.findByText('No definition available')).toBeInTheDocument()
  })

  it('shows Yale romanization inside the popover too, not just the ruby text', async () => {
    setup({ settings: { ...DEFAULT_SETTINGS, romanization: 'yale' } })
    await userEvent.click(screen.getByRole('button', { name: /唱/ }))
    // The popover's own romanization row covers the whole token (both
    // syllables), so it is distinguishable from any single ruby annotation.
    expect(await screen.findByText('chēung gō')).toBeInTheDocument()
  })

  it('is fully reachable and operable by keyboard alone', async () => {
    const user = userEvent.setup()
    const onPlayLine = vi.fn()
    const e = setup({ onPlayLine })

    await user.tab()
    expect(screen.getByRole('button', { name: /play line 1/i })).toHaveFocus()
    await user.keyboard('{Enter}')
    expect(onPlayLine).toHaveBeenCalledWith(0)

    await user.tab()
    expect(screen.getByRole('button', { name: /唱/ })).toHaveFocus()
    await user.keyboard('{Enter}')
    expect(e.play).toHaveBeenCalledWith('coeng1')
    expect(await screen.findByText('to sing a song')).toBeInTheDocument()

    await user.tab()
    expect(screen.getByRole('button', { name: /歌/ })).toHaveFocus()

    // Punctuation ('，') is not a button, so it must not receive focus: the
    // very next stop is the popover's close button.
    await user.tab()
    expect(screen.getByRole('button', { name: /close/i })).toHaveFocus()
  })
})
