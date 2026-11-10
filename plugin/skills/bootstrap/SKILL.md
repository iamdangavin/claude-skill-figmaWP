---
name: bootstrap
description: Set up a WordPress block child theme for the figmaWP Figma ⇄ WordPress workflow. Connects and checks the Figma MCP and Safari MCP, detects local dev (MAMP PRO, wp-cli), records staging/production URLs, analyzes the child theme, its parent theme and the block plugins, interviews the user with /discovery, and writes .figmawp/profile.json. Use when the user says "bootstrap figmaWP", "set up figma sync", "connect Figma to this theme", or when another figmaWP skill finds no profile or a failing connection.
---

# figmaWP: bootstrap

`PLUGIN` = the directory two levels above this skill's base directory. Read `PLUGIN/reference/guardrails.md` and `PLUGIN/reference/profile-schema.md` before starting. Re-running bootstrap is safe: it repairs connections and updates the profile, keeping existing answers unless the user changes them.

Track progress with a checklist and report each phase in one line as you finish it.

## Phase 0: Prerequisites
1. Confirm the `/discovery` skill is available. If it is not, stop: tell the user to run `figmawp install` and restart Claude Code.
2. Find the **child theme root** using "Finding the project" in profile-schema.md. Sessions usually start in the WordPress root, so search `wp-content/themes/*/` before asking. Only if nothing matches, ask (via /discovery) for the path. It must be a git repo; if not, stop and say so. Record the WordPress root for wp-cli.
3. If `.figmawp/profile.json` exists, load it and treat this run as a repair/update.

## Phase 1: Connections (facts, check before asking)
Run checks yourself; only ask the user for things you cannot detect.

| Check | How | If failing |
|---|---|---|
| Figma MCP | Call `mcp__claude_ai_Figma__whoami` (or any Figma tool) | Tell the user to connect the Figma connector in claude.ai Settings → Connectors (or `/mcp`), then re-run |
| Safari MCP | Already loaded in this session? (Safari tools are available.) Otherwise check `claude mcp list` and the `mcpServers` of this project and the WordPress root in `~/.claude.json` (local scope), plus `.mcp.json` in the child theme | Add it only if it's configured nowhere (below) |
| Safari remote automation | `safaridriver --enable` requires the user's password: ask them to run `! sudo safaridriver --enable` and enable Safari → Settings → Advanced → "Show features for web developers", then Develop → "Allow Remote Automation" | Wait for confirmation |
| wp-cli | `wp --version` | Note it; local checks fall back to files + Safari |
| Local site | Read `wp-config.php` above the theme (`../../../wp-config.php`) for `WP_HOME`/`WP_SITEURL`; else `wp option get home --path=<wp root>`; check MAMP PRO hosts in `~/Library/Application Support/appsolute/MAMP PRO/` if present | Ask for the local URL |

If Safari MCP is already configured in local or user scope, leave it there and don't add a duplicate. Mention that adding it to the theme's `.mcp.json` would share it with teammates, and do it only if the user wants that. When it's configured nowhere, add it to the **child theme repo's** `.mcp.json` (project scope, so teammates get it):
```json
{ "mcpServers": { "safari-mcp": { "type": "stdio", "command": "/usr/bin/safaridriver", "args": ["--mcp"] } } }
```
Merge into an existing file; never drop other servers. Tell the user a restart is needed for new MCP servers to load.

## Phase 2: Repos
1. Child theme repo: `git -C <child> rev-parse --show-toplevel`, default branch, clean status.
2. Companion blocks plugin: look in `wp-content/plugins/` for a plugin other than the parent theme's blocks plugin whose name matches the site (e.g. `<site>-blocks`) or that registers blocks (`block.json` files). Record its path, namespace (from `block.json` `name` prefix), blocks dir, and build command (`package.json` scripts). Confirm it's a separate git repo. **If there's none, set `blocksPlugin: null`.** That's normal. Also note whether the child theme registers its own blocks or block variations (editor scripts that register block variations or settings, `register_block_type` in `functions.php` or includes).
3. Parent theme: read its slug from the child's `style.css` `Template:` header and record its path in `parentReference.path`. If the parent ships a blocks plugin (e.g. `<parent>-blocks` in `wp-content/plugins/`), record it in `parentReference.blocksPlugin` with its namespace. Both are **read-only references**. Never write to them.

