# Suoha Hognose frontend architecture

The app remains a static Netlify site backed by Supabase. It intentionally does
not introduce a second application backend or a frontend build framework.

## Runtime boundary

```text
index.html  -> page shell and external resource entry points
assets/app.css -> visual system, layout and motion
js/data.js  -> Supabase configuration and authenticated table reads
js/app.js   -> state, auth, routing, standard rendering and CRUD
js/ai.js    -> AI generation, persistence, review submission and chat
Netlify AI  -> DeepSeek secret proxy and response validation
Supabase    -> Auth, RLS, PostgreSQL, Storage and future Realtime events
```

## Phase 1 (implemented)

- `js/data.js` owns the browser-safe Supabase configuration.
- `js/data.js` owns the business-table and AI-decision snapshot queries.
- `index.html` consumes `window.SuohaData.fetchWorkspace(sb)` and contains no
  direct `from(...).select(...)` page-load query list.
- `assets/app.css` contains the former inline stylesheet without altering the
  page's visual rules.
- `js/ai.js` contains the former AI-specific client logic without changing the
  Netlify Function endpoint or the persisted Supabase tables.
- Existing screen structure, database tables, RLS, and Netlify AI Function are
  unchanged.

## Next safe extraction steps

1. Move page renderers and form markup into `js/views.js`.
2. Replace broad post-save reloads with data-domain invalidation and Supabase
   Realtime subscriptions for the currently open page.

These are deliberately separate steps so the live Supabase data model and the
existing user interface can be verified after each move.
