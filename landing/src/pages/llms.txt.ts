// The site's own llms.txt (08 H6), in the legal flavour's names.
import type { APIRoute } from 'astro'
import { GAME_URL } from '../i18n'
export const GET: APIRoute = ({ site }) => new Response(`# Perfection or Misery

> A free football-management roguelike for Android and the web. You draft an XI from random real club-seasons, get dropped into a league or a cup (a domestic league, the European Cup, the Europa Cup, the Conference Cup, or the World Cup), simulate the season, and get a verdict from PERFECTION down to ABSOLUTE MISERY. Club and competition names are changed; no crests or logos are used.

- [The landing page](${new URL('/', site)}): what the game is, in English and Slovak
- [Play in the browser](${GAME_URL}/)
- [How it works](${GAME_URL}/guide)
- [Ranks](${GAME_URL}/leaderboard)
- [Privacy](${GAME_URL}/privacy) and [Terms](${GAME_URL}/terms)

Made by one developer in Slovakia. Not affiliated with any player, club, league or governing body.
`, { headers: { 'Content-Type': 'text/plain; charset=utf-8' } })
