import { FORMAT_EXPLAINER } from './league-formats'

// Plain-language explainers for the `?` info-bubbles across the special-mode /
// custom Champions League screens (docs §11). One concept per topic, written
// like you'd explain it to a mate watching their first European campaign —
// no UEFA legalese. Wired via <InfoBubble topic="..." /> and the full-rulebook
// modal (<RulesModal />), which shows RULES_ORDER top to bottom.

export type Explainer = { title: string; text: string }

export const EXPLAINERS: Record<string, Explainer> = {
  the_road: {
    title: 'The road to the Champions League',
    text: "This mode plays out the real route to the Champions League. You take over one club, play a full domestic season, and your final league position decides everything: a great finish can put you straight into the 36-team League Phase, a decent one throws you into the qualifying rounds, and a bad one means no European football at all. Domestic season → qualifiers → League Phase → knockouts → the final. Every step is earned.",
  },

  league_simulation: {
    title: 'Every league is real',
    text: "All 53 UEFA countries' leagues get played out from scratch this run — every match, from the Premier League down to San Marino. Nothing is copied from real life's final tables: if Arsenal collapse or Malmö go unbeaten, that happened HERE. The Champions League field is then built from those results, exactly like the real access rules would.",
  },

  entry_point: {
    title: 'Where you enter (and why)',
    text: "UEFA ranks every country by how well its clubs have done in Europe over the last five seasons — the 'coefficient'. Stronger countries get more spots, and better entry points. England's top four walk straight into the League Phase; Malta's champion has to win four two-legged qualifying ties to get there. The badges next to each league position show exactly what that finish earns — and anything below the last badge earns nothing.",
  },

  qualifying_ladder: {
    title: 'The qualifying rounds',
    text: "Dozens of champions and runners-up from smaller leagues fight over the last 7 League Phase places. It's a ladder of two-legged knockout rounds: First Qualifying Round → Second → Third → Play-off Round. Win your tie and you climb; lose once and your European season is over on the spot. The lower your league's ranking, the further down the ladder you start — and the more ties you must survive.",
  },

  champions_vs_league_path: {
    title: 'Champions Path vs League Path',
    text: "Qualifying runs in two separate lanes that never meet. The CHAMPIONS PATH is only for clubs that WON their league — so a small nation's champion never has to beat, say, a fourth-placed Dutch side to reach the group. The LEAGUE PATH is for the runners-up and third/fourth-placed clubs from mid-ranked countries. Five clubs come through the Champions Path, two through the League Path.",
  },

  two_legged_tie: {
    title: 'Two-legged ties',
    text: "One tie, two matches — one at each club's stadium. Add both scores together (the 'aggregate') and the higher total goes through. Win 3-0 away and you can afford to lose 1-2 at home: 4-2 on aggregate, you advance. Away goals used to break ties, but that rule was scrapped in 2021 — now it's purely the total.",
  },

  extra_time: {
    title: 'Extra time & penalties',
    text: "If the aggregate is level when the second leg hits 90 minutes, that match continues into 30 minutes of extra time — tired legs, everything on the line. Still level after 120? Penalty shoot-out, right there at the second leg's stadium. Note extra time can only ever happen in the SECOND leg; the first leg always just ends after 90.",
  },

  league_phase: {
    title: 'The League Phase',
    text: "The old group stage is gone. Now all 36 clubs sit in ONE giant table, but each club only plays 8 of the other 35 — two opponents from each of the four seeding pots, one at home, one away. You never play the same club twice, and never a club from your own country. Eight different nights, eight different opponents, one shared table.",
  },

  league_phase_zones: {
    title: 'Reading the table',
    text: "Finish 1st–8th and you skip straight to the Round of 16 — the reward for a big League Phase. Finish 9th–24th and you get a second chance: a two-legged Playoff for the remaining eight Round of 16 spots. Finish 25th or lower and you're out of Europe completely — no dropping down into the Europa League, nothing. The colour dots next to each position show which band you're in.",
  },

  pots: {
    title: 'Seeding pots',
    text: "The 36 clubs are ranked by their European pedigree and split into four pots of nine — Pot 1 holds the giants, Pot 4 the newcomers. Everyone draws two opponents from every pot, so nobody gets eight easy games or eight nightmares. Your pot doesn't change who you CAN beat — but a Pot 4 club facing two Pot 1 sides knows exactly how steep the hill is.",
  },

  holders: {
    title: 'The title holders',
    text: "The reigning Champions League and Europa League winners are guaranteed a League Phase place, even if they flopped domestically. Right now that's Paris Saint-Germain (UCL) and Aston Villa (UEL). If you take over a holder, finishing mid-table at home doesn't end your season — champions get to defend their crown.",
  },

  knockout_playoff: {
    title: 'The Knockout Play-off (9th–24th)',
    text: "Miss the top 8 but stay above 25th, and you land here: a two-legged elimination round played BEFORE the Round of 16. The sides ranked 9th–16th are seeded and drawn against the unseeded 17th–24th — finish higher and you dodge the strongest opponents. Win your tie and you join the top 8 in the Round of 16; lose and your European season ends here. It's the safety net for a shaky League Phase — but only half of the sixteen survive it.",
  },

  knockout_bracket: {
    title: 'The knockout rounds',
    text: "From the Round of 16 it's pure knockout: two-legged ties (with extra time and penalties if needed) through the quarters and semis, then ONE final at a neutral stadium — 90 minutes, no second chance. Your League Phase finish seeds the bracket, so finishing 1st gives you a kinder route than scraping in 24th. Lose anywhere and you're done; win six ties and you're champions of Europe.",
  },

  bye: {
    title: 'What does "bye" mean?',
    text: "When a qualifying round has an odd number of entrants, one club can't be paired up — so the strongest side by ranking 'sits the round out' and advances automatically without kicking a ball. That's a bye. It sounds generous, but it's how the real draw balances the bracket when the numbers don't split evenly.",
  },

  // League-format explainers (the odd domestic formats, reused as ? bubbles
  // in the league viewers and during your own season in one of these leagues).
  format_belgium_playoff:    { title: 'Championship Play-off', text: FORMAT_EXPLAINER.belgium_playoff },
  format_scotland_split:     { title: 'Top-6 / Bottom-6 Split', text: FORMAT_EXPLAINER.scotland_split },
  format_split_championship: { title: 'Championship Round',     text: FORMAT_EXPLAINER.split_championship },
}

// The full-rulebook order (RulesModal renders these top to bottom, telling the
// story of the competition from your first domestic kick-off to the final).
export const RULES_ORDER: string[] = [
  'the_road',
  'league_simulation',
  'entry_point',
  'qualifying_ladder',
  'champions_vs_league_path',
  'two_legged_tie',
  'extra_time',
  'bye',
  'holders',
  'league_phase',
  'pots',
  'league_phase_zones',
  'knockout_playoff',
  'knockout_bracket',
  'format_belgium_playoff',
  'format_scotland_split',
  'format_split_championship',
]
