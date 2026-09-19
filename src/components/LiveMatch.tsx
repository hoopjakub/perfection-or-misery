import React, { useEffect, useRef, useState } from 'react'
import { View, StyleSheet, Pressable } from 'react-native'
import Animated, { FadeInLeft, FadeInRight } from 'react-native-reanimated'
import { ROLES, space, border } from '@/theme'
import { KitText, Tag, Icon, Stripe, RoundFlag } from '@/components/kit'
import { getFlag } from '@/lib/flagMap'
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
// Plays each period on a fast clock, revealing goals as the minute passes and
// updating the running aggregate. For a single match pass one period; for a
// two-legged tie pass leg1, leg2 (+ optional ET). Calls onDone when finished.
export function LiveMatch({
  teamA, teamB, periods, pens, aggregate = false, msPerMin = 26, onDone,
}: {
  teamA: LiveTeam
  teamB: LiveTeam
  periods: LivePeriod[]
  pens?: LivePens | null
  aggregate?: boolean        // show a running aggregate (two-legged ties)
  msPerMin?: number
  accent?: string          // no longer drawn; kept so callers needn't change
  onDone?: () => void
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
  const [paused, setPaused] = useState(false)   // stop-time: freezes the clock + pen reveal
  const doneRef = useRef(false)
  // finish() is called from inside an already-fired setTimeout, so a pause
  // click can't cancel it via the usual effect-cleanup path — check the
  // latest paused value at fire time so a pause during that final ~1s window
  // still holds (matches the freeze everywhere else in this component).
  const pausedRef = useRef(paused)
  useEffect(() => { pausedRef.current = paused }, [paused])

  const totalKicks = (pens?.kicksA?.length ?? 0) + (pens?.kicksB?.length ?? 0)

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
    const t = setTimeout(() => {
      const next = clock + 1
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
      }
      // reveal any red cards at/under the new minute (down to 10 men)
      while (cardCursor.current < cardsRef.current.length && cardsRef.current[cardCursor.current].minute <= next) {
        const c = cardsRef.current[cardCursor.current]; cardCursor.current++
        const mm = `${c.minute}${c.plus ? `+${c.plus}` : ''}'`
        const id = `r${periodIdx}-${cardCursor.current}`
        setFeed(f => [{ id, kind: 'RED', text: `${lastName(c.player)} ${mm}`, isHome: c.isHome } as FeedLine, ...f].slice(0, 6))
      }
      setClock(next)
    }, msPerMin)
    return () => clearTimeout(t)
  }, [clock, periodIdx, paused])

  function finish(delay: number) {
    if (doneRef.current) return
    doneRef.current = true
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
              {f.kind === 'RED' ? (
                <View style={[styles.redTag, { borderColor: roles.line }]}>
                  <Stripe roles={roles} band={4} style={styles.redStripe} />
                  <KitText t="tag" color={roles.text} style={styles.redText}>RED</KitText>
                </View>
              ) : (
                <Tag roles={roles} variant={f.kind === 'OG' ? 'data' : 'selected'}>{f.kind}</Tag>
              )}
              <KitText t="body" color={roles.text} numberOfLines={1}>{f.text}</KitText>
              {f.isBench && <Tag roles={roles}>SUB</Tag>}
            </Animated.View>
          ))}
        </View>
      )}

      {showPens && pens?.kicksA && pens?.kicksB && (
        <View style={styles.pens}>
          <KitText t="title" color={roles.text} style={styles.center}>{`PENALTIES ${penScoredA}–${penScoredB}`}</KitText>
          <PenRow name={teamA.clubName} kicks={shownA} total={pens.kicksA.length} />
          <PenRow name={teamB.clubName} kicks={shownB} total={pens.kicksB.length} />
        </View>
      )}
    </View>
  )
}

type FeedLine = { id: string; kind: 'GOAL' | 'OG' | 'PEN' | 'RED'; text: string; isHome: boolean; isBench?: boolean }

function Side({ name, clubId, align }: { name: string; clubId: string; align: 'left' | 'right' }) {
  const flag = getFlag(clubId)
  return (
    <View style={[styles.side, { alignItems: align === 'right' ? 'flex-end' : 'flex-start' }]}>
      {flag ? <RoundFlag emoji={flag} code={name.slice(0, 3)} size={20} roles={roles} /> : null}
      <KitText t="title" color={roles.text} numberOfLines={2} style={{ textAlign: align }}>{name}</KitText>
    </View>
  )
}

// A shootout as a row of kit tags per side: filled for scored, striped for
// missed, empty for still to come. The kickers' names are in the label.
function PenRow({ name, kicks, total }: { name: string; kicks: PenKick[]; total: number }) {
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
            {k && !k.scored && <Stripe roles={roles} band={4} style={StyleSheet.absoluteFillObject} />}
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
