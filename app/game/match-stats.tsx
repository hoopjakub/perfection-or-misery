// Full match stats — Big Fixes §10, restructured into tabs by §10.5.
//
// Reached via `openMatchStats(request)` (src/lib/matchStats.ts) from any
// finished match row anywhere in the app. Everything on it is regenerated
// deterministically from the match's stored seed + scorers, so the numbers here
// always agree with the live reveal, the result screens and a history reload.
//
// Shape: a permanent top bar, a tall scoreline that scrolls away beneath a
// sticky tab strip, and three tabs — FACTS (the story of the match), LINEUP,
// STATS (the full grid). As the scoreline leaves, a compact copy of it fades
// into the top bar, so the score is never off-screen.

import { venueFor } from '@/data/venues'
import { kickoffFor } from '@/engine/schedule'
import { Loader } from '@/components/kit'
import { TeamColoursContext, useTeamColours, useTeamColourPair } from '@/lib/teamColours'
import React, { useEffect, useMemo, useRef, useState } from 'react'
import { nameShootout } from '@/engine/run-stats'
import type { PenKick } from '@/engine/knockout-match'
import { useSizeClass } from '@/hooks/useSizeClass'
import { WebColumn } from '@/components/kit'
import { View, StyleSheet, Pressable, Animated, ScrollView } from 'react-native'
// P8-123: text on the kit's families and scale until this screen is rebuilt on KitText.
import { ScaleText as Text } from '@/components/kit'
import { openPlayer, openClub } from '@/lib/runNav'
import { router } from 'expo-router'
import { Ionicons } from '@expo/vector-icons'
import { colors, spacing, typography, radius, ratingColor, ratingInk, prim, font } from '@/theme'
import { flagForCountry } from '@/data/geo-iso'
import { openMatchStats, takeMatchStatsRequest } from '@/lib/matchStats'
import {
  useMatchDetail, StatBar, PlayerRow, Timeline, FeedRow, type FeedRowData, splitLineup, ScorerList, StatSideHeader, effectiveSeed,
  type MatchDetailRequest,
} from '@/components/MatchStatsParts'
import { buildShotMap, averagePositions, heatMap } from '@/engine/match-geometry'
import { ShotMap, AveragePositions, HeatMap } from '@/components/match/PitchViews'
import { formatRating } from '@/theme'
import { ROLES } from '@/theme'
import { KitText, Chips, SectionTag, Crest, RatingSquare, EventMark, VenueMark } from '@/components/kit'
import { MomentumGraph, momentumMarkers } from '@/components/MomentumGraph'
import { MatchLineupPitch, MatchBench } from '@/components/MatchLineupPitch'
import {
  standingsAsOf, formBefore, topRated, nextMatchFor, knockoutBracket,
  type ContextMatch, type ContextRow, type FormResult,
  type BracketRound, type BracketTie,
} from '@/engine/match-context'
import type { MatchEvent, PlayerMatchLine, MatchStats } from '@/types/match-stats'
import { lineForEvent, chanceLines, timedShots } from '@/engine/commentary'

type Tab = 'facts' | 'commentary' | 'lineup' | 'map' | 'stats'

// Scroll distance over which the compact score fades into the top bar — timed
// so it has arrived by the time the tall header has scrolled out of sight.
const HEADER_FADE_START = 40
const HEADER_FADE_END = 110

// A timeline match as a sheet request, carrying the page's shared context
// (squad, season, links) and the match's own shootout (P8-103: this used to
// drop it, so a second leg opened from the tie card showed no penalties).
function requestFromContext(r: MatchDetailRequest, m: ContextMatch): MatchDetailRequest | null {
  if (m.homeGoals === undefined || m.awayGoals === undefined) return null
  return {
    homeClubId: m.homeClubId, homeName: m.homeClubName,
    awayClubId: m.awayClubId, awayName: m.awayClubName,
    homeGoals: m.homeGoals, awayGoals: m.awayGoals,
    extraTime: m.extraTime, pensNote: m.pensNote, shootout: m.shootout,
    scorers: m.scorers, seed: m.seed,
    homeRotation: m.homeRotation, awayRotation: m.awayRotation,
    absent: m.absent, standIns: m.standIns,
    yearStart: r.yearStart,
    competitionLabel: m.label,
    playerClubId: r.playerClubId, drafted: r.drafted, playerFormation: r.playerFormation,
    matchday: m.matchday, contextMatches: r.contextMatches, linkPages: r.linkPages,
  }
}

const LEG = / · Leg ([12])$/

// Both legs of the tie this match belongs to, or null for a single match. On a
// timeline the other leg is the knockout game between the same two clubs, the
// other way round, labelled as the other leg of the same round.
function tieLegs(r: MatchDetailRequest): MatchDetailRequest[] | null {
  if (r.legs?.length === 2) return r.legs
  const round = r.competitionLabel?.match(LEG) ? r.competitionLabel.replace(LEG, '') : null
  if (!round || !r.contextMatches) return null
  const leg = (n: 1 | 2) => r.contextMatches!.find(c => c.inTable === false && c.label === `${round} · Leg ${n}`
    && ((c.homeClubId === r.homeClubId && c.awayClubId === r.awayClubId) || (c.homeClubId === r.awayClubId && c.awayClubId === r.homeClubId)))
  const l1 = leg(1), l2 = leg(2)
  const a = l1 && requestFromContext(r, l1), b = l2 && requestFromContext(r, l2)
  return a && b ? [a, b] : null
}

