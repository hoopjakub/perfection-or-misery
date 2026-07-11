/**
 * Champions League access-list builder (pure).
 *
 * Turns real domestic final-tables into the tagged UCL field: who enters
 * directly into the league phase, and who enters each qualifying round / path.
 * Consumes the rules in `src/data/uefa-coefficients.ts` (docs §12 / §16 M1).
 *
 * Robust to missing associations: we currently only have some leagues scraped,
 * so any rule with no matching club is recorded in `missing` and simply skipped
 * — the qualifying sim (cl-qualifying.ts) tolerates variable field sizes.
 *
 * Holders: the last UCL & UEL winners are kept STATIC for now (no Europa League
 * sim). Both real 2026/27 holders qualified domestically, so they normally
 * appear via their league finish; `ensureHolders` injects any that are missing.
 */
import {
  DIRECT_LEAGUE_PHASE, QUALIFYING_ENTRANTS, UEFA_ASSOCIATIONS,
  type AccessRule, type UclRound, type UclPath,
} from '@/data/uefa-coefficients'

/** One club as we know it from a domestic final table (index 0 = champion). */
export type AssociationClub = { clubId: string; clubName: string; ovr: number }

/** What we know about one association's qualified clubs, ranked by finish. */
export type AssociationEntry = {
  rank: number
  name: string
  /** The association's country (for the globe reveal) — e.g. 'England', 'Serbia'. */
  country?: string
  /** The league's real domestic format (Belgium playoff, Scotland split, …). */
  format?: import('./cl-league-sim').LeagueFormat
  /** clubs[0] = 1st (champion), clubs[1] = 2nd (runner-up), … in final-table order. */
  clubs: AssociationClub[]
}

export type EntrantClub = {
  clubId: string
  clubName: string
  ovr: number
  associationRank: number
  associationName: string
  associationCountry?: string
  position: number       // finishing position that earned the berth (1..5)
  entryRound: UclRound
  entryPath: UclPath
}

export type MissingSlot = { rank: number; position: number; round: UclRound; path: UclPath; note?: string }

export type CLAccessList = {
  /** Direct league-phase entrants (up to 29; fewer if data is missing). */
  leaguePhaseDirect: EntrantClub[]
  /** Everyone entering the qualifying ladder (q1/q2/q3/playoff). */
  qualifying: EntrantClub[]
  /** Entrants keyed by `${round}:${path}` for the qualifying sim. */
  byRoundPath: Record<string, EntrantClub[]>
  /** Rules that found no club (association not scraped / short final table). */
  missing: MissingSlot[]
}

export const roundPathKey = (round: UclRound, path: UclPath) => `${round}:${path}`

/**
 * Build the tagged access list from real association final-tables.
 * `associations` may be sparse — only the leagues we've scraped need be present.
 */
export function buildCLAccessList(associations: AssociationEntry[]): CLAccessList {
  const byRank = new Map<number, AssociationEntry>()
  for (const a of associations) byRank.set(a.rank, a)

  const leaguePhaseDirect: EntrantClub[] = []
  const qualifying: EntrantClub[] = []
  const byRoundPath: Record<string, EntrantClub[]> = {}
  const missing: MissingSlot[] = []

  const apply = (rule: AccessRule, sink: EntrantClub[]) => {
    for (const rank of rule.ranks) {
      const assoc = UEFA_ASSOCIATIONS[rank - 1]
      if (!assoc || !assoc.active) continue          // skip suspended / no-league
      const entry = byRank.get(rank)
      const club = entry?.clubs[rule.position - 1]   // position 1 → index 0
      if (!club) {
        missing.push({ rank, position: rule.position, round: rule.round, path: rule.path, note: rule.note })
        continue
      }
      const entrant: EntrantClub = {
        clubId: club.clubId, clubName: club.clubName, ovr: club.ovr,
        associationRank: rank, associationName: entry!.name, associationCountry: entry!.country,
        position: rule.position, entryRound: rule.round, entryPath: rule.path,
      }
      sink.push(entrant)
      if (rule.round !== 'league_phase') {
        (byRoundPath[roundPathKey(rule.round, rule.path)] ??= []).push(entrant)
      }
    }
  }

  for (const rule of DIRECT_LEAGUE_PHASE) apply(rule, leaguePhaseDirect)
  for (const rule of QUALIFYING_ENTRANTS) apply(rule, qualifying)

  return { leaguePhaseDirect, qualifying, byRoundPath, missing }
}

/**
 * Ensure the static UCL/UEL holders are in the field. If a holder club isn't
 * already a direct league-phase entrant, inject it (replacing the lowest-OVR
 * direct entrant so the league-phase count is preserved). No-op when the holder
 * already qualified domestically (the usual case).
 */
export function ensureHolders(
  access: CLAccessList,
  holders: AssociationClub[],
): CLAccessList {
  const present = new Set([
    ...access.leaguePhaseDirect.map(e => e.clubId),
    ...access.qualifying.map(e => e.clubId),
  ])
  const direct = [...access.leaguePhaseDirect]
  for (const h of holders) {
    if (present.has(h.clubId)) continue
    const injected: EntrantClub = {
      clubId: h.clubId, clubName: h.clubName, ovr: h.ovr,
      associationRank: 0, associationName: 'Title holder',
      position: 0, entryRound: 'league_phase', entryPath: 'none',
    }
    // drop the weakest direct entrant to keep the slot count stable
    let weakestIdx = 0
    for (let i = 1; i < direct.length; i++) if (direct[i].ovr < direct[weakestIdx].ovr) weakestIdx = i
    if (direct.length > 0) direct.splice(weakestIdx, 1)
    direct.push(injected)
    present.add(h.clubId)
  }
  return { ...access, leaguePhaseDirect: direct }
}
