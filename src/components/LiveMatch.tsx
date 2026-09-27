import React, { useEffect, useRef, useState } from 'react'
import { setLiveProgress } from '@/lib/liveBracket'
import { useIsFocused } from '@react-navigation/native'
import { EventMark } from '@/components/kit'
import { View, StyleSheet, Pressable } from 'react-native'
import Animated, { FadeInLeft, FadeInRight } from 'react-native-reanimated'
import { ROLES, space, border } from '@/theme'
import { KitText, Tag, Icon, Stripe, TeamMark } from '@/components/kit'
import { summariseScorers } from '@/engine/run-stats'
import type { MatchScorers } from '@/types/stats'
import type { PenKick } from '@/engine/knockout-match'

// Your match under floodlights (docs/ui-overhaul/07c C5): the scoreline as a
// super, the round and clock in the tag mono, events sliding in from their
// side, the aggregate under the score, penalties as a row of tags. Always
// nylon: it's live play.
const roles = ROLES.nylon

// ── Public shapes ───────────────────────────────────────────────────────────
export type LiveTeam = { clubId: string; clubName: string }

// A sending-off shown live in the feed (reds only — yellows stay in the
// post-match detail). Minutes are clock minutes within the period.
export type LiveRedCard = { minute: number; plus?: number; isHome: boolean; player: string }

// One "period" of football to play through on the clock (a leg, or extra time).
export type LivePeriod = {
  label: string          // 'Leg 1', 'Leg 2', 'Extra Time', 'Final'…
  homeId: string         // who's at HOME for this period
  awayId: string
  fromMin: number        // clock start (0 for a leg, 90 for ET)
  toMin: number          // clock end (90, or 120 for ET)
  scorers?: MatchScorers // home/away goal events (minutes) for this period
  redCards?: LiveRedCard[] // sending-offs revealed on the clock, home/away by isHome
}

export type LivePens = { a: number; b: number; kicksA?: PenKick[]; kicksB?: PenKick[] }

// isHome drives ALL on-screen left/right placement (score row, live feed, prior
// legs) — home is always displayed on the left, away always on the right,
// regardless of which of teamA/teamB is currently hosting. sideIsA is kept
// separately ONLY for the cross-leg aggregate tally, which must track a fixed
// team identity rather than a home/away side that flips between legs.
type Goal = {
  min: number; plus?: number; isHome: boolean; sideIsA: boolean; scorer: string; isBench?: boolean
  isOg?: boolean; isPen?: boolean   // §9 — flavour markers for the live feed
}

function goalsForPeriod(p: LivePeriod, teamAId: string): Goal[] {
  const out: Goal[] = []
  const add = (evs: MatchScorers['home'] | undefined, isHome: boolean, sideIsA: boolean) => {
    for (const e of evs ?? []) out.push({
      min: e.minute, plus: e.plus, isHome, sideIsA,
      scorer: lastName(e.scorerName), isBench: e.scorerIsBench,
      isOg: e.ownGoal, isPen: e.penalty,
    })
  }
  add(p.scorers?.home, true, p.homeId === teamAId)
  add(p.scorers?.away, false, p.awayId === teamAId)
  return out.sort((x, y) => (x.min + (x.plus ?? 0) / 100) - (y.min + (y.plus ?? 0) / 100))
}

const lastName = (n: string) => n.split(' ').slice(-1)[0]

// ── The live match/tie player ───────────────────────────────────────────────
// P8-137: a minute of football on the live clock, the same on every device.
// It was 26 ms, which a PC kept to and a phone didn't (its render time added to
// every minute, about doubling it). Wall-clock pacing makes every device keep
// to this number, so it's set near the phone's real pace, as the maintainer
// asked: slower on a PC than before, never faster than the phone. 42 ms was
// still too quick on a PC (27 Sept), and the speed setting never reached the
// clock at all; 60 ms is about 5.4 s a match plus the beats on goals, near a
// phone's old pace, and a screen with a speed setting passes its own
// (LIVE_MS_PER_MIN). The dev log line at full time gives the real duration.
export const MS_PER_MIN = 60
/** The live clock for each speed setting (P8-137): the setting means the same on every device. */
export const LIVE_MS_PER_MIN = { slow: 90, normal: 60, fast: 35 } as const

