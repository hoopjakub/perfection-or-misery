/**
 * Per-90 figures and position ranks over a run's stats (Phase 5, D3/D4).
 *
 * Pure functions over `computeRunStats` output. A total says who did the most;
 * per 90 says who did the most with the minutes they had; a rank against the
 * player's own position says whether that's good for a full-back or ordinary
 * for a striker. Each needs an eligibility floor, or a two-minute cameo with a
 * goal tops every per-90 board — so the floor travels with the number and the
 * screens print it.
 */

import type { PlayerStatLine } from '@/types/stats'
import { lineOf, type Line } from './awards'

/** The columns a board or a player page can be ranked on. */
export type StatKey =
  | 'goals' | 'assists' | 'chancesCreated' | 'bigChancesCreated' | 'shots' | 'shotsOnTarget'
  | 'dribbles' | 'tacklesWon' | 'interceptions' | 'clearances' | 'blocks' | 'duelsWon'
  | 'saves' | 'cleanSheets' | 'passes' | 'accuratePasses' | 'yellowCards' | 'redCards' | 'fouls'
  | 'avgRating' | 'potm'

export const STAT_LABEL: Record<StatKey, string> = {
  goals: 'Goals', assists: 'Assists', chancesCreated: 'Chances created', bigChancesCreated: 'Big chances created',
  shots: 'Shots', shotsOnTarget: 'Shots on target', dribbles: 'Dribbles', tacklesWon: 'Tackles won',
  interceptions: 'Interceptions', clearances: 'Clearances', blocks: 'Blocks', duelsWon: 'Duels won',
  saves: 'Saves', cleanSheets: 'Clean sheets', passes: 'Passes', accuratePasses: 'Accurate passes',
  yellowCards: 'Yellow cards', redCards: 'Red cards', fouls: 'Fouls', avgRating: 'Average rating', potm: 'Man of the match',
}

// Averages and awards aren't per-90 figures; neither are clean sheets, which
// belong to a whole match rather than a player's minutes.
const NOT_PER_90 = new Set<StatKey>(['avgRating', 'potm', 'cleanSheets'])

/** Minutes a player needs before per-90 figures and ranks count for him. */
export const PER90_MIN_MINUTES = 270   // three full matches
/** A player needs this many rated matches before his average rating ranks. */
export const RATING_MIN_MATCHES = 3

export const value = (p: PlayerStatLine, key: StatKey): number => (p as Record<string, unknown>)[key] as number ?? 0

export function canPer90(key: StatKey): boolean {
  return !NOT_PER_90.has(key)
}

/** A figure per 90 minutes, or null when the player hasn't played enough (or the run predates minutes). */
export function per90(p: PlayerStatLine, key: StatKey): number | null {
  if (!canPer90(key)) return null
  const mins = p.minutes ?? 0
  if (mins < PER90_MIN_MINUTES) return null
  return Math.round((value(p, key) / mins) * 90 * 100) / 100
}

export function eligible(p: PlayerStatLine, key: StatKey, mode: 'total' | 'per90'): boolean {
  if (key === 'avgRating') return (p.matchesRated ?? 0) >= RATING_MIN_MATCHES
  if (mode === 'per90') return per90(p, key) != null
  return true
}

export type Rank = { rank: number; of: number; percentile: number }

/**
 * Where a player stands on one column among the players who share his line
 * (keepers against keepers, defenders against defenders…). Ties share a rank.
 * `percentile` is the share of the line he's ahead of or level with: 1 = top.
 */
export function positionRanks(players: PlayerStatLine[], key: StatKey, mode: 'total' | 'per90' = 'total'): Map<string, Rank> {
  const out = new Map<string, Rank>()
  const byLine = new Map<Line, PlayerStatLine[]>()
  for (const p of players) {
    if (!eligible(p, key, mode)) continue
    const l = lineOf(p.position)
    byLine.set(l, [...(byLine.get(l) ?? []), p])
  }
  const score = (p: PlayerStatLine) => (mode === 'per90' ? per90(p, key) ?? 0 : value(p, key))
  for (const list of byLine.values()) {
    const sorted = [...list].sort((a, b) => score(b) - score(a) || a.playerId.localeCompare(b.playerId))
    for (const p of sorted) {
      // Level players share the better rank.
      const rank = sorted.findIndex(q => score(q) === score(p)) + 1
      out.set(p.playerId, { rank, of: sorted.length, percentile: 1 - (rank - 1) / sorted.length })
    }
  }
  return out
}

/** "TOP 5% · ST" when a player is in the top tenth of his line for a column, else null. */
export function percentileTag(p: PlayerStatLine, r: Rank | undefined): string | null {
  // Ten players is the smallest line where "top 10%" means anything.
  if (!r || r.of < 10 || r.rank / r.of > 0.1) return null
  return `TOP ${Math.max(1, Math.ceil((r.rank / r.of) * 100))}% · ${p.position}`
}
