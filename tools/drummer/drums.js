// Finds the bass drum (the big oval at the front) in each sprite cell, for the kick's swell in js/drummer.js.
// Usage: node tools/drummer/drums.js [assets/drummer.webp]   (needs ImageMagick's `magick`)
// Prints one [cx, cy, rx, ry] per cell, in cell pixels, to paste into DRUM in js/drummer.js (rerun after build.sh).
const { execFileSync } = require('child_process');
const FW = 232, FH = 180, COLS = 16, CELLS = 127;
const src = process.argv[2] || 'assets/drummer.webp';
const W = FW * COLS, H = FH * Math.ceil(CELLS / COLS);
const px = execFileSync('magick', [src, '-background', 'white', '-flatten', '-colorspace', 'gray', '-depth', '8', 'gray:-'], { maxBuffer: 1 << 26 });
if (px.length !== W * H) throw new Error(`expected ${W}x${H}, got ${px.length} bytes`);

function find(cell) {
  const ox = (cell % COLS) * FW, oy = Math.floor(cell / COLS) * FH,
    dark = (x, y) => px[(oy + y) * W + ox + x] < 120;
  // its sides: the outermost ink across the middle of the drum, between the small drums' stands
  let L = Infinity, R = -Infinity;
  for (let y = 132; y <= 152; y++) {
    for (let x = 76; x <= 158; x++) if (dark(x, y)) { L = Math.min(L, x); break; }
    for (let x = 158; x >= 76; x--) if (dark(x, y)) { R = Math.max(R, x); break; }
  }
  if (!(R - L > 40)) return null;
  const cx = Math.round((L + R) / 2);
  // its bottom and top: the first ink below and above its (empty) middle
  let B = null, T = null;
  for (let y = 145; y < FH; y++) if (dark(cx, y)) { B = y; break; }
  for (let y = 140; y > 60; y--) if (dark(cx, y)) { T = y; break; }
  if (B == null || T == null || B - T < 40) return null;
  return [cx, Math.round((B + T) / 2), Math.ceil((R - L) / 2), Math.ceil((B - T) / 2)];
}

const out = [];
for (let c = 0; c < CELLS; c++) out.push(find(c));
console.log(JSON.stringify(out));
