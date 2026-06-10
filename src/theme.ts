export const colors = {
  // base
  bg:           '#0A0E1A',
  bgCard:       '#111827',
  bgElevated:   '#1C2333',
  border:       '#1F2937',
  borderLight:  '#374151',

  // text
  textPrimary:   '#F9FAFB',
  textSecondary: '#9CA3AF',
  textMuted:     '#4B5563',

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
    europa_glory:          '#8B5CF6',
    almost_matters:        '#6B7280',
    respectful_mediocrity: '#4B5563',
    absolute_misery:       '#EF4444',
  },

  // status
  success: '#10B981',
  warning: '#F59E0B',
  danger:  '#EF4444',
  info:    '#3B82F6',

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