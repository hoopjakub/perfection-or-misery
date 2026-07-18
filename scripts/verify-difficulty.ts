// Verifies the unified difficulty model:
//  - the screw-level → tilt curve shifts the PLAYER's win-rate monotonically
//    (baby easiest, absolute misery hardest) while never touching AI-vs-AI games
//  - the base presets (easy/medium/hard = levels 2/4/6) are a touch harder than
//    the old +4/0/−4 values, so an easy run isn't a total walk
//  - hardness hits its 0..11 endpoints and the score multiplier is monotonic
// Run: npx tsx scripts/verify-difficulty.ts

import { simulateMatch, setMatchTilt } from '../src/engine/match'
import {
  tiltForLevel, resolveDifficulty, hardnessOf, scoreMultiplierFor, type CustomDifficulty,
} from '../src/engine/difficulty'
import type { SimTeam } from '../src/types/simulation'

function team(ovr: number, isPlayer: boolean): SimTeam {
  return {
    clubId: isPlayer ? 'PLAYER' : `AI${ovr}_${Math.random()}`,
    clubName: isPlayer ? 'You' : 'AI',
    ovr, isPlayer, form: 0,
    stats: { played: 0, won: 0, drawn: 0, lost: 0, goalsFor: 0, goalsAgainst: 0, points: 0 },
  }
}

// Player win-rate vs an equal AI at a given screw-level.
function playerWinRateAtLevel(level: number, playerOvr = 85, aiOvr = 85, n = 30000): number {
  setMatchTilt(tiltForLevel(level))
  let wins = 0
  for (let i = 0; i < n; i++) {
    const home = i % 2 === 0
    const p = team(playerOvr, true), a = team(aiOvr, false)
    const r = home ? simulateMatch(p, a) : simulateMatch(a, p)
    if (home ? r.outcome === 'home' : r.outcome === 'away') wins++
  }
  return wins / n
}

// AI-vs-AI — the tilt must never touch this.
function aiWinRate(level: number, n = 30000): number {
  setMatchTilt(tiltForLevel(level))
  let aWins = 0
  for (let i = 0; i < n; i++) {
    const home = i % 2 === 0
    const A = team(85, false), B = team(85, false)
    const r = home ? simulateMatch(A, B) : simulateMatch(B, A)
    if (home ? r.outcome === 'home' : r.outcome === 'away') aWins++
  }
  return aWins / n
}

// 89-rated side winning a 5-round WC knockout vs an 84–88 field, at a level.
function knockoutTitleRate(level: number, n = 15000): number {
  setMatchTilt(tiltForLevel(level))
  let titles = 0
  for (let i = 0; i < n; i++) {
    let alive = true
    for (let round = 0; round < 5 && alive; round++) {
      const oppOvr = 84 + Math.floor(Math.random() * 5)
      const home = Math.random() < 0.5
      const p = team(89, true), a = team(oppOvr, false)
      const r = home ? simulateMatch(p, a) : simulateMatch(a, p)
      const won = home ? r.outcome === 'home' : r.outcome === 'away'
      alive = won || (r.outcome === 'draw' && Math.random() < 0.5)
    }
    if (alive) titles++
  }
  return titles / n
}

const pct = (x: number) => `${(x * 100).toFixed(1)}%`
let failures = 0
function check(cond: boolean, msg: string) { if (!cond) { console.log('❌', msg); failures++ } }

// ── 1) Win-rate curve across all 10 levels ──────────────────────────────────
console.log('Player win-rate vs equal (85 v 85) by screw-level:')
const winByLevel: number[] = []
for (let lvl = 1; lvl <= 10; lvl++) {
  const w = playerWinRateAtLevel(lvl)
  winByLevel[lvl] = w
  console.log(`  L${lvl} (tilt ${tiltForLevel(lvl).toFixed(1).padStart(5)}): ${pct(w)}`)
}
// Monotonic decreasing (allow tiny sampling noise).
for (let lvl = 2; lvl <= 10; lvl++) {
  check(winByLevel[lvl] <= winByLevel[lvl - 1] + 0.015, `win-rate should not rise from L${lvl - 1}→L${lvl} (${pct(winByLevel[lvl - 1])}→${pct(winByLevel[lvl])})`)
}
// vs EQUAL opposition, draws (~25%) cap any win-rate near 50% — so "easy" shows
// up as the highest point on the curve, not as a >55% blowout. The real cakewalk
// test is a strong side steamrolling a WC field on baby mode (checked in §4).
check(winByLevel[1] === Math.max(...winByLevel.slice(1)) && winByLevel[1] > 0.45, `baby mode (L1) should top the curve (got ${pct(winByLevel[1])})`)
check(winByLevel[10] < 0.20, `absolute misery (L10) should be brutal vs equal (got ${pct(winByLevel[10])})`)

