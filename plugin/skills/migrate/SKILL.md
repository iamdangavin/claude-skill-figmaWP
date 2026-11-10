---
name: migrate
description: Migrate a Figma file onto the figmaWP WordPress conventions. Step 1 maps existing variables and text styles to the WP Color / WP Typography / WP Spacing collections and theme.json slugs (map, confirm, then remap, keeping old variables). Step 2 optionally names frames' layers with wp: block names using infer-then-confirm. Use when the user says "migrate the Figma file", "convert our variables to WordPress", "this file doesn't use the WP plugin", or "name the blocks in Figma".
---

# figmaWP: migrate

`PLUGIN` = the directory two levels above this skill's base directory. Read `PLUGIN/reference/guardrails.md`, `PLUGIN/reference/token-convention.md`, and `PLUGIN/reference/block-naming.md` first. Requires `.figmawp/profile.json`; if missing, run `/figmaWP:bootstrap` first.

This skill **writes to Figma**, so every change is previewed and confirmed. Load `/figma-use` guidance before any `use_figma` call. Start a Figma session with the profile's `figma.fileKey`.

Ask the user which steps to run (via `/discovery`) if not specified: **Variables & type**, then optionally **Block naming** per page. Record progress in `.figmawp/state.json` → `migration` so the run can resume.

## Step 1: Variables & type

### 1a. Inventory (read-only)
With a read-only `use_figma` call, collect every local variable collection (modes, variables, types, values, aliases, scopes, code syntax, hidden-from-publishing) and every local text style (font, size, line height, bound variables). Also read the theme's `theme.json` slugs so the mapping respects slugs already used in content.

### 1b. Propose a mapping
Build a mapping table to the convention:
| Existing | Proposed WP variable | Collection / mode | Notes |
|---|---|---|---|
| `Brand/Teal/400` | `color/primary` (alias → Brand/Teal/400) | WP Color | |
| `Spacing/md` (24) | `spacing/50` | WP Spacing Desktop; Mobile 16 | slug 50 = medium |
| `H2` text style | `Heading/H2`, size bound to `font-size/x-large` | | |

Rules:
- WP variables **alias** existing brand variables where possible (`color/primary` → `Brand/Teal/400`), so the brand system stays intact.
- **Slugs follow `profile.tokens.slugStrategy`.**
  - `keep-theme` (any site with live content): WP variable names and Code syntax use the theme's **existing** slugs, from `tokens.slugMap` and the docs in `tokens.docs`. Example: `color/brand-1` with Code syntax `var(--wp--preset--color--brand-1)`, not `color/primary`. Nothing in the theme changes, and step 1e is skipped.
  - `wp-defaults` (new themes only): use WordPress default slugs (spacing 20–80, font-size small…xx-large).
- If a partial "WP …" migration already exists in the file, inventory it, reuse what's correct, and show what's missing or wrong. Don't start over.
- Mobile values: when `tokens.mobileFrames` is false, propose minimums from the existing `clamp()` values in theme.json, and mark them as proposals.
- Flag anything that doesn't fit (gradients, shadows) as `custom.*` candidates with a Code syntax.

Present the table through `/discovery` and let the user adjust it. Save the confirmed map to `.figmawp/migration/variables-map.json`, and update `profile.tokens.slugMap` so it points at the new WP variable names.

### 1c. Apply in Figma
In small `use_figma` batches (one collection at a time), and report after each:
1. Create or repair `WP Color`, `WP Typography`, `WP Spacing` with the right modes (never overwrite values that already exist in WP collections).
2. Create the WP variables with confirmed values or aliases, scopes, and Code syntax per token-convention.md.
3. Rename or create text styles `Body`, `Heading/H1…H6`; bind font size and family to the WP variables.
4. **Rebind** layers that used old variables or raw values to the new WP variables, page by page. Report the counts per page.
5. Keep old variables. Offer to hide them from publishing; deleting them is a separate, explicit request.

### 1d. Verify
Re-run the inventory: every WP token present, scopes and code syntax set, and no layers still bound to old variables (list any leftovers). Update `state.json` → `migration.variables = "done"`.

### 1e. Theme side (optional, `wp-defaults` only)
Skip this with `keep-theme`. Otherwise, if slugs changed relative to the theme, write `.figmawp/migration/slug-map.json` and run `node PLUGIN/scripts/migrate-slugs.mjs <child-theme> .figmawp/migration/slug-map.json` (dry run), show the report, and run with `--write` only on a `figma-sync/<date>` branch after confirmation. Database commands in `slug-migration.sh` are for **local** only and only when the user asks.

## Step 2: Block naming (per page)
For each page the user selects:
1. Read the frames (read-only) and, for each, build the block tree using the inference table in block-naming.md. Keep existing `wp:` names as they are.
2. Show the proposed tree per frame (indented, with node ids) through `/discovery`. The user can accept, edit, or skip each frame.
3. On approval, rename the layers with `use_figma` (`node.name = "wp:…"`). Never change geometry, styles, or content.
4. Record `state.json` → `migration.blockNaming.<page> = "done"`, and add confirmed frame → file destinations to `profile.blocks.pathMap`.

## Finish
Summarize what changed in Figma (collections, variables, rebinds, renamed layers), what's pending, and suggest `/figmaWP:sync-to-dev`.
