'use strict';

/* ---------- marquee editing ----------
   Drag from an unused area of a card, or ⌘-drag outside the controls, to marquee-select steps.
   Drag the selection onto any card: swaps with what's there (same card or another loop). ⌥ while dropping: clone (source untouched).
   Esc / click elsewhere clears.  ⌘Z undoes. */
const ED = {
  card: null, mode: null, suppress: false, eatClick: false, undo: [], tgt: null, pendingLands: 0,
};
const rc = i => [Math.floor(i / SPB), i % SPB];
const plainE = e => ({ s: e.s, r: !!e.r, h: !!e.h, x: e.x || 1, p: e.p || 0, ...(e.v ? { v: e.v } : {}) });
function setupEdit(card) {}
function clearSel() {
  ED.anchor = null;
  if (ED.card) {
    ED.card.sel = new Set();
    ED.card.cells.forEach(c => c.classList.remove('sel'));
    ED.card.el.classList.remove('editing');
  }
  clearDrop();
  ED.card = null;
}
function clearDrop() {
  document
    .querySelectorAll('.cell.drop,.cell.dropbad')
    .forEach(c => c.classList.remove('drop', 'dropbad'));
}
function hit(x, y) {
  const c = document.elementFromPoint(x, y)?.closest?.('.card .grid .cell');
  if (!c) return null;
  const card = cards.find(k => k.el.contains(c));
  return card ? { card, i: +c.dataset.i } : null;
}
/* near a grid, always resolve to the nearest step (gaps and margins included) so there's no in-between position */
function nearHit(x, y, margin = 28) {
  let best = null,
    bd = 1e9;
  for (const card of cards) {
    const g = card.el.querySelector('.grid').getBoundingClientRect();
    if (x < g.left - margin || x > g.right + margin || y < g.top - margin || y > g.bottom + margin)
      continue;
    card.cells.forEach((c, i) => {
      const r = c.getBoundingClientRect(),
        d = (x - (r.left + r.width / 2)) ** 2 + (y - (r.top + r.height / 2)) ** 2;
      if (d < bd) {
        bd = d;
        best = { card, i };
      }
    });
  }
  return best;
}
function shiftSel(sel, d) {
  const out = [];
  for (const i of sel) {
    const [r, c] = rc(i),
      r2 = r + d[0],
      c2 = c + d[1];
    if (r2 < 0 || r2 >= BARS || c2 < 0 || c2 >= SPB) return null;
    out.push(r2 * SPB + c2);
  }
  return out;
}
function commitSteps(card, p) {
  card.steps.splice(0, card.steps.length, ...p);
  card.edited = true;
}
/* the edit itself, as a pure function of the original steps */
function editCore(oa, ob, same, src, tgt, clone) {
  const pa = oa.map(e => ({ ...e })),
    pb = same ? pa : ob.map(e => ({ ...e }));
  src.forEach((s, k) => (pb[tgt[k]] = { ...oa[s] }));
  if (!clone) {
    if (same) {
      const S = new Set(src),
        T = new Set(tgt),
        freed = src.filter(i => !T.has(i)),
        displaced = tgt.filter(i => !S.has(i));
      freed.forEach((i, k) => (pa[i] = { ...oa[displaced[k]] }));
    } else src.forEach((s, k) => (pa[s] = { ...ob[tgt[k]] }));
  }
  return { pa, pb };
}
/* LIVE: show (and play) the result under the pointer before letting go; ED.orig holds every touched card's real steps */
function previewRestore(render = true) {
  if (!ED.orig) return;
  for (const [c, st] of ED.orig) {
    c.steps.splice(0, c.steps.length, ...st.map(e => ({ ...e })));
    if (render) {
      renderCard(c);
      c.cells.forEach(x => x.classList.remove('sel'));
    }
  }
}
function previewApply() {
  if (!UI.live || ED.mode !== 'drag') return;
  const T = ED.tgt,
    clone = !!ED.g?.alt,
    key = T ? T.card.id + ':' + T.tg.join(',') + ':' + clone : 'none';
  if (key === ED.pkey) return;
  ED.pkey = key;
  const A = ED.card;
  previewRestore(false);
  if (T) {
    if (!ED.orig.has(T.card)) ED.orig.set(T.card, T.card.steps.map(plainE));
    const { pa, pb } = editCore(
      ED.orig.get(A),
      ED.orig.get(T.card),
      T.card === A,
      T.src,
      T.tg,
      clone,
    );
    A.steps.splice(0, A.steps.length, ...pa);
    if (T.card !== A) T.card.steps.splice(0, T.card.steps.length, ...pb);
  }
  for (const c of ED.orig.keys()) {
    renderCard(c);
    c.cells.forEach(x => x.classList.remove('sel'));
  }
  if (T) T.tg.forEach(i => T.card.cells[i].classList.add('drop'));
  else syncLift();
}
function applyEdit(A, src, B, tgt, clone) {
  const oa = A.steps.map(plainE),
    ob = B === A ? oa : B.steps.map(plainE);
  ED.undo.push(
    [...new Set([A, B])]
      .filter(c => !c.ro)
      .map(c => ({
        card: c,
        steps: c === A ? oa : ob,
        sel: new Set(c.sel || []),
        edited: !!c.edited,
      })),
  );
  if (ED.undo.length > 50) ED.undo.shift();
  const pa = oa.map(e => ({ ...e })),
    pb = B === A ? pa : ob.map(e => ({ ...e }));
  src.forEach((s, k) => (pb[tgt[k]] = { ...oa[s] })); // the selection lands on the target
  if (!clone) {
    if (B === A) {
      const S = new Set(src),
        T = new Set(tgt),
        freed = src.filter(i => !T.has(i)),
        displaced = tgt.filter(i => !S.has(i));
      freed.forEach((i, k) => (pa[i] = { ...oa[displaced[k]] }));
    } else src.forEach((s, k) => (pa[s] = { ...ob[tgt[k]] })); // swap between loops
  }
  if (!A.ro && (A !== B || !clone)) commitSteps(A, pa);
  commitSteps(B, pb);
  A.sel = new Set();
  B.sel = new Set(tgt);
  ED.anchor = { card: B, i: Math.min(...tgt) };
  [...new Set([A, B])].forEach(renderCard);
  ED.card = B;
  B.el.classList.add('editing');
  if (A !== B) A.el.classList.remove('editing');
  saveCards();
}
/* ---- buttery drag: an opaque lifted copy that springs after the pointer and snaps onto the drop spot ---- */
function ghostOf(card, idx) {
  // clone the given steps into a fixed-position block; returns {el,x,y}
  const rects = idx.map(i => card.cells[i].getBoundingClientRect()),
    x = Math.min(...rects.map(r => r.left)),
    y = Math.min(...rects.map(r => r.top));
  const included = new Set(idx);
  const g = document.createElement('div');
  g.className = 'ghost';
  idx.forEach((i, k) => {
    const c = card.cells[i].cloneNode(true),
      r = rects[k];
    c.classList.remove('sel', 'drop', 'now', 'pulse', 'pulseBar', 'lifted', 'cut');
    c.classList.toggle('join', i % SPB !== 0 && included.has(i - 1));
    c.classList.toggle('joinR', (i + 1) % SPB !== 0 && included.has(i + 1));
    if (!included.has(i - 1)) c.classList.remove('rev-join');
    if (!included.has(i + 1)) c.classList.remove('rev-joinR');
    if (card.steps[i].h) {
      c.querySelector('.hn')?.remove();
      drawHalfLabel(c, card.steps, i, included);
    }
    Object.assign(c.style, {
      position: 'absolute',
      left: r.left - x + 'px',
      top: r.top - y + 'px',
      width: r.width + 'px',
      height: r.height + 'px',
      margin: 0,
    });
    g.appendChild(c);
  });
  document.body.appendChild(g);
  return { el: g, x, y };
}
function topLeft(card, idx) {
  const r = idx.map(i => card.cells[i].getBoundingClientRect());
  return [Math.min(...r.map(q => q.left)), Math.min(...r.map(q => q.top))];
}
/* while dragging: ⌥ held = clone, so the original stays where it was; otherwise its spot shows empty */
function syncLift() {
  if (ED.mode !== 'drag' || !ED.g || !ED.card) return;
  const clone = ED.g.alt;
  ED.g.src.forEach(i => ED.card.cells[i].classList.toggle('lifted', !clone));
  document.body.style.setProperty('--dragcur', clone ? 'copy' : 'grabbing');
  ED.g.el.classList.toggle('cloning', clone);
}
addEventListener('keydown', e => {
  if (e.key === 'Alt' && ED.g) {
    ED.g.alt = true;
    syncLift();
    previewApply();
  }
});
addEventListener('keyup', e => {
  if (e.key === 'Alt' && ED.g) {
    ED.g.alt = !!ED.card?.ro;
    syncLift();
    previewApply();
  }
});
/* the playhead also lights the matching slice in the dragged copy: whichever spot currently holds that slice's sound
   (the live-preview target if there is one, otherwise where the selection came from) */
