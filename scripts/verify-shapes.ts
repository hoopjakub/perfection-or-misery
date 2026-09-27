// P8-68: AI clubs pick a shape per match, for a reason. Checks, over many
// generated matches through the real `lineupsForMatch`:
//  - the matchday squad (eleven + bench) is EXACTLY the one picked before the
//    shape was chosen — a stored scorer can never fall outside it
//  - your side is never reshaped, a rotated side keeps its usual shape
//  - every shape comes from the club's repertoire; the same seed gives the same shape
// And measures how often clubs change, and whether the reasons show: more
// changes when players are missing, more defenders against a stronger side.
// Run: npx tsx scripts/verify-shapes.ts

import { lineupsForMatch, selectLineup, lineupSeed, repertoireFor, formationForClub } from '../src/engine/lineup'
import { getSlotsForFormation, shirtNumbers, ALL_FORMATIONS } from '../src/engine/formations'
import type { RosterPlayer } from '../src/types/stats'

let failures = 0
function check(cond: boolean, msg: string) {
  if (!cond) { failures++; if (failures <= 30) console.log(`❌ ${msg}`) }
}
function rng(seed: number) {
  let s = seed >>> 0
  return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296 }
}

const POS = ['GK', 'GK', 'CB', 'CB', 'CB', 'CB', 'LB', 'RB', 'LB', 'RWB', 'CDM', 'CDM', 'CM', 'CM', 'CM', 'CAM', 'LM', 'RM', 'LW', 'RW', 'ST', 'ST', 'CF', 'CAM']
function squad(club: string, base: number, r: () => number): RosterPlayer[] {
  return POS.map((pos, i) => ({
    playerId: `${club}-${i}`, name: `P ${club}${i}`, primaryPosition: pos, attack: base, ovr: Math.round(base + (r() - 0.5) * 14),
    birthYear: 1996, yearStart: 2024, seasonLabel: '24/25', clubId: club, clubName: club,
  }))
}
const DEF = new Set(['CB', 'LB', 'RB', 'LWB', 'RWB'])
const defenders = (f: string) => getSlotsForFormation(f as any).filter(s => DEF.has(s.primary)).length
const ATT = new Set(['ST', 'CF', 'LW', 'RW'])
const attackers = (f: string) => getSlotsForFormation(f as any).filter(s => ATT.has(s.primary)).length

let matches = 0, switched = 0, withAbsence = 0, switchedAbsence = 0, stronger = 0, moreDef = 0, weaker = 0, fewerDef = 0

for (let s = 1; s <= 4000; s++) {
  const r = rng(s * 7919)
  const hc = `h${s % 97}`, ac = `a${s % 89}`
  const hBase = 68 + Math.round(r() * 18), aBase = 68 + Math.round(r() * 18)
  const home = squad(hc, hBase, r), away = squad(ac, aBase, r)
  const absent = r() < 0.35 ? new Set([home[Math.floor(r() * home.length)].playerId, home[Math.floor(r() * home.length)].playerId]) : undefined
  const rotation = r() < 0.15 ? 0.6 : undefined
  const o = { seed: s * 131, benchSize: 7, homeRotation: rotation, unavailableIds: absent }
  const l = lineupsForMatch(home, away, o)
  const again = lineupsForMatch(home, away, o)
  check(JSON.stringify(l.homeLineup) === JSON.stringify(again.homeLineup), `match ${s}: shape not deterministic`)
  const hl = l.homeLineup!
  // The squad picked before the shape — the same 18.
  const avail = absent ? home.filter(p => !absent.has(p.playerId)) : home
  const before = selectLineup(avail, { seed: lineupSeed(o.seed, true), rotation, benchSize: 7 })
  const ids = (x: { starters: RosterPlayer[]; bench: RosterPlayer[] }) => [...x.starters, ...x.bench].map(p => p.playerId).sort().join()
  check(ids(hl) === ids(before), `match ${s}: the matchday squad changed with the shape`)
  check(repertoireFor(hc).includes(hl.formation), `match ${s}: ${hl.formation} isn't in ${hc}'s repertoire`)
  if (rotation) check(hl.formation === formationForClub(hc), `match ${s}: a rotated side changed shape`)
  matches++
  const changed = hl.formation !== formationForClub(hc)
  if (changed) switched++
  if (absent) { withAbsence++; if (changed) switchedAbsence++ }
  const gap = aBase - hBase
  if (changed && gap >= 6) { stronger++; if (defenders(hl.formation) > defenders(formationForClub(hc))) moreDef++ }
  if (changed && gap <= -6) { weaker++; if (attackers(hl.formation) > attackers(formationForClub(hc))) fewerDef++ }

  // Your side is never reshaped: you chose it.
  const mine = lineupsForMatch(home, away, { ...o, playerClubId: hc, playerFormation: '4-3-3' as any, homeRotation: undefined, unavailableIds: undefined })
  if (mine.homeLineup) check(mine.homeLineup.formation === '4-3-3', `match ${s}: your shape was changed`)
}

const pct = (a: number, b: number) => `${b ? Math.round(a / b * 100) : 0}%`
console.log(`${matches} matches · shape changed ${pct(switched, matches)} · with players missing ${pct(switchedAbsence, withAbsence)} · without ${pct(switched - switchedAbsence, matches - withAbsence)}`)
console.log(`when changing against a much stronger side, more defenders ${pct(moreDef, stronger)}; against a much weaker one, more attackers ${pct(fewerDef, weaker)}`)
// A club has a shape: it changes sometimes, not every week.
check(switched / matches > 0.05 && switched / matches < 0.5, `shape changes ${pct(switched, matches)} of the time — outside 5–50%`)
check(moreDef / Math.max(1, stronger) > 0.6, 'against stronger sides, changes don\'t lean defensive')
check(fewerDef / Math.max(1, weaker) > 0.5, 'against weaker sides, changes don\'t lean attacking')

// P8-124: shirt numbers mean the position, every one different.
for (const f of ALL_FORMATIONS) {
  const slots = getSlotsForFormation(f)
  const n = shirtNumbers(slots)
  const at = (label: string) => slots.filter(s => s.label === label).map(s => n.get(s.slotIndex)!)
  check(new Set(n.values()).size === slots.length, `${f}: two shirts share a number`)
  check(at('GK')[0] === 1, `${f}: the keeper isn't 1`)
  if (at('ST').length) check(at('ST').includes(9), `${f}: no striker wears 9`)
  if (at('CAM').length === 1) check(at('CAM')[0] === 10, `${f}: the number ten isn't 10`)
  if (at('RB').length) check(at('RB')[0] === 2, `${f}: the right-back isn't 2`)
  if (at('LB').length) check(at('LB')[0] === 3, `${f}: the left-back isn't 3`)
}
{
  const slots = getSlotsForFormation('4-3-3')
  const n = shirtNumbers(slots)
  check(slots.map(s => n.get(s.slotIndex)).join(',') === '1,2,5,4,3,8,6,10,7,9,11', `4-3-3 numbers ${slots.map(s => n.get(s.slotIndex)).join(',')}`)
  const two = getSlotsForFormation('4-4-2'), m = shirtNumbers(two)
  check(two.filter(s => s.label === 'ST').map(s => m.get(s.slotIndex)).join(',') === '9,10', "4-4-2's strikers aren't 9 and 10")
}

if (failures === 0) console.log('✅ ALL CHECKS PASSED')
else console.log(`${failures} failure(s)`)
process.exit(failures === 0 ? 0 : 1)
