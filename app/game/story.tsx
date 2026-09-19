import React, { useRef } from 'react'
import { WebKeys } from '@/lib/webKeys'
import { View, Pressable, StyleSheet } from 'react-native'
import { router, useLocalSearchParams } from 'expo-router'
import { ROLES, space, border } from '@/theme'
import { KitScreen, KitText, Tag, BackControl, EmptyState, Plate, Icon } from '@/components/kit'
import { useGameStore } from '@/store/gameStore'
import { storyText, storyBody } from '@/engine/press'
import { openClub } from '@/lib/runNav'
import { shareRunLabel } from '@/lib/shareRun'

// D6 · A story, opened (docs/ui-overhaul/07d). Typeset as a back page: the
// headline in the super, the standfirst, a short paragraph, and the table as
// it stood that week — frozen, never recalculated. Every club named is a link;
// the previous and next stories sit at the foot, in the order they ran.
const roles = ROLES.nylon

export default function StoryScreen() {
  const { id } = useLocalSearchParams<{ id: string }>()
  const press = useGameStore(s => s.runData?.press ?? s.simResult?.press ?? [])
  const i = press.findIndex(s => s.id === id)
  const story = i >= 0 ? press[i] : null
  const card = useRef<View>(null)

  if (!story) {
    return (
      <KitScreen ground="nylon">
        <BackControl roles={roles} />
        <EmptyState roles={roles} title="Story not found" body="The press belongs to a live run, and this one has ended or the page was reloaded." />
      </KitScreen>
    )
  }
  const { headline, standfirst } = storyText(story)
  const prev = press[i - 1], next = press[i + 1]
  const go = (sid: string) => router.replace({ pathname: '/game/story', params: { id: sid } } as never)

  return (
    <KitScreen ground="nylon">
      <WebKeys onKey={k => { if (k === 'ArrowLeft' && prev) go(prev.id); if (k === 'ArrowRight' && next) go(next.id) }} />
      <BackControl roles={roles} />
      <View ref={card} style={styles.article} collapsable={false}>
        <View style={styles.meta}>
          <KitText t="tag" color={roles.textMuted}>{`Matchday ${story.matchday} of ${story.totalMatchdays}`}</KitText>
          {story.involvesPlayer && <Tag roles={roles} variant="you">YOUR XI</Tag>}
        </View>
        <KitText t="superM" color={roles.text} accessibilityRole="header">{headline.toUpperCase()}</KitText>
        <KitText t="bodyL" color={roles.textMuted}>{standfirst}</KitText>
        {storyBody(story).map((para, k) => (
          <KitText key={k} t="bodyL" color={roles.text} style={styles.para}>{para}</KitText>
        ))}

        {/* The table as it stood that week, set into the story like a graphic. */}
        <View style={[styles.table, { borderColor: roles.line }]}>
          <KitText t="tag" color={roles.textMuted}>{`The table after matchday ${story.matchday}`}</KitText>
          {story.rows.map(r => (
            <Pressable key={r.clubId} onPress={() => openClub(r.clubId)} accessibilityRole="link"
              style={({ pressed }) => [styles.row, { borderBottomColor: roles.rule }, r.isPlayer && { backgroundColor: roles.surface }, pressed && { backgroundColor: roles.sunken }]}>
              <KitText t="figure" color={roles.textMuted} style={styles.pos}>{String(r.pos)}</KitText>
              <KitText t="body" color={roles.text} numberOfLines={1} style={{ flex: 1 }}>{r.clubName}</KitText>
              <KitText t="figure" color={roles.textMuted} style={styles.num}>{String(r.played)}</KitText>
              <KitText t="figure" color={roles.textMuted} style={styles.num}>{r.gd > 0 ? `+${r.gd}` : String(r.gd)}</KitText>
              <KitText t="figure" color={roles.text} style={styles.num}>{String(r.points)}</KitText>
            </Pressable>
          ))}
        </View>
      </View>

      <Plate label="Share this story" icon="forward" variant="secondary" roles={roles}
        onPress={() => { shareRunLabel(card.current as never, `${headline}. ${standfirst}`) }} style={styles.share} />

      <View style={styles.pager}>
        <Pressable disabled={!prev} onPress={() => prev && go(prev.id)} accessibilityRole="button" accessibilityLabel="Previous story"
          style={({ pressed }) => [styles.page, { borderColor: prev ? roles.line : roles.rule }, pressed && { backgroundColor: roles.sunken }]}>
          <Icon name="back" size={20} color={prev ? roles.text : roles.textFaint} />
          <KitText t="body" color={prev ? roles.text : roles.textFaint} numberOfLines={2} style={{ flex: 1 }}>{prev ? storyText(prev).headline : 'The first story'}</KitText>
        </Pressable>
        <Pressable disabled={!next} onPress={() => next && go(next.id)} accessibilityRole="button" accessibilityLabel="Next story"
          style={({ pressed }) => [styles.page, { borderColor: next ? roles.line : roles.rule }, pressed && { backgroundColor: roles.sunken }]}>
          <KitText t="body" color={next ? roles.text : roles.textFaint} numberOfLines={2} style={{ flex: 1, textAlign: 'right' }}>{next ? storyText(next).headline : 'The latest story'}</KitText>
          <Icon name="chevron" size={20} color={next ? roles.text : roles.textFaint} />
        </Pressable>
      </View>
    </KitScreen>
  )
}

const styles = StyleSheet.create({
  // A reading measure: about 62 characters at body size on a phone, capped on wide screens.
  article: { gap: space[3], marginTop: space[3], maxWidth: 560, backgroundColor: roles.bg, paddingBottom: space[2] },
  meta: { flexDirection: 'row', alignItems: 'center', gap: space[2] },
  para: { maxWidth: 520 },
  table: { borderWidth: border.thin, padding: space[3], gap: 2, marginTop: space[2] },
  row: { flexDirection: 'row', alignItems: 'center', gap: space[2], minHeight: 40, borderBottomWidth: border.hair },
  pos: { width: 24, textAlign: 'right' },
  num: { width: 36, textAlign: 'right' },
  share: { marginTop: space[4] },
  pager: { flexDirection: 'row', gap: space[2], marginTop: space[4] },
  page: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: space[2], borderWidth: border.thin, padding: space[2], minHeight: 56 },
})
