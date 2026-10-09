// The club facts. Its own module so the public build can swap it for an empty
// twin (clubFactsData.legal.ts): the facts are free text about real clubs, and
// a JSON import is bundled whatever the build.
//
// Phase 9.75 (D7): in English and Slovak, for every club. The hand-written
// facts (scripts/club_facts.json, twenty Premier League clubs) come first;
// short sentences from Wikidata (scripts/club_facts_wd.json, built by
// scripts/build-club-facts.ts) follow for every club.
import hand from '../../scripts/club_facts.json'
import open from '../../scripts/club_facts_wd.json'

type ByClub = Record<string, string[]>
type ByLang = Record<string, ByClub>

function merged(lang: string): ByClub {
  const a = (hand as ByLang)[lang] ?? {}, b = (open as ByLang)[lang] ?? {}
  const out: ByClub = {}
  for (const id of new Set([...Object.keys(a), ...Object.keys(b)])) out[id] = [...(a[id] ?? []), ...(b[id] ?? [])]
  return out
}

const facts: ByLang = { en: merged('en'), sk: merged('sk') }
export default facts
