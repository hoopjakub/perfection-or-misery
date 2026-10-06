// The run's matches as one flat list, per mode, and which matchday each one
// counts toward. Pure (types and labels only, no DB), split out of run-stats so
// verify-run-stats can build every mode's list and count its rounds without
// SQLite (P8-100).
import type { MatchScorers, RosterPlayer } from '@/types/stats'
import type { SeasonResult } from '@/types/simulation'
import type { CLSeasonResult } from '@/engine/cl-sim'
import type { WCSeasonResult } from '@/engine/world-cup-sim'
import type { QualTie } from '@/engine/cl-qualifying'
import { QUAL_ROUND_LABEL } from '@/data/cl-qual-labels'
import { clTieShootout, wcTieShootout, type ShootoutView } from '@/engine/match-context'

export type RunMatch = {
  homeClubId:   string
  awayClubId:   string
  homeClubName: string
  awayClubName: string
  homeGoals:    number
  awayGoals:    number
  extraTime?:   boolean
  scorers?:     MatchScorers   // if already attributed (during sim), reuse — keeps it deterministic
  seed?:        number         // deep-stat seed — same detail as the match modal
  label?:       string         // "Matchday 12", "Quarter-final · Leg 1", … (player game log)
  // The competition-wide matchday it belongs to, for the teams of the matchday
  // (P8-100). Defaults to the label, which is right everywhere except the World
  // Cup groups: "Group A · MD 1" and "Group B · MD 1" are the SAME matchday, and
  // keying by label made each group's matchday its own round (36 group "rounds",
  // each picked from four teams, so "Picked 4 times in 42").
  round?:       string
  // P8-116: the full path's qualifying rounds, whose awards are their own.
  // F-20: the full path's domestic season, counted in the stats but not in
  // the European awards (P8-116's rule: those are the tournament's own).
  stage?:       'qualifying' | 'domestic'
  // P8-70: the shape each side actually played, read off the regenerated sheet
  // when the run's stats are computed (P8-68 made it change match to match).
  homeFormation?: string
  awayFormation?: string
  // P8-103: the shootout, on the match it followed (the run hub's sheets).
  pensNote?:    string
  shootout?:    ShootoutView
  // §10.5 — carried so the aggregation regenerates the eleven that played.
  homeRotation?: number
  awayRotation?: number
  absent?:      string[]
  standIns?:    RosterPlayer[]
}

/** The teams-of-the-matchday round a match counts toward (P8-100). */
export const roundKeyOf = (m: RunMatch, idx: number) => m.round ?? m.label ?? `Match ${idx + 1}`

// Merge two scorer sets that share the same home/away orientation (e.g. a second
// leg's regulation scorers + its extra-time scorers) into one for stats totals.
function mergeScorers(a?: MatchScorers, b?: MatchScorers): MatchScorers | undefined {
  if (!a && !b) return undefined
  return { home: [...(a?.home ?? []), ...(b?.home ?? [])], away: [...(a?.away ?? []), ...(b?.away ?? [])] }
}

// A league run: one round per matchday.
export function leagueRunMatches(simResult: SeasonResult): RunMatch[] {
  return (simResult.matchdayHistory ?? []).flatMap(s =>
    s.fixtures.filter(f => f.result).map(f => ({
      homeClubId: (f.home as any).clubId, awayClubId: (f.away as any).clubId,
      homeClubName: f.home.clubName, awayClubName: f.away.clubName,
      homeGoals: f.result!.homeGoals, awayGoals: f.result!.awayGoals,
      scorers: f.scorers, seed: f.seed, label: `Matchday ${s.matchday}`,
      homeRotation: f.homeRotation, awayRotation: f.awayRotation,
      absent: f.absent, standIns: f.standIns,
    })))
}

// ── Champions League ──
const CL_ROUND_LABEL: Record<string, string> = {
  playoff: 'Playoff', r16: 'Round of 16', qf: 'Quarter-final', sf: 'Semi-final', final: 'Final',
}

