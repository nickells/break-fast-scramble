'use strict';

/* ---------- the break's notation ----------
   The amen as it's notated, per bar, in 16ths: what is struck in each slice. A slice can hold more than one hit
   (kick + ride on the 8ths, snare + ride on the backbeats); one with none is the ring of the hit before it.
   Ride on every 8th except bar 4 step 10, a crash; kicks 0 2 10 11 (bar 3: 0 2 10; bar 4: 2 3 10); snares 4 and 12
   (bars 3-4: 4 and 14, the 4th beat delayed); ghosts, the quiet snares, 7 9 (bars 1-2 also 15; bar 4 also 1).
   Snares, ride and crash after Ethan Hein's step-by-step build of the break; kicks checked against the audio (the 16
   slices with the most low end are these plus two kick tails, and nothing on the 8th offbeats of beats 2 and 4). */
const AMEN_NOTES = {
  kick: [[0, 2, 10, 11], [0, 2, 10, 11], [0, 2, 10], [2, 3, 10]],
  snare: [[4, 12], [4, 12], [4, 14], [4, 14]],
  ghost: [[7, 9, 15], [7, 9, 15], [7, 9], [1, 7, 9]],
  crash: [[], [], [], [10]],
};
function amenHits(i) {
  const b = Math.floor(i / SPB) % BARS,
    st = i % SPB,
    on = k => AMEN_NOTES[k][b].includes(st),
    h = { kick: on('kick'), snare: on('snare'), ghost: on('ghost'), crash: on('crash') };
  h.ride = st % 2 === 0 && !h.crash;
  return h;
}
/* a slice's main voice, where one drum has to stand for it (the generator's choices, the card namer): the snare over
   the ride it lands with, a kick over its ride; '.' for a slice with nothing struck, only the ring of the hit before */
// what a slice holds, in words: "kick + ride", or the ring of the hit before
const hitsName = h =>
  ['kick', 'snare', 'ghost', 'ride', 'crash'].filter(k => h[k]).join(' + ') || 'ring of the hit before';
const mainVoice = h => (h.snare ? 'S' : h.ghost ? 'g' : h.kick ? 'K' : h.ride || h.crash ? 'h' : '.');

