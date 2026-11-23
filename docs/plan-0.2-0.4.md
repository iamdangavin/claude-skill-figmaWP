# figmaWP 0.2 – 0.4 plan

Settled in a `/discovery` session on 2026-11-23, from lessons on the Alabama Film project (alabamafilm.org child theme, Nov 2026). The plan comes first; this file is the source of truth for the three releases. Agents don't commit; Dan does.

## Why

On a real project, most of the work fell outside what figmaWP 0.1.3 covers:

| What happened | Gap in 0.1.3 |
|---|---|
| 5 page-header photos were swapped and re-graded in Figma. The sync saw nothing: the snapshot hashes an image fill as `IMAGE`. | No image change detection, no image pipeline |
| Requests were scoped ("just these 5 headers", a pasted Figma URL). | Sync is whole-file only |
| Most of the work was database content: pages, Gravity Forms, synced-pattern overrides, menus, PDFs. It was done with hand-written, idempotent `wp eval-file` scripts. | sync-to-dev writes theme files only |
| Every change went to staging by rsync + SSH: DB backup, theme rsync with excludes, run the same scripts, flush caches, verify. | Guardrails say staging is Safari read-only, so there's no push |
| Production content drifts from staging and local (editors work on live). | No pull |
| Figma was edited from dev decisions: new form components, the Contact form restyle, mirrored page frames, a clickable prototype. | "Figma leads, never edit designs" |
| Verification used headless Playwright (form walkthroughs, link and PDF checks). | Safari MCP only |
| STATUS, the Figma node map and decisions were updated by hand after every step. | No doc automation |

## Decisions

| # | Decision |
|---|---|
| D1 | **Approved two-way.** Figma still owns tokens and their values. The agent may author Figma components, page frames and prototypes after the user approves a plan. Every run keeps a ledger and leaves annotations. Guardrails are rewritten to say so. |
| D2 | **Content is first-class.** `/figmaWP:build` generates and runs idempotent `wp eval-file` scripts from a shared helper library. |
| D3 | **`/figmaWP:push --staging` / `--prod`.** Connection details live only in `~/.ssh/config`; the profile stores a host alias and the WP root, so nothing sensitive is stored in the repo or in Claude sessions. |
| D4 | **Production guards:** the user types the production host name to confirm; a DB backup and a dry run of every script come first; **files only** unless `--content` is passed. |
| D5 | **`/figmaWP:pull`**: full DB + uploads from a source environment, with URL search-replace, after a backup of the target. Never writes to production. Allowed directions: production → staging/local, staging → local. |
| D6 | **Conflicts:** each build script records a hash of what it wrote. If the live content no longer matches (an editor changed it, or a pull brought changes), show a diff and ask: keep, overwrite, or merge by hand. |
| D7 | **Helpers:** pages + block builders; media + PDFs; synced patterns / overrides; Gravity Forms + menus (plugin helpers load only when the plugin is active). |
| D8 | **Images:** detect changes (image hash + filters + crop) and run the full pipeline. |
| D9 | **Scoped sync:** sync-to-dev accepts Figma URLs, node IDs or page names; whole-file stays the default. |
| D10 | **Verification:** Playwright first. Safari MCP for live-site reads and the user's logged-in browser. Every run writes a report. |
| D11 | **`/figmaWP:design`** authors components + variants, page frames mirrored from dev, and prototypes. Print/PDF pages are not in scope for now. |
| D12 | **Docs automation:** a generated node map, an activity log, and `/discovery` decisions written to the decisions doc. |
| D13 | **Profile settings** for project habits (`figma.mobileFrames`, `git.agentCommits`, `git.branching`), asked once by bootstrap. A **standard Figma ledger** for resumable design runs. |
| D14 | **New skills**, kept short: `push`, `pull`, `build`, `design`. |
| D15 | **Phased**: 0.2.0, 0.3.0, 0.4.0. Step 0: the current WIP (bootstrap, migrate, profile-schema) is committed or shelved first. |

---