function ghostNow(card, i) {
  const G = ED.g;
  if (!G || ED.mode !== 'drag') return;
  const T = ED.tgt,
    live = UI.live && T && ED.pkey && ED.pkey !== 'none';
  const k = live
    ? T.card === card
      ? T.tg.indexOf(i)
      : -1
    : ED.card === card
    ? G.src.indexOf(i)
    : -1;
  [...G.el.children].forEach((c, j) => c.classList.toggle('now', j === k));
  if (k >= 0 && i % 4 === 0) {
    const c = G.el.children[k];
    c.classList.remove('pulse', 'pulseBar');
    void c.offsetWidth;
    c.classList.add(i % SPB === 0 ? 'pulseBar' : 'pulse');
  }
}
function springLoop(G) {
  // critically-damped follow: smooth but never laggy
  if (!G || G.dead) return;
  G.x += (G.tx - G.x) * 0.38;
  G.y += (G.ty - G.y) * 0.38;
  G.s += (G.ts - G.s) * 0.3;
  G.el.style.transform = `translate3d(${G.x}px,${G.y}px,0) scale(${G.s})`;
  if (G.active || Math.abs(G.tx - G.x) + Math.abs(G.ty - G.y) > 0.3)
    G.raf = requestAnimationFrame(() => springLoop(G));
  else {
    G.dead = true;
    G.done?.();
  }
}
function fly(card, idx, from, to, ms = 240) {
  // animate a copy of cells from one spot to another, then remove it
  const g = ghostOf(card, idx);
  g.el.classList.add('flying');
  g.el.style.transform = `translate3d(${from[0]}px,${from[1]}px,0)`;
  requestAnimationFrame(() => {
    g.el.style.transition = `transform ${ms}ms cubic-bezier(.2,.8,.2,1)`;
    g.el.style.transform = `translate3d(${to[0]}px,${to[1]}px,0)`;
  });
  setTimeout(() => g.el.remove(), ms + 30);
  return g;
}
function startMarquee({ clientX, clientY }, command, add = false) {
  const base = add && ED.card ? { card: ED.card, sel: new Set(ED.card.sel) } : null;
  if (!base) clearSel();
  ED.mode = 'marquee';
  ED.x0 = clientX;
  ED.y0 = clientY;
  ED.base = base;
  ED.marqueeClick = command;
  ED.box = document.createElement('div');
  ED.box.className = 'marq';
  document.body.appendChild(ED.box);
  dragOn('crosshair');
}
/* select exactly one step (what a plain click or ⌘-click on a step does) */
function selectOne(h) {
  if (ED.card && ED.card !== h.card) clearSel();
  ED.card = h.card;
  h.card.sel = new Set([h.i]);
  ED.anchor = { card: h.card, i: h.i };
  h.card.cells.forEach((c, k) => c.classList.toggle('sel', k === h.i));
  h.card.el.classList.add('editing');
}
/* pick up the card's selection, grabbed at step h; ⌥ (or the read-only ORIGINAL) clones instead of moving */
function startDrag(e, h) {
  ED.mode = 'drag';
  ED.grab = h.i;
  ED.tgt = null;
  dragOn(e.altKey || h.card.ro ? 'copy' : 'grabbing');
  const src = [...h.card.sel].sort((a, b) => a - b),
    g = ghostOf(h.card, src);
  g.el.style.left = g.el.style.top = '0px';
  ED.g = {
    el: g.el,
    x: g.x,
    y: g.y,
    tx: g.x,
    ty: g.y,
    s: 1,
    ts: 1.06,
    ox: e.clientX - g.x,
    oy: e.clientY - g.y,
    home: [g.x, g.y],
    src,
    active: true,
  };
  ED.g.alt = e.altKey || !!h.card.ro;
  ED.orig = new Map([[h.card, h.card.steps.map(plainE)]]);
  ED.pkey = null;
  syncLift();
  springLoop(ED.g);
}
const reorderHeader = '#cards > .card > .top'; // ORIGINAL included: it lands wherever it was added, so it moves like any card
document.addEventListener(
  'pointerdown',
  e => {
    if (e.button !== 0) return;
    if (e.target.closest('#selbar')) return;
    const inChrome = e.target.closest('header,#pattern-tools,#dj,#newtile,input,button:not(.rp)');
    if (e.metaKey && !inChrome) {
      // marquee, from anywhere
      e.preventDefault();
      e.stopPropagation();
      startMarquee(e, true, e.shiftKey);
      return;
    }
    const h = e.target.closest('.card .grid') ? hit(e.clientX, e.clientY) : null;
    if (h && e.shiftKey && ED.card === h.card && ED.anchor?.card === h.card) {
      // shift-click: rectangle from the anchor to this step
      e.preventDefault();
      e.stopPropagation();
      const [r0, c0] = rc(ED.anchor.i),
        [rr, c1] = rc(h.i),
        r1 = UI.oneRow ? r0 : rr,
        sel = new Set();
      for (let r = Math.min(r0, r1); r <= Math.max(r0, r1); r++)
        for (let c = Math.min(c0, c1); c <= Math.max(c0, c1); c++) sel.add(r * SPB + c);
      h.card.sel = sel;
      h.card.cells.forEach((c, k) => c.classList.toggle('sel', sel.has(k)));
      ED.eatClick = true;
      return;
    }
    if (h && e.altKey && !(ED.card === h.card && h.card.sel?.has(h.i))) {
      // ⌥-drag an unselected step: take just that step and clone it, no need to select it first
      e.preventDefault();
      e.stopPropagation();
      selectOne(h);
      startDrag(e, h);
      return;
    }
    if (h && ED.card === h.card && h.card.sel?.has(h.i)) {
      // start dragging the selection
      e.preventDefault();
      e.stopPropagation();
      startDrag(e, h);
      return;
    }
    if (ED.card && !e.target.closest('.rp')) {
      clearSel();
      if (e.target.closest('.card .grid')) ED.eatClick = true;
    } // a click that clears shouldn't also start playback
    if (e.target.closest('#cards > .card:not(.ph)') &&
        !e.target.closest('button, .lgut, ' + reorderHeader) && e.pointerType !== 'touch' &&
        !e.metaKey && !e.shiftKey && !e.altKey && !e.ctrlKey) {
      const { clientX, clientY, pointerId } = e;
      ED.pendingMarquee = { clientX, clientY, pointerId };
    }
  },
  true,
);
addEventListener('pointermove', e => {
  const start = ED.pendingMarquee;
  if (start && e.pointerId === start.pointerId) {
    if (!(e.buttons & 1)) ED.pendingMarquee = null;
    else if (Math.hypot(e.clientX - start.clientX, e.clientY - start.clientY) >= 4) {
      ED.pendingMarquee = null;
      // The marquee suppresses playback itself, so leave the next click alone.
      ED.eatClick = false;
      startMarquee(start, false);
    }
  }
  if (ED.mode === 'marquee') {
    const x0 = Math.min(ED.x0, e.clientX),
      x1 = Math.max(ED.x0, e.clientX),
      y0 = Math.min(ED.y0, e.clientY),
      y1 = Math.max(ED.y0, e.clientY);
    Object.assign(ED.box.style, {
      left: x0 + 'px',
      top: y0 + 'px',
      width: x1 - x0 + 'px',
      height: y1 - y0 + 'px',
    });
    let best = null,
      bestN = 0;
    const hits = new Map();
    for (const c of cards) {
      const set = new Set();
      c.cells.forEach((el, k) => {
        const r = el.getBoundingClientRect();
        if (r.right > x0 && r.left < x1 && r.bottom > y0 && r.top < y1) set.add(k);
      });
      hits.set(c, set);
      if (set.size > bestN) {
        bestN = set.size;
        best = c;
      }
    }
    if (best && UI.oneRow) {
      const st = nearHit(ED.x0, ED.y0, 9999),
        row = st && st.card === best ? rc(st.i)[0] : rc(Math.min(...hits.get(best)))[0];
      if (ED.base && ED.base.card === best && ED.base.sel.size)
        ED.rowLock = rc([...ED.base.sel][0])[0];
      else ED.rowLock = row;
      hits.set(best, new Set([...hits.get(best)].filter(k => rc(k)[0] === ED.rowLock)));
    }
    if (ED.base && (!best || best === ED.base.card)) {
      best = ED.base.card;
      ED.base.sel.forEach(k => hits.get(best).add(k));
    }
    if (ED.card && ED.card !== best) {
      ED.card.sel = new Set();
      ED.card.cells.forEach(c => c.classList.remove('sel'));
      ED.card.el.classList.remove('editing');
    }
    ED.card = best;
    if (best) {
      best.sel = hits.get(best);
      best.cells.forEach((c, k) => c.classList.toggle('sel', best.sel.has(k)));
      best.el.classList.add('editing');
    }
  } else if (ED.mode === 'drag') {
    const alt = e.altKey || !!ED.card?.ro;
    document.body.style.setProperty('--dragcur', alt ? 'copy' : 'grabbing');
    clearDrop();
    ED.tgt = null;
    if (ED.g) {
      ED.g.tx = e.clientX - ED.g.ox;
      ED.g.ty = e.clientY - ED.g.oy;
      ED.g.ts = 1.06;
      if (ED.g.alt !== alt) {
        ED.g.alt = alt;
        syncLift();
      }
    }
    const h = nearHit(e.clientX, e.clientY);
    if (!h || h.card.ro) {
      previewApply();
      return;
    }
    const [a, b] = rc(ED.grab),
      [c, d] = rc(h.i),
      src = [...ED.card.sel].sort((x, y) => x - y);
    // best fit: clamp the offset so the whole selection stays on the grid (e.g. 4 rows dropped on row 2 → lands on rows 1–4)
    const R = src.map(i => rc(i)[0]),
      C = src.map(i => rc(i)[1]),
      cl = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
    const dr = cl(c - a, -Math.min(...R), BARS - 1 - Math.max(...R)),
      dc = cl(d - b, -Math.min(...C), SPB - 1 - Math.max(...C)),
      tg = shiftSel(src, [dr, dc]);
    if (h.card === ED.card && !dr && !dc) {
      previewApply();
      return;
    }
    ED.tgt = { card: h.card, tg, src };
    tg.forEach(i => h.card.cells[i].classList.add('drop'));
    if (ED.g) {
      const [x, y] = topLeft(h.card, tg);
      ED.g.tx = x;
      ED.g.ty = y;
      ED.g.ts = 1.0;
    } // magnetic snap onto the drop spot
    previewApply();
  }
});
const edEnd = e => {
  const pm = ED.pendingMarquee;
  if (pm?.pointerId === e.pointerId) {
    ED.pendingMarquee = null;
    // a plain click (no drag) on a step selects it, the same as ⌘-click; clicks between steps take the nearest one
    if (!ED.mode && e.type === 'pointerup' && Math.hypot(e.clientX - pm.clientX, e.clientY - pm.clientY) < 4) {
      const onGrid = document.elementFromPoint(pm.clientX, pm.clientY)?.closest('.card .grid'),
        h = onGrid && nearHit(pm.clientX, pm.clientY, 0);
      if (h) {
        selectOne(h);
        ED.eatClick = true; // the grid's click would otherwise start playback
      }
    }
  }
  if (!ED.mode) return;
  if (ED.mode === 'marquee') {
    ED.box?.remove();
    ED.box = null;
    if (ED.marqueeClick && Math.abs(e.clientX - ED.x0) < 4 && Math.abs(e.clientY - ED.y0) < 4) {
      // ⌘-click: select that one step (⌘⇧-click toggles it in/out of the selection)
      const h = hit(e.clientX, e.clientY);
      if (h) {
        const add =
          ED.base &&
          ED.base.card === h.card &&
          !(UI.oneRow && ED.base.sel.size && rc([...ED.base.sel][0])[0] !== rc(h.i)[0]);
        if (ED.card && ED.card !== h.card) clearSel();
        const sel = add ? new Set(ED.base.sel) : new Set();
        sel.has(h.i) ? sel.delete(h.i) : sel.add(h.i);
        ED.card = h.card;
        h.card.sel = sel;
        ED.anchor = { card: h.card, i: h.i };
        h.card.cells.forEach((c, k) => c.classList.toggle('sel', sel.has(k)));
        h.card.el.classList.toggle('editing', sel.size > 0);
      }
    } else if (ED.card?.sel?.size) {
      const g = nearHit(ED.x0, ED.y0, 9999);
      ED.anchor = { card: ED.card, i: g && g.card === ED.card ? g.i : Math.min(...ED.card.sel) };
    } // marquee: anchor at the corner you started from
    if (ED.card && !ED.card.sel.size) clearSel();
  } else if (ED.mode === 'drag') {
    clearDrop();
    const G = ED.g,
      A = ED.card,
      T = ED.tgt;
    ED.g = null;
    if (G) G.active = false;
    const wasLive = ED.orig && ED.pkey != null && ED.pkey !== 'none';
    if (ED.fly && !T) {
      ED.fly.el.remove();
      clearTimeout(ED.fly.t);
      ED.fly = null;
    } // cancelled mid-flight: drop the fly-back
    if (ED.orig) {
      const touched = [...ED.orig.keys()];
      previewRestore(false);
      ED.orig = null;
      ED.pkey = null;
      if (!T && wasLive !== undefined) touched.forEach(renderCard);
    }
    if (T && wasLive) {
      // already showing the result: just commit it and flash
      const clone = !!G?.alt,
        B = T.card,
        srcPos = topLeft(A, T.src),
        tgtPos = topLeft(B, T.tg);
      applyEdit(A, T.src, B, T.tg, clone);
      T.tg.forEach(i => B.cells[i].classList.add('landed'));
      if (G) {
        G.dead = true;
        G.el.remove();
      }
    } else if (T) {
      const clone = e.altKey || !!A.ro,
        B = T.card,
        srcPos = topLeft(A, T.src),
        tgtPos = topLeft(B, T.tg);
      // 1) commit flash: the copy settles onto the target and pops
      if (G) {
        G.tx = tgtPos[0];
        G.ty = tgtPos[1];
        G.ts = 1;
        G.x = tgtPos[0];
        G.y = tgtPos[1];
        G.s = 1;
        G.el.style.transform = `translate3d(${G.x}px,${G.y}px,0)`;
        G.el.querySelectorAll('.cell').forEach(c => c.classList.add('landed'));
      }
      const FLASH = 170,
        FLY = 230;
      if (clone) A.cells.forEach(c => c.classList.remove('lifted'));
      // 2) then the swap: what was there flies back to where the selection came from
      if (!clone) setTimeout(() => fly(B, T.tg, tgtPos, srcPos, FLY), FLASH - 40);
      ED.pendingLands++;
      setTimeout(
        () => {
          try {
            applyEdit(A, T.src, B, T.tg, clone);
          } finally {
            ED.pendingLands--;
            if (G) {
              G.dead = true;
              G.el.remove();
            }
          }
        },
        clone ? FLASH : FLASH - 40 + FLY,
      );
    } else if (G) {
      G.tx = G.home[0];
      G.ty = G.home[1];
      G.ts = 1;
      ED.pendingLands++;
      G.done = () => {
        ED.pendingLands--;
        G.el.remove();
        A?.cells.forEach(c => c.classList.remove('lifted'));
      };
    }
    ED.tgt = null;
  }
  ED.mode = null;
  dragOff();
  ED.suppress = true;
  setTimeout(() => (ED.suppress = false), 0);
};
/* ---- card rearranging: drag a card by its header onto another card to swap the two ---- */
(() => {
  let D = null;
  const main = $('#cards');
  document.addEventListener('pointerdown', e => {
    if (e.button || e.metaKey || e.shiftKey || D) return;
    const top = e.target.closest(reorderHeader);
    if (!top || e.target.closest('button')) return;
    const el = top.parentElement;
    D = { el, x0: e.clientX, y0: e.clientY, on: false, tg: null };
  });
  const start = () => {
    const el = D.el,
      r = el.getBoundingClientRect();
    D.on = true;
    D.ox = D.x0 - r.left;
    D.oy = D.y0 - r.top;
    getSelection().removeAllRanges();
    const ph = document.createElement('div');
    ph.className = 'card ph';
    ph.style.height = r.height + 'px';
    el.before(ph);
    D.ph = ph;
    Object.assign(el.style, {
      position: 'fixed',
      left: r.left + 'px',
      top: r.top + 'px',
      width: r.width + 'px',
      zIndex: 30,
      pointerEvents: 'none',
      margin: 0,
    });
    el.classList.add('lifting');
    dragOn('grabbing');
  };
  const setTg = t => {
    if (t === D.tg) return;
    D.tg?.classList.remove('swaptg');
    D.tg = t;
    t?.classList.add('swaptg');
  };
  addEventListener('pointermove', e => {
    if (!D) return;
    if (e.buttons === 0) {
      end();
      return;
    }
    if (!D.on) {
      if (Math.hypot(e.clientX - D.x0, e.clientY - D.y0) < 6) return;
      start();
    }
    D.el.style.left = e.clientX - D.ox + 'px';
    D.el.style.top = e.clientY - D.oy + 'px';
    // aim with the lifted card's centre, not the pointer (you grab it by the header)
    const lr = D.el.getBoundingClientRect(),
      t = document
        .elementFromPoint(lr.left + lr.width / 2, lr.top + lr.height / 2)
        ?.closest('#cards>.card');
    setTg(t && t !== D.ph ? t : null);
  });
  const clean = el => {
    el.classList.remove('lifting');
    [
      'position',
      'left',
      'top',
      'width',
      'zIndex',
      'pointerEvents',
      'margin',
      'transition',
      'transform',
    ].forEach(k => (el.style[k] = ''));
  };
  const end = () => {
    if (!D) return;
    const d = D;
    D = null;
    if (!d.on) return;
    dragOff();
    const tg = d.tg;
    tg?.classList.remove('swaptg');
    const dest = (tg || d.ph).getBoundingClientRect(),
      ease = '.18s cubic-bezier(.2,.8,.2,1)';
    if (tg) {
      // the target flies to where the dragged card came from
      const from = tg.getBoundingClientRect(),
        mark = document.createComment('');
      tg.replaceWith(mark);
      d.ph.replaceWith(tg);
      mark.replaceWith(d.ph); // DOM: target → source slot, placeholder → target slot
      const now = tg.getBoundingClientRect();
      tg.style.transition = 'none';
      tg.style.transform = `translate(${from.left - now.left}px,${from.top - now.top}px)`;
      tg.style.zIndex = 20;
      requestAnimationFrame(() => {
        tg.style.transition = 'transform ' + ease;
        tg.style.transform = '';
      });
    }
    d.el.style.transition = `left ${ease},top ${ease}`;
    d.el.style.left = dest.left + 'px';
    d.el.style.top = dest.top + 'px';
    setTimeout(() => {
      d.ph.replaceWith(d.el);
      clean(d.el);
      if (tg) {
        tg.style.transition = '';
        tg.style.transform = '';
        tg.style.zIndex = '';
      }
      cards.forEach(k => drawLoop(k));
      saveCards();
    }, 190);
  };
  addEventListener('pointerup', end);
  addEventListener('pointercancel', end);
  addEventListener('blur', end);
})();
/* ---- selection toolbar: edits applied to the selected steps, all undoable ---- */
function editSel(fn) {
  const c = ED.card;
  if (!c?.sel?.size || c.ro) return;
  const old = c.steps.map(plainE);
  ED.undo.push([{ card: c, steps: old, sel: new Set(c.sel), edited: !!c.edited }]);
  if (ED.undo.length > 50) ED.undo.shift();
  const p = old.map(x => ({ ...x })),
    idx = [...c.sel].sort((a, b) => a - b),
    selection = fn(p, idx, old);
  if (selection) {
    c.sel = new Set(selection);
    ED.anchor = { card: c, i: selection[0] };
  }
  commitSteps(c, p);
  renderCard(c);
  (selection || idx).forEach(i => c.cells[i].classList.add('landed'));
  c.el.classList.add('editing');
  saveCards();
  placeBar(true);
}
const selectedVoices = (steps, indices) => [...new Set(indices
  .filter(i => steps[i].s >= 0)
  .map(i => voiceStart(steps, i)))];
