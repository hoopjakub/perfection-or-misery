// "Context at the moment of the match" — the data behind §10's third section
// (Big Fixes R6/R7): what the table looked like when this game was played, and
// how each side had been going into it.
//
// Deliberately mode-agnostic. Domestic leagues, the UCL league phase and World
// Cup groups all carry their own fixture types, so this takes the smallest
// common shape — who played whom, what the score was, on which matchday — and
// derives everything from that. Per the spec's implementation pointer, deriving
// from stored fixtures is the fallback for when per-matchday snapshots aren't
// retained; it's fully deterministic, so a screen that HAS snapshots and one
// that derives them here will agree.

import type { PlayerMatchLine } from '@/types/match-stats'
import type { MatchScorers } from '@/types/stats'

/**
 * One match in a competition, reduced to what the context section needs:
 * standings, form, what's next, and enough to open its own stat sheet.
 *
 * `matchday` is an ORDERING key across the whole competition, not just a league
 * round — knockout rounds continue the sequence after the league phase so that
 * "form going in" and "next match" work in a cup too (a knockout tie is still
 * five games you've played). `inTable: false` keeps those games out of the
 * standings while leaving them in form.
 */
export type ContextMatch = {
  matchday:      number
  label?:        string          // "Matchday 7" · "Semi-final · Leg 2"
  inTable?:      boolean         // counts toward the table (default true)
  homeClubId:    string
  homeClubName:  string
  awayClubId:    string
  awayClubName:  string
  // Undefined = not played yet (the "next match" fixture).
  homeGoals?:    number
  awayGoals?:    number
  // Carried so any match shown on the screen can be tapped through to its own
  // full stats — form results and the next fixture included.
  scorers?:      MatchScorers
  seed?:         number
  extraTime?:    boolean
  homeRotation?: number
  awayRotation?: number
  // §10.5 phase 4 — injured/suspended players in this match, plus the stand-ins
  // that covered your side. Travel with the match for the same reason rotation
  // does: without them the sheet fields somebody who wasn't available.
  absent?:   string[]
  standIns?: import('@/types/stats').RosterPlayer[]
  // Who went through. Only meaningful on knockout legs, and only the TIE's
  // winner — the aggregate alone can't answer it once penalties are involved
  // (a 3-3 that went to a shootout leaves no trace in the goals), and the
  // bracket has to be able to say who advanced.
  tieWinnerClubId?: string
}

const isPlayed = (m: ContextMatch): m is ContextMatch & { homeGoals: number; awayGoals: number } =>
  m.homeGoals !== undefined && m.awayGoals !== undefined

export type ContextRow = {
  clubId:       string
  clubName:     string
  played:       number
  won:          number
  drawn:        number
  lost:         number
  goalsFor:     number
  goalsAgainst: number
  goalDiff:     number
  points:       number
}

export type FormResult = {
  matchday:     number
  label?:       string
  opponentName: string
  isHome:       boolean
  goalsFor:     number
  goalsAgainst: number
  outcome:      'W' | 'D' | 'L'
  match:        ContextMatch   // kept so the row can open its own stat sheet
}

/**
 * The table exactly as it stood after `upToMatchday` — not the final table.
 * Pass the matchday the match being viewed was played on to answer "where did
 * these two sit when they met?".
 */
export function standingsAsOf(matches: ContextMatch[], upToMatchday: number): ContextRow[] {
  const rows = new Map<string, ContextRow>()
  const rowFor = (clubId: string, clubName: string): ContextRow => {
    let r = rows.get(clubId)
    if (!r) {
      r = {
        clubId, clubName, played: 0, won: 0, drawn: 0, lost: 0,
        goalsFor: 0, goalsAgainst: 0, goalDiff: 0, points: 0,
      }
      rows.set(clubId, r)
    }
    return r
  }

  for (const m of matches) {
    // Knockout games are still real games (they show up in form), but they
    // never belong in a league table.
    if (m.matchday > upToMatchday || m.inTable === false || !isPlayed(m)) continue
    const h = rowFor(m.homeClubId, m.homeClubName)
    const a = rowFor(m.awayClubId, m.awayClubName)
    h.played++; a.played++
    h.goalsFor += m.homeGoals; h.goalsAgainst += m.awayGoals
    a.goalsFor += m.awayGoals; a.goalsAgainst += m.homeGoals
    if (m.homeGoals > m.awayGoals)      { h.won++;  h.points += 3; a.lost++ }
    else if (m.homeGoals < m.awayGoals) { a.won++;  a.points += 3; h.lost++ }
    else                                { h.drawn++; a.drawn++; h.points++; a.points++ }
  }

  for (const r of rows.values()) r.goalDiff = r.goalsFor - r.goalsAgainst

  // Same ordering the live standings use (points → GD → goals scored), so the
  // snapshot can't disagree with the table the player watched all season.
  return [...rows.values()].sort((a, b) =>
    b.points - a.points || b.goalDiff - a.goalDiff || b.goalsFor - a.goalsFor
    || (a.clubName < b.clubName ? -1 : 1))
}

