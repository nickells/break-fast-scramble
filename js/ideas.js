'use strict';

/* ---------- styles ----------
   The controls are STYLES: JUNGLE, DRUMFUNK, LIQUID, ROLLERS, HALFTIME, DRILL. Each style is a profile: a value for every
   setting inside the generator (how finely the break is cut, how often each idea lands, how many rolls…). The style
   pad sets the weights, and every setting is the weighted average of the styles' values, so styles blend inside the
   same pattern instead of taking turns. Each tip shows its style's share of the mix.

   Inside, the generator works in a fixed order:
     CUT        the break cut into pieces (piece size from the blend)
     FEEL       SMOOTH and HATS, 8th by 8th
     SHAPE      LOOP, CALL, TURN AROUND: which bars restate bar 1 (once per pattern)
     MOVES      echoes, keeps and fills, bar by bar
     LATE       GHOSTS, PICKUPS
     ORNAMENTS  rolls, reverses, drags, gaps (generator.js)
     GROOVE     protect style anchors and add drumfunk shuffles
   Every decision draws from its own random stream from the seed, so moving the style puck morphs each card instead of
   reshuffling it.

   What the sources showed (measured inside each file: exact repeats of earlier 16ths, and the drum on every 16th;
   the files use a different amen recording, so exact slice numbers couldn't be recovered):
   - vol 1, ten cw amen edits: kick pair on 1 and snare on 2 in nearly every bar; the downbeat kick cell again on
     the "&" of 3; bar 2 keeps bar 1 in place (copies 16 steps back were the most common repeat) and turns its back
     half into a fill; beat 4 holds a snare in only ~40% of bars.
   - vol 3, eight breaks: the same backbone and bar-2 copies, plus cells repeated a dotted quarter (6 steps) later —
     often beat 2's snare cell again on step 10, so the snare sits on 10 in half the bars and on beat 4 in a quarter.
   - a 180 bpm liquid top loop: a hit on every 8th that sounds out into the next 16th, 16th pickups into strong hits,
     two hat voices in a fixed alternation, one bar repeated, the last bar shifted two 16ths early.
   JUNGLE and LIQUID come from those files. DRUMFUNK, ROLLERS, HALFTIME and DRILL are readings of each style, not
   measurements: tune them by ear, or measure a reference loop and set them from that. */
const STYLES = [
  {
    k: 'sJungle', id: 'jungle', label: 'JUNGLE', def: 1,
    tip: 'Classic Amen cuts. The kick doubles back on the "&" of 3, and the snare answers with fills and rolls.',
    v: { cut: 0.45, smooth: 0, hats: 0, loop: 0, call: 0.5, turn: 0.1, echo6: 0.3, kick3: 0.3, keep: 0.45, sn24: 0.2, cell2: 0.2, snfwd: 0.35, ht: 0, ghost: 0.05, pick: 0.15, rollEnd: 0.5, rollScatter: 0.05, rev: 0.35, drag: 0.2, gap: 0.22 },
  },
  {
    k: 'sFunk', id: 'drumfunk', label: 'DRUMFUNK', def: 0,
    tip: 'Fine cuts, ghost snares, and shuffling hats. The little hits do the talking.',
    v: { cut: 0.65, smooth: 0, hats: 0, loop: 0, call: 0.3, turn: 0, echo6: 0.35, kick3: 0.2, keep: 0.5, sn24: 0.2, cell2: 0.3, snfwd: 0.4, ht: 0, ghost: 0.45, pick: 0.7, rollEnd: 0.35, rollScatter: 0.1, rev: 0.15, drag: 0.05, gap: 0.1 },
  },
  {
    k: 'sLiquid', id: 'liquid', label: 'LIQUID', def: 0,
    tip: 'An eighth-note glide, a roaming backbeat, and a quiet pickup into the turn.',
    v: { cut: 0.25, smooth: 1, hats: 1, loop: 0.9, call: 1, turn: 0, echo6: 0.05, kick3: 0.1, keep: 0.1, sn24: 0.05, cell2: 0, snfwd: 0.1, ht: 0, ghost: 0.05, pick: 0.9, rollEnd: 0.1, rollScatter: 0, rev: 0.05, drag: 0.03, gap: 0 },
  },
  {
    k: 'sRoller', id: 'rollers', label: 'ROLLERS', def: 0,
    tip: 'A steady two-step. Whole bars roll by with just enough variation to keep moving.',
    v: { cut: 0.1, smooth: 0.3, hats: 0.4, loop: 0.6, call: 0.8, turn: 0.2, echo6: 0.1, kick3: 0.8, keep: 0.35, sn24: 0.1, cell2: 0.05, snfwd: 0.2, ht: 0, ghost: 0.05, pick: 0.4, rollEnd: 0.25, rollScatter: 0, rev: 0.1, drag: 0.05, gap: 0.05 },
  },
  {
    k: 'sHalf', id: 'halftime', label: 'HALFTIME', def: 0,
    tip: 'Snare on 3, long drags, and room to breathe. 170 feels like 85.',
    v: { cut: 0.3, smooth: 0.4, hats: 0.3, loop: 0.5, call: 0.7, turn: 0.1, echo6: 0.1, kick3: 0.1, keep: 0.3, sn24: 0, cell2: 0.1, snfwd: 0, ht: 1, ghost: 0.1, pick: 0.3, rollEnd: 0.2, rollScatter: 0, rev: 0.2, drag: 0.3, gap: 0.3 },
  },
  {
    k: 'sDrill', id: 'drill', label: 'DRILL', def: 0,
    tip: 'Sixteenth-note cuts, stray rolls, and stutters that show up wherever they like.',
    v: { cut: 1, smooth: 0, hats: 0, loop: 0, call: 0.05, turn: 0, echo6: 0.4, kick3: 0.2, keep: 0.1, sn24: 0.3, cell2: 0.7, snfwd: 0.3, ht: 0, ghost: 0.1, pick: 0.2, rollEnd: 0.9, rollScatter: 0.8, rev: 0.4, drag: 0.2, gap: 0.2 },
  },
];
const PKEYS = Object.keys(STYLES[0].v);
/* Every generator setting is the weighted average of the active styles. */
let MIX = { ...STYLES[0].v };
const styleTotal = () => STYLES.reduce((a, s) => a + (UI[s.k] || 0), 0);
function mixStyles() {
  const tot = styleTotal();
  if (tot <= 0) return { ...STYLES[0].v };
  const out = Object.fromEntries(PKEYS.map(k => [k, 0]));
  for (const s of STYLES) for (const k of PKEYS) out[k] += ((UI[s.k] || 0) * s.v[k]) / tot;
  return out;
}
const styleShare = k => {
  const tot = styleTotal();
  return tot > 0 ? (UI[k] || 0) / tot : k === STYLES[0].k ? 1 : 0;
};
// Each triangular sector blends its two tips and the equal mix at the center.
const defaultStyleOrder = [0, 1, 5, 4, 2, 3].map(i => STYLES[i].id);
const savedStyleOrder = UI.styleOrder;
const styleOrder = Array.isArray(savedStyleOrder) && savedStyleOrder.length === defaultStyleOrder.length &&
  new Set(savedStyleOrder).size === defaultStyleOrder.length && savedStyleOrder.every(id => defaultStyleOrder.includes(id))
  ? savedStyleOrder : defaultStyleOrder;
