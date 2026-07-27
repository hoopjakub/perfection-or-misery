// Shared parts of the match-stats feature — the data hook and the row-level
// building blocks that app/game/match-stats.tsx composes into a screen.
// (docs/"Next Up - Deep Match Stats & Ratings.md" for the engine side,
// Big Fixes §10 for the screen.)
//
// Any FINISHED match row can open the stats screen via `openMatchStats`
// (src/lib/matchStats.ts). Doing so reloads the two clubs' rosters (the same
// loadLeaguePools path the sim used), then deterministically regenerates the
// full stat sheet from the match's stored seed + scorers — so reopening a
// match, today or from history, always shows identical numbers.
//
// This used to BE the screen: a single tall modal. §10 split it up — the modal
// shell is gone, the pieces below are exported, and the layout lives in the
// route. Nothing here knows about navigation.

import React, { useEffect, useMemo, useState } from 'react'
import { View, Text, StyleSheet } from 'react-native'
import { PressCard } from '@/components/ui'
import { colors, spacing, typography, radius, ratingColor } from '@/theme'
import { useGameStore } from '@/store/gameStore'
import { loadLeaguePools } from '@/engine/run-stats'
import { generateMatchDetail } from '@/engine/match-detail'
import { hashSeed } from '@/lib/rng'
import { flagForCountry } from '@/data/geo-iso'
import type { MatchScorers } from '@/types/stats'
import type { MatchStats, PlayerMatchLine, MatchEvent, AddedTime } from '@/types/match-stats'
import type { ContextMatch } from '@/engine/match-context'

// ── Request: everything needed to (re)generate one match's detail ───────────
export type MatchDetailRequest = {
  homeClubId: string
  homeName:   string
  awayClubId: string
  awayName:   string
  homeGoals:  number
  awayGoals:  number
  extraTime?: boolean
  pensNote?:  string          // e.g. "Penalties 4–2 · City advance"
  scorers?:   MatchScorers
  seed?:      number          // missing on legacy saves → stable hash fallback
  yearStart:  number          // roster season to load
  competitionLabel?: string   // "Matchday 12" / "Quarter-final · Leg 2"
  playerClubId?: string       // the club YOUR drafted squad replaced (if in this match)
  drafted?:   import('@/types/game').DraftedPlayer[]  // squad override (history loads — store is empty)
  accent?:    string          // mode accent, carried so the screen matches where you came from
  /** YOUR formation, so the pitch view can place your drafted XI. Your eleven
   *  is never re-picked from it — see lineupsForMatch. */
  playerFormation?: import('@/types/game').Formation
  // §10 R6/R7 "context at the moment of the match". Optional: knockout ties
  // have no table to snapshot, so the screen just drops the section. When
  // present, `matchday` is the matchday THIS match was played on and
  // `contextMatches` is every result in the competition (the screen filters).
  matchday?:       number
  contextMatches?: ContextMatch[]
  // §10.5 — the rotation the sim applied. Without it the sheet would select a
  // different eleven than the one that actually played.
  homeRotation?:   number
  awayRotation?:   number
  // §10.5 phase 4 — injured/suspended players in this match, plus the stand-ins
  // that covered your side. Travel with the match for the same reason rotation
  // does: without them the sheet fields somebody who wasn't available.
  absent?:   string[]
  standIns?: import('@/types/stats').RosterPlayer[]
}

