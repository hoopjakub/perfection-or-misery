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

import { t } from '@/i18n'
import { EventMark, Pitch } from '@/components/kit'
import { RatingSquare } from '@/components/kit'
import React from 'react'
import { View, StyleSheet, Pressable } from 'react-native'
// P8-123: text on the kit's families and scale until this screen is rebuilt on KitText.
import { ScaleText as Text } from '@/components/kit'
// C-18: the kit's colours (gold for the man of the match, the referee's yellow for a card).
import { space, prim, font, ROLES } from '@/theme'
import { getFormationRows } from '@/engine/formations'
import type { Formation } from '@/types/game'
import type { LineupShape, PlayerMatchLine } from '@/types/match-stats'

const lastName = (n: string) => n.split(' ').slice(-1)[0]

/**
 * Goals, assists and cards — shown identically wherever a player appears,
 * pitch or bench. Previously only a single goal icon was drawn, and only for
 * starters, so a hat-trick looked like one goal and anything achieved off the
 * bench was invisible.
 */
function Contributions({ l, compact }: { l: PlayerMatchLine; compact?: boolean }) {
  const size = compact ? 10 : 11
  const parts: React.ReactNode[] = []
  if (l.goals > 0) parts.push(<EventMark key="g" kind="goal" size={size} count={l.goals} />)
  if (l.ownGoals > 0) parts.push(<EventMark key="og" kind="ownGoal" size={size} count={l.ownGoals} />)
  if (l.assists > 0) parts.push(<EventMark key="a" kind="assist" size={size} count={l.assists} />)
  if (l.yellowCard && !l.redCard) parts.push(<EventMark key="y" kind="yellow" size={size - 1} />)
  if (l.redCard) parts.push(<EventMark key="r" kind="red" size={size - 1} />)
  // §10.5 phase 4 — he didn't just come off, he came off injured, and how long
  // he's out for is the thing you actually want to know from a lineup.
  if (l.injured) parts.push(<EventMark key="i" kind="injury" size={size} />)
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
    <Pitch
      rows={rows.map((row, ri) => row.map((label, ci) => {
        const slot = take(label)
        const line = slot ? byId.get(slot.playerId) : undefined
        return (
          <PitchPlayer
            key={`${ri}-${ci}`} label={label} line={line} accent={accent}
            showRatings={showRatings}
            onPress={line && onPressPlayer ? () => onPressPlayer(line) : undefined}
          />
        )
      }))}
      footer={
        <View style={styles.footer}>
          <Text style={styles.formationText}>{shape.formation}</Text>
          {shape.rotated > 0 && (
            <Text style={styles.rotatedText}>{shape.rotated} rested</Text>
          )}
        </View>
      }
    />
  )
}

function PitchPlayer({ label, line, accent, onPress, showRatings = true }: {
  label: string; line?: PlayerMatchLine; accent: string; onPress?: () => void; showRatings?: boolean
}) {
  return (
    <Pressable style={styles.slot} onPress={onPress} disabled={!onPress}>
      <View style={styles.shirtWrap}>
        <View style={[styles.shirt, { borderColor: accent }, line?.motm && { borderColor: prim.gold, borderWidth: 2 }]}>
          <Text style={styles.shirtLabel}>{label}</Text>
        </View>
        {line && showRatings && line.minutes > 0 && (
          <RatingSquare value={line.rating} size="sm" style={styles.ratingDot} />
        )}
        {/* Event pips, stacked down the left so they never cover the rating. */}
        {line && <Contributions l={line} compact />}
      </View>
      <Text style={styles.name} numberOfLines={1}>{line ? lastName(line.name) : '—'}</Text>
      {line?.subOffMinute !== undefined && (
        <View style={styles.benchOnRow}><EventMark kind="subOff" size={10} /><Text style={[styles.subOff, line.injured && { fontFamily: font.bodyBold }]} numberOfLines={1}>
          {line.subOffMinute}&#39;{line.injured ? ` · out ${line.matchdaysOut}` : ''}
        </Text></View>
      )}
    </Pressable>
  )
}

/** The named substitutes, with whether they got on and what they did. */
export function MatchBench({ players, accent, onPressPlayer, showRatings = true, unusedLabel = t('match.unused') }: {
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
            ? <View style={styles.benchOnRow}><EventMark kind="subOn" size={11} /><Text style={[styles.benchOn, { color: prim.volt }]}>{l.subOnMinute}&#39;</Text></View>
            : <Text style={styles.benchUnused}>{unusedLabel}</Text>}
          {showRatings && l.minutes > 0 && (
            <RatingSquare value={l.rating} size="sm" />
          )}
        </Pressable>
      ))}
    </View>
  )
}

const styles = StyleSheet.create({
  benchOnRow: { flexDirection: 'row', alignItems: 'center', gap: 2, justifyContent: 'center' },
  pitch: {
    backgroundColor: prim.nylonSunken, borderRadius: 0,
    borderWidth: 1, borderColor: prim.ruleNylon,
    paddingVertical: space[4], paddingHorizontal: space[1], gap: space[4],
  },
  row: { flexDirection: 'row', justifyContent: 'space-evenly', alignItems: 'flex-start' },
  slot: { alignItems: 'center', width: 62, gap: 2 },
  shirtWrap: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  shirt: {
    width: 34, height: 34, borderRadius: 17, borderWidth: 1.5,
    backgroundColor: prim.nylonRaised, alignItems: 'center', justifyContent: 'center',
  },
  shirtLabel: { fontSize: 8, fontFamily: font.bodyBlack, color: prim.cottonMuted },
  ratingDot: { position: 'absolute', right: -8, bottom: -4 },
  pips: { position: 'absolute', left: -8, top: -2, gap: 1, alignItems: 'center' },
  benchPips: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  pipYellow: { width: 6, height: 8, borderRadius: 1, backgroundColor: prim.cardYellow },
  pipRed: { width: 6, height: 8, borderRadius: 1, backgroundColor: prim.misery },
  name: { fontSize: 9, color: prim.cotton, fontFamily: font.bodyBold, textAlign: 'center' },
  subOff: { fontSize: 8, color: prim.misery },
  footer: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: space[2] },
  formationText: { fontSize: 10, fontFamily: font.bodyBlack, color: prim.cottonMuted, letterSpacing: 1 },
  rotatedText: { fontSize: 9, color: ROLES.nylon.textMuted },   // a note, not a warning: the floodlit ground's muted text

  bench: { marginTop: space[2], gap: 3 },
  benchItem: { flexDirection: 'row', alignItems: 'center', gap: space[2], paddingVertical: 3 },
  benchPos: { width: 30, fontSize: 9, fontFamily: font.bodyBlack, color: prim.cottonMuted },
  benchName: { flex: 1, fontSize: 11, color: prim.cottonMuted },
  benchOn: { fontSize: 9, fontFamily: font.bodyBold },
  benchUnused: { fontSize: 9, color: prim.cottonMuted, },
})
