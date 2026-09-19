import React from 'react'
import { View, StyleSheet } from 'react-native'
import { router } from 'expo-router'
import { useGameStore } from '@/store/gameStore'
import { resolveDifficulty, type Difficulty } from '@/engine/difficulty'
import { ROLES, space, colourwayFor } from '@/theme'
import { KitScreen, KitText, RunHeader, ChoiceLabel } from '@/components/kit'
import { multiplierText } from '@/data/modes'

// Stage 2 · How hard — docs/ui-overhaul/07b B2, split out of mode select.
// Each difficulty is a care label listing exactly what it changes, with the
// score multiplier beside it (difficulty changes the score, so it's shown
// where the choice is made). Every number comes from resolveDifficulty — this
// screen never restates what "easy" means on its own.
const roles = ROLES.cotton

const PRESETS: { id: Exclude<Difficulty, 'custom'>; title: string; tilt: string }[] = [
  { id: 'easy',   title: 'Easy',   tilt: 'YOUR MATCHES TILT YOUR WAY' },
  { id: 'medium', title: 'Medium', tilt: 'MATCHES PLAY IT STRAIGHT' },
  { id: 'hard',   title: 'Hard',   tilt: 'THE AI LEANS AGAINST YOU' },
]

export default function HowHardScreen() {
  const { mode, difficulty: last, customDifficulty, weightedPicksOverride, setDifficulty, setUseSubstitutes } = useGameStore()

  function choose(id: Exclude<Difficulty, 'custom'>) {
    setDifficulty(id)
    // The presets always play with a bench. Only Custom turns it off, so a bench
    // switched off in an earlier custom run can't silently follow you here.
    setUseSubstitutes(true)
    router.push('/game/formation-select')
  }

  const custom = resolveDifficulty('custom', customDifficulty, mode, weightedPicksOverride)

  return (
    <KitScreen ground="cotton">
      <RunHeader roles={roles} stage={2} colourway={colourwayFor(mode)} title="How hard" />
      <KitText t="bodyL" color={roles.textMuted} style={styles.lead}>
        Difficulty only touches your own matches and your draft. Everyone else plays it straight.
      </KitText>
      <View style={styles.rack}>
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
                'BENCH ON',
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
      </View>
      <KitText t="body" color={roles.textMuted} style={styles.foot}>
        Harder settings score more. The multiplier is applied to your final score.
      </KitText>
    </KitScreen>
  )
}

const styles = StyleSheet.create({
  lead: { marginBottom: space[4] },
  rack: { gap: space[3] },
  foot: { marginTop: space[4] },
})
