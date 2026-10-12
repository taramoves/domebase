/* interaction of color — the demonstrations, one per study.
   p5 in instance mode, one canvas per study, all still. The page around these is the sheet, black on
   white; the canvases carry colour, because colour is what they demonstrate. Every word written on a
   canvas is Albers' own. These are demonstrations of the exercises, not reproductions of the plates. */

p5.disableFriendlyErrors = true;

const INK = '#000000', HAIR = '#c9c9c9', PAPER = '#ffffff';
const FONT = 'Arial, Helvetica, sans-serif';

/* the palette the demonstrations are built from */
const R = '#cf3a2b', B = '#2f5fb0', Y = '#e6c02c', G = '#3f9b62';
const V = '#7a4fa3', O = '#e08a2e', C = '#2f9bb0', M = '#c8398a', N = '#8a8f9b';

function hex(c) {
  const h = c.replace('#', '');
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
}
function rgb(a) { return 'rgb(' + a.map(function (v) { return Math.round(v); }).join(',') + ')'; }
/* t = 0 gives the first colour, t = 1 the second */
function mix(c1, c2, t) {
  const a = hex(c1), b = hex(c2);
  return rgb([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]);
}
function lighter(c, t) { return mix(c, PAPER, t); }
function darker(c, t) { return mix(c, INK, t); }

function label(s, str, x, y, o) {
  o = o || {};
  s.push();
  s.noStroke();
  s.fill(o.faint ? HAIR : INK);
  s.textFont(FONT);
  s.textSize(o.size || 11);
  s.textStyle(o.bold ? s.BOLD : s.NORMAL);
  s.textAlign(o.align || s.LEFT, s.BASELINE);
  s.text(str, x, y);
  s.pop();
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

/* a field of colour, with the sheet's hairline around it */
function field(s, x, y, w, h, c, o) {
  o = o || {};
  s.push();
  s.noStroke();
  s.fill(c);
  s.rect(x, y, w, h);
  if (!o.bare) { s.noFill(); s.stroke(HAIR); s.strokeWeight(1); s.rect(x, y, w, h); }
  s.pop();
}

/* a closed outline that draws nothing: used to keep a hairline under translucent fields */
function rule(s, x, y, w, h) {
  s.push();
  s.noFill(); s.stroke(HAIR); s.strokeWeight(1);
  s.rect(x, y, w, h);
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
      s.textSize(11);
      s.noLoop();
    };
    s.draw = function () { s.clear(); draw(s); };
  }, host);
}

/* I — color recollection: one projection, many perceptions */
fig('c1', 720, 180, function (s) {
  field(s, 20, 34, 150, 104, R);
  label(s, 'the same projection on his retina', 20, 158, { size: 10.5 });
  seg(s, 196, 46, 196, 126, { hair: true });
  const five = [lighter(R, .42), mix(R, O, .5), R, mix(R, V, .35), darker(R, .3)];
  five.forEach(function (c, i) { field(s, 224 + i * 96, 34, 84, 104, c); });
  label(s, 'reds in their minds', 224, 158, { size: 10.5, bold: true });
});

/* II — color reading and contexture: one square, three grounds */
fig('c2', 720, 180, function (s) {
  const grounds = ['#4a4a4a', '#f0f0f0', '#c8a02c'];
  grounds.forEach(function (g, k) {
    const x0 = 24 + k * 236, cell = 44;
    for (let r = 0; r < 3; r++) {
      for (let c = 0; c < 3; c++) {
        const mid = (r === 1 && c === 1);
        field(s, x0 + c * cell, 26 + r * cell, cell - 2, cell - 2, mid ? '#8a8f9b' : g, { bare: true });
      }
    }
  });
  label(s, 'the same color', 24, 168, { size: 10.5, bold: true });
  label(s, 'contexture', 560, 168, { size: 10.5, faint: true });
});

/* III — color paper, and paint */
fig('c3', 720, 180, function (s) {
  field(s, 40, 30, 280, 108, B);
  label(s, 'color paper', 40, 158, { size: 10.5, bold: true });

  field(s, 400, 30, 280, 108, B, { bare: true });
  s.push();
  s.strokeWeight(1.6);
  for (let i = 0; i < 54; i++) {
    const x = 400 + i * 5.2;
    s.stroke(i % 3 === 0 ? lighter(B, .3) : darker(B, .18));
    s.line(x, 30, x + 26, 138);
  }
  s.pop();
  rule(s, 400, 30, 280, 108);
  s.push();
  s.noFill(); s.stroke('#ffffff'); s.strokeWeight(3);
  s.rect(401, 31, 278, 106);
  s.pop();
  label(s, 'paint', 400, 158, { size: 10.5, bold: true });
});

