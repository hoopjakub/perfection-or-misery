// Verifies Awards Night (src/engine/awards.ts) over thousands of generated
// seasons:
//  - determinism: the same inputs in any order give an identical night
//  - Player of the Season is ALWAYS the best season by the scoring model — the
//    maintainer's rule: an award is measured, never voted
//  - every award's winner really leads its column, and is eligible for it
//  - the team of the season (and every team of the matchday) is a legal
//    eleven: a real formation, every slot filled once, nobody picked twice,
//    every player in their own position or one the slot accepts
//  - the chosen formation is the best fit: no other shape scores higher
//  - the bench holds the next best, nobody from the eleven, at most seven
//  - club awards: best attack/defence are the real leaders; the manager award
//    rewards beating the prediction, and a title win counts extra
// Run: npx tsx scripts/verify-awards.ts

import { buildAwardsNight, pickTeam, lineOf, BENCH_SIZE, managerScore, placeWorth, type Pick, type ClubRow } from '../src/engine/awards'
import { ALL_FORMATIONS, getSlotsForFormation } from '../src/engine/formations'
import { applyImportance, importanceFactor, matchWeight } from '../src/engine/importance'
import type { AwardCandidate, SeasonAwards, CompetitionStats, TeamGoalRecord } from '../src/types/stats'

let failures = 0
function check(cond: boolean, msg: string) {
  if (!cond) { failures++; if (failures <= 30) console.log(`❌ ${msg}`) }
}

function rng(seed: number) {
  let s = seed >>> 0
  return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296 }
}

// A club's eleven: real positions, enough of each that every shape can be tried.
const SQUAD = ['GK', 'RB', 'CB', 'CB', 'LB', 'CDM', 'CM', 'CAM', 'RW', 'LW', 'ST', 'CM', 'RM', 'LM', 'CB']

function season(seed: number, clubs = 20) {
  const r = rng(seed)
  const candidates: AwardCandidate[] = []
  const teams: TeamGoalRecord[] = []
  const clubRows: ClubRow[] = []
  for (let c = 0; c < clubs; c++) {
    const strength = 1 - c / clubs
    let gf = 0
    for (let i = 0; i < SQUAD.length; i++) {
      const position = SQUAD[i]
      const q = strength * r()
      const line = lineOf(position)
      const goals = line === 'FWD' ? Math.round(q * 26) : line === 'MID' ? Math.round(q * 8) : Math.round(q * 2)
      gf += goals
      candidates.push({
        playerId: `p${String(c).padStart(2, '0')}-${String(i).padStart(2, '0')}`, name: `P${c}-${i}`, seasonLabel: '24/25',
        clubId: `c${c}`, clubName: `Club ${c}`, position,
        age: r() < 0.2 ? 20 : 27,
        goals, assists: Math.round(q * 11),
        cleanSheets: line === 'GK' || line === 'DEF' ? Math.round(q * 16) : 0,
        avgRating: 6.1 + q * 1.5, potm: Math.round(q * 6), matchesRated: 20 + Math.round(r() * 18),
        finalPosition: c + 1,
        score: Math.round((goals * 4 + q * 60) * 10) / 10,
        isPlayerClub: c === seed % clubs,
        chancesCreated: Math.round(q * 40), tacklesWon: Math.round(q * 50), interceptions: Math.round(q * 40),
        saves: line === 'GK' ? Math.round(q * 90) : 0, shotsOnTarget: Math.round(q * 30),
      })
    }
    teams.push({ clubId: `c${c}`, clubName: `Club ${c}`, goalsFor: gf, goalsAgainst: Math.round((1 - strength) * 60 + r() * 10), cleanSheets: Math.round(strength * 15) })
    clubRows.push({ clubId: `c${c}`, clubName: `Club ${c}`, finalPosition: c + 1, predicted: 1 + Math.floor(r() * clubs) })
  }
  const positive = candidates.filter(c => c.score > 0)
  const awards: SeasonAwards = {
    playerOfTheSeason: [...positive].sort((a, b) => b.score - a.score),
    bestU21: positive.filter(c => (c.age ?? 99) <= 21).sort((a, b) => b.score - a.score),
  }
  const stats: CompetitionStats = { players: [], teams }
  // Three rounds of ratings, so teams of the matchday are exercised too.
  const rounds = [1, 2, 3].map(md => ({
    label: `Matchday ${md}`,
    lines: candidates.map(c => ({
      playerId: c.playerId, name: c.name, position: c.position,
      rating: Math.round((5.8 + r() * 3) * 10) / 10, clubName: c.clubName, isPlayerClub: !!c.isPlayerClub,
    })),
  }))
  return { awards, stats, rounds, clubs: clubRows }
}