// ── Shared request builder for CL-shaped knockout ties ──────────────────────
// Leg 2 folds its extra time in (one physical match), mirroring stats totals.
// Works for classic CL, custom UCL and qualifying ties (via qualTieToKoMatch).
export function koLegDetailRequest(
  m: import('@/engine/cl-sim').CLKnockoutMatch,
  leg: 1 | 2,
  opts: { label: string; yearStart: number; playerClubId?: string; drafted?: import('@/types/game').DraftedPlayer[] },
): MatchDetailRequest | null {
  const pensNote = m.aPens !== undefined
    ? `Penalties ${m.aPens} – ${m.bPens} · ${m.winner.clubName} advance`
    : undefined
  if (!m.leg1) {
    // single match (a final)
    return {
      homeClubId: m.teamA.clubId, homeName: m.teamA.clubName,
      awayClubId: m.teamB.clubId, awayName: m.teamB.clubName,
      homeGoals: m.aGoals, awayGoals: m.bGoals,
      extraTime: m.extraTime, pensNote,
      scorers: m.leg1Scorers, seed: m.leg1Seed,
      absent: m.leg1Absent, standIns: m.leg1StandIns,
      yearStart: opts.yearStart, competitionLabel: opts.label,
      playerClubId: opts.playerClubId, drafted: opts.drafted,
    }
  }
  if (leg === 1) {
    return {
      homeClubId: m.teamA.clubId, homeName: m.teamA.clubName,
      awayClubId: m.teamB.clubId, awayName: m.teamB.clubName,
      homeGoals: m.leg1.aGoals, awayGoals: m.leg1.bGoals,
      scorers: m.leg1Scorers, seed: m.leg1Seed,
      absent: m.leg1Absent, standIns: m.leg1StandIns,
      yearStart: opts.yearStart, competitionLabel: `${opts.label} · Leg 1`,
      playerClubId: opts.playerClubId, drafted: opts.drafted,
    }
  }
  if (!m.leg2) return null
  const et = m.leg2ExtraTime
  const merged = et
    ? { home: [...(m.leg2Scorers?.home ?? []), ...(m.leg2ExtraTimeScorers?.home ?? [])], away: [...(m.leg2Scorers?.away ?? []), ...(m.leg2ExtraTimeScorers?.away ?? [])] }
    : m.leg2Scorers
  return {
    homeClubId: m.teamB.clubId, homeName: m.teamB.clubName,
    awayClubId: m.teamA.clubId, awayName: m.teamA.clubName,
    homeGoals: m.leg2.bGoals + (et?.bGoals ?? 0), awayGoals: m.leg2.aGoals + (et?.aGoals ?? 0),
    extraTime: !!et || m.extraTime, pensNote,
    scorers: merged, seed: m.leg2Seed,
    // §10.5 phase 4 — leg 2 is its own matchday, so it has its own absences: a
    // leg-1 red card means he isn't in this eleven.
    absent: m.leg2Absent, standIns: m.leg2StandIns,
    yearStart: opts.yearStart, competitionLabel: `${opts.label} · Leg 2`,
    playerClubId: opts.playerClubId, drafted: opts.drafted,
  }
}

const GROUP_ORDER: Record<string, number> = {
  GK: 0, CB: 1, LB: 2, RB: 3, LWB: 4, RWB: 5,
  CDM: 6, CM: 7, LM: 8, RM: 9, CAM: 10, LW: 11, RW: 12, ST: 13, CF: 14,
}

/**
 * The seed a request actually regenerates from. Legacy matches saved before
 * seeds existed fall back to a stable hash of the match's identity, so they
 * still reproduce the same sheet every time.
 *
 * Exported because §7's Deep Match builds its per-minute timeline from the same
 * seed the sheet came from — two independent copies of this fallback would be
 * one edit away from the live final and the stats screen disagreeing.
 */
export function effectiveSeed(req: MatchDetailRequest): number {
  return req.seed ?? hashSeed(
    `${req.homeClubId}|${req.awayClubId}|${req.homeGoals}|${req.awayGoals}|${req.competitionLabel ?? ''}`,
  )
}

