// The stage model's match layer (centralisation step 3, L-04 / L-05 / N-19).
//
// Every match the game plays, whatever produced it, reads as one ContextMatch
// (src/engine/match-context.ts): both sides, the score, the seed, the stored
// scorers, the rotation and availability it was played with, its matchday and
// its label. This file holds the adapters from each family's own shape into
// it, and the ONE function that turns a match into a match-sheet request.
//
// Why: the sheet was opened from twenty places, each copying a match's fields
// into the request by hand. They drifted. The full path's live sheet left out
// your formation, the matchday and the timeline (L-05), so its sheets had no
// form, no table and no "next match"; and every call passed a colour the sheet
// stopped reading in P4-H (N-19). A request built here can't leave a field out,
// because there's only one place that writes them.
//
// The engine's result types stay as they are (07 §5: result-first is not
// touched); this is a read model on top of them.

import { appendKnockoutRounds, type ContextMatch, type ShootoutView } from './match-context'
import type { CLKnockoutMatch } from './cl-sim'
import type { WCKnockoutMatch } from './world-cup-sim'
import type { CupTie } from './domestic-cup'
import type { RunMatch } from './run-matches'
import type { QualTie } from './cl-qualifying'
import { clTieShootout, wcTieShootout } from './match-context'
import type { DraftedPlayer, Formation } from '@/types/game'
import type { MatchScorers, RosterPlayer } from '@/types/stats'

/** Everything the match sheet needs to regenerate one finished match. */
export type MatchDetailRequest = {
  /** Opened from a finished run's pages: names link to the player and club
   *  pages. Off mid-season, where a player page would show results still to come. */
  linkPages?: boolean
  homeClubId: string
  homeName:   string
  awayClubId: string
  awayName:   string
  homeGoals:  number
  awayGoals:  number
  extraTime?: boolean
  pensNote?:  string          // e.g. "Penalties 4–2 · City advance"
  /** P8-81: the shootout itself, from THIS match's home/away point of view.
   *  Raw make/miss always; names when the reveal already attached them. */
  shootout?: ShootoutView
  /** P8-101: both legs of a two-legged tie, in order, so the sheet can switch
   *  between them wherever it was opened from. */
  legs?: MatchDetailRequest[]
  scorers?:   MatchScorers
  seed?:      number          // missing on legacy saves → stable hash fallback
  yearStart:  number          // roster season to load
  competitionLabel?: string   // "Matchday 12" / "Quarter-final · Leg 2"
  playerClubId?: string       // the club YOUR drafted squad replaced (if in this match)
  drafted?:   DraftedPlayer[] // squad override (history loads — store is empty)
  /** YOUR formation, so the pitch view can place your drafted XI. Your eleven
   *  is never re-picked from it — see lineupsForMatch. */
  playerFormation?: Formation
  // §10 R6/R7 "context at the moment of the match": `matchday` is the slot
  // THIS match was played in and `contextMatches` the competition's timeline
  // (the screen filters). Absent when there's no timeline to place it on.
  matchday?:       number
  contextMatches?: ContextMatch[]
  // §10.5 — the rotation the sim applied. Without it the sheet would select a
  // different eleven than the one that actually played.
  homeRotation?:   number
  awayRotation?:   number
  // §10.5 phase 4 — injured/suspended players, plus the stand-ins that
  // covered your side, for the same reason.
  absent?:   string[]
  standIns?: RosterPlayer[]
}

/** What's the same for every match a screen opens: whose run it is. */
export type MatchCtx = {
  yearStart: number
  playerClubId?: string
  drafted?: DraftedPlayer[]
  playerFormation?: Formation
  linkPages?: boolean
  /** The competition's timeline, so the sheet can show the table, form and
   *  next match as they stood. Without it those sections drop out. */
  timeline?: ContextMatch[]
}

