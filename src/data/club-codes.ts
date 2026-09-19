// Three-letter club codes for ClubTag (a code on the club's colour tape —
// clubs are typographic in Kit Drop, never crests).
//
// The database already carries `clubs.short_name`, but it's the first three
// letters of a word, which gave 54 clashes INSIDE a single competition (both
// Manchester clubs were MAN, PSG was SAI next to Saint-Étienne's SAI). The DB
// code stays the base; this table overrides every clash, plus the few clubs
// whose code is known well enough that anything else reads wrong (PSG, BVB).
//
// Keyed by display NAME, not id: the same club appears under several ids
// (`psv_eindhoven_ucl`, …) and must carry one code everywhere.
// `npx tsx scripts/verify-club-codes.ts` fails if any competition has a clash.

export const CLUB_CODE_OVERRIDES: Record<string, string> = {
  // Premier League
  'Manchester City': 'MCI', 'Manchester United': 'MUN',
  'West Ham United': 'WHU', 'Leeds United': 'LEE',
  // La Liga
  'RCD Espanyol Barcelona': 'ESP', 'Rayo Vallecano': 'RAY', 'Real Valladolid CF': 'VLL',
  // Ligue 1
  'Paris Saint-Germain': 'PSG', 'AS Saint-Étienne': 'STE',
  'Olympique Marseille': 'MAR', 'Olympique Lyon': 'LYO', 'Nîmes Olympique': 'NIM',
  'Montpellier HSC': 'MTP',
  // Bundesliga (known codes) and the Champions League clashes
  'Borussia Dortmund': 'BVB', 'RB Leipzig': 'RBL', 'Bayer 04 Leverkusen': 'B04',
  'Borussia Mönchengladbach': 'BMG',
  'Eintracht Frankfurt': 'SGE', 'PSV Eindhoven': 'PSV',
  'Olympiacos Piraeus': 'OLY', 'Union Saint-Gilloise': 'USG',
  'VfB Stuttgart': 'VFB', 'SK Sturm Graz': 'STU',
  // Full Champions League path — domestic leagues
  'UE Santa Coloma': 'UES', 'FC Santa Coloma': 'FSC',
  "Inter Club d'Escaldes": 'INE', "Atlètic Club d'Escaldes": 'ATE', 'Club Esportiu Carroi': 'CAR',
  'FC Noah Yerevan': 'NOA', 'FC Pyunik Yerevan': 'PYU', 'FC Urartu Yerevan': 'URA',
  'BKMA Yerevan': 'BKM', 'FC Ararat Yerevan': 'AYR',
  'ML Vitebsk': 'MLV',
  'Lokomotiv Plovdiv': 'LPL', 'Lokomotiv Sofia': 'LSO',
  'Aris Limassol': 'ARI', 'Apollon Limassol': 'APO', 'AEL Limassol': 'AEL',
  'Omonia Nicosia': 'OMO', 'APOEL Nicosia': 'APL',
  'HB Tórshavn': 'HBT', 'B36 Tórshavn': 'B36',
  'Kuopion Palloseura': 'KUP', 'Vaasan Palloseura': 'VPS', 'Turun Palloseura': 'TPS',
  'Iberia 1999 Tbilisi': 'IBE', 'Dinamo Tbilisi': 'DTB', 'FC Spaeri Tbilisi': 'SPA',
  'Europa FC': 'EUR', 'Europa Point FC': 'EPT',
  'KA Akureyri': 'KAK', 'Thór Akureyri': 'THO',
  'Víkingur Reykjavík': 'VIK', 'Valur Reykjavík': 'VAL', 'KR Reykjavík': 'KRR', 'Fram Reykjavík': 'FRA',
  'Hapoel Beer Sheva': 'HBS', 'Hapoel Tel Aviv': 'HTA', 'Hapoel Petah Tikva': 'HPT', 'Hapoel Haifa': 'HHA',
  'Beitar Jerusalem': 'BEI', 'Hapoel Jerusalem': 'HJE',
  'Maccabi Tel Aviv': 'MTA', 'Maccabi Haifa': 'MHA', 'Maccabi Netanya': 'MNE', 'Maccabi Bnei Reineh': 'MBR',
  'Zhenis Astana': 'ZHN', 'FC Ulytau Zhezkazgan': 'ULY',
  'KF Prishtina e Re': 'PER',
  'CF Estrela Amadora': 'EAM',
  'FC Jeunesse Canach': 'CAN',
  'FK Kauno Zalgiris': 'KAU',
  'Gzira United FC': 'GZI', 'Gudja United FC': 'GUD',
  'Glentoran FC': 'GLT', 'Glenavon FC': 'GLV',
  'FC Shkupi': 'SKP', 'Struga Trim & Lum': 'STG', 'AP Brera Strumica': 'STM',
  'KRC Genk': 'GNK', 'KAA Gent': 'GNT',
  'Universitatea Craiova': 'CRA', 'FC Universitatea Cluj': 'UCJ',
  'Tre Fiori FC': 'TRF', 'La Fiorita 1967': 'LAF', 'SP Tre Penne': 'TRP',
  'Dundee United FC': 'DUU',
  'Red Star Belgrade': 'RSB', 'FK IMT Belgrad': 'IMT',
  'Panathinaikos': 'PAO', 'Panetolikos': 'PNT', 'Panserraikos': 'PSR',
  'PAOK Thessaloniki': 'PAK', 'Aris Thessaloniki': 'ART',
  'Odense Boldklub': 'OBK', 'Vejle Boldklub': 'VEJ',
  'SC Poltava': 'PLT',
  'Briton Ferry Llansawel': 'BFL', 'Barry Town United': 'BAR', 'Flint Town United': 'FLI',
}

// Letters only, diacritics folded, first three — the fallback when neither the
// table nor the database has a code.
function derive(name: string): string {
  const letters = name.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^A-Za-z0-9]/g, '')
  return (letters.slice(0, 3) || '???').toUpperCase()
}

export function clubCode(name: string, dbShortName?: string | null): string {
  return CLUB_CODE_OVERRIDES[name] ?? (dbShortName ? dbShortName.toUpperCase() : derive(name))
}
