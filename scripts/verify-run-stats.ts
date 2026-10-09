// Verifies the per-90 figures and position ranks (src/engine/run-aggregates.ts):
//  - per 90 is exactly total / minutes x 90, and null under the minutes floor
//  - averages, awards and clean sheets are never per 90
//  - ranks are within each line only, level players share a rank, rank 1 is
//    the best figure, and percentiles fall in (0, 1]
//  - the TOP x% tag appears only in the top tenth of a line of ten or more
//  - input order never changes a rank
//  - club totals (P8-80) are the exact sums of each club's side of its match sheets
//  - each mode's run has as many teams-of-the-matchday rounds as it has real
//    matchdays (P8-100): a World Cup is 3 group matchdays + its knockout rounds,
//    not one round per group per matchday
// Run: npx tsx scripts/verify-run-stats.ts

import { per90, positionRanks, percentileTag, canPer90, value, PER90_MIN_MINUTES, type StatKey } from '../src/engine/run-aggregates'
import { lineOf } from '../src/engine/awards'
import type { PlayerStatLine } from '../src/types/stats'
import { createStatsAccumulator } from '../src/engine/stats'
import { clTieShootout } from '../src/engine/match-context'
import { roundKeyOf, leagueRunMatches, clRunMatches, wcRunMatches, type RunMatch } from '../src/engine/run-matches'
import { simulateWorldCup, assignGroups, generateWCGroupFixtures, type WCTeam } from '../src/engine/world-cup-sim'

let failures = 0
function check(cond: boolean, msg: string) {
  if (!cond) { failures++; if (failures <= 30) console.log(`❌ ${msg}`) }
}

const POS = ['GK', 'CB', 'CB', 'LB', 'RB', 'CDM', 'CM', 'CAM', 'LW', 'RW', 'ST']
const KEYS: StatKey[] = ['goals', 'assists', 'tacklesWon', 'saves', 'avgRating', 'cleanSheets', 'chancesCreated']

for (let s = 1; s <= 300; s++) {
  const players: PlayerStatLine[] = Array.from({ length: 220 }, (_, i) => ({
    playerId: `p${String(i).padStart(3, '0')}`, name: `P${i}`, seasonLabel: '24/25',
    clubId: `c${i % 20}`, clubName: `Club ${i % 20}`, position: POS[i % POS.length],
    goals: (i * s) % 13, assists: (i * 7 + s) % 9, cleanSheets: (i + s) % 11,
    tacklesWon: (i * 3 + s) % 41, saves: POS[i % POS.length] === 'GK' ? (i * 5 + s) % 90 : 0,
    chancesCreated: (i * 11 + s) % 37,
    minutes: (i * 97 + s * 31) % 3200, avgRating: 6 + ((i * 13 + s) % 20) / 10, matchesRated: (i + s) % 38,
  }))
  for (const p of players.slice(0, 40)) {
    for (const k of KEYS) {
      const v = per90(p, k)
      if (!canPer90(k)) check(v === null, `per 90 given for ${k}`)
      else if ((p.minutes ?? 0) < PER90_MIN_MINUTES) check(v === null, `per 90 under the minutes floor`)
      else check(v !== null && Math.abs(v - (value(p, k) / p.minutes!) * 90) < 0.006, `per 90 wrong for ${k}`)
    }
  }
  for (const k of KEYS) {
    for (const mode of ['total', 'per90'] as const) {
      const ranks = positionRanks(players, k, mode)
      const again = positionRanks([...players].reverse(), k, mode)
      check([...ranks.entries()].every(([id, r]) => JSON.stringify(again.get(id)) === JSON.stringify(r)), `${k}/${mode}: input order changed a rank`)
      const byLine = new Map<string, [string, number][]>()
      for (const [id, r] of ranks) {
        const p = players.find(x => x.playerId === id)!
        check(r.percentile > 0 && r.percentile <= 1 && r.rank >= 1 && r.rank <= r.of, `${k}/${mode}: bad rank`)
        const score = mode === 'per90' ? per90(p, k)! : value(p, k)
        byLine.set(lineOf(p.position), [...(byLine.get(lineOf(p.position)) ?? []), [id, score]])
        const tag = percentileTag(p, r)
        check(!tag || (r.of >= 10 && r.rank / r.of <= 0.1), `${k}/${mode}: tag outside the top tenth`)
      }
      for (const list of byLine.values()) {
        const best = Math.max(...list.map(x => x[1]))
        for (const [id, sc] of list) {
          const r = ranks.get(id)!
          if (sc === best) check(r.rank === 1, `${k}/${mode}: the best in a line isn't ranked 1`)
          check(r.rank === 1 + list.filter(x => x[1] > sc).length, `${k}/${mode}: rank isn't the count ahead plus one`)
        }
      }
    }
  }
}

