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
// The graph is WANT channels wide (opts.audioChannels) and a voice goes to the channel its
// section sits on. Whether those channels reach a device is the device's business:
// `destination.maxChannelCount` is what the output can take — 2 for a stereo device, 8 for an
// 8-out interface, and whatever the host hands the page (a Chromium Embedded Framework embedder
// with no device at all, like TouchDesigner's Web Render TOP, reports its own number here).
// When the device takes the whole bus, the merger feeds the destination directly and the stereo
// pan is dropped. When it does not, the audible path stays the pan and the merged bus is kept as
// a zero-gain branch, so the panel still measures all eight channels carrying signal.

let audioCtx = null;
let bus = null;                 // the channel bus, built on the first gesture
let pageOpts = null;            // the page's own opts — one looper per page
const firedCounts = [];         // notes sent per channel, since load

function busWidth() { return Math.min(32, Math.max(2, (pageOpts && pageOpts.audioChannels) | 0 || 2)); }

function buildBus(ctx) {
  const want = busWidth();
  const deviceMax = (pageOpts && pageOpts.audioDeviceChannels) || ctx.destination.maxChannelCount || 0;
  const merger = ctx.createChannelMerger(want);
  const splitter = ctx.createChannelSplitter(want);
  merger.connect(splitter);
  const analysers = [];
  for (let i = 0; i < want; i++) {
    const a = ctx.createAnalyser();
    a.fftSize = 256;
    splitter.connect(a, i);
    analysers.push(a);
  }

  let routed = 'stereo', output = ctx.destination.channelCount || 2;
  if (deviceMax >= want) {
    try {
      ctx.destination.channelCount = want;
      ctx.destination.channelCountMode = 'explicit';
      ctx.destination.channelInterpretation = 'discrete';
      merger.connect(ctx.destination);
      routed = 'discrete';
      output = ctx.destination.channelCount;
    } catch (e) {
      routed = 'stereo';   // a driver that claims more channels than it will open
    }
  }
  if (routed !== 'discrete') {
    const mute = ctx.createGain();
    mute.gain.value = 0;                 // keeps the measured branch pulled, silent
    merger.connect(mute).connect(ctx.destination);
  }
  return { want, deviceMax, output, merger, analysers, routed };
}

function ensureAudioContext() {
  if (!audioCtx) {
    const AC = window.AudioContext || window.webkitAudioContext;
    audioCtx = new AC();
    if (pageOpts && pageOpts.audioChannels) bus = buildBus(audioCtx);
  }
  if (audioCtx.state !== 'running') audioCtx.resume();
  return audioCtx;
}

// ONE voice: two oscillators (fundamental + optional harmonic partial) -> lowpass that closes as
// the note decays -> attack/release envelope -> the given channel of the target. The live sound
// and the offline bounce are this same function, so a bounced loop is what you heard.
function synthesize(ctx, target, channels, voice, freq, t0, channelIndex) {
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

  filter.connect(gain);
  if (target && channelIndex != null && channels > 0) {
    gain.connect(target, 0, Math.max(0, Math.min(channels - 1, channelIndex | 0)));
  }
  return gain;
}

function playVoice(voice, freq, pan, channelIndex) {
  try {
    const ctx = ensureAudioContext();
    if (ctx.state !== 'running') return;   // don't stack notes on a suspended context
    const gain = synthesize(ctx, bus ? bus.merger : null, bus ? bus.want : 0,
                            voice, freq, ctx.currentTime, channelIndex);
    if (bus && channelIndex != null) {
      const ch = Math.max(0, Math.min(bus.want - 1, channelIndex | 0));
      firedCounts[ch] = (firedCounts[ch] || 0) + 1;
    }
    // the section the shape sits on picks the channel; the pan is the fallback
    // for an output that cannot take the whole bus
    if (!bus || bus.routed !== 'discrete') {
      const panner = ctx.createStereoPanner();
      panner.pan.value = pan || 0;
      panner.connect(ctx.destination);
      gain.connect(panner);
    }
  } catch (e) {
    console.warn('audio error', e);
  }
}

// 16-bit interleaved PCM for one rendered block, and the wav file that wraps however many
// blocks a long take needs — a TouchDesigner Audio File In CHOP reads the result, and so
// does any editor. Untyped on purpose: a typed body would make a POST preflight.
function pcmPart(buffer, offset) {
  const n = buffer.numberOfChannels, start = offset || 0, frames = buffer.length - start;
  const ab = new ArrayBuffer(frames * n * 2);
  const dv = new DataView(ab);
  const chans = [];
  for (let c = 0; c < n; c++) chans.push(buffer.getChannelData(c));
  let o = 0;
  for (let i = 0; i < frames; i++) {
    for (let c = 0; c < n; c++) {
      const v = Math.max(-1, Math.min(1, chans[c][start + i]));
      dv.setInt16(o, v < 0 ? v * 0x8000 : v * 0x7FFF, true);
      o += 2;
    }
  }
  return ab;
}

function wavFile(parts, channels, rate, frames) {
  const head = new ArrayBuffer(44);
  const dv = new DataView(head);
  const str = (o, s) => { for (let i = 0; i < s.length; i++) dv.setUint8(o + i, s.charCodeAt(i)); };
  str(0, 'RIFF'); dv.setUint32(4, 36 + frames * channels * 2, true); str(8, 'WAVE');
  str(12, 'fmt '); dv.setUint32(16, 16, true); dv.setUint16(20, 1, true); dv.setUint16(22, channels, true);
  dv.setUint32(24, rate, true); dv.setUint32(28, rate * channels * 2, true);
  dv.setUint16(32, channels * 2, true); dv.setUint16(34, 16, true);
  str(36, 'data'); dv.setUint32(40, frames * channels * 2, true);
  return new Blob([head].concat(parts));
}

function wavBlob(buffer) {
  return wavFile([pcmPart(buffer)], buffer.numberOfChannels, buffer.sampleRate, buffer.length);
}

// ---- a timed WebM, for a browser that cannot encode H.264 -------------------------
// Written by hand for the same reason the mp4 is: a live-muxed webm declares no duration
// and no frame rate, so a reader reports length 0. Same trick as the mp4 — Info.Duration
// and Tracks.DefaultDuration — so the file can be timed, then remuxed to mp4 by ffmpeg.

// a real Duration and DefaultDuration. Nothing is captured, so nothing can be dropped.

function ebmlId(id) {
  const out = [];
  let v = id;
  while (v > 0) { out.unshift(v & 0xFF); v = Math.floor(v / 256); }
  return new Uint8Array(out);
}

function ebmlSize(n) {
  for (let len = 1; len <= 8; len++) {
    const max = Math.pow(2, 7 * len) - 1;
    if (n < max || len === 8) {
      const out = new Uint8Array(len);
      let v = n;
      for (let i = len - 1; i >= 0; i--) { out[i] = v & 0xFF; v = Math.floor(v / 256); }
      out[0] |= 1 << (8 - len);
      return out;
    }
  }
}

