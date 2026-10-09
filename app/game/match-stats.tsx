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

import { countryName } from '@/data/countries-sk'
import { log } from '@/diag/log'
import { t } from '@/i18n'
import { label } from '@/i18n/labels'
import { venueFor } from '@/data/venues'
import { kickoffFor } from '@/engine/schedule'
import { Loader } from '@/components/kit'
import { TeamColoursContext, useTeamColours, useTeamColourPair } from '@/lib/teamColours'
import React, { useEffect, useMemo, useRef, useState } from 'react'
import { nameShootout } from '@/engine/run-stats'
import type { PenKick } from '@/engine/knockout-match'
import { useSizeClass } from '@/hooks/useSizeClass'
import { WebColumn } from '@/components/kit'
import { View, StyleSheet, Pressable, Animated } from 'react-native'
// P8-123: text on the kit's families and scale until this screen is rebuilt on KitText.
import { ScaleText as Text } from '@/components/kit'
import { openPlayer, openClub } from '@/lib/runNav'
import { router } from 'expo-router'
import { Ionicons } from '@expo/vector-icons'
// C-18: the kit's scales (space, type) and colours (prim), not the old theme's.
import { space, type, prim, font } from '@/theme'
import { openMatchStats, takeMatchStatsRequest } from '@/lib/matchStats'
import { matchRequest } from '@/engine/stages'
import {
  useMatchDetail, StatBar, PlayerRow, Timeline, FeedRow, type FeedRowData, splitLineup, ScorerList, StatSideHeader, MarkedName, effectiveSeed,
  type MatchDetailRequest,
} from '@/components/MatchStatsParts'
import { averagePositions, heatMap } from '@/engine/match-geometry'
import { ShotMap, AveragePositions, HeatMap } from '@/components/match/PitchViews'
import { formatRating } from '@/theme'
import { ROLES } from '@/theme'
import { KitText, Chips, SectionTag, RatingSquare, EventMark, VenueMark, Tag } from '@/components/kit'
import { MomentumGraph, momentumMarkers } from '@/components/MomentumGraph'
import { MatchLineupPitch, MatchBench } from '@/components/MatchLineupPitch'
import {
  standingsAsOf, formBefore, topRated, nextMatchFor, knockoutBracket,
  type ContextMatch, type ContextRow, type FormResult,
  type BracketRound, type BracketTie,
} from '@/engine/match-context'
import type { PlayerMatchLine, MatchStats } from '@/types/match-stats'
import { lineForEvent, chanceLines, timedShots } from '@/engine/commentary'
import { FLOODLIT } from '@/lib/appearance'

type Tab = 'facts' | 'commentary' | 'lineup' | 'map' | 'stats'

// Scroll distance over which the compact score fades into the top bar — timed
// so it has arrived by the time the tall header has scrolled out of sight.
const HEADER_FADE_START = 40
const HEADER_FADE_END = 110