// Plays each period on a fast clock, revealing goals as the minute passes and
// updating the running aggregate. For a single match pass one period; for a
// two-legged tie pass leg1, leg2 (+ optional ET). Calls onDone when finished.
export function LiveMatch({
  teamA, teamB, periods, pens, aggregate = false, msPerMin = MS_PER_MIN, onDone, hold = false,
}: {
  teamA: LiveTeam
  teamB: LiveTeam
  periods: LivePeriod[]
  pens?: LivePens | null
  aggregate?: boolean        // show a running aggregate (two-legged ties)
  msPerMin?: number
  accent?: string          // no longer drawn; kept so callers needn't change
  onDone?: () => void
  /** P8-63: held from outside — the match is out of view (you scrolled away),
   *  so it waits for you instead of playing on unseen. */
  hold?: boolean
}) {
  const [periodIdx, setPeriodIdx] = useState(0)
  const [clock, setClock] = useState(periods[0]?.fromMin ?? 0)
  const [aggA, setAggA] = useState(0)       // running aggregate for teamA (fixed identity, cross-leg)
  const [aggB, setAggB] = useState(0)
  const [legHome, setLegHome] = useState(0) // current period's HOME-side score
  const [legAway, setLegAway] = useState(0) // current period's AWAY-side score
  const [feed, setFeed] = useState<FeedLine[]>([])
  const [showPens, setShowPens] = useState(false)
  const [penTick, setPenTick] = useState(0)     // number of shootout kicks revealed so far
  const [userPaused, setPaused] = useState(false)   // stop-time: freezes the clock + pen reveal
  // P8-91: leaving the live screen (the bracket, a match sheet) pauses the
  // match; it carries on when you come back.
  const focused = useIsFocused()
  const paused = userPaused || hold || !focused
  // P8-63: a goal or a red card holds the clock for a beat, the way a broadcast
  // lingers on the moment, instead of the next minute ticking straight past it.
  const BIG_MOMENT_MS = 900
  // P8-137: the clock keeps wall time. Each tick used to wait `msPerMin` AFTER
  // the render the last one caused, so a phone's slower render added to every
  // minute and a PC played the same match about twice as fast. Now each tick
  // works out when it was due and, when it's late, moves on by as many minutes
  // as have passed: the same pace on every device.
  const dueAt = useRef(Date.now())
  const startedAt = useRef(Date.now())
  const beat = useRef(false)
  const doneRef = useRef(false)
  // finish() is called from inside an already-fired setTimeout, so a pause
  // click can't cancel it via the usual effect-cleanup path — check the
  // latest paused value at fire time so a pause during that final ~1s window
  // still holds (matches the freeze everywhere else in this component).
  const pausedRef = useRef(paused)
  useEffect(() => { pausedRef.current = paused }, [paused])

  const totalKicks = (pens?.kicksA?.length ?? 0) + (pens?.kicksB?.length ?? 0)

  // P8-91: how far through the tie the clock is (0…1), for the bracket that
  // shows every other tie's score at the same moment (src/lib/liveBracket.ts).
  useEffect(() => {
    const p = periods[periodIdx]
    if (!p) return
    const within = Math.min(1, Math.max(0, (clock - p.fromMin) / Math.max(1, p.toMin - p.fromMin)))
    setLiveProgress(showPens ? 1 : (periodIdx + within) / periods.length)
  }, [clock, periodIdx, showPens])
  useEffect(() => () => setLiveProgress(null), [])

  const goalsRef = useRef<Goal[]>([])
  const goalCursor = useRef(0)
  const cardsRef = useRef<LiveRedCard[]>([])
  const cardCursor = useRef(0)

  // Start / restart a period. Clearing `feed` here is the key bit — otherwise
  // the previous leg's goal ticker lingers and reads as if it happened in the
  // leg that's currently live (its minutes don't match the new leg's clock).
  useEffect(() => {
    const p = periods[periodIdx]
    if (!p) return
    goalsRef.current = goalsForPeriod(p, teamA.clubId)
    goalCursor.current = 0
    cardsRef.current = [...(p.redCards ?? [])].sort((a, b) => (a.minute + (a.plus ?? 0) / 100) - (b.minute + (b.plus ?? 0) / 100))
    cardCursor.current = 0
    setClock(p.fromMin)
    setLegHome(0); setLegAway(0)
    setFeed([])
  }, [periodIdx])

  // The clock's wall time restarts with each period and after a pause, so
  // coming back from a pause never fast-forwards through what you didn't see.
  // It has to run BEFORE the tick below (effects run in order): after it, the
  // tick read the time from before the pause, took the whole pause as lateness
  // and jumped the clock forward by it (the maintainer, 27 Sept: pausing "does
  // nothing, the time then just advances").
  useEffect(() => { dueAt.current = Date.now() }, [periodIdx, paused])

  // The clock tick. While paused nothing advances — the match freezes exactly
  // where it is (mid-period, between periods, or mid-shootout) until resumed.
  useEffect(() => {
    const p = periods[periodIdx]
    if (!p || paused) return
    if (clock >= p.toMin) {
      // period finished — advance or wrap up
      const t = setTimeout(() => {
        if (periodIdx < periods.length - 1) {
          setPeriodIdx(i => i + 1)
        } else if (pens && totalKicks > 0) {
          setShowPens(true)   // pen shootout animates kick-by-kick (see effect below)
        } else if (pens) {
          setShowPens(true)
          finish(1200)
        } else {
          finish(600)
        }
      }, 500)
      return () => clearTimeout(t)
    }
    const wait = beat.current ? msPerMin + BIG_MOMENT_MS : msPerMin
    beat.current = false
    const due = dueAt.current + wait
    const t = setTimeout(() => {
      // Late (a slow render): the minutes that have passed go by at once.
      const late = Math.max(0, Math.floor((Date.now() - due) / msPerMin))
      dueAt.current = due + late * msPerMin
      const next = Math.min(p.toMin, clock + 1 + late)
      // reveal any goals at/under the new minute
      while (goalCursor.current < goalsRef.current.length && goalsRef.current[goalCursor.current].min <= next) {
        const g = goalsRef.current[goalCursor.current]; goalCursor.current++
        if (g.isHome) setLegHome(v => v + 1); else setLegAway(v => v + 1)
        if (g.sideIsA) setAggA(v => v + 1); else setAggB(v => v + 1)
        const mm = `${g.min}${g.plus ? `+${g.plus}` : ''}'`
        // §9 — an own goal shows on the side it counts FOR, so it needs its own
        // icon and an explicit (OG) tag or it reads as the wrong man scoring.
        const kind = g.isOg ? 'OG' : g.isPen ? 'PEN' : 'GOAL'
        const id = `g${periodIdx}-${goalCursor.current}`
        setFeed(f => [{ id, kind, text: `${g.scorer} ${mm}`, isHome: g.isHome, isBench: g.isOg ? false : g.isBench } as FeedLine, ...f].slice(0, 6))
        beat.current = true
      }
      // reveal any red cards at/under the new minute (down to 10 men)
      while (cardCursor.current < cardsRef.current.length && cardsRef.current[cardCursor.current].minute <= next) {
        const c = cardsRef.current[cardCursor.current]; cardCursor.current++
        const mm = `${c.minute}${c.plus ? `+${c.plus}` : ''}'`
        const id = `r${periodIdx}-${cardCursor.current}`
        setFeed(f => [{ id, kind: 'RED', text: `${lastName(c.player)} ${mm}`, isHome: c.isHome } as FeedLine, ...f].slice(0, 6))
        beat.current = true
      }
      setClock(next)
    }, Math.max(0, due - Date.now()))
    return () => clearTimeout(t)
  }, [clock, periodIdx, paused])

  function finish(delay: number) {
    if (doneRef.current) return
    doneRef.current = true
    if (__DEV__) console.log(`[live] ${teamA.clubName} v ${teamB.clubName}: ${((Date.now() - startedAt.current) / 1000).toFixed(1)} s, ${msPerMin} ms a minute`)
    const fire = () => {
      if (pausedRef.current) { setTimeout(fire, 200); return }   // still frozen — keep waiting
      onDone?.()
    }
    setTimeout(fire, delay)
  }

  // Reveal the shootout one kick at a time, then finish.
  useEffect(() => {
    if (!showPens || totalKicks === 0 || paused) return
    if (penTick >= totalKicks) { finish(1000); return }
    const t = setTimeout(() => setPenTick(n => n + 1), 560)
    return () => clearTimeout(t)
  }, [showPens, penTick, totalKicks, paused])

  const p = periods[periodIdx]
  if (!p) return null
  const homeIsA = p.homeId === teamA.clubId

  // Completed legs of a two-legged tie stay visible (home-first score + each
  // side's own scorers, home left / away right) while the next one plays —
  // never mixed into the live feed above. Keyed by home/away throughout, same
  // as the current leg, since home rotates between legs of a two-legged tie.
  const priorLegs = periods.slice(0, periodIdx).map(pp => {
    const gs = goalsForPeriod(pp, teamA.clubId)
    const homeG = gs.filter(g => g.isHome).length
    const homeIsAThisLeg = pp.homeId === teamA.clubId
    const homeName = homeIsAThisLeg ? teamA.clubName : teamB.clubName
    const awayName = homeIsAThisLeg ? teamB.clubName : teamA.clubName
    return {
      label: pp.label, homeName, awayName, homeG, awayG: gs.length - homeG,
      homeScorers: summariseScorers(pp.scorers?.home),
      awayScorers: summariseScorers(pp.scorers?.away),
    }
  })

  // Running shootout score from revealed kicks.
  const penScoredA = pens?.kicksA ? pens.kicksA.slice(0, Math.ceil(penTick / 2)).filter(k => k.scored).length : (pens?.a ?? 0)
  const penScoredB = pens?.kicksB ? pens.kicksB.slice(0, Math.floor(penTick / 2)).filter(k => k.scored).length : (pens?.b ?? 0)

  const homeName = homeIsA ? teamA.clubName : teamB.clubName
  const awayName = homeIsA ? teamB.clubName : teamA.clubName
  const shownA = pens?.kicksA ? pens.kicksA.slice(0, Math.ceil(penTick / 2)) : []
  const shownB = pens?.kicksB ? pens.kicksB.slice(0, Math.floor(penTick / 2)) : []
  // The kick just taken: A shoots first, so an odd count ends on A's.
  const lastKick = penTick === 0 ? null
    : penTick % 2 === 1 ? (shownA.length ? { kick: shownA[shownA.length - 1], team: teamA.clubName } : null)
    : (shownB.length ? { kick: shownB[shownB.length - 1], team: teamB.clubName } : null)

  return (
    <View style={[styles.card, { borderColor: roles.line, backgroundColor: roles.surface }]}>
      <View style={styles.topRow}>
        <KitText t="tag" color={roles.textMuted} style={{ flex: 1 }} numberOfLines={1}>
          {`${p.label} · ${Math.min(clock, p.toMin)}'`}
        </KitText>
        <Pressable
          onPress={() => setPaused(v => !v)}
          accessibilityRole="button"
          accessibilityLabel={paused ? 'Resume the match' : 'Pause the match'}
          style={({ pressed }) => [styles.pause, { borderColor: roles.line }, (pressed || paused) && { backgroundColor: roles.sunken }]}
        >
          <Icon name={paused ? 'play' : 'pause'} size={20} color={roles.text} />
          <KitText t="tag" color={roles.text}>{paused ? 'Resume' : 'Pause'}</KitText>
        </Pressable>
      </View>
      {paused && <KitText t="body" color={roles.textMuted}>Time stopped. Take your time, then resume.</KitText>}

      <View style={styles.scoreRow} accessible accessibilityLiveRegion="polite"
        accessibilityLabel={`${homeName} ${legHome}, ${awayName} ${legAway}, ${Math.min(clock, p.toMin)} minutes`}>
        <Side name={homeName} clubId={p.homeId} align="right" />
        <KitText t="superL" color={roles.text} style={styles.bigScore}>{`${legHome}–${legAway}`}</KitText>
        <Side name={awayName} clubId={p.awayId} align="left" />
      </View>

      {aggregate && (
        <KitText t="title" color={roles.text} style={styles.center}>
          {`AGG ${teamA.clubName} ${aggA}–${aggB} ${teamB.clubName}`}
        </KitText>
      )}

      {priorLegs.map((L, i) => (
        <View key={i} style={styles.priorLegBlock}>
          <KitText t="tag" color={roles.textMuted} style={styles.center} numberOfLines={1}>
            {`${L.label}: ${L.homeName} ${L.homeG}–${L.awayG} ${L.awayName}`}
          </KitText>
          {!!(L.homeScorers || L.awayScorers) && (
            <View style={styles.priorLegScorerRow}>
              <KitText t="body" color={roles.textMuted} style={{ flex: 1 }} numberOfLines={1}>{L.homeScorers}</KitText>
              <KitText t="body" color={roles.textMuted} style={{ flex: 1, textAlign: 'right' }} numberOfLines={1}>{L.awayScorers}</KitText>
            </View>
          )}
        </View>
      ))}

      {feed.length > 0 && (
        <View style={styles.feed}>
          {feed.map(f => (
            <Animated.View key={f.id} entering={(f.isHome ? FadeInLeft : FadeInRight).duration(220)}
              style={[styles.feedLine, { justifyContent: f.isHome ? 'flex-start' : 'flex-end' }]}>
              {/* P8-46: the mark, not a word — a red card is a red card
                  (P8-111), a goal a ball, an own goal a ball in misery red. */}
              <EventMark kind={f.kind === 'RED' ? 'red' : f.kind === 'OG' ? 'ownGoal' : 'goal'} size={16} />
              {f.kind === 'PEN' && <KitText t="tag" color={roles.textMuted}>PEN</KitText>}
              <KitText t="body" color={roles.text} numberOfLines={1}>{f.text}</KitText>
              {f.isBench && <Tag roles={roles}>SUB</Tag>}
            </Animated.View>
          ))}
        </View>
      )}

      {showPens && pens?.kicksA && pens?.kicksB && (
        <View style={styles.pens}>
          <KitText t="title" color={roles.text} style={styles.center}>{`PENALTIES ${penScoredA}–${penScoredB}`}</KitText>
          <PenRow name={teamA.clubName} kicks={shownA} />
          <PenRow name={teamB.clubName} kicks={shownB} />
          {/* Who just stepped up, and how it went — the shootout as it's taken. */}
          {lastKick && (
            <KitText t="title" color={lastKick.kick.scored ? (roles.perfectionText ?? roles.text) : roles.lossText} style={styles.center}
              accessibilityLiveRegion="polite">
              {`${lastKick.kick.playerName} (${lastKick.team}) ${lastKick.kick.scored ? 'scores' : 'misses'}`}
            </KitText>
          )}
        </View>
      )}
    </View>
  )
}