/* IV — the relativity of color: three waters, two hands */
fig('c4', 720, 190, function (s) {
  const pots = [['warm', '#c8502a'], ['lukewarm', '#cfd4d6'], ['cold', '#2f6fb0']];
  pots.forEach(function (p, i) {
    const x = 60 + i * 220;
    field(s, x, 46, 150, 92, lighter(p[1], .55));
    field(s, x + 8, 54, 134, 76, p[1], { bare: true });
    label(s, p[0], x + 75, 36, { align: s.CENTER, size: 11, bold: true });
  });
  /* both hands in the middle container: the left reads cold, the right warm */
  function hand(x, y) {
    s.push(); s.noFill(); s.stroke(INK); s.strokeWeight(1.4);
    s.beginShape();
    s.vertex(x, y + 30); s.vertex(x, y); s.vertex(x + 6, y - 4); s.vertex(x + 11, y);
    s.vertex(x + 16, y - 5); s.vertex(x + 21, y); s.vertex(x + 26, y - 3); s.vertex(x + 30, y + 3);
    s.vertex(x + 30, y + 18); s.vertex(x + 15, y + 30);
    s.endShape();
    s.pop();
  }
  hand(300, 88); hand(370, 88);
  label(s, 'cold', 286, 78, { size: 10.5, bold: true });
  label(s, 'warm', 390, 78, { size: 10.5, bold: true });
  label(s, 'both hands into the middle container', 60, 172, { size: 10.5 });
  label(s, '2 different temperatures', 60, 186, { size: 10.5, bold: true });
});

/* V — lighter and/or darker: one hue in seven steps */
fig('c5', 720, 180, function (s) {
  const steps = [.82, .66, .5, .34, .18, .07, 0];
  steps.forEach(function (t, i) {
    field(s, 40 + i * 94, 34, 86, 104, t === 0 ? R : lighter(R, t), { bare: true });
  });
  label(s, 'lighter and/or darker', 40, 158, { size: 10.5, bold: true });
  label(s, 'light intensity', 250, 158, { size: 10.5, faint: true });
});

/* VI — 1 color appears as 2 */
fig('c6', 720, 180, function (s) {
  field(s, 40, 30, 280, 108, '#e9e9e9');
  field(s, 400, 30, 280, 108, '#3a3a3a');
  field(s, 152, 56, 56, 56, '#8a6a4a', { bare: true });
  field(s, 512, 56, 56, 56, '#8a6a4a', { bare: true });
  label(s, 'one and the same color', 152, 158, { size: 10.5, bold: true });
  label(s, 'one and the same color', 512, 158, { size: 10.5, bold: true });
});

/* VII — 2 different colors look alike */
fig('c7', 720, 180, function (s) {
  field(s, 40, 30, 280, 108, '#d8cfc0');
  field(s, 400, 30, 280, 108, '#6f6a63');
  field(s, 152, 56, 56, 56, '#8c8f96', { bare: true });
  field(s, 512, 56, 56, 56, '#9aa0a6', { bare: true });
  label(s, '2 different colors', 152, 158, { size: 10.5, bold: true });
  label(s, 'look alike', 512, 158, { size: 10.5, bold: true });
});

/* VIII — why color deception: the after-image */
fig('c8', 720, 180, function (s) {
  s.push(); s.noStroke(); s.fill(G); s.ellipse(150, 84, 116, 116);
  s.fill(INK); s.ellipse(150, 84, 12, 12); s.pop();
  label(s, 'staring steadily at the marked center', 150, 168, { align: s.CENTER, size: 10.5 });
  arrow(s, 240, 400, 84);
  s.push(); s.noStroke(); s.fill('#d07a9c'); s.ellipse(500, 84, 116, 116); s.pop();
  s.push(); s.noFill(); s.stroke('#d07a9c'); s.strokeWeight(2);
  s.drawingContext.setLineDash([4, 4]); s.ellipse(640, 84, 116, 116); s.drawingContext.setLineDash([]); s.pop();
  label(s, 'after-image', 500, 168, { align: s.CENTER, size: 10.5, bold: true });
});

/* IX — color mixture in paper: the book's own arrangement */
fig('c9', 720, 190, function (s) {
  field(s, 80, 30, 260, 74, B, { bare: true });
  field(s, 250, 30, 74, 148, G, { bare: true });
  field(s, 150, 104, 220, 74, Y, { bare: true });
  label(s, 'blue', 92, 24, { size: 10.5 });
  label(s, 'green', 336, 62, { size: 10.5 });
  label(s, 'yellow', 386, 148, { size: 10.5 });
  label(s, 'no way of mixing the colors mechanically', 80, 186, { size: 10.5, bold: true });
});

