/**
 * P8-52: one European season through all three competitions (docs/europe/05).
 *
 * The full path used to be the Champions League alone: finish outside its
 * places and the run was over, lose in its qualifying and you vanished. Now the
 * domestic season (and the cup) decide your competition and round, and the
 * three qualifying ladders run in order, each fed the losers of the one above,
 * as in reality: a small country's champion who loses in Champions League Q1
 * drops into the Conference League's Q2 and can still reach its league phase.
 *
 *   1. The cups. Every association's cup is played (domestic-cup.ts), so every
 *      cup place in the access lists has a winner.
 *   2. The field. The Champions League's entrants as before (cl-access.ts);
 *      then the Europa and Conference Leagues' rules, one club one
 *      competition: a club already in takes nothing more, and the place passes
 *      down its league's table (a cup winner already qualified passes his down
 *      too). The Conference League's holders go up into the Europa League.
 *   3. The ladders. Round by round (Q1, Q2, Q3, the play-off), the Champions
 *      League first, then the Europa League, then the Conference League, so
 *      that each round's losers are in hand before the round they drop into.
 *
 * Pure apart from the match engine's randomness (simulateTwoLegs), like
 * cl-qualifying.ts, whose round player it uses.
 */
import {
  UEL_ACCESS, UECL_ACCESS, UEFA_ASSOCIATIONS,
  type EuroComp, type EuroAccessRule, type UclRound, type UclPath,
} from '@/data/uefa-coefficients'
import type { AssociationEntry, AssociationClub, CLAccessList, EntrantClub } from './cl-access'
import { toTeam, playRound, type QualTie, type QualTeam, type QualifyingResult } from './cl-qualifying'
import { planCup, playCupAfter } from './domestic-cup'
import { deriveSeed } from '@/lib/rng'
import type { SimTeam } from '@/types/simulation'

export type CupWinner = { rank: number; name: string; country?: string; clubId: string; clubName: string }
export type EuroEntrant = EntrantClub & { comp: EuroComp; viaCup: boolean }
export type EuropeExtras = {
  /** The competition your European season went on in, or ended in; null if you never qualified. */
  competition: EuroComp | null
  /** Where you first came in. */
  entry: { comp: EuroComp; round: UclRound; path: UclPath; viaCup: boolean } | null
  /** Each competition's league phase. */
  fields: Record<EuroComp, QualTeam[]>
  /** Every association's cup winner, for the ceremony. */
  cups: CupWinner[]
  /** The three holders, and where each one plays. */
  holders: { comp: EuroComp; clubId: string; clubName: string; playsIn: EuroComp | null }[]
}

const COMPS: EuroComp[] = ['ucl', 'uel', 'uecl']
const ROUNDS: UclRound[] = ['q1', 'q2', 'q3', 'playoff']
const PATHS: UclPath[] = ['champions', 'league']
type Key = string   // `${comp}:${round}:${path}`
const key = (c: EuroComp, r: UclRound, p: UclPath): Key => `${c}:${r}:${p}`
type To = Key | `lp:${EuroComp}` | null

