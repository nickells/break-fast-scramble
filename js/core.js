'use strict';

const $ = s => document.querySelector(s);
const ctx = new (window.AudioContext || window.webkitAudioContext)();
const master = ctx.createGain(),
  fLP = ctx.createBiquadFilter(),
  fHP = ctx.createBiquadFilter(),
  outG = ctx.createGain();
master.gain.value = 0.85;
fLP.type = 'lowpass';
fHP.type = 'highpass';
fLP.frequency.value = 22000;
fHP.frequency.value = 10;
/* FX: filter → dry + reverb send → compressor (so the room pumps with the kit) → makeup → limiter → VOL → clipper → out */
const vSend = ctx.createGain(),
  conv = ctx.createConvolver(),
  fxSum = ctx.createGain(),
  comp = ctx.createDynamicsCompressor(),
  mkup = ctx.createGain(),
  lim = ctx.createDynamicsCompressor();
vSend.gain.value = 0;
conv.buffer = (() => {
  const sr = ctx.sampleRate,
    len = Math.floor(sr * 1.6),
    b = ctx.createBuffer(2, len, sr); // small bright room: noise, a few early reflections, ~1.4 s tail
  for (let c = 0; c < 2; c++) {
    const d = b.getChannelData(c);
    for (let i = 0; i < len; i++) {
      const t = i / sr;
      d[i] = (Math.random() * 2 - 1) * Math.exp(-t * 4.2) * (t < 0.012 ? t / 0.012 : 1);
    }
    [0.013, 0.021, 0.034, 0.047].forEach((t, k) => {
      d[Math.floor((t + c * 0.003) * sr)] += 0.6 / (k + 1);
    });
  }
  return b;
})();
lim.threshold.value = -1;
lim.ratio.value = 20;
lim.knee.value = 0;
lim.attack.value = 0.001;
lim.release.value = 0.08;
/* the limiter is a DynamicsCompressor: 1 ms attack plus its own automatic makeup gain, so hits overshoot it by up to
   ~1.5 dB. A soft clipper after it is the real ceiling: straight through below CLIP_KNEE, bending into CLIP_CEIL (−1 dBFS)
   above it — jungle-style clipping on the stray transients instead of digital wrap at the output. The shaper's curve only
   spans ±1, so its input is halved and the curve maps ±2 of real level. */
const CLIP_KNEE = Math.pow(10, -3 / 20),
  CLIP_CEIL = Math.pow(10, -1 / 20),
  CLIP_CURVE = (() => {
    const n = 4097,
      k = CLIP_KNEE,
      w = CLIP_CEIL - CLIP_KNEE,
      d = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const x = (i / (n - 1)) * 4 - 2,
        a = Math.abs(x);
      d[i] = Math.sign(x) * (a <= k ? a : k + w * Math.tanh((a - k) / w));
    }
    return d;
  })();
function clipper(c) {
  const g = c.createGain(),
    sh = c.createWaveShaper();
  g.gain.value = 0.5;
  sh.curve = CLIP_CURVE;
  // no oversampling: its resampling filters ring past the ceiling (up to +1 dB over at full COMP) and add latency.
  // The tanh bend is gentle enough that the aliasing it leaves stays under the drums.
  sh.oversample = 'none';
  g.connect(sh);
  return [g, sh];
}
const [clipIn, clipOut] = clipper(ctx);
master.connect(fLP);
fLP.connect(fHP);
fHP.connect(fxSum);
fHP.connect(vSend);
vSend.connect(conv);
conv.connect(fxSum);
fxSum.connect(comp);
comp.connect(mkup);
mkup.connect(lim);
lim.connect(outG);
outG.connect(clipIn);
clipOut.connect(ctx.destination);
/* the FILTER / COMP / VERB targets for the current knobs: live playback glides to them, WAV export sets them outright */
function fxSettings(ui = UI) {
  const x = ui.filt ?? 0,
    q = ui.res,
    dead = 0.03,
    u = ui.comp ?? 0,
    v = ui.verb ?? 0;
  let lp = 22000,
    hp = 10,
    txt = 'OFF';
  // DJ filter: one bipolar fader. left = low-pass sweeping down, right = high-pass sweeping up, centre = bypass
  if (x < -dead) {
    lp = 22000 * Math.pow(60 / 22000, (-x - dead) / (1 - dead));
    txt = 'LP ' + (lp >= 1000 ? (lp / 1000).toFixed(1) + 'k' : Math.round(lp)) + 'Hz';
  } else if (x > dead) {
    hp = 10 * Math.pow(9000 / 10, (x - dead) / (1 - dead));
    txt = 'HP ' + (hp >= 1000 ? (hp / 1000).toFixed(1) + 'k' : Math.round(hp)) + 'Hz';
  }
  return {
    lp,
    hp,
    lpQ: x < -dead ? q : 0.7,
    hpQ: x > dead ? q : 0.7,
    txt,
    // COMP: one knob — threshold falls and ratio rises together; slow-ish attack lets the stick through, quick release pumps
    thr: -u * 32,
    ratio: 1 + u * 11,
    mkup: Math.pow(10, (u * 13) / 20),
    send: v * v * 1.1,
  };
}
function applyFx() {
  const t = ctx.currentTime,
    f = fxSettings();
  comp.threshold.setTargetAtTime(f.thr, t, 0.02);
  comp.ratio.setTargetAtTime(f.ratio, t, 0.02);
  comp.knee.value = 4;
  comp.attack.value = 0.006;
  comp.release.value = 0.09;
  mkup.gain.setTargetAtTime(f.mkup, t, 0.02);
  vSend.gain.setTargetAtTime(f.send, t, 0.02);
}
/* the live chain rebuilt in another (offline) context, set to f: master → LP → HP → dry + verb → comp → makeup → limiter → clipper.
   Returns its input. VOL (outG) stays out: it is the monitor level, not part of the sound. */
