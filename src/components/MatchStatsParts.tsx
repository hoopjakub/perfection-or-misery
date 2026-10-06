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

import { t } from '@/i18n'
import { log } from '@/diag/log'
import React, { useEffect, useMemo, useState } from 'react'
import { View, StyleSheet } from 'react-native'
// P8-123: text on the kit's families and scale until this screen is rebuilt on KitText.
import { ScaleText as Text } from '@/components/kit'
import { PressCard } from '@/components/ui'
// C-18: the kit's colours: a missed penalty and a red are misery red (DESIGN.md §2.2), a card the referee's yellow.
import { type, prim, font } from '@/theme'
import { useGameStore } from '@/store/gameStore'
import { loadLeaguePools } from '@/engine/run-stats'
import { generateMatchDetail } from '@/engine/match-detail'
import { hashSeed } from '@/lib/rng'
import { countryName } from '@/data/countries-sk'
import type { MatchStats, PlayerMatchLine, MatchEvent, AddedTime } from '@/types/match-stats'
import { useTeamColourPair } from '@/lib/teamColours'
import { Crest, RatingSquare, EventMark, Tag, KitText, TeamMark } from '@/components/kit'
import { ROLES, space, formatRating, type Roles } from '@/theme'
import { SENT_OFF, type CommentaryLine } from '@/engine/commentary'

// ── Request ─────────────────────────────────────────────────────────────────
// The request type and the one builder that writes it live in the engine
// (src/engine/stages.ts, centralisation step 3), so a request can't be
// hand-built with a field left out. Re-exported for the screens that import it here.
import type { MatchDetailRequest } from '@/engine/stages'
export type { MatchDetailRequest }

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

