/**
 * Weighs the build-time budgets (Phase 9, docs/diagnostics/03-BUDGETS.md §4).
 *
 *   npx tsx scripts/perf-size.ts                         the database and assets/
 *   npx tsx scripts/perf-size.ts --web dist              + the web entry bundle, gzipped
 *   npx tsx scripts/perf-size.ts --apk build.apk         + the release APK
 *   ... --log                                            append the readings to docs/PERF-LOG.md
 *
 * `--web` takes an `npx expo export --platform web` folder; `--apk` an
 * `eas build --local` APK. A budget whose input wasn't given says so instead
 * of passing. Exits 1 if anything measured is over its hard fail.
 */
import fs from 'fs'
import path from 'path'
import zlib from 'zlib'
import { BUDGETS, BUILD, type Budget } from '../src/diag/budgets'

const ROOT = path.join(__dirname, '..')
const arg = (name: string) => { const i = process.argv.indexOf(name); return i > 0 ? process.argv[i + 1] : undefined }

function dirBytes(dir: string): number {
  let n = 0
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name)
    n += e.isDirectory() ? dirBytes(p) : fs.statSync(p).size
  }
  return n
}
function findEntry(dir: string): string | undefined {
  // Expo's static web export: _expo/static/js/web/entry-<hash>.js
  const js = path.join(dir, '_expo/static/js/web')
  if (!fs.existsSync(js)) return undefined
  const f = fs.readdirSync(js).find(x => x.startsWith('entry-') && x.endsWith('.js'))
  return f && path.join(js, f)
}

const MB = 1024 * 1024
const readings: { key: string; value?: number; note: string }[] = []

const db = path.join(ROOT, 'assets/db/players_v5.db')
readings.push({ key: 'size:db', value: fs.statSync(db).size / MB, note: 'assets/db/players_v5.db' })
// The legal build bundles players_legal.db instead; the larger of the two is the one that counts.
const legal = path.join(ROOT, 'assets/db/players_legal.db')
if (fs.existsSync(legal)) readings.push({ key: 'size:db', value: fs.statSync(legal).size / MB, note: 'assets/db/players_legal.db' })
const web = arg('--web')
// What the web build ships (it's the legal build, so players_legal.db, not
// players_v5.db). Weighed from the export when there is one; otherwise
// assets/ less the personal build's database, and labelled an estimate.
const exported = web && path.join(path.resolve(web), 'assets')
readings.push(exported && fs.existsSync(exported)
  ? { key: 'size:assets', value: dirBytes(exported) / MB, note: `${web}/assets as exported` }
  : { key: 'size:assets', value: (dirBytes(path.join(ROOT, 'assets')) - fs.statSync(db).size) / MB, note: 'estimate: assets/ less players_v5.db (the web ships the legal database)' })

if (web) {
  const entry = findEntry(path.resolve(web))
  readings.push(entry
    ? { key: 'size:webJs', value: zlib.gzipSync(fs.readFileSync(entry)).length / 1024, note: path.relative(path.resolve(web), entry) }
    : { key: 'size:webJs', note: `no entry bundle under ${web}/_expo/static/js/web` })
} else readings.push({ key: 'size:webJs', note: 'not weighed: pass --web <expo export folder>' })

const apk = arg('--apk')
if (apk && fs.existsSync(apk)) readings.push({ key: 'size:apk', value: fs.statSync(apk).size / MB, note: path.basename(apk) })
else readings.push({ key: 'size:apk', note: apk ? `${apk} not found` : 'not weighed: pass --apk <file>' })

let failures = 0
const rows = readings.map(r => {
  const b: Budget = BUDGETS[r.key as keyof typeof BUDGETS]
  const status = r.value === undefined ? 'NO DATA' : r.value > b.hardFail ? 'FAIL' : r.value > b.target ? 'WARN' : 'OK'
  if (status === 'FAIL') failures++
  const v = r.value === undefined ? '—' : r.value.toFixed(r.value >= 100 ? 0 : 1)
  return { line: `| \`${r.key}\` | ${b.target} / ${b.hardFail} ${b.unit} | ${v} | ${status} | ${r.note} |`, status }
})
// Every build-time budget has a reading or says why not.
for (const k of BUILD) if (!readings.some(r => r.key === k)) { failures++; console.log(`❌ ${k} has no reading`) }

const table = ['| budget | target / fail | reading | status | what |', '|---|---|---|---|---|', ...rows.map(r => r.line)].join('\n')
console.log(table)

if (process.argv.includes('--log')) {
  const log = path.join(ROOT, 'docs/PERF-LOG.md')
  const date = new Date().toISOString().slice(0, 10)
  fs.appendFileSync(log, `\n### ${date} · build sizes (scripts/perf-size.ts)\n\n${table}\n`)
  console.log(`\nappended to docs/PERF-LOG.md`)
}
console.log(failures === 0 ? '\n✅ nothing over its hard fail' : `\n${failures} over the hard fail`)
process.exit(failures === 0 ? 0 : 1)