// A timeline match as a sheet request, carrying the page's shared context
// (squad, season, links) and the match's own shootout (P8-103: this used to
// drop it, so a second leg opened from the tie card showed no penalties).
// The fields come from `matchRequest`, the one builder every screen uses.
const requestFromContext = (r: MatchDetailRequest, m: ContextMatch) => matchRequest(m, {
  yearStart: r.yearStart, playerClubId: r.playerClubId, drafted: r.drafted,
  playerFormation: r.playerFormation, linkPages: r.linkPages, timeline: r.contextMatches,
})

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
      .catch(e => log.warn('db', 'match-stats: shootout names failed', e))
    return () => { alive = false }
  }, [request])

  // P4-H — on nylon the sheet reads in cotton; a competition's colour is
  // location, never meaning, so it doesn't tint numbers here.
  const accent = prim.cotton
  // P8.5-28: the venue below reads the English name; everything shown reads
  // a national side's name in the app's language.
  const r = useMemo(() => request && { ...request, homeName: countryName(request.homeName), awayName: countryName(request.awayName) }, [request])
  // P8-92: when it was played; the same kick-off every view works out.
  const kickoff = r ? kickoffFor({ label: r.competitionLabel, yearStart: r.yearStart, seed: r.seed, homeClubId: r.homeClubId, awayClubId: r.awayClubId }) : null
  // P8-93: and where — the home side's ground, a final's venue, a World Cup stadium.
  const venue = r ? venueFor({ label: r.competitionLabel, yearStart: r.yearStart, homeName: request!.homeName, homeClubId: r.homeClubId, awayClubId: r.awayClubId }) : null
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
      tableLabel: isLeagueRound ? t('match.afterMd', { md: r.matchday }) : t('match.lpFinal'),
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
    openMatchStats(req)
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
        <Text style={styles.noData}>{t('match.lost')}</Text>
        <Pressable style={styles.backLink} accessibilityRole="button" onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))}>
          <Text style={[styles.backLinkText, { color: accent }]}>{router.canGoBack() ? t('match.goBack') : t('match.goHome')}</Text>
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
                    <Text style={styles.benchLabel}>{t('match.bench')}</Text>
                    <MatchBench
                      players={[...lineups[side].cameOn, ...lineups[side].unused]}
                      accent={accent}
                      onPressPlayer={l => focusPlayer(l.playerId)}
                    />
                  </>
                ) : (
                  <Text style={styles.hint}>{t('match.noShape')}</Text>
                )}
              </Section>
            ))}

          <Section title={t('match.lineupsRatings')}>
            <Text style={styles.hint}>{t('match.lineupsHint')}</Text>
            {([['home', r.homeName, r.homeClubId], ['away', r.awayName, r.awayClubId]] as const).map(([side, name, clubId]) => {
              const lu = lineups[side]
              return (
                <View key={side} style={{ marginTop: space[4] }}>
                  <MarkedName clubId={clubId} name={name} style={[styles.lineupTeam, { color: accent }]} />
                  {lu.starters.map(l => (
                    <View key={l.playerId} ref={rowRef(l.playerId)} collapsable={false}>
                    <PlayerRow l={l} accent={accent}
                      expanded={expandedId === l.playerId}
                      onPress={() => setExpandedId(id => id === l.playerId ? null : l.playerId)} />
                    {r.linkPages && expandedId === l.playerId && (
                      <Pressable onPress={() => openPlayer(l.playerId)} accessibilityRole="link" style={({ pressed }) => [styles.seasonLink, pressed && { opacity: 0.6 }]}>
                        <Text style={[styles.seasonLinkText, { color: accent }]}>{t('match.wholeSeason')}</Text>
                      </Pressable>
                    )}
                    </View>
                  ))}
                  {lu.cameOn.length > 0 && <Text style={styles.benchLabel}>{t('match.cameOn')}</Text>}
                  {lu.cameOn.map(l => (
                    <View key={l.playerId} ref={rowRef(l.playerId)} collapsable={false}>
                    <PlayerRow l={l} accent={accent}
                      expanded={expandedId === l.playerId}
                      onPress={() => setExpandedId(id => id === l.playerId ? null : l.playerId)} />
                    {r.linkPages && expandedId === l.playerId && (
                      <Pressable onPress={() => openPlayer(l.playerId)} accessibilityRole="link" style={({ pressed }) => [styles.seasonLink, pressed && { opacity: 0.6 }]}>
                        <Text style={[styles.seasonLinkText, { color: accent }]}>{t('match.wholeSeason')}</Text>
                      </Pressable>
                    )}
                    </View>
                  ))}
                  {lu.unused.length > 0 && <Text style={styles.benchLabel}>{t('match.unusedSubs')}</Text>}
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
                accessibilityRole="button" accessibilityLabel={t('match.leg', { n: 1 })} accessibilityState={{ disabled: legIdx <= 0 }}>
                <Ionicons name="chevron-back" size={18} color={legIdx <= 0 ? prim.nylonFaint : prim.cotton} />
              </Pressable>
              <KitText t="tag" color={prim.cotton}>{t('match.legOf', { n: legIdx + 1 })}</KitText>
              <Pressable style={styles.legArrow} onPress={() => switchLeg(legIdx + 1)} disabled={legIdx >= legs.length - 1} hitSlop={8}
                accessibilityRole="button" accessibilityLabel={t('match.leg', { n: 2 })} accessibilityState={{ disabled: legIdx >= legs.length - 1 }}>
                <Ionicons name="chevron-forward" size={18} color={legIdx >= legs.length - 1 ? prim.nylonFaint : prim.cotton} />
              </Pressable>
            </View>
          </Animated.View>
        )}
        <Animated.View style={[styles.topBarScore, { opacity: barOpacity }]} pointerEvents="none">
          {/* Flags stay with the names once collapsed — national sides are far
              easier to tell apart by flag than by a truncated name. */}
          <MarkedName clubId={r.homeClubId} name={r.homeName} style={styles.topBarTeam} />
          <Text style={[styles.topBarNums, { color: accent }]}>{r.homeGoals}</Text>
          <Text style={styles.topBarStatus}>{status}</Text>
          <Text style={[styles.topBarNums, { color: accent }]}>{r.awayGoals}</Text>
          <MarkedName clubId={r.awayClubId} name={r.awayName} style={styles.topBarTeam} align="right" />
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
          {r.competitionLabel ? <Text style={styles.compLabel} numberOfLines={1}>{label(r.competitionLabel)}</Text> : null}
          {/* P8-92: when it was played, the same kick-off every view works out. */}
          {kickoff ? <Text style={styles.compLabel} numberOfLines={1}>{`${kickoff.day} · ${kickoff.time}`}</Text> : null}
          {venue ? <Text style={styles.compLabel} numberOfLines={1}>{venue.city ? `${venue.name}, ${venue.city}` : venue.name}</Text> : null}
          {/* P8-134: your match, from your side: at home or away. */}
          {r.playerClubId && (r.playerClubId === r.homeClubId || r.playerClubId === r.awayClubId) && !isNeutral(r.competitionLabel) ? (
            <View style={styles.venueLine}><VenueMark roles={ROLES[FLOODLIT]} home={r.playerClubId === r.homeClubId} /></View>
          ) : null}
          <View style={styles.headerRow}>
            {/* P8-12, step 1 (A-07): each side's mark beside its name, by id:
                a club's crest, a nation's flag, or your own crest. */}
            <MarkedName clubId={r.homeClubId} name={r.homeName} size={20} numberOfLines={2} textAlign="right" style={[styles.headerTeam, r.linkPages && styles.linked]}
              onPress={r.linkPages ? () => openClub(r.homeClubId) : undefined} accessibilityRole={r.linkPages ? 'link' : undefined} />
            <View style={styles.headerScoreCol}>
              <Text style={[styles.headerScore, { color: accent }]} numberOfLines={1}>{r.homeGoals} – {r.awayGoals}</Text>
              <Text style={styles.headerStatus}>
                {status === 'FT' ? t('match.fullTime') : status === 'AET' ? t('match.afterEt') : t('match.penalties')}
              </Text>
            </View>
            <MarkedName clubId={r.awayClubId} name={r.awayName} size={20} numberOfLines={2} align="right" textAlign="left" style={[styles.headerTeam, r.linkPages && styles.linked]}
              onPress={r.linkPages ? () => openClub(r.awayClubId) : undefined} accessibilityRole={r.linkPages ? 'link' : undefined} />
          </View>
          {r.pensNote ? <Text style={[styles.pensNote, { color: accent }]}>{label(r.pensNote)}</Text> : null}
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
            {((wide ? ['facts', 'commentary', 'map', 'stats'] : ['facts', 'commentary', 'lineup', 'map', 'stats']) as Tab[]).map(tb => (
              <Pressable
                key={tb} style={styles.tabBtn} onPress={() => setTab(tb)}
                accessibilityRole="tab" accessibilityState={{ selected: tab === tb }}
              >
                <Text style={[styles.tabText, tab === tb && { color: prim.cotton }]}>
                  {tb === 'facts' ? (wide ? t('match.tabFactsLineup') : t('match.tabFacts')) : tb === 'commentary' ? t('match.tabComms') : tb === 'lineup' ? t('match.tabLineup') : tb === 'map' ? t('match.tabMap') : t('match.tabStats')}
                </Text>
                <View style={[styles.tabUnderline, tab === tb && { backgroundColor: accent }]} />
              </Pressable>
            ))}
          </View>
        </View>

        <View style={styles.body}>
        {loading && (
          <View style={styles.loadingBlock}>
            <Loader color={accent} />
            <Text style={styles.loadingText}>{t('match.crunching')}</Text>
          </View>
        )}
        {!loading && !detail && <Text style={styles.noData}>{t('match.noDetail')}</Text>}

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

        {detail && tab === 'stats' && <StatsTab detail={detail} accent={accent} homeName={r.homeName} awayName={r.awayName} homeClubId={r.homeClubId} awayClubId={r.awayClubId} onOpenPlayer={r.linkPages ? openPlayer : undefined} />}
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
  const kit = ROLES[FLOODLIT]
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
    <View style={{ gap: space[5] }}>
      <Chips<'home' | 'away'> roles={kit} value={side} onChange={setSide}
        options={[{ id: 'home', label: homeName }, { id: 'away', label: awayName }]} />
      <View style={{ gap: space[2] }}>
        <SectionTag roles={kit}>{t('match.shotMap')}</SectionTag>
        <ShotMap key={side} shots={shots.filter(s => s.isHome === isHome)} />
      </View>
      <View style={{ gap: space[2] }}>
        <SectionTag roles={kit}>{t('match.avgPositions')}</SectionTag>
        {sideSpots.length > 0
          ? <AveragePositions spots={sideSpots} selected={chosen} onPlayer={setPicked} />
          : <KitText t="body" color={kit.textMuted}>{t('match.noFormation')}</KitText>}
      </View>
      {chosenLine && (
        <View style={{ gap: space[2] }}>
          <SectionTag roles={kit}>{t('match.heatMap')}</SectionTag>
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
  const rows: Row[] = [{ minute: "1'", text: t('match.kickOff', { home: homeName, away: awayName }), big: false, marker: true }]
  let halfDone = false, ninetyDone = false
  for (const e of events) {
    // Up to the next marker that's due (half-time, then the 90'), never past it.
    chancesUpTo(Math.min(e.minute, !halfDone ? 46 : !ninetyDone ? 91 : 999), rows)
    if (!halfDone && e.minute > 45) {
      const ht = scoreAt(45); halfDone = true
      rows.push({ minute: t('match.htTag'), text: t('match.halfTime', { home: homeName, away: awayName, h: ht.h, a: ht.a }), big: false, marker: true })
    }
    if (!ninetyDone && e.minute > 90) {
      const ft = scoreAt(90); ninetyDone = true
      rows.push({ minute: "90'", text: t('match.levelAt90', { h: ft.h, a: ft.a }), big: false, marker: true })
    }
    chancesUpTo(e.minute + (e.plus ?? 0) / 100, rows)
    rows.push(lineForEvent(e, homeName, awayName))
  }
  if (!halfDone) {
    chancesUpTo(46, rows)
    const ht = scoreAt(45)
    rows.push({ minute: t('match.htTag'), text: t('match.halfTime', { home: homeName, away: awayName, h: ht.h, a: ht.a }), big: false, marker: true })
  }
  chancesUpTo(999, rows)
  const end = scoreAt(999)
  rows.push({
    minute: status,
    text: status === 'PENS' ? t('match.stillLevel', { h: end.h, a: end.a }) : t('match.fullTimeLine', { home: homeName, away: awayName, h: end.h, a: end.a }),
    big: true, marker: true,
  })
  // The shootout, back and forth, each kick with its taker and the running score.
  if (status === 'PENS' && kicks) {
    for (const k of shootoutOrder(kicks)) {
      const team = k.home ? homeName : awayName
      rows.push({
        minute: 'PEN',
        text: k.kick.scored
          ? t('match.penScores', { name: k.kick.playerName, team, h: k.score.h, a: k.score.a })
          : t('match.penMisses', { name: k.kick.playerName, team, h: k.score.h, a: k.score.a }),
        big: k.last,
      })
    }
    const s2 = shootoutOrder(kicks).at(-1)?.score
    if (s2) rows.push({ minute: t('parts.endTag'), text: t('match.shootoutWon', { team: s2.h > s2.a ? homeName : awayName, w: Math.max(s2.h, s2.a), l: Math.min(s2.h, s2.a) }), big: true, marker: true })
  }
  return (
    <Section title={t('match.commentary')}>
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
      accessible accessibilityLabel={t(kick.scored ? 'match.penScored' : 'match.penMissed', { name: kick.playerName })}>
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
            <Text style={styles.motmLabel}>{t('match.potm')}</Text>
            <Text style={styles.motmName} numberOfLines={1}>
              {motm.name}
              <Text style={styles.motmTeam}>  ·  {motm.isHome ? r.homeName : r.awayName}</Text>
            </Text>
          </View>
          <RatingSquare value={motm.rating} />
        </Pressable>
      )}

      <Section title={t('match.momentum')}>
        <StatSideHeader homeName={r.homeName} awayName={r.awayName} homeClubId={r.homeClubId} awayClubId={r.awayClubId} accent={accent} />
        <MomentumGraph
          series={detail.momentum} duration={detail.duration}
          markers={momentumMarkers(detail.events)}
          homeName={r.homeName} awayName={r.awayName} title={null}
        />
        <View style={{ height: space[4] }} />
        <StatBar label={t('match.stat.possession')} home={detail.home.possession} away={detail.away.possession} accent={accent} pct />
        <StatBar label={t('match.stat.xg')} home={detail.home.xg} away={detail.away.xg} accent={accent} />
        <StatBar label={t('match.stat.shots')} home={detail.home.shots} away={detail.away.shots} accent={accent} />
        <StatBar label={t('match.stat.shotsOnTarget')} home={detail.home.shotsOnTarget} away={detail.away.shotsOnTarget} accent={accent} />
        <StatBar label={t('match.stat.touchesInOppBox')} home={detail.home.touchesInOppBox} away={detail.away.touchesInOppBox} accent={accent} />
        <View style={styles.teamRatings}>
          <RatingSquare value={detail.homeRating} />
          <Text style={styles.teamRatingLabel}>{t('match.teamRating')}</Text>
          <RatingSquare value={detail.awayRating} />
        </View>
      </Section>

      {detail.events.length > 0 && (
        <Section title={t('match.timeline')}>
          <Timeline events={detail.events} addedTime={detail.addedTime} duration={detail.duration} varCalls={varCalls} />
        </Section>
      )}
      {kicks && (
        <Section title={t('match.shootout')}>
          {/* Two columns, like the score at the top: the home side's takers on
              the left, the away side's on the right, one row per round, with
              the score after that round between them (maintainer, P8-81). */}
          <View style={styles.penHead}>
            <MarkedName clubId={r.homeClubId} name={r.homeName} style={styles.penHeadName} />
            <View style={styles.penMid} />
            <MarkedName clubId={r.awayClubId} name={r.awayName} style={styles.penHeadName} align="right" />
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

      <Section title={t('match.topRated')}>
        <View style={styles.twoCol}>
          <TopRated title={r.homeName} clubId={r.homeClubId} players={topRated(detail.players, true)} />
          <TopRated title={r.awayName} clubId={r.awayClubId} players={topRated(detail.players, false)} />
        </View>
      </Section>

      {/* Always rendered when there's a timeline at all. Hiding the section when
          both sides were empty made an opening matchday look like the feature
          was missing, rather than like there was simply nothing before it. */}
      {context && (
        <Section title={t('match.formGoingIn')}>
          <Text style={styles.hint}>{t('match.formHint')}</Text>
          <FormBlock name={r.homeName} clubId={r.homeClubId} form={context.homeForm} onOpenMatch={onOpenMatch} />
          <FormBlock name={r.awayName} clubId={r.awayClubId} form={context.awayForm} onOpenMatch={onOpenMatch} />
        </Section>
      )}

      {context && (
        <Section title={t('match.nextMatch')}>
          <NextMatch name={r.homeName} clubId={r.homeClubId} match={context.homeNext} accent={accent} onOpenMatch={onOpenMatch} />
          <NextMatch name={r.awayName} clubId={r.awayClubId} match={context.awayNext} accent={accent} onOpenMatch={onOpenMatch} />
        </Section>
      )}

      <Section title={t('match.atTheTime')}>
        {context?.bracket ? (
          <>
            <Text style={styles.subHead}>{t('match.bracketSoFar')}</Text>
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
          <Text style={styles.hint}>{t('match.noStandings')}</Text>
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
  { key: 'rating', label: t('match.stat.rating'), short: t('match.stat.rating'), value: l => l.rating, render: l => formatRating(l.rating) },
  { key: 'created', label: t('match.stat.created'), short: t('match.stat.created'), value: l => l.keyPasses, render: l => String(l.keyPasses) },
  // P8-43: its own column; a big chance is a different, rarer thing than a key pass.
  { key: 'bigCreated', label: t('match.stat.bigCreated'), short: t('match.stat.bigCreatedShort'), value: l => l.bigChancesCreated, render: l => String(l.bigChancesCreated) },
  { key: 'shots', label: t('match.stat.shots'), short: t('match.stat.shots'), value: l => l.shots, render: l => String(l.shots) },
  { key: 'sot', label: t('match.stat.shotsOnTarget'), short: t('match.stat.shotsOnTarget'), value: l => l.shotsOnTarget, render: l => String(l.shotsOnTarget) },
  {
    key: 'pass', label: t('match.stat.passRate'), short: t('match.stat.passPct'),
    value: l => l.passAccuracy,
    render: l => `${l.passAccuracy}% (${l.accuratePasses}/${l.passes})`,
  },
  {
    key: 'dribbles', label: t('match.stat.dribbles'), short: t('match.stat.dribblesShort'),
    // `dribbles` is the SUCCESSFUL count; attempts are inferred from the
    // possession lost while carrying, so the ratio stays honest.
    value: l => l.dribbles,
    render: l => String(l.dribbles),
  },
  { key: 'tackles', label: t('match.stat.tacklesWon'), short: t('match.stat.tacklesWon'), value: l => l.tacklesWon, render: l => String(l.tacklesWon) },
  { key: 'fouls', label: t('match.stat.foulsCommitted'), short: t('match.stat.foulsCommitted'), value: l => l.foulsCommitted, render: l => String(l.foulsCommitted) },
  { key: 'touches', label: t('match.stat.touches'), short: t('match.stat.touches'), value: l => l.touches, render: l => String(l.touches) },
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
    <View style={{ gap: space[2] }}>
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
      <Text style={styles.hint}>{t('match.sortedBy', { col: col.label.toLowerCase() })}</Text>
      
      {rows.map(l => (
        <Pressable key={l.playerId} style={({ pressed }) => [styles.psRow, pressed && { opacity: 0.6 }]} disabled={!onOpenPlayer} onPress={() => onOpenPlayer?.(l.playerId)}>
          <View style={[styles.psSide, { backgroundColor: l.isHome ? (pair?.home ?? accent) : (pair?.away ?? prim.cottonMuted) }]} />
          <Text style={styles.psPos}>{l.position}</Text>
          <Text style={styles.psName} numberOfLines={1}>{l.name}</Text>
          <Text style={styles.psTeam} numberOfLines={1}>{countryName(l.isHome ? homeName : awayName)}</Text>
          {/* Sorted by rating, the figure is the rating chip, in PoM's own rating colours (P8.5-33). */}
          {col.key === 'rating'
            ? <RatingSquare value={l.rating} />
            : <Text style={[styles.psValue, { color: accent }]} numberOfLines={1}>{col.render(l)}</Text>}
        </Pressable>
      ))}
    </View>
  )
}

function StatsTab({ detail, accent, homeName, awayName, homeClubId, awayClubId, onOpenPlayer }: {
  detail: MatchStats; accent: string; homeName: string; awayName: string; homeClubId: string; awayClubId: string; onOpenPlayer?: (id: string) => void
}) {
  return (
    <>
      <Section title={t('match.secShots')}>
        <StatSideHeader homeName={homeName} awayName={awayName} homeClubId={homeClubId} awayClubId={awayClubId} accent={accent} />
        <StatBar label={t('match.stat.shotsInsideBox')} home={detail.home.shotsInsideBox} away={detail.away.shotsInsideBox} accent={accent} />
        <StatBar label={t('match.stat.shotsOutsideBox')} home={detail.home.shotsOutsideBox} away={detail.away.shotsOutsideBox} accent={accent} />
        <StatBar label={t('match.stat.shotsOffTarget')} home={detail.home.shotsOffTarget} away={detail.away.shotsOffTarget} accent={accent} />
        <StatBar label={t('match.stat.shotsBlocked')} home={detail.home.shotsBlocked} away={detail.away.shotsBlocked} accent={accent} />
        <StatBar label={t('match.stat.woodwork')} home={detail.home.shotsWoodwork} away={detail.away.shotsWoodwork} accent={accent} />
        <StatBar label={t('match.stat.bigChances')} home={detail.home.bigChances} away={detail.away.bigChances} accent={accent} />
        <StatBar label={t('match.stat.bigChancesMissed')} home={detail.home.bigChancesMissed} away={detail.away.bigChancesMissed} accent={accent} />
        <StatBar label={t('match.stat.xgOpenPlay')} home={detail.home.xgOpenPlay} away={detail.away.xgOpenPlay} accent={accent} />
        <StatBar label={t('match.stat.xgSetPiece')} home={detail.home.xgSetPiece} away={detail.away.xgSetPiece} accent={accent} />
      </Section>

      <Section title={t('match.secPasses')}>
        <StatSideHeader homeName={homeName} awayName={awayName} homeClubId={homeClubId} awayClubId={awayClubId} accent={accent} />
        <StatBar label={t('match.stat.passes')} home={detail.home.passes} away={detail.away.passes} accent={accent} />
        <StatBar label={t('match.stat.accuratePasses')} home={detail.home.accuratePasses} away={detail.away.accuratePasses} accent={accent} />
        <StatBar label={t('match.stat.passAccuracy')} home={detail.home.passAccuracy} away={detail.away.passAccuracy} accent={accent} pct />
        <StatBar label={t('match.stat.ownHalfPasses')} home={detail.home.ownHalfPasses} away={detail.away.ownHalfPasses} accent={accent} />
        <StatBar label={t('match.stat.oppHalfPasses')} home={detail.home.oppHalfPasses} away={detail.away.oppHalfPasses} accent={accent} />
        <StatBar label={t('match.stat.longBalls')} home={detail.home.accurateLongBalls} away={detail.away.accurateLongBalls} accent={accent} />
        <StatBar label={t('match.stat.crosses')} home={detail.home.accurateCrosses} away={detail.away.accurateCrosses} accent={accent} />
        <StatBar label={t('match.stat.throwIns')} home={detail.home.throwIns} away={detail.away.throwIns} accent={accent} />
        <StatBar label={t('match.stat.finalThird')} home={detail.home.finalThirdEntries} away={detail.away.finalThirdEntries} accent={accent} />
        <StatBar label={t('match.stat.corners')} home={detail.home.corners} away={detail.away.corners} accent={accent} />
      </Section>

      <Section title={t('match.secDefence')}>
        <StatSideHeader homeName={homeName} awayName={awayName} homeClubId={homeClubId} awayClubId={awayClubId} accent={accent} />
        <StatBar label={t('match.stat.tacklesWon')} home={detail.home.tacklesWon} away={detail.away.tacklesWon} accent={accent} />
        <StatBar label={t('match.stat.interceptions')} home={detail.home.interceptions} away={detail.away.interceptions} accent={accent} />
        <StatBar label={t('match.stat.blocks')} home={detail.home.blocks} away={detail.away.blocks} accent={accent} />
        <StatBar label={t('match.stat.clearances')} home={detail.home.clearances} away={detail.away.clearances} accent={accent} />
        <StatBar label={t('match.stat.saves')} home={detail.home.keeperSaves} away={detail.away.keeperSaves} accent={accent} />
        <StatBar label={t('match.stat.groundDuels')} home={detail.home.groundDuelsWon} away={detail.away.groundDuelsWon} accent={accent} />
        <StatBar label={t('match.stat.aerialDuels')} home={detail.home.aerialDuelsWon} away={detail.away.aerialDuelsWon} accent={accent} />
        <StatBar label={t('match.stat.dribbles')} home={detail.home.dribbles} away={detail.away.dribbles} accent={accent} />
        <StatBar label={t('match.stat.possessionLost')} home={detail.home.possessionLost} away={detail.away.possessionLost} accent={accent} />
      </Section>

      <Section title={t('match.secDiscipline')}>
        <StatSideHeader homeName={homeName} awayName={awayName} homeClubId={homeClubId} awayClubId={awayClubId} accent={accent} />
        <StatBar label={t('match.stat.fouls')} home={detail.home.fouls} away={detail.away.fouls} accent={accent} />
        <StatBar label={t('match.stat.yellows')} home={detail.home.yellowCards} away={detail.away.yellowCards} accent={accent} />
        <StatBar label={t('match.stat.reds')} home={detail.home.redCards} away={detail.away.redCards} accent={accent} />
        <StatBar label={t('match.stat.offsides')} home={detail.home.offsides} away={detail.away.offsides} accent={accent} />
      </Section>

      <Section title={t('match.secPlayerStats')}>
        <PlayerStatsTable detail={detail} accent={accent} homeName={homeName} awayName={awayName} onOpenPlayer={onOpenPlayer} />
      </Section>
    </>
  )
}

// ── Small pieces ────────────────────────────────────────────────────────────


// C-15: the kit's section head (SectionTag), as every rebuilt screen has it.
function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={styles.section}>
      <SectionTag roles={ROLES[FLOODLIT]}>{title}</SectionTag>
      {children}
    </View>
  )
}

function TopRated({ title, clubId, players }: { title: string; clubId: string; players: PlayerMatchLine[] }) {
  return (
    <View style={{ flex: 1, gap: 4 }}>
      <MarkedName clubId={clubId} name={title} style={styles.subHeadSmall} />
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
        <Text style={styles.thClub}>{t('season.colClub')}</Text>
        <Text style={styles.thNum}>{t('season.colP')}</Text>
        <Text style={styles.thNum}>{t('result.figW')}</Text>
        <Text style={styles.thNum}>{t('result.figD')}</Text>
        <Text style={styles.thNum}>{t('result.figL')}</Text>
        <Text style={styles.thNum}>{t('season.colGd')}</Text>
        <Text style={[styles.thNum, styles.thPts]}>{t('season.colPts')}</Text>
      </View>
      {rows.map((row, i) => {
        const on = highlight.includes(row.clubId)
        return (
          <View key={row.clubId} style={[styles.tableRow, on && { backgroundColor: accent + '1F' }]}>
            <Text style={[styles.tdPos, on && { color: accent, fontFamily: font.bodyBlack }]}>{i + 1}</Text>
            <Text style={[styles.tdClub, on && { color: prim.cotton, fontFamily: font.bodyBold }]} numberOfLines={1}>{countryName(row.clubName)}</Text>
            <Text style={styles.tdNum}>{row.played}</Text>
            <Text style={styles.tdNum}>{row.won}</Text>
            <Text style={styles.tdNum}>{row.drawn}</Text>
            <Text style={styles.tdNum}>{row.lost}</Text>
            <Text style={styles.tdNum}>{row.goalDiff > 0 ? `+${row.goalDiff}` : row.goalDiff}</Text>
            <Text style={[styles.tdNum, styles.tdPts]}>{row.points}</Text>
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
  const involves = (tie: BracketTie) => focus.includes(tie.teamAId) || focus.includes(tie.teamBId)
  const hidden = rounds.reduce((n, r) => n + r.ties.filter(tie => !involves(tie)).length, 0)

  return (
    <View style={{ gap: space[4] }}>
      {rounds.map(round => {
        const ties = showAll ? round.ties : round.ties.filter(involves)
        if (ties.length === 0) return null
        return (
          <View key={round.label} style={{ gap: 4 }}>
            <Text style={styles.subHeadSmall}>{label(round.label)}</Text>
            {ties.map(tie => (
              <BracketTieCard key={tie.key} tie={tie} focus={focus} accent={accent} onOpenMatch={onOpenMatch} />
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
            {showAll ? t('match.showTwo') : t('match.showFull', { count: hidden })}
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
      <MarkedName clubId={tie.teamAId} name={tie.teamAName} style={sideStyle(tie.teamAId)} />
      <Text style={[styles.tieScore, { color: accent }]}>
        {tie.aGoals ?? '–'} – {tie.bGoals ?? '–'}
        {onPens ? <Text style={styles.tiePens}>{'\n' + t('match.pensShort')}</Text> : null}
      </Text>
      <MarkedName clubId={tie.teamBId} name={tie.teamBName} style={sideStyle(tie.teamBId)} align="right" />
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
                  {t('match.legLine', { n: i + 1, a: aIsHome ? leg.homeGoals : leg.awayGoals, b: aIsHome ? leg.awayGoals : leg.homeGoals })}
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

function FormBlock({ name, clubId, form, onOpenMatch }: {
  name: string; clubId: string; form: FormResult[]; onOpenMatch: (m: ContextMatch) => void
}) {
  return (
    <View style={styles.formBlock}>
      <MarkedName clubId={clubId} name={name} style={styles.formTeam} />
      {form.length === 0
        ? <Text style={styles.hint}>{t('match.firstMatch')}</Text>
        : form.map(f => (
          <Pressable
            key={f.matchday}
            style={({ pressed }) => [styles.formItem, pressed && { opacity: 0.6 }]}
            onPress={() => onOpenMatch(f.match)}
          >
            {/* C-15 (C-03): the app's one form row, as the story page draws it:
                the result's tag, home or away, the opponent, the score. */}
            <Tag roles={ROLES[FLOODLIT]} variant={f.outcome === 'W' ? 'win' : f.outcome === 'D' ? 'draw' : 'loss'}>{t(`match.outcome${f.outcome}`)}</Tag>
            <VenueMark roles={ROLES[FLOODLIT]} home={f.isHome} />
            <Text style={styles.formText} numberOfLines={1}>{countryName(f.opponentName)}</Text>
            <KitText t="figure" color={prim.cotton}>{`${f.goalsFor}–${f.goalsAgainst}`}</KitText>
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
      <MarkedName clubId={clubId} name={name} style={styles.formTeam} />
      {!match ? (
        <Text style={styles.hint}>{t('match.campaignEnded')}</Text>
      ) : (
        <Pressable
          style={({ pressed }) => [styles.nextRow, pressed && played ? { opacity: 0.6 } : null]}
          disabled={!played}
          onPress={() => onOpenMatch(match)}
        >
          <View style={{ flex: 1 }}>
            {match.label ? <Text style={styles.nextLabel} numberOfLines={1}>{label(match.label)}</Text> : null}
            <Text style={styles.nextTeams} numberOfLines={1}>
              {(match.homeClubId === clubId ? t('match.vs') : t('match.at')) + ' '}
              <Text style={{ color: prim.cotton, fontFamily: font.bodyBold }}>
                {countryName(match.homeClubId === clubId ? match.awayClubName : match.homeClubName)}
              </Text>
            </Text>
          </View>
          {played
            ? <Text style={[styles.nextScore, { color: accent }]}>{match.homeGoals} – {match.awayGoals}</Text>
            : <Text style={styles.nextPending}>{t('match.toPlay')}</Text>}
          {played && <Text style={styles.formChevron}>›</Text>}
        </Pressable>
      )}
    </View>
  )
}

// A World Cup match and a final are on neutral ground: no home or away to mark.
const isNeutral = (label?: string) => !!label && (/^Final\b/.test(label) || /Group [A-L]|Round of 32|World Cup/.test(label))

const styles = StyleSheet.create({
  venueLine: { alignItems: 'center', marginTop: 4 },
  penHead: { flexDirection: 'row', alignItems: 'center', paddingBottom: space[1] },
  penHeadName: { flex: 1, fontSize: 11, color: prim.cottonMuted, fontFamily: font.tagBold, textTransform: 'uppercase' },
  penRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 6, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: prim.ruleNylon },
  penCell: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: space[1], minWidth: 0 },
  penMid: { width: 56, alignItems: 'center' },
  penRound: { fontSize: 9, color: prim.cottonMuted, fontFamily: font.tag },
  penMark: { fontSize: 10, fontFamily: font.tagBold },
  penName: { flexShrink: 1, fontSize: type.body.fontSize, color: prim.cotton, fontFamily: font.bodyBold },
  penScore: { fontSize: type.body.fontSize, color: prim.cotton, fontFamily: font.bodyBlack },
  paired: { flexDirection: 'row', gap: space[6], alignItems: 'flex-start' },
  pairedCol: { flex: 1, minWidth: 0 },
  container: { flex: 1, backgroundColor: prim.nylon },
  centred: { alignItems: 'center', justifyContent: 'center', gap: space[4] },
  backLink: { padding: space[4] },
  backLinkText: { fontSize: type.bodyL.fontSize, fontFamily: font.bodyBold },

  topBar: {
    flexDirection: 'row', alignItems: 'center',
    paddingTop: 52, paddingBottom: space[2], paddingHorizontal: space[4],
    backgroundColor: prim.nylonRaised,
  },
  backBtn: { width: 26, alignItems: 'flex-start' },
  topBarScore: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: space[2] },
  topBarTeam: { flex: 1, fontSize: type.tag.fontSize, color: prim.cottonMuted, fontFamily: font.bodyBold },
  topBarNums: { fontSize: 22, lineHeight: 24, fontFamily: font.super },
  topBarStatus: { fontSize: 9, color: prim.cottonMuted, fontFamily: font.bodyBlack, letterSpacing: 0.5 },

  headerCollapse: { backgroundColor: prim.nylonRaised, paddingHorizontal: space[5], paddingBottom: space[4], gap: 4 },
  compLabel: { fontSize: type.tag.fontSize, color: prim.cottonMuted, textAlign: 'center', textTransform: 'uppercase', letterSpacing: 1, fontFamily: font.bodyBold },
  headerRow: { flexDirection: 'row', alignItems: 'center', gap: space[2] },
  headerTeam: { flex: 1, fontSize: type.bodyL.fontSize, fontFamily: font.bodyBold, color: prim.cotton },
  // flexShrink 0: at 48px the score is wider than 92, and a shrinking column wrapped
  // "2 – 1" so one side's goals were clipped off (seen from the run hub).
  headerScoreCol: { alignItems: 'center', minWidth: 92, flexShrink: 0, paddingHorizontal: 8 },
  headerScore: { fontSize: 48, lineHeight: 48, fontFamily: font.super },
  headerStatus: { fontSize: 9, color: prim.cottonMuted, textTransform: 'uppercase', letterSpacing: 0.8, fontFamily: font.bodyBold },
  legSwitch: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  legArrow: { width: 28, height: 36, alignItems: 'center', justifyContent: 'center' },
  // Over the bar's content row (below its 52px status-bar padding), centred.
  legLabel: { position: 'absolute', left: 0, right: 0, top: 52, bottom: space[2], alignItems: 'center', justifyContent: 'center' },
  pensNote: { fontSize: type.tag.fontSize, fontFamily: font.bodyBold, textAlign: 'center' },
  scorerRow: { flexDirection: 'row', gap: space[4], marginTop: 2 },
  scorerLine: { fontSize: 10, color: prim.cottonMuted },
  scorerMark: { color: prim.cottonMuted, fontFamily: font.bodyBold },

  // The sticky tab bar scrolls over content, so it must be fully opaque.
  tabBar: { backgroundColor: prim.nylonRaised, borderBottomWidth: 1, borderBottomColor: prim.ruleNylon },
  tabRow: { flexDirection: 'row' },
  tabBtn: { flex: 1, alignItems: 'center', paddingTop: space[2], gap: space[2] },
  tabText: { fontSize: type.body.fontSize, fontFamily: font.bodyBold, color: prim.cottonMuted },
  tabUnderline: { height: 3, width: '55%', borderRadius: 2, backgroundColor: 'transparent' },

  body: { padding: space[4], paddingBottom: space[6] * 2, gap: space[4] },

  loadingBlock: { paddingVertical: space[6], alignItems: 'center' },
  loadingText: { fontSize: type.tag.fontSize, color: prim.cottonMuted, marginTop: space[2] },
  noData: { fontSize: type.body.fontSize, color: prim.cottonMuted, textAlign: 'center', paddingVertical: space[6] },

  section: { backgroundColor: prim.nylonRaised, borderRadius: 0, borderWidth: 1, borderColor: prim.ruleNylon, padding: space[5] },
  subHead: { fontSize: type.tag.fontSize, fontFamily: font.bodyBlack, color: prim.cottonMuted, marginBottom: space[2], textTransform: 'uppercase', letterSpacing: 0.6 },
  subHeadSmall: { fontSize: 10, fontFamily: font.bodyBlack, color: prim.cottonMuted, textTransform: 'uppercase', letterSpacing: 0.5 },
  hint: { fontSize: 10, color: prim.cottonMuted, },
  twoCol: { flexDirection: 'row', gap: space[5] },

  motmCard: {
    flexDirection: 'row', alignItems: 'center', gap: space[2],
    backgroundColor: prim.nylonRaised, borderRadius: 0, borderWidth: 1, borderColor: prim.ruleNylon,
    padding: space[5],
  },
  motmStar: { fontSize: 20, color: prim.gold },   // gold: the best player (P8-38's rule)
  motmLabel: { fontSize: 9, color: prim.cottonMuted, fontFamily: font.bodyBlack, letterSpacing: 1 },
  motmName: { fontSize: type.bodyL.fontSize, fontFamily: font.bodyBold, color: prim.cotton },
  motmTeam: { fontSize: type.tag.fontSize, color: prim.cottonMuted, fontFamily: font.body },

  teamRatings: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: space[4], marginTop: space[4] },
  teamRatingLabel: { fontSize: 9, color: prim.cottonMuted, fontFamily: font.bodyBold, letterSpacing: 1 },

  lineupTeam: { fontSize: type.body.fontSize, fontFamily: font.bodyBlack, marginBottom: 4 },
  benchLabel: { fontSize: 9, color: prim.cottonMuted, fontFamily: font.bodyBold, textTransform: 'uppercase', letterSpacing: 1, marginTop: space[2] },

  topRatedItem: { flexDirection: 'row', alignItems: 'center', gap: space[1], justifyContent: 'space-between' },
  topRatedName: { fontSize: 11, color: prim.cottonMuted, flexShrink: 1 },

  table: { borderRadius: 0, overflow: 'hidden', borderWidth: 1, borderColor: prim.ruleNylon },
  tableHead: { flexDirection: 'row', alignItems: 'center', backgroundColor: prim.nylonSunken, paddingVertical: 5, paddingHorizontal: space[2], gap: 4 },
  tableRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 5, paddingHorizontal: space[2], gap: 4, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: prim.ruleNylon },
  thPos: { width: 18, fontSize: 9, color: prim.cottonMuted, fontFamily: font.bodyBold },
  thClub: { flexGrow: 1, flexShrink: 1, flexBasis: 'auto', fontSize: 9, color: prim.cottonMuted, fontFamily: font.bodyBold },
  thNum: { width: 22, fontSize: 9, color: prim.cottonMuted, fontFamily: font.bodyBold, textAlign: 'center' },
  thPts: { width: 26 },
  tdPos: { width: 18, fontSize: 10, color: prim.cottonMuted },
  tdClub: { flexGrow: 1, flexShrink: 1, flexBasis: 'auto', fontSize: 10, color: prim.cottonMuted },
  tdNum: { width: 22, fontSize: 10, color: prim.cottonMuted, textAlign: 'center' },
  tdPts: { width: 26, fontFamily: font.bodyBlack, color: prim.cotton },

  tieCard: { backgroundColor: prim.nylonSunken, borderRadius: 0, borderWidth: 1, borderColor: prim.ruleNylon, paddingVertical: 6, paddingHorizontal: space[2] },
  tieHead: { flexDirection: 'row', alignItems: 'center', gap: space[2] },
  tieTeam: { flex: 1, fontSize: 11, color: prim.cottonMuted },
  tieScore: { fontSize: type.tag.fontSize, fontFamily: font.bodyBlack, minWidth: 44, textAlign: 'center' },
  tiePens: { fontSize: 8, color: prim.cottonMuted, fontFamily: font.bodyBold, textTransform: 'uppercase', letterSpacing: 0.5 },
  tieLegs: { marginTop: 4, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: prim.ruleNylon, paddingTop: 2 },
  tieLeg: { flexDirection: 'row', alignItems: 'center', gap: space[2], paddingVertical: 2 },
  tieLegText: { flex: 1, fontSize: 10, color: prim.cottonMuted },
  bracketToggle: { alignSelf: 'flex-start', paddingVertical: 4 },
  bracketToggleText: { fontSize: 10, fontFamily: font.bodyBlack, textTransform: 'uppercase', letterSpacing: 0.5 },

  formBlock: { marginTop: space[2], gap: 4 },
  formTeam: { fontSize: 10, fontFamily: font.bodyBlack, color: prim.cottonMuted, textTransform: 'uppercase', letterSpacing: 0.5 },
  formItem: { flexDirection: 'row', alignItems: 'center', gap: space[2], paddingVertical: 2 },
  formText: { fontSize: 10, color: prim.cottonMuted, flex: 1 },
  formChevron: { fontSize: type.bodyL.fontSize, color: prim.cottonMuted, fontFamily: font.bodyBold },

  nextRow: { flexDirection: 'row', alignItems: 'center', gap: space[2], backgroundColor: prim.nylonSunken, borderRadius: 0, padding: space[2] },
  nextLabel: { fontSize: 9, color: prim.cottonMuted, textTransform: 'uppercase', letterSpacing: 0.5, fontFamily: font.bodyBold },
  nextTeams: { fontSize: type.tag.fontSize, color: prim.cottonMuted },
  nextScore: { fontSize: type.body.fontSize, fontFamily: font.bodyBlack },
  nextPending: { fontSize: 9, color: prim.cottonMuted, fontFamily: font.bodyBold, textTransform: 'uppercase', letterSpacing: 0.5 },

  sortRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 4 },
  sortChip: {
    paddingHorizontal: space[2], paddingVertical: 3, borderRadius: 0,
    borderWidth: 1, borderColor: prim.ruleNylon, backgroundColor: prim.nylonSunken,
  },
  sortChipText: { fontSize: 9, fontFamily: font.bodyBlack, color: prim.cottonMuted },
  linked: { textDecorationLine: 'underline' },
  seasonLink: { alignSelf: 'flex-start', paddingVertical: space[1], paddingHorizontal: space[2], marginBottom: space[1] },
  seasonLinkText: { fontSize: type.body.fontSize, fontFamily: font.bodyBold },
  psRow: { flexDirection: 'row', alignItems: 'center', gap: space[2], paddingVertical: 4, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: prim.ruleNylon },
  // A colour bar rather than colour alone — which side a player is on stays
  // legible without relying on hue.
  psSide: { width: 3, height: 16, borderRadius: 2 },
  psPos: { width: 28, fontSize: 9, fontFamily: font.bodyBlack, color: prim.cottonMuted },
  psName: { flexGrow: 1, flexShrink: 1, flexBasis: 'auto', fontSize: 11, color: prim.cotton },
  psTeam: { width: 72, fontSize: 9, color: prim.cottonMuted, textAlign: 'right' },
  psValue: { minWidth: 92, fontSize: 11, fontFamily: font.bodyBlack, textAlign: 'right' },
})
