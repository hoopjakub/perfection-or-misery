// AI team selection (Big Fixes §10.5 phase 2).
//
// Until now an opponent's "XI" was just `1 GK + the top 10 outfielders by OVR`
// out of a 20–30 man scraped roster. That's not a football team — a club with
// six good centre-backs fielded six centre-backs, and the striker who should
// have led the line sat on the bench being out-rated by a full-back.
//
// This picks a real side instead: a formation the club sticks to, then the best
// available player for each SLOT in it, with enough seeded jitter that two
// clubs of similar quality don't line up identically and the same club doesn't
// field a robotically fixed XI every week.
//
// Determinism is mandatory — the selected XI decides who can score, so
// attribution (engine/stats.ts) and the deep-stat sheet (engine/match-detail.ts)
// both derive it from the SAME match seed via `lineupSeed()`. Same seed → same
// eleven, in both places, forever.

import type { RosterPlayer } from '@/types/stats'
import type { Formation } from '@/types/game'
import { getSlotsForFormation, ALL_FORMATIONS } from './formations'
import { mulberry32, deriveSeed, hashSeed, type Rng } from '@/lib/rng'

export type LineupSlot = {
  label:   string        // 'LB', 'CAM', … the shirt on the pitch diagram
  primary: string        // the position the slot really wants
  player:  RosterPlayer
}

export type SelectedLineup = {
  formation: Formation
  slots:     LineupSlot[]     // exactly 11, in formation order
  starters:  RosterPlayer[]
  bench:     RosterPlayer[]
  rotated:   number           // how many first-choice players were rested
}

// Clubs have a shape. Deriving it from the club id alone keeps a side's
// formation stable all run, instead of them reinventing themselves weekly.
export function formationForClub(clubId: string): Formation {
  const rng = mulberry32(deriveSeed(hashSeed(clubId), 0x5A17_F00D))
  return ALL_FORMATIONS[Math.floor(rng() * ALL_FORMATIONS.length)]
}

/** The dedicated sub-stream a match's lineups are drawn from. Both the scorer
 *  attribution and the stat-sheet generator call this with the match seed, so
 *  they independently arrive at the identical eleven. */
export function lineupSeed(matchSeed: number, isHome: boolean): number {
  return deriveSeed(matchSeed, isHome ? 0x1E_11_A0_01 : 0x1E_11_A0_02)
}

const DEF = new Set(['CB', 'LB', 'RB', 'LWB', 'RWB'])
const MID = new Set(['CDM', 'CM', 'CAM', 'LM', 'RM'])
const group = (pos: string) => pos === 'GK' ? 'GK' : DEF.has(pos) ? 'DEF' : MID.has(pos) ? 'MID' : 'ATT'

// How well a player suits a slot. Deliberately steep: a striker at centre-back
// should be a last resort, not a mild downgrade.
function fit(slotPrimary: string, accepts: string[], pos: string): number {
  if (slotPrimary === 'GK') return pos === 'GK' ? 1 : 0.08
  if (pos === 'GK') return 0.04                       // an outfield slot is no place for a keeper
  if (pos === slotPrimary) return 1
  if (accepts.includes(pos)) return 0.86
  if (group(pos) === group(slotPrimary)) return 0.7
  return 0.42
}

// Seeded wobble on the selection score, in OVR points (so ±JITTER/2 either
// way). Deliberately SMALL. The first pass used 7, which meant an 84 and an 85
// swapped about half the time — sides looked like they were picking at random
// week to week, and it drowned out rotation entirely (maintainer spotted
// exactly this: Aaronson 84 in one game, Tillman 85 the next, with nothing
// actually driving it). At 2 the best player keeps his place and only genuinely
// close calls — third/fourth-choice defenders — move around.
const JITTER = 2

export type SelectLineupOpts = {
  seed:            number
  /** 0 = strongest available XI · 1 = heavy rotation (about five changes). */
  rotation?:       number
  /** Injured / suspended players, excluded outright (§10.5 phase 4). */
  unavailableIds?: Set<string>
  /** 0 when the run has substitutes turned off — nobody on the bench at all. */
  benchSize?:      number
  formation?:      Formation
}

