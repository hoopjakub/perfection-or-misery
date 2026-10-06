// P8.5-44 · Runs supabase/moderation.sql and the generated word list in a real
// Postgres (PGlite, in-process) against stand-ins for the app's tables, then
// checks what the filter must and mustn't catch.
//
//   npx tsx scripts/verify-moderation.ts            (NAMES=all to check every player)
//
// Besides the cases below, every real club and player name in the bundled
// DB goes through the name check: football is full of names a crude filter
// trips on (Dickson, Cocu, Kuntz), so how many it would refuse is measured,
// and each one printed so it can join allow.txt.
import fs from 'fs'
import path from 'path'
import Database from 'better-sqlite3'
import { PGlite } from '@electric-sql/pglite'
import { unaccent } from '@electric-sql/pglite/contrib/unaccent'
import { buildSql } from './build-moderation'

let failures = 0
const check = (cond: boolean, msg: string) => { if (!cond) { failures++; console.log(`❌ ${msg}`) } }

// The parts of the app's schema the moderation touches (clubs.sql,
// clubs-2.sql, profile.sql, the runs table), cut down to the columns used.
const STUBS = `
create schema if not exists extensions;
create schema if not exists auth;
create or replace function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('test.uid', true), '')::uuid $$;
do $$ begin create role anon; exception when duplicate_object then null; end $$;
do $$ begin create role authenticated; exception when duplicate_object then null; end $$;
create table profiles (id uuid primary key, username text, is_guest boolean default false, club_tag text);
create table profile_details (user_id uuid primary key references profiles(id), favourite_player text);
create table profile_looks (user_id uuid primary key references profiles(id), status text, pronouns text, about text);
create table clubs (id uuid primary key default gen_random_uuid(), name text not null, tag text not null, about text, clean_chat boolean not null default true, owner_id uuid);
create table club_members (user_id uuid primary key references profiles(id), club_id uuid references clubs(id) on delete cascade, role text default 'member');
create table club_messages (id bigint generated always as identity primary key, club_id uuid references clubs(id) on delete cascade, user_id uuid references profiles(id), body text not null, cleaned boolean not null default false);
create table runs (id bigint generated always as identity primary key, user_id uuid references profiles(id));
`

