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
  await page.click('#startBtn'); await page.waitForTimeout(400);
  await page.evaluate(() => window.__PF.setIntroT(1.0));
  await page.waitForTimeout(1800);

  // Tail tip offset measured against the camera's right/up axes.
  // Negative lateral = tail swung toward screen-LEFT.
  const probe = () => page.evaluate(() => {
    const P = window.__PF, T = window.THREE;
    P.dragon.root.updateMatrixWorld(true);
    const tail = P.dragon.tail, tip = tail[tail.length - 1];
    const o = new T.Vector3(0,0,0).applyMatrix4(P.dragon.body.matrixWorld);
    const p = new T.Vector3(0,0,-1).applyMatrix4(tip.matrixWorld).sub(o);
    const r = new T.Vector3(), u = new T.Vector3(), f = new T.Vector3();
    P.camera.matrixWorld.extractBasis(r, u, f);
    return { lat: +p.dot(r).toFixed(2), vert: +p.dot(u).toFixed(2),
             sumY: +tail.reduce((a,s)=>a+s.rotation.y,0).toFixed(3) };
  });

  const run = async (key, label, ms) => {
    if (key) await page.keyboard.down(key);
    const samples = [];
    for (let i = 0; i < 5; i++) { await page.waitForTimeout(ms/5); samples.push(await probe()); }
    if (key) await page.keyboard.up(key);
    const last = samples[samples.length-1];
    const lats = samples.map(s=>s.lat);
    console.log(label.padEnd(20) + 'tip lateral=' + String(last.lat).padStart(6) +
                '  vert=' + String(last.vert).padStart(6) +
                '  samples[' + lats.join(', ') + ']');
    return last;
  };

  console.log('(negative lateral = tail swung toward screen-LEFT)\n');
  const idle = await run(null, 'IDLE', 4000);
  const right = await run('d', 'STRAFE RIGHT', 2500);
  await page.waitForTimeout(2500);
  const left = await run('a', 'STRAFE LEFT', 2500);
  await page.waitForTimeout(7000);   // let the spring finish ringing out
  const settle = await run(null, 'SETTLED AGAIN', 3000);

  console.log('\nverdict:');
  console.log('  strafing right -> tail trails LEFT ?', right.lat < -0.2 ? 'YES' : 'NO  (' + right.lat + ')');
  console.log('  strafing left  -> tail trails RIGHT?', left.lat  >  0.2 ? 'YES' : 'NO  (' + left.lat + ')');
  console.log('  relaxes toward centre when level  ?', Math.abs(settle.lat) < 0.6 ? 'YES' : 'NO  (' + settle.lat + ')');
  console.log('ERRORS', errs.length ? errs.join('\n') : 'none');
  await b.close();
})();
