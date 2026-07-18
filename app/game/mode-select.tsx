import React, { useState, useEffect } from 'react'
import { View, Text, StyleSheet, Pressable, ScrollView, ActivityIndicator, Image } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { PressCard, BackButton, StepSlider } from '@/components/ui'
import { screwLevelInfo } from '@/engine/difficulty'
import { router } from 'expo-router'
import { useGameStore, GameMode, type Difficulty } from '@/store/gameStore'
import { getAvailableLeagues, type LeagueOption } from '@/db/queries/seasons'
import { colors, spacing, typography, radius, shadows } from '@/theme'

type ModeCategory = 'normal' | 'special'

type ModeConfig = {
  id: GameMode
  category: ModeCategory
  title: string
  subtitle: string
  description: string
  emoji: string
  accentColor: string
  hasDifficulty: boolean
  image?: any // Image require statement
}

const CATEGORIES: { id: ModeCategory; label: string }[] = [
  { id: 'normal',  label: 'Normal Modes' },
  { id: 'special', label: 'Special Modes' },
]

const MODES: ModeConfig[] = [
  // ── Normal modes: drafted XI placed into a domestic league season ──────────
  {
    id:            'all_time',
    category:      'normal',
    title:         'All Time',
    subtitle:      'Any league, any era',
    description:   'The full pool. Any club, any season, any league. The main experience.',
    emoji:         '🌍',
    accentColor:   '#10B981',
    hasDifficulty: true,
  },
  {
    id:            'league',
    category:      'normal',
    title:         'League Mode',
    subtitle:      'One league, all eras',
    description:   'Pick a league. Every spin comes from that league across all available seasons. Placement stays within it too.',
    emoji:         '🏴',
    accentColor:   colors.accent,
    hasDifficulty: true,
  },
  {
    id:            'era',
    category:      'normal',
    title:         'Era Mode',
    subtitle:      'Pick a decade',
    description:   'Lock the draft to a specific decade. All clubs, all leagues — but only from your chosen era.',
    emoji:         '📅',
    accentColor:   '#8B5CF6',
    hasDifficulty: true,
  },
  {
    id:            'chaos',
    category:      'normal',
    title:         'Chaos Mode',
    subtitle:      'No mercy',
    description:   'Ratings hidden. No rerolls. Placement weighting disabled — you could end up anywhere.',
    emoji:         '💀',
    accentColor:   '#FF3B30',
    hasDifficulty: false,
  },
  {
    id:            'cursed',
    category:      'normal',
    title:         'Cursed Mode',
    subtitle:      'You asked for this',
    description:   'Like Chaos but you also have no idea which position you\'re drafting for until after you pick.',
    emoji:         '☠️',
    accentColor:   '#A855F7',
    hasDifficulty: false,
  },
  // ── Special modes: real competitions with their own formats ────────────────
  {
    id:            'champions_league_custom',
    category:      'special',
    title:         'Champions League',
    subtitle:      'Real leagues, real qualifying',
    description:   'Every UEFA league simulated from scratch. Qualify (or go straight in), survive the League Phase, then the knockouts. The full road to the trophy.',
    emoji:         '🏆',
    accentColor:   '#4FA9FF',
    hasDifficulty: true,
    image:         require('../../assets/modes/champions-league.png'),
  },
  {
    id:            'champions_league',
    category:      'special',
    title:         'Champions League Classic',
    subtitle:      'Finals only',
    description:   'The 36-club League Phase and knockouts only, no qualifying — just the best clubs from Europe\'s top competitions.',
    emoji:         '🏆',
    accentColor:   '#4FA9FF',
    hasDifficulty: true,
    image:         require('../../assets/modes/champions-league.png'),
  },
  {
    id:            'world_cup',
    category:      'special',
    title:         'World Cup',
    subtitle:      'Global glory',
    description:   'National teams from around the world. Draft your squad and lead your country to victory.',
    emoji:         '⚽',
    accentColor:   '#F5C518',
    hasDifficulty: true,
    image:         require('../../assets/modes/world-cup.png'),
  },
]

