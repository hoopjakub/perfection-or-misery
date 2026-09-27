// P8-36: does Defender of the season go to the defenders the numbers say it
// should? It used to be decided on the season score, which rewards the assists
// and chances created that full-backs pile up, so LB and RB won it even when a
// centre-back had the better defensive season.
//
// This plays whole 20-club seasons through the real pipeline — scorers
// attributed, every match sheet generated, the season accumulated, the awards
// computed — and compares, season by season:
//  - the old winner (best `score` among defenders),
//  - the new winner (the defender score, evened by position — DEF_EVEN),
//  - the defender with the best pure defensive numbers (tackles + interceptions
//    + blocks + clearances), the "what the numbers say" reference.
// Checks (P8-36's follow-up): the defender award goes mostly, not always, to
// centre-backs — a great full-back season can win it — every positional award
// goes to a position it's for, and every position wins something across the
// seasons.
// Scorers are attributed with a seeded rng, so a run is reproducible.
// Run: npx tsx scripts/verify-defender.ts

import { attributeMatchScorers, createStatsAccumulator, computeAwards, buildClubGKMap } from '../src/engine/stats'
import { generateMatchDetail } from '../src/engine/match-detail'
import { buildAwardsNight, lineOf } from '../src/engine/awards'
import { mulberry32 } from '../src/lib/rng'
import type { RosterPlayer, AwardCandidate } from '../src/types/stats'

let failures = 0
function check(cond: boolean, msg: string) {
  if (!cond) { failures++; if (failures <= 30) console.log(`❌ ${msg}`) }
}

function rng(seed: number) {
  let s = seed >>> 0
  return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296 }
}
function poisson(r: () => number, mean: number) {
  const L = Math.exp(-mean); let k = 0, p = 1
  do { k++; p *= r() } while (p > L)
  return k - 1
}

const POS = ['GK', 'RB', 'CB', 'CB', 'LB', 'CDM', 'CM', 'CAM', 'RW', 'LW', 'ST', 'GK', 'CB', 'LB', 'CM', 'LW', 'ST']
const SEASONS = 60
const potsLines = new Map<string, number>()
const CLUBS = 20

const isCB = (pos: string) => pos === 'CB'
let oldCB = 0, newCB = 0, numbersCB = 0, seasons = 0
const winners = new Set<string>()
const perPos = new Map<string, { n: number; tk: number; int: number; clr: number; blk: number; ast: number; cc: number; min: number }>()

