/* dome.js — the dome's geometry.

   A domemaster is the projector's own image: a disc whose centre is the zenith and whose rim is
   the horizon, radius linear in the angle from the zenith.

   It is not a map of the dome seen from above. A projector at the centre throws its plate outward,
   so the master is the dome as a viewer lying at the centre sees it with their head toward the top
   of the disc: the back (az 180) at the top, the front (az 0) at the bottom, and east — the head
   being to the back — on the reader's left. Master coordinates are (u, v) in the unit disc,
   right = west (az 270), up = back (az 180). Drawn the other way round the master still looks
   right and the dome comes out mirrored, which is why every frame in here is named and checked.

   An element is a flat card tangent to the sphere at (az, el): the dome shows a head-on view of
   it, so its edges stay straight on the dome and its text reads as text. The card's up points at
   the zenith, and its right is up x n — the right hand of the viewer standing at the centre
   reading it. That is the handedness the texture is drawn in.

   Loaded as `dome` in the browser and `require()`d by work/lab/check_dome.cjs, so the check runs
   the code the page runs. */
(function (root, factory) {
  var api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.dome = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  var D = Math.PI / 180;
  var FOV = 180;                    // degrees across the master's diameter: the horizon on the rim
  var FONT = 96;                    // a text card's texture: px per em
  var SUB = 6;                      // cells per side in a card's mesh
  var ZEN = [0, 1, 0], RIGHT = [1, 0, 0], BACK = [0, 0, 1];

  function dir(az, el) {
    var a = az * D, e = el * D, ce = Math.cos(e);
    return [Math.sin(a) * ce, Math.sin(e), -Math.cos(a) * ce];
  }
  function len(v) { return Math.sqrt(v[0] * v[0] + v[1] * v[1] + v[2] * v[2]); }
  function norm(v) { var l = len(v) || 1e-12; return [v[0] / l, v[1] / l, v[2] / l]; }
  function dot(a, b) { return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]; }
  function cross(a, b) {
    return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
  }
  function mixv(a, b, t) { return [a[0] + b[0] * t, a[1] + b[1] * t, a[2] + b[2] * t]; }

  /* master <-> direction. u runs west and v runs back: the disc is the projector's plate, and the
     plate is the mirror of a plan of the dome. */
  function toMaster(d, fov) {
    var th = Math.acos(Math.max(-1, Math.min(1, d[1])));
    var r = th / ((fov || FOV) * D / 2);
    var m = Math.sqrt(d[0] * d[0] + d[2] * d[2]);
    if (m < 1e-9) return [0, 0];
    return [-r * d[0] / m, r * d[2] / m];
  }
  function fromMaster(u, v, fov) {
    var r = Math.sqrt(u * u + v * v), th = r * (fov || FOV) * D / 2;
    if (r < 1e-9) return [0, 1, 0];
    var s = Math.sin(th);
    return [-s * u / r, Math.cos(th), s * v / r];
  }
  /* A point outside the master's circle comes back to the rim along its own azimuth, so a drag
     that leaves the dome keeps tracking the horizon instead of stopping dead at the edge. */
  function disc(u, v) {
    var r = Math.sqrt(u * u + v * v);
    return r > 1 ? [u / r, v / r] : [u, v];
  }

  /* A card's frame at (az, el): normal to the sphere, up toward the zenith, and right = up x n —
     the right hand of the viewer standing at the centre facing the card. The texture is drawn
     along that right, so this sign is what decides whether the dome reads a card or mirrors it. */
  function basis(az, el) { return basisOf(dir(az, el)); }
  function basisOf(d, rot) {
    var n = norm(d);
    var up = [ZEN[0] - n[0] * n[1], ZEN[1] - n[1] * n[1], ZEN[2] - n[2] * n[1]];
    if (len(up) < 1e-6) up = [0, 0, 1];            // at the zenith the zenith is no direction
    up = norm(up);
    var right = norm(cross(up, n));
    if (rot) {                                     // turned in its own plane
      var a = rot * D, c = Math.cos(a), s = Math.sin(a);
      var r2 = [right[0] * c + up[0] * s, right[1] * c + up[1] * s, right[2] * c + up[2] * s];
      up = [-right[0] * s + up[0] * c, -right[1] * s + up[1] * c, -right[2] * s + up[2] * c];
      right = r2;
    }
    return { n: n, right: norm(right), up: norm(up) };
  }

  /* Place a card so the corner it draws at (-sx, -sy) lands on the anchor direction A: the
     opposite edge holds still while the card is resized. The drawn corner is the tangent-plane
     rectangle at the card's centre, which is not the rectangle at the anchor, so the centre is
     solved for rather than composed — two Newton passes on its tangent coordinates. */
  function anchored(A, rot, sx, sy, tw, th) {
    var fA = basisOf(A, rot), p = (sx || 0) * tw, q = (sy || 0) * th;
    function corner(pp, qq) {
      var C = norm(mixv(mixv(A, fA.right, pp), fA.up, qq));
      var f = basisOf(C, rot);
      return { C: C, K: norm(mixv(mixv(C, f.right, -(sx || 0) * tw), f.up, -(sy || 0) * th)) };
    }
    function tan(v) {                                  // the error lies in the plane tangent at A
      return [dot(v, fA.right), dot(v, fA.up)];
    }
    for (var k = 0; k < 4; k++) {
      var K = corner(p, q).K;
      var e = tan([K[0] - A[0], K[1] - A[1], K[2] - A[2]]);
      if (Math.abs(e[0]) + Math.abs(e[1]) < 1e-14) break;
      var h = 1e-6;
      var dP = tan((function (a) { return [a[0] - K[0], a[1] - K[1], a[2] - K[2]]; })(corner(p + h, q).K));
      var dQ = tan((function (a) { return [a[0] - K[0], a[1] - K[1], a[2] - K[2]]; })(corner(p, q + h).K));
      var det = (dP[0] / h) * (dQ[1] / h) - (dP[1] / h) * (dQ[0] / h);
      if (Math.abs(det) < 1e-12) break;
      var dp = ((e[0] * (dQ[1] / h)) - (e[1] * (dQ[0] / h))) / det;
      var dq = (((dP[0] / h) * e[1]) - ((dP[1] / h) * e[0])) / det;
      p -= dp; q -= dq;
    }
    return norm(mixv(mixv(A, fA.right, p), fA.up, q));
  }

  /* the card's size in degrees. Text and images carry their aspect; a rect is told both sides. */
  function sizeOf(el, tex) {
    if (el.kind === "rect") return { w: el.w, h: el.h };
    if (!tex || !tex.w || !tex.h) return { w: el.w || 10, h: el.h || 10 };
    var a = tex.w / tex.h;
    if (el.kind === "text") { var h = el.size * tex.h / FONT; return { w: h * a, h: h }; }
    return { w: el.w, h: el.w / a };
  }

  /* the frame a card is drawn with: the basis at (az, el), turned in its own plane by rot. Every
     user of a card frame comes through here — the shader, the handles, the hit test and the drag —
     so a turned card cannot be operated on in the frame it would have had unturned. */
  function frameOf(az, el, rot) { return basisOf(dir(az, el), rot); }

  /* what the shader takes: the frame plus the tangent-plane half extents */
  function matrix(el, tex) {
    var f = sizeOf(el, tex), b = frameOf(el.az, el.el, el.rot);
    return { n: b.n, right: b.right, up: b.up,
             tanW: Math.tan(f.w * D / 2), tanH: Math.tan(f.h * D / 2), w: f.w, h: f.h };
  }

  /* a point on the card: gx, gy in -1..1 across the card */
  function point(m, gx, gy) {
    return norm(mixv(mixv(m.n, m.right, gx * m.tanW), m.up, gy * m.tanH));
  }

  /* the card's outline in master coordinates: a polyline of n points an edge */
  function outline(m, n, fov) {
    n = n || 10;
    var e = [[-1, -1], [1, -1], [1, 1], [-1, 1]], out = [];
    for (var i = 0; i < 4; i++) {
      var a = e[i], b = e[(i + 1) % 4];
      for (var k = 0; k < n; k++) {
        var t = k / n;
        out.push(toMaster(point(m, a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t), fov));
      }
    }
    out.push(out[0]);
    return out;
  }

  /* is a direction over the card, and where on it (gnomonic, the shader's own inverse) */
  function locate(m, d) {
    var t = dot(d, m.n);
    if (t <= 1e-4) return null;
    return { x: dot(d, m.right) / t, y: dot(d, m.up) / t, t: t };
  }
  function inside(m, d) {
    var p = locate(m, d);
    return !!p && Math.abs(p.x) <= m.tanW && Math.abs(p.y) <= m.tanH;
  }
  /* the topmost card under a direction; cards come in draw order */
  function pick(list, d, texOf) {
    for (var i = list.length - 1; i >= 0; i--) {
      if (inside(matrix(list[i], texOf(list[i])), d)) return list[i];
    }
    return null;
  }

  /* Where the direction d sits on a card standing at (az, el) with its turn in: the card-local
     coordinates in tangent units, or null when d is behind the card. The drag solve minimises the
     distance from this to the point the hand grabbed, and the editor uses it to tell whether a
     solve has improved on where the card already stands. */
  function grab(d, az, el, rot) {
    var f = frameOf(az, el, rot), t = dot(d, f.n);
    if (t <= 1e-4) return null;
    return { x: dot(d, f.right) / t, y: dot(d, f.up) / t };
  }

  /* The centre a card needs so the direction d sits at the card-local (x0, y0): the point the
     hand grabbed stays under the pointer while the card is dragged. Solved, because the tangent
     plane at the new centre is not the one the offset was measured in.

     Damped Newton, and the best iterate is what comes back. A plain Newton step overshoots when
     the hand moves a long way in one event; with four fixed iterations and no test on the result,
     the overshoot was itself the answer — a card thrown to the far side of the dome, which is what
     a fast drag near the rim looked like on screen. Here the step is halved until the residual
     falls, the loop ends when it converges, and a solve that cannot improve on the seed leaves the
     seed standing. `rot` is the card's own turn: the frame the hand grabbed in is the frame the
     card is drawn with.

     A seed near the middle of the disc is a hard place to solve from, and not because of the code:
     the master's azimuth at radius zero covers no distance, so a hand there asks for an unbounded
     turn about the zenith. The seed's elevation is held a degree off the pole, and the answer is
     approximate there — a card above el 84 is placed by its numbers, not by the hand. */
  function follow(x0, y0, d, az, el, rot) {
    el = Math.max(-88, Math.min(88, el));
    function err(a, e2) {
      var g = grab(d, a, e2, rot);
      return g ? [g.x - x0, g.y - y0] : null;
    }
    function res(a, e2) { var e0 = err(a, e2); return e0 ? e0[0] * e0[0] + e0[1] * e0[1] : Infinity; }
    var r0 = res(az, el), best = [az, el], bestR = r0;
    for (var k = 0; k < 24 && r0 > 1e-20; k++) {
      var e0 = err(az, el);
      if (!e0) break;
      var h = 1e-4, ea = err(az + h, el), eb = err(az, el + h);
      if (!ea || !eb) break;
      var j00 = (ea[0] - e0[0]) / h, j10 = (ea[1] - e0[1]) / h,
          j01 = (eb[0] - e0[0]) / h, j11 = (eb[1] - e0[1]) / h;
      var det = j00 * j11 - j01 * j10;
      if (Math.abs(det) < 1e-12) break;
      var da = -(e0[0] * j11 - e0[1] * j01) / det, de = -(-e0[0] * j10 + e0[1] * j00) / det;
      var step = 1, took = false;
      for (var s = 0; s < 16; s++) {
        var na = az + da * step, ne = Math.max(-89, Math.min(89, el + de * step));
        var rn = res(na, ne);
        if (rn < r0) { az = na; el = ne; r0 = rn; took = true; break; }
        step *= 0.5;                                 // this step climbs: try a shorter one
      }
      if (!took) break;                              // no shorter step climbs either: stop here
      if (r0 < bestR) { bestR = r0; best = [az, el]; }
    }
    return best;
  }

  /* Which way a positive turn about the card's own axis reads on the master: +1 when it turns the
     way the canvas' angle grows. Measured, so the rotate handle follows the pointer wherever the
     card stands instead of relying on a handedness argument. */
  function turnSense(az, el) {
    function up2(rot) {
      var m = matrix({ kind: "rect", az: az, el: el, w: 10, h: 10, rot: rot });
      var c = toMaster(m.n), t = toMaster(point(m, 0, 1));
      return [t[0] - c[0], -(t[1] - c[1])];
    }
    var a = up2(0), b = up2(7);
    return a[0] * b[1] - a[1] * b[0] > 0 ? 1 : -1;
  }

  /* the unit grid a card's mesh is built from */
  function grid(sub) {
    sub = sub || SUB;
    var v = new Float32Array((sub + 1) * (sub + 1) * 2), ix = [];
    for (var j = 0; j <= sub; j++) for (var i = 0; i <= sub; i++) {
      var k = (j * (sub + 1) + i) * 2;
      v[k] = i / sub * 2 - 1; v[k + 1] = j / sub * 2 - 1;
    }
    for (var y = 0; y < sub; y++) for (var x = 0; x < sub; x++) {
      var a = y * (sub + 1) + x, b = a + 1, c = a + sub + 1, d2 = c + 1;
      ix.push(a, c, b, b, c, d2);
    }
    return { verts: v, idx: new Uint16Array(ix) };
  }

  /* a direction back to where it stands: az 0 at the front, el above the horizon */
  function azEl(d) {
    var el = Math.asin(Math.max(-1, Math.min(1, d[1]))) / D;
    return [Math.atan2(d[0], -d[2]) / D, el];
  }

  /* which part of the dome a card stands on, in words, by compass rather than by where it lands on
     the master — east is the dome's right side and the master's left. At az +-90 the same text
     reads sideways, because there the zenith is to the reader's left or right. */
  function azName(az) {
    var a = ((az % 360) + 360) % 360;
    if (a < 45 || a >= 315) return "front";
    if (a < 135) return "east side";
    if (a < 225) return "back";
    return "west side";
  }

  return { D: D, FOV: FOV, FONT: FONT, SUB: SUB,
           dir: dir, norm: norm, dot: dot, cross: cross, len: len, mixv: mixv,
           toMaster: toMaster, fromMaster: fromMaster, disc: disc, grab: grab,
           basis: basis, basisOf: basisOf, frameOf: frameOf, anchored: anchored,
           sizeOf: sizeOf,
           matrix: matrix, point: point, outline: outline, locate: locate, inside: inside,
           pick: pick, grid: grid, azName: azName, azEl: azEl,
           follow: follow, turnSense: turnSense };
});
