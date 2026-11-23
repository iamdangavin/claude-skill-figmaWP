# figmaWP

**Keep a Figma design and a WordPress block theme in step, from inside Claude Code.**

figmaWP is a set of Claude Code skills for WordPress block child themes, including ones built on a parent theme and its own blocks plugin. It reads the Figma file (all of it, or just the frames you point at), works out what changed since the last sync, photos included, and writes the matching theme changes on a git branch for you to review. It pushes the theme and content changes to staging or production over SSH, pulls live content back down, and can check any environment for differences from the design and leave notes on the Figma layers involved.

```
          /figmawp:sync-to-dev
 Figma  ───────────────────────────▶  WordPress theme
(design)  tokens, patterns, blocks   (review branch)
        ◀───────────────────────────
          /figmawp:sync-to-figma
          notes on drifted layers

                          /figmawp:push --staging | --prod
 local  ─────────────────────────────────────────▶  staging / production
        ◀─────────────────────────────────────────
                          /figmawp:pull   (database + uploads)
```

**Figma owns the tokens.** Colors, type and spacing only ever flow from Figma into the code. Anything found in the code flows back as notes in Figma. Claude can also build Figma components and frames, but only after you approve a plan.

---

## Install (about 2 minutes)

```sh
npm i -g @iamdangavin/figmawp
figmawp install
```

Then **restart Claude Code**.

`figmawp install` adds the plugin to Claude Code. It also adds the `/discovery` interview skill if you don't have it yet; if you already have your own copy, it's left alone.

