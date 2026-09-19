import React from 'react'
import { LegalPage } from '@/components/LegalPage'

export default function TermsScreen() {
  return (
    <LegalPage
      title="Terms"
      path="/terms"
      intro="Perfection or Misery is a free football game made by one person. By playing you accept these few rules."
      sections={[
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
          heading: 'Real names',
          body: [
            'Player, club, league and competition names are used only to identify real footballing history. Perfection or Misery is not affiliated with, endorsed by or connected to any player, club, league, UEFA or FIFA.',
          ],
        },
        {
          heading: 'Leaving',
          body: [
            'You can delete your account at any time from You → Delete account. See Privacy for what that removes.',
          ],
        },
      ]}
    />
  )
}
