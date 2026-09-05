# Chore Quest

A small parenting web app with two interfaces on one phone:

- **Kid mode**: today's tasks, points, calendar, two mini games, a rewards shop, and "Buddy" the voice chat bot.
- **Parent mode** (PIN-locked, default `0000`): approve completed tasks, assign repeating tasks with start/end dates, review reward requests, see per-kid stats, calendar of everyone's tasks, settings.

It is plain HTML/CSS/JS with no build step. Data is stored in the browser and, once Firebase is configured, synced to the cloud behind a parent login.

## Deploy

Every push to `main` (or a `claude/**` branch) runs `.github/workflows/deploy-pages.yml`, which publishes the repo root to GitHub Pages. Repo setting needed once: **Settings → Pages → Source: GitHub Actions**.

Live URL: `https://mihirk460.github.io/parenting_app/`

On iPhone: open it in Safari → Share → **Add to Home Screen**.

To run locally instead: `python3 -m http.server 8080` and open `http://localhost:8080`.

## Cloud sync + login (Firebase, free)

Without this the app runs local-only (no login screen, data stays in that browser). With it, each parent gets an account, all their kids/tasks/points live in Firestore, and the same account works on any device.

Firebase's Spark plan is free and does not pause inactive projects. Limits are far above what a family will hit (1 GiB storage, 50k reads and 20k writes per day).

One-time setup, about 10 minutes:

1. Go to https://console.firebase.google.com → **Add project** (any name, Analytics off).
2. **Build → Authentication → Get started → Sign-in method → Email/Password → Enable**.
3. **Build → Firestore Database → Create database** → production mode → pick a region.
4. Firestore → **Rules** tab → paste the contents of `firestore.rules` → Publish.
5. Project settings (gear icon) → **Your apps → Web (</>)** → register the app (no hosting) → copy the `firebaseConfig` object.
6. Paste it into `js/firebase-config.js` replacing `null`. Commit and push. The config is public by design; the rules are what protect the data.
7. Authentication → **Settings → Authorized domains** → add `mihirk460.github.io`.

After the next deploy the app opens with a sign-in screen. Create an account, and you are in. The first sign-in uploads the starter data.

Data model in Firestore: one document per parent, `families/{uid}`, containing the whole app state as JSON. Simple, and fine until a family has thousands of completed tasks (1 MiB document limit).

### Turn on Buddy's real brain (optional)

Buddy only knows a few built-in stories, jokes and facts out of the box. To let it answer real questions:

1. Parent mode → Settings → paste an Anthropic API key → Save.
2. The page calls the Claude API directly with that key. Only do this on your own phone.

Voice input uses the browser's speech recognition (Safari and Chrome). Replies are read aloud with the built-in speech synthesizer; toggle it in Settings.

## How it works

- A **task** is a rule: title, points, kid, repeat (`once` / `daily` / `weekly` / `monthly`), start date, optional end date.
- Each day a task is due is an **occurrence**. The kid ticks an occurrence → it becomes a `submitted` completion → the parent approves (`+points`) or rejects (kid can retry).
- **Rewards**: the kid asks for one, the points are held, the parent approves or denies (denied = refunded).
- **Games** pay small points, capped per day (Settings).
- **Streak** = consecutive days where every due task was approved.

Files:

| File | What |
|---|---|
| `js/store.js` | Data model + all mutations (localStorage) |
| `js/tasks.js` | Recurrence, occurrence status, kid stats |
| `js/kid.js` / `js/parent.js` | The two interfaces |
| `js/calendar.js` | Month view shared by both |
| `js/games.js` | Quick Math, Memory Match |
| `js/chat.js` | Buddy: speech in/out, Claude or built-in replies |
| `js/cloud.js` | Firebase auth + Firestore sync (loaded only if configured) |
| `js/firebase-config.js` | Your Firebase web config, `null` = local-only |
| `js/app.js` | Boot, login screen, hash router, role picker, PIN screen |
| `firestore.rules` | Security rules: each parent sees only their own data |
| `sw.js` | Offline cache. Bump `CACHE` when you ship changes. |

## Known limits (MVP)

- Parent and kid share one phone; the kid picks their avatar, the parent unlocks with the PIN.
- Without Firebase, data is only as safe as Safari's site data. Export a backup now and then.
- The PIN is a speed bump, not security. Anyone with the phone unlocked can read the data.
- The Buddy API key is stored in the family document, so it syncs across your devices. Keep the account password strong.
