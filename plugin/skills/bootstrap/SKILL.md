---
name: bootstrap
description: Set up a WordPress block child theme for the figmaWP Figma ⇄ WordPress workflow. Connects and checks the Figma MCP and Safari MCP, detects local dev (MAMP, Local, DDEV…, wp-cli), records staging/production URLs, analyzes the child theme, its parent theme and the block plugins, interviews the user with /discovery, and writes .figmawp/profile.json. Use when the user says "bootstrap figmaWP", "set up figma sync", "connect Figma to this theme", or when another figmaWP skill finds no profile or a failing connection.
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
| Local site | `wp option get home --path=<wp root>`; else `wp config get WP_HOME` (a URL, not a secret); check the local server app's host list if one is installed (MAMP PRO, Local, Valet, DDEV…). Never read other `wp-config.php` values | Ask for the local URL |
| Local wp-cli command | If plain `wp` fails (wrong PHP, no database socket), look for the local server app's bundled PHP and wp-cli (e.g. MAMP: `PATH=/Applications/MAMP/bin/php/<newest>/bin:$PATH /Applications/MAMP/Library/bin/wp`; Local, DDEV and Lando have their own shells) and save the working command as `environments.local.wp` in `local.json` | Note it |
| SSH aliases (staging, production) | For each alias the user names: `ssh -o BatchMode=yes -o ConnectTimeout=10 <alias> true`. **Never read `~/.ssh/config` or keys**; only run the alias. Then find `wpRoot` (below) | Show the README's sample `~/.ssh/config` block and ask the user to add the alias themselves |
| Server WordPress folder (`wpRoot`) | Never guessed from a naming pattern, since one server often hosts several sites. Over the alias, list candidates: `find ~ -maxdepth 4 -name wp-config.php -not -path '*/.*' 2>/dev/null` (also `/var/www` and `/srv` when readable). For each, `cd <dir> && wp option get home`. The one whose host matches the environment's URL is `wpRoot`; show it for confirmation. None or several matches: show the list and ask. Also record whether the server's wp-cli works there (`wp core version`) | Ask for the path |
| Encoder for the chosen image format | After Phase 4 sets `images.format`/`encoder`: run the encoder's `--version`, and on each server `wp eval 'echo wp_image_editor_supports(["mime_type"=>"image/<format>"]) ? "yes" : "no";'` | Suggest installing the tool, another format, or `encoder: null` |
| Playwright | `npx playwright --version` in the theme, or a global install (`npm root -g`/playwright) | Note it; verification falls back to Safari |

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
- Token source and slug strategy. If the theme has live content and custom slugs, recommend `own-collections` or `wp-collections` as found, with `slugStrategy: "keep-theme"`. Build `tokens.slugMap` from the docs' mapping table and confirm it. Offer `/figmawp:migrate` only if the user wants the Figma file moved onto the WP collections, and say that it will keep the theme's slugs.
- **Viewport and small-screen designs.** Before asking, read the frames on the template pages: group top-level frames by width (e.g. 1440 ×14, 375 ×3) and pair small frames with desktop ones by name and page. Then ask:
  - `tokens.viewport`: the widest and narrowest design widths (propose the widths found; the narrowest frame, or the theme's existing `clamp()` minimum when there are no small frames).
  - `tokens.mobileFrames`: `"none"`, `"reference"` or `"source"` (profile-schema.md). Explain the trade-off with what was found: most files build desktop frames with auto-layout so they're fluid, and a resized or separate mobile frame often breaks or goes stale, so small frames are usually a **reference** (visual target for checks), not a **source** of separate rules. Recommend `"source"` only when the small frames are complete, current and maintained alongside desktop.
  - `blocks.mobilePairs`: confirm the desktop → small-frame pairs found (skip with `"none"`).
- Where new custom blocks go: the companion plugin if there is one. With `blocksPlugin: null`, choose a default: prefer a pattern plus block styles or variations in the child theme, register a block in the child theme (`inc/blocks/`), or write an issue draft for the parent's blocks plugin.
- Mapping existing Figma components → existing blocks (`blocks.componentMap`); propose pairs by name and structure.
- Mapping Figma template/pattern frames → files (`blocks.pathMap`).
- Pattern header conventions, block style conventions, asset folders and SVG handling.
- Staging and production URLs, and for each: whether figmaWP may push there (`access`: `push` for staging, `push-guarded` for production, or `read-only`) and the `~/.ssh/config` **alias** (never a host, user or key; if the user has none yet, show the README sample and let them add it). Then test the alias and find `wpRoot` (Phase 1 rows) and confirm the folder found, and where backups go on that server (`backups`, default `~/figmawp-backups`).
- Push settings: whether to push the child theme, which plugins to push (the companion blocks plugin is the usual one), and excludes. Propose excludes from **what is actually in the repo**: list top-level folders and files that look like docs, design sources, image masters, build sources or editor project files, and let the user pick; `.git/` and `/.figmawp/` are always excluded. Propose `afterPush` from what the site uses: `wp cache flush`; the pattern cache flush only if the theme has a `patterns/` folder; a caching plugin's purge command if one is active on the server (`wp plugin list --status=active` over the alias).
- **Images** (skip if the Figma frames have no image fills that end up in WordPress). Read any image docs in the project first and present their answers for confirmation. Ask, showing 2–3 real image nodes from the file as examples (their fills, effects and where they appear):
  - `images.export`: should WordPress get **just the photo** (`"fill"`) with the theme recreating overlays/effects in CSS, or the **layer as designed** (`"node"`) with everything baked in? Look at the theme CSS for overlay, gradient, grain or duotone rules to inform the recommendation.
  - `images.dropFills`: with `"fill"`, which other fill types on image layers the theme recreates (only list types actually found on image layers in the file). Default: none.
  - `images.format` and `encoder`: propose from what the theme already serves (look at existing uploads and theme assets: `.avif`, `.webp`, `.jpg`) and what the server's image editor supports.
  - `images.scale` and `maxDimension`: propose from the widest rendered image size in the designs × the scale needed for high-density screens, capped near WordPress's 2560 px big-image threshold.
  - `images.originals` (keep full-size masters in the repo, gitignored, or not at all) and `compressed`.
  - `images.blockDefaults`: per block type the site uses for images (Cover overlay/dim and focal point, Image size), proposed from existing blocks in the content.
- Project habits: does the agent ever commit (`git.agentCommits`, recommend `false`), branch per sync or work on the current branch (`git.branching`), and may it author Figma components/frames/prototypes after a plan is approved (`figma.agentEdits`)?
- Anything theme-specific the analysis surfaced (e.g. parent theme features the child must use).

## Phase 5: Write
1. Write `.figmawp/profile.json` (schema version 2, profile-schema.md), `.figmawp/state.json` (empty state), and `.figmawp/local.json` for machine-specific values (local URL, `wpRoot`, `wp` command, and any per-machine `ssh` aliases). On a repair of a version 1 profile, add the new keys and set `schemaVersion: 2`, keeping every existing answer.
2. Add `.figmawp/local.json` and the image originals folder to the child theme `.gitignore`.
3. **Baseline snapshot.** Take a Figma snapshot (`PLUGIN/reference/snapshot.md`). Ask whether the current theme already matches Figma. Recommend "yes" when the theme has substantial templates and patterns and recent commits reference Figma (e.g. commit messages that mention Figma). Ask about specific frames that are known to be unfinished.
   - Yes: save it as `.figmawp/snapshots/figma-latest.json`, so the first sync only picks up changes made after today.
   - No: leave it absent, so the first `/figmawp:sync-to-dev` treats everything as new (suitable for a fresh theme).
   - Partly: save the baseline but drop the frames the user names, so only those come through as new.
4. Don't edit any other files. If existing docs are out of date (wrong paths, stale mappings), list the fixes in the summary and offer to make them. Never change them silently.
5. Follow `git.agentCommits` (default: don't commit). Show `git status` and suggest committing `.figmawp/` and `.mcp.json` on a branch.

## Finish
Summarize: connections (✓/✗, including each SSH alias), repos found, profile highlights (environments with their access), and the recommended next command (`/figmawp:migrate` if the Figma file isn't on the convention, else `/figmawp:sync-to-dev`).
