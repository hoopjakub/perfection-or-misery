import React, { useEffect, useRef, useState } from 'react'
import { View, Text, StyleSheet, Pressable } from 'react-native'
import { colors, spacing, typography, radius, MODE_THEMES } from '@/theme'
import { TeamLabel } from '@/components/TeamLabel'
import { PenShootout } from '@/components/PenShootout'
import { summariseScorers } from '@/engine/run-stats'
import type { MatchScorers } from '@/types/stats'
import type { PenKick } from '@/engine/knockout-match'

const CL = MODE_THEMES.champions_league

// ── Public shapes ───────────────────────────────────────────────────────────
export type LiveTeam = { clubId: string; clubName: string }

// One "period" of football to play through on the clock (a leg, or extra time).
export type LivePeriod = {
  label: string          // 'Leg 1', 'Leg 2', 'Extra Time', 'Final'…
  homeId: string         // who's at HOME for this period
  awayId: string
  fromMin: number        // clock start (0 for a leg, 90 for ET)
  toMin: number          // clock end (90, or 120 for ET)
  scorers?: MatchScorers // home/away goal events (minutes) for this period
}

export type LivePens = { a: number; b: number; kicksA?: PenKick[]; kicksB?: PenKick[] }

// isHome drives ALL on-screen left/right placement (score row, live feed, prior
// legs) — home is always displayed on the left, away always on the right,
// regardless of which of teamA/teamB is currently hosting. sideIsA is kept
// separately ONLY for the cross-leg aggregate tally, which must track a fixed
// team identity rather than a home/away side that flips between legs.
type Goal = { min: number; plus?: number; isHome: boolean; sideIsA: boolean; scorer: string; isBench?: boolean }

