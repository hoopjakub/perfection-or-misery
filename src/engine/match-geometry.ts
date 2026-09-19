/**
 * Where things happened on the pitch (P4-H): a shot map, each player's average
 * position and a heat map — the FotMob/SofaScore surfaces the match screen
 * didn't have.
 *
 * A TEXTURE LAYER ON TOP OF THE SHEET, like the sheet is on top of the result.
 * Nothing here decides anything: every count comes from the already-generated
 * match sheet (who shot, how many were on target, which were goals, how many
 * the team had inside the box, blocked, off the woodwork), and this only gives
 * each of them a place. It draws from its own seeded stream, derived from the
 * match seed, so adding it can never move a number on the existing sheet, and
 * the same match draws the same map every time it's opened.
 *
 * Coordinates are fractions of the pitch: `x` across (0 left touchline, 1
 * right), `y` along the attacking direction (0 own goal line, 1 the goal being
 * attacked). A team's shots are always drawn attacking y = 1.
 */

import type { MatchStats, PlayerMatchLine, MatchEvent } from '@/types/match-stats'
import type { Formation } from '@/types/game'
import { getFormationRows } from './formations'
import { mulberry32, deriveSeed, rngNoise, type Rng } from '@/lib/rng'

const GEOMETRY_SALT = 0x5ea7f1e1

// ── Shots ────────────────────────────────────────────────────────────────────
export type ShotOutcome = 'goal' | 'saved' | 'off' | 'blocked' | 'woodwork'
export type Shot = {
  playerId: string; name: string; isHome: boolean
  x: number; y: number
  outcome: ShotOutcome
  xg: number
  penalty?: boolean
  insideBox: boolean
}

// The box, as fractions of a 105 x 68 pitch.
const BOX_DEPTH = 16.5 / 105
const BOX_HALF_WIDTH = 20.16 / 68
const PEN_SPOT = 11 / 105

// A chance's quality from where it was taken: close and central is good,
// wide and far is hopeful. Scaled per team afterwards to the sheet's xG.
function rawXg(x: number, y: number): number {
  const dist = (1 - y) * 105                      // metres from the goal line
  const lateral = Math.abs(x - 0.5) * 68          // metres from the centre line
  const d = Math.hypot(dist, lateral)
  const angle = Math.atan2(7.32 * dist, dist * dist + lateral * lateral - (7.32 / 2) ** 2)
  return Math.max(0.01, Math.min(0.7, 0.9 * Math.exp(-d / 9) + 0.35 * Math.max(0, angle) - 0.02))
}

function spot(rng: Rng, inside: boolean, goal: boolean): { x: number; y: number } {
  if (inside) {
    // Goals come from closer in than a typical shot in the box.
    const depth = goal ? 0.02 + rng() * BOX_DEPTH * 0.7 : 0.02 + rng() * BOX_DEPTH * 0.95
    const half = goal ? BOX_HALF_WIDTH * 0.6 : BOX_HALF_WIDTH * 0.95
    return { x: 0.5 + (rng() * 2 - 1) * half, y: 1 - depth }
  }
  const depth = BOX_DEPTH + 0.01 + rng() * 0.17
  return { x: 0.5 + rngNoise(rng) * 0.32, y: 1 - depth }
}

