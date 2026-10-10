// COPIED from src/data/legal.ts by scripts/build-landing-data.cjs. Edit the original and run the script.
// P8.5-29 · One legal file. Privacy and Terms, written once, used by the app
// (app/privacy.tsx, app/terms.tsx through LegalPage) and by the website
// (scripts/export-legal.ts writes public/legal/*.json from this file).
//
// Written from what the code actually does (src/lib/auth.ts, src/db/queries,
// supabase/*.sql, supabase/functions), so a change there means a change here,
// and a new UPDATED date.
//
// Each language is written, not translated line by line: English, and since
// Wave E (P8.5-28) Slovak, which must always say the same things.
//
// Plain text only (no markup), so the app and the site can both lay it out.

export type LegalSection = { heading: string; body: string[] }
export type LegalDoc = { title: string; intro: string; sections: LegalSection[] }
export type LegalLang = 'en' | 'sk'
export type LegalPageId = 'privacy' | 'terms'

/** When the text last changed, as a date (the app and the site each write it
 *  out in their language: updatedOn below). */
export const UPDATED = '2026-10-10'
export const updatedOn = (lang: LegalLang) =>
  new Date(`${UPDATED}T12:00:00`).toLocaleDateString(lang === 'sk' ? 'sk-SK' : 'en-GB', { day: 'numeric', month: 'long', year: 'numeric' })
/** The project's address for anything outward (never anyone's personal one). */
export const CONTACT = process.env.EXPO_PUBLIC_CONTACT_EMAIL || 'perfectionormisery@gmail.com'

