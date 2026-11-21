'use strict';

/* ---------- styles ----------
   The controls are STYLES: JUNGLE, DRUMFUNK, LIQUID, ROLLERS, HALFTIME, DRILL. Each style is a profile: a value for every
   setting inside the generator (how finely the break is cut, how often each idea lands, how many rolls…). The style
   knobs are weights, and every setting is the weighted average of the styles' values, so styles blend inside the same
   pattern instead of taking turns. Each knob shows its style's share of the mix.

   Inside, the generator works in a fixed order:
     CUT        the break cut into pieces (piece size from the blend)
     FEEL       SMOOTH and HATS, 8th by 8th
     SHAPE      LOOP, CALL, TURN AROUND: which bars restate bar 1 (once per pattern)
     MOVES      echoes, keeps and fills, bar by bar
     LATE       HALFTIME (the backbeat moved to beat 3), GHOSTS, PICKUPS
     ORNAMENTS  rolls, reverses, drags, gaps (generator.js)
   Every decision draws from its own random stream from the seed, so turning a style knob morphs each card instead of
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
    tip: 'Amen edits as the source sets do them: the break cut into beat-sized pieces and put back in a new order, call and answer, dotted echoes, the kick again on the "&" of 3, snare fills on the answer bars, rolls at phrase ends. Measured from the vol 1 and vol 3 amen edits and your 165 edit.',
    v: { cut: 0.45, smooth: 0, hats: 0, loop: 0, call: 0.5, turn: 0.1, echo6: 0.3, kick3: 0.3, keep: 0.45, sn24: 0.2, cell2: 0.2, snfwd: 0.35, ht: 0, ghost: 0.05, pick: 0.15, rollEnd: 0.5, rollScatter: 0.05, rev: 0.35, drag: 0.2, gap: 0.22 },
  },
  {
    k: 'sFunk', id: 'drumfunk', label: 'DRUMFUNK', def: 0,
    tip: 'Jungle\'s busier, live-feeling cousin: smaller pieces, lots of quiet ghost notes between the hits, pickups into most strong hits, constant small changes and few exact repeats. A reading of the style, not measured from a reference.',
    v: { cut: 0.65, smooth: 0, hats: 0, loop: 0, call: 0.3, turn: 0, echo6: 0.35, kick3: 0.2, keep: 0.5, sn24: 0.2, cell2: 0.3, snfwd: 0.4, ht: 0, ghost: 0.45, pick: 0.7, rollEnd: 0.35, rollScatter: 0.1, rev: 0.15, drag: 0.05, gap: 0.1 },
  },
  {
    k: 'sLiquid', id: 'liquid', label: 'LIQUID', def: 0,
    tip: 'Liquid: a hit on every 8th that sounds out into the next 16th (an even, rolling pulse), two hat sounds alternating in between, quiet pickups into the strong hits, one bar looped with a turnaround, almost no fills or ornaments. Measured from a 180 bpm liquid top loop.',
    v: { cut: 0.25, smooth: 1, hats: 1, loop: 0.9, call: 1, turn: 0.65, echo6: 0.05, kick3: 0.1, keep: 0.1, sn24: 0.05, cell2: 0, snfwd: 0.1, ht: 0, ghost: 0.05, pick: 0.9, rollEnd: 0.1, rollScatter: 0, rev: 0.05, drag: 0.03, gap: 0 },
  },
  {
    k: 'sRoller', id: 'rollers', label: 'ROLLERS', def: 0,
    tip: 'Rollers: the two-step (kick on 1 and the "&" of 3, snares on 2 and 4) kept rolling, whole bars of the break looped with small changes, built for momentum rather than surprise. A reading of the style, not measured from a reference.',
    v: { cut: 0.1, smooth: 0.3, hats: 0.4, loop: 0.6, call: 0.8, turn: 0.2, echo6: 0.1, kick3: 0.8, keep: 0.35, sn24: 0.1, cell2: 0.05, snfwd: 0.2, ht: 0, ghost: 0.05, pick: 0.4, rollEnd: 0.25, rollScatter: 0, rev: 0.1, drag: 0.05, gap: 0.05 },
  },
  {
    k: 'sHalf', id: 'halftime', label: 'HALFTIME', def: 0,
    tip: 'Halftime: one snare per bar, on beat 3, so 170 feels like 85. Lots of space, a few long drags and gaps. START LOCK keeps the opening of the source (snare on 2 included): turn it off for strict halftime. A reading of the style, not measured from a reference.',
    v: { cut: 0.3, smooth: 0.4, hats: 0.3, loop: 0.5, call: 0.7, turn: 0.1, echo6: 0.1, kick3: 0.3, keep: 0.3, sn24: 0, cell2: 0.1, snfwd: 0, ht: 1, ghost: 0.1, pick: 0.3, rollEnd: 0.2, rollScatter: 0, rev: 0.2, drag: 0.3, gap: 0.3 },
  },
  {
    k: 'sDrill', id: 'drill', label: 'DRILL', def: 0,
    tip: 'Drill \'n\' bass, the mid-90s Warp sound: the break rebuilt almost 16th by 16th, bars that rarely repeat, stutters, and rolls scattered anywhere, not just at phrase ends. Turn ALLOW RETRIG and PITCH on to hear it. A reading of the style, not measured from a reference.',
    v: { cut: 1, smooth: 0, hats: 0, loop: 0, call: 0.05, turn: 0, echo6: 0.4, kick3: 0.2, keep: 0.1, sn24: 0.3, cell2: 0.7, snfwd: 0.3, ht: 0, ghost: 0.1, pick: 0.2, rollEnd: 0.9, rollScatter: 0.8, rev: 0.4, drag: 0.2, gap: 0.2 },
  },
];
const PKEYS = Object.keys(STYLES[0].v);
/* the blended settings: every value is the styles' values weighted by their knobs (all at 0 → JUNGLE) */
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
function chopBar(r, b, c, prevBar, genes) {
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
    if (b === 0 && pos < S.lock) start = pos; // START LOCK: the opening as it is
    else if (len === SPB)
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
  const b0 = chopBar(Rc('b0'), 0, c, null, genes),
    b1 = chopBar(Rc('b1'), 1, c, b0, genes),
    b2 = chopBar(Rc('b2'), 2, c, b1, genes),
    b3 = chopBar(Rc('b3'), 3, Math.min(1, c + 0.2), b2, genes);
  const out = [...b0, ...b1, ...b2, ...b3];
  if (S.lock) out.splice(0, S.lock, ...run(0, S.lock));
  return out;
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
  /* ---- LATE: after the moves, so nothing undoes them ---- */
  {
    id: 'ht', stage: 'late',
    // halftime: the snares on 2 and 4 turn into hats or ghosts, and one snare lands on beat 3
    apply(r, bar, lo) {
      if (lo > 8) return null;
      for (const pos of [4, 12])
        if (pos >= lo && hitAt(bar[pos]) && slices[bar[pos].s].role === 'S')
          pair(bar, pos, pickBy(r, i => (roleScore(i, 'h') > roleScore(i, 'g') ? roleScore(i, 'h') : roleScore(i, 'g')) + (tailOK(i) ? 0.8 : -0.8) - slices[i].snare * 2), lo);
      const s = pickBy(r, i => roleScore(i, 'S') + (tailOK(i) ? 0.8 : -0.8));
      pair(bar, 8, s, lo);
      return 'halftime';
    },
  },
  {
    id: 'ghost', stage: 'late', each: true,
    // quiet ghost notes on the off 16ths, in place of tails
    apply(r, bar, lo, prev, first, b, cx) {
      let n = 0;
      for (let p = 1; p < SPB; p += 2) {
        const rs = cx.sub(p);
        if (rs() >= MIX.ghost || p < lo || hitAt(bar[p]) || bar[p].h) continue;
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
saveUI();

/* every idea after the base, in order. Each idea in each bar has its own random stream R(id:bar), and an `each`
   idea one per spot, R(id:bar:spot); a SHAPE idea has one per pattern. A bar that LOOP or CALL restated from bar 1
   rolls on bar 1's streams, so it stays bar 1. */
function applyIdeas(R, p, genes) {
  const bars = [0, 1, 2, 3].map(b => p.slice(b * SPB, (b + 1) * SPB)),
    used = [],
    cx = { R, smooth: [0, 0, 0, 0] },
    shape = {},
    src = [0, 1, 2, 3];
  const perBar = stage =>
    bars.forEach((bar, b) => {
      const lo = src[b] === 0 ? S.lock : 0, // START LOCK keeps the opening steps: ideas land after them
        groups = {};
      for (const m of IDEAS) {
        if (m.stage !== stage) continue;
        if (m.bars === 'answer' && b % 2 === 0) continue;
        const cap = m.group === 'fill' && b === BARS - 1 ? 2 : 1;
        if (m.group && (groups[m.group] || 0) >= cap) continue;
        const key = m.id + ':' + src[b],
          rm = R(key);
        if (!m.each && rm() >= MIX[m.id]) continue;
        cx.sub = tag => R(key + ':' + tag);
        const lab = m.apply(rm, bar, Math.max(lo, bar.lo || 0), bars[b - 1] || bar, bars[0], b, cx);
        if (!lab) continue;
        if (m.group) groups[m.group] = (groups[m.group] || 0) + 1;
        used.push(`${lab} (bar ${b + 1})`);
      }
    });
  perBar('feel');
  for (const m of IDEAS) {
    if (m.stage !== 'shape' || R(m.id)() >= MIX[m.id]) continue;
    const A = bars[0];
    bars[m.to] = m.shift ? A.map((_, k) => ({ ...A[(k + m.shift) % SPB] })) : copyBar(A);
    cx.smooth[m.to] = cx.smooth[0];
    if (!m.shift) src[m.to] = 0;
    shape[m.id] = true;
    used.push(m.say);
  }
  perBar('move');
  perBar('late');
  genes.grp = (genes.grp || []).concat(used);
  // how it reads, for the name: mostly smoothed 8ths = liquid; bar 3 restating bar 1 = call & answer; else its cut
  const sm = cx.smooth.reduce((a, b) => a + b, 0) / BARS;
  genes.eng = sm >= 0.7 ? 'liq' : shape.call ? 'phrase' : 'chop';
  genes.tpl =
    mixWord() + ' · ' + (shape.loop ? 'A A ' : 'A B ') + (shape.call ? 'A ' : 'C ') + (shape.turn ? 'A«2' : 'D');
  const out = bars.flat();
  if (S.lock) out.splice(0, S.lock, ...run(0, S.lock));
  return out;
}

/* live: turning a style knob rebuilds every generated card that isn't pinned, cloned or hand-edited, from its own
   seed. Same card object, so a playing card keeps playing the new version. */
const BUILD_IDS = new Set(['chop', 'liq', 'phrase', 'arr', 'cells', 'walk', 'phr']); // older cards too
let liveQueued = false;
function liveIdeas() {
  if (liveQueued) return;
  liveQueued = true;
  requestAnimationFrame(() => {
    liveQueued = false;
    let any = false;
    for (const c of cards) {
      if (!followsKnobs(c)) continue;
      const np = generate(c.genes.seed),
        st = annotateHalf(np.steps),
        old = c.steps.map(tok);
      c.genes = np.genes;
      if (toStr(st) === c.str) {
        renderCard(c); // same steps, maybe new tags
        continue;
      }
      if (ED.card === c) clearSel();
      commitSteps(c, st);
      c.edited = false;
      c.orig = toStr(np.steps);
      renderCard(c);
      c.cells.forEach((x, i) => tok(c.steps[i]) !== old[i] && x.classList.add('landed'));
      any = true;
    }
    if (any) saveCards();
    if (markK) markIdea(markK); // rebuilt cells: show the highlight again
  });
}
/* hover a style knob: every card shows only the steps that style changes — the difference between the card and the
   same seed with that style at 0. Pinned, cloned and hand-edited cards don't follow the knobs, so they stay dim. */
let markK = null;
const followsKnobs = c =>
  !c.ro && !c.pinned && !c.edited && !c.genes?.of && c.genes?.seed != null && BUILD_IDS.has(c.genes.eng);
function markIdea(k) {
  markK = k;
  document.body.classList.toggle('marking', !!k);
  const style = STYLES.find(s => s.k === k);
  for (const c of cards) {
    c.el.classList.remove('marking');
    c.cells.forEach(x => x.classList.remove('mk'));
    if (!style || !followsKnobs(c) || !(UI[k] > 0)) continue;
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
// every style knob shows its share of the mix, so turning one changes what the others read
const redrawStyles = () => document.querySelectorAll('#ideas .knob').forEach(el => el._draw && el._draw());
addEventListener('DOMContentLoaded', () => {
  STYLES.forEach(s => {
    fmtK[s.k] = () => Math.round(styleShare(s.k) * 100) + '%';
    onK[s.k] = () => {
      liveIdeas();
      redrawStyles();
    };
  });
  redrawStyles();
});

/* the style knobs */
(() => {
  const strip = $('#ideas');
  if (!strip) return;
  const knob = s =>
    `<div class="knob" data-k="${s.k}" data-min="0" data-max="1" data-step="0.01" data-def="${s.def}" data-label="${s.label}" data-ktip="${(
      s.label +
      ' — ' +
      s.tip +
      '\n\nThe style knobs are a blend: every setting inside is the average of the styles, weighted by these knobs. Each one shows its style\'s share of the mix (all at 0 = JUNGLE).'
    ).replace(/"/g, '&quot;')}"></div>`;
  strip.innerHTML = `<div class="mod"><span class="cap">STYLES · BLEND</span><div class="row">${STYLES.map(knob).join('')}</div></div>`;
  // the highlight follows the last knob hovered and stays on across the gaps between knobs (no flashing);
  // it clears when the pointer leaves the strip. A knob being dragged holds the pointer, so it clears on release instead.
  strip.querySelectorAll('.knob').forEach(el => {
    el.addEventListener('pointerenter', () => markK !== el.dataset.k && markIdea(el.dataset.k));
    el.addEventListener('lostpointercapture', () => strip.matches(':hover') || markIdea(null));
  });
  strip.addEventListener('pointerleave', e => {
    if (!strip.querySelector('.knob:active') && !e.target.hasPointerCapture?.(e.pointerId)) markIdea(null);
  });
})();
