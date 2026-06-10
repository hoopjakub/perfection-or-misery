import { View, Text, StyleSheet, Pressable } from 'react-native'
import { router } from 'expo-router'
import { useUserStore } from '@/store/userStore'
import { signOut } from '@/lib/auth'
import { colors, spacing, typography, radius, shadows } from '@/theme'

export default function ProfileScreen() {
  const { profile, isGuest } = useUserStore()

  async function handleSignOut() {
    await signOut()
    router.replace('/(tabs)')
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Profile</Text>

      <View style={styles.card}>
        <Text style={styles.username}>
          {isGuest ? 'Guest' : profile?.username ?? '—'}
        </Text>
        <Text style={styles.badge}>
          {isGuest ? '👤 Guest Account' : '✅ Registered'}
        </Text>
      </View>

      {isGuest ? (
        <Pressable
          style={styles.btn}
          onPress={() => router.push('/auth/register')}
        >
          <Text style={styles.btnText}>CREATE ACCOUNT</Text>
        </Pressable>
      ) : (
        <Pressable style={[styles.btn, styles.btnDanger]} onPress={handleSignOut}>
          <Text style={styles.btnText}>SIGN OUT</Text>
        </Pressable>
      )}

      {!isGuest && (
        <Pressable onPress={handleSignOut} style={styles.signOutLink}>
          <Text style={styles.signOutText}>Sign out</Text>
        </Pressable>
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    flex:              1,
    backgroundColor:   colors.bg,
    paddingTop:        64,
    paddingHorizontal: spacing.lg,
  },
  title: {
    fontSize:     typography.xxl,
    fontWeight:   typography.black,
    color:        colors.textPrimary,
    marginBottom: spacing.xl,
  },
  card: {
    backgroundColor: colors.bgCard,
    borderRadius:    12,
    borderWidth:     1,
    borderColor:     colors.border,
    padding:         spacing.lg,
    marginBottom:    spacing.lg,
  },
  username: {
    fontSize:     typography.xl,
    fontWeight:   typography.black,
    color:        colors.textPrimary,
    marginBottom: spacing.xs,
  },
  badge: {
    fontSize: typography.sm,
    color:    colors.textSecondary,
  },
  btn: {
    backgroundColor: colors.accent,
    paddingVertical: spacing.md,
    borderRadius:    12,
    alignItems:      'center',
    marginBottom:    spacing.md,
  },
  btnDanger: {
    backgroundColor: colors.danger,
  },
  btnText: {
    color:         colors.textPrimary,
    fontSize:      typography.md,
    fontWeight:    typography.black,
    letterSpacing: 2,
  },
  signOutLink: {
    alignItems: 'center',
    marginTop:  spacing.sm,
  },
  signOutText: {
    color:    colors.textMuted,
    fontSize: typography.sm,
  },
})