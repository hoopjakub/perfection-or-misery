import React from 'react'
import { View, Text, StyleSheet, ScrollView } from 'react-native'
import { PressCard } from '@/components/ui'
import { TitleWithInfo, InfoBubble } from '@/components/InfoBubble'
import { colors, spacing, typography, radius } from '@/theme'
import type { CLKnockoutMatch } from '@/engine/cl-sim'
import type { WCKnockoutMatch } from '@/engine/world-cup-sim'
import type { QualTie } from '@/engine/cl-qualifying'
import { getFlag } from '@/lib/flagMap'

// Shared "Knockout Rounds" list (Big Fixes §1) — the ONE tie-row look used by
// WC knockouts, CL (classic) knockouts, CL (full) qualifiers, and CL (full)
// knockouts (live and static). Replaces the old per-file `BracketView`
// (cramped 158px-wide side-scrolling columns) and the live WC view's separate
// "featured match + Elsewhere in the round" layout. `clKoMatchToRow` /
// `wcKoMatchToRow` below adapt each mode's own tie shape into the shared
// `KoTieVM` — kept alongside the view so there's exactly one place that knows
// how a CL/WC tie becomes a row (qualifying ties reuse `clKoMatchToRow` via
// `qualTieToKoMatch`, CustomUclViewers.tsx's existing QualTie→CLKnockoutMatch
// adapter).
export type KoTieVM = {
  id: string
  teamAName: string
  teamBName: string
  teamAFlag?: string   // WC only — club ties show text, no crest (repo convention)
  teamBFlag?: string
  winnerIsA: boolean
  isPlayerTie: boolean
  bye?: boolean            // qualifying byes — teamA advances unopposed
  directA?: boolean        // ◆ marker — entered this round directly (e.g. R16 seeds 1-8)
  directB?: boolean
  scoreLabel?: string      // "3 – 2" (aggregate for two-legged, or the single score)
  inlineSuffix?: string    // "(AET)" / "(P 5-4)" — single-leg (WC) style, next to the score
  subLine?: string         // "2-0 · 0-3 · AET" — leg-by-leg breakdown, two-legged style
  // The live-reveal "this just happened" state (simulation.tsx): a richer,
  // highlighted card with the scorers and an ADVANCES/ELIMINATED caption,
  // shown once for whichever tie just resolved before it folds into the flat
  // list like every other row.
  justDecided?: { scorersLine?: string; outcomeLine: string; outcomeColor: string }
  onPress?: () => void
}

export type KoRoundVM = {
  key: string
  label: string
  sub?: string
  infoTopic?: string
  ties: KoTieVM[]
}

export function KnockoutRoundsView({
  title, infoTopic, accent, rounds, maxHeight = 480, headerRight, footer,
}: {
  title: string
  infoTopic?: string
  accent: string
  rounds: KoRoundVM[]
  maxHeight?: number
  headerRight?: React.ReactNode
  footer?: React.ReactNode
}) {
  return (
    <View>
      <View style={styles.header}>
        {infoTopic
          ? <TitleWithInfo title={title} topic={infoTopic} style={[styles.title, { color: accent }]} accent={accent} />
          : <Text style={[styles.title, { color: accent }]}>{title}</Text>}
        {headerRight}
      </View>
      <ScrollView style={{ maxHeight }} nestedScrollEnabled showsVerticalScrollIndicator contentContainerStyle={styles.scrollContent}>
        {rounds.map(r => (
          <View key={r.key} style={styles.roundBlock}>
            <View style={styles.roundHeaderRow}>
              <Text style={styles.roundLabel}>{r.label}</Text>
              {r.infoTopic && <InfoBubble topic={r.infoTopic} accent={accent} size={15} />}
            </View>
            {!!r.sub && <Text style={styles.roundSub}>{r.sub}</Text>}
            {r.ties.map(t => <KnockoutTieRow key={t.id} tie={t} accent={accent} />)}
          </View>
        ))}
      </ScrollView>
      {footer}
    </View>
  )
}

