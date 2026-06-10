import facts from '../../scripts/seed/club_facts.json'

export function getRandomFact(clubId: string): string | null {
  const clubFacts = (facts as Record<string, string[]>)[clubId]
  if (!clubFacts || clubFacts.length === 0) return null
  return clubFacts[Math.floor(Math.random() * clubFacts.length)]
}