// ── The ranking at a full path's size (Phase 9.75, the release readings) ────
// stats:board took 179–776 ms on the phone: the ranking was quadratic (a copy
// of the line per player, a findIndex per player, localeCompare in the sort).
// 6,000 players, the size of a long full path's board: the one pass does it in
// a few milliseconds in Node; the quadratic one took seconds.
{
  const KEY: StatKey = 'goals'
  const big: PlayerStatLine[] = Array.from({ length: 6000 }, (_, i) => ({
    playerId: `p${i}`, name: `P ${i}`, clubId: `c${i % 300}`, clubName: `Club ${i % 300}`, isPlayerClub: false,
    position: ['GK', 'CB', 'CM', 'ST'][i % 4], goals: (i * 7919) % 23, assists: 0, matchesPlayed: 10, minutes: 900,
  }) as unknown as PlayerStatLine)
  const t0 = performance.now()
  positionRanks(big, KEY, 'total')
  const ms = performance.now() - t0
  check(ms < 60, `ranking 6,000 players took ${ms.toFixed(0)} ms (quadratic?)`)
  console.log(`ranking 6,000 players: ${ms.toFixed(1)} ms`)
}

// ── P8-80: club totals from the match sheets ─────────────────────────────────
// Feeds the accumulator hand-made sheets with known numbers, then checks each
// club's totals are the exact sums from its own side of every sheet, possession
// averages to 50 across the league, and xG for and against balance.
{
  const acc = createStatsAccumulator({ rosterIndex: new Map(), clubGK: new Map() })
  const sheet = (i: number, side: number) => ({
    possession: side === 0 ? 40 + (i % 21) : 60 - (i % 21), xg: ((i * 7 + side * 3) % 30) / 10,
    shots: (i + side * 5) % 19, shotsOnTarget: (i + side) % 7, bigChances: (i * 3 + side) % 4,
    passAccuracy: 70 + ((i + side) % 20), corners: (i + side * 2) % 9, fouls: (i * 2 + side) % 15,
    yellowCards: (i + side) % 4, redCards: (i * 13 + side) % 17 === 0 ? 1 : 0,
  }) as unknown as import('../src/types/match-stats').TeamStatLine
  const expect = new Map<string, Record<string, number>>()
  const bump = (club: string, us: Record<string, number>, them: Record<string, number>) => {
    const e = expect.get(club) ?? { matches: 0, xg: 0, xgAgainst: 0, shots: 0, possessionSum: 0, yellowCards: 0 }
    e.matches++; e.xg += us.xg; e.xgAgainst += them.xg; e.shots += us.shots; e.possessionSum += us.possession; e.yellowCards += us.yellowCards
    expect.set(club, e)
  }
  for (let i = 0; i < 380; i++) {
    const h = `c${i % 20}`, a = `c${(i * 7 + 3) % 20}`
    if (h === a) continue
    const home = sheet(i, 0), away = sheet(i, 1)
    acc.recordMatch({ homeClubId: h, awayClubId: a, homeClubName: h, awayClubName: a, homeGoals: i % 4, awayGoals: i % 3, scorers: { home: [], away: [] }, sheet: { home, away } })
    bump(h, home as never, away as never); bump(a, away as never, home as never)
  }
  const teams = acc.build().teams
  let posSum = 0, posN = 0, xgFor = 0, xgAg = 0
  for (const t of teams) {
    const e = expect.get(t.clubId)!
    check(t.matches === e.matches, `club totals: ${t.clubId} matches ${t.matches} vs ${e.matches}`)
    check(Math.abs((t.xg ?? 0) - e.xg) < 1e-9 && Math.abs((t.xgAgainst ?? 0) - e.xgAgainst) < 1e-9, `club totals: ${t.clubId} xG`)
    check(t.shots === e.shots && t.yellowCards === e.yellowCards && t.possessionSum === e.possessionSum, `club totals: ${t.clubId} shots/cards/possession`)
    posSum += t.possessionSum!; posN += t.matches!; xgFor += t.xg!; xgAg += t.xgAgainst!
  }
  check(Math.abs(posSum / posN - 50) < 1e-9, `league possession averages ${posSum / posN}, not 50`)
  check(Math.abs(xgFor - xgAg) < 1e-6, 'xG for and against do not balance across the league')
}

