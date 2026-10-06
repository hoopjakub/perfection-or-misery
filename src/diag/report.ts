// Phase 9, Diagnostics step 4 (docs/diagnostics/05-SCREEN-AND-REPORT.md §6):
// the report, as Markdown short enough for one chat message.
//
// The Dugout's six rules (under ~4,000 characters, targets beside actuals, p95
// not just last, verdicts worked out here, environment first, plain Markdown),
// plus four: worst first, a seed with every failure, nothing personal, and a
// cut by whole sections, never mid-line. Pure: scripts/verify-report.ts builds
// a worst case in Node and checks all of it.
import { BUDGETS, RUNTIME, budgetSpec, type Budget } from './budgets'
import { reading, recordedKeys } from './perf'
import type { Entry } from './log'

export type Status = 'OK' | 'WARN' | 'FAIL' | 'NO DATA' | 'n/a'
export type BudgetRow = { key: string; label: string; target: number; unit: Budget['unit']; p50: number; p95: number; n: number; count: number; status: Status; reason?: string; network?: boolean }

const RANK: Record<Status, number> = { FAIL: 0, WARN: 1, 'NO DATA': 2, OK: 3, 'n/a': 4 }

/** Every runtime budget as a row, worst first (status, then p95 against its target). */
export function budgetRows(platform: string): BudgetRow[] {
  const os = platform === 'web' ? 'web' : 'android'
  const rows = RUNTIME.map((key): BudgetRow => {
    const b: Budget = BUDGETS[key]
    const r = reading(key)
    const base = { key, label: b.label, target: b.target, unit: b.unit, p50: r.p50, p95: r.p95, n: r.n, count: r.count, network: b.network }
    // A budget this platform can't produce is n/a with its reason, not a gap (I5).
    if (b.platforms && !b.platforms.includes(os)) return { ...base, status: 'n/a', reason: `${b.platforms.join('/')} only` }
    return { ...base, status: r.status === 'UNMEASURED' ? 'NO DATA' : r.status }
  })
  return rows.sort((a, b) => RANK[a.status] - RANK[b.status] || b.p95 / b.target - a.p95 / a.target || a.key.localeCompare(b.key))
}

/** Recorded keys with no budget: shown, not dropped. */
export const unbudgetedKeys = () => recordedKeys().filter(k => !budgetSpec(k) && !k.startsWith('bench:'))

export function summarise(rows: BudgetRow[]): string {
  const n = (s: Status) => rows.filter(r => r.status === s).length
  return (['FAIL', 'WARN', 'OK', 'NO DATA', 'n/a'] as Status[]).filter(s => n(s)).map(s => `${n(s)} ${s}`).join(' · ') || 'nothing'
}

// Rule 9, enforced where the text leaves the app: a log line can carry a
// server's error, and a server's error can carry an id. Anything shaped like an
// email, a UUID, a JWT or a backend URL is blanked before it's printed.
const PRIVATE = [
  /[\w.+-]+@[\w-]+\.[\w.-]+/g,                                         // email
  /\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi,   // uuid
  /\beyJ[\w-]+\.[\w-]+\.[\w-]+/g,                                     // jwt
  /https?:\/\/[\w-]+\.supabase\.(co|in)\S*/gi,                          // the backend
]
export const scrub = (s: string) => PRIVATE.reduce((t, re) => t.replace(re, '…'), s)

/** A log line as the screen and the report print it. */
export function entryLine(e: Entry, payload = true): string {
  return scrub(`${e.ctx ? `[${e.ctx}] ` : ''}${e.level} ${e.cat}/${e.msg}${payload && e.data ? ` ${e.data}` : ''}`)
}

const fig = (v: number) => (v >= 100 ? String(Math.round(v)) : v.toFixed(1))

export type ReportInput = {
  env: { app: string; build: string; engine: number; db: number; installed?: number; platform: string; jsEngine: string; device: string; window: string; fontScale: number; reduceMotion: boolean; sessionMin: number }
  session: string
  runLine?: string                       // "world_cup hard 4-3-3 · 7 matches"
  rows: BudgetRow[]
  unbudgeted: { key: string; p95: number }[]
  stalls: { count: number; worst: { ms: number; route: string; during?: string } | null }
  checks?: { at: number; line: string }  // "fingerprint MATCH · invariants 200/200 (seed …) · db ok · backend 312ms"
  bench?: string
  run?: string                           // "7/7 seeded · 0 fallback · scorers 9/9 · save not attempted · schema retries 0"
  data?: string
  problems: Entry[]                      // this session's warnings and errors, newest last
  lastSession: Entry[]
}

export const REPORT_LIMIT = 4000

