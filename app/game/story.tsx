import type { Story } from '@/engine/press'
import { useRunData } from '@/lib/runData'
import React, { useRef } from 'react'
import { getLivePress } from '@/lib/livePress'
import { PageMeta } from '@/components/PageMeta'
import { WebKeys } from '@/lib/webKeys'
import { View, Pressable, StyleSheet } from 'react-native'
import { router, useLocalSearchParams } from 'expo-router'
import { ROLES, space, border, OFFSET, colourwayFor } from '@/theme'
import { KitScreen, KitText, Tag, BackControl, EmptyState, Plate, Icon, ClubName, Rivets, Tape, Wordmark, VenueMark, TeamMark, RatingSquare } from '@/components/kit'
import { useGameStore } from '@/store/gameStore'
import { storyText, storyBody } from '@/engine/press'
import { openClub, openRunMatch } from '@/lib/runNav'
import { shareRunLabel } from '@/lib/shareRun'
import { EVERYDAY } from '@/lib/appearance'

// D6 · A story, opened (docs/ui-overhaul/07d). Typeset as a back page: the
// headline in the super, the standfirst, a short paragraph, and the table as
// it stood that week — frozen, never recalculated. Every club named is a link;
// the previous and next stories sit at the foot, in the order they ran.
const roles = ROLES[EVERYDAY]

const NO_STORIES: Story[] = []

