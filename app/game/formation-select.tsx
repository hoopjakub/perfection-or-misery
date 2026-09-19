import React, { useState } from 'react'
import { View, ScrollView, Pressable, StyleSheet } from 'react-native'
import { router } from 'expo-router'
import { useGameStore } from '@/store/gameStore'
import { getSlotsForFormation, getFormationRows, ALL_FORMATIONS } from '@/engine/formations'
import { ROLES, space, border, colourwayFor, prim, type Roles } from '@/theme'
import type { Formation } from '@/types/game'
import { KitScreen, KitText, RunHeader, Plate, Tag, StripedNotice } from '@/components/kit'

// Stage 3 · Your shape — docs/ui-overhaul/07b B3. The selected shape fills the
// top as a pitch of numbered shirts; the rest sit in a rack you swipe.
// Descriptions say what the shape IS, never what it "does": the engine rates
// each player against his slot and has no tactical model, so promises like
// "dominates midfield" would be untrue. The substitutes toggle moved to the
// difficulty rules (app/game/difficulty-custom.tsx).
const roles = ROLES.cotton

const LINES: Record<Formation, string> = {
  '4-3-3':     'Three up front, three in midfield, a back four.',
  '4-4-2':     'Two strikers and a flat midfield four.',
  '4-2-3-1':   'Two holding mids, three attacking mids and a lone striker.',
  '3-5-2':     'Three at the back, wing-backs, five across midfield and two strikers.',
  '5-3-2':     'Five at the back, three in midfield, two strikers.',
  '3-4-3':     'A back three, wing-backs and a front three.',
  '4-1-4-1':   'One holding mid, a banked four and one striker.',
  '4-3-1-2':   'A flat three, a playmaker and two strikers. Narrow.',
  '4-1-2-1-2': 'The narrow diamond: a holding mid, two runners and a ten behind two strikers.',
  '5-4-1':     'Five at the back, a flat four ahead and one striker.',
  '3-4-2-1':   'A back three, wing-backs and two tens behind one striker.',
  '3-4-1-2':   'A back three, wing-backs, one ten and two strikers.',
}

// "You'll need" — the positions this shape asks the draft for, counted.
function needs(formation: Formation): string[] {
  const counts = new Map<string, number>()
  for (const s of getSlotsForFormation(formation)) counts.set(s.label, (counts.get(s.label) ?? 0) + 1)
  return [...counts.entries()].map(([pos, n]) => (n > 1 ? `${pos} ×${n}` : pos))
}

export default function YourShapeScreen() {
  const { mode, startRun, lastFormation } = useGameStore()
  const [selected, setSelected] = useState<Formation>(lastFormation ?? '4-3-3')
  const fixedMode = mode === 'chaos' || mode === 'cursed'

  function draft() {
    if (!mode) return
    startRun(mode, selected)
    router.push('/game/draft')
  }

  return (
    <KitScreen ground="cotton">
      <RunHeader roles={roles} stage={3} colourway={colourwayFor(mode)} title="Your shape" skipped={fixedMode ? [2] : []} />

      <PitchShape roles={roles} formation={selected} />

      <View style={styles.titleRow}>
        <KitText t="superM" color={roles.text}>{selected}</KitText>
        {selected === lastFormation && <Tag roles={roles}>LAST TIME</Tag>}
      </View>
      <KitText t="bodyL" color={roles.textMuted}>{LINES[selected]}</KitText>
      <View style={styles.needs} accessible accessibilityLabel={`You'll need ${needs(selected).join(', ')}`}>
        <KitText t="tag" color={roles.textMuted}>YOU'LL NEED</KitText>
        {needs(selected).map(n => <Tag key={n} roles={roles}>{n}</Tag>)}
      </View>

      {mode === 'cursed' && (
        <StripedNotice roles={roles}>Cursed: you won't know which position a pick is for until you've made it.</StripedNotice>
      )}

      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.rack} contentContainerStyle={styles.rackContent}>
        {ALL_FORMATIONS.map(f => (
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
        ))}
      </ScrollView>

      <Plate label={`Draft a ${selected}`} icon="forward" roles={roles} onPress={draft} style={styles.plate} />
    </KitScreen>
  )
}

// The selected shape: a row per line, a numbered shirt per position, attack at
// the top. Shirt numbers follow the slot order (GK is 1).
function PitchShape({ roles, formation }: { roles: Roles; formation: Formation }) {
  const slots = getSlotsForFormation(formation)
  const remaining = [...slots]
  const rows = getFormationRows(formation).map(row => row.map(label => {
    const i = remaining.findIndex(s => s.label === label)
    return i >= 0 ? remaining.splice(i, 1)[0] : null
  }))
  return (
    <View style={[styles.pitch, { backgroundColor: roles.sunken, borderColor: roles.line }]}
      accessible accessibilityLabel={`${formation} on the pitch`}>
      <View style={[styles.halfway, { backgroundColor: roles.rule }]} />
      {rows.map((row, r) => (
        <View key={r} style={styles.pitchRow}>
          {row.map((slot, i) => slot && (
            <View key={i} style={styles.shirt}>
              <View style={[styles.shirtBody, { borderColor: roles.line, backgroundColor: roles.surface }]}>
                <KitText t="title" color={roles.text}>{String(slot.slotIndex + 1)}</KitText>
              </View>
              <KitText t="tag" color={roles.text}>{slot.label}</KitText>
            </View>
          ))}
        </View>
      ))}
    </View>
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
  pitch: { borderWidth: border.thin, paddingVertical: space[4], gap: space[3], overflow: 'hidden' },
  halfway: { position: 'absolute', left: 0, right: 0, top: '50%', height: 1 },
  pitchRow: { flexDirection: 'row', justifyContent: 'space-evenly' },
  shirt: { alignItems: 'center', gap: 2, minWidth: 44 },
  shirtBody: { width: 38, height: 34, borderWidth: border.thin, alignItems: 'center', justifyContent: 'center' },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: space[3], marginTop: space[4] },
  needs: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: space[2], marginTop: space[3], marginBottom: space[3] },
  rack: { marginTop: space[4], marginHorizontal: -space[4] },
  rackContent: { paddingHorizontal: space[4], gap: space[2] },
  rackItem: { width: 96, paddingVertical: space[2], alignItems: 'center', gap: space[2] },
  rackTape: { position: 'absolute', left: 0, right: 0, bottom: 0, height: border.tape, backgroundColor: prim.orange },
  mini: { gap: 5, alignItems: 'center', height: 56, justifyContent: 'center' },
  miniRow: { flexDirection: 'row', gap: 5 },
  miniDot: { width: 7, height: 7 },
  plate: { marginTop: space[5] },
})
