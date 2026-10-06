/**
 * The run's press: stories written from the league table as the season plays.
 *
 * The Dugout's `news.ts`, scaled to one run (docs/ui-overhaul/03 §2.1 and §4).
 * The table already tells a story every week — a leader pulling clear, four
 * clubs a point apart above the drop — and none of it reached the player. Four
 * rules keep it from being noise:
 *   1. Your competition only (it only ever sees your table).
 *   2. Nothing before a quarter of the season, except the final day.
 *   3. Every story has a cooldown per subject (longer for a club's form).
 *   4. Numbers are frozen: a story carries the rows it was about, as they stood,
 *      so a later matchday can't rewrite what an earlier one said.
 *
 * Pure: matchday snapshots in, stories out. A story stores its kind, its
 * subject and its frozen rows; the words are rendered from those by
 * `storyText`, so copy can change without touching a stored run. Like scorers,
 * stories are written once, as each matchday lands, and kept on the result.
 */

import type { ZoneKey } from '@/data/qualification-bands'
import { t, dec } from '@/i18n'
import { label } from '@/i18n/labels'
import { ordinal } from '@/lib/format'
import type { Absence } from './availability'

export type StoryKind =
  | 'summit' | 'runawayLeader' | 'titleRace' | 'relegationBattle' | 'sixPointer'
  | 'hotStreak' | 'coldStreak' | 'unbeaten' | 'winless' | 'logJam' | 'drawSpecialists'
  | 'champions' | 'survived'
  // P8-18: from the results and the European places, not just the top and bottom.
  | 'thrashing' | 'giantKilling' | 'europeRace'
  // P8-25: your own players' injuries and suspensions, from the availability ledger.
  | 'injury' | 'suspension'
  // P8-138: read the season the way a supporter does, from the form as much as
  // the table. Runs and the end of one; form that won't hold; a side's
  // character; and the players.
  | 'unbeatenRun' | 'runEnds' | 'zigZag' | 'yoyo'
  | 'goalFest' | 'tightGames' | 'leaky' | 'fortress'
  | 'playerForm' | 'masterclass'
  // Phase two step 7 (F-01): the cups' own stories, written by src/engine/cup-press.ts.
  // Your match (so no round of a cup passes without a word), the league phase
  // and the groups decided, the race for the best thirds, your tie, an upset,
  // a shootout, a knockout round's headline, and the winners.
  | 'yourMatch' | 'phaseDecided' | 'groupDecided' | 'bestThird'
  | 'yourTie' | 'koUpset' | 'shootout' | 'koRound' | 'cupWinners'

/** One of a club's results, frozen with a form story (P8-138: a team's form is
 *  shown with its results, not as a bare W-D-L). */
export type FormResult = { mark: 'W' | 'D' | 'L'; score: string; opponent: string; home: boolean }

export type StoryRow = {
  pos: number; clubId: string; clubName: string; isPlayer: boolean
  played: number; points: number; gd: number
}

export type Story = {
  id: string            // kind:subject:matchday — unique and stable
  kind: StoryKind
  subject: string
  matchday: number
  totalMatchdays: number
  rows: StoryRow[]      // frozen, in table order
  /** Kind-specific numbers, frozen with the rows. */
  n: Record<string, number>
  names: string[]       // the clubs the headline is about, in order
  involvesPlayer: boolean
  /** P8-138: the club's last results, oldest first, frozen with a form story. */
  form?: FormResult[]
  /** The one match a story is about (a masterclass, a thrashing, a giant-
   *  killing, the end of a run), frozen: the story shows the match, not the
   *  table (the maintainer, 27 Sept). */
  match?: StoryMatch
  /** A cup story's stage, as the engine names it ("League Phase", "Round of
   *  16"), shown through label(). A knockout story has `totalMatchdays` 0: its
   *  stage is all the "when" it needs. League stories have none. */
  stage?: string
}

export type StoryMatch = { homeId: string; awayId: string; homeName: string; awayName: string; homeGoals: number; awayGoals: number }

/** The shape the season screen already keeps per matchday. */
export type PressSnapshot = {
  matchday: number
  standings: {
    clubId: string; clubName: string; isPlayer: boolean
    stats: { played: number; won: number; drawn: number; lost: number; goalsFor: number; goalsAgainst: number; points: number }
  }[]
  fixtures: { home: { clubId: string }; away: { clubId: string }; result: { homeGoals: number; awayGoals: number } | null }[]
  /** P8-138: every player who played this matchday, with his rating (the round's
   *  match sheets, run-stats `roundLines`). Left out when the pools weren't
   *  ready; then there are simply no player stories that round. */
  players?: { playerId: string; name: string; clubId: string; rating: number }[]
}

export type PressContext = {
  totalMatchdays: number
  zones: (ZoneKey | null)[]
  /** Next matchday's pairings, for six-pointers. */
  next?: { homeId: string; awayId: string }[]
  /** P8-25: every absence so far (the ledger's list). Only YOUR club's make
   *  the press, and only on the matchday they happened. */
  absences?: Absence[]
  /** A cup's league phase or a group: no title, no drop, no European places,
   *  and its last matchday is an ordinary one (the cup writes what it decided). */
  phase?: boolean
}

