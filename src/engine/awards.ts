/**
 * Awards Night (docs/ui-overhaul/07c C7, and the maintainer's P4-A…F).
 *
 * Every award here is EARNED BY MEASUREMENT. Player of the Season is the
 * scoring model in `computeAwards` (stats.ts) — goals, assists, clean sheets,
 * man-of-the-match awards, the deep columns and a sustained rating, carried by
 * how low the club finished. A first version handed that decision to three
 * invented pundits voting; the maintainer rejected it, rightly: an award is a
 * verdict on a season the player just watched, and it has to be arguable from
 * the numbers. Each award therefore carries the numbers that won it.
 *
 * Teams of the season and of each matchday don't force a shape: the strongest
 * players at each position are weighed against each other, and whichever of
 * the twelve formations fits the best of them is the one the team is drawn in.
 *
 * Pure and deterministic: inputs in any order, the same night out.
 */

import type { AwardCandidate, CompetitionStats, SeasonAwards } from '@/types/stats'
import type { Formation, PositionSlot } from '@/types/game'
import { ALL_FORMATIONS, getSlotsForFormation } from './formations'

// ── Lines ────────────────────────────────────────────────────────────────────
export type Line = 'GK' | 'DEF' | 'MID' | 'FWD'

const LINE_OF: Record<string, Line> = {
  GK: 'GK',
  RB: 'DEF', CB: 'DEF', LB: 'DEF', RWB: 'DEF', LWB: 'DEF',
  CDM: 'MID', CM: 'MID', CAM: 'MID', RM: 'MID', LM: 'MID',
  RW: 'FWD', LW: 'FWD', CF: 'FWD', ST: 'FWD',
}

export function lineOf(position: string): Line {
  return LINE_OF[position.toUpperCase()] ?? 'MID'
}

// Ties always break on id, so the night is the same whatever order the
// candidates arrive in.
const byThenId = <T extends { id: string }>(score: (x: T) => number) =>
  (a: T, b: T) => score(b) - score(a) || a.id.localeCompare(b.id)

// ── Picking a team in its best shape ─────────────────────────────────────────
export type Pick = {
  id: string; name: string; position: string; score: number
  clubName: string; isPlayerClub?: boolean
}
export type PickedTeam = {
  formation: Formation
  xi: { slot: PositionSlot; player: Pick }[]
  bench: Pick[]           // honourable mentions: the best who didn't make the eleven
  total: number
}

// How many of the best at each position are weighed when choosing a shape.
const SHORTLIST_PER_POSITION = 5
// A player in a slot that accepts his position, rather than his own: allowed,
// but worth less, so a shape is only chosen when it suits real specialists.
const OFF_POSITION = 0.85
export const BENCH_SIZE = 7

function fillFormation(formation: Formation, pool: Pick[]): { xi: PickedTeam['xi']; total: number } {
  const slots = getSlotsForFormation(formation)
  // Every (slot, player) pairing a formation allows, best value first; take
  // each one whose slot and player are both still free. A greedy match, but
  // over value-sorted pairs it lands on the obvious eleven for real squads.
  const pairs: { slot: PositionSlot; player: Pick; value: number }[] = []
  for (const slot of slots) {
    for (const player of pool) {
      const fit = player.position === slot.primary ? 1 : slot.accepts.includes(player.position as never) ? OFF_POSITION : 0
      if (fit > 0) pairs.push({ slot, player, value: player.score * fit })
    }
  }
  pairs.sort((a, b) => b.value - a.value || a.slot.slotIndex - b.slot.slotIndex || a.player.id.localeCompare(b.player.id))
  const usedSlot = new Set<number>(), usedPlayer = new Set<string>()
  const xi: PickedTeam['xi'] = []
  let total = 0
  for (const p of pairs) {
    if (usedSlot.has(p.slot.slotIndex) || usedPlayer.has(p.player.id)) continue
    usedSlot.add(p.slot.slotIndex); usedPlayer.add(p.player.id)
    xi.push({ slot: p.slot, player: p.player }); total += p.value
  }
  xi.sort((a, b) => a.slot.slotIndex - b.slot.slotIndex)
  // An eleven with a gap is never "the best shape": it loses to any full one.
  return { xi, total: xi.length === slots.length ? total : total - 1e6 }
}

