/**
 * Small static checks for the diagnostics (Phase 9, docs/diagnostics/04-CHECKS.md §7).
 *
 *   npx tsx scripts/verify-diag.ts
 *
 *   1. Nothing in app/ or src/ writes to the console except the log itself
 *      (src/diag/log.ts): a console line on a phone is a line nobody sees.
 *   2. Nothing wipes the device's whole storage (AsyncStorage.clear): on the
 *      web it's the same localStorage as the settings, the offline run queue
 *      and the kept log.
 *   3. Every database file the app requires exists, and club_facts.json parses.
 *   4. The log behaves: a ring of 300, errors made short, debug dropped unless
 *      switched on, warnings kept on the device and read back as last session's.
 */
import fs from 'fs'
import path from 'path'
import { log, logEntries, attachLogStore, enableDebugLog, flushLog, setLogContext } from '../src/diag/log'

const ROOT = path.join(__dirname, '..')
let failures = 0
const check = (cond: boolean, msg: string) => { if (!cond) { failures++; console.log(`❌ ${msg}`) } }

const CONSOLE = /\bconsole\.(log|info|debug|warn|error)\(/
const WIPE = /AsyncStorage\.clear\(/
const codeOnly = (s: string) => s.split('\n').filter(l => !/^\s*(\/\/|\*|\/\*)/.test(l))

// The rules catch what they exist for.
check(CONSOLE.test("  if (x) console.log('hi')") && CONSOLE.test("console.warn('[a] b:', e)"), 'rule 1 misses a console call')
check(!CONSOLE.test("log.warn('net', 'a')"), 'rule 1 flags the log')
check(WIPE.test('await AsyncStorage.clear()'), 'rule 2 misses a wipe')

function walk(dir: string, out: string[] = []): string[] {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.name === 'node_modules' || e.name.startsWith('.')) continue
    const p = path.join(dir, e.name)
    if (e.isDirectory()) walk(p, out)
    else if (/\.tsx?$/.test(e.name)) out.push(p)
  }
  return out
}
let scanned = 0
for (const f of [...walk(path.join(ROOT, 'app')), ...walk(path.join(ROOT, 'src'))]) {
  const rel = path.relative(ROOT, f).replace(/\\/g, '/')
  let code: string
  try { code = fs.readFileSync(f, 'utf8') } catch { continue }
  scanned++
  codeOnly(code).forEach((l, i) => {
    if (rel !== 'src/diag/log.ts' && CONSOLE.test(l)) check(false, `${rel}:${i + 1} writes to the console; use log (src/diag/log.ts)`)
    if (WIPE.test(l)) check(false, `${rel}:${i + 1} wipes all of the device's storage`)
  })
}

// 2b · The legal build swaps five modules for their twins, but only when
// imported from one named file (metro.config.js, LEGAL_SWAPS). Any other
// importer gets the real module, real names and all, into the public bundle.
// It happened once (5 Oct: the self-test imported the club facts directly).
{
  const ONLY: Record<string, string> = {
    logoMap: 'src/lib/brand.ts', dbAsset: 'src/db/setup.ts', stadiums: 'src/data/venues.ts',
    'europe-countries': 'src/data/geo-iso.ts', clubFactsData: 'src/lib/clubFacts.ts',
  }
  const importsOf = (code: string) => [...code.matchAll(/(?:from\s+|require\()\s*['"][^'"]*\/([\w-]+)['"]/g)].map(m => m[1])
  check(importsOf("import x from '@/lib/clubFactsData'").join() === 'clubFactsData', 'rule 2b misses an import')
  for (const f of [...walk(path.join(ROOT, 'app')), ...walk(path.join(ROOT, 'src'))]) {
    const rel = path.relative(ROOT, f).replace(/\\/g, '/')
    let code: string
    try { code = fs.readFileSync(f, 'utf8') } catch { continue }
    for (const m of importsOf(codeOnly(code).join('\n'))) {
      if (ONLY[m] && ONLY[m] !== rel) check(false, `${rel} imports ${m} directly: the legal build only swaps it for ${ONLY[m]}, so real names would ship`)
    }
  }
}

// 3
for (const rel of ['src/db/dbAsset.ts', 'src/db/dbAsset.legal.ts']) {
  const src = fs.readFileSync(path.join(ROOT, rel), 'utf8')
  const dbs = [...src.matchAll(/assets\/db\/[\w.]+\.db/g)].map(m => m[0])
  check(dbs.length > 0, `${rel} requires no database`)
  for (const d of dbs) check(fs.existsSync(path.join(ROOT, d)), `${rel} requires ${d}, which doesn't exist`)
}
try {
  const facts = JSON.parse(fs.readFileSync(path.join(ROOT, 'scripts/club_facts.json'), 'utf8'))
  check(Object.keys(facts).length > 0, 'scripts/club_facts.json is empty')
} catch (e) { check(false, `scripts/club_facts.json doesn't parse: ${e}`) }

// 4 · The log, headless.
async function logChecks() {
  let stored: string | null = JSON.stringify([{ t: 1, level: 'error', cat: 'app', msg: 'fatal error', data: 'Boom' }])
  await attachLogStore({ read: () => stored, write: s => { stored = s } })
  const first = logEntries()[0]
  check(first?.prev === true && first.msg === 'fatal error', "last session's error isn't read back as prev")
  check(stored === '[]', "the stored copy isn't cleared once read, so a quiet session would show it again")

  log.debug('ui', 'hidden')
  check(!logEntries().some(e => e.msg === 'hidden'), 'debug is kept with debug logging off')
  enableDebugLog(); log.debug('ui', 'shown')
  check(logEntries().some(e => e.msg === 'shown'), 'debug is dropped with debug logging on')

  setLogContext('ucl QF L2')
  log.warn('net', 'load failed', new Error('x'.repeat(1000)))
  const w = logEntries()[logEntries().length - 1]
  check(w.ctx === 'ucl QF L2' && w.data!.startsWith('Error: ') && w.data!.length <= 300, 'a warning lost its context, or its error is too long')
  log.warn('net', 'supabase', { code: 'PGRST', status: 400, message: 'bad', user_id: 'secret' })
  check(!logEntries()[logEntries().length - 1].data!.includes('secret'), "a Supabase error's other fields are written out")
  setLogContext()

  for (let i = 0; i < 1100; i++) log.info('sim', `line ${i}`)
  check(logEntries().length === 1000, `the ring holds ${logEntries().length}, not 1,000`)
  check(logEntries()[999].msg === 'line 1099', 'the ring dropped the newest line')

  flushLog()
  const kept = JSON.parse(stored!)
  check(kept.length >= 1 && kept.every((e: any) => !e.prev && (e.level === 'warn' || e.level === 'error')), 'the device keeps more than this session\'s warnings and errors')
}

// The log mirrors to the console in Node; keep this run's output readable.
const quiet = { log: console.log, warn: console.warn, error: console.error }
console.warn = console.error = () => {}
const realLog = console.log
console.log = (...a: unknown[]) => { if (typeof a[0] === 'string' && /^(❌|\n|✅|\d+ failure)/.test(a[0])) realLog(...a) }
logChecks().then(() => {
  Object.assign(console, quiet)
  console.log(`\n${scanned} files scanned`)
  console.log(failures === 0 ? '✅ ALL CHECKS PASSED' : `${failures} failure(s)`)
  process.exit(failures === 0 ? 0 : 1)
})
