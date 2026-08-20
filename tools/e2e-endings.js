const { chromium } = require('playwright');
const path = require('path');
(async () => {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium',
    args: ['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--no-sandbox'] });
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  const errors = [];
  page.on('pageerror', e => errors.push('PAGEERROR: ' + e.message));
  page.on('console', m => { if (m.type()==='error') errors.push(m.text()); });
  await page.goto('file://' + path.join(__dirname, '..', 'index.html'));
  await page.waitForTimeout(1500);
  await page.evaluate(() => window.__PF && window.__PF.setMaxH && window.__PF.setMaxH(300));

  // --- pause test
  await page.click('#startBtn');
  await page.waitForTimeout(500);
  await page.evaluate(() => window.__PF.setIntroT(1.0)); await page.waitForTimeout(800);
  await page.keyboard.press('p'); await page.waitForTimeout(400);
  const paused = await page.evaluate(() => window.__PF.Game.state);
  await page.screenshot({ path: 'shot-paused.png' });
  await page.keyboard.press('p'); await page.waitForTimeout(300);

  // --- game over path
  await page.evaluate(() => { window.__PF.Game.invulnT = 0; window.__PF.damagePlayer(30, true); window.__PF.Game.invulnT = 0; window.__PF.damagePlayer(30, true); });
  await page.waitForTimeout(1200);
  const overState = await page.evaluate(() => window.__PF.Game.state);
  const overText = await page.evaluate(() => document.getElementById('overStats').textContent);
  await page.screenshot({ path: 'shot-over.png' });

  // --- restart + win path
  await page.click('#againBtn'); await page.waitForTimeout(900);
  // Skip the restart cinematic too. Under swiftshader the page runs at ~3 fps,
  // so INTRO_LEN's 7.4 s of game time costs ~50 s of wall clock and used to eat
  // the whole walk budget — the boss then never spawned and this test failed on
  // timing rather than on anything the game did.
  await page.evaluate(() => window.__PF.setIntroT(1.0));
  await page.waitForTimeout(900);
  // walk forward through the episodes until the boss shows up
  for (let g = 0; g < 40; g++) {
    const st = await page.evaluate(() => {
      const P = window.__PF;
      return { ep: P.Game.epIndex, boss: P.Boss.active, state: P.Game.state };
    });
    if (st.boss) break;
    if (st.ep < 3) {
      await page.evaluate(() => {
        const P = window.__PF;
        P.Game.railZ = P.Game.epStartZ + P.world.EPISODES[P.Game.epIndex].length + 1;
      });
    }
    await page.waitForTimeout(900);
  }
  const bossOn = await page.evaluate(() => window.__PF.Boss.active);
  await page.evaluate(() => { window.__PF.Game.age = 41; });
  await page.evaluate(() => {
    const P = window.__PF;
    P.Boss.built.cores.forEach(c => { if (c.alive) { c.hp = 1; } });
  });
  // shoot the cores dead
  // Budget, not a guess: the rider model is ~10k tris and swiftshader runs the
  // page at ~3 fps, so every keypress and volley costs real wall clock. 60
  // iterations left the last core alive on a heavier scene.
  for (let i=0;i<110;i++){
    const alive = await page.evaluate(()=> window.__PF.Boss.active && !window.__PF.Boss.dead);
    if (!alive) break;
    const need = await page.evaluate(() => {
      const P = window.__PF;
      return Math.round(P.Boss.angle / (Math.PI/2)) - P.Player.viewIndex;
    });
    for (let n = 0; n < Math.abs(need); n++) { await page.keyboard.press(need > 0 ? 'e' : 'q'); await page.waitForTimeout(140); }
    if (need) await page.waitForTimeout(900);
    const s2 = await page.evaluate(() => {
      const P = window.__PF, T = window.THREE;
      const c = P.Boss.built.cores.find(c=>c.alive); if(!c) return null;
      c.hp = 3;
      const wp = new T.Vector3(); c.group.getWorldPosition(wp);
      const cv = wp.clone(); P.camera.worldToLocal(cv);
      if (cv.z > -1) return 'behind';
      const pv = wp.project(P.camera);
      return [Math.round((pv.x*.5+.5)*1280), Math.round((-pv.y*.5+.5)*720)];
    });
    if (!s2) break;
    if (s2 === 'behind') { await page.waitForTimeout(400); continue; }
    await page.mouse.move(s2[0], s2[1]);
    await page.mouse.down(); await page.waitForTimeout(450); await page.mouse.up();
    await page.waitForTimeout(700);
    if (i % 6 === 0) console.log('  iter', i, await page.evaluate(()=> JSON.stringify({
      cores: window.__PF.Boss.built.cores.map(c=>[Math.round(c.hp), c.alive]),
      ang: window.__PF.Boss.angle.toFixed(2), view: window.__PF.Player.viewIndex,
      phase: window.__PF.Boss.phase, dead: window.__PF.Boss.dead })));
  }
  for (let k=0;k<50;k++){
    await page.waitForTimeout(700);
    if (await page.evaluate(()=>window.__PF.Game.state !== 'playing')) break;
  }
  const winState = await page.evaluate(() => window.__PF.Game.state);
  await page.screenshot({ path: 'shot-win.png' });
  const winText = await page.evaluate(() => document.getElementById('winStats').textContent + ' | ' + document.getElementById('winAge').textContent);
  console.log(JSON.stringify({ paused, overState, overText, bossOn, winState, winText }, null, 1));
  console.log('ERRORS', errors.length ? errors.slice(0,8).join('\n') : 'none');
  await browser.close();
})();
