import React from 'react'
import { View, Text, StyleSheet, Pressable } from 'react-native'
import { router } from 'expo-router'
import { spacing, MODE_THEMES, font } from '@/theme'
import { EXPLAINERS } from '@/data/explainers'

const CL = MODE_THEMES.champions_league

/** The rulebook route, opened on one topic (or from the top). Phase 5: no content modals. */
export function openRules(topic?: string) {
  router.push({ pathname: '/game/rules', params: topic ? { topic } : {} } as never)
}

// A small `?` info-bubble. Tap it for a short plain-language explainer of a
// non-obvious concept (pots, qualifying paths, two-legged ties…). It used to
// open a modal; since Phase 5 it opens the rulebook page on that topic, with
// the rest of the rulebook below it. Content: `src/data/explainers.ts`.
export function InfoBubble({ topic, accent = CL.accent, size = 18 }: { topic: string; accent?: string; size?: number }) {
  if (!EXPLAINERS[topic]) return null
  return (
    <Pressable onPress={() => openRules(topic)} hitSlop={10} accessibilityRole="link" accessibilityLabel={`About: ${EXPLAINERS[topic].title}`}
      style={({ pressed }) => [styles.bubble, { width: size, height: size, borderRadius: size / 2, borderColor: accent }, pressed && { opacity: 0.6 }]}>
      <Text style={[styles.q, { color: accent, fontSize: size * 0.62 }]}>?</Text>
    </Pressable>
  )
}

// A convenience row: a section title with an info-bubble beside it.
export function TitleWithInfo({ title, topic, style, accent }: { title: string; topic: string; style?: any; accent?: string }) {
  return (
    <View style={styles.row}>
      <Text style={style}>{title}</Text>
      <InfoBubble topic={topic} accent={accent} />
    </View>
  )
}

const styles = StyleSheet.create({
  bubble: { borderWidth: 1.5, alignItems: 'center', justifyContent: 'center' },
  q: { fontFamily: font.bodyBlack, lineHeight: undefined },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
})