function ebmlConcat(chunks) {
  let len = 0;
  chunks.forEach(c => { len += c.length; });
  const out = new Uint8Array(len);
  let at = 0;
  chunks.forEach(c => { out.set(c, at); at += c.length; });
  return out;
}

function ebmlUint(n) {
  const out = [];
  let v = Math.max(0, Math.floor(n));
  do { out.unshift(v & 0xFF); v = Math.floor(v / 256); } while (v > 0);
  return new Uint8Array(out);
}

function ebmlFloat(n) {
  const buf = new ArrayBuffer(8);
  new DataView(buf).setFloat64(0, n, false);
  return new Uint8Array(buf);
}

function ebmlStr(s) {
  return new TextEncoder().encode(s);
}

function elem(id, payload) {
  const size = ebmlSize(payload.length);
  const head = ebmlId(id);
  const out = new Uint8Array(head.length + size.length + payload.length);
  out.set(head, 0); out.set(size, head.length); out.set(payload, head.length + size.length);
  return out;
}

// VP9 frames, integer millisecond timecodes, no B-frames (the encoder is configured
// realtime), so presentation order is decode order and a SimpleBlock per frame is enough
class WebmMaster {
  constructor(width, height, fps, codecId) {
    this.width = width;
    this.height = height;
    this.fps = fps;
    this.codecId = codecId || 'V_VP9';
    this.clusters = [];
    this.cur = null;
    this.frames = 0;
  }

  add(chunk) {
    const ms = Math.round(chunk.timestamp / 1000);
    const data = new Uint8Array(chunk.byteLength);
    chunk.copyTo(data);
    const key = chunk.type === 'key';
    if (!this.cur || (key && ms - this.cur.tc >= 2000) || ms - this.cur.tc > 30000) {
      this.cur = { tc: ms, blocks: [] };
      this.clusters.push(this.cur);
    }
    const rel = ms - this.cur.tc;
    const head = new Uint8Array(4);
    head[0] = 0x81;                                  // track 1
    head[1] = (rel >> 8) & 0xFF; head[2] = rel & 0xFF;
    head[3] = key ? 0x80 : 0x00;
    this.cur.blocks.push(elem(0xA3, ebmlConcat([head, data])));
    this.frames++;
  }

  file() {
    const ebmlHeaderEl = elem(0x1A45DFA3, ebmlConcat([
      elem(0x4286, ebmlUint(1)), elem(0x42F7, ebmlUint(1)),
      elem(0x42F2, ebmlUint(4)), elem(0x42F3, ebmlUint(8)),
      elem(0x4282, ebmlStr('webm')), elem(0x4287, ebmlUint(2)), elem(0x4285, ebmlUint(2))
    ]));
    const infoEl = elem(0x1549A966, ebmlConcat([
      elem(0x2AD7B1, ebmlUint(1000000)),              // one millisecond per tick
      elem(0x4D80, ebmlStr('domebase')), elem(0x5741, ebmlStr('domebase')),
      elem(0x4489, ebmlFloat((this.frames * 1000) / this.fps))   // Duration — what TD reads
    ]));
    const tracksEl = elem(0x1654AE6B, elem(0xAE, ebmlConcat([
      elem(0xD7, ebmlUint(1)), elem(0x73C5, ebmlUint(1)), elem(0x83, ebmlUint(1)),
      elem(0x9C, ebmlUint(0)), elem(0x86, ebmlStr(this.codecId)),
      elem(0x23E383, ebmlUint(Math.round(1e9 / this.fps))),       // DefaultDuration: the frame rate
      elem(0xE0, ebmlConcat([elem(0xB0, ebmlUint(this.width)), elem(0xBA, ebmlUint(this.height))]))
    ])));
    const clusterEls = this.clusters.map(c =>
      elem(0x1F43B675, ebmlConcat([elem(0xE7, ebmlUint(c.tc))].concat(c.blocks))));
    // cue points carry absolute cluster offsets, so they are written after the sizes are known
    let off = infoEl.length + tracksEl.length;
    const cuePoints = this.clusters.map((c, i) => {
      const point = elem(0xBB, ebmlConcat([
        elem(0xB3, ebmlUint(c.tc)),
        elem(0xB7, ebmlConcat([elem(0xF7, ebmlUint(1)), elem(0xF1, ebmlUint(off))]))
      ]));
      off += clusterEls[i].length;
      return point;
    });
    const data = ebmlConcat([infoEl, tracksEl].concat(clusterEls, [elem(0x1C53BB6B, ebmlConcat(cuePoints))]));
    const segment = ebmlConcat([ebmlId(0x18538067), ebmlSize(data.length), data]);
    return new Blob([ebmlHeaderEl, segment], { type: 'video/webm' });
  }
}

// ---- ISO BMFF (.mp4): the container TouchDesigner, QuickTime and every editor read --
//
// WebM is not on the Movie File In TOP's read list (it is only on the *Movie File Out*
// container list), so a webm master loads with a length of 0 no matter how correct its
// header is. MP4 is on the list, so the master is written as MP4: H.264 video and an AAC
// stereo mix of the bus, with the sample tables built by hand. Every frame of a master is
// exactly 1/fps long, so each track's time-to-sample table is a single run — and because
// moov is written before mdat, the length is known the moment the file opens.

function mp4cat(list) {
  let n = 0;
  for (const a of list) n += a.length;
  const out = new Uint8Array(n);
  let o = 0;
  for (const a of list) { out.set(a, o); o += a.length; }
  return out;
}
const u8v = v => new Uint8Array([v & 0xFF]);
const u16v = v => new Uint8Array([(v >> 8) & 0xFF, v & 0xFF]);
const u32v = v => new Uint8Array([(v >>> 24) & 0xFF, (v >>> 16) & 0xFF, (v >>> 8) & 0xFF, v & 0xFF]);
const fcc = s => { const a = new Uint8Array(4); for (let i = 0; i < 4; i++) a[i] = s.charCodeAt(i); return a; };
const zeros = n => new Uint8Array(n);
function mp4box(type, ...parts) { const b = mp4cat(parts); return mp4cat([u32v(b.length + 8), fcc(type), b]); }
function fullbox(type, version, flags, ...parts) {
  return mp4box(type, u8v(version), new Uint8Array([(flags >> 16) & 0xFF, (flags >> 8) & 0xFF, flags & 0xFF]), ...parts);
}
// MPEG-4 descriptor: the length is 7-bit groups, continuation bit on all but the last byte
function desc(tag, payload) {
  const len = [];
  let v = payload.length, groups = [];
  do { groups.unshift(v & 0x7F); v >>= 7; } while (v > 0);
  for (let i = 0; i < groups.length - 1; i++) len.push(groups[i] | 0x80);
  len.push(groups[groups.length - 1]);
  return mp4cat([u8v(tag), new Uint8Array(len), payload]);
}
// every entry is (count, value) — a run-length table of one entry per track here
function tableBox(type, entries, signed) {
  return fullbox(type, signed ? 1 : 0, 0, u32v(entries.length),
    mp4cat(entries.map(e => mp4cat([u32v(e[0]), u32v(e[1])]))));
}
const UNITY = mp4cat([u32v(0x00010000), u32v(0), u32v(0), u32v(0), u32v(0x00010000), u32v(0),
                      u32v(0), u32v(0), u32v(0x40000000)]);

