import { countryName } from '@/data/countries-sk'
import { time } from '@/diag/perf'
import { log } from '@/diag/log'
import { getFlag } from '@/lib/flagMap'
import { t } from '@/i18n'
import { compOfMode, isClassicEurope, EUROPE } from '@/data/europe'
import React, { useState, useEffect, useMemo } from 'react'
import { Loader } from '@/components/kit'
import { useSizeClass } from '@/hooks/useSizeClass'
import { View, Pressable, ScrollView, StyleSheet, Platform } from 'react-native'
import { router } from 'expo-router'
import { useGameStore } from '@/store/gameStore'
import { getAllClubSeasons, getClubSeasonsForMode } from '@/db/queries/seasons'
import { filterEligibleLeagues, spinPlacement, buildLeagueSeason, sideName } from '@/engine/placement'
import { useUserStore } from '@/store/userStore'
import { activateCrestFor } from '@/store/crestStore'
import { calcTeamOvr } from '@/engine/rating'
import { getSlotsForFormation } from '@/engine/formations'
import { buildCLTeams } from '@/engine/cl-sim'
import { buildWCTeams } from '@/engine/world-cup-sim'
import { generateFixtures } from '@/engine/fixtures'
import { GlobeReveal } from '@/components/GlobeReveal'
import { ModeBanner } from '@/components/season/ModeBanner'
import { InfoBubble } from '@/components/InfoBubble'
import { PositionStakes } from '@/components/CustomUclViewers'
import { isoForLeague, isoForNationId, isoForCountryName, flagForCountry, flagForLeague, countryForClClub } from '@/data/geo-iso'
import { getCustomUclAssociations } from '@/db/queries/custom-ucl'
import type { AssociationEntry } from '@/engine/cl-access'
import type { LeagueSeason, LeagueSeasonWithTeams } from '@/types/game'
import type { SimTeam } from '@/types/simulation'
import { useSimBackGuard } from '@/hooks/useSimBackGuard'
import { ROLES, space, border, colourwayFor, prim } from '@/theme'
import {
  KitScreen, KitText, RunHeader, Plate, Tag, SectionTag, Rivets, StripedNotice, RoundFlag, VenueMark, Crest,} from '@/components/kit'
import { EVERYDAY } from '@/lib/appearance'
import { huntWeight } from '@/engine/europe-path'

// Stage 5 · The draw — docs/ui-overhaul/07b B7.
//
// Four data sources, one layout: the globe spins on a nylon panel (tap it to
// land the spin), your fate lands as a riveted label, then the strongest rivals
// (with the gap stated in words, not only coloured) and, where the fixtures are
// known up front, your first few. The draw is decided before the globe turns,
// so every placement is back-guarded from the moment it's made (Big Fixes §3).
const roles = ROLES[EVERYDAY]

// The globe plays in full on the first draw of a session, at half length after.
let drawsThisSession = 0
const globeMs = () => (drawsThisSession++ === 0 ? 2600 : 1300)

export default function PlacementScreen() {
  const { mode } = useGameStore()
  // P8-172: the Europa and Conference Leagues are drawn the Champions League's way.
  if (isClassicEurope(mode))                return <CLPlacement />
  if (mode === 'champions_league_custom') return <CustomCLPlacement />
  if (mode === 'world_cup')               return <WCPlacement />
  return <LeaguePlacement />
}

// ── Shared pieces ───────────────────────────────────────────────────────────

// Children with fragments opened up, so the globe can be found wherever a
// mode's draw put it.
function flatten(children: React.ReactNode): React.ReactNode[] {
  return React.Children.toArray(children).flatMap(c =>
    React.isValidElement(c) && c.type === React.Fragment ? flatten((c.props as { children?: React.ReactNode }).children) : [c])
}

