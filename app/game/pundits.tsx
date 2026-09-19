import React, { useEffect, useMemo, useState } from 'react'
import { View, StyleSheet } from 'react-native'
import { router } from 'expo-router'
import Animated, { useSharedValue, useAnimatedStyle, withTiming, runOnJS, useReducedMotion } from 'react-native-reanimated'
import { useGameStore } from '@/store/gameStore'
import { useSimBackGuard } from '@/hooks/useSimBackGuard'
import { randomSeed } from '@/lib/rng'
import { haptic } from '@/lib/haptics'
import {
  predictTable, predictWorldCupRound, predictChampionsLeagueRound, predictPlayers,
  type PredictionTeam, type PredictedRow, type PunditPicks,
} from '@/engine/predictions'
import { loadLeaguePools } from '@/engine/run-stats'
import { ROLES, space, border, colourwayFor, prim, type Roles } from '@/theme'
import { KitScreen, KitText, RunHeader, Plate, Tag, SectionTag, Tape } from '@/components/kit'

// Stage 6 · Pre-season: the pundits' predictions — docs/ui-overhaul/07b B8.
// A predicted table from squad strength (with the pundits' deliberate noise),
// who they think will surprise and disappoint, and where they have you. The
// seed is kept on the run so the verdict can check it. "Start the season"
// cuts the ground to nylon (06 §4, lights on) and opens the season.
//
// Champions League and World Cup keep their own pre-season step after this
// one, because that's where their fixtures and group draw are made.
const roles = ROLES.cotton

const ordinal = (n: number) => {
  const s = ['th', 'st', 'nd', 'rd'], v = n % 100
  return `${n}${s[(v - 20) % 10] ?? s[v] ?? s[0]}`
}

export default function PunditsScreen() {
  const { mode, placedLeague, clTeams, wcTeams, predictionSeed, clYear, draftedPlayers, benchPlayers } = useGameStore()
  useSimBackGuard(true)   // the draw already happened; there's nothing to go back and re-roll
  const [seed] = useState(() => predictionSeed ?? randomSeed())
  const [lights, setLights] = useState(false)

  const teams: PredictionTeam[] | null =
    mode === 'champions_league' ? clTeams?.map(t => ({ clubId: t.clubId, clubName: t.clubName, ovr: t.ovr, isPlayer: t.isPlayer })) ?? null
    : mode === 'world_cup' ? wcTeams?.map(t => ({ clubId: t.clubId, clubName: t.clubName, ovr: t.ovr, isPlayer: t.isPlayer })) ?? null
    : placedLeague?.teams ?? null
  const pred = useMemo(() => (teams ? predictTable(teams, seed) : null), [teams, seed])

  // The three names need every squad in the field, so they arrive a moment
  // after the table. Your own drafted players are eligible like anyone else.
  const [picks, setPicks] = useState<PunditPicks | null>(null)
  useEffect(() => {
    if (!teams) return
    let alive = true
    const yearStart = mode === 'world_cup' ? 2026 : mode === 'champions_league' ? (clYear ?? 2025) : (placedLeague?.yearStart ?? 2025)
    loadLeaguePools(teams, [...draftedPlayers, ...benchPlayers], yearStart)
      .then(pools => {
        if (!alive) return
        const players = [...pools.poolByClub.values()].flat().map(p => ({
          playerId: p.playerId, name: p.name, clubName: p.clubName, primaryPosition: p.primaryPosition,
          ovr: p.ovr, attack: p.attack, birthYear: p.birthYear, yearStart: p.yearStart,
        }))
        setPicks(predictPlayers(players, seed))
      })
      .catch(e => console.warn('[pundits] squads failed to load:', e))
    return () => { alive = false }
  }, [teams?.length, seed])

  if (!pred?.player) {
    return (
      <KitScreen ground="cotton" scroll={false} contentStyle={styles.center}>
        <KitText t="bodyL" color={roles.textMuted}>This run has no draw yet.</KitText>
        <Plate label="Back to the draw" roles={roles} onPress={() => router.replace('/game/placement')} />
      </KitScreen>
    )
  }

  const place = pred.player.predicted
  const round = mode === 'world_cup' ? predictWorldCupRound(place)
    : mode === 'champions_league' ? predictChampionsLeagueRound(place) : null
  const headline = round
    ? `The pundits say ${round.label.toLowerCase()}`
    : `The pundits have you ${ordinal(place)}`

  // Long fields (36 or 48) show the top eight and the rows around you.
  const long = pred.table.length > 24
  const rows = long
    ? pred.table.filter(r => r.predicted <= 8 || Math.abs(r.predicted - place) <= 2)
    : pred.table

  function start() {
    useGameStore.setState({ predictionSeed: seed, punditPicks: picks })
    haptic('heavy')
    setLights(true)
  }

  function afterLights() {
    router.replace(mode === 'champions_league' || mode === 'world_cup' ? '/game/simulation' : '/game/simulation?start=1')
  }

  return (
    <View style={styles.fill}>
      <KitScreen ground="cotton">
        <RunHeader roles={roles} stage={6} colourway={colourwayFor(mode)} title={headline} back={false}
          skipped={mode === 'chaos' || mode === 'cursed' ? [2] : []} />
        {round && (
          <KitText t="bodyL" color={roles.textMuted}>
            {`${ordinal(place)} of ${pred.table.length} on their ranking of the field.`}
          </KitText>
        )}

        <SectionTag roles={roles}>Predicted</SectionTag>
        {rows.map((r, i) => (
          <React.Fragment key={r.clubId}>
            {long && i > 0 && r.predicted - rows[i - 1].predicted > 1 && (
              <KitText t="tag" color={roles.textFaint} style={styles.gap}>…</KitText>
            )}
            <TableRow roles={roles} row={r} />
          </React.Fragment>
        ))}

        {pred.surprise.length > 0 && (
          <>
            <SectionTag roles={roles}>They'll surprise</SectionTag>
            <KitText t="body" color={roles.text}>{pred.surprise.map(r => r.clubName).join(' · ')}</KitText>
          </>
        )}
        {pred.disappoint.length > 0 && (
          <>
            <SectionTag roles={roles}>They'll disappoint</SectionTag>
            <KitText t="body" color={roles.text}>{pred.disappoint.map(r => r.clubName).join(' · ')}</KitText>
          </>
        )}
        {picks && (
          <>
            <SectionTag roles={roles}>Their picks</SectionTag>
            {([['Player of the season', picks.pots], ['Top scorer', picks.topScorer], ['Best under-21', picks.bestU21]] as const)
              .filter(([, p]) => !!p)
              .map(([label, p]) => (
                <View key={label} style={styles.pickRow}>
                  <KitText t="tag" color={roles.textMuted} style={styles.pickLabel}>{label}</KitText>
                  <KitText t="body" color={roles.text} numberOfLines={1} style={{ flex: 1 }}>{p!.name}</KitText>
                  <KitText t="tag" color={roles.textMuted} numberOfLines={1}>{p!.clubName}</KitText>
                </View>
              ))}
          </>
        )}
        <KitText t="superS" color={roles.text} style={styles.dare}>"PROVE THEM WRONG"</KitText>

        <Plate label="Start the season" icon="forward" roles={roles} onPress={start} style={styles.plate} />
      </KitScreen>
      {lights && <LightsOn colourway={colourwayFor(mode)} onDone={afterLights} />}
    </View>
  )
}

