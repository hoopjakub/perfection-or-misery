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
  const finalDay = md === total
  const rows = rowsOf(now)

  // P8-25: your players hurt or banned this matchday. These are written from
  // matchday 1 — the quarter-season rule exists to keep thin STATISTICS out of
  // the press, and an injury isn't a statistic — and they sit outside the
  // one-a-round cap, because they're about you and rare (a few a season).
  const yourRow = rows.find(r => r.isPlayer)
  const absenceStories: Story[] = yourRow ? (ctx.absences ?? [])
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
    }) : []

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
      if (race.length >= 3) add('titleRace', 'title', race, { clubs: race.length, spread: leader.points - race[race.length - 1].points, left })

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
      if (t.lost === 0 && t.played >= Math.ceil(total / 4)) add('unbeaten', r.clubId, [r], { played: t.played })
      if (t.won === 0 && t.played >= Math.ceil(total / 4)) add('winless', r.clubId, [r], { played: t.played })
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
    for (const [pts, jam] of byPoints) {
      if (jam.length >= JAM_SIZE) add('logJam', 'jam', jam, { clubs: jam.length, pts })
    }
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

function hash(s: string): number {
  let h = 2166136261
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619)
  return h >>> 0
}

const plural = (k: number, one: string, many = `${one}s`) => `${k} ${k === 1 ? one : many}`
const ordinalOf = (v: number) => {
  const suf = ['th', 'st', 'nd', 'rd'], m = v % 100
  return `${v}${suf[(m - 20) % 10] ?? suf[m] ?? suf[0]}`
}
const listNames = (names: string[]) =>
  names.length <= 1 ? names.join('') : `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`

type Words = { headline: string; standfirst: string }

