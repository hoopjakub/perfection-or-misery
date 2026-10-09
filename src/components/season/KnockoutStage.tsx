// One knockout view (centralisation step 5, C-06 / C-07). The classic
// Champions League, the World Cup and the full path all play their knockouts
// through `KnockoutPhaseView`: newest round on top, your tie live on the clock,
// the rest of the round after it, the bracket as it stands, the team of the
// round, the skip to the end of your run, the Deep Match final. The full path
// had its own copy of all of it (with its own "newest first" and scroll hold),
// and every fix had to be made twice.

import { t } from '@/i18n'
import { label } from '@/i18n/labels'
import React, { useEffect, useMemo, useRef, useState } from 'react'
import { View, ScrollView, StyleSheet } from 'react-native'
import { ROLES, space, border } from '@/theme'
import { EVERYDAY } from '@/lib/appearance'
import { KitScreen, KitText, RunHeader, Plate, SectionTag, PaneRow, Pane } from '@/components/kit'
import { ThumbBar, CloseRun, BackToLive } from './RunChrome'
import { StampLabel, TieCard, TieRow, tieVM, PressList, SegmentSwitch } from './SeasonParts'
import { setLivePress } from '@/lib/livePress'
import { openStory } from '@/lib/runNav'
import type { Story } from '@/engine/press'
import { RoundTeam } from './RoundTeam'
import { InfoBubble } from '@/components/InfoBubble'
import { BracketTree } from '@/components/BracketTree'
import { LiveMatch, periodsForTwoLegTie, type LivePeriod } from '@/components/LiveMatch'
import { liveBracket, liveProgress } from '@/lib/liveBracket'
import { useSizeClass } from '@/hooks/useSizeClass'
import { useIsFocused } from '@react-navigation/native'
import { BracketPreview } from '@/components/BracketPreview'
import { clTie, tieRequest, type MatchCtx } from '@/engine/stages'
import { openDeepMatch } from '@/lib/deepMatch'
import { appendKnockoutRounds } from '@/engine/match-context'
import type { CLKnockoutMatch, CLTeam, CLSeasonResult } from '@/engine/cl-sim'
import type { WCSeasonResult } from '@/engine/world-cup-sim'
import type { PenKick } from '@/engine/knockout-match'
import type { MatchScorers, RosterPlayer } from '@/types/stats'

// The screen's everyday ground (R3-04: it was named `nylon`, the dark ground's name, which it isn't).
const GR = ROLES[EVERYDAY]

export type KnockoutTie = {
  teamA: { clubId: string; clubName: string; isPlayer: boolean }
  teamB: { clubId: string; clubName: string; isPlayer: boolean }
  winner: { clubId: string; clubName: string; isPlayer: boolean }
  aGoals: number
  bGoals: number
  leg1?: { aGoals: number; bGoals: number }
  leg2?: { aGoals: number; bGoals: number }
  leg2ExtraTime?: { aGoals: number; bGoals: number }
  extraTime: boolean
  aPens?: number
  bPens?: number
  penKicksA?: PenKick[]
  penKicksB?: PenKick[]
  leg1Scorers?: MatchScorers   // CL two-leg
  leg2Scorers?: MatchScorers
  leg2ExtraTimeScorers?: MatchScorers
  scorers?: MatchScorers       // WC single match
  // Deep-stat seeds — needed so a tapped live tie can open the same match-stats
  // screen the result screens use (maintainer feedback: live ties need to stay
  // clickable, not just once the run finishes).
  leg1Seed?: number
  leg2Seed?: number
  seed?: number                // WC single match
  // §10.5 phase 4 — availability, so a tie tapped DURING the reveal regenerates
  // the same eleven the result screen will show.
  leg1Absent?: string[]
  leg2Absent?: string[]
  leg1StandIns?: RosterPlayer[]
  leg2StandIns?: RosterPlayer[]
  absent?: string[]            // WC single match
  standIns?: RosterPlayer[]
}
export type KnockoutRound = {
  round: string
  label: string
  ties: KnockoutTie[]
  autoDelay?: number  // ms before auto-advancing to next round (the classic and World Cup screens)
}

