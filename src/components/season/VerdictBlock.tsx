import React, { useMemo, useRef, useState } from 'react'
import { useReducedMotion } from '@/hooks/useReducedMotion'
import type { PunditTournament } from '@/engine/cup-calls'
import { punditPanel, punditRatings, type PredictionTeam } from '@/engine/predictions'
import { PunditRail } from '@/components/season/PunditRail'
import { GroupWall, LeagueTable, SegmentSwitch, CL_PHASE_ZONES, type MiniGroup, type TableRowVM } from '@/components/season/SeasonParts'
import { BracketTree, type BracketColumn } from '@/components/BracketTree'
import { View, Pressable, StyleSheet, Platform } from 'react-native'
import Animated, { FadeIn, useSharedValue, useAnimatedStyle, withRepeat, withSequence, withTiming, withDelay } from 'react-native-reanimated'
import { ROLES, space, border, prim, type Roles } from '@/theme'
import { KitText, Plate, Tag, Tape, Stripe, Rivets, H2, Icon, TeamMark, Twinkle } from '@/components/kit'
import { useRunOwner, RunOwnerLine } from '@/components/profile/ProfileParts'
import { shareRunLabel, shareRunLink, runLink } from '@/lib/shareRun'
import { punditsSummary, callOf, type PunditRow } from '@/lib/punditsSummary'
import { useGameStore } from '@/store/gameStore'

// D1 · The verdict (docs/ui-overhaul/07d), one treatment for every mode. The
// tier lands as a super on a riveted label: Perfection wears the volt tape,
// Misery wears the hazard stripe, everything else wears its colourway. The
// score and the multiplier that earned it sit underneath, then what the
// pundits said before a ball was kicked, then the share label (D11).
const roles = ROLES.nylon

export type VerdictTone = 'perfection' | 'misery' | 'middle'