// ── The hook: pools → deterministic regeneration ────────────────────────────
export function useMatchDetail(req: MatchDetailRequest | null): { detail: MatchStats | null; loading: boolean } {
  const draftedPlayers = useGameStore(s => s.draftedPlayers)
  const benchPlayers   = useGameStore(s => s.benchPlayers)
  const useSubstitutes = useGameStore(s => s.useSubstitutes)
  const [detail, setDetail] = useState<MatchStats | null>(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!req) { setDetail(null); return }
    let active = true
    setLoading(true)
    setDetail(null)
    const fullSquad = req.drafted?.length ? req.drafted : [...draftedPlayers, ...benchPlayers]
    loadLeaguePools(
      [
        { clubId: req.homeClubId, clubName: req.homeName, isPlayer: req.homeClubId === req.playerClubId },
        { clubId: req.awayClubId, clubName: req.awayName, isPlayer: req.awayClubId === req.playerClubId },
      ],
      fullSquad, req.yearStart, useSubstitutes,
    ).then(pools => {
      if (!active) return
      const seed = effectiveSeed(req)
      const d = generateMatchDetail({
        seed,
        homePool: pools.poolByClub.get(req.homeClubId) ?? [],
        awayPool: pools.poolByClub.get(req.awayClubId) ?? [],
        homeGoals: req.homeGoals, awayGoals: req.awayGoals,
        scorers: req.scorers, extraTime: req.extraTime,
        // §10.5 — must match what the sim used when it attributed the stored
        // scorers, or a scorer could come back as someone who never played.
        playerClubId: req.playerClubId, benchSize: pools.benchSize,
        playerFormation: req.playerFormation,
        homeRotation: req.homeRotation, awayRotation: req.awayRotation,
        // §10.5 phase 4 — the same availability the sim applied, so nobody who
        // was injured or suspended reappears on the sheet.
        unavailableIds: req.absent?.length ? new Set(req.absent) : undefined,
        standIns: req.standIns,
      })
      setDetail(d)
      setLoading(false)
    }).catch(e => {
      console.warn('[match-detail] pool load failed:', e)
      if (active) setLoading(false)
    })
    return () => { active = false }
  }, [req])

  return { detail, loading }
}

// ── Which side is which ─────────────────────────────────────────────────────
// A column of "4 · Shots on target · 2" says nothing about WHO had four
// (maintainer feedback: the stat grid was unreadable). One header row above the
// block names both sides in the same left/right order every bar uses, with the
// accent dot tying home to the colour the bars fill in.
export function StatSideHeader({ homeName, awayName, accent }: {
  homeName: string; awayName: string; accent: string
}) {
  return (
    <View style={styles.sideHeader}>
      <View style={styles.sideChip}>
        <View style={[styles.sideDot, { backgroundColor: accent }]} />
        <Text style={styles.sideName} numberOfLines={1}>{withCountryFlag(homeName)}</Text>
      </View>
      <View style={[styles.sideChip, { justifyContent: 'flex-end' }]}>
        <Text style={[styles.sideName, { textAlign: 'right' }]} numberOfLines={1}>{withCountryFlag(awayName)}</Text>
        <View style={[styles.sideDot, { backgroundColor: colors.textMuted }]} />
      </View>
    </View>
  )
}

/** National sides read far faster with their flag; clubs have no crest to show. */
export function withCountryFlag(name: string) {
  const f = flagForCountry(name)
  return f ? `${f} ${name}` : name
}

