import { SimTeam, MatchResult } from '@/types/simulation'
import { sigmoid, poissonSample, clamp } from '@/lib/math'

const HOME_ADVANTAGE = 3.5
const FORM_WEIGHT    = 4.0
const UPSET_THRESHOLD = 8

// OVR sensitivity: the SMALLER this divisor, the more each single OVR point
// matters — so a 92 genuinely beats a 91 more often, and 72 edges 71. Was 10
// (too flat, every game a coin-flip); 6.5 makes quality bite while still leaving
// real room for upsets.
const OVR_DELTA_DIVISOR = 6.5
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

export function simulateMatch(home: SimTeam, away: SimTeam): MatchResult {
  const homeEff = home.ovr + HOME_ADVANTAGE + home.form * FORM_WEIGHT + (home.isPlayer ? activeTilt : 0)
  const awayEff = away.ovr + away.form * FORM_WEIGHT + (away.isPlayer ? activeTilt : 0)

  const delta = (homeEff - awayEff) / OVR_DELTA_DIVISOR
  const homeWinProb = sigmoid(delta) * MAX_WIN_PROB
  // Tighter matches (small delta) draw more; lopsided ones almost never do.
  const drawProb    = clamp(0.27 - Math.abs(delta) * 0.05, 0.04, 0.27)
  const awayWinProb = 1 - homeWinProb - drawProb

  const roll = Math.random()
  const outcome: MatchResult['outcome'] =
    roll < homeWinProb            ? 'home' :
    roll < homeWinProb + drawProb ? 'draw' : 'away'

  const { homeGoals, awayGoals } = generateScore(outcome, homeEff, awayEff)

  const loserAdvantage =
    outcome === 'home' ? away.ovr - home.ovr :
    outcome === 'away' ? home.ovr - away.ovr : 0
  const isUpset = loserAdvantage >= UPSET_THRESHOLD

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