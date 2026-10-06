import { t } from '@/i18n'
import React, { useEffect, useState } from 'react'
import { View, StyleSheet } from 'react-native'
import { router } from 'expo-router'
import { KitScreen, KitText, SectionTag, BackControl, Plate, Field, Chips, Toggle, ListRow, StripedNotice, EmptyState, YourCrest, ColourField, crestHex } from '@/components/kit'
import { PageMeta } from '@/components/PageMeta'
import { fetchCrest, saveCrest } from '@/db/queries/profile'
import {
  CREST_COLOURS, CREST_SHAPES, CREST_DEVICES, CREST_TRIMS, MAX_INITIALS, cleanInitials, defaultDesign,
  type CrestDesign, type CrestChoice, type CrestShape, type CrestDevice, type CrestTrim,
} from '@/lib/yourCrest'
import { useUserStore } from '@/store/userStore'
import { useCrestStore } from '@/store/crestStore'
import { ROLES, space } from '@/theme'
import { EVERYDAY } from '@/lib/appearance'

// P8-132: your own crest, in an edit mode that saves it. The kit's drawn
// badge (P8-12), chosen rather than generated; or your profile picture. It
// goes on the side you field in the league modes, and with "everywhere" on
// your side in the Champions League and the World Cup too. Each run keeps the
// crest it was played with, so changing it here never changes an old run.
//
// P8-175 (the maintainer, 27 Sept): your profile picture as your crest if you
// want it, and no uploading a separate picture; and far more to draw with —
// nine shapes, thirteen devices, a trim, and any colour (P8-177's picker).
const roles = ROLES[EVERYDAY]
const SWATCHES = CREST_COLOURS.map(c => ({ ...c, hex: crestHex(c.id) }))

