// The club facts (scripts/club_facts.json). Its own module so the public build
// can swap it for an empty twin (clubFactsData.legal.ts): the facts are free
// text about real clubs, and a JSON import is bundled whatever the build.
import facts from '../../scripts/club_facts.json'
export default facts as Record<string, string[]>
