import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import SettingsPanel from './SettingsPanel'
import { DEFAULT_SETTINGS } from '../storage'
import { yuePack } from '../lang/yue'
import { cmnPack } from '../lang/cmn'

describe('SettingsPanel romanization', () => {
  it('offers the Cantonese styles under the Cantonese pack', () => {
    render(<SettingsPanel settings={DEFAULT_SETTINGS} pack={yuePack} onChange={() => {}} />)
    const select = screen.getByLabelText(/romanization/i)
    expect([...select.querySelectorAll('option')].map((o) => o.value))
      .toEqual(['jyutping', 'yale'])
  })

  it('offers the Mandarin styles under the Mandarin pack', () => {
    render(<SettingsPanel settings={DEFAULT_SETTINGS} pack={cmnPack} onChange={() => {}} />)
    const select = screen.getByLabelText(/romanization/i)
    expect([...select.querySelectorAll('option')].map((o) => o.value))
      .toEqual(['tonemark', 'tonenum'])
  })

  it('changes only the active language and leaves the other alone', async () => {
    const onChange = vi.fn()
    render(<SettingsPanel settings={DEFAULT_SETTINGS} pack={yuePack} onChange={onChange} />)
    await userEvent.selectOptions(screen.getByLabelText(/romanization/i), 'yale')
    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({ romanization: { yue: 'yale', cmn: 'tonemark' } }),
    )
  })
})
