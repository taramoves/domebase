/* gl.js — the three passes.

   background the disc: any colour, paper and black the common two, the horizon rim, an elevation
            ring at 30 and 60, eight meridians. Everything in master coordinates, so it takes the
            same zoom and pan.
   master   every card, its vertices projected sphere -> disc. The card's frame arrives as
            uniforms over one shared unit-grid buffer, so a card is one draw call.
   centre   the same cards through a camera at the dome's centre: what the audience sees.
   chrome   selection outline and handles, in screen pixels, drawn from the projected corners.

   No library, in the shape lab/3Dmath established. */
window.surfaceGL = function (canvas) {
  var gl = canvas.getContext("webgl", { antialias: true, alpha: false, premultipliedAlpha: false });
  if (!gl) throw new Error("no webgl");
  var D = dome.D, FONT = dome.FONT;
  var WASH = [0.937, 0.937, 0.937];          // outside the rim: the sheet's fill tone
  var HAIR = [0.79, 0.79, 0.79];             // the grid
  var view = { view: "master", zoom: 1, pan: [0, 0], yaw: 0, pitch: 16, fov: 100, mfov: 180 };
  var slide = null, chrome = null, onChange = null;
  var tex = {};

  /* ---- a slide's background, and the ink that reads on it ------------------------------- */
  /* A background is a colour. Paper and black are the two names the tool started with, kept
     because they are the two right answers most of the time and shorter than a hex. The ink that
     reads on a background follows its brightness, so a dark colour flips text to white. */
  var BG_NAMED = { paper: "#ffffff", white: "#ffffff", black: "#000000" };
  function bgHex(v) {
    var s = String(v == null ? "" : v).trim().toLowerCase();
    if (BG_NAMED[s]) return BG_NAMED[s];
    if (/^#[0-9a-f]{6}$/.test(s)) return s;
    if (/^#[0-9a-f]{3}$/.test(s)) return "#" + s[1] + s[1] + s[2] + s[2] + s[3] + s[3];
    return "#ffffff";
  }
  function bgRGB(v) {
    var h = bgHex(v);
    return [parseInt(h.slice(1, 3), 16) / 255, parseInt(h.slice(3, 5), 16) / 255, parseInt(h.slice(5, 7), 16) / 255];
  }
  function bgInk(v) {
    var c = bgRGB(v);
    return (0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]) > 0.5 ? "black" : "white";
  }
  /* the same reader for a card's own colour: `ink` was black or white and is now any colour */
  var colHex = bgHex;
  var colRGB = bgRGB;

  /* ---- fonts ---------------------------------------------------------------------------- */
  /* The fonts a dome deck can lean on, all of them on the machines this runs on. A text card's
     texture is measured from its words, so the font decides the card's box as well as its look:
     change the font and the card is remeasured, never squeezed. */
  var FONTS = {
    Arial: "Arial, Helvetica, sans-serif",
    Georgia: "Georgia, 'Times New Roman', serif",
    Courier: "'Courier New', Courier, monospace",
    Times: "'Times New Roman', Times, serif",
    Verdana: "Verdana, Geneva, sans-serif"
  };
  function fontStack(name) { return FONTS[name] || FONTS.Arial; }

  /* ---- pictures ------------------------------------------------------------------------- */
  /* A picture is decoded once per source and kept as a canvas ready for the GPU, so the second
     time a slide arrives its texture is an upload rather than a fetch, a decode and a canvas. A
     deck preloads its pictures when it opens: that is the second that a slide change was losing.
     The canvases are capped, because a deck can hold more pictures than a browser should. */
  var IMG = {}, IMG_ORDER = [], IMG_KEEP = 12;
  function imageRec(src) {
    if (!src) return null;
    if (IMG[src]) return IMG[src];
    var r = IMG[src] = { state: "loading", c: null }, img = new Image();
    if (/^https?:/i.test(src)) img.crossOrigin = "anonymous";
    function done() {
      try {
        var w = img.naturalWidth || 1, h = img.naturalHeight || 1;
        var k = Math.min(1, 2048 / Math.max(w, h));
        var cc = document.createElement("canvas");
        cc.width = Math.max(1, Math.round(w * k)); cc.height = Math.max(1, Math.round(h * k));
        cc.getContext("2d").drawImage(img, 0, 0, cc.width, cc.height);
        r.state = "ready"; r.c = cc;
        IMG_ORDER.push(src);
        while (IMG_ORDER.length > IMG_KEEP) {
          var old = IMG_ORDER.shift();
          if (old !== src) delete IMG[old];           // the texture keeps the picture; the canvas need not
        }
      } catch (e) { r.state = "failed"; }
      if (onChange) onChange();
    }
    function failed() { r.state = "failed"; if (onChange) onChange(); }
    img.src = src;
    if (img.decode) img.decode().then(done, failed);
    else { img.onload = done; img.onerror = failed; }
    return r;
  }
  function preload(srcs) { for (var i = 0; i < srcs.length; i++) if (srcs[i]) imageRec(srcs[i]); }

  /* ---- shaders ------------------------------------------------------------------------- */
  function sh(type, src) {
    var s = gl.createShader(type);
    gl.shaderSource(s, src); gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s) + "\n" + src);
    return s;
  }
  function prog(vs, fs) {
    var p = gl.createProgram();
    gl.attachShader(p, sh(gl.VERTEX_SHADER, vs)); gl.attachShader(p, sh(gl.FRAGMENT_SHADER, fs));
    gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p));
    var u = {}, n = gl.getProgramParameter(p, gl.ACTIVE_UNIFORMS);
    for (var i = 0; i < n; i++) { var nm = gl.getActiveUniform(p, i).name; u[nm] = gl.getUniformLocation(p, nm); }
    /* every uniform any pass may set exists as a key: an inactive one is null, which WebGL ignores */
    UNIFORMS.forEach(function (k) { if (!(k in u)) u[k] = null; });
    return { p: p, u: u };
  }
  var UNIFORMS = ["uA", "uB", "uAdd", "uPx", "uCol", "uN", "uR", "uU", "uTan", "uScale", "uPan",
                  "uFov", "uCR", "uCU", "uCF", "uTanHalf", "uAspect", "uTex", "uOpacity",
                  "uAR", "uAU", "uAF", "uEye", "uLens", "uInk", "uEyeH"];

  var FLAT_V = "attribute vec2 aP;uniform vec2 uA,uB;uniform float uAdd;uniform float uPx;" +
    "void main(){vec2 q = uAdd > .5 ? aP*uA+uB : (aP-uB)*uA;gl_Position=vec4(q,0.,1.);gl_PointSize=uPx;}";
  var FLAT_F = "precision mediump float;uniform vec4 uCol;void main(){gl_FragColor=uCol;}";
  var flat = prog(FLAT_V, FLAT_F);

  /* The disc projection: an equidistant map whose axis is a frame, seen from an eye. Every view of
     the dome is this one shader with different numbers in it.
       master    axis the zenith (0,1,0), image frame (-1,0,0)/(0,0,1), eye at the centre: the
                 projector's plate. The image frame is what puts the front of the dome at the
                 bottom of the disc and east on its left, and it is the sign that would mirror the
                 plate if it were wrong.
       simulate  axis the camera's forward, image frame the camera's own right and up, eye a seat
                 height off the centre: a fisheye from a chair, where a card to the right of the
                 camera lands on the right of the image.
     A flat card's vertices are points at distance one from the centre, so the eye offset is a
     subtraction and the master's eye is zero: the plate is unchanged to the last bit. */
  var DISC_V = "attribute vec2 aG;uniform vec3 uN,uR,uU,uAR,uAU,uAF,uEye;uniform vec2 uTan,uScale,uPan;uniform float uFov;" +
    "varying vec2 vUv;" +
    "void main(){vec3 p=uN+uR*(aG.x*uTan.x)+uU*(aG.y*uTan.y);vec3 d=normalize(p-uEye);" +
    "float th=acos(clamp(dot(d,uAF),-1.,1.));float r=th/(radians(uFov)*.5);" +
    "vec2 m=vec2(dot(d,uAR),dot(d,uAU));float l=length(m);m = l>1e-6 ? m/l : vec2(0.);" +
    "gl_Position=vec4((m*r-uPan)*uScale,0.,1.);vUv=aG*.5+.5;}";
  var discProg = prog(DISC_V, cardFragment(""));

  var CENTRE_V = "attribute vec2 aG;uniform vec3 uN,uR,uU,uCR,uCU,uCF,uEye;uniform vec2 uTan;" +
    "uniform float uTanHalf,uAspect;varying vec2 vUv;" +
    "void main(){vec3 p=uN+uR*(aG.x*uTan.x)+uU*(aG.y*uTan.y);" +
    "vec3 v0=vec3(dot(p,uCR),dot(p,uCU),dot(p,uCF));" +
    "vec3 e0=vec3(dot(uEye,uCR),dot(uEye,uCU),dot(uEye,uCF));" +
    "vec3 v=v0-e0;" +
    "float z=max(v.z,.002);" +
    "gl_Position=vec4(v.x/(z*uTanHalf*uAspect),v.y/(z*uTanHalf),0.,1.);" +
    "if(v.z<=0.) gl_Position=vec4(3.,3.,0.,1.);vUv=aG*.5+.5;}";
  var cardCentre = prog(CENTRE_V, cardFragment(""));

  function cardFragment(extra) {
    return "precision mediump float;uniform sampler2D uTex;uniform float uOpacity;" +
      "varying vec2 vUv;void main(){vec4 c=texture2D(uTex,vUv);" + (extra || "") +
      "if(c.a<.004) discard;gl_FragColor=vec4(c.rgb,c.a*uOpacity);}";
  }

  /* ---- buffers ------------------------------------------------------------------------- */
  function buf(data, kind) {
    var b = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, b);
    gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW);
    return b;
  }
  var g = dome.grid(dome.SUB);
  var gridBuf = buf(g.verts), gridIdx = (function () {
    var b = gl.createBuffer(); gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, b);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, g.idx, gl.STATIC_DRAW); return b;
  })();

  function ring(r, segs) {
    var a = [];
    for (var i = 0; i < segs; i++) {
      var t = i / segs * Math.PI * 2;
      a.push(Math.cos(t) * r, Math.sin(t) * r);
    }
    return new Float32Array(a);
  }
  function fan(r, segs) {
    var a = [0, 0];
    for (var i = 0; i <= segs; i++) {
      var t = i / segs * Math.PI * 2;
      a.push(Math.cos(t) * r, Math.sin(t) * r);
    }
    return new Float32Array(a);
  }
  function meridians(n) {
    var a = [];
    for (var i = 0; i < n; i++) {
      var t = i / n * Math.PI * 2;
      a.push(0, 0, Math.cos(t), Math.sin(t));
    }
    return new Float32Array(a);
  }
  var discBuf = buf(fan(1, 128)), rimBuf = buf(ring(1, 160)),
      ringZ30 = buf(ring(1 / 3, 96)),      // 30 degrees from the zenith, so el 60
      ringZ60 = buf(ring(2 / 3, 96)),      // el 30
      merBuf = buf(meridians(8));
  var chromeBuf = gl.createBuffer();

  /* The floor the dome stands on. It is drawn in the simulate view only, and only from a seat: an
     eye at the dome's exact centre sits *in* the floor's plane, where the plane is edge-on and has
     no width at all. An eye a seat height up sees the floor as the band it is, meeting the dome's
     footprint — which is the whole point of drawing it, since that band is where the screen ends.
     Cards stand above the floor and the camera sits below them, so the floor is always the near
     thing to draw first; no depth buffer is needed. */
  /* The floor the dome stands on, as a plane rather than a mesh. With the eye a seat height above
     it, a ray meets the floor exactly when it points below the dome's rim — the rim is where floor
     and screen meet. In the lens that test is right per pixel, where a mesh of the plane cannot be:
     its far side wraps around an image wider than 180 degrees, and any triangle spanning it paints
     over the dome. So the floor is a screen quad that answers, per pixel, which direction it looks
     along — the same maths as the cards, run backwards. */
  var FLOOR_V = "attribute vec2 aP;varying vec2 vN;void main(){vN=aP;gl_Position=vec4(aP,0.,1.);}";
  var FLOOR_F = "precision mediump float;varying vec2 vN;uniform vec3 uCR,uCU,uCF,uAR,uAU,uAF;" +
    "uniform vec2 uScale;uniform float uTanHalf,uAspect,uFov,uLens,uEyeH;uniform vec4 uCol,uInk;" +
    "void main(){vec3 d;" +
    "if(uLens>.5){vec2 q=vN/uScale;float mr=length(q);float th=mr*radians(uFov)*.5;" +
    "vec2 w=mr>1e-6?q/mr:vec2(0.);d=normalize(cos(th)*uAF+sin(th)*(w.x*uAR+w.y*uAU));" +
    "if(mr>1.) discard;}" +
    "else{vec3 c=vec3(vN.x*uAspect*uTanHalf,vN.y*uTanHalf,1.);" +
    "d=normalize(uCR*c.x+uCU*c.y+uCF*c.z);}" +
    "float e=asin(clamp(d.y,-1.,1.)),e0=-atan(uEyeH);" +
    "if(e>e0) discard;" +
    "float ring=1.-smoothstep(0.,radians(.5),abs(e-e0));" +
    "gl_FragColor=vec4(mix(uCol.rgb,uInk.rgb,ring),1.);}";
  var floorProg = prog(FLOOR_V, FLOOR_F);
  var quadBuf = buf(new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]));
  function lensFov() { var v = view.lensFov; v = v == null ? 180 : v; return v < 100 ? 100 : v > 180 ? 180 : v; }
  function drawFloor(fish) {
    var cam = centreCam();
    gl.useProgram(floorProg.p);
    attr(floorProg, "aP", quadBuf, 2);
    gl.uniform3fv(floorProg.u.uCR, cam.r); gl.uniform3fv(floorProg.u.uCU, cam.u);
    gl.uniform3fv(floorProg.u.uCF, cam.f);
    gl.uniform3fv(floorProg.u.uAR, cam.r); gl.uniform3fv(floorProg.u.uAU, cam.u);
    gl.uniform3fv(floorProg.u.uAF, cam.f);
    gl.uniform2fv(floorProg.u.uScale, scaleXY());
    gl.uniform1f(floorProg.u.uTanHalf, cam.tanHalf);
    gl.uniform1f(floorProg.u.uAspect, V.w / V.h);
    gl.uniform1f(floorProg.u.uFov, lensFov());
    gl.uniform1f(floorProg.u.uLens, fish ? 1 : 0);
    gl.uniform1f(floorProg.u.uEyeH, EYE);
    gl.uniform4f(floorProg.u.uCol, 0.62, 0.62, 0.62, 1);
    gl.uniform4f(floorProg.u.uInk, 0.42, 0.42, 0.42, 1);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  }

  function attr(prog2, name, b, size) {
    var loc = gl.getAttribLocation(prog2.p, name);
    if (loc < 0) return;
    gl.bindBuffer(gl.ARRAY_BUFFER, b);
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, size, gl.FLOAT, false, 0, 0);
  }
  function flatDraw(b, mode, count, col, a, bv, add) {
    gl.useProgram(flat.p);
    attr(flat, "aP", b, 2);
    gl.uniform2fv(flat.u.uA, a); gl.uniform2fv(flat.u.uB, bv); gl.uniform1f(flat.u.uAdd, add);
    gl.uniform4f(flat.u.uCol, col[0], col[1], col[2], col.length > 3 ? col[3] : 1);
    gl.drawArrays(mode, 0, count);
  }

  /* ---- textures ------------------------------------------------------------------------ */
  function makeTexture(src, w, h, fromImage) {
    var t = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, t);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, src);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    return t;
  }
  function blank() {
    var t = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, t);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([255, 255, 255, 0]));
    return t;
  }

  /* text -> a canvas measured to its own words. The card's angular size comes off this canvas:
     px per em is fixed, so a longer line makes a wider card, never a squeezed one. */
  var WRAP = 1100, PAD = 24, LH = 1.25;
  function textCanvas(el, wrapPx) {
    var px = FONT, weight = el.weight === "bold" ? "700" : "400";
    var face = weight + " " + px + "px " + fontStack(el.font);
    var c = document.createElement("canvas"), x = c.getContext("2d");
    x.font = face;
    var lines = [], para = String(el.text == null ? "" : el.text).split("\n");
    var limit = wrapPx || WRAP;
    for (var p = 0; p < para.length; p++) {
      var words = para[p].split(/\s+/).filter(Boolean), line = "";
      if (!words.length) { lines.push(""); continue; }
      for (var i = 0; i < words.length; i++) {
        var tryLine = line ? line + " " + words[i] : words[i];
        if (x.measureText(tryLine).width > limit && line) { lines.push(line); line = words[i]; }
        else line = tryLine;
      }
      lines.push(line);
    }
    var widest = 0;
    for (var k = 0; k < lines.length; k++) widest = Math.max(widest, x.measureText(lines[k]).width);
    c.width = Math.max(4, Math.ceil(widest) + PAD * 2);
    c.height = Math.max(4, Math.ceil(lines.length * px * LH) + PAD * 2);
    x = c.getContext("2d");
    x.font = face;
    x.fillStyle = colHex(el.ink);
    x.textBaseline = "middle";
    x.textAlign = el.align === "left" ? "left" : el.align === "right" ? "right" : "center";
    var tx = el.align === "left" ? PAD : el.align === "right" ? c.width - PAD : c.width / 2;
    for (var j = 0; j < lines.length; j++) {
      x.fillText(lines[j], tx, PAD + px * LH * (j + 0.5));
    }
    return c;
  }
  /* A shape is painted into its texture as a silhouette with alpha, so its mesh stays the plain
     tangent rectangle every other card uses: the outline of a star is the texture's business, not
     the geometry's. The card's box and the shape inside it need not agree — an ellipse drawn in a
     4:3 box is an ellipse, not a circle. */
  var SHAPES = ["rect", "ellipse", "triangle", "diamond", "pentagon", "hexagon", "star", "line"];
  function polyPath(x, cx, cy, rx, ry, n, star) {
    var pts = star ? n * 2 : n, i, t, k;
    x.beginPath();
    for (i = 0; i < pts; i++) {
      t = i / pts * Math.PI * 2;
      k = (star && (i % 2)) ? star : 1;
      var px = cx + Math.sin(t) * rx * k, py = cy - Math.cos(t) * ry * k;
      if (i) x.lineTo(px, py); else x.moveTo(px, py);
    }
    x.closePath();
  }
  function shapePath(x, w, h, shape) {
    if (shape === "ellipse") { x.beginPath(); x.ellipse(w / 2, h / 2, w / 2, h / 2, 0, 0, Math.PI * 2); x.closePath(); return; }
    if (shape === "triangle") { x.beginPath(); x.moveTo(w / 2, 0); x.lineTo(w, h); x.lineTo(0, h); x.closePath(); return; }
    if (shape === "diamond") { x.beginPath(); x.moveTo(w / 2, 0); x.lineTo(w, h / 2); x.lineTo(w / 2, h); x.lineTo(0, h / 2); x.closePath(); return; }
    if (shape === "pentagon") { polyPath(x, w / 2, h / 2, w / 2, h / 2, 5, 0); return; }
    if (shape === "hexagon") { polyPath(x, w / 2, h / 2, w / 2, h / 2, 6, 0); return; }
    if (shape === "star") { polyPath(x, w / 2, h / 2, w / 2, h / 2, 5, 0.44); return; }
    if (shape === "line") { x.beginPath(); x.moveTo(0, h / 2); x.lineTo(w, h / 2); return; }
    x.beginPath(); x.rect(0, 0, w, h); x.closePath();
  }
  function shapeFill(el) {
    if (el.fill === true) return "solid";
    if (el.fill === false) return "outline";
    return el.fill === "outline" || el.fill === "both" ? el.fill : "solid";
  }
  function shapeCanvas(el) {
    var W = 256, H = 192, IN = 7;                        // a stroke needs the inset; a fill does not
    var c = document.createElement("canvas"), x;
    c.width = W; c.height = H;
    x = c.getContext("2d");
    var col = colHex(el.ink), fill = shapeFill(el), inset = fill === "solid" ? 0 : IN;
    x.save();
    x.translate(inset, inset);
    shapePath(x, W - inset * 2, H - inset * 2, el.shape || "rect");
    if (fill === "solid" || fill === "both") { x.fillStyle = col; x.fill(); }
    if (fill === "outline" || fill === "both") { x.lineWidth = 7; x.lineJoin = "miter"; x.strokeStyle = col; x.stroke(); }
    x.restore();
    return c;
  }

  function sig(el) {
    if (el.kind === "text") return ["t", el.text, el.weight, el.align, el.ink, el.font || "", el.wrap || 0].join("|");
    if (el.kind === "shape" || el.kind === "rect")
      return ["s", el.shape || "rect", el.ink, shapeFill(el)].join("|");
    return "i|" + (el.src || "").slice(-64) + "|" + (el.src || "").length;
  }
  /* the texture a card draws with, and the pixel size its geometry is derived from. A picture that
     has not arrived yet draws as a blank of nominal size and is filled in when it lands, but once
     it is in hand the upload is the only work left. */
  function texture(el) {
    var s = sig(el), rec = tex[el.id], ir, ready;
    if (el.kind === "image") {
      ir = imageRec(el.src);
      ready = !!(ir && ir.state === "ready" && ir.c);
      if (rec && rec.sig === s && (!ready || !rec.blank)) return rec;
      if (rec && rec.t) gl.deleteTexture(rec.t);
      rec = tex[el.id] = { sig: s, t: blank(), w: 4, h: 4, blank: true, kind: el.kind };
      if (ready) {
        rec.t = makeTexture(ir.c, ir.c.width, ir.c.height);
        rec.w = ir.c.width; rec.h = ir.c.height; rec.blank = false;
      }
      return rec;
    }
    if (rec && rec.sig === s) return rec;
    if (rec && rec.t) gl.deleteTexture(rec.t);
    rec = tex[el.id] = { sig: s, t: blank(), w: 4, h: 4, kind: el.kind };
    if (el.kind === "text") {
      var c = textCanvas(el, el.wrap);
      rec.t = makeTexture(c, c.width, c.height); rec.w = c.width; rec.h = c.height;
    } else if (el.kind === "shape" || el.kind === "rect") {
      var r = shapeCanvas(el);
      rec.t = makeTexture(r, r.width, r.height); rec.w = r.width; rec.h = r.height;
    }
    return rec;
  }
  /* the editor derives a card's angular box from the texture's pixel size */
  function texSize(el) { var r = texture(el); return { w: r.w, h: r.h }; }

  /* ---- the view ------------------------------------------------------------------------ */
  var V = { w: 1, h: 1, dpr: 1, S: 1 };
  function fit() {
    var r = canvas.getBoundingClientRect();
    var dpr = Math.min(2, window.devicePixelRatio || 1);
    V.w = Math.max(1, r.width); V.h = Math.max(1, r.height); V.dpr = dpr;
    var dw = Math.round(V.w * dpr), dh = Math.round(V.h * dpr);
    if (canvas.width !== dw || canvas.height !== dh) { canvas.width = dw; canvas.height = dh; }
    V.S = view.zoom * Math.min(V.w, V.h) / 2;
    return V;
  }
  function scaleXY() { return [view.zoom * Math.min(V.w, V.h) / V.w, view.zoom * Math.min(V.w, V.h) / V.h]; }

  function masterToPx(u, v) { return [V.w / 2 + (u - view.pan[0]) * V.S, V.h / 2 - (v - view.pan[1]) * V.S]; }
  function pxToMaster(x, y) { return [(x - V.w / 2) / V.S + view.pan[0], -(y - V.h / 2) / V.S + view.pan[1]]; }

  /* The seat view is from a chair, not from the exact centre: a real eye sits above the floor, and
     from the centre a floor plane is edge-on and invisible. Eye height as a fraction of the dome's
     radius — about a metre in a nine-metre dome. */
  var EYE = 0.12;
  /* The master's axis frame: the zenith, with the image frame that makes the disc the projector's
     plate — u runs west, v runs back, so east lies on the plate's left and the front at its bottom. */
  var MASTER_FRAME = { r: [-1, 0, 0], u: [0, 0, 1], f: [0, 1, 0] };

  /* The audience's eye: a camera at a seat looking along (yaw, pitch), its up toward the zenith.
     Its right is up x forward — the same handedness as a card's own right, so a card's text reads
     the same here as it does from a seat under it. */
  function centreCam() {
    var f = dome.dir(view.yaw, view.pitch), up = dome.basis(view.yaw, view.pitch).up;
    return { f: f, u: up, r: dome.cross(up, f), eye: [0, EYE, 0],
             tanHalf: Math.tan(Math.max(20, Math.min(150, view.fov)) * D / 2) };
  }

  function draw(elements, selectedId) {
    fit();
    var glass = bgRGB(slide && slide.ground);
    gl.disable(gl.DEPTH_TEST);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    gl.viewport(0, 0, canvas.width, canvas.height);

    if (view.view === "simulate") {
      for (var i = 0; i < 3; i++) gl.clearColor(glass[i], glass[i], glass[i], 1);
      gl.clear(gl.COLOR_BUFFER_BIT);
      var fish = view.lens !== "perspective";
      drawFloor(fish);
      drawCards(elements, fish ? "lens" : "seat");
      return;
    }

    gl.clearColor(WASH[0], WASH[1], WASH[2], 1);
    gl.clear(gl.COLOR_BUFFER_BIT);

    var sc = scaleXY(), pan = view.pan;
    flatDraw(discBuf, gl.TRIANGLE_FAN, 130, glass, sc, pan, 0);
    flatDraw(merBuf, gl.LINES, 16, HAIR.concat([1]), sc, pan, 0);
    flatDraw(ringZ30, gl.LINE_LOOP, 96, HAIR.concat([1]), sc, pan, 0);
    flatDraw(ringZ60, gl.LINE_LOOP, 96, HAIR.concat([1]), sc, pan, 0);
    drawCards(elements, "master");
    flatDraw(rimBuf, gl.LINE_LOOP, 160, [0.35, 0.35, 0.35, 1], sc, pan, 0);
    drawChrome();
  }

  /* mode: "master" the projector's plate, "lens" the seat fisheye, "seat" the seat perspective.
     The per-mode uniforms are set once; only the card's own frame changes inside the loop. */
  function drawCards(elements, mode, sc, pan) {
    var cam = centreCam();
    var p = mode === "seat" ? cardCentre : discProg;
    gl.useProgram(p.p);
    attr(p, "aG", gridBuf, 2);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, gridIdx);
    var eye = [0, 0, 0];
    if (mode === "master") {
      if (!sc) sc = scaleXY();
      if (!pan) pan = view.pan;
      gl.uniform3fv(p.u.uAR, MASTER_FRAME.r); gl.uniform3fv(p.u.uAU, MASTER_FRAME.u);
      gl.uniform3fv(p.u.uAF, MASTER_FRAME.f);
      gl.uniform2fv(p.u.uScale, sc); gl.uniform2fv(p.u.uPan, pan);
      gl.uniform1f(p.u.uFov, view.mfov || 180);
    } else if (mode === "lens") {
      eye = cam.eye;
      gl.uniform3fv(p.u.uAR, cam.r); gl.uniform3fv(p.u.uAU, cam.u); gl.uniform3fv(p.u.uAF, cam.f);
      gl.uniform2fv(p.u.uScale, scaleXY()); gl.uniform2fv(p.u.uPan, [0, 0]);
      gl.uniform1f(p.u.uFov, lensFov());
    } else {
      eye = cam.eye;
      gl.uniform3fv(p.u.uCR, cam.r); gl.uniform3fv(p.u.uCU, cam.u); gl.uniform3fv(p.u.uCF, cam.f);
      gl.uniform1f(p.u.uTanHalf, cam.tanHalf);
      gl.uniform1f(p.u.uAspect, V.w / V.h);
    }
    gl.uniform3fv(p.u.uEye, eye);
    var usedIds = {};
    for (var i = 0; i < elements.length; i++) {
      var el = elements[i];
      usedIds[el.id] = 1;
      var r = texture(el);
      var m = dome.matrix(el, r);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, r.t);
      gl.uniform1i(p.u.uTex, 0);
      gl.uniform1f(p.u.uOpacity, el.opacity == null ? 1 : el.opacity);
      gl.uniform3fv(p.u.uN, m.n); gl.uniform3fv(p.u.uR, m.right); gl.uniform3fv(p.u.uU, m.up);
      gl.uniform2f(p.u.uTan, m.tanW, m.tanH);
      gl.drawElements(gl.TRIANGLES, g.idx.length, gl.UNSIGNED_SHORT, 0);
    }
    /* release the textures of cards that are gone */
    for (var id in tex) {
      if (usedIds[id]) continue;
      if (tex[id].t) gl.deleteTexture(tex[id].t);
      delete tex[id];
    }
  }

  /* The domemaster that goes to the projector: a square whose rim is the horizon, black beyond it,
     no grid and no chrome — the slide alone. It renders twice the size into a framebuffer and
     scales down, because a framebuffer has no antialiasing and a master's edges show it. */
  function domemaster(size, elements, ss, background) {
    ss = ss || 2;
    var inner = size * ss;
    var fb = gl.createFramebuffer(), txt = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, txt);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, inner, inner, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, txt, 0);
    if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE) {
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      gl.deleteFramebuffer(fb); gl.deleteTexture(txt);
      return null;
    }
    gl.viewport(0, 0, inner, inner);
    gl.disable(gl.DEPTH_TEST);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    var glass = bgRGB(background);
    gl.clearColor(0, 0, 0, 1);                     // outside the rim the projector has nothing
    gl.clear(gl.COLOR_BUFFER_BIT);
    flatDraw(discBuf, gl.TRIANGLE_FAN, 130, glass, [1, 1], [0, 0], 0);
    drawCards(elements, "master", [1, 1], [0, 0]);
    var px = new Uint8Array(inner * inner * 4);
    gl.readPixels(0, 0, inner, inner, gl.RGBA, gl.UNSIGNED_BYTE, px);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.deleteFramebuffer(fb); gl.deleteTexture(txt);

    var big = document.createElement("canvas"), bx, img, y, src, dst, i;
    big.width = big.height = inner;
    bx = big.getContext("2d");
    img = bx.createImageData(inner, inner);
    for (y = 0; y < inner; y++) {                  // GL reads bottom-up
      src = (inner - 1 - y) * inner * 4; dst = y * inner * 4;
      for (i = 0; i < inner * 4; i++) img.data[dst + i] = px[src + i];
    }
    bx.putImageData(img, 0, 0);
    var out = document.createElement("canvas"), ox;
    out.width = out.height = size;
    ox = out.getContext("2d");
    ox.imageSmoothingEnabled = true;
    if (ox.imageSmoothingQuality) ox.imageSmoothingQuality = "high";
    ox.drawImage(big, 0, 0, size, size);
    return out;
  }

  /* ---- chrome, in screen pixels --------------------------------------------------------- */
  function drawChrome() {
    if (!chrome) return;
    var light = bgInk(slide && slide.ground) === "black";
    var ink = light ? [0, 0, 0, 0.85] : [1, 1, 1, 0.9];        // the mark the background can carry
    var lift = light ? [1, 1, 1, 1] : [0, 0, 0, 1];            // and what separates it from the card
    var a = [2 / V.w, -2 / V.h], b = [-1, 1];
    function poly(pts, col, mode) {
      if (pts.length < 2) return;
      var f = new Float32Array(pts.length * 2);
      for (var i = 0; i < pts.length; i++) { f[i * 2] = pts[i][0]; f[i * 2 + 1] = pts[i][1]; }
      gl.bindBuffer(gl.ARRAY_BUFFER, chromeBuf);
      gl.bufferData(gl.ARRAY_BUFFER, f, gl.DYNAMIC_DRAW);
      flatDraw(chromeBuf, mode, pts.length, col, a, b, 1);
    }
    function box(p, size, col, fill) {
      var h = size / 2, pts = [[p[0] - h, p[1] - h], [p[0] + h, p[1] - h], [p[0] + h, p[1] + h], [p[0] - h, p[1] + h]];
      if (fill) poly(pts.concat([pts[0]]), col, gl.TRIANGLE_FAN);
      poly(pts.concat([pts[0]]), col, gl.LINE_LOOP);
    }
    function handle(p, size) {
      box(p, size, lift, true);
      box(p, size, ink, true);
      box(p, size + 1, lift, false);
    }
    poly(chrome.outline, ink, gl.LINE_STRIP);
    if (chrome.rotate) {
      poly([chrome.rotate.from, chrome.rotate.to], ink, gl.LINES);
      handle(chrome.rotate.to, 8);
    }
    for (var i = 0; i < chrome.handles.length; i++) handle(chrome.handles[i].p, i < 4 ? 9 : 7);
  }

  return {
    draw: draw, fit: fit, texture: texture, texSize: texSize,
    bgHex: bgHex, bgRGB: bgRGB, bgInk: bgInk, fontStack: fontStack, FONTS: FONTS, preload: preload,
    background: function () { return bgRGB(slide && slide.ground); },
    setView: function (v) { for (var k in v) view[k] = v[k]; },
    getView: function () { return view; },
    viewport: function () { return V; },
    scale: function () { fit(); return V.S; },
    masterToPx: masterToPx, pxToMaster: pxToMaster, centreCam: centreCam,
    setSlide: function (s) { slide = s; },
    domemaster: domemaster,
    setChrome: function (c) { chrome = c; },
    setOnChange: function (f) { onChange = f; },
    reset: function (all) {
      /* a card's texture dies with the card's content; a picture is kept across an edit, since
         only its source can change it — and across a new deck it must go, because the ids do */
      for (var id in tex) {
        if (!all && tex[id].kind === "image") continue;
        if (tex[id].t) gl.deleteTexture(tex[id].t);
        delete tex[id];
      }
    }
  };
};
