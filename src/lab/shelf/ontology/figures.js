/* ontology — the figures.
   p5 in instance mode, one canvas per figure, all still. Every diagram is redrawn from a figure or a
   described structure in writings/Object Oriented Ontology.pdf (Harman, Object-Oriented Ontology,
   Pelican 2017). The geometry follows the book; every word on a canvas is the book's own, but for the
   four pole labels, which are the book's own abbreviations. Black on white, hairlines — the sheet. */

p5.disableFriendlyErrors = true;

const INK = '#000000', HAIR = '#c9c9c9', PAPER = '#ffffff';
const FONT = 'Arial, Helvetica, sans-serif';

function label(s, str, x, y, o) {
  o = o || {};
  s.push();
  s.noStroke();
  s.fill(o.faint ? HAIR : INK);
  s.textFont(FONT);
  s.textSize(o.size || 11.5);
  s.textStyle(o.bold ? s.BOLD : s.NORMAL);
  s.textAlign(o.align || s.LEFT, s.BASELINE);
  s.text(str, x, y);
  s.pop();
}

function seg(s, x1, y1, x2, y2, o) {
  o = o || {};
  s.push();
  s.stroke(o.hair ? HAIR : INK);
  s.strokeWeight(1);
  s.drawingContext.setLineDash(o.dash || []);
  s.line(x1, y1, x2, y2);
  s.drawingContext.setLineDash([]);
  s.pop();
}

function head(s, x1, y1, x2, y2) {
  const a = Math.atan2(y2 - y1, x2 - x1), L = 7, w = 0.40;
  s.push();
  s.stroke(INK);
  s.strokeWeight(1);
  s.line(x2, y2, x2 - L * Math.cos(a - w), y2 - L * Math.sin(a - w));
  s.line(x2, y2, x2 - L * Math.cos(a + w), y2 - L * Math.sin(a + w));
  s.pop();
}

function arrow(s, x1, y1, x2, y2, o) {
  o = o || {};
  const a = Math.atan2(y2 - y1, x2 - x1), g = o.gap || 0;
  const ex = x2 - g * Math.cos(a), ey = y2 - g * Math.sin(a);
  seg(s, x1, y1, ex, ey, o);
  head(s, x1, y1, ex, ey);
}

function node(s, x, y, r, str, o) {
  o = o || {};
  s.push();
  s.fill(PAPER);
  s.stroke(o.hair ? HAIR : INK);
  s.strokeWeight(1);
  s.drawingContext.setLineDash(o.dash || []);
  if (o.square) s.rect(x - r, y - r, 2 * r, 2 * r);
  else s.ellipse(x, y, 2 * r, 2 * r);
  s.drawingContext.setLineDash([]);
  s.pop();
  if (str) label(s, str, x, y + (o.size || 11.5) * 0.35, { align: s.CENTER, size: o.size || 11.5 });
}

function box(s, x, y, w, h, str, o) {
  o = o || {};
  s.push();
  s.fill(PAPER);
  s.stroke(INK);
  s.strokeWeight(1);
  s.rect(x, y, w, h);
  s.pop();
  if (str) label(s, str, x + w / 2, y + h / 2 + 4, { align: s.CENTER, size: o.size || 11.5 });
}

function fig(id, w, h, draw) {
  const host = document.getElementById(id);
  if (!host) return;
  const alt = host.getAttribute('aria-label');
  new p5(function (s) {
    s.setup = function () {
      const c = s.createCanvas(w, h);
      if (alt) { c.elt.setAttribute('role', 'img'); c.elt.setAttribute('aria-label', alt); }
      host.removeAttribute('aria-label');
      s.noStroke();
      s.textFont(FONT);
      s.textSize(11.5);
      s.noLoop();
    };
    s.draw = function () { s.clear(); draw(s); };
  }, host);
}

/* ---------- the two ways of telling what a thing is ---------- */

fig('f1', 620, 306, function (s) {
  const cx = 300, bw = 180, bh = 34;

  box(s, cx - bw / 2, 8, bw, bh, 'what it does');
  box(s, cx - bw / 2, 136, bw, bh, 'object');
  box(s, cx - bw / 2, 264, bw, bh, 'what it is made of');

  arrow(s, cx, 136, cx, 8 + bh + 2, { gap: 2 });
  arrow(s, cx, 170, cx, 264 - 2, { gap: 2 });

  label(s, 'overmining', cx + bw / 2 + 14, 76, { size: 11 });
  label(s, 'undermining', cx - bw / 2 - 14, 224, { size: 11, align: s.RIGHT });

  /* the surplus: the span the two reductions both miss */
  const mx = 96;
  seg(s, mx, 8, mx, 298);
  head(s, mx, 8, mx, 26);
  head(s, mx, 298, mx, 280);
  label(s, 'surplus', mx - 10, 146, { size: 11, align: s.RIGHT });
  label(s, 'deeper than', mx - 10, 160, { size: 10.5, align: s.RIGHT, faint: true });
  label(s, 'its effects', mx - 10, 172, { size: 10.5, align: s.RIGHT, faint: true });
  label(s, 'shallower than', mx - 10, 190, { size: 10.5, align: s.RIGHT, faint: true });
  label(s, 'its pieces', mx - 10, 202, { size: 10.5, align: s.RIGHT, faint: true });
});