// Convert a KnockoutTie (WC single match OR CL two-legged) into LiveMatch periods.
export function liveePeriodsFromTie(tie: KnockoutTie, label: string): LivePeriod[] {
  // Two-legged CL tie: the shared builder. This screen kept its own older copy,
  // which only added extra time when someone scored in it — so a goalless extra
  // time vanished and leg 2 went straight to penalties (the maintainer, 24 Sept).
  // The shared one already had that fix; now there's only one.
  if (tie.leg1) return periodsForTwoLegTie(tie)
  // Single match (WC / final).
  return [{ label, homeId: tie.teamA.clubId, awayId: tie.teamB.clubId, fromMin: 0, toMin: tie.extraTime ? 120 : 90, scorers: tie.leg1Scorers ?? tie.scorers }]
}

// Build the pre-knockout bracket-preview props from a rounds array (the player's
// first knockout round + the road ahead).
export function bracketPreviewProps(rounds: KnockoutRound[]) {
  const startIdx = Math.max(0, rounds.findIndex(r => r.ties.some(t => t.teamA.isPlayer || t.teamB.isPlayer)))
  const first = rounds[startIdx]
  return {
    firstLabel: first?.label ?? 'Round',
    firstTies: (first?.ties ?? []).map(t => ({ teamA: t.teamA, teamB: t.teamB })),
    // Real tie counts per upcoming round (already simulated, just not shown yet)
    // — NOT halved from the previous round, since e.g. a playoff round feeds a
    // SAME-size Round of 16 once direct qualifiers join the playoff winners.
    road: rounds.slice(startIdx + 1).map(r => ({ label: r.label, count: r.ties.length })),
  }
}

// ── Knockout Phase View ────────────────────────────────────────────────────────
// C5 (docs/ui-overhaul/07c) on the everyday ground: your tie first, live on the clock; the
// rest of the round after it; going out is a stamped verdict, not a line; the
// primary button always names what's next.

export type KnockoutPhaseViewProps = {
  rounds: KnockoutRound[]
  visibleCount: number
  competitionLabel: string
  colourway: string[]
  onAbandon: () => void
  onFinish: () => void
  onSkipToRound: (idx: number) => void
  /** P8-91: the season the knockout belongs to, for the bracket's dates. */
  yearStart: number
  onLiveDone?: (roundKey: string) => void  // fired when the player's live match finishes
  /** P8-63: tells the screen you've scrolled away from the live round, so it holds the next one. */
  onAwayChange?: (away: boolean) => void
  /** P8-57, match by match: the panel's split on a tie, shown above your live one. */
  panelLine?: (a: { clubId: string; clubName: string }, b: { clubId: string; clubName: string }) => string | null
  liveDone?: Record<string, boolean>       // which rounds' live matches have finished
  // Tap a settled tie (yours or anyone else's) to open its deep-stats sheet —
  // ties stay clickable during simulation, the same as once the run is done.
  onTiePress?: (tie: KnockoutTie, roundLabel: string) => void
  // §7 — supplied ONLY when the player's own side reached the final. The
  // player's final never plays out inline: it's the Deep Match's reason to exist.
  deepFinal?: {
    watched: boolean
    onSeeLineups: () => void
  }
  /** The full path's road under the header (its five stages). */
  road?: { names: readonly string[]; current: number }
  /** F-04: the squads, for the team of the round under each settled round. */
  pools?: { poolByClub: Map<string, RosterPlayer[]>; ctx: { playerClubId?: string; benchSize?: number } }
  /** F-01: the press so far, under the rounds. */
  /** The run's press so far: a tab on a phone, a pane on a wide window (P9.75-04). */
  press?: { count: number; node: React.ReactNode }
}

