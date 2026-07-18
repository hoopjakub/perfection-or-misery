// Just-for-fun: how often does a fixed 88 OVR squad actually win the whole
// thing, per mode, per difficulty? Uses the REAL simulateMatch/simulateKnockout
// engine (same one the app plays with) with setMatchTilt set from the real
// difficulty model — this isn't a toy approximation of the odds, it's the odds.
//
// League/All-Time/Era/Chaos/Cursed and the World Cup reuse the actual production
// simulators (simulateSeason, simulateWorldCup) unmodified. Champions League
// (classic + full) don't have a single-call pure-engine entry point — building
// one here (36-team league phase table, then knockout) using the same
// simulateMatch/simulateKnockout primitives the real CL sim uses; it's a
// faithful shape (league phase → knockout ladder) but simplified versus the
// production pipeline in cl-sim.ts (no seeding pots, no real club pool). Full
// path additionally gauntlets two single-leg qualifying knockouts first.
//
// Run: npx tsx scripts/fun-88-ovr-odds.ts

import { simulateMatch, setMatchTilt } from '../src/engine/match'
import { simulateKnockout } from '../src/engine/knockout-match'
import { simulateSeason } from '../src/engine/simulation'
import { simulateWorldCup, assignGroups, type WCTeam } from '../src/engine/world-cup-sim'
import { generateFixtures } from '../src/engine/fixtures'
import { resolveDifficulty, tiltForLevel, type Difficulty } from '../src/engine/difficulty'
import type { SimTeam } from '../src/types/simulation'
import type { LeagueSeason, LeagueTeam } from '../src/types/game'

const PLAYER_OVR = 89
const TRIALS = 5000   // per mode per difficulty — knockouts are cheap, this runs in seconds

function baseTeam(ovr: number, isPlayer: boolean, id: string): SimTeam {
  return {
    clubId: id, clubName: isPlayer ? 'You' : id, ovr, isPlayer, form: 0,
    stats: { played: 0, won: 0, drawn: 0, lost: 0, goalsFor: 0, goalsAgainst: 0, points: 0 },
  }
}

// Realistic-ish opponent spread: mostly 74-90, with a handful of genuine elites
// so "winning it all" actually means beating some 90+ sides along the way.
function randomOpponentOvr(): number {
  const r = Math.random()
  if (r < 0.08) return 88 + Math.floor(Math.random() * 6)   // 88-93 elite
  if (r < 0.35) return 82 + Math.floor(Math.random() * 6)   // 82-87 strong
  return 72 + Math.floor(Math.random() * 12)                // 72-83 mid/lower
}

// ── League-shaped modes (All Time / League / Era / Chaos / Cursed) ─────────
// All five use the identical simulateSeason engine; only the tilt differs.
function buildLeague(teamCount = 20): LeagueSeason {
  const teams: LeagueTeam[] = [{ clubId: 'PLAYER', clubName: 'You', ovr: PLAYER_OVR, isPlayer: true }]
  for (let i = 1; i < teamCount; i++) teams.push({ clubId: `AI${i}`, clubName: `AI${i}`, ovr: randomOpponentOvr(), isPlayer: false })
  return { leagueId: 'fun', leagueName: 'Fun League', yearStart: 2025, gamesPerSeason: (teamCount - 1) * 2, teams, replacedTeamName: 'AI0' }
}

function leagueTitleRate(tilt: number, n = TRIALS): number {
  setMatchTilt(tilt)
  let wins = 0
  for (let i = 0; i < n; i++) {
    const result = simulateSeason(buildLeague())
    if (result.finalPosition === 1) wins++
  }
  return wins / n
}

// ── World Cup — the real 48-team group+R32 KO simulator ─────────────────────
function buildWcTeams(n = 48): WCTeam[] {
  const teams: WCTeam[] = []
  for (let i = 0; i < n; i++) {
    const isPlayer = i === 0
    teams.push({
      ...baseTeam(isPlayer ? PLAYER_OVR : randomOpponentOvr(), isPlayer, isPlayer ? 'PLAYER' : `AI${i}`),
      confederation: 'X', groupId: '', groupPoints: 0, groupWins: 0, groupDraws: 0, groupLosses: 0,
      groupGF: 0, groupGA: 0, groupPlayed: 0,
    })
  }
  return teams
}