const WRITERS: Record<StoryKind, (s: Story) => Words[]> = {
  summit: ({ names: [a, b], n }) => [
    { headline: `${a} go top`, standfirst: `${n.gap === 0 ? `Level on points with ${b}` : `${plural(n.gap, 'point')} clear of ${b}`}, for now.` },
    { headline: `New name at the summit: ${a}`, standfirst: `${b} ${n.gap === 0 ? 'are level' : `trail by ${plural(n.gap, 'point')}`}.` },
    { headline: `${a} take first place`, standfirst: `${b} ${n.gap === 0 ? 'are level on points' : `are ${plural(n.gap, 'point')} back`}.` },
  ],
  runawayLeader: ({ names: [a, b], n }) => [
    { headline: `${a} are running away with it`, standfirst: `${plural(n.gap, 'point')} clear of ${b} with ${plural(n.left, 'round')} left.` },
    { headline: `${plural(n.gap, 'point')}. ${a} are out of sight`, standfirst: `${b} are the nearest, and it isn't near.` },
    { headline: `Is it over already? ${a} lead by ${n.gap}`, standfirst: `${plural(n.left, 'round')} for ${b} to find a way back.` },
  ],
  titleRace: ({ names, n }) => [
    { headline: `${plural(n.clubs, 'club')}, ${plural(n.spread, 'point')}, one title`, standfirst: `${listNames(names)} with ${plural(n.left, 'round')} to go.` },
    { headline: `Nobody wants to blink`, standfirst: `${listNames(names)} are separated by ${plural(n.spread, 'point')}.` },
    { headline: `The title race is wide open`, standfirst: `${plural(n.clubs, 'club')} within ${plural(TIGHT, 'point')} of the top.` },
  ],
  relegationBattle: ({ names, n }) => [
    { headline: `${plural(n.clubs, 'club')}, ${plural(n.places, 'place')}. Somebody's going down`, standfirst: `${listNames(names)} are all within ${TIGHT} points of the line.` },
    { headline: `The scrap at the bottom tightens`, standfirst: `${plural(n.left, 'round')} left and ${listNames(names)} can't pull away.` },
    { headline: `Every point counts down there`, standfirst: `${listNames(names)} are tangled around the drop.` },
  ],
  sixPointer: ({ names: [a, b], n }) => [
    { headline: `${a} v ${b}: a six-pointer`, standfirst: `${n.gap === 0 ? 'Level on points' : `${plural(n.gap, 'point')} apart`} ${n.top ? 'near the top' : 'near the bottom'}, and they meet next.` },
    { headline: `Next up, the one that matters: ${a} v ${b}`, standfirst: `${n.gap === 0 ? 'Nothing between them' : `${plural(n.gap, 'point')} between them`} with ${plural(n.left, 'round')} left.` },
    { headline: `${a} and ${b} meet with everything on it`, standfirst: `${n.top ? 'The top of the table' : 'The drop'} could look very different by the end of next round.` },
  ],
  hotStreak: ({ names: [a], n }) => [
    { headline: `${a} can't stop winning`, standfirst: `${n.pts} points from the last five.` },
    { headline: `Nobody is hotter than ${a}`, standfirst: `${n.pts} of the last 15 points.` },
    { headline: `${a} are on a run`, standfirst: `${n.pts} points from five games.` },
  ],
  coldStreak: ({ names: [a], n }) => [
    { headline: `${a} are in freefall`, standfirst: `${plural(n.pts, 'point')} from the last five.` },
    { headline: `What's gone wrong at ${a}`, standfirst: `${plural(n.pts, 'point')} in five games.` },
    { headline: `${a} can't buy a win`, standfirst: `${plural(n.pts, 'point')} from their last 15.` },
  ],
  unbeaten: ({ names: [a], n }) => [
    { headline: `${a} still haven't lost`, standfirst: `${n.played} games in, unbeaten.` },
    { headline: `Can anyone beat ${a}`, standfirst: `Unbeaten after ${n.played}.` },
    { headline: `${n.played} games, no defeats: ${a}`, standfirst: `The longer it goes, the louder it gets.` },
  ],
  winless: ({ names: [a], n }) => [
    { headline: `${a} are still waiting for a win`, standfirst: `${n.played} games, no victories.` },
    { headline: `No wins in ${n.played} for ${a}`, standfirst: `The wait goes on.` },
    { headline: `When will ${a} win a game?`, standfirst: `${n.played} played, and not one of them won.` },
  ],
  logJam: ({ names, n }) => [
    { headline: `${plural(n.clubs, 'club')} on ${n.pts} points`, standfirst: `${listNames(names)} can't be separated.` },
    { headline: `Traffic jam on ${n.pts} points`, standfirst: `${listNames(names)}, all level.` },
    { headline: `Goal difference is doing the work`, standfirst: `${listNames(names)} are all on ${n.pts}.` },
  ],
  drawSpecialists: ({ names: [a], n }) => [
    { headline: `${a}, the draw specialists`, standfirst: `${n.drawn} draws from ${n.played} games.` },
    { headline: `${a} keep sharing the points`, standfirst: `${n.drawn} of their ${n.played} games ended level.` },
    { headline: `Hard to beat, harder to watch win: ${a}`, standfirst: `${n.drawn} draws already, from ${n.played}.` },
  ],
  thrashing: ({ names: [a, b], n }) => [
    { headline: `${a} put ${n.for} past ${b}`, standfirst: `${n.for}–${n.against}, and it could have been more.` },
    { headline: `${b} taken apart`, standfirst: `${a} win ${n.for}–${n.against}.` },
    { headline: `A statement from ${a}`, standfirst: `${n.for}–${n.against} against ${b}.` },
  ],
  giantKilling: ({ names: [a, b], n }) => [
    { headline: `${a} shock ${b}`, standfirst: `${ordinalOf(n.wasPos)} beat ${ordinalOf(n.beatPos)}, ${n.for}–${n.against}.` },
    { headline: `Nobody saw that coming: ${a} beat ${b}`, standfirst: `${n.for}–${n.against}, from ${ordinalOf(n.wasPos)} in the table.` },
    { headline: `${b} tripped up by ${a}`, standfirst: `A ${n.for}–${n.against} defeat against a side that started the round ${ordinalOf(n.wasPos)}.` },
  ],
  europeRace: ({ names, n }) => [
    { headline: `The race for Europe`, standfirst: `${listNames(names)} are within ${TIGHT} points of the last place in it, with ${plural(n.left, 'round')} left.` },
    { headline: `${plural(n.clubs, 'club')} chasing one European place`, standfirst: `${listNames(names)}.` },
    { headline: `Europe is still up for grabs`, standfirst: `${listNames(names)} can all still get there.` },
  ],
  injury: ({ names: [player, club, standIn], n }) => [
    { headline: `${player} is out`, standfirst: `${club} lose him for ${plural(n.out, 'game')}${n.minute ? `, hurt in the ${ordinalOf(n.minute)} minute` : ''}.${standIn ? ` ${standIn} steps in.` : ''}` },
    { headline: `Injury blow for ${club}`, standfirst: `${player} will miss ${plural(n.out, 'game')}.${standIn ? ` ${standIn} covers.` : ''}` },
    { headline: `${player} limps off`, standfirst: `${n.out === 1 ? 'He misses the next game' : `Out for ${plural(n.out, 'game')}`}.${standIn ? ` ${standIn} comes in.` : ''}` },
  ],
  suspension: ({ names: [player, club, standIn], n }) => [
    { headline: `${player} suspended`, standfirst: `${club} will be without him for ${plural(n.out, 'game')}.${standIn ? ` ${standIn} comes in.` : ''}` },
    { headline: `${player} banned`, standfirst: `${n.out === 1 ? 'He misses the next game' : `He misses the next ${n.out}`}.${standIn ? ` ${standIn} covers.` : ''}` },
  ],
  unbeatenRun: ({ names: [a], n }) => [
    { headline: `${a} haven't lost in ${n.run}`, standfirst: `${n.run} games without a defeat.` },
    { headline: `${n.run} and counting: ${a} are hard to beat`, standfirst: `Nobody has beaten them in ${plural(n.run, 'game')}.` },
    { headline: `${a}, unbeaten in ${n.run}`, standfirst: `The run goes on.` },
  ],
  runEnds: ({ names: [a, b], n }) => [
    { headline: `${b} end ${a}'s run`, standfirst: `${n.unbeaten ? `Unbeaten in ${n.run}` : `${n.run} straight wins`}, until ${n.for}–${n.against}.` },
    { headline: `The run is over for ${a}`, standfirst: `${n.unbeaten ? `${n.run} games unbeaten` : `${plural(n.run, 'win')} in a row`}, ended by ${b}.` },
    { headline: `${b} do what nobody could`, standfirst: `${a}'s ${n.unbeaten ? `${n.run}-game unbeaten run` : `${n.run}-game winning run`} is over.` },
  ],
  zigZag: ({ names: [a], n }) => [
    { headline: `Win one, lose one: ${a}`, standfirst: `The last ${n.games} have gone win, defeat, win, defeat.` },
    { headline: `Which ${a} will turn up?`, standfirst: `They haven't strung two results together in ${n.games} games.` },
    { headline: `${a} can't settle`, standfirst: `${n.games} games, never the same result twice in a row.` },
  ],
  yoyo: ({ names: [a], n }) => [
    { headline: n.newer > n.older ? `${a} have turned it around` : `${a} can't hold their form`, standfirst: `${plural(n.older, 'point')} from five, then ${plural(n.newer, 'point')} from the next five.` },
    { headline: `Which is the real ${a}?`, standfirst: `${n.older} points, then ${n.newer}: two very different sides in ten games.` },
  ],
  goalFest: ({ names: [a], n }) => [
    { headline: `Goals guaranteed with ${a}`, standfirst: `${(n.per10 / 10).toFixed(1)} a game in their matches, at both ends.` },
    { headline: `Nobody's games are wilder than ${a}'s`, standfirst: `${(n.per10 / 10).toFixed(1)} goals a game over ${n.played}.` },
  ],
  tightGames: ({ names: [a], n }) => [
    { headline: `Tight games are ${a}'s habit`, standfirst: `${(n.per10 / 10).toFixed(1)} goals a game in their matches, both ends together.` },
    { headline: `Don't expect goals from ${a}`, standfirst: `${(n.per10 / 10).toFixed(1)} a game over ${n.played}.` },
  ],
  leaky: ({ names: [a], n }) => [
    { headline: `${a} can't stop conceding`, standfirst: `${n.conceded} goals let in from ${n.played} games.` },
    { headline: `The back door is open at ${a}`, standfirst: `${(n.per10 / 10).toFixed(1)} conceded a game.` },
  ],
  fortress: ({ names: [a], n }) => [
    { headline: `Nothing gets past ${a}`, standfirst: `${plural(n.conceded, 'goal')} conceded in ${n.played} games.` },
    { headline: `${a} have the meanest defence around`, standfirst: `${(n.per10 / 10).toFixed(1)} conceded a game.` },
  ],
  playerForm: ({ names: [player, club], n }) => [
    { headline: `${player} is in the form of his life`, standfirst: `An average of ${(n.avg10 / 10).toFixed(1)} over his last ${n.apps} for ${club}.` },
    { headline: `Nobody is playing better than ${player}`, standfirst: `${(n.avg10 / 10).toFixed(1)} a game for ${club}, ${n.apps} games running.` },
    { headline: `${player} keeps delivering`, standfirst: `${club}'s man averages ${(n.avg10 / 10).toFixed(1)} over his last ${n.apps}.` },
  ],
  masterclass: ({ names: [player, club, opp], n }) => [
    { headline: `A ${(n.r10 / 10).toFixed(1)}: ${player}'s masterclass`, standfirst: `${club} ${n.for}–${n.against}${opp ? ` against ${opp}` : ''}, and he was the reason.` },
    { headline: `${player}, near perfect`, standfirst: `Rated ${(n.r10 / 10).toFixed(1)} in ${club}'s ${n.for}–${n.against}${opp ? ` with ${opp}` : ''}.` },
    { headline: `The performance of the season? ${player}`, standfirst: `${(n.r10 / 10).toFixed(1)} out of 10 for ${club}.` },
  ],
  champions: ({ names: [a, b], n }) => n.gap <= TIGHT
    ? [
        { headline: `${a} are champions on the final day`, standfirst: `${b} finish ${plural(n.gap, 'point')} behind.` },
        { headline: `${a} hold their nerve`, standfirst: `Champions by ${n.gap === 0 ? 'goal difference' : plural(n.gap, 'point')} over ${b}.` },
      ]
    : [
        { headline: `${a} are champions`, standfirst: `${plural(n.gap, 'point')} clear of ${b} at the end.` },
        { headline: `The title is ${a}'s`, standfirst: `Nobody got close: ${b} finish ${plural(n.gap, 'point')} behind.` },
      ],
  survived: ({ names: [a, b], n }) => [
    { headline: `${a} survive`, standfirst: `${n.gap === 0 ? 'On goal difference' : `By ${plural(n.gap, 'point')}`}. ${b} ${n.playoff ? 'go into the play-off' : 'go down'}.` },
    { headline: `${a} stay up`, standfirst: `${n.gap === 0 ? 'Only goal difference' : plural(n.gap, 'point')} kept them above ${b}, who ${n.playoff ? 'face the play-off' : 'are relegated'}.` },
    { headline: `Heartbreak for ${b}`, standfirst: `${a} ${n.gap === 0 ? 'survive on goal difference' : `finish ${plural(n.gap, 'point')} ahead`}. ${b} ${n.playoff ? 'go into the play-off' : 'go down'}.` },
  ],
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
  const r = s.rows
  if (r.length === 0) return []
  // P8-25: a player story is about the player, then where his club stood.
  if (s.kind === 'injury' || s.kind === 'suspension') {
    const [player, , standIn] = s.names
    const span = s.n.from === s.n.to ? `matchday ${s.n.from}` : `matchdays ${s.n.from} to ${s.n.to}`
    return [
      `${player} misses ${span}${s.kind === 'suspension' ? ' through suspension' : ''}.`,
      ...(standIn ? [`${standIn} comes in to cover.`] : []),
      `${r[0].clubName} were ${ordinalOf(r[0].pos)} on ${r[0].points} point${r[0].points === 1 ? '' : 's'} when it happened.`,
    ]
  }
  // P8-138: a player story is about the player first, then his club's place.
  if (s.kind === 'playerForm' || s.kind === 'masterclass') {
    const [player, club] = s.names
    return [
      s.kind === 'masterclass'
        ? `${player} was rated ${(s.n.r10 / 10).toFixed(1)} on matchday ${s.matchday}.`
        : `${player} has averaged ${(s.n.avg10 / 10).toFixed(1)} over his last ${s.n.apps} games.`,
      `${club} were ${ordinalOf(r[0].pos)} on ${r[0].points} point${r[0].points === 1 ? '' : 's'} after it.`,
    ]
  }
  const pts = (x: StoryRow) => `${x.points} point${x.points === 1 ? '' : 's'}`
  const place = (x: StoryRow) => {
    const suf = ['th', 'st', 'nd', 'rd'], v = x.pos % 100
    return `${x.pos}${suf[(v - 20) % 10] ?? suf[v] ?? suf[0]}`
  }
  const left = s.totalMatchdays - s.matchday
  const when = left === 0 ? 'on the final day' : `after ${s.matchday} of ${s.totalMatchdays} matchdays, with ${left} to play`
  const first = `${r[0].clubName} were ${place(r[0])} on ${pts(r[0])} ${when}.`
  const rest = r.slice(1).map(x => `${x.clubName} ${place(x)} on ${pts(x)}`).join(', ')
  return rest ? [first, `Around them: ${rest}.`] : [first]
}