export default function StoryScreen() {
  const { id, runId } = useLocalSearchParams<{ id: string; runId?: string }>()
  // P8-96: a saved run's stories, read from that run.
  const savedRun = useRunData(runId).data
  // The selector must return the SAME value when nothing changed: a `?? []`
  // inside it made a fresh array every read, which zustand's store hook treats
  // as a change on every render — "getSnapshot should be cached", then
  // "Maximum update depth exceeded". Mid-season (no stored press yet) that's
  // exactly the path P8-140's live press took, so the empty case lives outside.
  const stored = useGameStore(s => s.runData?.press ?? s.simResult?.press) ?? NO_STORIES
  // Mid-season there's no result yet: the live season hands its press over.
  const press = runId ? (savedRun?.press ?? NO_STORIES) : stored.length ? stored : getLivePress()
  // Story ids carry punctuation (`sixPointer:roma+lazio:14`), and a `+` in a
  // web address comes back as a space — so the page couldn't find the story it
  // was sent to. Compared with the punctuation folded away, any encoding of
  // the id finds the same story.
  const key = (x: string) => x.replace(/[^A-Za-z0-9]+/g, '_')
  const i = id ? press.findIndex(s => key(s.id) === key(String(id))) : -1
  const story = i >= 0 ? press[i] : null
  const card = useRef<View>(null)
  const shareCard = useRef<View>(null)
  // The run's own colourway on the card's tape (the league's, P8-55).
  const mode = useGameStore(s => s.mode)
  const leagueId = useGameStore(s => s.placedLeague?.leagueId)
  const colourway = colourwayFor(mode, null, leagueId)

  if (!story) {
    return (
      <KitScreen ground={EVERYDAY}>
        <BackControl roles={roles} />
        <EmptyState roles={roles} title="Story not found" body="The press belongs to a live run, and this one has ended or the page was reloaded." />
      </KitScreen>
    )
  }
  const { headline, standfirst } = storyText(story)
  const prev = press[i - 1], next = press[i + 1]
  const go = (sid: string) => router.replace({ pathname: '/game/story', params: { id: sid } } as never)

  return (
    <KitScreen ground={EVERYDAY}>
      <PageMeta title={headline} description={standfirst} />
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

        {/* P8-138: a team's form with its results, not a bare W-D-L. Frozen
            with the story, like the table. */}
        {story.form?.length ? (
          <View style={[styles.table, { borderColor: roles.line }]}>
            <KitText t="tag" color={roles.textMuted}>{`${story.names[0]}'s last ${story.form.length}`.toUpperCase()}</KitText>
            {story.form.map((f, k) => (
              <View key={k} style={[styles.row, { borderBottomColor: roles.rule }]}>
                <Tag roles={roles} variant={f.mark === 'W' ? 'win' : f.mark === 'D' ? 'draw' : 'loss'}>{f.mark}</Tag>
                <VenueMark roles={roles} home={f.home} />
                <KitText t="body" color={roles.text} numberOfLines={1} style={{ flex: 1 }}>{f.opponent}</KitText>
                <KitText t="figure" color={roles.text}>{f.score}</KitText>
              </View>
            ))}
          </View>
        ) : null}

        {/* A story about one match shows the match, not the table (the
            maintainer, 27 Sept): a masterclass, a thrashing, a giant-killing,
            the end of a run. It opens the match sheet where the run has it. */}
        {story.match ? (() => {
          const m = story.match
          const found = savedRun?.matches?.find(x => x.label === `Matchday ${story.matchday}` && x.homeClubId === m.homeId && x.awayClubId === m.awayId)
          return (
            <Pressable disabled={!found || !savedRun} onPress={() => { if (found && savedRun) openRunMatch(savedRun, found) }}
              accessibilityRole={found ? 'button' : undefined} accessibilityLabel={`${m.homeName} ${m.homeGoals}, ${m.awayName} ${m.awayGoals}`}
              style={({ pressed }) => [styles.table, styles.match, { borderColor: roles.line }, pressed && { backgroundColor: roles.sunken }]}>
              <KitText t="tag" color={roles.textMuted}>{`MATCHDAY ${story.matchday}`}</KitText>
              <View style={styles.matchRow}>
                <View style={[styles.matchSide, { alignItems: 'flex-end' }]}>
                  <TeamMark roles={roles} clubId={m.homeId} name={m.homeName} size={24} />
                  <KitText t="title" color={roles.text} numberOfLines={2} style={{ textAlign: 'right' }}>{m.homeName}</KitText>
                </View>
                <KitText t="superL" color={roles.text}>{`${m.homeGoals}–${m.awayGoals}`}</KitText>
                <View style={styles.matchSide}>
                  <TeamMark roles={roles} clubId={m.awayId} name={m.awayName} size={24} />
                  <KitText t="title" color={roles.text} numberOfLines={2}>{m.awayName}</KitText>
                </View>
              </View>
              {story.kind === 'masterclass' ? (
                <View style={styles.row}>
                  <Tag roles={roles} variant="selected">MAN OF THE MATCH</Tag>
                  <KitText t="body" color={roles.text} numberOfLines={1} style={{ flex: 1 }}>{story.names[0]}</KitText>
                  <RatingSquare value={story.n.r10 / 10} size="sm" />
                </View>
              ) : null}
              {found ? <KitText t="tag" color={roles.textMuted}>OPEN THE MATCH SHEET</KitText> : null}
            </Pressable>
          )
        })() : (
        <>
        {/* The table as it stood that week, set into the story like a graphic. */}
        <View style={[styles.table, { borderColor: roles.line }]}>
          <KitText t="tag" color={roles.textMuted}>{`The table after matchday ${story.matchday}`}</KitText>
          {/* P8-18: the columns say what they are, and each club wears its crest. */}
          <View style={[styles.row, styles.head, { borderBottomColor: roles.line }]}>
            <KitText t="tag" color={roles.textMuted} style={styles.pos}>#</KitText>
            <KitText t="tag" color={roles.textMuted} style={{ flex: 1 }}>Club</KitText>
            <KitText t="tag" color={roles.textMuted} style={styles.num}>P</KitText>
            <KitText t="tag" color={roles.textMuted} style={styles.num}>GD</KitText>
            <KitText t="tag" color={roles.textMuted} style={styles.num}>PTS</KitText>
          </View>
          {story.rows.map(r => (
            <Pressable key={r.clubId} onPress={() => openClub(r.clubId)} accessibilityRole="link"
              style={({ pressed }) => [styles.row, { borderBottomColor: roles.rule }, r.isPlayer && { backgroundColor: roles.yours }, pressed && { backgroundColor: roles.sunken }]}>
              <KitText t="figure" color={roles.textMuted} style={styles.pos}>{String(r.pos)}</KitText>
              <ClubName roles={roles} clubId={r.clubId} name={r.clubName} size={16} style={{ flex: 1 }} />
              <KitText t="figure" color={roles.textMuted} style={styles.num}>{String(r.played)}</KitText>
              <KitText t="figure" color={roles.textMuted} style={styles.num}>{r.gd > 0 ? `+${r.gd}` : String(r.gd)}</KitText>
              <KitText t="figure" color={roles.text} style={styles.num}>{String(r.points)}</KitText>
            </Pressable>
          ))}
        </View>
        </>
        )}
      </View>

      <Plate label="Share this story" icon="forward" variant="secondary" roles={roles}
        onPress={() => { shareRunLabel(shareCard.current as never, `${headline}. ${standfirst}`, { width: SHARE_WIDTH }) }} style={styles.share} />

      {/* P8-69: what gets shared — a card made for it, off-screen, not a crop of
          the page. It was the article captured as it sat on the phone: small,
          zoomed in, and nothing on it said Perfection or Misery. */}
      <View style={styles.offscreen} pointerEvents="none" importantForAccessibility="no-hide-descendants">
        <View ref={shareCard} collapsable={false}>
          <StoryShareCard headline={headline} standfirst={standfirst} story={story} colourway={colourway} />
        </View>
      </View>

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

// ── The share card (P8-69) ───────────────────────────────────────────────────
// Built like the run label the maintainer praised: a riveted label on the
// kit's offset shadow, the run's colourway tape down its edge, the wordmark,
// the matchday, the headline as a super, the standfirst, and the table as it
// stood. Laid out at SHARE_BASE points and captured at SHARE_WIDTH pixels, so
// the image is big and sharp on any phone.
const SHARE_BASE = 360
const SHARE_WIDTH = 1080

function StoryShareCard({ headline, standfirst, story, colourway }: {
  headline: string; standfirst: string; story: Story; colourway: string[]
}) {
  return (
    <View style={[shareStyles.ground, { backgroundColor: roles.bg }]}>
      <View style={shareStyles.wrap}>
        <View style={[shareStyles.offset, { backgroundColor: roles.offset }]} />
        <View style={[shareStyles.label, { backgroundColor: roles.surface, borderColor: roles.line }]}>
          <Rivets color={roles.line} />
          <Tape colours={colourway} roles={roles} vertical thickness={border.tape} style={shareStyles.tape} />
          <View style={shareStyles.body}>
            <View style={shareStyles.top}>
              <KitText t="tag" color={roles.textMuted}>{`MATCHDAY ${story.matchday} OF ${story.totalMatchdays}`}</KitText>
              {story.involvesPlayer && <Tag roles={roles} variant="you">YOUR XI</Tag>}
            </View>
            <KitText t="superM" color={roles.text}>{headline.toUpperCase()}</KitText>
            <KitText t="body" color={roles.textMuted}>{standfirst}</KitText>
            <View style={[shareStyles.table, { borderTopColor: roles.line }]}>
              {story.rows.map(r => (
                <View key={r.clubId} style={[shareStyles.row, r.isPlayer && { backgroundColor: roles.yours }]}>
                  <KitText t="figure" color={roles.textMuted} style={shareStyles.pos}>{String(r.pos)}</KitText>
                  <ClubName roles={roles} clubId={r.clubId} name={r.clubName} size={16} style={{ flex: 1 }} />
                  <KitText t="figure" color={roles.text} style={shareStyles.pts}>{`${r.points} PTS`}</KitText>
                </View>
              ))}
            </View>
          </View>
        </View>
      </View>
      <View style={shareStyles.brand}>
        <Wordmark roles={roles} size="superM" />
      </View>
    </View>
  )
}

const shareStyles = StyleSheet.create({
  ground: { width: SHARE_BASE, padding: space[4], gap: space[4] },
  wrap: { position: 'relative' },
  offset: { position: 'absolute', left: OFFSET, top: OFFSET, right: -OFFSET, bottom: -OFFSET },
  label: { borderWidth: border.plate, flexDirection: 'row', overflow: 'hidden' },
  tape: { alignSelf: 'stretch' },
  body: { flex: 1, padding: space[4], gap: space[2] },
  top: { flexDirection: 'row', alignItems: 'center', gap: space[2] },
  table: { borderTopWidth: border.thin, marginTop: space[2], paddingTop: space[1] },
  row: { flexDirection: 'row', alignItems: 'center', gap: space[2], minHeight: 30 },
  pos: { width: 22, textAlign: 'right' },
  pts: { minWidth: 56, textAlign: 'right' },
  brand: { alignItems: 'flex-start' },
})

const styles = StyleSheet.create({
  match: { gap: space[2] },
  matchRow: { flexDirection: 'row', alignItems: 'center', gap: space[3] },
  matchSide: { flex: 1, gap: 4 },
  offscreen: { position: 'absolute', left: -10000, top: 0 },
  head: { minHeight: 28 },
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
