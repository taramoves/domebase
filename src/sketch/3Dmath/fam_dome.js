/* fam_dome.js — the dome family of the 3d math lab: Knill's three Archimedean
   figures, each one a solid whose volume or topology can be checked.

     dome   3dprinter/math/dome.html       a geodesic dome: icosphere(freq)
                                           cut by the plane of face centroids
                                           z = cut, every kept edge drawn as a
                                           strut with G.tube, every kept vertex
                                           as a hub sphere with G.sphere.
     globe  3dprinter/math/archimedes3.html  the hemisphere of radius R, with the
                                           cylinder (r = R, 0 <= z <= R) and the
                                           2R x 2R x R prism around it.
     hoof   3dprinter/math/hoof.html       x^2 + y^2 <= r^2, y >= 0, 0 <= z <= y,
                                           built as base + slanted top + wall.

   The checks are the maths the figures are about:
     dome   every kept vertex on the unit sphere; the cap is a topological disk —
            exactly one boundary loop, V - E + F = 1 — counted combinatorially,
            and both numbers are reported;
     globe  the hemisphere's volume recomputed from the drawn triangles by the
            divergence theorem V = |sum (a x b) . c| / 6 against 2 pi R^3/3, the
            2/3 ratio to the cylinder, and the error measured again on a
            twice-refined grid where it has to be smaller (the origin lies in the
            base plane, so the open cap alone already integrates to the solid);
     hoof   the same divergence sum over the three patches against 2 r^3/3, with
            the refining check too — a missing or doubled patch is a constant
            factor and throws, it is never scaled away.

   Plain classic script, no deps, no DOM, no Math.random: the same P always
   builds byte-identical geometry. See work/lab/CONTRACT.md. */

