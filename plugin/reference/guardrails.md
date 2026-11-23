# figmaWP guardrails

Every figmaWP skill follows these rules. They override anything a skill step seems to imply.

## Direction of truth
- **Figma owns tokens and their values.** Colors, type and spacing flow Figma → `theme.json`. Code never changes a Figma variable value or text style.
- **Design authoring is two-way, with approval.** When `figma.agentEdits` is `"approved"` (the default), a skill may create or change Figma components, page frames and prototypes, but only after the user approves a written plan. Every such run keeps a ledger (`.figmawp/ledger/<run>.json`), leaves an annotation on each node it created or changed, and checks the result with a screenshot. With `"never"`, Figma is report-only.
- **Reporting** (sync-to-figma) only adds Dev Mode annotations, plus a REST comment when `FIGMA_TOKEN` is set.
- `figmawp:migrate` restructures Figma variables and layer names, and only after explicit confirmation of a mapping.
- Small-screen frames are created in Figma only when the user asks and `tokens.mobileFrames` is `"reference"` or `"source"`. Never assume a project has or lacks them; bootstrap asks.

## Repositories
| Location | Access |
|---|---|
| Child theme repo (holds `.figmawp/`) | Read/write. Branching follows `git.branching` |
| Companion blocks plugin repo (path in profile, if any; `blocksPlugin` may be `null`) | Read/write on the same branch name |
| Parent theme's blocks plugin (`parentReference.blocksPlugin`) | **Read-only, always**, like the parent theme |
| Parent theme (`parentReference.path`) | **Read-only, always.** It is usually installed separately and tracked in its own repo. If a change is needed there, write it to `.figmawp/notes/parent-<date>.md` as an issue draft |
| WordPress core / `wp-content` outside the two repos | Never edit files. Database changes go through wp-cli or build scripts (below) |

## Git
- `git.agentCommits: false` (the default): never stage, commit, push, merge or open PRs. Show `git status` / `git diff --stat` and let the user commit. With `true`, commit only on a non-default branch and only what the skill wrote.
- `git.branching: "figma-sync"`: sync-to-dev creates `figma-sync/<YYYY-MM-DD>[-<scope>]`. `"current"`: work on the current branch, but never write to the default branch without the user saying so.
- Before writing, check `git status` in each repo; if there are uncommitted changes the skill didn't make, stop and ask.

## Environments
`access` comes from the profile (see profile-schema.md). A host containing `prod` or `production` is `push-guarded` at most, whatever the profile says. A version 1 profile, or any environment without `ssh`, is `read-only`.

| access | Allowed |
|---|---|
| `full` (local) | Files, wp-cli read and write, build scripts, Safari, Playwright |
| `push` (staging) | Safari and Playwright reads. `/figmawp:push --staging`: DB backup, theme/plugin rsync, build scripts (dry run first), `push.afterPush`. Target of `/figmawp:pull`. Read-only wp-cli over SSH for checks |
| `push-guarded` (production) | Safari and Playwright reads. `/figmawp:push --prod` only after the user **types the production host name**; DB backup and dry runs first; **files only** unless `--content`. Source of `/figmawp:pull`, **never its target**. Read-only wp-cli over SSH for checks |
| `read-only` | Safari and Playwright reads only. No wp-cli, no SSH, no logins that change state, no form submissions |

On any non-local environment, never submit forms, create accounts, or log in through the browser, unless the user asks for that one check.

## Database
- Database content (pages, forms, menus, media, synced patterns) changes only through **build scripts** in `.figmawp/build/<date>/`: idempotent `wp eval-file` scripts that find things by path, slug, title or file name (never a numeric ID, which differs per environment), back up what they change first, and support a dry run.
- Never pipe wp-cli output into post content.
- Never `wp db import` into production. Never push a whole database up to any environment. The only full-database move is `/figmawp:pull` into a non-production target, after a backup of that target.
- Delete any test data a check creates (form entries, test posts) before finishing.

## SSH and secrets
- Reach servers only as `ssh <alias> …` and `rsync … <alias>:…`, where `<alias>` is the environment's `ssh` value: a Host in the user's `~/.ssh/config`. Use `-o BatchMode=yes` so a missing key fails instead of prompting.
- Never read, print, copy or summarize `~/.ssh/config`, keys, `known_hosts` or agent output. Never put a host name, user, port, key path or password in a command line, profile, report, doc or memory.
- If an alias doesn't connect, tell the user to fix their `~/.ssh/config` (the README has a sample block) and stop. Don't try other hosts or users.
- Never read secret values from `wp-config.php` or `.env` files. To check a constant exists, use `wp config has <NAME>`. Licence keys and API keys are the user's to set.
- Database dumps are written to files and never printed. Pulled dumps are deleted once imported, and the target backup is kept.

## Existing slugs
Never rename or remove a theme.json slug on a site with live content unless the user explicitly asks for a slug migration. With `tokens.slugStrategy: "keep-theme"`, Figma maps onto the theme's slugs, not the other way round.

## Interviews
- Every decision the user must make goes through the `/discovery` skill (invoke it with the Skill tool and a focused brief).
- If `/discovery` is unavailable, stop and tell the user to run `figmawp install`. Do not improvise questions in plain text.
- Exception: the production confirmation in push is a typed host name, asked in plain text, because it must be typed rather than picked.

## Figma tools
- Load the `/figma-use` guidance before any `use_figma` call (prefer the figma plugin skill; otherwise read the `skill://figma/figma-use/SKILL.md` MCP resource).
- Call `create_session` with the profile's `figma.fileKey` before other Figma file tools and reuse the session id.
- Never call `loadAllPagesAsync`, `setPluginData`, or `createImageAsync` in `use_figma` code.
- Temporary nodes (for example an image export frame) are created on the current page, removed in the same run, and never left behind on failure (wrap in `try/finally`).
