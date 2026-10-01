// P8.5-30: names stored as TEXT in Supabase, shown as this flavour shows them.
//
// A saved run keeps its competition's name in `runs.league_name`, and every
// build writes to the same project: a run from the personal build says "UEFA
// Champions League", and the legal web's leaderboard would show it as stored.
// So rows coming back from the server pass through shownRuns(), which in the
// legal build renames that one field with the same table the build uses
// (src/data/legal-names.js), and in the personal build returns the rows as they are.
import { BRAND_MODE } from './brand'
import { renameText } from '../data/legal-names'

export function shownRun<T>(row: T): T {
  const r = row as T & { league_name?: unknown }
  if (BRAND_MODE === 'real' || !r || typeof r.league_name !== 'string') return row
  return { ...r, league_name: renameText(r.league_name) }
}

export const shownRuns = <T,>(rows: T[]): T[] => (BRAND_MODE === 'real' ? rows : rows.map(shownRun))
