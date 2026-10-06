// Single source for the full official competition names (Big Fixes §5.5) —
// every screen/label that names these competitions should read from here
// instead of hardcoding "Champions League" / "World Cup" (the internal mode
// ids stay short; this is a display-string-only rename).
// P8.5-28: each in the app's language (comp.* in src/i18n).
export const MODE_LABELS: Record<string, string> = {
  world_cup:                t('comp.wc'),
  // P8.5-21 (E2): the full path goes on in any of the three, so it's named for
  // Europe. The id stays champions_league_custom: saved runs carry it.
  champions_league_custom:  t('comp.europePath'),
  champions_league:         t('comp.ucl'),
  europa_league:            t('comp.uel'),
  conference_league:        t('comp.uecl'),
}
import { t } from '@/i18n'
