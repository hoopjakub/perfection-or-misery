// A cup stage's live press (F-01): the stories of the rounds played so far,
// handed to the story page too (it reads the live press until the run's
// result exists). Pure underneath (cupPress), so what the stage shows is the
// start of what the run hub shows once the run is over.
import { useEffect, useMemo } from 'react'
import { cupPress, type CupStage } from '@/engine/cup-press'
import { setLivePress } from '@/lib/livePress'
import type { Absence } from '@/engine/availability'
import type { Story } from '@/engine/press'

/** `stages` builds the played stages (null: not yet); `key` says when they changed. */
export function useCupPress(stages: () => CupStage[] | null, absences: () => Absence[] | undefined, key: readonly unknown[]): Story[] {
  const stories = useMemo(() => {
    const st = stages()
    return st ? cupPress(st, absences() ?? []) : []
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, key)
  useEffect(() => { if (stories.length) setLivePress(stories) }, [stories])
  return stories
}
