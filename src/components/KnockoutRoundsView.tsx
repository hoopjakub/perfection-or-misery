import React from 'react'
import { View, StyleSheet, ScrollView } from 'react-native'
import { TitleWithInfo, InfoBubble } from '@/components/InfoBubble'
import { ROLES, space } from '@/theme'
import { KitText, SectionTag } from '@/components/kit'
import { TieRow, type TieVM } from '@/components/season/SeasonParts'

// Every knockout, qualifying and result list renders through the shared tie
// row (src/components/season/SeasonParts.tsx), so a tie reads the same
// everywhere. These screens are all nylon.
const roles = ROLES.nylon
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
  title, infoTopic, rounds, maxHeight = 480, headerRight, footer,
}: {
  title: string
  infoTopic?: string
  accent?: string          // no longer drawn; kept so callers needn't change
  rounds: KoRoundVM[]
  maxHeight?: number
  headerRight?: React.ReactNode
  footer?: React.ReactNode
}) {
  return (
    <View>
      {(title || headerRight) ? <View style={styles.header}>
        {infoTopic
          ? <TitleWithInfo title={title} topic={infoTopic} style={styles.title} accent={roles.text} />
          : <KitText t="superS" color={roles.text}>{title.toUpperCase()}</KitText>}
        {headerRight}
      </View> : null}
      <ScrollView style={{ maxHeight }} nestedScrollEnabled showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>
        {rounds.map(r => (
          <View key={r.key} style={styles.roundBlock}>
            <View style={styles.roundHeaderRow}>
              <SectionTag roles={roles}>{r.label}</SectionTag>
              {r.infoTopic && <InfoBubble topic={r.infoTopic} size={15} />}
            </View>
            {!!r.sub && <KitText t="body" color={roles.textMuted}>{r.sub}</KitText>}
            {r.ties.map(t => <KnockoutTieRow key={t.id} tie={t} />)}
          </View>
        ))}
      </ScrollView>
      {footer}
    </View>
  )
}

// Exported so QualifyingLadder (its round → path grouping is qualifying-
// specific) renders the exact same row as every other screen.
export function KnockoutTieRow({ tie }: { tie: KoTieVM; accent?: string }) {
  return <TieRow roles={roles} tie={koTieToVM(tie)} />
}

function koTieToVM(t: KoTieVM): TieVM {
  return {
    id: t.id, aName: t.teamAName, bName: t.teamBName,
    aFlag: t.teamAFlag, bFlag: t.teamBFlag,
    score: t.scoreLabel?.replace(/\s*–\s*/, '–'),
    detail: [t.subLine, t.inlineSuffix?.replace(/[()]/g, '')].filter(Boolean).join(' · ') || undefined,
    winnerIsA: t.winnerIsA, isPlayerTie: t.isPlayerTie, bye: t.bye,
    directA: t.directA, directB: t.directB,
    scorers: t.justDecided?.scorersLine,
    note: t.justDecided?.outcomeLine,
    onPress: t.onPress,
  }
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: space[2] },
  title: { fontSize: 22, color: roles.text },
  scrollContent: { paddingBottom: space[2] },
  roundBlock: { marginBottom: space[3] },
  roundHeaderRow: { flexDirection: 'row', alignItems: 'center', gap: space[2] },
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
