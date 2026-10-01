import React, { useCallback, useState } from 'react'
import { View, StyleSheet } from 'react-native'
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router'
import { KitScreen, KitText, SectionTag, BackControl, Plate, Tag, ClubName, RunLabel, InlineError, EmptyState, ListRow } from '@/components/kit'
import { fetchClubOf, type Club } from '@/db/queries/clubs'
import { PageMeta } from '@/components/PageMeta'
import { ProfileCard, SeasonBadgeCard } from '@/components/profile/ProfileParts'
import { fetchPublicProfile, fetchRunsByIds, formatPlaytime, trophyLabel, readLook, type PublicProfile } from '@/db/queries/profile'
import { fetchMyPlace, fetchUserStats, fetchSeasonBadges, type UserStats, type SeasonBadge } from '@/db/queries/leaderboard'
import { formatTier, verdictOf, runMeta } from '@/data/tiers'
import { ordinal } from '@/lib/format'
import { runRoute } from '@/lib/nav'
import { useUserStore } from '@/store/userStore'
import { relationshipWith, sendFriendRequest, respondToRequest, removeFriend, type Relationship } from '@/lib/friends'
import { openConfirm } from '@/lib/confirm'
import { ROLES, space, colourwayFor } from '@/theme'
import { EVERYDAY } from '@/lib/appearance'
import { OfflineNotice } from '@/components/OfflineStrip'

// P8-88: a player's profile — yours, or anyone's you reach from Ranks, a
// friend or a run (P8-89). What it shows past the name is what the owner made
// visible: the database's public_profile() returns a hidden section as null,
// and the page leaves it out rather than saying it's hidden.
const roles = ROLES[EVERYDAY]

export default function ProfileScreen() {
  const { id } = useLocalSearchParams<{ id: string }>()
  const me = useUserStore(s => (s.isGuest ? null : s.user?.id ?? null))
  const [profile, setProfile] = useState<PublicProfile | null>(null)
  const [stats, setStats] = useState<UserStats | null>(null)
  const [place, setPlace] = useState<number | null>(null)
  const [pins, setPins] = useState<any[]>([])
  const [badges, setBadges] = useState<SeasonBadge[]>([])
  const [club, setClub] = useState<Club | null>(null)
  const [state, setState] = useState<'loading' | 'ready' | 'failed' | 'missing'>('loading')
  const [attempt, setAttempt] = useState(0)

  useFocusEffect(useCallback(() => {
    let active = true
    ;(async () => {
      try {
        const p = await fetchPublicProfile(id)
        if (!active) return
        if (!p) { setState('missing'); return }
        setProfile(p)
        setState('ready')
        const [s, rank, runs, seasons, clubOf] = await Promise.all([
          fetchUserStats(id).catch(() => null),
          fetchMyPlace(id, {}).catch(() => null),
          fetchRunsByIds(p.pinned_run_ids ?? []).catch(() => []),
          fetchSeasonBadges(id).catch(e => { console.warn('[profile] season badges failed:', e); return [] }),
          fetchClubOf(id).catch(() => null),
        ])
        if (!active) return
        setStats(s); setPlace(rank?.place ?? null); setPins(runs); setBadges(seasons); setClub(clubOf)
      } catch (e) {
        console.warn('[profile] load failed:', e)
        if (active) setState('failed')
      }
    })()
    return () => { active = false }
  }, [id, attempt]))

  const name = profile?.username ?? 'Player'
  const own = !!me && me === id

  return (
    <KitScreen ground={EVERYDAY}>
      <PageMeta title={`${name}'s profile`} path={`/u/${id}`} />
      <OfflineNotice />
      <BackControl roles={roles} />
      {state === 'loading' ? (
        <KitText t="bodyL" color={roles.textMuted} style={styles.top}>Finding the player.</KitText>
      ) : state === 'failed' ? (
        <InlineError roles={roles} message="This profile couldn't be loaded." onRetry={() => { setState('loading'); setAttempt(a => a + 1) }} />
      ) : state === 'missing' || !profile ? (
        <EmptyState roles={roles} title="No such player" body="This profile doesn't exist, or the account was deleted." />
      ) : (
        <>
          {/* P8-178: the player's card, Discord's way: banner, framed picture,
              name and badge, pronouns, status and about-me, on their own theme. */}
          <ProfileCard roles={roles} name={name} avatarPath={profile.avatar_path} look={readLook(profile)}
            badgeTeamId={profile.badge_team_id} badgeTeamName={profile.badge_team_name} tag={club?.tag} />
          {club ? (
            <ListRow roles={roles} label={club.name} sub={`Their club · ${club.tag}`} onPress={() => router.push({ pathname: '/club/[id]', params: { id: club.id } })} />
          ) : null}
          {own && (
            <View style={styles.actions}>
              <Plate label="Edit your profile" variant="secondary" roles={roles} onPress={() => router.push('/profile-edit')} />
              <Plate label="Friends" variant="secondary" roles={roles} onPress={() => router.push('/friends')} />
            </View>
          )}
          {/* P8-90: where you stand with this player, and the one thing to do about it. */}
          {!!me && !own && <FriendButton id={id} name={name} />}

          <SectionTag roles={roles}>Record</SectionTag>
          <View style={styles.record}>
            {place != null && <Fact label="World rank" value={ordinal(place)} />}
            {stats?.bestTier && <Fact label="Best" value={formatTier(stats.bestTier)} />}
            <Fact label="Runs" value={String(profile.runs_played ?? stats?.totalRuns ?? 0)} />
            {/* Only runs saved since P8-88 carry their length; with none yet, say nothing rather than "0 min". */}
            {!!profile.playtime_seconds && <Fact label="Played" value={formatPlaytime(profile.playtime_seconds)} />}
          </View>

          {/* P8-152: a badge for every season played, the live one marked as so far. */}
          {badges.length > 0 && (
            <>
              <SectionTag roles={roles}>Seasons</SectionTag>
              <View style={styles.badges}>
                {badges.map(b => <SeasonBadgeCard key={b.season.n} roles={roles} badge={b} />)}
              </View>
            </>
          )}

          {(profile.favourite_team_id || profile.favourite_player) ? (
            <>
              <SectionTag roles={roles}>Favourites</SectionTag>
              {profile.favourite_team_id && profile.favourite_team_name
                ? <ClubName roles={roles} clubId={profile.favourite_team_id} name={profile.favourite_team_name} size={24} t="bodyL" />
                : null}
              {profile.favourite_player ? <KitText t="bodyL" color={roles.text}>{profile.favourite_player}</KitText> : null}
            </>
          ) : null}

          {pins.length > 0 && (
            <>
              <SectionTag roles={roles}>Pinned runs</SectionTag>
              <View style={styles.pins}>
                {pins.map(run => (
                  <RunLabel key={run.id} roles={roles} colourway={colourwayFor(run.mode)} title={formatTier(run.tier)}
                    meta={runMeta(run)} score={run.score.toLocaleString('en-US')} verdict={verdictOf(run.tier)}
                    onPress={() => router.push({ pathname: runRoute(run.mode), params: { runId: run.id } })} />
                ))}
              </View>
            </>
          )}

          {(profile.shown_achievements?.length ?? 0) > 0 && (
            <>
              <SectionTag roles={roles}>On display</SectionTag>
              <View style={styles.trophies}>
                {profile.shown_achievements!.map(t => <Tag key={t} roles={roles} variant="win">{trophyLabel(t).toUpperCase()}</Tag>)}
              </View>
            </>
          )}

          {/* P8.5-44: at the foot, quiet, so it's there when needed and not in the way. */}
          {!own && (
            <Plate label="Report this player" variant="quiet" roles={roles} style={styles.report}
              onPress={() => router.push({ pathname: '/report', params: { type: 'player', id, name } })} />
          )}
        </>
      )}
    </KitScreen>
  )
}

