// Real wing rig and bounded FX: attachment, refresh-rate independence and resets.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const { flight } = require('./check-motion');
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
console.log('VFX checks passed: articulated wingtip attachment, bounded geometry/lights, 30/60/120 fps trail length, fade, cinematic and teleport resets.');
