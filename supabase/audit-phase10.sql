-- Phase 10, step 7 · The database half of the audit (docs/website/10-AUDIT-ADDENDUM.md §2).
-- Read-only: it changes nothing. Run it in the Supabase SQL editor and send
-- back the result. One table comes out, one row per finding:
--   check   the addendum's number (2.1, 2.2, …)
--   item    the table, policy or function
--   verdict 'FAIL: …' is a finding; 'ok: …' rows are the things the check
--           looked at and found right, listed so a silent pass can't hide a
--           check that looked at nothing.
-- Every check here was written against the rule it guards; 2.6 (the limits)
-- is qa-tests.sql, which passed on 10 Oct 2026.

with
-- 2.1 · Row-level security on every table in public.
rls as (
  select '2.1' as "check", c.relname::text as item,
         case when c.relrowsecurity then 'ok: RLS on' else 'FAIL: RLS off' end as verdict
  from pg_class c where c.relnamespace = 'public'::regnamespace and c.relkind = 'r'
),
-- 2.2 · The site's tables have no policy at all: every read and write goes
-- through a function (04 §2.2). Any policy on them is a finding.
pol as (
  select '2.2', p.tablename || ' / ' || p.policyname, 'FAIL: a policy on a site table (' || p.cmd || ' for ' || array_to_string(p.roles, ',') || ')'
  from pg_policies p where p.schemaname = 'public' and (p.tablename like 'qa\_%' or p.tablename like 'site\_%')
  union all
  select '2.2', 'qa_/site_ tables', 'ok: ' || count(*) || ' policies on the site''s tables (0 expected)'
  from pg_policies p where p.schemaname = 'public' and (p.tablename like 'qa\_%' or p.tablename like 'site\_%')
),
-- The site's functions, with what each audience may run.
fns as (
  select p.oid, p.proname::text as name, p.oid::regprocedure::text as sig, p.prosecdef as definer,
         coalesce(array_to_string(p.proconfig, ','), '') as config, pg_get_functiondef(p.oid) as body,
         has_function_privilege('anon', p.oid, 'execute') as anon_x,
         has_function_privilege('authenticated', p.oid, 'execute') as auth_x
  from pg_proc p
  where p.pronamespace = 'public'::regnamespace and (p.proname like 'qa\_%' or p.proname like 'site\_%')
),
-- 2.3 · Definer functions pin their search path; anon runs only the public
-- reads; every admin function starts at the gate (or the admin check).
f23 as (
  select '2.3', sig,
    case
      when definer and config not like '%search_path=%' then 'FAIL: security definer without a fixed search_path'
      when anon_x and name not in ('qa_published', 'qa_published_one', 'qa_search', 'qa_updates_list', 'site_is_admin', 'site_counters')
        then 'FAIL: anon can run it'
      when name like 'qa\_admin\_%' and body !~ '(qa_admin_gate|site_is_admin)\(' then 'FAIL: an admin function that never checks the admin'
      when name in ('qa_clean', 'qa_member', 'qa_events_since', 'qa_len_ok', 'qa_notify', 'qa_admin_gate', 'qa_log_is_append_only') and (anon_x or auth_x)
        then 'FAIL: a helper a client can call'
      else 'ok: ' || case when definer then 'definer, ' || config else 'invoker' end
        || case when anon_x then ', anon' when auth_x then ', signed in' else ', closed' end
    end
  from fns
),
-- 2.4 · The admin check reads the second factor and the admin row.
f24 as (
  select '2.4', sig,
    case when body ~ 'aal.*aal2' and body ~ 'site_admins' then 'ok: needs aal2 and the admin row'
         else 'FAIL: site_is_admin() doesn''t require both the second factor and the row' end
  from fns where name = 'site_is_admin'
),
-- 2.5 · Who's asking comes from the token: no player or admin function takes
-- a user id as a parameter.
f25 as (
  select '2.5', sig,
    case when pg_get_function_arguments(oid) ~* '\m(p_)?(user|user_id|who|owner|asker|player)\M'
         then 'FAIL: takes a person as a parameter' else 'ok: the caller is auth.uid()' end
  from fns where name not in ('qa_events_since', 'qa_notify')   -- closed helpers, called with auth.uid() by the functions above
),
-- 2.7 · Deleting an account takes its community rows with it: every user
-- column on a site table references profiles/auth.users and cascades (the
-- updates' author is set null on purpose: an update outlives the admin).
f27 as (
  select '2.7', t.relname || '.' || a.attname,
    case
      when con.oid is null then 'FAIL: a person column with no foreign key (rows outlive the account)'
      when t.relname = 'qa_updates' and a.attname = 'author_id' and con.confdeltype = 'n' then 'ok: set null on purpose (03 §6)'
      -- The admin log keeps the id with no key, on purpose: it's append-only
      -- (its trigger refuses every update, so "on delete set null" would make
      -- the admin's account undeletable), and a trail that vanished with the
      -- account wouldn't be one. An id, no text about anyone (10 Oct 2026).
      when t.relname = 'qa_admin_log' and a.attname = 'admin_id' and con.oid is null then 'ok: kept on purpose (append-only trail)'
      when con.confdeltype = 'c' then 'ok: cascades to ' || con.confrelid::regclass::text
      else 'FAIL: references ' || con.confrelid::regclass::text || ' without on delete cascade'
    end
  from pg_class t
  join pg_attribute a on a.attrelid = t.oid and a.attnum > 0 and not a.attisdropped
  left join pg_constraint con on con.conrelid = t.oid and con.contype = 'f' and a.attnum = any(con.conkey)
  where t.relnamespace = 'public'::regnamespace and t.relkind = 'r'
    and (t.relname like 'qa\_%' or t.relname like 'site\_%')
    and a.attname in ('user_id', 'author_id', 'admin_id')
),
-- 2.8 · The shared project: nothing of the site's reaches The Gaffer's or
-- Become a Legend's tables.
f28 as (
  select '2.8', sig, 'FAIL: mentions another game''s tables' from fns where body ~ '\m(gaf|bal)_'
  union all
  select '2.8', 'qa_/site_ functions', 'ok: ' || count(*) || ' read, none mention gaf_ or bal_' from fns where body !~ '\m(gaf|bal)_'
),
-- 2.10 · The counters expose only counts: the table is closed to clients,
-- the function is the way in.
f210 as (
  select '2.10', 'site_counters (table)',
    case when exists (select 1 from pg_class where relname = 'site_counters' and relnamespace = 'public'::regnamespace)
         then case when has_table_privilege('anon', 'public.site_counters', 'select') or has_table_privilege('authenticated', 'public.site_counters', 'select')
                   then 'FAIL: a client can read the table directly' else 'ok: closed to clients' end
         else 'FAIL: the table is missing (site-counters.sql not run?)' end
),
-- The admin row: exactly one, and it isn't a guest.
admin as (
  select 'admin', coalesce(p.username, '(no profile)'),
    case when (select count(*) from site_admins) <> 1 then 'FAIL: ' || (select count(*) from site_admins) || ' admin rows (1 expected)'
         when coalesce(p.is_guest, true) then 'FAIL: the admin account is a guest'
         else 'ok: one admin, a real account' end
  from site_admins a left join profiles p on p.id = a.user_id
  union all
  select 'admin', '(none)', 'FAIL: no admin row' where not exists (select 1 from site_admins)
)
select * from (
  select * from rls union all select * from pol union all select * from f23 union all select * from f24
  union all select * from f25 union all select * from f27 union all select * from f28 union all select * from f210
  union all select * from admin
) findings
order by (verdict like 'FAIL%') desc, "check", item;