export default function CrestEditScreen() {
  const { user, profile, isGuest } = useUserStore()
  const uid = !isGuest ? user?.id : undefined
  const setMine = useCrestStore(s => s.setMine)
  const mineNow = useCrestStore(s => s.mine)
  const avatarPath = profile?.avatar_path ?? null
  const [design, setDesign] = useState<CrestDesign>(() => defaultDesign(profile?.username, mineNow?.colours))
  const [avatar, setAvatar] = useState(false)
  // A picture uploaded before P8-175 stays the crest until it's removed.
  const [oldPicture, setOldPicture] = useState<string | null>(null)
  const [everywhere, setEverywhere] = useState(false)
  const [state, setState] = useState<'loading' | 'ok' | 'saving' | 'needs-db' | 'needs-plus' | 'failed'>('loading')

  useEffect(() => {
    if (!uid) return
    let active = true
    fetchCrest(uid).then(c => {
      if (!active) return
      if (c?.design) setDesign(c.design)
      setAvatar(!!c?.avatar)
      setOldPicture(!c?.avatar ? c?.imagePath ?? null : null)
      setEverywhere(!!c?.everywhere)
      setState('ok')
    }).catch(() => { if (active) setState('ok') })
    return () => { active = false }
  }, [uid])

  if (!uid) {
    return (
      <KitScreen ground={EVERYDAY}>
        <BackControl roles={roles} />
        <EmptyState roles={roles} icon="lock" title={t('crest.signIn')} body={t('crest.guestBody')} />
      </KitScreen>
    )
  }

  const imagePath = avatar ? avatarPath : oldPicture
  const choice: CrestChoice = { design, imagePath, everywhere, avatar }
  const set = <K extends keyof CrestDesign>(k: K, v: CrestDesign[K]) => setDesign(d => ({ ...d, [k]: v }))

  async function save() {
    setState('saving')
    try {
      const kept = await saveCrest(uid!, choice)
      setMine({ ...choice, colours: mineNow?.colours ?? null })   // the colours are the profile's
      if (!kept) { setState('needs-plus'); return }
      router.back()
    } catch (e: any) {
      // The columns come from supabase/crest.sql; until it's run, say so.
      const missing = e?.code === 'PGRST204' || /crest/.test(String(e?.message ?? ''))
      setState(missing ? 'needs-db' : 'failed')
    }
  }

  return (
    <KitScreen ground={EVERYDAY}>
      <PageMeta title={t('crest.pageTitle')} path="/crest-edit" />
      <BackControl roles={roles} title={t('crest.heading')} />

      <View style={styles.preview}>
        <YourCrest choice={choice} size={128} name={t('crest.pageTitle')} />
        <View style={{ gap: space[2], flex: 1 }}>
          {/* How it reads in a table row, not just large. */}
          <View style={styles.small}>
            <YourCrest choice={choice} size={20} />
            <KitText t="body" color={roles.text} numberOfLines={1}>{profile?.username ? t('crest.yourXi', { name: profile.username }) : t('crest.yourXiPlain')}</KitText>
          </View>
          <KitText t="body" color={roles.textMuted}>
            {everywhere ? t('crest.everywhereOn') : t('crest.leagueOnly')}
          </KitText>
        </View>
      </View>

      {/* Your profile picture, or a drawn crest. */}
      <SectionTag roles={roles}>{t('crest.yourPicture')}</SectionTag>
      {avatarPath ? (
        <ListRow roles={roles} label={t('crest.useAvatar')} sub={t('crest.useAvatarSub')}
          trailing={<Toggle roles={roles} label={t('crest.avatarToggle')} value={avatar} onChange={v => { setAvatar(v); if (v) setOldPicture(null) }} />} />
      ) : (
        <KitText t="body" color={roles.textMuted}>{t('crest.noAvatar')}</KitText>
      )}
      {oldPicture && !avatar ? (
        <>
          <KitText t="body" color={roles.textMuted}>{t('crest.oldPicture')}</KitText>
          <Plate label={t('crest.removePicture')} variant="quiet" roles={roles} onPress={() => setOldPicture(null)} />
        </>
      ) : null}

      {!avatar && !oldPicture && (
        <>
          <SectionTag roles={roles}>{t('crest.shapeTitle')}</SectionTag>
          <Chips<CrestShape> roles={roles} options={CREST_SHAPES} value={design.shape} onChange={v => set('shape', v)} />
          <SectionTag roles={roles}>{t('crest.colours')}</SectionTag>
          <ColourField roles={roles} label={t('crest.main')} quick={SWATCHES} value={design.primary} onChange={v => set('primary', v)} />
          <ColourField roles={roles} label={t('crest.second')} quick={SWATCHES} value={design.secondary} onChange={v => set('secondary', v)} />
          <SectionTag roles={roles}>{t('crest.deviceTitle')}</SectionTag>
          <Chips<CrestDevice> roles={roles} options={CREST_DEVICES} value={design.device} onChange={v => set('device', v)} />
          <SectionTag roles={roles}>{t('crest.trimTitle')}</SectionTag>
          <Chips<CrestTrim> roles={roles} options={CREST_TRIMS} value={design.trim ?? 'ink'} onChange={v => set('trim', v)} />
          <Field roles={roles} label={t('crest.letters', { n: MAX_INITIALS })} value={design.initials} autoCapitalize="characters"
            maxLength={MAX_INITIALS} onChangeText={v => set('initials', cleanInitials(v))} />
        </>
      )}

      <SectionTag roles={roles}>{t('crest.whereShows')}</SectionTag>
      <ListRow roles={roles} label={t('crest.everywhere')}
        trailing={<Toggle roles={roles} label={t('crest.everywhereToggle')} value={everywhere} onChange={setEverywhere} />} />

      {state === 'needs-db' && (
        <StripedNotice roles={roles}>{t('crest.noSql')}</StripedNotice>
      )}
      {state === 'needs-plus' && (
        <StripedNotice roles={roles}>{t('crest.noPlusSql')}</StripedNotice>
      )}
      {state === 'failed' && <StripedNotice roles={roles} failed>{t('crest.failed')}</StripedNotice>}
      <Plate label={t('crest.save')} icon="check" roles={roles} onPress={save} loading={state === 'saving'} style={styles.save} />
    </KitScreen>
  )
}

const styles = StyleSheet.create({
  title: { marginTop: space[2], marginBottom: space[3] },
  preview: { flexDirection: 'row', alignItems: 'center', gap: space[4], marginBottom: space[3] },
  small: { flexDirection: 'row', alignItems: 'center', gap: space[2] },
  save: { marginTop: space[5] },
})