// Where a round's winners go next. The Europa League's two third-round paths
// meet in one play-off; the Champions and Conference Leagues keep theirs.
const WIN: Record<Key, To> = {
  'ucl:q1:champions': 'ucl:q2:champions', 'ucl:q2:champions': 'ucl:q3:champions', 'ucl:q2:league': 'ucl:q3:league',
  'ucl:q3:champions': 'ucl:playoff:champions', 'ucl:q3:league': 'ucl:playoff:league',
  'ucl:playoff:champions': 'lp:ucl', 'ucl:playoff:league': 'lp:ucl',
  'uel:q1:league': 'uel:q2:league', 'uel:q2:league': 'uel:q3:league',
  'uel:q3:champions': 'uel:playoff:league', 'uel:q3:league': 'uel:playoff:league', 'uel:playoff:league': 'lp:uel',
  'uecl:q1:league': 'uecl:q2:league', 'uecl:q2:champions': 'uecl:q3:champions', 'uecl:q2:league': 'uecl:q3:league',
  'uecl:q3:champions': 'uecl:playoff:champions', 'uecl:q3:league': 'uecl:playoff:league',
  'uecl:playoff:champions': 'lp:uecl', 'uecl:playoff:league': 'lp:uecl',
}
// Where a round's losers drop (docs/europe/02 §2–3, the "Drops" columns). A
// champion keeps to a champions path where the competition below has one.
// Losing in the Conference League is the end.
const DROP: Record<Key, To> = {
  'ucl:q1:champions': 'uecl:q2:champions',
  'ucl:q2:champions': 'uel:q3:champions', 'ucl:q2:league': 'uel:q3:league',
  'ucl:q3:champions': 'uel:playoff:league', 'ucl:q3:league': 'lp:uel',
  'ucl:playoff:champions': 'lp:uel', 'ucl:playoff:league': 'lp:uel',
  'uel:q1:league': 'uecl:q2:league', 'uel:q2:league': 'uecl:q3:league',
  'uel:q3:champions': 'uecl:playoff:champions', 'uel:q3:league': 'uecl:playoff:league',
  'uel:playoff:league': 'lp:uecl',
}

/**
 * Every association's cup, played out whole. The clubs play at their rating;
 * yours at your team's (it's in the association's table with it), with the
 * difficulty's tilt, as every one of your matches has.
 */
export function playEveryCup(assocs: AssociationEntry[], playerClubId: string | null, seed: number): CupWinner[] {
  const out: CupWinner[] = []
  for (const a of assocs) {
    const teams: SimTeam[] = a.clubs.map(c => ({
      clubId: c.clubId, clubName: c.clubName, ovr: c.ovr, isPlayer: c.clubId === playerClubId,
      form: 0, stats: { played: 0, won: 0, drawn: 0, lost: 0, goalsFor: 0, goalsAgainst: 0, points: 0 },
    }))
    // The rounds' matchdays don't matter here (nothing else is played beside
    // them), so the cup is planned over a nominal season and played through.
    const SEASON = 30
    let cup = planCup(teams, SEASON, deriveSeed(seed, a.rank), null)
    if (!cup) continue
    for (let md = 1; md <= SEASON; md++) cup = playCupAfter(cup, md, teams)
    if (cup.winner) out.push({ rank: a.rank, name: a.name, country: a.country, clubId: cup.winner.clubId, clubName: cup.winner.clubName })
  }
  return out
}

const LEAGUE_PHASE_SIZE = 36
const DEPTH: Record<UclRound, number> = { league_phase: 0, playoff: 1, q3: 2, q2: 3, q1: 4 }

/**
 * The Europa and Conference Leagues' entrants, after the Champions League has
 * taken its own. One club, one competition; a place whose club is already in
 * passes down that league's table (The Dugout's `pickClub`, docs/europe/04 §2).
 */
export function europaAndConferenceEntrants(
  ucl: CLAccessList, assocs: AssociationEntry[], cups: CupWinner[], ueclHolder: AssociationClub | null,
): EuroEntrant[] {
  const byRank = new Map(assocs.map(a => [a.rank, a]))
  const cupOf = new Map(cups.map(c => [c.rank, c.clubId]))
  const taken = new Set([...ucl.leaguePhaseDirect, ...ucl.qualifying].map(e => e.clubId))
  const out: EuroEntrant[] = []

  // The Conference League's holders go up into the Europa League's league
  // phase, unless they're already in through their league.
  if (ueclHolder && !taken.has(ueclHolder.clubId)) {
    taken.add(ueclHolder.clubId)
    out.push({
      clubId: ueclHolder.clubId, clubName: ueclHolder.clubName, ovr: ueclHolder.ovr,
      associationRank: 0, associationName: 'Title holder', position: 0,
      entryRound: 'league_phase', entryPath: 'none', comp: 'uel', viaCup: false,
    })
  }

  // The Europa League before the Conference League, and within each the deepest
  // entry first, so a club that earned two places takes the better one.
  const rules = [...UEL_ACCESS, ...UECL_ACCESS].sort((a, b) =>
    COMPS.indexOf(a.comp) - COMPS.indexOf(b.comp) || DEPTH[a.round] - DEPTH[b.round])
  for (const rule of rules) {
    for (const rank of rule.ranks) {
      const assoc = UEFA_ASSOCIATIONS[rank - 1]
      const entry = byRank.get(rank)
      if (!assoc || !assoc.active || !entry) continue
      const picked = pick(entry, rule, cupOf.get(rank), taken)
      if (!picked) continue
      taken.add(picked.club.clubId)
      out.push({
        clubId: picked.club.clubId, clubName: picked.club.clubName, ovr: picked.club.ovr,
        associationRank: rank, associationName: entry.name, associationCountry: entry.country,
        position: picked.position, entryRound: rule.round, entryPath: rule.path, comp: rule.comp, viaCup: picked.viaCup,
      })
    }
  }
  // Holders already in through their league leave their place empty, and UEFA
  // fills it by moving the best-ranked entrant of the round below up one (the
  // access list's own "rebalancing"): here, the first Europa League play-off
  // entrant into the league phase. Without it the league phase had 35.
  if (ueclHolder && !out.some(e => e.clubId === ueclHolder.clubId)) {
    const up = out.find(e => e.comp === 'uel' && e.entryRound === 'playoff')
    if (up) { up.entryRound = 'league_phase'; up.entryPath = 'none' }
  }
  return out
}

