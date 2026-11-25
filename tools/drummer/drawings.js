// Finds the unique drawings in the drummer footage (the animation is drawn at 24 fps inside 30 fps video, so drawings
// repeat) and writes their ids frame by frame. Input: raw 8-bit grey frames, 366x284, starting at source frame F0.
// usage: node drawings.js frames.gray > drawings.json
const fs = require('fs');
const W = 366, H = 284, F0 = 226, SAME = 120; // < SAME differing pixels (every 2nd pixel sampled) = the same drawing
const buf = fs.readFileSync(process.argv[2]), n = buf.length / (W * H);
const fr = i => buf.subarray(i * W * H, (i + 1) * W * H);
const diff = (a, b) => { let c = 0; for (let k = 0; k < a.length; k += 2) if (Math.abs(a[k] - b[k]) > 70) c++; return c; };
const uniq = [], seq = [];
for (let i = 0; i < n; i++) {
  let best = -1, bd = Infinity;
  uniq.forEach((u, k) => { const d = diff(fr(i), fr(u)); if (d < bd) { bd = d; best = k; } });
  if (bd < SAME) seq.push(best); else { uniq.push(i); seq.push(uniq.length - 1); }
}
process.stdout.write(JSON.stringify({ F0, uniq: uniq.map(i => i + F0), seq }));