/** The one way a match becomes a sheet request. Null while it's unplayed. */
export function matchRequest(m: ContextMatch, ctx: MatchCtx): MatchDetailRequest | null {
  if (m.homeGoals === undefined || m.awayGoals === undefined) return null
  return {
    homeClubId: m.homeClubId, homeName: m.homeClubName,
    awayClubId: m.awayClubId, awayName: m.awayClubName,
    homeGoals: m.homeGoals, awayGoals: m.awayGoals,
    extraTime: m.extraTime, pensNote: m.pensNote, shootout: m.shootout,
    scorers: m.scorers, seed: m.seed,
    homeRotation: m.homeRotation, awayRotation: m.awayRotation,
    absent: m.absent, standIns: m.standIns,
    competitionLabel: m.label,
    yearStart: ctx.yearStart,
    playerClubId: ctx.playerClubId, drafted: ctx.drafted, playerFormation: ctx.playerFormation,
    linkPages: ctx.linkPages,
    ...(ctx.timeline ? { matchday: m.matchday, contextMatches: ctx.timeline } : {}),
  }
}

/** A tie's legs as requests, opening on `open`, each carrying both (P8.5-50). */
export function legsRequest(legs: ContextMatch[], open: number, ctx: MatchCtx): MatchDetailRequest | null {
  const reqs = legs.map(m => matchRequest(m, ctx))
  const one = reqs[open]
  if (!one) return null
  const both = reqs.length === 2 && reqs[0] && reqs[1] ? (reqs as MatchDetailRequest[]) : undefined
  return both ? { ...one, legs: both } : one
}

// ── Adapters: each family's match → ContextMatch ─────────────────────────────

/** Any league-shaped match (a league fixture, a league-phase or group game,
 *  the full path's domestic matchday). Goals absent = not played yet. */
export type LeagueShaped = {
  matchday: number
  home: { clubId: string; clubName: string }; away: { clubId: string; clubName: string }
  homeGoals?: number; awayGoals?: number
  scorers?: MatchScorers; seed?: number
  homeRotation?: number; awayRotation?: number
  absent?: string[]; standIns?: RosterPlayer[]
}

export function leagueMatch(m: LeagueShaped, label: string, inTable?: boolean): ContextMatch {
  return {
    matchday: m.matchday, label, inTable,
    homeClubId: m.home.clubId, homeClubName: m.home.clubName,
    awayClubId: m.away.clubId, awayClubName: m.away.clubName,
    homeGoals: m.homeGoals, awayGoals: m.awayGoals,
    scorers: m.scorers, seed: m.seed,
    // Rotation and availability MUST travel with the match: regenerating
    // without them selects a different eleven than the stored scorers were
    // attributed against.
    homeRotation: m.homeRotation, awayRotation: m.awayRotation,
    absent: m.absent, standIns: m.standIns,
  }
}

/** A league fixture (`Fixture`: the score sits on `result`, null until played). */
export function fixtureMatch(f: LeagueShaped & { result?: { homeGoals: number; awayGoals: number } | null }, label: string): ContextMatch {
  return leagueMatch({ ...f, homeGoals: f.result?.homeGoals, awayGoals: f.result?.awayGoals }, label)
}

/** A World Cup knockout match: always one match, teamA at home. */
export function wcKnockoutMatch(m: WCKnockoutMatch, label: string, matchday: number): ContextMatch {
  return {
    matchday, label, inTable: false,
    homeClubId: m.teamA.clubId, homeClubName: m.teamA.clubName,
    awayClubId: m.teamB.clubId, awayClubName: m.teamB.clubName,
    homeGoals: m.result.homeGoals, awayGoals: m.result.awayGoals,
    extraTime: m.result.extraTime, scorers: m.scorers, seed: m.seed,
    absent: m.absent, standIns: m.standIns,
    // So the sheet's bracket can say who went through: a shootout leaves no
    // trace in the goals.
    tieWinnerClubId: m.winner.clubId,
    ...wcTieShootout(m),
  }
}

/** A domestic cup tie's matches (P8.5-37). A two-legged tie's second leg is
 *  hosted by the first leg's away side and carries the extra time and shootout. */
