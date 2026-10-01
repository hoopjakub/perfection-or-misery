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
import type { MatchDetailRequest } from '@/components/MatchStatsParts'
import type { Formation } from '@/types/game'

const isYourTie = (t: CupTie) => t.home.isPlayer || t.away.isPlayer

/** What opening a cup tie needs: it's handed the tie and its round's label. */
export type OnCupTie = (tie: CupTie, roundLabel: string) => void

/** P8.5-37: a cup tie's match sheet. A two-legged tie opens on its first leg,
 *  with both legs to switch between; the second is hosted by the first leg's
 *  away side and carries the extra time and the shootout. */
export function cupTieRequest(t: CupTie, roundLabel: string, ctx: {
  cupName: string; yearStart: number; playerClubId?: string; playerFormation?: Formation
}): MatchDetailRequest {
  const winner = t.winner === 'home' ? t.home : t.away
  const pensNote = t.homePens != null && t.awayPens != null ? `Penalties ${t.homePens}–${t.awayPens} · ${winner.clubName} go through` : undefined
  const base = { yearStart: ctx.yearStart, playerClubId: ctx.playerClubId, playerFormation: ctx.playerFormation }
  const label = `${ctx.cupName} · ${roundLabel}`
  if (t.legs && t.legSeeds) {
    const l1 = t.legs.leg1
    const leg1: MatchDetailRequest = {
      ...base, homeClubId: t.home.clubId, homeName: t.home.clubName, awayClubId: t.away.clubId, awayName: t.away.clubName,
      homeGoals: l1.homeGoals, awayGoals: l1.awayGoals, seed: t.legSeeds[0], scorers: t.legScorers?.[0], competitionLabel: `${label} · Leg 1`,
    }
    const leg2: MatchDetailRequest = {
      ...base, homeClubId: t.away.clubId, homeName: t.away.clubName, awayClubId: t.home.clubId, awayName: t.home.clubName,
      homeGoals: t.awayGoals - l1.awayGoals, awayGoals: t.homeGoals - l1.homeGoals, extraTime: t.extraTime, pensNote,
      seed: t.legSeeds[1], scorers: t.legScorers?.[1], competitionLabel: `${label} · Leg 2`,
    }
    return { ...leg1, legs: [leg1, leg2] }
  }
  return {
    ...base, homeClubId: t.home.clubId, homeName: t.home.clubName, awayClubId: t.away.clubId, awayName: t.away.clubName,
    homeGoals: t.homeGoals, awayGoals: t.awayGoals, extraTime: t.extraTime, pensNote,
    seed: t.seed, scorers: t.scorers, competitionLabel: label,
  }
}

/** One cup tie as a result row, your side marked; it opens its sheet when `onTie` is given. */
export function CupTieRow({ roles, tie, label, onTie }: { roles: Roles; tie: CupTie; label: string; onTie?: OnCupTie }) {
  const note = tieNote(tie)
  return (
    <ResultRow roles={roles} onPress={onTie ? () => onTie(tie, label) : undefined}
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
export function CupNow({ roles, cup, md, onTie }: { roles: Roles; cup: DomesticCup | null | undefined; md: number; onTie?: OnCupTie }) {
  const now = cupRoundAfter(cup, md)
  if (!cup || !now) return null
  return (
    <View style={styles.now}>
      <SectionTag roles={roles}>{`${cup.name} · ${now.round.label}`}</SectionTag>
      <CupTieRow roles={roles} tie={now.tie} label={now.round.label} onTie={onTie} />
    </View>
  )
}

/** The cup tab: where it stands, the bracket, and every round played, newest first. */
export function CupPane({ roles, cup, country, playerClubId, onTie }: {
  roles: Roles; cup: DomesticCup; country?: string | null; playerClubId?: string | null; onTie?: OnCupTie
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
          onPress={() => openCupBracket(cup, country, playerClubId, onTie)} />
      )}
      {[...cup.rounds].filter(r => r.played).reverse().map(r => (
        <View key={r.key} style={styles.round}>
          <SectionTag roles={roles}>{`${r.label} · after MD ${r.afterMatchday}`}</SectionTag>
          {[...r.ties].sort((a, b) => Number(isYourTie(b)) - Number(isYourTie(a))).map(t => (
            <CupTieRow key={`${r.key}-${t.home.clubId}-${t.away.clubId}`} roles={roles} tie={t} label={r.label} onTie={onTie} />
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
