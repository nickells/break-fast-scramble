'use strict';

/* ---------- header waveform ----------
   The whole source break in the grid's slice colors. While a pattern plays, unused slices are dimmed
   and the playhead follows the audio through the source. The waveform canvas only redraws when its colors,
   highlight or dimensions change. */
(() => {
  const box = $('#wave'),
    cv = box.querySelector('canvas'),
    g = cv.getContext('2d'),
    head = box.querySelector('.wave-head'),
    padX = 10;
  let mono = null,
    monoOf = null,
    peaks = null,
    peaksKey = '',
    paletteSource = null,
    palette = [],
    lastKey = '',
    lastPosition = null;

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

  // In an overlap, show the newest audible hit. Future hits can already be queued.
  const heard = () => {
    const clock = ctx.currentTime,
      card = P ? P.shownCard || P.card : null;
    let time = null;
    if (sourcePreview) time = clock - sourcePreview.startedAt;
    else if (P) {
      let active = null;
      for (const hit of P.waveHits) {
        if (hit.start <= clock && clock < hit.end && (!active || hit.start >= active.start)) active = hit;
      }
      if (active) time = active.offset + (clock - active.start) * active.rate;
    }
    if (time == null || !buf || !slices.length) return { card, now: null, time: null };
    time = Math.max(0, Math.min(buf.duration, time));
    let now = 0;
    while (now + 1 < slices.length && slices[now + 1].start <= time) now++;
    return { card, now, time };
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
    if (paletteSource !== slices) {
      palette = slices.map((_, i) => posColor(i));
      paletteSource = slices;
    }
    const css = getComputedStyle(document.documentElement),
      ink = css.getPropertyValue('--fg').trim(),
      dim = css.getPropertyValue('--dim').trim(),
      line = css.getPropertyValue('--line').trim(),
      acc = css.getPropertyValue('--acc').trim();
    const ww = W - padX * 2,
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
    let k = 0, painted = -1;
    for (let x = 0; x < cols; x++) {
      const t = ((x + 0.5) / cols) * dur;
      while (k + 1 < slices.length && slices[k + 1].start <= t) k++;
      if (k !== painted) {
        g.fillStyle = palette[k];
        g.globalAlpha = k === h.now || !used || used.has(k) ? 1 : 0.28;
        painted = k;
      }
      const a = Math.max(1, Math.round(pk[x] * (wh / 2) * dpr));
      g.fillRect(dX0 + x * dStep, dMid - a, dBar, a * 2);
    }
    g.globalAlpha = 1;
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
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
      width = box.clientWidth,
      position = h.time == null ? null : padX + (h.time / buf.duration) * (width - padX * 2);
    if (position !== lastPosition) {
      const hidden = position == null;
      if (head.hidden !== hidden) head.hidden = hidden;
      if (position != null) head.style.transform = `translateX(${(position - 0.75).toFixed(2)}px)`;
      lastPosition = position;
    }
    const key = [
      buf ? buf.length : 0,
      N,
      slices.length,
      width,
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
