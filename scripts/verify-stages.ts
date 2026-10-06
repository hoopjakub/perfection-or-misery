// verify-stages.ts — the stage model's match layer (centralisation step 3,
// docs/centralisation/12-PHASE-TWO-FINAL.md; src/engine/stages.ts).
//
// Every match sheet in the app is now built by matchRequest / tieRequest /
// cupTieRequest from one match type. These checks hold the adapters to the
// engine's own results: nothing the sim stored (score, seed, scorers, rotation,
// availability, extra time, shootout) may be lost or changed on the way to a
// sheet, a two-legged tie's legs must add up to the engine's aggregate, and a
// tie opened on a competition's timeline must land on its own slot there.
//
// Run: npx tsx scripts/verify-stages.ts

import { buildCLTeams, simulateCLKnockoutsOnly, type CLKnockoutMatch } from '../src/engine/cl-sim'
import { buildWCTeams, simulateWorldCup } from '../src/engine/world-cup-sim'
import { planCup, playCupAfter } from '../src/engine/domestic-cup'
import { clCompetitionMatches, koLegMatchday } from '../src/engine/match-context'
import {
  matchRequest, legsRequest, leagueMatch, fixtureMatch, wcKnockoutMatch, cupTieMatches, cupTieRequest,
  runMatch, tieRequest, clTie, wcTie, qualTie, runTie, type MatchCtx, type MatchDetailRequest, type StageTie,
} from '../src/engine/stages'
import { mulberry32 } from '../src/lib/rng'
import { liveBracket } from '../src/lib/liveBracket'
import { tieDetail } from '../src/lib/tieDetail'
import type { MatchScorers } from '../src/types/stats'
import type { SimTeam } from '../src/types/simulation'

let failures = 0, checks = 0
function check(cond: boolean, msg: string) { checks++; if (!cond) { failures++; if (failures <= 25) console.log(`❌ ${msg}`) } }

const rng = mulberry32(31003)
const int = (n: number) => Math.floor(rng() * n)
const scorers = (tag: string): MatchScorers => ({
  home: [{ playerId: `${tag}h`, playerName: `${tag} H`, minute: 1 + int(90) }] as any,
  away: [{ playerId: `${tag}a`, playerName: `${tag} A`, minute: 1 + int(90) }] as any,
})
const ctx: MatchCtx = { yearStart: 2024, playerClubId: 'c0', drafted: [], playerFormation: '4-3-3' as any }
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b)

// ── 1 · League-shaped matches keep everything ───────────────────────────────
// A league fixture, a league-phase or group game, the full path's matchday.
for (let i = 0; i < 2000; i++) {
  const played = i % 10 !== 0
  const src = {
    matchday: 1 + int(38), home: { clubId: `h${i}`, clubName: `Home ${i}` }, away: { clubId: `a${i}`, clubName: `Away ${i}` },
    homeGoals: played ? int(5) : undefined, awayGoals: played ? int(5) : undefined,
    scorers: scorers(`m${i}`), seed: int(2 ** 31), homeRotation: rng(), awayRotation: rng(),
    absent: [`x${i}`], standIns: [{ id: `s${i}` } as any],
  }
  const label = `League Phase · Matchday ${src.matchday}`
  const m = i % 2 ? leagueMatch(src, label) : fixtureMatch({ ...src, homeGoals: undefined, awayGoals: undefined, result: played ? { homeGoals: src.homeGoals!, awayGoals: src.awayGoals! } : null }, label)
  const timeline = [m]
  const r = matchRequest(m, { ...ctx, timeline })
  if (!played) { check(r === null, `an unplayed match opened a sheet (${i})`); continue }
  check(!!r, `a played match opened no sheet (${i})`)
  if (!r) continue
  check(r.homeClubId === src.home.clubId && r.awayClubId === src.away.clubId && r.homeName === src.home.clubName && r.awayName === src.away.clubName, `sides changed (${i})`)
  check(r.homeGoals === src.homeGoals && r.awayGoals === src.awayGoals, `score changed (${i})`)
  check(r.seed === src.seed && same(r.scorers, src.scorers), `seed or scorers changed (${i})`)
  check(r.homeRotation === src.homeRotation && r.awayRotation === src.awayRotation, `rotation lost (${i}): the sheet would pick a different eleven`)
  check(same(r.absent, src.absent) && same(r.standIns, src.standIns), `availability lost (${i})`)
  check(r.competitionLabel === label && r.matchday === src.matchday && r.contextMatches === timeline, `label, matchday or timeline lost (${i})`)
  check(r.yearStart === ctx.yearStart && r.playerClubId === ctx.playerClubId && r.playerFormation === ctx.playerFormation && r.drafted === ctx.drafted, `the run's context lost (${i})`)
  // Without a timeline there's no slot: the sheet drops those sections.
  const bare = matchRequest(m, ctx)!
  check(bare.matchday === undefined && bare.contextMatches === undefined, `a match with no timeline claimed a slot (${i})`)
}