export default function MatchStatsScreen() {
  // Taken ONCE on mount: the screen owns its match for as long as it's on the
  // stack, so opening another match from underneath can't swap this one out.
  // Only the leg switcher (P8-101) changes it, and only to the same tie's other leg.
  const [request, setRequest] = useState<MatchDetailRequest | null>(() => takeMatchStatsRequest())
  const { detail, loading } = useMatchDetail(request)
  const [expandedId, setExpandedId] = useState<string | null>(null)
  // P8-48: a player tapped on the pitch opens his stats in the list below and
  // the screen slides down to them — before, the row opened out of sight and
  // the tap seemed to do nothing. Each row reports itself; the scroll's own
  // offset is tracked with the header's listener.
  const scrollRef = useRef<any>(null)
  const offset = useRef(0)
  const rowRefs = useRef(new Map<string, View>())
  const rowRef = (id: string) => (el: View | null) => { if (el) rowRefs.current.set(id, el); else rowRefs.current.delete(id) }
  // The platform's animated scroll is a fixed, quick jump — "slow it down" (the
  // maintainer, 24 Sept). This glides over GLIDE_MS on an ease-out, frame by
  // frame, so you see where on the page his stats are.
  const GLIDE_MS = 700
  const glideTo = (target: number) => {
    const from = offset.current, t0 = Date.now()
    const frame = () => {
      const k = Math.min(1, (Date.now() - t0) / GLIDE_MS)
      const eased = 1 - Math.pow(1 - k, 3)
      scrollRef.current?.scrollTo?.({ y: from + (target - from) * eased, animated: false })
      if (k < 1) requestAnimationFrame(frame)
    }
    requestAnimationFrame(frame)
  }
  const focusPlayer = (id: string) => {
    setExpandedId(id)
    // Two frames: the row has to open (and the list reflow) before it's measured.
    requestAnimationFrame(() => requestAnimationFrame(() => {
      const row = rowRefs.current.get(id)
      const sv = scrollRef.current?.getNativeScrollRef?.() ?? scrollRef.current
      if (!row || !sv?.measureInWindow) return
      sv.measureInWindow((_x: number, top: number) => {
        row.measureInWindow((_rx: number, rowTop: number) => {
          glideTo(Math.max(0, offset.current + rowTop - top - 96))
        })
      })
    }))
  }
  const [tab, setTab] = useState<Tab>('facts')
  const wide = useSizeClass() === 'expanded'
  const paired = wide && (tab === 'facts' || tab === 'lineup')
  const scrollY = useRef(new Animated.Value(0)).current
  // Whether the header is still up: the leg switcher only takes taps then (P8-101).
  const [atTop, setAtTop] = useState(true)
  useEffect(() => {
    const id = scrollY.addListener(({ value }) => {
      offset.current = value
      setAtTop(value < (HEADER_FADE_START + HEADER_FADE_END) / 2)
    })
    return () => scrollY.removeListener(id)
  }, [scrollY])
  // P8-81: the shootout, named. Ties the live reveal showed arrive named;
  // any other penalty match is named here through the same shared fetch.
  const [kicks, setKicks] = useState<Kicks | null>(null)
  useEffect(() => {
    const so = request?.shootout
    setKicks(null)   // switching legs: leg 1 must not keep leg 2's shootout
    if (!request || !so) return
    if (so.homeKicks && so.awayKicks) { setKicks({ home: so.homeKicks, away: so.awayKicks }); return }
    let alive = true
    nameShootout(request.homeClubId, request.awayClubId, so.home, so.away, request.playerClubId, request.drafted)
      .then(k => { if (alive) setKicks(k) })
      .catch(e => console.warn('[match-stats] shootout names failed:', e))
    return () => { alive = false }
  }, [request])

  // P4-H — on nylon the sheet reads in cotton; a competition's colour is
  // location, never meaning, so it doesn't tint numbers here.
  const accent = prim.cotton
  const r = request
  // P8-92: when it was played; the same kick-off every view works out.
  const kickoff = r ? kickoffFor({ label: r.competitionLabel, yearStart: r.yearStart, seed: r.seed, homeClubId: r.homeClubId, awayClubId: r.awayClubId }) : null
  // P8-93: and where — the home side's ground, a final's venue, a World Cup stadium.
  const venue = r ? venueFor({ label: r.competitionLabel, yearStart: r.yearStart, homeName: r.homeName, homeClubId: r.homeClubId, awayClubId: r.awayClubId }) : null
  // Each side in its club colour on the graph and bars (P8-49).
  const teamColours = useTeamColours(request?.homeClubId, request?.awayClubId)

  const lineups = useMemo(
    () => detail ? { home: splitLineup(detail.players, true), away: splitLineup(detail.players, false) } : null,
    [detail],
  )

  // §10 R6/R7 + §10.5 — form and "next match" work in any competition because
  // knockout rounds continue the matchday sequence; only the TABLE is limited
  // to league-phase games (see ContextMatch.inTable).
  const context = useMemo(() => {
    if (!r?.contextMatches?.length || r.matchday === undefined) return null
    const table = standingsAsOf(r.contextMatches, r.matchday)
    // A knockout leg has no matchday of its own in the table, so the standings
    // it sits above are the league phase's FINAL ones — say that rather than
    // claiming a matchday number the table doesn't correspond to.
    const isLeagueRound = r.contextMatches.some(m => m.matchday === r.matchday && m.inTable !== false)
    // A knockout tie gets the BRACKET as its "at the time of this match", not a
    // table: the two sides may not even share a group, so the standings above a
    // cup tie answered a question nobody asked (and in a World Cup it merged all
    // twelve groups into one nonsense 48-team league). Rounds up to and
    // including this one, so it reads as "the road here".
    const bracket = knockoutBracket(r.contextMatches, r.matchday)
    return {
      table: table.length >= 2 ? table : null,
      tableLabel: isLeagueRound ? `Standings after matchday ${r.matchday}` : 'League phase final standings',
      bracket: !isLeagueRound && bracket.length > 0 ? bracket : null,
      homeForm: formBefore(r.contextMatches, r.homeClubId, r.matchday),
      awayForm: formBefore(r.contextMatches, r.awayClubId, r.matchday),
      homeNext: nextMatchFor(r.contextMatches, r.homeClubId, r.matchday),
      awayNext: nextMatchFor(r.contextMatches, r.awayClubId, r.matchday),
    }
  }, [r])

  // Tapping any other match on this page opens ITS full stats, inheriting the
  // season context so you can keep walking the campaign match by match.
  const openRelated = (m: ContextMatch) => {
    const req = r && requestFromContext(r, m)
    if (req) openMatchStats(req, accent)
  }

  // P8-101: a two-legged tie's legs, and which one this is. Found on the
  // timeline when there is one; the run hub hands them over as `legs`.
  const legs = r ? tieLegs(r) : null
  const legIdx = legs ? legs.findIndex(l => l.competitionLabel === r!.competitionLabel && l.homeClubId === r!.homeClubId) : -1
  const switchLeg = (i: number) => {
    if (!legs?.[i] || i === legIdx) return
    setRequest({ ...legs[i], legs: r!.legs })
  }

  if (!r) {
    return (
      <View style={[styles.container, styles.centred]}>
        {/* Reached by a reload (the match rides in memory): there may be no
            history to go back to, so fall back to Home. */}
        <Text style={styles.noData}>This match isn't open any more. It was lost when the page reloaded.</Text>
        <Pressable style={styles.backLink} accessibilityRole="button" onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))}>
          <Text style={[styles.backLinkText, { color: accent }]}>{router.canGoBack() ? 'Go back' : 'Go home'}</Text>
        </Pressable>
      </View>
    )
  }

  const status = r.pensNote ? 'PENS' : r.extraTime ? 'AET' : 'FT'
  const motm = detail?.players.find(p => p.motm) ?? null

  // Only the top bar's compact score is animated, and only its OPACITY. The
  // tall header is ordinary scroll content that a sticky tab bar slides over —
  // see the note on `stickyHeaderIndices` below.
  const barOpacity = scrollY.interpolate({
    inputRange: [HEADER_FADE_START, HEADER_FADE_END], outputRange: [0, 1], extrapolate: 'clamp',
  })

  const lineupBody = detail && lineups ? (
          <>
            {/* The XI on a pitch — what the side actually lined up in. */}
            {([['home', r.homeName, detail.homeShape], ['away', r.awayName, detail.awayShape]] as const).map(([side, name, shape]) => (
              <Section key={`pitch-${side}`} title={name}>
                {shape ? (
                  <>
                    <MatchLineupPitch
                      shape={shape}
                      players={detail.players.filter(p => p.isHome === (side === 'home'))}
                      accent={accent}
                      onPressPlayer={l => focusPlayer(l.playerId)}
                    />
                    <Text style={styles.benchLabel}>Bench</Text>
                    <MatchBench
                      players={[...lineups[side].cameOn, ...lineups[side].unused]}
                      accent={accent}
                      onPressPlayer={l => focusPlayer(l.playerId)}
                    />
                  </>
                ) : (
                  <Text style={styles.hint}>
                    No formation recorded for this side — see the ratings list below.
                  </Text>
                )}
              </Section>
            ))}

          <Section title="Lineups & ratings">
            <Text style={styles.hint}>Tap a player for their full match stats · POTM = player of the match</Text>
            {([['home', r.homeName], ['away', r.awayName]] as const).map(([side, name]) => {
              const lu = lineups[side]
              return (
                <View key={side} style={{ marginTop: spacing.md }}>
                  <Text style={[styles.lineupTeam, { color: accent }]}>{withFlag(name)}</Text>
                  {lu.starters.map(l => (
                    <View key={l.playerId} ref={rowRef(l.playerId)} collapsable={false}>
                    <PlayerRow l={l} accent={accent}
                      expanded={expandedId === l.playerId}
                      onPress={() => setExpandedId(id => id === l.playerId ? null : l.playerId)} />
                    {r.linkPages && expandedId === l.playerId && (
                      <Pressable onPress={() => openPlayer(l.playerId)} accessibilityRole="link" style={({ pressed }) => [styles.seasonLink, pressed && { opacity: 0.6 }]}>
                        <Text style={[styles.seasonLinkText, { color: accent }]}>Their whole season ›</Text>
                      </Pressable>
                    )}
                    </View>
                  ))}
                  {lu.cameOn.length > 0 && <Text style={styles.benchLabel}>Came on</Text>}
                  {lu.cameOn.map(l => (
                    <View key={l.playerId} ref={rowRef(l.playerId)} collapsable={false}>
                    <PlayerRow l={l} accent={accent}
                      expanded={expandedId === l.playerId}
                      onPress={() => setExpandedId(id => id === l.playerId ? null : l.playerId)} />
                    {r.linkPages && expandedId === l.playerId && (
                      <Pressable onPress={() => openPlayer(l.playerId)} accessibilityRole="link" style={({ pressed }) => [styles.seasonLink, pressed && { opacity: 0.6 }]}>
                        <Text style={[styles.seasonLinkText, { color: accent }]}>Their whole season ›</Text>
                      </Pressable>
                    )}
                    </View>
                  ))}
                  {lu.unused.length > 0 && <Text style={styles.benchLabel}>Unused subs</Text>}
                  {lu.unused.map(l => (
                    <View key={l.playerId} ref={rowRef(l.playerId)} collapsable={false}>
                      <PlayerRow l={l} accent={accent} expanded={false} onPress={() => {}} />
                    </View>
                  ))}
                </View>
              )
            })}
          </Section>
          </>
  ) : null

  return (
    <WebColumn background={prim.nylon} maxWidth={paired ? 1200 : undefined}>
    <TeamColoursContext.Provider value={teamColours}>
    <View style={styles.container}>
      {/* Top bar — always present. The score fades into it as you scroll. */}
      <View style={styles.topBar}>
        <Pressable style={styles.backBtn} onPress={() => router.back()} hitSlop={10}>
          <Ionicons name="chevron-back" size={22} color={prim.cotton} />
        </Pressable>
        {/* P8-101: ‹ LEG 1 OF 2 ›, the arrows right beside the words. It gives
            way to the score on scroll, and stops taking taps once it has. */}
        {legs && (
          <Animated.View style={[styles.legLabel, { opacity: Animated.subtract(1, barOpacity) }]} pointerEvents={atTop ? 'box-none' : 'none'}>
            <View style={styles.legSwitch}>
              <Pressable style={styles.legArrow} onPress={() => switchLeg(legIdx - 1)} disabled={legIdx <= 0} hitSlop={8}
                accessibilityRole="button" accessibilityLabel="Leg 1" accessibilityState={{ disabled: legIdx <= 0 }}>
                <Ionicons name="chevron-back" size={18} color={legIdx <= 0 ? prim.nylonFaint : prim.cotton} />
              </Pressable>
              <KitText t="tag" color={prim.cotton}>{`LEG ${legIdx + 1} OF 2`}</KitText>
              <Pressable style={styles.legArrow} onPress={() => switchLeg(legIdx + 1)} disabled={legIdx >= legs.length - 1} hitSlop={8}
                accessibilityRole="button" accessibilityLabel="Leg 2" accessibilityState={{ disabled: legIdx >= legs.length - 1 }}>
                <Ionicons name="chevron-forward" size={18} color={legIdx >= legs.length - 1 ? prim.nylonFaint : prim.cotton} />
              </Pressable>
            </View>
          </Animated.View>
        )}
        <Animated.View style={[styles.topBarScore, { opacity: barOpacity }]} pointerEvents="none">
          {/* Flags stay with the names once collapsed — national sides are far
              easier to tell apart by flag than by a truncated name. */}
          <Text style={styles.topBarTeam} numberOfLines={1}>{withFlag(r.homeName)}</Text>
          <Text style={[styles.topBarNums, { color: accent }]}>{r.homeGoals}</Text>
          <Text style={styles.topBarStatus}>{status}</Text>
          <Text style={[styles.topBarNums, { color: accent }]}>{r.awayGoals}</Text>
          <Text style={[styles.topBarTeam, { textAlign: 'right' }]} numberOfLines={1}>{withFlag(r.awayName)}</Text>
        </Animated.View>
        <View style={styles.backBtn} />
      </View>

      {/* The header is child 0 and the tab bar child 1, with the tab bar marked
          sticky. This is deliberately NOT an animated collapse: animating the
          header's height re-laid-out the scroll view on every frame, which fed
          straight back into the scroll offset and made slow scrolling stutter
          and snap. Letting the header simply scroll away under a sticky tab bar
          is the platform's own mechanism — zero layout work per frame, smooth
          at any scroll speed — and the only thing left animating is one
          opacity, which can't affect layout. */}
      <Animated.ScrollView
        ref={scrollRef}
        stickyHeaderIndices={[1]}
        showsVerticalScrollIndicator
        scrollEventThrottle={16}
        onScroll={Animated.event([{ nativeEvent: { contentOffset: { y: scrollY } } }], { useNativeDriver: false })}
      >
        <View style={styles.headerCollapse}>
          {r.competitionLabel ? <Text style={styles.compLabel} numberOfLines={1}>{r.competitionLabel}</Text> : null}
          {/* P8-92: when it was played, the same kick-off every view works out. */}
          {kickoff ? <Text style={styles.compLabel} numberOfLines={1}>{`${kickoff.day} · ${kickoff.time}`}</Text> : null}
          {venue ? <Text style={styles.compLabel} numberOfLines={1}>{venue.city ? `${venue.name}, ${venue.city}` : venue.name}</Text> : null}
          {/* P8-134: your match, from your side: at home or away. */}
          {r.playerClubId && (r.playerClubId === r.homeClubId || r.playerClubId === r.awayClubId) && !isNeutral(r.competitionLabel) ? (
            <View style={styles.venueLine}><VenueMark roles={ROLES.nylon} home={r.playerClubId === r.homeClubId} /></View>
          ) : null}
          <View style={styles.headerRow}>
            {/* P8-12: a club's crest beside its name; a national side already
                carries its flag through withFlag. */}
            {flagForCountry(r.homeName) ? null : <Crest roles={ROLES.nylon} clubId={r.homeClubId} name={r.homeName} size={20} />}
            <Text style={[[styles.headerTeam, { textAlign: 'right' }], r.linkPages && styles.linked]} numberOfLines={2} onPress={r.linkPages ? () => openClub(r.homeClubId) : undefined} accessibilityRole={r.linkPages ? 'link' : undefined}>{withFlag(r.homeName)}</Text>
            <View style={styles.headerScoreCol}>
              <Text style={[styles.headerScore, { color: accent }]} numberOfLines={1}>{r.homeGoals} – {r.awayGoals}</Text>
              <Text style={styles.headerStatus}>
                {status === 'FT' ? 'Full time' : status === 'AET' ? 'After extra time' : 'Penalties'}
              </Text>
            </View>
            <Text style={[styles.headerTeam, r.linkPages && styles.linked]} numberOfLines={2} onPress={r.linkPages ? () => openClub(r.awayClubId) : undefined} accessibilityRole={r.linkPages ? 'link' : undefined}>{withFlag(r.awayName)}</Text>
            {flagForCountry(r.awayName) ? null : <Crest roles={ROLES.nylon} clubId={r.awayClubId} name={r.awayName} size={20} />}
          </View>
          {r.pensNote ? <Text style={[styles.pensNote, { color: accent }]}>{r.pensNote}</Text> : null}
          {detail && (
            <View style={styles.scorerRow}>
              <ScorerList events={detail.events} isHome align="right" />
              <ScorerList events={detail.events} isHome={false} align="left" />
            </View>
          )}
        </View>

        {/* Two views on purpose. On native, ScrollViewStickyHeader MOVES the
            sticky child's style onto its own wrapper and replaces it with a
            plain `flex: 1` — so `flexDirection: 'row'` on this outer view would
            be lost and the tabs stacked vertically on Android (a fifth of the
            screen). The outer view only carries what's safe to move; the row
            lives one level down, where nothing rewrites it. Web uses CSS
            position: sticky and never had the bug. */}
        <View style={styles.tabBar}>
          <View style={styles.tabRow}>
            {((wide ? ['facts', 'commentary', 'map', 'stats'] : ['facts', 'commentary', 'lineup', 'map', 'stats']) as Tab[]).map(t => (
              <Pressable
                key={t} style={styles.tabBtn} onPress={() => setTab(t)}
                accessibilityRole="tab" accessibilityState={{ selected: tab === t }}
              >
                <Text style={[styles.tabText, tab === t && { color: prim.cotton }]}>
                  {t === 'facts' ? (wide ? 'Facts & lineup' : 'Facts') : t === 'commentary' ? 'Comms' : t === 'lineup' ? 'Lineup' : t === 'map' ? 'Map' : 'Stats'}
                </Text>
                <View style={[styles.tabUnderline, tab === t && { backgroundColor: accent }]} />
              </Pressable>
            ))}
          </View>
        </View>

        <View style={styles.body}>
        {loading && (
          <View style={styles.loadingBlock}>
            <Loader color={accent} />
            <Text style={styles.loadingText}>Crunching the numbers…</Text>
          </View>
        )}
        {!loading && !detail && <Text style={styles.noData}>No detailed stats available for this match.</Text>}

        {detail && lineups && tab === 'facts' && !paired && (
          <FactsTab
            r={r} detail={detail} accent={accent} motm={motm} context={context} onOpenMatch={openRelated} kicks={kicks}
          />
        )}
        {/* Expanded (10-ADAPT §2.2): Facts and Lineup side by side. */}
        {detail && lineups && paired && (
          <View style={styles.paired}>
            <View style={styles.pairedCol}>
              <FactsTab r={r} detail={detail} accent={accent} motm={motm} context={context} onOpenMatch={openRelated} kicks={kicks} />
            </View>
            <View style={styles.pairedCol}>{lineupBody}</View>
          </View>
        )}

        {detail && lineups && tab === 'lineup' && !paired && lineupBody}

        {detail && tab === 'map' && <MapTab detail={detail} seed={effectiveSeed(r)} homeName={r.homeName} awayName={r.awayName} />}

        {detail && tab === 'commentary' && <CommentaryTab detail={detail} homeName={r.homeName} awayName={r.awayName} homeClubId={r.homeClubId} awayClubId={r.awayClubId} status={status} kicks={kicks} seed={effectiveSeed(r)} />}

        {detail && tab === 'stats' && <StatsTab detail={detail} accent={accent} homeName={r.homeName} awayName={r.awayName} onOpenPlayer={r.linkPages ? openPlayer : undefined} />}
        </View>
      </Animated.ScrollView>
    </View>
    </TeamColoursContext.Provider>
    </WebColumn>
  )
}

