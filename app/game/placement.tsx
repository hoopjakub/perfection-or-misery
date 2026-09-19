import React, { useState, useEffect, useMemo } from 'react'
import { View, Pressable, ScrollView, StyleSheet, ActivityIndicator } from 'react-native'
import { router } from 'expo-router'
import { useGameStore } from '@/store/gameStore'
import { getAllClubSeasons, getClubSeasonsForMode } from '@/db/queries/seasons'
import { filterEligibleLeagues, spinPlacement, buildLeagueSeason } from '@/engine/placement'
import { calcTeamOvr } from '@/engine/rating'
import { getSlotsForFormation } from '@/engine/formations'
import { buildCLTeams } from '@/engine/cl-sim'
import { buildWCTeams } from '@/engine/world-cup-sim'
import { generateFixtures } from '@/engine/fixtures'
import { GlobeReveal } from '@/components/GlobeReveal'
import { InfoBubble } from '@/components/InfoBubble'
import { PositionStakes } from '@/components/CustomUclViewers'
import { isoForLeague, isoForNationId, isoForCountryName, flagForCountry, countryForClClub } from '@/data/geo-iso'
import { getCustomUclAssociations } from '@/db/queries/custom-ucl'
import type { AssociationEntry } from '@/engine/cl-access'
import type { LeagueSeason, LeagueSeasonWithTeams } from '@/types/game'
import type { SimTeam } from '@/types/simulation'
import { useSimBackGuard } from '@/hooks/useSimBackGuard'
import { haptic } from '@/lib/haptics'
import { ROLES, space, border, colourwayFor, prim, type Roles } from '@/theme'
import {
  KitScreen, KitText, RunHeader, Plate, Tag, SectionTag, Rivets, StripedNotice, RoundFlag,
} from '@/components/kit'

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

