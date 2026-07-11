import React, { useState } from 'react'
import { View, Text, StyleSheet, Pressable, Modal, ScrollView } from 'react-native'
import { colors, spacing, typography, radius, MODE_THEMES } from '@/theme'
import { EXPLAINERS, RULES_ORDER } from '@/data/explainers'

const CL = MODE_THEMES.champions_league

// A small `?` info-bubble. Tap it to open a short plain-language explainer of a
// non-obvious concept (pots, qualifying paths, two-legged ties, league formats…).
// Content comes from `src/data/explainers.ts` by `topic`, or pass title/text
// directly (used for per-league format notes). Docs §11.
export function InfoBubble({
  topic, title, text, accent = CL.accent, size = 18,
}: {
  topic?: string
  title?: string
  text?: string
  accent?: string
  size?: number
}) {
  const [open, setOpen] = useState(false)
  const content = topic ? EXPLAINERS[topic] : (title || text ? { title: title ?? '', text: text ?? '' } : null)
  if (!content) return null

  return (
    <>
      <Pressable
        onPress={() => setOpen(true)}
        hitSlop={10}
        style={[styles.bubble, { width: size, height: size, borderRadius: size / 2, borderColor: accent }]}
      >
        <Text style={[styles.q, { color: accent, fontSize: size * 0.62 }]}>?</Text>
      </Pressable>

      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <Pressable style={styles.overlay} onPress={() => setOpen(false)}>
          <Pressable style={[styles.card, { borderColor: accent }]} onPress={() => {}}>
            <Text style={[styles.title, { color: accent }]}>{content.title}</Text>
            <Text style={styles.text}>{content.text}</Text>
            <Pressable style={[styles.close, { backgroundColor: accent }]} onPress={() => setOpen(false)}>
              <Text style={styles.closeText}>Got it</Text>
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>
    </>
  )
}

const styles = StyleSheet.create({
  bubble: {
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  q: { fontWeight: typography.black, lineHeight: undefined },
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.75)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: spacing.lg,
  },
  card: {
    width: '100%',
    maxWidth: 420,
    backgroundColor: colors.bgCard,
    borderRadius: radius.lg,
    borderWidth: 1,
    padding: spacing.lg,
    gap: spacing.md,
  },
  title: { fontSize: typography.lg, fontWeight: typography.black },
  text: { fontSize: typography.sm, color: colors.textSecondary, lineHeight: 21 },
  close: {
    marginTop: spacing.xs,
    borderRadius: radius.md,
    paddingVertical: spacing.md,
    alignItems: 'center',
  },
  closeText: { fontSize: typography.md, fontWeight: typography.black, color: colors.textPrimary, letterSpacing: 1 },
})

// A convenience row: a section title with an info-bubble beside it.
export function TitleWithInfo({ title, topic, style, accent }: { title: string; topic: string; style?: any; accent?: string }) {
  return (
    <View style={rowStyles.row}>
      <Text style={style}>{title}</Text>
      <InfoBubble topic={topic} accent={accent} />
    </View>
  )
}

const rowStyles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
})

// The full rulebook — every explainer, in story order (domestic season → final).
// Opened from the "how this competition works" buttons on the result & stats screens.
export function RulesModal({ visible, onClose, accent = CL.accent }: { visible: boolean; onClose: () => void; accent?: string }) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.overlay} onPress={onClose}>
        <Pressable style={[styles.card, { borderColor: accent, maxHeight: '88%' }]} onPress={() => {}}>
          <Text style={[styles.title, { color: accent }]}>How this competition works</Text>
          <ScrollView showsVerticalScrollIndicator>
            {RULES_ORDER.map(key => {
              const e = EXPLAINERS[key]
              if (!e) return null
              return (
                <View key={key} style={rulesStyles.block}>
                  <Text style={[rulesStyles.blockTitle, { color: accent }]}>{e.title}</Text>
                  <Text style={styles.text}>{e.text}</Text>
                </View>
              )
            })}
          </ScrollView>
          <Pressable style={[styles.close, { backgroundColor: accent }]} onPress={onClose}>
            <Text style={styles.closeText}>Got it</Text>
          </Pressable>
        </Pressable>
      </Pressable>
    </Modal>
  )
}

const rulesStyles = StyleSheet.create({
  block: { paddingVertical: spacing.md, borderBottomWidth: 1, borderBottomColor: colors.border, gap: 4 },
  blockTitle: { fontSize: typography.md, fontWeight: typography.black },
})
