-- Phase 10 · readings for docs/website/10-AUDIT-ADDENDUM.md §2 and §4.
-- READ ONLY: it changes nothing. Run it in the Supabase SQL editor, then copy
-- the one cell it returns (a JSON document) and paste it back.
--
-- It returns no secrets: no passwords, no keys, no tokens, no question text,
-- no usernames. Counts, names of tables, policies, functions and settings.

select jsonb_pretty(jsonb_build_object(

  -- Postgres itself
  'postgres', (select version()),

  -- 10 §4: unaccent and pg_trgm (search), pgcrypto, pg_cron: available / installed
  'extensions', (select jsonb_agg(jsonb_build_object('name', name, 'installed', installed_version, 'available', default_version) order by name)
                 from pg_available_extensions where name in ('unaccent', 'pg_trgm', 'pgcrypto', 'pg_cron', 'pg_net')),

  -- 02 §7: the text-search configurations this project has
  'ts_configs', (select jsonb_agg(cfgname order by cfgname) from pg_ts_config),

  -- 10 §2.1: row-level security on every table in public
  'rls', (select jsonb_agg(jsonb_build_object('table', relname, 'rls', relrowsecurity, 'forced', relforcerowsecurity) order by relname)
          from pg_class where relnamespace = 'public'::regnamespace and relkind = 'r'),

  -- 10 §2.2: every policy, read in full
  'policies', (select jsonb_agg(jsonb_build_object('table', tablename, 'policy', policyname, 'cmd', cmd, 'roles', roles,
                                                   'permissive', permissive, 'using', qual, 'check', with_check) order by tablename, policyname)
               from pg_policies where schemaname = 'public'),

  -- 10 §2.3: functions in public, definer or not, fixed search_path, who may run them
  'functions', (select jsonb_agg(jsonb_build_object('fn', p.proname, 'args', pg_get_function_identity_arguments(p.oid),
                                                    'definer', p.prosecdef, 'config', p.proconfig,
                                                    'anon', has_function_privilege('anon', p.oid, 'execute'),
                                                    'authenticated', has_function_privilege('authenticated', p.oid, 'execute')) order by p.proname)
                from pg_proc p where p.pronamespace = 'public'::regnamespace and p.prokind = 'f'),

  -- 08 §2: triggers today (the counters will add two)
  'triggers', (select jsonb_agg(jsonb_build_object('table', event_object_table, 'trigger', trigger_name, 'when', action_timing, 'event', event_manipulation) order by event_object_table, trigger_name)
               from information_schema.triggers where event_object_schema = 'public'),

  -- 10 §2.7: every foreign key to profiles or auth.users, and what it does on delete
  'fks_to_users', (select jsonb_agg(jsonb_build_object('table', c.conrelid::regclass::text, 'fk', c.conname, 'to', c.confrelid::regclass::text,
                                                       'on_delete', case c.confdeltype when 'c' then 'cascade' when 'n' then 'set null' when 'r' then 'restrict' when 'a' then 'no action' else c.confdeltype::text end) order by 1)
                   from pg_constraint c where c.contype = 'f' and c.confrelid in ('public.profiles'::regclass, 'auth.users'::regclass)),

  -- 08 §2 / 07 F16: the profile columns the site's rules read
  'profile_columns', (select jsonb_agg(column_name order by column_name) from information_schema.columns
                      where table_schema = 'public' and table_name = 'profiles' and column_name in ('is_guest', 'banned_at', 'must_rename', 'username')),

  -- 08 §2: the counters' starting values and the users threshold
  'counts', jsonb_build_object(
    'runs', (select count(*) from public.runs),
    'real_accounts', (select count(*) from public.profiles where is_guest = false),
    'guests', (select count(*) from public.profiles where is_guest is not false),
    'banned', (select count(*) from public.profiles where banned_at is not null)),

  -- 07 F14: what Realtime publishes today (the counter must not add runs here)
  'realtime_tables', (select jsonb_agg(schemaname || '.' || tablename order by tablename) from pg_publication_tables where pubname = 'supabase_realtime'),

  -- 10 §2.8: what else lives in public, grouped by prefix (the other apps' tables)
  'table_prefixes', (select jsonb_object_agg(prefix, n) from (
                       select split_part(relname, '_', 1) as prefix, count(*) as n
                       from pg_class where relnamespace = 'public'::regnamespace and relkind = 'r' group by 1) t),

  -- 10 §4: second factors enrolled (counts only)
  'mfa_factors', (select jsonb_object_agg(factor_type || ':' || status, n) from (
                    select factor_type::text, status::text, count(*) as n from auth.mfa_factors group by 1, 2) t),

  -- 04 §9.6: storage buckets and their policies
  'buckets', (select jsonb_agg(jsonb_build_object('bucket', id, 'public', public, 'size_limit', file_size_limit, 'types', allowed_mime_types) order by id) from storage.buckets),
  'storage_policies', (select jsonb_agg(jsonb_build_object('policy', policyname, 'cmd', cmd, 'roles', roles, 'using', qual, 'check', with_check) order by policyname)
                       from pg_policies where schemaname = 'storage' and tablename = 'objects')
));
