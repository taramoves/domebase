# domebase — style

Set by the user, 30 Sep 2026. Applies to every page in this project.

## Rules

- Black on white. All text `#000`. No colour. (The lab canvas is the one exception — see Lab.)
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
  home page. Under the path sit the five sections, hard left, the current one bold; a section with
  no page yet stays a name. At the right, `buy me a coffee` — a text link, in the same voice as
  the menu, on the pages that carry the site's navigation and nowhere else.
- **A page that hides the navigation carries no marker** and keeps its own corner: the fullscreen
  dome pages (`lab/3Dmath`, `lab/dome-diagram`, `lab/surface`) draw their own path in their own
  styling.
- The home page is the header alone: the name, the five sections, the coffee link — top left.
- A section index is the header, then one line per page in that section.
- Ship the smallest artifact that works.

## Files

```
src/                    hand-written pages and assets — what the site is
  index.html            home: the header alone — the name and the five section names, linked
                        where a page exists
  assets/css/site.css   the one stylesheet: document pages link it, the database page inlines it
  assets/fonts/         cmu-serif-roman.woff, OFL.txt (kept, unused since Arial)
  database/             app.html + app.js — the database section's own page source
  library/notes/        the library's notes, one per work
  lab/index.html        the lab's own index: one line per page in the lab
  archive/ learn/       a folder per section, as they are built
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

## Lab

`dist/lab/3Dmath/index.html` is hand-written and copied in by the build. It is an app page — a
fullscreen domemaster whose menu is a 2d layer on the dome's back wall — and it links `../../assets/css/site.css`
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
- **The menu is a 2d layer placed in the master's coordinates, never in the scene.** It is a band on
  the dome's back wall — altitudes 18°–72°, ±62° of azimuth — which is the top of the master, drawn
  over the canvas so it stays crisp, stays clickable and holds still while the shape turns
  underneath it. Its up points at the zenith, which is the way round it must be drawn to read on a
  dome, so on the master it sits upside down. `placeMenu()` derives left, top, width and height from
  `fov`, so the band keeps its place on the dome when `fov` changes. Verify it by measurement: the
  layer's centre at the circle's centre-x and one radius above its centre-y, its corners inside `R`,
  its transform a rotation and a scale only, and a drag on the canvas leaving its rect identical.
- The block is four panes sharing every edge — shapes, parameters, view, measures — in a 2×2 grid at
  a nominal 488 css px and 10px type on a 12.5px line, scaled to the width the dome geometry gives
  it, which shows ten rows a pane: the parameters and the measures fit whole, the 29 shapes scroll. One function (`specRows()`)
  feeds the measures, so the layer and any copy of it cannot report different numbers.
- `dome` off is the flat perspective view — the same shape, the same maths, for reference.
- Drag turns the shape, the wheel sets `fov` in the dome (it zooms in the flat view), and `front`
  returns to the default view. The frame never moves.

```
src/lab/index.html         the lab's index: the path back, one line per page
src/lab/3Dmath/index.html  the page: markup and the page's own CSS
src/lab/3Dmath/viewer.js   the renderer and the controls
src/lab/3Dmath/geom.js     the geometry helpers every family builds on
src/lab/3Dmath/fam_*.js    one file per family: polytopes packing fractal surface curve attractor dome
work/lab/CONTRACT.md       what a family file must do, and how it is checked
work/lab/check_geom.cjs    the helpers against known values
work/lab/check_family.cjs  every shape at its default and at each parameter extreme
```

Every shape is procedural and parameterised — a function of numbers the page exposes as table
cells, each with a sweep checkbox that animates it. No mesh files, no library, no network.
Each shape states its own invariant in `verify()` and the checks must report zero problems
before a family joins the page.

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
- Sections and order as listed in `IDEA.md`: database, archive, library, lab, learn.
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