export function VerdictBlock({
  tone, title, line, meta, score, multiplier, pundits, punditsText, shareText, runId, ownerId,
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
}) {
  const reduced = useReducedMotion()
  const card = useRef<View>(null)
  const [shared, setShared] = useState<null | 'shared' | 'copied' | 'unavailable'>(null)

  // P8-89: every run says whose it is, on the page, on the card and in the
  // shared text; your own says it's yours.
  const owner = useRunOwner(ownerId)
  const whose = owner ? (owner.yours ? 'My run' : `${owner.name}'s run`) : null
  // Read as a hook, so the link appears the moment a live run's save lands.
  const savedRunId = useGameStore(s => s.savedRunId)
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
        accessibilityLabel={`${title}. ${line ?? ''} ${score != null ? `${score} points` : ''}`}
      >
        <Rivets color={roles.line} />
        {/* P8-111: Misery's edge is red, not the stripe. */}
        {tone === 'misery'
          ? <View style={[styles.edge, { backgroundColor: roles.loss }]} />
          : <Tape colours={[tone === 'perfection' ? roles.perfection : roles.you]} roles={roles} vertical thickness={border.tape} style={styles.edge} />}

        <View style={styles.body}>
          {owner && (
            <View style={styles.whose}>
              <KitText t="tag" color={roles.textMuted}>{owner.yours ? 'YOUR RUN' : `${owner.name.toUpperCase()}'S RUN`}</KitText>
              {owner.badgeTeamId && owner.badgeTeamName ? <TeamMark roles={roles} clubId={owner.badgeTeamId} name={owner.badgeTeamName} size={16} /> : null}
            </View>
          )}
          <View style={styles.titleRow}>
            <KitText t="superXl" color={roles.text} style={[styles.title, { flexShrink: 1 }]}>{title.toUpperCase()}</KitText>
            {/* P8-145: Perfection lives a little. */}
            {tone === 'perfection' && <Twinkle />}
          </View>
          {line ? <KitText t="bodyL" color={roles.text}>{line}</KitText> : null}
          {meta ? <KitText t="tag" color={roles.textMuted}>{meta}</KitText> : null}

          {score != null && (
            <View style={styles.scoreRow}>
              <KitText t="figureL" color={roles.text}>{String(score)}</KitText>
              <KitText t="tag" color={roles.textMuted}>POINTS</KitText>
              {multiplier != null && multiplier !== 1 && (
                <Tag roles={roles}>{`×${multiplier.toFixed(2)} HARDNESS`}</Tag>
              )}
            </View>
          )}

          {(pundits || punditsText) && (
            <View style={[styles.pundits, { borderTopColor: roles.rule }]}>
              <KitText t="tag" color={roles.textMuted}>The pundits</KitText>
              {pundits ? (
                <>
                  <KitText t="bodyL" color={roles.text}>
                    {`They had you ${ordinal(pundits.predicted)}. You finished ${ordinal(pundits.actual)}.`}
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

      <Plate label={shared === 'copied' ? 'Copied' : shared === 'unavailable' ? 'Sharing is off on this device' : Platform.OS === 'web' ? 'Share this run' : 'Share the picture'}
        icon="forward" variant="secondary" roles={roles} onPress={share} disabled={shared === 'unavailable'} />
      {/* P8-121: a link opens the run, in the app where it's installed and on
          the web where it isn't. Only a saved run has one. */}
      {Platform.OS !== 'web' && <ShareLinkPlate roles={roles} runId={runId ?? savedRunId} text={text} />}
    </View>
  )
}

const ordinal = (n: number) => {
  const s = ['th', 'st', 'nd', 'rd'], v = n % 100
  return `${n}${s[(v - 20) % 10] ?? s[v] ?? s[0]}`
}

function punditVerdict({ predicted, actual, field }: { predicted: number; actual: number; field: number }): string {
  const by = predicted - actual
  if (by >= Math.max(3, field / 6)) return `You beat their call by ${by} places. Nobody saw that coming.`
  if (by > 0) return `${by} ${by === 1 ? 'place' : 'places'} better than they said.`
  if (by === 0) return 'Exactly where they said you would be.'
  if (-by >= Math.max(3, field / 6)) return `${-by} places worse than they said. They were kind.`
  return `${-by} ${-by === 1 ? 'place' : 'places'} worse than they said.`
}

// P8-121: the run's link as its own share (a phone's sheet can't carry the
// picture and the text together). The verdict shows it beside the picture;
// the run hub on its own. Nothing when the run isn't saved yet.
export function ShareLinkPlate({ roles, runId, text }: { roles: Roles; runId?: string | null; text: string }) {
  const [state, setState] = useState<null | 'shared' | 'copied' | 'unavailable'>(null)
  const link = runLink(runId)
  if (!link) return null
  return (
    <Plate label={state === 'copied' ? 'Link copied' : state === 'unavailable' ? "The link couldn't be shared" : 'Share the link'}
      icon="forward" variant="secondary" roles={roles} onPress={async () => setState(await shareRunLink(text, link))} />
  )
}

const styles = StyleSheet.create({
  titleRow: { flexDirection: 'row', alignItems: 'flex-start', gap: space[2] },
  whose: { flexDirection: 'row', alignItems: 'center', gap: space[2] },
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
  const twoLines = / SPOT ON$/.test(label)
  return (
    <View style={tableStyles.call}>
      {(spot ?? off === 0) && <Sparkle i={i} />}
      <KitText t="tag" color={callColour(off)} style={{ textAlign: 'right', flexShrink: 1 }}>
        {twoLines ? label.replace(/ SPOT ON$/, '\nSPOT ON') : label}
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
      <KitText t="superS" color={roles.text} accessibilityRole="header" {...H2}>THE PUNDITS, CHECKED</KitText>
      {punditsSummary(rows).map((line, i) => (
        <KitText key={i} t="body" color={i === 0 ? roles.text : roles.textMuted}>{line}</KitText>
      ))}
      <View style={[tableStyles.row, tableStyles.head, { borderBottomColor: roles.line }]}>
        <KitText t="tag" color={roles.textMuted} style={tableStyles.pos}>#</KitText>
        <KitText t="tag" color={roles.textMuted} style={{ flex: 1 }}>Club</KitText>
        {withPoints && <KitText t="tag" color={roles.textMuted} style={tableStyles.pts}>Pts</KitText>}
        <KitText t="tag" color={roles.textMuted} style={[tableStyles.diff, { textAlign: 'right' }]}>Call</KitText>
      </View>
      {sorted.map((r, i) => {
        const off = r.predicted - r.finalPosition   // positive = did better than tipped
        const call = callOf(r)
        return (
          <View key={r.clubId} style={[tableStyles.row, tableStyles.tall, { borderBottomColor: roles.rule }, r.isPlayer && { backgroundColor: roles.yours }]}
            accessible accessibilityLabel={`${r.finalPosition}, ${r.clubName}, tipped ${r.predicted}${r.predictedPoints != null ? ` on ${r.predictedPoints} points` : ''}${r.points != null ? `, finished on ${r.points}` : ''}`}>
            <KitText t="figure" color={roles.text} style={tableStyles.pos}>{String(r.finalPosition)}</KitText>
            {/* The club with its crest, and under it what they said. */}
            <View style={{ flex: 1, minWidth: 0 }}>
              <View style={tableStyles.club}>
                <TeamMark roles={roles} clubId={r.clubId} name={r.clubName} size={16} />
                <KitText t="body" color={roles.text} numberOfLines={1} style={{ flexShrink: 1 }}>{r.clubName}</KitText>
              </View>
              <KitText t="tag" color={roles.textMuted}>
                {`TIPPED ${ordinal(r.predicted).toUpperCase()}${r.predictedPoints != null ? ` · ${r.predictedPoints} PTS` : ''}`}
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
export function TheirTournament({ roles: r = roles, t, name, playerClubId, flagOf }: {
  roles?: Roles
  t: PunditTournament
  name: string
  playerClubId?: string | null
  flagOf?: (clubId: string) => string | null
}) {
  const bracket = {
    columns: t.rounds.map(round => ({
      key: round.key, label: round.label,
      ties: round.ties.map(x => ({
        a: { clubId: x.a.clubId, name: x.a.clubName, goals: String(x.goalsA) },
        b: { clubId: x.b.clubId, name: x.b.clubName, goals: String(x.goalsB) },
        winner: x.winner,
        // After the run: whether the side they sent through really got that far.
        note: x.real == null ? undefined : x.real ? 'RIGHT: WENT THIS FAR' : 'WRONG: NOT FOR REAL',
      })),
    })),
  }
  return (
    <>
      {t.tables.length > 1 ? (
        <GroupWall roles={r} groups={t.tables.map(g => ({
          id: g.id, you: g.rows.some(x => x.isPlayer),
          rows: g.rows.map(x => ({ clubId: x.clubId, clubName: x.clubName, flag: flagOf?.(x.clubId), points: x.points, isPlayer: x.isPlayer })),
        }))} />
      ) : t.tables[0] ? (
        <LeagueTable roles={r} zones={CL_PHASE_ZONES}
          rows={t.tables[0].rows.map(x => ({ clubId: x.clubId, clubName: x.clubName, isPlayer: x.isPlayer, played: x.played, gd: x.gd, points: x.points }))} />
      ) : null}
      <KitText t="tag" color={r.textMuted} style={tourStyles.round}>{`${name.toUpperCase()}'S BRACKET`}</KitText>
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
  const versions = useMemo(() => [build(punditRatings(field, seed), seed), ...panel.map(p => build(p.ratings, p.picksSeed))], [key, panel])
  const [who, setWho] = useState(0)          // 0: the panel together; i: the (i − 1)th pundit
  const [view, setView] = useState<'theirs' | 'real'>('theirs')
  const t = versions[who]
  if (!t) return null
  const name = who === 0 ? 'The panel' : panel[who - 1].name
  const sc = t.score
  const scoreLine = (x: PunditTournament) => x.score ? `${x.score.qualified}/${x.score.qualifiedOf} THROUGH · ${x.score.through}/${x.score.ties} TIES` : ''
  return (
    <View style={tableStyles.wrap}>
      <KitText t="superS" color={roles.text} accessibilityRole="header" {...H2}>THE PUNDITS' TOURNAMENT</KitText>
      <KitText t="body" color={roles.textMuted}>
        {`Before a ball was kicked, each pundit drew the tournament their own way and played it out, backing the side they rated higher. ${who === 0 ? 'The panel together' : name} had ${t.champion.isPlayer ? 'you' : t.champion.clubName} as champions${sc?.champion ? ', and was right' : ''}.${sc ? ` ${sc.qualified} of the ${sc.qualifiedOf} they put through to the knockouts really got there${sc.places != null ? `, ${sc.places} league-phase places were exactly right` : ''}, and ${sc.through} of the ${sc.ties} sides they sent through a round really got that far.` : ''}`}
      </KitText>
      <PunditRail roles={roles} selected={who} onSelect={setWho}
        cards={[
          { key: 'panel', top: `ALL ${panel.length}`, title: 'The panel', lines: [`CHAMPIONS: ${versions[0].champion.isPlayer ? 'YOU' : versions[0].champion.clubName.toUpperCase()}`, scoreLine(versions[0])],
            accessibilityLabel: `The panel together: champions ${versions[0].champion.clubName}` },
          ...panel.map((p, i) => ({
            key: p.name, country: p.country, title: p.name,
            lines: [`CHAMPIONS: ${versions[i + 1].champion.isPlayer ? 'YOU' : versions[i + 1].champion.clubName.toUpperCase()}`, scoreLine(versions[i + 1])],
            accessibilityLabel: `${p.name}, ${p.country}: champions ${versions[i + 1].champion.clubName}. Open their tournament`,
          })),
        ]} />
      <SegmentSwitch<'theirs' | 'real'> roles={roles} value={view} onChange={setView}
        options={[{ id: 'theirs', label: who === 0 ? "The panel's" : `${panel[who - 1].name.split(' ')[0]}'s` }, { id: 'real', label: 'What happened' }]} />
      {view === 'theirs' ? (
        <TheirTournament t={t} name={name} playerClubId={playerClubId} flagOf={flagOf} />
      ) : (
        <>
          {actual.groups ? <GroupWall roles={roles} groups={actual.groups} />
            : actual.table ? <LeagueTable roles={roles} rows={actual.table} zones={CL_PHASE_ZONES} /> : null}
          <KitText t="tag" color={roles.textMuted} style={tourStyles.round}>THE REAL BRACKET</KitText>
          <BracketTree {...actual.bracket} playerClubId={playerClubId} height={440} />
        </>
      )}
    </View>
  )
}

const tourStyles = StyleSheet.create({
  round: { marginTop: space[3], marginBottom: space[1] },
})
