import { useState } from 'react'
import { log } from '@/diag/log'
import { t } from '@/i18n'
import { isBadWord, refusalLine } from '@/lib/moderation'
import { USERNAME_MAX } from '@/lib/auth'
import { PageMeta } from '@/components/PageMeta'
import { View, StyleSheet, Platform } from 'react-native'
import { router } from 'expo-router'
import { upgradeGuestAccount } from '@/lib/auth'
import { ROLES, space } from '@/theme'
import { KitScreen, KitText, Field, Plate, StripedNotice, Checkbox, BackControl, KeyboardSafe } from '@/components/kit'
import { EVERYDAY } from '@/lib/appearance'
import { useOnline } from '@/lib/online'

// Create an account — docs/ui-overhaul/07a A3. Errors sit under the field they
// belong to; anything we can't pin to a field goes in a notice above the plate.
const roles = ROLES[EVERYDAY]

type Errors = { username?: string; password?: string; confirm?: string; form?: string }

export default function RegisterScreen() {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [confirm,  setConfirm]  = useState('')
  const [loading,  setLoading]  = useState(false)
  const [errors,   setErrors]   = useState<Errors>({})
  const [accepted, setAccepted] = useState(false)

  function validate(): Errors {
    const name = username.trim()
    if (name.length < 3) return { username: t('auth.tooShort') }
    if (name.length > USERNAME_MAX) return { username: t('auth.tooLong', { max: USERNAME_MAX }) }
    if (!/^[a-zA-Z0-9_]+$/.test(name)) return { username: t('auth.badCharacters') }
    if (password.length < 6) return { password: t('auth.passwordShort') }
    if (password !== confirm) return { confirm: t('auth.noMatch') }
    return {}
  }

  async function handleRegister() {
    const found = validate()
    setErrors(found)
    if (Object.keys(found).length) return

    setLoading(true)
    try {
      await upgradeGuestAccount({ username: username.trim(), password })
      router.replace('/(tabs)')
    } catch (e: any) {
      // The spinner used to stay up forever after any error — loading was only
      // ever set, never cleared — so the button looked busy and couldn't be
      // pressed again. Raw backend messages were shown too; they mean nothing
      // to a player, so only the cases we can explain get their own line.
      log.warn('auth', 'register: failed', e)
      setLoading(false)
      if (e?.message === 'SIGNIN_AFTER_UPGRADE') {
        // The account was made; only the automatic sign-in failed.
        router.replace('/auth/login')
        return
      }
      setErrors(e?.message === 'USERNAME_TAKEN'
        ? { username: t('auth.taken') }
        // P8.5-44: a name the moderation refuses gets one of its own lines.
        : isBadWord(e) ? { username: refusalLine() }
        : { form: t('auth.failed') })
    }
  }

  // The plate names the next missing step instead of silently doing nothing.
  // P8.5-24: offline, making an account can't work, and the plate says why.
  const online = useOnline()
  const missing =
    !online ? t('auth.offline')
    : !username.trim() ? t('auth.enterUsername')
    : !password ? t('auth.enterPassword')
    : !confirm ? t('auth.repeatThePassword')
    : !accepted ? t('auth.tickTheBox')
    : undefined

  return (
    // Both platforms lift the form over the keyboard (the old layout only
    // adjusted on iOS, so Android hid the button).
    <KeyboardSafe>
      <KitScreen ground={EVERYDAY} keyboardShouldPersistTaps="handled">
        <PageMeta title={t('auth.registerTitle')} path="/auth/register" />
        <BackControl roles={roles} />
        <KitText t="superL" color={roles.text} accessibilityRole="header" style={styles.title}>{t('auth.keepYourRuns')}</KitText>
        {/* Was "Your guest runs stay." — false: guest runs are never saved. */}
        <KitText t="bodyL" color={roles.textMuted}>{t('auth.registerLead')}</KitText>

        <View style={styles.form}>
          <Field
            label={t('auth.username')} roles={roles} value={username} onChangeText={setUsername}
            placeholder={t('auth.usernamePlaceholder')} autoCapitalize="none" autoCorrect={false}
            autoComplete="username-new" textContentType="username" error={errors.username} maxLength={USERNAME_MAX}
          />
          <Field
            label={t('auth.password')} roles={roles} value={password} onChangeText={setPassword}
            secure autoComplete="password-new" textContentType="newPassword" error={errors.password}
          />
          <Field
            label={t('auth.repeatPassword')} roles={roles} value={confirm} onChangeText={setConfirm}
            secure autoComplete="password-new" textContentType="newPassword" error={errors.confirm}
          />

          <StripedNotice roles={roles}>
            {t('auth.noRecoveryRegister')}
          </StripedNotice>
          <Checkbox checked={accepted} onChange={setAccepted} roles={roles}>{t('auth.remember')}</Checkbox>

          {errors.form ? <StripedNotice roles={roles} failed>{errors.form}</StripedNotice> : null}

          <Plate
            label={t('auth.haveOne')} variant="quiet" roles={roles}
            onPress={() => router.replace('/auth/login')} style={styles.switch}
          />
          <Plate
            label={t('auth.create')} icon="keep" roles={roles} onPress={handleRegister}
            disabled={!!missing} missingStep={missing} loading={loading}
          />
          {/* Store policy: the terms and privacy are one tap from sign-up. */}
          <KitText t="body" color={roles.textMuted}>
            {t('auth.acceptBefore')}
            <KitText t="body" color={roles.text} style={styles.link} accessibilityRole="link" onPress={() => router.push('/terms')}>{t('auth.acceptTerms')}</KitText>
            {t('auth.acceptBetween')}
            <KitText t="body" color={roles.text} style={styles.link} accessibilityRole="link" onPress={() => router.push('/privacy')}>{t('auth.acceptPrivacy')}</KitText>
            {t('auth.acceptAfter')}
          </KitText>
        </View>
      </KitScreen>
    </KeyboardSafe>
  )
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  title: { marginTop: space[3], marginBottom: space[2] },
  form: { gap: space[4], marginTop: space[6] },
  switch: { alignSelf: 'flex-start', marginLeft: -space[2] },
  link: { textDecorationLine: 'underline' },
})
