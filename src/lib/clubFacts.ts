import factsData from './clubFactsData'
import { BRAND_MODE } from './brand'

// The facts are JSON, which the legal build's Babel rename never sees. P8.5-30
// renamed the competitions in them here; but they are free text about real
// clubs, and once the public build alters club names (Wave D) a fact that
// names a cup or a rival the rename table doesn't know ("FA Cup") would leak
// the real one. The public build shows none: twenty clubs lose a line, and
// nothing can slip through.
const FACTS: Record<string, string[]> = BRAND_MODE === 'real' ? factsData : {}

/** How many clubs have facts in this build (Diagnostics' data check; 0 in the legal build, on purpose). */
export const clubFactCount = () => Object.keys(FACTS).length

export function getRandomFact(clubId: string): string | null {
  const clubFacts = FACTS[clubId]
  if (!clubFacts || clubFacts.length === 0) return null
  return clubFacts[Math.floor(Math.random() * clubFacts.length)]
}
