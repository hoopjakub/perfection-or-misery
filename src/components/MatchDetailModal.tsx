// FotMob-style match-detail screen — the deep-stats feature
// (docs/"Next Up - Deep Match Stats & Ratings.md").
//
// Any FINISHED match row can open this modal. It reloads the two clubs' rosters
// (same loadLeaguePools path the sim used), then deterministically regenerates
// the full stat sheet from the match's stored seed + scorers — so reopening a
// match, today or from history, always shows identical numbers.

import React, { useEffect, useMemo, useState } from 'react'
import { View, Text, StyleSheet, Pressable, ScrollView, ActivityIndicator } from 'react-native'
import { AppModal } from '@/components/AppModal'
import { PressCard } from '@/components/ui'
import { colors, spacing, typography, radius, ratingColor } from '@/theme'
import { useGameStore } from '@/store/gameStore'
import { loadLeaguePools } from '@/engine/run-stats'
import { generateMatchDetail } from '@/engine/match-detail'
import { hashSeed } from '@/lib/rng'
import { flagForCountry } from '@/data/geo-iso'
import type { MatchScorers } from '@/types/stats'
import type { MatchStats, PlayerMatchLine, MatchEvent } from '@/types/match-stats'

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
    yearStart: opts.yearStart, competitionLabel: `${opts.label} · Leg 2`,
    playerClubId: opts.playerClubId, drafted: opts.drafted,
  }
}

const GROUP_ORDER: Record<string, number> = {
  GK: 0, CB: 1, LB: 2, RB: 3, LWB: 4, RWB: 5,
  CDM: 6, CM: 7, LM: 8, RM: 9, CAM: 10, LW: 11, RW: 12, ST: 13, CF: 14,
}

