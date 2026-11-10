# Block naming convention (`wp:` layers)

Figma layer names declare the block tree. A layer is a block **only** if its name starts with `wp:`; everything else is decoration (backgrounds, masks, spacers used only for design) and is skipped or folded into its parent's styles.

```
Frame "Home"                       → templates/front-page.html (via profile pathMap)
└ wp:group  (tagName=section)      → <!-- wp:group {"tagName":"section"} -->
  ├ wp:heading (level=2)           → <!-- wp:heading {"level":2} -->
  └ wp:columns                     → <!-- wp:columns -->
    ├ wp:column                    → <!-- wp:column -->
    │ └ wp:acme/card              → <!-- wp:acme/card /-->
    └ wp:column
      └ wp:image                   → <!-- wp:image -->
```

## Syntax
`wp:<block>[ (attr=value, attr=value)][ #anchor]`

- `<block>`: core blocks without the `core/` prefix (`group`, `columns`, `column`, `heading`, `paragraph`, `image`, `buttons`, `button`, `list`, `cover`, `navigation`, `template-part`, `post-content`, `query`…). Custom blocks use their full name (`base/hero`, `acme/card`).
- Attributes in parentheses are optional hints: `level=2`, `tagName=section`, `layout=flex`, `align=wide`, `slug=header` (template-part), `className=is-style-outline`.
- `#anchor` sets the `anchor` attribute.
- Text content comes from text layers; images from image fills (exported as assets).

## Mapping Figma properties to block attributes
| Figma | Block attribute |
|---|---|
| Auto layout direction horizontal + wrap | `layout: {type: "flex", flexWrap: "wrap"}` |
| Auto layout vertical | `layout: {type: "constrained"}` (group) or default flow |
| Gap bound to `spacing/*` | `style.spacing.blockGap: "var:preset|spacing|<slug>"` |
| Padding bound to `spacing/*` | `style.spacing.padding.*: "var:preset|spacing|<slug>"` |
| Fill bound to `color/*` | `backgroundColor: "<slug>"` |
| Text fill bound to `color/*` | `textColor: "<slug>"` |
| Text style `Heading/H2` | `level: 2` (heading) |
| Font size bound to `font-size/*` | `fontSize: "<slug>"` |
| Corner radius bound to `radius/*` | `style.border.radius: "var:preset|border-radius|<slug>"` |
| Frame width = `layout/wide-size` | `align: "wide"`; full width → `align: "full"` |

**Unbound raw values** (a hex color or pixel gap not bound to a variable) are reported as warnings: they should become variables first. Never hard-code them into markup without asking.

## Inference for unnamed layers (infer → confirm → rename)
When a converted frame has layers without `wp:` names, propose a tree:
| Figma structure | Inferred block |
|---|---|
| Horizontal auto layout whose children are similar-width frames | `columns` > `column` |
| Vertical/horizontal auto layout container with mixed children | `group` |
| Text layer using a `Heading/*` style | `heading` (level from style) |
| Other text layer | `paragraph` |
| Rectangle/frame with image fill and no children | `image` |
| Frame with image fill and children | `cover` |
| Instance of a component in `componentMap` | the mapped block |
| Instance named like a button | `buttons` > `button` |

Show the proposed tree to the user (via `/discovery`), and on approval rename the layers in Figma with `use_figma` (`node.name = "wp:…"`) so the next sync is exact.

## Code Connect
Optional later phase (`profile.codeConnect`). Not used in v1.