// Exported so QualifyingLadder (round → path sub-grouping is qualifying-
// specific and doesn't fit KnockoutRoundsView's flatter round list) can reuse
// the exact same row look instead of its own — one row component, everywhere.
export function KnockoutTieRow({ tie, accent }: { tie: KoTieVM; accent: string }) {
  if (tie.bye) {
    return (
      <View style={[styles.row, tie.isPlayerTie && { borderColor: accent, borderWidth: 2 }]}>
        <View style={styles.teamsRow}>
          <View style={styles.teamCell}>
            {tie.teamAFlag && <Text style={styles.flag}>{tie.teamAFlag}</Text>}
            <Text style={[styles.teamName, styles.won]} numberOfLines={1}>{tie.teamAName}</Text>
          </View>
          <Text style={styles.byeText}>bye — advances without playing</Text>
        </View>
      </View>
    )
  }
  const expanded = tie.justDecided
  return (
    <PressCard
      style={[
        styles.row,
        tie.isPlayerTie && !expanded && { borderColor: accent, borderWidth: 2 },
        !!expanded && [styles.rowExpanded, { borderColor: expanded!.outcomeColor }],
      ]}
      onPress={tie.onPress}
      disabled={!tie.onPress}
    >
      <View style={styles.teamsRow}>
        <View style={styles.teamCell}>
          {tie.teamAFlag && <Text style={styles.flag}>{tie.teamAFlag}</Text>}
          <Text style={[styles.teamName, tie.winnerIsA ? styles.won : styles.lost]} numberOfLines={1}>
            {tie.directA && <Text style={styles.directMarker}>◆ </Text>}{tie.teamAName}
          </Text>
        </View>
        <View style={styles.scoreCell}>
          <Text style={styles.scoreText} numberOfLines={1}>
            {tie.scoreLabel}{tie.inlineSuffix ? <Text style={styles.suffixText}> {tie.inlineSuffix}</Text> : null}
          </Text>
          {!!tie.subLine && <Text style={styles.subLineText}>{tie.subLine}</Text>}
        </View>
        <View style={[styles.teamCell, styles.teamCellRight]}>
          <Text style={[styles.teamName, styles.teamNameRight, !tie.winnerIsA ? styles.won : styles.lost]} numberOfLines={1}>
            {tie.directB && <Text style={styles.directMarker}>◆ </Text>}{tie.teamBName}
          </Text>
          {tie.teamBFlag && <Text style={styles.flag}>{tie.teamBFlag}</Text>}
        </View>
      </View>
      {expanded && (
        <View style={styles.expandedBlock}>
          {!!expanded.scorersLine && <Text style={styles.expandedScorers} numberOfLines={2}>{expanded.scorersLine}</Text>}
          <Text style={[styles.expandedOutcome, { color: expanded.outcomeColor }]}>{expanded.outcomeLine}</Text>
        </View>
      )}
    </PressCard>
  )
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: spacing.xs },
  title: { fontSize: typography.lg, fontWeight: typography.black },
  scrollContent: { paddingBottom: spacing.xs },

  roundBlock: { marginBottom: spacing.md },
  roundHeaderRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, marginBottom: 2 },
  roundLabel: { fontSize: typography.sm, fontWeight: typography.black, color: colors.textPrimary },
  roundSub: { fontSize: 10, color: colors.textMuted, marginBottom: spacing.xs },

  row: {
    backgroundColor: colors.bgElevated, borderRadius: radius.md,
    borderWidth: 1, borderColor: colors.border,
    paddingVertical: spacing.sm, paddingHorizontal: spacing.md,
    marginBottom: spacing.xs, minHeight: 44,
  },
  rowExpanded: { borderWidth: 1.5, paddingVertical: spacing.md },

  teamsRow: { flexDirection: 'row', alignItems: 'center' },
  teamCell: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 6 },
  teamCellRight: { justifyContent: 'flex-end' },
  flag: { fontSize: 16 },
  teamName: { fontSize: typography.sm, flexShrink: 1 },
  teamNameRight: { textAlign: 'right' },
  won: { color: colors.textPrimary, fontWeight: typography.bold },
  lost: { color: colors.textMuted, fontWeight: typography.medium },
  directMarker: { color: colors.tiers.perfection },

  scoreCell: { alignItems: 'center', paddingHorizontal: spacing.sm, minWidth: 64 },
  scoreText: { fontSize: typography.md, fontWeight: typography.black, color: colors.textPrimary },
  suffixText: { fontSize: 10, fontWeight: typography.medium, color: colors.textMuted },
  subLineText: { fontSize: 9, color: colors.textMuted, marginTop: 1 },

  byeText: { flex: 2, fontSize: 9, color: colors.warning, fontWeight: typography.bold, textAlign: 'right', lineHeight: 12 },

  expandedBlock: { marginTop: spacing.sm, paddingTop: spacing.sm, borderTopWidth: 1, borderTopColor: colors.border, gap: 2 },
  expandedScorers: { fontSize: 11, color: colors.textSecondary },
  expandedOutcome: { fontSize: typography.xs, fontWeight: typography.black, letterSpacing: 0.5 },
})

// ── Adapters: mode tie shape → KoTieVM ───────────────────────────────────────

