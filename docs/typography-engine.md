# Typography motion engine

Typography is enabled with `"typography": "type-1"` and `"motionModel": "curves-1"` on a story or commerce scene. Story scenes also use `"authoringVersion": "1"`. Every text node in an enabled scene must name a `textRole` and resolve to a checksummed `fontAsset`, either directly or through a named style.

Enabled scenes use `story-canvas-0.22.0` or `commerce-canvas-0.21.0`. Existing scenes retain their previous renderer and drawing path. Source checksums include typography fields; renderer identity participates in the existing export cache identity.

## Styles and layout

```json
{
  "typography": "type-1",
  "motionModel": "curves-1",
  "authoringVersion": "1",
  "textStyles": {
    "display": {
      "fontAsset": "display-font",
      "size": 96,
      "tracking": -15,
      "leading": 1.12,
      "features": { "kern": 1, "liga": 1 }
    },
    "figures": {
      "fontAsset": "body-font",
      "size": 80,
      "figures": { "spacing": "tabular", "style": "lining" }
    }
  }
}
```

`tracking` is in thousandths of an em. `leading` is a multiple of size. `opticalTracking: true` supplies bounded tracking from +35 at small sizes to −25 at display sizes; explicit tracking wins. Font size may reach 640 px. Roles provide defaults: heading 1.12, label 1.28, qualification 1.4, body 1.5.

`case` accepts `none`, `upper`, `lower`, or `small-caps`. `figures` may be the shorthand `tabular`/`proportional`, or an object with `spacing` and optional `style` (`lining`/`oldstyle`). OpenType feature tags are allow-listed and checked against the pinned font. Fonts may declare `style: "italic"` and weights from 100 through 900. Variable metadata records each `fvar` axis as `{ "min": 62.5, "default": 100, "max": 100 }`; requested axes are checked against the actual font bytes.

Text nodes reference a style with `style: "display"`. `spans` use half-open **grapheme** offsets, not UTF-16 positions:

```json
{
  "id": "claim",
  "type": "text",
  "text": "Not every detail",
  "fontSize": 96,
  "color": "#292827",
  "textRole": "heading",
  "style": "display",
  "anchor": "cap",
  "wrap": "pretty",
  "textLayout": {
    "width": 1200,
    "height": 250,
    "lineHeight": 1.2,
    "overflow": "error"
  },
  "spans": [{ "id": "qualifier", "start": 0, "end": 3, "color": "#a4362f" }]
}
```

Spans must not overlap and must fit every state. A span can reference another named style. Color-only spans retain the same shaped run across their boundary. New template text uses cap alignment; nodes may choose `top`, `cap`, or `baseline`. Wrapping uses locale-aware word segmentation, with `greedy`, `balance` (up to four lines), and `pretty` modes. `orphanFraction` defaults to 0.2. Explicit newlines remain paragraph boundaries. The renderer caches shaped state layouts and complete run rasters before playback, including numeric and variable-axis variants. Component fitting uses these same layouts and picks one size across states.

## Text animation

Existing animator properties remain available. The new evaluator adds `tracking`, `leading`, `skew`, `baselineShift`, variable `axes` deltas, `fill`, `stroke`, and `strokeWidth`. `from` animates toward rest; `to` can hold a destination after completion. `layer`, `blend`, and `weight` use the motion layer order and blending rules.

```json
{
  "node": "claim",
  "unit": "glyph",
  "start": 0,
  "end": 40,
  "stagger": 1,
  "anchor": "glyph",
  "excludeSpaces": true,
  "mask": "line",
  "feather": 0.35,
  "selector": { "start": 0, "end": 1, "order": "center-out" },
  "from": { "offset": [0, 100], "opacity": 0, "tracking": 30 },
  "layer": "action"
}
```

`anchor` groups pivots by `glyph`, `word`, `line`, or `all`; optional `anchorAlign: [x, y]` chooses a normalized point. Whitespace takes no stagger slot by default. `mask` is `none`, `line`, or `word`. Feathering is a continuous gradient in em units; `lineOverlap` controls line cascades. Blur is applied once to the composed text layer.

Selectors support `square`, `ramp-up`, `ramp-down`, `triangle`, `round`, and `smooth` (`ramp` remains an alias). `easeHigh` and `easeLow` range from 0–100. `basedOn` is `clusters`, `words`, or `lines`. Ordering supports `forward`, `reverse`, `center-out`, and `seeded` with `seed`. Additional `selectors` combine using `mode: "add"` or `"intersect"`. A selector's `start`, `end`, and `offset` may be numbers, scalar key arrays, or `{ "signal": "margin", "scale": 1, "offset": 0 }`. An animator's `signal` directly controls its normalized progress. `span` limits it to a named span.

