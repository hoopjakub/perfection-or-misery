import React, { useEffect, useMemo, useRef, useState } from 'react'
import { useReducedMotion } from '@/hooks/useReducedMotion'
import { verdictIn } from '@/lib/motion'
import { forCompetition } from '@/data/competition'
import { View, StyleSheet } from 'react-native'
import { router, useLocalSearchParams } from 'expo-router'
import Animated, { FadeIn } from 'react-native-reanimated'
import { useGameStore } from '@/store/gameStore'
import { liveRunData } from '@/lib/runData'
import { useUserStore } from '@/store/userStore'
import { buildAwardsNight, type AwardsNight as Night } from '@/engine/awards'
import { stashRunStats, clubsForManagerAward, openPlayerSeason } from '@/lib/awardsNight'
import { useSimBackGuard } from '@/hooks/useSimBackGuard'
import { ROLES, space, border } from '@/theme'
import { KitScreen, KitText, Plate, SectionTag, Stripe } from '@/components/kit'
import { ThumbBar } from '@/components/season/RunChrome'
import { PlayerAwardCard, ClubAwardCard, FormationPitch, QualifyingAwards } from '@/components/season/AwardsParts'
import type { PunditPicks } from '@/engine/predictions'

// C7 · Awards Night (docs/ui-overhaul/07c), on nylon — and only here, only once:
// the ceremony plays at the end of a LIVE run, between the final whistle and
// the verdict (P4-G). A run opened later from history shows the same awards
// as a plain section on its result screen, with none of this.
//
// Every award is measured, not voted (P4-A): Player of the Season is the
// scoring model, and each winner carries the numbers that won it (P4-B). A
// winner is tappable and opens their season (P4-C). The team of the season is
// drawn in the shape its best players fit, with a bench of near-misses
// (P4-D/E), and club awards close the night alongside the players (P4-F).
//
// This screen also pays for computing the run's stats and hands them to the
// verdict through src/lib/awardsNight.ts, so nothing is regenerated twice.
const roles = ROLES.nylon
const BEAT_MS = 3400   // the verdict lands in ~0.9s; the rest is reading time

type Beat =
  | { kind: 'qualifying' }
  | { kind: 'team' }
  | { kind: 'player'; index: number }
  | { kind: 'club'; index: number }
  | { kind: 'u21' }
  | { kind: 'pots' }