const styleTips = styleOrder.map((id, i) => {
  const angle = i * Math.PI / 3;
  return { ...STYLES.find(s => s.id === id), x: Math.sin(angle), y: -Math.cos(angle) };
});
const stylePosition = () => styleTips.reduce(
  ([x, y], s) => [x + s.x * styleShare(s.k), y + s.y * styleShare(s.k)], [0, 0],
);
function padWeights(x, y) {
  const angle = Math.atan2(x, -y);
  const sector = Math.floor(((angle + 2 * Math.PI) % (2 * Math.PI)) / (Math.PI / 3));
  const next = (sector + 1) % styleTips.length;
  const a = styleTips[sector], b = styleTips[next];
  const det = a.x * b.y - a.y * b.x;
  const left = Math.max(0, (x * b.y - y * b.x) / det);
  const right = Math.max(0, (a.x * y - a.y * x) / det);
  const scale = Math.max(1, left + right);
  const center = Math.max(0, 1 - (left + right) / scale) / styleTips.length;
  const weights = styleTips.map(() => center);
  weights[sector] += left / scale;
  weights[next] += right / scale;
  // Eliminate floating-point remnants at the boundary and at solo positions.
  return weights.map(v => v < 1e-10 ? 0 : v);
}
function setStylePosition(x, y) {
  const weights = padWeights(x, y);
  const changed = styleTips.some((s, i) => Math.abs(styleShare(s.k) - weights[i]) > 1e-8);
  styleTips.forEach((s, i) => { UI[s.k] = weights[i]; });
  return changed;
}
function swapStyleTips(from, to) {
  const a = styleTips[from], b = styleTips[to];
  styleTips[from] = { ...b, x: a.x, y: a.y };
  styleTips[to] = { ...a, x: b.x, y: b.y };
  UI.styleOrder = styleTips.map(s => s.id);
  // Carry the existing blend to its new weighted position in the reordered layout.
  return setStylePosition(...stylePosition());
}
// a few words for the card: the styles that make up most of the mix
const mixWord = () =>
  STYLES.map(s => [s.id, styleShare(s.k)])
    .filter(([, v]) => v >= 0.1)
    .sort((a, b) => b[1] - a[1])
    .map(([id, v]) => (v > 0.95 ? id : `${id} ${Math.round(v * 100)}`))
    .join(' + ');

const hitAt = e => e && e.s >= 0 && !e.h && isAccent(e.s);
/* paste a cell into a bar, starting on a hit; if the bar's next step isn't a hit, the cell's last slice rings on
   (a plain run) until one is — so nothing ever starts in the middle of a tail */
