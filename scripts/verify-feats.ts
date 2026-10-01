// P8-126: every feat's rule, from made-up saved runs.
// npx tsx scripts/verify-feats.ts
import { FEATS, featCounts, isRunWon, fullPathTrophy, type FeatRun } from '../src/lib/feats'

let failures = 0
function check(cond: boolean, msg: string) { if (!cond) { failures++; console.log('❌', msg) } }

const player = (i: number, over: Partial<{ nationality: string; clubName: string; birthYear: number; isBench: boolean }> = {}) => ({
  name: `P${i}`, nationality: over.nationality ?? `N${i}`, clubName: over.clubName ?? `Club ${i}`,
  birthYear: over.birthYear ?? 1995, yearStart: 2020, isBench: over.isBench,
})
const xi = (f: (i: number) => Partial<{ nationality: string; clubName: string; birthYear: number }>) => Array.from({ length: 11 }, (_, i) => player(i, f(i)))
const league = (squad: FeatRun['squad'], won = true, extra: Partial<FeatRun> = {}): FeatRun =>
  ({ mode: 'league', tier: won ? 'perfection' : 'mid_table', final_position: won ? 1 : 9, losses: 3, squad, ...extra })
const has = (run: FeatRun, id: string) => FEATS.find(f => f.id === id)!.earned(run)

// One nation: eleven Englishmen, won; a bench from elsewhere doesn't matter.
const english = [...xi(() => ({ nationality: 'England' })), player(20, { nationality: 'Spain', isBench: true })]
check(has(league(english), 'one-nation'), 'eleven Englishmen who won the league: One nation')
check(!has(league(english, false), 'one-nation'), 'One nation without the title')
check(!has(league(xi(i => ({ nationality: i === 10 ? 'Wales' : 'England' }))), 'one-nation'), 'ten English and a Welshman is not One nation')

// The kids: all 21 or under in the season they were drafted from.
check(has(league(xi(() => ({ birthYear: 1999 }))), 'the-kids'), 'all aged 21: The kids')
check(!has(league(xi(i => ({ birthYear: i === 0 ? 1998 : 2000 }))), 'the-kids'), 'one 22-year-old spoils The kids')
check(!has(league(xi(() => ({})).map(p => ({ ...p, birthYear: undefined }))), 'the-kids'), 'a run with no ages can\'t earn The kids')

// Eleven nations, No veterans, One club.
check(has(league(xi(() => ({}))), 'eleven-nations'), 'eleven different countries: Eleven nations')
check(has(league(xi(() => ({ birthYear: 1992 }))), 'no-veterans'), 'all 28: No veterans')
check(!has(league(xi(i => ({ birthYear: i === 3 ? 1991 : 1995 }))), 'no-veterans'), 'a 29-year-old spoils No veterans')
check(has(league(xi(() => ({ clubName: 'Arsenal' }))), 'one-club'), 'all from Arsenal: One club')

// Blind and perfect: hidden ratings, by the stored meta or by the mode.
check(has(league(null, true, { difficulty_meta: { ratingsShown: false } }), 'blind-perfect'), 'perfection with ratings hidden')
check(!has(league(null, true, { difficulty_meta: { ratingsShown: true } }), 'blind-perfect'), 'perfection with ratings shown is not blind')
check(has({ mode: 'cursed', tier: 'perfection', final_position: 1 }, 'blind-perfect'), 'Cursed always drafts blind')
check(has({ mode: 'world_cup', tier: 'winner', final_position: null, difficulty: 'hard' }, 'blind-perfect'), 'a World Cup won on Hard (no meta): blind')

// Invincibles: a league, won, no defeats; never a cup.
check(has(league(null, true, { losses: 0 }), 'invincibles'), 'a title with no defeats: Invincibles')
check(!has(league(null, true, { losses: 1 }), 'invincibles'), 'one defeat spoils Invincibles')
check(!has({ mode: 'world_cup', tier: 'winner', final_position: null, losses: 0 }, 'invincibles'), 'a cup is never Invincibles')
// P8-173: the league's cup.
const won = { cup: { winner: { isPlayer: true } } }, lost = { cup: { winner: { isPlayer: false } } }
check(has(league(null, false, { highlights: won }), 'cup-winners'), 'the cup won in a mid-table season: Cup winners')
check(!has(league(null, false, { highlights: won }), 'the-double'), 'the cup without the league is no Double')
check(has(league(null, true, { highlights: won }), 'the-double'), 'the league and the cup: the Double')
check(!has(league(null, true, { highlights: lost }), 'the-double'), 'the league alone is no Double')
check(!has(league(null, true, {}), 'cup-winners'), 'a run saved before the cup has no cup feat')

