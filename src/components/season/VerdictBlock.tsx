import { countryName } from '@/data/countries-sk'
import { t, num, dec, numText } from '@/i18n'
import { label } from '@/i18n/labels'
import { ordinal } from '@/lib/format'
import React, { useEffect, useMemo, useRef, useState } from 'react'
import { time } from '@/diag/perf'
import { useReducedMotion } from '@/hooks/useReducedMotion'
import type { PunditTournament } from '@/engine/cup-calls'
import { punditPanel, punditRatings, type PredictionTeam } from '@/engine/predictions'
import { PunditRail } from '@/components/season/PunditRail'
import { GroupWall, LeagueTable, SegmentSwitch, CL_PHASE_ZONES, type MiniGroup, type TableRowVM } from '@/components/season/SeasonParts'
import { BracketTree, type BracketColumn } from '@/components/BracketTree'
import { View, Pressable, StyleSheet, Platform } from 'react-native'
import Animated, { FadeIn } from 'react-native-reanimated'
import { ROLES, space, border, prim, type Roles } from '@/theme'
import { KitText, Plate, Tag, Tape, Rivets, H2, Icon, TeamMark, Twinkle } from '@/components/kit'
import { useRunOwner, RunOwnerLine, ShareOwner, ownerPrefix } from '@/components/profile/ProfileParts'
import { shareRunLabel, shareRunLink, runLink } from '@/lib/shareRun'
import { punditsSummary, callOf, type PunditRow } from '@/lib/punditsSummary'
import { useGameStore } from '@/store/gameStore'
import { EVERYDAY } from '@/lib/appearance'
import { scoreBreakdown, type RunRow } from '../../../supabase/functions/_shared/score'

// D1 · The verdict (docs/ui-overhaul/07d), one treatment for every mode. The
// tier lands as a super on a riveted label: Perfection wears the volt tape,
// Misery wears the hazard stripe, everything else wears its colourway. The
// score and the multiplier that earned it sit underneath, then what the
// pundits said before a ball was kicked, then the share label (D11).
const roles = ROLES[EVERYDAY]

export type VerdictTone = 'perfection' | 'misery' | 'middle'

