import { useWindowDimensions } from 'react-native'

// Window size classes (docs/ui-overhaul/10-ADAPT-OPTIMIZE-A11Y.md §2.1).
// Structure comes from the window's width, never from which device it is: a
// narrow browser window is compact, a landscape tablet is expanded.
export type SizeClass = 'compact' | 'medium' | 'expanded'

export const MEDIUM_MIN = 600
export const EXPANDED_MIN = 1024   // = RAIL_MIN_WIDTH: the left rail appears here
/** Widest the content ever gets on a desktop; past this it centres. */
export const MAX_CONTENT = 1440
/** The reading column one-pane screens keep on wide windows. */
export const COLUMN = 640

export function sizeClassOf(width: number): SizeClass {
  return width >= EXPANDED_MIN ? 'expanded' : width >= MEDIUM_MIN ? 'medium' : 'compact'
}

export function useSizeClass(): SizeClass {
  return sizeClassOf(useWindowDimensions().width)
}
