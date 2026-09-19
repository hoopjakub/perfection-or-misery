import React from 'react'
import { View, StyleSheet } from 'react-native'
import { router } from 'expo-router'
import { useGameStore } from '@/store/gameStore'
import { resolveDifficulty, screwLevelInfo } from '@/engine/difficulty'
import { ROLES, space, colourwayFor } from '@/theme'
import {
  KitScreen, KitText, RunHeader, StepControl, Toggle, SectionTag, Plate, ListRow, Tag,
} from '@/components/kit'
import { multiplierText } from '@/data/modes'

// Stage 2 · Custom — docs/ui-overhaul/07b B2 move 2. One control per row and a
// live readout of what the settings add up to. Edits write straight to the
// store so they're in place the moment the plate is pressed.
const roles = ROLES.cotton

export default function CustomDifficultyScreen() {
  const {
    mode, customDifficulty: c, setCustomDifficulty, setDifficulty,
    useSubstitutes, setUseSubstitutes, weightedPicksOverride, setWeightedPicksOverride,
  } = useGameStore()
  const level = screwLevelInfo(c.screwLevel)
  const r = resolveDifficulty('custom', c, mode, weightedPicksOverride)
  const weighted = weightedPicksOverride ?? true

  function useThese() {
    setDifficulty('custom')
    router.push('/game/formation-select')
  }

  return (
    <KitScreen ground="cotton">
      <RunHeader roles={roles} stage={2} colourway={colourwayFor(mode)} title="Custom rules" />

      {/* The live readout sits first so every change below is felt at once. */}
      <View style={[styles.readout, { borderColor: roles.line }]} accessible accessibilityLiveRegion="polite"
        accessibilityLabel={`Hardness ${r.hardness.toFixed(1)} of 11, score multiplier ${r.scoreMultiplier.toFixed(2)}`}>
        <View>
          <KitText t="tag" color={roles.textMuted}>HARDNESS</KitText>
          <KitText t="figureL" color={roles.text}>{`${r.hardness.toFixed(1)}/11`}</KitText>
        </View>
        <View style={styles.readoutRight}>
          <KitText t="tag" color={roles.textMuted}>SCORE</KitText>
          <KitText t="figureL" color={roles.text}>{multiplierText(r.scoreMultiplier)}</KitText>
        </View>
      </View>

      <SectionTag roles={roles}>The AI</SectionTag>
      <View style={styles.row}>
        <View style={{ flex: 1, gap: 2 }}>
          <KitText t="title" color={roles.text}>{`${c.screwLevel} · ${level.name}`}</KitText>
          <KitText t="body" color={roles.textMuted}>{level.tagline}</KitText>
        </View>
        <StepControl roles={roles} label="Difficulty level, 1 to 10" value={c.screwLevel} min={1} max={10}
          onChange={v => setCustomDifficulty({ ...c, screwLevel: v })} />
      </View>
      <KitText t="body" color={roles.textMuted}>Easy, Medium and Hard sit at 2, 4 and 6.</KitText>

      <SectionTag roles={roles}>The draft</SectionTag>
      <View style={styles.row}>
        <View style={{ flex: 1, gap: 2 }}>
          <KitText t="title" color={roles.text}>Rerolls</KitText>
          <KitText t="body" color={roles.textMuted}>More rerolls make the draft easier and cut your score.</KitText>
        </View>
        <StepControl roles={roles} label="Rerolls, 0 to 10" value={c.rerolls} min={0} max={10}
          onChange={v => setCustomDifficulty({ ...c, rerolls: v })} />
      </View>
      <ListRow
        roles={roles}
        label={c.ratingsShown ? 'Ratings shown while you draft' : 'Draft blind: harder, and worth more'}
        trailing={<Toggle roles={roles} label="Show ratings" value={c.ratingsShown} onChange={v => setCustomDifficulty({ ...c, ratingsShown: v })} />}
      />
      {mode === 'champions_league_custom' && (
        <ListRow
          roles={roles}
          label={weighted ? "Spins only come from Europe's six strongest leagues" : 'Spins come from every league'}
          trailing={<Toggle roles={roles} label="Weighted picks" value={weighted} onChange={setWeightedPicksOverride} />}
        />
      )}

      <SectionTag roles={roles}>The bench</SectionTag>
      <ListRow
        roles={roles}
        label={useSubstitutes
          ? 'Play with a bench. Subs come on in the second half, for every club.'
          : 'No bench, for you and every other club.'}
        trailing={<Toggle roles={roles} label="Play with a bench" value={useSubstitutes} onChange={setUseSubstitutes} />}
      />

      <View style={styles.summary}>
        <Tag roles={roles}>{`REROLLS ${c.rerolls}`}</Tag>
        <Tag roles={roles}>{c.ratingsShown ? 'RATINGS SHOWN' : 'RATINGS HIDDEN'}</Tag>
        <Tag roles={roles}>{useSubstitutes ? 'BENCH ON' : 'NO BENCH'}</Tag>
      </View>

      <Plate label="Use these rules" icon="forward" roles={roles} onPress={useThese} style={styles.plate} />
    </KitScreen>
  )
}

const styles = StyleSheet.create({
  readout: { flexDirection: 'row', justifyContent: 'space-between', borderWidth: 2, padding: space[3] },
  readoutRight: { alignItems: 'flex-end' },
  row: { flexDirection: 'row', alignItems: 'center', gap: space[3], paddingVertical: space[2] },
  summary: { flexDirection: 'row', flexWrap: 'wrap', gap: space[2], marginTop: space[5] },
  plate: { marginTop: space[4] },
})
