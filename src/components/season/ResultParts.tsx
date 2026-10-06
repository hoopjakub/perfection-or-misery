import { t } from '@/i18n'
import React from 'react'
import { View, StyleSheet } from 'react-native'
import { router } from 'expo-router'
import { ROLES, space } from '@/theme'
import { COLUMN } from '@/hooks/useSizeClass'
import { KitText, Plate } from '@/components/kit'
import { SaveStatusLine } from '@/components/ui'
import { EVERYDAY } from '@/lib/appearance'

// The pieces of the one result screen (P8-54, P8-71, Wave F): the figures
// under the verdict and the actions. The sections and your-matches lists the
// four old screens drew inline now live in the run hub.
const roles = ROLES[EVERYDAY]

/** The run in big figures: points, record, goals. */
export function ResultFigures({ items }: { items: [label: string, value: string | number][] }) {
  return (
    <View style={styles.figures}>
      {items.map(([l, v]) => (
        <View key={l} style={styles.figure}>
          <KitText t="figureL" color={roles.text}>{String(v)}</KitText>
          <KitText t="tag" color={roles.textMuted}>{l}</KitText>
        </View>
      ))}
    </View>
  )
}

/**
 * The foot of a result: a live run saves and offers Play again / Home; a run
 * opened from history just goes back.
 */
export function ResultActions({ fromHistory, submitting, save, onAgain, onHome, compact }: {
  fromHistory: boolean
  /** In the pinned bar (Wave F): no space above. */
  compact?: boolean
  submitting: boolean
  save?: { status: Parameters<typeof SaveStatusLine>[0]['status']; retry: () => void }
  onAgain: () => void
  onHome: () => void
}) {
  if (fromHistory) {
    return (
      <View style={[styles.plates, compact && { marginTop: 0 }]}>
        <Plate label={t('season.back')} icon="back" variant="secondary" roles={roles} onPress={() => router.back()} />
      </View>
    )
  }
  return (
    <View style={[styles.plates, compact && { marginTop: 0 }]}>
      {save && <SaveStatusLine status={save.status} onRetry={save.retry} />}
      <Plate label={t('season.playAgain')} icon="again" roles={roles} loading={submitting} onPress={onAgain} />
      <Plate label={t('season.backHome')} variant="secondary" roles={roles} disabled={submitting} onPress={onHome} />
    </View>
  )
}

const styles = StyleSheet.create({
  figures: { flexDirection: 'row', flexWrap: 'wrap', gap: space[4], marginTop: space[5] },
  figure: { minWidth: 44 },
  // The closing plates keep the reading column's width on a wide window.
  plates: { gap: space[3], marginTop: space[6], width: '100%', maxWidth: COLUMN, alignSelf: 'center' },
})