export function buildReport(x: ReportInput): string {
  const e = x.env
  const head = [
    '### Perfection or Misery — diagnostics',
    `app ${e.app} · ${e.build} · engine ${e.engine} · db ${e.db}${e.installed !== undefined ? ` (installed ${e.installed})` : ''}`,
    `${e.platform} · ${e.jsEngine} · ${e.device} · ${e.window} · font ${e.fontScale} · motion ${e.reduceMotion ? 'reduced' : 'on'}`,
    `session ${e.sessionMin} min · ${x.session}${x.runLine ? ` · run ${x.runLine}` : ''}`,
    '',
    `summary: ${summarise(x.rows)}`,
  ]
  const tableRow = (r: BudgetRow) => r.status === 'n/a'
    ? `| ${r.key} | ${r.target} | — | — | — | n/a ${r.reason ?? ''} |`
    : `| ${r.key} | ${r.target} | ${fig(r.p50)} | ${fig(r.p95)} | ${r.count > r.n ? `${r.n}/${r.count}` : r.n} | ${r.status}${r.network ? ' (network)' : ''} |`
  const bad = x.rows.filter(r => r.status === 'FAIL' || r.status === 'WARN')
  const ok = x.rows.filter(r => r.status === 'OK' || r.status === 'n/a')
  const none = x.rows.filter(r => r.status === 'NO DATA')

  // Built as a function of how much to keep, then cut down a step at a time
  // until it fits (§6.3): whole sections go, nothing is sliced.
  const build = (keep: { low: boolean; okRows: boolean; noData: boolean; problems: number; payloads: boolean }) => {
    const lines = [...head, '', '| budget | target | p50 | p95 | n | |', '|---|---:|---:|---:|---:|---|', ...bad.map(tableRow)]
    if (keep.okRows) lines.push(...ok.map(tableRow))
    else if (ok.length) lines.push(`| ok: ${ok.length} budgets | | | | | |`)
    lines.push('')
    if (bad.length) lines.push(`over budget: ${bad.map(r => `${r.key} ${fig(r.p95)}`).join(' · ')}`)
    if (keep.noData && none.length) lines.push(`never sampled: ${none.map(r => r.key).join(' · ')}`)
    if (keep.low && x.unbudgeted.length) lines.push(`no budget: ${x.unbudgeted.map(u => `${u.key} ${fig(u.p95)}`).join(' · ')}`)
    const w = x.stalls.worst
    lines.push('', `stalls >50ms: ${x.stalls.count}${w ? ` (worst ${w.ms}ms on ${w.route}${w.during ? ` during ${w.during}` : ''})` : ''}`)
    if (x.checks) lines.push('', `checks (${new Date(x.checks.at).toISOString().slice(11, 16)}): ${x.checks.line}`)
    if (keep.low && x.bench) lines.push(`self-test: ${x.bench}`)
    if (x.run) lines.push('', `run: ${x.run}`)
    if (keep.low && x.data) lines.push(`data: ${x.data}`)
    const recent = x.problems.slice(-keep.problems).reverse()
    if (recent.length) lines.push('', 'last problems:', ...recent.map(p => `  ${entryLine(p, keep.payloads)}`))
    const prev = x.lastSession.slice(-Math.min(3, keep.problems)).reverse()
    if (prev.length) lines.push('last session:', ...prev.map(p => `  ${entryLine(p, keep.payloads)}`))
    return lines
  }

  const steps: [string, Partial<Parameters<typeof build>[0]>][] = [
    ['', {}],
    ['self-test, data, no budget', { low: false }],
    ['OK rows', { low: false, okRows: false }],
    ['never sampled', { low: false, okRows: false, noData: false }],
    ['problems', { low: false, okRows: false, noData: false, problems: 2 }],
    ['payloads', { low: false, okRows: false, noData: false, problems: 2, payloads: false }],
  ]
  const full = { low: true, okRows: true, noData: true, problems: 5, payloads: true }
  let text = ''
  const dropped: string[] = []
  for (const [name, keep] of steps) {
    if (name) dropped.push(name)
    const lines = build({ ...full, ...keep })
    if (dropped.length) lines.push('', `(trimmed: ${dropped.join(', ')})`)
    text = lines.join('\n')
    if (text.length <= REPORT_LIMIT) break
  }
  return text
}

/** The log screen's share: the whole ring, oldest first, with no length limit, and it says so. */
export function buildFullLog(entries: readonly Entry[]): string {
  return [`### log (${entries.length} lines, oldest first; as long as it needs to be)`,
    ...entries.map(e => `${new Date(e.t).toISOString().slice(11, 19)} ${e.prev ? '(last session) ' : ''}${entryLine(e)}`)].join('\n')
}
