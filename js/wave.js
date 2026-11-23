'use strict';

/* ---------- header waveform ----------
   The whole source break with its slice ruler. While a pattern plays, the slices it uses are ink and the rest grey;
   the slice now sounding is orange, with the playhead at its start. Stopped: every slice is ink.
   Redrawn only when something it shows changes (checked once per frame, like the selection bar). */
(() => {
  const box = $('#wave'),
    cv = box.querySelector('canvas'),
    g = cv.getContext('2d');
  let mono = null,
    monoOf = null,
    peaks = null,
    peaksKey = '',
    lastKey = '';

  const monoOfBuf = () => {
    if (monoOf === buf) return mono;
    const L = buf.length,
      m = new Float32Array(L);
    for (let c = 0; c < buf.numberOfChannels; c++) {
      const d = buf.getChannelData(c);
      for (let i = 0; i < L; i++) m[i] += d[i] / buf.numberOfChannels;
    }
    monoOf = buf;
    peaks = null;
    return (mono = m);
  };
  // loudest absolute sample per pixel column
  const peaksFor = cols => {
    const key = cols + '|' + buf.length;
    if (peaks && peaksKey === key) return peaks;
    const m = monoOfBuf(),
      per = m.length / cols,
      out = new Float32Array(cols);
    let top = 1e-6;
    for (let x = 0; x < cols; x++) {
      let a = 0;
      for (let i = Math.floor(x * per), e = Math.min(m.length, Math.floor((x + 1) * per)); i < e; i++) {
        const v = m[i] < 0 ? -m[i] : m[i];
        if (v > a) a = v;
      }
      out[x] = a;
      if (a > top) top = a;
    }
    for (let x = 0; x < cols; x++) out[x] /= top;
    peaksKey = key;
    return (peaks = out);
  };

  // what is playing: the shown pattern and the slice under its playhead, or the ORIGINAL preview
  const heard = () => {
    if (sourcePreview) return { card: null, now: sourcePreview.index >= 0 ? sourcePreview.index : null };
    if (!P) return { card: null, now: null };
    const card = P.shownCard || P.card;
    let i = card.nowI,
      now = null;
    if (i != null && card.steps[i]) {
      while (i > 0 && card.steps[i].hc) i--; // half-speed continuation: still the slice that started it
      const e = card.steps[i];
      if (e.s >= 0) now = e.s;
    }
    return { card, now };
  };
  const usedBy = card => {
    const u = new Set();
    for (const e of card.steps) {
      if (!e || e.s < 0 || e.hc) continue;
      const n = e.hlen ? Math.ceil(e.hlen / 2) : 1; // half speed stretches ceil(n/2) slices over n steps
      for (let k = 0; k < n; k++) u.add((e.s + k) % N);
    }
    return u;
  };

  function draw(h) {
    const dpr = devicePixelRatio || 1,
      W = box.clientWidth,
      H = box.clientHeight;
    if (!W || !H) return;
    if (cv.width !== Math.round(W * dpr) || cv.height !== Math.round(H * dpr)) {
      cv.width = Math.round(W * dpr);
      cv.height = Math.round(H * dpr);
    }
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.clearRect(0, 0, W, H);
    if (!buf || !slices.length) return;
    const css = getComputedStyle(document.documentElement),
      ink = css.getPropertyValue('--fg').trim(),
      dim = css.getPropertyValue('--dim').trim(),
      line = css.getPropertyValue('--line').trim(),
      acc = css.getPropertyValue('--acc').trim();
    const padX = 10,
      ww = W - padX * 2,
      top = 7,
      rulerH = 15,
      wh = H - top - rulerH - 4,
      mid = top + wh / 2,
      dur = buf.duration,
      xOf = t => padX + (t / dur) * ww,
      used = h.card ? usedBy(h.card) : null;
    const startOf = k => slices[k]?.start ?? dur;

    // the sounding slice: a faint band behind it
    if (h.now != null) {
      g.fillStyle = acc;
      g.globalAlpha = 0.12;
      g.fillRect(xOf(startOf(h.now)), top - 3, xOf(startOf(h.now + 1)) - xOf(startOf(h.now)), wh + 6);
      g.globalAlpha = 1;
    }
    // waveform: one bar every 2 CSS px, coloured by the slice it falls in. Drawn in whole device pixels, so bar
    // edges never land between pixels (anti-aliased slivers there read as grey banding across the wave).
    const step = 2,
      dStep = Math.max(2, Math.round(step * dpr)),
      cols = Math.floor((ww * dpr) / dStep),
      pk = peaksFor(cols),
      dBar = dStep - Math.max(1, Math.round(0.6 * dpr)),
      dX0 = Math.round(padX * dpr),
      dMid = Math.round(mid * dpr);
    g.setTransform(1, 0, 0, 1, 0, 0);
    let k = 0;
    for (let x = 0; x < cols; x++) {
      const t = ((x + 0.5) / cols) * dur;
      while (k + 1 < slices.length && slices[k + 1].start <= t) k++;
      g.fillStyle = k === h.now ? acc : !used || used.has(k) ? ink : '#c9c6bc';
      const a = Math.max(1, Math.round(pk[x] * (wh / 2) * dpr));
      g.fillRect(dX0 + x * dStep, dMid - a, dBar, a * 2);
    }
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    // playhead at the start of the sounding slice
    if (h.now != null) {
      g.fillStyle = acc;
      g.fillRect(Math.round(xOf(startOf(h.now))) - 0.5, 2, 1.5, top + wh + 3);
    }
    // ruler: a tick per slice, bar lines darker, a number every beat
    const ry = H - rulerH;
    g.font = '9px "IBM Plex Mono", ui-monospace, monospace';
    g.textBaseline = 'top';
    for (let s = 0; s < slices.length; s++) {
      const x = Math.round(xOf(slices[s].start)) + 0.5,
        bar = s % SPB === 0;
      g.fillStyle = bar ? ink : line;
      g.fillRect(x - 0.5, ry, 1, bar ? rulerH - 2 : 6);
      if (s % 4 === 0) {
        g.fillStyle = s === h.now ? acc : dim;
        g.fillText(String(s), x + 2, ry + 3);
      }
    }
  }

  (function loop() {
    const h = heard(),
      key = [
        buf ? buf.length : 0,
        N,
        slices.length,
        box.clientWidth,
        box.clientHeight,
        devicePixelRatio,
        h.card ? h.card.id + ':' + h.card.str : '-',
        h.now,
      ].join('|');
    if (key !== lastKey) {
      lastKey = key;
      draw(h);
    }
    requestAnimationFrame(loop);
  })();
  // the ruler uses the webfont: redraw once it has loaded
  document.fonts?.ready.then(() => (lastKey = ''));
})();
