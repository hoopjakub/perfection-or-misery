// A season's domestic cup, as both seasons show it: the league run's (P8-173)
// and, since P8.5-20, the full path's, whose own cup is now played through its
// season instead of headless after it. Moved out of LeagueSeason so the two
// can't drift (the centralisation set's "one base, extended" rule).
import React from 'react'
import { View, StyleSheet } from 'react-native'
import { KitText, SectionTag, Plate } from '@/components/kit'
import { ResultRow } from './SeasonParts'
import { openCupBracket } from '@/components/CustomUclViewers'
import { tieNote, type DomesticCup, type CupTie, type CupRound } from '@/engine/domestic-cup'
import { space, type Roles } from '@/theme'

const isYourTie = (t: CupTie) => t.home.isPlayer || t.away.isPlayer

/** One cup tie as a result row, your side marked. */
export function CupTieRow({ roles, tie, label }: { roles: Roles; tie: CupTie; label: string }) {
  const note = tieNote(tie)
  return (
    <ResultRow roles={roles}
      homeName={tie.home.clubName} awayName={tie.away.clubName} homeClubId={tie.home.clubId} awayClubId={tie.away.clubId}
      homeGoals={tie.homeGoals} awayGoals={tie.awayGoals}
      youSide={tie.home.isPlayer ? 'home' : tie.away.isPlayer ? 'away' : null}
      round={[label, note].filter(Boolean).join(' · ').toUpperCase()}
      neutral={label === 'Final'} />
  )
}

/** The round played straight after matchday `md`, and your tie in it, if any. */
export function cupRoundAfter(cup: DomesticCup | null | undefined, md: number): { round: CupRound; tie: CupTie } | null {
  const round = cup?.rounds.find(r => r.played && r.afterMatchday === md)
  const tie = round?.ties.find(isYourTie)
  return round && tie ? { round, tie } : null
}

/** Your tie from the round just played, under the matchday's card. */
export function CupNow({ roles, cup, md }: { roles: Roles; cup: DomesticCup | null | undefined; md: number }) {
  const now = cupRoundAfter(cup, md)
  if (!cup || !now) return null
  return (
    <View style={styles.now}>
      <SectionTag roles={roles}>{`${cup.name} · ${now.round.label}`}</SectionTag>
      <CupTieRow roles={roles} tie={now.tie} label={now.round.label} />
    </View>
  )
}

/** The cup tab: where it stands, the bracket, and every round played, newest first. */
export function CupPane({ roles, cup, country, playerClubId }: {
  roles: Roles; cup: DomesticCup; country?: string | null; playerClubId?: string | null
}) {
  const next = cup.rounds.find(r => !r.played)
  const yourOut = cup.rounds.find(r => r.played && r.ties.some(t => isYourTie(t) && !(t.winner === 'home' ? t.home : t.away).isPlayer))
  const youHaveBye = !cup.rounds[0].played && cup.rounds[0].byes.some(b => b.isPlayer)
  const anyPlayed = cup.rounds.some(r => r.played)
  return (
    <>
      <KitText t="body" color={roles.textMuted} style={styles.pre}>
        {cup.winner
          ? `${cup.winner.isPlayer ? 'You won' : `${cup.winner.clubName} won`} the ${cup.name}.`
          : yourOut ? `You went out in the ${yourOut.label.toLowerCase()}.`
          : next ? `${next.label}: after matchday ${next.afterMatchday}.${youHaveBye ? ` You have a bye to the ${cup.rounds[1]?.label.toLowerCase()}.` : ''}`
          : ''}
        {' The cup here is the top flight only, drawn open each round, one match with extra time and penalties.'}
      </KitText>
      {/* P8.5-13: the cup as its bracket, as Europe's cups show. */}
      {anyPlayed && (
        <Plate label="See the bracket" icon="ranks" variant="secondary" roles={roles}
          onPress={() => openCupBracket(cup, country, playerClubId)} />
      )}
      {[...cup.rounds].filter(r => r.played).reverse().map(r => (
        <View key={r.key} style={styles.round}>
          <SectionTag roles={roles}>{`${r.label} · after MD ${r.afterMatchday}`}</SectionTag>
          {[...r.ties].sort((a, b) => Number(isYourTie(b)) - Number(isYourTie(a))).map(t => (
            <CupTieRow key={`${r.key}-${t.home.clubId}-${t.away.clubId}`} roles={roles} tie={t} label={r.label} />
          ))}
        </View>
      ))}
    </>
  )
}

const styles = StyleSheet.create({
  pre: { paddingVertical: space[3] },
  round: { marginTop: space[3], gap: space[1] },
  now: { marginTop: space[2], gap: space[1] },
})
