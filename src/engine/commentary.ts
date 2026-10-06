/**
 * Commentary, assembled from the events a match sheet already stores (07c C6
 * move 2, and P4-H's "commentary from the events" for the match screen).
 *
 * No prose generator and no new randomness: every line is built from an
 * event's own fields — who, when, how, off whose assist — and the phrasing is
 * picked from a small set by hashing the event itself, so the same match reads
 * the same way every time it's opened, live or afterwards.
 *
 * Between events a quiet line reads the state of play from the frame (who has
 * the ball, who is shooting), so the commentary never goes blank for twenty
 * minutes the way an event list would.
 */

import { t } from '@/i18n'
import type { MatchEvent, MatchStats } from '@/types/match-stats'
import { buildShotMap } from './match-geometry'
import { mulberry32, deriveSeed } from '@/lib/rng'

/** The sending-off card's heading; the feed draws that one card in red. */
export const SENT_OFF = t('com.title.sentOff')

export type CommentaryLine = {
  minute: string; text: string; big: boolean; isHome?: boolean
  /** The card's heading ("Goal", "Booked", "Chalked off"…); a line without
   *  one is a plain row in the feed, not a card (P8-33). P8.5-33: the words
   *  are ours, not FotMob's "Goal!" / "Yellow card" / "Substitution". */
  title?: string
  /** Who the card is about, shown on its own row with the crest. */
  player?: string
}

function hash(s: string): number {
  let h = 2166136261
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619)
  return h >>> 0
}

const pick = <T,>(options: T[], key: string): T => options[hash(key) % options.length]
/** One of a set of lines in src/i18n (com.<set>.0, .1…), chosen by the same hash. */
const say = (set: string, n: number, key: string, vars: Record<string, unknown>) =>
  t(`com.${set}.${hash(key) % n}` as 'com.own.0', vars as never) as unknown as string
const minuteOf = (e: { minute: number; plus?: number }) => `${e.minute}${e.plus ? `+${e.plus}` : ''}'`
const last = (name: string) => name.split(' ').slice(-1)[0]

export function lineForEvent(e: MatchEvent, homeName: string, awayName: string): CommentaryLine {
  const team = e.isHome ? homeName : awayName
  const key = `${e.type}|${e.minute}|${e.plus ?? 0}|${e.playerId}`
  const who = last(e.playerName)
  let text: string
  switch (e.type) {
    case 'goal':
      if (e.ownGoal) {
        text = say('own', 2, key, { who, team })
      } else if (e.penalty) {
        text = say('pen', 3, key, { who, team, won: e.penWonName ? t('com.penWon', { name: last(e.penWonName) }) : '' })
      } else if (e.assistName) {
        text = say('assist', 3, key, { who, team, assist: last(e.assistName) })
      } else {
        text = say('solo', 3, key, { who, team })
      }
      if (e.errorByName) text += t('com.error', { name: last(e.errorByName) })
      return { minute: minuteOf(e), text, big: true, isHome: e.isHome, title: e.ownGoal ? t('com.title.own') : e.penalty ? t('com.title.penScored') : t('com.title.goal'), player: e.playerName }
    case 'penMissed':
      text = e.saved && e.keeperName
        ? say('saved', 2, key, { who, keeper: last(e.keeperName) })
        : say('missed', 2, key, { who })
      return { minute: minuteOf(e), text, big: true, isHome: e.isHome, title: e.saved ? t('com.title.penSaved') : t('com.title.penMissed'), player: e.playerName }
    case 'red':
      return { minute: minuteOf(e), text: say('red', 2, key, { who, team }), big: true, isHome: e.isHome, title: SENT_OFF, player: e.playerName }
    case 'yellow':
      return { minute: minuteOf(e), text: say('yellow', 3, key, { who }), big: false, isHome: e.isHome, title: t('com.title.booked'), player: e.playerName }
    case 'sub':
      return {
        minute: minuteOf(e),
        text: e.offPlayerName ? t('com.subOff', { team, who, off: last(e.offPlayerName) }) : t('com.subOn', { team, who }),
        big: false, isHome: e.isHome, title: t('com.title.change'), player: e.playerName,
      }
    case 'injury':
      return { minute: minuteOf(e), text: say('hurt', 2, key, { who, team }), big: false, isHome: e.isHome, title: t('com.title.injury'), player: e.playerName }
  }
}

