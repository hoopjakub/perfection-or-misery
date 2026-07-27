// Deep Simulation Match (Big Fixes §7) — the finale.
//
// Three beats, in order, no way back: LINEUPS (both finalists, as they line up)
// → LIVE (the match played out on a 0.5s-per-minute clock, with stats, momentum,
// ratings and subs all moving as it goes) → CEREMONY (trophy + confetti, or a
// silver medal on a grey screen).
//
// Nothing is decided here. The result, the scorers, the momentum and every
// number on the sheet came out of the seed before this screen mounted; §7's
// architecture guard is explicit that the Deep Match must not invert the
// result-first engine. All this does is reveal a finished match one minute at a
// time — which is exactly why pause and skip are safe, and why watching it
// twice would show the same match (it can't be watched twice: R6, the entry
// point is gone once you've been through it).
//
// Performance note (§7's react-best-practices pointer): the whole timeline is
// built ONCE into a ref, and the only thing that changes per tick is a single
// `minute` number. Every panel selects the frame it needs from that minute, so
// a tick re-renders numbers, never structure.

import React, { useEffect, useMemo, useRef, useState } from 'react'
import { View, Text, StyleSheet, Pressable, ScrollView, ActivityIndicator } from 'react-native'
import { router } from 'expo-router'
import { Ionicons } from '@expo/vector-icons'
import { colors, spacing, typography, radius, ratingColor } from '@/theme'
import { flagForCountry } from '@/data/geo-iso'
import { useSimBackGuard } from '@/hooks/useSimBackGuard'
import { takeDeepMatchRequest, type DeepMatchRequest } from '@/lib/deepMatch'
import {
  useMatchDetail, StatBar, StatSideHeader, ScorerList, Timeline, splitLineup, effectiveSeed,
} from '@/components/MatchStatsParts'
import { MatchLineupPitch, MatchBench } from '@/components/MatchLineupPitch'
import { MomentumGraph, momentumMarkers } from '@/components/MomentumGraph'
import { Ceremony, type CeremonyKind } from '@/components/Ceremony'
import { buildDeepMatchTimeline, type DeepMatchTimeline, type DeepFrame } from '@/engine/deep-match'
import type { MatchStats, PlayerMatchLine } from '@/types/match-stats'

// §7: 1 match-minute = 0.5s real time, so 90' lands just under a minute and
// 120' just over. Long enough to feel like a broadcast, short enough that Skip
// is a convenience rather than the only sane option.
const MS_PER_MINUTE = 500
// Beat between the final whistle and the ceremony — the scoreline needs a
// moment to land before the confetti starts.
const WHISTLE_PAUSE_MS = 1400

type Phase = 'lineups' | 'live' | 'ceremony' | 'exiting'

// How long the hand-off spinner sits between the ceremony and the result
// screen. Long enough to read as a deliberate transition rather than a stutter.
const EXIT_SPINNER_MS = 900

export default function DeepMatchScreen() {
  // Taken ONCE on mount, like the stats screen: the screen owns its match for
  // as long as it's on the stack.
  const [request] = useState<DeepMatchRequest | null>(() => takeDeepMatchRequest())
  const { detail, loading } = useMatchDetail(request?.detail ?? null)
  const [phase, setPhase] = useState<Phase>('lineups')

  // §7 R7 / §3 — the final is decided but not yet seen, which is exactly the
  // window the back-guard exists for. Released at the ceremony: by then the
  // result has been delivered and there's nothing left to re-roll.
  useSimBackGuard(phase !== 'ceremony')

  if (!request) {
    return (
      <View style={[styles.container, styles.centred]}>
        <Text style={styles.muted}>No final to play.</Text>
        <Pressable style={styles.textBtn} onPress={() => router.back()}>
          <Text style={[styles.textBtnLabel, { color: colors.accent }]}>Go back</Text>
        </Pressable>
      </View>
    )
  }

  if (loading || !detail) {
    return (
      <View style={[styles.container, styles.centred]}>
        <ActivityIndicator color={request.accent} size="large" />
        <Text style={styles.muted}>Walking out…</Text>
      </View>
    )
  }

  if (phase === 'ceremony') {
    const r = request
    const won = r.playerWon
    const kind: CeremonyKind = r.competitionLabel.toLowerCase().includes('world cup') ? 'globe' : 'cup'
    const home = r.detail.homeName, away = r.detail.awayName
    return (
      <Ceremony
        won={won}
        kind={kind}
        title={won
          ? (kind === 'globe' ? 'World Champions' : 'Champions of Europe')
          : 'Runners-up'}
        subtitle={`${home} ${r.detail.homeGoals} – ${r.detail.awayGoals} ${away}`}
        accent={r.accent}
        onContinue={() => setPhase('exiting')}
      />
    )
  }

  if (phase === 'exiting') {
    return <ExitToResults request={request} />
  }

  return (
    <MatchBeats
      request={request} detail={detail} phase={phase}
      onStart={() => setPhase('live')} onFinished={() => setPhase('ceremony')}
    />
  )
}

