import React from 'react'
import { PageMeta } from '@/components/PageMeta'
import { View, StyleSheet } from 'react-native'
import { useLocalSearchParams } from 'expo-router'
import { ROLES, space, border, font } from '@/theme'
import { KitScreen, KitText, BackControl } from '@/components/kit'
import { EXPLAINERS, RULES_ORDER } from '@/data/explainers'

// The rulebook as a route (Phase 5), replacing RulesModal and the `?` bubble's
// modal. Opened on a topic, that topic leads in the big type and the rest of
// the rulebook follows in story order, so one question leads to the rest.
const roles = ROLES.nylon

export default function RulesScreen() {
  const { topic } = useLocalSearchParams<{ topic?: string }>()
  const lead = topic ? EXPLAINERS[topic] : undefined
  const rest = RULES_ORDER.filter(k => k !== topic && EXPLAINERS[k])
  return (
    <KitScreen ground="nylon">
      <PageMeta title="How it works" description="The rules of every competition in Perfection or Misery, in plain words." path="/game/rules" />
      <BackControl roles={roles} />
      {lead ? (
        <View style={styles.lead}>
          <KitText t="superM" color={roles.text} accessibilityRole="header">{lead.title.toUpperCase()}</KitText>
          <KitText t="bodyL" color={roles.text}>{lead.text}</KitText>
        </View>
      ) : (
        <KitText t="superM" color={roles.text} accessibilityRole="header" style={styles.lead}>HOW IT WORKS</KitText>
      )}
      {lead && <KitText t="tag" color={roles.textMuted} style={styles.more}>The rest of the rulebook</KitText>}
      {rest.map(k => (
        <View key={k} style={[styles.block, { borderTopColor: roles.rule }]}>
          <KitText t="bodyL" color={roles.text} style={styles.title}>{EXPLAINERS[k].title}</KitText>
          <KitText t="body" color={roles.textMuted}>{EXPLAINERS[k].text}</KitText>
        </View>
      ))}
    </KitScreen>
  )
}

const styles = StyleSheet.create({
  lead: { gap: space[3], marginTop: space[3], marginBottom: space[4], maxWidth: 560 },
  more: { marginBottom: space[2] },
  block: { borderTopWidth: border.hair, paddingVertical: space[3], gap: space[1], maxWidth: 560 },
  title: { fontFamily: font.bodyBold },
})
