/**
 * The cups' press (centralisation phase two, step 7: F-01, F-02).
 *
 * Only the league season wrote a press, so a cup run had no stories at all,
 * not even your injuries and bans (P8-25), and the story page and its share
 * card had nothing to show. This writes one for every stage a cup has: a
 * league phase (or the full path's domestic season) through the league's own
 * `writePress`, the World Cup's groups, qualifying and the knockouts.
 *
 * Pure, like writePress: the stages played so far in, every story out. A
 * round's stories depend only on the rounds up to it (no look at fixtures still
 * to come, which is why there are no six-pointers here), so the live screens,
 * the run hub and a saved run all read the same press from the same results.
 * Every round writes at least one story: when nothing else is news, your match
 * is (a knockout round you're out of gets its headline tie).
 */
import { writePress, absenceStoriesOf, type PressSnapshot, type Story, type StoryKind, type StoryRow, type StoryMatch } from './press'
import { sortStandings } from './standings'
import type { Absence } from './availability'
import type { CLSeasonResult } from './cl-sim'
import type { WCSeasonResult } from './world-cup-sim'
import type { QualifyingResult } from './cl-qualifying'
import { runQualTies } from './europe-path'
import { QUAL_ROUND_LABEL } from '@/data/cl-qual-labels'

export type PressSide = { clubId: string; clubName: string; isPlayer?: boolean; ovr?: number }
export type PressMatch = { matchday: number; home: PressSide; away: PressSide; homeGoals: number; awayGoals: number; groupId?: string }
/** A knockout tie, A's side first: the CL and WC result ties and the live KnockoutTie all fit. */
export type PressTie = {
  teamA: PressSide; teamB: PressSide; winner: { clubId: string }
  aGoals: number; bGoals: number; aPens?: number | null; bPens?: number | null
  /** Two legs: the round takes two days on the injury clock. */
  leg1?: unknown
}

export type CupStage =
  /** A table stage: a league phase (`direct`, `playoffTo`: where the routes
   *  end) or the full path's domestic league (`league`: a real season's press). */
  | { kind: 'table'; key: string; stage: string; total: number; clubs: PressSide[]; matches: PressMatch[]; league?: boolean; direct?: number; playoffTo?: number; clock?: boolean }
  | { kind: 'groups'; key: string; stage: string; total: number; groups: { id: string; clubs: PressSide[] }[]; matches: PressMatch[]; thirdsThrough: number; clock?: boolean }
  /** `stage` is the round's English name ("Round of 16"); `final` writes the winners. */
  | { kind: 'knockout'; key: string; stage: string; ties: PressTie[]; final?: boolean; clock?: boolean }

// A knockout upset: the winner rated this far below the side it put out.
const UPSET_GAP = 4

const blank = () => ({ played: 0, won: 0, drawn: 0, lost: 0, goalsFor: 0, goalsAgainst: 0, points: 0 })

/** The table after each played matchday, in the app's one table order. */
function snapshotsOf(clubs: PressSide[], matches: PressMatch[]): PressSnapshot[] {
  const stats = new Map(clubs.map(c => [c.clubId, blank()]))
  const mds = [...new Set(matches.map(m => m.matchday))].sort((a, b) => a - b)
  return mds.map(md => {
    const round = matches.filter(m => m.matchday === md)
    for (const m of round) {
      const h = stats.get(m.home.clubId), a = stats.get(m.away.clubId)
      if (!h || !a) continue
      h.played++; a.played++
      h.goalsFor += m.homeGoals; h.goalsAgainst += m.awayGoals
      a.goalsFor += m.awayGoals; a.goalsAgainst += m.homeGoals
      if (m.homeGoals > m.awayGoals) { h.won++; a.lost++; h.points += 3 }
      else if (m.homeGoals < m.awayGoals) { a.won++; h.lost++; a.points += 3 }
      else { h.drawn++; a.drawn++; h.points++; a.points++ }
    }
    return {
      matchday: md,
      standings: sortStandings(clubs.map(c => ({ clubId: c.clubId, clubName: c.clubName, isPlayer: !!c.isPlayer, stats: { ...stats.get(c.clubId)! } }))),
      fixtures: round.map(m => ({ home: { clubId: m.home.clubId }, away: { clubId: m.away.clubId }, result: { homeGoals: m.homeGoals, awayGoals: m.awayGoals } })),
    }
  })
}

