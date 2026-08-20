const { chromium } = require('playwright');
const path = require('path');
(async () => {
  const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium',
    args: ['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--no-sandbox'] });
  const page = await b.newPage({ viewport: { width: 1280, height: 720 } });
  const errs = [];
  page.on('pageerror', e => errs.push(e.message + '\n' + (e.stack||'').split('\n')[1]));
  page.on('console', m => { if (m.type()==='error') errs.push(m.text()); });
  await page.goto('file://' + path.join(__dirname, '..', 'index.html'));
  await page.waitForTimeout(1300);
  await page.evaluate(() => window.__PF && window.__PF.setMaxH && window.__PF.setMaxH(300));
  await page.click('#startBtn');
  await page.waitForTimeout(400);
  await page.evaluate(() => window.__PF.setIntroT(1.0));
  await page.waitForTimeout(1800);

  // plant a cluster of targets dead ahead, lock them all, fire
  await page.evaluate(() => {
    const P = window.__PF, T = window.THREE;
    for (let i = 0; i < 6; i++) {
      const e = P.entities.spawnEnemy('wasp');
      e.pos.set(-18 + i * 7, P.Player.railY + 6 + (i % 3) * 5, P.Game.railZ + 150);
      e.hold = 150; e.hp = 99;
      e.g.position.copy(e.pos);
    }
  });
  await page.waitForTimeout(300);
  await page.mouse.move(640, 330);
  await page.mouse.down();
  for (let i = 0; i < 10; i++) { await page.mouse.move(560 + i*18, 320 + (i%3)*14); await page.waitForTimeout(90); }
  const locks = await page.evaluate(() => window.__PF.Locks.list.length);
  await page.mouse.up();
  await page.waitForTimeout(320);
  await page.screenshot({ path: 'laser-1.png' });
  await page.waitForTimeout(280);
  await page.screenshot({ path: 'laser-2.png' });
  await page.waitForTimeout(260);
  await page.screenshot({ path: 'laser-3.png' });

  // A homing bolt takes ~1.5 s of game time to close on a target 300 units out.
  // Headless runs at ~3 fps, so the old 860 ms sample landed while every laser
  // was still in flight and the run always reported 0 hits — which looked like
  // a broken weapon rather than an impatient test.
  for (let k = 0; k < 30; k++) {
    await page.waitForTimeout(400);
    if (await page.evaluate(() => window.__PF.entities.lasers.length === 0)) break;
  }
  const st = await page.evaluate(() => ({
    lasers: window.__PF.entities.lasers.length,
    hits: window.__PF.Game.hits,
    shots: window.__PF.Game.shots,
    calls: window.__PF.renderer.info.render.calls
  }));
  console.log('locks painted:', locks, JSON.stringify(st));
  console.log(st.hits > 0 ? 'homing: bolts connect' : 'homing: NO HITS — investigate');
  console.log('ERRORS', errs.length ? errs.slice(0,5).join('\n') : 'none');
  await b.close();
})();
