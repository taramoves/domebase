/* solid.js — the room in three dimensions: the dome's own numbers and the floor's items as solids,
   and the camera that reads them.

   World: x east, y back, z up, in metres — the frame the plan is drawn in, stood up. The floor is
   the disc of radius R at z = 0; the dome is the hemisphere of radius R whose centre sits at
   (0, 0, wall), so `wall` is the cylinder the screen springs from; the panel rings, the speakers,
   the projectors and the exits all come off the master's state.

   `deg` is the screen's own span across the room, 180 by default. The floor, the wall and the plan's
   frame are the same whatever it says — a screen past a hemisphere keeps its base and its wall and
   is a larger sphere, so it springs from the wall's top, widens past it (by R/sin(deg/2) - R at the
   horizon) and the horizon sits R/tan(deg/2) above the wall's top. Only the readings of the master
   move; the room does not.

   A master radius of r% is read two ways and the page carries the switch. `dome` puts the ring at
   r% of the angle from the zenith, which is the frame this page's own test pattern is drawn in;
   `plan` puts it at the horizontal radius r% of R, which is what a plan seen from above shows.

   scene() returns solids, project() returns screen coordinates, and painter's rule is the page's:
   the floor is ground and is drawn first — nothing above the plane can be behind it — and
   everything else is drawn far to near. No dependencies, no DOM, so work/lab/check_floor.cjs can
   check the maths without a browser. */
