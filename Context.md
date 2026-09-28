# Suoha Hognose Breeding OS — Codex Project Context

> **Purpose of this document**
>
> This file is the handoff/context document for Codex. Treat it as the current project baseline.
> Do **not** redesign the data model, rename genetics concepts, drop/recreate tables, or replace the
> existing architecture unless the user explicitly asks for a migration/refactor.
>
> The project is not a pet-store inventory app. It is intended to become a **Western Hognose Breeding
> Operating System** covering individual stock, structured genetics, lineage, multi-generation breeding
> routes, annual production planning, investment decisions, actual breeding records, and eventually an
> inheritance/probability engine.

---

## 1. Current project status

The system has moved through these stages:

1. Original source data was an Excel workbook: `Suoha_hognose.xlsx`.
2. A static desktop-first breeding dashboard was built as a single HTML file.
3. The database was migrated to **Supabase PostgreSQL**.
4. Genetic strings were normalized into atomic genes, named composite morph definitions, and editable combo aliases.
5. Breeding routes, route graph nodes/edges, annual plans, and investment plans were seeded into Supabase.
6. **Supabase Auth + roles + RLS** were added.
7. The latest frontend is intended to be a **private app**: users must log in before business data loads.
8. Deployment architecture is **GitHub → Netlify → Supabase**.
9. AI analysis uses a Netlify Function as a server-side gateway to DeepSeek. Prompt templates, analysis snapshots, recommendations, and follow-up conversations are stored in Supabase; the DeepSeek key is server-only and is never exposed in browser code.
10. The current app also includes investment expense tracking, user display names, snake deletion, atomic gene maintenance, gene aliases, and combo slang maintenance in the data/audit workspace.

### Current Supabase project

```text
Project URL:
https://rseztlkuuxhtuttykabx.supabase.co
```

The frontend is configured with a browser-safe Supabase **publishable key**.  
Do not replace it with a `service_role` key or secret key in frontend code.

### Current deployment model

```text
GitHub repository
       │
       │ push
       ▼
Netlify
       │
       │ serves static frontend
       ▼
index.html / Supabase JS v2
       │
       ├── Auth
       ├── Data API
       └── JWT session
       ▼
Supabase
       ├── auth.users
       ├── public.profiles
       ├── PostgreSQL application tables
       └── RLS policies
```

There is currently **no custom Node/Express backend**. Supabase is the primary backend platform; the only server-side code is the Netlify Function gateway for AI calls.

### AI deployment configuration

The Netlify Function `netlify/functions/ai-analyze.js` requires these server environment variables:

```text
DEEPSEEK_API_KEY          # secret; never commit or place in index.html
DEEPSEEK_MODEL            # optional default: deepseek-v4-flash
SUPABASE_URL
SUPABASE_PUBLISHABLE_KEY
```

The UI permits `deepseek-v4-flash` and `deepseek-v4-pro`; the selection is stored only in the browser's local storage. The function validates the selected model and runs with `thinking: disabled` for deterministic structured output. This prevents spend on reasoning-only tokens that can otherwise end with an empty final response.

### AI data lifecycle

```text
live Supabase facts + active prompt template
        ↓
Netlify AI gateway
        ↓
analysis_runs (immutable input/output audit record)
        ↓
ai_recommendations (reviewable, never automatically applied)
        ↓
ai_conversations + ai_conversation_messages (persistent follow-up session)
```

Initial analysis must return the versioned JSON schema defined by its active prompt. Follow-up messages use the same analysis snapshot and original prompt version, but are natural-language answers; neither kind of response may directly write real snakes, breeding events, or formal plans.

---

## 2. Important local/project artifacts

These are the main artifacts created during the migration.

### Frontend

| File | Meaning |
|---|---|
| `Suoha_hognose_breeding_ui_v3(1).html` | Original/current static UI supplied before Supabase CRUD integration |
| `Suoha_hognose_supabase_auth_crud.html` | Supabase-connected version with login + role-based CRUD UI |
| `Suoha_hognose_private_auth_v2.html` | **Latest recommended frontend baseline**; private login gate, Supabase connection, password recovery, no embedded snake dataset |

When moving into the GitHub/Netlify repository, the latest private version should normally become:

```text
index.html
```

unless the app is refactored into Vite or another build system.

### Database / migration SQL

| File | Purpose |
|---|---|
| `suoha_supabase_schema_v1.sql` | Creates the original 15 core application tables |
| `suoha_composite_morphs_v1/add_composite_morph_tables.sql` | Adds `morphs` and `morph_components` |
| `suoha_auth_profiles_rls.sql` | Adds `profiles`, Auth synchronization, app roles, editor/admin RLS |
| `suoha_private_app_rls_patch.sql` | Changes public-read design to **authenticated private app** design |
| `supabase/migrations/018_morph_aliases.sql` | Adds editable combo aliases for `morphs` |

### Seed data

