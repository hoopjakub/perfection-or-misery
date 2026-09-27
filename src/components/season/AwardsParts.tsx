// The awards, drawn (P4-A…G). One set of pieces for both places the awards
// appear: Awards Night, where they're read out one at a time at the end of a
// live run, and the verdict and history, where they're a plain section with no
// ceremony. A winner is always tappable and opens that player's season.
import type { LineAwardKey } from '@/types/stats'
import React, { useState } from 'react'
import { View, Pressable, StyleSheet } from 'react-native'
import { type Roles, space, border } from '@/theme'
import { KitText, Tag, SectionTag, Icon, RatingSquare, Pitch, Twinkle } from '@/components/kit'
import { getFormationRows } from '@/engine/formations'
import { clubCode } from '@/data/club-codes'
import type { AwardsNight, ClubAward, PickedTeam, PlayerAward, Pick } from '@/engine/awards'
import type { AwardCandidate } from '@/types/stats'

export type OpenPlayer = (playerId: string) => void

// ── A team, on a pitch, in its own shape ─────────────────────────────────────
// Rows run from the attack at the top to the keeper at the bottom, the way the
// formation reads out loud ("four-two-three-one"), with the bench beneath.
export function FormationPitch({ roles, team, onPlayer, showScores, caption = 'The shape the best players fit.', benchLabel = 'Honourable mentions', benchScores, scoreText }: {
  roles: Roles
  team: PickedTeam
  onPlayer?: OpenPlayer
  showScores?: 'score' | 'rating'
  /** Also the result pages' "Your lineup" (P8-104), which says its own thing. */
  caption?: string
  benchLabel?: string
  benchScores?: boolean   // the bench rows carry the figure too (your bench's OVR)
  /** What a figure says in place of the score: the ratings reveal's "??" until it's his turn. */
  scoreText?: (p: Pick) => string
}) {
  // Place each of the eleven into the formation's rows by slot label.
  const rows = getFormationRows(team.formation)
  const left = [...team.xi]
  const placed = rows.map(row => row.map(label => {
    const i = left.findIndex(x => x.slot.label === label)
    return i >= 0 ? left.splice(i, 1)[0] : null
  }))
  // Anything a row layout didn't claim (unusual labels) goes on the row it's closest to.
  if (left.length) placed[Math.floor(placed.length / 2)].push(...left)

  // A rating is the rating square (the same one everywhere); a season score
  // stays a plain figure. The team of the season shows both: its score decides
  // the pick, its square shows how he played.
  const figure = (p: Pick) => showScores === 'score' ? (scoreText ? scoreText(p) : String(p.score)) : null
  const bestId = showScores === 'rating' ? [...team.xi].sort((a, b) => (b.player.rating ?? 0) - (a.player.rating ?? 0))[0]?.player.id : undefined
  const rated = (p: Pick) => showScores !== undefined && p.rating != null

  return (
    <View style={styles.pitchWrap}>
      <View style={styles.pitchHead}>
        <Tag roles={roles} variant="selected">{team.formation}</Tag>
        <KitText t="body" color={roles.textMuted} style={{ flex: 1 }}>{caption}</KitText>
      </View>
      <Pitch rows={placed.map(row => row.map((x, i) => x ? (
              <Pressable key={x.player.id + i} disabled={!onPlayer} onPress={() => onPlayer?.(x.player.id)}
                accessibilityRole="button" accessibilityLabel={`${x.slot.label}, ${x.player.name}, ${x.player.clubName}`}
                style={({ pressed }) => [styles.shirt, { borderColor: x.player.isPlayerClub ? roles.you : roles.line, backgroundColor: pressed ? roles.bg : roles.surface }]}>
                <KitText t="tag" color={roles.textMuted}>{x.slot.label}</KitText>
                <KitText t="body" color={roles.text} numberOfLines={1} style={styles.shirtName}>{surname(x.player.name)}</KitText>
                {/* P8-34: where he plays, as the short code the rest of the app uses —
                    a team of the season is unreadable without it. */}
                <KitText t="tag" color={roles.textMuted} numberOfLines={1}>{clubCode(x.player.clubName)}</KitText>
                {figure(x.player) ? <KitText t="tag" color={roles.text}>{figure(x.player)}</KitText> : null}
                {rated(x.player) ? <RatingSquare value={x.player.rating!} size="sm" decimals={showScores === 'score' ? 2 : 1} /> : null}
                {/* P8-145: a round's best player lives a little, on the team of the matchday. */}
                {showScores === 'rating' && x.player.id === bestId ? <View style={styles.best}><Twinkle /></View> : null}
              </Pressable>
            ) : <View key={`gap${i}`} style={styles.shirtGap} />))} />
      {team.bench.length > 0 && (
        <View style={styles.bench}>
          <KitText t="tag" color={roles.textMuted}>{benchLabel}</KitText>
          {team.bench.map(p => (
            <Pressable key={p.id} disabled={!onPlayer} onPress={() => onPlayer?.(p.id)} accessibilityRole="button"
              style={({ pressed }) => [styles.benchRow, { borderBottomColor: roles.rule }, p.isPlayerClub && { backgroundColor: roles.yours }, pressed && { backgroundColor: roles.sunken }]}>
              <KitText t="tag" color={roles.textMuted} style={styles.benchPos}>{p.position}</KitText>
              <KitText t="body" color={roles.text} numberOfLines={1} style={{ flex: 1 }}>{p.name}</KitText>
              <KitText t="tag" color={roles.textMuted} numberOfLines={1}>{p.clubName}</KitText>
              {benchScores && figure(p) ? <KitText t="figure" color={roles.text}>{figure(p)}</KitText> : null}
              {rated(p) ? <RatingSquare value={p.rating!} size="sm" decimals={showScores === 'score' ? 2 : 1} /> : null}
              {/* P8-34: yours are marked by the row's background; a YOURS tag on
                  row after row said the same thing over and over (P8-23's rule). */}
            </Pressable>
          ))}
        </View>
      )}
    </View>
  )
}

