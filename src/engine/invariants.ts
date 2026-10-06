// Phase 9, Diagnostics step 3 (docs/diagnostics/04-CHECKS.md §3): the rules a
// match sheet and a Deep Match timeline must always keep, in one place.
//
// They used to live inside scripts/verify-match-detail.ts and
// verify-deep-match.ts. Moved here so the script run in a terminal and the
// self-test run on a phone are the same code: a rule that fails on the phone
// and passes in the terminal is then a fact about the device (Hermes v V8),
// not about two copies drifting apart. The scripts keep their own aggregate
// checks (averages, correlations), which need thousands of matches and don't
// belong on a phone.
//
// Each function returns the rules broken, as short lines; empty means sound.
// `invariantChecks.count` counts every rule evaluated, so a script can show its
// coverage didn't shrink when this moved (it was 3,841,896 and 2,645,369
// checks on --seed 1 before the move, and is the same after).
import type { MatchStats, TeamStatLine } from '@/types/match-stats'
import type { MatchScorers, RosterPlayer } from '@/types/stats'
import type { DeepMatchTimeline } from './deep-match'
import { HALF_TIME_MINUTE } from './match-detail'

export const invariantChecks = { count: 0 }

/** What a sheet is checked against: the decided result and the squads it was drawn from. */
export type SheetFacts = {
  homeGoals: number
  awayGoals: number
  scorers: MatchScorers
  homePool: RosterPlayer[]
  awayPool: RosterPlayer[]
}

