# domebase — next: record pages, images, sources, contributions

Written 30 Sep 2026, before any of it is built. Nothing here is committed to except where it says
"recommend". The point of this document is to expose the decisions that are expensive to reverse.

Five things are on the table:

1. a page per film (1,202 of them) with 1–3 key images each
2. analytics
3. films and performances from outside the festival circuit (conferences, dome programming)
4. other people contributing — new works, corrections, additions
5. much later: video

They are not independent. (1) and (3) are the same problem — *what is a record?* — and (4) forces
the question the project has avoided so far: **what is the data's licence, and is it public?**

## 1. What the data has to become

Today the unit of truth is a *screening*: `fulldome_festival_films.csv`, one row per film × festival
edition, 1,662 rows, every row carrying its source file, page and verbatim quote. The site then
derives three views: works (1,202), artists (1,756), editions (53).

That shape breaks the moment a work appears somewhere that isn't a festival. "Film shown at Jena
2024" and "planetarium show running at a museum for three years" and "performance at a conference"
are the same kind of fact: **a work appeared somewhere, on a date, according to a source.**
Festival is just one kind of somewhere.

Recommended model, in three layers:

| layer | what it is | today's equivalent |
|---|---|---|
| **work** | the thing with a page and a URL: film, live show, installation, planetarium production | the film cluster (`master_id`, e.g. `FM0633`) |
| **appearance** | one work at one event, with dates, section, award, credits as printed, and the evidence for all of it | one CSV row (`row_id`, e.g. `F01655`) |
| **event** | where it happened — a festival edition, a conference, a venue's programme, a distributor catalogue | `festival_edition` |

Two fields carry the expansion: `event_kind` (festival, conference, dome_programme,
planetarium_run, competition, award_programme, catalogue, other) and `work_kind` (film, live_show,
installation, planetarium_show, compilation, interactive). Neither exists yet; both are additive.

Three consequences worth naming now:

- **Catalogue-only works.** A distributor or planetarium catalogue lists works with no screening
  behind them. The model must allow a work with zero appearances, sourced to the catalogue. If it
  doesn't, the first non-festival source you ingest will be mangled into a fake festival.
- **Runs are not screenings.** A five-year planetarium run is one appearance with
  `date_start`/`date_end`, not 400 screenings. Dates arrive messy and printed
  ("26th – 28th May 2015 (date line as printed in the 2016 programme…)"), so keep the printed
  string as evidence *and* a parsed best-effort range, as the pipeline already does.
