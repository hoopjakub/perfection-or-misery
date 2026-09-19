import React from 'react'
import { View, StyleSheet } from 'react-native'
import { router } from 'expo-router'
import { ROLES, space } from '@/theme'
import { KitText, SectionTag, Plate } from '@/components/kit'
import { SaveStatusLine } from '@/components/ui'
import { ResultRow } from './SeasonParts'
import { summariseScorers } from '@/engine/run-stats'
import type { MatchScorers } from '@/types/stats'

// The pieces every result screen shares (P8-54, P8-71): the figures under the
// verdict, a section with its heading, and the plates at the foot. League, UCL,
// UCL full path and World Cup results are one design, so they're one set of parts.
const roles = ROLES.nylon

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

export function ResultSection({ title, right, children }: { title: string; right?: React.ReactNode; children: React.ReactNode }) {
  return (
    <View style={styles.section}>
      <View style={styles.head}>
        <SectionTag roles={roles}>{title}</SectionTag>
        {right}
      </View>
      {children}
    </View>
  )
}

/**
 * The foot of a result: a live run saves and offers Play again / Home; a run
 * opened from history just goes back.
 */
export function ResultActions({ fromHistory, submitting, save, onAgain, onHome }: {
  fromHistory: boolean
  submitting: boolean
  save?: { status: Parameters<typeof SaveStatusLine>[0]['status']; retry: () => void }
  onAgain: () => void
  onHome: () => void
}) {
  if (fromHistory) {
    return (
      <View style={styles.plates}>
        <Plate label="Back" icon="back" variant="secondary" roles={roles} onPress={() => router.back()} />
      </View>
    )
  }
  return (
    <View style={styles.plates}>
      {save && <SaveStatusLine status={save.status} onRetry={save.retry} />}
      <Plate label="Play again" icon="again" roles={roles} loading={submitting} onPress={onAgain} />
      <Plate label="Back to home" variant="secondary" roles={roles} disabled={submitting} onPress={onHome} />
    </View>
  )
}

type MatchLike = {
  matchday: number
  home: { clubId: string; clubName: string; isPlayer?: boolean }
  away: { clubId: string; clubName: string; isPlayer?: boolean }
  homeGoals: number; awayGoals: number; scorers?: MatchScorers
}

/** Your matches in a phase (league phase, group), as the season's result rows. */
export function YourMatches<M extends MatchLike>({ matches, onOpen }: { matches: M[]; onOpen?: (m: M) => void }) {
  const mine = matches.filter(m => m.home.isPlayer || m.away.isPlayer).sort((a, b) => a.matchday - b.matchday)
  return (
    <>
      {mine.map((m, i) => (
        <ResultRow key={i} roles={roles} homeName={m.home.clubName} awayName={m.away.clubName}
          homeGoals={m.homeGoals} awayGoals={m.awayGoals} youSide={m.home.isPlayer ? 'home' : 'away'}
          scorers={[summariseScorers(m.scorers?.home), summariseScorers(m.scorers?.away)].filter(Boolean).join(' · ') || undefined}
          onPress={onOpen ? () => onOpen(m) : undefined} />
      ))}
    </>
  )
}

const styles = StyleSheet.create({
  figures: { flexDirection: 'row', flexWrap: 'wrap', gap: space[4], marginTop: space[5] },
  figure: { minWidth: 44 },
  section: { gap: space[2], marginTop: space[6] },
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: space[2] },
  plates: { gap: space[3], marginTop: space[6] },
})