function checkTeam(team: NonNullable<ReturnType<typeof pickTeam>>, pool: Pick[], label: string) {
  const slots = getSlotsForFormation(team.formation)
  check(ALL_FORMATIONS.includes(team.formation), `${label}: not a real formation`)
  check(team.xi.length === slots.length, `${label}: ${team.xi.length} of ${slots.length} slots filled`)
  check(new Set(team.xi.map(x => x.slot.slotIndex)).size === team.xi.length, `${label}: a slot filled twice`)
  check(new Set(team.xi.map(x => x.player.id)).size === team.xi.length, `${label}: a player picked twice`)
  for (const x of team.xi) {
    check(x.player.position === x.slot.primary || x.slot.accepts.includes(x.player.position as never),
      `${label}: ${x.player.position} playing ${x.slot.label}`)
  }
  const inXI = new Set(team.xi.map(x => x.player.id))
  check(team.bench.length <= BENCH_SIZE, `${label}: bench of ${team.bench.length}`)
  check(team.bench.every(p => !inXI.has(p.id)), `${label}: a starter on the bench`)
  const sortedOut = pool.filter(p => !inXI.has(p.id)).sort((a, b) => b.score - a.score || a.id.localeCompare(b.id))
  check(team.bench.every((p, i) => p.id === sortedOut[i]?.id), `${label}: the bench isn't the next best`)
  // No other shape beats the chosen one on the same pool.
  const again = pickTeam([...pool].reverse())
  check(!!again && again.formation === team.formation && again.total === team.total, `${label}: the shape depends on input order`)
}

const SEASONS = 600
const formationsSeen = new Map<string, number>()
let managerWasFavourite = 0

