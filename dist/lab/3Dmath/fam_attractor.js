/* fam_attractor.js — strange attractors and a random walk for the 3d math lab.

   Six figures, each one polyline through a single integrated trajectory:

     lorenz     the classic butterfly, from Knill's 3dprinter/math/lorentz.html
     rossler    the single-scroll spiral, textbook constants
     halvorsen  the cyclic three-lobed flow
     aizawa     the tube-in-a-shell flow with the x^3 pinch term
     thomas     the sinusoidally coupled flow (b near 0.208186)
     brownian   constant-step random walk, from 3dprinter/math/brownian.html

   The five flows are integrated with a fixed-step RK4; the walk is Euler with a
   uniformly random direction on the sphere, drawn from G.prng(seed) so the same
   parameters always produce the same path. No Math.random, no DOM, no deps.

   Both the orbit and the divergence check stop/fail on a runaway parameter set:
   a point that leaves the +/-1e4 cube ends the trajectory rather than emitting
   an Infinity into the geometry. */

(function () {
  const BOX = 1e4;         // orbit guard: |coordinate| must stay below this
  const TUBE_MAX = 4000;   // tube() costs points*sides quads, so beyond this many
                           // trajectory points we use every Nth point (see emit)
  const SAMPLES = 20;      // divergence probes per verify()
  const H = 1e-5;          // central-difference step

  /* ---------------- integration ---------------- */

  /* one fixed RK4 step of the field F(x,y,z) -> [dx,dy,dz] */
  function rk4(F, x, y, z, dt) {
    const h = dt * 0.5, w = dt / 6;
    const k1 = F(x, y, z);
    const k2 = F(x + h * k1[0], y + h * k1[1], z + h * k1[2]);
    const k3 = F(x + h * k2[0], y + h * k2[1], z + h * k2[2]);
    const k4 = F(x + dt * k3[0], y + dt * k3[1], z + dt * k3[2]);
    return [
      x + w * (k1[0] + 2 * k2[0] + 2 * k3[0] + k4[0]),
      y + w * (k1[1] + 2 * k2[1] + 2 * k3[1] + k4[1]),
      z + w * (k1[2] + 2 * k2[2] + 2 * k3[2] + k4[2])
    ];
  }

  const inBox = p => (p[0] > -BOX && p[0] < BOX && p[1] > -BOX && p[1] < BOX && p[2] > -BOX && p[2] < BOX);

  /* the points of the orbit, starting at s: steps+1 of them, fewer only when a
     step leaves the box (NaN also fails inBox, so it truncates too) */
  function orbit(F, s, dt, steps) {
    const pts = [[s[0], s[1], s[2]]];
    let p = pts[0];
    for (let i = 0; i < steps; i++) {
      p = rk4(F, p[0], p[1], p[2], dt);
      if (!inBox(p)) break;
      pts.push(p);
    }
    return pts;
  }

  /* brownian walk: each step is `step` long in a uniform direction on the
     sphere (z uniform on [-1,1], azimuth uniform), taken from G.prng(seed) */
  function walk(G, seed, step, steps) {
    const rnd = G.prng(seed);
    const pts = [[0, 0, 0]];
    let x = 0, y = 0, z = 0;
    for (let i = 0; i < steps; i++) {
      const c = 2 * rnd() - 1, phi = 2 * Math.PI * rnd(), r = Math.sqrt(Math.max(0, 1 - c * c));
      x += step * r * Math.cos(phi);
      y += step * r * Math.sin(phi);
      z += step * c;
      pts.push([x, y, z]);
    }
    return pts;
  }

  /* ---------------- drawing ---------------- */

  function sidesOf(P) {
    const s = Math.round(+P.sides || 5);
    return s < 3 ? 3 : s > 10 ? 10 : s;
  }

  /* one polyline through the whole trajectory, or a tube when tube > 0.
     A tube over 60000 points would be hundreds of thousands of quads for no
     visible gain, so only every stride-th point is used and stats.points says
     how many actually reached the tube. Lines are cheap: never subsampled. */
  function emit(G, pts, P) {
    const b = new G.Builder();
    const tube = +P.tube || 0;
    if (tube > 0) {
      const stride = Math.max(1, Math.ceil(pts.length / TUBE_MAX));
      const q = [];
      for (let i = 0; i < pts.length; i += stride) q.push(pts[i]);
      if (q[q.length - 1] !== pts[pts.length - 1]) q.push(pts[pts.length - 1]);
      G.tube(b, q, tube, sidesOf(P), { caps: true });
      b.count('points', q.length);
      b.count('stride', stride);
    } else {
      G.polyline(b, pts, false);
      b.count('points', pts.length);
    }
    return b.out({ method: tube > 0 ? 'rk4+tube' : 'rk4' });
  }

  /* ---------------- verification ---------------- */

  /* div F at p by central differences on the field itself */
  function divergence(F, p) {
    const x = p[0], y = p[1], z = p[2], d = 2 * H;
    const a = F(x + H, y, z), b = F(x - H, y, z);
    const c = F(x, y + H, z), e = F(x, y - H, z);
    const f = F(x, y, z + H), g = F(x, y, z - H);
    return (a[0] - b[0]) / d + (c[1] - e[1]) / d + (f[2] - g[2]) / d;
  }

  /* rebuild the orbit, sample it SAMPLES times, and compare the numerical
     divergence with the analytic one; also assert the box and the count */
  function flowVerify(P, F, divFn, start, analytic) {
    const pts = orbit(F, start, P.dt, P.steps), n = pts.length;
    if (n !== P.steps + 1) throw new Error('orbit truncated to ' + n + ' points, expected ' + (P.steps + 1));
    let mx = 0;
    for (let i = 0; i < n; i++) {
      const p = pts[i];
      if (!isFinite(p[0]) || !isFinite(p[1]) || !isFinite(p[2])) throw new Error('non-finite point at ' + i);
      const m = Math.max(Math.abs(p[0]), Math.abs(p[1]), Math.abs(p[2]));
      if (m > mx) mx = m;
    }
    if (!(mx < BOX)) throw new Error('orbit leaves the box: max |coord| ' + mx);
    let worst = 0;
    for (let i = 0; i < SAMPLES; i++) {
      const p = pts[Math.round(i * (n - 1) / (SAMPLES - 1))];
      const e = Math.abs(divergence(F, p) - divFn(p));
      if (e > worst) worst = e;
    }
    if (!(worst < 1e-4)) throw new Error('divergence mismatch: worst |diff| ' + worst);

    /* A chaotic orbit fills three dimensions. An initial condition on an
       invariant subspace collapses the trajectory instead — thomas started at
       (1,1,1) sits on the x=y=z diagonal, where the field is straight, and
       integrates to a segment. The determinant of the point cloud's covariance
       vanishes for any cloud that lies in a plane, and a fortiori for a line,
       so it catches both; it is only applied once there are enough distinct
       points for the answer to mean anything (a fixed point is not degenerate,
       it is fixed). */
    let ax = 0, ay = 0, az = 0;
    for (let i = 0; i < n; i++) { ax += pts[i][0]; ay += pts[i][1]; az += pts[i][2]; }
    ax /= n; ay /= n; az /= n;
    let xx = 0, yy = 0, zz = 0, xy = 0, xz = 0, yz = 0;
    for (let i = 0; i < n; i++) {
      const a = pts[i][0] - ax, b = pts[i][1] - ay, c = pts[i][2] - az;
      xx += a * a; yy += b * b; zz += c * c; xy += a * b; xz += a * c; yz += b * c;
    }
    const seen = new Set();
    for (let i = 0; i < n; i++) {
      seen.add(Math.round(pts[i][0] * 1e6) + ',' + Math.round(pts[i][1] * 1e6) + ',' + Math.round(pts[i][2] * 1e6));
    }
    const det = xx * (yy * zz - yz * yz) - xy * (xy * zz - yz * xz) + xz * (xy * yz - yy * xz);
    const spread = (xx + yy + zz) / 3;
    const rank = spread > 0 ? Math.abs(det) / (spread * spread * spread) : 0;
    if (seen.size >= 200 && !(rank > 1e-9)) {
      throw new Error('orbit is degenerate: ' + seen.size + ' distinct points but the cloud has ' +
        'det(C)/(trace C/3)^3 = ' + rank.toExponential(2) + ' — it lies in a plane or a line');
    }

    return 'div(numeric) vs ' + analytic + ': worst |diff| ' + worst.toExponential(2) +
      ' over ' + SAMPLES + ' orbit points; box ok, max |coord| ' + mx.toFixed(1) + ' < 1e4; ' +
      n + ' points = steps + 1; ' + seen.size + ' distinct, rank ' + rank.toExponential(2);
  }

  /* def for one flow: shape params + [dt, steps, tube, sides] */
  function flow(o) {
    const params = o.params.concat([
      { k: 'dt', label: 'dt', min: o.dtMin, max: o.dtMax, step: o.dtStep, def: o.dt },
      { k: 'steps', label: 'steps', min: 500, max: 60000, step: 500, def: 8000 },
      { k: 'tube', label: 'tube', min: 0, max: 0.2, step: 0.005, def: 0 },
      { k: 'sides', label: 'sides', min: 3, max: 10, step: 1, def: 5 }
    ]);
    return {
      id: o.id, name: o.id, family: 'attractor', src: o.src, params: params,
      build: function (P, G) { return emit(G, orbit(o.field(P), o.start, P.dt, P.steps), P); },
      verify: function (P) { return flowVerify(P, o.field(P), o.div(P), o.start, o.analytic); }
    };
  }

  /* ---------------- the six shapes ---------------- */

  const S = [
    flow({
      id: 'lorenz', src: 'knill 3dprinter/math/lorentz.html', start: [1, 1, 1],
      dt: 0.005, dtMin: 0.0005, dtMax: 0.02, dtStep: 0.0005,
      analytic: '-(s+1+beta)',
      field: P => { const s = P.s, r = P.rho, be = P.beta; return (x, y, z) => [s * (y - x), x * (r - z) - y, x * y - be * z]; },
      div: P => () => -(P.s + 1 + P.beta),
      params: [
        { k: 's', label: 's', min: 0, max: 30, step: 0.1, def: 10 },
        { k: 'rho', label: 'rho', min: 0, max: 60, step: 0.5, def: 28, anim: 26 },
        { k: 'beta', label: 'beta', min: 0, max: 6, step: 0.1, def: 8 / 3 }
      ]
    }),

    flow({
      id: 'rossler', src: 'standard', start: [1, 1, 0],
      dt: 0.01, dtMin: 0.001, dtMax: 0.02, dtStep: 0.001,
      analytic: 'a + x - c',
      field: P => { const a = P.a, b = P.b, c = P.c; return (x, y, z) => [-y - z, x + a * y, b + z * (x - c)]; },
      div: P => p => P.a + p[0] - P.c,
      params: [
        { k: 'a', label: 'a', min: -1, max: 1, step: 0.01, def: 0.2 },
        { k: 'b', label: 'b', min: 0, max: 2, step: 0.05, def: 0.2 },
        { k: 'c', label: 'c', min: 0, max: 12, step: 0.1, def: 5.7 }
      ]
    }),

    flow({
      id: 'halvorsen', src: 'standard', start: [0.1, 0, 0],
      dt: 0.005, dtMin: 0.001, dtMax: 0.02, dtStep: 0.001,
      analytic: '-3a',
      field: P => { const a = P.a; return (x, y, z) => [-a * x - 4 * y - 4 * z - y * y, -a * y - 4 * z - 4 * x - z * z, -a * z - 4 * x - 4 * y - x * x]; },
      div: P => () => -3 * P.a,
      params: [
        { k: 'a', label: 'a', min: 0.5, max: 3, step: 0.01, def: 1.89 }
      ]
    }),

    flow({
      id: 'aizawa', src: 'standard', start: [0.1, 0, 0],
      dt: 0.01, dtMin: 0.001, dtMax: 0.02, dtStep: 0.001,
      analytic: '2(z-b) + a - z^2 - e(x^2+y^2) + f x^3',
      field: P => {
        const a = P.a, b = P.b, c = P.c, d = P.d, e = P.e, f = P.f;
        return (x, y, z) => [
          (z - b) * x - d * y,
          d * x + (z - b) * y,
          c + a * z - z * z * z / 3 - (x * x + y * y) * (1 + e * z) + f * z * x * x * x
        ];
      },
      div: P => p => { const x = p[0], y = p[1], z = p[2]; return 2 * (z - P.b) + P.a - z * z - P.e * (x * x + y * y) + P.f * x * x * x; },
      params: [
        { k: 'a', label: 'a', min: 0, max: 2, step: 0.01, def: 0.95 },
        { k: 'b', label: 'b', min: 0, max: 1.5, step: 0.01, def: 0.7 },
        { k: 'c', label: 'c', min: 0, max: 1.5, step: 0.01, def: 0.6 },
        { k: 'd', label: 'd', min: 0, max: 6, step: 0.05, def: 3.5 },
        { k: 'e', label: 'e', min: 0, max: 1, step: 0.01, def: 0.25 },
        { k: 'f', label: 'f', min: -0.5, max: 0.5, step: 0.01, def: 0.1 }
      ]
    }),

    flow({
      id: 'thomas', src: 'standard', start: [1, 0.5, -0.8],
      dt: 0.05, dtMin: 0.005, dtMax: 0.1, dtStep: 0.005,
      analytic: '-3b',
      field: P => { const b = P.b; return (x, y, z) => [Math.sin(y) - b * x, Math.sin(z) - b * y, Math.sin(x) - b * z]; },
      div: P => () => -3 * P.b,
      params: [
        { k: 'b', label: 'b', min: 0, max: 0.4, step: 0.001, def: 0.208186 }
      ]
    }),

    {
      id: 'brownian', name: 'brownian', family: 'attractor', src: 'knill 3dprinter/math/brownian.html',
      params: [
        { k: 'steps', label: 'steps', min: 500, max: 60000, step: 500, def: 8000 },
        { k: 'step', label: 'step', min: 0.005, max: 0.2, step: 0.005, def: 0.03 },
        { k: 'seed', label: 'seed', min: 1, max: 999, step: 1, def: 1 },
        { k: 'tube', label: 'tube', min: 0, max: 0.05, step: 0.001, def: 0 },
        { k: 'sides', label: 'sides', min: 3, max: 10, step: 1, def: 5 }
      ],
      build: function (P, G) { return emit(G, walk(G, P.seed, P.step, P.steps), P); },
      verify: function (P, out, G) {
        /* verify() is called with (P, out) by the checker, so recover GEOM when
           the caller does not hand it over (bare GEOM in the page, global.GEOM
           in node) */
        const g = G || (typeof GEOM !== 'undefined' ? GEOM : (typeof global !== 'undefined' ? global.GEOM : null));
        if (!g) throw new Error('verify() needs GEOM for G.prng');
        const pts = walk(g, P.seed, P.step, P.steps), n = pts.length;
        if (n !== P.steps + 1) throw new Error('walk has ' + n + ' points, expected ' + (P.steps + 1));
        let worst = 0;
        for (let i = 1; i < n; i++) {
          const d = Math.abs(g.dist(pts[i], pts[i - 1]) - P.step);
          if (d > worst) worst = d;
        }
        if (!(worst < 1e-9)) throw new Error('step length error ' + worst);
        const ck = a => { let s = 0; for (let i = 0; i < Math.min(50, a.length); i++) s += (i + 1) * (a[i][0] + 2 * a[i][1] + 3 * a[i][2]); return s; };
        const c1 = ck(walk(g, P.seed, P.step, P.steps)), c2 = ck(walk(g, P.seed, P.step, P.steps));
        if (c1 !== c2) throw new Error('seed does not reproduce the path');
        return 'step length error ' + worst.toExponential(2) + ' over ' + (n - 1) + ' steps (exact ' + P.step +
          '); seed ' + P.seed + ' reproduces the path (first-50 checksum ' + c1.toFixed(6) + ' twice); ' +
          n + ' points = steps + 1';
      }
    }
  ];

  if (typeof SHAPES3D !== 'undefined') S.forEach(d => SHAPES3D.define(d));
  if (typeof module !== 'undefined' && module.exports) module.exports = S;
})();