function DrawScreen({ title, children, cta }: { title: string; children: React.ReactNode; cta?: React.ReactNode }) {
  const { mode } = useGameStore()
  const wide = useSizeClass() === 'expanded'
  const header = (
    <RunHeader roles={roles} stage={5} colourway={colourwayFor(mode)} title={title} back={false} />
  )
  // Expanded (10-ADAPT §2.2): the globe on the left, the reveal, rivals,
  // fixtures and the plate on the right. Before the spin there's no globe
  // yet, so everything stays in the right-hand column.
  if (wide) {
    const items = flatten(children)
    const globe = items.find(c => React.isValidElement(c) && c.type === GlobePanel)
    const rest = items.filter(c => c !== globe)
    return (
      <KitScreen ground={EVERYDAY} scroll={false} width="wide" contentStyle={styles.screen}>
        {header}
        <View style={styles.wide}>
          {globe ? <View style={styles.wideGlobe}>{globe}</View> : null}
          <View style={styles.wideSide}>
            <ScrollView style={styles.body} contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={Platform.OS === 'web'}>{rest}</ScrollView>
            {cta ? <View style={styles.cta}>{cta}</View> : null}
          </View>
        </View>
      </KitScreen>
    )
  }
  return (
    <KitScreen ground={EVERYDAY} scroll={false} contentStyle={styles.screen}>
      {header}
      <ScrollView style={styles.body} contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={Platform.OS === 'web'}>
        {children}
      </ScrollView>
      {cta ? <View style={styles.cta}>{cta}</View> : null}
    </KitScreen>
  )
}

function GlobePanel({ targetId, targetName, flag, spinMs, onLock, locked }: {
  targetId?: number | null
  targetName?: string | null
  /** P8-164: the country lands wearing its flag. */
  flag?: string | null
  spinMs: number
  onLock: () => void
  locked: boolean
}) {
  const [skip, setSkip] = useState(false)
  const wide = useSizeClass() === 'expanded'
  return (
    <Pressable
      onPress={() => setSkip(true)}
      disabled={locked}
      accessibilityRole="button"
      accessibilityLabel={locked ? t('draw.landed') : t('draw.spinningA11y')}
      // P8.5-12: no panel of its own. The globe is a dark sphere on either
      // ground; the nylon square behind it was the "black box" on a cotton page.
      style={styles.globePanel}
    >
      {/* Bigger in the wide layout's own pane; same path count, so no extra cost per frame. */}
      <GlobeReveal targetId={targetId} targetName={targetName} flag={flag} accent={prim.orange} spinMs={spinMs} onLock={onLock} skip={skip} size={wide ? 360 : 220} />
      {!locked && <KitText t="tag" color={roles.textMuted}>{t('draw.tapToLand')}</KitText>}
    </Pressable>
  )
}

const REVEAL_MARK = 64

// `nation`: you ARE the nation (the World Cup), so its flag is the mark. A
// club run shows the club's crest, with its country's flag small by the
// details: the classic and full Champions League showed only the flag, and
// the club was nowhere (the maintainer, 26 Sept). `replaces`: your side wears
// your name (P8-20), so the label says whose place it took.
function RevealLabel({ name, meta, flag, clubId, nation, replaces }: {
  name: string; meta: string; flag?: string; clubId?: string; nation?: boolean; replaces?: string
}) {
  return (
    <View style={styles.revealWrap} accessible accessibilityLiveRegion="polite" accessibilityLabel={`${t('draw.youreA11y', { name: countryName(name) })}${replaces ? t('draw.inPlaceA11y', { name: countryName(replaces) }) : ''} ${meta}`}>
      <View style={[styles.revealOffset, { backgroundColor: roles.offset }]} />
      <View style={[styles.reveal, { borderColor: roles.line, backgroundColor: roles.surface }]}>
        <Rivets color={roles.line} />
        {/* P8-118: the crest big and on the left, the words beside it. It was
            a 24px mark in the top row with an empty half-label beside the name. */}
        <View style={styles.revealBody}>
          {nation && flag
            ? <RoundFlag roles={roles} emoji={flag} code={name} size={REVEAL_MARK} />
            : <Crest roles={roles} clubId={clubId} name={replaces ?? name} size={REVEAL_MARK} />}
          <View style={styles.revealWords}>
            <KitText t="tag" color={roles.textMuted}>{t('draw.youre')}</KitText>
            <KitText t="superM" color={roles.text}>{countryName(name).toUpperCase()}</KitText>
            {replaces ? <KitText t="tag" color={roles.textMuted}>{t('draw.inPlaceOf', { name: countryName(replaces).toUpperCase() })}</KitText> : null}
            <View style={styles.revealMeta}>
              {!nation && flag ? <RoundFlag roles={roles} emoji={flag} code={name} size={16} /> : null}
              <KitText t="tag" color={roles.text} style={{ flexShrink: 1 }}>{meta}</KitText>
            </View>
          </View>
        </View>
      </View>
    </View>
  )
}