// Thresholds. Scaled to a 38-round season and shrunk for shorter ones.
// One story a round, plus one more when it's about you: a feed, not a wall.
const MAX_PER_MATCHDAY = 1
const RUNAWAY_GAP = 10
const TIGHT = 3
const HOT_FROM_FIVE = 15    // five straight wins
const COLD_FROM_FIVE = 0   // five straight defeats
const SIX_POINTER_GAP = 1
const JAM_SIZE = 5
const THRASHING = 4          // a win by four or more
const GIANT_TOP = 3          // a giant: in the top three before the match
const KILLER_FROM = 2 / 3    // a killer: in the bottom third before the match
// P8-138. Runs: five straight wins or defeats is a streak (as before, now with
// its length); an unbeaten run is eight; the end of a run of either is a story
// of its own. Form that won't hold: six results alternating win and defeat, or
// two blocks of five apart by nine points or more. Character, once a third of
// the season is played: goals per game (both ends) at 3.6 or more, or 1.7 or
// fewer; conceded per game 2.2 or more, or 0.6 or fewer. Players: an average
// of 8.0 over five straight appearances; a single match rated 9.8 or more.
const STREAK = 5
const UNBEATEN_RUN = 8
// The end of a run is only news when the run was: measured over 400 seasons,
// the end of any five-win or eight-unbeaten run was the commonest story of all
// (six a season), ahead of thrashings and streaks.
const ENDS_WINNING = 6, ENDS_UNBEATEN = 10
const ZIGZAG = 6
const YOYO_SWING = 9
const GOALFEST = 3.6, TIGHT_GAMES = 1.7
const LEAKY = 2.2, FORTRESS = 0.6
const FORM_AVG = 8.0, FORM_APPS = 5
const MASTERCLASS = 9.8

const FORM_KINDS = new Set<StoryKind>(['hotStreak', 'coldStreak', 'unbeaten', 'winless', 'drawSpecialists', 'unbeatenRun', 'zigZag', 'yoyo', 'playerForm'])
// A side's character changes slowly: once said, it isn't said again for most of a season.
const CHARACTER_KINDS = new Set<StoryKind>(['goalFest', 'tightGames', 'leaky', 'fortress'])
const cooldownFor = (kind: StoryKind, total: number) => {
  const weight = CHARACTER_KINDS.has(kind) ? 20 : FORM_KINDS.has(kind) ? 9 : 7
  return Math.max(2, Math.round((weight * total) / 38))
}

// Higher first. Final-day stories always lead.
const PRIORITY: StoryKind[] = [
  'champions', 'survived', 'summit', 'runawayLeader', 'titleRace', 'relegationBattle',
  'giantKilling', 'sixPointer', 'europeRace', 'runEnds', 'thrashing',
  'hotStreak', 'coldStreak', 'unbeaten', 'unbeatenRun', 'winless', 'playerForm',
  'logJam', 'zigZag', 'yoyo', 'drawSpecialists', 'fortress', 'leaky', 'goalFest', 'tightGames',
]
// The stories a club's last results are shown with.
const WITH_FORM = new Set<StoryKind>(['hotStreak', 'coldStreak', 'unbeaten', 'unbeatenRun', 'winless', 'runEnds', 'zigZag', 'yoyo', 'drawSpecialists', 'goalFest', 'tightGames', 'leaky', 'fortress'])

/**
 * P8-25: your players hurt or banned on matchday `md`. Written from matchday 1
 * (the quarter-season rule keeps thin STATISTICS out of the press, and an
 * injury isn't a statistic) and outside the one-a-round cap, because they're
 * about you and rare. The cups write theirs through this too (F-01).
 */
export function absenceStoriesOf(absences: Absence[], md: number, total: number, yourRow: StoryRow): Story[] {
  return absences
    .filter(a => a.isPlayerClub && a.incurredOn === md)
    .sort((a, b) => (a.minute ?? 99) - (b.minute ?? 99) || a.playerId.localeCompare(b.playerId))
    .map(a => {
      const kind: StoryKind = a.reason === 'injury' ? 'injury' : 'suspension'
      return {
        kind, subject: a.playerId, rows: [yourRow],
        n: { out: a.toMatchday - a.fromMatchday + 1, from: a.fromMatchday, to: a.toMatchday, minute: a.minute ?? 0 },
        names: [a.playerName, yourRow.clubName, ...(a.standInName ? [a.standInName] : [])],
        involvesPlayer: true,
        id: `${kind}:${a.playerId}:${md}`, matchday: md, totalMatchdays: total,
      }
    })
}

function rowsOf(s: PressSnapshot): StoryRow[] {
  return s.standings.map((t, i) => ({
    pos: i + 1, clubId: t.clubId, clubName: t.clubName, isPlayer: t.isPlayer,
    played: t.stats.played, points: t.stats.points, gd: t.stats.goalsFor - t.stats.goalsAgainst,
  }))
}

/** Points from each club's last five results, walking the history in order. */
function lastFive(history: PressSnapshot[]): Map<string, number[]> {
  const out = new Map<string, number[]>()
  const push = (id: string, pts: number) => {
    const a = out.get(id) ?? []
    a.push(pts)
    if (a.length > 5) a.shift()
    out.set(id, a)
  }
  for (const s of history) {
    for (const f of s.fixtures) {
      if (!f.result) continue
      const { homeGoals: h, awayGoals: a } = f.result
      push(f.home.clubId, h > a ? 3 : h === a ? 1 : 0)
      push(f.away.clubId, a > h ? 3 : h === a ? 1 : 0)
    }
  }
  return out
}

function matchOf(f: PressSnapshot['fixtures'][number] | undefined, nameOf: (id: string) => string): StoryMatch | undefined {
  if (!f?.result) return undefined
  return { homeId: f.home.clubId, awayId: f.away.clubId, homeName: nameOf(f.home.clubId), awayName: nameOf(f.away.clubId), homeGoals: f.result.homeGoals, awayGoals: f.result.awayGoals }
}

type Played = { mark: 'W' | 'D' | 'L'; gf: number; ga: number; oppId: string; home: boolean }