// The timeline is built ONCE and shared by both beats. It used to be built
// inside each of them, which meant the pre-match team sheet and the match it
// then played were two separate (identical) builds — harmless, but the sheet is
// the same object either way and building it twice invited them to drift.
function MatchBeats({ request, detail, phase, onStart, onFinished }: {
  request: DeepMatchRequest; detail: MatchStats; phase: Phase
  onStart: () => void; onFinished: () => void
}) {
  const timeline = useRef<DeepMatchTimeline>(
    buildDeepMatchTimeline(detail, effectiveSeed(request.detail)),
  ).current

  if (phase === 'lineups') {
    return <LineupsStep request={request} detail={detail} timeline={timeline} onStart={onStart} />
  }
  return <LivePlayback request={request} detail={detail} timeline={timeline} onFinished={onFinished} />
}

// ── After the ceremony: straight to the result screen ───────────────────────
// `router.replace`, not a pop: replacing this screen with the results means the
// knockout bracket underneath is never on screen again, and the run ends where
// every other run ends. The spinner covers the commit (which writes the season
// result into the store) so the hand-off reads as one deliberate beat.
function ExitToResults({ request }: { request: DeepMatchRequest }) {
  useEffect(() => {
    const t = setTimeout(() => {
      request.onFinished()
      router.replace(request.resultRoute as never)
    }, EXIT_SPINNER_MS)
    return () => clearTimeout(t)
  }, [])
  return (
    <View style={[styles.container, styles.centred]}>
      <ActivityIndicator color={request.accent} size="large" />
      <Text style={styles.muted}>Wrapping up the tournament…</Text>
    </View>
  )
}

// ── Beat 1: the teams ───────────────────────────────────────────────────────
function LineupsStep({ request, detail, timeline, onStart }: {
  request: DeepMatchRequest; detail: MatchStats; timeline: DeepMatchTimeline; onStart: () => void
}) {
  const { accent } = request
  // §7 — the team sheet as it is BEFORE kickoff. `playersAt(0)` is every player
  // with a clean slate: no goals on the shirt, no cards, no sub arrows, no
  // ratings. Handing over the finished lines (which is what this did first)
  // walked the sides out with the scorers already marked and the winner's
  // ratings on show — it gave away the result before the whistle.
  const kickoffPlayers = useMemo(() => timeline.playersAt(0), [timeline])
  const sides = [
    { key: 'home' as const, name: request.detail.homeName, shape: detail.homeShape, isHome: true },
    { key: 'away' as const, name: request.detail.awayName, shape: detail.awayShape, isHome: false },
  ]
  return (
    <View style={styles.container}>
      <ScrollView contentContainerStyle={styles.scrollBody}>
        <Text style={[styles.kicker, { color: accent, paddingTop: 28 }]}>{request.competitionLabel}</Text>
        <Text style={styles.bigTitle}>{request.roundLabel}</Text>
        <Text style={styles.tagline}>One match. Everything on it.</Text>

        <View style={styles.finalistRow}>
          <Text style={[styles.finalist, { textAlign: 'right' }]} numberOfLines={2}>{withFlag(request.detail.homeName)}</Text>
          <Text style={[styles.vs, { color: accent }]}>vs</Text>
          <Text style={styles.finalist} numberOfLines={2}>{withFlag(request.detail.awayName)}</Text>
        </View>

        {sides.map(s => (
          <SideLineup
            key={s.key} name={s.name} shape={s.shape} isHome={s.isHome}
            players={kickoffPlayers} sheet={detail.players} accent={accent} showRatings={false}
          />
        ))}
      </ScrollView>

      <View style={styles.footer}>
        <Pressable
          style={({ pressed }) => [styles.primaryBtn, { backgroundColor: accent }, pressed && { opacity: 0.85, transform: [{ scale: 0.985 }] }]}
          onPress={onStart}
        >
          <Ionicons name="play" size={16} color={colors.textPrimary} />
          <Text style={styles.primaryBtnText}>START FINAL</Text>
        </Pressable>
      </View>
    </View>
  )
}