// P8-08: the whole field, strongest first, in its own scrolling list (it was
// the top three). Capped at about six rows so it reads as a list you can
// scroll, and so a 47-nation World Cup doesn't push everything else down.
function Rivals({ teams, teamOvr }: { teams: { clubName: string; ovr: number }[]; teamOvr: number }) {
  return (
    <View>
      <SectionTag roles={roles}>{t('draw.field', { count: teams.length })}</SectionTag>
      <ScrollView style={styles.rivals} nestedScrollEnabled showsVerticalScrollIndicator={Platform.OS === 'web'}>
      {teams.map(team => {
        const gap = team.ovr - teamOvr
        const words = gap > 0 ? t('draw.onYou', { gap: `+${gap}` }) : gap < 0 ? t('draw.onYou', { gap: String(gap) }) : t('draw.level')
        return (
          <View key={team.clubName} style={[styles.row, { borderBottomColor: roles.rule }]} accessible
            accessibilityLabel={t('draw.rivalA11y', { name: team.clubName, ovr: team.ovr }) + (gap > 0 ? t('draw.better', { gap }) : gap < 0 ? t('draw.worse', { gap: -gap }) : t('draw.levelWithYou'))}>
            <KitText t="body" color={roles.text} style={{ flex: 1 }} numberOfLines={1}>{countryName(team.clubName)}</KitText>
            <KitText t="figure" color={roles.text}>{t('draw.ovr', { ovr: team.ovr })}</KitText>
            {gap > 0 ? <Tag roles={roles} variant="loss">{words}</Tag> : <Tag roles={roles}>{words}</Tag>}
          </View>
        )
      })}
      </ScrollView>
    </View>
  )
}

function Fixtures({ items, more }: { items: { md: number; opponent: string; home: boolean }[]; more: number }) {
  return (
    <View>
      <SectionTag roles={roles}>{t('draw.firstFixtures')}</SectionTag>
      {items.map(f => (
        <View key={f.md} style={[styles.row, { borderBottomColor: roles.rule }]} accessible
          accessibilityLabel={f.home ? t('draw.fixtureA11yHome', { md: f.md, name: f.opponent }) : t('draw.fixtureA11yAway', { md: f.md, name: f.opponent })}>
          <KitText t="tag" color={roles.textMuted} style={styles.md}>{t('draw.md', { md: f.md })}</KitText>
          <VenueMark roles={roles} home={f.home} />
          <KitText t="body" color={roles.text} style={{ flex: 1 }} numberOfLines={1}>{f.opponent}</KitText>
        </View>
      ))}
      {more > 0 && <KitText t="tag" color={roles.textMuted} style={styles.more}>{t('draw.moreMatchdays', { count: more })}</KitText>}
    </View>
  )
}

function Loading({ text }: { text: string }) {
  return (
    <KitScreen ground={EVERYDAY} scroll={false} contentStyle={styles.center}>
      <Loader color={roles.text} />
      <KitText t="tag" color={roles.textMuted}>{text}</KitText>
    </KitScreen>
  )
}

function Failed({ noSquad, message }: { noSquad: boolean; message: string }) {
  return (
    <KitScreen ground={EVERYDAY} scroll={false} contentStyle={styles.center}>
      <StripedNotice roles={roles} failed>{noSquad ? t('draw.noSquadYet') : message}</StripedNotice>
      <Plate
        label={noSquad ? t('draw.backToDraft') : t('draw.changeMode')}
        roles={roles}
        variant="secondary"
        onPress={() => router.replace(noSquad ? '/game/draft' : '/game/mode-select')}
      />
    </KitScreen>
  )
}

