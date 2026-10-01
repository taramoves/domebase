"""Build domebase: the database page, then the whole deployable site in dist/.

    python build/build_site.py                  # rebuild the database page and dist/
    python build/build_site.py --skip-db        # dist/ only, reusing the page already built
    python build/build_site.py --prose-length 0     # no quoted programme prose at all
    python build/build_site.py --full-prose     # keep every quoted word (not for publishing)

Layout this script maintains:

    src/                 what the site is: hand-written pages and assets, nothing generated
    work/db/             the fulldome festival database: CSV + SQLite sources, parsers, page build
    work/library/        the library section: the shelf (sources.csv, tags.csv) and its build
    build/build_site.py  this script
    dist/                the deploy root — the only place a server ever serves from

The database page is a generated artifact: markup, script and data all come out of work/db, so
it is written straight into dist/ and never lives in src/. Nothing under work/ is copied into
dist/, so the programme text dumps, the SQLite file and the build scripts stay private.
"""
import argparse, gzip, pathlib, shutil, subprocess, sys

ROOT = pathlib.Path(__file__).resolve().parent.parent      # domebase/
SRC = ROOT / "src"                                         # hand-written site
DB = ROOT / "work" / "db"                                  # the data pipeline
LIB = ROOT / "work" / "library"                            # the library section's pipeline
SHEET = SRC / "assets" / "css" / "site.css"                # the one stylesheet
DIST = ROOT / "dist"                                       # deploy this
PAGE = DIST / "database" / "index.html"                    # generated, deployed
GENERATED = ("database", "library")   # sections whose page this build writes into dist/;
                                      # their sources stay in src/, and they are not copied in


def sh(cmd, cwd):
    print("$", " ".join(str(c) for c in cmd[1:]))
    r = subprocess.run([str(c) for c in cmd], cwd=str(cwd))
    if r.returncode:
        sys.exit(f"failed: {cmd}")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--skip-db", action="store_true", help="do not rebuild the database page")
    ap.add_argument("--prose-length", default="280",
                    help="characters of quoted programme prose to keep (default 280, 0 = none)")
    ap.add_argument("--full-prose", action="store_true", help="keep all quoted prose")
    ap.add_argument("--no-posters", action="store_true", help="drop the hotlinked poster images")
    a = ap.parse_args()

    # one stylesheet: the pipeline inlines the site sheet, so restyling the site restyles the page
    shutil.copy(SHEET, DB / "build" / "browser_style.css")
    print(f"stylesheet -> {DB / 'build' / 'browser_style.css'}")

    keep = PAGE.read_bytes() if (a.skip_db and PAGE.exists()) else None
    if DIST.exists():
        shutil.rmtree(DIST)
    (DIST / "database").mkdir(parents=True)

    # the library section: the shelf page, written into dist/library/ by its own pipeline
    sh([sys.executable, LIB / "build" / "build_shelf.py"], ROOT)

    if a.skip_db:
        if keep is None:
            sys.exit("--skip-db but there is no dist/database/index.html to keep")
        PAGE.write_bytes(keep)
        print(f"kept {PAGE.relative_to(ROOT)}")
    else:
        sh([sys.executable, DB / "build" / "make_browser.py"], DB)
        cmd = [sys.executable, DB / "build" / "make_publish.py",
               "--favicon", "", "--out", PAGE]
        if not a.full_prose:
            cmd += ["--prose-length", a.prose_length]
        if a.no_posters:
            cmd += ["--no-posters"]
        sh(cmd, DB)

    # the hand-written pages: every section folder in src/ is copied in as-is, except the
    # generated ones — their page the build already wrote, and their sources stay out of dist/
    for item in sorted(SRC.iterdir()):
        if item.name in GENERATED:
            continue
        target = DIST / item.name
        if item.is_dir():
            shutil.copytree(item, target, dirs_exist_ok=True)
        else:
            shutil.copy(item, target)

    files = [f for f in DIST.rglob("*") if f.is_file()]
    raw = sum(f.stat().st_size for f in files)
    print(f"\ndist/ {raw / 1048576:.2f} MB in {len(files)} files")
    if PAGE.exists():
        b = PAGE.read_bytes()
        print(f"  the database page: {len(b)/1048576:.2f} MB raw · "
              f"{len(gzip.compress(b, 9))/1048576:.2f} MB gzipped over the wire")
    lp = DIST / "library" / "index.html"
    if lp.exists():
        b = lp.read_bytes()
        print(f"  the library page:  {len(b)/1024:.0f} KB raw · "
              f"{len(gzip.compress(b, 9))/1024:.0f} KB gzipped over the wire")
    print("  deploy dist/ — see DEPLOY.md")


if __name__ == "__main__":
    main()