## Step 0 (Dan)
Commit or shelve the WIP in `plugin/skills/bootstrap/SKILL.md`, `plugin/skills/migrate/SKILL.md` and `plugin/reference/profile-schema.md`. Phase 1 edits bootstrap and profile-schema too.

---

## Phase 1 → 0.2.0: images, scoped sync, push, pull

### 1.1 Profile schema (`reference/profile-schema.md`), schemaVersion 2
```jsonc
"environments": {
  "local":      { "url": "https://acme.local", "access": "full", "wpRoot": "/path/to/wp", "wp": "wp" },
  "staging":    { "url": "https://staging.example.com", "access": "push",
                  "ssh": "acme-staging",            // ~/.ssh/config Host alias, nothing else
                  "wpRoot": "~/public_sites/staging.example.com" },
  "production": { "url": "https://example.com", "access": "push-guarded",
                  "ssh": "acme-prod", "wpRoot": "~/public_html" }
},
"push": {
  "theme": true,                       // rsync the child theme with --delete
  "plugins": [],                       // extra repos to rsync (e.g. the companion blocks plugin)
  "excludes": [".git/", ".gitignore", ".DS_Store", "*.codekit3", "/assets/images/originals/", "/_docs/", "/.figmawp/"],
  "afterPush": ["wp cache flush", "wp eval 'wp_get_theme()->delete_pattern_cache();'"]
},
"images": {
  "originals": "assets/images/originals",   // PNG masters (gitignored)
  "compressed": "assets/images/compressed",
  "scale": 3,
  "maxDimension": 2232,
  "encoder": "avifenc -s 6 -y 420 -a end-usage=q -a cq-level=33 -a tune=psnr",
  "dropFills": ["SHADER"],                   // fill types the theme adds itself (e.g. grain)
  "coverDefaults": { "dimRatio": 0, "focal": [0.5, 0.5] }
},
"figma": { "mobileFrames": false, "agentEdits": "approved" },
"git": { "agentCommits": false, "branching": "figma-sync" }   // or "current"
```
- `access` values: `full` (local), `push` (staging), `push-guarded` (production), `read-only` (Safari only, the old default). Missing `ssh` means the environment can't be pushed to.
- Migration: schemaVersion 1 profiles keep working; `resume` offers to add the new keys through `/discovery`.
- `.figmawp/local.json` may override `ssh` and `wpRoot` per machine (it's gitignored).

### 1.2 Guardrails (`reference/guardrails.md`), rewritten
- Direction of truth: D1 wording. Tokens and values: Figma only. Design authoring: `/figmaWP:design` with an approved plan + ledger + annotations.
- Environments table becomes access-driven (`full` / `push` / `push-guarded` / `read-only`). Hosts containing `prod`/`production` are always `push-guarded` at most.
- SSH: only `ssh <alias>` and `rsync … <alias>:…`. Never read, print or copy `~/.ssh/config` or keys; never put a host, user or key in a command line, file or report.
- Secrets: never read `wp-config.php` values; only `wp config has <NAME>`.
- Git: honour `git.agentCommits` (default false) and `git.branching`.
- Never `wp db import` into production. Never a full DB push in either direction except `pull` into a non-production target.

### 1.3 Images in the snapshot (`reference/snapshot.md`, `scripts/snapshot-diff.mjs`)
- New section `images`, keyed by node id, for nodes with an IMAGE fill in mapped frames:
  `{ "frame": "<frameId>", "dest": { "page": "film-tv/incentives", "block": "cover#1" }, "imageHash": "…", "filters": {…}, "scaleMode": "FILL", "transform": [...], "otherFills": ["SHADER"], "hash": "<stable hash of the above>" }`
- `snapshot-diff.mjs`: add `images` to `SECTIONS`; a test for "same structure, new imageHash ⇒ changed".
- `dest` comes from `profile.blocks.pathMap` plus a new `images` mapping, asked once per new image and saved.

### 1.4 Image pipeline (new `scripts/image-pipeline.md` steps + `scripts/encode-images.mjs`)
For each changed image:
1. In Figma (read-only for the design): make a temp frame holding only the IMAGE fill (with its filters; `dropFills` removed), scaled `images.scale`×; `get_screenshot` at `maxDimension`; delete the temp frame.
2. Save the PNG to `images.originals`; `encode-images.mjs` runs `images.encoder` into `images.compressed` (reports sizes).
3. Media Library + Cover: a generated build script (Phase 2's `media` helpers; in 0.2.0 a self-contained script) imports by file name without duplicates and sets the mapped Cover block's image with `coverDefaults`. Backs up page content first.
4. Runs on local now; `push` runs the same script on staging/production.

### 1.5 Scoped sync (`skills/sync-to-dev/SKILL.md`)
- Arguments: Figma URLs (parse fileKey + node-id), node IDs, frame or page names. No arguments = whole file.
- Snapshot only those subtrees (plus anything they reference: variables and components used), diff against the same keys in `figma-latest.json`, and **merge** the result into `figma-latest.json` afterwards (other keys untouched).
- Report and branch names include the scope (`figma-sync/2026-11-20-heroes`).

### 1.6 `/figmaWP:push` (new skill)
`/figmaWP:push --staging | --prod [--content] [--dry-run]`
1. Preflight: profile environment has `ssh`; `ssh -o BatchMode=yes <alias> true` works (otherwise tell the user to set up the alias and stop); git status clean or the user accepts; for `--prod`, the user types the production host name.
2. Backup: `wp db export` to `~/figmawp-backups/<date>/` on the server (path reported, never downloaded unless asked).
3. Files: rsync dry run (`-n --itemize-changes`) shown, then the real rsync of the theme (+ `push.plugins`) with `push.excludes`. Unexpected files in the dry run (changes not from this session) are listed and confirmed, not silently pushed.
4. Content (staging always; production only with `--content`): copy the pending build scripts (Phase 2 registry; in 0.2.0, the scripts named by the user or written this session), run each with `dry` first, show results, then run for real. Delete the copied scripts afterwards.
5. `push.afterPush` commands.
6. Verify (Playwright when available, else Safari), append the activity log, update `state.json` → `lastPush[env]`.

### 1.7 `/figmaWP:pull` (new skill)
`/figmaWP:pull --from production|staging --to staging|local`
- Refuses `--to production`. Refuses `--from staging --to staging`.
- Back up the target DB first; export the source DB over SSH (`wp db export -`, streamed to a temp file, never printed); `wp search-replace '//source-host' '//target-host' --all-tables-with-prefix` on import; rsync `wp-content/uploads/` from source to target (no `--delete`).
- After pull: `wp cache flush`, pattern cache flush, `blog_public` stays as the target had it (warn if it changed), then mark every build script's recorded hash as "needs check" (Phase 2 conflict detection).
- Report what changed: post counts by type, newest modified posts, uploads added.

### 1.8 Bootstrap + resume
- bootstrap asks (via `/discovery`) for the ssh aliases, WP roots, access levels, image settings, `figma.mobileFrames`, `git.agentCommits`, `git.branching`.
- resume reports `lastPush` / `lastPull` per environment and any images changed since the last snapshot.

### 1.9 Tests and docs
- `snapshot-diff.test.mjs`: images section cases.
- `encode-images.mjs` test with a tiny fixture (skipped when `avifenc` is missing).
- README: new skills, SSH alias setup (a sample `~/.ssh/config` block with placeholders), the image pipeline.

---

## Phase 2 → 0.3.0: build library, conflicts, verification

### 2.1 `/figmaWP:build` (new skill)
- Writes scripts to `.figmawp/build/<YYYY-MM-DD>/<name>.php`, each starting with the helper bootstrap and a header (purpose, idempotency, usage, `dry`).
- Runs them locally (dry, then real), records results in the registry.

### 2.2 Helper library (`plugin/php/figmawp-helpers.php`, copied into `.figmawp/build/_lib/` by build and pushed with scripts)
- **Core:** `fw_page( $path )`, `fw_backup( $post_id )` to `_backups/<script>-<date>/`, `fw_write( $post_id, $content )` (skips unchanged, records hash), `fw_must( $what, $count )`, `fw_dry()`.
- **Blocks:** `fw_button( $label, $href, $muted, $new_tab )` (auto new tab for external and PDF), `fw_buttons`, `fw_paragraph`, `fw_heading`, `fw_list` (nested, `type`), `fw_card`, `fw_grid`, `fw_section`, `fw_replace_block_range( $content, $start_marker, $new )`, `fw_replace_button( $content, $label, $new )`.
- **Media:** `fw_media_by_file( $name )`, `fw_import_media( $path, $title )` (no duplicates), `fw_replace_media( $path )` (in place, same URL, backup), `fw_set_cover( $content, $nth, $attachment_id, $focal )`.
- **Synced patterns:** `fw_pattern_by_text( $needle )`, `fw_make_overridable( $pattern, $block_label, $name )`, `fw_set_override( $page, $pattern_id, $name, $values )`, `fw_detach_pattern( $page, $pattern_id, $transform )`.
- **Gravity Forms** (when GFAPI exists): `fw_gf_form( $title, $fields, $settings )` (create or update by title), field builders (half width, conditional, page/step titles, HTML, choices), `fw_gf_notifications`, `fw_gf_confirmation`.
- **Menus:** `fw_nav( $ref_or_title )`, `fw_nav_link_set( $nav, $label, $url )`, `fw_nav_add`.
- Lookups are always by slug, path, title or file name; never by numeric ID (IDs differ per environment).

### 2.3 Registry + conflicts (`.figmawp/build/registry.json`)
- Per script: `{ "env": { "local": { "ranAt", "result", "writes": { "<post path>": "<sha1 of content written>" } }, "staging": {…} } }`.
- Before writing, `fw_write` compares the post's current content hash to the recorded one. Mismatch ⇒ the run stops for that post and reports a diff; the skill asks (via `/discovery`) keep / overwrite / merge by hand.
- `push` reads the registry to know which scripts are pending for an environment.

### 2.4 Verification (`plugin/scripts/verify/*.mjs`)
- Playwright (detected globally or via npx), with ready-made checks: `links.mjs` (no `#` links, every PDF returns 200 `application/pdf`), `screens.mjs` (sections at 1440/390), `forms.mjs` (walk a multi-step GF form from a JSON plan, delete its test entries afterwards), `compare.mjs` (Figma `get_screenshot` vs page screenshot side by side).
- Reports to `.figmawp/reports/<date>-<skill>-<env>.md` with screenshots alongside.
- Test emails use a profile-set domain (GF rejects `example.com`).

---

## Phase 3 → 0.4.0: design authoring, prototypes, docs

### 3.1 `/figmaWP:design` (new skill)
- Modes: `component` (create/update a component set with variants, states, boolean/text properties, variables bound), `frame` (mirror a WordPress page into a Figma frame by cloning header/footer/hero and reusing components), `prototype`.
- Always: `/discovery` plan → user approval → ledger `.figmawp/ledger/<run>.json` (created node IDs, completed steps, resume point) → annotations on changed nodes → screenshot check → node map update.
- Honours `figma.mobileFrames` (no mobile frames unless asked) and canvas placement (never overlap existing frames; place to the right).
- Prototypes: a `zz-prototype` collection (name from profile) of booleans bound to panel visibility, `SET_VARIABLE` reactions, flow starting points; the collection is added to `tokens.ignoreCollections` automatically.

### 3.2 Docs automation
- **Node map** (`docs.nodeMap`, e.g. `_docs/_reference/figma-map.md`): a generated section between markers, Figma node → page/part/pattern/component → file or post path.
- **Activity log** (`docs.status`): each skill run appends a dated entry (scope, environments, scripts, backups, verification result).
- **Decisions** (`docs.decisions`): settled `/discovery` outcomes appended as the next numbered row, with a date and a one-line summary.
- All three are profile-configured; `null` disables.

---

## Out of scope (for now)
- Print/PDF document pages in Figma (done by hand on Alabama Film; revisit later).
- A live-site link/content audit as a skill (the project's `_docs/_reference/links/` scripts could become an optional push/pull check later).
- Code Connect.
