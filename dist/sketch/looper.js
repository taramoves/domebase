/* =========================================================================
   AV LOOPER ENGINE
   - a shape stores only where it BELONGS (symbolic); its angle/radius/
     trigger time are re-derived from the current grid every frame, so
     changing turns/cellCount/rings/splits moves shapes with their sections
     instead of breaking them
   - voices: shape AND sound are one thing (a star is a sound)
   - loop position in STEP UNITS; spiral stepPos = arcLength/arcStep so the
     integer part is the cell and the fraction is how far into it
   ========================================================================= */

let SIZE = 420;      // the drawing's own square: the shorter side of the window, set by fit()
const SCALE_HZ = [261.63, 293.66, 329.63, 392.00, 440.00,
                  523.25, 587.33, 659.25, 783.99, 880.00];
const GLYPHS = { star: '\u2605', circle: '\u25CF', triangle: '\u25B2',
                 square: '\u25A0', flower: '\u2740' };

// ---- audio ---------------------------------------------------------------

let audioCtx = null;
function ensureAudioContext() {
  if (!audioCtx) {
    const AC = window.AudioContext || window.webkitAudioContext;
    audioCtx = new AC();
  }
  if (audioCtx.state !== 'running') audioCtx.resume();
  return audioCtx;
}

// two oscillators (fundamental + optional harmonic partial) -> lowpass that
// closes as the note decays -> attack/release envelope -> stereo pan
function playVoice(voice, freq, pan) {
  try {
    const ctx = ensureAudioContext();
    const t0 = ctx.currentTime;
    const a = Math.max(0.001, voice.attack / 1000);
    const r = Math.max(0.02, voice.release / 1000);
    const stop = t0 + a + r + 0.05;

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0, t0);
    gain.gain.linearRampToValueAtTime(voice.gain, t0 + a);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + a + r);

    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    const fc = Math.max(200, voice.filterHz);
    filter.frequency.setValueAtTime(fc, t0);
    filter.frequency.exponentialRampToValueAtTime(Math.max(200, fc * 0.4), t0 + a + r);
    filter.Q.value = 1;

    const panner = ctx.createStereoPanner();
    panner.pan.value = pan || 0;

    const osc = ctx.createOscillator();
    osc.type = voice.wave;
    osc.frequency.value = freq;
    osc.connect(filter);
    osc.start(t0); osc.stop(stop);

    if (voice.harmonicLevel > 0.001 && voice.harmonic > 0) {
      const osc2 = ctx.createOscillator();
      osc2.type = 'sine';
      osc2.frequency.value = freq * voice.harmonic;
      const g2 = ctx.createGain();
      g2.gain.value = voice.harmonicLevel;
      osc2.connect(g2).connect(filter);
      osc2.start(t0); osc2.stop(stop);
    }

    filter.connect(gain).connect(panner).connect(ctx.destination);
  } catch (e) {
    console.warn('audio error', e);
  }
}

// SHAPE AND SOUND ARE ONE THING — voices are named after their shape
function defaultVoices() {
  return [
    { type: 'star',     name: 'Star',     color: [255, 214, 64],
      wave: 'triangle', pitchMul: 1,    harmonic: 2, harmonicLevel: 0.30, filterHz: 5000,
      attack: 4,  release: 520, gain: 0.28, pitchMode: 'up' },
    { type: 'circle',   name: 'Circle',   color: [255, 255, 255],
      wave: 'sine',     pitchMul: 1,    harmonic: 0, harmonicLevel: 0,    filterHz: 8000,
      attack: 6,  release: 380, gain: 0.30, pitchMode: 'up' },
    { type: 'triangle', name: 'Triangle', color: [86, 179, 255],
      wave: 'square',   pitchMul: 0.5,  harmonic: 3, harmonicLevel: 0.15, filterHz: 1800,
      attack: 2,  release: 160, gain: 0.20, pitchMode: 'straight' },
    { type: 'square',   name: 'Square',   color: [255, 91, 141],
      wave: 'sawtooth', pitchMul: 0.25, harmonic: 2, harmonicLevel: 0.20, filterHz: 900,
      attack: 8,  release: 300, gain: 0.22, pitchMode: 'straight' },
    { type: 'flower',   name: 'Flower',   color: [150, 255, 180],
      wave: 'sine',     pitchMul: 2,    harmonic: 3, harmonicLevel: 0.35, filterHz: 6000,
      attack: 3,  release: 900, gain: 0.20, pitchMode: 'down' }
  ].map((v, i) => Object.assign(v, { index: i }));
}

// pitchMode: 'up' = degree from loop position (outward higher),
// 'down' = inverted (starts high, descends), 'straight' = fixed per voice
function frequencyFor(voice, normalizedPos) {
  let idx;
  if (voice.pitchMode === 'up') {
    idx = Math.floor(normalizedPos * SCALE_HZ.length);
  } else if (voice.pitchMode === 'down') {
    idx = Math.floor((1 - normalizedPos) * SCALE_HZ.length);
  } else {
    idx = voice.index * 2;
  }
  idx = ((idx % SCALE_HZ.length) + SCALE_HZ.length) % SCALE_HZ.length;
  return SCALE_HZ[idx] * voice.pitchMul;
}

// ---- grid builders --------------------------------------------------

