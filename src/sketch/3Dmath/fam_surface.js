/* fam_surface.js — five parametrised surfaces (family: surface).

   calabiyau     Knill's printed Calabi-Yau plates: the Riemann surface
                 z1^n + z2^n = 1 in C^2, drawn as (Re z1, Im z1, Re z2) over the
                 disk z1 = rho e^{i theta}, rho in [0, rhoMax], theta in [0, 2pi).
                 Source note.  I fetched the paper these plates come from —
                 O. Knill & E. Slavkovsky, "Illustrating Mathematics using 3D
                 Printers", arXiv:1306.5599 — and its appendix (L1, "Calabi Yau
                 surface") does state the parametrisation it printed:
                     z1 = exp(2 pi i k1/n) cosh(z)^(2/n),
                     z2 = exp(2 pi i k2/n) sinh(z)^(2/n),   z = u + i v,
                     u in [-1,1], v in [0, pi/2], n = 5,
                 drawn as n^2 tube patches of (Re z1, Re z2, cos(a) Im z1 + sin(a) Im z2).
                 That form satisfies z1^n - z2^n = 1 (cosh^2 - sinh^2 = 1) and mixes
                 both imaginary parts into one drawn coordinate with a free angle a,
                 so it cannot be checked against the defining equation z1^n + z2^n = 1
                 this family is specified by (and it is a different drawing: tubes over
                 a square, not a surface over the disk).  This file therefore uses the
                 disk parametrisation, which is exactly the equation verify() checks:
                     w = 1 - z1^n,  z2 = |w|^(1/n) e^{i arg(w)/n}   (principal branch).
                 Branch seam: z2 is the principal n-th root, so Im z2 flips sign where
                 1 - z1^n crosses the negative real axis (theta = 2 k pi / n with
                 rho^n > 1).  Re z2 = |w|^(1/n) cos(arg(w)/n) is even in arg(w), and
                 arg(w) is a function of z1 alone, so the plotted 3d surface has no seam
                 at all — only the dropped fourth coordinate jumps there.

   moebius       the Moebius strip, f(u,v) as in Knill's page with t odd (t odd is what
                 makes the band close with a flip); twists is forced to the nearest odd
                 integer so the closure identity can never be broken from the UI.

   klein         the figure-8 immersion of the Klein bottle (standard textbook form),
                 both parameters closed, scale multiplies the figure-8 cross-section
                 only (not the radius a).

   superquadric  the superellipsoid.  Exponent convention used here, matching the
                 formula in this file and in verify(): e1 is the exponent of eta and e2
                 the exponent of omega, so the implicit form is
                     (|x/a|^(2/e2) + |y/b|^(2/e2))^(e2/e1) + |z/c|^(2/e1) = 1.

   flattorus     Knill's flat/superelliptic torus: revolve the superellipse of exponent
                 n (n = 2 round, large n square).  r is clamped to < R internally.

   Plain classic script, no dependencies, deterministic; geometry is built by
   GEOM.surface() (see work/lab/CONTRACT.md). */

