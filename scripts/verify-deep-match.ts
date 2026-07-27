// Headless validator for the Deep Simulation Match timeline (Big Fixes §7,
// src/engine/deep-match.ts). Run: npx tsx scripts/verify-deep-match.ts
//
// §7's architecture guard is the thing under test: the Deep Match must be a
// pure REPLAY of an already-decided match, never a second simulation. So the
// checks are all about reconciliation —
//
//  1. Determinism — same sheet + same seed → byte-identical timeline (twice
//     over, since pause/skip/re-entry all depend on it).
//  2. Nothing decided during playback — the final frame equals the sheet,
//     exactly, on every stat; the running score ends on the real scoreline.
//  3. Monotonicity — a cumulative counter never goes down, because "shots: 9"
//     turning into "shots: 8" a minute later is the tell-tale of a stat being
//     re-rolled rather than revealed.
//  4. Event anchoring — the minute a goal is scored, that side's shots and
//     shots-on-target move; a booking moves fouls and cards.
//  5. Ratings — every player ends on the sheet's rating, starts near 6.0, never
//     leaves 1–10, and is absent before he comes on.

import { simulateMatch } from '../src/engine/match.ts'
import { attributeMatchScorers } from '../src/engine/stats.ts'
import { generateMatchDetail } from '../src/engine/match-detail.ts'
import { buildDeepMatchTimeline } from '../src/engine/deep-match.ts'
import { mulberry32, randomSeed } from '../src/lib/rng.ts'
import type { RosterPlayer } from '../src/types/stats.ts'
import type { SimTeam } from '../src/types/simulation.ts'
import type { TeamStatLine } from '../src/types/match-stats.ts'

let failures = 0
function check(cond: boolean, msg: string) {
  if (!cond) { failures++; console.error(`  ✗ ${msg}`) }
}

// ── Synthetic squads (the engine is pure — no DB needed) ────────────────────
const XI_POS = ['GK', 'CB', 'CB', 'LB', 'RB', 'CDM', 'CM', 'CAM', 'LW', 'RW', 'ST']
const BENCH_POS = ['GK', 'CB', 'CM', 'RW', 'ST']

function makePool(clubId: string, baseOvr: number, rng: () => number): RosterPlayer[] {
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
  return [
    ...XI_POS.map((pos, i) => mk(pos, i, false)),
    ...BENCH_POS.map((pos, i) => mk(pos, 100 + i, true)),
  ]
}

function simTeam(clubId: string, ovr: number): SimTeam {
  return {
    clubId, clubName: `Club ${clubId}`, ovr, isPlayer: false, form: 0,
    stats: { played: 0, won: 0, drawn: 0, lost: 0, goalsFor: 0, goalsAgainst: 0, points: 0 },
  }
}

const N = 3000
const poolRng = mulberry32(7)

// A cup final can go to extra time, and a 120' timeline is where an off-by-one
// in the minute indexing would show up — so a healthy share of the sample is AET.
let aetCount = 0
let totalFrames = 0
// Goals the sheet itself couldn't cover with a shot on target — see the note at
// the anchor check. Reported, not tolerated silently.
let shortSheets = 0
// How far a rating travels over a full shift, and how often it changes
// direction — the two numbers behind "it barely updates".
const ratingSamples: { moved: number; swings: number }[] = []

console.log(`Verifying the Deep Match timeline over ${N} finals…\n`)

