// What the one result screen says (Wave F, docs/audit-2026-10/08-RESULT-PAGES.md
// §3 and §10): the run's story in one to three rows, and a door into each of
// the run hub's tabs with one line of what's behind it. Plain functions over
// RunData, so scripts/verify-highlights.ts can run them over thousands of
// seasons (lessons: the logic that decides what a page says goes where a
// script can reach it). Every row points at something that opens: a match, a
// player, a club or a story. There are no placeholder rows.
import { t } from '@/i18n'
import { label } from '@/i18n/labels'
import { ordinal } from '@/lib/format'
import { storyText } from '@/engine/press'
import { cupReachOf, reachLabel } from '@/engine/domestic-cup'
import type { RunMatch } from '@/engine/run-stats'
import type { RunData } from '@/lib/runData'

export type StorySubject =
  | { type: 'match'; match: RunMatch }
  | { type: 'player'; playerId: string }
  | { type: 'club'; clubId: string }
  | { type: 'story'; storyId: string }

export type Highlight = { kind: 'decider' | 'final' | 'exit' | 'settled' | 'bestWin' | 'star' | 'gotAway' | 'rival' | 'headline'; label: string; value: string; subject: StorySubject }

/** A player you passed on in the draft (I-2): kept on the run by the draft. */
export type GotAway = { playerId: string; name: string }

// The run hub's knockout rule (app/game/run.tsx): a match whose label isn't a
// league, league-phase, group or qualifying game is a knockout leg.
const NOT_KNOCKOUT = /^(League Phase|Group|Matchday|Domestic Season|Qualifying|\w+ Qualifying Round|Play-off Round)/
const isKnockout = (m: RunMatch) => !!m.label && !NOT_KNOCKOUT.test(m.label)

function yours(data: RunData): RunMatch[] {
  const id = data.playerClubId
  return id ? (data.matches ?? []).filter(m => m.homeClubId === id || m.awayClubId === id) : []
}
/** A match from your side: your goals, theirs, who you played. */
function side(m: RunMatch, you: string) {
  const home = m.homeClubId === you
  return { gf: home ? m.homeGoals : m.awayGoals, ga: home ? m.awayGoals : m.homeGoals, opp: home ? m.awayClubName : m.homeClubName, oppId: home ? m.awayClubId : m.homeClubId }
}
const scoreLine = (m: RunMatch, you: string) => {
  const s = side(m, you)
  return t('res.scoreV', { gf: s.gf, ga: s.ga, opp: s.opp })
}

/**
 * The match the run turned on. A cup run: its last knockout match (the final,
 * or where you went out; a shootout counts as going out). A league: the match
 * after which you never left your final place. Otherwise your biggest win.
 */
function decider(data: RunData): Highlight | null {
  const you = data.playerClubId
  const mine = yours(data)
  if (!you || !mine.length) return null
  const ko = mine.filter(isKnockout)
  if (ko.length) {
    const last = ko[ko.length - 1]
    const round = (last.label ?? '').split(' · ')[0]
    const isFinal = round.startsWith('Final')
    const third = /3rd|third/i.test(round)
    // A final is one match: you won it outright or in its shootout, whose
    // note names who went through.
    const s = side(last, you)
    const yourName = you === last.homeClubId ? last.homeClubName : last.awayClubName
    const wonFinal = isFinal && (s.gf > s.ga || (s.gf === s.ga && !!last.pensNote?.includes(yourName)))
    return {
      kind: isFinal ? 'final' : 'exit',
      // Anything but the final or the play-off for third is where you went out:
      // a run's last knockout match is the one it ended on.
      label: isFinal ? (wonFinal ? t('res.wonFinal') : t('res.theFinal')) : third ? t('res.lastGame') : t('res.wentOut'),
      value: `${label(round)} · ${scoreLine(last, you)}`,
      subject: { type: 'match', match: last },
    }
  }
  const series = data.positions?.get(you)
  if (series && series.length > 1) {
    const final = series[series.length - 1]
    let i = series.length - 1
    while (i > 0 && series[i - 1] === final) i--
    // Matchday i+1 (1-based) is the first one you ended in your final place.
    const md = i + 1
    const m = i > 0 ? mine.find(x => x.label === `Matchday ${md}`) : undefined
    if (m) return { kind: 'settled', label: t('res.settled', { place: ordinal(final) }), value: `${label(`MD ${md}`)} · ${scoreLine(m, you)}`, subject: { type: 'match', match: m } }
  }
  const wins = mine.map(m => ({ m, s: side(m, you) })).filter(x => x.s.gf > x.s.ga)
  if (!wins.length) return null
  const best = wins.reduce((a, b) => (b.s.gf - b.s.ga > a.s.gf - a.s.ga ? b : a))
  return { kind: 'bestWin', label: t('res.bestWin'), value: scoreLine(best.m, you), subject: { type: 'match', match: best.m } }
}

/** Your best player: the highest average rating in your XI over enough matches. */
function star(data: RunData, minMatches: number): Highlight | null {
  const cands = data.stats.players.filter(p => p.isPlayerClub && (p.matchesRated ?? 0) >= minMatches && p.avgRating != null)
  if (!cands.length) return null
  const p = cands.reduce((a, b) => ((b.avgRating ?? 0) > (a.avgRating ?? 0) ? b : a))
  return { kind: 'star', label: t('res.star'), value: t('res.starV', { name: p.name, rating: (p.avgRating ?? 0).toFixed(1) }), subject: { type: 'player', playerId: p.playerId } }
}