class Mp4Master {
  constructor(width, height, fps) {
    this.width = width;
    this.height = height;
    this.fps = fps;
    this.video = [];          // in decode order, as the encoder emitted them
    this.audio = [];
    this.avcC = null;         // the H.264 configuration, from the first chunk's metadata
    this.asc = null;          // the AAC AudioSpecificConfig, likewise
    this.rate = 48000;
    this.channels = 2;
    this.bitrate = 192000;
  }

  add(chunk, metadata) {
    const data = new Uint8Array(chunk.byteLength);
    chunk.copyTo(data);
    if (!this.avcC && metadata && metadata.decoderConfig && metadata.decoderConfig.description) {
      this.avcC = new Uint8Array(metadata.decoderConfig.description);
    }
    this.video.push({ data, ts: chunk.timestamp, key: chunk.type === 'key' });
  }

  addAudio(chunk, metadata) {
    const data = new Uint8Array(chunk.byteLength);
    chunk.copyTo(data);
    if (!this.asc && metadata && metadata.decoderConfig && metadata.decoderConfig.description) {
      this.asc = new Uint8Array(metadata.decoderConfig.description);
    }
    this.audio.push({ data, ts: chunk.timestamp });
  }

  // audio sample lengths: AAC-LC is always 1024 frames, which is what the encoder emits
  startBox() {
    return fullbox('stsd', 0, 0, u32v(1),
      mp4box('avc1', zeros(6), u16v(1), u16v(0), u16v(0), zeros(12),
             u16v(this.width), u16v(this.height), u32v(0x00480000), u32v(0x00480000),
             u32v(0), u16v(1), zeros(32), u16v(0x0018), u16v(0xFFFF),
             mp4box('avcC', this.avcC || zeros(0))));
  }

  audioStartBox() {
    const asc = this.asc || new Uint8Array([0x11, 0x90]);      // AAC-LC, 48 kHz, stereo
    const sl = desc(0x06, u8v(0x02));
    const dcd = desc(0x04, mp4cat([u8v(0x40), u8v(0x15), zeros(3),
                                   u32v(this.bitrate), u32v(this.bitrate), desc(0x05, asc)]));
    const es = desc(0x03, mp4cat([u16v(1), u8v(0), dcd, sl]));
    return fullbox('stsd', 0, 0, u32v(1),
      mp4box('mp4a', zeros(6), u16v(1), u16v(0), u16v(0), u32v(0),
             u16v(this.channels), u16v(16), u16v(0), u16v(0), u32v(this.rate * 65536),
             fullbox('esds', 0, 0, es)));
  }

  dinf() { return mp4box('dinf', fullbox('dref', 0, 0, u32v(1), fullbox('url ', 0, 1))); }

  trak(opts, vOff, vChunkOff, aChunkOff) {
    const m = mp4cat([u32v(0), u32v(0), u32v(opts.trackId), u32v(0), u32v(opts.movieDur),
                      zeros(8), u16v(0), u16v(0), u16v(opts.isAudio ? 0x0100 : 0),
                      UNITY, u32v(opts.isAudio ? 0 : this.width * 65536),
                      u32v(opts.isAudio ? 0 : this.height * 65536)]);
    const tkhd = fullbox('tkhd', 0, 3, m);
    const mdhd = fullbox('mdhd', 0, 0, u32v(0), u32v(0), u32v(opts.timescale), u32v(opts.mediaDur),
                         u16v(0x55C4), u16v(0));
    const hdlr = fullbox('hdlr', 0, 0, u32v(0), fcc(opts.isAudio ? 'soun' : 'vide'), zeros(12),
                         mp4cat([mp4cat(Array.from(opts.handler).map(c => u8v(c.charCodeAt(0)))), u8v(0)]));
    const dinf = this.dinf();
    let stbl;
    if (opts.isAudio) {
      stbl = mp4box('stbl', this.audioStartBox(), tableBox('stts', [[this.audio.length, 1024]]),
                    fullbox('stsc', 0, 0, u32v(1), mp4cat([u32v(1), u32v(this.audio.length), u32v(1)])),
                    fullbox('stsz', 0, 0, u32v(0), u32v(this.audio.length),
                            mp4cat(this.audio.map(s => u32v(s.data.length)))),
                    fullbox('stco', 0, 0, u32v(1), u32v(aChunkOff)));
    } else {
      const nf = this.video.length;
      const sizes = mp4cat(this.video.map(s => u32v(s.data.length)));
      const sync = [];
      this.video.forEach((s, i) => { if (s.key) sync.push(u32v(i + 1)); });
      const boxes = [
        mp4box('stbl', this.startBox(), tableBox('stts', [[nf, vOff.delta]]),
               ...(vOff.anyNonZero ? [tableBox('ctts', vOff.entries, vOff.anyNeg)] : []),
               ...(sync.length ? [fullbox('stss', 0, 0, u32v(sync.length), mp4cat(sync))] : []),
               fullbox('stsc', 0, 0, u32v(1), mp4cat([u32v(1), u32v(nf), u32v(1)])),
               fullbox('stsz', 0, 0, u32v(0), u32v(nf), sizes),
               fullbox('stco', 0, 0, u32v(1), u32v(vChunkOff)))
      ];
      stbl = mp4cat(boxes);
    }
    const minf = mp4box('minf', opts.isAudio
      ? fullbox('smhd', 0, 0, u16v(0), u16v(0))
      : fullbox('vmhd', 0, 1, u16v(0), zeros(6)),
      dinf, stbl);
    // aac encodes whole 1024-sample frames, so the audio media usually runs a few
    // milliseconds past the picture; an edit list is how a movie declares it plays only the
    // seconds the video occupies (this is what ffmpeg writes too)
    const edts = opts.editDur
      ? mp4box('edts', fullbox('elst', 0, 0, u32v(1),
          mp4cat([u32v(opts.editDur), u32v(0), u16v(1), u16v(0)])))
      : zeros(0);
    const mdia = mp4box('mdia', mdhd, hdlr, minf);
    return mp4box('trak', tkhd, edts, mdia);
  }