function adjustLevel(steps, indices, delta) {
  annotateHalf(steps);
  for (const i of selectedVoices(steps, indices)) {
    const level = steps[i].v || 0;
    if (!delta) delete steps[i].v;
    else if (delta > 0 && level < 12) steps[i].v = Math.min(12, level + delta);
    else if (delta < 0 && level > -60) steps[i].v = Math.max(-60, level + delta);
  }
}
const OPS = {
  regen: (p, ix) => {
    const q = regenSel(p, ix);
    ix.forEach(i => (p[i] = q[i]));
  },
  rev: (p, ix) => {
    annotateHalf(p);
    const starts = selectedVoices(p, ix);
    const reverse = !starts.every(i => p[i].r);
    for (const i of starts)
      for (let j = i; j < i + (p[i].hlen || 1); j++) p[j].r = reverse;
  },
  pup: (p, ix, o, big) =>
    ix.forEach(i => {
      if (p[i].s >= 0) p[i].p = Math.min(24, (p[i].p || 0) + (big ? 12 : 1));
    }),
  pdn: (p, ix, o, big) =>
    ix.forEach(i => {
      if (p[i].s >= 0) p[i].p = Math.max(-24, (p[i].p || 0) - (big ? 12 : 1));
    }),
  vup: (p, ix, o, big) => adjustLevel(p, ix, big ? 6 : 1),
  vdn: (p, ix, o, big) => adjustLevel(p, ix, big ? -6 : -1),
  vreset: (p, ix) => adjustLevel(p, ix, 0),
  half: (p, ix) => {
    const live = ix.filter(i => p[i].s >= 0);
    if (!live.length) return;
    annotateHalf(p);
    const withVoice = (s, voice, h) => ({ ...ev(s), h, r: !!voice.r, p: voice.p || 0, ...(voice.v ? { v: voice.v } : {}) });
    if (live.every(i => p[i].h)) {
      for (const i of selectedVoices(p, live)) {
        const voice = p[i];
        for (let k = 0; k < voice.hlen; k++) p[i + k] = withVoice(voice.s + k, voice, false);
      }
      return;
    }
    if (ix.length === 1) {
      const i = ix[0],
        start = (i + 1) % SPB === 0 ? i - 1 : i,
        voice = p[i];
      p[start] = withVoice(voice.s, voice, true);
      p[start + 1] = withVoice(voice.s, voice, true);
      return [start, start + 1];
    }
    // A disjoint selection stretches each span independently.
    for (let a = 0; a < ix.length;) {
      let end = a + 1;
      while (end < ix.length && ix[end] === ix[end - 1] + 1) end++;
      const first = ix.slice(a, end).find(i => p[i].s >= 0);
      if (first != null) {
        const s = p[first].s, voice = p[voiceStart(p, first)];
        for (let k = a; k < end; k++) p[ix[k]] = withVoice(s + Math.floor((k - a) / 2), voice, true);
      }
      a = end;
    }
  },
  x1: (p, ix) => ix.forEach(i => (p[i].x = 1)),
  x2: (p, ix) =>
    ix.forEach(i => {
      if (p[i].s >= 0) {
        p[i].x = 2;
        p[i].h = false;
      }
    }),
  x3: (p, ix) =>
    ix.forEach(i => {
      if (p[i].s >= 0) {
        p[i].x = 3;
        p[i].h = false;
      }
    }),
  x4: (p, ix) =>
    ix.forEach(i => {
      if (p[i].s >= 0) {
        p[i].x = 4;
        p[i].h = false;
      }
    }),
  del: (p, ix) => ix.forEach(i => (p[i] = { s: -1, r: false, h: false, x: 1, p: 0 })),
};
/* Type one slice number to start a run, or one number per selected step. */
(() => {
  const inp = $('#selbar .sb-in');
  const bad = () => {
    inp.classList.remove('bad');
    void inp.offsetWidth;
    inp.classList.add('bad');
  };
  const vt = $('#selbar .sb-vt'),
    drawV = () => {
      $('#selbar').classList.toggle('vals', !!UI.vals);
      vt.textContent = 'EDIT ' + (UI.vals ? '◂' : '▸');
      vt.setAttribute('aria-expanded', String(!!UI.vals));
      vt.classList.toggle('on', !!UI.vals);
    };
  drawV();
  vt.addEventListener('click', e => {
    e.stopPropagation();
    UI.vals = !UI.vals;
    saveUI();
    drawV();
    placeBar(true);
    if (UI.vals) {
      inp.focus();
      inp.select();
    }
  });
  inp.addEventListener('input', () => {
    inp.style.width = Math.max(4, inp.value.length + 2) + 'ch';
    inp.classList.remove('bad');
  });
  inp.addEventListener('keydown', e => {
    e.stopPropagation();
    if (e.key === 'Escape') {
      inp.blur();
      placeBar(true);
      return;
    }
    if (e.key !== 'Enter') return;
    e.preventDefault();
    const c = ED.card;
    if (!c?.sel?.size || c.ro) return;
    const input = inp.value.trim();
    if (!/^\d+(?:\s+\d+)*$/.test(input)) return bad();
    const values = input.split(/\s+/).map(Number);
    const n = c.sel.size;
    if ((values.length !== 1 && values.length !== n) || values.some(s => s >= N)) return bad();
    editSel((p, ix) =>
      ix.forEach((i, k) => {
        const s = values.length === 1 ? (values[0] + k) % N : values[k];
        if (p[i].s < 0) p[i] = ev(s);
        else p[i].s = s;
      }),
    );
    inp.blur();
    placeBar(true);
  });
})();
$('#selbar').addEventListener('click', e => {
  const b = e.target.closest('button');
  if (!b) return;
  const op = OPS[b.dataset.op];
  if (op) editSel((p, ix, o) => op(p, ix, o, e.shiftKey));
});
const repeatSelect = $('#sb-repeat');
repeatSelect.addEventListener('change', () => {
  const op = OPS['x' + repeatSelect.value];
  if (op) editSel(op);
});
let barKey = '',
  barLayoutDirty = true;
