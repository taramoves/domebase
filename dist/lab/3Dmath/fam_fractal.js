/* fam_fractal.js — the recursive figures of Knill's 3dprinter/math, drawn live:
     menger      knill 3dprinter/math/menger.html            the Menger sponge
     sierpinski  knill 3dprinter/math/shirpinski.html        the Sierpinski tetrix
     tree        knill 3dprinter/math/treepythagoras.html    the 3d Pythagoras tree

   Classic script, no dependencies, no Math.random: the same P builds the same
   bytes.  Each family's verification measures its invariant on the geometry it
   just built (counts exactly, volume by the divergence theorem, total branch
   length from the segment endpoints).  Cost is capped by coarsening — the rule
   that caps it sits next to the code that uses it. */

(function () {
  const D = Math.PI / 180, TAU = Math.PI * 2;
  const clamp = (x, a, b) => (x < a ? a : x > b ? b : x);
  const iRound = (x, a, b) => Math.round(clamp(x, a, b));

  /* signed volume of triangle i..i+8 about the origin: ((a x b) . c) / 6 */
  function triVol(t, i) {
    const ax = t[i], ay = t[i + 1], az = t[i + 2], bx = t[i + 3], by = t[i + 4], bz = t[i + 5],
      cx = t[i + 6], cy = t[i + 7], cz = t[i + 8];
    return (ax * (by * cz - bz * cy) + ay * (bz * cx - bx * cz) + az * (bx * cy - by * cx)) / 6;
  }

  /* Mesh volume by the divergence theorem.  The mesh is a union of `per`-triangle
     closed pieces (the leaves of the recursion), so the signed volume is summed
     per piece and the absolute value taken there: a piece whose winding were
     flipped cannot cancel the rest, and the total is a plain sum of volumes. */
  function meshVolume(t, per) {
    let V = 0;
    for (let c = 0; c + per * 9 <= t.length; c += per * 9) {
      let s = 0;
      for (let i = c; i < c + per * 9; i += 9) s += triVol(t, i);
      V += Math.abs(s);
    }
    return V;
  }

  /* ============================ menger ============================ */
  /* Unit cube; at each of `level` rounds every surviving cube is cut into 27
     and a subcube is dropped when at least two of its (i,j,k) indices equal 1
     (the middle slab) — 7 dropped, 20 kept per cube, so 20^level cubes of side
     3^-level and volume fraction (20/27)^level.

     Cost rule: one cube is 12 triangles (6 quads) + 12 edges.  Faces are drawn
     while `faces` is 1 AND the surviving count is at most FACES_MAX = 9000 cubes
     — levels 1..3 (20 / 400 / 8000 cubes, <= 96000 triangles + 96000 segments)
     stay inside the triangle budget.  A larger count would drop to the 12 edges
     of each cube; this family cannot reach it (level <= 3), so the faces toggle
     is what the viewer sees. */
  const FACES_MAX = 9000;

  /* ========================== sierpinski ========================== */
  /* Regular base tetrahedron (edge sqrt(2), volume V0 = 1/3 by the determinant
     below) and its tetrix: each round replaces every tetrahedron by the four on
     the midpoints of its edges — edge/2, volume/8, four of them = half the
     volume.  Level L therefore holds 4^L tetrahedra of total volume V0/2^L.
     Level 5 is 1024 tetrahedra = 4096 triangles + 6144 edges: no coarsening
     needed anywhere in the range. */
  const TET0 = [[.5, .5, .5], [.5, -.5, -.5], [-.5, .5, -.5], [-.5, -.5, .5]];
  const TET_V0 = (function () {
    const A = TET0[0], B = TET0[1], C = TET0[2], D = TET0[3];
    const e1 = [B[0] - A[0], B[1] - A[1], B[2] - A[2]],
      e2 = [C[0] - A[0], C[1] - A[1], C[2] - A[2]],
      e3 = [D[0] - A[0], D[1] - A[1], D[2] - A[2]];
    const n = [e2[1] * e3[2] - e2[2] * e3[1], e2[2] * e3[0] - e2[0] * e3[2], e2[0] * e3[1] - e2[1] * e3[0]];
    return Math.abs(e1[0] * n[0] + e1[1] * n[1] + e1[2] * n[2]) / 6;
  })();

  /* ============================== tree ============================== */
  /* Trunk of length L = 1 along +y; a branch of level d spawns `branches`
     children at its tip, each tilted `angle` away from the parent direction and
     spread evenly in azimuth, with length ratio^d scaled by `ratio` (and tube
     radius scaled the same way, so the twigs are not oversized).  The drawn
     segments are the levels d = 0 (the trunk) .. depth, so
       count    = sum_{d<=depth} branches^d = (branches^(depth+1)-1)/(branches-1)
       length   = sum_{d<=depth} L*(branches*ratio)^d = L*(1-(b*r)^(depth+1))/(1-b*r)

     Cost rule: the segment skeleton (lines) is always drawn — it is the tree at
     any count and it carries the endpoints the length check sums.  Tubes are
     added on top only while count <= TUBE_MAX = 20000 (past that ~1.4M tube
     quads would blow the triangle budget), and their sides are coarsened to 4
     once the count passes 4000.  Worst tube case is therefore 20000*2*4 =
     160000 triangles, at 98k+ segments only lines are emitted.  Each single
     parameter extreme stays under 70 ms (depth 10: 88573 segments, 55 ms;
     4 branches: 21845 segments, 45 ms); the largest setting of all, depth 10
     with 4 branches = 1398101 segments, costs ~0.35 s once. */
  const TUBE_MAX = 12000;

  const defs = [
    {
      id: 'menger',
      name: 'menger',
      family: 'fractal',
      src: 'knill 3dprinter/math/menger.html',

      params: [
        { k: 'level', label: 'level', min: 1, max: 3, step: 1, def: 2 },
        { k: 'faces', label: 'faces', min: 0, max: 1, step: 1, def: 1, choices: ['edges', 'faces'] }
      ],

      build: function (P, G) {
        const b = new G.Builder();
        const level = iRound(P.level, 1, 3);
        const faces = P.faces >= 0.5 && Math.pow(20, level) <= FACES_MAX;

        function rec(lo, size, lv) {
          if (lv === 0) {
            G.box(b, lo, [lo[0] + size, lo[1] + size, lo[2] + size], { faces: faces });
            b.count('cubes', 1);
            return;
          }
          const s = size / 3;
          for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) for (let k = 0; k < 3; k++) {
            const mid = (i === 1 ? 1 : 0) + (j === 1 ? 1 : 0) + (k === 1 ? 1 : 0);
            if (mid >= 2) continue;                       /* >= two middle indices: dropped */
            rec([lo[0] + i * s, lo[1] + j * s, lo[2] + k * s], s, lv - 1);
          }
        }
        rec([-0.5, -0.5, -0.5], 1, level);

        return b.out({ level: level, faces: faces ? 1 : 0 });
      },

      verify: function (P, out) {
        const level = out.stats.level;
        const count = out.stats.cubes, expect = Math.pow(20, level);
        const frac = Math.pow(20 / 27, level);            /* volume of the unit sponge */
        let note;
        if (out.tris.length) {
          /* box() emits 6 quads = 12 triangles per cube, in cube order */
          const V = meshVolume(out.tris, 12);
          note = 'volume ' + V.toPrecision(10) + ' vs (20/27)^' + level + ' ' + frac.toPrecision(10) +
            ', rel err ' + (Math.abs(V - frac) / frac).toExponential(2);
        } else {
          note = 'edges-only build: the faces carry the volume, none were emitted';
        }
        return 'cubes ' + count + ' = 20^' + level + ' = ' + expect + ', ' + note;
      }
    },

    {
      id: 'sierpinski',
      name: 'sierpinski',
      family: 'fractal',
      src: 'knill 3dprinter/math/shirpinski.html',

      params: [
        { k: 'level', label: 'level', min: 1, max: 5, step: 1, def: 3 },
        { k: 'faces', label: 'faces', min: 0, max: 1, step: 1, def: 1, choices: ['edges', 'faces'] }
      ],

      build: function (P, G) {
        const b = new G.Builder();
        const level = iRound(P.level, 1, 5);
        const faces = P.faces >= 0.5;
        const mid = (a, c) => [(a[0] + c[0]) / 2, (a[1] + c[1]) / 2, (a[2] + c[2]) / 2];

        /* one tetrahedron: its four faces (oriented outward, so the divergence
           sum over the leaves is +volume) plus its six edges */
        function leaf(A, B, C, D) {
          if (faces) {
            const cen = [(A[0] + B[0] + C[0] + D[0]) / 4, (A[1] + B[1] + C[1] + D[1]) / 4, (A[2] + B[2] + C[2] + D[2]) / 4];
            const F = [[A, B, C], [A, B, D], [A, C, D], [B, C, D]];
            for (const f of F) {
              let p = f[1], q = f[2];
              const n = G.cross(G.sub(p, f[0]), G.sub(q, f[0]));
              if (G.dot(n, G.sub(cen, f[0])) > 0) { p = f[2]; q = f[1]; }   /* flip if it faces inward */
              b.tri(f[0], p, q);
            }
          }
          b.line(A, B); b.line(A, C); b.line(A, D);
          b.line(B, C); b.line(B, D); b.line(C, D);
          b.count('tetrahedra', 1);
        }

        function rec(A, B, C, D, lv) {
          if (lv === 0) { leaf(A, B, C, D); return; }
          const mAB = mid(A, B), mAC = mid(A, C), mAD = mid(A, D),
            mBC = mid(B, C), mBD = mid(B, D), mCD = mid(C, D);
          rec(A, mAB, mAC, mAD, lv - 1);
          rec(B, mAB, mBC, mBD, lv - 1);
          rec(C, mAC, mBC, mCD, lv - 1);
          rec(D, mAD, mBD, mCD, lv - 1);
        }
        rec(TET0[0], TET0[1], TET0[2], TET0[3], level);

        return b.out({ level: level, faces: faces ? 1 : 0 });
      },

      verify: function (P, out) {
        const level = out.stats.level;
        const count = out.stats.tetrahedra, expect = Math.pow(4, level);
        const want = TET_V0 / Math.pow(2, level);         /* four 1/8 copies per round */
        let note;
        if (out.tris.length) {
          const V = meshVolume(out.tris, 4);              /* 4 faces per tetrahedron */
          note = 'volume ' + V.toPrecision(10) + ' vs V0/2^' + level + ' ' + want.toPrecision(10) +
            ' (V0 = ' + TET_V0.toPrecision(6) + '), rel err ' + (Math.abs(V - want) / want).toExponential(2);
        } else {
          note = 'edges-only build: the faces carry the volume, none were emitted';
        }
        return 'tetrahedra ' + count + ' = 4^' + level + ' = ' + expect + ', ' + note;
      }
    },

    {
      id: 'tree',
      name: 'tree',
      family: 'fractal',
      src: 'knill 3dprinter/math/treepythagoras.html',

      params: [
        { k: 'depth', label: 'depth', min: 1, max: 8, step: 1, def: 7 },
        { k: 'branches', label: 'branches', min: 2, max: 4, step: 1, def: 3 },
        { k: 'angle', label: 'angle', min: 10, max: 80, step: 1, def: 35, anim: 15 },
        { k: 'ratio', label: 'ratio', min: 0.4, max: 0.8, step: 0.01, def: 0.62 },
        { k: 'tube', label: 'tube', min: 0.005, max: 0.06, step: 0.001, def: 0.02 },
        { k: 'sides', label: 'sides', min: 3, max: 8, step: 1, def: 5 }
      ],

      build: function (P, G) {
        const b = new G.Builder();
        const depth = iRound(P.depth, 1, 10);
        const branches = iRound(P.branches, 2, 4);
        const angle = clamp(P.angle, 10, 80) * D;
        const ratio = clamp(P.ratio, 0.4, 0.8);
        const r0 = clamp(P.tube, 0.005, 0.06);
        const sides = iRound(P.sides, 3, 8);
        const L = 1;

        const count = Math.round((Math.pow(branches, depth + 1) - 1) / (branches - 1));
        const tubes = count <= TUBE_MAX;                  /* past TUBE_MAX: lines only */
        const sd = count > 4000 ? Math.min(sides, 4) : sides;

        const cA = Math.cos(angle), sA = Math.sin(angle);
        const cs = [], sn = [];                           /* the azimuths, once */
        for (let k = 0; k < branches; k++) {
          const ph = TAU * k / branches;
          cs.push(Math.cos(ph)); sn.push(Math.sin(ph));
        }

        /* the segment skeleton is always drawn; tubes are added while cheap */
        (function rec(p0, p1, len, lv) {
          b.line(p0, p1);
          if (tubes) G.tube(b, [p0, p1], Math.max(r0 * Math.pow(ratio, lv), 1e-5), sd);
          if (lv === depth) return;
          const d = G.unit(G.sub(p1, p0));
          const ref = Math.abs(d[2]) < 0.9 ? [0, 0, 1] : [1, 0, 0];
          const u = G.unit(G.cross(d, ref)), v = G.cross(d, u);
          const cl = len * ratio;
          for (let k = 0; k < branches; k++) {
            const w = G.add(G.mul(u, cs[k]), G.mul(v, sn[k]));       /* unit, perpendicular to d */
            const dir = G.add(G.mul(d, cA), G.mul(w, sA));           /* d tilted by `angle` toward w */
            rec(p1, G.add(p1, G.mul(dir, cl)), cl, lv + 1);
          }
        })([0, 0, 0], [0, L, 0], L, 0);

        return b.out({ depth: depth, branches: branches, branchCount: count, level: depth });
      },

      verify: function (P, out) {
        const depth = out.stats.depth, branches = out.stats.branches;
        const ratio = clamp(P.ratio, 0.4, 0.8), L = 1;
        const count = out.stats.segments;                 /* one skeleton segment per branch */
        const closed = Math.round((Math.pow(branches, depth + 1) - 1) / (branches - 1));
        /* levels d = 0..depth hold branches^d segments of length L*ratio^d */
        const r = branches * ratio;
        const lenClosed = L * (1 - Math.pow(r, depth + 1)) / (1 - r);
        const q = out.lines;
        let len = 0;
        for (let i = 0; i + 6 <= q.length; i += 6) {
          const dx = q[i + 3] - q[i], dy = q[i + 4] - q[i + 1], dz = q[i + 5] - q[i + 2];
          len += Math.sqrt(dx * dx + dy * dy + dz * dz);
        }
        const rel = Math.abs(len - lenClosed) / lenClosed;
        return 'segments ' + count + ' = (branches^(depth+1)-1)/(branches-1) = ' + closed +
          '; total length ' + len.toPrecision(10) + ' vs L(1-(b*r)^(depth+1))/(1-b*r) = ' + lenClosed.toPrecision(10) +
          ', rel err ' + rel.toExponential(2);
      }
    }
  ];

  if (typeof SHAPES3D !== 'undefined') defs.forEach(d => SHAPES3D.define(d));
  if (typeof module !== 'undefined' && module.exports) module.exports = defs;
})();
