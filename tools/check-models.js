// Judge Dean LLC — model budgets, live rig deformation and gameplay attachments.
const assert = require('node:assert/strict');
const THREE = require('three');
const { flight } = require('./check-motion');
const { P, step } = flight();
const budgets = [];
for (const type of ['wasp', 'ray', 'chaser', 'carrier', 'sentinel', 'bomber']) {
  const g = P.models.ENEMY_DEFS[type].build();
  let meshes = 0, vertices = 0;
  g.traverse(o => {
    if (!o.isMesh) return;
    meshes++; vertices += o.geometry.attributes.position.count;
    assert(o.geometry.attributes.position.array.every(Number.isFinite), type + ' finite positions');
    assert(o.geometry.attributes.normal.array.every(Number.isFinite), type + ' finite normals');
  });
  assert(meshes <= 7, type + ' detailed hull stays batched to at most seven draws');
  assert(vertices < 14000, type + ' geometry stays within the prewarmed enemy budget');
  if (type === 'carrier') {
    assert.equal(g.userData.core.parent, g, 'reactor remains independently animated');
    assert.equal(g.userData.ring.parent, g, 'gimbal remains independently animated');
  }
  if (type === 'sentinel') assert.equal(g.userData.shield.parent, g, 'shield remains independently removable');
  if (type === 'chaser') assert.equal(g.userData.flame.parent, g, 'exhaust keeps its existing animation handle');
  if (type === 'bomber') assert.equal(g.userData.core.parent, g, 'bomber core remains independently animated');
  budgets.push({ type, meshes, vertices });
}
const sails = [];
P.dragon.root.traverse(o => { if (o.name === 'dragon-banded-membrane') sails.push(o); });
assert.equal(sails.length, 2);
const mantle = P.dragon.root.getObjectByName('rider-flight-mantle');
assert(mantle && mantle.parent === P.dragon.rider, 'mantle follows the rider');
const buffers = sails.concat(mantle).map(o => o.geometry.attributes.position.array);
const before = buffers.map(a => a.slice());
step('s', .7); step('d', .6);
for (const [i, o] of sails.concat(mantle).entries()) {
  const data = o.geometry.attributes.position.array;
  assert.equal(data, buffers[i], 'animation reuses its vertex storage');
  assert(data.every(Number.isFinite), 'deformed cloth remains finite');
  assert(data.some((n, j) => Math.abs(n - before[i][j]) > .01), 'new surfaces follow the actual animated rig');
}
const gun = new THREE.Vector3(); P.dragon.gun.getWorldPosition(gun);
assert(gun.distanceTo(P.Player.pos) < 10, 'weapon muzzle stays attached to rider');
const boss = P.models.buildBoss();
assert.equal(boss.cores.length, 3);
for (const core of boss.cores) {
  assert(Math.abs(Math.hypot(core.group.position.x, core.group.position.y) - 11.5) < .001,
    'boss weak points retain targeting positions');
  assert(core.group.parent, 'boss core stays attached');
}
// Replay uses the same boss model and materials with its authored scale, not
// the shrunken death pose or rotations/flash state from the previous battle.
P.entities.bossStart();
const B = P.Boss, model = B.group, authoredScale = model.scale.clone();
const materials = B.built.cores.map(c => c.core.material);
const ringPoses = B.built.rings.map(r => r.quaternion.clone());
const shields = B.built.cores.map(c => ({ scale: c.shield.scale.clone(), rotation: c.shield.quaternion.clone() }));
for (let replay = 0; replay < 3; replay++) {
  for (let tick = 0; tick < 60; tick++) P.entities.updateBoss(1 / 60);
  B.group.scale.setScalar(.3); B.group.rotation.set(.8, 1, 2.4); B.dead = true; B.deathT = 1;
  B.built.cores.forEach(c => { c.hp = 0; c.alive = false; c.group.visible = false; c.shield.scale.setScalar(1.35); });
  P.entities.reset();
  P.Player.pos.set(24, 40, 6000 + replay * 500);
  P.entities.bossStart();
  assert.equal(B.group, model, 'replay reuses the loaded boss model');
  assert(B.group.scale.equals(authoredScale), 'replay restores the full authored boss scale');
  assert.equal(B.dead, false); assert.equal(B.deathT, 0);
  assert(Math.abs(B.group.rotation.x) < .00001); assert(Math.abs(B.group.rotation.z) < .00001);
  assert.equal(B.group.position.x, P.Player.pos.x, 'restart aligns the approach with the new flight');
  assert(B.group.position.z - P.Player.pos.z > 800, 'boss starts beyond the finale fog');
  B.built.rings.forEach((r, i) => assert(r.quaternion.angleTo(ringPoses[i]) < .00001, 'clock rings restart from their original orientation'));
  B.built.cores.forEach((c, i) => {
    assert(c.alive && c.hp === c.maxHp && c.group.visible, 'all weak points reset');
    assert.equal(c.core.material, materials[i], 'core material is reused across replays');
    assert(c.shield.scale.equals(shields[i].scale), 'shield flinch does not survive replay');
    assert(c.shield.quaternion.angleTo(shields[i].rotation) < .00001, 'shield spin resets');
  });
}
let previousDistance = B.dist;
for (let frame = 0; frame < 481; frame++) {
  P.entities.updateBoss(1 / 60);
  assert(previousDistance >= B.dist && previousDistance - B.dist < 3, 'boss closes continuously from the horizon');
  previousDistance = B.dist;
}
assert(Math.abs(B.dist - 128) < .001, 'boss settles at combat range');
B.dead = true; B.deathT = .001; P.onEnd = function () {};
P.entities.updateBoss(1 / 60);
assert.equal(P.Game.state, 'win', 'death animation still hands off to the result flow');
assert.equal(B.group.visible, false);
assert(B.group.scale.equals(authoredScale), 'death cleanup also preserves the authored scale');
console.log('Model checks passed: bounded batched hulls, dynamic attachments, reused cloth buffers, muzzle/weak-point alignment and full boss replay pose/material reset.');
console.log(budgets);
