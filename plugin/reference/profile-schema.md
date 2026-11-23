# `.figmawp/` layout and profile schema

`.figmawp/` lives at the root of the **child theme repo** and is committed (except `local.json`).

## Finding the project
Sessions often start in the WordPress root, not the theme. Every figmaWP skill locates the child theme in this order:
1. The current directory or an ancestor containing `.figmawp/profile.json`.
2. From a WordPress root (a directory with `wp-config.php` and `wp-content/`), or from any directory inside one: each `wp-content/themes/*/` that has `.figmawp/profile.json`.
3. (bootstrap only) A child block theme: `wp-content/themes/*/style.css` with a `Template:` header and a `theme.json`, whose folder is a git repo. If exactly one exists, use it; if several exist, ask.

Use the WordPress root (the ancestor with `wp-config.php`) for wp-cli `--path`.

```
.figmawp/
  profile.json          shared project config (committed)
  local.json            per-machine overrides: local URL, paths (gitignored)
  state.json            last sync / drift / migration / push / pull state (committed)
  activity.md           dated log of every push and pull (committed)
  snapshots/
    figma-latest.json   normalized Figma snapshot from the last accepted sync
    figma-<date>.json   history (keep the last 5)
  drift/
    <env>-<date>.md     drift reports from sync-to-figma
  notes/
    parent-<date>.md    issue drafts for the read-only parent theme
  build/
    <YYYY-MM-DD>/*.php  idempotent `wp eval-file` content scripts (pages, media, forms…), run by push
  reports/
    <date>-<skill>-<env>.md   push / pull / verification reports
  pull/
    <source>-manifest.json    content manifest at the last pull (paths, titles, hashes; no content)
```

Add `.figmawp/local.json` to the child theme's `.gitignore`.

## profile.json

```json
{
  "schemaVersion": 2,
  "figma": {
    "fileKey": "abc123…",
    "fileUrl": "https://www.figma.com/design/abc123…/Site",
    "pages": { "tokens": "0:1", "components": "1:2", "templates": "3:4" },
    "convention": "wp-collections",
    "agentEdits": "approved"
  },
  "theme": {
    "slug": "acme-child",
    "parent": "base-theme",
    "themeJson": "theme.json",
    "styleVariations": "styles/",
    "templates": "templates/",
    "parts": "parts/",
    "patterns": "patterns/",
    "blockStyles": "block-styles.js",
    "assets": "assets/"
  },
  "blocksPlugin": {
    "slug": "acme-blocks",
    "namespace": "acme",
    "repoPath": "../../plugins/acme-blocks",
    "blocksDir": "src/blocks",
    "build": "npm run build"
  },
  "parentReference": {
    "path": "../base-theme",
    "blocksPlugin": "../../plugins/base-blocks",
    "namespace": "base"
  },
  "environments": {
    "local":      { "url": "https://acme.local", "access": "full", "wpRoot": "/Users/me/Sites/acme", "wp": "wp" },
    "staging":    { "url": "https://staging.example.com", "access": "push",
                    "ssh": "acme-staging", "wpRoot": "<detected at bootstrap>" },
    "production": { "url": "https://example.com", "access": "push-guarded",
                    "ssh": "acme-prod", "wpRoot": "<detected at bootstrap>" }
  },
  "push": {
    "theme": true,
    "plugins": [],
    "excludes": [".git/", ".gitignore", ".DS_Store", "node_modules/", "/.figmawp/"],
    "afterPush": ["wp cache flush"]
  },
  "images": {
    "map": {
      "<NodeID>": { "name": "Hero / About", "page": "about", "block": "core/cover", "nth": 1, "file": "hero-about" }
    },
    "export": "fill",
    "dropFills": [],
    "originals": "assets/images/originals",
    "compressed": "assets/images/compressed",
    "scale": 2,
    "maxDimension": 2560,
    "format": "webp",
    "encoder": "cwebp -q 82 {in} -o {out}",
    "blockDefaults": { "core/cover": { "dimRatio": 50, "focal": [0.5, 0.5] } }
  },
  "git": { "agentCommits": false, "branching": "figma-sync" },
  "tokens": {
    "source": "wp-collections",
    "collections": ["WP Color", "WP Typography", "WP Spacing"],
    "slugStrategy": "keep-theme",
    "migrationMode": "copy",
    "slugMap": {
      "color/surface": "surface",
      "Brand/brand-1": "brand-1"
    },
    "viewport": { "min": 375, "max": 1440 },
    "mobileFrames": "reference",
    "docs": ["docs/design-tokens.md"]
  },
  "blocks": {
    "prefix": "wp:",
    "componentMap": {
      "Hero": "base/hero",
      "Card": "acme/card"
    },
    "pathMap": {
      "Home": { "type": "template", "file": "templates/front-page.html" },
      "Hero / Default": { "type": "pattern", "file": "patterns/hero-default.php" }
    },
    "mobilePairs": { "Home": "Home / Mobile" }
  },
  "conventions": {
    "patternHeader": "Title, Slug, Categories, Inserter (PHP comment header)",
    "notes": "Free-text conventions captured during bootstrap discovery."
  },
  "codeConnect": false
}
```

