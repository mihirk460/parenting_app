# Chore Quest

A small parenting web app with two interfaces on one phone:

- **Kid mode**: today's tasks, points, calendar, two mini games, a rewards shop, and "Buddy" the voice chat bot.
- **Parent mode** (PIN-locked, default `0000`): approve completed tasks, assign repeating tasks with start/end dates, review reward requests, see per-kid stats, calendar of everyone's tasks, settings.

It is plain HTML/CSS/JS with no build step. All data is stored in the browser (`localStorage`), so it works offline once installed to the home screen.

## Run it

Any static file server works. For example:

```
python3 -m http.server 8080
```

Then open `http://localhost:8080`.

### Put it on your phone (GitHub Pages)

1. In this repo on GitHub: **Settings → Pages → Build and deployment → Source: Deploy from a branch**, branch `main`, folder `/ (root)`.
2. Open `https://<your-user>.github.io/parenting_app/` in Safari.
3. Share → **Add to Home Screen**. It opens full-screen like an app.

### Turn on Buddy's real brain (optional)

Buddy only knows a few built-in stories, jokes and facts out of the box. To let it answer real questions:

1. Parent mode → Settings → paste an Anthropic API key → Save.
2. The key is stored only in that browser and calls the Claude API directly from the page. Do not do this on a shared or public device.

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
| `js/app.js` | Hash router, role picker, PIN screen |
| `sw.js` | Offline cache. Bump `CACHE` when you ship changes. |

## Known limits (MVP)

- **Single device.** Parent and kid share one phone. There is no sync, so "sent to parent for approval" just means it shows up in parent mode. Use Settings → Export/Import to move data between devices by hand. A real backend is the first thing to add if you want separate phones.
- Data is only as safe as Safari's site data. Export a backup now and then.
- The PIN is a speed bump, not security. Anyone who opens the browser dev tools can read the data.
