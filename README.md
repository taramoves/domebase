# domebase

A fulldome resource site, built and deployed as plain static files.

```
src/                    what the site is — hand-written pages and assets, nothing generated
  index.html            the home page: the header, then the section names listed on the page
  assets/css/site.css   the one stylesheet
  assets/fonts/         Computer Modern (kept, unused since the site moved to Arial)
  database/             app.html + app.js — the database section's own page source
  library/notes/        the library's notes, one per work
  lab/index.html        the lab's index: one line per page in the lab
  lab/floorplan/        the room: the SAT dome master, the floor plan, the room in 3d
  lab/instrument/       the instrument page: one hand-written document, diagrams inline
  lab/learn/            the technical basics of fulldome: the master, the two signal chains
  lab/shelf/            the texts, one page per source: lecture, ontology, practice as research,
                        immersion, spectacle, interaction of color, spheres, audiovisual archiving
  lab/timeline/         the plan as one timeline
  sketch/index.html     the sketch's index: one line per page, the three loopers under the
                        name they share
  sketch/3Dmath/        the 3d math page: viewer.js, geom.js, one fam_*.js per shape family
  sketch/looper.css     the three loopers' stylesheet, and the corner they draw
  sketch/looper.js      the looper engine they share: grid builders, sketch, control panel
  sketch/concentric/    the rings looper: a 420 px canvas and its control panel
  sketch/pinball/       the ball looper: the same page, its own physics
  sketch/pitch/         the domemaster pitch: the lecture as dome masters, one per slide
  sketch/slides/        the slide editor: the deck, the domemaster, the audience's view
  sketch/spiral/        the spiral looper: the same page, its own curve
work/db/                the fulldome festival database: sources, parsers, page build
work/library/           the library: the shelf (data/) and its build
work/lab/               the contracts and checks: CONTRACT.md and the node checks (they keep this
                        home and point at `src/sketch/`)
work/sketch/            the sketch's brief, the pitch's and the slide editor's records, and the
                        port that wrote the looper pages out
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
no descriptive lines. The menu comes from `build/nav.py`: database, library, lab, sketch — the lab
holds tools and research, the sketch holds experiments. Brief: `IDEA.md`.


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
not match the page's own depth stops the build. Under the path sit the menu's sections
(`build/nav.py`'s `SECTIONS`: database, library, lab, sketch), hard left, with the current one
bold and a section that has no page yet left as a name; at the right the coffee link, though
`nav.py`'s `SHOW_COFFEE` is off for now. The home page is that header, with the section names
listed under it.

A page that hides the navigation carries no marker and draws its own corner: `sketch/3Dmath`,
`sketch/pitch`, the three looper pages (`sketch/{spiral,concentric,pinball}`) and `sketch/slides`
keep their own path in their own styling. `lab/floorplan` used to be one of them and now carries
the header like the rest of the lab. The coffee link rides with the header,
so it appears on the pages that carry the site's navigation and nowhere else — off for now.

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

`dist/lab/floorplan/index.html` is the SAT dome master with the room around it: one page, three
views, the master first, so the diagram opens as it has always been. The master is one SVG, no
library and no network, with panel rings, projector circles and speaker rings drawn as percentages
of the dome radius, numbers and a test pattern to switch on. It saves to `localStorage` and
downloads a JSON save. Panels paint the four states, so it keeps the colours of the working tool;
the frame and the controls are black on white like the rest of the site. Its source is
`src/lab/floorplan/index.html`.

The dome's own numbers are fields at the left of the first view: the radius and the wall in metres,
the screen's span in degrees, how many speakers, how many projectors, and whether the panels are
quads or cut in two. A count is
read off the rig the room already is and scaled from it, so a number put back where it came from
returns that rig exactly, whatever was typed in between; a ring that holds one speaker is the pole
and stays one. `triangles` cuts every panel in two along a diagonal that turns with the band, on the
plate and on the hemisphere, and the panel keeps its colour and its exit either way. The radius and
the wall are the floor's own room fields: one room, three panes, one set of numbers. The degrees are
the screen's own span across the room, 180 for the hemisphere: past that the screen keeps its base
and its wall and is a larger sphere, so it springs from the wall's top, widens above it and its
horizon comes up off the wall — the floor, the wall and the plate do not move.

The same page carries the room: **four tabs — dome, floor, 3d, all** — all in the master's own
frame, so the plan's top is the back of the house (the master's azimuth 0), x runs east and y back,
in metres from the middle, and the wall is the circle of radius R. The floor view is a plan with a
palette of eight items — bean bag, chair, table, stage, front of house, light, projector, misc, each
with a pale tint of its own, shown as a swatch on the menu. A kind is dragged out of the menu and
lands where the pointer lets go, or clicked to land in the middle of the room. An item is dragged,
resized from its corner handles and turned from the handle on its stalk (alt and a
drag from the body turns it too; ctrl holds a move to the grid, a turn to 15° and a resize to 0.1 m;
arrows nudge). A resize holds the corner the hand is not on, nothing climbs through the wall, and
`lay round` lays copies of the item evenly around the middle at its own radius, each keeping the
middle on the same side of it. `lay out` lays a whole bank of seats: arcs round the middle or rows
along x, with the seats and the rows, the gap between two seats and between two rows, where the
first row starts, where round the room the bank is centred, which way every seat faces, and aisles —
radial ones of a given width round the middle for arcs, gaps between blocks for rows. The gaps are
the air between two seats rather than their pitch, so the panel says how many of the seats asked for
fit and what took the rest: the wall, or an aisle. A seat past the wall is dropped rather than slid,
and laying out again replaces the last bank, so the numbers can be nudged. A switch turns the item
tints off and leaves the plan as a plain sheet. The selected item's x, y, w, d and turn are fields in metres and
degrees. The master's rings, speaker marks, projector circles and exit panels are laid over the plan
where the master holds them. The 3d view stands the room up — the floor disc, the wall the screen
springs from, the master's panels, seams, speakers, projectors and exits on the hemisphere, the
floor's items as boxes and cylinders — paints it far to near, and orbits on a drag. `save room`
writes one file holding the dome's state and the floor's; `load room` takes that file or a master
save. Its files are `src/lab/floorplan/{index.html,floorplan.js,solid.js,dome.js}`, and the three modules
load in node, so the check runs the code the page runs — the plan's maths, the room's solids and the
dome's own counts together in `work/lab/check_floor.cjs`.

```bash
node work/lab/check_floor.cjs    # the plan's frame and handles, the wall, a ring, the room, the camera
```

`dist/lab/instrument/index.html` is also hand-written and copied in by the build: a document
page, not a spreadsheet, for the audience interaction system. Today it carries the summary, one
diagram in inline SVG — phone, hub, AV engine, artist, with calibration named on the phone-to-hub
link — and the interaction demo; the detail it once carried is saved in
`work/lab/instrument-cut-sections.html`. The demo is ported from the escargot outline's own
widget: every rule it uses is scoped to `#w6`, it needs `--guide` and `--faint` (the sheet does
not define them), an `IntersectionObserver` starts and stops its frame loop as it scrolls in and
out, it opens on the *Stamp trail* preset, and *Simulate participants* runs a crowd on every
preset. Its source is `src/lab/instrument/index.html`, and it is edited by hand; the record of
what it says and what the escargot build holds is `work/lab/INSTRUMENT.md`.

