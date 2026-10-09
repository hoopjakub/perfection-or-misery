import { useEffect, useState } from 'react'
import { t } from '@/i18n'
import { USERNAME_MAX } from '@/lib/auth'
import { PageMeta } from '@/components/PageMeta'
import { View, StyleSheet, Platform } from 'react-native'
import { router } from 'expo-router'
import { loginWithUsername } from '@/lib/auth'
import { useUserStore } from '@/store/userStore'
import { ROLES, space } from '@/theme'
import { KitScreen, KitText, Field, Plate, StripedNotice, BackControl } from '@/components/kit'
import { EVERYDAY } from '@/lib/appearance'
import { useOnline } from '@/lib/online'

// Sign in — docs/ui-overhaul/07a A3.
const roles = ROLES[EVERYDAY]

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
      setError(t('auth.wrongLogin'))
      setLoading(false)
    }
  }

  // The plate names the missing step instead of silently doing nothing.
  // P8.5-24: offline, signing in can't work, and the plate says why.
  const online = useOnline()
  const missing = !online ? t('auth.offline') : !username.trim() ? t('auth.enterYourUsername') : !password ? t('auth.enterYourPassword') : undefined

  return (
    // Both platforms lift the form over the keyboard (the old layout only
    // adjusted on iOS, so Android hid the button).
    <KitScreen ground={EVERYDAY}>
        <PageMeta title={t('auth.signInTitle')} path="/auth/login" />
        <BackControl roles={roles} />
        <KitText t="superL" color={roles.text} accessibilityRole="header" style={styles.title}>{t('auth.welcomeBack')}</KitText>
        <KitText t="bodyL" color={roles.textMuted}>{t('auth.signInLead')}</KitText>

        <View style={styles.form}>
          <Field
            label={t('auth.username')} roles={roles} value={username} onChangeText={setUsername}
            placeholder={t('auth.usernamePlaceholder')} autoCapitalize="none" autoCorrect={false}
            autoComplete="username" textContentType="username" maxLength={USERNAME_MAX}
          />
          <Field
            label={t('auth.password')} roles={roles} value={password} onChangeText={setPassword}
            secure autoComplete="password" textContentType="password"
            error={error} onSubmitEditing={() => { if (!missing) handleLogin() }}
          />
          <StripedNotice roles={roles}>
            {t('auth.noRecoverySignIn')}
          </StripedNotice>

          <Plate
            label={t('auth.noAccount')} variant="quiet" roles={roles}
            onPress={() => router.replace('/auth/register')} style={styles.switch}
          />
          <Plate
            label={t('auth.signIn')} icon="signIn" roles={roles} onPress={handleLogin}
            disabled={!!missing} missingStep={missing} loading={loading}
          />
        </View>
    </KitScreen>
  )
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  title: { marginTop: space[3], marginBottom: space[2] },
  form: { gap: space[4], marginTop: space[6] },
  switch: { alignSelf: 'flex-start', marginLeft: -space[2] },
})
