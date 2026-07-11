 import React, { useState } from 'react'
import {
  View, Text, StyleSheet, Pressable, ScrollView
} from 'react-native'
import { router } from 'expo-router'
import { useGameStore, Formation } from '@/store/gameStore'
import { getSlotsForFormation, getFormationRows } from '@/engine/formations'
import { colors, spacing, typography, radius, shadows } from '@/theme'
import { useModeTheme } from '@/hooks/useModeTheme'

type FormationConfig = {
  id: Formation
  label: string
  description: string
}

// Shape (visual grid rows) comes from getFormationRows — same source of truth
// the draft screen and pitch views use, so the diagram here always matches
// what you'll actually see once you're drafting.
const FORMATIONS: FormationConfig[] = [
  {
    id:          '4-3-3',
    label:       '4-3-3',
    description: 'Classic attacking setup. Three forwards give you width and a goal threat. Works best with technical midfielders.',
  },
  {
    id:          '4-4-2',
    label:       '4-4-2',
    description: 'The English classic. Two strikers up top, a solid midfield bank of four. Balanced and reliable.',
  },
  {
    id:          '4-2-3-1',
    label:       '4-2-3-1',
    description: 'Two defensive mids protect the back four while a number 10 links play. The most tactically flexible.',
  },
  {
    id:          '3-5-2',
    label:       '3-5-2',
    description: 'Three at the back with wing-backs providing width. Requires versatile players but can dominate midfield.',
  },
  {
    id:          '5-3-2',
    label:       '5-3-2',
    description: 'Defensively solid with five at the back. Wing-backs push forward in attack. Built to grind results.',
  },
  {
    id:          '3-4-3',
    label:       '3-4-3',
    description: 'Three centre-backs and attacking wing-backs feed a front three. High-risk, high-reward — exposed on the counter.',
  },
  {
    id:          '4-1-4-1',
    label:       '4-1-4-1',
    description: 'A lone striker and a banked four in midfield, shielded by a single holding mid. Compact and hard to break down.',
  },
  {
    id:          '4-3-1-2',
    label:       '4-3-1-2',
    description: 'Two strikers fed by a playmaker in the hole, with a flat three behind. Narrow and direct through the middle.',
  },
  {
    id:          '4-1-2-1-2',
    label:       '4-1-2-1-2',
    description: 'The narrow diamond. A holding mid, two box-to-box runners, and a number 10 all stacked centrally behind two strikers.',
  },
  {
    id:          '5-4-1',
    label:       '5-4-1',
    description: 'Five at the back, a flat four ahead, one striker up top. Maximum defensive solidity — built to sit deep and hit on the break.',
  },
  {
    id:          '3-4-2-1',
    label:       '3-4-2-1',
    description: 'Back three, wing-back width, and two roaming 10s behind a lone striker. Fluid and creative in the final third.',
  },
]

function FormationVisual({ shape, accentColor }: {
  shape: string[][]
  accentColor: string
}) {
  return (
    <View style={visualStyles.container}>
      {shape.map((row, rowIdx) => (
        <View key={rowIdx} style={visualStyles.row}>
          {row.map((pos, posIdx) => (
            <View
              key={posIdx}
              style={[visualStyles.dot, { backgroundColor: accentColor }]}
            >
              <Text style={visualStyles.dotLabel}>{pos}</Text>
            </View>
          ))}
        </View>
      ))}
    </View>
  )
}

const visualStyles = StyleSheet.create({
  container: {
    gap:        6,
    alignItems: 'center',
    paddingVertical: spacing.sm,
  },
  row: {
    flexDirection:  'row',
    gap:            8,
    justifyContent: 'center',
  },
  dot: {
    width:          20,
    height:         20,
    borderRadius:   13,
    alignItems:     'center',
    justifyContent: 'center',
  },    
  dotLabel: {
    fontSize:   6,
    fontWeight: '700',
    color:      '#fff',
  },
})

