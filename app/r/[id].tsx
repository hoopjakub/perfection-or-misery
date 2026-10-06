import { t } from '@/i18n'
import React, { useEffect, useState } from 'react'
import { router, useLocalSearchParams } from 'expo-router'
import { KitScreen, KitText, Loader, EmptyState, Plate } from '@/components/kit'
import { fetchRunById } from '@/db/queries/runs'
import { runRoute, exitToHome } from '@/lib/nav'
import { ROLES } from '@/theme'
import { EVERYDAY } from '@/lib/appearance'

// P8-121: a shared run's link, opened in the app. A link is `/r/<run id>`
// (src/lib/shareRun.ts); on the web the site answers it (api/r.ts, with the
// run's preview), and on a phone that page hands it to the app as
// pom://r/<run id>, which lands here. The run is public to read (P8-89), so
// this only needs its mode to know which result screen rebuilds it.
const roles = ROLES[EVERYDAY]

export default function SharedRunScreen() {
  const { id } = useLocalSearchParams<{ id: string }>()
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    let active = true
    // Run ids are UUIDs; anything else is a broken link, not a query.
    if (!/^[0-9a-f-]{36}$/i.test(id ?? '')) { setFailed(true); return }
    fetchRunById(id)
      .then(run => {
        if (!active) return
        if (!run) { setFailed(true); return }
        router.replace({ pathname: runRoute(run.mode), params: { runId: run.id } })
      })
      .catch(() => { if (active) setFailed(true) })
    return () => { active = false }
  }, [id])

  return (
    <KitScreen ground={EVERYDAY} scroll={false}>
      {failed ? (
        <>
          <EmptyState roles={roles} title={t('screens.runNotFound')} body={t('screens.runNotFoundBody')} />
          <Plate label={t('screens.goHome')} roles={roles} onPress={exitToHome} />
        </>
      ) : (
        <>
          <Loader color={roles.text} label={t('screens.openingRun')} />
          <KitText t="bodyL" color={roles.textMuted}>{t('screens.openingRunDots')}</KitText>
        </>
      )}
    </KitScreen>
  )
}