for (let i = 0; i < N; i++) {
  const homeOvr = 70 + Math.floor(poolRng() * 20)
  const awayOvr = 70 + Math.floor(poolRng() * 20)
  const homePool = makePool('H', homeOvr, poolRng)
  const awayPool = makePool('A', awayOvr, poolRng)
  const home = simTeam('H', homeOvr)
  const away = simTeam('A', awayOvr)

  const res = simulateMatch(home, away)
  const seed = randomSeed()
  const extraTime = poolRng() < 0.25
  if (extraTime) aetCount++

  // Attributed off the SAME seed the sheet regenerates from — that pairing is
  // the app's whole determinism contract, so the verifier honours it too.
  const scorers = attributeMatchScorers(
    homePool, awayPool, res.homeGoals, res.awayGoals,
    { rng: mulberry32(seed), lineups: { seed, benchSize: 9 } },
  )
  const detail = generateMatchDetail({
    seed, homePool, awayPool,
    homeGoals: res.homeGoals, awayGoals: res.awayGoals,
    scorers, extraTime,
  })
  if (!detail) { check(false, `#${i}: the sheet failed to generate`); continue }

  const tl = buildDeepMatchTimeline(detail, seed)
  totalFrames += tl.frames.length

  // ── 1. Determinism ───────────────────────────────────────────────────────
  if (i < 200) {
    const again = buildDeepMatchTimeline(detail, seed)
    check(JSON.stringify(tl.frames) === JSON.stringify(again.frames),
      `#${i}: rebuilding the timeline from the same seed produced different frames`)
    // Ratings are a function, not data — check them the same way.
    const sample = detail.players.filter(p => p.minutes > 0).slice(0, 5)
    for (const p of sample) {
      for (const m of [1, Math.floor(tl.duration / 2), tl.duration]) {
        check(tl.ratingAt(p.playerId, m) === again.ratingAt(p.playerId, m),
          `#${i}: ${p.name}'s live rating at ${m}' isn't reproducible`)
      }
    }
  }

  check(tl.frames.length === detail.duration, `#${i}: ${tl.frames.length} frames for a ${detail.duration}' match`)
  check(tl.duration === (extraTime ? 120 : 90), `#${i}: duration ${tl.duration} doesn't match the ET flag`)

  const last = tl.frames[tl.frames.length - 1]

  // ── 2. The final frame IS the sheet ──────────────────────────────────────
  check(last.homeGoals === res.homeGoals && last.awayGoals === res.awayGoals,
    `#${i}: timeline ends ${last.homeGoals}-${last.awayGoals}, match was ${res.homeGoals}-${res.awayGoals}`)

  for (const side of ['home', 'away'] as const) {
    for (const key of Object.keys(detail[side]) as (keyof TeamStatLine)[]) {
      const want = detail[side][key] as number
      const got = last[side][key] as number
      // xG is carried to one decimal; everything else is exact.
      const ok = key === 'xg' || key === 'xgOpenPlay' || key === 'xgSetPiece'
        ? Math.abs(got - want) < 0.005
        // Possession and pass accuracy are rounded percentages derived from the
        // running series, so they're allowed to land a point either side.
        : key === 'possession' || key === 'passAccuracy'
        ? Math.abs(got - want) <= 1
        : got === want
      check(ok, `#${i}: ${side}.${String(key)} ends at ${got}, sheet says ${want}`)
    }
  }
  check(last.home.possession + last.away.possession === 100,
    `#${i}: final possession sums to ${last.home.possession + last.away.possession}`)

  // ── 3. Nothing ever goes backwards ───────────────────────────────────────
  const counters: (keyof TeamStatLine)[] = [
    'shots', 'shotsOnTarget', 'passes', 'accuratePasses', 'fouls', 'corners',
    'yellowCards', 'redCards', 'tacklesWon', 'keeperSaves', 'xg',
  ]
  for (let f = 1; f < tl.frames.length; f++) {
    const prev = tl.frames[f - 1], cur = tl.frames[f]
    check(cur.homeGoals >= prev.homeGoals && cur.awayGoals >= prev.awayGoals,
      `#${i}: the score went DOWN at ${cur.minute}'`)
    for (const side of ['home', 'away'] as const) {
      for (const key of counters) {
        if ((cur[side][key] as number) < (prev[side][key] as number)) {
          check(false, `#${i}: ${side}.${String(key)} fell at ${cur.minute}'`)
        }
      }
    }
  }

  // ── 4. Events are anchored to their minute ───────────────────────────────
  // How much of each stat the events INSIST on. An own goal isn't a shot by the
  // side it counts for; a missed penalty is a shot, and a saved one is on
  // target; a card comes with a foul. If the sheet's total is smaller than what
  // the events demand, the timeline can't honour every anchor AND land on the
  // sheet's figure — and landing on the figure wins.
  const demand = (isHome: boolean) => {
    const mine = detail.events.filter(e => e.isHome === isHome)
    const goals = mine.filter(e => e.type === 'goal' && !e.ownGoal).length
    const pens = mine.filter(e => e.type === 'penMissed')
    return {
      shots: goals + pens.length,
      shotsOnTarget: goals + pens.filter(e => e.saved).length,
      fouls: mine.filter(e => e.type === 'yellow' || e.type === 'red').length,
    }
  }
  const demands = { home: demand(true), away: demand(false) }
  for (const e of detail.events) {
    const m = Math.max(1, Math.min(tl.duration, e.minute))
    const cur = tl.frames[m - 1]
    const prev = m > 1 ? tl.frames[m - 2] : null
    const side = e.isHome ? 'home' : 'away'
    const delta = (key: keyof TeamStatLine) =>
      (cur[side][key] as number) - ((prev?.[side][key] as number) ?? 0)

    if (e.type === 'goal') {
      check(cur[side === 'home' ? 'homeGoals' : 'awayGoals'] > ((prev?.[side === 'home' ? 'homeGoals' : 'awayGoals']) ?? -1),
        `#${i}: the ${m}' goal never appears on the scoreboard`)
      // Only assertable when the SHEET leaves room. The stat generator can
      // report fewer shots on target than the side had goals (own goals and
      // spot-kicks are counted differently), and when it does the timeline
      // deliberately keeps the total honest rather than inventing an extra
      // effort — landing on the sheet's number matters more. Counted below, so
      // the rate stays visible instead of being quietly tolerated.
      if (!e.ownGoal) {
        if (detail[side].shots >= demands[side].shots) {
          check(delta('shots') >= 1, `#${i}: a goal at ${m}' with no shot in that minute`)
        } else shortSheets++
        if (detail[side].shotsOnTarget >= demands[side].shotsOnTarget) {
          check(delta('shotsOnTarget') >= 1, `#${i}: a goal at ${m}' with no shot on target in that minute`)
        } else shortSheets++
      }
    } else if (e.type === 'yellow') {
      check(delta('yellowCards') >= 1, `#${i}: a booking at ${m}' that never shows on the card count`)
      if (detail[side].fouls >= demands[side].fouls) {
        check(delta('fouls') >= 1, `#${i}: a booking at ${m}' with no foul in that minute`)
      } else shortSheets++
    } else if (e.type === 'red') {
      check(delta('redCards') >= 1, `#${i}: a sending-off at ${m}' that never shows on the card count`)
    }
  }

  // ── 5. Live ratings ──────────────────────────────────────────────────────
  for (const p of detail.players) {
    if (p.minutes <= 0) {
      check(tl.ratingAt(p.playerId, tl.duration) === null, `#${i}: an unused sub has a live rating`)
      continue
    }
    const on = p.subOnMinute ?? 0
    // Ends exactly on the sheet's figure — the whole point: the live view and
    // the stats screen must agree the moment the whistle goes.
    check(tl.ratingAt(p.playerId, tl.duration) === p.rating,
      `#${i}: ${p.name} ends live on ${tl.ratingAt(p.playerId, tl.duration)}, sheet says ${p.rating}`)
    if (on > 0) {
      check(tl.ratingAt(p.playerId, on) === null, `#${i}: ${p.name} was rated before coming on at ${on}'`)
      check(!tl.onPitchAt(p.playerId, on), `#${i}: ${p.name} is on the pitch at ${on}', the minute he came on`)
    }
    check(tl.onPitchAt(p.playerId, Math.min(tl.duration, on + 1)), `#${i}: ${p.name} isn't on the pitch right after coming on`)
    // A player who went off is off, and stays off.
    if (p.subOffMinute !== undefined) {
      check(!tl.onPitchAt(p.playerId, Math.min(tl.duration, p.subOffMinute + 1)),
        `#${i}: ${p.name} is still on after being subbed at ${p.subOffMinute}'`)
    }
    for (const m of [on + 1, Math.floor((on + tl.duration) / 2), tl.duration]) {
      const r = tl.ratingAt(p.playerId, Math.min(tl.duration, m))
      if (r === null) continue
      check(r >= 1 && r <= 10, `#${i}: ${p.name} rated ${r} at ${m}'`)
    }
    // First minute on the pitch starts from the "nothing has happened" mark —
    // unless something happened TO him in it, which is exactly the step the
    // bumps exist for. A player is charged for an event through four different
    // fields (he scored, he assisted, his error led to it, he saved the
    // penalty), and checking only `playerId` made a first-minute defensive
    // howler look like the rating model misfiring.
    const first = tl.ratingAt(p.playerId, Math.min(tl.duration, on + 1))
    const involvedImmediately = detail.events.some(e =>
      Math.abs(e.minute - (on + 1)) <= 1
      && (e.playerId === p.playerId || e.assistId === p.playerId
        || e.errorById === p.playerId || e.keeperId === p.playerId))
    if (first !== null && !involvedImmediately) {
      check(Math.abs(first - 6.0) < 1.0, `#${i}: ${p.name} came on already rated ${first}`)
    }
  }

  // ── 6. The lineup snapshot doesn't spoil anything ────────────────────────
  // The pre-kickoff team sheet is `playersAt(0)`. It walked the sides out with
  // the goalscorers marked and the winner's ratings on show until this existed.
  for (const p of tl.playersAt(0)) {
    check(p.goals === 0 && p.ownGoals === 0 && p.assists === 0,
      `#${i}: ${p.name} already has a goal contribution at kickoff`)
    check(!p.yellowCard && !p.redCard && !p.injured, `#${i}: ${p.name} is already booked at kickoff`)
    check(p.subOnMinute === undefined && p.subOffMinute === undefined,
      `#${i}: ${p.name}'s substitution is announced at kickoff`)
    check(!p.motm, `#${i}: player of the match is known at kickoff`)
    check(p.minutes === 0, `#${i}: ${p.name} has played ${p.minutes} minutes at kickoff`)
  }
  // …and by full time it IS the sheet, or the live view and the stats screen
  // would be telling two different stories about the same match.
  const finalLines = tl.playersAt(tl.duration)
  for (const p of detail.players) {
    const f = finalLines.find(x => x.playerId === p.playerId)!
    check(f.goals === p.goals && f.assists === p.assists && f.ownGoals === p.ownGoals,
      `#${i}: ${p.name}'s contributions don't match the sheet at full time`)
    check(f.minutes === p.minutes, `#${i}: ${p.name} played ${f.minutes}', sheet says ${p.minutes}'`)
    check(!!f.motm === !!p.motm, `#${i}: MOTM doesn't match the sheet at full time`)
    if (p.minutes > 0) check(f.rating === p.rating, `#${i}: ${p.name}'s final rating doesn't match the sheet`)
  }

  // ── 7. Ratings actually MOVE ─────────────────────────────────────────────
  // The first rating model eased smoothly to the final figure and the verdict
  // was that it "barely updates" — measured, not argued, this time.
  for (const p of detail.players) {
    const { on, off } = { on: p.subOnMinute ?? 0, off: p.subOffMinute ?? tl.duration }
    if (p.minutes < 60 || off - on < 60) continue    // only judge a full shift
    let moved = 0, swings = 0, last = tl.ratingAt(p.playerId, on + 1)
    let dir = 0
    for (let m = on + 2; m < off; m++) {
      const r = tl.ratingAt(p.playerId, m)
      if (r === null || last === null) { last = r; continue }
      const d = r - last
      if (Math.abs(d) > 0.001) {
        moved += Math.abs(d)
        const nd = d > 0 ? 1 : -1
        if (dir !== 0 && nd !== dir) swings++
        dir = nd
      }
      last = r
    }
    ratingSamples.push({ moved, swings })
  }

  // Team rating stays in a sane band the whole way through.
  for (const f of tl.frames) {
    check(f.homeRating >= 1 && f.homeRating <= 10, `#${i}: home team rating ${f.homeRating} at ${f.minute}'`)
    check(f.awayRating >= 1 && f.awayRating <= 10, `#${i}: away team rating ${f.awayRating} at ${f.minute}'`)
  }
}