// ── Beat 2: the match ───────────────────────────────────────────────────────
function LivePlayback({ request, detail, timeline, onFinished }: {
  request: DeepMatchRequest; detail: MatchStats; timeline: DeepMatchTimeline; onFinished: () => void
}) {
  const { accent } = request

  const [minute, setMinute] = useState(0)
  const [paused, setPaused] = useState(false)
  const finishedRef = useRef(false)

  // The clock. A plain interval rather than a per-minute timeout chain, so a
  // slow render can't stretch the match: the ticks stay on the wall clock.
  useEffect(() => {
    if (paused) return
    const id = setInterval(() => {
      setMinute(m => (m >= timeline.duration ? m : m + 1))
    }, MS_PER_MINUTE)
    return () => clearInterval(id)
  }, [paused, timeline.duration])

  // Full time — whether we got here on the clock or by skipping.
  useEffect(() => {
    if (minute < timeline.duration || finishedRef.current) return
    finishedRef.current = true
    const t = setTimeout(onFinished, WHISTLE_PAUSE_MS)
    return () => clearTimeout(t)
  }, [minute, timeline.duration])

  const frame: DeepFrame | null = minute > 0 ? timeline.frames[minute - 1] : null
  const shownEvents = useMemo(
    () => timeline.events.filter(e => e.minute <= minute),
    [timeline, minute],
  )

  const half = minute > 45 && minute <= 90 ? '2nd half' : minute <= 45 ? '1st half' : 'Extra time'
  const status = minute >= timeline.duration ? 'FULL TIME' : half

  // The graph's x-axis is scaled to the duration and labels the breaks, so
  // handing it 120 from the first minute announced "this one goes to extra
  // time" before a ball was kicked. It stays a 90-minute graph until the clock
  // actually passes 90 and then rescales — which is what a broadcast does too.
  const shownDuration = minute > 90 ? timeline.duration : 90
  // The lineups, as they stand right now: subs appear the moment they come on,
  // goals land on the scorer's shirt as they're scored, ratings are live.
  const livePlayers = useMemo(() => timeline.playersAt(minute), [timeline, minute])

  return (
    <View style={styles.container}>
      {/* Scoreboard — pinned, because it's the only thing you can't miss. */}
      <View style={[styles.board, { borderBottomColor: accent }]}>
        <Text style={[styles.kicker, { color: accent }]}>{request.roundLabel}</Text>
        <View style={styles.boardRow}>
          <Text style={[styles.boardTeam, { textAlign: 'right' }]} numberOfLines={2}>{withFlag(request.detail.homeName)}</Text>
          <View style={styles.boardScoreCol}>
            <Text style={[styles.boardScore, { color: accent }]}>
              {frame?.homeGoals ?? 0} – {frame?.awayGoals ?? 0}
            </Text>
            <Text style={styles.boardClock}>{minute}'</Text>
          </View>
          <Text style={styles.boardTeam} numberOfLines={2}>{withFlag(request.detail.awayName)}</Text>
        </View>
        {/* Who scored, right under the score — the same block the stats screen
            puts there, so a goal reads identically live and afterwards. */}
        {shownEvents.some(e => e.type === 'goal') && (
          <View style={styles.boardScorers}>
            <ScorerList events={shownEvents} isHome align="right" />
            <ScorerList events={shownEvents} isHome={false} align="left" />
          </View>
        )}
        <Text style={styles.boardStatus}>{status}</Text>
      </View>

      <ScrollView contentContainerStyle={styles.scrollBody}>
        <View style={styles.card}>
          <MomentumGraph
            series={detail.momentum.slice(0, shownDuration)} duration={shownDuration}
            markers={momentumMarkers(shownEvents)}
            revealUpTo={minute}
            accentHome={accent}
            homeName={request.detail.homeName} awayName={request.detail.awayName}
          />
        </View>

        {frame && (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Match stats</Text>
            <StatSideHeader homeName={request.detail.homeName} awayName={request.detail.awayName} accent={accent} />
            <StatBar label="Ball possession" home={frame.home.possession} away={frame.away.possession} accent={accent} pct />
            <StatBar label="Expected goals (xG)" home={frame.home.xg} away={frame.away.xg} accent={accent} />
            <StatBar label="Total shots" home={frame.home.shots} away={frame.away.shots} accent={accent} />
            <StatBar label="Shots on target" home={frame.home.shotsOnTarget} away={frame.away.shotsOnTarget} accent={accent} />
            <StatBar label="Big chances" home={frame.home.bigChances} away={frame.away.bigChances} accent={accent} />
            <StatBar label="Accurate passes" home={frame.home.accuratePasses} away={frame.away.accuratePasses} accent={accent} />
            <StatBar label="Tackles won" home={frame.home.tacklesWon} away={frame.away.tacklesWon} accent={accent} />
            <StatBar label="Fouls" home={frame.home.fouls} away={frame.away.fouls} accent={accent} />
            <StatBar label="Corners" home={frame.home.corners} away={frame.away.corners} accent={accent} />
            <View style={styles.teamRatingRow}>
              <RatingPill value={frame.homeRating} />
              <Text style={styles.teamRatingLabel}>TEAM RATING</Text>
              <RatingPill value={frame.awayRating} />
            </View>
          </View>
        )}

        <View style={styles.card}>
          <Text style={styles.cardTitle}>Timeline</Text>
          {shownEvents.length === 0
            ? <Text style={styles.muted}>Nothing yet — they're feeling each other out.</Text>
            : (
              // The SAME timeline the stats screen draws, so the live match and
              // the sheet you open afterwards tell the story the same way.
              // `revealUpTo` keeps the period breaks from appearing early —
              // a "Full-time · +4'" line in the 20th minute both looks wrong
              // and gives away the stoppage time.
              <Timeline
                events={shownEvents} addedTime={detail.addedTime}
                duration={shownDuration} revealUpTo={minute}
              />
            )}
        </View>

        {([true, false] as const).map(isHome => (
          <SideLineup
            key={String(isHome)}
            name={isHome ? request.detail.homeName : request.detail.awayName}
            shape={isHome ? detail.homeShape : detail.awayShape}
            isHome={isHome} players={livePlayers} sheet={detail.players} accent={accent}
          />
        ))}
      </ScrollView>

      {/* §7 R4 — both controls are pure UI: everything already happened. */}
      <View style={styles.footer}>
        <Pressable
          style={({ pressed }) => [styles.ghostBtn, pressed && { opacity: 0.7 }]}
          onPress={() => setPaused(p => !p)}
          disabled={minute >= timeline.duration}
        >
          <Ionicons name={paused ? 'play' : 'pause'} size={15} color={colors.textPrimary} />
          <Text style={styles.ghostBtnText}>{paused ? 'Resume' : 'Pause'}</Text>
        </Pressable>
        <Pressable
          style={({ pressed }) => [styles.primaryBtn, { flex: 1, backgroundColor: accent }, pressed && { opacity: 0.85 }]}
          onPress={() => setMinute(timeline.duration)}
        >
          <Ionicons name="play-skip-forward" size={15} color={colors.textPrimary} />
          <Text style={styles.primaryBtnText}>SKIP TO THE WHISTLE</Text>
        </Pressable>
      </View>
    </View>
  )
}