const season = (y: number) => `${y}/${String(y + 1).slice(-2)}`
const toPundits = () => { router.push('/game/pundits') }

// ── League ──────────────────────────────────────────────────────────────────

function LeaguePlacement() {
  const { draftedPlayers, formation, mode, selectedLeague } = useGameStore()
  const [phase, setPhase] = useState<'ready' | 'spinning' | 'revealed'>('ready')
  // §3 — placement is decided the instant SPIN is tapped (the globe is just
  // playback), so back is blocked from 'spinning' onward.
  useSimBackGuard(phase !== 'ready')
  const [eligible, setEligible] = useState<LeagueSeasonWithTeams[]>([])
  const [placed, setPlaced] = useState<LeagueSeason | null>(null)
  const [loading, setLoading] = useState(true)
  const [failed, setFailed] = useState(false)
  const [spinMs] = useState(globeMs)
  const teamOvr = formation && draftedPlayers.length ? calcTeamOvr(draftedPlayers, getSlotsForFormation(formation)) : 0

  // Champions League and World Cup are their own modes — excluded entirely.
  // League mode draws only from the league you picked (the old "League Pool"
  // toggle let a league run land anywhere, which contradicted the mode).
  useEffect(() => {
    if (!formation || draftedPlayers.length === 0) { setLoading(false); return }
    getAllClubSeasons().then(rows => {
      const seasons = new Map<string, LeagueSeasonWithTeams>()
      for (const cs of rows) {
        if (cs.league_id.startsWith('ucl_') || cs.league_id.startsWith('wc_') || cs.league_id.startsWith('cucl_')) continue
        if (mode === 'league' && selectedLeague && cs.league_id !== selectedLeague) continue
        const key = `${cs.league_id}_${cs.year_start}`
        if (!seasons.has(key)) {
          seasons.set(key, {
            leagueId: cs.league_id, leagueName: cs.league_name,
            yearStart: cs.year_start, gamesPerSeason: cs.games_per_season,
            format: cs.league_format, teams: [],
          })
        }
        seasons.get(key)!.teams.push({ club_id: cs.club_id, club_name: cs.club_name, historical_ovr: cs.historical_ovr })
      }
      setEligible(filterEligibleLeagues(teamOvr, [...seasons.values()], mode === 'chaos'))
    })
      .catch(e => { log.warn('db', 'draw: seasons failed', e); setFailed(true) })
      .finally(() => setLoading(false))
  }, [])

  const fixtures = useMemo(() => {
    if (!placed) return null
    const sims: SimTeam[] = placed.teams.map(t => ({
      ...t, form: 0, stats: { played: 0, won: 0, drawn: 0, lost: 0, goalsFor: 0, goalsAgainst: 0, points: 0 },
    }))
    const mine = generateFixtures(sims).filter(f => f.home.isPlayer || f.away.isPlayer)
    const total = Math.max(0, ...mine.map(f => f.matchday))
    const first = mine.filter(f => f.matchday <= 3).sort((a, b) => a.matchday - b.matchday)
      .map(f => ({ md: f.matchday, home: f.home.isPlayer, opponent: f.home.isPlayer ? f.away.clubName : f.home.clubName }))
    return { first, more: total - first.length }
  }, [placed])

  const { profile, isGuest } = useUserStore()   // P8-20: your side takes your name
  function spin() {
    if (eligible.length === 0) return
    const season = time('placement:build', () => buildLeagueSeason(spinPlacement(eligible), teamOvr, sideName(isGuest ? null : profile?.username)))
    setPlaced(season)
    // P8-132: your crest on the side you field (the league modes always).
    activateCrestFor(season.teams.find(t => t.isPlayer)?.clubId, useGameStore.getState().mode)
    setPhase('spinning')
  }

  function lock() {
    setPhase('revealed')
  }

  function next() {
    if (!placed) return
    useGameStore.getState().setPlacement(placed)
    toPundits()
  }

  if (loading) return <Loading text={t('draw.checking')} />
  if (!formation || draftedPlayers.length === 0) return <Failed noSquad message="" />
  if (failed || eligible.length === 0) return <Failed noSquad={false} message={t('draw.noMatch')} />

  return (
    <DrawScreen
      title={t('draw.theDraw')}
      cta={phase === 'ready'
        ? <Plate label={t('draw.spinGlobe')} icon="again" roles={roles} onPress={spin} />
        : phase === 'revealed'
          ? <Plate label={t('draw.pundits')} icon="forward" roles={roles} onPress={next} />
          : null}
    >
      {phase === 'ready' ? (
        <View style={styles.ready}>
          {/* P8-169: Chaos and Cursed announce themselves from the draw on. */}
          <ModeBanner roles={roles} mode={mode} />
          <KitText t="superS" color={roles.text}>{t('draw.whereGoing')}</KitText>
          <Tag roles={roles}>{t('draw.inTheDraw', { count: eligible.length })}</Tag>
          <KitText t="body" color={roles.textMuted}>{t('draw.squadRates', { ovr: teamOvr })}</KitText>
        </View>
      ) : placed && (
        <>
          <GlobePanel targetId={isoForLeague(placed.leagueId)} flag={flagForLeague(placed.leagueId)} spinMs={spinMs} onLock={lock} locked={phase === 'revealed'} />
          {phase === 'revealed' && (
            <>
              {/* P8-11: the competition you've landed in, with its country's
                  flag, above the club whose place you took. The label's meta
                  line drops the league name now that it's said here. */}
              <View style={styles.leagueLine}>
                {/* The competition's mark, then its country's flag (P8-12). */}
                <Crest roles={roles} clubId={placed.leagueId} name={placed.leagueName} size={24} competition />
                {flagForLeague(placed.leagueId)
                  ? <RoundFlag roles={roles} emoji={flagForLeague(placed.leagueId)} code={placed.leagueName} size={20} />
                  : null}
                <KitText t="title" color={roles.text} numberOfLines={2} style={{ flex: 1 }}>{placed.leagueName}</KitText>
              </View>
              <RevealLabel
                clubId={placed.teams.find(t => t.isPlayer)?.clubId}
                name={placed.teams.find(t => t.isPlayer)?.clubName ?? placed.replacedTeamName}
                replaces={placed.replacedTeamName}
                meta={t('draw.clubsMeta', { season: season(placed.yearStart), count: placed.teams.length }).toUpperCase()}
              />
              <Rivals teamOvr={teamOvr} teams={placed.teams.filter(t => !t.isPlayer).sort((a, b) => b.ovr - a.ovr)} />
              {fixtures && <Fixtures items={fixtures.first} more={fixtures.more} />}
            </>
          )}
        </>
      )}
    </DrawScreen>
  )
}

