import React from 'react'
import { VersionButton } from '@/components/VersionButton'
import { useSettingsStore } from '@/store/settingsStore'
import { StyleSheet } from 'react-native'
import { router } from 'expo-router'
import { useGameStore } from '@/store/gameStore'
import { resolveDifficulty, type Difficulty } from '@/engine/difficulty'
import { ROLES, space, colourwayFor } from '@/theme'
import { KitScreen, KitText, RunHeader, ChoiceLabel, Grid, SectionTag, ListRow, Toggle } from '@/components/kit'
import { multiplierText } from '@/data/modes'
import { EVERYDAY } from '@/lib/appearance'

// Stage 2 · How hard — docs/ui-overhaul/07b B2, split out of mode select.
// Each difficulty is a care label listing exactly what it changes, with the
// score multiplier beside it (difficulty changes the score, so it's shown
// where the choice is made). Every number comes from resolveDifficulty — this
// screen never restates what "easy" means on its own.
const roles = ROLES[EVERYDAY]

const PRESETS: { id: Exclude<Difficulty, 'custom'>; title: string; tilt: string }[] = [
  { id: 'easy',   title: 'Easy',   tilt: 'YOUR MATCHES TILT YOUR WAY' },
  { id: 'medium', title: 'Medium', tilt: 'MATCHES PLAY IT STRAIGHT' },
  { id: 'hard',   title: 'Hard',   tilt: 'THE AI LEANS AGAINST YOU' },
]

export default function HowHardScreen() {
  const { mode, customDifficulty, weightedPicksOverride, setDifficulty, useSubstitutes, setUseSubstitutes } = useGameStore()
  // LAST TIME: the difficulty of the last run you finished, shared with Home's
  // Again (settingsStore) — only when it was this same mode.
  const lastRun = useSettingsStore(s => s.lastRun)
  const last = lastRun?.mode === mode ? lastRun.difficulty : null

  function choose(id: Exclude<Difficulty, 'custom'>) {
    setDifficulty(id)
    // P8-01: the bench is the player's own choice (the switch below), kept
    // between runs. A preset used to force it back on, silently undoing it.
    router.push('/game/formation-select')
  }

  const custom = resolveDifficulty('custom', customDifficulty, mode, weightedPicksOverride)

  return (
    <KitScreen ground={EVERYDAY} width="wide">
      <RunHeader roles={roles} stage={2} colourway={colourwayFor(mode)} title="How hard" />
      <KitText t="bodyL" color={roles.textMuted} style={styles.lead}>
        Difficulty only touches your own matches and your draft. Everyone else plays it straight.
      </KitText>
      <Grid medium={2} expanded={4}>
        {PRESETS.map(p => {
          const r = resolveDifficulty(p.id, null, mode, null)
          return (
            <ChoiceLabel
              key={p.id}
              roles={roles}
              title={p.title}
              trailing={multiplierText(r.scoreMultiplier)}
              lines={[
                `REROLLS ${r.rerolls} · RATINGS ${r.ratingsShown ? 'SHOWN' : 'HIDDEN'}`,
                p.tilt,
                useSubstitutes ? 'BENCH ON' : 'NO BENCH',
                ...(mode === 'champions_league_custom' ? [`WEIGHTED PICKS ${r.weightedPicksEffective ? 'ON' : 'OFF'}`] : []),
              ]}
              lastTime={last === p.id}
              onPress={() => choose(p.id)}
              accessibilityHint={`Score multiplier ${r.scoreMultiplier.toFixed(2)}`}
            />
          )
        })}
        <ChoiceLabel
          roles={roles}
          title="Custom"
          trailing={multiplierText(custom.scoreMultiplier)}
          note="Set your own rerolls, ratings, bench and how hard the AI leans on you."
          lastTime={last === 'custom'}
          onPress={() => router.push('/game/difficulty-custom')}
        />
      </Grid>
      {/* P8-01: the bench, for every difficulty (it was only on Custom). The
          same setting Custom's switch changes, so the two always agree. */}
      <SectionTag roles={roles} style={styles.bench}>The bench</SectionTag>
      <ListRow
        roles={roles}
        label={useSubstitutes
          ? 'Play with a bench. Subs come on in the second half, for every club.'
          : 'No bench, for you and every other club.'}
        trailing={<Toggle roles={roles} label="Play with a bench" value={useSubstitutes} onChange={setUseSubstitutes} />}
      />
      <KitText t="body" color={roles.textMuted} style={styles.foot}>
        Harder settings score more. The multiplier is applied to your final score.
      </KitText>
      {/* P8-73: the version on every menu before a run starts. */}
      <VersionButton roles={roles} style={{ marginTop: space[4] }} />
    </KitScreen>
  )
}

const styles = StyleSheet.create({
  lead: { marginBottom: space[4] },
  bench: { marginTop: space[5] },
  foot: { marginTop: space[4] },
})