function splice(bar, at, cell, maxLen = 6) {
  let k = 0;
  for (; k < cell.length && at + k < SPB; k++) bar[at + k] = { ...cell[k] };
  for (; at + k < SPB && k < maxLen && !hitAt(bar[at + k]); k++) {
    const last = bar[at + k - 1];
    bar[at + k] = last.s >= 0 && !last.h ? ev(last.s + 1) : { ...last };
  }
}
const nBars = () => Math.max(1, Math.floor(N / SPB));
const copyBar = bar => bar.map(e => ({ ...e }));

/* ---------- CUT: the base ----------
   Every bar cut into pieces, each piece taken from wherever in the break fits (kick on the 1, snares on 2 and 4, a
   slice keeps its place in the beat, runs carry on). The piece size comes from the blend: whole bars (the old ARR and
   PHRASE), beat-sized groupings like 3+3+2 (the old CELLS), down to single 16ths (the old WALK). The last bar is the
   fill, cut one notch finer. */
const CHUNK_SIZES = [16, 8, 6, 5, 4, 3, 2, 1];
const chunkTarget = c => 16 * Math.pow(1 / 16, c); // 0 → 16 steps, 0.5 → 4, 1 → 1
const chunkWord = c => {
  const t = chunkTarget(c);
  return t >= 11 ? 'BARS' : t >= 5.5 ? 'HALF' : t >= 2.8 ? 'BEATS' : t >= 1.4 ? '8THS' : '16THS';
};
function chopBar(r, c, prevBar, genes) {
  const T = chunkTarget(c),
    lens = [];
  for (let left = SPB; left > 0; ) {
    const L = pickW(
      r,
      CHUNK_SIZES.filter(l => l <= left),
      l => Math.exp(-2.2 * Math.abs(Math.log2(l / T))),
    );
    lens.push(L);
    left -= L;
  }
  const out = [];
  let pos = 0,
    prevEnd = prevBar ? prevBar[SPB - 1].s + 1 : null,
    last = null,
    lastLen = 0;
  for (const len of lens) {
    let start;
    if (len === SPB)
      // a whole bar of the break: usually the one after the bar before (an answer), otherwise any
      start =
        prevEnd != null && prevEnd % SPB === 0 && chance(r, 0.55)
          ? prevEnd % (nBars() * SPB)
          : Math.floor(r() * nBars()) * SPB;
    else if (last != null && len === lastLen && len >= 2 && chance(r, 0.6 - 0.4 * S.chaos))
      start = last; // the same chunk again: 3-3 / 6-6 is heard as "that again"
    else start = pickCell(r, len, pos, prevEnd, len >= 3 && len % 4 !== 0); // odd sizes start on a hit, so you hear the grouping
    out.push(...run(start, len));
    prevEnd = start + len;
    last = start;
    lastLen = len;
    pos += len;
  }
  genes.grp.push(lens.join('+'));
  return out;
}
function chopBase(Rc, genes) {
  const c = MIX.cut;
  genes.grp = [];
  genes.cut = chunkWord(c).toLowerCase();
  const b0 = chopBar(Rc('b0'), c, null, genes),
    b1 = chopBar(Rc('b1'), c, b0, genes),
    b2 = chopBar(Rc('b2'), c, b1, genes),
    b3 = chopBar(Rc('b3'), Math.min(1, c + 0.2), b2, genes);
  return [...b0, ...b1, ...b2, ...b3];
}

/* the two hat voices HATS alternates: chosen once per pattern, so every bar uses the same pair */
function hatVoices(r) {
  const a = pickBy(r, hatScore),
    b = pickBy(r, i => hatScore(i) + 0.5 * (slices[i].zhi || 0), new Set([a]));
  return [a, b];
}
// a hit on `pos` that sounds out into its own tail on pos+1 (each half only if it's past the START LOCK steps)
function pair(bar, pos, s, lo) {
  if (pos >= lo) bar[pos] = ev(s);
  if (pos + 1 >= lo) bar[pos + 1] = ev(s + 1);
}
function moveSecondSnare(bar, at) {
  // Swap the hit and its tail together so the backbeat moves without doubling.
  const from = [12, 10].find(pos => slices[bar[pos].s]?.role === 'S');
  if (from == null || from === at) return false;
  const moved = bar.slice(from, from + 2);
  bar.splice(from, 2, ...bar.slice(at, at + 2));
  bar.splice(at, 2, ...moved);
  return true;
}
function liquidTurn(r, bar) {
  const moves = OPT.gap ? ['snare', 'restart', 'breath'] : ['snare', 'restart'];
  const move = moves[Math.floor(r() * moves.length)];
  if (move === 'snare' && moveSecondSnare(bar, 14)) return 'late snare';
  if (move === 'breath') {
    bar.splice(14, 2, { s: -1 }, { s: -1 });
    return 'space at the turn';
  }
  const at = chance(r, 0.7) ? 6 : 8;
  bar.splice(at, SPB - at, ...copyBar(bar.slice(0, SPB - at)));
  return 'restart at the turn';
}
const quietScore = i =>
  (slices[i].role === 'g' || slices[i].role === 'h' ? 1 : 0) - 0.6 * slices[i].zrms - (isAccent(i) ? 1 : 0);