/** Every club's results so far, in order. */
function resultsByClub(history: PressSnapshot[]): Map<string, Played[]> {
  const out = new Map<string, Played[]>()
  const push = (id: string, p: Played) => { const a = out.get(id) ?? []; a.push(p); out.set(id, a) }
  for (const s of history) for (const f of s.fixtures) {
    if (!f.result) continue
    const { homeGoals: h, awayGoals: a } = f.result
    push(f.home.clubId, { mark: h > a ? 'W' : h === a ? 'D' : 'L', gf: h, ga: a, oppId: f.away.clubId, home: true })
    push(f.away.clubId, { mark: a > h ? 'W' : h === a ? 'D' : 'L', gf: a, ga: h, oppId: f.home.clubId, home: false })
  }
  return out
}

/** How many of the latest results in a row pass `test`. */
const runOf = (rs: Played[], test: (p: Played) => boolean) => { let k = 0; for (let i = rs.length - 1; i >= 0 && test(rs[i]); i--) k++; return k }
const pointsOf = (rs: Played[]) => rs.reduce((sum, p) => sum + (p.mark === 'W' ? 3 : p.mark === 'D' ? 1 : 0), 0)

/**
 * The stories the latest snapshot writes. `history` is every matchday so far,
 * in order; `prior` is every story already written this run (for cooldowns).
 */
