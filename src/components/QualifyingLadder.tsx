import React from 'react'
import { View, Text, StyleSheet, Pressable } from 'react-native'
import { colors, spacing, typography, radius, MODE_THEMES } from '@/theme'
import { QUAL_ROUND_ORDER, QUAL_ROUND_LABEL, PATH_LABEL } from '@/data/cl-qual-labels'
import type { QualTie } from '@/engine/cl-qualifying'

const CL = MODE_THEMES.champions_league

// What winning a round actually gets you — shown under each round header so
// the ladder reads like a story, not just a list of scorelines.
const ROUND_NEXT: Record<string, string> = {
  q1: 'winners climb to the Second Qualifying Round',
  q2: 'winners climb to the Third Qualifying Round',
  q3: 'winners reach the Play-off Round — one tie from the League Phase',
  playoff: 'winners claim a place in the 36-club League Phase',
}

// Shared renderer for the custom Champions League qualifying ladder — used by
// the live qualifying-reveal screen and the result page, so both look and read
// identically. Groups ties by round, then by path (Champions/League). Pass
// `onTiePress` to make ties tappable (opens the leg-by-leg detail).
export function QualifyingLadder({ ties, onTiePress }: { ties: QualTie[]; onTiePress?: (t: QualTie) => void }) {
  return (
    <View style={{ gap: spacing.md }}>
      {QUAL_ROUND_ORDER.map(round => {
        const inRound = ties.filter(t => t.round === round)
        if (inRound.length === 0) return null
        const realTies = inRound.filter(t => t.teamB && t.legs).length
        const byes = inRound.length - realTies
        return (
          <View key={round} style={styles.qualRoundBlock}>
            <Text style={styles.qualRoundLabel}>{QUAL_ROUND_LABEL[round]}</Text>
            <Text style={styles.qualRoundDetail}>
              {realTies} two-legged {realTies === 1 ? 'tie' : 'ties'}
              {byes > 0 ? ` + ${byes} bye${byes > 1 ? 's' : ''}` : ''} · {ROUND_NEXT[round] ?? ''} · losers are out of the Champions League
            </Text>
            {(['champions', 'league'] as const).map(path => {
              const inPath = inRound.filter(t => t.path === path)
              if (inPath.length === 0) return null
              return (
                <View key={path} style={styles.qualPathBlock}>
                  <Text style={styles.qualPathLabel}>{PATH_LABEL[path]}</Text>
                  {inPath.map((t, i) => <QualTieRow key={i} tie={t} onPress={onTiePress ? () => onTiePress(t) : undefined} />)}
                </View>
              )
            })}
          </View>
        )
      })}
    </View>
  )
}

export function QualTieRow({ tie, onPress }: { tie: QualTie; onPress?: () => void }) {
  const isPM = tie.teamA.isPlayer || tie.teamB?.isPlayer
  if (!tie.teamB || !tie.legs) {
    return (
      <View style={[styles.qualTie, isPM && styles.qualTiePlayer]}>
        <Text style={[styles.qualTieName, styles.qualWon]} numberOfLines={1}>{tie.teamA.clubName}</Text>
        <Text style={styles.qualTieBye}>bye — advances without playing (odd number of entrants; the strongest side sits the round out)</Text>
      </View>
    )
  }
  const aWon = tie.winnerId === tie.teamA.clubId
  const { legs } = tie
  const pens = legs.homePens != null ? ` · pens ${legs.homePens}-${legs.awayPens}` : legs.extraTime ? ' · AET' : ''
  const legStr = `${legs.leg1.homeGoals}-${legs.leg1.awayGoals}, ${legs.leg2.homeGoals}-${legs.leg2.awayGoals}`
  return (
    <Pressable style={[styles.qualTie, isPM && styles.qualTiePlayer]} onPress={onPress} disabled={!onPress}>
      <Text style={[styles.qualTieName, aWon && styles.qualWon, tie.teamA.isPlayer && styles.qualPlayerName]} numberOfLines={1}>{tie.teamA.clubName}</Text>
      <View style={styles.qualScoreCol}>
        <Text style={styles.qualAgg}>{legs.totalA}–{legs.totalB}</Text>
        <Text style={styles.qualLegs}>{legStr}{pens}</Text>
      </View>
      <Text style={[styles.qualTieName, styles.qualTieRight, !aWon && styles.qualWon, tie.teamB.isPlayer && styles.qualPlayerName]} numberOfLines={1}>{tie.teamB.clubName}</Text>
    </Pressable>
  )
}

const styles = StyleSheet.create({
  qualRoundBlock: { gap: spacing.xs },
  qualRoundLabel: { fontSize: typography.sm, fontWeight: typography.black, color: colors.textPrimary },
  qualRoundDetail: { fontSize: 9, color: colors.textMuted, lineHeight: 13 },
  qualPathBlock: { gap: 3, paddingLeft: spacing.xs, marginTop: 2 },
  qualPathLabel: { fontSize: 9, fontWeight: typography.bold, color: CL.accent, textTransform: 'uppercase', letterSpacing: 1 },
  qualTie: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, paddingVertical: 4, borderBottomWidth: 1, borderBottomColor: colors.border },
  qualTiePlayer: { backgroundColor: CL.accent + '11', borderRadius: radius.sm },
  qualTieName: { flex: 1, fontSize: 11, color: colors.textMuted },
  qualTieRight: { textAlign: 'right' },
  qualWon: { color: colors.textPrimary, fontWeight: typography.bold },
  qualPlayerName: { color: CL.accent },
  qualScoreCol: { alignItems: 'center', minWidth: 78 },
  qualAgg: { fontSize: 12, fontWeight: typography.black, color: colors.textSecondary },
  qualLegs: { fontSize: 8, color: colors.textMuted },
  qualTieBye: { flex: 2, fontSize: 9, color: colors.warning, fontWeight: typography.bold, textAlign: 'right', lineHeight: 12 },
})