// The tie model must say what the engine decided: two legs at 90 minutes
// plus extra time make the aggregate, the winner and the shootout carry over.
function tieModelOk(st: StageTie, what: string, aGoals: number, bGoals: number, winnerIsA: boolean, shootout: boolean, et?: { a: number; b: number }) {
  check(st.aGoals === aGoals && st.bGoals === bGoals, `${what}: the tie's score changed`)
  if (st.legs) check(st.legs[0].a + st.legs[1].a + (et?.a ?? 0) === aGoals && st.legs[0].b + st.legs[1].b + (et?.b ?? 0) === bGoals,
    `${what}: legs ${JSON.stringify(st.legs)} and extra time ${JSON.stringify(et)} don't make ${aGoals}-${bGoals}`)
  check(st.winnerIsA === winnerIsA, `${what}: who went through changed`)
  check(st.shootout === shootout && (!shootout || !!st.pens), `${what}: the shootout went missing`)
  if (et) check(!!st.extraTime, `${what}: extra time went missing`)
}

// ── 2 · Champions League knockouts: legs add up, timeline slots are right ───
const LABEL: Record<string, string> = { playoff: 'KO Play-off', r16: 'Round of 16', qf: 'Quarter-final', sf: 'Semi-final', final: 'Final' }
let ties = 0, twoLegged = 0, shootouts = 0, etSecondLegs = 0
for (let run = 0; run < 300; run++) {
  const field = Array.from({ length: 36 }, (_, i) => ({ clubId: `c${i}`, clubName: `Club ${i}`, ovr: 70 + int(20), isPlayer: i === 0 }))
  const teams = buildCLTeams(field)
  const sorted = [...teams].sort(() => 0)
  const res = simulateCLKnockoutsOnly(sorted)
  const rounds = [
    { key: 'playoff', ties: res.playoffRound }, { key: 'r16', ties: res.r16 }, { key: 'qf', ties: res.qf },
    { key: 'sf', ties: res.sf }, { key: 'final', ties: res.final ? [res.final] : [] },
  ]
  // The sim attributes scorers on screen; give every leg its own so the check
  // can see they travel to the right leg.
  for (const r of rounds) for (const t of r.ties) {
    t.leg1Scorers = scorers(`${run}${r.key}${t.teamA.clubId}1`)
    if (t.leg2) t.leg2Scorers = scorers(`${run}${r.key}${t.teamA.clubId}2`)
    if (t.leg2ExtraTime) t.leg2ExtraTimeScorers = scorers(`${run}${r.key}${t.teamA.clubId}e`)
  }
  const timeline = clCompetitionMatches([], rounds.map(r => ({ label: LABEL[r.key], ties: r.ties })))
  // Step 5: the bracket names the engine's winner for every tie, writes the
  // one tie line, and names nobody in a round whose live match is still on.
  const asRounds = rounds.filter(r => r.ties.length).map(r => ({ round: r.key, label: LABEL[r.key], ties: r.ties }))
  const done = liveBracket(asRounds, { visible: asRounds.length, liveOpen: false, progress: 0, yearStart: 2024 })
  done.columns.forEach((c, ci) => c.ties.forEach((bt, ti) => {
    const tie = asRounds[ci].ties[ti]
    check(bt.winner === (tie.winner.clubId === tie.teamA.clubId ? 'a' : 'b'), `bracket ${c.key}: names the wrong side through`)
    check(bt.note === tieDetail(clTie(tie)), `bracket ${c.key}: its line "${bt.note}" isn't the tie's "${tieDetail(clTie(tie))}"`)
  }))
  const midway = liveBracket(asRounds, { visible: asRounds.length, liveOpen: true, progress: 0.5, yearStart: 2024 })
  check(midway.columns[midway.columns.length - 1].ties.every(bt => bt.winner === undefined), 'bracket: the round being played already names who went through')
  for (const r of rounds) for (const t of r.ties) {
    ties++
    const label = LABEL[r.key]
    const req = tieRequest(t, label, ctx)
    check(!!req, `a ${r.key} tie opened no sheet`)
    if (!req) continue
    if (t.leg1 && t.leg2) {
      twoLegged++
      const [l1, l2] = req.legs ?? []
      check(!!l1 && !!l2, `a two-legged ${r.key} tie lost a leg`)
      if (!l1 || !l2) continue
      // Leg 1 at A's ground, leg 2 at B's with its extra time folded in.
      check(l1.homeClubId === t.teamA.clubId && l2.homeClubId === t.teamB.clubId, `${r.key}: legs at the wrong grounds`)
      check(l1.homeGoals + l2.awayGoals === t.aGoals && l1.awayGoals + l2.homeGoals === t.bGoals, `${r.key}: legs ${l1.homeGoals}-${l1.awayGoals}, ${l2.homeGoals}-${l2.awayGoals} don't add up to ${t.aGoals}-${t.bGoals}`)
      check(l1.seed === t.leg1Seed && l2.seed === t.leg2Seed, `${r.key}: a leg's seed changed`)
      check(same(l1.scorers, t.leg1Scorers), `${r.key}: leg 1's scorers changed`)
      const etHome = t.leg2ExtraTimeScorers?.home ?? [], etAway = t.leg2ExtraTimeScorers?.away ?? []
      check((l2.scorers?.home.length ?? 0) === (t.leg2Scorers?.home.length ?? 0) + etHome.length
        && (l2.scorers?.away.length ?? 0) === (t.leg2Scorers?.away.length ?? 0) + etAway.length, `${r.key}: leg 2 dropped its extra-time scorers`)
      if (t.leg2ExtraTime) { etSecondLegs++; check(!!l2.extraTime, `${r.key}: leg 2 went to extra time and the sheet doesn't say so`) }
      check(!l1.pensNote && (t.aPens === undefined) === !l2.pensNote, `${r.key}: the shootout is on the wrong leg, or missing`)
      check(l1.absent === t.leg1Absent && l2.absent === t.leg2Absent, `${r.key}: a leg's absences crossed over`)
    } else {
      check(req.homeClubId === t.teamA.clubId && req.homeGoals === t.aGoals && req.awayGoals === t.bGoals, `the ${r.key} (one match) changed its score`)
      check(req.seed === t.leg1Seed && same(req.scorers, t.leg1Scorers) && !!req.extraTime === !!t.extraTime, `the ${r.key}: seed, scorers or extra time changed`)
      check((t.aPens === undefined) === !req.pensNote, `the ${r.key}: the shootout went missing`)
    }
    if (t.aPens !== undefined) shootouts++
    // The one tie model (L-06): every row and bracket card is drawn from it.
    const st = clTie(t)
    tieModelOk(st, `CL ${r.key}`, t.aGoals, t.bGoals, t.winner.clubId === t.teamA.clubId, t.aPens !== undefined,
      t.leg2ExtraTime ? { a: t.leg2ExtraTime.aGoals, b: t.leg2ExtraTime.bGoals } : undefined)
    // On the competition's timeline each leg opens on its own slot.
    for (const leg of (t.leg2 ? [1, 2] : [1]) as (1 | 2)[]) {
      const on = tieRequest(t, label, { ...ctx, timeline }, leg)
      check(on?.contextMatches === timeline, `${r.key} leg ${leg}: opened without the competition's timeline`)
      check(on?.matchday === koLegMatchday(timeline, t.teamA.clubId, t.teamB.clubId, label, leg), `${r.key} leg ${leg}: opened on matchday ${on?.matchday}, its slot is ${koLegMatchday(timeline, t.teamA.clubId, t.teamB.clubId, label, leg)}`)
    }
    // Not on a timeline (a qualifying tie): a one-tie bracket of its own.
    check(!!req.contextMatches?.length && req.matchday !== undefined, `${r.key}: a tie off the timeline got no bracket of its own`)
  }
}
console.log(`CL knockouts: ${ties} ties (${twoLegged} two-legged, ${etSecondLegs} second legs to extra time, ${shootouts} shootouts)`)
check(etSecondLegs > 0 && shootouts > 0, 'no extra time or shootout came up: the checks above never ran on them')

