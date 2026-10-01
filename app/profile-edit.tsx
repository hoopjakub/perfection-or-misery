import React, { useEffect, useState } from 'react'
import { View, Pressable, StyleSheet } from 'react-native'
import { router } from 'expo-router'
import { KitScreen, KitText, SectionTag, BackControl, Plate, Field, Chips, Toggle, ListRow, ClubName, StripedNotice, Loader, RunLabel, ColourField, crestHex, IdTag } from '@/components/kit'
import { CREST_COLOURS, type SideColours } from '@/lib/yourCrest'
import { useCrestStore } from '@/store/crestStore'
import { PageMeta } from '@/components/PageMeta'
import { ProfileCard, LOOK_COLOURS, LOOK_EFFECTS } from '@/components/profile/ProfileParts'
import {
  fetchOwnDetails, saveProfile, pickAvatar, uploadAvatar, searchTeams, earnedTrophies, EMPTY_DETAILS, fetchCrest, saveSideColours,
  fetchPin, savePin, DEFAULT_PIN, type Pin,
  pickBanner, uploadBanner, AVATAR_FRAMES, LOOK_LIMITS,
  type ProfileDetails, type ProfileLook, type LookEffect, type AvatarFrame, type BannerKind,
} from '@/db/queries/profile'
import { fetchRunHistory, fetchAchievementRuns, type RunHistoryEntry } from '@/db/queries/leaderboard'
import { formatTier, runMeta, verdictOf } from '@/data/tiers'
import { useUserStore } from '@/store/userStore'
import { ROLES, space, border, colourwayFor, choiceHex } from '@/theme'

// P8-88: shaping your profile — your picture, the team you support and your
// favourite player, the look of the page, what others may see, and the runs
// and trophies you put on show. Saved in one go.
//
// P8-178 (the maintainer: "tenfold… on the level of Discord customisation"):
// your card at the top, live, as others will see it; then a frame for your
// picture, a banner (a colour, a gradient or a picture), a profile theme of two
// colours that tints the whole card, your status, pronouns and an about-me.
// Every colour is any colour (P8-177's picker), the palette's as quick picks.
const roles = ROLES.cotton
const MAX_PINS = 3
const SIDE_SWATCHES = CREST_COLOURS.map(c => ({ ...c, hex: crestHex(c.id) }))
const BANNER_KINDS: { id: BannerKind; label: string }[] = [{ id: 'colour', label: 'Colour' }, { id: 'gradient', label: 'Gradient' }, { id: 'picture', label: 'Picture' }]
const PAGE = 8

