// Imports nothing: the awards engine and the headless verify-* scripts use it,
// and they run in Node without React Native.
// ── Season or tournament (P8-78) ─────────────────────────────────────────────
// A cup is a tournament, not a season: "Simulate tournament", Player of the
// Tournament. One place decides the word per mode; everything else asks here.
export const isTournament = (mode: string | null | undefined): boolean =>
  mode === 'world_cup' || mode === 'champions_league' || mode === 'champions_league_custom' || mode === 'europa_league' || mode === 'conference_league'

/** 'tournament' in a cup mode, 'season' otherwise. */
export const seasonWord = (mode: string | null | undefined): 'season' | 'tournament' => (isTournament(mode) ? 'tournament' : 'season')

/** Rewrites "season" in a phrase for the mode, keeping its case (Season, SEASON). */
export function forCompetition(text: string, mode: string | null | undefined): string {
  if (!isTournament(mode)) return text
  return text.replace(/season/gi, w => (w === 'SEASON' ? 'TOURNAMENT' : w[0] === 'S' ? 'Tournament' : 'tournament'))
}