// ── 3 · World Cup knockouts ──────────────────────────────────────────────────
let wcTies = 0, wcPens = 0
for (let run = 0; run < 60; run++) {
  const nations = Array.from({ length: 48 }, (_, i) => ({ clubId: `n${i}`, clubName: `Nation ${i}`, ovr: 70 + int(20), isPlayer: i === 0 }))
  const res = simulateWorldCup(buildWCTeams(nations))
  res.knockoutRounds.forEach((round, ri) => round.matches.forEach(m => {
    wcTies++
    m.scorers = scorers(`w${run}${ri}${m.teamA.clubId}`)
    const c = wcKnockoutMatch(m, round.round, 10 + ri)
    const req = matchRequest(c, ctx)!
    check(req.homeClubId === m.teamA.clubId && req.homeGoals === m.result.homeGoals && req.awayGoals === m.result.awayGoals, `WC ${round.round}: score changed`)
    check(req.seed === m.seed && same(req.scorers, m.scorers) && !!req.extraTime === !!m.result.extraTime, `WC ${round.round}: seed, scorers or extra time changed`)
    check(c.tieWinnerClubId === m.winner.clubId, `WC ${round.round}: who went through changed`)
    check((m.result.homePens === null) === !req.pensNote, `WC ${round.round}: the shootout went missing`)
    if (m.result.homePens !== null) wcPens++
    tieModelOk(wcTie(m), `WC ${round.round}`, m.result.homeGoals, m.result.awayGoals, m.winner.clubId === m.teamA.clubId, m.result.homePens !== null)
  }))
}
console.log(`World Cup knockouts: ${wcTies} matches, ${wcPens} shootouts`)

