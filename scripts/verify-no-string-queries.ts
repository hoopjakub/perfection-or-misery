/**
 * No value is spliced into a query as text (P8.5-23, docs/release/03-INJECTION.md).
 *
 *   npx tsx scripts/verify-no-string-queries.ts
 *
 * Three rules, over app/, src/ and supabase/:
 *   1. PostgREST filter STRINGS (`.or(`…`)`, `.filter(`…`)`): every `${…}` in
 *      one must be `${uuid(…)}` (src/lib/uuid.ts), the one checked kind of value
 *      allowed there. Values otherwise go through `.eq()`/`.ilike()`, which the
 *      builder sends as parameters.
 *   2. Local SQLite: no quoted interpolation (`'${…}'`) inside SQL text; values
 *      go in as `?` parameters. Splicing a list of `?` placeholders is fine.
 *   3. The .sql files: no `execute` that doesn't go through `format()` (with
 *      %I / %L doing the quoting).
 * Before scanning, the rules are run on known-bad samples, so a rule that's
 * silently stopped matching fails here instead of passing everything.
 */
import fs from 'fs'
import path from 'path'

const ROOT = path.join(__dirname, '..')
let failures = 0
const check = (cond: boolean, msg: string) => { if (!cond) { failures++; console.log(`❌ ${msg}`) } }

function filterStringProblems(code: string): string[] {
  const out: string[] = []
  for (const m of code.matchAll(/\.(or|filter)\(\s*`([^`]*)`/g)) {
    for (const v of m[2].matchAll(/\$\{([^}]*)\}/g)) if (!/^\s*uuid\(/.test(v[1])) out.push(`.${m[1]}(\`…\${${v[1]}}…\`)`)
  }
  return out
}
function sqlProblems(code: string): string[] {
  const out: string[] = []
  for (const m of code.matchAll(/`([^`]*)`/g)) {
    const t = m[1]
    if (!/\b(SELECT|INSERT|UPDATE|DELETE|WHERE)\b/.test(t)) continue
    for (const v of t.matchAll(/['"]\$\{([^}]*)\}['"]?/g)) out.push(`'\${${v[1]}}' in SQL`)
  }
  return out
}
function executeProblems(sql: string): string[] {
  const noComments = sql.replace(/--[^\n]*/g, '').replace(/\/\*[\s\S]*?\*\//g, '')
  // `grant/revoke execute on function` is a permission, not dynamic SQL.
  // A trigger's `execute function f()` names a function; it isn't dynamic SQL.
  return [...noComments.matchAll(/(?<!grant\s|revoke\s)\bexecute\s+(?!format\s*\(|on\s+function|function\s|procedure\s)/gi)].map(() => 'EXECUTE without format()')
}

// The rules have to catch the patterns this script exists for.
check(filterStringProblems("sel.or(`name.ilike.%${q}%`)").length === 1, 'rule 1 misses a raw value in .or()')
check(filterStringProblems("x.or(`a.eq.${uuid(me)},b.eq.${uuid(me)}`)").length === 0, 'rule 1 rejects uuid()')
check(sqlProblems("db.getAllAsync(`SELECT * FROM t WHERE l.id = '${leagueId}'`)").length === 1, 'rule 2 misses a quoted value in SQL')
check(sqlProblems("db.getAllAsync(`SELECT * FROM t WHERE id IN (${ids.map(() => '?').join(',')})`, ids)").length === 0, 'rule 2 rejects ? placeholders')
check(executeProblems("execute 'select ' || x;").length === 1 && executeProblems("execute format('select %I', x);").length === 0, 'rule 3 is wrong')
check(executeProblems('grant execute on function public.f(uuid) to authenticated;').length === 0, 'rule 3 flags a grant')
check(executeProblems('create trigger t before insert on x for each row execute function public.f();').length === 0, 'rule 3 flags a trigger')
check(executeProblems("execute 'select ' || x;").length === 1, 'rule 3 misses dynamic SQL')

function walk(dir: string, exts: string[], out: string[] = []): string[] {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.name === 'node_modules' || e.name.startsWith('.')) continue
    const p = path.join(dir, e.name)
    if (e.isDirectory()) walk(p, exts, out)
    else if (exts.some(x => e.name.endsWith(x))) out.push(p)
  }
  return out
}

let scanned = 0
for (const dir of ['app', 'src', 'supabase']) {
  for (const f of walk(path.join(ROOT, dir), ['.ts', '.tsx'])) {
    // Comment lines go: they quote the bad patterns as examples (src/lib/uuid.ts).
    const code = fs.readFileSync(f, 'utf8').split('\n').filter(l => !/^\s*(\/\/|\*|\/\*)/.test(l)).join('\n')
    scanned++
    for (const p of [...filterStringProblems(code), ...sqlProblems(code)]) check(false, `${path.relative(ROOT, f)}: ${p}`)
  }
}
for (const f of walk(path.join(ROOT, 'supabase'), ['.sql'])) {
  scanned++
  for (const p of executeProblems(fs.readFileSync(f, 'utf8'))) check(false, `${path.relative(ROOT, f)}: ${p}`)
}

console.log(`\n${scanned} files scanned`)
console.log(failures === 0 ? '✅ ALL CHECKS PASSED' : `${failures} failure(s)`)
process.exit(failures === 0 ? 0 : 1)