// ── One side's goals, as they appear under a scoreline ──────────────────────
// Shared by the stats screen's header and §7's live scoreboard, so a goal reads
// identically wherever it shows up — including the §9 markers, without which an
// own goal looks like a normal goal by a player who isn't on that team.
export function ScorerList({ events, isHome, align }: {
  events: MatchEvent[]; isHome: boolean; align: 'left' | 'right'
}) {
  const goals = events.filter(e => e.type === 'goal' && e.isHome === isHome)
  if (goals.length === 0) return <View style={{ flex: 1 }} />
  // One line per SCORER with all of his minutes on it, the way a scoreline is
  // actually read — a player who scored twice used to take up two rows. And no
  // cap: a 6–5 has eleven goals and every one of them belongs here.
  // Own goals are credited to an OPPONENT, so they get their own line rather
  // than merging into a namesake's.
  const groups = new Map<string, { name: string; parts: { text: string; mark?: string }[] }>()
  for (const g of goals) {
    const key = `${g.ownGoal ? 'og:' : ''}${g.playerId}`
    const entry = groups.get(key) ?? { name: g.playerName, parts: [] }
    entry.parts.push({
      text: `${g.minute}${g.plus ? `+${g.plus}` : ''}'`,
      mark: g.ownGoal ? ' (OG)' : g.penalty ? ' (Pen)' : undefined,
    })
    groups.set(key, entry)
  }

  return (
    <View style={{ flex: 1, alignItems: align === 'right' ? 'flex-end' : 'flex-start' }}>
      {[...groups.values()].map((sc, i) => (
        <Text key={i} style={[styles.scorerLine, { textAlign: align }]} numberOfLines={2}>
          {sc.name}{' '}
          {sc.parts.map((part, j) => (
            <Text key={j}>
              {j > 0 ? ', ' : ''}{part.text}
              {part.mark ? <Text style={styles.scorerMark}>{part.mark}</Text> : null}
            </Text>
          ))}
        </Text>
      ))}
    </View>
  )
}

// ── Stat comparison bar (one row of the team grid) ──────────────────────────
export function StatBar({ label, home, away, accent, pct }: {
  label: string; home: number; away: number; accent: string; pct?: boolean
}) {
  const total = Math.max(1e-6, home + away)
  const homeShare = home / total
  const homeLeads = home > away
  const awayLeads = away > home
  const fmt = (v: number) => pct ? `${v}%` : (Number.isInteger(v) ? String(v) : v.toFixed(2))
  return (
    <View style={styles.statRow}>
      <View style={styles.statNums}>
        <Text style={[styles.statVal, homeLeads && { color: accent, fontWeight: typography.black }]}>{fmt(home)}</Text>
        <Text style={styles.statLabel}>{label}</Text>
        <Text style={[styles.statVal, { textAlign: 'right' }, awayLeads && { color: accent, fontWeight: typography.black }]}>{fmt(away)}</Text>
      </View>
      <View style={styles.statBarTrack}>
        <View style={[styles.statBarHalf, { flexDirection: 'row-reverse' }]}>
          <View style={{ width: `${homeShare * 100}%`, backgroundColor: homeLeads ? accent : colors.textMuted, borderRadius: 2, height: 4 }} />
        </View>
        <View style={styles.statBarHalf}>
          <View style={{ width: `${(1 - homeShare) * 100}%`, backgroundColor: awayLeads ? accent : colors.textMuted, borderRadius: 2, height: 4 }} />
        </View>
      </View>
    </View>
  )
}

// ── Player row + expandable full stat sheet ─────────────────────────────────
function kv(label: string, value: string | number): [string, string] {
  return [label, String(value)]
}