const OUT_IN: Record<string, string> = {
  playoff: t('sim.outPlayoff'), r32: t('sim.outR32'), r16: t('sim.outR16'),
  qf: t('sim.outQf'), sf: t('sim.outSf'), final: t('sim.runnersUp'),
}

// How far down the knockouts page counts as away from the live round.
const AWAY_PX = 320

export function KnockoutPhaseView({ rounds, visibleCount, competitionLabel, colourway, onAbandon, onFinish, onSkipToRound, yearStart, onLiveDone, onAwayChange, panelLine, liveDone = {}, onTiePress, deepFinal, road, pools, press }: KnockoutPhaseViewProps) {
  const allVisible = visibleCount >= rounds.length
  const nextRound = rounds[visibleCount]

  // The final is the round keyed 'final' — not simply the last one, because the
  // World Cup plays its third-place match after the semis and before it.
  const finalIdx = rounds.findIndex(r => r.round === 'final')
  const atFinal = finalIdx >= 0 && visibleCount - 1 >= finalIdx
  // P8-94: a skip to the end of YOUR run, not to the final. The old "Skip to
  // the final" was only offered when you were going to reach it, which gave
  // the result away. Now it plays every round up to the last one you're in
  // and stops there, settled: where you went out (or your final, still to be
  // watched in the Deep Match). Once you're out, a plain skip reveals the rest.
  const youAreInAt = (i: number) => !!rounds[i]?.ties.some(t => t.teamA.isPlayer || t.teamB.isPlayer)
  const endOfRun = rounds.reduce((k, _r, i) => (youAreInAt(i) ? i : k), -1)
  // The final is reached but not yet watched — nothing else may be offered
  // until it has been, or the payoff is trivially skippable.
  const awaitingDeepFinal = !!deepFinal && atFinal && !deepFinal.watched
  const youAreIn = (r?: KnockoutRound) => !!r?.ties.some(t => t.teamA.isPlayer || t.teamB.isPlayer)

  // P8-63: the newest round sits on top, so the one being played is where you
  // already are — no scrolling down after it. When a round opens, the page
  // goes back up to it; if you've scrolled down through earlier rounds, a tag
  // takes you back, and your live match waits while it's out of sight.
  const scrollRef = useRef<ScrollView>(null)
  const [scrolledAway, setScrolledAway] = useState(false)
  // F-11: on a wide window the bracket stands beside the rounds. The bracket
  // is as it stands, with the live round's ties at the same moment as yours,
  // so it can't spoil your match.
  const wide = useSizeClass() === 'expanded'
  // P9.75-04 (R3-05): on a phone the knockouts have the table stages' tabs,
  // Rounds · Bracket · Press. The press sat under every round ("why do I have
  // to scroll all the way down"), and the bracket behind a button. The rounds
  // stay mounted under the other tabs, so your live match keeps its place,
  // and it waits while you're on another tab, as it does when you scroll away.
  const [tab, setTab] = useState<'rounds' | 'bracket' | 'press'>('rounds')
  const offRounds = !wide && tab !== 'rounds'
  const away = scrolledAway || offRounds
  useEffect(() => { onAwayChange?.(away) }, [away])
  const bracketNow = () => {
    const current = rounds[visibleCount - 1]
    const liveOpen = !!current && !!current.ties.find(t => t.teamA.isPlayer || t.teamB.isPlayer) && !liveDone[current.round]
    const b = liveBracket(rounds, { visible: visibleCount, liveOpen, progress: liveProgress() ?? 0, yearStart })
    const you = rounds.flatMap(r => r.ties).flatMap(t => [t.teamA, t.teamB]).find(x => x.isPlayer)?.clubId
    return { b, liveOpen, you }
  }
  useEffect(() => { scrollRef.current?.scrollTo({ y: 0, animated: true }) }, [visibleCount])

  return (
    <View style={[styles.container, { backgroundColor: GR.bg }]}>
      <KitScreen ground={EVERYDAY} width={wide ? 'wide' : 'column'} contentStyle={{ paddingBottom: space[4] }} scrollRef={scrollRef} scrollEventThrottle={64}
        onScroll={e => setScrolledAway(e.nativeEvent.contentOffset.y > AWAY_PX)}>
        <RunHeader roles={GR} stage={6} colourway={colourway} back={false} road={road} right={<CloseRun onPress={onAbandon} />} />
        <KitText t="tag" color={GR.textMuted}>{t('sim.knockouts', { comp: competitionLabel })}</KitText>
        {!wide && (
          <View style={styles.tabs}>
            <SegmentSwitch<'rounds' | 'bracket' | 'press'> roles={GR} value={tab} onChange={setTab}
              options={[
                { id: 'rounds', label: t('sim.tabRounds') },
                { id: 'bracket', label: t('sim.tabBracket') },
                ...(press ? [{ id: 'press' as const, label: t('season.tabPress'), count: press.count }] : []),
              ]} />
          </View>
        )}
        {/* P8-91: the whole bracket, mid-round: results so far, and every tie of
            this round as it stands at the same moment as yours. */}
        {!wide && tab === 'bracket' && (() => {
          const { b, liveOpen, you } = bracketNow()
          return (
            <View style={styles.tabBody}>
              <KitText t="tag" color={GR.textMuted}>{liveOpen ? t('sim.asTheyStand', { comp: competitionLabel }) : competitionLabel}</KitText>
              <BracketTree columns={b.columns} third={b.third} playerClubId={you} />
            </View>
          )
        })()}
        {!wide && tab === 'press' && press && <View style={styles.tabBody}>{press.node}</View>}
        <PaneRow wide={wide}>
        <Pane wide={wide} title={competitionLabel} flex={1}>
        <View style={offRounds ? styles.hidden : undefined}>

        {!allVisible && visibleCount > 0 && nextRound && (
          <KitText t="body" color={GR.textMuted} style={{ paddingVertical: space[3] }}>
            {youAreIn(nextRound) ? t('sim.yoursNext', { round: label(nextRound.label).toLowerCase() }) : t('sim.nextRound', { round: label(nextRound.label).toLowerCase() })}
          </KitText>
        )}

        {rounds.slice(0, visibleCount).map((round, roundIdx) => ({ round, roundIdx })).reverse().map(({ round, roundIdx }) => {
          const isCurrent = roundIdx === visibleCount - 1
          const playerTie = round.ties.find(t => t.teamA.isPlayer || t.teamB.isPlayer)
          // On the live round, hold back the other ties until YOUR match is done.
          const settled = !isCurrent || !playerTie || !!liveDone[round.round]
          const otherTies = round.ties.filter(t => !t.teamA.isPlayer && !t.teamB.isPlayer)
          const isDeepFinal = !!deepFinal && round.round === 'final'
          const lost = playerTie && settled && !playerTie.winner.isPlayer && !(isDeepFinal && !deepFinal!.watched)
          const thirdWon = !!playerTie && round.round === 'third' && playerTie.winner.isPlayer
          const fate = playerTie && round.round === 'third'
            ? (thirdWon ? t('sim.thirdPlace') : t('sim.fourthPlace'))
            : lost ? (OUT_IN[round.round] ?? t('sim.outIn', { round: label(round.label).toLowerCase() })) : null

          return (
            <View key={round.round} style={styles.koKitRound}>
              <View style={styles.headRow}>
                <SectionTag roles={GR}>{label(round.label)}</SectionTag>
                {round.round === 'playoff' && <InfoBubble topic="knockout_playoff" size={15} />}
              </View>

              {playerTie && isCurrent && !isDeepFinal && !liveDone[round.round] && panelLine?.(playerTie.teamA, playerTie.teamB) && (
                <KitText t="body" color={GR.textMuted}>{panelLine(playerTie.teamA, playerTie.teamB)}</KitText>
              )}
              {playerTie && isCurrent && !isDeepFinal && !liveDone[round.round] && (
                <LiveMatch
                  key={round.round}
                  teamA={playerTie.teamA} teamB={playerTie.teamB}
                  periods={liveePeriodsFromTie(playerTie, round.label)}
                  pens={playerTie.aPens !== undefined ? { a: playerTie.aPens, b: playerTie.bPens ?? 0, kicksA: playerTie.penKicksA, kicksB: playerTie.penKicksB } : null}
                  aggregate={!!playerTie.leg1}
                  onDone={() => onLiveDone?.(round.round)}
                  hold={away}
                />
              )}

              {/* The final, reached but not yet watched: the scoreline is what
                  the Deep Match exists to reveal, so it isn't printed here. */}
              {playerTie && isDeepFinal && !deepFinal!.watched && (
                <View style={[styles.koKitFinal, { borderColor: GR.line, backgroundColor: GR.surface }]}>
                  <KitText t="superM" color={GR.text}>{t('sim.theFinal')}</KitText>
                  <KitText t="title" color={GR.text}>{t('sim.vs', { a: playerTie.teamA.clubName, b: playerTie.teamB.clubName })}</KitText>
                  <KitText t="body" color={GR.textMuted}>{t('sim.finalNote')}</KitText>
                </View>
              )}

              {playerTie && settled && !(isDeepFinal && !deepFinal!.watched) && (
                <TieCard roles={GR} label={round.label} tone={playerTie.winner.isPlayer ? 'win' : 'loss'}
                  tie={{ ...liveTieVM(playerTie, round.round, onTiePress ? () => onTiePress(playerTie, round.label) : undefined),
                         isPlayerTie: false, note: playerTie.winner.isPlayer ? t('sim.through') : t('sim.outTag') }} />
              )}
              {fate && <StampLabel roles={GR} text={fate} good={thirdWon} />}

              {settled && otherTies.map((tie, i) => (
                <TieRow key={i} roles={GR} tie={liveTieVM(tie, round.round, onTiePress ? () => onTiePress(tie, round.label) : undefined)} />
              ))}
              {/* F-04: the round's best eleven, from every leg it played, once
                  it's settled (and never over a final still to be watched). */}
              {pools && settled && !(isDeepFinal && !deepFinal!.watched) && (
                <RoundTeam roles={GR} roundKey={`ko-${round.round}`} label={t('sim.teamOfRound', { round: label(round.label).toLowerCase() })}
                  poolByClub={pools.poolByClub} ctx={pools.ctx}
                  fixtures={appendKnockoutRounds([], [{ label: round.label, ties: round.ties.map(x => knockoutTieToCLMatch(x, round.round)) }])
                    .filter(m => m.homeGoals !== undefined && m.awayGoals !== undefined)
                    .map(m => ({
                      homeClubId: m.homeClubId, awayClubId: m.awayClubId, homeClubName: m.homeClubName, awayClubName: m.awayClubName,
                      homeGoals: m.homeGoals!, awayGoals: m.awayGoals!, scorers: m.scorers, seed: m.seed,
                      absent: m.absent, standIns: m.standIns,
                    }))} />
              )}
            </View>
          )
        })}
        </View>
        </Pane>
        {wide && (() => {
          const { b, you } = bracketNow()
          return <Pane wide title={t('sim.theBracket')} flex={1.3}><BracketTree columns={b.columns} third={b.third} playerClubId={you} height={560} /></Pane>
        })()}
        {wide && press && <Pane wide title={t('season.tabPress')} flex={0.8}>{press.node}</Pane>}
        </PaneRow>
      </KitScreen>
      {scrolledAway && (
        <View style={styles.toNewest} pointerEvents="box-none">
          <BackToLive md={0} label={t('sim.backNewest')} onPress={() => scrollRef.current?.scrollTo({ y: 0, animated: true })} />
        </View>
      )}

      <ThumbBar>
        {!awaitingDeepFinal && endOfRun > visibleCount - 1 && (
          <Plate label={t('sim.skipEndRun')} icon="skip" variant="secondary" roles={GR} onPress={() => onSkipToRound(endOfRun)} />
        )}
        {!awaitingDeepFinal && endOfRun <= visibleCount - 1 && !allVisible && (
          <Plate label={t('sim.skipEnd')} icon="skip" variant="secondary" roles={GR} onPress={() => onSkipToRound(rounds.length - 1)} />
        )}
        {awaitingDeepFinal && deepFinal ? (
          <Plate label={t('sim.lineups')} icon="forward" roles={GR} onPress={deepFinal.onSeeLineups} />
        ) : allVisible ? (
          <Plate label={t('sim.verdict')} icon="forward" roles={GR} onPress={onFinish} />
        ) : null}
      </ThumbBar>
    </View>
  )
}