/* ---------- figure 1. the quadruple object ---------- */

fig('f2', 560, 268, function (s) {
  const L = 118, R = 442, T = 54, B = 214, r = 34;
  seg(s, L + r, T, R - r, T);          /* RO — SO  */
  seg(s, R, T + r, R, B - r);          /* SO — SQ  */
  seg(s, L + r, B, R - r, B);          /* RQ — SQ  */
  seg(s, L, T + r, L, B - r);          /* RO — RQ  */

  node(s, L, T, r, 'RO');
  node(s, R, T, r, 'SO');
  node(s, R, B, r, 'SQ');
  node(s, L, B, r, 'RQ');

  label(s, 'real object', L, T - r - 8, { align: s.CENTER, size: 10.5 });
  label(s, 'sensual object', R, T - r - 8, { align: s.CENTER, size: 10.5 });
  label(s, 'sensual qualities', R, B + r + 18, { align: s.CENTER, size: 10.5 });
  label(s, 'real qualities', L, B + r + 18, { align: s.CENTER, size: 10.5 });
});

/* ---------- figure 2. metaphor ---------- */

fig('f3', 620, 300, function (s) {
  const L = 150, R = 450, T = 96, B = 240, r = 30;

  /* the normal case: a sensual object with its sensual qualities */
  seg(s, R - r, T, R, T + r);
  seg(s, R, T + r, R, B - r);

  node(s, R, T, r, 'SO');
  node(s, R, B, r, 'SQ');
  node(s, L, B, r, 'RO');
  node(s, L, T, r, 'RQ');

  /* the sensual object is cancelled by qualities it cannot uphold */
  seg(s, R - r * 0.7, T - r * 0.7, R + r * 0.7, T + r * 0.7);
  seg(s, R - r * 0.7, T + r * 0.7, R + r * 0.7, T - r * 0.7);

  /* the real object that withdraws, and the one that does not */
  node(s, R, 34, 20, '', { dash: [3, 3] });
  label(s, 'RO !', R, 38, { align: s.CENTER, size: 11 });
  label(s, 'withdraws inaccessibly', R + 34, 30, { size: 10.5 });

  seg(s, L + r, B, R - r, B);
  label(s, 'the only RO that is not withdrawn', (L + R) / 2, B + 24, { align: s.CENTER, size: 10.5 });

  label(s, 'unable to uphold such unusual qualities', R + 56, T + 4, { size: 10.5 });
  label(s, 'the metaphorical', R + 56, T + 20, { size: 10.5, faint: true });
  label(s, '“wine-dark sea”', R + 56, T + 34, { size: 10.5 });
  label(s, 'the literal “dark blue sea”', R + 56, T + 50, { size: 10.5, faint: true });
});

/* ---------- the life of an object ---------- */

fig('f4', 660, 232, function (s) {
  const y = 74, r = 6;
  const pts = [['birth', 60], ['ripening', 210], ['maturity', 360], ['decadence', 510], ['death', 620]];
  pts.forEach(function (p) { node(s, p[1], y, r, ''); });
  label(s, 'birth', pts[0][1], y + 26, { align: s.CENTER });
  label(s, 'ripening', pts[1][1], y + 26, { align: s.CENTER });
  label(s, 'maturity', pts[2][1], y + 26, { align: s.CENTER });
  label(s, 'decadence', pts[3][1], y + 26, { align: s.CENTER });
  label(s, 'death', pts[4][1], y + 26, { align: s.CENTER });
  for (let i = 0; i < 4; i++) arrow(s, pts[i][1] + r, y, pts[i + 1][1] - r, y);

  /* the intermediate symbioses: the pivotal relations, and only those */
  seg(s, 210, 118, 510, 118, { hair: true });
  seg(s, 210, 118, 210, 108, { hair: true });
  seg(s, 510, 118, 510, 108, { hair: true });
  label(s, 'the intermediate symbioses', 360, 136, { align: s.CENTER, size: 10.5 });

  label(s, 'literalism', 60, 44, { align: s.CENTER, size: 10.5 });
  label(s, 'no room for further symbiosis', 360, 44, { align: s.CENTER, size: 10.5 });
  label(s, 'symbioses become overly literal', 510, 190, { align: s.CENTER, size: 10.5 });
});
