# domebase

A fulldome resource site, built and deployed as plain static files.

```
src/                    what the site is — hand-written pages and assets, nothing generated
  index.html            the home page: the header alone — the name and the section names
  assets/css/site.css   the one stylesheet
  assets/fonts/         Computer Modern (kept, unused since the site moved to Arial)
  database/             app.html + app.js — the database section's own page source
  library/notes/        the library's notes, one per work
  lab/index.html        the lab's index: one line per page in the lab
  lab/3Dmath/           the 3d math page: viewer.js, geom.js, one fam_*.js per shape family
  lab/dome-diagram/     the SAT dome master: panels, speaker rings, projector circles
  lab/instrument/       the instrument page: one hand-written document, diagrams inline
  lab/learn/            the technical basics of fulldome: the master, the two signal chains
  lab/pitch/            the domemaster pitch: the lecture as dome masters, one per slide
  lab/surface/          the slide editor: the deck, the domemaster, the audience's view
work/db/                the fulldome festival database: sources, parsers, page build
work/library/           the library: the shelf (data/) and its build
work/lab/               the lab's contracts and checks: CONTRACT.md, SURFACE.md, the node checks
build/nav.py            the site's navigation: the header, built once and injected into every page
build/build_site.py     the site build
dist/                   the deploy root — generated, and the only thing that is ever served
IDEA.md  STYLE.md  README.md  DEPLOY.md
```

This repository is the site: `src/`, `build/`, `dist/`, the docs and `vercel.json`. The data
pipeline (`work/db/` — the source CSVs, the provenance, the raw programme dumps) is deliberately
**not** in it, and neither is anything else that is not the site. `dist/database/index.html` is
committed from a local build, so a host needs nothing but files.

Style: `STYLE.md` — black on white, Arial, ruled spreadsheets, no colour, no decoration,
no descriptive lines. The menu comes from `build/nav.py`: database, library, lab, with the learn
page inside the lab. Brief: `IDEA.md`.

## Build

```
python build/build_site.py
```

That runs the library build and the database pipeline (`work/db/build/make_browser.py`),
writes `dist/library/index.html` and `dist/database/index.html`, copies `src/` in beside them,
and reports the sizes. Options:

| flag | effect |
|---|---|
| `--skip-db` | rebuild `dist/` only, reusing the page already built |
| `--prose-length 0` | drop the quoted programme prose entirely |
| `--prose-length 280` | keep it as excerpts (the default, and what the public copy uses) |
| `--full-prose` | keep every quoted word — not for a public copy |
| `--no-posters` | drop the hotlinked poster images |

**Nothing generated ever sits in `src/`.** Each section owns its own source: the database
section's page is `src/database/app.html` plus `src/database/app.js`, its data comes from
`work/db`; the library section's page comes from `work/library` and its notes are
`src/library/notes`. Both stylesheets are the one `src/assets/css/site.css`. The build writes
the pages to `dist/database/index.html` and `dist/library/index.html` and nowhere else, so
there is no built file anyone can edit by mistake.

## Navigation

One header for the whole site, written by `build/nav.py` and injected by the build once every
page — the generated ones and the hand-written ones — is in place. A page asks for it where its
header belongs:

```
<!--nav domebase/lab/instrument-->
```

The trail is what the header prints: each part above the page is a link, the page itself is text,
and the part's href is the folder at that depth, so no page hand-writes `../`. A trail that does
not match the page's own depth stops the build. Under the path sit the five sections, hard left,
with the current one bold and a section that has no page yet left as a name; at the right, `buy me
a coffee`. The home page is that header alone.

A page that hides the navigation carries no marker and draws its own corner: `lab/3Dmath`,
`lab/dome-diagram` and `lab/surface` keep their own path in their own styling. The coffee link
rides with the header, so it appears on the pages that carry the site's navigation and nowhere
else.

## The data

`work/db/fulldome_festival_films.csv` is the source of truth: one row per film × festival
edition — 1,662 rows, 1,202 films, 1,756 credits, 53 festival editions. `work/db/provenance.csv`
carries the source document, page and verbatim quote behind every row, `work/db/qa/` the
corrections and overrides the merge applies, and `work/db/fulldome_festivals.sqlite` the same
data with SQL views. `work/db/README.md` documents the columns, the extraction rules and the
rebuild order.

