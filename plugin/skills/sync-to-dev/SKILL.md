---
name: sync-to-dev
description: Pull design changes from Figma into the WordPress child theme and companion blocks plugin. Snapshots Figma through the MCP, diffs against the last accepted snapshot, and writes tokens (theme.json), patterns, templates, parts, block styles, blocks and assets on a figma-sync/<date> branch, then checks the result in Safari on local dev. Use when the user says "sync from Figma", "pull Figma changes", "what changed in Figma", "dispatch design updates to dev", or runs /figmaWP:sync-to-dev.
---

# figmaWP: sync-to-dev

`PLUGIN` = the directory two levels above this skill's base directory. Read `PLUGIN/reference/guardrails.md`, `PLUGIN/reference/snapshot.md`, `PLUGIN/reference/token-convention.md`, and `PLUGIN/reference/block-naming.md`. Requires `.figmawp/profile.json` (find it with "Finding the project" in profile-schema.md), merged with `.figmawp/local.json`. The companion blocks plugin repo applies only when `blocksPlugin` isn't `null`.

Argument: `--diff-only` reports changes without writing (used by `/figmaWP:resume`).

## 1. Preflight
- Figma MCP responds; start a session with `figma.fileKey`. If it fails, hand off to `/figmaWP:bootstrap`.
- Both repos (child theme, blocks plugin) are on a clean working tree. If `state.lastSync.status == "awaiting-review"` and its branch is unmerged, ask (via `/discovery`) whether to continue on that branch or start a new one.

## 2. Snapshot and diff
1. Build a fresh snapshot (snapshot.md) to `.figmawp/snapshots/figma-<YYYY-MM-DD>.json`.
2. `node PLUGIN/scripts/snapshot-diff.mjs .figmawp/snapshots/figma-latest.json <new> --json`. No previous snapshot means everything is new.
3. Exit 0 (no changes): report "Figma unchanged since <date>" and stop.
4. Summarize the diff grouped by destination:
   - **Tokens** (variables, text styles) → `theme.json` / `styles/*.json`
   - **Components** → blocks in the companion plugin (or block styles in the child theme)
   - **Frames** → patterns, templates, parts
   - **Assets** → theme assets
   - **Warnings**: unbound raw values, unnamed layers in changed frames, unmapped frames or components

With `--diff-only`, stop here and return the summary.

## 3. Plan and confirm
Through `/discovery`, confirm:
- Which change groups to apply now.
- Destinations for unmapped frames and components (save the answers to `profile.blocks.pathMap` / `componentMap`).
- For changed frames with unnamed layers: run the infer → confirm → rename flow from block-naming.md (renaming in Figma is allowed here because it's naming, not design).
- Anything that would need a parent theme change: write `.figmawp/notes/parent-<date>.md` instead.

## 4. Branch
In each repo that will change: `git switch -c figma-sync/<YYYY-MM-DD>` (append `-2`, `-3` if it exists). Never commit to the default branch.

## 5. Apply, by group
**Tokens**: build a theme.json fragment from the snapshot's variables and text styles (a partial theme.json with only the presets and custom values Figma owns), preview with `merge-theme-json.mjs`, then `--write`.
- Resolve every variable to a slug through `profile.tokens.slugMap`, reading the collections in `tokens.collections`. A variable that isn't in the map is reported as "unmapped" and asked about. Never invent a slug.
- With `slugStrategy: "keep-theme"`, only **values** change. A slug rename or removal is never part of a sync. If Figma renamed a variable, update `slugMap` (after asking) and keep the theme slug.
- With `wp-defaults`, renamed or removed slugs go through `migrate-slugs.mjs` (dry run, then `--write`) per token-convention.md.
- If `tokens.docs` lists mapping docs (e.g. `docs/design-tokens.md`), update their tables on the same branch so they stay accurate.

**Frames → patterns, templates, parts**: generate block markup from the `wp:` tree and bindings (block-naming.md). Use preset references (`var:preset|…`, `textColor`, `fontSize`), never raw values. Follow the profile's pattern header convention. Reuse the parent theme's blocks and patterns where the tree names them. Preserve any hand-written content outside the regenerated block ranges; if a file diverged from the last generation, show a diff and ask.

**Components → blocks**: if `blocksPlugin` is `null`, first try to express the component with existing blocks (core, the parent's blocks plugin, or child theme blocks) as a pattern plus block styles or variations in the child theme. If it truly needs a new block, use the default destination recorded at bootstrap: register it in the child theme (`inc/blocks/<name>/`), or write `.figmawp/notes/parent-blocks-<date>.md` as an issue draft. Ask if no default was recorded. Otherwise, for an existing mapped block, update `block.json` attributes/supports, styles, and render template to match the component's props and bindings. For a new component, scaffold a block in `blocksPlugin.blocksDir` following the conventions of existing blocks in that plugin (copy the structure of the closest existing block). Run `blocksPlugin.build` if one is defined.

**Assets**: export through the Figma MCP (`download_assets` / `get_screenshot`, SVG preferred for icons), optimize SVGs (strip metadata and fixed sizes; keep `viewBox`), and write to `theme.assets`.

## 6. Verify on local
1. If wp-cli is available: `wp theme status`, and `wp eval 'echo wp_get_global_stylesheet();' --path=<wp root>` to confirm presets compile.
2. Safari MCP: open each affected local URL (template → its page, pattern → a preview page if one exists, else note it). Screenshot at desktop (1440) and mobile (390), and compare with `get_screenshot` of the matching Figma frame. List visible mismatches.
3. Fix obvious generation errors; report the rest.

## 7. Record
- Promote the new snapshot: copy it to `figma-latest.json`; keep the last 5 dated snapshots.
- Update `state.json` → `lastSync` with `status: "awaiting-review"`, the branch, and the repos changed.
- Stage nothing and commit nothing unless the user asks. Show `git status` and `git diff --stat` per repo.

## Finish
Report per repo: branch, files changed by group, verification results, warnings, and parent theme notes written. Suggest reviewing the branch, then `/figmaWP:sync-to-figma local` after merging.