| File / package | Data |
|---|---|
| `snakes.csv` | Original 32-snake legacy seed snapshot |
| `suoha_supabase_seed_v1/genes.csv` | 17 atomic genes/traits |
| `suoha_supabase_seed_v1/gene_aliases.csv` | 23 parser aliases |
| `suoha_composite_morphs_v1/morphs.csv` | 5 named composite morphs |
| `suoha_composite_morphs_v1/morph_components.csv` | 11 morph component requirements |
| live `morph_aliases` rows | User-maintained slang/alternate names for composite morphs |
| `suoha_composite_morphs_v1/snake_genes_v2.csv` | 108 structured snake-gene rows |
| `suoha_planning_seed_v1/breeding_routes.csv` | 6 breeding projects |
| `suoha_planning_seed_v1/route_nodes.csv` | 29 graph nodes |
| `suoha_planning_seed_v1/route_edges.csv` | 23 graph edges |
| `suoha_planning_seed_v1/annual_breeding_plans.csv` | 40 annual planning rows |
| `suoha_planning_seed_v1/investments.csv` | 4 investment plans |

**Do not automatically re-import these seeds into an existing Supabase project.**
The database has already been populated; treat the live DB as source of truth unless the user asks to rebuild it.

---

## 3. Snake collection baseline

### Legacy seed snapshot

The original seed snapshot had 32 snakes with temporary `S01` ... `S32` IDs. The live database has since
been overwritten from the Excel workbook, and current snake IDs should come from the workbook's individual
number field rather than the old `Sxx` seed convention.

Current owner/investor ID convention:

```text
suohama -> M-prefixed individual IDs
suohayu -> Y-prefixed individual IDs
```

When adding a new snake, the UI should generate the next ID from the current user's existing prefix range
instead of defaulting to `S01`. Existing live snakes should keep their imported IDs. Do not renumber them.

Legacy seed series counts:

| Series | Count |
| --- | --- |
| 巧克力 | 8 |
| 极端红 | 7 |
| Mai Tai | 5 |
| 其他 | 5 |
| 紫食 | 3 |
| 糖霜/焦糖 | 2 |
| 酸雨 | 2 |

### Full legacy seed stock

| ID | Series | Gene text | Sex | Birth | Mature | Price | Investor | Score | Role |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| S01 | 极端红 | 色彩爆炸康达 | F | 2025-07 | 2027-12 | ¥12,000 | — | 92 | 品质核心 |
| S02 | 极端红 | 色彩爆炸康达 | M | 2025-07 | 2026-12 | ¥5,000 | — | 86 | 品质核心 |
| S03 | 极端红 | 紫线极端红 | F | 2025-07 | 2027-12 | ¥6,500 | — | 89 | 品质桥梁 |
| S04 | 极端红 | 紫线极端红白康 | M | 2025-07 | 2026-12 | ¥800 | — | 79 | 基因桥梁 |
| S05 | 极端红 | 色彩爆炸康达 | F | 2026-03 | 2028-12 | ¥12,000 | — | 93 | 品质核心 |
| S06 | 极端红 | 色彩爆炸康达 | M | 2026-03 | 2027-12 | ¥6,000 | Ma | 91 | 品质核心 |
| S07 | 极端红 | 红康隐白化紫貂 | F | 2023-05 | 2025-12 | ¥2,300 | — | 83 | 隐性桥梁 |
| S08 | 紫食 | 薰康隐紫貂 | M | 2025-06 | 2026-12 | ¥1,200 | — | 84 | 薰衣草/紫貂桥梁 |
| S09 | 紫食 | 超北隐薰衣草紫貂 | F | 2026-05 | 2028-12 | ¥1,800 | — | 88 | 高叠加母 |
| S10 | 紫食 | 北康鬼脸紫调50隐薰衣草 | F | 2026-05 | 2028-12 | ¥3,600 | Ma | 85 | 多基因母 |
| S11 | Mai Tai | 红迈泰康 | F | 2024-10 | 2026-12 | ¥4,500 | — | 89 | Mai Tai核心 |
| S12 | Mai Tai | 红太妃康66紫貂 | F | 2025-05 | 2027-12 | ¥1,300 | — | 82 | 太妃/紫貂桥梁 |
| S13 | Mai Tai | 北太妃超康隐紫貂 | F | 2025-07 | 2027-12 | ¥4,500 | — | 94 | 旗舰桥梁母 |
| S14 | Mai Tai | 北康太妃鬼脸隐紫貂 | F | 2026-04 | 2028-12 | ¥3,000 | — | 87 | 复合母 |
| S15 | Mai Tai | 超北康迈泰 | M | 2026-04 | 2027-12 | ¥8,000 | — | 95 | 枢纽公 |
| S16 | 巧克力 | RBE隐毒药巧克力 | M | 2026-04 | 2027-12 | ¥0 | — | 86 | RBE/巧克力桥梁 |
| S17 | 巧克力 | 缺黄隐毒药巧克力 | F | 2026-05 | 2028-12 | ¥1,800 | Ma | 90 | 缺黄/毒药桥梁 |
| S18 | 巧克力 | RBE太妃康隐巧克力 | F | 2026-04 | 2028-12 | ¥3,000 | — | 91 | 复合核心母 |
| S19 | 巧克力 | RBE太妃超康隐巧克力 | M | 2026-04 | 2027-12 | ¥2,000 | Ma | 92 | 复合核心公 |
| S20 | 巧克力 | 巧克力康达66太妃 | F | 2025-10 | 2027-12 | ¥3,500 | — | 87 | 巧克力核心 |
| S21 | 巧克力 | 白化北极康隐薰巧 | F | 2025-10 | 2027-12 | ¥4,000 | Ma | 88 | 白化/北极/薰巧桥梁 |
| S22 | 巧克力 | 白化康隐薰巧 | M | 2025-10 | 2026-12 | ¥800 | Ma | 85 | 白化/薰巧桥梁 |
| S23 | 巧克力 | 超北隐巧克力 | F | 2026-04 | 2028-12 | ¥1,300 | — | 82 | 巧克力桥梁 |
| S24 | 糖霜/焦糖 | 糖霜康 | F | 2026-07 | 2028-12 | ¥1,300 | — | 78 | 待解锁母 |
| S25 | 糖霜/焦糖 | 北极焦糖 | F | 2026-07 | 2028-12 | ¥1,600 | Ma | 80 | 待解锁母 |
| S26 | 酸雨 | 双超太妃隐暴风云 | F | 2026-07 | 2028-12 | ¥3,900 | — | 97 | 旗舰核心母 |
| S27 | 酸雨 | 缺黄超康隐迈泰 | M | 2026-05 | 2027-12 | ¥1,600 | — | 98 | 旗舰枢纽公 |
| S28 | 其他 | 毒药康达 | F | 2024-05 | 2026-12 | ¥3,500 | Ma | 88 | 毒药桥梁 |
| S29 | 其他 | 毒药超康 | F | 2026-03 | 2028-12 | ¥1,700 | — | 89 | 毒药核心 |
| S30 | 其他 | 暴风云康达 | F | 2026-07 | 2028-12 | ¥1,900 | Ma | 91 | 暴风云桥梁 |
| S31 | 其他 | 超北薰衣草 | F | 2026-03 | 2028-12 | ¥1,200 | — | 86 | 薰衣草桥梁 |
| S32 | 其他 | 薰康66白化 | F | 2025-06 | 2027-12 | ¥1,500 | Ma | 84 | 白化桥梁 |

