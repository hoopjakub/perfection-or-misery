-- Phase 10, step 3 · Every rule of supabase/qa.sql, played (04 §11 step 3,
-- 10-AUDIT-ADDENDUM §2.4–2.6, §3.1). Run in the Supabase SQL editor after qa.sql.
--
-- It changes nothing, on purpose and by construction: it's one DO block, and
-- it ENDS BY RAISING AN ERROR, which undoes everything it did (the throwaway
-- accounts, questions, notices, settings). So:
--   "ALL QA TESTS PASSED (this error undoes the test data)"  → every rule holds
--   "TEST FAILED: …"                                         → that rule doesn't
--   anything else                                             → read it; it's the rule that broke
--
-- It plays four people: a guest, two players with a saved run (A, B, and D for
-- the breaker), and the admin (C), switching who's asking the way PostgREST
-- does (the role, and the token's claims). A run for each comes from copying
-- an existing run's columns, so it needs at least one run in the table.

do $$
declare
  g uuid := gen_random_uuid();   -- a guest
  a uuid := gen_random_uuid();   -- a player
  b uuid := gen_random_uuid();   -- another player
  c uuid := gen_random_uuid();   -- the admin
  d uuid := gen_random_uuid();   -- a player for the breaker
  n uuid := gen_random_uuid();   -- a member with no saved run
  qa_ uuid; qb uuid; qd uuid; cnt int; st text; cols text; exprs text; u uuid;
begin
  -- ── Fixtures, as the project owner ────────────────────────────────────────
  if not exists (select 1 from runs) then raise exception 'TEST SETUP: needs at least one run in public.runs to copy'; end if;
  foreach u in array array[g, a, b, c, d, n] loop
    insert into auth.users (instance_id, id, aud, role, email, encrypted_password, created_at, updated_at, raw_app_meta_data, raw_user_meta_data, is_anonymous)
    values ('00000000-0000-0000-0000-000000000000', u, 'authenticated', 'authenticated', 'qt' || substr(replace(u::text, '-', ''), 1, 12) || '@pom.internal', '',
            now(), now(), '{}', '{}', u = g);
    insert into profiles (id, username, is_guest) values (u, 'qatest' || substr(replace(u::text, '-', ''), 1, 10), u = g)
    on conflict (id) do update set username = excluded.username, is_guest = excluded.is_guest;
  end loop;
  -- A saved run each for A, B, C, D (not G, not N): a copy of any run's columns.
  select string_agg(quote_ident(column_name), ', ' order by ordinal_position),
         string_agg(case when column_name = 'user_id' then '$1'
                         when column_name = 'id' and data_type = 'uuid' then 'gen_random_uuid()'
                         when column_name = 'client_id' then case when data_type = 'uuid' then 'gen_random_uuid()' else 'gen_random_uuid()::text' end
                         else quote_ident(column_name) end, ', ' order by ordinal_position)
    into cols, exprs
  from information_schema.columns
  where table_schema = 'public' and table_name = 'runs' and is_generated = 'NEVER'
    and not (column_name = 'id' and (is_identity = 'YES' or coalesce(column_default, '') like 'nextval%'));
  foreach u in array array[a, b, c, d] loop
    execute format('insert into runs (%s) select %s from runs limit 1', cols, exprs) using u;
  end loop;
  insert into site_admins (user_id) values (c) on conflict do nothing;
  -- If the project already has its real admin, the one-row rule refuses C:
  -- then C plays the admin by being that row's user for this test.
  if not exists (select 1 from site_admins where user_id = c) then
    update site_admins set user_id = c;
  end if;

  -- ── T1 · A guest can't ask ────────────────────────────────────────────────
  perform set_config('request.jwt.claims', json_build_object('sub', g, 'role', 'authenticated', 'is_anonymous', true)::text, true);
  set local role authenticated;
  begin perform qa_ask('a question from a guest, long enough', false); raise exception 'TEST FAILED: T1 a guest asked';
  exception when others then if sqlerrm not like 'NOT_MEMBER%' then raise; end if; end;
  if qa_can_ask()->>'state' <> 'NOT_MEMBER' then raise exception 'TEST FAILED: T1 qa_can_ask didn''t say NOT_MEMBER'; end if;
  reset role;

  -- ── T2 · A member with no saved run can't ask ─────────────────────────────
  perform set_config('request.jwt.claims', json_build_object('sub', n, 'role', 'authenticated', 'is_anonymous', false)::text, true);
  set local role authenticated;
  begin perform qa_ask('a question with no run behind it', false); raise exception 'TEST FAILED: T2 a member with no run asked';
  exception when others then if sqlerrm not like 'NO_RUN%' then raise; end if; end;
  if qa_can_ask()->>'state' <> 'NO_RUN' then raise exception 'TEST FAILED: T2 qa_can_ask didn''t say NO_RUN'; end if;
  reset role;

  -- ── T3 · One active question; length limits ───────────────────────────────
  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated', 'is_anonymous', false, 'aal', 'aal1')::text, true);
  set local role authenticated;
  begin perform qa_ask('short', false); raise exception 'TEST FAILED: T3 a five-letter question was accepted';
  exception when others then if sqlerrm not like 'TOO_SHORT%' then raise; end if; end;
  qa_ := qa_ask(E'How do I keep my runs?\u200B', false);   -- private; the zero-width space is cleaned out
  begin perform qa_ask('a second question while one is active', false); raise exception 'TEST FAILED: T3 a second active question was accepted';
  exception when others then if sqlerrm not like 'ACTIVE_QUESTION%' then raise; end if; end;
  if qa_can_ask()->>'state' <> 'ACTIVE_QUESTION' or (qa_can_ask()->>'activeId')::uuid <> qa_ then
    raise exception 'TEST FAILED: T3 qa_can_ask didn''t name the active question'; end if;
  if exists (select 1 from qa_published_one(qa_)) then raise exception 'TEST FAILED: T3 an unanswered question has a public page'; end if;

  -- ── T4 · Editing: once, then the cooldown ─────────────────────────────────
  perform qa_edit(qa_, 'How do I keep my runs, really?');
  begin perform qa_edit(qa_, 'An edit inside the cooldown'); raise exception 'TEST FAILED: T4 an edit inside the cooldown was accepted';
  exception when others then if sqlerrm not like 'EDIT_COOLDOWN%' then raise; end if; end;
  reset role;
  if (select body from qa_questions where id = qa_) <> 'How do I keep my runs, really?' then raise exception 'TEST FAILED: T4 the edit didn''t land'; end if;

  -- ── T5 · B can't touch A's question ───────────────────────────────────────
  perform set_config('request.jwt.claims', json_build_object('sub', b, 'role', 'authenticated', 'is_anonymous', false, 'aal', 'aal1')::text, true);
  set local role authenticated;
  begin perform qa_edit(qa_, 'B rewriting A''s question'); raise exception 'TEST FAILED: T5 B edited A''s question';
  exception when others then if sqlerrm not like 'NOT_YOURS%' then raise; end if; end;
  begin perform qa_withdraw(qa_); raise exception 'TEST FAILED: T5 B withdrew A''s question';
  exception when others then if sqlerrm not like 'NOT_EDITABLE%' then raise; end if; end;
  begin perform qa_open_mine(qa_); raise exception 'TEST FAILED: T5 B opened A''s question';
  exception when others then if sqlerrm not like 'NOT_FOUND%' then raise; end if; end;
  begin perform qa_reply(qa_, 'B writing into A''s conversation'); raise exception 'TEST FAILED: T5 B replied on A''s question';
  exception when others then if sqlerrm not like 'NOT_YOURS%' then raise; end if; end;
  select count(*) into cnt from qa_mine() m where m.id = qa_;
  if cnt <> 0 then raise exception 'TEST FAILED: T5 A''s question is in B''s list'; end if;
  select count(*) into cnt from qa_published() p where p.id = qa_;
  if cnt <> 0 then raise exception 'TEST FAILED: T5 an unanswered private question is published'; end if;

  -- ── T6 · B isn't the admin; neither is C without the second factor ────────
  begin perform qa_admin_inbox(); raise exception 'TEST FAILED: T6 a player read the inbox';
  exception when others then if sqlerrm not like 'NOT_ADMIN%' then raise; end if; end;
  if site_is_admin_account() then raise exception 'TEST FAILED: T6 a player''s account reads as the admin''s'; end if;
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', c, 'role', 'authenticated', 'is_anonymous', false, 'aal', 'aal1')::text, true);
  set local role authenticated;
  begin perform qa_admin_inbox(); raise exception 'TEST FAILED: T6 the admin without the second factor read the inbox';
  exception when others then if sqlerrm not like 'NOT_ADMIN%' then raise; end if; end;
  if site_is_admin() then raise exception 'TEST FAILED: T6 site_is_admin() is true at aal1'; end if;
  if not site_is_admin_account() then raise exception 'TEST FAILED: T6 the admin''s account doesn''t read as the admin''s'; end if;
  reset role;

  -- ── T7 · The admin at the second factor: inbox, open (seen), answer, notice ──
  perform set_config('request.jwt.claims', json_build_object('sub', c, 'role', 'authenticated', 'is_anonymous', false, 'aal', 'aal2')::text, true);
  set local role authenticated;
  select count(*) into cnt from qa_admin_inbox() i where i.id = qa_;
  if cnt <> 1 then raise exception 'TEST FAILED: T7 A''s question isn''t in the inbox'; end if;
  perform qa_admin_open(qa_);
  reset role;
  if (select status from qa_questions where id = qa_) <> 'seen' then raise exception 'TEST FAILED: T7 opening didn''t mark it seen'; end if;
  set local role authenticated;
  perform qa_admin_decide(qa_, 'answered', 'Make an account: guests'' runs are not kept.');
  reset role;
  select status into st from qa_questions where id = qa_;
  if st <> 'answered' then raise exception 'TEST FAILED: T7 the answer didn''t land (%)', st; end if;
  if not exists (select 1 from notifications where user_id = a and type = 'qa') then raise exception 'TEST FAILED: T7 A got no notice'; end if;
  if (select count(*) from qa_admin_log where admin_id = c) < 3 then raise exception 'TEST FAILED: T7 the admin''s actions weren''t logged'; end if;

  -- ── T8 · A private answered question is never published ──────────────────
  set local role anon;
  select count(*) into cnt from qa_published() p where p.id = qa_;
  if cnt <> 0 then raise exception 'TEST FAILED: T8 a private question was published'; end if;
  reset role;

  -- ── T9 · The cooldown after a close ───────────────────────────────────────
  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated', 'is_anonymous', false)::text, true);
  set local role authenticated;
  begin perform qa_ask('asking again straight after the answer', false); raise exception 'TEST FAILED: T9 asked inside the cooldown';
  exception when others then if sqlerrm not like 'COOLDOWN%' then raise; end if; end;
  reset role;

  -- ── T10 · A public question: published once answered, gone when made private ──
  perform set_config('request.jwt.claims', json_build_object('sub', b, 'role', 'authenticated', 'is_anonymous', false)::text, true);
  set local role authenticated;
  qb := qa_ask('Will there be an iPhone app one day?', true);
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', c, 'role', 'authenticated', 'is_anonymous', false, 'aal', 'aal2')::text, true);
  set local role authenticated;
  perform qa_admin_decide(qb, 'answered', 'Not planned; the browser version works on an iPhone.');
  reset role;
  set local role anon;
  select count(*) into cnt from qa_published() p where p.id = qb;
  if cnt <> 1 then raise exception 'TEST FAILED: T10 an answered public question isn''t published'; end if;
  select count(*) into cnt from qa_search('iphone app') s where s.id = qb;
  if cnt <> 1 then raise exception 'TEST FAILED: T10 search didn''t find it'; end if;
  if not exists (select 1 from qa_published_one(qb)) then raise exception 'TEST FAILED: T10 the published question has no page'; end if;
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', c, 'role', 'authenticated', 'is_anonymous', false, 'aal', 'aal2')::text, true);
  set local role authenticated;
  perform qa_admin_set_private(qb, true);
  reset role;
  set local role anon;
  select count(*) into cnt from qa_published() p where p.id = qb;
  if cnt <> 0 then raise exception 'TEST FAILED: T10 a question made private is still published'; end if;
  reset role;

  -- ── T11 · A banned player can't ask ───────────────────────────────────────
  update profiles set banned_at = now() where id = b;
  update qa_settings set cooldown_after_close = '0 seconds';
  perform set_config('request.jwt.claims', json_build_object('sub', b, 'role', 'authenticated', 'is_anonymous', false)::text, true);
  set local role authenticated;
  begin perform qa_ask('a question from a banned account', false); raise exception 'TEST FAILED: T11 a banned player asked';
  exception when others then if sqlerrm not like 'BANNED%' then raise; end if; end;
  reset role;

  -- ── T12 · The day's cap, and the site's breaker ───────────────────────────
  update qa_settings set daily_questions = 1;
  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated', 'is_anonymous', false)::text, true);
  set local role authenticated;
  begin perform qa_ask('my second question today, over the cap', false); raise exception 'TEST FAILED: T12 asked over the day''s cap';
  exception when others then if sqlerrm not like 'DAILY_LIMIT%' then raise; end if; end;
  reset role;
  update qa_settings set daily_questions = 3, global_daily_questions = (select count(*) from qa_events where kind = 'ask' and at > now() - interval '1 day');
  perform set_config('request.jwt.claims', json_build_object('sub', d, 'role', 'authenticated', 'is_anonymous', false)::text, true);
  set local role authenticated;
  begin perform qa_ask('a question when the site has had enough today', false); raise exception 'TEST FAILED: T12 the breaker let a question through';
  exception when others then if sqlerrm not like 'SITE_BUSY%' then raise; end if; end;
  reset role;

  -- ── T13 · Withdraw (H11) ──────────────────────────────────────────────────
  update qa_settings set global_daily_questions = 100;
  set local role authenticated;
  qd := qa_ask('a question to take back again', false);
  perform qa_withdraw(qd);
  reset role;
  if exists (select 1 from qa_questions where id = qd) then raise exception 'TEST FAILED: T13 the withdrawn question is still there'; end if;

  -- ── T14 · Who may call what ───────────────────────────────────────────────
  set local role anon;
  begin perform qa_ask('anon calling a player function', false); raise exception 'TEST FAILED: T14 anon could call qa_ask';
  exception when insufficient_privilege then null; end;
  reset role;
  set local role authenticated;
  begin perform qa_admin_gate('x', 'y'); raise exception 'TEST FAILED: T14 a client could call the admin gate';
  exception when insufficient_privilege then null; end;
  begin perform count(*) from qa_questions; raise exception 'TEST FAILED: T14 a client read qa_questions directly';
  exception when insufficient_privilege then null; end;
  begin insert into qa_updates (title, body) values ('x', 'y'); raise exception 'TEST FAILED: T14 a client wrote qa_updates directly';
  exception when insufficient_privilege then null; end;
  reset role;

  -- ── T15 · The admin log is append-only, even for the owner ───────────────
  begin update qa_admin_log set action = 'rewritten'; raise exception 'TEST FAILED: T15 the admin log was rewritten';
  exception when others then if sqlerrm not like '%append-only%' then raise; end if; end;

  -- ── T16 · Cleaning ────────────────────────────────────────────────────────
  if qa_clean(E'a\u200Bb\u202Ec') <> 'abc' then raise exception 'TEST FAILED: T16 qa_clean left an invisible character'; end if;
  if (select body from qa_questions where id = qa_) like E'%\u200B%' then raise exception 'TEST FAILED: T16 a stored question kept a zero-width space'; end if;

  raise exception 'ALL QA TESTS PASSED (this error undoes the test data)';
end $$;