/* ---------- the ideas inside ----------
   Each idea reads how often it lands from MIX[id]. A plain idea rolls once per bar (or, for SHAPE, once per pattern).
   An `each` idea rolls separately at each spot it could touch, so a blend mixes it in spot by spot: half LIQUID
   smooths about half the 8ths of every bar rather than every other bar. */
const IDEAS = [
  /* ---- FEEL: spot by spot ---- */
  {
    id: 'smooth', stage: 'feel', each: true,
    // a hit on the 8th that sounds out into the next 16th. A hit the cut already put there stays; otherwise whatever
    // fits the spot: kick on 1, a ghost on the "e" of 1, snares on 2 and 4, hats in between
    apply(r, bar, lo, prev, first, b, cx) {
      const ch = S.chaos;
      let n = 0,
        open = 0;
      for (let pos = 0; pos < SPB; pos += 2) {
        if (pos + 1 < lo) continue;
        open++;
        const rs = cx.sub(pos);
        if (rs() >= MIX.smooth) continue;
        const e = bar[pos],
          role = LIQ_ROLE[pos];
        let s;
        if (pos < lo) s = e.s; // the locked hit sounds out
        else if (hitAt(e) && tailOK(e.s) && (role !== 'S' || slices[e.s].role === 'S')) s = e.s;
        else
          s = pickBy(
            rs,
            i => roleScore(i, role) + (tailOK(i) ? 0.8 : -0.8) + (i % SPB === pos ? 0.6 * (1 - ch) : 0),
          );
        pair(bar, pos, s, lo);
        n++;
      }
      cx.smooth[b] = n / Math.max(1, open); // share of the 8ths it could touch (START LOCK steps don't count)
      return n ? `smooth ${n}/8` : null;
    },
  },
  {
    id: 'hats', stage: 'feel', each: true,
    // two hat sounds alternating on the off-beat 8ths, the same pair all pattern; now and then a kick on the "&" of 3
    apply(r, bar, lo, prev, first, b, cx) {
      const [A, B] = cx.hats || (cx.hats = hatVoices(cx.R('hatvoices')));
      let n = 0;
      for (const pos of [6, 8, 10, 14]) {
        const rs = cx.sub(pos);
        if (rs() >= MIX.hats) continue;
        const s =
          pos === 10 && chance(rs, 0.55)
            ? pickBy(rs, i => roleScore(i, 'K') + (tailOK(i) ? 0.8 : -0.8))
            : pos === 6 || pos === 14
              ? A
              : B;
        pair(bar, pos, s, lo);
        n++;
      }
      return n ? 'hats' : null;
    },
  },
  {
    id: 'liquidBackbeat', stage: 'feel', amount: liquid => 0.55 * liquid,
    apply(r, bar) {
      if (!moveSecondSnare(bar, 10)) return null;
      if (chance(r, 0.7)) {
        const kick = pickBy(r, i => roleScore(i, 'K') + (tailOK(i) ? 0.8 : -0.8));
        pair(bar, 6, kick, 0);
      }
      return 'early backbeat';
    },
  },
  /* ---- SHAPE: once per pattern, a bar restated from bar 1 ---- */
  { id: 'loop', stage: 'shape', to: 1, say: 'loop' }, // bar 2 = bar 1
  { id: 'call', stage: 'shape', to: 2, say: 'call & answer' }, // bar 3 = bar 1
  { id: 'turn', stage: 'shape', to: 3, shift: 2, say: 'turnaround' }, // bar 4 = bar 1 two 16ths early
  /* ---- MOVES: bar by bar. One echo per bar; one fill per answer bar (two on the last) ---- */
  {
    id: 'echo6', stage: 'move', group: 'echo',
    // a cell again a dotted quarter (6 steps) later; in the last bar, the ending of your 165 edit
    apply(r, bar, lo, prev, first, b) {
      if (b === BARS - 1 && !lo && chance(r, 0.6)) {
        // any kick whose snare follows two 16ths later, as a 6-step cell on 1 and 7; then 4 steps that fit
        const k = pickBy(
          r,
          i => (slices[i].role === 'K' ? 2 : -9) + 2 * slices[(i + 2) % N].snare + (i + 6 <= N ? 0 : -9),
        );
        for (let j = 0; j < 12; j++) bar[j] = ev(k + (j % 6));
        const lead = pickCell(r, 4, 12, k + 6, true);
        for (let j = 0; j < 4; j++) bar[12 + j] = ev(lead + j);
        bar.lo = 12; // fills on this bar keep to the last four steps
        return `kick 1+7 (${k})`;
      }
      const p0 = chance(r, 0.55) ? 4 : 0;
      if (p0 + 6 < lo || !hitAt(bar[p0])) return null;
      const cell = bar.slice(p0, p0 + 6).map(e => ({ ...e }));
      for (let k = 0; k < 6 && p0 + 6 + k < SPB; k++) bar[p0 + 6 + k] = cell[k];
      return p0 ? 'snare cell +6' : '6+6+4';
    },
  },
  {
    id: 'kick3', stage: 'move', group: 'echo',
    // the downbeat's kick cell again on the "&" of 3 (the two-step)
    apply(r, bar, lo) {
      if (lo > 10 || !hitAt(bar[0])) return null;
      const len = pickW(r, [2, 3, 4, 6], l => ({ 2: 3, 3: 1, 4: 1, 6: 2 })[l]);
      splice(bar, 10, bar.slice(0, len));
      return `kick cell →10 (${len})`;
    },
  },
  {
    id: 'keep', stage: 'move', bars: 'answer',
    // an answer bar keeps a few steps of the bar before it, in the same place
    apply(r, bar, lo, prev) {
      const spots = [2, 3, 6, 7, 8, 9, 10, 11].filter(p => p >= lo && hitAt(prev[p]));
      if (!spots.length) return null;
      const n = 1 + Math.floor(r() * 3);
      for (let i = 0; i < n; i++) {
        const at = pickW(r, spots, p => (p === 10 ? 3 : 1));
        splice(bar, at, prev.slice(at, at + 1 + Math.floor(r() * 3)));
      }
      return `keep ×${n}`;
    },
  },
  {
    id: 'sn24', stage: 'move', bars: 'answer', group: 'fill',
    // beat 2's snare and its tail, copied onto beat 4
    apply(r, bar, lo) {
      if (lo > 12 || !hitAt(bar[4])) return null;
      splice(bar, 12, bar.slice(4, 6));
      return 'snare 2→4';
    },
  },
  {
    id: 'cell2', stage: 'move', bars: 'answer', group: 'fill',
    // a 2-step cell (a hit and its tail) played twice in the back half
    apply(r, bar, lo) {
      const cells = [0, 4, 10, 12].filter(p => hitAt(bar[p])),
        at = chance(r, 0.5) ? 8 : 12;
      if (!cells.length || at < lo) return null;
      const from = cells[Math.floor(r() * cells.length)],
        c = [bar[from], bar[from + 1]];
      splice(bar, at, [0, 1, 2, 3].map(k => c[k % 2]));
      return `2-cell ×2 @${at}`;
    },
  },
  {
    id: 'snfwd', stage: 'move', bars: 'answer', group: 'fill',
    // the second snare pulled forward to the "&" of 3 (it sounds on through beat 4) or to the last 8th
    apply(r, bar, lo) {
      const at = chance(r, 0.7) ? 10 : 14;
      if (at < lo) return null;
      const s = pickBy(r, i => roleScore(i, 'S') + (tailOK(i) ? 0.8 : -0.8));
      for (let k = 0; at + k < SPB; k++) bar[at + k] = ev(s + k);
      return `snare →${at}`;
    },
  },
  /* ---- LATE: pickups and ghost notes around the fills ---- */
  {
    id: 'ghost', stage: 'late', each: true,
    // quiet ghost notes on the off 16ths, in place of tails
    apply(r, bar, lo, prev, first, b, cx) {
      let n = 0;
      for (let p = 1; p < SPB; p += 2) {
        const rs = cx.sub(p);
        if (rs() >= MIX.ghost || p < lo || bar[p].s < 0 || hitAt(bar[p]) || bar[p].h) continue;
        bar[p] = ev(pickBy(rs, quietScore));
        n++;
      }
      return n ? `ghosts ×${n}` : null;
    },
  },
  {
    id: 'pick', stage: 'late',
    // quiet 16ths just before a strong hit: 15 into the next downbeat, 9 into the "&" of 3, sometimes 3, 7 or 11
    apply(r, bar, lo) {
      const want = 1 + (chance(r, 0.6) ? 1 : 0) + (chance(r, S.chaos) ? 1 : 0),
        used = [];
      for (const [p, pr] of [[15, 0.9], [9, 0.75], [7, 0.3], [11, 0.3], [3, 0.25]]) {
        if (used.length >= want || p < lo || !chance(r, pr)) continue;
        if (bar[p].s < 0) continue;
        if (p < SPB - 1 && !hitAt(bar[p + 1])) continue; // a pickup leads into a hit
        bar[p] = ev(pickBy(r, quietScore));
        used.push(p);
      }
      return used.length ? 'pickups ' + used.sort((a, b) => a - b).join('·') : null;
    },
  },
];
/* older saved settings: the idea knobs and LIQUID/PHRASE are gone (the styles hold those values now) */
['iLiq', 'iPhrase', 'iChunk', 'iSmooth', 'iHats', 'iPick', 'iLoop', 'iCall', 'iTurn', 'iEcho6', 'iKick3', 'iKeep', 'iSn24', 'iCell2', 'iSnFwd'].forEach(k => delete UI[k]);
STYLES.forEach(s => {
  if (UI[s.k] == null) UI[s.k] = s.def;
});
// Old knob mixes could occupy dimensions the pad has no room for. Project to their weighted position.
const styleMixMoved = setStylePosition(...stylePosition());
saveUI();