### Interpretation of `strategic_score`

`strategic_score` is a **planning heuristic**, not market value and not a biological measurement.

It expresses how important an individual currently is to the breeding network: hub value, ability to unlock
projects, rare bridge genetics, or importance as a high-quality line-breeding animal.

---

## 4. Genetics model — critical design rule

### 4.1 Atomic genetics are the source of truth

`snake_genes` must contain **atomic genes / traits**, not composite marketing/morph names.

Example:

```text
S27 = 缺黄超康隐迈泰
```

The structured database representation is:

```text
axanthic      visual
conda         super
sable         het
toffee_belly  het
```

Do **not** add a separate `mai_tai` row to `snake_genes`.

### 4.2 Named composite morphs are derived definitions

Named combinations live in:

```text
morphs
morph_aliases
morph_components
```

Current project definitions:

| Morph ID | Chinese | English | Type | Required atomic components |
| --- | --- | --- | --- | --- |
| mai_tai | 迈泰 | Mai Tai | named_combo | sable=visual, toffee_belly=visual |
| toxic | 毒药 | Toxic | named_combo | axanthic=visual, toffee_belly=visual |
| stormcloud | 暴风云 | Stormcloud | named_combo | axanthic=visual, sable=visual |
| acid_rain | 酸雨 | Acid Rain | named_combo | axanthic=visual, sable=visual, toffee_belly=visual |
| double_super | 双超 | Double Super | local_shorthand | arctic=super, conda=super |

Important project convention confirmed by the user:

```text
双超 = Super Arctic + Superconda
       arctic:super + conda:super
```

Current composite model:

```text
Mai Tai     = Sable visual + Toffee Belly visual
Toxic       = Axanthic visual + Toffee Belly visual
Stormcloud  = Axanthic visual + Sable visual
Acid Rain   = Axanthic visual + Sable visual + Toffee Belly visual
Double Super / 双超 = Arctic super + Conda super
```

This means a snake may satisfy several named morph definitions at the same time.
The database should not duplicate those names as independent genes.

`morph_aliases` stores extra names for an existing composite morph. For example, if `morphs`
contains `sunburst = 白化 + 紫貂`, aliases such as `爆炸` can point to that same morph.
During "从基因文本补全", the parser can match multiple composite names/aliases in one text,
merge their components, and write/review the resulting atomic `snake_genes` rows.

### 4.3 Het and possible-het states

Current allowed `snake_genes.state` values:

```text
visual
het
possible_het
super
line_trait
unknown
```

Probability is stored separately.

Examples:

```text
66% possible het Sable:
state = possible_het
probability = 0.66

50% possible het Lavender:
state = possible_het
probability = 0.50
```

Do not collapse `66隐` / `50隐` into definite `het`.

For future inheritance calculations, also do **not** automatically assume that several possible-het genes
from the same parental cross are statistically independent. A proper genetics engine should preserve
joint inheritance information when necessary.

### 4.4 Atomic gene/trait dictionary

Current `genes` table contains **17** rows:

