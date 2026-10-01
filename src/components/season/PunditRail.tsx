import React from 'react'
import { View, Pressable, ScrollView, StyleSheet } from 'react-native'
import { type Roles, space, border } from '@/theme'
import { KitText, RoundFlag } from '@/components/kit'
import { flagForCountry } from '@/data/geo-iso'

// The panel as a rail of cards: the panel together first, then each pundit
// with their country's flag. Tap one and everything under it is theirs. One
// rail for the pundits screen (their previews, P8-56) and the cup result
// screens (their tournaments, P8-165), so choosing a pundit works the same way
// before a run and after it.
export type RailCard = {
  key: string
  /** A pundit's country: its flag and name above the title. */
  country?: string
  /** A tag above the title where there's no country (the panel's "ALL 12"). */
  top?: string
  title: string
  /** Up to two short lines under the title, in capitals. */
  lines: string[]
  accessibilityLabel: string
}

export function PunditRail({ roles, cards, selected, onSelect }: {
  roles: Roles
  cards: RailCard[]
  selected: number
  onSelect: (i: number) => void
}) {
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.rail} contentContainerStyle={styles.railContent}>
      {cards.map((c, i) => {
        const on = selected === i
        return (
          <Pressable key={c.key} onPress={() => onSelect(i)} accessibilityRole="button" accessibilityState={{ selected: on }}
            accessibilityLabel={c.accessibilityLabel}
            style={({ pressed }) => [styles.card, { borderColor: roles.line, backgroundColor: on ? roles.yours : roles.surface, borderWidth: on ? 3 : border.thin }, pressed && { opacity: 0.8 }]}>
            {c.country ? (
              <View style={styles.top}>
                {flagForCountry(c.country) ? <RoundFlag emoji={flagForCountry(c.country)} code={c.country.slice(0, 3)} size={20} roles={roles} /> : null}
                <KitText t="tag" color={roles.textMuted} numberOfLines={1} style={{ flex: 1 }}>{c.country}</KitText>
              </View>
            ) : c.top ? <KitText t="tag" color={roles.textMuted}>{c.top}</KitText> : null}
            <KitText t="title" color={roles.text} numberOfLines={1}>{c.title}</KitText>
            {c.lines.map((l, j) => (
              <KitText key={j} t="tag" color={j === 0 ? roles.text : roles.textMuted} numberOfLines={1}>{l}</KitText>
            ))}
          </Pressable>
        )
      })}
    </ScrollView>
  )
}

const styles = StyleSheet.create({
  rail: { marginHorizontal: -space[4], marginBottom: space[3] },
  railContent: { paddingHorizontal: space[4], gap: space[2] },
  card: { width: 176, padding: space[3], gap: 4 },
  top: { flexDirection: 'row', alignItems: 'center', gap: space[2] },
})
