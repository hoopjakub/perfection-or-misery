import type { LeagueFormat } from '@/engine/cl-league-sim'
import { t } from '@/i18n'

// Human-readable names + short explainers for each domestic-league format. The
// explainer strings are what the `?` info-bubbles (§11) will show; for now the
// league-viewer surfaces the label + note. Full per-league detail lives in
// docs/"More Competitions & Modes.md" §17.

const FORMATS: LeagueFormat[] = ['double_round_robin', 'belgium_playoff', 'scotland_split', 'split_championship']
// P8.5-28: the words live in src/i18n (rules.fmt.*).
export const FORMAT_LABEL = Object.fromEntries(FORMATS.map(f => [f, t(`rules.fmt.${f}.label` as 'rules.fmt.scotland_split.label')])) as Record<LeagueFormat, string>
export const FORMAT_EXPLAINER = Object.fromEntries(FORMATS.map(f => [f, t(`rules.fmt.${f}.text` as 'rules.fmt.scotland_split.text')])) as Record<LeagueFormat, string>

// True when the format is anything other than a plain round-robin (worth flagging
// in the UI so the player knows the standings were produced differently).
export const isSpecialFormat = (f?: LeagueFormat) => !!f && f !== 'double_round_robin'