function positionBar(bar, card) {
  const rects = [...card.sel].map(i => card.cells[i].getBoundingClientRect()),
    x0 = Math.min(...rects.map(r => r.left)),
    x1 = Math.max(...rects.map(r => r.right)),
    y0 = Math.min(...rects.map(r => r.top)),
    y1 = Math.max(...rects.map(r => r.bottom)),
    edge = 8,
    gap = 10,
    bottom = Math.min(innerHeight, $('#dock').getBoundingClientRect().top) - edge;
  const out = y1 <= edge || y0 >= bottom || x1 <= edge || x0 >= innerWidth - edge;
  bar.classList.toggle('offscreen', out);
  if (out) return;
  const w = bar.offsetWidth,
    h = bar.offsetHeight,
    cx = (Math.max(edge, x0) + Math.min(innerWidth - edge, x1)) / 2,
    left = Math.max(edge, Math.min(innerWidth - w - edge, cx - w / 2)),
    aboveTop = y0 - h - gap,
    belowTop = y1 + gap,
    below = aboveTop < edge && (belowTop + h <= bottom || bottom - y1 > y0 - edge),
    top = Math.max(edge, Math.min(bottom - h, below ? belowTop : aboveTop));
  bar.style.left = left + 'px';
  bar.style.top = top + 'px';
  bar.style.setProperty('--ax', Math.max(10, Math.min(w - 10, cx - left)) + 'px');
  bar.classList.toggle('below', below);
}
function placeBar(force) {
  const bar = $('#selbar'),
    c = ED.card;
  // Keep the bar hidden until the selection has landed, including non-live swaps.
  const hide = !c || c.ro || !c.sel?.size || ED.mode || ED.pendingLands || !cards.includes(c);
  const key = hide ? 'hidden' : [c.id, [...c.sel].join('.'), c.str].join('|');
  if (!force && key === barKey) {
    if (!hide && barLayoutDirty) {
      positionBar(bar, c);
      barLayoutDirty = false;
    }
    return;
  }
  barKey = key;
  if (hide) {
    bar.classList.remove('show');
    return;
  }
  bar.classList.toggle('one', c.sel.size === 1); // Show the slice field directly for a single step.
  bar.classList.add('show');
  // reflect the selection's current state
  const indices = [...c.sel],
    st = indices.map(i => c.steps[i]).filter(e => e.s >= 0),
    voices = selectedVoices(c.steps, indices).map(i => c.steps[i]),
    ps = [...new Set(st.map(e => e.p || 0))],
    xs = [...new Set(st.map(e => e.x || 1))],
    levels = [...new Set(voices.map(e => e.v || 0))];
  const inp = bar.querySelector('.sb-in');
  if (document.activeElement !== inp) {
    inp.value = st.length === indices.length
      ? indices.sort((a, b) => a - b).map(i => c.steps[i].s).join(' ')
      : '';
    inp.style.width = Math.max(4, inp.value.length + 2) + 'ch';
    inp.classList.remove('bad');
  }
  bar.querySelector('.sb-p').textContent = ps.length === 1 ? (ps[0] > 0 ? '+' : '') + ps[0] + ' st' : ps.length ? '~ st' : '— st';
  const gain = bar.querySelector('[data-op=vreset]');
  const levelText = levels.length === 1 ? `${levels[0] > 0 ? '+' : ''}${levels[0]} dB` : levels.length ? '~ dB' : '— dB';
  gain.textContent = levelText;
  gain.setAttribute('aria-label', `Reset gain to 0 dB (${levels.length > 1 ? 'mixed levels' : levelText})`);
  gain.disabled = levels.every(v => v === 0);
  bar.querySelector('[data-op=vdn]').disabled = levels.every(v => v <= -60);
  bar.querySelector('[data-op=vup]').disabled = levels.every(v => v >= 12);
  const indicate = (op, on) => {
    const button = bar.querySelector('[data-op=' + op + ']');
    button.classList.toggle('on', on);
    button.setAttribute('aria-pressed', String(on));
  };
  indicate('rev', voices.length > 0 && voices.every(e => e.r));
  indicate('half', st.length > 0 && st.every(e => e.h));
  repeatSelect.value = xs.length === 1 ? String(xs[0]) : xs.length ? 'mixed' : '';
  repeatSelect.disabled = xs.length === 0;
  positionBar(bar, c);
  barLayoutDirty = false;
}
const invalidateBarLayout = () => { barLayoutDirty = true; };
addEventListener('scroll', invalidateBarLayout, true);
addEventListener('resize', invalidateBarLayout);
const barResize = new ResizeObserver(invalidateBarLayout);
['#cards', '#dock', '#selbar'].forEach(selector => barResize.observe($(selector)));
(function barLoop() {
  placeBar();
  requestAnimationFrame(barLoop);
})();
addEventListener('pointerup', edEnd);
addEventListener('pointercancel', edEnd);
// lost the release (window blur, or mouse let go outside the page): cancel rather than drop
const edAbort = e => {
  ED.pendingMarquee = null;
  if (!ED.mode) return;
  ED.tgt = null;
  edEnd({ type: 'abort', altKey: false, clientX: NaN, clientY: NaN });
};
addEventListener('blur', edAbort);
addEventListener(
  'pointermove',
  e => {
    if (ED.mode && e.buttons === 0) edAbort(e);
  },
  true,
);
document.addEventListener('keydown', e => {
  if (e.key === 'Escape') clearSel();
  if (
    (e.key === 'Delete' || e.key === 'Backspace') &&
    ED.card?.sel?.size &&
    !ED.card.ro &&
    !/INPUT|TEXTAREA|SELECT/.test(e.target.tagName)
  ) {
    // delete → empty space (rests)
    e.preventDefault();
    const c = ED.card,
      old = c.steps.map(plainE);
    ED.undo.push([{ card: c, steps: old, sel: new Set(c.sel), edited: !!c.edited }]);
    const p = old.map(x => ({ ...x }));
    c.sel.forEach(i => (p[i] = { s: -1, r: false, h: false, x: 1, p: 0 }));
    commitSteps(c, p);
    renderCard(c);
    c.el.classList.add('editing');
    saveCards();
  }
  if (
    (e.metaKey || e.ctrlKey) &&
    e.key.toLowerCase() === 'z' &&
    !e.shiftKey &&
    e.target.tagName !== 'INPUT'
  ) {
    const u = ED.undo.pop();
    if (!u) return;
    e.preventDefault();
    if (u.del) {
      const m = $('#cards');
      u.next && u.next.parentNode === m
        ? m.insertBefore(u.del.el, u.next)
        : m.appendChild(u.del.el);
      cards.push(u.del);
      renderCard(u.del);
      saveCards();
      return;
    }
    for (const x of u) {
      if (!cards.includes(x.card)) continue;
      x.card.steps.splice(0, x.card.steps.length, ...x.steps);
      x.card.sel = new Set();
      x.card.edited = x.edited;
      if (x.genes) {
        x.card.genes = x.genes;
        x.card.orig = x.orig;
      }
      renderCard(x.card);
    }
    clearSel();
    saveCards();
  }
});
function newBatch() {
  stop();
  batch++;
  localStorage.setItem('ascr.b', batch);
  const main = $('#cards');
  const hadOrig = cards.some(c => c.ro); // ORIGINAL stays if it was showing
  main.innerHTML = '';
  cards = [];
  for (const [k, pat] of generateBatch(batch, 12).entries()) {
    const id = `${batch}.${String(k + 1).padStart(2, '0')}`;
    main.appendChild(makeCard(pat, id));
  }
  if (hadOrig) main.prepend(makeOrig());
  saveCards();
}
/* keep the current batch across refreshes */
function saveCards() {
  const byEl = new Map(cards.map(c => [c.el, c]));
  requestAnimationFrame(sizeCells);
  localStorage.setItem(
    'ascr.cards',
    JSON.stringify(
      [...$('#cards').children]
        .map(el => byEl.get(el))
        .filter(c => c && (!c.ro || c.id === 'orig'))
        .map(c => c.ro ? { id: 'orig' } : ({
          id: c.id,
          str: c.str,
          genes: c.genes,
          orig: c.orig,
          edited: !!c.edited,
          loop: c.loop ? [c.loop.a, c.loop.b] : null,
          pinned: !!c.pinned,
        })),
    ),
  );
}
function restoreCards() {
  const saved = JSON.parse(localStorage.getItem('ascr.cards') || 'null');
  if (!saved || !saved.length) return false;
  const main = $('#cards');
  main.innerHTML = '';
  cards = [];
  for (const c of saved) {
    if (c.id === 'ref') continue; // the old "your edit" card: gone
    if (c.id === 'orig') {
      main.appendChild(makeOrig());
      continue;
    }
    try {
      const el = makeCard(
        {
          steps: parse(c.str),
          genes: c.genes,
          orig: c.orig,
          edited: c.edited,
          loop: c.loop,
          pinned: c.pinned,
        },
        c.id,
      );
      main.appendChild(el);
      const card = cards[cards.length - 1];
    } catch (e) {}
  }
  return cards.length > 0;
}
function makeOrig(preview = false) {
  return makeCard(
    { steps: run(0, LEN), genes: { eng: 'source', tpl: 'the break as it is' }, ro: true, preview },
    preview ? 'source-preview' : 'orig',
  );
}
/* ORIGINAL: hidden until asked for (the ORIGINAL button in the NEW tile). It lands where the tile is, like a new
   card; if it's already showing, the button just takes you to it. */