  file(totalAudioFrames, seconds) {
    const fps = this.fps, nf = this.video.length;
    const vt = fps * 100;                              // video timescale: 100 ticks a frame
    const delta = Math.max(1, Math.round(vt / fps));
    const movieDur = Math.round((seconds || nf / fps) * 1000);
    // a composition offset per sample: zero unless the encoder emitted out-of-order frames
    let offsets = this.video.map((s, i) => Math.round((s.ts * vt) / 1e6) - i * delta);
    const anyNonZero = offsets.some(o => o !== 0);
    const anyNeg = offsets.some(o => o < 0);
    // collapse to runs
    const runs = [];
    for (const o of offsets) {
      const last = runs[runs.length - 1];
      if (last && last[1] === o) last[0]++;
      else runs.push([1, o]);
    }
    const vOff = { delta, anyNonZero, anyNeg, entries: runs };
    const at = this.rate;
    const audioDur = this.audio.reduce((n, s, i) => n + 1024, 0);

    const build = (vChunkOff, aChunkOff) => {
      const mvhd = fullbox('mvhd', 0, 0, u32v(0), u32v(0), u32v(1000), u32v(movieDur),
                           u32v(0x00010000), u16v(0x0100), u16v(0), zeros(8), UNITY, zeros(24), u32v(3));
      const v = this.trak({ trackId: 1, movieDur, timescale: vt, mediaDur: nf * delta,
                            isAudio: false, handler: 'VideoHandler' }, vOff, vChunkOff, 0);
      // a browser with no AAC encoder gets a video-only movie rather than none at all
      const a = this.audio.length
        ? this.trak({ trackId: 2, movieDur, timescale: at, mediaDur: audioDur,
                      isAudio: true, handler: 'SoundHandler', editDur: movieDur }, null, 0, aChunkOff)
        : zeros(0);
      return mp4box('moov', mvhd, v, a);
    };
    const ftyp = mp4box('ftyp', fcc('isom'), u32v(512), fcc('isom'), fcc('iso2'), fcc('avc1'), fcc('mp41'));
    let moov = build(0, 0);
    const base = ftyp.length + moov.length + 8;         // mdat's own header is 8 bytes
    const videoBytes = this.video.reduce((n, s) => n + s.data.length, 0);
    moov = build(base, base + videoBytes);
    const mdat = mp4box('mdat',
      mp4cat(this.video.map(s => s.data)),
      mp4cat(this.audio.map(s => s.data)));
    return new Blob([ftyp, moov, mdat], { type: 'video/mp4' });
  }
}

// the newest blob is handed straight to the downloader, so nothing is written to disk
function saveBlob(blob, name) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 30000);
}

const AUDIO_CONFIG = { codec: 'mp4a.40.2', sampleRate: 48000, numberOfChannels: 2, bitrate: 192000 };

// The master is an MP4 carrying H.264, because MP4 is on a Movie File In TOP's read list and
// WebM is not. VP9 in WebM stays as the fallback for a browser with no H.264 encoder.
// `only` forces the fallback (used when the mp4 path turns out to have no AAC encoder).
function pickVideoConfig(w, h, fps, only) {
  if (typeof VideoEncoder === 'undefined') return null;
  const mp4Rate = Math.round(Math.min(20e6, Math.max(4e6, w * h * fps * 0.06)));
  const webmRate = Math.round(Math.min(40e6, Math.max(4e6, w * h * fps * 0.12)));
  const avc = { avc: { format: 'avc' } };      // AVCC: the length-prefixed framing mp4 wants
  const cands = [
    { codec: 'avc1.640028', container: 'mp4', bitrate: mp4Rate, extra: avc },
    { codec: 'avc1.4d0028', container: 'mp4', bitrate: mp4Rate, extra: avc },
    { codec: 'avc1.42E028', container: 'mp4', bitrate: mp4Rate, extra: avc },
    { codec: 'avc1.42001f', container: 'mp4', bitrate: mp4Rate, extra: avc },
    { codec: 'vp09.00.31.08', container: 'webm', bitrate: webmRate, mux: 'V_VP9' },
    { codec: 'vp09.00.30.08', container: 'webm', bitrate: webmRate, mux: 'V_VP9' },
    { codec: 'vp09.00.10.08', container: 'webm', bitrate: webmRate, mux: 'V_VP9' },
    { codec: 'vp8', container: 'webm', bitrate: webmRate, mux: 'V_VP8' }
  ].filter(c => !only || c.container === only);
  const tryAt = i => {
    if (i >= cands.length) return Promise.resolve(null);
    const c = cands[i];
    const cfg = Object.assign({ codec: c.codec, width: w, height: h, bitrate: c.bitrate,
                                framerate: fps, latencyMode: 'realtime' }, c.extra || {});
    return VideoEncoder.isConfigSupported(cfg)
      .then(res => (res && res.supported)
        ? Object.assign({}, res.config, { container: c.container, muxCodec: c.mux })
        : tryAt(i + 1))
      .catch(() => tryAt(i + 1));
  };
  return tryAt(0);
}

function stampNow() { return new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19); }

// a take longer than this is rendered in slices, so only 16-bit pcm is held in memory
const RENDER_SLICE_SEC = 30;

// render a list of timed notes into 16-bit interleaved pcm for a bus `channels` wide, in
// slices, so a long take never needs one enormous float buffer in memory: only the 16-bit
// pcm is held, slice by slice. Each slice starts its context *before* the seam by the
// longest note's tail and those pre-roll samples are trimmed off, so a note crossing a
// seam keeps its real envelope instead of being retriggered at the boundary.
function renderEventsPcm(events, seconds, sampleRate, channels, sliceSec) {
  const sr = sampleRate || 48000;
  const n = channels || busWidth();
  const slice = Math.max(1, sliceSec || RENDER_SLICE_SEC);
  // longest attack+release among the voices in play, plus a margin — the panel edits these
  const tail = (pageOpts.voices || []).reduce(
    (m, v) => Math.max(m, ((v.attack || 0) + (v.release || 0)) / 1000), 0);
  const preroll = Math.min(5, Math.max(2, tail + 0.2));
  const totalFrames = Math.max(1, Math.ceil(seconds * sr));
  const parts = [];
  const work = [];
  for (let start = 0; start < totalFrames; start += slice * sr) {
    const frames = Math.min(slice * sr, totalFrames - start);
    const t0 = start / sr;
    const pre = start === 0 ? 0 : preroll;
    const preFrames = Math.round(pre * sr);
    const off = new OfflineAudioContext(n, frames + preFrames, sr);
    const merger = off.createChannelMerger(n);
    merger.connect(off.destination);
    events.forEach(ev => {
      if (ev.t < t0 - pre || ev.t >= t0 + frames / sr) return;   // nothing else can reach here
      synthesize(off, merger, n, ev.voice, ev.freq, ev.t - t0 + pre, ev.channel);
    });
    work.push(off.startRendering().then(buf => parts.push({ start, part: pcmPart(buf, preFrames) })));
  }
  return Promise.all(work).then(() => ({
    parts: parts.sort((a, b) => a.start - b.start).map(p => p.part),
    channels: n, rate: sr, totalFrames
  }));
}


