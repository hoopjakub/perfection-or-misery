// P8.5-29 · One legal file. Privacy and Terms, written once, used by the app
// (app/privacy.tsx, app/terms.tsx through LegalPage) and by the website
// (scripts/export-legal.ts writes public/legal/*.json from this file).
//
// Written from what the code actually does (src/lib/auth.ts, src/db/queries,
// supabase/*.sql, supabase/functions), so a change there means a change here,
// and a new UPDATED date.
//
// Each language is written, not translated line by line. English is here;
// Slovak (`sk`) is written in Wave E with the rest of the Slovak (P8.5-28):
// until then a Slovak reader gets the English, and the page says so.
//
// Plain text only (no markup), so the app and the site can both lay it out.

export type LegalSection = { heading: string; body: string[] }
export type LegalDoc = { title: string; intro: string; sections: LegalSection[] }
export type LegalLang = 'en' | 'sk'
export type LegalPageId = 'privacy' | 'terms'

export const UPDATED = '1 October 2026'
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
        'You → Delete account removes your account, every run, your career, your friends, your club membership and your place in the ranks, for good. It happens straight away and cannot be undone.',
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

export const LEGAL: Record<LegalPageId, Record<LegalLang, LegalDoc | null>> = {
  privacy: { en: PRIVACY_EN, sk: null },
  terms: { en: TERMS_EN, sk: null },
}

/** A page in a language, or the English while that language isn't written yet. */
export function legalDoc(page: LegalPageId, lang: LegalLang = 'en'): { doc: LegalDoc; fellBack: boolean } {
  const doc = LEGAL[page][lang]
  return doc ? { doc, fellBack: false } : { doc: LEGAL[page].en!, fellBack: lang !== 'en' }
}
