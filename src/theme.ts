import { StyleSheet, Platform, type TextStyle } from 'react-native'

export const colors = {
  // base
  bg:           '#0A0E1A',
  bgCard:       '#111827',
  bgElevated:   '#1C2333',
  border:       '#1F2937',
  borderLight:  '#374151',

  // text — muted must stay ≥4.5:1 on every dark surface. #6B7280 claimed to
  // and didn't (3.67:1 on bgCard, 3.25 on bgElevated). #8A92A0 measures
  // bg 6.14 · bgCard 5.66 · bgElevated 5.01 · hover 5.09.
  textPrimary:   '#F9FAFB',
  textSecondary: '#9CA3AF',
  textMuted:     '#8A92A0',

  // shared accents that were hardcoded ad hoc around the app
  gold: '#FFD700',

  // accent — changes per league at runtime, this is default
  accent:        '#3B82F6',
  accentDim:     '#1D4ED8',

  // league accents
  leagueAccents: {
    premier_league: '#7C3AED',
    la_liga:        '#EA580C',
    bundesliga:     '#DC2626',
    serie_a:        '#2563EB',
    ligue_1:        '#059669',
  },

  // tiers
  tiers: {
    perfection:            '#F59E0B',
    almost_perfection:     '#FBBF24',
    champions:             '#10B981',
    title_contender:       '#3B82F6',
    champions_league:      '#0EA5E9',
    europa_glory:          '#8B5CF6',
    almost_matters:        '#6B7280',
    respectful_mediocrity: '#4B5563',
    absolute_misery:       '#EF4444',
  },

  // status — `danger` is the ONE red for "loss/eliminated/error" everywhere.
  // (Several screens used to hardcode a second red, #DC2626, for the same
  // meaning — that was never a deliberate second shade, just drift.)
  success: '#10B981',
  warning: '#F59E0B',
  danger:  '#EF4444',
  info:    '#3B82F6',

  // draft-pot badges (UCL seeding, 1–4) — was duplicated as a local
  // `POT_COLORS`/`potColors` object in 3+ separate screens.
  // Pots five and six for the Conference League's six (P8-172); each reads as text on nylon.
  pots: { 1: '#F59E0B', 2: '#A78BFA', 3: '#34D399', 4: '#60A5FA', 5: '#F472B6', 6: '#22D3EE' } as Record<number, string>,

  // modal/overlay scrim — was hardcoded 'rgba(0,0,0,0.7|0.75)' inline in every modal.
  overlay: 'rgba(0, 0, 0, 0.72)',

  // positions
  positions: {
    GK:  '#F59E0B',
    CB:  '#3B82F6',
    LB:  '#60A5FA',
    RB:  '#60A5FA',
    CDM: '#10B981',
    CM:  '#34D399',
    CAM: '#A78BFA',
    LW:  '#F87171',
    RW:  '#F87171',
    ST:  '#EF4444',
  },
}

// Per-mode palettes. WC/UCL/Chaos/Cursed each get a distinct identity instead
// of the default blue accent. Applied via useModeTheme() at high-impact
// touchpoints (headers, CTAs, hero banners, brackets, highlights).
export type ModeTheme = {
  accent:    string   // primary — CTAs, highlights, player rows
  accentDim: string   // pressed/secondary shade of accent
  secondary: string   // supporting hue (emerald, silver, amber, toxic green)
  highlight: string   // brighter pop for winners / emphasis
  bgTint:    string   // subtle mode-tinted background (used in Tier 3)
  banner:    string   // hero/banner backdrop
}

