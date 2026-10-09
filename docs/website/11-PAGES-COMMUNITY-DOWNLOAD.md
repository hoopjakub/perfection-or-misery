# 11 · The other pages, shaped

> Part of the [website set](00-README.md). Status: **shape, 9 October 2026**, the same session and world as [09](09-LANDING-SHAPE.md). The rules for the community are in [02](02-COMMUNITY-AND-QUESTIONS.md); this is how its pages look and behave, with sign-in, download and the 404. Mode: **Operate** for the community and sign-in (a task to finish), **Read** for updates and the Q&A.

---

## 1. Shared shell

Every page other than the poster: the top bar (logo home, `EN · SK`), a reading column capped at 720 px, the footer of [09](09-LANDING-SHAPE.md) §3.9. Same grounds (follow the setting), same tokens. No navigation bar; the community has its own two tabs.

## 2. Sign in (H21, H14)

```
┌──────────────────────────────────────┐
│ SIGN IN                              │
│ The same username and password as    │
│ the game.                            │
│ USERNAME  [__________________]       │
│ PASSWORD  [______________] SHOW      │  visibility toggle (vibecode FRM-8)
│ ┌•────────────────────────────────•┐ │
│ │  SIGN IN                         │ │
│ └•────────────────────────────────•┘ │
│ No account? MAKE ONE IN THE GAME  →  │  opens the game's sign-up, then back
│ Passwords can't be recovered.        │  one line, as in the app
└──────────────────────────────────────┘
```

- **Sign-in only** (08 H21). The username becomes the internal address through the module shared with the app (08 H14).
- **States:** default · wrong name or password (one message, not which one) · too many tries (Supabase's 30 per 5 minutes: *Too many tries. Wait a few minutes.*) · a guest session already open in this browser (none: the site never makes guests) · banned (*This account can't sign in to the community.*) · offline.
- Signed in, the top bar shows the username as a tag, and *Sign out*.

## 3. `/download`

```
┌──────────────────────────────────────┐
│ DOWNLOAD FOR ANDROID                 │
│ VERSION 0.9.3 · 61 MB · 9 OCT 2026   │  example values: from latest.json, never typed
│ ┌•────────────────────────────────•┐ │
│ │  DOWNLOAD THE APK              ↓ │ │  → GitHub Releases, legal flavour only
│ └•────────────────────────────────•┘ │
│ GOOGLE PLAY: COMING SOON             │
│                                      │
│ How to install                       │
│ 1. Open the file when it's done.     │
│ 2. Allow installs from your browser  │
│    if Android asks (Settings will    │
│    say where).                       │
│ 3. Updates: the game tells you when  │
│    there's a new one.                │
│                                      │
│ SHA-256  3f9a…c21e            [COPY] │
│ What's new in 0.9.3 → (the update)   │
└──────────────────────────────────────┘
```

- **The record** is the game's `latest.json` ([07](07-FACT-CHECK.md) F3), read at build time and again in the browser so a release shows without redeploying the site.
- **States:** loaded · the record unreachable (the build's copy shows, dated) · no release yet (*The first Android build is on its way.*, no plate: never a dead link).
- No *iPhone* button; the FAQ answers it.

## 4. `/community` and `/community/ask`

The wireframes and states are in [02](02-COMMUNITY-AND-QUESTIONS.md) §6. What this shape adds:

- **Tabs** `UPDATES · QUESTIONS` with the tape under the active one. The Q&A tab's search sits at its top (02 §7).
- **The ask form** carries the age line of 08 H10 (*You need to be 15 or over to write here.* / *Písať sem môžeš od 15 rokov.*) under the text field, and the public/private tick as two radio buttons with *Private* selected.
- **A withdrawn question** (08 H11): *Withdraw* is a secondary plate on the active question, with a confirmation that names it (*Withdraw "How do I…"?*), never "Yes".
- **A status change** raises a notice in the game (08 H5); on the site, `/community/mine` marks it until opened.
- **Answers are bigger than questions** (Q24): the question in body 13, the answer in body-large 15 on the surface, with *The developer* and the date as a tag.

## 5. The 404

```
┌──────────────────────────────────────┐
│ 404                                  │  super
│ OFFSIDE.                             │  the game's voice, one word
│ That page isn't on the team sheet.   │
│ ┌•────────────────────────────────•┐ │
│ │  PLAY IN YOUR BROWSER          → │ │
│ └•────────────────────────────────•┘ │
│ Back to the front page →             │
└──────────────────────────────────────┘
```

Both languages (*Postavenie mimo hry.*). Served with a real 404 status. The admin route's shell also looks like this until sign-in (03 §4).

## 6. States, all pages

| Page | All possible | In use at launch |
|---|---|---|
| Sign in | default · wrong · too many tries · banned · offline · signed in | all |
| Download | loaded · record unreachable · no release | loaded, unreachable |
| Community | see 02 §6 | see 02 §6 |
| 404 | one | one |
