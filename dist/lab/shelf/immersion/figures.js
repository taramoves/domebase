/* immersion — the figures.
   p5 in instance mode, one canvas per figure, all still. The continuum band, the frame and the
   enclosure, and the suggestion curve are all redrawn from sentences in Grau's Virtual Art
   (writings/). Every word on a canvas is the book's own. Black on white, hairlines — the sheet. */

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

function cell(s, x, y, w, h, o) {
  o = o || {};
  s.push();
  s.fill(o.fill ? o.fill : PAPER);
  s.stroke(o.hair ? HAIR : INK);
  s.strokeWeight(1);
  s.rect(x, y, w, h);
  s.pop();
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

/* ---------- the transmedia continuum ---------- */

fig('p1', 720, 200, function (s) {
  const media = ['the frescoes', 'the panorama', 'circular cinema', 'computer art in the CAVE'];
  const w = 168, gap = 14, x0 = 12, top = 62, h = 60;
  media.forEach(function (m, i) {
    const x = x0 + i * (w + gap);
    cell(s, x, top, w, h);
    wrap(s, m, x + 10, top + 30, w - 20, 13, { size: 11.5, bold: true });
  });
  /* the band the four hang from is the book's own claim about what they share */
  seg(s, x0, 46, x0 + 4 * w + 3 * gap, 46);
  label(s, '360° images', x0, 32, { size: 11.5, bold: true });
  label(s, 'media that are the means whereby the eye is addressed with a totality of images',
        x0, 156, { size: 10.5 });
  label(s, '“the transmedia functional continuum of the hermetic illusion space appears to be an anthropological constant”',
        x0, 176, { size: 10.5 });
});

/* ---------- the frame and the enclosure ---------- */

fig('p2', 720, 250, function (s) {
  const top = 34, w = 336, h = 168;

  /* left: the frame that leaves the observer outside */
  cell(s, 12, top, w, h, { hair: true });
  cell(s, 86, top + 26, w - 148, h - 74, { hair: true });
  label(s, 'a frame', 12, top - 12, { size: 11.5, bold: true });
  wrap(s, 'images or image spaces that are delimited by a frame that is apparent to the observer',
       24, top + h + 18, w - 24, 13, { size: 10.5 });
  label(s, 'They leave the observer outside', 24, top + h + 56, { size: 10.5, bold: true });

  /* right: the hermetic enclosure, addressing the observer from all sides */
  const X = 372;
  cell(s, X, top, w, h, { hair: true });
  s.push();
  s.stroke(INK); s.strokeWeight(1); s.drawingContext.setLineDash([2, 3]);
  s.ellipse(X + w / 2, top + h / 2 + 8, 120, 120);
  s.drawingContext.setLineDash([]);
  s.pop();
  label(s, '360°', X + w / 2, top + h / 2 + 12, { align: s.CENTER, size: 12, bold: true });
  label(s, 'hermetically', X, top - 12, { size: 11.5, bold: true });
  wrap(s, 'motifs that address the observer from all sides in a unity of time and place, enclosing him or her hermetically',
       X + 12, top + h + 18, w - 24, 13, { size: 10.5 });
  label(s, 'an illusion of being in the picture', X + 12, top + h + 56, { size: 10.5, bold: true });
});

/* ---------- the suggestion curve ---------- */

fig('p3', 720, 250, function (s) {
  const x0 = 40, x1 = 690, y0 = 24, y1 = 176;

  arrow(s, x0, y1, x1, y1, { gap: 0 });
  arrow(s, x0, y1, x0, y0, { gap: 0 });

  label(s, 'the suggestive potential of the images', x0 + 6, y0 + 4, { size: 10.5 });
  label(s, 'the power of the observers to maintain distance from them', x0 + 6, y1 - 6, { size: 10.5 });

  /* at the inception of a new medium the two lines are far apart; habituation reverses them */
  const N = 60;
  s.push();
  s.noFill();
  s.stroke(INK);
  s.strokeWeight(1);
  s.beginShape();
  for (let i = 0; i <= N; i++) {
    const t = i / N;
    s.vertex(x0 + 14 + t * (x1 - x0 - 34), y0 + 22 + t * (y1 - y0 - 40));
  }
  s.endShape();
  s.stroke(INK);
  s.drawingContext.setLineDash([3, 3]);
  s.beginShape();
  for (let i = 0; i <= N; i++) {
    const t = i / N;
    s.vertex(x0 + 14 + t * (x1 - x0 - 34), y1 - 24 - t * (y1 - y0 - 34));
  }
  s.endShape();
  s.drawingContext.setLineDash([]);
  s.pop();

  label(s, 'at the inception of a new image medium of illusion', x0 + 40, y0 + 14, { size: 10.5 });
  label(s, 'gradual habituation and increased media competence', x1 - 12, y1 - 30,
        { size: 10.5, align: s.RIGHT });
  label(s, '“lead to a reversal of this relation”', x1 - 12, y1 - 14, { size: 10.5, align: s.RIGHT });
  label(s, 'a wavelike development over time', (x0 + x1) / 2, y1 + 28, { align: s.CENTER, size: 10.5 });
});
