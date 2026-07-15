/**
 * Champions League qualifying-ladder sim (custom path).
 *
 * Plays the real qualifying rounds — First/Second/Third qualifying round + the
 * play-off round, across the Champions Path and League Path — from the tagged
 * access list (cl-access.ts) to produce the 7 qualifying league-phase slots.
 * Every tie is a two-legged tie (knockout-match.ts `simulateTwoLegs`, with the
 * corrected ET-only-at-leg-2 rule). The league phase is then `29 direct + 7
 * qualifiers = 36`, handed to the existing `cl-sim.ts`.
 *
 * Robust to missing associations (we don't scrape all 55): each round just pairs
 * whatever field it has, with the strongest side taking a bye when the count is
 * odd — so a partial data set yields a smaller-but-valid field, and adding the
 * long-tail leagues fills it out to a full 36 with zero code change.
 */
import type { SimTeam } from '@/types/simulation'
import { simulateTwoLegs, type TwoLegResult } from './knockout-match'
import { roundPathKey, type CLAccessList, type EntrantClub } from './cl-access'
import type { UclRound, UclPath } from '@/data/uefa-coefficients'

export type QualTeam = SimTeam & {
  associationRank: number
  entryRound: UclRound
  entryPath: UclPath
}

export type QualTie = {
  round:    UclRound
  path:     UclPath
  teamA:    QualTeam
  teamB:    QualTeam | null    // null = bye (teamA advances automatically)
  winnerId: string
  legs:     TwoLegResult | null
  // Attributed once (attributeQualTieScorers) and stored, so the tie detail,
  // stats totals and awards all agree. leg1: teamA home · leg2/ET: teamB home.
  leg1Scorers?: import('@/types/stats').MatchScorers
  leg2Scorers?: import('@/types/stats').MatchScorers
  leg2ExtraTimeScorers?: import('@/types/stats').MatchScorers
  leg1Seed?: number   // deep-stat seeds, one per physical match (match-detail.ts)
  leg2Seed?: number
}

export type QualifyingResult = {
  ties:             QualTie[]          // all ties in play order (for the results screen)
  qualifiers:       QualTeam[]         // play-off winners (nominally 5 CH + 2 LP)
  leaguePhaseField: QualTeam[]         // direct entrants + qualifiers → hand to cl-sim
  /** The player's tie in each round they featured in (if a player team is present). */
  playerPath:       { round: UclRound; path: UclPath; advanced: boolean; eliminated: boolean }[]
}

function toTeam(e: EntrantClub, isPlayer: boolean): QualTeam {
  return {
    clubId: e.clubId, clubName: e.clubName, ovr: e.ovr, isPlayer,
    form: 0, stats: { played: 0, won: 0, drawn: 0, lost: 0, goalsFor: 0, goalsAgainst: 0, points: 0 },
    associationRank: e.associationRank, entryRound: e.entryRound, entryPath: e.entryPath,
  }
}

/**
 * Play one qualifying round for one path. Seeds by OVR (stronger = seeded), pairs
 * seeded vs unseeded, and gives the single strongest team a bye on an odd count.
 * Returns the ties (for display) and the advancing teams.
 */
function playRound(round: UclRound, path: UclPath, field: QualTeam[]): { ties: QualTie[]; winners: QualTeam[] } {
  const ties: QualTie[] = []
  const winners: QualTeam[] = []
  if (field.length === 0) return { ties, winners }
  if (field.length === 1) return { ties, winners: field }   // lone team carries through

  const sorted = [...field].sort((a, b) => b.ovr - a.ovr)

  // Odd count → strongest side gets a bye into the next round.
  if (sorted.length % 2 === 1) {
    const bye = sorted.shift()!
    ties.push({ round, path, teamA: bye, teamB: null, winnerId: bye.clubId, legs: null })
    winners.push(bye)
  }

  const half = sorted.length / 2
  const seeded = sorted.slice(0, half)
  const unseeded = shuffle(sorted.slice(half))

  for (let i = 0; i < half; i++) {
    const a = seeded[i], b = unseeded[i]
    const legs = simulateTwoLegs(a, b)
    const winner = legs.winner === 'home' ? a : b
    ties.push({ round, path, teamA: a, teamB: b, winnerId: winner.clubId, legs })
    winners.push(winner)
  }
  return { ties, winners }
}

/**
 * Run the whole ladder. `access.byRoundPath` holds the NEW entrants for each
 * (round, path); winners are carried forward into the next round of the same path.
 */
export function simulateCustomUclQualifying(access: CLAccessList, playerClubId?: string): QualifyingResult {
  const isPlayer = (id: string) => id === playerClubId
  const entrants = (round: UclRound, path: UclPath): QualTeam[] =>
    (access.byRoundPath[roundPathKey(round, path)] ?? []).map(e => toTeam(e, isPlayer(e.clubId)))

  const allTies: QualTie[] = []
  const run = (round: UclRound, path: UclPath, field: QualTeam[]) => {
    const { ties, winners } = playRound(round, path, field)
    allTies.push(...ties)
    return winners
  }

  // Champions Path: q1 → q2 (+entrants) → q3 → play-off (+entrants)
  const q1cw = run('q1', 'champions', entrants('q1', 'champions'))
  const q2cw = run('q2', 'champions', [...entrants('q2', 'champions'), ...q1cw])
  const q3cw = run('q3', 'champions', [...entrants('q3', 'champions'), ...q2cw])
  const poCH = run('playoff', 'champions', [...entrants('playoff', 'champions'), ...q3cw])

  // League Path: q2 → q3 (+entrants) → play-off
  const q2lw = run('q2', 'league', entrants('q2', 'league'))
  const q3lw = run('q3', 'league', [...entrants('q3', 'league'), ...q2lw])
  const poLP = run('playoff', 'league', [...entrants('playoff', 'league'), ...q3lw])

  const qualifiers = [...poCH, ...poLP]

  // Direct league-phase entrants + qualifiers = the league-phase field.
  const directTeams = access.leaguePhaseDirect.map(e => toTeam(e, isPlayer(e.clubId)))
  const leaguePhaseField = [...directTeams, ...qualifiers]

  // Trace the player's qualifying route (if they started in the ladder).
  const playerPath: QualifyingResult['playerPath'] = []
  if (playerClubId) {
    for (const t of allTies) {
      if (t.teamA.clubId !== playerClubId && t.teamB?.clubId !== playerClubId) continue
      const advanced = t.winnerId === playerClubId
      playerPath.push({ round: t.round, path: t.path, advanced, eliminated: !advanced })
    }
  }

  return { ties: allTies, qualifiers, leaguePhaseField, playerPath }
}

function shuffle<T>(arr: T[]): T[] {
  return [...arr].sort(() => Math.random() - 0.5)
}