const PRIVACY_EN: LegalDoc = {
  title: 'Privacy',
  intro: 'Perfection or Misery keeps as little as it can: your username and your runs. No ads, no cookies, no tracking across other sites, and nothing is sold.',
  sections: [
    {
      heading: 'What an account stores',
      body: [
        'Your username and a password. The password is never stored in plain text; the sign-in service (Supabase) keeps only a hash of it.',
        'There is no email address. Behind the scenes the username becomes an internal address that receives no mail, which is why there is no password recovery.',
        'Every finished run: the squad you drafted, the formation, the difficulty, the results, the score and the season statistics. This is what Runs, Ranks, Achievements and Career are built from.',
        'Friends, friend requests, versus challenges and their notifications, if you use them.',
      ],
    },
    {
      heading: 'Clubs',
      body: [
        'If you join or start a club: which club you are in, your role in it, and the club\'s name, tag, colour and description. The club and its members are public, like a profile.',
        'The club chat: each message, who wrote it and when. Only the club\'s members can read it. If the club keeps its language clean, swear words are swapped for politer ones as the message is saved, so the saved message is the cleaned one.',
        'A club with a password keeps only a one-way hash of it, which nobody can read back, not even the club\'s owner. An invitation to a club is kept until it is used or turned down.',
      ],
    },
    {
      // P8.5-44: supabase/moderation.sql.
      heading: 'Keeping names clean, and reports',
      body: [
        'Usernames, club names, tags and descriptions, and what you write on your profile are checked against a list of swear words and slurs when they are saved, in the database itself; one that is on the list is not saved. The list is built from public word lists (LDNOOBW, under CC BY 4.0, and cuss, under MIT) and our own.',
        'A name the check is unsure about is saved, and also put in front of the moderator, with the name and the account it belongs to.',
        'If you report a player or a club, the report keeps who sent it, who or what it is about, the reason and anything you add. Only the moderator sees it; the one reported is never told who reported them. Reports are kept until the moderator has dealt with them.',
        'The moderator can take a name away (you pick a new one) or ban an account. A banned account keeps its runs but cannot save new ones, chat or report.',
      ],
    },
    {
      heading: 'Playing as a guest',
      body: [
        'Opening the app starts an anonymous guest session so the game works straight away. Guest runs are not saved. Nothing identifies you as a person.',
      ],
    },
    {
      heading: 'What stays on your device',
      body: [
        'Your sign-in session, so you stay signed in, your settings, and the game data the app ships with (players, clubs and seasons).',
        'A run you are drafting is kept on the device until it kicks off, so closing the app does not lose it. Once it is under way it lives in memory until it ends.',
        'A finished run that could not be saved because you were offline waits on the device and is sent the next time you are online, then removed from the device.',
        'Which achievements the app has already shown you, so it only announces new ones.',
      ],
    },
    {
      heading: 'Updates',
      body: [
        'When it starts, the app checks for updates in two places: small updates come from Expo (the service the app is built with), and the app reads a short file on the game\'s website to see whether a new version is out. If one is and you choose to update, the new version downloads from the game\'s release page on GitHub. Nothing about you is sent with either check.',
      ],
    },
    {
      // P8.5-32: the game's player data is public facts about real people,
      // which the GDPR still covers: say what's kept, where it's from, and how
      // a player gets out (docs/release/06-OUR-OWN-DATA.md §1.3).
      heading: 'Real footballers in the game',
      body: [
        'The game includes real professional footballers: their names, positions, nationalities, birth years, clubs, and their league appearances and goals, taken from Wikipedia and Wikidata. Nothing private is kept about anyone: no contracts, fees, addresses or anything that isn\'t already public.',
        'Each player\'s rating is worked out by the game from those facts (his club\'s league standing, how often he played, his goals, his age). It is the game\'s own number, not anyone\'s judgement of the player.',
        'If you are a player in the game and want your name taken out, write to the contact address on this page and it will be removed in the next update.',
      ],
    },
    {
      // Phase 10 step 4 (supabase/qa.sql): the website's community.
      heading: 'Questions on the website',
      body: [
        'If you ask a question in the website\'s community, it keeps the question, your account, whether you ticked it Public or Private, when you asked and edited it, and any private conversation the developer opens with you about it.',
        'The developer can read every question. A Private one is never shown to anyone else. A Public one is shown on the site once it is answered, without your name, and the developer can still take it off the site.',
        'To keep the limits (one question at a time, a few a day), the site also counts when you asked, edited and replied. Questions are kept until you delete your account, or until the developer deletes one for abuse.',
        'Signing in on the website keeps your session in that browser\'s storage, nothing more, and only until you sign out.',
      ],
    },
    {
      heading: 'What the website measures',
      body: [
        'On the website only, Vercel (which hosts it) counts visits and page views and measures how fast pages load for real visitors, so we can see which pages are used and fix the slow ones. It uses no cookies and records no personal identifiers: each data point is anonymous, and what tells one visit from another is discarded after 24 hours.',
        'What is recorded: the page (without anything after a "?", and with player and run pages counted as one page each), the site you came from, your country and region, and your browser, system and type of device. The app on a phone sends none of this.',
      ],
    },
    {
      heading: 'Who can see what',
      body: [
        'Ranks shows your username beside your best runs, to everyone. Friends can see your runs and challenge you.',
        'Your profile page is public, and shows what you put on it: your picture, banner, colours and frame, your status, pronouns and about-me, your crest and your season badges. The favourites, pinned runs, trophies and playing time are yours to show or hide. Nothing else about you is shown to anyone.',
        'Data is stored with Supabase, the hosted database the app runs on. It is not shared with anyone else, and nothing you write is sent to any other service to be checked.',
      ],
    },
    {
      heading: 'Deleting everything',
      body: [
        'You → Delete account removes your account, every run, your career, your friends, your club membership, your questions on the website and your place in the ranks, for good. It happens straight away and cannot be undone.',
      ],
    },
  ],
}

const TERMS_EN: LegalDoc = {
  title: 'Terms',
  intro: 'Perfection or Misery is a free football game made by one person. By playing you accept these few rules.',
  sections: [
    {
      heading: 'The game',
      body: [
        'Every result is simulated. Scores, tiers and ranks are for fun and carry no prize or value.',
        'The game is provided as it is. Runs can be lost if the service is down, and features can change or be removed.',
      ],
    },
    {
      heading: 'Your account',
      body: [
        'Pick a username that is not offensive and does not pretend to be someone else. Accounts that break this can be renamed or removed.',
        'There is no password recovery. Keep your password somewhere safe.',
        'Do not try to post scores the game did not produce, or to reach other players\' data. Accounts that do can be removed from the ranks.',
      ],
    },
    {
      heading: 'Clubs and the chat',
      body: [
        'A club\'s name, tag and description follow the same rule as a username: nothing offensive, nobody impersonated.',
        'Be decent in the chat. A club\'s owner can remove members and delete messages, and clubs or players that harass others can be removed.',
        'Anyone can report a player or a club from its page. Reports are read by the moderator, who can rename, close or ban. Reporting someone to get at them is itself against these rules.',
      ],
    },
    {
      heading: 'The community on the website',
      body: [
        'Asking a question needs an account with at least one saved run, and you need to be 15 or over to write there.',
        'The same rule as the chat: nothing offensive, nobody impersonated, nothing about other people that they wouldn\'t want shown. Questions that break it can be deleted, and the account can be banned.',
        'One question at a time, a few a day. Answers are the developer\'s, and a Public question may be reworded for the site.',
      ],
    },
    {
      heading: 'Real names',
      body: [
        'Player, club, league and competition names are used only to identify real footballing history. Perfection or Misery is not affiliated with, endorsed by or connected to any player, club, league or governing body.',
      ],
    },
    {
      heading: 'Leaving',
      body: [
        'You can delete your account at any time from You → Delete account. See Privacy for what that removes.',
      ],
    },
  ],
}

