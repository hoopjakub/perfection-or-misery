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
import { WebColumn } from '@/components/kit'
import { View, StyleSheet, ScrollView } from 'react-native'
import { router } from 'expo-router'
import Animated, { FadeIn, FadeInDown, useReducedMotion } from 'react-native-reanimated'
import { ROLES, space, border, prim, ratingColor } from '@/theme'
import { flagForCountry } from '@/data/geo-iso'
import { KitText, Plate, Tag, SectionTag, RoundFlag } from '@/components/kit'
import { ThumbBar } from '@/components/season/RunChrome'
import { lineForEvent, quietLine, type CommentaryLine } from '@/engine/commentary'
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

// C6 (docs/ui-overhaul/07c) — the finale on nylon. The shell is Kit Drop: the
// scoreline as a super with the clock as a tag and a line of commentary under
// it, sections instead of cards, the controls in the thumb zone, and the final
// whistle as a cut to silence before the ceremony. The panels inside (the
// pitch, the momentum graph, the stat bars, the timeline) are the ones the
// match screen shares, and they're restyled in that screen's own pass (P4-H),
// so nothing on them is lost in the meantime.
const roles = ROLES.nylon

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
        <KitText t="superM" color={roles.text}>"NO FINAL"</KitText>
        <KitText t="bodyL" color={roles.textMuted}>There's no final waiting to be played.</KitText>
        <Plate label="Go back" roles={roles} onPress={() => router.back()} />
      </View>
    )
  }

  if (loading || !detail) {
    return (
      <View style={[styles.container, styles.centred]}>
        <KitText t="superL" color={roles.text}>"WALKING OUT"</KitText>
        <KitText t="bodyL" color={roles.textMuted}>The tunnel. The noise. The lights.</KitText>
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
    <WebColumn background={ROLES.nylon.bg}>
    <MatchBeats
      request={request} detail={detail} phase={phase}
      onStart={() => setPhase('live')} onFinished={() => setPhase('ceremony')}
    />
    </WebColumn>
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
      <KitText t="superM" color={roles.text}>"AWARDS NIGHT"</KitText>
      <KitText t="bodyL" color={roles.textMuted}>The season, counted up.</KitText>
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
        <View style={styles.sheetHead}>
          <SectionTag roles={roles}>{request.competitionLabel}</SectionTag>
          <KitText t="superXl" color={roles.text} style={styles.centreText}>{request.roundLabel.toUpperCase()}</KitText>
          <KitText t="bodyL" color={roles.textMuted} style={styles.centreText}>One match. Everything on it.</KitText>
        </View>
        <View style={styles.finalistRow}>
          <Finalist name={request.detail.homeName} align="right" />
          <KitText t="tag" color={roles.textMuted}>V</KitText>
          <Finalist name={request.detail.awayName} align="left" />
        </View>

        {sides.map(s => (
          <SideLineup
            key={s.key} name={s.name} shape={s.shape} isHome={s.isHome}
            players={kickoffPlayers} sheet={detail.players} accent={accent} showRatings={false}
          />
        ))}
      </ScrollView>

      <ThumbBar>
        <Plate label="Kick off the final" icon="play" roles={roles} onPress={onStart} />
      </ThumbBar>
    </View>
  )
}

function Finalist({ name, align }: { name: string; align: 'left' | 'right' }) {
  const flag = flagForCountry(name)
  return (
    <View style={[styles.finalist, { alignItems: align === 'right' ? 'flex-end' : 'flex-start' }]}>
      {flag ? <RoundFlag emoji={flag} code={name.slice(0, 3)} size={24} roles={roles} /> : null}
      <KitText t="superS" color={roles.text} numberOfLines={2} style={{ textAlign: align }}>{name.toUpperCase()}</KitText>
    </View>
  )
}