export function VerdictBlock({
  tone, title, line, meta, score, multiplier, pundits, punditsText, shareText, runId, ownerId, scoreRow,
}: {
  tone: VerdictTone
  title: string            // the tier, as the shared registry names it
  line?: string            // one sentence about the season
  meta?: string            // "Premier League 2024/25 · You took over Everton"
  score?: number
  multiplier?: number      // the difficulty multiplier the score was earned at
  /** What the pundits predicted, and what really happened (league tables). */
  pundits?: { predicted: number; actual: number; field: number }
  /** The same check in words, for the cups, where they call a round not a place. */
  punditsText?: string
  shareText: string
  /** A saved run opened from history; a live run's id comes from the store once saved. */
  runId?: string
  /** P8-89: the saved run's owner (runs.user_id). Left out for the run you just played. */
  ownerId?: string | null
  /** P8.5-41: a saved run's row, for its points; the run you just played reads the store's. */
  scoreRow?: RunRow | null
}) {
  const reduced = useReducedMotion()
  const card = useRef<View>(null)
  const [shared, setShared] = useState<null | 'shared' | 'copied' | 'unavailable'>(null)

  // P8-89: every run says whose it is, on the page, on the card and in the
  // shared text; your own says it's yours.
  const owner = useRunOwner(ownerId)
  const whose = ownerPrefix(owner)
  // Read as a hook, so the link appears the moment a live run's save lands.
  const savedRunId = useGameStore(s => s.savedRunId)
  const liveRow = useGameStore(s => s.savedRunRow)
  const points = useMemo(() => {
    const row = scoreRow !== undefined ? scoreRow : liveRow
    return row ? scoreBreakdown(row as RunRow) : null
  }, [scoreRow, liveRow])
  const [showHow, setShowHow] = useState(false)
  // The tier is set at superXl (72) and wraps only at spaces, so one long word
  // ran off a phone's card: RESPECTABLE MEDIOCRITY lost its E (found filming
  // the trailer, 3 Oct 2026), and Slovak tiers run longer. Size it so the
  // longest word fits the row: Barlow Condensed 900 caps average ~0.5em a letter.
  const [titleW, setTitleW] = useState(0)
  const longest = Math.max(...title.split(/\s+/).map(w => w.length), 1)
  const titleSize = titleW > 0 ? Math.min(72, Math.floor(titleW / (longest * 0.52))) : 72
  const link = runLink(runId ?? savedRunId)
  const text = whose ? `${whose}: ${shareText}` : shareText
  async function share() {
    // On the web this is one share, the words and the link; on a phone the
    // picture (the link has its own plate, P8-121).
    setShared(await shareRunLabel(card.current as never, link ? `${text} ${link}` : text))
  }

  return (
    <View style={styles.wrap}>
      <RunOwnerLine roles={roles} owner={owner} />
      <Animated.View
        ref={card}
        entering={reduced ? undefined : FadeIn.duration(220)}
        style={[styles.card, { borderColor: roles.line, backgroundColor: roles.surface }]}
        accessible
        accessibilityRole="header"
        accessibilityLabel={t('verdict.cardA11y', { title, line: line ?? '', points: score != null ? t('verdict.pointsA11y', { n: score }) : '' })}
      >
        <Rivets color={roles.line} />
        {/* P8-111: Misery's edge is red, not the stripe. */}
        {tone === 'misery'
          ? <View style={[styles.edge, { backgroundColor: roles.loss }]} />
          : <Tape colours={[tone === 'perfection' ? roles.perfection : roles.you]} roles={roles} vertical thickness={border.tape} style={styles.edge} />}

        <View style={styles.body}>
          {/* P8.5-04: the card is what gets shared, so it names whose run it is
              with their picture, name and club, never just "YOUR RUN" (which
              told whoever received it nothing). */}
          <ShareOwner roles={roles} owner={owner} />
          {/* P8.5-41: the points, big, under whose run it is, and how they were made. */}
          {points && (
            <View style={styles.points}>
              <Pressable onPress={() => setShowHow(v => !v)} accessibilityRole="button" accessibilityState={{ expanded: showHow }}
                accessibilityLabel={t('verdict.howA11y', { n: points.total, action: showHow ? t('verdict.hide') : t('verdict.show') })}
                style={({ pressed }) => [styles.pointsRow, pressed && { opacity: 0.7 }]}>
                <KitText t="tag" color={roles.textMuted}>{t('verdict.pts')}</KitText>
                <KitText t="figureL" color={roles.text}>{num(points.total)}</KitText>
                <View style={{ transform: [{ rotate: showHow ? '-90deg' : '90deg' }] }}><Icon name="chevron" size={16} color={roles.textMuted} /></View>
              </Pressable>
              {showHow && (
                <View style={[styles.how, { borderTopColor: roles.rule }]}>
                  {points.lines.map(l => (
                    <View key={l.label} style={styles.howRow}>
                      <KitText t="body" color={roles.textMuted} style={{ flex: 1 }}>{label(l.label)}</KitText>
                      <KitText t="figure" color={roles.text}>{numText(l.value)}</KitText>
                    </View>
                  ))}
                  <View style={styles.howRow}>
                    <KitText t="body" color={roles.text} style={{ flex: 1 }}>{t('verdict.points')}</KitText>
                    <KitText t="figure" color={roles.text}>{num(points.total)}</KitText>
                  </View>
                </View>
              )}
            </View>
          )}
          <View style={styles.titleRow} onLayout={e => setTitleW(e.nativeEvent.layout.width - (tone === 'perfection' ? 32 : 0))}>
            <KitText t="superXl" color={roles.text} style={[styles.title, { flexShrink: 1, fontSize: titleSize, lineHeight: titleSize }]}>{title.toUpperCase()}</KitText>
            {/* P8-145: Perfection lives a little. */}
            {tone === 'perfection' && <Twinkle />}
          </View>
          {line ? <KitText t="bodyL" color={roles.text}>{line}</KitText> : null}
          {meta ? <KitText t="tag" color={roles.textMuted}>{meta}</KitText> : null}

          {score != null && !points && (
            <View style={styles.scoreRow}>
              <KitText t="figureL" color={roles.text}>{String(score)}</KitText>
              <KitText t="tag" color={roles.textMuted}>{t('verdict.pointsTag')}</KitText>
              {multiplier != null && multiplier !== 1 && (
                <Tag roles={roles}>{t('verdict.hardness', { m: dec(multiplier, 2) })}</Tag>
              )}
            </View>
          )}

          {(pundits || punditsText) && (
            <View style={[styles.pundits, { borderTopColor: roles.rule }]}>
              <KitText t="tag" color={roles.textMuted}>{t('verdict.thePundits')}</KitText>
              {pundits ? (
                <>
                  <KitText t="bodyL" color={roles.text}>
                    {t('verdict.theyHadYou', { tipped: ordinal(pundits.predicted), actual: ordinal(pundits.actual) })}
                  </KitText>
                  <KitText t="body" color={roles.textMuted}>{punditVerdict(pundits)}</KitText>
                </>
              ) : (
                <KitText t="bodyL" color={roles.text}>{punditsText}</KitText>
              )}
            </View>
          )}
        </View>
      </Animated.View>

      <Plate label={shared === 'copied' ? t('verdict.copied') : shared === 'unavailable' ? t('verdict.sharingOff') : Platform.OS === 'web' ? t('verdict.shareRun') : t('verdict.sharePicture')}
        icon="forward" variant="secondary" roles={roles} onPress={share} disabled={shared === 'unavailable'} />
      {/* P8-121: a link opens the run, in the app where it's installed and on
          the web where it isn't. Only a saved run has one. */}
      {Platform.OS !== 'web' && <ShareLinkPlate roles={roles} runId={runId ?? savedRunId} text={text} waiting={!runId && !savedRunId && !!liveRow} />}
    </View>
  )
}