/* X — factual mixtures: additive, subtractive */
fig('c10', 720, 190, function (s) {
  field(s, 30, 30, 320, 130, '#101010', { bare: true });
  s.push(); s.blendMode(s.LIGHT); s.noStroke();
  s.fill('#e02020'); s.ellipse(150, 78, 132, 132);
  s.fill('#20c020'); s.ellipse(220, 124, 132, 132);
  s.fill('#2040e0'); s.ellipse(220, 58, 132, 132);
  s.pop();
  rule(s, 30, 30, 320, 130);
  label(s, 'direct color', 30, 176, { size: 10.5, bold: true });

  field(s, 380, 30, 320, 130, '#fdfdfd', { bare: true });
  s.push(); s.blendMode(s.MULTIPLY); s.noStroke();
  s.fill('#e02020'); s.ellipse(500, 78, 132, 132);
  s.fill('#20c020'); s.ellipse(570, 124, 132, 132);
  s.fill('#2040e0'); s.ellipse(570, 58, 132, 132);
  s.pop();
  rule(s, 380, 30, 320, 130);
  label(s, 'reflected colors', 380, 176, { size: 10.5, bold: true });
});

/* XI — transparence and space-illusion */
fig('c11', 720, 180, function (s) {
  field(s, 60, 60, 260, 100, B, { bare: true });
  s.push(); s.noStroke(); s.fill(216, 178, 58, 170); s.rect(200, 26, 260, 100); s.pop();
  rule(s, 60, 60, 260, 100);
  rule(s, 200, 26, 260, 100);
  label(s, 'transparence and space-illusion', 200, 170, { size: 10.5 });
  label(s, 'space-illusion', 560, 170, { size: 10.5, bold: true });
});

/* XII — optical mixture */
fig('c12', 720, 180, function (s) {
  field(s, 30, 28, 300, 112, PAPER, { bare: true });
  s.push(); s.noStroke();
  for (let y = 0; y < 14; y++) {
    for (let x = 0; x < 30; x++) {
      s.fill((x + y) % 2 ? Y : B);
      s.ellipse(38 + x * 9.7, 36 + y * 7.7, 4.6, 4.6);
    }
  }
  s.pop();
  rule(s, 30, 28, 300, 112);
  label(s, 'yellow and blue', 30, 158, { size: 10.5 });
  label(s, 'in small dots', 30, 172, { size: 10.5 });
  arrow(s, 348, 442, 84);
  field(s, 460, 28, 220, 112, '#6f9a5a', { bare: true });
  rule(s, 460, 28, 220, 112);
  label(s, 'optical mixture', 460, 158, { size: 10.5, bold: true });
});

/* XIII — the Bezold Effect */
fig('c13', 720, 180, function (s) {
  const pattern = [
    [B, B, B, B, B],
    [B, '#c9c9c9', B, '#c9c9c9', B],
    [B, B, '#d8b23a', B, B],
    [B, '#c9c9c9', B, '#c9c9c9', B],
    [B, B, B, B, B]
  ];
  function grid(x0, one) {
    pattern.forEach(function (row, r) {
      row.forEach(function (c, i) {
        field(s, x0 + i * 30, 30 + r * 30, 28, 28, (r === 2 && i === 2) ? one : c, { bare: true });
      });
    });
  }
  grid(90, B);
  grid(450, R);
  label(s, 'changing 1 color only', 90, 174, { size: 10.5 });
  label(s, 'changing 1 color only', 450, 174, { size: 10.5 });
});

/* XIV — color intervals and transformation */
fig('c14', 720, 180, function (s) {
  const ks = [.78, .5, .28, .06];
  ks.forEach(function (t, i) {
    field(s, 60 + i * 92, 30, 84, 50, lighter(V, t), { bare: true });
    field(s, 60 + i * 92, 96, 84, 50, mix(V, INK, t), { bare: true });
  });
  label(s, 'high', 60, 24, { size: 10.5, bold: true });
  label(s, 'low', 60, 162, { size: 10.5, bold: true });
  label(s, 'intervals', 460, 92, { size: 10.5, bold: true });
});