export default function ProfileEditScreen() {
  const { user, profile, isGuest } = useUserStore()
  const uid = !isGuest ? user?.id : undefined
  const [details, setDetails] = useState<ProfileDetails>(EMPTY_DETAILS)
  const [look, setLook] = useState<ProfileLook>({ colour: 'ink', effect: 'none' })
  const [avatarPath, setAvatarPath] = useState<string | null>(null)
  const [runs, setRuns] = useState<RunHistoryEntry[]>([])
  const [trophies, setTrophies] = useState<{ id: string; label: string }[]>([])
  const [ready, setReady] = useState<'loading' | 'ok' | 'needs-db' | 'failed'>('loading')
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<{ id: string; name: string }[]>([])
  const [saving, setSaving] = useState(false)
  // The lists grow with every run: a page at a time, sortable, so the run you
  // want is found by sorting, not by scrolling through all of them.
  const [runSort, setRunSort] = useState<'new' | 'score'>('new')
  const [runsShown, setRunsShown] = useState(PAGE)
  const [trophiesShown, setTrophiesShown] = useState(PAGE)
  const [note, setNote] = useState<string | null>(null)
  // P8-142: your club's colours, kept with the crest on the look row.
  const [sideColours, setSideColours] = useState<SideColours>({ main: 'orange', second: 'ink' })
  // The migrations a save found missing: what's in them waits, the rest is saved.
  const [waiting, setWaiting] = useState<string[]>([])
  // P8-168: your pin and your letters.
  const [pin, setPin] = useState<Pin>(DEFAULT_PIN)
  // P8-178: whether supabase/profile-plus.sql has run (banner, theme, frame, about).
  const [plusReady, setPlusReady] = useState(true)

  useEffect(() => {
    if (!uid) return
    let active = true
    ;(async () => {
      try {
        const [own, history, achRuns] = await Promise.all([fetchOwnDetails(uid), fetchRunHistory(uid, 200), fetchAchievementRuns(uid)])
        if (!active) return
        setRuns(history)
        setTrophies(earnedTrophies(achRuns))
        if (!own) { setReady('needs-db'); return }
        setDetails(own.details); setLook(own.look); setAvatarPath(own.avatarPath); setPlusReady(own.plus)
        const [crest, ownPin] = await Promise.all([fetchCrest(uid), fetchPin(uid)])
        if (active && crest?.colours) setSideColours(crest.colours)
        if (active && ownPin) setPin(ownPin)
        setReady('ok')
      } catch (e) {
        console.warn('[profile-edit] load failed:', e)
        if (active) setReady('failed')
      }
    })()
    return () => { active = false }
  }, [uid])

  // The team search reads the bundled database, so it answers as you type.
  useEffect(() => {
    let active = true
    searchTeams(query).then(r => { if (active) setResults(r) }).catch(() => {})
    return () => { active = false }
  }, [query])

  const set = <K extends keyof ProfileDetails>(k: K, v: ProfileDetails[K]) => setDetails(d => ({ ...d, [k]: v }))
  const toggleIn = (k: 'pinned_run_ids' | 'shown_achievements', id: string) =>
    setDetails(d => {
      const list = d[k]
      return { ...d, [k]: list.includes(id) ? list.filter(x => x !== id) : list.length >= MAX_PINS ? list : [...list, id] }
    })

  async function changePicture() {
    if (!uid) return
    try {
      const jpeg = await pickAvatar()
      if (!jpeg) return   // nothing chosen
      setAvatarPath(await uploadAvatar(uid, jpeg, avatarPath))
      useUserStore.getState().fetchProfile()   // You shows it straight away
      setNote('Picture saved.')
    } catch (e) {
      console.warn('[profile-edit] picture failed:', e)
      setNote("The picture couldn't be uploaded.")
    }
  }

  async function changeBanner() {
    if (!uid) return
    try {
      const jpeg = await pickBanner()
      if (!jpeg) return
      const path = await uploadBanner(uid, jpeg, look.banner?.path ?? null)
      setLook(l => ({ ...l, banner: { kind: 'picture', from: l.banner?.from ?? choiceHex(l.colour), to: l.banner?.to ?? choiceHex(l.colour), path } }))
    } catch (e) {
      console.warn('[profile-edit] banner failed:', e)
      setNote("The banner couldn't be uploaded.")
    }
  }
  // The banner's colours, starting from the look's colour when there's no banner yet.
  const bannerFrom = look.banner?.from ?? choiceHex(LOOK_COLOURS.find(c => c.id === look.colour)?.hex ?? look.colour)
  const setBanner = (patch: Partial<NonNullable<ProfileLook['banner']>>) =>
    setLook(l => {
      const b = { kind: 'colour' as BannerKind, from: bannerFrom, to: l.banner?.to ?? bannerFrom, path: l.banner?.path ?? null, ...l.banner, ...patch }
      // The plain colour also goes in the look's own colour, which every build reads.
      return { ...l, banner: b, colour: b.from }
    })

  async function save() {
    if (!uid) return
    setSaving(true)
    try {
      const { plus } = await saveProfile(uid, details, look)
      // The colours wait for supabase/side-colours.sql and the pin for
      // supabase/pin.sql; the rest saves either way.
      const [saved, pinSaved] = await Promise.all([saveSideColours(uid, sideColours), savePin(uid, pin)])
      if (pinSaved) useCrestStore.getState().setPin({ hex: choiceHex(pin.colour) })
      const crestStore = useCrestStore.getState()
      if (saved) crestStore.setMine({ ...(crestStore.mine ?? { design: null, imagePath: null, everywhere: false }), colours: sideColours })
      useUserStore.getState().fetchProfile()
      const wantsPlus = !!(look.banner && look.banner.kind !== 'colour') || !!look.theme || (look.frame ?? 'none') !== 'none' || !!look.status || !!look.pronouns || !!look.about
      const missingSql = [...(saved ? [] : ['supabase/side-colours.sql']), ...(pinSaved ? [] : ['supabase/pin.sql']), ...(plus || !wantsPlus ? [] : ['supabase/profile-plus.sql'])]
      if (missingSql.length) { setWaiting(missingSql); return }
      router.back()
    } catch (e) {
      console.warn('[profile-edit] save failed:', e)
      setNote("Your profile couldn't be saved. Try again.")
    } finally {
      setSaving(false)
    }
  }

  const name = profile?.username ?? 'You'
  if (!uid) {
    return <KitScreen ground="cotton"><BackControl roles={roles} /><StripedNotice roles={roles}>Sign in to shape a profile.</StripedNotice></KitScreen>
  }

  return (
    <KitScreen ground="cotton">
      <PageMeta title="Edit your profile" path="/profile-edit" />
      <BackControl roles={roles} />
      <KitText t="superM" color={roles.text} accessibilityRole="header" style={styles.title}>YOUR PROFILE</KitText>
      {ready === 'loading' && <Loader color={roles.text} />}
      {ready === 'failed' && <StripedNotice roles={roles} failed>Your profile couldn't be loaded.</StripedNotice>}
      {ready === 'needs-db' && (
        <StripedNotice roles={roles}>The profile needs a database update before it can be saved (supabase/profile.sql).</StripedNotice>
      )}
      {note ? <KitText t="body" color={roles.textMuted}>{note}</KitText> : null}

      {ready === 'ok' && (
        <>
          {/* P8-178: your card, live, as others see it on your profile. */}
          <ProfileCard roles={roles} name={name} avatarPath={avatarPath} look={look}
            badgeTeamId={details.show_favourites ? details.favourite_team_id : null} badgeTeamName={details.show_favourites ? details.favourite_team_name : null} />
          {!plusReady && (
            <StripedNotice roles={roles}>The banner's gradient and picture, the theme, the frame and the about-me need supabase/profile-plus.sql run first; a plain colour works already.</StripedNotice>
          )}

          <SectionTag roles={roles}>Picture</SectionTag>
          <Plate label="Change picture" variant="secondary" roles={roles} onPress={changePicture} />
          <Chips<AvatarFrame> roles={roles} label="Frame" options={AVATAR_FRAMES} value={look.frame ?? 'none'} onChange={f => setLook(l => ({ ...l, frame: f }))} />

          <SectionTag roles={roles}>Banner</SectionTag>
          <Chips<BannerKind> roles={roles} options={BANNER_KINDS} value={look.banner?.kind ?? 'colour'}
            onChange={k => (k === 'picture' && !look.banner?.path ? changeBanner() : setBanner({ kind: k }))} />
          {(look.banner?.kind ?? 'colour') !== 'picture' ? (
            <>
              <ColourField roles={roles} label={look.banner?.kind === 'gradient' ? 'From' : 'Colour'} quick={LOOK_COLOURS} value={bannerFrom} onChange={h => setBanner({ from: h })} />
              {look.banner?.kind === 'gradient' && (
                <ColourField roles={roles} label="To" quick={LOOK_COLOURS} value={look.banner.to} onChange={h => setBanner({ to: h })} />
              )}
            </>
          ) : (
            <Plate label="Choose another picture" variant="quiet" roles={roles} onPress={changeBanner} />
          )}
          <Chips<LookEffect> roles={roles} label="Trim" options={LOOK_EFFECTS} value={look.effect} onChange={e => setLook(l => ({ ...l, effect: e }))} />

          <SectionTag roles={roles}>Profile theme</SectionTag>
          <ListRow roles={roles} label="Tint your whole card" sub="Two colours, top to bottom, behind everything on it"
            trailing={<Toggle roles={roles} label="Profile theme" value={!!look.theme}
              onChange={v => setLook(l => ({ ...l, theme: v ? { primary: '#141416', accent: '#ff5a00' } : null }))} />} />
          {look.theme && (
            <>
              <ColourField roles={roles} label="Top" quick={LOOK_COLOURS} value={look.theme.primary} onChange={h => setLook(l => ({ ...l, theme: { ...l.theme!, primary: h } }))} />
              <ColourField roles={roles} label="Bottom" quick={LOOK_COLOURS} value={look.theme.accent} onChange={h => setLook(l => ({ ...l, theme: { ...l.theme!, accent: h } }))} />
            </>
          )}

          <SectionTag roles={roles}>About you</SectionTag>
          <Field roles={roles} label={`Status · ${(look.status ?? '').length}/${LOOK_LIMITS.status}`} value={look.status ?? ''} maxLength={LOOK_LIMITS.status}
            onChangeText={v => setLook(l => ({ ...l, status: v }))} />
          <Field roles={roles} label={`Pronouns · ${(look.pronouns ?? '').length}/${LOOK_LIMITS.pronouns}`} value={look.pronouns ?? ''} maxLength={LOOK_LIMITS.pronouns}
            onChangeText={v => setLook(l => ({ ...l, pronouns: v }))} />
          <Field roles={roles} label={`About me · ${(look.about ?? '').length}/${LOOK_LIMITS.about}`} value={look.about ?? ''} maxLength={LOOK_LIMITS.about}
            multiline onChangeText={v => setLook(l => ({ ...l, about: v }))} />
          {waiting.includes('supabase/profile-plus.sql') && (
            <StripedNotice roles={roles}>Everything else is saved. The banner, theme, frame and about-me need supabase/profile-plus.sql run first, then save again.</StripedNotice>
          )}

          <SectionTag roles={roles}>Favourite team</SectionTag>
          {details.favourite_team_id && details.favourite_team_name ? (
            <View style={styles.row}>
              <ClubName roles={roles} clubId={details.favourite_team_id} name={details.favourite_team_name} size={24} t="bodyL" style={{ flex: 1 }} />
              <Plate label="Clear" variant="quiet" roles={roles} onPress={() => setDetails(d => ({ ...d, favourite_team_id: null, favourite_team_name: null }))} />
            </View>
          ) : null}
          <Field roles={roles} label="Find a club or a nation" value={query} onChangeText={setQuery} autoCorrect={false} />
          {results.map(r => (
            <Pressable key={r.id} onPress={() => { setDetails(d => ({ ...d, favourite_team_id: r.id, favourite_team_name: r.name })); setQuery('') }}
              accessibilityRole="button" style={({ pressed }) => [styles.result, { borderBottomColor: roles.rule }, pressed && { backgroundColor: roles.sunken }]}>
              <ClubName roles={roles} clubId={r.id} name={r.name} size={20} />
            </Pressable>
          ))}

          <SectionTag roles={roles}>Favourite player</SectionTag>
          <Field roles={roles} label="Anyone, from any era" value={details.favourite_player ?? ''} onChangeText={v => set('favourite_player', v || null)} maxLength={60} />

          {/* P8-142: your club's colours, on your side wherever a club's colours show. */}
          <SectionTag roles={roles}>Your club's colours</SectionTag>
          <KitText t="body" color={roles.textMuted}>Your side wears these on the match sheet, the momentum graph and the feed, in place of the club it took over.</KitText>
          <ColourField roles={roles} label="Main" quick={SIDE_SWATCHES} value={sideColours.main} onChange={v => setSideColours(c => ({ ...c, main: v }))} />
          <ColourField roles={roles} label="Second" quick={SIDE_SWATCHES} value={sideColours.second} onChange={v => setSideColours(c => ({ ...c, second: v }))} />
          {waiting.includes('supabase/side-colours.sql') && (
            <StripedNotice roles={roles}>Everything else is saved. Your club's colours need the database set up first: run supabase/side-colours.sql, then save again.</StripedNotice>
          )}
          {/* P8-168: the pin on your ID tag (its letters are your club's tag now, P8-181). */}
          <SectionTag roles={roles}>Your pin</SectionTag>
          <IdTag roles={roles} name={name} state="REG" detail="AS YOUR TAG WILL LOOK" pin={{ hex: crestHex(pin.colour) }}
            tag={profile?.club_tag ? { text: profile.club_tag, colour: crestHex(pin.colour) } : null} />
          <ColourField roles={roles} label="Pin" quick={SIDE_SWATCHES} value={pin.colour} onChange={v => setPin(p => ({ ...p, colour: v }))} />
          <KitText t="body" color={roles.textMuted}>The letters on your tag are your club's. Join one, or start one, in Clubs.</KitText>
          {waiting.includes('supabase/pin.sql') && (
            <StripedNotice roles={roles}>Everything else is saved. Your pin needs the database set up first: run supabase/pin.sql, then save again.</StripedNotice>
          )}
          {/* P8-132: your own crest has its own editor. */}
          <SectionTag roles={roles}>Your crest</SectionTag>
          <ListRow roles={roles} label="Make your crest" sub="A crest of your own on the side you field" onPress={() => router.push('/crest-edit')} />

          <SectionTag roles={roles}>{`Pinned runs · up to ${MAX_PINS}`}</SectionTag>
          {runs.length === 0 ? <KitText t="body" color={roles.textMuted}>No saved runs yet.</KitText> : (
            <>
              <Chips<'new' | 'score'> roles={roles} label="Sort" value={runSort} onChange={v => { setRunSort(v); setRunsShown(PAGE) }}
                options={[{ id: 'new', label: 'Newest' }, { id: 'score', label: 'Best score' }]} />
              {/* The pinned ones first, then the rest in the chosen order; each
                  run drawn as the label it wears everywhere else. */}
              {[...runs].sort((a, b) => Number(details.pinned_run_ids.includes(b.id)) - Number(details.pinned_run_ids.includes(a.id))
                  || (runSort === 'score' ? b.score - a.score : b.created_at.localeCompare(a.created_at)))
                .slice(0, runsShown).map(r => (
                <View key={r.id} style={styles.pinRow}>
                  <View style={{ flex: 1 }}>
                    <RunLabel roles={roles} colourway={colourwayFor(r.mode)} title={formatTier(r.tier)} meta={runMeta(r)}
                      score={r.score.toLocaleString('en-US')} verdict={verdictOf(r.tier)} />
                  </View>
                  <Toggle roles={roles} label="Pin this run" value={details.pinned_run_ids.includes(r.id)} onChange={() => toggleIn('pinned_run_ids', r.id)} />
                </View>
              ))}
              {runsShown < runs.length && (
                <Plate label={`Show more · ${runs.length - runsShown} left`} variant="quiet" roles={roles} onPress={() => setRunsShown(n => n + PAGE)} />
              )}
            </>
          )}

          <SectionTag roles={roles}>{`Trophies on display · up to ${MAX_PINS}`}</SectionTag>
          {trophies.length === 0 ? <KitText t="body" color={roles.textMuted}>Win something first.</KitText> : trophies.slice(0, trophiesShown).map(t => (
            <ListRow key={t.id} roles={roles} label={t.label}
              trailing={<Toggle roles={roles} label="Show this trophy" value={details.shown_achievements.includes(t.id)} onChange={() => toggleIn('shown_achievements', t.id)} />} />
          ))}

          {trophiesShown < trophies.length && (
            <Plate label={`Show more · ${trophies.length - trophiesShown} left`} variant="quiet" roles={roles} onPress={() => setTrophiesShown(n => n + PAGE)} />
          )}

          <SectionTag roles={roles}>Who sees what</SectionTag>
          <KitText t="body" color={roles.textMuted}>Your name, picture, rank and runs on the Ranks are always public. These sections are yours to show or hide.</KitText>
          <ListRow roles={roles} label="Pinned runs" trailing={<Toggle roles={roles} label="Show pinned runs" value={details.show_runs} onChange={v => set('show_runs', v)} />} />
          <ListRow roles={roles} label="Trophies on display" trailing={<Toggle roles={roles} label="Show trophies" value={details.show_achievements} onChange={v => set('show_achievements', v)} />} />
          <ListRow roles={roles} label="Playing time" trailing={<Toggle roles={roles} label="Show playing time" value={details.show_playtime} onChange={v => set('show_playtime', v)} />} />
          <ListRow roles={roles} label="Favourites, and the badge by your name" trailing={<Toggle roles={roles} label="Show favourites" value={details.show_favourites} onChange={v => set('show_favourites', v)} />} />

          <Plate label={saving ? 'Saving…' : 'Save your profile'} icon="check" roles={roles} onPress={() => { if (!saving) save() }} style={styles.save} />
        </>
      )}
    </KitScreen>
  )
}

const styles = StyleSheet.create({
  title: { marginTop: space[2], marginBottom: space[3] },
  row: { flexDirection: 'row', alignItems: 'center', gap: space[3] },
  result: { minHeight: 44, justifyContent: 'center', borderBottomWidth: border.hair },
  save: { marginTop: space[5] },
  pinRow: { flexDirection: 'row', alignItems: 'center', gap: space[2] },
})