// The rounds that are over: the revealed ones, minus the newest while your
// match in it is still being played. A match sheet opened mid-round used to
// list that round's ties with their final scores — the result before it
// happened. The same goes for tapping a tie of the round being played.
export function playedRounds(rounds: KnockoutRound[], visible: number, liveDone: Record<string, boolean>): KnockoutRound[] {
  const shown = rounds.slice(0, visible)
  const last = shown[shown.length - 1]
  const live = !!last && last.ties.some(t => t.teamA.isPlayer || t.teamB.isPlayer) && !liveDone[last.round]
  return live ? shown.slice(0, -1) : shown
}

// P8-94: every round up to `idx` marked as played, so a skip lands on a
// settled round (the live match of the round skipped to isn't replayed).
export function settledThrough(rounds: KnockoutRound[], idx: number): Record<string, boolean> {
  return Object.fromEntries(rounds.slice(0, idx + 1).map(r => [r.round, true]))
}

// A live tie's row: through the engine's one tie model, with its scorers.
export const liveTieVM = (tie: KnockoutTie, round: string, onPress?: () => void) =>
  tieVM(clTie(knockoutTieToCLMatch(tie, round)), { onPress, withScorers: true })

// A live tie in the knockouts' own shape, so it goes through the same
// `tieRequest` (src/engine/stages.ts) as every result screen's bracket: one
// sheet, both legs a tap apart. Only the clubs, goals, legs, scorers, seeds and
// availability are read; the CLTeam fields it doesn't use (ovr, form, stats,
// pot) are harmless placeholders.
export function knockoutTieToCLMatch(tie: KnockoutTie, round: string): CLKnockoutMatch {
  const blankStats = { played: 0, won: 0, drawn: 0, lost: 0, goalsFor: 0, goalsAgainst: 0, points: 0 }
  const fill = (t: KnockoutTie['teamA']): CLTeam => ({ ...t, ovr: 0, form: 0, stats: blankStats, pot: 4 })
  return {
    round,
    teamA: fill(tie.teamA), teamB: fill(tie.teamB), winner: fill(tie.winner),
    aGoals: tie.aGoals, bGoals: tie.bGoals,
    leg1: tie.leg1, leg2: tie.leg2, leg2ExtraTime: tie.leg2ExtraTime,
    extraTime: tie.extraTime, aPens: tie.aPens, bPens: tie.bPens,
    // A World Cup tie is ONE match, so it stores its sheet on the tie itself
    // rather than under a leg. Falling back to those fields lets a WC bracket
    // through this adapter with its scorers and seed intact — without it the
    // knockout half of the WC timeline had no stats to open. Two-legged ties
    // never set them, so the fallback can't shadow real leg data.
    leg1Scorers: tie.leg1Scorers ?? tie.scorers, leg2Scorers: tie.leg2Scorers, leg2ExtraTimeScorers: tie.leg2ExtraTimeScorers,
    leg1Seed: tie.leg1Seed ?? tie.seed, leg2Seed: tie.leg2Seed,
    leg1Absent: tie.leg1Absent ?? tie.absent, leg2Absent: tie.leg2Absent,
    leg1StandIns: tie.leg1StandIns ?? tie.standIns, leg2StandIns: tie.leg2StandIns,
    penKicksA: tie.penKicksA, penKicksB: tie.penKicksB,
  }
}

