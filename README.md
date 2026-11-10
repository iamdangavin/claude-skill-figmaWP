# figmaWP

**Keep a Figma design and a WordPress block theme in step, from inside Claude Code.**

figmaWP is a set of Claude Code skills for WordPress block child themes, including ones built on a parent theme and its own blocks plugin. It reads the Figma file, works out what changed since the last sync, and writes the matching theme changes on a git branch for you to review. It can also check local, staging or production for differences from the design and leave notes on the Figma layers involved.

```
          /figmaWP:sync-to-dev
 Figma  ───────────────────────────▶  WordPress theme
(design)  tokens, patterns, blocks   (review branch)
        ◀───────────────────────────
          /figmaWP:sync-to-figma
          notes on drifted layers
```

**Figma is the source of truth.** Design changes flow into the code. Anything found in the code flows back only as notes in Figma, and designs are never overwritten.

---

## Install (about 2 minutes)

```sh
npm i -g @iamdangavin/figmawp
figmawp install
```

Then **restart Claude Code**.

`figmawp install` adds the plugin to Claude Code. It also adds the `/discovery` interview skill if you don't have it yet; if you already have your own copy, it's left alone.

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

---

## Quick start

Open Claude Code in the site folder. The WordPress root or the child theme folder both work.

```sh
cd path/to/your-site
claude
```

**First time on a project:**

```
/figmaWP:bootstrap
```

Claude connects Figma and Safari, reads the theme and any project docs, and then asks you a few questions, such as which Figma file, what the staging URL is, and how tokens map. It saves the answers to `.figmawp/profile.json` in the child theme repo. Commit that file, and teammates can skip this step.

**Every session after that:**

```
/figmaWP:resume
```

It checks the connections, tells you where things stand, shows what changed in Figma since last time, and suggests the next step.

---

## The commands

| Command | Use it when… | What happens |
|---|---|---|
| `/figmaWP:bootstrap` | Setting up a project (or something's disconnected) | Connects Figma and Safari, analyzes the theme, asks setup questions, and writes `.figmawp/profile.json` |
| `/figmaWP:resume` | Starting a work session | Health check, recap, what's new in Figma, a drift check on local, and the recommended next step |
| `/figmaWP:sync-to-dev` | The designer updated Figma | Finds the changes and writes them to a `figma-sync/<date>` branch: colors, type and spacing in `theme.json`, patterns, templates, blocks and icons. Then checks the result in Safari |
| `/figmaWP:sync-to-figma staging` | You want to know whether the site still matches the design | Compares local, staging or production with Figma and adds a **Dev drift** note to each layer that differs |
| `/figmaWP:migrate` | A Figma file doesn't use our WordPress variable setup yet | Proposes a mapping, asks you to confirm, then sets up the WP variables in Figma. It can also name layers as blocks (see below) |

You don't have to remember the exact wording. Asking Claude "pull the latest from Figma" or "does staging match the design?" works too.

---

## A typical week

1. **Designer** updates the hero and tweaks the accent color in Figma.
2. **Developer** runs `/figmaWP:resume`, which reports "Figma has 2 changes: hero frame and color/primary."
3. Runs `/figmaWP:sync-to-dev`. Claude creates `figma-sync/2026-11-12`, updates `theme.json` and `patterns/hero.php`, and screenshots local next to the Figma frame.
4. Developer reviews the branch, adjusts anything needed, then commits and merges as usual.
5. Before launch, runs `/figmaWP:sync-to-figma staging`. Someone changed a button color in the Site Editor on staging, so a **Dev drift** note appears on that button in Figma. The designer decides whether to adopt it.

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

## What it will never do

- **Never** changes designs or variable values in Figma. It only adds notes (layer names and variables change only during `migrate`, after you confirm).
- **Never** commits to `main`, pushes, or merges. It works on a `figma-sync/<date>` branch and leaves review to you.
- **Never** edits the parent theme or the parent theme's blocks plugin. If they need a change, it writes an issue draft in `.figmawp/notes/`.
- **Never** writes to staging or production. Those are viewed in Safari only.
- **Never** renames token slugs that live content already uses.

---

## What it adds to your theme repo

```
.figmawp/
  profile.json    project settings (commit this)
  state.json      last sync, open drift (commit this)
  local.json      your machine's local URL and paths (git-ignored)
  snapshots/      what Figma looked like at the last sync
  drift/          drift reports per environment
  notes/          issue drafts for the parent theme and its blocks plugin
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
| "Figma MCP not connected" | Run `/mcp` → connect Figma, then `/figmaWP:bootstrap` again |
| Safari checks fail | Enable *Allow Remote Automation* (see one-time setup) and restart Claude Code |
| "/discovery not found" | Run `figmawp install` again |
| Sync wants to regenerate everything | There's no baseline yet. Re-run `/figmaWP:bootstrap` and answer "yes" when asked whether the theme already matches Figma |

## Update or remove

```sh
npm update -g @iamdangavin/figmawp && figmawp update    # update
figmawp uninstall && npm rm -g @iamdangavin/figmawp     # remove
```

---

MIT © Dan Gavin