export type PlayState = {
  homePossession: number
  homeShots: number
  awayShots: number
}

/** A line for the minutes between events, read from the state of play. */
export function quietLine(minute: number, state: PlayState | null, homeName: string, awayName: string): CommentaryLine {
  const m = `${minute}'`
  if (!state || minute <= 1) return { minute: m, text: t('com.kickOff'), big: false }
  const key = `quiet|${Math.floor(minute / 6)}`
  const on = state.homePossession >= 55 ? homeName : state.homePossession <= 45 ? awayName : null
  const shots = state.homeShots - state.awayShots
  const pressing = shots >= 4 ? homeName : shots <= -4 ? awayName : null
  if (minute === 45) return { minute: m, text: t('com.stoppage'), big: false }
  if (pressing) return { minute: m, text: say('pressing', 3, key, { team: pressing }), big: false }
  if (on) return { minute: m, text: say('holding', 3, key, { team: on }), big: false }
  return { minute: m, text: say('even', 3, key, {}), big: false }
}

/** Everything said up to `minute`, newest first — the live feed. */
export function commentaryUpTo(events: MatchEvent[], minute: number, homeName: string, awayName: string): CommentaryLine[] {
  return events
    .filter(e => e.minute <= minute)
    .map(e => lineForEvent(e, homeName, awayName))
    .reverse()
}

// ── The chances between the events (P8-33) ───────────────────────────────────
// The sheet stores goals, cards, changes and injuries as timed events, but the
// rest of a match only as counts: shots saved, off target, blocked and off the
// woodwork, corners, offsides, fouls. A real feed says all of those, so ours
// went quiet for twenty minutes at a time here. This gives each of them a
// minute and a line.
//
// The shots are the shot map's own (`buildShotMap`, the same seed), so the
// feed and the map describe the same match; the minutes and the corners,
// offsides and fouls come from their own seeded stream, salted apart so they
// can never move a goal or a shot. Same match, same feed, every time it's opened.
//
// Second slice: every foul with the free kick it gives away, named from the
// sheet's own `foulsCommitted`; the added time as it's announced; and now and
// then a goal VAR rules out. The VAR call is one of the side's own saved or
// wide shots told as it really went — in the net, then chalked off — so the
// shot map, the shot count and the score all stay exactly as they were.

const CHANCE_SALT = 0xc0ffee42
const FOUL_SALT = 0xf0a1f0a1
const VAR_SALT = 0x5ca1ab1e
// Roughly one goal ruled out every eight matches — about the rate a top
// league's VAR overturns a goal. Rare on purpose: it's a moment, not texture.
const VAR_RATE = 0.12

export type FeedKind = 'shot' | 'corner' | 'offside' | 'foul' | 'var' | 'added'
export type FeedItem = {
  /** Sort key. Whole minutes, except the added-time announcements, which sit
   *  just after their break's minute so they read before any stoppage event. */
  minute: number
  kind: FeedKind
  line: CommentaryLine
  /** A goal ruled out, for the timeline ("VAR · chalked off, offside"). */
  var?: { isHome: boolean; playerName: string; reason: string }
  /** Which shot this line tells (index into the non-goal, non-penalty shots of
   *  `buildShotMap`), so the shot map can step through shots in time (P8-47). */
  shot?: number
}

/** Minutes to place the counted things on, per side, when the match already
 *  has a clock of its own (the Deep Match's per-minute frames). */
export type FeedClock = Record<'shots' | 'corners' | 'offsides' | 'fouls', { home: number[]; away: number[] }>

