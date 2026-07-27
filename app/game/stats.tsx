import React, { useEffect, useMemo, useState } from 'react'
import { View, Text, StyleSheet, ScrollView, Pressable, ActivityIndicator, TextInput } from 'react-native'
import { AppModal } from '@/components/AppModal'
import { BackButton, PressCard } from '@/components/ui'
import { router, useLocalSearchParams } from 'expo-router'
import { useGameStore } from '@/store/gameStore'
import { useModeTheme } from '@/hooks/useModeTheme'
import { computeLeagueRunStats, computeCLRunStats, computeWCRunStats, type PlayerMatchLog, type PlayerMatchLogEntry } from '@/engine/run-stats'
import { RulesModal } from '@/components/InfoBubble'
import { fetchRunById } from '@/db/queries/runs'
import { TeamLabel } from '@/components/TeamLabel'
import { playerSheet } from '@/components/MatchStatsParts'
import { colors, spacing, typography, radius, shadows, ratingColor } from '@/theme'
import type { CompetitionStats, SeasonAwards, AwardCandidate, PlayerStatLine } from '@/types/stats'

type Tab = string

// §10.5 phase 3 — every season stat the screen can rank by, in one table so a
// column is defined once (label, how to sort it, how to print it, who qualifies)
// instead of five parallel ternaries that had to be edited in lockstep.
const pct = (n: number, d: number) => d > 0 ? Math.round((n / d) * 100) : 0

type Board = {
  key: Tab
  label: string
  value: (p: PlayerStatLine) => number
  render: (p: PlayerStatLine) => string
  /** Who appears at all — keeps 1-of-1 = 100% cameos off a rate leaderboard. */
  eligible: (p: PlayerStatLine) => boolean
}

const BOARDS: Board[] = [
  { key: 'scorers', label: 'Goals', value: p => p.goals, render: p => String(p.goals), eligible: p => p.goals > 0 },
  { key: 'assists', label: 'Assists', value: p => p.assists, render: p => String(p.assists), eligible: p => p.assists > 0 },
  { key: 'clean', label: 'CS', value: p => p.cleanSheets, render: p => String(p.cleanSheets), eligible: p => p.cleanSheets > 0 },
  { key: 'rating', label: 'Rating', value: p => p.avgRating ?? 0, render: p => (p.avgRating ?? 0).toFixed(2), eligible: p => (p.matchesRated ?? 0) >= MIN_RATED },
  { key: 'potm', label: '★ POTM', value: p => p.potm ?? 0, render: p => String(p.potm ?? 0), eligible: p => (p.potm ?? 0) > 0 },
  { key: 'created', label: 'Chances', value: p => p.chancesCreated ?? 0, render: p => String(p.chancesCreated ?? 0), eligible: p => (p.chancesCreated ?? 0) > 0 },
  { key: 'shots', label: 'Shots', value: p => p.shots ?? 0, render: p => String(p.shots ?? 0), eligible: p => (p.shots ?? 0) > 0 },
  { key: 'sot', label: 'On target', value: p => p.shotsOnTarget ?? 0, render: p => String(p.shotsOnTarget ?? 0), eligible: p => (p.shotsOnTarget ?? 0) > 0 },
  {
    key: 'pass', label: 'Pass %',
    value: p => pct(p.accuratePasses ?? 0, p.passes ?? 0),
    render: p => `${pct(p.accuratePasses ?? 0, p.passes ?? 0)}%  (${p.accuratePasses ?? 0}/${p.passes ?? 0})`,
    eligible: p => (p.passes ?? 0) >= 200,
  },
  {
    key: 'dribbles', label: 'Dribbles',
    value: p => p.dribbles ?? 0,
    render: p => `${p.dribbles ?? 0}  (${pct(p.dribbles ?? 0, p.dribblesAttempted ?? 0)}%)`,
    eligible: p => (p.dribbles ?? 0) > 0,
  },
  { key: 'tackles', label: 'Tackles', value: p => p.tacklesWon ?? 0, render: p => String(p.tacklesWon ?? 0), eligible: p => (p.tacklesWon ?? 0) > 0 },
  { key: 'fouls', label: 'Fouls', value: p => p.fouls ?? 0, render: p => String(p.fouls ?? 0), eligible: p => (p.fouls ?? 0) > 0 },
  { key: 'yellow', label: 'Yellows', value: p => p.yellowCards ?? 0, render: p => String(p.yellowCards ?? 0), eligible: p => (p.yellowCards ?? 0) > 0 },
  { key: 'red', label: 'Reds', value: p => p.redCards ?? 0, render: p => String(p.redCards ?? 0), eligible: p => (p.redCards ?? 0) > 0 },
]
const YOUR_TINT = 'rgba(255,255,255,0.06)'   // light white tint for your players

// Minimum matches played to appear on the average-rating leaderboard (keeps a
// one-match 8.0 cameo from outranking a full season of 7.4s).
const MIN_RATED = 3