## Phase 3: Theme analysis (facts)
Dispatch an Explore subagent to analyze, and report back (do not ask the user what you can read):
- **Existing project knowledge first.** Read any that exist, in both the child theme and the WordPress root: `README.md`, `CLAUDE.md`, docs folders, and Markdown files about design tokens, plans, status or handoff (find them by name or by mentions of Figma, tokens or theme.json); and the Claude project memory for this project (`~/.claude/projects/<path with / replaced by ->/memory/`, for both the WordPress root and the theme path). Extract the Figma file URL and page and frame ids, the Figma collection names, the Figma → slug mapping, the breakpoints and viewport, known exceptions, and any "ignore X" instructions. **These answers are already decided. Don't ask them again; present them for confirmation.**
- `theme.json`: version, palette/font/spacing slugs, custom values, and whether its slugs match the WP defaults in `PLUGIN/reference/token-convention.md` or are custom slugs (custom slugs mean `slugStrategy: "keep-theme"`).
- Figma file (read-only, through the MCP): the variable collections present, and whether the "WP …" collections exist and are complete, so you can set `tokens.source`.
- `styles/*.json` variations, `templates/*.html`, `parts/*.html`, `patterns/*.php` (header format), `block-styles.js`, `functions.php` registrations, asset folders.
- Blocks plugin: each block's `block.json` (name, attributes, supports), render method (`render.php` vs save), build tooling.
- Parent theme and its blocks plugin: which blocks/patterns/features the parent provides that the child should reuse rather than duplicate.

## Phase 4: Interview with /discovery
Invoke the `discovery` skill with a brief containing the analysis summary and these open decisions (skip any already in the profile):
- Figma file URL for this site (→ `figma.fileKey`), and which pages hold tokens, components, templates. (Usually already in the docs, so confirm it.)
- Token source and slug strategy. If the theme has live content and custom slugs, recommend `own-collections` or `wp-collections` as found, with `slugStrategy: "keep-theme"`. Build `tokens.slugMap` from the docs' mapping table and confirm it. Offer `/figmaWP:migrate` only if the user wants the Figma file moved onto the WP collections, and say that it will keep the theme's slugs.
- Breakpoints: viewport min and max, and whether mobile frames exist (`tokens.mobileFrames`).
- Where new custom blocks go: the companion plugin if there is one. With `blocksPlugin: null`, choose a default: prefer a pattern plus block styles or variations in the child theme, register a block in the child theme (`inc/blocks/`), or write an issue draft for the parent's blocks plugin.
- Mapping existing Figma components → existing blocks (`blocks.componentMap`); propose pairs by name and structure.
- Mapping Figma template/pattern frames → files (`blocks.pathMap`).
- Pattern header conventions, block style conventions, asset folders and SVG handling.
- Staging and production URLs (stored read-only).
- Anything theme-specific the analysis surfaced (e.g. parent theme features the child must use).

## Phase 5: Write
1. Write `.figmawp/profile.json` (schema in profile-schema.md), `.figmawp/state.json` (empty state), and `.figmawp/local.json` for machine-specific values (local URL, absolute paths).
2. Add `.figmawp/local.json` to the child theme `.gitignore`.
3. **Baseline snapshot.** Take a Figma snapshot (`PLUGIN/reference/snapshot.md`). Ask whether the current theme already matches Figma. Recommend "yes" when the theme has substantial templates and patterns and recent commits reference Figma (e.g. commit messages that mention Figma). Ask about specific frames that are known to be unfinished.
   - Yes: save it as `.figmawp/snapshots/figma-latest.json`, so the first sync only picks up changes made after today.
   - No: leave it absent, so the first `/figmaWP:sync-to-dev` treats everything as new (suitable for a fresh theme).
   - Partly: save the baseline but drop the frames the user names, so only those come through as new.
4. Do not commit. Show `git status` and suggest committing `.figmawp/` and `.mcp.json` on a branch.

## Finish
Summarize: connections (✓/✗), repos found, profile highlights, and the recommended next command (`/figmaWP:migrate` if the Figma file isn't on the convention, else `/figmaWP:sync-to-dev`).
