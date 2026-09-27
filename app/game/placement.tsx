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
import { InfoBubble } from '@/components/InfoBubble'
import { PositionStakes } from '@/components/CustomUclViewers'
import { isoForLeague, isoForNationId, isoForCountryName, flagForCountry, flagForLeague, countryForClClub } from '@/data/geo-iso'
import { getCustomUclAssociations } from '@/db/queries/custom-ucl'
import type { AssociationEntry } from '@/engine/cl-access'
import type { LeagueSeason, LeagueSeasonWithTeams } from '@/types/game'
import type { SimTeam } from '@/types/simulation'
import { useSimBackGuard } from '@/hooks/useSimBackGuard'
import { ROLES, space, border, colourwayFor, prim, type Roles } from '@/theme'
import {
  KitScreen, KitText, RunHeader, Plate, Tag, SectionTag, Rivets, StripedNotice, RoundFlag, VenueMark, Crest,} from '@/components/kit'

// Stage 5 · The draw — docs/ui-overhaul/07b B7.
//
// Four data sources, one layout: the globe spins on a nylon panel (tap it to
// land the spin), your fate lands as a riveted label, then the strongest rivals
// (with the gap stated in words, not only coloured) and, where the fixtures are
// known up front, your first few. The draw is decided before the globe turns,
// so every placement is back-guarded from the moment it's made (Big Fixes §3).
const roles = ROLES.cotton

// The globe plays in full on the first draw of a session, at half length after.
let drawsThisSession = 0
const globeMs = () => (drawsThisSession++ === 0 ? 2600 : 1300)

export default function PlacementScreen() {
  const { mode } = useGameStore()
  if (mode === 'champions_league')        return <CLPlacement />
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
    <RunHeader roles={roles} stage={5} colourway={colourwayFor(mode)} title={title} back={false}
      skipped={mode === 'chaos' || mode === 'cursed' ? [2] : []} />
  )
  // Expanded (10-ADAPT §2.2): the globe on the left, the reveal, rivals,
  // fixtures and the plate on the right. Before the spin there's no globe
  // yet, so everything stays in the right-hand column.
  if (wide) {
    const items = flatten(children)
    const globe = items.find(c => React.isValidElement(c) && c.type === GlobePanel)
    const rest = items.filter(c => c !== globe)
    return (
      <KitScreen ground="cotton" scroll={false} width="wide" contentStyle={styles.screen}>
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
    <KitScreen ground="cotton" scroll={false} contentStyle={styles.screen}>
      {header}
      <ScrollView style={styles.body} contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={Platform.OS === 'web'}>
        {children}
      </ScrollView>
      {cta ? <View style={styles.cta}>{cta}</View> : null}
    </KitScreen>
  )
}