// A line's usual share of an eleven. Scores aren't comparable across lines —
// the season score rewards goals, so forwards out-score defenders by default,
// and a raw comparison picks three at the back every time. Each player is
// weighed against the usual starters of his own line instead: a shape wins
// when it makes room for players who are exceptional FOR THEIR POSITION.
const LINE_STARTERS: Record<Line, number> = { GK: 1, DEF: 4, MID: 3, FWD: 3 }

export function pickTeam(all: Pick[]): PickedTeam | null {
  if (all.length === 0) return null
  const byPosition = new Map<string, Pick[]>()
  for (const p of all) byPosition.set(p.position, [...(byPosition.get(p.position) ?? []), p])
  const shortlisted = [...byPosition.values()].flatMap(list => [...list].sort(byThenId<Pick>(x => x.score)).slice(0, SHORTLIST_PER_POSITION))

  const byLine = new Map<Line, number[]>()
  for (const p of all) byLine.set(lineOf(p.position), [...(byLine.get(lineOf(p.position)) ?? []), p.score])
  const baseline = new Map<Line, number>()
  for (const [line, scores] of byLine) {
    const top = scores.sort((a, b) => b - a).slice(0, LINE_STARTERS[line])
    baseline.set(line, Math.max(1e-6, top.reduce((s, x) => s + x, 0) / top.length))
  }
  // Relative value picks the shape and the players; the real score is kept for display.
  const shortlist = shortlisted.map(p => ({ ...p, score: p.score / baseline.get(lineOf(p.position))! }))
  const real = new Map(shortlisted.map(p => [p.id, p]))

  let best: { formation: Formation; xi: PickedTeam['xi']; total: number } | null = null
  for (const formation of ALL_FORMATIONS) {
    const filled = fillFormation(formation, shortlist)
    if (!best || filled.total > best.total) best = { formation, ...filled }
  }
  if (!best) return null
  const xi = best.xi.map(x => ({ slot: x.slot, player: real.get(x.player.id)! }))
  const inXI = new Set(xi.map(x => x.player.id))
  const bench = [...all].filter(p => !inXI.has(p.id)).sort(byThenId<Pick>(x => x.score)).slice(0, BENCH_SIZE)
  return { formation: best.formation, xi, bench, total: Math.round(best.total * 100) / 100 }
}

const candidatePick = (c: AwardCandidate): Pick => ({
  id: c.playerId, name: c.name, position: c.position, score: c.score,
  clubName: c.clubName, isPlayerClub: c.isPlayerClub,
})

// ── Player awards ────────────────────────────────────────────────────────────
export type PlayerAwardKey =
  | 'pots' | 'boot' | 'playmaker' | 'glove' | 'defender' | 'midfielder' | 'forward' | 'u21' | 'motm' | 'totr'

export type PlayerAward = {
  key: PlayerAwardKey
  title: string
  how: string                       // one line: what decides this award
  winner: AwardCandidate
  runnersUp: AwardCandidate[]
  /** The number this award is decided on, as the screen prints it. */
  headline: (c: AwardCandidate) => string
}

