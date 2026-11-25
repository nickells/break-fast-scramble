'use strict';

/* ---------- knowledge: where hits want to land ---------- */
// backbeat on 2 & 4 (steps 4,12) is the anchor of every dnb/jungle edit; kick on 1, with
// syncopated kicks on the "and of 3" region (10/11) and sometimes the "a of 1" (2/3).
const WANT = { 0: 'K', 4: 'S', 12: 'S', 10: 'K', 8: null };
function roleFit(i, pos) {
  const w = WANT[pos % SPB],
    s = slices[i];
  if (!w) return 0;
  return w === 'K' ? s.kick : s.snare;
}
/* ---------- learning weights ---------- */
const DEF_W = {
  orn: { stut: 1, rev: 1, pitch: 1, half: 1 },
};
const W = DEF_W; // fixed weights (learning removed)

/* ---------- cell picking ---------- */
// a chunk start is only heard as a grouping accent if it begins on a kick or snare
const isAccent = i => {
  const r = slices[((i % N) + N) % N].role;
  return r === 'K' || r === 'S';
};
function pickCell(r, len, pos, prevEnd, accent, grounding = 0) {
  const ch = S.chaos;
  let best = 0,
    bestScore = -Infinity;
  for (let i = 0; i < N; i++) {
    let sc = 0;
    sc += 2.0 * roleFit(i, pos); // right drum on the strong positions
    sc += i % 4 === pos % 4 ? 1.2 * (1 - ch) : 0; // keep the slice's place within the beat (preserves swing/accent)
    sc += i % SPB === pos % SPB ? 0.6 * (1 - ch) : 0; // or its exact place in the bar
    if (prevEnd != null && i === prevEnd % N) sc += 1.5 * (1 - ch); // plain continuation
    if (grounding) {
      if (i % SPB === pos % SPB) sc += 0.8 * grounding;
      if (prevEnd != null && i === prevEnd % N) sc += grounding;
      // Preserve the Amen's backbeat, including its late beat-four snare.
      for (let k = 0; k < len; k++) {
        const beat = (pos + k) % SPB;
        if (slices[(i + k) % N].hits.snare) {
          sc += grounding * (beat === 4 ? 1.3 : beat === 12 || beat === 14 ? 0.6 : -1.15);
        }
      }
    }
    if (i + len > N) sc -= 2; // avoid wrapping past the end
    if (accent) sc += isAccent(i) ? 3 : -1; // odd groupings: start each chunk on a hit so the grouping is audible
    // and keep the beat: a chunk whose beats would fall on the ring between hits (a slice with nothing struck) loses
    // the pulse, so each such beat counts against it
    for (let k = (4 - (pos % 4)) % 4; k < len; k += 4) if (slices[(i + k) % N].role === '.') sc -= 1.5;
    sc += r() * (0.8 + 3 * ch);
    if (sc > bestScore) {
      bestScore = sc;
      best = i;
    }
  }
  return best;
}
/* ---------- engines ---------- */
/* ---------- liquid helpers (SMOOTH, HATS and PICKUPS in ideas.js), from a 180 bpm liquid top loop ----------
   a job per 8th: kick on the 1, snares on 2 and 4, a ghost on the "e" of 1, hats elsewhere. We slice a break rather
   than play a kit, so a hit rings into the next 16th (its own tail) instead of a rest that would cut it dead. */
