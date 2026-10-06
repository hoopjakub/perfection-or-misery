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
import { checkTimeline, invariantChecks } from '../src/engine/invariants.ts'
import { mulberry32, randomSeed } from '../src/lib/rng.ts'
import type { RosterPlayer } from '../src/types/stats.ts'
import type { SimTeam } from '../src/types/simulation.ts'

// Phase 9 (docs/diagnostics/04-CHECKS.md §3.2): `--seed N` replays a run
// exactly. simulateMatch and randomSeed both draw from Math.random, so it's
// swapped for a seeded generator; without the flag the seed comes from the
// clock and is printed, so any failure can be run again as it happened.
const seedAt = process.argv.indexOf('--seed')
const RUN_SEED = seedAt > 0 ? Number(process.argv[seedAt + 1]) : Date.now() % 2147483647
Math.random = mulberry32(RUN_SEED)
console.log(`seed ${RUN_SEED} (replay with --seed ${RUN_SEED})`)

let failures = 0
let checksRun = 0
function check(cond: boolean, msg: string) {
  checksRun++
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
const tally = { shortSheets: 0 }
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

  check(tl.duration === (extraTime ? 120 : 90), `#${i}: duration ${tl.duration} doesn't match the ET flag`)

  // ── 2–6. The final frame is the sheet, nothing goes backwards, events are
  // anchored, live ratings, the kick-off and full-time team sheets: one copy,
  // src/engine/invariants.ts, which the phone's self-test runs too.
  for (const v of checkTimeline(tl, detail, res, tally)) check(false, `#${i}: ${v}`)

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
}

console.log(`\n${N} finals · ${totalFrames} frames · ${aetCount} went to extra time`)
console.log(`${tally.shortSheets} goal(s) had no shot-on-target left to spend — the sheet's own totals, not the timeline's`)

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
console.log(`\n${checksRun + invariantChecks.count} checks`)
console.log(`${failures === 0 ? '✅ ALL CHECKS PASSED' : `❌ ${failures} CHECK(S) FAILED`}`)
process.exit(failures === 0 ? 0 : 1)