export function cupTieMatches(t: CupTie, label: string): ContextMatch[] {
  const winner = t.winner === 'home' ? t.home : t.away
  const pensNote = t.homePens != null && t.awayPens != null ? `Penalties ${t.homePens}–${t.awayPens} · ${winner.clubName} go through` : undefined
  const side = (s: CupTie['home']) => ({ clubId: s.clubId, clubName: s.clubName })
  const base = { inTable: false, tieWinnerClubId: winner.clubId }
  if (t.legs && t.legSeeds) {
    const l1 = t.legs.leg1
    return [
      { ...base, ...leagueMatch({ matchday: 1, home: side(t.home), away: side(t.away), homeGoals: l1.homeGoals, awayGoals: l1.awayGoals, seed: t.legSeeds[0], scorers: t.legScorers?.[0] }, `${label} · Leg 1`) },
      { ...base, ...leagueMatch({ matchday: 2, home: side(t.away), away: side(t.home), homeGoals: t.awayGoals - l1.awayGoals, awayGoals: t.homeGoals - l1.homeGoals, seed: t.legSeeds[1], scorers: t.legScorers?.[1] }, `${label} · Leg 2`), extraTime: t.extraTime, pensNote },
    ]
  }
  return [{ ...base, ...leagueMatch({ matchday: 1, home: side(t.home), away: side(t.away), homeGoals: t.homeGoals, awayGoals: t.awayGoals, seed: t.seed, scorers: t.scorers }, label), extraTime: t.extraTime, pensNote }]
}

/** A saved run's match (run-matches.ts). It keeps no matchday of its own,
 *  so the run hub opens it without a timeline; a two-legged tie still
 *  brings its other leg (legsRequest). */
export function runMatch(x: RunMatch): ContextMatch {
  return {
    matchday: 0, label: x.label,
    homeClubId: x.homeClubId, homeClubName: x.homeClubName,
    awayClubId: x.awayClubId, awayClubName: x.awayClubName,
    homeGoals: x.homeGoals, awayGoals: x.awayGoals,
    extraTime: x.extraTime, pensNote: x.pensNote, shootout: x.shootout,
    scorers: x.scorers, seed: x.seed,
    homeRotation: x.homeRotation, awayRotation: x.awayRotation,
    absent: x.absent, standIns: x.standIns,
  }
}

// ── Knockout ties ────────────────────────────────────────────────────────────

/**
 * A Champions League-shaped tie's sheet (the classic and full-path knockouts,
 * qualifying through `qualTieToKoMatch`, a live tie through its adapter),
 * opening on `leg` with both legs to switch between.
 *
 * It sits on the competition's timeline when the tie is on it, so the sheet's
 * form, bracket and next match read from the right slot. A qualifying tie
 * isn't on the competition's timeline, so it brings a one-tie bracket of its
 * own. A leg is found on the timeline by its home and away sides: two sides
 * never meet twice in one bracket, and leg 2 swaps the grounds, so that alone
 * tells the legs apart. The round's label isn't used: each screen names its
 * rounds its own way.
 */
export function tieRequest(tie: CLKnockoutMatch, label: string, ctx: MatchCtx, leg: 1 | 2 = 1): MatchDetailRequest | null {
  const own = appendKnockoutRounds([], [{ label, ties: [tie] }])
  const placed = ctx.timeline ? own.map(o => ctx.timeline!.find(c =>
    c.inTable === false && c.homeClubId === o.homeClubId && c.awayClubId === o.awayClubId)) : []
  const onTimeline = ctx.timeline && placed.length === own.length && placed.every(Boolean)
  return onTimeline
    ? legsRequest(placed as ContextMatch[], leg - 1, ctx)
    : legsRequest(own, leg - 1, { ...ctx, timeline: own })
}

/** A cup tie's sheet, opening on its first leg, on a bracket of its own. */
export function cupTieRequest(t: CupTie, label: string, ctx: MatchCtx): MatchDetailRequest | null {
  const legs = cupTieMatches(t, label)
  return legsRequest(legs, 0, { ...ctx, timeline: ctx.timeline ?? legs })
}

// ── One tie model (L-06 / C-04) ──────────────────────────────────────────────
// A tie's facts, worked out once from whichever shape the engine stored it in:
// who played, the aggregate, each leg, extra time, the shootout, who went
// through. Every tie row and every bracket card is drawn from this. Four
// builders used to work these out separately; they drifted (P8-156 lost the
// crests, P8-159 a second copy skipped extra time) and by 3 Oct 2026 they
// disagreed on how a second leg reads: qualifying wrote it from the home
// side's view, everything else from side A's.

export type TieSide = { clubId: string; clubName: string; isPlayer?: boolean }