const LIQ_ROLE = { 0: 'K', 2: 'g', 4: 'S', 6: 'h', 8: 'h', 10: 'h', 12: 'S', 14: 'h' };
// the next slice is just this hit's tail (not another hit), so a 2-step run sounds like one note
const tailOK = i => i + 1 < N && !isAccent(i + 1);
function roleScore(i, role) {
  const s = slices[i];
  if (role === 'K') return s.kick * 1.5;
  if (role === 'S') return s.snare * 1.5;
  if (role === 'g') return (s.role === 'g' ? 1.5 : 0) - 0.5 * s.zrms;
  return (s.role === 'h' ? 1.5 : 0) - 0.3 * s.zlo; // hats: ride/hat slices with little low end
}
function pickBy(r, score, avoid) {
  let best = 0,
    bs = -1e9;
  for (let i = 0; i < N; i++) {
    if (avoid && avoid.has(i)) continue;
    const sc = score(i) + r() * (0.6 + 2 * S.chaos);
    if (sc > bs) {
      bs = sc;
      best = i;
    }
  }
  return best;
}
const hatScore = i => roleScore(i, 'h') + (tailOK(i) ? 1 : -1);
/* ornaments: phrase-end rolls, scattered rolls, reverses, half-speed drags, gaps. How often each one happens comes from
   the style blend (MIX, see ideas.js), scaled by the amount of scramble. The ALLOW
   toggles still switch each kind off. */
function ornament(R, p, genes, grooves) {
  // each kind (and each bar of scattered rolls) on its own stream, so one starting to fire doesn't move the others
  let r = R('orn:end');
  const scale = (0.7 + 0.6 * S.chaos) * (1 - 0.9 * S.restraint),
    o = [],
    amt = v => Math.min(1, v * scale);
  const ends = [SPB * 2 - 4, SPB * 4 - 4];
  if (chance(r, amt(MIX.rollEnd))) {
    // snare roll / retrigger at the end of the phrase
    const at = ends[chance(r, 0.7) ? 1 : 0],
      len = chance(r, 0.5) ? 4 : 2,
      x = pickW(r, [2, 3, 4], v => (v === 2 ? 2 : v === 4 ? 1 : 0.6));
    const sn = pickSnare(r);
    const ramp = OPT.pitch && chance(r, 0.5);
    for (let k = 0; k < len; k++) p[at + (4 - len) + k] = { s: sn, r: false, x, p: ramp ? k * 2 : 0 };
    o.push((x > 1 ? 'roll' + x : 'snares') + (ramp ? '↑' : ''));
  }
  // scattered rolls (drill): single hits anywhere in the bar retriggered at 32nds, triplets or 64ths
  for (let b = 0; b < BARS; b++) {
    r = R('orn:scatter:' + b);
    if (!chance(r, amt(MIX.rollScatter))) continue;
    const hits = [];
    for (let i = b * SPB; i < (b + 1) * SPB; i++)
      if (p[i].s >= 0 && !p[i].h && p[i].x === 1 && isAccent(p[i].s)) hits.push(i);
    if (!hits.length) continue;
    const n = 1 + Math.floor(r() * Math.min(3, hits.length));
    for (let k = 0; k < n; k++) {
      const at = hits.splice(Math.floor(r() * hits.length), 1)[0],
        x = pickW(r, [2, 3, 4], v => (v === 2 ? 2 : v === 3 ? 1 : 1.2));
      p[at] = { ...p[at], x };
      // sometimes the roll carries on into the next step, a whole tone up
      if (OPT.pitch && at + 1 < (b + 1) * SPB && chance(r, 0.3) && p[at + 1].s >= 0 && !p[at + 1].h)
        p[at + 1] = { s: p[at].s, r: false, x, p: 2 };
    }
    o.push('rolls ×' + n);
  }
  r = R('orn:rev');
  if (OPT.rev && chance(r, amt(MIX.rev))) {
    const at = pickW(r, [7, 15, 23, 31, 39, 47, 55, 62], () => 1);
    const len = chance(r, 0.5) ? 1 : 2;
    for (let k = 0; k < len; k++) if (p[at + k] && p[at + k].s >= 0) p[at + k].r = true;
    o.push('rev');
  }
  r = R('orn:drag');
  if (OPT.half && chance(r, amt(MIX.drag))) {
    // half-speed drag: a segment played at 0.5x, twice as long, an octave down
    const bar = 1 + Math.floor(r() * 3);
    if (grooves[bar] !== 'rollers') {
      const b0 = bar * SPB,
        len = chance(r, 0.6) && grooves[bar] !== 'halftime' ? 8 : 4,
        pos = b0 + SPB - len;
      let s0 = p[pos].s;
      if (s0 < 0 || p[pos].x > 1 || p[pos].h) s0 = (b0 % N) + SPB - len; // slow down whatever was already playing there
      const rv = OPT.rev && chance(r, 0.3); // reversed half speed: a tape-rewind swell into the next downbeat (always ends the bar)
      for (let k = 0; k < len; k++) p[pos + k] = { s: (s0 + Math.floor(k / 2)) % N, r: rv, h: true, x: 1, p: 0 };
      o.push((rv ? 'rev-' : '') + 'half' + len / 2);
    }
  }
  r = R('orn:gap');
  if (OPT.gap && chance(r, amt(MIX.gap))) {
    const at = SPB + Math.floor(r() * 48);
    if (p[at].s >= 0 && slices[p[at].s].role !== 'K' && !WANT[at % SPB]) {
      p[at] = { s: -1 };
      o.push('gap');
    }
  }
  genes.orn = o;
  return p;
}
function clean(p) {
  return p.map(e =>
    e.s < 0
      ? OPT.gap
        ? e
        : { ...e }
      : { ...e, x: OPT.retrig ? e.x : 1, p: OPT.pitch ? e.p : 0, r: OPT.rev ? e.r : false },
  );
}
function pickSnare(r) {
  const c = slices.map((s, i) => [s.snare + r() * 0.5, i]).sort((a, b) => b[0] - a[0]);
  return c[Math.floor(r() * Math.min(3, c.length))][1];
}
/* how well a pattern keeps the backbeat + starts right — used to reject junk */
function score(p, skipLast, beats = [4, 12]) {
  let sc = 0;
  for (let b = 0; b < (skipLast ? BARS - 1 : BARS); b++) {
    for (const s of beats) {
      const e = p[b * SPB + s];
      if (e.s >= 0) sc += slices[e.s].snare > 0.3 ? 1 : -0.5;
    }
    const e = p[b * SPB];
    if (e.s >= 0) sc += slices[e.s].kick > 0.2 ? 0.6 : 0;
  }
  return sc;
}