export default function StatsScreen() {
  const { simResult, draftedPlayers, benchPlayers, useSubstitutes, placedLeague, mode, clResult, wcResult, customUclQual } = useGameStore()
  const fullSquad = [...draftedPlayers, ...benchPlayers]
  const theme = useModeTheme()
  const params = useLocalSearchParams<{ runId?: string }>()

  const [loading, setLoading] = useState(true)
  const [stats, setStats]     = useState<CompetitionStats | null>(null)
  const [awards, setAwards]   = useState<SeasonAwards | null>(null)
  const [matchLog, setMatchLog] = useState<PlayerMatchLog | null>(null)  // fresh runs only
  const [tab, setTab]         = useState<Tab>('scorers')
  const [query, setQuery]     = useState('')
  const [rulesOpen, setRulesOpen] = useState(false)
  const [openTeamId, setOpenTeamId] = useState<string | null>(null)
  const [openPlayer, setOpenPlayer] = useState<PlayerStatLine | null>(null)  // game-log drill-down

  useEffect(() => {
    async function go() {
      try {
        // Opened from history/leaderboard — read the saved snapshot.
        if (params.runId) {
          const run = await fetchRunById(params.runId) as any
          if (run?.stats && run?.awards) { setStats(run.stats as CompetitionStats); setAwards(run.awards as SeasonAwards) }
          return
        }
        // Fresh run — compute from the live result in store.
        let res = null
        if (mode === 'champions_league_custom' && clResult) res = await computeCLRunStats(clResult, fullSquad, 2025, customUclQual?.ties, useSubstitutes)
        else if (mode === 'champions_league' && clResult)   res = await computeCLRunStats(clResult, fullSquad, undefined, undefined, useSubstitutes)
        else if (mode === 'world_cup' && wcResult)         res = await computeWCRunStats(wcResult, fullSquad, undefined, useSubstitutes)
        else if (simResult && placedLeague)                res = await computeLeagueRunStats(simResult, fullSquad, placedLeague, useSubstitutes)
        if (res) { setStats(res.stats); setAwards(res.awards); setMatchLog(res.matchLog) }
      } catch (e) {
        console.warn('[stats] compute failed:', e)
      } finally {
        setLoading(false)
      }
    }
    go()
  }, [])

  // Rank maps for the searcher (rank among players with a positive value).
  const ranks = useMemo(() => {
    const mk = (key: 'goals' | 'assists' | 'cleanSheets' | 'potm') => {
      const m = new Map<string, number>()
      ;(stats?.players ?? []).filter(p => ((p as any)[key] ?? 0) > 0)
        .sort((a, b) => ((b as any)[key] ?? 0) - ((a as any)[key] ?? 0))
        .forEach((p, i) => m.set(p.playerId, i + 1))
      return m
    }
    const rt = new Map<string, number>()
    ;(stats?.players ?? []).filter(p => (p.matchesRated ?? 0) >= MIN_RATED)
      .sort((a, b) => (b.avgRating ?? 0) - (a.avgRating ?? 0))
      .forEach((p, i) => rt.set(p.playerId, i + 1))
    const award = (list: AwardCandidate[]) => {
      const m = new Map<string, number>(); list.forEach((c, i) => m.set(c.playerId, i + 1)); return m
    }
    return {
      goals: mk('goals'), assists: mk('assists'), clean: mk('cleanSheets'), potm: mk('potm'), rating: rt,
      pots: award(awards?.playerOfTheSeason ?? []), u21: award(awards?.bestU21 ?? []),
    }
  }, [stats, awards])

  if (loading) return (
    <View style={styles.center}><ActivityIndicator color={theme.accent} size="large" /><Text style={styles.muted}>Crunching the numbers…</Text></View>
  )
  if (!stats || !awards) return (
    <View style={styles.center}><Text style={{ fontSize: 40 }}>📊</Text><Text style={styles.muted}>No stats for this run.</Text>
      <Pressable onPress={() => router.back()} style={{ marginTop: spacing.md }}><Text style={{ color: theme.accent, fontWeight: '700' }}>← Back</Text></Pressable></View>
  )

  const players = stats.players
  const board = BOARDS.find(b => b.key === tab) ?? BOARDS[0]
  const lb = [...players].filter(board.eligible).sort((a, b) => board.value(b) - board.value(a))
  const statOf = (p: PlayerStatLine): string | number => board.render(p)
  const yourPlayers = players.filter(p => p.isPlayerClub).sort((a, b) => b.goals - a.goals || b.assists - a.assists)

  const q = query.trim().toLowerCase()
  const searchResults = q ? players.filter(p => p.name.toLowerCase().includes(q)).slice(0, 25) : []

  const teams = stats.teams
  const mostGoals   = [...teams].sort((a, b) => b.goalsFor - a.goalsFor)[0]
  const fewestAgainst = [...teams].sort((a, b) => a.goalsAgainst - b.goalsAgainst)[0]
  const mostClean   = [...teams].sort((a, b) => b.cleanSheets - a.cleanSheets)[0]

  return (
    <View style={[styles.container, { backgroundColor: theme.bgTint }]}>
      <View style={styles.header}>
        <BackButton />
        <Text style={[styles.headerTitle, { color: theme.accent }]}>Player Statistics</Text>
        <View style={{ width: 32 }} />
      </View>

      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        {/* Search */}
        <View style={styles.card}>
          <TextInput
            value={query} onChangeText={setQuery} placeholder={`Search any of ${players.length} players…`}
            placeholderTextColor={colors.textMuted} style={styles.search}
          />
          {q.length > 0 && (searchResults.length === 0
            ? <Text style={styles.muted}>No player matches “{query}”.</Text>
            : searchResults.map(p => (
              <Pressable key={p.playerId} onPress={() => setOpenPlayer(p)}
                style={[styles.searchRow, p.isPlayerClub && { backgroundColor: YOUR_TINT }]}>
                <View style={styles.nameCol}>
                  <Text style={[styles.name, p.isPlayerClub && { color: theme.accent }]} numberOfLines={1}>{p.name}</Text>
                  <Text style={styles.club}>{p.isPlayerClub ? 'Your XI' : p.clubName} · {p.seasonLabel} · {p.position}</Text>
                </View>
                <View style={styles.rankWrap}>
                  <RankChip label="G" val={p.goals} rank={ranks.goals.get(p.playerId)} />
                  <RankChip label="A" val={p.assists} rank={ranks.assists.get(p.playerId)} />
                  <RankChip label="CS" val={p.cleanSheets} rank={ranks.clean.get(p.playerId)} />
                  {p.avgRating != null && <RankChip label="AVG" val={p.avgRating.toFixed(2) as any} rank={ranks.rating.get(p.playerId)} />}
                  {(p.potm ?? 0) > 0 && <RankChip label="★POTM" val={p.potm} rank={ranks.potm.get(p.playerId)} />}
                  <RankChip label="POTS" rankOnly rank={ranks.pots.get(p.playerId)} />
                  <RankChip label="U21" rankOnly rank={ranks.u21.get(p.playerId)} />
                </View>
              </Pressable>
            )))}
        </View>

        {/* Awards */}
        <AwardCard title="🏆 Player of the Season" list={awards.playerOfTheSeason} theme={theme} total={players.length}
          onPressPlayer={id => { const p = players.find(x => x.playerId === id); if (p) setOpenPlayer(p) }} />
        <AwardCard title="🌟 Best U21" list={awards.bestU21} theme={theme} total={players.length}
          onPressPlayer={id => { const p = players.find(x => x.playerId === id); if (p) setOpenPlayer(p) }} />

        {/* Leaderboards */}
        <View style={styles.card}>
          {/* Horizontal: fourteen boards don't fit a wrapped row without the
              list below being pushed off the screen. */}
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.tabs}>
            {BOARDS.map(b => (
              <Pressable key={b.key} onPress={() => setTab(b.key)} style={[styles.tab, tab === b.key && { backgroundColor: theme.accent, borderColor: theme.accent }]}>
                <Text style={[styles.tabText, tab === b.key && styles.tabTextActive]}>{b.label}</Text>
              </Pressable>
            ))}
          </ScrollView>
          <Text style={styles.tapHint}>Tap a player to see every one of their matches</Text>
          {lb.length === 0 ? <Text style={styles.muted}>Nobody yet.</Text> : (
            <ScrollView style={styles.listScroll} nestedScrollEnabled showsVerticalScrollIndicator>
              {lb.map((p, i) => (
                <Pressable key={p.playerId} onPress={() => setOpenPlayer(p)}
                  style={[styles.row, p.isPlayerClub && { backgroundColor: YOUR_TINT, borderRadius: radius.sm }]}>
                  <Text style={styles.rank}>{i + 1}</Text>
                  <View style={styles.nameCol}>
                    <TeamLabel clubId={p.clubId} name={p.name} textStyle={[styles.name, p.isPlayerClub && { color: theme.accent }]} size={15} />
                    <Text style={styles.club}>{p.isPlayerClub ? 'Your XI' : p.clubName} · {p.seasonLabel}{tab === 'rating' ? ` · ${p.matchesRated} matches` : ''}</Text>
                  </View>
                  {tab === 'rating'
                    ? <View style={[styles.lbRatingChip, { backgroundColor: ratingColor(p.avgRating ?? 0) }]}>
                        <Text style={styles.lbRatingText}>{(p.avgRating ?? 0).toFixed(2)}</Text>
                      </View>
                    : <Text style={[styles.statVal, { color: tab === 'potm' ? '#FFD700' : theme.accent }]} numberOfLines={1}>{statOf(p)}</Text>}
                </Pressable>
              ))}
            </ScrollView>
          )}
          <Text style={styles.listCount}>
            {tab === 'scorers' ? `${lb.length} scorers` : tab === 'assists' ? `${lb.length} assisters`
              : tab === 'clean' ? `${lb.length} kept a clean sheet`
              : tab === 'rating' ? `${lb.length} players with ${MIN_RATED}+ matches`
              : `${lb.length} won a Player of the Match`} · {players.length} players total
          </Text>
        </View>

        {/* Team stats */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Team Stats</Text>
          <View style={styles.leaders}>
            <Leader label="Most goals" team={mostGoals?.clubName} val={mostGoals?.goalsFor} theme={theme} />
            <Leader label="Fewest conceded" team={fewestAgainst?.clubName} val={fewestAgainst?.goalsAgainst} theme={theme} />
            <Leader label="Most clean sheets" team={mostClean?.clubName} val={mostClean?.cleanSheets} theme={theme} />
          </View>
          <View style={styles.teamHead}>
            <Text style={[styles.teamCol, styles.teamName]}>Club</Text>
            <Text style={styles.teamCol}>For</Text><Text style={styles.teamCol}>Ag</Text><Text style={styles.teamCol}>CS</Text>
          </View>
          {/* Scrolls like the player leaderboards — the custom UCL fields 90+ clubs. */}
          <ScrollView style={styles.listScroll} nestedScrollEnabled showsVerticalScrollIndicator>
            {[...teams].sort((a, b) => b.goalsFor - a.goalsFor).map(t => (
              <Pressable key={t.clubId} style={styles.row} onPress={() => setOpenTeamId(t.clubId)}>
                <TeamLabel clubId={t.clubId} name={t.clubName} textStyle={styles.name} containerStyle={styles.teamName} size={15} />
                <Text style={styles.teamCol}>{t.goalsFor}</Text><Text style={styles.teamCol}>{t.goalsAgainst}</Text><Text style={styles.teamCol}>{t.cleanSheets}</Text>
              </Pressable>
            ))}
          </ScrollView>
          <Text style={styles.listCount}>{teams.length} clubs · tap one to see its squad</Text>
        </View>

        {/* Your players */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Your Players</Text>
          <View style={styles.yourHead}>
            <Text style={[styles.teamCol, styles.teamName]}>Player</Text>
            <Text style={styles.yc}>G</Text><Text style={styles.yc}>A</Text><Text style={styles.yc}>CS</Text><Text style={styles.ycWide}>AVG</Text><Text style={styles.yc}>★</Text>
          </View>
          {yourPlayers.map(p => (
            <Pressable key={p.playerId} onPress={() => setOpenPlayer(p)}
              style={[styles.row, { backgroundColor: YOUR_TINT, borderRadius: radius.sm }]}>
              <View style={styles.teamName}>
                <Text style={[styles.name, { color: theme.accent }]} numberOfLines={1}>
                  {p.name}{p.isBench && <Text style={styles.subTag}> SUB</Text>}
                </Text>
                <Text style={styles.posTag}>{p.position} · {p.seasonLabel} · {p.matchesRated ?? p.matchesPlayed ?? 0} played</Text>
              </View>
              <Text style={styles.yc}>{p.goals}</Text><Text style={styles.yc}>{p.assists}</Text><Text style={styles.yc}>{p.cleanSheets}</Text>
              {p.avgRating != null
                ? <View style={[styles.lbRatingChip, { backgroundColor: ratingColor(p.avgRating), width: 44 }]}>
                    <Text style={styles.lbRatingText}>{p.avgRating.toFixed(2)}</Text>
                  </View>
                : <Text style={styles.ycWide}>—</Text>}
              <Text style={[styles.yc, { color: '#FFD700', fontWeight: typography.black }]}>{p.potm || '—'}</Text>
            </Pressable>
          ))}
          <Text style={styles.tapHint}>Tap a player for their match-by-match log</Text>
        </View>

        {/* Full rulebook (custom UCL runs) */}
        {mode === 'champions_league_custom' && (
          <Pressable style={styles.rulesBtn} onPress={() => setRulesOpen(true)}>
            <Text style={styles.rulesBtnText}>📖 How this competition works — all rules</Text>
          </Pressable>
        )}
      </ScrollView>
      <RulesModal visible={rulesOpen} onClose={() => setRulesOpen(false)} accent={theme.accent} />
      <PlayerGamesModal
        player={openPlayer}
        entries={openPlayer ? matchLog?.get(openPlayer.playerId) ?? [] : []}
        accent={theme.accent}
        onClose={() => setOpenPlayer(null)}
      />
      <TeamRosterModal
        team={teams.find(t => t.clubId === openTeamId) ?? null}
        players={openTeamId ? players.filter(p => p.clubId === openTeamId) : []}
        accent={theme.accent}
        onClose={() => setOpenTeamId(null)}
        onPressPlayer={p => { setOpenTeamId(null); setOpenPlayer(p) }}
      />
    </View>
  )
}

// Player game log — every match this player featured in this run, regenerated
// deterministically from the per-match seeds (fresh runs only; saved history
// keeps just the aggregates). Each row shows the headline stats — rating,
// goals/assists (saves for keepers), sub in/out minutes — and expands to the
// full per-match stat sheet (same renderer as the match-detail modal).
function PlayerGamesModal({ player, entries, accent, onClose }: {
  player: PlayerStatLine | null
  entries: PlayerMatchLogEntry[]
  accent: string
  onClose: () => void
}) {
  const [expanded, setExpanded] = useState<number | null>(null)
  useEffect(() => { setExpanded(null) }, [player])
  const isGK = player?.position === 'GK'
  return (
    <AppModal visible={player !== null} onRequestClose={onClose}>
      <Pressable style={modalStyles.overlay} onPress={onClose}>
        <Pressable style={modalStyles.card} onPress={() => {}}>
          {player && (
            <>
              <TeamLabel clubId={player.clubId} name={player.name} textStyle={modalStyles.title} size={20} />
              <Text style={modalStyles.subtitle}>
                {player.isPlayerClub ? 'Your XI' : player.clubName} · {player.position} · {player.seasonLabel}
                {player.avgRating != null ? ` · avg ${player.avgRating.toFixed(2)}` : ''}
                {(player.potm ?? 0) > 0 ? ` · ★${player.potm} POTM` : ''}
              </Text>
              {/* flexShrink (not a fixed maxHeight) so the list fills only the
                  space between the header and the Close button inside the capped
                  card — otherwise a long game log overflowed and the bottom rows
                  + Close button were clipped off-screen and unreachable. */}
              <ScrollView style={{ flexShrink: 1 }} showsVerticalScrollIndicator>
                {/* §10.5 phase 3 — the player's whole season, always. It used
                    to appear only when there was no game log, but these are the
                    numbers you open a player to see. */}
                <View style={gameStyles.seasonGrid}>
                  <SeasonTotal label="Matches" value={player.matchesRated ?? player.matchesPlayed ?? 0} />
                  <SeasonTotal label="Goals" value={player.goals} />
                  <SeasonTotal label="Assists" value={player.assists} />
                  <SeasonTotal label="Clean sheets" value={player.cleanSheets} />
                  <SeasonTotal label="Chances created" value={player.chancesCreated ?? 0} />
                  <SeasonTotal label="Shots" value={player.shots ?? 0} />
                  <SeasonTotal label="On target" value={player.shotsOnTarget ?? 0} />
                  <SeasonTotal label="Tackles won" value={player.tacklesWon ?? 0} />
                  <SeasonTotal label="Fouls" value={player.fouls ?? 0} />
                  <SeasonTotal label="Pass %" text={`${pct(player.accuratePasses ?? 0, player.passes ?? 0)}%`} sub={`${player.accuratePasses ?? 0}/${player.passes ?? 0}`} />
                  <SeasonTotal label="Dribbles" text={String(player.dribbles ?? 0)} sub={`${pct(player.dribbles ?? 0, player.dribblesAttempted ?? 0)}% of ${player.dribblesAttempted ?? 0}`} />
                  <SeasonTotal label="Cards" text={`${player.yellowCards ?? 0}Y ${player.redCards ?? 0}R`} />
                </View>
                {entries.length === 0 && (
                  <Text style={modalStyles.empty}>Match-by-match logs are only kept for the run where the stats were computed.</Text>
                )}
                {entries.map((e, i) => {
                  const l = e.line
                  const headline = isGK || l.gk
                    ? `${l.gk?.saves ?? 0} saves`
                    : `${l.goals}G ${l.assists}A`
                  return (
                    <View key={i}>
                      <Pressable style={[gameStyles.row, l.motm && gameStyles.rowMotm]} onPress={() => setExpanded(expanded === i ? null : i)}>
                        <View style={{ flex: 1 }}>
                          <Text style={gameStyles.opp} numberOfLines={1}>
                            {e.isHome ? 'vs' : '@'} {e.opponentName}
                            <Text style={[gameStyles.score, { color: e.goalsFor > e.goalsAgainst ? '#22C55E' : e.goalsFor < e.goalsAgainst ? '#EF4444' : colors.textSecondary }]}>
                              {'  '}{e.goalsFor}–{e.goalsAgainst}
                            </Text>
                          </Text>
                          <Text style={gameStyles.meta} numberOfLines={1}>
                            {e.label} · {l.minutes}'
                            {l.subOnMinute !== undefined ? ` · ▲ on ${l.subOnMinute}'` : ''}
                            {l.subOffMinute !== undefined ? ` · ▼ off ${l.subOffMinute}'` : ''}
                            {l.yellowCard ? ' · 🟨' : ''}{l.redCard ? ' · 🟥' : ''}
                          </Text>
                        </View>
                        {l.motm && <Text style={gameStyles.motm}>★</Text>}
                        <Text style={gameStyles.headline}>{headline}</Text>
                        <View style={[gameStyles.chip, { backgroundColor: ratingColor(l.rating) }]}>
                          <Text style={gameStyles.chipText}>{l.rating.toFixed(1)}</Text>
                        </View>
                        <Text style={gameStyles.caret}>{expanded === i ? '▾' : '▸'}</Text>
                      </Pressable>
                      {expanded === i && (
                        <View style={gameStyles.sheet}>
                          {playerSheet(l).map(([k, v]) => (
                            <View key={k} style={gameStyles.sheetRow}>
                              <Text style={gameStyles.sheetKey}>{k}</Text>
                              <Text style={gameStyles.sheetVal}>{v}</Text>
                            </View>
                          ))}
                        </View>
                      )}
                    </View>
                  )
                })}
              </ScrollView>
              <Text style={gameStyles.hint}>Tap a match to expand the full stat sheet</Text>
            </>
          )}
          <Pressable style={[modalStyles.closeBtn, { borderColor: accent }]} onPress={onClose}>
            <Text style={[modalStyles.closeText, { color: accent }]}>Close</Text>
          </Pressable>
        </Pressable>
      </Pressable>
    </AppModal>
  )
}

/** One season number in the player's totals grid. `text`/`sub` carry the rate
 *  stats, where the headline is a percentage and the raw split sits under it. */
function SeasonTotal({ label, value, text, sub }: {
  label: string; value?: number; text?: string; sub?: string
}) {
  return (
    <View style={gameStyles.seasonTotal}>
      <Text style={gameStyles.seasonTotalVal}>{text ?? value ?? 0}</Text>
      <Text style={gameStyles.seasonTotalLbl}>{label}</Text>
      {sub ? <Text style={gameStyles.seasonTotalSub}>{sub}</Text> : null}
    </View>
  )
}

const gameStyles = StyleSheet.create({
  seasonGrid: { flexDirection: 'row', flexWrap: 'wrap', paddingVertical: spacing.md, rowGap: spacing.md },
  seasonTotal: { width: '25%', alignItems: 'center', gap: 1 },
  seasonTotalVal: { fontSize: typography.md, fontWeight: typography.black, color: colors.textPrimary },
  seasonTotalLbl: { fontSize: 8, color: colors.textMuted, textTransform: 'uppercase', letterSpacing: 0.4, textAlign: 'center' },
  seasonTotalSub: { fontSize: 8, color: colors.textMuted, opacity: 0.75 },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingVertical: 7, paddingHorizontal: 4, borderBottomWidth: 1, borderBottomColor: colors.border },
  rowMotm: { backgroundColor: '#FFD70015', borderRadius: radius.sm },
  opp: { fontSize: typography.sm, color: colors.textPrimary, fontWeight: typography.medium },
  score: { fontWeight: typography.black, fontSize: typography.sm },
  meta: { fontSize: 10, color: colors.textMuted, marginTop: 1 },
  motm: { fontSize: 14, color: '#FFD700' },
  headline: { fontSize: typography.xs, color: colors.textSecondary, fontWeight: typography.bold },
  chip: { borderRadius: radius.sm, paddingHorizontal: 5, paddingVertical: 2, minWidth: 34, alignItems: 'center' },
  chipText: { fontSize: 11, fontWeight: typography.black, color: '#0A0E1A' },
  caret: { fontSize: 12, color: colors.textMuted, width: 12 },
  sheet: { backgroundColor: colors.bgElevated, borderRadius: radius.sm, padding: spacing.sm, marginVertical: 4, gap: 3 },
  sheetRow: { flexDirection: 'row', justifyContent: 'space-between', gap: spacing.md },
  sheetKey: { fontSize: 11, color: colors.textMuted },
  sheetVal: { fontSize: 11, color: colors.textPrimary, fontWeight: typography.bold },
  hint: { fontSize: 10, color: colors.textMuted, textAlign: 'center', paddingTop: spacing.xs },
})