/* XV — the middle mixture */
fig('c15', 720, 180, function (s) {
  field(s, 90, 34, 150, 100, '#e0a89a', { bare: true });
  field(s, 260, 34, 150, 100, '#c0603f', { bare: true });
  field(s, 430, 34, 150, 100, '#6e2a1c', { bare: true });
  seg(s, 260, 152, 410, 152);
  seg(s, 260, 146, 260, 158);
  seg(s, 410, 146, 410, 158);
  label(s, 'a true middle mixture', 260, 174, { size: 10.5, bold: true });
});

/* XVI — color juxtaposition: quantity */
fig('c16', 720, 180, function (s) {
  field(s, 60, 30, 260, 108, R, { bare: true });
  field(s, 250, 62, 70, 44, B, { bare: true });
  field(s, 400, 30, 260, 108, B, { bare: true });
  field(s, 400, 62, 70, 44, R, { bare: true });
  label(s, 'quantity', 60, 158, { size: 10.5, bold: true });
  label(s, 'quantity', 400, 158, { size: 10.5, bold: true });
});

/* XVII — film color and volume color */
fig('c17', 720, 185, function (s) {
  s.push(); s.noStroke(); s.fill('#4a5a48');
  s.triangle(60, 150, 190, 46, 320, 150); s.pop();
  s.push(); s.noStroke(); s.fill(47, 111, 176, 118); s.rect(40, 30, 300, 120); s.pop();
  rule(s, 40, 30, 300, 120);
  label(s, 'film color', 40, 174, { size: 10.5, bold: true });

  s.push(); s.noStroke(); s.fill('#8e2f2a');
  s.rect(500, 78, 96, 72);
  s.triangle(500, 78, 596, 78, 548, 30);
  s.fill('#f0e6dd'); s.rect(528, 20, 40, 14);
  s.pop();
  rule(s, 500, 78, 96, 72);
  label(s, 'volume color', 500, 174, { size: 10.5, bold: true });
});

/* XVIII — free studies */
fig('c18', 720, 180, function (s) {
  const cols = [R, B, Y, G, V, O, C, M, N, lighter(R, .5), lighter(B, .45), lighter(G, .4),
                darker(Y, .25), darker(C, .3), mix(R, B, .5), mix(B, G, .5), mix(Y, R, .45), lighter(V, .5)];
  let k = 0;
  for (let r = 0; r < 3; r++) {
    for (let c = 0; c < 9; c++) {
      field(s, 40 + c * 72, 26 + r * 42, 68, 38, cols[(k++ * 7) % cols.length], { bare: true });
    }
  }
  label(s, 'free studies', 40, 172, { size: 10.5, bold: true });
});

/* XIX — the Masters: instrumentation */
fig('c19', 720, 185, function (s) {
  const palette = ['#6b4a2f', '#a8763c', '#d8b25a', '#8e9a6b', '#3f5a76', '#8a3a34', '#d9c9b0', '#241f1c'];
  palette.forEach(function (c, i) {
    field(s, 60 + i * 74, 30, 68, 52, c, { bare: true });
    const p = hex(c), v = (p[0] * .3 + p[1] * .59 + p[2] * .11) / 255;
    field(s, 60 + i * 74, 104, 68, 34, rgb([v * 255, v * 255, v * 255]), { bare: true });
  });
  label(s, 'color instrumentation', 60, 162, { size: 10.5, bold: true });
  label(s, 'light intensities', 320, 162, { size: 10.5, faint: true });
});

/* XX — the Weber-Fechner Law: equal steps, and the curve the eye makes of them */
fig('c20', 720, 190, function (s) {
  const equal = [18, 36, 54, 72, 90, 108];
  equal.forEach(function (h, i) {
    field(s, 50 + i * 46, 156 - h, 44, h, lighter(B, 1 - i / 7), { bare: true });
  });
  s.push(); s.noStroke(); s.stroke(INK); s.strokeWeight(1); s.noFill();
  s.line(50, 156, 50 + 5 * 46 + 44, 156 - 108);
  s.pop();
  label(s, 'a row of rising steps of equal height and width', 50, 182, { size: 10.5 });

  const stepped = [8, 14, 24, 40, 58, 66];
  stepped.forEach(function (h, i) {
    field(s, 410 + i * 46, 156 - h, 44, h, lighter(B, 1 - i / 7), { bare: true });
  });
  s.push(); s.noStroke(); s.stroke(INK); s.strokeWeight(1); s.noFill();
  s.beginShape();
  for (let i = 0; i < 6; i++) s.vertex(410 + i * 46 + 22, 156 - stepped[i]);
  s.endShape();
  s.pop();
  label(s, 'the physically straight line of direction becomes psychologically a curve', 410, 182, { size: 10.5 });
});

