import React from 'react'
import { ROLES } from '@/theme'
import { TieRow, type TieVM } from '@/components/season/SeasonParts'

// Every knockout, qualifying and result list renders through the shared tie
// row (src/components/season/SeasonParts.tsx), so a tie reads the same
// everywhere. These screens are all nylon.
// P8.5-25: the ground comes from the screen this sits on (useScreenRoles).
import type { CLKnockoutMatch } from '@/engine/cl-sim'
import type { WCKnockoutMatch } from '@/engine/world-cup-sim'
import type { QualTie } from '@/engine/cl-qualifying'
import { getFlag } from '@/lib/flagMap'
import { useScreenRoles } from '@/lib/appearance'

// The knockout tie row and its adapters. The "Knockout Rounds" list this file
// was named for is gone (P8-79): the result screens draw their knockouts as a
// bracket (src/components/BracketTree.tsx). What stays is below.
//
// Shared "Knockout Rounds" list (Big Fixes §1) — the ONE tie-row look used by
// WC knockouts, CL (classic) knockouts, CL (full) qualifiers, and CL (full)
// knockouts (live and static). Replaces the old per-file `BracketView`
// (cramped 158px-wide side-scrolling columns) and the live WC view's separate
// "featured match + Elsewhere in the round" layout. `clKoMatchToRow` /
// `wcKoMatchToRow` below adapt each mode's own tie shape into the shared
// `KoTieVM` — kept alongside the view so there's exactly one place that knows
// how a CL/WC tie becomes a row (qualifying ties reuse `clKoMatchToRow` via
// `qualTieToKoMatch`, CustomUclViewers.tsx's existing QualTie→CLKnockoutMatch
// adapter).
export type KoTieVM = {
  id: string
  teamAName: string
  teamBName: string
  /** The crests (P8-12): without the ids every tie drawn through here fell back
   *  to drawn initials ("LF", "CF") — the maintainer's screenshot, 24 Sept. */
  teamAClubId?: string
  teamBClubId?: string
  teamAFlag?: string   // WC only — club ties show text, no crest (repo convention)
  teamBFlag?: string
  winnerIsA: boolean
  isPlayerTie: boolean
  bye?: boolean            // qualifying byes — teamA advances unopposed
  directA?: boolean        // ◆ marker — entered this round directly (e.g. R16 seeds 1-8)
  directB?: boolean
  scoreLabel?: string      // "3 – 2" (aggregate for two-legged, or the single score)
  inlineSuffix?: string    // "(AET)" / "(P 5-4)" — single-leg (WC) style, next to the score
  subLine?: string         // "2-0 · 0-3 · AET" — leg-by-leg breakdown, two-legged style
  // The live-reveal "this just happened" state (simulation.tsx): a richer,
  // highlighted card with the scorers and an ADVANCES/ELIMINATED caption,
  // shown once for whichever tie just resolved before it folds into the flat
  // list like every other row.
  justDecided?: { scorersLine?: string; outcomeLine: string; outcomeColor: string }
  onPress?: () => void
}

export type KoRoundVM = {
  key: string
  label: string
  sub?: string
  infoTopic?: string
  ties: KoTieVM[]
}

// Exported so QualifyingLadder (its round → path grouping is qualifying-
// specific) renders the exact same row as every other screen.
export function KnockoutTieRow({ tie }: { tie: KoTieVM; accent?: string }) {
  const roles = useScreenRoles()
  return <TieRow roles={roles} tie={koTieToVM(tie)} />
}

function koTieToVM(t: KoTieVM): TieVM {
  return {
    id: t.id, aName: t.teamAName, bName: t.teamBName,
    aClubId: t.teamAClubId, bClubId: t.teamBClubId,
    aFlag: t.teamAFlag, bFlag: t.teamBFlag,
    score: t.scoreLabel?.replace(/\s*–\s*/, '–'),
    detail: [t.subLine, t.inlineSuffix?.replace(/[()]/g, '')].filter(Boolean).join(' · ') || undefined,
    winnerIsA: t.winnerIsA, isPlayerTie: t.isPlayerTie, bye: t.bye,
    directA: t.directA, directB: t.directB,
    scorers: t.justDecided?.scorersLine,
    note: t.justDecided?.outcomeLine,
    onPress: t.onPress,
  }
}

// ── Adapters: mode tie shape → KoTieVM ───────────────────────────────────────

