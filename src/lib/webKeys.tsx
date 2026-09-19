import { useEffect, useRef } from 'react'
import { Platform } from 'react-native'
import { router } from 'expo-router'

// Web keyboard shortcuts (docs/ui-overhaul/10-ADAPT-OPTIMIZE-A11Y.md §2.3).
// Native has no keyboard to speak of, so all of this is a no-op off web.
// A key typed into a field is text, never a shortcut.
const typing = (e: KeyboardEvent) => {
  const el = e.target as HTMLElement | null
  return !!el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable)
}

/**
 * Esc = back, everywhere. Installed once from the root layout. Screens that
 * must not be left by accident (a live run) already guard their back action
 * with useSimBackGuard, which catches this the same way it catches the
 * hardware back button, so Esc opens the abandon screen there instead.
 */
export function installEscBack() {
  if (Platform.OS !== 'web' || typeof window === 'undefined') return
  window.addEventListener('keydown', e => {
    if (e.key !== 'Escape' || typing(e) || e.defaultPrevented) return
    if (router.canGoBack()) router.back()
  })
}

/** A screen's own keys, active while it's mounted. `onKey` gets `e.key`. */
export function WebKeys({ onKey }: { onKey: (key: string) => void }) {
  const cb = useRef(onKey)
  cb.current = onKey
  useEffect(() => {
    if (Platform.OS !== 'web' || typeof window === 'undefined') return
    const h = (e: KeyboardEvent) => {
      if (typing(e) || e.metaKey || e.ctrlKey || e.altKey) return
      cb.current(e.key)
    }
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [])
  return null
}
