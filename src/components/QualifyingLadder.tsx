import React from 'react'
import { View, StyleSheet } from 'react-native'
import { MODE_THEMES, ROLES, prim, space } from '@/theme'
import { KitText, SectionTag } from '@/components/kit'
import { QUAL_ROUND_ORDER, QUAL_ROUND_LABEL, PATH_LABEL } from '@/data/cl-qual-labels'
import { KnockoutTieRow, qualTieToKoRow } from '@/components/KnockoutRoundsView'
import type { QualTie } from '@/engine/cl-qualifying'
import { EUROPE } from '@/data/europe'

const COMPS = ['ucl', 'uel', 'uecl'] as const

const CL = MODE_THEMES.champions_league
const roles = ROLES.nylon

// What winning a round gets you, under each round's heading, so the ladder
// reads like a story. One short line (P8-113: "too much text"); it was a
// sentence per round plus "losers are out of the UEFA Champions League".
const ROUND_NEXT: Record<string, string> = {
  q1: 'WINNERS TO Q2', q2: 'WINNERS TO Q3', q3: 'WINNERS TO THE PLAY-OFF', playoff: 'WINNERS TO THE LEAGUE PHASE',
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
            <SectionTag roles={roles}>{many ? `${EUROPE[c].short} · ${QUAL_ROUND_LABEL[round]}` : QUAL_ROUND_LABEL[round]}</SectionTag>
            <KitText t="tag" color={roles.textMuted}>
              {[`${realTies} ${realTies === 1 ? 'TIE' : 'TIES'}`, byes > 0 ? `${byes} ${byes === 1 ? 'BYE' : 'BYES'}` : null, ROUND_NEXT[round]].filter(Boolean).join(' · ')}
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
                  <KitText t="tag" color={roles.text}>{PATH_LABEL[path].toUpperCase()}</KitText>
                  {sorted.map((t, i) => {
                    const decided = justDecidedTie === t
                    const winnerIsPlayer = (t.teamA.isPlayer && t.winnerId === t.teamA.clubId) || (!!t.teamB?.isPlayer && t.winnerId === t.teamB.clubId)
                    return (
                      <KnockoutTieRow
                        key={i}
                        accent={CL.accent}
                        tie={qualTieToKoRow(t, onTiePress ? () => onTiePress(t) : undefined, decided ? {
                          outcomeLine: winnerIsPlayer ? 'YOU ADVANCE' : "YOU'RE ELIMINATED",
                          outcomeColor: winnerIsPlayer ? prim.volt : prim.misery,   // knocked out: misery red (P8-74)
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
  qualRoundBlock: { gap: space[1] },
  qualPathBlock: { gap: 2, marginTop: space[2] },
})