export function selectLineup(pool: RosterPlayer[], opts: SelectLineupOpts): SelectedLineup {
  const rng: Rng = mulberry32(opts.seed)
  const formation = opts.formation ?? formationForClub(pool[0]?.clubId ?? 'x')
  const slots = getSlotsForFormation(formation)

  const unavailable = opts.unavailableIds
  // Stable base order regardless of DB row order, so the same roster always
  // resolves the same way for a given seed.
  const available = [...pool]
    .filter(p => !unavailable?.has(p.playerId))
    .sort((a, b) => a.playerId < b.playerId ? -1 : a.playerId > b.playerId ? 1 : 0)

  const score = (p: RosterPlayer, slotPrimary: string, accepts: string[]) =>
    p.ovr * fit(slotPrimary, accepts, p.primaryPosition) + (rng() - 0.5) * JITTER

  const pick = (candidates: RosterPlayer[], slotPrimary: string, accepts: string[]) => {
    let best: RosterPlayer | null = null
    let bestScore = -Infinity
    for (const p of candidates) {
      const s = score(p, slotPrimary, accepts)
      if (s > bestScore) { bestScore = s; best = p }
    }
    return best
  }

  // Fill the strongest XI first, slot by slot in formation order.
  const taken = new Set<string>()
  const chosen: LineupSlot[] = []
  for (const slot of slots) {
    const p = pick(available.filter(x => !taken.has(x.playerId)), slot.primary, slot.accepts as string[])
    if (!p) break
    taken.add(p.playerId)
    chosen.push({ label: slot.label, primary: slot.primary, player: p })
  }

  // Rotation: rest up to five of the first-choice XI and refill their slots
  // from what's left. Weighted toward the BEST players — resting your worst
  // starter isn't rotation, it's just a worse team.
  let rotated = 0
  const rotation = Math.max(0, Math.min(1, opts.rotation ?? 0))
  if (rotation > 0 && chosen.length === slots.length) {
    const restCount = Math.round(rotation * 5)
    const order = chosen
      .map((c, i) => ({ i, w: c.player.ovr + rng() * 10 }))
      .sort((a, b) => b.w - a.w)
      .slice(0, restCount)
    for (const { i } of order) {
      const slot = slots[i]
      const replacement = pick(
        available.filter(x => !taken.has(x.playerId)), slot.primary, slot.accepts as string[],
      )
      if (!replacement) continue
      taken.delete(chosen[i].player.playerId)
      taken.add(replacement.playerId)
      chosen[i] = { label: slot.label, primary: slot.primary, player: replacement }
      rotated++
    }
  }

  const starters = chosen.map(c => c.player)
  const benchSize = opts.benchSize ?? 9
  const bench = benchSize <= 0 ? [] : available
    .filter(p => !taken.has(p.playerId))
    // A bench is a keeper plus the best of the rest.
    .sort((a, b) => b.ovr - a.ovr)
    .slice(0, benchSize)

  return { formation, slots: chosen, starters, bench, rotated }
}

/**
 * Arrange an ALREADY-DECIDED eleven into a formation's slots.
 *
 * This is what YOUR side gets: you drafted that XI, so nobody is picked or
 * dropped here — the same eleven simply gets laid out in your shape so the
 * pitch view can draw it, using the very formation list you chose from.
 * Most-constrained slots come first (the keeper), and each slot takes the best
 * remaining fit, so a squad always resolves cleanly.
 */
export function arrangeLineup(
  starters: RosterPlayer[], bench: RosterPlayer[], formation: Formation,
): SelectedLineup {
  const slots = getSlotsForFormation(formation)
  const remaining = [...starters]
  const chosen: LineupSlot[] = []
  for (const slot of slots) {
    if (remaining.length === 0) break
    let bestI = 0, bestScore = -Infinity
    remaining.forEach((p, i) => {
      const sc = p.ovr * fit(slot.primary, slot.accepts as string[], p.primaryPosition)
      if (sc > bestScore) { bestScore = sc; bestI = i }
    })
    const [p] = remaining.splice(bestI, 1)
    chosen.push({ label: slot.label, primary: slot.primary, player: p })
  }
  return { formation, slots: chosen, starters, bench, rotated: 0 }
}

