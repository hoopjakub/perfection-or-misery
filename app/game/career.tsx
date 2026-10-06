import { t, num, dec } from '@/i18n'
import { useSettledOnce } from '@/lib/loading'
import { log } from '@/diag/log'
import React, { useEffect, useMemo, useState } from 'react'
import { isTournament } from '@/data/competition'
import { PageMeta } from '@/components/PageMeta'
import { View, Pressable, StyleSheet } from 'react-native'
import { router } from 'expo-router'
import { useUserStore } from '@/store/userStore'
import { fetchCareer, fetchCareerRuns } from '@/db/queries/career'
import { formatPlaytime } from '@/db/queries/profile'
import { summarise, type CareerRun } from '@/lib/careerSummary'
import { formatTier, verdictOf, runMeta, MODE_TAG } from '@/data/tiers'
import { runRoute } from '@/lib/nav'
import { ROLES, space, border, prim, colourwayFor } from '@/theme'
import { KitScreen, KitText, BackControl, Chips, SectionTag, Tag, EmptyState, InlineError, RunLabel, Tape, GhostRows } from '@/components/kit'
import type { CareerStats } from '@/types/stats'
import { EVERYDAY } from '@/lib/appearance'

// D10 · Career (docs/ui-overhaul/07d). Every player you've fielded, across
// every run: the totals, the awards they won for you, and a board per stat.
// Filters are the kit's chips; honours are tags, not emoji.
//
// P8-150 / P8-167, reworked and redesigned (the maintainer: "one of the oldest
// screens, and many of its stats don't show"). It now reads every saved run
// (src/lib/careerSummary.ts), so nothing is out of step with what you played:
// the whole career in figures; your best run; your records, each opening the
// run it came from; each mode's history with its last twelve scores; you
// against the pundits, run by run; the players you draft most. Your players'
// boards and awards cabinet stay underneath.
const roles = ROLES[EVERYDAY]

type Tab = 'goals' | 'assists' | 'cleanSheets' | 'matchesPlayed'
type Comp = 'all' | 'league' | 'champions_league' | 'champions_league_custom' | 'world_cup'

const COMP_LABEL: Record<string, string> = { league: t('career.compLeague'), champions_league: t('career.compUcl'), champions_league_custom: t('career.compUclFull'), world_cup: t('career.compWc') }
const COMPS: { id: Comp; label: string }[] = [{ id: 'all', label: t('career.compAll') }, ...(['league', 'champions_league', 'champions_league_custom', 'world_cup'] as const).map(c => ({ id: c, label: COMP_LABEL[c] }))]
const TABS: { id: Tab; label: string }[] = [{ id: 'goals', label: t('career.tabGoals') }, { id: 'assists', label: t('career.tabAssists') }, { id: 'cleanSheets', label: t('career.tabCleanSheets') }, { id: 'matchesPlayed', label: t('career.tabApps') }]