function showOrig() {
  const have = cards.find(c => c.ro);
  if (have) {
    have.el.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    have.cells.forEach(x => x.classList.add('landed'));
    return;
  }
  const el = makeOrig();
  $('#newtile').before(el);
  el.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  saveCards();
}
/* Reroll keeps the original, pinned cards, and the playing card in their slots. */
function regenerate() {
  const playing = P ? P.shownCard || P.card : null,
    keep = cards.filter(c => c.pinned || c.ro || c === playing);
  if (!keep.length) {
    newBatch();
    return;
  }
  if (P && P.queued && !keep.includes(P.queued)) unqueue();
  const main = $('#cards'),
    old = [...main.children].filter(el => el.classList.contains('card')),
    slot = new Map(keep.map(c => [old.indexOf(c.el), c]));
  batch++;
  localStorage.setItem('ascr.b', batch);
  cards = [...keep];
  const list = [];
  const count = Math.max(old.length, 13);
  const fresh = generateBatch(batch, count - slot.size, keep.filter(c => !c.ro).map(c => c.steps));
  let k = 0;
  for (let n = 0; n < count; n++) {
    if (slot.has(n)) {
      list.push(slot.get(n).el);
      continue;
    }
    const pat = fresh[k++];
    list.push(makeCard(pat, `${batch}.${String(k).padStart(2, '0')}`));
  }
  cards = cards.filter(c => list.includes(c.el));
  main.replaceChildren(...list);
  saveCards();
}
