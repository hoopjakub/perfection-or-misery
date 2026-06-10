import { useState } from 'react'
import {
  View, Text, StyleSheet, TextInput,
  Pressable, ActivityIndicator, KeyboardAvoidingView,
  Platform, ScrollView
} from 'react-native'
import { router } from 'expo-router'
import { upgradeGuestAccount } from '@/lib/auth'
import { colors, spacing, typography, radius, shadows } from '@/theme'

export default function RegisterScreen() {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [confirm,  setConfirm]  = useState('')
  const [loading,  setLoading]  = useState(false)
  const [error,    setError]    = useState<string | null>(null)
  const [accepted, setAccepted] = useState(false)

  async function handleRegister() {
    if (!username.trim()) {
      setError('Choose a username.')
      return
    }
    if (username.trim().length < 3) {
      setError('Username must be at least 3 characters.')
      return
    }
    if (!/^[a-zA-Z0-9_]+$/.test(username.trim())) {
      setError('Username can only contain letters, numbers, and underscores.')
      return
    }
    if (password.length < 6) {
      setError('Password must be at least 6 characters.')
      return
    }
    if (password !== confirm) {
      setError('Passwords do not match.')
      return
    }
    if (!accepted) {
      setError('You must accept the no-recovery warning.')
      return
    }

    setLoading(true)
    setError(null)

    try {
      await upgradeGuestAccount({ username: username.trim(), password })
      router.replace('/(tabs)')
    } catch (e: any) {
      console.log('register error:', e.message, e)
      if (e.message === 'USERNAME_TAKEN') {
        setError('That username is already taken.')
      } else {
        setError(e.message) // show real error for now
      }
    }
  }

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView
        contentContainerStyle={styles.inner}
        keyboardShouldPersistTaps="handled"
      >
        {/* back */}
        <Pressable onPress={() => router.back()} style={styles.back}>
          <Text style={styles.backText}>← Back</Text>
        </Pressable>

        <Text style={styles.title}>Create account.</Text>
        <Text style={styles.subtitle}>
          Your guest runs stay. We just add a username.
        </Text>

        <View style={styles.form}>
          <Text style={styles.label}>Username</Text>
          <TextInput
            style={styles.input}
            value={username}
            onChangeText={setUsername}
            placeholder="your_username"
            placeholderTextColor={colors.textMuted}
            autoCapitalize="none"
            autoCorrect={false}
          />

          <Text style={styles.label}>Password</Text>
          <TextInput
            style={styles.input}
            value={password}
            onChangeText={setPassword}
            placeholder="••••••••"
            placeholderTextColor={colors.textMuted}
            secureTextEntry
          />

          <Text style={styles.label}>Confirm Password</Text>
          <TextInput
            style={styles.input}
            value={confirm}
            onChangeText={setConfirm}
            placeholder="••••••••"
            placeholderTextColor={colors.textMuted}
            secureTextEntry
          />

          {/* no recovery warning — must accept */}
          <Pressable
            style={styles.warningBox}
            onPress={() => setAccepted(a => !a)}
          >
            <View style={[styles.checkbox, accepted && styles.checkboxChecked]}>
              {accepted && <Text style={styles.checkmark}>✓</Text>}
            </View>
            <Text style={styles.warningText}>
              I understand there is{' '}
              <Text style={styles.warningBold}>no password recovery</Text>.
              If I forget my password, my account is gone forever.
            </Text>
          </Pressable>

          {error && <Text style={styles.error}>{error}</Text>}

          <Pressable
            style={[styles.btn, (loading || !accepted) && styles.btnDisabled]}
            onPress={handleRegister}
            disabled={loading || !accepted}
          >
            {loading
              ? <ActivityIndicator color={colors.textPrimary} />
              : <Text style={styles.btnText}>CREATE ACCOUNT</Text>
            }
          </Pressable>

          <View style={styles.switchRow}>
            <Text style={styles.switchText}>Already have an account? </Text>
            <Pressable onPress={() => router.replace('/auth/login')}>
              <Text style={styles.switchLink}>Sign in</Text>
            </Pressable>
          </View>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  )
}

const styles = StyleSheet.create({
  container: {
    flex:            1,
    backgroundColor: colors.bg,
  },
  inner: {
    paddingHorizontal: spacing.lg,
    paddingTop:        64,
    paddingBottom:     spacing.xxl,
  },
  back: {
    marginBottom: spacing.xl,
  },
  backText: {
    color:    colors.textSecondary,
    fontSize: typography.md,
  },
  title: {
    fontSize:     typography.xxl,
    fontWeight:   typography.black,
    color:        colors.textPrimary,
    marginBottom: spacing.xs,
  },
  subtitle: {
    fontSize:     typography.md,
    color:        colors.textSecondary,
    marginBottom: spacing.xl,
  },
  form: {
    gap: spacing.sm,
  },
  label: {
    fontSize:     typography.sm,
    color:        colors.textSecondary,
    fontWeight:   typography.medium,
    marginBottom: 4,
  },
  input: {
    backgroundColor:   colors.bgCard,
    borderWidth:       1,
    borderColor:       colors.border,
    borderRadius:      radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical:   spacing.md,
    color:             colors.textPrimary,
    fontSize:          typography.md,
    marginBottom:      spacing.sm,
  },
  warningBox: {
    flexDirection:   'row',
    backgroundColor: colors.bgCard,
    borderRadius:    radius.md,
    borderWidth:     1,
    borderColor:     colors.warning,
    padding:         spacing.md,
    gap:             spacing.sm,
    marginVertical:  spacing.md,
    alignItems:      'flex-start',
  },
  checkbox: {
    width:           22,
    height:          22,
    borderRadius:    radius.sm,
    borderWidth:     2,
    borderColor:     colors.warning,
    alignItems:      'center',
    justifyContent:  'center',
    flexShrink:      0,
  },
  checkboxChecked: {
    backgroundColor: colors.warning,
  },
  checkmark: {
    color:      colors.bg,
    fontSize:   12,
    fontWeight: typography.black,
  },
  warningText: {
    color:      colors.warning,
    fontSize:   typography.sm,
    lineHeight: 20,
    flex:       1,
  },
  warningBold: {
    fontWeight: typography.black,
  },
  error: {
    color:        colors.danger,
    fontSize:     typography.sm,
    marginBottom: spacing.sm,
  },
  btn: {
    backgroundColor: colors.accent,
    paddingVertical: spacing.md,
    borderRadius:    radius.md,
    alignItems:      'center',
    marginTop:       spacing.sm,
  },
  btnDisabled: {
    opacity: 0.5,
  },
  btnText: {
    color:         colors.textPrimary,
    fontSize:      typography.md,
    fontWeight:    typography.black,
    letterSpacing: 2,
  },
  switchRow: {
    flexDirection:  'row',
    justifyContent: 'center',
    marginTop:      spacing.lg,
  },
  switchText: {
    color:    colors.textSecondary,
    fontSize: typography.sm,
  },
  switchLink: {
    color:      colors.accent,
    fontSize:   typography.sm,
    fontWeight: typography.bold,
  },
})