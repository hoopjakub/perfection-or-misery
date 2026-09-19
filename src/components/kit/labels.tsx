// Kit Drop labels: the Tag (small facts), garment Labels (a whole outcome),
// the Wordmark, the ID tag, and the typographic stand-ins for crests and flags.
import React from 'react'
import { View, Text, Pressable, StyleSheet, type StyleProp, type ViewStyle } from 'react-native'
import { type Roles, space, border, OFFSET } from '@/theme'
import { KitText, Stripe, Tape, Rivets, ZipTag } from './primitives'

// ── Tag ──────────────────────────────────────────────────────────────────────
// Garment-label data: `OVR 88`, `W`, `"SAVED"`. Never a sentence, never a button.
export type TagVariant = 'data' | 'you' | 'win' | 'draw' | 'loss' | 'selected' | 'hidden'

export function Tag({ children, roles, variant = 'data', style }: {
  children: string
  roles: Roles
  variant?: TagVariant
  style?: StyleProp<ViewStyle>
}) {
  const fill =
    variant === 'you' ? roles.you
    : variant === 'win' ? roles.perfection
    : variant === 'selected' ? roles.line
    : 'transparent'
  const text =
    variant === 'you' || variant === 'win' ? roles.onFill
    : variant === 'selected' ? roles.bg
    : variant === 'draw' ? roles.draw
    : roles.text
  return (
    <View style={[styles.tag, { backgroundColor: fill, borderColor: variant === 'draw' ? roles.draw : roles.line }, style]}>
      {/* "Out" is a pattern, not a colour: the loss tag gets a striped edge
          and keeps its letter on a solid inset. */}
      {variant === 'loss' && <Stripe roles={roles} band={4} style={styles.tagStripe} />}
      <KitText t="tag" color={text} style={variant === 'loss' && { marginLeft: 8 }}>
        {variant === 'hidden' ? '??' : children}
      </KitText>
    </View>
  )
}

// ── RunLabel ─────────────────────────────────────────────────────────────────
// A finished run as a riveted garment label: colourway tape down the leading
// edge, the verdict in the super, where/when in the tag mono, the score in
// tabular figures. Perfection gets a volt edge; Misery gets the stripe.
export type Verdict = 'perfection' | 'misery' | 'middle'

export function RunLabel({ roles, colourway, title, meta, score, verdict = 'middle', onPress, accessibilityLabel }: {
  roles: Roles
  colourway: string[]
  title: string
  meta: string
  score?: string
  verdict?: Verdict
  onPress?: () => void
  accessibilityLabel?: string
}) {
  return (
    <View style={styles.labelWrap}>
      <View style={[styles.labelOffset, { backgroundColor: roles.offset }]} />
      <Pressable
        onPress={onPress}
        disabled={!onPress}
        accessibilityRole={onPress ? 'button' : undefined}
        accessibilityLabel={accessibilityLabel ?? `${title}, ${meta}${score ? `, score ${score}` : ''}`}
        style={({ pressed }) => [
          styles.label,
          { backgroundColor: roles.surface, borderColor: roles.line },
          pressed && { transform: [{ translateX: OFFSET }, { translateY: OFFSET }] },
        ]}
      >
        <Rivets color={roles.line} />
        <Tape colours={colourway} roles={roles} vertical thickness={border.tape} style={styles.labelTape} />
        <View style={styles.labelBody}>
          <View style={styles.labelTop}>
            <KitText t="superS" color={roles.text} numberOfLines={1} style={{ flexShrink: 1 }}>
              {`"${title.toUpperCase()}"`}
            </KitText>
            {score ? <KitText t="figure" color={roles.text} style={styles.score}>{score}</KitText> : null}
          </View>
          <KitText t="tag" color={roles.textMuted} numberOfLines={1}>{meta}</KitText>
        </View>
        {verdict === 'perfection' && <View style={[styles.verdictEdge, { backgroundColor: roles.perfection }]} />}
        {verdict === 'misery' && <Stripe roles={roles} band={4} style={styles.verdictEdge} />}
      </Pressable>
    </View>
  )
}

// The "loading outline" state: the same shape in label grey, no spinner.
export function RunLabelSkeleton({ roles }: { roles: Roles }) {
  return (
    <View style={[styles.label, styles.skeleton, { borderColor: roles.rule, backgroundColor: roles.sunken }]}
      accessibilityLabel="Loading" />
  )
}

// ── Wordmark ─────────────────────────────────────────────────────────────────
// PERFECTION over MISERY, hard left like an advert super. MISERY stands on a
// hazard-striped underline.
export function Wordmark({ roles, size = 'superL' }: { roles: Roles; size?: 'superL' | 'superM' }) {
  return (
    <View accessible accessibilityRole="header" accessibilityLabel="Perfection or Misery">
      <KitText t={size} color={roles.text}>PERFECTION</KitText>
      <View style={styles.miseryWrap}>
        <KitText t={size} color={roles.text}>MISERY</KitText>
        <Stripe roles={roles} band={4} style={[styles.underline, { height: size === 'superL' ? 10 : 8 }]} />
      </View>
    </View>
  )
}