// A short squad earns no squad feat; the win rule is the app's.
check(!has(league(xi(() => ({ nationality: 'England' })).slice(0, 10)), 'one-nation'), 'ten players is not an eleven')
check(isRunWon({ mode: 'champions_league', tier: 'winner', final_position: null }) && !isRunWon({ mode: 'league', tier: 'perfection', final_position: 2 }), 'the win rule')
check(featCounts([league(english), league(english)]).get('one-nation') === 2, 'feats are counted per run')
check(new Set(FEATS.map(f => f.id)).size === FEATS.length, 'two feats share an id')

// P8.5-21: the full path's grid reads the competition from the tier.
for (const [tier, want] of [['winner', 'ucl'], ['uel_winner', 'uel'], ['uecl_winner', 'uecl'], ['finalist', null], ['uel_finalist', null], ['not_qualified', null]] as const) {
  const run = { mode: 'champions_league_custom', tier, final_position: null }
  check(fullPathTrophy(run) === want, `full path ${tier}: ${fullPathTrophy(run)} (want ${want})`)
  check(isRunWon(run) === (want !== null), `full path ${tier}: won is ${isRunWon(run)}`)
}
check(fullPathTrophy({ mode: 'champions_league', tier: 'winner' }) === null, 'the classic UCL filled the full path grid')

// P8.5-21: the route feats. Each has a run that earns it and a near-miss.
{
  const fp = (tier: string, fullPath: FeatRun['fullPath']): FeatRun => ({ mode: 'champions_league_custom', tier, final_position: null, fullPath })
  const feat = (id: string) => FEATS.find(f => f.id === id)!
  const cases: [string, FeatRun, boolean][] = [
    ['cup-route', fp('uecl_winner', { entry: { comp: 'uecl', round: 'q2', viaCup: true }, qualTies: 2 }), true],
    ['cup-route', fp('uecl_finalist', { entry: { comp: 'uecl', round: 'q2', viaCup: true }, qualTies: 2 }), false],
    ['cup-route', fp('uecl_winner', { entry: { comp: 'uecl', round: 'q2', viaCup: false }, qualTies: 2 }), false],
    ['fallen-giant', fp('uel_winner', { entry: { comp: 'ucl', round: 'q2' }, qualTies: 2 }), true],
    ['fallen-giant', fp('uel_winner', { entry: { comp: 'ucl', round: 'league_phase' }, qualTies: 0 }), false],
    ['fallen-giant', fp('winner', { entry: { comp: 'ucl', round: 'q2' }, qualTies: 3 }), false],
    ['straight-through', fp('winner', { entry: { comp: 'ucl', round: 'league_phase' }, qualTies: 0 }), true],
    ['straight-through', fp('winner', { entry: { comp: 'ucl', round: 'q3' }, qualTies: 2 }), false],
    ['the-long-way', fp('uecl_winner', { entry: { comp: 'ucl', round: 'q1' }, qualTies: 4 }), true],
    ['the-long-way', fp('uecl_winner', { entry: { comp: 'ucl', round: 'q1' }, qualTies: 3 }), false],
    ['double-europe', fp('uel_winner', { entry: { comp: 'uel', round: 'league_phase' }, qualTies: 0, domesticChampion: true, cupWon: true }), true],
    ['double-europe', fp('uel_winner', { entry: { comp: 'uel', round: 'league_phase' }, qualTies: 0, domesticChampion: true, cupWon: false }), false],
    ['double-europe', fp('uel_sf_exit', { entry: { comp: 'uel', round: 'league_phase' }, qualTies: 0, domesticChampion: true, cupWon: true }), false],
  ]
  for (const [id, run, want] of cases) check(feat(id).earned(run) === want, `${id} on ${run.tier} ${JSON.stringify(run.fullPath)}: ${!want ? 'earned' : 'not earned'}`)
  const trio = [fp('winner', null), fp('uel_winner', null), fp('uecl_winner', null)]
  check(featCounts(trio).get('three-trophies') === 1, 'three different trophies made no collection')
  check(featCounts([trio[0], trio[1], trio[1]]).get('three-trophies') === 0, 'two trophies made the collection')
  check(featCounts([trio[0]]).get('straight-through') === 0, 'a run with no route earned a route feat')
}

console.log(failures === 0 ? '✅ ALL CHECKS PASSED' : `${failures} failures`)
process.exit(failures === 0 ? 0 : 1)
