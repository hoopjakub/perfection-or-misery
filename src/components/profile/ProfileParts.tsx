import React, { useEffect, useState } from 'react'
import { router } from 'expo-router'
import { View, Image, Pressable, StyleSheet, type StyleProp, type ViewStyle } from 'react-native'
import { type Roles, space, border, prim } from '@/theme'
import { KitText, TeamMark, Tape, Stripe, Rivets, Tag, Twinkle } from '@/components/kit'
import { BADGE_TIERS, seasonDates } from '@/data/seasons'
import type { SeasonBadge } from '@/db/queries/leaderboard'
import { ordinal } from '@/lib/format'
import { avatarUrl, fetchPublicProfile, type LookEffect, type PublicProfile } from '@/db/queries/profile'
import { useUserStore } from '@/store/userStore'
import { crestInitials } from '@/lib/brand'

// P8-88 / P8-89: how a player appears — their picture, their name and the
// badge of the team they support — wherever a name is shown: the You tab, a
// profile page, the owner line on someone else's run, the Ranks.

// A square, like every mark in the kit (radius 0). No picture: the initials.
export function Avatar({ roles, path, name, size = 40 }: { roles: Roles; path?: string | null; name: string; size?: number }) {
  const uri = avatarUrl(path)
  return (
    <View style={[{ width: size, height: size, borderColor: roles.line, backgroundColor: roles.sunken }, styles.avatar]}
      accessible accessibilityLabel={`${name}'s picture`}>
      {uri
        ? <Image source={{ uri }} style={{ width: size, height: size }} resizeMode="cover" accessibilityIgnoresInvertColors />
        : <KitText t="tag" color={roles.textMuted}>{crestInitials(name).slice(0, 2)}</KitText>}
    </View>
  )
}

/** A player as picture, name and the badge of their favourite team. */
export function PlayerName({ roles, name, avatarPath, badgeTeamId, badgeTeamName, size = 24, onPress, style }: {
  roles: Roles
  name: string
  avatarPath?: string | null
  badgeTeamId?: string | null
  badgeTeamName?: string | null
  size?: 24 | 40 | 64
  onPress?: () => void
  style?: StyleProp<ViewStyle>
}) {
  const body = (
    <>
      <Avatar roles={roles} path={avatarPath} name={name} size={size} />
      <KitText t={size >= 40 ? 'title' : 'body'} color={roles.text} numberOfLines={1} style={{ flexShrink: 1 }}>{name}</KitText>
      {badgeTeamId && badgeTeamName ? <TeamMark roles={roles} clubId={badgeTeamId} name={badgeTeamName} size={16} /> : null}
    </>
  )
  return onPress
    ? <Pressable onPress={onPress} accessibilityRole="link" accessibilityLabel={`${name}, open profile`}
        style={({ pressed }) => [styles.name, style, pressed && { opacity: 0.7 }]}>{body}</Pressable>
    : <View style={[styles.name, style]}>{body}</View>
}

// The look's colours: tokens from the palette (P8-74), never a free hex.
export const LOOK_COLOURS: { id: string; label: string; hex: string }[] = [
  { id: 'ink', label: 'Ink', hex: prim.ink },
  { id: 'pitch', label: 'Pitch', hex: prim.pitch },
  { id: 'orange', label: 'Orange', hex: prim.orange },
  { id: 'volt', label: 'Volt', hex: prim.volt },
  { id: 'gold', label: 'Gold', hex: prim.gold },
  { id: 'label', label: 'Label', hex: prim.label },
]
export const LOOK_EFFECTS: { id: LookEffect; label: string }[] = [
  { id: 'none', label: 'Plain' }, { id: 'tape', label: 'Tape' }, { id: 'stripe', label: 'Stripe' },
  { id: 'rivets', label: 'Rivets' }, { id: 'stitch', label: 'Stitched' },
]

/** The profile's backdrop: a band in the chosen colour, finished with one of
 *  the kit's garment trims. Nothing is written on it, so any colour reads. */
export function LookBand({ roles, colour, effect, height = 72 }: { roles: Roles; colour?: string | null; effect?: string | null; height?: number }) {
  const hex = LOOK_COLOURS.find(c => c.id === colour)?.hex ?? prim.ink
  return (
    <View style={[styles.band, { height, backgroundColor: hex, borderColor: roles.line }, effect === 'stitch' && styles.stitch]} accessible={false}>
      {effect === 'tape' && <Tape colours={[prim.orange, prim.cotton, prim.ink]} roles={roles} style={styles.bandTape} />}
      {effect === 'stripe' && <Stripe roles={roles} band={6} style={styles.bandStripe} />}
      {/* Rivets in ink on the light colours, in cotton on the dark ones. */}
      {effect === 'rivets' && <Rivets color={['volt', 'gold', 'label'].includes(colour ?? '') ? prim.ink : prim.cotton} />}
    </View>
  )
}

