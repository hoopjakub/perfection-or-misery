// Verifies the run's press (src/engine/press.ts) over simulated seasons:
//  - determinism: the same history writes byte-identical stories
//  - nothing before a quarter of the season except the final day
//  - at most two stories a matchday; the final day always crowns a champion
//  - cooldowns respected per kind and subject
//  - frozen rows match the table as it stood that matchday, and stay frozen
//  - every story renders words: no "undefined", no NaN, no exclamation marks
//  - a realistic amount per season: never silent, never a wall
// Run: npx tsx scripts/verify-press.ts

import { writePress, storyText, type Story, type PressSnapshot } from '../src/engine/press'
import { zonesFor } from '../src/data/qualification-bands'
import { simulateMatch, setMatchTilt } from '../src/engine/match'
import { generateFixtures } from '../src/engine/fixtures'
import type { SimTeam } from '../src/types/simulation'

let failures = 0
function check(cond: boolean, msg: string) {
  if (!cond) { failures++; if (failures <= 40) console.log(`❌ ${msg}`) }
}

const sortTable = (t: SimTeam[]) => [...t].sort((x, y) =>
  y.stats.points - x.stats.points
  || (y.stats.goalsFor - y.stats.goalsAgainst) - (x.stats.goalsFor - x.stats.goalsAgainst)
  || y.stats.goalsFor - x.stats.goalsFor)

setMatchTilt(0)
const SEASONS = 400
const counts: number[] = []
const kinds = new Map<string, number>()

for (let s = 1; s <= SEASONS; s++) {
  const size = s % 3 === 0 ? 18 : 20
  const league = s % 3 === 0 ? 'bundesliga' : 'premier_league'
  const zones = zonesFor(league, 2018 + (s % 8), size)
  const sims: SimTeam[] = Array.from({ length: size }, (_, i) => ({
    clubId: `c${String(i).padStart(2, '0')}`, clubName: `Club ${i}`,
    ovr: Math.round(90 - i * 0.95 + ((s * (i + 7)) % 5) - 2), isPlayer: i === s % size,
    form: 0, stats: { played: 0, won: 0, drawn: 0, lost: 0, goalsFor: 0, goalsAgainst: 0, points: 0 },
  }))
  const fx = generateFixtures(sims)
  const total = Math.max(...fx.map(f => f.matchday))
  const history: PressSnapshot[] = []
  const stories: Story[] = []
  const frozenAtWrite = new Map<string, string>()

  for (let md = 1; md <= total; md++) {
    const round = fx.filter(f => f.matchday === md)
    for (const f of round) {
      const r = simulateMatch(f.home, f.away)
      f.result = r
      const h = f.home.stats, a = f.away.stats
      h.played++; a.played++
      h.goalsFor += r.homeGoals; h.goalsAgainst += r.awayGoals
      a.goalsFor += r.awayGoals; a.goalsAgainst += r.homeGoals
      if (r.homeGoals > r.awayGoals) { h.won++; h.points += 3; a.lost++ }
      else if (r.homeGoals < r.awayGoals) { a.won++; a.points += 3; h.lost++ }
      else { h.drawn++; a.drawn++; h.points++; a.points++ }
    }
    const standings = sortTable(sims).map(t => ({ ...t, stats: { ...t.stats } }))
    history.push({ matchday: md, standings, fixtures: round.map(f => ({ home: f.home, away: f.away, result: f.result })) })
    const ctx = {
      totalMatchdays: total, zones,
      next: fx.filter(f => f.matchday === md + 1).map(f => ({ homeId: f.home.clubId, awayId: f.away.clubId })),
    }
    const fresh = writePress(history, stories, ctx)
    const again = writePress(history, stories, ctx)
    check(JSON.stringify(fresh) === JSON.stringify(again), `season ${s} md ${md}: not deterministic`)

    if (md < Math.ceil(total / 4) && md !== total) check(fresh.length === 0, `season ${s} md ${md}: a story before a quarter of the season`)
    if (md !== total) check(fresh.length <= 2, `season ${s} md ${md}: ${fresh.length} stories`)
    if (md === total) check(fresh.some(x => x.kind === 'champions' && x.names[0] === standings[0].clubName), `season ${s}: no champions story on the final day`)

    for (const st of fresh) {
      check(!stories.some(o => o.id === st.id), `season ${s}: duplicate id ${st.id}`)
      for (const row of st.rows) {
        const live = standings[row.pos - 1]
        check(live.clubId === row.clubId && live.stats.points === row.points && live.stats.played === row.played,
          `season ${s} ${st.id}: frozen row ${row.clubName} doesn't match the table`)
      }
      const words = storyText(st)
      const text = words.headline + ' ' + words.standfirst
      check(words.headline.length > 0 && words.standfirst.length > 0, `${st.id}: empty words`)
      check(!/undefined|NaN|!/.test(text), `${st.id}: bad words "${text}"`)
      frozenAtWrite.set(st.id, JSON.stringify(st))
      kinds.set(st.kind, (kinds.get(st.kind) ?? 0) + 1)
    }
    stories.push(...fresh)
  }

  // Cooldowns: the same kind and subject never repeats inside its window.
  for (const a of stories) for (const b of stories) {
    if (a === b || a.kind !== b.kind || a.subject !== b.subject || b.matchday <= a.matchday) continue
    const form = ['hotStreak', 'coldStreak', 'unbeaten', 'winless', 'drawSpecialists'].includes(a.kind)
    const cd = Math.max(2, Math.round(((form ? 9 : 7) * total) / 38))
    check(b.matchday - a.matchday >= cd, `season ${s}: ${a.kind}/${a.subject} repeated after ${b.matchday - a.matchday} rounds`)
  }
  // Frozen: nothing written earlier changed as the season went on.
  for (const st of stories) check(frozenAtWrite.get(st.id) === JSON.stringify(st), `season ${s}: ${st.id} changed after it was written`)
  counts.push(stories.length)
}

const mean = counts.reduce((a, b) => a + b, 0) / counts.length
const min = Math.min(...counts), max = Math.max(...counts)
check(min >= 4, `a season wrote only ${min} stories`)
check(mean >= 10 && mean <= 45, `mean ${mean.toFixed(1)} stories a season`)
check(kinds.size >= 9, `only ${kinds.size} story kinds ever fired`)

console.log(`${SEASONS} seasons · stories per season mean ${mean.toFixed(1)} (min ${min}, max ${max})`)
console.log([...kinds.entries()].sort((a, b) => b[1] - a[1]).map(([k, n]) => `${k} ${n}`).join(' · '))
if (failures === 0) console.log('✅ ALL CHECKS PASSED')
else console.log(`${failures} failure(s)`)
process.exit(failures === 0 ? 0 : 1)
