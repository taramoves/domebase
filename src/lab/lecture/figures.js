/* lecture — the figures.
   p5 in instance mode, one canvas per figure; all still except the introduction's items,
   which the reader can put in any order.
   Every diagram is redrawn from a figure in writings/bligh5.pdf (Bligh, What's the Use of
   Lectures?, ch. 5, printed pages 69-88). The geometry follows the printed original; every word
   on a canvas is the book's own. Black on white, hairlines, Arial — the sheet's terms. */

p5.disableFriendlyErrors = true;

const INK = '#000000', HAIR = '#c9c9c9', PAPER = '#ffffff';
const FONT = 'Arial, Helvetica, sans-serif';

/* ---------- shared drawing ---------- */

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

function rule(s, x1, x2, y, dash) {
  seg(s, x1, y, x2, y, { dash: dash || [] });
}

/* an open V head, as the printed figures use */
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

/* a cell of a ruled grid: the sheet's hairline, or the figure's own line */
function cell(s, x, y, w, h, o) {
  o = o || {};
  s.push();
  s.fill(PAPER);
  s.stroke(o.hair ? HAIR : INK);
  s.strokeWeight(1);
  s.drawingContext.setLineDash(o.dash ? [4, 4] : []);
  s.rect(x, y, w, h);
  s.drawingContext.setLineDash([]);
  s.pop();
}

/* ---------- the frame: one p5 instance per figure ---------- */

function fig(id, w, h, draw, handlers) {
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
      if (handlers && handlers.ready) handlers.ready(s, c);
      s.noLoop();
    };
    /* still by default: draw runs once. A figure with handlers asks for s.redraw(). */
    s.draw = function () { s.clear(); draw(s); };
    if (handlers) {
      ['mousePressed', 'mouseDragged', 'mouseReleased', 'mouseMoved',
       'touchStarted', 'touchMoved', 'touchEnded'].forEach(function (k) {
        if (handlers[k]) s[k] = function () { handlers[k](s); return false; };
      });
    }
  }, host);
}

/* ---------- figure 5.1. the classification hierarchy ---------- */

fig('f51', 660, 232, function (s) {
  const bx = 330, by = 26;
  s.push();
  s.fill(PAPER);
  s.stroke(INK);
  s.strokeWeight(1);
  s.rect(bx - 112, by - 15, 224, 30);
  s.pop();
  label(s, 'Topic (Title of Lecture)', bx, by + 4, { align: s.CENTER });

  seg(s, bx, by + 15, bx, 60);
  seg(s, 190, 60, 470, 60);
  seg(s, 190, 60, 190, 74);
  seg(s, 470, 60, 470, 74);
  node(s, 190, 86, 11, 'I');
  node(s, 470, 86, 11, 'II');

  /* I: three points, the second of them with two of its own */
  seg(s, 190, 97, 190, 120);
  seg(s, 150, 120, 230, 120);
  [150, 190, 230].forEach(function (x, i) {
    seg(s, x, 120, x, 130);
    node(s, x, 140, 10, String(i + 1));
  });
  seg(s, 190, 150, 190, 172);
  seg(s, 168, 172, 214, 172);
  [168, 214].forEach(function (x, i) {
    seg(s, x, 172, x, 180);
    label(s, '(' + 'ab'[i] + ')', x, 194, { align: s.CENTER });
  });

  /* II: two points, the first of them with three */
  seg(s, 470, 97, 470, 120);
  seg(s, 450, 120, 490, 120);
  [450, 490].forEach(function (x, i) {
    seg(s, x, 120, x, 130);
    node(s, x, 140, 10, String(i + 1));
  });
  seg(s, 450, 150, 450, 172);
  seg(s, 410, 172, 490, 172);
  [410, 450, 490].forEach(function (x, i) {
    seg(s, x, 172, x, 180);
    label(s, '(' + 'abc'[i] + ')', x, 194, { align: s.CENTER });
  });
});

/* ---------- figure 5.2. the blackboard organization of a hierarchic lecture ---------- */

fig('f52', 660, 376, function (s) {
  const rows = [
    ['I', 0, []],
    ['1.', 24, [7, 4]],
    ['2.', 24, [7, 4]],
    ['(a)', 48, [1.5, 3]],
    ['(b)', 48, [1.5, 3]],
    ['3.', 24, [8, 3, 1.5, 3]],
    ['II', 0, []],
    ['1.', 24, [7, 4]],
    ['(a)', 48, [1.5, 3]],
    ['(b)', 48, [1.5, 3]],
    ['(c)', 48, [1.5, 3]],
    ['2.', 24, [7, 4]]
  ];
  rows.forEach(function (r, i) {
    const y = 24 + i * 30;
    label(s, r[0], 30 + r[1], y + 4);
    rule(s, 104 + r[1], 620, y, r[2]);
  });
});