function punditVerdict({ predicted, actual, field }: { predicted: number; actual: number; field: number }): string {
  const by = predicted - actual
  if (by >= Math.max(3, field / 6)) return t('verdict.beatCall', { n: by })
  if (by > 0) return t('verdict.better', { count: by })
  if (by === 0) return t('verdict.exactly')
  if (-by >= Math.max(3, field / 6)) return t('verdict.muchWorse', { n: -by })
  return t('verdict.worse', { count: -by })
}

// P8-121: the run's link as its own share (a phone's sheet can't carry the
// picture and the text together). The verdict shows it beside the picture;
// the run hub on its own. P8.5-41: while the save is on its way (`waiting`) it
// shows already, held, saying the link is coming, instead of appearing later;
// nothing when the run is never saved (a guest's).
export function ShareLinkPlate({ roles, runId, text, waiting }: { roles: Roles; runId?: string | null; text: string; waiting?: boolean }) {
  const [state, setState] = useState<null | 'shared' | 'copied' | 'unavailable'>(null)
  const link = runLink(runId)
  if (!link && waiting) return <Plate label={t('verdict.linkSoon')} icon="forward" variant="secondary" roles={roles} disabled onPress={() => {}} />
  if (!link) return null
  return (
    <Plate label={state === 'copied' ? t('verdict.linkCopied') : state === 'unavailable' ? t('verdict.linkFailed') : t('verdict.shareLink')}
      icon="forward" variant="secondary" roles={roles} onPress={async () => setState(await shareRunLink(text, link))} />
  )
}

const styles = StyleSheet.create({
  points: { gap: space[1] },
  pointsRow: { flexDirection: 'row', alignItems: 'baseline', gap: space[2], alignSelf: 'flex-start', minHeight: 44 },
  how: { borderTopWidth: StyleSheet.hairlineWidth, paddingTop: space[2], gap: 2 },
  howRow: { flexDirection: 'row', alignItems: 'center', gap: space[2], minHeight: 28 },
  titleRow: { flexDirection: 'row', alignItems: 'flex-start', gap: space[2] },
  wrap: { gap: space[2], marginBottom: space[4] },
  card: { flexDirection: 'row', borderWidth: border.plate, overflow: 'hidden' },
  edge: { width: 12, alignSelf: 'stretch' },
  body: { flex: 1, padding: space[4], gap: space[2] },
  title: { marginBottom: space[1] },
  scoreRow: { flexDirection: 'row', alignItems: 'center', gap: space[2] },
  pundits: { borderTopWidth: border.hair, paddingTop: space[2], gap: 2 },
})

// ── The pundits' calls, coloured (P8-38) ────────────────────────────────────
// Better than tipped in volt, worse in misery red, and an exact call in gold
// with a sparkle that twinkles now and then — the small "wow" the table asked
// for. The twinkle is staggered by row so the golds don't pulse in unison.
const callColour = (off: number) => off > 0 ? (roles.perfectionText ?? roles.text) : off < 0 ? roles.lossText : prim.gold

// The sparkle is the kit's Twinkle now (P8-145), shared with every other place that lives.
const Sparkle = ({ i }: { i: number }) => <Twinkle i={i} />

