---
name: resume
description: Pick up the figmaWP Figma ⇄ WordPress workflow in a new session. Runs a health check of the Figma MCP, Safari MCP, local site and wp-cli, recaps the last sync, drift and migration state from .figmawp/, diffs Figma for new changes, and runs a drift check on local, then recommends the next step. Use at the start of a session on a figmaWP project, or when the user says "resume figmaWP", "where were we", "catch me up on the Figma sync", or runs /figmaWP:resume.
---

# figmaWP: resume

`PLUGIN` = the directory two levels above this skill's base directory. Read `PLUGIN/reference/guardrails.md`. This skill is **read-only** apart from the reports and snapshots the delegated steps write. It never creates branches or edits code or designs.

## 1. Locate
Find the child theme root using "Finding the project" in `PLUGIN/reference/profile-schema.md`. That includes searching `wp-content/themes/*/` when the session starts in the WordPress root. If there's no profile, say so and recommend `/figmaWP:bootstrap`.

## 2. Health check
Run these in parallel where possible and show a ✓/✗ table:
| Check | How |
|---|---|
| `/discovery` installed | skill listing |
| Figma MCP | `whoami`, then `get_metadata` on `figma.fileKey` (lists pages) |
| Safari MCP | a trivial Safari tool call |
| Local site | Safari, or `curl -sI <local url>` returns 200/301/302 |
| wp-cli | `wp --version` and `wp core version --path=<wp root>` |
| Repos | both repos exist, current branch, clean or dirty |

If Figma or Safari fails, stop and hand off to `/figmaWP:bootstrap` (it repairs connections), then continue.

## 3. Recap state
From `.figmawp/state.json` and git:
- Last sync: date, branch, status. Is the `figma-sync/*` branch merged into the default branch in each repo?
- Open drift items by environment, and the last check date per environment.
- Migration progress (variables, block naming per page).
- Parent theme notes not yet filed (`.figmawp/notes/`).

## 4. What changed in Figma
Run the `sync-to-dev` steps with `--diff-only` (snapshot + diff, no writes to the theme). Summarize the changes by group.

## 5. Drift on local
Run the `sync-to-figma` steps for `local` with `--report-only` (writes `.figmawp/drift/local-<date>.md`, no annotations). Summarize new items compared with `openDrift`.

## 6. Recommend
End with a short status and one recommended next command, chosen in this order:
1. A connection is broken → `/figmaWP:bootstrap`
2. An unmerged sync branch is awaiting review → review it first
3. Migration is pending → `/figmaWP:migrate`
4. Figma has changes → `/figmaWP:sync-to-dev`
5. New local drift → `/figmaWP:sync-to-figma local` (to annotate)
6. Otherwise → "Up to date". Optionally check `staging`.
