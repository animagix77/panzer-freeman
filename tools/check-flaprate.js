const { chromium } = require('playwright');
const path = require('path');
(async () => {
  const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium',
    args: ['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--no-sandbox'] });
  const page = await b.newPage({ viewport: { width: 1280, height: 720 } });
  const errs = []; page.on('pageerror', e => errs.push(e.message));
  await page.goto('file://' + path.join(__dirname, '..', 'index.html'));
  await page.waitForTimeout(1300);
  await page.click('#startBtn'); await page.waitForTimeout(400);
  await page.evaluate(() => window.__PF.setIntroT(1.0));
  await page.waitForTimeout(1500);

  // count real wingbeats per second of GAME time (the sandbox renders slowly)
  await page.evaluate(() => {
    const P = window.__PF;
    P.__beats = 0;
    const prev = P.dragon.onBeat;
    P.dragon.onBeat = function (pw, ef) { P.__beats++; if (prev) prev(pw, ef); };
  });

  const measure = async (key, label, settleMs, sampleMs) => {
    if (key) await page.keyboard.down(key);
    await page.waitForTimeout(settleMs);
    const t0 = await page.evaluate(() => { window.__PF.__beats = 0; return window.__PF.Game.time; });
    await page.waitForTimeout(sampleMs);
    const r = await page.evaluate((s) => {
      const P = window.__PF;
      return { beats: P.__beats, dt: P.Game.time - s, effort: +P.dragon.getEffort().toFixed(2),
               vy: +P.Player.vy.toFixed(0) };
    }, t0);
    if (key) await page.keyboard.up(key);
    const hz = r.dt > 0 ? r.beats / r.dt : 0;
    console.log(label.padEnd(22) + 'vy=' + String(r.vy).padStart(4) +
                '  effort=' + String(r.effort).padStart(4) +
                '  ' + hz.toFixed(2) + ' flaps/sec' +
                (hz > 0.01 ? '   (one every ' + (1 / hz).toFixed(1) + 's)' : ''));
    return hz;
  };

  const idle  = await measure(null, 'IDLE / level glide', 1500, 9000);
  await page.waitForTimeout(800);
  const climb = await measure('s', 'CLIMBING', 2500, 9000);
  await page.waitForTimeout(2000);
  const dive  = await measure('w', 'DIVING', 2500, 11000);

  console.log('\nclimb is ' + (climb / Math.max(idle, .01)).toFixed(1) + 'x the idle rate, ' +
              (climb / Math.max(dive, .01)).toFixed(1) + 'x the dive rate');
  const bob = await page.evaluate(() => Math.abs(window.__PF.dragon.getBob()).toFixed(3));
  console.log('bob magnitude sample:', bob);
  console.log('ERRORS', errs.length ? errs.join('\n') : 'none');
  await b.close();
})();
