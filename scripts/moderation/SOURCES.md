# Moderation word lists: where they come from

P8.5-44, 1 October 2026. `scripts/build-moderation.ts` turns these into
`supabase/moderation-words.sql`; `scripts/verify-moderation.ts` checks the result
in a real Postgres (PGlite), including every real club and player name in the
bundled DB.

| File | What | Licence |
|---|---|---|
| `sources/ldnoobw-en.txt`, `sources/ldnoobw-cs.txt` | *List of Dirty, Naughty, Obscene, and Otherwise Bad Words*, English and Czech (Czech covers most Slovak swearing), from github.com/LDNOOBW/List-of-Dirty-Naughty-Obscene-and-Otherwise-Bad-Words | CC BY 4.0. Attribution: Shutterstock and the list's contributors |
| `sources/cuss-en.js` | `cuss` by Titus Wormer (github.com/words/cuss): English profanity, each word rated 0–2 for how sure it is. Only the 2s are used | MIT |
| `own-en.txt`, `own-sk.txt` | Ours: swearing with the funny chat replacements, slurs and words with an awful meaning, Slovak written by hand | ours |
| `identity-hostile.txt` | Ours: groups of people, and hostile words; a name holding both goes to review | ours |
| `allow.txt` | Ours: innocent words that hold a listed one (Scunthorpe, Picasso), and real footballers' names | ours |
| `exclude.txt` | Ours: words in the downloaded lists the filter isn't for (mild insults, everyday words, real names) | ours |

Tried and dropped: **HurtLex** (its Slovak list is machine-translated and lists
"ľudia", "dievča", "auto"; licence CC BY-NC-SA, which a public app can't meet).

Nothing is sent anywhere to be checked: the lists live in the database and the
checks run there (the maintainer's call, 1 October 2026: local only).

Kept up to date by hand. When a real name gets caught, add it to `allow.txt`;
when a word gets through, add it to `own-*.txt`. Then:

```
npx tsx scripts/build-moderation.ts
npx tsx scripts/verify-moderation.ts
```

and run `supabase/moderation-words.sql` in the Supabase SQL editor.
