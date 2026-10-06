import React, { useState } from 'react'
import { t, num } from '@/i18n'
import { View, StyleSheet } from 'react-native'
import { type Roles, space, border, prim, POT_COLOURS } from '@/theme'
import { KitText, Field, Chips, ColourField, Plate, StripedNotice, ListRow, Toggle } from '@/components/kit'
import { ratio, inkOn } from '@/lib/contrast'
import { CLUB_LIMITS, MEMBER_LIMITS, cleanTag, type Club, type ClubInput, type ClubAccess } from '@/db/queries/clubs'

// P8-181: a club, drawn the same way wherever it appears — its tag as a chip
// in the club's colour, and its header on the club's page and the Clubs screen.

/** The tag in the club's colour, its letters in whichever of ink or cotton reads on it. */
export function ClubTag({ tag, colour, size = 'sm' }: { tag: string; colour: string; size?: 'sm' | 'lg' }) {
  const ink = inkOn(colour, prim.ink, prim.cotton)
  return (
    <View style={[styles.tag, size === 'lg' && styles.tagLg, { backgroundColor: colour, borderColor: prim.ink }]} accessible accessibilityLabel={t('clubs.tagA11y', { tag })}>
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
            <KitText t="figureL" color={roles.text}>{num(score.score)}</KitText>
            <KitText t="tag" color={roles.textMuted}>{t('clubs.headerScore', { count: score.runs })}</KitText>
          </View>
        ) : null}
        <KitText t="tag" color={roles.textMuted}>
          {t('clubs.headerMembers', { count: members }) + (club.member_limit ? t('clubs.headerOf', { limit: club.member_limit }) : t('clubs.headerNoLimit'))}
        </KitText>
        {club.about ? <KitText t="body" color={roles.text}>{club.about}</KitText> : null}
      </View>
    </View>
  )
}

// A few ready colours for a club, the palette's own; any other through the picker.
const CLUB_COLOURS = [
  { id: 'orange', label: t('clubs.orange'), hex: prim.orange }, { id: 'volt', label: t('clubs.volt'), hex: prim.volt },
  { id: 'red', label: t('clubs.red'), hex: prim.misery }, { id: 'gold', label: t('clubs.gold'), hex: prim.gold },
  { id: 'blue', label: t('clubs.blue'), hex: POT_COLOURS[4] }, { id: 'violet', label: t('clubs.violet'), hex: POT_COLOURS[2] },
  { id: 'green', label: t('clubs.green'), hex: POT_COLOURS[3] }, { id: 'ink', label: t('clubs.ink'), hex: prim.ink },
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
  const tagText = cleanTag(tag)
  const ok = cleanName.length >= CLUB_LIMITS.name[0] && cleanName.length <= CLUB_LIMITS.name[1] && tagText.length >= CLUB_LIMITS.tag[0]
    && (!needsPassword || password.length >= 4) && (password.length === 0 || password.length >= 4)
  const submit = async () => {
    if (!ok || busy) return
    setBusy(true)
    try { await onSubmit({ name: cleanName, tag: tagText, colour, about: about.trim(), limit: MEMBER_LIMITS.find(l => l.id === limit)?.value ?? null, access, password: password || undefined, cleanChat: clean }) }
    finally { setBusy(false) }
  }
  return (
    <View style={styles.form}>
      <View style={styles.preview}>
        <ClubTag tag={tagText || t('clubs.tagPlaceholder')} colour={colour} size="lg" />
        <KitText t="title" color={roles.text} numberOfLines={1} style={{ flex: 1 }}>{cleanName || t('clubs.yourClub')}</KitText>
      </View>
      <Field roles={roles} label={t('clubs.nameLabel', { min: CLUB_LIMITS.name[0], max: CLUB_LIMITS.name[1] })} value={name} maxLength={CLUB_LIMITS.name[1]} onChangeText={setName} />
      {/* The field keeps what's typed (rewriting it under Android's keyboard doubled
          letters, P8-168); the tag it becomes is the preview's. */}
      <Field roles={roles} label={t('clubs.tagLabel')} value={tag} maxLength={CLUB_LIMITS.tag[1]} autoCapitalize="characters" autoCorrect={false} onChangeText={setTag} />
      <ColourField roles={roles} label={t('clubs.colour')} quick={CLUB_COLOURS} value={colour} onChange={setColour} />
      <Field roles={roles} label={t('clubs.aboutLabel', { used: about.length, max: CLUB_LIMITS.about })} value={about} maxLength={CLUB_LIMITS.about} multiline onChangeText={setAbout} />
      <Chips roles={roles} label={t('clubs.members')} options={MEMBER_LIMITS.map(l => ({ id: l.id, label: l.label }))} value={limit} onChange={setLimit} />
      <Chips<ClubAccess> roles={roles} label={t('clubs.whoCanJoin')} value={access} onChange={setAccess}
        options={[{ id: 'open', label: t('clubs.anyone') }, { id: 'invite', label: t('clubs.inviteOnly') }, { id: 'password', label: t('clubs.password') }]} />
      {access === 'password' && (
        <Field roles={roles} label={initial?.access === 'password' ? t('clubs.newPassword') : t('clubs.passwordRange')}
          value={password} onChangeText={setPassword} secure autoCapitalize="none" autoCorrect={false} maxLength={64} />
      )}
      <ListRow roles={roles} label={t('clubs.cleanChat')} sub={t('clubs.cleanChatSub')}
        trailing={<Toggle roles={roles} label={t('clubs.cleanChat')} value={clean} onChange={setClean} />} />
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
