/* practice as research — the figures.
   p5 in instance mode, one canvas per figure, all still. The three paradigms are redrawn from the
   table on p. 151, the writing schema from the amended schema on p. 198, the stages from the Appendix
   diagram on p. 187, the double articulation from the sentence on p. 29, and the four modes of
   research-creation from Chapman and Sawchuk (2012), all in writings/. Every word on a canvas is the
   source's own. Black on white, hairlines — the sheet. */

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

/* ---------- the three research paradigms ---------- */

fig('p1', 720, 330, function (s) {
  const cols = [
    ['Quantitative Research',
     '“The activity or operation of expressing something as a quantity or amount – for example, in numbers, graphs, or formulas”',
     'The scientific method'],
    ['Qualitative Research',
     '“All forms of social inquiry that rely primarily on qualitative data … i.e., nonnumeric data in the form of words”',
     'Multi-method'],
    ['Performative Research',
     '“Expressed in non-numeric data, but in forms of symbolic data other than words in discursive text. These include material forms of practice, of still and moving images, of music and sound, of live action and digital code.”',
     'Multi-method led by practice']
  ];
  const w = 214, gap = 15, x0 = 12, top = 10;
  cols.forEach(function (c, i) {
    const x = x0 + i * (w + gap);
    cell(s, x, top, w, 300);
    label(s, c[0], x + 10, top + 24, { bold: true, size: 11.5 });
    seg(s, x, top + 34, x + w, top + 34, { hair: true });
    const y = wrap(s, c[1], x + 10, top + 56, w - 20, 14, { size: 10.5 });
    label(s, 'Method', x + 10, y + 22, { faint: true, size: 10 });
    label(s, c[2], x + 10, y + 40, { size: 11 });
  });
});

/* ---------- the double articulation ---------- */

fig('p2', 620, 210, function (s) {
  const w = 150, h = 46, y = 82;
  cell(s, 60, y, w, h);  label(s, 'theory', 60 + w / 2, y + 28, { align: s.CENTER, size: 12 });
  cell(s, 410, y, w, h); label(s, 'practice', 410 + w / 2, y + 28, { align: s.CENTER, size: 12 });

  /* theory emerges from a reflexive practice */
  arrow(s, 410, y - 14, 210, y - 14, { gap: 2 });
  label(s, 'theory emerges from a reflexive practice', 310, 54, { align: s.CENTER, size: 10.5 });

  /* practice is informed by theory */
  arrow(s, 210, y + h + 14, 410, y + h + 14, { gap: 2 });
  label(s, 'practice is informed by theory', 310, y + h + 36, { align: s.CENTER, size: 10.5 });
});

/* ---------- the amended writing schema ---------- */

fig('p3', 660, 340, function (s) {
  const rows = [
    ['INTRODUCTION', 'WHY?', 'WHAT IF?  THEN…'],
    ['LITERATURE REVIEW · CONCEPTUAL FRAMEWORKS · PRACTICE REVIEW', 'WHO? WHEN? WHERE?'],
    ['MATERIALS · METHODS', 'WHY? HOW?'],
    ['DISCUSSION · RESULTS · OUTCOMES', 'WHAT?'],
    ['DISCUSSION · SIGNIFICANCE', 'SO WHAT?']
  ];
  const x = 16, w = 400, h = 52, gap = 12, top = 10;
  rows.forEach(function (r, i) {
    const y = top + i * (h + gap);
    cell(s, x, y, w, h);
    wrap(s, r[0], x + 10, y + 22, w - 20, 14, { size: 11, bold: true });
    if (i) arrow(s, x + w / 2, y - gap, x + w / 2, y - 1, { gap: 1 });
    label(s, r[1], x + w + 24, y + 22, { bold: true, size: 11.5 });
    if (r[2]) label(s, r[2], x + w + 24, y + 40, { bold: true, size: 11.5 });
  });
});

/* ---------- the four modes of research-creation ---------- */

fig('p5', 720, 252, function (s) {
  const cols = [
    ['research-for-creation',
     'literature reviews, the tracking down of precedents for one’s creative ideas, the articulation of a cluster of concepts, as well as trying out different prototypes or iterations'],
    ['research-from-creation',
     'performances, experiences, interactive art works, et cetera can also be ways of generating research data'],
    ['creative presentations of research',
     'the presentation of traditional academic research in a creative fashion'],
    ['creation-as-research',
     'creation is required in order for research to emerge']
  ];
  const w = 165, gap = 15, x0 = 14, top = 10, h = 150;
  cols.forEach(function (c, i) {
    const x = x0 + i * (w + gap);
    cell(s, x, top, w, h);
    wrap(s, c[0], x + 9, top + 24, w - 18, 12, { size: 11, bold: true });
    seg(s, x, top + 34, x + w, top + 34, { hair: true });
    wrap(s, c[1], x + 9, top + 52, w - 18, 13, { size: 10 });
    /* each mode hangs from the band below: they are held by resemblance, not by an essence */
    seg(s, x + w / 2, top + h, x + w / 2, top + h + 26, { hair: true });
  });

  cell(s, x0, top + h + 26, 705, 52, { hair: true });
  label(s, '“family resemblances”', 360, top + h + 46, { align: s.CENTER, size: 11, bold: true });
  label(s, 'a complicated network of similarities overlapping and criss-crossing',
        360, top + h + 64, { align: s.CENTER, size: 10.5 });
});

/* ---------- the stages of the research ---------- */

fig('p4', 700, 210, function (s) {
  const y = 132;
  arrow(s, 16, y, 684, y, { gap: 0 });
  label(s, 'general', 16, y + 30, { size: 10.5 });
  label(s, 'specific', 684, y + 30, { align: s.RIGHT, size: 10.5 });

  const stages = [
    ['Stage 1', 'ESTABLISHING THE FIELD:'],
    ['Stage 2', 'SUMMARISING PREVIOUS PRACTICE AND THEORY'],
    ['Stage 3', 'JUSTIFICATION:'],
    ['Stage 4', 'INTRODUCING PRESENT RESEARCH:']
  ];
  const xs = [40, 208, 376, 520];
  stages.forEach(function (st, i) {
    const x = xs[i];
    seg(s, x, y, x, y - 12);
    label(s, st[0], x, y - 24, { size: 10.5, bold: true });
    wrap(s, st[1], x + 6, y - 42, 158, 12, { size: 10.5 });
  });
});
