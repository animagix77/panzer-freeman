const { chromium } = require('playwright');
const path = require('path');
(async () => {
  const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium',
    args: ['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--no-sandbox'] });
  const page = await b.newPage({ viewport: { width: 1280, height: 720 } });
  await page.goto('file://' + path.join(__dirname, '..', 'index.html'));
  await page.waitForTimeout(1200);
  await page.evaluate(() => window.__PF && window.__PF.setMaxH && window.__PF.setMaxH(300));
  await page.click('#startBtn'); await page.waitForTimeout(400);
  await page.evaluate(() => window.__PF.setIntroT(1.0));
  await page.waitForTimeout(2600);
  // worst case: full volley in flight plus impacts
  await page.evaluate(() => {
    const P = window.__PF, T = window.THREE;
    for (let i = 0; i < 8; i++) {
      const e = P.entities.spawnEnemy('wasp');
      e.pos.set(-20 + i*6, P.Player.railY + 8, P.Game.railZ + 170); e.hp = 99; e.g.position.copy(e.pos);
      P.Locks.list.push(e);
    }
    P.entities.fireLasers();
    for (let i = 0; i < 6; i++) P.entities.spawnImpact(
      new T.Vector3(-10+i*4, P.Player.railY+6, P.Game.railZ+60), 0x7fe8ff, 1.2);
  });
  await page.waitForTimeout(500);
  const r = await page.evaluate(() => {
    const P = window.__PF, E = P.entities;
    const t = [];
    // time the pure-JS simulation without the GL draw
    let t0 = performance.now();
    for (let i=0;i<60;i++){ E.updateEnemies(0.016); E.updateProjectiles(0.016); E.updatePlayer(0.016); }
    t.push(['sim x60 (ms)', +(performance.now()-t0).toFixed(1)]);
    t0 = performance.now();
    for (let i=0;i<20;i++) P.renderer.render(P.scene, P.camera);
    t.push(['render x20 (ms)', +(performance.now()-t0).toFixed(1)]);
    return { timings: t, drawCalls: P.renderer.info.render.calls,
             tris: P.renderer.info.render.triangles, objects: P.scene.children.length,
             enemies: E.enemies.length };
  });
  console.log(JSON.stringify(r, null, 1));
  await b.close();
})();
