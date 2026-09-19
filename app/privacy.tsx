import React from 'react'
import { LegalPage } from '@/components/LegalPage'

export default function PrivacyScreen() {
  return (
    <LegalPage
      title="Privacy"
      path="/privacy"
      intro="Perfection or Misery keeps as little as it can: your username and your runs. No ads, no analytics, no tracking, and nothing is sold."
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
            'Your sign-in session, so you stay signed in, and the game data the app ships with (players, clubs and seasons). The run you are playing lives in memory until it ends.',
          ],
        },
        {
          heading: 'Who can see what',
          body: [
            'Ranks shows your username beside your best runs, to everyone. Friends can see your runs and challenge you. Nothing else about you is shown to anyone.',
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
