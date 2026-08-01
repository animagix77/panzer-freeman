// Capture the preload screen mid-load, then confirm it clears.
const { chromium } = require('playwright');
const path = require('path');
const out = process.argv[2] || '/tmp/pre';
require('fs').mkdirSync(out, { recursive: true });

(async () => {
  const b = await chromium.launch({
    executablePath: '/opt/pw-browsers/chromium',
    args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox']
  });
  const page = await b.newPage({ viewport: { width: 1100, height: 700 } });
  const errs = []; page.on('pageerror', e => errs.push(e.message));

  // throttle so the staged bar is actually observable
  await page.goto('file://' + path.join(__dirname, '..', 'index.html'), { waitUntil: 'commit' });
  for (const [ms, name] of [[220, 'a'], [520, 'b'], [900, 'c']]) {
    await page.waitForTimeout(ms === 220 ? 220 : 300);
    await page.screenshot({ path: path.join(out, `preload-${name}.png`) });
  }
  await page.waitForTimeout(3500);
  const state = await page.evaluate(() => {
    const l = document.getElementById('loading');
    return {
      classes: l.className,
      visible: getComputedStyle(l).display !== 'none' && getComputedStyle(l).opacity !== '0',
      bar: document.getElementById('ldBar').style.width,
      status: document.getElementById('ldStatus').textContent.trim(),
      titleShown: document.getElementById('title').classList.contains('on')
    };
  });
  await page.screenshot({ path: path.join(out, 'preload-done.png') });
  console.log(JSON.stringify(state, null, 1));
  console.log('ERRORS', errs.length ? errs.join('\n') : 'none');
  await b.close();
})();
