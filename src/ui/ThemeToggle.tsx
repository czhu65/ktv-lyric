import { useEffect } from 'react'
import type { Theme } from '../storage'
import { SunIcon, MoonIcon } from './icons'

/**
 * Applies the theme to <html> and offers a one-tap toggle.
 *
 * Three stored states but a two-state control: 'system' follows the OS, and
 * tapping resolves it to whichever explicit theme is the opposite of what you
 * are currently seeing. That keeps the header to a single button while still
 * letting the OS drive until you actually disagree with it.
 */
export function useAppliedTheme(theme: Theme): 'light' | 'dark' {
  const systemDark =
    typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-color-scheme: dark)').matches

  const applied: 'light' | 'dark' = theme === 'system' ? (systemDark ? 'dark' : 'light') : theme

  useEffect(() => {
    const root = document.documentElement
    // On 'system' the attribute is removed entirely, so the stylesheet's
    // prefers-color-scheme block takes over and keeps tracking the OS live —
    // pinning an explicit value here would freeze it at load time.
    if (theme === 'system') root.removeAttribute('data-theme')
    else root.setAttribute('data-theme', theme)
  }, [theme])

  return applied
}

export default function ThemeToggle(
  { theme, onChange }: { theme: Theme; onChange(t: Theme): void },
) {
  const applied = useAppliedTheme(theme)
  const next = applied === 'dark' ? 'light' : 'dark'

  return (
    <button
      type="button"
      className="icon-btn"
      onClick={() => onChange(next)}
      aria-label={`Switch to ${next} theme`}
      title={`Switch to ${next} theme`}
    >
      {applied === 'dark' ? <SunIcon /> : <MoonIcon />}
    </button>
  )
}
