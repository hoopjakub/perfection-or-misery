import React, { useEffect, useMemo, useState } from 'react'
import { useReducedMotion } from '@/hooks/useReducedMotion'
import { forCompetition } from '@/data/competition'
import { View, StyleSheet, ScrollView, Pressable } from 'react-native'
import { router } from 'expo-router'
import Animated, { useSharedValue, useAnimatedStyle, withTiming, runOnJS } from 'react-native-reanimated'
import { useGameStore } from '@/store/gameStore'
import { useSimBackGuard } from '@/hooks/useSimBackGuard'
import { randomSeed } from '@/lib/rng'
import {
  predictTable, predictWorldCupRound, predictChampionsLeagueRound, predictPlayers, punditPanel,
  type PredictionTeam, type PredictedRow, type PunditPicks, type PickablePlayer,
} from '@/engine/predictions'
import { loadLeaguePools } from '@/engine/run-stats'
import { ROLES, space, border, colourwayFor, prim, type Roles } from '@/theme'
import { KitScreen, KitText, RunHeader, Plate, Tag, SectionTag, Tape, ClubName, RoundFlag } from '@/components/kit'
import { flagForCountry } from '@/data/geo-iso'
import type { Panellist } from '@/engine/predictions'
import { CL_LEAGUE_MATCHDAYS, WC_GROUP_MATCHDAYS } from '@/engine/knockout-availability'

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
  // P8-13: the pundits call the points, so they need how many matches each club
  // plays — eight in the league phase, three in a World Cup group, a double
  // round robin in a league.
  const matchesPerClub =
    mode === 'champions_league' ? CL_LEAGUE_MATCHDAYS
    : mode === 'world_cup' ? WC_GROUP_MATCHDAYS
    : undefined
  const pred = useMemo(() => (teams ? predictTable(teams, seed, undefined, matchesPerClub) : null), [teams, seed, matchesPerClub])
  const panel = useMemo(() => (teams ? punditPanel(teams, seed, undefined, matchesPerClub) : []), [teams, seed, matchesPerClub])
  // P8-56's follow-up: whose preview you're reading — null is the panel
  // together (the consensus, which the verdict checks), or one pundit's own.
  const [who, setWho] = useState<number | null>(null)

  // The three names need every squad in the field, so they arrive a moment
  // after the table. Your own drafted players are eligible like anyone else.
  const [picks, setPicks] = useState<PunditPicks | null>(null)
  const [players, setPlayers] = useState<PickablePlayer[] | null>(null)
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
        setPlayers(players)
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

  // Everything below the rail reads the chosen view: the consensus, or one
  // pundit's whole preview — table, points, surprises, disappointments, picks.
  const pundit = who != null ? panel[who] : null
  const view = pundit ? pundit.prediction : pred
  const viewPicks = pundit ? (players ? predictPlayers(players, pundit.picksSeed) : null) : picks
  const place = view.player?.predicted ?? pred.player.predicted
  // How a panellist's place reads: a round in a cup, a place in a league.
  const callFor = (at: number) => mode === 'world_cup' ? predictWorldCupRound(at).label
    : mode === 'champions_league' ? predictChampionsLeagueRound(at).label : ordinal(at)
  const round = mode === 'world_cup' ? predictWorldCupRound(place)
    : mode === 'champions_league' ? predictChampionsLeagueRound(place) : null
  const who_ = pundit ? pundit.name.split(' ')[0] : 'The pundits'
  const headline = round
    ? `${who_} ${pundit ? 'says' : 'say'} ${round.label.toLowerCase()}`
    : `${who_} ${pundit ? 'has' : 'have'} you ${ordinal(place)}`

  // Long fields (36 or 48) show the top eight and the rows around you.
  const long = view.table.length > 24
  const rows = long
    ? view.table.filter(r => r.predicted <= 8 || Math.abs(r.predicted - place) <= 2)
    : view.table

  function start() {
    useGameStore.setState({ predictionSeed: seed, punditPicks: picks })
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
            {`${ordinal(place)} of ${view.table.length} on ${pundit ? 'their' : 'the panel\'s'} ranking of the field.`}
          </KitText>
        )}

        {/* P8-57: the panel. Each pundit's own call; the table below is what
            they agreed on together. */}
        {panel.length > 0 && (
          <>
            <SectionTag roles={roles}>The panel</SectionTag>
            <KitText t="body" color={roles.textMuted}>
              {panelLine(panel, round ? null : place, mode)}
            </KitText>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.panelRail} contentContainerStyle={styles.panelRailContent}>
              <Pressable onPress={() => setWho(null)} accessibilityRole="button" accessibilityState={{ selected: who == null }}
                accessibilityLabel="The panel together"
                style={({ pressed }) => [styles.pundit, { borderColor: roles.line, backgroundColor: who == null ? roles.yours : roles.surface, borderWidth: who == null ? 3 : 1 }, pressed && { opacity: 0.8 }]}>
                <KitText t="tag" color={roles.textMuted}>ALL {panel.length}</KitText>
                <KitText t="title" color={roles.text} numberOfLines={1}>The panel</KitText>
                <KitText t="tag" color={roles.text}>{`YOU: ${callFor(pred.player.predicted).toUpperCase()}`}</KitText>
                <KitText t="tag" color={roles.textMuted} numberOfLines={1}>{`CHAMPIONS: ${pred.table[0].isPlayer ? 'YOU' : pred.table[0].clubName.toUpperCase()}`}</KitText>
              </Pressable>
              {panel.map((p, i) => (
                <Pressable key={p.name} onPress={() => setWho(i)} accessibilityRole="button" accessibilityState={{ selected: who === i }}
                  style={({ pressed }) => [styles.pundit, { borderColor: roles.line, backgroundColor: who === i ? roles.yours : roles.surface, borderWidth: who === i ? 3 : 1 }, pressed && { opacity: 0.8 }]}
                  accessibilityLabel={`${p.name}, ${p.country}: has you ${callFor(p.youAt)}, champions ${p.champion.clubName}. Open their preview`}>
                  <View style={styles.punditTop}>
                    {flagForCountry(p.country) ? <RoundFlag emoji={flagForCountry(p.country)} code={p.country.slice(0, 3)} size={20} roles={roles} /> : null}
                    <KitText t="tag" color={roles.textMuted} numberOfLines={1} style={{ flex: 1 }}>{p.country}</KitText>
                  </View>
                  <KitText t="title" color={roles.text} numberOfLines={1}>{p.name}</KitText>
                  <KitText t="tag" color={roles.text}>{`YOU: ${callFor(p.youAt).toUpperCase()}`}</KitText>
                  <KitText t="tag" color={roles.textMuted} numberOfLines={1}>{`CHAMPIONS: ${p.champion.isPlayer ? 'YOU' : p.champion.clubName.toUpperCase()}`}</KitText>
                </Pressable>
              ))}
            </ScrollView>
          </>
        )}

        <SectionTag roles={roles}>{pundit ? `${pundit.name}'s table` : panel.length ? 'The consensus' : 'Predicted'}</SectionTag>
        {rows.map((r, i) => (
          <React.Fragment key={r.clubId}>
            {long && i > 0 && r.predicted - rows[i - 1].predicted > 1 && (
              <KitText t="tag" color={roles.textFaint} style={styles.gap}>…</KitText>
            )}
            <TableRow roles={roles} row={r} />
          </React.Fragment>
        ))}

        {view.surprise.length > 0 && (
          <>
            <SectionTag roles={roles}>They'll surprise</SectionTag>
            <KitText t="body" color={roles.text}>{view.surprise.map(r => r.clubName).join(' · ')}</KitText>
          </>
        )}
        {view.disappoint.length > 0 && (
          <>
            <SectionTag roles={roles}>They'll disappoint</SectionTag>
            <KitText t="body" color={roles.text}>{view.disappoint.map(r => r.clubName).join(' · ')}</KitText>
          </>
        )}
        {viewPicks && (
          <>
            <SectionTag roles={roles}>Their picks</SectionTag>
            {([[forCompetition('Player of the season', mode), viewPicks.pots], ['Top scorer', viewPicks.topScorer], ['Best under-21', viewPicks.bestU21]] as const)
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
        {/* P8-40: the dare sat unfocused above the button. It IS the button now —
            what you press to start is the answer to the pundits. */}
        <Plate label="Prove them wrong" icon="forward" roles={roles} onPress={start} style={[styles.plate, styles.dare]}
          accessibilityHint={forCompetition('Starts the season', mode)} />
      </KitScreen>
      {lights && <LightsOn colourway={colourwayFor(mode)} onDone={afterLights} />}
    </View>
  )
}

// One line on how split the panel is on you: how many have you where the
// consensus does, better, or worse (a league place; a cup round goes by the
// consensus's round, so the line only counts agreement there).
function panelLine(panel: Panellist[], consensus: number | null, mode: string | null): string {
  const yours = panel.filter(p => p.champion.isPlayer).length
  const title = yours > 0 ? ` ${yours === 1 ? 'One of them has' : `${yours} of them have`} you as champions.` : ''
  if (consensus == null) return `${panel.length} pundits, ${panel.length} calls.${title}`
  const better = panel.filter(p => p.youAt < consensus).length, worse = panel.filter(p => p.youAt > consensus).length
  return `${panel.length} pundits: ${better} rate you higher than the consensus, ${worse} lower.${title}`
}

function TableRow({ roles, row }: { roles: Roles; row: PredictedRow }) {
  return (
    <View style={[styles.row, { borderBottomColor: roles.rule }, row.isPlayer && { backgroundColor: roles.yours }]} accessible
      accessibilityLabel={`${row.predicted}, ${row.clubName}${row.isPlayer ? ', you' : ''}, ${row.points} points`}>
      <KitText t="figure" color={roles.text} style={styles.place}>{String(row.predicted)}</KitText>
      <ClubName roles={roles} clubId={row.clubId} name={row.clubName} size={16} style={{ flex: 1 }} />
      {/* P8-23: your row is marked by its background, as in the league table. */}
      {/* P8-13: what the pundits think you'll finish on, not a rating. */}
      <KitText t="figure" color={roles.textMuted} style={styles.ovr}>{`${row.points} PTS`}</KitText>
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
    <View style={[StyleSheet.absoluteFill, { backgroundColor: prim.nylon }]} accessibilityLabel={forCompetition('The season is starting', useGameStore.getState().mode)}>
      <Animated.View style={[styles.lightsTape, { transformOrigin: 'left' } as any, tape]}>
        <Tape colours={colourway} roles={ROLES.nylon} thickness={border.tape} />
      </Animated.View>
    </View>
  )
}

const styles = StyleSheet.create({
  panelRail: { marginHorizontal: -space[4], marginBottom: space[3] },
  panelRailContent: { paddingHorizontal: space[4], gap: space[2] },
  pundit: { width: 176, borderWidth: border.thin, padding: space[3], gap: 4 },
  punditTop: { flexDirection: 'row', alignItems: 'center', gap: space[2] },
  fill: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: space[4] },
  row: { flexDirection: 'row', alignItems: 'center', gap: space[3], minHeight: 36, borderBottomWidth: StyleSheet.hairlineWidth },
  place: { width: 28 },
  ovr: { width: 56, textAlign: 'right' },
  gap: { paddingVertical: 2 },
  pickRow: { flexDirection: 'row', alignItems: 'center', gap: space[2], minHeight: 36, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: roles.rule },
  pickLabel: { width: 132 },
  dare: { marginTop: space[5] },
  plate: { marginTop: space[5] },
  lightsTape: { position: 'absolute', top: 0, left: 0, right: 0 },
})