| ID | Chinese | English | Inheritance type | Locus / category |
| --- | --- | --- | --- | --- |
| conda | 康达 | Conda | incomplete_dominant | conda |
| arctic | 北极 | Arctic | incomplete_dominant | arctic |
| axanthic | 缺黄 | Axanthic | recessive | axanthic |
| sable | 紫貂 | Sable | recessive | sable |
| toffee_belly | 太妃 | Toffee Belly | recessive | toffee_belly |
| lavender | 薰衣草 | Lavender | recessive | lavender |
| albino | 白化 | Albino | recessive | albino |
| caramel | 焦糖 | Caramel | recessive | caramel |
| swiss_chocolate | 巧克力 | Swiss Chocolate | recessive | swiss_chocolate |
| rbe_pastel | RBE | RBE Pastel | polygenic | — |
| extreme_red | 极端红 | Extreme Red | line_trait | — |
| red_line | 红线 | Red Line | line_trait | — |
| color_explosion | 色彩爆炸 | Color Explosion | line_trait | — |
| purple_line | 紫线 | Purple Line | line_trait | — |
| purple_tone | 紫调 | Purple Tone | line_trait | — |
| skullface | 鬼脸 | Skullface / Face Pattern | incomplete_dominant | skullface |
| frosted | 糖霜 | Frosted | unknown | — |

### 4.5 Parser aliases

Current parser dictionary has **23** aliases.

Examples:

```text
康 / 康达  -> conda visual
超康       -> conda super
北 / 北极  -> arctic visual
超北       -> arctic super
缺黄       -> axanthic
紫貂       -> sable
太妃       -> toffee_belly
薰 / 薰衣草 -> lavender
```

The gene alias table is intentionally simple (`alias -> one gene`).
Composite slang such as Stormcloud / Toxic / 雪白 / 爆炸 should be maintained through
`morphs + morph_aliases + morph_components`.

### 4.6 Known ambiguous or provisional genetics

Do not silently “fix” these. Ask or preserve `unknown` until clarified.

- `糖霜` — 仍不应自动计算。公开资料存在冲突：部分将 Frosted 描述为 Caramel + Hypo 组合，另一些仍按独立隐性且“under review”展示；在有来源谱系/繁殖验证前，保持 `unknown`，不得与焦糖合并为同位点。
- `鬼脸` — 已按单基因 co-dominant / incomplete-dominant 建模；`snake_genes` 中已出现鬼脸且状态为 `unknown` 的个体应回填为 `visual`。super 的表现和生存性仍应以实际谱系验证。
- S21 / S22 曾使用“白（北）”的模糊简称；已确认 S21 为白化 + 北极，S22 为白化且不带北极。
- S31 曾使用“超北（康）薰衣草”；已确认应为“超北薰衣草”，不带康达。
- `巧克力` is currently modeled as `swiss_chocolate`; confirm against pedigree/source if exact line matters.
- `RBE`, `极端红`, `色彩爆炸`, `紫线`, `紫调`, etc. may be polygenic or line/quality traits and should not be
  forced into simple Mendelian probability logic.
- `色彩爆炸` 显示为“无法按孟德尔计算”，并不表示它不能遗传；只表示当前没有经确认的单一位点模型与状态，无法负责任地给出固定百分比。
- `conda` 为不完全显性；两份康达等位基因（`super`）按既有名称显示为 `超康 / Superconda`，而非通用“康达纯合 / super”。

### 4.7 Notable structured genotype examples

```text
S15 超北康迈泰:
arctic:super, conda:visual, sable:visual, toffee_belly:visual

S26 双超太妃隐暴风云:
arctic:super, axanthic:het, conda:super, sable:het, toffee_belly:visual

S27 缺黄超康隐迈泰:
axanthic:visual, conda:super, sable:het, toffee_belly:het

S28 毒药康达:
axanthic:visual, conda:visual, toffee_belly:visual

S30 暴风云康达:
axanthic:visual, conda:visual, sable:visual
```

---

## 5. Supabase database schema

### Public application tables

The application currently uses these public business tables when the Auth profile layer is included.

| Table | Role | Key relationships |
|---|---|---|
| `snakes` | Individual animals; purchased and produced | PK `id`; self-FKs `sire_id`, `dam_id`; FK `clutch_id` |
| `genes` | Atomic genetics/trait dictionary | PK `id` |
| `gene_aliases` | Parser vocabulary | `gene_id -> genes.id` |
| `snake_genes` | Structured genotype per snake | composite PK `(snake_id,gene_id)` |
| `morphs` | Named composite morphs | PK `id` |
| `morph_aliases` | Slang/alternate names for composite morphs | FK `morph_id -> morphs.id` |
| `morph_components` | Required components of named morphs | `(morph_id,gene_id)` |
| `breeding_routes` | Multi-generation breeding projects | PK `id` |
| `route_nodes` | Graph nodes: snake, planned offspring, target/gap | FK route and optional snake |
| `route_edges` | Directed graph connections | FKs to route nodes |
| `annual_breeding_plans` | Planned annual pairings/projects | FKs to snakes/routes/route nodes |
| `breeding_events` | Actual mating attempts | FKs to plan, route, parents |
| `clutches` | Actual eggs/hatching results | FKs to breeding event and parents |
| `offspring_targets` | Planned/computed offspring outcomes | route/plan/parent references |
| `investments` | Future acquisition/system investments | optional gene/snake references |
| `investment_expenses` | User-entered investment expense ledger | user/profile/category records |
| `snake_measurements` | Longitudinal weight/length/condition | `snake_id` |
| `snake_photos` | Photo metadata for Supabase Storage | `snake_id` |
| `financial_transactions` | Purchases/sales/feed/etc. | optional snake/clutch/investment refs |
| `profiles` | Application authorization profile | PK/FK `id -> auth.users.id` |

