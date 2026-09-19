import { useEffect, useState } from 'react'
import { PageMeta } from '@/components/PageMeta'
import { View, StyleSheet, KeyboardAvoidingView, Platform } from 'react-native'
import { router } from 'expo-router'
import { loginWithUsername } from '@/lib/auth'
import { useUserStore } from '@/store/userStore'
import { ROLES, space } from '@/theme'
import { KitScreen, KitText, Field, Plate, StripedNotice, BackControl } from '@/components/kit'

// Sign in — docs/ui-overhaul/07a A3.
const roles = ROLES.cotton

export default function LoginScreen() {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [loading,  setLoading]  = useState(false)
  const [error,    setError]    = useState<string | null>(null)

  const { session, isGuest } = useUserStore()

  // when session appears and user is not guest — navigate away
  useEffect(() => {
    if (session && !isGuest) {
      router.replace('/(tabs)')
    }
  }, [session, isGuest])

  async function handleLogin() {
    setLoading(true)
    setError(null)
    try {
      await loginWithUsername(username.trim(), password)
      // don't navigate here — useEffect above handles it
    } catch {
      setError('Wrong username or password.')
      setLoading(false)
    }
  }

  // The plate names the missing step instead of silently doing nothing.
  const missing = !username.trim() ? 'Enter your username' : !password ? 'Enter your password' : undefined

  return (
    // Both platforms lift the form over the keyboard (the old layout only
    // adjusted on iOS, so Android hid the button).
    <KeyboardAvoidingView style={styles.fill} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <KitScreen ground="cotton" keyboardShouldPersistTaps="handled">
        <PageMeta title="Sign in" path="/auth/login" />
        <BackControl roles={roles} />
        <KitText t="superL" color={roles.text} accessibilityRole="header" style={styles.title}>WELCOME BACK.</KitText>
        <KitText t="bodyL" color={roles.textMuted}>Sign in with your username.</KitText>

        <View style={styles.form}>
          <Field
            label="Username" roles={roles} value={username} onChangeText={setUsername}
            placeholder="your_username" autoCapitalize="none" autoCorrect={false}
            autoComplete="username" textContentType="username"
          />
          <Field
            label="Password" roles={roles} value={password} onChangeText={setPassword}
            secure autoComplete="password" textContentType="password"
            error={error} onSubmitEditing={() => { if (!missing) handleLogin() }}
          />
          <StripedNotice roles={roles}>
            There's no password recovery. Forget your password and the account is gone.
          </StripedNotice>

          <Plate
            label="No account? Create one" variant="quiet" roles={roles}
            onPress={() => router.replace('/auth/register')} style={styles.switch}
          />
          <Plate
            label="Sign in" icon="signIn" roles={roles} onPress={handleLogin}
            disabled={!!missing} missingStep={missing} loading={loading}
          />
        </View>
      </KitScreen>
    </KeyboardAvoidingView>
  )
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  title: { marginTop: space[3], marginBottom: space[2] },
  form: { gap: space[4], marginTop: space[6] },
  switch: { alignSelf: 'flex-start', marginLeft: -space[2] },
})
