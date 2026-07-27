// Verifies the "context at the moment of the match" layer (src/engine/match-context.ts)
// — the table as it stood, form going in, what each side played next, and the
// knockout bracket so far.
//
// Written after all four read wrong on the LIVE simulation screens: the timeline
// handed to the stats screen held only matches ALREADY PLAYED, so "next match"
// announced that every side's campaign had ended in the middle of the season,
// and the knockout half was missing entirely, so a cup tie showed a meaningless
// league table (in the World Cup, all twelve groups merged into one 48-nation
// "league phase") instead of a bracket.
//
// The invariants below are the ones that broke. Everything is generated from a
// seeded RNG so a failure is reproducible: same seed, same competition.
//
//   npx tsx scripts/verify-match-context.ts

import {
  standingsAsOf, formBefore, nextMatchFor, knockoutBracket, appendKnockoutRounds,
  koLegMatchday, type ContextMatch,
} from '../src/engine/match-context'
import type { CLKnockoutMatch } from '../src/engine/cl-sim'

let failures = 0
function check(cond: boolean, msg: string) {
  if (!cond) { failures++; console.log(`❌ ${msg}`) }
}

// mulberry32 — the same generator the deep-stats layer uses, so these runs are
// byte-identical across machines and diffable between edits.
function rng(seed: number) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6D2B79F5) >>> 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

type Club = { id: string; name: string }

/**
 * A league/group phase in the shape the screens hand over: EVERY fixture, with
 * only the played ones carrying goals. `playedUpTo = 0` is a season that hasn't
 * kicked off; `= rounds` is a finished one.
 */
function phaseFixtures(
  clubs: Club[], rounds: number, playedUpTo: number, rand: () => number,
  opts: { inTable?: boolean; label?: (md: number) => string } = {},
): ContextMatch[] {
  const label = opts.label ?? ((md: number) => `Matchday ${md}`)
  const out: ContextMatch[] = []
  // Circle method — a real round-robin, so EVERY club plays exactly once per
  // matchday. That matters here: "no next match" is the bug under test, and a
  // sloppy pairing that simply skips a club would report it as a false failure.
  const rot = clubs.slice(1)
  for (let md = 1; md <= rounds; md++) {
    const order = [clubs[0], ...rot.slice(md - 1), ...rot.slice(0, md - 1)]
    for (let i = 0; i < order.length / 2; i++) {
      // Alternate who's at home each round, as a real schedule does.
      const [home, away] = md % 2 === 0
        ? [order[order.length - 1 - i], order[i]]
        : [order[i], order[order.length - 1 - i]]
      const played = md <= playedUpTo
      out.push({
        matchday: md, label: label(md), inTable: opts.inTable,
        homeClubId: home.id, homeClubName: home.name,
        awayClubId: away.id, awayClubName: away.name,
        homeGoals: played ? Math.floor(rand() * 4) : undefined,
        awayGoals: played ? Math.floor(rand() * 4) : undefined,
      })
    }
  }
  return out
}

/** A knockout round of `n` ties, two-legged or single, with real winners. */
function koRound(clubs: Club[], n: number, twoLegged: boolean, rand: () => number): CLKnockoutMatch[] {
  const blank = { played: 0, won: 0, drawn: 0, lost: 0, goalsFor: 0, goalsAgainst: 0, points: 0 }
  const team = (c: Club) => ({ clubId: c.id, clubName: c.name, isPlayer: false, ovr: 80, form: 0, stats: blank, pot: 1 as const })
  const ties: CLKnockoutMatch[] = []
  for (let i = 0; i < n; i++) {
    const a = clubs[i * 2], b = clubs[i * 2 + 1]
    const leg1 = { aGoals: Math.floor(rand() * 3), bGoals: Math.floor(rand() * 3) }
    const leg2 = twoLegged ? { aGoals: Math.floor(rand() * 3), bGoals: Math.floor(rand() * 3) } : undefined
    const aAgg = leg1.aGoals + (leg2?.aGoals ?? 0)
    const bAgg = leg1.bGoals + (leg2?.bGoals ?? 0)
    // Level aggregates are settled on penalties — deliberately included, because
    // that's the case where the goals alone can't say who advanced.
    const winner = aAgg > bAgg ? a : bAgg > aAgg ? b : (rand() < 0.5 ? a : b)
    ties.push({
      round: 'r', teamA: team(a), teamB: team(b), winner: team(winner),
      aGoals: aAgg, bGoals: bAgg,
      leg1: twoLegged ? leg1 : undefined,
      leg2, extraTime: false,
    })
  }
  return ties
}

const CLUBS: Club[] = Array.from({ length: 16 }, (_, i) => ({ id: `c${i}`, name: `Club ${i}` }))

