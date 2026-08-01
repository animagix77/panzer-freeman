// Rider-framed turntable. Usage: node tools/rider-view.js <outDir> [age]
const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

const outDir = process.argv[2] || '/tmp/before';
const age = parseFloat(process.argv[3] || '89');
fs.mkdirSync(outDir, { recursive: true });

(async () => {
  const b = await chromium.launch({
    executablePath: '/opt/pw-browsers/chromium',
    args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox']
  });
  const page = await b.newPage({ viewport: { width: 900, height: 1000 } });
  const errs = []; page.on('pageerror', e => errs.push(e.message));
  await page.goto('file://' + path.join(__dirname, '..', 'index.html'));
  await page.waitForTimeout(1500);
  await page.click('#startBtn'); await page.waitForTimeout(400);
  await page.evaluate(() => window.__PF.setIntroT(1.0));
  await page.waitForTimeout(1500);

  await page.evaluate((v) => { window.__RIDER_ONLY = v; }, !!process.env.RIDER_ONLY);
  await page.evaluate((age) => {
    const P = window.__PF;
    P.Game.state = 'modelview';
    ['card', 'toast', 'quip', 'skiphint', 'hud', 'scan', 'vig', 'tint'].forEach(function (id) {
      var el = document.getElementById(id); if (el) el.style.display = 'none';
    });
    P.terrain.group.visible = false;
    P.scene.children.forEach(c => { if (c.type === 'Group' && c !== P.dragon.root) c.visible = false; });
    P.dragon.root.visible = true;
    P.dragon.setAge(age);
    // RIDER_ONLY: hide the dragon so neck spikes and wings stop occluding the
    // thing being reviewed. Gates were being read through a screen of scenery.
    if (window.__RIDER_ONLY) {
      const keep = new Set();
      P.dragon.rider.traverse(o => keep.add(o));
      P.dragon.root.traverse(o => {
        if (o.isMesh && !keep.has(o)) o.visible = false;
      });
    }
    if (!window.__RIDER_ONLY) { P.ambLight.intensity = 1.45; P.keyLight.intensity = 1.55; }
    P.scene.fog.far = 100000; P.scene.fog.near = 90000;

    window.__view = (az, el, dist) => {
      const P = window.__PF, T = window.THREE;
      const o = new T.Vector3();
      if (window.__FACE) { P.dragon.headR.getWorldPosition(o); }
      else { P.dragon.rider.getWorldPosition(o); o.y += 0.55; }
      const c = P.camera;
      c.fov = 34; c.updateProjectionMatrix();
      c.position.set(
        o.x + Math.sin(az) * Math.cos(el) * dist,
        o.y + Math.sin(el) * dist,
        o.z + Math.cos(az) * Math.cos(el) * dist);
      c.lookAt(o);
      P.skyMesh.position.copy(c.position);
      P.renderer.render(P.scene, P.camera);
    };
  }, age);

  const shot = async (az, el, dist, name) => {
    await page.evaluate(([a, e, d]) => window.__view(a, e, d), [az, el, dist]);
    await page.waitForTimeout(220);
    await page.screenshot({ path: path.join(outDir, name) });
  };

  const tag = 'a' + Math.round(age);
  if (process.env.TURNTABLE) {
    for (let k = 0; k < 8; k++) {
      await shot(k / 8 * Math.PI * 2, 0.10, 5.2, `tt-${k}-${tag}.png`);
    }
  }
  await shot(0, 0.06, 5.2, `rider-front-${tag}.png`);
  await shot(Math.PI * 0.25, 0.10, 5.2, `rider-3q-${tag}.png`);
  await shot(Math.PI * 0.5, 0.06, 5.2, `rider-side-${tag}.png`);
  await page.evaluate(() => { window.__FACE = 1; });
  await shot(0, 0.05, 1.5, `rider-face-${tag}.png`);
  await shot(Math.PI * 0.28, 0.10, 1.7, `rider-face3q-${tag}.png`);
  await page.evaluate(() => { window.__FACE = 0; });
  await shot(Math.PI * 0.22, 0.30, 3.4, `rider-bust-${tag}.png`);

  console.log('ERRORS', errs.length ? errs.join('\n') : 'none');
  await b.close();
})();
