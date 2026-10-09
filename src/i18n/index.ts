// P8.5-28 · English and Slovak (docs/release/04-LANGUAGES.md, answers S1–S7).
//
// One i18next instance, started HERE, synchronously, before any screen's
// module is evaluated: app/_layout.tsx imports this first. The language is
// then fixed for the whole launch, exactly like the appearance
// (src/lib/appearance.ts) and for the same reason: hundreds of option lists
// and labels live at module level, where a hook can't reach. So `t()` works
// anywhere, at module level included, and changing the language reloads the
// app (reloadForAppearance). That's also why there's no react-i18next: with
// nothing to re-render on a switch, it had nothing to do.
//
// Language: Settings → Language (System / English / Slovenčina); System
// follows the phone (S2). It reads the phone through Intl rather than
// expo-localization, which is a native module, and the maintainer makes no
// native builds until Phase 9.5. Czech phones get Slovak too: closer to them
// than English.
//
// S5, all at once: until every area of `en` has its Slovak (SLOVAK_READY),
// players get English whatever they choose, and the switch only shows in
// development builds, where the maintainer reviews the Slovak as it's written.
//
// The check that can fail: scripts/verify-i18n.ts (missing or extra Slovak
// keys, placeholders that differ, plain English left in a finished area).
import i18n from 'i18next'
import { countryNameIn } from '@/data/countries-sk'
import { en } from './en'
import { sk } from './sk'
import type { LanguageChoice } from '@/store/settingsStore'

export type Language = 'en' | 'sk'

// Every English key has its Slovak (plural keys by their base). An area can be
// part-written in ./sk.ts: what's missing shows in English, and counts here.
function leaves(o: object, at = ''): string[] {
  return Object.entries(o).flatMap(([k, v]) => (typeof v === 'string' ? [at + k.replace(/_(one|few|many|other)$/, '')] : leaves(v, `${at}${k}.`)))
}
const slovak = new Set(leaves(sk))
/** English keys with no Slovak yet (scripts/verify-i18n.ts lists them). */
export const SLOVAK_PENDING = [...new Set(leaves(en))].filter(k => !slovak.has(k))
// Keys alone don't say a screen is done: a screen with English typed into it
// has no keys yet. This is set true once scripts/verify-i18n.ts finds no
// English left anywhere it scans (S5: nobody sees a half-Slovak app).
// Set 2 Oct 2026 (Wave E): every screen, the engine's words and the labels.
const EVERY_SCREEN_MOVED = true
/** Every key written in Slovak and every screen on keys: players get the switch. */
export const SLOVAK_READY = EVERY_SCREEN_MOVED && SLOVAK_PENDING.length === 0
const DEV_TOOLS = (typeof __DEV__ !== 'undefined' && __DEV__) || process.env.EXPO_PUBLIC_DEV_TOOLS === '1'
/** Whether Settings offers the language at all (see S5 above). */
export const LANGUAGE_CHOOSABLE = SLOVAK_READY || DEV_TOOLS

function phoneLanguage(): Language {
  try { return /^(sk|cs)\b/i.test(Intl.DateTimeFormat().resolvedOptions().locale) ? 'sk' : 'en' } catch { return 'en' }
}
export function resolveLanguage(choice: LanguageChoice): Language {
  if (!LANGUAGE_CHOOSABLE) return 'en'
  return choice === 'system' ? phoneLanguage() : choice
}

// Hermes may lack Intl.PluralRules, which i18next needs for Slovak's three
// forms (1 gól, 2–4 góly, 5 gólov). Only our two languages, only cardinals.
// ponytail: hand rules for en and sk; a polyfill if a third language comes.
if (typeof Intl !== 'undefined' && typeof (Intl as any).PluralRules === 'undefined') {
  ;(Intl as any).PluralRules = class {
    private sk: boolean
    constructor(code: string) { this.sk = /^(sk|cs)/i.test(code) }
    select(n: number) {
      if (!this.sk) return n === 1 ? 'one' : 'other'
      if (!Number.isInteger(n)) return 'many'
      return n === 1 ? 'one' : n >= 2 && n <= 4 ? 'few' : 'other'
    }
    resolvedOptions() { return { pluralCategories: this.sk ? ['one', 'few', 'many', 'other'] : ['one', 'other'] } }
  }
}

// The saved choice, read through a guarded require: the engine's verify
// scripts import helpers that use t() and run in plain Node, where the
// settings store (React Native, MMKV) can't load. There they get English.
function savedChoice(): LanguageChoice {
  // POM_LANGUAGE=sk lets a verify script run the engine's words in Slovak.
  try { return require('../store/settingsStore').useSettingsStore.getState().language } catch { return (process.env.POM_LANGUAGE as LanguageChoice | undefined) ?? 'system' }
}

/** This launch's language. */
export const LANGUAGE: Language = resolveLanguage(savedChoice())

i18n.init({
  initAsync: false,
  lng: LANGUAGE,
  fallbackLng: 'en',
  // Our strings are React text, never HTML: nothing to escape.
  interpolation: { escapeValue: false },
  resources: { en: { translation: en }, sk: { translation: sk } },
  returnNull: false,
})

/** The translation function, usable anywhere (see the top). */
// P9.75 (9 Oct: "URUGUAY XI" on the share card, after 22 names fixed by hand
// the day before): a nation's name handed to t() as a parameter is shown in
// the app's language, here, once. The data keeps the English names (they key
// the flags, the venues, the saved runs); a parameter is always display text,
// and no club's or player's name is exactly a nation's. Screens that print a
// name outside t() still use countryName() (verify-i18n).
const rawT = i18n.t.bind(i18n)
function shownParams(opts: unknown): unknown {
  if (LANGUAGE !== 'sk' || !opts || typeof opts !== 'object' || Array.isArray(opts)) return opts
  let out: Record<string, unknown> | null = null
  for (const [k, v] of Object.entries(opts as Record<string, unknown>)) {
    if (typeof v !== 'string') continue
    const shown = countryNameIn(v, 'sk')
    if (shown !== v) (out ??= { ...(opts as Record<string, unknown>) })[k] = shown
  }
  return out ?? opts
}
export const t = ((key: any, opts?: any, ...rest: any[]) => (rawT as any)(key, shownParams(opts), ...rest)) as unknown as typeof i18n.t

/** True when a new choice would change this launch's language. */
export const languageChanges = (next: LanguageChoice) => resolveLanguage(next) !== LANGUAGE

/** The locale numbers and dates are written in: 1 234,5 in Slovak. */
export const LOCALE = LANGUAGE === 'sk' ? 'sk-SK' : 'en-GB'
/** A number with fixed decimals as this language writes it (5.3 / 5,3). */
export const dec = (n: number, digits = 1) =>
  n.toLocaleString(LANGUAGE === 'sk' ? 'sk-SK' : 'en-US', { minimumFractionDigits: digits, maximumFractionDigits: digits })
/** A figure already written as text ("×1.37"), with this language's decimal mark ("×1,37"). */
export const numText = (s: string) => (LANGUAGE === 'sk' ? s.replace(/(\d)\.(\d)/g, '$1,$2') : s)
/** A whole number as this language writes it (12,345 / 12 345). */
export const num = (n: number) => n.toLocaleString(LANGUAGE === 'sk' ? 'sk-SK' : 'en-US')

// The web page says which language it's in, for screen readers and search.
if (typeof document !== 'undefined' && document.documentElement) document.documentElement.lang = LANGUAGE
