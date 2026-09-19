// Verifies the commentary (src/engine/commentary.ts):
//  - every event type produces a line, deterministically
//  - no line ever prints "undefined", "NaN" or an empty name
//  - a goal line names the scorer; an assisted goal names the assister too
//  - the quiet lines read the state of play and never go blank
// Run: npx tsx scripts/verify-commentary.ts

import { lineForEvent, quietLine, commentaryUpTo } from '../src/engine/commentary'
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

console.log(`${lines} event lines checked`)
if (failures === 0) console.log('✅ ALL CHECKS PASSED')
else console.log(`${failures} failure(s)`)
process.exit(failures === 0 ? 0 : 1)