function goalsForPeriod(p: LivePeriod, teamAId: string): Goal[] {
  const out: Goal[] = []
  const add = (evs: MatchScorers['home'] | undefined, isHome: boolean, sideIsA: boolean) => {
    for (const e of evs ?? []) out.push({ min: e.minute, plus: e.plus, isHome, sideIsA, scorer: lastName(e.scorerName), isBench: e.scorerIsBench })
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
  teamA, teamB, periods, pens, aggregate = false, msPerMin = 26, accent = CL.accent, onDone,
}: {
  teamA: LiveTeam
  teamB: LiveTeam
  periods: LivePeriod[]
  pens?: LivePens | null
  aggregate?: boolean        // show a running aggregate (two-legged ties)
  msPerMin?: number
  accent?: string
  onDone?: () => void
}) {
  const [periodIdx, setPeriodIdx] = useState(0)
  const [clock, setClock] = useState(periods[0]?.fromMin ?? 0)
  const [aggA, setAggA] = useState(0)       // running aggregate for teamA (fixed identity, cross-leg)
  const [aggB, setAggB] = useState(0)
  const [legHome, setLegHome] = useState(0) // current period's HOME-side score
  const [legAway, setLegAway] = useState(0) // current period's AWAY-side score
  const [feed, setFeed] = useState<{ text: string; isHome: boolean; isBench?: boolean }[]>([])
  const [showPens, setShowPens] = useState(false)
  const [penTick, setPenTick] = useState(0)     // number of shootout kicks revealed so far
  const [paused, setPaused] = useState(false)   // stop-time: freezes the clock + pen reveal
  const doneRef = useRef(false)

  const totalKicks = (pens?.kicksA?.length ?? 0) + (pens?.kicksB?.length ?? 0)

  const goalsRef = useRef<Goal[]>([])
  const goalCursor = useRef(0)

  // Start / restart a period. Clearing `feed` here is the key bit — otherwise
  // the previous leg's goal ticker lingers and reads as if it happened in the
  // leg that's currently live (its minutes don't match the new leg's clock).
  useEffect(() => {
    const p = periods[periodIdx]
    if (!p) return
    goalsRef.current = goalsForPeriod(p, teamA.clubId)
    goalCursor.current = 0
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
        setFeed(f => [{ text: `⚽ ${g.scorer} ${mm}`, isHome: g.isHome, isBench: g.isBench }, ...f].slice(0, 6))
      }
      setClock(next)
    }, msPerMin)
    return () => clearTimeout(t)
  }, [clock, periodIdx, paused])

  function finish(delay: number) {
    if (doneRef.current) return
    doneRef.current = true
    setTimeout(() => onDone?.(), delay)
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

  return (
    <View style={[styles.card, { borderColor: accent }]}>
      <View style={styles.topRow}>
        <Text style={styles.periodLabel}>{p.label}</Text>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
          <Pressable
            onPress={() => setPaused(v => !v)}
            style={[styles.pausePill, { borderColor: paused ? accent : colors.border }, paused && { backgroundColor: accent + '22' }]}
            hitSlop={8}
          >
            <Text style={[styles.pauseText, { color: paused ? accent : colors.textMuted }]}>
              {paused ? '▶ RESUME' : '⏸ PAUSE'}
            </Text>
          </Pressable>
          <View style={[styles.clockPill, { borderColor: accent }]}>
            <Text style={[styles.clockText, { color: accent }]}>{Math.min(clock, p.toMin)}'</Text>
          </View>
        </View>
      </View>
      {paused && <Text style={styles.pausedNote}>Time stopped — take your time, then resume.</Text>}

      <View style={styles.scoreRow}>
        <TeamLabel clubId={p.homeId} name={homeIsA ? teamA.clubName : teamB.clubName} textStyle={styles.teamName} containerStyle={{ flex: 1 }} size={15} />
        <Text style={styles.bigScore}>{legHome} – {legAway}</Text>
        <TeamLabel clubId={p.awayId} name={homeIsA ? teamB.clubName : teamA.clubName} textStyle={[styles.teamName, { textAlign: 'right' }]} containerStyle={{ flex: 1, justifyContent: 'flex-end' }} size={15} />
      </View>

      {priorLegs.map((L, i) => (
        <View key={i} style={styles.priorLegBlock}>
          <Text style={styles.priorLeg} numberOfLines={1}>
            {L.label}: {L.homeName} {L.homeG}–{L.awayG} {L.awayName}
          </Text>
          {!!(L.homeScorers || L.awayScorers) && (
            <View style={styles.priorLegScorerRow}>
              <Text style={[styles.priorLegScorer, { textAlign: 'left' }]} numberOfLines={1}>{L.homeScorers}</Text>
              <Text style={[styles.priorLegScorer, { textAlign: 'right' }]} numberOfLines={1}>{L.awayScorers}</Text>
            </View>
          )}
        </View>
      ))}

      {aggregate && (
        <Text style={styles.aggLine}>
          Aggregate: <Text style={{ color: accent, fontWeight: typography.black }}>{teamA.clubName} {aggA} – {aggB} {teamB.clubName}</Text>
        </Text>
      )}

      {feed.length > 0 && (
        <View style={styles.feed}>
          {feed.map((f, i) => (
            <Text key={i} style={[styles.feedLine, { textAlign: f.isHome ? 'left' : 'right' }]} numberOfLines={1}>
              {f.text}{f.isBench && <Text style={styles.subTag}> SUB</Text>}
            </Text>
          ))}
        </View>
      )}

      {showPens && pens?.kicksA && pens?.kicksB && (
        <View style={{ marginTop: spacing.sm }}>
          <Text style={[styles.penTitle, { color: accent }]}>Penalties: {penScoredA} – {penScoredB}</Text>
          <PenShootout teamA={teamA.clubName} teamB={teamB.clubName} kicksA={pens.kicksA} kicksB={pens.kicksB} reveal={penTick} />
        </View>
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  card: { backgroundColor: colors.bgCard, borderRadius: radius.lg, borderWidth: 1.5, padding: spacing.lg, gap: spacing.sm },
  topRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  periodLabel: { fontSize: typography.xs, fontWeight: typography.black, color: colors.textMuted, textTransform: 'uppercase', letterSpacing: 1 },
  clockPill: { borderWidth: 1, borderRadius: radius.full, paddingHorizontal: spacing.md, paddingVertical: 2 },
  clockText: { fontSize: typography.sm, fontWeight: typography.black },
  pausePill: { borderWidth: 1, borderRadius: radius.full, paddingHorizontal: spacing.sm, paddingVertical: 2 },
  pauseText: { fontSize: 9, fontWeight: typography.black, letterSpacing: 0.5 },
  pausedNote: { fontSize: 10, color: colors.textMuted, textAlign: 'center', fontStyle: 'italic' },
  scoreRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  teamName: { fontSize: typography.sm, fontWeight: typography.bold, color: colors.textPrimary },
  bigScore: { fontSize: typography.xxl, fontWeight: typography.black, color: colors.textPrimary },
  aggLine: { fontSize: typography.xs, color: colors.textSecondary, textAlign: 'center' },
  priorLegBlock: { gap: 1 },
  priorLeg: { fontSize: typography.xs, color: colors.textMuted, textAlign: 'center' },
  priorLegScorerRow: { flexDirection: 'row', gap: spacing.sm },
  priorLegScorer: { flex: 1, fontSize: 10, color: colors.textMuted, opacity: 0.85 },
  feed: { gap: 2, minHeight: 20 },
  feedLine: { fontSize: typography.xs, color: colors.textSecondary },
  subTag: { fontSize: 9, fontWeight: typography.black, color: colors.warning },
  penTitle: { fontSize: typography.sm, fontWeight: typography.black, textAlign: 'center', marginBottom: 4 },
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
  if (m.leg2ExtraTime && (m.leg2ExtraTime.aGoals > 0 || m.leg2ExtraTime.bGoals > 0))
    periods.push({ label: 'Extra Time', homeId: m.teamB.clubId, awayId: m.teamA.clubId, fromMin: 90, toMin: 120, scorers: m.leg2ExtraTimeScorers })
  return periods
}
