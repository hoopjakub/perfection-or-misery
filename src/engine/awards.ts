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
import { forCompetition, seasonWord } from '../data/competition'
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
  /** P8-171: his club's id, for its crest on the shirt (the code stays beside it). */
  clubId?: string
  /** His rating — the match rating for a team of the matchday, the season
   *  average for the team of the season — drawn as the rating square on the
   *  pitch, so who was better reads from the colour. */
  rating?: number
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

/** A team in a GIVEN shape (P8-70: a club's most-used eleven in its most-used
 *  formation), filled the same way the awards fill theirs; the bench is the
 *  best of the rest. */
export function teamInFormation(formation: Formation, all: Pick[]): PickedTeam | null {
  if (all.length === 0) return null
  const filled = fillFormation(formation, all)
  const inXI = new Set(filled.xi.map(x => x.player.id))
  const bench = [...all].filter(p => !inXI.has(p.id)).sort(byThenId<Pick>(x => x.score)).slice(0, BENCH_SIZE)
  return { formation, xi: filled.xi, bench, total: filled.total }
}

// P8-170: `keeperId` puts that keeper in goal (the golden glove winner in the
// team of the season); the other keepers can still make the bench.
export function pickTeam(all: Pick[], keeperId?: string): PickedTeam | null {
  if (all.length === 0) return null
  const pool = keeperId && all.some(p => p.id === keeperId) ? all.filter(p => lineOf(p.position) !== 'GK' || p.id === keeperId) : all
  const byPosition = new Map<string, Pick[]>()
  for (const p of pool) byPosition.set(p.position, [...(byPosition.get(p.position) ?? []), p])
  const shortlisted = [...byPosition.values()].flatMap(list => [...list].sort(byThenId<Pick>(x => x.score)).slice(0, SHORTLIST_PER_POSITION))

  const byLine = new Map<Line, number[]>()
  for (const p of pool) byLine.set(lineOf(p.position), [...(byLine.get(lineOf(p.position)) ?? []), p.score])
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
  clubName: c.clubName, clubId: c.clubId, isPlayerClub: c.isPlayerClub, rating: c.avgRating,
})

// ── Player awards ────────────────────────────────────────────────────────────
export type PlayerAwardKey =
  | 'pots' | 'boot' | 'playmaker' | 'glove' | 'defender' | 'fullback' | 'midfielder' | 'defensiveMid' | 'attackingMid' | 'winger' | 'forward'
  | 'u21' | 'motm' | 'totr' | 'qualifying'

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

const FULL_BACKS = new Set(['RB', 'LB', 'RWB', 'LWB'])
const WINGERS = new Set(['RW', 'LW', 'RM', 'LM'])