const styles = StyleSheet.create({
  tabs: { marginTop: space[3] },
  tabBody: { marginTop: space[3], gap: space[2] },
  hidden: { display: 'none' },
  container: { flex: 1 },
  toNewest: { position: 'absolute', left: space[4], right: space[4], bottom: 120, alignItems: 'center' },
  koKitRound: { gap: space[2], marginTop: space[3] },
  koKitFinal: { borderWidth: border.plate, padding: space[3], gap: space[2] },
  headRow: { flexDirection: 'row', alignItems: 'center', gap: space[2] },
})

/**
 * A knockout stage, whole (centralisation step 4b / C-07): the bracket preview
 * before the first ball, then the rounds revealed one at a time, each waiting
 * for your live match and holding while you've scrolled away or another screen
 * is on top. Each screen used to keep this state and its timer itself (three
 * copies, two paces). A screen hands over the rounds; a tapped tie comes back
 * with the rounds already played, so its sheet's timeline holds nothing you
 * haven't reached.
 */
export function KnockoutStage({ rounds, previewHeader, onTiePress, deepMatch, pressFor, ...view }: Omit<KnockoutPhaseViewProps,
  'visibleCount' | 'onSkipToRound' | 'onLiveDone' | 'onAwayChange' | 'liveDone' | 'onTiePress' | 'deepFinal' | 'press'> & {
  /** Above the preview (the full path's road). */
  previewHeader?: React.ReactNode
  onTiePress?: (tie: KnockoutTie, roundLabel: string, played: KnockoutRound[]) => void
  /**
   * §7: your final is the Deep Match, never played inline. Each screen opened
   * it with its own copy of the same twenty lines; the stage finds your final
   * and opens it. `onFinished` commits the run; `watched` is set by the screen
   * (the Deep Match's own onFinished) so the final settles into a normal row.
   */
  deepMatch?: { watched: boolean; ctx: MatchCtx; accent: string; resultRoute: string; onFinished: () => void }
  /**
   * F-01: the run's press up to the knockouts played so far. Given the played
   * rounds, the screen returns the whole run's stories (its earlier stages
   * too); they show under the rounds, newest first, and open their pages.
   */
  pressFor?: (played: KnockoutRound[]) => Story[]
}) {
  const finalRound = rounds.find(r => r.round === 'final')
  const yourFinal = finalRound?.ties.find(x => x.teamA.isPlayer || x.teamB.isPlayer) ?? null
  const openFinal = () => {
    if (!deepMatch || !finalRound || !yourFinal) return
    const detail = tieRequest(knockoutTieToCLMatch(yourFinal, finalRound.round), finalRound.label, deepMatch.ctx)
    if (!detail) return
    openDeepMatch({
      detail, competitionLabel: view.competitionLabel, roundLabel: finalRound.label, accent: deepMatch.accent,
      playerWon: yourFinal.winner.isPlayer,
      playerClubName: (yourFinal.teamA.isPlayer ? yourFinal.teamA : yourFinal.teamB).clubName,
      onFinished: deepMatch.onFinished, resultRoute: deepMatch.resultRoute,
    })
  }
  const deepFinal = deepMatch && yourFinal ? { watched: deepMatch.watched, onSeeLineups: openFinal } : undefined
  const [visible, setVisible] = useState(0)          // 0 = the preview
  const [liveDone, setLiveDone] = useState<Record<string, boolean>>({})
  const [away, setAway] = useState(false)
  // Held while another screen is on top too (P8-63, the maintainer 26 Sept:
  // See the bracket let the rounds play on underneath).
  const focused = useIsFocused()
  // The next round opens once the current one is settled: after your live
  // match (a short beat), or on the round's own delay when you're not in it.
  useEffect(() => {
    if (visible < 1 || visible >= rounds.length || away || !focused) return
    const current = rounds[visible - 1]
    const yours = current.ties.some(x => x.teamA.isPlayer || x.teamB.isPlayer)
    if (yours && !liveDone[current.round]) return
    const timer = setTimeout(() => setVisible(v => v + 1), yours ? 1600 : (current.autoDelay ?? 3000))
    return () => clearTimeout(timer)
  }, [visible, rounds, liveDone, away, focused])

  const played = playedRounds(rounds, visible, liveDone)
  const stories = useMemo(() => (pressFor ? pressFor(played) : []),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [pressFor ? played.length : 0, rounds.length])
  useEffect(() => { if (stories.length) setLivePress(stories) }, [stories])
  const pressNode = stories.length
    ? { count: stories.length, node: <PressList roles={GR} stories={stories} empty="" onOpen={id => openStory(id)} /> }
    : undefined

  if (visible === 0 && rounds.length > 0) {
    return (
      <View style={[styles.container, { backgroundColor: GR.bg }]}>
        {previewHeader}
        <BracketPreview {...bracketPreviewProps(rounds)} onStart={() => setVisible(1)} />
      </View>
    )
  }
  return (
    <KnockoutPhaseView {...view} rounds={rounds} visibleCount={visible} liveDone={liveDone} deepFinal={deepFinal} press={pressNode}
      onLiveDone={k => setLiveDone(d => ({ ...d, [k]: true }))}
      onAwayChange={setAway}
      // P8-94: a skip lands on a settled round; its live match isn't replayed.
      onSkipToRound={idx => { setLiveDone(d => ({ ...d, ...settledThrough(rounds, idx) })); setVisible(idx + 1) }}
      onTiePress={onTiePress ? (tie, label) => onTiePress(tie, label, playedRounds(rounds, visible, liveDone)) : undefined} />
  )
}

