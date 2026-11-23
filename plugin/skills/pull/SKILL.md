---
name: pull
description: Bring content from a higher environment down so dev doesn't drift from the live site. `pull --prod` copies production to local and staging in one run, `pull --staging` copies staging to local. Shows what changed on each side since the last pull first (content manifest), then replaces the target database with `--full` after a backup, with URL search-replace, new uploads, and the target's search-engine setting kept. Never writes to production. Use when the user says "pull production down", "refresh staging from live", "someone edited the live site", "get the latest content", or runs /figmawp:pull.
---

# figmaWP: pull

`PLUGIN` = the directory two levels above this skill's base directory. Read `PLUGIN/reference/guardrails.md` (especially **Database** and **SSH and secrets**) and `PLUGIN/reference/profile-schema.md`. Requires `.figmawp/profile.json` merged with `.figmawp/local.json`.

## Arguments
- **Source flag** (one): `--prod` (production) or `--staging`. The flag names where content comes **from** (push's flag names where it goes).
- `--to local,staging`: narrow the targets. Defaults: `--prod` → every lower environment with access (`local`, and `staging` when it has `access: "push"`), confirmed in step 1; `--staging` → `local`.
- `--full`: replace each target's whole database with the source's. Without it, pull only **shows** what changed since the last pull (step 2) and asks.

`SRC` is the source, `DSTS` the targets. Remote wp-cli is `ssh -o BatchMode=yes <alias> 'cd <wpRoot> && wp …'`; local wp-cli is `environments.local.wp` (default `wp`) in the local `wpRoot`. `STAMP` is `YYYYMMDD-HHMM`. Backups go to each environment's `backups` folder (default `~/figmawp-backups` on servers, `<wpRoot>/../figmawp-backups` locally). Track progress with a checklist and report each step in one line.

**Modes and what's in this version:**
| | 0.2.0 | 0.3.0 |
|---|---|---|
| Preview (default): what changed on `SRC` and on each target since the last pull | ✓ | ✓ |
| `--full`: replace the target database, then re-run build scripts the target had and `SRC` didn't | ✓ | ✓ |
| Selective: bring over only the `SRC` changes you approve, item by item, leaving the rest of the target alone | — (the preview lists them; apply needs `--full` for now) | ✓ (registry + ID mapping, plan §2.5) |

## 1. Preflight (stop at the first failure)
1. Refuse production as a target in any form: `--to production`, a target whose host contains `prod`/`production`, or a target equal to `SRC`. `--staging` can't target staging.
2. `SRC` and each remote target have `ssh` and `wpRoot`; a remote target has `access: "push"`. `ssh -o BatchMode=yes <alias> true` works for each. If not, ask the user to fix their `~/.ssh/config` and stop (never read it).
3. **Right folder on every server.** In each `wpRoot`: `wp option get home` must match that environment's `url` (same host). A mismatch means the profile points at another site's folder: stop and report both values. Then ask WordPress for its folders instead of assuming them: uploads `wp eval 'echo wp_upload_dir()["basedir"];'`, table prefix `wp db prefix`. If prefixes differ between `SRC` and a target, stop and explain.
4. Confirm the targets (via `/discovery`) when `--to` wasn't given and there's more than one candidate.
5. Record from each target: `home`, `siteurl`, `blog_public`, active theme. From `SRC`: `home`, `siteurl`.

## 2. What changed since the last pull (always)
1. Build a manifest on `SRC` and on each target with `PLUGIN/php/content-manifest.php` (sent on stdin: `ssh <alias> 'cd <wpRoot> && mkdir -p ~/figmawp-tmp && wp eval-file - ~/figmawp-tmp/manifest.json' < PLUGIN/php/content-manifest.php`, then `rsync <alias>:~/figmawp-tmp/manifest.json <scratch>/` and remove the remote copy; locally write straight to the scratch folder).
2. If `.figmawp/pull/<SRC>-manifest.json` exists (saved at the last pull), for each target run `node PLUGIN/scripts/manifest-diff.mjs .figmawp/pull/<SRC>-manifest.json <src-now> <target-now>`. It sorts every page, post, pattern, menu, template, global style, media file and form into:
   - **changed on `SRC` only**: someone edited the live site;
   - **changed on the target only**: your work since the last pull (local edits, build scripts);
   - **changed on both**: a conflict;
   - **the same change on both**.
   With no saved manifest (first pull), say there's no baseline, so a preview isn't possible yet; this pull will create one.
3. Show the result per target, and which build scripts in `state.pendingContent[SRC]` the target has that `SRC` doesn't.
4. Without `--full`, stop here and recommend:
   - Nothing changed on `SRC` → no pull needed.
   - `SRC` changes, and the target's own changes are all from build scripts → `--full` is safe: step 6 re-runs those scripts.
   - The target has changes that aren't from build scripts (hand edits on local), or there are conflicts → say exactly which items would be lost by `--full`. Offer: turn those hand edits into a build script first (then `--full`), copy the few `SRC` changes over by hand, or wait for selective pull (0.3.0).
   Ask which to do (via `/discovery`).

## 3. Back up each target (`--full`)
- local: `<wp> db export <backups>/STAMP-before-pull.sql`.
- staging: `ssh … 'mkdir -p <backups>/STAMP && cd <wpRoot> && wp db export <backups>/STAMP/before-pull.sql --quiet'`.
Check each file exists and report its size. Say plainly before continuing: the target's whole database will be replaced, users and passwords included, so logins on the target become `SRC`'s accounts.

## 4. Copy the source database once (never printed)
Export `SRC` once and reuse it for every target:
`ssh -o BatchMode=yes <SRC alias> 'cd <wpRoot> && wp db export - --quiet' > <local backups>/STAMP-from-SRC.sql`. Check it ends with `-- Dump completed` and report the size only. For a staging target, upload it: `rsync -az <that file> <staging alias>:<backups>/STAMP/from-SRC.sql`. Never `cat`, `head` or grep a dump into the conversation.

## 5. Import, rewrite URLs, restore settings (each target)
1. `wp db import <dump>`.
2. `wp search-replace '<SRC home>' '<target home>' --all-tables-with-prefix --precise --skip-columns=guid --report-changed-only`, then the scheme-less hosts (`'//src-host' '//target-host'`). If `siteurl` differs from `home` on either side, repeat for `siteurl`. Report the counts.
3. Restore `blog_public` (`wp option update blog_public <recorded>`), and warn if `SRC` had a different value.
4. If the recorded active theme isn't active any more, report it and ask before switching back.
5. `wp cache flush`, `wp rewrite flush`, and each `push.afterPush` command that's a cache command.
6. Delete the imported dump on that target; keep the `before-pull` backup.

## 6. Uploads (added and changed files only; nothing deleted)
Copy from `SRC`'s uploads folder to each target's (both asked of WordPress in preflight):
- local: `rsync -az --itemize-changes <SRC alias>:<src uploads>/ <local uploads>/`
- staging: rsync can't copy between two remotes, so relay through the local uploads folder when local is also a target (it was just filled), or through `~/figmawp-cache/<theme.slug>/uploads/` otherwise: `rsync -az <relay>/ <staging alias>:<staging uploads>/`.
Report the number of files added or updated per target.

## 7. Build scripts the pull undid
For each target, the scripts in `state.pendingContent[SRC]` that are **not** in `state.pendingContent[<target>]` had run on that target but not on `SRC`, so the import removed their changes (local has run every script by definition). They're idempotent: re-run them on that target now (dry, then real; locally `<wp> eval-file`, on staging as in `/figmawp:push` step 4). Ask first only if a dry run shows something unexpected.

## 8. Verify
Playwright (or Safari) on each target: home and the 5 newest modified pages (`wp post list --post_type=page,post --orderby=modified --order=DESC --posts_per_page=5 --fields=url`) return 200, images load, no console errors.

## 9. Record
- Save `SRC`'s manifest from step 2 as `.figmawp/pull/<SRC>-manifest.json` (the baseline for the next preview). It holds titles, paths and hashes only, no content.
- Write `.figmawp/reports/<YYYY-MM-DD>-pull-<SRC>.md`: targets, the step 2 change lists, post counts by type before and after, uploads added, search-replace counts, `blog_public`, scripts re-run, backup paths, and how to undo each target (`wp db import` of its `before-pull` backup).
- Append a dated entry to `.figmawp/activity.md`.
- `state.json`: `lastPull[<target>]` = `{ at, from, mode, backup, report }`.
- Follow `git.agentCommits` (default: commit nothing).

## Finish
Summarize per target: mode, backup path, what changed (from the preview), uploads, scripts re-run, verification. Remind the user that each target's logins are now `SRC`'s accounts.