type FeedLine = { id: string; kind: 'GOAL' | 'OG' | 'PEN' | 'RED'; text: string; isHome: boolean; isBench?: boolean }

// Each side wears its mark: a nation its flag, a club its crest (TeamMark
// decides by the id). It showed only a nation's flag, so every club tie, the
// qualifiers and the Champions League knockouts, had no mark at all.
function Side({ name, clubId, align }: { name: string; clubId: string; align: 'left' | 'right' }) {
  return (
    <View style={[styles.side, { alignItems: align === 'right' ? 'flex-end' : 'flex-start' }]}>
      <TeamMark roles={roles} clubId={clubId} name={name} size={24} />
      <KitText t="title" color={roles.text} numberOfLines={2} style={{ textAlign: align }}>{name}</KitText>
    </View>
  )
}

// A shootout as a row of kit tags per side: filled for scored, striped for
// missed, empty for still to come. The kickers' names are in the label.
// Five slots for the regulation kicks, and a sudden-death kick only once it's
// taken: drawing a slot for every kick the shootout WOULD have told you, before
// it started, how long it went on (the maintainer, 24 Sept).
const REGULATION_KICKS = 5

function PenRow({ name, kicks }: { name: string; kicks: PenKick[] }) {
  const total = Math.max(REGULATION_KICKS, kicks.length)
  return (
    <View style={styles.penRow} accessible
      accessibilityLabel={`${name}: ${kicks.map(k => `${k.playerName} ${k.scored ? 'scored' : 'missed'}`).join(', ') || 'no kicks yet'}`}>
      <KitText t="body" color={roles.text} numberOfLines={1} style={styles.penName}>{name}</KitText>
      {Array.from({ length: total }, (_, i) => {
        const k = kicks[i]
        return (
          <View key={i} style={[styles.penTag, {
            borderColor: k ? roles.line : roles.rule,
            backgroundColor: k?.scored ? roles.perfection : 'transparent',
          }]}>
            {/* Scored is volt, missed is red (P8-111), not yet taken is empty. */}
            {k && !k.scored && <View style={[StyleSheet.absoluteFillObject, { backgroundColor: roles.loss }]} />}
          </View>
        )
      })}
    </View>
  )
}

