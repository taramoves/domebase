/* editor.js — the state, the interaction and the panels.

   A deck is one JSON document. Elements are cards standing on the sphere; the canvas shows the
   master, so what is drawn here is what the projector receives. */
(function () {
  var D = dome.D;
  var LS = "domebase.surface.v1";
  var FIT = 0.94;                 // the disc sits inside the canvas' short side with a hair of margin
  var PNG_SIZES = ["1024", "2048", "4096"];
  var el = function (id) { return document.getElementById(id); };
  var G, canvas, stage, n = 0;

  var S = {
    project: null, i: 0, sel: null,
    view: "master", zoom: FIT, pan: [0, 0], yaw: 0, pitch: 16, fov: 100,
    undo: [], redo: [], drag: null, panning: false, space: false, present: false,
    pt: [0, 0], over: false
  };

  /* ---- the document --------------------------------------------------------------------- */
  function uid(p) { return (p || "e") + (++n) + "-" + Math.floor(Math.random() * 46656).toString(36); }
  function inkFor(slide) { return slide.ground === "black" ? "white" : "black"; }
  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function wrapAz(a) { a = a % 360; return a < 0 ? a + 360 : a; }
  function num(v, d) { var x = parseFloat(v); return isNaN(x) ? (d || 0) : x; }

  function blank() {
    return { version: 1, name: "untitled deck", fov: 180, png: 2048,
             slides: [{ id: uid("s"), ground: "paper", notes: "", prompt: true, promptSize: 3.2, elements: [] }] };
  }
  function starter() {
    var p = blank();
    p.name = "surface — first deck";
    var s = p.slides[0];
    s.notes = "Welcome. Point at the dome's back to read this.\nPitch is up, azimuth is around.";
    s.elements = [
      { id: uid("e"), kind: "text", az: 0, el: 26, rot: 0, size: 9, text: "surface",
        weight: "bold", align: "center", ink: "black", locked: false },
      { id: uid("e"), kind: "text", az: 0, el: 12, rot: 0, size: 4, text: "a slide tool for the dome",
        weight: "regular", align: "center", ink: "black", locked: false },
      { id: uid("e"), kind: "rect", az: 0, el: 19, rot: 0, w: 34, h: 0.5, fill: true, ink: "black", locked: false },
      { id: uid("e"), kind: "text", az: 90, el: 40, rot: 0, size: 3.5, text: "east",
        weight: "regular", align: "center", ink: "black", locked: false }
    ];
    var b = blank().slides[0];
    b.ground = "black";
    b.notes = "A black ground: the ink flips to white.";
    b.elements = [
      { id: uid("e"), kind: "text", az: 0, el: 24, rot: 0, size: 7, text: "black ground",
        weight: "bold", align: "center", ink: "white", locked: false },
      { id: uid("e"), kind: "text", az: 0, el: 10, rot: 0, size: 3.5, text: "az 0 is the front of the dome · az 180 the back",
        weight: "regular", align: "center", ink: "white", locked: false }
    ];
    p.slides.push(b);
    return p;
  }
  function open(json) {
    if (!json || !Array.isArray(json.slides) || !json.slides.length) throw new Error("not a deck");
    json.fov = json.fov || 180;
    json.png = json.png || 2048;
    json.slides.forEach(function (s) {
      s.id = s.id || uid("s"); s.ground = s.ground === "black" ? "black" : "paper";
      s.notes = s.notes || ""; s.promptSize = num(s.promptSize, 3.2);
      s.elements = Array.isArray(s.elements) ? s.elements : [];
      s.elements.forEach(function (e) {
        e.id = e.id || uid("e"); e.rot = num(e.rot, 0); e.locked = !!e.locked;
        e.ink = e.ink === "white" ? "white" : "black";
      });
    });
    S.project = json; S.i = 0; S.sel = null; S.undo.length = 0; S.redo.length = 0;
    G.reset(); renderAll(); fit();
  }

  function curSlide() { return S.project.slides[clamp(S.i, 0, S.project.slides.length - 1)]; }
  function sel() {
    var s = curSlide();
    for (var i = 0; i < s.elements.length; i++) if (s.elements[i].id === S.sel) return s.elements[i];
    return null;
  }
  /* the notes, as a card on the back of the dome. The zenith is up for whoever turns to read it,
     so the master shows it upside down: the geometry, not a flip. */
  function promptCard(slide) {
    if (!slide.prompt || !String(slide.notes || "").trim()) return null;
    return { id: "prompt", kind: "text", az: 180, el: 34, rot: 0, size: num(slide.promptSize, 3.2),
             text: slide.notes, weight: "regular", align: "left",
             ink: inkFor(slide), locked: true, wrap: 1400, prompt: true };
  }
  function cards(slide) { return slide.elements.concat(promptCard(slide) || []); }
  function texOf(e) { return G.texSize(e); }

  /* ---- history and saving ---------------------------------------------------------------- */
  var saveTimer = null;
  function push() {
    S.undo.push(JSON.stringify(S.project));
    if (S.undo.length > 120) S.undo.shift();
    S.redo.length = 0;
  }
  function restore(str) {
    S.project = JSON.parse(str); S.i = clamp(S.i, 0, S.project.slides.length - 1); S.sel = null;
    G.reset(); renderAll(); draw();
  }
  function undo() { if (!S.undo.length) return; S.redo.push(JSON.stringify(S.project)); restore(S.undo.pop()); after(); }
  function redo() { if (!S.redo.length) return; S.undo.push(JSON.stringify(S.project)); restore(S.redo.pop()); after(); }
  function after() { save(); }
  function save() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(function () {
      try { localStorage.setItem(LS, JSON.stringify(S.project)); } catch (e) {}
      el("note").textContent = "saved locally at " + new Date().toLocaleTimeString();
    }, 350);
  }

  /* ---- drawing --------------------------------------------------------------------------- */
  function fit() { G.setView({ zoom: S.zoom, pan: S.pan, yaw: S.yaw, pitch: S.pitch, fov: S.fov, mfov: S.project.fov || 180 }); G.fit(); }
  function draw() {
    var slide = curSlide();
    var v = G.viewport();
    G.setSlide(slide);
    G.setView({ view: S.view, zoom: S.zoom, pan: S.pan, yaw: S.yaw, pitch: S.pitch, fov: S.fov,
                mfov: S.project.fov || 180 });
    G.draw(cards(slide), S.sel);
    el("rSlide").textContent = (S.i + 1) + "/" + S.project.slides.length;
    el("rCards").textContent = slide.elements.length;
    el("rZoom").textContent = Math.round(S.zoom * 100) + "%";
    if (S.view === "centre") {
      el("rAz").textContent = S.yaw.toFixed(0); el("rEl").textContent = S.pitch.toFixed(0);
      el("rZoom").textContent = Math.round(S.fov) + "°";
    }
    var s = sel();
    el("rSel").textContent = s ? (s.kind + " az " + s.az.toFixed(1) + " el " + s.el.toFixed(1) + " · " +
      dome.azName(s.az)) : "none";
    if (S.over) {
      var dir = dome.fromMaster.apply(null, G.pxToMaster(S.pt[0], S.pt[1]));
      var ae = dome.azEl(dir);
      el("rAz").textContent = ae[0].toFixed(1); el("rEl").textContent = ae[1].toFixed(1);
    }
  }

  /* selection chrome: the card's projected outline, its handles, and the handle that turns it */
  var H = [[-1, -1], [1, -1], [1, 1], [-1, 1], [0, -1], [1, 0], [0, 1], [-1, 0]];
  function chrome() {
    var e = sel(); if (!e || S.view !== "master") return null;
    var m = dome.matrix(e, texOf(e));
    var out = dome.outline(m, 8).map(function (p) { return G.masterToPx(p[0], p[1]); });
    var handles = H.map(function (h) {
      var d = dome.point(m, h[0], h[1]), mm = dome.toMaster(d);
      return { p: G.masterToPx(mm[0], mm[1]), gx: h[0], gy: h[1] };
    });
    var top = handles[6].p, bot = handles[4].p;
    var ux = top[0] - bot[0], uy = top[1] - bot[1], l = Math.hypot(ux, uy) || 1;
    var to = [top[0] + ux / l * 26, top[1] + uy / l * 26];
    return { outline: out, handles: handles, rotate: { from: top, to: to, c: G.masterToPx.apply(null, dome.toMaster(m.n)) } };
  }

  /* ---- the pointer ----------------------------------------------------------------------- */
  function pt(e) { var r = canvas.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; }
  function dirAt(p) { var m = G.pxToMaster(p[0], p[1]); return dome.fromMaster(m[0], m[1]); }
  function snap(v, e) {
    if (e && e.shiftKey) return Math.round(v / 5) * 5;
    if (e && e.altKey) return Math.round(v * 10) / 10;
    return v;
  }
  function zoomAt(p, f) {
    if (S.view === "centre") {
      S.fov = clamp(S.fov / f, 20, 150); draw(); return;
    }
    var before = G.pxToMaster(p[0], p[1]);
    S.zoom = clamp(S.zoom * f, 0.15, 40);
    G.setView({ zoom: S.zoom }); G.fit();
    var after = G.pxToMaster(p[0], p[1]);
    S.pan = [S.pan[0] + before[0] - after[0], S.pan[1] + before[1] - after[1]];
    G.setView({ pan: S.pan }); draw();
  }

  function onDown(e) {
    canvas.focus();
    var p = pt(e);
    if (S.present) { if (e.button === 0) go(1); return; }
    if (S.view === "centre") {
      S.drag = { mode: "look", p0: p, yaw0: S.yaw, pitch0: S.pitch, moved: false };
      try { canvas.setPointerCapture(e.pointerId); } catch (err) {}
      return;
    }
    if (e.button === 1 || e.button === 2 || S.space) {
      S.drag = { mode: "pan", p0: p, pan0: S.pan.slice(), moved: true };
      try { canvas.setPointerCapture(e.pointerId); } catch (err) {}
      return;
    }
    var ch = chrome(), s0 = sel();
    if (ch && s0 && !s0.locked) {
      for (var i = 0; i < ch.handles.length; i++) {
        var h = ch.handles[i], d = Math.hypot(h.p[0] - p[0], h.p[1] - p[1]);
        if (d < 11) { push(); startScale(h, p); return; }
      }
      if (Math.hypot(ch.rotate.to[0] - p[0], ch.rotate.to[1] - p[1]) < 13) { push(); startRotate(ch, p); return; }
    }
    var hit = dome.pick(curSlide().elements, dirAt(p), texOf);
    if (hit) {
      if (S.sel !== hit.id) { S.sel = hit.id; renderProps(); }
      push();
      if (hit.locked) { S.drag = { mode: "locked" }; draw(); return; }
      var f = dome.basis(hit.az, hit.el), d0 = dirAt(p), t = dome.dot(d0, f.n);
      var q = t > 0.002 ? { x: dome.dot(d0, f.right) / t, y: dome.dot(d0, f.up) / t } : { x: 0, y: 0 };
      S.drag = { mode: "move", el: hit, n: f.n, right: f.right, up: f.up, x0: q.x, y0: q.y,
                 az0: hit.az, el0: hit.el, moved: false };
      try { canvas.setPointerCapture(e.pointerId); } catch (err) {}
      draw();
      return;
    }
    S.drag = { mode: "pan", p0: p, pan0: S.pan.slice(), moved: false, mayDeselect: true };
    try { canvas.setPointerCapture(e.pointerId); } catch (err) {}
    draw();
  }

  function startScale(h, p) {
    var e = sel(), m = dome.matrix(e, texOf(e));
    S.drag = { mode: "scale", el: e, m0: m, gx: h.gx, gy: h.gy,
               tanW0: m.tanW, tanH0: m.tanH, w0: m.w, h0: m.h,
               size0: num(e.size, 4), ew0: num(e.w, 20), eh0: num(e.h, 10) };
  }
  function startRotate(ch, p) {
    var e = sel();
    S.drag = { mode: "rotate", el: e, c: ch.rotate.c, rot0: num(e.rot, 0), sense: dome.turnSense(e.az, e.el),
               a0: Math.atan2(p[1] - ch.rotate.c[1], p[0] - ch.rotate.c[0]) };
  }

  function onMove(e) {
    S.pt = pt(e); S.over = true;
    var d = S.drag;
    if (!d) { draw(); return; }
    var p = S.pt;
    if (d.mode === "pan") {
      var sc = G.scale();
      var dx = p[0] - d.p0[0], dy = p[1] - d.p0[1];
      if (Math.hypot(dx, dy) > 3) d.moved = true;
      S.pan = [d.pan0[0] - dx / sc, d.pan0[1] + dy / sc];
      G.setView({ pan: S.pan }); draw(); return;
    }
    if (d.mode === "look") {
      var dx2 = p[0] - d.p0[0], dy2 = p[1] - d.p0[1];
      if (Math.hypot(dx2, dy2) > 3) d.moved = true;
      S.yaw = wrapAz(d.yaw0 - dx2 * 0.25);
      S.pitch = clamp(d.pitch0 + dy2 * 0.25, -80, 88);
      draw(); return;
    }
    if (d.mode === "locked") return;
    if (d.mode === "move") {
      var dd = dirAt(p);
      if (dome.dot(dd, d.n) <= 0.002) return;
      var ae = dome.follow(d.x0, d.y0, dd, d.az0, d.el0);
      d.el.el = clamp(snap(ae[1], e), 0, 90);
      d.el.az = wrapAz(snap(ae[0], e));
      d.moved = true;
      syncProps(); draw(); return;
    }
    if (d.mode === "scale") {
      var dir = dirAt(p), q = dome.locate(d.m0, dir);
      if (!q) return;
      var gx = d.gx, gy = d.gy, k = 1;
      var X1 = gx ? Math.abs(q.x) : d.tanW0, Y1 = gy ? Math.abs(q.y) : d.tanH0;
      var e2 = d.el;
      if (e2.kind === "rect") {
        var deg = function (t) { return 2 * Math.atan(Math.max(t, 1e-4)) / D; };
        e2.w = deg(X1); e2.h = deg(Y1);
      } else {
        if (gx) k = Math.max(k, X1 / d.tanW0);
        if (gy) k = Math.max(k, Y1 / d.tanH0);
        k = Math.max(k, 0.05);
        if (e2.kind === "text") e2.size = snap(d.size0 * k, e);
        else e2.w = d.ew0 * k;
      }
      /* hold the far edge still: the anchor stays where it was in the world */
      var m0 = d.m0, sx = gx ? Math.sign(gx) : 0, sy = gy ? Math.sign(gy) : 0;
      var A = dome.point(m0, sx ? -sx : 0, sy ? -sy : 0);
      var m1 = dome.matrix(e2, texOf(e2));
      var centre = dome.anchored(A, num(e2.rot, 0), sx, sy, sx ? m1.tanW : 0, sy ? m1.tanH : 0);
      var ae = dome.azEl(centre);
      e2.az = wrapAz(snap(ae[0], e)); e2.el = clamp(snap(ae[1], e), 0, 90);
      syncProps(); draw(); return;
    }
    if (d.mode === "rotate") {
      var a = Math.atan2(p[1] - d.c[1], p[0] - d.c[0]);
      d.el.rot = wrapAz(snap(d.rot0 + d.sense * (a - d.a0) / D, e));
      if (d.el.rot > 180) d.el.rot -= 360;
      syncProps(); draw();
    }
  }

  function onUp(e) {
    var d = S.drag;
    S.drag = null;
    if (!d) return;
    if (d.mayDeselect && !d.moved) { S.sel = null; }
    save(); renderProps(); draw();
  }

  /* ---- panels ---------------------------------------------------------------------------- */
  function renderAll() {
    el("name").value = S.project.name;
    el("noteDeck").textContent = S.project.slides.length + " slides · " +
      S.project.slides.reduce(function (a, s) { return a + s.elements.length; }, 0) + " cards";
    renderSlides(); renderProps();
  }
  function renderSlides() {
    var list = el("slideList");
    list.innerHTML = "";
    S.project.slides.forEach(function (s, i) {
      var row = document.createElement("div");
      row.className = "srow" + (i === S.i ? " on" : "");
      var title = "";
      for (var k = 0; k < s.elements.length; k++) if (s.elements[k].kind === "text") { title = s.elements[k].text; break; }
      row.innerHTML = '<span class="n">' + (i + 1) + '</span>' +
        '<span class="g' + (s.ground === "black" ? " black" : "") + '"></span>' +
        '<span class="t"></span>' +
        '<button class="k" data-up="1">↑</button><button class="k" data-down="1">↓</button><button class="k" data-del="1">✕</button>';
      row.querySelector(".t").textContent = (title || String(s.notes).split("\n")[0] || "—") +
        "  ·  " + s.elements.length;
      row.addEventListener("click", function (ev) {
        var up = ev.target.getAttribute("data-up"), dn = ev.target.getAttribute("data-down"),
            dl = ev.target.getAttribute("data-del");
        if (dl) { delSlide(i); return; }
        if (up || dn) {
          var j = i + (up ? -1 : 1);
          if (j < 0 || j >= S.project.slides.length) return;
          push();
          var a = S.project.slides;
          var t = a[i]; a[i] = a[j]; a[j] = t;
          S.i = j; S.sel = null; renderAll(); draw(); save();
          return;
        }
        S.i = i; S.sel = null; renderAll(); draw();
      });
      list.appendChild(row);
    });
    el("slideCount").textContent = S.project.slides.length;
  }
  function delSlide(i) {
    if (S.project.slides.length < 2) return;
    push();
    S.project.slides.splice(i, 1);
    S.i = clamp(S.i, 0, S.project.slides.length - 1); S.sel = null;
    renderAll(); draw(); save();
  }
  function addSlide() {
    push();
    var s = { id: uid("s"), ground: curSlide().ground, notes: "", prompt: curSlide().prompt,
              promptSize: curSlide().promptSize, elements: [] };
    S.project.slides.splice(S.i + 1, 0, s);
    S.i = S.i + 1; S.sel = null;
    renderAll(); draw(); save();
  }

  function syncProps() {
    var e = sel();
    if (!e) return;
    var setIf = function (id, v) { var f = el(id); if (document.activeElement !== f) f.value = v; };
    setIf("eAz", e.az.toFixed(1)); setIf("eEl", e.el.toFixed(1)); setIf("eRot", num(e.rot, 0).toFixed(1));
    el("eWhere").value = dome.azName(e.az) + (e.kind === "text" && Math.abs(Math.abs(((e.az % 360) + 360) % 360 - 180)) - 90 < 32 ? " · sideways" : "");
    if (e.kind === "text") setIf("eSize", num(e.size, 4).toFixed(2));
    if (e.kind !== "text") setIf("eW", num(e.w, 20).toFixed(1));
    if (e.kind === "rect") setIf("eH", num(e.h, 10).toFixed(1));
    if (e.kind === "text") setIf("eText", e.text);
    if (e.kind === "image") el("eImgLabel").textContent = e.src ? (/^data:/.test(e.src) ? "file, " + Math.round(e.src.length / 1024) + " KB" : e.src.slice(0, 40)) : "none";
    el("btnLock").textContent = e.locked ? "locked" : "lock";
    el("btnLock").setAttribute("aria-pressed", e.locked ? "true" : "false");
  }
  function renderProps() {
    var e = sel();
    el("pSel").style.display = e ? "" : "none";
    el("pSlide").style.display = e ? "none" : "";
    if (e) {
      el("pTitle").textContent = e.kind + " card";
      el("pKind").textContent = e.kind === "text" ? "text" : e.kind === "image" ? "image" : "box";
      el("eSizeRow").style.display = e.kind === "text" ? "" : "none";
      el("eBoxRow").style.display = e.kind === "text" ? "none" : "";
      el("eHRow").style.display = e.kind === "rect" ? "" : "none";
      el("eTextRow").style.display = e.kind === "text" ? "" : "none";
      el("eImgRow").style.display = e.kind === "image" ? "" : "none";
      el("eFillRow").style.display = e.kind === "rect" ? "" : "none";
      el("eWeight").value = e.weight === "bold" ? "bold" : "regular";
      el("eAlign").value = e.align || "center";
      el("eInk").value = e.ink === "white" ? "white" : "black";
      el("eFill").value = e.fill === false ? "hollow" : "solid";
      syncProps();
      return;
    }
    var s = curSlide();
    el("pTitle").textContent = "slide " + (S.i + 1);
    el("pKind").textContent = s.elements.length + " cards";
    if (document.activeElement !== el("sNotes")) el("sNotes").value = s.notes || "";
    if (document.activeElement !== el("sPromptSize")) el("sPromptSize").value = num(s.promptSize, 3.2).toFixed(1);
    el("btnPaper").setAttribute("aria-pressed", s.ground === "black" ? "false" : "true");
    el("btnBlack").setAttribute("aria-pressed", s.ground === "black" ? "true" : "false");
    el("btnPrompt").setAttribute("aria-pressed", s.prompt ? "true" : "false");
    el("sPromptWhere").value = s.prompt ? "back, el 34°" : "off";
    if (document.activeElement !== el("projFov")) el("projFov").value = num(S.project.fov, 180).toFixed(0);
    var ps = String(num(S.project.png, 2048));
    el("pngSize").value = PNG_SIZES.indexOf(ps) >= 0 ? ps : "2048";
  }

  /* ---- adding and editing cards ---------------------------------------------------------- */
  /* a new card lands under the pointer where the pointer is over the disc, and at the front
     otherwise — the zenith is a poor default, since azimuth means nothing at the pole */
  function viewCentre() {
    if (S.over) {
      var ae = dome.azEl(dirAt(S.pt));
      if (ae[1] > 4 && ae[1] < 86) return ae;
    }
    return [0, 30];
  }
  function addEl(e) {
    push();
    var s = curSlide(), ae = viewCentre();
    e.az = wrapAz(Math.round(ae[0] * 2) / 2); e.el = clamp(Math.round(ae[1] * 2) / 2, 0, 90);
    if (e.kind === "text") { e.size = 6; e.text = e.text || "text"; e.align = "center";
                             e.weight = "regular"; }
    e.ink = inkFor(s); e.rot = 0; e.locked = false;
    s.elements.push(e);
    S.sel = e.id;
    renderProps(); draw(); save();
  }
  function readImage(file, done) {
    var r = new FileReader();
    r.onload = function () { done(r.result); };
    r.readAsDataURL(file);
  }
  /* an image arrives three ways — the + image button, a drop on the dome, a paste — and becomes a
     card at the pointer in every one of them */
  function addFromFile(f) {
    if (!f || !/^image\//.test(f.type || "")) return false;
    readImage(f, function (src) { addEl({ id: uid("e"), kind: "image", src: src, w: 30 }); });
    return true;
  }
  function addFromPaste(dt) {
    if (!dt) return false;
    var got = false, i;
    if (dt.items && dt.items.length) {
      for (i = 0; i < dt.items.length; i++) {
        if (dt.items[i].kind === "file" && /^image\//.test(dt.items[i].type)) {
          got = addFromFile(dt.items[i].getAsFile()) || got;
        }
      }
    } else if (dt.files && dt.files.length) {
      for (i = 0; i < dt.files.length; i++) got = addFromFile(dt.files[i]) || got;
    }
    return got;
  }

  /* The domemaster that goes to the projector: the slide alone, square, the rim the horizon, black
     beyond it. It carries whatever the master shows, the notes on the dome included. */
  function exportMaster() {
    var size = clamp(num(S.project.png, 2048), 256, 8192);
    var c = G.domemaster(size, cards(curSlide()));
    if (!c) { alert("WebGL refused a frame to read back, so there is no master to save."); return; }
    c.toBlob(function (b) {
      var a = document.createElement("a");
      a.href = URL.createObjectURL(b);
      a.download = (S.project.name || "deck").replace(/[^\w\-]+/g, "-").toLowerCase() +
                   "-" + (S.i + 1) + "-" + size + ".png";
      document.body.appendChild(a); a.click();
      setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
    }, "image/png");
  }

  /* ---- keys ------------------------------------------------------------------------------ */
  function typing(t) { return t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.tagName === "SELECT"); }
  function onKey(e) {
    var t = e.target;
    if (S.present) {
      if (e.key === "Escape") { setPresent(false); return; }
      if (e.key === "ArrowRight" || e.key === "PageDown" || e.key === " ") { e.preventDefault(); go(1); return; }
      if (e.key === "ArrowLeft" || e.key === "PageUp") { e.preventDefault(); go(-1); return; }
      if (e.key === "m" || e.key === "c") { setView(e.key === "m" ? "master" : "centre"); return; }
      if (e.key === "t") { curSlide().prompt = !curSlide().prompt; draw(); return; }
      return;
    }
    if (typing(t)) {
      if (e.key === "Escape" && t.blur) t.blur();
      return;
    }
    var meta = e.metaKey || e.ctrlKey;
    if (meta && e.key.toLowerCase() === "z") { e.preventDefault(); e.shiftKey ? redo() : undo(); return; }
    if (meta && e.key.toLowerCase() === "y") { e.preventDefault(); redo(); return; }
    if (meta && e.key.toLowerCase() === "s") { e.preventDefault(); download(); return; }
    if (meta && e.key.toLowerCase() === "d") { e.preventDefault(); dup(); return; }
    if (e.key === " ") { S.space = true; canvas.style.cursor = "grab"; e.preventDefault(); return; }
    if (e.key === "Escape") { S.sel = null; renderProps(); draw(); return; }
    if (e.key === "m") return setView("master");
    if (e.key === "c") return setView("centre");
    if (e.key === "p") return setPresent(!S.present);
    if (e.key === "t") { push(); curSlide().prompt = !curSlide().prompt; renderProps(); draw(); save(); return; }
    if (e.key === "0") { S.zoom = FIT; S.pan = [0, 0]; G.setView({ zoom: FIT, pan: S.pan }); draw(); return; }
    if (e.key === "+" || e.key === "=") { var v = G.viewport(); return zoomAt([v.w / 2, v.h / 2], 1.15); }
    if (e.key === "-") { var v2 = G.viewport(); return zoomAt([v2.w / 2, v2.h / 2], 1 / 1.15); }
    var s = sel();
    if (!s) return;
    if (e.key === "Delete" || e.key === "Backspace") { e.preventDefault(); del(); return; }
    if (e.key === "[") { push(); zStep(s, -1); save(); renderProps(); draw(); return; }
    if (e.key === "]") { push(); zStep(s, 1); save(); renderProps(); draw(); return; }
    if (e.key === "l") { push(); s.locked = !s.locked; renderProps(); save(); return; }
    var step = e.shiftKey ? 5 : e.altKey ? 0.1 : 0.5, dx = 0, dy = 0;
    if (e.key === "ArrowLeft") dx = -1; else if (e.key === "ArrowRight") dx = 1;
    else if (e.key === "ArrowUp") dy = 1; else if (e.key === "ArrowDown") dy = -1;
    else return;
    e.preventDefault();
    push();
    s.az = wrapAz(s.az + dx * step / Math.max(0.3, Math.cos(s.el * D)));
    s.el = clamp(s.el + dy * step, 0, 90);
    syncProps(); draw(); save();
  }
  function go(step) {
    var i = S.i + step;
    if (i < 0 || i >= S.project.slides.length) return;
    S.i = i; S.sel = null; renderAll(); draw();
  }
  function del() {
    var s = curSlide(), e = sel(); if (!e) return;
    push();
    s.elements.splice(s.elements.indexOf(e), 1); S.sel = null;
    renderProps(); draw(); save();
  }
  function dup() {
    var s = curSlide(), e = sel(); if (!e) return;
    push();
    var c = JSON.parse(JSON.stringify(e));
    c.id = uid("e"); c.el = clamp(e.el - 3, 0, 90); c.az = wrapAz(e.az + 3);
    s.elements.push(c); S.sel = c.id;
    renderProps(); draw(); save();
  }
  function setView(v) {
    S.view = v;
    el("btnMaster").setAttribute("aria-pressed", v === "master" ? "true" : "false");
    el("btnCentre").setAttribute("aria-pressed", v === "centre" ? "true" : "false");
    draw();
  }
  function setPresent(on) {
    S.present = on;
    document.body.classList.toggle("present", on);
    el("btnPresent").setAttribute("aria-pressed", on ? "true" : "false");
    if (on) { if (stage.requestFullscreen) { try { stage.requestFullscreen(); } catch (er) {} } }
    else if (document.fullscreenElement) { try { document.exitFullscreen(); } catch (er) {} }
    G.fit(); draw();
  }
  function download() {
    var blob = new Blob([JSON.stringify(S.project, null, 1)], { type: "application/json" });
    var a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = (S.project.name || "deck").replace(/[^\w\-]+/g, "-").toLowerCase() + ".dome.json";
    document.body.appendChild(a); a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
  }

  /* ---- wiring ---------------------------------------------------------------------------- */
  function wire() {
    canvas.addEventListener("pointerdown", onDown);
    canvas.addEventListener("pointermove", onMove);
    canvas.addEventListener("pointerup", onUp);
    canvas.addEventListener("pointercancel", onUp);
    canvas.addEventListener("pointerleave", function () { S.over = false; });
    canvas.addEventListener("contextmenu", function (e) { e.preventDefault(); });
    canvas.addEventListener("wheel", function (e) {
      e.preventDefault(); zoomAt(pt(e), Math.exp(-e.deltaY * 0.0015));
    }, { passive: false });
    canvas.addEventListener("dblclick", function (e) {
      var hit = dome.pick(curSlide().elements, dirAt(pt(e)), texOf);
      if (hit && hit.kind === "text") { S.sel = hit.id; renderProps(); el("eText").focus(); }
    });
    document.addEventListener("keydown", onKey);
    document.addEventListener("keyup", function (e) { if (e.key === " ") { S.space = false; canvas.style.cursor = "default"; } });
    document.addEventListener("fullscreenchange", function () {
      if (S.present && !document.fullscreenElement) { S.present = false; document.body.classList.remove("present"); G.fit(); draw(); }
    });
    window.addEventListener("resize", function () { G.fit(); draw(); });

    el("btnNew").onclick = function () {
      if (!confirm("Start a new deck? The current one stays in the browser's saved copy until you save over it.")) return;
      S.project = blank(); S.i = 0; S.sel = null; S.undo.length = 0; S.redo.length = 0;
      G.reset(); renderAll(); draw(); save();
    };
    el("btnOpen").onclick = function () { el("file").click(); };
    el("file").onchange = function (ev) {
      var f = ev.target.files[0]; if (!f) return;
      var r = new FileReader();
      r.onload = function () { try { open(JSON.parse(r.result)); save(); } catch (er) { alert("That file is not a deck: " + er.message); } };
      r.readAsText(f); ev.target.value = "";
    };
    el("btnSave").onclick = download;
    el("name").oninput = function () { S.project.name = el("name").value; save(); renderAll(); };
    el("btnAddSlide").onclick = addSlide;
    el("btnDupSlide").onclick = function () {
      push();
      var c = JSON.parse(JSON.stringify(curSlide()));
      c.id = uid("s"); c.elements.forEach(function (e) { e.id = uid("e"); });
      S.project.slides.splice(S.i + 1, 0, c); S.i = S.i + 1; S.sel = null;
      renderAll(); draw(); save();
    };
    el("btnDelSlide").onclick = function () { delSlide(S.i); };
    el("btnAddText").onclick = function () { addEl({ id: uid("e"), kind: "text" }); };
    el("btnAddBox").onclick = function () { addEl({ id: uid("e"), kind: "rect", w: 30, h: 16, fill: true }); };
    el("btnAddImage").onclick = function () {
      el("fileImg").dataset.mode = "new"; el("fileImg").click();
    };
    document.addEventListener("paste", function (ev) {
      if (typing(ev.target)) return;
      if (addFromPaste(ev.clipboardData)) ev.preventDefault();
    });
    stage.addEventListener("dragover", function (ev) { ev.preventDefault(); });
    stage.addEventListener("drop", function (ev) {
      ev.preventDefault();
      S.over = true; S.pt = pt(ev);
      if (ev.dataTransfer) addFromPaste(ev.dataTransfer);
    });
    el("btnExport").onclick = exportMaster;
    el("projFov").addEventListener("focus", function () { push(); });
    el("projFov").addEventListener("input", function () {
      S.project.fov = clamp(num(el("projFov").value, 180), 60, 220);
      G.setView({ mfov: S.project.fov }); draw(); save();
    });
    el("pngSize").addEventListener("change", function () {
      S.project.png = num(el("pngSize").value, 2048); save();
    });
    el("btnReplace").onclick = function () {
      el("fileImg").dataset.mode = "replace"; el("fileImg").click();
    };
    el("fileImg").onchange = function (ev) {
      var f = ev.target.files[0]; if (!f) return;
      var mode = ev.target.dataset.mode;
      readImage(f, function (src) {
        if (mode === "replace") { var e = sel(); if (!e) return; push(); e.src = src; e.kind = "image"; e.w = num(e.w, 30); }
        else addEl({ id: uid("e"), kind: "image", src: src, w: 30 });
        G.reset(); renderProps(); draw(); save();
      });
      ev.target.value = "";
    };
    el("btnMaster").onclick = function () { setView("master"); };
    el("btnCentre").onclick = function () { setView("centre"); };
    el("btnFit").onclick = function () { S.zoom = FIT; S.pan = [0, 0]; G.setView({ zoom: FIT, pan: S.pan }); draw(); };
    el("btnZoomIn").onclick = function () { var v = G.viewport(); zoomAt([v.w / 2, v.h / 2], 1.2); };
    el("btnZoomOut").onclick = function () { var v = G.viewport(); zoomAt([v.w / 2, v.h / 2], 1 / 1.2); };
    el("btnPresent").onclick = function () { setPresent(!S.present); };
    el("btnUndo").onclick = undo;
    el("btnRedo").onclick = redo;
    el("btnTKeys").onclick = function () { el("keys").classList.toggle("on"); };
    el("btnFront").onclick = function () { push(); var s = sel(); if (s) { zOrderMany(s, 1); renderProps(); draw(); save(); } };
    el("btnBack").onclick = function () { push(); var s = sel(); if (s) { zOrderMany(s, -1); renderProps(); draw(); save(); } };
    el("btnLock").onclick = function () { var s = sel(); if (!s) return; push(); s.locked = !s.locked; renderProps(); save(); };
    el("btnDup").onclick = dup;
    el("btnDel").onclick = del;
    el("btnPaper").onclick = function () { push(); curSlide().ground = "paper"; renderProps(); draw(); save(); };
    el("btnBlack").onclick = function () { push(); curSlide().ground = "black"; renderProps(); draw(); save(); };
    el("btnPrompt").onclick = function () { push(); curSlide().prompt = !curSlide().prompt; renderProps(); draw(); save(); };

    var fields = ["eAz", "eEl", "eRot", "eSize", "eW", "eH"];
    fields.forEach(function (id) {
      var f = el(id);
      f.addEventListener("focus", function () { push(); });
      f.addEventListener("input", function () {
        var e = sel(); if (!e) return;
        var v = num(f.value, 0);
        if (id === "eAz") e.az = wrapAz(v);
        else if (id === "eEl") e.el = clamp(v, 0, 90);
        else if (id === "eRot") e.rot = v;
        else if (id === "eSize") e.size = Math.max(0.2, v);
        else if (id === "eW") e.w = Math.max(0.5, v);
        else if (id === "eH") e.h = Math.max(0.5, v);
        syncProps(); draw(); save();
      });
    });
    el("eText").addEventListener("focus", function () { push(); });
    el("eText").addEventListener("input", function () {
      var e = sel(); if (!e) return;
      e.text = el("eText").value; draw(); save();
    });
    el("sNotes").addEventListener("focus", function () { push(); });
    el("sNotes").addEventListener("input", function () {
      curSlide().notes = el("sNotes").value; draw(); save();
    });
    el("sPromptSize").addEventListener("focus", function () { push(); });
    el("sPromptSize").addEventListener("input", function () {
      curSlide().promptSize = Math.max(0.5, num(el("sPromptSize").value, 3.2)); draw(); save();
    });
    el("eWeight").addEventListener("change", function () { var e = sel(); if (!e) return; push(); e.weight = el("eWeight").value; G.reset(); draw(); save(); });
    el("eAlign").addEventListener("change", function () { var e = sel(); if (!e) return; push(); e.align = el("eAlign").value; G.reset(); draw(); save(); });
    el("eInk").addEventListener("change", function () { var e = sel(); if (!e) return; push(); e.ink = el("eInk").value; G.reset(); draw(); save(); });
    el("eFill").addEventListener("change", function () { var e = sel(); if (!e) return; push(); e.fill = el("eFill").value !== "hollow"; G.reset(); draw(); save(); });
  }
  function zOrderMany(e, step) {
    var a = curSlide().elements, i = a.indexOf(e), j = clamp(i + step * 999, 0, a.length - 1);
    a.splice(i, 1); a.splice(j, 0, e);
  }
  /* one place forward or back in the card order */
  function zStep(e, dir) {
    var a = curSlide().elements, i = a.indexOf(e), j = i + dir;
    if (j < 0 || j >= a.length) return;
    a.splice(i, 1); a.splice(j, 0, e);
  }

  function init() {
    canvas = el("gl"); stage = el("stage");
    G = window.surfaceGL(canvas);
    G.setOnChange(function () { draw(); });
    var saved = null;
    try { saved = JSON.parse(localStorage.getItem(LS)); } catch (e) {}
    S.project = saved && saved.slides && saved.slides.length ? saved : starter();
    if (!saved) S.undo.length = 0;
    wire();
    G.fit();
    renderAll(); draw();
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(function () { G.reset(); draw(); });
    window.SURFACE = { S: S, G: G, dome: dome, draw: draw, chrome: chrome, cards: cards, curSlide: curSlide,
                       sel: sel, renderAll: renderAll, renderProps: renderProps, setView: setView,
                       undo: undo, redo: redo, addEl: addEl, push: push, dirAt: dirAt, pt: pt,
                       zoomAt: zoomAt, open: open, save: save, download: download,
                       exportMaster: exportMaster, addFromPaste: addFromPaste };
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