for (let s = 1; s <= SEASONS; s++) {
  const r = rng(s * 104729)
  const rosters = new Map<string, RosterPlayer[]>()
  const strength = new Map<string, number>()
  for (let c = 0; c < CLUBS; c++) {
    const id = `c${c}`
    const base = 70 + Math.round(r() * 14)
    strength.set(id, base)
    rosters.set(id, POS.map((pos, i) => {
      const ovr = base + Math.round((r() - 0.5) * 10)
      return {
        playerId: `${id}-${i}`, name: `Player ${id}x${i}`, primaryPosition: pos,
        attack: ovr, ovr, isBench: i >= 11, birthYear: 1996, yearStart: 2024, seasonLabel: '24/25',
        clubId: id, clubName: `Club ${c}`,
      }
    }))
  }
  const rosterIndex = new Map<string, RosterPlayer>()
  for (const pool of rosters.values()) for (const p of pool) rosterIndex.set(p.playerId, p)
  const acc = createStatsAccumulator({ rosterIndex, clubGK: buildClubGKMap(rosters) })
  const points = new Map<string, number>()
  let idx = 0
  for (let h = 0; h < CLUBS; h++) for (let a = 0; a < CLUBS; a++) {
    if (h === a) continue
    const hid = `c${h}`, aid = `c${a}`
    const diff = (strength.get(hid)! - strength.get(aid)!) / 10
    const hg = poisson(r, Math.max(0.3, 1.45 + diff * 0.5)), ag = poisson(r, Math.max(0.3, 1.15 - diff * 0.5))
    const seed = s * 1_000_003 + idx++
    const lineups = { seed, benchSize: 6 }
    const scorers = attributeMatchScorers(rosters.get(hid)!, rosters.get(aid)!, hg, ag, { lineups, rng: mulberry32(seed) })
    const detail = generateMatchDetail({ seed, homePool: rosters.get(hid)!, awayPool: rosters.get(aid)!, homeGoals: hg, awayGoals: ag, scorers, benchSize: 6 })
    const played = detail?.players.filter(l => l.minutes > 0) ?? []
    acc.recordMatch({ homeClubId: hid, awayClubId: aid, homeClubName: `Club ${h}`, awayClubName: `Club ${a}`, homeGoals: hg, awayGoals: ag, scorers, lines: played, sheet: detail ? { home: detail.home, away: detail.away } : undefined })
    points.set(hid, (points.get(hid) ?? 0) + (hg > ag ? 3 : hg === ag ? 1 : 0))
    points.set(aid, (points.get(aid) ?? 0) + (ag > hg ? 3 : hg === ag ? 1 : 0))
  }
  const stats = acc.build()
  const table = [...points.entries()].sort((x, y) => y[1] - x[1])
  const finalPositionByClub = new Map(table.map(([id], i) => [id, i + 1]))
  const awards = computeAwards(stats, { rosterIndex, finalPositionByClub, teamsInComp: CLUBS })
  const night = buildAwardsNight({ awards, stats })
  // P8-155: which line the Player of the Season came from.
  if (night.playerOfTheSeason) potsLines.set(lineOf(night.playerOfTheSeason.winner.position), (potsLines.get(lineOf(night.playerOfTheSeason.winner.position)) ?? 0) + 1)
  const def = night.players.find(a => a.key === 'defender')
  check(!!def, `season ${s}: no defender award`)
  if (!def) continue
  check(lineOf(def.winner.position) === 'DEF', `season ${s}: the defender award went to a ${def.winner.position}`)
  // Every positional award goes to a position it's for, and each is awarded.
  const FOR: Record<string, string[]> = {
    fullback: ['RB', 'LB', 'RWB', 'LWB'], midfielder: ['CDM', 'CM', 'CAM', 'RM', 'LM'], defensiveMid: ['CDM', 'CM'], attackingMid: ['CAM', 'CM'],
    winger: ['RW', 'LW', 'RM', 'LM'], forward: ['ST', 'CF'], glove: ['GK'],
  }
  for (const [key, positions] of Object.entries(FOR)) {
    const a = night.players.find(x => x.key === key)
    check(!!a, `season ${s}: no ${key} award`)
    if (a) check(positions.includes(a.winner.position), `season ${s}: ${key} went to a ${a.winner.position}`)
  }
  for (const a of night.players) winners.add(a.winner.position)

  const defenders = awards.playerOfTheSeason.filter(c => lineOf(c.position) === 'DEF')
  const by = (f: (c: AwardCandidate) => number) => [...defenders].sort((x, y) => f(y) - f(x))[0]
  const oldWinner = by(c => c.score)
  const numbers = by(c => (c.tacklesWon ?? 0) + (c.interceptions ?? 0) + (c.blocks ?? 0) + (c.clearances ?? 0))
  seasons++
  if (isCB(oldWinner.position)) oldCB++
  if (isCB(def.winner.position)) newCB++
  if (isCB(numbers.position)) numbersCB++

  for (const p of stats.players) {
    if (lineOf(p.position) !== 'DEF' || (p.minutes ?? 0) < 900) continue
    const k = isCB(p.position) ? 'CB' : 'FB'
    const t = perPos.get(k) ?? { n: 0, tk: 0, int: 0, clr: 0, blk: 0, ast: 0, cc: 0, min: 0 }
    t.n++; t.tk += p.tacklesWon ?? 0; t.int += p.interceptions ?? 0; t.clr += p.clearances ?? 0; t.blk += p.blocks ?? 0
    t.ast += p.assists; t.cc += p.chancesCreated ?? 0; t.min += p.minutes ?? 0
    perPos.set(k, t)
  }
}

for (const [k, t] of perPos) {
  const p90 = (v: number) => (v / t.min * 90).toFixed(2)
  console.log(`${k}: per 90 — tackles ${p90(t.tk)}, interceptions ${p90(t.int)}, clearances ${p90(t.clr)}, blocks ${p90(t.blk)}, assists ${p90(t.ast)}, chances ${p90(t.cc)}`)
}
const pct = (n: number) => `${Math.round(n / seasons * 100)}%`
console.log(`Defender of the season to a centre-back over ${seasons} seasons — old award ${pct(oldCB)}, new ${pct(newCB)} (raw defensive numbers: ${pct(numbersCB)})`)
console.log(`Positions that won at least one award: ${[...winners].sort().join(', ')}`)
console.log(`Player of the season by line: ${['GK', 'DEF', 'MID', 'FWD'].map(l => `${l} ${potsLines.get(l) ?? 0}`).join(' · ')}`)
// P8-155: a spread, not a strikers' list: forwards under two thirds, and at
// least three lines win it over the seasons.
check((potsLines.get('FWD') ?? 0) / seasons <= 0.66, `Player of the season to a forward ${pct(potsLines.get('FWD') ?? 0)}: a strikers' list`)
check([...potsLines.values()].filter(n => n > 0).length >= 3, `Player of the season only ever went to ${[...potsLines.keys()].join(', ')}`)
// P8-36 (the maintainer, 23 Sept): a really great full-back season should be
// able to win Defender of the season, but centre-backs, who defend more, should
// still take it more often. Between 55% and 90% to centre-backs.
check(newCB / seasons >= 0.55 && newCB / seasons <= 0.9, `defender award to centre-backs ${pct(newCB)}: outside 55–90%`)
check(newCB >= oldCB, 'the new defender award goes to centre-backs less often than the old one')
for (const pos of ['GK', 'CB', 'RB', 'LB', 'CDM', 'CM', 'CAM', 'RW', 'LW', 'ST'])
  check(winners.has(pos), `no ${pos} won any award in ${seasons} seasons`)

if (failures === 0) console.log('✅ ALL CHECKS PASSED')
else console.log(`${failures} failure(s)`)
process.exit(failures === 0 ? 0 : 1)
