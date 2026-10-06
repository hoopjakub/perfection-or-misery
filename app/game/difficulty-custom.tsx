import { t, dec } from '@/i18n'
import React from 'react'
import { VersionButton } from '@/components/VersionButton'
import { View, StyleSheet } from 'react-native'
import { router } from 'expo-router'
import { useGameStore } from '@/store/gameStore'
import { resolveDifficulty, screwLevelInfo } from '@/engine/difficulty'
import { ROLES, space, colourwayFor } from '@/theme'
import {
  KitScreen, KitText, RunHeader, StepControl, Toggle, SectionTag, Plate, ListRow, Tag,
} from '@/components/kit'
import { multiplierText } from '@/data/modes'
import { EVERYDAY } from '@/lib/appearance'

// Stage 2 · Custom — docs/ui-overhaul/07b B2 move 2. One control per row and a
// live readout of what the settings add up to. Edits write straight to the
// store so they're in place the moment the plate is pressed.
const roles = ROLES[EVERYDAY]

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
    <KitScreen ground={EVERYDAY}>
      <RunHeader roles={roles} stage={2} colourway={colourwayFor(mode)} title={t('setup.customRules')} />

      {/* The live readout sits first so every change below is felt at once. */}
      <View style={[styles.readout, { borderColor: roles.line }]} accessible accessibilityLiveRegion="polite"
        accessibilityLabel={t('setup.readoutA11y', { h: dec(r.hardness), m: dec(r.scoreMultiplier, 2) })}>
        <View>
          <KitText t="tag" color={roles.textMuted}>{t('setup.hardness')}</KitText>
          <KitText t="figureL" color={roles.text}>{`${dec(r.hardness)}/11`}</KitText>
        </View>
        <View style={styles.readoutRight}>
          <KitText t="tag" color={roles.textMuted}>{t('setup.score')}</KitText>
          <KitText t="figureL" color={roles.text}>{multiplierText(r.scoreMultiplier)}</KitText>
        </View>
      </View>

      <SectionTag roles={roles}>{t('setup.theAi')}</SectionTag>
      <View style={styles.row}>
        <View style={{ flex: 1, gap: 2 }}>
          <KitText t="title" color={roles.text}>{`${c.screwLevel} · ${level.name}`}</KitText>
          <KitText t="body" color={roles.textMuted}>{level.tagline}</KitText>
        </View>
        <StepControl roles={roles} label={t('setup.levelLabel')} value={c.screwLevel} min={1} max={10}
          onChange={v => setCustomDifficulty({ ...c, screwLevel: v })} />
      </View>
      <KitText t="body" color={roles.textMuted}>{t('setup.presetsAt')}</KitText>

      <SectionTag roles={roles}>{t('setup.theDraft')}</SectionTag>
      <View style={styles.row}>
        <View style={{ flex: 1, gap: 2 }}>
          <KitText t="title" color={roles.text}>{t('setup.rerolls')}</KitText>
          <KitText t="body" color={roles.textMuted}>{t('setup.rerollsNote')}</KitText>
        </View>
        <StepControl roles={roles} label={t('setup.rerollsLabel')} value={c.rerolls} min={0} max={10}
          onChange={v => setCustomDifficulty({ ...c, rerolls: v })} />
      </View>
      <ListRow
        roles={roles}
        label={c.ratingsShown ? t('setup.ratingsShownLine') : t('setup.draftBlind')}
        trailing={<Toggle roles={roles} label={t('setup.showRatings')} value={c.ratingsShown} onChange={v => setCustomDifficulty({ ...c, ratingsShown: v })} />}
      />
      {mode === 'champions_league_custom' && (
        <ListRow
          roles={roles}
          label={weighted ? t('setup.weightedOn') : t('setup.weightedOff')}
          trailing={<Toggle roles={roles} label={t('setup.weightedLabel')} value={weighted} onChange={setWeightedPicksOverride} />}
        />
      )}

      <SectionTag roles={roles}>{t('setup.theBench')}</SectionTag>
      <ListRow
        roles={roles}
        label={useSubstitutes ? t('setup.benchOnLine') : t('setup.benchOffLine')}
        trailing={<Toggle roles={roles} label={t('setup.playWithBench')} value={useSubstitutes} onChange={setUseSubstitutes} />}
      />

      <View style={styles.summary}>
        <Tag roles={roles}>{t('setup.rerollsTag', { n: c.rerolls })}</Tag>
        <Tag roles={roles}>{c.ratingsShown ? t('setup.ratingsShownTag') : t('setup.ratingsHiddenTag')}</Tag>
        <Tag roles={roles}>{useSubstitutes ? t('setup.benchOn') : t('setup.noBench')}</Tag>
      </View>

      <Plate label={t('setup.useRules')} icon="forward" roles={roles} onPress={useThese} style={styles.plate} />
      {/* P8-73: the version on every menu before a run starts. */}
      <VersionButton roles={roles} style={{ marginTop: space[4] }} />
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