// The Slovak (P8.5-28, Wave E): the same sections in the same order, saying
// the same things, written for a Slovak reader (informal, like the app). A
// change to the English is a change here too.
const PRIVACY_SK: LegalDoc = {
  title: 'Súkromie',
  intro: 'Perfection or Misery si nechá čo najmenej: tvoje meno a tvoje hry. Žiadne reklamy, žiadne cookies, žiadne sledovanie na iných stránkach a nič sa nepredáva.',
  sections: [
    {
      heading: 'Čo si pamätá účet',
      body: [
        'Tvoje meno a heslo. Heslo sa nikdy neukladá ako čitateľný text; prihlasovacia služba (Supabase) si drží iba jeho hash.',
        'Účet nemá e-mailovú adresu. Z mena sa v pozadí stane interná adresa, na ktorú nechodí žiadna pošta, a preto sa zabudnuté heslo nedá obnoviť.',
        'Každá dohraná hra: zostava z draftu, rozostavenie, obťažnosť, výsledky, body a štatistiky sezóny. Z toho sa skladajú Hry, Rebríček, Úspechy aj Kariéra.',
        'Priatelia, žiadosti o priateľstvo, výzvy na súboj a upozornenia k nim, ak ich používaš.',
      ],
    },
    {
      heading: 'Kluby',
      body: [
        'Ak sa pridáš do klubu alebo ho založíš: v ktorom klube si, aká je tvoja úloha v ňom, a názov, značka, farba a popis klubu. Klub aj jeho členovia sú verejní, rovnako ako profil.',
        'Chat klubu: každá správa, kto ju napísal a kedy. Čítať ho môžu iba členovia klubu. Ak má klub zapnutý slušný jazyk, nadávky sa pri ukladaní správy vymenia za slušnejšie slová, takže uložená je už upravená správa.',
        'Klub s heslom si drží iba jednosmerný hash hesla, z ktorého ho nikto nevyčíta, ani majiteľ klubu. Pozvánka do klubu sa drží, kým ju niekto nepoužije alebo neodmietne.',
      ],
    },
    {
      heading: 'Slušné mená a nahlásenia',
      body: [
        'Mená používateľov, názvy, značky a popisy klubov a to, čo napíšeš do profilu, sa pri ukladaní kontrolujú priamo v databáze podľa zoznamu nadávok a urážok; čo na zozname je, sa neuloží. Zoznam vychádza z verejných zoznamov slov (LDNOOBW pod licenciou CC BY 4.0 a cuss pod licenciou MIT) a z nášho vlastného.',
        'Meno, pri ktorom si kontrola nie je istá, sa uloží a zároveň ho dostane moderátor, spolu s účtom, ku ktorému patrí.',
        'Keď nahlásiš hráča alebo klub, nahlásenie si pamätá, kto ho poslal, koho alebo čoho sa týka, dôvod a čokoľvek, čo dopíšeš. Vidí ho iba moderátor; nahlásený sa nikdy nedozvie, kto ho nahlásil. Nahlásenia sa držia, kým ich moderátor nevybaví.',
        'Moderátor môže vziať meno (vyberieš si nové) alebo zablokovať účet. Zablokovaný účet si nechá svoje hry, ale nové neuloží, nepíše v chate a nenahlasuje.',
      ],
    },
    {
      heading: 'Hra ako hosť',
      body: [
        'Keď otvoríš appku, začne sa anonymná relácia hosťa, aby hra fungovala hneď. Hry hosťa sa neukladajú. Nič z toho ťa neidentifikuje ako osobu.',
      ],
    },
    {
      heading: 'Čo ostáva v tvojom zariadení',
      body: [
        'Prihlásenie, aby ťa appka neodhlasovala, nastavenia a herné údaje, s ktorými appka prichádza (hráči, kluby a sezóny).',
        'Hra, ktorú práve draftuješ, ostáva v zariadení, kým sa nezačne, takže zatvorením appky o ňu neprídeš. Keď sa už hrá, žije v pamäti, kým neskončí.',
        'Dohraná hra, ktorá sa nemohla uložiť, lebo zariadenie bolo offline, počká v zariadení, odošle sa, keď budeš znova online, a potom sa zo zariadenia vymaže.',
        'Ktoré úspechy ti už appka ukázala, aby ohlasovala iba nové.',
      ],
    },
    {
      heading: 'Aktualizácie',
      body: [
        'Pri spustení appka hľadá aktualizácie na dvoch miestach: menšie aktualizácie prichádzajú od Expo (služby, na ktorej je appka postavená) a appka si prečíta krátky súbor na webe hry, či nevyšla nová verzia. Ak vyšla a rozhodneš sa aktualizovať, nová verzia sa stiahne zo stránky s vydaniami hry na GitHube. Pri žiadnej z kontrol sa o tebe nič neposiela.',
      ],
    },
    {
      heading: 'Skutoční futbalisti v hre',
      body: [
        'Hra obsahuje skutočných profesionálnych futbalistov: ich mená, posty, národnosti, roky narodenia, kluby a štarty a góly v lige, prevzaté z Wikipédie a Wikidát. O nikom sa neukladá nič súkromné: žiadne zmluvy, prestupové sumy, adresy ani nič, čo už nie je verejné.',
        'Hodnotenie každého hráča si hra vypočíta z týchto faktov (postavenie jeho klubu v lige, ako často hrával, jeho góly, jeho vek). Je to vlastné číslo hry, nie niekoho posudok o hráčovi.',
        'Ak si hráčom v hre a chceš, aby tvoje meno zmizlo, napíš na kontaktnú adresu na tejto stránke a v ďalšej aktualizácii bude odstránené.',
      ],
    },
    {
      heading: 'Otázky na webe',
      body: [
        'Ak položíš otázku v komunite na webe, uloží sa otázka, tvoj účet, či je označená ako verejná alebo súkromná, kedy bola položená a upravená a súkromný rozhovor, ak ho k nej vývojár otvorí.',
        'Vývojár môže čítať všetky otázky. Súkromnú neuvidí nikto iný. Verejná sa po odpovedi ukáže na webe bez tvojho mena a vývojár ju môže z webu stiahnuť.',
        'Kvôli limitom (jedna otázka naraz, pár za deň) si web pamätá aj časy otázok, úprav a odpovedí. Otázky ostávajú, kým nevymažeš účet alebo kým niektorú vývojár nevymaže pre zneužitie.',
        'Prihlásenie na webe drží tvoju reláciu v úložisku toho prehliadača, nič viac, a len kým sa neodhlásiš.',
      ],
    },
    {
      heading: 'Čo meria web',
      body: [
        'Iba na webe Vercel (ktorý ho hostí) počíta návštevy a zobrazenia stránok a meria, ako rýchlo sa stránky načítajú skutočným návštevníkom, aby sme videli, ktoré stránky sa používajú, a opravili tie pomalé. Nepoužíva cookies a nezaznamenáva žiadne osobné identifikátory: každý údaj je anonymný a to, čím sa jedna návšteva líši od druhej, sa po 24 hodinách zahodí.',
        'Zaznamená sa: stránka (bez všetkého za „?“ a so stránkami hráčov a hier počítanými ako jedna stránka), stránka, z ktorej návšteva prišla, tvoja krajina a región a tvoj prehliadač, systém a typ zariadenia. Appka v telefóne neposiela nič z toho.',
      ],
    },
    {
      heading: 'Kto čo vidí',
      body: [
        'Rebríček ukazuje každému tvoje meno pri tvojich najlepších hrách. Priatelia vidia tvoje hry a môžu ťa vyzvať.',
        'Tvoj profil je verejný a ukazuje, čo naň dáš: obrázok, banner, farby a rámik, status, zámená a text o tebe, erb a odznaky sezón. Obľúbené, pripnuté hry, trofeje a odohraný čas môžeš ukázať alebo skryť. Nič iné o tebe sa nikomu neukazuje.',
        'Údaje sú uložené v Supabase, hostenej databáze, na ktorej appka beží. S nikým iným sa nezdieľajú a nič, čo napíšeš, sa neposiela na kontrolu žiadnej inej službe.',
      ],
    },
    {
      heading: 'Vymazanie všetkého',
      body: [
        'Ty → Vymazať účet natrvalo odstráni tvoj účet, všetky hry, kariéru, priateľov, členstvo v klube, otázky na webe a miesto v rebríčku. Stane sa to hneď a nedá sa to vrátiť.',
      ],
    },
  ],
}