console.log('Verifying match context over 2,000 competitions…\n')

for (let iter = 0; iter < 2000; iter++) {
  const rand = rng(iter + 1)
  const rounds = 6 + Math.floor(rand() * 5)          // 6–10 matchdays
  const playedUpTo = Math.floor(rand() * (rounds + 1)) // anywhere from not-started to finished
  const phase = phaseFixtures(CLUBS, rounds, playedUpTo, rand)

  // Knockout rounds are only appended once they've been REVEALED, which is what
  // the live screens do — an unrevealed round must never reach the timeline.
  const koRevealed = playedUpTo === rounds ? 1 + Math.floor(rand() * 2) : 0
  const timeline = appendKnockoutRounds(phase, [
    { label: 'Quarter-Finals', ties: koRound(CLUBS, 4, true, rand) },
    { label: 'Semi-Finals', ties: koRound(CLUBS, 2, true, rand) },
  ].slice(0, koRevealed))

  // ── The table as it stood ────────────────────────────────────────────────
  for (const asOf of [1, Math.ceil(rounds / 2), rounds]) {
    const table = standingsAsOf(timeline, asOf)
    for (const row of table) {
      check(row.played <= asOf, `iter ${iter}: ${row.clubName} has ${row.played} games after MD${asOf}`)
      check(row.played === row.won + row.drawn + row.lost, `iter ${iter}: ${row.clubName} W/D/L doesn't sum to played`)
      check(row.points === row.won * 3 + row.drawn, `iter ${iter}: ${row.clubName} points don't match W/D`)
      check(row.goalDiff === row.goalsFor - row.goalsAgainst, `iter ${iter}: ${row.clubName} GD is wrong`)
    }
    for (let i = 1; i < table.length; i++) {
      const a = table[i - 1], b = table[i]
      const ordered = a.points > b.points
        || (a.points === b.points && a.goalDiff > b.goalDiff)
        || (a.points === b.points && a.goalDiff === b.goalDiff && a.goalsFor >= b.goalsFor)
      check(ordered, `iter ${iter}: table out of order at ${i} (${a.clubName} above ${b.clubName})`)
    }
    // Unplayed fixtures are in the timeline now — they must not reach the table.
    const totalPlayed = table.reduce((n, r) => n + r.played, 0)
    const expected = timeline.filter(m => m.matchday <= asOf && m.inTable !== false && m.homeGoals !== undefined).length * 2
    check(totalPlayed === expected, `iter ${iter}: table counted ${totalPlayed} appearances, expected ${expected}`)
  }

  // ── Form going in ────────────────────────────────────────────────────────
  for (const club of CLUBS) {
    const at = 1 + Math.floor(rand() * rounds)
    const form = formBefore(timeline, club.id, at)
    check(form.length <= 5, `iter ${iter}: ${club.name} form returned ${form.length} results`)
    for (let i = 0; i < form.length; i++) {
      const f = form[i]
      check(f.matchday < at, `iter ${iter}: ${club.name} form includes MD${f.matchday} at MD${at}`)
      check(i === 0 || form[i - 1].matchday >= f.matchday, `iter ${iter}: ${club.name} form isn't most-recent-first`)
      const expected = f.goalsFor > f.goalsAgainst ? 'W' : f.goalsFor < f.goalsAgainst ? 'L' : 'D'
      check(f.outcome === expected, `iter ${iter}: ${club.name} form outcome ${f.outcome} for ${f.goalsFor}-${f.goalsAgainst}`)
      check(f.match.homeGoals !== undefined, `iter ${iter}: ${club.name} form includes an unplayed fixture`)
    }
  }

  // ── Next match — the regression this file exists for ─────────────────────
  for (const club of CLUBS) {
    const at = 1 + Math.floor(rand() * rounds)
    const next = nextMatchFor(timeline, club.id, at)
    const later = timeline
      .filter(m => m.matchday > at && (m.homeClubId === club.id || m.awayClubId === club.id))
      .sort((a, b) => a.matchday - b.matchday)
    if (later.length === 0) {
      check(next === null, `iter ${iter}: ${club.name} got a next match with nothing left`)
    } else {
      check(next !== null, `iter ${iter}: ${club.name} reads as eliminated at MD${at} with ${later.length} fixtures left`)
      check(next?.matchday === later[0].matchday, `iter ${iter}: ${club.name} next match skipped ahead`)
    }
    // The whole point of carrying unplayed fixtures: mid-season, every club has
    // one, played or not.
    if (at < rounds) check(next !== null, `iter ${iter}: ${club.name} has no next match at MD${at} of ${rounds}`)
  }

  // ── The bracket so far ───────────────────────────────────────────────────
  const koRows = timeline.filter(m => m.inTable === false)
  const lastMd = timeline.reduce((mx, m) => Math.max(mx, m.matchday), 0)
  const bracket = knockoutBracket(timeline, lastMd)
  check(bracket.length === koRevealed, `iter ${iter}: bracket has ${bracket.length} rounds, ${koRevealed} were revealed`)

  const seen = new Set<string>()
  let legCount = 0
  for (let i = 0; i < bracket.length; i++) {
    const round = bracket[i]
    check(i === 0 || bracket[i - 1].matchday < round.matchday, `iter ${iter}: bracket rounds out of order`)
    for (const tie of round.ties) {
      check(!seen.has(`${round.label}|${tie.key}`), `iter ${iter}: tie ${tie.key} listed twice in ${round.label}`)
      seen.add(`${round.label}|${tie.key}`)
      check(tie.legs.length >= 1 && tie.legs.length <= 2, `iter ${iter}: tie ${tie.key} has ${tie.legs.length} legs`)
      check(tie.winnerId === tie.teamAId || tie.winnerId === tie.teamBId,
        `iter ${iter}: tie ${tie.key} winner isn't one of its two sides`)
      // The aggregate must be the legs added up in the TIE's orientation —
      // leg 2 swaps home and away, and getting that wrong is invisible until a
      // scoreline stops matching the aggregate printed above it.
      let a = 0, b = 0
      for (const leg of tie.legs) {
        const aIsHome = leg.homeClubId === tie.teamAId
        a += (aIsHome ? leg.homeGoals : leg.awayGoals) ?? 0
        b += (aIsHome ? leg.awayGoals : leg.homeGoals) ?? 0
      }
      check(tie.aGoals === a && tie.bGoals === b, `iter ${iter}: tie ${tie.key} aggregate ${tie.aGoals}-${tie.bGoals} ≠ legs ${a}-${b}`)
      check(tie.legs.every(l => l.matchday >= tie.matchday), `iter ${iter}: tie ${tie.key} matchday isn't its first leg`)
      legCount += tie.legs.length
    }
  }
  check(legCount === koRows.length, `iter ${iter}: bracket holds ${legCount} legs, timeline has ${koRows.length}`)

  // A vantage point BEFORE the knockouts must show no bracket at all — that's
  // what keeps a league-phase match on a table rather than a half-built tree.
  check(knockoutBracket(timeline, rounds).length === 0, `iter ${iter}: bracket leaked into the league phase`)

  // And every revealed tie has to be findable by its slot, or a live tie opens
  // with no vantage point at all (this used to be a hard-coded sentinel).
  // Scoped to the round on purpose: these synthetic brackets deliberately reuse
  // clubs across rounds, which is exactly the case an unscoped search resolves
  // to the wrong (earlier) round.
  for (const tie of bracket.flatMap(r => r.ties)) {
    const md = koLegMatchday(timeline, tie.teamAId, tie.teamBId, tie.round)
    check(md === tie.matchday, `iter ${iter}: koLegMatchday gave ${md} for a ${tie.round} tie starting at ${tie.matchday}`)
  }
}