const styles = StyleSheet.create({
  avatar: { borderWidth: border.thin, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  name: { flexDirection: 'row', alignItems: 'center', gap: space[2], minHeight: 44 },
  owner: { flexDirection: 'row', alignItems: 'center', gap: space[2], marginBottom: space[2] },
  band: { borderWidth: border.thin, overflow: 'hidden', justifyContent: 'flex-end' },
  // The stitched edge: a dashed seam just inside the border.
  stitch: { borderStyle: 'dashed', borderWidth: border.plate, borderColor: prim.cotton },
  bandTape: { position: 'absolute', left: 0, right: 0, bottom: 0 },
  bandStripe: { position: 'absolute', left: 0, right: 0, bottom: 0, height: 12 },
})

// ── Whose run (P8-89) ─────────────────────────────────────────────────────────
export type RunOwner = { id: string; name: string; yours: boolean; avatarPath?: string | null; badgeTeamId?: string | null; badgeTeamName?: string | null }

/** The owner of a run: the saved run's user, or you for the run you just
 *  played. null for a guest's live run (nobody to name). */
export function useRunOwner(ownerId?: string | null): RunOwner | null {
  const me = useUserStore(st => (st.isGuest ? null : st.user?.id ?? null))
  const myName = useUserStore(st => st.profile?.username ?? null)
  const id = ownerId ?? me
  const [p, setP] = useState<PublicProfile | null>(null)
  useEffect(() => {
    if (!id) return
    let active = true
    fetchPublicProfile(id).then(r => { if (active) setP(r) }).catch(e => console.warn('[run owner] failed:', e))
    return () => { active = false }
  }, [id])
  if (!id) return null
  return {
    id, yours: id === me,
    name: p?.username ?? (id === me ? myName : null) ?? 'Player',
    avatarPath: p?.avatar_path, badgeTeamId: p?.badge_team_id, badgeTeamName: p?.badge_team_name,
  }
}

/** At the top of a run's page: whose run it is, a tap from their profile. */
export function RunOwnerLine({ roles, owner }: { roles: Roles; owner: RunOwner | null }) {
  if (!owner) return null
  return (
    <View style={styles.owner}>
      <Tag roles={roles} variant={owner.yours ? 'you' : 'data'}>{owner.yours ? 'YOUR RUN' : 'RUN BY'}</Tag>
      <PlayerName roles={roles} name={owner.name} avatarPath={owner.avatarPath} badgeTeamId={owner.badgeTeamId}
        badgeTeamName={owner.badgeTeamName} onPress={() => router.push({ pathname: '/u/[id]', params: { id: owner.id } })} style={{ flexShrink: 1 }} />
    </View>
  )
}

// ── Season badges (P8-152) ───────────────────────────────────────────────────
// One badge per season played: the season's name, number and dates, the tier
// its best run earned, and the place, as the maintainer's sketch has it. Each
// tier has its own look: four bands, darkest-to-brightest as the tier rises
// (label grey, nylon, pitch, volt: Perfection), and one to three bars within
// a band, so TOP 50 and TOP 30 differ at a glance, not just by the number.
// Taking part is plain cotton. First place also gets the twinkle.
const BANDS = [
  { bg: prim.label, text: prim.ink, muted: prim.inkMuted, bar: prim.ink },
  { bg: prim.nylon, text: prim.cotton, muted: prim.cottonMuted, bar: prim.cotton },
  { bg: prim.pitch, text: prim.cotton, muted: prim.cottonMuted, bar: prim.volt },
  { bg: prim.volt, text: prim.ink, muted: prim.ink, bar: prim.ink },
] as const
const TOOK_PART = { bg: prim.cotton, text: prim.ink, muted: prim.inkMuted, bar: prim.ink }

export function SeasonBadgeCard({ roles, badge }: { roles: Roles; badge: SeasonBadge }) {
  const i = badge.tier != null ? BADGE_TIERS.indexOf(badge.tier) : -1
  const look = i >= 0 ? BANDS[Math.floor(i / 3)] : TOOK_PART
  const bars = i >= 0 ? (i % 3) + 1 : 0
  const { season } = badge
  return (
    <View style={[badgeStyles.badge, { backgroundColor: look.bg, borderColor: roles.line }, badge.live && badgeStyles.badgeLive]}
      accessible accessibilityLabel={`${season.name}, season ${season.n}, ${badge.tier ? `top ${badge.tier}` : 'took part'}, ${ordinal(badge.place)}${badge.live ? ', so far' : ''}`}>
      <View style={badgeStyles.badgeBars}>
        {Array.from({ length: bars }, (_, b) => <View key={b} style={[badgeStyles.badgeBar, { backgroundColor: look.bar }]} />)}
        {badge.tier === 1 && <Twinkle />}
      </View>
      <KitText t="title" color={look.text} numberOfLines={2}>{season.name}</KitText>
      <KitText t="tag" color={look.muted}>{`SEASON ${season.n}`}</KitText>
      <KitText t="tag" color={look.muted}>{seasonDates(season)}</KitText>
      <KitText t="superM" color={look.text} style={badgeStyles.badgeTier}>{badge.tier ? `TOP ${badge.tier}` : 'TOOK PART'}</KitText>
      <KitText t="figure" color={look.text}>{`#${badge.place}`}</KitText>
      {/* Plain text, not a Tag: a tag is drawn for the cotton ground and would vanish on the dark bands. */}
      {badge.live && <KitText t="tag" color={look.muted} style={badgeStyles.badgeTag}>SO FAR · LIVE SEASON</KitText>}
    </View>
  )
}

const badgeStyles = StyleSheet.create({
  badge: { width: 168, padding: space[3], gap: 2, borderWidth: border.thin },
  // The live season's badge isn't earned yet: a dashed seam says so.
  badgeLive: { borderStyle: 'dashed' },
  badgeBars: { flexDirection: 'row', alignItems: 'center', gap: 4, minHeight: 16, marginBottom: space[1] },
  badgeBar: { width: 18, height: 6 },
  badgeTier: { marginTop: space[2] },
  badgeTag: { marginTop: space[2] },
})
