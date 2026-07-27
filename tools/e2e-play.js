const { chromium } = require('playwright');
const path = require('path');

(async () => {
  const browser = await chromium.launch({
    executablePath: '/opt/pw-browsers/chromium',
    args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader',
           '--disable-gpu-sandbox', '--no-sandbox', '--enable-webgl', '--ignore-gpu-blocklist']
  });
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  const errors = [], logs = [];
  page.on('console', m => { logs.push(m.type() + ': ' + m.text()); if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', e => errors.push('PAGEERROR: ' + e.message + '\n' + (e.stack || '').split('\n').slice(0, 4).join('\n')));

  await page.goto('file://' + path.join(__dirname, '..', 'index.html'));
  await page.waitForTimeout(2500);
  await page.screenshot({ path: 'shot-title.png' });

  // start the game
  await page.click('#startBtn');
  await page.waitForTimeout(500);
  await page.evaluate(() => window.__PF.setIntroT(1.0));
  await page.waitForTimeout(1800);
  await page.screenshot({ path: 'shot-ep1-card.png' });

  // fly + shoot
  await page.mouse.move(700, 340);
  for (let i = 0; i < 6; i++) {
    await page.keyboard.down('d'); await page.waitForTimeout(220); await page.keyboard.up('d');
    await page.mouse.move(560 + i * 40, 300 + (i % 3) * 40);
    await page.mouse.down(); await page.waitForTimeout(420);
    await page.mouse.move(660 - i * 30, 340 - (i % 3) * 30);
    await page.waitForTimeout(260);
    await page.mouse.up();
    await page.waitForTimeout(300);
  }
  await page.screenshot({ path: 'shot-combat.png' });

  // rotate view
  await page.keyboard.press('e');
  await page.waitForTimeout(900);
  await page.screenshot({ path: 'shot-view-right.png' });
  await page.keyboard.press('e');
  await page.waitForTimeout(1400);
  await page.screenshot({ path: 'shot-view-back.png' });
  await page.keyboard.press('q'); await page.keyboard.press('q');
  await page.waitForTimeout(900);

  // fast-forward to episode 2 / 3 / boss by driving railZ
  const jump = async (z) => {
    await page.evaluate((zz) => { window.__PF.Game.railZ = zz; }, z);
    await page.waitForTimeout(1500);
  };
  await page.evaluate(() => { window.__PF.Game.railZ = window.__PF.Game.epStartZ + 5399; });
  await page.waitForTimeout(2600);
  await page.screenshot({ path: 'shot-ep2.png' });

  await page.evaluate(() => { window.__PF.Game.railZ = window.__PF.Game.epStartZ + 5399; });
  await page.waitForTimeout(2600);
  await page.screenshot({ path: 'shot-ep3.png' });

  await page.evaluate(() => { window.__PF.Game.railZ = window.__PF.Game.epStartZ + 5199; });
  await page.waitForTimeout(5000);
  await page.screenshot({ path: 'shot-boss.png' });

  // shoot at the boss a while
  for (let i = 0; i < 8; i++) {
    await page.mouse.move(600 + (i % 4) * 60, 300 + (i % 3) * 50);
    await page.mouse.down(); await page.waitForTimeout(500);
    await page.mouse.move(680 - (i % 4) * 40, 340 - (i % 3) * 40);
    await page.waitForTimeout(300); await page.mouse.up();
    await page.waitForTimeout(250);
  }
  await page.screenshot({ path: 'shot-boss2.png' });

  const state = await page.evaluate(() => {
    const P = window.__PF;
    return {
      state: P.Game.state, age: P.Game.age, score: P.Game.score, kills: P.Game.kills,
      ep: P.Game.epIndex, enemies: P.entities.enemies.length,
      bossActive: P.Boss.active,
      bossCores: P.Boss.built ? P.Boss.built.cores.map(c => c.hp) : null,
      shards: P.entities.shards.length, ebullets: P.entities.ebullets.length,
      fps: null
    };
  });

  // measure frame rate
  const fps = await page.evaluate(() => new Promise(res => {
    let n = 0; const t0 = performance.now();
    function tick() { n++; if (performance.now() - t0 < 2000) requestAnimationFrame(tick); else res(Math.round(n / ((performance.now() - t0) / 1000))); }
    requestAnimationFrame(tick);
  }));

  console.log('STATE', JSON.stringify(state, null, 1));
  console.log('FPS(swiftshader)', fps);
  console.log('ERRORS', errors.length ? errors.slice(0, 12).join('\n---\n') : 'none');
  await browser.close();
})();
