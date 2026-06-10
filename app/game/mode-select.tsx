import { View, Text, StyleSheet, Pressable, ScrollView } from 'react-native'
import { router } from 'expo-router'
import { useGameStore, GameMode } from '@/store/gameStore'
import { colors, spacing, typography, radius, shadows } from '@/theme'

type ModeConfig = {
  id: GameMode
  title: string
  subtitle: string
  description: string
  emoji: string
  accentColor: string
  rerolls: number
  ratingsHidden: boolean
}

const MODES: ModeConfig[] = [
  {
    id:            'league',
    title:         'League Mode',
    subtitle:      'One league, all eras',
    description:   'Pick a league. Every spin comes from that league across all available seasons. Placement stays within it too.',
    emoji:         '🏴',
    accentColor:   colors.accent,
    rerolls:       1,
    ratingsHidden: false,
  },
  {
    id:            'all_time',
    title:         'All Time',
    subtitle:      'Any league, any era',
    description:   'The full pool. Any club, any season, any league. The main experience.',
    emoji:         '🌍',
    accentColor:   '#10B981',
    rerolls:       3,
    ratingsHidden: false,
  },
  {
    id:            'era',
    title:         'Era Mode',
    subtitle:      'Pick a decade',
    description:   'Lock the draft to a specific decade. All clubs, all leagues — but only from your chosen era.',
    emoji:         '📅',
    accentColor:   '#8B5CF6',
    rerolls:       3,
    ratingsHidden: false,
  },
  {
    id:            'chaos',
    title:         'Chaos Mode',
    subtitle:      'No mercy',
    description:   'Ratings hidden. No rerolls. Placement weighting disabled — you could end up anywhere. For masochists.',
    emoji:         '💀',
    accentColor:   '#EF4444',
    rerolls:       0,
    ratingsHidden: true,
  },
  {
    id:            'cursed',
    title:         'Cursed Mode',
    subtitle:      'You asked for this',
    description:   'Like Chaos but you also have no idea which position you\'re drafting for until after you pick.',
    emoji:         '☠️',
    accentColor:   '#DC2626',
    rerolls:       0,
    ratingsHidden: true,
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

export default function ModeSelectScreen() {
  const { startRun } = useGameStore()
  const [selectedMode, setSelectedMode] = React.useState<GameMode | null>(null)
  const [selectedEra,  setSelectedEra]  = React.useState<string | null>(null)

  function handleModePress(mode: GameMode) {
    setSelectedMode(mode)
    if (mode !== 'era') setSelectedEra(null)
  }

  function handleContinue() {
    if (!selectedMode) return
    if (selectedMode === 'era' && !selectedEra) return
    router.push('/game/formation-select')
  }

  const canContinue = selectedMode !== null &&
    (selectedMode !== 'era' || selectedEra !== null)

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
                <Text style={styles.cardEmoji}>{mode.emoji}</Text>
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

              <View style={styles.cardMeta}>
                <View style={styles.metaBadge}>
                  <Text style={styles.metaText}>
                    {mode.rerolls === 0 ? 'No rerolls' : `${mode.rerolls} reroll${mode.rerolls > 1 ? 's' : ''}`}
                  </Text>
                </View>
                {mode.ratingsHidden && (
                  <View style={[styles.metaBadge, styles.metaBadgeDanger]}>
                    <Text style={styles.metaText}>Ratings hidden</Text>
                  </View>
                )}
              </View>

              {/* era picker — only shows when era mode selected */}
              {mode.id === 'era' && selected && (
                <View style={styles.eraPicker}>
                  <Text style={styles.eraLabel}>Choose era:</Text>
                  <View style={styles.eraGrid}>
                    {ERAS.map(era => (
                      <Pressable
                        key={era.id}
                        style={[
                          styles.eraChip,
                          selectedEra === era.id && styles.eraChipSelected
                        ]}
                        onPress={() => setSelectedEra(era.id)}
                      >
                        <Text style={[
                          styles.eraChipText,
                          selectedEra === era.id && styles.eraChipTextSelected
                        ]}>
                          {era.label}
                        </Text>
                      </Pressable>
                    ))}
                  </View>
                  {selectedEra?.endsWith('+') && (
                    <Text style={styles.eraHint}>
                      + means that era and everything after it
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
          style={[styles.continueBtn, !canContinue && styles.continueBtnDisabled]}
          onPress={handleContinue}
          disabled={!canContinue}
        >
          <Text style={styles.continueBtnText}>
            {selectedMode ? `Continue with ${MODES.find(m => m.id === selectedMode)?.title}` : 'Select a mode'}
          </Text>
        </Pressable>
      </View>
    </View>
  )
}

// missing React import
import React from 'react'

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
})