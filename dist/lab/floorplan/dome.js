/* The dome's own numbers, as parameters: how many speakers over how many rings, how many
   projectors, how a ring is spread, and the shape of a panel.

   Nothing here draws. The master keeps its state in percentages of the radius and paints on a 680
   plate with K px to the percent; this file hands it a panel's path and works out the counts a
   number in a field stands for.

   The counts are read off the rig the state already is, never invented: put a number back where it
   was and nothing moves. A ring that holds a single speaker is the pole and stays one.

   A rig is laid one of two ways. `rings` keeps the rig's own circles and scales them with the count,
   which is what the page has always done; `round` lays the whole count on one circle of its own, at
   a radius and over a span the fields give it. A small count needs the second: one speaker a ring,
   every one of them on the same bearing, reads as a line out from the middle, not as a rig.
   Loaded before the master's own script — its render asks this file for the path of a panel. */
(function (root, factory) {
  var api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.dome = api;
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";
  var CX = 340;                    // the centre of the master's plate, in its own units
  var K = 3.38;                    // px to the percent of the radius (100% = 338 px)

  function whole(v) { return typeof v === "number" && isFinite(v); }
  function norm(a) { a %= 360; return a < 0 ? a + 360 : a; }

  /* `rest` things shared between `weights` in whole numbers, none below one. Rounding alone loses
     or gains a speaker, so the difference goes to the shares with the largest fraction. */
  function shares(weights, rest) {
    var i, sum = 0, n = weights.length;
    for (i = 0; i < n; i++) sum += weights[i];
    if (!n || !(sum > 0)) { var z = []; for (i = 0; i < n; i++) z.push(0); return z; }
    var want = weights.map(function (w) { return rest * w / sum; });
    var out = want.map(function (v) { return Math.max(1, Math.floor(v)); });
    var got = 0;
    for (i = 0; i < n; i++) got += out[i];
    var order = want.map(function (_, j) { return j; }).sort(function (a, b) {
      return (want[b] - Math.floor(want[b])) - (want[a] - Math.floor(want[a]));
    });
    var g = 0;
    while (got < rest && order.length && g < 10000) { out[order[g % order.length]]++; got++; g++; }
    g = 0;
    while (got > rest && g++ < 10000) {                 // take one back from the largest that can spare it
      var pick = -1;
      for (i = 0; i < n; i++) if (out[i] > 1 && (pick < 0 || out[i] > out[pick])) pick = i;
      if (pick < 0) break;                              // every share is one already
      out[pick]--; got--;
    }
    return out;
  }

  /* The count per ring a total stands for. The rings are scaled from `base` — the rig the room
     was — and not from the last number typed, so a number put back where it was returns the rig it
     was, whatever was typed in between; with no base given, the rig it already is is the base. */
  function speakers(spk, total, base) {
    var cur = [], i, list = spk || [];
    for (i = 0; i < list.length; i++) cur.push(list[i].n);
    if (!whole(total)) return cur;
    total = Math.round(total);
    var have = 0;
    for (i = 0; i < cur.length; i++) have += cur[i];
    if (total < 1 || total === have || !cur.length) return cur;
    var from = (base && base.length === cur.length) ? base : cur;
    var fixed = 0, free = [], weights = [];
    for (i = 0; i < cur.length; i++) {
      if (from[i] <= 1) fixed += from[i];               // the pole
      else { free.push(i); weights.push(from[i]); }
    }
    if (!free.length) return cur;
    var got = shares(weights, Math.max(0, total - fixed));
    var out = cur.slice();
    for (i = 0; i < free.length; i++) out[free[i]] = got[i];
    return out;
  }

  /* The readings of one ring. A full turn spaces its `n` evenly round 360 from the ring's own start;
     an arc spreads them from the start to the end, edge to edge; a ring of one sits at the start.
     A state from before `span` existed reads as a full turn, which is what those rings were. */
  function azOf(s, i) {
    var n = Math.max(1, Math.round(s.n) || 1);
    var span = s.span == null ? 360 : Math.max(0, Math.min(360, s.span));
    var o = s.o || 0;
    if (n === 1) return norm(o);
    if (span >= 360) return norm(o + 360 * i / n);
    return norm(o + span * i / (n - 1));
  }

  /* One ring of `n` at `r` % of the radius, spread over `span` degrees about `at`: a full turn
     starts at `at`, a shorter arc is centred on it. `tpl` is the ring it replaces, so the speaker's
     own size and the LFE cap come along. */
  function round(n, o, tpl) {
    n = Math.max(1, Math.min(180, Math.round(n) || 1));
    var span = o.span == null ? 360 : Math.max(1, Math.min(360, +o.span));
    var at = whole(o.at) ? o.at : 0;
    var r = Math.max(0, Math.min(100, whole(o.r) ? o.r : 80));
    var t = tpl || {};
    return { n: n, r: r, o: norm(n > 1 && span < 360 ? at - span / 2 : at), span: span,
             w: t.w || 8, h: t.h || 10, cap: t.cap ? t.cap : 0 };
  }

  /* `count` projectors on one circle: each its own entry, evenly over the span about `at`, at the
     radius and the diameter the circle has. A count of one leaves it at the centre of the arc. */
  function around(count, o) {
    var n = Math.max(1, Math.min(48, Math.round(count) || 1));
    var span = o.span == null ? 360 : Math.max(1, Math.min(360, +o.span));
    var at = whole(o.at) ? o.at : 0;
    var r = Math.max(0, Math.min(100, whole(o.r) ? o.r : 45));
    var dia = o.dia == null ? 1.5 : o.dia, ring = round(n, { r: r, span: span, at: at }), out = [], i;
    for (i = 0; i < n; i++) out.push({ d: r, dia: dia, az: +azOf(ring, i).toFixed(1) });
    return out;
  }

  /* `count` projectors over the rings the rig already hangs them in, each ring keeping its own
     radius and diameter, the circles spread evenly from where the rig's first one points. A count
     equal to the number there already is changes nothing at all — a rig placed by hand stays put. */
  function projectors(circ, count) {
    var src = circ || [], i, j, f;
    if (!whole(count)) return src.slice();
    count = Math.round(count);
    if (count < 1 || count === src.length) return src.map(function (g) { return { d: g.d, dia: g.dia, az: g.az }; });
    var rings = [];
    for (i = 0; i < src.length; i++) {
      f = null;
      for (j = 0; j < rings.length; j++) if (Math.abs(rings[j].d - src[i].d) < 1e-6) { f = rings[j]; break; }
      if (f) f.n++;
      else rings.push({ d: src[i].d, dia: src[i].dia, n: 1, az: src[i].az });
    }
    var weights = rings.map(function (r) { return r.n; });
    var got = shares(weights, count);
    var start = rings.length && whole(rings[0].az) ? rings[0].az : 0;
    var out = [];
    for (i = 0; i < rings.length; i++) {
      var m = Math.max(1, got[i]);
      for (j = 0; j < m; j++)
        out.push({ d: rings[i].d, dia: rings[i].dia, az: +norm(start + 360 * j / m).toFixed(1) });
    }
    return out;
  }

  /* The shape the panels are cut in. A state that says nothing is the plate as it has always been. */
  function shape(S) { return S && S.shape === "tri" ? "tri" : "quad"; }

  function panelCount(N) { return (N || []).reduce(function (a, b) { return a + b; }, 0); }

  function P(r, a) { return (CX + r * Math.cos(a)).toFixed(2) + " " + (CX + r * Math.sin(a)).toFixed(2); }
  function cap(r) { return "M" + (CX - r) + " " + CX + "a" + r + " " + r + " 0 1 0 " + (2 * r) + " 0a" + r + " " + r + " 0 1 0 " + (-2 * r) + " 0z"; }

  /* One panel of the plate: `k` its band (0 is the cap, a circle over the pole), `i` which panel of
     the `m` in that band, `ri`/`ro` the inner and outer ring in the plate's own units. A panel with
     `quad` is the hole between the two rings — two arcs and two sides — which is the master's own
     path, unchanged. A panel with `tri` is that same hole cut in two along a diagonal, the diagonal
     turning with the band so the bands read as triangles. Either way one panel is one path, so its
     colour, the exits painted on it and a click on it all still find it. */
  function cellPath(k, i, m, ri, ro, sh) {
    if (!k) return cap(ro);
    var a0 = -Math.PI / 2 + i * 2 * Math.PI / m, a1 = a0 + 2 * Math.PI / m;
    var I0 = P(ri, a0), I1 = P(ri, a1), O0 = P(ro, a0), O1 = P(ro, a1);
    if (sh === "tri") {
      return (k % 2)
        ? "M" + I0 + "L" + O0 + "L" + O1 + "zM" + I0 + "L" + O1 + "L" + I1 + "z"
        : "M" + O0 + "L" + I1 + "L" + I0 + "zM" + O0 + "L" + O1 + "L" + I1 + "z";
    }
    return "M" + I0 + "L" + O0 + "A" + ro + " " + ro + " 0 0 1 " + O1 + "L" + I1 + "A" + ri + " " + ri + " 0 0 0 " + I0 + "z";
  }

  return { CX: CX, K: K, shares: shares, speakers: speakers, projectors: projectors,
           azOf: azOf, round: round, around: around,
           shape: shape, panelCount: panelCount, cellPath: cellPath, norm: norm };
});
