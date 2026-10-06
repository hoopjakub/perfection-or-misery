# Moderation: how it works and how to change it

*Written 1 October 2026 (P8.5-44, Wave D). For the maintainer: everything you need to add a word, let a name through, or deal with a report, without asking.*

## What it does

Everything is checked **in the database** (`supabase/moderation.sql`), so no app, old or modified, can get round it. Nothing is sent to any other service.

| Where | What happens |
|---|---|
| **Names**: usernames, club names, tags and descriptions, a profile's status, pronouns, about and favourite player | A listed word is **refused**. The player sees one of the refusal lines (English or Slovak, `src/lib/moderation.ts`) |
| **Unsure names**: a "maybe" word, or a group of people next to something hostile ("IslamHater2121") | **Saved**, and flagged for review |
| **Club chat**, when the club keeps clean language on | A listed word is **swapped** for a funny one (kurva → kukurica, "Lafuckda" → "Lafudgeda"). Never refused, no telling-off. Spaced-out words ("f.u.c.k") get through on purpose |
| **Reports**: the quiet button at the foot of a player's or club's page | Saved with the reason, and flagged for review |

Disguises it sees through: any case or accent, digits for vowels (f4ck, sh1t), stretched letters (fuuuck), separators in names (f.u.c.k), words run together (xXfuckXx, BigDick).

## The files

All in `scripts/moderation/`. One word a line; lines starting `#` are notes.

| File | What goes in it |
|---|---|
| `own-en.txt`, `own-sk.txt` | **Your words.** Add here. |
| `allow.txt` | Innocent words or real names that hold a listed word (Scunthorpe, Picasso, Bonera) |
| `exclude.txt` | Words from the downloaded lists you **don't** want (mild insults, real surnames) |
| `identity-hostile.txt` | Groups of people, and hostile words. A name with one of each goes to review |
| `sources/` | The downloaded lists. Don't edit; see `SOURCES.md` for where they come from |

How to write a line in `own-*.txt`:

```
word                 refused in a name, swapped in chat
word = replacement   the same, with your own replacement in chat
!word                also caught INSIDE other words ("Lafuckda")
?word                not sure: a name with it goes to review, chat leaves it alone
```

Use `!` only for words that never sit inside an innocent one. "pica" is not a `!` word, because it's inside "epic arsenal". If a `!` word catches something innocent, add that innocent word to `allow.txt`.

## Changing it

1. Edit the file.
2. Build the word list:
   ```
   npx tsx scripts/build-moderation.ts
   ```
   It prints how many words there are. It also lists any downloaded word it moved to review because it would refuse a real footballer or club (Dago, Haji, Pollock…).
3. Check it:
   ```
   npx tsx scripts/verify-moderation.ts
   ```
   It must end in `✅ ALL CHECKS PASSED`. It also runs real club and player names through the check and prints any it would refuse. Add `NAMES=all` in front to check all 22,767 players instead of every eighth.
4. In the Supabase SQL editor, run `supabase/moderation-words.sql`.

You only re-run `moderation.sql` itself when that file changes.

## Common jobs

| You want to | Do this |
|---|---|
| Block a new word | Add it to `own-en.txt` or `own-sk.txt`, then steps 2 to 4 |
| Let a real name through that gets refused | Add it, lower case and joined up, to `allow.txt` ("Neil Pace Cocks" → `pacecocks` or `cocks`; the shortest that holds the word), then steps 2 to 4 |
| Stop a downloaded word from counting | Add it to `exclude.txt`, then steps 2 to 4 |
| Make a word only flag, not refuse | Write it as `?word` in `own-*.txt` |

## Reports and the review list

The inbox belongs on the website (`docs/website/02-COMMUNITY-AND-QUESTIONS.md` §5a). Until the site exists, use the SQL editor:

```sql
select * from mod_inbox();                 -- what's open, most-reported first
select mod_act(42, 'dismiss');             -- let it be
select mod_act(42, 'rename');              -- take the name: they're asked for a new one
select mod_act(42, 'ban');                 -- ban the player: no runs, chat, clubs or reports
select mod_act(42, 'close');               -- close a reported club
```

(42 is the `id` from the inbox.) No app account can call these two; only the editor can, and later the website's admin.

To lift a ban: `update profiles set banned_at = null where username = '…';`

## Where the code is

- `supabase/moderation.sql`: the checks, triggers, reports, flags, bans
- `supabase/moderation-words.sql`: generated, don't edit by hand
- `scripts/build-moderation.ts`: turns the lists into that file
- `scripts/verify-moderation.ts`: runs all of it in a real Postgres (PGlite)
- `src/lib/moderation.ts`: the refusal lines and reports, in the app
- `app/report.tsx`, `app/rename.tsx`: the report screen, and the new-name screen after a name is taken