function wcTitleRate(tilt: number, n = TRIALS): number {
  setMatchTilt(tilt)
  let wins = 0
  for (let i = 0; i < n; i++) {
    const teams = buildWcTeams()
    assignGroups(teams)   // mutates each team's groupId + slots it into a group in place
    const result = simulateWorldCup(teams)
    if (result.winner.isPlayer) wins++
  }
  return wins / n
}

// ── Champions League — simplified but faithful shape ────────────────────────
// League phase: everyone plays 8 games vs random opponents, ranked by points.
// Real UCL: top 8 go straight to R16, 9-24 play a knockout playoff into R16,
// 25-36 are out. Then single-elimination R16 → QF → SF → Final, each tie a real
// two-leg-equivalent (using simulateKnockout as a single decisive leg — a fun
// script's stand-in for the production two-leg system in cl-sim.ts).
function playLeaguePhase(n = 36): { table: SimTeam[]; player: SimTeam } {
  const teams: SimTeam[] = [baseTeam(PLAYER_OVR, true, 'PLAYER')]
  for (let i = 1; i < n; i++) teams.push(baseTeam(randomOpponentOvr(), false, `AI${i}`))
  const stats = new Map(teams.map(t => [t.clubId, { pts: 0 }]))
  for (const t of teams) {
    const opponents = [...teams].filter(o => o !== t).sort(() => Math.random() - 0.5).slice(0, 8)
    for (const opp of opponents) {
      const home = Math.random() < 0.5
      const r = home ? simulateMatch(t, opp) : simulateMatch(opp, t)
      const tWon = home ? r.outcome === 'home' : r.outcome === 'away'
      const oWon = home ? r.outcome === 'away' : r.outcome === 'home'
      if (tWon) stats.get(t.clubId)!.pts += 3
      else if (oWon) stats.get(opp.clubId)!.pts += 3
      else { stats.get(t.clubId)!.pts += 1; stats.get(opp.clubId)!.pts += 1 }
    }
  }
  const table = [...teams].sort((a, b) => stats.get(b.clubId)!.pts - stats.get(a.clubId)!.pts)
  return { table, player: teams[0] }
}

function playKnockoutLadder(qualifiers: SimTeam[]): SimTeam | null {
  let round = [...qualifiers].sort(() => Math.random() - 0.5)
  while (round.length > 1) {
    const winners: SimTeam[] = []
    for (let i = 0; i < round.length; i += 2) {
      const home = Math.random() < 0.5
      const a = round[i], b = round[i + 1]
      const res = home ? simulateKnockout(a, b) : simulateKnockout(b, a)
      winners.push(res.winner === 'home' ? (home ? a : b) : (home ? b : a))
    }
    round = winners
  }
  return round[0] ?? null
}

function clClassicTitleRate(tilt: number, n = TRIALS): number {
  setMatchTilt(tilt)
  let wins = 0
  for (let i = 0; i < n; i++) {
    const { table, player } = playLeaguePhase(36)
    const pos = table.indexOf(player) + 1
    if (pos > 24) continue   // eliminated in league phase
    // top 8 go straight to R16; 9-24 face a single playoff knockout into R16 first
    let ladder = table.slice(0, 8)
    const playoffField = table.slice(8, 24)
    const playoffWinners: SimTeam[] = []
    for (let j = 0; j < playoffField.length; j += 2) {
      const a = playoffField[j], b = playoffField[j + 1]
      const res = simulateKnockout(a, b)
      playoffWinners.push(res.winner === 'home' ? a : b)
    }
    ladder = [...ladder, ...playoffWinners].sort(() => Math.random() - 0.5)
    if (!ladder.includes(player)) continue   // lost the playoff
    const champion = playKnockoutLadder(ladder)
    if (champion === player) wins++
  }
  return wins / n
}

