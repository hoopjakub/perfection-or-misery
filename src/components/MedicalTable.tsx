// The medical table (Big Fixes §10.5 phase 4, R8).
//
// Every absence of the run in one place: who was out, from which matchday to
// which, and why. Your own club sits at the top and is marked, because the only
// absences you can do anything about are yours — and when your bench couldn't
// cover one, the row says who stood in and how much worse he was, which is the
// whole point of the OVR−5 stand-in rule (decision 1).
//
// Availability is sequential, so this list is built once by the ledger during
// the sim and travels on the result. Nothing here recomputes anything.
//
// P8-104: rebuilt on the kit (it was a rounded, bordered card in the old type,
// with the reasons in the old red and yellow). A row of yours carries the
// orange edge, the one mark that always means "you"; the reason is words, so
// it never depends on a colour.

import React, { useState } from 'react'
import { View, StyleSheet, Pressable } from 'react-native'
import { ROLES, space, border } from '@/theme'
import { KitText, SectionTag } from '@/components/kit'
import type { Absence } from '@/engine/availability'

const COLLAPSED_ROWS = 8
const roles = ROLES.nylon

// `accent` is kept for the callers; the kit's own roles colour the table now.
export function MedicalTable({ absences }: { absences?: Absence[]; accent?: string }) {
  const [expanded, setExpanded] = useState(false)
  if (!absences?.length) return null

  // Yours first, then in the order things happened — a season reads forwards.
  const rows = [...absences].sort((a, b) =>
    Number(b.isPlayerClub) - Number(a.isPlayerClub)
    || a.incurredOn - b.incurredOn
    || (a.playerName < b.playerName ? -1 : 1))
  const shown = expanded ? rows : rows.slice(0, COLLAPSED_ROWS)
  const mine = rows.filter(a => a.isPlayerClub).length

  return (
    <View style={styles.wrap}>
      <SectionTag roles={roles}>Medical & suspensions</SectionTag>
      <KitText t="body" color={roles.textMuted}>
        {`${rows.length} absence${rows.length === 1 ? '' : 's'} across the competition${mine > 0 ? ` · ${mine} of yours` : ''}`}
      </KitText>

      <View style={[styles.head, { borderBottomColor: roles.line }]}>
        <KitText t="tag" color={roles.textMuted} style={styles.colPlayer}>Player</KitText>
        <KitText t="tag" color={roles.textMuted} style={styles.colReason}>Reason</KitText>
        <KitText t="tag" color={roles.textMuted} style={styles.colSpan}>Out</KitText>
      </View>

      {shown.map(a => (
        <View key={`${a.playerId}-${a.fromMatchday}-${a.reason}`}
          style={[styles.row, { borderBottomColor: roles.rule, borderLeftColor: a.isPlayerClub ? roles.you : 'transparent' },
            a.isPlayerClub && { backgroundColor: roles.yours }]}>
          <View style={styles.colPlayer}>
            <KitText t="body" color={roles.text} numberOfLines={1}>{a.playerName}</KitText>
            <KitText t="tag" color={roles.textMuted} numberOfLines={1}>{`${a.position} · ${a.clubName}`}</KitText>
            {a.standInName ? (
              <KitText t="tag" color={roles.textMuted} numberOfLines={1}>{`Stand-in: ${a.standInName} (${a.standInOvr})`}</KitText>
            ) : null}
          </View>
          <KitText t="tag" color={roles.text} numberOfLines={2} style={styles.colReason}>
            {a.reason === 'injury' ? `Injury${a.minute ? ` · ${a.minute}'` : ''}` : 'Suspended'}
          </KitText>
          <KitText t="figure" color={roles.text} style={styles.colSpan}>
            {a.fromMatchday === a.toMatchday ? `MD ${a.fromMatchday}` : `MD ${a.fromMatchday}–${a.toMatchday}`}
          </KitText>
        </View>
      ))}

      {rows.length > COLLAPSED_ROWS && (
        <Pressable onPress={() => setExpanded(v => !v)} accessibilityRole="button" accessibilityState={{ expanded }}
          style={({ pressed }) => [styles.more, { borderColor: roles.line }, pressed && { backgroundColor: roles.sunken }]}>
          <KitText t="tag" color={roles.text}>{expanded ? 'Show fewer' : `Show all ${rows.length}`}</KitText>
        </Pressable>
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  wrap: { gap: space[2] },
  head: { flexDirection: 'row', alignItems: 'center', gap: space[2], paddingBottom: space[1], borderBottomWidth: border.hair, paddingLeft: space[2] + 3 },
  row: {
    flexDirection: 'row', alignItems: 'center', gap: space[2], minHeight: 48,
    paddingVertical: space[1], paddingLeft: space[2], borderBottomWidth: border.hair, borderLeftWidth: 3,
  },
  colPlayer: { flex: 1, minWidth: 0 },
  colReason: { width: 96 },
  colSpan: { width: 80, textAlign: 'right' },
  more: { alignSelf: 'center', paddingHorizontal: space[4], paddingVertical: space[2], borderWidth: border.hair, marginTop: space[1] },
})
