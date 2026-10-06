// The standings order, once (centralisation L-01, phase two step 2).
//
// It was written thirteen times across the engine and the screens (league,
// league phase, World Cup groups and thirds, quick sim, the live screens, the
// run hub), all the same rule and nothing to keep them the same. Every table
// in the game now sorts through here.
//
// The rule: points, then goal difference, then goals scored, then (decision
// D4) the club's id. The last step matters only when two sides are level on
// all three, which is rare by construction; before it, two such sides kept
// whatever order the array happened to have, so the same season could rank
// them differently on two screens. No competition-specific rules (head to
// head, away goals): that would be a rules change, not centralisation.
//
// Imports nothing: the engine, the screens and the verify scripts all use it.
// It also holds the one way a result goes into the table (`recordResult`).

export type StandingStats = { points: number; goalsFor: number; goalsAgainst: number }

/** Sort comparator: the better side first. */
export function compareStandings<T extends { clubId?: string; stats: StandingStats }>(a: T, b: T): number {
  if (b.stats.points !== a.stats.points) return b.stats.points - a.stats.points
  const gd = (b.stats.goalsFor - b.stats.goalsAgainst) - (a.stats.goalsFor - a.stats.goalsAgainst)
  if (gd !== 0) return gd
  if (b.stats.goalsFor !== a.stats.goalsFor) return b.stats.goalsFor - a.stats.goalsFor
  return (a.clubId ?? '').localeCompare(b.clubId ?? '')
}

/** A sorted copy, the better side first. */
export function sortStandings<T extends { clubId?: string; stats: StandingStats }>(teams: readonly T[]): T[] {
  return [...teams].sort(compareStandings)
}

/** The same order for a flat row (the match sheet's snapshot tables, the run
 *  hub), so a table rebuilt from the matches can't disagree with the one the
 *  player watched (centralisation L-03: it broke ties by club name). */
export function compareRows<T extends { clubId?: string } & StandingStats>(a: T, b: T): number {
  return compareStandings({ clubId: a.clubId, stats: a }, { clubId: b.clubId, stats: b })
}

// ── A result into the table (centralisation step 4b) ────────────────────────
// Writing one result into two table rows was copied nine times (the league
// season's screen, the per-fixture player, the league-table sim, the quick sim
// twice, the full path's headless competitions, and three verify scripts).
// They agreed; nothing kept them agreeing.

export type TableStats = StandingStats & { played: number; won: number; drawn: number; lost: number }
type Outcome = { homeGoals: number; awayGoals: number; outcome: 'home' | 'away' | 'draw' }

/** One result into both sides' rows. */
export function applyResult(home: TableStats, away: TableStats, r: Outcome): void {
  home.played++; away.played++
  home.goalsFor += r.homeGoals; home.goalsAgainst += r.awayGoals
  away.goalsFor += r.awayGoals; away.goalsAgainst += r.homeGoals
  if (r.outcome === 'home') { home.won++; home.points += 3; away.lost++ }
  else if (r.outcome === 'away') { away.won++; away.points += 3; home.lost++ }
  else { home.drawn++; away.drawn++; home.points++; away.points++ }
}

/** Form after a result: most of the old form kept, a win or a loss nudging it. */
export function updateForm(team: { form: number }, result: 'win' | 'draw' | 'loss'): void {
  const delta = result === 'win' ? 0.15 : result === 'draw' ? 0 : -0.15
  team.form = Math.max(-1, Math.min(1, team.form * 0.85 + delta))
}

/** A result into two sides: their rows and (unless told not to) their form. */
export function recordResult(home: { stats: TableStats; form: number }, away: { stats: TableStats; form: number }, r: Outcome, withForm = true): void {
  applyResult(home.stats, away.stats, r)
  if (!withForm) return
  updateForm(home, r.outcome === 'home' ? 'win' : r.outcome === 'draw' ? 'draw' : 'loss')
  updateForm(away, r.outcome === 'away' ? 'win' : r.outcome === 'draw' ? 'draw' : 'loss')
}
