// P8.5-20 · Every association's cup by name (docs/europe/06-CUPS-FOR-EVERY-NATION.md §2).
//
// One table for one fact. Before this there were two (N-06): the league run's
// five by league id, and the full path's ten by country, with the other 43
// called "the Latvia cup". Keyed by association rank, the order of
// UEFA_ASSOCIATIONS (src/data/uefa-coefficients.ts), because the full path
// keys its associations by rank and a country spelling of its own
// ("Rep. Ireland", "Bosnia").
//
// Source: The Dugout's src/world/cupNames.ts (52 names, each checked against
// the competition rather than guessed); Austria, Latvia and Northern Ireland
// from the 2026–27 Conference League's entrant list on Wikipedia, read
// 29 Sept 2026. Three are sponsors' names (MOL Cup, Slovnaft Cup,
// Mjólkurbikarinn): that is what they're called, and they change when the
// sponsor does, so a rename here is expected, not a bug.
//
// The public build (P8.5-30) uses no competition's real name: there it's the
// country's cup ("Spain Cup"), as its leagues are "Spain League".
import { UEFA_ASSOCIATIONS } from './uefa-coefficients'

// The flag itself, not @/lib/brand's BRAND_MODE: brand.ts loads the crest
// images, and the engine (which names the cups) also runs headless in scripts/.
// Read per call (the bundle inlines it anyway) so a check can set it first.
const real = () => process.env.EXPO_PUBLIC_BRAND_MODE === 'real'

export const NATIONAL_CUPS: Record<number, string> = {
  1: 'FA Cup', 2: 'Coppa Italia', 3: 'Copa del Rey', 4: 'DFB-Pokal', 5: 'Coupe de France',
  6: 'Taça de Portugal', 7: 'Beker van België', 8: 'KNVB Beker', 9: 'Türkiye Kupası', 10: 'MOL Cup',
  11: 'Puchar Polski', 12: 'Kypello Elladas', 13: 'DBU Pokalen', 14: 'NM-Cupen', 15: 'Kypello Kyprou',
  16: 'Schweizer Cup', 17: 'Svenska Cupen', 18: 'Magyar Kupa', 19: 'Scottish Cup', 20: 'ÖFB-Cup',
  21: 'Ukrainian Cup', 22: 'Cupa României', 23: 'Hrvatski nogometni kup', 24: 'Pokal Slovenije', 25: 'Gvia haMedina',
  26: 'Azərbaycan Kuboku', 27: 'Slovnaft Cup', 28: 'Bulgarian Cup', 29: 'Russian Cup', 30: 'Kup Srbije',
  31: 'Mjólkurbikarinn', 32: 'FAI Cup', 33: 'Armenian Cup', 34: 'Kup BiH', 35: 'Kupa e Kosovës',
  36: 'Kazakhstan Cup', 37: 'Suomen Cup', 38: 'Latvian Football Cup', 39: 'Cupa Moldovei', 40: 'Liechtensteiner Cup',
  41: 'Løgmanssteypið', 42: 'Kup na Makedonija', 43: 'Maltese FA Trophy', 44: 'Kupa e Shqipërisë', 45: 'Belarusian Cup',
  46: 'Lithuanian Cup', 47: 'Rock Cup', 48: 'Montenegrin Cup', 49: 'Irish Cup', 50: 'Coupe de Luxembourg',
  51: 'Copa Constitució', 52: 'David Kipiani Cup', 53: 'Eesti Karikas', 54: 'Welsh Cup', 55: 'Coppa Titano',
}

/** P8.5-20 step 4: the cups whose semi-finals are two legs, checked for
 *  2025–26 (1 Oct 2026): the Copa del Rey (si.com, Atlético's site), the
 *  Coppa Italia (first legs 3–4 March, second 21–22 April; calcioefinanza.it),
 *  the Taça de Portugal (Sporting–Porto over two legs; flashscore.pt) and the
 *  Belgian Cup (3–5 and 10–12 February; Club Brugge's and Union's sites).
 *  Every other cup stays one match a round until its format is checked. The
 *  Türkiye Kupası's group stage isn't modelled (docs/europe/06 §3). */
const TWO_LEGGED_SEMIS = new Set([2, 3, 6, 7])
export const semisTwoLegged = (rank: number | null | undefined) => rank != null && TWO_LEGGED_SEMIS.has(rank)

/** The league runs' leagues, by id, to their association's rank. */
const RANK_OF_LEAGUE: Record<string, number> = { premier_league: 1, serie_a: 2, la_liga: 3, bundesliga: 4, ligue_1: 5 }

const countryOf = (rank: number) => UEFA_ASSOCIATIONS.find(a => a.rank === rank)?.name

/** An association's cup, by its rank. */
export function nationalCupName(rank: number | null | undefined): string {
  if (rank == null) return 'The Cup'
  if (!real()) { const c = countryOf(rank); return c ? `${c} Cup` : 'The Cup' }
  return NATIONAL_CUPS[rank] ?? 'The Cup'
}

/** A league run's cup, by its league id. */
export const nationalCupForLeague = (leagueId?: string | null) => nationalCupName(leagueId ? RANK_OF_LEAGUE[leagueId] : null)
export const semisTwoLeggedForLeague = (leagueId?: string | null) => semisTwoLegged(leagueId ? RANK_OF_LEAGUE[leagueId] : null)