export function writePress(history: PressSnapshot[], prior: Story[], ctx: PressContext): Story[] {
  const now = history[history.length - 1]
  if (!now) return []
  const md = now.matchday
  const total = ctx.totalMatchdays
  const finalDay = md === total && !ctx.phase
  const rows = rowsOf(now)

  const yourRow = rows.find(r => r.isPlayer)
  const absenceStories = yourRow ? absenceStoriesOf(ctx.absences ?? [], md, total, yourRow) : []

  // P8-138: a match rated 9.8 or more is a story of its own, whoever it was
  // and whenever it was: an event, not a statistic, so like an injury it's
  // outside the quarter-season rule and the one-a-round cap. One a round, the best.
  const star = (now.players ?? []).filter(p => p.rating >= MASTERCLASS)
    .sort((a, b) => b.rating - a.rating || a.playerId.localeCompare(b.playerId))[0]
  const starRow = star ? rows.find(r => r.clubId === star.clubId) : undefined
  const eventStories: Story[] = [...absenceStories]
  if (star && starRow) {
    const f = now.fixtures.find(x => x.result && (x.home.clubId === star.clubId || x.away.clubId === star.clubId))
    const home = f?.home.clubId === star.clubId
    const opp = f ? rows.find(r => r.clubId === (home ? f.away.clubId : f.home.clubId)) : undefined
    eventStories.push({
      kind: 'masterclass', subject: star.playerId, rows: opp ? [starRow, opp] : [starRow],
      n: { r10: Math.round(star.rating * 10), for: f?.result ? (home ? f.result.homeGoals : f.result.awayGoals) : 0, against: f?.result ? (home ? f.result.awayGoals : f.result.homeGoals) : 0 },
      names: [star.name, starRow.clubName, ...(opp ? [opp.clubName] : [])],
      involvesPlayer: starRow.isPlayer,
      match: matchOf(f, id => rows.find(r => r.clubId === id)?.clubName ?? ''),
      id: `masterclass:${star.playerId}:${md}`, matchday: md, totalMatchdays: total,
    })
  }

  if (md < Math.ceil(total / 4) && !finalDay) return eventStories
  const n = rows.length
  const left = total - md
  const prevLeader = history.length > 1 ? history[history.length - 2].standings[0]?.clubId : undefined
  const form = lastFive(history)
  const results = resultsByClub(history)
  const nameOf = new Map(now.standings.map(t => [t.clubId, t.clubName]))
  // P8-138: a club's last five, as the story shows them.
  const formOf = (clubId: string): FormResult[] => (results.get(clubId) ?? []).slice(-5).map(p => ({
    mark: p.mark, score: `${p.gf}–${p.ga}`, opponent: nameOf.get(p.oppId) ?? '', home: p.home,
  }))
  const cands: Omit<Story, 'id' | 'matchday' | 'totalMatchdays' | 'involvesPlayer'>[] = []
  const nameById = (id: string) => nameOf.get(id) ?? ''
  const fixtureOf = (a: string, b: string) => now.fixtures.find(f => f.result && ((f.home.clubId === a && f.away.clubId === b) || (f.home.clubId === b && f.away.clubId === a)))
  const add = (kind: StoryKind, subject: string, about: StoryRow[], nums: Record<string, number>, names?: string[], match?: StoryMatch) =>
    cands.push({
      kind, subject, rows: about, n: nums, names: names ?? about.map(r => r.clubName),
      ...(WITH_FORM.has(kind) && about[0] ? { form: formOf(about[0].clubId) } : {}),
      ...(match ? { match } : {}),
    })

  const leader = rows[0], second = rows[1]
  const firstDrop = ctx.zones.findIndex(z => z === 'down' || z === 'playoff')   // 0-based

  if (finalDay) {
    add('champions', 'title', [leader, second], { gap: leader.points - second.points })
    if (firstDrop > 0) {
      const safe = rows[firstDrop - 1], below = rows[firstDrop]
      if (safe.points - below.points <= TIGHT) add('survived', 'drop', [safe, below], { gap: safe.points - below.points, playoff: ctx.zones[firstDrop] === 'playoff' ? 1 : 0 })
    }
  } else {
    if (prevLeader && prevLeader !== leader.clubId) add('summit', leader.clubId, [leader, second], { gap: leader.points - second.points })

    const gap = leader.points - second.points
    if (gap >= Math.max(4, Math.round((RUNAWAY_GAP * total) / 38))) add('runawayLeader', leader.clubId, [leader, second], { gap, left })

    if (md >= total / 2) {
      const race = rows.filter(r => leader.points - r.points <= TIGHT)
      // P8-42: every club the story is about, not the first five — a "six
      // clubs, three points" story showed five rows.
      // A league phase has no title to race for (F-01): only the league's.
      if (race.length >= 3 && !ctx.phase) add('titleRace', 'title', race, { clubs: race.length, spread: leader.points - race[race.length - 1].points, left })

      if (firstDrop > 0) {
        const line = rows[firstDrop].points
        const fight = rows.filter((r, i) => i >= firstDrop - 3 && Math.abs(r.points - line) <= TIGHT)
        if (fight.length >= 4) add('relegationBattle', 'drop', fight, { clubs: fight.length, places: n - firstDrop, left })
      }
    }

    for (const p of ctx.next ?? []) {
      const h = rows.find(r => r.clubId === p.homeId), a = rows.find(r => r.clubId === p.awayId)
      if (!h || !a || Math.abs(h.points - a.points) > SIX_POINTER_GAP) continue
      const top = h.pos <= 3 && a.pos <= 3
      const bottom = firstDrop > 0 && h.pos > firstDrop - 3 && a.pos > firstDrop - 3
      if (top || bottom) add('sixPointer', [h.clubId, a.clubId].sort().join('+'), [h, a].sort((x, y) => x.pos - y.pos), { gap: Math.abs(h.points - a.points), top: top ? 1 : 0, left })
    }

    for (const r of rows) {
      const f = form.get(r.clubId) ?? []
      const pts = f.reduce((s, x) => s + x, 0)
      const t = now.standings[r.pos - 1].stats
      const rs = results.get(r.clubId) ?? []
      // P8-138: a streak says how long it is.
      const wins = runOf(rs, p => p.mark === 'W'), losses = runOf(rs, p => p.mark === 'L')
      if (f.length === 5 && pts >= HOT_FROM_FIVE) add('hotStreak', r.clubId, [r], { pts, run: wins })
      if (f.length === 5 && pts <= COLD_FROM_FIVE) add('coldStreak', r.clubId, [r], { pts, run: losses })
      // Unbeaten after two games of an eight-game league phase is no story: a phase waits for half.
      const sinceFrom = ctx.phase ? Math.ceil(total / 2) : Math.ceil(total / 4)
      if (t.lost === 0 && t.played >= sinceFrom) add('unbeaten', r.clubId, [r], { played: t.played })
      if (t.won === 0 && t.played >= sinceFrom) add('winless', r.clubId, [r], { played: t.played })
      if (t.drawn >= 6 && t.drawn / t.played >= 0.4) add('drawSpecialists', r.clubId, [r], { drawn: t.drawn, played: t.played })

      // An unbeaten run inside a season that has had a defeat.
      const unbeatenFor = runOf(rs, p => p.mark !== 'L')
      if (t.lost > 0 && unbeatenFor >= UNBEATEN_RUN) add('unbeatenRun', r.clubId, [r], { run: unbeatenFor })

      // The end of a run: this round broke it (the run before the last result).
      const last = rs[rs.length - 1], before = rs.slice(0, -1)
      if (last) {
        const was = { unbeaten: runOf(before, p => p.mark !== 'L'), winning: runOf(before, p => p.mark === 'W') }
        const opp = rows.find(o => o.clubId === last.oppId)
        const ended = last.mark === 'L' && was.unbeaten >= ENDS_UNBEATEN ? { run: was.unbeaten, unbeaten: 1 }
          : last.mark !== 'W' && was.winning >= ENDS_WINNING ? { run: was.winning, unbeaten: 0 } : null
        if (ended && opp) add('runEnds', r.clubId, [r, opp], { ...ended, for: last.gf, against: last.ga }, undefined, matchOf(fixtureOf(r.clubId, opp.clubId), nameById))
      }

      // Form that won't hold: zig-zag, or two fives far apart.
      const six = rs.slice(-ZIGZAG)
      if (six.length === ZIGZAG && six.every((p, i) => p.mark !== 'D' && (i === 0 || p.mark !== six[i - 1].mark))) add('zigZag', r.clubId, [r], { games: ZIGZAG })
      if (rs.length >= 10) {
        const older = pointsOf(rs.slice(-10, -5)), newer = pointsOf(rs.slice(-5))
        if (Math.abs(older - newer) >= YOYO_SWING) add('yoyo', r.clubId, [r], { older, newer })
      }

      // Character, once a third of the season has been played.
      if (t.played >= Math.max(8, Math.ceil(total / 3))) {
        const perGame = (t.goalsFor + t.goalsAgainst) / t.played, against = t.goalsAgainst / t.played
        const x10 = (v: number) => Math.round(v * 10)
        if (perGame >= GOALFEST) add('goalFest', r.clubId, [r], { per10: x10(perGame), played: t.played })
        if (perGame <= TIGHT_GAMES) add('tightGames', r.clubId, [r], { per10: x10(perGame), played: t.played })
        if (against >= LEAKY) add('leaky', r.clubId, [r], { per10: x10(against), conceded: t.goalsAgainst, played: t.played })
        if (against <= FORTRESS) add('fortress', r.clubId, [r], { per10: x10(against), conceded: t.goalsAgainst, played: t.played })
      }
    }

    // P8-138: a player's form: 8.0 or better on average over his last five
    // appearances, all of them in the last seven matchdays (a run, not a
    // scattered five). The best such player a round.
    const apps = new Map<string, { name: string; clubId: string; games: { md: number; rating: number }[] }>()
    for (const snap of history) for (const p of snap.players ?? []) {
      const a = apps.get(p.playerId) ?? { name: p.name, clubId: p.clubId, games: [] }
      a.games.push({ md: snap.matchday, rating: p.rating }); apps.set(p.playerId, a)
    }
    const inForm = [...apps.entries()].map(([id, a]) => {
      const last = a.games.slice(-FORM_APPS)
      const avg = last.reduce((sum, g) => sum + g.rating, 0) / Math.max(1, last.length)
      return { id, a, last, avg }
    }).filter(x => x.last.length === FORM_APPS && x.last[x.last.length - 1].md === md && md - x.last[0].md <= 6 && x.avg >= FORM_AVG)
      .sort((x, y) => y.avg - x.avg || x.id.localeCompare(y.id))[0]
    const formRow = inForm ? rows.find(r => r.clubId === inForm.a.clubId) : undefined
    if (inForm && formRow) add('playerForm', inForm.id, [formRow], { avg10: Math.round(inForm.avg * 10), apps: FORM_APPS }, [inForm.a.name, formRow.clubName])

    // P8-18: the round's biggest win, if it was a thrashing.
    const played = now.fixtures.filter(f => f.result)
    const biggest = played
      .map(f => ({ f, margin: Math.abs(f.result!.homeGoals - f.result!.awayGoals) }))
      .sort((a, b) => b.margin - a.margin || a.f.home.clubId.localeCompare(b.f.home.clubId))[0]
    if (biggest && biggest.margin >= THRASHING) {
      const { homeGoals: hg, awayGoals: ag } = biggest.f.result!
      const winId = hg > ag ? biggest.f.home.clubId : biggest.f.away.clubId
      const loseId = hg > ag ? biggest.f.away.clubId : biggest.f.home.clubId
      const w = rows.find(r => r.clubId === winId), l = rows.find(r => r.clubId === loseId)
      // Subject is the KIND, not the club: somewhere in a league a side wins by
      // four most weeks, so a per-club cooldown still ran one every round.
      if (w && l) add('thrashing', 'thrashing', [w, l], { for: Math.max(hg, ag), against: Math.min(hg, ag) }, undefined, matchOf(biggest.f, nameById))
    }

    // P8-18: a bottom-third side beating a top-three side, judged on the table
    // as it stood BEFORE the round, so the result can't make its own story.
    const before = history.length > 1 ? rowsOf(history[history.length - 2]) : null
    if (before) {
      const posBefore = new Map(before.map(r => [r.clubId, r.pos]))
      // One a round: the biggest gap in the table wins the headline.
      let best: { w: StoryRow; l: StoryRow; nums: Record<string, number>; f: PressSnapshot['fixtures'][number] } | null = null
      for (const f of played) {
        const { homeGoals: hg, awayGoals: ag } = f.result!
        if (hg === ag) continue
        const winId = hg > ag ? f.home.clubId : f.away.clubId
        const loseId = hg > ag ? f.away.clubId : f.home.clubId
        const wp = posBefore.get(winId) ?? 0, lp = posBefore.get(loseId) ?? 99
        if (lp <= GIANT_TOP && wp > Math.floor(n * KILLER_FROM)) {
          const w = rows.find(r => r.clubId === winId)!, l = rows.find(r => r.clubId === loseId)!
          if (!best || wp - lp > best.nums.wasPos - best.nums.beatPos)
            best = { w, l, nums: { for: Math.max(hg, ag), against: Math.min(hg, ag), wasPos: wp, beatPos: lp }, f }
        }
      }
      if (best) add('giantKilling', 'giantKilling', [best.w, best.l], best.nums, undefined, matchOf(best.f, nameById))
    }

    // P8-18: the fight for the last European place, from halfway on.
    if (md >= total / 2) {
      const lastEurope = ctx.zones.reduce((last, z, i) => (z === 'ucl' || z === 'uel' || z === 'uecl' ? i : last), -1)
      if (lastEurope > 0 && lastEurope < n - 1) {
        const line = rows[lastEurope].points
        const race = rows.filter((r, i) => i >= lastEurope - 2 && i <= lastEurope + 3 && Math.abs(r.points - line) <= TIGHT)
        if (race.length >= 3) add('europeRace', 'europe', race, { clubs: race.length, left })
      }
    }

    const byPoints = new Map<number, StoryRow[]>()
    for (const r of rows) byPoints.set(r.points, [...(byPoints.get(r.points) ?? []), r])
    // The round's biggest logjam only: two at different points would both be
    // "logJam:jam:md", one story twice (seen in 36-club league phases, F-01).
    const jam = [...byPoints.entries()].filter(([, j]) => j.length >= JAM_SIZE).sort((x, y) => y[1].length - x[1].length || y[0] - x[0])[0]
    if (jam) add('logJam', 'jam', jam[1], { clubs: jam[1].length, pts: jam[0] })
  }

  const blocked = (kind: StoryKind, subject: string) =>
    prior.some(s => s.kind === kind && s.subject === subject && md - s.matchday < cooldownFor(kind, total))

  const ranked = cands
    .filter(c => !blocked(c.kind, c.subject))
    .map(c => ({ ...c, involvesPlayer: c.rows.some(r => r.isPlayer) }))
    .sort((a, b) =>
      PRIORITY.indexOf(a.kind) - PRIORITY.indexOf(b.kind)
      || a.subject.localeCompare(b.subject))

  // Final day: both final-day stories, whoever they're about.
  const picked = finalDay
    ? ranked.filter(c => c.kind === 'champions' || c.kind === 'survived')
    : [...ranked.slice(0, MAX_PER_MATCHDAY), ranked.slice(MAX_PER_MATCHDAY).find(c => c.involvesPlayer)]
        .filter((c): c is NonNullable<typeof c> => !!c)

  return [
    ...picked.map(c => ({ ...c, id: `${c.kind}:${c.subject}:${md}`, matchday: md, totalMatchdays: total })),
    ...eventStories,
  ]
}