(function (root, factory) {
  var api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.solid = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  var D = Math.PI / 180, TAU = Math.PI * 2;
  var GREY = "#c9c9c9", INK = "#000", PAPER = "#fff", FILL = "#efefef";

  function sub(a, b) { return [a[0] - b[0], a[1] - b[1], a[2] - b[2]]; }
  function addv(a, b) { return [a[0] + b[0], a[1] + b[1], a[2] + b[2]]; }
  function mul(a, k) { return [a[0] * k, a[1] * k, a[2] * k]; }
  function dot(a, b) { return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]; }
  function cross(a, b) {
    return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
  }
  function len(a) { return Math.sqrt(dot(a, a)); }
  function unit(a) { var l = len(a) || 1e-12; return [a[0] / l, a[1] / l, a[2] / l]; }

  /* Where a master reading sits on the screen. `deg` is the screen's own span, measured across the
     room: 180 is the hemisphere above, and a deeper screen keeps the base and the wall it has, so it
     is a larger sphere — radius R / sin(deg/2), its centre R / tan(deg/2) above the wall's top for a
     screen past a hemisphere and that far below it for a shallower one. The master's 100% is the
     screen's edge read in `dome` and the wall's radius read in `plan`; both land on the wall either
     way. The horizon stops being the rim: it is the latitude partway up, above the wall's top by
     R / tan(deg/2), which is what a 210 degree screen shows. */
  function sph(az, pct, map, R, wall, deg) {
    var p = Math.max(0, Math.min(100, pct)) / 100;
    var h = (deg || 180) / 2 * D, s = Math.sin(h), c = Math.cos(h);
    var Rs = R / (s || 1e-12), zc = (wall || 0) - Rs * c;
    /* The plan reading wants the point at that horizontal radius. A screen past a hemisphere has two
       of them, one above the horizon and one below; the lower one is on the screen only where the
       screen comes back in toward its edge, and that is the one a plan means. At a hemisphere the
       two meet at the rim, so this is the reading the page always had. */
    var up = Math.asin(Math.min(1, p * s)), dn = Math.PI - up;
    var t = map === "plan" ? (dn <= h ? dn : up) : p * h;
    var a = az * D, sn = Math.sin(t);
    return [Rs * sn * Math.sin(a), Rs * sn * Math.cos(a), zc + Rs * Math.cos(t)];
  }
  function rim(az, R, z) { var a = az * D; return [R * Math.sin(a), R * Math.cos(a), z || 0]; }

  function ringPts(n, R, z, az0) {
    var out = [], i;
    for (i = 0; i <= n; i++) out.push(rim((az0 || 0) + 360 * i / n, R, z));
    return out;
  }
  /* a closed ring read as `n` open arcs, so a ring that wraps the room sorts by depth honestly */
  function arcs(pts, n) {
    var m = pts.length - 1, out = [], k;
    for (k = 0; k < n; k++) {
      var a = Math.floor(k * m / n), b = Math.floor((k + 1) * m / n), seg = [], i;
      for (i = a; i <= b; i++) seg.push(pts[i]);
      if (seg.length > 1) out.push(seg);
    }
    return out;
  }
  function seg(a, b, line, w) { return { k: "l", p: [a, b], line: line || INK, w: w || 0.7 }; }
  function face(pts, fill, line, w) {
    return { k: "p", p: pts, close: 1, fill: fill === undefined ? FILL : fill, line: line === undefined ? INK : line, w: w || 0.7 };
  }
  function open(pts, line, w) { return { k: "p", p: pts, close: 0, fill: null, line: line || INK, w: w || 0.7 }; }

  /* the room's own frame at a point on the dome: n out of the surface, t along the azimuth,
     u down the surface toward the rim */
  function frame(az, pct, map, R, wall, deg) {
    var h = (deg || 180) / 2 * D, Rs = R / (Math.sin(h) || 1e-12);
    var p = sph(az, pct, map, R, wall, deg);
    var n = unit(sub(p, [0, 0, (wall || 0) - Rs * Math.cos(h)]));
    var t = unit([Math.cos(az * D), -Math.sin(az * D), 0]);
    return { p: p, n: n, t: t, u: cross(n, t) };
  }

  /* a flat marker on the dome's surface, w across and h down it, in metres */
  function patchPts(f, w, h) {
    var t = mul(f.t, w / 2), u = mul(f.u, h / 2);
    return [addv(addv(f.p, t), u), sub(addv(f.p, t), u), sub(sub(f.p, t), u), addv(sub(f.p, t), u)];
  }

  /* A tint mixed toward white (k > 0) or black (k < 0). A solid's flank takes its top's own tint
     taken down, and its top takes the tint itself, so one colour per kind of item reads as a
     solid with a lit top and a shaded side without any lighting model. */
  function shade(c, k) {
    var s = String(c), n = /^#/.test(s) ? parseInt(s.slice(1), 16) : NaN;
    if (!(n >= 0)) return c;
    function m(v) { return Math.max(0, Math.min(255, Math.round(k >= 0 ? v + (255 - v) * k : v * (1 + k)))); }
    return "rgb(" + m((n >> 16) & 255) + "," + m((n >> 8) & 255) + "," + m(n & 255) + ")";
  }

  /* a box on the floor from its four footprint corners (west-south, ...), 0 to h; `side` is the
     colour of its flanks and takes the top's colour when it is not given */
  function box(c, h, fill, side) {
    var out = [], i, base = [], top = [], s = side === undefined ? fill : side;
    for (i = 0; i < 4; i++) {
      base.push([c[i][0], c[i][1], 0]);
      top.push([c[i][0], c[i][1], h]);
    }
    for (i = 0; i < 4; i++) {
      var j = (i + 1) % 4;
      out.push(face([base[i], base[j], top[j], top[i]], s));
    }
    out.push(face(top, fill));
    return out;
  }
  /* a cylinder: n sides round a centre, 0 to h */
  function cyl(x, y, r, h, n, fill, side) {
    var out = [], i, base = [], top = [], s = side === undefined ? fill : side;
    for (i = 0; i < n; i++) {
      var a = TAU * i / n;
      base.push([x + r * Math.cos(a), y + r * Math.sin(a), 0]);
      top.push([x + r * Math.cos(a), y + r * Math.sin(a), h]);
    }
    for (i = 0; i < n; i++) {
      var j = (i + 1) % n;
      out.push(face([base[i], base[j], top[j], top[i]], s));
    }
    out.push(face(top, fill));
    return out;
  }

  /* The room. spec carries the master's numbers already read out of the page's state:
     rings (the 12 cumulative ring radii in %), panels (the panel count per band), and the
     speakers, projectors, exits, items and switches. */
  function scene(spec) {
    var R = spec.R, wall = spec.wall || 0, map = spec.map, show = spec.show || {};
    var deg = spec.deg || 180;
    var ground = [], solids = [], labels = [], i, j;
    /* every reading of the master lands on the same screen */
    function at(az, pct) { return sph(az, pct, map, R, wall, deg); }
    function fr(az, pct) { return frame(az, pct, map, R, wall, deg); }

    /* the floor, and the grid ruled on it */
    if (show.floor !== 0) {
      ground.push(face(ringPts(96, R, 0), FILL, INK, 0.9));
      if (show.grid !== 0 && spec.grid > 0) {
        var n = Math.floor(R / spec.grid), k;
        for (k = -n; k <= n; k++) {
          var x = k * spec.grid, y = Math.sqrt(Math.max(0, R * R - x * x));
          if (y < 0.02 || x * x > R * R) continue;
          ground.push(seg([x, -y, 0], [x, y, 0], GREY, 0.6));
          ground.push(seg([-y, x, 0], [y, x, 0], GREY, 0.6));
        }
      }
    }

    /* the wall the screen springs from */
    if (wall > 0.02 && show.walls !== 0) {
      for (i = 0; i < 24; i++) solids.push(seg(rim(i * 15, R, 0), rim(i * 15, R, wall), INK, 0.6));
    }

    /* the panels: the rings, and each band's own seams between its two rings */
    var rings = spec.rings || [], panels = spec.panels || [];
    if (show.dome !== 0) {
      for (i = 1; i < rings.length; i++) {
        var pts = [], steps = 96;
        for (j = 0; j <= steps; j++) pts.push(at(360 * j / steps, rings[i]));
        arcs(pts, 8).forEach(function (a) { solids.push(open(a, INK, 0.6)); });
      }
      if (show.seams !== 0) {
        for (i = 1; i < rings.length; i++) {
          var cnt = Math.round(panels[i - 1] || 0);
          if (cnt < 2) continue;
          for (j = 0; j < cnt; j++) {
            var az = 360 * j / cnt, az2 = 360 * ((j + 1) % cnt) / cnt;
            solids.push(seg(at(az, rings[i - 1]), at(az, rings[i]), INK, 0.5));
            /* A panel cut in two shows its cut: a cell across, from one ring to the next, the
               direction turning with the band so the bands read as triangles. */
            if (spec.shape === "tri") solids.push(i % 2
              ? seg(at(az, rings[i - 1]), at(az2, rings[i]), INK, 0.4)
              : seg(at(az, rings[i]), at(az2, rings[i - 1]), INK, 0.4));
          }
        }
      }
    }

    /* the speakers of the master: a patch on the surface, its own size in % of the radius,
       LFE filled where the resting speaker is not */
    if (show.speakers !== 0) {
      (spec.speakers || []).forEach(function (s) {
        if (s.hide) return;
        var f = fr(s.az, s.r);
        var w = (s.w || 8) / 100 * R, h = (s.h || 10) / 100 * R;
        solids.push(face(patchPts(f, w, h), s.lfe ? INK : PAPER, INK, 0.8));
      });
    }

    /* the projectors: a cross at each of the master's circles */
    if (show.projectors !== 0) {
      (spec.projectors || []).forEach(function (g) {
        var f = fr(g.az, g.r), k = 0.45;
        solids.push(seg(addv(f.p, mul(f.t, -k)), addv(f.p, mul(f.t, k)), INK, 1));
        solids.push(seg(addv(f.p, mul(f.u, -k)), addv(f.p, mul(f.u, k)), INK, 1));
      });
    }

    /* the exits the master's panels carry */
    if (show.exits !== 0) {
      (spec.exits || []).forEach(function (e) {
        var f = fr(e.az, e.r);
        solids.push(face(patchPts(f, 0.8, 0.6), INK, INK, 0.8));
      });
    }

    /* the floor's own items */
    if (show.items !== 0) {
      (spec.items || []).forEach(function (it) {
        var top = it.fill || PAPER, flank = top === PAPER ? PAPER : shade(top, -0.16);
        var parts = it.round && it.r
          ? cyl(it.x, it.y, it.r, it.h, 12, top, flank)
          : box(it.c, it.h, top, flank);
        parts.forEach(function (p) { solids.push(p); });
        if (show.names !== 0 && it.n) labels.push({ p: [it.x, it.y, it.h + 0.06], text: it.n, kind: "item" });
      });
    }

    /* which way the room faces, on the floor beyond the rim */
    if (show.names !== 0 && show.floor !== 0) {
      [[0, "back"], [90, "east"], [180, "front"], [270, "west"]].forEach(function (a) {
        labels.push({ p: [R * 1.08 * Math.sin(a[0] * D), R * 1.08 * Math.cos(a[0] * D), 0],
                      text: a[1], kind: "edge" });
      });
    }

    return { ground: ground, solids: solids, labels: labels };
  }

  /* the camera: yaw 0 looks from the front (from -y), pitch is how far above the floor it stands,
     dist is in multiples of R, and the vertical field of view is `fov` */
  function camera(o) {
    var R = o.R, pitch = Math.max(-89.9, Math.min(89.9, o.pitch)) * D, yaw = o.yaw * D;
    var t = o.target || [0, 0, R * 0.35];
    var d = o.dist * R;
    var pos = [t[0] + d * Math.sin(yaw) * Math.cos(pitch),
               t[1] - d * Math.cos(yaw) * Math.cos(pitch),
               t[2] + d * Math.sin(pitch)];
    var fwd = unit(sub(t, pos)), right = unit(cross(fwd, [0, 0, 1])), up = cross(right, fwd);
    var k = o.h / 2 / Math.tan((o.fov || 42) * D / 2);
    return {
      pos: pos, fwd: fwd, right: right, up: up, k: k, cx: o.w / 2, cy: o.h / 2,
      at: function (p) {
        var v = sub(p, pos), dep = dot(v, fwd);
        return { x: k * dot(v, right) / dep + (o.w / 2), y: -k * dot(v, up) / dep + (o.h / 2), d: dep };
      }
    };
  }

  /* Screen coordinates, far to near — the order the page paints in. A primitive with a point
     behind the camera is dropped rather than drawn wrong. */
  function project(list, cam) {
    var out = [], i, j;
    for (i = 0; i < list.length; i++) {
      var m = list[i], s = [], sum = 0, bad = false;
      for (j = 0; j < m.p.length; j++) {
        var q = cam.at(m.p[j]);
        if (!(q.d > 0.01)) { bad = true; break; }
        s.push([q.x, q.y]);
        sum += q.d;
      }
      if (bad || !s.length) continue;
      out.push({ k: m.k, s: s, fill: m.fill, line: m.line, w: m.w, close: m.close, d: sum / m.p.length });
    }
    out.sort(function (a, b) { return b.d - a.d; });
    return out;
  }
  /* labels last, on top of the room */
  function projectLabels(list, cam) {
    var out = [];
    list.forEach(function (l) {
      var q = cam.at(l.p);
      if (!(q.d > 0.05)) return;
      out.push({ x: q.x, y: q.y, d: q.d, text: l.text, kind: l.kind });
    });
    out.sort(function (a, b) { return b.d - a.d; });
    return out;
  }

  return { sph: sph, rim: rim, ringPts: ringPts, arcs: arcs, frame: frame, patchPts: patchPts,
           box: box, cyl: cyl, shade: shade, scene: scene, camera: camera, project: project,
           projectLabels: projectLabels, sub: sub, dot: dot, cross: cross, unit: unit, mul: mul };
});
