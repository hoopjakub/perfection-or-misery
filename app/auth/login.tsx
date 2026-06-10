import { useState } from 'react'
import {
  View, Text, StyleSheet, TextInput,
  Pressable, ActivityIndicator, KeyboardAvoidingView, Platform
} from 'react-native'
import { router } from 'expo-router'
import { loginWithUsername } from '@/lib/auth'
import { colors, spacing, typography, radius, shadows } from '@/theme'

export default function LoginScreen() {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [loading,  setLoading]  = useState(false)
  const [error,    setError]    = useState<string | null>(null)

  async function handleLogin() {
    if (!username.trim() || !password.trim()) {
      setError('Fill in both fields.')
      return
    }
    setLoading(true)
    setError(null)
    try {
      await loginWithUsername(username.trim(), password)
      router.replace('/(tabs)')
    } catch (e: any) {
      setError('Wrong username or password.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <View style={styles.inner}>
        {/* back */}
        <Pressable onPress={() => router.back()} style={styles.back}>
          <Text style={styles.backText}>← Back</Text>
        </Pressable>

        <Text style={styles.title}>Welcome back.</Text>
        <Text style={styles.subtitle}>Sign in to your account.</Text>

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

          {error && <Text style={styles.error}>{error}</Text>}

          <Pressable
            style={[styles.btn, loading && styles.btnDisabled]}
            onPress={handleLogin}
            disabled={loading}
          >
            {loading
              ? <ActivityIndicator color={colors.textPrimary} />
              : <Text style={styles.btnText}>SIGN IN</Text>
            }
          </Pressable>

          <View style={styles.switchRow}>
            <Text style={styles.switchText}>No account? </Text>
            <Pressable onPress={() => router.replace('/auth/register')}>
              <Text style={styles.switchLink}>Create one</Text>
            </Pressable>
          </View>
        </View>

        {/* no recovery warning */}
        <View style={styles.warning}>
          <Text style={styles.warningText}>
            ⚠️ There is no password recovery. If you forget your password, your account is gone.
          </Text>
        </View>
      </View>
    </KeyboardAvoidingView>
  )
}

const styles = StyleSheet.create({
  container: {
    flex:            1,
    backgroundColor: colors.bg,
  },
  inner: {
    flex:              1,
    paddingHorizontal: spacing.lg,
    paddingTop:        64,
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
    fontSize:   typography.sm,
    color:      colors.textSecondary,
    fontWeight: typography.medium,
    marginBottom: 4,
  },
  input: {
    backgroundColor: colors.bgCard,
    borderWidth:     1,
    borderColor:     colors.border,
    borderRadius:    radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical:   spacing.md,
    color:           colors.textPrimary,
    fontSize:        typography.md,
    marginBottom:    spacing.sm,
  },
  error: {
    color:     colors.danger,
    fontSize:  typography.sm,
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
    opacity: 0.6,
  },
  btnText: {
    color:         colors.textPrimary,
    fontSize:      typography.md,
    fontWeight:    typography.black,
    letterSpacing: 2,
  },
  switchRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    marginTop:     spacing.lg,
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
  warning: {
    marginTop:       spacing.xl,
    backgroundColor: colors.bgCard,
    borderRadius:    radius.md,
    borderWidth:     1,
    borderColor:     colors.warning,
    padding:         spacing.md,
  },
  warningText: {
    color:    colors.warning,
    fontSize: typography.sm,
    lineHeight: 20,
  },
})