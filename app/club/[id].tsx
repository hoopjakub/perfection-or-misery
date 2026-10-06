import React from 'react'
import { t } from '@/i18n'
import { useLocalSearchParams } from 'expo-router'
import { KitScreen, BackControl } from '@/components/kit'
import { PageMeta } from '@/components/PageMeta'
import { ClubView } from '@/components/ClubView'
import { ROLES } from '@/theme'
import { EVERYDAY } from '@/lib/appearance'

// P8-181: a club's page. Anyone can see a club (they're public, like a
// profile); only members read its chat. The page itself is ClubView, which
// the Clubs tab shows too when it's your club (P8.5-45).
const roles = ROLES[EVERYDAY]

export default function ClubScreen() {
  const { id } = useLocalSearchParams<{ id: string }>()
  return (
    <KitScreen ground={EVERYDAY}>
      <PageMeta title={t('clubs.pageTitleOne')} path={`/club/${id}`} />
      <BackControl roles={roles} />
      <ClubView id={id} />
    </KitScreen>
  )
}
