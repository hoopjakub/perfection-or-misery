import { SimTeam, MatchResult } from '@/types/simulation'
import { sigmoid, poissonSample, clamp } from '@/lib/math'

export const HOME_ADVANTAGE = 3.5
const FORM_WEIGHT    = 4.0
const UPSET_THRESHOLD = 8

// OVR sensitivity: the SMALLER this divisor, the more each single OVR point
// matters — so a 92 genuinely beats a 91 more often, and 72 edges 71. Was 10
// (too flat, every game a coin-flip); 6.5 makes quality bite while still leaving
// real room for upsets.
const OVR_DELTA_DIVISOR = 6.5
// One strength scale (Wave G audit G-L3, 3 Oct 2026). Clubs used to be rated
// as their best 14 stretched ×1.55 around 81; your XI was never stretched, so
// the same players rated differently on either side of a match. Both are now
// rated the same way (clubStrength / calcTeamOvr in rating.ts), which narrows
// the gaps between clubs: a Premier League went from 80–94 to 81–91, and a
// season's first-to-last gap fell from 60 points to 50 (real leagues run
// 60–75). The stretch now lives here, applied to EVERY side's rating alike,
// so the numbers on screen stay honest and the gaps still bite. Only the
// rating is stretched: home advantage, form and the difficulty tilt were
// tuned in rating points and keep their meaning. Swept on 3 Oct 2026 over
// the top five leagues (02 §8): 1.5 puts the strongest club's title rate
// (39.9%) and the first-to-last gap (61.5 points) back where the old scale
// had them (37.6%, 61.2), with goals per game and home wins unmoved.
export const RATING_STRETCH = 1.5
export const stretched = (ovr: number) => ovr * RATING_STRETCH
const MAX_WIN_PROB = 0.90   // was 0.85 — let clear favourites actually dominate

// ── Player-only difficulty tilt ─────────────────────────────────────────────
// Difficulty used to only touch the DRAFT (rerolls / hidden ratings). It now
// also changes how hard the PLAYER's own matches are, as an effective-OVR swing
// applied ONLY to a side flagged isPlayer. A POSITIVE tilt (easy levels) plays
// the player a few OVR up so a genuinely strong squad finally wins comfortably;
// a NEGATIVE tilt (hard levels) plays them down so even good-vs-good leans to the
// AI. The tilt value comes from the difficulty screw-level (engine/difficulty.ts
// `tiltForLevel`) — the engine just applies whatever it's handed.
// AI-vs-AI matches are never touched, so every other result in the table /
// bracket stays fair and the standings keep their integrity.

// Run-scoped, set once when a real run's simulation starts (see the simulation
// screens). Defaults to neutral so the headless quick-sim tester and the
// stats/verification scripts — which never set it — stay unbiased.
let activeTilt = 0
export function setMatchTilt(tilt: number): void {
  activeTilt = Number.isFinite(tilt) ? tilt : 0
}
/** For the self-test's limit test, which runs the quick-sims (they set the
 *  tilt to neutral) and puts back whatever a run in progress had. */
export const getMatchTilt = (): number => activeTilt

/**
 * The odds of one match from the two effective ratings. Exported because the
 * pundits work out the points they expect from the SAME odds the match is
 * decided by (P8-13) — a prediction made with different maths would be a
 * different game's prediction.
 */
export function matchOdds(homeEff: number, awayEff: number): { home: number; draw: number; away: number } {
  const delta = (homeEff - awayEff) / OVR_DELTA_DIVISOR
  const home = sigmoid(delta) * MAX_WIN_PROB
  // Tighter matches (small delta) draw more; lopsided ones almost never do.
  const draw = clamp(0.27 - Math.abs(delta) * 0.05, 0.04, 0.27)
  return { home, draw, away: 1 - home - draw }
}

export function simulateMatch(home: SimTeam, away: SimTeam): MatchResult {
  const homeEff = stretched(home.ovr) + HOME_ADVANTAGE + home.form * FORM_WEIGHT + (home.isPlayer ? activeTilt : 0)
  const awayEff = stretched(away.ovr) + away.form * FORM_WEIGHT + (away.isPlayer ? activeTilt : 0)

  const { home: homeWinProb, draw: drawProb } = matchOdds(homeEff, awayEff)

  const roll = Math.random()
  const outcome: MatchResult['outcome'] =
    roll < homeWinProb            ? 'home' :
    roll < homeWinProb + drawProb ? 'draw' : 'away'

  const { homeGoals, awayGoals } = generateScore(outcome, homeEff, awayEff)

  const loserAdvantage =
    outcome === 'home' ? away.ovr - home.ovr :
    outcome === 'away' ? home.ovr - away.ovr : 0
  const isUpset = stretched(loserAdvantage) >= UPSET_THRESHOLD

  return { homeGoals, awayGoals, outcome, isUpset }
}

function generateScore(
  outcome: MatchResult['outcome'],
  homeEff: number,
  awayEff: number
): { homeGoals: number; awayGoals: number } {
  const ovrGap   = Math.abs(homeEff - awayEff)
  const baseGoals = 1.2 + ovrGap / 34   // bigger gaps → more lopsided scorelines

  if (outcome === 'draw') {
    const g = Math.max(0, poissonSample(baseGoals * 0.7))
    return { homeGoals: g, awayGoals: g }
  }

  // The bigger the quality gap, the more the winner runs up the score.
  const winnerLambda = baseGoals * (1.35 + ovrGap / 90)
  const winnerGoals = Math.max(1, poissonSample(winnerLambda))
  const loserGoals  = Math.max(0, poissonSample(baseGoals * 0.5))
  const safe = Math.max(winnerGoals, loserGoals + 1)

  return outcome === 'home'
    ? { homeGoals: safe, awayGoals: loserGoals }
    : { homeGoals: loserGoals, awayGoals: safe }
}