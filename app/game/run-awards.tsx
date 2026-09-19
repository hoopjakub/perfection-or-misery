import React, { useState } from 'react'
import { router } from 'expo-router'
import { ROLES } from '@/theme'
import { KitScreen, KitText, Plate, BackControl } from '@/components/kit'
import { AwardsSection } from '@/components/season/AwardsParts'
import { takeAwardsView, openPlayerSeason } from '@/lib/awardsNight'

// A finished run's awards, as a plain page (P4-G, P8-38): no count-down, no
// ceremony — that played once, live. Reached from the result screen's button.
const roles = ROLES.nylon

export default function RunAwardsScreen() {
  const [view] = useState(takeAwardsView)
  if (!view) {
    return (
      <KitScreen ground="nylon" scroll={false}>
        <KitText t="superM" color={roles.text}>"NO AWARDS"</KitText>
        <KitText t="bodyL" color={roles.textMuted}>Open the awards from a finished run.</KitText>
        <Plate label="Go back" roles={roles} onPress={() => router.back()} />
      </KitScreen>
    )
  }
  return (
    <KitScreen ground="nylon">
      <BackControl roles={roles} />
      <AwardsSection roles={roles} night={view.night} onPlayer={id => openPlayerSeason(id, view.runId)} />
    </KitScreen>
  )
}
