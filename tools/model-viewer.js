const { chromium } = require('playwright');
const path = require('path');
(async () => {
  const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium',
    args: ['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--no-sandbox'] });
  const page = await b.newPage({ viewport: { width: 1100, height: 700 } });
  const errs = []; page.on('pageerror', e => errs.push(e.message));
  await page.goto('file://' + path.join(__dirname, '..', 'index.html'));
  await page.waitForTimeout(1500);
  await page.click('#startBtn'); await page.waitForTimeout(400);
  await page.evaluate(() => window.__PF.setIntroT(1.0));
  await page.waitForTimeout(1500);

  // freeze the game and take over the camera to inspect the model alone
  await page.evaluate(() => {
    const P = window.__PF;
    P.Game.state = 'modelview';
    ['card','toast','quip','skiphint','hud','scan','vig','tint'].forEach(function(id){
      var el = document.getElementById(id); if (el) el.style.display = 'none';
    });
    P.terrain.group.visible = false;
    P.scene.children.forEach(c => { if (c.type === 'Group' && c !== P.dragon.root) c.visible = false; });
    P.dragon.root.visible = true;
    P.ambLight.intensity = 1.5; P.keyLight.intensity = 1.5;
    P.scene.fog.far = 100000; P.scene.fog.near = 90000;
    window.__view = (az, el, dist) => {
      const d = P.dragon, c = P.camera, T = window.THREE;
      const o = new T.Vector3(); d.root.getWorldPosition(o); o.y += 0.4;
      c.fov = 40; c.updateProjectionMatrix();
      c.position.set(
        o.x + Math.sin(az) * Math.cos(el) * dist,
        o.y + Math.sin(el) * dist,
        o.z + Math.cos(az) * Math.cos(el) * dist);
      c.lookAt(o);
      P.skyMesh.position.copy(c.position);
      P.renderer.render(P.scene, P.camera);
    };
  });
  const shot = async (az, el, dist, name) => {
    await page.evaluate(([a,e,d]) => window.__view(a,e,d), [az, el, dist]);
    await page.waitForTimeout(250);
    await page.screenshot({ path: name });
  };
  await shot(2.6, 0.35, 26, 'model-3q.png');     // three-quarter front
  await shot(1.57, 0.12, 26, 'model-side.png');  // pure side
  await shot(0.0, 0.85, 26, 'model-top.png');    // from above/behind
  console.log('ERRORS', errs.length ? errs.join('\n') : 'none');
  await b.close();
})();