export function chanceLines(detail: MatchStats, seed: number, homeName: string, awayName: string, clock?: FeedClock): FeedItem[] {
  const rng = mulberry32(deriveSeed(seed, CHANCE_SALT))
  const extra = detail.duration > 90 || detail.events.some(e => e.minute > 90)
  const end = extra ? 120 : 90
  // Where a player could have done it: a shot or a foul by a man who came on
  // in the 70th can't be placed in the 20th.
  const windowOf = new Map(detail.players.filter(p => p.minutes > 0).map(p =>
    [p.playerId, { lo: Math.max(2, p.subOnMinute ?? 2), hi: Math.min(end - 1, p.subOffMinute ?? end - 1) }]))
  const atFor = (playerId?: string) => {
    const w = (playerId && windowOf.get(playerId)) || { lo: 2, hi: end - 1 }
    return w.lo + Math.floor(rng() * Math.max(1, w.hi - w.lo + 1))
  }
  const queues = clock && {
    shots: { home: [...clock.shots.home], away: [...clock.shots.away] },
    corners: { home: [...clock.corners.home], away: [...clock.corners.away] },
    offsides: { home: [...clock.offsides.home], away: [...clock.offsides.away] },
    fouls: { home: [...clock.fouls.home], away: [...clock.fouls.away] },
  }
  const when = (k: keyof FeedClock, isHome: boolean, playerId?: string) =>
    queues?.[k][isHome ? 'home' : 'away'].shift() ?? atFor(playerId)
  const out: FeedItem[] = []
  const line = (minute: number, kind: FeedKind, text: string, isHome: boolean, big = false, title?: string, player?: string) =>
    out.push({ minute, kind, line: { minute: `${minute}'`, text, big, isHome, title, player } })

  // Shots that weren't goals. A missed penalty is already an event of its own.
  const shots = buildShotMap(detail, seed).filter(s => s.outcome !== 'goal' && !s.penalty)

  // The VAR call, decided on its own stream before anything is placed.
  const vrng = mulberry32(deriveSeed(seed, VAR_SALT))
  let varShot = -1, varOffside = false
  if (vrng() < VAR_RATE) {
    const candidates = shots.map((s, i) => ({ s, i })).filter(x => x.s.outcome === 'saved' || x.s.outcome === 'off')
    if (candidates.length) {
      const pickd = candidates[Math.floor(vrng() * candidates.length)]
      varShot = pickd.i
      const side = pickd.s.isHome ? detail.home : detail.away
      varOffside = side.offsides > 0 && vrng() < 0.6
    }
  }
  const varWhy = varOffside ? 'offside' : pick(['handball', 'foul'] as const, `var|${seed}`)
  const varReason = t(`com.reason.${varWhy}`)

  shots.forEach((s, i) => {
    const told = out.length
    tell(s, i)
    if (out.length > told) out[out.length - 1].shot = i
  })
  function tell(s: typeof shots[number], i: number) {
    const team = s.isHome ? homeName : awayName
    const who = s.name.split(' ').slice(-1)[0]
    const key = `shot|${i}|${s.playerId}`
    const bigChance = s.xg >= 0.3
    const m = when('shots', s.isHome, s.playerId)
    if (i === varShot) {
      out.push({
        minute: m, kind: 'var',
        line: {
          minute: `${m}'`, isHome: s.isHome, big: true, title: t('com.title.chalkedOff'), player: s.name,
          text: say('var', 2, key, { who, team, reason: varReason }),
        },
        var: { isHome: s.isHome, playerName: s.name, reason: t(`com.varTag.${varWhy}`) },
      })
      return
    }
    switch (s.outcome) {
      case 'saved':
        line(m, 'shot', bigChance ? say('savedBig', 2, key, { who, team }) : say('savedSmall', 3, key, { who }),
          s.isHome, bigChance, bigChance ? t('com.title.bigChance') : undefined, bigChance ? s.name : undefined)
        break
      case 'off':
        line(m, 'shot', bigChance ? say('offBig', 2, key, { who, team }) : say('offSmall', 3, key, { who }),
          s.isHome, bigChance, bigChance ? t('com.title.bigChance') : undefined, bigChance ? s.name : undefined)
        break
      case 'blocked':
        line(m, 'shot', say('blocked', 3, key, { who }), s.isHome)
        break
      case 'woodwork':
        line(m, 'shot', say('post', 2, key, { who, team }), s.isHome, true, t('com.title.woodwork'), s.name)
        break
    }
  }

  // Corners and offsides, as many as the sheet counted for each side. An
  // offside VAR call already told one of them.
  for (const isHome of [true, false]) {
    const side = isHome ? detail.home : detail.away
    const team = isHome ? homeName : awayName
    for (let i = 0; i < side.corners; i++)
      line(when('corners', isHome), 'corner', say('corner', 3, `corner|${isHome}|${i}`, { team }), isHome)
    const varTook = varOffside && shots[varShot].isHome === isHome ? 1 : 0
    for (let i = varTook; i < side.offsides; i++)
      line(when('offsides', isHome), 'offside', say('offside', 2, `offside|${isHome}|${i}`, { team }), isHome)
  }

  // Fouls: each side's count, each one named from the players' own
  // `foulsCommitted` while they were on the pitch, with the free kick it gives.
  const frng = mulberry32(deriveSeed(seed, FOUL_SALT))
  for (const isHome of [true, false]) {
    const side = isHome ? detail.home : detail.away
    const other = isHome ? awayName : homeName
    const owed = detail.players.filter(p => p.isHome === isHome && p.foulsCommitted > 0).map(p => ({ p, left: p.foulsCommitted }))
    for (let i = 0; i < side.fouls; i++) {
      const pool = owed.filter(o => o.left > 0)
      const o = pool.length ? pool[Math.floor(frng() * pool.length)] : null
      if (o) o.left--
      const m = when('fouls', isHome, o?.p.playerId)
      const who = o ? last(o.p.name) : null
      const key = `foul|${isHome}|${i}`
      const danger = frng() < 0.2
      const text = danger
        ? pick([
            t('com.danger', { other, culprit: who ? t('com.culprit', { who }) : '' }),
            who ? t('com.dangerWho', { who, other }) : t('com.dangerNone', { other }),
          ], key)
        : who
          ? say('foulWho', 3, key, { who, other })
          : t('com.foulNone', { other })
      line(m, 'foul', text, isHome)
    }
  }

  // The added time, as the fourth official holds up the board.
  const boards: [number, number | undefined, string][] = [[45, detail.addedTime.firstHalf, t('com.of.half')], [90, detail.addedTime.secondHalf, t('com.of.match')]]
  if (extra) boards.push([105, detail.addedTime.firstET, t('com.of.firstEt')], [120, detail.addedTime.secondET, t('com.of.et')])
  for (const [at, n, of] of boards) {
    if (!n) continue
    out.push({ minute: at + 0.001, kind: 'added', line: { minute: `${at}'`, text: t('com.added', { count: n, of }), big: false, title: t('match.boardUp', { n }) } })
  }
  return out.sort((a, b) => a.minute - b.minute)
}