function spiralGrid(config, minR, maxR) {
  const totalSweep = config.turns * Math.PI * 2;
  const hubR = maxR * 0.1;
  const hubSweep = Math.PI * 2;
  const k = Math.log(maxR / hubR) / (totalSweep - hubSweep);
  const radiusAt = (a) => a <= hubSweep ? hubR : hubR * Math.exp(k * (a - hubSweep));
  const bandAt = (a) => Math.min(radiusAt(a + Math.PI * 2), maxR) - radiusAt(a);

  // closed-form arc length: on a log spiral ds/da = r*sqrt(1+k^2) because the
  // tangent-to-radius angle is constant. the flat hub turn is ds/da = hubR.
  const C = hubR * Math.sqrt(1 + k * k) / k;
  const hubArc = hubR * hubSweep;
  const arcLengthAt = (a) => a <= hubSweep ? hubR * a : hubArc + C * (Math.exp(k * (a - hubSweep)) - 1);
  const totalArcLength = arcLengthAt(totalSweep);
  const angleAtArcLength = (s) => s <= hubArc ? s / hubR : hubSweep + Math.log(1 + (s - hubArc) / C) / k;

  // equal-ARC cells: each is the same travel and therefore the same duration
  const arcStep = totalArcLength / config.cellCount;
  return {
    totalSweep, radiusAt, bandAt, hubR, arcStep, totalArcLength,
    stepPosAtAngle: (a) => arcLengthAt(a) / arcStep,
    angleAtStepPos: (u) => angleAtArcLength(Math.max(0, Math.min(u * arcStep, totalArcLength)))
  };
}

function ringGrid(config, minR, maxR) {
  return {
    ringWidth: (maxR - minR) / config.ringsCount,
    angleStep: (Math.PI * 2) / config.splitsCount
  };
}

// ---- shape drawing --------------------------------------------------

function drawStar(p, r1, r2, npoints) {
  const step = (Math.PI * 2) / npoints;
  const half = step / 2;
  p.beginShape();
  for (let i = 0; i < npoints; i++) {
    const a = -Math.PI / 2 + i * step;
    p.vertex(Math.cos(a) * r2, Math.sin(a) * r2);
    p.vertex(Math.cos(a + half) * r1, Math.sin(a + half) * r1);
  }
  p.endShape(p.CLOSE);
}

function drawFlower(p, size) {
  for (let i = 0; i < 6; i++) {
    p.push();
    p.rotate((i * Math.PI * 2) / 6);
    p.ellipse(size * 0.55, 0, size * 0.95, size * 0.55);
    p.pop();
  }
  p.circle(0, 0, size * 0.5);
}

function drawShapeGlyph(p, type, size) {
  switch (type) {
    case 'star': drawStar(p, size * 0.48, size, 5); break;
    case 'triangle': p.triangle(0, -size, size * 0.87, size * 0.55, -size * 0.87, size * 0.55); break;
    case 'square': p.rectMode(p.CENTER); p.rect(0, 0, size * 1.5, size * 1.5); break;
    case 'flower': drawFlower(p, size); break;
    default: p.circle(0, 0, size * 1.5);
  }
}