const rowsOfSnap = (s: PressSnapshot): StoryRow[] => s.standings.map((t, i) => ({
  pos: i + 1, clubId: t.clubId, clubName: t.clubName, isPlayer: t.isPlayer,
  played: t.stats.played, points: t.stats.points, gd: t.stats.goalsFor - t.stats.goalsAgainst,
}))
const sideRow = (x: PressSide): StoryRow => ({ pos: 0, clubId: x.clubId, clubName: x.clubName, isPlayer: !!x.isPlayer, played: 0, points: 0, gd: 0 })
const matchOf = (m: PressMatch): StoryMatch => ({ homeId: m.home.clubId, awayId: m.away.clubId, homeName: m.home.clubName, awayName: m.away.clubName, homeGoals: m.homeGoals, awayGoals: m.awayGoals })

/** Your absences, moved onto a stage's own matchday count (the ledger counts the whole competition). */
const onStage = (absences: Absence[], clock: number): Absence[] =>
  absences.map(a => ({ ...a, incurredOn: a.incurredOn - clock, fromMatchday: a.fromMatchday - clock, toMatchday: a.toMatchday - clock }))

/** Your match on a matchday, as a story: the fallback that keeps no round silent. */
function yourMatchStory(round: PressMatch[], rows: StoryRow[], md: number, total: number): Omit<Story, 'id' | 'stage'> | null {
  const m = round.find(x => x.home.isPlayer || x.away.isPlayer)
  if (!m) return null
  const home = !!m.home.isPlayer
  const you = home ? m.home : m.away, opp = home ? m.away : m.home
  const r = (id: string) => rows.find(x => x.clubId === id)
  return {
    kind: 'yourMatch', subject: you.clubId, matchday: md, totalMatchdays: total,
    rows: [r(you.clubId), r(opp.clubId)].filter((x): x is StoryRow => !!x).sort((a, b) => a.pos - b.pos),
    n: { for: home ? m.homeGoals : m.awayGoals, against: home ? m.awayGoals : m.homeGoals },
    names: [you.clubName, opp.clubName], involvesPlayer: true, match: matchOf(m),
  }
}

/** A tie as a story about `first`: its score from that side, the pens from both. */
function tieStory(kind: StoryKind, tie: PressTie, firstIsA: boolean, round: number, n: Record<string, number> = {}): Omit<Story, 'id' | 'stage'> {
  const a = firstIsA ? tie.teamA : tie.teamB, b = firstIsA ? tie.teamB : tie.teamA
  const pens = tie.aPens != null && tie.bPens != null
  return {
    kind, subject: kind === 'yourTie' || kind === 'cupWinners' ? a.clubId : `${a.clubId}+${b.clubId}`,
    matchday: round, totalMatchdays: 0,
    rows: [sideRow(a), sideRow(b)],
    n: {
      ...n,
      for: firstIsA ? tie.aGoals : tie.bGoals, against: firstIsA ? tie.bGoals : tie.aGoals,
      ...(pens ? { pens: 1, pf: firstIsA ? tie.aPens! : tie.bPens!, pa: firstIsA ? tie.bPens! : tie.aPens!, mpa: tie.aPens!, mpb: tie.bPens! } : {}),
    },
    names: [a.clubName, b.clubName], involvesPlayer: !!(a.isPlayer || b.isPlayer),
    match: { homeId: tie.teamA.clubId, awayId: tie.teamB.clubId, homeName: tie.teamA.clubName, awayName: tie.teamB.clubName, homeGoals: tie.aGoals, awayGoals: tie.bGoals },
  }
}