// ── Map (P4-H) ───────────────────────────────────────────────────────────────
// Where the match happened: every shot where it was taken (sized by its xG),
// each player's average position, and — tap a player — their heat map. Drawn
// from the match's own seed on a separate stream (src/engine/match-geometry.ts),
// so it can never disagree with the numbers elsewhere on the sheet.
function MapTab({ detail, seed, homeName, awayName }: { detail: MatchStats; seed: number; homeName: string; awayName: string }) {
  const kit = ROLES.nylon
  const [side, setSide] = useState<'home' | 'away'>('home')
  // P8-47: in time order, each with its minute and where it ended.
  const shots = useMemo(() => timedShots(detail, seed), [detail, seed])
  const spots = useMemo(() => averagePositions(detail, seed), [detail, seed])
  const isHome = side === 'home'
  const sideSpots = spots.filter(s => s.isHome === isHome)
  const [picked, setPicked] = useState<string | null>(null)
  const chosen = picked && sideSpots.some(s => s.playerId === picked) ? picked : sideSpots[0]?.playerId ?? null
  const chosenLine = detail.players.find(p => p.playerId === chosen)
  return (
    <View style={{ gap: spacing.lg }}>
      <Chips<'home' | 'away'> roles={kit} value={side} onChange={setSide}
        options={[{ id: 'home', label: homeName }, { id: 'away', label: awayName }]} />
      <View style={{ gap: spacing.sm }}>
        <SectionTag roles={kit}>Shot map</SectionTag>
        <ShotMap key={side} shots={shots.filter(s => s.isHome === isHome)} />
      </View>
      <View style={{ gap: spacing.sm }}>
        <SectionTag roles={kit}>Average positions</SectionTag>
        {sideSpots.length > 0
          ? <AveragePositions spots={sideSpots} selected={chosen} onPlayer={setPicked} />
          : <KitText t="body" color={kit.textMuted}>No formation recorded for this side.</KitText>}
      </View>
      {chosenLine && (
        <View style={{ gap: spacing.sm }}>
          <SectionTag roles={kit}>Heat map</SectionTag>
          <HeatMap name={chosenLine.name} grid={heatMap(chosenLine, spots.find(s => s.playerId === chosen), seed)} />
        </View>
      )}
    </View>
  )
}