function Call({ off, label, i, spot }: { off: number; label: string; i: number; spot?: boolean }) {
  // A spot-on call breaks before its last words ("MEGA" over "SPOT ON").
  const spotWord = t('verdict.spotOn')
  const twoLines = label.endsWith(` ${spotWord}`)
  return (
    <View style={tableStyles.call}>
      {(spot ?? off === 0) && <Sparkle i={i} />}
      <KitText t="tag" color={callColour(off)} style={{ textAlign: 'right', flexShrink: 1 }}>
        {twoLines ? `${label.slice(0, -spotWord.length - 1)}\n${spotWord}` : label}
      </KitText>
    </View>
  )
}

// ── The pundits' table against the real one (P8-24) ─────────────────────────
// Every club, where it finished beside where the pundits had it, and by how
// much they were out. Sorted by the real finish; your row carries its surface.
// P8-122: the row and its summary live in src/lib/punditsSummary.ts (pure, so
// scripts/verify-predictions.ts can check the wording).
export type { PunditRow } from '@/lib/punditsSummary'

export function PunditsTable({ rows }: { rows: PunditRow[] }) {
  if (rows.length === 0) return null
  const sorted = [...rows].sort((a, b) => a.finalPosition - b.finalPosition)
  const withPoints = rows.some(r => r.predictedPoints != null && r.points != null)
  return (
    <View style={tableStyles.wrap}>
      <KitText t="superS" color={roles.text} accessibilityRole="header" {...H2}>{t('verdict.checked')}</KitText>
      {punditsSummary(rows).map((line, i) => (
        <KitText key={i} t="body" color={i === 0 ? roles.text : roles.textMuted}>{line}</KitText>
      ))}
      <View style={[tableStyles.row, tableStyles.head, { borderBottomColor: roles.line }]}>
        <KitText t="tag" color={roles.textMuted} style={tableStyles.pos}>#</KitText>
        <KitText t="tag" color={roles.textMuted} style={{ flex: 1 }}>{t('verdict.colClub')}</KitText>
        {withPoints && <KitText t="tag" color={roles.textMuted} style={tableStyles.pts}>{t('verdict.colPts')}</KitText>}
        <KitText t="tag" color={roles.textMuted} style={[tableStyles.diff, { textAlign: 'right' }]}>{t('verdict.colCall')}</KitText>
      </View>
      {sorted.map((r, i) => {
        const off = r.predicted - r.finalPosition   // positive = did better than tipped
        const call = callOf(r)
        return (
          <View key={r.clubId} style={[tableStyles.row, tableStyles.tall, { borderBottomColor: roles.rule }, r.isPlayer && { backgroundColor: roles.yours }]}
            accessible accessibilityLabel={t('verdict.rowA11y', { place: r.finalPosition, name: r.clubName, tipped: r.predicted }) + (r.predictedPoints != null ? t('verdict.onPoints', { n: r.predictedPoints }) : '') + (r.points != null ? t('verdict.finishedOn', { n: r.points }) : '')}>
            <KitText t="figure" color={roles.text} style={tableStyles.pos}>{String(r.finalPosition)}</KitText>
            {/* The club with its crest, and under it what they said. */}
            <View style={{ flex: 1, minWidth: 0 }}>
              <View style={tableStyles.club}>
                <TeamMark roles={roles} clubId={r.clubId} name={r.clubName} size={16} />
                <KitText t="body" color={roles.text} numberOfLines={1} style={{ flexShrink: 1 }}>{countryName(r.clubName)}</KitText>
              </View>
              <KitText t="tag" color={roles.textMuted}>
                {t('verdict.tipped', { place: ordinal(r.predicted).toUpperCase() }) + (r.predictedPoints != null ? t('verdict.tippedPts', { n: r.predictedPoints }) : '')}
              </KitText>
            </View>
            {/* More points than they tipped in volt, fewer in red, exactly theirs in gold. */}
            {withPoints && (
              <KitText t="figure" style={tableStyles.pts}
                color={r.points == null || r.predictedPoints == null ? roles.text : callColour(r.points - r.predictedPoints)}>
                {r.points != null ? String(r.points) : '–'}
              </KitText>
            )}
            <View style={tableStyles.diff}><Call i={i} off={call.spot ? 0 : off} spot={!!call.spot} label={call.label} /></View>
          </View>
        )
      })}
    </View>
  )
}

