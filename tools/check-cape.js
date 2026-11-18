// Judge Dean LLC — exercise the rendered cape through the production flight rig.
const assert = require('node:assert/strict');
const THREE = require('three');
const { flight } = require('./check-motion');

function maxDifference(a, b) {
  let maximum = 0;
  for (let i = 0; i < a.length; i++) maximum = Math.max(maximum, Math.abs(a[i] - b[i]));
  return maximum;
}

function edgeLength(positions, a, b) {
  const i = a * 3, j = b * 3;
  return Math.hypot(positions[i] - positions[j], positions[i + 1] - positions[j + 1],
    positions[i + 2] - positions[j + 2]);
}

// A straight cross-section stays at zero when the sheet tilts or translates.
function foldAcrossHem(hem) {
  const mid = 3 * Math.floor(hem.length / 6), right = hem.length - 3;
  return [0, 1, 2].map(axis => hem[mid + axis] - (hem[axis] + hem[right + axis]) / 2);
}

function capeRig() {
  const { P, step } = flight(['p4d_campaign.js']);
  const dragon = P.dragon;
  dragon.resetMotion();
  const geometry = dragon.rider.getObjectByName('rider-flight-mantle').geometry;
  const positions = geometry.attributes.position.array;
  const rest = positions.slice();
  const uv = geometry.attributes.uv;
  let rowSize = 1;
  while (rowSize < uv.count && uv.getY(rowSize) === uv.getY(0)) rowSize++;
  assert(rowSize > 2 && rowSize < uv.count, 'the cape needs connected rows from collar to hem');
  const collar = positions.subarray(0, 3 * rowSize);
  const hem = positions.subarray(positions.length - 3 * rowSize);
  return { P, step, dragon, geometry, positions, rest, collar, hem };
}

// Sample the real cantle corners and the exported skin beneath the cloth.
// Barycentric coordinates keep each back sample on its triangle as bones move.
function checkGearClearance() {
  const { P, dragon, step } = capeRig();
  const cloth = dragon.rider.getObjectByName('rider-flight-mantle'), skin = dragon.flightRig.mesh;
  const cantle = dragon.body.getObjectByName('rider-saddle-cantle');
  const vertices = cantle.geometry.attributes.position;
  const corners = Array.from({ length: vertices.count }, (_, i) =>
    new THREE.Vector3().fromBufferAttribute(vertices, i).applyMatrix4(cantle.matrix));
  const top = Math.max(...corners.map(p => p.y));
  const cantlePoints = corners.filter(p => p.y > top - .0001);
  const ray = new THREE.Raycaster(), origin = new THREE.Vector3(), down = new THREE.Vector3();
  const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3(), point = new THREE.Vector3();
  const back = [];
  function aimAt(x, z) {
    down.set(0, -1, 0).transformDirection(dragon.body.matrixWorld);
    ray.set(dragon.body.localToWorld(origin.set(x, 4, z)), down);
  }
  for (const x of [-.26, 0, .26]) {
    for (const z of [-1.6, -1, -.5, -.1]) {
      aimAt(x, z);
      const hit = ray.intersectObject(skin, false)[0];
      assert(hit, 'the dragon skin spans the saddle');
      const f = hit.face;
      const weights = THREE.Triangle.getBarycoord(skin.worldToLocal(hit.point),
        skin.boneTransform(f.a, a), skin.boneTransform(f.b, b), skin.boneTransform(f.c, c), new THREE.Vector3());
      back.push({ f, weights });
    }
  }
  const covered = new Set();
  function checkPoint(p, name) {
    aimAt(p.x, p.z);
    for (const hit of ray.intersectObject(cloth, false)) {
      const gap = dragon.body.worldToLocal(hit.point).y - p.y;
      assert(gap > -.01, 'cape triangle clips ' + name + ' by ' + (-gap).toFixed(3));
      covered.add(name);
    }
  }
  function sample() {
    cloth.geometry.computeBoundingSphere();
    for (const p of cantlePoints) checkPoint(p, 'cantle');
    for (const { f, weights } of back) {
      point.copy(skin.boneTransform(f.a, a)).multiplyScalar(weights.x);
      point.addScaledVector(skin.boneTransform(f.b, b), weights.y);
      point.addScaledVector(skin.boneTransform(f.c, c), weights.z);
      checkPoint(dragon.body.worldToLocal(skin.localToWorld(point)), 'back');
    }
  }
  function fly(keys, frames) {
    for (let i = 0; i < frames; i++) { step(keys, 1 / 60); sample(); }
  }
  fly(['d', 's', 'shift'], 30); fly(['a', 'w'], 30);
  P.Input.keys = { a: true }; assert(P.flight.roll());
  fly('a', 48); fly('x', 60);
  assert.equal(covered.size, 2, 'sample cloth where it covers both the cantle and the skinned dragon');
}

