'use strict';

/* ---------- rule-based namer: reads the pattern itself, so pasted ones get names too ---------- */
function hashStr(t) {
  let h = 2166136261;
  for (const c of t) {
    h ^= c.charCodeAt(0);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}
function features(p) {
  const f = {
    cont: 0,
    runs: [],
    rt: {},
    rev: 0,
    up: 0,
    down: 0,
    rest: 0,
    snare: 0,
    kick: 0,
    bar4: 0,
    repeats: 0,
    backbeat: 0,
    half: 0,
  };
  let runLen = 1;
  const runStarts = [0];
  for (let i = 0; i < p.length; i++) {
    const e = p[i];
    if (e.s < 0) {
      f.rest++;
    } else {
      const r = slices[e.s % N].role;
      if (r === 'S') f.snare++;
      if (r === 'K') f.kick++;
      if (Math.floor(e.s / SPB) === 3) f.bar4++;
    }
    if (e.x > 1) f.rt[e.x] = (f.rt[e.x] || 0) + 1;
    if (e.r) f.rev++;
    if (e.p > 0) f.up++;
    if (e.p < 0) f.down++;
    if (i > 0) {
      if (contig(p[i - 1], e)) {
        f.cont++;
        runLen++;
      } else {
        f.runs.push(runLen);
        runLen = 1;
        runStarts.push(i);
      }
    }
    if (e.h) f.half++;
  }
  f.runs.push(runLen);
  f.cont /= p.length - 1;
  // a chunk that repeats the one before it (same start, same length)
  for (let k = 1; k < runStarts.length; k++) {
    const a = runStarts[k - 1],
      b = runStarts[k],
      len = b - a;
    if (p[b] && p[a] && !p[b].h && p[b].s === p[a].s && f.runs[k] === len) f.repeats++;
  }
  for (let b = 0; b < BARS; b++)
    for (const st of [4, 12]) {
      const e = p[b * SPB + st];
      if (e && e.s >= 0 && slices[e.s % N].snare > 0.3) f.backbeat++;
    }
  const short = f.runs.filter(l => l < 16);
  const cnt = n => short.filter(l => l === n).length;
  f.six = cnt(6);
  f.three = cnt(3);
  f.two = Math.max(0, cnt(2) + cnt(1) - Object.values(f.rt).reduce((a, b) => a + b, 0));
  f.four = cnt(4);
  f.long = f.runs.filter(l => l >= 12).length;
  // which chunk size covers the most steps (rolls excluded), and where an actual 3-3-2 / 6-6 sits
  const cover = {};
  f.runs.forEach((l, k) => {
    const e = p[runStarts[k]];
    if (e && e.x > 1) return;
    const b = l >= 8 ? 'long' : l <= 2 ? '2' : String(l);
    cover[b] = (cover[b] || 0) + l;
  });
  f.dom = Object.entries(cover).sort((a, b) => b[1] - a[1])[0]?.[0];
  f.domSteps = cover[f.dom] || 0;
  f.tres = [];
  f.dot = [];
  for (let k = 0; k + 2 < f.runs.length; k++) {
    const a = runStarts[k],
      bar = Math.floor(a / SPB);
    if (Math.floor((a + f.runs[k] + f.runs[k + 1] + f.runs[k + 2] - 1) / SPB) !== bar) continue;
    const q = f.runs.slice(k, k + 3).join(''),
      st = [0, 1, 2].map(j => runStarts[k + j]),
      sv = st.map(i => p[i].s);
    const rep = sv[0] >= 0 && sv[0] === sv[1],
      acc = n => st.slice(0, n).every(i => p[i].s >= 0 && isAccent(p[i].s));
    if (q === '332' && (rep || acc(3)) && !f.tres.includes(bar + 1)) f.tres.push(bar + 1);
    if (q.startsWith('66') && (rep || acc(2)) && !f.dot.includes(bar + 1)) f.dot.push(bar + 1);
  }
  f.rtN = Object.values(f.rt).reduce((a, b) => a + b, 0);
  f.rtMax = Math.max(0, ...Object.keys(f.rt).map(Number));
  return f;
}
/* ---------- vocabulary: a few words per ingredient (how it's built, and each corpus idea) ---------- */
const NAME_NOUN = {
  phrase: ['Call', 'Reply', 'Answer', 'Retort', 'Exchange'],
  bars: ['Shuffle', 'Reshuffle', 'Swap', 'Deal'],
  half: ['Halves', 'Split', 'Fold', 'Seesaw'],
  beats: ['Cells', 'Mosaic', 'Pieces', 'Chop'],
  '8ths': ['Chips', 'Shards', 'Crumbs', 'Flakes'],
  '16ths': ['Splinters', 'Dust', 'Grit', 'Scatter'],
  liq: ['Flow', 'Drift', 'Current', 'Glide'],
};
const NAME_MOVE = {
  echo6: ['Dotted', 'Lopsided', 'Limping'],
  kick3: ['Kicking', 'Stomping', 'Bumping'],
  keep: ['Recurring', 'Haunted', 'Echoing'],
  sn24: ['Doubled', 'Mirrored', 'Twin'],
  cell2: ['Stuttering', 'Hiccuping', 'Twitchy'],
  snfwd: ['Pushed', 'Leaning', 'Eager'],
};
const NAME_FLAVOUR = [
  [0.85, ['Straight', 'Clean', 'Smooth']],
  [0.65, ['Rolling', 'Shuffled', 'Easy']],
  [0.45, ['Broken', 'Bent', 'Crooked']],
  [-1, ['Shattered', 'Scrambled', 'Wrecked']],
];
// how a card was built, from its recipe (older cards' bases map onto the chunk sizes)
function nounKey(g) {
  const e = g.eng;
  if (e === 'phrase' || e === 'phr') return 'phrase';
  if (e === 'liq') return 'liq';
  if (e === 'arr') return 'bars';
  if (e === 'cells') return 'beats';
  if (e === 'walk') return '16ths';
  if (e === 'chop') return g.cut || (g.tpl || '').replace('chunks: ', '') || 'beats';
  return null;
}
const IDEA_SAY = { echo6: 'DOTTED ECHO', kick3: 'KICK ON &3', keep: 'KEEP', sn24: 'SNARE COPY', cell2: 'STUTTER', snfwd: 'EARLY SNARE' };

/* ---------- the naming engine ----------
   One namer for every card. It reads the steps and looks for the corpus ideas in them (a 6-step cell again 6 later,
   a pair played twice, the snare pulled to 10 or 14…), plus ornaments (rolls, reverses, drags, gaps, pitch).
   Name = the idea found in the most bars + an ornament (or the next idea) + a noun for how it's built.
   How it's built comes from the recipe (an edit doesn't change that); only pasted cards have it read from the steps.
   Words are picked per card (its seed), so an edit only renames it when it changes what's in it. */
function detectIdeas(p) {
  const T = p.map(tok),
    role = i => (p[i] && p[i].s >= 0 ? slices[p[i].s % N].role : '.'),
    same = (i, j) => p[i] && p[j] && p[i].s >= 0 && T[i] === T[j],
    found = {};
  const hit = id => (found[id] = (found[id] || 0) + 1);
  for (let b = 0; b < BARS; b++) {
    const o = b * SPB,
      run6 = st => [0, 1, 2, 3, 4, 5].every(k => st + 6 + k >= SPB || same(o + st + k, o + st + 6 + k));
    if ((run6(0) || run6(4)) && !(b && T.slice(o, o + SPB).join() === T.slice(o - SPB, o).join())) hit('echo6');
    else if (same(o, o + 10) && same(o + 1, o + 11) && role(o) === 'K') hit('kick3');
    if (b) {
      const kept = [2, 3, 6, 7, 8, 9, 10, 11].filter(i => same(o + i, o - SPB + i)).length;
      if (kept >= 2 && kept < 8 && T.slice(o, o + SPB).join() !== T.slice(o - SPB, o).join()) hit('keep');
    }
    if (role(o + 4) === 'S' && same(o + 4, o + 12) && same(o + 5, o + 13)) hit('sn24');
    else if ((role(o + 10) === 'S' || role(o + 14) === 'S') && role(o + 12) !== 'S') hit('snfwd');
    for (let i = o; i + 3 < o + SPB; i++)
      if (same(i, i + 2) && same(i + 1, i + 3) && !same(i, i + 1) && !(p[i].x > 1)) {
        hit('cell2');
        break;
      }
  }
  return found;
}
function ornamentsIn(p) {
  const rt = Math.max(0, ...p.map(e => (e.x > 1 ? e.x : 0)));
  if (rt === 3) return ['Galloping', 'Tripping'];
  if (rt >= 4) return ['Buzzing', 'Drilling'];
  if (rt) return ['Rolling', 'Fluttering'];
  if (p.some(e => e.h && e.r)) return ['Rewound', 'Swelling'];
  if (p.some(e => e.h)) return ['Dragging', 'Slowed'];
  if (p.some(e => e.r)) return ['Backspun', 'Reversed'];
  if (p.some(e => e.p > 0)) return ['Rising', 'Lifting'];
  if (p.some(e => e.p < 0)) return ['Sinking', 'Heavy'];
  if (p.filter(e => e.s < 0).length >= 2) return ['Gappy', 'Breathing'];
  return null;
}
/* how it's built, read from the steps: pairs on the 8th grid = liquid; bar 3 = bar 1 with long runs = call & answer;
   otherwise the typical chunk length */
function builtFrom(p, f) {
  let pairs = 0;
  for (let i = 0; i + 1 < p.length; i += 2) if (p[i].s >= 0 && p[i + 1].s === (p[i].s + 1) % N && !contig(p[i - 1] || {}, p[i])) pairs++;
  if (pairs >= 24) return 'liq';
  const avg = p.length / f.runs.length,
    T = p.map(tok);
  if (avg >= 6 && T.slice(0, SPB).join() === T.slice(2 * SPB, 3 * SPB).join()) return 'phrase';
  return avg >= 11 ? 'bars' : avg >= 6 ? 'half' : avg >= 3 ? 'beats' : avg >= 1.6 ? '8ths' : '16ths';
}
function nameEngine(p, genes = {}, edited = false, salt = 0) {
  if (p.every(e => e.s < 0))
    return { name: 'Blank', tags: ['empty: drag steps in from ORIGINAL, or select steps and type slice numbers'] };
  const f = features(p),
    seed = genes.seed ?? hashStr(toStr(p)),
    pick = (arr, k) => arr[(((seed >>> k) >>> 0) + salt * (k + 1)) % arr.length],
    found = detectIdeas(p),
    ideas = Object.keys(IDEA_SAY)
      .filter(k => found[k])
      .sort((a, b) => found[b] - found[a]),
    orn = ornamentsIn(p),
    nk = nounKey(genes) || builtFrom(p, f); // an edit doesn't change how it was built: only pasted cards are guessed
  const first = ideas.length
      ? pick(NAME_MOVE[ideas[0]], 3)
      : pick(NAME_FLAVOUR.find(([c]) => f.cont > c)[1], 3),
    mid = orn ? pick(orn, 7) : ideas[1] ? pick(NAME_MOVE[ideas[1]], 7) : '',
    name = [first, mid, pick(NAME_NOUN[nk], 11)].filter(Boolean).join(' ');
  const built = nk === 'phrase' ? 'call & answer' : nk === 'liq' ? 'liquid' : 'chunks of ' + nk;
  return {
    name,
    tags: [
      (nounKey(genes) ? 'built: ' : 'reads as: ') + built,
      ideas.length ? 'ideas: ' + ideas.map(k => IDEA_SAY[k] + (found[k] > 1 ? ' ×' + found[k] : '')).join(', ') : 'no corpus ideas',
      Math.round(f.cont * 100) + '% unbroken',
      f.runs.length - 1 + ' cuts',
      'backbeat ' + f.backbeat + '/8',
    ],
  };
}
