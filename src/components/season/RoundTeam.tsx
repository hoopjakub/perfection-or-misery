import { t } from '@/i18n'
import { log } from '@/diag/log'
import React, { useEffect, useState } from 'react'
import { View, StyleSheet } from 'react-native'
import type { Roles } from '@/theme'
import { space } from '@/theme'
import { SectionTag, SafeSection } from '@/components/kit'
import { FormationPitch } from '@/components/season/AwardsParts'
import { teamOfTheRound, type RoundFixture } from '@/engine/run-stats'
import type { PickedTeam } from '@/engine/awards'
import type { RosterPlayer } from '@/types/stats'

// The round's team of the matchday under its results (P8-41), one component
// for every live screen that shows a round: the league season, the Champions
// League league phase, and the full path's domestic season and league phase.
// It was written inline in the league season; the Champions League never got
// one (the maintainer, 24 Sept) — copying it twice more is exactly what P8-71
// is about, so it lives here instead.
//
// Worked out once per round and kept (a round's team never changes), after the
// frame rather than inside the render, and inside SafeSection, so a failure
// costs only this section, never the screen.
const cache = new WeakMap<Map<string, RosterPlayer[]>, Map<string, PickedTeam | null>>()

export function RoundTeam({ roles, roundKey, label, fixtures, poolByClub, ctx }: {
  roles: Roles
  /** Unique per round within this run (e.g. "lp-3", "md-12"). */
  roundKey: string
  /** "Team of matchday 3" */
  label: string
  /** The round's PLAYED fixtures, with the seeds (and rotation/absences) the match sheet uses. */
  fixtures: RoundFixture[]
  poolByClub: Map<string, RosterPlayer[]>
  ctx: { playerClubId?: string; benchSize?: number }
}) {
  const [team, setTeam] = useState<PickedTeam | null>(null)
  useEffect(() => {
    if (fixtures.length === 0 || poolByClub.size === 0) { setTeam(null); return }
    const byRound = cache.get(poolByClub) ?? new Map<string, PickedTeam | null>()
    cache.set(poolByClub, byRound)
    if (byRound.has(roundKey)) { setTeam(byRound.get(roundKey)!); return }
    const t = setTimeout(() => {
      let picked: PickedTeam | null = null
      try { picked = teamOfTheRound(fixtures, poolByClub, ctx, roundKey) } catch (e) { log.warn('sim', 'round team: failed', e) }
      byRound.set(roundKey, picked)
      setTeam(picked)
    }, 0)
    return () => clearTimeout(t)
  }, [roundKey, fixtures.length, poolByClub])

  if (!team) return null
  return (
    <SafeSection name="team of the matchday">
      <View style={styles.wrap}>
        <SectionTag roles={roles}>{label}</SectionTag>
        <FormationPitch roles={roles} team={team} showScores="rating"
          caption={t('season.roundTeamCaption')} benchLabel={t('season.closeCalls')} />
      </View>
    </SafeSection>
  )
}

const styles = StyleSheet.create({
  wrap: { marginTop: space[5], gap: space[2] },
})