// CL (classic + full) — two-legged (playoff/r16/qf/sf) or single-match (final).
// `directIds` marks clubs that entered THIS round directly (e.g. R16 seeds
// 1-8 skipping the playoff) with the ◆ marker.
export function clKoMatchToRow(
  m: CLKnockoutMatch, directIds?: Set<string>, onPress?: () => void,
  justDecided?: { scorersLine?: string; outcomeLine: string; outcomeColor: string },
): KoTieVM {
  const winnerIsA = m.winner.clubId === m.teamA.clubId
  let subLine: string | undefined
  let inlineSuffix: string | undefined
  if (m.leg1) {
    const parts = [`${m.leg1.aGoals}-${m.leg1.bGoals}`]
    if (m.leg2) parts.push(`${m.leg2.aGoals}-${m.leg2.bGoals}`)
    if (m.extraTime) parts.push('AET')
    if (m.aPens !== undefined) parts.push(`pens ${m.aPens}-${m.bPens}`)
    subLine = parts.join(' · ')
  } else {
    inlineSuffix = m.aPens !== undefined ? `(P ${m.aPens}-${m.bPens})` : m.extraTime ? '(AET)' : undefined
  }
  return {
    id: `${m.round}-${m.teamA.clubId}-${m.teamB.clubId}`,
    teamAName: m.teamA.clubName, teamBName: m.teamB.clubName,
    teamAClubId: m.teamA.clubId, teamBClubId: m.teamB.clubId,
    winnerIsA, isPlayerTie: m.teamA.isPlayer || m.teamB.isPlayer,
    directA: !!directIds?.has(m.teamA.clubId), directB: !!directIds?.has(m.teamB.clubId),
    scoreLabel: `${m.aGoals} – ${m.bGoals}`,
    inlineSuffix, subLine, onPress, justDecided,
  }
}

// World Cup — single match, nations carry flags. `justDecided` is only set by
// the live sim (the tie that just resolved); the static result screen never
// passes it, so every tie there renders as a flat row.
export function wcKoMatchToRow(
  m: WCKnockoutMatch,
  opts?: { onPress?: () => void; justDecided?: { scorersLine?: string; outcomeLine: string; outcomeColor: string } },
): KoTieVM {
  const winnerIsA = m.winner.clubId === m.teamA.clubId
  const inlineSuffix = m.result.homePens !== null ? `(P ${m.result.homePens}-${m.result.awayPens})` : m.result.extraTime ? '(AET)' : undefined
  return {
    id: `${m.round}-${m.teamA.clubId}-${m.teamB.clubId}`,
    teamAName: m.teamA.clubName, teamBName: m.teamB.clubName,
    teamAClubId: m.teamA.clubId, teamBClubId: m.teamB.clubId,
    teamAFlag: getFlag(m.teamA.clubId) ?? undefined,
    teamBFlag: getFlag(m.teamB.clubId) ?? undefined,
    winnerIsA, isPlayerTie: m.teamA.isPlayer || m.teamB.isPlayer,
    scoreLabel: `${m.result.homeGoals} – ${m.result.awayGoals}`,
    inlineSuffix,
    onPress: opts?.onPress, justDecided: opts?.justDecided,
  }
}

// CL (full) qualifying ties — used by QualifyingLadder, which keeps its own
// round → path (champions/league) grouping but renders every row through
// this + KnockoutTieRow so qualifiers, League Phase knockouts, and the final
// all read as the same list.
export function qualTieToKoRow(
  t: QualTie, onPress?: () => void,
  justDecided?: { scorersLine?: string; outcomeLine: string; outcomeColor: string },
): KoTieVM {
  const isPlayerTie = t.teamA.isPlayer || !!t.teamB?.isPlayer
  if (!t.teamB || !t.legs) {
    return { id: `${t.round}-${t.path}-${t.teamA.clubId}`, teamAName: t.teamA.clubName, teamBName: '', teamAClubId: t.teamA.clubId, winnerIsA: true, isPlayerTie, bye: true }
  }
  const { legs } = t
  const parts = [`${legs.leg1.homeGoals}-${legs.leg1.awayGoals}`, `${legs.leg2.homeGoals}-${legs.leg2.awayGoals}`]
  if (legs.extraTime) parts.push('AET')
  if (legs.homePens !== null) parts.push(`pens ${legs.homePens}-${legs.awayPens}`)
  return {
    id: `${t.round}-${t.path}-${t.teamA.clubId}-${t.teamB.clubId}`,
    teamAName: t.teamA.clubName, teamBName: t.teamB.clubName,
    teamAClubId: t.teamA.clubId, teamBClubId: t.teamB.clubId,
    winnerIsA: t.winnerId === t.teamA.clubId, isPlayerTie,
    scoreLabel: `${legs.totalA} – ${legs.totalB}`,
    subLine: parts.join(' · '),
    onPress, justDecided,
  }
}