/**
 * The pool as the rest of the engine wants it: the chosen XI first (no
 * `isBench`), then the named substitutes flagged `isBench` so the existing
 * reduced-odds rules in stats.ts apply to them unchanged.
 */
export function lineupToPool(l: SelectedLineup): RosterPlayer[] {
  return [
    ...l.starters.map(p => ({ ...p, isBench: undefined })),
    ...l.bench.map(p => ({ ...p, isBench: true as const })),
  ]
}

// ── What a rotated side is actually worth ───────────────────────────────────
// The result engine decides the scoreline from team OVR, so rotation only
// MEANS anything if it changes that number before the match is simulated.
//
// The floor matters as much as the drop: a reserve XI is weaker, but it's still
// a professional side, and letting a 90-rated club field a literal 68 because
// its backups are poor made dead rubbers absurd. So the drop is capped.
export const ROTATION_MAX_DROP = 6
// A rotating side that needs the game brings its good players back on. Each
// substitute claws back a point — but never all the way: resting them cost you
// something, and it stays costing you something.
export const SUB_RECOVERY_PER_SUB = 1
export const ROTATION_MIN_PENALTY = 1
// Fresh legs are worth a little to ANY side, rotated or not — small, capped.
export const SUB_FRESHNESS_BONUS = 0.25
export const SUB_FRESHNESS_CAP = 1

/** Mean OVR of the eleven that starts. */
export function lineupOvr(l: SelectedLineup): number {
  if (l.starters.length === 0) return 0
  return l.starters.reduce((s, p) => s + p.ovr, 0) / l.starters.length
}

/**
 * How many substitutes a side will make. Drawn from the match seed so it's
 * known BEFORE the match is simulated — which is what lets the recovery below
 * be priced into the scoreline instead of being a cosmetic afterthought.
 */
export function plannedSubs(matchSeed: number, benchSize: number): number {
  if (benchSize <= 0) return 0
  const rng = mulberry32(deriveSeed(matchSeed, 0x50B5_1E5))
  return Math.min(benchSize, 3 + Math.floor(rng() * 3))
}

/**
 * The OVR a side actually plays at in one match.
 *
 * Rotated: start from the real strength of the XI picked, floored at
 * `base − ROTATION_MAX_DROP`, then add a point per planned substitute for the
 * players coming back on — capped at `base − ROTATION_MIN_PENALTY`, so even a
 * side that empties its bench stays a point worse off than if it hadn't rested
 * anyone. Not rotated: just a small freshness nudge from having a bench.
 */
export function matchTeamOvr(
  baseOvr: number, xiOvr: number, opts: { rotated: boolean; subs: number },
): number {
  if (!opts.rotated) {
    return baseOvr + Math.min(opts.subs * SUB_FRESHNESS_BONUS, SUB_FRESHNESS_CAP)
  }
  const floored = Math.max(baseOvr - ROTATION_MAX_DROP, Math.min(xiOvr, baseOvr))
  const recovered = floored + opts.subs * SUB_RECOVERY_PER_SUB
  return Math.min(recovered, baseOvr - ROTATION_MIN_PENALTY)
}

// ── One match, both sides ───────────────────────────────────────────────────

export type MatchLineupOpts = {
  /** The match seed. Without it nothing is selected and the pools pass through
   *  unchanged — legacy matches keep exactly the behaviour they had. */
  seed?:           number
  /** YOUR club is never re-picked: you drafted that XI, the game doesn't get to
   *  drop one of your players for a "better fit". */
  playerClubId?:   string
  /** YOUR formation — your eleven is arranged into it, never re-picked. */
  playerFormation?: Formation
  benchSize?:      number
  homeRotation?:   number
  awayRotation?:   number
  /** §10.5 phase 4 — injured/suspended players, on either side. Ids are unique
   *  across clubs, so one set covers both. */
  unavailableIds?: Set<string>
  /** §10.5 phase 4 — stand-ins generated for YOUR club when an absence can't be
   *  covered from your bench (decision 1). They line up as starters. */
  standIns?:       RosterPlayer[]
}

