// P8-173: the league's cup, played beside the league (docs/europe/04 §4).
//
// A season in this game is a whole real season, so it carries the league's
// cup: the FA Cup, the Copa del Rey and the rest. The game has each league's
// top flight only, so the cup is the top flight's clubs — a bracket of sixteen,
// with a first round for the clubs rated lowest when there are more than
// sixteen. That's said on screen rather than pretended otherwise.
//
// Rounds fall between matchdays: the first a sixth of the way in, the rest
// spread after it, the final after the last matchday. Each round is drawn when
// it's played (an open draw, as the real cups are), from the run's seed, and
// every tie is one match with extra time and penalties (simulateKnockout).
// The cup is an honour, not points: the run's score still comes from the league.
import { simulateKnockout, simulateTwoLegs, type LegScore } from './knockout-match'
import { attributeFixtureScorers } from './play-fixture'
import type { MatchScorers, RosterPlayer } from '@/types/stats'
import { mulberry32, deriveSeed } from '@/lib/rng'
import type { SimTeam } from '@/types/simulation'

export type CupSide = { clubId: string; clubName: string; isPlayer: boolean }
export type CupTie = {
  home: CupSide; away: CupSide
  homeGoals: number; awayGoals: number
  extraTime: boolean
  homePens: number | null; awayPens: number | null
  winner: 'home' | 'away'
  /** A two-legged tie (P8.5-20: some cups' semi-finals). `home` hosts the
   *  first leg; homeGoals/awayGoals are then the aggregate, extra time included. */
  legs?: { leg1: LegScore; leg2: LegScore }
  /** P8.5-37: the match's seed (each leg's, for two legs), from the cup's own
   *  seed, so its sheet is the same every time it's opened. */
  seed?: number
  legSeeds?: [number, number]
  /** Attributed once, by a screen that has the squads (attributeCupScorers). */
  scorers?: MatchScorers
  legScorers?: [MatchScorers, MatchScorers]
}
export type CupRoundKey = 'r1' | 'r16' | 'qf' | 'sf' | 'final'
export type CupRound = {
  key: CupRoundKey
  label: string
  /** Played straight after this league matchday. */
  afterMatchday: number
  /** The clubs that skip it (only the first round has any). */
  byes: CupSide[]
  ties: CupTie[]
  played: boolean
}
export type DomesticCup = { name: string; seed: number; rounds: CupRound[]; winner: CupSide | null; twoLeggedSemis?: boolean }
/** How far a club got: the round it went out in, or 'winner'. */
export type CupReach = CupRoundKey | 'winner'

const LABEL: Record<CupRoundKey, string> = { r1: 'First round', r16: 'Last sixteen', qf: 'Quarter-final', sf: 'Semi-final', final: 'Final' }
// The cups' names are one table for every association (P8.5-20): src/data/national-cups.ts.

const sideOf = (t: { clubId: string; clubName: string; isPlayer: boolean }): CupSide => ({ clubId: t.clubId, clubName: t.clubName, isPlayer: !!t.isPlayer })

function shuffled<T>(rng: () => number, xs: T[]): T[] {
  const a = [...xs]
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [a[i], a[j]] = [a[j], a[i]] }
  return a
}

/** The cup's shape for this league: who plays the first round, and when each round falls. */
export function planCup(teams: { clubId: string; clubName: string; isPlayer: boolean; ovr: number }[], totalMatchdays: number, seed: number, name: string, twoLeggedSemis = false): DomesticCup | null {
  const n = teams.length
  if (n < 4) return null
  // Sixteen where the league has them; a small league plays for eight (or four).
  const size = n >= 16 ? 16 : n >= 8 ? 8 : 4
  const extra = n - size
  // The first round is the clubs rated lowest, two for each place too many:
  // the big clubs join later, as they do in the real cups.
  const ranked = [...teams].sort((a, b) => b.ovr - a.ovr || a.clubId.localeCompare(b.clubId)).map(sideOf)
  const keys: CupRoundKey[] = [...(extra > 0 ? ['r1' as const] : []), ...(size === 16 ? ['r16' as const] : []), ...(size >= 8 ? ['qf' as const] : []), 'sf', 'final']
  const before = keys.length - 1
  const rounds: CupRound[] = keys.map((key, i) => ({
    key, label: LABEL[key],
    // The rounds before the final spread from a sixth of the way in to about
    // two-thirds, the final after the last matchday.
    afterMatchday: key === 'final' ? totalMatchdays : Math.max(1, Math.round(totalMatchdays * (i + 1) / (before + 2))),
    byes: key === 'r1' ? ranked.slice(0, n - 2 * extra) : [],
    ties: [], played: false,
  }))
  return { name, seed, rounds, winner: null, ...(twoLeggedSemis ? { twoLeggedSemis } : {}) }
}

function winnersOf(r: CupRound): CupSide[] {
  return r.ties.map(t => (t.winner === 'home' ? t.home : t.away))
}

/** Who's in round `i`: everyone, or the first round's players; later, the last round's winners and anyone who had a bye. */
function entrantsOf(cup: DomesticCup, i: number, all: CupSide[]): CupSide[] {
  if (i === 0) {
    const byes = new Set(cup.rounds[0].byes.map(b => b.clubId))
    return all.filter(s => !byes.has(s.clubId))
  }
  return [...winnersOf(cup.rounds[i - 1]), ...cup.rounds[i - 1].byes]
}

/**
 * Plays every round due after matchday `md`, with the clubs as they stand
 * (their form, and your team's rating). Returns a new cup, so React sees the
 * change; the old one is left as it was.
 */