export default function FormationSelectScreen() {
  const { mode, era, startRun } = useGameStore()
  const theme = useModeTheme()
  const [selected, setSelected] = useState<Formation>('4-3-3')

  function handleContinue() {
    if (!mode) {
        console.log('[formation] mode is null — cannot continue')
        return
    }
    console.log('[formation] starting run with mode:', mode, 'formation:', selected)
    startRun(mode, selected, era ?? undefined)
    router.push('/game/draft')
    }

  const selectedConfig = FORMATIONS.find(f => f.id === selected)!

  return (
    <View style={[styles.container, { backgroundColor: theme.bgTint }]}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.back}>
          <Text style={styles.backText}>←</Text>
        </Pressable>
        <Text style={[styles.title, { color: theme.accent }]}>Formation</Text>
        <View style={{ width: 32 }} />
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        <Text style={styles.sectionLabel}>Choose your shape</Text>

        {/* formation cards */}
        <View style={styles.formationGrid}>
          {FORMATIONS.map(f => {
            const isSelected = selected === f.id
            return (
              <Pressable
                key={f.id}
                style={[
                  styles.formationCard,
                  isSelected && {
                    borderColor: theme.accent,
                    borderWidth: 2
                  }
                ]}
                onPress={() => setSelected(f.id)}
              >
                <FormationVisual
                  shape={getFormationRows(f.id)}
                  accentColor={isSelected ? theme.accent : colors.bgElevated}
                />
                <Text style={[
                  styles.formationLabel,
                  isSelected && styles.formationLabelSelected,
                  isSelected && { color: theme.accent }
                ]}>
                  {f.label}
                </Text>
              </Pressable>
            )
          })}
        </View>

        {/* selected formation info */}
        <View style={styles.infoCard}>
          <Text style={styles.infoTitle}>{selectedConfig.label}</Text>
          <Text style={styles.infoDescription}>{selectedConfig.description}</Text>

          {/* slot breakdown */}
          <View style={styles.slotList}>
            {getSlotsForFormation(selected).map((slot, idx) => (
              <View key={idx} style={styles.slotRow}>
                <View style={[
                  styles.slotBadge,
                  { backgroundColor: (colors.positions as any)[slot.primary] + '33' }
                ]}>
                  <Text style={[
                    styles.slotBadgeText,
                    { color: (colors.positions as any)[slot.primary] }
                  ]}>
                    {slot.label}
                  </Text>
                </View>
                {slot.accepts.length > 0 && (
                  <Text style={styles.slotAccepts}>
                    accepts: {slot.accepts.join(', ')}
                  </Text>
                )}
              </View>
            ))}
          </View>
        </View>
      </ScrollView>

      <View style={styles.footer}>
        <Pressable style={[styles.continueBtn, { backgroundColor: theme.accent }]} onPress={handleContinue}>
          <Text style={styles.continueBtnText}>
            Draft with {selected}
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
    width:          32,
    height:         32,
    alignItems:     'center',
    justifyContent: 'center',
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
    gap:               spacing.lg,
  },
  sectionLabel: {
    fontSize:   typography.sm,
    color:      colors.textSecondary,
    fontWeight: typography.medium,
    marginTop:  spacing.sm,
  },
  formationGrid: {
    flexDirection: 'row',
    flexWrap:      'wrap',
    gap:           spacing.sm,
  },
  formationCard: {
    width:           '47%',
    backgroundColor: colors.bgCard,
    borderRadius:    radius.lg,
    borderWidth:     1,
    borderColor:     colors.border,
    padding:         spacing.md,
    alignItems:      'center',
    gap:             spacing.xs,
    ...shadows.sm,
  },
  formationCardSelected: {
    borderColor: colors.accent,
    borderWidth: 2,
  },
  formationLabel: {
    fontSize:   typography.md,
    fontWeight: typography.black,
    color:      colors.textSecondary,
  },
  formationLabelSelected: {
    color: colors.accent,
  },
  infoCard: {
    backgroundColor: colors.bgCard,
    borderRadius:    radius.lg,
    borderWidth:     1,
    borderColor:     colors.border,
    padding:         spacing.lg,
    gap:             spacing.md,
  },
  infoTitle: {
    fontSize:   typography.xl,
    fontWeight: typography.black,
    color:      colors.textPrimary,
  },
  infoDescription: {
    fontSize:   typography.sm,
    color:      colors.textSecondary,
    lineHeight: 20,
  },
  slotList: {
    gap:             spacing.xs,
    borderTopWidth:  1,
    borderTopColor:  colors.border,
    paddingTop:      spacing.md,
  },
  slotRow: {
    flexDirection: 'row',
    alignItems:    'center',
    gap:           spacing.sm,
  },
  slotBadge: {
    borderRadius:      radius.sm,
    paddingHorizontal: spacing.sm,
    paddingVertical:   3,
    minWidth:          44,
    alignItems:        'center',
  },
  slotBadgeText: {
    fontSize:   typography.xs,
    fontWeight: typography.bold,
  },
  slotAccepts: {
    fontSize: typography.xs,
    color:    colors.textMuted,
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
  continueBtnText: {
    fontSize:      typography.md,
    fontWeight:    typography.black,
    color:         colors.textPrimary,
    letterSpacing: 1,
  },
})