(function () {
  const TAU = Math.PI * 2, PI = Math.PI;

  /* sgn(0) = +1, the same convention as geom.js sign() — needed by the signed
     powers below (Math.sign(0) would zero the coordinate at omega = pi/2). */
  const sgnp = x => (x < 0 ? -1 : 1);
  const iIn = (v, lo, hi) => Math.max(lo, Math.min(hi, Math.round(v)));
  const lin = (a, b, n) => { const o = []; for (let i = 0; i <= n; i++) o.push(a + (b - a) * i / n); return o; };
  const e2s = x => x.toExponential(2);

  /* z1^n by repeated multiplication (n <= 16, exact enough and branch-free) */
  function cpow(zr, zi, n) {
    let rr = 1, ii = 0;
    for (let k = 0; k < n; k++) { const t = rr * zr - ii * zi; ii = rr * zi + ii * zr; rr = t; }
    return [rr, ii];
  }

  /* ---------- 1. calabiyau ---------- */

  /* [Re z1, Im z1, Re z2, Im z2] at z1 = rho e^{i theta} */
  function cyFull(rho, th, n) {
    const c = rho * Math.cos(th), s = rho * Math.sin(th);
    const z = cpow(c, s, n);
    const dr = 1 - z[0], di = -z[1];                 /* w = 1 - z1^n */
    const m = Math.sqrt(dr * dr + di * di);
    const r = Math.pow(m, 1 / n);                    /* |w|^(1/n) */
    const a = Math.atan2(di, dr) / n;                /* principal arg(w)/n */
    return [c, s, r * Math.cos(a), r * Math.sin(a)];
  }

  function cyFn(P) {
    const n = iIn(P.n, 2, 8), rhoMax = P.rhoMax;
    return function (rho, th) {
      const q = cyFull(rho, th, n);
      return [q[0], q[1], q[2]];
    };
  }

  /* ---------- 2. moebius ---------- */

  function mbFn(P) {
    const t = 2 * Math.round((iIn(P.twists, 1, 5) - 1) / 2) + 1;   /* force odd */
    const h = P.width / 2;
    return function (u, v) {
      const r = 1 + h * v * Math.cos(t * u / 2);
      return [r * Math.cos(u), r * Math.sin(u), h * v * Math.sin(t * u / 2)];
    };
  }

  /* ---------- 3. klein ---------- */

  function klFn(P) {
    const a = P.a, sc = P.scale;
    return function (u, v) {
      const hu = u / 2, sv = Math.sin(v), s2 = Math.sin(2 * v);
      const cs = Math.cos(hu) * sv - Math.sin(hu) * s2;   /* figure-8 radial part */
      const cz = Math.sin(hu) * sv + Math.cos(hu) * s2;   /* figure-8 height part  */
      const R = a + sc * cs;
      return [R * Math.cos(u), R * Math.sin(u), sc * cz];
    };
  }

  /* ---------- 4. superquadric ---------- */

  function sqFn(P) {
    const e1 = P.e1, e2 = P.e2, a = P.a, b = P.b, c = P.c;
    return function (eta, om) {
      const ce = sgnp(Math.cos(eta)) * Math.pow(Math.abs(Math.cos(eta)), e1);
      const se = sgnp(Math.sin(eta)) * Math.pow(Math.abs(Math.sin(eta)), e1);
      const co = sgnp(Math.cos(om)) * Math.pow(Math.abs(Math.cos(om)), e2);
      const so = sgnp(Math.sin(om)) * Math.pow(Math.abs(Math.sin(om)), e2);
      return [a * ce * co, b * ce * so, c * se];
    };
  }

  /* ---------- 5. flattorus ---------- */

  function ftFn(P) {
    const n = iIn(P.n, 2, 16), R = P.R;
    const r = Math.min(P.r, R * 0.999);              /* clamp: r < R */
    const e = 2 / n;
    return function (u, v) {
      const cv = sgnp(Math.cos(v)) * Math.pow(Math.abs(Math.cos(v)), e);
      const sv = sgnp(Math.sin(v)) * Math.pow(Math.abs(Math.sin(v)), e);
      const rad = R + r * cv;
      return [rad * Math.cos(u), rad * Math.sin(u), r * sv];
    };
  }

  const GRIDC = ['plain', 'grid'];  /* select labels for the numeric 0/1 grid switch */

  const defs = [
    /* ---------------------------------------------------------------- */
    {
      id: 'calabiyau',
      name: 'calabi-yau',
      family: 'surface',
      src: 'knill 3dprinter/math/calabiyau.html',
      params: [
        { k: 'n', label: 'n', min: 2, max: 8, step: 1, def: 5, anim: 10 },
        { k: 'rhoMax', label: 'rho max', min: 0.4, max: 1, step: 0.01, def: 0.82 },
        { k: 'nu', label: 'radial steps', min: 24, max: 160, step: 1, def: 96 },
        { k: 'nv', label: 'angular steps', min: 48, max: 320, step: 1, def: 240 },
        { k: 'grid', label: 'grid', min: 0, max: 1, step: 1, def: 1, choices: GRIDC }
      ],
      build: function (P, G) {
        const b = new G.Builder();
        const n = iIn(P.n, 2, 8), rhoMax = P.rhoMax;
        const nu = iIn(P.nu, 24, 200), nv = iIn(P.nv, 48, 400);
        const f = cyFn(P);
        G.surface(b, (u, v) => f(u * rhoMax, v * TAU), nu, nv, {
          uLines: P.grid ? 8 : 0, vLines: P.grid ? 16 : 0, vClosed: true
        });
        return b.out({ uSteps: nu, vSteps: nv, quads: nu * nv, n: n });
      },
      verify: function (P, out) {
        const n = iIn(P.n, 2, 8), rhoMax = P.rhoMax;
        const nu = iIn(P.nu, 24, 200), nv = iIn(P.nv, 48, 400);
        /* (a) the emitted vertices: z1 = (x,y) recovered from the tile, z2 = the
           emitted Re z2 plus the Im z2 the projection dropped (principal branch) */
        const T = out.tris;
        let emax = 0, proj = 0, nv_ = 0;
        for (let i = 0; i + 2 < T.length; i += 3) {
          const c = T[i], s = T[i + 1], zr = T[i + 2];
          const z = cpow(c, s, n);
          const dr = 1 - z[0], di = -z[1];
          const m = Math.sqrt(dr * dr + di * di);
          const r = Math.pow(m, 1 / n), a = Math.atan2(di, dr) / n;
          proj = Math.max(proj, Math.abs(r * Math.cos(a) - zr));
          const z2 = cpow(zr, r * Math.sin(a), n);          /* emitted Re z2 + implied Im z2 */
          const rr = z[0] + z2[0] - 1, ii = z[1] + z2[1];
          const d = Math.sqrt(rr * rr + ii * ii);
          if (d > emax) emax = d;
          nv_++;
        }
        /* (b) the same equation over the (rho,theta) grid in double precision */
        let dmax = 0;
        for (let i = 0; i <= nu; i++) {
          const rho = rhoMax * i / nu;
          for (let j = 0; j < nv; j++) {
            const q = cyFull(rho, TAU * j / nv, n);
            const z1 = cpow(q[0], q[1], n), z2 = cpow(q[2], q[3], n);
            const rr = z1[0] + z2[0] - 1, ii = z1[1] + z2[1];
            const d = Math.sqrt(rr * rr + ii * ii);
            if (d > dmax) dmax = d;
          }
        }
        return 'max |z1^n + z2^n - 1| = ' + e2s(emax) + ' over ' + nv_ + ' emitted vertices ' +
          '(complex residual: z1 = emitted (x,y), Re z2 = the emitted z, Im z2 = the principal-branch ' +
          'value the projection drops; only float32 storage of the vertices contributes, ' +
          'max |Re z2 - emitted z| = ' + e2s(proj) + '); ' +
          'the same equation over the ' + (nu + 1) * nv + '-point (rho,theta) grid in double = ' + e2s(dmax);
      }
    },

    /* ---------------------------------------------------------------- */
    {
      id: 'moebius',
      name: 'moebius',
      family: 'surface',
      src: 'knill 3dprinter/math/moebius.html',
      params: [
        { k: 'twists', label: 'twists', min: 1, max: 5, step: 2, def: 1, anim: 9 },
        { k: 'width', label: 'width', min: 0.2, max: 2.4, step: 0.01, def: 1 },
        { k: 'nu', label: 'along steps', min: 24, max: 200, step: 1, def: 96 },
        { k: 'nv', label: 'across steps', min: 2, max: 40, step: 1, def: 8 },
        { k: 'grid', label: 'grid', min: 0, max: 1, step: 1, def: 1, choices: GRIDC }
      ],
      build: function (P, G) {
        const b = new G.Builder();
        const nu = iIn(P.nu, 24, 200), nv = iIn(P.nv, 2, 40);
        const f = mbFn(P);
        G.surface(b, (u, v) => f(u * TAU, -1 + 2 * v), nu, nv, {
          uLines: P.grid ? 16 : 0, vLines: P.grid ? 8 : 0, uClosed: true
        });
        return b.out({ uSteps: nu, vSteps: nv, quads: nu * nv });
      },
      verify: function (P, out) {
        const f = mbFn(P);
        /* the band closes with a flip: f(2pi,v) = f(0,-v) */
        let cerr = 0;
        const vs = lin(-1, 1, 200);
        for (const v of vs) {
          const p = f(TAU, v), q = f(0, -v);
          cerr = Math.max(cerr, Math.abs(p[0] - q[0]), Math.abs(p[1] - q[1]), Math.abs(p[2] - q[2]));
        }
        /* non-orientable: the normal at (0, 0.5) and at (2pi, -0.5) (the same
           spatial point, reached with the flipped v) are opposite */
        const h = 1e-5;
        const nrm = (u, v) => {
          const du = [(f(u + h, v)[0] - f(u - h, v)[0]) / (2 * h), (f(u + h, v)[1] - f(u - h, v)[1]) / (2 * h), (f(u + h, v)[2] - f(u - h, v)[2]) / (2 * h)];
          const dv = [(f(u, v + h)[0] - f(u, v - h)[0]) / (2 * h), (f(u, v + h)[1] - f(u, v - h)[1]) / (2 * h), (f(u, v + h)[2] - f(u, v - h)[2]) / (2 * h)];
          const c = [du[1] * dv[2] - du[2] * dv[1], du[2] * dv[0] - du[0] * dv[2], du[0] * dv[1] - du[1] * dv[0]];
          const L = Math.sqrt(c[0] * c[0] + c[1] * c[1] + c[2] * c[2]) || 1;
          return [c[0] / L, c[1] / L, c[2] / L];
        };
        const n1 = nrm(0, 0.5), n2 = nrm(TAU, -0.5);
        const dp = n1[0] * n2[0] + n1[1] * n2[1] + n1[2] * n2[2];
        return 'closure max |f(2pi,v) - f(0,-v)| = ' + e2s(cerr) + ' over 201 v-samples; ' +
          'non-orientable: n(0,0.5) . n(2pi,-0.5) = ' + dp.toFixed(12) + ' (finite-difference normals, h=1e-5)';
      }
    },

    /* ---------------------------------------------------------------- */
    {
      id: 'klein',
      name: 'klein',
      family: 'surface',
      src: 'standard',
      params: [
        { k: 'a', label: 'a', min: 1, max: 3, step: 0.01, def: 2 },
        { k: 'scale', label: 'cross-section', min: 0.2, max: 2, step: 0.01, def: 1 },
        { k: 'nu', label: 'u steps', min: 24, max: 200, step: 1, def: 96 },
        { k: 'nv', label: 'v steps', min: 12, max: 80, step: 1, def: 32 },
        { k: 'grid', label: 'grid', min: 0, max: 1, step: 1, def: 1, choices: GRIDC }
      ],
      build: function (P, G) {
        const b = new G.Builder();
        const nu = iIn(P.nu, 24, 200), nv = iIn(P.nv, 12, 80);
        const f = klFn(P);
        G.surface(b, (u, v) => f(u * TAU, v * TAU), nu, nv, {
          uLines: P.grid ? 24 : 0, vLines: P.grid ? 12 : 0, uClosed: true, vClosed: true
        });
        return b.out({ uSteps: nu, vSteps: nv, quads: nu * nv });
      },
      verify: function (P, out) {
        const T = out.tris;
        const key = i => Math.round(T[i] * 1e4) + ' ' + Math.round(T[i + 1] * 1e4) + ' ' + Math.round(T[i + 2] * 1e4);
        const map = new Map();
        for (let t = 0; t + 8 < T.length; t += 9) {
          const k0 = key(t), k1 = key(t + 3), k2 = key(t + 6);
          const E = [[k0, k1], [k1, k2], [k2, k0]];
          for (const e of E) {
            const s = e[0] < e[1] ? e[0] + '|' + e[1] : e[1] + '|' + e[0];
            map.set(s, (map.get(s) || 0) + 1);
          }
        }
        let odd = 0, quad = 0;
        for (const c of map.values()) { if (c % 2) odd++; if (c === 4) quad++; }
        return 'closed: ' + map.size + ' coordinate edges, ' + odd + ' of odd incidence (boundary edges; must be 0), ' +
          quad + ' shared 4x — the figure-8 cross-section pinches to its crossing point at v = 0 and v = pi, ' +
          'so those two grid rings are the same circle of ' + iIn(P.nu, 24, 200) + ' points';
      }
    },

    /* ---------------------------------------------------------------- */
    {
      id: 'superquadric',
      name: 'superquadric',
      family: 'surface',
      src: 'standard',
      params: [
        { k: 'e1', label: 'e1 (eta)', min: 0.1, max: 4, step: 0.01, def: 0.5, anim: 13 },
        { k: 'e2', label: 'e2 (omega)', min: 0.1, max: 4, step: 0.01, def: 0.5 },
        { k: 'a', label: 'a', min: 0.2, max: 2, step: 0.01, def: 1 },
        { k: 'b', label: 'b', min: 0.2, max: 2, step: 0.01, def: 1 },
        { k: 'c', label: 'c', min: 0.2, max: 2, step: 0.01, def: 1 },
        { k: 'nu', label: 'eta steps', min: 12, max: 120, step: 1, def: 48 },
        { k: 'nv', label: 'omega steps', min: 24, max: 240, step: 1, def: 96 },
        { k: 'grid', label: 'grid', min: 0, max: 1, step: 1, def: 1, choices: GRIDC }
      ],
      build: function (P, G) {
        const b = new G.Builder();
        const nu = iIn(P.nu, 12, 120), nv = iIn(P.nv, 24, 240);
        const f = sqFn(P);
        G.surface(b, (u, v) => f(-PI / 2 + u * PI, v * TAU), nu, nv, {
          uLines: P.grid ? 12 : 0, vLines: P.grid ? 24 : 0, vClosed: true
        });
        return b.out({ uSteps: nu, vSteps: nv, quads: nu * nv });
      },
      verify: function (P, out) {
        const e1 = P.e1, e2 = P.e2, a = P.a, b = P.b, c = P.c;
        const p1 = 2 / e2, p2 = e2 / e1, p3 = 2 / e1;
        const T = out.tris;
        let dmax = 0, cnt = 0;
        for (let i = 0; i + 2 < T.length; i += 3) {
          const xa = Math.pow(Math.abs(T[i] / a), p1);
          const yb = Math.pow(Math.abs(T[i + 1] / b), p1);
          const v = Math.pow(xa + yb, p2) + Math.pow(Math.abs(T[i + 2] / c), p3);
          const d = Math.abs(v - 1);
          if (d > dmax) dmax = d;
          cnt++;
        }
        return 'max |(|x/a|^(2/e2) + |y/b|^(2/e2))^(e2/e1) + |z/c|^(2/e1) - 1| = ' + e2s(dmax) +
          ' over ' + cnt + ' emitted vertices (e1 on eta, e2 on omega; the only error is the float32 ' +
          'rounding of the stored vertices, amplified by the exponents)';
      }
    },

    /* ---------------------------------------------------------------- */
    {
      id: 'flattorus',
      name: 'flat torus',
      family: 'surface',
      src: 'knill 3dprinter/math/flattorus.html',
      params: [
        { k: 'n', label: 'n', min: 2, max: 16, step: 1, def: 6, anim: 12 },
        { k: 'R', label: 'R', min: 1, max: 3, step: 0.01, def: 2 },
        { k: 'r', label: 'r', min: 0.1, max: 3, step: 0.01, def: 0.6 },
        { k: 'nu', label: 'u steps', min: 24, max: 200, step: 1, def: 96 },
        { k: 'nv', label: 'v steps', min: 12, max: 120, step: 1, def: 48 },
        { k: 'grid', label: 'grid', min: 0, max: 1, step: 1, def: 1, choices: GRIDC }
      ],
      build: function (P, G) {
        const b = new G.Builder();
        const nu = iIn(P.nu, 24, 200), nv = iIn(P.nv, 12, 120);
        const f = ftFn(P);
        G.surface(b, (u, v) => f(u * TAU, v * TAU), nu, nv, {
          uLines: P.grid ? 16 : 0, vLines: P.grid ? 24 : 0, uClosed: true, vClosed: true
        });
        return b.out({ uSteps: nu, vSteps: nv, quads: nu * nv, rUsed: Math.min(P.r, P.R * 0.999) });
      },
      verify: function (P, out) {
        const n = iIn(P.n, 2, 16), R = P.R;
        const r = Math.min(P.r, R * 0.999);
        const T = out.tris;
        let dmax = 0, cnt = 0;
        for (let i = 0; i + 2 < T.length; i += 3) {
          const rad = Math.sqrt(T[i] * T[i] + T[i + 1] * T[i + 1]);
          const cc = Math.abs(rad - R) / r, ss = Math.abs(T[i + 2]) / r;
          const d = Math.abs(Math.pow(cc, n) + Math.pow(ss, n) - 1);
          if (d > dmax) dmax = d;
          cnt++;
        }
        return 'max |(|c|/r)^n + (|s|/r)^n - 1| = ' + e2s(dmax) + ' over ' + cnt +
          ' emitted vertices, c = sqrt(x^2+y^2) - R, s = z, r = ' + r +
          (r < P.r ? ' (clamped from ' + P.r + ')' : '') +
          '; the only error is the float32 rounding of the stored vertices, amplified by n';
      }
    }
  ];

  if (typeof SHAPES3D !== 'undefined') defs.forEach(d => SHAPES3D.define(d));
  if (typeof module !== 'undefined' && module.exports) module.exports = defs;
})();
