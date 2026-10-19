// QR codes for the computer-to-phone handoff (js/handoff.js): text in, an SVG out. Byte mode,
// error correction M (about 15% of the code can be smudged), versions 1 to 10 (up to about 200
// characters), following ISO/IEC 18004. Built in, so it works offline and nothing is downloaded.
// The screen checks read every code back with Chrome's own QR reader (BarcodeDetector).

const ECC = { L: [7, 10, 15, 20, 26, 18, 20, 24, 30, 18], M: [10, 16, 26, 18, 24, 16, 18, 22, 22, 26] };   // per block, versions 1-10
const BLOCKS = { L: [1, 1, 1, 1, 1, 2, 2, 2, 2, 4], M: [1, 1, 1, 2, 2, 4, 4, 4, 5, 5] };
const FORMAT = { L: 1, M: 0 };
const MAX_VERSION = 10;

const bit = (x, i) => ((x >>> i) & 1) !== 0;

// Modules (squares) that carry data and error correction in a version.
function rawModules(ver) {
  let n = (16 * ver + 128) * ver + 64;
  if (ver >= 2) {
    const align = Math.floor(ver / 7) + 2;
    n -= (25 * align - 10) * align - 55;
    if (ver >= 7) n -= 36;
  }
  return n;
}
const dataCodewords = (ver, ecl) => Math.floor(rawModules(ver) / 8) - ECC[ecl][ver - 1] * BLOCKS[ecl][ver - 1];

// Reed-Solomon over GF(256), polynomial 0x11D.
function gfMul(x, y) {
  let z = 0;
  for (let i = 7; i >= 0; i--) {
    z = (z << 1) ^ ((z >>> 7) * 0x11d);
    z ^= ((y >>> i) & 1) * x;
  }
  return z;
}
function rsDivisor(degree) {
  const out = new Array(degree).fill(0);
  out[degree - 1] = 1;
  let root = 1;
  for (let i = 0; i < degree; i++) {
    for (let j = 0; j < degree; j++) {
      out[j] = gfMul(out[j], root);
      if (j + 1 < degree) out[j] ^= out[j + 1];
    }
    root = gfMul(root, 0x02);
  }
  return out;
}
function rsRemainder(data, divisor) {
  const out = divisor.map(() => 0);
  for (const b of data) {
    const factor = b ^ out.shift();
    out.push(0);
    divisor.forEach((c, i) => { out[i] ^= gfMul(c, factor); });
  }
  return out;
}

function alignPositions(ver) {
  if (ver === 1) return [];
  const n = Math.floor(ver / 7) + 2;
  const step = Math.ceil((ver * 4 + 4) / (n * 2 - 2)) * 2;
  const out = [6];
  for (let pos = ver * 4 + 10; out.length < n; pos -= step) out.splice(1, 0, pos);
  return out;
}

// The codewords for `bytes` at a version: data, padding, then error correction, interleaved.
function codewords(bytes, ver, ecl) {
  const bits = [];
  const put = (val, len) => { for (let i = len - 1; i >= 0; i--) bits.push((val >>> i) & 1); };
  put(0b0100, 4);                                 // byte mode
  put(bytes.length, ver <= 9 ? 8 : 16);
  for (const b of bytes) put(b, 8);
  const capacity = dataCodewords(ver, ecl) * 8;
  put(0, Math.min(4, capacity - bits.length));    // terminator
  put(0, (8 - (bits.length % 8)) % 8);
  for (let pad = 0xec; bits.length < capacity; pad ^= 0xec ^ 0x11) put(pad, 8);
  const data = [];
  for (let i = 0; i < bits.length; i += 8) data.push(bits.slice(i, i + 8).reduce((a, b) => (a << 1) | b, 0));

  const blocks = BLOCKS[ecl][ver - 1];
  const eccLen = ECC[ecl][ver - 1];
  const raw = Math.floor(rawModules(ver) / 8);
  const shortBlocks = blocks - (raw % blocks);
  const shortLen = Math.floor(raw / blocks);
  const div = rsDivisor(eccLen);
  const all = [];
  for (let i = 0, k = 0; i < blocks; i++) {
    const dat = data.slice(k, k + shortLen - eccLen + (i < shortBlocks ? 0 : 1));
    k += dat.length;
    const ecc = rsRemainder(dat, div);
    if (i < shortBlocks) dat.push(0);
    all.push(dat.concat(ecc));
  }
  const out = [];
  for (let i = 0; i < all[0].length; i++) all.forEach((b, j) => { if (i !== shortLen - eccLen || j >= shortBlocks) out.push(b[i]); });
  return out;
}

const MASKS = [
  (x, y) => (x + y) % 2 === 0, (x, y) => y % 2 === 0, (x) => x % 3 === 0, (x, y) => (x + y) % 3 === 0,
  (x, y) => (Math.floor(x / 3) + Math.floor(y / 2)) % 2 === 0, (x, y) => ((x * y) % 2) + ((x * y) % 3) === 0,
  (x, y) => (((x * y) % 2) + ((x * y) % 3)) % 2 === 0, (x, y) => (((x + y) % 2) + ((x * y) % 3)) % 2 === 0,
];

