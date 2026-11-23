# Changelog

## 0.2.0 (unreleased)

### Breaking: the plugin is now `figmawp` (was `figmaWP`)
Claude's plugin directory requires kebab-case plugin names (lowercase letters, digits and hyphens), so the plugin is renamed and every command is now lowercase:

| 0.1.x | 0.2.0 |
|---|---|
| `/figmaWP:bootstrap` | `/figmawp:bootstrap` |
| `/figmaWP:sync-to-dev` | `/figmawp:sync-to-dev` |
| `/figmaWP:sync-to-figma` | `/figmawp:sync-to-figma` |
| `/figmaWP:migrate` | `/figmawp:migrate` |
| `/figmaWP:resume` | `/figmawp:resume` |

The npm package (`@iamdangavin/figmawp`), the `figmawp` CLI, the marketplace name and the `.figmawp/` folder are unchanged. To upgrade: `npm update -g @iamdangavin/figmawp && figmawp update`; `update` uninstalls the old `figmaWP@figmawp` plugin and installs `figmawp@figmawp`, so the commands don't show up twice. Restart Claude Code afterwards. "figmaWP" is still the product name in docs.

### Added
- **`/figmawp:push --staging | --prod`**: push the theme (and listed plugins) plus pending build scripts over a `~/.ssh/config` alias. Before changing anything it checks the server folder belongs to the right site, backs up the database and theme, shows an rsync dry run, and dry-runs each script. Production needs the host name typed and gets files only unless you add `--content`.
- **`/figmawp:pull --prod | --staging`**: the flag is the source. `--prod` pulls to local and staging in one run (`--to` narrows it). By default it only shows what changed on each side since the last pull, from content manifests; `--full` replaces the target databases after a backup, fixes URLs, copies new uploads, and re-runs build scripts the source doesn't have. Never writes to production. Applying only the changes you pick comes in 0.3.0.
- **Image changes are detected**: snapshots track each image fill's file, filters, crop and size, so a swapped or re-graded photo is a change.
- **Image pipeline**: export (the fill alone or the layer as designed, decided per project and per image), encode, and a build script that imports by file name and sets Cover, Image, Media & Text or featured images.
- **Scoped sync**: `/figmawp:sync-to-dev <Figma URL | node id | frame name>`; only those parts of the baseline snapshot are replaced.
- Scripts: `encode-images.mjs`, `manifest-diff.mjs`; `snapshot-diff.mjs --scope` and `--merge`. PHP: `set-block-image.php`, `content-manifest.php`.
- `figmawp doctor` checks rsync, Playwright and the image encoders it finds.

### Changed
- **Profile schema version 2**: environment `access`, `ssh` alias, `wpRoot` and `backups`; `push`, `images` and `git` settings; `figma.agentEdits`; `tokens.mobileFrames` is now `"none" | "reference" | "source"` (version 1 `true`/`false` still read), plus `blocks.mobilePairs`. Version 1 profiles keep working; resume offers the upgrade.
- **Nothing project-specific is assumed**: image effects, formats and sizes, viewport widths, mobile designs, server folders and push excludes are detected where possible and asked in bootstrap's `/discovery` interview.
- **Guardrails** rewritten: Figma owns tokens; design authoring needs an approved plan; environment rules follow `access`; SSH only through the alias (never reading SSH config or keys); no whole-database pushes; secrets never read.
- Verification prefers headless Playwright and uses the profile's viewport widths.

## 0.1.3
- Bootstrap reads existing project docs and memory before asking; migrate keeps the theme's slugs.
