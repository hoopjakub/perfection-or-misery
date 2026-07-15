import type { SimTeam } from '@/types/simulation'
import type { MatchScorers } from '@/types/stats'
import { simulateMatch } from './match'
import { simulateKnockout, simulateTwoLegs, type PenKick } from './knockout-match'

export type CLPot = 1 | 2 | 3 | 4

export type CLTeam = SimTeam & {
  pot: CLPot
}

export type CLKnockoutMatch = {
  round:     string
  teamA:     CLTeam
  teamB:     CLTeam
  winner:    CLTeam
  aGoals:    number   // aggregate goals for teamA
  bGoals:    number   // aggregate goals for teamB
  leg1?:     { aGoals: number; bGoals: number }  // two-leg ties only (teamA at home), 90'
  leg2?:     { aGoals: number; bGoals: number }  // two-leg ties only (teamB at home), 90'
  leg2ExtraTime?: { aGoals: number; bGoals: number }  // ET-only goals at leg 2 (present iff ET was played)
  extraTime: boolean
  aPens?:    number
  bPens?:    number
  leg1Scorers?: MatchScorers   // attributed once, stored — leg1 (or the single final)
  leg2Scorers?: MatchScorers   // leg2 regulation (teamB at home), minutes 1-90
  leg2ExtraTimeScorers?: MatchScorers  // leg2 extra time (teamB at home), minutes 91-120
  leg1Seed?: number            // deep-stat seeds, one per physical match (match-detail.ts)
  leg2Seed?: number
  aPenKicks?: boolean[]        // raw make/miss sequence from the shootout sim
  bPenKicks?: boolean[]
  penKicksA?: PenKick[]        // names zipped on at reveal, stored for the result screen
  penKicksB?: PenKick[]
}

// A single league-phase fixture result, recorded for the results screen.
export type CLLeagueMatch = {
  matchday:  number
  home:      { clubId: string; clubName: string; isPlayer: boolean }
  away:      { clubId: string; clubName: string; isPlayer: boolean }
  homeGoals: number
  awayGoals: number
  scorers?:  MatchScorers
  seed?:     number   // deep-stat seed (match-detail.ts)
}

export type CLSeasonResult = {
  leaguePhaseStandings: CLTeam[]
  playoffRound:         CLKnockoutMatch[]
  r16:                  CLKnockoutMatch[]
  qf:                   CLKnockoutMatch[]
  sf:                   CLKnockoutMatch[]
  final:                CLKnockoutMatch | null
  winner:               CLTeam
  playerTeam:           CLTeam
  // Custom-path-only outcomes: 'not_qualified' (domestic finish earned no UCL
  // spot at all) and the qualifying-stage exits (q1/q2/q3/quali_playoff_exit) —
  // all EARLIER than `playoff_exit` (the post-league-phase knockout play-off).
  playerFinalRound:     'not_qualified'
                       | 'q1_exit' | 'q2_exit' | 'q3_exit' | 'quali_playoff_exit'
                       | 'league_exit' | 'playoff_exit' | 'r16_exit' | 'qf_exit' | 'sf_exit' | 'finalist' | 'winner'
  playerPot:            CLPot
  leagueMatchdays?:     CLLeagueMatch[]   // populated by the simulation component
}

export function buildCLTeams(
  clubs: { clubId: string; clubName: string; ovr: number; isPlayer: boolean }[]
): CLTeam[] {
  const teams: CLTeam[] = clubs.map(c => ({
    clubId:   c.clubId,
    clubName: c.clubName,
    ovr:      c.ovr,
    isPlayer: c.isPlayer,
    form:     0,
    pot:      1 as CLPot,
    stats:    { played: 0, won: 0, drawn: 0, lost: 0, goalsFor: 0, goalsAgainst: 0, points: 0 },
  }))

  const sorted = [...teams].sort((a, b) => b.ovr - a.ovr)
  const potSize = Math.ceil(teams.length / 4)
  sorted.forEach((t, i) => {
    t.pot = (Math.min(4, Math.floor(i / potSize) + 1)) as CLPot
  })

  return teams
}

