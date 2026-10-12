/* spheres I: bubbles — the figures.
   p5 in instance mode, one canvas per figure, all still. Every word on a canvas is Sloterdijk's own:
   the soap-bubble scene, the orb in two halves, and the core without a shell. Black on white,
   hairlines — the sheet. */

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

function ring(s, cx, cy, d, o) {
  o = o || {};
  s.push();
  s.noFill();
  s.stroke(o.hair ? HAIR : INK);
  s.strokeWeight(1);
  s.drawingContext.setLineDash(o.dash || []);
  s.ellipse(cx, cy, d, d);
  s.drawingContext.setLineDash([]);
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

/* ---------- the child and the soap bubbles ---------- */

fig('s1', 720, 250, function (s) {
  /* the blower, at the balcony */
  label(s, 'the blower', 26, 44, { size: 10.5, bold: true });
  ring(s, 52, 84, 40);
  seg(s, 22, 132, 82, 132);
  seg(s, 40, 104, 22, 132, { hair: true });
  seg(s, 64, 104, 82, 132, { hair: true });

  /* the loop, the breath, the orb */
  seg(s, 96, 96, 132, 96, { hair: true });
  label(s, 'the soap bubble', 300, 46, { size: 10.5, bold: true });
  ring(s, 366, 96, 78);
  seg(s, 660, 96, 690, 96);

  /* the zone between eye and object, drawn as the animated sphere */
  ring(s, 366, 96, 150, { dash: [3, 3] });
  label(s, 'an animated sphere', 366, 186, { align: s.CENTER, size: 10.5, bold: true });

  label(s, 'a solidarity between the soap bubble and its blower',
        26, 214, { size: 10.5 });
  label(s, 'that excludes the rest of the world', 26, 228, { size: 10.5 });
});

/* ---------- the biune sphere ---------- */

fig('s2', 720, 250, function (s) {
  const cx = 250, cy = 118, d = 150;
  ring(s, cx, cy, d);
  /* the contact side, where the two halves join */
  seg(s, cx, cy - d / 2, cx, cy + d / 2);
  label(s, 'their contact side', cx + 84, cy - d / 2 - 8, { size: 10.5, faint: true });
  seg(s, cx + 4, cy - d / 2 - 4, cx + 60, cy - d / 2 - 12, { hair: true });

  const rx = 430;
  wrap(s, 'an orb in two halves, polarized and differentiated from the start',
       rx, cy - 44, 270, 13, { size: 10.5 });
  wrap(s, 'yet nonetheless intimately joined, subjective and subject to experience',
       rx, cy + 4, 270, 13, { size: 10.5 });
  wrap(s, 'a biune shared space of present and past experience',
       rx, cy + 52, 270, 13, { size: 10.5, bold: true });
  seg(s, rx - 12, cy - 56, rx - 12, cy + 52, { hair: true });
});

/* ---------- the core without a shell ---------- */

fig('s3', 720, 240, function (s) {
  const d = 120, cy = 112;

  /* the shell that held */
  ring(s, 160, cy, d);
  ring(s, 160, cy, 34);
  hatchRing(s, 160, cy, d);
  label(s, 'the sky as an immune system', 160, cy + d / 2 + 30, { align: s.CENTER, size: 10.5 });

  /* the shell gone */
  ring(s, 470, cy, 34);
  ring(s, 470, cy, d, { dash: [3, 3], hair: true });
  label(s, 'a core without a shell', 470, cy + d / 2 + 30, { align: s.CENTER, size: 10.5, bold: true });

  label(s, 'was suddenly useless', 160, cy + d / 2 + 48, { align: s.CENTER, size: 10.5 });
});

function hatchRing(s, cx, cy, d) {
  s.push();
  s.stroke(HAIR);
  s.strokeWeight(1);
  for (let a = 0; a < 360; a += 12) {
    const r = d / 2, r2 = d / 2 - 14;
    const rad = (a * Math.PI) / 180;
    s.line(cx + r * Math.cos(rad), cy + r * Math.sin(rad),
           cx + r2 * Math.cos(rad), cy + r2 * Math.sin(rad));
  }
  s.pop();
}