export function cupPress(stages: CupStage[], absences: Absence[] = []): Story[] {
  const out: Story[] = []
  let clock = 0      // the injury ledger's matchday count before this stage
  let koRound = 0    // knockout rounds so far (a knockout story's "matchday")
  const ovr = new Map<string, number>()
  for (const st of stages) {
    const sides = st.kind === 'groups' ? st.groups.flatMap(g => g.clubs) : st.kind === 'table' ? st.clubs : st.ties.flatMap(x => [x.teamA, x.teamB])
    for (const c of sides) if (c.ovr != null) ovr.set(c.clubId, c.ovr)
  }
  const push = (st: CupStage, s: Omit<Story, 'id' | 'stage'> & { id?: string }) =>
    out.push({ ...s, stage: st.stage, id: `${st.key}~${s.id ?? `${s.kind}:${s.subject}:${s.matchday}`}` })

  for (const st of stages) {
    const mine = st.clock ? onStage(absences, clock) : []

    if (st.kind === 'table') {
      const snaps = snapshotsOf(st.clubs, st.matches)
      const prior: Story[] = []
      snaps.forEach((snap, i) => {
        const md = snap.matchday
        const fresh = writePress(snaps.slice(0, i + 1), prior, { totalMatchdays: st.total, zones: [], absences: mine, phase: !st.league })
        prior.push(...fresh)
        const rows = rowsOfSnap(snap)
        const you = rows.find(r => r.isPlayer)
        const decided: Omit<Story, 'id' | 'stage'>[] = []
        // The league phase over: where you finished, and which road that is.
        if (!st.league && md === st.total && you && st.direct != null) {
          const fate = you.pos <= st.direct ? 0 : you.pos <= (st.playoffTo ?? st.direct) ? 1 : 2
          decided.push({
            kind: 'phaseDecided', subject: you.clubId, matchday: md, totalMatchdays: st.total,
            rows: rows.filter(r => Math.abs(r.pos - you.pos) <= 2), n: { pos: you.pos, fate, pts: you.points },
            names: [you.clubName], involvesPlayer: true,
          })
        }
        const report = fresh.length + decided.length === 0 ? yourMatchStory(st.matches.filter(m => m.matchday === md), rows, md, st.total) : null
        for (const s of [...fresh, ...decided, ...(report ? [report] : [])]) push(st, s)
      })
      if (st.clock) clock += st.total
      continue
    }

    if (st.kind === 'groups') {
      const mds = [...new Set(st.matches.map(m => m.matchday))].sort((a, b) => a - b)
      const yourGroup = st.groups.find(g => g.clubs.some(c => c.isPlayer))
      const snapsOf = new Map(st.groups.map(g => [g.id, snapshotsOf(g.clubs, st.matches.filter(m => m.groupId === g.id))]))
      for (const md of mds) {
        const round = st.matches.filter(m => m.matchday === md)
        const standingOf = (id: string) => { const s = snapsOf.get(id)!; return (s.filter(x => x.matchday <= md).pop() ?? s[0])?.standings ?? [] }
        const tableOf = (id: string) => rowsOfSnap({ matchday: md, standings: standingOf(id), fixtures: [] })
        const yourRows = yourGroup ? tableOf(yourGroup.id) : []
        const you = yourRows.find(r => r.isPlayer)
        const stories: Omit<Story, 'id' | 'stage'>[] = []
        if (you) stories.push(...absenceStoriesOf(mine, md, st.total, you))
        // The round's biggest win across every group, if it was a thrashing (P8-18's four goals).
        const big = round.map(m => ({ m, margin: Math.abs(m.homeGoals - m.awayGoals) })).sort((a, b) => b.margin - a.margin || a.m.home.clubId.localeCompare(b.m.home.clubId))[0]
        if (big && big.margin >= 4) {
          const homeWon = big.m.homeGoals > big.m.awayGoals
          const w = homeWon ? big.m.home : big.m.away, l = homeWon ? big.m.away : big.m.home
          const rows = tableOf(big.m.groupId ?? '')
          stories.push({
            kind: 'thrashing', subject: 'thrashing', matchday: md, totalMatchdays: st.total,
            rows: rows.filter(r => r.clubId === w.clubId || r.clubId === l.clubId),
            n: { for: Math.max(big.m.homeGoals, big.m.awayGoals), against: Math.min(big.m.homeGoals, big.m.awayGoals) },
            names: [w.clubName, l.clubName], involvesPlayer: !!(w.isPlayer || l.isPlayer), match: matchOf(big.m),
          })
        }
        if (md === st.total && yourGroup && you) {
          // Your group decided: winners, runners-up, third (and the wait), out.
          stories.push({
            kind: 'groupDecided', subject: yourGroup.id, matchday: md, totalMatchdays: st.total,
            rows: yourRows, n: { pos: you.pos, fate: Math.min(you.pos - 1, 3), pts: you.points },
            names: [you.clubName, yourGroup.id], involvesPlayer: true,
          })
          if (you.pos === 3) {
            // The race for the best thirds, settled once every group has played its last.
            // In the engine's own order (compareStandings), so the story can't
            // disagree with who the knockout draw actually took.
            const thirds = sortStandings(st.groups.map(g => standingOf(g.id)[2]).filter(Boolean))
              .map((x, i) => ({ ...rowsOfSnap({ matchday: md, standings: [x], fixtures: [] })[0], pos: i + 1 }))
            const rank = thirds.findIndex(r => r.isPlayer) + 1
            if (rank > 0) stories.push({
              kind: 'bestThird', subject: you.clubId, matchday: md, totalMatchdays: st.total,
              rows: thirds, n: { through: rank <= st.thirdsThrough ? 1 : 0, rank, of: st.thirdsThrough },
              names: [you.clubName], involvesPlayer: true,
            })
          }
        }
        if (!stories.some(s => s.kind !== 'injury' && s.kind !== 'suspension')) {
          const report = yourMatchStory(round, yourRows, md, st.total)
          if (report) stories.push(report)
        }
        for (const s of stories) push(st, s)
      }
      if (st.clock) clock += st.total
      continue
    }

    // ── a knockout round ──
    koRound++
    const ties = st.ties.filter(x => x.teamA && x.teamB)
    const days = ties.some(x => x.leg1) ? 2 : 1
    const stories: Omit<Story, 'id' | 'stage'>[] = []
    const told = new Set<PressTie>()
    const yours = ties.find(x => x.teamA.isPlayer || x.teamB.isPlayer)
    if (yours) {
      const youA = !!yours.teamA.isPlayer
      const you = youA ? yours.teamA : yours.teamB
      stories.push(tieStory('yourTie', yours, youA, koRound, { won: yours.winner.clubId === you.clubId ? 1 : 0 }))
      told.add(yours)
      // Your injuries and bans in this round (one or two days on the ledger's clock).
      for (let d = 1; d <= days; d++) stories.push(...absenceStoriesOf(st.clock ? onStage(absences, clock + d - 1) : [], 1, 0, sideRow(you))
        .map(s => ({ ...s, matchday: koRound, totalMatchdays: 0, id: undefined as never, subject: `${s.subject}@${d}` })))
    }
    if (st.final) {
      const f = ties[ties.length - 1]
      if (f) {
        const winA = f.winner.clubId === f.teamA.clubId
        stories.push(tieStory('cupWinners', f, winA, koRound))
      }
    } else {
      // The round's upset: the biggest rating gap the winner overcame.
      const upset = ties.filter(x => !told.has(x)).map(x => {
        const winA = x.winner.clubId === x.teamA.clubId
        const w = winA ? x.teamA : x.teamB, l = winA ? x.teamB : x.teamA
        return { x, winA, gap: (ovr.get(l.clubId) ?? 0) - (ovr.get(w.clubId) ?? 0) }
      }).filter(u => u.gap >= UPSET_GAP).sort((a, b) => b.gap - a.gap || a.x.teamA.clubId.localeCompare(b.x.teamA.clubId))[0]
      if (upset) { stories.push(tieStory('koUpset', upset.x, upset.winA, koRound, { gap: Math.round(upset.gap) })); told.add(upset.x) }
      const shoot = ties.find(x => !told.has(x) && x.aPens != null && x.bPens != null)
      if (shoot) { stories.push(tieStory('shootout', shoot, shoot.winner.clubId === shoot.teamA.clubId, koRound)); told.add(shoot) }
      // Nothing about the round yet: its headline, the biggest win.
      if (!stories.some(s => s.kind !== 'injury' && s.kind !== 'suspension')) {
        const head = [...ties].sort((a, b) => Math.abs(b.aGoals - b.bGoals) - Math.abs(a.aGoals - a.bGoals) || a.teamA.clubId.localeCompare(b.teamA.clubId))[0]
        if (head) stories.push(tieStory('koRound', head, head.winner.clubId === head.teamA.clubId, koRound))
      }
    }
    for (const s of stories) push(st, s)
    if (st.clock) clock += days
  }
  return out
}

