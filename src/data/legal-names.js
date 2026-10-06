// The LEGAL flavour's names (P8.5-30, docs/release/01-NAMES-MARKS-AND-THE-LAW.md
// §5.2, L2): competitions and leagues by plain descriptive names instead of
// their registered marks. One table, three readers:
//   • babel.config.js (scripts/babel-legal-names.js) rewrites the app's own
//     string literals with renameText() in a legal build, so every screen, the
//     press and the guide change without any of them knowing;
//   • scripts/build-db.ts writes assets/db/players_legal.db with the same
//     renames plus legalLeagueName() for the league rows;
//   • nothing at runtime: the personal build never loads this.
// Plain CommonJS so Babel's config can require it. Order matters: the longer
// name first, so "UEFA Champions League" isn't half-renamed by "Champions League".

/** [real, legal] pairs, applied in order, whole words only. */
const RENAMES = [
  ['UEFA Europa Conference League', 'Conference Cup'],
  ['UEFA Champions League', 'European Cup'],
  ['UEFA Europa League', 'Europa Cup'],
  ['UEFA Conference League', 'Conference Cup'],
  ['UEFA Super Cup', 'European Super Cup'],
  ['FIFA World Cup', 'World Cup'],
  // P8.5-28: the Slovak names (docs/release/08-SLOVAK-TERMS.md §2), before the
  // bare UEFA/FIFA lines below so "Liga majstrov UEFA" goes whole. The Slovak
  // text keeps a competition's name in the nominative ("v súťaži Liga
  // majstrov") and never agrees with it by gender, so this one form is enough
  // even though the legal name's gender differs (liga → pohár).
  ['Liga majstrov UEFA', 'Pohár majstrov'],
  ['Európska liga UEFA', 'Európsky pohár'],
  ['Konferenčná liga UEFA', 'Konferenčný pohár'],
  ['Majstrovstvá sveta FIFA', 'Majstrovstvá sveta'],
  ['Liga majstrov', 'Pohár majstrov'],
  ['Európska liga', 'Európsky pohár'],
  ['Konferenčná liga', 'Konferenčný pohár'],
  // Plurals are the mark too ("European Cups/Champions Leagues").
  ['Champions Leagues', 'European Cups'],
  ['Europa Leagues', 'Europa Cups'],
  ['Champions League', 'European Cup'],
  ['Europa League', 'Europa Cup'],
  ['Conference League', 'Conference Cup'],
  // The five leagues the game names in its own copy (the database's league rows
  // use legalLeagueName below, by country, because "Premier League" is four
  // different leagues there).
  ['Premier League', 'England League'],
  ['LaLiga', 'Spain League'],
  ['La Liga', 'Spain League'],
  ['Serie A', 'Italy League'],
  ['Bundesliga', 'Germany League'],
  ['Ligue 1', 'France League'],
  // What's left of the organisations' names: "UEFA coefficient" → "European
  // coefficient", "FIFA ranking" → "World ranking".
  ['UEFA', 'European'],
  ['FIFA', 'World'],
]

const escape = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
const PATTERNS = RENAMES.map(([from, to]) => [new RegExp(`(^|[^\\p{L}\\p{N}])${escape(from)}(?![\\p{L}\\p{N}])`, 'gu'), to])

/** A piece of text with every real competition name swapped for its legal one. */
function renameText(text) {
  if (typeof text !== 'string' || !/UEFA|FIFA|League|Liga|Serie A|Bundesliga|Ligue 1/.test(text)) return text
  let out = text
  for (const [re, to] of PATTERNS) out = out.replace(re, (_m, before) => before + to)
  return out
}

// The country as a league name reads it ("Rep. Ireland" → "Ireland").
const COUNTRY_NAME = { 'Rep. Ireland': 'Ireland', Bosnia: 'Bosnia and Herzegovina' }

/** A domestic league's legal name, from its country: "England League". */
function legalLeagueName(name, country) {
  if (!country || country === 'Europe' || /\//.test(country)) return renameText(name) // competitions keep the table's rename
  return `${COUNTRY_NAME[country] || country} League`
}

module.exports = { RENAMES, renameText, legalLeagueName }