/* one generator for everything: the STYLES blend sets every value inside (MIX, see ideas.js); CUT lays down the base,
   then every idea goes on top in order, then the ornaments. Each part draws from its own random stream (base, each idea
   in each bar, ornaments), all derived from the seed. Moving the style puck morphs a card, and returning to the same
   mix restores its pattern. */
const stream = (seed, tag) => mulberry((seed ^ hashStr(tag)) >>> 0);
function generate(seed) {
  MIX = mixStyles();
  const R = tag => stream(seed, tag),
    genes = { seed },
    grounding = (styleShare('sJungle') + 0.65 * styleShare('sFunk')) * Math.min(1, 2 * (1 - UI.scramble));
  let best = null;
  for (let t = 0; t < 6; t++) {
    // a few bases, keep the one with the most solid backbeat (looser as chaos rises). Judged on beat 2 and the
    // downbeat only: ideas shift beat 4 on purpose
    const Rc = tag => R('cand' + t + ':' + tag), // each bar of each candidate cut on its own stream
      g = { ...genes },
      p = chopBase(Rc, g, grounding);
    const sc = score(p, false, [4]) + Rc('score')() * S.chaos * 6;
    if (!best || sc > best.sc) best = { p, g, sc };
  }
  const g = best.g,
    grooves = Array.from({ length: BARS }, (_, b) => grooveForBar(R, b)),
    p = ornament(R, applyIdeas(R, best.p, g), g, grooves);
  finishGroove(R, p, g, grooves);
  return { steps: clean(p), genes: g };
}