/** The id a generated stand-in carries, derived from the man he's covering, so
 *  the pairing survives being stored on a match and read back. */
export const standInIdFor = (absentPlayerId: string) => `standin:${absentPlayerId}`

/**
 * How YOUR side covers an absence (§10.5 phase 4, decision 1).
 *
 * Your XI is never re-picked, so an unavailable player can't just be dropped —
 * the shirt has to be filled or `lineupsForMatch` sees ten men and abandons the
 * whole pitch view. A substitute covers it; whoever is left over with nobody on
 * the bench to cover them comes back as `uncovered`, and the availability
 * ledger generates the OVR−5 stand-in for exactly those.
 *
 * Pure and order-stable, which is what lets the ledger (which generates the
 * stand-ins) and `coverAbsences` (which fields them, possibly seasons later on
 * a history load) agree on who covered whom.
 */
export function planAbsenceCover(
  pool: RosterPlayer[], unavailableIds: Set<string> | undefined,
): { promotedIds: Set<string>; uncovered: RosterPlayer[] } {
  const promotedIds = new Set<string>()
  const uncovered: RosterPlayer[] = []
  if (!unavailableIds?.size) return { promotedIds, uncovered }
  const available = pool.filter(p => !unavailableIds.has(p.playerId))
  if (available.filter(p => !p.isBench).length >= 11) return { promotedIds, uncovered }
  const gaps = pool
    .filter(p => unavailableIds.has(p.playerId) && !p.isBench)
    .sort((a, b) => (a.playerId < b.playerId ? -1 : 1))
  for (const gap of gaps) {
    // Prefer somebody who plays there; failing that, the best man available.
    const pick = available
      .filter(p => p.isBench && !promotedIds.has(p.playerId))
      .sort((a, b) =>
        (group(b.primaryPosition) === group(gap.primaryPosition) ? 1 : 0)
        - (group(a.primaryPosition) === group(gap.primaryPosition) ? 1 : 0)
        || b.ovr - a.ovr || (a.playerId < b.playerId ? -1 : 1))[0]
    if (pick) promotedIds.add(pick.playerId)
    else uncovered.push(gap)
  }
  return { promotedIds, uncovered }
}

/** Your pool with the absences removed and the gaps filled — see planAbsenceCover. */
export function coverAbsences(
  pool: RosterPlayer[], unavailableIds: Set<string> | undefined, standIns?: RosterPlayer[],
): RosterPlayer[] {
  const { promotedIds, uncovered } = planAbsenceCover(pool, unavailableIds)
  const out = (unavailableIds?.size ? pool.filter(p => !unavailableIds.has(p.playerId)) : [...pool])
    .map(p => promotedIds.has(p.playerId) ? { ...p, isBench: undefined } : p)
  for (const gap of uncovered) {
    const stand = standIns?.find(s => s.playerId === standInIdFor(gap.playerId))
    if (stand) out.push({ ...stand, isBench: undefined })
  }
  return out
}

export type MatchLineups = {
  homePool:   RosterPlayer[]
  awayPool:   RosterPlayer[]
  homeLineup: SelectedLineup | null
  awayLineup: SelectedLineup | null
}

/**
 * THE single point of truth for who lines up in a match.
 *
 * Called with identical arguments by `attributeMatchScorers` (deciding who can
 * score) and `generateMatchDetail` (building the stat sheet), both of which
 * hold the match seed. Because the selection is driven purely by that seed, the
 * two arrive at the same eleven independently — which is the whole reason the
 * pitch view can never disagree with the scoresheet.
 */
