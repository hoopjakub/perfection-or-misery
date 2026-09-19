/**
 * verify-score.ts — the shared scoring formula (supabase/functions/_shared/score.ts).
 *
 * The app and the submit-run edge function score with the same file, so the
 * danger is the server REFUSING a run the app legitimately produced. This
 * walks every tier the league engine can assign (every league size, position,
 * zone and unbeaten/perfect combination) plus every knockout round, and checks:
 *   - a real run always passes invalidRun
 *   - scoreRun matches the formula the app used before Phase 6
 *   - rows no run could produce are refused
 * Run: npx tsx scripts/verify-score.ts
 */
import { scoreRun, invalidRun, scoreMultiplierFor, WC_ROUND_SCORE, CL_ROUND_SCORE, CUSTOM_CL_ROUND_SCORE, type RunRow } from '../supabase/functions/_shared/score'
import { assignTier } from '../src/engine/tier'
import { resolveDifficulty } from '../src/engine/difficulty'
import type { ZoneKey } from '../src/data/qualification-bands'

let failures = 0, checks = 0
function check(cond: boolean, msg: string) {
  checks++
  if (!cond) { failures++; if (failures <= 20) console.log('❌', msg) }
}

const base = (o: Partial<RunRow>): RunRow => ({
  mode: 'league', tier: 'almost_matters', final_position: 8, teams_in_league: 20, team_ovr: 78,
  wins: 15, draws: 10, losses: 13, goals_for: 50, goals_against: 45, difficulty_meta: null, ...o,
})

// ── 1. Every tier the league engine can assign passes the server's check ──────
const zones: (ZoneKey | null | undefined)[] = [undefined, null, 'champ', 'ucl', 'uel', 'uecl', 'playoff', 'down']
for (let teams = 10; teams <= 24; teams++) {
  for (let pos = 1; pos <= teams; pos++) {
    for (const z of zones) {
      for (const [losses, draws] of [[0, 0], [0, 5], [4, 6]]) {
        const tier = assignTier(pos, teams, losses === 0, losses === 0 && draws === 0, z)
        const played = (teams - 1) * 2
        const row = base({ tier, final_position: pos, teams_in_league: teams, losses, draws, wins: played - losses - draws })
        const why = invalidRun(row)
        check(why === null, `real league row refused (${teams} clubs, ${pos}th, zone ${z}, L${losses} D${draws} → ${tier}): ${why}`)
      }
    }
  }
}
// Scotland: 12 clubs, 38 matches after the split.
check(invalidRun(base({ teams_in_league: 12, final_position: 3, tier: 'title_contender', wins: 20, draws: 8, losses: 10 })) === null, 'a Scottish split season is refused')

// ── 2. Every knockout round passes ───────────────────────────────────────────
for (const [mode, ladder] of [['world_cup', WC_ROUND_SCORE], ['champions_league', CL_ROUND_SCORE], ['champions_league_custom', CUSTOM_CL_ROUND_SCORE]] as const) {
  for (const tier of Object.keys(ladder)) {
    check(invalidRun(base({ mode, tier, final_position: 4, teams_in_league: 36, wins: 5, draws: 1, losses: 2 })) === null, `${mode} round ${tier} refused`)
  }
}

// ── 3. The score is the pre-Phase-6 formula ──────────────────────────────────
const oldLeague = (pos: number, teams: number, ovr: number, l: number, d: number, modeMult: number, mult: number) =>
  Math.round((((teams - pos + 1) / teams) * 1000 - Math.max(0, ovr - 80) * 10 + (l === 0 && d === 0 ? 750 : l === 0 ? 400 : 0)) * modeMult * mult)
const oldKo = (b: number, ovr: number, l: number, mult: number) => Math.round(Math.max(0, (b - Math.max(0, ovr - 80) * 10 + (l === 0 ? 200 : 0)) * mult))
for (const diff of [null, 'easy', 'medium', 'hard'] as const) {
  const r = resolveDifficulty(diff, null)
  const meta = diff ? { hardness: r.hardness } : null
  check(scoreRun(base({ difficulty_meta: meta })) === oldLeague(8, 20, 78, 13, 10, 1, r.scoreMultiplier), `league score changed (${diff})`)
  check(scoreRun(base({ mode: 'all_time', team_ovr: 86, difficulty_meta: meta })) === oldLeague(8, 20, 86, 13, 10, 1.2, r.scoreMultiplier), `all-time score changed (${diff})`)
  check(scoreRun(base({ mode: 'world_cup', tier: 'qf', losses: 0, difficulty_meta: meta })) === oldKo(800, 78, 0, r.scoreMultiplier), `WC score changed (${diff})`)
  check(scoreRun(base({ mode: 'champions_league_custom', tier: 'q2_exit', difficulty_meta: meta })) === oldKo(90, 78, 13, r.scoreMultiplier), `full-path score changed (${diff})`)
}
check(scoreMultiplierFor(3.9) === 1, 'medium is not neutral')

// ── 4. Impossible rows are refused ───────────────────────────────────────────
const bad: [string, Partial<RunRow>][] = [
  ['champion not first', { tier: 'champions', final_position: 3 }],
  ['first but not a champion tier', { tier: 'almost_matters', final_position: 1 }],
  ['perfect season with a loss', { tier: 'perfection', final_position: 1, losses: 1 }],
  ['position outside the league', { final_position: 21 }],
  ['unknown tier', { tier: 'galaxy_brain' }],
  ['too many matches', { wins: 70 }],
  ['negative goals', { goals_for: -1 }],
  ['fractional wins', { wins: 1.5 }],
  ['absurd OVR', { team_ovr: 140 }],
  ['absurd hardness', { difficulty_meta: { hardness: 40 } }],
  ['unknown knockout round', { mode: 'world_cup', tier: 'r64' }],
  ['unknown mode', { mode: 'moon_league' }],
]
for (const [what, o] of bad) check(invalidRun(base(o)) !== null, `accepted an impossible row: ${what}`)

console.log(`\n${checks} checks, ${failures} failed`)
if (failures === 0) console.log('✅ ALL CHECKS PASSED')
process.exit(failures === 0 ? 0 : 1)