export default function CareerScreen() {
  const once = useSettledOnce()   // Phase 9: a first load arrives deliberately (src/lib/loading.ts)
  const { user, isGuest } = useUserStore()
  const [career, setCareer] = useState<CareerStats | null>(null)
  const [loading, setLoading] = useState(true)
  const [failed, setFailed] = useState(false)
  const [attempt, setAttempt] = useState(0)
  const [tab, setTab] = useState<Tab>('goals')
  const [comp, setComp] = useState<Comp>('all')
  const [runs, setRuns] = useState<CareerRun[]>([])
  const summary = useMemo(() => summarise(runs), [runs])

  useEffect(() => {
    let alive = true
    ;(async () => {
      if (!user || isGuest) { setLoading(false); return }
      try {
        const [c, rs] = await once(Promise.all([fetchCareer(user.id), fetchCareerRuns(user.id)]))
        if (alive) { setCareer(c); setRuns(rs); setFailed(false) }
      }
      catch (e) { log.warn('net', 'career: load failed', e); if (alive) setFailed(true) }
      finally { if (alive) setLoading(false) }
    })()
    return () => { alive = false }
  }, [user, isGuest, attempt])

  const shell = (children: React.ReactNode) => (
    <KitScreen ground={EVERYDAY}>
      <PageMeta title={t('career.pageTitle')} path="/game/career" />
      <BackControl roles={roles} title={t('career.heading')} />
      {children}
    </KitScreen>
  )
  if (loading) return shell(<><KitText t="bodyL" color={roles.textMuted}>{t('career.reading')}</KitText><GhostRows roles={roles} /></>)
  if (isGuest || !user) return shell(<EmptyState roles={roles} icon="lock" title={t('career.signIn')} body={t('career.guestBody')} />)
  if (failed) return shell(<InlineError roles={roles} message={t('career.failed')} onRetry={() => { setLoading(true); setAttempt(a => a + 1) }} />)
  if (runs.length === 0 && (!career || career.players.length === 0)) return shell(<EmptyState roles={roles} title={t('career.none')} body={t('career.noneBody')} />)

  const players = career?.players ?? []
  const pool = comp === 'all' ? players : players.filter(p => p.competition === comp)
  const list = pool.filter(p => p[tab] > 0).sort((a, b) => b[tab] - a[tab])
  const decorated = pool.filter(p => p.potsWins > 0 || p.u21Wins > 0).sort((a, b) => (b.potsWins + b.u21Wins) - (a.potsWins + a.u21Wins))
  const key = (p: typeof pool[number]) => `${p.playerId}|${p.seasonLabel}|${p.competition}`

  const sm = summary
  const played = sm.matches.w + sm.matches.d + sm.matches.l
  const openRun = (r: CareerRun) => router.push({ pathname: runRoute(r.mode), params: { runId: r.id } })
  const maxDiff = Math.max(1, ...sm.pundits.points.map(p => Math.abs(p.diff)))

  return shell(
    <>
      {/* The whole career in figures. */}
      <View style={styles.bigRow}>
        <Big label={t('career.runs')} value={String(sm.runs)} />
        <Big label={t('career.won')} value={String(sm.won)} />
        <Big label={t('career.perfection')} value={String(sm.perfection)} />
        {sm.seconds > 0 && <Big label={t('career.played')} value={formatPlaytime(sm.seconds)} />}
      </View>
      {played > 0 && (
        <View style={[styles.recordStrip, { borderColor: roles.rule }]}>
          <KitText t="tag" color={roles.textMuted}>{t('career.matches')}</KitText>
          <KitText t="figure" color={roles.text}>{t('career.wdl', { w: sm.matches.w, d: sm.matches.d, l: sm.matches.l })}</KitText>
          <KitText t="tag" color={roles.textMuted}>{t('career.wonGoals', { pct: Math.round((sm.matches.w / played) * 100), f: sm.goals.for, a: sm.goals.against })}</KitText>
        </View>
      )}

      {sm.best && (
        <View style={styles.section}>
          <SectionTag roles={roles}>{t('career.bestRun')}</SectionTag>
          <RunLabel roles={roles} colourway={colourwayFor(sm.best.mode)} title={formatTier(sm.best.tier ?? '')} meta={runMeta(sm.best)}
            score={num(sm.best.score)} verdict={verdictOf(sm.best.tier)} onPress={() => openRun(sm.best!)} />
        </View>
      )}

      {sm.records.length > 0 && (
        <View style={styles.section}>
          <SectionTag roles={roles}>{t('career.records')}</SectionTag>
          {sm.records.map(r => (
            <Pressable key={r.key} onPress={() => openRun(r.run)} accessibilityRole="button" accessibilityLabel={t('career.recordA11y', { label: r.label, value: r.value })}
              style={({ pressed }) => [styles.row, { borderBottomColor: roles.rule }, pressed && { backgroundColor: roles.sunken }]}>
              <View style={{ flex: 1, minWidth: 0 }}>
                <KitText t="tag" color={roles.textMuted}>{r.label.toUpperCase()}</KitText>
                <KitText t="body" color={roles.textMuted} numberOfLines={1}>{runMeta(r.run)}</KitText>
              </View>
              <KitText t="title" color={roles.text} style={styles.recordValue}>{r.value}</KitText>
            </Pressable>
          ))}
        </View>
      )}

      {sm.modes.length > 0 && (
        <View style={styles.section}>
          <SectionTag roles={roles}>{t('career.byMode')}</SectionTag>
          {sm.modes.map(m => {
            const top = Math.max(1, ...m.recent.map(x => x.score))
            const mp = m.matches.w + m.matches.d + m.matches.l
            return (
              <View key={m.mode} style={[styles.mode, { borderColor: roles.line }]}>
                <Tape colours={colourwayFor(m.mode)} roles={roles} vertical thickness={6} />
                <View style={styles.modeBody}>
                  <View style={styles.modeTop}>
                    <KitText t="title" color={roles.text} style={{ flex: 1 }}>{(MODE_TAG[m.mode] ?? m.mode).toUpperCase()}</KitText>
                    {m.bestTier ? <Tag roles={roles} variant={verdictOf(m.bestTier) === 'perfection' ? 'win' : 'data'}>{formatTier(m.bestTier).toUpperCase()}</Tag> : null}
                  </View>
                  <KitText t="tag" color={roles.textMuted}>
                    {t('career.modeLine', { count: m.runs, won: m.won, avg: m.averageScore }) + (mp ? t('career.modeMatchesWon', { pct: Math.round((m.matches.w / mp) * 100) }) : '')}
                  </KitText>
                  {/* The last twelve scores, oldest first, each bar in its verdict's colour. */}
                  <View style={styles.bars} accessibilityLabel={t('career.lastScores', { list: m.recent.map(x => x.score).join(', ') })}>
                    {m.recent.map(x => (
                      <View key={x.id} style={[styles.bar, { height: 4 + 36 * (x.score / top),
                        backgroundColor: x.verdict === 'perfection' ? prim.volt : x.verdict === 'misery' ? prim.misery : roles.textMuted, borderColor: roles.line }]} />
                    ))}
                  </View>
                </View>
              </View>
            )
          })}
        </View>
      )}

      <View style={styles.section}>
        <SectionTag roles={roles}>{t('career.vsPundits')}</SectionTag>
        {sm.pundits.points.length === 0 ? (
          <KitText t="body" color={roles.textMuted}>{t('career.punditsEmpty')}</KitText>
        ) : (
          <>
            <KitText t="body" color={roles.text}>
              {t('career.punditsBeat', { beaten: sm.pundits.beaten, count: sm.pundits.points.length, places: t((sm.pundits.average ?? 0) >= 0 ? 'career.placesBetter' : 'career.placesWorse', { count: Math.abs(sm.pundits.average ?? 0), n: dec(Math.abs(sm.pundits.average ?? 0), 1) }) })}
            </KitText>
            {/* Run by run: above the line, better than they tipped; below, worse. */}
            <View style={styles.diffChart} accessibilityLabel={t('career.diffA11y', { list: sm.pundits.points.map(p => p.diff).join(', ') })}>
              <View style={[styles.axis, { backgroundColor: roles.rule }]} />
              {sm.pundits.points.slice(-24).map(p => (
                <View key={p.id} style={styles.diffCol}>
                  <View style={styles.diffHalf}>{p.diff > 0 && <View style={[styles.diffBar, { height: 32 * (p.diff / maxDiff), backgroundColor: prim.volt, borderColor: roles.line }]} />}</View>
                  <View style={[styles.diffHalf, { justifyContent: 'flex-start' }]}>{p.diff < 0 && <View style={[styles.diffBar, { height: 32 * (-p.diff / maxDiff), backgroundColor: prim.misery, borderColor: roles.line }]} />}</View>
                </View>
              ))}
            </View>
          </>
        )}
      </View>

      {sm.drafted.length > 0 && (
        <View style={styles.section}>
          <SectionTag roles={roles}>{t('career.pickMost')}</SectionTag>
          {sm.drafted.map((d, i) => (
            <View key={`${d.name}${i}`} style={[styles.row, { borderBottomColor: roles.rule }]}>
              <KitText t="figure" color={roles.textMuted} style={styles.rank}>{String(i + 1)}</KitText>
              <View style={{ flex: 1, minWidth: 0 }}>
                <KitText t="body" color={roles.text} numberOfLines={1}>{d.name}</KitText>
                <KitText t="tag" color={roles.textMuted}>{t('career.pickLine', { pos: d.position, avg: d.averageScore })}</KitText>
              </View>
              <KitText t="figure" color={roles.text} style={styles.val}>{`×${d.times}`}</KitText>
            </View>
          ))}
        </View>
      )}

      {players.length > 0 && (
        <View style={styles.section}>
          <SectionTag roles={roles}>{t('career.yourPlayers')}</SectionTag>
          <View style={styles.bigRow}>
            <Big label={t('career.fielded')} value={String(new Set(players.map(p => p.playerId)).size)} />
            <Big label={t('career.goalsFor')} value={String(career?.goalsFor ?? 0)} />
            <Big label={t('career.goalsAgainst')} value={String(career?.goalsAgainst ?? 0)} />
          </View>
        </View>
      )}
      <Chips roles={roles} label={t('career.competition')} options={COMPS} value={comp} onChange={setComp} />

      {decorated.length > 0 && (
        <View style={styles.section}>
          <SectionTag roles={roles}>{t('career.cabinet')}</SectionTag>
          {decorated.map(p => (
            <View key={key(p)} style={[styles.row, { borderBottomColor: roles.rule }]}>
              <View style={{ flex: 1 }}>
                <KitText t="body" color={roles.text} numberOfLines={1}>{p.name}</KitText>
                <KitText t="tag" color={roles.textMuted}>{`${p.seasonLabel} · ${COMP_LABEL[p.competition] ?? p.competition}`}</KitText>
              </View>
              {p.potsWins > 0 && <Tag roles={roles} variant="win">{t(isTournament(p.competition) ? 'career.potsTournament' : 'career.potsSeason', { n: p.potsWins })}</Tag>}
              {p.u21Wins > 0 && <Tag roles={roles} variant="win">{t('career.u21', { n: p.u21Wins })}</Tag>}
            </View>
          ))}
        </View>
      )}

      <View style={styles.section}>
        <Chips roles={roles} label={t('career.board')} options={TABS} value={tab} onChange={setTab} />
        {list.length === 0 ? <KitText t="body" color={roles.textMuted}>{t('career.nothingYet')}</KitText> : list.map((p, i) => (
          <View key={key(p)} style={[styles.row, { borderBottomColor: roles.rule }]}>
            <KitText t="figure" color={roles.textMuted} style={styles.rank}>{String(i + 1)}</KitText>
            <View style={{ flex: 1 }}>
              <KitText t="body" color={roles.text} numberOfLines={1}>{p.name}</KitText>
              <KitText t="tag" color={roles.textMuted} numberOfLines={1}>{t('career.boardLine', { season: p.seasonLabel, comp: COMP_LABEL[p.competition] ?? p.competition, count: p.runs, apps: p.matchesPlayed })}</KitText>
            </View>
            <KitText t="figure" color={roles.text} style={styles.val}>{String(p[tab])}</KitText>
          </View>
        ))}
      </View>
    </>
  )
}