const styles = StyleSheet.create({
  card: { borderWidth: border.plate, padding: space[3], gap: space[2] },
  topRow: { flexDirection: 'row', alignItems: 'center', gap: space[2] },
  pause: { flexDirection: 'row', alignItems: 'center', gap: space[1], minHeight: 48, paddingHorizontal: space[3], borderWidth: border.thin },
  scoreRow: { flexDirection: 'row', alignItems: 'center', gap: space[2] },
  side: { flex: 1, gap: 4 },
  bigScore: { minWidth: 96, textAlign: 'center' },
  center: { textAlign: 'center' },
  priorLegBlock: { gap: 1 },
  priorLegScorerRow: { flexDirection: 'row', gap: space[2] },
  feed: { gap: 4, minHeight: 20 },
  feedLine: { flexDirection: 'row', alignItems: 'center', gap: space[1] },
  redTag: { flexDirection: 'row', alignItems: 'center', borderWidth: border.thin, overflow: 'hidden' },
  redStripe: { width: 8, alignSelf: 'stretch' },
  redText: { paddingHorizontal: 4 },
  pens: { gap: space[1], marginTop: space[1] },
  penRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  penName: { width: 96 },
  penTag: { width: 18, height: 18, borderWidth: border.thin, overflow: 'hidden' },
})

