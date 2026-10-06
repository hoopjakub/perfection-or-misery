// A table or group stage's round view, drawn once (centralisation step 4b).
// The league season, the Champions League's league phase, the World Cup
// groups and the full path's domestic season and league phase each laid this
// out by hand: the line under the header, where you stand, the matchday
// strip with its lookback, your match (live or as a card), the tabs on a phone
// and the panes on a wide window, and "your match first" while it plays. Every
// gap step 4 closed (a lookback, a standing figure, a Fixtures tab, panes) was
// one of those copies missing what another had. A screen now says what goes
// in each slot and nothing about how they're laid out.
import { t } from '@/i18n'
import React from 'react'
import { View } from 'react-native'
import { space, type Roles } from '@/theme'
import { KitText, PaneRow, Pane } from '@/components/kit'
import { StandingFigure, SeasonStrip, SegmentSwitch, type Mark, type TableZone } from './SeasonParts'
import { BackToLive } from './RunChrome'
import { WebKeys } from '@/lib/webKeys'

export type StagePane = {
  id: string
  /** The tab's label on a phone. */
  label: string
  /** The pane's heading on a wide window (the label when absent). */
  title?: string
  count?: number
  flex?: number
  node: React.ReactNode
  /** On a wide window: something else to show (null leaves the pane out,
   *  when another pane already carries it). */
  wideNode?: React.ReactNode | null
  /** Where it stands on a wide window, left to right (the tab order when absent). */
  wideOrder?: number
}

export function TableStage({
  roles, meta, note, standing, strip, keys, beforeStrip, yourMatch, afterMatch, panes, tab, onTab, wide, waiting,
}: {
  roles: Roles
  /** The tag line under the header: competition, season, matchday. */
  meta: string
  note?: React.ReactNode
  standing?: { pos: number; delta: number | null; zone: TableZone | null; points: number } | null
  /** The matchday strip and its lookback; `latest` is the newest matchday the arrows can reach. */
  strip: { marks: Mark[]; total: number; viewing: number | null; onPick: (md: number | null) => void; latest: number }
  /** Web keys (10-ADAPT §2.3): Space or Enter plays and pauses, the arrows scrub
   *  the strip. Only the league season had them. */
  keys?: { playPause: () => void }
  beforeStrip?: React.ReactNode
  /** Your match: the panel's line and the live match or its card. */
  yourMatch?: React.ReactNode
  afterMatch?: React.ReactNode
  panes: StagePane[]
  tab: string
  onTab: (id: string) => void
  wide: boolean
  /** Your match is still playing: the table and the round wait for it. */
  waiting?: boolean
}) {
  const shown = wide
    ? panes.map((p, i) => ({ p, at: p.wideOrder ?? i })).filter(x => x.p.wideNode !== null).sort((a, b) => a.at - b.at).map(x => x.p)
    : panes
  return (
    <>
      {keys && (
        <WebKeys onKey={k => {
          if (k === ' ' || k === 'Enter') keys.playPause()
          else if ((k === 'ArrowLeft' || k === 'ArrowRight') && strip.latest > 0) {
            const md = Math.min(strip.latest, Math.max(1, (strip.viewing ?? strip.latest) + (k === 'ArrowLeft' ? -1 : 1)))
            strip.onPick(md === strip.latest ? null : md)
          }
        }} />
      )}
      <KitText t="tag" color={roles.textMuted}>{meta}</KitText>
      {note}
      {standing && <StandingFigure roles={roles} {...standing} />}
      {beforeStrip}
      <SeasonStrip roles={roles} marks={strip.marks} total={strip.total} viewing={strip.viewing} onPick={strip.onPick} />
      {strip.viewing != null && <BackToLive md={strip.viewing} onPress={() => strip.onPick(null)} />}
      {yourMatch}
      {afterMatch}
      {!wide && <SegmentSwitch<string> roles={roles} value={tab} onChange={onTab}
        options={panes.map(p => ({ id: p.id, label: p.label, count: p.count }))} />}
      {waiting && strip.viewing == null ? (
        <KitText t="body" color={roles.textMuted} style={{ paddingVertical: space[3] }}>{t('sim.yourMatchFirst')}</KitText>
      ) : (
        <PaneRow wide={wide}>
          {shown.filter(p => wide || tab === p.id).map(p => (
            <Pane key={p.id} wide={wide} title={p.title ?? p.label} flex={p.flex}>
              <View>{wide && p.wideNode !== undefined ? p.wideNode : p.node}</View>
            </Pane>
          ))}
        </PaneRow>
      )}
    </>
  )
}