// ── Champions League (finals) ───────────────────────────────────────────────

function CLPlacement() {
  const { draftedPlayers, formation, setClTeams, setClYear, mode } = useGameStore()
  const comp = compOfMode(mode) ?? EUROPE.ucl
  const [loading, setLoading] = useState(true)
  // §3 — the club is picked in the mount effect, before any animation.
  useSimBackGuard(!loading)
  const [spinMs] = useState(globeMs)
  const [revealed, setRevealed] = useState(false)
  const [info, setInfo] = useState<{ name: string; clubId?: string; country?: string; year: number; pot: number; count: number; ovr: number; rivals: { clubName: string; ovr: number }[] } | null>(null)
  const [count, setCount] = useState(0)

  useEffect(() => {
    async function init() {
      if (!formation || draftedPlayers.length === 0) { setLoading(false); return }
      const ovr = calcTeamOvr(draftedPlayers, getSlotsForFormation(formation))
      const rows = await getClubSeasonsForMode(comp.mode)
      if (rows.length === 0) { setLoading(false); return }
      // A random UCL edition, then a random club within it.
      const years = [...new Set(rows.map(r => r.year_start))]
      const year = years[Math.floor(Math.random() * years.length)]
      const edition = rows.filter(r => r.year_start === year)
      setCount(edition.length)
      if (edition.length < 8) { setLoading(false); return }
      setClYear(year)
      const sorted = [...edition].sort((a, b) => a.historical_ovr - b.historical_ovr)
      const pick = Math.floor(Math.random() * sorted.length)
      // The Europa and Conference Leagues keep their real pots (kept in the
      // club-season's league_position); you take the pot of the club you replace.
      const clubs = sorted.map((r, i) => ({ clubId: r.club_id, clubName: r.club_name, ovr: i === pick ? ovr : r.historical_ovr, isPlayer: i === pick,
        ...(comp.realPots && r.league_position ? { pot: r.league_position } : {}) }))
      // P8-114: the pots made drawable for the country rule.
      const teams = buildCLTeams(clubs, t => countryForClClub(t.clubName))
      setClTeams(teams)
      activateCrestFor(teams.find(t => t.isPlayer)?.clubId, comp.mode)   // P8-132, with "everywhere" only
      setInfo({
        name: sorted[pick].club_name,
        clubId: sorted[pick].club_id,
        country: countryForClClub(sorted[pick].club_name),
        year, pot: teams.find(t => t.isPlayer)!.pot, count: teams.length, ovr,
        rivals: teams.filter(t => !t.isPlayer).sort((a, b) => b.ovr - a.ovr),
      })
      setLoading(false)
    }
    init().catch(e => { log.warn('db', 'draw: ucl failed', e); setLoading(false) })
  }, [])

  if (loading) return <Loading text={t('draw.drawingComp', { comp: comp.name })} />
  if (!formation || draftedPlayers.length === 0) return <Failed noSquad message="" />
  if (!info) return <Failed noSquad={false} message={count > 0 ? t('draw.notEnoughClubs') : t('draw.compFailed')} />

  return (
    <DrawScreen title={t('draw.theDraw')}
      cta={revealed ? <Plate label={t('draw.pundits')} icon="forward" roles={roles} onPress={toPundits} /> : null}>
      <GlobePanel targetId={isoForCountryName(info.country)} targetName={info.country} flag={flagForCountry(info.country)} spinMs={spinMs}
        onLock={() => { setRevealed(true) }} locked={revealed} />
      {revealed && (
        <>
          <RevealLabel
            name={info.name}
            clubId={info.clubId}
            flag={flagForCountry(info.country) || undefined}
            meta={t('draw.compMeta', { comp: comp.name.toUpperCase(), season: season(info.year), pot: info.pot, count: info.count })}
          />
          <KitText t="body" color={roles.textMuted}>
            {comp.perPot === 1
              ? t('draw.sixGames') : t('draw.eightGames')}
          </KitText>
          <Rivals teamOvr={info.ovr} teams={info.rivals} />
        </>
      )}
    </DrawScreen>
  )
}