**Every value above is an example, not a default.** Bootstrap detects what it can and asks the rest through `/discovery`. Nothing project-specific (image effects, formats, viewport sizes, server paths, mobile designs) is assumed.

- `schemaVersion`: 2 adds `environments.*.access/ssh/wpRoot`, `push`, `images`, `git`, `figma.agentEdits` and the string form of `tokens.mobileFrames`. A version 1 profile still works: staging and production stay `read-only` (so push and pull refuse them), there is no image pipeline until `images` is set, and `/figmawp:resume` offers to add the new keys through `/discovery`.
- Paths in `theme` are relative to the child theme root; `blocksPlugin.repoPath` and `parentReference.*` are relative to the child theme root too.
- `local.json` may override any `environments.local` field, any path, and the `ssh` alias and `wpRoot` of any environment (teammates' local setups and SSH aliases differ).

### environments
- `access` decides what skills may do there (full table in guardrails.md):
  - `full`: local. Files, wp-cli, build scripts.
  - `push`: staging. `/figmawp:push --staging` (files and content); a target of `/figmawp:pull`.
  - `push-guarded`: production. `/figmawp:push --prod` with typed confirmation, files only unless `--content`. A source of `/figmawp:pull`, never a target.
  - `read-only`: Safari/Playwright reads only (the version 1 behaviour, and the default when `ssh` is missing).
- `ssh`: a **Host alias from the user's `~/.ssh/config`**, nothing else. Never store a host name, user, port, key path or password in the profile, `local.json`, reports or commands. Missing `ssh` means the environment can't be pushed to or pulled from.
- `wpRoot`: the WordPress root **for this site** on that server (`~` allowed). One server often hosts several sites, so it's never guessed from a naming pattern: bootstrap finds the candidates over SSH and picks the one whose `home` option matches `url` (see bootstrap). Every push and pull re-checks that match before touching anything.
- Theme, plugin and uploads folders on a server are **asked of WordPress each time** (`wp eval 'echo get_theme_root();'`, `wp plugin path`, `wp eval 'echo wp_upload_dir()["basedir"];'`), never assumed to be `wp-content/…`, because hosts move them.
- `wp`: the wp-cli command for local when it isn't `wp` on the PATH (for example a bundled PHP: `PATH=<php bin dir>:$PATH <path to wp>`). Usually set in `local.json`.
- `backups` (optional): where push and pull keep database backups on that machine. Defaults: `~/figmawp-backups` on servers, `<wpRoot>/../figmawp-backups` locally (outside the web root).
- Any environment whose host contains `prod` or `production` is treated as `push-guarded` at most, whatever the profile says.

### push
- `theme`: rsync the child theme into the server's theme root as `<theme.slug>/`, with `--delete`.
- `plugins`: other repos to rsync the same way, as `{ "path": "../../plugins/acme-blocks", "slug": "acme-blocks", "build": "npm run build" }`. The companion blocks plugin is listed here when it should be pushed.
- `excludes`: rsync `--exclude` patterns. Bootstrap proposes them from what's actually in the repo (docs folders, editor project files, image masters, build sources) and asks. `.git/` and `/.figmawp/` are always excluded.
- `afterPush`: shell commands run in `wpRoot` on the target after files and content, e.g. `wp cache flush`, `wp eval 'wp_get_theme()->delete_pattern_cache();'` (needed when the theme registers file patterns), or a host's own cache purge.

### images
Only used when the project has photos in Figma that live in WordPress. Every setting is a `/discovery` answer at bootstrap, because projects differ.
- `map`: Figma node id → where the image lives in WordPress, asked once per new image by sync-to-dev and saved here. `page` is a page path (never an ID); `block` is `core/cover`, `core/image`, `core/media-text` or `featured` (the page's featured image); `nth` picks the block (1-based, document order, nested included); `file` is the base file name. Other targets: `{ "post_type": "wp_template_part", "slug": "header", … }`, `{ "post_type": "wp_block", "title": "Hero", … }`, or `{ "themeFile": "assets/images/hero.webp" }` for an image a theme file references directly. Any `images.*` setting below can be overridden per entry (for example `"export": "node"` on one image).
- `export`: what to render from Figma.
  - `"fill"`: only the node's image fill (with its own filters, crop and transform). Effects the theme adds itself in CSS (overlays, gradients, grain, duotone) stay out of the photo. Other fills on the node are kept unless listed in `dropFills`.
  - `"node"`: the node exactly as designed (all fills, effects and visible children), for projects where the image in WordPress should look like the Figma layer with everything baked in.
- `dropFills`: with `export: "fill"`, other fill types on the node to leave out (for example `["SHADER", "GRADIENT_LINEAR"]` when the theme recreates them). Empty by default: nothing is dropped unless the project says so.
- `originals`: where full-size PNG exports are kept (gitignore it and add it to `push.excludes` if it's large), or `null` to keep them only in the scratch folder. `compressed`: the files that get imported.
- `scale`, `maxDimension`: export scale (×) and the longest side in pixels. Choose from the site's largest rendered size and the uploads policy (WordPress scales anything over 2560 px down, so above that the original is kept as `-scaled`).
- `format` + `encoder`: the output format (`avif`, `webp`, `jpg`, or `png`) and the command that makes it (`{in}` and `{out}` placeholders, or appended). `encoder: null` imports the PNG unchanged. Bootstrap checks the tool is installed and that the server's WordPress can make sub-sizes of the format (`wp eval 'echo wp_image_editor_supports(["mime_type"=>"image/avif"]) ? "yes" : "no";'`).
- `blockDefaults`: attributes set on a block when the pipeline first puts an image on it, per block type (for a Cover: `dimRatio`, `focal`). Existing values on a block are kept.

### git
- `agentCommits`: `false` (default) means skills never commit or stage; they show `git status` and the user commits.
- `branching`: `"figma-sync"` (sync-to-dev creates `figma-sync/<date>[-<scope>]`) or `"current"` (work on the current branch, never the default branch unless the user says so).

### figma
- `agentEdits`: `"approved"` (default) lets `/figmawp:design` author components, frames and prototypes after the user approves a plan; `"never"` keeps figmaWP report-only in Figma (annotations and migrate only).

### tokens and blocks
- `blocksPlugin` may be `null` when the site has no companion blocks plugin (only the parent theme's read-only blocks plugin, if any). Sync then asks where new block work goes (see sync-to-dev).
- `tokens.source`: `"wp-collections"` (the file uses the WP Color/Typography/Spacing convention) or `"own-collections"` (the file uses its own collections, listed in `tokens.collections`, e.g. `["Brand", "Scale", "Layout"]`).
- `tokens.slugStrategy`:
  - `"keep-theme"` (default for a theme with content already live): Figma variables map onto the slugs **already in theme.json**, via `tokens.slugMap`. Never rename a slug that content uses.
  - `"wp-defaults"` (new themes only): use the convention's default slugs (spacing 20–80, font-size small…xx-large).
- `tokens.migrationMode`: how `/figmawp:migrate` fills the WP variables. `"copy"` (default) copies the values in, so the WP collections become the only source and the old collections are hidden; `"alias"` makes the WP variables reference the old ones.
- `tokens.slugMap`: Figma variable name (`Collection/path` or `path`) → theme.json slug. It's authoritative for sync. Unmapped variables are reported, never guessed.
- `tokens.viewport`: the narrowest and widest widths the design targets. Fluid `clamp()` values run between them, and every check screenshots at both. Read from the Figma frame widths and confirmed; never assumed.
- `tokens.mobileFrames`: what the file's small-screen frames are for. Bootstrap counts frames by width and asks; there's no default.
  - `"none"`: no small-screen designs. Mobile token values (`clamp()` minimums) are proposals for the user to confirm, and checks at `viewport.min` look for breakage only.
  - `"reference"`: some small-screen frames exist, but the desktop frames built with auto-layout are the structure. The small frames are used as visual targets in checks (their screenshot next to the site at `viewport.min`) and for spotting intended differences (hidden or reordered sections). They don't create separate markup.
  - `"source"`: small-screen frames are maintained designs. Their differences from the desktop frame become responsive rules (CSS at the breakpoint, block visibility, stacking settings), and the Mobile token modes are a source of truth.
  - Version 1 `true`/`false` read as `"source"`/`"none"`.
  - Whatever the value, Figma authoring (`/figmawp:design`) only creates small-screen frames when the value is `"reference"` or `"source"` and the user asks for them.
- `tokens.docs`: existing project docs that describe the Figma → theme mapping. Read them before any token work and keep them updated.
- `blocks.componentMap`: Figma component name → block name. Used for custom components not expressed through `wp:` layer names.
- `blocks.pathMap`: Figma frame name → destination file. Unmapped frames are asked about during sync.
- `blocks.mobilePairs`: desktop frame → its small-screen frame, when `mobileFrames` isn't `"none"`. Found by name and page at bootstrap (e.g. `Home` / `Home – Mobile`), confirmed, and asked about for new frames during sync.

## state.json

```json
{
  "lastSync":   { "at": "ISO", "branch": "figma-sync/2026-11-10", "repos": ["child", "blocks"], "snapshot": "snapshots/figma-2026-11-10.json", "status": "awaiting-review" },
  "lastDrift":  { "local": "ISO", "staging": "ISO", "production": "ISO" },
  "openDrift":  [{ "env": "staging", "nodeId": "12:34", "summary": "…", "annotated": true, "commentId": null }],
  "migration":  { "variables": "done", "blockNaming": { "Home": "done", "About": "pending" } },
  "images":     { "<NodeID>": { "hash": "…", "file": "hero-about.webp", "at": "ISO" } },
  "lastPush":   { "staging": { "at": "ISO", "commit": "abc1234", "content": ["build/2026-11-20/contact-form.php"], "backup": "~/figmawp-backups/20261120-1532/db.sql", "report": "reports/2026-11-20-push-staging.md" } },
  "lastPull":   { "local": { "at": "ISO", "from": "production", "mode": "full", "backup": "../figmawp-backups/20261121-0910-before-pull.sql", "report": "reports/2026-11-21-pull-local.md" } },
  "pendingContent": { "staging": ["build/2026-11-20/contact-form.php"], "production": [] }
}
```
- `images`: what the image pipeline last exported per node, so an unchanged image is never re-imported.
- `lastPush` / `lastPull`: per target environment. Backup paths are on the target machine. A pull also writes `.figmawp/pull/<source>-manifest.json` (every post's type, path, modified date and content hash at pull time), which the next selective pull compares against.
- `pendingContent`: build scripts that have run on local but not yet on that environment. A script is added when it's written or changed, and removed when push runs it there.
