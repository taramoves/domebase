# Deploying domebase

**Live now: <https://domebase.vercel.app>** — Vercel project `domebase`, team `nft-arot`.
There is no git connection yet: a deploy is a CLI push of this folder.

```
npx --yes vercel@latest deploy --prod
```

`npx` is deliberate — the globally installed CLI (42.2.0) is too old for Vercel's upload
endpoint and aborts with `this endpoint requires version 47.2.2 or later`. `vercel.json` points
the deploy at `dist/`, and `.vercelignore` keeps `work/` off the upload.

**From the GitHub repo** (GitHub `taramoves/domebase`): import it in Vercel with **no build command**,
**no install command**, and **Output Directory = `dist`** — `dist/` is committed, so Vercel only
has to serve it. Or connect the repo to the existing `domebase` project so every push deploys
itself.

**There is no backend.** No server code, no database server, no API, no keys, no build step on
the host. Every page is a static file, and the database page carries its own data inside it, so
the host only ever serves files. Any static host works, including a folder on a disk opened by
double-click.

Build first:

```
python build/build_site.py
```

That writes `dist/` — the deploy root:

```
dist/index.html                     the home page
dist/assets/css/site.css            the stylesheet the document pages link
dist/assets/fonts/                  Computer Modern (unused for now, kept with the site)
dist/database/index.html            the database page, 3.50 MB (0.51 MB gzipped, 0.47 MB brotli)
```

Five files, 3.64 MB. Nothing under `work/` is copied in, so the programme text dumps, the CSV
sources, the SQLite file and the build scripts are never published.

## GitHub Pages

Commit the project, then add `.github/workflows/pages.yml`:

```yaml
name: pages
on:
  push:
    branches: [main]
  workflow_dispatch:
permissions:
  contents: read
  pages: write
  id-token: write
jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-python@v5
        with:
          python-version: '3.11'
      - run: python build/build_site.py
      - uses: actions/upload-pages-artifact@v3
        with:
          path: dist
  deploy:
    needs: build
    runs-on: ubuntu-latest
    environment:
      name: github-pages
      url: ${{ steps.deployment.outputs.page_url }}
    steps:
      - id: deployment
        uses: actions/deploy-pages@v4
```

Then Settings → Pages → Source: **GitHub Actions**.

The workflow rebuilds `dist/` from the sources on every push, so the generated page is never
committed and never hand-edited.

> Do **not** point Pages at the repository root. That would publish `work/` — every programme
> text dump, the SQLite file and the build scripts — as part of the site.

## Vercel

The project is plain HTML, so no framework preset: set **Output Directory** to `dist` (Root
Directory `.`), or commit a `vercel.json`:

```json
{ "outputDirectory": "dist" }
```

Either build locally before you push, or set the build command to `python build/build_site.py`
(the Vercel image has Python 3).

## Netlify

Drag the `dist/` folder onto the deploy area, or set **Publish directory** to `dist`. For a
build-on-push setup, command `python build/build_site.py`, publish directory `dist`.

## Anywhere else

Copy `dist/` to the web root, a bucket, or a USB stick. `dist/index.html` opens by
double-click with no server at all — the database page needs no network, though the hotlinked
poster images and film links do.

## Two things worth deciding before it goes public

1. **Indexing.** The pages carry no `robots` tag, so they are indexable. If domebase should be
   unlisted for now, add `<meta name="robots" content="noindex,nofollow,noarchive">` to the
   `<head>` of `src/database/app.html` (the database page) and to `index.html` (the home
   page), then rebuild.
2. **Quoted programme prose.** The build keeps it as excerpts (`--prose-length 280`, marked with
   `…`). Every quoted span came out of a festival programme; if the site should not republish
   them at all, build with `--prose-length 0`.
