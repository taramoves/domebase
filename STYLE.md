# domebase — style

Set by the user, 30 Sep 2026. Applies to every page in this project.

## Rules

- Black on white. All text `#000`. No colour. (Sketch carries the exceptions: the 3d math canvas
  may show the shape's own data and its page ground is the one grey, `#333`; the three looper pages
  are black and keep the prototype's monospace.)
- **Arial**, everywhere. No webfont, no serif.
- A spreadsheet, not a document: ruled grid, sheet tabs, boxed controls, `#efefef` header
  fill. Structure comes from rules and fills.
- No descriptive text and no metadata lines. A page shows data, names and controls — never
  a sentence explaining what the page or a section is, and never a "how this works" block.
- Anything you can open, sort, filter or go to is a link. Inside the sheet, links are not
  underlined until hover.
- Dead names are fine in this project; dead links are not. The home page names the five
  sections and links the ones that have pages.
- **The header is one built block: the path, the site's menu, the coffee link.** `build/nav.py`
  writes it into every page that asks for it — a page carries `<!--nav domebase/section/page-->`
  where its header belongs — so the navigation exists once and cannot drift page by page. Each
  part of the path is a link except the page itself, so no page is more than two clicks from the
  home page. Under the path sit the site's sections, hard left, the current one bold; a section
  with no page yet stays a name. At the right, `buy me a coffee` — a text link, in the same voice
  as the menu, on the pages that carry the site's navigation and nowhere else.
- **The menu is `build/nav.py`'s `SECTIONS`**, and a section shows as a link only once its page
  exists. Today: database, library, lab, sketch. The learn page sits in the lab; archive carries
  no page, so the menu leaves it out until it does. **The lab holds tools and research; the
  sketch holds experiments — work that could go on a dome.**

- **A page that hides the navigation carries no marker** and keeps its own corner: the fullscreen
  dome pages (`sketch/3Dmath`, `lab/dome-diagram`, `lab/surface`) draw their own path in their own
  styling — and in the sheet's own type: Arial at the sheet's sizes, no uppercase, no letterspacing.
  The three looper pages draw the same corner to the same measure, inverted: an Arial 16px heading
  on a black tab, because the page under it is the prototype's.
- The home page is the header alone: the name, the sections, the coffee link — top left.
- A section index is the header, then one line per page in that section.
- Ship the smallest artifact that works.

## Files

```
src/                    hand-written pages and assets — what the site is
  index.html            home: the header alone — the name and the section names, linked where a
                        page exists
  assets/css/site.css   the one stylesheet: document pages link it, the database page inlines it
  assets/fonts/         cmu-serif-roman.woff, OFL.txt (kept, unused since Arial)
  database/             app.html + app.js — the database section's own page source
  library/notes/        the library's notes, one per work
  lab/index.html        the lab's own index: one line per page in the lab
  lab/learn/            the learn page: the master, the two signal chains, a glossary
  sketch/index.html     the sketch's own index: one line per page in the sketch
  sketch/looper.css     the three looper pages' stylesheet
  sketch/looper.js      the looper engine they share: grid, sketch, control panel
work/db/                the database pipeline: sources, parsers, page build
work/library/           the library pipeline: the shelf (data/) and its build
build/nav.py            the site's navigation: the header, built once and injected into every page
build/build_site.py     builds the library page and the database page, then dist/
dist/                   the deploy root — generated, and the only thing ever served
IDEA.md STYLE.md README.md DEPLOY.md
```

- Nothing generated ever sits in `src/`. The database page exists only as
  `dist/database/index.html`, built from `src/database` + `work/db`, and the library page only
  as `dist/library/index.html`, built from `work/library`, so no one can edit output by
  mistake. A section folder in `src/` holds that section's own sources.
- A page links `assets/css/site.css`; from a section folder, `../assets/css/site.css`.
- Full-height app pages (the database, the library) put `class="app"` on `<body>` and use the
  sheet shell: masthead, tabs, control bars, a scrolling grid. Document pages use
  `<main class="doc">`. The app shell only applies to `body.app`.
- A section keeps its own pages in `src/<section>/`.
- Page-specific CSS goes in a small `<style>` in that page. Nothing page-specific goes in
  `site.css`.
- The database page is the one exception to linking: it embeds the same sheet, copied from
  `src/assets/css/site.css` at build time, so the built page needs no other file.

## Tokens

```
--ink:#000  --paper:#fff  --line:#000 (frame, header, tabs, controls)
--hair:#c9c9c9 (cell rules)  --head:#efefef (header + tab fill)
body 12.5px/1.45 Arial    th 12px    headings 700, boxed with a rule
links: no underline; hover underlines
```

## Database

`dist/database/index.html` is **generated** by `build/build_site.py` from the pipeline in
`work/db` (moved out of `Desktop\dome\fulldome_festivals_db`, which is now a stale copy):

```
work/db/fulldome_festival_films.csv   the data: one row per film × festival edition (1,662 rows)
work/db/provenance.csv                per-row source document, page and verbatim quote
work/db/enrichment/*.csv              descriptions, film pages, posters
work/db/qa/*.csv                      corrections, award overrides, consolidation queue
work/db/fulldome_festivals.sqlite     the same data as SQL, with views and first-pass master clusters
work/db/build/parse_*.py merge.py make_sqlite.py   parsers and merge, re-runnable
work/db/build/make_browser.py         builds the working single file from the sources below
work/db/build/make_publish.py         trims prose, writes the page where you point --out
```

The page's source files, none of which are the page itself:

| file | what it holds |
|---|---|
| `src/database/app.html` | the page markup — a database-section file, not a pipeline file |
| `src/database/app.js` | the app: views, search, filters, sorting, detail panel |
| `src/assets/css/site.css` | the one stylesheet — `build_site.py` hands a copy to the pipeline |
| `build/build_site.py` | runs the generator and the publish step, then assembles `dist/` |

```
python build/build_site.py              # the library page, the database page, then dist/
python build/build_site.py --skip-db    # dist/ only
python build/build_site.py --full-prose # keep every quoted word (not for a public copy)
```

What the page does (all of it built into the pipeline, not edited into the output):

- A spreadsheet: ruled grid, resizable columns, sheet tabs for films / artists / festivals.
- Filters are four multiselect dropdowns — programmed at, country, award status, award
  category: OR inside a facet, AND across facets, `all` / `none`, and **every option shows
  the row count it would leave right now**, so a combination that yields nothing reads `(0)`
  before you click it. A facet never counts its own selections.
- The search reads word-starts, not substrings (`art` skips *Earth*, `~art` does not), takes
  phrases, negations (including `-"two words"`), row ids, and field prefixes that override the
  scope selector: `title: artist: country: award: section: desc: source: flags: fest:`
  `year:2010-2016`. With a query and no column sort, rows come back best match first. The
  syntax is listed in the page, under the search box, while it has focus. Full table in
  `work/db/README.md`.
- Festivals carry their year (`JENA 16`, `DOMEUNDER 24–25`); there is no separate Years column.
- Sorting by a column hides rows with nothing in it, and the count line says how many and why.
- Artists are plain text in the Films tab; clicking off the detail panel closes it.

**Production year is not in the data.** The sources are festival programmes, which print
screening years, not production years, so the year travels with the festival. Adding production
years means sourcing them (film pages, catalogues) as a new field — a data job in the pipeline,
not a display job.

## Library

`dist/library/index.html` is **generated** by `work/library/build/build_shelf.py` from the shelf
in `work/library/data`, and `build_site.py` runs it on every build. It is an app page — the same
sheet shell as the database — with two tabs: **Shelf** (one row per file, with its links on the
row) and **Ideas** (the review's arguments). It links `../assets/css/site.css` rather than
inlining it, so restyling the site restyles it.

```
work/library/data/sources.csv            the shelf: one row per work. Edit this
work/library/data/tags.csv               the tag vocabulary; a tag is declared before it is used
work/library/data/links.csv              one link per row: work, label, url, source
work/library/data/wiki.txt               the vault the ideas are read from, one line
work/library/build/build_shelf.py        csv -> dist/library/index.html + SHELF.md + IDEAS.md + TAGS.md
work/library/build/add_source.py         a new source -> the file, its text, its shelf row
work/library/build/extract.py            a source file -> page-marked text
work/library/build/tags.py               list / add / rename / merge / drop tags, safely
work/library/build/seed_from_corpus.py   one-time seed, kept for provenance
```

The **Ideas** tab is read from the vault, not written here: the fulldome project's
`wiki/concepts/*.md` are already claims, each carrying the quote bullets that support them, and
the shelf maps each cited record back to the work it came from. The library publishes them; the
wiki owns them, and its own machinery verifies the quotes. A work whose record is not on the
shelf fails the build. Nothing sits in `src/` for this section — the library has no hand-written
source files, only the data in `work/library/data`.

The shelf is 45 sources. The build fails on a tag that is not declared, a file that is not on
disk, a link pointing at a work that is not on the shelf, an idea resting on a record that is not
on the shelf, or two rows on one file; it warns on a row with no year and on a tag used once.
Columns, tabs and the workflow: `work/library/README.md`.

## Sketch

`dist/sketch/3Dmath/index.html` is hand-written and copied in by the build. It is an app page — a
fullscreen domemaster whose menu is a layer warped onto the dome's own surface, low on its front
left — and it links `../../assets/css/site.css`
from a section folder. Figures are drawn in the sheet's own greys (`#efefef`, `#e2e2e2`,
`#c9c9c9`) with black hairlines. The canvas is the one exception to the sheet's black and
white, in two modes: the greys of a lit form, or — with `colour` set to `data` or `normal` —
the full spectrum of the shape's own value, which is how Knill's figures are coloured (his
colours map data, not light). The frame, the tables and every word stay black on white, and
`off` puts the figure back in the greys.

**The dome format.** The page is a domemaster, not a viewport with a picture in it:

- **The master is a fixed frame, and its centre is the zenith.** The circle is inscribed in the
  window — its diameter is the shorter side — and the projection is equidistant: distance from the
  centre is the angle from the zenith, so the rim is the horizon and the top of the circle is the
  back of the dome, the bottom the front. Guides mark the rim, 30° and 60°, and the two axes.
  Nothing a viewer does moves that frame: a master that moved with the mouse would be a fisheye
  viewport, not a master.
- **The scene turns inside it.** The shape is drawn into the six faces of a cube map, one 90° camera
  per face, so each face lands in the 90° of sphere facing it: the top view at the centre of the
  master, the four side views as bands around the rim, the bottom view below the horizon and out of
  a 180° master altogether. Dragging turns and tips the scene inside those faces, `spin` is the
  same turn on a clock, `size` is how near each face's camera sits — all of it inside a frame that
  does not budge. **Every path that changes the scene's orientation must mark the cube stale**
  (`S.cubeStale`): with the master fixed, yaw and pitch no longer re-render anything by themselves,
  so a drag that forgets it does nothing visible unless the spin happens to be re-rendering.
- **The menu is a layer warped onto the dome, never in the scene.** It is a patch of the dome's own
  surface low on the front left — the spot `lab/pitch` gives its phone — centred at azimuth 228° of
  the master and 42° above the horizon, spanning ±39° across and ±15° of altitude. Its layout box is
  300×150 css px, and `placeMenu()` asks where the dome puts that box's four corners, then carries
  the box onto that quad with a projective map (`matrix3d`): the layer foreshortens as a panel on
  the dome does — the near edge wider than the far, the rows evenly spaced, the text compressed
  toward the rim. An element sends straight lines to straight lines only, so the fisheye's own bend
  across the patch is the one part a single editable element cannot carry. Corners, clicks and
  inputs all follow the warp, because hit-testing follows the transform exactly.
- **The layer's place is locked.** It is computed from a fixed 180°, once and on resize only — never
  in the frame loop, never from `fov` — so no interaction moves it; only the aperture does.
  `resize()` sizes the canvas and then places the layer, and the interaction block calls `resize()`
  on a window resize and once on the first frame: placing the layer at init alone puts it on the
  canvas's default 300×150 aperture and leaves it there. H hides and shows the layer.
- **The panel's size and columns are the levers on what fits.** 300×150 against the old 488×271 is
  0.61 of the linear size and 0.34 of the area. The shapes pane takes the full height with its name
  column half the pane; parameters and view take half the height each of the right column, which is
  0.72 of the shapes pane's width; the parameters' columns are fractions of their own pane, all
  cutting off rather than spilling. That leaves the shapes pane at fourteen rows of twenty-nine and
  the parameters at seven of ten, both scrolling a little, which is the price of a smaller panel.
  **The measures pane is deliberately absent.** It was dropped so the parameters and the view could
  have its height; the figures it carried — counts, the build time, the frame rate — are not on the
  page, and neither is the source link it held, which was the page's citation to Knill. Bring the
  citation back somewhere before this page is treated as finished.
- **Alt and a drag turns the camera; a drag alone turns the shape.** The camera is the observer's
  own direction, and it is applied to the sampling in the fisheye pass and nowhere else: the cube
  faces are untouched (a camera turn marks nothing stale), the frame, the guides and the layer hold
  still, and the world swings behind them. It lives in `camYaw`/`camPitch` as `Rx(pitch) . Ry(yaw)`,
  inverted into the sampling by `camMatrix()`, and `front` — the button, `r`, a double click —
  resets it with the rest of the view. Its sense is deliberately the opposite of the shape's drag,
  because turning a camera and turning an object are opposites.
- Drag turns the shape, the wheel sets `fov` of the dome, and `front`
  returns to the default view. The frame never moves.

```
src/sketch/index.html         the sketch's index: the path back, one line per page
src/sketch/3Dmath/index.html  the page: markup and the page's own CSS
src/sketch/3Dmath/viewer.js   the renderer and the controls
src/sketch/3Dmath/geom.js     the geometry helpers every family builds on
src/sketch/3Dmath/fam_*.js    one file per family: polytopes packing fractal surface curve attractor dome
work/lab/CONTRACT.md          what a family file must do, and how it is checked
work/lab/check_geom.cjs       the helpers against known values
work/lab/check_family.cjs     every shape at its default and at each parameter extreme
```

Every shape is procedural and parameterised — a function of numbers the page exposes as table
cells, each with a sweep checkbox that animates it. No mesh files, no library, no network.
Each shape states its own invariant in `verify()` and the checks must report zero problems
before a family joins the page.

**The three loopers are the prototype's own sketches, one to a page, and fullscreen like 3d math.**
They came out of `taramoves/public/prototypes/av-loopers.html`, where all three sat side by side on a
420 px canvas each; now the canvas is the window and the circle is inscribed in it — the shorter
side is the diameter — so each page reads as a domemaster (the circle is the dome, the centre the
zenith, the rim the horizon) with nothing projected. The ground stays the prototype's black and the
panel its monospace; the heading is the sheet's.

- **Everything but the drawing sits in a corner, and everything in a corner hides.** The heading is
  the top-left corner, the control panel is docked bottom-right, the porting note is a disclosure at
  the bottom-left — closed it is one line, open it is a panel. The page itself never scrolls
  (`html,body{overflow:hidden}`); the panel and the note scroll inside themselves.
- **`h` hides the panel**, and so does `Hide` in the panel's own status row; hidden, a `Controls`
  button stays in that corner to bring it back. Hidden is a class on `<body>` (`panel-off`), so no
  element has to know the panel's size. The `keydown` handler on `document` ignores a focused
  `<select>`, which uses the letter keys to jump its options.
- **The canvas follows the window and the drawing follows the canvas.** `fit()` writes `SIZE` (the
  shorter side of the window), `cx`/`cy` (the window's centre) and `opts.maxR` (`SIZE / 2`), and
  `p.windowResized = fit`. The grid is re-derived from `opts.maxR` every frame, so a resize writes
  numbers and rebuilds nothing — the same property that lets a layout change carry the shapes.

```
src/sketch/looper.css         the prototype's style block, plus the corner each page draws
src/sketch/looper.js          the engine: grid builders, the sketch factory, the control panel
src/sketch/spiral/            the spiral looper: its config, and one call into the engine
src/sketch/concentric/        the rings looper: the same, its own config
src/sketch/pinball/           the ball looper: the same, and its own physics
work/sketch/port_from_prototype.py  slices the pages out of the prototype by line
```

- **A shape stores where it belongs, never where it is.** Its position is symbolic — a cell
  index, or `ring:split` — and its angle, radius and trigger time are re-derived from the
  current grid every frame, so changing turns, cell count, rings or splits carries the shapes
  with their sections instead of stranding them off the end of a curve.
- **Shape and sound are one thing.** A voice is a shape and the sound it makes; a star is a
  sound that is drawn.
- **A page owns a config and nothing else.** `createLooperSketch('sketch1', opts)` builds the
  canvas and `buildControlsFor('ctrl1', 'SPIRAL / ESCARGOT', opts, 'spiral')` builds the
  panel, both out of `looper.js`; the three pages differ only in the config they declare and
  the name their panel shows.
- **The prototype's porting note is a corner disclosure on every page.** The plaintext note for the
  TouchDesigner build is the same text three times, because each page is meant to stand alone. Move
  it to one place if it drifts.
- **Every difference from the prototype lives in the port script**, one asserted string swap each:
  `fit()` and the fullscreen canvas, the corner panel and the hide key, the corner heading, the note
  as a disclosure. A prototype that moves stops the run rather than half-porting.

## Lab

`dist/lab/dome-diagram/index.html` is the SAT dome master, copied in by the build as it stands. It is
a tool, not a sheet: `body` is a column of one header and one stage, the drawing fills the stage and
the controls sit in its two bottom corners. Panel paint, speaker, projector and hover colours are
kept because they carry meaning — the fourth colour is an exit — and they are the same exception the
3d math canvas has. The frame, the controls and the numbers are black on white, and the page has no
dark mode. One JPEG test pattern is embedded as a data URL, which is 0.6 MB of the page.

`dist/lab/instrument/index.html` is hand-written and copied in by the build, and it is the one
document page in the project with prose in it: the technology of the audience interaction
system. It keeps the sheet's tokens — black on white, Arial, hairline rules, tables — without
the spreadsheet shell: no tabs, no sticky headers, a single 760px column. It is the one document
page with a script: the interaction demo in part 0, whose styles are scoped to `#w6` because the
sheet's `.chip`, `th` and `td` rules are global. Its diagrams are
inline SVG in the same greys and black hairlines, and a shape that is active is filled where a
resting one is hollow, since the sheet carries no second colour.

`dist/lab/surface/index.html` is the dome slide editor, hand-written and copied in by the build. It
links `../../assets/css/site.css` and it is a tool rather than a sheet: a full-height column of
header, side panels and status bar around the canvas. Black on white holds elsewhere — but the
canvas takes the slide's own background, which is a colour the author picks (paper and black the
two buttons that cover most decks), and the ink that reads on it follows its brightness. Two
sheet rules have to be reset by the page itself: every `aside` is given the fixed, slid-out
detail-panel treatment, so the tool's two columns set `position:static`, and `th`/`td` are global,
which is why the panels are built from divs. What it edits is a domemaster, so the page's own
conventions are the dome's: the centre of the circle is the zenith, the rim is the horizon, and a
card sits at an azimuth and an elevation with its up pointing at the zenith — which is why the
presenter's notes read upside down at the back of the dome and why content at azimuth ±90 reads
sideways. Authoring in the master removes the inverse problem: the pointer's position on the canvas
*is* the coordinate.

## Not taramoves

`C:\Users\taram\OneDrive\Desktop\taramoves` (the `/dome/` pages on taramoves.com) is a
separate project with the opposite house style: monospace, uppercase letterspaced labels,
hard black outlines, boxed tags, hover detail lines, status lines. None of that applies
here, and none of this applies there. `/dome/domedb` on that site still serves an older
build of the same page in the old print-index style; the two copies have diverged by design.
That old sheet is kept at `work/db/build/archive/browser_style.print-index.css`.

## Open

- Name: `domebase` is neither bought nor final.
- The menu's sections are `build/nav.py`'s `SECTIONS`: database, library, lab. The learn page sits
  in the lab; archive has no page yet, so the menu leaves it out.
- Publishing: `dist/` is the deploy root, and `DEPLOY.md` has the GitHub Pages / Vercel /
  Netlify recipes. No backend is needed or wanted.
- Indexing is undecided: nothing carries a `robots` tag yet. The taramoves hub is unlisted and
  `noindex`; if domebase should start that way, add the meta tag to `src/database/app.html` and rebuild.
- Cell rules are `#c9c9c9`; black, like the frame, is available if the grid should read harder.
- First click on a count column sorts ascending; the reverse is one click away.
- Framework: hand-written HTML plus one generated page, built by a dependency-free Python
  script. Revisit only if the site passes roughly eight pages, or if a section needs a page per
  record (one per film, one per document) — then Astro, the tool already used for taramoves, and
  the pipeline can emit JSON for it. Not Next.js: that would add a Node toolchain and a
  server-shaped framework to a site that is six files.
- No production-year field, no unified title/artist variants yet — the consolidation queue is
  `work/db/qa/repeats.csv` (27 films with a variant title, 28 with a variant artist spelling).
- The old copy at `OneDrive\Desktop\dome\fulldome_festivals_db` still holds a full duplicate of
  the pipeline. It carries a `MOVED.md`; delete it once the new home has proved itself.