// text on the circle rotates to align with the circumference (tangent),
// flipped upright on the left/upper half so it never reads upside-down
function drawRadialText(p, str, angle, radius, size) {
  p.push();
  p.translate(radius * Math.cos(angle), radius * Math.sin(angle));
  let rot = angle + Math.PI / 2;
  const n = ((angle % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
  if (n > Math.PI / 2 && n < 1.5 * Math.PI) rot += Math.PI;
  p.rotate(rot);
  p.noStroke();
  p.fill(255, 255, 255, 130);
  p.textFont('Menlo, Consolas, monospace');
  p.textSize(size);
  p.textAlign(p.CENTER, p.CENTER);
  p.text(str, 0, 0);
  p.pop();
}

// ---- sketch factory -------------------------------------------------

function createLooperSketch(containerId, opts) {
  const sketch = (p) => {
    let shapes = [];
    let nextId = 1;
    let loopPos = 0;   // STEP UNITS, always increasing, wraps at totalSteps()
    let prevPos = 0;
    let lastMillis = 0;
    let cx = SIZE / 2, cy = SIZE / 2;

    // tells the HTML shape-list panel (if registered) to re-render
    function notify() { if (opts.onShapesChanged) opts.onShapesChanged(); }

    /* The page is fullscreen: the canvas is the window and the circle is inscribed in it, so the
       shorter side is the diameter and the corners sit outside the dome. The grid is re-derived
       from opts.maxR every frame (currentGrid), so a resize writes three numbers and rebuilds
       nothing — no shape is stranded, which is the whole point of the symbolic positions. */
    function fit() {
      SIZE = Math.min(p.windowWidth, p.windowHeight);
      cx = p.windowWidth / 2; cy = p.windowHeight / 2;
      opts.maxR = SIZE / 2;
      p.resizeCanvas(p.windowWidth, p.windowHeight);
    }
    p.windowResized = fit;

    p.setup = () => {
      const cnv = p.createCanvas(1, 1);
      cnv.parent(containerId);
      fit();
      lastMillis = p.millis();
      cnv.mousePressed(() => handleClick(p.mouseX, p.mouseY));
      seedDefaultShapes();
      if (opts.mode === 'pinball') spawnBall();
      // expose actions the HTML control panel needs
      opts.api = {
        clearAll: () => { shapes = []; notify(); },
        dropBall: () => { if (opts.mode === 'pinball') spawnBall(); },
        // per-voice ("all stars", "all circles") rather than per-instance
        voiceStats: () => opts.voices.map((v, i) => {
          const group = shapes.filter(s => s.voiceIndex === i);
          return { count: group.length, allMuted: group.length > 0 && group.every(s => s.muted) };
        }),
        toggleVoiceMuted: (voiceIndex) => {
          const group = shapes.filter(s => s.voiceIndex === voiceIndex);
          if (group.length === 0) return;
          const target = !group.every(s => s.muted);   // if any are live, mute them all
          group.forEach(s => { s.muted = target; });
          notify();
        },
        deleteVoice: (voiceIndex) => {
          const keys = new Set(shapes.filter(s => s.voiceIndex === voiceIndex).map(s => s.sectionKey));
          shapes = shapes.filter(s => s.voiceIndex !== voiceIndex);
          keys.forEach(k => relayoutSection(k));   // close the gaps they left behind
          notify();
        }
      };
      notify(); // in case the list panel was already waiting on this
    };

    // pinball shares the ring grid: same sections, same placement, same
    // channel routing — only the playhead differs (a falling ball, not a
    // sweeping playhead)
    /* ---- PINBALL PHYSICS --------------------------------------------
       Balls start at the CENTER and fall OUTWARD toward the rim. Each
       ball's fall direction is locked in at the moment it spawns, aimed
       at wherever the mouse was right then — so the cursor chooses the
       direction of the next drop, but never steers a ball already in
       play. Gravity is therefore per-ball and constant, not radial.
       After launch it's pure physics: bounce off pegs (sounding their
       voice), and drain when it reaches the outer edge.
    ------------------------------------------------------------------ */
    const BALL_R = 6;
    const PEG_R = 9;
    const MAX_BALLS = 14;
    let balls = [];
    let dropTimer = 0;

    // direction the NEXT ball will fall: center -> current mouse position
    function aimDir() {
      const dx = p.mouseX - cx, dy = p.mouseY - cy;
      const d = Math.hypot(dx, dy);
      return d > 4 ? { x: dx / d, y: dy / d } : { x: 0, y: 1 };
    }

    // a little spread on each drop. without it, a stationary mouse sends
    // every ball down the exact same straight line — so if that one ray
    // happens to thread between the pegs, nothing ever sounds.
    const AIM_SPREAD = 0.25;   // radians, roughly +/-14 degrees

    function spawnBall() {
      if (balls.length >= MAX_BALLS) balls.shift();
      const aim = aimDir();
      const a = Math.atan2(aim.y, aim.x) + (Math.random() * 2 - 1) * AIM_SPREAD;
      const gx = Math.cos(a), gy = Math.sin(a);
      balls.push({
        x: 0, y: 0,
        vx: gx * 25, vy: gy * 25,   // small nudge so it starts moving out
        gx, gy,                      // this ball's fixed "down", set at spawn
        trail: []
      });
    }

    function updateBalls(dtSec, now) {
      // drop new balls at a steady interval
      dropTimer += dtSec * 1000;
      while (dropTimer >= opts.config.dropIntervalMs) {
        dropTimer -= opts.config.dropIntervalMs;
        spawnBall();
      }

      // clamp dt so a stalled tab doesn't teleport balls through pegs
      const step = Math.min(dtSec, 0.05) / 4;
      const g = opts.config.gravity;
      const e = opts.config.bounce;

      for (let bi = balls.length - 1; bi >= 0; bi--) {
        const b = balls[bi];
        let drained = false;

        for (let iter = 0; iter < 4 && !drained; iter++) {
          b.vx += b.gx * g * step;      // constant pull along this ball's aim
          b.vy += b.gy * g * step;
          b.x += b.vx * step;
          b.y += b.vy * step;

          // peg collisions: reflect about the contact normal, then sound it
          for (const s of shapes) {
            const dx = b.x - s.radius * Math.cos(s.angle);
            const dy = b.y - s.radius * Math.sin(s.angle);
            const d = Math.hypot(dx, dy);
            const minD = BALL_R + PEG_R;
            if (d < minD && d > 0.0001) {
              const nx = dx / d, ny = dy / d;
              b.x += nx * (minD - d);    // push out of overlap
              b.y += ny * (minD - d);
              const vn = b.vx * nx + b.vy * ny;
              if (vn < 0) {
                b.vx -= (1 + e) * vn * nx;
                b.vy -= (1 + e) * vn * ny;
                if (now - (s.lastHit || 0) > 60) {   // debounce re-contacts
                  s.lastHit = now;
                  if (!s.muted) fire(s, now);
                  else s.flashUntil = now + 220;     // muted pegs still bounce
                }
              }
            }
          }

          // reaching the outer edge drains the ball
          if (Math.hypot(b.x, b.y) > opts.maxR - BALL_R) {
            balls.splice(bi, 1);
            drained = true;
          }
        }

        if (!drained) {
          b.trail.push({ x: b.x, y: b.y });
          if (b.trail.length > 14) b.trail.shift();
        }
      }
    }

    function currentGrid() {
      return opts.mode === 'spiral'
        ? spiralGrid(opts.config, opts.minR, opts.maxR)
        : ringGrid(opts.config, opts.minR, opts.maxR);
    }

    // for pinball this isn't a playhead length — it's only used to normalise
    // a peg's radius into 0..1 for the voice's pitch mapping
    function totalSteps() {
      return opts.mode === 'spiral' ? opts.config.cellCount : opts.config.ringsCount;
    }

    /* ---- THE KEY FUNCTION -------------------------------------------
       A shape's angle/radius/trigger time are DERIVED from the current
       grid, never stored. Quantized shapes know only their sectionKey
       (+ slot within it); free shapes know only their normalized loop
       position. So when turns/cellCount/rings/splits change, shapes
       move WITH their sections instead of detaching from the curve.
       Symbolic keys are clamped so a shrinking count never orphans one.
    ------------------------------------------------------------------ */
    function resolveAll(grid) {
      const steps = totalSteps();
      const outward = opts.config.direction === 'outward';

      shapes.forEach(s => {
        let stepPos;
        if (opts.mode === 'spiral') {
          if (s.quantized) {
            const cell = Math.min(s.sectionKey, opts.config.cellCount - 1);
            stepPos = cell + (s.slot + 0.5) / s.slotCount;
          } else {
            stepPos = s.loopT * opts.config.cellCount;
          }
          const a = grid.angleAtStepPos(stepPos);
          s.angle = a;
          s.radius = grid.radiusAt(a) + grid.bandAt(a) * (s.quantized ? 0.5 : s.radialFrac);
        } else {
          if (s.quantized) {
            const parts = String(s.sectionKey).split(':').map(Number);
            const ring = Math.min(parts[0], opts.config.ringsCount - 1);
            const split = Math.min(parts[1], opts.config.splitsCount - 1);
            s.radius = opts.minR + (ring + (s.slot + 0.5) / s.slotCount) * grid.ringWidth;
            s.angle = (split + 0.5) * grid.angleStep;
          } else {
            s.radius = opts.minR + s.loopT * (opts.maxR - opts.minR);
            s.angle = s.freeAngle;
          }
          stepPos = ((s.radius - opts.minR) / (opts.maxR - opts.minR)) * steps;
        }
        s.stepPos = stepPos;
        // direction as a mapping, so the loop counter stays monotonic
        s.triggerAt = outward ? stepPos : steps - stepPos;
      });
    }

    function seedDefaultShapes() {
      if (opts.mode === 'spiral') {
        [[4, 0], [11, 1], [19, 2], [28, 4]].forEach(([cell, v]) => addQuantized(cell, v));
      } else if (opts.mode === 'pinball') {
        // pinball placement is always free-form, so seed free pegs.
        // staggered rings (each offset half a gap from the last) so the
        // ball can't fall straight through a lined-up corridor; one voice
        // per ring, so depth reads as pitch/timbre.
        [[0.30, 7, 0], [0.50, 9, 1], [0.70, 10, 2], [0.88, 8, 3]]
          .forEach(([t, n, v], ri) => {
            for (let i = 0; i < n; i++) {
              const turn = (i + (ri % 2 ? 0.5 : 0)) / n;
              addFree(t, v, turn * Math.PI * 2, 0.5);
            }
          });
      } else {
        [[1, 2, 1], [2, 5, 0], [3, 1, 3], [4, 6, 4]]
          .forEach(([ring, split, v]) => addQuantized(ring + ':' + split, v));
      }
    }

    function addQuantized(sectionKey, voiceIndex) {
      shapes.push({ id: nextId++, muted: false, quantized: true, sectionKey, voiceIndex,
                    slot: 0, slotCount: 1,
                    flashUntil: 0, angle: 0, radius: 0, stepPos: 0, triggerAt: 0 });
      relayoutSection(sectionKey);
      notify();
    }

    function addFree(loopT, voiceIndex, freeAngle, radialFrac) {
      shapes.push({ id: nextId++, muted: false, quantized: false, sectionKey: null, voiceIndex, loopT,
                    freeAngle, radialFrac, flashUntil: 0,
                    angle: 0, radius: 0, stepPos: 0, triggerAt: 0 });
      notify();
    }

    // assign slot/slotCount so a section's shapes stay evenly spread and
    // ordered; resolveAll turns those into actual positions
    function relayoutSection(sectionKey) {
      if (sectionKey == null) return;
      const group = shapes.filter(s => s.quantized && s.sectionKey === sectionKey);
      group.forEach((s, j) => { s.slot = j; s.slotCount = group.length; });
    }

    function sectionCount() {
      return opts.mode === 'spiral'
        ? Math.max(1, Math.round(opts.config.cellCount / opts.config.turns))
        : opts.config.splitsCount;
    }

    function channelIndexForAngle(angle) {
      const n = sectionCount();
      const a = ((angle % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
      return Math.min(n - 1, Math.floor((a / (Math.PI * 2)) * n));
    }

    function fire(shape, now) {
      const voice = opts.voices[shape.voiceIndex];
      const n = sectionCount();
      const pan = n <= 1 ? 0 : (channelIndexForAngle(shape.angle) / (n - 1)) * 2 - 1;
      playVoice(voice, frequencyFor(voice, shape.stepPos / totalSteps()), pan);
      shape.flashUntil = now + 220;
    }

    p.draw = () => {
      p.background(0);
      const grid = currentGrid();
      const steps = totalSteps();
      resolveAll(grid);

      const now = p.millis();
      const dt = now - lastMillis;
      lastMillis = now;

      if (opts.playState.playing) {
        if (opts.mode === 'pinball') {
          // no playhead sweep — falling balls trigger pegs by collision
          updateBalls(dt / 1000, now);
        } else {
          loopPos = (loopPos + dt / opts.config.stepDurationMs) % steps;
          if (loopPos >= prevPos) {
            shapes.forEach(s => { if (!s.muted && s.triggerAt > prevPos && s.triggerAt <= loopPos) fire(s, now); });
          } else {
            shapes.forEach(s => { if (!s.muted && (s.triggerAt > prevPos || s.triggerAt <= loopPos)) fire(s, now); });
          }
          prevPos = loopPos;
        }
      }

      // direction applied as a mapping on the readout, not the counter
      const readPos = opts.config.direction === 'outward' ? loopPos : steps - loopPos;

      p.push();
      p.translate(cx, cy);

      p.noFill(); p.stroke(255, 255, 255, 50);
      p.circle(0, 0, opts.maxR * 2);

      if (opts.mode === 'spiral') {
        drawSpiralGuide(p, grid);
        drawSpiralActiveCell(p, grid, Math.min(steps - 1, Math.max(0, Math.floor(readPos))));
      } else {
        drawRingGuide(p, grid, opts.config);
      }

      if (opts.config.showChannelNumbers) {
        const n = sectionCount(), st = (Math.PI * 2) / n;
        for (let i = 0; i < n; i++) drawRadialText(p, String(i + 1), (i + 0.5) * st, opts.maxR - 16, 9);
      }

      shapes.forEach(s => {
        const voice = opts.voices[s.voiceIndex];
        const remaining = s.flashUntil - now;
        const t = remaining > 0 ? remaining / 220 : 0;   // grow, then ease back
        p.push();
        p.translate(s.radius * Math.cos(s.angle), s.radius * Math.sin(s.angle));
        p.noStroke();
        if (s.muted) {
          p.fill(voice.color[0], voice.color[1], voice.color[2], 60); // dimmed = muted
        } else {
          p.fill(voice.color[0], voice.color[1], voice.color[2]);
        }
        drawShapeGlyph(p, voice.type, 7 * (1 + 0.85 * t));
        p.pop();
      });

      if (opts.mode === 'rings') {
        const r = opts.minR + (readPos / steps) * (opts.maxR - opts.minR);
        p.noFill(); p.stroke(255); p.strokeWeight(2);
        p.circle(0, 0, r * 2);
      }

      if (opts.mode === 'pinball') {
        // center drop point + the direction the next ball will fall
        const aim = aimDir();
        const aa = Math.atan2(aim.y, aim.x);
        p.stroke(255, 255, 255, 55); p.strokeWeight(1);
        p.line(0, 0, aim.x * 38, aim.y * 38);
        p.stroke(255, 255, 255, 25);   // the spread each drop can vary within
        p.line(0, 0, Math.cos(aa - AIM_SPREAD) * 32, Math.sin(aa - AIM_SPREAD) * 32);
        p.line(0, 0, Math.cos(aa + AIM_SPREAD) * 32, Math.sin(aa + AIM_SPREAD) * 32);
        p.noFill(); p.stroke(255, 255, 255, 90); p.strokeWeight(1);
        p.circle(0, 0, 11);

        balls.forEach(b => {
          for (let i = 0; i < b.trail.length; i++) {
            p.noStroke(); p.fill(255, 255, 255, (i / b.trail.length) * 80);
            p.circle(b.trail[i].x, b.trail[i].y, 3);
          }
          p.noStroke(); p.fill(255);
          p.circle(b.x, b.y, BALL_R * 2);
        });
      }

      p.pop();
    };

    function spiralRibbon(p, aStart, aEnd, grid) {
      const samples = Math.max(6, Math.ceil((aEnd - aStart) * 24));
      p.beginShape();
      for (let i = 0; i <= samples; i++) {
        const a = aStart + ((aEnd - aStart) * i) / samples;
        const r = grid.radiusAt(a) + grid.bandAt(a);
        p.vertex(r * Math.cos(a), r * Math.sin(a));
      }
      for (let i = samples; i >= 0; i--) {
        const a = aStart + ((aEnd - aStart) * i) / samples;
        const r = grid.radiusAt(a);
        p.vertex(r * Math.cos(a), r * Math.sin(a));
      }
      p.endShape(p.CLOSE);
    }

    function drawSpiralGuide(p, grid) {
      p.fill(255, 255, 255, 16);
      p.stroke(255, 255, 255, 60);
      p.strokeWeight(1);
      p.circle(0, 0, grid.hubR * 2);
      spiralRibbon(p, 0, grid.totalSweep, grid);

      p.stroke(255, 255, 255, 30);
      p.strokeWeight(1);
      for (let i = 0; i <= opts.config.cellCount; i++) {
        const a = grid.angleAtStepPos(i);
        const rI = grid.radiusAt(a), rO = rI + grid.bandAt(a);
        p.line(rI * Math.cos(a), rI * Math.sin(a), rO * Math.cos(a), rO * Math.sin(a));
      }
    }

    // spiral playhead: one whole cell lit at a time
    function drawSpiralActiveCell(p, grid, cellIdx) {
      p.fill(255, 255, 255, 150);
      p.stroke(255);
      p.strokeWeight(1);
      spiralRibbon(p, grid.angleAtStepPos(cellIdx), grid.angleAtStepPos(cellIdx + 1), grid);
    }

    function drawRingGuide(p, grid, config) {
      p.noFill(); p.stroke(255, 255, 255, 30); p.strokeWeight(1);
      for (let r = 0; r <= config.ringsCount; r++) {
        p.circle(0, 0, (opts.minR + r * grid.ringWidth) * 2);
      }
      for (let s = 0; s < config.splitsCount; s++) {
        const a = s * grid.angleStep;
        p.line(opts.minR * Math.cos(a), opts.minR * Math.sin(a),
               opts.maxR * Math.cos(a), opts.maxR * Math.sin(a));
      }
    }

    function handleClick(mx, my) {
      ensureAudioContext();
      const grid = currentGrid();
      resolveAll(grid);

      const dx = mx - cx, dy = my - cy;
      const r = Math.sqrt(dx * dx + dy * dy);
      let ang = Math.atan2(dy, dx);
      if (ang < 0) ang += Math.PI * 2;

      // click an existing shape to mute/unmute it (quick, reversible from the
      // board itself). deleting is deliberate and lives in the shape list
      // panel below, where it's unambiguous which shape you're removing.
      for (let i = shapes.length - 1; i >= 0; i--) {
        const s = shapes[i];
        const sx = s.radius * Math.cos(s.angle), sy = s.radius * Math.sin(s.angle);
        if (Math.hypot(sx - dx, sy - dy) < 14) {
          s.muted = !s.muted;
          notify();
          return;
        }
      }

      const v = opts.config.activeVoiceIndex;

      if (opts.mode === 'spiral') {
        // unwrap the clicked angle across turns to find which coil was hit
        let best = null;
        for (let k = 0; k < opts.config.turns + 1; k++) {
          const a = ang + k * Math.PI * 2;
          if (a > grid.totalSweep) continue;
          const rI = grid.radiusAt(a), rO = rI + grid.bandAt(a);
          if (r >= rI - 8 && r <= rO + 8) {
            const d = Math.abs(r - (rI + rO) / 2);
            if (!best || d < best.d) best = { angle: a, d, rI, rO };
          }
        }
        if (!best) return;
        if (opts.config.quantize) {
          const cell = Math.min(opts.config.cellCount - 1,
                                Math.max(0, Math.floor(grid.stepPosAtAngle(best.angle))));
          addQuantized(cell, v);
        } else {
          const band = best.rO - best.rI;
          addFree(grid.stepPosAtAngle(best.angle) / opts.config.cellCount, v, 0,
                  band > 0 ? p.constrain((r - best.rI) / band, 0, 1) : 0.5);
        }
      } else {
        if (r < opts.minR - 10 || r > opts.maxR + 10) return;
        if (opts.config.quantize) {
          const ring = p.constrain(Math.floor((r - opts.minR) / grid.ringWidth), 0, opts.config.ringsCount - 1);
          const split = Math.floor(ang / grid.angleStep);
          addQuantized(ring + ':' + split, v);
        } else {
          const rr = p.constrain(r, opts.minR, opts.maxR);
          addFree((rr - opts.minR) / (opts.maxR - opts.minR), v, ang, 0.5);
        }
      }
    }
  };
  return new p5(sketch, containerId);
}

// ---- control panel ---------------------------------------------------

function buildStatusRow(container, name, playState, opts) {
  const row = document.createElement('div');
  row.className = 'statusRow';

  const toggle = document.createElement('div');
  toggle.className = 'toggle';
  const dot = document.createElement('span');
  dot.className = 'dot' + (playState.playing ? ' on' : '');
  const nm = document.createElement('span');
  nm.className = 'name'; nm.textContent = name;
  const st = document.createElement('span');
  st.className = 'state'; st.textContent = playState.playing ? '[ACTIVE]' : '[OFF]';
  toggle.appendChild(dot); toggle.appendChild(nm); toggle.appendChild(st);
  toggle.addEventListener('click', () => {
    playState.playing = !playState.playing;
    dot.className = 'dot' + (playState.playing ? ' on' : '');
    st.textContent = playState.playing ? '[ACTIVE]' : '[OFF]';
  });

  const clear = document.createElement('button');
  clear.type = 'button';
  clear.className = 'clearBtn';
  clear.textContent = 'Clear all';
  clear.addEventListener('click', () => { if (opts.api) opts.api.clearAll(); });

  const hide = document.createElement('button');
  hide.type = 'button';
  hide.className = 'clearBtn hideBtn';
  hide.textContent = 'Hide';
  hide.addEventListener('click', () => togglePanel());

  row.appendChild(toggle); row.appendChild(clear); row.appendChild(hide);
  container.appendChild(row);
}

function buildCollapsible(container, title, open) {
  const d = document.createElement('details');
  d.className = 'settingsGroup';
  if (open) d.open = true;
  const s = document.createElement('summary');
  s.textContent = title;
  d.appendChild(s);
  const body = document.createElement('div');
  body.className = 'settingsBody';
  d.appendChild(body);
  container.appendChild(d);
  return body;
}

function buildSliders(container, target, fields) {
  const wrap = document.createElement('div');
  wrap.className = 'sliders';
  fields.forEach(f => {
    const row = document.createElement('div');
    row.className = 'ctrl' + (f.type === 'checkbox' ? ' checkrow' : '');
    const label = document.createElement('label');
    label.textContent = f.label;
    if (f.type === 'checkbox') {
      const input = document.createElement('input');
      input.type = 'checkbox';
      input.checked = target[f.key];
      input.addEventListener('input', () => { target[f.key] = input.checked; });
      row.appendChild(input); row.appendChild(label);
    } else if (f.type === 'select') {
      const sel = document.createElement('select');
      f.options.forEach(o => {
        const el = document.createElement('option');
        el.value = o; el.textContent = o;
        if (o === target[f.key]) el.selected = true;
        sel.appendChild(el);
      });
      sel.addEventListener('input', () => { target[f.key] = sel.value; });
      row.appendChild(label); row.appendChild(sel);
    } else {
      const input = document.createElement('input');
      input.type = 'range';
      input.min = f.min; input.max = f.max; input.step = f.step || 1;
      input.value = target[f.key];
      const val = document.createElement('span');
      val.className = 'val';
      val.textContent = target[f.key] + (f.unit || '');
      input.addEventListener('input', () => {
        target[f.key] = Number(input.value);
        val.textContent = input.value + (f.unit || '');
      });
      row.appendChild(label); row.appendChild(input); row.appendChild(val);
    }
    wrap.appendChild(row);
  });
  container.appendChild(wrap);
}

// ONE control for shape+sound: the glyph button IS the voice selector, and
// its Edit panel holds that same voice's synth parameters
function buildVoiceSettings(container, config, voices, opts) {
  const hint = document.createElement('div');
  hint.className = 'voiceHint';
  hint.textContent = 'Each shape is a sound. Pick one, then click the sketch to place it. Clicking a placed shape removes it.';
  container.appendChild(hint);

  const glyphs = [];
  const rowRefreshers = [];
  voices.forEach((voice, i) => {
    const block = document.createElement('div');
    block.className = 'voiceBlock';

    const row = document.createElement('div');
    row.className = 'voiceRow';

    const g = document.createElement('span');
    g.className = 'voiceGlyph' + (i === config.activeVoiceIndex ? ' selected' : '');
    g.style.color = `rgb(${voice.color[0]},${voice.color[1]},${voice.color[2]})`;
    g.textContent = GLYPHS[voice.type];
    g.addEventListener('click', () => {
      config.activeVoiceIndex = i;
      glyphs.forEach((el, j) => el.classList.toggle('selected', j === i));
    });
    glyphs.push(g);

    const nm = document.createElement('span');
    nm.className = 'vname'; nm.textContent = voice.name;

    // pitch direction: up / straight / down
    const pitchSel = document.createElement('select');
    pitchSel.className = 'pitchSel';
    ['up', 'straight', 'down'].forEach(m => {
      const el = document.createElement('option');
      el.value = m; el.textContent = m;
      if (m === voice.pitchMode) el.selected = true;
      pitchSel.appendChild(el);
    });
    pitchSel.title = 'pitch across the loop: up / straight / down';
    pitchSel.addEventListener('input', () => { voice.pitchMode = pitchSel.value; });

    const editBtn = document.createElement('button');
    editBtn.type = 'button'; editBtn.className = 'editBtn'; editBtn.textContent = 'Edit';

    row.appendChild(g); row.appendChild(nm); row.appendChild(pitchSel); row.appendChild(editBtn);
    block.appendChild(row);

    // per-voice controls: how many of THIS shape are on the board, plus
    // mute-all / delete-all scoped to just this shape type
    const placedRow = document.createElement('div');
    placedRow.className = 'placedRow';
    const countEl = document.createElement('span');
    countEl.className = 'placedCount';
    const muteAllBtn = document.createElement('button');
    muteAllBtn.type = 'button'; muteAllBtn.className = 'miniBtn';
    const delAllBtn = document.createElement('button');
    delAllBtn.type = 'button'; delAllBtn.className = 'miniBtn delBtn';
    delAllBtn.textContent = 'Delete all';
    muteAllBtn.addEventListener('click', () => { if (opts.api) opts.api.toggleVoiceMuted(i); });
    delAllBtn.addEventListener('click', () => { if (opts.api) opts.api.deleteVoice(i); });
    placedRow.appendChild(countEl); placedRow.appendChild(muteAllBtn); placedRow.appendChild(delAllBtn);
    block.appendChild(placedRow);

    rowRefreshers.push((stat) => {
      countEl.textContent = stat.count === 0
        ? 'none placed'
        : stat.count + ' placed' + (stat.allMuted ? ' \u00B7 muted' : '');
      muteAllBtn.textContent = stat.allMuted ? 'Unmute all' : 'Mute all';
      const empty = stat.count === 0;
      muteAllBtn.disabled = empty;
      delAllBtn.disabled = empty;
      placedRow.classList.toggle('empty', empty);
    });

    const panel = document.createElement('div');
    panel.className = 'editPanel';
    panel.style.display = 'none';
    block.appendChild(panel);
    editBtn.addEventListener('click', () => {
      const open = panel.style.display === 'none';
      panel.style.display = open ? 'flex' : 'none';
      editBtn.classList.toggle('open', open);
    });

    buildSliders(panel, voice, [
      { key: 'wave', label: 'Waveform', type: 'select', options: ['sine', 'triangle', 'square', 'sawtooth'] },
      { key: 'pitchMul', label: 'Pitch', min: 0.25, max: 4, step: 0.05 },
      { key: 'harmonic', label: 'Harmonic', min: 0, max: 6, step: 0.5 },
      { key: 'harmonicLevel', label: 'Harm level', min: 0, max: 0.8, step: 0.05 },
      { key: 'filterHz', label: 'Filter', min: 300, max: 9000, step: 100, unit: 'hz' },
      { key: 'attack', label: 'Attack', min: 0, max: 200, step: 1, unit: 'ms' },
      { key: 'release', label: 'Release', min: 20, max: 1500, step: 10, unit: 'ms' },
      { key: 'gain', label: 'Volume', min: 0.05, max: 0.6, step: 0.01 }
    ]);

    const audition = document.createElement('button');
    audition.type = 'button';
    audition.className = 'auditionBtn';
    audition.textContent = 'Preview sound';
    audition.addEventListener('click', () => {
      ensureAudioContext();
      playVoice(voice, frequencyFor(voice, 0.35), 0);
    });
    panel.appendChild(audition);

    container.appendChild(block);
  });

  // the p5 sketch calls this whenever shapes are added/removed/muted, from
  // the canvas OR from these buttons, so the counts always stay in sync
  function refresh() {
    const stats = opts.api ? opts.api.voiceStats()
                           : voices.map(() => ({ count: 0, allMuted: false }));
    rowRefreshers.forEach((fn, i) => fn(stats[i]));
  }
  opts.onShapesChanged = refresh;
  refresh();
}

// ---- the control panel, one call per looper --------------------------

function buildControlsFor(id, name, opts, mode) {
  const c = document.getElementById(id);
  const config = opts.config;
  buildStatusRow(c, name, opts.playState, opts);

  const playback = buildCollapsible(c, 'Playback', true);
  if (mode === 'pinball') {
    const gHint = document.createElement('div');
    gHint.className = 'voiceHint';
    gHint.textContent = 'Balls fall from the center outward, aimed at your cursor as each one drops.';
    playback.appendChild(gHint);
    buildSliders(playback, config, [
      { key: 'dropIntervalMs', label: 'Drop every', min: 200, max: 4000, step: 50, unit: 'ms' },
      { key: 'gravity', label: 'Gravity', min: 100, max: 1600, step: 20 },
      { key: 'bounce', label: 'Bounce', min: 0.2, max: 0.95, step: 0.01 },
      { key: 'ringsCount', label: 'Rings', min: 2, max: 10, step: 1 },
      { key: 'splitsCount', label: 'Splits', min: 3, max: 24, step: 1 }
    ]);
    const drop = document.createElement('button');
    drop.type = 'button';
    drop.className = 'auditionBtn';
    drop.textContent = 'Drop one now';
    drop.addEventListener('click', () => { ensureAudioContext(); if (opts.api) opts.api.dropBall(); });
    playback.appendChild(drop);
  } else buildSliders(playback, config, mode === 'spiral' ? [
    { key: 'stepDurationMs', label: 'Step duration', min: 50, max: 1000, step: 10, unit: 'ms' },
    { key: 'cellCount', label: 'Cell count', min: 10, max: 80, step: 1 },
    { key: 'turns', label: 'Turns', min: 2, max: 8, step: 1 },
    { key: 'direction', label: 'Direction', type: 'select', options: ['outward', 'inward'] },
    { key: 'quantize', label: 'Quantize', type: 'checkbox' }
  ] : [
    { key: 'stepDurationMs', label: 'Step duration', min: 50, max: 1500, step: 10, unit: 'ms' },
    { key: 'ringsCount', label: 'Rings', min: 2, max: 10, step: 1 },
    { key: 'splitsCount', label: 'Splits', min: 3, max: 24, step: 1 },
    { key: 'direction', label: 'Direction', type: 'select', options: ['outward', 'inward'] },
    { key: 'quantize', label: 'Quantize', type: 'checkbox' }
  ]);

  const display = buildCollapsible(c, 'Display', false);
  buildSliders(display, config, [
    { key: 'showChannelNumbers', label: 'Channel numbers', type: 'checkbox' }
  ]);

  const voicesBody = buildCollapsible(c, 'Shapes & Sounds', true);
  buildVoiceSettings(voicesBody, config, opts.voices, opts);
}

// ---- the panel: a corner of the page, and it hides --------------------------------
// H, or the button in the panel's own status row, hides it; the small corner button
// brings it back. Hidden is a class on <body>, so nothing has to know the panel's size.

function togglePanel() { document.body.classList.toggle('panel-off'); }

document.addEventListener('keydown', (e) => {
  if (e.key !== 'h' && e.key !== 'H') return;
  const typing = /^(INPUT|SELECT|TEXTAREA)$/.test((document.activeElement || {}).tagName || '');
  if (typing) return;                       // a select uses the letter keys to jump its options
  togglePanel();
});

(function cornerButton() {
  const b = document.createElement('button');
  b.type = 'button';
  b.className = 'controlsToggle';
  b.textContent = 'Controls';
  b.title = 'h';
  b.addEventListener('click', togglePanel);
  document.body.appendChild(b);
})();

