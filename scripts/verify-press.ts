// Verifies the run's press (src/engine/press.ts) over simulated seasons:
//  - determinism: the same history writes byte-identical stories
//  - nothing before a quarter of the season except the final day
//  - at most two stories a matchday; the final day always crowns a champion
//  - cooldowns respected per kind and subject
//  - frozen rows match the table as it stood that matchday, and stay frozen
//  - every story renders words: no "undefined", no NaN, no exclamation marks
//  - a realistic amount per season: never silent, never a wall
//  - P8-18: a thrashing is a win by four or more that really happened that
//    round; a giant-killing is a bottom-third side beating a top-three side on
//    the table as it stood BEFORE the round; the European race is around the
//    last European place
//  - P8-25: your players' injuries and bans make the press the round they
//    happen (even before a quarter of the season), and nobody else's do
// Run: npx tsx scripts/verify-press.ts

import { writePress, storyText, storyBody, type Story, type PressSnapshot } from '../src/engine/press'
import { zonesFor } from '../src/data/qualification-bands'
import { simulateMatch, setMatchTilt } from '../src/engine/match'
import { generateFixtures } from '../src/engine/fixtures'
import type { SimTeam } from '../src/types/simulation'
import { cupPress, clPressStages, wcPressStages, type CupStage } from '../src/engine/cup-press'
import { buildCLTeams, drawCLLeaguePhase, simulateCLKnockoutsOnly, type CLLeagueMatch, type CLSeasonResult } from '../src/engine/cl-sim'
import { buildWCTeams, assignGroups, generateWCGroupFixtures, simulateWCKnockoutsOnly, type WCGroupMatch } from '../src/engine/world-cup-sim'
import { recordResult, sortStandings } from '../src/engine/standings'
import { mulberry32 } from '../src/lib/rng'
import type { Absence } from '../src/engine/availability'

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
    // P8-138: players and ratings. Club 0's star plays well every week; a
    // near-perfect 9.9 comes along every seventh round, for someone else.
    const players = round.flatMap(f => [f.home, f.away]).map(t => ({
      playerId: `${t.clubId}-star`, name: `${t.clubName} Star`, clubId: t.clubId,
      rating: t.clubId === 'c00' ? 8.6 : md % 7 === 0 && t.clubId === 'c05' ? 9.9 : 6.8,
    }))
    history.push({ matchday: md, standings, fixtures: round.map(f => ({ home: f.home, away: f.away, result: f.result })), players })
    // Absences the ledger would hold: one of yours early (before the quarter
    // gate), one of yours mid-season, and one of another club's every round.
    const you = sims.find(t => t.isPlayer)!, other = sims.find(t => !t.isPlayer)!
    const absence = (club: SimTeam, reason: 'injury' | 'suspension', on: number, tag: string) => ({
      playerId: `${club.clubId}-${tag}`, playerName: `Player ${tag}`, clubId: club.clubId, clubName: club.clubName,
      position: 'CM', reason, fromMatchday: on + 1, toMatchday: on + 2, incurredOn: on, minute: reason === 'injury' ? 30 : undefined,
      isPlayerClub: club.isPlayer,
    })
    const absences = [absence(you, 'injury', 2, 'early'), absence(you, 'suspension', Math.ceil(total / 2), 'mid'), absence(other, 'injury', md, `o${md}`)]
    const ctx = {
      totalMatchdays: total, zones,
      next: fx.filter(f => f.matchday === md + 1).map(f => ({ homeId: f.home.clubId, awayId: f.away.clubId })),
      absences: absences as never,
    }
    const fresh = writePress(history, stories, ctx)
    const again = writePress(history, stories, ctx)
    check(JSON.stringify(fresh) === JSON.stringify(again), `season ${s} md ${md}: not deterministic`)

    const table = fresh.filter(x => x.kind !== 'injury' && x.kind !== 'suspension' && x.kind !== 'masterclass')
    const personal = fresh.filter(x => x.kind === 'injury' || x.kind === 'suspension')
    // P8-138: a 9.9 is always a story, whenever it happens, and only then.
    const masterclass = fresh.filter(x => x.kind === 'masterclass')
    check(masterclass.every(x => !!x.match && round.some(f => f.home.clubId === x.match!.homeId && f.away.clubId === x.match!.awayId)), `season ${s} md ${md}: a masterclass without its match`)
    check(masterclass.length === (md % 7 === 0 && round.some(f => f.home.clubId === 'c05' || f.away.clubId === 'c05') ? 1 : 0), `season ${s} md ${md}: ${masterclass.length} masterclass stories`)
    if (md < Math.ceil(total / 4) && md !== total) check(table.length === 0, `season ${s} md ${md}: a table story before a quarter of the season`)
    if (md !== total) check(table.length <= 2, `season ${s} md ${md}: ${table.length} table stories`)
    // P8-25: exactly your absences that happened this round, never another club's.
    const expected = absences.filter(a => a.isPlayerClub && a.incurredOn === md).map(a => a.playerId).sort()
    check(JSON.stringify(personal.map(x => x.subject).sort()) === JSON.stringify(expected),
      `season ${s} md ${md}: absence stories ${personal.map(x => x.subject)} vs ${expected}`)
    check(personal.every(x => x.involvesPlayer && x.rows[0]?.isPlayer), `season ${s} md ${md}: an absence story that isn't about you`)

    // P8-18: the new table stories say what really happened.
    for (const st of table) {
      if (st.kind === 'thrashing') {
        check(st.n.for - st.n.against >= 4, `${st.id}: a thrashing by ${st.n.for - st.n.against}`)
        check(round.some(f => {
          const hg = f.result!.homeGoals, ag = f.result!.awayGoals
          const win = hg > ag ? f.home.clubId : f.away.clubId
          return win === st.rows[0].clubId && Math.max(hg, ag) === st.n.for && Math.min(hg, ag) === st.n.against
        }), `${st.id}: no such result this round`)
      }
      // P8-138: the new kinds say what really happened.
      const marks = (clubId: string) => history.flatMap(h => h.fixtures.filter(f => f.result && (f.home.clubId === clubId || f.away.clubId === clubId)).map(f => {
        const home = f.home.clubId === clubId, gf = home ? f.result!.homeGoals : f.result!.awayGoals, ga = home ? f.result!.awayGoals : f.result!.homeGoals
        return gf > ga ? 'W' : gf === ga ? 'D' : 'L'
      }))
      if (st.kind === 'runEnds') {
        const m = marks(st.rows[0].clubId), last = m[m.length - 1], before = m.slice(0, -1)
        const run = (test: (x: string) => boolean) => { let k = 0; for (let i = before.length - 1; i >= 0 && test(before[i]); i--) k++; return k }
        check(st.n.unbeaten ? last === 'L' && run(x => x !== 'L') === st.n.run && st.n.run >= 10 : last !== 'W' && run(x => x === 'W') === st.n.run && st.n.run >= 6,
          `${st.id}: no such run ended (${m.slice(-12).join('')})`)
      }
      if (st.kind === 'zigZag') {
        const six = marks(st.rows[0].clubId).slice(-6)
        check(six.length === 6 && six.every((x, i) => x !== 'D' && (i === 0 || x !== six[i - 1])), `${st.id}: ${six.join('')} isn't a zig-zag`)
      }
      if (st.kind === 'hotStreak') check(st.n.run >= 5, `${st.id}: a streak of ${st.n.run}`)
      if (st.form) {
        const m = marks(st.rows[0].clubId)
        check(st.form.length === Math.min(5, m.length) && st.form.map(f => f.mark).join('') === m.slice(-5).join(''), `${st.id}: its form isn't the club's last five`)
      }
      // A story about one match carries that match, as it was this round.
      if (['thrashing', 'giantKilling', 'runEnds'].includes(st.kind)) {
        const m = st.match
        check(!!m && round.some(f => f.home.clubId === m.homeId && f.away.clubId === m.awayId && f.result!.homeGoals === m.homeGoals && f.result!.awayGoals === m.awayGoals), `${st.id}: its match isn't this round's result`)
      }
      if (st.kind === 'playerForm') check(st.subject === 'c00-star', `${st.id}: ${st.subject} isn't the player in form`)
      if (st.kind === 'giantKilling') {
        const prev = history[history.length - 2]
        const pos = (id: string) => prev.standings.findIndex(t => t.clubId === id) + 1
        check(pos(st.rows[1].clubId) <= 3 && pos(st.rows[0].clubId) > Math.floor(size * 2 / 3),
          `${st.id}: ${pos(st.rows[0].clubId)} beating ${pos(st.rows[1].clubId)} isn't a giant-killing`)
      }
    }
    if (md === total) check(fresh.some(x => x.kind === 'champions' && x.names[0] === standings[0].clubName), `season ${s}: no champions story on the final day`)

    for (const st of fresh) {
      check(!stories.some(o => o.id === st.id), `season ${s}: duplicate id ${st.id}`)
      // P8-42: a story about N clubs shows N rows.
      if (st.n.clubs != null) check(st.rows.length === st.n.clubs, `${st.id}: about ${st.n.clubs} clubs, shows ${st.rows.length}`)
      for (const row of st.rows) {
        const live = standings[row.pos - 1]
        check(live.clubId === row.clubId && live.stats.points === row.points && live.stats.played === row.played,
          `season ${s} ${st.id}: frozen row ${row.clubName} doesn't match the table`)
      }
      const words = storyText(st)
      // SAMPLE=1 prints the first story of each kind (with POM_LANGUAGE=sk, in Slovak).
      if (process.env.SAMPLE && !kinds.has(st.kind)) console.log(`[${st.kind}] ${words.headline} — ${words.standfirst}
     ${storyBody(st).join(' ')}`)
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
check(kinds.size >= 12, `only ${kinds.size} story kinds ever fired`)
for (const k of ['thrashing', 'giantKilling', 'europeRace', 'injury', 'suspension', 'runEnds', 'unbeatenRun', 'yoyo', 'playerForm', 'masterclass']) check((kinds.get(k) ?? 0) > 0, `the ${k} story never fired`)

console.log(`${SEASONS} seasons · stories per season mean ${mean.toFixed(1)} (min ${min}, max ${max})`)
console.log([...kinds.entries()].sort((a, b) => b[1] - a[1]).map(([k, n]) => `${k} ${n}`).join(' · '))
// ── Phase two step 7 (F-01, F-02): the cups' press ───────────────────────────
// Seeded classic Champions League, World Cup and full path runs, played the way
// the screens play them. Done-when (12-PHASE-TWO-FINAL §1, 07 step 7): every
// round writes at least one story, no story names a club that isn't in its
// stage, and stories are written once. Plus: the live press (any prefix of the
// rounds) is exactly the start of the finished one, what a story says is what
// happened, your injuries land in the round they happened, and it reads.
const cupKinds = new Map<string, number>()
let cupRuns = 0, cupStories = 0
const absenceAt = (day: number, id: string, reason: 'injury' | 'suspension', you = true): Absence => ({
  playerId: id, playerName: `Player ${id}`, clubId: you ? 'c0' : 'c1', clubName: 'X', position: 'ST', reason,
  fromMatchday: day + 1, toMatchday: day + 2, incurredOn: day, minute: 30, isPlayerClub: you,
})

function checkCup(name: string, stages: CupStage[], absences: Absence[], expect: { yourClubId: string; injuryIn: string[] }) {
  cupRuns++
  const all = cupPress(stages, absences)
  cupStories += all.length
  check(JSON.stringify(all) === JSON.stringify(cupPress(stages, absences)), `${name}: not deterministic`)
  // Written once.
  { const seen = new Set<string>(); const dup = all.find(x => seen.has(x.id) || !seen.add(x.id)); check(!dup, `${name}: story id ${dup?.id} repeats`) }
  // Every round at least one story; nobody outside the stage.
  for (const st of stages) {
    const mine = all.filter(x => x.id.startsWith(`${st.key}~`))
    const clubs = new Set(st.kind === 'knockout' ? st.ties.flatMap(t => [t.teamA.clubId, t.teamB.clubId]) : st.kind === 'groups' ? st.groups.flatMap(g => g.clubs.map(c => c.clubId)) : st.clubs.map(c => c.clubId))
    if (st.kind === 'knockout') check(mine.length > 0, `${name}: ${st.stage} wrote nothing`)
    else for (const md of new Set(st.matches.map(m => m.matchday))) check(mine.some(x => x.matchday === md), `${name}: ${st.stage} matchday ${md} wrote nothing`)
    for (const x of mine) {
      for (const r of x.rows) check(clubs.has(r.clubId), `${name}: ${x.id} names ${r.clubId}, not in ${st.stage}`)
      if (x.match) check(clubs.has(x.match.homeId) && clubs.has(x.match.awayId), `${name}: the match in ${x.id} isn't in ${st.stage}`)
      check(x.stage === st.stage, `${name}: ${x.id} carries the wrong stage`)
    }
    // What a story says is what happened.
    if (st.kind === 'knockout') {
      for (const x of mine) {
        if (x.kind === 'yourTie') {
          const tie = st.ties.find(t => t.teamA.clubId === expect.yourClubId || t.teamB.clubId === expect.yourClubId)!
          check(!!x.n.won === (tie.winner.clubId === expect.yourClubId), `${name}: ${x.id} gets your tie's result wrong`)
        }
        if (x.kind === 'cupWinners') check(x.rows[0].clubId === st.ties[st.ties.length - 1].winner.clubId, `${name}: the winners story crowns the wrong side`)
        if (x.kind === 'koUpset') check(x.n.gap >= 4, `${name}: ${x.id} isn't an upset (gap ${x.n.gap})`)
        if (x.kind === 'shootout') check(!!x.n.pens, `${name}: ${x.id} has no shootout`)
      }
      if (st.final) check(mine.some(x => x.kind === 'cupWinners'), `${name}: the final crowned nobody`)
    }
    if (st.kind === 'groups') {
      const gd = mine.find(x => x.kind === 'groupDecided')
      const r32 = stages.find(z => z.kind === 'knockout' && z.key === 'r32')
      if (gd && r32 && r32.kind === 'knockout') {
        const through = r32.ties.some(t => t.teamA.clubId === expect.yourClubId || t.teamB.clubId === expect.yourClubId)
        if (gd.n.fate <= 1) check(through, `${name}: through in the top two but not in the round of 32`)
        if (gd.n.fate === 3) check(!through, `${name}: out in fourth but in the round of 32`)
        const bt = mine.find(x => x.kind === 'bestThird')
        if (gd.n.fate === 2) check(!!bt && !!bt.n.through === through, `${name}: the best-thirds story disagrees with the draw`)
      }
    }
  }
  for (const key of expect.injuryIn) check(all.some(x => x.kind === 'injury' && x.id.startsWith(`${key}~`)), `${name}: your injury in ${key} never made the press`)
  check(!all.some(x => x.names[0] === 'Player other'), `${name}: another club's injury made your press`)
  // The live press: any prefix of the rounds is exactly the start of the finished press.
  const cut = (k: number): CupStage[] => {
    const out: CupStage[] = []
    let left = k
    for (const st of stages) {
      if (left <= 0) break
      if (st.kind === 'knockout') { out.push(st); left--; continue }
      const mds = [...new Set(st.matches.map(m => m.matchday))].sort((a, b) => a - b)
      const take = Math.min(left, mds.length)
      out.push({ ...st, matches: st.matches.filter(m => m.matchday <= mds[take - 1]) } as CupStage)
      left -= take
    }
    return out
  }
  const totalRounds = stages.reduce((n, st) => n + (st.kind === 'knockout' ? 1 : new Set(st.matches.map(m => m.matchday)).size), 0)
  for (const k of [1, 3, Math.floor(totalRounds / 2), totalRounds - 1]) {
    if (k < 1) continue
    const prefix = cupPress(cut(k), absences)
    check(JSON.stringify(prefix) === JSON.stringify(all.slice(0, prefix.length)), `${name}: the live press after ${k} rounds isn't the start of the finished one`)
  }
  for (const x of all) {
    const words = storyText(x), body = storyBody(x).join(' ')
    const text = `${words.headline} ${words.standfirst} ${body}`
    check(words.headline.length > 0 && words.standfirst.length > 0, `${name}: ${x.id} has empty words`)
    check(!/undefined|NaN|\{\{|!/.test(text), `${name}: ${x.id} reads "${text}"`)
    if (process.env.SAMPLE && !cupKinds.has(x.kind)) console.log(`[${x.kind}] ${words.headline} — ${words.standfirst}\n     ${body}`)
    cupKinds.set(x.kind, (cupKinds.get(x.kind) ?? 0) + 1)
  }
}

const realRandom = Math.random
const side = (t: { clubId: string; clubName: string; isPlayer: boolean }) => ({ clubId: t.clubId, clubName: t.clubName, isPlayer: t.isPlayer })
for (let run = 0; run < 300; run++) {
  Math.random = mulberry32(7000 + run)
  // Classic: a 36-club league phase drawn and played, then the knockouts.
  const field = Array.from({ length: 36 }, (_, i) => ({ clubId: `c${i}`, clubName: `Club ${i}`, ovr: 72 + ((i * 7 + run) % 17), isPlayer: i === 0 }))
  const teams = buildCLTeams(field)
  const lp = drawCLLeaguePhase(teams)
  const leagueMatchdays: CLLeagueMatch[] = []
  for (let md = 1; md <= 8; md++) for (const f of lp.fixtures.filter(x => x.matchday === md)) {
    const r = simulateMatch(f.home, f.away)
    recordResult(f.home, f.away, r)
    leagueMatchdays.push({ matchday: md, home: side(f.home), away: side(f.away), homeGoals: r.homeGoals, awayGoals: r.awayGoals })
  }
  const sorted = sortStandings(teams)
  const ko = simulateCLKnockoutsOnly(sorted)
  const cl = { ...ko, leaguePhaseStandings: sorted, leagueMatchdays } as CLSeasonResult
  const injuries = [absenceAt(3, 'a', 'injury'), absenceAt(9, 'b', 'injury'), absenceAt(5, 'other', 'injury', false)]
  const inPlayoff = ko.playoffRound.some(t => t.teamA.isPlayer || t.teamB.isPlayer)
  checkCup(`CL run ${run}`, clPressStages(cl), injuries, { yourClubId: 'c0', injuryIn: inPlayoff ? ['lp', 'playoff'] : ['lp'] })

  // The full path: the same, after a domestic season of its own.
  const league: SimTeam[] = Array.from({ length: 18 }, (_, i) => ({ clubId: i === 0 ? 'c0' : `d${i}`, clubName: i === 0 ? 'Club 0' : `Dom ${i}`, ovr: 70 + ((i * 5 + run) % 15), isPlayer: i === 0, form: 0, stats: { played: 0, won: 0, drawn: 0, lost: 0, goalsFor: 0, goalsAgainst: 0, points: 0 } }))
  const domesticMatchdays: CLLeagueMatch[] = generateFixtures(league).map(f => {
    const r = simulateMatch(f.home, f.away)
    return { matchday: f.matchday, home: side(f.home), away: side(f.away), homeGoals: r.homeGoals, awayGoals: r.awayGoals }
  })
  checkCup(`full path ${run}`, clPressStages({ ...cl, domesticMatchdays }), injuries, { yourClubId: 'c0', injuryIn: inPlayoff ? ['lp', 'playoff'] : ['lp'] })
  // A split league: the press stops at the regular season (its points are
  // halved at the split) and its last regular matchday crowns nobody.
  const splitStages = clPressStages({ ...cl, domesticMatchdays, domesticRegular: 20 })
  checkCup(`full path, split ${run}`, splitStages, injuries, { yourClubId: 'c0', injuryIn: inPlayoff ? ['lp', 'playoff'] : ['lp'] })
  const splitPress = cupPress(splitStages, injuries).filter(x => x.id.startsWith('dom~'))
  check(splitPress.every(x => x.matchday <= 20), `full path, split ${run}: a domestic story after the split`)
  check(!splitPress.some(x => x.kind === 'champions' || x.kind === 'survived'), `full path, split ${run}: the regular season crowned a champion`)
  check(cupPress(clPressStages({ ...cl, domesticMatchdays }), injuries).some(x => x.id.startsWith('dom~') && x.kind === 'champions'), `full path ${run}: an unsplit season crowned nobody`)

  // The World Cup: twelve groups of four played, then the knockouts.
  const nations = buildWCTeams(Array.from({ length: 48 }, (_, i) => ({ clubId: i === 0 ? 'c0' : `n${i}`, clubName: `Nation ${i}`, ovr: 70 + ((i * 11 + run) % 19), isPlayer: i === 0 })))
  const groups = assignGroups(nations)
  const groupMatchdays: WCGroupMatch[] = []
  for (const f of generateWCGroupFixtures(groups)) {
    const r = simulateMatch(f.home, f.away)
    recordResult(f.home, f.away, r)
    groupMatchdays.push({ groupId: f.home.groupId, matchday: f.matchday, home: side(f.home), away: side(f.away), homeGoals: r.homeGoals, awayGoals: r.awayGoals })
  }
  const groupsCopy = groups.map(g => ({ ...g, teams: [...g.teams] }))
  const wko = simulateWCKnockoutsOnly(groups, nations)
  const wcInj = [absenceAt(2, 'w', 'suspension'), absenceAt(1, 'v', 'injury')]
  checkCup(`WC run ${run}`, wcPressStages({ groups: groupsCopy, groupMatchdays, knockoutRounds: wko.knockoutRounds }), wcInj, { yourClubId: 'c0', injuryIn: ['grp'] })
}
Math.random = realRandom
for (const k of ['yourMatch', 'phaseDecided', 'groupDecided', 'bestThird', 'yourTie', 'koUpset', 'shootout', 'koRound', 'cupWinners', 'injury', 'suspension', 'thrashing']) check((cupKinds.get(k) ?? 0) > 0, `the cups' ${k} story never fired`)
console.log(`${cupRuns} cup runs · ${(cupStories / cupRuns).toFixed(1)} stories a run`)
console.log([...cupKinds.entries()].sort((a, b) => b[1] - a[1]).map(([k, n]) => `${k} ${n}`).join(' · '))
if (failures === 0) console.log('✅ ALL CHECKS PASSED')
else console.log(`${failures} failure(s)`)
process.exit(failures === 0 ? 0 : 1)