const ERAS = [
  { id: '2020s',  label: '2020s',   year: 2020 },
  { id: '2010s',  label: '2010s',   year: 2010 },
  { id: '2000s',  label: '2000s',   year: 2000 },
  { id: '1990s',  label: '1990s',   year: 1990 },
  { id: '1980s',  label: '1980s',   year: 1980 },
  { id: '2020s+', label: '2020s+',  year: 2020 },
  { id: '2010s+', label: '2010s+',  year: 2010 },
  { id: '2000s+', label: '2000s+',  year: 2000 },
  { id: '1990s+', label: '1990s+',  year: 1990 },
  { id: '1980s+', label: '1980s+',  year: 1980 },
]

const DIFFICULTIES: { id: Difficulty; label: string; description: string }[] = [
  { id: 'easy', label: 'Easy', description: '3 rerolls · ratings shown · your own matches tilt your way' },
  { id: 'medium', label: 'Medium', description: '1 reroll · ratings shown · matches play it straight' },
  { id: 'hard', label: 'Hard', description: 'No rerolls · ratings hidden · the AI leans against you' },
  { id: 'custom', label: 'Custom', description: 'Dial in your own pain — rerolls, blind ratings, and how hard the AI screws you.' },
]

export default function ModeSelectScreen() {
  const { setMode, setDifficulty, setSelectedLeague, setAccentColor, customDifficulty, setCustomDifficulty } = useGameStore()
  const [selectedCategory, setSelectedCategory] = useState<ModeCategory>('normal')
  const [selectedMode, setSelectedMode] = useState<GameMode | null>(null)
  const [selectedEra, setSelectedEra] = useState<string | null>(null)
  const [selectedDifficulty, setSelectedDifficulty] = useState<Difficulty | null>(null)
  const [selectedLeague, setSelectedLeagueState] = useState<string | null>(null)
  const [leagues, setLeagues] = useState<LeagueOption[]>([])
  const [loadingLeagues, setLoadingLeagues] = useState(false)

  // Play Again lands here with the last run's mode/difficulty/league still in the
  // store (resetRun keeps them) — preselect them so a rematch is one tap away.
  useEffect(() => {
    const s = useGameStore.getState()
    if (!s.mode) return
    const cfg = MODES.find(m => m.id === s.mode)
    if (!cfg) return
    setSelectedCategory(cfg.category)
    setSelectedMode(s.mode)
    if (s.era) setSelectedEra(s.era)
    if (s.selectedLeague) setSelectedLeagueState(s.selectedLeague)
    if (cfg.hasDifficulty && s.difficulty) setSelectedDifficulty(s.difficulty)
  }, [])

  useEffect(() => {
    async function loadLeagues() {
      setLoadingLeagues(true)
      try {
        const data = await getAvailableLeagues()
        setLeagues(data)
      } catch (error) {
        console.error('Failed to load leagues:', error)
      } finally {
        setLoadingLeagues(false)
      }
    }
    loadLeagues()
  }, [])

  function handleModePress(mode: GameMode) {
    setSelectedMode(mode)
    if (mode !== 'era') setSelectedEra(null)
    if (mode !== 'league') setSelectedLeagueState(null)
    if (!MODES.find(m => m.id === mode)?.hasDifficulty) {
      setSelectedDifficulty(null)
    }
  }

  function handleContinue() {
    console.log('[mode-select] selectedMode:', selectedMode, 'selectedEra:', selectedEra, 'selectedDifficulty:', selectedDifficulty, 'selectedLeague:', selectedLeague)
    if (!selectedMode) return
    if (selectedMode === 'era' && !selectedEra) return
    if (selectedMode === 'league' && !selectedLeague) return
    if (MODES.find(m => m.id === selectedMode)?.hasDifficulty && !selectedDifficulty) return

    const selectedModeConfig = MODES.find(m => m.id === selectedMode)
    setMode(selectedMode, selectedEra ?? undefined)
    if (selectedDifficulty) setDifficulty(selectedDifficulty)
    setSelectedLeague(selectedLeague)
    // Store accent color for use in other screens
    if (selectedModeConfig) {
      // @ts-ignore - adding accentColor to store temporarily
      useGameStore.setState({ accentColor: selectedModeConfig.accentColor })
    }
    router.push('/game/formation-select')
  }

  const canContinue = selectedMode !== null &&
    (selectedMode === 'era' ? selectedEra !== null : true) &&
    (selectedMode === 'league' ? selectedLeague !== null : true) &&
    (!MODES.find(m => m.id === selectedMode)?.hasDifficulty || selectedDifficulty !== null)

  const currentMode = MODES.find(m => m.id === selectedMode)
  const visibleModes = MODES.filter(m => m.category === selectedCategory)

  return (
    <View style={styles.container}>
      {/* header */}
      <View style={styles.header}>
        <BackButton />
        <Text style={styles.title}>Choose Mode</Text>
        <View style={{ width: 32 }} />
      </View>

      {/* normal / special switcher */}
      <View style={styles.segmentRow}>
        {CATEGORIES.map(cat => {
          const active = selectedCategory === cat.id
          return (
            <Pressable
              key={cat.id}
              style={[styles.segment, active && styles.segmentActive]}
              onPress={() => setSelectedCategory(cat.id)}
            >
              <Text style={[styles.segmentText, active && styles.segmentTextActive]}>
                {cat.label}
              </Text>
            </Pressable>
          )
        })}
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {visibleModes.map(mode => {
          const selected = selectedMode === mode.id
          return (
            <PressCard
              key={mode.id}
              style={[
                styles.card,
                selected && {
                  borderColor: mode.accentColor,
                  borderWidth: 2,
                  backgroundColor: mode.accentColor + '0D',   // ~5% tint — selection reads instantly
                },
              ]}
              onPress={() => handleModePress(mode.id)}
            >
              <View style={styles.cardHeader}>
                <View style={[styles.cardIconTile, { backgroundColor: mode.accentColor + '1E' }]}>
                  {mode.image ? (
                    <Image
                      source={mode.image}
                      style={styles.cardImage}
                      resizeMode="contain"
                    />
                  ) : (
                    <Text style={styles.cardEmoji}>{mode.emoji}</Text>
                  )}
                </View>
                <View style={styles.cardTitles}>
                  <Text style={styles.cardTitle}>{mode.title}</Text>
                  <Text style={styles.cardSubtitle}>{mode.subtitle}</Text>
                </View>
                <View style={[
                  styles.radioOuter,
                  selected && { borderColor: mode.accentColor }
                ]}>
                  {selected && (
                    <View style={[styles.radioInner, { backgroundColor: mode.accentColor }]} />
                  )}
                </View>
              </View>

              <Text style={styles.cardDescription}>{mode.description}</Text>

              {/* era picker — only shows when era mode selected */}
              {mode.id === 'era' && selected && (
                <View style={styles.pickerSection}>
                  <Text style={styles.pickerLabel}>Choose era:</Text>
                  <View style={styles.pickerGrid}>
                    {ERAS.map(era => (
                      <Pressable
                        key={era.id}
                        style={[
                          styles.pickerChip,
                          selectedEra === era.id && [styles.pickerChipSelected, { backgroundColor: mode.accentColor, borderColor: mode.accentColor }]
                        ]}
                        onPress={() => setSelectedEra(era.id)}
                      >
                        <Text style={[
                          styles.pickerChipText,
                          selectedEra === era.id && styles.pickerChipTextSelected
                        ]}>
                          {era.label}
                        </Text>
                      </Pressable>
                    ))}
                  </View>
                  {selectedEra?.endsWith('+') && (
                    <Text style={styles.pickerHint}>
                      + means that era and everything after it
                    </Text>
                  )}
                </View>
              )}

              {/* league picker — only shows when league mode selected */}
              {mode.id === 'league' && selected && (
                <View style={styles.pickerSection}>
                  <Text style={styles.pickerLabel}>Choose league:</Text>
                  {loadingLeagues ? (
                    <ActivityIndicator color={colors.accent} />
                  ) : (
                    <View style={styles.pickerGrid}>
                      {leagues.map(league => (
                        <Pressable
                          key={league.id}
                          style={[
                            styles.pickerChip,
                            selectedLeague === league.id && [styles.pickerChipSelected, { backgroundColor: mode.accentColor, borderColor: mode.accentColor }]
                          ]}
                          onPress={() => setSelectedLeagueState(league.id)}
                        >
                          <Text style={[
                            styles.pickerChipText,
                            selectedLeague === league.id && styles.pickerChipTextSelected
                          ]}>
                            {league.name}
                          </Text>
                        </Pressable>
                      ))}
                    </View>
                  )}
                </View>
              )}

              {/* difficulty picker — only shows for modes with difficulty */}
              {mode.hasDifficulty && selected && (
                <View style={styles.pickerSection}>
                  <Text style={styles.pickerLabel}>Choose difficulty:</Text>
                  <View style={styles.pickerGrid}>
                    {DIFFICULTIES.map(diff => (
                      <Pressable
                        key={diff.id}
                        style={[
                          styles.pickerChip,
                          selectedDifficulty === diff.id && [styles.pickerChipSelected, { backgroundColor: mode.accentColor, borderColor: mode.accentColor }]
                        ]}
                        onPress={() => setSelectedDifficulty(diff.id)}
                      >
                        <Text style={[
                          styles.pickerChipText,
                          selectedDifficulty === diff.id && styles.pickerChipTextSelected
                        ]}>
                          {diff.label}
                        </Text>
                      </Pressable>
                    ))}
                  </View>
                  {selectedDifficulty && (
                    <Text style={styles.pickerHint}>
                      {DIFFICULTIES.find(d => d.id === selectedDifficulty)?.description}
                    </Text>
                  )}

                  {/* Custom difficulty panel — three live knobs. Edits write
                      straight to the store's customDifficulty so they're in place
                      the moment Continue is tapped. */}
                  {selectedDifficulty === 'custom' && (() => {
                    const c = customDifficulty
                    const info = screwLevelInfo(c.screwLevel)
                    const acc = mode.accentColor
                    return (
                      <View style={styles.customPanel}>
                        {/* rerolls */}
                        <View style={styles.customRow}>
                          <Text style={styles.customLabel}>Rerolls</Text>
                          <Text style={[styles.customValue, { color: acc }]}>{c.rerolls}</Text>
                        </View>
                        <StepSlider min={0} max={10} value={c.rerolls} accent={acc}
                          onChange={v => setCustomDifficulty({ ...c, rerolls: v })} />
                        <Text style={styles.customNote}>More rerolls = an easier draft, but a real cut to your final score.</Text>

                        {/* ratings toggle */}
                        <Pressable style={styles.customToggleRow} onPress={() => setCustomDifficulty({ ...c, ratingsShown: !c.ratingsShown })}>
                          <View style={{ flex: 1 }}>
                            <Text style={styles.customLabel}>Show ratings</Text>
                            <Text style={styles.customNote}>{c.ratingsShown ? 'OVRs visible while drafting.' : 'Draft blind — no OVRs. Harder, worth more.'}</Text>
                          </View>
                          <View style={[styles.switch, c.ratingsShown && { backgroundColor: acc, borderColor: acc }]}>
                            <View style={[styles.switchKnob, c.ratingsShown && styles.switchKnobOn]} />
                          </View>
                        </Pressable>

                        {/* screw-level */}
                        <View style={[styles.customRow, { marginTop: spacing.sm }]}>
                          <Text style={styles.customLabel}>Difficulty</Text>
                          <Text style={[styles.customValue, { color: acc }]}>{info.name} · {c.screwLevel}/10</Text>
                        </View>
                        <StepSlider min={1} max={10} value={c.screwLevel} accent={acc}
                          onChange={v => setCustomDifficulty({ ...c, screwLevel: v })} />
                        <Text style={styles.customTagline}>{info.tagline}</Text>
                      </View>
                    )
                  })()}
                </View>
              )}
            </PressCard>
          )
        })}
      </ScrollView>

      {/* continue button */}
      <View style={styles.footer}>
        <Pressable
          style={({ pressed }) => [
            styles.continueBtn,
            !canContinue && styles.continueBtnDisabled,
            selectedMode && { backgroundColor: currentMode?.accentColor || colors.accent },
            pressed && canContinue && { opacity: 0.85, transform: [{ scale: 0.985 }] },
          ]}
          onPress={handleContinue}
          disabled={!canContinue}
        >
          <Text style={styles.continueBtnText}>
            {selectedMode ? `Continue with ${currentMode?.title}` : 'Select a mode'}
          </Text>
          {canContinue && <Ionicons name="arrow-forward" size={16} color={colors.textPrimary} />}
        </Pressable>
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    flex:            1,
    backgroundColor: colors.bg,
  },
  header: {
    flexDirection:     'row',
    alignItems:        'center',
    justifyContent:    'space-between',
    paddingHorizontal: spacing.lg,
    paddingTop:        56,
    paddingBottom:     spacing.md,
  },
  back: {
    width:           32,
    height:          32,
    alignItems:      'center',
    justifyContent:  'center',
  },
  backText: {
    color:    colors.textPrimary,
    fontSize: typography.xl,
  },
  title: {
    fontSize:   typography.xl,
    fontWeight: typography.black,
    color:      colors.textPrimary,
  },
  segmentRow: {
    flexDirection:     'row',
    backgroundColor:   colors.bgCard,
    borderRadius:      radius.full,
    borderWidth:       1,
    borderColor:       colors.border,
    padding:           4,
    gap:               4,
    marginHorizontal:  spacing.lg,
    marginBottom:      spacing.md,
  },
  segment: {
    flex:            1,
    paddingVertical: spacing.sm,
    borderRadius:    radius.full,
    alignItems:      'center',
  },
  segmentActive: {
    backgroundColor: colors.accent,
  },
  segmentText: {
    fontSize:   typography.sm,
    fontWeight: typography.bold,
    color:      colors.textSecondary,
  },
  segmentTextActive: {
    color: colors.textPrimary,
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: spacing.lg,
    paddingBottom:     spacing.xl,
    gap:               spacing.md,
  },
  card: {
    backgroundColor: colors.bgCard,
    borderRadius:    radius.lg,
    borderWidth:     1,
    borderColor:     colors.border,
    padding:         spacing.lg,
    gap:             spacing.sm,
    ...shadows.sm,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems:    'center',
    gap:           spacing.md,
  },
  cardIconTile: {
    width:          48,
    height:         48,
    borderRadius:   radius.md,
    alignItems:     'center',
    justifyContent: 'center',
  },
  cardEmoji: {
    fontSize: 26,
  },
  cardImage: {
    width: 36,
    height: 36,
  },
  cardTitles: {
    flex: 1,
  },
  cardTitle: {
    fontSize:   typography.md,
    fontWeight: typography.bold,
    color:      colors.textPrimary,
  },
  cardSubtitle: {
    fontSize:  typography.sm,
    color:     colors.textSecondary,
    marginTop: 2,
  },
  radioOuter: {
    width:           20,
    height:          20,
    borderRadius:    10,
    borderWidth:     2,
    borderColor:     colors.border,
    alignItems:      'center',
    justifyContent:  'center',
  },
  radioInner: {
    width:        10,
    height:       10,
    borderRadius: 5,
  },
  cardDescription: {
    fontSize:   typography.sm,
    color:      colors.textSecondary,
    lineHeight: 20,
  },
  cardMeta: {
    flexDirection: 'row',
    gap:           spacing.sm,
    marginTop:     spacing.xs,
  },
  metaBadge: {
    backgroundColor: colors.bgElevated,
    borderRadius:    radius.full,
    paddingHorizontal: spacing.sm,
    paddingVertical:   3,
  },
  metaBadgeDanger: {
    backgroundColor: '#3F1010',
  },
  metaText: {
    fontSize: typography.xs,
    color:    colors.textSecondary,
  },
  eraPicker: {
    marginTop:       spacing.md,
    borderTopWidth:  1,
    borderTopColor:  colors.border,
    paddingTop:      spacing.md,
    gap:             spacing.sm,
  },
  eraLabel: {
    fontSize:   typography.sm,
    color:      colors.textSecondary,
    fontWeight: typography.medium,
  },
  eraGrid: {
    flexDirection: 'row',
    flexWrap:      'wrap',
    gap:           spacing.sm,
  },
  eraChip: {
    backgroundColor:   colors.bgElevated,
    borderRadius:      radius.full,
    paddingHorizontal: spacing.md,
    paddingVertical:   spacing.sm,
    borderWidth:       1,
    borderColor:       colors.border,
  },
  eraChipSelected: {
    backgroundColor: colors.accent,
    borderColor:     colors.accent,
  },
  eraChipText: {
    fontSize: typography.sm,
    color:    colors.textSecondary,
  },
  eraChipTextSelected: {
    color:      colors.textPrimary,
    fontWeight: typography.bold,
  },
  eraHint: {
    fontSize:  typography.xs,
    color:     colors.textMuted,
    fontStyle: 'italic',
  },
  footer: {
    paddingHorizontal: spacing.lg,
    paddingBottom:     spacing.xl,
    paddingTop:        spacing.md,
    borderTopWidth:    1,
    borderTopColor:    colors.border,
  },
  continueBtn: {
    backgroundColor: colors.accent,
    borderRadius:    radius.md,
    paddingVertical: spacing.md,
    alignItems:      'center',
    justifyContent:  'center',
    flexDirection:   'row',
    gap:             spacing.sm,
    ...shadows.md,
  },
  continueBtnDisabled: {
    opacity: 0.4,
  },
  continueBtnText: {
    fontSize:      typography.md,
    fontWeight:    typography.black,
    color:         colors.textPrimary,
    letterSpacing: 1,
  },
  continueBtnActive: {
    backgroundColor: colors.accent,
  },
  pickerSection: {
    marginTop:       spacing.md,
    borderTopWidth:  1,
    borderTopColor:  colors.border,
    paddingTop:      spacing.md,
    gap:             spacing.sm,
  },
  pickerLabel: {
    fontSize:   typography.sm,
    color:      colors.textSecondary,
    fontWeight: typography.medium,
  },
  pickerGrid: {
    flexDirection: 'row',
    flexWrap:      'wrap',
    gap:           spacing.sm,
  },
  pickerChip: {
    backgroundColor:   colors.bgElevated,
    borderRadius:      radius.full,
    paddingHorizontal: spacing.md,
    paddingVertical:   spacing.sm,
    borderWidth:       1,
    borderColor:       colors.border,
  },
  pickerChipSelected: {
    backgroundColor: colors.accent,
    borderColor:     colors.accent,
  },
  pickerChipText: {
    fontSize: typography.sm,
    color:    colors.textSecondary,
  },
  pickerChipTextSelected: {
    color:      colors.textPrimary,
    fontWeight: typography.bold,
  },
  pickerHint: {
    fontSize:  typography.xs,
    color:     colors.textMuted,
    fontStyle: 'italic',
  },

  // ── custom difficulty panel ──
  customPanel: {
    marginTop: spacing.sm, gap: 2,
    borderTopWidth: 1, borderTopColor: colors.border, paddingTop: spacing.sm,
  },
  customRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  customLabel: { fontSize: typography.sm, fontWeight: typography.bold, color: colors.textPrimary },
  customValue: { fontSize: typography.sm, fontWeight: typography.black },
  customNote: { fontSize: 10, color: colors.textMuted, marginBottom: spacing.xs },
  customTagline: { fontSize: typography.xs, color: colors.textSecondary, fontStyle: 'italic', marginTop: 2 },
  customToggleRow: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.md,
    marginTop: spacing.sm, paddingVertical: 2,
  },
  switch: { width: 46, height: 26, borderRadius: 13, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.bgElevated, padding: 2, justifyContent: 'center' },
  switchKnob: { width: 20, height: 20, borderRadius: 10, backgroundColor: colors.textMuted },
  switchKnobOn: { backgroundColor: colors.textPrimary, alignSelf: 'flex-end' },
})