/* every idea after the base, in order. Each idea in each bar has its own random stream R(id:bar), and an `each`
   idea one per spot, R(id:bar:spot); a SHAPE idea has one per pattern. A bar that LOOP or CALL restated from bar 1
   rolls on bar 1's streams, so it stays bar 1. */
function applyIdeas(R, p, genes) {
  const bars = [0, 1, 2, 3].map(b => p.slice(b * SPB, (b + 1) * SPB)),
    used = [],
    cx = { R, smooth: [0, 0, 0, 0] },
    shape = {},
    src = [0, 1, 2, 3],
    liquid = styleShare('sLiquid');
  const perBar = stage =>
    bars.forEach((bar, b) => {
      const groups = {};
      for (const m of IDEAS) {
        if (m.stage !== stage) continue;
        if (m.bars === 'answer' && b % 2 === 0) continue;
        const cap = m.group === 'fill' && b === BARS - 1 ? 2 : 1;
        if (m.group && (groups[m.group] || 0) >= cap) continue;
        const key = m.id + ':' + src[b],
          rm = R(key);
        const amount = m.amount?.(liquid) ?? MIX[m.id];
        if (!m.each && rm() >= amount) continue;
        cx.sub = tag => R(key + ':' + tag);
        const lab = m.apply(rm, bar, bar.lo || 0, bars[b - 1] || bar, bars[0], b, cx);
        if (!lab) continue;
        if (m.group) groups[m.group] = (groups[m.group] || 0) + 1;
        used.push(`${lab} (bar ${b + 1})`);
      }
    });
  perBar('feel');
  for (const m of IDEAS) {
    if (m.stage !== 'shape') continue;
    const roll = R(m.id)(),
      local = m.id === 'turn' && roll >= MIX.turn && roll < MIX.turn + 0.65 * liquid;
    if (!local && roll >= MIX[m.id]) continue;
    const A = bars[0];
    bars[m.to] = m.shift && !local ? A.map((_, k) => ({ ...A[(k + m.shift) % SPB] })) : copyBar(A);
    cx.smooth[m.to] = cx.smooth[0];
    if (!m.shift) src[m.to] = 0;
    shape[m.id] = local ? 'local' : true;
    if (!local) used.push(m.say);
  }
  perBar('move');
  if (shape.turn === 'local') used.push(liquidTurn(R('liquidTurn'), bars[BARS - 1]));
  perBar('late');
  genes.grp = (genes.grp || []).concat(used);
  // how it reads, for the name: mostly smoothed 8ths = liquid; bar 3 restating bar 1 = call & answer; else its cut
  const sm = cx.smooth.reduce((a, b) => a + b, 0) / BARS;
  genes.eng = sm >= 0.7 ? 'liq' : shape.call ? 'phrase' : 'chop';
  genes.tpl =
    mixWord() + ' · ' + (shape.loop ? 'A A ' : 'A B ') + (shape.call ? 'A ' : 'C ') +
    (shape.turn === 'local' ? 'A′' : shape.turn ? 'A«2' : 'D');
  return bars.flat();
}