// The bus is a ring of channels, so folding it to stereo puts each one where it actually
// sits: a channel on the left of the dome lands in the left ear, the front and back are
// shared. Equal power per channel, then normalised by peak, so a busy loop cannot clip —
// the wav keeps the bus levels untouched, this fold is only what the movie plays.
function ringToStereo(pcm) {
  const n = pcm.channels, frames = pcm.totalFrames;
  const gl = [], gr = [];
  for (let c = 0; c < n; c++) {
    const th = ((c + 0.5) * 2 * Math.PI) / n;
    const a = ((1 + Math.sin(th)) * Math.PI) / 4;      // 0 = hard left, π/2 = hard right
    gl.push(Math.cos(a)); gr.push(Math.sin(a));
  }
  const L = new Float32Array(frames), R = new Float32Array(frames);
  let off = 0, peak = 0;
  for (const part of pcm.parts) {
    const s = new Int16Array(part);
    for (let i = 0; i + n <= s.length; i += n) {
      let l = 0, r = 0;
      for (let c = 0; c < n; c++) {
        const v = s[i + c] / 32768;
        l += v * gl[c]; r += v * gr[c];
      }
      if (off < frames) { L[off] = l; R[off] = r; }
      if (Math.abs(l) > peak) peak = Math.abs(l);
      if (Math.abs(r) > peak) peak = Math.abs(r);
      off++;
    }
  }
  const k = peak > 0.98 ? 0.98 / peak : 1;
  const pad = (1024 - (frames % 1024)) % 1024;   // aac encodes whole 1024-sample frames
  const total = frames + pad;
  const out = new Int16Array(total * 2);
  for (let i = 0; i < frames; i++) {
    const l = Math.max(-1, Math.min(1, L[i] * k)), r = Math.max(-1, Math.min(1, R[i] * k));
    out[i * 2] = l < 0 ? l * 0x8000 : l * 0x7FFF;
    out[i * 2 + 1] = r < 0 ? r * 0x8000 : r * 0x7FFF;
  }
  return { data: out, frames: total, peak: peak, gain: k };
}


// ---- a take: the drawing as it happened, every note as it fired, one clock -----
//
// A take is the performance, not a re-render, so the picture is captured live: the canvas is
// cropped to the square the circle is inscribed in and encoded with H.264 as it goes. Every
// note is logged as it sounds, so a shape you place or mute mid-take is in the audio too, and
// the notes are then rendered offline from that log — the bus to an 8-channel wav, a stereo
// fold of it into the movie. Both files therefore cover the same seconds by construction.
//
// The mp4 is written here by hand rather than by MediaRecorder because a live-muxed webm (or
// fragmented mp4) carries no duration, and a reader reports a length of 0. This one declares
// its length and its frame rate, and the frames are stamped on the grid it declares, so a
// display that only manages 30 fps gets each frame twice instead of a file whose rate is
// whatever the compositor felt like.

let take = null;
let takePending = false;
let takeRefusal = '';

// Which encoders this browser actually has. A take is refused only after every path is gone,
// and the refusal names the missing link — the diagnosis is worth more than the error.
// Which browser this is, in one word — the encoder question is nearly always a browser question.
function browserName() {
  const u = navigator.userAgent;
  const m = u.match(/(Edg|OPR|Chrome|Firefox|Version)\/([\d.]+)/);
  const name = /Edg\//.test(u) ? 'Edge' : /OPR\//.test(u) ? 'Opera' : /Firefox\//.test(u) ? 'Firefox'
             : /Chrome\//.test(u) ? 'Chrome' : /Safari\//.test(u) ? 'Safari' : 'unknown browser';
  return name + (m ? ' ' + m[2].split('.')[0] : '');
}

// What a take will produce here, decided from one probe so the panel, the console and the
// refusal all say the same thing.
function takePlan(p) {
  if (!p) return 'nothing';
  const yes = (arr, k) => arr.some(x => x.indexOf(k) === 0 && /=yes$/.test(x));
  if (p.videoEncoder === 'function' && yes(p.video, 'avc1')) {
    return (p.audioEncoder === 'function' && yes(p.audio, 'mp4a')) ? 'mp4' : 'mp4-silent';
  }
  if (p.videoEncoder === 'function' && (yes(p.video, 'vp09') || yes(p.video, 'vp8'))) return 'webm';
  if (p.mediaRecorder === 'function') return 'capture';
  return 'nothing';
}

function takePlanWords(m) {
  return ({
    mp4: 'an mp4 with the stereo mix inside + the 8-channel wav',
    'mp4-silent': 'a silent mp4 + the 8-channel and stereo wavs (no aac encoder here)',
    webm: 'a timed webm + the 8-channel and stereo wavs (no h264 here)',
    capture: 'a live webm + the 8-channel and stereo wavs (no WebCodecs here)',
    nothing: 'nothing — no video encoder in this browser'
  })[m] || m;
}

async function probeEncoders(w, h, fps) {
  const out = {
    browser: browserName(),
    secureContext: (typeof isSecureContext === 'boolean') ? isSecureContext : null,
    videoEncoder: typeof VideoEncoder, audioEncoder: typeof AudioEncoder,
    mediaRecorder: typeof MediaRecorder,
    video: [], audio: [], record: []
  };
  if (typeof VideoEncoder === 'function') {
    for (const c of ['avc1.640028', 'avc1.42E028', 'vp09.00.31.08', 'vp09.00.10.08', 'vp8']) {
      try {
        const r = await VideoEncoder.isConfigSupported({ codec: c, width: w, height: h,
                                                        bitrate: 8e6, framerate: fps });
        out.video.push(c + '=' + (r && r.supported ? 'yes' : 'no'));
      } catch (e) { out.video.push(c + '=throws'); }
    }
  }
  if (typeof AudioEncoder === 'function') {
    for (const c of ['mp4a.40.2', 'opus']) {
      try {
        const r = await AudioEncoder.isConfigSupported({ codec: c, sampleRate: 48000,
                                                        numberOfChannels: 2, bitrate: 192000 });
        out.audio.push(c + '=' + (r && r.supported ? 'yes' : 'no'));
      } catch (e) { out.audio.push(c + '=throws'); }
    }
  }
  if (typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported) {
    for (const t of ['video/mp4;codecs="avc1.42E01E,mp4a.40.2"', 'video/webm;codecs=vp9,opus', 'video/webm']) {
      out.record.push(t + '=' + (MediaRecorder.isTypeSupported(t) ? 'yes' : 'no'));
    }
  }
  return out;
}

