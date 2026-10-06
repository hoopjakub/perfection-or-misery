// Small text helpers that were copied screen by screen (docs/centralisation
// 04 L-10: twelve ordinal copies, four of them wrong past 20th). New code
// imports from here; phase two moves the old copies over.

import { LANGUAGE } from '@/i18n'

/** 1st, 2nd, 3rd, 4th … 11th, 12th, 13th … 21st, 22nd, 23rd. In Slovak a
 *  number with a full stop, "21." (P8.5-28). */
export function ordinal(n: number): string {
  if (LANGUAGE === 'sk') return `${n}.`
  const s = ['th', 'st', 'nd', 'rd'], v = n % 100
  return `${n}${s[(v - 20) % 10] ?? s[v] ?? s[0]}`
}

// Lower-case particles that belong to the surname (docs/centralisation 04 L-11:
// four copies took the last word, so "Virgil van Dijk" became "Dijk").
const PARTICLES = new Set(['van', 'von', 'de', 'der', 'den', 'da', 'di', 'del', 'della', 'dos', 'du', 'la', 'le', 'ter', 'ten', 'af', 'al', 'el', 'bin', 'ibn'])

/** The name on the shirt: the last word, with any particles before it ("van Dijk", "de Ligt"). */
export function surname(name: string): string {
  const w = name.trim().split(/\s+/)
  let i = w.length - 1
  while (i > 0 && PARTICLES.has(w[i - 1].toLowerCase())) i--
  return w.slice(i).join(' ')
}