// Exported: the stats page's player game log renders the same sheet.
export function playerSheet(l: PlayerMatchLine): [string, string][] {
  const rows: [string, string][] = [
    ...(l.injured ? [kv('Injured', `off ${l.subOffMinute}' · out ${l.matchdaysOut} match${l.matchdaysOut === 1 ? '' : 'es'}`)] : []),
    kv('Minutes played', l.minutes + (l.subOnMinute !== undefined ? ` (on ${l.subOnMinute}')` : l.subOffMinute !== undefined ? ` (off ${l.subOffMinute}')` : '')),
  ]
  if (l.goals) rows.push(kv('Goals', l.penaltyGoals ? `${l.goals} (${l.penaltyGoals} pen)` : l.goals))
  if (l.assists) rows.push(kv('Assists', l.assists))
  // §9 — surfaced right under the headline numbers, because an own goal or an
  // error that led to a goal is the story of that player's match.
  if (l.penaltiesMissed) rows.push(kv('Penalties missed', l.penaltiesMissed))
  if (l.ownGoals) rows.push(kv('Own goals', l.ownGoals))
  if (l.penaltiesWon) rows.push(kv('Penalties won', l.penaltiesWon))
  if (l.errorsLeadingToGoal) rows.push(kv('Errors led to goal', l.errorsLeadingToGoal))
  if (l.gk) {
    rows.push(
      kv('Saves', l.gk.saves),
      ...(l.gk.penaltiesSaved ? [kv('Penalties saved', l.gk.penaltiesSaved)] : []),
      kv('Goals conceded', l.gk.goalsConceded),
      kv('Save percentage', `${l.gk.savePct}%`),
      kv('Punches', l.gk.punches),
      kv('High claims', l.gk.highClaims),
      kv('Sweeper actions', l.gk.sweeperActions),
    )
  } else {
    rows.push(
      kv('Shots (on target)', `${l.shots} (${l.shotsOnTarget})`),
      kv('Key passes', l.keyPasses),
      kv('Big chances created', l.bigChancesCreated),
    )
    if (l.bigChancesMissed) rows.push(kv('Big chances missed', l.bigChancesMissed))
    rows.push(kv('Touches in opp. box', l.touchesInOppBox))
    if (l.offsides) rows.push(kv('Offsides', l.offsides))
  }
  rows.push(
    kv('Touches', l.touches),
    kv('Passes (accurate)', `${l.passes} (${l.accuratePasses})`),
    kv('Pass accuracy', `${l.passAccuracy}%`),
  )
  if (l.crosses) rows.push(kv('Accurate crosses', l.crosses))
  if (l.longBalls) rows.push(kv('Accurate long balls', l.longBalls))
  rows.push(
    kv('Dribbles', l.dribbles),
    kv('Duels won (ground/aerial)', `${l.groundDuelsWon}/${l.aerialDuelsWon}`),
    kv('Possession lost', l.possessionLost),
    kv('Tackles won', l.tacklesWon),
    kv('Interceptions', l.interceptions),
    kv('Clearances', l.clearances),
  )
  if (l.blocks) rows.push(kv('Blocked shots', l.blocks))
  rows.push(kv('Fouls (won)', `${l.foulsCommitted} (${l.foulsWon})`))
  return rows
}

export function PlayerRow({ l, accent, expanded, onPress }: {
  l: PlayerMatchLine; accent: string; expanded: boolean; onPress: () => void
}) {
  const unused = l.minutes === 0
  return (
    <View>
      <PressCard
        style={[styles.playerRow, unused && { opacity: 0.45 }, l.motm && styles.playerRowMotm]}
        onPress={unused ? undefined : onPress}
        disabled={unused}
      >
        <Text style={styles.playerPos}>{l.position}</Text>
        <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 4, flexWrap: 'wrap' }}>
          <Text style={[styles.playerName, l.motm && styles.playerNameMotm]} numberOfLines={1}>{l.name}</Text>
          {l.motm && (
            <View style={styles.motmChip}>
              <Text style={styles.motmChipText}>★ POTM</Text>
            </View>
          )}
          {l.goals > 0 && <Text style={styles.playerBadge}>{'⚽'.repeat(Math.min(3, l.goals))}{l.goals > 3 ? `×${l.goals}` : ''}</Text>}
          {l.assists > 0 && <Text style={styles.playerBadgeMuted}>{l.assists}A</Text>}
          {l.yellowCard && !l.redCard && <View style={styles.cardYellow} />}
          {l.redCard && <View style={styles.cardRed} />}
          {l.subOnMinute !== undefined && <Text style={styles.subOn}>▲{l.subOnMinute}'</Text>}
          {l.subOffMinute !== undefined && <Text style={styles.subOff}>▼{l.subOffMinute}'</Text>}
          {/* §10.5 phase 4 — came off injured, and for how long. */}
          {l.injured && <Text style={styles.injuredTag}>🩹 out {l.matchdaysOut}</Text>}
        </View>
        {unused
          ? <Text style={styles.unusedTag}>unused</Text>
          : <View style={[styles.ratingChip, { backgroundColor: ratingColor(l.rating) }]}>
              <Text style={styles.ratingChipText}>{l.rating.toFixed(1)}</Text>
            </View>}
      </PressCard>
      {expanded && !unused && (
        <View style={styles.sheet}>
          {playerSheet(l).map(([k, v]) => (
            <View key={k} style={styles.sheetRow}>
              <Text style={styles.sheetKey}>{k}</Text>
              <Text style={[styles.sheetVal, { color: accent }]}>{v}</Text>
            </View>
          ))}
        </View>
      )}
    </View>
  )
}