function checkCape() {
  const samples = [];
  for (const fps of [30, 60, 120]) {
    const { P, step, dragon, geometry, positions, rest, collar, hem } = capeRig();
    const pins = collar.slice(), normalBuffer = geometry.attributes.normal.array;
    const index = geometry.index.array;
    assert(positions.length / 3 < 512, 'the cape should fit in one small dynamic mesh');

    function checkMesh() {
      assert.equal(geometry.attributes.position.array, positions);
      assert.equal(geometry.attributes.normal.array, normalBuffer);
      assert(positions.every(Number.isFinite) && normalBuffer.every(Number.isFinite));
      assert(maxDifference(collar, pins) < .003, 'the collar should stay sewn to both shoulders');
      for (let i = 0; i < index.length; i += 3) {
        for (let side = 0; side < 3; side++) {
          const a = index[i + side], b = index[i + (side + 1) % 3];
          const stretch = edgeLength(positions, a, b) / edgeLength(rest, a, b);
          assert(stretch < 1.55,
            `cloth edge ${a}–${b} stretched to ${stretch.toFixed(2)}× at ${fps} fps, t=${P.Game.time.toFixed(2)}`);
        }
      }
    }

    step(null, .6, fps);
    step(['d', 's', 'shift'], .5, fps);
    checkMesh();
    const banked = hem.slice();
    step(['a', 'w'], .5, fps);
    checkMesh();
    assert(maxDifference(hem, banked) > .06, 'the loose hem should respond to reversing the turn');
    assert(maxDifference(foldAcrossHem(hem), foldAcrossHem(banked)) > .02,
      'the center and corners should billow independently across the width of the hem');
    const center = new THREE.Vector3(), vertex = new THREE.Vector3();
    for (let i = 0; i < hem.length; i += 3) center.add(vertex.fromArray(hem, i));
    samples.push(center.multiplyScalar(3 / hem.length));

    P.Input.keys = { a: true };
    assert(P.flight.roll());
    for (let tick = 0; tick < fps; tick++) {
      step('a', 1 / fps, fps);
      checkMesh();
    }
    const moving = positions.slice();
    dragon.update(0, P.Game.time + 30, {});
    assert(maxDifference(moving, positions) < .003, 'a clock jump without physics time cannot change the cloth');

    dragon.resetMotion();
    assert(maxDifference(positions, rest) < .003, 'a replay should restore every cloth vertex immediately');
  }
  assert(samples.every(center => center.distanceTo(samples[2]) < .18),
    'the overall position of the hem should agree at 30, 60 and 120 fps as individual folds move');

  const { dragon, step, collar } = capeRig();
  step(null, .2);
  const aged = collar.slice();
  dragon.setAge(25);
  step(null, .2);
  assert(maxDifference(aged, collar) > .02, 'the collar should move with the younger, straighter rider');
  checkGearClearance();
  console.log('Cape checks passed: shoulder attachment, flight response, saddle and armour clearance, bounded strain, stable buffers, replay and frame rates.');
}

if (require.main === module) checkCape();
module.exports = { checkCape };
