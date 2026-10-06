// Kit Drop pieces for the run: the RunHeader every setup and in-run screen
// wears, and the choice controls setup is made of.
import { t } from '@/i18n'
import React from 'react'
import { View, Pressable, StyleSheet, type StyleProp, type ViewStyle } from 'react-native'
import { type Roles, space, border, OFFSET } from '@/theme'
import { KitText, Stripe, Tape, Rivets, Icon } from './primitives'
import { BackControl } from './controls'
import { Tag } from './labels'
import { useGameStore } from '@/store/gameStore'
import { isClassicEurope } from '@/data/europe'

// ── RunHeader ────────────────────────────────────────────────────────────────
// The run's own header (docs/ui-overhaul/08 §2.7): the colourway tape, where
// you are among the six stages, and the stage title. Setup stands on cotton,
// the season on nylon; the header follows whatever `roles` it's given.
export const RUN_STAGES = [t('run.stageWhere'), t('run.stageHowHard'), t('run.stageShape'), t('run.stageDraft'), t('run.stageDraw'), t('run.stageSeason')] as const
const stageName = (n: number, tournament?: boolean) => (n === 6 && tournament ? t('run.stageTournament') : RUN_STAGES[n - 1])
export type RunStage = 1 | 2 | 3 | 4 | 5 | 6

// S-01 / S-02 (centralisation step 4): what the strip shows follows the mode,
// worked out here once. Six screens used to pass `skipped` themselves and the
// pundits forgot `tournament`, so a cup's strip said "Season" on the pundits
// screen and "Tournament" one tap later. Chaos and Cursed fix their own
// difficulty, so they skip "How hard"; a cup's stage 6 is the Tournament
// (P8-78). The full path opens with a domestic season, so it keeps "Season".
export function runStagesFor(mode: string | null | undefined): { skipped: RunStage[]; tournament: boolean } {
  return {
    skipped: mode === 'chaos' || mode === 'cursed' ? [2] : [],
    tournament: isClassicEurope(mode) || mode === 'world_cup',
  }
}

export function RunHeader({ roles, stage, colourway, title, right, onBack, back = true, road }: {
  roles: Roles
  stage: RunStage
  colourway: string[]
  title?: string
  right?: React.ReactNode
  onBack?: () => void
  back?: boolean
  /** A run with stages of its own (the full path's road: domestic season,
   *  the other leagues, qualifying, league phase, knockouts) shows where it is
   *  among them under the six (C-10: it used to be a second header, `Road`). */
  road?: { names: readonly string[]; current: number }
}) {
  const { skipped, tournament } = runStagesFor(useGameStore(st => st.mode))
  return (
    <View style={styles.header}>
      <Tape colours={colourway} roles={roles} style={styles.tape} />
      <View style={styles.headerRow}>
        {back ? <BackControl roles={roles} onPress={onBack} /> : null}
        <View style={styles.stages} accessible accessibilityLabel={t('run.stageA11y', { n: stage, name: stageName(stage, tournament) })}>
          {RUN_STAGES.map((name, i) => {
            const n = (i + 1) as RunStage
            if (n === stage) return <Tag key={n} roles={roles} variant="selected">{`${n} ${stageName(n, tournament) ?? name}`}</Tag>
            if (skipped.includes(n)) return <KitText key={n} t="tag" color={roles.textFaint}>{t('run.stageSet', { n })}</KitText>
            return <KitText key={n} t="tag" color={n < stage ? roles.text : roles.textFaint}>{String(n)}</KitText>
          })}
        </View>
        {right}
      </View>
      {road ? (
        <View style={styles.road} accessible accessibilityLabel={t('season.roadA11y', { n: road.current + 1, total: road.names.length, name: road.names[road.current] })}>
          {road.names.map((name, i) => i === road.current
            ? <Tag key={name} roles={roles} variant="selected">{name}</Tag>
            : <KitText key={name} t="tag" color={i < road.current ? roles.text : roles.textFaint}>{i < road.current ? t('season.done', { name }) : name}</KitText>)}
        </View>
      ) : null}
      {title ? (
        <KitText t="superM" color={roles.text} accessibilityRole="header" style={styles.title}>
          {title.toUpperCase()}
        </KitText>
      ) : null}
    </View>
  )
}