// ── Words ────────────────────────────────────────────────────────────────────
// P8.5-28: every line lives in src/i18n (press.*), in each language with the
// same number of variants, so the hash picks the same story shape in both.
// Slovak keeps names in the nominative and the verbs in the present tense: a
// club's name has its own gender, and the past tense would have to agree.

function hash(s: string): number {
  let h = 2166136261
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619)
  return h >>> 0
}

type Noun = 'point' | 'round' | 'club' | 'place' | 'game' | 'win' | 'goal' | 'draw'
/** "3 points" / "3 body": a count with its noun, in this language. */
const plural = (k: number, noun: Noun) => t(`press.n.${noun}` as 'press.n.point', { count: k })
const listNames = (names: string[]) =>
  names.length <= 1 ? names.join('') : t('press.list', { first: names.slice(0, -1).join(', '), last: names[names.length - 1] })
const x10 = (v: number) => dec(v / 10, 1)

type Words = { headline: string; standfirst: string }
const w = (kind: string, i: number, h: object, s: object): Words => ({
  headline: t(`press.${kind}.h${i}` as 'press.summit.h0', h as never) as unknown as string,
  standfirst: t(`press.${kind}.s${i}` as 'press.summit.s0', s as never) as unknown as string,
})

const WRITERS: Record<StoryKind, (s: Story) => Words[]> = {
  summit: ({ names: [a, b], n }) => {
    const pts = plural(n.gap, 'point')
    return [0, 1, 2].map(i => ({
      headline: t(`press.summit.h${i}` as 'press.summit.h0', { a, b }),
      standfirst: t(`press.summit.s${i}${n.gap === 0 ? 'Level' : 'Gap'}` as 'press.summit.s0Level', { a, b, pts }),
    }))
  },
  runawayLeader: ({ names: [a, b], n }) => {
    const v = { a, b, pts: plural(n.gap, 'point'), gap: n.gap, rounds: plural(n.left, 'round') }
    return [0, 1, 2].map(i => w('runawayLeader', i, v, v))
  },
  titleRace: ({ names, n }) => {
    const v = { clubs: plural(n.clubs, 'club'), pts: plural(n.spread, 'point'), names: listNames(names), rounds: plural(n.left, 'round'), tight: plural(TIGHT, 'point') }
    return [0, 1, 2].map(i => w('titleRace', i, v, v))
  },
  relegationBattle: ({ names, n }) => {
    const v = { clubs: plural(n.clubs, 'club'), places: plural(n.places, 'place'), names: listNames(names), rounds: plural(n.left, 'round'), tight: plural(TIGHT, 'point') }
    return [0, 1, 2].map(i => w('relegationBattle', i, v, v))
  },
  sixPointer: ({ names: [a, b], n }) => {
    const pts = plural(n.gap, 'point')
    const v = {
      a, b, rounds: plural(n.left, 'round'),
      gap: n.gap === 0 ? t('press.sixPointer.level') : t('press.sixPointer.apart', { pts }),
      between: n.gap === 0 ? t('press.sixPointer.nothingBetween') : t('press.sixPointer.between', { pts }),
      where: n.top ? t('press.sixPointer.nearTop') : t('press.sixPointer.nearBottom'),
      what: n.top ? t('press.sixPointer.theTop') : t('press.sixPointer.theDrop'),
    }
    return [0, 1, 2].map(i => w('sixPointer', i, v, v))
  },
  hotStreak: ({ names: [a], n }) => [0, 1, 2].map(i => w('hotStreak', i, { a }, { n: n.pts })),
  coldStreak: ({ names: [a], n }) => [0, 1, 2].map(i => w('coldStreak', i, { a }, { pts: plural(n.pts, 'point') })),
  unbeaten: ({ names: [a], n }) => [0, 1, 2].map(i => w('unbeaten', i, { a, n: n.played, games: plural(n.played, 'game') }, { n: n.played, games: plural(n.played, 'game') })),
  winless: ({ names: [a], n }) => [0, 1, 2].map(i => w('winless', i, { a, n: n.played, games: plural(n.played, 'game') }, { n: n.played, games: plural(n.played, 'game') })),
  logJam: ({ names, n }) => {
    const v = { clubs: plural(n.clubs, 'club'), n: n.pts, pts: plural(n.pts, 'point'), names: listNames(names) }
    return [0, 1, 2].map(i => w('logJam', i, v, v))
  },
  drawSpecialists: ({ names: [a], n }) => {
    const v = { a, d: n.drawn, draws: plural(n.drawn, 'draw'), p: n.played }
    return [0, 1, 2].map(i => w('drawSpecialists', i, v, v))
  },
  thrashing: ({ names: [a, b], n }) => [0, 1, 2].map(i => w('thrashing', i, { a, b, goals: plural(n.for, 'goal') }, { a, b, for: n.for, against: n.against })),
  giantKilling: ({ names: [a, b], n }) => {
    const v = { a, b, for: n.for, against: n.against, was: ordinal(n.wasPos), beat: ordinal(n.beatPos) }
    return [0, 1, 2].map(i => w('giantKilling', i, v, v))
  },
  europeRace: ({ names, n }) => {
    const v = { clubs: plural(n.clubs, 'club'), names: listNames(names), rounds: plural(n.left, 'round'), tight: plural(TIGHT, 'point') }
    return [0, 1, 2].map(i => w('europeRace', i, v, v))
  },
  injury: ({ names: [player, club, standIn], n }) => {
    const games = plural(n.out, 'game')
    const hurt = n.minute ? t('press.injury.hurtAt', { min: ordinal(n.minute) }) : ''
    const covers = (k: string) => (standIn ? t(`press.injury.${k}` as 'press.injury.stepsIn', { name: standIn }) : '')
    return [
      w('injury', 0, { player }, { club, games, hurt, stand: covers('stepsIn') }),
      w('injury', 1, { club }, { player, games, stand: covers('covers') }),
      { headline: t('press.injury.h2', { player }), standfirst: (n.out === 1 ? t('press.injury.missesNext') : t('press.injury.outFor', { games })) + '.' + covers('comesIn') },
    ]
  },
  suspension: ({ names: [player, club, standIn], n }) => {
    const games = plural(n.out, 'game')
    const covers = (k: string) => (standIn ? t(`press.injury.${k}` as 'press.injury.stepsIn', { name: standIn }) : '')
    return [
      w('suspension', 0, { player }, { club, games, stand: covers('comesIn') }),
      { headline: t('press.suspension.h1', { player }), standfirst: (n.out === 1 ? t('press.injury.missesNext') : t('press.suspension.missesN', { n: n.out, games })) + '.' + covers('covers') },
    ]
  },
  unbeatenRun: ({ names: [a], n }) => [0, 1, 2].map(i => w('unbeatenRun', i, { a, n: n.run, games: plural(n.run, 'game') }, { n: n.run, games: plural(n.run, 'game') })),
  runEnds: ({ names: [a, b], n }) => {
    const games = plural(n.run, 'game'), wins = plural(n.run, 'win')
    return [0, 1, 2].map(i => w('runEnds', i, { a, b }, {
      a, b, for: n.for, against: n.against,
      what: t(`press.runEnds.what${i}${n.unbeaten ? 'Unbeaten' : 'Wins'}` as 'press.runEnds.what0Wins', { n: n.run, games, wins }),
    }))
  },
  zigZag: ({ names: [a], n }) => [0, 1, 2].map(i => w('zigZag', i, { a }, { n: n.games, games: plural(n.games, 'game') })),
  yoyo: ({ names: [a], n }) => [
    { headline: t(n.newer > n.older ? 'press.yoyo.h0Up' : 'press.yoyo.h0Down', { a }), standfirst: t('press.yoyo.s0', { older: plural(n.older, 'point'), newer: plural(n.newer, 'point') }) },
    w('yoyo', 1, { a }, { o: n.older, nw: n.newer, older: plural(n.older, 'point'), newer: plural(n.newer, 'point') }),
  ],
  goalFest: ({ names: [a], n }) => [0, 1].map(i => w('goalFest', i, { a }, { x: x10(n.per10), n: n.played, games: plural(n.played, 'game') })),
  tightGames: ({ names: [a], n }) => [0, 1].map(i => w('tightGames', i, { a }, { x: x10(n.per10), n: n.played, games: plural(n.played, 'game') })),
  leaky: ({ names: [a], n }) => [0, 1].map(i => w('leaky', i, { a }, { c: n.conceded, goals: plural(n.conceded, 'goal'), p: n.played, x: x10(n.per10) })),
  fortress: ({ names: [a], n }) => [0, 1].map(i => w('fortress', i, { a }, { goals: plural(n.conceded, 'goal'), n: n.played, games: plural(n.played, 'game'), x: x10(n.per10) })),
  playerForm: ({ names: [player, club], n }) => {
    const v = { player, club, x: x10(n.avg10), n: n.apps, games: plural(n.apps, 'game') }
    return [0, 1, 2].map(i => w('playerForm', i, v, v))
  },
  masterclass: ({ names: [player, club, opp], n }) => {
    const r = x10(n.r10)
    return [0, 1, 2].map(i => w('masterclass', i, { player, r }, {
      player, club, r, for: n.for, against: n.against,
      opp: opp && i < 2 ? t(`press.masterclass.opp${i}` as 'press.masterclass.opp0', { opp }) : '',
    }))
  },
  // ── The cups (F-01) ──
  yourMatch: ({ names: [you, opp], n, matchday }) => {
    const r = n.for > n.against ? 'w' : n.for === n.against ? 'd' : 'l'
    const v = { you, opp, for: n.for, against: n.against, md: matchday }
    return [0, 1].map(i => ({
      headline: t(`press.yourMatch.${r}H${i}` as 'press.yourMatch.wH0', v),
      standfirst: t(`press.yourMatch.${r}S${i}` as 'press.yourMatch.wS0', v),
    }))
  },
  phaseDecided: ({ names: [you], n }) => [0, 1].map(i => ({
    headline: t(`press.phaseDecided.f${n.fate}H${i}` as 'press.phaseDecided.f0H0', { you }),
    standfirst: t('press.phaseDecided.s', { place: ordinal(n.pos), pts: plural(n.pts, 'point') }),
  })),
  groupDecided: ({ names: [you, g], n }) => [0, 1].map(i => ({
    headline: t(`press.groupDecided.f${n.fate}H${i}` as 'press.groupDecided.f0H0', { you, g }),
    standfirst: t('press.groupDecided.s', { pts: plural(n.pts, 'point'), g }),
  })),
  bestThird: ({ names: [you], n }) => [0, 1].map(i => ({
    headline: t(`press.bestThird.${n.through ? 'in' : 'out'}H${i}` as 'press.bestThird.inH0', { you }),
    standfirst: t('press.bestThird.s', { place: ordinal(n.rank), n: n.of }),
  })),
  yourTie: ({ names: [you, opp], n }) => [0, 1].map(i => ({
    headline: t(`press.yourTie.${n.won ? 'won' : 'lost'}H${i}` as 'press.yourTie.wonH0', { you, opp }),
    standfirst: t('press.yourTie.s', { score: scoreText(n), opp }),
  })),
  koUpset: ({ names: [a, b], n }) => [0, 1].map(i => w('koUpset', i, { a, b }, { a, b, score: scoreText(n), gap: n.gap })),
  shootout: ({ names: [a, b], n }) => [0, 1].map(i => w('shootout', i, { a, b }, { a, b, score: scoreText(n) })),
  koRound: ({ names: [a, b], n }) => [0, 1].map(i => w('koRound', i, { a, b }, { a, b, score: scoreText(n) })),
  cupWinners: ({ names: [a, b], n }) => [0, 1].map(i => w('cupWinners', i, { a, b }, { a, b, score: scoreText(n) })),
  champions: ({ names: [a, b], n }) => {
    const pts = plural(n.gap, 'point')
    const margin = n.gap === 0 ? t('press.champions.onGd') : t('press.champions.byPts', { pts })
    const set = n.gap <= TIGHT ? 'tight' : 'clear'
    return [0, 1].map(i => ({
      headline: t(`press.champions.${set}H${i}` as 'press.champions.tightH0', { a, b }),
      standfirst: t(`press.champions.${set}S${i}` as 'press.champions.tightS0', { a, b, pts, margin }),
    }))
  },
  survived: ({ names: [a, b], n }) => {
    const pts = plural(n.gap, 'point')
    const v = {
      a, b, pts,
      how: n.gap === 0 ? t('press.survived.howGd') : t('press.survived.howPts', { pts }),
      how2: n.gap === 0 ? t('press.survived.how2Gd') : pts,
      how3: n.gap === 0 ? t('press.survived.how3Gd') : t('press.survived.how3Pts', { pts }),
      fate: n.playoff ? t('press.survived.fatePlayoff', { b }) : t('press.survived.fateDown', { b }),
      fate2: n.playoff ? t('press.survived.fate2Playoff') : t('press.survived.fate2Down'),
    }
    return [0, 1, 2].map(i => w('survived', i, v, v))
  },
}

