/* audiovisual archiving — the figures.
   p5 in instance mode, one canvas per figure, all still. Every word on a canvas is Edmondson's own: the
   definition of the document, the passage between carriers, and appendix 2's comparative table. Black on
   white, hairlines — the sheet. */

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

function cell(s, x, y, w, h, o) {
  o = o || {};
  s.push();
  s.fill(o.fill || PAPER);
  s.stroke(o.hair ? HAIR : INK);
  s.strokeWeight(1);
  s.rect(x, y, w, h);
  s.pop();
}

function hatch(s, x, y, w, h, step) {
  s.push();
  s.stroke(HAIR);
  s.strokeWeight(1);
  for (let i = 12; i < w + h; i += (step || 7)) {
    s.line(x + Math.max(0, i - h), y + Math.min(i, h), x + Math.min(i, w), y + Math.max(0, i - w));
  }
  s.pop();
}

function arrow(s, x1, x2, y) {
  seg(s, x1, y, x2, y);
  seg(s, x2 - 7, y - 4, x2, y);
  seg(s, x2 - 7, y + 4, x2, y);
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

/* ---------- the document, and the conditions that make one ---------- */

fig('a1', 760, 330, function (s) {
  const cy = 116, bh = 96;

  /* the carrier, with its content */
  cell(s, 12, cy - bh / 2, 186, bh);
  label(s, 'the carrier', 12, cy - bh / 2 - 10, { size: 10.5, bold: true });
  hatch(s, 30, cy - 26, 150, 52);
  label(s, 'reproducible images and/or sounds', 30, cy - 4, { size: 10.5 });

  /* the device the definition requires */
  arrow(s, 206, 268, cy);
  label(s, 'transmission', 208, cy - 8, { size: 9.5, faint: true });
  cell(s, 276, cy - bh / 2, 176, bh);
  label(s, 'a technological device', 276, cy - bh / 2 - 10, { size: 10.5, bold: true });
  wrap(s, 'one cannot hear a disc by looking at it', 290, cy - 6, 150, 13, { size: 10.5 });

  /* the perceiver */
  arrow(s, 460, 522, cy);
  label(s, 'perception', 462, cy - 8, { size: 9.5, faint: true });
  s.push(); s.stroke(INK); s.noFill();
  s.ellipse(576, cy, 76, 40);
  s.fill(INK); s.noStroke();
  s.ellipse(576, cy, 16, 16);
  s.pop();
  label(s, 'our eyes and ears', 576, cy + 44, { align: s.CENTER, size: 10.5, bold: true });

  /* the three conditions */
  seg(s, 12, 214, 748, 214, { hair: true });
  const conds = [
    'recording, transmission, perception and comprehension usually requires a technological device',
    'visual and/or sonic content has linear duration',
    'purpose is the communication of that content, rather than use of the technology for other purposes'
  ];
  conds.forEach(function (c, i) {
    const x = 12 + i * 250;
    label(s, (i + 1) + '', x, 240, { size: 11, bold: true });
    wrap(s, c, x + 16, 240, 222, 13, { size: 10.5 });
  });
});

/* ---------- what migration keeps, and what it cannot ---------- */

fig('a2', 760, 290, function (s) {
  const top = 54, bw = 200, bh = 150;

  /* the original carrier: content and the object's own attributes */
  label(s, 'the carrier', 12, top - 12, { size: 10.5, bold: true });
  cell(s, 12, top, bw, bh);
  hatch(s, 26, top + 14, bw - 28, 56);
  label(s, 'the content', 26, top + 40, { size: 10.5 });
  seg(s, 12, top + 80, 12 + bw, top + 80, { hair: true });
  label(s, 'attributes intrinsic to the object', 26, top + 112, { size: 10.5 });
  seg(s, 26, top + 122, 26 + 160, top + 122);

  /* migration */
  arrow(s, 228, 400, top + 44);
  label(s, 'migration', 234, top + 34, { size: 10.5, bold: true });
  label(s, 'of content', 234, top + 48, { size: 10.5 });

  /* the new carrier: the content arrives, the attributes do not */
  label(s, 'another carrier', 420, top - 12, { size: 10.5, bold: true });
  cell(s, 420, top, bw, bh);
  hatch(s, 434, top + 14, bw - 28, 56);
  label(s, 'the content', 434, top + 40, { size: 10.5 });
  seg(s, 420, top + 80, 420 + bw, top + 80, { hair: true });
  seg(s, 434, top + 96, 434 + 76, top + 96, { dash: [3, 3], hair: true });
  label(s, 'cannot be migrated', 434, top + 112, { size: 10.5, faint: true });

  /* the consequence */
  seg(s, 12, 226, 748, 226, { hair: true });
  label(s, 'they can, at best, only be approximated on the new carrier',
        12, 248, { size: 10.5 });
  label(s, 'Nothing has ever been preserved - at best, it is being preserved!',
        12, 270, { size: 11, bold: true });
});

/* ---------- appendix 2: four collecting institutions ---------- */

fig('a3', 752, 268, function (s) {
  const lw = 118, cw = 146, gap = 8, x0 = 8, hh = 32, rh = 64, top = 12;
  const cols = ['Audiovisual archives', 'General archives', 'Libraries', 'Museums'];
  const rows = [
    ['What do they keep?', [
      'Image and sound works, associated documents and artefacts',
      'Selected inactive records: any format, usually unique and unpublished',
      'Published materials in all formats',
      'Objects, artefacts, associated documents']],
    ['What is their objective?', [
      'Preservation and accessibility of audiovisual heritage',
      'Protection of archives, and their evidential and informational values',
      'Preservation and/ or accessibility of materials and information',
      'Preservation and accessibility of artefacts and information']],
    ['Who looks after the material?', [
      'Audiovisual archivists', 'Archivists', 'Librarians', 'Museum curators']]
  ];

  /* the header row */
  cols.forEach(function (c, i) {
    const x = x0 + lw + gap + i * (cw + gap);
    cell(s, x, top, cw, hh);
    wrap(s, c, x + 6, top + 13, cw - 12, 12, { size: 10, bold: true });
  });
  label(s, 'Appendix 2', x0, top + 20, { size: 10, bold: true });

  /* the rows */
  rows.forEach(function (r, j) {
    const y = top + hh + j * rh;
    cell(s, x0, y, lw, rh, { fill: PAPER });
    wrap(s, r[0], x0 + 6, y + 18, lw - 12, 12, { size: 10, bold: true });
    r[1].forEach(function (txt, i) {
      const x = x0 + lw + gap + i * (cw + gap);
      cell(s, x, y, cw, rh);
      wrap(s, txt, x + 6, y + 18, cw - 12, 12, { size: 9.5 });
    });
  });
});