async function startTake(fps) {
  if (take || takePending) return take;
  const cnv = pageOpts && pageOpts.api && pageOpts.api.canvas ? pageOpts.api.canvas() : null;
  if (!cnv || !cnv.width) { takeRefusal = 'no canvas'; return null; }
  const rate = Math.max(1, Math.min(120, Math.round(fps || 60)));
  const side = Math.min(cnv.width, cnv.height) & ~1;   // even: yuv420 wants pairs of pixels
  if (side < 32) { takeRefusal = 'canvas smaller than 32px'; return null; }

  takePending = true;
  let conf = null, aac = false;
  try {
    conf = await pickVideoConfig(side, side, rate);     // h264 first, then vp9/vp8
    if (conf && conf.container === 'mp4' && typeof AudioEncoder === 'function') {
      const s = await AudioEncoder.isConfigSupported(AUDIO_CONFIG);
      aac = !!(s && s.supported);
    }
  } catch (e) { conf = null; }
  takePending = false;

  // three ways out, in order of how much they give you: mp4 with the mix, mp4 silent, webm.
  // A browser with no WebCodecs at all (some embedded chromium builds) can still record webm.
  let mode = conf ? (conf.container === 'mp4' ? (aac ? 'mp4' : 'mp4-silent') : 'webm') : null;
  if (!mode) {
    const mr = typeof MediaRecorder !== 'undefined';
    if (mr) mode = 'capture';
    else {
      takeRefusal = 'no WebCodecs and no MediaRecorder — needs https or localhost, and a browser '
        + 'with a video encoder';
      return null;
    }
  }
  takeRefusal = '';

  const t = {
    state: 'encoding', mode, rate, side, cnv, events: [], startMs: performance.now(),
    slot: 0, frames: 0, err: null, aac: aac,
    container: (mode === 'mp4' || mode === 'mp4-silent') ? 'mp4' : 'webm',
    ox: Math.floor((cnv.width - side) / 2), oy: Math.floor((cnv.height - side) / 2)
  };
  take = t;

  if (mode === 'capture') {
    // Last resort: MediaRecorder writes a live webm. It declares no duration and only carries
    // the frames the compositor managed, so ffmpeg is what turns it into a timed mp4.
    // It records our own square canvas rather than the page's, so the take is the same dome
    // crop as every other path, and no guide audio is attached: an audio track whose context is
    // suspended makes chromium buffer the whole recording and emit nothing at all.
    const sqc = document.createElement('canvas');
    sqc.width = side; sqc.height = side;
    t.sq = sqc;
    t.scx = sqc.getContext('2d', { alpha: false });
    const stream = sqc.captureStream(rate);
    const types = ['video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm'];
    const mime = types.find(x => MediaRecorder.isTypeSupported && MediaRecorder.isTypeSupported(x));
    t.rec = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
    t.chunks = [];
    t.rec.ondataavailable = e => { if (e.data && e.data.size) t.chunks.push(e.data); };
    t.rec.onerror = e => { t.err = (e && e.error) || new Error('the recorder failed'); };
    t.rec.start(1000);
    t.loop = () => {                          // keeps our square canvas painting for the recorder
      if (take !== t || t.state !== 'encoding') return;
      t.scx.drawImage(t.cnv, t.ox, t.oy, side, side, 0, 0, side, side);
      t.frames++;
      requestAnimationFrame(t.loop);
    };
    requestAnimationFrame(t.loop);
    return t;
  }

  const sq = document.createElement('canvas');
  sq.width = side; sq.height = side;
  t.sq = sq;
  t.scx = sq.getContext('2d', { alpha: false });
  t.mux = (t.container === 'mp4') ? new Mp4Master(side, side, rate)
                                  : new WebmMaster(side, side, rate, conf.muxCodec);
  t.enc = new VideoEncoder({ output: (c, md) => t.mux.add(c, md), error: e => { t.err = e; } });
  t.enc.configure(conf);

  // one frame per slot of the declared grid, with the canvas state that was on screen then
  t.grab = () => {
    t.scx.drawImage(t.cnv, t.ox, t.oy, t.side, t.side, 0, 0, t.side, t.side);
    const frame = new VideoFrame(t.sq, {
      timestamp: Math.round((t.slot * 1e6) / t.rate),
      duration: Math.round(1e6 / t.rate)
    });
    t.enc.encode(frame, { keyFrame: t.slot % (t.rate * 2) === 0 });
    frame.close();
    t.slot++; t.frames++;
  };
  t.loop = () => {
    if (take !== t || t.state !== 'encoding') return;
    if (t.err) { t.state = 'error'; return; }
    const wanted = Math.floor((performance.now() - t.startMs) / (1000 / t.rate));
    let guard = 0;
    while (t.slot < wanted && guard++ < 240) t.grab();   // catch up, never skip time
    requestAnimationFrame(t.loop);
  };
  requestAnimationFrame(t.loop);
  return t;
}

async function stopTake(sampleRate) {
  const t = take;
  if (!t) throw new Error('no take running');
  t.state = 'stopping';
  const sr = sampleRate || 48000;
  const nch = busWidth();
  let video = null, seconds = 0;

  if (t.mode === 'capture') {
    seconds = (performance.now() - t.startMs) / 1000;
    t.frames = Math.max(1, Math.round(seconds * t.rate));   // a nominal count: the file has none
    video = await new Promise(resolve => {
      t.rec.onstop = () => resolve(new Blob(t.chunks, { type: 'video/webm' }));
      try { if (t.rec.requestData) t.rec.requestData(); } catch (e) {}   // flush before stopping
      t.rec.stop();
    });
    if (t.err) { take = null; throw t.err; }
    if (!video.size) {                       // an empty file is worse than a refusal
      take = null;
      throw new Error('the recorder captured nothing — was the sketch drawing?');
    }
  } else {
    if (!t.frames) t.grab();                 // a file needs at least one frame
    seconds = t.frames / t.rate;             // the file's own length: whole frames on the grid
    try { await t.enc.flush(); } finally { try { t.enc.close(); } catch (e) {} }
    if (t.err) { take = null; throw t.err; }
  }

  const events = t.events.slice();
  const pcm = await renderEventsPcm(events, seconds, sr, nch);
  const wav = wavFile(pcm.parts, pcm.channels, pcm.rate, pcm.totalFrames);
  const st = ringToStereo(pcm);
  // when the movie carries no sound of its own, hand the stereo mix over as a file: one ffmpeg
  // command puts it back inside the picture (scripts/take-to-td.bat does exactly that)
  const stereo = t.mode === 'mp4'
    ? null : wavFile([st.data.buffer], 2, sr, pcm.totalFrames);

  if (t.mode === 'mp4') {
    t.mux.rate = sr;
    const audio = Object.assign({}, AUDIO_CONFIG, { sampleRate: sr });
    let aErr = null;
    const aenc = new AudioEncoder({ output: (c, md) => t.mux.addAudio(c, md),
                                    error: e => { aErr = e; } });
    aenc.configure(audio);
    const FR = 1024;                         // aac encodes whole 1024-sample frames
    for (let i = 0; i < st.frames; i += FR) {
      const n = Math.min(FR, st.frames - i);
      const ad = new AudioData({
        format: 's16', sampleRate: sr, numberOfChannels: 2, numberOfFrames: n,
        timestamp: Math.round((i / sr) * 1e6), data: st.data.subarray(i * 2, (i + n) * 2)
      });
      aenc.encode(ad);
      ad.close();
      if (aenc.encodeQueueSize > 8) await new Promise(r => setTimeout(r, 0));
      if (aErr) { take = null; throw aErr; }
    }
    await aenc.flush();
    try { aenc.close(); } catch (e) {}
    video = t.mux.file(st.frames, seconds);
  } else if (t.mode === 'mp4-silent') {
    video = t.mux.file(0, seconds);
  } else if (t.mode === 'webm') {
    video = t.mux.file();
  }

  take = null;
  return { video, wav, stereo, seconds, notes: events.length, frames: t.frames, rate: t.rate,
           side: t.side, mode: t.mode, container: t.container, mixPeak: st.peak };
}

