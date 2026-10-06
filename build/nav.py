"""The navigation: one header for the whole site, injected into the pages that show it.

A page asks for the header with a marker where the header belongs:

    <!--nav domebase/lab/instrument-->

The trail is what the header prints, one part per level, and the href of a part is the folder at
that depth — so no page hand-writes `../` and no part can point at the wrong level. The part for
the page itself is text; every part above it is a link. A trail that does not match the page's own
depth fails the build.

Under the trail the header carries the site's sections, left justified, and the coffee link at the
right — the same on every page that has a header. A section with no page of its own stays a name.
A page that hides the navigation (the fullscreen dome pages) carries no marker and keeps whatever
corner it draws for itself.

`build_site.py` runs `inject(dist)` once, after the generated pages and the hand-written pages are
all in place, so the navigation exists once and cannot drift page by page.
"""
import re
from pathlib import Path

# The menu's sections, in order. A section shows as a link only when dist/<section>/index.html
# exists; with no page it stays a name. Archive has no page yet, and the learn page sits in the
# lab, so neither is in the list — add archive back the day it has an index.
SECTIONS = ("database", "library", "lab")
COFFEE = "https://buymeacoffee.com/taramoves"
MARKER = re.compile(r"<!--nav\s*([^>]*?)\s*-->")


def trail_of(text):
    """The trail a page declares, or None when it declares none."""
    m = MARKER.search(text)
    return [p.strip() for p in m.group(1).split("/") if p.strip()] if m else None


def header(trail, depth, linked):
    """The header for a page `depth` folders deep, whose path reads `trail`."""
    up = "../" * depth
    parts = []
    for i, label in enumerate(trail):
        if i == len(trail) - 1:                       # the page itself is not a link
            parts.append(label)
        else:
            parts.append(f'<a href="{"../" * (depth - i)}">{label}</a>')
        if i < len(trail) - 1:
            parts.append("/")
    current = trail[1] if len(trail) > 1 else ""
    menu = []
    for s in SECTIONS:
        if s not in linked:
            menu.append(f"<span>{s}</span>")          # a section with no page yet
        elif s == current:
            menu.append(f'<span class="on">{s}</span>')
        else:
            menu.append(f'<a href="{up}{s}/">{s}</a>')
    return ("<header>\n"
            f"  <h1>{''.join(parts)}</h1>\n"
            f'  <a class="bmc" href="{COFFEE}" target="_blank" rel="noopener">buy me a coffee</a>\n'
            f'  <div class="menu">{"".join(menu)}</div>\n'
            "</header>")


def inject(dist):
    """Replace every marker in `dist` with the header for the page that carries it."""
    dist = Path(dist)
    linked = {s for s in SECTIONS if (dist / s / "index.html").is_file()}
    n = 0
    for path in sorted(dist.rglob("*.html")):
        text = path.read_text(encoding="utf-8")
        trail = trail_of(text)
        if not trail:
            continue
        depth = len(path.relative_to(dist).parts) - 1
        if len(trail) != depth + 1:
            raise SystemExit(f"{path.relative_to(dist)}: the trail {'/'.join(trail)} is "
                             f"{len(trail)} parts for a page {depth} folders deep")
        path.write_text(MARKER.sub(lambda m, t=trail, d=depth: header(t, d, linked), text, count=1),
                        encoding="utf-8", newline="\n")
        n += 1
    if not n:
        raise SystemExit("no <!--nav--> marker anywhere in dist/ — the navigation did not land")
    return n
