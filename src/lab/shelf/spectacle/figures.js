/* the society of the spectacle — the figures.
   p5 in instance mode, one canvas per figure, all still. The book's argument is abstract in a way a
   list of theses cannot fix: it says the spectacle is a relation rather than a quantity of images, and
   that its work is separation. Those two are what a drawing can hold. Every word on a canvas is the
   book's own. Black on white, hairlines — the sheet. */

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

function wrap(s, str, x, y, w, lh, o) {
  o = o || {};
  s.push();
  s.textFont(FONT);
  s.textSize(o.size || 10.5);
  s.textStyle(o.bold ? s.BOLD : s.NORMAL);
  s.fill(o.faint ? HAIR : INK);
  s.noStroke();
  s.textAlign(s.LEFT, s.BASELINE);
  const words = str.split(' ');
  let line = '', yy = y;
  for (let i = 0; i < words.length; i++) {
    const t = line ? line + ' ' + words[i] : words[i];
    if (s.textWidth(t) > w && line) { s.text(line, x, yy); line = words[i]; yy += lh; }
    else line = t;
  }
  if (line) { s.text(line, x, yy); yy += lh; }
  s.pop();
  return yy;
}

function seg(s, x1, y1, x2, y2, o) {
  o = o || {};
  s.push();
  s.stroke(o.hair ? HAIR : INK);
  s.strokeWeight(o.w || 1);
  s.drawingContext.setLineDash(o.dash || []);
  s.line(x1, y1, x2, y2);
  s.drawingContext.setLineDash([]);
  s.pop();
}

function cell(s, x, y, w, h, o) {
  o = o || {};
  s.push();
  s.fill(o.fill ? o.fill : PAPER);
  s.stroke(o.hair ? HAIR : INK);
  s.strokeWeight(1);
  s.rect(x, y, w, h);
  s.pop();
}

/* a person, drawn the same way everywhere on this page: a head and a pair of shoulders */
function person(s, x, y, k) {
  k = k || 1;
  s.push();
  s.noFill();
  s.stroke(INK);
  s.strokeWeight(1.4);
  s.ellipse(x, y - 20 * k, 22 * k, 22 * k);
  s.arc(x, y + 26 * k, 44 * k, 52 * k, s.PI + 0.35, s.TWO_PI - 0.35);
  s.pop();
}

function arrow(s, x1, y1, x2, y2, o) {
  seg(s, x1, y1, x2, y2, o);
  const a = Math.atan2(y2 - y1, x2 - x1), L = 7;
  seg(s, x2, y2, x2 - L * Math.cos(a - 0.4), y2 - L * Math.sin(a - 0.4), o);
  seg(s, x2, y2, x2 - L * Math.cos(a + 0.4), y2 - L * Math.sin(a + 0.4), o);
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

/* ---------- a social relation between people that is mediated by images ---------- */

fig('p1', 720, 240, function (s) {
  const y = 104;
  person(s, 96, y, 1.15);
  person(s, 624, y, 1.15);
  label(s, 'people', 96, y + 78, { align: s.CENTER, size: 11 });
  label(s, 'people', 624, y + 78, { align: s.CENTER, size: 11 });

  /* the images the relation is made of */
  const ix = 322, iw = 76, ih = 46;
  for (let i = 0; i < 3; i++) cell(s, ix, y - 76 + i * 56, iw, ih, { hair: i !== 1 });
  label(s, 'images', ix + iw / 2, y + 78, { align: s.CENTER, size: 11 });

  /* the line of the relation runs through them */
  arrow(s, 132, y - 12, 306, y - 22);
  arrow(s, 414, y - 22, 588, y - 12);
  arrow(s, 588, y + 26, 414, y + 34);
  arrow(s, 306, y + 34, 132, y + 26);

  label(s, 'a social relation', 360, 214, { align: s.CENTER, size: 12.5, bold: true });
});

/* ---------- a new internal distance in the form of spectacular separation ---------- */

fig('p2', 720, 236, function (s) {
  const y = 92, xs = [76, 218, 360, 502, 644];
  xs.forEach(function (x) {
    cell(s, x - 30, y - 40, 60, 44, { hair: true });
    person(s, x, y + 46, 0.95);
  });
  /* the boundary between any two of them, and the distance it marks */
  for (let i = 0; i < xs.length - 1; i++) {
    const m = (xs[i] + xs[i + 1]) / 2;
    seg(s, m, 24, m, 168, { hair: true, dash: [2, 4] });
    seg(s, m - 5, 176, m + 5, 176);
  }
  seg(s, xs[0], 176, xs[xs.length - 1], 176, { dash: [1, 4] });
  label(s, 'a new internal distance', 360, 202, { align: s.CENTER, size: 11 });
  label(s, 'spectacular separation', 360, 222, { align: s.CENTER, size: 12.5, bold: true });
});

/* ---------- a concentrated form or a diffuse form ---------- */

fig('p3', 720, 250, function (s) {
  /* the concentrated spectacle: one image, and everyone oriented to it */
  label(s, 'the concentrated spectacle', 22, 24, { size: 11, bold: true });
  cell(s, 128, 44, 110, 66, {});
  const around = [[60, 152], [124, 176], [188, 176], [252, 152], [156, 214]];
  around.forEach(function (p) { person(s, p[0], p[1], 0.72); });
  around.forEach(function (p) { arrow(s, p[0], p[1] - 34, 183, 118, { hair: true }); });

  /* the diffuse spectacle: an image apiece, and no two of them the same */
  label(s, 'the diffuse spectacle', 398, 24, { size: 11, bold: true });
  const own = [[434, 88], [516, 74], [598, 96], [462, 176], [562, 186], [662, 158]];
  own.forEach(function (p, i) {
    person(s, p[0], p[1], 0.72);
    cell(s, p[0] + 26, p[1] - 46, 44, 34, { hair: true });
  });
});
