import React, { useState } from 'react'
import { View, StyleSheet } from 'react-native'
import { type Roles, space, border, prim, POT_COLOURS } from '@/theme'
import { KitText, Field, Chips, ColourField, Plate, StripedNotice, ListRow, Toggle } from '@/components/kit'
import { ratio } from '@/lib/contrast'
import { CLUB_LIMITS, MEMBER_LIMITS, cleanTag, type Club, type ClubInput, type ClubAccess } from '@/db/queries/clubs'

// P8-181: a club, drawn the same way wherever it appears — its tag as a chip
// in the club's colour, and its header on the club's page and the Clubs screen.

/** The tag in the club's colour, its letters in whichever of ink or cotton reads on it. */
export function ClubTag({ tag, colour, size = 'sm' }: { tag: string; colour: string; size?: 'sm' | 'lg' }) {
  const ink = ratio(prim.ink, colour) >= ratio(prim.cotton, colour) ? prim.ink : prim.cotton
  return (
    <View style={[styles.tag, size === 'lg' && styles.tagLg, { backgroundColor: colour, borderColor: prim.ink }]} accessible accessibilityLabel={`Club tag ${tag}`}>
      <KitText t={size === 'lg' ? 'superS' : 'tag'} color={ink}>{tag}</KitText>
    </View>
  )
}

export function ClubHeader({ roles, club, members, score }: {
  roles: Roles; club: Club; members: number
  /** P8.5-45: every member's runs added together, when it's known. */
  score?: { score: number; runs: number } | null
}) {
  return (
    <View style={[styles.head, { borderColor: roles.line, backgroundColor: roles.surface }]}>
      <View style={[styles.band, { backgroundColor: club.colour }]} />
      <View style={styles.headBody}>
        <View style={styles.headTop}>
          <ClubTag tag={club.tag} colour={club.colour} size="lg" />
          <KitText t="superS" color={roles.text} numberOfLines={2} style={{ flex: 1 }}>{club.name.toUpperCase()}</KitText>
        </View>
        {score ? (
          <View style={styles.score}>
            <KitText t="figureL" color={roles.text}>{score.score.toLocaleString('en-US')}</KitText>
            <KitText t="tag" color={roles.textMuted}>{`PTS · ${score.runs} RUN${score.runs === 1 ? '' : 'S'}`}</KitText>
          </View>
        ) : null}
        <KitText t="tag" color={roles.textMuted}>
          {`${members} MEMBER${members === 1 ? '' : 'S'}${club.member_limit ? ` OF ${club.member_limit}` : ' · NO LIMIT'}`}
        </KitText>
        {club.about ? <KitText t="body" color={roles.text}>{club.about}</KitText> : null}
      </View>
    </View>
  )
}

// A few ready colours for a club, the palette's own; any other through the picker.
const CLUB_COLOURS = [
  { id: 'orange', label: 'Orange', hex: prim.orange }, { id: 'volt', label: 'Volt', hex: prim.volt },
  { id: 'red', label: 'Red', hex: prim.misery }, { id: 'gold', label: 'Gold', hex: prim.gold },
  { id: 'blue', label: 'Blue', hex: POT_COLOURS[4] }, { id: 'violet', label: 'Violet', hex: POT_COLOURS[2] },
  { id: 'green', label: 'Green', hex: POT_COLOURS[3] }, { id: 'ink', label: 'Ink', hex: prim.ink },
]

/** Creating a club, or its owner editing it: name, tag, colour, a line about it,
 *  a member limit, and (P8.5-45) who can join and the chat's clean language. */