/**
 * A club's last `limit` results BEFORE the given matchday — most recent first,
 * which is how form is read. Strictly before, so the match you're looking at is
 * never part of the form that led into it.
 */
export function formBefore(
  matches: ContextMatch[], clubId: string, beforeMatchday: number, limit = 5,
): FormResult[] {
  return matches
    .filter(m => m.matchday < beforeMatchday && isPlayed(m) && (m.homeClubId === clubId || m.awayClubId === clubId))
    .sort((a, b) => b.matchday - a.matchday)
    .slice(0, limit)
    .map(m => {
      const isHome = m.homeClubId === clubId
      const goalsFor     = (isHome ? m.homeGoals : m.awayGoals) as number
      const goalsAgainst = (isHome ? m.awayGoals : m.homeGoals) as number
      return {
        matchday: m.matchday, label: m.label,
        opponentName: isHome ? m.awayClubName : m.homeClubName,
        isHome, goalsFor, goalsAgainst,
        outcome: goalsFor > goalsAgainst ? 'W' as const : goalsFor < goalsAgainst ? 'L' as const : 'D' as const,
        match: m,
      }
    })
}

/**
 * What this club plays NEXT — the first fixture after the match being viewed.
 * Competition-agnostic by construction: because knockout rounds continue the
 * `matchday` sequence, this naturally returns the second leg after a first leg,
 * the next round's opener after a tie is settled, and `null` once a side is
 * out (no later fixture exists for them), which is the "eliminated" case.
 */
export function nextMatchFor(
  matches: ContextMatch[], clubId: string, afterMatchday: number,
): ContextMatch | null {
  return matches
    .filter(m => m.matchday > afterMatchday && (m.homeClubId === clubId || m.awayClubId === clubId))
    .sort((a, b) => a.matchday - b.matchday)[0] ?? null
}

/**
 * Build one continuous timeline for a UCL-shaped run: the league phase's
 * matchdays, then every knockout leg continuing the same sequence.
 *
 * That continuity is the whole trick — because a semi-final second leg simply
 * has a higher `matchday` than the first, `formBefore` and `nextMatchFor` work
 * unchanged in the cup: form still counts the last five games you actually
 * played (league phase included), "next match" resolves to the second leg and
 * then to the next round's opener, and a knocked-out side has no later fixture
 * at all — which is exactly how elimination should read.
 *
 * Knockout legs are flagged `inTable: false` so they never pollute standings.
 */
export function clCompetitionMatches(
  leaguePhase: import('./cl-sim').CLLeagueMatch[],
  rounds: { label: string; ties: import('./cl-sim').CLKnockoutMatch[] }[],
): ContextMatch[] {
  return appendKnockoutRounds(leaguePhase.map(m => ({
    matchday: m.matchday, label: `Matchday ${m.matchday}`,
    homeClubId: m.home.clubId, homeClubName: m.home.clubName,
    awayClubId: m.away.clubId, awayClubName: m.away.clubName,
    homeGoals: m.homeGoals, awayGoals: m.awayGoals,
    scorers: m.scorers, seed: m.seed,
    homeRotation: m.homeRotation, awayRotation: m.awayRotation,
    absent: m.absent, standIns: m.standIns,
  })), rounds)
}

/**
 * The knockout half of `clCompetitionMatches`, split out so any competition can
 * use it — the World Cup's groups and a live half-finished league phase are the
 * same shape once reduced to `ContextMatch[]`, and both need their bracket
 * hanging off the end of the same matchday sequence.
 *
 * `phase` is the league/group portion (already converted); rounds are appended
 * in the order given, each continuing the sequence. Pass only the rounds that
 * have actually been revealed — a round that hasn't happened yet must not be in
 * the timeline, or "next match" would announce a fixture the player hasn't seen.
 */