type AwardDef = {
  key: PlayerAwardKey
  title: string
  how: string
  eligible?: (c: AwardCandidate) => boolean
  value: (c: AwardCandidate) => number
  tiebreak?: (c: AwardCandidate) => number
  headline: (c: AwardCandidate) => string
}

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`

const PLAYER_AWARDS: AwardDef[] = [
  { key: 'boot', title: 'Golden boot', how: 'Most goals. Level on goals, the better overall season.',
    value: c => c.goals, tiebreak: c => c.score, headline: c => plural(c.goals, 'goal') },
  { key: 'playmaker', title: 'Playmaker of the season', how: 'Most assists. Level on assists, the most chances created.',
    value: c => c.assists, tiebreak: c => c.chancesCreated ?? 0, headline: c => `${plural(c.assists, 'assist')}, ${plural(c.chancesCreated ?? 0, 'chance')} created` },
  { key: 'glove', title: 'Golden glove', how: 'Most clean sheets by a keeper. Level on clean sheets, the most saves.',
    eligible: c => lineOf(c.position) === 'GK', value: c => c.cleanSheets, tiebreak: c => c.saves ?? 0,
    headline: c => `${plural(c.cleanSheets, 'clean sheet')}, ${plural(c.saves ?? 0, 'save')}` },
  { key: 'defender', title: 'Defender of the season', how: 'The best season score among defenders.',
    eligible: c => lineOf(c.position) === 'DEF', value: c => c.score,
    headline: c => `${c.tacklesWon ?? 0} tackles won, ${c.interceptions ?? 0} interceptions, ${plural(c.cleanSheets, 'clean sheet')}` },
  { key: 'midfielder', title: 'Midfielder of the season', how: 'The best season score among midfielders.',
    eligible: c => lineOf(c.position) === 'MID', value: c => c.score,
    headline: c => `${plural(c.goals, 'goal')}, ${plural(c.assists, 'assist')}, ${plural(c.chancesCreated ?? 0, 'chance')} created` },
  { key: 'forward', title: 'Forward of the season', how: 'The best season score among forwards.',
    eligible: c => lineOf(c.position) === 'FWD', value: c => c.score,
    headline: c => `${plural(c.goals, 'goal')}, ${plural(c.assists, 'assist')}, ${c.shotsOnTarget ?? 0} on target` },
  { key: 'motm', title: 'Man of the match, most often', how: 'Most man-of-the-match awards. Level, the higher average rating.',
    value: c => c.potm ?? 0, tiebreak: c => c.avgRating ?? 0,
    headline: c => `${plural(c.potm ?? 0, 'award')}${c.avgRating ? `, ${c.avgRating.toFixed(2)} average` : ''}` },
]

function decide(def: AwardDef, candidates: AwardCandidate[]): PlayerAward | null {
  const ranked = candidates
    .filter(c => (def.eligible ? def.eligible(c) : true) && def.value(c) > 0)
    .sort((a, b) => def.value(b) - def.value(a)
      || (def.tiebreak ? def.tiebreak(b) - def.tiebreak(a) : 0)
      || b.score - a.score
      || a.playerId.localeCompare(b.playerId))
  if (!ranked.length) return null
  return { key: def.key, title: def.title, how: def.how, winner: ranked[0], runnersUp: ranked.slice(1, 4), headline: def.headline }
}

// ── Club awards ──────────────────────────────────────────────────────────────
export type ClubRow = { clubId: string; clubName: string; finalPosition: number; predicted?: number }

export type ClubAward = {
  key: 'attack' | 'defence' | 'manager'
  title: string
  how: string
  winner: { clubId: string; clubName: string; isPlayerClub: boolean; headline: string }
  runnersUp: { clubName: string; headline: string }[]
}

// The manager award (P4-F): beating what was expected, with a bonus for
// winning the thing, so the favourite who delivers the title can take it as
// easily as a surprise. "Expected" is the pundits' pre-season place.
const TITLE_BONUS = 3

function clubAwards(stats: CompetitionStats, clubs: ClubRow[], playerClubId?: string): ClubAward[] {
  const out: ClubAward[] = []
  const teams = [...stats.teams]
  const name = (id: string) => teams.find(t => t.clubId === id)?.clubName ?? clubs.find(c => c.clubId === id)?.clubName ?? ''
  if (teams.length) {
    const attack = [...teams].sort((a, b) => b.goalsFor - a.goalsFor || a.goalsAgainst - b.goalsAgainst || a.clubId.localeCompare(b.clubId))
    if (attack[0].goalsFor > 0) out.push({
      key: 'attack', title: 'Best attack', how: 'Most goals scored.',
      winner: { clubId: attack[0].clubId, clubName: attack[0].clubName, isPlayerClub: attack[0].clubId === playerClubId, headline: plural(attack[0].goalsFor, 'goal') },
      runnersUp: attack.slice(1, 4).map(t => ({ clubName: t.clubName, headline: plural(t.goalsFor, 'goal') })),
    })
    const defence = [...teams].sort((a, b) => a.goalsAgainst - b.goalsAgainst || b.cleanSheets - a.cleanSheets || a.clubId.localeCompare(b.clubId))
    out.push({
      key: 'defence', title: 'Best defence', how: 'Fewest goals conceded. Level, the most clean sheets.',
      winner: { clubId: defence[0].clubId, clubName: defence[0].clubName, isPlayerClub: defence[0].clubId === playerClubId, headline: `${plural(defence[0].goalsAgainst, 'goal')} conceded` },
      runnersUp: defence.slice(1, 4).map(t => ({ clubName: t.clubName, headline: `${plural(t.goalsAgainst, 'goal')} conceded` })),
    })
  }
  const judged = clubs.filter(c => c.predicted != null)
  if (judged.length) {
    const beat = (c: ClubRow) => (c.predicted! - c.finalPosition) + (c.finalPosition === 1 ? TITLE_BONUS : 0)
    const ranked = [...judged].sort((a, b) => beat(b) - beat(a) || a.finalPosition - b.finalPosition || a.clubId.localeCompare(b.clubId))
    const line = (c: ClubRow) => `Tipped ${c.predicted}, finished ${c.finalPosition}`
    out.push({
      key: 'manager', title: 'Manager of the season', how: 'Beat the pundits by the most places. Winning the title counts extra.',
      winner: { clubId: ranked[0].clubId, clubName: name(ranked[0].clubId) || ranked[0].clubName, isPlayerClub: ranked[0].clubId === playerClubId, headline: line(ranked[0]) },
      runnersUp: ranked.slice(1, 4).map(c => ({ clubName: name(c.clubId) || c.clubName, headline: line(c) })),
    })
  }
  return out
}

// ── The night ────────────────────────────────────────────────────────────────
export type RoundTeam = { label: string; team: PickedTeam }

export type AwardsNight = {
  playerOfTheSeason: PlayerAward | null
  bestU21: PlayerAward | null
  players: PlayerAward[]          // the rest of the individual awards, in running order
  clubs: ClubAward[]
  teamOfTheSeason: PickedTeam | null
  teamsOfTheRound: RoundTeam[]
}

export type AwardsInput = {
  awards: SeasonAwards
  stats: CompetitionStats
  /** Every round's players and ratings (run-stats `rounds`). */
  rounds?: { label: string; lines: { playerId: string; name: string; position: string; rating: number; clubName: string; isPlayerClub: boolean }[] }[]
  /** For the manager award; only competitions with a predicted table have one. */
  clubs?: ClubRow[]
  playerClubId?: string
}

export function buildAwardsNight(input: AwardsInput): AwardsNight {
  const candidates = [...input.awards.playerOfTheSeason].sort((a, b) => b.score - a.score || a.playerId.localeCompare(b.playerId))

  const pots: PlayerAward | null = candidates.length
    ? { key: 'pots', title: 'Player of the season', how: 'The best season by the scoring model: every number below, carried by how hard the club had it.',
        winner: candidates[0], runnersUp: candidates.slice(1, 4), headline: c => `Season score ${c.score}` }
    : null
  const u21s = [...input.awards.bestU21].sort((a, b) => b.score - a.score || a.playerId.localeCompare(b.playerId))
  const u21: PlayerAward | null = u21s.length
    ? { key: 'u21', title: 'Best under-21', how: 'The best season score by a player aged 21 or under.',
        winner: u21s[0], runnersUp: u21s.slice(1, 4), headline: c => `Season score ${c.score}${c.age != null ? `, aged ${c.age}` : ''}` }
    : null

  const players = PLAYER_AWARDS.map(d => decide(d, candidates)).filter((a): a is PlayerAward => !!a)

  const teamsOfTheRound: RoundTeam[] = (input.rounds ?? []).map(r => {
    // One entry per player per round (a two-legged round never lists anyone twice).
    const best = new Map<string, Pick>()
    for (const l of r.lines) {
      const cur = best.get(l.playerId)
      if (!cur || l.rating > cur.score) best.set(l.playerId, { id: l.playerId, name: l.name, position: l.position, score: l.rating, clubName: l.clubName, isPlayerClub: l.isPlayerClub })
    }
    const team = pickTeam([...best.values()])
    return team ? { label: r.label, team } : null
  }).filter((x): x is RoundTeam => !!x)

  // The regular of those teams: most selections, then the better average.
  if (teamsOfTheRound.length > 1) {
    const count = new Map<string, number>()
    for (const r of teamsOfTheRound) for (const x of r.team.xi) count.set(x.player.id, (count.get(x.player.id) ?? 0) + 1)
    const regular = candidates
      .filter(c => (count.get(c.playerId) ?? 0) > 0)
      .sort((a, b) => (count.get(b.playerId)! - count.get(a.playerId)!) || (b.avgRating ?? 0) - (a.avgRating ?? 0) || a.playerId.localeCompare(b.playerId))
    if (regular.length) players.push({
      key: 'totr', title: 'Team of the matchday regular', how: 'Picked in the team of the matchday most often.',
      winner: regular[0], runnersUp: regular.slice(1, 4),
      headline: c => `Picked ${plural(count.get(c.playerId) ?? 0, 'time')} in ${teamsOfTheRound.length}`,
    })
  }

  return {
    playerOfTheSeason: pots,
    bestU21: u21,
    players,
    clubs: clubAwards(input.stats, input.clubs ?? [], input.playerClubId),
    teamOfTheSeason: pickTeam(candidates.map(candidatePick)),
    teamsOfTheRound,
  }
}
