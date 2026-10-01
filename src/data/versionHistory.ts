// The version history (P8-73). The app said 0.0.1 from its first build until
// September 2026, so these versions are numbered after the fact, one per
// milestone. The dates and what changed come from the commit history on
// GitHub (hoopjakub/perfection-or-misery: 37 commits, 8 June to 19 September
// 2026, read 24 September) and, for the work since the last commit, the
// roadmap. The commit messages are short, so some entries are filled in from
// the project's documents of the same days; `source` says which. The newest
// entry is the version app.json carries, so the version button and this list always agree.
export type VersionEntry = {
  version: string
  /** What the page prints: "12 June 2026", "25–29 June 2026". */
  when: string
  /** Where the date and the list come from. */
  source: string
  title: string
  changes: string[]
}

export const VERSION_HISTORY: VersionEntry[] = [
  {
    version: '0.9.0', when: '26–28 September 2026',
    source: 'the roadmap (docs/ui-overhaul/11-ROADMAP.md, Phase 8, batches 19 to 24) and docs/europe; not committed yet',
    title: 'A whole season, and Europe',
    changes: [
      'The Europa League and the Conference League, on their real 2025–26 fields and pots.',
      "A league run plays its league's cup too, and winning both is the Double.",
      'The full path runs through all three European competitions: every cup, every access list, and the drop when you lose in qualifying.',
      'The pundits play out their own whole tournament, before the run and against what happened.',
      'Seasons with ranks and badges, a career screen rebuilt, and the golden glove winner in goal.',
      'Clubs with a tag and a chat, a profile you can dress like a Discord card, a real colour picker and your pin everywhere.',
      'A new globe that zooms into your country, flags on every draft card, and Chaos and Cursed with a look of their own.',
      'Run links that open the app directly, and web analytics.',
    ],
  },
  {
    version: '0.8.0', when: '19–25 September 2026',
    source: 'the roadmap (docs/ui-overhaul/11-ROADMAP.md, Phases 7 and 8 to batch 18)',
    title: 'The identity pass',
    changes: [
      'Real flags for every nation, crests for every club, and team colours on the match sheet.',
      'Awards for every position, a team of the season and a team of every matchday.',
      'A panel of twelve pundits, each with their own preview, checked by the verdict.',
      'Commentary, a shot map, and penalty shoot-outs taken kick by kick.',
      'A settings screen, a guide that opens on a choice of topics, and this version history.',
      'Every knockout drawn as one real bracket: before the first round, in the run hub, and on the result screens.',
      'Profiles you shape yourself, and every run says whose it is.',
    ],
  },
  {
    version: '0.7.0', when: '19 September 2026',
    source: 'the commits of 19 September ("check roadmap all the way to phase 6") and the roadmap, Phases 0 to 6',
    title: 'Kit Drop',
    changes: [
      'The redesign: football-shirt labels, tapes and plates in place of the old dark cards, with new type, colours, icons and a wordmark.',
      'The setup, the draft, the draw, the season, the knockouts, Awards Night and the verdict rebuilt on it.',
      'The run hub: the table, the bracket, your season, the stats boards, the press and your squad on one page, with pages for every player, club and story.',
      'Wide layouts for tablets and desktop, and the web version on Vercel.',
      'Runs scored by one shared formula, ready to move to the server.',
    ],
  },
  {
    version: '0.6.0', when: '23–27 July 2026',
    source: 'the commits of 23 and 27 July ("UPDATE TO MATCH STATS SCREEN AND SMALL SIMULATION") and the Big Fixes plan of the same days',
    title: 'The match experience',
    changes: [
      'The match stats screen reworked.',
      'The Big Fixes plan: one knockout look everywhere, the Deep Match for finals, match momentum, a match page with tabs, lineups and injuries, and Era mode retired. All of it is in the next commit, 19 September.',
    ],
  },
  {
    version: '0.5.0', when: '14–18 July 2026',
    source: 'the commits of 14, 15 and 18 July',
    title: 'Deep stats and live matches',
    changes: [
      'Proper match stats for every game, a 0–10 rating for every player, and a Player of the Match.',
      'Average ratings across a run.',
      'Your matches played live, on a ticking clock.',
      'Difficulty that means something, and the match engine reworked.',
    ],
  },
  {
    version: '0.4.0', when: '11 July 2026',
    source: 'the commits of 11 July ("Substitues, Scorers, Lots of Fixes and Next Up")',
    title: 'Substitutes and scorers',
    changes: [
      'Substitutes.',
      'Goalscorers for every match.',
      'The full Champions League path, from a domestic season through qualifying (in place by 12 July, per that day\'s plan).',
      'Lots of fixes.',
    ],
  },
  {
    version: '0.3.0', when: '25–29 June 2026',
    source: 'the commits of 25 to 29 June and docs/Major Overhaul + Bug fixes.md (26 June)',
    title: 'The major overhaul',
    changes: [
      'A new look for almost everything.',
      'Penalty shoot-outs that stop when they are decided.',
      'Top scorers, assists and clean sheets for the whole competition, Player of the Season and Best U21, and a lifetime career for every player you draft.',
      'The spinning globe that reveals where you land.',
      'The scrapers, and a new database: the Champions League in its new format, the full World Cup, and eight seasons of the top five leagues.',
    ],
  },
  {
    version: '0.2.0', when: '17–19 June 2026',
    source: 'the commits of 17 to 19 June ("WC mode works down to perfection")',
    title: 'The World Cup, and new modes',
    changes: [
      'The World Cup mode.',
      'New modes.',
      'A look of its own for each mode.',
    ],
  },
  {
    version: '0.1.0', when: '12 June 2026',
    source: 'the commits of 8 to 13 June ("we are about to see probably the first v0.1")',
    title: 'The first game',
    changes: [
      'Sign up and log in.',
      'Choose a mode, spin for clubs and draft your XI from real club-seasons.',
      'Simulate the season and get a result, saved to your runs.',
      'Real players in a database that ships with the app.',
    ],
  },
]
