// Small text helpers that were copied screen by screen (docs/centralisation
// 04 L-10: twelve ordinal copies, four of them wrong past 20th). New code
// imports from here; phase two moves the old copies over.

/** 1st, 2nd, 3rd, 4th … 11th, 12th, 13th … 21st, 22nd, 23rd. */
export function ordinal(n: number): string {
  const s = ['th', 'st', 'nd', 'rd'], v = n % 100
  return `${n}${s[(v - 20) % 10] ?? s[v] ?? s[0]}`
}