/* ---------- audio load + analysis ---------- */
async function loadArrayBuffer(ab) {
  buf = await ctx.decodeAudioData(ab);
  rbuf = ctx.createBuffer(buf.numberOfChannels, buf.length, buf.sampleRate);
  for (let c = 0; c < buf.numberOfChannels; c++) {
    const s = buf.getChannelData(c),
      d = rbuf.getChannelData(c);
    for (let i = 0, n = s.length; i < n; i++) d[i] = s[n - 1 - i];
  }
  analyze();
}
function lp(x, fc, sr) {
  const a = 1 - Math.exp((-2 * Math.PI * fc) / sr),
    y = new Float32Array(x.length);
  let v = 0;
  for (let i = 0; i < x.length; i++) {
    v += a * (x[i] - v);
    y[i] = v;
  }
  return y;
}
function analyze() {
  const sr = buf.sampleRate,
    L = buf.length,
    m = new Float32Array(L);
  for (let c = 0; c < buf.numberOfChannels; c++) {
    const d = buf.getChannelData(c);
    for (let i = 0; i < L; i++) m[i] += d[i] / buf.numberOfChannels;
  }
  const step = 60 / S.src / 4;
  N = Math.max(1, Math.round(buf.duration / step));
  // transient envelope: first-difference energy per 1ms, log flux
  const hop = Math.round(sr * 0.001),
    F = Math.floor(L / hop),
    flux = new Float32Array(F);
  let prev = 0;
  for (let f = 0; f < F; f++) {
    let e = 0;
    for (let i = f * hop + 1; i < (f + 1) * hop; i++) {
      const d = m[i] - m[i - 1];
      e += d * d;
    }
    const le = Math.log(e + 1e-9);
    flux[f] = Math.max(0, le - prev);
    prev = le;
  }
  // smoothed onset strength: rise over 3ms
  const on = new Float32Array(F);
  for (let f = 3; f < F; f++) on[f] = flux[f] + flux[f - 1] + flux[f - 2];
  const sorted = [...on].sort((a, b) => a - b),
    thr = sorted[Math.floor(F * 0.9)];
  const l150 = lp(m, 150, sr),
    l300 = lp(m, 300, sr),
    l3k = lp(m, 3000, sr),
    l7k = lp(m, 7000, sr);
  const W2 = Math.floor(0.002 * sr),
    dbAt = t => {
      const a = Math.max(0, Math.floor(t * sr));
      let e = 0;
      for (let k = a; k < a + W2 && k < L; k++) e += m[k] * m[k];
      return 10 * Math.log10(e / W2 + 1e-12);
    };
  slices = [];
  for (let i = 0; i < N; i++) {
    const g = i * step;
    let best = -1,
      bt = g;
    // snap only to a real hit: biggest energy jump (2ms windows) within ±10ms of the grid, and only if it's ≥6dB
    let rise = -99;
    for (let t = Math.max(0.005, g - 0.01); t <= g + 0.01; t += 0.0005) {
      const r = Math.max(dbAt(t + 0.001), dbAt(t + 0.003)) - dbAt(t - 0.004);
      if (r > rise) {
        rise = r;
        bt = t;
      }
    }
    best = rise;
    const snap = rise >= 6;
    const start = snap ? Math.max(0, bt - 0.001) : g;
    // features over first 60ms
    const a = Math.floor(start * sr),
      b = Math.min(L, a + Math.floor(0.06 * sr));
    let lo = 0,
      mid = 0,
      hi = 0,
      tot = 0;
    for (let k = a; k < b; k++) {
      lo += l150[k] ** 2;
      mid += (l3k[k] - l300[k]) ** 2;
      hi += (m[k] - l7k[k]) ** 2;
      tot += m[k] ** 2;
    }
    slices.push({
      i,
      grid: g,
      start,
      snapped: snap,
      lo: Math.log(lo + 1e-9),
      mid: Math.log(mid + 1e-9),
      hi: Math.log(hi + 1e-9),
      rms: Math.log(tot + 1e-9),
    });
  }
  const z = k => {
    const v = slices.map(s => s[k]),
      mu = v.reduce((a, b) => a + b) / v.length,
      sd = Math.sqrt(v.reduce((a, b) => a + (b - mu) ** 2, 0) / v.length) || 1;
    slices.forEach(s => (s['z' + k] = (s[k] - mu) / sd));
  };
  ['lo', 'mid', 'hi', 'rms'].forEach(z); // loudness and brightness, for ranking slices that play the same drums
  // what each slice holds comes from the notation; kick and snare as scores on about the old ±1 scale the generator's
  // weights were tuned to (a ghost is a quiet snare: in between)
  for (const s of slices) {
    s.hits = amenHits(s.i);
    s.kick = s.hits.kick ? 1.2 : -0.8;
    s.snare = s.hits.snare ? 1.2 : s.hits.ghost ? 0.2 : -0.8;
    s.role = mainVoice(s.hits);
  }
  drawSrcMap();
}
function rtBg(x) {
  const st = [];
  for (let q = 1; q < x; q++) {
    const at = ((q * 100) / x).toFixed(2);
    st.push(
      `transparent calc(${at}% - 0.75px)`,
      `var(--mark) calc(${at}% - 0.75px)`,
      `var(--mark) calc(${at}% + 0.75px)`,
      `transparent calc(${at}% + 0.75px)`,
    );
  }
  return `linear-gradient(90deg,${st.join(',')})`;
}
/* The source preview and the pattern key. */
function keyHTML() {
  const c = (cls, t, st = '') => `<div class="cell ${cls}" style="${st}">${t}</div>`;
  const n = (cls, t, st = '') => c(cls.replace(/^\S+/, 'nt'), t, st); // colour-agnostic example: shape only
  // hit: what clicking the example plays (and shows the drummer playing): a drum role, or a rest (KEY_HIT, below)
  const it = (ex, label, hit) =>
    `<div class="ki${hit ? ' khit' : ''}"${hit ? ` data-hit='${JSON.stringify(hit)}' data-tip="click: play it"` : ''}><div class="kx">${ex}</div><span>${label}</span></div>`;
  const grp = (cap, items, cls = '') =>
    `<div class="kg ${cls}"><span class="cap">${cap}</span><div class="kr">${items.join('')}</div></div>`;
  return `<div class="key">${[
    grp(
      'POSITION',
      [
        it(
          Array.from({ length: 8 }, (_, k) =>
            c((k ? 'join' : '') + (k < 7 ? ' joinR' : ''), '', `--pc:${posColor(k * 8)}`),
          ).join(''),
          'bar 1 → 4',
        ),
      ],
    ),
    grp('FLOW', [
      it(n('S joinR', 4) + n('h join joinR', 5) + n('h join', 6), 'run'),
      it(n('S', 4) + n('K', 10), 'cut'),
      it(n('K', 32, 'box-shadow:-2px 0 0 0 var(--acc)'), 'cut at bar start'),
    ]),
    grp('RETRIG', [
      it(n('S rt', 4, 'background-image:' + rtBg(2)), '×2 32nds', { role: 'S', x: 2 }),
      it(n('S rt', 4, 'background-image:' + rtBg(3)), '×3 triplets', { role: 'S', x: 3 }),
      it(n('S rt', 4, 'background-image:' + rtBg(4)), '×4 64ths', { role: 'S', x: 4 }),
    ]),
    grp('FX', [
      it(n('g rev', 7), 'reversed', { role: 'g', r: true }),
      it(n('S pu', 4), 'pitch up', { role: 'S', p: 5 }),
      it(n('h pd', 9), 'pitch down', { role: 'h', p: -5 }),
      it(c('rest', '·'), 'rest', { rest: true }),
      it(
        n('g hs joinR', '<span class="hn pair">40</span>') +
          n('g hs join joinR', '') +
          n('g hs join joinR', '<span class="hn pair">41</span>') +
          n('g hs join', ''),
        'half speed',
      ),
    ]),
    grp(
      'EDIT',
      [
        ['drag on card / ⌘-drag', 'select'],
        ['click / ⌘-click', 'select step'],
        ['⇧-click', 'extend'],
        ['drag', 'swap (any loop)'],
        ['⌥-drag', 'clone (any step)'],
        ['delete', 'clear'],
        ['⌘Z', 'undo'],
        ['esc', 'deselect'],
      ].map(([k, l]) => `<div class="ki"><kbd>${k}</kbd><span>${l}</span></div>`),
      'kedit',
    ),
  ].join('')}</div>`;
}
/* play one step on its own, and have the drummer play it too (for checking his drawings): clicks on the key's examples
   and on the steps of the source shown in the key */