// ── Events timeline ─────────────────────────────────────────────────────────
export function EventRow({ e }: { e: MatchEvent }) {
  const minute = `${e.minute}${e.plus ? `+${e.plus}` : ''}'`
  let icon = '⚽', body: React.ReactNode = null
  if (e.type === 'goal') {
    // §9 — the row sits on the side the goal COUNTS FOR, so an own goal has to
    // shout that it's an own goal: different icon, red name, explicit label.
    // Without all three it reads as an opposition player scoring for us.
    icon = e.ownGoal ? '🥅' : '⚽'
    const tag = e.ownGoal ? 'Own goal' : e.penalty ? 'Penalty' : null
    // A penalty has no assist — the equivalent credit is who won it.
    const credit = e.penWonName ? `won by ${e.penWonName}` : e.assistName ? `assist: ${e.assistName}` : null
    body = (
      <>
        <Text style={styles.evText} numberOfLines={2}>
          <Text style={{ fontWeight: typography.bold, color: e.ownGoal ? colors.danger : colors.textPrimary }}>{e.playerName}</Text>
          {tag ? <Text style={[styles.evTag, e.ownGoal && { color: colors.danger }]}>  {tag}</Text> : null}
        </Text>
        {credit ? <Text style={styles.evAssist} numberOfLines={1}>{credit}</Text> : null}
        {e.errorByName ? <Text style={styles.evError} numberOfLines={1}>error led to goal · {e.errorByName}</Text> : null}
      </>
    )
  } else if (e.type === 'penMissed') {
    // The one event that changes nothing on the scoreboard and everything in
    // the room — so it gets its own icon and says which way it went.
    icon = '❌'
    body = (
      <>
        <Text style={styles.evText} numberOfLines={2}>
          <Text style={{ fontWeight: typography.bold, color: colors.textPrimary }}>{e.playerName}</Text>
          <Text style={[styles.evTag, { color: colors.warning }]}>  {e.saved ? 'Penalty saved' : 'Penalty missed'}</Text>
        </Text>
        {e.saved && e.keeperName ? <Text style={styles.evAssist} numberOfLines={1}>saved by {e.keeperName}</Text> : null}
      </>
    )
  } else if (e.type === 'injury') {
    // §10.5 phase 4 — deliberately its own row, sitting directly above the
    // change it forced: a manager losing a player is a different event from a
    // manager choosing to make a substitution, and the timeline should say so.
    icon = '🩹'
    const out = e.matchdaysOut === 1 ? 'out for the next match' : `out for ${e.matchdaysOut} matches`
    body = (
      <>
        <Text style={styles.evText} numberOfLines={2}>
          <Text style={{ fontWeight: typography.bold, color: colors.textPrimary }}>{e.playerName}</Text>
          <Text style={[styles.evTag, { color: colors.danger }]}>  Injured</Text>
        </Text>
        <Text style={styles.evAssist} numberOfLines={1}>
          {out}{e.replaced === false ? ' · no bench left, played on short' : ''}
        </Text>
      </>
    )
  } else if (e.type === 'yellow' || e.type === 'red') {
    icon = e.type === 'yellow' ? '🟨' : '🟥'
    body = <Text style={styles.evText} numberOfLines={1}>{e.playerName}</Text>
  } else {
    icon = '🔁'
    body = (
      <>
        <Text style={styles.evText} numberOfLines={2}>
          <Text style={{ color: colors.success }}>▲ {e.playerName}</Text>
          <Text style={{ color: colors.danger }}>  ▼ {e.offPlayerName}</Text>
        </Text>
        {/* §10.5 — a change at the interval and a change forced by an injury both
            read differently from a tactical one, so both say what they are. */}
        {e.halfTime ? <Text style={styles.evTag}>at half-time</Text> : null}
        {e.forced ? <Text style={[styles.evTag, { color: colors.danger }]}>forced · injury</Text> : null}
      </>
    )
  }
  return (
    <View style={[styles.evRow, { flexDirection: e.isHome ? 'row' : 'row-reverse' }]}>
      <Text style={styles.evMinute}>{minute}</Text>
      <Text style={styles.evIcon}>{icon}</Text>
      <View style={{ flex: 1, alignItems: e.isHome ? 'flex-start' : 'flex-end' }}>{body}</View>
    </View>
  )
}

