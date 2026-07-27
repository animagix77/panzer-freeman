const { chromium } = require('playwright');
const path = require('path');
(async () => {
  const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium',
    args: ['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--no-sandbox'] });
  const page = await b.newPage({ viewport: { width: 1280, height: 720 } });
  const errs = []; page.on('pageerror', e => errs.push(e.message));
  page.on('console', m => { if (m.type()==='error') errs.push(m.text()); });
  await page.goto('file://' + path.join(__dirname, '..', 'index.html'));
  await page.waitForTimeout(1300);
  await page.click('#startBtn');
  await page.waitForTimeout(400);
  await page.evaluate(() => window.__PF.setIntroT(1.0));
  await page.waitForTimeout(1800);

  const sample = () => page.evaluate(() => {
    const P = window.__PF, d = P.dragon;
    return {
      vy: +P.Player.vy.toFixed(1),
      effort: +d.getEffort().toFixed(3),
      flapRate: +(0.3 + d.getEffort() * 3.1).toFixed(2),
      wingZ: +d.wings[1].rotation.z.toFixed(3),
      wingSweep: +d.wings[1].rotation.y.toFixed(3),
      bodyY: +d.body.position.y.toFixed(3),
      pitch: +d.body.rotation.x.toFixed(3)
    };
  });

  console.log('level  ', JSON.stringify(await sample()));

  await page.keyboard.down('s');                 // inverted pitch: S = climb
  for (let i = 0; i < 4; i++) { await page.waitForTimeout(500); }
  console.log('CLIMB  ', JSON.stringify(await sample()));
  await page.screenshot({ path: 'fly-climb.png' });
  await page.keyboard.up('s');

  await page.keyboard.down('w');                 // W = dive
  for (let i = 0; i < 5; i++) { await page.waitForTimeout(500); }
  console.log('DIVE   ', JSON.stringify(await sample()));
  await page.screenshot({ path: 'fly-dive.png' });
  await page.keyboard.up('w');

  await page.waitForTimeout(1600);
  console.log('recover', JSON.stringify(await sample()));

  // sanity: the lift-bob spring must stay bounded over a long run
  let maxBob = 0;
  for (let i = 0; i < 14; i++) {
    await page.keyboard.down(i % 2 ? 'w' : 's');
    await page.waitForTimeout(260);
    await page.keyboard.up(i % 2 ? 'w' : 's');
    const s = await sample();
    maxBob = Math.max(maxBob, Math.abs(s.bodyY));
  }
  console.log('max |bob| after violent stick work:', maxBob.toFixed(3));
  console.log('ERRORS', errs.length ? errs.slice(0,4).join('\n') : 'none');
  await b.close();
})();
