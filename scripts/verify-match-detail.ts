// Headless validator for the deep match-stat generator (src/engine/match-detail.ts).
// Run: npx tsx scripts/verify-match-detail.ts
//
// Checks, across thousands of simulated matches:
//  1. Determinism — same seed → byte-identical MatchStats.
//  2. Hard invariants — goals/shots/saves/possession/duels/fouls all reconcile.
//  3. Rating sanity — strikers out-rate defensive mids on average, MOTM
//     correlates with goal involvement, nobody on a thrashed side rates 8+,
//     ratings live in a sane band around ~6.5.
//  4. Upset texture — when a much better team loses, it frequently still wins
//     possession/xG ("dominated but lost").

import { simulateMatch } from '../src/engine/match.ts'
import { attributeMatchScorers } from '../src/engine/stats.ts'
import { generateMatchDetail } from '../src/engine/match-detail.ts'
import { mulberry32, randomSeed } from '../src/lib/rng.ts'
import type { RosterPlayer, MatchScorers } from '../src/types/stats.ts'
import type { SimTeam } from '../src/types/simulation.ts'

let failures = 0
function check(cond: boolean, msg: string) {
  if (!cond) { failures++; console.error(`  ✗ ${msg}`) }
}

// ── Synthetic squads (engine is pure — no DB needed) ────────────────────────
const XI_POS = ['GK', 'CB', 'CB', 'LB', 'RB', 'CDM', 'CM', 'CAM', 'LW', 'RW', 'ST']
const BENCH_POS = ['GK', 'CB', 'CM', 'RW', 'ST']

function makePool(clubId: string, baseOvr: number, withBench: boolean, rng: () => number): RosterPlayer[] {
  const mk = (pos: string, i: number, isBench: boolean): RosterPlayer => {
    const ovr = Math.round(baseOvr + (rng() - 0.5) * 10 - (isBench ? 4 : 0))
    const atkBias = pos === 'ST' || pos === 'LW' || pos === 'RW' ? 8 : pos === 'CAM' ? 5 : pos === 'CB' || pos === 'GK' ? -12 : -3
    return {
      playerId: `${clubId}-p${i}${isBench ? 'b' : ''}`,
      name: `${clubId} ${pos}${i}`,
      primaryPosition: pos,
      attack: Math.max(30, ovr + atkBias + Math.round((rng() - 0.5) * 6)),
      ovr, isBench: isBench || undefined,
      birthYear: 1995, yearStart: 2024, seasonLabel: '24/25',
      clubId, clubName: `Club ${clubId}`,
    }
  }
  const pool = XI_POS.map((pos, i) => mk(pos, i, false))
  if (withBench) pool.push(...BENCH_POS.map((pos, i) => mk(pos, 100 + i, true)))
  return pool
}

function simTeam(clubId: string, ovr: number): SimTeam {
  return {
    clubId, clubName: `Club ${clubId}`, ovr, isPlayer: false, form: 0,
    stats: { played: 0, won: 0, drawn: 0, lost: 0, goalsFor: 0, goalsAgainst: 0, points: 0 },
  }
}

// ── Main loop ───────────────────────────────────────────────────────────────
const N = 4000
const poolRng = mulberry32(42)

type Sample = {
  homeOvr: number; awayOvr: number; hg: number; ag: number; isUpset: boolean
  homeXg: number; awayXg: number; homePoss: number
  ratings: { pos: string; rating: number; goals: number; assists: number; motm: boolean; minutes: number; side: 'w' | 'l' | 'd' }[]
}
const samples: Sample[] = []

console.log(`Simulating ${N} matches with full stat generation…`)
const t0 = Date.now()

