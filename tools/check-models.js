// Judge Dean LLC — model budgets, live rig deformation and gameplay attachments.
const assert = require('node:assert/strict');
const THREE = require('three');
const { flight, checkMotion } = require('./check-motion');
checkMotion();
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
// Measure the visible, skinned surface at the ends of the Blender wing rig.
const skin = P.dragon.flightRig.mesh;
const visible = [];
P.dragon.body.traverseVisible(part => { if (part.isSkinnedMesh) visible.push(part); });
assert(visible.includes(skin) && skin !== P.dragon.riderMesh, 'the flight model must render its own skinned body');
assert(skin.material.skinning, 'the visible dragon material must render the weighted mesh');
const attributes = skin.geometry.attributes, bindPositions = attributes.position;
const jointIndex = new THREE.Vector4(), jointWeight = new THREE.Vector4();
let blended = 0;
for (let i = 0; i < bindPositions.count; i++) {
  jointIndex.fromBufferAttribute(attributes.skinIndex, i);
  jointWeight.fromBufferAttribute(attributes.skinWeight, i);
  assert(Math.abs(jointWeight.manhattanLength() - 1) < .005, 'each surface vertex has normalized weights');
  let influences = 0;
  for (let j = 0; j < 4; j++) {
    if (jointWeight.getComponent(j) <= 0) continue;
    const joint = jointIndex.getComponent(j);
    assert(Number.isInteger(joint) && joint >= 0 && joint < skin.skeleton.bones.length);
    influences++;
  }
  if (influences > 1) blended++;
}
assert(blended > 0, 'joints blend continuously into the skin');
const tips = P.dragon.wingTips.map(bone => {
  assert(skin.skeleton.bones.includes(bone), 'tip belongs to the same armature as the visible wing');
  const tip = bone.getWorldPosition(new THREE.Vector3()), point = new THREE.Vector3();
  let closest = Infinity, index = -1;
  for (let i = 0; i < bindPositions.count; i++) {
    skin.boneTransform(i, point).applyMatrix4(skin.matrixWorld);
    const distance = point.distanceTo(tip);
    if (distance < closest) { closest = distance; index = i; }
  }
  assert(closest < .35, 'wingtip marker sits on the actual mesh');
  return { bone, index };
});
const surface = new THREE.Vector3(), marker = new THREE.Vector3();
const range = tips.map(() => [Infinity, -Infinity]);
for (let tick = 0; tick < 90; tick++) {
  step(tick < 36 ? 's' : 'a', 1 / 60);
  for (const [i, tip] of tips.entries()) {
    skin.boneTransform(tip.index, surface).applyMatrix4(skin.matrixWorld);
    assert(surface.distanceTo(tip.bone.getWorldPosition(marker)) < .4, 'the rendered wing must follow the fingertip through a maneuver');
    P.dragon.body.worldToLocal(surface);
    range[i][0] = Math.min(range[i][0], surface.y);
    range[i][1] = Math.max(range[i][1], surface.y);
  }
}
assert(range.every(([low, high]) => high - low > 3), 'the actual flight mesh completes a powered stroke');
assert.equal(skin.geometry.attributes.position, bindPositions, 'the skinned mesh reuses its bind geometry');
const mantle = P.dragon.rider.getObjectByName('rider-flight-mantle');
assert(mantle && mantle.parent === P.dragon.rider, 'mantle follows the rider');
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
require('./check-cape').checkCape();
console.log('Model checks passed: bounded batched hulls, dynamic attachments, reused cloth buffers, muzzle/weak-point alignment and full boss replay pose/material reset.');
console.log(budgets);
