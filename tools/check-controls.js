const { chromium } = require('playwright');
const path = require('path');
(async () => {
  const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium',
    args: ['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--no-sandbox'] });
  const page = await b.newPage({ viewport: { width: 1280, height: 720 } });
  const errs = []; page.on('pageerror', e => errs.push(e.message));
  await page.goto('file://' + path.join(__dirname, '..', 'index.html'));
  await page.waitForTimeout(1300);
  await page.evaluate(() => window.__PF && window.__PF.setMaxH && window.__PF.setMaxH(300));
  await page.click('#startBtn');
  await page.waitForTimeout(400);
  await page.evaluate(() => window.__PF.setIntroT(1.0));
  await page.waitForTimeout(1500);

  // camera-space displacement: +X = screen right, +Y = screen up
  const probe = async (key, ms) => {
    const before = await page.evaluate(() => {
      const P = window.__PF, T = window.THREE;
      const r = new T.Vector3(), u = new T.Vector3(), f = new T.Vector3();
      P.camera.matrixWorld.extractBasis(r, u, f);
      return { p: P.Player.pos.toArray(), r: r.toArray(), u: u.toArray() };
    });
    await page.keyboard.down(key); await page.waitForTimeout(ms); await page.keyboard.up(key);
    await page.waitForTimeout(120);
    const after = await page.evaluate(() => window.__PF.Player.pos.toArray());
    const d = [after[0]-before.p[0], after[1]-before.p[1], after[2]-before.p[2]];
    const screenX = d[0]*before.r[0] + d[1]*before.r[1] + d[2]*before.r[2];
    const screenY = d[0]*before.u[0] + d[1]*before.u[1] + d[2]*before.u[2];
    return { screenX: +screenX.toFixed(2), screenY: +screenY.toFixed(2) };
  };

  const view = async () => page.evaluate(() => window.__PF.Player.viewIndex);
  console.log('FORWARD view');
  console.log('  D ->', await probe('d', 700));
  console.log('  A ->', await probe('a', 700));
  console.log('  W ->', await probe('w', 700));
  console.log('  S ->', await probe('s', 700));

  await page.keyboard.press('e'); await page.waitForTimeout(1600);
  console.log('after E, viewIndex =', await view(), '(rail motion projects onto screenX here,');
  const sD = await probe('d', 700), sN = await probe('n', 700), sA = await probe('a', 700);
  console.log('   so compare against a no-input baseline)');
  console.log('  D ->', sD, ' idle ->', sN, ' A ->', sA);
  console.log('  D-idle =', +(sD.screenX - sN.screenX).toFixed(2),
              ' A-idle =', +(sA.screenX - sN.screenX).toFixed(2));
  console.log('  W ->', await probe('w', 700));

  await page.keyboard.press('e'); await page.waitForTimeout(1400);
  console.log('after E, viewIndex =', await view(), '(astern)');
  console.log('  D ->', await probe('d', 700));

  await page.keyboard.press('i'); await page.waitForTimeout(300);
  console.log('after I (pitch normal)');
  console.log('  W ->', await probe('w', 700));

  console.log('ERRORS', errs.length ? errs.join('\n') : 'none');
  await b.close();
})();
