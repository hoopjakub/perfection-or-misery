import React, { useRef, useState } from 'react'
import { useReducedMotion } from '@/hooks/useReducedMotion'
import type { CupCallRow, TournamentCalls, TieCall } from '@/engine/cup-calls'
import { View, Pressable, StyleSheet, Platform } from 'react-native'
import Animated, { FadeIn, useSharedValue, useAnimatedStyle, withRepeat, withSequence, withTiming, withDelay } from 'react-native-reanimated'
import { ROLES, space, border, prim, type Roles } from '@/theme'
import { KitText, Plate, Tag, Tape, Stripe, Rivets, H2, Icon, TeamMark, Twinkle } from '@/components/kit'
import { useRunOwner, RunOwnerLine } from '@/components/profile/ProfileParts'
import { shareRunLabel, shareRunLink, runLink } from '@/lib/shareRun'
import { punditsSummary, callOf, type PunditRow } from '@/lib/punditsSummary'
import { useGameStore } from '@/store/gameStore'

// D1 · The verdict (docs/ui-overhaul/07d), one treatment for every mode. The
// tier lands as a super on a riveted label: Perfection wears the volt tape,
// Misery wears the hazard stripe, everything else wears its colourway. The
// score and the multiplier that earned it sit underneath, then what the
// pundits said before a ball was kicked, then the share label (D11).
const roles = ROLES.nylon

export type VerdictTone = 'perfection' | 'misery' | 'middle'

