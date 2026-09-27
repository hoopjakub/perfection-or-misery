import React, { useEffect, useState } from 'react'
import { View, Pressable, StyleSheet } from 'react-native'
import { router } from 'expo-router'
import { KitScreen, KitText, SectionTag, BackControl, Plate, Field, Chips, Toggle, ListRow, ClubName, StripedNotice, Loader, RunLabel, Swatches, crestHex } from '@/components/kit'
import { CREST_COLOURS, type SideColours } from '@/lib/yourCrest'
import { useCrestStore } from '@/store/crestStore'
import { PageMeta } from '@/components/PageMeta'
import { Avatar, LookBand, LOOK_COLOURS, LOOK_EFFECTS } from '@/components/profile/ProfileParts'
import {
  fetchOwnDetails, saveProfile, pickAvatar, uploadAvatar, searchTeams, earnedTrophies, EMPTY_DETAILS, fetchCrest, saveSideColours,
  type ProfileDetails, type ProfileLook, type LookEffect,
} from '@/db/queries/profile'
import { fetchRunHistory, fetchAchievementRuns, type RunHistoryEntry } from '@/db/queries/leaderboard'
import { formatTier, runMeta, verdictOf } from '@/data/tiers'
import { useUserStore } from '@/store/userStore'
import { ROLES, space, border, colourwayFor } from '@/theme'

// P8-88: shaping your profile — your picture, the team you support and your
// favourite player, the look of the page, what others may see, and the runs
// and trophies you put on show. Saved in one go.
const roles = ROLES.cotton
const MAX_PINS = 3
const SIDE_SWATCHES = CREST_COLOURS.map(c => ({ ...c, hex: crestHex(c.id) }))
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
  const [coloursNeedDb, setColoursNeedDb] = useState(false)

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
        setDetails(own.details); setLook(own.look); setAvatarPath(own.avatarPath)
        const crest = await fetchCrest(uid)
        if (active && crest?.colours) setSideColours(crest.colours)
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

  async function save() {
    if (!uid) return
    setSaving(true)
    try {
      await saveProfile(uid, details, look)
      // The colours wait for supabase/side-colours.sql; the rest saves either way.
      const saved = await saveSideColours(uid, sideColours)
      const crestStore = useCrestStore.getState()
      if (saved) crestStore.setMine({ ...(crestStore.mine ?? { design: null, imagePath: null, everywhere: false }), colours: sideColours })
      useUserStore.getState().fetchProfile()
      if (!saved) { setColoursNeedDb(true); return }
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
          <SectionTag roles={roles}>Picture</SectionTag>
          <View style={styles.row}>
            <Avatar roles={roles} path={avatarPath} name={name} size={64} />
            <Plate label="Change picture" variant="secondary" roles={roles} onPress={changePicture} />
          </View>

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
          <Swatches roles={roles} label="Main" options={SIDE_SWATCHES} value={sideColours.main} onChange={v => setSideColours(c => ({ ...c, main: v }))} />
          <Swatches roles={roles} label="Second" options={SIDE_SWATCHES} value={sideColours.second} onChange={v => setSideColours(c => ({ ...c, second: v }))} />
          {coloursNeedDb && (
            <StripedNotice roles={roles}>Everything else is saved. Your club's colours need the database set up first: run supabase/side-colours.sql, then save again.</StripedNotice>
          )}
          {/* P8-132: your own crest has its own editor. */}
          <SectionTag roles={roles}>Your crest</SectionTag>
          <ListRow roles={roles} label="Make your crest" sub="A crest of your own on the side you field" onPress={() => router.push('/crest-edit')} />
          <SectionTag roles={roles}>The look</SectionTag>
          <LookBand roles={roles} colour={look.colour} effect={look.effect} />
          <Chips roles={roles} label="Colour" options={LOOK_COLOURS.map(c => ({ id: c.id, label: c.label }))} value={look.colour} onChange={c => setLook(l => ({ ...l, colour: c }))} />
          <Chips<LookEffect> roles={roles} label="Trim" options={LOOK_EFFECTS} value={look.effect} onChange={e => setLook(l => ({ ...l, effect: e }))} />

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