export function checkMatchDetail(d: MatchStats, input: SheetFacts): string[] {
  const out: string[] = []
  const check = (cond: boolean, msg: string) => { invariantChecks.count++; if (!cond) out.push(msg) }
  const { scorers, homePool, awayPool } = input
  const result = { homeGoals: input.homeGoals, awayGoals: input.awayGoals }

  // Every lineup entry and timeline event must resolve to a real side (Big
  // Fixes §5.1: a sub's team must never come out unresolved).
  for (const p of d.players) check(typeof p.isHome === 'boolean', `player ${p.playerId} has no resolved team (isHome)`)
  for (const e of d.events)  check(typeof e.isHome === 'boolean', `event ${e.type}@${e.minute} has no resolved team (isHome)`)

  // §9: an own goal counts on the beneficiary's scoreline but is nobody on that
  // side's goal, shot or save, so everything below is anchored on ATTACKING
  // goals (the scoreline minus own goals gifted to you).
  const homeAtk = result.homeGoals - scorers.home.filter(g => g.ownGoal).length
  const awayAtk = result.awayGoals - scorers.away.filter(g => g.ownGoal).length

  const sideLines = (isHome: boolean) => d.players.filter(p => p.isHome === isHome)
  for (const [isHome, atkGoals, opp, oppAtk] of [
    [true,  homeAtk, d.away, awayAtk],
    [false, awayAtk, d.home, homeAtk],
  ] as const) {
    const t = isHome ? d.home : d.away
    const lines = sideLines(isHome)
    const sum = (f: (l: typeof lines[number]) => number) => lines.reduce((s, l) => s + f(l), 0)

    check(sum(l => l.goals) === atkGoals, `Σ player goals ${sum(l => l.goals)} != attacking goals ${atkGoals}`)
    // The own goals THIS side put in must equal the own goals on the OPPONENT's scoreline.
    const ogAgainstUs = (isHome ? scorers.away : scorers.home).filter(g => g.ownGoal).length
    check(sum(l => l.ownGoals) === ogAgainstUs, `Σ own goals ${sum(l => l.ownGoals)} != ${ogAgainstUs} charged to this side`)
    check(sum(l => l.goals) + ogAgainstUs === atkGoals + ogAgainstUs, 'goal bookkeeping drifted')
    const attributedAssists = (isHome ? scorers.home : scorers.away).filter(g => g.assistId).length
    check(sum(l => l.assists) === attributedAssists, 'Σ assists mismatch')
    const attributedPenWon = (isHome ? scorers.home : scorers.away).filter(g => g.penWonId).length
    check(sum(l => l.penaltiesWon) === attributedPenWon, 'Σ penalties won mismatch')
    const attributedErrors = (isHome ? scorers.away : scorers.home).filter(g => g.errorById).length
    check(sum(l => l.errorsLeadingToGoal) === attributedErrors, 'Σ errors mismatch')
    check(sum(l => l.penaltyGoals) <= sum(l => l.goals), 'penalty goals exceed goals')
    check(t.shotsOnTarget >= atkGoals, 'team SOT < attacking goals')
    check(sum(l => l.shots) === t.shots, 'Σ player shots != team shots')
    check(sum(l => l.shotsOnTarget) === t.shotsOnTarget, 'Σ player SOT != team SOT')
    check(lines.every(l => l.shots >= l.shotsOnTarget && l.shotsOnTarget >= l.goals), 'player shot ordering broken')
    check(t.shots === t.shotsOnTarget + t.shotsOffTarget + t.shotsBlocked, 'shot split mismatch')
    check(t.shots === t.shotsInsideBox + t.shotsOutsideBox, 'box split mismatch')
    check(t.keeperSaves === opp.shotsOnTarget - oppAtk, 'saves mismatch')
    check(t.blocks === opp.shotsBlocked, 'blocks != opp blocked shots')
    check(sum(l => l.passes) === t.passes, 'Σ passes != team')
    check(lines.every(l => l.accuratePasses <= l.passes), 'accurate > total passes')
    check(sum(l => l.foulsCommitted) === t.fouls, 'Σ fouls != team')
    check(sum(l => l.foulsWon) === opp.fouls, 'Σ fouls won != opp fouls')
    check(sum(l => l.tacklesWon) === t.tacklesWon, 'Σ tackles != team')
    check(sum(l => l.touchesInOppBox) === t.touchesInOppBox, 'Σ box touches != team')
    check(t.bigChances >= t.bigChancesMissed, 'big chances < missed')
    check(t.xg > 0 || t.shots === 0, 'zero xG with shots')

    const gk = lines.find(l => l.gk)
    if (gk?.gk) {
      check(gk.gk.saves === t.keeperSaves, 'GK line saves != team saves')
      check(gk.gk.goalsConceded === (isHome ? result.awayGoals : result.homeGoals), 'GK conceded mismatch')
    }

    // Subs: everyone who came on did so before doing anything; minutes coherent.
    for (const l of lines) {
      if (l.subOnMinute !== undefined) {
        // Half-time is a real beat (§10.5 phase 3), so 45' is a legitimate
        // "came on" minute; a forced change (an injury) can come at any time.
        const forcedOn = d.events.some(e => e.type === 'sub' && e.forced && e.playerId === l.playerId && e.isHome === isHome)
        check(forcedOn || l.subOnMinute >= HALF_TIME_MINUTE, `sub came on at ${l.subOnMinute}' — inside the first half`)
        check(l.minutes > 0 && l.minutes <= d.duration - l.subOnMinute, `sub minutes incoherent (${l.minutes} on at ${l.subOnMinute})`)
      }
      if (l.subOffMinute !== undefined) check(l.minutes <= l.subOffMinute, 'sub-off minutes incoherent')
      check(l.minutes > 0 || (l.goals === 0 && l.assists === 0 && l.shots === 0 && l.passes === 0
        && l.ownGoals === 0 && l.penaltiesWon === 0 && l.errorsLeadingToGoal === 0), 'unused sub has stats')
    }

    // Everyone a goal names was on the pitch at that minute, on the right
    // side. An own-goal scorer and an error-maker belong to the CONCEDING
    // team, so they're checked against the opposite lineup.
    const oppLines = sideLines(!isHome)
    const onPitchAt = (pool: typeof lines, id: string, minute: number, what: string) => {
      const line = pool.find(l => l.playerId === id)
      check(!!line && line.minutes > 0, `${what} ${id} not on pitch`)
      if (line?.subOnMinute !== undefined) check(line.subOnMinute <= minute, `${what} involved at ${minute}' but came on at ${line.subOnMinute}'`)
    }
    for (const g of (isHome ? scorers.home : scorers.away)) {
      if (g.ownGoal) {
        onPitchAt(oppLines, g.scorerId, g.minute, 'own-goal scorer')
        check(!lines.some(l => l.playerId === g.scorerId), "own-goal scorer sits on the BENEFITING side's lineup")
      } else {
        onPitchAt(lines, g.scorerId, g.minute, 'scorer')
        if (g.penWonId) {
          check(g.penWonId !== g.scorerId, 'penalty "won by" is the taker himself')
          onPitchAt(lines, g.penWonId, g.minute, 'penalty winner')
        }
      }
      if (g.errorById) onPitchAt(oppLines, g.errorById, g.minute, 'error-maker')
    }

    // Red cards: each red event pairs with a line flagged redCard, sent off in
    // the second half, whose match ended at (or before) the red minute.
    const redEvents = d.events.filter(e => e.type === 'red' && e.isHome === isHome)
    const redLines  = lines.filter(l => l.redCard)
    check(redEvents.length === redLines.length, `red events (${redEvents.length}) != red lines (${redLines.length}) for one side`)
    for (const ev of redEvents) {
      check(ev.minute >= 46, `red card at ${ev.minute}' (before half-time)`)
      const line = lines.find(l => l.playerId === ev.playerId)
      check(!!line && line.redCard, 'red event has no matching redCard line')
      if (line) check(line.minutes <= ev.minute, `sent-off player kept playing after the red (${line.minutes}' > ${ev.minute}')`)
    }
  }
  check(d.home.possession + d.away.possession === 100, 'possession != 100')

  // §10.5: the selected elevens.
  for (const [shape, isHome] of [[d.homeShape, true], [d.awayShape, false]] as const) {
    check(!!shape, 'no lineup shape generated')
    if (!shape) continue
    check(shape.slots.length === 11, `XI has ${shape.slots.length} players`)
    const ids = new Set(shape.slots.map(x => x.playerId))
    check(ids.size === 11, 'the same player fills two slots')
    const gkSlot = shape.slots.find(x => x.label === 'GK')
    const lines = sideLines(isHome)
    if (gkSlot) {
      const gk = lines.find(l => l.playerId === gkSlot.playerId)
      check(gk?.position === 'GK', 'a non-keeper is in goal')
    }
    for (const sl of shape.slots) {
      const l = lines.find(x => x.playerId === sl.playerId)
      check(!!l && l.minutes > 0 && l.subOnMinute === undefined, `selected starter ${sl.playerId} did not start`)
    }
  }

  // §8 momentum: one value a minute, inside −100…100.
  check(d.momentum.length === d.duration, `momentum length ${d.momentum.length} != duration ${d.duration}`)
  check(d.momentum.every(v => Number.isInteger(v) && v >= -100 && v <= 100), 'momentum value out of −100…100')

  // §10: added time, and stoppage-time events inside what the board showed.
  const at = d.addedTime
  check(at.firstHalf >= 0 && at.secondHalf >= 0, 'negative added time')
  check((at.firstET === undefined) === (d.duration <= 90), "extra-time added time doesn't match duration")
  for (const e of d.events) {
    if (!e.plus) continue
    const allowed = e.minute === 45 ? at.firstHalf : e.minute === 90 ? at.secondHalf
      : e.minute === 105 ? (at.firstET ?? 0) : e.minute === 120 ? (at.secondET ?? 0) : Infinity
    check(e.plus <= allowed, `event at ${e.minute}+${e.plus} exceeds the ${allowed}' added to that half`)
  }
  // Missed penalties: the taker was on, it's on his line, a keeper didn't take it.
  for (const e of d.events) {
    if (e.type !== 'penMissed') continue
    const taker = sideLines(e.isHome).find(l => l.playerId === e.playerId)
    check(!!taker && taker.minutes > 0, 'penalty taker not on pitch')
    check(!!taker && taker.penaltiesMissed > 0, "missed penalty not recorded on the taker's line")
    check(taker?.position !== 'GK', 'goalkeeper took a penalty in open play')
    if (e.saved) {
      const gk = sideLines(!e.isHome).find(l => l.playerId === e.keeperId)
      check(!!gk?.gk && gk.gk.penaltiesSaved > 0, 'saved penalty not credited to the keeper')
    }
  }
  for (const isHome of [true, false]) {
    const evs = d.events.filter(e => e.type === 'penMissed' && e.isHome === isHome).length
    const sum = sideLines(isHome).reduce((s, l) => s + l.penaltiesMissed, 0)
    check(sum === evs, `Σ penalties missed ${sum} != ${evs} miss events`)
  }

  // §9: each goal list against the squad that conceded it.
  for (const [evs, concedingPool] of [[scorers.home, awayPool], [scorers.away, homePool]] as const) {
    for (const g of evs) {
      if (g.ownGoal) {
        check(concedingPool.some(x => x.playerId === g.scorerId), 'own-goal scorer is not in the conceding squad')
        check(!g.penalty && !g.assistId && !g.penWonId, 'own goal carries penalty/assist data')
      }
      if (g.penalty) check(!g.assistId, 'penalty also carries an assist')
      if (g.errorById) {
        check(concedingPool.some(x => x.playerId === g.errorById), 'error charged outside the conceding squad')
        check(!g.penalty, 'penalty also carries an error')
      }
    }
  }

  // P8-144: a hat-trick is a 10, unless he also scored an own goal or was sent off.
  for (const p of d.players) {
    if (p.minutes > 0 && p.goals >= 3 && !p.redCard && !p.ownGoals) check(p.rating === 10, `a hat-trick rated ${p.rating}`)
  }
  return out
}

