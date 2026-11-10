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
  state.json            last sync / drift / migration state (committed)
  snapshots/
    figma-latest.json   normalized Figma snapshot from the last accepted sync
    figma-<date>.json   history (keep the last 5)
  drift/
    <env>-<date>.md     drift reports from sync-to-figma
  notes/
    parent-<date>.md    issue drafts for the read-only parent theme
```

Add `.figmawp/local.json` to the child theme's `.gitignore`.

## profile.json

```json
{
  "schemaVersion": 1,
  "figma": {
    "fileKey": "abc123…",
    "fileUrl": "https://www.figma.com/design/abc123…/Site",
    "pages": { "tokens": "0:1", "components": "1:2", "templates": "3:4" },
    "convention": "wp-collections"
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
    "local":      { "url": "http://acme.local", "access": "full" },
    "staging":    { "url": "https://staging.example.com", "access": "read-only" },
    "production": { "url": "https://example.com", "access": "read-only" }
  },
  "tokens": {
    "source": "wp-collections",
    "collections": ["WP Color", "WP Typography", "WP Spacing"],
    "slugStrategy": "keep-theme",
    "slugMap": {
      "color/surface": "surface",
      "Brand/brand-1": "brand-1"
    },
    "viewport": { "min": 390, "max": 1440 },
    "mobileFrames": false,
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
    }
  },
  "conventions": {
    "patternHeader": "Title, Slug, Categories, Inserter (PHP comment header)",
    "notes": "Free-text conventions captured during bootstrap discovery."
  },
  "codeConnect": false
}
```

- Paths in `theme` are relative to the child theme root; `blocksPlugin.repoPath` and `parentReference.*` are relative to the child theme root too.
- `local.json` may override any `environments.local` field and any path (teammates' MAMP setups differ).
- `blocksPlugin` may be `null` when the site has no companion blocks plugin (only the parent theme's read-only blocks plugin, if any). Sync then asks where new block work goes (see sync-to-dev).
- `tokens.source`: `"wp-collections"` (the file uses the WP Color/Typography/Spacing convention) or `"own-collections"` (the file uses its own collections, listed in `tokens.collections`, e.g. `["Brand", "Scale", "Layout"]`).
- `tokens.slugStrategy`:
  - `"keep-theme"` (default for a theme with content already live): Figma variables map onto the slugs **already in theme.json**, via `tokens.slugMap`. Never rename a slug that content uses.
  - `"wp-defaults"` (new themes only): use the convention's default slugs (spacing 20–80, font-size small…xx-large).
- `tokens.slugMap`: Figma variable name (`Collection/path` or `path`) → theme.json slug. It's authoritative for sync. Unmapped variables are reported, never guessed.
- `tokens.mobileFrames: false`: there are no mobile designs, so `clamp()` minimums are proposals and the Mobile modes are not a source of truth.
- `tokens.docs`: existing project docs that describe the Figma → theme mapping. Read them before any token work and keep them updated.
- `componentMap`: Figma component name → block name. Used for custom components not expressed through `wp:` layer names.
- `pathMap`: Figma frame name → destination file. Unmapped frames are asked about during sync.

## state.json

```json
{
  "lastSync":   { "at": "ISO", "branch": "figma-sync/2026-11-10", "repos": ["child", "blocks"], "snapshot": "snapshots/figma-2026-11-10.json", "status": "awaiting-review" },
  "lastDrift":  { "local": "ISO", "staging": "ISO", "production": "ISO" },
  "openDrift":  [{ "env": "staging", "nodeId": "12:34", "summary": "…", "annotated": true, "commentId": null }],
  "migration":  { "variables": "done", "blockNaming": { "Home": "done", "About": "pending" } }
}
```