// ── P8-100: rounds per mode ──────────────────────────────────────────────────
// The teams of the matchday are one per round, so the round count is what the
// "Picked N times in M" award divides by. Each mode's match list is built by the
// same pure function the app uses, then its distinct round keys are counted.
{
  const roundsOf = (ms: RunMatch[]) => {
    const byRound = new Map<string, number>()
    ms.forEach((m, i) => byRound.set(roundKeyOf(m, i), (byRound.get(roundKeyOf(m, i)) ?? 0) + 1))
    return byRound
  }
  const fx = (h: string, a: string) => ({ homeClubId: h, awayClubId: a, homeClubName: h, awayClubName: a })

  // World Cup: the real 48-team simulator, played many times so every exit
  // (groups, R32 … final) turns up. Group games come from the real fixture list.
  for (let run = 0; run < 400; run++) {
    const teams: WCTeam[] = Array.from({ length: 48 }, (_, i) => ({
      clubId: `n${i}`, clubName: `N${i}`, ovr: 70 + ((i * 37 + run) % 25), isPlayer: i === 0, form: 0,
      stats: { played: 0, won: 0, drawn: 0, lost: 0, goalsFor: 0, goalsAgainst: 0, points: 0 },
      confederation: 'X', groupId: '', groupPoints: 0, groupWins: 0, groupDraws: 0, groupLosses: 0,
      groupGF: 0, groupGA: 0, groupPlayed: 0,
    }))
    const groups = assignGroups(teams)
    const result = simulateWorldCup(teams)
    result.groupMatchdays = generateWCGroupFixtures(groups).map(f => ({
      groupId: f.home.groupId, matchday: f.matchday, homeGoals: 1, awayGoals: 0,
      home: { clubId: f.home.clubId, clubName: f.home.clubName, isPlayer: f.home.isPlayer },
      away: { clubId: f.away.clubId, clubName: f.away.clubName, isPlayer: f.away.isPlayer },
    })) as never
    const rounds = roundsOf(wcRunMatches(result))
    const expected = 3 + result.knockoutRounds.filter(r => r.matches.length).length
    check(rounds.size === expected, `World Cup: ${rounds.size} rounds, expected ${expected}`)
    // A group-stage round holds every group's game that matchday (12 groups × 2).
    for (let md = 1; md <= 3; md++)
      check(rounds.get(`Group stage · MD ${md}`) === 24, `World Cup: group matchday ${md} holds ${rounds.get(`Group stage · MD ${md}`)} games, not 24`)
  }

  // Champions League, custom path: four qualifying rounds (two legs each), eight
  // league-phase matchdays, four two-legged knockout rounds and the final.
  // Each leg is its own matchday, as in the real competition: 8 + 8 + 8 + 1 = 25.
  const leg = { aGoals: 1, bGoals: 0 }
  const tie = (round: string, i: number) => ({ round, teamA: { clubId: `a${round}${i}`, clubName: 'A' }, teamB: { clubId: `b${round}${i}`, clubName: 'B' }, leg1: leg, leg2: leg })
  const cl = {
    leagueMatchdays: Array.from({ length: 8 * 18 }, (_, i) => ({ ...fx(`h${i}`, `a${i}`), matchday: 1 + Math.floor(i / 18), home: { clubId: `h${i}`, clubName: 'H' }, away: { clubId: `a${i}`, clubName: 'A' }, homeGoals: 1, awayGoals: 1 })),
    playoffRound: [0, 1, 2, 3].map(i => tie('playoff', i)), r16: [0, 1].map(i => tie('r16', i)),
    qf: [0, 1].map(i => tie('qf', i)), sf: [0, 1].map(i => tie('sf', i)),
    final: { teamA: { clubId: 'fa', clubName: 'FA' }, teamB: { clubId: 'fb', clubName: 'FB' }, aGoals: 2, bGoals: 1 },
  }
  const qual = (['q1', 'q2', 'q3', 'playoff'] as const).flatMap(round => [0, 1, 2].map(i => ({
    round, teamA: { clubId: `qa${round}${i}`, clubName: 'QA' }, teamB: { clubId: `qb${round}${i}`, clubName: 'QB' },
    legs: { leg1: { homeGoals: 1, awayGoals: 0 }, leg2: { homeGoals: 0, awayGoals: 0 } },
  })))
  check(roundsOf(clRunMatches(cl as never)).size === 17, `Champions League: ${roundsOf(clRunMatches(cl as never)).size} rounds, expected 17`)
  check(roundsOf(clRunMatches(cl as never, qual as never)).size === 25, `Champions League (full path): ${roundsOf(clRunMatches(cl as never, qual as never)).size} rounds, expected 25`)
  // P8-116: the qualifying legs, and only they, are marked as qualifying (their awards are their own).
  const staged = clRunMatches(cl as never, qual as never)
  check(staged.filter(m => m.stage === 'qualifying').length === qual.length * 2, 'every qualifying leg is marked qualifying')
  check(staged.filter(m => !m.stage).length === clRunMatches(cl as never).length, 'a league-phase or knockout match is marked qualifying')
  check(!clRunMatches(cl as never).some(m => m.stage), 'the classic Champions League has no qualifying stage')
  // F-20: the full path's domestic season counts, as its own stage, one round
  // per matchday, ahead of qualifying, with every match's seed kept.
  const domesticMatchdays = Array.from({ length: 38 * 10 }, (_, i) => ({ matchday: 1 + Math.floor(i / 10), home: { clubId: `dh${i % 10}`, clubName: 'DH' }, away: { clubId: `da${i % 10}`, clubName: 'DA' }, homeGoals: 2, awayGoals: 1, seed: 1000 + i }))
  const full = clRunMatches({ ...cl, domesticMatchdays } as never, qual as never)
  const dom = full.filter(m => m.stage === 'domestic')
  check(dom.length === 380 && dom.every((m, i) => m.seed === 1000 + i), `the domestic season: ${dom.length} matches counted, want 380 with their seeds`)
  check(full.slice(0, 380).every(m => m.stage === 'domestic'), 'the domestic season is not first')
  check(roundsOf(full).size === 25 + 38, `the full path with its season: ${roundsOf(full).size} rounds, expected 63`)
  check(full.filter(m => !m.stage).length === clRunMatches(cl as never).length, 'a domestic match landed in the European stage')

  // League: one round per matchday, every fixture in it.
  const history = Array.from({ length: 38 }, (_, md) => ({
    matchday: md + 1,
    fixtures: Array.from({ length: 10 }, (_, i) => ({ home: { clubId: `c${i}`, clubName: 'H' }, away: { clubId: `d${i}`, clubName: 'A' }, result: { homeGoals: 1, awayGoals: 0 } })),
  }))
  const league = roundsOf(leagueRunMatches({ matchdayHistory: history } as never))
  check(league.size === 38 && [...league.values()].every(n => n === 10), `League: ${league.size} rounds, expected 38 of 10 games`)
}

