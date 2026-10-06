// Phase 9, Diagnostics step 1 (docs/diagnostics/03-BUDGETS.md): the contract.
// Every number the app measures has a key here, with what it's for and when
// it's too slow. The targets are provisional until the first reading on the
// maintainer's phone (a POCO X6 5G); a target moves only with a reading
// written beside it (03 §7). No React, no RN: scripts/verify-budgets.ts reads it.

export type Budget = {
  target: number        // above it is WARN
  hardFail: number      // above it is FAIL; always greater than target
  unit: 'ms' | 'MB' | 'KB'
  label: string         // what it's FOR, in plain words
  platforms?: Array<'android' | 'web'>   // absent = both
  network?: true        // includes a round trip, so a FAIL on a train isn't a code fault
  planned?: true        // the feature doesn't exist yet; the number is the design decision
  buildTime?: true      // weighed by scripts/perf-size.ts, never sampled by the app
}

const ms = (target: number, hardFail: number, label: string, more: Partial<Budget> = {}): Budget =>
  ({ target, hardFail, unit: 'ms', label, ...more })

export const BUDGETS = {
  // 2.1 Boot and data
  'db:fetch':          ms(1500, 5000, 'downloading the database (web)', { platforms: ['web'], network: true }),
  'db:open':           ms(400, 1200, 'opening the database'),
  'db:install':        ms(3000, 8000, 'copying the database after an update', { platforms: ['android'] }),
  'boot:interactive':  ms(1500, 3000, 'from JS start to Home drawn'),
  'ui:navigate':       ms(150, 350, 'a tap to the next screen drawn'),
  'ui:tab':            ms(100, 300, "a tab switched to its first frame (a season's Table, Results…)"),
  'query:pool':        ms(250, 700, 'the club-seasons a mode can spin'),
  'query:rosters':     ms(150, 400, "the squads of the clubs a stage needs (only the ones not read yet)"),
  // 2.2 Setup
  'draft:spin':        ms(150, 400, 'a draft spin to its squad'),
  'placement:build':   ms(100, 300, 'building the league you were drawn into'),
  // 2.3 Simulation. Re-keyed in step 2 (5 Oct) to the screens as they are
  // after centralisation: the league season and the full path's domestic
  // season share one loop, as do the two league phases, and every knockout
  // bracket is simulated by two engine functions.
  'sim:matchday:league': ms(60, 150, 'one league matchday (the league, the full path at home)'),
  'sim:skip:league':   ms(800, 2000, 'skipping a league season to the end'),
  'sim:matchday:ucl':  ms(60, 150, 'one league-phase matchday'),
  'sim:skip:ucl':      ms(1000, 2500, 'skipping a league phase to its end'),
  'sim:matchday:wc':   ms(60, 150, "one World Cup group matchday"),
  'sim:skip:wc':       ms(800, 2000, "skipping the World Cup's groups"),
  'sim:knockouts':     ms(300, 1000, 'a knockout bracket, every round'),
  'sim:europe':        ms(1500, 4000, "the rest of Europe's seasons, cups and qualifying ladders (full path)"),
  // 2.4 Match detail, Deep Match and stats
  'detail:generate':   ms(15, 40, 'one match sheet'),
  'deep:timeline':     ms(40, 120, "the Deep Match's timeline"),
  'stats:league':      ms(700, 2000, "a league run's stats"),
  'stats:ucl':         ms(600, 1800, "a European run's stats"),
  'stats:wc':          ms(400, 1200, "a World Cup run's stats"),
  // Phase 9 additions: the result screen's mount (audit 04 §2) and the pundits'
  // tournaments (the maintainer's "lags the phone badly", 25 Sept).
  'screen:result':     ms(300, 800, 'a tap to the result screen drawn'),
  'pundits:build':     ms(80, 250, "one pundit's whole tournament, played out"),
  // 2.5 Frames (p95 of the gap between frames)
  'frame:deepMatch':   ms(20, 50, 'the Deep Match, live'),
  'frame:globe':       ms(20, 50, 'the globes (the draw and About)'),
  'frame:ceremony':    ms(20, 50, 'the trophy lift'),
  'frame:bracket':     ms(17, 33, 'pinching and panning the bracket'),
  // 2.6 Stalls and memory
  'stall:js':          ms(200, 700, 'the JS thread blocked (over 50 ms late)'),
  'mem:js':            { target: 250, hardFail: 400, unit: 'MB', label: 'the JS heap' },
  // 2.7 Save and network
  'save:run':          ms(1500, 5000, 'saving a finished run', { network: true }),
  'save:career':       ms(1500, 5000, 'adding a run to your career', { network: true }),
  'net:leaderboard':   ms(1200, 4000, 'loading Ranks', { network: true }),
  'net:runs':          ms(1200, 4000, 'loading your runs', { network: true }),
  // 3. Planned: screens the overhaul adds
  'frame:draw':        ms(20, 50, 'the broadcast draw', { planned: true }),
  'frame:verdict':     ms(20, 50, "the verdict's stitch", { planned: true }),
  'share:label':       ms(600, 1500, 'rendering the share label', { planned: true }),
  // 4. Build time
  'size:apk':          { target: 60, hardFail: 90, unit: 'MB', label: 'the release APK', buildTime: true },
  'size:webJs':        { target: 1500, hardFail: 2500, unit: 'KB', label: 'the web entry bundle, gzipped', buildTime: true },
  'size:db':           { target: 12, hardFail: 16, unit: 'MB', label: 'the bundled database', buildTime: true },
  'size:assets':       { target: 20, hardFail: 30, unit: 'MB', label: 'everything under assets/ on the web', buildTime: true },
  // 5. Self-test: written only by src/diag/checks.ts, never by the game
  'bench:match':       ms(0.2, 1, 'one match, averaged over 2,000'),
  'bench:detail':      ms(15, 40, 'one match sheet, averaged over 200'),
  'bench:timeline':    ms(40, 120, 'one Deep Match timeline, averaged over 20'),
  'bench:leagueSeason': ms(400, 1200, 'a 20-club season'),
  'bench:stats':       ms(700, 2000, "that season's stats"),
  'bench:query':       ms(150, 400, 'one club-seasons query'),
  'bench:net':         ms(400, 1500, 'one round trip to the server', { network: true }),
} satisfies Record<string, Budget>

export type BudgetKey = keyof typeof BUDGETS

export const budgetSpec = (key: string): Budget | undefined => (BUDGETS as Record<string, Budget>)[key]

const keys = Object.keys(BUDGETS) as BudgetKey[]
export const isBench = (k: string) => k.startsWith('bench:')
/** Sampled by the running app: everything that isn't planned, build-time or the self-test. */
export const RUNTIME = keys.filter(k => { const b: Budget = BUDGETS[k]; return !b.planned && !b.buildTime && !isBench(k) })
export const PLANNED = keys.filter(k => (BUDGETS[k] as Budget).planned)
export const BUILD = keys.filter(k => (BUDGETS[k] as Budget).buildTime)
export const BENCH = keys.filter(isBench)