/* ---------- figure 5.3. the problem-centered lecture ---------- */

fig('f53', 700, 300, function (s) {
  const P = { x: 360, y: 40 };
  s.push();
  s.fill(PAPER);
  s.stroke(INK);
  s.strokeWeight(1);
  s.ellipse(P.x, P.y, 104, 40);
  s.pop();
  label(s, 'Problem', P.x, P.y + 4, { align: s.CENTER });

  const H = [{ x: 225, y: 116 }, { x: 360, y: 116 }, { x: 495, y: 116 }];
  const E = [];
  for (let i = 0; i < 12; i++) E.push({ x: 152 + i * 36, y: 252 });

  E.forEach(function (e) {
    H.forEach(function (h) { arrow(s, e.x, e.y - 7, h.x, h.y + 13, { gap: 1 }); });
    node(s, e.x, e.y, 7, '');
  });
  H.forEach(function (h, i) { node(s, h.x, h.y, 13, String(i + 1)); });
  H.forEach(function (h) { arrow(s, h.x, h.y - 13, P.x, P.y + 20); });

  label(s, 'Lines of', 640, 56);
  label(s, 'questioning', 640, 70);
  arrow(s, 640, 82, 640, 246);

  label(s, 'Possible', 20, 104);
  label(s, 'solutions', 20, 118);
  label(s, '(hypotheses)', 20, 132);
  label(s, 'Lines of', 20, 172);
  label(s, 'reasoning', 20, 186);
  label(s, '(inferences)', 20, 200);
  label(s, 'Items of', 20, 226);
  label(s, 'information', 20, 240);
  label(s, '(evidence)', 20, 254);
});

/* ---------- figure 5.4. a six-point chaining lecture ---------- */

fig('f54', 700, 300, function (s) {
  const r = 12, TOP = 46;
  const X = { 1: 42, 2: 104, 3: 166, 4: 366, 5: 428, 6: 588 };

  [1, 2, 3, 4, 5, 6].forEach(function (n) { node(s, X[n], TOP, r, String(n)); });
  [1, 2, 4].forEach(function (n) { arrow(s, X[n] + r, TOP, X[n + 1] - r, TOP); });

  /* taking stock after 3, then on to 4 */
  var LX = 256;
  label(s, 'Taking stock', LX, 24, { align: s.CENTER });
  seg(s, X[3] + 10, TOP + 7, LX, 92);
  [3, 2, 1].forEach(function (n, i) {
    const y = 104 + i * 38;
    node(s, LX, y, r, String(n));
    if (i) arrow(s, LX, y - 38 + r, LX, y - r);
  });
  arrow(s, LX, 104 + 2 * 38 + r, X[4] - r, TOP);

  /* taking stock after 5, then on to 6 */
  LX = 500;
  label(s, 'Taking stock', LX, 24, { align: s.CENTER });
  seg(s, X[5] + 10, TOP + 7, LX, 92);
  [5, 4, 3, 2, 1].forEach(function (n, i) {
    const y = 104 + i * 38;
    node(s, LX, y, r, String(n));
    if (i) arrow(s, LX, y - 38 + r, LX, y - r);
  });
  arrow(s, LX, 104 + 4 * 38 + r, X[6] - r, TOP);

  /* summary after 6 */
  LX = 656;
  label(s, 'Summary', LX, 24, { align: s.CENTER });
  seg(s, X[6] + 10, TOP + 7, LX, 62);
  [6, 5, 4, 3, 2, 1].forEach(function (n, i) {
    const y = 74 + i * 36;
    node(s, LX, y, r, String(n));
    if (i) arrow(s, LX, y - 36 + r, LX, y - r);
  });
});

/* ---------- figures 5.5 and 5.6. the comparison ---------- */