/** The Deep Match's own clock for the feed: the minutes its frames show each
 *  counted thing happening, so a line lands when the number on screen moves.
 *  Goals and missed penalties are shots in the frames but events in the feed,
 *  so their minutes are taken out of the shot queue. */
export function clockFromFrames(frames: { home: { shots: number; corners: number; offsides: number; fouls: number }; away: { shots: number; corners: number; offsides: number; fouls: number } }[], events: MatchEvent[]): FeedClock {
  const minutesOf = (side: 'home' | 'away', k: 'shots' | 'corners' | 'offsides' | 'fouls') => {
    const out: number[] = []
    frames.forEach((f, i) => {
      const step = f[side][k] - (i ? frames[i - 1][side][k] : 0)
      for (let n = 0; n < step; n++) out.push(i + 1)
    })
    return out
  }
  const shotsOf = (side: 'home' | 'away') => {
    const q = minutesOf(side, 'shots')
    for (const e of events) {
      if ((e.type === 'goal' && !e.ownGoal) || e.type === 'penMissed') {
        if ((side === 'home') !== e.isHome) continue
        const j = q.indexOf(e.minute)
        if (j >= 0) q.splice(j, 1)
      }
    }
    return q
  }
  return {
    shots: { home: shotsOf('home'), away: shotsOf('away') },
    corners: { home: minutesOf('home', 'corners'), away: minutesOf('away', 'corners') },
    offsides: { home: minutesOf('home', 'offsides'), away: minutesOf('away', 'offsides') },
    fouls: { home: minutesOf('home', 'fouls'), away: minutesOf('away', 'fouls') },
  }
}