export const MODE_THEMES: Record<string, ModeTheme> = {
  world_cup: {
    accent:    '#F5C518',
    accentDim: '#B8910F',
    secondary: '#0E9F6E',
    highlight: '#FACC15',
    bgTint:    '#0A1410',
    banner:    '#0E2A1F',
  },
  champions_league: {
    accent:    '#4FA9FF',
    accentDim: '#1A237E',
    secondary: '#C7D2FE',
    highlight: '#8AB4F8',
    bgTint:    '#070B1E',
    banner:    '#0C153A',
  },
  chaos: {
    accent:    '#FF3B30',
    accentDim: '#B91C1C',
    secondary: '#F59E0B',
    highlight: '#FF7849',
    bgTint:    '#160606',
    banner:    '#2A0A06',
  },
  cursed: {
    accent:    '#A855F7',
    accentDim: '#7C2D91',
    secondary: '#84CC16',
    highlight: '#C084FC',
    bgTint:    '#0E0614',
    banner:    '#1E0A2E',
  },
  // P8-172: the Europa League's orange, the Conference League's green.
  europa_league: {
    accent:    '#F26722',
    accentDim: '#8A3208',
    secondary: '#FDBA74',
    highlight: '#FB923C',
    bgTint:    '#140A05',
    banner:    '#2A1206',
  },
  conference_league: {
    accent:    '#1DB954',
    accentDim: '#0B3D2E',
    secondary: '#86EFAC',
    highlight: '#4ADE80',
    bgTint:    '#05140C',
    banner:    '#0B2A1A',
  },
  champions_league_custom: {
    accent:    '#0232FF',
    accentDim: '#010056',
    secondary: '#B2BEBE',
    highlight: '#00EEFF',
    bgTint:    '#070B1E',
    banner:    '#010056',
  } 
}
// The custom UCL path shares the classic UCL identity.


// Single source for the full official competition names (Big Fixes §5.5) —
// every screen/label that names these competitions should read from here
// instead of hardcoding "Champions League" / "World Cup" (the internal mode
// ids stay short; this is a display-string-only rename).
export const MODE_LABELS: Record<string, string> = {
  world_cup:                'FIFA World Cup',
  champions_league_custom:  'UEFA Champions League',
  champions_league:         'UEFA Champions League',
  europa_league:            'UEFA Europa League',
  conference_league:        'UEFA Conference League',
}

// Resolve the active palette: mode-specific theme, else the league accent (or
// the default blue) wrapped in a neutral ModeTheme so callers are uniform.
export function getModeTheme(mode: string | null | undefined, leagueAccent?: string | null): ModeTheme {
  if (mode && MODE_THEMES[mode]) return MODE_THEMES[mode]
  const accent = leagueAccent ?? colors.accent
  return {
    accent,
    accentDim: colors.accentDim,
    secondary: colors.success,
    highlight: accent,
    bgTint:    colors.bg,
    banner:    colors.bgElevated,
  }
}

export const spacing = {
  xs:  4,
  sm:  8,
  md:  16,
  lg:  24,
  xl:  32,
  xxl: 48,
}

export const radius = {
  sm:   6,
  md:   12,
  lg:   18,
  full: 9999,
}

export const typography = {
  // sizes
  xs:   11,
  sm:   13,
  md:   15,
  lg:   18,
  xl:   22,
  xxl:  28,
  hero: 38,

  // weights
  regular: '400' as const,
  medium:  '500' as const,
  bold:    '700' as const,
  black:   '900' as const,
}

// Append an alpha suffix to a 6-digit hex color — e.g. withAlpha(colors.accent, 0x33)
// for ~20% opacity. Replaces the `color + '33'` / `color + '22'` pattern that
// was repeated ad hoc (15+ call sites) across draft/mode-select/result screens.
// `pct` is 0–100; converted to a 2-digit hex alpha suffix.
export function withAlpha(hex: string, pct: number): string {
  const clamped = Math.max(0, Math.min(100, pct))
  const alpha = Math.round((clamped / 100) * 255).toString(16).padStart(2, '0')
  return `${hex}${alpha}`
}

/** A 6-digit hex mixed toward ink: `amount` 0 is the colour, 1 is ink. The
 *  landed club's near-black tint behind its card (P8-05). */
export function towardInk(hex: string, amount: number): string {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex)
  if (!m) return '#0C0C0D'
  const n = parseInt(m[1], 16), ink = [0x0c, 0x0c, 0x0d]
  const mix = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((c, i) => Math.round(c + (ink[i] - c) * amount))
  return '#' + mix.map(c => c.toString(16).padStart(2, '0')).join('')
}

