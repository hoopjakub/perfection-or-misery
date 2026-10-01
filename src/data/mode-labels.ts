// Single source for the full official competition names (Big Fixes §5.5) —
// every screen/label that names these competitions should read from here
// instead of hardcoding "Champions League" / "World Cup" (the internal mode
// ids stay short; this is a display-string-only rename).
export const MODE_LABELS: Record<string, string> = {
  world_cup:                'FIFA World Cup',
  // P8.5-21 (E2): the full path goes on in any of the three, so it's named for
  // Europe. The id stays champions_league_custom: saved runs carry it.
  champions_league_custom:  'European Full Path',
  champions_league:         'UEFA Champions League',
  europa_league:            'UEFA Europa League',
  conference_league:        'UEFA Conference League',
}
