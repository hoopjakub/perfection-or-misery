// The XI on a pitch, for the match-stats screen's Lineup tab (§10.5 phase 2).
//
// Distinct from `LineupPitch`, which draws YOUR drafted squad during a run from
// DraftedPlayers. This one draws a FINISHED match from the regenerated sheet:
// it takes the shape the side actually lined up in plus their per-player lines,
// so every shirt carries that player's real rating, goals, assists, cards and
// sub minute.
//
// Rows come from `getFormationRows` — the same formation list the player picks
// from — which is what makes a 3-4-3 look like a 3-4-3 instead of every side
// collapsing into the same generic blocks.

import React from 'react'
import { View, Text, StyleSheet, Pressable } from 'react-native'
import { colors, spacing, typography, radius, ratingColor, prim, font } from '@/theme'
import { getFormationRows } from '@/engine/formations'
import type { Formation } from '@/types/game'
import type { LineupShape, PlayerMatchLine } from '@/types/match-stats'

const lastName = (n: string) => n.split(' ').slice(-1)[0]

const GOAL = 'G'          // football
const OWN_GOAL = 'OG' // goal net
const INJURY = 'INJ'   // adhesive bandage — §10.5 phase 4
const ASSIST = 'A'   // target

/**
 * Goals, assists and cards — shown identically wherever a player appears,
 * pitch or bench. Previously only a single goal icon was drawn, and only for
 * starters, so a hat-trick looked like one goal and anything achieved off the
 * bench was invisible.
 */
function Contributions({ l, compact }: { l: PlayerMatchLine; compact?: boolean }) {
  const size = compact ? 9 : 10
  const parts: React.ReactNode[] = []
  if (l.goals > 0) {
    parts.push(<Text key="g" style={{ fontSize: size }}>{GOAL}{l.goals > 1 && (<Text style={{ color: prim.cotton }}> {l.goals}</Text>)}</Text>)
  }
  if (l.ownGoals > 0) {
    parts.push(<Text key="og" style={{ fontSize: size }}>{OWN_GOAL}{l.ownGoals > 1 && (<Text style={{ color: prim.cotton }}> {l.ownGoals}</Text>)}</Text>)
  }
  if (l.assists > 0) {
    parts.push(<Text key="a" style={{ fontSize: size - 1 }}>{ASSIST}{l.assists > 1 && (<Text style={{ color: prim.cotton }}> {l.assists}</Text>)}</Text>)
  }
  if (l.yellowCard && !l.redCard) parts.push(<View key="y" style={styles.pipYellow} />)
  if (l.redCard) parts.push(<View key="r" style={styles.pipRed} />)
  // §10.5 phase 4 — he didn't just come off, he came off injured, and how long
  // he's out for is the thing you actually want to know from a lineup.
  if (l.injured) parts.push(<Text key="i" style={{ fontSize: size }}>{INJURY}</Text>)
  if (parts.length === 0) return null
  return <View style={compact ? styles.pips : styles.benchPips}>{parts}</View>
}

export function MatchLineupPitch({ shape, players, accent, onPressPlayer, showRatings = true }: {
  shape: LineupShape
  players: PlayerMatchLine[]     // one side's lines
  accent: string
  onPressPlayer?: (l: PlayerMatchLine) => void
  /** §7 — off for the pre-kickoff team sheet: nothing has happened yet, so a
   *  rating would be both meaningless and a spoiler. */
  showRatings?: boolean
}) {
  const byId = new Map(players.map(p => [p.playerId, p]))
  const rows = getFormationRows(shape.formation as Formation)

  // Slot labels repeat within a formation (three CMs, two CBs…), so walk the
  // row layout consuming the shape's slots in order — first unused slot with a
  // matching label wins. That keeps a player in the position they were picked
  // for rather than being re-derived from their card position.
  const remaining = [...shape.slots]
  const take = (label: string) => {
    const i = remaining.findIndex(s => s.label === label)
    if (i === -1) return undefined
    return remaining.splice(i, 1)[0]
  }

  return (
    <View style={styles.pitch}>
      {/* Attack at the top, keeper at the bottom — same reading order as the
          formation rows themselves. */}
      {rows.map((row, ri) => (
        <View key={ri} style={styles.row}>
          {row.map((label, ci) => {
            const slot = take(label)
            const line = slot ? byId.get(slot.playerId) : undefined
            return (
              <PitchPlayer
                key={`${ri}-${ci}`} label={label} line={line} accent={accent}
                showRatings={showRatings}
                onPress={line && onPressPlayer ? () => onPressPlayer(line) : undefined}
              />
            )
          })}
        </View>
      ))}
      <View style={styles.footer}>
        <Text style={styles.formationText}>{shape.formation}</Text>
        {shape.rotated > 0 && (
          <Text style={styles.rotatedText}>{shape.rotated} rested</Text>
        )}
      </View>
    </View>
  )
}

