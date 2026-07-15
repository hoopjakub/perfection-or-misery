import { View, Text, StyleSheet, Pressable, ScrollView } from 'react-native'
import { router } from 'expo-router'
import { Ionicons } from '@expo/vector-icons'
import { useUserStore } from '@/store/userStore'
import { signOut } from '@/lib/auth'
import { PressCard } from '@/components/ui'
import { colors, spacing, typography, radius } from '@/theme'

// Menu rows (icon + label + chevron) instead of a stack of identical solid
// CTA buttons — one visual weight per level of importance.
function MenuRow({ icon, label, danger, onPress }: {
  icon: keyof typeof Ionicons.glyphMap
  label: string
  danger?: boolean
  onPress: () => void
}) {
  return (
    <PressCard style={styles.menuRow} onPress={onPress}>
      <View style={[styles.menuIcon, danger && { backgroundColor: colors.danger + '1E' }]}>
        <Ionicons name={icon} size={18} color={danger ? colors.danger : colors.accent} />
      </View>
      <Text style={[styles.menuLabel, danger && { color: colors.danger }]}>{label}</Text>
      <Ionicons name="chevron-forward" size={16} color={colors.textMuted} />
    </PressCard>
  )
}

export default function ProfileScreen() {
  const { profile, isGuest } = useUserStore()
  const name = isGuest ? 'Guest' : profile?.username ?? '—'

  async function handleSignOut() {
    await signOut()
    router.replace('/(tabs)')
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.title}>Profile</Text>

      {/* identity card */}
      <View style={styles.card}>
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>{name.charAt(0).toUpperCase()}</Text>
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.username}>{name}</Text>
          <View style={styles.badgeRow}>
            <Ionicons
              name={isGuest ? 'person-outline' : 'checkmark-circle'}
              size={13}
              color={isGuest ? colors.textSecondary : colors.success}
            />
            <Text style={styles.badge}>{isGuest ? 'Guest account' : 'Registered'}</Text>
          </View>
        </View>
      </View>

      {/* primary action for guests */}
      {isGuest && (
        <Pressable
          style={({ pressed }) => [styles.cta, pressed && { opacity: 0.85, transform: [{ scale: 0.985 }] }]}
          onPress={() => router.push('/auth/register')}
        >
          <Text style={styles.ctaText}>CREATE ACCOUNT</Text>
          <Ionicons name="arrow-forward" size={16} color={colors.textPrimary} />
        </Pressable>
      )}
      {isGuest && <Text style={styles.ctaHint}>Save runs, climb the leaderboard, build career stats.</Text>}

      {/* menu */}
      <View style={styles.menu}>
        {!isGuest && <MenuRow icon="medal-outline" label="My Runs" onPress={() => router.push('/(tabs)/runs')} />}
        {!isGuest && <MenuRow icon="stats-chart-outline" label="Career Stats" onPress={() => router.push('/game/career')} />}
        <MenuRow icon="book-outline" label="How to Play" onPress={() => router.push('/(tabs)/how-to-play')} />
        <MenuRow icon="information-circle-outline" label="About Me" onPress={() => router.push('/(tabs)/about')} />
        {!isGuest && <MenuRow icon="log-out-outline" label="Sign Out" danger onPress={handleSignOut} />}
      </View>
    </ScrollView>
  )
}

const styles = StyleSheet.create({
  container: {
    flex:              1,
    backgroundColor:   colors.bg,
    paddingTop:        64,
    paddingHorizontal: spacing.lg,
  },
  content: {
    paddingBottom: spacing.xxl,
  },
  title: {
    fontSize:     typography.xxl,
    fontWeight:   typography.black,
    color:        colors.textPrimary,
    marginBottom: spacing.xl,
  },
  card: {
    flexDirection:   'row',
    alignItems:      'center',
    gap:             spacing.md,
    backgroundColor: colors.bgCard,
    borderRadius:    radius.lg,
    borderWidth:     1,
    borderColor:     colors.border,
    padding:         spacing.lg,
    marginBottom:    spacing.lg,
  },
  avatar: {
    width:           52,
    height:          52,
    borderRadius:    26,
    backgroundColor: colors.accent + '2A',
    borderWidth:     1,
    borderColor:     colors.accent,
    alignItems:      'center',
    justifyContent:  'center',
  },
  avatarText: {
    fontSize:   typography.xl,
    fontWeight: typography.black,
    color:      colors.accent,
  },
  username: {
    fontSize:     typography.xl,
    fontWeight:   typography.black,
    color:        colors.textPrimary,
  },
  badgeRow: {
    flexDirection: 'row',
    alignItems:    'center',
    gap:           4,
    marginTop:     2,
  },
  badge: {
    fontSize: typography.sm,
    color:    colors.textSecondary,
  },
  cta: {
    backgroundColor: colors.accent,
    paddingVertical: spacing.md,
    borderRadius:    radius.md,
    alignItems:      'center',
    justifyContent:  'center',
    flexDirection:   'row',
    gap:             spacing.sm,
  },
  ctaText: {
    color:         colors.textPrimary,
    fontSize:      typography.md,
    fontWeight:    typography.black,
    letterSpacing: 2,
  },
  ctaHint: {
    fontSize:     typography.xs,
    color:        colors.textMuted,
    textAlign:    'center',
    marginTop:    spacing.sm,
    marginBottom: spacing.md,
  },
  menu: {
    backgroundColor: colors.bgCard,
    borderRadius:    radius.lg,
    borderWidth:     1,
    borderColor:     colors.border,
    marginTop:       spacing.sm,
    overflow:        'hidden',
  },
  menuRow: {
    flexDirection:     'row',
    alignItems:        'center',
    gap:               spacing.md,
    paddingVertical:   spacing.md,
    paddingHorizontal: spacing.lg,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  menuIcon: {
    width:           34,
    height:          34,
    borderRadius:    radius.sm,
    backgroundColor: colors.accent + '14',
    alignItems:      'center',
    justifyContent:  'center',
  },
  menuLabel: {
    flex:       1,
    fontSize:   typography.md,
    fontWeight: typography.bold,
    color:      colors.textPrimary,
  },
})