// ── World Cup shape: many groups, only ONE of them feeds the table ──────────
{
  const rand = rng(99)
  const groups = ['A', 'B', 'C']
  const phase = groups.flatMap(g => phaseFixtures(
    CLUBS.slice(0, 4).map(c => ({ id: `${g}-${c.id}`, name: `${g} ${c.name}` })), 3, 3, rand,
    { inTable: g === 'A', label: md => `Group ${g} · Matchday ${md}` },
  ))
  const table = standingsAsOf(phase, 3)
  check(table.length === 4, `WC: table has ${table.length} rows, expected just group A's 4`)
  check(table.every(r => r.clubId.startsWith('A-')), 'WC: a foreign group leaked into the table')

  // From a knockout's vantage point nobody's group feeds a table, so the screen
  // has to fall back to the bracket — a merged 12-group standing is the exact
  // bug that made "at the time of this match" nonsense in the World Cup.
  const noTable = phase.map(m => ({ ...m, inTable: false }))
  check(standingsAsOf(noTable, 3).length === 0, 'WC: knockout vantage point still produced a table')
  // Form still has to reach across the groups, though.
  const someClub = phase[0].homeClubId
  check(formBefore(noTable, someClub, 4).length > 0, 'WC: form went empty when the table did')
}

console.log(`\n${failures === 0 ? '✅ ALL CHECKS PASSED' : `❌ ${failures} CHECK(S) FAILED`}`)
process.exit(failures === 0 ? 0 : 1)