function grooveForBar(R, bar) {
  const feel = R('groove:' + bar)();
  if (feel < MIX.ht) return 'halftime';
  if (feel < MIX.ht + styleShare('sRoller')) return 'rollers';
}

// Set the last accent and level decisions after ornaments have shaped the bar.
function finishGroove(R, p, genes, grooves) {
  const funk = styleShare('sFunk');
  if (!funk && !grooves.some(Boolean)) return;
  const roles = new Set(slices.map(s => s.role));
  const voice = (r, role) => pickBy(r, i =>
    roles.has(role) && slices[i].role !== role ? -Infinity : roleScore(i, role) + 0.5 * tailOK(i),
  );
  const anchor = (i, role) => {
    const e = p[i];
    const s = slices[e.s]?.role === role ? e.s : voice(R('anchor:' + i % SPB), role);
    if (e.s !== s || e.h || e.r || e.x > 1 || e.p || e.v) p[i] = ev(s);
  };
  for (let b = 0; b < BARS; b++) {
    const start = b * SPB, end = start + SPB;
    if (grooves[b] === 'halftime') {
      const snare = start + 8;
      anchor(snare, 'S');
      for (let i = start; i < end; i++) {
        if (i === snare) continue;
        const e = p[i];
        const role = slices[e.s]?.role;
        if (role === 'S') e.v = Math.min(e.v || 0, -13);
        if (role === 'K' && i > snare && i <= snare + 2) e.v = Math.min(e.v || 0, -5);
      }
      genes.grp.push('halftime (bar ' + (b + 1) + ')');
    } else if (grooves[b] === 'rollers') {
      for (const [pos, role] of [[0, 'K'], [4, 'S'], [10, 'K'], [12, 'S']])
        anchor(start + pos, role);
      // Keep the backbeat above the extra snare an eighth note later.
      const extra = p[start + 14], tail = p[start + 15];
      if (slices[extra.s]?.role === 'S' && !extra.h && (!OPT.retrig || extra.x <= 1)) {
        extra.v = Math.min(extra.v || 0, -13);
        if (tail.s === extra.s + 1 && !isAccent(tail.s) && !tail.h &&
          (!OPT.retrig || tail.x <= 1) && !extra.r && !tail.r && extra.p === tail.p) {
          tail.v = Math.min(tail.v || 0, extra.v);
        }
      }
    }

    const rs = R('shuffle:' + b);
    if (!chance(rs, 0.85 * funk)) continue;
    const starts = [1, 2, 5, 6, 7, 8, 9, 10, 13, 14]
      .map(pos => start + pos)
      .filter(i => [p[i], p[i + 1]].every(e => !e.h && (e.x || 1) === 1 && !hitAt(e)));
    if (!starts.length) continue;
    const at = starts[Math.floor(rs() * starts.length)];
    p[at] = { ...ev(voice(rs, 'h')), v: -7 - Math.floor(rs() * 4) };
    p[at + 1] = { ...ev(voice(rs, 'S')), v: -11 - Math.floor(rs() * 5) };
    genes.grp.push('hat–ghost shuffle (bar ' + (b + 1) + ')');
  }
}

