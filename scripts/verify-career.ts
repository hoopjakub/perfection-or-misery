// P8-150: the career summary (src/lib/careerSummary.ts) on a set of runs whose
// answers are known: totals, each record and the run it names, each mode's
// line, the players drafted most (a footballer counted once a run, across his
// seasons), and the pundits' line.
//   npx tsx scripts/verify-career.ts
import { summarise, type CareerRun } from '../src/lib/careerSummary'

let failures = 0
const check = (ok: boolean, msg: string) => { if (!ok) { failures++; console.log(`❌ ${msg}`) } }

const p = (name: string, birthYear = 1990, pos = 'ST') => ({ name, birthYear, primaryPosition: pos })
let n = 0
const run = (x: Partial<CareerRun>): CareerRun => ({
  id: `r${++n}`, mode: 'league', tier: 'mid_table', score: 400, created_at: `2026-09-${String(n).padStart(2, '0')}T12:00:00Z`,
  final_position: 10, teams_in_league: 20, league_name: 'League', wins: 12, draws: 10, losses: 16, goals_for: 40, goals_against: 50,
  duration_seconds: 600, squad: [], pundits_on_you: null, ...x,
})

const runs = [
  run({ score: 900, tier: 'perfection', final_position: 1, wins: 30, draws: 8, losses: 0, goals_for: 95, squad: [p('Kane'), p('Salah', 1992, 'RW'), p('Kane')], pundits_on_you: { predicted: 12, field: 20 } }),
  run({ score: 300, tier: 'relegated', final_position: 19, wins: 5, losses: 25, squad: [p('Kane'), p('Rice', 1999, 'CDM')], pundits_on_you: { predicted: 15, field: 20 } }),
  run({ mode: 'world_cup', score: 1200, tier: 'winner', final_position: 1, teams_in_league: 48, wins: 7, draws: 1, losses: 0, goals_for: 20, squad: [p('Kane'), p('Salah', 1992, 'RW')], difficulty: 'custom', difficulty_meta: { hardness: 7.5 } }),
  run({ mode: 'champions_league', score: 500, tier: 'qf_exit', final_position: 6, teams_in_league: 36, wins: 5, draws: 2, losses: 3, goals_for: 18, squad: [p('Rice', 1999, 'CDM'), p('Kane', 1980)] }),
]
const s = summarise([...runs].reverse())   // any order in, the same summary out

check(s.runs === 4 && s.won === 2 && s.perfection === 2, `totals: ${s.runs} runs, ${s.won} won, ${s.perfection} perfection`)
check(s.matches.w === 47 && s.matches.l === 28 && s.seconds === 2400, `matches ${JSON.stringify(s.matches)}, ${s.seconds}s`)
check(s.best?.id === 'r3' && s.bestTier === 'winner', `best run ${s.best?.id}, best tier ${s.bestTier}`)
const rec = (k: string) => s.records.find(r => r.key === k)
check(rec('score')?.run.id === 'r3', 'best score record')
check(rec('finish')?.run.id === 'r1' && rec('finish')?.value === '1 of 20', `best finish ${rec('finish')?.value}`)
check(rec('wins')?.value === '30 wins' && rec('losses')?.value === 'Unbeaten', `wins ${rec('wins')?.value}, losses ${rec('losses')?.value}`)
check(rec('goals')?.run.id === 'r1', 'most goals')
check(rec('hardest')?.value === '7.5 of 11' && rec('hardest')?.run.id === 'r3', `hardest ${rec('hardest')?.value}`)
check(rec('pundits')?.run.id === 'r1' && rec('pundits')?.value === '11 places better than tipped', `pundits record ${rec('pundits')?.value}`)

const league = s.modes.find(m => m.mode === 'league')!
check(s.modes[0].mode === 'league' && league.runs === 2 && league.won === 1 && league.averageScore === 600, `league line ${JSON.stringify(league)}`)
check(league.recent.map(r => r.id).join() === 'r1,r2' && league.recent[0].verdict === 'perfection', 'league recent, oldest first')

// Kane: in four runs, but the 1980 Kane is someone else; counted once a run.
const kane = s.drafted.find(d => d.name === 'Kane')!
check(kane?.times === 3 && kane.averageScore === 800, `Kane drafted ${kane?.times} times, average ${kane?.averageScore}`)
check(s.drafted[0].name === 'Kane' && s.drafted.some(d => d.name === 'Salah' && d.times === 2) && !s.drafted.some(d => d.times < 2), `drafted: ${JSON.stringify(s.drafted)}`)

check(s.pundits.points.map(x => x.diff).join() === '11,-4' && s.pundits.beaten === 1 && s.pundits.average === 3.5, `pundits ${JSON.stringify(s.pundits)}`)
check(summarise([]).best === null && summarise([]).records.length === 0 && summarise([]).pundits.average === null, 'an empty career')

console.log(failures === 0 ? '✅ ALL CHECKS PASSED' : `${failures} failures`)
process.exit(failures === 0 ? 0 : 1)