// ── ChoiceLabel ──────────────────────────────────────────────────────────────
// A riveted garment label you pick: a mode (ModeLabel), a difficulty's rules
// (CareLabel). Tape down the leading edge, the name in the super, a line or
// rule list under it. Dangerous choices (Chaos, Cursed) wear the hazard edge.
export function ChoiceLabel({
  roles, colourway, title, lines = [], note, trailing, onPress, hazard, lastTime, comingSoon, selected, accessibilityHint, mark,
}: {
  roles: Roles
  /** A mark to wear beside the title — a competition's own (P8-12). */
  mark?: React.ReactNode
  colourway?: string[]
  title: string
  lines?: string[]          // rule lines, set in the tag mono
  note?: string             // one sentence in the workhorse
  trailing?: string         // right-aligned figure: "×1.37"
  onPress?: () => void
  hazard?: boolean
  lastTime?: boolean
  comingSoon?: boolean
  selected?: boolean
  accessibilityHint?: string
}) {
  const body = (
    <>
      {!comingSoon && <Rivets color={roles.line} />}
      {hazard
        ? <Stripe roles={roles} band={4} style={styles.edge} />
        : colourway ? <Tape colours={colourway} roles={roles} vertical thickness={border.tape} style={styles.tapeEdge} /> : null}
      <View style={[styles.labelBody, comingSoon && { opacity: 0.55 }]}>
        <View style={styles.labelTop}>
          {mark}
          {/* P8.5-49: the title takes the row's free width (flex: 1). Sized to
              its own measured width (flexShrink), Android's italic measure
              (see KitText) wrapped the last word onto a hidden second line
              after a re-render: "ALL", "EUROPEAN FULL". */}
          <KitText t="superS" color={roles.text} style={{ flex: 1 }}>{title.toUpperCase()}</KitText>
          {trailing ? <KitText t="figure" color={roles.text} style={styles.trailing}>{trailing}</KitText> : null}
          {onPress && !comingSoon ? <Icon name="chevron" size={20} color={roles.text} /> : null}
        </View>
        {/* P8.5-42: the tags on a line of their own. Beside the title, the LAST
            TIME a tap adds squeezed it, and "ALL TIME" read "ALL", "EUROPEAN
            FULL PATH" "EUROPEAN FULL". */}
        {(lastTime || comingSoon) && (
          <View style={styles.labelTags}>
            {lastTime && <Tag roles={roles}>{t('run.lastTime')}</Tag>}
            {comingSoon && <Tag roles={roles} variant="selected">{t('run.soon')}</Tag>}
          </View>
        )}
        {note ? <KitText t="body" color={roles.textMuted}>{note}</KitText> : null}
        {lines.map(l => <KitText key={l} t="tag" color={roles.text}>{l}</KitText>)}
      </View>
    </>
  )
  const frame = [styles.label, { backgroundColor: roles.surface, borderColor: comingSoon ? roles.rule : roles.line }, selected && { borderWidth: border.plate }]
  if (comingSoon || !onPress) {
    return <View style={frame} accessible accessibilityLabel={title + (comingSoon ? t('run.comingSoon') : '')}>{body}</View>
  }
  return (
    <View style={styles.wrap}>
      <View style={[styles.offset, { backgroundColor: roles.offset }]} />
      <Pressable
        onPress={onPress}
        accessibilityRole="button"
        accessibilityLabel={[title, note, ...lines].filter(Boolean).join('. ')}
        accessibilityHint={accessibilityHint}
        accessibilityState={{ selected: !!selected }}
        style={({ pressed }) => [frame, pressed && { transform: [{ translateX: OFFSET }, { translateY: OFFSET }] }]}
      >
        {body}
      </Pressable>
    </View>
  )
}

// ── StepControl ──────────────────────────────────────────────────────────────
// A number you nudge: 48dp steppers and the value between them.
export function StepControl({ roles, label, value, min, max, onChange, format }: {
  roles: Roles
  label: string
  value: number
  min: number
  max: number
  onChange: (v: number) => void
  format?: (v: number) => string
}) {
  const set = (v: number) => onChange(Math.max(min, Math.min(max, v)))
  const shown = format ? format(value) : String(value)
  return (
    <View style={styles.step} accessible accessibilityRole="adjustable" accessibilityLabel={label}
      accessibilityValue={{ min, max, now: value, text: shown }}
      accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
      onAccessibilityAction={e => set(value + (e.nativeEvent.actionName === 'increment' ? 1 : -1))}
    >
      <StepButton roles={roles} sign="−" disabled={value <= min} onPress={() => set(value - 1)} />
      <View style={styles.stepValue}>
        <KitText t="figureL" color={roles.text}>{shown}</KitText>
      </View>
      <StepButton roles={roles} sign="+" disabled={value >= max} onPress={() => set(value + 1)} />
    </View>
  )
}

function StepButton({ roles, sign, disabled, onPress }: { roles: Roles; sign: string; disabled: boolean; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      importantForAccessibility="no"
      style={({ pressed }) => [
        styles.stepBtn,
        { borderColor: disabled ? roles.rule : roles.line },
        pressed && { backgroundColor: roles.sunken },
      ]}
    >
      <KitText t="superS" color={disabled ? roles.textFaint : roles.text}>{sign}</KitText>
    </Pressable>
  )
}