(function () {
  const TAU = Math.PI * 2;

  /* geom.js is a classic-script global (the page loads it first, the checker puts
     it on the global object); build() re-binds it so verify() can rebuild the
     mesh it has to talk about. */
  let LIB = typeof GEOM !== 'undefined' ? GEOM : null;
  const lib = () => LIB;

  const int = (v, a, b) => Math.max(a, Math.min(b, Math.round(v)));
  const clamp = (x, a, b) => (x < a ? a : x > b ? b : x);
  const on = v => (v >= 0.5 ? 1 : 0);   /* a 0/1 param may arrive as its mid value */

  /* the divergence-theorem volume of the first n triangles of a flat xyz array:
     |sum over triangles of (a cross b) . c| / 6 (each term is 6x the signed
     volume of the tetrahedron from the origin, so the sum is 3V for a closed
     surface with outward winding). */
  function volumeOf(T, n) {
    let s = 0;
    for (let i = 0; i < n; i++) {
      const o = i * 9;
      const ax = T[o], ay = T[o + 1], az = T[o + 2];
      const bx = T[o + 3], by = T[o + 4], bz = T[o + 5];
      const cx = T[o + 6], cy = T[o + 7], cz = T[o + 8];
      s += ax * (by * cz - bz * cy) + ay * (bz * cx - bx * cz) + az * (bx * cy - by * cx);
    }
    return Math.abs(s) / 6;
  }

  /* Drop the zero-area triangles a collapsing edge produces — the pole row of a
     spherical patch, the hoof's wall at t = 0 and t = pi — so the viewer never
     sees a zero-length normal. Rewrites the builder's triangle array in place
     from index `from`, keeping the order. */
  function pruneDegen(b, from) {
    const T = b.T;
    let w = from;
    for (let i = from; i < T.length; i += 9) {
      const ux = T[i + 3] - T[i], uy = T[i + 4] - T[i + 1], uz = T[i + 5] - T[i + 2];
      const vx = T[i + 6] - T[i], vy = T[i + 7] - T[i + 1], vz = T[i + 8] - T[i + 2];
      const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
      if (nx * nx + ny * ny + nz * nz <= 1e-24) continue;
      if (w !== i) for (let k = 0; k < 9; k++) T[w + k] = T[i + k];
      w += 9;
    }
    T.length = w;
  }

  /* a parametric patch over the (nu x nv) grid: each cell a quad cut into two
     triangles, the zero-area triangles of a collapsing edge dropped, and the
     grid lines drawn at the mesh values when `lines` (a line whose points all
     coincide is a point, not a line: it is skipped). The normal follows
     dP/du x dP/dv; `flip` reverses the winding. */
  function patch(b, fn, nu, nv, flip, lines) {
    const Q = [];
    for (let i = 0; i <= nu; i++) {
      const row = [];
      for (let j = 0; j <= nv; j++) row.push(fn(i / nu, j / nv));
      Q.push(row);
    }
    const from = b.T.length;
    for (let i = 0; i < nu; i++) for (let j = 0; j < nv; j++) {
      const a = Q[i][j], c = Q[i + 1][j], d = Q[i + 1][j + 1], e = Q[i][j + 1];
      if (flip) { b.tri(a, e, d); b.tri(a, d, c); }
      else { b.tri(a, c, d); b.tri(a, d, e); }
    }
    pruneDegen(b, from);
    if (lines) {
      /* a line whose points collapse (the hoof's wall at t = 0, where sin(pi u)
         is 1.2e-16 rather than 0) is a point, not a line: consecutive points
         closer than 1e-12 are the same point, and a one-point line is skipped */
      const put = pts => {
        const k = [];
        for (const p of pts) {
          const q = k[k.length - 1];
          if (!q || Math.abs(q[0] - p[0]) + Math.abs(q[1] - p[1]) + Math.abs(q[2] - p[2]) > 1e-12) k.push(p);
        }
        if (k.length > 1) b.poly(k);
      };
      for (let i = 0; i <= nu; i++) {
        const u = i / nu, pl = [];
        for (let j = 0; j <= nv; j++) pl.push(fn(u, j / nv));
        put(pl);
      }
      for (let j = 0; j <= nv; j++) {
        const v = j / nv, pl = [];
        for (let i = 0; i <= nu; i++) pl.push(fn(i / nu, v));
        put(pl);
      }
    }
  }

  /* ---------------- 1. the geodesic dome ---------------- */

  /* The kept mesh of icosphere(freq): the faces whose centroid sits at z >= cut,
     and the edges and vertices they use. Pure, cheap (<= 1280 faces), so build()
     and verify() look at exactly the same mesh. When the cut is above the top
     face's centroid the cap would vanish; it collapses to that one top face
     instead, which keeps the figure non-empty at every parameter. */
  function domeMesh(P, G) {
    const sub = int(P.freq, 1, 4) - 1;
    const cut = clamp(P.cut, -0.4, 1);
    const ico = G.icosphere(sub), V = ico.V, F = ico.F;
    const cz = f => (V[f[0]][2] + V[f[1]][2] + V[f[2]][2]) / 3;
    let faces = F.filter(f => cz(f) >= cut);
    if (!faces.length) {
      let best = F[0], bz = -Infinity;
      for (const f of F) { const z = cz(f); if (z > bz) { bz = z; best = f; } }
      faces = [best];
    }
    /* distinct edges, and how many kept faces use each one */
    const ec = new Map();
    const verts = new Set();
    for (const f of faces) for (let k = 0; k < 3; k++) {
      const a = f[k], c = f[(k + 1) % 3];
      verts.add(a); verts.add(c);
      const key = a < c ? a + ' ' + c : c + ' ' + a;
      const rec = ec.get(key);
      if (rec) rec.n++; else ec.set(key, { n: 1, a, b: c });
    }
    const edges = [], boundary = [];
    for (const rec of ec.values()) {
      edges.push([rec.a, rec.b]);
      if (rec.n === 1) boundary.push([rec.a, rec.b]);
    }
    /* the boundary edges used once, walked into closed loops */
    const bedges = boundary.map(e => ({ a: e[0], b: e[1], used: false }));
    const adj = new Map();
    for (const e of bedges) {
      if (!adj.has(e.a)) adj.set(e.a, []);
      if (!adj.has(e.b)) adj.set(e.b, []);
      adj.get(e.a).push(e); adj.get(e.b).push(e);
    }
    let loops = 0;
    for (const e0 of bedges) {
      if (e0.used) continue;
      loops++;
      let cur = e0, v = e0.a;
      while (cur) {
        cur.used = true;
        const w = cur.a === v ? cur.b : cur.a;
        let nxt = null;
        const list = adj.get(w) || [];
        for (const e of list) if (!e.used) { nxt = e; break; }
        v = w; cur = nxt;
      }
    }
    const rim = new Set();
    for (const [a, c] of boundary) { rim.add(a); rim.add(c); }
    return { V, faces, edges, boundary, verts: [...verts], loops, rim: [...rim] };
  }

  const dome = {
    id: 'dome', name: 'geodesic dome', family: 'dome',
    src: 'knill 3dprinter/math/dome.html',
    params: [
      { k: 'freq', label: 'freq', min: 1, max: 4, step: 1, def: 2 },
      { k: 'cut', label: 'cut', min: -0.4, max: 1, step: 0.02, def: 0, anim: 11 },
      { k: 'strut', label: 'strut', min: 0.01, max: 0.08, step: 0.005, def: 0.03 },
      { k: 'sides', label: 'sides', min: 3, max: 8, step: 1, def: 4 },
      { k: 'hubs', label: 'hubs', min: 0, max: 1, step: 1, def: 1, choices: ['no hubs', 'hubs'] },
      { k: 'hub', label: 'hub', min: 0.02, max: 0.12, step: 0.005, def: 0.05 },
      { k: 'plate', label: 'plate', min: 0, max: 1, step: 1, def: 1, choices: ['no base', 'base plate'] }
    ],

    build: function (P, G) {
      LIB = G || LIB;
      const b = new G.Builder();
      const M = domeMesh(P, G);
      const strut = clamp(P.strut, 0.01, 0.08);
      const sides = int(P.sides, 3, 8);
      const hubs = on(P.hubs);
      const plates = on(P.plate);

      /* every distinct edge of the kept mesh is a strut */
      for (const [a, c] of M.edges) G.tube(b, [M.V[a], M.V[c]], strut, sides);

      /* ... and optionally a small sphere at every distinct vertex */
      let hubN = 0;
      if (hubs) {
        const hr = clamp(P.hub, 0.02, 0.12);
        for (const i of M.verts) { G.sphere(b, M.V[i], hr, 1); hubN++; }
      }

      /* a thin plate under the rim: the boundary loop's footprint, one slab thick */
      let plate = 0;
      if (plates && M.rim.length) {
        let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity, z0 = Infinity;
        for (const i of M.rim) {
          const v = M.V[i];
          if (v[0] < x0) x0 = v[0];
          if (v[0] > x1) x1 = v[0];
          if (v[1] < y0) y0 = v[1];
          if (v[1] > y1) y1 = v[1];
          if (v[2] < z0) z0 = v[2];
        }
        G.box(b, [x0, y0, z0 - 0.05], [x1, y1, z0]);
        plate = 1;
      }

      return b.out({
        struts: M.edges.length, meshFaces: M.faces.length, meshVertices: M.verts.length,
        hubs: hubN, boundaryLoops: M.loops, plate: plate, sides: sides
      });
    },

    verify: function (P) {
      const G = lib();
      const M = domeMesh(P, G);
      let dev = 0;
      for (const i of M.verts) {
        const v = M.V[i];
        dev = Math.max(dev, Math.abs(Math.sqrt(v[0] * v[0] + v[1] * v[1] + v[2] * v[2]) - 1));
      }
      const euler = M.verts.length - M.edges.length + M.faces.length;
      if (!(dev < 1e-9)) throw new Error('vertex off the unit sphere by ' + dev);
      if (M.loops !== 1) throw new Error('kept cap has ' + M.loops + ' boundary loops, not 1');
      if (euler !== 1) throw new Error('kept mesh is not a disk: V - E + F = ' + euler);
      return 'kept vertices on the unit sphere: max | |v| - 1 | ' + dev.toExponential(2) +
        ' over ' + M.verts.length + '; boundary loops ' + M.loops +
        '; V - E + F = ' + euler + ' with V ' + M.verts.length + ', E ' + M.edges.length +
        ', F ' + M.faces.length;
    }
  };

  /* ---------------- 2. the archimedean globe ---------------- */

  /* the hemisphere, u closed around the azimuth, v from the equator to the pole */
  const hemiFn = R => (u, v) => {
    const ph = v * Math.PI / 2, th = u * TAU, c = Math.cos(ph);
    return [R * c * Math.cos(th), R * c * Math.sin(th), R * Math.sin(ph)];
  };

  /* the hemisphere patch's triangles exactly as build() draws them: G.surface
     over the patch, with the zero-area pole row dropped */
  function hemiPatch(G, R, seg, rings) {
    const b = new G.Builder();
    G.surface(b, hemiFn(R), seg, rings, { uClosed: true });
    pruneDegen(b, 0);
    return b;
  }

  /* the hemisphere's volume from those triangles. The origin lies in the base
     plane (z = 0), so the cone from the origin over the open cap is the solid
     itself and the divergence sum already gives its volume. */
  function hemiVolume(G, R, seg, rings) {
    const b = hemiPatch(G, R, seg, rings);
    return { V: volumeOf(b.T, b.T.length / 9), n: b.T.length / 9 };
  }

  const globe = {
    id: 'globe', name: 'archimedean globe', family: 'dome',
    src: 'knill 3dprinter/math/archimedes3.html',
    params: [
      { k: 'R', label: 'R', min: 0.5, max: 2, step: 0.05, def: 1 },
      { k: 'seg', label: 'seg', min: 12, max: 160, step: 2, def: 64 },
      { k: 'rings', label: 'rings', min: 4, max: 80, step: 1, def: 24 },
      { k: 'prism', label: 'prism', min: 0, max: 1, step: 1, def: 1, choices: ['hemisphere', 'in cylinder'] },
      { k: 'grid', label: 'grid', min: 0, max: 1, step: 1, def: 1 }
    ],

    build: function (P, G) {
      LIB = G || LIB;
      const b = new G.Builder();
      const R = clamp(P.R, 0.5, 2), seg = int(P.seg, 12, 160), rings = int(P.rings, 4, 80);
      const grid = on(P.grid);

      /* the hemisphere: verify() rebuilds this same patch from P and integrates
         its triangles (the origin sits in the base plane) */
      const hemiFrom = b.T.length;
      G.surface(b, hemiFn(R), seg, rings, {
        uClosed: true, uLines: grid ? seg : 0, vLines: grid ? rings : 0
      });
      pruneDegen(b, hemiFrom);           /* the pole row: seg zero-area triangles */
      const hemiTris = (b.T.length - hemiFrom) / 9;

      let cylTris = 0, rimSeg = 0, prismEdges = 0, prism = on(P.prism);
      if (prism) {
        /* the cylinder it sits in: radius R, z from 0 to R (straight in z, so one
           v step is exact) */
        G.surface(b, (u, v) => [R * Math.cos(u * TAU), R * Math.sin(u * TAU), v * R], seg, 1, {
          uClosed: true, uLines: grid ? seg : 0
        });
        cylTris = seg * 2;
        /* both rim circles */
        const circle = z => {
          const A = [];
          for (let i = 0; i < seg; i++) {
            const a = i / seg * TAU;
            A.push([R * Math.cos(a), R * Math.sin(a), z]);
          }
          return A;
        };
        G.polyline(b, circle(0), true);
        G.polyline(b, circle(R), true);
        rimSeg = 2 * seg;
        /* the edges of the enclosing 2R x 2R x R prism */
        G.box(b, [-R, -R, 0], [R, R, R], { faces: false, edges: true });
        prismEdges = 12;
      }

      return b.out({
        hemisphereTris: hemiTris, cylinderTris: cylTris, rimSegments: rimSeg,
        prismEdges: prismEdges, prism: prism, seg: seg, rings: rings
      });
    },

    verify: function (P) {
      const G = lib();
      const R = clamp(P.R, 0.5, 2), seg = int(P.seg, 12, 160), rings = int(P.rings, 4, 80);
      const exact = 2 * Math.PI * R * R * R / 3;
      const a = hemiVolume(G, R, seg, rings);
      const err = Math.abs(a.V - exact) / exact;
      const ratio = a.V / (Math.PI * R * R * R);        /* the cylinder: pi R^2 * R */
      /* a missing or duplicated patch is a constant factor, nowhere near a mesh
         error; and refining the grid has to shrink whatever error is left */
      if (!(err < 0.2)) throw new Error('hemisphere volume ' + a.V + ' vs exact ' + exact + ' — a patch is missing or doubled');
      const f = hemiVolume(G, R, 2 * seg, 2 * rings);
      const err2 = Math.abs(f.V - exact) / exact;
      if (!(err2 < err)) throw new Error('refining the grid did not reduce the error: ' + err2 + ' >= ' + err);
      return 'hemisphere patch ' + seg + ' x ' + rings + ': volume from its ' + a.n + ' drawn triangles ' +
        a.V.toFixed(6) + ' vs 2 pi R^3/3 = ' + exact.toFixed(6) + ', relative error ' + err.toExponential(2) +
        ' -> ' + err2.toExponential(2) + ' at twice the grid; V / cylinder (pi R^3) = ' + ratio.toFixed(6) +
        ' = 2/3, archimedes: the sphere is two thirds of its circumscribing cylinder';
    }
  };

  /* ---------------- 3. the hoof of archimedes ---------------- */

  /* the solid x^2 + y^2 <= r^2, y >= 0, 0 <= z <= y; volume 2 r^3 / 3 */
  /* The three patches that close the hoof, each one wound outward:
       base  z = 0 over the half disk, normal -z       (u = azimuth, v = radius)
       top   z = y over the half disk, normal (0,-1,1) (u = radius,  v = azimuth)
       wall  x = r cos t, y = r sin t, 0 <= z <= y     (u = t/pi,    v = z / y)
     At y = 0 the base and the top meet along the diameter of the half disk, and
     at the rim they meet the wall, so the three of them are the whole boundary. */
  function hoofPatches(b, r, seg, rings, grid) {
    patch(b, (u, v) => {
      const a = Math.PI * u, q = r * v;
      return [q * Math.cos(a), q * Math.sin(a), 0];
    }, seg, rings, false, grid);
    patch(b, (u, v) => {
      const a = Math.PI * v, q = r * u;
      return [q * Math.cos(a), q * Math.sin(a), q * Math.sin(a)];
    }, rings, seg, false, grid);
    patch(b, (u, v) => {
      const a = Math.PI * u;
      return [r * Math.cos(a), r * Math.sin(a), v * r * Math.sin(a)];
    }, seg, rings, false, grid);
  }

  const hoof = {
    id: 'hoof', name: 'hoof of archimedes', family: 'dome',
    src: 'knill 3dprinter/math/hoof.html',
    params: [
      { k: 'r', label: 'r', min: 0.2, max: 2, step: 0.05, def: 1 },
      { k: 'seg', label: 'seg', min: 8, max: 160, step: 2, def: 48 },
      { k: 'rings', label: 'rings', min: 4, max: 80, step: 1, def: 24 },
      { k: 'grid', label: 'grid', min: 0, max: 1, step: 1, def: 1 },
      { k: 'box', label: 'box', min: 0, max: 1, step: 1, def: 1, choices: ['no box', 'box'] }
    ],

    build: function (P, G) {
      LIB = G || LIB;
      const b = new G.Builder();
      const r = clamp(P.r, 0.2, 2), seg = int(P.seg, 8, 160), rings = int(P.rings, 4, 80);
      const grid = on(P.grid);

      /* the base, the slanted top and the wall: the whole boundary of the solid */
      hoofPatches(b, r, seg, rings, !!grid);

      /* the edges of the enclosing r x r x r box the hoof sits in */
      let boxEdges = 0;
      if (on(P.box)) {
        G.box(b, [-r, 0, 0], [r, r, r], { faces: false, edges: true });
        boxEdges = 12;
      }

      return b.out({
        patches: 3, boxEdges: boxEdges, seg: seg, rings: rings,
        volumeToCheck: 2 * r * r * r / 3
      });
    },

    verify: function (P, out) {
      const G = lib();
      const r = clamp(P.r, 0.2, 2), seg = int(P.seg, 8, 160), rings = int(P.rings, 4, 80);
      /* the divergence theorem over every drawn triangle: base + top + wall is
         the whole boundary, so the sum is 3V. A missing or duplicated patch
         would be a constant factor — nowhere near the mesh error — and refining
         the grid has to shrink what is left. */
      const n = out.tris.length / 9;
      const V = volumeOf(out.tris, n);
      const exact = 2 * r * r * r / 3;
      const err = Math.abs(V - exact) / exact;
      if (!(err < 0.2)) throw new Error('hoof volume ' + V + ' vs exact ' + exact + ' — a patch is missing or doubled, not a mesh error');
      const fine = new G.Builder();
      hoofPatches(fine, r, 2 * seg, 2 * rings, false);
      const V2 = volumeOf(fine.T, fine.T.length / 9);
      const err2 = Math.abs(V2 - exact) / exact;
      if (!(err2 < err)) throw new Error('refining the grid did not reduce the error: ' + err2 + ' >= ' + err);
      return 'volume from the base + slanted top + wall, ' + n + ' drawn triangles ' + V.toFixed(6) +
        ' vs 2 r^3/3 = ' + exact.toFixed(6) + ', relative error ' + err.toExponential(2) + ' -> ' +
        err2.toExponential(2) + ' at twice the grid, so it falls as seg/rings rise';
    }
  };

  const defs = [dome, globe, hoof];

  if (typeof SHAPES3D !== 'undefined') defs.forEach(d => SHAPES3D.define(d));
  if (typeof module !== 'undefined' && module.exports) module.exports = defs;
})();
