// P8-126: feats — achievements that aren't about beating a mode on a
// difficulty, but about a way of playing. Each is checked from a saved run
// alone (its squad, its result, its difficulty), so past runs count too.
//
// The maintainer's two are the first two; the rest are in the same spirit and
// open to change. Every feat needs the run won, except where it says.
// Pure (no database), so scripts/verify-feats.ts can check each rule.

type SquadPlayer = {
  name: string; nationality: string; clubName: string
  isBench?: boolean; birthYear?: number | null; yearStart?: number
}

export type FeatRun = {
  mode: string
  tier: string | null
  final_position: number | null
  losses?: number | null
  difficulty?: string | null
  difficulty_meta?: { ratingsShown?: boolean } | null
  squad?: SquadPlayer[] | null
  /** P8-173: the league's cup, where the run had one. */
  highlights?: { cup?: { winner?: { isPlayer?: boolean } | null } | null } | null
}

const CUPS = new Set(['world_cup', 'champions_league', 'champions_league_custom', 'europa_league', 'conference_league'])

/** A trophy: the cup lifted, or the league won. */
export function isRunWon(run: { mode: string; tier: string | null; final_position: number | null }): boolean {
  // P8-52: the full path can end with the Europa or Conference League's trophy ('uel_winner').
  if (CUPS.has(run.mode)) return run.tier === 'winner' || run.tier === 'uel_winner' || run.tier === 'uecl_winner'
  return run.final_position === 1
}

// The eleven that started (a saved squad carries the bench too). Only a full
// eleven counts: a partial or missing squad can't earn a squad feat.
function eleven(run: FeatRun): SquadPlayer[] | null {
  const xi = (run.squad ?? []).filter(p => !p.isBench)
  return xi.length === 11 ? xi : null
}
// His age in the season he was drafted from; null when the run didn't keep it.
const ageOf = (p: SquadPlayer) => (p.birthYear && p.yearStart ? p.yearStart - p.birthYear : null)
const ages = (xi: SquadPlayer[]) => { const a = xi.map(ageOf); return a.every((x): x is number => x != null) ? a : null }

export type Feat = { id: string; title: string; how: string; earned: (run: FeatRun) => boolean }

export const FEATS: Feat[] = [
  {
    id: 'one-nation', title: 'One nation',
    how: 'Win with an eleven all from one country.',
    earned: r => { const xi = eleven(r); return isRunWon(r) && !!xi && new Set(xi.map(p => p.nationality)).size === 1 },
  },
  {
    id: 'the-kids', title: 'The kids',
    how: 'Win with an eleven all aged 21 or under.',
    earned: r => { const xi = eleven(r); const a = xi && ages(xi); return isRunWon(r) && !!a && a.every(x => x <= 21) },
  },
  {
    id: 'eleven-nations', title: 'Eleven nations',
    how: 'Win with eleven different countries in the eleven.',
    earned: r => { const xi = eleven(r); return isRunWon(r) && !!xi && new Set(xi.map(p => p.nationality)).size === 11 },
  },
  {
    id: 'no-veterans', title: 'No veterans',
    how: 'Win with nobody in the eleven over 28.',
    earned: r => { const xi = eleven(r); const a = xi && ages(xi); return isRunWon(r) && !!a && a.every(x => x <= 28) },
  },
  {
    id: 'one-club', title: 'One club',
    how: "Win with a whole eleven from one club's history, any seasons.",
    earned: r => { const xi = eleven(r); return isRunWon(r) && !!xi && new Set(xi.map(p => p.clubName)).size === 1 },
  },
  {
    id: 'blind-perfect', title: 'Blind and perfect',
    how: 'Perfection, or the trophy in a cup, with the ratings hidden the whole draft.',
    earned: r => (r.tier === 'perfection' || (CUPS.has(r.mode) && isRunWon(r))) && ratingsWereHidden(r),
  },
  {
    id: 'invincibles', title: 'Invincibles',
    how: 'Win a league without losing a match.',
    earned: r => !CUPS.has(r.mode) && r.final_position === 1 && r.losses === 0,
  },
  // P8-173: the league's cup.
  {
    id: 'cup-winners', title: 'Cup winners',
    how: "Win the league's cup in a league run.",
    earned: r => !CUPS.has(r.mode) && !!r.highlights?.cup?.winner?.isPlayer,
  },
  {
    id: 'the-double', title: 'The Double',
    how: 'Win the league and its cup in the same run.',
    earned: r => !CUPS.has(r.mode) && r.final_position === 1 && !!r.highlights?.cup?.winner?.isPlayer,
  },
]

// Hidden ratings: what the run recorded (difficulty_meta), or for a run that
// didn't record it, what its mode and difficulty always meant (Hard, Chaos and
// Cursed draft blind).
function ratingsWereHidden(r: FeatRun): boolean {
  if (r.difficulty_meta && typeof r.difficulty_meta.ratingsShown === 'boolean') return !r.difficulty_meta.ratingsShown
  return r.mode === 'chaos' || r.mode === 'cursed' || r.difficulty === 'hard'
}

/** How many of the runs earned each feat, by id. */
export function featCounts(runs: FeatRun[]): Map<string, number> {
  const out = new Map(FEATS.map(f => [f.id, 0]))
  for (const r of runs) for (const f of FEATS) if (f.earned(r)) out.set(f.id, out.get(f.id)! + 1)
  return out
}
