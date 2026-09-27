// Verifies the one fixture player (src/engine/play-fixture.ts, P8-27): the
// Champions League league phase and the World Cup group stage now play every
// fixture through it, watched or skipped.
//  - the same seeds and the same randomness give byte-identical stored matches,
//    whether the phase is played matchday by matchday (watching) or in one go
//    (skipping)
//  - a stored scorer was never one of that match's absent players
//  - absences actually happen and are stored on the matches (the skip used to
//    price none of them into the result)
//  - sides that are mathematically done rest people late on (the skip used to
//    rest nobody)
//  - the table adds up and form moves, within [-1, 1]
// Run: npx tsx scripts/verify-play-fixture.ts

import { playFixture, type PlayedFixture } from '../src/engine/play-fixture'
import { createAvailabilityLedger } from '../src/engine/availability'
import { mulberry32 } from '../src/lib/rng'
import type { RosterPlayer } from '../src/types/stats'
import type { SimTeam } from '../src/types/simulation'

let failures = 0
function check(cond: boolean, msg: string) {
  if (!cond) { failures++; if (failures <= 30) console.log(`❌ ${msg}`) }
}

const XI_POS = ['GK', 'CB', 'CB', 'LB', 'RB', 'CDM', 'CM', 'CAM', 'LW', 'RW', 'ST']
const BENCH_POS = ['GK', 'CB', 'CM', 'RW', 'ST']
function makePool(clubId: string, baseOvr: number, rng: () => number): RosterPlayer[] {
  const mk = (pos: string, i: number, isBench: boolean): RosterPlayer => {
    const ovr = Math.round(baseOvr + (rng() - 0.5) * 10 - (isBench ? 4 : 0))
    return {
      playerId: `${clubId}-p${i}${isBench ? 'b' : ''}`, name: `${clubId} ${pos}${i}`, primaryPosition: pos,
      attack: Math.max(30, ovr + (pos === 'ST' ? 8 : pos === 'CB' || pos === 'GK' ? -12 : -3)),
      ovr, isBench: isBench || undefined, birthYear: 1995, yearStart: 2024, seasonLabel: '24/25',
      clubId, clubName: `Club ${clubId}`,
    }
  }
  return [...XI_POS.map((p, i) => mk(p, i, false)), ...BENCH_POS.map((p, i) => mk(p, 100 + i, true))]
}

// A league phase in miniature: 18 sides, 8 matchdays, a round-robin circle so
// nobody plays twice in a matchday.
const TEAMS = 18, MATCHDAYS = 8, CUTOFF = 8
function schedule(): [number, number][][] {
  const ids = Array.from({ length: TEAMS }, (_, i) => i)
  return Array.from({ length: MATCHDAYS }, (_, md) => {
    const rot = [ids[0], ...ids.slice(1).map((_, k) => ids[1 + ((k + md) % (TEAMS - 1))])]
    return Array.from({ length: TEAMS / 2 }, (_, k) => (md % 2 ? [rot[TEAMS - 1 - k], rot[k]] : [rot[k], rot[TEAMS - 1 - k]]) as [number, number])
  })
}

type Stored = PlayedFixture & { md: number; home: string; away: string }
function runPhase(runSeed: number, mode: 'watch' | 'skip'): { stored: Stored[]; teams: SimTeam[] } {
  const rng = mulberry32(runSeed)
  const pools = new Map<string, RosterPlayer[]>()
  const teams: SimTeam[] = Array.from({ length: TEAMS }, (_, i) => {
    const id = `C${i}`, ovr = 70 + ((i * 7 + runSeed) % 20)
    pools.set(id, makePool(id, ovr, rng))
    return { clubId: id, clubName: id, ovr, isPlayer: i === 0, form: 0, stats: { played: 0, won: 0, drawn: 0, lost: 0, goalsFor: 0, goalsAgainst: 0, points: 0 } }
  })
  const ledger = createAvailabilityLedger({ poolByClub: pools, playerClubId: 'C0', totalMatchdays: MATCHDAYS })
  // The engine's result roll uses Math.random; pin it so both modes see the same dice.
  const dice = mulberry32(runSeed * 7919)
  Math.random = dice
  const seeds = mulberry32(runSeed * 31)
  const stored: Stored[] = []
  const play = (md: number, [h, a]: [number, number]) => {
    const home = teams[h], away = teams[a]
    const p = playFixture(home, away, {
      matchday: md, seed: Math.floor(seeds() * 2 ** 31), poolByClub: pools, ledger,
      lineupCtx: { playerClubId: 'C0', benchSize: 5 },
      stakes: { standings: teams.map(t => ({ clubId: t.clubId, points: t.stats.points })), totalMatchdays: MATCHDAYS, playedMatchdays: md - 1, qualifyCutoff: CUTOFF },
    })
    stored.push({ ...p, md, home: home.clubId, away: away.clubId })
  }
  const days = schedule()
  if (mode === 'watch') {
    // Matchday by matchday, as the live loop does.
    for (let md = 1; md <= MATCHDAYS; md++) days[md - 1].forEach(f => play(md, f))
  } else {
    // Everything that's left in one go, as the skip does (here: the whole phase).
    days.forEach((fx, i) => fx.forEach(f => play(i + 1, f)))
  }
  return { stored, teams }
}

const clean = (s: Stored[]) => JSON.stringify(s, (_k, v) => (v instanceof Set ? [...v] : v))
let absentMatches = 0, rested = 0, lateRested = 0, formMoved = 0
const RUNS = 300
for (let run = 1; run <= RUNS; run++) {
  const watch = runPhase(run, 'watch')
  const skip = runPhase(run, 'skip')
  check(clean(watch.stored) === clean(skip.stored), `run ${run}: watching and skipping stored different matches`)

  for (const m of watch.stored) {
    const out = new Set(m.absent ?? [])
    if (out.size) absentMatches++
    const scorers = [...m.scorers.home, ...m.scorers.away]
    check(scorers.every(g => !out.has(g.scorerId) && (!g.assistId || !out.has(g.assistId))), `run ${run} MD ${m.md}: an absent player scored or assisted`)
    if (m.homeRotation > 0 || m.awayRotation > 0) { rested++; if (m.md >= MATCHDAYS - 1) lateRested++ }
    check(m.homeRotation >= 0 && m.awayRotation >= 0, 'negative rotation')
  }
  for (const t of watch.teams) {
    check(t.stats.played === MATCHDAYS, `run ${run}: ${t.clubId} played ${t.stats.played}`)
    check(t.stats.points === t.stats.won * 3 + t.stats.drawn, `run ${run}: ${t.clubId} points don't add up`)
    check(t.form >= -1 && t.form <= 1, `run ${run}: form out of range`)
    if (t.form !== 0) formMoved++
  }
  check(!watch.stored.some(m => m.home === 'C0' && m.homeRotation > 0) && !watch.stored.some(m => m.away === 'C0' && m.awayRotation > 0), 'your side was rotated')
}

console.log(`${RUNS} phases · matches with absences stored: ${absentMatches} · rested sides: ${rested} (${lateRested} on the last two matchdays) · sides whose form moved: ${formMoved}`)
check(absentMatches > 0, 'no match ever had an absence: availability is not reaching the fixture')
check(lateRested > 0, 'nobody ever rested late on: rotation is not reaching the fixture')
check(formMoved > RUNS * TEAMS * 0.9, 'form barely moves: it is not being updated')

if (failures === 0) console.log('✅ ALL CHECKS PASSED')
else console.log(`${failures} failure(s)`)
process.exit(failures === 0 ? 0 : 1)
