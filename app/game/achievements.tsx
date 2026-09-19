import React, { useEffect, useState } from 'react'
import { PageMeta } from '@/components/PageMeta'
import { View, StyleSheet } from 'react-native'
import { useUserStore } from '@/store/userStore'
import { fetchAchievementRuns, isRunWon, type AchievementRun } from '@/db/queries/leaderboard'
import { ROLES, space, border, font, colourwayFor, MODE_LABELS } from '@/theme'
import { KitScreen, KitText, BackControl, Tag, Tape, EmptyState } from '@/components/kit'

// D10 · Achievements (docs/ui-overhaul/07d). Each mode is a strip in its own
// colourway (the same tape its run labels wear); a difficulty won is a WIN
// tag, one still to win is a plain one. The old per-mode hex accents and
// Ionicons are gone: the colourway is the mode's identity everywhere now.
const roles = ROLES.cotton

// Era mode is retired (Big Fixes §6) — no longer selectable from mode-select,
// but old runs/career_stats may still carry `mode: 'era'`. Per the resolved
// decision, historical data is never deleted/rewritten; it's just rendered
// with this single retired label instead of offering the mode to play.
export const ERA_RETIRED_LABEL = 'Era (retired)'

// Which modes to show, in display order, with their identity + whether they have
// a base-difficulty axis (chaos/cursed don't — they're a single conquest).
const MODE_META: { mode: string; title: string; hasDifficulty: boolean; trophy: string }[] = [
  { mode: 'world_cup',               title: MODE_LABELS.world_cup,               hasDifficulty: true,  trophy: 'Lift the FIFA World Cup' },
  { mode: 'champions_league_custom', title: MODE_LABELS.champions_league_custom, hasDifficulty: true,  trophy: 'Win the full UCL journey' },
  { mode: 'champions_league',        title: MODE_LABELS.champions_league,        hasDifficulty: true,  trophy: 'Win the finals-only UCL' },
  { mode: 'all_time',                title: 'All Time',                  hasDifficulty: true,  trophy: 'Win the league' },
  { mode: 'league',                  title: 'League Mode',               hasDifficulty: true,  trophy: 'Win the league' },
  { mode: 'era',                     title: ERA_RETIRED_LABEL,           hasDifficulty: true,  trophy: 'Win the league' },
  { mode: 'chaos',                   title: 'Chaos Mode',                hasDifficulty: false, trophy: 'Win the league' },
  { mode: 'cursed',                  title: 'Cursed Mode',               hasDifficulty: false, trophy: 'Win the league' },
]

type ModeAch = {
  wonEasy: boolean; wonMedium: boolean; wonHard: boolean
  customBestHardness: number | null   // hardest CUSTOM run won in this mode
  conquered: boolean                  // any trophy at all (covers old runs + chaos/cursed)
  legacyWins: number                  // wins with no recorded difficulty (pre-feature)
}

function emptyAch(): ModeAch {
  return { wonEasy: false, wonMedium: false, wonHard: false, customBestHardness: null, conquered: false, legacyWins: 0 }
}

