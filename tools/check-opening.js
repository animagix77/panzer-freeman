// Run the real briefing controller with an isolated world. No browser needed.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
function world() {
  const nodes = {};
  const document = { getElementById(id) {
    return nodes[id] ||= { hidden: true, checked: true, textContent: '', addEventListener() {} };
  } };
  class V3 { constructor(x = 0, y = 0, z = 0) { Object.assign(this, { x, y, z }); } }
  const enemies = [], shots = [];
  const P = {
    V3, Game: { state: 'playing', epIndex: 0, age: 89, railZ: 0 },
    Player: { railY: 22, x: 0, y: 0, viewIndex: 0 },
    Locks: { list: [] }, Input: { lmb: false }, toast() {}, flashScreen() {},
    entities: {
      lasers: [],
      spawnEnemy(type, opts) {
        const e = { type, ...opts, alive: true, vel: new V3() }; enemies.push(e); return e;
      },
      dismissEnemy(e) { const i = enemies.indexOf(e); if (i >= 0) enemies.splice(i, 1); },
      enemyShoot(e, speed, dmg, spread) { const shot = { e, speed, dmg, spread }; shots.push(shot); return shot; },
      dismissShot(s) { const i = shots.indexOf(s); if (i >= 0) shots.splice(i, 1); }
    }
  };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../src/p4b_opening.js'), 'utf8'), { window: { __PF: P }, document });
  function tick(seconds) { for (let i = 0; i < Math.ceil(seconds * 60); i++) P.opening.update(1 / 60); }
  function kill(e) { e.alive = false; P.Game.age -= e.deAge || 0; P.opening.onKill(e); }
  return { P, nodes, enemies, shots, tick, kill };
}

// A real earned reward, followed by an aimed shot and earned dodge feedback.
{
  const { P, nodes, enemies, shots, tick, kill } = world();
  P.opening.start();
  assert.equal(enemies.length, 3, 'scouts begin their distant approach immediately');
  tick(4.1);
  assert.equal(enemies.length, 3);
  assert(enemies.every(e => e.hpMul === 0.5 && e.openingOffset));
  P.Input.lmb = true; P.Locks.list.push(enemies[0]); tick(0.1);
  assert.equal(nodes.briefingTitle.textContent, 'Release to fire');
  enemies.slice().forEach(kill); tick(0.1);
  assert.equal(P.Game.age, 86);
  assert.equal(nodes.briefingTitle.textContent, '3 YEARS RETURNED');
  tick(7.2);
  assert.equal(shots.length, 1);
  assert.equal(shots[0].spread, 0);
  P.Player.x = 15; tick(3.6);
  assert.equal(nodes.briefingTitle.textContent, 'Clean escape');
  assert.equal(shots.length, 0);
  tick(6.2);
  assert.equal(enemies.filter(e => e.type === 'carrier').length, 1);
  tick(10.1);
  assert.equal(enemies.filter(e => e.type === 'ray').length, 2);
  tick(30);
  assert.equal(P.opening.active, false);
  assert.equal(nodes.briefing.hidden, true);
  assert(enemies.length > 0, 'normal encounter enemies survive the handover');
}

// Doing nothing cannot stall the level or fabricate a success reward.
{
  const { P, nodes, tick } = world();
  P.opening.start(); tick(20.2);
  assert.equal(nodes.briefingTitle.textContent, 'Keep the volley in mind');
  assert.equal(P.Game.age, 89);
  tick(7.2); P.opening.onHit(); tick(3.6);
  assert.equal(nodes.briefingTitle.textContent, 'A year lost. Keep flying.');
  tick(30);
  assert.equal(P.opening.active, false);
}