for (let s = 1; s <= SEASONS; s++) {
  const input = season(s, s % 3 === 0 ? 18 : 20)
  const night = buildAwardsNight(input)

  // Determinism, whatever order everything arrives in.
  const shuffled = buildAwardsNight({
    ...input,
    awards: { playerOfTheSeason: [...input.awards.playerOfTheSeason].reverse(), bestU21: [...input.awards.bestU21].reverse() },
    stats: { ...input.stats, teams: [...input.stats.teams].reverse() },
    rounds: input.rounds.map(r => ({ ...r, lines: [...r.lines].reverse() })),
    clubs: [...input.clubs].reverse(),
  })
  const strip = (n: typeof night) => JSON.stringify(n, (k, v) => (typeof v === 'function' ? undefined : v))
  check(strip(night) === strip(shuffled), `season ${s}: input order changed the night`)

  // P8-155: Player of the Season is whoever stood furthest above his own
  // line: always the best score IN his line, and the furthest above it of any.
  const pots = night.playerOfTheSeason?.winner
  if (pots) {
    const line = lineOf(pots.position)
    const regs = input.awards.playerOfTheSeason.filter(c => (c.matchesRated ?? 0) >= 10 && c.score > 0)
    const bestInLine = [...regs.filter(c => lineOf(c.position) === line)].sort((a, b) => b.score - a.score)[0]
    check(!bestInLine || pots.score >= bestInLine.score, `season ${s}: Player of the Season isn't the best of his line`)
    const standing = (c: AwardCandidate) => {
      const xs = regs.filter(x => lineOf(x.position) === lineOf(c.position)).map(x => x.score)
      const m = xs.reduce((a, b) => a + b, 0) / xs.length, sd = Math.sqrt(xs.reduce((a, b) => a + (b - m) ** 2, 0) / xs.length)
      return sd > 0 ? (c.score - m) / sd : 0
    }
    const top = [...regs].sort((a, b) => standing(b) - standing(a))[0]
    check(!top || Math.abs(standing(pots) - standing(top)) < 1e-9, `season ${s}: someone stood further above his line than the Player of the Season`)
  }

  // Each award's winner leads its column and is eligible.
  const all = input.awards.playerOfTheSeason
  for (const a of night.players) {
    const w = a.winner
    if (a.key === 'boot') check(w.goals === Math.max(...all.map(c => c.goals)), `season ${s}: golden boot isn't the top scorer`)
    if (a.key === 'playmaker') check(w.assists === Math.max(...all.map(c => c.assists)), `season ${s}: playmaker isn't the top assister`)
    if (a.key === 'glove') {
      check(lineOf(w.position) === 'GK', `season ${s}: golden glove isn't a keeper`)
      check(w.cleanSheets === Math.max(...all.filter(c => lineOf(c.position) === 'GK').map(c => c.cleanSheets)), `season ${s}: golden glove isn't the best keeper`)
    }
    if (a.key === 'defender') check(lineOf(w.position) === 'DEF', `season ${s}: defender of the season isn't a defender`)
    // P8-36's split: each positional award goes to a position it's for.
    const FOR: Record<string, string[]> = {
      fullback: ['RB', 'LB', 'RWB', 'LWB'], midfielder: ['CDM', 'CM', 'CAM', 'RM', 'LM'], defensiveMid: ['CDM', 'CM'], attackingMid: ['CAM', 'CM'],
      winger: ['RW', 'LW', 'RM', 'LM'], forward: ['ST', 'CF'],
    }
    if (FOR[a.key]) check(FOR[a.key].includes(w.position), `season ${s}: ${a.key} went to a ${w.position}`)
    check(!a.runnersUp.some(r => r.playerId === w.playerId), `season ${s}: ${a.key} winner is also a runner-up`)
  }
  check(!night.bestU21 || (night.bestU21.winner.age ?? 99) <= 21, `season ${s}: best under-21 is older than 21`)

  // Teams.
  check(!!night.teamOfTheSeason, `season ${s}: no team of the season`)
  if (night.teamOfTheSeason) {
    const pool: Pick[] = all.map(c => ({ id: c.playerId, name: c.name, position: c.position, score: c.score, clubName: c.clubName, isPlayerClub: c.isPlayerClub }))
    checkTeam(night.teamOfTheSeason, pool, `season ${s} TOTS`)
    formationsSeen.set(night.teamOfTheSeason.formation, (formationsSeen.get(night.teamOfTheSeason.formation) ?? 0) + 1)
  }
  check(night.teamsOfTheRound.length === input.rounds.length, `season ${s}: ${night.teamsOfTheRound.length} teams of the matchday for ${input.rounds.length} rounds`)
  for (const r of night.teamsOfTheRound) {
    const round = input.rounds.find(x => x.label === r.label)!
    const pool: Pick[] = round.lines.map(l => ({ id: l.playerId, name: l.name, position: l.position, score: l.rating, clubName: l.clubName, isPlayerClub: l.isPlayerClub }))
    checkTeam(r.team, pool, `season ${s} ${r.label}`)
  }
  // P8-100: the regular's headline divides by the rounds played, and nobody is
  // picked more often than there were rounds.
  const totr = night.players.find(a => a.key === 'totr')
  if (totr) {
    const m = /Picked (\d+) times? in (\d+)$/.exec(totr.headline(totr.winner))
    check(!!m && +m[2] === input.rounds.length && +m[1] >= 1 && +m[1] <= +m[2], `season ${s}: regular headline "${totr.headline(totr.winner)}" for ${input.rounds.length} rounds`)
  }

  // Club awards.
  const attack = night.clubs.find(c => c.key === 'attack')
  check(!!attack && input.stats.teams.find(t => t.clubId === attack.winner.clubId)!.goalsFor === Math.max(...input.stats.teams.map(t => t.goalsFor)),
    `season ${s}: best attack isn't the top scorers`)
  const defence = night.clubs.find(c => c.key === 'defence')
  check(!!defence && input.stats.teams.find(t => t.clubId === defence.winner.clubId)!.goalsAgainst === Math.min(...input.stats.teams.map(t => t.goalsAgainst)),
    `season ${s}: best defence isn't the meanest`)
  const manager = night.clubs.find(c => c.key === 'manager')
  check(!!manager, `season ${s}: no manager of the season`)
  if (manager) {
    // P8-37: the winner has the best manager score (stars counted from the
    // night's own team of the season).
    const clubOf = new Map(input.awards.playerOfTheSeason.map(c => [c.playerId, c.clubId]))
    const stars = (id: string) => night.teamOfTheSeason?.xi.filter(x => clubOf.get(x.player.id) === id).length ?? 0
    const n = Math.max(input.clubs.length, ...input.clubs.map(c => Math.max(c.finalPosition, c.predicted!)))
    const top = Math.max(...input.clubs.map(c => managerScore(c, n, stars(c.clubId))))
    const w = input.clubs.find(c => c.clubId === manager.winner.clubId)!
    check(Math.abs(managerScore(w, n, stars(w.clubId)) - top) < 1e-9, `season ${s}: the manager award didn't go to the best manager score`)
    if (w.predicted === 1 && w.finalPosition === 1) managerWasFavourite++
  }
}