// ── Commentary (P4-H) ────────────────────────────────────────────────────────
// The match told as a broadcast would: every stored event as a line (built from
// its own fields by src/engine/commentary.ts, so it reads the same live in the
// Deep Match and here afterwards), with kick-off, half-time and full-time
// marking the breaks. Newest first, the way a live feed reads.
function CommentaryTab({ detail, homeName, awayName, homeClubId, awayClubId, status, kicks, seed }: {
  detail: MatchStats; homeName: string; awayName: string; homeClubId: string; awayClubId: string; status: string; kicks: Kicks | null; seed: number
}) {
  // P8-33: the chances between the events, each on its own minute, told in the
  // same feed. An event on the same minute reads first.
  const chances = chanceLines(detail, seed, homeName, awayName)
  let ci = 0
  // `minute` is a sort key: a stoppage event at 45+2 is 45.02, so the added-
  // time board (45.001) is said before it and a chance at 45 before that.
  const chancesUpTo = (minute: number, rows: FeedRowData[]) => {
    while (ci < chances.length && chances[ci].minute < minute) { rows.push(chances[ci].line); ci++ }
  }
  const events = [...detail.events].sort((a, b) => (a.minute + (a.plus ?? 0) / 100) - (b.minute + (b.plus ?? 0) / 100))
  const scoreAt = (minute: number) => events
    .filter(e => e.type === 'goal' && e.minute <= minute)
    .reduce((acc, e) => (e.isHome ? { ...acc, h: acc.h + 1 } : { ...acc, a: acc.a + 1 }), { h: 0, a: 0 })
  type Row = FeedRowData
  const rows: Row[] = [{ minute: "1'", text: `Kick-off. ${homeName} v ${awayName}.`, big: false, marker: true }]
  let halfDone = false, ninetyDone = false
  for (const e of events) {
    // Up to the next marker that's due (half-time, then the 90'), never past it.
    chancesUpTo(Math.min(e.minute, !halfDone ? 46 : !ninetyDone ? 91 : 999), rows)
    if (!halfDone && e.minute > 45) {
      const ht = scoreAt(45); halfDone = true
      rows.push({ minute: 'HT', text: `Half-time. ${homeName} ${ht.h}–${ht.a} ${awayName}.`, big: false, marker: true })
    }
    if (!ninetyDone && e.minute > 90) {
      const ft = scoreAt(90); ninetyDone = true
      rows.push({ minute: "90'", text: `Level after 90 minutes at ${ft.h}–${ft.a}. Extra time.`, big: false, marker: true })
    }
    chancesUpTo(e.minute + (e.plus ?? 0) / 100, rows)
    rows.push(lineForEvent(e, homeName, awayName))
  }
  if (!halfDone) {
    chancesUpTo(46, rows)
    const ht = scoreAt(45)
    rows.push({ minute: 'HT', text: `Half-time. ${homeName} ${ht.h}–${ht.a} ${awayName}.`, big: false, marker: true })
  }
  chancesUpTo(999, rows)
  const end = scoreAt(999)
  rows.push({
    minute: status,
    text: status === 'PENS' ? `Still level at ${end.h}–${end.a}. Penalties decide it.` : `Full time. ${homeName} ${end.h}–${end.a} ${awayName}.`,
    big: true, marker: true,
  })
  // The shootout, back and forth, each kick with its taker and the running score.
  if (status === 'PENS' && kicks) {
    for (const k of shootoutOrder(kicks)) {
      const team = k.home ? homeName : awayName
      rows.push({
        minute: 'PEN',
        text: k.kick.scored
          ? `${k.kick.playerName} (${team}) scores. ${k.score.h}–${k.score.a}.`
          : `${k.kick.playerName} (${team}) misses! Still ${k.score.h}–${k.score.a}.`,
        big: k.last,
      })
    }
    const s2 = shootoutOrder(kicks).at(-1)?.score
    if (s2) rows.push({ minute: 'END', text: `${s2.h > s2.a ? homeName : awayName} win the shoot-out ${Math.max(s2.h, s2.a)}–${Math.min(s2.h, s2.a)}.`, big: true, marker: true })
  }
  return (
    <Section title="Commentary">
      {rows.reverse().map((row, i) => (
        <FeedRow key={i} row={row} homeName={homeName} awayName={awayName} homeClubId={homeClubId} awayClubId={awayClubId} />
      ))}
    </Section>
  )
}

// ── The shootout (P8-81) ────────────────────────────────────────────────────
type Kicks = { home: PenKick[]; away: PenKick[] }

/** The kicks in the order they were taken (home first, then alternating), each
 *  with the score after it and whether it was the one that decided it. */
function shootoutOrder(k: Kicks): { home: boolean; kick: PenKick; score: { h: number; a: number }; last: boolean }[] {
  const out: { home: boolean; kick: PenKick; score: { h: number; a: number }; last: boolean }[] = []
  let h = 0, a = 0
  for (let i = 0; i < Math.max(k.home.length, k.away.length); i++) {
    if (k.home[i]) { if (k.home[i].scored) h++; out.push({ home: true, kick: k.home[i], score: { h, a }, last: false }) }
    if (k.away[i]) { if (k.away[i].scored) a++; out.push({ home: false, kick: k.away[i], score: { h, a }, last: false }) }
  }
  if (out.length) out[out.length - 1].last = true
  return out
}

/** The shootout by round: each side's kick in that round and the score after it. */
function shootoutRounds(k: Kicks): { home?: PenKick; away?: PenKick; score: { h: number; a: number } }[] {
  const rows: { home?: PenKick; away?: PenKick; score: { h: number; a: number } }[] = []
  let h = 0, a = 0
  for (let i = 0; i < Math.max(k.home.length, k.away.length); i++) {
    if (k.home[i]?.scored) h++
    if (k.away[i]?.scored) a++
    rows.push({ home: k.home[i], away: k.away[i], score: { h, a } })
  }
  return rows
}

function PenCell({ kick, align }: { kick?: PenKick; align: 'left' | 'right' }) {
  if (!kick) return <View style={styles.penCell} />
  const mark = <EventMark kind={kick.scored ? 'penScored' : 'penMissed'} size={14} />
  const name = <Text style={[styles.penName, { textAlign: align }, !kick.scored && { color: prim.cottonMuted }]} numberOfLines={1}>{kick.playerName}</Text>
  return (
    <View style={[styles.penCell, { justifyContent: align === 'left' ? 'flex-start' : 'flex-end' }]}
      accessible accessibilityLabel={`${kick.playerName}, ${kick.scored ? 'scored' : 'missed'}`}>
      {align === 'left' ? <>{mark}{name}</> : <>{name}{mark}</>}
    </View>
  )
}