for (let i = 0; i < N; i++) {
  const homeOvr = 68 + Math.floor(poolRng() * 24)
  const awayOvr = 68 + Math.floor(poolRng() * 24)
  const withBench = poolRng() < 0.8
  const homePool = makePool(`H${i}`, homeOvr, withBench, poolRng)
  const awayPool = makePool(`A${i}`, awayOvr, withBench, poolRng)

  const result = simulateMatch(simTeam(`H${i}`, homeOvr), simTeam(`A${i}`, awayOvr))
  const seed = randomSeed()
  const scorers: MatchScorers = attributeMatchScorers(
    homePool, awayPool, result.homeGoals, result.awayGoals, { rng: mulberry32(seed) },
  )

  const input = {
    seed, homePool, awayPool,
    homeGoals: result.homeGoals, awayGoals: result.awayGoals,
    scorers,
  }
  const d = generateMatchDetail(input)
  if (!d) { check(false, `match ${i}: generator returned null`); continue }

  // 1) Determinism
  if (i % 25 === 0) {
    const d2 = generateMatchDetail(input)
    check(JSON.stringify(d) === JSON.stringify(d2), `match ${i}: NOT deterministic for same seed`)
    // Legacy path (no stored scorers): attribution re-derives from the seed —
    // must also be fully reproducible, and re-derive the SAME scorers.
    const legacy = { ...input, scorers: undefined }
    const l1 = generateMatchDetail(legacy)
    const l2 = generateMatchDetail(legacy)
    check(JSON.stringify(l1) === JSON.stringify(l2), `match ${i}: legacy path not deterministic`)
    const goalsOf = (dd: NonNullable<typeof d>) => dd.events.filter(e => e.type === 'goal').map(e => `${e.playerId}@${e.minute}`).join(',')
    if (l1 && d) check(goalsOf(l1) === goalsOf(d), `match ${i}: legacy attribution diverges from stored scorers`)
  }

  // 2) Invariants
  const sideLines = (isHome: boolean) => d.players.filter(p => p.isHome === isHome)
  for (const [isHome, goals, opp] of [[true, result.homeGoals, d.away], [false, result.awayGoals, d.home]] as const) {
    const t = isHome ? d.home : d.away
    const lines = sideLines(isHome)
    const sum = (f: (l: typeof lines[number]) => number) => lines.reduce((s, l) => s + f(l), 0)

    check(sum(l => l.goals) === goals, `match ${i}: Σ player goals ${sum(l => l.goals)} != team ${goals}`)
    const attributedAssists = (isHome ? scorers.home : scorers.away).filter(g => g.assistId).length
    check(sum(l => l.assists) === attributedAssists, `match ${i}: Σ assists mismatch`)
    check(t.shotsOnTarget >= goals, `match ${i}: team SOT < goals`)
    check(sum(l => l.shots) === t.shots, `match ${i}: Σ player shots != team shots`)
    check(sum(l => l.shotsOnTarget) === t.shotsOnTarget, `match ${i}: Σ player SOT != team SOT`)
    check(lines.every(l => l.shots >= l.shotsOnTarget && l.shotsOnTarget >= l.goals), `match ${i}: player shot ordering broken`)
    check(t.shots === t.shotsOnTarget + t.shotsOffTarget + t.shotsBlocked, `match ${i}: shot split mismatch`)
    check(t.shots === t.shotsInsideBox + t.shotsOutsideBox, `match ${i}: box split mismatch`)
    check(t.keeperSaves === opp.shotsOnTarget - (isHome ? result.awayGoals : result.homeGoals), `match ${i}: saves mismatch`)
    check(t.blocks === opp.shotsBlocked, `match ${i}: blocks != opp blocked shots`)
    check(sum(l => l.passes) === t.passes, `match ${i}: Σ passes != team`)
    check(lines.every(l => l.accuratePasses <= l.passes), `match ${i}: accurate > total passes`)
    check(sum(l => l.foulsCommitted) === t.fouls, `match ${i}: Σ fouls != team`)
    check(sum(l => l.foulsWon) === opp.fouls, `match ${i}: Σ fouls won != opp fouls`)
    check(sum(l => l.tacklesWon) === t.tacklesWon, `match ${i}: Σ tackles != team`)
    check(sum(l => l.touchesInOppBox) === t.touchesInOppBox, `match ${i}: Σ box touches != team`)
    check(t.bigChances >= t.bigChancesMissed, `match ${i}: big chances < missed`)
    check(t.xg > 0 || t.shots === 0, `match ${i}: zero xG with shots`)

    const gk = lines.find(l => l.gk)
    if (gk?.gk) {
      check(gk.gk.saves === t.keeperSaves, `match ${i}: GK line saves != team saves`)
      check(gk.gk.goalsConceded === (isHome ? result.awayGoals : result.homeGoals), `match ${i}: GK conceded mismatch`)
    }

    // Sub sanity: everyone who came on did so before doing anything; minutes coherent.
    for (const l of lines) {
      if (l.subOnMinute !== undefined) {
        check(l.subOnMinute >= 46, `match ${i}: sub came on at ${l.subOnMinute}' (before half-time — 45' rule broken)`)
        check(l.minutes > 0 && l.minutes <= d.duration - l.subOnMinute, `match ${i}: sub minutes incoherent (${l.minutes} on at ${l.subOnMinute})`)
      }
      if (l.subOffMinute !== undefined) check(l.minutes <= l.subOffMinute, `match ${i}: sub-off minutes incoherent`)
      check(l.minutes > 0 || (l.goals === 0 && l.assists === 0 && l.shots === 0 && l.passes === 0), `match ${i}: unused sub has stats`)
    }
    // Bench scorers really came on, before their goal.
    for (const g of (isHome ? scorers.home : scorers.away)) {
      const line = lines.find(l => l.playerId === g.scorerId)
      check(!!line && line.minutes > 0, `match ${i}: scorer ${g.scorerId} not on pitch`)
      if (line?.subOnMinute !== undefined) check(line.subOnMinute <= g.minute, `match ${i}: scored at ${g.minute} but on at ${line.subOnMinute}`)
    }
  }
  check(d.home.possession + d.away.possession === 100, `match ${i}: possession != 100`)

  // Collect for aggregate sanity
  const outcome = result.homeGoals > result.awayGoals ? 'home' : result.awayGoals > result.homeGoals ? 'away' : 'draw'
  samples.push({
    homeOvr, awayOvr, hg: result.homeGoals, ag: result.awayGoals, isUpset: result.isUpset,
    homeXg: d.home.xg, awayXg: d.away.xg, homePoss: d.home.possession,
    ratings: d.players.filter(p => p.minutes > 0).map(p => ({
      pos: p.position, rating: p.rating, goals: p.goals, assists: p.assists,
      motm: !!p.motm, minutes: p.minutes,
      side: outcome === 'draw' ? 'd' as const : (p.isHome === (outcome === 'home') ? 'w' as const : 'l' as const),
    })),
  })
}

