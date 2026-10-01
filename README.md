# domebase

A fulldome resource site, built and deployed as plain static files.

```
src/                    what the site is — hand-written pages and assets, nothing generated
  index.html            the home page: the site name and the five section names, no links
  assets/css/site.css   the one stylesheet
  assets/fonts/         Computer Modern (kept, unused since the site moved to Arial)
  database/             app.html + app.js — the database section's own page source
  library/notes/        the library's notes, one per work
  archive/ lab/ learn/  one folder per section, as they are built
work/db/                the fulldome festival database: sources, parsers, page build
work/library/           the library: the shelf (data/) and its build
build/build_site.py     the site build
dist/                   the deploy root — generated; the only thing that is ever served
IDEA.md  STYLE.md  README.md  DEPLOY.md
```

This repository is the site: `src/`, `build/`, `dist/`, the docs and `vercel.json`. The data
pipeline (`work/db/` — the source CSVs, the provenance, the raw programme dumps) is deliberately
**not** in it, and neither is anything else that is not the site. `dist/database/index.html` is
committed from a local build, so a host needs nothing but files.

Style: `STYLE.md` — black on white, Arial, ruled spreadsheets, no colour, no decoration,
no descriptive lines. Brief: `IDEA.md` — five sections: database, archive, library, lab, learn.

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