// Two-legged ties stay two rounds: in the real competition each leg is its own
// matchday (and its own team of the week), so only the label is needed here.
export function clRunMatches(result: CLSeasonResult, qualTies?: QualTie[] | null): RunMatch[] {
  const matches: RunMatch[] = []
  // The full path's domestic season comes first, as it was played (F-20).
  for (const m of result.domesticMatchdays ?? [])
    matches.push({ homeClubId: m.home.clubId, awayClubId: m.away.clubId, homeClubName: m.home.clubName, awayClubName: m.away.clubName, homeGoals: m.homeGoals, awayGoals: m.awayGoals, scorers: m.scorers, seed: m.seed, label: `Domestic Season · Matchday ${m.matchday}`, homeRotation: m.homeRotation, awayRotation: m.awayRotation, absent: m.absent, standIns: m.standIns, stage: 'domestic' })
  // Qualifying ties (both legs + ET, same folding as the knockout legs below).
  for (const t of qualTies ?? []) {
    if (!t.teamB || !t.legs) continue
    const l = t.legs
    // Named per round: all four used to be "Qualifying", which merged Q1..the
    // play-off into one pair of matchdays for the teams of the matchday (P8-100).
    const qualRound = QUAL_ROUND_LABEL[t.round] ?? 'Qualifying'
    matches.push({ homeClubId: t.teamA.clubId, awayClubId: t.teamB.clubId, homeClubName: t.teamA.clubName, awayClubName: t.teamB.clubName, homeGoals: l.leg1.homeGoals, awayGoals: l.leg1.awayGoals, scorers: t.leg1Scorers, seed: t.leg1Seed, label: `${qualRound} · Leg 1`, stage: 'qualifying' })
    const etH = l.leg2ExtraTime?.homeGoals ?? 0, etA = l.leg2ExtraTime?.awayGoals ?? 0
    matches.push({ homeClubId: t.teamB.clubId, awayClubId: t.teamA.clubId, homeClubName: t.teamB.clubName, awayClubName: t.teamA.clubName, homeGoals: l.leg2.homeGoals + etH, awayGoals: l.leg2.awayGoals + etA, scorers: mergeScorers(t.leg2Scorers, t.leg2ExtraTimeScorers), seed: t.leg2Seed, extraTime: !!l.leg2ExtraTime, label: `${qualRound} · Leg 2`, stage: 'qualifying' })
  }
  for (const m of result.leagueMatchdays ?? [])
    matches.push({ homeClubId: m.home.clubId, awayClubId: m.away.clubId, homeClubName: m.home.clubName, awayClubName: m.away.clubName, homeGoals: m.homeGoals, awayGoals: m.awayGoals, scorers: m.scorers, seed: m.seed, label: `League Phase · MD ${m.matchday}`, homeRotation: m.homeRotation, awayRotation: m.awayRotation, absent: m.absent, standIns: m.standIns })
  // two-legged ties → two matches (shootout pens are excluded — leg scores are 90'/ET only)
  for (const k of [...result.playoffRound, ...result.r16, ...result.qf, ...result.sf]) {
    const roundLabel = CL_ROUND_LABEL[k.round] ?? k.round
    if (k.leg1) matches.push({ homeClubId: k.teamA.clubId, awayClubId: k.teamB.clubId, homeClubName: k.teamA.clubName, awayClubName: k.teamB.clubName, homeGoals: k.leg1.aGoals, awayGoals: k.leg1.bGoals, scorers: k.leg1Scorers, seed: k.leg1Seed, label: `${roundLabel} · Leg 1`, absent: k.leg1Absent, standIns: k.leg1StandIns })
    // Leg 2 = regulation + extra time folded together (one match, so clean sheets
    // and match counts stay right), with both scorer sets merged for totals.
    if (k.leg2) {
      const etB = k.leg2ExtraTime?.bGoals ?? 0, etA = k.leg2ExtraTime?.aGoals ?? 0
      matches.push({ homeClubId: k.teamB.clubId, awayClubId: k.teamA.clubId, homeClubName: k.teamB.clubName, awayClubName: k.teamA.clubName, homeGoals: k.leg2.bGoals + etB, awayGoals: k.leg2.aGoals + etA, scorers: mergeScorers(k.leg2Scorers, k.leg2ExtraTimeScorers), seed: k.leg2Seed, extraTime: !!k.leg2ExtraTime, label: `${roundLabel} · Leg 2`, absent: k.leg2Absent, standIns: k.leg2StandIns, ...clTieShootout(k, false) })
    }
  }
  if (result.final)
    matches.push({ homeClubId: result.final.teamA.clubId, awayClubId: result.final.teamB.clubId, homeClubName: result.final.teamA.clubName, awayClubName: result.final.teamB.clubName, homeGoals: result.final.aGoals, awayGoals: result.final.bGoals, extraTime: result.final.extraTime, scorers: result.final.leg1Scorers, seed: result.final.leg1Seed, label: 'Final', absent: result.final.leg1Absent, standIns: result.final.leg1StandIns, ...clTieShootout(result.final, true) })
  return matches
}

// ── World Cup ──
const WC_ROUND_LABEL: Record<string, string> = {
  r32: 'Round of 32', r16: 'Round of 16', qf: 'Quarter-final', sf: 'Semi-final',
  third: '3rd-Place Playoff', final: 'Final',
}

// Every group plays matchday N together, so the group games share a round per
// matchday (P8-100); each knockout round is one round.
export function wcRunMatches(result: WCSeasonResult): RunMatch[] {
  const matches: RunMatch[] = []
  for (const m of result.groupMatchdays ?? [])
    matches.push({ homeClubId: m.home.clubId, awayClubId: m.away.clubId, homeClubName: m.home.clubName, awayClubName: m.away.clubName, homeGoals: m.homeGoals, awayGoals: m.awayGoals, scorers: m.scorers, seed: m.seed, label: `Group ${m.groupId} · MD ${m.matchday}`, round: `Group stage · MD ${m.matchday}`, homeRotation: m.homeRotation, awayRotation: m.awayRotation, absent: m.absent, standIns: m.standIns })
  for (const round of result.knockoutRounds) for (const k of round.matches)
    matches.push({ homeClubId: k.teamA.clubId, awayClubId: k.teamB.clubId, homeClubName: k.teamA.clubName, awayClubName: k.teamB.clubName, homeGoals: k.result.homeGoals, awayGoals: k.result.awayGoals, extraTime: k.result.extraTime, scorers: k.scorers, seed: k.seed, label: WC_ROUND_LABEL[round.round] ?? round.round, absent: k.absent, standIns: k.standIns, ...wcTieShootout(k) })
  return matches
}
