# Token convention (Figma variables ⇄ theme.json)

This is the variable convention figmaWP uses between Figma and theme.json: three collections, `WP Color`, `WP Typography` and `WP Spacing`, with fixed names, scopes and Code syntax. Any Figma file or plugin that follows it works with figmaWP.

**Slugs vs. convention:** the tables below give the convention's *default* slugs. On a site with `tokens.slugStrategy: "keep-theme"`, the theme's existing slugs win: `tokens.slugMap` decides the slug, and this file only supplies the structure (collections, modes, scopes, code-syntax shape, and where each kind of token lands in theme.json). Example: a theme with `surface`/`ink`/`brand-1…3` keeps those slugs; the WP variable is `color/brand-1` with Code syntax `var(--wp--preset--color--brand-1)`.

## Collections and modes
- `WP Color`: one mode. An extra `Dark` mode exports as `styles/dark.json`.
- `WP Typography`, `WP Spacing`: `Desktop` + `Mobile` modes. Differing values become fluid `clamp()` between the widths in `layout/viewport` (default 390 → 1728).

## Tokens
| Figma variable | theme.json |
|---|---|
| `color/white`, `color/black` (fixed in every mode) | `settings.color.palette` |
| `color/base`, `color/contrast` (background / main text roles; swap in Dark) | `settings.color.palette` |
| `color/primary`, `accent`, `highlight` | `settings.color.palette` |
| `font-family/copy`, `heading`, `display`, `mono` (fallback stack in description: `fallback: Arial, sans-serif`) | `settings.typography.fontFamilies` |
| `font-size/small` … `xx-large` | `settings.typography.fontSizes` |
| `spacing/20` … `spacing/80` (50 = medium). Defaults Desktop 6/12/24/48/96/120/160, Mobile 6/12/16/24/48/72/96 | `settings.spacing.spacingSizes` |
| `radius/small`, `medium`, `large`, `full` | `settings.border.radiusSizes` |
| `layout/content-size`, `layout/wide-size` | `settings.layout` |
| `layout/block-gap` | `custom.spacing.blockGap` → `styles.spacing.blockGap` |
| `layout/root-padding` | `custom.spacing.rootPadding` → `styles.spacing.padding` + `useRootPaddingAwareAlignments` |
| `layout/section-gap` | `custom.spacing.sectionGap` |
| Colors in other collections (e.g. `Brand/Teal/400`) | Palette, unless hidden from publishing |

Extra tokens: a variable in a `WP …` collection whose **Code syntax → Web** is a WordPress variable (e.g. `var(--wp--preset--spacing--90)`) is used as-is.

## Text styles
`Body` and `Heading/H1` … `Heading/H6` → `custom.typography.root` / `heading` / `heading.1–6`, plus matching `styles.typography` and `styles.elements`. A text style whose font size is bound to a `font-size/*` variable becomes a preset reference (and fluid).

## Required scopes and code syntax (what migrate must set)
| Collection / group | Scopes | Code syntax (Web) |
|---|---|---|
| `color/*` | ALL_FILLS, STROKE_COLOR, EFFECT_COLOR | `var(--wp--preset--color--<slug>)` |
| `font-family/*` | FONT_FAMILY | `var(--wp--preset--font-family--<slug>)` |
| `font-size/*` | FONT_SIZE | `var(--wp--preset--font-size--<slug>)` |
| `spacing/*` | GAP, WIDTH_HEIGHT | `var(--wp--preset--spacing--<slug>)` |
| `radius/*` | CORNER_RADIUS | `var(--wp--preset--border-radius--<slug>)` |
| `layout/*` | WIDTH_HEIGHT, GAP | `var(--wp--style--global--content-size)` etc. |

## Applying token changes to the theme
1. Build a theme.json fragment from the current Figma variables (only the presets and custom values Figma owns).
2. Preview: `node <plugin>/scripts/merge-theme-json.mjs <theme>/theme.json <fragment>.json`
3. Apply: same command with `--write`. Presets merge **by slug**; hand-written fields (`fontFace`, element/block styles) survive.
4. Renamed or removed slugs: write a slug map and run `node <plugin>/scripts/migrate-slugs.mjs <theme-dir> <map>.json` (dry run first, then `--write`). It rewrites templates/parts/patterns/CSS/JS and writes `slug-migration.sh` with `wp search-replace --dry-run` commands. **Run DB commands on local only**, and only when the user asks.
