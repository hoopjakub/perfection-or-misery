// The version history (P8-73). The app said 0.0.1 from its first build until
// September 2026, so these versions are numbered after the fact, one per
// milestone. The dates and what changed come from the commit history on
// GitHub (hoopjakub/perfection-or-misery: 37 commits, 8 June to 19 September
// 2026, read 24 September) and, for the work since the last commit, the
// roadmap. The commit messages are short, so some entries are filled in from
// the project's documents of the same days; `source` says which. The newest
// entry is the version app.json carries, so the version button and this list always agree.
import { LANGUAGE } from '@/i18n'

export type VersionEntry = {
  version: string
  /** What the page prints: "12 June 2026", "25–29 June 2026". */
  when: string
  /** Where the date and the list come from. */
  source: string
  title: string
  changes: string[]
  /** P8.5-28: the same entry in Slovak. Kept beside the English so a new
   *  version can't ship in one language and be forgotten in the other. */
  sk: { when: string; source: string; title: string; changes: string[] }
}

/** The entry in the app's language. */
export const localEntry = (v: VersionEntry): Omit<VersionEntry, 'sk' | 'version'> & { version: string } =>
  (LANGUAGE === 'sk' ? { version: v.version, ...v.sk } : v)

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
    sk: {
      when: '26. – 28. septembra 2026',
      source: 'roadmapa (docs/ui-overhaul/11-ROADMAP.md, fáza 8, dávky 19 až 24) a docs/europe; zatiaľ necommitnuté',
      title: 'Celá sezóna a Európa',
      changes: [
        'Európska liga a Konferenčná liga so skutočnými poliami a košmi 2025/26.',
        'Ligová hra odohrá aj pohár svojej ligy a výhra v oboch je double.',
        'Celá cesta vedie všetkými tromi európskymi súťažami: každý pohár, každé pravidlo prístupu a presun nižšie po prehre v kvalifikácii.',
        'Experti odohrajú vlastný celý turnaj, pred hrou aj porovnaný so skutočnosťou.',
        'Sezóny s hodnosťami a odznakmi, prerobená obrazovka kariéry a víťaz zlatej rukavice v bráne.',
        'Kluby so značkou a chatom, profil, ktorý sa dá vyzdobiť ako karta na Discorde, skutočný výber farby a tvoj odznak všade.',
        'Nový glóbus, ktorý sa priblíži k tvojej krajine, vlajky na každej karte draftu a Chaos aj Prekliaty režim s vlastným vzhľadom.',
        'Odkazy na hry, ktoré otvoria priamo aplikáciu, a webová analytika.',
      ],
    },
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
    sk: {
      when: '19. – 25. septembra 2026',
      source: 'roadmapa (docs/ui-overhaul/11-ROADMAP.md, fázy 7 a 8 po dávku 18)',
      title: 'Vlastná identita',
      changes: [
        'Skutočné vlajky každej krajiny, erby každého klubu a farby tímov v zápise zápasu.',
        'Ocenenia pre každý post, tím sezóny a tím každého kola.',
        'Panel dvanástich expertov, každý s vlastnou predpoveďou, ktorú overí verdikt.',
        'Komentár, mapa striel a penaltové rozstrely kop po kope.',
        'Obrazovka nastavení, sprievodca, ktorý sa otvára výberom tém, a táto história verzií.',
        'Každá vyraďovačka nakreslená ako jeden skutočný pavúk: pred prvým kolom, v prehľade hry aj na výsledkových obrazovkách.',
        'Profily, ktoré si upravíš podľa seba, a pri každej hre je jasné, čia je.',
      ],
    },
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
    sk: {
      when: '19. septembra 2026',
      source: 'commity z 19. septembra („check roadmap all the way to phase 6“) a roadmapa, fázy 0 až 6',
      title: 'Kit Drop',
      changes: [
        'Nový dizajn: štítky ako z futbalových dresov, pásky a platne namiesto starých tmavých kariet, s novým písmom, farbami, ikonami a logom.',
        'Nastavenie, draft, žreb, sezóna, vyraďovačka, Večer cien a verdikt postavené nanovo.',
        'Prehľad hry: tabuľka, pavúk, tvoja sezóna, štatistiky, tlač a káder na jednej stránke, so stránkou pre každého hráča, klub a článok.',
        'Široké rozloženia pre tablety a počítače a webová verzia na Verceli.',
        'Hry hodnotené jedným spoločným vzorcom, pripraveným na presun na server.',
      ],
    },
  },
  {
    version: '0.6.0', when: '23–27 July 2026',
    source: 'the commits of 23 and 27 July ("UPDATE TO MATCH STATS SCREEN AND SMALL SIMULATION") and the Big Fixes plan of the same days',
    title: 'The match experience',
    changes: [
      'The match stats screen reworked.',
      'The Big Fixes plan: one knockout look everywhere, the Deep Match for finals, match momentum, a match page with tabs, lineups and injuries, and Era mode retired. All of it is in the next commit, 19 September.',
    ],
    sk: {
      when: '23. – 27. júla 2026',
      source: 'commity z 23. a 27. júla („UPDATE TO MATCH STATS SCREEN AND SMALL SIMULATION“) a plán Big Fixes z tých istých dní',
      title: 'Zážitok zo zápasu',
      changes: [
        'Prepracovaná obrazovka štatistík zápasu.',
        'Plán Big Fixes: jeden vzhľad vyraďovačky všade, Deep Match pre finále, priebeh zápasu, stránka zápasu so záložkami, zostavy a zranenia a koniec režimu Éra. Všetko je v ďalšom commite z 19. septembra.',
      ],
    },
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
    sk: {
      when: '14. – 18. júla 2026',
      source: 'commity zo 14., 15. a 18. júla',
      title: 'Podrobné štatistiky a živé zápasy',
      changes: [
        'Poriadne štatistiky každého zápasu, hodnotenie 0 až 10 pre každého hráča a hráč zápasu.',
        'Priemerné hodnotenia za celú hru.',
        'Tvoje zápasy naživo, s bežiacimi hodinami.',
        'Obťažnosť, ktorá niečo znamená, a prerobený zápasový engine.',
      ],
    },
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
    sk: {
      when: '11. júla 2026',
      source: 'commity z 11. júla („Substitues, Scorers, Lots of Fixes and Next Up“)',
      title: 'Striedania a strelci',
      changes: [
        'Striedania.',
        'Strelci gólov v každom zápase.',
        'Celá cesta Ligou majstrov, od domácej sezóny cez kvalifikáciu (hotová do 12. júla podľa plánu z toho dňa).',
        'Kopa opráv.',
      ],
    },
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
    sk: {
      when: '25. – 29. júna 2026',
      source: 'commity z 25. až 29. júna a docs/Major Overhaul + Bug fixes.md (26. júna)',
      title: 'Veľká prestavba',
      changes: [
        'Nový vzhľad takmer všetkého.',
        'Penaltové rozstrely, ktoré sa skončia, keď je rozhodnuté.',
        'Najlepší strelci, nahrávači a čisté kontá za celú súťaž, hráč sezóny a najlepší do 21 rokov a celoživotná kariéra pre každého draftovaného hráča.',
        'Točiaci sa glóbus, ktorý odhalí, kam sa dostaneš.',
        'Scrapery a nová databáza: Liga majstrov v novom formáte, celé majstrovstvá sveta a osem sezón piatich najlepších líg.',
      ],
    },
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
    sk: {
      when: '17. – 19. júna 2026',
      source: 'commity zo 17. až 19. júna („WC mode works down to perfection“)',
      title: 'Majstrovstvá sveta a nové režimy',
      changes: [
        'Režim majstrovstiev sveta.',
        'Nové režimy.',
        'Vlastný vzhľad pre každý režim.',
      ],
    },
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
    sk: {
      when: '12. júna 2026',
      source: 'commity z 8. až 13. júna („we are about to see probably the first v0.1“)',
      title: 'Prvá hra',
      changes: [
        'Registrácia a prihlásenie.',
        'Vyber režim, roztoč kluby a draftuj jedenástku zo skutočných klubových sezón.',
        'Odsimuluj sezónu a získaj výsledok uložený medzi tvoje hry.',
        'Skutoční hráči v databáze, ktorá je súčasťou aplikácie.',
      ],
    },
  },
]