// Pause freezes timing, and skipping clears only owned targets/projectiles.
for (const when of [4.2, 31.5]) {
  const { P, nodes, enemies, shots, tick } = world();
  P.opening.start(); tick(when);
  const elapsed = P.opening.elapsed;
  P.Game.state = 'paused'; tick(10);
  assert.equal(P.opening.elapsed, elapsed);
  P.Game.state = 'playing';
  const unrelated = P.entities.spawnEnemy('carrier', {});
  P.opening.skip();
  assert.equal(enemies.length, 1); assert.equal(enemies[0], unrelated);
  assert.equal(shots.length, 0); assert.equal(nodes.briefing.hidden, true);
  P.opening.start(); assert.equal(P.opening.kills, 0); assert.equal(P.opening.elapsed, 0);
  P.opening.reset(); assert.equal(P.opening.active, false);
}

// Disabled guidance and episode changes must release the regular spawner.
{
  const { P, nodes, enemies, tick } = world();
  nodes.guidedOpening = { checked: false };
  P.opening.start(); tick(10); assert.equal(enemies.length, 0);
  nodes.guidedOpening.checked = true;
  P.opening.start(); tick(4.1); P.Game.epIndex = 1; tick(0.1);
  assert.equal(P.opening.active, false); assert.equal(enemies.length, 0);
}

