// Route architecture must be visible early, grounded, clear of flight, and bounded.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { flight } = require('./check-motion');
const { P, context } = flight();
for (const file of ['p3_world.js', 'p3d_landmarks.js'])
  vm.runInContext(fs.readFileSync(path.join(__dirname, '../src', file), 'utf8'), context);
let sceneCount;
for (let stage = 0; stage < P.world.EPISODES.length; stage++) {
  P.Game.epIndex = stage; P.Game.epStartZ = stage * 7000; P.Game.railZ = P.Game.epStartZ;
  P.landmarks.update();
  const ep = P.world.EPISODES[stage];
  const roots = P.scene.children.filter(o => o.name.startsWith('route-landmark-'));
  assert.equal(roots.length, 4);
  assert(P.landmarks.stats().meshes <= 16, 'all structures together have at most sixteen draw calls');
  assert(roots.some(root => root.position.z - P.Game.railZ === 450), 'first landmark is visible in the opening approach');
  for (const root of roots) {
    let lowestLeft = Infinity, lowestRight = Infinity;
    for (const mesh of root.children) {
      const a = mesh.geometry.attributes.position;
      assert(a.array.every(Number.isFinite));
      assert(mesh.material.fog, 'architecture fades through the stage fog');
      for (let v = 0; v < a.count; v += 3) {
        const xs = [a.getX(v), a.getX(v + 1), a.getX(v + 2)];
        const ys = [a.getY(v), a.getY(v + 1), a.getY(v + 2)];
        if (Math.min(...xs) < 80 && Math.max(...xs) > -80)
          assert(Math.min(...ys) >= 150, ep.id + ' central flight corridor is clear below 150 units');
        for (let j = 0; j < 3; j++) {
          if (xs[j] < -140 && xs[j] > -200) lowestLeft = Math.min(lowestLeft, ys[j]);
          if (xs[j] > 140 && xs[j] < 200) lowestRight = Math.min(lowestRight, ys[j]);
        }
      }
    }
    assert(lowestLeft < ep.terrain.h(-173, root.position.z), ep.id + ' left supports reach terrain');
    assert(lowestRight < ep.terrain.h(173, root.position.z), ep.id + ' right supports reach terrain');
  }
  sceneCount = P.scene.children.length;
  const watched = roots.find(root => root.position.z - P.Game.railZ === 450);
  const oldZ = watched.position.z, oldGeometry = watched.children[0].geometry;
  let disposed = false; oldGeometry.addEventListener('dispose', () => { disposed = true; });
  P.Game.railZ = oldZ + 1200; P.landmarks.update();
  assert.equal(watched.position.z, oldZ, 'structure remains in place until well behind fog');
  P.Game.railZ = oldZ + 1251; P.landmarks.update();
  assert(watched.position.z - P.Game.railZ > 1100, 'recycled structure appears beyond far fog');
  assert(disposed, 'recycling releases the prior geometry');
  assert.equal(P.scene.children.length, sceneCount, 'streaming keeps the scene object count fixed');
  P.Game.railZ += 50000; P.landmarks.update();
  assert(roots.every(root => root.position.z >= P.Game.railZ - 1250), 'large teleports catch up without unbounded creation');
  P.Game.railZ = P.Game.epStartZ; P.landmarks.update();
  assert(roots.some(root => root.position.z - P.Game.railZ === 450), 'backward teleports and early restarts restore opening architecture');
}
P.landmarks.reset();
assert(P.scene.children.filter(o => o.name.startsWith('route-landmark-')).every(o => !o.visible));
P.landmarks.update();
assert.equal(P.scene.children.length, sceneCount, 'reset reuses the same root pool');
console.log('Landmark checks passed: all five stage styles, early approach, grounded supports, flight clearance, fog, bounded draw calls, recycling disposal and reset.');
