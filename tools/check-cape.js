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

// Compare the triangles of the moving fabric against the actual tips of the
// saddle and back plates, independently of the solver's collision surface.
function checkGearClearance() {
  const { P, dragon, step } = capeRig(), tips = [];
  const cloth = dragon.rider.getObjectByName('rider-flight-mantle');
  for (const part of dragon.body.children) {
    if (part.name !== 'rider-saddle-cantle' && part.name !== 'dragon-dorsal-plate') continue;
    const vertices = part.geometry.attributes.position;
    const points = Array.from({ length: vertices.count }, (_, i) =>
      new THREE.Vector3().fromBufferAttribute(vertices, i).applyMatrix4(part.matrix));
    const maxY = Math.max(...points.map(p => p.y));
    for (const point of points) {
      if (point.y < maxY - .0001 || point.z > .1 || point.z < -2.2) continue;
      if (!tips.some(t => t.point.equals(point))) tips.push({ point, gear: part.name });
    }
  }
  const ray = new THREE.Raycaster(), origin = new THREE.Vector3(), down = new THREE.Vector3();
  const covered = new Set();
  function sample() {
    cloth.geometry.computeBoundingSphere();
    down.set(0, -1, 0).transformDirection(dragon.body.matrixWorld);
    for (const { point, gear } of tips) {
      origin.copy(point); origin.y += 4;
      ray.set(dragon.body.localToWorld(origin), down);
      for (const hit of ray.intersectObject(cloth, false)) {
        const gap = dragon.body.worldToLocal(hit.point).y - point.y;
        assert(gap > -.01, `cape triangle clips ${gear} by ${(-gap).toFixed(3)}`);
        covered.add(gear);
      }
    }
  }
  function fly(keys, frames) {
    for (let i = 0; i < frames; i++) { step(keys, 1 / 60); sample(); }
  }
  fly(['d', 's', 'shift'], 30); fly(['a', 'w'], 30);
  P.Input.keys = { a: true }; assert(P.flight.roll());
  fly('a', 48); fly('x', 60);
  assert.equal(covered.size, 2, 'sample cloth where it actually covers both cantle and dorsal armour');
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
