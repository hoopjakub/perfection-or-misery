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

import { mulberry32, rngNoise, type Rng } from '@/lib/rng'

export const PREDICTION_NOISE = 3

export type PredictionTeam = { clubId: string; clubName: string; ovr: number; isPlayer: boolean }

export type PredictedRow = PredictionTeam & {
  predicted: number      // 1-based place the pundits give
  strengthRank: number   // 1-based place by OVR alone
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

export function predictTable(teams: PredictionTeam[], seed: number, noise = PREDICTION_NOISE): Prediction {
  const rng: Rng = mulberry32(seed)
  // Noise is drawn in clubId order, so the input order never changes the result.
  const ordered = [...teams].sort((a, b) => a.clubId.localeCompare(b.clubId))
  const pundit = new Map(ordered.map(t => [t.clubId, t.ovr + rngNoise(rng) * noise]))

  const byStrength = [...ordered].sort((a, b) => b.ovr - a.ovr || a.clubId.localeCompare(b.clubId))
  const strengthRank = new Map(byStrength.map((t, i) => [t.clubId, i + 1]))

  const table: PredictedRow[] = [...ordered]
    .sort((a, b) => pundit.get(b.clubId)! - pundit.get(a.clubId)! || a.clubId.localeCompare(b.clubId))
    .map((t, i) => ({ ...t, predicted: i + 1, strengthRank: strengthRank.get(t.clubId)! }))

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