export function appendKnockoutRounds(
  phase: ContextMatch[],
  rounds: { label: string; ties: import('./cl-sim').CLKnockoutMatch[] }[],
): ContextMatch[] {
  const out: ContextMatch[] = [...phase]

  let seq = out.reduce((mx, m) => Math.max(mx, m.matchday), 0)
  for (const { label, ties } of rounds) {
    if (ties.length === 0) continue
    const twoLegged = ties.some(t => t.leg1)
    // Leg 1 of every tie in the round, then leg 2 of every tie — matching the
    // order they're actually played in.
    for (let leg = 1; leg <= (twoLegged ? 2 : 1); leg++) {
      seq++
      for (const t of ties) {
        if (leg === 1 && !t.leg1) {
          // Single match (a final).
          out.push({
            matchday: seq, label, inTable: false,
            homeClubId: t.teamA.clubId, homeClubName: t.teamA.clubName,
            awayClubId: t.teamB.clubId, awayClubName: t.teamB.clubName,
            homeGoals: t.aGoals, awayGoals: t.bGoals,
            scorers: t.leg1Scorers, seed: t.leg1Seed, extraTime: t.extraTime,
            absent: t.leg1Absent, standIns: t.leg1StandIns,
            tieWinnerClubId: t.winner?.clubId,
          })
        } else if (leg === 1 && t.leg1) {
          out.push({
            matchday: seq, label: `${label} · Leg 1`, inTable: false,
            homeClubId: t.teamA.clubId, homeClubName: t.teamA.clubName,
            awayClubId: t.teamB.clubId, awayClubName: t.teamB.clubName,
            homeGoals: t.leg1.aGoals, awayGoals: t.leg1.bGoals,
            scorers: t.leg1Scorers, seed: t.leg1Seed,
            absent: t.leg1Absent, standIns: t.leg1StandIns,
            tieWinnerClubId: t.winner?.clubId,
          })
        } else if (leg === 2 && t.leg2) {
          // Leg 2 is played at teamB's ground, and folds its extra time in —
          // same convention as koLegDetailRequest, so both agree.
          const et = t.leg2ExtraTime
          const merged = et
            ? {
                home: [...(t.leg2Scorers?.home ?? []), ...(t.leg2ExtraTimeScorers?.home ?? [])],
                away: [...(t.leg2Scorers?.away ?? []), ...(t.leg2ExtraTimeScorers?.away ?? [])],
              }
            : t.leg2Scorers
          out.push({
            matchday: seq, label: `${label} · Leg 2`, inTable: false,
            homeClubId: t.teamB.clubId, homeClubName: t.teamB.clubName,
            awayClubId: t.teamA.clubId, awayClubName: t.teamA.clubName,
            homeGoals: t.leg2.bGoals + (et?.bGoals ?? 0),
            awayGoals: t.leg2.aGoals + (et?.aGoals ?? 0),
            scorers: merged, seed: t.leg2Seed, extraTime: !!et || t.extraTime,
            absent: t.leg2Absent, standIns: t.leg2StandIns,
            tieWinnerClubId: t.winner?.clubId,
          })
        }
      }
    }
  }
  return out
}

/**
 * Where a knockout leg sits in the timeline built by `appendKnockoutRounds`.
 *
 * Leg 1 (and a single-match tie) is always played at teamA's ground, so the row
 * with that home/away pairing is the one. Callers need this because the matchday
 * is the vantage point for everything else on the stats screen — form before the
 * tie, what each side played next, and how much of the bracket had been decided.
 * A sentinel "later than everything" matchday looked fine for form and broke
 * both of the others.
 *
 * Pass `roundLabel` whenever you have it. A pairing is unique within a round but
 * not necessarily across a whole competition, and an unscoped search returns the
 * FIRST match — i.e. the earliest round the two sides ever met, which is the
 * wrong vantage point by however many rounds.
 */
export function koLegMatchday(
  matches: ContextMatch[], teamAClubId: string, teamBClubId: string,
  roundLabel?: string, leg: 1 | 2 = 1,
): number | undefined {
  const homeId = leg === 1 ? teamAClubId : teamBClubId
  const awayId = leg === 1 ? teamBClubId : teamAClubId
  return matches.find(m =>
    m.inTable === false && m.homeClubId === homeId && m.awayClubId === awayId
    && (roundLabel === undefined || (m.label ?? '').replace(LEG_SUFFIX, '') === roundLabel))?.matchday
}