console.log(`\n${N} finals · ${totalFrames} frames · ${aetCount} went to extra time`)
console.log(`${shortSheets} goal(s) had no shot-on-target left to spend — the sheet's own totals, not the timeline's`)

const avgMoved = ratingSamples.reduce((a, r) => a + r.moved, 0) / (ratingSamples.length || 1)
const avgSwings = ratingSamples.reduce((a, r) => a + r.swings, 0) / (ratingSamples.length || 1)
console.log(`ratings: a full shift travels ${avgMoved.toFixed(2)} points across ${avgSwings.toFixed(1)} direction changes`)
// Thresholds, not exact values: the point is that the number visibly lives,
// not that it lives by any particular amount.
// Bracketed on BOTH sides. Too little movement was the original complaint; too
// much is the failure mode of over-correcting, and the first attempt at a fix
// travelled 17 points across 49 direction changes, which reads as a slot
// machine rather than a rating.
check(avgMoved > 2.5, `ratings barely move — a full shift travels only ${avgMoved.toFixed(2)} points`)
check(avgMoved < 8, `ratings are jittering — a full shift travels ${avgMoved.toFixed(2)} points`)
check(avgSwings > 5, `ratings only change direction ${avgSwings.toFixed(1)} times a match — that reads as a glide`)
check(avgSwings < 20, `ratings change direction ${avgSwings.toFixed(1)} times a match — that reads as noise`)
console.log(`\n${failures === 0 ? '✅ ALL CHECKS PASSED' : `❌ ${failures} CHECK(S) FAILED`}`)
process.exit(failures === 0 ? 0 : 1)
