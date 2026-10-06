import { countryName } from '@/data/countries-sk'
import { log } from '@/diag/log'
import { ordinal } from '@/lib/format'
import { t } from '@/i18n'
import { compOfMode, isClassicEurope } from '@/data/europe'
import React, { useEffect, useMemo, useState } from 'react'
import { useReducedMotion } from '@/hooks/useReducedMotion'
import { isTournament } from '@/data/competition'
import { formatTier } from '@/data/tiers'
import { View, StyleSheet } from 'react-native'
import { router, useLocalSearchParams } from 'expo-router'
import { takePundits } from '@/lib/punditsHandoff'
import Animated, { useSharedValue, useAnimatedStyle, withTiming, runOnJS } from 'react-native-reanimated'
import { useGameStore } from '@/store/gameStore'
import { useSimBackGuard } from '@/hooks/useSimBackGuard'
import { randomSeed } from '@/lib/rng'
import {
  predictTable, predictWorldCupRound, predictChampionsLeagueRound, predictPlayers, punditPanel, punditRatings, punditField,
  type PredictionTeam, type PredictedRow, type PunditPicks, type PickablePlayer,
} from '@/engine/predictions'
import { loadLeaguePools } from '@/engine/run-stats'
import { ROLES, space, border, colourwayFor, type Roles } from '@/theme'
import { KitScreen, KitText, RunHeader, Plate, SectionTag, Tape, ClubName } from '@/components/kit'
import { PunditRail } from '@/components/season/PunditRail'
import { TheirTournament } from '@/components/season/VerdictBlock'
import { worldCupPunditTournament, championsLeaguePunditTournament } from '@/engine/cup-calls'
import { getFlag } from '@/lib/flagMap'
import type { Panellist } from '@/engine/predictions'
import { EVERYDAY } from '@/lib/appearance'

// Stage 6 · Pre-season: the pundits' predictions — docs/ui-overhaul/07b B8.
// A predicted table from squad strength (with the pundits' deliberate noise),
// who they think will surprise and disappoint, and where they have you. The
// seed is kept on the run so the verdict can check it. "Start the season"
// cuts the ground to nylon (06 §4, lights on) and opens the season.
//
// Champions League and World Cup keep their own pre-season step after this
// one, because that's where their fixtures and group draw are made.
const roles = ROLES[EVERYDAY]


