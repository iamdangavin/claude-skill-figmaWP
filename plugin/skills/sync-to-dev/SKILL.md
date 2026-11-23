---
name: sync-to-dev
description: Pull design changes from Figma into the WordPress child theme and companion blocks plugin, for the whole file or only the Figma URLs, node ids or frame names given. Snapshots Figma through the MCP, diffs against the last accepted snapshot, and writes tokens (theme.json), patterns, templates, parts, block styles, blocks and assets on a figma-sync/<date> branch; swapped, re-graded or re-cropped images are exported the way the project chose, encoded, and set on their blocks through a build script. Then checks the result on local. Use when the user says "sync from Figma", "pull Figma changes", "what changed in Figma", "the header photos changed", "sync this frame", pastes a Figma link to bring over, or runs /figmawp:sync-to-dev.
---

# figmaWP: sync-to-dev

`PLUGIN` = the directory two levels above this skill's base directory. Read `PLUGIN/reference/guardrails.md`, `PLUGIN/reference/snapshot.md`, `PLUGIN/reference/token-convention.md`, and `PLUGIN/reference/block-naming.md`; read `PLUGIN/reference/image-pipeline.md` when the diff has images. Requires `.figmawp/profile.json` (find it with "Finding the project" in profile-schema.md), merged with `.figmawp/local.json`. The companion blocks plugin repo applies only when `blocksPlugin` isn't `null`.

Arguments:
- **Scope** (optional, any number): Figma URLs (`figma.com/design/<fileKey>/…?node-id=12-34`; the fileKey must match the profile, and `-` in node-id becomes `:`), node ids (`12:34`), or frame or page names (`"Header / Incentives"`, `"Templates"`). No scope = the whole file.
- `--diff-only` reports changes without writing (used by `/figmawp:resume`).

