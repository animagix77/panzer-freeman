const fs = require('fs');
function readWav(f) {
  const b = fs.readFileSync(f);
  const sr = b.readUInt32LE(24);
  const n = b.readUInt32LE(40) / 2;
  const d = new Float32Array(n);
  for (let i = 0; i < n; i++) d[i] = b.readInt16LE(44 + i * 2) / 32768;
  return { sr, d };
}
// Goertzel energy at a given frequency over a window
function goertzel(x, off, N, f, sr) {
  const k = 2 * Math.cos(2 * Math.PI * f / sr);
  let s0 = 0, s1 = 0, s2 = 0;
  for (let i = 0; i < N; i++) { s0 = x[off + i] + k * s1 - s2; s2 = s1; s1 = s0; }
  return Math.sqrt(Math.max(0, s1 * s1 + s2 * s2 - k * s1 * s2)) / N;
}
const BANDS = [
  ['sub  40-90Hz  ', [45, 60, 75, 90]],
  ['bass 90-250   ', [110, 150, 190, 240]],
  ['lowmid 250-700', [280, 350, 450, 620]],
  ['gtr  700-2k   ', [780, 1000, 1400, 1900]],
  ['pres 2k-6k    ', [2400, 3200, 4200, 5400]],
  ['air  6k-14k   ', [7000, 9000, 11000, 13000]]
];
for (const name of process.argv.slice(2)) {
  const { sr, d } = readWav(name);
  const N = 8192, hops = 40;
  const acc = BANDS.map(() => 0);
  for (let h = 0; h < hops; h++) {
    const off = Math.floor(sr * 1.0 + h * (d.length - sr * 2 - N) / hops);
    BANDS.forEach((bd, bi) => {
      let e = 0; bd[1].forEach(f => { e += goertzel(d, off, N, f, sr); });
      acc[bi] += e / bd[1].length;
    });
  }
  const max = Math.max(...acc);
  console.log('\n' + name);
  BANDS.forEach((bd, i) => {
    const rel = acc[i] / max;
    console.log('  ' + bd[0] + ' ' + '#'.repeat(Math.round(rel * 40)).padEnd(40) + ' ' + (rel * 100).toFixed(0) + '%');
  });
  // onset rate: count sharp energy rises in a 30ms envelope
  const W = Math.floor(sr * 0.01);
  const env = [];
  for (let i = 0; i + W < d.length; i += W) {
    let s = 0; for (let j = 0; j < W; j++) s += d[i + j] * d[i + j];
    env.push(Math.sqrt(s / W));
  }
  let onsets = 0;
  for (let i = 2; i < env.length; i++) if (env[i] > env[i - 1] * 1.7 && env[i] > 0.04) onsets++;
  console.log('  onsets/sec: ' + (onsets / (d.length / sr)).toFixed(1));
}