function PitchPlayer({ label, line, accent, onPress, showRatings = true }: {
  label: string; line?: PlayerMatchLine; accent: string; onPress?: () => void; showRatings?: boolean
}) {
  return (
    <Pressable style={styles.slot} onPress={onPress} disabled={!onPress}>
      <View style={styles.shirtWrap}>
        <View style={[styles.shirt, { borderColor: accent }, line?.motm && { borderColor: colors.warning, borderWidth: 2 }]}>
          <Text style={styles.shirtLabel}>{label}</Text>
        </View>
        {line && showRatings && line.minutes > 0 && (
          <View style={[styles.ratingDot, { backgroundColor: ratingColor(line.rating) }]}>
            <Text style={styles.ratingDotText}>{line.rating.toFixed(1)}</Text>
          </View>
        )}
        {/* Event pips, stacked down the left so they never cover the rating. */}
        {line && <Contributions l={line} compact />}
      </View>
      <Text style={styles.name} numberOfLines={1}>{line ? lastName(line.name) : '—'}</Text>
      {line?.subOffMinute !== undefined && (
        <Text style={[styles.subOff, line.injured && { fontFamily: font.bodyBold }]} numberOfLines={1}>
          {'▼'} {line.subOffMinute}&#39;{line.injured ? ` · out ${line.matchdaysOut}` : ''}
        </Text>
      )}
    </Pressable>
  )
}

/** The named substitutes, with whether they got on and what they did. */
export function MatchBench({ players, accent, onPressPlayer, showRatings = true, unusedLabel = 'unused' }: {
  players: PlayerMatchLine[]
  accent: string
  onPressPlayer?: (l: PlayerMatchLine) => void
  showRatings?: boolean
  /** "unused" is a full-time verdict. While a match is still running the right
   *  word is just where he is: on the bench. */
  unusedLabel?: string
}) {
  if (players.length === 0) return null
  return (
    <View style={styles.bench}>
      {players.map(l => (
        <Pressable
          key={l.playerId}
          style={({ pressed }) => [styles.benchItem, pressed && onPressPlayer ? { opacity: 0.6 } : null]}
          onPress={onPressPlayer ? () => onPressPlayer(l) : undefined}
          disabled={!onPressPlayer}
        >
          <Text style={styles.benchPos}>{l.position}</Text>
          <Text style={styles.benchName} numberOfLines={1}>{lastName(l.name)}</Text>
          <Contributions l={l} />
          {l.subOnMinute !== undefined
            ? <Text style={[styles.benchOn, { color: prim.volt }]}>{'▲'} {l.subOnMinute}&#39;</Text>
            : <Text style={styles.benchUnused}>{unusedLabel}</Text>}
          {showRatings && l.minutes > 0 && (
            <View style={[styles.ratingDotSm, { backgroundColor: ratingColor(l.rating) }]}>
              <Text style={styles.ratingDotText}>{l.rating.toFixed(1)}</Text>
            </View>
          )}
        </Pressable>
      ))}
    </View>
  )
}

const styles = StyleSheet.create({
  pitch: {
    backgroundColor: prim.nylonSunken, borderRadius: 0,
    borderWidth: 1, borderColor: prim.ruleNylon,
    paddingVertical: spacing.md, paddingHorizontal: spacing.xs, gap: spacing.md,
  },
  row: { flexDirection: 'row', justifyContent: 'space-evenly', alignItems: 'flex-start' },
  slot: { alignItems: 'center', width: 62, gap: 2 },
  shirtWrap: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  shirt: {
    width: 34, height: 34, borderRadius: 17, borderWidth: 1.5,
    backgroundColor: prim.nylonRaised, alignItems: 'center', justifyContent: 'center',
  },
  shirtLabel: { fontSize: 8, fontFamily: font.bodyBlack, color: prim.cottonMuted },
  ratingDot: {
    position: 'absolute', right: -4, bottom: -2,
    minWidth: 22, paddingHorizontal: 3, paddingVertical: 1, borderRadius: 0, alignItems: 'center',
  },
  ratingDotSm: { minWidth: 22, paddingHorizontal: 3, paddingVertical: 1, borderRadius: 0, alignItems: 'center' },
  ratingDotText: { fontSize: 8, fontFamily: font.bodyBlack, color: '#0B1220' },
  pips: { position: 'absolute', left: -8, top: -2, gap: 1, alignItems: 'center' },
  benchPips: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  pipYellow: { width: 6, height: 8, borderRadius: 1, backgroundColor: colors.warning },
  pipRed: { width: 6, height: 8, borderRadius: 1, backgroundColor: colors.danger },
  name: { fontSize: 9, color: prim.cotton, fontFamily: font.bodyBold, textAlign: 'center' },
  subOff: { fontSize: 8, color: colors.danger },
  footer: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: spacing.sm },
  formationText: { fontSize: 10, fontFamily: font.bodyBlack, color: prim.cottonMuted, letterSpacing: 1 },
  rotatedText: { fontSize: 9, color: colors.warning, },

  bench: { marginTop: spacing.sm, gap: 3 },
  benchItem: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingVertical: 3 },
  benchPos: { width: 30, fontSize: 9, fontFamily: font.bodyBlack, color: prim.cottonMuted },
  benchName: { flex: 1, fontSize: 11, color: prim.cottonMuted },
  benchOn: { fontSize: 9, fontFamily: font.bodyBold },
  benchUnused: { fontSize: 9, color: prim.cottonMuted, },
})
