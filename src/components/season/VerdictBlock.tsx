import React, { useRef, useState } from 'react'
import type { CupCallRow } from '@/engine/cup-calls'
import { View, Pressable, StyleSheet } from 'react-native'
import Animated, { FadeIn, useReducedMotion } from 'react-native-reanimated'
import { ROLES, space, border } from '@/theme'
import { KitText, Plate, Tag, Tape, Stripe, Rivets } from '@/components/kit'
import { shareRunLabel } from '@/lib/shareRun'

// D1 · The verdict (docs/ui-overhaul/07d), one treatment for every mode. The
// tier lands as a super on a riveted label: Perfection wears the volt tape,
// Misery wears the hazard stripe, everything else wears its colourway. The
// score and the multiplier that earned it sit underneath, then what the
// pundits said before a ball was kicked, then the share label (D11).
const roles = ROLES.nylon

export type VerdictTone = 'perfection' | 'misery' | 'middle'

export function VerdictBlock({
  tone, title, line, meta, score, multiplier, pundits, punditsText, shareText,
}: {
  tone: VerdictTone
  title: string            // the tier, as the shared registry names it
  line?: string            // one sentence about the season
  meta?: string            // "Premier League 2024/25 · You took over Everton"
  score?: number
  multiplier?: number      // the difficulty multiplier the score was earned at
  /** What the pundits predicted, and what really happened (league tables). */
  pundits?: { predicted: number; actual: number; field: number }
  /** The same check in words, for the cups, where they call a round not a place. */
  punditsText?: string
  shareText: string
}) {
  const reduced = useReducedMotion()
  const card = useRef<View>(null)
  const [shared, setShared] = useState<null | 'shared' | 'copied' | 'unavailable'>(null)

  async function share() {
    setShared(await shareRunLabel(card.current as never, shareText))
  }

  return (
    <View style={styles.wrap}>
      <Animated.View
        ref={card}
        entering={reduced ? undefined : FadeIn.duration(220)}
        style={[styles.card, { borderColor: roles.line, backgroundColor: roles.surface }]}
        accessible
        accessibilityRole="header"
        accessibilityLabel={`${title}. ${line ?? ''} ${score != null ? `${score} points` : ''}`}
      >
        <Rivets color={roles.line} />
        {tone === 'misery'
          ? <Stripe roles={roles} band={6} style={styles.edge} />
          : <Tape colours={[tone === 'perfection' ? roles.perfection : roles.you]} roles={roles} vertical thickness={border.tape} style={styles.edge} />}

        <View style={styles.body}>
          <KitText t="superXl" color={roles.text} style={styles.title}>{title.toUpperCase()}</KitText>
          {line ? <KitText t="bodyL" color={roles.text}>{line}</KitText> : null}
          {meta ? <KitText t="tag" color={roles.textMuted}>{meta}</KitText> : null}

          {score != null && (
            <View style={styles.scoreRow}>
              <KitText t="figureL" color={roles.text}>{String(score)}</KitText>
              <KitText t="tag" color={roles.textMuted}>POINTS</KitText>
              {multiplier != null && multiplier !== 1 && (
                <Tag roles={roles}>{`×${multiplier.toFixed(2)} HARDNESS`}</Tag>
              )}
            </View>
          )}

          {(pundits || punditsText) && (
            <View style={[styles.pundits, { borderTopColor: roles.rule }]}>
              <KitText t="tag" color={roles.textMuted}>The pundits</KitText>
              {pundits ? (
                <>
                  <KitText t="bodyL" color={roles.text}>
                    {`They had you ${ordinal(pundits.predicted)}. You finished ${ordinal(pundits.actual)}.`}
                  </KitText>
                  <KitText t="body" color={roles.textMuted}>{punditVerdict(pundits)}</KitText>
                </>
              ) : (
                <KitText t="bodyL" color={roles.text}>{punditsText}</KitText>
              )}
            </View>
          )}
        </View>
      </Animated.View>

      <Plate label={shared === 'copied' ? 'Copied' : shared === 'unavailable' ? 'Sharing is off on this device' : 'Share this run'}
        icon="forward" variant="secondary" roles={roles} onPress={share} disabled={shared === 'unavailable'} />
    </View>
  )
}