## Sketch

The lab holds tools and research; the sketch holds experiments — work that could go on a dome.

`dist/sketch/3Dmath/index.html` is hand-written and copied in by the build — no generator, no
data. It draws Knill's `3dprinter/math` figures as live geometry: one WebGL context, no
library, no network, no mesh files. Every shape is a function of numeric parameters the page
exposes as table cells (with a per-parameter sweep, so any of them animates), built from
`geom.js` and one `fam_<family>.js` per family: polytopes, packing, fractal, surface, curve,
attractor, dome. The page is a fullscreen equidistant domemaster — the circle inscribed in the
window, its centre the zenith, its rim the horizon — whose menu is a layer warped onto the
dome's own surface rather than a panel in the scene, so the controls sit on the dome and the
frame never moves. Inside the disc the sheet is black and the ink is the positive: the cube faces
clear black, each face's grey is painted as itself, and the guides — rim, 30°, 60°, axes — mix
toward white. The ground outside the rim is `#333`, the tone the dome pass clears its outside to, so
the rim reads as the drawing's edge rather than the window's.

```bash
node work/lab/check_geom.cjs                                 # the helpers, against known values
node work/lab/check_family.cjs src/sketch/3Dmath/fam_*.js    # every shape, at defaults and at each parameter extreme
```