function GlobePanel({ targetId, targetName, spinMs, onLock, locked }: {
  targetId?: number | null
  targetName?: string | null
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
      accessibilityLabel={locked ? 'The draw has landed' : 'The globe is spinning. Tap to land it.'}
      style={[styles.globePanel, { backgroundColor: prim.nylon }]}
    >
      {/* Bigger in the wide layout's own pane; same path count, so no extra cost per frame. */}
      <GlobeReveal targetId={targetId} targetName={targetName} accent={prim.orange} spinMs={spinMs} onLock={onLock} skip={skip} size={wide ? 360 : 220} />
      {!locked && <KitText t="tag" color={ROLES.nylon.textMuted}>TAP TO LAND IT</KitText>}
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
    <View style={styles.revealWrap} accessible accessibilityLiveRegion="polite" accessibilityLabel={`You're ${name}.${replaces ? ` In place of ${replaces}.` : ''} ${meta}`}>
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
            <KitText t="tag" color={roles.textMuted}>YOU'RE</KitText>
            <KitText t="superM" color={roles.text}>{name.toUpperCase()}</KitText>
            {replaces ? <KitText t="tag" color={roles.textMuted}>{`IN PLACE OF ${replaces.toUpperCase()}`}</KitText> : null}
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
      <SectionTag roles={roles}>{`The field, strongest first · ${teams.length}`}</SectionTag>
      <ScrollView style={styles.rivals} nestedScrollEnabled showsVerticalScrollIndicator={Platform.OS === 'web'}>
      {teams.map(t => {
        const gap = t.ovr - teamOvr
        const words = gap > 0 ? `+${gap} ON YOU` : gap < 0 ? `${gap} ON YOU` : 'LEVEL'
        return (
          <View key={t.clubName} style={[styles.row, { borderBottomColor: roles.rule }]} accessible
            accessibilityLabel={`${t.clubName}, rating ${t.ovr}, ${gap > 0 ? `${gap} better than you` : gap < 0 ? `${-gap} worse than you` : 'level with you'}`}>
            <KitText t="body" color={roles.text} style={{ flex: 1 }} numberOfLines={1}>{t.clubName}</KitText>
            <KitText t="figure" color={roles.text}>{`OVR ${t.ovr}`}</KitText>
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
      <SectionTag roles={roles}>Your first fixtures</SectionTag>
      {items.map(f => (
        <View key={f.md} style={[styles.row, { borderBottomColor: roles.rule }]} accessible
          accessibilityLabel={`Matchday ${f.md}, ${f.home ? 'home to' : 'away at'} ${f.opponent}`}>
          <KitText t="tag" color={roles.textMuted} style={styles.md}>{`MD${f.md}`}</KitText>
          <VenueMark roles={roles} home={f.home} />
          <KitText t="body" color={roles.text} style={{ flex: 1 }} numberOfLines={1}>{f.opponent}</KitText>
        </View>
      ))}
      {more > 0 && <KitText t="tag" color={roles.textMuted} style={styles.more}>{`${more} MORE MATCHDAYS`}</KitText>}
    </View>
  )
}

function Loading({ text }: { text: string }) {
  return (
    <KitScreen ground="cotton" scroll={false} contentStyle={styles.center}>
      <Loader color={roles.text} />
      <KitText t="tag" color={roles.textMuted}>{text}</KitText>
    </KitScreen>
  )
}

function Failed({ noSquad, message }: { noSquad: boolean; message: string }) {
  return (
    <KitScreen ground="cotton" scroll={false} contentStyle={styles.center}>
      <StripedNotice roles={roles} failed>{noSquad ? "There's no squad yet." : message}</StripedNotice>
      <Plate
        label={noSquad ? 'Back to the draft' : 'Change mode'}
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
      .catch(e => { console.warn('[draw] seasons failed:', e); setFailed(true) })
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
    const season = buildLeagueSeason(spinPlacement(eligible), teamOvr, sideName(isGuest ? null : profile?.username))
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

  if (loading) return <Loading text="Checking where you can land…" />
  if (!formation || draftedPlayers.length === 0) return <Failed noSquad message="" />
  if (failed || eligible.length === 0) return <Failed noSquad={false} message="No league-season matches this squad. Try another mode." />

  return (
    <DrawScreen
      title="The draw"
      cta={phase === 'ready'
        ? <Plate label="Spin the globe" icon="again" roles={roles} onPress={spin} />
        : phase === 'revealed'
          ? <Plate label="What the pundits think" icon="forward" roles={roles} onPress={next} />
          : null}
    >
      {phase === 'ready' ? (
        <View style={styles.ready}>
          <KitText t="superS" color={roles.text}>WHERE ARE YOU GOING?</KitText>
          <Tag roles={roles}>{`${eligible.length} LEAGUE-SEASON${eligible.length === 1 ? '' : 'S'} IN THE DRAW`}</Tag>
          <KitText t="body" color={roles.textMuted}>{`Your squad rates ${teamOvr}. You'll replace a real club in a real season.`}</KitText>
        </View>
      ) : placed && (
        <>
          <GlobePanel targetId={isoForLeague(placed.leagueId)} spinMs={spinMs} onLock={lock} locked={phase === 'revealed'} />
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
                meta={`${season(placed.yearStart)} · ${placed.teams.length} CLUBS`.toUpperCase()}
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
  const { draftedPlayers, formation, setClTeams, setClYear } = useGameStore()
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
      const rows = await getClubSeasonsForMode('champions_league')
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
      const clubs = sorted.map((r, i) => ({ clubId: r.club_id, clubName: r.club_name, ovr: i === pick ? ovr : r.historical_ovr, isPlayer: i === pick }))
      // P8-114: the pots made drawable for the country rule.
      const teams = buildCLTeams(clubs, t => countryForClClub(t.clubName))
      setClTeams(teams)
      activateCrestFor(teams.find(t => t.isPlayer)?.clubId, 'champions_league')   // P8-132, with "everywhere" only
      setInfo({
        name: sorted[pick].club_name,
        clubId: sorted[pick].club_id,
        country: countryForClClub(sorted[pick].club_name),
        year, pot: teams.find(t => t.isPlayer)!.pot, count: teams.length, ovr,
        rivals: teams.filter(t => !t.isPlayer).sort((a, b) => b.ovr - a.ovr),
      })
      setLoading(false)
    }
    init().catch(e => { console.warn('[draw] ucl failed:', e); setLoading(false) })
  }, [])

  if (loading) return <Loading text="Drawing the Champions League…" />
  if (!formation || draftedPlayers.length === 0) return <Failed noSquad message="" />
  if (!info) return <Failed noSquad={false} message={count > 0 ? 'Not enough clubs loaded to play this competition.' : "This competition's data didn't load."} />

  return (
    <DrawScreen title="The draw"
      cta={revealed ? <Plate label="What the pundits think" icon="forward" roles={roles} onPress={toPundits} /> : null}>
      <GlobePanel targetId={isoForCountryName(info.country)} targetName={info.country} spinMs={spinMs}
        onLock={() => { setRevealed(true) }} locked={revealed} />
      {revealed && (
        <>
          <RevealLabel
            name={info.name}
            clubId={info.clubId}
            flag={flagForCountry(info.country) || undefined}
            meta={`CHAMPIONS LEAGUE · ${season(info.year)} · POT ${info.pot} · ${info.count} CLUBS`}
          />
          <KitText t="body" color={roles.textMuted}>
            Eight league-phase games. The top eight go straight to the round of 16; ninth to 24th play off.
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
  const { draftedPlayers, formation, setClYear, setCustomUclPlayerClubId } = useGameStore()
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
      // Uniform over every club in every UEFA league.
      const pick = all[Math.floor(Math.random() * all.length)]
      setChosen({
        clubId: pick.club.clubId, clubName: pick.club.clubName,
        leagueRank: pick.assoc.rank, leagueName: pick.assoc.name, country: pick.assoc.country,
      })
      setLeagueSize(pick.assoc.clubs.length)
      setLoading(false)
    }
    init().catch(e => { console.warn('[draw] custom ucl failed:', e); setLoading(false) })
  }, [])

  function start() {
    if (!chosen) return
    setClYear(2025)
    setCustomUclPlayerClubId(chosen.clubId)
    activateCrestFor(chosen.clubId, 'champions_league_custom')   // P8-132, with "everywhere" only
    router.push('/game/custom-ucl-simulation')
  }

  if (loading) return <Loading text="Drawing your league…" />
  if (!formation || draftedPlayers.length === 0) return <Failed noSquad message="" />
  if (!chosen) return <Failed noSquad={false} message="This competition's data didn't load." />

  return (
    <DrawScreen title="The draw"
      cta={revealed ? <Plate label="Start your league season" icon="forward" roles={roles} onPress={start} /> : null}>
      <GlobePanel targetId={isoForCountryName(chosen.country)} spinMs={spinMs}
        onLock={() => { setRevealed(true) }} locked={revealed} />
      {revealed && (
        <>
          <RevealLabel
            name={sideName(isGuest ? null : profile?.username)}
            replaces={chosen.clubName}
            clubId={chosen.clubId}
            flag={flagForCountry(chosen.country) || undefined}
            meta={`${chosen.leagueName} · ${leagueSize} CLUBS · ASSOCIATION #${chosen.leagueRank}`.toUpperCase()}
          />
          <KitText t="body" color={roles.textMuted}>
            First you play your domestic season. Where you finish decides your Champions League entry. Finish too low and there's no Europe at all.
          </KitText>
          <View style={styles.stakesHead}>
            <SectionTag roles={roles}>What each finish earns</SectionTag>
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
    init().catch(e => { console.warn('[draw] wc failed:', e); setLoading(false) })
  }, [])

  if (loading) return <Loading text="Drawing the World Cup…" />
  if (!formation || draftedPlayers.length === 0) return <Failed noSquad message="" />
  if (!info) return <Failed noSquad={false} message={count > 0 ? 'Not enough nations loaded to play the World Cup.' : "The World Cup data didn't load."} />

  return (
    <DrawScreen title="The draw"
      cta={revealed ? <Plate label="What the pundits think" icon="forward" roles={roles} onPress={toPundits} /> : null}>
      <GlobePanel targetId={isoForNationId(info.id)} spinMs={spinMs}
        onLock={() => { setRevealed(true) }} locked={revealed} />
      {revealed && (
        <>
          <RevealLabel
            nation
            name={info.name}
            flag={flagForCountry(info.name) || undefined}
            meta={`WORLD CUP · ${info.year} · 48 NATIONS · 12 GROUPS`}
          />
          <KitText t="body" color={roles.textMuted}>
            Three group games. The top two in each group and the eight best third-placed teams reach the round of 32. Groups are drawn when the tournament starts.
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