The scope label for branch and report names is a short kebab-case summary of what was asked (`heroes`, `contact-form`, or the single frame's name), confirmed with the plan.

## 1. Preflight
- Figma MCP responds; start a session with `figma.fileKey`. If it fails, hand off to `/figmawp:bootstrap`.
- Both repos (child theme, blocks plugin) are on a clean working tree. If `state.lastSync.status == "awaiting-review"` and its branch is unmerged, ask (via `/discovery`) whether to continue on that branch or start a new one.

## 2. Snapshot and diff
1. **Whole file:** build a fresh snapshot (snapshot.md) to `.figmawp/snapshots/figma-<YYYY-MM-DD>.json`.
   **Scoped:** resolve each argument to node ids (a name may match several frames: list them and ask which), then snapshot only those subtrees plus the variables and text styles they use, with `"scope": [ids]`, to `.figmawp/snapshots/figma-<YYYY-MM-DD>-<scope>.json`.
   Either way include the `images` section (snapshot.md).
2. `node PLUGIN/scripts/snapshot-diff.mjs .figmawp/snapshots/figma-latest.json <new> --json`, adding `--scope` for a scoped snapshot. No previous snapshot means everything is new.
3. Exit 0 (no changes): report "Figma unchanged since <date>" (or "… in <scope>") and stop.
4. Summarize the diff grouped by destination:
   - **Tokens** (variables, text styles) → `theme.json` / `styles/*.json`
   - **Components** → blocks in the companion plugin (or block styles in the child theme)
   - **Frames** → patterns, templates, parts
   - **Assets** → theme assets
   - **Images** → photos swapped, re-graded or re-cropped, with their WordPress destination from `profile.images.map` (or "unmapped")
   - **Warnings**: unbound raw values, unnamed layers in changed frames, unmapped frames or components

With `--diff-only`, stop here and return the summary.

## 3. Plan and confirm
Through `/discovery`, confirm:
- Which change groups to apply now.
- Destinations for unmapped frames and components (save the answers to `profile.blocks.pathMap` / `componentMap`).
- Destinations and file names for unmapped images (image-pipeline.md step 0; save to `profile.images.map`).
- For changed frames with unnamed layers: run the infer → confirm → rename flow from block-naming.md (renaming in Figma is allowed here because it's naming, not design).
- Anything that would need a parent theme change: write `.figmawp/notes/parent-<date>.md` instead.

## 4. Branch
Follow `git.branching`. With `"figma-sync"` (default): in each repo that will change, `git switch -c figma-sync/<YYYY-MM-DD>` for a whole-file sync or `figma-sync/<YYYY-MM-DD>-<scope>` for a scoped one (append `-2`, `-3` if it exists). With `"current"`: stay on the current branch, unless it's the default branch, then ask. Never commit to the default branch.

## 5. Apply, by group
**Tokens**: build a theme.json fragment from the snapshot's variables and text styles (a partial theme.json with only the presets and custom values Figma owns), preview with `merge-theme-json.mjs`, then `--write`.
- Resolve every variable to a slug through `profile.tokens.slugMap`, reading the collections in `tokens.collections`. A variable that isn't in the map is reported as "unmapped" and asked about. Never invent a slug.
- With `slugStrategy: "keep-theme"`, only **values** change. A slug rename or removal is never part of a sync. If Figma renamed a variable, update `slugMap` (after asking) and keep the theme slug.
- With `wp-defaults`, renamed or removed slugs go through `migrate-slugs.mjs` (dry run, then `--write`) per token-convention.md.
- If `tokens.docs` lists mapping docs (e.g. `docs/design-tokens.md`), update their tables on the same branch so they stay accurate.

**Frames → patterns, templates, parts**: generate block markup from the `wp:` tree and bindings (block-naming.md). Use preset references (`var:preset|…`, `textColor`, `fontSize`), never raw values. Follow the profile's pattern header convention. Reuse the parent theme's blocks and patterns where the tree names them. Preserve any hand-written content outside the regenerated block ranges; if a file diverged from the last generation, show a diff and ask.

**Components → blocks**: if `blocksPlugin` is `null`, first try to express the component with existing blocks (core, the parent's blocks plugin, or child theme blocks) as a pattern plus block styles or variations in the child theme. If it truly needs a new block, use the default destination recorded at bootstrap: register it in the child theme (`inc/blocks/<name>/`), or write `.figmawp/notes/parent-blocks-<date>.md` as an issue draft. Ask if no default was recorded. Otherwise, for an existing mapped block, update `block.json` attributes/supports, styles, and render template to match the component's props and bindings. For a new component, scaffold a block in `blocksPlugin.blocksDir` following the conventions of existing blocks in that plugin (copy the structure of the closest existing block). Run `blocksPlugin.build` if one is defined.

**Images**: run `PLUGIN/reference/image-pipeline.md` for each changed or added image: export (per `images.export`: the fill alone or the layer as designed), `encode-images.mjs`, then a build script from `PLUGIN/php/set-block-image.php` run on local (dry, then real). Images used in theme files are copied into the theme instead. A removed image is reported, never deleted from the Media Library.

**Assets**: export through the Figma MCP (`download_assets` / `get_screenshot`, SVG preferred for icons), optimize SVGs (strip metadata and fixed sizes; keep `viewBox`), and write to `theme.assets`.

## 6. Verify on local
1. If wp-cli is available: `wp theme status`, and `wp eval 'echo wp_get_global_stylesheet();' --path=<wp root>` to confirm presets compile. Flush the pattern cache if patterns changed (`wp eval 'wp_get_theme()->delete_pattern_cache();'`).
2. Playwright when it's installed (headless, more reliable; load it with `createRequire` from the global `node_modules` if it isn't local), else Safari MCP: open each affected local URL (template → its page, pattern → a preview page if one exists, else note it). Screenshot at `tokens.viewport.max` and `tokens.viewport.min`, and compare with `get_screenshot` of the matching Figma frame (and of its small-screen pair from `blocks.mobilePairs`, when there is one). List visible mismatches.
3. Fix obvious generation errors; report the rest.

## 7. Record
- Promote the new snapshot. Whole file: copy it to `figma-latest.json`. Scoped: `node PLUGIN/scripts/snapshot-diff.mjs .figmawp/snapshots/figma-latest.json <scoped> --merge .figmawp/snapshots/figma-latest.json`, so only the scoped keys change. Keep the last 5 dated snapshots.
- Update `state.json` → `lastSync` with `status: "awaiting-review"`, the branch, the scope (if any) and the repos changed; `images` for each image set; and add any build script written to `pendingContent` for every environment with `push` or `push-guarded` access.
- Follow `git.agentCommits` (default: stage and commit nothing). Show `git status` and `git diff --stat` per repo.

## Finish
Report per repo: branch, files changed by group, images set (page, file, size), build scripts written, verification results, warnings, and parent theme notes written. Suggest reviewing the branch, then `/figmawp:push --staging` once it's committed (it runs the pending build scripts there too), and `/figmawp:sync-to-figma local` after merging.