// ── IdTag ────────────────────────────────────────────────────────────────────
// The player as a garment ID tag, not a profile card.
export function IdTag({ roles, name, state, detail }: {
  roles: Roles
  name: string
  state: 'REG' | 'GUEST'
  detail?: string
}) {
  return (
    <View style={[styles.idTag, { borderColor: roles.line, backgroundColor: roles.surface }]}
      accessible accessibilityLabel={`${name}, ${state === 'REG' ? 'registered' : 'guest'}${detail ? `, ${detail}` : ''}`}>
      <View style={[styles.initial, { backgroundColor: roles.line }]}>
        <KitText t="superS" color={roles.bg}>{(name.charAt(0) || '?').toUpperCase()}</KitText>
      </View>
      <View style={{ flex: 1, gap: 2 }}>
        <View style={styles.idTop}>
          <KitText t="tag" color={roles.textMuted}>ID</KitText>
          <KitText t="title" color={roles.text} numberOfLines={1} style={{ flexShrink: 1 }}>{name}</KitText>
          <Tag roles={roles} variant={state === 'REG' ? 'selected' : 'data'}>{state}</Tag>
        </View>
        {detail ? <KitText t="tag" color={roles.textMuted} numberOfLines={1}>{detail}</KitText> : null}
      </View>
      {state === 'REG' && <ZipTag size={14} style={styles.idZip} />}
    </View>
  )
}

// ── RoundFlag ────────────────────────────────────────────────────────────────
// A nation as a round flag. The flag is the existing emoji, cropped to a
// circle (the style guide's round flag assets are a later swap behind this
// same component). No flag → a neutral circle with the code.
export function RoundFlag({ emoji, code, size = 20, roles }: {
  emoji?: string | null
  code?: string
  size?: 16 | 20 | 24
  roles: Roles
}) {
  const circle = { width: size, height: size, borderRadius: size / 2 }
  if (!emoji) {
    return (
      <View style={[circle, styles.flagEmpty, { borderColor: roles.rule, backgroundColor: roles.sunken }]}
        accessibilityLabel={code}>
        <Text style={{ fontSize: size * 0.32, color: roles.textMuted }}>{code?.slice(0, 3)}</Text>
      </View>
    )
  }
  return (
    <View style={[circle, styles.flag, { borderColor: roles.rule }]} accessibilityLabel={code}>
      <Text style={{ fontSize: size * 1.25, lineHeight: size * 1.4, textAlign: 'center' }} allowFontScaling={false}>{emoji}</Text>
    </View>
  )
}

// ── ClubTag ──────────────────────────────────────────────────────────────────
// A club as its code beside a tape of its colour. Text is never set ON the
// club colour (club colours are arbitrary; contrast isn't guaranteed).
export function ClubTag({ roles, code, colour, you, eliminated }: {
  roles: Roles
  code: string
  colour: string
  you?: boolean
  eliminated?: boolean
}) {
  return (
    <View style={[styles.clubTag, { borderColor: roles.line }]} accessibilityLabel={code}>
      <Tape colours={[colour]} roles={roles} vertical thickness={6} />
      {eliminated && <Stripe roles={roles} band={4} style={styles.clubStripe} />}
      <KitText t="tag" color={roles.text} style={styles.clubCode}>{code}</KitText>
      {you && <ZipTag size={10} style={styles.clubZip} />}
    </View>
  )
}

const styles = StyleSheet.create({
  tag: {
    borderWidth: border.thin, paddingHorizontal: 6, paddingVertical: 2,
    alignSelf: 'flex-start', overflow: 'hidden', justifyContent: 'center',
  },
  tagStripe: { position: 'absolute', left: 0, top: 0, bottom: 0, width: 5 },

  labelWrap: { paddingRight: OFFSET, paddingBottom: OFFSET },
  labelOffset: { position: 'absolute', left: OFFSET, top: OFFSET, right: 0, bottom: 0 },
  label: {
    flexDirection: 'row', alignItems: 'stretch', borderWidth: border.thin,
    minHeight: 72, overflow: 'hidden',
  },
  labelTape: { alignSelf: 'stretch' },
  labelBody: { flex: 1, paddingVertical: space[3], paddingLeft: space[3], paddingRight: space[5], gap: 4, justifyContent: 'center' },
  labelTop: { flexDirection: 'row', alignItems: 'baseline', gap: space[3] },
  score: { marginLeft: 'auto' },
  verdictEdge: { width: 8, alignSelf: 'stretch' },
  skeleton: { borderStyle: 'dashed' },

  miseryWrap: { alignSelf: 'flex-start' },
  underline: { marginTop: 2 },

  idTag: { flexDirection: 'row', alignItems: 'center', gap: space[3], borderWidth: border.thin, padding: space[3] },
  initial: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  idTop: { flexDirection: 'row', alignItems: 'center', gap: space[2] },
  idZip: { position: 'absolute', top: -6, right: space[3] },

  flag: { overflow: 'hidden', alignItems: 'center', justifyContent: 'center', borderWidth: StyleSheet.hairlineWidth },
  flagEmpty: { alignItems: 'center', justifyContent: 'center', borderWidth: StyleSheet.hairlineWidth },

  clubTag: { flexDirection: 'row', alignItems: 'stretch', borderWidth: border.thin, alignSelf: 'flex-start', overflow: 'hidden' },
  clubStripe: { position: 'absolute', right: 0, top: 0, bottom: 0, width: 5 },
  clubCode: { paddingHorizontal: 6, paddingVertical: 2 },
  clubZip: { position: 'absolute', right: -2, top: -4 },
})
