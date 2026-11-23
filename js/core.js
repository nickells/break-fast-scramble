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
/* FX: filter → dry + reverb send → compressor (so the room pumps with the kit) → makeup → brickwall → out */
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
outG.connect(ctx.destination);
function applyFx() {
  const t = ctx.currentTime,
    u = UI.comp ?? 0,
    v = UI.verb ?? 0;
  // COMP: one knob — threshold falls and ratio rises together; slow-ish attack lets the stick through, quick release pumps
  comp.threshold.setTargetAtTime(-u * 32, t, 0.02);
  comp.ratio.setTargetAtTime(1 + u * 11, t, 0.02);
  comp.knee.value = 4;
  comp.attack.value = 0.006;
  comp.release.value = 0.09;
  mkup.gain.setTargetAtTime(Math.pow(10, (u * 13) / 20), t, 0.02);
  vSend.gain.setTargetAtTime(v * v * 1.1, t, 0.02);
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
  chaos: 0.35,
  retrig: true,
  pitch: true,
  rev: true,
  half: true,
  gap: true,
  res: 4,
  vol: 0.85,
  filt: 0,
  swing: 50,
  swU: '16',
  comp: 0,
  verb: 0,
  keyShow: false, // source slices + key panel: hidden until asked for
};
const UI = Object.assign({}, UI_DEF, JSON.parse(localStorage.getItem('ascr.ui') || '{}'));
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
  if (!JSON.parse(localStorage.getItem('ascr.ui') || '{}').q) UI.q = UI.quant ? 'bar' : 'none';
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
    return UI.chaos;
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