// Full custom path: two extra single-leg qualifying rounds against tough
// opposition before the same league-phase-into-knockout ladder as classic.
function clFullTitleRate(tilt: number, n = TRIALS): number {
  setMatchTilt(tilt)
  let wins = 0
  for (let i = 0; i < n; i++) {
    const player = baseTeam(PLAYER_OVR, true, 'PLAYER')
    let alive = true
    for (let q = 0; q < 2 && alive; q++) {
      const opp = baseTeam(randomOpponentOvr(), false, `Q${q}`)
      const res = simulateKnockout(player, opp)
      alive = res.winner === 'home'
    }
    if (!alive) continue
    // qualified into the league phase alongside 35 others
    const { table, player: fieldPlayer } = playLeaguePhase(36)
    // swap in the qualified player at their natural OVR position (table already
    // includes a slot-0 player; reuse that slot's identity for the ladder logic)
    const pos = table.indexOf(fieldPlayer) + 1
    if (pos > 24) continue
    let ladder = table.slice(0, 8)
    const playoffField = table.slice(8, 24)
    const playoffWinners: SimTeam[] = []
    for (let j = 0; j < playoffField.length; j += 2) {
      const a = playoffField[j], b = playoffField[j + 1]
      const res = simulateKnockout(a, b)
      playoffWinners.push(res.winner === 'home' ? a : b)
    }
    ladder = [...ladder, ...playoffWinners].sort(() => Math.random() - 0.5)
    if (!ladder.includes(fieldPlayer)) continue
    const champion = playKnockoutLadder(ladder)
    if (champion === fieldPlayer) wins++
  }
  return wins / n
}

// ── Report ───────────────────────────────────────────────────────────────────
const pct = (x: number) => `${(x * 100).toFixed(2)}%`

const BASE_DIFFICULTIES: Difficulty[] = ['easy', 'medium', 'hard']
const CUSTOM_LEVELS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]

console.log(`\n🏆 An ${PLAYER_OVR}-OVR squad's title odds, by mode and difficulty (${TRIALS.toLocaleString()} trials each)\n`)

console.log('── League-shaped modes (All Time / League / Era) ──')
for (const diff of BASE_DIFFICULTIES) {
  const tilt = resolveDifficulty(diff, null).tilt
  console.log(`  ${diff.padEnd(7)} title rate: ${pct(leagueTitleRate(tilt))}`)
}
console.log('  (Chaos/Cursed use the medium tilt — no difficulty knob of their own — so their odds match "medium" above.)')

console.log('\n── World Cup ──')
for (const diff of BASE_DIFFICULTIES) {
  const tilt = resolveDifficulty(diff, null).tilt
  console.log(`  ${diff.padEnd(7)} title rate: ${pct(wcTitleRate(tilt))}`)
}

console.log('\n── Champions League (Classic — finals only) ──')
for (const diff of BASE_DIFFICULTIES) {
  const tilt = resolveDifficulty(diff, null).tilt
  console.log(`  ${diff.padEnd(7)} title rate: ${pct(clClassicTitleRate(tilt))}`)
}

console.log('\n── Champions League (Full — qualifying gauntlet first) ──')
for (const diff of BASE_DIFFICULTIES) {
  const tilt = resolveDifficulty(diff, null).tilt
  console.log(`  ${diff.padEnd(7)} title rate: ${pct(clFullTitleRate(tilt))}`)
}

console.log(`\n── Custom difficulty — screw-levels ${CUSTOM_LEVELS.join(', ')} across every mode ──`)
console.log('(rerolls/ratings toggles only affect the DRAFT, not match odds — so this sweeps screw-level, the one custom knob that moves the tilt)')
for (const level of CUSTOM_LEVELS) {
  const tilt = tiltForLevel(level)
  const league = leagueTitleRate(tilt, 10000)
  const wc     = wcTitleRate(tilt, 10000)
  const clC    = clClassicTitleRate(tilt, 10000)
  const clF    = clFullTitleRate(tilt, 10000)
  console.log(`  L${String(level).padStart(2)} (tilt ${tilt.toFixed(1).padStart(6)}): League ${pct(league).padStart(7)} | WC ${pct(wc).padStart(7)} | CL Classic ${pct(clC).padStart(7)} | CL Full ${pct(clF).padStart(7)}`)
}

console.log('\nDone. Numbers will jitter a little run to run — it\'s a simulation, not a lookup table. 🎲\n')
