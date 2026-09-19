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

import type { MatchEvent } from '@/types/match-stats'

export type CommentaryLine = { minute: string; text: string; big: boolean; isHome?: boolean }

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
      return { minute: minuteOf(e), text, big: true, isHome: e.isHome }
    case 'penMissed':
      text = e.saved && e.keeperName
        ? pick([`Saved. ${last(e.keeperName)} guesses right and keeps out ${who}'s penalty.`, `${who}'s penalty, and ${last(e.keeperName)} gets down to it.`], key)
        : pick([`${who} misses from the spot.`, `Over the bar. ${who} has wasted the penalty.`], key)
      return { minute: minuteOf(e), text, big: true, isHome: e.isHome }
    case 'red':
      return { minute: minuteOf(e), text: pick([`Red card. ${who} is off, and ${team} are down to ten.`, `${who} is sent off. ${team} will have to do it with ten.`], key), big: true, isHome: e.isHome }
    case 'yellow':
      return { minute: minuteOf(e), text: pick([`${who} goes into the book.`, `Yellow card for ${who}.`, `${who} is booked.`], key), big: false, isHome: e.isHome }
    case 'sub':
      return {
        minute: minuteOf(e),
        text: e.offPlayerName ? `${team} change: ${who} on, ${last(e.offPlayerName)} off.` : `${team} bring on ${who}.`,
        big: false, isHome: e.isHome,
      }
    case 'injury':
      return { minute: minuteOf(e), text: pick([`${who} is down and can't carry on.`, `Bad news for ${team}: ${who} has to come off hurt.`], key), big: false, isHome: e.isHome }
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
