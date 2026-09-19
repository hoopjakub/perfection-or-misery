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

export type StoryKind =
  | 'summit' | 'runawayLeader' | 'titleRace' | 'relegationBattle' | 'sixPointer'
  | 'hotStreak' | 'coldStreak' | 'unbeaten' | 'winless' | 'logJam' | 'drawSpecialists'
  | 'champions' | 'survived'

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
}

/** The shape the season screen already keeps per matchday. */
export type PressSnapshot = {
  matchday: number
  standings: {
    clubId: string; clubName: string; isPlayer: boolean
    stats: { played: number; won: number; drawn: number; lost: number; goalsFor: number; goalsAgainst: number; points: number }
  }[]
  fixtures: { home: { clubId: string }; away: { clubId: string }; result: { homeGoals: number; awayGoals: number } | null }[]
}

export type PressContext = {
  totalMatchdays: number
  zones: (ZoneKey | null)[]
  /** Next matchday's pairings, for six-pointers. */
  next?: { homeId: string; awayId: string }[]
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

const cooldownFor = (kind: StoryKind, total: number) => {
  const form = kind === 'hotStreak' || kind === 'coldStreak' || kind === 'unbeaten' || kind === 'winless' || kind === 'drawSpecialists'
  return Math.max(2, Math.round(((form ? 9 : 7) * total) / 38))
}

// Higher first. Final-day stories always lead.
const PRIORITY: StoryKind[] = [
  'champions', 'survived', 'summit', 'runawayLeader', 'titleRace', 'relegationBattle',
  'sixPointer', 'hotStreak', 'coldStreak', 'unbeaten', 'winless', 'logJam', 'drawSpecialists',
]

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
  if (md < Math.ceil(total / 4) && !finalDay) return []

  const rows = rowsOf(now)
  const n = rows.length
  const left = total - md
  const prevLeader = history.length > 1 ? history[history.length - 2].standings[0]?.clubId : undefined
  const form = lastFive(history)
  const cands: Omit<Story, 'id' | 'matchday' | 'totalMatchdays' | 'involvesPlayer'>[] = []
  const add = (kind: StoryKind, subject: string, about: StoryRow[], nums: Record<string, number>) =>
    cands.push({ kind, subject, rows: about, n: nums, names: about.map(r => r.clubName) })

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
      if (race.length >= 3) add('titleRace', 'title', race.slice(0, 5), { clubs: race.length, spread: leader.points - race[race.length - 1].points, left })

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
      if (f.length === 5 && pts >= HOT_FROM_FIVE) add('hotStreak', r.clubId, [r], { pts })
      if (f.length === 5 && pts <= COLD_FROM_FIVE) add('coldStreak', r.clubId, [r], { pts })
      if (t.lost === 0 && t.played >= Math.ceil(total / 4)) add('unbeaten', r.clubId, [r], { played: t.played })
      if (t.won === 0 && t.played >= Math.ceil(total / 4)) add('winless', r.clubId, [r], { played: t.played })
      if (t.drawn >= 6 && t.drawn / t.played >= 0.4) add('drawSpecialists', r.clubId, [r], { drawn: t.drawn, played: t.played })
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

  return picked.map(c => ({ ...c, id: `${c.kind}:${c.subject}:${md}`, matchday: md, totalMatchdays: total }))
}

// ── Words ────────────────────────────────────────────────────────────────────

function hash(s: string): number {
  let h = 2166136261
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619)
  return h >>> 0
}

const plural = (k: number, one: string, many = `${one}s`) => `${k} ${k === 1 ? one : many}`
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
  ],
  winless: ({ names: [a], n }) => [
    { headline: `${a} are still waiting for a win`, standfirst: `${n.played} games, no victories.` },
    { headline: `No wins in ${n.played} for ${a}`, standfirst: `The wait goes on.` },
  ],
  logJam: ({ names, n }) => [
    { headline: `${plural(n.clubs, 'club')} on ${n.pts} points`, standfirst: `${listNames(names)} can't be separated.` },
    { headline: `Traffic jam on ${n.pts} points`, standfirst: `${listNames(names)}, all level.` },
  ],
  drawSpecialists: ({ names: [a], n }) => [
    { headline: `${a}, the draw specialists`, standfirst: `${n.drawn} draws from ${n.played} games.` },
    { headline: `${a} keep sharing the points`, standfirst: `${n.drawn} of their ${n.played} games ended level.` },
  ],
  champions: ({ names: [a, b], n }) => [
    n.gap <= TIGHT
      ? { headline: `${a} are champions on the final day`, standfirst: `${b} finish ${plural(n.gap, 'point')} behind.` }
      : { headline: `${a} are champions`, standfirst: `${plural(n.gap, 'point')} clear of ${b} at the end.` },
  ],
  survived: ({ names: [a, b], n }) => [
    { headline: `${a} survive`, standfirst: `${n.gap === 0 ? 'On goal difference' : `By ${plural(n.gap, 'point')}`}. ${b} ${n.playoff ? 'go into the play-off' : 'go down'}.` },
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