function TableRow({ roles, row }: { roles: Roles; row: PredictedRow }) {
  return (
    <View style={[styles.row, { borderBottomColor: roles.rule }]} accessible
      accessibilityLabel={`${row.predicted}, ${row.clubName}${row.isPlayer ? ', you' : ''}, rating ${row.ovr}`}>
      <KitText t="figure" color={roles.text} style={styles.place}>{String(row.predicted)}</KitText>
      <KitText t="body" color={roles.text} style={{ flex: 1 }} numberOfLines={1}>{row.clubName}</KitText>
      {row.isPlayer && <Tag roles={roles} variant="you">YOU</Tag>}
      <KitText t="figure" color={roles.textMuted} style={styles.ovr}>{String(row.ovr)}</KitText>
    </View>
  )
}

// Lights on: a one-frame cut to nylon, then the colourway tape draws across
// the top in 250ms, then the season opens. Reduced motion keeps the cut and
// drops the draw.
function LightsOn({ colourway, onDone }: { colourway: string[]; onDone: () => void }) {
  const reduced = useReducedMotion()
  const w = useSharedValue(reduced ? 1 : 0)
  React.useEffect(() => {
    if (reduced) { const t = setTimeout(onDone, 120); return () => clearTimeout(t) }
    w.value = withTiming(1, { duration: 250 }, f => { if (f) runOnJS(onDone)() })
  }, [])
  const tape = useAnimatedStyle(() => ({ transform: [{ scaleX: w.value }] }))
  return (
    <View style={[StyleSheet.absoluteFill, { backgroundColor: prim.nylon }]} accessibilityLabel="The season is starting">
      <Animated.View style={[styles.lightsTape, { transformOrigin: 'left' } as any, tape]}>
        <Tape colours={colourway} roles={ROLES.nylon} thickness={border.tape} />
      </Animated.View>
    </View>
  )
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: space[4] },
  row: { flexDirection: 'row', alignItems: 'center', gap: space[3], minHeight: 36, borderBottomWidth: StyleSheet.hairlineWidth },
  place: { width: 28 },
  ovr: { width: 32, textAlign: 'right' },
  gap: { paddingVertical: 2 },
  pickRow: { flexDirection: 'row', alignItems: 'center', gap: space[2], minHeight: 36, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: roles.rule },
  pickLabel: { width: 132 },
  dare: { marginTop: space[5] },
  plate: { marginTop: space[5] },
  lightsTape: { position: 'absolute', top: 0, left: 0, right: 0 },
})
