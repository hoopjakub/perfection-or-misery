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

import React, { useMemo, useRef, useState } from 'react'
import { View, Text, StyleSheet, ActivityIndicator, Pressable, Animated, ScrollView } from 'react-native'
import { router } from 'expo-router'
import { Ionicons } from '@expo/vector-icons'
import { colors, spacing, typography, radius, ratingColor } from '@/theme'
import { flagForCountry } from '@/data/geo-iso'
import { openMatchStats, takeMatchStatsRequest } from '@/lib/matchStats'
import {
  useMatchDetail, StatBar, PlayerRow, Timeline, splitLineup, ScorerList, StatSideHeader,
  type MatchDetailRequest,
} from '@/components/MatchStatsParts'
import { MomentumGraph, momentumMarkers } from '@/components/MomentumGraph'
import { MatchLineupPitch, MatchBench } from '@/components/MatchLineupPitch'
import {
  standingsAsOf, formBefore, topRated, nextMatchFor, knockoutBracket,
  type ContextMatch, type ContextRow, type FormResult,
  type BracketRound, type BracketTie,
} from '@/engine/match-context'
import type { MatchEvent, PlayerMatchLine, MatchStats } from '@/types/match-stats'

type Tab = 'facts' | 'lineup' | 'stats'

// Scroll distance over which the compact score fades into the top bar — timed
// so it has arrived by the time the tall header has scrolled out of sight.
const HEADER_FADE_START = 40
const HEADER_FADE_END = 110

