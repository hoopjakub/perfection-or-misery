// Phase 9.75 (P9.75-18) · The engine computes the same on every JS engine:
//   npx tsx scripts/verify-portable.ts
//
// The phone (Hermes) and the web (V8) gave different match sheets for the same
// seed, twice: first the inexact Math functions, then a random draw inside a
// sort's comparator. Hermes can't run here, so this imitates the ways an
// engine is allowed to differ and checks the fingerprint doesn't move:
//  · another correct, stable sort algorithm (a merge sort, then an insertion
//    sort: different comparisons, in a different order, from V8's TimSort);
//  · Math's pow, exp, log, sin, cos, tan, tanh, atan, atan2, hypot, cbrt, each
//    one bit off (the standard leaves them approximate);
//  · localeCompare ordering things its own way.
// Fails if any of these changes a single seed's sheet (raw or shown).
import { computeFingerprint } from '../src/diag/fingerprint'

let failures = 0
const check = (ok: boolean, msg: string) => { if (!ok) { failures++; console.log(`❌ ${msg}`) } }

const base = computeFingerprint()
const same = (fp: ReturnType<typeof computeFingerprint>) =>
  fp.raw.every((h, i) => h === base.raw[i]) && fp.shown.every((h, i) => h === base.shown[i])
const firstDiff = (fp: ReturnType<typeof computeFingerprint>) => fp.raw.findIndex((h, i) => h !== base.raw[i]) + 1

type Cmp = (a: any, b: any) => number
const defaultCmp: Cmp = (a, b) => { const x = String(a), y = String(b); return x < y ? -1 : x > y ? 1 : 0 }
function withSort(sorter: (a: any[], cmp: Cmp) => void, label: string) {
  const native = Array.prototype.sort
  // eslint-disable-next-line no-extend-native
  Array.prototype.sort = function (this: any[], cmp?: Cmp) {
    const c = cmp ?? defaultCmp
    const holes = this.filter(x => x === undefined).length
    const vals = this.filter(x => x !== undefined)
    sorter(vals, c)
    for (let i = 0; i < vals.length; i++) this[i] = vals[i]
    for (let i = vals.length; i < vals.length + holes; i++) this[i] = undefined
    return this
  } as any
  try {
    const fp = computeFingerprint()
    check(same(fp), `the fingerprint moves under ${label} (seed ${firstDiff(fp)} first)`)
  } finally { Array.prototype.sort = native }
}

function mergeSort(a: any[], cmp: Cmp) {
  if (a.length < 2) return
  const mid = a.length >> 1
  const l = a.slice(0, mid), r = a.slice(mid)
  mergeSort(l, cmp); mergeSort(r, cmp)
  let i = 0, j = 0, k = 0
  while (i < l.length && j < r.length) a[k++] = cmp(r[j], l[i]) < 0 ? r[j++] : l[i++]
  while (i < l.length) a[k++] = l[i++]
  while (j < r.length) a[k++] = r[j++]
}
function insertionSort(a: any[], cmp: Cmp) {
  for (let i = 1; i < a.length; i++) {
    const x = a[i]; let j = i - 1
    while (j >= 0 && cmp(a[j], x) > 0) { a[j + 1] = a[j]; j-- }
    a[j + 1] = x
  }
}
withSort(mergeSort, 'a merge sort')
withSort(insertionSort, 'an insertion sort')

// Inexact maths, one bit off.
{
  const names = ['pow', 'exp', 'log', 'sin', 'cos', 'tan', 'tanh', 'atan', 'atan2', 'hypot', 'cbrt', 'log10', 'log2', 'expm1', 'log1p'] as const
  const saved = names.map(n => (Math as any)[n])
  names.forEach((n, k) => { (Math as any)[n] = (...a: number[]) => saved[k](...a) * (1 + 2 ** -52) })
  try {
    const fp = computeFingerprint()
    check(same(fp), `the fingerprint moves when Math's inexact functions are a bit off (seed ${firstDiff(fp)} first)`)
  } finally { names.forEach((n, k) => { (Math as any)[n] = saved[k] }) }
}

// localeCompare with its own idea of order.
{
  const native = String.prototype.localeCompare
  // eslint-disable-next-line no-extend-native
  String.prototype.localeCompare = function (this: string, other: string) { return this < other ? 1 : this > other ? -1 : 0 } as any
  try {
    const fp = computeFingerprint()
    check(same(fp), `the fingerprint moves when localeCompare orders differently (seed ${firstDiff(fp)} first)`)
  } finally { String.prototype.localeCompare = native }
}

console.log(`${base.raw.length} seeds, each under 4 engine variations`)
console.log(failures === 0 ? '✅ ALL CHECKS PASSED' : `${failures} check(s) failed`)
process.exit(failures === 0 ? 0 : 1)