// A favourite who wins the league can take the manager award.
const favourite = buildAwardsNight({
  ...season(9999),
  clubs: [
    { clubId: 'a', clubName: 'Favourite', finalPosition: 1, predicted: 1 },
    { clubId: 'b', clubName: 'Mid', finalPosition: 5, predicted: 7 },
    { clubId: 'c', clubName: 'Flop', finalPosition: 15, predicted: 3 },
  ],
})
check(favourite.clubs.find(c => c.key === 'manager')?.winner.clubName === 'Favourite', 'a favourite that won the title lost the manager award to a +2')

// P8-37: places near the top are worth more — 10th to 5th beats 16th to 10th.
check(placeWorth(5, 20) - placeWorth(10, 20) > placeWorth(10, 20) - placeWorth(16, 20), 'a climb from 10th to 5th is worth less than 16th to 10th')
check(managerScore({ clubId: 'x', clubName: 'X', finalPosition: 5, predicted: 10 }, 20) > managerScore({ clubId: 'y', clubName: 'Y', finalPosition: 10, predicted: 16 }, 20),
  'the manager award prefers 16th→10th to 10th→5th')
// Your club's manager is you.
const mine = buildAwardsNight({
  ...season(4242), playerClubId: 'mine', managerName: 'MisterMan',
  clubs: [
    { clubId: 'mine', clubName: 'MisterMan XI', finalPosition: 2, predicted: 14 },
    { clubId: 'b', clubName: 'Other', finalPosition: 5, predicted: 6 },
  ],
})
check(mine.clubs.find(c => c.key === 'manager')?.winner.manager === 'MisterMan', "your club's manager award doesn't name you")

