// The one result screen (Wave F, centralisation step 6;
// docs/audit-2026-10/08-RESULT-PAGES.md §3 and its shape, §10). Every mode
// ends here: the verdict, one row of figures, the run's story in one to three
// rows, and a door into each part of the run hub. Four screens of 13 to 20
// blocks each drew the whole run inline; the depth now lives in the hub, one
// tap away, and Play again is never more than a thumb away.
//
// Phone: one column, and the actions in a bar pinned to the bottom (never a
// second copy under the verdict). Wide: the verdict, its figures and the
// actions in the left third; the story and the doors side by side on the right.
import { t } from '@/i18n'
import React from 'react'
import { View, StyleSheet } from 'react-native'
import { ROLES, space } from '@/theme'
import { EVERYDAY } from '@/lib/appearance'
import { KitScreen, ListRow, SectionTag, PaneRow, Pane, type IconName } from '@/components/kit'
import { ThumbBar } from './RunChrome'
import { ResultFigures } from './ResultParts'
import { ModeBanner } from './ModeBanner'
import { useSizeClass } from '@/hooks/useSizeClass'
import { runHighlights, resultDoors, type Highlight, type Door } from '@/lib/resultStory'
import { useRunData } from '@/lib/runData'
import { punditsLine, europeLine, hasEurope } from './RunMore'
import { openRunMatch, openPlayer, openClub, openStory, openRunHub } from '@/lib/runNav'
import { openAwardsView } from '@/lib/awardsNight'
import type { AwardsNight } from '@/engine/awards'

const roles = ROLES[EVERYDAY]

const STORY_ICON: Record<Highlight['kind'], IconName> = {
  decider: 'modeLeague', settled: 'modeLeague', bestWin: 'up', final: 'trophy', exit: 'down',
  star: 'sparkle', gotAway: 'retry', rival: 'clubs', headline: 'press',
}
const DOOR_ICON: Record<Door['id'], IconName> = {
  table: 'ranks', bracket: 'trophy', season: 'runs', cup: 'trophy', pundits: 'guide', awards: 'achievements', squad: 'you', europe: 'modeWorldCup',
}

export function ResultShell({ mode, runId, night, verdict, figures, actions }: {
  mode: string | null | undefined
  /** A saved run's id; absent for the run just played. */
  runId?: string
  /** The awards, for their door (the awards page shows them without the ceremony). */
  night?: AwardsNight | null
  /** The VerdictBlock: tier, line, score, the pundits' check, share. */
  verdict: React.ReactNode
  figures: [label: string, value: string | number][]
  /** ResultActions: Play again and Home, or Back on a saved run, with the save's state. */
  actions: React.ReactNode
}) {
  const wide = useSizeClass() === 'expanded'
  // The story and the doors read the run the hub reads (RunData). Until it's
  // in, the verdict and the actions stand alone; no placeholder rows.
  const { data } = useRunData(runId)
  const story = data ? runHighlights(data, { gotAway: data.more.gotAway }) : []
  const doors = data ? resultDoors(data, { pundits: punditsLine(data), europe: hasEurope(data) ? europeLine(data) : null, awards: !!night }) : []
  const onStory = (h: Highlight) => {
    const x = h.subject
    if (x.type === 'match' && data) openRunMatch(data, x.match)
    else if (x.type === 'player') openPlayer(x.playerId, runId)
    else if (x.type === 'club') openClub(x.clubId, runId)
    else if (x.type === 'story') openStory(x.storyId, runId)
  }
  const onDoor = (d: Door) => {
    if (d.id === 'awards') { if (night) openAwardsView(night, runId); return }
    openRunHub(d.id, runId)
  }
  const head = (
    <>
      {/* P8-169: Chaos and Cursed carry their look to the verdict. */}
      <ModeBanner roles={roles} mode={mode} />
      {verdict}
      <ResultFigures items={figures} />
    </>
  )
  const storyRows = story.length > 0 ? (
    <View style={styles.section}>
      {!wide && <SectionTag roles={roles}>{t('res.story')}</SectionTag>}
      {story.map(h => <ListRow key={h.kind} roles={roles} tier="t1" icon={STORY_ICON[h.kind]} label={h.label} value={h.value} onPress={() => onStory(h)} />)}
    </View>
  ) : null
  const doorRows = (
    <View style={styles.section}>
      {!wide && <SectionTag roles={roles}>{t('res.rest')}</SectionTag>}
      {doors.map(d => <ListRow key={d.id} roles={roles} icon={DOOR_ICON[d.id]} label={d.label} value={d.value} onPress={() => onDoor(d)} />)}
    </View>
  )
  if (wide) {
    return (
      <KitScreen ground={EVERYDAY} width="wide">
        <PaneRow wide>
          <Pane wide title="" flex={1}>
            {head}
            <View style={styles.actions}>{actions}</View>
          </Pane>
          {story.length > 0 && <Pane wide title={t('res.story')} flex={1}>{storyRows}</Pane>}
          <Pane wide title={t('res.rest')} flex={1}>{doorRows}</Pane>
        </PaneRow>
      </KitScreen>
    )
  }
  return (
    <View style={[styles.fill, { backgroundColor: roles.bg }]}>
      {/* Room under the last row, so the pinned bar never covers it. */}
      <KitScreen ground={EVERYDAY} contentStyle={{ paddingBottom: space[8] * 2 }}>
        {head}
        {storyRows}
        {doorRows}
      </KitScreen>
      <ThumbBar>{actions}</ThumbBar>
    </View>
  )
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  section: { gap: space[1], marginTop: space[6] },
  actions: { marginTop: space[5] },
})