// ── Chips ────────────────────────────────────────────────────────────────────
// A small set of mutually exclusive options (sort orders). Never more than four.
export function Chips<T extends string>({ roles, label, options, value, onChange, style }: {
  roles: Roles
  label?: string
  options: { id: T; label: string }[]
  value: T
  onChange: (v: T) => void
  style?: StyleProp<ViewStyle>
}) {
  return (
    <View style={[styles.chips, style]} accessibilityRole="radiogroup" accessibilityLabel={label}>
      {label ? <KitText t="tag" color={roles.textMuted}>{label}</KitText> : null}
      {options.map(o => {
        const on = o.id === value
        return (
          <Pressable
            key={o.id}
            onPress={() => onChange(o.id)}
            accessibilityRole="radio"
            accessibilityState={{ selected: on }}
            hitSlop={8}
            style={({ pressed }) => [
              styles.chip,
              { borderColor: roles.line, backgroundColor: on ? roles.line : 'transparent' },
              pressed && !on && { backgroundColor: roles.sunken },
            ]}
          >
            <KitText t="tag" color={on ? roles.bg : roles.text}>{o.label}</KitText>
          </Pressable>
        )
      })}
    </View>
  )
}

// ── InlineConfirm ────────────────────────────────────────────────────────────
// A decision that interrupts in place. Used where a ConfirmScreen route can't
// be: the draft's leave guard replays a held navigation action, and a pushed
// route in between would be popped by that same action.
export function InlineConfirm({ roles, message, confirmLabel, cancelLabel, onConfirm, onCancel }: {
  roles: Roles
  message: string
  confirmLabel: string
  cancelLabel: string
  onConfirm: () => void
  onCancel: () => void
}) {
  return (
    <View style={[styles.confirm, { borderColor: roles.line, backgroundColor: roles.surface }]} accessibilityLiveRegion="polite">
      <Stripe roles={roles} band={6} style={styles.confirmStripe} />
      <KitText t="bodyL" color={roles.text}>{message}</KitText>
      <View style={styles.confirmRow}>
        <Pressable onPress={onCancel} accessibilityRole="button"
          style={({ pressed }) => [styles.confirmBtn, { borderColor: roles.line }, pressed && { backgroundColor: roles.sunken }]}>
          <KitText t="button" color={roles.text}>{cancelLabel}</KitText>
        </Pressable>
        <Pressable onPress={onConfirm} accessibilityRole="button"
          style={({ pressed }) => [styles.confirmBtn, { borderColor: roles.line, backgroundColor: pressed ? roles.textMuted : roles.line }]}>
          <KitText t="button" color={roles.bg}>{confirmLabel}</KitText>
        </Pressable>
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  header: { marginBottom: space[3] },
  tape: { marginHorizontal: -space[4], marginTop: -space[3], marginBottom: space[2] },
  headerRow: { flexDirection: 'row', alignItems: 'center', gap: space[2] },
  road: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: space[2], marginTop: space[2] },
  stages: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: space[2], flexWrap: 'wrap' },
  title: { marginTop: space[2] },

  wrap: { paddingRight: OFFSET, paddingBottom: OFFSET },
  offset: { position: 'absolute', left: OFFSET, top: OFFSET, right: 0, bottom: 0 },
  label: { flexDirection: 'row', borderWidth: border.thin, minHeight: 72, overflow: 'hidden' },
  edge: { width: 12, alignSelf: 'stretch' },
  tapeEdge: { alignSelf: 'stretch' },
  labelBody: { flex: 1, paddingVertical: space[3], paddingLeft: space[3], paddingRight: space[5], gap: 4 },
  labelTop: { flexDirection: 'row', alignItems: 'center', gap: space[2] },
  labelTags: { flexDirection: 'row', gap: space[1] },
  trailing: { marginLeft: 'auto' },

  step: { flexDirection: 'row', alignItems: 'center', gap: space[2] },
  stepBtn: { width: 48, height: 48, borderWidth: border.thin, alignItems: 'center', justifyContent: 'center' },
  stepValue: { minWidth: 56, alignItems: 'center' },

  chips: { flexDirection: 'row', alignItems: 'center', gap: space[2], flexWrap: 'wrap' },
  chip: { borderWidth: border.thin, paddingHorizontal: space[2], paddingVertical: 4 },

  confirm: { borderWidth: border.thin, padding: space[3], paddingLeft: space[5], gap: space[3], overflow: 'hidden' },
  confirmStripe: { position: 'absolute', left: 0, top: 0, bottom: 0, width: 10 },
  confirmRow: { flexDirection: 'row', gap: space[2] },
  confirmBtn: { flex: 1, minHeight: 48, borderWidth: border.plate, alignItems: 'center', justifyContent: 'center', paddingHorizontal: space[2] },
})