function computeAchievements(runs: AchievementRun[]): Record<string, ModeAch> {
  const out: Record<string, ModeAch> = {}
  const metaByMode = new Map(MODE_META.map(m => [m.mode, m]))
  for (const m of MODE_META) out[m.mode] = emptyAch()
  for (const run of runs) {
    const a = out[run.mode]
    if (!a || !isRunWon(run)) continue
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
  return out
}

export default function AchievementsScreen() {
  const { user, isGuest } = useUserStore()
  const [loading, setLoading] = useState(true)
  const [ach, setAch] = useState<Record<string, ModeAch>>({})
  const [totalWins, setTotalWins] = useState(0)
  const [hardestWon, setHardestWon] = useState<number | null>(null)

  useEffect(() => {
    let active = true
    async function load() {
      if (!user || isGuest) { setLoading(false); return }
      try {
        const runs = await fetchAchievementRuns(user.id)
        if (!active) return
        const computed = computeAchievements(runs)
        setAch(computed)
        const wins = runs.filter(isRunWon)
        setTotalWins(wins.length)
        const hardest = wins.reduce<number | null>((max, r) => {
          const h = r.difficulty_meta?.hardness
          return typeof h === 'number' ? Math.max(max ?? -1, h) : max
        }, null)
        setHardestWon(hardest)
      } catch (e) {
        console.warn('[achievements] load failed:', e)
      } finally {
        if (active) setLoading(false)
      }
    }
    load()
    return () => { active = false }
  }, [user, isGuest])

  const cleared = MODE_META.filter(m => ach[m.mode]?.conquered).length
  return (
    <KitScreen ground="cotton">
      <PageMeta title="Achievements" path="/game/achievements" />
      <BackControl roles={roles} />
      <KitText t="superL" color={roles.text} accessibilityRole="header" style={styles.title}>ACHIEVEMENTS</KitText>
      {isGuest ? (
        <EmptyState roles={roles} icon="lock" title="Sign in to keep trophies" body="Guest runs aren't saved, so they can't count here." />
      ) : loading ? (
        <KitText t="bodyL" color={roles.textMuted}>Counting the trophies.</KitText>
      ) : (
        <>
          <View style={styles.bigRow}>
            <Big label="Trophies" value={String(totalWins)} />
            <Big label="Hardest won /11" value={hardestWon != null ? hardestWon.toFixed(1) : '—'} />
            <Big label="Modes cleared" value={`${cleared}/${MODE_META.length}`} />
          </View>
          {MODE_META.map(meta => {
            const a = ach[meta.mode] ?? emptyAch()
            return (
              <View key={meta.mode} style={[styles.mode, { borderColor: a.conquered ? roles.line : roles.rule, backgroundColor: roles.surface }]}>
                <Tape colours={colourwayFor(meta.mode)} roles={roles} vertical style={styles.tape} />
                <View style={styles.modeBody}>
                  <View style={styles.modeHead}>
                    <View style={{ flex: 1 }}>
                      <KitText t="bodyL" color={roles.text} style={styles.modeTitle}>{meta.title}</KitText>
                      <KitText t="tag" color={roles.textMuted}>{meta.trophy}</KitText>
                    </View>
                    {a.conquered && <Tag roles={roles} variant="win">WON</Tag>}
                  </View>
                  <View style={styles.tags}>
                    {meta.hasDifficulty ? (
                      <>
                        <Tag roles={roles} variant={a.wonEasy ? 'win' : 'data'}>EASY</Tag>
                        <Tag roles={roles} variant={a.wonMedium ? 'win' : 'data'}>MEDIUM</Tag>
                        <Tag roles={roles} variant={a.wonHard ? 'win' : 'data'}>HARD</Tag>
                        <Tag roles={roles} variant={a.customBestHardness != null ? 'win' : 'data'}>
                          {a.customBestHardness != null ? `CUSTOM ${a.customBestHardness.toFixed(1)}/11` : 'CUSTOM'}
                        </Tag>
                      </>
                    ) : (
                      <Tag roles={roles} variant={a.conquered ? 'win' : 'data'}>{a.conquered ? 'CONQUERED' : 'NOT YET'}</Tag>
                    )}
                  </View>
                  {a.legacyWins > 0 && (
                    <KitText t="tag" color={roles.textMuted}>{`+${a.legacyWins} older win${a.legacyWins > 1 ? 's' : ''} from before difficulty was tracked`}</KitText>
                  )}
                </View>
              </View>
            )
          })}
          <KitText t="body" color={roles.textMuted} style={styles.foot}>
            Win a mode on a difficulty and its tag stays. Custom shows the hardest custom run you've won, on a 0–11 scale.
          </KitText>
        </>
      )}
    </KitScreen>
  )
}

function Big({ label, value }: { label: string; value: string }) {
  return (
    <View style={{ flex: 1 }}>
      <KitText t="figureL" color={roles.text}>{value}</KitText>
      <KitText t="tag" color={roles.textMuted}>{label}</KitText>
    </View>
  )
}

const styles = StyleSheet.create({
  title: { marginTop: space[3] },
  bigRow: { flexDirection: 'row', gap: space[3], marginVertical: space[4] },
  mode: { flexDirection: 'row', borderWidth: border.thin, marginBottom: space[3] },
  tape: { alignSelf: 'stretch' },
  modeBody: { flex: 1, padding: space[3], gap: space[2] },
  modeHead: { flexDirection: 'row', alignItems: 'center', gap: space[2] },
  modeTitle: { fontFamily: font.bodyBold },
  tags: { flexDirection: 'row', flexWrap: 'wrap', gap: space[2] },
  foot: { marginTop: space[2], marginBottom: space[5] },
})
