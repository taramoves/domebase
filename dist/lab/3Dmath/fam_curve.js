/* fam_curve.js — the curve family: three of Knill's 3dprinter/math figures, each
   drawn as a tube (or, for the hopf web, as lines when its tube radius is 0).

     torusknot  the (p,q) torus knot   gamma(t) = ((R + r cos(qt/p)) cos t,
                                               (R + r cos(qt/p)) sin t,
                                                r sin(qt/p))
                src knill 3dprinter/math/knotaddition.html
     chain      evenly spaced rings, each turned 90 deg about the x axis from the
                one before, so neighbours interlock
                src knill 3dprinter/math/chain.html
     hopf       the hopf fibration: one stereographically projected circle per
                lattice point of the base sphere
                src knill 3dprinter/math/hopf.html

   Budgets: every build() stays under ~400k triangles / segments and under
   ~250 ms at the parameter extremes. The one combination that can blow up is
   the hopf web drawn as tubes (rings * around fibres of turns points), so
   hopfParams() quietly drops `sides` until the web fits in 300k triangles —
   see the comment there. Nothing else needs coarsening.

   See work/lab/CONTRACT.md for the file contract. */

(function () {
  const TAU = Math.PI * 2, D2R = Math.PI / 180;
  const clamp = (x, a, b) => (x < a ? a : x > b ? b : x);
  const gcd = (a, b) => { while (b) { const t = a % b; a = b; b = t; } return a; };

  /* ---------- small local vector ops ----------
     build() gets GEOM as its second argument, but verify() gets only (P, out),
     so the three primitive ops the invariant checks need live here. */
  const sub3 = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
  const dot3 = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  const cross3 = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
  const len3 = a => Math.sqrt(dot3(a, a));
  const unit3 = a => { const l = len3(a) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };

  /* total turning of a closed polyline about a point, in turns: the sum of the
     wrapped increments of the angle f(point). Exact while every step turns less
     than pi, which the sampling below guarantees. */
  function windings(pts, f) {
    let s = 0;
    for (let i = 0; i < pts.length; i++) {
      let d = f(pts[(i + 1) % pts.length]) - f(pts[i]);
      while (d > Math.PI) d -= TAU;
      while (d < -Math.PI) d += TAU;
      s += d;
    }
    return s / TAU;
  }

  /* least squares circle through the points, in their own plane. The normal is
     the widest cross product of a strided sample of triples (well conditioned
     whatever the parametrisation); the fit is Kasa's. Returns the spread of
     |p - centre| (rdev), the largest out-of-plane distance (plan) and the
     radius. Note the centroid is NOT the centre of these curves: psi runs
     round the stereographic image of a fibre at a non-uniform rate, so the
     honest "is it a circle" test is the fit, not the centroid. */
  function circleFit(pts) {
    const n = pts.length;
    const c = [0, 0, 0];
    for (const p of pts) { c[0] += p[0] / n; c[1] += p[1] / n; c[2] += p[2] / n; }
    const st = Math.max(1, Math.floor(n / 64));
    let nrm = null, bl = 0;
    for (let i = st; i < n; i += st) {
      const v1 = sub3(pts[i], pts[0]);
      for (let j = i + st; j < n; j += st) {
        const cr = cross3(v1, sub3(pts[j], pts[0])), l = len3(cr);
        if (l > bl) { bl = l; nrm = cr; }
      }
    }
    if (!nrm || bl < 1e-12) return { r: 0, rdev: 0, plan: 0 };
    nrm = unit3(nrm);
    const e1 = unit3(sub3(pts[st], pts[0])), e2 = unit3(cross3(nrm, e1));
    let Suu = 0, Suv = 0, Svv = 0, Su = 0, Sv = 0, Suuu = 0, Svvv = 0, Suvv = 0, Svuu = 0;
    const uv = [];
    for (const p of pts) {
      const d = sub3(p, c), u = dot3(d, e1), v = dot3(d, e2);
      uv.push([u, v]);
      Suu += u * u; Suv += u * v; Svv += v * v; Su += u; Sv += v;
      Suuu += u * u * u; Svvv += v * v * v; Suvv += u * v * v; Svuu += v * u * u;
    }
    let a = 0, b = 0, R = 0;
    const det = Suu * Svv - Suv * Suv;
    if (Math.abs(det) > 1e-18) {
      const B1 = 0.5 * (Suuu + Suvv), B2 = 0.5 * (Svvv + Svuu);
      a = (B1 * Svv - Suv * B2) / det; b = (Suu * B2 - B1 * Suv) / det;
      R = Math.sqrt(Math.max(0, (Suu + Svv) / n - 2 * a * (Su / n) - 2 * b * (Sv / n) + a * a + b * b));
    }
    let rdev = 0, plan = 0;
    for (let i = 0; i < n; i++) {
      rdev = Math.max(rdev, Math.abs(Math.hypot(uv[i][0] - a, uv[i][1] - b) - R));
      plan = Math.max(plan, Math.abs(dot3(sub3(pts[i], c), nrm)));
    }
    return { r: R, rdev, plan };
  }

  /* ---------- 1. torus knot ---------- */

  function knotParams(P) {
    const p = clamp(Math.round(P.p), 1, 9), q = clamp(Math.round(P.q), 1, 9);
    const R = clamp(P.R, 0.2, 3);
    const r = clamp(P.r, 0.05, 0.98 * R);          /* keep the ring clear of the z axis */
    /* at least 12 samples per winding so the winding counts verify() reports are
       unambiguous (steps < 12*max(p,q) with p = q = 9 would alias), and never
       more than 4000 points along the knot */
    const steps = clamp(Math.max(Math.round(P.steps), 12 * Math.max(p, q)), 4, 4000);
    const sides = clamp(Math.round(P.sides), 3, 16);
    const tube = clamp(P.tube, 0.004, 0.4);
    return { p, q, R, r, steps, sides, tube };
  }
  function knotPoint(k, t) {
    const a = k.q * t / k.p, rr = k.R + k.r * Math.cos(a);
    return [rr * Math.cos(t), rr * Math.sin(t), k.r * Math.sin(a)];
  }
  /* steps points, no repeated endpoint: the tube closes through the seam */
  function knotLine(k) {
    const o = [];
    for (let i = 0; i < k.steps; i++) o.push(knotPoint(k, TAU * k.p * i / k.steps));
    return o;
  }

  /* ---------- 2. chain ---------- */

  function chainParams(P) {
    const links = clamp(Math.round(P.links), 2, 12);
    const R = clamp(P.R, 0.2, 2);
    const rt = clamp(P.rt, 0.01, Math.min(0.3, R / 3.02));   /* the tube must leave a hole */
    const nu = clamp(Math.round(P.nu), 8, 160), nv = clamp(Math.round(P.nv), 6, 48);
    /* Two rings of major radius R, one turned 90 deg about x from the other, at
       centre distance d: the rings are linked while 0 < d < 2R, and their
       centrelines come as close as min(d, 2R - d) — the same-side tangency when
       d < R, the far side of one ring near the near side of the other when
       d > R. So the tubes stay disjoint exactly while 2rt < d < 2(R - rt).
       Rings two apart share a plane, so they need 2gap > 2(R + rt) as well.
       (Note the brief's "2(R - rt) .. 2R" is that band back to front: at
       R=1, rt=.12 it would make d = 1.76 > 1.6, and there the tubes overlap by
       0.005, while its own default gap of 1.6 clears by 0.16.)
       `gap` is clamped into the resulting band, keeping 2% of its width clear. */
    const lo = Math.max(2 * rt, R + rt), hi = 2 * (R - rt), m = 0.02 * (hi - lo);
    const gap = clamp(P.gap, lo + m, hi - m);
    return { links, R, rt, nu, nv, gap, lo, hi, grid: P.grid >= 0.5 };
  }
  function chainCentres(c) {
    const o = [];
    for (let k = 0; k < c.links; k++) o.push([(k - (c.links - 1) / 2) * c.gap, 0, 0]);
    return o;
  }

  /* ---------- 3. hopf fibration ---------- */

  function hopfParams(P) {
    const rings = clamp(Math.round(P.rings), 2, 9), around = clamp(Math.round(P.around), 2, 12);
    const rotDeg = isFinite(P.rot) ? P.rot : 0;
    const rot = rotDeg * D2R, pole = clamp(P.pole, 0, 0.6);
    const turns = clamp(Math.round(P.turns), 24, 400);
    let sides = clamp(Math.round(P.sides), 3, 10);
    const tube = P.tube > 0 ? clamp(P.tube, 0.002, 0.06) : 0;
    /* budget: rings*around fibres of turns points, sides*2 triangles each once
       tubed, so a fuller web gets a coarser tube. `turns` and the fibre count are
       never reduced: they are what the picture is. */
    if (tube > 0) {
      const fit = Math.floor(GEOM.BUDGET.tri * 0.9 / (rings * around * 2 * turns));
      if (fit < sides) sides = clamp(fit, 3, sides);
    }
    return { rings, around, rot, rotDeg, pole, turns, sides, tube, grid: P.grid >= 0.5 };
  }
  /* a point of the unit 3-sphere, on the fibre over (theta, phi), then its
     image under the stereographic projection from (0,0,0,1+pole). The 4d
     rotation by `rot` in the (x1,x4) plane moves the whole fibration without
     changing it (an isometry of S^3 takes fibres, which are great circles, to
     fibres), so it animates the picture and leaves every invariant alone.
     theta is never 0 or pi, so x4 <= cos(theta/2) < 1 and 1+pole-x4 > 0. */
  function hopf4(h, theta, phi, psi) {
    const s = Math.sin(theta / 2), c = Math.cos(theta / 2);
    const x1 = Math.cos((psi + phi) / 2) * s, x2 = Math.sin((psi + phi) / 2) * s;
    const x3 = Math.cos((psi - phi) / 2) * c, x4 = Math.sin((psi - phi) / 2) * c;
    const ca = Math.cos(h.rot), sa = Math.sin(h.rot);
    return [ca * x1 - sa * x4, x2, x3, sa * x1 + ca * x4];
  }
  const hopfProj = (h, x) => { const d = 1 + h.pole - x[3]; return [x[0] / d, x[1] / d, x[2] / d]; };
  /* turns points over psi in [0, 4pi) — the whole fibre, no repeated endpoint */
  function hopfFibre(h, theta, phi) {
    const o = [];
    for (let i = 0; i < h.turns; i++) o.push(hopfProj(h, hopf4(h, theta, phi, 2 * TAU * i / h.turns)));
    return o;
  }
  function hopfBase(h) {
    const o = [];
    for (let i = 0; i < h.rings; i++)
      for (let j = 0; j < h.around; j++)
        o.push([Math.PI * (i + 1) / (h.rings + 1), TAU * j / h.around]);
    return o;
  }

  /* ---------- the family ---------- */

  const defs = [
    {
      id: 'torusknot',
      name: 'torus knot',
      family: 'curve',
      src: 'knill 3dprinter/math/knotaddition.html',

      params: [
        { k: 'p', label: 'p', min: 1, max: 9, step: 1, def: 2, anim: 1 },
        { k: 'q', label: 'q', min: 1, max: 9, step: 1, def: 3, anim: 14 },
        { k: 'R', label: 'R', min: 1, max: 3, step: 0.05, def: 2 },
        { k: 'r', label: 'r', min: 0.2, max: 1.5, step: 0.05, def: 0.7 },
        { k: 'tube', label: 'tube', min: 0.02, max: 0.4, step: 0.01, def: 0.12 },
        { k: 'steps', label: 'steps', min: 32, max: 2000, step: 1, def: 512 },
        { k: 'sides', label: 'sides', min: 3, max: 16, step: 1, def: 7 }
      ],

      build: function (P, G) {
        const k = knotParams(P);
        const b = new G.Builder();
        G.tube(b, knotLine(k), k.tube, k.sides, { closed: true });
        return b.out({ steps: k.steps, sides: k.sides });
      },

      verify: function (P, out) {
        const k = knotParams(P), line = knotLine(k);
        const a0 = knotPoint(k, 0), a1 = knotPoint(k, TAU * k.p);
        const closing = len3(sub3(a1, a0));
        /* the two winding numbers, read off the centreline the tube was built on */
        const np = Math.round(windings(line, s => Math.atan2(s[1], s[0])));
        const nq = Math.round(windings(line, s => Math.atan2(s[2], Math.hypot(s[0], s[1]) - k.R)));
        /* every distinct tube vertex must sit exactly `tube` from the nearest
           centreline point — that is what G.tube's frame construction claims */
        const seen = new Set();
        let nv = 0, worst = 0;
        for (let i = 0; i < out.tris.length; i += 3) {
          const x = out.tris[i], y = out.tris[i + 1], z = out.tris[i + 2];
          const key = Math.round(x * 1e5) + ' ' + Math.round(y * 1e5) + ' ' + Math.round(z * 1e5);
          if (seen.has(key)) continue;
          seen.add(key); nv++;
          let best = Infinity;
          for (let j = 0; j < line.length; j++) {
            const dx = x - line[j][0], dy = y - line[j][1], dz = z - line[j][2];
            const d2 = dx * dx + dy * dy + dz * dz;
            if (d2 < best) best = d2;
          }
          const e = Math.abs(Math.sqrt(best) - k.tube);
          if (e > worst) worst = e;
        }
        return 'p=' + k.p + ' q=' + k.q + ' gcd=' + gcd(k.p, k.q) +
          ': curve closes to ' + closing.toExponential(1) + ', winds ' + np + ' toroidal x ' + nq +
          ' poloidal, tube radius off by ' + worst.toExponential(1) +
          ' over ' + nv + ' vertices (float32 build)';
      }
    },

    {
      id: 'chain',
      name: 'chain',
      family: 'curve',
      src: 'knill 3dprinter/math/chain.html',

      params: [
        { k: 'links', label: 'links', min: 2, max: 8, step: 1, def: 5 },
        { k: 'R', label: 'R', min: 0.4, max: 2, step: 0.05, def: 1 },
        { k: 'rt', label: 'rt', min: 0.03, max: 0.3, step: 0.01, def: 0.12 },
        { k: 'gap', label: 'gap', min: 0.4, max: 4, step: 0.01, def: 1.6 },
        { k: 'nu', label: 'nu', min: 16, max: 120, step: 1, def: 64 },
        { k: 'nv', label: 'nv', min: 8, max: 40, step: 1, def: 20 },
        { k: 'grid', label: 'grid', min: 0, max: 1, step: 1, def: 0 }
      ],

      build: function (P, G) {
        const c = chainParams(P), C = chainCentres(c);
        const b = new G.Builder();
        for (let k = 0; k < c.links; k++) {
          const ctr = C[k], ang = k * Math.PI / 2;   /* 90 deg about x from the last ring */
          G.surface(b, function (u, v) {
            const a = u * TAU, e = v * TAU, rr = c.R + c.rt * Math.cos(e);
            return G.add(ctr, G.rotAxis([rr * Math.cos(a), rr * Math.sin(a), c.rt * Math.sin(e)], [1, 0, 0], ang));
          }, c.nu, c.nv, {
            uClosed: true, vClosed: true,
            uLines: c.grid ? Math.min(c.nu, 32) : 0,
            vLines: c.grid ? Math.min(c.nv, 12) : 0
          });
        }
        return b.out({ links: c.links, gap: c.gap, nu: c.nu, nv: c.nv });
      },

      verify: function (P, out) {
        const c = chainParams(P), C = chainCentres(c);
        let dmin = Infinity, dmax = 0, nbr = Infinity;
        for (let k = 0; k + 1 < C.length; k++) {
          const d = len3(sub3(C[k + 1], C[k]));
          if (d < dmin) dmin = d;
          if (d > dmax) dmax = d;
          /* closest approach of two neighbouring centrelines */
          nbr = Math.min(nbr, Math.min(d, 2 * c.R - d));
        }
        /* rings two apart share a plane, so their centrelines come 2gap-2R apart */
        const far = C.length > 2 ? 2 * c.gap - 2 * c.R : null;
        return c.links + ' rings, R=' + c.R.toFixed(2) + ' rt=' + c.rt.toFixed(2) +
          ': neighbour centre distance ' + dmin.toFixed(4) + '..' + dmax.toFixed(4) +
          ' inside (' + c.lo.toFixed(4) + ', ' + c.hi.toFixed(4) + ') = (max(2rt, R+rt), 2(R-rt))' +
          ', so linked (d < 2R=' + (2 * c.R).toFixed(3) + ') with the tubes ' +
          (nbr - 2 * c.rt).toFixed(4) + ' apart at their closest; same-plane pair (2 links on) ' +
          (far === null ? 'n/a' : (far - 2 * c.rt).toFixed(4) + ' apart');
      }
    },

    {
      id: 'hopf',
      name: 'hopf fibration',
      family: 'curve',
      src: 'knill 3dprinter/math/hopf.html',

      params: [
        { k: 'rings', label: 'rings', min: 2, max: 6, step: 1, def: 5 },
        { k: 'around', label: 'around', min: 2, max: 12, step: 1, def: 6 },
        { k: 'turns', label: 'turns', min: 24, max: 200, step: 1, def: 96 },
        { k: 'rot', label: 'rot', min: 0, max: 360, step: 1, def: 0, anim: 12 },
        { k: 'pole', label: 'pole', min: 0, max: 0.6, step: 0.01, def: 0 },
        { k: 'tube', label: 'tube', min: 0, max: 0.06, step: 0.005, def: 0 },
        { k: 'sides', label: 'sides', min: 3, max: 10, step: 1, def: 5 },
        { k: 'grid', label: 'grid', min: 0, max: 1, step: 1, def: 0 }
      ],

      build: function (P, G) {
        const h = hopfParams(P), base = hopfBase(h);
        const b = new G.Builder();
        /* the ring grid on a tube is capped at ~24 rings per fibre, or a
           turns=400 web would draw 400*sides segments of grid per fibre */
        const gridStep = Math.max(1, Math.floor(h.turns / 24));
        for (const q of base) {
          const pts = hopfFibre(h, q[0], q[1]);
          if (h.tube > 0) G.tube(b, pts, h.tube, h.sides, { closed: true, grid: h.grid, gridStep: gridStep });
          else G.polyline(b, pts, true);
        }
        return b.out({ fibres: base.length, points: base.length * h.turns, sides: h.sides, tube: h.tube });
      },

      verify: function (P, out) {
        const h = hopfParams(P), base = hopfBase(h);
        let rdev = 0, plan = 0, rmin = Infinity, rmax = 0, unit = 0, pts = 0;
        for (const q of base) {
          const f = hopfFibre(h, q[0], q[1]);
          pts += f.length;
          for (let i = 0; i < h.turns; i++) {          /* |x| = 1 on S^3 */
            const x = hopf4(h, q[0], q[1], 2 * TAU * i / h.turns);
            unit = Math.max(unit, Math.abs(Math.hypot(x[0], x[1], x[2], x[3]) - 1));
          }
          const fit = circleFit(f);
          rdev = Math.max(rdev, fit.rdev);
          plan = Math.max(plan, fit.plan);
          rmin = Math.min(rmin, fit.r);
          rmax = Math.max(rmax, fit.r);
        }
        /* pole 0 is the stereographic projection from (0,0,0,1): the Hopf fibres
           are circles and the projection of each is a circle. A raised pole is a
           different projection, not a stereographic one, and the image of a
           fibre is a conic — still exactly planar, so only the circularity
           claim has to change with the parameter. */
        const what = h.pole === 0
          ? 'each projects to a circle to ' + rdev.toExponential(1)
          : 'pole ' + h.pole + ' is not stereographic, so each fibre projects to a conic, ' +
            'planar but not circular (circle-fit deviation ' + rdev.toExponential(1) + ')';
        return base.length + ' fibres x ' + h.turns + ' points (' + pts + ' points, ' +
          h.sides + ' sides, rot ' + h.rotDeg + ' deg): ' + what +
          ' (radius ' + rmin.toFixed(3) + '..' + rmax.toFixed(3) +
          '), planar to ' + plan.toExponential(1) + ', |x|=1 to ' + unit.toExponential(1);
      }
    }
  ];

  if (typeof SHAPES3D !== 'undefined') defs.forEach(d => SHAPES3D.define(d));
  if (typeof module !== 'undefined' && module.exports) module.exports = defs;
})();
