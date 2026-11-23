---
name: push
description: Push the child theme (and listed plugins) plus pending build scripts from local to staging or production over SSH, using only a ~/.ssh/config host alias. Backs up the target database and theme first, shows an rsync dry run, runs each content build script as a dry run before the real run, flushes caches and verifies. Production needs the host name typed to confirm and gets files only unless --content is passed. Use when the user says "push to staging", "deploy to dev", "send this to prod", "update staging", or runs /figmawp:push.
---

# figmaWP: push

`PLUGIN` = the directory two levels above this skill's base directory. Read `PLUGIN/reference/guardrails.md` (especially **Environments**, **Database** and **SSH and secrets**) and `PLUGIN/reference/profile-schema.md`. Requires `.figmawp/profile.json` merged with `.figmawp/local.json`.

Arguments: `--staging` or `--prod` (one is required), `--content` (production only: also run build scripts), `--dry-run` (do steps 1–3 as dry runs and stop), and optionally build script paths to run instead of the pending list.

Below, `ENV` is the target environment, `A` its `ssh` alias, `R` its `wpRoot`, and `X` the command prefix `ssh -o BatchMode=yes A`. Remote wp-cli is always `X 'cd R && wp …'`. `STAMP` is `YYYYMMDD-HHMM` (local time). Track progress with a checklist and report each step in one line.

## 1. Preflight (stop at the first failure)
1. `ENV` exists, `access` is `push` (staging) or `push-guarded` (production), and it has `ssh` and `wpRoot`. A host containing `prod`/`production` is treated as production even under `--staging`. A version 1 profile, or a missing `ssh`, stops here with: "Add an `ssh` alias for ENV: run `/figmawp:bootstrap`" (the README shows the `~/.ssh/config` block).
2. `X true` succeeds. If it fails, say the alias doesn't connect, ask the user to fix `~/.ssh/config` and their key, and stop. Never read the SSH config, never try another host or user.
3. **Right folder.** `X 'cd R && wp core is-installed && wp option get home'`: WordPress answers in `R`, and its `home` has the same host as `environments[ENV].url`. A mismatch means `R` is another site's folder on a shared server: stop and show both values. Then ask WordPress where things live instead of assuming `wp-content/…`: `THEMES=$(X 'cd R && wp eval "echo get_theme_root();"')` and, for each pushed plugin, `X 'cd R && wp plugin path'` (the plugins folder). Check the active theme is the child theme (`wp theme list --status=active --field=name`), or its parent with the child installed; otherwise stop and report.
4. Git: in each repo being pushed, `git status --porcelain`. Uncommitted changes would be pushed too: list them and ask (via `/discovery`) whether to push them anyway or stop so the user can commit. Note the short commit hash for the report.
5. Build: run `blocksPlugin.build` / each `push.plugins[].build` if defined, and report the result.
6. **Production only:** say, in plain text, "This pushes to production at `<host of environments.production.url>`. Type the host name to continue." Continue only if the reply is exactly that host name. Anything else stops the push.

## 2. Backup (on the server; never downloaded unless the user asks)
`B` is the environment's `backups` folder (default `~/figmawp-backups`). `X 'mkdir -p B/STAMP && cd R && wp db export B/STAMP/db.sql --quiet && tar -czf B/STAMP/theme.tgz -C THEMES <theme.slug>'` (add each pushed plugin the same way, from the plugins folder). Check the files exist and report their sizes. With `--dry-run`, skip the backup and say so.

## 3. Files
For the child theme (if `push.theme`) and each `push.plugins` entry:
1. Dry run: `rsync -azn --delete --itemize-changes <excludes> <local dir>/ A:THEMES/<slug>/` (plugins go to `<plugins folder>/<slug>/`). `<excludes>` is one `--exclude=<pattern>` per `push.excludes` entry. Always exclude `.figmawp/` and `.git/`, even if the profile forgot them.
2. Summarize: files to send, files to delete. Compare with `git diff --name-only <lastPush[ENV].commit>..HEAD` plus uncommitted changes: list any file in the dry run that isn't explained by those (someone changed the server, or the excludes miss something), and any deletion. If there are unexplained files or any deletions on production, ask (via `/discovery`) before continuing.
3. With `--dry-run`, stop after step 4 below and report.
4. Real run: the same command without `-n`. Report counts.

## 4. Content (staging always; production only with `--content`)
1. Scripts to run: the paths given as arguments, else `state.pendingContent[ENV]`, in date-folder then file-name order. None → skip this step. Each must be a figmaWP build script: it takes `dry`, finds things by path/slug/title/file name, and backs up before writing. If a script has no `dry` handling (`grep -q "'dry'"`), say so and ask before running it.
2. Copy them: `rsync -az <scripts> A:~/figmawp-tmp/STAMP/` (keep the date folders). A script that reads files from the theme (images, PDFs) relies on step 3 having copied them.
3. For each script: `X 'cd R && wp eval-file ~/figmawp-tmp/STAMP/<path> dry'`. Show the output. Stop on any error. On production, show all dry runs together and ask (via `/discovery`) to run them for real.
4. Real runs in the same order, without `dry`. Stop at the first error and report which scripts ran.
5. `X 'rm -rf ~/figmawp-tmp/STAMP'` (always, even after an error).
6. Never pipe wp-cli output into content, and never edit content by hand over SSH.

## 5. After
Run each `push.afterPush` command as `X 'cd R && <command>'`.

## 6. Verify
Playwright (headless; load it from the global `node_modules` with `createRequire` if needed), else Safari MCP, against `environments[ENV].url`:
- The home page and every page a content script touched (from its output) return 200 with no console errors, at `tokens.viewport.max` and `tokens.viewport.min`.
- Pages using a changed pattern, template or style show the change (compare with local).
- Any PDF or media file a script imported returns 200 with the right content type.
Never submit forms on the target unless the user asks for that check; delete any entries it creates.

## 7. Record
- Write `.figmawp/reports/<YYYY-MM-DD>-push-<ENV>.md`: commit, files sent/deleted, scripts run (with their dry-run and real output summaries), backup paths on the server, afterPush results, verification results, and how to roll back: staging `X 'cd R && wp db import B/STAMP/db.sql'` plus `tar -xzf` of the theme backup; production restores are done by the user (guardrails never run `wp db import` there).
- Append one dated entry to `.figmawp/activity.md` (env, commit, scripts, backup, result).
- `state.json`: `lastPush[ENV]` = `{ at, commit, content, backup, report }`; remove the scripts that ran from `pendingContent[ENV]`.
- Follow `git.agentCommits` (default: commit nothing).

## Finish
One short summary: ENV and URL, commit pushed, files sent/deleted, scripts run, backup path on the server, verification result, and the report path. Mention old backups in `B` on the server are kept until the user asks to remove them.