// ── Champions League (full path) ────────────────────────────────────────────
// You land in a real domestic league first. Nothing is simulated yet — your
// league season decides your Champions League entry, or whether you get one.

type ChosenClub = { clubId: string; clubName: string; leagueRank: number; leagueName: string; country?: string }

function CustomCLPlacement() {
  const { draftedPlayers, formation, setClYear, setCustomUclPlayerClubId, europeanTarget } = useGameStore()
  const hunting = europeanTarget && europeanTarget !== 'any' ? EUROPE[europeanTarget].name : null
  const { profile, isGuest } = useUserStore()   // your side takes your name, as in a league run
  const [loading, setLoading] = useState(true)
  useSimBackGuard(!loading)   // §3 — club is picked before loading flips false
  const [spinMs] = useState(globeMs)
  const [chosen, setChosen] = useState<ChosenClub | null>(null)
  const [leagueSize, setLeagueSize] = useState(0)
  const [revealed, setRevealed] = useState(false)

  useEffect(() => {
    async function init() {
      if (!formation || draftedPlayers.length === 0) { setLoading(false); return }
      const associations: AssociationEntry[] = await getCustomUclAssociations()
      const all = associations.flatMap(a => a.clubs.map(c => ({ assoc: a, club: c })))
      if (all.length === 0) { setLoading(false); return }
      // Uniform over every club in every UEFA league. A hunt (P8.5-39) first
      // picks the league, weighed by how often a season there ends in its
      // target (huntWeight, measured), then a club in it.
      const hunt = europeanTarget && europeanTarget !== 'any' ? europeanTarget : null
      const weights = hunt ? associations.map(a => (a.clubs.length ? huntWeight(a.rank, hunt) : 0)) : []
      const total = weights.reduce((x, y) => x + y, 0)
      let pick = all[Math.floor(Math.random() * all.length)]
      if (hunt && total > 0) {
        let r = Math.random() * total, i = 0
        while (r >= weights[i] && i < weights.length - 1) { r -= weights[i]; i++ }
        const assoc = associations[i]
        pick = { assoc, club: assoc.clubs[Math.floor(Math.random() * assoc.clubs.length)] }
      }
      setChosen({
        clubId: pick.club.clubId, clubName: pick.club.clubName,
        leagueRank: pick.assoc.rank, leagueName: pick.assoc.name, country: pick.assoc.country,
      })
      setLeagueSize(pick.assoc.clubs.length)
      setLoading(false)
    }
    init().catch(e => { log.warn('db', 'draw: custom ucl failed', e); setLoading(false) })
  }, [])

  function start() {
    if (!chosen) return
    setClYear(2025)
    setCustomUclPlayerClubId(chosen.clubId)
    activateCrestFor(chosen.clubId, 'champions_league_custom')   // P8-132, with "everywhere" only
    router.push('/game/custom-ucl-simulation')
  }

  if (loading) return <Loading text={t('draw.drawingLeague')} />
  if (!formation || draftedPlayers.length === 0) return <Failed noSquad message="" />
  if (!chosen) return <Failed noSquad={false} message={t('draw.compFailed')} />

  return (
    <DrawScreen title={t('draw.theDraw')}
      cta={revealed ? <Plate label={t('draw.startLeague')} icon="forward" roles={roles} onPress={start} /> : null}>
      <GlobePanel targetId={isoForCountryName(chosen.country)} flag={flagForCountry(chosen.country)} spinMs={spinMs}
        onLock={() => { setRevealed(true) }} locked={revealed} />
      {revealed && (
        <>
          <RevealLabel
            name={sideName(isGuest ? null : profile?.username)}
            replaces={chosen.clubName}
            clubId={chosen.clubId}
            flag={flagForCountry(chosen.country) || undefined}
            meta={t('draw.assocMeta', { league: chosen.leagueName, count: leagueSize, rank: chosen.leagueRank }).toUpperCase()}
          />
          {/* P8.5-21: a hunting run says so wherever it shows, so it's never taken for a normal one. */}
          {hunting ? (
            <>
              <Tag roles={roles} variant="selected">{t('draw.hunting', { comp: hunting.toUpperCase() })}</Tag>
              <KitText t="body" color={roles.textMuted}>
                {t('draw.huntingNote', { comp: hunting })}
              </KitText>
            </>
          ) : (
            <KitText t="body" color={roles.textMuted}>
              {t('draw.domesticFirst')}
            </KitText>
          )}
          <View style={styles.stakesHead}>
            <SectionTag roles={roles}>{t('draw.eachFinish')}</SectionTag>
            <InfoBubble topic="entry_point" accent={roles.text} size={15} />
          </View>
          <PositionStakes roles={roles} rank={chosen.leagueRank} />
        </>
      )}
    </DrawScreen>
  )
}

