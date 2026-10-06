import { t } from '@/i18n'
import React from 'react'
import { View, StyleSheet } from 'react-native'
import { getSlotsForFormation } from '@/engine/formations'
import { effectiveOvr } from '@/engine/rating'
import { ROLES, space } from '@/theme'
import { SectionTag } from '@/components/kit'
import { FormationPitch } from '@/components/season/AwardsParts'
import type { PickedTeam } from '@/engine/awards'
import type { DraftedPlayer, Formation } from '@/types/game'
import { FLOODLIT } from '@/lib/appearance'

// Your XI on the result pages, on the same kit pitch the awards use (P8-104:
// this was the last pre-redesign pitch, a rounded box with coloured position
// chips). Each player shows his effective OVR in the slot he played, which is
// what the sim used; the bench shows each sub's club and OVR.
export function LineupPitch({ formation, draftedPlayers, benchPlayers, title, caption = t('season.slotCaption'), scoreText }: {
  formation: Formation
  draftedPlayers: DraftedPlayer[]
  benchPlayers?: DraftedPlayer[]
  title?: string
  caption?: string
  /** Hold a figure back by player id (the ratings reveal). */
  scoreText?: (playerId: string, ovr: number) => string
}) {
  const roles = ROLES[FLOODLIT]
  const team: PickedTeam = {
    formation,
    xi: getSlotsForFormation(formation).flatMap(slot => {
      const p = draftedPlayers.find(d => d.slotIndex === slot.slotIndex && !d.isBench)
      return p ? [{ slot, player: { id: p.playerId, name: p.name, position: slot.label, score: effectiveOvr(p, slot), clubName: p.clubName } }] : []
    }),
    bench: (benchPlayers ?? []).map(p => ({ id: p.playerId, name: p.name, position: p.primaryPosition, score: p.ovr, clubName: p.clubName })),
    total: 0,
  }
  return (
    <View style={styles.wrap}>
      {title ? <SectionTag roles={roles}>{title}</SectionTag> : null}
      <FormationPitch roles={roles} team={team} showScores="score" benchScores benchLabel={t('parts.bench')}
        caption={caption} scoreText={scoreText && (p => scoreText(p.id, p.score))} />
    </View>
  )
}

const styles = StyleSheet.create({
  wrap: { gap: space[2] },
})
