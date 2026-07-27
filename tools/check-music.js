const { chromium } = require('playwright');
const path = require('path');
(async () => {
  const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium',
    args: ['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--no-sandbox',
           '--autoplay-policy=no-user-gesture-required'] });
  const page = await b.newPage({ viewport: { width: 1280, height: 720 } });
  const errs = []; page.on('pageerror', e => errs.push(e.message));
  page.on('console', m => { if (m.type()==='error') errs.push(m.text()); });
  await page.goto('file://' + path.join(__dirname, '..', 'index.html'));
  await page.waitForTimeout(1200);
  await page.evaluate(() => window.__PF && window.__PF.setMaxH && window.__PF.setMaxH(300));

  const st = () => page.evaluate(() => {
    const A = window.__PF.Audio_;
    let which = null;
    for (const k in window.__PF.SONGS) if (window.__PF.SONGS[k] === A.song) which = k;
    return { started: A.started, song: which, step: A.step, ctxT: +(A.ctx ? A.ctx.currentTime : 0).toFixed(2) };
  });

  // first gesture should arm audio and start the title theme
  await page.mouse.move(600, 400); await page.mouse.down(); await page.mouse.up();
  await page.waitForTimeout(1200);
  console.log('title screen  ', JSON.stringify(await st()));

  await page.click('#startBtn');
  await page.waitForTimeout(600);
  await page.evaluate(() => window.__PF.setIntroT(1.0));
  await page.waitForTimeout(1500);
  const a = await st();
  await page.waitForTimeout(2500);
  const b2 = await st();
  console.log('episode I     ', JSON.stringify(b2), ' steps advanced:', b2.step - a.step);

  // episode changes should swap the track
  await page.evaluate(() => { const P = window.__PF;
    P.Game.railZ = P.Game.epStartZ + P.world.EPISODES[0].length + 1; });
  await page.waitForTimeout(1500);
  console.log('episode II    ', JSON.stringify(await st()));
  await page.evaluate(() => { const P = window.__PF;
    P.Game.railZ = P.Game.epStartZ + P.world.EPISODES[1].length + 1; });
  await page.waitForTimeout(1500);
  console.log('episode III   ', JSON.stringify(await st()));
  await page.evaluate(() => { const P = window.__PF;
    P.Game.railZ = P.Game.epStartZ + P.world.EPISODES[2].length + 1; });
  await page.waitForTimeout(1800);
  console.log('boss          ', JSON.stringify(await st()));

  // mute / unmute
  await page.keyboard.press('m'); await page.waitForTimeout(400);
  const muted = await page.evaluate(() => window.__PF.Audio_.muted);
  await page.keyboard.press('m'); await page.waitForTimeout(300);
  console.log('mute toggles  ', muted, '->', await page.evaluate(() => window.__PF.Audio_.muted));

  // death stops the music
  await page.evaluate(() => { const P = window.__PF; P.Game.invulnT = 0; P.damagePlayer(60, true); });
  await page.waitForTimeout(900);
  console.log('after death   ', JSON.stringify(await st()));
  console.log('ERRORS', errs.length ? errs.slice(0,4).join('\n') : 'none');
  await b.close();
})();