// ── Facts ───────────────────────────────────────────────────────────────────
function FactsTab({ r, detail, accent, motm, context, onOpenMatch, kicks }: {
  kicks: Kicks | null
  r: MatchDetailRequest
  detail: MatchStats
  accent: string
  motm: PlayerMatchLine | null
  context: {
    table: ContextRow[] | null
    tableLabel: string
    bracket: BracketRound[] | null
    homeForm: FormResult[]; awayForm: FormResult[]
    homeNext: ContextMatch | null; awayNext: ContextMatch | null
  } | null
  onOpenMatch: (m: ContextMatch) => void
}) {
  // P8-33: a goal VAR ruled out lives in the feed; the timeline shows it too.
  const varCalls = useMemo(() => chanceLines(detail, effectiveSeed(r), r.homeName, r.awayName)
    .flatMap(x => x.var ? [{ minute: x.minute, ...x.var }] : []), [detail, r])
  return (
    <>
      {/* Player of the match sits at the very top — who was best is the first
          thing you want, and it used to be buried under the whole stat grid. */}
      {motm && (
        <Pressable style={({ pressed }) => [styles.motmCard, pressed && { opacity: 0.8 }]} disabled={!r.linkPages} onPress={() => openPlayer(motm.playerId)} accessibilityRole={r.linkPages ? 'link' : undefined}>
          <EventMark kind="motm" size={24} />
          <View style={{ flex: 1 }}>
            <Text style={styles.motmLabel}>PLAYER OF THE MATCH</Text>
            <Text style={styles.motmName} numberOfLines={1}>
              {motm.name}
              <Text style={styles.motmTeam}>  ·  {withFlag(motm.isHome ? r.homeName : r.awayName)}</Text>
            </Text>
          </View>
          <RatingChip value={motm.rating} />
        </Pressable>
      )}

      <Section title="Momentum & key stats">
        <StatSideHeader homeName={r.homeName} awayName={r.awayName} accent={accent} />
        <MomentumGraph
          series={detail.momentum} duration={detail.duration}
          markers={momentumMarkers(detail.events)}
          homeName={r.homeName} awayName={r.awayName} title={null}
        />
        <View style={{ height: spacing.md }} />
        <StatBar label="Ball possession" home={detail.home.possession} away={detail.away.possession} accent={accent} pct />
        <StatBar label="Expected goals (xG)" home={detail.home.xg} away={detail.away.xg} accent={accent} />
        <StatBar label="Total shots" home={detail.home.shots} away={detail.away.shots} accent={accent} />
        <StatBar label="Shots on target" home={detail.home.shotsOnTarget} away={detail.away.shotsOnTarget} accent={accent} />
        <StatBar label="Touches in opp. box" home={detail.home.touchesInOppBox} away={detail.away.touchesInOppBox} accent={accent} />
        <View style={styles.teamRatings}>
          <RatingChip value={detail.homeRating} />
          <Text style={styles.teamRatingLabel}>TEAM RATING</Text>
          <RatingChip value={detail.awayRating} />
        </View>
      </Section>

      {detail.events.length > 0 && (
        <Section title="Timeline">
          <Timeline events={detail.events} addedTime={detail.addedTime} duration={detail.duration} varCalls={varCalls} />
        </Section>
      )}
      {kicks && (
        <Section title="Penalty shoot-out">
          {/* Two columns, like the score at the top: the home side's takers on
              the left, the away side's on the right, one row per round, with
              the score after that round between them (maintainer, P8-81). */}
          <View style={styles.penHead}>
            <Text style={[styles.penHeadName, { textAlign: 'left' }]} numberOfLines={1}>{withFlag(r.homeName)}</Text>
            <View style={styles.penMid} />
            <Text style={[styles.penHeadName, { textAlign: 'right' }]} numberOfLines={1}>{withFlag(r.awayName)}</Text>
          </View>
          {shootoutRounds(kicks).map((row, i) => (
            <View key={i} style={styles.penRow}>
              <PenCell kick={row.home} align="left" />
              <View style={styles.penMid}>
                <Text style={styles.penRound}>{String(i + 1)}</Text>
                <Text style={styles.penScore}>{`${row.score.h}–${row.score.a}`}</Text>
              </View>
              <PenCell kick={row.away} align="right" />
            </View>
          ))}
        </Section>
      )}

      <Section title="Top rated">
        <View style={styles.twoCol}>
          <TopRated title={r.homeName} players={topRated(detail.players, true)} />
          <TopRated title={r.awayName} players={topRated(detail.players, false)} />
        </View>
      </Section>

      {/* Always rendered when there's a timeline at all. Hiding the section when
          both sides were empty made an opening matchday look like the feature
          was missing, rather than like there was simply nothing before it. */}
      {context && (
        <Section title="Form going in">
          <Text style={styles.hint}>Most recent first · tap any result to open it</Text>
          <FormBlock name={r.homeName} form={context.homeForm} onOpenMatch={onOpenMatch} />
          <FormBlock name={r.awayName} form={context.awayForm} onOpenMatch={onOpenMatch} />
        </Section>
      )}

      {context && (
        <Section title="Next match">
          <NextMatch name={r.homeName} clubId={r.homeClubId} match={context.homeNext} accent={accent} onOpenMatch={onOpenMatch} />
          <NextMatch name={r.awayName} clubId={r.awayClubId} match={context.awayNext} accent={accent} onOpenMatch={onOpenMatch} />
        </Section>
      )}

      <Section title="At the time of this match">
        {context?.bracket ? (
          <>
            <Text style={styles.subHead}>The bracket so far</Text>
            <MiniBracket
              rounds={context.bracket} focus={[r.homeClubId, r.awayClubId]}
              accent={accent} onOpenMatch={onOpenMatch}
            />
          </>
        ) : context?.table ? (
          <>
            <Text style={styles.subHead}>{context.tableLabel}</Text>
            <MiniTable rows={context.table} highlight={[r.homeClubId, r.awayClubId]} accent={accent} />
          </>
        ) : (
          <Text style={styles.hint}>
            No standings or bracket recorded for this match.
          </Text>
        )}
      </Section>
    </>
  )
}

// ── Stats (everything not in Key stats) ─────────────────────────────────────
// §10.5 R7 — every player who featured, ranked, across the columns that
// actually say how someone played. Sortable, because "who created the most"
// and "who won the most tackles" are different questions and a fixed order
// only ever answers one of them.
type PlayerCol = {
  key: string
  label: string
  short: string
  value: (l: PlayerMatchLine) => number
  render: (l: PlayerMatchLine) => string
}

const PLAYER_COLS: PlayerCol[] = [
  { key: 'rating', label: 'Rating', short: 'Rating', value: l => l.rating, render: l => formatRating(l.rating) },
  { key: 'created', label: 'Chances created', short: 'Chances created', value: l => l.keyPasses, render: l => String(l.keyPasses) },
  // P8-43: its own column; a big chance is a different, rarer thing than a key pass.
  { key: 'bigCreated', label: 'Big chances created', short: 'Big chances', value: l => l.bigChancesCreated, render: l => String(l.bigChancesCreated) },
  { key: 'shots', label: 'Total shots', short: 'Total shots', value: l => l.shots, render: l => String(l.shots) },
  { key: 'sot', label: 'Shots on target', short: 'Shots on Target', value: l => l.shotsOnTarget, render: l => String(l.shotsOnTarget) },
  {
    key: 'pass', label: 'Pass success rate', short: 'Pass %',
    value: l => l.passAccuracy,
    render: l => `${l.passAccuracy}% (${l.accuratePasses}/${l.passes})`,
  },
  {
    key: 'dribbles', label: 'Successful dribbles', short: 'Dribbles',
    // `dribbles` is the SUCCESSFUL count; attempts are inferred from the
    // possession lost while carrying, so the ratio stays honest.
    value: l => l.dribbles,
    render: l => String(l.dribbles),
  },
  { key: 'tackles', label: 'Tackles won', short: 'Tackles won', value: l => l.tacklesWon, render: l => String(l.tacklesWon) },
  { key: 'fouls', label: 'Fouls committed', short: 'Fouls committed', value: l => l.foulsCommitted, render: l => String(l.foulsCommitted) },
  { key: 'touches', label: 'Touches', short: 'Touches', value: l => l.touches, render: l => String(l.touches) },
]

function PlayerStatsTable({ detail, accent, homeName, awayName, onOpenPlayer }: {
  onOpenPlayer?: (id: string) => void
  detail: MatchStats; accent: string; homeName: string; awayName: string
}) {
  const pair = useTeamColourPair()
  const [sort, setSort] = useState('rating')
  const col = PLAYER_COLS.find(c => c.key === sort) ?? PLAYER_COLS[0]
  // Only players who actually featured — an unused substitute has no stats to
  // rank, and a wall of zeroes buries everyone who played.
  const rows = useMemo(
    () => detail.players.filter(p => p.minutes > 0).sort((a, b) => col.value(b) - col.value(a) || b.minutes - a.minutes),
    [detail, col],
  )
  return (
    <View style={{ gap: spacing.sm }}>
      <View style={styles.sortRow}>
        {PLAYER_COLS.map(c => (
          <Pressable
            key={c.key}
            style={[styles.sortChip, sort === c.key && { backgroundColor: accent + '2E', borderColor: accent }]}
            onPress={() => setSort(c.key)}
          >
            <Text style={[styles.sortChipText, sort === c.key && { color: prim.cotton }]}>{c.short}</Text>
          </Pressable>
        ))}
      </View>
      <Text style={styles.hint}>Sorted by {col.label.toLowerCase()} · tap a column above to re-rank</Text>
      
      {rows.map(l => (
        <Pressable key={l.playerId} style={({ pressed }) => [styles.psRow, pressed && { opacity: 0.6 }]} disabled={!onOpenPlayer} onPress={() => onOpenPlayer?.(l.playerId)}>
          <View style={[styles.psSide, { backgroundColor: l.isHome ? (pair?.home ?? accent) : (pair?.away ?? prim.cottonMuted) }]} />
          <Text style={styles.psPos}>{l.position}</Text>
          <Text style={styles.psName} numberOfLines={1}>{l.name}</Text>
          <Text style={styles.psTeam} numberOfLines={1}>{l.isHome ? homeName : awayName}</Text>
          {/* Sorted by rating, the figure is the rating chip, in SofaScore's colours (P8-44). */}
          {col.key === 'rating'
            ? <RatingChip value={l.rating} />
            : <Text style={[styles.psValue, { color: accent }]} numberOfLines={1}>{col.render(l)}</Text>}
        </Pressable>
      ))}
    </View>
  )
}

