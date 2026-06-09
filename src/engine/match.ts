import { SimTeam, MatchResult } from '@/types/simulation'
import { sigmoid, poissonSample, clamp } from '@/lib/math'

const HOME_ADVANTAGE = 3.5
const FORM_WEIGHT    = 4.0
const UPSET_THRESHOLD = 8

export function simulateMatch(home: SimTeam, away: SimTeam): MatchResult {
  const homeEff = home.ovr + HOME_ADVANTAGE + home.form * FORM_WEIGHT
  const awayEff = away.ovr + away.form * FORM_WEIGHT

  const delta = (homeEff - awayEff) / 10
  const homeWinProb = sigmoid(delta) * 0.85
  const drawProb    = clamp(0.26 - Math.abs(delta) * 0.018, 0.05, 0.26)
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
  const baseGoals = 1.2 + ovrGap / 40

  if (outcome === 'draw') {
    const g = Math.max(0, poissonSample(baseGoals * 0.7))
    return { homeGoals: g, awayGoals: g }
  }

  const winnerGoals = Math.max(1, poissonSample(baseGoals * 1.35))
  const loserGoals  = Math.max(0, poissonSample(baseGoals * 0.55))
  const safe = Math.max(winnerGoals, loserGoals + 1)

  return outcome === 'home'
    ? { homeGoals: safe, awayGoals: loserGoals }
    : { homeGoals: loserGoals, awayGoals: safe }
}