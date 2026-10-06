import { t } from '@/i18n'
// Ties are named `t` in this file's callbacks; `tr` is t() where that shadows it.
const tr = t
import { label } from '@/i18n/labels'
import React from 'react'
import { View, StyleSheet } from 'react-native'
import { space } from '@/theme'
import { KitText, SectionTag } from '@/components/kit'
import { QUAL_ROUND_ORDER, QUAL_ROUND_LABEL, PATH_LABEL } from '@/data/cl-qual-labels'
import { tieVM, TieRow } from '@/components/season/SeasonParts'
import { qualTie } from '@/engine/stages'
import type { QualTie } from '@/engine/cl-qualifying'
import { EUROPE } from '@/data/europe'
import { useScreenRoles } from '@/lib/appearance'

const COMPS = ['ucl', 'uel', 'uecl'] as const

// P8.5-25: the ground comes from the screen this sits on (useScreenRoles).
// What winning a round gets you, under each round's heading, so the ladder
// reads like a story. One short line (P8-113: "too much text"); it was a
// sentence per round plus "losers are out of the UEFA Champions League".
const ROUND_NEXT: Record<string, string> = {
  q1: t('parts.roundNext.q1'), q2: t('parts.roundNext.q2'), q3: t('parts.roundNext.q3'), playoff: t('parts.roundNext.playoff'),
}

// Shared renderer for the custom Champions League qualifying ladder — used by
// the live qualifying-reveal screen and the result page, so both look and read
// identically. Groups ties by round, then by path (Champions/League) — that
// grouping is qualifying-specific, but every row itself is the SAME
// `TieRow` every knockout round and final use (Big Fixes §1), built by `tieVM`.
export function QualifyingLadder({ ties, onTiePress, justDecidedTie }: {
  ties: QualTie[]
  onTiePress?: (t: QualTie) => void
  // The tie whose live watch just finished — same "colored row + ADVANCES/
  // ELIMINATED caption" treatment knockout ties already get (Big Fixes
  // feedback: qualifiers had none). Only ever one at a time (the live view's
  // current round), so identity match is enough — no id scheme needed.
  justDecidedTie?: QualTie
}) {
  const roles = useScreenRoles()
  // P8-52: three ladders. Each competition's round is its own block, named
  // when the list holds more than one of them.
  const many = new Set(ties.map(t => t.comp ?? 'ucl')).size > 1
  return (
    <View style={{ gap: space[3] }}>
      {/* The newest round on top, as the knockouts are (P8-63): the round being
          played is the one you want, and it was at the bottom of a long list. */}
      {[...QUAL_ROUND_ORDER].reverse().flatMap(round => COMPS.map(c => [round, c] as const)).map(([round, c]) => {
        const inRound = ties.filter(t => t.round === round && (t.comp ?? 'ucl') === c)
        if (inRound.length === 0) return null
        const realTies = inRound.filter(t => t.teamB && t.legs).length
        const byes = inRound.length - realTies
        return (
          <View key={`${c}-${round}`} style={styles.qualRoundBlock}>
            <SectionTag roles={roles}>{many ? `${EUROPE[c].short} · ${label(QUAL_ROUND_LABEL[round])}` : label(QUAL_ROUND_LABEL[round])}</SectionTag>
            <KitText t="tag" color={roles.textMuted}>
              {[t('parts.ties', { count: realTies }), byes > 0 ? t('parts.byes', { count: byes }) : null, ROUND_NEXT[round]].filter(Boolean).join(' · ')}
            </KitText>
            {(['champions', 'league'] as const).map(path => {
              const inPath = inRound.filter(t => t.path === path)
              if (inPath.length === 0) return null
              // Your own tie first in its path group — no hunting through a
              // long list to find the one that matters (maintainer feedback).
              const isPlayerTie = (t: QualTie) => t.teamA.isPlayer || !!t.teamB?.isPlayer
              const sorted = [...inPath].sort((a, b) => Number(isPlayerTie(b)) - Number(isPlayerTie(a)))
              return (
                <View key={path} style={styles.qualPathBlock}>
                  <KitText t="tag" color={roles.text}>{label(PATH_LABEL[path]).toUpperCase()}</KitText>
                  {sorted.map((t, i) => {
                    const decided = justDecidedTie === t
                    const winnerIsPlayer = (t.teamA.isPlayer && t.winnerId === t.teamA.clubId) || (!!t.teamB?.isPlayer && t.winnerId === t.teamB.clubId)
                    return (
                      <TieRow
                        key={i} roles={roles}
                        tie={tieVM(qualTie(t), {
                          onPress: onTiePress ? () => onTiePress(t) : undefined,
                          justDecided: decided ? { outcomeLine: winnerIsPlayer ? tr('parts.youAdvance') : tr('parts.youOut') } : undefined,
                        })}
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
  qualRoundBlock: { gap: space[1] },
  qualPathBlock: { gap: 2, marginTop: space[2] },
})
