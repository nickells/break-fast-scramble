'use strict';

/* ---------- pattern format ---------- */
const tok = e =>
  e.s < 0
    ? '.'
    : e.s +
      (e.r ? 'r' : '') +
      (e.h ? 'h' : '') +
      (e.x > 1 ? 'x' + e.x : '') +
      (e.p ? (e.p > 0 ? '+' : '') + e.p : '') +
      (e.v ? 'v' + (e.v > 0 ? '+' : '') + e.v : ''); // level in dB: 12v-6 is slice 12, 6 dB down
function toStr(p) {
  return p.map((e, i) => (i && i % SPB === 0 ? '| ' : '') + tok(e)).join(' ');
}
function parse(str) {
  const out = [];
  for (const t of str.trim().split(/\s+/)) {
    if (t === '|') continue;
    if (t === '.') {
      out.push({ s: -1 });
      continue;
    }
    const m = t.match(/^(\d+)(r)?(h)?(?:x(\d))?([+-]\d+)?(?:v([+-]?\d+))?$/);
    if (!m) throw Error('bad token ' + t);
    const e = { s: +m[1], r: !!m[2], h: !!m[3], x: +(m[4] || 1), p: +(m[5] || 0) };
    if (m[6]) e.v = +m[6];
    out.push(e);
  }
  return out;
}
/* half-speed segments: consecutive 'h' steps (40h 40h 41h 41h …) are one sound — the source segment played once at 0.5× across them */
function annotateHalf(p) {
  annotateRolls(p);
  let start = -1;
  for (let i = 0; i < p.length; i++) {
    const e = p[i];
    delete e.hlen;
    delete e.hc;
    if (!e.h || e.s < 0) {
      start = -1;
      continue;
    }
    if (start >= 0 && e.s === (p[start].s + Math.floor((i - start) / 2)) % N) {
      e.hc = true;
      p[start].hlen++;
    } else {
      e.hlen = 1;
      start = i;
    }
  }
  return p;
}
function voiceStart(steps, i) {
  while (i > 0 && steps[i].hc) i--;
  return i;
}
/* rolls: consecutive retriggered steps are one roll. Each step learns where its hits sit in the whole roll
   (rj = index of its first hit, rn = hits in the roll), so playback can make the roll rise into what follows. */
function annotateRolls(p) {
  for (let i = 0; i < p.length; ) {
    if (!(p[i].x > 1) || p[i].s < 0) {
      delete p[i].rj;
      delete p[i].rn;
      i++;
      continue;
    }
    let j = i,
      n = 0;
    while (j < p.length && p[j].x > 1 && p[j].s >= 0) n += p[j++].x;
    for (let k = i, h = 0; k < j; h += p[k++].x) {
      p[k].rj = h;
      p[k].rn = n;
    }
    i = j;
  }
}
const ev = s => ({ s: ((s % N) + N) % N, r: false, x: 1, p: 0 });
const run = (start, len) => Array.from({ length: len }, (_, k) => ev(start + k));
