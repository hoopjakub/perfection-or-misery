// Verifies the commentary (src/engine/commentary.ts):
//  - every event type produces a line, deterministically
//  - no line ever prints "undefined", "NaN" or an empty name
//  - a goal line names the scorer; an assisted goal names the assister too
//  - the quiet lines read the state of play and never go blank
//  - P8-33: the chances between the events — every non-goal shot on the shot map,
//    every corner and offside the sheet counted — each get one line, on a minute
//    inside the match, in order, the same every time, and never change the sheet
// Run: npx tsx scripts/verify-commentary.ts

import { t } from '../src/i18n'
import { lineForEvent, quietLine, commentaryUpTo, chanceLines, clockFromFrames, timedShots } from '../src/engine/commentary'
import { buildDeepMatchTimeline } from '../src/engine/deep-match'
import { generateMatchDetail } from '../src/engine/match-detail'
import { buildShotMap } from '../src/engine/match-geometry'
import type { RosterPlayer } from '../src/types/stats'
import type { MatchEvent } from '../src/types/match-stats'

let failures = 0
function check(cond: boolean, msg: string) {
  if (!cond) { failures++; if (failures <= 30) console.log(`❌ ${msg}`) }
}

const NAMES = ['Mikel Oyarzabal', 'Takefusa Kubo', 'Álex Remiro', 'Martín Zubimendi', 'Robin Le Normand', 'Brais Méndez']
const TYPES: MatchEvent['type'][] = ['goal', 'yellow', 'red', 'sub', 'penMissed', 'injury']

let lines = 0
for (let i = 0; i < 6000; i++) {
  const type = TYPES[i % TYPES.length]
  const name = NAMES[i % NAMES.length]
  const e: MatchEvent = {
    type, minute: 1 + (i % 90), plus: i % 17 === 0 ? 2 : undefined, isHome: i % 2 === 0,
    playerId: `p${i % 40}`, playerName: name,
    assistName: type === 'goal' && i % 3 === 0 ? NAMES[(i + 1) % NAMES.length] : undefined,
    ownGoal: type === 'goal' && i % 11 === 0 ? true : undefined,
    penalty: type === 'goal' && i % 7 === 0 && i % 11 !== 0 ? true : undefined,
    penWonName: type === 'goal' && i % 7 === 0 ? NAMES[(i + 2) % NAMES.length] : undefined,
    errorByName: type === 'goal' && i % 13 === 0 ? NAMES[(i + 3) % NAMES.length] : undefined,
    saved: type === 'penMissed' ? i % 2 === 0 : undefined,
    keeperName: type === 'penMissed' && i % 2 === 0 ? 'Álex Remiro' : undefined,
    offPlayerName: type === 'sub' ? NAMES[(i + 4) % NAMES.length] : undefined,
  } as MatchEvent
  const a = lineForEvent(e, 'Real Sociedad', 'Athletic Club')
  const b = lineForEvent(e, 'Real Sociedad', 'Athletic Club')
  lines++
  check(JSON.stringify(a) === JSON.stringify(b), `event ${i}: not deterministic`)
  check(a.text.length > 8, `event ${i}: empty line`)
  check(!/undefined|NaN|\s\s/.test(a.text), `event ${i}: bad line "${a.text}"`)
  check(a.minute.endsWith("'"), `event ${i}: bad minute "${a.minute}"`)
  const surname = name.split(' ').slice(-1)[0]
  if (type === 'goal') {
    check(a.big, `event ${i}: a goal isn't a big line`)
    check(a.text.includes(surname), `event ${i}: goal line doesn't name the scorer: "${a.text}"`)
    if (e.assistName && !e.ownGoal && !e.penalty) check(a.text.includes(e.assistName.split(' ').slice(-1)[0]), `event ${i}: assisted goal doesn't name the assister`)
  }
}

for (let m = 0; m <= 120; m++) {
  const q = quietLine(m, { homePossession: 30 + (m % 40), homeShots: m % 9, awayShots: (m * 3) % 7 }, 'Real Sociedad', 'Athletic Club')
  check(q.text.length > 5 && !/undefined|NaN/.test(q.text), `minute ${m}: bad quiet line "${q.text}"`)
}
check(quietLine(10, null, 'A', 'B').text.length > 0, 'a quiet line with no state went blank')
check(commentaryUpTo([], 50, 'A', 'B').length === 0, 'commentary invented events')