// Opposing-team roster viewer — tap any team in Team Stats to see every one
// of their players and individual stats for this run, same data source as
// the leaderboards above (CompetitionStats.players), just filtered by club.
function TeamRosterModal({ team, players, accent, onClose, onPressPlayer }: {
  team: { clubId: string; clubName: string; goalsFor: number; goalsAgainst: number; cleanSheets: number } | null
  players: PlayerStatLine[]
  accent: string
  onClose: () => void
  onPressPlayer?: (p: PlayerStatLine) => void
}) {
  const sorted = [...players].sort((a, b) => b.goals - a.goals || b.assists - a.assists || a.name.localeCompare(b.name))
  return (
    <AppModal visible={team !== null} onRequestClose={onClose}>
      <Pressable style={modalStyles.overlay} onPress={onClose}>
        <Pressable style={modalStyles.card} onPress={() => {}}>
          {team && (
            <>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
                <TeamLabel clubId={team.clubId} name={team.clubName} textStyle={modalStyles.title} size={20} />
              </View>
              <Text style={modalStyles.subtitle}>
                {team.goalsFor} scored · {team.goalsAgainst} conceded · {team.cleanSheets} clean sheets
              </Text>
              <ScrollView style={{ flexShrink: 1 }} showsVerticalScrollIndicator>
                <View style={modalStyles.head}>
                  <Text style={[modalStyles.col, modalStyles.nameCol]}>Player</Text>
                  <Text style={modalStyles.col}>G</Text><Text style={modalStyles.col}>A</Text><Text style={modalStyles.col}>CS</Text>
                </View>
                {sorted.map(p => (
                  <Pressable
                    key={p.playerId}
                    onPress={onPressPlayer ? () => onPressPlayer(p) : undefined}
                    disabled={!onPressPlayer}
                    style={[modalStyles.row, p.isPlayerClub && { backgroundColor: accent + '15' }]}>
                    <View style={modalStyles.nameCol}>
                      <Text style={[modalStyles.name, p.isPlayerClub && { color: accent }]} numberOfLines={1}>
                        {p.name}{p.isBench && <Text style={modalStyles.subTag}> SUB</Text>}
                      </Text>
                      <Text style={modalStyles.pos}>{p.position}</Text>
                    </View>
                    <Text style={modalStyles.col}>{p.goals}</Text>
                    <Text style={modalStyles.col}>{p.assists}</Text>
                    <Text style={modalStyles.col}>{p.cleanSheets}</Text>
                  </Pressable>
                ))}
                {sorted.length === 0 && <Text style={modalStyles.empty}>No squad data for this club.</Text>}
              </ScrollView>
            </>
          )}
          <Pressable style={[modalStyles.closeBtn, { borderColor: accent }]} onPress={onClose}>
            <Text style={[modalStyles.closeText, { color: accent }]}>Close</Text>
          </Pressable>
        </Pressable>
      </Pressable>
    </AppModal>
  )
}