/** I-2: a player you passed on in the draft who then played in your run. */
function gotAway(data: RunData, away: GotAway[] | undefined): Highlight | null {
  const played = (away ?? [])
    .map(a => data.stats.players.find(p => p.playerId === a.playerId && !p.isPlayerClub))
    .filter((p): p is NonNullable<typeof p> => !!p && (p.matchesRated ?? 0) > 0)
  if (!played.length) return null
  const p = played.reduce((a, b) => (b.goals + b.assists > a.goals + a.assists || ((b.avgRating ?? 0) > (a.avgRating ?? 0) && b.goals + b.assists === a.goals + a.assists) ? b : a))
  return { kind: 'gotAway', label: t('res.gotAway'), value: t('res.gotAwayV', { name: p.name, goals: p.goals, club: p.clubName }), subject: { type: 'player', playerId: p.playerId } }
}

/** I-4: the club that beat you most (twice or more), else the one just above you. */
function rival(data: RunData): Highlight | null {
  const you = data.playerClubId
  if (!you) return null
  const beat = new Map<string, { name: string; n: number }>()
  for (const m of yours(data)) {
    const s = side(m, you)
    if (s.ga > s.gf) beat.set(s.oppId, { name: s.opp, n: (beat.get(s.oppId)?.n ?? 0) + 1 })
  }
  const most = [...beat.entries()].sort((a, b) => b[1].n - a[1].n || a[0].localeCompare(b[0]))[0]
  if (most && most[1].n >= 2) return { kind: 'rival', label: t('res.rival'), value: t('res.rivalBeat', { club: most[1].name, n: most[1].n }), subject: { type: 'club', clubId: most[0] } }
  // A single table only: in a World Cup the row above you is another group.
  if (data.table.some(r => r.group)) return null
  const at = data.table.findIndex(r => r.isPlayer)
  const above = at > 0 ? data.table[at - 1] : null
  if (!above) return null
  return { kind: 'rival', label: t('res.rival'), value: t('res.rivalAbove', { club: above.clubName, pts: above.points - data.table[at].points }), subject: { type: 'club', clubId: above.clubId } }
}

/** The press's last word on you. */
function headline(data: RunData): Highlight | null {
  const s = [...data.press].reverse().find(x => x.involvesPlayer) ?? data.press[data.press.length - 1]
  if (!s) return null
  return { kind: 'headline', label: t('res.headline'), value: storyText(s).headline, subject: { type: 'story', storyId: s.id } }
}

/** One to three rows: the match it turned on, your star, then the one that got away, a rival, or the headline. */
export function runHighlights(data: RunData, o: { gotAway?: GotAway[]; minMatches?: number } = {}): Highlight[] {
  const third = gotAway(data, o.gotAway) ?? rival(data) ?? headline(data)
  return [decider(data), star(data, o.minMatches ?? 3), third].filter((h): h is Highlight => !!h)
}

// ── The doors ────────────────────────────────────────────────────────────────

export type DoorId = 'table' | 'bracket' | 'season' | 'cup' | 'pundits' | 'awards' | 'squad' | 'europe'
export type Door = { id: DoorId; label: string; value?: string }

/**
 * A door into each part of the run that exists, with one line of what's
 * behind it. The screen decides where each opens (the hub's tab, or the
 * awards page). `pundits` and `europe` come from the screen, which has what
 * they need; RunData doesn't carry them.
 */
export function resultDoors(data: RunData, o: { pundits?: string | null; europe?: string | null; awards: boolean }): Door[] {
  const you = data.playerClubId
  const mine = yours(data)
  const out: Door[] = []
  const row = data.table.find(r => r.isPlayer)
  if (row) {
    const group = !!row.group
    out.push({
      id: 'table', label: group ? t('hub.tabGroups') : t('hub.tabTable'),
      value: group
        ? t('res.doorGroup', { g: row.group, place: ordinal(row.position) })
        : t('res.doorTable', { place: ordinal(row.position), count: data.table.length, pts: row.points }),
    })
  }
  const ko = mine.filter(isKnockout)
  if (you && ko.length) {
    const last = ko[ko.length - 1]
    const s = side(last, you)
    out.push({ id: 'bracket', label: t('hub.tabBracket'), value: t('res.doorBracket', { round: label((last.label ?? '').split(' · ')[0]), opp: s.opp }) })
  }
  if (you && mine.length) {
    let w = 0, d = 0, l = 0
    for (const m of mine) { const s = side(m, you); if (s.gf > s.ga) w++; else if (s.gf < s.ga) l++; else d++ }
    out.push({ id: 'season', label: t('res.doorSeasonL'), value: t('res.doorSeason', { w, d, l }) })
  }
  // A league run's cup (P8-173): how far you got in it.
  const cup = data.more?.cup
  if (cup && you) {
    const reach = cupReachOf(cup, you)
    out.push({ id: 'cup', label: cup.name, value: reach ? reachLabel(reach, cup.name) : undefined })
  }
  if (o.pundits) out.push({ id: 'pundits', label: t('res.doorPunditsL'), value: o.pundits })
  if (o.awards) {
    const pots = data.awards.playerOfTheSeason[0]
    out.push({ id: 'awards', label: t('res.doorAwardsL'), value: pots ? t('res.doorAwards', { name: pots.name }) : undefined })
  }
  const scorer = [...data.stats.players].filter(p => p.isPlayerClub && p.goals > 0).sort((a, b) => b.goals - a.goals || a.name.localeCompare(b.name))[0]
  out.push({ id: 'squad', label: t('hub.tabSquad'), value: scorer ? t('res.doorSquad', { name: scorer.name, goals: scorer.goals }) : undefined })
  if (o.europe) out.push({ id: 'europe', label: t('res.doorEuropeL'), value: o.europe })
  return out
}