function StatsTab({ detail, accent, homeName, awayName, onOpenPlayer }: {
  detail: MatchStats; accent: string; homeName: string; awayName: string; onOpenPlayer?: (id: string) => void
}) {
  return (
    <>
      <Section title="Shots">
        <StatSideHeader homeName={homeName} awayName={awayName} accent={accent} />
        <StatBar label="Shots inside box" home={detail.home.shotsInsideBox} away={detail.away.shotsInsideBox} accent={accent} />
        <StatBar label="Shots outside box" home={detail.home.shotsOutsideBox} away={detail.away.shotsOutsideBox} accent={accent} />
        <StatBar label="Shots off target" home={detail.home.shotsOffTarget} away={detail.away.shotsOffTarget} accent={accent} />
        <StatBar label="Blocked shots" home={detail.home.shotsBlocked} away={detail.away.shotsBlocked} accent={accent} />
        <StatBar label="Hit woodwork" home={detail.home.shotsWoodwork} away={detail.away.shotsWoodwork} accent={accent} />
        <StatBar label="Big chances" home={detail.home.bigChances} away={detail.away.bigChances} accent={accent} />
        <StatBar label="Big chances missed" home={detail.home.bigChancesMissed} away={detail.away.bigChancesMissed} accent={accent} />
        <StatBar label="xG open play" home={detail.home.xgOpenPlay} away={detail.away.xgOpenPlay} accent={accent} />
        <StatBar label="xG set piece" home={detail.home.xgSetPiece} away={detail.away.xgSetPiece} accent={accent} />
      </Section>

      <Section title="Passes">
        <StatSideHeader homeName={homeName} awayName={awayName} accent={accent} />
        <StatBar label="Total passes" home={detail.home.passes} away={detail.away.passes} accent={accent} />
        <StatBar label="Accurate passes" home={detail.home.accuratePasses} away={detail.away.accuratePasses} accent={accent} />
        <StatBar label="Pass accuracy" home={detail.home.passAccuracy} away={detail.away.passAccuracy} accent={accent} pct />
        <StatBar label="Own-half passes" home={detail.home.ownHalfPasses} away={detail.away.ownHalfPasses} accent={accent} />
        <StatBar label="Opposition-half passes" home={detail.home.oppHalfPasses} away={detail.away.oppHalfPasses} accent={accent} />
        <StatBar label="Accurate long balls" home={detail.home.accurateLongBalls} away={detail.away.accurateLongBalls} accent={accent} />
        <StatBar label="Accurate crosses" home={detail.home.accurateCrosses} away={detail.away.accurateCrosses} accent={accent} />
        <StatBar label="Throw-ins" home={detail.home.throwIns} away={detail.away.throwIns} accent={accent} />
        <StatBar label="Final-third entries" home={detail.home.finalThirdEntries} away={detail.away.finalThirdEntries} accent={accent} />
        <StatBar label="Corners" home={detail.home.corners} away={detail.away.corners} accent={accent} />
      </Section>

      <Section title="Defence & duels">
        <StatSideHeader homeName={homeName} awayName={awayName} accent={accent} />
        <StatBar label="Tackles won" home={detail.home.tacklesWon} away={detail.away.tacklesWon} accent={accent} />
        <StatBar label="Interceptions" home={detail.home.interceptions} away={detail.away.interceptions} accent={accent} />
        <StatBar label="Blocks" home={detail.home.blocks} away={detail.away.blocks} accent={accent} />
        <StatBar label="Clearances" home={detail.home.clearances} away={detail.away.clearances} accent={accent} />
        <StatBar label="Keeper saves" home={detail.home.keeperSaves} away={detail.away.keeperSaves} accent={accent} />
        <StatBar label="Ground duels won" home={detail.home.groundDuelsWon} away={detail.away.groundDuelsWon} accent={accent} />
        <StatBar label="Aerial duels won" home={detail.home.aerialDuelsWon} away={detail.away.aerialDuelsWon} accent={accent} />
        <StatBar label="Successful dribbles" home={detail.home.dribbles} away={detail.away.dribbles} accent={accent} />
        <StatBar label="Possession lost" home={detail.home.possessionLost} away={detail.away.possessionLost} accent={accent} />
      </Section>

      <Section title="Discipline">
        <StatSideHeader homeName={homeName} awayName={awayName} accent={accent} />
        <StatBar label="Fouls" home={detail.home.fouls} away={detail.away.fouls} accent={accent} />
        <StatBar label="Yellow cards" home={detail.home.yellowCards} away={detail.away.yellowCards} accent={accent} />
        <StatBar label="Red cards" home={detail.home.redCards} away={detail.away.redCards} accent={accent} />
        <StatBar label="Offsides" home={detail.home.offsides} away={detail.away.offsides} accent={accent} />
      </Section>

      <Section title="Player stats">
        <PlayerStatsTable detail={detail} accent={accent} homeName={homeName} awayName={awayName} onOpenPlayer={onOpenPlayer} />
      </Section>
    </>
  )
}

// ── Small pieces ────────────────────────────────────────────────────────────

// National teams get their flag; clubs just show the name (we own no crests).
function withFlag(name: string) {
  const f = flagForCountry(name)
  return f ? `${f} ${name}` : name
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {children}
    </View>
  )
}

function RatingChip({ value }: { value: number }) {
  return (
    <RatingSquare value={value} />
  )
}

function TopRated({ title, players }: { title: string; players: PlayerMatchLine[] }) {
  return (
    <View style={{ flex: 1, gap: 4 }}>
      <Text style={styles.subHeadSmall} numberOfLines={1}>{withFlag(title)}</Text>
      {players.map(p => (
        <View key={p.playerId} style={styles.topRatedItem}>
          <Text style={styles.topRatedName} numberOfLines={1}>{p.name}</Text>
          <RatingSquare value={p.rating} size="sm" />
        </View>
      ))}
    </View>
  )
}

function MiniTable({ rows, highlight, accent }: { rows: ContextRow[]; highlight: string[]; accent: string }) {
  return (
    <View style={styles.table}>
      <View style={styles.tableHead}>
        <Text style={styles.thPos}>#</Text>
        <Text style={styles.thClub}>Club</Text>
        <Text style={styles.thNum}>Pl</Text>
        <Text style={styles.thNum}>W</Text>
        <Text style={styles.thNum}>D</Text>
        <Text style={styles.thNum}>L</Text>
        <Text style={styles.thNum}>GD</Text>
        <Text style={[styles.thNum, styles.thPts]}>Pts</Text>
      </View>
      {rows.map((t, i) => {
        const on = highlight.includes(t.clubId)
        return (
          <View key={t.clubId} style={[styles.tableRow, on && { backgroundColor: accent + '1F' }]}>
            <Text style={[styles.tdPos, on && { color: accent, fontFamily: font.bodyBlack }]}>{i + 1}</Text>
            <Text style={[styles.tdClub, on && { color: prim.cotton, fontFamily: font.bodyBold }]} numberOfLines={1}>{t.clubName}</Text>
            <Text style={styles.tdNum}>{t.played}</Text>
            <Text style={styles.tdNum}>{t.won}</Text>
            <Text style={styles.tdNum}>{t.drawn}</Text>
            <Text style={styles.tdNum}>{t.lost}</Text>
            <Text style={styles.tdNum}>{t.goalDiff > 0 ? `+${t.goalDiff}` : t.goalDiff}</Text>
            <Text style={[styles.tdNum, styles.tdPts]}>{t.points}</Text>
          </View>
        )
      })}
    </View>
  )
}

// The knockout equivalent of MiniTable — every round played up to this match,
// most-recent round last, so it reads as the road that led here.
//
// Defaults to just the two sides' own ties: a Round of 32 has sixteen of them
// and a wall of unrelated results buries the one thing you opened this screen
// for. The rest are one tap away.
function MiniBracket({ rounds, focus, accent, onOpenMatch }: {
  rounds: BracketRound[]; focus: string[]; accent: string
  onOpenMatch: (m: ContextMatch) => void
}) {
  const [showAll, setShowAll] = useState(false)
  const involves = (t: BracketTie) => focus.includes(t.teamAId) || focus.includes(t.teamBId)
  const hidden = rounds.reduce((n, r) => n + r.ties.filter(t => !involves(t)).length, 0)

  return (
    <View style={{ gap: spacing.md }}>
      {rounds.map(round => {
        const ties = showAll ? round.ties : round.ties.filter(involves)
        if (ties.length === 0) return null
        return (
          <View key={round.label} style={{ gap: 4 }}>
            <Text style={styles.subHeadSmall}>{round.label}</Text>
            {ties.map(t => (
              <BracketTieCard key={t.key} tie={t} focus={focus} accent={accent} onOpenMatch={onOpenMatch} />
            ))}
          </View>
        )
      })}
      {hidden > 0 && (
        <Pressable
          style={({ pressed }) => [styles.bracketToggle, pressed && { opacity: 0.6 }]}
          onPress={() => setShowAll(s => !s)}
        >
          <Text style={[styles.bracketToggleText, { color: accent }]}>
            {showAll ? 'Show only these two' : `Show the full bracket (${hidden} more ${hidden === 1 ? 'tie' : 'ties'})`}
          </Text>
        </Pressable>
      )}
    </View>
  )
}