// Match-rating 0–10 → band color. Was implemented identically in both
// SquadSummary.tsx and MatchStatsParts.tsx — single source now.
// Match ratings on PoM's own scale (P8.5-33, replacing P8-44's copy of
// SofaScore's published colours: "nothing is actually from the app", the
// maintainer, 29 Sept 2026). The bands and colours are his (1 Oct 2026): the
// logo's volt for 8–9, its red for 5–6, a magenta above 9 for the rare great
// game, and below 5 a violet, "purplish, disgust almost". Mint, slate and
// amber between, none of them SofaScore's blue, teal, green, yellow or orange.
// Ink on the five light fills reads 7.5:1 or better; cotton on the red 4.37:1
// and on the violet 4.46:1 (the dark fills); on nylon every fill but the
// violet reads 3.7:1 or better.
export const RATING_BANDS = [
  { min: 9, colour: '#F264FF' },    // magenta: a great game (ink on it 7.5:1)
  { min: 8, colour: '#D5FF3F' },    // the logo's volt: outstanding (ink 17:1)
  { min: 7, colour: '#62D39A' },    // mint: very good (ink 10.5:1)
  { min: 6.5, colour: '#9FB0C2' },  // slate: a normal game (ink 8.8:1)
  { min: 6, colour: '#E0A43A' },    // amber: below par (ink 8.9:1); not the orange that means "you"
  { min: 5, colour: '#E1141F' },    // the logo's red: a bad day (cotton 4.37:1, the red exception)
  { min: -Infinity, colour: '#8E4FD6' }, // violet: a disgrace (cotton 4.46:1)
] as const
export function ratingColor(r: number): string {
  return RATING_BANDS.find(b => r >= b.min)!.colour
}

/** The figure's colour on a ratingColor chip: cotton on the two dark fills (the
 *  red and the violet), ink on the five light ones. */
/** A rating as it's written everywhere (P8-144's rule): one decimal, or two for
 *  a season average, but a whole number stays whole — "10", never "10.0". */
export function formatRating(r: number, decimals: 1 | 2 = 1): string {
  const f = r.toFixed(decimals)
  return Number(f) % 1 === 0 ? String(Number(f)) : f
}

export function ratingInk(r: number): string {
  return r < RATING_BANDS[4].min ? prim.cotton : prim.ink
}

export const shadows = {
  sm: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.3,
    shadowRadius: 3,
    elevation: 3,
  },
  md: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 8,
    elevation: 6,
  },
  lg: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.5,
    shadowRadius: 16,
    elevation: 12,
  },
}
// ════════════════════════════════════════════════════════════════════════════
// KIT DROP — the redesign's system (docs/ui-overhaul/05-STYLE-GUIDE.md, DESIGN.md)
//
// Everything above this line is the old dark palette, kept only so screens
// that haven't been rebuilt yet still render. New and rebuilt screens read
// from here and never from `colors`.
//
// Three layers: PRIMITIVES (raw values with material names) → ROLES (what a
// value means, resolved per ground) → components. A screen declares which
// ground it stands on and asks for roles; it never picks a primitive itself.
// ════════════════════════════════════════════════════════════════════════════

// A draft card's line (P8-163 notes): keeper, defence, midfield, attack, so a
// grid of sixteen players reads by shape before anyone reads a word. Each
// takes ink text; the attack is Misery red (the logo's, P8.5-26; ink on it 4.02:1).
export const LINE_TINT = { GK: '#FFB224', DEF: '#4DA3FF', MID: '#3DDC84', ATT: '#E1141F' } as const
export type Line = keyof typeof LINE_TINT
export function lineOf(position: string): Line {
  if (position === 'GK') return 'GK'
  if (/^(CB|LB|RB|LWB|RWB|SW)$/.test(position)) return 'DEF'
  if (/^(CDM|DM|CM|CAM|AM|LM|RM)$/.test(position)) return 'MID'
  return 'ATT'
}

