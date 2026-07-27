// Deep Simulation Match (Big Fixes §7) — the per-minute timeline the final is
// played back from.
//
// **This decides nothing.** The architecture guard in the spec is the whole
// point: the engine is result-first and `match-detail.ts` already turns a stored
// seed into the complete sheet — scoreline, scorers, events, momentum, per-player
// ratings, MOTM. All this module does is take that finished sheet and answer one
// question for every minute of the match: *what did the numbers look like at
// this point?* Nothing here is random in the "could have gone otherwise" sense —
// the same sheet always produces the same timeline, which is what makes pause,
// skip and re-entry trivially safe (R2/R4).
//
// The one modelling choice: a stat's TOTAL is known, but how it accumulated is
// not, so it's distributed across the minutes by
//
//   momentum share  ·  a seeded per-stat jitter  ·  event anchors
//
// Momentum share means a side that's camped in the other half racks up its
// shots there rather than spreading them evenly; the jitter (from the same
// seed, so it's reproducible) stops every stat from marching in lockstep; and
// the anchors force what the timeline already knows — a goal comes with a shot
// on target in the same minute, a booking with a foul. Whatever the shape, the
// cumulative value at the final whistle is EXACTLY the sheet's total (R3):
// allocation is largest-remainder, which cannot drift.

import { mulberry32, deriveSeed } from '@/lib/rng'
import type { MatchStats, TeamStatLine, MatchEvent, PlayerMatchLine } from '@/types/match-stats'

/** One minute of the match, as a full snapshot. */
export type DeepFrame = {
  minute:    number        // 1…duration
  homeGoals: number
  awayGoals: number
  home:      TeamStatLine  // cumulative up to and including this minute
  away:      TeamStatLine
  homeRating: number       // minutes-weighted, same definition as the final sheet
  awayRating: number
}

export type DeepMatchTimeline = {
  duration: number
  frames:   DeepFrame[]              // frames[0] = minute 1
  /** Live 0–10 rating per player per minute; `null` before he came on. */
  ratingAt: (playerId: string, minute: number) => number | null
  /** Whether a player is on the pitch at this minute — drives the lineup view. */
  onPitchAt: (playerId: string, minute: number) => boolean
  /** The whole sheet's player lines as they stood at this minute (see below). */
  playersAt: (minute: number) => PlayerMatchLine[]
  events:   MatchEvent[]             // sorted, so the feed can just walk a cursor
}

// A player's own moments move his rating in visible steps rather than letting it
// drift smoothly to a number the viewer can't connect to anything. The values
// are deliberately modest: the FINAL rating is the sheet's and is never
// negotiable — these only decide the shape of the path to it (see liveRating).
const RATING_BUMP = {
  goal:    1.2,
  assist:  0.6,
  ownGoal: -1.2,
  yellow:  -0.3,
  red:     -1.6,
  penMissed: -0.9,
  error:   -1.0,
} as const

// Every side starts at a flat 6.0 — the "nothing has happened yet" rating.
const BASE_RATING = 6.0

// How far a rating can stray from its trend line minute to minute, in
// hundredths. This is what makes the number visibly *move*: without it a
// player heading for 6.4 creeps up by a hundredth every couple of minutes and
// the whole panel looks frozen. Zero-sum across the player's span, so it never
// costs him anything by the whistle.
const WOBBLE_SCALE = 60
// Roughly how many minutes one swing of the wobble lasts. Tuned by measurement
// (verify-deep-match reports the travel and the direction changes): much longer
// and a rating only turns around three or four times all match, which is back to
// looking like a glide; much shorter and it's per-minute noise again.
const WOBBLE_ARC = 7

/** Stable small integer from a player id — a per-player RNG stream salt. */
function hashId(id: string): number {
  let h = 2166136261 >>> 0
  for (let i = 0; i < id.length; i++) { h ^= id.charCodeAt(i); h = Math.imul(h, 16777619) }
  return h >>> 0
}