// ── P8-103: the shootout, told from each match's side ────────────────────────
// Leg 2 is at teamB's ground, so its home side's kicks are B's, and a live tie
// that kept only the named kicks still gives the raw sequence.
{
  const kick = (scored: boolean, i: number) => ({ name: `K${i}`, scored }) as never
  const t = { teamA: { clubName: 'A' }, teamB: { clubName: 'B' }, winner: { clubName: 'A' }, aPens: 4, bPens: 2,
    aPenKicks: [true, true, true, true], bPenKicks: [true, false, true, false] } as never
  const home = clTieShootout(t, true), away = clTieShootout(t, false)
  check(home.pensNote === 'Penalties 4 – 2 · A advance' && away.pensNote === 'Penalties 2 – 4 · A advance', `shootout note orientation: ${home.pensNote} / ${away.pensNote}`)
  check(JSON.stringify(away.shootout?.home) === JSON.stringify([true, false, true, false]), 'leg 2: the home kicks are teamB\'s')
  const named = clTieShootout({ ...(t as object), aPenKicks: undefined, bPenKicks: undefined,
    penKicksA: [true, true].map(kick), penKicksB: [false, true].map(kick) } as never, false)
  check(JSON.stringify(named.shootout?.home) === '[false,true]' && !!named.shootout?.homeKicks, 'named-only kicks give the raw sequence')
  check(Object.keys(clTieShootout({ ...(t as object), aPens: undefined } as never, true)).length === 0, 'no shootout, nothing added')
}

if (failures === 0) console.log('✅ ALL CHECKS PASSED')
else console.log(`${failures} failure(s)`)
process.exit(failures === 0 ? 0 : 1)
