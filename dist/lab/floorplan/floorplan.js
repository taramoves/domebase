/* floorplan.js — the room's floor: the plan's model, and the maths that moves the items on it.

   The plan shares the dome master's own frame, so the two drawings are two readings of one room.
   x runs east and y runs back — the top of the plan is the back of the house, which is the
   master's azimuth 0 — both in metres from the centre, and the wall is the circle of radius R.
   An item's `w` is its width across its own right hand and `d` its depth front to back, in metres;
   its `rot` is the direction it faces, in degrees clockwise from the back, so a chair turned to
   face the middle of the room sits at rot = its own azimuth + 180.

   Loaded as `floorplan` in the browser and require()d by work/lab/check_floor.cjs, so the check
   runs the code the page runs. No dependencies, no DOM, no drawing. */
(function (root, factory) {
  var api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.floorplan = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  var D = Math.PI / 180, R2D = 180 / Math.PI;
  var MIN = 0.2;                       // the shortest side a resize leaves, in metres
  var TURNOFF = 0.55;                  // the turn handle's distance past the front edge, in metres

  /* The palette: metres, the height the room stands each one up to, `round` for the items that are
     a disc in plan and a cylinder in the room, and `c` the tint that tells one from another. The
     tints are pale on purpose: a filled item reads as its own kind on a white sheet, and the black
     hairline and the names stay legible on top of every one of them. */
  var TYPES = {
    beanbag:   { n: "bean bag",       w: 0.9,  d: 0.9,  h: 0.35, round: 1, c: "#e9dcc0" },
    chair:     { n: "chair",          w: 0.5,  d: 0.55, h: 0.9,             c: "#d7e0e8" },
    table:     { n: "table",          w: 1.4,  d: 0.75, h: 0.75,            c: "#dbe5d3" },
    stage:     { n: "stage",          w: 4,    d: 2,    h: 0.4,             c: "#cbcbcb" },
    foh:       { n: "front of house", w: 2.4,  d: 0.8,  h: 1.05,            c: "#ecd8d4" },
    light:     { n: "light",          w: 0.35, d: 0.35, h: 2.2, round: 1,   c: "#f2e7b6" },
    projector: { n: "projector",      w: 0.7,  d: 0.6,  h: 0.5,             c: "#ded7e8" },
    misc:      { n: "misc",           w: 1,    d: 1,    h: 0.8,             c: "#e4e4e4" }
  };
  var ORDER = ["beanbag", "chair", "table", "stage", "foh", "light", "projector", "misc"];

  /* front-right, back-right, back-left, front-left — the order every handle, corner and outline
     in here uses, so a resize handle's index is the corner's index */
  var CORNERS = [[1, 1], [1, -1], [-1, -1], [-1, 1]];

  function norm360(a) { a = a % 360; return a < 0 ? a + 360 : a; }
  function r3(v) { return Math.round(v * 1000) / 1000; }
  function fin(v) { return typeof v === "number" && isFinite(v); }
  /* The screen's span across the room, in degrees: 180 is a hemisphere. A screen past a hemisphere
     hangs below the horizon; a shallower one stops above it. Anything typed is read to a screen. */
  function degrees(v) { return fin(v) && v >= 60 && v <= 340 ? v : 180; }
  /* How far the dome leans off the room's vertical, in degrees, and the azimuth it leans toward. A
     dome stands at 0; a tilted one is a room like any other, and the number is the room's own. */
  function tiltDeg(v) { return fin(v) ? Math.min(70, Math.max(0, v)) : 0; }

  function def() { return { R: 10, wall: 0, deg: 180, tilt: 0, tiltAz: 0, step: 0.5, next: 1, items: [] }; }

  /* the item's own frame: s its right hand, f the way it faces */
  function axes(it) {
    var r = it.rot * D;
    return { s: [Math.cos(r), -Math.sin(r)], f: [Math.sin(r), Math.cos(r)] };
  }
  /* metres <-> the item's own frame, u across and v forward */
  function local(it, x, y) {
    var a = axes(it), dx = x - it.x, dy = y - it.y;
    return [dx * a.s[0] + dy * a.s[1], dx * a.f[0] + dy * a.f[1]];
  }
  function world(it, u, v) {
    var a = axes(it);
    return [it.x + u * a.s[0] + v * a.f[0], it.y + u * a.s[1] + v * a.f[1]];
  }
  function corners(it) {
    var o = [], i;
    for (i = 0; i < 4; i++) o.push(world(it, CORNERS[i][0] * it.w / 2, CORNERS[i][1] * it.d / 2));
    return o;
  }
  function turnAt(it) { return world(it, 0, it.d / 2 + TURNOFF); }
  function az(it) { return norm360(Math.atan2(it.x, it.y) * R2D); }
  function radius(it) { return Math.hypot(it.x, it.y); }

  /* Inside the wall. Scaling the centre toward the middle by k leaves every corner within
     k*|centre| + |corner - centre| of the middle, and |corner - centre| is the item's own
     half-diagonal — so holding k*|centre| to R minus that half-diagonal provably holds. */
  function clampIn(it, R) {
    var c = corners(it), off = 0, i, r = radius(it), d;
    for (i = 0; i < 4; i++) {
      d = Math.hypot(c[i][0] - it.x, c[i][1] - it.y);
      if (d > off) off = d;
    }
    var allow = Math.max(0, R - off);
    if (r > allow && r > 0) { var k = allow / r; it.x *= k; it.y *= k; }
    return it;
  }

  function add(F, t, x, y) {
    var k = TYPES[t] ? t : "misc", T = TYPES[k];
    var it = { id: F.next++, t: k, x: fin(x) ? x : 0, y: fin(y) ? y : 0, w: T.w, d: T.d, rot: 0 };
    F.items.push(it);
    return clampIn(it, F.R);
  }
  function index(F, id) {
    for (var i = 0; i < F.items.length; i++) if (F.items[i].id === id) return i;
    return -1;
  }
  function byId(F, id) { var i = index(F, id); return i < 0 ? null : F.items[i]; }
  function del(F, id) { var i = index(F, id); if (i >= 0) F.items.splice(i, 1); return i >= 0; }
  function dupe(F, it) {
    var c = add(F, it.t, it.x + 0.6, it.y + 0.6);
    c.w = it.w; c.d = it.d; c.rot = it.rot;
    return clampIn(c, F.R);
  }
  function move(it, x, y, R) { it.x = x; it.y = y; return clampIn(it, R); }
  function turn(it, a) { it.rot = norm360(a); return it; }

  /* A resize from corner `i`, holding the corner opposite it where it was: the pointer is measured
     in the item's own frame from the anchored corner, so the item's sides stay its own sides
     however it is turned. */
  function resize(it, i, x, y) {
    var o = CORNERS[i] || CORNERS[0], su = o[0], sv = o[1], a = axes(it);
    var A = world(it, -su * it.w / 2, -sv * it.d / 2);
    var dx = x - A[0], dy = y - A[1];
    var u = dx * a.s[0] + dy * a.s[1], v = dx * a.f[0] + dy * a.f[1];
    it.w = Math.max(MIN, su * u);
    it.d = Math.max(MIN, sv * v);
    var c = world({ x: A[0], y: A[1], rot: it.rot }, su * it.w / 2, sv * it.d / 2);
    it.x = c[0]; it.y = c[1];
    return it;
  }

  /* n copies evenly round the middle at the item's own radius and in its own turn relative to the
     ring, so a chair that faced the middle still faces it in every copy. */
  function ring(F, it, n, R) {
    var r0 = radius(it), a0 = az(it), out = [], i;
    n = Math.max(2, Math.min(180, Math.round(n) || 2));
    for (i = 1; i < n; i++) {
      var a = a0 + 360 * i / n;
      var c = add(F, it.t, r0 * Math.sin(a * D), r0 * Math.cos(a * D));
      c.w = it.w; c.d = it.d; c.rot = norm360(it.rot + (a - a0));
      clampIn(c, R);
      out.push(c);
    }
    return out;
  }

  /* A bank of seats: where each one sits and which way it faces, in metres. One function, two
     shapes — `arc` rings them round the middle the way a dome's seating is, `row` lays them along
     x the way a flat room's is. `seats` and `rows` are what was asked for; a seat that would not
     fit inside the wall is dropped and counted rather than clamped, because sliding one would
     break the row it is in. `aisles` are the gaps: for `arc`, radial aisles evenly spaced by
     bearing round the middle; for `row`, gaps of the same width between blocks along the row.

     The spacing is edge to edge, so a gap means the air between two seats and not their pitch —
     which is why a count can come back short and say so. */
  function layout(o) {
    var w = o.w, d = o.d, R = o.R, i, k, r;
    var seats = Math.max(1, Math.min(60, Math.round(o.seats) || 1));
    var rows = Math.max(1, Math.min(20, Math.round(o.rows) || 1));
    var seatGap = Math.max(0, o.seatGap || 0), rowGap = Math.max(0, o.rowGap || 0);
    var aisles = Math.max(0, Math.min(4, Math.round(o.aisles) || 0));
    var aisleW = Math.max(0, o.aisleW == null ? 1 : o.aisleW);
    var at = fin(o.at) ? o.at : 0, hd = Math.hypot(w / 2, d / 2);
    var out = [], asked = seats * rows, aisle = 0, outside = 0;
    function rot(a) {
      if (o.facing === "out") return norm360(a);
      if (o.facing === "at") return norm360(at);
      if (o.facing === "b") return norm360(o.bearing || 0);
      return norm360(a + 180);
    }
    function rowRot(y) {
      if (o.facing === "b") return norm360(o.bearing || 0);
      if (o.facing === "at") return norm360(at);
      if (o.facing === "out") return y > 0 ? 0 : 180;
      return y > 0 ? 180 : 0;
    }
    for (r = 0; r < rows; r++) {
      if (o.shape === "row") {
        var y = o.first + r * (d + rowGap);
        if (Math.hypot(0, y) + hd > R) { outside += seats; continue; }
        var nb = aisles + 1, per = [], base = Math.floor(seats / nb), extra = seats % nb, span = 0;
        for (i = 0; i < nb; i++) { per.push(base + (i < extra ? 1 : 0)); span += per[i] * w + (per[i] - 1) * seatGap; }
        span += (nb - 1) * aisleW;
        var x = -span / 2;
        for (i = 0; i < nb; i++) {
          for (k = 0; k < per[i]; k++) {
            var cx = x + w / 2;
            if (Math.hypot(cx, y) + hd > R) outside++;
            else out.push({ x: cx, y: y, rot: rowRot(y) });
            x += w + (k < per[i] - 1 ? seatGap : 0);
          }
          if (i < nb - 1) x += aisleW;
        }
        continue;
      }
      var rad = o.first + r * (d + rowGap);
      if (rad <= 0 || rad + hd > R) { outside += seats; continue; }
      var step = (w + seatGap) / rad * R2D;                  // degrees from one seat to the next
      for (i = 0; i < seats; i++) {
        var a = at + (i - (seats - 1) / 2) * step, hit = false;
        for (k = 0; k < aisles; k++) {
          var b = norm360(at + (o.aisleAt || 0) + 360 * k / aisles);
          var da = Math.abs(((norm360(a) - b + 540) % 360) - 180);      // 0 to 180 apart
          if (da * D * rad < (w + aisleW) / 2) { hit = true; break; }
        }
        if (hit) { aisle++; continue; }
        out.push({ x: rad * Math.sin(a * D), y: rad * Math.cos(a * D), rot: rot(a) });
      }
    }
    return { seats: out, asked: asked, placed: out.length, aisle: aisle, outside: outside,
             dropped: aisle + outside };
  }

  /* what the pointer is on: a handle of the selected item first, then the topmost item */
  function hit(F, x, y, grab, sel) {
    var s = byId(F, sel), i, t;
    if (s) {
      t = turnAt(s);
      if (Math.hypot(t[0] - x, t[1] - y) <= grab) return { it: s, part: "turn" };
      var c = corners(s);
      for (i = 0; i < 4; i++) if (Math.hypot(c[i][0] - x, c[i][1] - y) <= grab) return { it: s, part: "corner", i: i };
    }
    for (i = F.items.length - 1; i >= 0; i--) {
      var it = F.items[i], p = local(it, x, y);
      if (Math.abs(p[0]) <= it.w / 2 + grab * 0.5 && Math.abs(p[1]) <= it.d / 2 + grab * 0.5)
        return { it: it, part: "body" };
    }
    return null;
  }

  function pix(F, box) { return box / 2 / F.R; }
  function m2p(F, x, y, box) { var k = pix(F, box); return [box / 2 + x * k, box / 2 - y * k]; }
  function p2m(F, px, py, box) { var k = pix(F, box); return [(px - box / 2) / k, (box / 2 - py) / k]; }
  function snap(v, step) { return step > 0 ? Math.round(v / step) * step : v; }

  function out(F) {
    return {
      app: "sat-dome-floor", version: 1,
      units: "metres; x east, y back; rot the way an item faces, degrees clockwise from the back",
      floor: {
        R: r3(F.R), wall: r3(F.wall), deg: Math.round(F.deg * 10) / 10, step: r3(F.step),
        tilt: Math.round(F.tilt * 10) / 10, tiltAz: Math.round(norm360(F.tiltAz) * 10) / 10,
        items: F.items.map(function (it) {
          return { t: it.t, x: r3(it.x), y: r3(it.y), w: r3(it.w), d: r3(it.d),
                   rot: Math.round(norm360(it.rot) * 10) / 10 };
        })
      }
    };
  }

  /* A floor from a save, or null when there is nothing readable in it. Ids are handed out fresh:
     the file is the items, not the page's bookkeeping. */
  function load(j) {
    var s = j && (j.floor || j), F, i;
    if (!s || Object.prototype.toString.call(s.items) !== "[object Array]") return null;
    F = def();
    if (fin(s.R) && s.R > 0) F.R = Math.min(1000, s.R);
    if (fin(s.wall) && s.wall >= 0) F.wall = Math.min(F.R, s.wall);
    if (fin(s.deg)) F.deg = degrees(s.deg);
    if (fin(s.tilt)) F.tilt = tiltDeg(s.tilt);
    if (fin(s.tiltAz)) F.tiltAz = norm360(s.tiltAz);
    if (fin(s.step) && s.step > 0) F.step = s.step;
    for (i = 0; i < s.items.length; i++) {
      var q = s.items[i];
      if (!q || !TYPES[q.t] || !fin(q.x) || !fin(q.y)) continue;
      var T = TYPES[q.t];
      F.items.push({
        id: F.next++, t: q.t, x: q.x, y: q.y,
        w: fin(q.w) && q.w >= MIN ? q.w : T.w,
        d: fin(q.d) && q.d >= MIN ? q.d : T.d,
        rot: fin(q.rot) ? norm360(q.rot) : 0
      });
    }
    return F;
  }

  return {
    TYPES: TYPES, ORDER: ORDER, CORNERS: CORNERS, MIN: MIN, TURNOFF: TURNOFF,
    def: def, add: add, byId: byId, index: index, del: del, dupe: dupe,
    axes: axes, local: local, world: world, corners: corners, turnAt: turnAt,
    az: az, radius: radius, clampIn: clampIn, move: move, turn: turn, resize: resize, ring: ring,
    layout: layout,
    hit: hit, pix: pix, m2p: m2p, p2m: p2m, snap: snap, norm360: norm360, degrees: degrees,
    tiltDeg: tiltDeg, out: out, load: load
  };
});
