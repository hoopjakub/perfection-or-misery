import React, { useState, useEffect } from 'react'
import { View, Text, StyleSheet, Pressable, ScrollView, ActivityIndicator, Image } from 'react-native'
import { router } from 'expo-router'
import { useGameStore, GameMode, type Difficulty } from '@/store/gameStore'
import { getAvailableLeagues, type LeagueOption } from '@/db/queries/seasons'
import { colors, spacing, typography, radius, shadows } from '@/theme'

type ModeConfig = {
  id: GameMode
  title: string
  subtitle: string
  description: string
  emoji: string
  accentColor: string
  hasDifficulty: boolean
  image?: any // Image require statement
}

const MODES: ModeConfig[] = [
  {
    id:            'all_time',
    title:         'All Time',
    subtitle:      'Any league, any era',
    description:   'The full pool. Any club, any season, any league. The main experience.',
    emoji:         '🌍',
    accentColor:   '#10B981',
    hasDifficulty: true,
  },
  {
    id:            'league',
    title:         'League Mode',
    subtitle:      'One league, all eras',
    description:   'Pick a league. Every spin comes from that league across all available seasons. Placement stays within it too.',
    emoji:         '🏴',
    accentColor:   colors.accent,
    hasDifficulty: true,
  },
  {
    id:            'era',
    title:         'Era Mode',
    subtitle:      'Pick a decade',
    description:   'Lock the draft to a specific decade. All clubs, all leagues — but only from your chosen era.',
    emoji:         '📅',
    accentColor:   '#8B5CF6',
    hasDifficulty: true,
  },
  {
    id:            'champions_league',
    title:         'Champions League',
    subtitle:      'European elite',
    description:   'Only the best clubs from Europe\'s top competitions. Compete for the ultimate prize.',
    emoji:         '🏆',
    accentColor:   '#1A237E',
    hasDifficulty: true,
    image:         require('../../assets/modes/champions-league.png'),
  },
  {
    id:            'world_cup',
    title:         'World Cup',
    subtitle:      'Global glory',
    description:   'National teams from around the world. Draft your squad and lead your country to victory.',
    emoji:         '⚽',
    accentColor:   '#FFD700',
    hasDifficulty: true,
    image:         require('../../assets/modes/world-cup.png'),
  },
  {
    id:            'chaos',
    title:         'Chaos Mode',
    subtitle:      'No mercy',
    description:   'Ratings hidden. No rerolls. Placement weighting disabled — you could end up anywhere.',
    emoji:         '💀',
    accentColor:   '#EF4444',
    hasDifficulty: false,
  },
  {
    id:            'cursed',
    title:         'Cursed Mode',
    subtitle:      'You asked for this',
    description:   'Like Chaos but you also have no idea which position you\'re drafting for until after you pick.',
    emoji:         '☠️',
    accentColor:   '#DC2626',
    hasDifficulty: false,
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
  { id: 'easy', label: 'Easy', description: '3 rerolls, ratings shown' },
  { id: 'medium', label: 'Medium', description: '1 reroll, ratings shown' },
  { id: 'hard', label: 'Hard', description: 'No rerolls, ratings hidden' },
]

export default function ModeSelectScreen() {
  const { setMode, setDifficulty, setSelectedLeague, setAccentColor } = useGameStore()
  const [selectedMode, setSelectedMode] = useState<GameMode | null>(null)
  const [selectedEra, setSelectedEra] = useState<string | null>(null)
  const [selectedDifficulty, setSelectedDifficulty] = useState<Difficulty | null>(null)
  const [selectedLeague, setSelectedLeagueState] = useState<string | null>(null)
  const [leagues, setLeagues] = useState<LeagueOption[]>([])
  const [loadingLeagues, setLoadingLeagues] = useState(false)

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

  return (
    <View style={styles.container}>
      {/* header */}
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.back}>
          <Text style={styles.backText}>←</Text>
        </Pressable>
        <Text style={styles.title}>Choose Mode</Text>
        <View style={{ width: 32 }} />
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {MODES.map(mode => {
          const selected = selectedMode === mode.id
          return (
            <Pressable
              key={mode.id}
              style={[
                styles.card,
                selected && { borderColor: mode.accentColor, borderWidth: 2 }
              ]}
              onPress={() => handleModePress(mode.id)}
            >
              <View style={styles.cardHeader}>
                {mode.image ? (
                  <Image 
                    source={mode.image} 
                    style={styles.cardImage}
                    resizeMode="contain"
                  />
                ) : (
                  <Text style={styles.cardEmoji}>{mode.emoji}</Text>
                )}
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
                          selectedEra === era.id && styles.pickerChipSelected
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
                            selectedLeague === league.id && styles.pickerChipSelected
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
                          selectedDifficulty === diff.id && styles.pickerChipSelected
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
                </View>
              )}
            </Pressable>
          )
        })}
      </ScrollView>

      {/* continue button */}
      <View style={styles.footer}>
        <Pressable
          style={[
            styles.continueBtn,
            !canContinue && styles.continueBtnDisabled,
            selectedMode && { backgroundColor: currentMode?.accentColor || colors.accent }
          ]}
          onPress={handleContinue}
          disabled={!canContinue}
        >
          <Text style={styles.continueBtnText}>
            {selectedMode ? `Continue with ${currentMode?.title}` : 'Select a mode'}
          </Text>
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
  cardEmoji: {
    fontSize: 28,
  },
  cardImage: {
    width: 40,
    height: 40,
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
})