function fxChain(c, f) {
  const n = () => c.createGain(),
    inG = n(),
    lp = c.createBiquadFilter(),
    hp = c.createBiquadFilter(),
    send = n(),
    cv = c.createConvolver(),
    sum = n(),
    cp = c.createDynamicsCompressor(),
    mk = n(),
    li = c.createDynamicsCompressor();
  inG.gain.value = master.gain.value;
  lp.type = 'lowpass';
  hp.type = 'highpass';
  lp.frequency.value = f.lp;
  lp.Q.value = f.lpQ;
  hp.frequency.value = f.hp;
  hp.Q.value = f.hpQ;
  send.gain.value = f.send;
  cv.buffer = conv.buffer; // the same room you hear, not a fresh noise burst
  cp.threshold.value = f.thr;
  cp.ratio.value = f.ratio;
  cp.knee.value = 4;
  cp.attack.value = 0.006;
  cp.release.value = 0.09;
  mk.gain.value = f.mkup;
  for (const k of ['threshold', 'ratio', 'knee', 'attack', 'release']) li[k].value = lim[k].value;
  inG.connect(lp);
  lp.connect(hp);
  hp.connect(sum);
  hp.connect(send);
  send.connect(cv);
  cv.connect(sum);
  sum.connect(cp);
  cp.connect(mk);
  mk.connect(li);
  const [ci, co] = clipper(c);
  li.connect(ci);
  co.connect(c.destination);
  return inG;
}
let buf = null,
  rbuf = null,
  slices = [],
  N = 0;
const UI_DEF = {
  live: true,
  oneRow: true,
  q: 'bar',
  out: 165,
  mode: 'chop',
  scramble: 0.5,
  retrig: true,
  pitch: true,
  rev: true,
  half: true,
  gap: true,
  kicks: true,
  res: 4,
  vol: 0.85,
  filt: 0,
  swing: 50,
  swU: '16',
  comp: 0,
  verb: 0,
  keyShow: false, // source slices + key panel: hidden until asked for
};
const savedUI = JSON.parse(localStorage.getItem('ascr.ui') || '{}');
const UI = { ...UI_DEF, ...savedUI };
// The lower half of Scramble is new. Bring old calm/default settings to the midpoint.
const scrambleMigrated = savedUI.scramble == null && typeof savedUI.chaos === 'number';
if (scrambleMigrated) UI.scramble = Math.min(1, 0.5 + Math.max(0, savedUI.chaos - 0.35) / 1.3);
delete UI.chaos;
// saves from when the start of each pattern could be locked to the source (KEEP INTRO, or the older lock): patterns
// made with it are remade without it
const legacyIntroLock = UI.lock === true || UI.keepIntro === true;
delete UI.lock;
delete UI.keepIntro;
delete UI.lockN;
delete UI.src; // the source tempo is the amen's (S.src)
delete UI.ideasShow;
delete UI.keyOpen; // replaced by keyShow (default hidden)
if ('quant' in UI) {
  if (!savedUI.q) UI.q = UI.quant ? 'bar' : 'none';
  delete UI.quant;
} // migrate the old Q BAR toggle
[
  ['oRetrig', 'retrig'],
  ['oPitch', 'pitch'],
  ['oRev', 'rev'],
  ['oHalf', 'half'],
  ['oGap', 'gap'],
].forEach(([o, k]) => {
  const v = localStorage.getItem('ascr.' + o);
  if (v !== null && !localStorage.getItem('ascr.ui')) UI[k] = v === '1';
});
const saveUI = () => localStorage.setItem('ascr.ui', JSON.stringify(UI));
const S = {
  src: 140, // the amen's tempo
  get out() {
    return UI.out;
  },
  get mode() {
    return UI.mode;
  },
  get chaos() {
    const v = UI.scramble;
    return v <= 0.5 ? 0.7 * v : 0.35 + 1.3 * (v - 0.5);
  },
  get restraint() {
    return Math.max(0, 1 - 2 * UI.scramble);
  },
};
const OPT = {
  get retrig() {
    return UI.retrig;
  },
  get pitch() {
    return UI.pitch;
  },
  get rev() {
    return UI.rev;
  },
  get half() {
    return UI.half;
  },
  get gap() {
    return UI.gap;
  },
};
const BARS = 4,
  SPB = 16,
  LEN = BARS * SPB;

/* ---------- seeded rng ---------- */
function mulberry(a) {
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function pickW(r, items, w) {
  let tot = 0;
  for (const x of items) tot += Math.max(0.01, w(x));
  let u = r() * tot;
  for (const x of items) {
    u -= Math.max(0.01, w(x));
    if (u <= 0) return x;
  }
  return items[items.length - 1];
}
const chance = (r, p) => r() < p;