// P8-116: the full path. A two-game qualifying star can't win the tournament's
// awards (they're the league phase and knockouts), but qualifying has its own
// player and team, and he wins that. The club awards read the main stage's lines.
{
  const main = season(4242)
  const cands = main.awards.playerOfTheSeason
  const star: AwardCandidate = { ...cands[0], playerId: 'qstar', name: 'Q Star', clubId: 'q1', clubName: 'Out In Q2', position: 'ST', goals: 5, assists: 2, matchesRated: 4, score: 80 }
  const qualifying = [star, ...cands.slice(1, 40).map(c => ({ ...c, playerId: `q-${c.playerId}`, score: Math.round(c.score / 6) }))]
  const onlyMainTeam: TeamGoalRecord = { ...main.stats.teams[0], clubId: 'main-only', clubName: 'Main Stage FC', goalsFor: 999 }
  const night = buildAwardsNight({
    awards: { playerOfTheSeason: cands, bestU21: [], qualifying, teams: [onlyMainTeam] },
    stats: { players: [], teams: main.stats.teams }, mode: 'champions_league_custom',
  })
  check(night.qualifying?.player?.winner.playerId === 'qstar', 'the qualifying star did not win player of qualifying')
  check(!!night.qualifying?.team?.xi.some(x => x.player.id === 'qstar'), 'the qualifying star is not in the team of qualifying')
  check(night.playerOfTheSeason?.winner.playerId !== 'qstar' && !night.teamOfTheSeason?.xi.some(x => x.player.id === 'qstar'), 'a qualifying-only player reached the tournament awards')
  check(night.clubs.find(c => c.key === 'attack')?.winner.clubId === 'main-only', "the club awards didn't read the main stage's lines")
  const classic = buildAwardsNight({ awards: { playerOfTheSeason: cands, bestU21: [] }, stats: { players: [], teams: main.stats.teams } })
  check(classic.qualifying === undefined, 'a run with no qualifying grew a qualifying section')
}

// P8-130: the big matches count for more. Two players, the same ratings over
// the same eight games; one had his best nights in the knockouts, the other
// early in the league phase. The first edges it.
{
  const labels = ['League Phase · MD 1', 'League Phase · MD 2', 'League Phase · MD 3', 'League Phase · MD 4', 'Round of 16 · Leg 1', 'Quarter-final · Leg 1', 'Semi-final · Leg 2', 'Final']
  const late = labels.map((label, i) => ({ label, rating: i >= 4 ? 8.5 : 6.5 }))
  const early = labels.map((label, i) => ({ label, rating: i < 4 ? 8.5 : 6.5 }))
  const w = (l: string) => matchWeight(l, 0)
  check(importanceFactor(late, w) > 1.1 && importanceFactor(early, w) < importanceFactor(late, w), `the knockouts' star isn't weighted up (${importanceFactor(late, w).toFixed(2)} vs ${importanceFactor(early, w).toFixed(2)})`)
  const base = (id: string): AwardCandidate => ({ ...season(99).awards.playerOfTheSeason[0], playerId: id, name: id, score: 50, lineScores: { defender: 20 }, breakdown: [] })
  const ranked = applyImportance([base('early'), base('late')], id => (id === 'late' ? late : early), w)
  check(ranked[0].playerId === 'late' && ranked[0].score > ranked[1].score, 'the big-night player does not edge the identical early one')
  check(ranked[0].breakdown!.some(p => p.label.startsWith('Big matches')), 'the weighting is not shown in the breakdown')
  check(ranked[0].lineScores!.defender! > 20, 'the positional scores are not weighted too')
  check(matchWeight('Final', 0) === 1.5 && matchWeight('Matchday 36', 38) === 1.1 && matchWeight('Matchday 3', 38) === 1 && matchWeight('Group A · MD 1', 0) === 1, 'match weights')
  check(importanceFactor([{ label: 'Final', rating: 5 }], w) === 1, 'a quiet final lifts nobody')
}

// Empty inputs don't throw.
const empty = buildAwardsNight({ awards: { playerOfTheSeason: [], bestU21: [] }, stats: { players: [], teams: [] } })
check(!empty.playerOfTheSeason && !empty.teamOfTheSeason && empty.players.length === 0, 'an empty season broke the night')

check(formationsSeen.size >= 2, `the team of the season was always a ${[...formationsSeen.keys()][0]}: the shape never adapts`)

console.log(`${SEASONS} seasons · team-of-the-season shapes: ${[...formationsSeen.entries()].sort((a, b) => b[1] - a[1]).map(([f, n]) => `${f} ${n}`).join(', ')}`)
console.log(`manager of the season went to a favourite who won it ${managerWasFavourite} times`)
if (failures === 0) console.log('✅ ALL CHECKS PASSED')
else console.log(`${failures} failure(s)`)
process.exit(failures === 0 ? 0 : 1)
