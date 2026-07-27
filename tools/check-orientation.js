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
  await page.waitForTimeout(1600);

  // Measure the dragon's ACTUAL world orientation against the camera basis.
  const probe = () => page.evaluate(() => {
    const P = window.__PF, T = window.THREE;
    P.dragon.root.updateMatrixWorld(true);
    const body = P.dragon.body;
    const o  = new T.Vector3(0,0,0).applyMatrix4(body.matrixWorld);
    const nz = new T.Vector3(0,0,10).applyMatrix4(body.matrixWorld).sub(o).normalize();
    const tipL = new T.Vector3(-5,0,0).applyMatrix4(P.dragon.wings[0].matrixWorld);
    const tipR = new T.Vector3( 5,0,0).applyMatrix4(P.dragon.wings[1].matrixWorld);
    const r = new T.Vector3(), u = new T.Vector3(), f = new T.Vector3();
    P.camera.matrixWorld.extractBasis(r, u, f);
    // which wingtip is on the viewer's right?
    const dotL = tipL.clone().sub(o).dot(r), dotR = tipR.clone().sub(o).dot(r);
    const screenRightTip = dotR > dotL ? tipR : tipL;
    const screenLeftTip  = dotR > dotL ? tipL : tipR;
    return {
      nosePitchY: +nz.y.toFixed(3),                    // >0 = nose up
      noseYawRight: +nz.dot(r).toFixed(3),             // >0 = nose turned screen-right
      rightWingHeight: +(screenRightTip.y - o.y).toFixed(2),
      leftWingHeight:  +(screenLeftTip.y  - o.y).toFixed(2),
      vy: +P.Player.vy.toFixed(1)
    };
  });

  const hold = async (key, ms) => {
    if (key) await page.keyboard.down(key);
    await page.waitForTimeout(ms);
    const s = await probe();
    if (key) await page.keyboard.up(key);
    return s;
  };

  console.log('LEVEL      ', JSON.stringify(await hold(null, 600)));
  console.log('STRAFE RIGHT', JSON.stringify(await hold('d', 1600)));
  await page.waitForTimeout(1200);
  console.log('STRAFE LEFT ', JSON.stringify(await hold('a', 1600)));
  await page.waitForTimeout(1200);
  console.log('CLIMB (S)  ', JSON.stringify(await hold('s', 2000)));
  await page.waitForTimeout(1500);
  console.log('DIVE  (W)  ', JSON.stringify(await hold('w', 2000)));
  console.log('ERRORS', errs.length ? errs.join('\n') : 'none');
  await b.close();
})();
