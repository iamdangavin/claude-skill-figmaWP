---
name: migrate
description: Migrate a Figma file onto the figmaWP WordPress conventions. Step 1 maps existing variables and text styles to the WP Color / WP Typography / WP Spacing collections using the theme's slugs, copies the values in (or aliases them), rebinds every layer to the WP variables, and hides the old collections. Step 2 optionally names frames' layers with wp: block names using infer-then-confirm. Supports --file <figma url> to rehearse on a duplicate first. Use when the user says "migrate the Figma file", "convert our variables to WordPress", "this file doesn't use the WP plugin", or "name the blocks in Figma".
---

# figmaWP: migrate

`PLUGIN` = the directory two levels above this skill's base directory. Read `PLUGIN/reference/guardrails.md`, `PLUGIN/reference/token-convention.md`, and `PLUGIN/reference/block-naming.md` first. Requires `.figmawp/profile.json` (find it with "Finding the project" in profile-schema.md); if missing, run `/figmawp:bootstrap` first.

This skill **writes to Figma**, so every change is previewed and confirmed. Load `/figma-use` guidance before any `use_figma` call.

## Arguments
- `--file <figma url>`: **rehearsal mode.** Run against a different file (normally a duplicate of the real one), not the profile's `figma.fileKey`. In rehearsal mode:
  - Confirm the target file's name with the user before writing anything, and refuse if its key equals `profile.figma.fileKey`.
  - Write the mapping to `.figmawp/migration/` as usual (so the real run can reuse it), but **don't** change `profile.json` and don't promote snapshots. Record `state.json` → `migration.rehearsals[]` with the file key, date and results.
  - Node ids differ in a duplicate, so look pages and frames up by **name**, not by id.
- `--mode copy|alias`: overrides `profile.tokens.migrationMode` (default `copy`).

Without `--file`, start a Figma session with `profile.figma.fileKey`. If a rehearsal exists in `state.json`, reuse its confirmed mapping and only ask about differences.

Ask the user which steps to run (via `/discovery`) if not specified: **Variables & type**, then optionally **Block naming** per page. Record progress in `.figmawp/state.json` → `migration` so the run can resume.

## Step 1: Variables & type

### 1a. Inventory (read-only)
With a read-only `use_figma` call, collect every local variable collection (modes, variables, types, values, aliases, scopes, code syntax, hidden-from-publishing) and every local text style (font, size, line height, bound variables). Also count, per page, how many layers are bound to each variable, and how many use raw values that match a token value. Read the theme's `theme.json` slugs and `profile.tokens.slugMap`.

### 1b. Propose a mapping
Build a mapping table:
| Existing | WP variable | Collection / mode | Value | Layers | Notes |
|---|---|---|---|---|---|
| `Palette/brand-1` | `color/brand-1` | WP Color | #1A5CFF | 212 | slug from theme |
| `Scale/pad-md`, `Scale/gap-md` | `spacing/40` | WP Spacing · Desktop 24 / Mobile 16 | | 340 | two sources, one slug |
| `text-lg` text style | `Text/lg`, size bound to `font-size/text-lg` | | | 88 | |

Rules:
- **Slugs follow `profile.tokens.slugStrategy`.**
  - `keep-theme` (any site with live content): WP variable names and Code syntax use the theme's **existing** slugs from `tokens.slugMap`. Example: `color/brand-1` with Code syntax `var(--wp--preset--color--brand-1)`, not `color/primary`. Nothing in the theme changes, and step 1e is skipped.
  - `wp-defaults` (new themes only): use WordPress default slugs (spacing 20–80, font-size small…xx-large).