const genMs = Date.now() - t0
console.log(`Done in ${genMs}ms (${(genMs / N).toFixed(2)}ms/match incl. full detail)\n`)

// ── 3) Rating sanity ────────────────────────────────────────────────────────
const allRatings = samples.flatMap(s => s.ratings)
const byPos = (positions: string[]) => {
  const r = allRatings.filter(x => positions.includes(x.pos) && x.minutes >= 60)
  return r.reduce((s, x) => s + x.rating, 0) / r.length
}
const avgAll = allRatings.reduce((s, x) => s + x.rating, 0) / allRatings.length
const stAvg = byPos(['ST', 'CF'])
const cdmAvg = byPos(['CDM'])
const gkAvg = byPos(['GK'])

console.log(`Ratings: overall avg ${avgAll.toFixed(2)} | ST ${stAvg.toFixed(2)} | CDM ${cdmAvg.toFixed(2)} | GK ${gkAvg.toFixed(2)}`)
check(avgAll > 6.0 && avgAll < 7.2, `overall avg rating ${avgAll.toFixed(2)} outside 6.0–7.2`)
check(stAvg > cdmAvg, `strikers (${stAvg.toFixed(2)}) do not out-rate CDMs (${cdmAvg.toFixed(2)})`)
check(gkAvg > 5.6 && gkAvg < 7.4, `GK avg ${gkAvg.toFixed(2)} out of band`)

