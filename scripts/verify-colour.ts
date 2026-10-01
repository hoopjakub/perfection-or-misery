// P8-177: the colour picker's arithmetic (src/lib/colour.ts): every palette
// colour, pure black, white and a grey survive hex → HSV → hex unchanged, and
// the hex field reads what people type.
//   npx tsx scripts/verify-colour.ts
import { hexToHsv, hsvToHex, readHex } from '../src/lib/colour'

let failures = 0
const check = (ok: boolean, msg: string) => { if (!ok) { failures++; console.log(`❌ ${msg}`) } }
for (const h of ['#ff5a00', '#4fff3f', '#0c0c0d', '#f3f3f0', '#ffd23f', '#2f7fe0', '#8b5cd6', '#ff2e4d', '#14271b', '#000000', '#ffffff', '#808080', '#123456'])
  check(hsvToHex(hexToHsv(h)) === h, `${h} comes back as ${hsvToHex(hexToHsv(h))}`)
check(readHex('F00') === '#ff0000', 'three digits')
check(readHex('#AbCdEf') === '#abcdef', 'mixed case')
check(readHex(' 1a2b3c ') === '#1a2b3c', 'no hash, spaces')
check(readHex('12') === null && readHex('#12345g') === null, 'not a colour yet')
console.log(failures === 0 ? '✅ ALL CHECKS PASSED' : `${failures} failures`)
process.exit(failures === 0 ? 0 : 1)
