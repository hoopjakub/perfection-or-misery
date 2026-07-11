import type { LeagueFormat } from '@/engine/cl-league-sim'

// Human-readable names + short explainers for each domestic-league format. The
// explainer strings are what the `?` info-bubbles (§11) will show; for now the
// league-viewer surfaces the label + note. Full per-league detail lives in
// docs/"More Competitions & Modes.md" §17.

export const FORMAT_LABEL: Record<LeagueFormat, string> = {
  double_round_robin: 'Standard League',
  belgium_playoff:    'Championship Play-off',
  scotland_split:     'Top-6 / Bottom-6 Split',
  split_championship: 'Championship Round',
}

export const FORMAT_EXPLAINER: Record<LeagueFormat, string> = {
  double_round_robin:
    'Every club plays every other twice (home and away). One table — highest points wins.',
  belgium_playoff:
    'After a full home-and-away season, the TOP 6 have their points HALVED (rounded up) and play a fresh mini-league against each other. Everyone bunches back up — the title is decided in this play-off.',
  scotland_split:
    'Clubs play three times each (33 games), then the league SPLITS into a top-6 and bottom-6. Each half plays 5 more games — but you can’t cross the line, so 7th can never finish above 6th no matter the points.',
  split_championship:
    'A regular season, then the league splits: the top clubs play a Championship round for the title and European places, while the rest play a separate round. The championship group always finishes above the rest.',
}

// True when the format is anything other than a plain round-robin (worth flagging
// in the UI so the player knows the standings were produced differently).
export const isSpecialFormat = (f?: LeagueFormat) => !!f && f !== 'double_round_robin'
