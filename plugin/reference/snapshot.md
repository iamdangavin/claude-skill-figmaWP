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
  }
}
```

## Building it
Run one `use_figma` call per section that **reads only** (no mutations) and returns JSON:
- Variables: `figma.variables.getLocalVariableCollectionsAsync()` + `getVariableByIdAsync` for each id; resolve aliases to names.
- Text styles: `figma.getLocalTextStylesAsync()`, reading `boundVariables`.
- Components / frames: walk the pages listed in `profile.figma.pages` (use `figma.setCurrentPageAsync`), serialize `wp:` trees and variable bindings. Skip hidden layers.
- Assets: nodes with export settings, or named `icon/*` / `logo/*`.

Sort keys, drop volatile fields (positions that don't affect layout, timestamps, selection), and write to `.figmawp/snapshots/figma-<date>.json`. Large files: snapshot page by page and merge.

## Diffing
```sh
node <plugin>/scripts/snapshot-diff.mjs .figmawp/snapshots/figma-latest.json .figmawp/snapshots/figma-<date>.json
# exit 0 = no changes, 2 = changes, 1 = error;  --json for machine output
```
Promote the new snapshot to `figma-latest.json` **only after** the sync branch is written, so a failed sync is retried next time.
