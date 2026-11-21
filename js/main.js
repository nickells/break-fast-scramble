'use strict';

/* ---------- wiring ---------- */
$('#gen').onclick = regenerate;
/* NEW: a tile in the next grid slot. Click it for a generated pattern; its PASTE button opens a field to load one instead. */
(() => {
  const tile = $('#newtile'),
    main = $('#cards'),
    inp = tile.querySelector('.nt-in'),
    open = on => {
      tile.classList.toggle('open', on);
      if (on) inp.focus();
      else inp.value = '';
    },
    add = (pat, id) => {
      const el = makeCard(pat, id + Date.now().toString(36).slice(-5));
      tile.before(el);
      saveCards();
      el.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    };
  main.appendChild(tile);
  // Keep the tile in the last slot when the card list is rebuilt.
  new MutationObserver(() => {
    if (main.lastElementChild !== tile) main.appendChild(tile);
  }).observe(main, { childList: true });
  tile.querySelector('.nt-go').onclick = () => add(generate((Math.random() * 2 ** 32) >>> 0), 'n');
  tile.querySelector('.nt-paste').onclick = () => open(true);
  tile.querySelector('.nt-orig').onclick = showOrig;
  tile.querySelector('.nt-x').onclick = () => open(false);
  inp.onkeydown = e => {
    if (e.key === 'Escape') open(false);
  };
  tile.querySelector('.nt-form').onsubmit = e => {
    e.preventDefault();
    const t = inp.value
      .trim()
      .replace(/^#\S+\s+/, '')
      .replace(/^"[^"]*"\s+/, '');
    if (!t) return open(false);
    let p;
    try {
      p = parse(t);
    } catch (err) {
      alert(err.message);
      return;
    }
    while (p.length < LEN) p.push({ s: -1 });
    add({ steps: p.slice(0, LEN), genes: { eng: 'pasted' } }, 'paste');
    open(false);
  };
})();
document.addEventListener('keydown', e => {
  if (e.code !== 'Space' || e.defaultPrevented || e.altKey || e.ctrlKey || e.metaKey ||
    e.target.closest?.('input,textarea,select,[contenteditable]:not([contenteditable="false"])')) return;
  const hovered = $('#cards .card:hover');
  const card = hovered && cards.find(c => c.el === hovered);
  if (!card && e.target.closest?.('button:focus-visible,a:focus-visible')) return;
  e.preventDefault();
  if (e.repeat) return;
  if (card) launch(card);
  else stop();
});
addEventListener('dragover', e => {
  e.preventDefault();
  $('#drop').style.display = 'flex';
});
addEventListener('dragleave', e => {
  if (!e.relatedTarget) $('#drop').style.display = 'none';
});
addEventListener('drop', async e => {
  e.preventDefault();
  $('#drop').style.display = 'none';
  const f = e.dataTransfer.files[0];
  if (!f) return;
  stop();
  const ab = await f.arrayBuffer(),
    probe = await ctx.decodeAudioData(ab.slice(0));
  UI.srcBpm = Math.round(((BARS * 4 * 60) / probe.duration) * 10) / 10; // treat a dropped break as 4 bars
  await loadArrayBuffer(ab);
  newBatch(false);
});
(async () => {
  const bin = atob(window.AMEN_WAV_B64),
    u = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i);
  delete UI.srcBpm;
  await loadArrayBuffer(u.buffer); // built-in amen: 140 bpm
  if (!restoreCards()) newBatch(false);
  else if (styleMixMoved || legacyIntroLock) refreshGeneratedCards();
  sizeCells(); // size the cells to the cards right away (otherwise they sit at the fallback size until the first change)
  if (location.hash === '#selftest')
    selftest().catch(e => {
      const p = document.createElement('pre');
      p.id = 'selftest';
      p.textContent = 'ERR ' + e.stack;
      document.body.prepend(p);
    });
})();
async function selftest() {
  // null-test the slicer/renderer against the source, and sanity-check generators
  const res = {};
  res.roles = [0, 1, 2, 3]
    .map(b =>
      slices
        .slice(b * 16, b * 16 + 16)
        .map(s => s.role)
        .join(''),
    )
    .join(' | ');
  res.snapMs = slices.map(s => Math.round((s.start - s.grid) * 1000)).join(',');
  res.cards = cards.length;
  res.bad = cards
    .filter(c => c.steps.length !== LEN || c.steps.some(e => !e || e.s >= N))
    .map(c => c.id);
  res.starts = cards
    .map(c =>
      c.steps
        .slice(0, 8)
        .map(e => e.s)
        .join(','),
    )
    .slice(0, 4);
  res.sample = cards.slice(0, 4).map(c => c.id + ' ' + c.genes.eng + ' ' + c.str);
  const pre = document.createElement('pre');
  pre.id = 'selftest';
  pre.textContent = JSON.stringify(res, null, 1);
  document.body.prepend(pre);
  const keep = UI.out;
  UI.out = S.src;
  const out = await render(run(0, LEN), 1);
  let n = 0,
    d = 0;
  for (let c = 0; c < buf.numberOfChannels; c++) {
    const a = out.getChannelData(c),
      s = buf.getChannelData(c);
    for (let i = 0; i < Math.min(a.length, s.length); i++) {
      n += (a[i] - s[i]) ** 2;
      d += s[i] ** 2;
    }
  }
  res.nullDb = +(10 * Math.log10(n / d)).toFixed(1);
  UI.out = keep;
  pre.textContent += '\nnullDb ' + res.nullDb;
}
window.__t = { render, parse, run, generate, slices: () => slices, buf: () => buf, S, toStr };
