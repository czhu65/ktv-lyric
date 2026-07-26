import { render, screen } from '@testing-library/react'
import { describe, it, expect } from 'vitest'
import App from './App'

describe('App', () => {
  it('renders the search box on first load', () => {
    render(<App />)
    expect(screen.getByRole('searchbox')).toBeInTheDocument()
  })

  it('always offers the paste fallback — LRCLIB misses 20-40% of modern HK songs', () => {
    render(<App />)
    expect(screen.getByRole('button', { name: /paste/i })).toBeInTheDocument()
  })
})