/** A tie's score from the first-named side: "2–1", or "1–1, 4–3 on penalties". */
function scoreText(n: Record<string, number>): string {
  const score = t('press.score', { a: n.for, b: n.against })
  return n.pens ? t('press.scorePens', { score, a: n.pf, b: n.pa }) : score
}

/**
 * When a story ran: "Matchday 12 of 38", a cup's "League Phase · Matchday 3 of
 * 8", or a knockout's "Round of 16". `short` is the list's "MD 12/38", `day`
 * the ticker's "MD 12", `caps` the share card's.
 */
export function storyWhen(s: Story, style: 'long' | 'short' | 'day' | 'caps' = 'long'): string {
  const md = style === 'short' ? t('season.mdOf', { md: s.matchday, total: s.totalMatchdays })
    : style === 'day' ? t('season.md', { md: s.matchday })
    : t('hub.mdOf', { md: s.matchday, total: s.totalMatchdays })
  // A list row has no room for the stage: a cup's knockout shows its round, a table its matchday.
  const out = !s.stage ? md : s.totalMatchdays === 0 ? label(s.stage) : style === 'short' || style === 'day' ? md : `${label(s.stage)} · ${md}`
  return style === 'caps' ? out.toUpperCase() : out
}

export function storyText(s: Story): Words {
  const variants = WRITERS[s.kind](s)
  return variants[hash(s.id) % variants.length]
}