function FriendButton({ id, name }: { id: string; name: string }) {
  const [rel, setRel] = useState<{ state: Relationship; requestId?: string } | null>(null)
  const [note, setNote] = useState<string | null>(null)
  const load = useCallback(() => { relationshipWith(id).then(setRel).catch(e => console.warn('[profile] friendship failed:', e)) }, [id])
  useFocusEffect(load)
  const run = async (fn: () => Promise<unknown>, done: string) => {
    try { await fn(); setNote(done); load() }
    catch (e) { console.warn('[profile] friend action failed:', e); setNote("That didn't go through. Try again.") }
  }
  if (!rel) return null
  return (
    <View style={styles.friend}>
      {rel.state === 'none' && <Plate label="Add friend" icon="keep" roles={roles} onPress={() => run(() => sendFriendRequest(id), `Request sent to ${name}.`)} />}
      {rel.state === 'sent' && <Tag roles={roles}>REQUEST SENT</Tag>}
      {rel.state === 'received' && rel.requestId && (
        <Plate label={`Accept ${name}'s request`} roles={roles} onPress={() => run(() => respondToRequest(rel.requestId!, true), `You and ${name} are friends.`)} />
      )}
      {rel.state === 'friends' && (
        <View style={styles.actions}>
          <Tag roles={roles} variant="win">FRIENDS</Tag>
          <Plate label="Remove friend" variant="quiet" roles={roles} onPress={() => openConfirm({
            question: `Remove ${name} as a friend?`,
            consequence: 'You come off each other\'s friends lists. Either of you can ask again.',
            confirmLabel: 'Remove', stayLabel: 'Keep', onConfirm: () => run(() => removeFriend(id), `${name} removed.`),
          })} />
        </View>
      )}
      {note ? <KitText t="body" color={roles.textMuted}>{note}</KitText> : null}
    </View>
  )
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.fact}>
      <KitText t="tag" color={roles.textMuted}>{label.toUpperCase()}</KitText>
      <KitText t="title" color={roles.text}>{value}</KitText>
    </View>
  )
}

const styles = StyleSheet.create({
  top: { marginTop: space[4] },
  report: { marginTop: space[6], alignSelf: 'flex-start' },
  record: { flexDirection: 'row', flexWrap: 'wrap', gap: space[5], marginBottom: space[2] },
  fact: { gap: 2, minWidth: 80 },
  badges: { flexDirection: 'row', flexWrap: 'wrap', gap: space[3], marginBottom: space[2] },
  pins: { gap: space[3] },
  actions: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: space[2] },
  friend: { gap: space[1], marginTop: space[2] },
  trophies: { flexDirection: 'row', flexWrap: 'wrap', gap: space[2] },
})
