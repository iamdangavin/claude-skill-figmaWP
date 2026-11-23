# Figma snapshot format

A snapshot is a normalized, deterministic JSON of the parts of the Figma file figmaWP syncs. It is built through the Figma MCP (no REST token) and diffed with `scripts/snapshot-diff.mjs`.

```json
{
  "schemaVersion": 1,
  "fileKey": "abc123…",
  "takenAt": "ISO",
  "variables": {
    "<VariableID>": { "name": "color/primary", "collection": "WP Color", "type": "COLOR",
                      "values": { "Default": "#0055ff" }, "alias": { "Default": "Brand/Teal/400" },
                      "codeSyntax": "var(--wp--preset--color--primary)", "scopes": ["ALL_FILLS"] }
  },
  "textStyles": {
    "<StyleID>": { "name": "Heading/H2", "fontFamily": "font-family/heading", "fontSize": "font-size/x-large",
                   "lineHeight": 1.2, "fontWeight": 700, "letterSpacing": 0 }
  },
  "components": {
    "<NodeID>": { "name": "Card", "block": "acme/card", "props": { "variant": ["default", "featured"] },
                  "tree": "wp:group>wp:image+wp:heading+wp:paragraph", "hash": "<stable hash of bound styles>" }
  },
  "frames": {
    "<NodeID>": { "name": "Home", "page": "Templates", "dest": "templates/front-page.html",
                  "tree": "wp:group(tagName=section)>wp:heading(level=2)+wp:columns>wp:column*2",
                  "bindings": { "<childId>": { "fill": "color/base", "gap": "spacing/50" } },
                  "warnings": ["12:40 raw fill #f3f3f3"] }
  },
  "assets": {
    "<NodeID>": { "name": "icon/arrow", "format": "svg", "dest": "assets/icons/arrow.svg", "hash": "<hash of export settings + geometry ids>" }
  },
  "images": {
    "<NodeID>": { "name": "Hero / About", "frame": "<frameId>", "size": [1440, 560],
                  "imageHash": "a1b2…", "scaleMode": "FILL", "transform": [[1, 0, 0], [0, 1, 0]],
                  "rotation": 0, "filters": { "exposure": 0.1, "contrast": 0.05 },
                  "otherFills": ["GRADIENT_LINEAR"], "dest": { "page": "about", "block": "core/cover", "nth": 1 } }
  }
}
```

## Building it
Run one `use_figma` call per section that **reads only** (no mutations) and returns JSON:
- Variables: `figma.variables.getLocalVariableCollectionsAsync()` + `getVariableByIdAsync` for each id; resolve aliases to names.
- Text styles: `figma.getLocalTextStylesAsync()`, reading `boundVariables`.
- Components / frames: walk the pages listed in `profile.figma.pages` (use `figma.setCurrentPageAsync`), serialize `wp:` trees and variable bindings. Skip hidden layers.
- Assets: nodes with export settings, or named `icon/*` / `logo/*`.
- Images: every visible node inside the walked frames (and components) with a visible `IMAGE` fill. Record the paint's `imageHash`, `scaleMode`, `imageTransform` (rounded to 4 places), `rotation` and non-zero `filters`, the node's rounded `size` (it changes the crop), and the types of its other visible fills (`otherFills`). Copy `dest` from `profile.images.map` when the node is mapped. Two nodes using the same photo are still two entries. A changed `imageHash`, filter, crop or size marks the image changed; that's how a swapped or re-graded photo is found. Don't key images by frame name: frames get renamed, node ids don't.

Sort keys, drop volatile fields (positions that don't affect layout, timestamps, selection), and write to `.figmawp/snapshots/figma-<date>.json`. Large files: snapshot page by page and merge.

## Scoped snapshots
sync-to-dev can snapshot only some nodes (Figma URLs, node ids, or frame/page names). A scoped snapshot has the same format plus `"scope": ["<NodeID>", …]` and contains only:
- the frames, components, assets and images inside those nodes;
- the variables and text styles they use (followed through aliases).

Diff it against `figma-latest.json` with `snapshot-diff.mjs --scope`. Keys outside the scope are ignored instead of being reported as removed: a previous entry counts as removed only when its key is in `scope` or its `frame` is (so a deleted photo inside a scoped frame is still found). Variables and text styles are never reported removed by a scoped diff. After a successful sync, **merge** it into `figma-latest.json` (`snapshot-diff.mjs --merge`): scoped keys are replaced, every other key is kept.

## Diffing
```sh
node <plugin>/scripts/snapshot-diff.mjs .figmawp/snapshots/figma-latest.json .figmawp/snapshots/figma-<date>.json
# exit 0 = no changes, 2 = changes, 1 = error;  --json for machine output
node <plugin>/scripts/snapshot-diff.mjs <latest> <scoped> --scope          # diff only the keys the scoped snapshot has
node <plugin>/scripts/snapshot-diff.mjs <latest> <scoped> --merge <out>    # write latest with the scoped keys replaced
```
Promote the new snapshot to `figma-latest.json` **only after** the sync branch is written, so a failed sync is retried next time.