// CL (classic + full) — two-legged (playoff/r16/qf/sf) or single-match (final).
// `directIds` marks clubs that entered THIS round directly (e.g. R16 seeds
// 1-8 skipping the playoff) with the ◆ marker.
export function clKoMatchToRow(
  m: CLKnockoutMatch, directIds?: Set<string>, onPress?: () => void,
  justDecided?: { scorersLine?: string; outcomeLine: string; outcomeColor: string },
): KoTieVM {
  const winnerIsA = m.winner.clubId === m.teamA.clubId
  let subLine: string | undefined
  let inlineSuffix: string | undefined
  if (m.leg1) {
    const parts = [`${m.leg1.aGoals}-${m.leg1.bGoals}`]
    if (m.leg2) parts.push(`${m.leg2.aGoals}-${m.leg2.bGoals}`)
    if (m.extraTime) parts.push('AET')
    if (m.aPens !== undefined) parts.push(`pens ${m.aPens}-${m.bPens}`)
    subLine = parts.join(' · ')
  } else {
    inlineSuffix = m.aPens !== undefined ? `(P ${m.aPens}-${m.bPens})` : m.extraTime ? '(AET)' : undefined
  }
  return {
    id: `${m.round}-${m.teamA.clubId}-${m.teamB.clubId}`,
    teamAName: m.teamA.clubName, teamBName: m.teamB.clubName,
    winnerIsA, isPlayerTie: m.teamA.isPlayer || m.teamB.isPlayer,
    directA: !!directIds?.has(m.teamA.clubId), directB: !!directIds?.has(m.teamB.clubId),
    scoreLabel: `${m.aGoals} – ${m.bGoals}`,
    inlineSuffix, subLine, onPress, justDecided,
  }
}

// World Cup — single match, nations carry flags. `justDecided` is only set by
// the live sim (the tie that just resolved); the static result screen never
// passes it, so every tie there renders as a flat row.
export function wcKoMatchToRow(
  m: WCKnockoutMatch,
  opts?: { onPress?: () => void; justDecided?: { scorersLine?: string; outcomeLine: string; outcomeColor: string } },
): KoTieVM {
  const winnerIsA = m.winner.clubId === m.teamA.clubId
  const inlineSuffix = m.result.homePens !== null ? `(P ${m.result.homePens}-${m.result.awayPens})` : m.result.extraTime ? '(AET)' : undefined
  return {
    id: `${m.round}-${m.teamA.clubId}-${m.teamB.clubId}`,
    teamAName: m.teamA.clubName, teamBName: m.teamB.clubName,
    teamAFlag: getFlag(m.teamA.clubId) ?? undefined,
    teamBFlag: getFlag(m.teamB.clubId) ?? undefined,
    winnerIsA, isPlayerTie: m.teamA.isPlayer || m.teamB.isPlayer,
    scoreLabel: `${m.result.homeGoals} – ${m.result.awayGoals}`,
    inlineSuffix,
    onPress: opts?.onPress, justDecided: opts?.justDecided,
  }
}

// CL (full) qualifying ties — used by QualifyingLadder, which keeps its own
// round → path (champions/league) grouping but renders every row through
// this + KnockoutTieRow so qualifiers, League Phase knockouts, and the final
// all read as the same list.
export function qualTieToKoRow(
  t: QualTie, onPress?: () => void,
  justDecided?: { scorersLine?: string; outcomeLine: string; outcomeColor: string },
): KoTieVM {
  const isPlayerTie = t.teamA.isPlayer || !!t.teamB?.isPlayer
  if (!t.teamB || !t.legs) {
    return { id: `${t.round}-${t.path}-${t.teamA.clubId}`, teamAName: t.teamA.clubName, teamBName: '', winnerIsA: true, isPlayerTie, bye: true }
  }
  const { legs } = t
  const parts = [`${legs.leg1.homeGoals}-${legs.leg1.awayGoals}`, `${legs.leg2.homeGoals}-${legs.leg2.awayGoals}`]
  if (legs.extraTime) parts.push('AET')
  if (legs.homePens !== null) parts.push(`pens ${legs.homePens}-${legs.awayPens}`)
  return {
    id: `${t.round}-${t.path}-${t.teamA.clubId}-${t.teamB.clubId}`,
    teamAName: t.teamA.clubName, teamBName: t.teamB.clubName,
    winnerIsA: t.winnerId === t.teamA.clubId, isPlayerTie,
    scoreLabel: `${legs.totalA} – ${legs.totalB}`,
    subLine: parts.join(' · '),
    onPress, justDecided,
  }
}