function BracketTieCard({ tie, focus, accent, onOpenMatch }: {
  tie: BracketTie; focus: string[]; accent: string
  onOpenMatch: (m: ContextMatch) => void
}) {
  const on = focus.includes(tie.teamAId) || focus.includes(tie.teamBId)
  const sideStyle = (clubId: string) => [
    styles.tieTeam,
    tie.winnerId === clubId && { color: prim.cotton, fontFamily: font.bodyBlack },
    focus.includes(clubId) && { color: accent },
  ]
  // A two-legged tie is two real matches; each leg opens its own sheet, so the
  // card as a whole isn't tappable. A single-match tie has exactly one, so the
  // card IS the button.
  const single = tie.legs.length === 1 ? tie.legs[0] : null

  // A level aggregate with a winner can only have been settled on penalties —
  // the kick counts don't travel on the timeline, but "who went through" does,
  // so say how rather than leaving a tied score with one name mysteriously bold.
  const onPens = tie.winnerId !== undefined && tie.aGoals !== undefined && tie.aGoals === tie.bGoals

  const head = (
    <View style={styles.tieHead}>
      <Text style={sideStyle(tie.teamAId)} numberOfLines={1}>{withFlag(tie.teamAName)}</Text>
      <Text style={[styles.tieScore, { color: accent }]}>
        {tie.aGoals ?? '–'} – {tie.bGoals ?? '–'}
        {onPens ? <Text style={styles.tiePens}>{'\n'}pens</Text> : null}
      </Text>
      <Text style={[...sideStyle(tie.teamBId), { textAlign: 'right' }]} numberOfLines={1}>{withFlag(tie.teamBName)}</Text>
    </View>
  )

  return (
    <View style={[styles.tieCard, on && { borderColor: accent, backgroundColor: accent + '14' }]}>
      {single ? (
        <Pressable style={({ pressed }) => [pressed && { opacity: 0.6 }]} onPress={() => onOpenMatch(single)}>
          {head}
        </Pressable>
      ) : head}
      {tie.legs.length > 1 && (
        <View style={styles.tieLegs}>
          {tie.legs.map((leg, i) => {
            // Leg 2 is played at teamB's ground, so its raw home/away is the
            // other way round. Both legs are printed in the TIE's orientation
            // — otherwise "2–1, 1–1" wouldn't add up to the aggregate above it.
            const aIsHome = leg.homeClubId === tie.teamAId
            return (
              <Pressable
                key={i}
                style={({ pressed }) => [styles.tieLeg, pressed && { opacity: 0.6 }]}
                onPress={() => onOpenMatch(leg)}
              >
                <Text style={styles.tieLegText} numberOfLines={1}>
                  Leg {i + 1} · {aIsHome ? leg.homeGoals : leg.awayGoals}–{aIsHome ? leg.awayGoals : leg.homeGoals}
                </Text>
                <Text style={styles.formChevron}>›</Text>
              </Pressable>
            )
          })}
        </View>
      )}
    </View>
  )
}

function FormBlock({ name, form, onOpenMatch }: {
  name: string; form: FormResult[]; onOpenMatch: (m: ContextMatch) => void
}) {
  return (
    <View style={styles.formBlock}>
      <Text style={styles.formTeam} numberOfLines={1}>{withFlag(name)}</Text>
      {form.length === 0
        ? <Text style={styles.hint}>First match of the campaign.</Text>
        : form.map(f => (
          <Pressable
            key={f.matchday}
            style={({ pressed }) => [styles.formItem, pressed && { opacity: 0.6 }]}
            onPress={() => onOpenMatch(f.match)}
          >
            <View style={[styles.formPill, { backgroundColor: outcomeColor(f.outcome) + '26', borderColor: outcomeColor(f.outcome) }]}>
              <Text style={[styles.formPillText, { color: outcomeColor(f.outcome) }]}>{f.outcome}</Text>
            </View>
            <Text style={styles.formText} numberOfLines={1}>
              {f.goalsFor}-{f.goalsAgainst} {f.isHome ? 'vs' : '@'} {f.opponentName}
            </Text>
            <Text style={styles.formChevron}>›</Text>
          </Pressable>
        ))}
    </View>
  )
}

// What this side plays next. No later fixture at all means they're done —
// which in a cup is exactly the "eliminated" case, so say so.
function NextMatch({ name, clubId, match, accent, onOpenMatch }: {
  name: string; clubId: string; match: ContextMatch | null; accent: string
  onOpenMatch: (m: ContextMatch) => void
}) {
  const played = match && match.homeGoals !== undefined
  return (
    <View style={styles.formBlock}>
      <Text style={styles.formTeam} numberOfLines={1}>{withFlag(name)}</Text>
      {!match ? (
        <Text style={styles.hint}>No further fixtures — their campaign ended here.</Text>
      ) : (
        <Pressable
          style={({ pressed }) => [styles.nextRow, pressed && played ? { opacity: 0.6 } : null]}
          disabled={!played}
          onPress={() => onOpenMatch(match)}
        >
          <View style={{ flex: 1 }}>
            {match.label ? <Text style={styles.nextLabel} numberOfLines={1}>{match.label}</Text> : null}
            <Text style={styles.nextTeams} numberOfLines={1}>
              {match.homeClubId === clubId ? 'vs ' : '@ '}
              <Text style={{ color: prim.cotton, fontFamily: font.bodyBold }}>
                {match.homeClubId === clubId ? match.awayClubName : match.homeClubName}
              </Text>
            </Text>
          </View>
          {played
            ? <Text style={[styles.nextScore, { color: accent }]}>{match.homeGoals} – {match.awayGoals}</Text>
            : <Text style={styles.nextPending}>To play</Text>}
          {played && <Text style={styles.formChevron}>›</Text>}
        </Pressable>
      )}
    </View>
  )
}

// Kit Drop's result colours (P8-74): volt a win, misery red a loss, grey a draw.
const outcomeColor = (o: 'W' | 'D' | 'L') =>
  o === 'W' ? prim.volt : o === 'L' ? prim.misery : ROLES.nylon.draw

// A World Cup match and a final are on neutral ground: no home or away to mark.
const isNeutral = (label?: string) => !!label && (/^Final\b/.test(label) || /Group [A-L]|Round of 32|World Cup/.test(label))