## Marks and source changes

`decorations` attach to a span or the whole text. Kinds are `underline`, `strike`, `highlight`, and `box`; fields include `color`, `thickness`, `offset`, `lineStyle` (`uniform`, `ink`, `brush`), and scalar `reveal` keys. Marks follow line breaks in reading order. Highlights sit behind type; strikes sit above it. Texture is fixed in text space.

A text node can provide one `transition` or an ordered `transitions` array:

```json
{
  "states": ["Supported categories", "Exact details"],
  "transition": {
    "kind": "crossfade",
    "window": { "start": 30, "end": 80 },
    "easing": "in-out-cubic"
  }
}
```

Kinds: `cut`, cluster-diff `crossfade`, masked `roll`, prefix-aware `retype`, and numeric `count`. Default state indices are 0→1; use `fromState`/`toState` for later pairs. Retype supports `caret`; roll supports `stagger`; count supports `decimals`. Count requires tabular figures and numeric source strings, reserves the widest prepared value, and formats using the text locale. Common crossfade clusters slide only within the text velocity budget; larger changes dissolve at their original positions. Safe-area checks include every state and the transition union.

## Semantic events and narration

`textEvents` expose `reveal`, `emphasize`, `correct`, `qualify`, `retype`, `count`, `redact`, and `release`. Emphasis manners are `weight`, `color`, `underline`, `highlight`, `compress`, and `expand`. A correction strikes its source span and settles a replacement above it. A qualification requires a larger claim target and adjusts its leading. Release restores a previous held emphasis and retracts associated marks.

```json
{
  "id": "spoken-emphasis",
  "node": "claim",
  "span": "qualifier",
  "verb": "emphasize",
  "manner": "color",
  "color": "#a4362f",
  "at": { "narrationWord": "not", "occurrence": 2, "offset": 0 },
  "duration": 10
}
```

`at` also accepts a frame or `{ "narrationWord": { "segment": 0, "index": 6 } }`. Indices are zero-based; `occurrence` is one-based. Offsets and duration are frames. Word-anchored emphasis **peaks** at the spoken onset; reveals and other verbs start there. Near frame zero, the compiler shortens pre-roll; an onset at frame zero peaks at frame one. Missing, ambiguous, and out-of-scene anchors fail. Imported nested alignments retain segment/word provenance. Passage narration timing is localized to each beat. MC8 offers corresponding `text-*` intent presets.

## Review and verification

The Lab motion inspector includes a text lane with word ticks, animator/event bars, reading windows, and clickable diagnostics. With imported word alignment, “Emphasize on spoken word” adds a validated event. The specimen action downloads all text states, spans, and marks. “Check contrast and animation handoff” measures rendered pixels and pins the resulting findings to the text lanes.

```sh
pnpm story:type-specimen --scene benchmarks/fixtures/typography/editorial.json --output-dir /tmp/type-review
pnpm story:type-specimen --directory benchmarks/results/story-motion-v013 --output-dir /tmp/legacy-type-review
pnpm story:type-specimen --passage benchmarks/fixtures/story-authoring/linked-comparison.json --output-dir /tmp/passage-type-review
```

The command accepts scene JSON, saved story render manifests, templates, and passage plans. Scenes with vertical overrides produce both formats. It writes specimen PNGs, `*.quality.json`, and a manifest. Lint codes are `reading-time`, `moving-while-read`, `animator-handoff-snap`, `rag`, `text-contrast`, `hierarchy-drift`, `idle-type-motion`, and `x-height-floor`. Lint remains advisory; use `--strict reading-time,text-contrast` to gate selected codes. Programmatic policies configure reading rate (default 15 graphemes/s), a reading floor, displacement budget, output review width, and x-height floor. Reports distinguish measured layout/pixel evidence from checks possible without a browser.

Preparation is deliberately bounded: 4,096 clusters per state, 10,000 formatted values, 2,048 axis combinations, 32 megapixels per text layer, and 128 megapixels of cached text rasters per scene. Unsupported font features and axis ranges fail during preparation. No glyph measurement or font loading occurs during frame drawing.

Acceptance sources are in `benchmarks/fixtures/typography`. Run `pnpm test:browser:typography` for the focused browser fixture, `pnpm test:browser:typography:fixtures --export` for the full fixture/export suite, and `pnpm check:fast` for static checks and unit tests.
