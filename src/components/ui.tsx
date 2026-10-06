import { t } from '@/i18n'
import React from 'react'
import { Pressable, View, StyleSheet, type PressableProps, type StyleProp, type ViewStyle } from 'react-native'
// P8-123: text on the kit's families and scale until this screen is rebuilt on KitText.
import { ScaleText as Text } from '@/components/kit'
import { Ionicons } from '@expo/vector-icons'
import { ROLES, space, font, type } from '@/theme'
import type { RunSaveStatus } from '@/hooks/useRunSave'
import { EVERYDAY, FLOODLIT } from '@/lib/appearance'

// The page's ground (1 Oct: result screens follow light and dark too).
const GR = ROLES[EVERYDAY]

// ── PressCard ────────────────────────────────────────────────────────────────
// The one interaction primitive every tappable card/row should use: gentle
// scale + dim while pressed, and a background lift on web hover (react-native-web
// passes `hovered` to the style function; native only ever sees `pressed`).
// Purely presentational — accepts everything Pressable does.

type PressState = { pressed: boolean; hovered?: boolean }

export function PressCard({
  style, hoverStyle, pressedStyle, disabled, children, ...rest
}: PressableProps & {
  style?: StyleProp<ViewStyle>
  hoverStyle?: StyleProp<ViewStyle>     // web-only lift (defaults to the floodlit ground's surface)
  pressedStyle?: StyleProp<ViewStyle>   // extra style while pressed
}) {
  return (
    <Pressable
      disabled={disabled}
      style={(state) => {
        const { pressed, hovered } = state as PressState
        return [
          style,
          hovered && !disabled && (hoverStyle ?? defaultHover),
          pressed && !disabled && [defaultPressed, pressedStyle],
          disabled && { opacity: 0.45 },
        ]
      }}
      {...rest}
    >
      {children}
    </Pressable>
  )
}

// Its one caller left is the match sheet, on the floodlit ground: the hover is
// that ground's raised surface (C-18: it was the old palette's #18213A).
const defaultHover: ViewStyle = { backgroundColor: ROLES[FLOODLIT].surface, borderColor: ROLES[FLOODLIT].rule }
const defaultPressed: ViewStyle = { opacity: 0.85, transform: [{ scale: 0.985 }] }

// (C-18, 4 Oct 2026: BackButton, DifficultyBadge and LoadFailed are gone. Nothing
// called them since their screens moved onto the kit's BackControl, run labels
// and StripedNotice.)

// ── SaveStatusLine ───────────────────────────────────────────────────────────
// The one visible trace of useRunSave on every result screen. Saving used to be
// invisible, so a failed save looked exactly like a saved one — and guests were
// never told their run wouldn't be kept. Renders nothing for history views and
// tester runs, where there's nothing to say. On the kit's roles (C-18): a
// failure is misery red as text on this ground; everything else is quiet.
const SAVE_LINE: Record<Exclude<RunSaveStatus, 'off'>, { icon: keyof typeof Ionicons.glyphMap; text: string; color: string }> = {
  guest:   { icon: 'person-outline',        text: t('parts.saveGuest'), color: GR.textMuted },
  waiting: { icon: 'time-outline',          text: t('parts.saveWaiting'), color: GR.textMuted },
  saving:  { icon: 'cloud-upload-outline',  text: t('parts.saveSaving'), color: GR.textMuted },
  saved:   { icon: 'checkmark-circle',      text: t('parts.saveSaved'), color: GR.text },
  // P8.5-24: no connection, so it waits on the phone (src/lib/runQueue.ts).
  queued:  { icon: 'phone-portrait-outline', text: t('parts.saveQueued'), color: GR.textMuted },
  failed:  { icon: 'alert-circle',          text: t('parts.saveFailed'), color: GR.lossText },
}

export function SaveStatusLine({ status, onRetry }: { status: RunSaveStatus; onRetry: () => void }) {
  if (status === 'off') return null
  const line = SAVE_LINE[status]
  return (
    <View style={saveStyles.row} accessibilityLiveRegion="polite">
      <Ionicons name={line.icon} size={15} color={line.color} />
      <Text style={[saveStyles.text, { color: line.color }]}>{line.text}</Text>
      {status === 'failed' && (
        <PressCard style={saveStyles.retry} onPress={onRetry} accessibilityRole="button" accessibilityLabel={t('parts.retrySave')}>
          <Text style={saveStyles.retryText}>{t('parts.retry')}</Text>
        </PressCard>
      )}
    </View>
  )
}

const saveStyles = StyleSheet.create({
  row: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', flexWrap: 'wrap',
    gap: space[1], marginBottom: space[2], paddingHorizontal: space[2],
  },
  text: { fontSize: type.tag.fontSize, fontFamily: font.bodyMedium, textAlign: 'center', flexShrink: 1 },
  // Square, as every Kit Drop control (radius is 0).
  retry: { paddingHorizontal: space[2], paddingVertical: space[1], borderWidth: 1, borderColor: GR.lossText },
  retryText: { fontSize: type.tag.fontSize, fontFamily: font.bodyBold, color: GR.lossText },
})