export type StageTie = {
  a: TieSide
  /** Null for a bye: A goes through unopposed. */
  b: TieSide | null
  /** The aggregate (or the one match's score), from A's side, extra time in. */
  aGoals?: number
  bGoals?: number
  /** Two legs, each from A's side and at 90 minutes; absent for one match. */
  legs?: [{ a: number; b: number }, { a: number; b: number }]
  extraTime?: boolean
  /** Settled on penalties; `pens` holds the score where it was kept. */
  shootout: boolean
  pens?: { a: number; b: number }
  winnerIsA: boolean
  /** Every scorer list the tie stored, in playing order. */
  scorers: (MatchScorers | undefined)[]
}

/** A Champions League-shaped tie: the classic and full-path knockouts, and a
 *  live tie or a qualifying tie through their adapters. */
export function clTie(m: CLKnockoutMatch): StageTie {
  return {
    a: m.teamA, b: m.teamB,
    aGoals: m.aGoals, bGoals: m.bGoals,
    legs: m.leg1 && m.leg2 ? [{ a: m.leg1.aGoals, b: m.leg1.bGoals }, { a: m.leg2.aGoals, b: m.leg2.bGoals }] : undefined,
    extraTime: m.extraTime || !!m.leg2ExtraTime,
    shootout: m.aPens !== undefined,
    pens: m.aPens !== undefined && m.bPens !== undefined ? { a: m.aPens, b: m.bPens } : undefined,
    winnerIsA: m.winner.clubId === m.teamA.clubId,
    scorers: [m.leg1Scorers, m.leg2Scorers, m.leg2ExtraTimeScorers],
  }
}

/** A World Cup knockout match: one match, A at home. */
export function wcTie(m: WCKnockoutMatch): StageTie {
  const r = m.result
  return {
    a: m.teamA, b: m.teamB,
    aGoals: r.homeGoals, bGoals: r.awayGoals,
    extraTime: r.extraTime,
    shootout: r.homePens !== null,
    pens: r.homePens !== null && r.awayPens !== null ? { a: r.homePens, b: r.awayPens } : undefined,
    winnerIsA: m.winner.clubId === m.teamA.clubId,
    scorers: [m.scorers],
  }
}

/** A qualifying tie. Its legs are stored home-first, so leg 2 turns round. */
export function qualTie(q: QualTie): StageTie {
  if (!q.teamB || !q.legs) return { a: q.teamA, b: null, shootout: false, winnerIsA: true, scorers: [] }
  const l = q.legs
  return {
    a: q.teamA, b: q.teamB,
    aGoals: l.totalA, bGoals: l.totalB,
    legs: [{ a: l.leg1.homeGoals, b: l.leg1.awayGoals }, { a: l.leg2.awayGoals, b: l.leg2.homeGoals }],
    extraTime: l.extraTime,
    shootout: l.homePens !== null,
    pens: l.homePens !== null && l.awayPens !== null ? { a: l.homePens, b: l.awayPens } : undefined,
    winnerIsA: q.winnerId === q.teamA.clubId,
    scorers: [q.leg1Scorers, q.leg2Scorers, q.leg2ExtraTimeScorers],
  }
}

/** A saved run's knockout tie, from its one or two matches (leg 1 first).
 *  The match list keeps no shootout score, so who went through is passed in. */
export function runTie(legs: RunMatch[], winnerIsA: boolean): StageTie {
  const [l1, l2] = legs
  const side = (id: string, name: string) => ({ clubId: id, clubName: name })
  const aGoals = l1.homeGoals + (l2 ? l2.awayGoals : 0), bGoals = l1.awayGoals + (l2 ? l2.homeGoals : 0)
  return {
    a: side(l1.homeClubId, l1.homeClubName), b: side(l1.awayClubId, l1.awayClubName),
    aGoals, bGoals,
    legs: l2 ? [{ a: l1.homeGoals, b: l1.awayGoals }, { a: l2.awayGoals, b: l2.homeGoals }] : undefined,
    extraTime: !!(l2 ?? l1).extraTime,
    // The deciding match carries the shootout's note since P8-103; an older
    // run's only trace of one is a level aggregate. The score isn't kept.
    shootout: !!(l2 ?? l1).pensNote || aGoals === bGoals,
    winnerIsA,
    scorers: legs.map(l => l.scorers),
  }
}
