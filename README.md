# Madrasa Reports

Daily memorization tracking system for **Madrasa Dar ul Ma'arij** (Muscat, Oman) — qaris log each student's Sabaq / Sabqi / Manzil every day, parents follow their child's progress from their own portal, and the admin sees every class at a glance.

## What it does

- **Role-based portals** — admin (all classes, fees, reports), qari (own class attendance + daily reports), parent (own child's progress + fee status)
- **Daily reports** — Sabaq (new lesson), Sabqi (recent revision), Manzil (full revision) with pages/lines, comments, and absence marking
- **Fee tracking** — monthly fee settings per student (full-time / part-time), payment marking with history
- **Trilingual UI** — English, Urdu, and Arabic with full RTL layout and Jameel Noori Nastaleeq font for Urdu text
- **Installable PWA** — manifest + service worker, works from the home screen on qaris' phones

## Tech

- Frontend: single-file HTML + CSS + vanilla JS (no framework, no build step for dev)
- Backend: [Supabase](https://supabase.com) (Postgres + Auth + Row Level Security)
- PWA: `manifest.webmanifest` + `sw.js`

## Project structure

```
index.html              # built single-file app (generated — see Build)
css/style.css           # all styles
js/app.js               # UI + routing
js/data.js              # Supabase data layer
js/i18n.js              # EN / UR / AR strings
supabase-schema.sql     # base database schema
supabase-patch*.sql     # incremental schema patches
migration-*.sql         # data migrations
seed-supabase.js        # optional demo-data seeder (dev only)
build-single-html.js    # build script (inlines CSS/JS/logo into index.html)
deploy.ps1              # deploy helper
```

## Setup

1. Create a Supabase project.
2. Run `supabase-schema.sql`, then the `supabase-patch*.sql` files in order, in the Supabase SQL editor.
3. Put your project URL + anon key in `js/data.js` (`SUPABASE_URL`, `SUPABASE_ANON_KEY`).
4. Open `index.html` — or run `node build-single-html.js` to produce the deployable single file.

> `seed-supabase.js` inserts demo data with a placeholder admin credential — change it before running against any real database, and never commit real credentials.
