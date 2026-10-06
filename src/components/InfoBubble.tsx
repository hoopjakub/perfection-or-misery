import { t } from '@/i18n'
import { useModeTheme } from '@/hooks/useModeTheme'
import React from 'react'
import { StyleSheet, Pressable } from 'react-native'
// P8-123: text on the kit's families and scale until this screen is rebuilt on KitText.
import { ScaleText as Text } from '@/components/kit'
import { router } from 'expo-router'
import { font } from '@/theme'
import { EXPLAINERS } from '@/data/explainers'


/** The rulebook route, opened on one topic (or from the top). Phase 5: no content modals. */
export function openRules(topic?: string) {
  router.push({ pathname: '/game/rules', params: topic ? { topic } : {} } as never)
}

// A small `?` info-bubble. Tap it for a short plain-language explainer of a
// non-obvious concept (pots, qualifying paths, two-legged ties…). It used to
// open a modal; since Phase 5 it opens the rulebook page on that topic, with
// the rest of the rulebook below it. Content: `src/data/explainers.ts`.
export function InfoBubble({ topic, accent: given, size = 18 }: { topic: string; accent?: string; size?: number }) {
  const accent = given ?? useModeTheme().accent
  if (!EXPLAINERS[topic]) return null
  return (
    <Pressable onPress={() => openRules(topic)} hitSlop={10} accessibilityRole="link" accessibilityLabel={t('parts.aboutTopic', { title: EXPLAINERS[topic].title })}
      style={({ pressed }) => [styles.bubble, { width: size, height: size, borderRadius: size / 2, borderColor: accent }, pressed && { opacity: 0.6 }]}>
      <Text style={[styles.q, { color: accent, fontSize: size * 0.62 }]}>?</Text>
    </Pressable>
  )
}

const styles = StyleSheet.create({
  bubble: { borderWidth: 1.5, alignItems: 'center', justifyContent: 'center' },
  q: { fontFamily: font.bodyBlack, lineHeight: undefined },
})
