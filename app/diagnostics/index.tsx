// Phase 9, Diagnostics step 4 (docs/diagnostics/05-SCREEN-AND-REPORT.md): every
// number this device has measured, the self-test, and a report short enough
// for one chat message.
//
// A reading screen, so it stands on the everyday ground (cotton by day). No
// orange except the one primary action: orange means you, and nothing here is
// about the player. Every status carries its word, never colour alone. It only
// reads: no run, score or career row is ever written from here.
//
// Numbers are read when the screen opens and on Refresh, not kept live: the
// recorder is cheap because nothing formats it until someone looks.
import { t } from '@/i18n'
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { View, StyleSheet, Pressable, Platform, Share, AccessibilityInfo, Text, type ScrollView } from 'react-native'
import { router } from 'expo-router'
import { KitScreen, KitText, BackControl, SectionTag, Plate, Tag, StripedNotice, ListRow, Panes, Icon } from '@/components/kit'
import { PageMeta } from '@/components/PageMeta'
import { WebKeys } from '@/lib/webKeys'
import { ROLES, space, border, font } from '@/theme'
import { EVERYDAY } from '@/lib/appearance'
import { readEnv, type Env } from '@/diag/env'
import { budgetRows, buildReport, unbudgetedKeys, summarise, entryLine, type BudgetRow, type Status } from '@/diag/report'
import { reading } from '@/diag/perf'
import { logEntries, saveLedger, enableDebugLog, type Entry } from '@/diag/log'
import { stallSummary } from '@/diag/watch'
import { useGameStore } from '@/store/gameStore'
import { useRunQueue, refusedRuns, retryRefused, type RefusedRun } from '@/lib/runQueue'
import { flushSavedRuns } from '@/db/queries/runs'
import { DEV_TOOLS } from './tools'
import { runShape, sessionKind, storageShape, type StorageShape } from '@/diag/shape'
import type { StepResult, StepKey } from '@/diag/checks'

const roles = ROLES[EVERYDAY]

// Self-test results stay until the app restarts (04 §1), whichever screen ran them.
let lastChecks: StepResult[] = []
let lastChecksAt = 0

const GROUPS: [string, (k: string) => boolean][] = [
  [t('diag.groupBoot'), k => /^(db|boot|ui|query):/.test(k)],
  [t('diag.groupSetup'), k => /^(draft|placement):/.test(k)],
  [t('diag.groupSim'), k => k.startsWith('sim:')],
  [t('diag.groupDetail'), k => /^(detail|deep|stats):/.test(k)],
  [t('diag.groupFrames'), k => k.startsWith('frame:')],
  [t('diag.groupSystem'), k => /^(stall|mem):/.test(k)],
  [t('diag.groupSave'), k => /^(save|net):/.test(k)],
]
const STEP_NAME: Record<StepKey, string> = {
  bench: t('diag.stepBench'), fingerprint: t('diag.stepFingerprint'), invariants: t('diag.stepInvariants'),
  data: t('diag.stepData'), backend: t('diag.stepBackend'), limits: t('diag.stepLimits'),
}

const fig = (v: number, unit = 'ms') => `${v >= 100 ? Math.round(v).toLocaleString('en') : v.toFixed(1)}${unit === 'ms' ? '' : ` ${unit}`}`

/** A status as a tag: OK quiet, WARN ink, FAIL misery red, NO DATA dashed and faded, n/a only its reason. */
function StatusTag({ status, reason }: { status: Status; reason?: string }) {
  if (status === 'n/a') return <KitText t="tag" color={roles.textMuted}>{`n/a${reason ? ` · ${reason}` : ''}`}</KitText>
  const variant = status === 'FAIL' ? 'loss' : status === 'WARN' ? 'selected' : 'data'
  return <View style={status === 'NO DATA' && styles.noData}><Tag roles={roles} variant={variant}>{status}</Tag></View>
}

