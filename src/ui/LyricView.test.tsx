import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, it, expect, vi } from 'vitest'
import LyricView from './LyricView'
import { renderCount as lyricLineRenderCount, resetRenderCount as resetLyricLineRenderCount } from './LyricLine'
import { createDict } from '../dict'
import { createAudioEngine } from '../audio'
import { DEFAULT_SETTINGS } from '../storage'
import { cmnPack } from '../lang/cmn'
import { yuePack } from '../lang/yue'

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
  unlock: vi.fn(async () => {}), preloadManifest: vi.fn(async () => {}),
  has: (_s: string) => true, duration: () => 0.4,
  load: vi.fn(async () => null), prefetch: vi.fn(async () => {}), play: vi.fn(() => 0.4),
  playSequence: vi.fn(),
})

const setup = (over: Record<string, unknown> = {}) => {
  const e = engine()
  render(<LyricView lines={lines} dict={dict} engine={e} settings={DEFAULT_SETTINGS} pack={yuePack}
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
    setup({ settings: { ...DEFAULT_SETTINGS, romanization: { ...DEFAULT_SETTINGS.romanization, yue: 'yale' } } })
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
    // Syllables of a tapped character are scheduled back-to-back via
    // playSequence, not fired individually via play() (see Finding 3: a
    // multi-syllable character must not overlap its own syllables).
    expect(e.playSequence).toHaveBeenCalledWith(['coeng1'])
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
    render(<LyricView lines={lines} dict={dict} engine={e} settings={DEFAULT_SETTINGS} pack={yuePack}
      activeLine={-1} activeChar={-1} onPlayLine={() => {}} />)
    expect(screen.getByRole('button', { name: /歌/ })).toHaveAttribute('data-noaudio', 'true')
    expect(screen.getByRole('button', { name: /唱/ })).not.toHaveAttribute('data-noaudio')
  })

  // --- Finding 2: every character used to render "no audio" before the
  // manifest had loaded. Every test above stubs `has: () => true`, which is
  // exactly why that bug was invisible here. ---

  it('shows no no-audio marker on any character when rendered with a real engine whose manifest has not resolved', () => {
    // A fetch that never resolves keeps the real engine's manifest at null
    // (genuinely "not yet known") for the lifetime of this synchronous test.
    vi.stubGlobal('fetch', vi.fn(() => new Promise(() => {})))
    const fakeCtx = {
      currentTime: 0,
      state: 'suspended' as AudioContextState,
      destination: {} as AudioDestinationNode,
      resume: vi.fn(async () => {}),
      decodeAudioData: vi.fn(async () => ({ duration: 0.4 }) as AudioBuffer),
      createBufferSource: vi.fn(() => ({ buffer: null, connect: vi.fn(), start: vi.fn(), stop: vi.fn() })),
    }
    const realEngine = createAudioEngine(fakeCtx as unknown as BaseAudioContext)

    render(<LyricView lines={lines} dict={dict} engine={realEngine} settings={DEFAULT_SETTINGS} pack={yuePack}
      activeLine={-1} activeChar={-1} onPlayLine={() => {}} />)

    expect(screen.getByRole('button', { name: /唱/ })).not.toHaveAttribute('data-noaudio')
    expect(screen.getByRole('button', { name: /歌/ })).not.toHaveAttribute('data-noaudio')
    vi.unstubAllGlobals()
  })

  it('settles to the real no-audio state once the manifest arrives (audioReady flips true)', () => {
    // Stubbed to report 'go1' as genuinely missing -- with audioReady still
    // false, the marker must not show yet, even though has() itself would
    // already answer accurately (it's a plain stub here, not the real
    // null-manifest engine). Once audioReady flips true, the same has()
    // answer must now be trusted and rendered.
    const e = engine()
    e.has = (s: string) => s !== 'go1'
    const { rerender } = render(
      <LyricView lines={lines} dict={dict} engine={e} settings={DEFAULT_SETTINGS} pack={yuePack}
        activeLine={-1} activeChar={-1} audioReady={false} onPlayLine={() => {}} />,
    )
    expect(screen.getByRole('button', { name: /歌/ })).not.toHaveAttribute('data-noaudio')

    rerender(
      <LyricView lines={lines} dict={dict} engine={e} settings={DEFAULT_SETTINGS} pack={yuePack}
        activeLine={-1} activeChar={-1} audioReady onPlayLine={() => {}} />,
    )
    expect(screen.getByRole('button', { name: /歌/ })).toHaveAttribute('data-noaudio', 'true')
  })

  // --- Beyond the brief: checks requested in the task, not in the original spec ---

  it('renders a pure-punctuation line without crashing and without character buttons', () => {
    const punctLines = [{ tokens: [{ chars: [{ char: '…', syllables: [] }, { char: '！', syllables: [] }] }] }]
    render(<LyricView lines={punctLines} dict={dict} engine={engine()} settings={DEFAULT_SETTINGS} pack={yuePack}
      activeLine={-1} activeChar={-1} onPlayLine={() => {}} />)
    // Only the line's own play button should be a button; no character is.
    expect(screen.getAllByRole('button')).toHaveLength(1)
    expect(screen.getByText('…')).toBeInTheDocument()
    expect(screen.getByText('！')).toBeInTheDocument()
  })

  it('shows a graceful fallback when the tapped token has no dictionary entry', async () => {
    const noEntryLines = [{ tokens: [{ chars: [{ char: '氹', syllables: ['tam5'] }] }] }]
    render(<LyricView lines={noEntryLines} dict={dict} engine={engine()} settings={DEFAULT_SETTINGS} pack={yuePack}
      activeLine={-1} activeChar={-1} onPlayLine={() => {}} />)
    await userEvent.click(screen.getByRole('button', { name: /氹/ }))
    expect(await screen.findByText('No definition available')).toBeInTheDocument()
  })

  it('shows Yale romanization inside the popover too, not just the ruby text', async () => {
    setup({ settings: { ...DEFAULT_SETTINGS, romanization: { ...DEFAULT_SETTINGS.romanization, yue: 'yale' } } })
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
    expect(e.playSequence).toHaveBeenCalledWith(['coeng1'])
    expect(await screen.findByText('to sing a song')).toBeInTheDocument()

    await user.tab()
    expect(screen.getByRole('button', { name: /歌/ })).toHaveFocus()

    // Punctuation ('，') is not a button, so it must not receive focus: the
    // very next stop is the popover's close button.
    await user.tab()
    expect(screen.getByRole('button', { name: /close/i })).toHaveFocus()
  })

  it('does not re-render a non-active line when activeChar moves within a different line', () => {
    // Two lines, each with its own Chinese character, so line 1's props are
    // fully independent of anything happening in line 0.
    const twoLines = [
      { tokens: [{ chars: [{ char: '甲', syllables: ['gaap3'] }, { char: '乙', syllables: ['jyut6'] }] }] },
      { tokens: [{ chars: [{ char: '丙', syllables: ['bing2'] }] }] },
    ]
    const e = engine()
    const onPlayLine = () => {}
    // Same references (e, onPlayLine, twoLines, DEFAULT_SETTINGS) on both
    // renders -- only activeChar differs -- so a genuinely unaffected line
    // has every reason to bail out via React.memo.
    const { rerender } = render(
      <LyricView lines={twoLines} dict={dict} engine={e} settings={DEFAULT_SETTINGS} pack={yuePack}
        activeLine={0} activeChar={0} onPlayLine={onPlayLine} />,
    )
    resetLyricLineRenderCount()

    rerender(
      <LyricView lines={twoLines} dict={dict} engine={e} settings={DEFAULT_SETTINGS} pack={yuePack}
        activeLine={0} activeChar={1} onPlayLine={onPlayLine} />,
    )

    // activeChar moved from 0 to 1, still inside line 0 -- line 0 legitimately
    // re-renders (its own activeCharInThisLine prop changed). Line 1's props
    // are byte-for-byte identical, so it must be skipped: exactly 1 render,
    // not 2. (Delete the React.memo wrap on LyricLine and this becomes 2.)
    expect(lyricLineRenderCount).toBe(1)
  })
})