// A QR code for `text`: { size, dark(x, y) }. Throws if the text is too long.
export function qrMatrix(text, { ecl = 'M' } = {}) {
  const bytes = [...new TextEncoder().encode(text)];
  let ver = 1;
  while (ver <= MAX_VERSION && dataCodewords(ver, ecl) * 8 < 4 + (ver <= 9 ? 8 : 16) + bytes.length * 8) ver++;
  if (ver > MAX_VERSION) throw new Error('Too long for a QR code here.');
  const size = ver * 4 + 17;
  const mod = Array.from({ length: size }, () => new Array(size).fill(false));
  const fixed = Array.from({ length: size }, () => new Array(size).fill(false));
  const set = (x, y, dark) => { mod[y][x] = dark; fixed[y][x] = true; };

  // Finder patterns (with their white borders), timing lines, alignment patterns.
  for (const [cx, cy] of [[3, 3], [size - 4, 3], [3, size - 4]]) {
    for (let dy = -4; dy <= 4; dy++) for (let dx = -4; dx <= 4; dx++) {
      const x = cx + dx, y = cy + dy;
      if (x >= 0 && x < size && y >= 0 && y < size) { const d = Math.max(Math.abs(dx), Math.abs(dy)); set(x, y, d !== 2 && d !== 4); }
    }
  }
  for (let i = 0; i < size; i++) { if (!fixed[6][i]) set(i, 6, i % 2 === 0); if (!fixed[i][6]) set(6, i, i % 2 === 0); }
  const pos = alignPositions(ver);
  for (const ay of pos) for (const ax of pos) {
    if ((ax === 6 && ay === 6) || (ax === 6 && ay === pos.at(-1)) || (ax === pos.at(-1) && ay === 6)) continue;
    for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) set(ax + dx, ay + dy, Math.max(Math.abs(dx), Math.abs(dy)) !== 1);
  }
  const drawFormat = (mask) => {
    const data = (FORMAT[ecl] << 3) | mask;
    let rem = data;
    for (let i = 0; i < 10; i++) rem = (rem << 1) ^ ((rem >>> 9) * 0x537);
    const bits = ((data << 10) | rem) ^ 0x5412;
    for (let i = 0; i <= 5; i++) set(8, i, bit(bits, i));
    set(8, 7, bit(bits, 6)); set(8, 8, bit(bits, 7)); set(7, 8, bit(bits, 8));
    for (let i = 9; i < 15; i++) set(14 - i, 8, bit(bits, i));
    for (let i = 0; i < 8; i++) set(size - 1 - i, 8, bit(bits, i));
    for (let i = 8; i < 15; i++) set(8, size - 15 + i, bit(bits, i));
    set(8, size - 8, true);   // the dark module
  };
  drawFormat(0);   // reserves the format areas
  if (ver >= 7) {
    let rem = ver;
    for (let i = 0; i < 12; i++) rem = (rem << 1) ^ ((rem >>> 11) * 0x1f25);
    const bits = (ver << 12) | rem;
    for (let i = 0; i < 18; i++) { const a = size - 11 + (i % 3), b = Math.floor(i / 3); set(a, b, bit(bits, i)); set(b, a, bit(bits, i)); }
  }

  // Data, in the zigzag order.
  const words = codewords(bytes, ver, ecl);
  let i = 0;
  for (let right = size - 1; right >= 1; right -= 2) {
    if (right === 6) right = 5;
    for (let v = 0; v < size; v++) for (let j = 0; j < 2; j++) {
      const x = right - j;
      const y = ((right + 1) & 2) === 0 ? size - 1 - v : v;
      if (!fixed[y][x] && i < words.length * 8) { mod[y][x] = bit(words[i >>> 3], 7 - (i & 7)); i++; }
    }
  }

  // The mask that leaves the fewest long runs, 2×2 blocks and imbalance.
  const masked = (m) => mod.map((row, y) => row.map((d, x) => (fixed[y][x] ? d : d !== MASKS[m](x, y))));
  const penalty = (g) => {
    let p = 0;
    for (const lines of [g, g[0].map((_, x) => g.map((row) => row[x]))]) {
      for (const line of lines) {
        let run = 1;
        for (let k = 1; k <= line.length; k++) {
          if (k < line.length && line[k] === line[k - 1]) { run++; continue; }
          if (run >= 5) p += run - 2;
          run = 1;
        }
      }
    }
    for (let y = 0; y < size - 1; y++) for (let x = 0; x < size - 1; x++) {
      const c = g[y][x];
      if (c === g[y][x + 1] && c === g[y + 1][x] && c === g[y + 1][x + 1]) p += 3;
    }
    const dark = g.flat().filter(Boolean).length;
    return p + Math.floor(Math.abs(dark * 20 - size * size * 10) / (size * size)) * 10;
  };
  let best = 0, bestScore = Infinity;
  for (let m = 0; m < 8; m++) {
    drawFormat(m);
    const s = penalty(masked(m));
    if (s < bestScore) { best = m; bestScore = s; }
  }
  drawFormat(best);
  const out = masked(best);
  return { size, version: ver, dark: (x, y) => out[y][x] };
}

// The QR code as an SVG (dark squares in currentColor, a 4-square quiet border).
export function qrSvg(text, { label = 'QR code' } = {}) {
  const { size, dark } = qrMatrix(text);
  let d = '';
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) if (dark(x, y)) d += `M${x + 4} ${y + 4}h1v1h-1z`;
  const n = size + 8;
  return `<svg xmlns="http://www.w3.org/2000/svg" class="qr" viewBox="0 0 ${n} ${n}" role="img" aria-label="${label}" shape-rendering="crispEdges"><path fill="currentColor" d="${d}"/></svg>`;
}