- **Identity gets harder with every source.** The same film will arrive from festivals, catalogues
  and a Vimeo channel, with variant titles ("27 films have variant titles, 28 have variant artist
  spellings" — `qa/repeats.csv`). Merging becomes the critical path, so every merge decision needs
  to be a recorded, auditable row, not a silent edit in a script.

## 2. Page per film

Static pages generated at build time. Client-side routing (`/film/?id=…`) is rejected: the whole
value is a URL you can cite, link, and let a search engine index.

**Scale, honestly:** 1,202 work pages + 1,756 artist pages + ~53 event pages ≈ **3,000 URLs**, plus
the existing `/database/` browser as the searchable index on top. Each page is small if the sheet is
*linked* rather than inlined (inlining `site.css` into 3,000 pages would add ~24 MB for nothing;
inline only stays for the database page, which must work offline by double-click).

**URLs — recommend flat and singular:**

```
/film/<slug>/        /artist/<slug>/        /event/<id>/
```

`<slug>` is a readable, stored, permanent field — not derived at render time, because titles get
corrected and a corrected title must not break a URL. Collisions get `-<year>`, then `-<master_id>`
as a last resort. When a slug must change, a `redirects.csv` row emits a 301.

**What's on a work page:** the title; identity rows (year, country, runtime, format) — *only rows
that have values*, since 626 rows have no country, 565 no duration, 354 no director; credits as
links; every appearance with its event, section and award; then the evidence block: source document,
page, and the verbatim quote. That last block is the project's distinguishing feature and belongs on
the page, not hidden in the repo — it's what makes a page citable.

The page must look like the sheet, not like a document: label/value rows in the same ruled grid, no
prose, no metadata furniture. Sparse records are the normal case, not the edge case.

**Also generated:** `/films/`, `/artists/`, `/events/` indexes, `sitemap.xml` (~3,000 URLs),
`robots.txt`, a real `<title>` per page (the visible page stays clean; the `<head>` is for
machines), and links both ways between the browser and the pages (`/database/#q=title:…`).

## 3. Images

Assume from the start that images are the part with legal weight.

A `media` table keyed to the work:

| field | why |
|---|---|
| `kind` | key_image / poster / still / video |
| `source_url` | where it came from |
| `local_path` | only if mirrored |
| `credit` | who to name — non-negotiable, it's the price of use |
| `licence` | permission, press kit, fair quotation, unknown |
| `rights_status` | hotlinked / permitted / requested / removed |
| `added_by`, `added_at`, `note` | provenance of the image itself |

Retrofitting a rights column across 1,200 works later is much worse than carrying it from the first
image. Same for `credit`.

**Transport.** Hotlinking is what the site does now for fddb.org posters (and those URLs will rot).
Mirroring 1,202 thumbnails at ~60 KB is ~70 MB of repo and disk — and the C: drive is at 99%, so
that is a real constraint, not a formality. Recommend: **pre-generate one small (≈800 px) thumbnail
per image at build time and commit it**, no on-the-fly resizing — Vercel's free tier allows 5,000
image transformations a month, which 3,000 pages would burn through instantly.

**Rights approach.** 1–3 images per work, credited, with a documented takedown route and a
`rights_status` of `requested` until a permission exists. Planetarium producers and distributors are
usually glad to have a well-credited still; asking is cheap and it's also how you find out who owns
what, which you need anyway.

## 4. Video (long term)

Model it now, ship it whenever: `media.kind='video'` with `provider` (vimeo/youtube/self),
`embed_url`, `access` (trailer/excerpt/full), `licence`. The work-page layout reserves the slot so
adding it later isn't a redesign.

**Never host the films ourselves.** Full films are typically licensed to planetariums; publishing
them isn't the site's call, and 100 GB/month would not survive real video anyway. Trailers and
excerpts embedded with permission, distributors linked from the page.

## 5. Analytics

**Recommend Vercel Web Analytics**: one toggle, no code, no cookies, 50,000 events/month on the free
tier, pageviews + referrers + countries. For a site that wants to know *which films get read*, that
is the whole job.

The instrument that actually matters for a database is **search behaviour** — especially searches
that return nothing, which is a to-do list for missing data. Vercel accepts custom events from the
page, so: send one event per settled query with the query text, result count and filter state;
aggregate, no identifiers.

Watch the event budget — 50,000/month against a page that can serve 215,000 views is not a lot, so
send one event per settled search (never per keystroke), and consider sending only zero-to-few-result
queries, which are the informative ones.

Alternative if you'd rather not use Vercel: GoatCounter (free for non-commercial, no cookies) or
self-hosted Umami — but self-hosting is a server, i.e. the backend we don't need.

## 6. Contributions

The rule that makes this site worth anything is that **every claim carries a source**. A contribution
system that lets people type into fields would destroy that in a month. So contributions arrive as
**evidence-backed proposals**, and the maintainer accepts them.

**Recommended flow, version one — GitHub issues, no new infrastructure:**

1. every work and artist page carries one quiet link: *correct this record* / *add a source*
2. it opens a pre-filled issue in `taramoves/domebase` via a template asking for exactly: record id,
   field, current value, proposed value, **source** (URL or document + page), quote, your name
   (optional), and — for images — a rights declaration
3. the issue list *is* the moderation queue, labelled `credits`, `dates`, `awards`, `images`,
   `new work`, `removal`
4. accepted changes land in `qa/corrections.csv` — which already exists and is already applied by
   the merge — with the contributor and the source recorded, then rebuild, push, live in ten seconds
5. the page's evidence block then reads *"corrected by X, from Y"*

That last step is the incentive: contributors are credited in the data itself. Nothing needs an
account on domebase, no server, no database, and the whole history is public.

**What it costs:** every accepted change is your time, so the template must force the evidence —
that's what keeps the queue one-click.

**Barrier to entry:** a GitHub account. Most planetarium staff have one; many artists don't. If that
turns out to be the bottleneck, add a plain public form (Tally or similar) that opens the same issue
through a webhook with an email address, plus a captcha. Don't build that first.

**Two prerequisites before the door opens:**

- **A licence.** Decide what others may reuse. Recommend: the structured compilation (titles,
  credits, dates, awards, sources) under **CC BY 4.0** with attribution to domebase, while quoted
  programme text and images stay with their owners and are shown as citation, not relicensed.
  Without a stated licence you cannot cleanly accept a contribution, and reusers can't know where
  they stand.
- **A removal route.** A visible way for a rights holder to say *that's not mine* or *take it down*,
  and a willingness to act within days. Cheaper to publish than to retrofit.

**Data visibility.** Contributions target the data, which raises a question the repo deliberately
avoided: `work/` is private because it holds raw programme dumps and provenance quotes. Two options:
(i) keep it private and take contributions as issues that you apply — simplest, preserves the
current position; (ii) publish a curated read-only data mirror (`data/works.csv`, `data/appearances.csv`,
no raw dumps) so contributors can see exactly what they're correcting and power users can open pull
requests. Recommend (i) now, (ii) only when contributions are actually flowing: the page's own
evidence block already shows contributors everything they need to propose a fix.

## 7. Order of work

Each phase ships on its own.

| phase | what | why here |
|---|---|---|
| **0** | decide: licence, URL scheme, analytics, contribution channel, data visibility | all are expensive to reverse |
| **1** | the model: work / appearance / event, `slug`, `work_kind`, `event_kind` — then work + artist + event pages, indexes, sitemap | the structural phase; everything else builds on the identity of a record |
| **2** | analytics (Vercel + search events) | a toggle and twenty lines; do it while the pages are new |
| **3** | images: `media` table with rights fields, thumbnails, 1–3 per work | the phase with legal weight, so it comes after the model is settled |
| **4** | corpus expansion: conference and dome-programme sources, catalogue-only works | prove `event_kind` on one conference and one catalogue before bulk |
| **5** | contributions: issue templates, attribution through `qa/corrections.csv` | needs phase 0's licence decision and a queue that stays small |
| **6** | video embeds | when a first permission exists |

Sequencing notes:

- Phase 1 is the only phase that touches the existing 1,662 rows; after it, everything is additive.
- Vercel's build image running Python for a data-then-pages build is **unverified** — the current
  setup commits `dist/` and Vercel only serves it. Keep committing `dist/` until a CI build is
  proven, and expect commit churn once there are 3,000 files.
- Phases 3–5 all add to `qa/` and `enrichment/` style side tables; keep that pattern, it's what makes
  the data auditable rather than merely large.

## 8. Decisions taken (30 Sep 2026)

| # | decision | taken |
|---|---|---|
| 1 | URL scheme | flat, singular: `/film/<slug>/`, `/artist/<slug>/`, `/event/<id>/`; the browser stays at `/database/` |
| 2 | licence for the compilation | structured data CC BY 4.0, attributed to domebase; quoted programme text and images remain their owners', shown as citation |
| 3 | contribution channel | a form on the site that opens a pre-filled GitHub issue |
| 4 | data visibility | the data stays local (`work/` private); contributors work from what the page shows |
| 5 | analytics | Vercel Web Analytics, plus one custom event per settled search |
| 6 | first non-festival sources | IMERSA (conference) and Hubblo (distributor catalogue) |

### 8a. Slug policy, measured against the real catalogue

Run over all 1,202 works: **1,202 distinct slugs, zero collisions.** The `-<year>` and
`-<master_id>` fallbacks are therefore insurance, not routine. One work has no title at all and
needs `<master_id>` as its slug. Longest slug is 76 characters. Collisions must nevertheless be
handled in code from day one, because a merge will create one eventually.

### 8b. How a contribution actually happens

GitHub's YAML issue forms give a real form UI, but a URL cannot pre-fill their individual fields —
that is a long-standing feature request, not a feature. So the form lives on **our** page instead:

1. a work or artist page carries one quiet link — *correct this record* / *add a source*
2. it opens a form on domebase, in the site's own style, asking for: what's wrong or missing, the
   proposed value, the **source** (URL or document + page), the quote, your name (optional)
3. submitting sends nothing to a server — the page composes the issue text and opens GitHub's
   *new issue* page with it already written; the contributor reads it, and clicks **Create**
4. it arrives in `taramoves/domebase` issues, labelled, with the record id in the title
5. accepted → a row in `qa/corrections.csv` carrying contributor + source → rebuild → push → live
6. the page's evidence block then reads *"corrected by X, from Y"*

The one barrier is a GitHub account. A `mailto:` link with the subject pre-filled covers people
without one, so nobody is turned away; the maintainer pastes those into issues. A hosted form
service (no GitHub account needed) is the next step *only if* that barrier proves real — it
changes nothing else in the flow.

### 8c. What "data visibility" means

The repository holds the site; the data lives on one machine in `work/`, deliberately, because the
raw programme dumps are other people's text. The question is what a would-be contributor can see:

- **(i) as decided — the page is the window.** Contributors see the record, its source and its
  quote, exactly as a reader does. They propose; the maintainer applies. Nothing new is published,
  and `work/` stays out of the repository.
- **(ii) a curated data mirror** (`data/works.csv`, `data/appearances.csv` in the repository, no raw
  dumps). Contributors could then see the whole dataset, find gaps themselves, and open pull
  requests with data changes, and the site could rebuild itself in CI. It is consistent with the
  CC BY 4.0 licence — but it publishes the dataset and turns the workflow into "changes arrive as
  PRs".

Trigger to revisit (ii): contributions are actually flowing, or someone offers to help with bulk
data entry. Decision (i) makes the maintainer the bottleneck for every accepted change; that is the
cost being accepted for now.

### 8d. Why analytics

Not to watch individuals — Vercel's analytics sets no cookies and reports aggregates. It answers
three things the project currently guesses at: which works and artists are actually read (where
images and credits are worth deepening), which searches return nothing (a to-do list of missing
data), and whether the site is being found at all (referrers, entry pages).

### 8e. The two first sources, and what each one tests

- **IMERSA** — the annual immersive-media summit (Denver Museum of Nature and Science historically),
  whose programme covers dome programming, live shows and non-astronomy content. It stresses the
  model in a specific way: at a conference the thing presented is often a **talk, demo or
  workshop**, not a screening. So an appearance needs a contribution type (screening /
  presentation / workshop / installation / live show), and a conference session is not a festival
  edition.
- **Hubblo** — Montreal, a fulldome distributor (`hubblo.ca`, listed as *Hubblo Immersion* on
  fddb.org) with a catalogue of roughly 28 licensed works. It tests the other extreme:
  **catalogue-only works**, with no screening behind them. It is also a gap-filler — the catalogue
  overlaps records that already exist (`In the Land of the Flabby Schnook`, `Lands of the Americas`,
  `Bébé Symphonique`, `Partita for 8 Voices`, `Worlds Beyond Earth`, `Journey to the Stars`,
  `Passport to the Universe`, `Cosmic Collisions`), and can supply country, year, runtime and
  distributor for works whose festival programme printed nothing.

That overlap is the strongest argument for a **source registry**: a catalogue is a different kind of
source from a festival programme, it can corroborate existing rows, and it can fill the empty
country/runtime fields that 626 and 565 rows respectively are missing.

## 9. Order of work

## 10. Taken since (30 Sep 2026, same session)

### 10a. Scope: work in the dome, anywhere — VR out

The aim is a full overview of **work in the dome, wherever it plays**: festival, planetarium,
distributor catalogue, dome programme. **Virtual reality is out of scope**, even where the same
distributor carries it. Applied to the Hubblo catalogue (66 works): 48 in scope — 27 of them
already ours, 21 new — 15 VR-only excluded, 3 to decide. Where a source mixes the two, keep the
excluded rows in the source file with a `scope` column rather than deleting them, so the call stays
reversible.

**Confirmed as a rule (1 Oct 2026).** Dome works only, everywhere they play. One clause added:
**a project that exists in both a dome and a VR version keeps its dome work, and the VR version is
noted in that work's description** rather than being recorded as a second work. Worked example:
*The Lost Garden* — we hold it as a dome work (Jena 2026, dir. Michel D.T. Lam, 8 min) and Hubblo
lists it as VR (2023, same director). The dome record carries the note; the VR row stays in the
source file as `out of scope`. Mechanically: notes live in `enrichment/work_notes.csv`, are lifted
by `model.apply_notes()`, and sit in the description behind `model.NOTE_MARK`, which the publish
trim protects and then strips — otherwise a 280-character trim of the description would silently
eat the note.

### 10b. A work is not one kind: a performance can also be a film

A live dome show gets recorded and is later **screened as a film**, and the same work can be
programmed both ways at different events. This is already true of two works in the existing data
(*Cloud Bodies*, *KUR KOMMANDER* — each has a live appearance and a screening). Therefore:

- `work_kinds` is the **set** of kinds a work carries; `work_kind` is only the display primary.
- `work_form` reads that set plainly: `film`, `live`, `live + film`, `other`.
- an appearance carries `relation` and `related_appearance_id`, so a screening can be tied to the
  live appearance whose recording it is (`screening-of-live`). **Never inferred** — filled in when
  a source says so.

### 10c. A compilation is a programme, not a work

Hubblo carries *SAT FEST 2022 / 2024 / 2026*. These are the festival's own compilation programmes,
so they attach to the SATFEST edition as a sub-event (`event_kind = compilation`), the same way
IMERSA Day attaches to a Jena edition. SAT Fest 2026 already exists as an edition with 60
appearances; ingesting the three as works would have created duplicates of a festival.

### 10d. Every place another source mentions is a lead

Any festival, planetarium, venue or conference named in any source becomes a row in
`work/db/leads/places.csv` — a queue of places to look for dome works, whether or not we track them
(`status = tracked | to-check`), with the mention that produced it. Confidence is tiered:
**high** = a source listed it as a place a work played; **medium** = named in two or more of our own
documents; **low** = one passing prose mention. It is a lead generator, not evidence: not published,
and a lead becomes data only through the normal evidence route. First run: 177 places, 316 mentions,
18 already tracked.

All of Hubblo's *dome* festival mentions resolve to festivals already tracked, so its value is the
works rather than new events. The untracked dome leads it produced are **Fulldome Festival Fukuoka
(IFSV)**, **Fiske Fulldome Festival (Colorado)** and **Festival FFB Fulldome (Czech Republic)**, plus
~17 **planetariums** mined from our own programme texts (Melbourne, Charles Hayden, Morehead, Rio
Tinto Alcan, Adler, Clark, Fiske, Hamburg…) — planetariums matter as a source type this project does
not yet read, because they produce their own dome shows.

## 11. Contributions — the form on a record (1 Oct 2026)

Asked for: on a film's record, a visitor can add up to three images, a video link, a description, and
correct any field.

**What a static site can do.** There is no backend and no server, so the form cannot write to the
database. It **composes** the submission and hands it over; the composed text is shown on the page
before it goes anywhere, and can be copied:

- **email it** — leads, because it needs no account. Opens a prefilled message to the address in the
  footer; image files are attached to that message.
- **open a GitHub issue** — the same body in a prefilled issue on the public repo (issues enabled).
  Needs a GitHub account, but it hosts the image files, which is how "up to three images" works without
  a storage bill.
- **copy** — for anything else, or when leaving the page is not wanted.

**Everything is a proposal.** The form says so and the pipeline enforces it: a submission is a claim
with a source, which is checked and then lands as a row in `qa/corrections.csv` or
`enrichment/work_fills.csv`, exactly like a Hubblo proposal. Nothing a visitor types changes the
published record on its own.

**Not built, and what each would need** (see the assistant's note in the same session for the full
list): uploads through the page need a serverless endpoint (Vercel functions cap a request body at
4.5 MB), object storage (Vercel Blob or R2), a queue that is not email (KV/Postgres, or the GitHub API
with a token), abuse control, and a contributions section in the review sheet. Auto-ingest on an
accepted contribution needs a token plus a deploy hook, and depends on the build running in CI —
which is still unverified.
