// The pundits' predictions (docs/ui-overhaul/07b B8, borrowed from The
// Dugout's season preview and sized for one run).
//
// Pure and seeded: the same teams and seed always give the same preview, so a
// run can store the seed and the verdict can check what was actually said.
//
// THE PUNDITS ARE WRONG ON PURPOSE. A preview equal to the strength order isn't
// a preview, it's a spoiler: it would hand you the finishing table before a
// ball is kicked, and "you beat the predictions" would mean nothing. So each
// club's pundit rating is its OVR plus seeded noise (PREDICTION_NOISE rating
// points, roughly ±3). That keeps a typical club within two or three places and
// occasionally embarrasses the pundits, which is the point.
//
// Player picks (Phase 4): Player of the Season, top scorer and best under-21,
// named from the loaded squads with the same deliberate noise, so Awards Night
// can say "They said Messi. It was Fekir." They're kept on the run beside the
// table's seed and checked against the measured awards at the end.

import { mulberry32, rngNoise, deriveSeed, type Rng } from '@/lib/rng'
import { PUNDITS, type Pundit } from '@/data/pundits'
import { matchOdds, HOME_ADVANTAGE } from './match'

export const PREDICTION_NOISE = 3
// P8-57: how far one panellist strays from the panel's shared view. At 2 they
// were polite (half a place from the consensus on average); at 4 a pundit is
// about a place off it and almost every panel splits on you — an argument about
// places, not about who's good (verify-predictions measures both).
export const PANELLIST_NOISE = 4
export const PANEL_SIZE = 12

export type PredictionTeam = { clubId: string; clubName: string; ovr: number; isPlayer: boolean }

export type PredictedRow = PredictionTeam & {
  predicted: number      // 1-based place the pundits give
  strengthRank: number   // 1-based place by OVR alone
  points: number         // P8-13: the points they expect this club to finish with
}

/**
 * The points the pundits expect (P8-13). Worked out from the engine's OWN odds
 * (`matchOdds`) applied to the rating the pundits believe, home and away
 * against every other club, then scaled to the matches actually played — 38 in
 * a 20-club league, 8 in the league phase, 3 in a World Cup group. A club that
 * plays only some of the field gets the average opponent, which is what a
 * preview can honestly say before the draw is known.
 */
export function expectedPoints(rating: number, opponents: number[], matchesPerClub: number): number {
  if (opponents.length === 0 || matchesPerClub <= 0) return 0
  let perMatch = 0
  for (const o of opponents) {
    const h = matchOdds(rating + HOME_ADVANTAGE, o)
    const a = matchOdds(o + HOME_ADVANTAGE, rating)
    perMatch += (3 * h.home + h.draw) + (3 * a.away + a.draw)
  }
  return Math.round((perMatch / (opponents.length * 2)) * matchesPerClub)
}

export type Prediction = {
  seed: number
  table: PredictedRow[]            // in predicted order
  player: PredictedRow | null
  // Clubs the pundits rate above their strength ("they'll surprise") and below
  // it ("they'll disappoint"). Never your own club; at most two each.
  surprise: PredictedRow[]
  disappoint: PredictedRow[]
}

/**
 * What the pundits believe each side is worth: its OVR plus their seeded noise.
 * The one source for every prediction — the table, and the whole-tournament
 * calls (P8-56) that apply the same belief to the real groups and bracket — so
 * they can never disagree. Noise is drawn in clubId order, so the input order
 * never changes it.
 */
export function punditRatings(teams: PredictionTeam[], seed: number, noise = PREDICTION_NOISE): Map<string, number> {
  const rng: Rng = mulberry32(seed)
  const ordered = [...teams].sort((a, b) => a.clubId.localeCompare(b.clubId))
  return new Map(ordered.map(t => [t.clubId, t.ovr + rngNoise(rng) * noise]))
}

export function predictTable(
  teams: PredictionTeam[], seed: number, noise = PREDICTION_NOISE,
  /** Matches each club plays; a double round robin unless the caller says otherwise. */
  matchesPerClub?: number,
): Prediction {
  return tableFromRatings(teams, punditRatings(teams, seed, noise), seed, matchesPerClub)
}

/** A whole prediction — table, points, surprises, disappointments — from what
 *  someone believes each side is worth. The consensus and every panellist
 *  (P8-57) build theirs the same way, so each pundit has a full preview. */