- When several old variables map to one slug (e.g. a padding and a gap with the same value), merge them into one WP variable. If their values differ, flag it and ask.
- Items in `profile.tokens.unmapped` must each be decided: map to an existing slug, add a new slug (which also needs a theme.json addition, so note it for sync-to-dev), or leave unmigrated.
- If a partial "WP …" migration already exists in the file, inventory it, reuse what's correct, and list what's wrong (e.g. default slugs like `primary` that don't exist in the theme). Correct variables **in place** (rename, re-scope, fix Code syntax) instead of deleting and recreating, so existing bindings survive. Remove a stray WP variable only if no layer uses it, after asking.
- Mobile values: when `tokens.mobileFrames` is `"none"` or `"reference"` (or `false` in a version 1 profile), propose minimums from the existing `clamp()` values in theme.json, and mark them as proposals.
- Flag anything that doesn't fit (gradients, shadows, grain) as `custom.*` candidates with a Code syntax.

Present the table through `/discovery` and let the user adjust it. Save the confirmed map to `.figmawp/migration/variables-map.json`.

### 1c. Apply in Figma
In small `use_figma` batches (one collection at a time; rebinding one page, or for large pages one top-level frame, per call), reporting after each:
1. Create or repair `WP Color`, `WP Typography`, `WP Spacing` with the right modes. Keep any color modes the old collections had (e.g. Light/Dark), and map them to WP Color modes.
2. Create or correct the WP variables, with scopes and Code syntax per token-convention.md. How they get their values depends on `migrationMode`:
   - **`copy`** (default): write the **resolved value** for every mode, so the WP collections become the source of truth. When an old variable was an alias of another *migrated* variable (e.g. `radius-sm` → `padding-sm`), alias the WP variable to the matching WP variable, so the relationship is kept inside the WP collections. Aliases to variables that aren't being migrated are resolved to values.
   - **`alias`**: each WP variable aliases its old variable, and the old collections stay the source.
3. Create or correct text styles to match the mapping, binding font size and family to the WP variables.
4. **Rebind** every layer, page by page, from the old variables to the WP variables. This covers fills, strokes, effects, gaps, padding, radius, sizes, text style references, and variables bound inside components and their instances. Raw values that exactly match a token are rebound too, but only on approval. Report per page: rebound, skipped, and raw values left.
5. **Old collections** (`copy` mode): after verification passes (1d), hide them from publishing and rename them with a `zz-old/` prefix so they sort last. Deleting them is a separate, explicit request, made only after a check shows no layer still uses them. In `alias` mode, leave them untouched.

### 1d. Verify
Re-run the inventory and confirm:
- Every mapped WP token exists with the right scopes and Code syntax.
- Layers bound to old variables: **0**. List any leftovers with node ids and links.
- In `copy` mode, no WP variable aliases an old collection.
- Spot check: `get_screenshot` of 2–3 key frames before and after looks identical. Rebinding must not change appearance; any difference is a bug to report before going further.

Update `state.json` → `migration.variables = "done"` (or record the rehearsal result).

### 1e. Profile update (real run only)
After a successful real run (not a rehearsal):
- `profile.tokens.source = "wp-collections"`, `tokens.collections = ["WP Color", "WP Typography", "WP Spacing"]`, and move the old collection names to `tokens.ignoreCollections`.
- Rewrite `tokens.slugMap` keys to the WP variable names. Remove resolved items from `tokens.unmapped`.
- Take a fresh snapshot and promote it to `figma-latest.json` (values didn't change, only names and bindings, so the next sync-to-dev should show no token changes; if it does, investigate).
- Note any new slugs decided in 1b for the next `/figmawp:sync-to-dev`.

### 1f. Theme slug migration (optional, `wp-defaults` only)
Skip this with `keep-theme`. Otherwise, if slugs changed relative to the theme, write `.figmawp/migration/slug-map.json` and run `node PLUGIN/scripts/migrate-slugs.mjs <child-theme> .figmawp/migration/slug-map.json` (dry run), show the report, and run with `--write` only on a `figma-sync/<date>` branch after confirmation. Database commands in `slug-migration.sh` are for **local** only and only when the user asks.

## Step 2: Block naming (per page)
For each page the user selects:
1. Read the frames (read-only) and, for each, build the block tree using the inference table in block-naming.md. Keep existing `wp:` names as they are.
2. Show the proposed tree per frame (indented, with node ids) through `/discovery`. The user can accept, edit, or skip each frame.
3. On approval, rename the layers with `use_figma` (`node.name = "wp:…"`). Never change geometry, styles, or content.
4. Record `state.json` → `migration.blockNaming.<page> = "done"`, and add confirmed frame → file destinations to `profile.blocks.pathMap` (real run only).

## Finish
Summarize what changed in Figma (collections, variables, rebinds per page, renamed layers), the verification results, and what's pending. After a rehearsal, recommend reviewing the duplicate in Figma, then running `/figmawp:migrate` without `--file` on the real file. After a real run, suggest `/figmawp:sync-to-dev`.