// A volley launched just before the lesson expires must get time to land.
{
  const { P, tick, enemies, kill, nodes } = world();
  P.opening.start(); tick(19.5);
  enemies.forEach(target => P.entities.lasers.push({ target }));
  tick(1);
  assert.equal(P.opening.phase, 'volley');
  enemies.slice().forEach(kill); tick(0.1);
  assert.equal(nodes.briefingTitle.textContent, '3 YEARS RETURNED');
}
// Exercise actual entity movement, lasers and swept projectile collisions.
// Rendering/audio are inert; the production combat functions run unchanged.
for (const realEntry of [false, true]) for (const dodge of [false, true]) {
  const THREE = require('three');
  const { P, nodes } = world();
  nodes.guidedOpening = { checked: true };
  const group = () => new THREE.Group();
  P.V3 = THREE.Vector3;
  P.scene = new THREE.Scene(); P.camera = new THREE.PerspectiveCamera();
  P.tmpA = new P.V3(); P.tmpB = new P.V3(); P.tmpC = new P.V3();
  P.TAU = Math.PI * 2;
  P.rand = (a, b) => (a + b) / 2; P.randi = (a, b) => Math.floor((a + b) / 2);
  P.clamp = (n, a, b) => Math.max(a, Math.min(b, n));
  P.lerp = (a, b, t) => a + (b - a) * t;
  P.damp = (a, b, l, dt) => P.lerp(a, b, 1 - Math.exp(-l * dt));
  P.pick = a => a[0];
  P.G = (color, opts) => new THREE.MeshBasicMaterial({ color, ...opts });
  P.Audio_ = new Proxy({}, { get: () => () => {} });
  P.el = { flash: {}, quip: {}, toast: {} };
  P.terrain = { enabled: false, heightAt: () => 0 };
  P.world = { EPISODES: [{ id: 'ep1', speed: 56, fog: { far: 640 } }] };
  P.models = {
    oct: n => new THREE.OctahedronGeometry(n), tet: n => new THREE.TetrahedronGeometry(n),
    tor: (...args) => new THREE.TorusGeometry(...args), mesh: (g, m) => new THREE.Mesh(g, m),
    buildOrb: () => { const g = group(); g.userData.rings = [group(), group()]; return g; },
    buildDragon: () => { const root = group(), gun = group(); root.add(gun); return { root, gun, setAge() {} }; },
    ENEMY_DEFS: {}
  };
  for (const type of ['wasp', 'ray', 'carrier']) {
    P.models.ENEMY_DEFS[type] = { build: group, hp: 2, scale: 1, radius: 2.4, score: 100,
      deAge: .06, speed: 26, fireRate: 2.4, bulletSpeed: 62 };
  }
  const context = { THREE, window: { __PF: P }, document: { getElementById: id => nodes[id] } };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../src/p4_game.js'), 'utf8'), context);
  if (realEntry) vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../src/p4e_enemies.js'), 'utf8'), context);
  const spawns = [], spawn = P.entities.spawnEnemy;
  P.entities.spawnEnemy = function (type, opts) {
    const e = spawn(type, opts);
    spawns.push({ e, entry: opts.entry, distance: e.pos.z - P.Game.railZ });
    return e;
  };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../src/p4b_opening.js'), 'utf8'), context);
  P.Game.state = 'playing'; P.Player.railY = 22;
  P.opening.start();
  const tick = seconds => {
    for (let i = 0; i < Math.ceil(seconds * 60); i++) {
      P.Game.railZ += 56 / 60;
      P.Player.pos.set(P.Player.x, 22, P.Game.railZ);
      P.dragon.root.position.copy(P.Player.pos); P.dragon.root.updateMatrixWorld(true);
      P.opening.update(1 / 60);
      const arriving = P.entities.enemies.filter(e => e.arrival).map(e => ({ e, previous: e.pos.clone() }));
      P.entities.updateEnemies(1 / 60);
      arriving.forEach(({ e, previous }) => assert(e.pos.distanceTo(previous) < 7,
        'tutorial openingOffset must not snap an approaching enemy into its close formation'));
      P.entities.updateProjectiles(1 / 60);
    }
  };
  const until = wanted => {
    for (let i = 0; i < 40 * 60 && P.opening.phase !== wanted; i++) tick(1 / 60);
    assert.equal(P.opening.phase, wanted, 'opening must progress to ' + wanted);
  };
  tick(4.2);
  if (realEntry) {
    assert.equal(P.opening.phase, 'practice-approach');
    assert(P.opening.targets.every(e => e.arrival), 'all three practice enemies approach from afar');
    assert(spawns.every(s => s.entry && s.distance > 640), 'practice is created outside the visible fog');
    tick(1);
    assert.equal(P.opening.phase, 'practice-approach', 'lock lesson waits for arrival');
    assert.equal(P.entities.ebullets.length, 0, 'approaching practice targets do not attack');
    until('volley');
    assert(P.opening.t < .05, 'the full lesson window starts after arrival');
  }
  P.Locks.list.push(...P.opening.targets);
  P.entities.fireLasers(); tick(3);
  assert.equal(P.Game.kills, 3, 'all three real homing lasers hit moving targets (arrival=' + realEntry + ')');
  assert.equal(P.Game.age, 86, 'combat awards exactly three years');
  if (realEntry) {
    until('sentry-approach'); tick(1);
    assert.equal(P.opening.phase, 'sentry-approach');
    assert.equal(P.entities.ebullets.length, 0, 'the sentry cannot fire during its approach');
    until('warning'); tick(2);
    assert.equal(P.entities.ebullets.length, 0, 'arrival preserves the full three-second shot warning');
  }
  until('dodge');
  if (dodge) P.Player.x = 20;
  tick(3.6);
  assert.equal(P.Game.age, dodge ? 86 : 87, 'only an actual collision costs a year');
  assert.equal(nodes.briefingTitle.textContent, dodge ? 'Clean escape' : 'A year lost. Keep flying.');
  tick(6.2);
  const carrier = P.entities.enemies.find(e => e.type === 'carrier');
  if (realEntry) {
    assert.equal(P.opening.phase, 'encounter-approach');
    assert(carrier.arrival, 'carrier joins from the horizon');
    assert(P.opening.incoming.every(e => e.arrival), 'carrier escorts also approach');
    until('encounter');
  }
  tick(2);
  assert(Math.abs(carrier.pos.z - P.Game.railZ - 160) < .001, 'carrier holds its encounter position');
  if (realEntry) {
    tick(8.1);
    const patrol = spawns.slice(-2);
    assert(patrol.every(s => s.e.type === 'ray' && s.entry && s.distance > 640 && s.e.arrival),
      'the crossing patrol also begins beyond fog');
    assert(spawns.every(s => s.entry), 'every guided-opening flyer uses the arrival path');
    P.opening.skip();
    assert.equal(P.opening.active, false, 'skip remains available after arrival phases');
    assert(P.entities.enemies.includes(carrier), 'normal carrier encounter survives handover');
  }
}
console.log('Opening checks passed: real combat/arrival integration, distant tutorial entries, approach-gated clocks, earned rewards, dodge collision, formations, timeout, pause, skip, restart, opt-out, episode handover.');