`work/lab/CONTRACT.md` is what a family file has to do: the interface, the rules, and the
invariant its `verify()` must state with a number. Both checks report zero problems before a
family joins the page.

`dist/sketch/{spiral,concentric,pinball}/index.html` are the three AV loopers: the taramoves
prototype `public/prototypes/av-loopers.html` with its three sketches split one to a page and made
fullscreen — the canvas is the window and the circle is inscribed in it, the shorter side the
diameter — while the ground stays the prototype's black and the panel its monospace. Each is a
domemaster in two dimensions (the circle is the dome), so nothing is projected to read one. The
drawing is the whole page and everything else sits in a corner and hides: the heading top-left, the
control panel bottom-right (`h`, or `Hide`, closes both; a `Controls` button brings them back). The
prototype's TouchDesigner porting note is not ported. The engine is one shared file,
`src/sketch/looper.js`; a page
declares a config, calls into it, and owns nothing else. A shape stores where it belongs rather than
where it is, so the layout controls move the shapes with their sections. The heading is the sheet's
own type at the sheet's size on all four pages above. `work/sketch/port_from_prototype.py` writes
the three pages out of the prototype by line — every difference from it an asserted swap — so a
rebuild is a re-run, not a retype.

`dist/sketch/pitch/index.html` is the domemaster pitch: the lecture as dome masters, one per slide —
title, concept, the schedule as a ring of bubbles, five demo slides, thank you. Three.js renders the
scene to a cubemap and a fisheye shader flattens it to the dome, so the page shows what the dome
shows; **S** saves the current slide as a PNG. It loads three.js, p5 and two handwriting fonts from
CDNs, and keeps its own styling: dark ground, round nav buttons, ink on white cards. Its source is
`src/sketch/pitch/index.html`.

`dist/sketch/slides/index.html` is a slide editor for the dome, hand-written and copied in by the
build. A deck is one JSON document; a slide is a background and a set of cards, each tangent to the
sphere at an azimuth and an elevation. The canvas is the master itself — centre the zenith, rim the
horizon, az 0 at the bottom of the disc, az 180 at the top — so authoring happens in the dome's own
image: the notes come out upside down at the back and content at az 90 reads on its side, which is
geometry rather than a flip. The notes stand on the back at a height of their own: 0 is eye level and
60 approaches the pole, and the equidistant map reads a note truest in the middle of that range —
below about 12° it is stretched sideways, above about 50 the rim begins to bite. A second view
simulates the room: a seat a little above the floor, a
lens on the gaze rather than a frame, and the floor drawn so where the screen ends is legible. The
same equidistant maths runs the lens as runs the master, with the gaze for its axis instead of the
zenith and an eye off the centre — so the simulate view and the plate are two readings of one
sphere, not a picture and a projection of a picture. The floor is a plane, and a ray meets it
exactly when it points below the rim: that test is per pixel, because past 180° a plane's far side
wraps around the image and a mesh of it paints over the dome. The background is a colour and the ink
that reads on it follows its brightness, until an element is given a colour of its own; a text card
carries its own font and a line's height; a rect and a shape carry their own sides. A shape —
ellipse, triangle, diamond, pentagon, hexagon, star or line — is a silhouette painted into the same
texture a rect uses and can be solid, outlined or both, and a turned shape is the same card with
`rot` set. Presenting fits the slide to the smaller side of the screen. One slide exports as the
domemaster a projector takes: square,
black beyond the rim, no grid and no chrome. Drag, resize and turn each solve their placement,
because the tangent plane at a card's centre is not the plane the hand's offset was measured in. A
deck's pictures are decoded when it opens, so a slide change is an upload rather than a fetch. The
deck lives in the browser (`localStorage`) or in a `.dome.json` file — no server, no account, no
sync. Its files are `src/sketch/slides/{index.html,dome.js,gl.js,editor.js}`.

```bash
node work/lab/check_dome.cjs    # the geometry: round trips, the frame, the three placements
```

The check runs the page's own `dome.js`, the way the 3Dmath checks run `geom.js`: the mapping
round-trips, the horizon lands on the rim and the zenith on the centre, az 180 on the top of the
disc, a card's up vector points at the zenith, and a grab keeps the point the hand took hold of.