export function playCupAfter(cup: DomesticCup, md: number, teams: SimTeam[]): DomesticCup {
  if (!cup.rounds.some(r => !r.played && r.afterMatchday === md)) return cup
  const byId = new Map(teams.map(t => [t.clubId, t]))
  const all = teams.map(sideOf)
  const next: DomesticCup = { ...cup, rounds: cup.rounds.map(r => ({ ...r })) }
  next.rounds.forEach((r, i) => {
    if (r.played || r.afterMatchday !== md) return
    // An open draw each round, from the run's seed: the same run draws the same way.
    const rng = mulberry32(deriveSeed(cup.seed, 0xc0f + i))
    const inRound = shuffled(rng, entrantsOf(next, i, all))
    const ties: CupTie[] = []
    for (let k = 0; k + 1 < inRound.length; k += 2) {
      const home = inRound[k], away = inRound[k + 1]
      const h = byId.get(home.clubId), a = byId.get(away.clubId)
      if (!h || !a) continue
      const seed = deriveSeed(cup.seed, 0x5eed + i * 64 + k)
      if (r.key === 'sf' && cup.twoLeggedSemis) {
        const two = simulateTwoLegs(h, a)
        ties.push({
          home, away, homeGoals: two.totalA, awayGoals: two.totalB, extraTime: two.extraTime,
          homePens: two.homePens, awayPens: two.awayPens, winner: two.winner,
          legs: { leg1: two.leg1, leg2: two.leg2 }, legSeeds: [seed, deriveSeed(seed, 2)],
        })
        continue
      }
      const res = simulateKnockout(h, a)
      ties.push({
        home, away, homeGoals: res.homeGoals, awayGoals: res.awayGoals, extraTime: res.extraTime,
        homePens: res.homePens, awayPens: res.awayPens, winner: res.winner, seed,
      })
    }
    r.ties = ties
    r.played = true
    if (r.key === 'final' && ties[0]) next.winner = ties[0].winner === 'home' ? ties[0].home : ties[0].away
  })
  return next
}

/** How far a club got, from the rounds played so far (null before it has played). */
export function cupReachOf(cup: DomesticCup | null | undefined, clubId: string): CupReach | null {
  if (!cup) return null
  if (cup.winner?.clubId === clubId) return 'winner'
  let reach: CupReach | null = null
  for (const r of cup.rounds) {
    if (!r.played) break
    const tie = r.ties.find(t => t.home.clubId === clubId || t.away.clubId === clubId)
    if (!tie) continue
    reach = r.key
    const won = (tie.winner === 'home' ? tie.home : tie.away).clubId === clubId
    if (!won) return r.key
  }
  return reach
}

/** "a.e.t." or "4–3 on penalties", for a tie's line. */
export function tieNote(t: CupTie): string | null {
  const end = t.homePens != null && t.awayPens != null ? `${t.homePens}–${t.awayPens} on penalties`
    : t.extraTime ? 'after extra time' : null
  if (!t.legs) return end
  // Both legs from the first leg's home side, so they read with the aggregate.
  const legs = `on aggregate · legs ${t.legs.leg1.homeGoals}–${t.legs.leg1.awayGoals}, ${t.legs.leg2.awayGoals}–${t.legs.leg2.homeGoals}`
  return end ? `${legs} · ${end}` : legs
}

/** What reaching a round is called, for the result screen and the run list. */
export function reachLabel(reach: CupReach, cupName: string): string {
  if (reach === 'winner') return `${cupName} winners`
  if (reach === 'final') return `${cupName} finalists`
  return `Out in the ${LABEL[reach].toLowerCase()}`
}

/**
 * P8.5-37: every played tie that hasn't got its scorers yet gets them, once,
 * from the squads (as a league fixture's are), so its match sheet names the
 * same scorers every time. The second leg of a two-legged tie is hosted by the
 * first leg's away side, and carries the extra time if there was any.
 * Returns a new cup; a tie already attributed is left as it was.
 */
export function attributeCupScorers(cup: DomesticCup, poolByClub: Map<string, RosterPlayer[]> | null | undefined,
  lineupCtx?: { playerClubId?: string; benchSize?: number }): DomesticCup {
  if (!poolByClub || poolByClub.size === 0) return cup
  let changed = false
  const rounds = cup.rounds.map(r => {
    if (!r.played || r.ties.every(t => t.scorers || t.legScorers)) return r
    changed = true
    return { ...r, ties: r.ties.map(t => {
      if (t.scorers || t.legScorers) return t
      if (t.legs && t.legSeeds) {
        const l1 = t.legs.leg1
        const hostGoals = t.awayGoals - l1.awayGoals, visitorGoals = t.homeGoals - l1.homeGoals
        return { ...t, legScorers: [
          attributeFixtureScorers(poolByClub, t.home.clubId, t.away.clubId, l1.homeGoals, l1.awayGoals, false, false, t.legSeeds[0], lineupCtx),
          attributeFixtureScorers(poolByClub, t.away.clubId, t.home.clubId, hostGoals, visitorGoals, t.extraTime, false, t.legSeeds[1], lineupCtx),
        ] as [MatchScorers, MatchScorers] }
      }
      return { ...t, scorers: attributeFixtureScorers(poolByClub, t.home.clubId, t.away.clubId, t.homeGoals, t.awayGoals, t.extraTime, false, t.seed, lineupCtx) }
    }) }
  })
  return changed ? { ...cup, rounds } : cup
}
