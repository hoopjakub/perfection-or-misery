/**
 * The diagnostics' budgets are honest (Phase 9, docs/diagnostics/04-CHECKS.md §7).
 *
 *   npx tsx scripts/verify-budgets.ts
 *
 * The Dugout's diagnostics screen was wrong for months before a script that
 * read the source caught it. This is that script, written first. It reads
 * every .ts/.tsx under app/ and src/, finds the recorder's calls
 * (time, timeAsync, sample, measure, frame with a 'group:name' key) and checks:
 *   1. every runtime budget is recorded somewhere (REQUIRE_RECORDED, on since
 *      Diagnostics step 2);
 *   2. no planned budget is recorded (a stale flag);
 *   3. bench:* keys only in src/diag/checks.ts, and nothing else there;
 *   4. no key from more than two places (one key, one meaning);
 *   5. hardFail > target;  6. platforms only android/web;
 *   7. keys recorded with no budget: listed, not failed.
 * Plus the counts the plan states (03 §6). `mark()` doesn't count as recording.
 */
import fs from 'fs'
import path from 'path'
import { BUDGETS, RUNTIME, PLANNED, BUILD, BENCH, budgetSpec, type Budget } from '../src/diag/budgets'

// On since Diagnostics step 2 (5 Oct 2026): every runtime budget has its site.
const REQUIRE_RECORDED = true

const ROOT = path.join(__dirname, '..')
let failures = 0
const check = (cond: boolean, msg: string) => { if (!cond) { failures++; console.log(`❌ ${msg}`) } }

// The frame hooks (src/diag/frames.ts) take their key the same way.
const CALL = /\b(time|timeAsync|timeToFrame|sample|measure|frame|useFrameSampler|useUiFrameSampler)\(\s*['"`]([a-z]+:[A-Za-z:]+)['"`]/g
function recordedIn(code: string): string[] {
  return [...code.matchAll(CALL)].map(m => m[2])
}

// The scanner has to find what it exists for, and ignore what it shouldn't.
check(recordedIn("time('sim:wc', () => go())").join() === 'sim:wc', 'scanner misses time()')
check(recordedIn("await timeAsync(`save:run`, f)").join() === 'save:run', 'scanner misses timeAsync()')
check(recordedIn("frame('frame:globe'); measure('ui:navigate', 'tap')").length === 2, 'scanner misses frame()/measure()')
check(recordedIn("mark('ui:navigate')").length === 0, 'scanner counts mark() as recording')
check(recordedIn("timeToFrame('sim:skip:wc', f); useUiFrameSampler('frame:globe', on)").length === 2, 'scanner misses timeToFrame() or a frame hook')
check(recordedIn("setTime('a:b')").length === 0, 'scanner matches inside another name')

function walk(dir: string, out: string[] = []): string[] {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.name === 'node_modules' || e.name.startsWith('.')) continue
    const p = path.join(dir, e.name)
    if (e.isDirectory()) walk(p, out)
    else if (/\.tsx?$/.test(e.name)) out.push(p)
  }
  return out
}

const sites = new Map<string, string[]>()   // key -> files (once per call)
for (const f of [...walk(path.join(ROOT, 'app')), ...walk(path.join(ROOT, 'src'))]) {
  const rel = path.relative(ROOT, f).replace(/\\/g, '/')
  if (rel === 'src/diag/perf.ts') continue   // the recorder's own definitions
  let code: string
  try { code = fs.readFileSync(f, 'utf8') } catch { continue }
  code = code.split('\n').filter(l => !/^\s*(\/\/|\*|\/\*)/.test(l)).join('\n')
  for (const k of recordedIn(code)) sites.set(k, [...(sites.get(k) ?? []), rel])
}

// 1
const unmeasured = RUNTIME.filter(k => !sites.has(k))
if (REQUIRE_RECORDED) for (const k of unmeasured) check(false, `runtime budget ${k} is recorded nowhere`)
// 2
for (const k of PLANNED) check(!sites.has(k), `${k} is recorded but still marked planned`)
// 3
for (const [k, files] of sites) {
  const inChecks = files.filter(f => f === 'src/diag/checks.ts').length
  if (k.startsWith('bench:')) check(inChecks === files.length, `${k} is recorded outside src/diag/checks.ts (${files.join(', ')})`)
  else check(inChecks === 0, `${k} is recorded by the self-test, which may only write bench:*`)
}
// 4
for (const [k, files] of sites) check(files.length <= 2, `${k} is recorded from ${files.length} places: ${files.join(', ')}`)
// 5, 6
for (const [k, b] of Object.entries(BUDGETS) as [string, Budget][]) {
  check(b.hardFail > b.target, `${k}: hardFail ${b.hardFail} isn't above target ${b.target}`)
  check(!b.platforms || b.platforms.every(p => p === 'android' || p === 'web'), `${k}: unknown platform`)
}
// 7
const unbudgeted = [...sites.keys()].filter(k => !budgetSpec(k))
// The plan's counts (03 §6), so the doc and the contract can't drift apart.
check(RUNTIME.length === 35 && PLANNED.length === 3 && BUILD.length === 4 && BENCH.length === 7,
  `counts ${RUNTIME.length}/${PLANNED.length}/${BUILD.length}/${BENCH.length}, the plan says 35/3/4/7`)

console.log(`\n${Object.keys(BUDGETS).length} budgets · ${sites.size} keys recorded · ${unmeasured.length} runtime budgets not yet recorded${REQUIRE_RECORDED ? '' : ' (allowed until step 2)'}`)
if (unbudgeted.length) console.log(`recorded with no budget: ${unbudgeted.join(', ')}`)
console.log(failures === 0 ? '✅ ALL CHECKS PASSED' : `${failures} failure(s)`)
process.exit(failures === 0 ? 0 : 1)