// Pick a varied batch from ordinary seeds. A later fill can erase a move, so inspect the finished steps.
function generateBatch(batch, count, kept = []) {
  if (!count) return [];
  const mix = mixStyles();
  // Batch coverage follows the same probabilities as each generated pattern.
  for (const idea of IDEAS) {
    if (Object.hasOwn(IDEA_SAY, idea.id)) mix[idea.id] = moveAmount(idea, mix[idea.id]);
  }
  // Rollers restores the beat-four snare, so it can erase the early-snare move.
  mix.snfwd *= 1 - styleShare('sRoller');
  const moves = Object.keys(IDEA_SAY).filter(id => mix[id] >= 0.15);
  const target = id => count >= 8 && mix[id] >= 0.25 ? 2 : 1;
  const recipe = steps => ({ key: toStr(steps), ideas: detectIdeas(steps) });
  const keptRecipes = kept.map(recipe);
  const candidate = i => {
    const pattern = generate((batch * 7919 + i * 104729) >>> 0);
    return { pattern, ...recipe(pattern.steps) };
  };
  const pool = Array.from({ length: count }, (_, i) => candidate(i));
  const counts = entries => Object.fromEntries(moves.map(id => [id, entries.filter(c => c.ideas[id]).length]));
  const all = [...keptRecipes, ...pool];
  const available = counts(all);
  const seen = new Set(keptRecipes.map(c => c.key));
  if (new Set(all.map(c => c.key)).size === seen.size + count && moves.every(id => available[id] >= target(id))) {
    return pool.map(c => c.pattern);
  }

  for (let i = count; i < count * 3 + keptRecipes.length; i++) pool.push(candidate(i));
  const covered = counts(keptRecipes);
  const selected = [];
  while (selected.length < count) {
    let best = 0, bestScore = -Infinity;
    for (const [i, c] of pool.entries()) {
      if (seen.has(c.key)) continue;
      const score = moves.reduce((sum, id) =>
        sum + (c.ideas[id] && covered[id] < target(id) ? mix[id] / (1 + covered[id]) : 0), 0);
      if (score > bestScore) {
        best = i;
        bestScore = score;
      }
    }
    const [c] = pool.splice(best, 1);
    seen.add(c.key);
    for (const id of moves) if (c.ideas[id]) covered[id]++;
    selected.push(c.pattern);
  }
  return selected;
}
/* ---------- regenerate a selection ----------
   Fresh patterns from the current ideas are spliced in at the selected steps only. They come from the same
   positions in the bar, so they already sit on the grid; each splice is then scored for the beat (kick on 1 and
   the and-of-3, snares on 2 and 4), for not cutting in on a tail, and for how it joins the steps around it. */
function regenSel(p, ix, tries = 16) {
  const sel = new Set(ix),
    plain = e => e && e.s >= 0 && !e.h,
    joins = (a, b) => plain(a) && plain(b) && (a.s + 1) % N === b.s,
    // a step that starts something must be a hit, or the sound cuts in mid-tail
    entry = (a, b, edge) => (b.s < 0 || joins(a, b) ? 0 : isAccent(b.s) ? 0.5 : edge ? -1.4 : -0.7);
  const fitness = q => {
    let sc = 0;
    for (const i of ix) {
      const e = q[i],
        w = WANT[i % SPB];
      if (e.s < 0) {
        sc -= w ? 1.5 : 0.3;
        continue;
      }
      if (w) sc += 2 * (w === 'K' ? slices[e.s].kick : slices[e.s].snare);
      if (i > 0) sc += entry(q[i - 1], e, !sel.has(i - 1));
      const nx = q[i + 1]; // the step after the selection has to follow on as well
      if (nx && !sel.has(i + 1)) sc += entry(e, nx, true);
    }
    return sc;
  };
  let best = null;
  const cands = [];
  for (let t = 0; t < tries; t++) cands.push(generate((Math.random() * 2 ** 32) >>> 0).steps);
  for (const c of cands) {
    // a half-speed drag only makes sense whole: skip candidates that would cut one in two
    if (ix.some(i => c[i].h && ((c[i - 1]?.h && !sel.has(i - 1)) || (c[i + 1]?.h && !sel.has(i + 1)))))
      continue;
    const q = p.map((e, i) => (sel.has(i) ? { ...c[i] } : e));
    if (ix.every(i => tok(q[i]) === tok(p[i]))) continue; // must actually change something
    const sc = fitness(q) + Math.random() * (0.8 + 3 * S.chaos);
    if (!best || sc > best.sc) best = { q, sc };
  }
  return best ? best.q : p;
}