export function ClubForm({ roles, initial, submitLabel, onSubmit, error }: {
  roles: Roles
  initial?: Club | null
  submitLabel: string
  onSubmit: (input: ClubInput) => Promise<void>
  error?: string | null
}) {
  const [name, setName] = useState(initial?.name ?? '')
  const [tag, setTag] = useState(initial?.tag ?? '')
  const [colour, setColour] = useState(initial?.colour ?? '#ff5a00')
  const [about, setAbout] = useState(initial?.about ?? '')
  const [limit, setLimit] = useState(MEMBER_LIMITS.find(l => l.value === (initial?.member_limit ?? null))?.id ?? 'none')
  const [access, setAccess] = useState<ClubAccess>(initial?.access ?? 'open')
  const [password, setPassword] = useState('')
  const [clean, setClean] = useState(initial?.clean_chat ?? true)
  // A club that already has a password keeps it unless a new one is typed.
  const needsPassword = access === 'password' && initial?.access !== 'password'
  const [busy, setBusy] = useState(false)
  const cleanName = name.trim()
  const t = cleanTag(tag)
  const ok = cleanName.length >= CLUB_LIMITS.name[0] && cleanName.length <= CLUB_LIMITS.name[1] && t.length >= CLUB_LIMITS.tag[0]
    && (!needsPassword || password.length >= 4) && (password.length === 0 || password.length >= 4)
  const submit = async () => {
    if (!ok || busy) return
    setBusy(true)
    try { await onSubmit({ name: cleanName, tag: t, colour, about: about.trim(), limit: MEMBER_LIMITS.find(l => l.id === limit)?.value ?? null, access, password: password || undefined, cleanChat: clean }) }
    finally { setBusy(false) }
  }
  return (
    <View style={styles.form}>
      <View style={styles.preview}>
        <ClubTag tag={t || 'TAG'} colour={colour} size="lg" />
        <KitText t="title" color={roles.text} numberOfLines={1} style={{ flex: 1 }}>{cleanName || 'Your club'}</KitText>
      </View>
      <Field roles={roles} label={`Name · ${CLUB_LIMITS.name[0]} to ${CLUB_LIMITS.name[1]} letters`} value={name} maxLength={CLUB_LIMITS.name[1]} onChangeText={setName} />
      {/* The field keeps what's typed (rewriting it under Android's keyboard doubled
          letters, P8-168); the tag it becomes is the preview's. */}
      <Field roles={roles} label="Tag · 2 to 4 letters or digits" value={tag} maxLength={CLUB_LIMITS.tag[1]} autoCapitalize="characters" autoCorrect={false} onChangeText={setTag} />
      <ColourField roles={roles} label="Colour" quick={CLUB_COLOURS} value={colour} onChange={setColour} />
      <Field roles={roles} label={`About · ${about.length}/${CLUB_LIMITS.about}`} value={about} maxLength={CLUB_LIMITS.about} multiline onChangeText={setAbout} />
      <Chips roles={roles} label="Members" options={MEMBER_LIMITS.map(l => ({ id: l.id, label: l.label }))} value={limit} onChange={setLimit} />
      <Chips<ClubAccess> roles={roles} label="Who can join" value={access} onChange={setAccess}
        options={[{ id: 'open', label: 'Anyone' }, { id: 'invite', label: 'Invite only' }, { id: 'password', label: 'Password' }]} />
      {access === 'password' && (
        <Field roles={roles} label={initial?.access === 'password' ? 'A new password (leave empty to keep it)' : 'Password · 4 to 64'}
          value={password} onChangeText={setPassword} secure autoCapitalize="none" autoCorrect={false} maxLength={64} />
      )}
      <ListRow roles={roles} label="Clean language in the chat" sub="Swearing is swapped for something politer. Turn it off for close friends."
        trailing={<Toggle roles={roles} label="Clean language in the chat" value={clean} onChange={setClean} />} />
      {error ? <StripedNotice roles={roles} failed>{error}</StripedNotice> : null}
      <Plate label={submitLabel} icon="check" roles={roles} disabled={!ok} loading={busy} onPress={submit} />
    </View>
  )
}

const styles = StyleSheet.create({
  tag: { paddingHorizontal: 6, paddingVertical: 1, borderWidth: border.thin, alignSelf: 'flex-start' },
  tagLg: { paddingHorizontal: 8, paddingVertical: 2 },
  head: { borderWidth: border.plate, flexDirection: 'row', overflow: 'hidden' },
  band: { width: 10 },
  headBody: { flex: 1, padding: space[3], gap: space[1] },
  headTop: { flexDirection: 'row', alignItems: 'center', gap: space[2] },
  form: { gap: space[2] },
  preview: { flexDirection: 'row', alignItems: 'center', gap: space[2], marginBottom: space[1] },
  score: { flexDirection: 'row', alignItems: 'baseline', gap: space[2] },
})
