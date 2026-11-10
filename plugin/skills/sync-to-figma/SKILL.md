---
name: sync-to-figma
description: Check a WordPress environment (local, staging, or production) for drift from the Figma design and report it back to Figma as Dev Mode annotations, plus a REST comment when FIGMA_TOKEN is set. Never changes designs. Local is inspected through files, wp-cli and Safari; staging and production through Safari only, read-only. Use when the user says "check for drift", "what changed on staging", "send dev changes back to Figma", "does the site match Figma", or runs /figmaWP:sync-to-figma.
---

# figmaWP: sync-to-figma

`PLUGIN` = the directory two levels above this skill's base directory. Read `PLUGIN/reference/guardrails.md` and `PLUGIN/reference/snapshot.md`. Requires `.figmawp/profile.json` (find it with "Finding the project" in profile-schema.md) merged with `.figmawp/local.json`. Map dev token values back to Figma variables through `profile.tokens.slugMap`.

Argument: the environment name, `local` (default), `staging`, or `production`. Add `--report-only` to write the drift report without touching Figma (used by `/figmaWP:resume`).

**Figma leads.** This skill reports. It never edits designs, variable values, or styles.

## 1. Preflight
- The environment exists in `profile.environments`. Staging and production are **read-only via Safari**: no wp-cli, no SSH, no logins that change state, no form submissions.
- The Safari MCP responds (otherwise hand off to `/figmaWP:bootstrap`). Start a Figma session with `figma.fileKey`.
- Load `.figmawp/snapshots/figma-latest.json` as the design baseline. If it's missing, take a snapshot now.

## 2. Collect dev state
**Tokens**
- local: read the child theme's `theme.json` and `styles/*.json`, plus `wp eval 'echo wp_json_encode(wp_get_global_settings());'` to catch Site Editor overrides stored in the database (`wp_global_styles`).
- staging/production: in Safari, read `:root` computed custom properties (`--wp--preset--*`, `--wp--custom--*`, `--wp--style--global--*`) from the home page.

**Rendered pages**: for each frame in `profile.blocks.pathMap` with a URL-resolvable destination (templates → a page using them; patterns → a page known to include them, if recorded), use Safari to:
- Screenshot at 1440 and 390 widths.
- Read the block structure from the DOM (`.wp-block-*` classes, `is-layout-*`, `has-*-color`, `has-*-font-size`) and the computed styles of key elements.

**Code changes not from Figma** (local only): `git log` on both repos since `state.lastSync.at`, excluding `figma-sync/*` merge commits, to explain *why* something drifted.

## 3. Compare
Map dev state back onto Figma terms and classify each difference:
| Kind | Example |
|---|---|
| Token value | `--wp--preset--color--primary` is `#0044cc` on staging; Figma `color/primary` is `#0055ff` |
| Token added/removed | Palette has `tertiary`, which isn't in Figma |
| Structure | The template has an extra `wp:buttons` under the hero's `wp:group` |
| Styling | The heading uses `font-size: large`; Figma binds `font-size/x-large` |
| Content-only | Copy or image changed (report it, low priority) |

Ignore expected differences: real content versus placeholder copy, admin bar, cookie banners. Note uncertain matches as "verify".

## 4. Report
1. Write `.figmawp/drift/<env>-<YYYY-MM-DD>.md`: a summary table, then each item with the Figma node id, dev evidence (URL, selector, value, screenshot reference), and the likely cause (commit or Site Editor change).
2. Unless `--report-only`, for each drift item:
   - **Annotation** (always): with `use_figma` (load `/figma-use` first), add a Dev Mode annotation on the node, labelled `Dev drift · <env> · <date>`, giving what differs, the dev value, and the source. Use an annotation category named "Dev drift" (create it if missing). Replace earlier figmaWP drift annotations on the same node rather than stacking them.
   - **Comment** (only if `FIGMA_TOKEN` is set): `node PLUGIN/scripts/figma-comment.mjs <fileKey> <nodeId> -` with the same message on stdin. Exit 3 means there's no token, which is fine.
3. Update `state.json` → `lastDrift.<env>` and `openDrift` (drop items that no longer reproduce, and remove their annotations).

## Finish
Report the counts by kind, the top items, the report path, and whether comments were posted. Remind the user that adopting a dev change means a designer updates Figma, then `/figmaWP:sync-to-dev` brings it back through the normal path.
