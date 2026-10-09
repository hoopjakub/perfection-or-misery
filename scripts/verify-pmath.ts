// Phase 9.75 (P9.75-18) · The portable maths is accurate, and it's all the engine uses:
//   npx tsx scripts/verify-pmath.ts
// Fails on:
//  · a result more than 1e-13 (relative, or absolute near zero) from Math's,
//    over the ranges the engine feeds it and well beyond;
//  · src/lib/pmath.ts calling anything but Math.round, abs, floor, sqrt or PI
//    (the ones IEEE 754 makes the same in every engine).
// That the engine calls pmath and not Math is verify-diag rule 2h.
import fs from 'fs'
import path from 'path'
import { pexp, plog, ppow, psin, ptanh, patan2, phypot } from '../src/lib/pmath'
import { mulberry32 } from '../src/lib/rng'

let failures = 0, checks = 0
const check = (ok: boolean, msg: string) => { checks++; if (!ok) { failures++; if (failures <= 15) console.log(`❌ ${msg}`) } }
const near = (a: number, b: number) => a === b || Math.abs(a - b) <= 1e-13 * Math.max(1, Math.abs(b))

const rng = mulberry32(20261008)
const between = (lo: number, hi: number) => lo + (hi - lo) * rng()
for (let i = 0; i < 20000; i++) {
  const x = between(-50, 50)
  check(near(pexp(x), Math.exp(x)), `exp(${x}) = ${pexp(x)}, Math says ${Math.exp(x)}`)
  const p = between(1e-6, 1e6)
  check(near(plog(p), Math.log(p)), `log(${p}) = ${plog(p)}, Math says ${Math.log(p)}`)
  const b = between(0, 5), e = between(-3, 3)
  check(near(ppow(b, e), Math.pow(b, e)), `pow(${b}, ${e}) = ${ppow(b, e)}, Math says ${Math.pow(b, e)}`)
  const s = between(-20, 20)
  check(near(psin(s), Math.sin(s)), `sin(${s}) = ${psin(s)}, Math says ${Math.sin(s)}`)
  const h = between(-25, 25)
  check(near(ptanh(h), Math.tanh(h)), `tanh(${h}) = ${ptanh(h)}, Math says ${Math.tanh(h)}`)
  const yy = between(-100, 100), xx = between(-100, 100)
  check(near(patan2(yy, xx), Math.atan2(yy, xx)), `atan2(${yy}, ${xx}) = ${patan2(yy, xx)}, Math says ${Math.atan2(yy, xx)}`)
  check(near(phypot(yy, xx), Math.hypot(yy, xx)), `hypot(${yy}, ${xx})`)
}
for (const [b, e] of [[2, 10], [1.5, 2], [0.5, -3], [-2, 3], [7, 0], [0, 2]] as const) check(near(ppow(b, e), Math.pow(b, e)), `pow(${b}, ${e})`)
for (const x of [0, 1, -1, 1e-10, -1e-10]) check(near(pexp(x), Math.exp(x)) && near(psin(x), Math.sin(x)) && near(ptanh(x), Math.tanh(x)), `edge ${x}`)
check(plog(1) === 0 && patan2(0, 1) === 0 && psin(0) === 0, 'exact points')

const src = fs.readFileSync(path.join(__dirname, '../src/lib/pmath.ts'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '')
const used = [...new Set([...src.matchAll(/Math\.(\w+)/g)].map(m => m[1]))]
for (const u of used) check(['round', 'abs', 'floor', 'sqrt', 'PI'].includes(u), `pmath uses Math.${u}, which isn't the same in every engine`)

console.log(`${checks} checks`)
console.log(failures === 0 ? '✅ ALL CHECKS PASSED' : `${failures} check(s) failed`)
process.exit(failures === 0 ? 0 : 1)