// ── Beat 2: the match ───────────────────────────────────────────────────────
function LivePlayback({ request, detail, timeline, onFinished }: {
  request: DeepMatchRequest; detail: MatchStats; timeline: DeepMatchTimeline; onFinished: () => void
}) {
  const { accent } = request
  const reduced = useReducedMotion()

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

  // Full time — whether we got here on the clock or by skipping. The whistle
  // is a cut to silence (C6 move 4): everything stops, the ground holds for a
  // beat, and only then does the ceremony start.
  const [silence, setSilence] = useState(false)
  useEffect(() => {
    if (minute < timeline.duration || finishedRef.current) return
    finishedRef.current = true
    setSilence(true)
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

  // Commentary: every event as a line, newest first, with a quiet line read
  // from the state of play whenever nothing has happened for a while.
  const home = request.detail.homeName, away = request.detail.awayName
  const commentary = useMemo<CommentaryLine[]>(() => {
    const said = shownEvents.map(e => lineForEvent(e, home, away)).reverse()
    const lastEvent = shownEvents[shownEvents.length - 1]
    const quiet = !lastEvent || minute - lastEvent.minute >= 8
    const state = frame ? { homePossession: frame.home.possession, homeShots: frame.home.shots, awayShots: frame.away.shots } : null
    return quiet && minute < timeline.duration ? [quietLine(minute, state, home, away), ...said] : said
  }, [shownEvents, minute, frame, home, away, timeline.duration])

  return (
    <View style={styles.container}>
      {/* The scoreboard, pinned: the score as a super, the clock as a tag, the
          latest line of commentary under it. */}
      <View style={[styles.board, { borderBottomColor: roles.line }]}>
        <View style={styles.boardTop}>
          <KitText t="tag" color={roles.textMuted} style={{ flex: 1 }}>{request.roundLabel}</KitText>
          <Tag roles={roles} variant="selected">{`${minute}'`}</Tag>
          <KitText t="tag" color={roles.textMuted}>{status}</KitText>
        </View>
        <View style={styles.boardRow}>
          <KitText t="title" color={roles.text} numberOfLines={2} style={[styles.boardTeam, { textAlign: 'right' }]}>{home}</KitText>
          <KitText t="superXl" color={roles.text} style={styles.boardScore}>{`${frame?.homeGoals ?? 0}–${frame?.awayGoals ?? 0}`}</KitText>
          <KitText t="title" color={roles.text} numberOfLines={2} style={styles.boardTeam}>{away}</KitText>
        </View>
        {/* Who scored, right under the score — the same block the stats screen
            puts there, so a goal reads identically live and afterwards. */}
        {shownEvents.some(e => e.type === 'goal') && (
          <View style={styles.boardScorers}>
            <ScorerList events={shownEvents} isHome align="right" />
            <ScorerList events={shownEvents} isHome={false} align="left" />
          </View>
        )}
        {commentary[0] && (
          <Animated.View key={commentary[0].minute + commentary[0].text} entering={reduced ? undefined : FadeInDown.duration(200)}
            style={styles.commentary} accessibilityLiveRegion="polite">
            <KitText t="tag" color={roles.textMuted}>{commentary[0].minute}</KitText>
            <KitText t={commentary[0].big ? 'title' : 'body'} color={roles.text} style={{ flex: 1 }}>{commentary[0].text}</KitText>
          </Animated.View>
        )}
      </View>

      <ScrollView contentContainerStyle={styles.scrollBody}>
        <View style={styles.section}>
          <SectionTag roles={roles}>Momentum</SectionTag>
          <MomentumGraph
            series={detail.momentum.slice(0, shownDuration)} duration={shownDuration}
            markers={momentumMarkers(shownEvents)}
            revealUpTo={minute}
            accentHome={accent}
            homeName={home} awayName={away}
          />
        </View>

        {frame && (
          <View style={styles.section}>
            <SectionTag roles={roles}>Match stats</SectionTag>
            <StatSideHeader homeName={home} awayName={away} accent={accent} />
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
              <KitText t="tag" color={roles.textMuted}>Team rating</KitText>
              <RatingPill value={frame.awayRating} />
            </View>
          </View>
        )}

        <View style={styles.section}>
          <SectionTag roles={roles}>Commentary</SectionTag>
          {commentary.length === 0
            ? <KitText t="body" color={roles.textMuted}>Nothing yet. They're feeling each other out.</KitText>
            : commentary.slice(0, 12).map((c, i) => (
                <View key={`${c.minute}${i}`} style={[styles.feedRow, { borderBottomColor: roles.rule }]}>
                  <KitText t="tag" color={roles.textMuted} style={styles.feedMin}>{c.minute}</KitText>
                  <KitText t={c.big ? 'title' : 'body'} color={c.big ? roles.text : roles.textMuted} style={{ flex: 1 }}>{c.text}</KitText>
                </View>
              ))}
        </View>

        <View style={styles.section}>
          <SectionTag roles={roles}>Timeline</SectionTag>
          {shownEvents.length === 0
            ? <KitText t="body" color={roles.textMuted}>No events yet.</KitText>
            : (
              // The SAME timeline the stats screen draws, so the live match and
              // the sheet you open afterwards tell the story the same way.
              // `revealUpTo` keeps the period breaks from appearing early.
              <Timeline
                events={shownEvents} addedTime={detail.addedTime}
                duration={shownDuration} revealUpTo={minute}
              />
            )}
        </View>

        {([true, false] as const).map(isHome => (
          <SideLineup
            key={String(isHome)}
            name={isHome ? home : away}
            shape={isHome ? detail.homeShape : detail.awayShape}
            isHome={isHome} players={livePlayers} sheet={detail.players} accent={accent}
          />
        ))}
      </ScrollView>

      {/* §7 R4 — both controls are pure UI: everything already happened. */}
      <ThumbBar>
        <View style={styles.controls}>
          <Plate label={paused ? 'Resume' : 'Pause'} icon={paused ? 'play' : 'pause'} variant="secondary" roles={roles}
            onPress={() => setPaused(p => !p)} disabled={minute >= timeline.duration} style={{ flex: 1 }} />
          <Plate label="Skip to the whistle" icon="skip" roles={roles} onPress={() => setMinute(timeline.duration)} style={{ flex: 1 }} />
        </View>
      </ThumbBar>

      {silence && (
        <Animated.View entering={reduced ? undefined : FadeIn.duration(120)} style={[StyleSheet.absoluteFill, styles.silence]}
          accessibilityLiveRegion="assertive" accessibilityLabel={`Full time. ${home} ${frame?.homeGoals ?? 0}, ${away} ${frame?.awayGoals ?? 0}`}>
          <KitText t="tag" color={roles.textMuted}>Full time</KitText>
          <KitText t="superXl" color={roles.text}>{`${frame?.homeGoals ?? 0}–${frame?.awayGoals ?? 0}`}</KitText>
          <KitText t="bodyL" color={roles.textMuted} style={styles.centreText}>{`${home} v ${away}`}</KitText>
        </Animated.View>
      )}
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
    <View style={styles.section}>
      <SectionTag roles={roles}>{name}</SectionTag>
      {shape ? (
        <MatchLineupPitch shape={shape} players={side} accent={accent} showRatings={showRatings} />
      ) : (
        // No generated shape (a legacy sheet) — a plain list rather than
        // dropping the side entirely.
        <View style={{ gap: 2 }}>
          {starters.map(p => (
            <View key={p.playerId} style={styles.nameRow}>
              <KitText t="tag" color={roles.textMuted} style={styles.namePos}>{p.position}</KitText>
              <KitText t="body" color={roles.text} numberOfLines={1} style={{ flex: 1 }}>{p.name}</KitText>
            </View>
          ))}
        </View>
      )}
      {bench.length > 0 && (
        <>
          <KitText t="tag" color={roles.textMuted}>Bench</KitText>
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
      <KitText t="figure" color={prim.ink}>{value.toFixed(1)}</KitText>
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: roles.bg },
  centred: { alignItems: 'center', justifyContent: 'center', gap: space[4], padding: space[4] },
  centreText: { textAlign: 'center' },
  scrollBody: { padding: space[4], paddingBottom: space[7], gap: space[5] },

  sheetHead: { alignItems: 'center', gap: space[2], paddingTop: space[7] },
  finalistRow: { flexDirection: 'row', alignItems: 'center', gap: space[3] },
  finalist: { flex: 1, gap: space[1] },

  board: { paddingTop: space[7], paddingBottom: space[3], paddingHorizontal: space[4], gap: space[2], borderBottomWidth: border.plate, backgroundColor: roles.bg },
  boardTop: { flexDirection: 'row', alignItems: 'center', gap: space[2] },
  boardRow: { flexDirection: 'row', alignItems: 'center', gap: space[2] },
  boardTeam: { flex: 1 },
  boardScore: { minWidth: 120, textAlign: 'center' },
  boardScorers: { flexDirection: 'row', gap: space[3] },
  commentary: { flexDirection: 'row', alignItems: 'flex-start', gap: space[2], minHeight: 36 },

  section: { gap: space[2] },
  feedRow: { flexDirection: 'row', alignItems: 'flex-start', gap: space[2], paddingVertical: space[1], borderBottomWidth: border.hair },
  feedMin: { width: 44, paddingTop: 2 },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: space[2], paddingVertical: 2 },
  namePos: { width: 36 },

  teamRatingRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: space[3], marginTop: space[2] },
  ratingPill: { minWidth: 40, paddingHorizontal: 6, paddingVertical: 3, alignItems: 'center' },

  controls: { flexDirection: 'row', gap: space[2] },
  silence: { backgroundColor: prim.black, alignItems: 'center', justifyContent: 'center', gap: space[3], padding: space[4] },
})