### Important `snakes` fields

```text
id                  text PK
series              text
gene_text           text          original human-readable label
sex                 F / M / U
birth_date          date
mature_date         date
price               numeric
investor            text nullable
strategic_score     0..100
role                text
status              active / sold / deceased / retired / planned
origin              purchased / produced / other
sire_id             FK snakes
dam_id              FK snakes
clutch_id           FK clutches
notes
created_at
updated_at
```

A produced offspring should become a normal `snakes` row, not remain forever in a special offspring table.

Example:

```text
Clutch CL2028-001
parents S26 × S27
      ↓
actual hatchling
      ↓
new snakes row, e.g. S33
sire_id = S27
dam_id  = S26
clutch_id = ...
origin = produced
```

This allows real pedigree/lineage traversal over multiple generations.

### Important `snake_genes` fields

```text
snake_id       FK snakes
gene_id        FK genes
state
probability
source
notes

PK = (snake_id, gene_id)
```

### Route graph storage

The visual breeding graph is not hard-coded conceptually. It is represented by:

```text
breeding_routes
      │
      ├── route_nodes
      └── route_edges
```

A real snake can appear in multiple projects. Therefore route-node IDs are route-scoped, e.g.:

```text
flagship_S27
bridge_S27
```

Both nodes still contain:

```text
snake_id = S27
```

Do not merge those route nodes solely because they reference the same real snake; they represent different
visual/project placements.

---

## 6. Seed data counts and live-maintained tables

Confirmed seed targets and live-maintained tables:

| Table | Rows |
| --- | --- |
| snakes | 32 |
| genes | 17 |
| gene_aliases | 23 |
| morphs | 5 |
| morph_aliases | live/user-maintained |
| morph_components | 11 |
| snake_genes | 108 |
| breeding_routes | 6 |
| route_nodes | 29 |
| route_edges | 23 |
| annual_breeding_plans | 40 |
| investments | 4 |
| investment_expenses | grows from user-entered expense records |

The following operational tables were intentionally left empty during initial seeding:

```text
breeding_events
clutches
offspring_targets
snake_measurements
snake_photos
financial_transactions
```

Reason: they should contain real operational records or future genetics-engine output, not speculative seed data.
`investment_expenses` is different: it is intentionally populated by users through the investment ledger UI.

---

## 7. Current breeding routes

There are **6** route projects.

| Route ID | Name | Series | Priority | Start | Nodes | Edges | Objective |
| --- | --- | --- | --- | --- | --- | --- | --- |
| flagship | 旗舰 · 酸雨核心 | 酸雨 | 100 | 2028 | 5 | 4 | 围绕 Axanthic / Sable / Toffee Belly 三隐性网络推进酸雨旗舰路线。 |
| bridge | 桥接 · Mai Tai → 酸雨 | Mai Tai / 酸雨 | 96 | 2027 | 5 | 4 | 利用 Mai Tai 高价值个体将 Sable / Toffee Belly 网络汇聚到酸雨方向。 |
| chocolate | 复合 · 巧克力 | 巧克力 | 94 | 2027 | 5 | 4 | 建立 RBE / Toffee / Conda / Chocolate 复合底盘，再向 Axanthic / Toxic 扩展。 |
| red | 品质 · 极端红 | 极端红 | 91 | 2026 | 5 | 4 | 以 phenotype / line quality selection 为主，强化色彩爆炸与极端红品质。 |
| lavender | 桥接 · 薰衣草 / 紫貂 | 紫食 / 薰衣草 | 90 | 2028 | 5 | 4 | 把薰衣草、紫貂与超北方向串成两代桥接路线。 |
| gap | 投资缺口 · 糖霜 / 焦糖 | 糖霜 / 焦糖 | 95 | 2028 | 4 | 3 | 通过战略公蛇解锁 2F / 0M 的结构性缺口。 |

Key route concepts:

```text
flagship:
S26 + S27
   -> F1 Acid Rain core candidate
   -> with S30
   -> F2 Acid Rain / Stormcloud reinforcement

bridge:
S13 + S27
   -> F1 three-recessive bridge
   -> with S26
   -> F2 higher-order Acid Rain direction

chocolate:
S18 + S19
   -> F1 chocolate composite core
   -> with S17
   -> F2 Axanthic / Toxic / Chocolate direction

red:
S01 + S06
   -> F1 Color Explosion Conda selection
   -> with S03
   -> F2 Purple-line × Color Explosion quality line

lavender:
S09 + S08
   -> F1 Lavender/Sable bridge
   -> with S31
   -> F2 Super Arctic/Lavender direction

gap:
S24 + S25
   -> planned strategic male acquisition
   -> new sustainable project population
```