// ── Man of the match, at full time (P8-129) ──────────────────────────────────
// Your match's man of the match, named under its scoreline the moment it's
// over, the same player the match sheet crowns (the same request, regenerated
// from the same seed). The season award ("Man of the match, most often") was
// only on Awards Night; this is the moment each match. It holds its request
// by the match's identity, so the card re-rendering never reloads it.
export function ManOfTheMatch({ roles, req }: { roles: Roles; req: MatchDetailRequest }) {
  const stable = useMemo(() => req, [req.seed, req.homeClubId, req.awayClubId, req.homeGoals, req.awayGoals])
  const { detail } = useMatchDetail(stable)
  const best = detail?.players.find(p => p.motm)
  if (!best) return null
  return (
    <View style={styles.motm} accessible accessibilityLabel={t('match.motmA11y', { name: best.name, rating: formatRating(best.rating) })}>
      <Tag roles={roles} variant="selected">{t('match.motmTag')}</Tag>
      <KitText t="body" color={roles.text} numberOfLines={1} style={{ flex: 1 }}>{best.name}</KitText>
      <RatingSquare value={best.rating} size="sm" />
    </View>
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
      log.warn('db', 'match-detail: pool load failed', e)
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
export function StatSideHeader({ homeName, awayName, homeClubId, awayClubId, accent }: {
  homeName: string; awayName: string; homeClubId?: string; awayClubId?: string; accent: string
}) {
  return (
    <View style={styles.sideHeader}>
      <View style={styles.sideChip}>
        <View style={[styles.sideDot, { backgroundColor: accent }]} />
        <MarkedName clubId={homeClubId} name={homeName} style={styles.sideName} />
      </View>
      <View style={[styles.sideChip, { justifyContent: 'flex-end' }]}>
        <MarkedName clubId={awayClubId} name={awayName} style={styles.sideName} align="right" />
        <View style={[styles.sideDot, { backgroundColor: prim.cottonMuted }]} />
      </View>
    </View>
  )
}

/**
 * A team's mark beside its name, on the match sheet's floodlit ground (centralisation
 * A-07, step 1). The mark comes from the team's id through `TeamMark`: a nation's
 * flag, a club's crest, or your own crest on your side. It replaced `withFlag` and
 * `withCountryFlag`, which put the flag inside the text as an emoji and found it by
 * the team's NAME, so a club got no mark at all and a renamed side lost its flag.
 * The mark sits on the outer side: before the name on the left, after it on the right.
 */
export function MarkedName({ clubId, name, style, align = 'left', textAlign, numberOfLines = 1, size = 16, onPress, accessibilityRole }: {
  clubId?: string | null; name: string; style?: any; align?: 'left' | 'right'
  /** The text's own alignment when it differs from the mark's side (the header hugs the score). */
  textAlign?: 'left' | 'right'
  numberOfLines?: number; size?: 16 | 20 | 24
  onPress?: () => void; accessibilityRole?: 'link'
}) {
  return (
    <View style={[styles.marked, align === 'right' && styles.markedRight]}>
      <TeamMark roles={ROLES.nylon} clubId={clubId} name={name} size={size} />
      <Text style={[style, styles.markedText, { textAlign: textAlign ?? align }]} numberOfLines={numberOfLines}
        onPress={onPress} accessibilityRole={accessibilityRole}>{countryName(name)}</Text>
    </View>
  )
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
  // Both on nothing: two empty bars, not a full bar for whoever's second (P8-49).
  const none = home + away <= 0
  const homeShare = none ? 0 : home / total
  const homeLeads = home > away
  const awayLeads = away > home
  const fmt = (v: number) => pct ? `${v}%` : (Number.isInteger(v) ? String(v) : v.toFixed(2))
  // The leading side's bar wears its club colour when the screen provides
  // one; the figure itself stays in the accent, for contrast. Square-ended
  // and thick, like a tape on the kit (P8.5-33: the rounded hairline bars were
  // FotMob's).
  const pair = useTeamColourPair()
  const homeBar = pair?.home ?? accent, awayBar = pair?.away ?? accent
  return (
    <View style={styles.statRow}>
      <View style={styles.statNums}>
        <Text style={[styles.statVal, homeLeads && { color: accent, fontFamily: font.bodyBlack }]}>{fmt(home)}</Text>
        <Text style={styles.statLabel}>{label}</Text>
        <Text style={[styles.statVal, { textAlign: 'right' }, awayLeads && { color: accent, fontFamily: font.bodyBlack }]}>{fmt(away)}</Text>
      </View>
      <View style={styles.statBarTrack}>
        <View style={[styles.statBarHalf, { flexDirection: 'row-reverse' }]}>
          <View style={{ width: `${homeShare * 100}%`, backgroundColor: homeLeads ? homeBar : prim.cottonMuted, height: 6 }} />
        </View>
        <View style={styles.statBarHalf}>
          <View style={{ width: `${none ? 0 : (1 - homeShare) * 100}%`, backgroundColor: awayLeads ? awayBar : prim.cottonMuted, height: 6 }} />
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
    ...(l.injured ? [kv(t('match.sheet.injured'), t('match.sheet.injuredValue', { min: l.subOffMinute, count: l.matchdaysOut ?? 0 }))] : []),
    kv(t('match.sheet.minutes'), l.minutes + (l.subOnMinute !== undefined ? t('match.sheet.onAt', { min: l.subOnMinute }) : l.subOffMinute !== undefined ? t('match.sheet.offAt', { min: l.subOffMinute }) : '')),
  ]
  if (l.goals) rows.push(kv(t('match.sheet.goals'), l.penaltyGoals ? t('match.sheet.goalsPen', { goals: l.goals, pens: l.penaltyGoals }) : l.goals))
  if (l.assists) rows.push(kv(t('match.sheet.assists'), l.assists))
  // §9 — surfaced right under the headline numbers, because an own goal or an
  // error that led to a goal is the story of that player's match.
  if (l.penaltiesMissed) rows.push(kv(t('match.sheet.pensMissed'), l.penaltiesMissed))
  if (l.ownGoals) rows.push(kv(t('match.sheet.ownGoals'), l.ownGoals))
  if (l.penaltiesWon) rows.push(kv(t('match.sheet.pensWon'), l.penaltiesWon))
  if (l.errorsLeadingToGoal) rows.push(kv(t('match.sheet.errors'), l.errorsLeadingToGoal))
  if (l.gk) {
    rows.push(
      kv(t('match.sheet.saves'), l.gk.saves),
      ...(l.gk.penaltiesSaved ? [kv(t('match.sheet.pensSaved'), l.gk.penaltiesSaved)] : []),
      kv(t('match.sheet.conceded'), l.gk.goalsConceded),
      kv(t('match.sheet.savePct'), `${l.gk.savePct}%`),
      kv(t('match.sheet.punches'), l.gk.punches),
      kv(t('match.sheet.highClaims'), l.gk.highClaims),
      kv(t('match.sheet.sweeper'), l.gk.sweeperActions),
    )
  } else {
    rows.push(
      kv(t('match.sheet.shotsOn'), `${l.shots} (${l.shotsOnTarget})`),
      kv(t('match.sheet.keyPasses'), l.keyPasses),
      kv(t('match.stat.bigCreated'), l.bigChancesCreated),
    )
    if (l.bigChancesMissed) rows.push(kv(t('match.stat.bigChancesMissed'), l.bigChancesMissed))
    rows.push(kv(t('match.stat.touchesInOppBox'), l.touchesInOppBox))
    if (l.offsides) rows.push(kv(t('match.stat.offsides'), l.offsides))
  }
  rows.push(
    kv(t('match.stat.touches'), l.touches),
    kv(t('match.sheet.passesAcc'), `${l.passes} (${l.accuratePasses})`),
    kv(t('match.stat.passAccuracy'), `${l.passAccuracy}%`),
  )
  if (l.crosses) rows.push(kv(t('match.stat.crosses'), l.crosses))
  if (l.longBalls) rows.push(kv(t('match.stat.longBalls'), l.longBalls))
  rows.push(
    kv(t('match.stat.dribblesShort'), l.dribbles),
    kv(t('match.sheet.duels'), `${l.groundDuelsWon}/${l.aerialDuelsWon}`),
    kv(t('match.stat.possessionLost'), l.possessionLost),
    kv(t('match.stat.tacklesWon'), l.tacklesWon),
    kv(t('match.stat.interceptions'), l.interceptions),
    kv(t('match.stat.clearances'), l.clearances),
  )
  if (l.blocks) rows.push(kv(t('match.stat.shotsBlocked'), l.blocks))
  rows.push(kv(t('match.sheet.foulsWon'), `${l.foulsCommitted} (${l.foulsWon})`))
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
          {l.motm && <EventMark kind="motm" size={14} />}
          {l.goals > 0 && <EventMark kind="goal" count={l.goals} />}
          {l.assists > 0 && <EventMark kind="assist" count={l.assists} />}
          {l.yellowCard && !l.redCard && <EventMark kind="yellow" size={11} />}
          {l.redCard && <EventMark kind="red" size={11} />}
          {l.subOnMinute !== undefined && <View style={styles.markMin}><EventMark kind="subOn" size={11} /><Text style={styles.subOn}>{l.subOnMinute}'</Text></View>}
          {l.subOffMinute !== undefined && <View style={styles.markMin}><EventMark kind="subOff" size={11} /><Text style={styles.subOff}>{l.subOffMinute}'</Text></View>}
          {/* §10.5 phase 4 — came off injured, and for how long. */}
          {l.injured && <View style={styles.markMin}><EventMark kind="injury" size={11} /><Text style={styles.injuredTag}>{t('match.outN', { n: l.matchdaysOut })}</Text></View>}
        </View>
        {unused
          ? <Text style={styles.unusedTag}>{t('match.unused')}</Text>
          : <RatingSquare value={l.rating} />}
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
export function EventRow({ e, score }: { e: MatchEvent; score?: string }) {
  const minute = `${e.minute}${e.plus ? `+${e.plus}` : ''}'`
  let icon: React.ReactNode = null, body: React.ReactNode = null
  if (e.type === 'goal') {
    // §9 — the row sits on the side the goal COUNTS FOR, so an own goal has to
    // shout that it's an own goal: different icon, red name, explicit label.
    // Without all three it reads as an opposition player scoring for us.
    icon = <EventMark kind={e.ownGoal ? 'ownGoal' : 'goal'} size={16} />
    const tag = e.ownGoal ? t('match.ownGoal') : e.penalty ? t('match.penalty') : null
    // A penalty has no assist — the equivalent credit is who won it.
    const credit = e.penWonName ? t('match.wonBy', { name: e.penWonName }) : e.assistName ? t('match.assistBy', { name: e.assistName }) : null
    body = (
      <>
        <Text style={styles.evText} numberOfLines={2}>
          <Text style={{ fontFamily: font.bodyBold, color: e.ownGoal ? prim.misery : prim.cotton }}>{e.playerName}</Text>
          {tag ? <Text style={[styles.evTag, e.ownGoal && { color: prim.misery }]}>  {tag}</Text> : null}
        </Text>
        {/* The score this goal made, so the timeline reads as the match went. */}
        {score ? <View style={styles.evScore}><Text style={styles.evScoreText}>{score}</Text></View> : null}
        {credit ? <Text style={styles.evAssist} numberOfLines={1}>{credit}</Text> : null}
        {e.errorByName ? <Text style={styles.evError} numberOfLines={1}>{t('match.errorBy', { name: e.errorByName })}</Text> : null}
      </>
    )
  } else if (e.type === 'penMissed') {
    // The one event that changes nothing on the scoreboard and everything in
    // the room — so it gets its own icon and says which way it went.
    icon = <EventMark kind="penMissed" size={16} />
    body = (
      <>
        <Text style={styles.evText} numberOfLines={2}>
          <Text style={{ fontFamily: font.bodyBold, color: prim.cotton }}>{e.playerName}</Text>
          <Text style={[styles.evTag, { color: prim.misery }]}>  {e.saved ? t('match.penSaved') : t('match.penMissedTag')}</Text>
        </Text>
        {e.saved && e.keeperName ? <Text style={styles.evAssist} numberOfLines={1}>{t('match.savedBy', { name: e.keeperName })}</Text> : null}
      </>
    )
  } else if (e.type === 'injury') {
    // §10.5 phase 4 — deliberately its own row, sitting directly above the
    // change it forced: a manager losing a player is a different event from a
    // manager choosing to make a substitution, and the timeline should say so.
    icon = <EventMark kind="injury" size={15} />
    const out = e.matchdaysOut === 1 ? t('match.outNext') : t('match.outFor', { count: e.matchdaysOut ?? 0 })
    body = (
      <>
        <Text style={styles.evText} numberOfLines={2}>
          <Text style={{ fontFamily: font.bodyBold, color: prim.cotton }}>{e.playerName}</Text>
          <Text style={[styles.evTag, { color: prim.misery }]}>{'  ' + t('match.injuredTag')}</Text>
        </Text>
        <Text style={styles.evAssist} numberOfLines={1}>
          {out}{e.replaced === false ? t('match.playedShort') : ''}
        </Text>
      </>
    )
  } else if (e.type === 'yellow' || e.type === 'red') {
    icon = <EventMark kind={e.type} size={14} />
    body = <Text style={styles.evText} numberOfLines={1}>{e.playerName}</Text>
  } else {
    icon = <EventMark kind="subOn" size={16} color={prim.cottonMuted} />
    body = (
      <>
        <Text style={styles.evText} numberOfLines={2}>
          <Text style={{ color: prim.volt }}>{e.playerName}</Text>
          <Text style={{ color: prim.cottonMuted }}>{t('match.forPlayer', { name: e.offPlayerName })}</Text>
        </Text>
        {/* §10.5 — a change at the interval and a change forced by an injury both
            read differently from a tactical one, so both say what they are. */}
        {e.halfTime ? <Text style={styles.evTag}>{t('match.atHalfTime')}</Text> : null}
        {e.forced ? <Text style={[styles.evTag, { color: prim.misery }]}>{t('match.forcedInjury')}</Text> : null}
      </>
    )
  }
  return (
    <View style={[styles.evRow, { flexDirection: e.isHome ? 'row' : 'row-reverse' }]}>
      <Text style={styles.evMinute}>{minute}</Text>
      <View style={styles.evIcon}>{icon}</View>
      <View style={{ flex: 1, alignItems: e.isHome ? 'flex-start' : 'flex-end' }}>{body}</View>
    </View>
  )
}

// Timeline with the period breaks folded in (P8-33): home on the left and away
// on the right, each goal with the score it made, the fourth official's board
// where the stoppage starts ("Board up · +4"), each break as a band across the
// width with the score at that point, and a goal VAR chalked off on its side.
// P8.5-33: the idea is common to every match app; the words and the shapes are
// ours (FotMob's centred pill between hairlines and its "+4 minutes added" went).
export type VarCall = { minute: number; isHome: boolean; playerName: string; reason: string }

export function Timeline({ events, addedTime, duration, revealUpTo, varCalls = [] }: {
  events: MatchEvent[]; addedTime: AddedTime; duration: number
  /** §7 live playback: only draw the period breaks that have been REACHED.
   *  Without it a match in its 20th minute already showed a "Full-time · +4'"
   *  line, which both looks wrong and gives away the stoppage time. */
  revealUpTo?: number
  /** Goals ruled out (from the feed's `chanceLines`), placed by minute. */
  varCalls?: VarCall[]
}) {
  const breaks = duration > 90
    ? [
        { at: 45,  label: t('match.brHalfTime'),  plus: addedTime.firstHalf },
        { at: 90,  label: t('match.brAfter90'), plus: addedTime.secondHalf },
        { at: 105, label: t('match.brEtBreak'), plus: addedTime.firstET ?? 0 },
        { at: 120, label: t('match.brAfterEt'), plus: addedTime.secondET ?? 0 },
      ]
    : [
        { at: 45, label: t('match.brHalfTime'), plus: addedTime.firstHalf },
        { at: 90, label: t('match.brFullTime'), plus: addedTime.secondHalf },
      ]

  const out: React.ReactNode[] = []
  const score = { h: 0, a: 0 }
  let bi = 0
  const announced = new Set<number>()
  // The board goes up as the stoppage starts: before the first event played
  // in it, or just before the break if nothing happened in it.
  const announce = (at: number, plus: number) => {
    if (plus <= 0 || announced.has(at)) return
    announced.add(at)
    out.push(<Text key={`plus${at}`} style={styles.addedText}>{t('match.boardUp', { n: plus })}</Text>)
  }
  const flushBreaksBefore = (minute: number) => {
    // A 90+3 goal belongs BEFORE the full-time line, so compare on the whole
    // minute — stoppage-time events stay inside the half they were played in.
    while (bi < breaks.length && breaks[bi].at < minute) {
      const b = breaks[bi++]
      announce(b.at, b.plus)
      out.push(
        <View key={`b${b.at}`} style={styles.breakRow}>
          <Text style={styles.breakText}>{b.label}</Text>
          <Text style={styles.breakText}>{score.h}–{score.a}</Text>
        </View>,
      )
    }
  }
  type Item = { key: number; e?: MatchEvent; v?: VarCall }
  const items: Item[] = [
    ...events.map(e => ({ key: e.minute + (e.plus ?? 0) / 100, e })),
    ...varCalls.filter(v => revealUpTo === undefined || v.minute <= revealUpTo).map(v => ({ key: v.minute + 0.0001, v })),
  ].sort((a, b) => a.key - b.key)
  items.forEach((it, i) => {
    const minute = it.e?.minute ?? it.v!.minute
    flushBreaksBefore(minute)
    const brk = breaks.find(b => b.at === minute)
    if (it.e?.plus && brk) announce(brk.at, brk.plus)
    if (it.v) {
      const v = it.v
      out.push(
        <View key={`v${i}`} style={[styles.evRow, { flexDirection: v.isHome ? 'row' : 'row-reverse' }]}>
          <Text style={styles.evMinute}>{`${v.minute}'`}</Text>
          <View style={styles.evIcon}><EventMark kind="var" size={15} /></View>
          <View style={{ flex: 1, alignItems: v.isHome ? 'flex-start' : 'flex-end' }}>
            <Text style={styles.evText} numberOfLines={1}><Text style={{ fontFamily: font.bodyBold, color: prim.cotton }}>{v.playerName}</Text></Text>
            <Text style={[styles.evTag, { color: prim.cardYellow }]} numberOfLines={1}>VAR · {v.reason}</Text>
          </View>
        </View>,
      )
      return
    }
    const e = it.e!
    if (e.type === 'goal') e.isHome ? score.h++ : score.a++
    out.push(<EventRow key={`e${i}`} e={e} score={e.type === 'goal' ? `${score.h}–${score.a}` : undefined} />)
  })
  flushBreaksBefore(revealUpTo ?? Infinity)
  return <>{out}</>
}

// ── The feed (P8-33) ────────────────────────────────────────────────────────
// A line with a title (a goal, a card, a change, a big chance, VAR) is a card:
// the minute in a badge, the heading, the player on his own row beside his
// club's crest, then the words, with the side's colour down the edge so whose
// moment it is reads before a word does. Everything else — shots, corners,
// fouls, offsides — is a plain row with a dot in the side's colour. Markers
// (kick-off, the breaks, full time) sit across the width.
export type FeedRowData = CommentaryLine & { marker?: boolean }

export function FeedRow({ row, homeName, awayName, homeClubId, awayClubId }: {
  row: FeedRowData; homeName: string; awayName: string; homeClubId?: string; awayClubId?: string
}) {
  const pair = useTeamColourPair()
  const side = row.isHome === undefined ? null : row.isHome
  const colour = side === null ? prim.cottonMuted : side ? (pair?.home ?? prim.cotton) : (pair?.away ?? prim.cottonMuted)
  if (row.marker) {
    return (
      <View style={styles.feedMarker}>
        <Text style={styles.feedMarkerMin}>{row.minute}</Text>
        <Text style={[styles.feedText, row.big && { color: prim.cotton, fontFamily: font.bodyBold }]}>{row.text}</Text>
      </View>
    )
  }
  if (!row.title) {
    return (
      <View style={styles.feedPlain}>
        <Text style={styles.feedMin}>{row.minute}</Text>
        <View style={[styles.feedDot, { backgroundColor: colour }]} />
        <Text style={styles.feedText}>{row.text}</Text>
      </View>
    )
  }
  // A sending-off is the one moment in the feed that should look like trouble:
  // a red minute badge and a red heading. (P8.5-33: the red wash fading down
  // the card was FotMob's.)
  const red = row.title === SENT_OFF
  return (
    <View style={[styles.feedCard, { borderLeftColor: colour }]}>
      <View style={styles.feedCardHead}>
        <View style={[styles.feedBadge, red && { backgroundColor: prim.misery }]}><Text style={styles.feedBadgeText}>{row.minute}</Text></View>
        <Text style={[styles.feedTitle, row.big && { color: prim.cotton }, red && { color: prim.misery }]} numberOfLines={1}>{row.title}</Text>
      </View>
      {row.player && side !== null ? (
        <View style={styles.feedPlayer}>
          <Crest roles={ROLES.nylon} clubId={side ? homeClubId : awayClubId} name={side ? homeName : awayName} size={18} />
          <Text style={styles.feedPlayerName} numberOfLines={1}>{row.player}</Text>
        </View>
      ) : null}
      <Text style={styles.feedText}>{row.text}</Text>
    </View>
  )
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
  motm: { flexDirection: 'row', alignItems: 'center', gap: space[2], paddingTop: space[2] },

  marked: { flexDirection: 'row', alignItems: 'center', gap: 6, flex: 1, minWidth: 0 },
  markedRight: { flexDirection: 'row-reverse' },
  markedText: { flex: 1, flexShrink: 1 },
  sideHeader: { flexDirection: 'row', alignItems: 'center', gap: space[2], marginBottom: space[2] },
  sideChip: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 5 },
  sideDot: { width: 8, height: 8, borderRadius: 4 },
  sideName: { flex: 1, fontSize: 10, fontFamily: font.bodyBlack, color: prim.cottonMuted, textTransform: 'uppercase', letterSpacing: 0.5 },

  scorerLine: { fontSize: 10, color: prim.cottonMuted },
  scorerMark: { color: prim.cottonMuted, fontFamily: font.bodyBold },

  statRow: { marginBottom: space[2] },
  statNums: { flexDirection: 'row', alignItems: 'center' },
  statVal: { width: 52, fontSize: 12, color: prim.cottonMuted },
  statLabel: { flex: 1, fontSize: 11, color: prim.cottonMuted, textAlign: 'center' },
  statBarTrack: { flexDirection: 'row', gap: 2, marginTop: 3 },
  statBarHalf: { flex: 1, backgroundColor: prim.nylonSunken, height: 6, overflow: 'hidden' },

  evRow: { alignItems: 'center', gap: space[2], paddingVertical: 3 },
  evMinute: { width: 38, fontSize: 10, fontFamily: font.bodyBlack, color: prim.cottonMuted, textAlign: 'center' },
  evIcon: { width: 18, alignItems: 'center', justifyContent: 'center' },
  evScore: { alignSelf: 'flex-start', backgroundColor: prim.nylonSunken, paddingHorizontal: 5, paddingVertical: 1, marginTop: 2 },
  evScoreText: { fontSize: 10, fontFamily: font.bodyBlack, color: prim.cotton },
  evText: { fontSize: 11, color: prim.cottonMuted },
  evAssist: { fontSize: 10, color: prim.cottonMuted },
  // §9 markers. The tag carries weight as well as colour so "Own goal" still
  // reads as exceptional without relying on hue alone.
  evTag: { fontSize: 9, fontFamily: font.bodyBlack, color: prim.cottonMuted, textTransform: 'uppercase', letterSpacing: 0.4 },
  evError: { fontSize: 10, color: prim.misery, },
  breakRow: { flexDirection: 'row', justifyContent: 'space-between', backgroundColor: prim.nylonSunken, borderLeftWidth: 4, borderLeftColor: prim.cotton, paddingHorizontal: space[2], paddingVertical: 4, marginVertical: space[1] },
  breakText: { fontSize: 10, fontFamily: font.bodyBlack, color: prim.cotton, textTransform: 'uppercase', letterSpacing: 0.5 },
  addedText: { fontSize: 10, fontFamily: font.bodyBlack, color: prim.volt, letterSpacing: 0.4, paddingVertical: 2, paddingLeft: space[2] },
  feedMarker: { flexDirection: 'row', gap: space[2], paddingVertical: space[2], paddingHorizontal: space[2], backgroundColor: prim.nylonSunken, marginVertical: 4 },
  feedMarkerMin: { width: 40, fontSize: 11, fontFamily: font.bodyBlack, color: prim.cotton },
  feedPlain: { flexDirection: 'row', alignItems: 'flex-start', gap: space[2], paddingVertical: 6, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: prim.ruleNylon },
  feedMin: { width: 40, fontSize: 11, fontFamily: font.bodyBlack, color: prim.cottonMuted },
  feedDot: { width: 6, height: 6, borderRadius: 3, marginTop: 6 },
  feedText: { flex: 1, fontSize: type.body.fontSize, color: prim.cottonMuted, lineHeight: 19 },
  feedCard: { backgroundColor: prim.nylonRaised, borderLeftWidth: 4, padding: space[2], gap: 6, marginVertical: 4 },
  feedCardHead: { flexDirection: 'row', alignItems: 'center', gap: space[2] },
  feedBadge: { backgroundColor: prim.cotton, paddingHorizontal: 6, paddingVertical: 2, minWidth: 34, alignItems: 'center' },
  feedBadgeText: { fontSize: 11, fontFamily: font.bodyBlack, color: prim.nylon },
  feedTitle: { flex: 1, fontSize: type.body.fontSize, fontFamily: font.bodyBlack, color: prim.cottonMuted, textTransform: 'uppercase', letterSpacing: 0.4 },
  feedPlayer: { flexDirection: 'row', alignItems: 'center', gap: space[2] },
  feedPlayerName: { flex: 1, fontSize: type.body.fontSize, fontFamily: font.bodyBold, color: prim.cotton },

  playerRow: { flexDirection: 'row', alignItems: 'center', gap: space[2], paddingVertical: 5, borderBottomWidth: 1, borderBottomColor: prim.ruleNylon },
  playerRowMotm: { backgroundColor: prim.volt + '22', borderWidth: 1, borderColor: prim.volt, borderRadius: 0, paddingHorizontal: 4 },
  playerPos: { width: 32, fontSize: 9, fontFamily: font.bodyBlack, color: prim.cottonMuted },
  playerName: { fontSize: type.body.fontSize, color: prim.cotton, flexShrink: 1 },
  playerNameMotm: { color: prim.volt, fontFamily: font.bodyBlack },
  motmChip: { backgroundColor: prim.volt, borderRadius: 0, paddingHorizontal: 5, paddingVertical: 1 },
  motmChipText: { fontSize: 9, fontFamily: font.bodyBlack, color: prim.nylon, letterSpacing: 0.5 },
  playerBadge: { fontSize: 10 },
  playerBadgeMuted: { fontSize: 9, color: prim.cottonMuted, fontFamily: font.bodyBold },
  cardYellow: { width: 8, height: 11, borderRadius: 1, backgroundColor: prim.cardYellow },
  cardRed: { width: 8, height: 11, borderRadius: 1, backgroundColor: prim.misery },
  markMin: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  subOn: { fontSize: 9, color: prim.volt, fontFamily: font.bodyBold },
  subOff: { fontSize: 9, color: prim.misery, fontFamily: font.bodyBold },
  unusedTag: { fontSize: 9, color: prim.cottonMuted, },
  injuredTag: { fontSize: 9, color: prim.misery, fontFamily: font.bodyBold },

  sheet: { backgroundColor: prim.nylonSunken, borderRadius: 0, padding: space[2], marginVertical: space[1] },
  sheetRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 2 },
  sheetKey: { fontSize: 11, color: prim.cottonMuted },
  sheetVal: { fontSize: 11, fontFamily: font.bodyBold },

})