// One side, on a pitch, with the bench underneath — the same views the stats
// screen's Lineup tab uses, so there's one way a lineup looks in this app.
//
// It's fed a per-minute snapshot (`timeline.playersAt`), which is what lets the
// exact same component be a spoiler-free pre-match team sheet at minute 0 and a
// live one at minute 63: goals appear on shirts as they're scored, a substitute
// moves off the bench the minute he comes on, and ratings move under him.
function SideLineup({ name, shape, isHome, players, sheet, accent, showRatings = true }: {
  name: string
  shape?: import('@/types/match-stats').LineupShape
  isHome: boolean
  players: PlayerMatchLine[]        // the per-minute snapshot
  sheet: PlayerMatchLine[]          // the finished sheet — who STARTED never changes
  accent: string
  showRatings?: boolean
}) {
  const side = useMemo(() => players.filter(p => p.isHome === isHome), [players, isHome])

  // Who started is a property of the SHEET, not of the minute. Deriving it from
  // the snapshot with `splitLineup` looked right and was quietly broken: at
  // minute 0 nobody has any minutes yet, so the whole starting XI classified as
  // "unused" and the entire team turned up on the bench.
  const starterIds = useMemo(() => {
    if (shape) return new Set(shape.slots.map(sl => sl.playerId))
    return new Set(splitLineup(sheet, isHome).starters.map(p => p.playerId))
  }, [shape, sheet, isHome])

  const starters = side.filter(p => starterIds.has(p.playerId))
  // Everyone else is on the bench, with whoever has come on listed first — his
  // row carries the ▲ minute, which is how a substitution reads live.
  const bench = side
    .filter(p => !starterIds.has(p.playerId))
    .sort((a, b) => (a.subOnMinute ?? 999) - (b.subOnMinute ?? 999))

  return (
    <View style={styles.card}>
      <Text style={styles.cardTitle}>{withFlag(name)}</Text>
      {shape ? (
        <MatchLineupPitch shape={shape} players={side} accent={accent} showRatings={showRatings} />
      ) : (
        // No generated shape (a legacy sheet) — a plain list rather than
        // dropping the side entirely.
        <View style={{ gap: 2 }}>
          {starters.map(p => (
            <View key={p.playerId} style={styles.nameRow}>
              <Text style={styles.namePos}>{p.position}</Text>
              <Text style={styles.nameText} numberOfLines={1}>{p.name}</Text>
            </View>
          ))}
        </View>
      )}
      {bench.length > 0 && (
        <>
          <Text style={styles.benchLabel}>Bench</Text>
          <MatchBench
            players={bench} accent={accent} showRatings={showRatings}
            // "unused" is a full-time verdict; before kickoff and mid-match he's
            // just sitting there.
            unusedLabel={showRatings ? 'on the bench' : 'sub'}
          />
        </>
      )}
    </View>
  )
}

