// Phase 9.75 (R3-01, P9.75-01, decision D1) · Floodlit is for whole screens:
//   npx tsx scripts/verify-grounds.ts
// A part inside an everyday screen takes the screen's ground (useScreenRoles()).
// The floodlit ground (always dark) pinned on a part draws a dark card in the
// middle of a light screen: LiveMatch did, on every live match the phone
// played in light mode. This fails on any pin outside the list below, so a new
// one is a decision someone writes down here, not a default.
import fs from 'fs'
import path from 'path'

const ROOT = path.join(__dirname, '..')

// Each pin and why it's allowed.
const ALLOWED: Record<string, string> = {
  'src/components/Ceremony.tsx': 'a whole floodlit screen (the ceremonies)',
  'src/components/LineupPitch.tsx': 'the pitch: a dark field whatever the ground',
  'src/components/match/PitchViews.tsx': 'the pitch views: a dark field whatever the ground',
  'src/components/setup/DraftParts.tsx': "the club card: cotton text on the club's near-black tint",
  // The match sheet stands floodlit until its redesign (Phase 11, P8-48).
  'app/game/match-stats.tsx': 'the match sheet, until P8-48',
  'src/components/MatchStatsParts.tsx': 'the match sheet, until P8-48',
  'src/components/MatchLineupPitch.tsx': 'the match sheet, until P8-48',
  'src/components/ui.tsx': 'the interim primitives, until P8-48',
}

// FLOODLIT itself, or the ground it names written out ('nylon').
const PIN = /\bROLES\[FLOODLIT\]|\bROLES\.nylon\b|\bROLES\[['"]nylon['"]\]/

function sources(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap(e => {
    const p = path.join(dir, e.name)
    return e.isDirectory() ? sources(p) : /\.tsx?$/.test(e.name) ? [p] : []
  })
}

let failures = 0
const pinned = new Set<string>()
for (const abs of ['app', 'src'].flatMap(d => sources(path.join(ROOT, d)))) {
  const f = path.relative(ROOT, abs).split(path.sep).join('/')
  fs.readFileSync(abs, 'utf8').split(/\r?\n/).forEach((line, i) => {
    const code = line.replace(/(^|\s)\/\/.*$/, '')
    if (!PIN.test(code)) return
    pinned.add(f)
    if (!ALLOWED[f]) { failures++; console.log(`❌ ${f}:${i + 1}: the floodlit ground pinned on a part: ${code.trim().slice(0, 80)}`) }
  })
}
// A file on the list that no longer pins anything comes off it, or the list
// stops saying what's true.
for (const f of Object.keys(ALLOWED)) if (!pinned.has(f)) { failures++; console.log(`❌ ${f} is allowed a floodlit pin but has none: take it off the list`) }

console.log(`${pinned.size} files pin the floodlit ground`)
console.log(failures === 0 ? '✅ ALL CHECKS PASSED' : `${failures} check(s) failed`)
process.exit(failures === 0 ? 0 : 1)