/** What the timeline can't honour without inventing a shot: counted, not hidden (see verify-deep-match). */
export type TimelineTally = { shortSheets: number }

export function checkTimeline(tl: DeepMatchTimeline, detail: MatchStats, score: { homeGoals: number; awayGoals: number }, tally?: TimelineTally): string[] {
  const out: string[] = []
  const check = (cond: boolean, msg: string) => { invariantChecks.count++; if (!cond) out.push(msg) }

  check(tl.frames.length === detail.duration, `${tl.frames.length} frames for a ${detail.duration}' match`)
  const last = tl.frames[tl.frames.length - 1]

  // The final frame IS the sheet: the Deep Match replays a decided match.
  check(last.homeGoals === score.homeGoals && last.awayGoals === score.awayGoals,
    `timeline ends ${last.homeGoals}-${last.awayGoals}, match was ${score.homeGoals}-${score.awayGoals}`)
  for (const side of ['home', 'away'] as const) {
    for (const key of Object.keys(detail[side]) as (keyof TeamStatLine)[]) {
      const want = detail[side][key] as number
      const got = last[side][key] as number
      // xG is carried to one decimal; possession and pass accuracy are rounded
      // percentages from the running series (a point either side); the rest exact.
      const ok = key === 'xg' || key === 'xgOpenPlay' || key === 'xgSetPiece'
        ? Math.abs(got - want) < 0.005
        : key === 'possession' || key === 'passAccuracy'
        ? Math.abs(got - want) <= 1
        : got === want
      check(ok, `${side}.${String(key)} ends at ${got}, sheet says ${want}`)
    }
  }
  check(last.home.possession + last.away.possession === 100, `final possession sums to ${last.home.possession + last.away.possession}`)

  // Nothing ever goes backwards: a counter falling is a stat re-rolled, not revealed.
  const counters: (keyof TeamStatLine)[] = [
    'shots', 'shotsOnTarget', 'passes', 'accuratePasses', 'fouls', 'corners',
    'yellowCards', 'redCards', 'tacklesWon', 'keeperSaves', 'xg',
  ]
  for (let f = 1; f < tl.frames.length; f++) {
    const prev = tl.frames[f - 1], cur = tl.frames[f]
    check(cur.homeGoals >= prev.homeGoals && cur.awayGoals >= prev.awayGoals, `the score went DOWN at ${cur.minute}'`)
    for (const side of ['home', 'away'] as const) {
      for (const key of counters) {
        if ((cur[side][key] as number) < (prev[side][key] as number)) check(false, `${side}.${String(key)} fell at ${cur.minute}'`)
      }
    }
  }

  // Events are anchored to their minute, where the sheet leaves room for it:
  // when its totals are smaller than the events demand, landing on the sheet's
  // figure wins, and the shortfall is counted rather than tolerated silently.
  const demand = (isHome: boolean) => {
    const mine = detail.events.filter(e => e.isHome === isHome)
    const goals = mine.filter(e => e.type === 'goal' && !e.ownGoal).length
    const pens = mine.filter(e => e.type === 'penMissed')
    return {
      shots: goals + pens.length,
      shotsOnTarget: goals + pens.filter(e => e.saved).length,
      fouls: mine.filter(e => e.type === 'yellow' || e.type === 'red').length,
    }
  }
  const demands = { home: demand(true), away: demand(false) }
  const short = () => { if (tally) tally.shortSheets++ }
  for (const e of detail.events) {
    const m = Math.max(1, Math.min(tl.duration, e.minute))
    const cur = tl.frames[m - 1]
    const prev = m > 1 ? tl.frames[m - 2] : null
    const side = e.isHome ? 'home' : 'away'
    const delta = (key: keyof TeamStatLine) => (cur[side][key] as number) - ((prev?.[side][key] as number) ?? 0)
    if (e.type === 'goal') {
      check(cur[side === 'home' ? 'homeGoals' : 'awayGoals'] > ((prev?.[side === 'home' ? 'homeGoals' : 'awayGoals']) ?? -1),
        `the ${m}' goal never appears on the scoreboard`)
      if (!e.ownGoal) {
        if (detail[side].shots >= demands[side].shots) check(delta('shots') >= 1, `a goal at ${m}' with no shot in that minute`)
        else short()
        if (detail[side].shotsOnTarget >= demands[side].shotsOnTarget) check(delta('shotsOnTarget') >= 1, `a goal at ${m}' with no shot on target in that minute`)
        else short()
      }
    } else if (e.type === 'yellow') {
      check(delta('yellowCards') >= 1, `a booking at ${m}' that never shows on the card count`)
      if (detail[side].fouls >= demands[side].fouls) check(delta('fouls') >= 1, `a booking at ${m}' with no foul in that minute`)
      else short()
    } else if (e.type === 'red') {
      check(delta('redCards') >= 1, `a sending-off at ${m}' that never shows on the card count`)
    }
  }

  // Live ratings: end on the sheet's figure, absent before coming on, inside 1–10.
  for (const p of detail.players) {
    if (p.minutes <= 0) {
      check(tl.ratingAt(p.playerId, tl.duration) === null, 'an unused sub has a live rating')
      continue
    }
    const on = p.subOnMinute ?? 0
    check(tl.ratingAt(p.playerId, tl.duration) === p.rating, `${p.name} ends live on ${tl.ratingAt(p.playerId, tl.duration)}, sheet says ${p.rating}`)
    if (on > 0) {
      check(tl.ratingAt(p.playerId, on) === null, `${p.name} was rated before coming on at ${on}'`)
      check(!tl.onPitchAt(p.playerId, on), `${p.name} is on the pitch at ${on}', the minute he came on`)
    }
    check(tl.onPitchAt(p.playerId, Math.min(tl.duration, on + 1)), `${p.name} isn't on the pitch right after coming on`)
    if (p.subOffMinute !== undefined) {
      check(!tl.onPitchAt(p.playerId, Math.min(tl.duration, p.subOffMinute + 1)), `${p.name} is still on after being subbed at ${p.subOffMinute}'`)
    }
    for (const m of [on + 1, Math.floor((on + tl.duration) / 2), tl.duration]) {
      const r = tl.ratingAt(p.playerId, Math.min(tl.duration, m))
      if (r === null) continue
      check(r >= 1 && r <= 10, `${p.name} rated ${r} at ${m}'`)
    }
    // The first minute on starts from the "nothing has happened" mark, unless
    // something happened TO him in it (scored, assisted, erred, saved a pen).
    const first = tl.ratingAt(p.playerId, Math.min(tl.duration, on + 1))
    const involvedImmediately = detail.events.some(e =>
      Math.abs(e.minute - (on + 1)) <= 1
      && (e.playerId === p.playerId || e.assistId === p.playerId || e.errorById === p.playerId || e.keeperId === p.playerId))
    if (first !== null && !involvedImmediately) check(Math.abs(first - 6.0) < 1.0, `${p.name} came on already rated ${first}`)
  }

  // The team sheet before kick-off spoils nothing…
  for (const p of tl.playersAt(0)) {
    check(p.goals === 0 && p.ownGoals === 0 && p.assists === 0, `${p.name} already has a goal contribution at kickoff`)
    check(!p.yellowCard && !p.redCard && !p.injured, `${p.name} is already booked at kickoff`)
    check(p.subOnMinute === undefined && p.subOffMinute === undefined, `${p.name}'s substitution is announced at kickoff`)
    check(!p.motm, 'player of the match is known at kickoff')
    check(p.minutes === 0, `${p.name} has played ${p.minutes} minutes at kickoff`)
  }
  // …and by full time it IS the sheet.
  const finalLines = tl.playersAt(tl.duration)
  for (const p of detail.players) {
    const f = finalLines.find(x => x.playerId === p.playerId)!
    check(f.goals === p.goals && f.assists === p.assists && f.ownGoals === p.ownGoals, `${p.name}'s contributions don't match the sheet at full time`)
    check(f.minutes === p.minutes, `${p.name} played ${f.minutes}', sheet says ${p.minutes}'`)
    check(!!f.motm === !!p.motm, "MOTM doesn't match the sheet at full time")
    if (p.minutes > 0) check(f.rating === p.rating, `${p.name}'s final rating doesn't match the sheet`)
  }

  // The team rating stays in a sane band the whole way through.
  for (const f of tl.frames) {
    check(f.homeRating >= 1 && f.homeRating <= 10, `home team rating ${f.homeRating} at ${f.minute}'`)
    check(f.awayRating >= 1 && f.awayRating <= 10, `away team rating ${f.awayRating} at ${f.minute}'`)
  }
  return out
}
