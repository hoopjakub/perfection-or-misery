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
import { log, logEntries, attachLogStore, enableDebugLog, flushLog, setLogContext, runStarted, runEnded } from '../src/diag/log'

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

// 2d · The run hub's long lists go through BoardList (Phase 9.75, P9.75-11).
// Mapped by hand, a board mounted every row on opening: 4 to 5 s on the
// phone for a European run's Stats tab. A list here that renders rows from
// .map() fails; the squad (16 at most) is the one short list, by name.
{
  const HUB = 'app/game/run.tsx'
  // Rows from a map: an arrow straight into JSX, or into a block that returns
  // it. A map that's assigned (`const marks = mine.map(…)`) is data, not rows.
  const LONG = /(\b(?:board|rows|mine|stories)|\[\.\.\.data\.press\]\.reverse\(\))\.map\(\(?[^()]*\)?\s*=>\s*[({<]/
  const rowsByHand = (line: string) => LONG.test(line) && !/=\s*\w+\.map\(/.test(line)
  check(rowsByHand("{board.map((p, i) => {") && rowsByHand("{board.map((p, i) => (") && rowsByHand("{rows.map(r => <Row />)}")
    && rowsByHand("{[...data.press].reverse().map(s => <StoryItem />)}") && !rowsByHand("rows.map(r => vm(r))") && !rowsByHand("const marks: Mark[] = mine.map(m => {"), 'rule 2d misreads a list')
  codeOnly(fs.readFileSync(path.join(ROOT, HUB), 'utf8')).forEach((line, i) => {
    if (rowsByHand(line)) check(false, `${HUB}:${i + 1}: a long list mapped by hand, not through BoardList: ${line.trim().slice(0, 70)}`)
  })
}

// 2e · Every text field stands on a screen that keeps it above the keyboard
// (Phase 9.75, P9.75-07, R3-02). Three screens of thirteen wore KeyboardSafe,
// and on the phone the keyboard sat over the clubs' invite field. KitScreen
// does it now; this fails if it stops, and on a field whose screen isn't a
// KitScreen. A component with a field is traced up to the screens using it.
{
  const kit = fs.readFileSync(path.join(ROOT, 'src/components/kit/feedback.tsx'), 'utf8')
  const kitHandles = /<KeyboardAvoidingView\b/.test(kit) && /keyboardDidShow/.test(kit)
  const code = new Map<string, string>()
  for (const f of [...walk(path.join(ROOT, 'app')), ...walk(path.join(ROOT, 'src'))]) {
    try { code.set(path.relative(ROOT, f).replace(/\\/g, '/'), codeOnly(fs.readFileSync(f, 'utf8')).join('\n')) } catch { /* unreadable: skip */ }
  }
  const safe = (c: string) => /<KeyboardSafe\b/.test(c) || (kitHandles && /<KitScreen\b/.test(c))
  // The screens a file ends up on: itself if it's a screen, else whoever imports it, upwards.
  const screensOf = (f: string, seen = new Set<string>()): string[] => {
    if (f.startsWith('app/')) return [f]
    if (seen.has(f)) return []
    seen.add(f)
    const name = path.basename(f).replace(/\.tsx?$/, '')
    const importers = [...code].filter(([g, c]) => g !== f && new RegExp(`from\\s+['"][^'"]*/${name}['"]`).test(c)).map(([g]) => g)
    return importers.flatMap(g => screensOf(g, seen))
  }
  let fields = 0
  for (const [f, c] of code) {
    if (!/<(Field|TextInput)\b/.test(c) || f.startsWith('src/components/kit/')) continue
    fields++
    const screens = screensOf(f)
    check(screens.length > 0, `${f} has a text field and no screen uses it`)
    for (const s of new Set(screens)) if (!safe(code.get(s) ?? '')) check(false, `${s}: a text field (${f}) on a screen that doesn't keep it above the keyboard`)
  }
  check(fields >= 10, `rule 2e found ${fields} files with a field; expected ten or more (is the pattern still right?)`)
}

// 2f · A whole screen waiting draws LoadingScreen (Phase 9.75, R3-03): four
// screens drew their own ("reading…" lines, a bar), none with the settle floor.
// A list waiting draws GhostRows in its place, which this doesn't touch.
for (const f of walk(path.join(ROOT, 'app'))) {
  const rel = path.relative(ROOT, f).replace(/\\/g, '/')
  // Comment lines blanked, not dropped, so the line numbers are the file's.
  const lines = fs.readFileSync(f, 'utf8').split(/\r?\n/).map(l => (/^\s*(\/\/|\*|\/\*)/.test(l) ? '' : l))
  lines.forEach((line, i) => {
    if (!/\bif \(loading\)/.test(line)) return
    // The branch: this line, or the block it opens, up to its closing brace.
    const end = /\{\s*$/.test(line) ? lines.findIndex((l, j) => j > i && /^\s*\}\s*$/.test(l)) : i
    if (/<KitScreen\b/.test(lines.slice(i, end + 1).join('\n'))) check(false, `${rel}:${i + 1}: a screen's wait drawn by hand; use LoadingScreen`)
  })
}

// 2g · The draft draws every hanger, the eleven's and the bench's, through one
// builder (Phase 9.75, P9.75-03, R3-09). The bench drew its own, without the
// club mark, the position or the step-back while someone was held: "hard to
// see where to swap". A <Hanger outside hangerFor is a second definition.
{
  const DRAFT = 'app/game/draft.tsx'
  const lines = fs.readFileSync(path.join(ROOT, DRAFT), 'utf8').split(/\r?\n/)
  const start = lines.findIndex(l => /^\s*function hangerFor\(/.test(l))
  const indent = start < 0 ? '' : lines[start].match(/^\s*/)![0]
  const end = start < 0 ? -1 : lines.findIndex((l, j) => j > start && l === `${indent}}`)
  check(start >= 0 && end > start, `${DRAFT}: no hangerFor builder`)
  lines.forEach((l, i) => {
    if (/<Hanger\b/.test(l) && !(i > start && i < end)) check(false, `${DRAFT}:${i + 1}: a hanger drawn outside hangerFor (the eleven and the bench share one builder)`)
  })
}

// 2h · The seeded engine computes the same bits on every JS engine (Phase
// 9.75, P9.75-18). Math's pow, exp, sin, tanh, atan2, hypot… are approximate
// and differ between V8 and Hermes; the phone's fingerprint failed on them.
// The engine and its random numbers use src/lib/pmath.ts; `**` is pow too.
// localeCompare follows the engine's locale data: ids compare with cmpStr.
{
  const BANNED = /\bMath\.(pow|exp|expm1|log|log10|log2|log1p|sin|cos|tan|asin|acos|atan|atan2|sinh|cosh|tanh|asinh|acosh|atanh|hypot|cbrt)\(|(?<![/*])\*\*\s*[\w(.]|\.localeCompare\(/
  check(BANNED.test('a.id.localeCompare(b.id)') && BANNED.test('Math.pow(a, 2)') && BANNED.test('(x - y) ** 2') && !BANNED.test('Math.sqrt(x)') && !BANNED.test('/** a doc */'), 'rule 2h misreads a line')
  const files = [...walk(path.join(ROOT, 'src/engine')), path.join(ROOT, 'src/lib/rng.ts')]
  for (const f of files) {
    const rel = path.relative(ROOT, f).replace(/\\/g, '/')
    const text = fs.readFileSync(f, 'utf8').replace(/\/\*[\s\S]*?\*\//g, c => c.replace(/[^\n]/g, ' '))
    text.split(/\r?\n/).forEach((line, i) => {
      const code = line.replace(/(^|\s)\/\/.*$/, '')
      if (BANNED.test(code)) check(false, `${rel}:${i + 1}: engine-dependent maths (use src/lib/pmath.ts): ${code.trim().slice(0, 70)}`)
    })
  }
}

// 2c · The instructions every session reads first don't name what's gone.
// Phase 9.75 (L-9): CLAUDE.md and the dev skill sent builders to BackButton,
// the old colours and a deleted route for weeks after each went. Every
// component-like name (`PascalCase`) and every path (`src/…`, `app/…`,
// `scripts/…`) in backticks must still exist in the code.
{
  const DOCS = ['CLAUDE.md', '.claude/skills/pom-dev/SKILL.md', 'docs/PROJECT_STATE.md']
  // Names in backticks that aren't the app's code: platforms, libraries, words.
  const NOT_CODE = new Set(['POM', 'Ionicons', 'React', 'Expo', 'Hermes', 'Zustand', 'Supabase', 'TypeScript', 'SQLite', 'MMKV', 'Chrome', 'Android', 'Metro', 'KitText', 'Pressable', 'FlatList', 'ScrollView', 'Image', 'Text', 'View', 'AsyncStorage', 'Platform', 'JSON', 'PascalCase', 'Wikipedia', 'Wikidata', 'Transfermarkt', 'FotMob', 'Promise', 'Map', 'Set', 'Date', 'Math', 'GitHub', 'Vercel', 'EAS', 'Babel', 'Node', 'ESLint'])
  const code = [...walk(path.join(ROOT, 'app')), ...walk(path.join(ROOT, 'src'))].map(f => { try { return fs.readFileSync(f, 'utf8') } catch { return '' } }).join('\n')
  const defined = (name: string) => new RegExp(String.raw`(function|const|class|type|interface)\s+${name}\b|export\s*\{[^}]*\b${name}\b`).test(code)
  // A component file's name counts too (`MatchStatsParts` is a file of several parts).
  const files = new Set([...walk(path.join(ROOT, 'app')), ...walk(path.join(ROOT, 'src'))].map(f => path.basename(f).replace(/\.tsx?$/, '')))
  const stale = (doc: string): string[] => {
    const out: string[] = []
    // A line that says a thing was deleted may name it ("AppModal is deleted").
    const live = doc.split(/\r?\n/).filter(l => !/deleted|removed|is gone|are gone/i.test(l)).join('\n')
    for (const m of live.matchAll(/`([^`\n]+)`/g)) {
      const tok = m[1].trim()
      if (/^(src|app|scripts|supabase|assets)\/[\w./\[\]()-]+$/.test(tok)) {
        if (!fs.existsSync(path.join(ROOT, tok.replace(/[:#].*$/, '')))) out.push(tok)
      } else if (/^[A-Z][A-Za-z0-9]+$/.test(tok) && !NOT_CODE.has(tok) && !defined(tok) && !files.has(tok)) out.push(tok)
    }
    return [...new Set(out)]
  }
  check(stale('use `BackButton` from `src/components/Gone.tsx`').length === 2, 'rule 2c misses a deleted name or path')
  for (const d of DOCS) {
    const p = path.join(ROOT, d)
    if (!fs.existsSync(p)) continue
    const gone = stale(fs.readFileSync(p, 'utf8'))
    check(gone.length === 0, `${d} names what doesn't exist: ${gone.join(', ')}`)
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
  check(Object.keys(facts.en ?? {}).length > 0 && Object.keys(facts.sk ?? {}).length > 0, 'scripts/club_facts.json has no English or no Slovak facts')
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

  // L-4 (R3-12): the log's run ends with the run. A run left before its
  // first pick kept its tag on every later line; a second run started over it.
  runStarted('europa_league')
  runStarted('league')
  check(logEntries().some(e => /^RUN ENDED \w+ · europa_league · replaced/.test(e.msg)), "a new run doesn't close the one still open")
  runEnded('left')
  log.info('ui', 'history screen')
  check(!logEntries()[logEntries().length - 1].ctx, "a run left in the draft still tags the lines after it")
  const draftSrc = fs.readFileSync(path.join(ROOT, 'app/game/draft.tsx'), 'utf8')
  const storeSrc = fs.readFileSync(path.join(ROOT, 'src/store/gameStore.ts'), 'utf8')
  check(/runEnded\('left'\)/.test(draftSrc), "the draft doesn't end the log's run when it's left with no picks")
  check(/resetRun:.*runEnded\(/.test(storeSrc), "resetRun doesn't end the log's run")
  // L-5 (R3-13): a saved run opened from history leaves this run's save ledger alone.
  const hookSrc = fs.readFileSync(path.join(ROOT, 'src/hooks/useRunSave.ts'), 'utf8')
  check(/saveLedgerLine\(status, history\)/.test(hookSrc), "the result screen writes the save ledger from a history view")
  const { saveLedgerLine } = require('../src/diag/log') as { saveLedgerLine?: (s: string, h: boolean) => string | null }
  check(!!saveLedgerLine && saveLedgerLine('off', true) === null && saveLedgerLine('saved', true) === null
    && saveLedgerLine('off', false) === 'skipped · tester' && saveLedgerLine('waiting', false) === null, 'the save ledger says the wrong thing for a history view or the tester')

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
