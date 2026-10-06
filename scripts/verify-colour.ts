// P8-177: the colour picker's arithmetic (src/lib/colour.ts): every palette
// colour, pure black, white and a grey survive hex → HSV → hex unchanged, and
// the hex field reads what people type.
//   npx tsx scripts/verify-colour.ts
import { hexToHsv, hsvToHex, readHex } from '../src/lib/colour'
import { inkOn } from '../src/lib/contrast'

let failures = 0
const check = (ok: boolean, msg: string) => { if (!ok) { failures++; console.log(`❌ ${msg}`) } }
for (const h of ['#ff5a00', '#4fff3f', '#0c0c0d', '#f3f3f0', '#ffd23f', '#2f7fe0', '#8b5cd6', '#ff2e4d', '#14271b', '#000000', '#ffffff', '#808080', '#123456'])
  check(hsvToHex(hexToHsv(h)) === h, `${h} comes back as ${hsvToHex(hexToHsv(h))}`)
check(readHex('F00') === '#ff0000', 'three digits')
check(readHex('#AbCdEf') === '#abcdef', 'mixed case')
check(readHex(' 1a2b3c ') === '#1a2b3c', 'no hash, spaces')
check(readHex('12') === null && readHex('#12345g') === null, 'not a colour yet')
// inkOn (N-15): the ink that reads on every background given.
const INK = '#0C0C0D', COTTON = '#F3F3F0'
check(inkOn('#000000', INK, COTTON) === COTTON, 'cotton on black')
check(inkOn('#FFFFFF', INK, COTTON) === INK, 'ink on white')
check(inkOn('#F5C518', INK, COTTON) === INK, 'ink on gold')
check(inkOn(['#FFFFFF', '#000000'], INK, COTTON) === INK || inkOn(['#FFFFFF', '#000000'], INK, COTTON) === COTTON, 'two opposite backgrounds still pick one')
{
  // The property, not hand-picked answers: the chosen ink's worst contrast is never below the other's.
  const { ratio } = require('../src/lib/contrast') as typeof import('../src/lib/contrast')
  let seed = 7
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647)
  const hex = () => '#' + Math.floor(rnd() * 0xffffff).toString(16).padStart(6, '0')
  let bad = 0
  for (let i = 0; i < 1000; i++) {
    const bgs = [hex(), hex()]
    const got = inkOn(bgs, INK, COTTON), other = got === INK ? COTTON : INK
    if (Math.min(...bgs.map(b => ratio(got, b))) < Math.min(...bgs.map(b => ratio(other, b)))) bad++
  }
  check(bad === 0, `${bad} of 1000 colour pairs got the worse ink`)
}
console.log(failures === 0 ? '✅ ALL CHECKS PASSED' : `${failures} failures`)
process.exit(failures === 0 ? 0 : 1)