// A leg label is the round label plus a suffix — the bracket wants the ROUND,
// so the suffix comes off before grouping. Kept in one place because
// `appendKnockoutRounds` is what puts it there.
const LEG_SUFFIX = /\s*·\s*Leg\s*\d+\s*$/

/** One tie in the bracket — both legs folded into a single aggregate row. */
export type BracketTie = {
  key:        string
  round:      string
  matchday:   number      // the tie's FIRST leg, so ties sort in playing order
  teamAId:    string
  teamAName:  string
  teamBId:    string
  teamBName:  string
  // Aggregate across the legs present. Undefined while a tie is still to be
  // played (it can't be, today — the timeline only carries revealed rounds —
  // but a half-revealed round would otherwise read as 0-0).
  aGoals?:    number
  bGoals?:    number
  winnerId?:  string
  legs:       ContextMatch[]   // in playing order, so each leg opens its own sheet
}

export type BracketRound = { label: string; matchday: number; ties: BracketTie[] }

/**
 * The knockout bracket as it stood after `upToMatchday` — every round that had
 * been played by then, ties folded back together from their legs.
 *
 * This is the knockout answer to `standingsAsOf`: a league table is meaningless
 * for a cup tie (the two sides may not even share a group), so the "at the time
 * of this match" section shows the bracket instead. Both derive from the same
 * `ContextMatch[]` timeline, so they can't disagree about what had happened.
 */
export function knockoutBracket(matches: ContextMatch[], upToMatchday = Infinity): BracketRound[] {
  const rounds = new Map<string, BracketRound>()

  for (const m of matches) {
    if (m.inTable !== false) continue          // league/group games belong in the table, not the tree
    if (m.matchday > upToMatchday) continue    // hasn't happened yet from this match's vantage point
    const label = (m.label ?? 'Knockout').replace(LEG_SUFFIX, '')

    let round = rounds.get(label)
    if (!round) { round = { label, matchday: m.matchday, ties: [] }; rounds.set(label, round) }
    round.matchday = Math.min(round.matchday, m.matchday)

    // A tie is the UNORDERED pair of clubs within its round — leg 2 swaps home
    // and away, so an ordered key would split one tie into two half-ties.
    const key = [m.homeClubId, m.awayClubId].sort().join('|')
    let tie = round.ties.find(t => t.key === key)
    if (!tie) {
      tie = {
        key, round: label, matchday: m.matchday,
        teamAId: m.homeClubId, teamAName: m.homeClubName,
        teamBId: m.awayClubId, teamBName: m.awayClubName,
        winnerId: m.tieWinnerClubId, legs: [],
      }
      round.ties.push(tie)
    }
    tie.legs.push(m)
    tie.matchday = Math.min(tie.matchday, m.matchday)
    // The later leg is the one that carries the decided tie, so let it win.
    if (m.tieWinnerClubId) tie.winnerId = m.tieWinnerClubId

    if (isPlayed(m)) {
      // Leg 2 is played at teamB's ground; add each leg from teamA's point of
      // view so the aggregate reads the same way round the tie is named.
      const aIsHome = m.homeClubId === tie.teamAId
      tie.aGoals = (tie.aGoals ?? 0) + (aIsHome ? m.homeGoals : m.awayGoals)
      tie.bGoals = (tie.bGoals ?? 0) + (aIsHome ? m.awayGoals : m.homeGoals)
    }
  }

  const out = [...rounds.values()].sort((a, b) => a.matchday - b.matchday)
  for (const r of out) {
    r.ties.sort((a, b) => a.matchday - b.matchday || (a.teamAName < b.teamAName ? -1 : 1))
    for (const t of r.ties) t.legs.sort((a, b) => a.matchday - b.matchday)
  }
  return out
}

/**
 * §10 R7's "top rated" — the best `n` performers from one side of a match.
 * Reads straight off the regenerated sheet, so it can never disagree with the
 * per-player ratings shown elsewhere on the screen. Unused subs are excluded:
 * a 0 rating means "didn't play", not "played badly".
 */
export function topRated(players: PlayerMatchLine[], isHome: boolean, n = 3): PlayerMatchLine[] {
  return players
    .filter(p => p.isHome === isHome && p.minutes > 0)
    .sort((a, b) => b.rating - a.rating || b.minutes - a.minutes)
    .slice(0, n)
}