// ── World Cup ───────────────────────────────────────────────────────────────

function WCPlacement() {
  const { draftedPlayers, formation, setWcTeams } = useGameStore()
  const [loading, setLoading] = useState(true)
  useSimBackGuard(!loading)   // §3 — nation is picked before loading flips false
  const [spinMs] = useState(globeMs)
  const [revealed, setRevealed] = useState(false)
  const [count, setCount] = useState(0)
  const [info, setInfo] = useState<{ id: string; name: string; year: string; ovr: number; rivals: { clubName: string; ovr: number }[] } | null>(null)

  useEffect(() => {
    async function init() {
      if (!formation || draftedPlayers.length === 0) { setLoading(false); return }
      const ovr = calcTeamOvr(draftedPlayers, getSlotsForFormation(formation))
      const rows = await getClubSeasonsForMode('world_cup')
      if (rows.length === 0) { setLoading(false); return }
      const latest = Math.max(...rows.map(r => r.year_start))
      const edition = [...rows.filter(r => r.year_start === latest)].sort((a, b) => a.historical_ovr - b.historical_ovr)
      setCount(edition.length)
      if (edition.length < 4) { setLoading(false); return }
      // Any of the 48 nations, uniformly: Brazil or a minnow.
      const pick = Math.floor(Math.random() * edition.length)
      const teams = buildWCTeams(edition.map((r, i) => ({
        clubId: r.club_id,
        clubName: i === pick ? `${r.club_name} XI` : r.club_name,
        ovr: i === pick ? ovr : r.historical_ovr,
        isPlayer: i === pick,
      })))
      setWcTeams(teams)
      activateCrestFor(teams.find(t => t.isPlayer)?.clubId, 'world_cup')   // P8-132, with "everywhere" only
      setInfo({
        id: edition[pick].club_id, name: edition[pick].club_name, year: String(latest), ovr,
        rivals: teams.filter(t => !t.isPlayer).sort((a, b) => b.ovr - a.ovr),
      })
      setLoading(false)
    }
    init().catch(e => { log.warn('db', 'draw: wc failed', e); setLoading(false) })
  }, [])

  if (loading) return <Loading text={t('draw.drawingWc')} />
  if (!formation || draftedPlayers.length === 0) return <Failed noSquad message="" />
  if (!info) return <Failed noSquad={false} message={count > 0 ? t('draw.notEnoughNations') : t('draw.wcFailed')} />

  return (
    <DrawScreen title={t('draw.theDraw')}
      cta={revealed ? <Plate label={t('draw.pundits')} icon="forward" roles={roles} onPress={toPundits} /> : null}>
      <GlobePanel targetId={isoForNationId(info.id)} flag={getFlag(info.id) ?? ''} spinMs={spinMs}
        onLock={() => { setRevealed(true) }} locked={revealed} />
      {revealed && (
        <>
          <RevealLabel
            nation
            name={info.name}
            flag={getFlag(info.id) ?? undefined}
            meta={t('draw.wcMeta', { year: info.year })}
          />
          <KitText t="body" color={roles.textMuted}>
            {t('draw.wcFormat')}
          </KitText>
          <Rivals teamOvr={info.ovr} teams={info.rivals} />
        </>
      )}
    </DrawScreen>
  )
}