function pick(entry: AssociationEntry, rule: EuroAccessRule, cupWinner: string | undefined, taken: Set<string>):
  { club: AssociationClub; position: number; viaCup: boolean } | null {
  if (rule.cupWinner) {
    const club = cupWinner ? entry.clubs.find(c => c.clubId === cupWinner) : undefined
    if (club && !taken.has(club.clubId)) return { club, position: 0, viaCup: true }
    // Already in on merit (or no cup was played): the best-placed club with
    // nothing yet takes it, and it stops being a cup place when it does.
    const at = entry.clubs.findIndex(c => !taken.has(c.clubId))
    return at < 0 ? null : { club: entry.clubs[at], position: at + 1, viaCup: false }
  }
  // A position whose club is already in looks one place further down.
  for (let i = rule.position - 1; i < entry.clubs.length; i++) {
    if (!taken.has(entry.clubs[i].clubId)) return { club: entry.clubs[i], position: i + 1, viaCup: false }
  }
  return null
}

/**
 * The whole summer: three ladders, with the drops. Returns the qualifying
 * result the full path's screens already read (its `leaguePhaseField` is the
 * field of the competition you're in), with the three competitions beside it.
 */
export function simulateEurope(
  ucl: CLAccessList, euro: EuroEntrant[], cups: CupWinner[],
  holders: Omit<EuropeExtras['holders'][number], 'playsIn'>[], playerClubId?: string,
): QualifyingResult {
  const isPlayer = (id: string) => id === playerClubId
  const pool = new Map<Key, QualTeam[]>()
  const push = (k: Key, teams: QualTeam[]) => pool.set(k, [...(pool.get(k) ?? []), ...teams])
  const fields: Record<EuroComp, QualTeam[]> = { ucl: [], uel: [], uecl: [] }
  const viaQualifying: Record<EuroComp, QualTeam[]> = { ucl: [], uel: [], uecl: [] }
  const playoffLosers: Record<EuroComp, QualTeam[]> = { ucl: [], uel: [], uecl: [] }
  const send = (to: To, teams: QualTeam[], fromQualifying: boolean) => {
    if (!to || teams.length === 0) return
    if (to.startsWith('lp:')) {
      const c = to.slice(3) as EuroComp
      fields[c].push(...teams)
      if (fromQualifying) viaQualifying[c].push(...teams)
    } else push(to, teams)
  }

  for (const e of ucl.leaguePhaseDirect) fields.ucl.push(toTeam(e, isPlayer(e.clubId)))
  for (const e of ucl.qualifying) push(key('ucl', e.entryRound, e.entryPath), [toTeam(e, isPlayer(e.clubId))])
  for (const e of euro) {
    const t = toTeam(e, isPlayer(e.clubId))
    if (e.entryRound === 'league_phase') fields[e.comp].push(t)
    else push(key(e.comp, e.entryRound, e.entryPath), [t])
  }

  const ties: QualTie[] = []
  for (const round of ROUNDS) for (const comp of COMPS) for (const path of PATHS) {
    const k = key(comp, round, path)
    const field = pool.get(k)
    if (!field?.length) continue
    const played = playRound(round, path, field)
    for (const t of played.ties) t.comp = comp
    ties.push(...played.ties)
    const losers = played.ties.filter(t => t.teamB).map(t => (t.winnerId === t.teamA.clubId ? t.teamB! : t.teamA))
    if (round === 'playoff') playoffLosers[comp].push(...losers)
    const onward = WIN[k] ?? null
    send(onward, played.winners, onward?.startsWith('lp:') ?? false)
    send(DROP[k] ?? null, losers, false)
  }

  // A bye in an odd round sends one club too many up and one loser too few
  // down, so a league phase can come out a place short. That place goes to the
  // best-rated loser of the competition's own play-off (taken back from the
  // league phase below, if he'd dropped into it), and the one below, now a
  // place short itself, does the same in its turn.
  for (const c of COMPS) {
    while (fields[c].length < LEAGUE_PHASE_SIZE) {
      const best = playoffLosers[c].filter(t => !fields[c].includes(t)).sort((a, b) => b.ovr - a.ovr)[0]
      if (!best) break
      for (const lower of COMPS) { const i = fields[lower].indexOf(best); if (i >= 0) fields[lower].splice(i, 1) }
      fields[c].push(best)
      viaQualifying[c].push(best)
    }
  }

  // Your season: where you came in, and where it went on (or ended).
  const entryOf = (): EuropeExtras['entry'] => {
    const u = [...ucl.leaguePhaseDirect, ...ucl.qualifying].find(e => isPlayer(e.clubId))
    if (u) return { comp: 'ucl', round: u.entryRound, path: u.entryPath, viaCup: false }
    const e = euro.find(x => isPlayer(x.clubId))
    return e ? { comp: e.comp, round: e.entryRound, path: e.entryPath, viaCup: e.viaCup } : null
  }
  const mine = ties.filter(t => isPlayer(t.teamA.clubId) || (t.teamB && isPlayer(t.teamB.clubId)))
  const inField = COMPS.find(c => fields[c].some(t => t.isPlayer)) ?? null
  const competition = inField ?? (mine.length ? mine[mine.length - 1].comp ?? 'uecl' : null)
  const shown = competition ?? 'ucl'
  const playsIn = (id: string) => COMPS.find(c => fields[c].some(t => t.clubId === id)) ?? null

  return {
    ties,
    qualifiers: viaQualifying[shown],
    leaguePhaseField: fields[shown],
    playerPath: mine.map(t => ({ comp: t.comp, round: t.round, path: t.path, advanced: t.winnerId === playerClubId, eliminated: t.winnerId !== playerClubId })),
    europe: {
      competition, entry: entryOf(), fields, cups,
      holders: holders.map(h => ({ ...h, playsIn: playsIn(h.clubId) })),
    },
  }
}

/**
 * The qualifying ties a run's stats and awards count: the competition your
 * season was in, and your own ties wherever they were. Three ladders are some
 * two hundred and fifty ties; regenerating every sheet for the awards would
 * cost the result screen seconds for rounds you never saw.
 */
export function runQualTies(q: QualifyingResult | null | undefined, playerClubId?: string | null): QualTie[] {
  if (!q) return []
  const comp = q.europe?.competition ?? 'ucl'
  return q.ties.filter(t => (t.comp ?? 'ucl') === comp || t.teamA.clubId === playerClubId || t.teamB?.clubId === playerClubId)
}

/**
 * A full-path result's tier: the knockout names, prefixed with the competition
 * when it wasn't the Champions League ("uel_qf_exit"), as the score ladder and
 * the tier registry spell them (score.ts, tiers.ts).
 */
export function fullPathTier(r: { playerFinalRound: string; competition?: EuroComp }): string {
  return r.competition && r.competition !== 'ucl' && r.playerFinalRound !== 'not_qualified'
    ? `${r.competition}_${r.playerFinalRound}` : r.playerFinalRound
}