export function buildShotMap(detail: MatchStats, seed: number): Shot[] {
  const rng = mulberry32(deriveSeed(seed, GEOMETRY_SALT))
  const shots: Shot[] = []
  for (const isHome of [true, false]) {
    const team = isHome ? detail.home : detail.away
    const penaltyScorers = detail.events.filter(e => e.type === 'goal' && e.penalty && e.isHome === isHome && !e.ownGoal).map(e => e.playerId)
    const missedPens = detail.events.filter(e => e.type === 'penMissed' && e.isHome === isHome)
    const side: Shot[] = []
    // Players in a stable order, so the map never depends on the sheet's order.
    const players = detail.players.filter(p => p.isHome === isHome && p.shots > 0)
      .sort((a, b) => a.playerId.localeCompare(b.playerId))
    for (const p of players) {
      const pens = penaltyScorers.filter(id => id === p.playerId).length
      const openGoals = Math.max(0, p.goals - pens)
      const saved = Math.max(0, p.shotsOnTarget - p.goals)
      const wide = Math.max(0, p.shots - p.shotsOnTarget)
      for (let i = 0; i < pens; i++) side.push({ playerId: p.playerId, name: p.name, isHome, x: 0.5, y: 1 - PEN_SPOT, outcome: 'goal', xg: 0.76, penalty: true, insideBox: true })
      for (let i = 0; i < openGoals; i++) side.push({ playerId: p.playerId, name: p.name, isHome, x: 0, y: 0, outcome: 'goal', xg: 0, insideBox: true })
      for (let i = 0; i < saved; i++) side.push({ playerId: p.playerId, name: p.name, isHome, x: 0, y: 0, outcome: 'saved', xg: 0, insideBox: false })
      for (let i = 0; i < wide; i++) side.push({ playerId: p.playerId, name: p.name, isHome, x: 0, y: 0, outcome: 'off', xg: 0, insideBox: false })
    }
    // A missed penalty is one of the taker's own shots: a saved one if the
    // keeper kept it out, an off-target one otherwise — so the counts hold.
    for (const m of missedPens) {
      const want: ShotOutcome = m.saved ? 'saved' : 'off'
      const i = side.findIndex(s => s.playerId === m.playerId && !s.penalty && s.outcome === want)
      if (i >= 0) side[i] = { ...side[i], x: 0.5, y: 1 - PEN_SPOT, xg: 0.76, penalty: true, insideBox: true }
    }

    // The team sheet says how many of the non-target shots were blocked and
    // how many hit the woodwork; hand those out among the "off" shots.
    const wideIdx = side.map((s, i) => (s.outcome === 'off' && !s.penalty ? i : -1)).filter(i => i >= 0)
    let blocked = Math.min(team.shotsBlocked ?? 0, wideIdx.length)
    let wood = Math.min(team.shotsWoodwork ?? 0, wideIdx.length - blocked)
    for (const i of wideIdx) {
      if (wood > 0 && rng() < wood / Math.max(1, wideIdx.length)) { side[i].outcome = 'woodwork'; wood--; continue }
      if (blocked > 0 && rng() < 0.6) { side[i].outcome = 'blocked'; blocked-- }
    }

    // Inside or outside the box, matching the team's count: goals first (they
    // almost always come from inside), then the rest at random.
    const needInside = Math.max(0, Math.min(team.shotsInsideBox ?? side.length, side.length))
    let inside = side.filter(s => s.insideBox).length
    const order = side.map((s, i) => ({ s, i, key: (s.outcome === 'goal' ? 0 : 1) + rng() })).sort((a, b) => a.key - b.key)
    for (const { s } of order) {
      if (s.penalty || s.insideBox) continue
      if (inside < needInside) { s.insideBox = true; inside++ }
    }
    for (const s of side) {
      if (s.penalty) continue
      const at = spot(rng, s.insideBox, s.outcome === 'goal')
      s.x = Math.max(0.05, Math.min(0.95, at.x)); s.y = at.y
      s.xg = rawXg(s.x, s.y)
    }
    // Scale the chances so the team's shots add up to the sheet's xG. A
    // penalty keeps its usual weight unless the sheet's whole xG is smaller
    // than that — the sheet is the truth, so the penalties shrink to fit.
    const pens = side.filter(s => s.penalty)
    const penXg = pens.reduce((a, s) => a + s.xg, 0)
    if (penXg > team.xg * 0.85 && pens.length) for (const s of pens) s.xg = Math.round((team.xg * 0.85 / pens.length) * 100) / 100
    const penNow = pens.reduce((a, s) => a + s.xg, 0)
    // Water-fill: scale the open shots to the target, and whatever a capped shot
    // can't hold (0.95 is the most any one chance is worth) moves to the rest.
    const open = side.filter(s => !s.penalty)
    let target = Math.max(0, team.xg - penNow)
    let free = [...open]
    for (let pass = 0; pass < 6 && free.length && target > 0.001; pass++) {
      const sum = free.reduce((a, s) => a + s.xg, 0)
      const k = sum > 0 ? target / sum : 0
      const capped = free.filter(s => s.xg * k >= 0.95)
      if (!capped.length) { for (const s of free) s.xg *= k; target = 0; break }
      for (const s of capped) { s.xg = 0.95; target -= 0.95 }
      free = free.filter(s => !capped.includes(s))
    }
    for (const s of open) s.xg = Math.round(Math.min(0.95, s.xg) * 100) / 100
    shots.push(...side)
  }
  return shots
}

// ── Average positions ────────────────────────────────────────────────────────
export type PlayerSpot = { playerId: string; name: string; isHome: boolean; x: number; y: number; label: string; minutes: number }

/** Each row of a formation, attack first, laid down the pitch; GK at the bottom. */
function slotSpots(formation: Formation): { label: string; x: number; y: number }[] {
  const rows = getFormationRows(formation)
  const out: { label: string; x: number; y: number }[] = []
  rows.forEach((row, r) => {
    const y = 0.08 + ((rows.length - 1 - r) / Math.max(1, rows.length - 1)) * 0.74
    row.forEach((label, i) => out.push({ label, x: (i + 1) / (row.length + 1), y }))
  })
  return out
}