function DrawScreen({ title, children, cta }: { title: string; children: React.ReactNode; cta?: React.ReactNode }) {
  const { mode } = useGameStore()
  return (
    <KitScreen ground="cotton" scroll={false} contentStyle={styles.screen}>
      <RunHeader roles={roles} stage={5} colourway={colourwayFor(mode)} title={title} back={false}
        skipped={mode === 'chaos' || mode === 'cursed' ? [2] : []} />
      <ScrollView style={styles.body} contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
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
  return (
    <Pressable
      onPress={() => setSkip(true)}
      disabled={locked}
      accessibilityRole="button"
      accessibilityLabel={locked ? 'The draw has landed' : 'The globe is spinning. Tap to land it.'}
      style={[styles.globePanel, { backgroundColor: prim.nylon }]}
    >
      <GlobeReveal targetId={targetId} targetName={targetName} accent={prim.orange} spinMs={spinMs} onLock={onLock} skip={skip} />
      {!locked && <KitText t="tag" color={ROLES.nylon.textMuted}>TAP TO LAND IT</KitText>}
    </Pressable>
  )
}

function RevealLabel({ name, meta, flag }: { name: string; meta: string; flag?: string }) {
  return (
    <View style={styles.revealWrap} accessible accessibilityLiveRegion="polite" accessibilityLabel={`You're ${name}. ${meta}`}>
      <View style={[styles.revealOffset, { backgroundColor: roles.offset }]} />
      <View style={[styles.reveal, { borderColor: roles.line, backgroundColor: roles.surface }]}>
        <Rivets color={roles.line} />
        <View style={styles.revealTop}>
          {flag ? <RoundFlag roles={roles} emoji={flag} code={name} size={24} /> : null}
          <KitText t="tag" color={roles.textMuted}>YOU'RE</KitText>
        </View>
        <KitText t="superM" color={roles.text}>{`"${name.toUpperCase()}"`}</KitText>
        <KitText t="tag" color={roles.text}>{meta}</KitText>
      </View>
    </View>
  )
}

function Rivals({ teams, teamOvr }: { teams: { clubName: string; ovr: number }[]; teamOvr: number }) {
  return (
    <View>
      <SectionTag roles={roles}>Strongest rivals</SectionTag>
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
          <Tag roles={roles} variant={f.home ? 'selected' : 'data'}>{f.home ? 'HOME' : 'AWAY'}</Tag>
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
      <ActivityIndicator color={roles.text} />
      <KitText t="tag" color={roles.textMuted}>{text}</KitText>
    </KitScreen>
  )
}

function Failed({ noSquad, message }: { noSquad: boolean; message: string }) {
  return (
    <KitScreen ground="cotton" scroll={false} contentStyle={styles.center}>
      <StripedNotice roles={roles}>{noSquad ? "There's no squad yet." : message}</StripedNotice>
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
const toPundits = () => { haptic('light'); router.push('/game/pundits') }

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

  function spin() {
    if (eligible.length === 0) return
    haptic('light')
    setPlaced(buildLeagueSeason(spinPlacement(eligible), teamOvr))
    setPhase('spinning')
  }

  function lock() {
    haptic('medium')
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
              <RevealLabel
                name={placed.replacedTeamName}
                meta={`${placed.leagueName} · ${season(placed.yearStart)} · ${placed.teams.length} CLUBS`.toUpperCase()}
              />
              <Rivals teamOvr={teamOvr} teams={placed.teams.filter(t => !t.isPlayer).sort((a, b) => b.ovr - a.ovr).slice(0, 3)} />
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
  const [info, setInfo] = useState<{ name: string; country?: string; year: number; pot: number; count: number; ovr: number; rivals: { clubName: string; ovr: number }[] } | null>(null)
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
      const teams = buildCLTeams(clubs)
      setClTeams(teams)
      setInfo({
        name: sorted[pick].club_name,
        country: countryForClClub(sorted[pick].club_name),
        year, pot: teams.find(t => t.isPlayer)!.pot, count: teams.length, ovr,
        rivals: teams.filter(t => !t.isPlayer).sort((a, b) => b.ovr - a.ovr).slice(0, 3),
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
        onLock={() => { haptic('medium'); setRevealed(true) }} locked={revealed} />
      {revealed && (
        <>
          <RevealLabel
            name={info.name}
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
    haptic('heavy')
    router.push('/game/custom-ucl-simulation')
  }

  if (loading) return <Loading text="Drawing your league…" />
  if (!formation || draftedPlayers.length === 0) return <Failed noSquad message="" />
  if (!chosen) return <Failed noSquad={false} message="This competition's data didn't load." />

  return (
    <DrawScreen title="The draw"
      cta={revealed ? <Plate label="Start your league season" icon="forward" roles={roles} onPress={start} /> : null}>
      <GlobePanel targetId={isoForCountryName(chosen.country)} spinMs={spinMs}
        onLock={() => { haptic('medium'); setRevealed(true) }} locked={revealed} />
      {revealed && (
        <>
          <RevealLabel
            name={chosen.clubName}
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
          {/* Still the old dark component (Phase 3 rebuilds it), so it sits on
              a nylon panel rather than clashing with the cotton. */}
          <View style={[styles.legacyPanel, { backgroundColor: prim.nylon }]}>
            <PositionStakes rank={chosen.leagueRank} />
          </View>
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
      setInfo({
        id: edition[pick].club_id, name: edition[pick].club_name, year: String(latest), ovr,
        rivals: teams.filter(t => !t.isPlayer).sort((a, b) => b.ovr - a.ovr).slice(0, 3),
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
        onLock={() => { haptic('medium'); setRevealed(true) }} locked={revealed} />
      {revealed && (
        <>
          <RevealLabel
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
  revealTop: { flexDirection: 'row', alignItems: 'center', gap: space[2] },
  row: { flexDirection: 'row', alignItems: 'center', gap: space[3], minHeight: 40, borderBottomWidth: StyleSheet.hairlineWidth },
  md: { width: 40 },
  more: { marginTop: space[2] },
  stakesHead: { flexDirection: 'row', alignItems: 'center', gap: space[2] },
  legacyPanel: { padding: space[3] },
})
