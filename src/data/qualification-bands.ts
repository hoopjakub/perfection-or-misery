/**
 * What each final place in a league table is worth, per league per season.
 *
 * The season screen draws these as zone tapes, and the tier ladder
 * (`engine/tier.ts`) reads its European and relegation thresholds from here, so
 * a tier can never disagree with the zone your row finished in.
 *
 * Nominal, league-position-only places. Real lines move every year with cup
 * winners (an FA Cup winner who finished 3rd passes their Europa spot down to
 * 7th) — we deliberately don't model that, because the domestic cups aren't
 * simulated. Champions League counts follow the access list: England 5 for
 * 2024/25, Italy and Germany 5 for 2023/24 (the European Performance Spots),
 * France 3 until 2023/24 and 4 after (the new access list).
 *
 * ponytail: 2025/26 uses the base counts; update it when that season's
 * performance spots are final.
 */

export type ZoneKey = 'champ' | 'ucl' | 'uel' | 'uecl' | 'playoff' | 'down'

export type Zone = { key: ZoneKey; code: string; label: string }

export const ZONES: Record<ZoneKey, Zone> = {
  champ:   { key: 'champ',   code: 'CHAMP', label: 'Champions' },
  ucl:     { key: 'ucl',     code: 'UCL',   label: 'Champions League' },
  uel:     { key: 'uel',     code: 'UEL',   label: 'Europa League' },
  uecl:    { key: 'uecl',    code: 'UECL',  label: 'Conference League' },
  playoff: { key: 'playoff', code: 'PO',    label: 'Relegation play-off' },
  down:    { key: 'down',    code: 'DOWN',  label: 'Relegated' },
}

/** Counts, top to bottom. `uecl` is 0 before the Conference League (2021/22). */
export type Bands = { ucl: number; uel: number; uecl: number; playoff: number; down: number }

const CONFERENCE_FROM = 2021

function bandsFor(leagueId: string, yearStart: number, teams: number): Bands {
  const uecl = yearStart >= CONFERENCE_FROM ? 1 : 0
  switch (leagueId) {
    case 'premier_league':
      return { ucl: yearStart === 2024 ? 5 : 4, uel: 2, uecl, playoff: 0, down: 3 }
    case 'la_liga':
      return { ucl: 4, uel: 2, uecl, playoff: 0, down: 3 }
    case 'serie_a':
      return { ucl: yearStart === 2023 ? 5 : 4, uel: 2, uecl, playoff: 0, down: 3 }
    case 'bundesliga':
      return { ucl: yearStart === 2023 ? 5 : 4, uel: 2, uecl, playoff: 1, down: 2 }
    case 'ligue_1': {
      const ucl = yearStart >= 2024 ? 4 : 3
      // 2022/23 relegated four to shrink to 18 clubs; 2019/20 was curtailed
      // with no play-off.
      if (yearStart === 2022) return { ucl, uel: 1, uecl, playoff: 0, down: 4 }
      if (yearStart === 2019) return { ucl, uel: 2, uecl, playoff: 0, down: 2 }
      return { ucl, uel: ucl === 3 ? 2 : 1, uecl, playoff: 1, down: 2 }
    }
    default:
      // Leagues without their own row (the custom UCL path's domestic tables
      // use their own berths): the old fixed cut-offs.
      return { ucl: 4, uel: 2, uecl, playoff: 0, down: teams >= 16 ? 3 : 1 }
  }
}

/** Zones per final place (index 0 = 1st). */
export function zonesFor(leagueId: string, yearStart: number, teams: number): (ZoneKey | null)[] {
  const b = bandsFor(leagueId, yearStart, teams)
  const out: (ZoneKey | null)[] = Array(teams).fill(null)
  let i = 0
  const fill = (key: ZoneKey, n: number) => { for (let k = 0; k < n && i < teams; k++) out[i++] = key }
  out[i++] = 'champ'
  fill('ucl', b.ucl - 1)
  fill('uel', b.uel)
  fill('uecl', b.uecl)
  let j = teams - 1
  for (let k = 0; k < b.down && j >= i; k++) out[j--] = 'down'
  for (let k = 0; k < b.playoff && j >= i; k++) out[j--] = 'playoff'
  return out
}

/** The zone a final place lands in, or null for mid-table. */
export function zoneAt(leagueId: string, yearStart: number, teams: number, position: number): ZoneKey | null {
  return zonesFor(leagueId, yearStart, teams)[position - 1] ?? null
}

/** The zones present in a table, in order, for the legend. */
export function legendFor(zones: (ZoneKey | null)[]): Zone[] {
  return [...new Set(zones.filter((z): z is ZoneKey => z != null))].map(k => ZONES[k])
}
