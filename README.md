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

One-time setup, about 10 minutes. The Firebase console moves menus around, so every step below also has a direct link; replace `YOUR-PROJECT-ID` with the ID Firebase shows you in step 1.

**1. Create the project**
- Open https://console.firebase.google.com and sign in with a Google account.
- Click **Create a project** (or **Add project**). Name it anything, e.g. `chore-quest`.
- Firebase shows a project ID under the name, like `chore-quest-4f2a1`. Write it down.
- When asked about Google Analytics, turn it **off**. Click **Create project**, then **Continue**.

**2. Turn on email/password sign-in**
- Direct link: `https://console.firebase.google.com/project/YOUR-PROJECT-ID/authentication/providers`
- Or in the left sidebar: if you see a **Build** heading, expand it and click **Authentication**. If you do not see it, click **All products** (or the grid icon at the bottom of the sidebar) and pick **Authentication** from the list.
- Click **Get started** if shown. Open the **Sign-in method** tab.
- Click **Email/Password**, switch the first toggle **Enable** on, click **Save**.

**3. Create the database**
- Direct link: `https://console.firebase.google.com/project/YOUR-PROJECT-ID/firestore`
- Or sidebar: **Build → Firestore Database**, or **All products → Cloud Firestore**.
- Click **Create database**.
- Database ID: leave as `(default)`. Location: pick the one nearest you. Click **Next**.
- Choose **Start in production mode**. Click **Create** (or **Enable**).

**4. Paste the security rules**
- On the Firestore page, click the **Rules** tab at the top.
- Delete everything in the editor and paste the whole contents of the file `firestore.rules` from this repo.
- Click **Publish**.

**5. Register the web app and copy its config**
- Direct link: `https://console.firebase.google.com/project/YOUR-PROJECT-ID/settings/general`
- Or click the **gear icon** next to "Project Overview" at the top of the sidebar → **Project settings**.
- Scroll down to **Your apps**. Click the **`</>`** (Web) icon.
- App nickname: `Chore Quest`. Leave **Firebase Hosting** unchecked. Click **Register app**.
- You will see a code block containing `const firebaseConfig = { apiKey: "...", authDomain: "...", ... }`. Copy just the object, from `{` to `}`.
- Click **Continue to console**.

**6. Put the config in the app**
- Open `js/firebase-config.js` in this repo (GitHub → the file → pencil icon works fine).
- Replace `export const firebaseConfig = null;` with `export const firebaseConfig = { ...what you copied... };`
- Commit. The deploy runs automatically.
- This config is public by design (every Firebase web app ships it). The rules from step 4 are what protect your data.

**7. Allow the live site to sign in**
- Direct link: `https://console.firebase.google.com/project/YOUR-PROJECT-ID/authentication/settings`
- Or: Authentication → **Settings** tab → **Authorized domains** → **Add domain** → `mihirk460.github.io`.

After the next deploy the app opens with a sign-in screen. Create an account, and you are in. The first sign-in uploads the starter data.

Data model in Firestore: one document per parent, `families/{uid}`, containing the whole app state as JSON. Simple, and fine until a family has thousands of completed tasks (1 MiB document limit).

### Buddy's brain (chat bot)

Out of the box Buddy only knows a few built-in stories, jokes and facts. Parent mode → Settings → **Buddy chat bot** → pick a brain:

- **OpenRouter (free models)**. Make an account at https://openrouter.ai, create a key under **Keys**, paste it in Settings. The default model is a free Nemotron; free models end in `:free` and the current list is at https://openrouter.ai/models (filter Free). Free tier limits: about 50 requests per day, raised to 1000 per day once you have bought $10 of credit at any point. Some free models are provided by hosts that may log prompts; check the model page if that matters to you.
- **Anthropic Claude**. Paste an Anthropic API key. Best behaviour with the kid-safety instructions, but every message costs money.
- **Built-in only**. Works offline, no key, canned answers.

The page calls the provider directly from the browser with your key. Keys are saved with your family data (synced to your Firestore document when cloud sync is on), so they are only as safe as your account password. Do not paste keys into chat with anyone, including me; Settings is the only place they should go.

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
