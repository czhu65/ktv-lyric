import { render, screen } from '@testing-library/react'
import { describe, it, expect } from 'vitest'
import GlossPopover from './GlossPopover'
import type { Token } from '../types'

const token: Token = { chars: [{ char: '甲', syllables: ['gaap3'] }] }

describe('GlossPopover', () => {
  it('announces the word and its definition via an aria-live region, without moving focus', () => {
    render(
      <GlossPopover token={token} gloss="first; armor" romanization="gaap3" onClose={() => {}} />,
    )

    // Auto-focus would repeatedly yank a screen-reader user out of the
    // lyric (the popover opens on every tap), so this must announce via a
    // live region instead of grabbing focus.
    const live = document.querySelector('[aria-live]')
    expect(live).not.toBeNull()
    expect(live).toHaveTextContent('甲')
    expect(live).toHaveTextContent('first; armor')

    expect(document.activeElement).not.toBe(screen.getByRole('dialog'))
    expect(document.activeElement).not.toBe(screen.getByRole('button', { name: /close/i }))
  })
})