// what the page thinks its output is, plus the measured energy on every channel
function channelEnergy() {
  if (!bus) return [];
  return bus.analysers.map(a => {
    const d = new Float32Array(a.fftSize);
    a.getFloatTimeDomainData(d);
    let s = 0;
    for (let i = 0; i < d.length; i++) s += Math.abs(d[i]);
    return s;
  });
}

function audioReport() {
  const levels = channelEnergy();
  return {
    state: audioCtx ? audioCtx.state : 'none',
    graph: bus ? bus.want : 0,             // channels the graph carries
    output: bus ? bus.output : null,        // channels the destination took
    deviceMax: bus ? bus.deviceMax : null,  // channels the output offered
    routed: bus ? bus.routed : 'stereo',
    live: levels.filter(v => v > 0.0005).length,
    levels,
    fired: firedCounts.slice()
  };
}

// one tone per channel, in order — what to watch on the other side of a tap
function testChannels() {
  ensureAudioContext();
  if (!bus) return;
  firedCounts.length = 0;
  let tries = 0;
  const start = () => {
    // resume() settles a frame later; a tone fired into a suspended context is dropped
    if (audioCtx.state !== 'running' && tries++ < 40) { setTimeout(start, 100); return; }
    for (let i = 0; i < bus.want; i++) {
      setTimeout(() => {
        const v = Object.assign({}, pageOpts.voices[i % pageOpts.voices.length],
                                { gain: 0.22, attack: 4, release: 300, harmonicLevel: 0 });
        playVoice(v, SCALE_HZ[i % SCALE_HZ.length], 0, i);
      }, i * 500);
    }
  };
  start();
}

// any gesture starts the graph: a click, a key, and a mouse move — an embedded
// browser may never forward a click to the page
(function primeOnGesture() {
  const evs = ['pointerdown', 'keydown', 'mousemove'];
  const prime = () => { ensureAudioContext(); evs.forEach(e => window.removeEventListener(e, prime)); };
  evs.forEach(e => window.addEventListener(e, prime, { passive: true }));
})();

// `?test=8` runs the channel test every 8 seconds (default 10) — for an embedder that
// forwards no input to the page at all, where there is nothing to click
(function testOnLoad() {
  const m = /[?&]test(?:=(\d+))?/.exec(location.search || '');
  if (!m) return;
  const every = Math.max(2, parseInt(m[1] || '10', 10)) * 1000;
  const again = () => {
    if (!pageOpts || !pageOpts.audioChannels) return;
    if (!audioCtx || audioCtx.state !== 'running') { setTimeout(again, 500); return; }
    testChannels();
    setTimeout(again, every);
  };
  setTimeout(again, 500);
})();

// `?title=1` mirrors the same report into document.title, where an Info DAT on the
// Web Render TOP reads it as text — the page's number next to the tap's number
(function titleReport() {
  if (!/[?&]title/.test(location.search || '')) return;
  const base = document.title;
  setInterval(() => {
    const r = audioReport();
    document.title = base + ' -- ' + (r.graph
      ? 'graph ' + r.graph + ' out ' + r.output + ' device ' + r.deviceMax + ' '
        + r.routed + ' ' + r.state + ' live ' + r.live + '/' + r.graph
      : 'not started');
  }, 500);
})();

// A take downloads two files. When the movie cannot hold sound of its own — no aac encoder in
// this browser — a stereo wav comes with it, because one ffmpeg command puts it back inside the
// picture (scripts/take-to-td.bat), and that is also what makes a webm take readable in
// TouchDesigner, whose Movie File In TOP does not read webm at all.

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
  pageOpts = opts;   // the audio section reads the page's own opts (one looper per page)
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
        },
        // what the page asked its output for, and what every channel is carrying
        audioReport: audioReport,
        testChannels: testChannels,
        // a take: the canvas and the bus together, from one clock
        canvas: () => p.canvas,
        startTake: (fps) => startTake(fps),
        stopTake: (sampleRate) => stopTake(sampleRate),
        taking: () => !!take,
        // which encoders this browser has — the take degrades on its own, but the report says how
        probe: (fps) => {
          const c = p.canvas;
          const s = Math.min(c.width, c.height) & ~1;
          return probeEncoders(s, s, fps || 60);
        },
        takeRefusal: () => takeRefusal,
        // one word for the browser, and the verdict on what a take would produce here
        plan: (fps) => {
          const c = p.canvas;
          const s = Math.min(c.width, c.height) & ~1;
          return probeEncoders(s, s, fps || 60).then(rep => {
            const verdict = takePlan(rep);
            return { plan: verdict, words: takePlanWords(verdict), report: rep };
          });
        },
        // render any list of timed notes to a bus-wide wav — the take log, or your own
        renderTake: (events, seconds, sampleRate, sliceSec) =>
          renderEventsPcm(events, seconds, sampleRate || 48000, 0, sliceSec)
            .then(r => wavFile(r.parts, r.channels, r.rate, r.totalFrames))
      };
      window.looperApi = opts.api;   // the handle an embedder or a test drives
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
      const s = channelIndexForAngle(shape.angle);
      const pan = n <= 1 ? 0 : (s / (n - 1)) * 2 - 1;
      // with as many splits as channels the section IS the channel; otherwise
      // the sections fold onto the bus in order
      const w = busWidth();
      const ch = Math.min(w - 1, Math.floor((s / n) * w));
      const freq = frequencyFor(voice, shape.stepPos / totalSteps());
      // a take logs the note as it sounds, on one clock, so the audio of the take is what
      // the canvas was showing — including shapes added or muted while it ran
      if (take && take.state === 'encoding') {
        take.events.push({ t: (performance.now() - take.startMs) / 1000, channel: ch, voice, freq });
      }
      playVoice(voice, freq, pan, ch);
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

  const display = buildCollapsible(c, 'Display', true);
  buildSliders(display, config, [
    { key: 'showChannelNumbers', label: 'Channel numbers', type: 'checkbox' }
  ]);

  const voicesBody = buildCollapsible(c, 'Shapes & Sounds', true);
  buildVoiceSettings(voicesBody, config, opts.voices, opts);

  if (opts.audioChannels) {
    const audio = buildCollapsible(c, 'Audio routing', true);
    buildAudioRouting(audio, opts);
  }
}