function BudgetLine({ r }: { r: BudgetRow }) {
  const label = t('diag.rowA11y', { key: r.key, p95: fig(r.p95), target: r.target, status: r.status })
  return (
    <View style={[styles.row, { borderBottomColor: roles.rule }, r.status === 'NO DATA' && styles.faded]} accessible accessibilityLabel={label}>
      <View style={styles.rowHead}>
        <KitText t="tag" color={roles.text} style={{ flex: 1 }}>{r.key}</KitText>
        <StatusTag status={r.status} reason={r.reason} />
      </View>
      <KitText t="body" color={roles.textMuted}>{r.network ? `${r.label} · ${t('diag.network')}` : r.label}</KitText>
      {r.count > 0 && (
        <KitText t="tag" color={roles.text}>
          {t('diag.figures', { p50: fig(r.p50, r.unit), p95: fig(r.p95, r.unit), target: r.target, n: r.count > r.n ? `${r.n}/${r.count}` : r.n })}
        </KitText>
      )}
    </View>
  )
}

/** A group opens on its own when something inside is WARN or FAIL, so the screen opens on the problems. */
function BudgetGroup({ name, rows }: { name: string; rows: BudgetRow[] }) {
  const worst = rows.find(r => r.status === 'FAIL') ?? rows.find(r => r.status === 'WARN')
  const [open, setOpen] = useState(!!worst)
  if (!rows.length) return null
  const head = worst?.status ?? (rows.every(r => r.status === 'NO DATA' || r.status === 'n/a') ? 'NO DATA' : 'OK')
  return (
    <View>
      <Pressable onPress={() => setOpen(o => !o)} accessibilityRole="button" accessibilityState={{ expanded: open }}
        style={({ pressed }) => [styles.groupHead, { borderBottomColor: roles.rule }, pressed && { backgroundColor: roles.sunken }]}>
        <View style={{ transform: [{ rotate: open ? '90deg' : '0deg' }] }}><Icon name="chevron" size={16} color={roles.textMuted} /></View>
        <KitText t="body" color={roles.text} style={{ flex: 1 }}>{name}</KitText>
        <StatusTag status={head} />
      </Pressable>
      {open && rows.map(r => <BudgetLine key={r.key} r={r} />)}
    </View>
  )
}

function Section({ title, right, children }: { title: string; right?: React.ReactNode; children: React.ReactNode }) {
  return (
    <View style={[styles.section, { borderTopColor: roles.rule }]}>
      <View style={styles.sectionHead}><SectionTag roles={roles}>{title}</SectionTag>{right}</View>
      {children}
    </View>
  )
}
const Line = ({ children, muted }: { children: string; muted?: boolean }) => <KitText t="tag" color={muted ? roles.textMuted : roles.text}>{children}</KitText>