// Stats that aren't plain counters and so can't just be shared out:
// possession is a percentage (an average, not a sum), pass accuracy is derived
// from two other stats, and the xG family is fractional.
const RATE_STATS = ['possession', 'passAccuracy'] as const
const XG_STATS = ['xg', 'xgOpenPlay', 'xgSetPiece'] as const
// xG is allocated in HUNDREDTHS. Tenths would have made the running figure
// land on a rounded version of the sheet's xG rather than the sheet's xG, and
// "the final frame is the sheet, exactly" is the invariant this whole module
// is built around. Two decimals is also what the stat rows already print.
const XG_SCALE = 100

type CounterKey = Exclude<keyof TeamStatLine, typeof RATE_STATS[number] | typeof XG_STATS[number]>

/**
 * Share `total` across `weights` so the parts are integers that sum to exactly
 * `total`. Largest-remainder: floor everything, then hand the leftovers to the
 * minutes with the biggest fractional parts (ties by index, so it's stable).
 *
 * Exactness is the requirement — a per-minute stat that ends one shot short of
 * the sheet it's replaying is a bug you only notice at the final whistle.
 */
function allocate(total: number, weights: number[]): number[] {
  const n = weights.length
  const out = new Array<number>(n).fill(0)
  if (total <= 0 || n === 0) return out
  const sum = weights.reduce((a, b) => a + b, 0) || 1
  const frac: { i: number; f: number }[] = []
  let used = 0
  for (let i = 0; i < n; i++) {
    const raw = (total * weights[i]) / sum
    out[i] = Math.floor(raw)
    used += out[i]
    frac.push({ i, f: raw - out[i] })
  }
  frac.sort((a, b) => b.f - a.f || a.i - b.i)
  for (let k = 0; k < total - used; k++) out[frac[k % n].i]++
  return out
}

/** Anchored allocation: `anchors[i]` happens for certain, the rest is shared. */
function allocateWithAnchors(total: number, weights: number[], anchors: number[]): number[] {
  const anchored = anchors.reduce((a, b) => a + b, 0)
  // The sheet doesn't always leave room for every anchor (it can report fewer
  // shots on target than the side had goals once own goals and spot-kicks are
  // in play). When that happens, share out what there IS across the anchored
  // minutes — still by largest remainder, because the running total ending on
  // the sheet's figure matters more than every goal getting its shot: a scaled
  // `Math.round` here was silently overshooting the total by one.
  if (anchored >= total) return allocate(total, anchors)
  const rest = allocate(total - anchored, weights)
  return rest.map((v, i) => v + anchors[i])
}

/** Running sum in place — frames are cumulative, allocations are per-minute. */
function cumulative(perMinute: number[]): number[] {
  let run = 0
  return perMinute.map(v => (run += v))
}

/**
 * Per-minute weights for one side: how likely it is that *this* side's next
 * shot/pass/tackle happened in *this* minute.
 *
 * Momentum is signed (+home / −away) and already generated from the goals and
 * the stats, so leaning on it keeps the timeline agreeing with the graph drawn
 * above it. The jitter is seeded per stat so shots and passes clump differently
 * — without it every counter ticks in unison, which reads as fake.
 */
function sideWeights(momentum: number[], isHome: boolean, seed: number, statIndex: number): number[] {
  // `deriveSeed` rather than a raw xor: neighbouring stat indices would
  // otherwise produce neighbouring seeds, and mulberry32's first few outputs
  // for those are close enough that "different stats clump differently" quietly
  // stops being true.
  const rand = mulberry32(deriveSeed(seed, statIndex * 2 + (isHome ? 0 : 1)))
  return momentum.map(m => {
    const signed = isHome ? m : -m
    // 0.15…0.85 — even a side being battered still does things.
    const share = Math.max(0.15, Math.min(0.85, 0.5 + signed / 200))
    return share * (0.55 + rand() * 0.9)
  })
}

