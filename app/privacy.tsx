import React from 'react'
import { LegalPage } from '@/components/LegalPage'

export default function PrivacyScreen() {
  return (
    <LegalPage
      title="Privacy"
      path="/privacy"
      intro="Perfection or Misery keeps as little as it can: your username and your runs. No ads, no cookies, no tracking across other sites, and nothing is sold."
      sections={[
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
          ],
        },
        {
          // P8.5-32: the game's player data is public facts about real people,
          // which the GDPR still covers: say what's kept, where it's from, and
          // how a player gets out (docs/release/06-OUR-OWN-DATA.md §1.3).
          heading: 'Real footballers in the game',
          body: [
            'The game includes real professional footballers: their names, positions, nationalities, birth years, clubs, and their league appearances and goals, taken from Wikipedia and Wikidata. Nothing private is kept about anyone: no contracts, fees, addresses or anything that isn\'t already public.',
            'Each player\'s rating is worked out by the game from those facts (his club\'s league standing, how often he played, his goals, his age). It is the game\'s own number, not anyone\'s judgement of the player.',
            'If you are a player in the game and want your name taken out, ask through the contact address on this page and it will be removed in the next update.',
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
            'Data is stored with Supabase, the hosted database the app runs on. It is not shared with anyone else.',
          ],
        },
        {
          heading: 'Deleting everything',
          body: [
            'You → Delete account removes your account, every run, your career, your friends and your place in the ranks, for good. It happens straight away and cannot be undone.',
          ],
        },
      ]}
    />
  )
}