const PLAYER_AWARDS: AwardDef[] = [
  { key: 'boot', title: 'Golden boot', how: 'Most goals. Level on goals, the better overall season.',
    value: c => c.goals, tiebreak: c => c.score, headline: c => plural(c.goals, 'goal') },
  { key: 'playmaker', title: 'Playmaker of the season', how: 'Most assists. Level on assists, the most chances created.',
    value: c => c.assists, tiebreak: c => c.chancesCreated ?? 0, headline: c => `${plural(c.assists, 'assist')}, ${plural(c.chancesCreated ?? 0, 'chance')} created` },
  { key: 'glove', title: 'Golden glove', how: 'Most clean sheets by a keeper. Level on clean sheets, the most saves.',
    eligible: c => lineOf(c.position) === 'GK', value: c => c.cleanSheets, tiebreak: c => c.saves ?? 0,
    headline: c => `${plural(c.cleanSheets, 'clean sheet')}, ${plural(c.saves ?? 0, 'save')}` },
  // P8-36: every position can win something. The positional awards are split
  // so none is out of reach: a centre-back and a full-back share Defender of
  // the season and a full-back has his own; a CM counts in both midfield
  // awards; wide midfielders and wingers have theirs; the forward award is
  // the strikers'. Boot, playmaker and man of the match stay open to all.
  { key: 'defender', title: 'Defender of the season',
    how: "The best defending — tackles, interceptions, clearances, blocks, duels, clean sheets, mistakes against — measured against his own position, so a full-back's great season counts as much as a centre-back's.",
    eligible: c => lineOf(c.position) === 'DEF', value: c => c.lineScores?.defender ?? c.score, tiebreak: c => c.score,
    headline: c => `${c.tacklesWon ?? 0} tackles won, ${c.interceptions ?? 0} interceptions, ${plural(c.cleanSheets, 'clean sheet')}` },
  { key: 'fullback', title: 'Full-back of the season', how: 'The best full-back or wing-back: his defending, plus what he gave going forward.',
    eligible: c => FULL_BACKS.has(c.position), value: c => c.lineScores?.fullback ?? c.score, tiebreak: c => c.score,
    headline: c => `${c.tacklesWon ?? 0} tackles won, ${plural(c.assists, 'assist')}, ${plural(c.chancesCreated ?? 0, 'chance')} created` },
  // The plain one too (the maintainer, 23 Sept: "we are missing a simple
  // midfielder of the season award"): every midfielder, on the season score.
  { key: 'midfielder', title: 'Midfielder of the season', how: 'The best season score among midfielders: holding, central, attacking and wide.',
    eligible: c => lineOf(c.position) === 'MID', value: c => c.score,
    headline: c => `${plural(c.goals, 'goal')}, ${plural(c.assists, 'assist')}, ${plural(c.chancesCreated ?? 0, 'chance')} created` },
  { key: 'defensiveMid', title: 'Defensive midfielder of the season', how: 'Winning it back and keeping it: tackles, interceptions, duels and passing, plus goals and assists. Holding and central midfielders.',
    eligible: c => c.position === 'CDM' || c.position === 'CM', value: c => c.lineScores?.defensiveMid ?? c.score, tiebreak: c => c.score,
    headline: c => `${c.tacklesWon ?? 0} tackles won, ${c.interceptions ?? 0} interceptions, ${plural(c.assists, 'assist')}` },
  { key: 'attackingMid', title: 'Attacking midfielder of the season', how: 'The best season score among attacking and central midfielders.',
    eligible: c => c.position === 'CAM' || c.position === 'CM', value: c => c.score,
    headline: c => `${plural(c.goals, 'goal')}, ${plural(c.assists, 'assist')}, ${plural(c.chancesCreated ?? 0, 'chance')} created` },
  { key: 'winger', title: 'Winger of the season', how: 'The best season score among wingers and wide midfielders.',
    eligible: c => WINGERS.has(c.position), value: c => c.score,
    headline: c => `${plural(c.goals, 'goal')}, ${plural(c.assists, 'assist')}, ${plural(c.chancesCreated ?? 0, 'chance')} created` },
  { key: 'forward', title: 'Forward of the season', how: 'The best season score among strikers.',
    eligible: c => c.position === 'ST' || c.position === 'CF', value: c => c.score,
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
  /** `manager`: who to name for the manager award — your username for your
   *  club; other clubs' managers aren't in the data yet (P8-37). */
  winner: { clubId: string; clubName: string; isPlayerClub: boolean; headline: string; manager?: string }
  runnersUp: { clubName: string; headline: string }[]
}

// The manager award (P4-F, reworked for P8-37). It was "places beaten against
// the pundits, plus three for the title", which counted 16th to 10th as more
// than 10th to 5th. A place is worth more the higher up it is — the gap
// between 5th and 10th is Europe; between 10th and 16th, mid-table — so each
// finish is valued on a curve (`placeWorth`, 0 for last, 10 for first,
// quadratic), and the award is:
//   what they did over what was expected   placeWorth(final) − placeWorth(tipped)
// + where they actually finished           × FINISH_WEIGHT
// + the title                              + TITLE_BONUS
// + the players the side had               + STAR_WEIGHT per player in the team of the season
// so the gap is one ingredient, not the whole award. "Expected" is the
// pundits' pre-season place.
const TITLE_BONUS = 2
const FINISH_WEIGHT = 0.25
const STAR_WEIGHT = 0.5

export function placeWorth(position: number, clubs: number): number {
  const n = Math.max(2, clubs)
  const x = Math.max(0, (n - position) / (n - 1))
  return 10 * x * x
}

export function managerScore(c: ClubRow, clubs: number, stars = 0): number {
  return placeWorth(c.finalPosition, clubs) - placeWorth(c.predicted!, clubs)
    + placeWorth(c.finalPosition, clubs) * FINISH_WEIGHT
    + (c.finalPosition === 1 ? TITLE_BONUS : 0)
    + stars * STAR_WEIGHT
}

function clubAwards(stats: CompetitionStats, clubs: ClubRow[], playerClubId?: string, stars = new Map<string, number>(), you?: string): ClubAward[] {
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
    const n = Math.max(judged.length, ...judged.map(c => Math.max(c.finalPosition, c.predicted!)))
    const score = (c: ClubRow) => managerScore(c, n, stars.get(c.clubId) ?? 0)
    const ranked = [...judged].sort((a, b) => score(b) - score(a) || a.finalPosition - b.finalPosition || a.clubId.localeCompare(b.clubId))
    const line = (c: ClubRow) => {
      const s = stars.get(c.clubId) ?? 0
      return `Tipped ${c.predicted}, finished ${c.finalPosition}${s ? ` · ${plural(s, 'player')} in the team of the season` : ''}`
    }
    const top = ranked[0]
    out.push({
      key: 'manager', title: 'Manager of the season',
      how: 'Who did most with what they had: beating the pundits, with places near the top worth more than places lower down, plus where they finished, the title, and the players they got the best out of.',
      winner: {
        clubId: top.clubId, clubName: name(top.clubId) || top.clubName, isPlayerClub: top.clubId === playerClubId, headline: line(top),
        manager: top.clubId === playerClubId ? you : undefined,
      },
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
  /** 'tournament' for a cup, 'season' for a league (P8-78): the screens' headings read it. */
  word: 'season' | 'tournament'
  /** P8-116, the full path: qualifying's own player and team. */
  qualifying?: { player: PlayerAward | null; team: PickedTeam | null }
}

export type AwardsInput = {
  awards: SeasonAwards
  stats: CompetitionStats
  /** Every round's players and ratings (run-stats `rounds`). */
  rounds?: { label: string; lines: { playerId: string; name: string; position: string; rating: number; clubName: string; clubId?: string; isPlayerClub: boolean }[] }[]
  /** For the manager award; only competitions with a predicted table have one. */
  clubs?: ClubRow[]
  playerClubId?: string
  /** The run's mode: a cup's awards say "tournament", not "season" (P8-78). */
  mode?: string | null
  /** Your username: you are your club's manager (P8-37). */
  managerName?: string
}

export function buildAwardsNight(input: AwardsInput): AwardsNight {
  const candidates = [...input.awards.playerOfTheSeason].sort((a, b) => b.score - a.score || a.playerId.localeCompare(b.playerId))

  // P8-155: judged against his own position's field, not everyone's.
  const potsOrder = evenLines(candidates)
  const pots: PlayerAward | null = potsOrder.length
    ? { key: 'pots', title: 'Player of the season', how: 'The best season by the scoring model, judged against his own position: every number below, carried by how hard the club had it.',
        winner: potsOrder[0], runnersUp: potsOrder.slice(1, 4), headline: c => `Season score ${c.score}` }
    : null
  const u21s = [...input.awards.bestU21].sort((a, b) => b.score - a.score || a.playerId.localeCompare(b.playerId))
  const u21: PlayerAward | null = u21s.length
    ? { key: 'u21', title: 'Best under-21', how: 'The best season score by a player aged 21 or under.',
        winner: u21s[0], runnersUp: u21s.slice(1, 4), headline: c => `Season score ${c.score}${c.age != null ? `, aged ${c.age}` : ''}` }
    : null

  // Defender of the season ranks on defending evened out by position (P8-36).
  const even = evenDefenders(candidates)
  const players = PLAYER_AWARDS.map(d => decide(d, d.key === 'defender' ? even : candidates)).filter((a): a is PlayerAward => !!a)

  const teamsOfTheRound: RoundTeam[] = (input.rounds ?? []).map(r => {
    // One entry per player per round (a two-legged round never lists anyone twice).
    const best = new Map<string, Pick>()
    for (const l of r.lines) {
      const cur = best.get(l.playerId)
      if (!cur || l.rating > cur.score) best.set(l.playerId, { id: l.playerId, name: l.name, position: l.position, score: l.rating, rating: l.rating, clubName: l.clubName, clubId: l.clubId, isPlayerClub: l.isPlayerClub })
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

  // The team of the season, once: the manager award counts each club's players in it.
  // P8-170: the golden glove winner keeps goal. The two used to disagree in 46
  // of 60 seasons (verify-defender): the glove is clean sheets, which go to the
  // keeper behind the best defence, while a keeper's season score is carried
  // by saves, ratings and how hard his club had it, which favour the busy
  // keeper at a weak side. Both are fair; the night can't crown one keeper and
  // pick another, and the glove keeps its real meaning (most clean sheets).
  const glove = players.find(a => a.key === 'glove')
  const teamOfTheSeason = pickTeam(candidates.map(candidatePick), glove?.winner.playerId)

  // Every title, explanation and headline in the competition's own word.
  const w = (t: string) => forCompetition(t, input.mode)
  const player = (a: PlayerAward | null): PlayerAward | null => a && { ...a, title: w(a.title), how: w(a.how), headline: c => w(a.headline(c)) }
  return {
    playerOfTheSeason: player(pots),
    bestU21: player(u21),
    players: players.map(a => player(a)!),
    clubs: clubAwards(input.awards.teams ? { ...input.stats, teams: input.awards.teams } : input.stats, input.clubs ?? [], input.playerClubId, starsByClub(teamOfTheSeason, candidates), input.managerName)
      .map(a => ({ ...a, title: w(a.title), how: w(a.how) })),
    teamOfTheSeason,
    teamsOfTheRound,
    word: seasonWord(input.mode),
    qualifying: qualifyingAwards(input.awards.qualifying),
  }
}

// P8-116: a side out in qualifying can still have the best player of the
// rounds it played; measured on the same scoring model, over qualifying alone.
function qualifyingAwards(cands?: AwardCandidate[]): AwardsNight['qualifying'] {
  if (!cands?.length) return undefined
  const ranked = [...cands].sort((a, b) => b.score - a.score || a.playerId.localeCompare(b.playerId))
  return {
    player: {
      key: 'qualifying', title: 'Player of qualifying',
      how: 'The best qualifying rounds by the scoring model, counted over qualifying alone, so a side that went out early can still have the best player in it.',
      winner: ranked[0], runnersUp: ranked.slice(1, 4), headline: c => `Qualifying score ${c.score}`,
    },
    team: pickTeam(ranked.map(candidatePick)),
  }
}

/** How many of each club's players made the team of the season (P8-37). */
function starsByClub(team: PickedTeam | null, candidates: AwardCandidate[]): Map<string, number> {
  const out = new Map<string, number>()
  if (!team) return out
  const clubOf = new Map(candidates.map(c => [c.playerId, c.clubId]))
  for (const x of team.xi) {
    const club = clubOf.get(x.player.id)
    if (club) out.set(club, (out.get(club) ?? 0) + 1)
  }
  return out
}

// P8-36: a full-back's season can't out-defend a centre-back's in raw numbers
// (a CB makes more tackles, clearances and blocks per 90 in this engine, and in
// football), so a raw defender award only ever went to centre-backs. For the
// ranking, each full-back's defender score is scaled toward the centre-backs'
// by the ratio of the two groups' medians, raised to DEF_EVEN: 0 would be the
// raw numbers (CBs always win), 1 would judge each only against his own
// position (a coin flip between them). In between, a full-back wins when his
// season is exceptional for a full-back, which is what the maintainer asked
// for. Measured by scripts/verify-defender.ts. Only the ranking uses this; the
// score shown is the real one.
export const DEF_EVEN = 0.75   // ≈ three in four defender awards to centre-backs (verify-defender)
const REGULAR = 10   // matches rated: the medians are regulars', not bit-parts'

// P8-155: Player of the Season never went to a defender or a keeper: goals
// and assists weigh most in the season score, so a centre-back's great season
// lost to a forward's or a midfielder's ordinary one. Now it goes to whoever
// stood furthest above his own position's field: each line's regulars give a
// mean and a spread, and a player's standing is his score's distance above his
// line's mean, in its spreads. POTS_EVEN blends that with the raw score
// against everyone (0 raw, 1 purely against his line). Measured by
// scripts/verify-defender.ts over 60 whole seasons, winners by line (GK · DEF
// · MID · FWD): raw 0 · 0 · 31 · 29; 0.5 → 0 · 0 · 25 · 35; 0.8 → 0 · 1 · 19 ·
// 40; 1.0 → 3 · 8 · 15 · 34. Only 1.0 lets every line win, with attackers
// still ahead as they are in football. Only the ranking uses it; the score
// shown is the real one.
export const POTS_EVEN = 1

function evenLines(candidates: AwardCandidate[]): AwardCandidate[] {
  const regulars = candidates.filter(c => (c.matchesRated ?? 0) >= REGULAR && c.score > 0)
  // Each line's regulars: their mean and spread. A player's standing is how far
  // above his own line he is, in its spreads (a z-score).
  const stat = new Map<string, { mean: number; sd: number }>()
  for (const line of ['GK', 'DEF', 'MID', 'FWD']) {
    const xs = regulars.filter(c => lineOf(c.position) === line).map(c => c.score)
    const mean = xs.reduce((a, b) => a + b, 0) / Math.max(1, xs.length)
    const sd = Math.sqrt(xs.reduce((a, b) => a + (b - mean) ** 2, 0) / Math.max(1, xs.length))
    stat.set(line, { mean, sd })
  }
  const z = (c: AwardCandidate) => {
    const st = stat.get(lineOf(c.position))
    return st && st.sd > 0 ? (c.score - st.mean) / st.sd : 0
  }
  // The blend: POTS_EVEN of his standing in his line, the rest his raw score
  // against everyone's (both as z-scores, so they add up).
  const all = regulars.map(c => c.score)
  const mean = all.reduce((a, b) => a + b, 0) / Math.max(1, all.length)
  const sd = Math.sqrt(all.reduce((a, b) => a + (b - mean) ** 2, 0) / Math.max(1, all.length)) || 1
  const value = (c: AwardCandidate) => POTS_EVEN * z(c) + (1 - POTS_EVEN) * (c.score - mean) / sd
  return [...candidates].sort((a, b) => value(b) - value(a) || a.playerId.localeCompare(b.playerId))
}

function evenDefenders(candidates: AwardCandidate[]): AwardCandidate[] {
  const score = (c: AwardCandidate) => c.lineScores?.defender ?? 0
  const median = (xs: number[]) => {
    const s = [...xs].sort((a, b) => a - b)
    return s.length ? s[Math.floor(s.length / 2)] : 0
  }
  const regulars = candidates.filter(c => lineOf(c.position) === 'DEF' && (c.matchesRated ?? 0) >= REGULAR && score(c) > 0)
  const cb = median(regulars.filter(c => !FULL_BACKS.has(c.position)).map(score))
  const fb = median(regulars.filter(c => FULL_BACKS.has(c.position)).map(score))
  if (!cb || !fb) return candidates
  const lift = Math.pow(cb / fb, DEF_EVEN)
  return candidates.map(c => FULL_BACKS.has(c.position) && c.lineScores
    ? { ...c, lineScores: { ...c.lineScores, defender: score(c) * lift } }
    : c)
}