const surname = (name: string) => name.split(' ').slice(-1)[0]

// ── One award ────────────────────────────────────────────────────────────────
export function PlayerAwardCard({ roles, award, onPlayer, big, said }: {
  roles: Roles
  award: PlayerAward
  onPlayer?: OpenPlayer
  big?: boolean
  /** Who the pundits named for this award before a ball was kicked. */
  said?: { playerId: string; name: string } | null
}) {
  const w = award.winner
  // The numbers that won it, for the awards decided on the whole season.
  // An award decided on its own score (defender, full-back, defensive
  // midfielder) shows that score's parts; the rest show the season score's.
  const parts = award.winner.lineBreakdowns?.[award.key as LineAwardKey] ?? award.winner.breakdown
  const showBreakdown = !['boot', 'playmaker', 'glove', 'motm', 'totr'].includes(award.key)
  return (
    <View style={styles.award}>
      <SectionTag roles={roles}>{award.title}</SectionTag>
      <Pressable disabled={!onPlayer} onPress={() => onPlayer?.(w.playerId)} accessibilityRole="button"
        accessibilityLabel={`${award.title}: ${w.name}, ${w.clubName}. ${award.headline(w)}`} accessibilityHint="Opens their page"
        style={({ pressed }) => [styles.winner, { borderColor: roles.line, backgroundColor: pressed ? roles.sunken : roles.surface }]}>
        <View style={styles.winnerTop}>
          <KitText t={big ? 'superL' : 'superM'} color={roles.text} numberOfLines={2} style={{ flex: 1 }}>{w.name.toUpperCase()}</KitText>
          {onPlayer && <Icon name="chevron" size={20} color={roles.text} />}
        </View>
        <View style={styles.winnerMeta}>
          <KitText t="body" color={roles.textMuted} style={{ flex: 1 }}>{`${w.clubName} · ${award.headline(w)}`}</KitText>
          {w.isPlayerClub && <Tag roles={roles} variant="you">YOURS</Tag>}
          {/* His season's average as the rating square, on the winner and every
              runner-up, so who was better reads from the colour (23 Sept). */}
          {w.avgRating != null && <RatingSquare value={w.avgRating} decimals={2} />}
        </View>
        {showBreakdown && parts && parts.length > 0 && (
          <View style={[styles.breakdown, { borderTopColor: roles.rule }]}>
            {/* P8-36: the right-hand column was unlabelled and read as noise. */}
            <View style={styles.partRow}>
              <KitText t="tag" color={roles.textMuted} style={{ flex: 1 }}>His season</KitText>
              <KitText t="tag" color={roles.textMuted}>Number</KitText>
              <KitText t="tag" color={roles.textMuted} style={styles.partPts}>Award pts</KitText>
            </View>
            {parts.slice(0, 5).map(p => (
              <View key={p.label} style={styles.partRow}>
                <KitText t="body" color={roles.text} style={{ flex: 1 }} numberOfLines={1}>{p.label}</KitText>
                <KitText t="figure" color={roles.textMuted}>{Number.isInteger(p.value) ? String(p.value) : p.value.toFixed(2)}</KitText>
                <KitText t="figure" color={p.points < 0 ? roles.textMuted : roles.text} style={styles.partPts}>
                  {`${p.points > 0 ? '+' : ''}${p.points}`}
                </KitText>
              </View>
            ))}
            <KitText t="body" color={roles.textMuted}>Award points: what each part of his season adds to the score this award is decided on, carried by how hard his club had it.</KitText>
          </View>
        )}
      </Pressable>
      {said ? (
        <KitText t="title" color={roles.text}>
          {said.playerId === w.playerId ? `The pundits called it: ${said.name}.` : `They said ${said.name}. It was ${w.name}.`}
        </KitText>
      ) : null}
      <KitText t="body" color={roles.textMuted}>{award.how}</KitText>
      {award.runnersUp.length > 0 && (
        <View>
          {award.runnersUp.map((c, i) => (
            <RunnerUp key={c.playerId} roles={roles} place={i + 2} c={c} line={award.headline(c)} onPlayer={onPlayer} />
          ))}
        </View>
      )}
    </View>
  )
}