type CLFixture = { home: CLTeam; away: CLTeam }

// Every team plays exactly 2 opponents from EACH pot (1 home, 1 away) — the
// real UEFA league-phase rule. A plain round-robin rotation (the old approach)
// ignores pots entirely, so who you actually played bore no relation to the
// pot badges shown on the fixture list.
//
// Home/away balance within a group of teams is just a consistent rotational
// orientation of a cycle: team i always hosts its cyclic successor and visits
// its predecessor. That gives every team exactly one home + one away leg
// against that group, for any single cycle.
//
// Scheduling into rounds is a separate concern: an ODD-length cycle (a 9-team
// pot, the normal UCL case) can't be split cleanly into 2 conflict-free
// rounds — a 9-cycle's 9 edges need at least 3 rounds since no matching in an
// odd cycle covers more than 4 of its 9 vertices at once. Splitting the group
// into one EVEN sub-cycle (which slots into exactly 2 rounds) plus one small
// ODD sub-cycle (the unavoidable leftover, kept as small as possible) makes
// the whole schedule vastly easier to pack into 8 rounds.
function cycleFixtures(group: CLTeam[]): CLFixture[] {
  const n = group.length
  const out: CLFixture[] = []
  for (let i = 0; i < n; i++) out.push({ home: group[i], away: group[(i + 1) % n] })
  return out
}

function samePotFixtures(pot: CLTeam[]): CLFixture[] {
  const n = pot.length
  if (n < 2) return []
  if (n === 2) return [{ home: pot[0], away: pot[1] }, { home: pot[1], away: pot[0] }]
  if (n % 2 === 0) return cycleFixtures(pot)
  // Odd group — split off the smallest possible odd cycle (a triangle) and
  // cycle the even remainder cleanly.
  const triangle = pot.slice(0, 3)
  const rest = pot.slice(3)
  return [...cycleFixtures(triangle), ...(rest.length >= 2 ? cycleFixtures(rest) : [])]
}

// Cross-pot: two offset-based bijections between potA and potB. Matching 1
// (offset 0) always has potA hosting; matching 2 (offset ≈ half the pot)
// always has potB hosting. Distinct, nonzero offsets guarantee each side's
// two opponents from the other pot are different clubs.
function crossPotFixtures(potA: CLTeam[], potB: CLTeam[]): CLFixture[] {
  const nA = potA.length, nB = potB.length
  if (nA === 0 || nB === 0) return []
  const shift = nB > 1 ? Math.max(1, Math.floor(nB / 2)) : 0
  const out: CLFixture[] = []
  for (let i = 0; i < nA; i++) {
    const opp1 = potB[i % nB]
    out.push({ home: potA[i], away: opp1 })
    if (nB > 1) {
      const opp2 = potB[(i + shift) % nB]
      out.push({ home: opp2, away: potA[i] })
    } else {
      out.push({ home: opp1, away: potA[i] })   // single-team pot — play them twice, once each venue
    }
  }
  return out
}