// The bus, one row per channel: a level bar on the measured energy in that channel and the
// number of notes sent to it. The line above it is what the page asked the output for —
// `out` is what the destination took, `device` what it offered.
function buildAudioRouting(container, opts) {
  const line = document.createElement('div');
  line.className = 'routeLine';
  const wrap = document.createElement('div');
  wrap.className = 'meters';
  const rows = [];
  const width = Math.min(32, Math.max(2, opts.audioChannels | 0));
  for (let i = 0; i < width; i++) {
    const r = document.createElement('div');
    r.className = 'meterRow';
    const lab = document.createElement('span');
    lab.className = 'meterLabel'; lab.textContent = String(i + 1);
    const bar = document.createElement('span');
    bar.className = 'meterBar';
    const fill = document.createElement('i');
    bar.appendChild(fill);
    const num = document.createElement('span');
    num.className = 'meterVal'; num.textContent = '0';
    r.appendChild(lab); r.appendChild(bar); r.appendChild(num);
    wrap.appendChild(r);
    rows.push({ fill, num });
  }
  // one status line for all of the group's buttons: what the last one did, held a while
  let stickyUntil = 0;
  const say = (text, ms) => { line.textContent = text; stickyUntil = performance.now() + (ms || 6000); };

  const test = document.createElement('button');
  test.type = 'button';
  test.className = 'auditionBtn';
  test.textContent = 'Test 1→' + width;
  test.addEventListener('click', () => { if (opts.api) opts.api.testChannels(); });

  // the take: the drawing as video and the bus as 8-channel wav, one clock, both files
  const rec = document.createElement('button');
  rec.type = 'button';
  rec.className = 'auditionBtn';
  rec.textContent = 'Record take';

  // the encoder question is really a browser question, so answer it in one click
  const chk = document.createElement('button');
  chk.type = 'button';
  chk.className = 'auditionBtn';
  chk.textContent = 'Encoder check';
  chk.addEventListener('click', () => {
    if (!opts.api || !opts.api.probe) return;
    chk.disabled = true;
    opts.api.probe(60).then(r => {
      const plan = takePlan(r);
      say('encoder check · ' + r.browser + ' · ' + (r.secureContext ? 'secure' : 'not secure')
          + ' · take writes ' + takePlanWords(plan)
          + (plan === 'nothing' ? ' · h264 ' + (r.video[0] || 'n/a') : ''), 12000);
      chk.disabled = false;
    }).catch(e => { say('check failed: ' + e.message); chk.disabled = false; });
  });
  let recTimer = 0, startedAt = 0, rendering = false;

  const idle = () => {
    clearInterval(recTimer); recTimer = 0;
    rendering = false;
    rec.disabled = false;
    rec.classList.remove('recOn');
    rec.textContent = 'Record take';
  };
  const startRec = () => {
    if (rendering || !opts.api || !opts.api.startTake || opts.api.taking()) return;
    rec.disabled = true;                      // the ask is asynchronous: the encoders first
    opts.api.startTake(60).then(t => {
      rec.disabled = false;
      if (!t) {
        say('cannot record here · ' + (opts.api.takeRefusal() || 'no encoder'), 9000);
        return;
      }
      startedAt = performance.now();
      rec.classList.add('recOn');
      rec.textContent = 'Stop · 0.0s';
      say(t.mode === 'capture'
          ? 'recording · this browser has no video encoder, so the file gets timed later'
          : 'recording the drawing and the bus…', 3600000);
      recTimer = setInterval(() => {
        if (!opts.api.taking()) { idle(); say('take stopped'); return; }   // stopped elsewhere
        rec.textContent = 'Stop · ' + ((performance.now() - startedAt) / 1000).toFixed(1) + 's';
      }, 200);
    }).catch(err => { rec.disabled = false; say('take failed to start: ' + err.message); });
  };
  const endRec = () => {
    if (rendering || !opts.api || !opts.api.taking()) return;
    rendering = true;
    clearInterval(recTimer); recTimer = 0;
    rec.disabled = true;                       // a second click must not double-stop
    rec.textContent = 'Rendering…';
    say('rendering the take…', 3600000);
    opts.api.stopTake(48000).then(res => {
      const s = stampNow();
      const stem = 'take-' + s + '-' + res.side + 'x' + res.side;
      const ext = res.container === 'mp4' ? '.mp4' : '.webm';
      saveBlob(res.video, stem + ext);
      saveBlob(res.wav, 'take-' + s + '-' + width + 'ch-48k.wav');
      let note;
      if (res.mode === 'mp4') {
        note = 'mp4 ' + (res.video.size / 1048576).toFixed(2) + ' MB with the stereo mix inside';
      } else if (res.mode === 'mp4-silent') {
        saveBlob(res.stereo, 'take-' + s + '-stereo-48k.wav');
        note = 'mp4 ' + (res.video.size / 1048576).toFixed(2) + ' MB but silent (no aac here) · '
             + 'run take-to-td.bat with the stereo wav to put the sound in it';
      } else {
        saveBlob(res.stereo, 'take-' + s + '-stereo-48k.wav');
        note = (res.mode === 'webm' ? 'webm ' : 'live webm ')
             + (res.video.size / 1048576).toFixed(2) + ' MB (no h264 here) · run take-to-td.bat';
      }
      say('take ' + res.seconds.toFixed(2) + 's · ' + res.frames + ' frames at ' + res.rate
          + ' fps · ' + res.notes + ' notes · ' + res.side + '×' + res.side + ' · ' + note
          + ' · ' + (res.wav.size / 1048576).toFixed(2) + ' MB wav (' + width + 'ch)');
      idle();
    }).catch(err => {
      say('take failed: ' + err.message);
      idle();
    });
  };
  rec.addEventListener('click', () => {
    if (!opts.api || !opts.api.taking) return;
    if (opts.api.taking()) endRec(); else startRec();
  });


  container.appendChild(line);
  container.appendChild(wrap);
  container.appendChild(test);
  container.appendChild(rec);
  container.appendChild(chk);
  function tick() {
    requestAnimationFrame(tick);
    if (!opts.api || !opts.api.audioReport) return;
    if (performance.now() > stickyUntil) {
      const r = opts.api.audioReport();
      line.textContent = r.graph
        ? 'graph ' + r.graph + 'ch · out ' + r.output + 'ch · device ' + r.deviceMax
          + ' · ' + (r.routed === 'discrete' ? 'discrete ch' : 'stereo pan') + ' · ' + r.state
        : 'not started — click the drawing';
    }
    const r = opts.api.audioReport();
    rows.forEach((row, i) => {
      row.fill.style.width = (Math.min(1, (r.levels[i] || 0) * 3) * 100).toFixed(0) + '%';
      row.num.textContent = String(r.fired[i] || 0);
    });
  }
  tick();
}

// ---- the panel and the heading: two corners of the page, and they hide -------------------
// H, or the button in the panel's own status row, hides them both; the small corner button
// brings them back. Hidden is a class on <body> (`panel-off`), so nothing has to know either
// one's size — `looper.css` hides the panel and the heading off that one class.

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

// the hint that says what H does, in the page's bottom left corner. The two wordings live in
// the stylesheet, off the same `panel-off` class the panel hides behind, so they cannot drift
(function menuHint() {
  const h = document.createElement('div');
  h.className = 'menuHint';
  h.setAttribute('aria-hidden', 'true');
  document.body.appendChild(h);
})();

