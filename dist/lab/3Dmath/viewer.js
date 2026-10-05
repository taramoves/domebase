/* viewer.js — the 3d math page: one WebGL context, the family registry, and the
   controls that drive it.

   Black on white. The geometry carries the ink and nothing else does: triangles
   are lit and posterised into four greys, lines take their tone from the shape's
   own fourth coordinate when it has one (the 4d polytopes) and from depth
   otherwise. Nothing here is styled by the page sheet; see index.html. */

(function () {
  'use strict';
  const G = GEOM;
  const $ = s => document.querySelector(s);

  const shapes = (typeof SHAPES3D !== 'undefined' && SHAPES3D.list ? SHAPES3D.list.slice() : []);
  shapes.sort((a, b) => (a.family + ' ' + a.id).localeCompare(b.family + ' ' + b.id));
  const FAM = [];
  for (const s of shapes) if (FAM.indexOf(s.family) < 0) FAM.push(s.family);

  /* ---------------- mat4, column major ---------------- */
  const M = {
    perspective(o, fovy, aspect, near, far) {
      const f = 1 / Math.tan(fovy / 2), nf = 1 / (near - far);
      o[0] = f / aspect; o[1] = 0; o[2] = 0; o[3] = 0;
      o[4] = 0; o[5] = f; o[6] = 0; o[7] = 0;
      o[8] = 0; o[9] = 0; o[10] = (far + near) * nf; o[11] = -1;
      o[12] = 0; o[13] = 0; o[14] = 2 * far * near * nf; o[15] = 0;
      return o;
    },
    lookAt(o, eye, ctr, up) {
      let z0 = eye[0] - ctr[0], z1 = eye[1] - ctr[1], z2 = eye[2] - ctr[2];
      let l = Math.hypot(z0, z1, z2) || 1; z0 /= l; z1 /= l; z2 /= l;
      let x0 = up[1] * z2 - up[2] * z1, x1 = up[2] * z0 - up[0] * z2, x2 = up[0] * z1 - up[1] * z0;
      l = Math.hypot(x0, x1, x2) || 1; x0 /= l; x1 /= l; x2 /= l;
      const y0 = z1 * x2 - z2 * x1, y1 = z2 * x0 - z0 * x2, y2 = z0 * x1 - z1 * x0;
      o[0] = x0; o[1] = y0; o[2] = z0; o[3] = 0;
      o[4] = x1; o[5] = y1; o[6] = z1; o[7] = 0;
      o[8] = x2; o[9] = y2; o[10] = z2; o[11] = 0;
      o[12] = -(x0 * eye[0] + x1 * eye[1] + x2 * eye[2]);
      o[13] = -(y0 * eye[0] + y1 * eye[1] + y2 * eye[2]);
      o[14] = -(z0 * eye[0] + z1 * eye[1] + z2 * eye[2]);
      o[15] = 1;
      return o;
    },
    mul(o, a, b) {
      for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) {
        o[c * 4 + r] = a[r] * b[c * 4] + a[4 + r] * b[c * 4 + 1] + a[8 + r] * b[c * 4 + 2] + a[12 + r] * b[c * 4 + 3];
      }
      return o;
    },
    /* o must not alias a or b */
    rotY(o, a) {
      const c = Math.cos(a), s = Math.sin(a);
      o[0] = c; o[1] = 0; o[2] = -s; o[3] = 0;
      o[4] = 0; o[5] = 1; o[6] = 0; o[7] = 0;
      o[8] = s; o[9] = 0; o[10] = c; o[11] = 0;
      o[12] = 0; o[13] = 0; o[14] = 0; o[15] = 1;
      return o;
    }
  };

  /* ---------------- webgl ---------------- */
  const cv = $('#cv'), stage = $('#stage');
  const gl = cv.getContext('webgl', { antialias: true, alpha: false, preserveDrawingBuffer: true }) ||
    cv.getContext('experimental-webgl', { antialias: true, alpha: false, preserveDrawingBuffer: true });
  if (!gl) {
    const p = document.createElement('div');
    p.className = 'say'; p.textContent = 'no webgl here';
    stage.appendChild(p);
    return;
  }

  const VS = [
    'attribute vec3 aPos;',
    'attribute vec3 aNorm;',
    'attribute float aTone;',
    'uniform mat4 uMVP;',
    'uniform mat4 uView;',
    'uniform vec3 uLight;',
    'uniform vec4 uLevels;',
    'uniform float uMode;',   /* 0 = triangles, 1 = lines */
    'uniform float uLit;',    /* 1 = light the triangles, 0 = take the tone attribute */
    'uniform float uFade;',   /* depth fade, 1 = on */
    'uniform float uNear;',
    'uniform float uFar;',
    'uniform float uHasTone;', /* 1 when the family supplied its own data value */
    'varying float vInk;',    /* ink, in the sheet's greys */
    'varying float vCov;',    /* coverage: the depth fade alone, for the spectrum */
    'varying float vData;',   /* the shape's own value, 0..1 */
    'varying vec3 vNrm;',     /* model space, so colour stays fixed to the object */
    'void main() {',
    '  vec4 vp = uView * vec4(aPos, 1.0);',
    '  float dep = clamp((-vp.z - uNear) / max(0.001, uFar - uNear), 0.0, 1.0);',
    /* the fourth coordinate where the shape has one, the height where it has
       not — geometry is fitted to radius 1 about the origin, so aPos.y is
       already -1..1. Lines have no normal attribute bound, so guard the
       normalise: normalize(0) is NaN in GLSL. */
    '  float an = length(aNorm);',
    '  vNrm = an > 1e-4 ? aNorm / an : vec3(0.0);',
    '  vData = clamp(uHasTone > 0.5 ? aTone : aPos.y * 0.5 + 0.5, 0.0, 1.0);',
    '  float ink;',
    '  if (uMode < 0.5 && uLit > 0.5) {',
    '    vec3 n = normalize(mat3(uView) * aNorm);',
    '    float l = abs(dot(n, normalize(uLight)));',
    '    ink = l > 0.88 ? uLevels.x : l > 0.66 ? uLevels.y : l > 0.40 ? uLevels.z : uLevels.w;',
    '  } else {',
    '    ink = aTone;',
    '  }',
    '  float fade = mix(1.0, 0.05, uFade * dep * dep);',
    '  ink *= fade;',
    '  vCov = fade;',
    '  vInk = ink;',
    '  gl_Position = uMVP * vec4(aPos, 1.0);',
    '}'
  ].join('\n');

  const FS = [
    'precision mediump float;',
    'uniform float uColor;',  /* 0 = the sheet's greys, 1 = the shape's own value, 2 = the normal */
    'varying float vInk;',
    'varying float vCov;',
    'varying float vData;',
    'varying vec3 vNrm;',
    /* the full hue circle: red -> yellow -> green -> cyan -> blue -> magenta */
    'vec3 spectrum(float t) {',
    '  vec3 k = fract(t + vec3(0.0, 2.0 / 3.0, 1.0 / 3.0));',
    '  return clamp(abs(k * 6.0 - 3.0) - 1.0, 0.0, 1.0);',
    '}',
    'void main() {',
    '  float cov = clamp(vInk, 0.0, 1.0);',
    '  if (uColor < 0.5) { gl_FragColor = vec4(vec3(1.0 - cov), 1.0); return; }',
    /* colour is the shape's own value, laid on white in proportion to how near
       it is — the reference's look: flat data colour, no lighting model */
    '  float az = atan(vNrm.y, vNrm.x) / 6.2831853 + 0.5;',
    '  vec3 hue = spectrum(dot(vNrm, vNrm) > 0.25 && uColor > 1.5 ? az : vData);',
    '  gl_FragColor = vec4(mix(vec3(1.0), hue, clamp(vCov, 0.0, 1.0)), 1.0);',
    '}'
  ].join('\n');

  function compile(type, src) {
    const s = gl.createShader(type);
    gl.shaderSource(s, src); gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s));
    return s;
  }
  const prog = gl.createProgram();
  gl.attachShader(prog, compile(gl.VERTEX_SHADER, VS));
  gl.attachShader(prog, compile(gl.FRAGMENT_SHADER, FS));
  gl.linkProgram(prog);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(prog));
  gl.useProgram(prog);

  const A = {
    pos: gl.getAttribLocation(prog, 'aPos'),
    norm: gl.getAttribLocation(prog, 'aNorm'),
    tone: gl.getAttribLocation(prog, 'aTone')
  };
  const U = {
    mvp: gl.getUniformLocation(prog, 'uMVP'),
    view: gl.getUniformLocation(prog, 'uView'),
    light: gl.getUniformLocation(prog, 'uLight'),
    levels: gl.getUniformLocation(prog, 'uLevels'),
    mode: gl.getUniformLocation(prog, 'uMode'),
    lit: gl.getUniformLocation(prog, 'uLit'),
    fade: gl.getUniformLocation(prog, 'uFade'),
    near: gl.getUniformLocation(prog, 'uNear'),
    far: gl.getUniformLocation(prog, 'uFar'),
    colour: gl.getUniformLocation(prog, 'uColor'),
    hasTone: gl.getUniformLocation(prog, 'uHasTone')
  };

  const buf = { tris: gl.createBuffer(), lines: gl.createBuffer(), norm: gl.createBuffer(), tone: gl.createBuffer() };
  const view = new Float32Array(16), proj = new Float32Array(16), mvp = new Float32Array(16);

  /* ---------------- state ---------------- */
  const S = {
    def: null, P: {}, out: null, geo: { triN: 0, lineN: 0, hasTone: false },
    dirty: true, buildMs: 0, lastBuild: 0, stats: {},
    yaw: -0.62, pitch: 0.30, dist: 4.4,
    dome: true, fov: 180, guides: true, spinAng: 0, faceDist: 1.45, cubeStale: true,
    spin: true, sweep: false, depth: true, edges: true, faces: true, colour: 2,
    sweepOn: {}, period: {}, fps: 60, frames: 0, fpsAt: 0
  };

  /* ---------------- geometry ---------------- */
  function normalsOf(tris) {
    const n = new Float32Array(tris.length);
    for (let i = 0; i < tris.length; i += 9) {
      const ax = tris[i], ay = tris[i + 1], az = tris[i + 2];
      const bx = tris[i + 3] - ax, by = tris[i + 4] - ay, bz = tris[i + 5] - az;
      const cx = tris[i + 6] - ax, cy = tris[i + 7] - ay, cz = tris[i + 8] - az;
      let nx = by * cz - bz * cy, ny = bz * cx - bx * cz, nz = bx * cy - by * cx;
      const l = Math.hypot(nx, ny, nz) || 1;
      nx /= l; ny /= l; nz /= l;
      for (let k = 0; k < 3; k++) { n[i + k * 3] = nx; n[i + k * 3 + 1] = ny; n[i + k * 3 + 2] = nz; }
    }
    return n;
  }

  function upload(out) {
    const triN = out.tris.length / 3, lineN = out.lines.length / 3;
    gl.bindBuffer(gl.ARRAY_BUFFER, buf.tris);
    gl.bufferData(gl.ARRAY_BUFFER, out.tris, gl.DYNAMIC_DRAW);
    gl.bindBuffer(gl.ARRAY_BUFFER, buf.lines);
    gl.bufferData(gl.ARRAY_BUFFER, out.lines, gl.DYNAMIC_DRAW);
    gl.bindBuffer(gl.ARRAY_BUFFER, buf.norm);
    gl.bufferData(gl.ARRAY_BUFFER, normalsOf(out.tris), gl.DYNAMIC_DRAW);
    let tone = out.tone;
    if (!tone) {
      tone = new Float32Array(triN + lineN);
      tone.fill(1);
    }
    gl.bindBuffer(gl.ARRAY_BUFFER, buf.tone);
    gl.bufferData(gl.ARRAY_BUFFER, tone, gl.DYNAMIC_DRAW);
    S.geo = { triN: triN, lineN: lineN, hasTone: !!out.tone };
  }

  function defaults(def) {
    const P = {};
    for (const p of def.params) P[p.k] = p.def;
    return P;
  }

  function rebuild(now) {
    if (!S.def) return;
    const t0 = performance.now();
    let out;
    try {
      out = S.def.build(S.P, G);
      G.fit(out, 1);
    } catch (e) {
      stage.querySelector('.say') || (function () {
        const p = document.createElement('div');
        p.className = 'say'; p.textContent = S.def.id + ': ' + e.message;
        stage.appendChild(p);
      })();
      return;
    }
    const say = stage.querySelector('.say');
    if (say) say.remove();
    S.buildMs = performance.now() - t0;
    S.lastBuild = now || performance.now();
    S.out = out;
    S.stats = out.stats || {};
    upload(out);
    S.dirty = false;
    paintSpec();
    paintCount();
    rememberRow(S.def, out.stats);
  }

  /* ---------------- drawing ---------------- */
  function resize() {
    const r = stage.getBoundingClientRect();
    const w = Math.max(1, Math.round(r.width)), h = Math.max(1, Math.round(r.height));
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const bw = Math.round(w * dpr), bh = Math.round(h * dpr);
    if (cv.width !== bw || cv.height !== bh) { cv.width = bw; cv.height = bh; }
    gl.viewport(0, 0, cv.width, cv.height);
    return w / h;
  }

  function attrib(loc, b, size, stride, offset) {
    if (loc < 0) return;
    gl.bindBuffer(gl.ARRAY_BUFFER, b);
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, size, gl.FLOAT, false, stride || 0, offset || 0);
  }

  /* ---------------- the dome ----------------
     The shape is drawn into the six faces of a cube map: one 90-degree camera per
     face, each in the orientation the cube map expects, so that textureCube samples
     exactly what was drawn. A second pass maps the cube onto the domemaster circle:
     a pixel's distance from the centre is its angle from the direction at the centre
     of the circle. Five faces carry the shape seen from that side; the back face
     carries nothing yet, which is why a 180-degree domemaster shows the shape at the
     middle and stretches it at the rim, and why the back is reached by turning round
     (or by opening the field of view past 180). */
  const FACE = 1024;
  const FACE_LOOK = [
    { f: [1, 0, 0], u: [0, -1, 0] },     /* +X  right  */
    { f: [-1, 0, 0], u: [0, -1, 0] },    /* -X  left   */
    { f: [0, 1, 0], u: [0, 0, 1] },      /* +Y  top    */
    { f: [0, -1, 0], u: [0, 0, -1] },    /* -Y  bottom */
    { f: [0, 0, 1], u: [0, -1, 0] },     /* +Z  front  */
    { f: [0, 0, -1], u: [0, -1, 0] }     /* -Z  back   */
  ];
  const FACE_BACK = 5;
  const modelM = new Float32Array(16), tmpM = new Float32Array(16);

  function link(vsSrc, fsSrc) {
    const p = gl.createProgram();
    gl.attachShader(p, compile(gl.VERTEX_SHADER, vsSrc));
    gl.attachShader(p, compile(gl.FRAGMENT_SHADER, fsSrc));
    gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p));
    return p;
  }

  const VSQ = [
    'attribute vec2 aQ;',
    'void main() { gl_Position = vec4(aQ, 0.0, 1.0); }'
  ].join('\n');

  const FSD = [
    'precision highp float;',
    'uniform samplerCube uCube;',
    'uniform vec2 uRes;',
    'uniform float uFov;',
    'uniform float uYaw;',
    'uniform float uPitch;',
    'uniform float uGuide;',
    'void main() {',
    '  vec2 p = (gl_FragCoord.xy - 0.5 * uRes) / (0.5 * min(uRes.x, uRes.y));',
    '  float r = length(p);',
    '  if (r > 1.0) { gl_FragColor = vec4(1.0, 1.0, 1.0, 1.0); return; }',
    '  float th = r * radians(uFov) * 0.5;',
    '  float ph = atan(p.y, p.x);',
    '  vec3 c = vec3(cos(uPitch) * sin(uYaw), sin(uPitch), cos(uPitch) * cos(uYaw));',
    '  vec3 rt = normalize(cross(vec3(0.0, 1.0, 0.0), c));',
    '  vec3 up = cross(c, rt);',
    '  vec3 dir = c * cos(th) + (rt * cos(ph) + up * sin(ph)) * sin(th);',
    '  vec3 col = textureCube(uCube, dir).rgb;',
    '  if (uGuide > 0.5) {',
    '    float w = 1.7 / (0.5 * min(uRes.x, uRes.y));',
    '    float g = 1.0 - smoothstep(0.0, w, abs(r - 1.0));',
    '    g = max(g, 0.5 * (1.0 - smoothstep(0.0, w, abs(r - 0.3333))));',
    '    g = max(g, 0.5 * (1.0 - smoothstep(0.0, w, abs(r - 0.6667))));',
    '    g = max(g, 0.4 * (1.0 - smoothstep(0.0, w, abs(p.x))));',
    '    g = max(g, 0.4 * (1.0 - smoothstep(0.0, w, abs(p.y))));',
    '    col = mix(col, vec3(0.0), clamp(g, 0.0, 1.0) * 0.5);',
    '  }',
    '  gl_FragColor = vec4(col, 1.0);',
    '}'
  ].join('\n');

  const progDome = link(VSQ, FSD);
  const AD = { q: gl.getAttribLocation(progDome, 'aQ') };
  const UD = {
    cube: gl.getUniformLocation(progDome, 'uCube'),
    res: gl.getUniformLocation(progDome, 'uRes'),
    fov: gl.getUniformLocation(progDome, 'uFov'),
    yaw: gl.getUniformLocation(progDome, 'uYaw'),
    pitch: gl.getUniformLocation(progDome, 'uPitch'),
    guide: gl.getUniformLocation(progDome, 'uGuide')
  };

  /* the cube the faces are drawn into, and the square the circle is drawn on */
  const cube = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_CUBE_MAP, cube);
  for (let i = 0; i < 6; i++) {
    gl.texImage2D(gl.TEXTURE_CUBE_MAP_POSITIVE_X + i, 0, gl.RGBA, FACE, FACE, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
  }
  gl.texParameteri(gl.TEXTURE_CUBE_MAP, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_CUBE_MAP, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_CUBE_MAP, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_CUBE_MAP, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  const cubeFbo = gl.createFramebuffer();
  const cubeDepth = gl.createRenderbuffer();
  gl.bindRenderbuffer(gl.RENDERBUFFER, cubeDepth);
  gl.renderbufferStorage(gl.RENDERBUFFER, gl.DEPTH_COMPONENT16, FACE, FACE);
  gl.bindFramebuffer(gl.FRAMEBUFFER, cubeFbo);
  gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.RENDERBUFFER, cubeDepth);
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);

  buf.quad = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buf.quad);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);

  /* ---------------- the menu, and its face ----------------
     The menu is one block of rectangles that fit together: the shapes list down the left, the
     parameters, the view controls and the measures stacked at its right. The page lays that
     block out in the corner; here the same block is drawn at 1024 square and hung on the back
     face of the cube map, so turning round in the dome shows the menu at the centre of the
     circle. The block is square because the face's texture is. */
  const MENU = 1024;
  const menuCv = document.createElement('canvas');
  menuCv.width = MENU; menuCv.height = MENU;
  const mg = menuCv.getContext('2d');
  const FONT = 'Arial, Helvetica, sans-serif';
  let menuStale = true, backStale = true;

  function mgText(s, x, y, align, weight, size) {
    mg.font = (weight ? weight + ' ' : '') + size + 'px ' + FONT;
    mg.textAlign = align || 'left';
    mg.fillStyle = '#000';
    mg.fillText(s, x, y);
  }
  function mgRule(x0, y0, x1, y1, w) {
    mg.strokeStyle = '#000';
    mg.lineWidth = w || 1;
    mg.beginPath(); mg.moveTo(x0 + 0.5, y0 + 0.5); mg.lineTo(x1 - 0.5, y1 - 0.5); mg.stroke();
  }
  /* a name long enough to leave its column is trimmed: the pane cannot grow */
  function mgFit(s, w, size) {
    mg.font = size + 'px ' + FONT;
    let t = s;
    while (t.length > 4 && mg.measureText(t).width > w) t = t.slice(0, -2);
    return t === s ? s : t + '\u2026';
  }

  function menuPaint() {
    const W = MENU, COL = 576, RH = 44;
    mg.fillStyle = '#fff';
    mg.fillRect(0, 0, W, W);
    /* the frame, the path, and the two columns, as the page lays them out */
    mgRule(1, 1, W - 1, 1, 2); mgRule(1, W - 1, W - 1, W - 1, 2);
    mgRule(1, 1, 1, W - 1, 2); mgRule(W - 1, 1, W - 1, W - 1, 2);
    mgText('domebase / lab / 3d math', 16, 38, 'left', 'bold', 24);
    mgText(String(shapes.length) + ' shapes', W - 16, 38, 'right', '', 20);
    mgRule(1, RH + 12, W - 1, RH + 12, 2);
    mgRule(COL, RH + 12, COL, W - 1, 1);

    /* shapes, down the left, one row each */
    const top = RH + 44;
    mgText('shapes', 16, top, 'left', 'bold', 22);
    let y = top + 34;
    const step = Math.min(32, (W - 12 - y) / Math.max(1, shapes.length));
    for (const def of shapes) {
      const on = S.def && def.id === S.def.id;
      const st = lazyStats[def.id];
      if (on) { mg.fillStyle = '#efefef'; mg.fillRect(2, y - 20, COL - 4, step); mg.fillStyle = '#000'; }
      mgText(mgFit(def.name, 258, 20), 16, y, 'left', on ? 'bold' : '', 20);
      if (st) {
        mgText(st.vertices == null ? '\u2014' : Number(st.vertices).toLocaleString(), 400, y, 'right', on ? 'bold' : '', 19);
        mgText(Number(st.segments).toLocaleString(), COL - 76, y, 'right', on ? 'bold' : '', 19);
        mgText(st.triangles ? Number(st.triangles).toLocaleString() : '', COL - 12, y, 'right', on ? 'bold' : '', 19);
      }
      y += step;
    }

    /* the right column: parameters, the view controls, the measures — three rectangles that
       share their edges and fill the column exactly */
    const view = [
      ['spin', S.spin ? 'on' : 'off'],
      ['animate', S.sweep ? 'on' : 'off'],
      ['depth', S.depth ? 'on' : 'off'],
      ['edges', S.edges ? 'on' : 'off'],
      ['faces', S.faces ? 'on' : 'off'],
      ['colour', ['off', 'data', 'normal'][S.colour] || 'normal'],
      ['dome', S.dome ? 'on' : 'off'],
      ['fov', S.fov.toFixed(0) + '\u00b0'],
      ['size', S.faceDist.toFixed(2)],
      ['guides', S.guides ? 'on' : 'off'],
      ['yaw / pitch', S.yaw.toFixed(2) + ' / ' + S.pitch.toFixed(2)]
    ];
    const params = (S.def ? S.def.params : []).map(p => [p.label || p.k, typeof S.P[p.k] === 'number' ? fmt(S.P[p.k]) : String(S.P[p.k]), S.sweepOn[p.k] ? 'sweep' : '']);
    const meas = specRows().map(r => [r[0], r[1]]);
    const panes = [
      { t: 'parameters', rows: params.map(r => [r[0], r[1], r[2]]) },
      { t: 'view', rows: view.map(r => [r[0], r[1], '']) },
      { t: 'measures', rows: meas.map(r => [r[0], r[1], '']) }
    ];
    const body = W - 12 - top;
    const nRows = panes.reduce((a, p) => a + p.rows.length, 0);
    const rh = Math.max(19, Math.min(36, (body - panes.length * 40) / Math.max(1, nRows)));
    let py = top;
    for (const pane of panes) {
      const h = pane.rows.length ? 40 + pane.rows.length * rh : 40;
      if (py > top) mgRule(COL, py - 1, W - 1, py - 1, 1);
      mgText(pane.t, COL + 16, py + 28, 'left', 'bold', 22);
      mgRule(COL + 1, py + 40, W - 1, py + 40, 1);
      let ry = py + 40 + rh - 6;
      for (const r of pane.rows) {
        mgText(mgFit(r[0], 210, 19), COL + 16, ry, 'left', '', 19);
        mgText(mgFit(r[1], 150, 19), W - 16, ry, 'right', '', 19);
        if (r[2]) mgText(r[2], W - 96, ry, 'right', '', 13);
        ry += rh;
      }
      py += h;
    }
  }

  const menuTex = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, menuTex);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([255, 255, 255, 255]));
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

  function menuUpload() {
    gl.bindTexture(gl.TEXTURE_2D, menuTex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, menuCv);
  }

  const VSQUAD = [
    'attribute vec3 aP;',
    'attribute vec2 aT;',
    'uniform mat4 uMvp;',
    'varying vec2 vT;',
    'void main() { vT = aT; gl_Position = uMvp * vec4(aP, 1.0); }'
  ].join('\n');
  const FSQUAD = [
    'precision mediump float;',
    'uniform sampler2D uTex;',
    'varying vec2 vT;',
    'void main() { gl_FragColor = vec4(texture2D(uTex, vT).rgb, 1.0); }'
  ].join('\n');
  const progMenu = link(VSQUAD, FSQUAD);
  const AM = { p: gl.getAttribLocation(progMenu, 'aP'), t: gl.getAttribLocation(progMenu, 'aT') };
  const UM = { mvp: gl.getUniformLocation(progMenu, 'uMvp'), tex: gl.getUniformLocation(progMenu, 'uTex') };

  /* the menu wall sits at radius 1 behind the viewer, sized to fill the 90 degree face.
     u runs against the world's x and v against its y: that face's camera looks out with right
     at -x and up at -y, so a quad laid out the naive way reads upside down. */
  const menuQuad = gl.createBuffer();
  function buildMenuQuad() {
    const h = S.faceDist + 1, z = -1;
    const v = new Float32Array([
      -h, h, z, 1, 0,
      h, h, z, 0, 0,
      -h, -h, z, 1, 1,
      h, -h, z, 0, 1
    ]);
    gl.bindBuffer(gl.ARRAY_BUFFER, menuQuad);
    gl.bufferData(gl.ARRAY_BUFFER, v, gl.DYNAMIC_DRAW);
  }

  function drawMenuFace() {
    M.lookAt(view, [0, 0, S.faceDist], [0, 0, 0], FACE_LOOK[FACE_BACK].u);
    M.perspective(proj, Math.PI / 2, 1, 0.02, 60);
    M.mul(mvp, proj, view);
    gl.useProgram(progMenu);
    gl.disable(gl.DEPTH_TEST);
    gl.uniformMatrix4fv(UM.mvp, false, mvp);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, menuTex);
    gl.uniform1i(UM.tex, 0);
    attrib(AM.p, menuQuad, 3, 20, 0);
    attrib(AM.t, menuQuad, 2, 20, 12);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    gl.enable(gl.DEPTH_TEST);
  }

  /* one face: a camera faceDist outside the object on that side, 90 degrees across,
     which is what that face of the cube holds */
  function drawFace(F0) {
    const d = S.faceDist;
    M.lookAt(view, [-F0.f[0] * d, -F0.f[1] * d, -F0.f[2] * d], [0, 0, 0], F0.u);
    M.perspective(proj, Math.PI / 2, 1, 0.02, 60);
    M.rotY(modelM, S.spinAng);
    M.mul(tmpM, proj, view);
    M.mul(mvp, tmpM, modelM);
    gl.useProgram(prog);
    gl.uniformMatrix4fv(U.mvp, false, mvp);
    gl.uniformMatrix4fv(U.view, false, view);
    gl.uniform3f(U.light, 0.40, 0.52, 0.75);
    gl.uniform4f(U.levels, 0.58, 0.30, 0.14, 0.05);
    gl.uniform1f(U.colour, S.colour);
    gl.uniform1f(U.hasTone, S.geo.hasTone ? 1 : 0);
    gl.uniform1f(U.near, Math.max(0.01, d - 1.15));
    gl.uniform1f(U.far, Math.max(0.02, d + 1.15));
    drawPrims();
  }

  function drawPrims() {
    const g = S.geo;
    /* triangles first, pushed back a hair so the edges sit on top of them */
    if (S.faces && g.triN) {
      gl.enable(gl.POLYGON_OFFSET_FILL);
      gl.polygonOffset(1.0, 1.0);
      attrib(A.pos, buf.tris, 3);
      attrib(A.norm, buf.norm, 3);
      attrib(A.tone, buf.tone, 1);
      gl.uniform1f(U.mode, 0);
      gl.uniform1f(U.lit, g.hasTone ? 0 : 1);
      gl.uniform1f(U.fade, S.depth ? 0.5 : 0);
      gl.drawArrays(gl.TRIANGLES, 0, g.triN);
      gl.disable(gl.POLYGON_OFFSET_FILL);
    }
    if (S.edges && g.lineN) {
      attrib(A.pos, buf.lines, 3);
      gl.disableVertexAttribArray(A.norm);
      attrib(A.tone, buf.tone, 1, 0, g.triN * 4);
      gl.uniform1f(U.mode, 1);
      gl.uniform1f(U.lit, 0);
      gl.uniform1f(U.fade, S.depth ? 1 : 0);
      gl.drawArrays(gl.LINES, 0, g.lineN);
    }
  }

  function drawFlat(aspect) {
    const cp = Math.cos(S.pitch);
    const eye = [S.dist * cp * Math.cos(S.yaw), S.dist * Math.sin(S.pitch), S.dist * cp * Math.sin(S.yaw)];
    gl.useProgram(prog);
    gl.enable(gl.DEPTH_TEST);
    gl.disable(gl.CULL_FACE);
    M.lookAt(view, eye, [0, 0, 0], [0, 1, 0]);
    M.perspective(proj, 32 * Math.PI / 180, aspect, 0.02, 60);
    M.mul(mvp, proj, view);
    gl.uniformMatrix4fv(U.mvp, false, mvp);
    gl.uniformMatrix4fv(U.view, false, view);
    gl.uniform3f(U.light, 0.40, 0.52, 0.75);
    gl.uniform4f(U.levels, 0.58, 0.30, 0.14, 0.05);
    gl.uniform1f(U.colour, S.colour);
    gl.uniform1f(U.hasTone, S.geo.hasTone ? 1 : 0);
    gl.uniform1f(U.near, Math.max(0.01, S.dist - 1.02));
    gl.uniform1f(U.far, Math.max(0.02, S.dist + 1.02));
    drawPrims();
  }

  function drawDome() {
    const all = S.cubeStale, back = S.cubeStale || backStale;
    if (all || back) {
      gl.bindFramebuffer(gl.FRAMEBUFFER, cubeFbo);
      gl.viewport(0, 0, FACE, FACE);
      gl.enable(gl.DEPTH_TEST);
      gl.disable(gl.CULL_FACE);
      for (let i = 0; i < 6; i++) {
        if (i === FACE_BACK ? !back : !all) continue;
        gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_CUBE_MAP_POSITIVE_X + i, cube, 0);
        gl.clearColor(1, 1, 1, 1);
        gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
        if (i === FACE_BACK) drawMenuFace(); else drawFace(FACE_LOOK[i]);
      }
      S.cubeStale = false;
      backStale = false;
    }
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, cv.width, cv.height);
    gl.disable(gl.DEPTH_TEST);
    gl.useProgram(progDome);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_CUBE_MAP, cube);
    gl.uniform1i(UD.cube, 0);
    gl.uniform2f(UD.res, cv.width, cv.height);
    gl.uniform1f(UD.fov, S.fov);
    gl.uniform1f(UD.yaw, S.yaw);
    gl.uniform1f(UD.pitch, S.pitch);
    gl.uniform1f(UD.guide, S.guides ? 1 : 0);
    attrib(AD.q, buf.quad, 2);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  }

  function draw() {
    const aspect = resize();
    gl.clearColor(1, 1, 1, 1);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    if (!S.out) return;
    if (!S.dome) { drawFlat(aspect); return; }
    if (menuStale) { menuPaint(); menuUpload(); menuStale = false; backStale = true; }
    drawDome();
  }

  /* ---------------- controls ---------------- */
  function pack() {
    for (const p of (S.def ? S.def.params : [])) p.__v = S.P[p.k];
  }

  function sweepParams(now) {
    if (!S.sweep || !S.def) return false;
    let moved = false;
    for (const p of S.def.params) {
      if (!S.sweepOn[p.k]) continue;
      const T = Math.max(1, S.period[p.k] || 12);
      const u = 0.5 - 0.5 * Math.cos(2 * Math.PI * (now / 1000) / T);
      const v = p.min + (p.max - p.min) * u;
      const step = p.step || 0;
      const q = step ? Math.round(v / step) * step : v;
      if (Math.abs(q - S.P[p.k]) > Math.max(1e-9, step * 0.4)) {
        S.P[p.k] = q;
        const el = document.getElementById('pv_' + p.k);
        if (el) el.value = fmt(q);
        moved = true;
      }
    }
    return moved;
  }

  const fmt = v => (Math.abs(v) >= 100 ? v.toFixed(0) : Math.abs(v) >= 10 ? v.toFixed(1) : v.toFixed(2)).replace(/\.00$/, '');

  function load(id, keepView) {
    const def = shapes.find(s => s.id === id) || shapes[0];
    if (!def) return;
    S.def = def;
    S.P = defaults(def);
    S.sweepOn = {}; S.period = {};
    for (const p of def.params) {
      if (p.anim) { S.sweepOn[p.k] = true; S.period[p.k] = p.anim; }
    }
    if (!keepView) front();
    paintParams();
    for (const tr of document.querySelectorAll('#indexbody tr.row')) {
      tr.classList.toggle('on', tr.dataset.id === def.id);
    }
    rebuild(performance.now());
    location.hash = def.id;
  }


  function paintIndex() {
    const body = $('#indexbody');
    body.innerHTML = '';
    for (const def of shapes) {
      const tr = document.createElement('tr');
      tr.className = 'row';
      tr.dataset.id = def.id;
      tr.dataset.family = def.family;
      tr.innerHTML = '<td>' + def.name + '</td>' +
        '<td class="n c-v"></td><td class="n c-l"></td><td class="n c-t"></td>';
      tr.addEventListener('click', () => load(def.id, true));
      body.appendChild(tr);
    }
  }

  const lazyStats = {};
  function rememberRow(def, st) {
    if (!st) return;
    lazyStats[def.id] = st;
    const tr = document.querySelector('#indexbody tr[data-id="' + def.id + '"]');
    if (!tr) return;
    tr.querySelector('.c-v').textContent = st.vertices == null ? '—' : st.vertices.toLocaleString();
    tr.querySelector('.c-l').textContent = st.segments.toLocaleString();
    tr.querySelector('.c-t').textContent = st.triangles ? st.triangles.toLocaleString() : '';
  }

  /* one shape at a time, in the background, so the index fills its counts in */
  function fillIndex(i) {
    i = i || 0;
    if (i >= shapes.length) return;
    const def = shapes[i];
    setTimeout(() => {
      if (!lazyStats[def.id] && (!S.def || S.def.id !== def.id)) {
        try {
          const out = def.build(defaults(def), G);
          rememberRow(def, out.stats);
        } catch (e) { /* the checker is where failures are reported */ }
      }
      fillIndex(i + 1);
    }, 16);
  }

  function paintParams() {
    menuStale = true;
    const body = $('#parambody');
    body.innerHTML = '';
    for (const p of S.def.params) {
      const tr = document.createElement('tr');
      const k = document.createElement('td');
      k.className = 'k'; k.textContent = p.label || p.k;
      const v = document.createElement('td'); v.className = 'n';
      let input;
      if (p.choices) {
        input = document.createElement('select');
        p.choices.forEach((c, i) => {
          const o = document.createElement('option');
          o.value = String(i + (p.min || 0)); o.textContent = c;
          input.appendChild(o);
        });
        input.value = String(S.P[p.k]);
      } else {
        input = document.createElement('input');
        input.type = 'number'; input.value = String(S.P[p.k]);
      }
      input.id = 'pv_' + p.k;
      input.addEventListener('input', () => {
        const num = parseFloat(input.value);
        if (!isFinite(num)) return;
        S.P[p.k] = Math.min(p.max, Math.max(p.min, num));
        S.dirty = true;
      });
      v.appendChild(input);
      const c = document.createElement('td');
      const chk = document.createElement('input');
      chk.type = 'checkbox'; chk.checked = !!S.sweepOn[p.k];
      chk.addEventListener('change', () => { S.sweepOn[p.k] = chk.checked; });
      c.appendChild(chk);
      const s = document.createElement('td'); s.className = 'n';
      const per = document.createElement('input');
      per.type = 'number'; per.className = 'p';
      per.value = String(S.period[p.k] || 12);
      per.addEventListener('input', () => {
        const num = parseFloat(per.value);
        if (isFinite(num) && num > 0.2) S.period[p.k] = num;
      });
      s.appendChild(per);
      tr.appendChild(k); tr.appendChild(v); tr.appendChild(c); tr.appendChild(s);
      body.appendChild(tr);
    }
  }

  /* the measures, and the source link, as rows — the page's table and the menu drawn into
     the back face both read them, so the dome cannot show a different number */
  function specRows() {
    const rows = [];
    const src = S.def.src || '';
    const m = /^knill\s+(.+)$/.exec(src);
    const plain = m ? m[1] : src;
    rows.push(['source', plain, m
      ? '<a href="https://people.math.harvard.edu/~knill/3dprinter/' + m[1].replace(/^3dprinter\//, '').replace(/\.html$/, '.html') + '" target="_blank" rel="noopener">' + m[1] + '</a>'
      : src]);
    const order = ['vertices', 'edges', 'faces', 'cells', 'spheres', 'segments', 'triangles', 'steps', 'points', 'fibres', 'struts', 'links', 'level', 'cubes', 'trees', 'branches'];
    for (const k of order) {
      if (S.stats[k] === undefined || S.stats[k] === null) continue;
      rows.push([k, Number(S.stats[k]).toLocaleString()]);
    }
    for (const k of Object.keys(S.stats)) {
      if (order.indexOf(k) >= 0 || S.stats[k] === null) continue;
      rows.push([k, typeof S.stats[k] === 'number' ? Number(S.stats[k]).toLocaleString() : String(S.stats[k])]);
    }
    rows.push(['ink', S.geo.hasTone ? 'fourth coordinate' : 'lit + depth']);
    rows.push(['build', S.buildMs.toFixed(0) + ' ms']);
    rows.push(['frame', S.fps.toFixed(0) + ' /s']);
    return rows;
  }

  function paintSpec() {
    menuStale = true;
    const body = $('#specbody');
    body.innerHTML = '';
    for (const r of specRows()) {
      const tr = document.createElement('tr');
      tr.innerHTML = '<td class="k">' + r[0] + '</td><td class="v">' + (r[2] || r[1]) + '</td>';
      body.appendChild(tr);
    }
  }

  function paintCount() {
    menuStale = true;
    const s = S.stats;
    const bits = [];
    if (s.vertices) bits.push(Number(s.vertices).toLocaleString() + ' vertices');
    if (s.segments) bits.push(Number(s.segments).toLocaleString() + ' lines');
    if (s.triangles) bits.push(Number(s.triangles).toLocaleString() + ' triangles');
    bits.push(shapes.length + ' shapes');
    $('#count').textContent = bits.join(' · ');
  }

  function front() {
    if (S.dome) { S.yaw = 0; S.pitch = 0; S.fov = 180; S.spinAng = 0; }
    else { S.yaw = -0.62; S.pitch = 0.30; }
    S.dist = 4.4; S.cubeStale = true;
    buildMenuQuad();
    const f = document.getElementById('fov');
    if (f) f.value = String(Math.round(S.fov));
  }

  /* ---------------- interaction ---------------- */
  (function () {
    let down = false, px = 0, py = 0;
    cv.addEventListener('pointerdown', e => {
      down = true; px = e.clientX; py = e.clientY;
      cv.classList.add('drag'); cv.setPointerCapture(e.pointerId);
    });
    cv.addEventListener('pointermove', e => {
      if (!down) return;
      S.yaw -= (e.clientX - px) * 0.0075;
      S.pitch = Math.max(-1.5, Math.min(1.5, S.pitch + (e.clientY - py) * 0.0075));
      px = e.clientX; py = e.clientY;
    });
    const up = () => { down = false; cv.classList.remove('drag'); };
    cv.addEventListener('pointerup', up);
    cv.addEventListener('pointercancel', up);
    cv.addEventListener('wheel', e => {
      e.preventDefault();
      if (S.dome) {
        S.fov = Math.max(90, Math.min(300, S.fov * Math.exp(e.deltaY * 0.0006)));
        const f = document.getElementById('fov');
        if (f) f.value = String(Math.round(S.fov));
      } else {
        S.dist = Math.max(1.8, Math.min(18, S.dist * Math.exp(e.deltaY * 0.0012)));
      }
    }, { passive: false });
    cv.addEventListener('dblclick', front);
    window.addEventListener('keydown', e => {
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT') return;
      if (e.key === 'r') front();
      else if (e.key === 's') { $('#spin').checked = !$('#spin').checked; S.spin = $('#spin').checked; }
      else if (e.key === 'a') { $('#sweep').checked = !$('#sweep').checked; S.sweep = $('#sweep').checked; }
    });
    $('#spin').addEventListener('change', e => { S.spin = e.target.checked; });
    $('#sweep').addEventListener('change', e => { S.sweep = e.target.checked; });
    $('#depth').addEventListener('change', e => { S.depth = e.target.checked; S.cubeStale = true; });
    $('#edges').addEventListener('change', e => { S.edges = e.target.checked; S.cubeStale = true; });
    $('#faces').addEventListener('change', e => { S.faces = e.target.checked; S.cubeStale = true; });
    $('#colour').addEventListener('change', e => { S.colour = parseFloat(e.target.value) || 0; S.cubeStale = true; });
    $('#front').addEventListener('click', front);
    /* the dome's own controls; guarded, so the viewer runs before the page markup has them */
    const on = (id, ev, fn) => { const el = document.getElementById(id); if (el) el.addEventListener(ev, fn); };
    on('dome', 'change', e => { S.dome = e.target.checked; S.cubeStale = true; });
    on('guides', 'change', e => { S.guides = e.target.checked; });
    on('spin', 'change', e => { S.spin = e.target.checked; menuStale = true; });
    on('size', 'input', e => {
      const v = parseFloat(e.target.value);
      if (v) { S.faceDist = Math.max(1.1, Math.min(4, v)); buildMenuQuad(); backStale = true; }
    });
    on('fov', 'input', e => {
      const v = parseFloat(e.target.value);
      if (v) S.fov = Math.max(90, Math.min(300, v));
    });
  })();

  /* ---------------- loop ---------------- */
  let last = performance.now();
  function frame(now) {
    const dt = Math.min(0.1, (now - last) / 1000); last = now;
    if (S.spin) {
      if (S.dome) { S.spinAng += dt * 0.45; S.cubeStale = true; }
      else S.yaw += dt * 0.32;
    }
    if (sweepParams(now)) S.dirty = true;
    if (S.dirty) S.cubeStale = true;
    if (S.dirty && now - S.lastBuild > Math.max(16, S.buildMs * 1.5)) rebuild(now);
    draw();
    S.frames++;
    if (now - S.fpsAt > 500) {
      S.fps = S.frames * 1000 / (now - S.fpsAt);
      S.frames = 0; S.fpsAt = now;
      paintSpec();
    }
    requestAnimationFrame(frame);
  }

  /* ---------------- start ---------------- */
  if (!shapes.length) {
    const p = document.createElement('div');
    p.className = 'say'; p.textContent = 'no shapes loaded — geom.js and the fam_*.js files must sit beside this page';
    stage.appendChild(p);
    $('#count').textContent = '0 shapes';
    return;
  }
  paintIndex();
  const want = (location.hash || '').replace('#', '');
  load(shapes.some(s => s.id === want) ? want : shapes[0].id);
  fillIndex(0);
  window.addEventListener('resize', () => { /* the loop picks it up */ });
  requestAnimationFrame(frame);

  /* what the page is showing, for a script driving it */
  window.MATH3D = {
    state: S,
    shapes: shapes,
    load: load,
    front: front,
    rebuild: () => rebuild(performance.now()),
    stats: () => ({ id: S.def.id, family: S.def.family, params: S.def.params.map(p => p.k),
                    values: Object.assign({}, S.P), counts: S.stats, buildMs: S.buildMs }),
    darkFraction: (step) => {
      /* how much ink is actually on the canvas — the cheapest honest proof that
         something was drawn. Copies the canvas: readPixels on a multisampled
         default framebuffer returns zeros, which reads as "all ink". */
      draw();
      const w = cv.width, h = cv.height;
      const c2 = document.createElement('canvas');
      c2.width = w; c2.height = h;
      const ctx = c2.getContext('2d');
      ctx.drawImage(cv, 0, 0);
      const px = ctx.getImageData(0, 0, w, h).data;
      let dark = 0, total = 0;
      const s = step || 7;
      for (let y = 0; y < h; y += s) for (let x = 0; x < w; x += s) {
        const i = (y * w + x) * 4;
        total++;
        if (px[i] < 240) dark++;
      }
      return { dark: dark, sampled: total, fraction: total ? dark / total : 0 };
    }
  };
})();
