import { t } from '@/i18n'
import { label } from '@/i18n/labels'
import React, { useState } from 'react'
import { VersionButton } from '@/components/VersionButton'
import { View, ScrollView, Pressable, StyleSheet } from 'react-native'
import { router } from 'expo-router'
import { useGameStore } from '@/store/gameStore'
import { useSizeClass } from '@/hooks/useSizeClass'
import { getSlotsForFormation, getFormationRows, ALL_FORMATIONS, shirtNumbers } from '@/engine/formations'
import { ROLES, space, border, colourwayFor, prim, type Roles } from '@/theme'
import type { Formation } from '@/types/game'
import { KitScreen, KitText, RunHeader, Plate, Tag, StripedNotice, Pitch } from '@/components/kit'
import { EVERYDAY } from '@/lib/appearance'

// Stage 3 · Your shape — docs/ui-overhaul/07b B3. The selected shape fills the
// top as a pitch of numbered shirts; the rest sit in a rack you swipe.
// Descriptions say what the shape IS, never what it "does": the engine rates
// each player against his slot and has no tactical model, so promises like
// "dominates midfield" would be untrue. The substitutes toggle moved to the
// difficulty rules (app/game/difficulty-custom.tsx).
const roles = ROLES[EVERYDAY]

// P8.5-28: the lines are setup.shapes.* in src/i18n, keyed by the shape's digits.
const LINES = Object.fromEntries(ALL_FORMATIONS.map(f => [f, t(`setup.shapes.f${f.replace(/-/g, '')}` as 'setup.shapes.f433')])) as Record<Formation, string>

// "You'll need" — the positions this shape asks the draft for, counted.
// P8-01: which other positions each slot takes (at a small OVR cost), one
// row per distinct slot. The old shape screen listed this; the redesign lost it,
// and it's what tells you a RW can cover your LW before you spin.
function fits(formation: Formation): { label: string; accepts: string[] }[] {
  const seen = new Map<string, string[]>()
  for (const s of getSlotsForFormation(formation)) if (!seen.has(s.label)) seen.set(s.label, s.accepts)
  return [...seen.entries()].map(([label, accepts]) => ({ label, accepts }))
}

function needs(formation: Formation): string[] {
  const counts = new Map<string, number>()
  for (const s of getSlotsForFormation(formation)) counts.set(s.label, (counts.get(s.label) ?? 0) + 1)
  return [...counts.entries()].map(([pos, n]) => (n > 1 ? `${pos} ×${n}` : pos))
}

export default function YourShapeScreen() {
  const { mode, startRun, lastFormation } = useGameStore()
  const [selected, setSelected] = useState<Formation>(lastFormation ?? '4-3-3')
  const wide = useSizeClass() === 'expanded'

  function draft() {
    if (!mode) return
    startRun(mode, selected)
    router.push('/game/draft')
  }

  const rackItems = ALL_FORMATIONS.map(f => (
    <Pressable
      key={f}
      onPress={() => setSelected(f)}
      accessibilityRole="radio"
      accessibilityState={{ selected: f === selected }}
      accessibilityLabel={`${f}. ${LINES[f]}`}
      style={({ pressed }) => [
        styles.rackItem,
        { borderColor: f === selected ? roles.line : roles.rule, borderWidth: f === selected ? border.plate : border.thin },
        pressed && { backgroundColor: roles.sunken },
      ]}
    >
      <MiniShape roles={roles} formation={f} />
      <KitText t="tag" color={roles.text}>{f}</KitText>
      {f === selected && <View style={styles.rackTape} />}
    </Pressable>
  ))

  const details = (
    <>
      <View style={styles.titleRow}>
        <KitText t="superM" color={roles.text}>{selected}</KitText>
        {selected === lastFormation && <Tag roles={roles}>{t('run.lastTime')}</Tag>}
      </View>
      <KitText t="bodyL" color={roles.textMuted}>{LINES[selected]}</KitText>
      <View style={styles.needs} accessible accessibilityLabel={t('setup.youNeedA11y', { list: needs(selected).join(', ') })}>
        <KitText t="tag" color={roles.textMuted}>{t('setup.youNeed')}</KitText>
        {needs(selected).map(n => <Tag key={n} roles={roles}>{n}</Tag>)}
      </View>
      <View style={styles.fits}>
        <KitText t="tag" color={roles.textMuted}>{t('setup.whoElseFits')}</KitText>
        {fits(selected).filter(f => f.accepts.length > 0).map(f => (
          <View key={f.label} style={[styles.fitRow, { borderBottomColor: roles.rule }]}>
            <KitText t="tag" color={roles.text} style={styles.fitSlot}>{f.label}</KitText>
            <KitText t="body" color={roles.textMuted} style={{ flex: 1 }}>{f.accepts.map(label).join(' · ')}</KitText>
          </View>
        ))}
      </View>
      {mode === 'cursed' && (
        <StripedNotice roles={roles}>{t('setup.cursedShape')}</StripedNotice>
      )}
    </>
  )

  // Expanded (10-ADAPT §2.2): the pitch on the left, the shape's details,
  // every shape as a wrapped rack (no sideways swiping with a mouse) and the
  // plate on the right. Compact is the phone column.
  if (wide) {
    return (
      <KitScreen ground={EVERYDAY} width="wide">
        <RunHeader roles={roles} stage={3} colourway={colourwayFor(mode)} title={t('setup.yourShape')} />
        <View style={styles.wide}>
          <View style={styles.widePitch}><PitchShape roles={roles} formation={selected} tall /></View>
          <View style={styles.wideSide}>
            {details}
            <View style={styles.rackWrap}>{rackItems}</View>
            <Plate label={t('setup.draftA', { shape: selected })} icon="forward" roles={roles} onPress={draft} style={styles.plate} />
            <VersionButton roles={roles} style={{ marginTop: space[4] }} />
          </View>
        </View>
      </KitScreen>
    )
  }

  return (
    <KitScreen ground={EVERYDAY}>
      <RunHeader roles={roles} stage={3} colourway={colourwayFor(mode)} title={t('setup.yourShape')} />
      <PitchShape roles={roles} formation={selected} />
      {details}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.rack} contentContainerStyle={styles.rackContent}>
        {rackItems}
      </ScrollView>
      <Plate label={t('setup.draftA', { shape: selected })} icon="forward" roles={roles} onPress={draft} style={styles.plate} />
      {/* P8-73: the version on every menu before a run starts. */}
      <VersionButton roles={roles} style={{ marginTop: space[4] }} />
    </KitScreen>
  )
}

