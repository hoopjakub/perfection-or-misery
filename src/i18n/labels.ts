// P8.5-28 · The engine's own labels, in the app's language, at display time.
//
// The engine names rounds and matches in English ("Round of 16 · Leg 2",
// "Matchday 3", "Group B · MD 2") and READS those names back: kickoffFor
// (src/engine/schedule.ts) finds the date from them, the brackets find a
// round by them. So they stay English where they're made, and every screen
// shows them through label(), which translates a whole label, or each part
// of one joined with " · ", from the phrases and patterns below. In English
// it hands the label back untouched. A phrase it doesn't know stays English:
// add it here.
import { LANGUAGE } from './index'

// English phrase (lower case) → Slovak.
const SK: Record<string, string> = {
  'round of 16': 'Osemfinále',
  'round of 32': 'Šestnásťfinále',
  'quarter-final': 'Štvrťfinále',
  'quarter-finals': 'Štvrťfinále',
  'semi-final': 'Semifinále',
  'semi-finals': 'Semifinále',
  final: 'Finále',
  playoff: 'Play-off',
  'play-off': 'Play-off',
  'play-offs': 'Play-off',
  'play-off round': 'Play-off',
  'knockout play-off (9th–24th)': 'Play-off vyraďovacej fázy (9.–24.)',
  'regular season': 'Základná časť',
  'domestic season': 'Domáca sezóna',
  'playoff round': 'Play-off',
  'fifa world cup final': 'Finále majstrovstiev sveta',
  'world cup final': 'Finále majstrovstiev sveta',
  'third-place playoff': 'Zápas o 3. miesto',
  'round': 'Kolo',
  'knockout play-off': 'Play-off vyraďovacej fázy',
  'knockout playoff': 'Play-off vyraďovacej fázy',
  knockouts: 'Vyraďovacia fáza',
  'knockout stage': 'Vyraďovacia fáza',
  'first qualifying round': '1. predkolo',
  'second qualifying round': '2. predkolo',
  'third qualifying round': '3. predkolo',
  'league phase': 'Ligová fáza',
  'group stage': 'Skupinová fáza',
  groups: 'Skupiny',
  group: 'Skupina',
  qualifying: 'Kvalifikácia',
  'champions path': 'Cesta majstrov',
  'league path': 'Ligová cesta',
  direct: 'Priamo',
  'first round': '1. kolo',
  'second round': '2. kolo',
  'last sixteen': 'Osemfinále',
  'third place': 'O 3. miesto',
  '3rd-place playoff': 'Zápas o 3. miesto',
  'third-place play-off': 'Zápas o 3. miesto',
  'leg 1': 'Prvý zápas',
  'leg 2': 'Odveta',
  'first leg': 'Prvý zápas',
  'second leg': 'Odveta',
  'extra time': 'Predĺženie',
  penalties: 'Penalty',
  'after extra time': 'Po predĺžení',
  aet: 'pp',
  pens: 'pen.',
  league: 'Liga',
  cup: 'Pohár',
  'domestic cup': 'Domáci pohár',
  'super cup': 'Superpohár',
  champions: 'Majstri',
  'runners-up': 'Finalisti',
  'semi-finalists': 'Semifinalisti',
  'quarter-finalists': 'Štvrťfinalisti',
  winners: 'Víťazi',
  // The points breakdown (supabase/functions/_shared/score.ts, which the
  // server runs too, so it can't import the app's language).
  'how far you went': 'Dosiahnuté kolo',
  unbeaten: 'Bez prehry',
  'a hunt that reached its target': 'Lov, ktorý dosiahol cieľ',
  difficulty: 'Obťažnosť',
  'won every match': 'Všetky zápasy vyhrané',
  'all time': 'Všetky časy',
  // An award's score, part by part (src/engine/stats.ts, importance.ts).
  goals: 'Góly',
  assists: 'Asistencie',
  'clean sheets': 'Čisté kontá',
  'man of the match': 'Hráč zápasu',
  'penalties won': 'Vybojované penalty',
  'chances created': 'Vytvorené šance',
  'big chances created': 'Vytvorené veľké šance',
  'shots on target': 'Strely na bránu',
  dribbles: 'Driblingy',
  'tackles won': 'Úspešné zákroky',
  interceptions: 'Zachytené lopty',
  'clearances and blocks': 'Odkopy a blokovania',
  clearances: 'Odkopy',
  blocks: 'Blokovania',
  saves: 'Zákroky',
  'penalties saved': 'Chytené penalty',
  'own goals': 'Vlastné góly',
  'errors leading to goals': 'Chyby pred gólom',
  'duels won': 'Vyhraté súboje',
  'accurate passes': 'Presné prihrávky',
  'title holder': 'Obhajca titulu',
  'your xi': 'Tvoja jedenástka',
  'europa league final': 'Finále Európskej ligy',
  'conference league final': 'Finále Konferenčnej ligy',
  'champions league final': 'Finále Ligy majstrov',
  'ucl final': 'Finále Ligy majstrov',
  // A goalkeeper's slot takes nobody else (src/engine/formations.ts).
  'who else would it even be?': 'A kto iný by to mal byť?',
}

const PATTERNS: [RegExp, (m: RegExpMatchArray) => string][] = [
  [/^matchday (\d+)$/i, m => `${m[1]}. kolo`],
  [/^md ?(\d+)$/i, m => `${m[1]}. kolo`],
  [/^round (\d+)$/i, m => `${m[1]}. kolo`],
  [/^group ([a-l])$/i, m => `Skupina ${m[1].toUpperCase()}`],
  [/^leg (\d)$/i, m => (m[1] === '1' ? 'Prvý zápas' : 'Odveta')],
  [/^leg (\d) (.+)$/i, m => `${m[1] === '1' ? 'Prvý zápas' : 'Odveta'} ${m[2]}`],
  [/^pens? (.+)$/i, m => `pen. ${m[1]}`],
  [/^agg(?:regate)? (.+)$/i, m => `súčet ${m[1]}`],
  [/^pot (\d)$/i, m => `Kôš ${m[1]}`],
  [/^(\d+)(st|nd|rd|th)$/i, m => `${m[1]}.`],
  [/^team rated (\d+) \(over 80\)$/i, m => `Tím s OVR ${m[1]} (nad 80)`],
  [/^finished (\d+) of (\d+)$/i, m => `${m[1]}. miesto z ${m[2]}`],
  [/^big matches ×(.+)$/i, m => `Veľké zápasy ×${m[1].replace('.', ',')}`],
]

function one(part: string): string {
  const key = part.trim().toLowerCase()
  const out = SK[key]
  if (out === undefined) {
    // A pattern's English is often an abbreviation in capitals ("MD 2"), so
    // its Slovak keeps its own case.
    for (const [re, f] of PATTERNS) { const m = part.trim().match(re); if (m) return f(m) }
    return part
  }
  // Keep a phrase written in capitals in capitals (tags: "ROUND OF 16").
  return part === part.toUpperCase() && /[A-Z]/.test(part) ? out.toUpperCase() : out
}

/** An engine-made label in a given language (the verifier checks Slovak with it). */
export function labelIn(text: string | null | undefined, lang: 'en' | 'sk'): string {
  if (!text) return text ?? ''
  if (lang === 'en') return text
  return text.split(' · ').map(one).join(' · ')
}

/** An engine-made label in the app's language (see the top). */
export const label = (text: string | null | undefined): string => labelIn(text, LANGUAGE)
