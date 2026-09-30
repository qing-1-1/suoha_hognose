# Suoha Hognose frontend architecture

## Current additions (2026-09-30)

The public homepage adds `home-content.js`, `home-editorial.js`, `studio-feeding.js`,
`home-hatch.js` and `public-refinements.js` for editorial content and visible-only
pixel animation playback. Public catalog v2 filters and per-photo visibility are
provided by migration 026. Private views add `workspace-upgrades.js`; migration 027
provides growth record types, retention assessments and atomic, retry-safe batch
registration. Data loaders read stable ordered batches into a complete authorized
snapshot; visible lists paginate that snapshot. This is not server-side on-demand
pagination. See [current deployment instructions](../../README.md) and
[the implementation record](../design/视觉升级与功能优化实施方案.md) for status.

The dated sections below retain the architecture history. Paths shown in code
blocks are relative to the repository root. Documentation is indexed in
[docs/README.md](../README.md).

## V2 implementation (2026-09-29)

The public site now lives at `index.html`; the original authenticated workspace
is preserved in `admin.html` at `/admin`. Public traffic never calls the internal
`fetchWorkspace()` loader. See [README.md](../../README.md) for enablement and current limits.

```text
Public: index.html + storefront.css + storefront.js + field-art.js
  -> public-catalog function -> public_catalog SQL projection (published fields only)
  -> specimen-media function -> publication check -> private Storage bucket
  -> purchase-inquiry function -> server-only credentials + HMAC rate key
     -> submit_purchase_inquiry transaction
  /specimens/:slug -> specimen-page function (share metadata) + public application

Private: admin.html + app.css + workspace.css
  -> data.js: authenticated internal snapshot + complete cost/expense reads
  -> app.js / ai.js / genetics.js: existing planning, CRUD and analysis
  -> workspace.js: publishing, sales, actual breeding records, individual archive
  -> route-history.js: optimistic position transactions and session undo/redo
  -> workspace-interactions.js: keyboard dialogs, saved views, sorting, task tabs
```

New additive migrations `019–022` are supplied, not automatically applied to the
live project. Existing animals stay private until a member explicitly publishes.
Sales status is separate from publication and animal lifecycle. Server transactions
protect reservation uniqueness and maintain sales history. Cost snapshots preserve
recorded acquisition costs after an animal leaves inventory; linked manual expenses
replace the corresponding snapshot in totals to avoid double counting.

Netlify publishes only the generated `dist/` allowlist, not the repository root.
No service-role or AI secret is included in browser bundles. Public data access is
explicitly projected through SQL and projected again at the function boundary.

Browser tests use mocked business data; database tests execute migrations in
PGlite against a minimal version of the existing schema. Production RLS and Storage
still require deployment verification. Historic notes below describe the earlier split.

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
# Inventory libraries (2026-09-29 follow-up)

`023_inventory_libraries.sql` adds `snakes.inventory_library` (`stock` / `nursery`). Existing individuals stay in stock; inserted homebred individuals enter nursery through a trigger, including the existing hatchling RPC. `transfer_inventory_animal` preserves identity and pedigree and records the transfer. `inventory_sale_states` exposes only member-visible sales badges, derived from current listings, with no customer data. UI integration lives in `js/inventory.js`; the second visual pass lives in `assets/workspace-refinements.css`. See `优化建议与实施记录.md` for behavior and rollout. This migration has not been applied to production by this code change.
