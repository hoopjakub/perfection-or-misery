// verify-strength.ts — one strength scale (Wave G audit, docs/audit-2026-10/02
// G-L3, checks C-2 and C-3).
//
// A club's strength (club_seasons.historical_ovr) and your XI's (calcTeamOvr)
// meet in the same match formula, so they must be the same measurement. Until
// 3 October 2026 they weren't: clubs were their best 14 stretched ×1.55 around
// 81, and the XI drafted from a club's own best eleven came out −6 to +4 away.
//
// C-2: for every club-season in the bundled database, draft its best eleven
//      into the app's real 4-3-3 slots (getSlotsForFormation, not the copy in
//      rating.ts) and rate it with calcTeamOvr. It must land within 1 of the
//      stored strength. The pick here is independent of clubStrength's: the
//      best of 60 random fill orders, so it also bounds what the greedy pick
//      in rating.ts gives away.
// C-3: placement still works on the new scale: printed as a table (how many
//      league-seasons take an XI of each strength), and checked so a drafted
//      copy of a league's best club is eligible for that league.
//
// Run: npx tsx scripts/verify-strength.ts   (POM_DB=path to test another file)

import Database from 'better-sqlite3'
import { calcTeamOvr, positionPenalty } from '../src/engine/rating'
import { getSlotsForFormation } from '../src/engine/formations'
import { mulberry32, shuffle } from '../src/lib/rng'
import type { DraftedPlayer } from '../src/types/game'

let failures = 0
function check(cond: boolean, msg: string) { if (!cond) { failures++; console.log(`❌ ${msg}`) } }

const db = new Database(process.env.POM_DB ?? 'assets/db/players_v5.db', { readonly: true })
type Row = { cs: string; club: string; league: string; year: number; strength: number; ovr: number; pos: string }
const rows = db.prepare(`
  SELECT cs.id AS cs, c.name AS club, c.league_id AS league, cs.year_start AS year,
         cs.historical_ovr AS strength, ps.ovr AS ovr, p.primary_position AS pos
  FROM club_seasons cs JOIN clubs c ON c.id = cs.club_id
  JOIN player_seasons ps ON ps.club_season_id = cs.id
  JOIN players p ON p.id = ps.player_id`).all() as Row[]

const byCs = new Map<string, Row[]>()
for (const r of rows) (byCs.get(r.cs) ?? byCs.set(r.cs, []).get(r.cs)!).push(r)

const slots = getSlotsForFormation('4-3-3')
const rng = mulberry32(20261003)

function bestXi(players: Row[]): number {
  let best = -Infinity
  for (let k = 0; k < 60; k++) {
    // A fixed seed, so runs agree.
    const order = shuffle(rng, slots.map(s => s.slotIndex))
    const used = new Set<number>()
    const xi: DraftedPlayer[] = []
    for (const s of order) {
      let pick = -1, pickEff = -Infinity
      players.forEach((p, i) => {
        if (used.has(i)) return
        const pen = positionPenalty(p.pos, slots[s].primary)
        const eff = pen === null ? p.ovr - 106 : p.ovr - pen
        if (eff > pickEff) { pick = i; pickEff = eff }
      })
      if (pick < 0) break
      used.add(pick)
      xi.push({ ovr: players[pick].ovr, primaryPosition: players[pick].pos, slotIndex: s } as unknown as DraftedPlayer)
    }
    best = Math.max(best, calcTeamOvr(xi, slots))
  }
  return best
}

// ── C-2 · one scale ─────────────────────────────────────────────────────────
const gaps: { gap: number; label: string }[] = []
for (const [, ps] of byCs) {
  if (ps.length < 11) continue
  const xi = bestXi(ps)
  gaps.push({ gap: ps[0].strength - xi, label: `${ps[0].club} ${ps[0].year}` })
}
gaps.sort((a, b) => a.gap - b.gap)
const off = gaps.filter(g => Math.abs(g.gap) > 1)
const pct = (q: number) => gaps[Math.min(gaps.length - 1, Math.floor(q * gaps.length))].gap
console.log(`C-2 · ${gaps.length} club-seasons: stored strength minus its own best XI — min ${gaps[0].gap}, p5 ${pct(0.05)}, median ${pct(0.5)}, p95 ${pct(0.95)}, max ${gaps[gaps.length - 1].gap}`)
console.log(`C-2 · outside ±1: ${off.length}${off.length ? ` (e.g. ${off.slice(0, 3).concat(off.slice(-3)).map(g => `${g.label} ${g.gap > 0 ? '+' : ''}${g.gap}`).join(', ')})` : ''}`)
check(off.length === 0, `C-2: ${off.length} club-seasons are rated more than 1 away from their own best XI`)

// ── C-3 · placement on the new scale ────────────────────────────────────────
// placement.ts: a league-season takes your XI when XI ≤ its top-four average + 8.
const DOMINANCE_MARGIN = 8
const leagueSeasons = new Map<string, number[]>()
for (const [, ps] of byCs) {
  const r = ps[0]
  if (['champions_league', 'europa_league', 'conference_league', 'world_cup'].includes(r.league) || r.league.startsWith('cucl_')) continue
  const k = `${r.league} ${r.year}`
  ;(leagueSeasons.get(k) ?? leagueSeasons.set(k, []).get(k)!).push(r.strength)
}
const top4 = [...leagueSeasons.values()].map(xs => { const t = [...xs].sort((a, b) => b - a).slice(0, 4); return t.reduce((s, x) => s + x, 0) / t.length })
const table = [70, 75, 80, 85, 88, 90, 92, 95].map(o => `${o}: ${top4.filter(t => o <= t + DOMINANCE_MARGIN).length}`).join(' · ')
console.log(`C-3 · league-seasons that take an XI of each strength (of ${top4.length}): ${table}`)
// 02 §6's C-3: a drafted copy of a league's best club (its own best XI, which
// C-2 holds to within 1 of its strength) is eligible for that very league.
const shut = [...leagueSeasons.entries()].filter(([, xs]) => {
  const t = [...xs].sort((a, b) => b - a)
  return t[0] + 1 > t.slice(0, 4).reduce((s, x) => s + x, 0) / Math.min(4, t.length) + DOMINANCE_MARGIN
})
check(shut.length === 0, `C-3: a copy of the best club is shut out of its own league in ${shut.map(([k]) => k).join(', ')}`)

console.log(failures === 0 ? '✅ ALL CHECKS PASSED' : `${failures} check(s) failed`)
process.exit(failures === 0 ? 0 : 1)