export default function AwardsNightScreen() {
  const store = useGameStore()
  const { mode, draftedPlayers, benchPlayers, useSubstitutes, simResult, placedLeague, clResult, wcResult, clYear, customUclQual, predictionSeed, punditPicks } = store
  // Where the verdict lives for this mode. A short key, not a path: a slashed
  // value in a query string is easy to mangle in transit.
  const { to } = useLocalSearchParams<{ to?: string }>()
  const VERDICT: Record<string, string> = {
    league: '/game/result', cl: '/game/cl-result', wc: '/game/wc-result', cucl: '/game/custom-ucl-result',
  }
  const resultRoute = VERDICT[to ?? ''] ?? VERDICT[
    mode === 'champions_league' ? 'cl' : mode === 'world_cup' ? 'wc' : mode === 'champions_league_custom' ? 'cucl' : 'league'
  ]
  useSimBackGuard(true)
  const reduced = useReducedMotion()

  const [night, setNight] = useState<Night | null>(null)
  const [failed, setFailed] = useState(false)
  const [idx, setIdx] = useState(0)
  const [paused, setPaused] = useState(false)
  const [showAll, setShowAll] = useState(false)
  const leaving = useRef(false)

  const fullSquad = useMemo(() => [...draftedPlayers, ...benchPlayers], [draftedPlayers, benchPlayers])

  useEffect(() => {
    let cancelled = false
    async function run() {
      try {
        // Computed once and kept on the store (src/lib/runData.ts): every run
        // page after the ceremony reads the same numbers without regenerating.
        const res = await liveRunData()
        if (cancelled) return
        if (!res) { setFailed(true); return }
        // The verdict reads these instead of regenerating every match sheet.
        stashRunStats({ stats: res.stats, awards: res.awards, rounds: res.rounds ?? undefined })
        setNight(buildAwardsNight({
          awards: res.awards, stats: res.stats, rounds: res.rounds ?? undefined,
          clubs: clubsForManagerAward(placedLeague?.teams, simResult?.table, predictionSeed),
          playerClubId: simResult?.playerTeam.clubId, mode,
          managerName: useUserStore.getState().profile?.username ?? undefined,
        }))
      } catch (e) {
        console.warn('[awards] stats compute failed:', e)
        if (!cancelled) setFailed(true)
      }
    }
    run()
    return () => { cancelled = true }
  }, [])

  // The running order: the team first, the individual awards, the clubs, then
  // the two biggest last. An award with no winner is never read out.
  const beats = useMemo<Beat[]>(() => {
    if (!night) return []
    return [
      // P8-116: qualifying first, as it was played.
      ...(night.qualifying ? [{ kind: 'qualifying' } as Beat] : []),
      ...(night.teamOfTheSeason ? [{ kind: 'team' } as Beat] : []),
      ...night.players.map((_, index) => ({ kind: 'player', index }) as Beat),
      ...night.clubs.map((_, index) => ({ kind: 'club', index }) as Beat),
      ...(night.bestU21 ? [{ kind: 'u21' } as Beat] : []),
      ...(night.playerOfTheSeason ? [{ kind: 'pots' } as Beat] : []),
    ]
  }, [night])

  // The count-down runs itself; pausing stops it where it is.
  useEffect(() => {
    if (!night || paused || showAll || beats.length === 0) return
    if (idx >= beats.length - 1) return
    const t = setTimeout(() => setIdx(i => i + 1), BEAT_MS)
    return () => clearTimeout(t)
  }, [night, paused, showAll, idx, beats.length])

  // Tapping a winner pauses the night, so it's still where you left it.
  function openPlayer(playerId: string) {
    setPaused(true)
    openPlayerSeason(playerId, undefined, true)
  }

  function done() {
    if (leaving.current) return
    leaving.current = true
    router.replace(resultRoute as never)
  }

  if (failed) {
    return (
      <KitScreen ground="nylon" scroll={false} contentStyle={styles.centre}>
        <KitText t="superM" color={roles.text} style={styles.centred}>NO AWARDS</KitText>
        <KitText t="bodyL" color={roles.textMuted} style={styles.centred}>This run's stats couldn't be read. Your verdict is still waiting.</KitText>
        <Plate label="See your verdict" icon="forward" roles={roles} onPress={done} />
      </KitScreen>
    )
  }

  if (!night) {
    return (
      <KitScreen ground="nylon" scroll={false} contentStyle={styles.centre}>
        {/* The title in the header's size, centred. At superL it wrapped on a
            narrow phone and the first line sat off to the left ("AWARDS"),
            while a wider screen fit it on one line — hence "sometimes". */}
        <KitText t="superM" color={roles.text} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.6} style={styles.title}>AWARDS NIGHT</KitText>
        <KitText t="bodyL" color={roles.textMuted} style={styles.centred}>{forCompetition('Counting the season up.', mode)}</KitText>
      </KitScreen>
    )
  }

  const atEnd = showAll || idx >= beats.length - 1
  const list = showAll ? beats : beats.slice(0, idx + 1)
  // P8-84: after "Show them all" the counter jumps to the end instead of
  // staying frozen on the award that was showing when you skipped.
  const shown = showAll ? beats.length : Math.min(idx + 1, beats.length)
  // Newest award at the top, so the one being read out is always in view.
  const ordered = [...list].reverse()

  return (
    <View style={styles.fill}>
      <KitScreen ground="nylon">
        <Stripe roles={roles} band={6} style={styles.topStripe} />
        {/* The title shared its row with the "3 / 14" counter. How wide the
            counter is depends on the run (how many awards, which one is
            showing), so on a phone the title sometimes didn't fit, wrapped, and
            only "AWARDS" showed, off to the left — the "random" the maintainer
            kept seeing. The title now has its own centred line and is always one
            line (it shrinks to fit rather than wrap); the counter sits with the
            ticks it counts. */}
        <KitText t="superM" color={roles.text} accessibilityRole="header" numberOfLines={1}
          adjustsFontSizeToFit minimumFontScale={0.6} style={styles.title}>AWARDS NIGHT</KitText>
        <View style={styles.tickRow}>
          <View style={styles.ticks} accessibilityLabel={`Award ${shown} of ${beats.length}`}>
            {beats.map((_, i) => (
              <View key={i} style={[styles.tick, { backgroundColor: i <= idx || showAll ? roles.text : 'transparent', borderColor: roles.line }]} />
            ))}
          </View>
          <KitText t="tag" color={roles.textMuted}>{`${shown} / ${beats.length}`}</KitText>
        </View>

        {ordered.map(beat => (
          <Animated.View key={keyOf(beat)} entering={reduced ? undefined : verdictIn()}>
            <BeatView night={night} beat={beat} onPlayer={openPlayer} picks={punditPicks} />
          </Animated.View>
        ))}
      </KitScreen>

      <ThumbBar>
        {!atEnd && (
          <View style={styles.row}>
            <Plate label={paused ? 'Continue' : 'Pause'} icon={paused ? 'play' : 'pause'} variant="secondary" roles={roles}
              onPress={() => setPaused(p => !p)} style={{ flex: 1 }} />
            <Plate label="Show them all" variant="secondary" roles={roles} onPress={() => setShowAll(true)} style={{ flex: 1 }} />
          </View>
        )}
        <Plate label="See your verdict" icon="forward" roles={roles} onPress={done} />
      </ThumbBar>
    </View>
  )
}