// The selected shape: a row per line, a numbered shirt per position, attack at
// the top. Shirt numbers follow the slot order (GK is 1).
// `tall`: in the wide layout the pitch keeps a pitch's proportions (taller
// than wide) instead of stretching into a squat band across its pane.
function PitchShape({ roles, formation, tall }: { roles: Roles; formation: Formation; tall?: boolean }) {
  const slots = getSlotsForFormation(formation)
  const remaining = [...slots]
  // P8-124: each shirt's number is its position's (9 up front, 1 in goal).
  const numbers = shirtNumbers(getSlotsForFormation(formation))
  const rows = getFormationRows(formation).map(row => row.map(label => {
    const i = remaining.findIndex(s => s.label === label)
    return i >= 0 ? remaining.splice(i, 1)[0] : null
  }))
  return (
    // P8-04: a real pitch, floodlit green with its markings, the shirts laid out
    // by the same rows the draft pitch uses, so the shape doesn't move between
    // the two screens.
    <Pitch tall={tall} accessibilityLabel={t('setup.onThePitch', { shape: formation })}
      rows={rows.map(row => row.flatMap((slot, i) => slot ? [(
        <View key={i} style={styles.shirt}>
          <View style={[styles.shirtBody, { borderColor: roles.line, backgroundColor: roles.surface }]}>
            <KitText t="title" color={roles.text}>{String(numbers.get(slot.slotIndex) ?? slot.slotIndex + 1)}</KitText>
          </View>
          <KitText t="tag" color={prim.cotton}>{slot.label}</KitText>
        </View>
      )] : []))} />
  )
}

function MiniShape({ roles, formation }: { roles: Roles; formation: Formation }) {
  return (
    <View style={styles.mini}>
      {getFormationRows(formation).map((row, r) => (
        <View key={r} style={styles.miniRow}>
          {row.map((_, i) => <View key={i} style={[styles.miniDot, { backgroundColor: roles.line }]} />)}
        </View>
      ))}
    </View>
  )
}

const styles = StyleSheet.create({
  pitch: { paddingVertical: space[5] },
  pitchRows: { gap: space[4], flexGrow: 1, justifyContent: 'space-around' },
  pitchRow: { flexDirection: 'row', justifyContent: 'space-evenly' },
  pitchTall: { aspectRatio: 0.78, justifyContent: 'space-around', maxHeight: 640 },
  shirt: { alignItems: 'center', gap: 2, minWidth: 44 },
  shirtBody: { width: 38, height: 34, borderWidth: border.thin, alignItems: 'center', justifyContent: 'center' },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: space[3], marginTop: space[4] },
  fits: { gap: 2, marginBottom: space[3] },
  fitRow: { flexDirection: 'row', alignItems: 'center', gap: space[2], minHeight: 32, borderBottomWidth: border.hair },
  fitSlot: { width: 44 },
  needs: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: space[2], marginTop: space[3], marginBottom: space[3] },
  rack: { marginTop: space[4], marginHorizontal: -space[4] },
  rackContent: { paddingHorizontal: space[4], gap: space[2] },
  rackItem: { width: 96, paddingVertical: space[2], alignItems: 'center', gap: space[2] },
  rackTape: { position: 'absolute', left: 0, right: 0, bottom: 0, height: border.tape, backgroundColor: prim.orange },
  mini: { gap: 5, alignItems: 'center', height: 56, justifyContent: 'center' },
  miniRow: { flexDirection: 'row', gap: 5 },
  miniDot: { width: 7, height: 7 },
  plate: { marginTop: space[5] },
  wide: { flexDirection: 'row', gap: space[6], alignItems: 'flex-start' },
  widePitch: { flex: 1, minWidth: 0 },
  wideSide: { flex: 1, minWidth: 0 },
  rackWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: space[2], marginTop: space[4] },
})