/* XXI — from color temperature to humidity in color */
fig('c21', 720, 190, function (s) {
  for (let x = 0; x < 7; x++) {
    for (let y = 0; y < 5; y++) {
      const base = mix('#c8502a', '#2f6fb0', x / 6);
      field(s, 90 + x * 74, 30 + y * 26, 72, 24,
            y < 2 ? mix(base, PAPER, (2 - y) / 3) : mix(base, darker(base, .3), (y - 2) / 2),
            { bare: true });
    }
  }
  label(s, 'warm', 90, 24, { size: 10.5, bold: true });
  label(s, 'cool', 500, 24, { size: 10.5, bold: true });
  label(s, 'dry', 24, 46, { size: 10.5 });
  label(s, 'wet', 24, 168, { size: 10.5 });
});

/* XXII — vibrating boundaries */
fig('c22', 720, 180, function (s) {
  field(s, 60, 30, 268, 108, R, { bare: true });
  field(s, 352, 30, 268, 108, G, { bare: true });
  s.push(); s.noStroke();
  for (let i = 0; i < 44; i++) {
    s.fill(i % 2 ? R : G);
    s.rect(328 + (i % 4) * 3, 30 + i * 2.45, 3, 2.45);
    s.rect(352 - (i % 4) * 3, 30 + i * 2.45, 3, 2.45);
  }
  s.pop();
  label(s, 'vibrating boundaries', 60, 160, { size: 10.5, bold: true });
  label(s, 'contrasting in their hues', 300, 160, { size: 10.5 });
  label(s, 'close or similar in light intensity', 300, 174, { size: 10.5 });
});

/* XXIII — equal light intensity: vanishing boundaries */
fig('c23', 720, 180, function (s) {
  field(s, 60, 30, 140, 108, '#b08a4a', { bare: true });
  field(s, 200, 30, 140, 108, '#4a8a8f', { bare: true });
  seg(s, 200, 24, 200, 144, { w: 1.6 });
  label(s, 'articulate boundaries', 60, 160, { size: 10.5 });

  field(s, 400, 30, 140, 108, '#b08a4a', { bare: true });
  field(s, 540, 30, 140, 108, '#4a8a8f', { bare: true });
  label(s, 'vanishing boundaries', 400, 160, { size: 10.5, bold: true });
});

/* XXIV — color systems: the wheel and its primaries */
fig('c24', 720, 190, function (s) {
  const cx = 150, cy = 96, r = 72;
  const hues = ['#d93a2b', '#e07a24', '#e6c02c', '#8fae3c', '#3f9b62', '#2f9bb0',
                '#2f5fb0', '#5a4fa3', '#7a4fa3', '#a83f8a', '#c8398a', '#d93a5c'];
  s.push(); s.noStroke();
  for (let i = 0; i < 12; i++) {
    const a0 = i * 30 * Math.PI / 180, a1 = (i + 1) * 30 * Math.PI / 180;
    s.fill(hues[i]);
    s.beginShape();
    s.vertex(cx, cy);
    for (let t = 0; t <= 8; t++) {
      const a = a0 + (a1 - a0) * t / 8;
      s.vertex(cx + r * Math.cos(a), cy + r * Math.sin(a));
    }
    s.endShape();
  }
  s.pop();
  s.push(); s.noStroke(); s.fill(PAPER); s.ellipse(cx, cy, 40, 40); s.pop();
  [0, 4, 8].forEach(function (i) {
    const a = (i * 30 + 15) * Math.PI / 180;
    seg(s, cx + 20 * Math.cos(a), cy + 20 * Math.sin(a), cx + (r + 14) * Math.cos(a),
        cy + (r + 14) * Math.sin(a), { w: 1.6 });
  });
  label(s, 'primaries', cx, 186, { align: s.CENTER, size: 10.5, bold: true });
  label(s, 'color systems', 300, 96, { size: 10.5, bold: true });
});

/* XXV — practice before theory */
fig('c25', 720, 180, function (s) {
  const boxes = [['practice', 60], ['practice', 260], ['theory', 460]];
  boxes.forEach(function (b, i) {
    field(s, b[1], 50, 160, 76, i === 2 ? lighter(N, .72) : lighter(B, .72), { bare: false });
    label(s, b[0], b[1] + 80, 94, { align: s.CENTER, size: 11, bold: true });
    if (i < 2) arrow(s, b[1] + 168, b[1] + 192, 88);
  });
  label(s, 'a laboratory or workshop course', 60, 158, { size: 10.5 });
});
