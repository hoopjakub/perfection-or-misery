// A season's domestic cup, as both seasons show it: the league run's (P8-173)
// and, since P8.5-20, the full path's, whose own cup is now played through its
// season instead of headless after it. Moved out of LeagueSeason so the two
// can't drift (the centralisation set's "one base, extended" rule).
import { t } from '@/i18n'
import { label } from '@/i18n/labels'
import React from 'react'
import { View, StyleSheet } from 'react-native'
import { KitText, SectionTag, Plate } from '@/components/kit'
import { ResultRow } from './SeasonParts'
import { openCupBracket } from '@/components/CustomUclViewers'
import { tieNote, type DomesticCup, type CupTie, type CupRound } from '@/engine/domestic-cup'
import { space, type Roles } from '@/theme'

const isYourTie = (t: CupTie) => t.home.isPlayer || t.away.isPlayer

/** What opening a cup tie needs: it's handed the tie and its round's label. */
export type OnCupTie = (tie: CupTie, roundLabel: string) => void

// A cup tie's match sheet is built by `cupTieRequest` (src/engine/stages.ts).

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
      <SectionTag roles={roles}>{`${cup.name} · ${label(now.round.label)}`}</SectionTag>
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
          ? (cup.winner.isPlayer ? t('season.youWonCup', { cup: cup.name }) : t('season.clubWonCup', { club: cup.winner.clubName, cup: cup.name }))
          : yourOut ? t('season.wentOut', { round: label(yourOut.label).toLowerCase() })
          : next ? t('season.nextRound', { round: label(next.label), md: next.afterMatchday }) + (youHaveBye ? t('season.bye', { round: label(cup.rounds[1]?.label).toLowerCase() }) : '')
          : ''}
        {t('season.cupFormat')}
      </KitText>
      {/* P8.5-13: the cup as its bracket, as Europe's cups show. */}
      {anyPlayed && (
        <Plate label={t('season.seeBracket')} icon="ranks" variant="secondary" roles={roles}
          onPress={() => openCupBracket(cup, country, playerClubId, onTie)} />
      )}
      {[...cup.rounds].filter(r => r.played).reverse().map(r => (
        <View key={r.key} style={styles.round}>
          <SectionTag roles={roles}>{t('season.afterMd', { round: label(r.label), md: r.afterMatchday })}</SectionTag>
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
