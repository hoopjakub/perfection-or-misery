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

import type { MatchEvent, MatchStats } from '@/types/match-stats'
import { buildShotMap } from './match-geometry'
import { mulberry32, deriveSeed } from '@/lib/rng'

export type CommentaryLine = {
  minute: string; text: string; big: boolean; isHome?: boolean
  /** FotMob's card heading ("Goal!", "Yellow card", "VAR"…); a line without
   *  one is a plain row in the feed, not a card (P8-33). */
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
        text = pick([
          `Own goal. ${who} turns it into his own net, and ${team} are grateful.`,
          `Disaster for ${who}: into his own goal. ${team} take it.`,
        ], key)
      } else if (e.penalty) {
        text = pick([
          `${who} from the spot. Sends the keeper the wrong way.`,
          `Penalty converted. ${who} makes no mistake for ${team}.`,
          `${who} steps up and buries it.${e.penWonName ? ` ${last(e.penWonName)} won it.` : ''}`,
        ], key)
      } else if (e.assistName) {
        text = pick([
          `GOAL. ${who} finishes it off, ${last(e.assistName)} with the ball in.`,
          `${last(e.assistName)} finds ${who}, and ${who} doesn't miss. ${team} score.`,
          `GOAL for ${team}. ${who}, set up by ${last(e.assistName)}.`,
        ], key)
      } else {
        text = pick([
          `GOAL. ${who} does it all himself for ${team}.`,
          `${who} scores. Nobody laid a glove on him.`,
          `GOAL for ${team}, and it's ${who}.`,
        ], key)
      }
      if (e.errorByName) text += ` ${last(e.errorByName)} will want that one back.`
      return { minute: minuteOf(e), text, big: true, isHome: e.isHome, title: e.ownGoal ? 'Own goal' : e.penalty ? 'Penalty goal' : 'Goal!', player: e.playerName }
    case 'penMissed':
      text = e.saved && e.keeperName
        ? pick([`Saved. ${last(e.keeperName)} guesses right and keeps out ${who}'s penalty.`, `${who}'s penalty, and ${last(e.keeperName)} gets down to it.`], key)
        : pick([`${who} misses from the spot.`, `Over the bar. ${who} has wasted the penalty.`], key)
      return { minute: minuteOf(e), text, big: true, isHome: e.isHome, title: e.saved ? 'Penalty saved' : 'Penalty missed', player: e.playerName }
    case 'red':
      return { minute: minuteOf(e), text: pick([`Red card. ${who} is off, and ${team} are down to ten.`, `${who} is sent off. ${team} will have to do it with ten.`], key), big: true, isHome: e.isHome, title: 'Red card', player: e.playerName }
    case 'yellow':
      return { minute: minuteOf(e), text: pick([`${who} goes into the book.`, `Yellow card for ${who}.`, `${who} is booked.`], key), big: false, isHome: e.isHome, title: 'Yellow card', player: e.playerName }
    case 'sub':
      return {
        minute: minuteOf(e),
        text: e.offPlayerName ? `${team} change: ${who} on, ${last(e.offPlayerName)} off.` : `${team} bring on ${who}.`,
        big: false, isHome: e.isHome, title: 'Substitution', player: e.playerName,
      }
    case 'injury':
      return { minute: minuteOf(e), text: pick([`${who} is down and can't carry on.`, `Bad news for ${team}: ${who} has to come off hurt.`], key), big: false, isHome: e.isHome, title: 'Injury', player: e.playerName }
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
  if (!state || minute <= 1) return { minute: m, text: 'Kick-off. Here we go.', big: false }
  const key = `quiet|${Math.floor(minute / 6)}`
  const on = state.homePossession >= 55 ? homeName : state.homePossession <= 45 ? awayName : null
  const shots = state.homeShots - state.awayShots
  const pressing = shots >= 4 ? homeName : shots <= -4 ? awayName : null
  if (minute === 45) return { minute: m, text: 'Into stoppage time at the end of the half.', big: false }
  if (pressing) return { minute: m, text: pick([`${pressing} are camped in the other half.`, `Wave after wave from ${pressing}.`, `${pressing} keep coming.`], key), big: false }
  if (on) return { minute: m, text: pick([`${on} have the ball and they're keeping it.`, `${on} are dictating this.`, `Patient from ${on}, passing it around.`], key), big: false }
  return { minute: m, text: pick(['Cagey. Neither side giving an inch.', 'End to end, but nothing clear-cut.', 'A lot of midfield and not much else.'], key), big: false }
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
// woodwork, corners, offsides, fouls. FotMob's feed says all of those, so the
// feed went quiet for twenty minutes at a time here. This gives each of them a
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
  /** A goal ruled out, for the timeline (FotMob's "Goal ruled out – offside"). */
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
  const say = (minute: number, kind: FeedKind, text: string, isHome: boolean, big = false, title?: string, player?: string) =>
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
  const varReason = varOffside ? 'offside' : pick(['handball', 'a foul in the build-up'], `var|${seed}`)

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
          minute: `${m}'`, isHome: s.isHome, big: true, title: 'VAR', player: s.name,
          text: pick([
            `${who} has it in the net for ${team}! But VAR is checking… and it's ruled out for ${varReason}.`,
            `The celebrations stop. ${who}'s goal is chalked off by VAR: ${varReason}.`,
          ], key),
        },
        var: { isHome: s.isHome, playerName: s.name, reason: varOffside ? 'Goal ruled out – offside' : `Goal ruled out – ${varReason === 'handball' ? 'handball' : 'foul'}` },
      })
      return
    }
    switch (s.outcome) {
      case 'saved':
        say(m, 'shot', bigChance
          ? pick([`Big chance for ${team}! ${who} is clean through, and the keeper saves.`, `How has that stayed out? ${who} from close in, brilliant save.`], key)
          : pick([`${who} tests the keeper. Saved.`, `Good stop, low down, from ${who}'s effort.`, `${who} makes the keeper work.`], key),
          s.isHome, bigChance, bigChance ? 'Big chance' : undefined, bigChance ? s.name : undefined)
        break
      case 'off':
        say(m, 'shot', bigChance
          ? pick([`Big chance missed. ${who} should have scored for ${team}.`, `${who} with the goal at his mercy, and it goes wide.`], key)
          : pick([`${who} shoots wide.`, `Off target from ${who}.`, `${who} lets fly, over the bar.`], key),
          s.isHome, bigChance, bigChance ? 'Big chance' : undefined, bigChance ? s.name : undefined)
        break
      case 'blocked':
        say(m, 'shot', pick([`${who}'s shot is blocked.`, `Bodies on the line to stop ${who}.`, `Charged down. ${who} can't get it through.`], key), s.isHome)
        break
      case 'woodwork':
        say(m, 'shot', pick([`Off the post! ${who} so close for ${team}.`, `The woodwork saves them. ${who} hits the bar.`], key), s.isHome, true, 'Woodwork', s.name)
        break
    }
  }

  // Corners and offsides, as many as the sheet counted for each side. An
  // offside VAR call already told one of them.
  for (const isHome of [true, false]) {
    const t = isHome ? detail.home : detail.away
    const team = isHome ? homeName : awayName
    for (let i = 0; i < t.corners; i++)
      say(when('corners', isHome), 'corner', pick([`Corner to ${team}.`, `${team} win a corner.`, `Another corner for ${team}.`], `corner|${isHome}|${i}`), isHome)
    const varTook = varOffside && shots[varShot].isHome === isHome ? 1 : 0
    for (let i = varTook; i < t.offsides; i++)
      say(when('offsides', isHome), 'offside', pick([`Flag's up. ${team} caught offside.`, `Offside against ${team}.`], `offside|${isHome}|${i}`), isHome)
  }

  // Fouls: each side's count, each one named from the players' own
  // `foulsCommitted` while they were on the pitch, with the free kick it gives.
  const frng = mulberry32(deriveSeed(seed, FOUL_SALT))
  for (const isHome of [true, false]) {
    const t = isHome ? detail.home : detail.away
    const other = isHome ? awayName : homeName
    const owed = detail.players.filter(p => p.isHome === isHome && p.foulsCommitted > 0).map(p => ({ p, left: p.foulsCommitted }))
    for (let i = 0; i < t.fouls; i++) {
      const pool = owed.filter(o => o.left > 0)
      const o = pool.length ? pool[Math.floor(frng() * pool.length)] : null
      if (o) o.left--
      const m = when('fouls', isHome, o?.p.playerId)
      const who = o ? last(o.p.name) : null
      const key = `foul|${isHome}|${i}`
      const danger = frng() < 0.2
      const text = danger
        ? pick([`Free kick to ${other} in a dangerous position${who ? `, ${who} the culprit` : ''}.`, `${who ? `${who} brings his man down` : 'A foul'} just outside the box. Free kick, ${other}.`], key)
        : who
          ? pick([`Foul by ${who}. Free kick to ${other}.`, `${who} is penalised. ${other} take the free kick.`, `${who} goes through the back. Free kick.`], key)
          : `Foul. Free kick to ${other}.`
      say(m, 'foul', text, isHome)
    }
  }

  // The added time, as the fourth official holds up the board.
  const boards: [number, number | undefined, string][] = [[45, detail.addedTime.firstHalf, 'the half'], [90, detail.addedTime.secondHalf, 'the match']]
  if (extra) boards.push([105, detail.addedTime.firstET, 'the first period'], [120, detail.addedTime.secondET, 'extra time'])
  for (const [at, n, of] of boards) {
    if (!n) continue
    out.push({ minute: at + 0.001, kind: 'added', line: { minute: `${at}'`, text: `${n} minute${n === 1 ? '' : 's'} added at the end of ${of}.`, big: false, title: `+${n} minutes added` } })
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
