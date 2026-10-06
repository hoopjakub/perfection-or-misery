/**
 * The diagnostics report keeps its rules (Phase 9, docs/diagnostics/04-CHECKS.md §7,
 * 05-SCREEN-AND-REPORT.md §6).
 *
 *   npx tsx scripts/verify-report.ts
 *
 * Builds the report from a worst case (every budget sampled and failing, a
 * full log of long payloads carrying an email, ids, a token and the backend's
 * address, every check failed) and checks: under 4,000 characters; the
 * environment first; no emoji and no colour codes; nothing personal; whole
 * sections dropped, no table row cut; worst rows first. And that a quiet
 * report isn't trimmed at all.
 */
import { RUNTIME, BUDGETS, type Budget } from '../src/diag/budgets'
import { sample, resetPerf } from '../src/diag/perf'
import { buildReport, budgetRows, buildFullLog, REPORT_LIMIT, type ReportInput } from '../src/diag/report'
import type { Entry } from '../src/diag/log'

let failures = 0
const check = (cond: boolean, msg: string) => { if (!cond) { failures++; console.log(`❌ ${msg}`) } }

const env: ReportInput['env'] = { app: '0.9.0', build: 'release', engine: 1, db: 22, installed: 22, platform: 'android 35', jsEngine: 'hermes', device: 'Xiaomi POCO X6 5G', window: '412×915 @2.6 compact', fontScale: 1.3, reduceMotion: false, sessionMin: 41 }
const SECRET = 'martin.example@gmail.com 3f2b8c1e-1a2b-4c3d-9e8f-0123456789ab eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxIn0.c2lnbmF0dXJl https://abcdefgh.supabase.co/rest/v1/runs'
const entry = (i: number, prev = false): Entry => ({ t: 1_700_000_000_000 + i * 1000, level: i % 2 ? 'error' : 'warn', cat: 'net', msg: `load failed number ${i}`, data: `${SECRET} ${'x'.repeat(200)}`, ctx: 'ucl QF L2', ...(prev ? { prev: true as const } : {}) })

function input(): ReportInput {
  return {
    env, session: 'account', runLine: 'world_cup hard 4-3-3 · 7 matches',
    rows: budgetRows('android'),
    unbudgeted: [{ key: 'stall:observed', p95: 120 }, { key: 'made:up', p95: 3 }],
    stalls: { count: 140, worst: { ms: 2840, route: '/game/custom-ucl-simulation', during: 'sim:europe' } },
    checks: { at: Date.UTC(2026, 9, 5, 14, 2), line: 'fingerprint SHOWN DIFFERS · seed 2 · players[7].rating 6.8 ≠ 6.9 · invariants 37/200 · seed 1726398112: possession != 100 · db FAIL · backend server error' },
    bench: 'match 0.31 · detail 41.0 · timeline 130 · season 1300 · stats 2100 · query 410 · net 1600',
    run: '7/7 seeded · 0 fallback · scorers 9/9 · save failed · schema retries 3',
    data: 'clubs 520 · club seasons 4120 · players 24935 · club facts 0',
    problems: Array.from({ length: 300 }, (_, i) => entry(i)),
    lastSession: Array.from({ length: 100 }, (_, i) => entry(i, true)),
  }
}

// ── The worst case ───────────────────────────────────────────────────────────
resetPerf()
for (const k of RUNTIME) { const b: Budget = BUDGETS[k]; for (let i = 0; i < 6; i++) sample(k, b.hardFail * 3 + i) }
const worst = buildReport(input())
const lines = worst.split('\n')
check(worst.length <= REPORT_LIMIT, `the worst case is ${worst.length} characters, over ${REPORT_LIMIT}`)
check(lines[0].startsWith('### Perfection or Misery') && lines[1].startsWith('app ') && lines[2].startsWith('android'), 'the environment isn\'t first')
check(!/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u.test(worst), 'an emoji in the report')
check(!/\x1b\[/.test(worst), 'a colour code in the report')
// Nothing personal, in every report built here (a quiet one keeps its payloads,
// so it's the one a leak would show in).
function privacy(text: string, which: string) {
  check(!/[\w.+-]+@[\w-]+\.[a-z]{2,}/i.test(text), `${which}: an email address got through`)   // not "@2.6", the pixel ratio
  check(!/[0-9a-f]{8}-[0-9a-f]{4}-/i.test(text), `${which}: a UUID got through`)
  check(!/eyJ[\w-]+\./.test(text), `${which}: a token got through`)
  check(!/supabase\.co/.test(text), `${which}: the backend's address got through`)
}
privacy(worst, 'worst case')
for (const l of lines.filter(l => l.startsWith('|'))) check((l.match(/\|/g) ?? []).length === 7, `a table row was cut: ${l.slice(0, 60)}`)
check(/\(trimmed: .+\)$/.test(worst.trim()), 'a trimmed report doesn\'t say what it dropped')
check(worst.includes('seed 1726398112'), 'a failed check lost its seed')
const firstRow = lines.find(l => l.startsWith('| ') && !l.startsWith('| budget'))
check(!!firstRow && firstRow.includes('FAIL'), 'the table doesn\'t start with the worst row')

// ── A quiet run: nothing to trim ─────────────────────────────────────────────
resetPerf()
for (const k of RUNTIME.slice(0, 10)) { const b: Budget = BUDGETS[k]; for (let i = 0; i < 6; i++) sample(k, b.target / 2) }
const quiet = buildReport({ ...input(), problems: [entry(1)], lastSession: [], checks: { at: Date.now(), line: 'fingerprint MATCH · invariants 200/200 (seed 5) · db ok · backend 312ms' } })
privacy(quiet, 'quiet')
check(quiet.length <= REPORT_LIMIT && !quiet.includes('(trimmed'), `a quiet report was trimmed (${quiet.length} characters)`)
// The first ten keys include db:fetch, web-only: n/a on Android whether sampled or not.
check(quiet.includes('never sampled:') && quiet.includes('summary: 9 OK'), `the quiet report's summary or never-sampled line is wrong: ${quiet.split('\n').find(l => l.startsWith('summary'))}`)
check(quiet.includes('n/a web only'), 'a web-only budget on Android isn\'t n/a with its reason')

// ── The full log: the whole ring, still scrubbed ─────────────────────────────
const full = buildFullLog(input().problems)
check(full.split('\n').length === 301 && !full.includes('supabase.co') && !/[\w.+-]+@[\w-]+\.[a-z]{2,}/i.test(full), 'the full log lost lines or let something personal through')

console.log(`\nworst case ${worst.length} characters · quiet ${quiet.length}`)
console.log(failures === 0 ? '✅ ALL CHECKS PASSED' : `${failures} failure(s)`)
process.exit(failures === 0 ? 0 : 1)
