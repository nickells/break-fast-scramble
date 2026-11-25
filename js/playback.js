'use strict';

/* ---------- playback ---------- */
const step16 = () => 60 / S.out / 4;
/* swing as a time warp over pairs of units (u = a 16th or an 8th): the first unit stretches by off, the second shrinks by off.
   16: every odd 16th is late. 8: the off-beat 8th is late, and the 16ths inside each 8th are spread evenly across it.
   swAt(i) = how late grid step i plays; a step lasting n steps runs from its swung start to the next one's. */
function swAt(i, sd) {
  const amt = Math.max(0, ((UI.swing ?? 50) - 50) / 50);
  if (!amt) return 0;
  const u = UI.swU === '8' ? 2 * sd : sd,
    off = amt * u,
    x = (i * sd) % (2 * u),
    w = x < u ? (x * (u + off)) / u : u + off + ((x - u) * (u - off)) / u;
  return w - x;
}
function schedStep(c, dest, e, t, dur, raw, i, waveHits) {
  if (!e || e.s < 0 || e.hc) return; // half-speed continuation: already sounding
  const half = !!e.hlen,
    n = half ? e.hlen : 1;
  let swingLength = 0;
  if (i != null) {
    const sd = dur,
      lag = swAt(i, sd),
      nextLag = swAt(i + n, sd);
    t += lag;
    swingLength = nextLag - lag;
    dur = n * sd + nextLag - lag;
  } else if (half) dur *= e.hlen;
  const x = half ? 1 : e.x || 1,
    sub = dur / x,
    slice = e.s % N,
    start = slices[slice].start,
    next = slices[slice + (half ? Math.ceil(n / 2) : 1)];
  // CHOP and swung REPITCH can leave space between hits. Keep that space clear of source bleed.
  const swung = i != null && UI.swing > 50;
  const end = !raw && (S.mode === 'chop' || swung)
    ? (next?.start ?? buf.duration)
    : Infinity;
  const rate =
    Math.pow(2, (e.p || 0) / 12) *
    (!raw && S.mode === 'repitch' ? S.out / S.src : 1) *
    (half ? 0.5 : 1);
  const normalNeed = Math.min((sub + 0.004) * rate, end - start),
    normalTime = normalNeed / rate;
  // Fill part of a swing gap with the recorded ring, fading across the borrowed
  // audio. A snapped boundary might be a transient even if the score has no hit.
  const borrow = !raw && swingLength > 0 && !half && !e.r && x === 1 && sub - normalTime > 0.004 &&
    next?.role === '.' && !next.snapped;
  const need = borrow
    ? Math.min(sub * rate, normalNeed + 0.04 * rate, (slices[slice + 2]?.start ?? buf.duration) - start)
    : normalNeed;
  const playable = need / rate;
  if (playable <= 0) return;
  const off = e.r ? Math.max(0, buf.duration - (start + need)) : start,
    attack = Math.min(0.0015, playable / 2),
    release = Math.max(attack, normalTime - 0.0045);
  for (let k = 0; k < x; k++) {
    const tt = t + k * sub,
      src = c.createBufferSource(),
      g = c.createGain();
    src.buffer = e.r ? rbuf : buf;
    src.playbackRate.value = rate;
    src.connect(g);
    g.connect(dest);
    // level: the step's own dB, and rolls rise into what follows (deeper start the longer the roll, up to −9 dB)
    let db = e.v || 0;
    if (x > 1) {
      const n = e.rn || x,
        j = (e.rj || 0) + k;
      db -= Math.min(9, 3 * (n - 1)) * (1 - j / (n - 1));
    }
    const v = Math.pow(10, db / 20);
    g.gain.setValueAtTime(0, tt);
    g.gain.linearRampToValueAtTime(v, tt + attack);
    g.gain.setValueAtTime(v, tt + release);
    g.gain.linearRampToValueAtTime(0, tt + playable);
    src.start(tt, off, need);
    if (waveHits) {
      // Store what this source node actually plays, in the original buffer's coordinates.
      waveHits.push({
        start: tt,
        end: tt + Math.min(playable, (buf.duration - off) / rate),
        offset: e.r ? buf.duration - off - 1 / buf.sampleRate : off,
        rate: e.r ? -rate : rate,
      });
    }
  }
}
let P = null;
let sourcePreview = null;
function showSourcePlayback(playing) {
  const button = $('#source-play');
  if (!button) return;
  button.classList.toggle('on', playing);
  button.closest('.card').classList.toggle('playing', playing);
  button.title = playing ? 'Stop original sample' : 'Play original sample';
  button.setAttribute('aria-label', button.title);
}
function finishSourcePreview(preview) {
  if (sourcePreview !== preview) return;
  sourcePreview = null;
  cancelAnimationFrame(preview.frame);
  preview.cells[preview.index]?.classList.remove('now');
  preview.cells[preview.beat]?.classList.remove('pulse', 'pulseBar');
  preview.source.disconnect();
  showSourcePlayback(false);
}
function toggleSourcePreview() {
  if (sourcePreview) {
    stop();
    return;
  }
  if (!buf) return;
  stop();
  ctx.resume();
  const source = ctx.createBufferSource();
  source.buffer = buf;
  source.connect(outG);
  const preview = {
    source,
    cells: $('#srcmap .source-card').querySelectorAll('.grid .cell'),
    startedAt: ctx.currentTime,
    index: -1,
    beat: -1,
    frame: 0,
  };
  const draw = () => {
    if (sourcePreview !== preview) return;
    const elapsed = ctx.currentTime - preview.startedAt;
    let index = Math.max(0, preview.index);
    while (index + 1 < preview.cells.length && slices[index + 1]?.start <= elapsed) index++;
    if (index !== preview.index) {
      preview.cells[preview.index]?.classList.remove('now');
      preview.cells[index]?.classList.add('now');
      preview.index = index;
      if (index % 4 === 0 && preview.cells[index]) {
        preview.cells[preview.beat]?.classList.remove('pulse', 'pulseBar');
        pulse(preview, index);
        preview.beat = index;
      }
    }
    preview.frame = requestAnimationFrame(draw);
  };
  source.onended = () => finishSourcePreview(preview);
  sourcePreview = preview;
  showSourcePlayback(true);
  source.start(preview.startedAt);
  draw();
}
/* on every beat, the one step under the playhead pops; bar starts pop a bit more */
function pulse(card, i) {
  const c = card.cells[i];
  c.classList.remove('pulse', 'pulseBar');
  void c.offsetWidth;
  c.classList.add(i % SPB === 0 ? 'pulseBar' : 'pulse');
}
/* playback always loops the whole pattern; row = 0..3 just picks the bar it starts from */
/* loop region: reaching the end of the region's last bar jumps to its first bar; outside the region playback just runs on */
function setPl(card, st) {
  const b = card.btn;
  b.classList.toggle('on', st === 'play');
  b.classList.toggle('q', st === 'queue');
  b.title =
    st === 'play'
      ? 'stop'
      : st === 'queue'
      ? UI.q === 'loop'
        ? 'starts at the loop end'
        : 'starts at the next bar'
      : 'play';
}
function mark(card, state, qrow = null) {
  // state: 'play' | 'queue' | null
  card.el.classList.toggle('playing', state === 'play');
  card.el.classList.toggle('queued', state === 'queue' && qrow == null);
  setPl(card, state === 'play' ? 'play' : state === 'queue' && qrow == null ? 'queue' : null);
  card.rbtn.forEach((b, k) => b.classList.toggle('q', state === 'queue' && qrow === k));
  if (state !== 'play') card.el.querySelectorAll('.now').forEach(x => x.classList.remove('now'));
}
function play(card, row = 0) {
  ctx.resume();
  stop();
  P = {
    card,
    shownCard: card,
    start: row,
    pos: row * SPB,
    next: ctx.currentTime + 0.06,
    i: 0,
    queued: null,
    qrow: null,
    waveHits: [],
  };
  mark(card, 'play');
  P.timer = setInterval(tick, 20);
  tick();
}
function stop() {
  if (sourcePreview) {
    const preview = sourcePreview;
    preview.source.stop();
    finishSourcePreview(preview);
  }
  if (!P) return;
  clearInterval(P.timer);
  const cs = new Set([P.card, P.shownCard, P.queued].filter(Boolean));
  P = null;
  for (const c of cs) mark(c, null);
}
function unqueue() {
  if (!P || !P.queued) return;
  const q = P.queued,
    heard = P.shownCard || P.card;
  P.queued = null;
  P.qrow = null;
  q.rbtn.forEach(b => b.classList.remove('q'));
  mark(q, q === heard ? 'play' : null);
}
/* launch quantise: with Q BAR on, a change while playing waits for the next bar line */
function launch(card, row = null) {
  const heard = P && (P.shownCard || P.card);
  if (row == null && P && heard === card && !P.queued) {
    stop();
    return;
  } // main ▶ on what you hear: stop
  if (P && P.queued === card && P.qrow === row) {
    unqueue();
    return;
  } // same request again: cancel it
  if (P && UI.q !== 'none') {
    unqueue();
    P.queued = card;
    P.qrow = row;
    if (card === heard) card.rbtn.forEach((b, k) => b.classList.toggle('q', row === k));
    else mark(card, 'queue', row);
    if (card === heard && row == null) setPl(card, 'queue');
    if (card !== heard && row != null) card.rbtn[row].classList.add('q');
    return;
  }
  play(card, row ?? card.loop?.a ?? 0); // main play starts at the loop region's first bar
}
function tick() {
  const sd = step16(),
    PP = P;
  P.waveHits = P.waveHits.filter(hit => hit.end > ctx.currentTime);
  while (P.next < ctx.currentTime + 0.15) {
    if (P.i > 0 && P.pos % SPB === 0) {
      // on a bar line
      const done = (P.pos / SPB - 1 + BARS) % BARS,
        loopEnd = !!P.card.loop && done === P.card.loop.b;
      if (P.queued && (UI.q !== 'loop' || loopEnd)) {
        // queued switch: at this bar line (BAR), or only once the loop region has finished (LOOP)
        const old = P.card,
          nw = P.queued;
        P.card = nw;
        P.start = P.qrow ?? nw.loop?.a ?? 0;
        P.pos = P.start * SPB;
        P.queued = null;
        P.qrow = null;
        P.i = 0;
        setTimeout(
          () => {
            if (P !== PP) return;
            P.shownCard = nw;
            if (old !== nw) mark(old, null);
            mark(nw, 'play');
          },
          (P.next - ctx.currentTime) * 1000,
        );
      } else if (loopEnd) P.pos = P.card.loop.a * SPB; // end of the loop region → back to its first bar
    }
    const card = P.card,
      i = P.pos;
    if (i % SPB === 0) annotateHalf(card.steps);
    schedStep(ctx, master, card.steps[i], P.next, sd, false, i, P.waveHits);
    const at = (P.next + swAt(i, sd) - ctx.currentTime) * 1000;
    setTimeout(() => {
      if (P !== PP) return;
      card.nowI = i;
      card.cells.forEach(c => c.classList.remove('now'));
      card.cells[i]?.classList.add('now');
      ghostNow(card, i);
      if (i % 4 === 0) pulse(card, i);
    }, at); // card.cells read at fire time: survives re-renders
    P.next += sd;
    P.i++;
    P.pos = (P.pos + 1) % LEN;
  }
}
async function render(steps, loops = 1) {
  const sd = step16(),
    sr = buf.sampleRate,
    len = Math.ceil((LEN * sd * loops + 0.05) * sr);
  const oc = new OfflineAudioContext(buf.numberOfChannels, len, sr),
    og = oc.createGain();
  og.gain.value = 0.85;
  og.connect(oc.destination);
  annotateHalf(steps);
  for (let l = 0; l < loops; l++)
    for (let i = 0; i < LEN; i++) schedStep(oc, og, steps[i], (l * LEN + i) * sd, sd, false, i);
  return oc.startRendering();
}
function wav(ab) {
  const nc = ab.numberOfChannels,
    n = ab.length,
    sr = ab.sampleRate,
    b = new DataView(new ArrayBuffer(44 + n * nc * 2));
  const w = (o, s) => [...s].forEach((ch, i) => b.setUint8(o + i, ch.charCodeAt(0)));
  w(0, 'RIFF');
  b.setUint32(4, 36 + n * nc * 2, true);
  w(8, 'WAVEfmt ');
  b.setUint32(16, 16, true);
  b.setUint16(20, 1, true);
  b.setUint16(22, nc, true);
  b.setUint32(24, sr, true);
  b.setUint32(28, sr * nc * 2, true);
  b.setUint16(32, nc * 2, true);
  b.setUint16(34, 16, true);
  w(36, 'data');
  b.setUint32(40, n * nc * 2, true);
  const ch = [...Array(nc)].map((_, c) => ab.getChannelData(c));
  let o = 44;
  for (let i = 0; i < n; i++)
    for (let c = 0; c < nc; c++) {
      b.setInt16(o, Math.max(-1, Math.min(1, ch[c][i])) * 32767, true);
      o += 2;
    }
  return new Blob([b], { type: 'audio/wav' });
}
