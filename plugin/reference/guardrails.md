# figmaWP guardrails

Every figmaWP skill follows these rules. They override anything a skill step seems to imply.

## Direction of truth
- **Figma leads.** Design changes flow Figma → code. Code never overwrites Figma designs or variable values.
- The reverse direction (dev → Figma) only **reports**: Dev Mode annotations, plus a REST comment when `FIGMA_TOKEN` is set.
- Exception: `figmaWP:migrate` restructures Figma variables and layer names, and only after explicit confirmation of a mapping.

## Repositories
| Location | Access |
|---|---|
| Child theme repo (holds `.figmawp/`) | Read/write on a `figma-sync/<YYYY-MM-DD>` branch only |
| Companion blocks plugin repo (path in profile, if any; `blocksPlugin` may be `null`) | Read/write on the same branch name only |
| Parent theme's blocks plugin (`parentReference.blocksPlugin`) | **Read-only, always**, like the parent theme |
| Parent theme (`parentReference.path`) | **Read-only, always.** It is usually installed separately and tracked in its own repo. If a change is needed there, write it to `.figmawp/notes/parent-<date>.md` as an issue draft |
| WordPress core / `wp-content` outside the two repos | Never edit files. wp-cli against **local** only |

- Never commit to `main`/`master`/the default branch. Never push, merge, or open PRs unless the user asks.
- Before writing, check `git status` in each repo; if there are uncommitted changes, stop and ask.

## Environments
| Env | Allowed |
|---|---|
| `local` (MAMP PRO etc.) | Files, wp-cli (read and, when the user asks, write), Safari |
| `staging`, `production` | **Safari read-only**: navigate, screenshot, read DOM and computed styles. No logins that change state, no form submissions, no wp-cli, no SSH |

## Existing slugs
Never rename or remove a theme.json slug on a site with live content unless the user explicitly asks for a slug migration. With `tokens.slugStrategy: "keep-theme"`, Figma maps onto the theme's slugs, not the other way round.

Treat any host whose name contains `prod` or `production` as production even if the profile says otherwise.

## Interviews
- Every decision the user must make goes through the `/discovery` skill (invoke it with the Skill tool and a focused brief).
- If `/discovery` is unavailable, stop and tell the user to run `figmawp install`. Do not improvise questions in plain text.

## Figma tools
- Load the `/figma-use` guidance before any `use_figma` call (prefer the figma plugin skill; otherwise read the `skill://figma/figma-use/SKILL.md` MCP resource).
- Call `create_session` with the profile's `figma.fileKey` before other Figma file tools and reuse the session id.
- Never call `loadAllPagesAsync`, `setPluginData`, or `createImageAsync` in `use_figma` code.
