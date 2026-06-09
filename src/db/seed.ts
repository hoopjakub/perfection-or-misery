import { getDb } from './setup'

export async function seedPremierLeague2025() {
  const db = await getDb()

  // check if already seeded
  const existing = await db.getFirstAsync<{ count: number }>(
    `SELECT COUNT(*) as count FROM leagues WHERE id = 'premier_league'`
  )
  if (existing && existing.count > 0) return

  // league
  await db.runAsync(
    `INSERT INTO leagues (id, name, country, games_per_season, tier) VALUES (?, ?, ?, ?, ?)`,
    ['premier_league', 'Premier League', 'England', 38, 1]
  )

  // clubs + season data
  const clubs = [
    { id: 'arsenal',     name: 'Arsenal',             short: 'ARS', color: '#EF0107', ovr: 87 },
    { id: 'man_city',    name: 'Manchester City',      short: 'MCI', color: '#6CABDD', ovr: 84 },
    { id: 'man_utd',     name: 'Manchester United',    short: 'MUN', color: '#DA291C', ovr: 81 },
    { id: 'aston_villa', name: 'Aston Villa',          short: 'AVL', color: '#95BFE5', ovr: 78 },
    { id: 'liverpool',   name: 'Liverpool',            short: 'LIV', color: '#C8102E', ovr: 76 },
    { id: 'bournemouth', name: 'Bournemouth',          short: 'BOU', color: '#DA291C', ovr: 73 },
    { id: 'sunderland',  name: 'Sunderland',           short: 'SUN', color: '#EB172B', ovr: 72 },
    { id: 'brighton',    name: 'Brighton',             short: 'BHA', color: '#0057B8', ovr: 72 },
    { id: 'brentford',   name: 'Brentford',            short: 'BRE', color: '#E30613', ovr: 71 },
    { id: 'chelsea',     name: 'Chelsea',              short: 'CHE', color: '#034694', ovr: 71 },
    { id: 'fulham',      name: 'Fulham',               short: 'FUL', color: '#FFFFFF', ovr: 70 },
    { id: 'newcastle',   name: 'Newcastle',            short: 'NEW', color: '#241F20', ovr: 69 },
    { id: 'everton',     name: 'Everton',              short: 'EVE', color: '#003399', ovr: 69 },
    { id: 'leeds',       name: 'Leeds United',         short: 'LEE', color: '#FFCD00', ovr: 68 },
    { id: 'crystal_palace', name: 'Crystal Palace',   short: 'CRY', color: '#1B458F', ovr: 67 },
    { id: 'nott_forest', name: 'Nottingham Forest',   short: 'NFO', color: '#DD0000', ovr: 67 },
    { id: 'spurs',       name: 'Tottenham',            short: 'TOT', color: '#132257', ovr: 66 },
    { id: 'west_ham',    name: 'West Ham',             short: 'WHU', color: '#7A263A', ovr: 65 },
    { id: 'burnley',     name: 'Burnley',              short: 'BUR', color: '#6C1D45', ovr: 62 },
    { id: 'wolves',      name: 'Wolverhampton',        short: 'WOL', color: '#FDB913', ovr: 61 },
  ]

  for (const club of clubs) {
    await db.runAsync(
      `INSERT INTO clubs (id, league_id, name, short_name, primary_color) VALUES (?, ?, ?, ?, ?)`,
      [club.id, 'premier_league', club.name, club.short, club.color]
    )
    await db.runAsync(
      `INSERT INTO club_seasons (id, club_id, year_start, year_end, historical_ovr, league_position)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [
        `${club.id}_2025`,
        club.id,
        2025, 2026,
        club.ovr,
        clubs.indexOf(club) + 1
      ]
    )
  }

  // players — 5 key players per club, positions spread across the formation
  const players: {
    id: string, name: string, nationality: string,
    pos: string, secondary: string,
    clubSeasonId: string, ovr: number,
    attack: number, defense: number, physical: number, pace: number, technical: number
  }[] = [
    // arsenal
    { id: 'raya',        name: 'David Raya',        nationality: 'Spanish',   pos: 'GK',  secondary: '[]',           clubSeasonId: 'arsenal_2025',     ovr: 85, attack: 30, defense: 84, physical: 78, pace: 50, technical: 80 },
    { id: 'saliba',      name: 'William Saliba',    nationality: 'French',    pos: 'CB',  secondary: '[]',           clubSeasonId: 'arsenal_2025',     ovr: 87, attack: 45, defense: 88, physical: 85, pace: 78, technical: 75 },
    { id: 'odegaard',    name: 'Martin Odegaard',   nationality: 'Norwegian', pos: 'CAM', secondary: '["CM"]',       clubSeasonId: 'arsenal_2025',     ovr: 88, attack: 86, defense: 65, physical: 70, pace: 72, technical: 90 },
    { id: 'saka',        name: 'Bukayo Saka',       nationality: 'English',   pos: 'RW',  secondary: '["CAM"]',      clubSeasonId: 'arsenal_2025',     ovr: 88, attack: 87, defense: 68, physical: 74, pace: 86, technical: 88 },
    { id: 'havertz',     name: 'Kai Havertz',       nationality: 'German',    pos: 'ST',  secondary: '["CAM","CM"]', clubSeasonId: 'arsenal_2025',     ovr: 84, attack: 83, defense: 60, physical: 80, pace: 75, technical: 84 },

    // man city
    { id: 'ederson',     name: 'Ederson',           nationality: 'Brazilian', pos: 'GK',  secondary: '[]',           clubSeasonId: 'man_city_2025',    ovr: 87, attack: 35, defense: 86, physical: 80, pace: 55, technical: 82 },
    { id: 'ruben_dias',  name: 'Ruben Dias',        nationality: 'Portuguese',pos: 'CB',  secondary: '[]',           clubSeasonId: 'man_city_2025',    ovr: 87, attack: 42, defense: 88, physical: 84, pace: 72, technical: 76 },
    { id: 'rodri',       name: 'Rodri',             nationality: 'Spanish',   pos: 'CDM', secondary: '["CM"]',       clubSeasonId: 'man_city_2025',    ovr: 91, attack: 72, defense: 84, physical: 82, pace: 68, technical: 88 },
    { id: 'de_bruyne',   name: 'Kevin De Bruyne',   nationality: 'Belgian',   pos: 'CM',  secondary: '["CAM"]',      clubSeasonId: 'man_city_2025',    ovr: 90, attack: 88, defense: 68, physical: 76, pace: 76, technical: 92 },
    { id: 'haaland',     name: 'Erling Haaland',    nationality: 'Norwegian', pos: 'ST',  secondary: '[]',           clubSeasonId: 'man_city_2025',    ovr: 92, attack: 93, defense: 45, physical: 88, pace: 89, technical: 82 },

    // man utd
    { id: 'onana',       name: 'Andre Onana',       nationality: 'Cameroonian',pos: 'GK', secondary: '[]',           clubSeasonId: 'man_utd_2025',     ovr: 82, attack: 28, defense: 82, physical: 78, pace: 48, technical: 78 },
    { id: 'maguire',     name: 'Harry Maguire',     nationality: 'English',   pos: 'CB',  secondary: '[]',           clubSeasonId: 'man_utd_2025',     ovr: 78, attack: 38, defense: 80, physical: 82, pace: 62, technical: 70 },
    { id: 'mainoo',      name: 'Kobbie Mainoo',     nationality: 'English',   pos: 'CM',  secondary: '["CDM"]',      clubSeasonId: 'man_utd_2025',     ovr: 82, attack: 74, defense: 76, physical: 74, pace: 74, technical: 82 },
    { id: 'rashford',    name: 'Marcus Rashford',   nationality: 'English',   pos: 'LW',  secondary: '["ST"]',       clubSeasonId: 'man_utd_2025',     ovr: 82, attack: 82, defense: 52, physical: 78, pace: 88, technical: 80 },
    { id: 'hojlund',     name: 'Rasmus Hojlund',    nationality: 'Danish',    pos: 'ST',  secondary: '[]',           clubSeasonId: 'man_utd_2025',     ovr: 80, attack: 80, defense: 44, physical: 80, pace: 82, technical: 76 },

    // aston villa
    { id: 'martinez_gk', name: 'Emi Martinez',      nationality: 'Argentine', pos: 'GK',  secondary: '[]',           clubSeasonId: 'aston_villa_2025', ovr: 87, attack: 32, defense: 86, physical: 80, pace: 50, technical: 82 },
    { id: 'konsa',       name: 'Ezri Konsa',        nationality: 'English',   pos: 'CB',  secondary: '[]',           clubSeasonId: 'aston_villa_2025', ovr: 80, attack: 40, defense: 81, physical: 80, pace: 74, technical: 72 },
    { id: 'tielemans',   name: 'Youri Tielemans',   nationality: 'Belgian',   pos: 'CM',  secondary: '["CDM","CAM"]',clubSeasonId: 'aston_villa_2025', ovr: 80, attack: 76, defense: 72, physical: 72, pace: 68, technical: 82 },
    { id: 'watkins',     name: 'Ollie Watkins',     nationality: 'English',   pos: 'ST',  secondary: '[]',           clubSeasonId: 'aston_villa_2025', ovr: 84, attack: 84, defense: 52, physical: 78, pace: 84, technical: 78 },
    { id: 'diaby',       name: 'Moussa Diaby',      nationality: 'French',    pos: 'RW',  secondary: '["LW"]',       clubSeasonId: 'aston_villa_2025', ovr: 80, attack: 80, defense: 48, physical: 72, pace: 90, technical: 80 },

    // liverpool
    { id: 'alisson',     name: 'Alisson',           nationality: 'Brazilian', pos: 'GK',  secondary: '[]',           clubSeasonId: 'liverpool_2025',   ovr: 89, attack: 30, defense: 88, physical: 80, pace: 52, technical: 84 },
    { id: 'van_dijk',    name: 'Virgil van Dijk',   nationality: 'Dutch',     pos: 'CB',  secondary: '[]',           clubSeasonId: 'liverpool_2025',   ovr: 88, attack: 48, defense: 90, physical: 88, pace: 76, technical: 80 },
    { id: 'mac_allister', name: 'Alexis Mac Allister',nationality: 'Argentine',pos: 'CM', secondary: '["CDM"]',      clubSeasonId: 'liverpool_2025',   ovr: 83, attack: 78, defense: 74, physical: 76, pace: 70, technical: 84 },
    { id: 'salah',       name: 'Mohamed Salah',     nationality: 'Egyptian',  pos: 'RW',  secondary: '["ST"]',       clubSeasonId: 'liverpool_2025',   ovr: 90, attack: 90, defense: 60, physical: 76, pace: 88, technical: 88 },
    { id: 'nunez',       name: 'Darwin Nunez',      nationality: 'Uruguayan', pos: 'ST',  secondary: '[]',           clubSeasonId: 'liverpool_2025',   ovr: 82, attack: 84, defense: 44, physical: 82, pace: 90, technical: 74 },

    // bournemouth
    { id: 'flekken',     name: 'Mark Flekken',      nationality: 'Dutch',     pos: 'GK',  secondary: '[]',           clubSeasonId: 'bournemouth_2025', ovr: 78, attack: 28, defense: 78, physical: 76, pace: 46, technical: 74 },
    { id: 'kerkez',      name: 'Milos Kerkez',      nationality: 'Hungarian', pos: 'LB',  secondary: '[]',           clubSeasonId: 'bournemouth_2025', ovr: 76, attack: 62, defense: 74, physical: 72, pace: 80, technical: 72 },
    { id: 'cook',        name: 'Lewis Cook',        nationality: 'English',   pos: 'CM',  secondary: '["CDM"]',      clubSeasonId: 'bournemouth_2025', ovr: 74, attack: 66, defense: 72, physical: 72, pace: 66, technical: 74 },
    { id: 'semenyo',     name: 'Antoine Semenyo',   nationality: 'Ghanaian',  pos: 'RW',  secondary: '["ST"]',       clubSeasonId: 'bournemouth_2025', ovr: 76, attack: 76, defense: 46, physical: 74, pace: 84, technical: 72 },
    { id: 'evanilson',   name: 'Evanilson',         nationality: 'Brazilian', pos: 'ST',  secondary: '[]',           clubSeasonId: 'bournemouth_2025', ovr: 77, attack: 78, defense: 42, physical: 76, pace: 78, technical: 72 },

    // sunderland
    { id: 'patterson',   name: 'Nathan Patterson',  nationality: 'Scottish',  pos: 'RB',  secondary: '[]',           clubSeasonId: 'sunderland_2025',  ovr: 72, attack: 58, defense: 72, physical: 72, pace: 76, technical: 66 },
    { id: 'woods',       name: 'Chris Woods',       nationality: 'English',   pos: 'GK',  secondary: '[]',           clubSeasonId: 'sunderland_2025',  ovr: 70, attack: 26, defense: 70, physical: 72, pace: 44, technical: 66 },
    { id: 'neil_CM',     name: 'Dan Neil',          nationality: 'English',   pos: 'CM',  secondary: '["CDM"]',      clubSeasonId: 'sunderland_2025',  ovr: 72, attack: 64, defense: 68, physical: 70, pace: 66, technical: 72 },
    { id: 'mayenda',     name: 'Eliezer Mayenda',   nationality: 'Spanish',   pos: 'ST',  secondary: '[]',           clubSeasonId: 'sunderland_2025',  ovr: 72, attack: 72, defense: 38, physical: 72, pace: 76, technical: 68 },
    { id: 'bellingham_j',name: 'Jobe Bellingham',   nationality: 'English',   pos: 'CM',  secondary: '["CAM"]',      clubSeasonId: 'sunderland_2025',  ovr: 74, attack: 72, defense: 66, physical: 72, pace: 70, technical: 76 },

    // brighton
    { id: 'verbruggen',  name: 'Bart Verbruggen',   nationality: 'Dutch',     pos: 'GK',  secondary: '[]',           clubSeasonId: 'brighton_2025',    ovr: 78, attack: 28, defense: 78, physical: 76, pace: 48, technical: 76 },
    { id: 'van_hecke',   name: 'Jan Paul van Hecke',nationality: 'Dutch',     pos: 'CB',  secondary: '[]',           clubSeasonId: 'brighton_2025',    ovr: 76, attack: 38, defense: 77, physical: 78, pace: 70, technical: 72 },
    { id: 'gross',       name: 'Pascal Gross',      nationality: 'German',    pos: 'CM',  secondary: '["CAM","RW"]', clubSeasonId: 'brighton_2025',    ovr: 76, attack: 72, defense: 68, physical: 68, pace: 66, technical: 78 },
    { id: 'mitoma',      name: 'Kaoru Mitoma',      nationality: 'Japanese',  pos: 'LW',  secondary: '["RW"]',       clubSeasonId: 'brighton_2025',    ovr: 80, attack: 80, defense: 50, physical: 70, pace: 88, technical: 80 },
    { id: 'welbeck',     name: 'Danny Welbeck',     nationality: 'English',   pos: 'ST',  secondary: '["LW"]',       clubSeasonId: 'brighton_2025',    ovr: 74, attack: 74, defense: 44, physical: 74, pace: 76, technical: 72 },

    // brentford
    { id: 'flekken_b',   name: 'Thomas Strakosha',  nationality: 'Albanian',  pos: 'GK',  secondary: '[]',           clubSeasonId: 'brentford_2025',   ovr: 74, attack: 26, defense: 74, physical: 74, pace: 44, technical: 70 },
    { id: 'pinnock',     name: 'Ethan Pinnock',     nationality: 'Jamaican',  pos: 'CB',  secondary: '[]',           clubSeasonId: 'brentford_2025',   ovr: 74, attack: 36, defense: 75, physical: 80, pace: 70, technical: 66 },
    { id: 'norgaard',    name: 'Christian Norgaard',nationality: 'Danish',    pos: 'CDM', secondary: '["CM"]',       clubSeasonId: 'brentford_2025',   ovr: 76, attack: 62, defense: 76, physical: 78, pace: 62, technical: 72 },
    { id: 'mbeumo',      name: 'Bryan Mbeumo',      nationality: 'Cameroonian',pos: 'RW', secondary: '["ST"]',       clubSeasonId: 'brentford_2025',   ovr: 80, attack: 80, defense: 46, physical: 72, pace: 84, technical: 78 },
    { id: 'toney',       name: 'Ivan Toney',        nationality: 'English',   pos: 'ST',  secondary: '[]',           clubSeasonId: 'brentford_2025',   ovr: 80, attack: 80, defense: 46, physical: 80, pace: 72, technical: 76 },

    // chelsea
    { id: 'sanchez_r',   name: 'Robert Sanchez',    nationality: 'Spanish',   pos: 'GK',  secondary: '[]',           clubSeasonId: 'chelsea_2025',     ovr: 78, attack: 28, defense: 78, physical: 76, pace: 48, technical: 74 },
    { id: 'silva_t',     name: 'Thiago Silva',      nationality: 'Brazilian', pos: 'CB',  secondary: '[]',           clubSeasonId: 'chelsea_2025',     ovr: 80, attack: 42, defense: 82, physical: 76, pace: 60, technical: 78 },
    { id: 'caicedo',     name: 'Moises Caicedo',    nationality: 'Ecuadorian',pos: 'CDM', secondary: '["CM"]',       clubSeasonId: 'chelsea_2025',     ovr: 82, attack: 68, defense: 80, physical: 80, pace: 74, technical: 78 },
    { id: 'palmer',      name: 'Cole Palmer',       nationality: 'English',   pos: 'CAM', secondary: '["RW","CM"]',  clubSeasonId: 'chelsea_2025',     ovr: 86, attack: 86, defense: 56, physical: 70, pace: 78, technical: 88 },
    { id: 'jackson',     name: 'Nicolas Jackson',   nationality: 'Senegalese',pos: 'ST',  secondary: '[]',           clubSeasonId: 'chelsea_2025',     ovr: 78, attack: 78, defense: 42, physical: 76, pace: 84, technical: 74 },

    // fulham
    { id: 'leno',        name: 'Bernd Leno',        nationality: 'German',    pos: 'GK',  secondary: '[]',           clubSeasonId: 'fulham_2025',      ovr: 80, attack: 28, defense: 80, physical: 76, pace: 46, technical: 76 },
    { id: 'andersen',    name: 'Joachim Andersen',  nationality: 'Danish',    pos: 'CB',  secondary: '[]',           clubSeasonId: 'fulham_2025',      ovr: 78, attack: 38, defense: 79, physical: 80, pace: 68, technical: 72 },
    { id: 'palhinha',    name: 'Joao Palhinha',     nationality: 'Portuguese',pos: 'CDM', secondary: '[]',           clubSeasonId: 'fulham_2025',      ovr: 80, attack: 58, defense: 82, physical: 84, pace: 64, technical: 72 },
    { id: 'pereira',     name: 'Andreas Pereira',   nationality: 'Belgian',   pos: 'CAM', secondary: '["CM"]',       clubSeasonId: 'fulham_2025',      ovr: 76, attack: 74, defense: 60, physical: 70, pace: 70, technical: 78 },
    { id: 'jimenez',     name: 'Raul Jimenez',      nationality: 'Mexican',   pos: 'ST',  secondary: '[]',           clubSeasonId: 'fulham_2025',      ovr: 76, attack: 76, defense: 42, physical: 76, pace: 72, technical: 74 },

    // newcastle
    { id: 'pope',        name: 'Nick Pope',         nationality: 'English',   pos: 'GK',  secondary: '[]',           clubSeasonId: 'newcastle_2025',   ovr: 82, attack: 28, defense: 82, physical: 78, pace: 46, technical: 78 },
    { id: 'botman',      name: 'Sven Botman',       nationality: 'Dutch',     pos: 'CB',  secondary: '[]',           clubSeasonId: 'newcastle_2025',   ovr: 78, attack: 36, defense: 79, physical: 80, pace: 68, technical: 70 },
    { id: 'guimaraes',   name: 'Bruno Guimaraes',   nationality: 'Brazilian', pos: 'CDM', secondary: '["CM"]',       clubSeasonId: 'newcastle_2025',   ovr: 86, attack: 74, defense: 80, physical: 80, pace: 70, technical: 84 },
    { id: 'almiron',     name: 'Miguel Almiron',    nationality: 'Paraguayan',pos: 'CAM', secondary: '["CM","RW"]',  clubSeasonId: 'newcastle_2025',   ovr: 76, attack: 74, defense: 62, physical: 72, pace: 80, technical: 74 },
    { id: 'isak',        name: 'Alexander Isak',    nationality: 'Swedish',   pos: 'ST',  secondary: '[]',           clubSeasonId: 'newcastle_2025',   ovr: 84, attack: 84, defense: 44, physical: 78, pace: 86, technical: 82 },

    // everton
    { id: 'pickford',    name: 'Jordan Pickford',   nationality: 'English',   pos: 'GK',  secondary: '[]',           clubSeasonId: 'everton_2025',     ovr: 80, attack: 28, defense: 80, physical: 74, pace: 48, technical: 76 },
    { id: 'branthwaite', name: 'Jarrad Branthwaite',nationality: 'English',   pos: 'CB',  secondary: '[]',           clubSeasonId: 'everton_2025',     ovr: 78, attack: 36, defense: 79, physical: 80, pace: 70, technical: 70 },
    { id: 'gueye',       name: 'Idrissa Gueye',     nationality: 'Senegalese',pos: 'CDM', secondary: '["CM"]',       clubSeasonId: 'everton_2025',     ovr: 74, attack: 58, defense: 76, physical: 76, pace: 68, technical: 70 },
    { id: 'doucouré',    name: 'Abdoulaye Doucouré',nationality: 'French',    pos: 'CM',  secondary: '["CAM"]',      clubSeasonId: 'everton_2025',     ovr: 74, attack: 70, defense: 68, physical: 76, pace: 70, technical: 72 },
    { id: 'calvert_lewin',name: 'Dominic Calvert-Lewin',nationality: 'English',pos:'ST',  secondary: '[]',           clubSeasonId: 'everton_2025',     ovr: 76, attack: 76, defense: 42, physical: 80, pace: 74, technical: 70 },

    // leeds
    { id: 'meslier',     name: 'Illan Meslier',     nationality: 'French',    pos: 'GK',  secondary: '[]',           clubSeasonId: 'leeds_2025',       ovr: 76, attack: 26, defense: 76, physical: 74, pace: 46, technical: 72 },
    { id: 'rodon',       name: 'Joe Rodon',         nationality: 'Welsh',     pos: 'CB',  secondary: '[]',           clubSeasonId: 'leeds_2025',       ovr: 74, attack: 34, defense: 75, physical: 78, pace: 66, technical: 68 },
    { id: 'ampadu',      name: 'Ethan Ampadu',      nationality: 'Welsh',     pos: 'CDM', secondary: '["CM","CB"]',  clubSeasonId: 'leeds_2025',       ovr: 74, attack: 60, defense: 74, physical: 72, pace: 66, technical: 72 },
    { id: 'gnonto',      name: 'Wilfried Gnonto',   nationality: 'Italian',   pos: 'LW',  secondary: '["RW"]',       clubSeasonId: 'leeds_2025',       ovr: 74, attack: 74, defense: 44, physical: 66, pace: 86, technical: 74 },
    { id: 'bamford',     name: 'Patrick Bamford',   nationality: 'English',   pos: 'ST',  secondary: '[]',           clubSeasonId: 'leeds_2025',       ovr: 72, attack: 72, defense: 40, physical: 72, pace: 70, technical: 70 },

    // crystal palace
    { id: 'henderson_d', name: 'Dean Henderson',    nationality: 'English',   pos: 'GK',  secondary: '[]',           clubSeasonId: 'crystal_palace_2025', ovr: 76, attack: 26, defense: 76, physical: 74, pace: 46, technical: 72 },
    { id: 'guehi',       name: 'Marc Guehi',        nationality: 'English',   pos: 'CB',  secondary: '[]',           clubSeasonId: 'crystal_palace_2025', ovr: 78, attack: 36, defense: 79, physical: 76, pace: 70, technical: 72 },
    { id: 'doucoure_p',  name: 'Cheick Doucoure',   nationality: 'Malian',    pos: 'CDM', secondary: '["CM"]',       clubSeasonId: 'crystal_palace_2025', ovr: 74, attack: 56, defense: 74, physical: 74, pace: 68, technical: 70 },
    { id: 'eze',         name: 'Eberechi Eze',      nationality: 'English',   pos: 'CAM', secondary: '["CM","RW"]',  clubSeasonId: 'crystal_palace_2025', ovr: 82, attack: 82, defense: 52, physical: 70, pace: 78, technical: 84 },
    { id: 'olise',       name: 'Michael Olise',     nationality: 'French',    pos: 'RW',  secondary: '["CAM"]',      clubSeasonId: 'crystal_palace_2025', ovr: 82, attack: 82, defense: 48, physical: 68, pace: 80, technical: 86 },

    // nottingham forest
    { id: 'henderson_j', name: 'Matt Turner',       nationality: 'American',  pos: 'GK',  secondary: '[]',           clubSeasonId: 'nott_forest_2025', ovr: 74, attack: 26, defense: 74, physical: 74, pace: 44, technical: 70 },
    { id: 'murillo',     name: 'Murillo',           nationality: 'Brazilian', pos: 'CB',  secondary: '[]',           clubSeasonId: 'nott_forest_2025', ovr: 76, attack: 36, defense: 77, physical: 78, pace: 72, technical: 68 },
    { id: 'yates',       name: 'Ryan Yates',        nationality: 'English',   pos: 'CM',  secondary: '["CDM"]',      clubSeasonId: 'nott_forest_2025', ovr: 72, attack: 62, defense: 70, physical: 74, pace: 64, technical: 68 },
    { id: 'elanga',      name: 'Anthony Elanga',    nationality: 'Swedish',   pos: 'RW',  secondary: '["LW"]',       clubSeasonId: 'nott_forest_2025', ovr: 74, attack: 72, defense: 44, physical: 70, pace: 86, technical: 70 },
    { id: 'awoniyi',     name: 'Taiwo Awoniyi',     nationality: 'Nigerian',  pos: 'ST',  secondary: '[]',           clubSeasonId: 'nott_forest_2025', ovr: 74, attack: 74, defense: 40, physical: 76, pace: 76, technical: 68 },

    // spurs
    { id: 'vicario',     name: 'Guglielmo Vicario', nationality: 'Italian',   pos: 'GK',  secondary: '[]',           clubSeasonId: 'spurs_2025',       ovr: 80, attack: 28, defense: 80, physical: 76, pace: 48, technical: 76 },
    { id: 'romero',      name: 'Cristian Romero',   nationality: 'Argentine', pos: 'CB',  secondary: '[]',           clubSeasonId: 'spurs_2025',       ovr: 82, attack: 44, defense: 84, physical: 82, pace: 74, technical: 74 },
    { id: 'bissouma',    name: 'Yves Bissouma',     nationality: 'Malian',    pos: 'CDM', secondary: '["CM"]',       clubSeasonId: 'spurs_2025',       ovr: 76, attack: 62, defense: 76, physical: 78, pace: 70, technical: 72 },
    { id: 'maddison',    name: 'James Maddison',    nationality: 'English',   pos: 'CAM', secondary: '["CM","RW"]',  clubSeasonId: 'spurs_2025',       ovr: 82, attack: 80, defense: 58, physical: 68, pace: 70, technical: 84 },
    { id: 'son',         name: 'Son Heung-min',     nationality: 'South Korean',pos:'LW', secondary: '["ST","CAM"]', clubSeasonId: 'spurs_2025',       ovr: 84, attack: 84, defense: 54, physical: 72, pace: 84, technical: 84 },

    // west ham
    { id: 'fabianski',   name: 'Lukasz Fabianski',  nationality: 'Polish',    pos: 'GK',  secondary: '[]',           clubSeasonId: 'west_ham_2025',    ovr: 72, attack: 24, defense: 72, physical: 72, pace: 42, technical: 68 },
    { id: 'zouma',       name: 'Kurt Zouma',        nationality: 'French',    pos: 'CB',  secondary: '[]',           clubSeasonId: 'west_ham_2025',    ovr: 74, attack: 36, defense: 75, physical: 82, pace: 68, technical: 66 },
    { id: 'soucek',      name: 'Tomas Soucek',      nationality: 'Czech',     pos: 'CM',  secondary: '["CDM"]',      clubSeasonId: 'west_ham_2025',    ovr: 74, attack: 68, defense: 70, physical: 80, pace: 62, technical: 68 },
    { id: 'paqueta',     name: 'Lucas Paqueta',     nationality: 'Brazilian', pos: 'CAM', secondary: '["CM"]',       clubSeasonId: 'west_ham_2025',    ovr: 78, attack: 76, defense: 60, physical: 70, pace: 70, technical: 80 },
    { id: 'antonio',     name: 'Michail Antonio',   nationality: 'Jamaican',  pos: 'ST',  secondary: '["LW"]',       clubSeasonId: 'west_ham_2025',    ovr: 72, attack: 72, defense: 42, physical: 78, pace: 76, technical: 66 },

    // burnley
    { id: 'trafford',    name: 'James Trafford',    nationality: 'English',   pos: 'GK',  secondary: '[]',           clubSeasonId: 'burnley_2025',     ovr: 70, attack: 24, defense: 70, physical: 72, pace: 42, technical: 66 },
    { id: 'taylor_c',    name: 'Charlie Taylor',    nationality: 'English',   pos: 'LB',  secondary: '[]',           clubSeasonId: 'burnley_2025',     ovr: 66, attack: 50, defense: 66, physical: 68, pace: 68, technical: 62 },
    { id: 'brownhill',   name: 'Josh Brownhill',    nationality: 'English',   pos: 'CM',  secondary: '["CDM"]',      clubSeasonId: 'burnley_2025',     ovr: 68, attack: 60, defense: 64, physical: 70, pace: 62, technical: 66 },
    { id: 'rodriguez',   name: 'Jay Rodriguez',     nationality: 'English',   pos: 'ST',  secondary: '["LW"]',       clubSeasonId: 'burnley_2025',     ovr: 66, attack: 66, defense: 36, physical: 70, pace: 64, technical: 62 },
    { id: 'zaroury',     name: 'Anass Zaroury',     nationality: 'Moroccan',  pos: 'LW',  secondary: '["RW"]',       clubSeasonId: 'burnley_2025',     ovr: 68, attack: 68, defense: 40, physical: 66, pace: 80, technical: 66 },

    // wolves
    { id: 'jose_sa',     name: 'Jose Sa',           nationality: 'Portuguese',pos: 'GK',  secondary: '[]',           clubSeasonId: 'wolves_2025',      ovr: 74, attack: 26, defense: 74, physical: 74, pace: 44, technical: 70 },
    { id: 'dawson',      name: 'Craig Dawson',      nationality: 'English',   pos: 'CB',  secondary: '[]',           clubSeasonId: 'wolves_2025',      ovr: 68, attack: 32, defense: 69, physical: 76, pace: 60, technical: 62 },
    { id: 'neves',       name: 'Ruben Neves',       nationality: 'Portuguese',pos: 'CDM', secondary: '["CM"]',       clubSeasonId: 'wolves_2025',      ovr: 74, attack: 64, defense: 72, physical: 72, pace: 62, technical: 76 },
    { id: 'cunha',       name: 'Matheus Cunha',     nationality: 'Brazilian', pos: 'CAM', secondary: '["ST","LW"]',  clubSeasonId: 'wolves_2025',      ovr: 78, attack: 78, defense: 48, physical: 72, pace: 76, technical: 78 },
    { id: 'hwang',       name: 'Hwang Hee-chan',    nationality: 'South Korean',pos:'ST',  secondary: '["LW"]',       clubSeasonId: 'wolves_2025',      ovr: 72, attack: 72, defense: 40, physical: 70, pace: 82, technical: 68 },
  ]

  for (const p of players) {
    // insert player master record if not exists
    await db.runAsync(
      `INSERT OR IGNORE INTO players (id, name, nationality, primary_position, secondary_positions)
       VALUES (?, ?, ?, ?, ?)`,
      [p.id, p.name, p.nationality, p.pos, p.secondary]
    )
    // insert player season
    await db.runAsync(
      `INSERT OR IGNORE INTO player_seasons
         (id, player_id, club_season_id, ovr, attack, defense, physical, pace, technical, is_icon)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        `${p.id}_2025`, p.id, p.clubSeasonId,
        p.ovr, p.attack, p.defense, p.physical, p.pace, p.technical, 0
      ]
    )
  }

  console.log('seeded 2025/26 premier league — 20 clubs, 100 players')
}