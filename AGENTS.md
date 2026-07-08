# AGENTS.md

Plataforma de operaciones de arriendos para el departamento familiar de Chillán. Vista mobile-first con Liquid Glass. Tres archivos + assets + schema SQL. Vanilla JS, no build, no framework.

## Stack (intentional, do not change)

- Vanilla JS, **no build step, no package.json, no bundler, no test runner, no linter**.
- Tres archivos: `index.html`, `styles.css`, `app.js`.
- Static assets: `assets/chillan-bg.jpg` (desktop 1.3 MB) and `assets/chillan-bg-mobile.jpg` (mobile 330 KB, loaded `<900px`). Both must ship on deploy.
- PWA: `manifest.webmanifest`, `icon-192.png`, `icon-512.png`.

## Run / verify

```bash
cd chillan-rentas
python3 -m http.server 8000   # then open http://localhost:8000
```

`file://` is broken — the dynamic ES-module Supabase import and relative paths require http. There is no test/lint/typecheck command; "does it still work in the browser" is the only verification.

## Cache busting — bump both

When you change `app.js` or `styles.css`, bump **both**:
- `const VERSION` at the top of `app.js` (drives the badge in the footer).
- The `?v=N` query string in `index.html` on the matching `<link>` / `<script>` tag.

If you only bump one, the badge and the served asset disagree and users see stale code.

## Storage backend is chosen at runtime, not at build time

`CONFIG.supabaseUrl` and `CONFIG.supabaseAnonKey` at the top of `app.js`:
- **Both empty** → local mode (localStorage, this device only).
- **Both filled** → live mode (Supabase, realtime across devices).

`initStore()` builds `state.store` with the same `loadAll / upsertRental / removeRental / upsertCleaning / removeCleaning / addComment / replaceCleanings / onChange` interface in either mode. Everything else in the app calls only `state.store` and never knows which backend is active. **If you need a new persistence layer, add one branch in `initStore()` — nothing else needs to change.**

`initStore()` also does a **probe** (`loadAll()`) before setting `state.store`. If the tables don't exist (schema not created), it falls back to `localStore()`, sets `state.schemaMissing = true`, and shows an amber banner with a "Reintentar" button.

Live mode loads the Supabase client lazily via `await import("https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm")`, so local mode stays dependency-free. If CDN is blocked, the badge says "⚠ Modo local (no se pudo conectar a Supabase)" and the app keeps working on localStorage.

Local mode syncs across tabs via the `storage` event; live mode uses a Supabase `postgres_changes` channel. Both call `load()` on change.

The anon key is **public by design** (RLS is wide-open in `schema.sql`). Privacy is the Supabase URL itself staying within the family — do not "fix" RLS without a replacement auth plan.

## Data model

- One `rentals` table; one `cleanings` table; one `cleaning_comments` table. See `schema.sql` for the canonical schema and RLS policies.
- A `rental` generates **one** `cleaning` (tarea) for the `checkout_date` at 12:00. Generated client-side when the rental is created/edited (no SQL trigger).
- A `rental` can have multiple `cleaning_comments` (operator notes).
- States: `rental.status ∈ {scheduled, in_progress, completed, cancelled}`, `cleaning.status ∈ {pending, confirmed, done, cancelled}`. ENFORCED with CHECK constraints in DB.
- Convención: la columna `rentals.source` siempre vale `"direct"` (único valor visible del CHECK del schema que queda en uso tras el rename). El display dice "Arriendo" independientemente. Esto evita tocar el CHECK del schema y mantiene flexibilidad futura.

## Render model

`render()` fully rebuilds `#grid` on every data or view change. It is cheap (one month). Do not try to do incremental DOM diffs.

**Calendar**: bars per rental with `.start` / `.end` / `.pill` classes based on whether the day is the rental's first / last / both. `CONFIG.maxLanes` caps visible bars per cell, then shows `+N`. Past days: strikethrough on day number. Future days: never strikethrough.

**Brush selection** (admin, when both days picked): floating pill with "Confirmar" (creates immediately) or "+ Detalles" (opens form with pre-filled dates). The form's reference/guest/notes fields are collapsed behind a "+ Agregar detalles (opcional)" toggle.

**Lock screen**: PIN `CONFIG.opsPin` blurs the app on load. Re-blurs on every reload. Auto-relock on inactivity: 15 min (configurable in `CONFIG.inactivityLockMin`).

**Past days**: number strikethrough + opacity 0.55 on the cell. The rental bar inside also fades to 0.6. This is the visual cue for "this happened in the past".

**Ticket system** (the green ticket on checkout day): pending = glass outline, done = green filled with shadow. Tap to open the "marcar tarea como hecha" modal. The user can undo via the same modal.

## Configuration lives in `app.js`, not CSS

- `CONFIG.families` — (irrelevant for this app, the calendar shows rentals not families). Kept for potential future.
- `CONFIG.weekStart` (1 = Mon), `yearMin` / `yearMax`, `maxLanes`.
- `CONFIG.sourceLabels` / `CONFIG.sourceColors` — display labels and colors per rental source.
- `CONFIG.opsPin` / `CONFIG.adminPin` — entry and admin PINs.

CSS design tokens are custom properties under `:root` in `styles.css` (`--glass-bg`, `--round`, `--text`, …). The `.glass` / `.glass-soft` utilities carry the Liquid Glass look via `backdrop-filter`. The single responsive cutoff is `@media (max-width:560px)` that compacts the layout on small screens.

UI strings are Spanish (`lang="es"`); keep new strings Spanish too.

## Files that look load-bearing but aren't

- `oficial-nevados_*.jpg` (NOT in this repo) — source photo, never used; the optimized background is `assets/chillan-bg.jpg`.
- `ruvector.db` (NOT in this repo) — unreferenced artifact. .gitignore covers it.

## Deploy

`README.md` documents the Cloudflare Pages + Cloudflare Access path (recommended) and the Netlify Drop shortcut (no auth). Make sure all `assets/` files ship with whichever output you use.
