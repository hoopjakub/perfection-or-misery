import React from 'react'
import { View, StyleSheet, ScrollView } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { ROLES, space, border } from '@/theme'
import { KitText, Plate, Tag, ClubName } from '@/components/kit'
import { BracketTree, type BracketColumn } from '@/components/BracketTree'

// Kit Drop (docs/ui-overhaul/07c C5): square ties on nylon, your tie tagged,
// unknown slots as ? tags, and a visible fit control beside the gesture hint.
const roles = ROLES.nylon

// A pre-knockout overview: the whole draw as a bracket before a ball is kicked,
// your tie highlighted. The tree itself, and its pinch-zoom-and-pan canvas, is
// the shared BracketTree (P8-79), the same one the run hub and the result
// screens draw a finished knockout with.
type TieTeam = { clubId: string; clubName: string; isPlayer: boolean }
export type PreviewTie = { teamA: TieTeam; teamB: TieTeam }
export type RoadRound = { label: string; count: number }   // a round AFTER the first, with its REAL tie count

export function BracketPreview({
  firstLabel, firstTies, road, onStart, title = 'The bracket', startLabel,
}: {
  firstLabel: string
  firstTies: PreviewTie[]
  road: RoadRound[]   // rounds AFTER the first, in order, each with its real tie count
  accent?: string   // no longer drawn; kept so callers needn't change
  onStart: () => void
  title?: string
  startLabel?: string
}) {
  const insets = useSafeAreaInsets()
  const playerTie = firstTies.find(t => t.teamA.isPlayer || t.teamB.isPlayer)
  const opponent = playerTie ? (playerTie.teamA.isPlayer ? playerTie.teamB : playerTie.teamA) : null
  const you = playerTie ? (playerTie.teamA.isPlayer ? playerTie.teamA : playerTie.teamB) : null

  // P8-79: the tree is the shared BracketTree. The first round is the real
  // draw; every round after it is `?` against `?`, sized to the REAL round (a
  // play-off round feeding a same-size round of 16, where seeds wait), not a
  // naive "half the ties every round" guess.
  const columns: BracketColumn[] = [
    { key: 'first', label: firstLabel, ties: firstTies.map(t => ({ a: { clubId: t.teamA.clubId, name: t.teamA.clubName }, b: { clubId: t.teamB.clubId, name: t.teamB.clubName } })) },
    ...road.map((r, i) => ({ key: `r${i}`, label: r.label, ties: Array.from({ length: Math.max(1, r.count) }, () => ({ a: null, b: null })) })),
  ]

  // P8-62: the page scrolls (the title card and hint can push the canvas off a
  // small phone) and starts below the status bar. The canvas has its own
  // height, so vertical drags on it pan the bracket and drags elsewhere scroll.
  return (
    <ScrollView style={{ flex: 1, backgroundColor: roles.bg }}
      contentContainerStyle={[styles.container, { paddingTop: insets.top + space[4], paddingBottom: insets.bottom + space[4] }]}>
      <KitText t="superM" color={roles.text} accessibilityRole="header">{title.toUpperCase()}</KitText>

      {opponent && (
        <View style={[styles.yourTieCard, { borderColor: roles.line, backgroundColor: roles.surface }]}>
          <KitText t="tag" color={roles.textMuted}>{`Your ${firstLabel}`}</KitText>
          <View style={styles.yourTieRow}>
            <Tag roles={roles} variant="you">YOU</Tag>
            <KitText t="tag" color={roles.textMuted}>V</KitText>
            {/* A club wears its crest, a nation its flag — the kit's ClubName does both. */}
            <ClubName roles={roles} clubId={opponent.clubId} name={opponent.clubName} size={20} t="title" style={{ flex: 1 }} />
          </View>
        </View>
      )}

      {road.length > 0 && (
        <KitText t="body" color={roles.textMuted}>{`Win ${road.length + 1} ties and you're champions.`}</KitText>
      )}

      <BracketTree columns={columns} playerClubId={you?.clubId} />

      <Plate label={startLabel ?? (opponent ? `Watch your ${firstLabel.toLowerCase()} tie` : 'Watch it play out')}
        icon="play" roles={roles} onPress={onStart} />
    </ScrollView>
  )
}

const styles = StyleSheet.create({
  container: { paddingHorizontal: space[4], gap: space[3] },
  yourTieCard: { borderWidth: border.plate, padding: space[3], gap: 4 },
  yourTieRow: { flexDirection: 'row', alignItems: 'center', gap: space[2] },
})