const keyOf = (b: Beat) => b.kind === 'player' || b.kind === 'club' ? `${b.kind}${b.index}` : b.kind

function BeatView({ night, beat, onPlayer, picks }: { night: Night; beat: Beat; onPlayer: (id: string) => void; picks: PunditPicks | null }) {
  switch (beat.kind) {
    case 'qualifying':
      return <View style={styles.beat}><QualifyingAwards roles={roles} night={night} onPlayer={onPlayer} /></View>
    case 'team':
      return night.teamOfTheSeason ? (
        <View style={styles.beat}>
          <SectionTag roles={roles}>{`Team of the ${night.word ?? 'season'}`}</SectionTag>
          <FormationPitch roles={roles} team={night.teamOfTheSeason} onPlayer={onPlayer} />
        </View>
      ) : null
    case 'player':
      return <View style={styles.beat}><PlayerAwardCard roles={roles} award={night.players[beat.index]} onPlayer={onPlayer}
        said={night.players[beat.index].key === 'boot' ? picks?.topScorer : null} /></View>
    case 'club':
      return <View style={styles.beat}><ClubAwardCard roles={roles} award={night.clubs[beat.index]} /></View>
    case 'u21':
      return night.bestU21 ? <View style={styles.beat}><PlayerAwardCard roles={roles} award={night.bestU21} onPlayer={onPlayer} said={picks?.bestU21} /></View> : null
    case 'pots':
      return night.playerOfTheSeason ? <View style={styles.beat}><PlayerAwardCard roles={roles} award={night.playerOfTheSeason} onPlayer={onPlayer} big said={picks?.pots} /></View> : null
  }
}

const styles = StyleSheet.create({
  fill: { flex: 1, backgroundColor: roles.bg },
  centre: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: space[4] },
  centred: { textAlign: 'center' },
  topStripe: { height: 6, marginBottom: space[3] },   // in the flow: the status band now covers the very top
  title: { textAlign: 'center', alignSelf: 'stretch', marginBottom: space[2] },
  tickRow: { flexDirection: 'row', alignItems: 'center', gap: space[2], marginBottom: space[4] },
  ticks: { flex: 1, flexDirection: 'row', flexWrap: 'wrap', gap: 4 },
  tick: { width: 10, height: 10, borderWidth: border.thin },
  beat: { marginBottom: space[4] },
  row: { flexDirection: 'row', gap: space[2] },
})