function audition(e) {
  if (!buf || !e) return;
  ctx.resume();
  if (e.s >= 0) schedStep(ctx, outG, e, ctx.currentTime + 0.01, step16(), false);
  window.drummerPoke?.(e);
}
/* a slice that is that drum alone, by the notation (a ride's 8th, a kick with no ride, …) */
function keySlice(role) {
  return { K: 51, S: 4, g: 7, h: 6 }[role];
}
$('#srcmap').addEventListener('click', ev => {
  // a step of the source shown in the key: that slice
  const cell = ev.target.closest('.source-card .grid .cell');
  if (cell) {
    const i = [...cell.closest('.grid').querySelectorAll('.cell')].indexOf(cell);
    if (i >= 0) audition({ s: i, x: 1 });
    return;
  }
  // a key example: a slice that sounds as that drum, played as the example shows (retrig, reversed, pitched, a rest)
  const el = ev.target.closest('.khit');
  if (!el) return;
  const hit = JSON.parse(el.dataset.hit),
    s = hit.rest ? -1 : keySlice(hit.role);
  if (s != null) audition({ s, x: hit.x || 1, r: !!hit.r, p: hit.p || 0 });
});
function drawSrcMap() {
  const el = $('#srcmap');
  el.innerHTML = keyHTML();
  tagPos(el);
  el.prepend(makeOrig(true));
}

/* position colours: a 'plasma'-style ramp (dark blue → purple → orange → yellow). Its lightness rises steadily, so it reads
   for red-green colour vision too (deuteranomaly), unlike a rainbow. Start of the break is dark, end is light. */
const PLASMA = [
  '#4c02a1',
  '#7e03a8',
  '#a92395',
  '#cc4778',
  '#e56b5d',
  '#f89540',
  '#fdc527',
  '#f0f921',
].map(h => [1, 3, 5].map(k => parseInt(h.slice(k, k + 2), 16)));
const posT = i => (((i % N) + N) % N) / Math.max(1, N - 1);
const posColor = i => {
  const t = posT(i) * (PLASMA.length - 1),
    a = Math.floor(t),
    f = t - a,
    A = PLASMA[a],
    B = PLASMA[Math.min(a + 1, PLASMA.length - 1)];
  return `rgb(${A.map((v, k) => Math.round(v + (B[k] - v) * f)).join(',')})`;
};
const posText = i => (posT(i) < 0.42 ? '#fffd' : '#000b');
function tagPos(root) {
  root.querySelectorAll('.cell').forEach(c => {
    if (c.classList.contains('rest') || c.classList.contains('nt')) return;
    const n = c.dataset.s != null ? +c.dataset.s : parseInt(c.textContent);
    if (!isNaN(n)) {
      c.style.setProperty('--pc', posColor(n));
      c.style.setProperty('--pt', posText(n));
    }
  });
}