const ordinal = (n: number) => {
  const s = ['th', 'st', 'nd', 'rd'], v = n % 100
  return `${n}${s[(v - 20) % 10] ?? s[v] ?? s[0]}`
}

function punditVerdict({ predicted, actual, field }: { predicted: number; actual: number; field: number }): string {
  const by = predicted - actual
  if (by >= Math.max(3, field / 6)) return `You beat their call by ${by} places. Nobody saw that coming.`
  if (by > 0) return `${by} ${by === 1 ? 'place' : 'places'} better than they said.`
  if (by === 0) return 'Exactly where they said you would be.'
  if (-by >= Math.max(3, field / 6)) return `${-by} places worse than they said. They were kind.`
  return `${-by} ${-by === 1 ? 'place' : 'places'} worse than they said.`
}

const styles = StyleSheet.create({
  wrap: { gap: space[2], marginBottom: space[4] },
  card: { flexDirection: 'row', borderWidth: border.plate, overflow: 'hidden' },
  edge: { width: 12, alignSelf: 'stretch' },
  body: { flex: 1, padding: space[4], gap: space[2] },
  title: { marginBottom: space[1] },
  scoreRow: { flexDirection: 'row', alignItems: 'center', gap: space[2] },
  pundits: { borderTopWidth: border.hair, paddingTop: space[2], gap: 2 },
})

// ── The pundits' table against the real one (P8-24) ─────────────────────────
// Every club, where it finished beside where the pundits had it, and by how
// much they were out. Sorted by the real finish; your row carries its surface.
export type PunditRow = { clubId: string; clubName: string; finalPosition: number; predicted: number; isPlayer: boolean }

export function PunditsTable({ rows }: { rows: PunditRow[] }) {
  if (rows.length === 0) return null
  const sorted = [...rows].sort((a, b) => a.finalPosition - b.finalPosition)
  const worst = [...rows].sort((a, b) => Math.abs(b.predicted - b.finalPosition) - Math.abs(a.predicted - a.finalPosition))[0]
  const exact = rows.filter(r => r.predicted === r.finalPosition).length
  return (
    <View style={tableStyles.wrap}>
      <KitText t="superS" color={roles.text} accessibilityRole="header">"THE PUNDITS, CHECKED"</KitText>
      <KitText t="body" color={roles.textMuted}>
        {`They got ${exact} of ${rows.length} places exactly right. Their worst call: ${worst.clubName}, tipped ${ordinal(worst.predicted)}, finished ${ordinal(worst.finalPosition)}.`}
      </KitText>
      <View style={[tableStyles.row, tableStyles.head, { borderBottomColor: roles.line }]}>
        <KitText t="tag" color={roles.textMuted} style={tableStyles.pos}>#</KitText>
        <KitText t="tag" color={roles.textMuted} style={{ flex: 1 }}>Club</KitText>
        <KitText t="tag" color={roles.textMuted} style={tableStyles.pred}>Tipped</KitText>
        <KitText t="tag" color={roles.textMuted} style={tableStyles.diff}>Call</KitText>
      </View>
      {sorted.map(r => {
        const off = r.predicted - r.finalPosition   // positive = did better than tipped
        return (
          <View key={r.clubId} style={[tableStyles.row, { borderBottomColor: roles.rule }, r.isPlayer && { backgroundColor: roles.surface }]}
            accessible accessibilityLabel={`${r.finalPosition}, ${r.clubName}, tipped ${r.predicted}`}>
            <KitText t="figure" color={roles.text} style={tableStyles.pos}>{String(r.finalPosition)}</KitText>
            <KitText t="body" color={roles.text} numberOfLines={1} style={{ flex: 1 }}>{r.clubName}</KitText>
            <KitText t="figure" color={roles.textMuted} style={tableStyles.pred}>{String(r.predicted)}</KitText>
            <KitText t="tag" color={off > 0 ? (roles.perfectionText ?? roles.text) : roles.textMuted} style={tableStyles.diff}>
              {off > 0 ? `UP ${off}` : off < 0 ? `DOWN ${-off}` : 'SPOT ON'}
            </KitText>
          </View>
        )
      })}
    </View>
  )
}