// ── Shots in time (P8-47) ─────────────────────────────────────────────────────
// The shot map steps through a side's shots in the order they were taken, so
// every shot needs its minute and where it ended up. Non-goal shots take the
// minute the feed told them at (`chanceLines`); goals and penalties take their
// event's. Where each ended is drawn from the shot's own seeded stream: in the
// goal or at the keeper, wide or over, charged down on the way, off a post.
export type TimedShot = import('./match-geometry').Shot & {
  minute: number
  plus?: number
  /** Where it ended, in the shot map's own units (x across 0–68, y up from the goal line, 0 = the line). */
  end: { x: number; y: number }
}

const SHOT_END_SALT = 0x5e7e11d
const GOAL_X = 34, POST = 3.66

export function timedShots(detail: MatchStats, seed: number): TimedShot[] {
  const all = buildShotMap(detail, seed)
  const rest = all.filter(s => s.outcome !== 'goal' && !s.penalty)
  const minuteOf = new Map<number, number>()
  for (const c of chanceLines(detail, seed, '', '')) if (c.shot != null) minuteOf.set(c.shot, c.minute)
  // Goals and penalties, matched to their events in order, by taker and kind.
  const used = new Set<MatchEvent>()
  const eventFor = (s: typeof all[number]) => detail.events.find(e => !used.has(e) && e.playerId === s.playerId && e.isHome === s.isHome
    && (s.outcome === 'goal' ? e.type === 'goal' && !e.ownGoal && !!e.penalty === !!s.penalty : e.type === 'penMissed'))
  const rng = mulberry32(deriveSeed(seed, SHOT_END_SALT))
  let ri = 0
  return all.map(s => {
    let minute = 0, plus: number | undefined
    if (s.outcome !== 'goal' && !s.penalty) minute = minuteOf.get(ri++) ?? 0
    else {
      const e = eventFor(s)
      if (e) { used.add(e); minute = e.minute; plus = e.plus }
    }
    const from = { x: s.x * 68, y: (1 - s.y) * 105 }
    const across = (rng() * 2 - 1)
    const end =
      s.outcome === 'goal' ? { x: GOAL_X + across * (POST - 0.4), y: 0 }
      : s.outcome === 'saved' ? { x: GOAL_X + across * (POST - 0.8), y: 1.2 }
      : s.outcome === 'woodwork' ? { x: GOAL_X + (across < 0 ? -POST : POST), y: 0 }
      : s.outcome === 'blocked' ? { x: from.x + (GOAL_X - from.x) * (0.25 + rng() * 0.2), y: from.y * (0.75 - rng() * 0.2) }
      : { x: GOAL_X + (across < 0 ? -1 : 1) * (POST + 1 + rng() * 6), y: 0 }   // wide (or over, seen from above)
    return { ...s, minute, plus, end }
  }).sort((a, b) => (a.minute + (a.plus ?? 0) / 100) - (b.minute + (b.plus ?? 0) / 100))
}
