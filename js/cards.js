'use strict';

/* ---------- cards ---------- */
let batch = +(localStorage.getItem('ascr.b') || 0),
  cards = [];
const RT_NAME = { 2: '32nds', 3: '16th triplets', 4: '64ths', 6: '32nd triplets', 8: '128ths' };
// consecutive = next source slice, played plainly (no reverse/retrig/pitch change)
function contig(a, b) {
  if (a.h || b.h) return !!b.hc;
  return (
    a.s >= 0 &&
    b.s >= 0 &&
    b.s === (a.s + 1) % N &&
    !a.r &&
    !b.r &&
    (a.x || 1) === 1 &&
    (b.x || 1) === 1 &&
    (a.p || 0) === (b.p || 0)
  );
}
function halfLabelClass(steps, i, included) {
  const col = i % SPB, second = (i - voiceStart(steps, i)) % 2 === 1;
  if (second && col > 0 && (!included || included.has(i - 1))) return;
  const pair = !second && col + 1 < SPB && steps[i + 1]?.hc &&
    (!included || included.has(i + 1));
  return pair ? 'hn pair' : 'hn';
}
function drawHalfLabel(cell, steps, i, included) {
  const className = halfLabelClass(steps, i, included);
  if (!className) return;
  const label = document.createElement('span');
  label.className = className;
  label.textContent = steps[i].s;
  cell.appendChild(label);
}
function makeCard(pat, id) {
  const el = document.createElement('div');
  el.className = 'card';
  const card = {
    id,
    steps: annotateHalf(pat.steps),
    genes: pat.genes,
    el,
    orig: pat.orig || toStr(pat.steps),
    edited: !!pat.edited,
    ro: !!pat.ro,
    preview: !!pat.preview,
  };
  el.classList.toggle('ro', card.ro);
  el.innerHTML = `<div class="top"><button class="pl" title="play (Space while hovering this card)"><svg class="i-play" viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" stroke-width="2" stroke-linejoin="round"><polygon points="7 4 20 12 7 20 7 4"/></svg><svg class="i-stop" viewBox="0 0 24 24" fill="currentColor"><rect width="13" height="13" x="5.5" y="5.5" rx="2"/></svg></button><span class="nm"></span>${card.preview ? '' : `<span class="ico"><button class="cl" title="clone: an editable copy right after this one (pin it to keep it through REROLL)"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="15" x2="15" y1="12" y2="18"/><line x1="12" x2="18" y1="15" y2="15"/><rect width="14" height="14" x="8" y="8" rx="2" ry="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/></svg></button><button class="sh" title="shuffle: a new pattern in this slot (⌘Z undoes)"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m18 14 4 4-4 4"/><path d="m18 2 4 4-4 4"/><path d="M2 18h1.973a4 4 0 0 0 3.3-1.7l5.454-7.6a4 4 0 0 1 3.3-1.7H22"/><path d="M2 6h1.972a4 4 0 0 1 3.4 1.898l.734 1.204"/><path d="M22 18h-6.041a4 4 0 0 1-3.3-1.8l-.359-.45"/></svg></button><button class="pn" title="pin: REROLL leaves this pattern where it is"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 17v5"/><path d="M9 10.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24V16a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-.76a2 2 0 0 0-1.11-1.79l-1.78-.9A2 2 0 0 1 15 10.76V7a1 1 0 0 1 1-1 2 2 0 0 0 0-4H8a2 2 0 0 0 0 4 1 1 0 0 1 1 1z"/></svg></button><button class="dl" title="delete this pattern (⌘Z brings it back)"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/><line x1="10" x2="10" y1="11" y2="17"/><line x1="14" x2="14" y1="11" y2="17"/></svg></button></span>`}</div><div class="gwrap">${card.preview ? '' : `<div class="rps">${[
    0, 1, 2, 3,
  ]
    .map(k => `<button class="rp" title="play from bar ${k + 1}">▶</button>`)
    .join(
      '',
    )}</div><div class="lgut" title="loop region: drag to set which bars loop · click = loop one bar · double-click = all bars"><div class="lbr"></div></div>`}<div class="grid"></div></div>
  ${card.preview ? '' : `<div class="btns"><button class="cp">copy</button><button class="wv">wav</button><button class="rs" title="back to the generated pattern (⌘Z undoes)">reset</button></div>`}`;
  card.btn = el.querySelector('.pl');
  if (card.preview) {
    el.classList.add('source-card');
    card.btn.id = 'source-play';
    card.btn.title = 'Play original sample';
    card.btn.setAttribute('aria-label', card.btn.title);
    card.btn.onclick = toggleSourcePreview;
    renderCard(card);
    return el;
  }
  card.btn.onclick = () => launch(card);
  card.rbtn = [...el.querySelectorAll('.rp')];
  card.rbtn.forEach((b, k) => (b.onclick = () => launch(card, k)));
  // loop region: bars a..b (default all). Playback that reaches the end of bar b jumps back to bar a.
  card.loop =
    pat.loop && pat.loop.length === 2 ? { a: pat.loop[0], b: pat.loop[1] } : { a: 0, b: BARS - 1 };
  const gut = el.querySelector('.lgut');
  let la = null;
  const rowAt = y => {
    const rs = [...el.querySelectorAll('.grid .row')].map(r => r.getBoundingClientRect());
    let k = rs.findIndex(r => y < r.bottom + 1.5);
    return k < 0 ? BARS - 1 : k;
  };
  // drag grabs the nearest edge of the region and keeps the other edge fixed; a plain click loops just that bar
  let r0 = null,
    moved = false;
  gut.onpointerdown = e => {
    e.preventDefault();
    e.stopPropagation();
    try {
      gut.setPointerCapture(e.pointerId);
    } catch (_) {}
    const r = rowAt(e.clientY),
      { a, b } = card.loop;
    r0 = r;
    moved = false;
    la = r <= a ? b : r >= b ? a : r - a <= b - r ? b : a; // above/at top → move top; below/at bottom → move bottom; inside → nearer edge
    if (a === b) la = a;
    dragOn('ns-resize');
    const fin = ev => {
      removeEventListener('pointerup', fin, true);
      removeEventListener('pointercancel', fin, true);
      removeEventListener('blur', fin);
      gut.removeEventListener('lostpointercapture', fin);
      endGut(ev);
    };
    addEventListener('pointerup', fin, true);
    addEventListener('pointercancel', fin, true);
    addEventListener('blur', fin);
    gut.addEventListener('lostpointercapture', fin);
  };
  const endGut = e => {
    if (la == null) return;
    if (!moved && e?.type === 'pointerup') {
      card.loop = { a: r0, b: r0 };
      drawLoop(card);
    }
    la = null;
    dragOff();
    saveCards();
  };
  addEventListener('pointermove', e => {
    if (la != null && e.buttons === 0) endGut(e);
  }); // released somewhere we didn't hear about
  gut.onpointermove = e => {
    if (la == null) return;
    const r = rowAt(e.clientY);
    if (r !== r0) moved = true;
    if (!moved) return;
    card.loop = { a: Math.min(la, r), b: Math.max(la, r) };
    drawLoop(card);
  };
  gut.ondblclick = e => {
    e.stopPropagation();
    card.loop = { a: 0, b: BARS - 1 };
    drawLoop(card);
    saveCards();
  };
  el.querySelector('.cp').onclick = () =>
    navigator.clipboard.writeText(`#${id} "${card.name}" ${card.str}`);
  el.querySelector('.wv').onclick = async () => {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(wav(await render(card.steps, 2, true)));
    a.download = `amen-${id}-${card.name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${
      S.out
    }bpm.wav`;
    a.click();
  };
  card.rbtnReset = el.querySelector('.rs');
  card.rbtnReset.onclick = () => {
    if (!card.edited) return;
    ED.undo.push([{ card, steps: card.steps.map(plainE), sel: new Set(), edited: true }]);
    commitSteps(card, parse(card.orig));
    card.edited = false;
    card.sel = new Set();
    if (ED.card === card) clearSel();
    renderCard(card);
    card.cells.forEach(c => c.classList.add('landed'));
    saveCards();
  };
  card.pinned = !!pat.pinned;
  const pn = el.querySelector('.pn');
  const drawPin = () => {
    pn.classList.toggle('on', card.pinned);
    pn.title = card.pinned
      ? 'pinned: REROLL leaves this pattern where it is (click to unpin)'
      : 'pin: REROLL leaves this pattern where it is';
    el.classList.toggle('pinned', card.pinned);
  };
  drawPin();
  pn.onclick = () => {
    card.pinned = !card.pinned;
    drawPin();
    saveCards();
  };
  el.querySelector('.dl').onclick = () => {
    if (P && (P.card === card || P.shownCard === card)) stop();
    else if (P?.queued === card) unqueue();
    if (ED.card === card) clearSel();
    ED.undo.push({ del: card, next: el.nextElementSibling });
    if (ED.undo.length > 50) ED.undo.shift();
    el.remove();
    cards = cards.filter(c => c !== card);
    saveCards();
  };
  // clone: an editable copy (steps + loop region) inserted right after this card; reset on the copy returns to this moment
  el.querySelector('.cl').onclick = () => {
    const st = card.steps.map(plainE),
      nid = 'c' + Date.now().toString(36).slice(-5);
    const ne = makeCard(
      {
        steps: st,
        genes: {
          ...(card.genes || {}),
          eng: card.ro ? 'source' : card.genes?.eng || 'clone',
          of: card.ro ? 'original' : card.id,
        },
        orig: toStr(st),
        loop: [card.loop.a, card.loop.b],
      },
      nid,
    );
    el.after(ne);
    const nc = cards[cards.length - 1];
    nc.cells.forEach(c => c.classList.add('landed'));
    saveCards();
    ne.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  };
  // shuffle: re-roll just this slot. Same card object, so if it's playing it keeps playing the new pattern
  el.querySelector('.sh').onclick = () => {
    const np = generate((Math.random() * 2 ** 32) >>> 0);
    ED.undo.push([
      {
        card,
        steps: card.steps.map(plainE),
        sel: new Set(),
        edited: !!card.edited,
        genes: card.genes,
        orig: card.orig,
      },
    ]);
    if (ED.undo.length > 50) ED.undo.shift();
    if (ED.card === card) clearSel();
    commitSteps(card, annotateHalf(np.steps));
    card.genes = np.genes;
    card.orig = toStr(np.steps);
    card.edited = false;
    renderCard(card);
    card.cells.forEach(c => c.classList.add('landed'));
    saveCards();
  };
  renderCard(card);
  setupEdit(card);
  cards.push(card);
  return card.el;
}
function drawLoop(card) {
  const gw = card.el.querySelector('.gwrap'),
    rows = [...card.el.querySelectorAll('.grid .row')],
    br = card.el.querySelector('.lbr');
  if (!rows.length || !br) return;
  const g = gw.getBoundingClientRect(),
    t = rows[card.loop.a].getBoundingClientRect(),
    b = rows[card.loop.b].getBoundingClientRect();
  br.style.top = t.top - g.top + 'px';
  br.style.height = b.bottom - t.top + 'px';
  const full = card.loop.a === 0 && card.loop.b === BARS - 1;
  br.classList.toggle('full', full);
  rows.forEach((r, k) => r.classList.toggle('outloop', k < card.loop.a || k > card.loop.b));
}
/* one naming engine for every card (namer.js); it avoids names other cards already use */
function nameFor(card, steps) {
  const taken = new Set(cards.filter(o => o !== card && o.name).map(o => o.name));
  let nm = null;
  for (let salt = 0; salt < 12; salt++) {
    nm = nameEngine(steps, card.genes || {}, !!card.edited, salt);
    if (!taken.has(nm.name)) break;
  }
  return nm;
}
function sizeCells() {
  const c = document.querySelector('#cards .card:not(.ph)');
  if (!c) return;
  const g = c.querySelector('.grid'),
    gw = c.querySelector('.gwrap');
  const bounds = gw.getBoundingClientRect(),
    side = g.getBoundingClientRect().left - bounds.left,
    style = getComputedStyle(g),
    padding = parseFloat(style.paddingLeft) + parseFloat(style.paddingRight);
  // Fill the space beside the row controls, accounting for the fixed gaps between steps.
  const avail = bounds.width - side - padding - (SPB - 1) * 3,
    cw = Math.max(15, Math.min(30, Math.floor((avail / SPB) * 100) / 100)),
    r = document.documentElement.style;
  if (r.getPropertyValue('--cw') === cw + 'px') return;
  r.setProperty('--cw', cw + 'px');
  r.setProperty('--ch', Math.round(cw * 1.15) + 'px');
  r.setProperty('--cf', Math.max(8, Math.min(12, Math.round(cw * 0.46))) + 'px');
  cards.forEach(k => k.loop && drawLoop(k));
}
addEventListener('resize', () => requestAnimationFrame(sizeCells));
function renderCard(card, { reuseCells = false } = {}) {
  const el = card.el,
    steps = annotateHalf(card.steps);
  card.str = toStr(steps);
  const g = card.genes || {};
  const desc = [
    g.eng,
    g.tpl,
    g.op,
    g.of && 'from #' + g.of,
    (g.grp || []).join('/'),
    (g.orn || []).join(' '),
    card.edited && 'edited',
  ]
    .filter(Boolean)
    .join(' · ');
  const nm = card.ro
    ? {
        name: 'ORIGINAL',
        tags: card.preview ? ['the source break at its original speed'] : ['the source break, untouched', 'drag from it to copy steps into any pattern'],
      }
    : nameFor(card, steps);
  card.name = nm.name;
  el.querySelector('.nm').textContent = nm.name + (card.edited ? ' ✎' : '');
  if (!card.preview) el.querySelector('.rs').disabled = !card.edited;
  el.querySelector('.nm').title = [...nm.tags, desc, 'seed ' + (g.seed ?? '—')]
    .filter(Boolean)
    .join(' · ');
  const grid = el.querySelector('.grid');
  if (!reuseCells) {
    grid.replaceChildren();
    card.cells = [];
    card.cellKeys = [];
  }
  for (let b = 0; b < BARS; b++) {
    const row = reuseCells ? grid.children[b] : document.createElement('div');
    if (!reuseCells) row.className = 'row';
    for (let k = 0; k < SPB; k++) {
      const i = b * SPB + k,
        e = steps[i],
        voice = steps[voiceStart(steps, i)],
        cont = i > 0 && contig(steps[i - 1], e),
        joinLeft = k > 0 && cont,
        joinRight = k + 1 < SPB && contig(e, steps[i + 1]),
        label = e.h && halfLabelClass(steps, i);
      const className =
        'cell ' +
        (e.s < 0 ? 'rest' : '') +
        (voice.r ? ' rev' : '') +
        (e.x > 1 ? ' x' + e.x : '') +
        (e.p > 0 ? ' pu' : e.p < 0 ? ' pd' : '') +
        (e.h ? ' hs' : '') +
        (joinLeft ? ' join' : '') +
        (joinLeft && e.hc && voice.r ? ' rev-join' : '') +
        (!cont && k === 0 && i > 0 ? ' cut' : '') +
        (e.x > 1 ? ' rt' : '') +
        (joinRight ? ' joinR' : '') +
        (joinRight && steps[i + 1].hc && voice.r ? ' rev-joinR' : '');
      const title =
        (e.s < 0 ? 'rest' : `slice ${e.s} · ${hitsName(slices[e.s % N].hits)}`) +
        (e.x > 1
          ? ` · retrig ×${e.x} (${RT_NAME[e.x] || e.x + ' hits per 16th'}, ${Math.round(
              (60 / S.out / 4 / e.x) * 1000,
            )} ms each)`
          : '') +
        (e.h ? ' · half speed' : '') +
        (voice.r ? ' · reversed' : '') +
        (e.p ? ` · ${e.p > 0 ? '+' : ''}${e.p} st` : '') +
        ' · ' +
        (cont ? 'continues' : 'cut');
      // Include the joins and half-speed label, which can change with neighboring steps.
      const key = className + '|' + title + '|' + (label || '');
      if (reuseCells && card.cellKeys[i] === key) continue;

      const c = document.createElement('div');
      c.className = className;
      c.title = title;
      c.dataset.i = i;
      c.textContent = e.h ? '' : e.s < 0 ? '·' : e.s;
      if (e.s >= 0) {
        c.style.setProperty('--pc', posColor(e.s));
        c.style.setProperty('--pt', posText(e.s));
      }
      if (e.h) {
        drawHalfLabel(c, steps, i);
        if (voice.r) c.insertAdjacentHTML('beforeend', '<span class="reverse-run" aria-hidden="true"></span>');
      }
      if (e.x > 1) c.style.backgroundImage = rtBg(e.x);
      if (reuseCells) card.cells[i].replaceWith(c);
      else row.appendChild(c);
      card.cells[i] = c;
      card.cellKeys[i] = key;
    }
    if (reuseCells) continue;
    grid.appendChild(row);
    if (card.preview) continue;
    row.onmouseenter = () => card.rbtn[b].classList.add('hot');
    row.onmouseleave = () => card.rbtn[b].classList.remove('hot');
    row.onclick = () => {
      if (ED.eatClick) {
        ED.eatClick = false;
        return;
      }
      if (ED.suppress || card.sel?.size) return;
      launch(card, b);
    };
  }
  (card.sel || new Set()).forEach(i => card.cells[i].classList.add('sel'));
  if (card.loop) requestAnimationFrame(() => drawLoop(card));
  if (P && (P.shownCard || P.card) === card && card.nowI != null)
    card.cells[card.nowI]?.classList.add('now');
}
