# domebase — style

Set by the user, 30 Sep 2026. Applies to every page in this project.

## Rules

- Black on white. All text `#000`. No colour.
- **Arial**, everywhere. No webfont, no serif.
- A spreadsheet, not a document: ruled grid, sheet tabs, boxed controls, `#efefef` header
  fill. Structure comes from rules and fills.
- No descriptive text and no metadata lines. A page shows data, names and controls — never
  a sentence explaining what the page or a section is, and never a "how this works" block.
- Anything you can open, sort, filter or go to is a link. Inside the sheet, links are not
  underlined until hover.
- Dead links are fine in this project. The home page links to nothing at all.
- Ship the smallest artifact that works.

## Files

```
src/                    hand-written pages and assets — what the site is
  index.html            home: the name and five section names, no links
  assets/css/site.css   the one stylesheet: document pages link it, the database page inlines it
  assets/fonts/         cmu-serif-roman.woff, OFL.txt (kept, unused since Arial)
  database/             app.html + app.js — the database section's own page source
  library/notes/        the library's notes, one per work
  archive/ lab/ learn/  a folder per section, as they are built
work/db/                the database pipeline: sources, parsers, page build
work/library/           the library pipeline: the shelf (data/) and its build
build/build_site.py     builds the library page and the database page, then dist/
dist/                   the deploy root — generated, and the only thing ever served
IDEA.md STYLE.md README.md DEPLOY.md
```

- Nothing generated ever sits in `src/`. The database page exists only as
  `dist/database/index.html`, built from `src/database` + `work/db`, and the library page only
  as `dist/library/index.html`, built from `work/library`, so no one can edit output by
  mistake. A section folder in `src/` holds that section's own sources.
- A page links `assets/css/site.css`; from a section folder, `../assets/css/site.css`.
- Full-height app pages (the database) put `class="app"` on `<body>`. Document pages use
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
in `work/library/data`, and `build_site.py` runs it on every build. It is a document page: it
links `../assets/css/site.css` rather than inlining it, so restyling the site restyles it.

```
work/library/data/sources.csv            the shelf: one row per work. Edit this
work/library/data/tags.csv               the tag vocabulary; a tag is declared before it is used
work/library/build/build_shelf.py        csv -> dist/library/index.html + SHELF.md + TAGS.md
work/library/build/seed_from_corpus.py   one-time seed, kept for provenance
src/library/notes/                       one note per work (step 2)
```

The shelf is 45 sources. The build fails on a tag that is not declared, a file that is not on
disk, or two rows on one file; it warns on a row with no year and on a tag used once. Columns,
rules and the note format: `work/library/README.md`.

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