export default function MatchStatsScreen() {
  // Taken ONCE on mount: the screen owns its match for as long as it's on the
  // stack, so opening another match from underneath can't swap this one out.
  const [request] = useState<MatchDetailRequest | null>(() => takeMatchStatsRequest())
  const { detail, loading } = useMatchDetail(request)
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [tab, setTab] = useState<Tab>('facts')
  const scrollY = useRef(new Animated.Value(0)).current

  const accent = request?.accent ?? colors.accent
  const r = request

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
    if (!r || m.homeGoals === undefined || m.awayGoals === undefined) return
    openMatchStats({
      homeClubId: m.homeClubId, homeName: m.homeClubName,
      awayClubId: m.awayClubId, awayName: m.awayClubName,
      homeGoals: m.homeGoals, awayGoals: m.awayGoals,
      extraTime: m.extraTime, scorers: m.scorers, seed: m.seed,
      homeRotation: m.homeRotation, awayRotation: m.awayRotation,
      absent: m.absent, standIns: m.standIns,
      yearStart: r.yearStart,
      competitionLabel: m.label,
      playerClubId: r.playerClubId, drafted: r.drafted,
      matchday: m.matchday, contextMatches: r.contextMatches,
    }, accent)
  }

  if (!r) {
    return (
      <View style={[styles.container, styles.centred]}>
        <Text style={styles.noData}>No match selected.</Text>
        <Pressable style={styles.backLink} onPress={() => router.back()}>
          <Text style={[styles.backLinkText, { color: accent }]}>Go back</Text>
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

  return (
    <View style={styles.container}>
      {/* Top bar — always present. The score fades into it as you scroll. */}
      <View style={styles.topBar}>
        <Pressable style={styles.backBtn} onPress={() => router.back()} hitSlop={10}>
          <Ionicons name="chevron-back" size={22} color={colors.textPrimary} />
        </Pressable>
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
        stickyHeaderIndices={[1]}
        showsVerticalScrollIndicator
        scrollEventThrottle={16}
        onScroll={Animated.event([{ nativeEvent: { contentOffset: { y: scrollY } } }], { useNativeDriver: false })}
      >
        <View style={styles.headerCollapse}>
          {r.competitionLabel ? <Text style={styles.compLabel} numberOfLines={1}>{r.competitionLabel}</Text> : null}
          <View style={styles.headerRow}>
            <Text style={[styles.headerTeam, { textAlign: 'right' }]} numberOfLines={2}>{withFlag(r.homeName)}</Text>
            <View style={styles.headerScoreCol}>
              <Text style={[styles.headerScore, { color: accent }]}>{r.homeGoals} – {r.awayGoals}</Text>
              <Text style={styles.headerStatus}>
                {status === 'FT' ? 'Full time' : status === 'AET' ? 'After extra time' : 'Penalties'}
              </Text>
            </View>
            <Text style={styles.headerTeam} numberOfLines={2}>{withFlag(r.awayName)}</Text>
          </View>
          {r.pensNote ? <Text style={[styles.pensNote, { color: accent }]}>{r.pensNote}</Text> : null}
          {detail && (
            <View style={styles.scorerRow}>
              <ScorerList events={detail.events} isHome align="right" />
              <ScorerList events={detail.events} isHome={false} align="left" />
            </View>
          )}
        </View>

        <View style={styles.tabBar}>
          {(['facts', 'lineup', 'stats'] as Tab[]).map(t => (
            <Pressable key={t} style={styles.tabBtn} onPress={() => setTab(t)}>
              <Text style={[styles.tabText, tab === t && { color: colors.textPrimary }]}>
                {t === 'facts' ? 'Facts' : t === 'lineup' ? 'Lineup' : 'Stats'}
              </Text>
              <View style={[styles.tabUnderline, tab === t && { backgroundColor: accent }]} />
            </Pressable>
          ))}
        </View>

        <View style={styles.body}>
        {loading && (
          <View style={styles.loadingBlock}>
            <ActivityIndicator color={accent} />
            <Text style={styles.loadingText}>Crunching the numbers…</Text>
          </View>
        )}
        {!loading && !detail && <Text style={styles.noData}>No detailed stats available for this match.</Text>}

        {detail && lineups && tab === 'facts' && (
          <FactsTab
            r={r} detail={detail} accent={accent} motm={motm} context={context} onOpenMatch={openRelated}
          />
        )}

        {detail && lineups && tab === 'lineup' && (
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
                      onPressPlayer={l => setExpandedId(id => id === l.playerId ? null : l.playerId)}
                    />
                    <Text style={styles.benchLabel}>Bench</Text>
                    <MatchBench
                      players={[...lineups[side].cameOn, ...lineups[side].unused]}
                      accent={accent}
                      onPressPlayer={l => setExpandedId(id => id === l.playerId ? null : l.playerId)}
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
            <Text style={styles.hint}>Tap a player for their full match stats · ★ = player of the match</Text>
            {([['home', r.homeName], ['away', r.awayName]] as const).map(([side, name]) => {
              const lu = lineups[side]
              return (
                <View key={side} style={{ marginTop: spacing.md }}>
                  <Text style={[styles.lineupTeam, { color: accent }]}>{withFlag(name)}</Text>
                  {lu.starters.map(l => (
                    <PlayerRow key={l.playerId} l={l} accent={accent}
                      expanded={expandedId === l.playerId}
                      onPress={() => setExpandedId(id => id === l.playerId ? null : l.playerId)} />
                  ))}
                  {lu.cameOn.length > 0 && <Text style={styles.benchLabel}>Came on</Text>}
                  {lu.cameOn.map(l => (
                    <PlayerRow key={l.playerId} l={l} accent={accent}
                      expanded={expandedId === l.playerId}
                      onPress={() => setExpandedId(id => id === l.playerId ? null : l.playerId)} />
                  ))}
                  {lu.unused.length > 0 && <Text style={styles.benchLabel}>Unused subs</Text>}
                  {lu.unused.map(l => (
                    <PlayerRow key={l.playerId} l={l} accent={accent} expanded={false} onPress={() => {}} />
                  ))}
                </View>
              )
            })}
          </Section>
          </>
        )}

        {detail && tab === 'stats' && <StatsTab detail={detail} accent={accent} homeName={r.homeName} awayName={r.awayName} />}
        </View>
      </Animated.ScrollView>
    </View>
  )
}

// ── Facts ───────────────────────────────────────────────────────────────────
function FactsTab({ r, detail, accent, motm, context, onOpenMatch }: {
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
  return (
    <>
      {/* Player of the match sits at the very top — who was best is the first
          thing you want, and it used to be buried under the whole stat grid. */}
      {motm && (
        <View style={styles.motmCard}>
          <Text style={styles.motmStar}>★</Text>
          <View style={{ flex: 1 }}>
            <Text style={styles.motmLabel}>PLAYER OF THE MATCH</Text>
            <Text style={styles.motmName} numberOfLines={1}>
              {motm.name}
              <Text style={styles.motmTeam}>  ·  {withFlag(motm.isHome ? r.homeName : r.awayName)}</Text>
            </Text>
          </View>
          <RatingChip value={motm.rating} />
        </View>
      )}

      <Section title="Momentum & key stats">
        <StatSideHeader homeName={r.homeName} awayName={r.awayName} accent={accent} />
        <MomentumGraph
          series={detail.momentum} duration={detail.duration}
          markers={momentumMarkers(detail.events)}
          accentHome={accent} homeName={r.homeName} awayName={r.awayName} title={null}
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
          <Timeline events={detail.events} addedTime={detail.addedTime} duration={detail.duration} />
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
  { key: 'rating', label: 'Rating', short: 'Rating', value: l => l.rating, render: l => l.rating.toFixed(1) },
  { key: 'created', label: 'Chances created', short: 'Chances created', value: l => l.keyPasses, render: l => String(l.keyPasses) },
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

function PlayerStatsTable({ detail, accent, homeName, awayName }: {
  detail: MatchStats; accent: string; homeName: string; awayName: string
}) {
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
            <Text style={[styles.sortChipText, sort === c.key && { color: colors.textPrimary }]}>{c.short}</Text>
          </Pressable>
        ))}
      </View>
      <Text style={styles.hint}>Sorted by {col.label.toLowerCase()} · tap a column above to re-rank</Text>
      
      {rows.map(l => (
        <View key={l.playerId} style={styles.psRow}>
          <View style={[styles.psSide, { backgroundColor: l.isHome ? accent : colors.textMuted }]} />
          <Text style={styles.psPos}>{l.position}</Text>
          <Text style={styles.psName} numberOfLines={1}>{l.name}</Text>
          <Text style={styles.psTeam} numberOfLines={1}>{l.isHome ? homeName : awayName}</Text>
          <Text style={[styles.psValue, { color: accent }]} numberOfLines={1}>{col.render(l)}</Text>
        </View>
      ))}
    </View>
  )
}