// How far a role drifts from its slot on average: full-backs push on, wingers
// hug the line, keepers barely move.
const DRIFT: Record<string, { dx: number; dy: number; spread: number }> = {
  GK: { dx: 0, dy: 0.02, spread: 0.01 },
  LB: { dx: -0.03, dy: 0.1, spread: 0.04 }, RB: { dx: 0.03, dy: 0.1, spread: 0.04 },
  LWB: { dx: -0.04, dy: 0.12, spread: 0.04 }, RWB: { dx: 0.04, dy: 0.12, spread: 0.04 },
  LW: { dx: -0.04, dy: 0.02, spread: 0.05 }, RW: { dx: 0.04, dy: 0.02, spread: 0.05 },
}

export function averagePositions(detail: MatchStats, seed: number): PlayerSpot[] {
  const rng = mulberry32(deriveSeed(seed, GEOMETRY_SALT + 1))
  const out: PlayerSpot[] = []
  for (const isHome of [true, false]) {
    const shape = isHome ? detail.homeShape : detail.awayShape
    if (!shape) continue
    const spots = slotSpots(shape.formation as Formation)
    const byId = new Map(detail.players.map(p => [p.playerId, p]))
    const left = [...spots]
    const slotOf = new Map<string, { label: string; x: number; y: number }>()
    for (const sl of shape.slots) {
      const i = left.findIndex(s => s.label === sl.label)
      if (i >= 0) slotOf.set(sl.playerId, left.splice(i, 1)[0])
    }
    // A substitute plays where the man he replaced was.
    for (const e of detail.events) {
      if (e.type === 'sub' && e.isHome === isHome && e.offPlayerId && slotOf.has(e.offPlayerId)) slotOf.set(e.playerId, slotOf.get(e.offPlayerId)!)
    }
    for (const [playerId, base] of [...slotOf.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
      const p = byId.get(playerId)
      if (!p || p.minutes <= 0) continue
      const d = DRIFT[base.label] ?? { dx: 0, dy: 0.03, spread: 0.035 }
      out.push({
        playerId, name: p.name, isHome, label: base.label, minutes: p.minutes,
        x: Math.max(0.04, Math.min(0.96, base.x + d.dx + rngNoise(rng) * d.spread)),
        y: Math.max(0.03, Math.min(0.95, base.y + d.dy + rngNoise(rng) * d.spread)),
      })
    }
  }
  return out
}

// ── Heat maps ────────────────────────────────────────────────────────────────
export const HEAT_COLS = 10
export const HEAT_ROWS = 14

/** Where one player spent the match: a grid of 0–1 intensities, attack at the top. */
export function heatMap(player: PlayerMatchLine, spot: PlayerSpot | undefined, seed: number): number[][] {
  const rng = mulberry32(deriveSeed(seed, GEOMETRY_SALT + 2 + hashId(player.playerId)))
  const grid = Array.from({ length: HEAT_ROWS }, () => Array(HEAT_COLS).fill(0) as number[])
  if (!spot || player.minutes <= 0) return grid
  // Busier players cover more ground; forwards also get a second patch nearer goal.
  const reach = 0.09 + Math.min(0.1, player.touches / 900)
  const blobs = [{ x: spot.x, y: spot.y, w: 1 }]
  if (spot.y > 0.55 || player.touchesInOppBox > 3) blobs.push({ x: 0.5 + (spot.x - 0.5) * 0.6, y: Math.min(0.93, spot.y + 0.14), w: 0.6 })
  for (let k = 0; k < 3; k++) blobs.push({ x: spot.x + rngNoise(rng) * 0.12, y: spot.y + rngNoise(rng) * 0.12, w: 0.4 })
  let max = 0
  for (let r = 0; r < HEAT_ROWS; r++) {
    for (let c = 0; c < HEAT_COLS; c++) {
      const cx = (c + 0.5) / HEAT_COLS, cy = 1 - (r + 0.5) / HEAT_ROWS
      let v = 0
      for (const b of blobs) v += b.w * Math.exp(-(((cx - b.x) ** 2) + ((cy - b.y) ** 2)) / (2 * reach * reach))
      grid[r][c] = v
      if (v > max) max = v
    }
  }
  return grid.map(row => row.map(v => (max > 0 ? Math.round((v / max) * 100) / 100 : 0)))
}

function hashId(id: string): number {
  let h = 0
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0
  return h % 100000
}

export type { MatchEvent }