// Timeline with the period breaks folded in, each showing how much was added
// to that half (§10 R4 — added time per half, not one lump at the end).
export function Timeline({ events, addedTime, duration, revealUpTo }: {
  events: MatchEvent[]; addedTime: AddedTime; duration: number
  /** §7 live playback: only draw the period breaks that have been REACHED.
   *  Without it a match in its 20th minute already showed a "Full-time · +4'"
   *  line, which both looks wrong and gives away the stoppage time. */
  revealUpTo?: number
}) {
  const breaks = duration > 90
    ? [
        { at: 45,  label: 'Half-time',  plus: addedTime.firstHalf },
        { at: 90,  label: 'Full-time',  plus: addedTime.secondHalf },
        { at: 105, label: 'ET half-time', plus: addedTime.firstET ?? 0 },
        { at: 120, label: 'End of extra time', plus: addedTime.secondET ?? 0 },
      ]
    : [
        { at: 45, label: 'Half-time', plus: addedTime.firstHalf },
        { at: 90, label: 'Full-time', plus: addedTime.secondHalf },
      ]

  const out: React.ReactNode[] = []
  let bi = 0
  const flushBreaksBefore = (minute: number) => {
    // A 90+3 goal belongs BEFORE the full-time line, so compare on the whole
    // minute — stoppage-time events stay inside the half they were played in.
    while (bi < breaks.length && breaks[bi].at < minute) {
      const b = breaks[bi++]
      out.push(
        <View key={`b${b.at}`} style={styles.breakRow}>
          <View style={styles.breakLine} />
          <Text style={styles.breakText}>{b.label}{b.plus > 0 ? ` · +${b.plus}'` : ''}</Text>
          <View style={styles.breakLine} />
        </View>,
      )
    }
  }
  events.forEach((e, i) => {
    flushBreaksBefore(e.minute)
    out.push(<EventRow key={`e${i}`} e={e} />)
  })
  flushBreaksBefore(revealUpTo ?? Infinity)
  return <>{out}</>
}

// ── The modal ───────────────────────────────────────────────────────────────
// ── Lineup split (starters / came on / unused) ──────────────────────────────
// Shared so the screen and anything else showing a lineup order it identically.
export function splitLineup(players: PlayerMatchLine[], isHome: boolean) {
  const all = players.filter(p => p.isHome === isHome)
  return {
    starters: all.filter(p => p.subOnMinute === undefined && p.minutes > 0)
      .sort((a, b) => (GROUP_ORDER[a.position] ?? 99) - (GROUP_ORDER[b.position] ?? 99)),
    cameOn: all.filter(p => p.subOnMinute !== undefined).sort((a, b) => a.subOnMinute! - b.subOnMinute!),
    unused: all.filter(p => p.minutes === 0),
  }
}