// ── The story, opened (Phase 5, D6) ──────────────────────────────────────────
// A short paragraph set under the headline, built from the frozen rows the
// story carries, so it says exactly what the table said that week — never
// what it says now.
export function storyBody(s: Story): string[] {
  let r = s.rows
  if (r.length === 0) return []
  const pts = (x: StoryRow) => plural(x.points, 'point')
  // P8-25: a player story is about the player, then where the club stood.
  if (s.kind === 'injury' || s.kind === 'suspension') {
    const [player, , standIn] = s.names
    const span = s.n.from === s.n.to ? t('press.body.mdOne', { md: s.n.from }) : t('press.body.mdRange', { a: s.n.from, b: s.n.to })
    return [
      t('press.body.misses', { player, span, why: s.kind === 'suspension' ? t('press.body.throughSuspension') : '' }),
      ...(standIn ? [t('press.body.coverIn', { name: standIn })] : []),
      t('press.body.whenItHappened', { club: r[0].clubName, place: ordinal(r[0].pos), pts: pts(r[0]) }),
    ]
  }
  // P8-138: a player story is about the player first, then the club's place.
  if (s.kind === 'playerForm' || s.kind === 'masterclass') {
    const [player, club] = s.names
    return [
      s.kind === 'masterclass'
        ? t('press.body.ratedOn', { player, r: x10(s.n.r10), md: s.matchday })
        : t('press.body.averaged', { player, x: x10(s.n.avg10), n: s.n.apps, games: plural(s.n.apps, 'game') }),
      t('press.body.afterIt', { club, place: ordinal(r[0].pos), pts: pts(r[0]) }),
    ]
  }
  // A knockout story is about one tie: the round and the score.
  if (s.totalMatchdays === 0 && s.match) {
    const m = s.match
    return [t('press.body.tie', { stage: label(s.stage ?? ''), a: m.homeName, b: m.awayName, score: scoreText({ for: m.homeGoals, against: m.awayGoals, pens: s.n.pens ?? 0, pf: s.n.mpa ?? 0, pa: s.n.mpb ?? 0 }) })]
  }
  // The best thirds' table says it all; a paragraph of eleven "were 3rd"s doesn't.
  if (s.kind === 'bestThird') return []
  // A story about you starts with you, wherever you stood.
  if (s.kind === 'yourMatch' || s.kind === 'phaseDecided' || s.kind === 'groupDecided') r = [...r.filter(x => x.isPlayer), ...r.filter(x => !x.isPlayer)]
  const left = s.totalMatchdays - s.matchday
  const when = left === 0 ? t('press.body.finalDay') : t('press.body.after', { md: s.matchday, total: s.totalMatchdays, left })
  const first = t('press.body.first', { club: r[0].clubName, place: ordinal(r[0].pos), pts: pts(r[0]), when })
  const rest = r.slice(1).map(x => t('press.body.restItem', { club: x.clubName, place: ordinal(x.pos), pts: pts(x) })).join(', ')
  return rest ? [first, t('press.body.around', { rest })] : [first]
}