// ── The hook: pools → deterministic regeneration ────────────────────────────
function useMatchDetail(req: MatchDetailRequest | null): { detail: MatchStats | null; loading: boolean } {
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
      const seed = req.seed ?? hashSeed(
        `${req.homeClubId}|${req.awayClubId}|${req.homeGoals}|${req.awayGoals}|${req.competitionLabel ?? ''}`,
      )
      const d = generateMatchDetail({
        seed,
        homePool: pools.poolByClub.get(req.homeClubId) ?? [],
        awayPool: pools.poolByClub.get(req.awayClubId) ?? [],
        homeGoals: req.homeGoals, awayGoals: req.awayGoals,
        scorers: req.scorers, extraTime: req.extraTime,
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

// ── Stat comparison bar (one row of the team grid) ──────────────────────────
function StatBar({ label, home, away, accent, pct }: {
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
    kv('Minutes played', l.minutes + (l.subOnMinute !== undefined ? ` (on ${l.subOnMinute}')` : l.subOffMinute !== undefined ? ` (off ${l.subOffMinute}')` : '')),
  ]
  if (l.goals) rows.push(kv('Goals', l.goals))
  if (l.assists) rows.push(kv('Assists', l.assists))
  if (l.gk) {
    rows.push(
      kv('Saves', l.gk.saves),
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

function PlayerRow({ l, accent, expanded, onPress }: {
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
function EventRow({ e }: { e: MatchEvent }) {
  const minute = `${e.minute}${e.plus ? `+${e.plus}` : ''}'`
  let icon = '⚽', body: React.ReactNode = null
  if (e.type === 'goal') {
    body = (
      <Text style={styles.evText} numberOfLines={2}>
        <Text style={{ fontWeight: typography.bold, color: colors.textPrimary }}>{e.playerName}</Text>
        {e.assistName ? <Text style={styles.evAssist}>  (assist: {e.assistName})</Text> : null}
      </Text>
    )
  } else if (e.type === 'yellow' || e.type === 'red') {
    icon = e.type === 'yellow' ? '🟨' : '🟥'
    body = <Text style={styles.evText} numberOfLines={1}>{e.playerName}</Text>
  } else {
    icon = '🔁'
    body = (
      <Text style={styles.evText} numberOfLines={2}>
        <Text style={{ color: colors.success }}>▲ {e.playerName}</Text>
        <Text style={{ color: colors.danger }}>  ▼ {e.offPlayerName}</Text>
      </Text>
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

// ── The modal ───────────────────────────────────────────────────────────────
export function MatchDetailModal({ request, onClose, accent = colors.accent }: {
  request: MatchDetailRequest | null
  onClose: () => void
  accent?: string
}) {
  const { detail, loading } = useMatchDetail(request)
  const [expandedId, setExpandedId] = useState<string | null>(null)
  useEffect(() => { setExpandedId(null) }, [request])

  // National teams get their flag next to the name (clubs just show the name).
  const withFlag = (name: string) => {
    const f = flagForCountry(name)
    return f ? `${f} ${name}` : name
  }
  const motm = detail?.players.find(p => p.motm) ?? null

  const lineups = useMemo(() => {
    if (!detail) return null
    const side = (isHome: boolean) => {
      const all = detail.players.filter(p => p.isHome === isHome)
      const starters = all.filter(p => p.subOnMinute === undefined && p.minutes > 0)
        .sort((a, b) => (GROUP_ORDER[a.position] ?? 99) - (GROUP_ORDER[b.position] ?? 99))
      const cameOn = all.filter(p => p.subOnMinute !== undefined).sort((a, b) => a.subOnMinute! - b.subOnMinute!)
      const unused = all.filter(p => p.minutes === 0)
      return { starters, cameOn, unused }
    }
    return { home: side(true), away: side(false) }
  }, [detail])

  const r = request
  return (
    <AppModal visible={r !== null} onRequestClose={onClose}>
      <Pressable style={styles.overlay} onPress={onClose}>
        <Pressable style={styles.card} onPress={() => {}}>
          {r && (
            // flexShrink so the (often tall) body fits between the card top and
            // the Close button within the capped card — the button must always
            // stay on-screen, and the body must scroll rather than overflow.
            <ScrollView style={{ flexShrink: 1 }} showsVerticalScrollIndicator>
              {/* Header */}
              {r.competitionLabel ? <Text style={styles.compLabel}>{r.competitionLabel}</Text> : null}
              <View style={styles.header}>
                <Text style={[styles.headerTeam, { textAlign: 'right' }]} numberOfLines={2}>{withFlag(r.homeName)}</Text>
                <Text style={[styles.headerScore, { color: accent }]}>{r.homeGoals} – {r.awayGoals}</Text>
                <Text style={styles.headerTeam} numberOfLines={2}>{withFlag(r.awayName)}</Text>
              </View>
              {r.extraTime && <Text style={styles.aet}>After extra time</Text>}
              {r.pensNote ? <Text style={[styles.pens, { color: accent }]}>{r.pensNote}</Text> : null}

              {loading && (
                <View style={{ paddingVertical: spacing.xl, alignItems: 'center' }}>
                  <ActivityIndicator color={accent} />
                  <Text style={styles.loadingText}>Crunching the numbers…</Text>
                </View>
              )}
              {!loading && !detail && (
                <Text style={styles.noData}>No detailed stats available for this match.</Text>
              )}

              {detail && lineups && (
                <>
                  {/* Team ratings */}
                  <View style={styles.teamRatings}>
                    <View style={[styles.ratingChip, { backgroundColor: ratingColor(detail.homeRating) }]}>
                      <Text style={styles.ratingChipText}>{detail.homeRating.toFixed(1)}</Text>
                    </View>
                    <Text style={styles.teamRatingLabel}>TEAM RATING</Text>
                    <View style={[styles.ratingChip, { backgroundColor: ratingColor(detail.awayRating) }]}>
                      <Text style={styles.ratingChipText}>{detail.awayRating.toFixed(1)}</Text>
                    </View>
                  </View>

                  {/* Player of the Match */}
                  {motm && (
                    <View style={styles.motmBanner}>
                      <Text style={styles.motmBannerStar}>★</Text>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.motmBannerLabel}>PLAYER OF THE MATCH</Text>
                        <Text style={styles.motmBannerName} numberOfLines={1}>
                          {motm.name}
                          <Text style={styles.motmBannerTeam}>  ·  {withFlag(motm.isHome ? r.homeName : r.awayName)}</Text>
                        </Text>
                      </View>
                      <View style={[styles.ratingChip, { backgroundColor: ratingColor(motm.rating) }]}>
                        <Text style={styles.ratingChipText}>{motm.rating.toFixed(1)}</Text>
                      </View>
                    </View>
                  )}

                  {/* Events timeline */}
                  {detail.events.length > 0 && (
                    <View style={styles.section}>
                      <Text style={styles.sectionTitle}>Timeline</Text>
                      {detail.events.map((e, i) => <EventRow key={i} e={e} />)}
                    </View>
                  )}

                  {/* Team stats */}
                  <View style={styles.section}>
                    <Text style={styles.sectionTitle}>Top stats</Text>
                    <StatBar label="Ball possession" home={detail.home.possession} away={detail.away.possession} accent={accent} pct />
                    <StatBar label="Expected goals (xG)" home={detail.home.xg} away={detail.away.xg} accent={accent} />
                    <StatBar label="Total shots" home={detail.home.shots} away={detail.away.shots} accent={accent} />
                    <StatBar label="Shots on target" home={detail.home.shotsOnTarget} away={detail.away.shotsOnTarget} accent={accent} />
                    <StatBar label="Big chances" home={detail.home.bigChances} away={detail.away.bigChances} accent={accent} />
                    <StatBar label="Big chances missed" home={detail.home.bigChancesMissed} away={detail.away.bigChancesMissed} accent={accent} />
                    <StatBar label="Accurate passes" home={detail.home.accuratePasses} away={detail.away.accuratePasses} accent={accent} />
                    <StatBar label="Pass accuracy" home={detail.home.passAccuracy} away={detail.away.passAccuracy} accent={accent} pct />
                    <StatBar label="Corners" home={detail.home.corners} away={detail.away.corners} accent={accent} />
                    <StatBar label="Fouls" home={detail.home.fouls} away={detail.away.fouls} accent={accent} />
                  </View>

                  <View style={styles.section}>
                    <Text style={styles.sectionTitle}>Shots</Text>
                    <StatBar label="Shots inside box" home={detail.home.shotsInsideBox} away={detail.away.shotsInsideBox} accent={accent} />
                    <StatBar label="Shots outside box" home={detail.home.shotsOutsideBox} away={detail.away.shotsOutsideBox} accent={accent} />
                    <StatBar label="Shots off target" home={detail.home.shotsOffTarget} away={detail.away.shotsOffTarget} accent={accent} />
                    <StatBar label="Blocked shots" home={detail.home.shotsBlocked} away={detail.away.shotsBlocked} accent={accent} />
                    <StatBar label="Hit woodwork" home={detail.home.shotsWoodwork} away={detail.away.shotsWoodwork} accent={accent} />
                    <StatBar label="xG open play" home={detail.home.xgOpenPlay} away={detail.away.xgOpenPlay} accent={accent} />
                    <StatBar label="xG set piece" home={detail.home.xgSetPiece} away={detail.away.xgSetPiece} accent={accent} />
                  </View>

                  <View style={styles.section}>
                    <Text style={styles.sectionTitle}>Passes</Text>
                    <StatBar label="Total passes" home={detail.home.passes} away={detail.away.passes} accent={accent} />
                    <StatBar label="Own-half passes" home={detail.home.ownHalfPasses} away={detail.away.ownHalfPasses} accent={accent} />
                    <StatBar label="Opposition-half passes" home={detail.home.oppHalfPasses} away={detail.away.oppHalfPasses} accent={accent} />
                    <StatBar label="Accurate long balls" home={detail.home.accurateLongBalls} away={detail.away.accurateLongBalls} accent={accent} />
                    <StatBar label="Accurate crosses" home={detail.home.accurateCrosses} away={detail.away.accurateCrosses} accent={accent} />
                    <StatBar label="Throw-ins" home={detail.home.throwIns} away={detail.away.throwIns} accent={accent} />
                    <StatBar label="Final-third entries" home={detail.home.finalThirdEntries} away={detail.away.finalThirdEntries} accent={accent} />
                    <StatBar label="Touches in opp. box" home={detail.home.touchesInOppBox} away={detail.away.touchesInOppBox} accent={accent} />
                  </View>

                  <View style={styles.section}>
                    <Text style={styles.sectionTitle}>Defence</Text>
                    <StatBar label="Tackles won" home={detail.home.tacklesWon} away={detail.away.tacklesWon} accent={accent} />
                    <StatBar label="Interceptions" home={detail.home.interceptions} away={detail.away.interceptions} accent={accent} />
                    <StatBar label="Blocks" home={detail.home.blocks} away={detail.away.blocks} accent={accent} />
                    <StatBar label="Clearances" home={detail.home.clearances} away={detail.away.clearances} accent={accent} />
                    <StatBar label="Keeper saves" home={detail.home.keeperSaves} away={detail.away.keeperSaves} accent={accent} />
                  </View>

                  <View style={styles.section}>
                    <Text style={styles.sectionTitle}>Duels</Text>
                    <StatBar label="Ground duels won" home={detail.home.groundDuelsWon} away={detail.away.groundDuelsWon} accent={accent} />
                    <StatBar label="Aerial duels won" home={detail.home.aerialDuelsWon} away={detail.away.aerialDuelsWon} accent={accent} />
                    <StatBar label="Successful dribbles" home={detail.home.dribbles} away={detail.away.dribbles} accent={accent} />
                    <StatBar label="Possession lost" home={detail.home.possessionLost} away={detail.away.possessionLost} accent={accent} />
                  </View>

                  <View style={styles.section}>
                    <Text style={styles.sectionTitle}>Discipline</Text>
                    <StatBar label="Yellow cards" home={detail.home.yellowCards} away={detail.away.yellowCards} accent={accent} />
                    <StatBar label="Red cards" home={detail.home.redCards} away={detail.away.redCards} accent={accent} />
                    <StatBar label="Offsides" home={detail.home.offsides} away={detail.away.offsides} accent={accent} />
                  </View>

                  {/* Lineups */}
                  <View style={styles.section}>
                    <Text style={styles.sectionTitle}>Lineups & ratings</Text>
                    <Text style={styles.lineupHint}>Tap a player for their full match stats · ★ = player of the match</Text>
                    {([['home', r.homeName], ['away', r.awayName]] as const).map(([side, name]) => {
                      const lu = lineups[side]
                      return (
                        <View key={side} style={{ marginTop: spacing.sm }}>
                          <Text style={[styles.lineupTeam, { color: accent }]}>{withFlag(name)}</Text>
                          {lu.starters.map(l => (
                            <PlayerRow key={l.playerId} l={l} accent={accent}
                              expanded={expandedId === l.playerId}
                              onPress={() => setExpandedId(id => id === l.playerId ? null : l.playerId)} />
                          ))}
                          {lu.cameOn.length > 0 && <Text style={styles.benchLabel}>Came on</Text>}
                          {lu.cameOn.map(l => (
                            <PlayerRow key={l.playerId} l={l} accent={accent}
                              expanded={expandedId === l.playerId}
                              onPress={() => setExpandedId(id => id === l.playerId ? null : l.playerId)} />
                          ))}
                          {lu.unused.length > 0 && <Text style={styles.benchLabel}>Unused subs</Text>}
                          {lu.unused.map(l => (
                            <PlayerRow key={l.playerId} l={l} accent={accent} expanded={false} onPress={() => {}} />
                          ))}
                        </View>
                      )
                    })}
                  </View>
                </>
              )}
            </ScrollView>
          )}
          <PressCard style={styles.close} onPress={onClose}><Text style={styles.closeText}>Close</Text></PressCard>
        </Pressable>
      </Pressable>
    </AppModal>
  )
}

const styles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.8)', justifyContent: 'center', alignItems: 'center', padding: spacing.md },
  card: { width: '100%', maxHeight: '92%', backgroundColor: colors.bgCard, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, padding: spacing.lg, gap: spacing.sm },

  compLabel: { fontSize: typography.xs, color: colors.textMuted, textAlign: 'center', textTransform: 'uppercase', letterSpacing: 1, fontWeight: typography.bold },
  header: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginTop: spacing.xs },
  headerTeam: { flex: 1, fontSize: typography.sm, fontWeight: typography.bold, color: colors.textPrimary },
  headerScore: { fontSize: 24, fontWeight: typography.black, minWidth: 70, textAlign: 'center' },
  aet: { fontSize: typography.xs, color: colors.warning, textAlign: 'center', marginTop: 2 },
  pens: { fontSize: typography.xs, fontWeight: typography.bold, textAlign: 'center', marginTop: 2 },
  loadingText: { fontSize: typography.xs, color: colors.textMuted, marginTop: spacing.sm },
  noData: { fontSize: typography.sm, color: colors.textMuted, textAlign: 'center', paddingVertical: spacing.xl },

  teamRatings: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.md, marginTop: spacing.sm },
  teamRatingLabel: { fontSize: 9, color: colors.textMuted, fontWeight: typography.bold, letterSpacing: 1 },

  section: { marginTop: spacing.md, borderTopWidth: 1, borderTopColor: colors.border, paddingTop: spacing.sm },
  sectionTitle: { fontSize: typography.sm, fontWeight: typography.black, color: colors.textPrimary, marginBottom: spacing.sm, textTransform: 'uppercase', letterSpacing: 1 },

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

  lineupHint: { fontSize: 9, color: colors.textMuted, fontStyle: 'italic', marginBottom: 2 },
  lineupTeam: { fontSize: typography.sm, fontWeight: typography.black, marginBottom: 2 },
  benchLabel: { fontSize: 9, color: colors.textMuted, fontWeight: typography.bold, textTransform: 'uppercase', letterSpacing: 1, marginTop: spacing.xs },
  playerRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingVertical: 5, borderBottomWidth: 1, borderBottomColor: colors.border },
  playerRowMotm: { backgroundColor: colors.gold + '22', borderWidth: 1, borderColor: colors.gold, borderRadius: radius.sm, paddingHorizontal: 4 },
  playerPos: { width: 32, fontSize: 9, fontWeight: typography.black, color: colors.textMuted },
  playerName: { fontSize: typography.sm, color: colors.textPrimary, flexShrink: 1 },
  playerNameMotm: { color: colors.gold, fontWeight: typography.black },
  motmChip: { backgroundColor: colors.gold, borderRadius: radius.sm, paddingHorizontal: 5, paddingVertical: 1 },
  motmChipText: { fontSize: 9, fontWeight: typography.black, color: colors.bg, letterSpacing: 0.5 },
  motmBanner: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginTop: spacing.sm, backgroundColor: colors.gold + '15', borderWidth: 1, borderColor: colors.gold, borderRadius: radius.md, padding: spacing.sm },
  motmBannerStar: { fontSize: 22, color: colors.gold },
  motmBannerLabel: { fontSize: 8, fontWeight: typography.black, color: colors.gold, letterSpacing: 1.5 },
  motmBannerName: { fontSize: typography.sm, fontWeight: typography.black, color: colors.textPrimary },
  motmBannerTeam: { fontSize: typography.xs, fontWeight: typography.medium, color: colors.textSecondary },
  playerBadge: { fontSize: 10 },
  playerBadgeMuted: { fontSize: 9, color: colors.textSecondary, fontWeight: typography.bold },
  cardYellow: { width: 8, height: 11, borderRadius: 1, backgroundColor: colors.warning },
  cardRed: { width: 8, height: 11, borderRadius: 1, backgroundColor: colors.danger },
  subOn: { fontSize: 9, color: colors.success, fontWeight: typography.bold },
  subOff: { fontSize: 9, color: colors.danger, fontWeight: typography.bold },
  unusedTag: { fontSize: 9, color: colors.textMuted, fontStyle: 'italic' },
  ratingChip: { minWidth: 34, borderRadius: radius.sm, paddingHorizontal: 5, paddingVertical: 2, alignItems: 'center' },
  ratingChipText: { fontSize: 12, fontWeight: typography.black, color: colors.bg },

  sheet: { backgroundColor: colors.bgElevated, borderRadius: radius.sm, padding: spacing.sm, marginVertical: spacing.xs },
  sheetRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 2 },
  sheetKey: { fontSize: 11, color: colors.textMuted },
  sheetVal: { fontSize: 11, fontWeight: typography.bold },

  close: { marginTop: spacing.sm, backgroundColor: colors.bgElevated, borderRadius: radius.md, paddingVertical: spacing.md, alignItems: 'center', borderWidth: 1, borderColor: colors.border },
  closeText: { fontSize: typography.md, fontWeight: typography.bold, color: colors.textPrimary },
})