// Only the row-level pieces live here now — the screen (app/game/match-stats.tsx)
// owns the page chrome, header and section framing.
const styles = StyleSheet.create({

  sideHeader: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginBottom: spacing.sm },
  sideChip: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 5 },
  sideDot: { width: 8, height: 8, borderRadius: 4 },
  sideName: { flex: 1, fontSize: 10, fontWeight: typography.black, color: colors.textSecondary, textTransform: 'uppercase', letterSpacing: 0.5 },

  scorerLine: { fontSize: 10, color: colors.textSecondary },
  scorerMark: { color: colors.textMuted, fontWeight: typography.bold },

  statRow: { marginBottom: spacing.sm },
  statNums: { flexDirection: 'row', alignItems: 'center' },
  statVal: { width: 52, fontSize: 12, color: colors.textSecondary },
  statLabel: { flex: 1, fontSize: 11, color: colors.textMuted, textAlign: 'center' },
  statBarTrack: { flexDirection: 'row', gap: 3, marginTop: 3 },
  statBarHalf: { flex: 1, backgroundColor: colors.bgElevated, borderRadius: 2, height: 4, overflow: 'hidden' },

  evRow: { alignItems: 'center', gap: spacing.sm, paddingVertical: 3 },
  evMinute: { width: 38, fontSize: 10, fontWeight: typography.black, color: colors.textMuted, textAlign: 'center' },
  evIcon: { fontSize: 12 },
  evText: { fontSize: 11, color: colors.textSecondary },
  evAssist: { fontSize: 10, color: colors.textMuted },
  // §9 markers. The tag carries weight as well as colour so "Own goal" still
  // reads as exceptional without relying on hue alone.
  evTag: { fontSize: 9, fontWeight: typography.black, color: colors.textMuted, textTransform: 'uppercase', letterSpacing: 0.4 },
  evError: { fontSize: 10, color: colors.danger, fontStyle: 'italic' },
  breakRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingVertical: spacing.xs },
  breakLine: { flex: 1, height: StyleSheet.hairlineWidth, backgroundColor: colors.border },
  breakText: { fontSize: 9, fontWeight: typography.black, color: colors.textMuted, textTransform: 'uppercase', letterSpacing: 0.5 },

  playerRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingVertical: 5, borderBottomWidth: 1, borderBottomColor: colors.border },
  playerRowMotm: { backgroundColor: colors.gold + '22', borderWidth: 1, borderColor: colors.gold, borderRadius: radius.sm, paddingHorizontal: 4 },
  playerPos: { width: 32, fontSize: 9, fontWeight: typography.black, color: colors.textMuted },
  playerName: { fontSize: typography.sm, color: colors.textPrimary, flexShrink: 1 },
  playerNameMotm: { color: colors.gold, fontWeight: typography.black },
  motmChip: { backgroundColor: colors.gold, borderRadius: radius.sm, paddingHorizontal: 5, paddingVertical: 1 },
  motmChipText: { fontSize: 9, fontWeight: typography.black, color: colors.bg, letterSpacing: 0.5 },
  playerBadge: { fontSize: 10 },
  playerBadgeMuted: { fontSize: 9, color: colors.textSecondary, fontWeight: typography.bold },
  cardYellow: { width: 8, height: 11, borderRadius: 1, backgroundColor: colors.warning },
  cardRed: { width: 8, height: 11, borderRadius: 1, backgroundColor: colors.danger },
  subOn: { fontSize: 9, color: colors.success, fontWeight: typography.bold },
  subOff: { fontSize: 9, color: colors.danger, fontWeight: typography.bold },
  unusedTag: { fontSize: 9, color: colors.textMuted, fontStyle: 'italic' },
  injuredTag: { fontSize: 9, color: colors.danger, fontWeight: typography.bold },
  ratingChip: { minWidth: 34, borderRadius: radius.sm, paddingHorizontal: 5, paddingVertical: 2, alignItems: 'center' },
  ratingChipText: { fontSize: 12, fontWeight: typography.black, color: colors.bg },

  sheet: { backgroundColor: colors.bgElevated, borderRadius: radius.sm, padding: spacing.sm, marginVertical: spacing.xs },
  sheetRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 2 },
  sheetKey: { fontSize: 11, color: colors.textMuted },
  sheetVal: { fontSize: 11, fontWeight: typography.bold },

})
