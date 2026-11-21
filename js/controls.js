'use strict';

/* ---------- DAW-style controls ---------- */
const ARC = v => {
  const a0 = -135,
    a = a0 + 270 * v,
    r = 17,
    p = t => [22 + r * Math.sin((t * Math.PI) / 180), 22 - r * Math.cos((t * Math.PI) / 180)],
    [x0, y0] = p(a0),
    [x1, y1] = p(a);
  return `M${x0} ${y0}A${r} ${r} 0 ${a - a0 > 180 ? 1 : 0} 1 ${x1} ${y1}`;
};
const fmtK = {
  src: v => v | 0,
  out: v => (+v).toFixed(v % 1 ? 1 : 0),
  chaos: v => Math.round(v * 100) + '%',
  lockN: v => v | 0,
  res: v => (+v).toFixed(1),
  swing: v => (v > 50 ? (v | 0) + '%' : 'OFF'),
  comp: v => Math.round(v * 100) + '%',
  verb: v => Math.round(v * 100) + '%',
  vol: v => Math.round(v * 100) + '%',
};
const onControlChange = {
  src: () => {
    if (buf) {
      stop();
      analyze();
      newBatch(false);
    }
  },
  vol: v => outG.gain.setTargetAtTime(v, ctx.currentTime, 0.02),
  res: () => applyFilter(),
  comp: () => applyFx(),
  verb: () => applyFx(),
  chaos: refreshGeneratedCards,
  keepIntro: refreshGeneratedCards,
  lockN: () => {
    if (UI.keepIntro) refreshGeneratedCards();
  },
  retrig: refreshGeneratedCards,
  pitch: refreshGeneratedCards,
  rev: refreshGeneratedCards,
  half: refreshGeneratedCards,
  gap: refreshGeneratedCards,
};
const KTIP = {
  src: 'SOURCE BPM — the tempo of the loaded break. Change it only if you drop in a different break; it re-slices and makes a new batch.',
  out: 'BPM — playback and export tempo. Changes live while a pattern plays.',
  chaos:
    'CHAOS — how far patterns stray. Low: chunks keep their place in the beat, runs carry on, the backbeat stays strict. High: freer jumps, more fills and ornaments, looser backbeat. The STYLES knobs set what kind of pattern; CHAOS sets how loosely it is played.',
  lockN: 'STEPS — how many opening 16ths KEEP INTRO takes from the source break (8 = two beats).',
  res: 'RES — filter resonance: the peak at the cutoff. Higher is more squelchy.',
  vol: 'VOL — output level (live playback only).',
  swing:
    'SWING — pushes every off-beat 16th late, sampler style. 50% = straight, 54–58% = a lazy shuffle, 67% = full triplet swing. Changes live, and WAV exports swing too.',
  comp: 'COMP — squash the break: one knob lowers the threshold and raises the ratio together, with makeup gain. A little = glue, all the way = pumping, smashed jungle drums. Live only.',
  verb: 'VERB — a small bright room sent before the compressor, so it ducks under every hit and swells in the gaps. Live only.',
};
/* while a knob or the fader is being dragged: no text selection anywhere, and the drag cursor everywhere */
function dragOn(cur) {
  getSelection().removeAllRanges();
  document.body.classList.add('dragging');
  document.body.style.setProperty('--dragcur', cur);
}
function dragOff() {
  document.body.classList.remove('dragging');
}
function setupKnob(el) {
  const k = el.dataset.k,
    min = +el.dataset.min,
    max = +el.dataset.max,
    st = +el.dataset.step,
    def = +el.dataset.def;
  el.innerHTML = `<svg viewBox="0 0 44 44"><circle cx="22" cy="22" r="17" fill="#202026" stroke="#2f2f37" stroke-width="4"/><path class="a" fill="none" stroke="var(--acc)" stroke-width="4" stroke-linecap="round"/><line class="n" x1="22" y1="22" x2="22" y2="9" stroke="#fff" stroke-width="2" stroke-linecap="round"/></svg><span class="v"></span><span class="l">${el.dataset.label}</span>`;
  const draw = () => {
    const v = (UI[k] - min) / (max - min);
    el.querySelector('.a').setAttribute('d', v > 0.001 ? ARC(v) : '');
    el.querySelector('.n').setAttribute('transform', `rotate(${-135 + 270 * v} 22 22)`);
    el.querySelector('.v').textContent = (fmtK[k] || (v => Math.round(v * 100) + '%'))(UI[k]);
  };
  el._draw = draw;
  const set = (v, commit) => {
    v = Math.min(max, Math.max(min, Math.round(v / st) * st));
    v = +v.toFixed(4);
    if (v === UI[k]) return;
    UI[k] = v;
    draw();
    saveUI();
    if (k !== 'src' || commit) onControlChange[k]?.(v);
  };
  let y0, v0, moved;
  el.onpointerdown = e => {
    if (e.target.closest('.kin')) return;
    e.preventDefault();
    el.setPointerCapture(e.pointerId);
    y0 = e.clientY;
    v0 = UI[k];
    moved = false;
    dragOn('ns-resize');
  };
  el.onpointermove = e => {
    if (y0 == null) return;
    if (e.buttons === 0) {
      el.onpointerup(e);
      return;
    }
    const dy = y0 - e.clientY;
    if (Math.abs(dy) > 1) moved = true;
    set(v0 + (dy * (max - min)) / (e.shiftKey ? 800 : 180));
  };
  el.onpointerup =
    el.onpointercancel =
    el.onlostpointercapture =
      () => {
        if (y0 == null) return;
        y0 = null;
        dragOff();
        if (moved && k === 'src') onControlChange.src();
      };
  el.onwheel = e => {
    e.preventDefault();
    set(UI[k] - Math.sign(e.deltaY) * st * (e.shiftKey ? 1 : (max - min) / st > 50 ? 2 : 1), true);
  };
  el.ondblclick = () => {
    const v = el.querySelector('.v'),
      inp = document.createElement('input');
    inp.className = 'kin';
    inp.value = UI[k];
    v.replaceWith(inp);
    inp.focus();
    inp.select();
    let done = false;
    const fin = ok => {
      if (done) return;
      done = true;
      inp.replaceWith(v);
      if (ok) {
        const t = inp.value.trim();
        set(t === '' ? def : +t || UI[k], true);
      }
      draw();
    };
    inp.onkeydown = e => {
      e.stopPropagation();
      if (e.key === 'Enter') fin(true);
      if (e.key === 'Escape') fin(false);
    };
    inp.onblur = () => fin(true);
    inp.onpointerdown = e => e.stopPropagation();
  };
  el.dataset.tip =
    (KTIP[k] || el.dataset.ktip || el.dataset.label) +
    '\n\nDrag up/down (shift = fine) · scroll · double-click to type, blank resets.';
  draw();
}
document.querySelectorAll('.knob').forEach(setupKnob);
document.querySelectorAll('.seg[data-k]').forEach(seg => {
  const k = seg.dataset.k,
    draw = () =>
      seg.querySelectorAll('button').forEach(b => b.classList.toggle('on', b.dataset.v === UI[k]));
  seg.querySelectorAll('button').forEach(
    b =>
      (b.onclick = () => {
        UI[k] = b.dataset.v;
        saveUI();
        draw();
        applyView();
      }),
  );
  draw();
});
function applyView() {
  document.body.classList.toggle('posmode', UI.colors === 'pos');
  document.body.classList.toggle('nokey', !UI.keyShow);
}
applyView();
const syncDeps = () => $('.knob[data-k=lockN]').classList.toggle('off', !UI.keepIntro);
document.querySelectorAll('.tog').forEach(b => {
  const k = b.dataset.k,
    draw = () => {
      b.classList.toggle('on', !!UI[k]);
      syncDeps();
    };
  b.onclick = () => {
    UI[k] = !UI[k];
    saveUI();
    draw();
    applyView();
    onControlChange[k]?.(UI[k]);
  };
  draw();
});
/* popovers */
(() => {
  const tip = $('#tip');
  let tm = null,
    cur = null;
  const hide = () => {
    clearTimeout(tm);
    tip.classList.remove('show');
    cur = null;
  };
  document.addEventListener('pointerover', e => {
    const el = e.target.closest('[data-tip]');
    if (el === cur) return;
    hide();
    if (!el || e.buttons) return;
    cur = el;
    tm = setTimeout(() => {
      tip.textContent = el.dataset.tip;
      const r = el.getBoundingClientRect(),
        w = tip.offsetWidth,
        h = tip.offsetHeight;
      let x = Math.min(innerWidth - w - 8, Math.max(8, r.left + r.width / 2 - w / 2)),
        y = r.bottom + 8;
      if (y + h > innerHeight - 8) y = r.top - h - 8;
      tip.style.left = x + 'px';
      tip.style.top = y + 'px';
      tip.classList.add('show');
    }, 350);
  });
  document.addEventListener('pointerdown', hide, true);
  addEventListener('scroll', hide, true);
})();
/* DJ filter: one bipolar fader. left = low-pass sweeping down, right = high-pass sweeping up, centre = bypass */
function applyFilter() {
  const x = UI.filt,
    t = ctx.currentTime,
    q = UI.res,
    dead = 0.03;
  let lp = 22000,
    hp = 10,
    lpq = 0.0001,
    hpq = 0.0001,
    txt = 'OFF';
  if (x < -dead) {
    const u = (-x - dead) / (1 - dead);
    lp = 22000 * Math.pow(60 / 22000, u);
    lpq = q;
    txt = 'LP ' + (lp >= 1000 ? (lp / 1000).toFixed(1) + 'k' : Math.round(lp)) + 'Hz';
  } else if (x > dead) {
    const u = (x - dead) / (1 - dead);
    hp = 10 * Math.pow(9000 / 10, u);
    hpq = q;
    txt = 'HP ' + (hp >= 1000 ? (hp / 1000).toFixed(1) + 'k' : Math.round(hp)) + 'Hz';
  }
  fLP.frequency.setTargetAtTime(lp, t, 0.015);
  fHP.frequency.setTargetAtTime(hp, t, 0.015);
  fLP.Q.setTargetAtTime(x < -dead ? q : 0.7, t, 0.02);
  fHP.Q.setTargetAtTime(x > dead ? q : 0.7, t, 0.02);
  $('#fval').textContent = txt;
  const pc = ((x + 1) / 2) * 100;
  $('#fcap').style.left = pc + '%';
  const f = $('#ffill');
  f.style.left = Math.min(50, pc) + '%';
  f.style.width = Math.abs(pc - 50) + '%';
}
(() => {
  const fd = $('#fader'),
    tr = $('#ftrack');
  let drag = false;
  const at = e => {
    const r = tr.getBoundingClientRect();
    let x = ((e.clientX - r.left) / r.width) * 2 - 1;
    x = Math.max(-1, Math.min(1, x));
    if (Math.abs(x) < 0.04) x = 0;
    UI.filt = x;
    applyFilter();
    saveUI();
  };
  fd.onpointerdown = e => {
    e.preventDefault();
    fd.setPointerCapture(e.pointerId);
    drag = true;
    dragOn('ew-resize');
    at(e);
  };
  fd.onpointermove = e => {
    if (!drag) return;
    if (e.buttons === 0) {
      drag = false;
      dragOff();
      return;
    }
    at(e);
  };
  fd.onpointerup =
    fd.onpointercancel =
    fd.onlostpointercapture =
      () => {
        if (!drag) return;
        drag = false;
        dragOff();
      };
  addEventListener('blur', () => {
    if (drag) {
      drag = false;
      dragOff();
    }
  });
  fd.ondblclick = () => {
    UI.filt = 0;
    applyFilter();
    saveUI();
  };
  fd.onwheel = e => {
    e.preventDefault();
    UI.filt = Math.max(-1, Math.min(1, UI.filt - Math.sign(e.deltaY) * 0.04));
    if (Math.abs(UI.filt) < 0.03) UI.filt = 0;
    applyFilter();
    saveUI();
  };
  outG.gain.value = UI.vol;
  applyFilter();
  applyFx();
})();