function RatingPill({ value }: { value: number }) {
  return (
    <View style={[styles.ratingPill, { backgroundColor: ratingColor(value) }]}>
      <Text style={styles.ratingPillText}>{value.toFixed(1)}</Text>
    </View>
  )
}

// National sides are far easier to tell apart by flag than by name.
function withFlag(name: string) {
  const f = flagForCountry(name)
  return f ? `${f} ${name}` : name
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  centred: { alignItems: 'center', justifyContent: 'center', gap: spacing.md },
  scrollBody: { padding: spacing.md, paddingBottom: spacing.xl * 2, gap: spacing.md },

  kicker: { fontSize: typography.xs, fontWeight: typography.black, textTransform: 'uppercase', letterSpacing: 1.5, textAlign: 'center', },
  bigTitle: { fontSize: typography.xxl, fontWeight: typography.black, color: colors.textPrimary, textAlign: 'center' },
  tagline: { fontSize: typography.sm, color: colors.textMuted, textAlign: 'center', fontStyle: 'italic' },
  finalistRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, marginVertical: spacing.md },
  finalist: { flex: 1, fontSize: typography.lg, fontWeight: typography.black, color: colors.textPrimary },
  vs: { fontSize: typography.sm, fontWeight: typography.black, textTransform: 'uppercase' },

  board: {
    backgroundColor: colors.bgCard, paddingTop: 52, paddingBottom: spacing.md,
    paddingHorizontal: spacing.lg, gap: 4, borderBottomWidth: 2,
  },
  boardRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  boardTeam: { flex: 1, fontSize: typography.sm, fontWeight: typography.bold, color: colors.textPrimary },
  boardScoreCol: { alignItems: 'center', minWidth: 90 },
  boardScore: { fontSize: 34, fontWeight: typography.black },
  boardClock: { fontSize: typography.sm, fontWeight: typography.black, color: colors.textSecondary },
  boardScorers: { flexDirection: 'row', gap: spacing.md, marginTop: 2 },
  benchLabel: {
    fontSize: 9, color: colors.textMuted, fontWeight: typography.bold,
    textTransform: 'uppercase', letterSpacing: 1, marginTop: spacing.xs,
  },
  boardStatus: { fontSize: 9, color: colors.textMuted, textAlign: 'center', textTransform: 'uppercase', letterSpacing: 1.2, fontWeight: typography.bold },

  card: { backgroundColor: colors.bgCard, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, padding: spacing.lg, gap: spacing.sm },
  cardTitle: { fontSize: typography.sm, fontWeight: typography.black, color: colors.textPrimary, textTransform: 'uppercase', letterSpacing: 1 },

  nameRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingVertical: 2 },
  namePos: { width: 30, fontSize: 9, fontWeight: typography.black, color: colors.textMuted },
  nameText: { flex: 1, fontSize: typography.xs, color: colors.textSecondary },
  offMark: { fontSize: 9, color: colors.danger, fontWeight: typography.bold },

  teamRatingRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.md, marginTop: spacing.sm },
  teamRatingLabel: { fontSize: 9, color: colors.textMuted, fontWeight: typography.bold, letterSpacing: 1 },
  ratingPill: { minWidth: 34, paddingHorizontal: 6, paddingVertical: 3, borderRadius: radius.sm, alignItems: 'center' },
  ratingPillText: { fontSize: typography.xs, fontWeight: typography.black, color: '#0B1220' },

  eventRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingVertical: 2 },
  eventMin: { width: 34, fontSize: 10, fontWeight: typography.black, color: colors.textMuted },
  eventText: { flex: 1, fontSize: typography.xs, color: colors.textPrimary },
  eventTextAway: { textAlign: 'right' },
  eventDetail: { fontSize: 10, color: colors.textMuted, fontWeight: typography.regular },

  footer: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.sm,
    paddingHorizontal: spacing.lg, paddingTop: spacing.md, paddingBottom: spacing.xl,
    borderTopWidth: 1, borderTopColor: colors.border, backgroundColor: colors.bg,
  },
  primaryBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.sm,
    borderRadius: radius.md, paddingVertical: spacing.md, paddingHorizontal: spacing.lg,
  },
  primaryBtnText: { fontSize: typography.md, fontWeight: typography.black, color: colors.textPrimary, letterSpacing: 1 },
  ghostBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    borderRadius: radius.md, borderWidth: 1, borderColor: colors.border,
    backgroundColor: colors.bgElevated, paddingVertical: spacing.md, paddingHorizontal: spacing.md,
  },
  ghostBtnText: { fontSize: typography.sm, fontWeight: typography.bold, color: colors.textPrimary },

  muted: { fontSize: typography.sm, color: colors.textMuted, fontStyle: 'italic' },
  textBtn: { padding: spacing.md },
  textBtnLabel: { fontSize: typography.md, fontWeight: typography.bold },
})