fig('f56', 620, 322, function (s) {
  const x0 = 30, x1 = 210, x2 = 400, x3 = 590;
  const yTop = 6, yHead = 44, yMid = 190, yBot = 316;

  /* the head row: the criterion, and a column for each item compared */
  cell(s, x0, yTop, x3 - x0, yHead - yTop);
  cell(s, x0, yTop, x1 - x0, yHead - yTop);
  cell(s, x1, yTop, x2 - x1, yHead - yTop);
  cell(s, x2, yTop, x3 - x2, yHead - yTop);
  label(s, 'Criterion of:', x0 + 8, yTop + 24, { bold: true, size: 11 });

  /* contrasts: one row per point, a cell in each item's column */
  cell(s, x0, yHead, x1 - x0, yMid - yHead);
  cell(s, x1, yHead, x2 - x1, yMid - yHead);
  cell(s, x2, yHead, x3 - x2, yMid - yHead);
  label(s, 'Contrasts', x0 + 8, yHead + 16, { size: 10.5 });
  ['1.', '2.', '3.', '4.'].forEach(function (n, i) {
    const y = yHead + 18 + 30 * (i + 1);
    label(s, n, x0 + 8, y, { size: 11 });
    label(s, n, x1 + 10, y, { size: 11 });
    label(s, n, x2 + 10, y, { size: 11 });
  });

  /* similarities: one row per point, and one cell across both items */
  cell(s, x0, yMid, x3 - x0, yBot - yMid);
  cell(s, x0, yMid, x1 - x0, yBot - yMid);
  label(s, 'Similarities', x0 + 8, yMid + 18, { size: 10.5 });
  ['1.', '2.', '3.'].forEach(function (n, i) {
    const y = yMid + 20 + 30 * (i + 1);
    label(s, n, x0 + 8, y, { size: 11 });
    label(s, n, x1 + 10, y, { size: 11 });
  });
});

/* ---------- figure 5.7. the form of a thesis lecture ---------- */

fig('f57', 640, 320, function (s) {
  label(s, 'Propositions', 30, 22, { bold: true, size: 11 });
  label(s, 'in a chain of', 30, 36, { bold: true, size: 11 });
  label(s, 'argument', 30, 50, { bold: true, size: 11 });
  label(s, 'Evidence', 250, 22, { bold: true, size: 11 });
  label(s, '(or explicit', 250, 36, { bold: true, size: 11 });
  label(s, 'assumptions)', 250, 50, { bold: true, size: 11 });
  label(s, 'Raw data,', 440, 22, { bold: true, size: 11 });
  label(s, 'detailed evidence,', 440, 36, { bold: true, size: 11 });
  label(s, 'or assumptions', 440, 50, { bold: true, size: 11 });

  const PX = 110, r = 12;
  const P = { 4: 80, 3: 140, 2: 218, 1: 284 };
  [[1, 2], [2, 3], [3, 4]].forEach(function (p) {
    arrow(s, PX, P[p[0]] - r, PX, P[p[1]] + r);
  });
  [4, 3, 2, 1].forEach(function (n) { node(s, PX, P[n], r, String(n), { square: true }); });

  /* evidence into 3, and into 2, and into 1 */
  var fan = [['(a)', 118], ['(b)', 132], ['(c)', 146]];
  fan.forEach(function (e) { label(s, e[0], 250, e[1], { size: 11 }); arrow(s, 244, e[1] - 4, PX + r + 2, P[3]); });

  label(s, '(a)', 262, 206, { size: 11 });
  label(s, '(b)', 236, 228, { size: 11 });
  label(s, '(i)', 430, 196, { size: 11 });
  label(s, '(ii)', 430, 214, { size: 11 });
  arrow(s, 256, 202, PX + r + 2, P[2]);
  arrow(s, 234, 224, PX + r + 2, P[2] + 6);
  arrow(s, 424, 200, 274, 206);

  label(s, '(a)', 262, 284, { size: 11 });
  arrow(s, 256, 280, PX + r + 2, P[1]);
});

/* ---------- figure 5.9. the logical dichotomy ---------- */

fig('f59', 560, 244, function (s) {
  const x1 = 240, x2 = 380, x3 = 520, y1 = 66, y2 = 142, y3 = 218;

  /* the two axes are two dichotomies: one across, one down. The four cells are what they make. */
  const cx1 = (x1 + x2) / 2, cx2 = (x2 + x3) / 2, cy1 = (y1 + y2) / 2, cy2 = (y2 + y3) / 2;
  rule(s, cx1, cx2, 34);
  seg(s, cx1, 34, cx1, 44);
  seg(s, cx2, 34, cx2, 44);
  label(s, 'dichotomy', (x1 + x3) / 2, 24, { align: s.CENTER });

  seg(s, 210, cy1, 210, cy2);
  seg(s, 210, cy1, 226, cy1);
  seg(s, 210, cy2, 226, cy2);
  label(s, 'dichotomy', 200, 148, { align: s.RIGHT });

  cell(s, x1, y1, x2 - x1, y2 - y1);
  cell(s, x1, y2, x2 - x1, y3 - y2);
  cell(s, x2, y1, x3 - x2, y2 - y1);
  cell(s, x2, y2, x3 - x2, y3 - y2);

  label(s, '(1)', x1 + 8, y1 + 22, { size: 10.5 });
  label(s, '(2)', x1 + 8, y2 + 22, { size: 10.5 });
  label(s, '(3)', x2 + 8, y1 + 22, { size: 10.5 });
  label(s, '(4)', x2 + 8, y2 + 22, { size: 10.5 });
});

