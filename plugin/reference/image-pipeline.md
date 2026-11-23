# Image pipeline (Figma image → WordPress)

Used by sync-to-dev for every **added or changed entry in the snapshot's `images` section** (a swapped photo, new filters, a new crop or size). Every setting comes from `profile.images` (profile-schema.md) and may be overridden per entry in `images.map`. If the profile has no `images` section, stop and ask the bootstrap image questions first (bootstrap Phase 4); never fall back to another project's settings.

Each step reports one line. Nothing is pushed anywhere; `/figmawp:push` runs the same build script later.

## 0. Map
For each changed image node without an entry in `images.map`, ask (via `/discovery`, one round for all of them):
- where it lives: page path + block type (`core/cover`, `core/image`, `core/media-text`, `featured`) + nth, a template part / synced pattern, or a theme file;
- the file base name (propose kebab-case from the node name);
- for this image only, whether the export setting differs from the project default (for example this one should be rendered with its overlay baked in).
Propose answers from the frame's `pathMap` destination and the node's position in the frame. Save them to `images.map`. An image the user marks "not in WordPress" is saved as `{ "skip": true }`.

## 1. Export from Figma (read-only for the design)
One `use_figma` call per batch (load `/figma-use` first). The temp frames are removed in a second call, always.

**`export: "fill"`**: a temporary frame holding the node's image fill (with its own filters, scale mode and transform), plus the node's other fills **except** the types in `dropFills`, at `scale` × the node size. No children, no effects.

**`export: "node"`**: a temporary clone of the node (`node.clone()`), with all its fills, effects and visible children, resized to `scale` × (use `rescale(scale)` so children and effects scale with it).

```js
const out = [];
for (const { id, mode, drop, scale } of ITEMS) {
  const src = await figma.getNodeByIdAsync(id);
  let page = src; while (page.type !== 'PAGE') page = page.parent;
  await figma.setCurrentPageAsync(page);
  const right = Math.max(...page.children.map((c) => c.x + c.width));
  let f;
  if (mode === 'node') {
    f = src.clone();
    page.appendChild(f);
    f.rescale(scale);
  } else {
    f = figma.createFrame();
    f.resize(src.width * scale, src.height * scale);
    f.fills = src.fills.filter((p) => p.visible !== false && !drop.includes(p.type));
    f.cornerRadius = 0; f.clipsContent = true;
  }
  f.name = `TMP figmaWP export ${id}`;
  f.x = right + 2000; f.y = out.length * (f.height + 200);
  out.push({ id, tmp: f.id, size: [src.width, src.height] });
}
return { createdNodeIds: out.map((o) => o.tmp), out };
```

- For each temp node: `get_screenshot` with `nodeId: <tmp>`, `contentsOnly: true`, `maxDimension: <maxDimension>`, **without** `enableBase64Response`. The result gives a short-lived `image_url`; download it right away with `curl -sfL -o <originals or scratch>/<file>.png "<url>"`. Don't print or save the URL anywhere.
- Then remove the temp nodes (`(await figma.getNodeByIdAsync(id))?.remove()` for each), even when a download failed. Report any you couldn't remove.
- Check each PNG's pixel size matches the node's aspect ratio.
- Transparent images (logos, cut-outs) need a format with alpha: warn if `format` is `jpg`.

## 2. Encode
```sh
node PLUGIN/scripts/encode-images.mjs --profile <theme>/.figmawp/profile.json <file>.png …
```
Writes `<compressed>/<file>.<format>` with `images.encoder` (or copies the PNG when it's `null`) and prints sizes before and after. It exits 1 if the encoder is missing: say which tool the profile's encoder needs and stop. Show the sizes; if a file is much larger than the site's other images, say so before importing.

## 3. Put it in WordPress (a build script)
- **Theme file target** (`themeFile`): copy the encoded file to that path in the theme. Done; it ships with the theme.
- **Everything else**: copy `PLUGIN/php/set-block-image.php` to `.figmawp/build/<YYYY-MM-DD>/images-<scope>.php` and fill in its `$images` list from the map. Use the compressed files' **paths relative to the child theme**, so the same script runs on every environment after push copies the theme (add the compressed folder to the theme, not to `push.excludes`). The script:
  - finds the target by page path, or post type + slug/title, never by ID;
  - imports the file **by file name**: an attachment with that name is replaced in place when its contents differ (same attachment and URL, old file backed up), created otherwise. No `-1`, `-2` duplicates;
  - sets it on the `nth` block of that type (Cover, Image, Media & Text) and updates the saved markup to match, or sets the featured image; `blockDefaults` apply only to attributes the block doesn't have yet;
  - backs up the post content before writing, and supports `dry`.

Run it on local: `wp eval-file <script> dry`, check the output, then without `dry`. Then open the page in the editor (or check for "This block contains unexpected or invalid content" with Playwright on `/wp-admin/post.php?post=<id>&action=edit` when logged in locally) to confirm the block still validates. Record `state.images[<nodeId>]` (hash and file name) and add the script to `state.pendingContent` for each push environment.

## 4. Verify
Playwright (or Safari) on each changed page at `tokens.viewport.max` and `tokens.viewport.min`: the image's `currentSrc` ends with the new file name, `naturalWidth > 0`, no console errors. Screenshot it next to `get_screenshot` of the Figma node for the report (and next to the paired small-screen frame when `blocks.mobilePairs` has one).

## Notes
- Focal point for a Cover: Fill (`scaleMode: "FILL"`) renders centred, so use `blockDefaults` (or 0.5, 0.5). For Crop, compute it from `imageTransform` (centre of the visible window: `x = t[0][2] + t[0][0] / 2`, `y = t[1][2] + t[1][1] / 2`) and report it.
- A removed image is reported, never deleted from the Media Library.