// ── Adapters: the stages of each family, from its result ─────────────────────

const lpSides = (r: Pick<CLSeasonResult, 'leaguePhaseStandings'>): PressSide[] =>
  r.leaguePhaseStandings.map(t => ({ clubId: t.clubId, clubName: t.clubName, isPlayer: t.isPlayer, ovr: t.ovr }))

// Every knockout round's stage, in English (label() translates it). One map, so
// the live knockouts and a finished result name a round the same way.
const KO_STAGE: Record<string, string> = {
  playoff: 'Knockout play-off', r32: 'Round of 32', r16: 'Round of 16', qf: 'Quarter-final',
  sf: 'Semi-final', third: 'Third-place play-off', final: 'Final',
}

/** Knockout rounds (a result's, or the live stage's played ones) as press stages. */
export function knockoutStages(rounds: { round: string; ties: PressTie[] }[]): CupStage[] {
  return rounds.filter(r => r.ties.length > 0).map(r => ({ kind: 'knockout', key: r.round, stage: KO_STAGE[r.round] ?? r.round, ties: r.ties, final: r.round === 'final', clock: true }))
}

/** The knockout stages of a Champions League-shaped result, in playing order. */
export function clKnockoutStages(r: Pick<CLSeasonResult, 'playoffRound' | 'r16' | 'qf' | 'sf' | 'final'>): CupStage[] {
  return knockoutStages([
    { round: 'playoff', ties: r.playoffRound }, { round: 'r16', ties: r.r16 }, { round: 'qf', ties: r.qf },
    { round: 'sf', ties: r.sf }, { round: 'final', ties: r.final ? [r.final] : [] },
  ])
}

