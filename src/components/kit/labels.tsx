// Kit Drop labels: the Tag (small facts), garment Labels (a whole outcome),
// the Wordmark, the ID tag, and the typographic stand-ins for crests and flags.
import { countryName } from '@/data/countries-sk'
import { t } from '@/i18n'
import { flagImageOf } from '@/lib/flags'
import { useCrestStore } from '@/store/crestStore'
import { getFlag } from '@/lib/flagMap'
import { clubCode } from '@/data/club-codes'
import { ratio, inkOn } from '@/lib/contrast'
import React from 'react'
import { View, Text, Pressable, StyleSheet, type StyleProp, type ViewStyle, Image } from 'react-native'
import { type Roles, space, border, OFFSET, prim } from '@/theme'
import { KitText, Stripe, Tape, Rivets, ZipTag, Icon, Crest, YourCrest } from './primitives'

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
    : variant === 'loss' ? roles.loss
    : variant === 'selected' ? roles.line
    : 'transparent'
  const text =
    variant === 'you' || variant === 'win' || variant === 'loss' ? roles.onFill
    : variant === 'selected' ? roles.bg
    : variant === 'draw' ? roles.draw
    : roles.text
  // P8-10: the caller's style goes on a thin row wrapper, and the visible box
  // sits inside it. The box used to carry alignSelf: 'flex-start', which kept
  // it from stretching in a column but also overrode a row's alignItems, so
  // every tag in a row sat high and off-centre. The wrapper centres like any
  // other row child; in a column it spans the width while the box keeps to its
  // text, left-aligned.
  return (
    <View style={[styles.tagWrap, style]}>
    <View style={[styles.tag, { backgroundColor: fill, borderColor: variant === 'draw' ? roles.draw : roles.line }]}>
      {/* A loss is misery red (P8-74), ink on it at 5.4:1. It carried a striped
          edge as well until P8-111: red and the stripe both meant "bad", so a
          lost result was marked twice over. The letter (L) is what reads
          without colour. */}
      <KitText t="tag" color={text}>
        {variant === 'hidden' ? '??' : children}
      </KitText>
    </View>
    </View>
  )
}

// ── VenueMark ────────────────────────────────────────────────────────────────
// Home or away as an icon in a tag's box (P8-09): a house at home, filled; a
// plane away, outlined. The word stays as its accessibility label.
export function VenueMark({ roles, home, style }: { roles: Roles; home: boolean; style?: StyleProp<ViewStyle> }) {
  return (
    <View style={[styles.tagWrap, style]} accessible accessibilityLabel={home ? t('common.home') : t('common.away')}>
      <View style={[styles.tag, styles.venue, { borderColor: roles.line, backgroundColor: home ? roles.line : 'transparent' }]}>
        <Icon name={home ? 'home' : 'away'} size={16} color={home ? roles.bg : roles.text} />
      </View>
    </View>
  )
}

// ── TeamMark ─────────────────────────────────────────────────────────────────
// A team's mark, decided by its id in one place (P8-79; docs/centralisation
// 05 A-01): a national side (a `<nation>_nt` id) wears its flag, a club its
// crest. Before this, seventeen places each decided for themselves, and a
// caller that forgot to pass a flag drew a nation as an initials badge — the
// "nation logos are still breaking" report. Callers pass the id and nothing else.
export function TeamMark({ roles, clubId, name, size = 20 }: {
  roles: Roles
  clubId?: string | null
  name: string
  size?: 16 | 20 | 24
}) {
  const flag = getFlag(clubId)
  // P8-132: your crest on your side, a nation's flag included (with "everywhere").
  const yours = useCrestStore(st => (clubId && st.active?.clubId === clubId && (st.active.choice.design || st.active.choice.imagePath) ? st.active.choice : null))
  if (yours) return <YourCrest choice={yours} size={size} name={name} />
  return flag
    ? <RoundFlag roles={roles} emoji={flag} code={name} size={size} />
    : <Crest roles={roles} clubId={clubId} name={name} size={size} />
}

// ── ClubName ─────────────────────────────────────────────────────────────────
// A club as its crest and its name (P8-12). The crest is small and the name
// does the reading, so nothing depends on recognising a badge; a national side
// shows its flag instead, which is the mark people actually know it by.
export function ClubName({ roles, clubId, name, flag, size = 20, t = 'body', color, style, numberOfLines = 1 }: {
  roles: Roles
  clubId?: string | null
  name: string
  flag?: string | null
  size?: 16 | 20 | 24
  t?: 'body' | 'bodyL' | 'title' | 'tag'
  color?: string
  style?: StyleProp<ViewStyle>
  numberOfLines?: number
}) {
  return (
    <View style={[styles.clubName, style]}>
      {/* A caller's own flag still wins (a country, not a team); otherwise the
          mark comes from the id, so a nation is never drawn as a crest. */}
      {flag
        ? <RoundFlag roles={roles} emoji={flag} code={name} size={size} />
        : <TeamMark roles={roles} clubId={clubId} name={name} size={size} />}
      <KitText t={t} color={color ?? roles.text} numberOfLines={numberOfLines} style={styles.clubNameText}>{countryName(name)}</KitText>
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
        accessibilityLabel={accessibilityLabel ?? `${title}, ${meta}${score ? `, score ${score}` : ''}${verdict !== 'middle' ? `, ${verdict}` : ''}`}
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
              {title.toUpperCase()}
            </KitText>
            {score ? <KitText t="figure" color={roles.text} style={styles.score}>{score}</KitText> : null}
          </View>
          {/* Two lines: on a phone one line cut the mode and difficulty off (Phase 7). */}
          <KitText t="tag" color={roles.textMuted} numberOfLines={2}>{meta}</KitText>
        </View>
        {/* P8-128: every run's label says its outcome the same way, one edge
            each: volt for Perfection, red for Misery (P8-111), and the draw's
            grey for everything between. Only the ends had an edge, so a few
            runs wore a strip and most didn't, which read as a glitch rather
            than a verdict. */}
        <View style={[styles.verdictEdge, { backgroundColor: verdict === 'perfection' ? roles.perfection : verdict === 'misery' ? roles.loss : roles.draw }]} />
      </Pressable>
    </View>
  )
}