// ── 4 · Domestic cups ────────────────────────────────────────────────────────
let cupTies = 0, cupLegs = 0
for (let run = 0; run < 200; run++) {
  const sides: SimTeam[] = Array.from({ length: 20 }, (_, i) => ({
    clubId: `d${i}`, clubName: `Dom ${i}`, ovr: 70 + int(20), isPlayer: i === 0, form: 0,
    stats: { played: 0, won: 0, drawn: 0, lost: 0, goalsFor: 0, goalsAgainst: 0, points: 0 },
  }))
  let cup = planCup(sides, 38, 1 + run, 'Cup', run % 2 === 0)
  if (!cup) continue
  for (let md = 1; md <= 38; md++) cup = playCupAfter(cup, md, sides)
  for (const round of cup.rounds) for (const t of round.ties) {
    cupTies++
    const ms = cupTieMatches(t, `Cup · ${round.label}`)
    const req = cupTieRequest(t, `Cup · ${round.label}`, ctx)!
    if (t.legs) {
      cupLegs++
      const [l1, l2] = ms
      check(l1.homeGoals! + l2.awayGoals! === t.homeGoals && l1.awayGoals! + l2.homeGoals! === t.awayGoals, `cup ${round.key}: legs don't add up`)
      check(l1.seed === t.legSeeds?.[0] && l2.seed === t.legSeeds?.[1], `cup ${round.key}: a leg's seed changed`)
      check(req.legs?.length === 2, `cup ${round.key}: a two-legged tie lost a leg`)
    } else {
      check(ms.length === 1 && ms[0].homeGoals === t.homeGoals && ms[0].awayGoals === t.awayGoals && ms[0].seed === t.seed, `cup ${round.key}: the match changed`)
    }
    const winner = t.winner === 'home' ? t.home : t.away
    check(ms.every(m => m.tieWinnerClubId === winner.clubId), `cup ${round.key}: who went through changed`)
    check((t.homePens == null) === !ms[ms.length - 1].pensNote, `cup ${round.key}: the shootout went missing`)
    check(!!req.contextMatches?.length, `cup ${round.key}: opened with no bracket of its own`)
  }
}
console.log(`Domestic cups: ${cupTies} ties, ${cupLegs} two-legged`)
check(cupLegs > 0, 'no two-legged cup tie came up: the leg checks never ran')