function shuffled<T>(arr: T[]): T[] {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

// Packing an 8-regular graph's 144 edges into 8 conflict-free rounds is a
// proper edge-colouring problem. Global backtracking over all 144 edges at
// once (try every edge, undo on failure) never finishes in reasonable time —
// the search space is too big without real pruning. What actually works: pull
// off ONE round at a time as a maximum (ideally perfect) matching of
// whichever edges remain, using most-constrained-team-first ordering — a much
// smaller search per round, and each successfully-found round shrinks the
// remaining graph for the next one.
function findRoundMatching(pool: CLFixture[], teamIds: string[], stepBudget: number): CLFixture[] | null {
  const byTeam = new Map<string, CLFixture[]>()
  for (const id of teamIds) byTeam.set(id, [])
  for (const fx of pool) {
    byTeam.get(fx.home.clubId)?.push(fx)
    byTeam.get(fx.away.clubId)?.push(fx)
  }
  const usedTeam = new Set<string>()
  const usedFixture = new Set<CLFixture>()
  const result: CLFixture[] = []
  let steps = 0

  function otherSide(fx: CLFixture, team: string): string {
    return fx.home.clubId === team ? fx.away.clubId : fx.home.clubId
  }
  function optionsFor(team: string): CLFixture[] {
    return (byTeam.get(team) ?? []).filter(fx => !usedFixture.has(fx) && !usedTeam.has(otherSide(fx, team)))
  }
  // Most-constrained-first: always branch on the team with the fewest
  // remaining valid opponents — standard CSP ordering, drastically prunes the
  // search versus a fixed/random team order.
  function pickTeam(): string | null {
    let best: string | null = null, bestCount = Infinity
    for (const id of teamIds) {
      if (usedTeam.has(id)) continue
      const n = optionsFor(id).length
      if (n < bestCount) { bestCount = n; best = id; if (n === 0) break }
    }
    return best
  }

  function backtrack(): boolean {
    if (++steps > stepBudget) return false
    const team = pickTeam()
    if (team === null) return usedTeam.size === teamIds.length
    const options = shuffled(optionsFor(team))
    if (options.length === 0) return false
    for (const fx of options) {
      const other = otherSide(fx, team)
      usedTeam.add(team); usedTeam.add(other); usedFixture.add(fx); result.push(fx)
      if (backtrack()) return true
      usedTeam.delete(team); usedTeam.delete(other); usedFixture.delete(fx); result.pop()
    }
    return false
  }

  if (backtrack()) return result
  return null
}

function scheduleIntoRounds(fixtures: CLFixture[], teams: CLTeam[], rounds: number): CLFixture[][] | null {
  const teamIds = teams.map(t => t.clubId)
  let remaining = fixtures
  const out: CLFixture[][] = []
  for (let r = 0; r < rounds; r++) {
    const matching = findRoundMatching(remaining, teamIds, 50_000)
    if (!matching) return null
    out.push(matching)
    const used = new Set(matching)
    remaining = remaining.filter(fx => !used.has(fx))
  }
  return remaining.length === 0 ? out : null
}

// Old plain round-robin rotation — kept only as a last-resort fallback if the
// pot-aware scheduler somehow can't pack every fixture into 8 conflict-free
// rounds (shouldn't happen for a normal 36-team/4-pot field).
function legacyRotationFixtures(teams: CLTeam[]): { matchday: number; home: CLTeam; away: CLTeam }[] {
  const list = [...teams]
  if (list.length % 2 !== 0) list.push({ clubId: '__bye__' } as CLTeam)
  const n = list.length
  const half = n / 2
  const fixed = list[0]
  const rotating = list.slice(1)
  const fixtures: { matchday: number; home: CLTeam; away: CLTeam }[] = []
  for (let round = 0; round < 8; round++) {
    const roundTeams = [fixed, ...rotating]
    for (let i = 0; i < half; i++) {
      const home = roundTeams[i]
      const away = roundTeams[n - 1 - i]
      if (home.clubId === '__bye__' || away.clubId === '__bye__') continue
      fixtures.push({ matchday: round + 1, home, away })
    }
    rotating.unshift(rotating.pop()!)
  }
  return fixtures
}

export function generateCLLeagueFixtures(
  teams: CLTeam[]
): { matchday: number; home: CLTeam; away: CLTeam }[] {
  const pots: Record<number, CLTeam[]> = { 1: [], 2: [], 3: [], 4: [] }
  for (const t of teams) (pots[t.pot] ??= []).push(t)
  const potIds = [1, 2, 3, 4].filter(p => pots[p].length > 0)

  const fixtures: CLFixture[] = []
  for (const p of potIds) fixtures.push(...samePotFixtures(pots[p]))
  for (let i = 0; i < potIds.length; i++)
    for (let j = i + 1; j < potIds.length; j++)
      fixtures.push(...crossPotFixtures(pots[potIds[i]], pots[potIds[j]]))

  // Pack into 8 conflict-free rounds, retried with a fresh shuffle if a
  // particular attempt's round-by-round matching search dead-ends.
  for (let attempt = 0; attempt < 40; attempt++) {
    const rounds = scheduleIntoRounds(fixtures, teams, 8)
    if (rounds) {
      const out: { matchday: number; home: CLTeam; away: CLTeam }[] = []
      rounds.forEach((round, idx) => round.forEach(fx => out.push({ matchday: idx + 1, home: fx.home, away: fx.away })))
      return out
    }
  }

  return legacyRotationFixtures(teams)
}

// Runs the knockout phase after the league phase matchdays are done.
//
// The FULL bracket is always simulated — even when the player is eliminated in
// the league phase or an early knockout round — so the results screen can show
// the whole thing playing out. Once the player loses, they simply stop showing
// up in the winners arrays, so later rounds continue with the other teams.
export function simulateCLKnockoutsOnly(
  sortedLeagueStandings: CLTeam[]
): Omit<CLSeasonResult, 'leaguePhaseStandings'> {
  // The player may not be in this field at all (custom path: eliminated in
  // qualifying, or never qualified domestically) — the bracket still plays out
  // in full; the caller overrides playerTeam/playerFinalRound afterwards.
  const playerTeam = sortedLeagueStandings.find(t => t.isPlayer) ?? sortedLeagueStandings[0]
  const hasPlayer  = sortedLeagueStandings.some(t => t.isPlayer)
  const playerPos  = hasPlayer ? sortedLeagueStandings.findIndex(t => t.isPlayer) + 1 : 99

  // Direct R16 qualifiers: positions 1-8 · Playoff spots: positions 9-24
  const r16Direct   = sortedLeagueStandings.slice(0, 8)
  const playoffPool = sortedLeagueStandings.slice(8, 24)

  // Playoff round (positions 9-24, 8 two-leg ties → 8 winners)
  const shuffledPlayoff = shuffle([...playoffPool])
  const playoffRound: CLKnockoutMatch[] = []
  const playoffWinners: CLTeam[] = []
  for (let i = 0; i < shuffledPlayoff.length; i += 2) {
    const a = shuffledPlayoff[i], b = shuffledPlayoff[i + 1]
    if (!b) { playoffWinners.push(a); continue }   // odd pool (partial field) → bye
    const m = twoLegKO('playoff', a, b)
    playoffRound.push(m); playoffWinners.push(m.winner)
  }

  // R16: each tie pairs a direct qualifier (1st-8th) with a Playoff winner, so
  // two top-8 sides can NEVER meet here — only from the quarter-finals onward.
  // Playoff winners keep their column order (playoff tie i feeds R16 tie i); the
  // direct qualifiers are drawn at random against them.
  const directDraw = shuffle([...r16Direct])
  const r16: CLKnockoutMatch[] = []
  const r16Winners: CLTeam[] = []
  for (let i = 0; i < playoffWinners.length; i++) {
    const a = directDraw[i]
    if (!a) { r16Winners.push(playoffWinners[i]); continue }   // fewer direct than PO winners → bye
    const m = twoLegKO('r16', a, playoffWinners[i])
    r16.push(m); r16Winners.push(m.winner)
  }
  // Direct qualifiers not drawn against a play-off winner (partial fields only) get a bye to the QF.
  for (let i = playoffWinners.length; i < directDraw.length; i++) r16Winners.push(directDraw[i])

  // From here the bracket is FIXED — each round pairs consecutive winners, so
  // the winners of two adjacent ties always meet in the next round (a real tree
  // rather than a fresh random draw every round).
  const qf: CLKnockoutMatch[] = []
  const qfWinners: CLTeam[] = []
  for (let i = 0; i < r16Winners.length; i += 2) {
    const m = twoLegKO('qf', r16Winners[i], r16Winners[i + 1])
    qf.push(m); qfWinners.push(m.winner)
  }

  const sf: CLKnockoutMatch[] = []
  const sfWinners: CLTeam[] = []
  for (let i = 0; i < qfWinners.length; i += 2) {
    const m = twoLegKO('sf', qfWinners[i], qfWinners[i + 1])
    sf.push(m); sfWinners.push(m.winner)
  }

  // Final (single leg, neutral venue)
  const final = singleKO('final', sfWinners[0], sfWinners[1])

  // Where did the player bow out? Find their tie in each round in order; the
  // first round they don't win is their exit.
  const playerTie = (arr: CLKnockoutMatch[]) =>
    arr.find(m => m.teamA.isPlayer || m.teamB.isPlayer)

  let playerFinalRound: CLSeasonResult['playerFinalRound']
  if (playerPos > 24) {
    playerFinalRound = 'league_exit'
  } else {
    const po = playerTie(playoffRound)
    const r  = playerTie(r16)
    const q  = playerTie(qf)
    const s  = playerTie(sf)
    if (po && !po.winner.isPlayer)                      playerFinalRound = 'playoff_exit'
    else if (r && !r.winner.isPlayer)                   playerFinalRound = 'r16_exit'
    else if (q && !q.winner.isPlayer)                   playerFinalRound = 'qf_exit'
    else if (s && !s.winner.isPlayer)                   playerFinalRound = 'sf_exit'
    else if (final.teamA.isPlayer || final.teamB.isPlayer)
                                                        playerFinalRound = final.winner.isPlayer ? 'winner' : 'finalist'
    else playerFinalRound = playerPos <= 8 ? 'r16_exit' : 'playoff_exit'
  }

  return {
    playoffRound, r16, qf, sf, final,
    winner: final.winner,
    playerTeam,
    playerFinalRound,
    playerPot: playerTeam.pot,
  }
}

// Two-leg tie used for all UCL knockout rounds except the final
function twoLegKO(round: string, teamA: CLTeam, teamB: CLTeam): CLKnockoutMatch {
  const result = simulateTwoLegs(teamA, teamB)
  const winner = result.winner === 'home' ? teamA : teamB
  return {
    round, teamA, teamB, winner,
    aGoals:    result.totalA,
    bGoals:    result.totalB,
    // leg1: teamA at home. leg2: teamB at home (teamA is away). Both 90' only —
    // ET (if played) is kept separate so each leg reads as its own match.
    leg1:      { aGoals: result.leg1.homeGoals, bGoals: result.leg1.awayGoals },
    leg2:      { aGoals: result.leg2.awayGoals, bGoals: result.leg2.homeGoals },
    leg2ExtraTime: result.leg2ExtraTime
      ? { aGoals: result.leg2ExtraTime.awayGoals, bGoals: result.leg2ExtraTime.homeGoals }
      : undefined,
    extraTime: result.extraTime,
    aPens:     result.homePens ?? undefined,
    bPens:     result.awayPens ?? undefined,
    aPenKicks: result.homePenKicks,
    bPenKicks: result.awayPenKicks,
  }
}

// Single-leg for the final (neutral venue)
function singleKO(round: string, teamA: CLTeam, teamB: CLTeam): CLKnockoutMatch {
  const result = simulateKnockout(teamA, teamB)
  const winner = result.winner === 'home' ? teamA : teamB
  return {
    round, teamA, teamB, winner,
    aGoals:    result.homeGoals,
    bGoals:    result.awayGoals,
    extraTime: result.extraTime,
    aPens:     result.homePens ?? undefined,
    bPens:     result.awayPens ?? undefined,
    aPenKicks: result.homePenKicks,
    bPenKicks: result.awayPenKicks,
  }
}

function shuffle<T>(arr: T[]): T[] {
  return [...arr].sort(() => Math.random() - 0.5)
}
