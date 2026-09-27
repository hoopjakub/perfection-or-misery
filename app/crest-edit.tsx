import React, { useEffect, useState } from 'react'
import { View, Pressable, StyleSheet } from 'react-native'
import { router } from 'expo-router'
import { KitScreen, KitText, SectionTag, BackControl, Plate, Field, Chips, Toggle, ListRow, StripedNotice, EmptyState, YourCrest, Swatches, crestHex } from '@/components/kit'
import { PageMeta } from '@/components/PageMeta'
import { fetchCrest, saveCrest, pickAvatar, uploadCrestPicture } from '@/db/queries/profile'
import {
  CREST_COLOURS, CREST_SHAPES, CREST_DEVICES, MAX_INITIALS, cleanInitials, defaultDesign,
  type CrestDesign, type CrestChoice, type CrestShape, type CrestDevice,
} from '@/lib/yourCrest'
import { useUserStore } from '@/store/userStore'
import { useCrestStore } from '@/store/crestStore'
import { ROLES, space, border } from '@/theme'

// P8-132: your own crest, in an edit mode that saves it. The kit's drawn
// badge (P8-12), chosen rather than generated: a shape, two colours from the
// palette, a shirt device and up to three letters; or a picture instead. It
// goes on the side you field in the league modes, and with "everywhere" on
// your side in the Champions League and the World Cup too. Each run keeps the
// crest it was played with, so changing it here never changes an old run.
const roles = ROLES.cotton
const SWATCHES = CREST_COLOURS.map(c => ({ ...c, hex: crestHex(c.id) }))

export default function CrestEditScreen() {
  const { user, profile, isGuest } = useUserStore()
  const uid = !isGuest ? user?.id : undefined
  const setMine = useCrestStore(s => s.setMine)
  const mineNow = useCrestStore(s => s.mine)
  const [design, setDesign] = useState<CrestDesign>(() => defaultDesign(profile?.username, mineNow?.colours))
  const [imagePath, setImagePath] = useState<string | null>(null)
  const [everywhere, setEverywhere] = useState(false)
  const [state, setState] = useState<'loading' | 'ok' | 'saving' | 'needs-db' | 'failed'>('loading')
  const [note, setNote] = useState<string | null>(null)

  useEffect(() => {
    if (!uid) return
    let active = true
    fetchCrest(uid).then(c => {
      if (!active) return
      if (c?.design) setDesign(c.design)
      setImagePath(c?.imagePath ?? null)
      setEverywhere(!!c?.everywhere)
      setState('ok')
    }).catch(() => { if (active) setState('ok') })
    return () => { active = false }
  }, [uid])

  if (!uid) {
    return (
      <KitScreen ground="cotton">
        <BackControl roles={roles} />
        <EmptyState roles={roles} icon="lock" title="Sign in for a crest" body="Your crest is kept with your account, so a guest can't have one." />
      </KitScreen>
    )
  }

  const choice: CrestChoice = { design, imagePath, everywhere }
  const set = <K extends keyof CrestDesign>(k: K, v: CrestDesign[K]) => setDesign(d => ({ ...d, [k]: v }))

  async function usePicture() {
    try {
      const jpeg = await pickAvatar()
      if (!jpeg) return
      setImagePath(await uploadCrestPicture(uid!, jpeg, imagePath))
      setNote(null)
    } catch (e) {
      console.warn('[crest] picture failed:', e)
      setNote("The picture couldn't be uploaded. Try again.")
    }
  }

  async function save() {
    setState('saving')
    try {
      await saveCrest(uid!, choice)
      setMine({ ...choice, colours: mineNow?.colours ?? null })   // the colours are the profile's
      router.back()
    } catch (e: any) {
      // The columns come from supabase/crest.sql; until it's run, say so.
      const missing = e?.code === 'PGRST204' || /crest/.test(String(e?.message ?? ''))
      setState(missing ? 'needs-db' : 'failed')
    }
  }

  return (
    <KitScreen ground="cotton">
      <PageMeta title="Your crest" path="/crest-edit" />
      <BackControl roles={roles} />
      <KitText t="superL" color={roles.text} accessibilityRole="header" style={styles.title}>YOUR CREST</KitText>

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

      {imagePath ? (
        <>
          <SectionTag roles={roles}>A picture</SectionTag>
          <KitText t="body" color={roles.textMuted}>Your picture is the crest. Remove it to draw one instead.</KitText>
          <Plate label="Choose another picture" variant="secondary" roles={roles} onPress={usePicture} />
          <Plate label="Remove the picture" variant="quiet" roles={roles} onPress={() => setImagePath(null)} />
        </>
      ) : (
        <>
          <SectionTag roles={roles}>Shape</SectionTag>
          <Chips<CrestShape> roles={roles} options={CREST_SHAPES} value={design.shape} onChange={v => set('shape', v)} />
          <SectionTag roles={roles}>Colours</SectionTag>
          <Swatches roles={roles} label="Main" options={SWATCHES} value={design.primary} onChange={v => set('primary', v)} />
          <Swatches roles={roles} label="Second" options={SWATCHES} value={design.secondary} onChange={v => set('secondary', v)} />
          <SectionTag roles={roles}>Device</SectionTag>
          <Chips<CrestDevice> roles={roles} options={CREST_DEVICES} value={design.device} onChange={v => set('device', v)} />
          <Field roles={roles} label={`Letters · up to ${MAX_INITIALS}`} value={design.initials} autoCapitalize="characters"
            maxLength={MAX_INITIALS} onChangeText={t => set('initials', cleanInitials(t))} />
          <Plate label="Use a picture instead" variant="quiet" roles={roles} onPress={usePicture} />
        </>
      )}
      {note ? <KitText t="body" color={roles.lossText}>{note}</KitText> : null}

      <SectionTag roles={roles}>Where it shows</SectionTag>
      <ListRow roles={roles} label="Everywhere, the Champions League and the World Cup too"
        trailing={<Toggle roles={roles} label="Your crest everywhere" value={everywhere} onChange={setEverywhere} />} />

      {state === 'needs-db' && (
        <StripedNotice roles={roles}>The database hasn't been set up for crests yet: run supabase/crest.sql in the Supabase SQL editor, then save again.</StripedNotice>
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
