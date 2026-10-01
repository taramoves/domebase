# the library vault

Open this folder as a vault in Obsidian (`src/library/notes`).

- **`<id>.md`** — one work on the shelf. `id` is the file name, and it is what the shelf in
  `work/library/data/sources.csv` calls the work. The tags in the frontmatter are the shelf's
  tags; the sheet is the source of truth, and `work/library/build/tags.py` keeps them in step.
- **`arguments/<slug>.md`** — one argument, the claim as the title, the evidence quoted and
  cited, the strongest counter, and what would settle it. The review is these pages in order.
- Links are `[[id]]` for a work and `[[slug]]` for an argument. Tags are the vocabulary in
  `work/library/data/tags.csv` — declared there before they are used here.

Every quote carries its page (`— PDF p. 6`) because `work/library/build/verify_quotes.py`
checks each one against the text extracted from the file itself. A quote with no page cannot
be checked, so it cannot be used.

Nothing in this folder is deployed: the whole `src/library/` section is generated output plus
these sources, and `build/build_site.py` never copies it into `dist/`.