function RunnerUp({ roles, place, c, line, onPlayer }: { roles: Roles; place: number; c: AwardCandidate; line: string; onPlayer?: OpenPlayer }) {
  return (
    <Pressable disabled={!onPlayer} onPress={() => onPlayer?.(c.playerId)} accessibilityRole="button"
      style={({ pressed }) => [styles.runner, { borderBottomColor: roles.rule }, pressed && { backgroundColor: roles.sunken }]}>
      <KitText t="figure" color={roles.textMuted} style={styles.runnerPos}>{String(place)}</KitText>
      <View style={{ flex: 1 }}>
        <KitText t="body" color={roles.text} numberOfLines={1}>{c.name}</KitText>
        <KitText t="tag" color={roles.textMuted} numberOfLines={1}>{`${c.clubName} · ${line}`}</KitText>
      </View>
      {c.isPlayerClub && <Tag roles={roles} variant="you">YOURS</Tag>}
      {c.avgRating != null && <RatingSquare value={c.avgRating} decimals={2} size="sm" />}
    </Pressable>
  )
}

export function ClubAwardCard({ roles, award }: { roles: Roles; award: ClubAward }) {
  return (
    <View style={styles.award}>
      <SectionTag roles={roles}>{award.title}</SectionTag>
      <View style={[styles.winner, { borderColor: roles.line, backgroundColor: roles.surface }]}
        accessible accessibilityLabel={`${award.title}: ${award.winner.clubName}. ${award.winner.headline}`}>
        {/* P8-37: you're your club's manager, so the award names you. */}
        <KitText t="superM" color={roles.text} numberOfLines={2}>{(award.winner.manager ?? award.winner.clubName).toUpperCase()}</KitText>
        {award.winner.manager ? <KitText t="body" color={roles.text}>{award.winner.clubName}</KitText> : null}
        <View style={styles.winnerMeta}>
          <KitText t="body" color={roles.textMuted} style={{ flex: 1 }}>{award.winner.headline}</KitText>
          {award.winner.isPlayerClub && <Tag roles={roles} variant="you">YOURS</Tag>}
        </View>
      </View>
      <KitText t="body" color={roles.textMuted}>{award.how}</KitText>
      {award.runnersUp.map((r, i) => (
        <View key={r.clubName} style={[styles.runner, { borderBottomColor: roles.rule }]}>
          <KitText t="figure" color={roles.textMuted} style={styles.runnerPos}>{String(i + 2)}</KitText>
          {/* Name over headline, like the player runners-up: side by side, a
              long headline ("Tipped 8, finished 6 · 2 players in the team of
              the season") squeezed the club's name out entirely. */}
          <View style={{ flex: 1 }}>
            <KitText t="body" color={roles.text} numberOfLines={1}>{r.clubName}</KitText>
            <KitText t="tag" color={roles.textMuted}>{r.headline}</KitText>
          </View>
        </View>
      ))}
    </View>
  )
}

// ── Qualifying's own (P8-116) ────────────────────────────────────────────────
// The full path's awards are over the league phase and knockouts; qualifying
// gets its player and its team here, under its own heading.
export function QualifyingAwards({ roles, night, onPlayer }: { roles: Roles; night: AwardsNight; onPlayer?: OpenPlayer }) {
  const q = night.qualifying
  if (!q || (!q.player && !q.team)) return null
  return (
    <View style={styles.award}>
      <SectionTag roles={roles}>Qualifying</SectionTag>
      {q.player && <PlayerAwardCard roles={roles} award={q.player} onPlayer={onPlayer} />}
      {q.team && <FormationPitch roles={roles} team={q.team} onPlayer={onPlayer} caption="The team of qualifying: the shape its best players fit." />}
    </View>
  )
}

