import React from 'react'
import { View, Text, StyleSheet } from 'react-native'
import { colors, spacing, typography, MODE_THEMES } from '@/theme'
import { QUAL_ROUND_ORDER, QUAL_ROUND_LABEL, PATH_LABEL } from '@/data/cl-qual-labels'
import { KnockoutTieRow, qualTieToKoRow } from '@/components/KnockoutRoundsView'
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
// identically. Groups ties by round, then by path (Champions/League) — that
// grouping is qualifying-specific, but every row itself is the SAME
// `KnockoutTieRow` the knockout rounds and final use (Big Fixes §1).
export function QualifyingLadder({ ties, onTiePress, justDecidedTie }: {
  ties: QualTie[]
  onTiePress?: (t: QualTie) => void
  // The tie whose live watch just finished — same "colored row + ADVANCES/
  // ELIMINATED caption" treatment knockout ties already get (Big Fixes
  // feedback: qualifiers had none). Only ever one at a time (the live view's
  // current round), so identity match is enough — no id scheme needed.
  justDecidedTie?: QualTie
}) {
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
              {byes > 0 ? ` + ${byes} bye${byes > 1 ? 's' : ''}` : ''} · {ROUND_NEXT[round] ?? ''} · losers are out of the UEFA Champions League
            </Text>
            {(['champions', 'league'] as const).map(path => {
              const inPath = inRound.filter(t => t.path === path)
              if (inPath.length === 0) return null
              // Your own tie first in its path group — no hunting through a
              // long list to find the one that matters (maintainer feedback).
              const isPlayerTie = (t: QualTie) => t.teamA.isPlayer || !!t.teamB?.isPlayer
              const sorted = [...inPath].sort((a, b) => Number(isPlayerTie(b)) - Number(isPlayerTie(a)))
              return (
                <View key={path} style={styles.qualPathBlock}>
                  <Text style={styles.qualPathLabel}>{PATH_LABEL[path]}</Text>
                  {sorted.map((t, i) => {
                    const decided = justDecidedTie === t
                    const winnerIsPlayer = (t.teamA.isPlayer && t.winnerId === t.teamA.clubId) || (!!t.teamB?.isPlayer && t.winnerId === t.teamB.clubId)
                    return (
                      <KnockoutTieRow
                        key={i}
                        accent={CL.accent}
                        tie={qualTieToKoRow(t, onTiePress ? () => onTiePress(t) : undefined, decided ? {
                          outcomeLine: winnerIsPlayer ? 'YOU ADVANCE' : "YOU'RE ELIMINATED",
                          outcomeColor: winnerIsPlayer ? colors.success : colors.danger,
                        } : undefined)}
                      />
                    )
                  })}
                </View>
              )
            })}
          </View>
        )
      })}
    </View>
  )
}

const styles = StyleSheet.create({
  qualRoundBlock: { gap: spacing.xs },
  qualRoundLabel: { fontSize: typography.sm, fontWeight: typography.black, color: colors.textPrimary },
  qualRoundDetail: { fontSize: 9, color: colors.textMuted, lineHeight: 13 },
  qualPathBlock: { gap: 3, paddingLeft: spacing.xs, marginTop: 2 },
  qualPathLabel: { fontSize: 9, fontWeight: typography.bold, color: CL.accent, textTransform: 'uppercase', letterSpacing: 1 },
})