export const prim = {
  cotton:      '#F3F3F0',  // white cotton twill, a touch cool of cream on purpose
  label:       '#E2E2DE',  // a printed care label; the sunken surface on cotton
  ruleCotton:  '#CFCFCA',
  ink:         '#0C0C0D',  // screen-print ink
  inkMuted:    '#5A5A60',
  inkFaint:    '#8A8A90',
  nylon:       '#141416',  // black nylon; the floodlight ground
  nylonRaised: '#1F1F22',
  nylonSunken: '#0B0B0C',
  ruleNylon:   '#34343A',
  cottonMuted: '#A4A4AB',
  nylonFaint:  '#6C6C73',
  orange:      '#FF5A00',  // safety orange — the zip-tie tag, always "you"
  // P8.5-26 (29 Sept 2026): the new logo's own volt and red are the app's, so
  // the mark and the screens are one palette (was #4FFF3F / #FF2E4D).
  volt:        '#D5FF3F',  // the logo's volt, the good end, Perfection: 16:1 on nylon, ink on it 17:1
  draw:        '#6E6E74',
  // Misery red (P8-74 / P8-87): loss and danger where a hazard stripe can't
  // fit. The logo's red since P8.5-26: as text on nylon it reads 3.79:1, under
  // AA, which the maintainer accepted as the one exception to the contrast rule
  // (docs/ui-overhaul/13-CARRY-FORWARD.md §3.3). On cotton a deeper shade of
  // the same red keeps text at AA, so the exception stays as small as it can.
  misery:      '#E1141F',  // the logo's red: fill, and text on nylon (3.79:1, the accepted exception); ink on it 4.02:1
  miseryDeep:  '#C0101B',  // the same red as TEXT on cotton (5.67:1)
  // The floodlit pitch (P8-04, from the colour brief): a very dark, warm green,
  // not FIFA-menu green, with lines that are barely there. Cotton text on it
  // reads at about 14:1.
  pitch:       '#14271B',
  pitchLine:   '#2F4A38',
  black:       '#000000',
  // Spot on (P8-38): a pundit's exact call. Gold is for being exactly right,
  // nowhere else; on nylon it reads at 13:1, so it can be text.
  gold:        '#FFD23F',
  // The referee's yellow card (P8-46), for the card mark only. Warmer than
  // gold so the two never read as one another.
  cardYellow:  '#F5C518',
} as const

// P8-95: the lines a graph compares yours against. Identity only (this club,
// that player), never meaning, so none of them is volt, misery red or the
// orange that means "you". Each measured at 3:1 or better against both
// grounds, the contrast a line on a chart needs (scripts/contrast.py:
// cotton 3.61 / 4.11 / 3.09 / 3.83, nylon 4.58 / 4.03 / 5.36 / 4.32).
export const SERIES = ['#2F7FE0', '#8B5CD6', '#1E9E62', '#D8436B'] as const

export type Ground = 'cotton' | 'nylon'

export type Roles = {
  ground: Ground
  bg: string
  surface: string
  sunken: string
  /** Your row in a list or table (P8-23): a quiet background, since the YOU tag
   *  went. `surface` couldn't do it — on cotton it IS the background. */
  yours: string
  text: string          // body text
  textMuted: string     // secondary text
  textFaint: string     // placeholders, disabled; large text only on cotton
  rule: string          // hairlines between rows (decorative)
  line: string          // 1–2px borders that must be seen: tags, plates, fields
  offset: string        // the 2px pressed-label depth
  onFill: string        // text on orange / volt fills (always ink)
  you: string           // orange FILL
  youText: string | null     // orange as TEXT — null on cotton (2.81:1 fails)
  perfection: string    // volt FILL
  perfectionText: string | null  // volt as TEXT — null on cotton (1.04:1)
  draw: string
  loss: string          // misery red FILL
  lossText: string      // misery red as TEXT on this ground
  stripe: [string, string]  // hazard stripe bands
  focus: string
}

// Contrast (computed): text 17.59 / 16.55 · textMuted 6.16 / 7.43 ·
// ink on orange 6.25 · ink on volt 16.95 · orange on nylon 5.88 ·
// volt on nylon 15.95 · draw 4.56 on cotton.
// The Champions League's four pots, each its own colour (P8-114's draw: the
// pot's spine, and a drawn opponent's name). The same four the old Champions
// League screens used, so a pot keeps its colour everywhere; each reads as
// text on nylon at 6.5:1 or better.
export const POT_COLOURS: Record<number, string> = colors.pots

