// The competition fields in the database that are cups, not leagues: the
// European Cup (ucl_), the Europa Cup (uel_), the Conference Cup (uecl_), the
// World Cup (wc_) and the European Full Path's qualifying field (cucl_). They
// sit in the same `leagues` table as the domestic leagues, so every place that
// draws or lists a league leaves these out, all through this one list.
//
// One list since 11 Oct 2026: the rule had five copies, and the three written
// before the Europa and Conference Cups arrived (P8-172) didn't know them. An
// All Time run was drawn into the Europa Cup's 36 clubs as a 70-match league
// (the maintainer: the top side on about 160 points), and League mode's picker
// could offer both cups as leagues. Pure (no database), so scripts use it too.
export const CUP_FIELD_PREFIXES = ['ucl_', 'uel_', 'uecl_', 'wc_', 'cucl_'] as const

/** A cup's field, never a league to draw or pick. */
export const isCupField = (leagueId: string) => CUP_FIELD_PREFIXES.some(p => leagueId.startsWith(p))

/** The same as SQL, for a query over `leagues l`. Fixed text, no input in it. */
export const NOT_A_CUP_SQL = CUP_FIELD_PREFIXES.map(p => `l.id NOT LIKE '${p}%'`).join(' AND ')