export function tableFromRatings(teams: PredictionTeam[], pundit: Map<string, number>, seed: number, matchesPerClub?: number): Prediction {
  const ordered = [...teams].sort((a, b) => a.clubId.localeCompare(b.clubId))

  const byStrength = [...ordered].sort((a, b) => b.ovr - a.ovr || a.clubId.localeCompare(b.clubId))
  const strengthRank = new Map(byStrength.map((t, i) => [t.clubId, i + 1]))

  const matches = matchesPerClub ?? Math.max(1, (teams.length - 1) * 2)
  const table: PredictedRow[] = [...ordered]
    .sort((a, b) => pundit.get(b.clubId)! - pundit.get(a.clubId)! || a.clubId.localeCompare(b.clubId))
    .map((t, i) => ({
      ...t, predicted: i + 1, strengthRank: strengthRank.get(t.clubId)!,
      // Against what they believe of everyone else, not of themselves.
      points: expectedPoints(pundit.get(t.clubId)!, ordered.filter(o => o.clubId !== t.clubId).map(o => pundit.get(o.clubId)!), matches),
    }))

  const others = table.filter(r => !r.isPlayer)
  const gap = (r: PredictedRow) => r.strengthRank - r.predicted   // positive = tipped above strength
  const surprise = others.filter(r => gap(r) >= 2).sort((a, b) => gap(b) - gap(a) || a.predicted - b.predicted).slice(0, 2)
  const disappoint = others.filter(r => gap(r) <= -2).sort((a, b) => gap(a) - gap(b) || a.predicted - b.predicted).slice(0, 2)

  return { seed, table, player: table.find(r => r.isPlayer) ?? null, surprise, disappoint }
}

// Knockout competitions: where the pundits expect you to go out, from your
// place in their ranking of the whole field.
export type RoundCall = { key: string; label: string }

export function predictWorldCupRound(place: number): RoundCall {
  if (place <= 1) return { key: 'winner', label: 'Champions' }
  if (place <= 2) return { key: 'final', label: 'Runners-up' }
  if (place <= 4) return { key: 'sf', label: 'Semi-finalists' }
  if (place <= 8) return { key: 'qf', label: 'Quarter-finalists' }
  if (place <= 16) return { key: 'r16', label: 'Round of 16' }
  if (place <= 32) return { key: 'r32', label: 'Round of 32' }
  return { key: 'groups', label: 'Group Stage' }
}

export function predictChampionsLeagueRound(place: number): RoundCall {
  if (place <= 1) return { key: 'winner', label: 'Champions' }
  if (place <= 2) return { key: 'finalist', label: 'Runners-up' }
  if (place <= 4) return { key: 'sf_exit', label: 'Semi-finalists' }
  if (place <= 8) return { key: 'qf_exit', label: 'Quarter-finalists' }
  if (place <= 16) return { key: 'r16_exit', label: 'Round of 16' }
  if (place <= 24) return { key: 'playoff_exit', label: 'Knockout Play-off' }
  return { key: 'league_exit', label: 'League Phase' }
}

// ── The three names ──────────────────────────────────────────────────────────
export type PunditPick = { playerId: string; name: string; clubName: string }
export type PunditPicks = { pots: PunditPick | null; topScorer: PunditPick | null; bestU21: PunditPick | null }

export type PickablePlayer = {
  playerId: string; name: string; clubName: string; primaryPosition: string
  ovr: number; attack: number; birthYear: number | null; yearStart: number
}

const FORWARDS = new Set(['ST', 'CF', 'LW', 'RW'])
// Player picks lean on reputation (OVR, or attack for the scorer), with the
// same size of noise as the table: the pundits know who's good, and still miss.
export const PLAYER_PICK_NOISE = 3

export function predictPlayers(players: PickablePlayer[], seed: number, noise = PLAYER_PICK_NOISE): PunditPicks {
  // Drawn in playerId order, from a stream separate from the table's, so the
  // picks never move the predicted table and input order never matters.
  const ordered = [...players].sort((a, b) => a.playerId.localeCompare(b.playerId))
  const rng: Rng = mulberry32((seed ^ 0x5bd1e995) >>> 0)
  const shake = new Map(ordered.map(p => [p.playerId, rngNoise(rng) * noise]))
  const best = (list: PickablePlayer[], value: (p: PickablePlayer) => number): PunditPick | null => {
    const top = [...list].sort((a, b) =>
      (value(b) + shake.get(b.playerId)!) - (value(a) + shake.get(a.playerId)!) || a.playerId.localeCompare(b.playerId))[0]
    return top ? { playerId: top.playerId, name: top.name, clubName: top.clubName } : null
  }
  const young = ordered.filter(p => p.birthYear != null && p.yearStart - p.birthYear <= 21)
  return {
    pots: best(ordered, p => p.ovr),
    topScorer: best(ordered.filter(p => FORWARDS.has(p.primaryPosition)), p => p.attack || p.ovr),
    bestU21: best(young, p => p.ovr),
  }
}

