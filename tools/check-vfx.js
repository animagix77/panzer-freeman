// Real wing rig and bounded FX: attachment, refresh-rate independence and resets.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const { flight } = require('./check-motion');
const THREE = require('three');
const distances = [];
for (const fps of [30, 60, 120]) {
  const { P, context } = flight();
  vm.runInContext(fs.readFileSync(path.join(__dirname, '../src/p4c_effects.js'), 'utf8'), context);
  P.Player.boosting = true;
  const ribbons = P.scene.children.filter(o => o.name.startsWith('wing-vapor-'));
  const geometries = ribbons.map(o => o.geometry);
  const positions = ribbons.map(o => o.geometry.attributes.position.array);
  const sceneCount = P.scene.children.length;
  function tick(seconds) {
    for (let i = 0; i < Math.round(seconds * fps); i++) {
      P.Game.time += 1 / fps;
      P.entities.updatePlayer(1 / fps);
      P.fx.update(1 / fps);
    }
  }
  tick(2);
  assert.equal(P.fx.stats().trails, 2, 'boost should reveal two vapor trails');
  assert.equal(P.fx.stats().lights, 3, 'flight trails must not add lights');
  assert.equal(ribbons.length, 2);
  for (const [i, ribbon] of ribbons.entries()) {
    const vertex = ribbon.geometry.attributes.position;
    const tip = new P.V3().fromBufferAttribute(vertex, 1);
    const wing = P.dragon.wings[i];
    const expected = new P.V3(wing.userData.side * 2.7, .12, .5).applyMatrix4(wing.userData.wrist.matrixWorld);
    assert(tip.distanceTo(expected) < .0001, 'ribbon head must follow the articulated wingtip');
    assert(vertex.array.every(Number.isFinite), 'ribbon geometry stays finite');
    assert.equal(ribbon.geometry, geometries[i], 'geometry must be reused');
    assert.equal(vertex.array, positions[i], 'vertex storage must be reused');
    assert(ribbon.geometry.drawRange.count <= 34 * 12, 'ribbon history remains bounded');
  }
  const vertex = ribbons[0].geometry.attributes.position;
  const color = ribbons[0].geometry.attributes.color;
  let oldest = 1;
  for (let i = 1; i < vertex.count; i += 3) if (color.getX(i) > .02) oldest = i;
  distances.push(vertex.getZ(1) - vertex.getZ(oldest));
  assert.equal(P.scene.children.length, sceneCount, 'sustained boost allocates no scene objects');
  P.Player.boosting = false;
  tick(1.6);
  assert.equal(P.fx.stats().trails, 0, 'vapor should fade smoothly after boost');
  P.Player.boosting = true; tick(.5);
  P.Game.railZ += 2000; tick(1 / fps);
  for (const ribbon of ribbons) {
    const attr = ribbon.geometry.attributes.position;
    const count = ribbon.geometry.drawRange.count / 12 + 1;
    for (let i = 0; i < count; i++) assert(Math.abs(attr.getZ(i * 3 + 1) - P.Player.pos.z) < 20,
      'teleports must not leave a ribbon across the stage');
  }
  P.fx.reset(); assert.equal(P.fx.stats().trails, 0, 'reset hides both ribbons');
  P.Game.cinematic = true; tick(.2);
  assert.equal(P.fx.stats().trails, 0, 'cinematics should not emit flight trails');
}
assert(Math.max(...distances) - Math.min(...distances) < 1.2, 'visible tail length should agree across 30/60/120 fps');
// Repeated explosions must reuse geometry, cool into smoke, then fully clean up.
{
  const { P, context } = flight();
  vm.runInContext(fs.readFileSync(path.join(__dirname, '../src/p4c_effects.js'), 'utf8'), context);
  P.scene.fog = new THREE.Fog(0x80909a, 100, 640);
  const mesh = P.scene.children.find(o => o.name === 'explosion-embers');
  const geometry = mesh.geometry, storage = geometry.attributes.position.array;
  const sceneCount = P.scene.children.length;
  P.fx.burst(new P.V3(0, 20, 120), 1, 0x67ddff, true);
  assert.equal(P.fx.stats().sparks, 0, 'ordinary laser hits should not fill the screen with smoke');
  for (let i = 0; i < 80; i++) P.fx.burst(new P.V3(i % 5, 20, 120), 4, 0xff9944, false);
  assert(P.fx.stats().sparks <= 256 && P.fx.stats().smoke <= 18, 'dense combat keeps its fixed afterglow budget');
  P.fx.update(.2);
  assert(mesh.visible && geometry.attributes.color.array.some(n => n > .1), 'explosions throw bright radial streaks');
  assert(P.scene.children.filter(o => o.name === 'explosion-smoke').some(o => o.visible && o.material.opacity > .1),
    'smoke blooms after ignition');
  assert.equal(mesh.geometry, geometry); assert.equal(geometry.attributes.position.array, storage);
  assert.equal(P.scene.children.length, sceneCount, 'dense explosions allocate no extra scene objects');
  assert(storage.every(Number.isFinite));
  P.fx.update(2);
  assert.equal(P.fx.stats().sparks, 0); assert.equal(P.fx.stats().smoke, 0); assert(!mesh.visible);
  P.fx.burst(new P.V3(0, 20, 1000), 4, 0xff9944, false);
  const farBurst = P.scene.children.find(o => o.isGroup && o.visible && o.position.z === 1000);
  const farFlame = farBurst.getObjectByName('plasma-detonation');
  assert.equal(farFlame.material.uniforms.visibility.value, 0, 'shock front respects far fog on its first frame');
  assert(farBurst.children.filter(o => o.isSprite).every(o => o.material.opacity === 0), 'ignition respects far fog');
  P.fx.update(.1);
  assert(!mesh.visible, 'far-away sparks disappear into the same fog as enemies');
  assert(P.scene.children.filter(o => o.name === 'explosion-smoke').every(o => o.material.opacity === 0 || !o.visible));
  assert.equal(farFlame.material.uniforms.visibility.value, 0);
  P.fx.reset();
  assert.equal(P.fx.stats().sparks, 0); assert.equal(P.fx.stats().smoke, 0);
}
// Check real immediate and delayed enemy deaths, including simultaneous bursts.
{
  const { P, context } = flight();
  vm.runInContext(fs.readFileSync(path.join(__dirname, '../src/p4c_effects.js'), 'utf8'), context);
  const E = P.entities;
  P.terrain.heightAt = () => 0;
  const types = ['turret', 'mine', 'chaser'];
  for (const [i, type] of types.entries()) {
    const enemy = E.spawnEnemy(type, { pos: new P.V3(i * 20, 80, 100), entry: false });
    E.killEnemy(enemy, false);
  }
  E.updateEnemies(.9);
  P.fx.update(.18);
  const flames = P.scene.children.filter(o => o.isGroup && o.visible)
    .map(o => o.getObjectByName('plasma-detonation')).filter(o => o && o.visible);
  assert.equal(flames.length, 3, 'each kill must reach the large detonation effect');
  assert.equal(new Set(flames.map(m => m.material.uniforms.bodyColor.value.getHex())).size, 3,
    'overlapping deaths retain their enemy-specific palette');
  for (const flame of flames) {
    const uniforms = flame.material.uniforms;
    assert.notEqual(uniforms.bodyColor.value.getHex(), uniforms.edgeColor.value.getHex());
    assert(uniforms.age.value > 0 && uniforms.age.value < .25, 'visible pressure fronts advance with the burst');
    assert(flame.scale.x >= 20, 'normal enemy deaths have a readable world-space silhouette');
  }
}
const emberPositions = [];
for (const fps of [30, 60, 120]) {
  const { P, context } = flight();
  vm.runInContext(fs.readFileSync(path.join(__dirname, '../src/p4c_effects.js'), 'utf8'), context);
  P.fx.burst(new P.V3(0, 20, 120), 4, 0xff9944, false);
  for (let i = 0; i < fps / 2; i++) P.fx.update(1 / fps);
  const mesh = P.scene.children.find(o => o.name === 'explosion-embers');
  emberPositions.push(new P.V3().fromBufferAttribute(mesh.geometry.attributes.position, 0));
}
assert(emberPositions.every(pos => pos.distanceTo(emberPositions[0]) < .0001), 'spark drag and gravity agree across refresh rates');
console.log('VFX checks passed: articulated trails and explosion afterglow, fixed geometry/light budgets, fog, decay/reset, and 30/60/120 fps motion.');
