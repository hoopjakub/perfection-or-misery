import factsData from '../../scripts/club_facts.json'
import { BRAND_MODE } from './brand'
// Plain JS (Babel's config reads it too): src/data/legal-names.js.
import { renameText } from '../data/legal-names'

// The facts are JSON, which the legal build's Babel rename never sees, so the
// legal flavour renames them here, once, when the module loads (P8.5-30): "Won
// the Champions League in 2012" reads "Won the European Cup in 2012".
const FACTS: Record<string, string[]> = BRAND_MODE === 'real'
  ? (factsData as Record<string, string[]>)
  : Object.fromEntries(Object.entries(factsData as Record<string, string[]>).map(([k, v]) => [k, v.map(renameText)]))

export function getRandomFact(clubId: string): string | null {
  const clubFacts = FACTS[clubId]
  if (!clubFacts || clubFacts.length === 0) return null
  return clubFacts[Math.floor(Math.random() * clubFacts.length)]
}