Or install the plugin straight from GitHub inside Claude Code (you'll need `/discovery` separately):

```
/plugin install figmawp --marketplace iamdangavin/claude-skill-figmaWP
```

**Upgrading from 0.1.x:** the commands are now lowercase (`/figmawp:sync-to-dev`, not `/figmaWP:sync-to-dev`). `figmawp update` removes the old plugin name for you. See the [changelog](CHANGELOG.md).

Check everything is set up:

```sh
figmawp doctor
```

### One-time setup

| You need | How |
|---|---|
| Claude Code | [claude.com/claude-code](https://claude.com/claude-code) |
| **Figma connector** | In Claude Code, run `/mcp` (or in claude.ai go to Settings → Connectors), connect **Figma**, and sign in |
| **Safari automation** (for visual checks) | Run `sudo safaridriver --enable` once. Then in Safari, go to Settings → Advanced and turn on *Show features for web developers*, then choose Develop → *Allow Remote Automation* |
| wp-cli (recommended) | `brew install wp-cli` |
| Local site running | MAMP PRO or your usual local setup |
| An image encoder (only if your project's photos are compressed) | Whatever the project chose at bootstrap, e.g. `brew install webp` or `brew install libavif` |
| Playwright (recommended, for checks) | `npm i -g playwright && npx playwright install chromium` |
| SSH alias per server (for push and pull) | See [Connecting to staging and production](#connecting-to-staging-and-production) |

---

## Quick start

Open Claude Code in the site folder. The WordPress root or the child theme folder both work.

```sh
cd path/to/your-site
claude
```

**First time on a project:**

```
/figmawp:bootstrap
```

Claude connects Figma and Safari, reads the theme and any project docs, and then asks you a few questions, such as which Figma file, what the staging URL is, and how tokens map. It saves the answers to `.figmawp/profile.json` in the child theme repo. Commit that file, and teammates can skip this step.

**Every session after that:**

```
/figmawp:resume
```

It checks the connections, tells you where things stand, shows what changed in Figma since last time, and suggests the next step.

---

## The commands

| Command | Use it when… | What happens |
|---|---|---|
| `/figmawp:bootstrap` | Setting up a project (or something's disconnected) | Connects Figma and Safari, analyzes the theme, asks setup questions, and writes `.figmawp/profile.json` |
| `/figmawp:resume` | Starting a work session | Health check, recap, what's new in Figma, a drift check on local, and the recommended next step |
| `/figmawp:sync-to-dev` | The designer updated Figma | Finds the changes and writes them to a `figma-sync/<date>` branch: colors, type and spacing in `theme.json`, patterns, templates, blocks and icons. Swapped or re-graded images are exported, compressed and put on their blocks, the way the project chose at bootstrap. Then checks the result on local |
| `/figmawp:sync-to-dev <Figma link>` | Only part of the file changed | The same, for just the frames you paste or name |
| `/figmawp:push --staging` | Your branch is ready for staging | Backs up the staging database, shows what will change, copies the theme, runs the pending content scripts (dry run first), clears caches and checks the pages |
| `/figmawp:push --prod` | Going live | The same for production, after you type its host name. Files only, unless you add `--content` |
| `/figmawp:pull --prod` | Editors have been working on the live site | Shows what changed on production, and on local and staging, since the last pull. Nothing is copied yet |
| `/figmawp:pull --prod --full` | You want local and staging to match production | Backs them up, then copies production's database and uploads to both in one run, fixes the URLs, and re-runs your build scripts that production doesn't have yet. `--to local` does just one. `--staging` pulls from staging instead |
| `/figmawp:sync-to-figma staging` | You want to know whether the site still matches the design | Compares local, staging or production with Figma and adds a **Dev drift** note to each layer that differs |
| `/figmawp:migrate` | A Figma file doesn't use our WordPress variable setup yet | Proposes a mapping, asks you to confirm, then sets up the WP variables in Figma. It can also name layers as blocks (see below) |

You don't have to remember the exact wording. Asking Claude "pull the latest from Figma" or "does staging match the design?" works too.

---

## A typical week

1. **Designer** updates the hero and tweaks the accent color in Figma.
2. **Developer** runs `/figmawp:resume`, which reports "Figma has 2 changes: hero frame and color/primary."
3. Runs `/figmawp:sync-to-dev`. Claude creates `figma-sync/2026-11-12`, updates `theme.json` and `patterns/hero.php`, and screenshots local next to the Figma frame.
4. Developer reviews the branch, adjusts anything needed, then commits and merges as usual.
5. The designer swaps two header photos. The developer pastes the two Figma links into `/figmawp:sync-to-dev`. Claude exports the photos, compresses them, and puts them on the right pages on local.
6. Runs `/figmawp:push --staging`. The theme and the photo script go to staging, and Claude checks the pages.
7. Before launch, runs `/figmawp:sync-to-figma staging`. Someone changed a button color in the Site Editor on staging, so a **Dev drift** note appears on that button in Figma. The designer decides whether to adopt it.

---

## Naming layers in Figma (optional, but powerful)

If designers name layers after WordPress blocks with a `wp:` prefix, Claude builds exactly that block structure:

```
wp:group (tagName=section)
├─ wp:heading (level=2)
└─ wp:columns
   ├─ wp:column
   │  └─ wp:base/hero
   └─ wp:column
      └─ wp:image
```

- Layers **without** `wp:` are treated as decoration.
- For layers that aren't named yet, Claude suggests a structure, shows it to you, and renames the layers in Figma once you approve. After that, it's exact every time.
- Common blocks are `wp:group`, `wp:columns`, `wp:column`, `wp:heading`, `wp:paragraph`, `wp:image`, `wp:buttons`, `wp:button` and `wp:cover`. For custom blocks, use the full name, like `wp:base/hero`.

---

## Photos

Figma image fills used to be invisible to sync. Now every image in the synced frames is tracked by its file, filters (exposure, contrast…), crop and size. When one changes, `sync-to-dev`:

1. Exports it from Figma, either the photo alone (when the theme adds overlays or effects itself in CSS) or the layer exactly as designed. Which one, at what size and in what format is decided per project when you run bootstrap, and can be changed per image.
2. Compresses it with the encoder your project chose (or keeps the PNG).
3. Writes a small build script that imports it to the Media Library by file name (replacing the old file in place, never making `-1` copies) and puts it on the right Cover, Image or Media & Text block, or sets it as the featured image. It runs the script on local; `push` runs it on staging later.

The first time it sees an image, Claude asks which page and block it belongs to and saves the answer.

## Mobile designs

Projects differ, so bootstrap looks at your Figma frames and asks. Most files build desktop frames with auto-layout, so they're already fluid, and separate mobile frames are often partial or out of date. You choose whether mobile frames are:
- **none:** there are no mobile designs; small screens are checked for breakage only.
- **reference:** mobile frames are the visual target when checking small screens, but the desktop structure drives the code.
- **source:** mobile frames are maintained designs, and their differences become responsive rules in the theme.

---

## Connecting to staging and production

figmaWP never stores server details. Each server gets an alias in **your** `~/.ssh/config`, and the profile stores only the alias name and the WordPress folder:

```
# ~/.ssh/config  (yours, never committed or read by Claude)
Host acme-staging
  HostName <server address>
  User <ssh user>
  IdentityFile ~/.ssh/<your key>

Host acme-prod
  HostName <server address>
  User <ssh user>
  IdentityFile ~/.ssh/<your key>
```

Check it works with `ssh acme-staging true` (no password prompt), then run `/figmawp:bootstrap` and give it the alias names. wp-cli must be installed on the servers.

**Production is guarded:** you type the host name to confirm, the database is backed up and every script is dry-run first, and only files are pushed unless you add `--content`. `pull` never writes to production.

---

## What it will never do

- **Never** changes token values in Figma, and never edits a design without a plan you approved. It only adds notes (layer names and variables change only during `migrate`, after you confirm).
- **Never** commits, merges or opens PRs unless your profile allows it (`git.agentCommits`). It works on a `figma-sync/<date>` branch and leaves review to you.
- **Never** edits the parent theme or the parent theme's blocks plugin. If they need a change, it writes an issue draft in `.figmawp/notes/`.
- **Never** pushes a whole database up, and never writes to production without your typed confirmation and a backup.
- **Never** reads your SSH config, keys or `wp-config.php` secrets.
- **Never** renames token slugs that live content already uses.

---

## What it adds to your theme repo

```
.figmawp/
  profile.json    project settings (commit this)
  state.json      last sync, open drift (commit this)
  local.json      your machine's local URL and paths (git-ignored)
  activity.md     a dated log of pushes and pulls (commit this)
  snapshots/      what Figma looked like at the last sync
  drift/          drift reports per environment
  notes/          issue drafts for the parent theme and its blocks plugin
  build/          content scripts (pages, photos, forms…) that push runs on each server
  reports/        push, pull and check reports
  pull/           what each source looked like at the last pull, for the next "what changed" list
```

---

## Notifications in Figma (optional)

By default, drift shows up as **Dev Mode annotations**, which need no setup. To also post a real Figma **comment** that notifies designers, set a Figma personal access token:

```sh
export FIGMA_TOKEN=figd_…   # Figma → Settings → Security → Personal access tokens
```

---

## Troubleshooting

| Problem | Fix |
|---|---|
| `/figmaWP:…` commands don't appear | Run `figmawp doctor`, then restart Claude Code |
| "Figma MCP not connected" | Run `/mcp` → connect Figma, then `/figmawp:bootstrap` again |
| Safari checks fail | Enable *Allow Remote Automation* (see one-time setup) and restart Claude Code |
| "/discovery not found" | Run `figmawp install` again |
| Sync wants to regenerate everything | There's no baseline yet. Re-run `/figmawp:bootstrap` and answer "yes" when asked whether the theme already matches Figma |
| Push says the alias doesn't connect | Run `ssh <alias> true` yourself. Fix `~/.ssh/config` or load your key (`ssh-add`) until it works without a prompt |
| Push or pull refuses an environment | It has no `ssh` alias, or it's marked `read-only`. Re-run `/figmawp:bootstrap` to set it up |
| Photos aren't exported | Install the encoder named in your profile's `images.encoder`, or set it to `null` to keep PNGs |
| Pull only shows a list | That's the default: it shows what changed first. Add `--full` to copy the database |

## Update or remove

```sh
npm update -g @iamdangavin/figmawp && figmawp update    # update
figmawp uninstall && npm rm -g @iamdangavin/figmawp     # remove
```

---

MIT © Dan Gavin
