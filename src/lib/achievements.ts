// Achievements, worked out from your saved runs: the mode-by-difficulty
// patches, the European Full Path's trophy grid (P8.5-21) and the feats
// (src/lib/feats.ts). Moved out of the Achievements screen (P8.5-36) so the
// toast that announces a new one reads exactly the same rules.
import { t } from '@/i18n'
import { MODE_LABELS } from '@/data/mode-labels'
import { isRunWon, FEATS, featCounts, fullPathTrophy, type EuroTrophy } from '@/lib/feats'
import { EUROPE } from '@/data/europe'
import type { AchievementRun } from '@/db/queries/leaderboard'

// Era mode is retired (Big Fixes §6) — no longer selectable from mode-select,
// but old runs/career_stats may still carry `mode: 'era'`. Per the resolved
// decision, historical data is never deleted/rewritten; it's just rendered
// with this single retired label instead of offering the mode to play.
export const ERA_RETIRED_LABEL = t('ach.eraRetired')

// Which modes to show, in display order, with their identity + whether they have
// a base-difficulty axis (chaos/cursed don't — they're a single conquest).
export const MODE_META: { mode: string; title: string; hasDifficulty: boolean; trophy: string; byTrophy?: boolean }[] = [
  { mode: 'world_cup',               title: MODE_LABELS.world_cup,               hasDifficulty: true,  trophy: t('ach.liftWc') },
  // P8.5-21: the full path can end with any of three trophies; each has its own line.
  { mode: 'champions_league_custom', title: MODE_LABELS.champions_league_custom, hasDifficulty: true,  trophy: t('ach.anyEuro'), byTrophy: true },
  { mode: 'champions_league',        title: MODE_LABELS.champions_league,        hasDifficulty: true,  trophy: t('ach.finalsUcl') },
  { mode: 'europa_league',           title: MODE_LABELS.europa_league,           hasDifficulty: true,  trophy: t('ach.liftUel') },
  { mode: 'conference_league',       title: MODE_LABELS.conference_league,       hasDifficulty: true,  trophy: t('ach.liftUecl') },
  { mode: 'all_time',                title: t('ach.allTime'),         hasDifficulty: true,  trophy: t('ach.winLeague') },
  { mode: 'league',                  title: t('ach.leagueMode'),      hasDifficulty: true,  trophy: t('ach.winLeague') },
  { mode: 'era',                     title: ERA_RETIRED_LABEL,           hasDifficulty: true,  trophy: t('ach.winLeague') },
  { mode: 'chaos',                   title: t('ach.chaosMode'),       hasDifficulty: false, trophy: t('ach.winLeague') },
  { mode: 'cursed',                  title: t('ach.cursedMode'),      hasDifficulty: false, trophy: t('ach.winLeague') },
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
  // The label in the key stays English: seen toasts are stored by key.
  const DIFFS: ['wonEasy' | 'wonMedium' | 'wonHard', string, string][] = [['wonEasy', 'Easy', t('ach.easy')], ['wonMedium', 'Medium', t('ach.medium')], ['wonHard', 'Hard', t('ach.hard')]]
  for (const m of MODE_META) {
    const a = ach[m.mode]
    if (!a?.conquered) continue
    if (!m.hasDifficulty) { out.push({ key: m.mode, title: m.title, line: t('ach.conquered') }); continue }
    if (!m.byTrophy) for (const [k, label, level] of DIFFS) if (a[k]) out.push({ key: `${m.mode}:${label}`, title: m.title, line: t('ach.wonOn', { level }) })
  }
  for (const c of TROPHIES) for (const aimed of [false, true]) {
    const a = ach[trophyKey(c, aimed)]
    if (a) for (const [k, label, level] of DIFFS) if (a[k]) out.push({ key: `${trophyKey(c, aimed)}:${label}`, title: aimed ? t('ach.aimed', { comp: EUROPE[c].name }) : EUROPE[c].name, line: t('ach.wonOn', { level }) })
  }
  const feats = featCounts(runs)
  for (const f of FEATS) if ((feats.get(f.id) ?? 0) > 0) out.push({ key: `feat:${f.id}`, title: f.title, line: f.how })
  return out
}

// ── A run as the achievements read it ────────────────────────────────────────
/** A run from the achievements query (its jsonb paths flattened, see fetchAchievementRuns). */
export function achievementRunOf(r: Record<string, any>): AchievementRun {
  return {
    mode: r.mode, tier: r.tier ?? null, final_position: r.final_position ?? null,
    losses: r.losses ?? null, squad: r.squad ?? null,
    difficulty: r.difficulty ?? null, difficulty_meta: r.difficulty_meta ?? null,
    highlights: r.cup_winner ? { cup: { winner: r.cup_winner } } : null,
    fullPath: r.mode === 'champions_league_custom' ? {
      entry: r.fp_entry ?? null,
      qualTies: Array.isArray(r.fp_ties) ? r.fp_ties.length : null,
      domesticChampion: r.fp_home?.domesticChampion ?? null,
      cupWon: r.fp_home?.cupWon ?? null,
    } : null,
  }
}

/**
 * A run as it's saved (the row the app sends, or one waiting in the offline
 * queue), read the way the query reads a saved one. P9.75-23: achievements
 * were judged from the server's runs only, so a run kept on the phone earned
 * nothing until it went up and the app was reloaded.
 */
export function achievementRunFromRow(row: Record<string, any>): AchievementRun {
  return achievementRunOf({
    ...row,
    cup_winner: row.highlights?.cup?.winner,
    fp_entry: row.cl_result?._customUclQual?.europe?.entry,
    fp_ties: row.cl_result?._customUclQual?.playerPath,
    fp_home: row.highlights?.fullPath,
  })
}