Routes are **planning structures**, not exact Mendelian outcome claims.
Exact offspring probabilities are intentionally deferred until the genetics engine is rigorous.

---

## 8. Annual production planning

`annual_breeding_plans` currently has **40** records.

| Year | Plan rows |
| --- | --- |
| 2026 | 2 |
| 2027 | 7 |
| 2028 | 13 |
| 2029 | 7 |
| 2030 | 6 |
| 2031 | 5 |

Planning philosophy:

- A mature female does **not** automatically mean she must be bred.
- Annual capacity intentionally leaves room for rest, failed pairing, clutch recovery, and retained offspring.
- Priorities currently use:
  - `A` = high priority / execute first
  - `B` = secondary
  - `R` = reserve
  - `G` = investment gap
  - `C` = conditional/future
- Future F1/F2 individuals can be represented through `route_nodes` references before they exist as real snakes.
- Once an offspring actually exists, create a real `snakes` row and stop treating it only as a virtual route node.

Current heuristic production targets:

```text
2026: 2 planned clutches — startup
2027: 6 — expansion
2028: 11 — combination expansion
2029: 12 — F1 retention / review
2030: 12 — second-generation preparation
2031: 13 — flagship F2 realization
```

These are planning heuristics, not biological guarantees.

---

## 9. Investment strategy already encoded

Current investment records:

| ID | Rank | Name | Score | Planned year | Thesis |
| --- | --- | --- | --- | --- | --- |
| I01 | 1 | 糖霜 / 焦糖战略公蛇 | 96 | 2028 | 当前 2F / 0M，是最明确的结构性缺口。优先寻找能同时覆盖糖霜、焦糖并可与其他项目共享的公蛇。 |
| I02 | 2 | 第二条 Mai Tai / 酸雨枢纽公 | 93 | 2028 | Mai Tai 最终 4F / 1M，单公瓶颈明显。第二条无亲缘高质量公蛇可改善血缘多样性。 |
| I03 | 3 | 极端红外血高品质公 | 87 | 2030 | 极端红数量已充足，只在明显提升红度、底色或血缘多样性时买。 |
| I04 | 4 | 数据化繁殖基础设施 | 90 | 2026 | 照片、体重、配种、产蛋、孵化、销售和血缘记录会直接提高后续配对决策质量。 |

Important strategic conclusions behind these records:

- By 2028 there are many females; future acquisition should focus more on **strategic males / genetic bridges** than simply adding more females.
- `糖霜/焦糖` currently has a structural **2F / 0M** gap and is the clearest acquisition need.
- Mai Tai ultimately has a **4F / 1M** concentration; a second unrelated high-quality hub male is valuable.
- Extreme Red and Chocolate already have numerical depth; new purchases should improve quality/outcross/network connectivity, not merely quantity.

---

## 10. Frontend architecture

### Current technology

- Static single-page HTML/CSS/JS.
- Desktop-first design, originally around **1440×1024**.
- Supabase JS v2 loaded via CDN.
- Netlify serves the frontend.
- No React/Next.js requirement yet.
- A future Vite refactor is acceptable, but it should preserve current behavior/data model.

### Main UI modules

```text
繁殖路线       Breeding Routes
种群总览       Population
年度产出       Production
投资计划       Investment
配对实验室     Pairing Lab
数据管理       Authorized CRUD / admin workspace
```

Visual identity:
- dark professional dashboard
- lineage/network/spatial graph is the product differentiator
- avoid generic CRUD-admin feel where possible
- breeding route graph is the core experience

### Latest private frontend behavior

`Suoha_hognose_private_auth_v2.html` is intended to:

1. Show a full-screen login gate before the application.
2. Initialize Supabase Auth.
3. Load business data only after an authenticated session exists.
4. Use password/email login.
5. Support password recovery with `resetPasswordForEmail`.
6. Handle the `PASSWORD_RECOVERY` auth event and let the user set a new password.
7. Read live tables from Supabase:
   - `snakes`
   - `breeding_routes`
   - `route_nodes`
   - `route_edges`
   - `annual_breeding_plans`
   - `investments`
   - `investment_expenses`
   - `genes`
   - `gene_aliases`
   - `snake_genes`
   - `morphs`
   - `morph_aliases`
   - `morph_components`
8. Convert database fields into the legacy UI shape in JavaScript.
9. Preserve a small static production-capacity config, but **the 32-snake dataset is no longer embedded in the latest private HTML**.

### CRUD currently implemented in UI

Current authorized CRUD is mainly implemented for:

```text
snakes + snake_genes
genes
gene_aliases
morphs + morph_aliases + morph_components
breeding_routes / route_nodes / route_edges
annual_breeding_plans
investments
investment_expenses
```

Snake CRUD supports add/edit/deactivate/delete. Deactivation keeps the animal and its investment value in
the collection, while deletion removes the animal from investment totals and warns if it is used in breeding
routes.

Future CRUD work should add interfaces for:

```text
breeding_events
clutches
measurements
photos
financial transactions
```

---

## 11. Authentication and authorization

### Correct user architecture

Do **not** create a custom password table.

Use:

```text
auth.users          Supabase-managed identity/password
    │
    └── id
         ↓
public.profiles     application authorization/profile
```

`profiles` fields:

```text
id           uuid PK/FK -> auth.users.id
email
display_name
role         viewer / editor / admin
active       boolean
created_at
updated_at
```

A trigger creates/backfills a profile for Supabase Auth users.

### Roles

```text
viewer
  authenticated read-only

editor
  read + application CRUD

admin
  editor permissions
  + role/profile administration
```

The frontend may hide controls based on role, but **RLS is the actual security boundary**.

### Current user/admin state

A profile has already been shown in Supabase with:

```text
role   = admin
active = TRUE
```

The exact email is intentionally not duplicated here.

### RLS scripts

`suoha_auth_profiles_rls.sql`:
- creates `profiles`
- creates `can_edit_app()`
- creates `is_app_admin()`
- syncs Auth users to profiles
- adds authenticated editor/admin write policies
- originally included public read policies for app-visible tables

`suoha_private_app_rls_patch.sql`:
- removes anonymous/public read policies
- removes `anon` SELECT access
- adds authenticated read policies

**Target architecture now is private app mode.**

Verify whether the private patch has actually been run in the live Supabase project before assuming anonymous reads are blocked.

---

## 12. Current Auth configuration issue / last known state

The login flow reached Supabase successfully, but a test produced:

```text
Invalid login credentials
```

This means the project URL/publishable key request path was working; user/password setup needed verification.

Another issue was identified:

```text
verification/recovery link -> localhost
```

This is caused by Supabase Auth URL configuration still pointing at localhost.

The user is currently at:

```text
Supabase
Authentication
  -> URL Configuration
```

Required production configuration:

```text
Site URL:
https://<actual-netlify-domain>

Redirect URLs:
https://<actual-netlify-domain>
https://<actual-netlify-domain>/**
```

The actual Netlify hostname has not been recorded in this handoff document.

After changing the URL configuration, send a **new** invite/verification/password-recovery email.
Old email links may still contain the old localhost redirect.

---

## 13. Security invariants — do not break these

1. **Never put a Supabase `service_role` / secret key in browser code or GitHub.**
2. The publishable key is browser-side configuration; authorization must rely on JWT + RLS.
3. Do not trust hidden UI buttons as authorization.
4. Do not create/store plaintext or custom password hashes in `public.profiles`.
5. Do not disable RLS merely to make CRUD “work”.
6. Do not make `financial_transactions` publicly readable.
7. In private-app mode, anonymous users should not read breeding data.
8. Deleting a snake must never happen silently when it is referenced by breeding routes/plans/clutches/pedigree. The UI should warn first; deactivation remains the non-destructive option for animals still owned but not intended for breeding.

---

## 14. Data/model invariants Codex should preserve

### Snake IDs

```text
Legacy seed: S01 ... S32
Live IDs: imported workbook individual numbers
suohama: M-prefixed IDs
suohayu: Y-prefixed IDs
```

Do not generate new IDs that collide with existing live IDs. When creating a snake from the UI, generate the
next ID for the current user's prefix range.

### Existing vs planned offspring

```text
route_nodes.node_type = planned_offspring
```

does **not** mean that animal exists.

Only after a real hatchling is recorded should it become:

```text
snakes.id = <real imported/generated individual ID>
origin = produced
sire_id / dam_id
clutch_id
```

### Genetics

- Atomic gene definitions in `genes`; individual gene states in `snake_genes`.
- One-gene nicknames in `gene_aliases`.
- Named combos and combo slang in `morphs/morph_aliases/morph_components`.
- Do not store Acid Rain, Toxic, Mai Tai, etc. as duplicate atomic gene states.
- Preserve `possible_het` probabilities.
- Do not force polygenic/line traits into Mendelian calculations.

### Planning vs reality

Keep separate:

```text
annual_breeding_plans  = intended plan
breeding_events        = actual mating event
clutches               = actual reproductive output
```

Never rewrite planned records as if they were completed real events.

---

## 15. Recommended next Codex tasks

### First priority — stabilize current private web app

1. Use `Suoha_hognose_private_auth_v2.html` as the current frontend baseline.
2. Put it in the Netlify/GitHub project as `index.html`.
3. Confirm Supabase Auth `Site URL` and redirect URLs point to the real Netlify domain.
4. Confirm the private RLS patch is applied.
5. Test:
   - unauthenticated visitor cannot enter/read data
   - valid viewer can read but cannot write
   - editor/admin can CRUD
   - logout returns to login gate
   - session persists after refresh
   - password recovery returns to the Netlify site
6. Test one non-destructive edit on `snakes`, refresh, and confirm UI reloads live database data.

### Second priority — remove remaining static planning logic

The latest frontend still keeps some production capacity/quota heuristics in JS.
Move these into structured database/config tables if the user wants everything editable from the application.

### Third priority — genetics engine

Build a proper inheritance engine using:

```text
genes
snake_genes
morphs
morph_aliases
morph_components
```

It should:
- calculate per-locus offspring genotype probabilities
- support recessive and incomplete-dominant states
- preserve possible-het uncertainty
- detect derived named morphs from atomic genotype outcomes
- avoid fake precision for line/polygenic traits
- later allow F1 -> F2 / backcross simulation

### 4.7 Mendelian probability engine — implemented

The pairing laboratory now calculates Mendelian outcomes in the browser from the live Supabase snapshot:

- `recessive`: visual / het / possible_het;
- `dominant` and `incomplete_dominant`: visual / super, with visual assumed heterozygous unless dosage is recorded;
- same `genes.locus` values are calculated as a single locus, rather than as independent genes;
- named combos in `morphs + morph_components` are derived only when all required loci are calculable and independent;
- `morph_aliases` affects text parsing/maintenance, not Mendelian probability math by itself;
- `unknown`, `polygenic`, `line_trait`, and conflicting same-locus records are shown as skipped, never converted to a made-up percentage.

The source table (`genes.inheritance_type`) and the individual state table (`snake_genes.state`) have separate meanings. Updating the former does not alter existing individual rows. Use migration `011_correct_skullface_and_frosted_metadata.sql` to backfill existing `skullface = unknown` rows to `visual`.

Source review recorded on 2026-08-26: [Skullface as co-dominant and head-pattern eliminating](https://hognosesnakes.de/morphe/muster/); [Coral as Lavender + Albino double recessive](https://www.gargoylequeen.com/hognosebreeders.html); [Frosted listed as under review](https://hognosehub.com/genetics-lab/caramel).

### Fourth priority — operational breeding records

Add workflow/UI for:

```text
breeding_events
clutches
produced offspring
measurements
photos
```

The product should progressively evolve from “planning dashboard” into a real Breeding OS.

---

## 16. Suggested repository documentation structure

If Codex refactors the repo, a useful structure is:

```text
/
├─ index.html                  # current app if staying static
├─ README.md
├─ docs/
│  └─ CODEX_CONTEXT.md         # this document
├─ supabase/
│  ├─ migrations/
│  │  ├─ 001_core_schema.sql
│  │  ├─ 002_composite_morphs.sql
│  │  ├─ 003_auth_profiles_rls.sql
│  │  ├─ 004_private_app_rls.sql
│  │  └─ 018_morph_aliases.sql
│  └─ seed/
│     ├─ snakes.csv
│     ├─ genes.csv
│     ├─ gene_aliases.csv
│     ├─ morphs.csv
│     ├─ morph_aliases.csv
│     ├─ morph_components.csv
│     ├─ snake_genes.csv
│     ├─ breeding_routes.csv
│     ├─ route_nodes.csv
│     ├─ route_edges.csv
│     ├─ annual_breeding_plans.csv
│     └─ investments.csv
```

If switching to Vite:

```text
src/
├─ lib/supabase.js
├─ auth/
├─ data/
├─ pages/
│  ├─ routes.js
│  ├─ population.js
│  ├─ production.js
│  ├─ investment.js
│  ├─ lab.js
│  └─ admin.js
└─ genetics/
```

Do not perform this refactor solely for aesthetics; first preserve working Auth/RLS/data behavior.

---

## 17. One-paragraph project summary for Codex

Suoha Hognose is a private, desktop-first Western Hognose breeding operating system deployed through
GitHub/Netlify with Supabase as the PostgreSQL/Auth backend. The live collection uses imported workbook
individual numbers, with M/Y-prefixed IDs tied to the current investor/user convention.
Genetics are modeled with atomic `genes + snake_genes`; named combinations such as Mai Tai, Toxic,
Stormcloud, Acid Rain, and the user-defined “双超 = Super Arctic + Superconda” are derived through
`morphs + morph_aliases + morph_components`, not duplicated as genes. Multi-generation strategy is stored as
`breeding_routes + route_nodes + route_edges`, annual intent is stored separately from actual breeding
events/clutches, and future offspring remain virtual route nodes until they really hatch. Supabase Auth
uses `auth.users` plus `public.profiles` roles (`viewer/editor/admin`) and RLS; the target state is a fully
private app where anonymous users cannot read business data. The latest frontend baseline is
`Suoha_hognose_private_auth_v2.html`; the immediate work is to finish Netlify Auth redirect configuration,
verify private RLS, test login/session/CRUD end-to-end, and then continue toward a rigorous genetics engine
and real breeding-operation records.

---

## 18. Codex instruction block

When taking over this project:

```text
- Read this document before changing code.
- Treat the existing Supabase database as live state.
- Do not drop tables or reseed unless explicitly requested.
- Preserve existing live snake IDs and generate new IDs from the current user's M/Y prefix convention.
- Preserve the atomic-gene/composite-morph separation.
- Preserve plan/event/clutch separation.
- Preserve RLS and never expose a service-role key.
- Ask before resolving ambiguous genetics such as 糖霜. S21、S22、S31 和鬼脸已按用户确认信息回填。
- Prefer incremental changes that keep the deployed app working.
- The core product experience is lineage + generation + network + breeding planning, not generic admin CRUD.
```
