import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import LangToggle from './LangToggle'

describe('LangToggle', () => {
  it('marks the active language pressed', () => {
    render(<LangToggle value="yue" busy={false} onChange={() => {}} />)
    expect(screen.getByRole('button', { name: /粵語/ })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('button', { name: /普通話/ })).toHaveAttribute('aria-pressed', 'false')
  })

  it('reports a change', async () => {
    const onChange = vi.fn()
    render(<LangToggle value="yue" busy={false} onChange={onChange} />)
    await userEvent.click(screen.getByRole('button', { name: /普通話/ }))
    expect(onChange).toHaveBeenCalledWith('cmn')
  })

  it('does not fire when the active language is clicked again', async () => {
    const onChange = vi.fn()
    render(<LangToggle value="yue" busy={false} onChange={onChange} />)
    await userEvent.click(screen.getByRole('button', { name: /粵語/ }))
    expect(onChange).not.toHaveBeenCalled()
  })

  it('disables both buttons while a pack is loading', () => {
    render(<LangToggle value="yue" busy onChange={() => {}} />)
    expect(screen.getByRole('button', { name: /粵語/ })).toBeDisabled()
    expect(screen.getByRole('button', { name: /普通話/ })).toBeDisabled()
  })
})