const tableStyles = StyleSheet.create({
  wrap: { gap: space[2], marginBottom: space[4] },
  row: { flexDirection: 'row', alignItems: 'center', gap: space[2], minHeight: 36, borderBottomWidth: border.hair, paddingHorizontal: space[1] },
  head: { borderBottomWidth: border.thin, minHeight: 28 },
  pos: { width: 24, textAlign: 'right' },
  pred: { width: 48, textAlign: 'right' },
  diff: { width: 72, textAlign: 'right' },
  round: { width: 96, textAlign: 'right' },
  tall: { minHeight: 48, paddingVertical: space[1] },
  more: { alignSelf: 'flex-start', borderWidth: border.thin, minHeight: 40, paddingHorizontal: space[3], justifyContent: 'center' },
})

// ── The cups: the pundits' round calls against how far everyone got ──────────
// A 36- or 48-side field is too long to read whole, so the table opens on the
// sides that matter — yours, the pundits' favourites, and their three worst
// calls either way — with the rest one tap away.
export function PunditsRoundTable({ rows }: { rows: CupCallRow[] }) {
  const [all, setAll] = useState(false)
  if (rows.length === 0) return null
  const exact = rows.filter(r => r.diff === 0).length
  const surprise = [...rows].sort((a, b) => b.diff - a.diff)[0]
  const flop = [...rows].sort((a, b) => a.diff - b.diff)[0]
  const favourites = [...rows].sort((a, b) => a.tipped.step - b.tipped.step).slice(0, 8)
  const beats = [...rows].sort((a, b) => b.diff - a.diff).slice(0, 3)
  const flops = [...rows].sort((a, b) => a.diff - b.diff).slice(0, 3)
  const shortlist = new Set([...favourites, ...beats, ...flops, ...rows.filter(r => r.isPlayer)].map(r => r.clubId))
  const shown = all ? rows : rows.filter(r => shortlist.has(r.clubId))
  const call = (d: number) => d > 0 ? `${d} ROUND${d === 1 ? '' : 'S'} BETTER` : d < 0 ? `${-d} ROUND${d === -1 ? '' : 'S'} WORSE` : 'SPOT ON'
  return (
    <View style={tableStyles.wrap}>
      <KitText t="superS" color={roles.text} accessibilityRole="header">"THE PUNDITS, CHECKED"</KitText>
      <KitText t="body" color={roles.textMuted}>
        {`They called ${exact} of ${rows.length} exactly. Biggest surprise: ${surprise.clubName}, tipped for the ${surprise.tipped.label.toLowerCase()}, reached the ${surprise.reached.label.toLowerCase()}. Biggest flop: ${flop.clubName}.`}
      </KitText>
      <View style={[tableStyles.row, tableStyles.head, { borderBottomColor: roles.line }]}>
        <KitText t="tag" color={roles.textMuted} style={{ flex: 1 }}>Side</KitText>
        <KitText t="tag" color={roles.textMuted} style={tableStyles.round}>Tipped</KitText>
        <KitText t="tag" color={roles.textMuted} style={tableStyles.round}>Reached</KitText>
      </View>
      {shown.map(r => (
        <View key={r.clubId} style={[tableStyles.row, tableStyles.tall, { borderBottomColor: roles.rule }, r.isPlayer && { backgroundColor: roles.surface }]}
          accessible accessibilityLabel={`${r.clubName}, tipped ${r.tipped.label}, reached ${r.reached.label}`}>
          <View style={{ flex: 1 }}>
            <KitText t="body" color={roles.text} numberOfLines={1}>{r.clubName}</KitText>
            <KitText t="tag" color={r.diff > 0 ? (roles.perfectionText ?? roles.text) : roles.textMuted}>{call(r.diff)}</KitText>
          </View>
          <KitText t="body" color={roles.textMuted} style={tableStyles.round} numberOfLines={2}>{r.tipped.label}</KitText>
          <KitText t="body" color={roles.text} style={tableStyles.round} numberOfLines={2}>{r.reached.label}</KitText>
        </View>
      ))}
      <Pressable onPress={() => setAll(a => !a)} accessibilityRole="button"
        style={({ pressed }) => [tableStyles.more, { borderColor: roles.line }, pressed && { backgroundColor: roles.sunken }]}>
        <KitText t="tag" color={roles.text}>{all ? 'Show the shortlist' : `Show all ${rows.length}`}</KitText>
      </Pressable>
    </View>
  )
}