/**
 * The OVRs to simulate a match with, once rotation is taken into account.
 *
 * Must be called BEFORE `simulateMatch`: the result engine decides the
 * scoreline from these numbers, so resting players only means anything if the
 * weakened side is weaker *going in*. Uses the same seed as everything else, so
 * the eleven priced here is the eleven that plays.
 */
export function effectiveMatchOvrs(
  homePool: RosterPlayer[], awayPool: RosterPlayer[],
  o: MatchLineupOpts & { homeBaseOvr: number; awayBaseOvr: number },
): { homeOvr: number; awayOvr: number } {
  if (o.seed === undefined) return { homeOvr: o.homeBaseOvr, awayOvr: o.awayBaseOvr }
  const { homeLineup, awayLineup } = lineupsForMatch(homePool, awayPool, o)
  const subs = plannedSubs(o.seed, o.benchSize ?? 9)
  return {
    homeOvr: matchTeamOvr(o.homeBaseOvr, homeLineup ? lineupOvr(homeLineup) : o.homeBaseOvr,
      { rotated: !!homeLineup?.rotated, subs }),
    awayOvr: matchTeamOvr(o.awayBaseOvr, awayLineup ? lineupOvr(awayLineup) : o.awayBaseOvr,
      { rotated: !!awayLineup?.rotated, subs }),
  }
}

export function lineupsForMatch(
  homePool: RosterPlayer[], awayPool: RosterPlayer[], o: MatchLineupOpts,
): MatchLineups {
  if (o.seed === undefined) {
    return { homePool, awayPool, homeLineup: null, awayLineup: null }
  }
  // §10.5 phase 4 — availability is applied HERE, the one place every caller
  // funnels through (attribution, the stat sheet, the effective-OVR pricing), so
  // an unavailable player cannot line up, score or be rated no matter which
  // screen asked. AI sides just lose the player; your side has the shirt covered
  // (see coverAbsences).
  const adjust = (pool: RosterPlayer[]) => {
    if (!o.unavailableIds?.size && !o.standIns?.length) return pool
    if (o.playerClubId && pool[0]?.clubId === o.playerClubId) {
      return coverAbsences(pool, o.unavailableIds, o.standIns)
    }
    return o.unavailableIds?.size ? pool.filter(p => !o.unavailableIds!.has(p.playerId)) : pool
  }
  const homeAdj = adjust(homePool)
  const awayAdj = adjust(awayPool)

  const build = (pool: RosterPlayer[], isHome: boolean, rotation?: number) => {
    if (pool.length === 0) return null
    if (o.playerClubId && pool[0].clubId === o.playerClubId) {
      // YOUR side. The eleven is untouchable — you drafted it — so the only job
      // here is working out which slot each of them occupies. Running the same
      // selector over exactly eleven candidates for eleven slots can't drop
      // anyone; it just assigns them. Without a formation there's nothing to
      // assign to, so the pitch view falls back to the ratings list.
      if (!o.playerFormation) return null
      const starters = pool.filter(p => !p.isBench)
      if (starters.length !== 11) return null
      return selectLineup(starters, {
        seed: lineupSeed(o.seed!, isHome),
        formation: o.playerFormation, benchSize: 0,
      })
    }
    return selectLineup(pool, {
      seed: lineupSeed(o.seed!, isHome),
      rotation, benchSize: o.benchSize, unavailableIds: o.unavailableIds,
    })
  }
  const isPlayers = (pool: RosterPlayer[]) => !!o.playerClubId && pool[0]?.clubId === o.playerClubId
  const homeLineup = build(homeAdj, true, o.homeRotation)
  const awayLineup = build(awayAdj, false, o.awayRotation)
  // Your side's "lineup" is a slot assignment, not a selection — so take its
  // shape but leave your pool (bench and all) exactly as it came in. Replacing
  // it would quietly delete your substitutes from the match.
  return {
    homePool: homeLineup && !isPlayers(homeAdj) ? lineupToPool(homeLineup) : homeAdj,
    awayPool: awayLineup && !isPlayers(awayAdj) ? lineupToPool(awayLineup) : awayAdj,
    homeLineup, awayLineup,
  }
}