const modalStyles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.75)', justifyContent: 'center', alignItems: 'center', padding: spacing.lg },
  card: { width: '100%', maxHeight: '80%', backgroundColor: colors.bgCard, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, padding: spacing.lg, gap: spacing.sm },
  title: { fontSize: typography.lg, fontWeight: typography.black, color: colors.textPrimary },
  subtitle: { fontSize: typography.xs, color: colors.textMuted, marginBottom: spacing.sm },
  head: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingBottom: 4, borderBottomWidth: 1, borderBottomColor: colors.border },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: colors.border },
  nameCol: { flex: 1 },
  col: { width: 28, fontSize: typography.xs, color: colors.textSecondary, textAlign: 'center', fontWeight: typography.bold },
  name: { fontSize: typography.sm, color: colors.textPrimary, fontWeight: typography.medium },
  pos: { fontSize: 10, color: colors.textMuted },
  subTag: { fontSize: 9, fontWeight: typography.black, color: colors.warning },
  empty: { fontSize: typography.sm, color: colors.textMuted, textAlign: 'center', paddingVertical: spacing.lg },
  closeBtn: { marginTop: spacing.sm, borderWidth: 1, borderRadius: radius.md, paddingVertical: spacing.md, alignItems: 'center' },
  closeText: { fontSize: typography.md, fontWeight: typography.bold },
})

