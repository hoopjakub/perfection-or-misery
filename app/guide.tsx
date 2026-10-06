import React from 'react'
import { t } from '@/i18n'
import { View, Text, StyleSheet } from 'react-native'
import { router, useLocalSearchParams } from 'expo-router'
import { KitScreen, KitText, SectionTag, BackControl, ListRow, Plate } from '@/components/kit'
import { PageMeta } from '@/components/PageMeta'
import { ROLES, space, border, font } from '@/theme'
import { EVERYDAY } from '@/lib/appearance'

// The guide (P8-72): it opens on a choice, "what do you want to learn about?",
// and each topic is its own short page, instead of one long scroll you had to
// read top to bottom to find the part you wanted. The topics are the old
// guide's sections (P8-65 already split it into blocks for this), with the
// words brought up to date where the app has moved on (the awards, the
// pundits, the press, the bracket).
const roles = ROLES[EVERYDAY]

// A word in bold, inside a paragraph. The kit sets weight by font family,
// never fontWeight, so bold is Archivo 700 inheriting the paragraph's size.
function B({ children }: { children: React.ReactNode }) {
  return <Text style={{ fontFamily: font.bodyBold, color: roles.text }}>{children}</Text>
}
function P({ children }: { children: React.ReactNode }) {
  return <KitText t="bodyL" color={roles.text}>{children}</KitText>
}

type Topic = { id: string; group: string; title: string; line: string; body: React.ReactNode }

// P8.5-28: the words live in src/i18n (guide.topic.*), in a small markup:
// **bold** and line breaks, drawn here with B inside P.
function Rich({ text }: { text: string }) {
  return <P>{text.split('**').map((part, k) => (k % 2 ? <B key={k}>{part}</B> : part))}</P>
}

const GROUPS = [t('guide.groupBefore'), t('guide.groupDuring'), t('guide.groupAfter')]

const topic = (id: string, group: string): Topic => ({
  id, group,
  title: t(`guide.topic.${id}.title` as 'guide.topic.idea.title'),
  line: t(`guide.topic.${id}.line` as 'guide.topic.idea.line'),
  body: <Rich text={t(`guide.topic.${id}.body` as 'guide.topic.idea.body')} />,
})

const TOPICS: Topic[] = [
  topic('idea', GROUPS[0]),
  topic('modes', GROUPS[0]),
  topic('difficulty', GROUPS[0]),
  topic('formations', GROUPS[0]),
  topic('draft', GROUPS[0]),
  topic('bench', GROUPS[0]),
  topic('placement', GROUPS[0]),
  topic('pundits', GROUPS[0]),
  topic('season', GROUPS[1]),
  topic('press', GROUPS[1]),
  topic('match', GROUPS[1]),
  topic('knockouts', GROUPS[1]),
  topic('awards', GROUPS[2]),
  topic('summary', GROUPS[2]),
  topic('scoring', GROUPS[2]),
  topic('achievements', GROUPS[2]),
]

export default function GuideScreen() {
  const { topic } = useLocalSearchParams<{ topic?: string }>()
  const i = TOPICS.findIndex(x => x.id === topic)
  const open = (id: string) => router.push({ pathname: '/guide', params: { topic: id } })

  // One topic, on its own page, with the next one a tap away.
  if (i >= 0) {
    const tp = TOPICS[i]
    const next = TOPICS[i + 1]
    return (
      <KitScreen ground={EVERYDAY}>
        <PageMeta title={t('guide.pageTopic', { title: tp.title })} path={`/guide?topic=${tp.id}`} />
        <BackControl roles={roles} />
        <KitText t="tag" color={roles.textMuted} style={styles.kicker}>{t('guide.kicker', { group: tp.group.toUpperCase() })}</KitText>
        <KitText t="superM" color={roles.text} accessibilityRole="header" style={styles.title}>{tp.title.toUpperCase()}</KitText>
        <View style={styles.body}>{tp.body}</View>
        {next && (
          <Plate label={t('guide.next', { title: next.title })} icon="forward" variant="secondary" roles={roles}
            onPress={() => router.replace({ pathname: '/guide', params: { topic: next.id } })} style={styles.next} />
        )}
      </KitScreen>
    )
  }

  // The choice.
  return (
    <KitScreen ground={EVERYDAY}>
      <PageMeta title={t('guide.pageTitle')} path="/guide" />
      <BackControl roles={roles} title={t('guide.heading')} />
      <KitText t="bodyL" color={roles.textMuted}>{t('guide.question')}</KitText>
      {GROUPS.map(g => (
        <View key={g} style={styles.group}>
          <SectionTag roles={roles}>{g}</SectionTag>
          {TOPICS.filter(x => x.group === g).map(x => (
            <ListRow key={x.id} roles={roles} label={x.title} sub={x.line} onPress={() => open(x.id)} />
          ))}
        </View>
      ))}
    </KitScreen>
  )
}

const styles = StyleSheet.create({
  kicker: { marginTop: space[2] },
  title: { marginTop: space[2], marginBottom: space[3] },
  body: { paddingVertical: space[2], borderTopWidth: border.hair, borderTopColor: roles.rule, paddingTop: space[4] },
  group: { marginTop: space[4], gap: space[1] },
  next: { marginTop: space[5] },
})
