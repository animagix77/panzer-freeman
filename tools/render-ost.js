const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

(async () => {
  const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium',
    args: ['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--no-sandbox'] });
  const page = await b.newPage({ viewport: { width: 800, height: 600 } });
  const errs = []; page.on('pageerror', e => errs.push(e.message));
  await page.goto('file://' + path.join(__dirname, '..', 'index.html'));
  await page.waitForTimeout(1500);

  const tracks = process.argv[2] ? [process.argv[2]] : ['title','ep1','ep2','ep3','boss'];
  const SECS_ARG = process.argv[3] ? +process.argv[3] : 0;
  for (const name of tracks) {
    const res = await page.evaluate(async (n) => {
      const P = window.__PF, A = P.Audio_;
      const SR = 44100, SECS = n.secs || 24;
      const off = new OfflineAudioContext(1, SR * SECS, SR);
      A.started = false;
      A.init(off);
      A.muted = false;
      const s = P.SONGS[n.n];
      A.setSong(s);
      const stepTime = 60 / s.bpm / 4;
      const total = Math.floor((SECS - 0.3) / stepTime);
      for (let i = 0; i < total; i++) A._step(i, 0.1 + i * stepTime);
      const buf = await off.startRendering();
      const d = buf.getChannelData(0);

      // stats
      let peak = 0, sum = 0, clipped = 0;
      const perSec = [];
      for (let s2 = 0; s2 < SECS; s2++) {
        let ss = 0;
        for (let i = s2 * SR; i < (s2 + 1) * SR && i < d.length; i++) {
          const v = d[i]; const a = Math.abs(v);
          if (a > peak) peak = a;
          if (a >= 0.999) clipped++;
          sum += v * v; ss += v * v;
        }
        perSec.push(+Math.sqrt(ss / SR).toFixed(3));
      }
      // 16-bit WAV
      const N = d.length, hdr = 44, ab = new ArrayBuffer(hdr + N * 2), dv = new DataView(ab);
      const wr = (o, str) => { for (let i = 0; i < str.length; i++) dv.setUint8(o + i, str.charCodeAt(i)); };
      wr(0, 'RIFF'); dv.setUint32(4, 36 + N * 2, true); wr(8, 'WAVEfmt ');
      dv.setUint32(16, 16, true); dv.setUint16(20, 1, true); dv.setUint16(22, 1, true);
      dv.setUint32(24, SR, true); dv.setUint32(28, SR * 2, true);
      dv.setUint16(32, 2, true); dv.setUint16(34, 16, true);
      wr(36, 'data'); dv.setUint32(40, N * 2, true);
      for (let i = 0; i < N; i++) {
        let v = Math.max(-1, Math.min(1, d[i]));
        dv.setInt16(hdr + i * 2, v < 0 ? v * 0x8000 : v * 0x7fff, true);
      }
      let bin = '', u8 = new Uint8Array(ab);
      for (let i = 0; i < u8.length; i += 8192)
        bin += String.fromCharCode.apply(null, u8.subarray(i, i + 8192));
      return { peak: +peak.toFixed(3), rms: +Math.sqrt(sum / N).toFixed(4),
               clipped, perSec, b64: btoa(bin), bpm: s.bpm, bars: s.flat.length / 16 };
    }, { n: name, secs: SECS_ARG || (name === 'title' ? 52 : 24) });
    fs.writeFileSync(`ost-${name}.wav`, Buffer.from(res.b64, 'base64'));
    console.log(`${name.padEnd(6)} bpm=${res.bpm} loop=${res.bars}bars peak=${res.peak} rms=${res.rms} clipped=${res.clipped}`);
    console.log(`       energy/s: ${res.perSec.join(' ')}`);
  }
  console.log('ERRORS', errs.length ? errs.slice(0,4).join('\n') : 'none');
  await b.close();
})();