// ── The awards as a plain section (verdict and history, P4-G) ────────────────
export function AwardsSection({ roles, night, onPlayer }: { roles: Roles; night: AwardsNight; onPlayer?: OpenPlayer }) {
  const [round, setRound] = useState(Math.max(0, night.teamsOfTheRound.length - 1))
  const r = night.teamsOfTheRound[round]
  return (
    <View style={styles.section}>
      <KitText t="superM" color={roles.text} accessibilityRole="header">THE AWARDS</KitText>
      {night.playerOfTheSeason && <PlayerAwardCard roles={roles} award={night.playerOfTheSeason} onPlayer={onPlayer} />}
      {night.teamOfTheSeason && (
        <View style={styles.award}>
          <SectionTag roles={roles}>{`Team of the ${night.word ?? 'season'}`}</SectionTag>
          <FormationPitch roles={roles} team={night.teamOfTheSeason} onPlayer={onPlayer} />
        </View>
      )}
      {night.players.map(a => <PlayerAwardCard key={a.key} roles={roles} award={a} onPlayer={onPlayer} />)}
      {night.bestU21 && <PlayerAwardCard roles={roles} award={night.bestU21} onPlayer={onPlayer} />}
      {night.clubs.map(a => <ClubAwardCard key={a.key} roles={roles} award={a} />)}
      <QualifyingAwards roles={roles} night={night} onPlayer={onPlayer} />
      {r && (
        <View style={styles.award}>
          <SectionTag roles={roles}>Team of the matchday</SectionTag>
          <View style={styles.roundPick}>
            <Pressable disabled={round <= 0} onPress={() => setRound(x => Math.max(0, x - 1))} accessibilityRole="button" accessibilityLabel="Previous matchday"
              style={({ pressed }) => [styles.roundBtn, { borderColor: round <= 0 ? roles.rule : roles.line }, pressed && { backgroundColor: roles.sunken }]}>
              <Icon name="back" size={20} color={round <= 0 ? roles.textFaint : roles.text} />
            </Pressable>
            <KitText t="tag" color={roles.text} style={{ flex: 1, textAlign: 'center' }}>{r.label}</KitText>
            <Pressable disabled={round >= night.teamsOfTheRound.length - 1} onPress={() => setRound(x => Math.min(night.teamsOfTheRound.length - 1, x + 1))}
              accessibilityRole="button" accessibilityLabel="Next matchday"
              style={({ pressed }) => [styles.roundBtn, { borderColor: round >= night.teamsOfTheRound.length - 1 ? roles.rule : roles.line }, pressed && { backgroundColor: roles.sunken }]}>
              <Icon name="chevron" size={20} color={round >= night.teamsOfTheRound.length - 1 ? roles.textFaint : roles.text} />
            </Pressable>
          </View>
          <FormationPitch roles={roles} team={r.team} onPlayer={onPlayer} showScores="rating" />
        </View>
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  section: { gap: space[3], marginTop: space[5] },
  award: { gap: space[2], marginBottom: space[3] },
  winner: { borderWidth: border.plate, padding: space[3], gap: space[2] },
  winnerTop: { flexDirection: 'row', alignItems: 'center', gap: space[2] },
  winnerMeta: { flexDirection: 'row', alignItems: 'center', gap: space[2] },
  breakdown: { borderTopWidth: border.hair, paddingTop: space[2], gap: 2 },
  partRow: { flexDirection: 'row', alignItems: 'center', gap: space[2], minHeight: 24 },
  partPts: { width: 52, textAlign: 'right' },
  runner: { flexDirection: 'row', alignItems: 'center', gap: space[2], minHeight: 44, borderBottomWidth: border.hair },
  runnerPos: { width: 20 },

  pitchWrap: { gap: space[2] },
  pitchHead: { flexDirection: 'row', alignItems: 'center', gap: space[2] },
  pitch: { borderWidth: border.thin, paddingVertical: space[3], gap: space[3], overflow: 'hidden' },
  halfway: { position: 'absolute', left: 0, right: 0, top: '50%', height: border.hair },
  circle: { position: 'absolute', left: '50%', top: '50%', width: 72, height: 72, marginLeft: -36, marginTop: -36, borderRadius: 36, borderWidth: border.hair },
  pitchRow: { flexDirection: 'row', justifyContent: 'space-evenly', paddingHorizontal: space[1] },
  best: { position: 'absolute', top: -6, right: -6 },
  shirt: { alignItems: 'center', borderWidth: border.thin, paddingHorizontal: 4, paddingVertical: 4, width: 76 },
  shirtGap: { width: 76 },
  shirtName: { textAlign: 'center' },
  bench: { gap: 2 },
  benchRow: { flexDirection: 'row', alignItems: 'center', gap: space[2], minHeight: 40, borderBottomWidth: border.hair },
  benchPos: { width: 36 },
  roundPick: { flexDirection: 'row', alignItems: 'center', gap: space[2] },
  roundBtn: { width: 48, height: 48, borderWidth: border.thin, alignItems: 'center', justifyContent: 'center' },
})
