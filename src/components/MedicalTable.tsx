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

import React, { useState } from 'react'
import { View, Text, StyleSheet, Pressable } from 'react-native'
import { colors, spacing, typography, radius, prim, font } from '@/theme'
import type { Absence } from '@/engine/availability'

const COLLAPSED_ROWS = 8

export function MedicalTable({ absences, accent }: { absences?: Absence[]; accent: string }) {
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
    <View style={styles.card}>
      <Text style={styles.title}>Medical & Suspensions</Text>
      <Text style={styles.subtitle}>
        {rows.length} absence{rows.length === 1 ? '' : 's'} across the competition
        {mine > 0 ? ` · ${mine} of yours` : ''}
      </Text>

      <View style={styles.headRow}>
        <Text style={[styles.cell, styles.colPlayer, styles.headText]}>Player</Text>
        <Text style={[styles.cell, styles.colReason, styles.headText]}>Reason</Text>
        <Text style={[styles.cell, styles.colSpan, styles.headText]}>Matchdays</Text>
      </View>

      {shown.map(a => (
        <View
          key={`${a.playerId}-${a.fromMatchday}-${a.reason}`}
          style={[styles.row, a.isPlayerClub && { backgroundColor: accent + '14' }]}
        >
          {/* A side bar rather than colour alone, so which club a row belongs to
              never depends on hue. */}
          <View style={[styles.sideBar, { backgroundColor: a.isPlayerClub ? accent : prim.ruleNylon }]} />
          <View style={[styles.cell, styles.colPlayer]}>
            <Text style={styles.name} numberOfLines={1}>{a.playerName}</Text>
            <Text style={styles.meta} numberOfLines={1}>{a.position} · {a.clubName}</Text>
            {a.standInName ? (
              <Text style={styles.standIn} numberOfLines={1}>
                stand-in: {a.standInName} ({a.standInOvr})
              </Text>
            ) : null}
          </View>
          <Text
            style={[styles.cell, styles.colReason, styles.reason,
              { color: a.reason === 'injury' ? colors.danger : colors.warning }]}
            numberOfLines={2}
          >
            {a.reason === 'injury'
              ? `Injury${a.minute ? ` · ${a.minute}'` : ''}`
              : 'Suspended'}
          </Text>
          <Text style={[styles.cell, styles.colSpan, styles.span]}>
            {a.fromMatchday === a.toMatchday
              ? `MD ${a.fromMatchday}`
              : `MD ${a.fromMatchday}–${a.toMatchday}`}
          </Text>
        </View>
      ))}

      {rows.length > COLLAPSED_ROWS && (
        <Pressable onPress={() => setExpanded(v => !v)} style={styles.more}>
          <Text style={[styles.moreText, { color: accent }]}>
            {expanded ? 'Show less' : `Show all ${rows.length}`}
          </Text>
        </Pressable>
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: prim.nylonRaised, borderRadius: 0, padding: spacing.lg,
    borderWidth: 1, borderColor: prim.ruleNylon, gap: 2,
  },
  title: { fontSize: typography.md, fontFamily: font.bodyBold, color: prim.cotton },
  subtitle: { fontSize: typography.xs, color: prim.cottonMuted, marginBottom: spacing.sm },
  headRow: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.sm,
    paddingBottom: 4, borderBottomWidth: 1, borderBottomColor: prim.ruleNylon,
  },
  headText: {
    fontSize: 9, fontFamily: font.bodyBlack, color: prim.cottonMuted,
    textTransform: 'uppercase', letterSpacing: 0.5,
  },
  row: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.sm,
    paddingVertical: 5, borderBottomWidth: 1, borderBottomColor: prim.ruleNylon,
    borderRadius: 0,
  },
  sideBar: { width: 3, alignSelf: 'stretch', borderRadius: 2 },
  cell: { justifyContent: 'center' },
  colPlayer: { flex: 1 },
  colReason: { width: 78 },
  colSpan:   { width: 74, textAlign: 'right' },
  name: { fontSize: typography.sm, color: prim.cotton, fontFamily: font.bodyBold },
  meta: { fontSize: 10, color: prim.cottonMuted },
  standIn: { fontSize: 10, color: prim.cottonMuted, },
  reason: { fontSize: 10, fontFamily: font.bodyBold },
  span: { fontSize: 11, color: prim.cottonMuted, fontFamily: font.bodyBold },
  more: { paddingTop: spacing.sm, alignItems: 'center' },
  moreText: { fontSize: typography.xs, fontFamily: font.bodyBold },
})