function StatsTab({ detail, accent, homeName, awayName }: {
  detail: MatchStats; accent: string; homeName: string; awayName: string
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
        <PlayerStatsTable detail={detail} accent={accent} homeName={homeName} awayName={awayName} />
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
    <View style={[styles.ratingChip, { backgroundColor: ratingColor(value) }]}>
      <Text style={styles.ratingChipText}>{value.toFixed(1)}</Text>
    </View>
  )
}

function TopRated({ title, players }: { title: string; players: PlayerMatchLine[] }) {
  return (
    <View style={{ flex: 1, gap: 4 }}>
      <Text style={styles.subHeadSmall} numberOfLines={1}>{withFlag(title)}</Text>
      {players.map(p => (
        <View key={p.playerId} style={styles.topRatedItem}>
          <Text style={styles.topRatedName} numberOfLines={1}>{p.name}</Text>
          <View style={[styles.ratingChipSm, { backgroundColor: ratingColor(p.rating) }]}>
            <Text style={styles.ratingChipSmText}>{p.rating.toFixed(1)}</Text>
          </View>
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
            <Text style={[styles.tdPos, on && { color: accent, fontWeight: typography.black }]}>{i + 1}</Text>
            <Text style={[styles.tdClub, on && { color: colors.textPrimary, fontWeight: typography.bold }]} numberOfLines={1}>{t.clubName}</Text>
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
    tie.winnerId === clubId && { color: colors.textPrimary, fontWeight: typography.black },
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
              <Text style={{ color: colors.textPrimary, fontWeight: typography.bold }}>
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

const outcomeColor = (o: 'W' | 'D' | 'L') =>
  o === 'W' ? colors.success : o === 'L' ? colors.danger : colors.warning

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  centred: { alignItems: 'center', justifyContent: 'center', gap: spacing.md },
  backLink: { padding: spacing.md },
  backLinkText: { fontSize: typography.md, fontWeight: typography.bold },

  topBar: {
    flexDirection: 'row', alignItems: 'center',
    paddingTop: 52, paddingBottom: spacing.sm, paddingHorizontal: spacing.md,
    backgroundColor: colors.bgCard,
  },
  backBtn: { width: 26, alignItems: 'flex-start' },
  topBarScore: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  topBarTeam: { flex: 1, fontSize: typography.xs, color: colors.textSecondary, fontWeight: typography.bold },
  topBarNums: { fontSize: typography.lg, fontWeight: typography.black },
  topBarStatus: { fontSize: 9, color: colors.textMuted, fontWeight: typography.black, letterSpacing: 0.5 },

  headerCollapse: { backgroundColor: colors.bgCard, paddingHorizontal: spacing.lg, paddingBottom: spacing.md, gap: 4 },
  compLabel: { fontSize: typography.xs, color: colors.textMuted, textAlign: 'center', textTransform: 'uppercase', letterSpacing: 1, fontWeight: typography.bold },
  headerRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  headerTeam: { flex: 1, fontSize: typography.md, fontWeight: typography.bold, color: colors.textPrimary },
  headerScoreCol: { alignItems: 'center', minWidth: 92 },
  headerScore: { fontSize: 30, fontWeight: typography.black },
  headerStatus: { fontSize: 9, color: colors.textMuted, textTransform: 'uppercase', letterSpacing: 0.8, fontWeight: typography.bold },
  pensNote: { fontSize: typography.xs, fontWeight: typography.bold, textAlign: 'center' },
  scorerRow: { flexDirection: 'row', gap: spacing.md, marginTop: 2 },
  scorerLine: { fontSize: 10, color: colors.textSecondary },
  scorerMark: { color: colors.textMuted, fontWeight: typography.bold },

  tabBar: { flexDirection: 'row', backgroundColor: colors.bgCard, borderBottomWidth: 1, borderBottomColor: colors.border },
  tabBtn: { flex: 1, alignItems: 'center', paddingTop: spacing.sm, gap: spacing.sm },
  tabText: { fontSize: typography.sm, fontWeight: typography.bold, color: colors.textMuted },
  tabUnderline: { height: 3, width: '55%', borderRadius: 2, backgroundColor: 'transparent' },

  body: { padding: spacing.md, paddingBottom: spacing.xl * 2, gap: spacing.md },
  // The sticky tab bar scrolls over content, so it must be fully opaque.

  loadingBlock: { paddingVertical: spacing.xl, alignItems: 'center' },
  loadingText: { fontSize: typography.xs, color: colors.textMuted, marginTop: spacing.sm },
  noData: { fontSize: typography.sm, color: colors.textMuted, textAlign: 'center', paddingVertical: spacing.xl },

  section: { backgroundColor: colors.bgCard, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, padding: spacing.lg },
  sectionTitle: { fontSize: typography.sm, fontWeight: typography.black, color: colors.textPrimary, marginBottom: spacing.md, textTransform: 'uppercase', letterSpacing: 1 },
  subHead: { fontSize: typography.xs, fontWeight: typography.black, color: colors.textSecondary, marginBottom: spacing.sm, textTransform: 'uppercase', letterSpacing: 0.6 },
  subHeadSmall: { fontSize: 10, fontWeight: typography.black, color: colors.textSecondary, textTransform: 'uppercase', letterSpacing: 0.5 },
  hint: { fontSize: 10, color: colors.textMuted, fontStyle: 'italic' },
  twoCol: { flexDirection: 'row', gap: spacing.lg },

  motmCard: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.sm,
    backgroundColor: colors.bgCard, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border,
    padding: spacing.lg,
  },
  motmStar: { fontSize: 20, color: colors.warning },
  motmLabel: { fontSize: 9, color: colors.textMuted, fontWeight: typography.black, letterSpacing: 1 },
  motmName: { fontSize: typography.md, fontWeight: typography.bold, color: colors.textPrimary },
  motmTeam: { fontSize: typography.xs, color: colors.textMuted, fontWeight: typography.regular },

  teamRatings: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.md, marginTop: spacing.md },
  teamRatingLabel: { fontSize: 9, color: colors.textMuted, fontWeight: typography.bold, letterSpacing: 1 },
  ratingChip: { minWidth: 34, paddingHorizontal: 6, paddingVertical: 3, borderRadius: radius.sm, alignItems: 'center' },
  ratingChipText: { fontSize: typography.xs, fontWeight: typography.black, color: '#0B1220' },
  ratingChipSm: { minWidth: 28, paddingHorizontal: 5, paddingVertical: 2, borderRadius: radius.sm, alignItems: 'center' },
  ratingChipSmText: { fontSize: 9, fontWeight: typography.black, color: '#0B1220' },

  lineupTeam: { fontSize: typography.sm, fontWeight: typography.black, marginBottom: 4 },
  benchLabel: { fontSize: 9, color: colors.textMuted, fontWeight: typography.bold, textTransform: 'uppercase', letterSpacing: 1, marginTop: spacing.sm },

  topRatedItem: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, justifyContent: 'space-between' },
  topRatedName: { fontSize: 11, color: colors.textSecondary, flexShrink: 1 },

  table: { borderRadius: radius.md, overflow: 'hidden', borderWidth: 1, borderColor: colors.border },
  tableHead: { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.bgElevated, paddingVertical: 5, paddingHorizontal: spacing.sm, gap: 4 },
  tableRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 5, paddingHorizontal: spacing.sm, gap: 4, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
  thPos: { width: 18, fontSize: 9, color: colors.textMuted, fontWeight: typography.bold },
  thClub: { flexGrow: 1, flexShrink: 1, flexBasis: 'auto', fontSize: 9, color: colors.textMuted, fontWeight: typography.bold },
  thNum: { width: 22, fontSize: 9, color: colors.textMuted, fontWeight: typography.bold, textAlign: 'center' },
  thPts: { width: 26 },
  tdPos: { width: 18, fontSize: 10, color: colors.textMuted },
  tdClub: { flexGrow: 1, flexShrink: 1, flexBasis: 'auto', fontSize: 10, color: colors.textSecondary },
  tdNum: { width: 22, fontSize: 10, color: colors.textSecondary, textAlign: 'center' },
  tdPts: { width: 26, fontWeight: typography.black, color: colors.textPrimary },

  tieCard: { backgroundColor: colors.bgElevated, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, paddingVertical: 6, paddingHorizontal: spacing.sm },
  tieHead: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  tieTeam: { flex: 1, fontSize: 11, color: colors.textSecondary },
  tieScore: { fontSize: typography.xs, fontWeight: typography.black, minWidth: 44, textAlign: 'center' },
  tiePens: { fontSize: 8, color: colors.textMuted, fontWeight: typography.bold, textTransform: 'uppercase', letterSpacing: 0.5 },
  tieLegs: { marginTop: 4, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border, paddingTop: 2 },
  tieLeg: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingVertical: 2 },
  tieLegText: { flex: 1, fontSize: 10, color: colors.textMuted },
  bracketToggle: { alignSelf: 'flex-start', paddingVertical: 4 },
  bracketToggleText: { fontSize: 10, fontWeight: typography.black, textTransform: 'uppercase', letterSpacing: 0.5 },

  formBlock: { marginTop: spacing.sm, gap: 4 },
  formTeam: { fontSize: 10, fontWeight: typography.black, color: colors.textSecondary, textTransform: 'uppercase', letterSpacing: 0.5 },
  formItem: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingVertical: 2 },
  formPill: { width: 20, alignItems: 'center', borderRadius: radius.sm, borderWidth: 1, paddingVertical: 1 },
  formPillText: { fontSize: 9, fontWeight: typography.black },
  formText: { fontSize: 10, color: colors.textSecondary, flex: 1 },
  formChevron: { fontSize: typography.md, color: colors.textMuted, fontWeight: typography.bold },

  nextRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, backgroundColor: colors.bgElevated, borderRadius: radius.md, padding: spacing.sm },
  nextLabel: { fontSize: 9, color: colors.textMuted, textTransform: 'uppercase', letterSpacing: 0.5, fontWeight: typography.bold },
  nextTeams: { fontSize: typography.xs, color: colors.textSecondary },
  nextScore: { fontSize: typography.sm, fontWeight: typography.black },
  nextPending: { fontSize: 9, color: colors.textMuted, fontWeight: typography.bold, textTransform: 'uppercase', letterSpacing: 0.5 },

  sortRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 4 },
  sortChip: {
    paddingHorizontal: spacing.sm, paddingVertical: 3, borderRadius: radius.sm,
    borderWidth: 1, borderColor: colors.border, backgroundColor: colors.bgElevated,
  },
  sortChipText: { fontSize: 9, fontWeight: typography.black, color: colors.textMuted },
  psRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingVertical: 4, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
  // A colour bar rather than colour alone — which side a player is on stays
  // legible without relying on hue.
  psSide: { width: 3, height: 16, borderRadius: 2 },
  psPos: { width: 28, fontSize: 9, fontWeight: typography.black, color: colors.textMuted },
  psName: { flexGrow: 1, flexShrink: 1, flexBasis: 'auto', fontSize: 11, color: colors.textPrimary },
  psTeam: { width: 72, fontSize: 9, color: colors.textMuted, textAlign: 'right' },
  psValue: { minWidth: 92, fontSize: 11, fontWeight: typography.black, textAlign: 'right' },
})