// ── 2) Base presets a bit harder than the old +4/0/−4 ───────────────────────
// old easy +4 was ~49% vs equal; easy is now level 2 (tilt +2.5) → a few pts lower.
console.log(`Presets vs equal — easy(L2) ${pct(winByLevel[2])} | medium(L4) ${pct(winByLevel[4])} | hard(L6) ${pct(winByLevel[6])}`)
check(winByLevel[2] < 0.49, `easy should now be a touch harder than the old +4 (~49%), got ${pct(winByLevel[2])}`)
check(winByLevel[4] < winByLevel[2] && winByLevel[6] < winByLevel[4], 'medium must be harder than easy, hard harder than medium')

// ── 3) AI-vs-AI unaffected ──────────────────────────────────────────────────
const aiLow = aiWinRate(1), aiHigh = aiWinRate(10)
console.log(`AI-vs-AI at L1 ${pct(aiLow)} vs L10 ${pct(aiHigh)} (must be ~equal)`)
check(Math.abs(aiLow - aiHigh) < 0.02, 'AI-vs-AI win-rate must not move with the difficulty tilt')

// ── 4) WC title rate: strong side across easy/medium/hard ───────────────────
const koBaby = knockoutTitleRate(1), koEasy = knockoutTitleRate(2), koMed = knockoutTitleRate(4), koHard = knockoutTitleRate(6)
console.log(`89-side WC title rate — baby ${pct(koBaby)} | easy ${pct(koEasy)} | medium ${pct(koMed)} | hard ${pct(koHard)}`)
check(koEasy > koMed && koMed > koHard, 'WC title rate must fall easy → medium → hard')
// Baby mode is the easiest rung, but a 5-round KO vs a strong 84–88 field is
// still a gauntlet — "easiest available", not "guaranteed", and clearly >> medium.
check(koBaby > 0.14 && koBaby > koEasy, `baby mode should be the easiest WC (got ${pct(koBaby)} vs easy ${pct(koEasy)})`)

// ── 5) Hardness endpoints + score multiplier ────────────────────────────────
console.log('Hardness + score multiplier:')
const easiest = hardnessOf(1, 10, false)   // baby + 10 rerolls + ratings shown
const hardest = hardnessOf(10, 0, true)    // misery + 0 rerolls + ratings hidden
console.log(`  easiest possible = ${easiest.toFixed(1)}/10  ·  hardest possible = ${hardest.toFixed(1)}/10`)
check(Math.abs(easiest - 0) < 0.001, `easiest hardness should be 0.0 (got ${easiest})`)
check(Math.abs(hardest - 11) < 0.001, `hardest hardness should be 11.0 (got ${hardest})`)

// preset hardness + multipliers, and the reroll penalty specifically
const presets: Record<string, ReturnType<typeof resolveDifficulty>> = {
  easy:   resolveDifficulty('easy', null),
  medium: resolveDifficulty('medium', null),
  hard:   resolveDifficulty('hard', null),
}
for (const [name, r] of Object.entries(presets)) {
  console.log(`  ${name.padEnd(6)} hardness ${r.hardness.toFixed(1)}  ×${r.scoreMultiplier.toFixed(2)}`)
}
check(presets.easy.scoreMultiplier < 1 && presets.hard.scoreMultiplier > 1, 'easy must score below 1×, hard above 1×')
check(presets.easy.scoreMultiplier < presets.medium.scoreMultiplier && presets.medium.scoreMultiplier < presets.hard.scoreMultiplier, 'score multiplier must climb easy → medium → hard')

// reroll slider bite: 0 vs 10 rerolls at the same level/ratings
const rr0:  CustomDifficulty = { rerolls: 0,  ratingsShown: true, screwLevel: 5 }
const rr10: CustomDifficulty = { rerolls: 10, ratingsShown: true, screwLevel: 5 }
const mult0 = resolveDifficulty('custom', rr0).scoreMultiplier
const mult10 = resolveDifficulty('custom', rr10).scoreMultiplier
console.log(`  same level, 0 rerolls ×${mult0.toFixed(2)} vs 10 rerolls ×${mult10.toFixed(2)} (Δ ${(mult0 - mult10).toFixed(2)})`)
check(mult0 - mult10 > 0.1, `10 rerolls should cost a real chunk of score vs 0 (got Δ ${(mult0 - mult10).toFixed(2)})`)

console.log(failures === 0 ? '\n✅ ALL CHECKS PASSED' : `\n❌ ${failures} CHECK(S) FAILED`)
process.exit(failures === 0 ? 0 : 1)