const tableStyles = StyleSheet.create({
  // P8-122: room above, so the heading can't run into the section before it.
  wrap: { gap: space[2], marginTop: space[6], marginBottom: space[4] },
  club: { flexDirection: 'row', alignItems: 'center', gap: space[1] },
  pts: { width: 36, textAlign: 'right' },
  row: { flexDirection: 'row', alignItems: 'center', gap: space[2], minHeight: 36, borderBottomWidth: border.hair, paddingHorizontal: space[1] },
  head: { borderBottomWidth: border.thin, minHeight: 28 },
  pos: { width: 24, textAlign: 'right' },
  pred: { width: 48, textAlign: 'right' },
  diff: { width: 104, alignItems: 'flex-end' },
  call: { flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', gap: 4, maxWidth: '100%' },
  round: { width: 96, textAlign: 'right' },
  tall: { minHeight: 48, paddingVertical: space[1] },
  more: { alignSelf: 'flex-start', borderWidth: border.thin, minHeight: 40, paddingHorizontal: space[3], justifyContent: 'center' },
})

// ── Their tournament, played out (P8-165) ────────────────────────────────────
// Each pundit's whole cup, played out before a ball is kicked from a draw of
// their own (src/engine/cup-calls.ts): their group tables with points, their
// bracket, their champion. The same tournament on the pundits screen, before
// the run, and on the result screens after it, where a switch puts theirs and
// what really happened in the same place, drawn with the same tables and the
// same bracket. (P8-24's long "checked" table and P8-56's list of real ties
// are gone: the maintainer, 28 September, "not worth it".)
export type ActualTournament = {
  /** The World Cup's real groups, as the screen's group wall draws them. */
  groups?: MiniGroup[]
  /** The Champions League's real league phase. */
  table?: TableRowVM[]
  bracket: { columns: BracketColumn[]; third?: BracketColumn }
}

/** One pundit's tournament, drawn: their groups or league phase, then their bracket. */
export function TheirTournament({ roles: r = roles, t: tour, name, playerClubId, flagOf }: {
  roles?: Roles
  t: PunditTournament
  name: string
  playerClubId?: string | null
  flagOf?: (clubId: string) => string | null
}) {
  const bracket = {
    columns: tour.rounds.map(round => ({
      key: round.key, label: round.label,
      ties: round.ties.map(x => ({
        a: { clubId: x.a.clubId, name: x.a.clubName, goals: String(x.goalsA) },
        b: { clubId: x.b.clubId, name: x.b.clubName, goals: String(x.goalsB) },
        winner: x.winner,
        // After the run: whether the side they sent through really got that far.
        note: x.real == null ? undefined : x.real ? t('verdict.rightThisFar') : t('verdict.wrongNotReal'),
      })),
    })),
  }
  return (
    <>
      {tour.tables.length > 1 ? (
        <GroupWall roles={r} groups={tour.tables.map(g => ({
          id: g.id, you: g.rows.some(x => x.isPlayer),
          rows: g.rows.map(x => ({ clubId: x.clubId, clubName: x.clubName, flag: flagOf?.(x.clubId), points: x.points, isPlayer: x.isPlayer })),
        }))} />
      ) : tour.tables[0] ? (
        <LeagueTable roles={r} zones={CL_PHASE_ZONES}
          rows={tour.tables[0].rows.map(x => ({ clubId: x.clubId, clubName: x.clubName, isPlayer: x.isPlayer, played: x.played, gd: x.gd, points: x.points }))} />
      ) : null}
      <KitText t="tag" color={r.textMuted} style={tourStyles.round}>{t('verdict.bracketOf', { name: name.toUpperCase() })}</KitText>
      <BracketTree {...bracket} playerClubId={playerClubId} height={440} />
    </>
  )
}

/** The pundits' tournaments on a result screen: whose (the rail), and theirs against what happened. */
export function PunditsPlayedOut({ field, seed, build, actual, playerClubId, flagOf }: {
  field: PredictionTeam[]
  seed: number
  /** The competition's own tournament, scored against the run's result. */
  build: (rating: Map<string, number>, seed: number) => PunditTournament
  actual: ActualTournament
  playerClubId?: string | null
  /** A nation's flag, for the World Cup's groups. */
  flagOf?: (clubId: string) => string | null
}) {
  // The field is rebuilt by the screen on every render; the tournaments only
  // change with the sides and the seed, so those are the key.
  const key = `${seed}:${field.map(f => f.clubId).join()}`
  const panel = useMemo(() => punditPanel(field, seed), [key])
  // Phase 9 (the maintainer, 25 Sept: opening the pundits' tournaments "lags the
  // phone badly"): every pundit's whole tournament was played out on the first
  // frame. Now the panel's is drawn at once and each pundit's follows, one a
  // frame, filling in the rail as it lands; each build is timed (pundits:build).
  const together = useMemo(() => time('pundits:build', () => build(punditRatings(field, seed), seed)), [key])
  const [theirs, setTheirs] = useState<{ key: string; tours: PunditTournament[] }>({ key, tours: [] })
  useEffect(() => {
    let alive = true
    const tours: PunditTournament[] = []
    setTheirs({ key, tours: [] })
    const next = () => {
      if (!alive || tours.length >= panel.length) return
      const p = panel[tours.length]
      tours.push(time('pundits:build', () => build(p.ratings, p.picksSeed)))
      setTheirs({ key, tours: [...tours] })
      setTimeout(next, 0)
    }
    const first = setTimeout(next, 0)
    return () => { alive = false; clearTimeout(first) }
  }, [key, panel])
  const versions: (PunditTournament | undefined)[] = [together, ...panel.map((_, i) => theirs.key === key ? theirs.tours[i] : undefined)]
  const [who, setWho] = useState(0)          // 0: the panel together; i: the (i − 1)th pundit
  const [view, setView] = useState<'theirs' | 'real'>('theirs')
  // A pundit not built yet shows the panel's tournament for the moment it takes.
  const tour = versions[who] ?? together
  if (!tour) return null
  const name = who === 0 ? t('verdict.thePanel') : panel[who - 1].name
  const sc = tour.score
  const scoreLine = (x: PunditTournament) => x.score ? t('verdict.throughLine', { q: x.score.qualified, qOf: x.score.qualifiedOf, t: x.score.through, ties: x.score.ties }) : ''
  return (
    <View style={tableStyles.wrap}>
      <KitText t="superS" color={roles.text} accessibilityRole="header" {...H2}>{t('verdict.tournamentTitle')}</KitText>
      <KitText t="body" color={roles.textMuted}>
        {t('verdict.tournamentIntro') + t('verdict.hadChampions', { who: who === 0 ? t('verdict.panelTogether') : name, champion: tour.champion.isPlayer ? t('verdict.youLower') : tour.champion.clubName })
          + (sc?.champion ? t('verdict.wasRight') : '') + '.'
          + (sc ? t('verdict.scoreQualified', { q: sc.qualified, qOf: sc.qualifiedOf }) + (sc.places != null ? t('verdict.scorePlaces', { n: sc.places }) : '') + t('verdict.scoreThrough', { t: sc.through, ties: sc.ties }) : '')}
      </KitText>
      <PunditRail roles={roles} selected={who} onSelect={setWho}
        cards={[
          { key: 'panel', top: t('verdict.all', { n: panel.length }), title: t('verdict.thePanel'), lines: [t('verdict.champions', { name: together.champion.isPlayer ? t('verdict.you') : together.champion.clubName.toUpperCase() }), scoreLine(together)],
            accessibilityLabel: t('verdict.panelA11y', { name: together.champion.clubName }) },
          ...panel.map((p, i) => {
            const v = versions[i + 1]
            return {
              key: p.name, country: p.country, title: p.name,
              lines: v ? [t('verdict.champions', { name: v.champion.isPlayer ? t('verdict.you') : v.champion.clubName.toUpperCase() }), scoreLine(v)] : ['…'],
              accessibilityLabel: v ? t('verdict.punditA11y', { name: p.name, country: p.country, champion: v.champion.clubName }) : p.name,
            }
          }),
        ]} />
      <SegmentSwitch<'theirs' | 'real'> roles={roles} value={view} onChange={setView}
        options={[{ id: 'theirs', label: who === 0 ? t('verdict.panels') : t('verdict.theirs', { name: panel[who - 1].name.split(' ')[0] }) }, { id: 'real', label: t('verdict.whatHappened') }]} />
      {view === 'theirs' ? (
        <TheirTournament t={tour} name={name} playerClubId={playerClubId} flagOf={flagOf} />
      ) : (
        <>
          {actual.groups ? <GroupWall roles={roles} groups={actual.groups} />
            : actual.table ? <LeagueTable roles={roles} rows={actual.table} zones={CL_PHASE_ZONES} /> : null}
          <KitText t="tag" color={roles.textMuted} style={tourStyles.round}>{t('verdict.realBracket')}</KitText>
          <BracketTree {...actual.bracket} playerClubId={playerClubId} height={440} />
        </>
      )}
    </View>
  )
}

const tourStyles = StyleSheet.create({
  round: { marginTop: space[3], marginBottom: space[1] },
})
