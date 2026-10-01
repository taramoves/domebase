/* fam_packing.js — sphere packings for the 3d math lab page.

   1. soddy    the 3d Apollonian sphere packing: four mutually tangent unit
               spheres, their Soddy sphere, and the breadth-first Descartes
               (Soddy4) iteration over every mutually tangent quintuple —
               after knill 3dprinter/math/apollonian.html
   2. kissing  Newton's kissing number: twelve unit spheres touching one central
               unit sphere — after knill 3dprinter/math/kissing.html
   3. packing  the five classical lattice packings, textbook data

   Plain classic script, no dependencies, no Math.random: the same parameters
   always build the same bytes. See work/lab/CONTRACT.md. */

(function () {
  const S3 = Math.sqrt(3);
  const iClamp = (v, lo, hi) => { let n = Math.round(+v); if (!isFinite(n)) n = lo; return n < lo ? lo : n > hi ? hi : n; };

  /* geom.js is a global in the browser and on global.GEOM under the checker;
     build() also receives it, and we remember the last one for verify(). */
  let G_ = null;
  const geom = () => (typeof GEOM !== 'undefined' && GEOM) || G_;

  /* ==================================================================== *
   *  1. soddy — the 3d Apollonian sphere packing                          *
   * ==================================================================== */

  /* Four unit spheres at the corners of a regular tetrahedron of edge 2 are
     mutually tangent; their Soddy sphere is the first hole of the packing.
     A "cell" is five mutually tangent spheres: for each of the five, the other
     four have two common tangent spheres, one of which is the fifth. The other
     is new, and (four of the cell) + it is the next cell. */
  function soddyData(P, G) {
    const depth = iClamp(P.depth, 1, 8);
    const rmin = Math.max(1e-4, +P.rmin || 0.05);
    const EPS = 1e-9;           /* a repeat sphere differs by less than this */
    const MAX_SPHERES = 800, MAX_CELLS = 4000;
    const a = 1 / Math.SQRT2;   /* centre distance 2 / sqrt(2) along each axis */

    const spheres = [[1, 1, 1], [1, -1, -1], [-1, 1, -1], [-1, -1, 1]]
      .map(v => ({ c: [v[0] * a, v[1] * a, v[2] * a], r: 1 }));
    const parents = [[], [], [], []];

    const seed = G.soddy4(spheres[0], spheres[1], spheres[2], spheres[3]);
    let inner = null;
    for (const s of seed) if (isFinite(s.r) && s.r > 0 && (!inner || s.r < inner.r)) inner = s;
    if (!inner) return { spheres: spheres, parents: parents, cells: 0, deepest: 0 };
    spheres.push(inner); parents.push([0, 1, 2, 3]);

    const cells = [{ p: [0, 1, 2, 3, 4], level: 0 }];
    let head = 0, cellCount = 0, deepest = 0;

    while (head < cells.length && cellCount < MAX_CELLS && spheres.length < MAX_SPHERES) {
      const cell = cells[head++];
      cellCount++;
      if (cell.level >= depth) continue;
      const level = cell.level + 1;

      for (let i = 0; i <= 4; i++) {
        if (spheres.length >= MAX_SPHERES) break;
        const keep = [];
        for (let k = 0; k <= 4; k++) if (k !== i) keep.push(cell.p[k]);

        const sols = G.soddy4(spheres[keep[0]], spheres[keep[1]], spheres[keep[2]], spheres[keep[3]]);
        for (const s of sols) {
          if (!isFinite(s.r) || s.r <= rmin) continue;      /* r < 0 encloses the cell */
          let known = false;
          for (let k = 0; k < spheres.length; k++) {
            if (Math.abs(spheres[k].r - s.r) < EPS && G.dist(spheres[k].c, s.c) < EPS) { known = true; break; }
          }
          if (known) continue;                              /* the fifth sphere of the cell */
          let ok = true;
          for (const k of keep) if (Math.abs(G.tangency(s, spheres[k])) > 1e-7) { ok = false; break; }
          if (!ok) continue;                                /* degenerate quadruple */
          spheres.push(s); parents.push(keep.slice());
          cells.push({ p: keep.concat([spheres.length - 1]), level: level });
          if (level > deepest) deepest = level;
          break;                                            /* one new sphere per face */
        }
      }
    }
    return { spheres: spheres, parents: parents, cells: cellCount, deepest: deepest };
  }

  const soddyDef = {
    id: 'soddy',
    name: 'soddy',
    family: 'packing',
    src: 'knill 3dprinter/math/apollonian.html',

    params: [
      { k: 'depth', label: 'depth', min: 1, max: 6, step: 1, def: 3 },
      { k: 'rmin', label: 'r min', min: 0.01, max: 0.2, step: 0.01, def: 0.05 },
      { k: 'sub', label: 'sub', min: 0, max: 1, step: 1, def: 0 }
    ],

    build: function (P, G) {
      G_ = G;
      const S = soddyData(P, G);
      const b = new G.Builder();
      const sub = iClamp(P.sub, 0, 2);
      for (const s of S.spheres) G.sphere(b, s.c, s.r, sub);
      return b.out({ spheres: S.spheres.length, cells: S.cells, levels: S.deepest });
    },

    verify: function (P) {
      const G = geom();
      const S = soddyData(P, G);
      let err = 0;
      const n = S.spheres.length;
      for (let i = 0; i < 4 && i < n; i++) {
        for (let j = i + 1; j < 4 && j < n; j++) err = Math.max(err, Math.abs(G.tangency(S.spheres[i], S.spheres[j])));
      }
      for (let k = 4; k < n; k++) {
        for (const p of S.parents[k]) err = Math.max(err, Math.abs(G.tangency(S.spheres[k], S.spheres[p])));
      }
      return 'tangency error ' + err.toExponential(2) + ' over ' + n + ' spheres (' +
        S.cells + ' cells, ' + S.deepest + ' levels, r > ' + P.rmin + ')';
    }
  };

  /* ==================================================================== *
   *  2. kissing — Newton's kissing number                                 *
   * ==================================================================== */

  /* The twelve centres: the regular icosahedron at circumradius 2 has
     edge/circumradius = 2/sqrt(1+phi^2) = 1.051462, so its neighbours sit
     2.102925 apart and those twelve unit spheres never touch each other — the
     well known gap in the icosahedral picture of the kissing number. The
     arrangement in which all twelve really do kiss is the cubic close packed
     (cuboctahedral) one: each outer sphere touches the central sphere, four
     neighbours, and nothing overlaps. Its twelve centres are the edge midpoints
     of a cube of side 2*sqrt(2), i.e. (+-sqrt2,+-sqrt2,0) and its cyclic
     permutations, every one at distance 2 from the origin and 2 from four
     others.
     (Knill's icosahedral drawing is the same twelve directions as
     (0,+-1,+-phi) and its cyclic permutations scaled by 2/sqrt(1+phi^2): all
     twelve centres still at distance 2, but every neighbour 2.102925 away.) */
  function kissCentres(spread) {
    const s = Math.SQRT2 * spread, o = [];
    for (const x of [-1, 1]) for (const y of [-1, 1]) {
      o.push([s * x, s * y, 0], [s * x, 0, s * y], [0, s * x, s * y]);
    }
    return o;
  }

  const kissDef = {
    id: 'kissing',
    name: 'kissing',
    family: 'packing',
    src: 'knill 3dprinter/math/kissing.html',

    params: [
      { k: 'sub', label: 'sub', min: 0, max: 1, step: 1, def: 1 },
      { k: 'spread', label: 'spread', min: 1, max: 1.4, step: 0.01, def: 1, anim: 12 },
      { k: 'grow', label: 'grow', min: 0, max: 0.5, step: 0.01, def: 0 }
    ],

    build: function (P, G) {
      G_ = G;
      const b = new G.Builder();
      const sub = iClamp(P.sub, 0, 2);
      const spread = Math.max(0.05, +P.spread || 1);
      const r = 1 + Math.max(0, +P.grow || 0);
      G.sphere(b, [0, 0, 0], r, sub);
      for (const c of kissCentres(spread)) G.sphere(b, c, r, sub);
      return b.out({ spheres: 13, radius: r, spread: spread });
    },

    /* measured at the true kissing configuration (spread 1, unit radii) */
    verify: function () {
      const G = geom();
      const C = kissCentres(1), central = { c: [0, 0, 0], r: 1 };
      let eOut = 0, eTouch = 0, minPair = Infinity;
      for (let i = 0; i < C.length; i++) {
        eOut = Math.max(eOut, Math.abs(G.len(C[i]) - 2));
        eTouch = Math.max(eTouch, Math.abs(G.tangency(central, { c: C[i], r: 1 })));
        for (let j = i + 1; j < C.length; j++) minPair = Math.min(minPair, G.dist(C[i], C[j]));
      }
      return C.length + 1 + ' spheres; centre distance 2 error ' + eOut.toExponential(1) +
        '; central tangency error ' + eTouch.toExponential(1) +
        '; min pair distance ' + minPair.toFixed(12) + ' (error ' + (minPair - 2).toExponential(1) + ')';
    }
  };

  /* ==================================================================== *
   *  3. packing — the five classical lattices                             *
   * ==================================================================== */

  /* Unit spheres, so the nearest neighbour distance is exactly 2; the cubic
     parameters below are the ones that make that true. */
  const FCC = [[0, 0, 0], [0.5, 0.5, 0], [0.5, 0, 0.5], [0, 0.5, 0.5]];
  const HCP_DZ = Math.sqrt(8 / 3);              /* ideal hcp: c/2 for nn distance 2 */
  const LATS = {
    sc: { a: 2, basis: [[0, 0, 0]] },
    bcc: { a: 4 / S3, basis: [[0, 0, 0], [0.5, 0.5, 0.5]] },
    fcc: { a: 2 * Math.SQRT2, basis: FCC },
    diamond: { a: 8 / S3, basis: FCC.concat(FCC.map(p => [p[0] + 0.25, p[1] + 0.25, p[2] + 0.25])) },
    /* hexagonal close packing lives in its own hexagonal cell: in-plane
       vectors (2,0) and (1,sqrt3), height 2*HCP_DZ, basis A at (0,0,0) and B in
       the hollow at (1, sqrt3/3, HCP_DZ). Its nearest neighbour distance is 2,
       the same as fcc, which it matches in density. */
    hcp: { E: [[2, 0, 0], [1, S3, 0], [0, 0, 2 * HCP_DZ]], basis: [[0, 0, 0], [1, S3 / 3, HCP_DZ]] }
  };
  const KINDS = ['sc', 'bcc', 'fcc', 'hcp', 'diamond'];

  /* the page renders `choices` as a select over the index; accept a name too,
     so the shape stays right if a caller passes the label instead of the index */
  function kindOf(v) {
    if (typeof v === 'string' && !/^\s*-?\d/.test(v)) {
      const i = KINDS.indexOf(v.trim().toLowerCase());
      return KINDS[i < 0 ? 2 : i];
    }
    const n = Math.round(+v);
    if (!isFinite(n)) return KINDS[2];
    return KINDS[n < 0 ? 0 : n > KINDS.length - 1 ? KINDS.length - 1 : n];
  }

  /* n unit cells per side; each cell contributes its basis points, and hcp and
     diamond have two inequivalent sites per cell (A/B, the two diamond
     sublattices), which the interior test below needs to know. */
  function latticePoints(kind, n) {
    const L = LATS[kind], pos = [], type = [];
    for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) for (let k = 0; k < n; k++) {
      for (let bi = 0; bi < L.basis.length; bi++) {
        const b = L.basis[bi];
        if (L.E) {
          pos.push([
            i * L.E[0][0] + j * L.E[1][0] + k * L.E[2][0] + b[0],
            i * L.E[0][1] + j * L.E[1][1] + k * L.E[2][1] + b[1],
            i * L.E[0][2] + j * L.E[1][2] + k * L.E[2][2] + b[2]
          ]);
        } else {
          pos.push([(i + b[0]) * L.a, (j + b[1]) * L.a, (k + b[2]) * L.a]);
        }
        type.push(kind === 'hcp' ? bi : (kind === 'diamond' ? (bi < 4 ? 0 : 1) : 0));
      }
    }
    return { pos: pos, type: type };
  }

  /* the twelve (six, eight, four) nearest neighbour offsets of the lattice —
     the shell an interior sphere must have completely present. The two
     diamond sublattices and the two hcp layers are mirror images. */
  function nnOffsets(kind, type) {
    const o = [];
    if (kind === 'sc') return [[2, 0, 0], [-2, 0, 0], [0, 2, 0], [0, -2, 0], [0, 0, 2], [0, 0, -2]];
    if (kind === 'bcc') {
      const h = 2 / S3;
      for (const x of [-1, 1]) for (const y of [-1, 1]) for (const z of [-1, 1]) o.push([x * h, y * h, z * h]);
      return o;
    }
    if (kind === 'fcc') {
      const h = Math.SQRT2;
      for (const x of [-1, 1]) for (const y of [-1, 1]) o.push([x * h, y * h, 0], [x * h, 0, y * h], [0, x * h, y * h]);
      return o;
    }
    if (kind === 'diamond') {
      const h = 2 / S3, s = type ? -1 : 1;
      return [[1, 1, 1], [1, -1, -1], [-1, 1, -1], [-1, -1, 1]].map(v => [v[0] * h * s, v[1] * h * s, v[2] * h * s]);
    }
    /* hcp: six in-plane, three up, three down. The A and B layers sit directly
       above and below each other, so up and down share their in-plane part. */
    const s = type ? -1 : 1, k = S3 / 3;
    o.push([2, 0, 0], [-2, 0, 0], [1, S3, 0], [-1, -S3, 0], [-1, S3, 0], [1, -S3, 0]);
    for (const z of [HCP_DZ, -HCP_DZ]) o.push([s, s * k, z], [-s, s * k, z], [0, s * -2 * k, z]);
    return o;
  }

  function packCheck(kind, n, G) {
    const L = latticePoints(kind, n), pos = L.pos;
    let minPair = Infinity;
    for (let i = 0; i < pos.length; i++) {
      for (let j = i + 1; j < pos.length; j++) minPair = Math.min(minPair, G.dist(pos[i], pos[j]));
    }
    const keyOf = p => Math.round(p[0] * 1e6) + ' ' + Math.round(p[1] * 1e6) + ' ' + Math.round(p[2] * 1e6);
    const has = new Set(pos.map(keyOf));
    let inside = 0, coord = 0, partial = 0;
    for (let i = 0; i < pos.length; i++) {
      const p = pos[i];
      let full = true;
      for (const o of nnOffsets(kind, L.type[i])) {
        if (!has.has(keyOf([p[0] + o[0], p[1] + o[1], p[2] + o[2]]))) { full = false; break; }
      }
      if (!full) continue;
      inside++;
      let c = 0;
      for (let j = 0; j < pos.length; j++) if (j !== i && G.dist(pos[i], pos[j]) < 2.1) c++;
      coord = Math.max(coord, c);
      if (c !== nnOffsets(kind, L.type[i]).length) partial++;
    }
    return { count: pos.length, minPair: minPair, inside: inside, coord: coord, partial: partial };
  }

  const packDef = {
    id: 'packing',
    name: 'packing',
    family: 'packing',
    src: 'standard',

    params: [
      { k: 'kind', label: 'lattice', min: 0, max: 4, step: 1, def: 2, choices: ['sc', 'bcc', 'fcc', 'hcp', 'diamond'] },
      { k: 'n', label: 'cells', min: 1, max: 3, step: 1, def: 2 },
      { k: 'sub', label: 'sub', min: 0, max: 1, step: 1, def: 1 }
    ],

    build: function (P, G) {
      G_ = G;
      const kind = kindOf(P.kind);
      const n = iClamp(P.n, 1, 4);
      const pos = latticePoints(kind, n).pos;
      let sub = iClamp(P.sub, 0, 2);
      /* each sphere is 20*4^sub triangles, so coarsen the mesh as the block
         grows (diamond at n=3 is 216 spheres, which would otherwise spend the
         whole 250 ms budget on tessellation). */
      if (sub > 1 && pos.length > 100) sub = 1;
      if (sub > 0 && pos.length > 300) sub = 0;
      const b = new G.Builder();
      for (const p of pos) G.sphere(b, p, 1, sub);
      return b.out({ spheres: pos.length, cells: n * n * n, sub: sub });
    },

    verify: function (P) {
      const G = geom();
      const kind = kindOf(P.kind);
      const n = iClamp(P.n, 1, 4);
      const r = packCheck(kind, n, G);
      const dist = r.count < 2
        ? 'single sphere, no pair'
        : 'min centre distance ' + r.minPair + ' (error ' + (r.minPair - 2).toExponential(1) + ')';
      const co = r.inside
        ? 'coordination ' + r.coord + ' on ' + r.inside + ' interior spheres of ' + r.count +
          (r.partial ? ' (' + r.partial + ' of them irregular)' : '')
        : 'coordination n/a: no interior sphere at n=' + n + ' (every sphere misses a shell neighbour; try n=3)';
      return kind + ' n=' + n + ': ' + r.count + ' spheres; ' + dist + '; ' + co;
    }
  };

  const defs = [soddyDef, kissDef, packDef];

  if (typeof SHAPES3D !== 'undefined') defs.forEach(d => SHAPES3D.define(d));
  if (typeof module !== 'undefined' && module.exports) module.exports = defs;
})();