export function VerdictBlock({
  tone, title, line, meta, score, multiplier, pundits, punditsText, shareText, runId, ownerId,
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
  /** A saved run opened from history; a live run's id comes from the store once saved. */
  runId?: string
  /** P8-89: the saved run's owner (runs.user_id). Left out for the run you just played. */
  ownerId?: string | null
}) {
  const reduced = useReducedMotion()
  const card = useRef<View>(null)
  const [shared, setShared] = useState<null | 'shared' | 'copied' | 'unavailable'>(null)

  // P8-89: every run says whose it is, on the page, on the card and in the
  // shared text; your own says it's yours.
  const owner = useRunOwner(ownerId)
  const whose = owner ? (owner.yours ? 'My run' : `${owner.name}'s run`) : null
  // Read as a hook, so the link appears the moment a live run's save lands.
  const savedRunId = useGameStore(s => s.savedRunId)
  const link = runLink(runId ?? savedRunId)
  const text = whose ? `${whose}: ${shareText}` : shareText
  async function share() {
    // On the web this is one share, the words and the link; on a phone the
    // picture (the link has its own plate, P8-121).
    setShared(await shareRunLabel(card.current as never, link ? `${text} ${link}` : text))
  }

  return (
    <View style={styles.wrap}>
      <RunOwnerLine roles={roles} owner={owner} />
      <Animated.View
        ref={card}
        entering={reduced ? undefined : FadeIn.duration(220)}
        style={[styles.card, { borderColor: roles.line, backgroundColor: roles.surface }]}
        accessible
        accessibilityRole="header"
        accessibilityLabel={`${title}. ${line ?? ''} ${score != null ? `${score} points` : ''}`}
      >
        <Rivets color={roles.line} />
        {/* P8-111: Misery's edge is red, not the stripe. */}
        {tone === 'misery'
          ? <View style={[styles.edge, { backgroundColor: roles.loss }]} />
          : <Tape colours={[tone === 'perfection' ? roles.perfection : roles.you]} roles={roles} vertical thickness={border.tape} style={styles.edge} />}

        <View style={styles.body}>
          {owner && (
            <View style={styles.whose}>
              <KitText t="tag" color={roles.textMuted}>{owner.yours ? 'YOUR RUN' : `${owner.name.toUpperCase()}'S RUN`}</KitText>
              {owner.badgeTeamId && owner.badgeTeamName ? <TeamMark roles={roles} clubId={owner.badgeTeamId} name={owner.badgeTeamName} size={16} /> : null}
            </View>
          )}
          <View style={styles.titleRow}>
            <KitText t="superXl" color={roles.text} style={[styles.title, { flexShrink: 1 }]}>{title.toUpperCase()}</KitText>
            {/* P8-145: Perfection lives a little. */}
            {tone === 'perfection' && <Twinkle />}
          </View>
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

      <Plate label={shared === 'copied' ? 'Copied' : shared === 'unavailable' ? 'Sharing is off on this device' : Platform.OS === 'web' ? 'Share this run' : 'Share the picture'}
        icon="forward" variant="secondary" roles={roles} onPress={share} disabled={shared === 'unavailable'} />
      {/* P8-121: a link opens the run, in the app where it's installed and on
          the web where it isn't. Only a saved run has one. */}
      {Platform.OS !== 'web' && <ShareLinkPlate roles={roles} runId={runId ?? savedRunId} text={text} />}
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

// P8-121: the run's link as its own share (a phone's sheet can't carry the
// picture and the text together). The verdict shows it beside the picture;
// the run hub on its own. Nothing when the run isn't saved yet.
export function ShareLinkPlate({ roles, runId, text }: { roles: Roles; runId?: string | null; text: string }) {
  const [state, setState] = useState<null | 'shared' | 'copied' | 'unavailable'>(null)
  const link = runLink(runId)
  if (!link) return null
  return (
    <Plate label={state === 'copied' ? 'Link copied' : state === 'unavailable' ? "The link couldn't be shared" : 'Share the link'}
      icon="forward" variant="secondary" roles={roles} onPress={async () => setState(await shareRunLink(text, link))} />
  )
}

const styles = StyleSheet.create({
  titleRow: { flexDirection: 'row', alignItems: 'flex-start', gap: space[2] },
  whose: { flexDirection: 'row', alignItems: 'center', gap: space[2] },
  wrap: { gap: space[2], marginBottom: space[4] },
  card: { flexDirection: 'row', borderWidth: border.plate, overflow: 'hidden' },
  edge: { width: 12, alignSelf: 'stretch' },
  body: { flex: 1, padding: space[4], gap: space[2] },
  title: { marginBottom: space[1] },
  scoreRow: { flexDirection: 'row', alignItems: 'center', gap: space[2] },
  pundits: { borderTopWidth: border.hair, paddingTop: space[2], gap: 2 },
})

// ── The pundits' calls, coloured (P8-38) ────────────────────────────────────
// Better than tipped in volt, worse in misery red, and an exact call in gold
// with a sparkle that twinkles now and then — the small "wow" the table asked
// for. The twinkle is staggered by row so the golds don't pulse in unison.
const callColour = (off: number) => off > 0 ? (roles.perfectionText ?? roles.text) : off < 0 ? roles.lossText : prim.gold

// The sparkle is the kit's Twinkle now (P8-145), shared with every other place that lives.
const Sparkle = ({ i }: { i: number }) => <Twinkle i={i} />

function Call({ off, label, i, spot }: { off: number; label: string; i: number; spot?: boolean }) {
  const twoLines = / SPOT ON$/.test(label)
  return (
    <View style={tableStyles.call}>
      {(spot ?? off === 0) && <Sparkle i={i} />}
      <KitText t="tag" color={callColour(off)} style={{ textAlign: 'right', flexShrink: 1 }}>
        {twoLines ? label.replace(/ SPOT ON$/, '\nSPOT ON') : label}
      </KitText>
    </View>
  )
}

// ── The pundits' table against the real one (P8-24) ─────────────────────────
// Every club, where it finished beside where the pundits had it, and by how
// much they were out. Sorted by the real finish; your row carries its surface.
// P8-122: the row and its summary live in src/lib/punditsSummary.ts (pure, so
// scripts/verify-predictions.ts can check the wording).
export type { PunditRow } from '@/lib/punditsSummary'

export function PunditsTable({ rows }: { rows: PunditRow[] }) {
  if (rows.length === 0) return null
  const sorted = [...rows].sort((a, b) => a.finalPosition - b.finalPosition)
  const withPoints = rows.some(r => r.predictedPoints != null && r.points != null)
  return (
    <View style={tableStyles.wrap}>
      <KitText t="superS" color={roles.text} accessibilityRole="header" {...H2}>THE PUNDITS, CHECKED</KitText>
      {punditsSummary(rows).map((line, i) => (
        <KitText key={i} t="body" color={i === 0 ? roles.text : roles.textMuted}>{line}</KitText>
      ))}
      <View style={[tableStyles.row, tableStyles.head, { borderBottomColor: roles.line }]}>
        <KitText t="tag" color={roles.textMuted} style={tableStyles.pos}>#</KitText>
        <KitText t="tag" color={roles.textMuted} style={{ flex: 1 }}>Club</KitText>
        {withPoints && <KitText t="tag" color={roles.textMuted} style={tableStyles.pts}>Pts</KitText>}
        <KitText t="tag" color={roles.textMuted} style={[tableStyles.diff, { textAlign: 'right' }]}>Call</KitText>
      </View>
      {sorted.map((r, i) => {
        const off = r.predicted - r.finalPosition   // positive = did better than tipped
        const call = callOf(r)
        return (
          <View key={r.clubId} style={[tableStyles.row, tableStyles.tall, { borderBottomColor: roles.rule }, r.isPlayer && { backgroundColor: roles.yours }]}
            accessible accessibilityLabel={`${r.finalPosition}, ${r.clubName}, tipped ${r.predicted}${r.predictedPoints != null ? ` on ${r.predictedPoints} points` : ''}${r.points != null ? `, finished on ${r.points}` : ''}`}>
            <KitText t="figure" color={roles.text} style={tableStyles.pos}>{String(r.finalPosition)}</KitText>
            {/* The club with its crest, and under it what they said. */}
            <View style={{ flex: 1, minWidth: 0 }}>
              <View style={tableStyles.club}>
                <TeamMark roles={roles} clubId={r.clubId} name={r.clubName} size={16} />
                <KitText t="body" color={roles.text} numberOfLines={1} style={{ flexShrink: 1 }}>{r.clubName}</KitText>
              </View>
              <KitText t="tag" color={roles.textMuted}>
                {`TIPPED ${ordinal(r.predicted).toUpperCase()}${r.predictedPoints != null ? ` · ${r.predictedPoints} PTS` : ''}`}
              </KitText>
            </View>
            {/* More points than they tipped in volt, fewer in red, exactly theirs in gold. */}
            {withPoints && (
              <KitText t="figure" style={tableStyles.pts}
                color={r.points == null || r.predictedPoints == null ? roles.text : callColour(r.points - r.predictedPoints)}>
                {r.points != null ? String(r.points) : '–'}
              </KitText>
            )}
            <View style={tableStyles.diff}><Call i={i} off={call.spot ? 0 : off} spot={!!call.spot} label={call.label} /></View>
          </View>
        )
      })}
    </View>
  )
}

const tableStyles = StyleSheet.create({
  // P8-122: room above, so the heading can't run into the section before it.
  wrap: { gap: space[2], marginTop: space[6], marginBottom: space[4] },
  club: { flexDirection: 'row', alignItems: 'center', gap: space[1] },
  pts: { width: 36, textAlign: 'right' },
  row: { flexDirection: 'row', alignItems: 'center', gap: space[2], minHeight: 36, borderBottomWidth: border.hair, paddingHorizontal: space[1] },
  head: { borderBottomWidth: border.thin, minHeight: 28 },
  pos: { width: 24, textAlign: 'right' },
  pred: { width: 48, textAlign: 'right' },
  diff: { width: 104, alignItems: 'flex-end' },
  call: { flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', gap: 4, maxWidth: '100%' },
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
      <KitText t="superS" color={roles.text} accessibilityRole="header" {...H2}>THE PUNDITS, CHECKED</KitText>
      <KitText t="body" color={roles.textMuted}>
        {`They called ${exact} of ${rows.length} exactly. Biggest surprise: ${surprise.clubName}, tipped for the ${surprise.tipped.label.toLowerCase()}, reached the ${surprise.reached.label.toLowerCase()}. Biggest flop: ${flop.clubName}.`}
      </KitText>
      <View style={[tableStyles.row, tableStyles.head, { borderBottomColor: roles.line }]}>
        <KitText t="tag" color={roles.textMuted} style={{ flex: 1 }}>Side</KitText>
        <KitText t="tag" color={roles.textMuted} style={tableStyles.round}>Tipped</KitText>
        <KitText t="tag" color={roles.textMuted} style={tableStyles.round}>Reached</KitText>
      </View>
      {shown.map((r, i) => (
        <View key={r.clubId} style={[tableStyles.row, tableStyles.tall, { borderBottomColor: roles.rule }, r.isPlayer && { backgroundColor: roles.yours }]}
          accessible accessibilityLabel={`${r.clubName}, tipped ${r.tipped.label}, reached ${r.reached.label}`}>
          <View style={{ flex: 1 }}>
            <KitText t="body" color={roles.text} numberOfLines={1}>{r.clubName}</KitText>
            <Call i={i} off={r.diff} label={call(r.diff)} />
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

// ── The whole tournament, as the pundits saw it (P8-56) ──────────────────────
// Every group in the order they rated it, with the points they'd have given,
// beside where each side finished; every knockout tie with who they backed and
// whether it went through; and their champion. Opens on your group and your
// ties (a 48-side World Cup is 12 groups and 31 ties); the rest is one tap.
const ROUND_LABEL: Record<string, string> = {
  playoff: 'Knockout play-off', r32: 'Round of 32', r16: 'Round of 16', qf: 'Quarter-finals', sf: 'Semi-finals', final: 'Final',
}

export function PunditsTournament({ calls }: { calls: TournamentCalls }) {
  const [all, setAll] = useState(false)
  const yours = (t: TieCall) => !!(t.a.isPlayer || t.b.isPlayer)
  const groups = all ? calls.groups : calls.groups.filter(g => g.rows.some(r => r.isPlayer))
  const ties = all ? calls.ties : calls.ties.filter(t => yours(t) || t.round === 'final' || t.round === 'sf')
  const rounds = [...new Set(ties.map(t => t.round))]
  if (calls.ties.length === 0 && calls.groups.length === 0) return null
  return (
    <View style={tableStyles.wrap}>
      <KitText t="superS" color={roles.text} accessibilityRole="header" {...H2}>THEIR WHOLE TOURNAMENT</KitText>
      <KitText t="body" color={roles.textMuted}>
        {/* What this is (the maintainer, 24 Sept, wasn't sure): the draw came
            after the pundits spoke, so this is their pre-season view applied to
            the groups and ties as they were actually drawn. */}
        {`The draw came after the pundits spoke. Here is their pre-season view applied to what was drawn: ${calls.groups.length ? 'each group in the order they rated it, and ' : ''}who they'd have backed in every tie. They called ${calls.right} of ${calls.ties.length} ties.${calls.champion ? ` Their champions: ${calls.champion.clubName}.` : ''}`}
      </KitText>

      {groups.map(g => (
        <View key={g.id} style={tourStyles.group}>
          <View style={[tableStyles.row, tableStyles.head, { borderBottomColor: roles.line }]}>
            <KitText t="tag" color={roles.textMuted} style={{ flex: 1 }}>{`Group ${g.id} · their order`}</KitText>
            <KitText t="tag" color={roles.textMuted} style={tableStyles.pred}>Pts</KitText>
            <KitText t="tag" color={roles.textMuted} style={[tableStyles.diff, { textAlign: 'right' }]}>Finished</KitText>
          </View>
          {g.rows.map((r, i) => {
            const off = r.predicted - r.actual
            return (
              <View key={r.clubId} style={[tableStyles.row, { borderBottomColor: roles.rule }, r.isPlayer && { backgroundColor: roles.yours }]}
                accessible accessibilityLabel={`${r.clubName}: they had them ${r.predicted}, ${r.points} points; finished ${r.actual}`}>
                <KitText t="figure" color={roles.textMuted} style={tableStyles.pos}>{String(r.predicted)}</KitText>
                <KitText t="body" color={roles.text} numberOfLines={1} style={{ flex: 1 }}>{r.clubName}</KitText>
                <KitText t="figure" color={roles.textMuted} style={tableStyles.pred}>{String(r.points)}</KitText>
                <View style={tableStyles.diff}><Call i={i} off={off} label={off === 0 ? 'SPOT ON' : `${r.actual}${r.actual === 1 ? 'ST' : r.actual === 2 ? 'ND' : r.actual === 3 ? 'RD' : 'TH'}`} /></View>
              </View>
            )
          })}
        </View>
      ))}

      {rounds.map(round => (
        <View key={round} style={tourStyles.group}>
          <SectionTagLike label={ROUND_LABEL[round] ?? round} />
          {ties.filter(t => t.round === round).map((t, i) => {
            const picked = t.pick === t.a.clubId ? t.a : t.b
            return (
              <View key={`${t.a.clubId}-${t.b.clubId}`} style={[tableStyles.row, tableStyles.tall, { borderBottomColor: roles.rule }, yours(t) && { backgroundColor: roles.yours }]}
                accessible accessibilityLabel={`${t.a.clubName} v ${t.b.clubName}: they backed ${picked.clubName}, ${t.right ? 'right' : 'wrong'}`}>
                <View style={{ flex: 1 }}>
                  <KitText t="body" color={roles.text} numberOfLines={1}>{`${t.a.clubName} v ${t.b.clubName}`}</KitText>
                  <KitText t="tag" color={roles.textMuted} numberOfLines={1}>{`They backed ${picked.clubName}`}</KitText>
                </View>
                <View style={tourStyles.mark}>
                  {t.right ? <Sparkle i={i} /> : null}
                  <KitText t="tag" color={t.right ? prim.gold : roles.lossText}>{t.right ? 'RIGHT' : 'WRONG'}</KitText>
                </View>
              </View>
            )
          })}
        </View>
      ))}

      <Pressable onPress={() => setAll(a => !a)} accessibilityRole="button"
        style={({ pressed }) => [tableStyles.more, { borderColor: roles.line }, pressed && { backgroundColor: roles.sunken }]}>
        <KitText t="tag" color={roles.text}>{all ? 'Just yours' : `Every ${calls.groups.length ? 'group and ' : ''}tie`}</KitText>
      </Pressable>
    </View>
  )
}

function SectionTagLike({ label }: { label: string }) {
  return <KitText t="tag" color={roles.textMuted} style={tourStyles.round}>{label.toUpperCase()}</KitText>
}

const tourStyles = StyleSheet.create({
  group: { marginTop: space[3] },
  round: { marginBottom: space[1] },
  mark: { flexDirection: 'row', alignItems: 'center', gap: 4 },
})