export default function DiagnosticsScreen() {
  const [tick, setTick] = useState(0)                  // Refresh: read everything again
  const [env, setEnv] = useState<Env | null>(null)
  const [storage, setStorage] = useState<StorageShape | null>(null)
  const [checks, setChecks] = useState<StepResult[]>(lastChecks)
  const [testing, setTesting] = useState(false)
  const [cancelled, setCancelled] = useState(false)
  const [shareNote, setShareNote] = useState<string | null>(null)
  const stop = useRef(false)
  const quickSim = useGameStore(s => s.quickSim)
  const waitingRuns = useRunQueue(s => s.count)
  const refusedCount = useRunQueue(s => s.refused)
  const [refused, setRefused] = useState<RefusedRun[]>([])
  useEffect(() => { refusedRuns().then(setRefused).catch(() => setRefused([])) }, [tick, refusedCount])   // a tester run in memory gets its tag
  const scroll = useRef<ScrollView>(null)
  const reportY = useRef(0)

  // Opening Diagnostics turns on the debug lines for the rest of the session.
  useEffect(() => { enableDebugLog() }, [])
  useEffect(() => {
    readEnv().then(setEnv)
    storageShape().then(setStorage).catch(() => setStorage(null))
  }, [tick])

  const rows = useMemo(() => budgetRows(Platform.OS), [tick, checks])
  const entries = useMemo(() => [...logEntries()], [tick])
  const problems = entries.filter(e => !e.prev && (e.level === 'warn' || e.level === 'error'))
  const previous = entries.filter(e => e.prev)
  const stalls = stallSummary()
  const shape = useMemo(() => runShape(), [tick])
  const unbudgeted = unbudgetedKeys().map(k => ({ key: k, p95: reading(k).p95 }))
  const sampled = rows.some(r => r.count > 0)
  const worst = rows.find(r => r.status === 'FAIL' || r.status === 'WARN')

  const report = useMemo(() => env ? buildReport({
    env, session: sessionKind(),
    runLine: shape ? `${shape.mode} ${shape.difficulty ?? ''} ${shape.formation ?? ''} · ${shape.matches} matches` : undefined,
    rows, unbudgeted, stalls,
    checks: checks.length ? { at: lastChecksAt, line: checks.filter(c => c.step !== 'bench').map(c => `${c.step} ${c.line}`).join(' · ') } : undefined,
    bench: checks.find(c => c.step === 'bench')?.line,
    run: shape ? `${shape.seeded}/${shape.matches} seeded · ${shape.fallbackSeeds} fallback · scorers ${shape.scorersNamed} · save ${saveLedger.run} · schema retries ${saveLedger.schemaRetries}` : undefined,
    data: checks.find(c => c.step === 'data')?.line,
    problems, lastSession: previous,
  }) : '', [env, rows, checks, tick])

  const runTest = useCallback(async () => {
    if (testing) { stop.current = true; return }
    stop.current = false
    setTesting(true); setChecks([]); setCancelled(false)
    // Loaded on first use: the self-test brings the golden fingerprint (78 KB).
    const { runSelfTest } = await import('@/diag/checks')
    const done = await runSelfTest(r => setChecks(c => [...c, r]), () => stop.current)
    lastChecks = done; lastChecksAt = Date.now()
    setCancelled(stop.current)   // what finished keeps its result; the rest say cancelled
    setTesting(false); setTick(n => n + 1)
  }, [testing])

  // Share (02 §6): the share sheet on the phone, the clipboard on the web, and
  // the selectable report below always, so nothing depends on either working.
  const say = (note: string) => {
    setShareNote(note)
    AccessibilityInfo.announceForAccessibility(note)
    setTimeout(() => setShareNote(null), 1600)
  }
  const share = useCallback(async () => {
    if (Platform.OS === 'web') {
      try { await navigator.clipboard.writeText(report); say(t('diag.copied')) }
      catch { say(t('diag.copyFailed')); scroll.current?.scrollTo({ y: reportY.current, animated: true }) }
      return
    }
    try {
      const r = await Share.share({ message: report })
      say(r.action === Share.dismissedAction ? t('diag.shareCancelled') : t('diag.shared'))
    } catch { say(t('diag.shareCancelled')) }
  }, [report])

  const shareLabel = shareNote ?? (Platform.OS === 'web' ? t('diag.copy') : t('diag.share'))
  const noData = rows.filter(r => r.status === 'NO DATA').length

  const left = (
    <>
      {__DEV__ && <StripedNotice roles={roles}>{t('diag.devNotice')}</StripedNotice>}
      <View style={styles.actions}>
        <Plate label={shareLabel} roles={roles} onPress={share} style={styles.action} />
        <Plate label={testing ? t('diag.cancel') : t('diag.selfTest')} roles={roles} variant="secondary" onPress={runTest} style={styles.action} />
        <Plate label={t('diag.refresh')} roles={roles} variant="quiet" icon="retry" onPress={() => setTick(n => n + 1)} />
      </View>

      <Section title={t('diag.summary')}>
        {sampled ? <Line>{summarise(rows)}</Line> : <KitText t="body" color={roles.textMuted}>{t('diag.noSamples')}</KitText>}
        {worst && <Line>{t('diag.worst', { key: worst.key, value: `${fig(worst.p95, worst.unit)} / ${worst.target}` })}</Line>}
      </Section>

      {env && (
        <Section title={t('diag.environment')}>
          <Line>{`app ${env.app} · ${env.build} · engine ${env.engine} · db ${env.db}`}</Line>
          <Line>{`${env.platform} · ${env.jsEngine} · ${env.device}${env.hardware ? ` · ${env.hardware}` : ''}`}</Line>
          <Line>{`${env.window} · font ${env.fontScale} · motion ${env.reduceMotion ? 'reduced' : 'on'} · ${env.scheme}`}</Line>
          <Line muted>{`${t('diag.session', { kind: sessionKind() })} · ${env.sessionMin} min`}</Line>
        </Section>
      )}

      <Section title={t('diag.checks')} right={lastChecksAt && !testing ? <Line muted>{t('diag.lastRun', { time: new Date(lastChecksAt).toTimeString().slice(0, 5) })}</Line> : undefined}>
        {!checks.length && !testing && <KitText t="body" color={roles.textMuted}>{t('diag.notRun')}</KitText>}
        {checks.map(c => (
          <View key={c.step} style={[styles.row, { borderBottomColor: roles.rule }]}>
            <View style={styles.rowHead}>
              <KitText t="body" color={roles.text} style={{ flex: 1 }}>{STEP_NAME[c.step]}</KitText>
              <StatusTag status={c.verdict} />
            </View>
            <KitText t="tag" color={roles.textMuted} selectable>{c.line}</KitText>
            {/* The limit test's every budget, with its number against the target. */}
            {c.step === 'limits' && c.rows?.map(r => (
              <View key={r.label} style={styles.rowHead}>
                <KitText t="tag" color={roles.textMuted} style={{ flex: 1 }} selectable>{`${r.label} · ${r.value}`}</KitText>
                {r.verdict ? <StatusTag status={r.verdict} /> : null}
              </View>
            ))}
          </View>
        ))}
        {testing && <KitText t="body" color={roles.textMuted}>{t('diag.running')}</KitText>}
        {cancelled && <KitText t="body" color={roles.textMuted}>{t('diag.cancelled')}</KitText>}
      </Section>

      <Section title={t('diag.thisRun')} right={shape?.testerWarning || quickSim ? <Tag roles={roles}>{t('diag.tester')}</Tag> : undefined}>
        {shape ? (
          <>
            <Line>{`${shape.mode} · ${shape.difficulty ?? '—'} · ${shape.formation ?? '—'} · ${shape.squad} · rerolls ${shape.rerollsUsed}`}</Line>
            <Line>{t('diag.runFigures', { matches: shape.matches, seeded: shape.seeded, fallback: shape.fallbackSeeds, scorers: shape.scorersNamed, kb: shape.resultKB })}</Line>
            <Line>{t('diag.saveLine', { run: saveLedger.run, career: saveLedger.career, retries: saveLedger.schemaRetries })}</Line>
          </>
        ) : <KitText t="body" color={roles.textMuted}>{t('diag.noRun')}</KitText>}
        <KitText t="body" color={roles.textMuted}>{t('diag.reload')}</KitText>
      </Section>

      {/* 02 §7.1: the tester, in developer builds only; a public build has no row. */}
      {DEV_TOOLS && (
        <Section title={t('diag.tools')}>
          <ListRow roles={roles} label={t('about.tester')} icon="play" onPress={() => router.push('/diagnostics/tools')} />
        </Section>
      )}

      {/* P9.75-06: what's waiting to go up, and what the server refused, with its reason. */}
      <Section title={t('diag.saves')}>
        <Line>{waitingRuns > 0 ? t('diag.waitingRuns', { count: waitingRuns }) : t('diag.noneWaiting')}</Line>
        {refused.map(r => (
          <KitText key={r.clientId} t="tag" color={roles.lossText} selectable>{t('diag.refusedLine', { date: r.refusedAt.slice(0, 16).replace('T', ' '), why: r.why })}</KitText>
        ))}
        {refused.length > 0 && <Plate label={t('diag.tryAgain')} roles={roles} variant="secondary" onPress={async () => { await retryRefused(); setTick(n => n + 1) }} />}
        {waitingRuns > 0 && <Plate label={t('diag.refresh')} roles={roles} variant="quiet" icon="retry" onPress={async () => { await flushSavedRuns('Diagnostics'); setTick(n => n + 1) }} />}
      </Section>

      {storage && (
        <Section title={t('diag.storage')}>
          <Line>{t('diag.storageLine', { keys: storage.keys, kb: storage.kb, kind: storage.settings })}</Line>
          <Line muted>{storage.names.join(' · ')}</Line>
        </Section>
      )}
    </>
  )

  const right = (
    <>
      <Section title={t('diag.budgets')} right={noData ? <Line muted>{t('diag.noData', { count: noData })}</Line> : undefined}>
        {GROUPS.map(([name, has]) => <BudgetGroup key={`${name}${tick}`} name={name} rows={rows.filter(r => has(r.key))} />)}
      </Section>

      <Section title={t('diag.stalls')}>
        {stalls.worst
          ? <Line>{`${t('diag.stallsLine', { count: stalls.count, ms: stalls.worst.ms, route: stalls.worst.route })}${stalls.worst.during ? ` ${t('diag.stallsDuring', { key: stalls.worst.during })}` : ''}`}</Line>
          : <KitText t="body" color={roles.textMuted}>{t('diag.stallsNone')}</KitText>}
      </Section>

      <Section title={t('diag.problems')}>
        {problems.length ? problems.slice(-5).reverse().map((e, i) => <ProblemLine key={i} e={e} />) : <KitText t="body" color={roles.textMuted}>{t('diag.noProblems')}</KitText>}
        {previous.length > 0 && <SectionTag roles={roles}>{t('diag.lastSession')}</SectionTag>}
        {previous.slice(-3).reverse().map((e, i) => <ProblemLine key={`p${i}`} e={e} />)}
        <ListRow roles={roles} label={t('diag.viewLog')} icon="runs" onPress={() => router.push('/diagnostics/log')} />
      </Section>

      {unbudgeted.length > 0 && (
        <Section title={t('diag.noBudget')}>
          <KitText t="body" color={roles.textMuted}>{t('diag.noBudgetNote')}</KitText>
          {unbudgeted.map(u => <Line key={u.key}>{`${u.key} · p95 ${fig(u.p95)}`}</Line>)}
        </Section>
      )}

      <View onLayout={e => { reportY.current = e.nativeEvent.layout.y }}>
        <Section title={t('diag.report')}>
          <View style={[styles.report, { backgroundColor: roles.sunken, borderColor: roles.rule }]}>
            {/* Selectable, so a report can always be copied by hand. */}
            <Text selectable accessibilityRole="text" style={[styles.reportText, { color: roles.text }]}>{report}</Text>
          </View>
        </Section>
      </View>
    </>
  )

  return (
    <KitScreen ground={EVERYDAY} width="wide" scrollRef={scroll}>
      <PageMeta title={t('diag.pageTitle')} path="/diagnostics" />
      <WebKeys onKey={k => { const key = k.toLowerCase(); if (key === 's') runTest(); else if (key === 'c') share(); else if (key === 'r') setTick(n => n + 1); else if (key === 'l') router.push('/diagnostics/log') }} />
      <BackControl roles={roles} title={t('diag.title')} />
      <KitText t="bodyL" color={roles.textMuted} style={{ marginBottom: space[3] }}>{t('diag.subtitle')}</KitText>
      <Panes side="left" asideWidth={420} aside={<View>{left}</View>} main={<View>{right}</View>} />
    </KitScreen>
  )
}

function ProblemLine({ e }: { e: Entry }) {
  return <KitText t="tag" color={e.level === 'error' ? roles.lossText : roles.text} numberOfLines={3} selectable>{entryLine(e)}</KitText>
}

const styles = StyleSheet.create({
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: space[2], marginBottom: space[3] },
  action: { flexGrow: 1, minWidth: 150 },
  section: { gap: space[2], paddingVertical: space[4], borderTopWidth: border.hair },
  sectionHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: space[2] },
  row: { gap: 2, paddingVertical: space[2], borderBottomWidth: border.hair },
  rowHead: { flexDirection: 'row', alignItems: 'center', gap: space[2] },
  groupHead: { flexDirection: 'row', alignItems: 'center', gap: space[2], minHeight: 44, borderBottomWidth: border.hair },
  noData: { opacity: 0.55, borderStyle: 'dashed' },
  faded: { opacity: 0.55 },
  report: { borderWidth: border.hair, padding: space[3] },
  reportText: { fontFamily: font.tag, fontSize: 11, lineHeight: 16 },
})
