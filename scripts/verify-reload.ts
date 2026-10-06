/**
 * What a reload keeps of a run, and what it loses (Phase 9,
 * docs/diagnostics/04-CHECKS.md §7).
 *
 *   npx tsx scripts/verify-reload.ts
 *
 * Reads the GameStore type (src/store/gameStore.ts), takes every field that
 * isn't a function, and sorts it into kept (the run keeper's KeptRun,
 * src/lib/runKeeper.ts: the draft, up to kick-off) or lost. The Dugout's rule:
 * not saving something is allowed, not saying so isn't. REPORTED, NOT GATED:
 * a season in play lives in memory on purpose for now (P8-149 kept the draft
 * only). Flip GATED in the change that makes a whole run survive a reload;
 * every lost field then needs a reason in TRANSIENT.
 */
import fs from 'fs'
import path from 'path'

const GATED = false
const TRANSIENT: Record<string, string> = {}   // field -> why it may be lost (used once GATED)

const ROOT = path.join(__dirname, '..')
let failures = 0
const check = (cond: boolean, msg: string) => { if (!cond) { failures++; console.log(`❌ ${msg}`) } }

/** The non-function fields of `type Name = { … }` in a file. */
function fieldsOf(file: string, name: string): string[] {
  const src = fs.readFileSync(path.join(ROOT, file), 'utf8')
  const start = src.search(new RegExp(`type ${name} = \\{`))
  if (start < 0) return []
  let depth = 0, i = src.indexOf('{', start), end = i
  for (; i < src.length; i++) { if (src[i] === '{') depth++; else if (src[i] === '}' && --depth === 0) { end = i; break } }
  const body = src.slice(src.indexOf('{', start) + 1, end)
  const out: string[] = []
  // Top-level `name: type` lines only (depth 0 inside the body), skipping methods.
  let d = 0
  for (const line of body.split(/\r?\n/)) {   // the repo's files are CRLF on Windows
    const m = d === 0 ? line.match(/^\s*([a-zA-Z_]\w*)\??\s*:\s*(.*)$/) : null
    if (m && !/^\(.*\)\s*=>/.test(m[2].trim())) out.push(m[1])
    for (const ch of line.replace(/\/\/.*$/, '')) { if (ch === '{' || ch === '(') d++; else if (ch === '}' || ch === ')') d-- }
  }
  return out
}

const store = fieldsOf('src/store/gameStore.ts', 'GameStore')
const kept = new Set(fieldsOf('src/lib/runKeeper.ts', 'KeptRun'))

// The parser has to see what it exists for.
check(store.length >= 20, `found only ${store.length} fields in GameStore: the parser has stopped matching`)
check(store.includes('draftedPlayers') && !store.includes('startRun'), 'the parser lost a field or kept a method')
check(kept.has('draftedPlayers'), 'the parser found nothing the run keeper keeps')

const keptHere = store.filter(f => kept.has(f))
const lost = store.filter(f => !kept.has(f))
if (GATED) for (const f of lost) check(f in TRANSIENT, `${f} is lost on a reload and TRANSIENT doesn't say why`)

console.log(`GameStore: ${store.length} fields · kept to kick-off ${keptHere.length} · lost on a reload ${lost.length}`)
console.log(`kept: ${keptHere.join(', ')}`)
console.log(`lost: ${lost.join(', ')}`)
console.log(GATED ? '' : '(reported, not gated: a season in play lives in memory)')
console.log(failures === 0 ? '✅ ALL CHECKS PASSED' : `${failures} failure(s)`)
process.exit(failures === 0 ? 0 : 1)