// ── 4b · Qualifying ties: stored home-first, read from A's side ─────────────
// The old row builder wrote a qualifying tie's second leg home-first while
// every other tie wrote it from A's side; the model turns it round.
for (let i = 0; i < 2000; i++) {
  const l1 = { homeGoals: int(4), awayGoals: int(4) }, l2 = { homeGoals: int(4), awayGoals: int(4) }
  const level = l1.homeGoals + l2.awayGoals === l1.awayGoals + l2.homeGoals
  const et = level && i % 2 ? { homeGoals: int(2), awayGoals: int(2) } : null
  const totalA = l1.homeGoals + l2.awayGoals + (et?.awayGoals ?? 0), totalB = l1.awayGoals + l2.homeGoals + (et?.homeGoals ?? 0)
  const pens = totalA === totalB
  const aWins = pens ? i % 3 === 0 : totalA > totalB
  const q = {
    round: 'q2', path: 'champions', teamA: { clubId: `qa${i}`, clubName: 'A', isPlayer: false }, teamB: { clubId: `qb${i}`, clubName: 'B', isPlayer: false },
    winnerId: aWins ? `qa${i}` : `qb${i}`,
    legs: { leg1: l1, leg2: l2, leg2ExtraTime: et, totalA, totalB, extraTime: !!et, homePens: pens ? (aWins ? 4 : 2) : null, awayPens: pens ? (aWins ? 2 : 4) : null, winner: aWins ? 'home' : 'away' },
  } as any
  const st = qualTie(q)
  check(st.legs![1].a === l2.awayGoals && st.legs![1].b === l2.homeGoals, `qualifying: leg 2 not read from A's side (${i})`)
  tieModelOk(st, `qualifying (${i})`, totalA, totalB, aWins, pens, et ? { a: et.awayGoals, b: et.homeGoals } : undefined)
}
check(qualTie({ round: 'q1', path: 'league', teamA: { clubId: 'x', clubName: 'X' }, teamB: null, winnerId: 'x', legs: null } as any).b === null, 'a bye lost its bye')

// ── 5 · A saved run's matches (the run hub) ─────────────────────────────────
for (let i = 0; i < 500; i++) {
  const x = {
    homeClubId: `h${i}`, awayClubId: `a${i}`, homeClubName: `H${i}`, awayClubName: `A${i}`,
    homeGoals: int(5), awayGoals: int(5), extraTime: i % 7 === 0, scorers: scorers(`r${i}`), seed: int(2 ** 31),
    label: `Semi-final · Leg ${1 + (i % 2)}`, pensNote: i % 9 === 0 ? 'Penalties 4–3 · H advance' : undefined,
    homeRotation: rng(), awayRotation: rng(), absent: [`x${i}`], standIns: [],
  }
  const req = matchRequest(runMatch(x), { ...ctx, linkPages: true })!
  const keys: (keyof typeof x & keyof MatchDetailRequest)[] = ['homeClubId', 'awayClubId', 'homeGoals', 'awayGoals', 'extraTime', 'seed', 'pensNote', 'homeRotation', 'awayRotation']
  check(keys.every(k => same(req[k], x[k])) && same(req.scorers, x.scorers) && req.competitionLabel === x.label && req.linkPages === true, `a run hub match changed on its way to the sheet (${i})`)
  const back = { ...x, homeClubId: x.awayClubId, awayClubId: x.homeClubId, homeClubName: x.awayClubName, awayClubName: x.homeClubName, homeGoals: int(5), awayGoals: int(5) }
  const pair = legsRequest([runMatch(x), runMatch(back)], 1, ctx)
  const rt = runTie([x, back], true)
  check(rt.aGoals === x.homeGoals + back.awayGoals && rt.legs![1].a === back.awayGoals, `a run hub tie's aggregate is off (${i})`)
  check(rt.shootout === (!!back.pensNote || rt.aGoals === rt.bGoals), `a run hub tie's shootout flag is off (${i})`)
  check(pair?.legs?.length === 2 && pair.homeClubId === x.awayClubId, `a run hub tie opened on the wrong leg (${i})`)
}

console.log(`${checks} checks`)
console.log(failures === 0 ? '✅ ALL CHECKS PASSED' : `❌ ${failures} CHECK(S) FAILED`)
process.exit(failures === 0 ? 0 : 1)
