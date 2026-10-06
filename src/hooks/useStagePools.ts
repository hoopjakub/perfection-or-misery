import { useEffect, useRef } from 'react'
import { log } from '@/diag/log'
import { loadLeaguePools, lineupCtxOf } from '@/engine/run-stats'
import { createAvailabilityLedger, type AvailabilityLedger } from '@/engine/availability'
import type { DraftedPlayer } from '@/types/game'
import type { RosterPlayer } from '@/types/stats'

/**
 * A competition's squads, the lineup context and the injury and suspension
 * ledger (§10.5), loaded once when its clubs are known (centralisation step 4b).
 * Every attribution on the screen and every match sheet regenerates the same
 * eleven from these. The Champions League and World Cup screens each loaded
 * them on arrival and again, as a fallback, inside their finish; `ensure` is
 * that fallback, for a run that reaches the knockouts before the load lands.
 */
export function useStagePools(o: {
  teams: { clubId: string; clubName: string; isPlayer: boolean }[] | null | undefined
  squad: DraftedPlayer[]
  yearStart: number
  useSubstitutes: boolean
  /** Every matchday the ledger counts: the group stage and the whole bracket,
   *  so an injury early on can still cost somebody a later round. */
  totalMatchdays: number
  tag: string
}) {
  const poolByClubRef = useRef<Map<string, RosterPlayer[]>>(new Map())
  const lineupCtxRef = useRef<{ playerClubId?: string; benchSize?: number }>({})
  const availabilityRef = useRef<AvailabilityLedger | null>(null)
  const load = (teams: NonNullable<typeof o.teams>) => loadLeaguePools(teams, o.squad, o.yearStart, o.useSubstitutes).then(p => {
    poolByClubRef.current = p.poolByClub
    lineupCtxRef.current = lineupCtxOf(p)
    availabilityRef.current ??= createAvailabilityLedger({ poolByClub: p.poolByClub, playerClubId: p.playerClubId, totalMatchdays: o.totalMatchdays })
  })
  useEffect(() => {
    if (!o.teams?.length || o.squad.length === 0) return
    load(o.teams).catch(e => log.warn('db', `${o.tag}: pool load failed`, e))
  }, [o.teams])
  const ensure = async (teams: NonNullable<typeof o.teams>) => {
    if (poolByClubRef.current.size === 0) await load(teams).catch(e => log.warn('db', `${o.tag}: pool load failed`, e))
    return { pool: poolByClubRef.current, ctx: lineupCtxRef.current }
  }
  return { poolByClubRef, lineupCtxRef, availabilityRef, ensure }
}