/* Pattern controls rebuild eligible cards from their current seeds. Preserve card identity and playback. */
const BUILD_IDS = new Set(['chop', 'liq', 'phrase', 'arr', 'cells', 'walk', 'phr']); // older cards too
let refreshQueued = false;
function refreshGeneratedCards() {
  if (refreshQueued) return;
  refreshQueued = true;
  requestAnimationFrame(() => {
    refreshQueued = false;
    let any = false;
    for (const c of cards) {
      if (!followsKnobs(c)) continue;
      const np = generate(c.genes.seed);
      c.genes = np.genes;
      const next = toStr(np.steps);
      if (next !== c.str) {
        if (ED.card === c) clearSel();
        commitSteps(c, np.steps);
        c.edited = false;
        c.orig = next;
        any = true;
      }
      renderCard(c, { reuseCells: true });
    }
    if (any) saveCards();
    if (markK) markIdea(markK); // changed cells: show the highlight again
  });
}
/* Hover a mixed-in style to highlight what it changes on each eligible card. */
let markK = null;
const followsKnobs = c =>
  !c.ro && !c.pinned && !c.edited && !c.genes?.of && c.genes?.seed != null && BUILD_IDS.has(c.genes.eng);
function markIdea(k) {
  markK = k;
  document.body.classList.toggle('marking', !!k);
  for (const c of cards) {
    c.el.classList.remove('marking');
    c.cells.forEach(x => x.classList.remove('mk'));
    if (!k || !followsKnobs(c)) continue;
    const keep = UI[k];
    UI[k] = 0;
    const off = generate(c.genes.seed).steps;
    UI[k] = keep;
    const steps = c.steps.map((e, i) => (tok(e) !== tok(off[i]) ? i : -1)).filter(i => i >= 0);
    if (!steps.length) continue;
    c.el.classList.add('marking');
    steps.forEach(i => c.cells[i]?.classList.add('mk'));
  }
  MIX = mixStyles(); // generate() above mixed with this style at 0
}
/* Vector pad and its six solo buttons. */
(() => {
  const strip = $('#ideas');
  if (!strip) return;
  strip.innerHTML = `<div class="style-mixer">
    <div class="style-mixer-bar"><span class="cap">STYLE MIX</span><button type="button" id="ideasReset">RESET MIX</button></div>
    <div class="style-field">
      <span class="style-origin" hidden aria-hidden="true"></span>
      <button type="button" class="style-pad" data-tip="Drag toward a style to blend. Click a style to solo it. Arrow keys move the puck. Home resets to Jungle.">
        <span class="style-hex" aria-hidden="true">${styleTips.map((_, i) => `<span style="--spoke:${i * 60 - 90}deg"></span>`).join('')}</span>
        <span class="style-puck" aria-hidden="true"></span>
      </button>
      ${styleTips.map(s => `<button type="button" class="style-tip" aria-keyshortcuts="Shift+ArrowLeft Shift+ArrowRight" style="--tip-x:${s.x};--tip-y:${s.y}"><span class="style-name">${s.label}</span><span class="style-share"></span></button>`).join('')}
    </div>
  </div>`;
  const pad = strip.querySelector('.style-pad');
  const puck = pad.querySelector('.style-puck');
  const origin = strip.querySelector('.style-origin');
  const tips = [...strip.querySelectorAll('.style-tip')];
  const draw = () => {
    const [x, y] = stylePosition();
    puck.style.left = `${50 + x * 50}%`;
    puck.style.top = `${50 + y * 50}%`;
    const exact = styleTips.map(s => styleShare(s.k) * 100);
    const equal = exact.every(value => Math.abs(value - 100 / styleTips.length) < 1e-8);
    const shares = exact.map(Math.floor);
    const remainder = 100 - shares.reduce((a, b) => a + b, 0);
    exact.map((value, i) => ({ i, fraction: value - shares[i] }))
      .sort((a, b) => b.fraction - a.fraction).slice(0, remainder).forEach(({ i }) => shares[i]++);
    const labels = shares.map((share, i) => {
      if (equal) return '16⅔%';
      if (share === 0 && exact[i] > 0) return '<1%';
      if (share === 100 && exact[i] < 100 - 1e-8) return '>99%';
      return `${share}%`;
    });
    tips.forEach((el, i) => {
      el.querySelector('.style-name').textContent = styleTips[i].label;
      el.querySelector('.style-share').textContent = labels[i];
      el.dataset.tip = styleTips[i].tip + ' Click to solo. Drag onto another style to swap places. Shift + Left/Right moves it one slot.';
      el.classList.toggle('mixed', exact[i] > 0);
      el.setAttribute('aria-pressed', String(exact[i] >= 100 - 1e-8));
    });
    pad.setAttribute('aria-label', 'Style blend. ' + styleTips.map((s, i) => `${s.label} ${labels[i]}`).join(', '));
  };
  const move = (x, y) => {
    if (markK) markIdea(null);
    if (!setStylePosition(x, y)) return;
    draw();
    saveUI();
    refreshGeneratedCards();
  };
  const reset = () => {
    const jungle = styleTips.find(s => s.id === 'jungle');
    move(jungle.x, jungle.y);
  };
  strip.querySelector('#ideasReset').onclick = reset;
  const swap = (from, to) => {
    if (from === to) return;
    if (markK) markIdea(null);
    const changed = swapStyleTips(from, to);
    draw();
    saveUI();
    if (changed) refreshGeneratedCards();
  };
  tips.forEach((el, i) => {
    let drag, suppressClick = false;
    el.onclick = e => {
      if (suppressClick && e.detail) return;
      const { x, y } = styleTips[i];
      move(x, y);
    };
    el.onpointerenter = e => {
      const { k } = styleTips[i];
      if (e.pointerType === 'mouse' && styleShare(k) > 0 && styleShare(k) < 1) markIdea(k);
    };
    el.onpointerleave = () => { if (markK === styleTips[i].k) markIdea(null); };
    el.onpointerdown = e => {
      if (e.button !== 0 || !e.isPrimary) return;
      suppressClick = false;
      drag = { id: e.pointerId, x: e.clientX, y: e.clientY, moved: false, target: -1,
        bounds: tips.map(tip => tip.getBoundingClientRect()) };
      el.setPointerCapture(e.pointerId);
    };
    const updateDrag = e => {
      if (drag?.id !== e.pointerId) return;
      const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
      if (!drag.moved && Math.hypot(dx, dy) < 5) return;
      if (!drag.moved) {
        if (markK) markIdea(null);
        const { x, y } = styleTips[i], bounds = drag.bounds[i];
        origin.style.setProperty('--tip-x', x);
        origin.style.setProperty('--tip-y', y);
        origin.style.width = `${bounds.width}px`;
        origin.style.height = `${bounds.height}px`;
        origin.hidden = false;
        drag.moved = true;
      }
      el.classList.add('style-tip-lifted');
      el.style.transform = `translate(${dx}px, ${dy}px)`;
      const target = drag.bounds.findIndex((r, j) => j !== i && e.clientX >= r.left &&
        e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom);
      if (target === drag.target) return;
      tips[drag.target]?.classList.remove('style-tip-target');
      tips[target]?.classList.add('style-tip-target');
      drag.target = target;
    };
    const endDrag = (e, drop) => {
      if (drag?.id !== e.pointerId) return;
      if (drop) updateDrag(e);
      const { target, moved } = drag;
      drag = null;
      suppressClick = moved;
      if (moved) origin.hidden = true;
      el.classList.remove('style-tip-lifted');
      el.style.transform = '';
      tips[target]?.classList.remove('style-tip-target');
      if (drop && target >= 0) {
        swap(i, target);
        tips[target].focus();
      }
    };
    el.onpointermove = updateDrag;
    el.onpointerup = e => endDrag(e, true);
    el.onpointercancel = el.onlostpointercapture = e => endDrag(e, false);
    el.onkeydown = e => {
      if (!e.shiftKey || (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight')) return;
      e.preventDefault();
      const target = (i + (e.key === 'ArrowLeft' ? tips.length - 1 : 1)) % tips.length;
      swap(i, target);
      tips[target].focus();
    };
  });
  const atPointer = e => {
    const rect = pad.getBoundingClientRect();
    move(2 * (e.clientX - rect.left) / rect.width - 1, 2 * (e.clientY - rect.top) / rect.height - 1);
  };
  pad.onpointerdown = e => {
    if (e.button !== 0 || !e.isPrimary) return;
    pad.setPointerCapture(e.pointerId);
    atPointer(e);
  };
  pad.onpointermove = e => { if (pad.hasPointerCapture(e.pointerId)) atPointer(e); };
  pad.onkeydown = e => {
    const directions = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };
    if (e.key === 'Home') {
      e.preventDefault();
      reset();
    } else if (directions[e.key]) {
      e.preventDefault();
      const [dx, dy] = directions[e.key], [x, y] = stylePosition();
      const step = e.shiftKey ? 0.025 : 0.12;
      move(x + dx * step, y + dy * step);
    }
  };
  draw();
})();
