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
        <EmptyState roles={roles} icon="lock" title="Sign in for a crest" body="Your crest is kept with your account, so a guest can't have one." />
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
      <PageMeta title="Your crest" path="/crest-edit" />
      <BackControl roles={roles} title="YOUR CREST" />

      <View style={styles.preview}>
        <YourCrest choice={choice} size={128} name="Your crest" />
        <View style={{ gap: space[2], flex: 1 }}>
          {/* How it reads in a table row, not just large. */}
          <View style={styles.small}>
            <YourCrest choice={choice} size={20} />
            <KitText t="body" color={roles.text} numberOfLines={1}>{profile?.username ? `${profile.username} XI` : 'Your XI'}</KitText>
          </View>
          <KitText t="body" color={roles.textMuted}>
            {everywhere ? 'On your side in every mode.' : 'On the side you field in the league modes.'}
          </KitText>
        </View>
      </View>

      {/* Your profile picture, or a drawn crest. */}
      <SectionTag roles={roles}>Your picture</SectionTag>
      {avatarPath ? (
        <ListRow roles={roles} label="Use your profile picture as your crest" sub="It follows your picture when you change it"
          trailing={<Toggle roles={roles} label="Your picture as your crest" value={avatar} onChange={v => { setAvatar(v); if (v) setOldPicture(null) }} />} />
      ) : (
        <KitText t="body" color={roles.textMuted}>Give yourself a profile picture in the profile editor, and it can be your crest too.</KitText>
      )}
      {oldPicture && !avatar ? (
        <>
          <KitText t="body" color={roles.textMuted}>A picture you uploaded before is your crest. Remove it to draw one instead.</KitText>
          <Plate label="Remove the picture" variant="quiet" roles={roles} onPress={() => setOldPicture(null)} />
        </>
      ) : null}

      {!avatar && !oldPicture && (
        <>
          <SectionTag roles={roles}>Shape</SectionTag>
          <Chips<CrestShape> roles={roles} options={CREST_SHAPES} value={design.shape} onChange={v => set('shape', v)} />
          <SectionTag roles={roles}>Colours</SectionTag>
          <ColourField roles={roles} label="Main" quick={SWATCHES} value={design.primary} onChange={v => set('primary', v)} />
          <ColourField roles={roles} label="Second" quick={SWATCHES} value={design.secondary} onChange={v => set('secondary', v)} />
          <SectionTag roles={roles}>Device</SectionTag>
          <Chips<CrestDevice> roles={roles} options={CREST_DEVICES} value={design.device} onChange={v => set('device', v)} />
          <SectionTag roles={roles}>Trim</SectionTag>
          <Chips<CrestTrim> roles={roles} options={CREST_TRIMS} value={design.trim ?? 'ink'} onChange={v => set('trim', v)} />
          <Field roles={roles} label={`Letters · up to ${MAX_INITIALS}`} value={design.initials} autoCapitalize="characters"
            maxLength={MAX_INITIALS} onChangeText={t => set('initials', cleanInitials(t))} />
        </>
      )}

      <SectionTag roles={roles}>Where it shows</SectionTag>
      <ListRow roles={roles} label="Everywhere, the Champions League and the World Cup too"
        trailing={<Toggle roles={roles} label="Your crest everywhere" value={everywhere} onChange={setEverywhere} />} />

      {state === 'needs-db' && (
        <StripedNotice roles={roles}>The database hasn't been set up for crests yet: run supabase/crest.sql in the Supabase SQL editor, then save again.</StripedNotice>
      )}
      {state === 'needs-plus' && (
        <StripedNotice roles={roles}>Everything else is saved. Your picture as your crest needs supabase/profile-plus.sql run first, then save again.</StripedNotice>
      )}
      {state === 'failed' && <StripedNotice roles={roles} failed>Your crest couldn't be saved. Try again.</StripedNotice>}
      <Plate label="Save your crest" icon="check" roles={roles} onPress={save} loading={state === 'saving'} style={styles.save} />
    </KitScreen>
  )
}

const styles = StyleSheet.create({
  title: { marginTop: space[2], marginBottom: space[3] },
  preview: { flexDirection: 'row', alignItems: 'center', gap: space[4], marginBottom: space[3] },
  small: { flexDirection: 'row', alignItems: 'center', gap: space[2] },
  save: { marginTop: space[5] },
})
