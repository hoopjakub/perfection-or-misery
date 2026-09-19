import { useState } from 'react'
import { PageMeta } from '@/components/PageMeta'
import { View, StyleSheet, KeyboardAvoidingView, Platform } from 'react-native'
import { router } from 'expo-router'
import { upgradeGuestAccount } from '@/lib/auth'
import { ROLES, space } from '@/theme'
import { KitScreen, KitText, Field, Plate, StripedNotice, Checkbox, BackControl } from '@/components/kit'

// Create an account — docs/ui-overhaul/07a A3. Errors sit under the field they
// belong to; anything we can't pin to a field goes in a notice above the plate.
const roles = ROLES.cotton

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
    if (name.length < 3) return { username: 'Usernames need at least 3 characters.' }
    if (!/^[a-zA-Z0-9_]+$/.test(name)) return { username: 'Letters, numbers and underscores only.' }
    if (password.length < 6) return { password: 'Passwords need at least 6 characters.' }
    if (password !== confirm) return { confirm: "The passwords don't match." }
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
      console.warn('[register] failed:', e)
      setLoading(false)
      if (e?.message === 'SIGNIN_AFTER_UPGRADE') {
        // The account was made; only the automatic sign-in failed.
        router.replace('/auth/login')
        return
      }
      setErrors(e?.message === 'USERNAME_TAKEN'
        ? { username: "That username's taken." }
        : { form: "That didn't work. Check your connection and try again." })
    }
  }

  // The plate names the next missing step instead of silently doing nothing.
  const missing =
    !username.trim() ? 'Enter a username'
    : !password ? 'Enter a password'
    : !confirm ? 'Repeat the password'
    : !accepted ? 'Tick the box above'
    : undefined

  return (
    // Both platforms lift the form over the keyboard (the old layout only
    // adjusted on iOS, so Android hid the button).
    <KeyboardAvoidingView style={styles.fill} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <KitScreen ground="cotton" keyboardShouldPersistTaps="handled">
        <PageMeta title="Create an account" path="/auth/register" />
        <BackControl roles={roles} />
        <KitText t="superL" color={roles.text} accessibilityRole="header" style={styles.title}>"KEEP YOUR RUNS"</KitText>
        {/* Was "Your guest runs stay." — false: guest runs are never saved. */}
        <KitText t="bodyL" color={roles.textMuted}>Pick a username and a password.</KitText>

        <View style={styles.form}>
          <Field
            label="Username" roles={roles} value={username} onChangeText={setUsername}
            placeholder="your_username" autoCapitalize="none" autoCorrect={false}
            autoComplete="username-new" textContentType="username" error={errors.username}
          />
          <Field
            label="Password" roles={roles} value={password} onChangeText={setPassword}
            secure autoComplete="password-new" textContentType="newPassword" error={errors.password}
          />
          <Field
            label="Repeat password" roles={roles} value={confirm} onChangeText={setConfirm}
            secure autoComplete="password-new" textContentType="newPassword" error={errors.confirm}
          />

          <StripedNotice roles={roles}>
            There's no password recovery. Lose the password and the account goes with it.
          </StripedNotice>
          <Checkbox checked={accepted} onChange={setAccepted} roles={roles}>I'll remember it</Checkbox>

          {errors.form ? <StripedNotice roles={roles}>{errors.form}</StripedNotice> : null}

          <Plate
            label="Already have one? Sign in" variant="quiet" roles={roles}
            onPress={() => router.replace('/auth/login')} style={styles.switch}
          />
          <Plate
            label="Create account" icon="keep" roles={roles} onPress={handleRegister}
            disabled={!!missing} missingStep={missing} loading={loading}
          />
          {/* Store policy: the terms and privacy are one tap from sign-up. */}
          <KitText t="body" color={roles.textMuted}>
            {'Creating an account means you accept the '}
            <KitText t="body" color={roles.text} style={styles.link} accessibilityRole="link" onPress={() => router.push('/terms')}>Terms</KitText>
            {' and the '}
            <KitText t="body" color={roles.text} style={styles.link} accessibilityRole="link" onPress={() => router.push('/privacy')}>Privacy</KitText>
            {' page.'}
          </KitText>
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
  link: { textDecorationLine: 'underline' },
})
