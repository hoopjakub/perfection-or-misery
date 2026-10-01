// The bracket's shape (P8-79), kept apart from BracketTree so it can be
// checked headless (scripts/verify-bracket.ts).
import { tieNote, type DomesticCup } from '@/engine/domestic-cup'
export type BracketSide = {
  clubId?: string
  name: string
  /** Goals as the card prints them: the aggregate, or the one score. */
  goals?: string
  /** Went straight into this round (the Champions League's top eight). */
  seed?: boolean
}
export type BracketTie = {
  a: BracketSide | null   // null: not known yet
  b: BracketSide | null
  winner?: 'a' | 'b'
  /** "AET", "pens 4-3", "Leg 1 2-0 · Leg 2 1-1" */
  note?: string
  onPress?: () => void
}
export type BracketColumn = { key: string; label: string; ties: BracketTie[] }

const winnerId = (t: BracketTie) => (t.winner === 'a' ? t.a?.clubId : t.winner === 'b' ? t.b?.clubId : undefined)

/** Puts each round's ties in bracket order: the two ties that feed a tie in the
 *  next round sit next to each other, in the order that tie lists its sides.
 *  Worked backwards from the final, by where each tie's winner turns up next.
 *  A round whose next round isn't drawn yet keeps the order it came in. */
export function orderBracket(columns: BracketColumn[]): BracketColumn[] {
  const out = columns.map(c => ({ ...c, ties: [...c.ties] }))
  for (let i = out.length - 2; i >= 0; i--) {
    const next = out[i + 1].ties.flatMap(t => [t.a?.clubId, t.b?.clubId])
    if (next.some(id => !id)) continue
    const at = (t: BracketTie) => { const k = next.indexOf(winnerId(t)); return k === -1 ? Infinity : k }
    out[i].ties.sort((x, y) => at(x) - at(y))
  }
  return out
}


/** A domestic cup as bracket columns (P8.5-13 / P8.5-20): every round played
 *  so far, one match a tie. A first round lists its byes as well, each a side
 *  with nobody against it, so the column has every club of the next round's
 *  draw and halves into it like any other round. */
export function cupToColumns(cup: DomesticCup, onTie?: (t: DomesticCup['rounds'][number]['ties'][number], roundLabel: string) => void): BracketColumn[] {
  return cup.rounds.filter(r => r.played).map(r => ({
    key: r.key, label: r.label,
    ties: [
      ...r.ties.map((t): BracketTie => ({
        a: { clubId: t.home.clubId, name: t.home.clubName, goals: String(t.homeGoals) },
        b: { clubId: t.away.clubId, name: t.away.clubName, goals: String(t.awayGoals) },
        winner: t.winner === 'home' ? 'a' : 'b',
        note: tieNote(t) ?? undefined,
        onPress: onTie ? () => onTie(t, r.label) : undefined,
      })),
      ...r.byes.map((s): BracketTie => ({ a: { clubId: s.clubId, name: s.clubName }, b: null, winner: 'a', note: 'Bye' })),
    ],
  }))
}
