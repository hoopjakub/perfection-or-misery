// Achievements, worked out from your saved runs: the mode-by-difficulty
// patches, the European Full Path's trophy grid (P8.5-21) and the feats
// (src/lib/feats.ts). Moved out of the Achievements screen (P8.5-36) so the
// toast that announces a new one reads exactly the same rules.
import { MODE_LABELS } from '@/data/mode-labels'
import { isRunWon, FEATS, featCounts, fullPathTrophy, type EuroTrophy } from '@/lib/feats'
import { EUROPE } from '@/data/europe'
import type { AchievementRun } from '@/db/queries/leaderboard'

// Era mode is retired (Big Fixes §6) — no longer selectable from mode-select,
// but old runs/career_stats may still carry `mode: 'era'`. Per the resolved
// decision, historical data is never deleted/rewritten; it's just rendered
// with this single retired label instead of offering the mode to play.
export const ERA_RETIRED_LABEL = 'Era (retired)'

// Which modes to show, in display order, with their identity + whether they have
// a base-difficulty axis (chaos/cursed don't — they're a single conquest).
export const MODE_META: { mode: string; title: string; hasDifficulty: boolean; trophy: string; byTrophy?: boolean }[] = [
  { mode: 'world_cup',               title: MODE_LABELS.world_cup,               hasDifficulty: true,  trophy: 'Lift the FIFA World Cup' },
  // P8.5-21: the full path can end with any of three trophies; each has its own line.
  { mode: 'champions_league_custom', title: MODE_LABELS.champions_league_custom, hasDifficulty: true,  trophy: 'Win any of the three European trophies', byTrophy: true },
  { mode: 'champions_league',        title: MODE_LABELS.champions_league,        hasDifficulty: true,  trophy: 'Win the finals-only UCL' },
  { mode: 'europa_league',           title: MODE_LABELS.europa_league,           hasDifficulty: true,  trophy: 'Lift the Europa League' },
  { mode: 'conference_league',       title: MODE_LABELS.conference_league,       hasDifficulty: true,  trophy: 'Lift the Conference League' },
  { mode: 'all_time',                title: 'All Time',                  hasDifficulty: true,  trophy: 'Win the league' },
  { mode: 'league',                  title: 'League Mode',               hasDifficulty: true,  trophy: 'Win the league' },
  { mode: 'era',                     title: ERA_RETIRED_LABEL,           hasDifficulty: true,  trophy: 'Win the league' },
  { mode: 'chaos',                   title: 'Chaos Mode',                hasDifficulty: false, trophy: 'Win the league' },
  { mode: 'cursed',                  title: 'Cursed Mode',               hasDifficulty: false, trophy: 'Win the league' },
]

export type ModeAch = {
  wonEasy: boolean; wonMedium: boolean; wonHard: boolean
  customBestHardness: number | null   // hardest CUSTOM run won in this mode
  conquered: boolean                  // any trophy at all (covers old runs + chaos/cursed)
  legacyWins: number                  // wins with no recorded difficulty (pre-feature)
}

export function emptyAch(): ModeAch {
  return { wonEasy: false, wonMedium: false, wonHard: false, customBestHardness: null, conquered: false, legacyWins: 0 }
}

export function computeAchievements(runs: AchievementRun[]): Record<string, ModeAch> {
  const out: Record<string, ModeAch> = {}
  const metaByMode = new Map(MODE_META.map(m => [m.mode, m]))
  for (const m of MODE_META) out[m.mode] = emptyAch()
  for (const c of TROPHIES) { out[trophyKey(c)] = emptyAch(); out[trophyKey(c, true)] = emptyAch() }
  for (const run of runs) {
    const a = out[run.mode]
    if (!a || !isRunWon(run)) continue
    mark(a, run)
    // The full path's grid: the line of the competition it was won in. An
    // aimed run (Settings → Achievement hunting) fills that line's own "aimed"
    // layer, so a lucky win and an aimed one are both collectable and neither
    // counts as the other (docs/europe/07 §5.2).
    const won = fullPathTrophy(run)
    if (won) mark(out[trophyKey(won, !!targetOf(run))], run)
  }
  return out

  function mark(a: ModeAch, run: AchievementRun) {
    a.conquered = true
    switch (run.difficulty) {
      case 'easy':   a.wonEasy = true; break
      case 'medium': a.wonMedium = true; break
      case 'hard':   a.wonHard = true; break
      case 'custom': {
        const h = run.difficulty_meta?.hardness
        if (typeof h === 'number') a.customBestHardness = Math.max(a.customBestHardness ?? -1, h)
        break
      }
      default:
        // No difficulty on the run. Chaos/Cursed have NO difficulty axis at
        // all (mode-select never calls setDifficulty for them) — that's normal,
        // not stale data, so it doesn't count as "legacy". Only modes that DO
        // have a difficulty axis but are missing it are genuinely pre-feature runs.
        if (metaByMode.get(run.mode)?.hasDifficulty) a.legacyWins++
    }
  }
}

export const TROPHIES: EuroTrophy[] = ['ucl', 'uel', 'uecl']
export const trophyKey = (c: EuroTrophy, aimed = false) => `champions_league_custom:${c}${aimed ? ':aimed' : ''}`
const targetOf = (run: AchievementRun) => (run.difficulty_meta as { target?: string } | null)?.target ?? null

/** Everything earned, each with a key that never changes and the words a toast shows. */
export function earnedList(runs: AchievementRun[]): { key: string; title: string; line: string }[] {
  const ach = computeAchievements(runs)
  const out: { key: string; title: string; line: string }[] = []
  const DIFFS: ['wonEasy' | 'wonMedium' | 'wonHard', string][] = [['wonEasy', 'Easy'], ['wonMedium', 'Medium'], ['wonHard', 'Hard']]
  for (const m of MODE_META) {
    const a = ach[m.mode]
    if (!a?.conquered) continue
    if (!m.hasDifficulty) { out.push({ key: m.mode, title: m.title, line: 'Conquered' }); continue }
    if (!m.byTrophy) for (const [k, label] of DIFFS) if (a[k]) out.push({ key: `${m.mode}:${label}`, title: m.title, line: `Won on ${label}` })
  }
  for (const c of TROPHIES) for (const aimed of [false, true]) {
    const a = ach[trophyKey(c, aimed)]
    if (a) for (const [k, label] of DIFFS) if (a[k]) out.push({ key: `${trophyKey(c, aimed)}:${label}`, title: `${EUROPE[c].name}${aimed ? ', aimed' : ''}`, line: `Won on ${label}` })
  }
  const feats = featCounts(runs)
  for (const f of FEATS) if ((feats.get(f.id) ?? 0) > 0) out.push({ key: `feat:${f.id}`, title: f.title, line: f.how })
  return out
}