describe('pack-driven rendering', () => {
  const settings = { ...DEFAULT_SETTINGS }

  it('renders Jyutping under the Cantonese pack', () => {
    const yueLines = [{ tokens: [{ chars: [{ char: '我', syllables: ['ngo5'] }] }] }]
    render(
      <LyricView
        lines={yueLines} dict={dict} engine={engine()} settings={settings}
        pack={yuePack} activeLine={-1} activeChar={-1} onPlayLine={() => {}}
      />,
    )
    expect(screen.getByText('ngo5')).toBeInTheDocument()
  })

  it('renders tone-marked pinyin under the Mandarin pack', () => {
    const cmnLines = [{ tokens: [{ chars: [{ char: '我', syllables: ['wo3'] }] }] }]
    render(
      <LyricView
        lines={cmnLines} dict={dict} engine={engine()} settings={settings}
        pack={cmnPack} activeLine={-1} activeChar={-1} onPlayLine={() => {}}
      />,
    )
    expect(screen.getByText('wǒ')).toBeInTheDocument()
  })

  it('honours the per-language style choice', () => {
    const yale = { ...DEFAULT_SETTINGS, romanization: { yue: 'yale', cmn: 'tonenum' } }
    const yueLines = [{ tokens: [{ chars: [{ char: '我', syllables: ['ngo5'] }] }] }]
    render(
      <LyricView
        lines={yueLines} dict={dict} engine={engine()} settings={yale}
        pack={yuePack} activeLine={-1} activeChar={-1} onPlayLine={() => {}}
      />,
    )
    expect(screen.getByText('ngóh')).toBeInTheDocument()
  })
})