// ── Rounds from the engine's results ─────────────────────────────────────────
// The knockouts as the stage plays them. The Champions League's matches are
// already in the stage's shape; the classic screen copied them field by field
// and the full path built its list a third way. Each screen keeps its own
// round names (they feed the translations and the match dates).
const CL_ROUND_ORDER = ['playoff', 'r16', 'qf', 'sf', 'final'] as const

export function clKnockoutRounds(
  result: Pick<CLSeasonResult, 'playoffRound' | 'r16' | 'qf' | 'sf' | 'final'>,
  labels: Record<string, string>, delays: Record<string, number> = {},
): KnockoutRound[] {
  const by: Record<string, CLKnockoutMatch[]> = {
    playoff: result.playoffRound, r16: result.r16, qf: result.qf, sf: result.sf, final: result.final ? [result.final] : [],
  }
  return CL_ROUND_ORDER.filter(k => by[k].length > 0).map(k => ({ round: k, label: labels[k] ?? k, autoDelay: delays[k], ties: by[k] }))
}

/** The World Cup's: one match per tie, its sheet stored on the tie. */
export function wcKnockoutRounds(result: Pick<WCSeasonResult, 'knockoutRounds'>, labels: Record<string, string>, delays: Record<string, number> = {}): KnockoutRound[] {
  return result.knockoutRounds.map(r => ({
    round: r.round, label: labels[r.round] ?? r.round, autoDelay: delays[r.round],
    ties: r.matches.map((m): KnockoutTie => ({
      teamA: m.teamA, teamB: m.teamB, winner: m.winner,
      aGoals: m.result.homeGoals, bGoals: m.result.awayGoals, extraTime: m.result.extraTime,
      aPens: m.result.homePens ?? undefined, bPens: m.result.awayPens ?? undefined,
      penKicksA: m.penKicksA, penKicksB: m.penKicksB,
      scorers: m.scorers, seed: m.seed, absent: m.absent, standIns: m.standIns,
    })),
  }))
}