function Big({ label, value }: { label: string; value: string }) {
  return (
    <View style={{ flexGrow: 1, minWidth: 72 }}>
      <KitText t="figureL" color={roles.text}>{value}</KitText>
      <KitText t="tag" color={roles.textMuted}>{label}</KitText>
    </View>
  )
}

const styles = StyleSheet.create({
  title: { marginTop: space[3] },
  bigRow: { flexDirection: 'row', flexWrap: 'wrap', gap: space[3], marginVertical: space[4] },
  recordStrip: { borderTopWidth: border.hair, borderBottomWidth: border.hair, paddingVertical: space[2], gap: 2 },
  recordValue: { textAlign: 'right', maxWidth: '45%' },
  mode: { flexDirection: 'row', borderWidth: border.thin, marginBottom: space[2], overflow: 'hidden' },
  modeBody: { flex: 1, padding: space[2], gap: 4 },
  modeTop: { flexDirection: 'row', alignItems: 'center', gap: space[2] },
  bars: { flexDirection: 'row', alignItems: 'flex-end', gap: 3, height: 42, marginTop: space[1] },
  bar: { width: 12, borderWidth: 1 },
  diffChart: { flexDirection: 'row', gap: 3, height: 68, alignItems: 'stretch', marginTop: space[2] },
  axis: { position: 'absolute', left: 0, right: 0, top: 34, height: 1 },
  diffCol: { width: 10 },
  diffHalf: { flex: 1, justifyContent: 'flex-end' },
  diffBar: { width: 10, borderWidth: 1 },
  section: { gap: space[2], marginTop: space[5] },
  row: { flexDirection: 'row', alignItems: 'center', gap: space[2], minHeight: 56, borderBottomWidth: border.hair, flexWrap: 'wrap' },
  rank: { width: 28, textAlign: 'right' },
  val: { minWidth: 36, textAlign: 'right' },
})