// Helper: build the LivePeriods for a two-legged CL knockout tie.
export function periodsForTwoLegTie(m: {
  teamA: LiveTeam; teamB: LiveTeam
  leg1?: { aGoals: number; bGoals: number }; leg2?: { aGoals: number; bGoals: number }
  leg2ExtraTime?: { aGoals: number; bGoals: number }
  leg1Scorers?: MatchScorers; leg2Scorers?: MatchScorers; leg2ExtraTimeScorers?: MatchScorers
}): LivePeriod[] {
  const periods: LivePeriod[] = []
  if (m.leg1) periods.push({ label: 'Leg 1', homeId: m.teamA.clubId, awayId: m.teamB.clubId, fromMin: 0, toMin: 90, scorers: m.leg1Scorers })
  if (m.leg2) periods.push({ label: 'Leg 2', homeId: m.teamB.clubId, awayId: m.teamA.clubId, fromMin: 0, toMin: 90, scorers: m.leg2Scorers })
  // Presence of leg2ExtraTime means ET was played (only set when level after
  // 90'+90') — a 0-0 ET is still a real period that must play out live, not
  // a "no extra time" skip (previously gated on goals > 0, which hid it).
  if (m.leg2ExtraTime)
    periods.push({ label: 'Extra Time', homeId: m.teamB.clubId, awayId: m.teamA.clubId, fromMin: 90, toMin: 120, scorers: m.leg2ExtraTimeScorers })
  return periods
}