/* ---------- figure 5.12. a network ---------- */

fig('f512', 470, 400, function (s) {
  const cx = 235, cy = 200, R = 150, r = 6;
  const N = [];
  for (let k = 0; k < 8; k++) {
    const a = -Math.PI / 2 + k * Math.PI / 4;
    N.push({ x: cx + R * Math.cos(a), y: cy + R * Math.sin(a) });
  }
  s.push();
  s.noFill();
  s.stroke(INK);
  s.strokeWeight(1);
  s.ellipse(cx, cy, 2 * R, 2 * R);
  s.pop();
  for (let i = 0; i < N.length; i++)
    for (let j = i + 1; j < N.length; j++)
      seg(s, N[i].x, N[i].y, N[j].x, N[j].y, { dash: [5, 4] });
  N.forEach(function (n) { node(s, n.x, n.y, r, ''); });
});

/* ---------- table 5.2. the introduction's items, in any order ---------- */

(function () {
  const cw = 74, x0 = 24, rowY = 116, th = 40, tw = 66;
  const bands = [['aims', 0, 3], ['context', 3, 6], ['framework', 6, 8]];
  const order = [1, 2, 3, 4, 5, 6, 7, 8];
  let held = -1, over = -1, mx = 0, my = 0, el = null;

  function slotAt(x, y) {
    if (y < rowY - 12 || y > rowY + th + 12) return -1;
    const i = Math.floor((x - x0) / cw);
    return (i < 0 || i > 7) ? -1 : i;
  }
  function place(to) {
    if (to === -1 || to === held) return;
    order.splice(to, 0, order.splice(held, 1)[0]);
    held = to;
  }

  fig('fseq', 660, 232, function (s) {
    /* the book's three bands, over the slots it recommends */
    bands.forEach(function (b) {
      const a = x0 + b[1] * cw + (cw - tw) / 2, z = x0 + b[2] * cw - (cw - tw) / 2;
      label(s, b[0], (a + z) / 2, 62, { align: s.CENTER, size: 11 });
      rule(s, a, z, 74);
      seg(s, a, 74, a, 84);
      seg(s, z, 74, z, 84);
    });

    for (let i = 0; i < 8; i++) {
      cell(s, x0 + i * cw + (cw - tw) / 2, rowY, tw, th);
      if (held !== i) label(s, order[i] + '.', x0 + i * cw + (cw - tw) / 2 + 10, rowY + 25, { size: 11 });
    }

    if (held !== -1) {
      /* the item in hand, and where the book puts it */
      cell(s, x0 + (order[held] - 1) * cw + (cw - tw) / 2, rowY, tw, th, { hair: true, dash: true });
      if (over !== -1 && over !== held) cell(s, x0 + over * cw + (cw - tw) / 2, rowY, tw, th, { hair: true, dash: true });
      s.push();
      s.fill(PAPER);
      s.stroke(INK);
      s.strokeWeight(1);
      s.rect(mx - tw / 2, my - th / 2, tw, th);
      s.pop();
      label(s, order[held] + '.', mx - tw / 2 + 10, my + 5, { size: 11 });
    }

    label(s, 'drag the items', x0, 198, { size: 10.5 });
  }, {
    ready: function (s, c) { el = c.elt; },
    mousePressed: function (s) {
      const i = slotAt(s.mouseX, s.mouseY);
      if (i === -1) return;
      held = i; over = i; mx = s.mouseX; my = s.mouseY;
      if (el) el.style.cursor = 'grabbing';
      s.redraw();
    },
    mouseDragged: function (s) {
      if (held === -1) return;
      mx = s.mouseX; my = s.mouseY;
      place(slotAt(mx, my));
      s.redraw();
    },
    mouseReleased: function (s) {
      if (held === -1) return;
      held = -1; over = -1;
      if (el) el.style.cursor = 'default';
      s.redraw();
    },
    mouseMoved: function (s) {
      if (el) el.style.cursor = (slotAt(s.mouseX, s.mouseY) === -1) ? 'default' : 'grab';
    },
    touchStarted: function (s) { this.mousePressed(s); },
    touchMoved: function (s) { this.mouseDragged(s); },
    touchEnded: function (s) { this.mouseReleased(s); }
  });
})();