/**
 * A Champions League-shaped run's stages: the full path's domestic season
 * (when kept), the league phase as played so far, then the knockouts. `upTo`
 * cuts the league phase for the live screen; the knockouts are passed as they
 * have been revealed (the live screen) or whole (a finished result).
 */
export function clPressStages(r: Pick<CLSeasonResult, 'leaguePhaseStandings' | 'leagueMatchdays' | 'domesticMatchdays' | 'domesticRegular' | 'playoffRound' | 'r16' | 'qf' | 'sf' | 'final'>,
  o: { knockouts?: CupStage[]; phaseMatchdays?: number; qual?: QualifyingResult | null; domesticTotal?: number } = {}): CupStage[] {
  const out: CupStage[] = []
  const playerId = r.leaguePhaseStandings.find(t => t.isPlayer)?.clubId ?? null
  // The domestic regular season. A split league halves points at the split,
  // which a table rebuilt from results can't follow, so the press stops there,
  // and its last regular matchday crowns nobody (the title is still to come).
  // The live screen passes the season's length (`domesticTotal`); a finished
  // result knows it from its matches.
  const domAll = r.domesticMatchdays ?? []
  if (domAll.length) {
    const played = Math.max(...domAll.map(m => m.matchday))
    const regular = r.domesticRegular ?? o.domesticTotal ?? played
    const dom = domAll.filter(m => m.matchday <= regular)
    const clubs = new Map<string, PressSide>()
    for (const m of dom) for (const s of [m.home, m.away]) clubs.set(s.clubId, s)
    const split = r.domesticRegular != null
    out.push({ kind: 'table', key: 'dom', stage: 'Domestic Season', total: regular, clubs: [...clubs.values()], matches: dom, league: !split })
  }
  // The full path's qualifying: each round of your competition's ladder (and
  // yours, wherever you dropped to) as a knockout round. No injury clock: the
  // ledger starts at the league phase.
  const qualPlayer = playerId ?? o.qual?.ties.flatMap(t => [t.teamA, t.teamB]).find(t => t?.isPlayer)?.clubId
  const qualTies = runQualTies(o.qual, qualPlayer)
  const qualRounds = new Map<string, PressTie[]>()
  for (const q of qualTies) {
    if (!q.teamB || !q.legs) continue
    const key = `q-${q.comp ?? 'ucl'}-${q.round}`
    qualRounds.set(key, [...(qualRounds.get(key) ?? []), {
      teamA: q.teamA, teamB: q.teamB, winner: { clubId: q.winnerId }, aGoals: q.legs.totalA, bGoals: q.legs.totalB,
      aPens: q.legs.homePens, bPens: q.legs.awayPens,
    }])
  }
  for (const [key, ties] of qualRounds) out.push({ kind: 'knockout', key, stage: QUAL_ROUND_LABEL[key.split('-')[2]] ?? 'Qualifying', ties })
  // A league phase you never reached was played without you: not your press.
  if (o.qual && !playerId) return out
  const lp = r.leagueMatchdays ?? []
  if (lp.length) {
    const total = o.phaseMatchdays ?? Math.max(...lp.map(m => m.matchday))   // six in the Conference League
    out.push({ kind: 'table', key: 'lp', stage: 'League Phase', total, clubs: lpSides(r), matches: lp, direct: 8, playoffTo: 24, clock: true })
  }
  out.push(...(o.knockouts ?? clKnockoutStages(r)))
  return out
}

/** A World Cup's stages: the groups as played so far, then the knockouts. */
export function wcPressStages(r: Pick<WCSeasonResult, 'groups' | 'groupMatchdays' | 'knockoutRounds'>, o: { knockouts?: CupStage[] } = {}): CupStage[] {
  const groups = r.groups.map(g => ({ id: g.id, clubs: g.teams.map(t => ({ clubId: t.clubId, clubName: t.clubName, isPlayer: t.isPlayer, ovr: t.ovr })) }))
  return [
    { kind: 'groups', key: 'grp', stage: 'Group stage', total: 3, groups, matches: r.groupMatchdays ?? [], thirdsThrough: 8, clock: true },
    ...(o.knockouts ?? knockoutStages(r.knockoutRounds.map(k => ({
      round: k.round,
      ties: k.matches.map(m => ({ teamA: m.teamA, teamB: m.teamB, winner: m.winner, aGoals: m.result.homeGoals, bGoals: m.result.awayGoals, aPens: m.result.homePens, bPens: m.result.awayPens })),
    })))),
  ]
}