// MOTM correlates with goal involvement
const motm = allRatings.filter(x => x.motm)
const motmInvolved = motm.filter(x => x.goals > 0 || x.assists > 0).length / motm.length
console.log(`MOTM with goal/assist: ${(motmInvolved * 100).toFixed(0)}%`)
check(motmInvolved > 0.5, `MOTM only involved in ${(motmInvolved * 100).toFixed(0)}% of matches (< 50%)`)

// Nobody rates 8+ on a side thrashed by 4+
let thrashedHigh = 0, thrashedCount = 0
for (const s of samples) {
  const margin = Math.abs(s.hg - s.ag)
  if (margin < 4) continue
  for (const r of s.ratings) if (r.side === 'l') {
    thrashedCount++
    if (r.rating >= 8) thrashedHigh++
  }
}
console.log(`Players rating 8+ on 4+-goal-losing sides: ${thrashedHigh}/${thrashedCount}`)
check(thrashedHigh / Math.max(1, thrashedCount) < 0.01, `too many 8+ ratings on thrashed sides`)

// Scorers rate clearly above non-scorers
const scorerAvg = allRatings.filter(x => x.goals > 0).reduce((s, x) => s + x.rating, 0) / Math.max(1, allRatings.filter(x => x.goals > 0).length)
console.log(`Scorer avg rating ${scorerAvg.toFixed(2)} vs overall ${avgAll.toFixed(2)}`)
check(scorerAvg > avgAll + 0.5, `scoring doesn't lift ratings enough`)

// ── 4) Upset texture: better team loses but often dominates the sheet ───────
const upsets = samples.filter(s => s.isUpset && s.hg !== s.ag)
let loserDominatesXg = 0, loserDominatesPoss = 0
for (const s of upsets) {
  const homeLost = s.hg < s.ag
  const loserXg = homeLost ? s.homeXg : s.awayXg
  const winnerXg = homeLost ? s.awayXg : s.homeXg
  const loserPoss = homeLost ? s.homePoss : 100 - s.homePoss
  if (loserXg > winnerXg) loserDominatesXg++
  if (loserPoss > 50) loserDominatesPoss++
}
console.log(`\nUpsets: ${upsets.length}. Beaten favourite still won xG: ${(loserDominatesXg / Math.max(1, upsets.length) * 100).toFixed(0)}%, possession: ${(loserDominatesPoss / Math.max(1, upsets.length) * 100).toFixed(0)}%`)
check(loserDominatesXg / Math.max(1, upsets.length) > 0.4, `upset losers rarely dominate xG — texture too result-driven`)
check(loserDominatesPoss / Math.max(1, upsets.length) > 0.55, `upset losers rarely win possession`)

// Non-upset: better teams generally look better
const routine = samples.filter(s => !s.isUpset && Math.abs(s.homeOvr - s.awayOvr) > 8)
let betterLooksBetter = 0
for (const s of routine) {
  const homeBetter = s.homeOvr > s.awayOvr
  if ((homeBetter && s.homePoss > 50) || (!homeBetter && s.homePoss < 50)) betterLooksBetter++
}
console.log(`Clear-favourite matches where favourite won possession: ${(betterLooksBetter / Math.max(1, routine.length) * 100).toFixed(0)}%`)
check(betterLooksBetter / Math.max(1, routine.length) > 0.75, `favourites don't dominate possession often enough`)

// xG averages
const avgXg = samples.reduce((s, x) => s + x.homeXg + x.awayXg, 0) / (samples.length * 2)
console.log(`Average xG per team per match: ${avgXg.toFixed(2)}`)
check(avgXg > 0.7 && avgXg < 2.6, `avg xG ${avgXg.toFixed(2)} implausible`)

console.log(failures === 0 ? '\n✅ ALL CHECKS PASSED' : `\n❌ ${failures} FAILURES`)
process.exit(failures === 0 ? 0 : 1)