const styles = StyleSheet.create({
  venueLine: { alignItems: 'center', marginTop: 4 },
  penHead: { flexDirection: 'row', alignItems: 'center', paddingBottom: spacing.xs },
  penHeadName: { flex: 1, fontSize: 11, color: prim.cottonMuted, fontFamily: font.tagBold, textTransform: 'uppercase' },
  penRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 6, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: prim.ruleNylon },
  penCell: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: spacing.xs, minWidth: 0 },
  penMid: { width: 56, alignItems: 'center' },
  penRound: { fontSize: 9, color: prim.cottonMuted, fontFamily: font.tag },
  penMark: { fontSize: 10, fontFamily: font.tagBold },
  penName: { flexShrink: 1, fontSize: typography.sm, color: prim.cotton, fontFamily: font.bodyBold },
  penScore: { fontSize: typography.sm, color: prim.cotton, fontFamily: font.bodyBlack },
  paired: { flexDirection: 'row', gap: spacing.xl, alignItems: 'flex-start' },
  pairedCol: { flex: 1, minWidth: 0 },
  container: { flex: 1, backgroundColor: prim.nylon },
  centred: { alignItems: 'center', justifyContent: 'center', gap: spacing.md },
  backLink: { padding: spacing.md },
  backLinkText: { fontSize: typography.md, fontFamily: font.bodyBold },

  topBar: {
    flexDirection: 'row', alignItems: 'center',
    paddingTop: 52, paddingBottom: spacing.sm, paddingHorizontal: spacing.md,
    backgroundColor: prim.nylonRaised,
  },
  backBtn: { width: 26, alignItems: 'flex-start' },
  topBarScore: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  topBarTeam: { flex: 1, fontSize: typography.xs, color: prim.cottonMuted, fontFamily: font.bodyBold },
  topBarNums: { fontSize: 22, lineHeight: 24, fontFamily: font.super },
  topBarStatus: { fontSize: 9, color: prim.cottonMuted, fontFamily: font.bodyBlack, letterSpacing: 0.5 },

  headerCollapse: { backgroundColor: prim.nylonRaised, paddingHorizontal: spacing.lg, paddingBottom: spacing.md, gap: 4 },
  compLabel: { fontSize: typography.xs, color: prim.cottonMuted, textAlign: 'center', textTransform: 'uppercase', letterSpacing: 1, fontFamily: font.bodyBold },
  headerRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  headerTeam: { flex: 1, fontSize: typography.md, fontFamily: font.bodyBold, color: prim.cotton },
  // flexShrink 0: at 48px the score is wider than 92, and a shrinking column wrapped
  // "2 – 1" so one side's goals were clipped off (seen from the run hub).
  headerScoreCol: { alignItems: 'center', minWidth: 92, flexShrink: 0, paddingHorizontal: 8 },
  headerScore: { fontSize: 48, lineHeight: 48, fontFamily: font.super },
  headerStatus: { fontSize: 9, color: prim.cottonMuted, textTransform: 'uppercase', letterSpacing: 0.8, fontFamily: font.bodyBold },
  legSwitch: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  legArrow: { width: 28, height: 36, alignItems: 'center', justifyContent: 'center' },
  // Over the bar's content row (below its 52px status-bar padding), centred.
  legLabel: { position: 'absolute', left: 0, right: 0, top: 52, bottom: spacing.sm, alignItems: 'center', justifyContent: 'center' },
  pensNote: { fontSize: typography.xs, fontFamily: font.bodyBold, textAlign: 'center' },
  scorerRow: { flexDirection: 'row', gap: spacing.md, marginTop: 2 },
  scorerLine: { fontSize: 10, color: prim.cottonMuted },
  scorerMark: { color: prim.cottonMuted, fontFamily: font.bodyBold },

  // The sticky tab bar scrolls over content, so it must be fully opaque.
  tabBar: { backgroundColor: prim.nylonRaised, borderBottomWidth: 1, borderBottomColor: prim.ruleNylon },
  tabRow: { flexDirection: 'row' },
  tabBtn: { flex: 1, alignItems: 'center', paddingTop: spacing.sm, gap: spacing.sm },
  tabText: { fontSize: typography.sm, fontFamily: font.bodyBold, color: prim.cottonMuted },
  tabUnderline: { height: 3, width: '55%', borderRadius: 2, backgroundColor: 'transparent' },

  body: { padding: spacing.md, paddingBottom: spacing.xl * 2, gap: spacing.md },

  loadingBlock: { paddingVertical: spacing.xl, alignItems: 'center' },
  loadingText: { fontSize: typography.xs, color: prim.cottonMuted, marginTop: spacing.sm },
  noData: { fontSize: typography.sm, color: prim.cottonMuted, textAlign: 'center', paddingVertical: spacing.xl },

  section: { backgroundColor: prim.nylonRaised, borderRadius: 0, borderWidth: 1, borderColor: prim.ruleNylon, padding: spacing.lg },
  sectionTitle: { fontSize: typography.sm, fontFamily: font.bodyBlack, color: prim.cotton, marginBottom: spacing.md, textTransform: 'uppercase', letterSpacing: 1 },
  subHead: { fontSize: typography.xs, fontFamily: font.bodyBlack, color: prim.cottonMuted, marginBottom: spacing.sm, textTransform: 'uppercase', letterSpacing: 0.6 },
  subHeadSmall: { fontSize: 10, fontFamily: font.bodyBlack, color: prim.cottonMuted, textTransform: 'uppercase', letterSpacing: 0.5 },
  hint: { fontSize: 10, color: prim.cottonMuted, },
  twoCol: { flexDirection: 'row', gap: spacing.lg },

  motmCard: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.sm,
    backgroundColor: prim.nylonRaised, borderRadius: 0, borderWidth: 1, borderColor: prim.ruleNylon,
    padding: spacing.lg,
  },
  motmStar: { fontSize: 20, color: colors.warning },
  motmLabel: { fontSize: 9, color: prim.cottonMuted, fontFamily: font.bodyBlack, letterSpacing: 1 },
  motmName: { fontSize: typography.md, fontFamily: font.bodyBold, color: prim.cotton },
  motmTeam: { fontSize: typography.xs, color: prim.cottonMuted, fontFamily: font.body },

  teamRatings: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.md, marginTop: spacing.md },
  teamRatingLabel: { fontSize: 9, color: prim.cottonMuted, fontFamily: font.bodyBold, letterSpacing: 1 },

  lineupTeam: { fontSize: typography.sm, fontFamily: font.bodyBlack, marginBottom: 4 },
  benchLabel: { fontSize: 9, color: prim.cottonMuted, fontFamily: font.bodyBold, textTransform: 'uppercase', letterSpacing: 1, marginTop: spacing.sm },

  topRatedItem: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, justifyContent: 'space-between' },
  topRatedName: { fontSize: 11, color: prim.cottonMuted, flexShrink: 1 },

  table: { borderRadius: 0, overflow: 'hidden', borderWidth: 1, borderColor: prim.ruleNylon },
  tableHead: { flexDirection: 'row', alignItems: 'center', backgroundColor: prim.nylonSunken, paddingVertical: 5, paddingHorizontal: spacing.sm, gap: 4 },
  tableRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 5, paddingHorizontal: spacing.sm, gap: 4, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: prim.ruleNylon },
  thPos: { width: 18, fontSize: 9, color: prim.cottonMuted, fontFamily: font.bodyBold },
  thClub: { flexGrow: 1, flexShrink: 1, flexBasis: 'auto', fontSize: 9, color: prim.cottonMuted, fontFamily: font.bodyBold },
  thNum: { width: 22, fontSize: 9, color: prim.cottonMuted, fontFamily: font.bodyBold, textAlign: 'center' },
  thPts: { width: 26 },
  tdPos: { width: 18, fontSize: 10, color: prim.cottonMuted },
  tdClub: { flexGrow: 1, flexShrink: 1, flexBasis: 'auto', fontSize: 10, color: prim.cottonMuted },
  tdNum: { width: 22, fontSize: 10, color: prim.cottonMuted, textAlign: 'center' },
  tdPts: { width: 26, fontFamily: font.bodyBlack, color: prim.cotton },

  tieCard: { backgroundColor: prim.nylonSunken, borderRadius: 0, borderWidth: 1, borderColor: prim.ruleNylon, paddingVertical: 6, paddingHorizontal: spacing.sm },
  tieHead: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  tieTeam: { flex: 1, fontSize: 11, color: prim.cottonMuted },
  tieScore: { fontSize: typography.xs, fontFamily: font.bodyBlack, minWidth: 44, textAlign: 'center' },
  tiePens: { fontSize: 8, color: prim.cottonMuted, fontFamily: font.bodyBold, textTransform: 'uppercase', letterSpacing: 0.5 },
  tieLegs: { marginTop: 4, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: prim.ruleNylon, paddingTop: 2 },
  tieLeg: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingVertical: 2 },
  tieLegText: { flex: 1, fontSize: 10, color: prim.cottonMuted },
  bracketToggle: { alignSelf: 'flex-start', paddingVertical: 4 },
  bracketToggleText: { fontSize: 10, fontFamily: font.bodyBlack, textTransform: 'uppercase', letterSpacing: 0.5 },

  formBlock: { marginTop: spacing.sm, gap: 4 },
  formTeam: { fontSize: 10, fontFamily: font.bodyBlack, color: prim.cottonMuted, textTransform: 'uppercase', letterSpacing: 0.5 },
  formItem: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingVertical: 2 },
  formPill: { width: 20, alignItems: 'center', borderRadius: 0, borderWidth: 1, paddingVertical: 1 },
  formPillText: { fontSize: 9, fontFamily: font.bodyBlack },
  formText: { fontSize: 10, color: prim.cottonMuted, flex: 1 },
  formChevron: { fontSize: typography.md, color: prim.cottonMuted, fontFamily: font.bodyBold },

  nextRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, backgroundColor: prim.nylonSunken, borderRadius: 0, padding: spacing.sm },
  nextLabel: { fontSize: 9, color: prim.cottonMuted, textTransform: 'uppercase', letterSpacing: 0.5, fontFamily: font.bodyBold },
  nextTeams: { fontSize: typography.xs, color: prim.cottonMuted },
  nextScore: { fontSize: typography.sm, fontFamily: font.bodyBlack },
  nextPending: { fontSize: 9, color: prim.cottonMuted, fontFamily: font.bodyBold, textTransform: 'uppercase', letterSpacing: 0.5 },

  sortRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 4 },
  sortChip: {
    paddingHorizontal: spacing.sm, paddingVertical: 3, borderRadius: 0,
    borderWidth: 1, borderColor: prim.ruleNylon, backgroundColor: prim.nylonSunken,
  },
  sortChipText: { fontSize: 9, fontFamily: font.bodyBlack, color: prim.cottonMuted },
  linked: { textDecorationLine: 'underline' },
  seasonLink: { alignSelf: 'flex-start', paddingVertical: spacing.xs, paddingHorizontal: spacing.sm, marginBottom: spacing.xs },
  seasonLinkText: { fontSize: typography.sm, fontFamily: font.bodyBold },
  psRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingVertical: 4, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: prim.ruleNylon },
  // A colour bar rather than colour alone — which side a player is on stays
  // legible without relying on hue.
  psSide: { width: 3, height: 16, borderRadius: 2 },
  psPos: { width: 28, fontSize: 9, fontFamily: font.bodyBlack, color: prim.cottonMuted },
  psName: { flexGrow: 1, flexShrink: 1, flexBasis: 'auto', fontSize: 11, color: prim.cotton },
  psTeam: { width: 72, fontSize: 9, color: prim.cottonMuted, textAlign: 'right' },
  psValue: { minWidth: 92, fontSize: 11, fontFamily: font.bodyBlack, textAlign: 'right' },
})