// The colours a player can choose, by id (P8-132's crest, P8-142's side
// colours): the palette's own, never a free hex, so a palette change moves
// every choice with it. The ids live in src/lib/yourCrest.ts (CREST_COLOURS).
const PALETTE_HEX: Record<string, string> = {
  ink: prim.ink, cotton: prim.cotton, orange: prim.orange, volt: prim.volt, red: prim.misery,
  gold: prim.gold, pitch: prim.pitch, amber: POT_COLOURS[1], violet: POT_COLOURS[2], green: POT_COLOURS[3], blue: POT_COLOURS[4],
}
export const paletteHex = (id: string) => PALETTE_HEX[id] ?? prim.ink
/** A colour the player chose: a palette id, or (P8-177's picker) any #rrggbb. */
export const choiceHex = (v: string | null | undefined): string => (v && /^#[0-9a-f]{6}$/i.test(v) ? v : paletteHex(v ?? 'ink'))

export const ROLES: Record<Ground, Roles> = {
  cotton: {
    ground: 'cotton',
    bg: prim.cotton, surface: prim.cotton, sunken: prim.label, yours: prim.label,
    text: prim.ink, textMuted: prim.inkMuted, textFaint: prim.inkFaint,
    rule: prim.ruleCotton, line: prim.ink, offset: prim.ink, onFill: prim.ink,
    you: prim.orange, youText: null,
    perfection: prim.volt, perfectionText: null,
    draw: prim.draw,
    loss: prim.misery, lossText: prim.miseryDeep,
    stripe: [prim.ink, prim.cotton],
    focus: prim.ink,
  },
  nylon: {
    ground: 'nylon',
    bg: prim.nylon, surface: prim.nylonRaised, sunken: prim.nylonSunken, yours: prim.nylonRaised,
    text: prim.cotton, textMuted: prim.cottonMuted, textFaint: prim.nylonFaint,
    rule: prim.ruleNylon, line: prim.cotton, offset: prim.black, onFill: prim.ink,
    you: prim.orange, youText: prim.orange,
    perfection: prim.volt, perfectionText: prim.volt,
    draw: prim.cottonMuted,
    loss: prim.misery, lossText: prim.misery,
    stripe: [prim.cotton, prim.nylon],
    focus: prim.cotton,
  },
}

// Colourways: the woven tape that says WHERE you are. Location, never meaning.
// League runs use the replaced club's colour instead (see colourwayFor).
// P8-98: one treatment for every tape — a woven band of three. It was a mix:
// the World Cup's three stripes, the Champions League's one solid block, and
// Chaos and Cursed a single dark colour that barely read on the dark ground.
// Now each is three bands with a light one in the middle, so every tape reads
// on both grounds and none is plainer than the others.
export const COLOURWAYS: Record<string, string[]> = {
  world_cup:               ['#3CAC3B', '#2A398D', '#E61D25'],  // set by the maintainer
  world_cup_full:          ['#3CAC3B', '#2A398D', '#E61D25'],
  champions_league:        ['#2F4BFF', '#F3F3F0', '#0B1650'],  // the starball's blue, white and navy
  champions_league_custom: ['#2F4BFF', '#F3F3F0', '#0B1650'],
  chaos:                   ['#E0301E', '#F3F3F0', '#141416'],  // a warning: red, white, black
  cursed:                  ['#7234F0', '#B98CFF', '#141416'],  // two purples going dark
  // P8-172: the Europa League's orange and the Conference League's green.
  europa_league:           ['#F26722', '#F3F3F0', '#141416'],
  conference_league:       ['#1DB954', '#F3F3F0', '#0B3D2E'],
}

// P8-55: a league run's tape was plain ink — the season screen's colourway is
// meant to say WHERE you are, and "a league" isn't a where. Each league's own
// brand colours (as its competition marks wear them), checked after the mode
// (chaos and cursed keep theirs whatever league they're played in). A league
// not listed falls back as before. The Tape stitches an edge on any colour
// too close to its ground, so a dark brand colour still reads on nylon.
export const LEAGUE_COLOURWAYS: Record<string, string[]> = {
  premier_league: ['#37003C', '#00FF85'],   // purple and green
  la_liga:        ['#FF4B44', '#1B1B1B'],   // LaLiga red
  serie_a:        ['#0068A8', '#00B4E6'],   // the Serie A blues
  bundesliga:     ['#D20515', '#FFFFFF'],   // Bundesliga red
  ligue_1:        ['#DAE025', '#091C3E'],   // Ligue 1's lime and navy
}

export function colourwayFor(mode: string | null | undefined, clubColour?: string | null, leagueId?: string | null): string[] {
  if (mode && COLOURWAYS[mode]) return COLOURWAYS[mode]
  if (leagueId && LEAGUE_COLOURWAYS[leagueId]) return LEAGUE_COLOURWAYS[leagueId]
  return [clubColour ?? prim.ink]
}

// Font family keys, registered once in app/_layout.tsx. Each weight/style is
// its own family and `fontWeight` is never set on kit text: Android resolves
// custom fonts by family name and silently falls back when a weight is asked for.
//
// SUPER: the plan named Archivo ExtraCondensed Black Italic, but the static
// Google Fonts builds only ship Archivo at normal width. The style guide's
// fallback rule ("an extra-condensed grotesque with a true italic") picks
// Barlow Condensed Black Italic — a real drawn italic, not a slanted roman.
// Web gets a fallback stack after each face (Phase 7): the page now paints
// before the font files arrive, and without one the browser drew Times New
// Roman in the gap. Native resolves by exact family name, so it keeps the bare key.
const withFallback = (family: string, stack: string) => (Platform.OS === 'web' ? `${family}, ${stack}` : family)
const CONDENSED = '"Arial Narrow", "Roboto Condensed", sans-serif'
const MONO = 'ui-monospace, "Cascadia Mono", Consolas, monospace'
const SANS = 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif'
export const font = {
  super:       withFallback('Kit-Super', CONDENSED),        // Barlow Condensed 900 Italic
  superPlain:  withFallback('Kit-SuperPlain', CONDENSED),   // Barlow Condensed 800 (upright; tags on plates)
  tag:         withFallback('Kit-Tag', MONO),               // Martian Mono 500
  tagBold:     withFallback('Kit-TagBold', MONO),           // Martian Mono 700
  body:        withFallback('Kit-Body', SANS),              // Archivo 400
  bodyMedium:  withFallback('Kit-BodyMedium', SANS),        // Archivo 500
  bodyBold:    withFallback('Kit-BodyBold', SANS),          // Archivo 700
  bodyBlack:   withFallback('Kit-BodyBlack', SANS),         // Archivo 800
}

// Type scale (style guide §3.2). Supers use lineHeight = size: the guide's
// tighter 72/64 clips the italic's ascenders on Android.
export const type = {
  superXl:  { fontFamily: font.super, fontSize: 72, lineHeight: 72 },
  superL:   { fontFamily: font.super, fontSize: 48, lineHeight: 48 },
  superM:   { fontFamily: font.super, fontSize: 32, lineHeight: 32 },
  superS:   { fontFamily: font.super, fontSize: 22, lineHeight: 24 },
  title:    { fontFamily: font.bodyBold, fontSize: 18, lineHeight: 24 },
  bodyL:    { fontFamily: font.body, fontSize: 15, lineHeight: 22 },
  body:     { fontFamily: font.body, fontSize: 13, lineHeight: 18 },
  figureL:  { fontFamily: font.bodyBold, fontSize: 28, lineHeight: 30, fontVariant: ['tabular-nums' as const] },
  figure:   { fontFamily: font.bodyMedium, fontSize: 13, lineHeight: 18, fontVariant: ['tabular-nums' as const] },
  tag:      { fontFamily: font.tag, fontSize: 11, lineHeight: 14, letterSpacing: 0.44, textTransform: 'uppercase' as const },
  button:   { fontFamily: font.bodyBlack, fontSize: 15, lineHeight: 18, letterSpacing: 0.3, textTransform: 'uppercase' as const },
} satisfies Record<string, TextStyle>

export type TypeToken = keyof typeof type

// Spacing and density (style guide §4).
export const space = { 1: 4, 2: 8, 3: 12, 4: 16, 5: 24, 6: 32, 7: 48, 8: 64 } as const
export const density = {
  t1: { row: 56 },
  t2: { row: 48 },
  t3: { row: 36, hit: 48 },
} as const

// Borders and depth (style guide §5). Radius is 0 everywhere except the short
// list in the guide (rivets, flags, the zip tag's head).
export const border = { hair: StyleSheet.hairlineWidth, thin: 1, plate: 2, tape: 4 } as const
export const OFFSET = 2