// ── P8-33: the chances ──────────────────────────────────────────────────────
const POS = ['GK', 'RB', 'CB', 'CB', 'LB', 'CDM', 'CM', 'CAM', 'RW', 'LW', 'ST', 'GK', 'CB', 'CM', 'ST', 'LW', 'RB']
const pool = (club: string, base: number): RosterPlayer[] => POS.map((pos, i) => ({
  playerId: `${club}-${i}`, name: `Player ${club}${i}`, primaryPosition: pos,
  attack: base + (i % 7), ovr: base + (i % 5), isBench: i >= 11,
  birthYear: 1995, yearStart: 2024, seasonLabel: '24/25', clubId: club, clubName: `Club ${club}`,
}))
let chanceTotal = 0, varCalls = 0, fouls = 0
for (let s = 1; s <= 2000; s++) {
  const seed = s * 7919
  const detail = generateMatchDetail({ seed, homePool: pool('h', 78), awayPool: pool('a', 76), homeGoals: s % 5, awayGoals: (s * 3) % 4, benchSize: 6 })
  if (!detail) continue
  const before = JSON.stringify(detail)
  const feed = chanceLines(detail, seed, 'Home', 'Away')
  check(JSON.stringify(detail) === before, `match ${s}: the chances changed the sheet`)
  check(JSON.stringify(feed) === JSON.stringify(chanceLines(detail, seed, 'Home', 'Away')), `match ${s}: chances not deterministic`)
  const shots = buildShotMap(detail, seed).filter(x => x.outcome !== 'goal' && !x.penalty).length
  // Second slice: fouls and the added-time boards count too; an offside VAR
  // call tells one of the offsides, so it isn't said twice.
  const boards = [detail.addedTime.firstHalf, detail.addedTime.secondHalf].filter(n => n > 0).length
  const varCall = feed.find(x => x.kind === 'var')
  const varOff = varCall?.var?.reason === t('com.varTag.offside') ? 1 : 0
  const expected = shots + detail.home.corners + detail.away.corners + detail.home.offsides + detail.away.offsides
    + detail.home.fouls + detail.away.fouls + boards - varOff
  check(feed.length === expected, `match ${s}: ${feed.length} feed lines for ${expected} things to say`)
  check(feed.every((x, i) => x.minute >= 2 && x.minute <= 91 && (i === 0 || feed[i - 1].minute <= x.minute)), `match ${s}: a chance off the clock or out of order`)
  check(feed.every(x => x.line.text.length > 0 && !/undefined|NaN|null/.test(x.line.text)), `match ${s}: bad chance words`)
  check(feed.filter(x => x.kind === 'var').length <= 1, `match ${s}: more than one VAR call`)
  // Nobody shoots or fouls from the bench: a line naming a player sits inside his minutes.
  for (const x of feed) {
    if (x.kind !== 'foul' && x.kind !== 'shot') continue
    const p = detail.players.find(q => q.minutes > 0 && x.line.text.includes(q.name.split(' ').slice(-1)[0] + ' ') && q.isHome === x.line.isHome)
    if (p) check(x.minute >= (p.subOnMinute ?? 0) && x.minute <= (p.subOffMinute ?? 999), `match ${s}: ${p.name} placed at ${x.minute}' outside his minutes`)
  }
  varCalls += varCall ? 1 : 0
  fouls += feed.filter(x => x.kind === 'foul').length
  // The Deep Match's clock: every counted line lands on a minute its frames moved.
  const tl = buildDeepMatchTimeline(detail, seed)
  const deep = chanceLines(detail, seed, 'Home', 'Away', clockFromFrames(tl.frames, tl.events))
  check(deep.length === feed.length, `match ${s}: the deep feed says ${deep.length} things, the sheet ${feed.length}`)
  const moved = (x: typeof deep[number], k: 'corners' | 'fouls') => {
    const f = tl.frames[x.minute - 1], g = tl.frames[x.minute - 2]
    const side = x.line.isHome ? 'home' : 'away'
    return !!f && f[side][k] > (g ? g[side][k] : 0)
  }
  check(deep.filter(x => x.kind === 'corner').every(x => moved(x, 'corners')), `match ${s}: a deep corner on a minute with no corner`)
  check(deep.filter(x => x.kind === 'foul').every(x => moved(x, 'fouls')), `match ${s}: a deep foul on a minute with no foul`)
  // P8-47: every shot on the map has a minute, in order, and ends somewhere on the pitch.
  const timed = timedShots(detail, seed)
  check(timed.length === buildShotMap(detail, seed).length, `match ${s}: timed shots don't match the shot map`)
  check(timed.every(t => t.minute >= 1 && t.minute <= 125), `match ${s}: a shot with no minute`)
  check(timed.every((t, i) => i === 0 || (timed[i - 1].minute + (timed[i - 1].plus ?? 0) / 100) <= t.minute + (t.plus ?? 0) / 100), `match ${s}: shots out of order`)
  check(timed.every(t => t.end.x >= 0 && t.end.x <= 68 && t.end.y >= 0 && t.end.y <= 105), `match ${s}: a shot ends off the pitch`)
  check(JSON.stringify(timed) === JSON.stringify(timedShots(detail, seed)), `match ${s}: timed shots not deterministic`)
  chanceTotal += feed.length
}
console.log(`${varCalls} VAR calls (${(varCalls / 20).toFixed(1)}% of matches), ${(fouls / 2000).toFixed(1)} foul lines a match`)
console.log(`${chanceTotal} chance lines over 2000 matches (${(chanceTotal / 2000).toFixed(1)} a match)`)

console.log(`${lines} event lines checked`)
if (failures === 0) console.log('✅ ALL CHECKS PASSED')
else console.log(`${failures} failure(s)`)
process.exit(failures === 0 ? 0 : 1)