const styles = StyleSheet.create({
  rivals: { maxHeight: 300 },
  leagueLine: { flexDirection: 'row', alignItems: 'center', gap: space[2], marginBottom: space[2] },
  wide: { flex: 1, flexDirection: 'row', gap: space[6] },
  wideGlobe: { flex: 1.2, minWidth: 0 },
  wideSide: { flex: 1, minWidth: 0 },
  screen: { flex: 1, paddingBottom: space[3] },
  body: { flex: 1 },
  scroll: { gap: space[4], paddingBottom: space[5] },
  cta: { paddingTop: space[2] },
  center: { flex: 1, justifyContent: 'center', gap: space[4] },
  ready: { gap: space[3], paddingVertical: space[6] },
  globePanel: { alignItems: 'center', paddingVertical: space[3], gap: space[1] },
  revealWrap: { paddingRight: 2, paddingBottom: 2 },
  revealOffset: { position: 'absolute', left: 2, top: 2, right: 0, bottom: 0 },
  reveal: { borderWidth: border.plate, padding: space[4], gap: space[1] },
  revealBody: { flexDirection: 'row', alignItems: 'center', gap: space[4] },
  revealWords: { flex: 1, gap: space[1] },
  revealMeta: { flexDirection: 'row', alignItems: 'center', gap: space[1] },
  row: { flexDirection: 'row', alignItems: 'center', gap: space[3], minHeight: 40, borderBottomWidth: StyleSheet.hairlineWidth },
  md: { width: 40 },
  more: { marginTop: space[2] },
  stakesHead: { flexDirection: 'row', alignItems: 'center', gap: space[2] },
})
