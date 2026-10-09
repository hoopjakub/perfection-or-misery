// The site's only reads from the game's database (docs/website/08 §2, 09 §3).
// Used at build time (the numbers baked into the page, with their date) and in
// the browser (refreshed while the tab is visible). Public values only: the
// project's address and its anon/publishable key, the same the app ships. No
// session, no writes, and no Realtime (07 F14: the free plan's 200 connections
// are the club chat's).
import renames from '../data/renames.json'

const URL_ = import.meta.env.PUBLIC_SUPABASE_URL as string | undefined
const KEY = import.meta.env.PUBLIC_SUPABASE_ANON_KEY as string | undefined
export const liveConfigured = !!(URL_ && KEY)

async function rest<T>(path: string, init?: RequestInit): Promise<T | null> {
  if (!URL_ || !KEY) return null
  try {
    const res = await fetch(`${URL_.replace(/\/$/, '')}/rest/v1/${path}`, {
      ...init,
      headers: { apikey: KEY, 'Content-Type': 'application/json', ...(init?.headers ?? {}) },
    })
    return res.ok ? ((await res.json()) as T) : null
  } catch {
    return null
  }
}

/** The counters: runs played, and players once past their threshold (null below it). */
export async function readCounters(): Promise<{ runs: number; users: number | null } | null> {
  // site_counters() (supabase/site-counters.sql) returns { runs, users }; until
  // it's been run, this is null and the page leaves the counter out.
  const j = await rest<{ runs?: unknown; users?: unknown }>('rpc/site_counters', { method: 'POST', body: '{}' })
  if (!j || typeof j.runs !== 'number') return null
  return { runs: j.runs, users: typeof j.users === 'number' ? j.users : null }
}

export type TopRun = { score: number; tier: string; league_name: string | null; profiles: { username: string | null } | null }
/** This ranking week's best five runs (the week as Ranks counts it). */
export function readTopFive(since: Date) {
  return rest<TopRun[]>(`runs?select=score,tier,league_name,profiles(username)&created_at=gte.${encodeURIComponent(since.toISOString())}&order=score.desc&limit=5`)
}

// The legal flavour's rename table (src/data/legal-names.js, exported as data
// by scripts/build-landing-data.cjs): runs saved from the personal build store
// real competition names, and the public site must never print them (08 H3).
const PATTERNS = (renames as [string, string][]).map(([from, to]) =>
  [new RegExp(`(^|[^\\p{L}\\p{N}])${from.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?![\\p{L}\\p{N}])`, 'gu'), to] as const)
export function renameText(text: string | null | undefined): string {
  if (!text) return ''
  let out = text
  for (const [re, to] of PATTERNS) out = out.replace(re, (_m, before: string) => before + to)
  return out
}
