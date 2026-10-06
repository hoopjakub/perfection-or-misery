// Phase 9, Diagnostics step 4 (docs/diagnostics/05-SCREEN-AND-REPORT.md §2.3):
// the whole log, newest first. Filter by level and category, search the text,
// tap a line to see what came with it. A FlatList, so 1,000 lines cost nothing
// until they scroll in. Share sends exactly what's shown, the slice the
// maintainer asks for (the last run, only the perf lines, only errors), with
// no length limit, oldest first.
import { t } from '@/i18n'
import React, { useMemo, useState } from 'react'
import { View, StyleSheet, FlatList, Pressable, Platform, Share } from 'react-native'
import { KitScreen, KitText, BackControl, Plate, Chips, Field } from '@/components/kit'
import { PageMeta } from '@/components/PageMeta'
import { ROLES, space, border } from '@/theme'
import { EVERYDAY } from '@/lib/appearance'
import { logEntries, type Entry, type Level } from '@/diag/log'
import { entryLine, buildFullLog } from '@/diag/report'

const roles = ROLES[EVERYDAY]
type LevelFilter = 'all' | Level

function LogRow({ e }: { e: Entry }) {
  const [open, setOpen] = useState(false)
  const time = new Date(e.t).toTimeString().slice(0, 8)
  return (
    <Pressable onPress={() => setOpen(o => !o)} accessibilityRole="button" accessibilityState={{ expanded: open }}
      style={({ pressed }) => [styles.row, { borderBottomColor: roles.rule }, pressed && { backgroundColor: roles.sunken }, e.prev && { opacity: 0.7 }]}>
      <KitText t="tag" color={roles.textMuted}>{`${time}${e.prev ? ' · last session' : ''}`}</KitText>
      <KitText t="tag" color={e.level === 'error' ? roles.lossText : roles.text} numberOfLines={open ? undefined : 2} selectable>
        {entryLine(e, open)}
      </KitText>
    </Pressable>
  )
}

export default function DiagnosticsLog() {
  const [level, setLevel] = useState<LevelFilter>('all')
  const [cat, setCat] = useState('all')
  const [query, setQuery] = useState('')
  const [lastRun, setLastRun] = useState(false)
  const [note, setNote] = useState<string | null>(null)
  const all = useMemo(() => [...logEntries()].reverse(), [])
  const cats = useMemo(() => ['all', ...new Set(all.map(e => e.cat))], [all])
  // The most recent run in the log, finished or not.
  const runTag = useMemo(() => all.find(e => e.run)?.run, [all])
  const shown = all.filter(e => (level === 'all' || e.level === level) && (cat === 'all' || e.cat === cat)
    && (!lastRun || e.run === runTag)
    && (!query || entryLine(e).toLowerCase().includes(query.toLowerCase())))

  async function shareAll() {
    const text = buildFullLog([...shown].reverse())
    try {
      if (Platform.OS === 'web') { await navigator.clipboard.writeText(text); setNote(t('diag.copied')) }
      else { const r = await Share.share({ message: text }); setNote(r.action === Share.dismissedAction ? t('diag.shareCancelled') : t('diag.shared')) }
    } catch { setNote(Platform.OS === 'web' ? t('diag.copyFailed') : t('diag.shareCancelled')) }
    setTimeout(() => setNote(null), 1600)
  }

  return (
    <KitScreen ground={EVERYDAY} scroll={false}>
      <PageMeta title={t('diag.logPageTitle')} path="/diagnostics/log" />
      <BackControl roles={roles} title={t('diag.logTitle')} />
      <View style={styles.controls}>
        <Plate label={note ?? (Platform.OS === 'web' ? t('diag.copyShown', { count: shown.length }) : t('diag.shareShown', { count: shown.length }))} roles={roles} variant="secondary" onPress={shareAll} />
        <Chips<LevelFilter> roles={roles} value={level} onChange={setLevel}
          options={[{ id: 'all', label: t('diag.levelAll') }, { id: 'error', label: 'error' }, { id: 'warn', label: 'warn' }, { id: 'info', label: 'info' }, { id: 'debug', label: 'debug' }]} />
        <Chips<string> roles={roles} value={cat} onChange={setCat} options={cats.map(c => ({ id: c, label: c === 'all' ? t('diag.levelAll') : c }))} />
        {runTag ? <Chips<'all' | 'run'> roles={roles} value={lastRun ? 'run' : 'all'} onChange={v => setLastRun(v === 'run')}
          options={[{ id: 'all', label: t('diag.levelAll') }, { id: 'run', label: t('diag.lastRunOnly') }]} /> : null}
        <Field label={t('diag.search')} roles={roles} value={query} onChangeText={setQuery} autoCapitalize="none" autoCorrect={false} />
      </View>
      <FlatList
        data={shown}
        keyExtractor={(e, i) => `${e.t}-${i}`}
        renderItem={({ item }) => <LogRow e={item} />}
        ListEmptyComponent={<KitText t="body" color={roles.textMuted}>{t('diag.logEmpty')}</KitText>}
        initialNumToRender={30}
        contentContainerStyle={{ paddingBottom: space[6] }}
      />
    </KitScreen>
  )
}

const styles = StyleSheet.create({
  controls: { gap: space[2], marginBottom: space[3] },
  row: { gap: 2, paddingVertical: space[2], borderBottomWidth: border.hair },
})