const TERMS_SK: LegalDoc = {
  title: 'Podmienky',
  intro: 'Perfection or Misery je bezplatná futbalová hra, ktorú robí jeden človek. Hraním prijímaš týchto pár pravidiel.',
  sections: [
    {
      heading: 'Hra',
      body: [
        'Každý výsledok je simulovaný. Body, úrovne a poradie sú len pre zábavu: nič sa za ne nevyhráva a nemajú žiadnu hodnotu.',
        'Hru dostávaš takú, aká je. Keď služba nebeží, hry sa môžu stratiť. Funkcie sa môžu zmeniť alebo zmiznúť.',
      ],
    },
    {
      heading: 'Tvoj účet',
      body: [
        'Vyber si meno, ktoré nie je urážlivé a nevydáva sa za niekoho iného. Účet, ktorý to poruší, môže prísť o meno alebo byť odstránený.',
        'Zabudnuté heslo sa nedá obnoviť, tak si ho ulož niekam do bezpečia.',
        'Neskúšaj posielať výsledky, ktoré hra nevytvorila, ani sa dostať k údajom iných hráčov. Účty, ktoré to robia, môžu byť z rebríčka odstránené.',
      ],
    },
    {
      heading: 'Kluby a chat',
      body: [
        'Pre názov, značku a popis klubu platí to isté ako pre meno: nič urážlivé a nikto sa nevydáva za iného.',
        'V chate sa správaj slušne. Majiteľ klubu môže odobrať členov a mazať správy a kluby alebo hráči, ktorí obťažujú iných, môžu byť odstránení.',
        'Hráča alebo klub môže ktokoľvek nahlásiť z jeho stránky. Nahlásenia číta moderátor, ktorý môže zmeniť meno, zrušiť klub alebo zablokovať účet. Nahlasovať niekoho len preto, aby sa mu uškodilo, je samo osebe proti týmto pravidlám.',
      ],
    },
    {
      heading: 'Komunita na webe',
      body: [
        'Na položenie otázky potrebuješ účet s aspoň jednou uloženou hrou a písať tam môžeš od 15 rokov.',
        'Platí to isté ako v chate: nič urážlivé, nikto sa nevydáva za iného a nič o iných, čo by nechceli ukázať. Otázky, ktoré to porušia, môžu byť vymazané a účet zablokovaný.',
        'Jedna otázka naraz, pár za deň. Odpovede sú od vývojára a verejnú otázku môže pre web preformulovať.',
      ],
    },
    {
      heading: 'Skutočné mená',
      body: [
        'Mená hráčov, klubov, líg a súťaží sa používajú iba na označenie skutočnej futbalovej histórie. Perfection or Misery nie je spojená so žiadnym hráčom, klubom, ligou ani riadiacim orgánom, nikto z nich ju nepodporuje a nemá s ňou nič spoločné.',
      ],
    },
    {
      heading: 'Odchod',
      body: [
        'Účet môžeš kedykoľvek vymazať v časti Ty → Vymazať účet. Čo sa tým odstráni, nájdeš v časti Súkromie.',
      ],
    },
  ],
}

export const LEGAL: Record<LegalPageId, Record<LegalLang, LegalDoc | null>> = {
  privacy: { en: PRIVACY_EN, sk: PRIVACY_SK },
  terms: { en: TERMS_EN, sk: TERMS_SK },
}

/** A page in a language, or the English while that language isn't written yet. */
export function legalDoc(page: LegalPageId, lang: LegalLang = 'en'): { doc: LegalDoc; fellBack: boolean } {
  const doc = LEGAL[page][lang]
  return doc ? { doc, fellBack: false } : { doc: LEGAL[page].en!, fellBack: lang !== 'en' }
}