// The "loading outline" state: the same shape in label grey, no spinner.
export function RunLabelSkeleton({ roles }: { roles: Roles }) {
  return (
    <View style={[styles.label, styles.skeleton, { borderColor: roles.rule, backgroundColor: roles.sunken }]}
      accessibilityLabel={t('common.loading')} />
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
export function IdTag({ roles, name, state, detail, mark, badge, pin, tag }: {
  roles: Roles
  name: string
  state: 'REG' | 'GUEST'
  detail?: string
  /** Your picture in place of the initial (the You redesign): with both, the
   *  tag showed a second "M" square right beside the picture. */
  mark?: React.ReactNode
  /** The favourite team's badge, beside the name. */
  badge?: React.ReactNode
  /** P8-168: your pin's colour. */
  pin?: { hex: string }
  /** P8-181: your club's tag. No club, no tag (there's no REG any more). */
  tag?: { text: string; colour: string } | null
}) {
  const tagInk = tag ? inkOn(tag.colour, prim.ink, prim.cotton) : prim.ink
  return (
    <View style={[styles.idTag, { borderColor: roles.line, backgroundColor: roles.surface }]}
      accessible accessibilityLabel={`${name}, ${state === 'REG' ? 'registered' : 'guest'}${detail ? `, ${detail}` : ''}`}>
      {mark ?? (
        <View style={[styles.initial, { backgroundColor: roles.line }]}>
          <KitText t="superS" color={roles.bg}>{(name.charAt(0) || '?').toUpperCase()}</KitText>
        </View>
      )}
      <View style={{ flex: 1, gap: 2 }}>
        <View style={styles.idTop}>
          <KitText t="tag" color={roles.textMuted}>ID</KitText>
          <KitText t="title" color={roles.text} numberOfLines={1} style={{ flexShrink: 1 }}>{name}</KitText>
          {badge}
          {state === 'GUEST' ? <Tag roles={roles}>{t('parts.guestTag')}</Tag>
            : tag ? <View style={[styles.idClub, { backgroundColor: tag.colour, borderColor: roles.line }]}><KitText t="tag" color={tagInk}>{tag.text}</KitText></View>
            : null}
        </View>
        {detail ? <KitText t="tag" color={roles.textMuted} numberOfLines={1}>{detail}</KitText> : null}
      </View>
      {state === 'REG' && <ZipTag size={14} style={styles.idZip} colour={pin?.hex} />}
    </View>
  )
}

// ── RoundFlag ────────────────────────────────────────────────────────────────
// A nation as a round flag. The flag is the existing emoji, cropped to a
// circle (the style guide's round flag assets are a later swap behind this
// same component). No flag → a neutral circle with the code.
//
// `code` is the side's or country's NAME, whole (centralisation A-13, step 1):
// it's what a screen reader says, and the three letters in an empty circle are
// made from it here with `clubCode`, the same code the club tags use. Callers
// used to cut it themselves five different ways, and a cut name ("Bra") was
// what the screen reader said.
export function RoundFlag({ emoji, code, size = 20, roles }: {
  emoji?: string | null
  code?: string
  size?: 16 | 20 | 24 | 64   // 64: the draw's landed label (P8-118)
  roles: Roles
}) {
  const circle = { width: size, height: size, borderRadius: size / 2 }
  if (!emoji) {
    return (
      <View style={[circle, styles.flagEmpty, { borderColor: roles.rule, backgroundColor: roles.sunken }]}
        accessibilityLabel={code ? countryName(code) : undefined}>
        <Text style={{ fontSize: size * 0.32, color: roles.textMuted }}>{code ? clubCode(code).slice(0, 3) : ''}</Text>
      </View>
    )
  }
  // P8-58: the real flag, cropped to the circle; the emoji only when there's
  // no bundled flag for it (src/lib/flags.ts).
  const image = flagImageOf(emoji)
  return (
    <View style={[circle, styles.flag, { borderColor: roles.rule }]} accessibilityLabel={code ? countryName(code) : undefined}>
      {image
        ? <Image source={image} resizeMode="cover" style={{ width: size * 1.5, height: size, alignSelf: 'center' }} accessibilityIgnoresInvertColors />
        : <Text style={{ fontSize: size * 1.25, lineHeight: size * 1.4, textAlign: 'center' }} allowFontScaling={false}>{emoji}</Text>}
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
      {eliminated && <View style={[styles.clubStripe, { backgroundColor: roles.loss }]} />}
      <KitText t="tag" color={roles.text} style={styles.clubCode}>{code}</KitText>
      {you && <ZipTag size={10} style={styles.clubZip} />}
    </View>
  )
}

const styles = StyleSheet.create({
  idClub: { paddingHorizontal: 6, paddingVertical: 1, borderWidth: 1 },
  tagWrap: { flexDirection: 'row' },
  clubName: { flexDirection: 'row', alignItems: 'center', gap: space[2], flexShrink: 1, minWidth: 0 },
  clubNameText: { flexShrink: 1 },
  tag: {
    borderWidth: border.thin, paddingHorizontal: 6, paddingVertical: 2,
    overflow: 'hidden', justifyContent: 'center',
  },
  // A tag's height with a 16px icon in it (the tag text is 14 tall).
  venue: { alignItems: 'center', minWidth: 30, paddingVertical: 1 },

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
