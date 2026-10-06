import { FORMAT_EXPLAINER, FORMAT_LABEL } from './league-formats'
import { t } from '@/i18n'

// Plain-language explainers for the `?` info-bubbles across the special-mode /
// custom Champions League screens (docs §11). One concept per topic, written
// like you'd explain it to a mate watching their first European campaign —
// no UEFA legalese. Wired via <InfoBubble topic="..." /> and the full-rulebook
// modal (<RulesModal />), which shows RULES_ORDER top to bottom.

export type Explainer = { title: string; text: string }

// P8.5-28: the words live in src/i18n (rules.ex.*, rules.fmt.*); the language
// is fixed per launch, so building this once at load is safe.
const ex = (k: string): Explainer => ({ title: t(`rules.ex.${k}.title` as 'rules.ex.bye.title'), text: t(`rules.ex.${k}.text` as 'rules.ex.bye.text') })

export const EXPLAINERS: Record<string, Explainer> = {
  the_road: ex('the_road'),
  league_simulation: ex('league_simulation'),
  entry_point: ex('entry_point'),
  qualifying_ladder: ex('qualifying_ladder'),
  champions_vs_league_path: ex('champions_vs_league_path'),
  two_legged_tie: ex('two_legged_tie'),
  extra_time: ex('extra_time'),
  league_phase: ex('league_phase'),
  league_phase_zones: ex('league_phase_zones'),
  pots: ex('pots'),
  holders: ex('holders'),
  knockout_playoff: ex('knockout_playoff'),
  knockout_bracket: ex('knockout_bracket'),
  bye: ex('bye'),

  // League-format explainers (the odd domestic formats, reused as ? bubbles
  // in the league viewers and during your own season in one of these leagues).
  format_belgium_playoff:    { title: FORMAT_LABEL.belgium_playoff,    text: FORMAT_EXPLAINER.belgium_playoff },
  format_scotland_split:     { title: FORMAT_LABEL.scotland_split,     text: FORMAT_EXPLAINER.scotland_split },
  format_split_championship: { title: FORMAT_LABEL.split_championship, text: FORMAT_EXPLAINER.split_championship },
}

// The full-rulebook order (RulesModal renders these top to bottom, telling the
// story of the competition from your first domestic kick-off to the final).
export const RULES_ORDER: string[] = [
  'the_road',
  'league_simulation',
  'entry_point',
  'qualifying_ladder',
  'champions_vs_league_path',
  'two_legged_tie',
  'extra_time',
  'bye',
  'holders',
  'league_phase',
  'pots',
  'league_phase_zones',
  'knockout_playoff',
  'knockout_bracket',
  'format_belgium_playoff',
  'format_scotland_split',
  'format_split_championship',
]
