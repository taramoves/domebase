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
    rotX(o, a) {
      const c = Math.cos(a), s = Math.sin(a);
      o[0] = 1; o[1] = 0; o[2] = 0; o[3] = 0;
      o[4] = 0; o[5] = c; o[6] = s; o[7] = 0;
      o[8] = 0; o[9] = -s; o[10] = c; o[11] = 0;
      o[12] = 0; o[13] = 0; o[14] = 0; o[15] = 1;
      return o;
    },
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
    fov: 180, guides: true, spinAng: 0, faceDist: 1.45, cubeStale: true,
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
    placeMenu();                            /* the layer's place is a function of the aperture */
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
  const modelM = new Float32Array(16), tmpM = new Float32Array(16);
  const modA = new Float32Array(16), modB = new Float32Array(16);

  /* the shape's orientation: dragging turns the shape about the vertical, spin adds to it, and
     pitching tips it. The master never moves — a fixed frame is what a master is. */
  function modelMatrix(o) {
    M.rotY(modA, S.yaw + S.spinAng);
    M.rotX(modB, S.pitch);
    return M.mul(o, modB, modA);
  }

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
    'uniform float uGuide;',
    'void main() {',
    '  vec2 p = (gl_FragCoord.xy - 0.5 * uRes) / (0.5 * min(uRes.x, uRes.y));',
    '  float r = length(p);',
    '  if (r > 1.0) { gl_FragColor = vec4(1.0, 1.0, 1.0, 1.0); return; }',
    '  float th = r * radians(uFov) * 0.5;',
    '  float ph = atan(p.y, p.x);',
    '  vec3 c = vec3(0.0, 1.0, 0.0);',
    '  vec3 rt = vec3(1.0, 0.0, 0.0);',
    '  vec3 up = vec3(0.0, 0.0, -1.0);',
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

  /* one face: a camera faceDist outside the object on that side, 90 degrees across,
     which is what that face of the cube holds */
  function drawFace(F0) {
    const d = S.faceDist;
    M.lookAt(view, [-F0.f[0] * d, -F0.f[1] * d, -F0.f[2] * d], [0, 0, 0], F0.u);
    M.perspective(proj, Math.PI / 2, 1, 0.02, 60);
    modelMatrix(modelM);
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

  function drawDome() {
    if (S.cubeStale) {
      gl.bindFramebuffer(gl.FRAMEBUFFER, cubeFbo);
      gl.viewport(0, 0, FACE, FACE);
      gl.enable(gl.DEPTH_TEST);
      gl.disable(gl.CULL_FACE);
      for (let i = 0; i < 6; i++) {
        gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_CUBE_MAP_POSITIVE_X + i, cube, 0);
        gl.clearColor(1, 1, 1, 1);
        gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
        drawFace(FACE_LOOK[i]);
      }
      S.cubeStale = false;
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
    gl.uniform1f(UD.guide, S.guides ? 1 : 0);
    attrib(AD.q, buf.quad, 2);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  }

  function draw() {
    const aspect = resize();
    gl.clearColor(1, 1, 1, 1);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    if (!S.out) return;
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

  /* the measures, and the source link, as rows — the menu's table and the dome's copy of it are
     the same rows, so the dome cannot show a different number */
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
    const body = $('#specbody');
    body.innerHTML = '';
    for (const r of specRows()) {
      const tr = document.createElement('tr');
      tr.innerHTML = '<td class="k">' + r[0] + '</td><td class="v">' + (r[2] || r[1]) + '</td>';
      body.appendChild(tr);
    }
  }

  function paintCount() {
    const s = S.stats;
    const bits = [];
    if (s.vertices) bits.push(Number(s.vertices).toLocaleString() + ' vertices');
    if (s.segments) bits.push(Number(s.segments).toLocaleString() + ' lines');
    if (s.triangles) bits.push(Number(s.triangles).toLocaleString() + ' triangles');
    bits.push(shapes.length + ' shapes');
    $('#count').textContent = bits.join(' · ');
  }

  function front() {
    S.fov = 180;
    S.yaw = 0; S.pitch = 0; S.spinAng = 0; S.dist = 4.4;
    S.cubeStale = true;
    const f = document.getElementById('fov');
    if (f) f.value = String(Math.round(S.fov));
    placeMenu();
  }

  /* ---------------- the menu, on the dome, as a layer ----------------
     The menu is not in the scene. It is a patch of the dome itself — low on the front left, the
     spot lab/pitch gives its phone — and is drawn over the canvas as a 2d layer warped onto that
     patch: the four corners of its layout box are placed where the dome puts them and a projective
     map (a CSS matrix3d) carries the box onto that quad, so the layer foreshortens the way a panel
     on the dome does. An element can only send straight lines to straight lines; the fisheye bends
     the patch's own edges a little, and that residue is what one editable element cannot carry.
     Nothing moves it: the placement is computed from a fixed 180 degrees, once, and only again on
     resize — fov, spin and the drag all leave it alone. H hides and shows it. */
  const MENU = { az: 228 * Math.PI / 180, alt: 42 * Math.PI / 180,
                 halfAz: 39 * Math.PI / 180, halfAlt: 15 * Math.PI / 180 };
  const MENU_FOV = 180;                     /* the frame the layer is locked to */
  /* where the dome puts the four corners of the layout box, in master pixels */
  function menuCorners() {
    const R = Math.min(cv.width, cv.height) / 2;
    const k = R / (MENU_FOV * Math.PI / 360);
    const at = (az, alt) => {
      const rr = (Math.PI / 2 - alt) * k;
      return [cv.width / 2 + rr * Math.cos(az), cv.height / 2 - rr * Math.sin(az)];
    };
    return [
      at(MENU.az - MENU.halfAz, MENU.alt + MENU.halfAlt),    /* the box's top left */
      at(MENU.az + MENU.halfAz, MENU.alt + MENU.halfAlt),
      at(MENU.az + MENU.halfAz, MENU.alt - MENU.halfAlt),
      at(MENU.az - MENU.halfAz, MENU.alt - MENU.halfAlt)];
  }
  /* a box of w by h onto that quad, as matrix3d — the standard unit-square homography, scaled */
  function quadMatrix(w, h, q) {
    const p0 = q[0], p1 = q[1], p2 = q[2], p3 = q[3];
    const dx1 = p1[0] - p2[0], dx2 = p3[0] - p2[0], dx3 = p0[0] - p1[0] + p2[0] - p3[0];
    const dy1 = p1[1] - p2[1], dy2 = p3[1] - p2[1], dy3 = p0[1] - p1[1] + p2[1] - p3[1];
    let a, b, c, d, e, f, g, i;
    if (Math.abs(dx3) < 1e-9 && Math.abs(dy3) < 1e-9) {
      a = p1[0] - p0[0]; b = p2[0] - p1[0]; c = p0[0];
      d = p1[1] - p0[1]; e = p2[1] - p1[1]; f = p0[1]; g = 0; i = 0;
    } else {
      const den = dx1 * dy2 - dx2 * dy1;
      g = (dx3 * dy2 - dx2 * dy3) / den;
      i = (dx1 * dy3 - dx3 * dy1) / den;
      a = p1[0] - p0[0] + g * p1[0]; b = p3[0] - p0[0] + i * p3[0]; c = p0[0];
      d = p1[1] - p0[1] + g * p1[1]; e = p3[1] - p0[1] + i * p3[1]; f = p0[1];
    }
    const m = [a / w, d / w, 0, g / w, b / h, e / h, 0, i / h, 0, 0, 1, 0, c, f, 0, 1];
    return 'matrix3d(' + m.map(n => Math.round(n * 1e6) / 1e6).join(',') + ')';
  }
  function placeMenu() {
    const el = document.getElementById('menu');
    if (!el || !cv.width) return;
    el.style.transformOrigin = '0 0';
    el.style.left = '0px';
    el.style.top = '0px';
    el.style.transform = quadMatrix(el.offsetWidth, el.offsetHeight, menuCorners());
  }

  /* ---------------- interaction ---------------- */
  (function () {
    /* the layer's place follows the aperture, so re-place whenever the aperture can have moved:
       resize() sizes the canvas and then places the layer. Calling it here as well covers a load
       that has not run a frame yet. */
    const replaced = () => { resize(); };
    window.addEventListener('resize', replaced);
    placeMenu();
    requestAnimationFrame(replaced);
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
      /* the master is fixed, so a drag turns the scene inside the cube faces: without this the
         picture only moves while the spin happens to be re-rendering it */
      S.cubeStale = true;
    });
    const up = () => { down = false; cv.classList.remove('drag'); };
    cv.addEventListener('pointerup', up);
    cv.addEventListener('pointercancel', up);
    cv.addEventListener('wheel', e => {
      e.preventDefault();
      S.fov = Math.max(90, Math.min(300, S.fov * Math.exp(e.deltaY * 0.0006)));
      const f = document.getElementById('fov');
      if (f) f.value = String(Math.round(S.fov));
    }, { passive: false });
    cv.addEventListener('dblclick', front);
    window.addEventListener('keydown', e => {
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT') return;
      if (e.key === 'r') front();
      else if (e.key === 's') { $('#spin').checked = !$('#spin').checked; S.spin = $('#spin').checked; }
      else if (e.key === 'a') { $('#sweep').checked = !$('#sweep').checked; S.sweep = $('#sweep').checked; }
      else if (e.key === 'h' || e.key === 'H') {
        const m = document.getElementById('menu');
        if (m) m.style.display = m.style.display === 'none' ? '' : 'none';
      }
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
    on('guides', 'change', e => { S.guides = e.target.checked; });
    on('spin', 'change', e => { S.spin = e.target.checked; });
    on('size', 'input', e => {
      const v = parseFloat(e.target.value);
      if (v) { S.faceDist = Math.max(1.1, Math.min(4, v)); S.cubeStale = true; }
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
    if (S.spin) { S.spinAng += dt * 0.45; S.cubeStale = true; }
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
