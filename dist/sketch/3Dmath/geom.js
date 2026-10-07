/* geom.js — geometry helpers shared by the 3d math lab page's families.

   Loaded as a classic script in the browser (defines the global GEOM) and with
   require() in node (module.exports). No dependencies. Scale is free: build at
   any size near the origin, call out(), and the viewer normalises the result.
   See work/lab/CONTRACT.md for the family-file contract. */

const GEOM = (function () {
  /* The complexity budget for one shape at any parameter setting: what keeps a
     rebuild cheap enough that the page never stalls. Families coarsen their own
     resolution to stay inside it rather than capping the picture, and
     work/lab/check_family.cjs enforces it at every parameter extreme and at the
     all-min and all-max corners. */
  const BUDGET = { tri: 120000, seg: 160000 };

  const TAU = Math.PI * 2, D2R = Math.PI / 180, R2D = 180 / Math.PI;
  const clamp = (x, a, b) => (x < a ? a : x > b ? b : x);
  const lerp = (a, b, t) => a + (b - a) * t;
  const sign = x => (x < 0 ? -1 : 1);

  /* deterministic xorshift32 — families must never call Math.random */
  function prng(seed) {
    let s = (seed >>> 0) || 0x9e3779b9;
    return function () {
      s ^= s << 13; s >>>= 0;
      s ^= s >>> 17;
      s ^= s << 5; s >>>= 0;
      return s / 4294967296;
    };
  }

  /* ---------- points are plain [x,y,z] arrays ---------- */
  const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
  const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
  const mul = (a, s) => [a[0] * s, a[1] * s, a[2] * s];
  const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
  const len = a => Math.sqrt(dot(a, a));
  const dist = (a, b) => len(sub(a, b));
  const unit = a => { const l = len(a) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };

  /* Rodrigues: rotate p about `axis` (any length) by ang radians */
  function rotAxis(p, axis, ang) {
    const k = unit(axis), c = Math.cos(ang), s = Math.sin(ang), kd = dot(k, p);
    const kx = cross(k, p);
    return [
      p[0] * c + kx[0] * s + k[0] * kd * (1 - c),
      p[1] * c + kx[1] * s + k[1] * kd * (1 - c),
      p[2] * c + kx[2] * s + k[2] * kd * (1 - c)
    ];
  }

  /* ---------- builder ---------- */
  /* b.tone(t) sets the ink for every vertex pushed after it: 1 = black, 0 = paper.
     Optional, only used by shapes that carry a real fourth coordinate (the 4d
     polytopes) — the viewer falls back to lit shading and depth for everything
     else. Call it before the first vertex. */
  function Builder() { this.T = []; this.L = []; this.Tn = []; this.meta = {}; this.useTone = false; this.cur = 1; }
  const B = Builder.prototype;
  B.tone = function (t) { this.useTone = true; this.cur = t; };
  B.tri = function (a, b, c) {
    const T = this.T;
    T.push(a[0], a[1], a[2], b[0], b[1], b[2], c[0], c[1], c[2]);
    if (this.useTone) this.Tn.push(this.cur, this.cur, this.cur);
  };
  B.quad = function (a, b, c, d) { this.tri(a, b, c); this.tri(a, c, d); };
  B.line = function (a, b) {
    const L = this.L;
    L.push(a[0], a[1], a[2], b[0], b[1], b[2]);
    if (this.useTone) this.Tn.push(this.cur, this.cur);
  };
  B.poly = function (pts, closed) {
    const n = pts.length;
    for (let i = 0; i < n - 1; i++) this.line(pts[i], pts[i + 1]);
    if (closed && n > 2) this.line(pts[n - 1], pts[0]);
  };
  B.count = function (k, n) { this.meta[k] = (this.meta[k] || 0) + n; };

  /* the one thing build() returns */
  B.out = function (extra) {
    const st = {};
    for (const k in this.meta) st[k] = this.meta[k];
    st.triangles = this.T.length / 9;
    st.segments = this.L.length / 6;
    st.vertices = uniqBoth(this.T, this.L);
    if (extra) for (const k in extra) st[k] = extra[k];
    const verts = this.T.length / 3 + this.L.length / 3;
    let tone = null;
    if (this.useTone) {
      if (this.Tn.length !== verts) {
        throw new Error('Builder: ' + this.Tn.length + ' tones for ' + verts +
          ' vertices — call tone() before the first vertex');
      }
      tone = new Float32Array(this.Tn);
    }
    return { tris: new Float32Array(this.T), lines: new Float32Array(this.L), tone: tone, stats: st };
  };

  /* distinct points across both arrays, or null when too big to count */
  function uniqBoth(a, b) {
    const n = a.length + b.length;
    if (!n) return 0;
    if (n > 150000) return null;
    let src = a;
    if (b.length) { src = new Float32Array(n); src.set(a, 0); src.set(b, a.length); }
    const seen = new Set();
    for (let i = 0; i < src.length; i += 3) {
      seen.add(Math.round(src[i] * 1e5) + ' ' + Math.round(src[i + 1] * 1e5) + ' ' + Math.round(src[i + 2] * 1e5));
    }
    return seen.size;
  }

  /* distinct points in a flat xyz array, or null when it is too big to count */
  function uniq(arr) {
    if (!arr || !arr.length || arr.length > 150000) return arr ? null : 0;
    const seen = new Set();
    for (let i = 0; i < arr.length; i += 3) {
      seen.add(Math.round(arr[i] * 1e5) + ' ' + Math.round(arr[i + 1] * 1e5) + ' ' + Math.round(arr[i + 2] * 1e5));
    }
    return seen.size;
  }

  /* ---------- surfaces ----------
     fn(u,v) -> [x,y,z] with u,v in [0,1]. Grid lines are drawn at the u/v values
     the mesh already uses, so they read as the parametrisation.
     opts: {uLines, vLines, uClosed, vClosed}  (winding is not critical: the
     viewer lights both sides, but keep it consistent.) */
  function surface(b, fn, nu, nv, o) {
    o = o || {};
    const U = [], V = [];
    for (let i = 0; i < nu; i++) U.push(i / nu);
    if (!o.uClosed) U.push(1);
    for (let j = 0; j < nv; j++) V.push(j / nv);
    if (!o.vClosed) V.push(1);
    const P = U.map(u => V.map(v => fn(u, v)));
    const iN = o.uClosed ? U.length : U.length - 1, jN = o.vClosed ? V.length : V.length - 1;
    for (let i = 0; i < iN; i++) {
      const i2 = (i + 1) % U.length;
      for (let j = 0; j < jN; j++) {
        const j2 = (j + 1) % V.length;
        b.quad(P[i][j], P[i2][j], P[i2][j2], P[i][j2]);
      }
    }
    if (o.uLines) for (let k = 0; k < o.uLines; k++) b.poly(V.map(v => fn(k / o.uLines, v)));
    if (o.vLines) for (let k = 0; k < o.vLines; k++) b.poly(U.map(u => fn(u, k / o.vLines)));
  }

  /* ---------- tube along a polyline, parallel-transported frames ---------- */
  function tube(b, pts, r, sides, o) {
    o = o || {};
    const N = pts.length;
    if (N < 2) return;
    let t = unit(sub(pts[1], pts[0]));
    let ref = Math.abs(t[2]) < 0.9 ? [0, 0, 1] : [1, 0, 0];
    let u = unit(cross(t, ref)), v = cross(t, u);
    const frames = [[u, v]];
    for (let i = 1; i < N; i++) {
      const t2 = unit(sub(pts[Math.min(i + 1, N - 1)], pts[i - 1]));
      const ax = cross(t, t2), s = len(ax), c = dot(t, t2);
      if (s > 1e-12) { const ang = Math.atan2(s, c), k = mul(ax, 1 / s); u = rotAxis(u, k, ang); v = rotAxis(v, k, ang); }
      t = t2; frames.push([u, v]);
    }
    const rings = [];
    for (let i = 0; i < N; i++) {
      const [uu, vv] = frames[i], ring = [];
      for (let k = 0; k < sides; k++) {
        const a = (k / sides) * TAU;
        ring.push(add(pts[i], add(mul(uu, r * Math.cos(a)), mul(vv, r * Math.sin(a)))));
      }
      rings.push(ring);
    }
    const segN = o.closed ? N : N - 1;
    for (let i = 0; i < segN; i++) {
      const i2 = (i + 1) % N;
      for (let k = 0; k < sides; k++) {
        const k2 = (k + 1) % sides;
        b.quad(rings[i][k], rings[i][k2], rings[i2][k2], rings[i2][k]);
      }
    }
    if (o.caps && !o.closed) { for (const i of [0, N - 1]) { const c = pts[i]; for (let k = 0; k < sides; k++) b.tri(c, rings[i][(k + 1) % sides], rings[i][k]); } }
    if (o.grid) for (let i = 0; i < N; i += (o.gridStep || 1)) b.poly(rings[i], true);
  }

  /* ---------- solids ---------- */
  const _ico = {};
  function icosphere(sub) {
    sub = sub | 0;
    if (_ico[sub]) return _ico[sub];
    const t = (1 + Math.sqrt(5)) / 2;
    let V = [[-1, t, 0], [1, t, 0], [-1, -t, 0], [1, -t, 0], [0, -1, t], [0, 1, t],
    [0, -1, -t], [0, 1, -t], [t, 0, -1], [t, 0, 1], [-t, 0, -1], [-t, 0, 1]].map(unit);
    let F = [[0, 11, 5], [0, 5, 1], [0, 1, 7], [0, 7, 10], [0, 10, 11], [1, 5, 9], [5, 11, 4],
    [11, 10, 2], [10, 7, 6], [7, 1, 8], [3, 9, 4], [3, 4, 2], [3, 2, 6], [3, 6, 8],
    [3, 8, 9], [4, 9, 5], [2, 4, 11], [6, 2, 10], [8, 6, 7], [9, 8, 1]];
    for (let s = 0; s < sub; s++) {
      const mid = new Map(), nF = [];
      const M = (a, c) => {
        const k = a < c ? a + '_' + c : c + '_' + a;
        if (mid.has(k)) return mid.get(k);
        const p = unit([(V[a][0] + V[c][0]) / 2, (V[a][1] + V[c][1]) / 2, (V[a][2] + V[c][2]) / 2]);
        V.push(p); mid.set(k, V.length - 1); return V.length - 1;
      };
      for (const f of F) {
        const ab = M(f[0], f[1]), bc = M(f[1], f[2]), ca = M(f[2], f[0]);
        nF.push([f[0], ab, ca], [f[1], bc, ab], [f[2], ca, bc], [ab, bc, ca]);
      }
      F = nF;
    }
    _ico[sub] = { V, F };
    return _ico[sub];
  }

  function sphere(b, c, r, sub) {
    const { V, F } = icosphere(sub === undefined ? 1 : sub);
    for (const f of F) {
      const p = V[f[0]], q = V[f[1]], s = V[f[2]];
      b.tri([c[0] + p[0] * r, c[1] + p[1] * r, c[2] + p[2] * r],
        [c[0] + q[0] * r, c[1] + q[1] * r, c[2] + q[2] * r],
        [c[0] + s[0] * r, c[1] + s[1] * r, c[2] + s[2] * r]);
    }
  }

  /* axis-aligned box; faces unless o.faces === false, 12 edges unless o.edges === false */
  function box(b, lo, hi, o) {
    o = o || {};
    const C = [];
    for (let i = 0; i < 8; i++) C.push([(i & 1) ? hi[0] : lo[0], (i & 2) ? hi[1] : lo[1], (i & 4) ? hi[2] : lo[2]]);
    const F = [[0, 1, 3, 2], [4, 6, 7, 5], [0, 4, 5, 1], [2, 3, 7, 6], [0, 2, 6, 4], [1, 5, 7, 3]];
    if (o.faces !== false) for (const f of F) b.quad(C[f[0]], C[f[1]], C[f[2]], C[f[3]]);
    if (o.edges !== false) {
      const E = [[0, 1], [1, 3], [3, 2], [2, 0], [4, 5], [5, 7], [7, 6], [6, 4], [0, 4], [1, 5], [2, 6], [3, 7]];
      for (const e of E) b.line(C[e[0]], C[e[1]]);
    }
  }

  function polyline(b, pts, closed) { b.poly(pts, closed); }

  /* ---------- framing ---------- */
  function bounds(out) {
    const lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
    let any = false;
    for (const arr of [out.tris, out.lines]) {
      if (!arr || !arr.length) continue;
      for (let i = 0; i < arr.length; i += 3) {
        any = true;
        for (let a = 0; a < 3; a++) { if (arr[i + a] < lo[a]) lo[a] = arr[i + a]; if (arr[i + a] > hi[a]) hi[a] = arr[i + a]; }
      }
    }
    if (!any) return null;
    const c = [0, 1, 2].map(a => (lo[a] + hi[a]) / 2);
    return { lo, hi, center: c, radius: Math.max(len(sub(hi, c)), 1e-9) };
  }

  /* centre on the origin and scale to `radius` (in place, returns out) */
  function fit(out, radius) {
    radius = radius === undefined ? 1 : radius;
    const bd = bounds(out);
    if (!bd) return out;
    const k = radius / bd.radius, c = bd.center;
    for (const arr of [out.tris, out.lines]) {
      if (!arr) continue;
      for (let i = 0; i < arr.length; i += 3) {
        arr[i] = (arr[i] - c[0]) * k; arr[i + 1] = (arr[i + 1] - c[1]) * k; arr[i + 2] = (arr[i + 2] - c[2]) * k;
      }
    }
    return out;
  }

  /* ---------- linear algebra ---------- */
  /* solve a 3x3 system A x = rhs; null when singular */
  function solve3(A, rhs) {
    const m = [[A[0][0], A[0][1], A[0][2], rhs[0]], [A[1][0], A[1][1], A[1][2], rhs[1]], [A[2][0], A[2][1], A[2][2], rhs[2]]];
    for (let c = 0; c < 3; c++) {
      let p = c;
      for (let r = c + 1; r < 3; r++) if (Math.abs(m[r][c]) > Math.abs(m[p][c])) p = r;
      if (Math.abs(m[p][c]) < 1e-14) return null;
      const tmp = m[c]; m[c] = m[p]; m[p] = tmp;
      for (let r = 0; r < 3; r++) {
        if (r === c) continue;
        const f = m[r][c] / m[c][c];
        for (let k = c; k < 4; k++) m[r][k] -= f * m[c][k];
      }
    }
    return [m[0][3] / m[0][0], m[1][3] / m[1][1], m[2][3] / m[2][2]];
  }

  /* Descartes' theorem for the two circles/spheres tangent to three mutually
     tangent ones (same formula in every dimension): k' = k1+k2+k3 ± 2√(k1k2+k2k3+k3k1) */
  function descartesK(k1, k2, k3) {
    const root = 2 * Math.sqrt(Math.max(0, k1 * k2 + k2 * k3 + k3 * k1));
    return [k1 + k2 + k3 + root, k1 + k2 + k3 - root];
  }

  /* The two spheres tangent to four mutually tangent spheres, external tangency
     (|c-ci| = r+ri). Returns [] / [one] / [two]; a solution with r < 0 is the
     enclosing sphere of the quadruple, in the signed-radius convention.
     s = {c:[x,y,z], r:number}. Verify with tangency() below. */
  function soddy4(s1, s2, s3, s4) {
    const rest = [s2, s3, s4];
    const rowA = [], rhs = [], rowB = [];
    for (const s of rest) {
      const d = sub(s.c, s1.c);
      rowA.push([2 * d[0], 2 * d[1], 2 * d[2]]);
      rowB.push(2 * (s.r - s1.r));
      rhs.push((s1.r * s1.r - s.r * s.r) - (dot(s1.c, s1.c) - dot(s.c, s.c)));
    }
    /* the rows are [2(ci-c1), 2(ri-r1)] · [c, r] = rhs  →  c = p + q r */
    const p = solve3(rowA, rhs);
    if (!p) return [];
    const q = solve3(rowA, rowB.map(v => -v));
    if (!q) return [];
    /* substitute into |c|² - 2c·c1 + |c1|² = r² + 2r r1 + r1² */
    const A = dot(q, q) - 1;
    const Bc = 2 * dot(p, q) - 2 * dot(q, s1.c) - 2 * s1.r;
    const C = dot(p, p) - 2 * dot(p, s1.c) + dot(s1.c, s1.c) - s1.r * s1.r;
    let rs;
    if (Math.abs(A) < 1e-12) { if (Math.abs(Bc) < 1e-12) return []; rs = [-C / Bc]; }
    else {
      const disc = Bc * Bc - 4 * A * C;
      if (disc < -1e-9) return [];
      const sq = Math.sqrt(Math.max(0, disc));
      rs = [(-Bc + sq) / (2 * A), (-Bc - sq) / (2 * A)];
    }
    const out = [];
    for (const r of rs) {
      if (!isFinite(r)) continue;
      out.push({ c: [p[0] + q[0] * r, p[1] + q[1] * r, p[2] + q[2] * r], r });
    }
    return out;
  }

  /* |c1-c2| - |r1+r2| — zero when two spheres touch externally */
  function tangency(s1, s2) { return dist(s1.c, s2.c) - Math.abs(s1.r + s2.r); }

  /* ---------- collections ---------- */
  function concat(list) {
    let n = 0; for (const a of list) n += a.length;
    const out = new Float32Array(n); let i = 0;
    for (const a of list) { out.set(a, i); i += a.length; }
    return out;
  }

  /* regular n-gon / polyhedron vertices as convex hull helpers are out of scope:
     families needing a hull should build the faces themselves. */

  return {
    BUDGET,
    TAU, D2R, R2D, clamp, lerp, sign, prng,
    sub, add, mul, dot, cross, len, dist, unit, rotAxis,
    Builder, surface, tube, sphere, icosphere, box, polyline,
    bounds, fit, solve3, descartesK, soddy4, tangency, concat,
    uniq: arr => (arr && arr.length ? uniqBoth(arr, []) : 0),
    /* small helper: evenly spaced parameter values, inclusive of both ends */
    steps: (a, b, n) => { const o = []; for (let i = 0; i <= n; i++) o.push(i === n ? b : a + (b - a) * i / n); return o; }
  };
})();

if (typeof module !== 'undefined' && module.exports) module.exports = GEOM;
