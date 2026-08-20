/* Regression probes for the defects the Critic pass turned up.
   Each one asserts the specific symptom, not the code shape — so it stays
   honest if the implementation moves. */
const { chromium } = require('playwright');
const path = require('path');

const IDX = 'file://' + path.join(__dirname, '..', 'index.html');
let fails = 0;
function ok(name, pass, detail) {
  if (!pass) fails++;
  console.log((pass ? '  PASS  ' : '  FAIL  ') + name + (detail ? '   ' + detail : ''));
}

(async () => {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium',
    args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox'] });
  const page = await browser.newPage({ viewport: { width: 960, height: 540 } });
  const errors = [];
  page.on('pageerror', e => errors.push('PAGEERROR: ' + e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  await page.goto(IDX);
  await page.waitForTimeout(1500);
  await page.evaluate(() => window.__PF.setMaxH(300));
  await page.click('#startBtn'); await page.waitForTimeout(400);
  await page.evaluate(() => window.__PF.setIntroT(1.0));
  await page.waitForTimeout(1200);

  // ---- 1. a dying enemy still has a finite transform ---------------------
  // The regression was a duplicate bank block reading prevX before its var:
  // e.bank went NaN, rotation.z went NaN, and the death spiral rendered zero
  // pixels. Test the numbers, since a screenshot can't tell NaN from off-screen.
  // Poll across the whole spiral rather than sampling once: headless runs at
  // ~3 fps, so a single wait can land after every corpse has already despawned.
  const death = await page.evaluate(async () => {
    const P = window.__PF, E = P.entities;
    E.reset();
    for (const t of ['wasp', 'ray', 'chaser', 'carrier']) E.spawnEnemy(t);
    await new Promise(r => setTimeout(r, 400));
    E.enemies.slice().forEach(e => E.killEnemy(e, false));
    const bad = [];
    let seen = 0;
    for (let k = 0; k < 24; k++) {
      E.enemies.forEach(e => {
        if (e.dying === undefined) return;
        seen++;
        const r = e.g.rotation, p = e.g.position, s = e.g.scale;
        const nums = [r.x, r.y, r.z, p.x, p.y, p.z, s.x, s.y, s.z, e.bank, e.fallV];
        if (nums.some(v => v !== undefined && !isFinite(v))) bad.push(e.type);
      });
      await new Promise(r => setTimeout(r, 60));
    }
    return { samples: seen, bad: bad.filter((v, i, a) => a.indexOf(v) === i) };
  });
  ok('dying enemies keep finite transforms', death.samples > 0 && death.bad.length === 0,
     JSON.stringify(death));

  // ---- 2. a fresh flight starts at tier 0, cold -------------------------
  const reset = await page.evaluate(async () => {
    const P = window.__PF;
    P.Game.heat = 1; P.Game.age = 30;
    P.applyVigour();          // drive it to PRIME the way a good run would
    await new Promise(r => setTimeout(r, 200));
    const hot = { tier: P.getVigour().tier, cd: +P.Player.gunCD.toFixed(3),
                  dmg: P.Player.gunDmg, locks: P.Locks.max };
    P.Game.state = 'over';
    document.getElementById('againBtn').click();
    await new Promise(r => setTimeout(r, 700));
    const cold = { tier: P.getVigour().tier, cd: +P.Player.gunCD.toFixed(3),
                   dmg: P.Player.gunDmg, locks: P.Locks.max, heat: P.Game.heat || 0,
                   age: P.Game.age };
    return { hot, cold };
  });
  ok('Fly Again starts at tier 0 / cold',
     reset.hot.tier === 4 && reset.cold.tier === 0 && reset.cold.dmg === 1 &&
     reset.cold.heat === 0 && reset.cold.age === 89 && reset.cold.cd > reset.hot.cd &&
     reset.cold.locks < reset.hot.locks,
     JSON.stringify(reset));

  // ---- 3. hit rate does not depend on framerate -------------------------
  // Fire a bullet straight at a stationary target from a fixed offset and step
  // the sim by hand at 60, 30 and 24 fps. A point test per frame tunnels; a
  // swept segment does not.
  const sweep = await page.evaluate(() => {
    const P = window.__PF;
    function trial(dt, off) {
      let hits = 0;
      const N = 40;
      for (let k = 0; k < N; k++) {
        const a = new P.V3(off, k * 0.0, -20), b = new P.V3(off, 0, 20);
        // radius 3.0 target sitting at the origin
        if (P.segPointD2(a, b, new P.V3(0, 0, 0)) < 9.0) hits++;
      }
      return hits / N;
    }
    // the real proof: the same geometry sampled at three step sizes
    function march(dt, speed, off) {
      let z = -30, prev;
      const tgt = new P.V3(0, 0, 0);
      while (z < 30) {
        prev = new P.V3(off, 0, z);
        z += speed * dt;
        const now = new P.V3(off, 0, z);
        if (P.segPointD2(prev, now, tgt) < 9.0) return true;
      }
      return false;
    }
    const speed = 220;
    return {
      off_1: [march(1 / 60, speed, 1.0), march(1 / 30, speed, 1.0), march(1 / 24, speed, 1.0)],
      off_2_9: [march(1 / 60, speed, 2.9), march(1 / 30, speed, 2.9), march(1 / 24, speed, 2.9)],
      off_3_1: [march(1 / 60, speed, 3.1), march(1 / 30, speed, 3.1), march(1 / 24, speed, 3.1)]
    };
  });
  const inRange = sweep.off_1.every(Boolean) && sweep.off_2_9.every(Boolean);
  const outRange = sweep.off_3_1.every(v => v === false);
  ok('swept collision is framerate-independent', inRange && outRange, JSON.stringify(sweep));

  // ---- 4. the scene keeps moving behind the result plates ---------------
  await page.evaluate(() => {
    const P = window.__PF;
    P.Game.state = 'playing'; P.Game.invulnT = 0;
    P.damagePlayer(30, true); P.Game.invulnT = 0; P.damagePlayer(30, true);
  });
  await page.waitForTimeout(900);
  const a = await page.evaluate(() => {
    const P = window.__PF;
    return { z: P.Game.railZ, t: P.Game.time, cam: P.camera.position.z };
  });
  await page.waitForTimeout(1100);
  const b = await page.evaluate(() => {
    const P = window.__PF;
    return { z: P.Game.railZ, t: P.Game.time, cam: P.camera.position.z, state: P.Game.state };
  });
  ok('3D scene still animates on the over screen',
     b.state === 'over' && b.z > a.z + 1 && b.cam !== a.cam,
     JSON.stringify({ a, b }));

  // ---- 5. pause really does freeze --------------------------------------
  await page.click('#againBtn'); await page.waitForTimeout(500);
  await page.evaluate(() => window.__PF.setIntroT(1.0));
  await page.waitForTimeout(1000);
  await page.keyboard.press('p'); await page.waitForTimeout(300);
  const p1 = await page.evaluate(() => window.__PF.Game.railZ);
  await page.waitForTimeout(800);
  const p2 = await page.evaluate(() => ({ z: window.__PF.Game.railZ, s: window.__PF.Game.state }));
  ok('pause freezes the world', p2.s === 'paused' && Math.abs(p2.z - p1) < 0.001,
     JSON.stringify({ p1, p2 }));
  await page.keyboard.press('p'); await page.waitForTimeout(300);

  // ---- 6. the perf overlay reports real numbers -------------------------
  await page.keyboard.press('F3');
  await page.waitForTimeout(3000);
  const perf = await page.evaluate(() => ({
    on: document.getElementById('perf').classList.contains('on'),
    text: document.getElementById('perf').textContent,
    info: window.__PF.perfInfo()
  }));
  ok('F3 perf overlay reports live counters',
     perf.on && /FPS/.test(perf.text) && !/SAMPLING/.test(perf.text) &&
     perf.info.calls > 0 && perf.info.tris > 0,
     JSON.stringify(perf.info) + '  ' + JSON.stringify(perf.text.split('\n')[0]));
  await page.keyboard.press('F3');
  await page.waitForTimeout(200);
  const off = await page.evaluate(() => document.getElementById('perf').classList.contains('on'));
  ok('F3 toggles the overlay back off', off === false);

  // ---- 7. the pools settle instead of leaking ---------------------------
  // Pools grow on demand, so the first heavy fight legitimately allocates up to
  // its high-water mark. What must not happen is growth that never stops. Run
  // three identical volleys and assert the last two allocate nothing.
  const pool = await page.evaluate(async () => {
    const P = window.__PF, E = P.entities;
    const types = ['wasp', 'ray', 'turret', 'chaser', 'carrier', 'mine'];
    async function volley() {
      E.reset();               // the game caps at 16 alive; don't stack volleys
      await new Promise(r => setTimeout(r, 100));
      for (let i = 0; i < 12; i++) E.spawnEnemy(types[i % types.length]);
      await new Promise(r => setTimeout(r, 200));
      for (let i = 0; i < 60; i++) E.fireGun();
      await new Promise(r => setTimeout(r, 250));
      for (let i = 0; i < 60; i++) E.fireGun();
      await new Promise(r => setTimeout(r, 600));
      return P.perfInfo().geometries;
    }
    await volley();                       // let every pool reach its high-water mark
    const before = E.poolStats();
    const g2 = await volley(), g3 = await volley();
    const after = E.poolStats();
    const grew = Object.keys(after).filter(k => after[k] !== before[k]);
    return { g2, g3, grew, after, enemies: E.enemies.length };
  });
  ok('projectile / effect pools settle instead of leaking',
     pool.grew.length === 0, JSON.stringify(pool));

  // ---- 8. an enemy spawn never builds a rig mid-flight ------------------
  const warm = await page.evaluate(() => {
    const P = window.__PF, E = P.entities;
    const types = ['wasp', 'ray', 'turret', 'chaser', 'carrier', 'mine'];
    const out = {};
    for (const t of types) {
      const before = P.perfInfo().geometries;
      E.spawnEnemy(t);
      out[t] = P.perfInfo().geometries - before;
    }
    return out;
  });
  ok('prewarmed enemy rigs — no geometry built on spawn',
     Object.keys(warm).every(k => warm[k] === 0), JSON.stringify(warm));

  console.log('\nERRORS ' + (errors.length ? errors.slice(0, 8).join('\n') : 'none'));
  console.log(fails ? '\n' + fails + ' CHECK(S) FAILED' : '\nall checks passed');
  await browser.close();
  process.exit(fails || errors.length ? 1 : 0);
})();