function RankChip({ label, val, rank, rankOnly }: { label: string; val?: number; rank?: number; rankOnly?: boolean }) {
  return (
    <View style={styles.chip}>
      <Text style={styles.chipLabel}>{label}</Text>
      <Text style={styles.chipVal}>{rankOnly ? (rank ? `#${rank}` : '–') : `${val}${rank ? ` (#${rank})` : ''}`}</Text>
    </View>
  )
}

function Leader({ label, team, val, theme }: { label: string; team?: string; val?: number; theme: { accent: string } }) {
  return (
    <View style={styles.leaderRow}>
      <Text style={styles.leaderLabel}>{label}</Text>
      <Text style={styles.leaderTeam} numberOfLines={1}>{team ?? '—'} <Text style={{ color: theme.accent, fontWeight: typography.bold }}>{val ?? ''}</Text></Text>
    </View>
  )
}

function AwardCard({ title, list, theme, total, onPressPlayer }: {
  title: string; list: AwardCandidate[]; theme: { accent: string }; total: number
  onPressPlayer?: (playerId: string) => void
}) {
  return (
    <View style={styles.card}>
      <Text style={styles.cardTitle}>{title}</Text>
      {list.length === 0 ? <Text style={styles.muted}>No candidates.</Text> : (
        <ScrollView style={styles.listScroll} nestedScrollEnabled showsVerticalScrollIndicator>
          {list.map((c, i) => (
            <Pressable
              key={c.playerId}
              onPress={onPressPlayer ? () => onPressPlayer(c.playerId) : undefined}
              disabled={!onPressPlayer}
              style={[styles.row,
                c.isPlayerClub && { backgroundColor: YOUR_TINT, borderRadius: radius.sm },
                i === 0 && { backgroundColor: theme.accent + '18', borderRadius: radius.sm, borderWidth: 1, borderColor: theme.accent }]}>
              <Text style={[styles.rank, i === 0 && { color: theme.accent }]}>{i + 1}</Text>
              <View style={styles.nameCol}>
                <TeamLabel clubId={c.clubId} name={c.name} textStyle={[styles.name, (i === 0 || c.isPlayerClub) && { color: theme.accent, fontWeight: typography.bold }]} size={15} />
                <Text style={styles.club}>{c.isPlayerClub ? 'Your XI' : c.clubName} · {c.seasonLabel}{c.age != null ? ` · ${c.age}y` : ''} · {c.position}</Text>
              </View>
              <View style={{ alignItems: 'flex-end' }}>
                <Text style={[styles.statVal, { color: theme.accent }]}>{c.score}</Text>
                <Text style={styles.club}>
                  {c.goals}g {c.assists}a {c.cleanSheets}cs
                  {c.avgRating != null ? ` · ${c.avgRating.toFixed(2)}` : ''}
                  {(c.potm ?? 0) > 0 ? ` · ★${c.potm}` : ''}
                </Text>
              </View>
            </Pressable>
          ))}
        </ScrollView>
      )}
      <Text style={styles.listCount}>{list.length} eligible candidate{list.length !== 1 ? 's' : ''} of {total} players · the rest had no tournament stats</Text>
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  center:    { flex: 1, backgroundColor: colors.bg, alignItems: 'center', justifyContent: 'center', gap: spacing.sm },
  muted:     { color: colors.textMuted, fontSize: typography.sm },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: spacing.lg, paddingTop: 56, paddingBottom: spacing.md, borderBottomWidth: 1, borderBottomColor: colors.border },
  back: { width: 32, height: 32, alignItems: 'center', justifyContent: 'center' },
  backText: { color: colors.textPrimary, fontSize: typography.xl },
  headerTitle: { fontSize: typography.lg, fontWeight: typography.black },
  content: { padding: spacing.lg, gap: spacing.lg, paddingBottom: spacing.xxl },

  card: { backgroundColor: colors.bgCard, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, padding: spacing.md, gap: spacing.xs, ...shadows.sm },
  cardTitle: { fontSize: typography.md, fontWeight: typography.bold, color: colors.textPrimary, marginBottom: spacing.xs },

  search: { backgroundColor: colors.bgElevated, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, paddingHorizontal: spacing.md, paddingVertical: spacing.sm, color: colors.textPrimary, fontSize: typography.sm, marginBottom: spacing.sm },
  searchRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: spacing.sm, gap: spacing.sm, borderBottomWidth: 1, borderBottomColor: colors.border, borderRadius: radius.sm },
  rankWrap: { flexDirection: 'row', gap: 4, flexWrap: 'wrap', justifyContent: 'flex-end', maxWidth: 200 },
  chip: { backgroundColor: colors.bgElevated, borderRadius: radius.sm, paddingHorizontal: 6, paddingVertical: 3, alignItems: 'center', minWidth: 38 },
  chipLabel: { fontSize: 8, color: colors.textMuted, fontWeight: typography.bold },
  chipVal: { fontSize: 10, color: colors.textPrimary, fontWeight: typography.bold },

  tabs: { flexDirection: 'row', gap: spacing.xs, marginBottom: spacing.sm },
  tab: { flex: 1, alignItems: 'center', paddingVertical: spacing.sm, borderRadius: radius.md, backgroundColor: colors.bgElevated, borderWidth: 1, borderColor: colors.border },
  tabText: { fontSize: typography.xs, fontWeight: typography.bold, color: colors.textSecondary },
  tabTextActive: { color: colors.textPrimary },

  row: { flexDirection: 'row', alignItems: 'center', paddingVertical: spacing.sm, gap: spacing.sm, borderBottomWidth: 1, borderBottomColor: colors.border },
  rank: { width: 22, textAlign: 'center', fontSize: typography.sm, fontWeight: typography.bold, color: colors.textMuted },
  nameCol: { flex: 1 },
  name: { fontSize: typography.sm, color: colors.textPrimary },
  club: { fontSize: 10, color: colors.textMuted },
  season: { fontSize: typography.xs, color: colors.textMuted },
  statVal: { fontSize: typography.md, fontWeight: typography.black, minWidth: 30, textAlign: 'right' },
  listScroll: { maxHeight: 360 },
  listCount: { fontSize: 10, color: colors.textMuted, textAlign: 'center', paddingTop: spacing.xs },

  leaders: { gap: 4, marginBottom: spacing.sm, borderBottomWidth: 1, borderBottomColor: colors.border, paddingBottom: spacing.sm },
  leaderRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  leaderLabel: { fontSize: typography.xs, color: colors.textMuted },
  leaderTeam: { fontSize: typography.sm, color: colors.textPrimary, flexShrink: 1, textAlign: 'right' },

  teamHead: { flexDirection: 'row', alignItems: 'center', paddingBottom: spacing.xs, borderBottomWidth: 1, borderBottomColor: colors.border },
  teamName: { flex: 1 },
  teamCol: { width: 42, textAlign: 'center', fontSize: typography.sm, color: colors.textSecondary },
  yourHead: { flexDirection: 'row', alignItems: 'center', paddingBottom: spacing.xs, borderBottomWidth: 1, borderBottomColor: colors.border },
  yc: { width: 30, textAlign: 'center', fontSize: typography.sm, color: colors.textSecondary },
  ycWide: { width: 44, textAlign: 'center', fontSize: typography.sm, color: colors.textSecondary },
  tapHint: { fontSize: 10, color: colors.textMuted, textAlign: 'center', fontStyle: 'italic', paddingVertical: 2 },
  lbRatingChip: { borderRadius: radius.sm, paddingHorizontal: 6, paddingVertical: 3, minWidth: 44, alignItems: 'center' },
  lbRatingText: { fontSize: 11, fontWeight: typography.black, color: '#0A0E1A' },
  posTag: { fontSize: 10, color: colors.textMuted },
  subTag: { fontSize: 9, fontWeight: typography.black, color: colors.warning },
  rulesBtn: { alignSelf: 'center', paddingVertical: spacing.sm, paddingHorizontal: spacing.lg, borderRadius: radius.full, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.bgElevated },
  rulesBtnText: { fontSize: typography.xs, color: colors.textSecondary, fontWeight: typography.bold },
})