export default function PunditsScreen() {
  const { mode, placedLeague, clTeams, wcTeams, predictionSeed, clYear, draftedPlayers, benchPlayers } = useGameStore()
  // P8.5-15: the full path's domestic league, handed over by its own screen.
  const params = useLocalSearchParams<{ field?: string }>()
  const [field] = useState(() => (params.field ? takePundits() : null))
  // The draw already happened; there's nothing to go back and re-roll. The
  // full path's pre-season has nothing decided yet, so back simply returns.
  useSimBackGuard(!field)
  const [seed] = useState(() => predictionSeed ?? randomSeed())
  const [lights, setLights] = useState(false)

  // The full path hands over its own field; every other mode's comes from the
  // one place the live screens' panel line also reads (L-13).
  const own = field ? null : punditField(mode, { clTeams, wcTeams, placedLeague })
  const teams: PredictionTeam[] | null = field ? field.teams : own?.teams ?? null
  // P8-13: the pundits call the points, so they need how many matches each club
  // plays: eight in the league phase, three in a World Cup group, a double
  // round robin in a league.
  const matchesPerClub = own?.matchesPerClub
  const pred = useMemo(() => (teams ? predictTable(teams, seed, undefined, matchesPerClub) : null), [teams, seed, matchesPerClub])
  const panel = useMemo(() => (teams ? punditPanel(teams, seed, undefined, matchesPerClub) : []), [teams, seed, matchesPerClub])
  // P8-56's follow-up: whose preview you're reading — null is the panel
  // together (the consensus, which the verdict checks), or one pundit's own.
  const [who, setWho] = useState<number | null>(null)
  // P8-165: in a cup, the chosen view's whole tournament, played out now from a
  // draw of their own (the real one comes later). The result screen replays
  // exactly this one against what happened.
  const tournament = useMemo(() => {
    if (!teams || field || (mode !== 'world_cup' && !isClassicEurope(mode))) return null
    // The Conference League's pundits draw its six pots, one from each (P8-172).
    const comp = compOfMode(mode) ?? undefined
    const build = mode === 'world_cup' ? worldCupPunditTournament
      : (f: typeof teams, r: Map<string, number>, s: number) => championsLeaguePunditTournament(f, r, s, undefined, comp)
    return who == null ? build(teams, punditRatings(teams, seed), seed) : panel[who] ? build(teams, panel[who].ratings, panel[who].picksSeed) : null
  }, [teams?.length, seed, who, panel])

  // The three names need every squad in the field, so they arrive a moment
  // after the table. Your own drafted players are eligible like anyone else.
  const [picks, setPicks] = useState<PunditPicks | null>(null)
  const [players, setPlayers] = useState<PickablePlayer[] | null>(null)
  useEffect(() => {
    if (!teams) return
    let alive = true
    const yearStart = field ? field.yearStart : mode === 'world_cup' ? 2026 : isClassicEurope(mode) ? (clYear ?? 2025) : (placedLeague?.yearStart ?? 2025)
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
      .catch(e => log.warn('db', 'pundits: squads failed to load', e))
    return () => { alive = false }
  }, [teams?.length, seed])

  if (!pred?.player) {
    return (
      <KitScreen ground={EVERYDAY} scroll={false} contentStyle={styles.center}>
        <KitText t="bodyL" color={roles.textMuted}>{t('pundits.noDraw')}</KitText>
        <Plate label={t('pundits.backToDraw')} roles={roles} onPress={() => router.replace('/game/placement')} />
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
  // The full path's field is a league: a place, never a round.
  const cup = !field && (mode === 'world_cup' || isClassicEurope(mode))
  // A round call is a tier (its key), so it's named the way the tiers are.
  const callFor = (at: number) => !cup ? ordinal(at) : formatTier(mode === 'world_cup' ? predictWorldCupRound(at).key : predictChampionsLeagueRound(at).key)
  const round = !cup ? null : mode === 'world_cup' ? predictWorldCupRound(place) : predictChampionsLeagueRound(place)
  const who_ = pundit ? pundit.name.split(' ')[0] : t('pundits.thePundits')
  const headline = round
    ? t(pundit ? 'pundits.saysOne' : 'pundits.sayAll', { who: who_, round: formatTier(round.key).toLowerCase() })
    : t(pundit ? 'pundits.hasOne' : 'pundits.haveAll', { who: who_, place: ordinal(place) })

  // Long fields (36 or 48) show the top eight and the rows around you.
  const long = view.table.length > 24
  const rows = long
    ? view.table.filter(r => r.predicted <= 8 || Math.abs(r.predicted - place) <= 2)
    : view.table

  function start() {
    // The full path keeps its domestic prediction to itself: the run's
    // predictionSeed is checked against the league phase's field at the end.
    if (!field) useGameStore.setState({ predictionSeed: seed, punditPicks: picks })
    setLights(true)
  }

  function afterLights() {
    if (field) { field.onStart(seed); router.back(); return }
    // L-16 / D5: every stage waits for your first tap. A league used to start
    // on arrival (?start=1) while the cups, which open on a draw, waited.
    router.replace('/game/simulation')
  }

  return (
    <View style={styles.fill}>
      <KitScreen ground={EVERYDAY}>
        <RunHeader roles={roles} stage={6} colourway={colourwayFor(mode)} title={headline} back={false} />
        {round && (
          <KitText t="bodyL" color={roles.textMuted}>
            {t(pundit ? 'pundits.ofField' : 'pundits.ofFieldPanel', { place: ordinal(place), count: view.table.length })}
          </KitText>
        )}

        {/* P8-57: the panel. Each pundit's own call; the table below is what
            they agreed on together. */}
        {panel.length > 0 && (
          <>
            <SectionTag roles={roles}>{t('pundits.thePanel')}</SectionTag>
            <KitText t="body" color={roles.textMuted}>
              {panelLine(panel, round ? null : place, mode)}
            </KitText>
            <PunditRail roles={roles} selected={who == null ? 0 : who + 1} onSelect={i => setWho(i === 0 ? null : i - 1)}
              cards={[
                { key: 'panel', top: t('pundits.all', { count: panel.length }), title: t('pundits.thePanel'), accessibilityLabel: t('pundits.panelTogether'),
                  lines: [t('pundits.youCall', { call: callFor(pred.player.predicted).toUpperCase() }), t('pundits.championsCall', { name: pred.table[0].isPlayer ? t('pundits.you') : pred.table[0].clubName.toUpperCase() })] },
                ...panel.map(p => ({
                  key: p.name, country: p.country, title: p.name,
                  lines: [t('pundits.youCall', { call: callFor(p.youAt).toUpperCase() }), t('pundits.championsCall', { name: p.champion.isPlayer ? t('pundits.you') : p.champion.clubName.toUpperCase() })],
                  accessibilityLabel: t('pundits.punditA11y', { name: p.name, country: countryName(p.country), call: callFor(p.youAt), champion: p.champion.clubName }),
                })),
              ]} />
          </>
        )}

        <SectionTag roles={roles}>{pundit ? t('pundits.theirTable', { name: pundit.name }) : panel.length ? t('pundits.consensus') : t('pundits.predicted')}</SectionTag>
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
            <SectionTag roles={roles}>{t('pundits.surprise')}</SectionTag>
            <KitText t="body" color={roles.text}>{view.surprise.map(r => r.clubName).join(' · ')}</KitText>
          </>
        )}
        {view.disappoint.length > 0 && (
          <>
            <SectionTag roles={roles}>{t('pundits.disappoint')}</SectionTag>
            <KitText t="body" color={roles.text}>{view.disappoint.map(r => r.clubName).join(' · ')}</KitText>
          </>
        )}
        {viewPicks && (
          <>
            <SectionTag roles={roles}>{t('pundits.theirPicks')}</SectionTag>
            {([[isTournament(field ? null : mode) ? t('pundits.playerOfTournament') : t('pundits.playerOfSeason'), viewPicks.pots], [t('pundits.topScorer'), viewPicks.topScorer], [t('pundits.bestU21'), viewPicks.bestU21]] as const)
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
        {tournament && (
          <>
            <SectionTag roles={roles}>{pundit ? t('pundits.theirTournament', { name: pundit.name.split(' ')[0] }) : t('pundits.panelTournament')}</SectionTag>
            <KitText t="body" color={roles.textMuted}>
              {t(pundit ? 'pundits.tournamentNote' : 'pundits.tournamentNotePanel', { champion: tournament.champion.isPlayer ? t('pundits.youLower') : tournament.champion.clubName })}
            </KitText>
            <TheirTournament roles={roles} t={tournament} name={pundit ? pundit.name : t('pundits.thePanel')}
              playerClubId={pred.player.clubId} flagOf={mode === 'world_cup' ? getFlag : undefined} />
          </>
        )}
        {/* P8-40: the dare sat unfocused above the button. It IS the button now —
            what you press to start is the answer to the pundits. */}
        <Plate label={t('pundits.prove')} icon="forward" roles={roles} onPress={start} style={[styles.plate, styles.dare]}
          accessibilityHint={isTournament(field ? null : mode) ? t('pundits.startsTournament') : t('pundits.startsSeason')} />
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
  const title = yours > 0 ? (yours === 1 ? t('pundits.oneHasYou') : t('pundits.someHaveYou', { count: yours })) : ''
  if (consensus == null) return t('pundits.calls', { count: panel.length }) + title
  const better = panel.filter(p => p.youAt < consensus).length, worse = panel.filter(p => p.youAt > consensus).length
  return t('pundits.split', { count: panel.length, better, worse }) + title
}

function TableRow({ roles, row }: { roles: Roles; row: PredictedRow }) {
  return (
    <View style={[styles.row, { borderBottomColor: roles.rule }, row.isPlayer && { backgroundColor: roles.yours }]} accessible
      accessibilityLabel={t('pundits.rowA11y', { place: row.predicted, name: row.clubName, you: row.isPlayer ? t('pundits.youSuffix') : '', points: row.points })}>
      <KitText t="figure" color={roles.text} style={styles.place}>{String(row.predicted)}</KitText>
      <ClubName roles={roles} clubId={row.clubId} name={row.clubName} size={16} style={{ flex: 1 }} />
      {/* P8-23: your row is marked by its background, as in the league table. */}
      {/* P8-13: what the pundits think you'll finish on, not a rating. */}
      <KitText t="figure" color={roles.textMuted} style={styles.ovr}>{t('pundits.pts', { points: row.points })}</KitText>
    </View>
  )
}

// Lights on: a one-frame cut to a clear ground, then the colourway tape draws
// across the top in 250ms, then the season opens. Reduced motion keeps the cut
// and drops the draw. P8.5-38: the cut was to nylon, a dark frame between two
// light screens in light mode ("a blank screen with just the top part, in dark
// mode"); since the season follows the setting, so does the frame before it.
function LightsOn({ colourway, onDone }: { colourway: string[]; onDone: () => void }) {
  const reduced = useReducedMotion()
  const w = useSharedValue(reduced ? 1 : 0)
  React.useEffect(() => {
    if (reduced) { const timer = setTimeout(onDone, 120); return () => clearTimeout(timer) }
    w.value = withTiming(1, { duration: 250 }, f => { if (f) runOnJS(onDone)() })
  }, [])
  const tape = useAnimatedStyle(() => ({ transform: [{ scaleX: w.value }] }))
  return (
    <View style={[StyleSheet.absoluteFill, { backgroundColor: roles.bg }]} accessibilityLabel={isTournament(useGameStore.getState().mode) ? t('pundits.tournamentStarting') : t('pundits.seasonStarting')}>
      <Animated.View style={[styles.lightsTape, { transformOrigin: 'left' } as any, tape]}>
        <Tape colours={colourway} roles={roles} thickness={border.tape} />
      </Animated.View>
    </View>
  )
}

const styles = StyleSheet.create({
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