// ── The panel (P8-57) ─────────────────────────────────────────────────────────
// A panel of pundits from different countries, each with their own call. The
// panel's CONSENSUS is the prediction the game has always made (`predictTable`
// on the run's seed) — the verdict, the awards and every check still read that
// one. Each panellist starts from the same shared view (`punditRatings`) and
// adds an opinion of their own (PANELLIST_NOISE, their own seed), so they
// disagree the way a panel does: mostly about places, now and then about the
// whole thing. Pure and seeded, so the panel is the same every time it's opened.
export type Panellist = Pundit & {
  /** Where they have you (1-based, in the whole field). */
  youAt: number
  /** Their champion. */
  champion: { clubId: string; clubName: string; isPlayer: boolean }
  /** Their whole preview (P8-56's follow-up): table, points, surprises and
   *  disappointments, built exactly like the consensus's. */
  prediction: Prediction
  /** Their own view of every side (P8-165): what their whole tournament is played out from. */
  ratings: Map<string, number>
  /** The seed their three player picks are drawn with (`predictPlayers`), so
   *  each pundit names their own Player of the Season, top scorer and best
   *  under-21 once the squads are loaded. */
  picksSeed: number
}

export function punditPanel(teams: PredictionTeam[], seed: number, size = PANEL_SIZE, matchesPerClub?: number): Panellist[] {
  if (teams.length === 0) return []
  const shared = punditRatings(teams, seed)
  const pick = mulberry32(deriveSeed(seed, 0x9a4e1))
  const pool = [...PUNDITS]
  const chosen: Pundit[] = []
  const n = Math.min(size, pool.length)   // fixed first: the pool shrinks as pundits are drawn
  while (chosen.length < n) chosen.push(pool.splice(Math.floor(pick() * pool.length), 1)[0])
  const ordered = [...teams].sort((a, b) => a.clubId.localeCompare(b.clubId))
  return chosen.map((p, i) => {
    const own = mulberry32(deriveSeed(seed, 0x9a4e1 + i + 1))
    const rating = new Map(ordered.map(t => [t.clubId, shared.get(t.clubId)! + rngNoise(own) * PANELLIST_NOISE]))
    const prediction = tableFromRatings(teams, rating, seed, matchesPerClub)
    const top = prediction.table[0]
    return {
      ...p,
      youAt: prediction.player?.predicted ?? 0,
      champion: { clubId: top.clubId, clubName: top.clubName, isPlayer: top.isPlayer },
      prediction,
      ratings: rating,
      picksSeed: deriveSeed(seed, 0x9a4e1 + 100 + i),
    }
  })
}

/** P8-57, match by match: how the panel splits on one tie — each pundit backs
 *  the side they rank higher in their own table. The groups and the ties don't
 *  exist at the pundits screen, so this is asked of the panel when a tie comes. */
export function panelBacking(panel: Panellist[], aId: string, bId: string): { a: number; b: number } {
  let a = 0, b = 0
  for (const p of panel) {
    const pa = p.prediction.table.find(r => r.clubId === aId)?.predicted ?? 999
    const pb = p.prediction.table.find(r => r.clubId === bId)?.predicted ?? 999
    if (pa < pb) a++; else if (pb < pa) b++
  }
  return { a, b }
}

/** The line for it: "9 of 12 pundits back Arsenal", or a split panel. */
export function panelLineFor(panel: Panellist[], a: { clubId: string; clubName: string }, b: { clubId: string; clubName: string }): string | null {
  if (!panel.length) return null
  const { a: na, b: nb } = panelBacking(panel, a.clubId, b.clubId)
  if (na === nb) return `The panel is split down the middle, ${na} each.`
  const [n, side] = na > nb ? [na, a] : [nb, b]
  return `${n} of ${panel.length} pundits back ${side.clubName}.`
}

/** P8-150: where the panel had you, and out of how many, for the career's line
 *  against the pundits. The same consensus the verdict checks. */
export function punditsOnYouFor(teams: { clubId: string; clubName: string; ovr: number; isPlayer: boolean }[] | null | undefined, seed: number | null | undefined): { predicted: number; field: number } | null {
  if (!teams?.length || seed == null) return null
  const you = predictTable(teams.map(t => ({ clubId: t.clubId, clubName: t.clubName, ovr: t.ovr, isPlayer: t.isPlayer })), seed).player
  return you ? { predicted: you.predicted, field: teams.length } : null
}