/** Minute a goal/card/etc. lands on, folding stoppage time into the same slot. */
const slotOf = (e: MatchEvent, duration: number) =>
  Math.max(1, Math.min(duration, e.minute))

export function buildDeepMatchTimeline(detail: MatchStats, seed: number): DeepMatchTimeline {
  const duration = detail.duration
  const N = duration
  const idx = (minute: number) => Math.max(0, Math.min(N - 1, minute - 1))

  // ── Anchors: what the event list says MUST happen in a given minute ────────
  const zero = () => new Array<number>(N).fill(0)
  const anchors = {
    home: { shots: zero(), shotsOnTarget: zero(), shotsInsideBox: zero(), yellowCards: zero(), redCards: zero(), fouls: zero(), keeperSaves: zero() },
    away: { shots: zero(), shotsOnTarget: zero(), shotsInsideBox: zero(), yellowCards: zero(), redCards: zero(), fouls: zero(), keeperSaves: zero() },
  }
  const goalsPerMinute = { home: zero(), away: zero() }

  for (const e of detail.events) {
    const i = idx(slotOf(e, duration))
    const side = e.isHome ? 'home' : 'away'
    const other = e.isHome ? 'away' : 'home'
    if (e.type === 'goal') {
      goalsPerMinute[side][i]++
      // An own goal is credited to the benefiting side but was NOT a shot by
      // them — attributing one would put a phantom effort on the wrong team.
      if (!e.ownGoal) {
        anchors[side].shots[i]++
        anchors[side].shotsOnTarget[i]++
        if (!e.penalty) anchors[side].shotsInsideBox[i]++
      }
    } else if (e.type === 'yellow') {
      anchors[side].yellowCards[i]++
      anchors[side].fouls[i]++
    } else if (e.type === 'red') {
      anchors[side].redCards[i]++
      anchors[side].fouls[i]++
    } else if (e.type === 'penMissed') {
      anchors[side].shots[i]++
      if (e.saved) { anchors[side].shotsOnTarget[i]++; anchors[other].keeperSaves[i]++ }
    }
  }

  // ── Counters: share each total out over the 90 (or 120) minutes ───────────
  const counterKeys = (Object.keys(detail.home) as (keyof TeamStatLine)[])
    .filter(k => !(RATE_STATS as readonly string[]).includes(k) && !(XG_STATS as readonly string[]).includes(k)) as CounterKey[]

  const cum = {
    home: {} as Record<string, number[]>,
    away: {} as Record<string, number[]>,
  }
  counterKeys.forEach((key, statIndex) => {
    for (const side of ['home', 'away'] as const) {
      const w = sideWeights(detail.momentum, side === 'home', seed, statIndex)
      const a = (anchors[side] as Record<string, number[]>)[key] ?? zero()
      cum[side][key] = cumulative(allocateWithAnchors(detail[side][key] as number, w, a))
    }
  })

  // Goals get a chunk of xG anchored to them: a goal arriving while xG hasn't
  // moved all match looks broken, whatever the arithmetic says.
  XG_STATS.forEach((key, i) => {
    for (const side of ['home', 'away'] as const) {
      const total = Math.round((detail[side][key] as number) * XG_SCALE)
      const w = sideWeights(detail.momentum, side === 'home', seed, counterKeys.length + i)
      const a = key === 'xg' ? goalsPerMinute[side].map(g => Math.min(50, g * 40)) : zero()
      cum[side][key] = cumulative(allocateWithAnchors(total, w, a))
    }
  })

  // Possession is an AVERAGE, not a sum: build a per-minute share, then shift
  // the whole series so its mean is exactly the sheet's figure. The running
  // number is then the mean so far, which is how possession is actually read.
  const possShare = (() => {
    const raw = detail.momentum.map(m => Math.max(25, Math.min(75, 50 + m / 3)))
    const mean = raw.reduce((a, b) => a + b, 0) / (raw.length || 1)
    const shift = detail.home.possession - mean
    return raw.map(v => v + shift)
  })()
  const possRunning: number[] = []
  {
    let run = 0
    for (let i = 0; i < N; i++) { run += possShare[i]; possRunning.push(run / (i + 1)) }
  }

  // ── Frames ────────────────────────────────────────────────────────────────
  const goalsRunning = {
    home: cumulative(goalsPerMinute.home),
    away: cumulative(goalsPerMinute.away),
  }

  const lineFor = (side: 'home' | 'away', i: number): TeamStatLine => {
    const out = {} as Record<string, number>
    for (const key of counterKeys) out[key] = cum[side][key][i]
    for (const key of XG_STATS) out[key] = cum[side][key][i] / XG_SCALE
    // Both sides read off the SAME series, so possession can't fail to sum to
    // 100 — the invariant the stats screen already relies on.
    const home = Math.round(possRunning[i])
    out.possession = side === 'home' ? home : 100 - home
    out.passAccuracy = out.passes > 0 ? Math.round((out.accuratePasses / out.passes) * 100) : 0
    return out as unknown as TeamStatLine
  }

  // ── Live player ratings ───────────────────────────────────────────────────
  // A player's rating walks from 6.0 to the sheet's final figure, but his own
  // moments land as steps on the way, so a 78th-minute winner visibly moves the
  // number. The eased part carries whatever the steps DON'T account for, so the
  // value at his last minute is exactly the sheet's — no reconciliation drift.
  const bumps = new Map<string, { minute: number; delta: number }[]>()
  const addBump = (playerId: string | undefined, minute: number, delta: number) => {
    if (!playerId) return
    const list = bumps.get(playerId) ?? []
    list.push({ minute, delta })
    bumps.set(playerId, list)
  }
  for (const e of detail.events) {
    const m = slotOf(e, duration)
    if (e.type === 'goal') {
      addBump(e.playerId, m, e.ownGoal ? RATING_BUMP.ownGoal : RATING_BUMP.goal)
      addBump(e.assistId, m, RATING_BUMP.assist)
      addBump(e.errorById, m, RATING_BUMP.error)
    } else if (e.type === 'yellow') addBump(e.playerId, m, RATING_BUMP.yellow)
    else if (e.type === 'red') addBump(e.playerId, m, RATING_BUMP.red)
    else if (e.type === 'penMissed') {
      addBump(e.playerId, m, RATING_BUMP.penMissed)
      if (e.saved) addBump(e.keeperId, m, RATING_BUMP.goal)   // a saved penalty is a goal-sized moment
    }
  }

  const byId = new Map(detail.players.map(p => [p.playerId, p]))
  const spanOf = (p: PlayerMatchLine) => {
    const on = p.subOnMinute ?? 0
    // No substitution recorded doesn't mean he saw it out: a red card ends a
    // player's match too, and the sheet records that only as `minutes`. Deriving
    // the end from his own minutes covers every way a match can end early —
    // sending-off, injury, or simply the whistle — without this module needing
    // to know which one it was.
    const off = p.subOffMinute ?? Math.min(duration, on + p.minutes)
    return { on, off: Math.max(off, on + 1) }
  }

  /** Minutes on the pitch as of `minute` — 0 for anyone still on the bench. */
  const minutesPlayedBy = (p: PlayerMatchLine, minute: number) => {
    if (p.minutes <= 0) return 0
    const { on, off } = spanOf(p)
    return Math.max(0, Math.min(off, minute) - on)
  }

  const onPitchAt = (playerId: string, minute: number) => {
    const p = byId.get(playerId)
    if (!p || p.minutes <= 0) return false
    const { on, off } = spanOf(p)
    return minute > on && minute <= off
  }

  // A player's rating is a WALK, not a glide. The first version eased smoothly
  // from 6.0 to the final figure, and the maintainer's verdict was that it
  // "barely updates" — which was fair: most players finish between 6.0 and 7.0,
  // so a smooth interpolation moves about a tenth every ten minutes and reads as
  // frozen. Ratings in the real thing lurch: you win a duel, you give the ball
  // away, you make a save.
  //
  // So the drift to the final figure is chopped into LUMPS (largest-remainder
  // over jittered per-minute weights, in hundredths) and a zero-sum wobble is
  // laid over the top, so the number goes up AND down on the way. Both are
  // built per player from the match seed, so it's still a replay. The wobble
  // sums to zero and the lumps sum to the exact remaining drift across his span,
  // so his last on-pitch minute is the sheet's rating to the decimal — the
  // invariant that lets the live view and the stats screen agree.
  const walks = new Map<string, { on: number; off: number; steps: number[] }>()
  for (const p of detail.players) {
    if (p.minutes <= 0) continue
    const { on, off } = spanOf(p)
    const span = off - on                      // minutes he's on the pitch
    const mine = bumps.get(p.playerId) ?? []
    const totalBumps = mine.reduce((a, b) => a + b.delta, 0)
    // Hundredths of a rating point, so the arithmetic is integer and exact.
    const drift = Math.round((p.rating - BASE_RATING - totalBumps) * 100)

    const rand = mulberry32(deriveSeed(seed, hashId(p.playerId)))
    // Weights vary a lot on purpose — a flat weight is the smooth glide again.
    const weights = Array.from({ length: span }, () => 0.15 + rand() * 1.85)
    const magnitude = allocate(Math.abs(drift), weights)
    const lumps = magnitude.map(v => (drift < 0 ? -v : v))

    // The wobble — a slow swing above and below the trend line, so a player
    // having a spell drifts up and then gives some back.
    //
    // Deliberately SMOOTH, not per-minute noise: an independent value each
    // minute made the rating jitter by a tenth every tick and travel ~17 points
    // over a match, which reads as a slot machine rather than a rating. So the
    // series is a handful of control points spaced ~WOBBLE_ARC minutes apart,
    // linearly interpolated between them.
    //
    // Enveloped by a half-sine so it's ~0 at both ends of his span and biggest
    // in the middle: a player who walks on and is rated 4.6 sixty seconds later
    // is nonsense — a swing needs something to swing away FROM, and at kickoff
    // there's nothing yet.
    const controls = Math.max(2, Math.round(span / WOBBLE_ARC) + 1)
    const knots = Array.from({ length: controls }, () => rand() * 2 - 1)
    const raw = Array.from({ length: span }, (_, i) => {
      const t = (i / Math.max(1, span - 1)) * (controls - 1)
      const k = Math.min(controls - 2, Math.floor(t))
      const f = t - k
      const lerp = knots[k] * (1 - f) + knots[k + 1] * f
      return lerp * Math.sin((Math.PI * (i + 1)) / (span + 1))
    })
    const mean = raw.reduce((a, b) => a + b, 0) / (span || 1)
    const wobble = raw.map(v => Math.round((v - mean) * WOBBLE_SCALE))

    // Running total per minute of the span, so `ratingAt` is a lookup.
    const steps: number[] = []
    let run = 0
    for (let i = 0; i < span; i++) {
      run += lumps[i]
      // The wobble is a DISPLACEMENT, not an accumulation — it's added to the
      // running position rather than summed into it, which is what keeps the
      // last minute exact (wobble[span-1] contributes, so it's dropped there).
      steps.push(run + (i === span - 1 ? 0 : wobble[i]))
    }
    walks.set(p.playerId, { on, off, steps })
  }

  const ratingAt = (playerId: string, minute: number): number | null => {
    const p = byId.get(playerId)
    if (!p || p.minutes <= 0) return null
    const walk = walks.get(playerId)
    if (!walk) return null
    if (minute <= walk.on) return null          // hasn't come on yet
    if (minute >= walk.off) return p.rating     // off the pitch: frozen at the sheet's figure
    const mine = bumps.get(playerId) ?? []
    const applied = mine.filter(b => b.minute <= minute).reduce((a, b) => a + b.delta, 0)
    const i = Math.min(walk.steps.length - 1, minute - walk.on - 1)
    const v = BASE_RATING + (walk.steps[i] ?? 0) / 100 + applied
    return Math.round(Math.max(1, Math.min(10, v)) * 10) / 10
  }

  // Team rating: minutes-weighted over whoever is ON at that minute, matching
  // how the sheet's own homeRating/awayRating are defined.
  const teamRating = (isHome: boolean, minute: number) => {
    let sum = 0, n = 0
    for (const p of detail.players) {
      if (p.isHome !== isHome) continue
      const r = ratingAt(p.playerId, minute)
      if (r === null) continue
      sum += r; n++
    }
    return n === 0 ? BASE_RATING : Math.round((sum / n) * 10) / 10
  }

  // ── Per-minute lineup snapshot ────────────────────────────────────────────
  // The lineup views (pitch + bench) take `PlayerMatchLine[]`, so rather than
  // teaching them about clocks, the timeline hands them a version of the sheet
  // as it stood at minute N: goals not yet scored aren't on the shirt, a sub
  // who hasn't come on is still on the bench, the rating is the live one.
  //
  // This is what stops the lineup from SPOILING the match — the pre-kickoff
  // team sheet is `playersAt(0)`, which is every player with a clean slate. The
  // first version handed over the finished lines, so the teams walked out with
  // the goalscorers already marked and the winner's ratings on display.
  const playersAt = (minute: number): PlayerMatchLine[] => {
    const seen = detail.events.filter(e => slotOf(e, duration) <= minute)
    return detail.players.map(p => {
      const goals = seen.filter(e => e.type === 'goal' && e.playerId === p.playerId && !e.ownGoal)
      const line: PlayerMatchLine = {
        ...p,
        goals: goals.length,
        penaltyGoals: goals.filter(e => e.penalty).length,
        ownGoals: seen.filter(e => e.type === 'goal' && e.playerId === p.playerId && e.ownGoal).length,
        assists: seen.filter(e => e.type === 'goal' && e.assistId === p.playerId).length,
        penaltiesMissed: seen.filter(e => e.type === 'penMissed' && e.playerId === p.playerId).length,
        yellowCard: seen.some(e => e.type === 'yellow' && e.playerId === p.playerId),
        redCard: seen.some(e => e.type === 'red' && e.playerId === p.playerId),
        injured: seen.some(e => e.type === 'injury' && e.playerId === p.playerId),
        // Only once it's happened — a sub marked "▲ 78'" at kickoff gives away
        // that a change is coming and exactly when.
        subOnMinute: p.subOnMinute !== undefined && minute > p.subOnMinute ? p.subOnMinute : undefined,
        subOffMinute: p.subOffMinute !== undefined && minute >= p.subOffMinute ? p.subOffMinute : undefined,
        // Player of the match is a full-time award; before then it's a spoiler.
        motm: minute >= duration ? !!p.motm : false,
        rating: ratingAt(p.playerId, minute) ?? 0,
        // `minutes` is what the lineup views use to tell "played" from "still on
        // the bench", so it has to be minutes played SO FAR.
        minutes: minutesPlayedBy(p, minute),
      }
      return line
    })
  }

  const frames: DeepFrame[] = []
  for (let i = 0; i < N; i++) {
    const minute = i + 1
    frames.push({
      minute,
      homeGoals: goalsRunning.home[i],
      awayGoals: goalsRunning.away[i],
      home: lineFor('home', i),
      away: lineFor('away', i),
      homeRating: teamRating(true, minute),
      awayRating: teamRating(false, minute),
    })
  }

  return {
    duration,
    frames,
    ratingAt,
    onPitchAt,
    playersAt,
    events: [...detail.events].sort((a, b) =>
      (a.minute + (a.plus ?? 0) / 100) - (b.minute + (b.plus ?? 0) / 100)),
  }
}