async function main() {
  const db = new PGlite({ extensions: { unaccent } })
  const t0 = Date.now()
  await db.exec(STUBS)
  await db.exec(fs.readFileSync(path.join(__dirname, '..', 'supabase', 'moderation.sql'), 'utf8'))
  // clubs-2.sql adds this trigger; moderation.sql only replaces its function.
  await db.exec('create trigger club_messages_clean before insert on club_messages for each row execute function club_clean_message();')
  await db.exec(buildSql())
  console.log(`schema + lists loaded in ${Date.now() - t0} ms`)

  const one = async (sql: string, params: unknown[] = []) => ((await db.query<Record<string, unknown>>(sql, params)).rows[0] ?? {})
  const name = async (s: string) => (await one('select mod_check_name($1) v', [s])).v as string
  const chat = async (s: string) => (await one('select mod_clean_chat($1) v', [s])).v as string

  // ── Names ──────────────────────────────────────────────────────────────────
  const BLOCKED = ['Lafuckda', 'f4ck', 'xXfuckXx', 'FUUUCK', 'f.u.c.k', 'fuck_you_99', 'KurvaMac', 'kokot', 'Kokotko', 'n1gger', 'N I G G E R',
    'pedofil', 'Pedophile', 'Hitler88', 'shithead', 'BigDick', 'dicks', 'MotherFucker', 'cunt', 'Jebat', 'zmrd', 'Píča', 'tr4nny', 'Faggot', 'rapist']
  const OK = ['Scunthorpe', 'Montenegro', 'Picasso', 'Nigeria', 'Niger', 'Niigata', 'EpicArsenalFan', 'Dickens', 'Cocktail', 'Hancock',
    'Therapist', 'Grape', 'Raccoon', 'Tycoon', 'Torpedo', 'Spicy', 'Heilbronn', 'Sussex', 'Essex', 'Penistone', 'Matej', 'Kokos',
    'Martin', 'IslamFan', 'GoalHater', 'Arsenal', 'Shitake', 'Classic', 'Assassin', 'Titanic', 'Wankdorf', 'Cucumber', 'Hello123']
  const REVIEW = ['IslamHater2121', 'JewHunter', 'GasTheJews', 'KillerKing', 'zabijak']
  for (const s of BLOCKED) { const v = await name(s); check(v === 'blocked', `name "${s}" should be refused, got ${v}`) }
  for (const s of OK) { const v = await name(s); check(v === 'ok', `name "${s}" should pass, got ${v}`) }
  for (const s of REVIEW) { const v = await name(s); check(v !== 'ok', `name "${s}" should at least go to review, got ${v}`) }

  // ── Chat ───────────────────────────────────────────────────────────────────
  const CHAT: [string, string][] = [
    ['Lafuckda', 'Lafudgeda'],
    ['what the fuck', 'what the fudge'],
    ['f4ck this', 'fudge this'],
    ['FUUUCK', 'fudge'],
    ['ty kurva', 'ty kukurica'],
    ['to je kokotina', 'to je kokosovina'],
    ['motherfucker', 'mother hubbard'],
    ['Scunthorpe won 2-0', 'Scunthorpe won 2-0'],
    ['a cocktail in Penistone', 'a cocktail in Penistone'],
    ['Montenegro vs Nigeria', 'Montenegro vs Nigeria'],
    ['epic arsenal and picasso', 'epic arsenal and picasso'],
    ['f.u.c.k', 'f.u.c.k'], // written around it on purpose: allowed (see build-moderation.ts)
    ['good game lads', 'good game lads'],
  ]
  for (const [i, o] of CHAT) { const v = await chat(i); check(v === o, `chat "${i}" → "${v}", expected "${o}"`) }

  // ── Where it runs ──────────────────────────────────────────────────────────
  const A = '00000000-0000-0000-0000-00000000000a', B = '00000000-0000-0000-0000-00000000000b'
  const fails = async (sql: string, params: unknown[] = []) => { try { await db.query(sql, params); return '' } catch (e) { return String((e as Error).message) } }
  check((await fails(`insert into profiles (id, username) values ('${A}', 'fuckface')`)).includes('BAD_WORD'), 'a username with a swear is refused')
  check((await fails(`insert into profiles (id, username) values ('${A}', 'IslamHater2121')`)) === '', 'an unsure username is let through')
  check(Number((await one(`select count(*) n from mod_flags where target_type = 'player' and target_id = '${A}' and source = 'auto'`)).n) === 1, '…and flagged for review')
  await db.query(`insert into profiles (id, username) values ('${B}', 'Reporter')`)
  check((await fails(`insert into profile_looks (user_id, about) values ('${B}', 'I love kokot')`)).includes('BAD_WORD'), 'a profile about with a swear is refused')
  check((await fails(`insert into profile_details (user_id, favourite_player) values ('${B}', 'Jamie Vardy')`)) === '', 'a real footballer as a favourite passes')
  check((await fails(`update profile_details set favourite_player = 'B1tch' where user_id = '${B}'`)).includes('BAD_WORD'), 'a favourite player with a swear is refused')
  check((await fails(`insert into clubs (name, tag) values ('Shit FC', 'SFC')`)).includes('BAD_WORD'), 'a club name with a swear is refused')
  check((await fails(`insert into clubs (name, tag) values ('Fine FC', 'FFC')`)) === '', 'a clean club name passes')
  const club = (await one(`select id from clubs where tag = 'FFC'`)).id as string
  await db.query(`insert into club_members (user_id, club_id) values ('${A}', $1), ('${B}', $1)`, [club])
  await db.query(`insert into club_messages (club_id, user_id, body) values ($1, '${B}', 'what the fuck')`, [club])
  const msg = await one('select body, cleaned from club_messages order by id desc limit 1')
  check(msg.body === 'what the fudge' && msg.cleaned === true, `a chat line is swapped and marked (${msg.body})`)
  await db.query('update clubs set clean_chat = false where id = $1', [club])
  await db.query(`insert into club_messages (club_id, user_id, body) values ($1, '${B}', 'what the fuck')`, [club])
  check((await one('select body from club_messages order by id desc limit 1')).body === 'what the fuck', 'clean language off leaves chat alone')

  // Reports and the inbox.
  await db.query(`select set_config('test.uid', '${B}', false)`)
  await db.query(`select report('player', '${A}', 'hate', 'look at the name')`)
  await db.query(`select report('player', '${A}', 'hate', 'again')`) // a second report by the same player is ignored
  check(Number((await one(`select reports from mod_flags where target_id = '${A}' and status = 'open'`)).reports) === 1, 'one report each, joined to the open flag')
  check((await fails(`select report('player', '${B}', 'name', null)`)).includes('NOT_ALLOWED'), "you can't report yourself")
  // The inbox and its actions are the SQL editor's (and later the website's
  // admin's); PGlite runs as the database owner, like the editor does.
  const inbox = (await db.query<{ id: number; target_id: string; details: string[] }>('select * from mod_inbox()')).rows
  check(inbox.length === 1 && inbox[0].target_id === A && inbox[0].details[0] === 'hate: look at the name', 'the inbox shows the entry with its report')
  await db.query('select mod_act($1, $2)', [inbox[0].id, 'ban'])
  const banned = await one(`select banned_at, username from profiles where id = '${A}'`)
  check(banned.banned_at != null && /^player-[0-9a-f]{6}$/.test(String(banned.username)), 'a ban marks the player and takes the name away')
  check(Number((await one(`select count(*) n from club_members where user_id = '${A}'`)).n) === 0, '…and takes them out of their club')
  check((await fails(`insert into runs (user_id) values ('${A}')`)).includes('BANNED'), 'a banned player saves no runs')
  check((await fails(`insert into club_messages (club_id, user_id, body) values ($1, '${A}', 'hi')`, [club])).includes('BANNED'), '…and writes no chat')
  await db.query(`select set_config('test.uid', '${A}', false)`)
  check((await fails(`select report('club', $1, 'name', null)`, [club])).includes('BANNED'), '…and files no reports')

  // ── Real football names ────────────────────────────────────────────────────
  const lite = new Database(path.join(__dirname, '..', 'assets', 'db', 'players_v5.db'), { readonly: true })
  const clubs = (lite.prepare('select distinct name from clubs').all() as { name: string }[]).map(r => r.name)
  const every = process.env.NAMES === 'all' ? 1 : 8
  const players = (lite.prepare('select distinct name from players order by id').all() as { name: string }[]).map(r => r.name).filter((_, i) => i % every === 0)
  const t1 = Date.now()
  for (const [label, list] of [['clubs', clubs], ['players', players]] as const) {
    const rows = (await db.query<{ n: string; v: string }>('select n, mod_check_name(n) v from unnest($1::text[]) n', [list])).rows
    const bad = rows.filter(r => r.v === 'blocked')
    const unsure = rows.filter(r => r.v === 'review')
    console.log(`${label}: ${list.length} names, ${bad.length} refused, ${unsure.length} to review`)
    if (bad.length) console.log(`  refused: ${bad.map(r => r.n).join(', ')}`)
    if (unsure.length) console.log(`  review: ${unsure.slice(0, 40).map(r => r.n).join(', ')}`)
    // A real footballer or club should practically never be refused.
    check(bad.length <= Math.ceil(list.length * 0.001), `${label}: ${bad.length} real names refused (allowed 0.1%)`)
  }
  console.log(`real names checked in ${Date.now() - t1} ms`)

  console.log(failures === 0 ? '✅ ALL CHECKS PASSED' : `${failures} check(s) failed`)
  process.exit(failures === 0 ? 0 : 1)
}
main().catch(e => { console.error(e); process.exit(1) })
