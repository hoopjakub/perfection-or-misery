// P8-132: your own crest — its choices, and which side it goes on in which mode.
// npx tsx scripts/verify-crest.ts
import { cleanInitials, defaultDesign, readDesign, readColours, CREST_COLOURS } from '../src/lib/yourCrest'
import { useCrestStore, activateCrestFor, adoptRunCrest } from '../src/store/crestStore'

let failures = 0
function check(cond: boolean, msg: string) { if (!cond) { failures++; console.log('❌', msg) } }

check(cleanInitials('mün-chen 1860') === 'MUN', `letters: ${cleanInitials('mün-chen 1860')}`)
check(cleanInitials('ab') === 'AB' && cleanInitials('') === '', 'short letters kept, none stays none')
check(defaultDesign('Master Man').initials === 'MM' && defaultDesign('LittleBoy').initials === 'LIT' && defaultDesign(null).initials === 'YOU', 'a first design takes your name\'s letters')

// A stored design is the user's to write: anything outside the choices falls back.
const odd = readDesign({ shape: 'hexagon', primary: '#FF00FF', secondary: 'volt', device: 'stars', initials: 'toolong<script>' })
check(!!odd && odd.shape === 'shield' && odd.primary === 'ink' && odd.secondary === 'volt' && odd.device === 'none' && odd.initials === 'TOO', `a strange row is made safe: ${JSON.stringify(odd)}`)
check(readDesign(null) === null && readDesign('x') === null, 'no design reads as none')
check(new Set(CREST_COLOURS.map(c => c.id)).size === CREST_COLOURS.length, 'two colours share an id')

// Which side it goes on: the league modes always, the cups only with "everywhere".
const design = defaultDesign('Tester')
useCrestStore.getState().setMine({ design, imagePath: null, everywhere: false })
activateCrestFor('club-1', 'league')
check(useCrestStore.getState().active?.clubId === 'club-1', 'a league run wears your crest')
activateCrestFor('club-2', 'world_cup')
check(useCrestStore.getState().active === null, 'a World Cup run does not, without "everywhere"')
useCrestStore.getState().setMine({ design, imagePath: null, everywhere: true })
activateCrestFor('nation-1', 'world_cup')
check(useCrestStore.getState().active?.clubId === 'nation-1', 'with "everywhere" the World Cup side wears it')
useCrestStore.getState().setMine(null)
activateCrestFor('club-3', 'league')
check(useCrestStore.getState().active === null, 'no crest of your own: nothing replaced')

// A saved run wears the crest it was played with, and one without wears none.
adoptRunCrest({ crest: { clubId: 'old', choice: { design, imagePath: null, everywhere: false } } })
check(useCrestStore.getState().active?.clubId === 'old', 'a saved run brings its own crest')
adoptRunCrest({})
check(useCrestStore.getState().active === null, 'a saved run without one shows the club\'s')

// Another player's row, read carefully: a picture must be a crest file in a user's folder.
adoptRunCrest({ crest: { clubId: 'x', choice: { design: null, imagePath: 'https://elsewhere.example/x.jpg' } } })
check(useCrestStore.getState().active === null, 'a picture from anywhere else is refused')
adoptRunCrest({ crest: { clubId: 'x', choice: { design: null, imagePath: '6751e7ee-83d1-4de5-add6-995e4698161e/crest-1790323244964.jpg' } } })
check(useCrestStore.getState().active?.choice.imagePath != null, "a crest file in a user's folder is kept")

// P8-142: your club's colours, by palette id; alone they still put your side on.
check(readColours({ main: 'blue', second: 'gold' })?.second === 'gold' && readColours({ main: '#123456' }) === null && readColours({ main: 'red' })?.second === 'red', 'colours read against the palette')
useCrestStore.getState().setMine({ design: null, imagePath: null, everywhere: false, colours: { main: 'blue', second: 'gold' } })
activateCrestFor('club-9', 'league')
check(useCrestStore.getState().active?.choice.colours?.main === 'blue' && !useCrestStore.getState().active?.choice.design, 'colours without a crest still go on your side (and draw no crest)')
check(defaultDesign('A B', { main: 'green', second: 'cotton' }).primary === 'green', 'a new crest starts from your colours')

console.log(failures === 0 ? '✅ ALL CHECKS PASSED' : `${failures} failures`)
process.exit(failures === 0 ? 0 : 1)
