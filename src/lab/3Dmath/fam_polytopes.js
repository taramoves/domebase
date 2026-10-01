/* fam_polytopes.js — the six regular convex 4-polytopes.

   Knill's 5/8/16/24/120/600 cell pictures, built the way they are: the polytope
   lives in four dimensions, six plane rotations drive the animation, a 4d
   perspective projection drops it into space, and the fourth coordinate sets the
   ink (his renders colour by the height in the fourth dimension; here the tone
   runs from the hairline grey of the far side to black at the near side).

   Vertex sets: the standard coordinates for the 5, 8, 16, 24 and 600 cell; the
   120 cell is derived as the dual of the 600 cell — its 600 vertices are the
   centroids of the 600 tetrahedral cells, found as the 4-cliques of the 600
   cell's edge graph, and its 1200 edges are the pairs of cells sharing a
   triangle. Both constructions are checked in verify(). */

(function () {
  const D = Math.PI / 180, PHI = (1 + Math.sqrt(5)) / 2, EPS = 1e-9;

  /* ---------- four dimensions ---------- */
  const sub4 = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2], a[3] - b[3]];
  const add4 = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2], a[3] + b[3]];
  const mul4 = (a, s) => [a[0] * s, a[1] * s, a[2] * s, a[3] * s];
  const dot4 = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2] + a[3] * b[3];
  const len4 = a => Math.sqrt(dot4(a, a));
  const scaleTo = (V, r) => {
    let m = 0;
    for (const v of V) m = Math.max(m, len4(v));
    return V.map(v => mul4(v, r / m));
  };

  function permutations(v) {
    const out = [];
    for (let a = 0; a < 4; a++) for (let b = 0; b < 4; b++) for (let c = 0; c < 4; c++) for (let d = 0; d < 4; d++) {
      if (a === b || a === c || a === d || b === c || b === d || c === d) continue;
      out.push([v[a], v[b], v[c], v[d]]);
    }
    return out;
  }
  function parity(p) {
    let inv = 0;
    for (let i = 0; i < p.length; i++) for (let j = i + 1; j < p.length; j++) if (p[i] > p[j]) inv++;
    return inv % 2;
  }
  function evenPermutations(v) { return permutations(v).filter(p => parity(p) === 0); }

  function signVariants(p) {
    const nz = [];
    p.forEach((x, i) => { if (Math.abs(x) > EPS) nz.push(i); });
    const out = [];
    for (let s = 0; s < (1 << nz.length); s++) {
      const v = p.slice();
      nz.forEach((i, j) => { v[i] = ((s >> j) & 1) ? Math.abs(p[i]) : -Math.abs(p[i]); });
      out.push(v);
    }
    return out;
  }

  function dedupe(list) {
    const seen = new Set(), out = [];
    for (const v of list) {
      const k = v.map(x => Math.round(x * 1e9) + 1e-9).join(',');
      if (seen.has(k)) continue;
      seen.add(k); out.push(v);
    }
    return out;
  }

  /* every pair at the minimum distance — for a regular polytope that is the edge set */
  function edgesOf(V) {
    const n = V.length;
    let best = Infinity;
    for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) {
      const d = len4(sub4(V[i], V[j]));
      if (d > 1e-12 && d < best) best = d;
    }
    const E = [];
    for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) {
      if (len4(sub4(V[i], V[j])) < best * (1 + 1e-6)) E.push([i, j]);
    }
    return { E, len: best };
  }

  function degrees(n, E) {
    const d = new Array(n).fill(0);
    for (const [a, b] of E) { d[a]++; d[b]++; }
    return d;
  }

  function edgeSpread(V, E) {
    let mn = Infinity, mx = 0;
    for (const [a, b] of E) { const d = len4(sub4(V[a], V[b])); if (d < mn) mn = d; if (d > mx) mx = d; }
    return mx ? (mx - mn) / mx : 0;
  }

  /* ---------- vertex sets ---------- */
  function v5cell() {
    const a = 1 / Math.SQRT2;
    const t = [[a, a, a], [a, -a, -a], [-a, a, -a], [-a, -a, a]];
    const h = Math.sqrt(4 - 3 / 2);                       /* apex distance for edge 2 */
    const V = t.map(p => [p[0], p[1], p[2], 0]);
    V.push([0, 0, 0, h]);
    const c = V.reduce((s, v) => add4(s, v), [0, 0, 0, 0]).map(x => x / 5);
    return scaleTo(V.map(v => sub4(v, c)), 1);
  }
  function v8cell() {
    const V = [];
    for (let m = 0; m < 16; m++) V.push([0, 1, 2, 3].map(i => ((m >> i) & 1) ? 1 : -1));
    return scaleTo(V, 1);
  }
  function v16cell() {
    const V = [];
    for (let i = 0; i < 4; i++) for (const s of [1, -1]) { const v = [0, 0, 0, 0]; v[i] = s; V.push(v); }
    return scaleTo(V, 1);
  }
  function v24cell() {
    const V = [];
    for (let i = 0; i < 4; i++) for (let j = i + 1; j < 4; j++) for (let m = 0; m < 4; m++) {
      const v = [0, 0, 0, 0];
      v[i] = (m & 1) ? 1 : -1; v[j] = (m & 2) ? 1 : -1;
      V.push(v);
    }
    return scaleTo(V, 1);
  }
  function v600cell() {
    const out = [];
    for (let i = 0; i < 4; i++) for (const s of [1, -1]) { const v = [0, 0, 0, 0]; v[i] = s; out.push(v); }
    for (let m = 0; m < 16; m++) out.push([0, 1, 2, 3].map(i => ((m >> i) & 1) ? .5 : -.5));
    for (const p of evenPermutations([PHI / 2, .5, 1 / (2 * PHI), 0])) {
      for (const v of signVariants(p)) out.push(v);
    }
    return scaleTo(dedupe(out), 1);
  }

  /* the 120 cell, as the dual of the 600 cell: cells are the 4-cliques */
  function cell120() {
    const V6 = v600cell();
    const { E: E6 } = edgesOf(V6);
    const adj = V6.map(() => new Set());
    for (const [a, b] of E6) { adj[a].add(b); adj[b].add(a); }
    const cells = [], seen = new Set();
    for (const [a, b] of E6) {
      const common = [];
      for (const c of adj[a]) if (adj[b].has(c)) common.push(c);
      general: for (let x = 0; x < common.length; x++) for (let y = x + 1; y < common.length; y++) {
        const c = common[x], d = common[y];
        if (!adj[c].has(d)) continue;
        const key = [a, b, c, d].sort((p, q) => p - q).join(',');
        if (seen.has(key)) continue;
        seen.add(key); cells.push([a, b, c, d]);
      }
    }
    const verts = scaleTo(cells.map(cl => mul4(cl.reduce((s, i) => add4(s, V6[i]), [0, 0, 0, 0]), 1 / 4)), 1);
    /* two cells are neighbours when they share a triangle */
    const faces = new Map();
    cells.forEach((cl, i) => {
      for (let drop = 0; drop < 4; drop++) {
        const t = cl.filter((_, j) => j !== drop).sort((p, q) => p - q).join(',');
        if (!faces.has(t)) faces.set(t, []);
        faces.get(t).push(i);
      }
    });
    const E = [], ekey = new Set();
    let shared3 = 0, badFace = 0;
    for (const list of faces.values()) {
      if (list.length === 3) shared3++;
      if (list.length !== 2) badFace++;
      for (let i = 0; i < list.length; i++) for (let j = i + 1; j < list.length; j++) {
        const k = Math.min(list[i], list[j]) + '-' + Math.max(list[i], list[j]);
        if (ekey.has(k)) continue;
        ekey.add(k); E.push([list[i], list[j]]);
      }
    }
    return { V: verts, E, cells, triplesFrom3: shared3, badFaces: badFace };
  }

  /* ---------- rotation and projection ---------- */
  function rot4(v, A) {
    const p = v.slice();
    const rot = (a, b, ang) => {
      if (!ang) return;
      const c = Math.cos(ang), s = Math.sin(ang), x = p[a], y = p[b];
      p[a] = x * c - y * s; p[b] = x * s + y * c;
    };
    rot(0, 1, A.xy); rot(0, 2, A.xz); rot(0, 3, A.xw);
    rot(1, 2, A.yz); rot(1, 3, A.yw); rot(2, 3, A.zw);
    return p;
  }

  /* ---------- the cache: the combinatorial structure never depends on the parameters ---------- */
  const C = {};
  const get = {
    v5cell: () => C.v5 || (C.v5 = v5cell()),
    v8cell: () => C.v8 || (C.v8 = v8cell()),
    v16cell: () => C.v16 || (C.v16 = v16cell()),
    v24cell: () => C.v24 || (C.v24 = v24cell()),
    v600cell: () => C.v600 || (C.v600 = v600cell()),
    cell120: () => C.c120 || (C.c120 = cell120())
  };

  /* faces of the three small ones, as index lists into their vertex arrays */
  const F = {};
  const faces = {
    v5cell: () => {
      if (F.f5) return F.f5;
      const out = [];
      for (let a = 0; a < 5; a++) for (let b = a + 1; b < 5; b++) for (let c = b + 1; c < 5; c++) out.push([a, b, c]);
      return (F.f5 = out);
    },
    v8cell: () => {
      if (F.f8) return F.f8;
      const V = get.v8cell(), key = v => v.map(x => x > 0 ? 1 : 0).join('');
      const at = new Map(V.map((v, i) => [key(v), i]));
      const out = [];
      for (let i = 0; i < 4; i++) for (let j = i + 1; j < 4; j++) {
        for (let m = 0; m < 4; m++) {
          const base = [0, 0, 0, 0];
          for (let k = 0; k < 4; k++) if (k !== i && k !== j) base[k] = (m & 1) ? 1 : 0;
          const s = (b, a) => { const v = base.slice(); v[i] = a; v[j] = b; return at.get(key(v)); };
          out.push([s(1, 1), s(1, 0), s(0, 0), s(0, 1)]);
        }
      }
      return (F.f8 = out);
    },
    v16cell: () => {
      if (F.f16) return F.f16;
      const V = get.v16cell();
      const key = v => v.map(x => x > 0 ? '+' : (x < 0 ? '-' : '0')).join('');
      const at = new Map(V.map((v, i) => [key(v), i]));
      const idx = (axis, sgn) => { const p = [0, 0, 0, 0]; p[axis] = sgn; return at.get(key(p)); };
      /* a face holds one vertex from each of three axes, none antipodal to
         another: 4 axis triples x 8 sign combinations = the 32 triangles */
      const out = [];
      for (let i = 0; i < 4; i++) for (let j = i + 1; j < 4; j++) for (let k = j + 1; k < 4; k++) {
        for (const si of [1, -1]) for (const sj of [1, -1]) for (const sk of [1, -1]) {
          out.push([idx(i, si), idx(j, sj), idx(k, sk)]);
        }
      }
      return (F.f16 = out);
    }
  };

  /* ---------- the shapes ---------- */
  const PARAMS = [
    { k: 'xy', label: 'xy plane', min: 0, max: 360, step: 1, def: 0 },
    { k: 'xz', label: 'xz plane', min: 0, max: 360, step: 1, def: 0 },
    { k: 'xw', label: 'xw plane', min: 0, max: 360, step: 1, def: 26, anim: 24 },
    { k: 'yz', label: 'yz plane', min: 0, max: 360, step: 1, def: 0 },
    { k: 'yw', label: 'yw plane', min: 0, max: 360, step: 1, def: 0, anim: 36 },
    { k: 'zw', label: 'zw plane', min: 0, max: 360, step: 1, def: 0 },
    { k: 'dist', label: '4d distance', min: 2, max: 10, step: .05, def: 3.2 }
  ];

  function make(spec) {
    return {
      id: spec.id,
      name: spec.name,
      family: 'polytopes',
      src: 'knill 3dprinter/math/' + spec.id + '.html',
      params: PARAMS.map(p => Object.assign({}, p)),
      build: function (P, G) {
        const b = new G.Builder();
        const A = { xy: P.xy * D, xz: P.xz * D, xw: P.xw * D, yz: P.yz * D, yw: P.yw * D, zw: P.zw * D };
        const src = spec.verts();
        const R = src.map(v => rot4(v, A));
        let wmin = Infinity, wmax = -Infinity;
        for (const p of R) { if (p[3] < wmin) wmin = p[3]; if (p[3] > wmax) wmax = p[3]; }
        const span = Math.max(1e-9, wmax - wmin);
        const tone = p => 0.14 + 0.86 * (p[3] - wmin) / span;
        const proj = p => {
          const s = P.dist / Math.max(1e-3, P.dist - p[3]);
          return [p[0] * s, p[1] * s, p[2] * s];
        };
        const fcs = spec.faces ? spec.faces() : null;
        if (fcs) {
          for (const f of fcs) {
            let t = 0;
            for (const i of f) t += tone(R[i]);
            b.tone(t / f.length);
            const pts = f.map(i => proj(R[i]));
            if (pts.length === 3) b.tri(pts[0], pts[1], pts[2]);
            else b.quad(pts[0], pts[1], pts[2], pts[3]);
          }
        }
        const E = spec.edges();
        for (const [i, j] of E) {
          b.tone((tone(R[i]) + tone(R[j])) / 2);
          b.line(proj(R[i]), proj(R[j]));
        }
        return b.out({ vertices: src.length, edges: E.length, faces: fcs ? fcs.length : 0 });
      },
      verify: function () {
        const src = spec.verts(), E = spec.edges();
        const d = degrees(src.length, E);
        const spread = edgeSpread(src, E);
        const minDeg = Math.min(...d), maxDeg = Math.max(...d);
        let note = src.length + ' vertices, ' + E.length + ' edges (every vertex has ' +
          (minDeg === maxDeg ? minDeg : minDeg + '-' + maxDeg) + ' neighbours), ' +
          'edge lengths equal to ' + (spread * 100).toExponential(1) + '%';
        if (spec.extra) note += '; ' + spec.extra(src, E);
        return note;
      }
    };
  }

  const defs = [
    make({
      id: '5cell', name: '5 cell', verts: get.v5cell, edges: () => edgesOf(get.v5cell()).E,
      faces: faces.v5cell
    }),
    make({
      id: '8cell', name: '8 cell', verts: get.v8cell, edges: () => edgesOf(get.v8cell()).E,
      faces: faces.v8cell
    }),
    make({
      id: '16cell', name: '16 cell', verts: get.v16cell, edges: () => edgesOf(get.v16cell()).E,
      faces: faces.v16cell
    }),
    make({
      id: '24cell', name: '24 cell', verts: get.v24cell, edges: () => edgesOf(get.v24cell()).E
    }),
    make({
      id: '600cell', name: '600 cell', verts: get.v600cell, edges: () => edgesOf(get.v600cell()).E,
      extra: (V, E) => {
        const c = get.cell120();
        return 'every vertex regular with degree ' + degrees(V.length, E)[0] +
          '; its ' + c.cells.length + ' tetrahedral cells (the 4-cliques of this edge graph) ' +
          'are the vertices of the 120 cell';
      }
    }),
    make({
      id: '120cell', name: '120 cell',
      verts: () => get.cell120().V,
      edges: () => get.cell120().E,
      extra: () => {
        const c = get.cell120();
        const viaDist = edgesOf(c.V).E.length;
        return c.cells.length + ' tetrahedral cells of the 600 cell became its vertices, ' +
          'every triangle of the 600 cell is shared by exactly ' + (c.badFaces ? '?' : 'two') +
          ' cells, and the minimum-distance method finds ' + viaDist + ' edges';
      }
    })
  ];

  if (typeof SHAPES3D !== 'undefined') defs.forEach(d => SHAPES3D.define(d));
  if (typeof module !== 'undefined' && module.exports) module.exports = defs;
})();