The pipeline is independent of the site: it reads CSVs and writes one HTML file. That is
deliberate — anything that presents this data differently later (another framework, a page per
film, a second section reusing the dataset) can consume the same sources without touching what
is here.

## Deploy

Static files only. **No server, no database and no backend**: the page carries its own data,
so the host only ever serves files. Deploy `dist/` — see `DEPLOY.md`. Nothing under `work/`
is copied into `dist/`, so the programme text dumps, the SQLite file and the build scripts
never become public URLs.

## Lab

`dist/lab/3Dmath/index.html` is hand-written and copied in by the build — no generator, no
data. It draws Knill's `3dprinter/math` figures as live geometry: one WebGL context, no
library, no network, no mesh files. Every shape is a function of numeric parameters the page
exposes as table cells (with a per-parameter sweep, so any of them animates), built from
`geom.js` and one `fam_<family>.js` per family: polytopes, packing, fractal, surface, curve,
attractor, dome.

```bash
node work/lab/check_geom.cjs                              # the helpers, against known values
node work/lab/check_family.cjs src/lab/3Dmath/fam_*.js    # every shape, at defaults and at each parameter extreme
```

`work/lab/CONTRACT.md` is what a family file has to do: the interface, the rules, and the
invariant its `verify()` must state with a number. Both checks report zero problems before a
family joins the page.

`dist/lab/dome-diagram/index.html` is the SAT dome master, published as it stands and copied in by
the build: one SVG, no library and no network, with panel rings, projector circles and speaker
rings drawn as percentages of the dome radius, numbers and a test pattern to switch on. It saves
to `localStorage` and downloads a JSON save. Panels paint the four states, so it keeps the colours
of the working tool; the frame and the controls are black on white like the rest of the site. Its
source is `src/lab/dome-diagram/index.html`.

`dist/lab/instrument/index.html` is also hand-written and copied in by the build: a document
page, not a spreadsheet, for the audience interaction system. It carries its own diagrams as
inline SVG — the dome, the parts, the objects table, placement, playback, audio routing, the
seat-error cross-section. Part 0 also runs the interaction demo, ported from the escargot
outline's own widget: every rule it uses is scoped to `#w6`, it needs `--guide` and `--faint`
(the sheet does not define them), and an `IntersectionObserver` starts and stops its frame loop
as it scrolls in and out, so the page is idle when the demo is off screen. Its source is
`src/lab/instrument/index.html`, and it is edited by hand.

`dist/lab/surface/index.html` is a slide editor for the dome, hand-written and copied in by the
build. A deck is one JSON document; a slide is a background and a set of cards, each tangent to the
sphere at an azimuth and an elevation. The canvas is the master itself — centre the zenith, rim the
horizon, az 0 at the bottom of the disc, az 180 at the top — so authoring happens in the dome's own
image: the notes come out upside down at the back and content at az 90 reads on its side, which is
geometry rather than a flip. A second view shows what the audience sees from the middle of the
room. The background is a colour and the ink that reads on it follows its brightness; a text card
carries its own font. Presenting fits the slide to the smaller side of the screen. One slide exports
as the domemaster a projector takes: square, black beyond the rim, no grid and no chrome. Drag,
resize and turn each solve their placement, because the tangent plane at a card's centre is not the
plane the hand's offset was measured in. A deck's pictures are decoded when it opens, so a slide
change is an upload rather than a fetch. The deck lives in the browser
(`localStorage`) or in a `.dome.json` file — no server, no account, no sync. Its files are
`src/lab/surface/{index.html,dome.js,gl.js,editor.js}`.

```bash
node work/lab/check_dome.cjs    # the geometry: round trips, the frame, the three placements
```

The check runs the page's own `dome.js`, the way the 3Dmath checks run `geom.js`: the mapping
round-trips, the horizon lands on the rim and the zenith on the centre, az 180 on the top of the
disc, a card's up vector points at the zenith, and a grab keeps the point the hand took hold of.

`dist/lab/pitch/index.html` is the domemaster pitch: the lecture as dome masters, one per slide —
title, concept, the schedule as a ring of bubbles, five demo slides, thank you. Three.js renders the
scene to a cubemap and a fisheye shader flattens it to the dome, so the page shows what the dome
shows; **S** saves the current slide as a PNG. It loads three.js, p5 and two handwriting fonts from
CDNs, and keeps its own styling: dark ground, round nav buttons, ink on white cards. Its source is
`src/lab/pitch/index.html`.
