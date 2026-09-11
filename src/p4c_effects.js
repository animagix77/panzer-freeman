/* Bounded combat glow pool. Three reusable lights; no postprocess render pass. */
(function () {
'use strict';
var P = window.__PF, scene = P.scene;
var data = new Uint8Array(64 * 64 * 4);
for (var i = 0; i < 4096; i++) {
  var x = (i % 64 - 31.5) / 31.5, y = (Math.floor(i / 64) - 31.5) / 31.5;
  var r = Math.sqrt(x * x + y * y);
  data[i * 4] = data[i * 4 + 1] = data[i * 4 + 2] = 255;
  data[i * 4 + 3] = Math.round(255 * Math.pow(Math.max(0, 1 - r), 2.3));
}
var tex = new THREE.DataTexture(data, 64, 64, THREE.RGBAFormat);
tex.minFilter = tex.magFilter = THREE.LinearFilter; tex.needsUpdate = true;
function sprite(col) {
  return new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, color: col, transparent: true,
    blending: THREE.AdditiveBlending, depthWrite: false, fog: false }));
}
var pool = [], cursor = 0, lights = [], lightCursor = 0;
var ringGeo = new THREE.TorusGeometry(1, .035, 4, 40);
for (i = 0; i < 40; i++) {
  var g = new THREE.Group(), halo = sprite(0xff974a), core = sprite(0xffffff);
  var ring = new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({ color: 0xffb878, transparent: true,
    blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
  g.add(halo, core, ring); g.visible = false; scene.add(g);
  pool.push({ g: g, halo: halo, core: core, ring: ring, age: 0, life: 0, size: 1 });
}
for (i = 0; i < 3; i++) { var light = new THREE.PointLight(0xff9944, 0, 95, 2); scene.add(light); lights.push({ light: light, age: 1 }); }

// Two short vapor ribbons record the real articulated wingtips in world space.
// A fixed 60 Hz history keeps their length stable across display refresh rates.
var trails = [], trailCount = 34, trailLife = .5, trailTime = 0, trailPower = 0;
var trailView = new THREE.Vector3(), trailTangent = new THREE.Vector3(), trailSide = new THREE.Vector3();
for (i = 0; i < 2; i++) {
  var trailGeo = new THREE.BufferGeometry(), trailIndices = [];
  var trailPositions = new Float32Array((trailCount + 1) * 9), trailColors = new Float32Array((trailCount + 1) * 9);
  for (var ti = 0; ti < trailCount; ti++) {
    for (var edge = 0; edge < 2; edge++) {
      var a = ti * 3 + edge, c = a + 3;
      trailIndices.push(a, c, a + 1, a + 1, c, c + 1);
    }
  }
  trailGeo.setAttribute('position', new THREE.BufferAttribute(trailPositions, 3).setUsage(THREE.DynamicDrawUsage));
  trailGeo.setAttribute('color', new THREE.BufferAttribute(trailColors, 3).setUsage(THREE.DynamicDrawUsage));
  trailGeo.setIndex(trailIndices);
  var trailMesh = new THREE.Mesh(trailGeo, new THREE.MeshBasicMaterial({ color: 0xa4e7ff,
    vertexColors: true, transparent: true, opacity: .72, blending: THREE.AdditiveBlending,
    depthWrite: false, side: THREE.DoubleSide, fog: false }));
  trailMesh.name = 'wing-vapor-' + i; trailMesh.visible = false; trailMesh.frustumCulled = false;
  scene.add(trailMesh);
  var history = [];
  for (ti = 0; ti < trailCount; ti++) history.push({ pos: new THREE.Vector3(), time: -10, power: 0 });
  trails.push({ mesh: trailMesh, history: history, count: 0, previous: new THREE.Vector3(),
    tip: new THREE.Vector3(), nextSample: 0, ready: false });
}
function resetTrails() {
  trailPower = 0;
  trails.forEach(function (t) { t.mesh.visible = false; t.count = 0; t.ready = false; });
}
function updateTrails(dt) {
  if (dt <= 0) return;
  var player = P.Player, dragon = P.dragon;
  if (!player || !dragon || P.Game.state !== 'playing' || P.Game.cinematic || P.Game.ending || dt > .12) {
    resetTrails(); return;
  }
  var wasTime = trailTime; trailTime += dt;
  var desired = player.boosting ? 1 : player.rollT > 0 ? .8 : 0;
  trailPower += (desired - trailPower) * (1 - Math.exp(-dt * (desired ? 8 : 5)));
  if (!desired && trailPower < .004) { resetTrails(); return; }
  dragon.root.updateMatrixWorld(true);
  trails.forEach(function (t, wingIndex) {
    var wing = dragon.wings[wingIndex], wrist = wing.userData.wrist;
    // Outer finger tip relative to the wrist, matching the authored wing rig.
    t.tip.set(wing.userData.side * 2.7, .12, .5).applyMatrix4(wrist.matrixWorld);
    if (!t.ready || t.previous.distanceToSquared(t.tip) > 90 * 90) {
      t.count = 0; t.previous.copy(t.tip); t.nextSample = wasTime; t.ready = true;
    }
    while (t.nextSample <= trailTime) {
      for (var n = Math.min(t.count, trailCount - 1); n > 0; n--) {
        t.history[n].pos.copy(t.history[n - 1].pos);
        t.history[n].time = t.history[n - 1].time; t.history[n].power = t.history[n - 1].power;
      }
      var sample = t.history[0];
      sample.pos.copy(t.previous).lerp(t.tip, Math.max(0, Math.min(1, (t.nextSample - wasTime) / Math.max(dt, .00001))));
      sample.time = t.nextSample; sample.power = trailPower;
      t.count = Math.min(trailCount, t.count + 1); t.nextSample += 1 / 60;
    }
    t.previous.copy(t.tip);
    var positions = t.mesh.geometry.attributes.position.array, colors = t.mesh.geometry.attributes.color.array;
    var peak = 0;
    for (var j = 0; j <= t.count; j++) {
      var point = j ? t.history[j - 1].pos : t.tip;
      var age = j ? trailTime - t.history[j - 1].time : 0;
      var power = j ? t.history[j - 1].power : trailPower;
      var fade = Math.pow(Math.max(0, 1 - age / trailLife), 1.6) * power;
      peak = Math.max(peak, fade);
      var next = t.history[Math.min(j, t.count - 1)].pos;
      var previous = j > 1 ? t.history[j - 2].pos : t.tip;
      trailTangent.subVectors(previous, next);
      trailView.subVectors(P.camera.position, point);
      trailSide.crossVectors(trailTangent, trailView);
      if (trailSide.lengthSq() < .00001) trailSide.set(1, 0, 0);
      trailSide.normalize().multiplyScalar((.24 + power * .22) * Math.max(.15, 1 - age / trailLife));
      for (var k = 0; k < 3; k++) {
        var offset = j * 9 + k * 3, side = k - 1;
        positions[offset] = point.x + trailSide.x * side;
        positions[offset + 1] = point.y + trailSide.y * side;
        positions[offset + 2] = point.z + trailSide.z * side;
        // Black edges disappear under additive blending for a soft cross-section.
        colors[offset] = colors[offset + 1] = colors[offset + 2] = k === 1 ? fade : 0;
      }
    }
    t.mesh.visible = peak > .015 && t.count > 1;
    t.mesh.geometry.setDrawRange(0, t.count * 12);
    t.mesh.geometry.attributes.position.needsUpdate = true;
    t.mesh.geometry.attributes.color.needsUpdate = true;
  });
}
function burst(pos, size, col, small) {
  var b = pool[cursor++ % pool.length];
  b.g.position.copy(pos); b.g.visible = true; b.g.scale.setScalar(1);
  b.size = size; b.age = 0; b.life = small ? .23 : .85;
  b.halo.material.color.setHex(col); b.ring.material.color.setHex(col);
  b.ring.quaternion.copy(P.camera.quaternion); b.ring.visible = !small;
  b.halo.material.opacity = .9; b.core.material.opacity = 1; b.ring.material.opacity = .65;
  b.halo.scale.setScalar(size * 8); b.core.scale.setScalar(size * 3);
  b.ring.scale.setScalar(.2);
  if (!small) {
    var l = lights[lightCursor++ % lights.length]; l.age = 0;
    l.light.position.copy(pos); l.light.color.setHex(col); l.light.intensity = Math.min(5, size * 1.3);
    l.strength = l.light.intensity;
  }
}
P.fx = {
  burst: burst,
  attachLaser: function (mesh) {
    if (mesh.userData.energyHalo) return;
    var halo = sprite(0x49afff); halo.scale.set(7, 7, 7); mesh.add(halo); mesh.userData.energyHalo = halo;
  },
  update: function (dt) {
    updateTrails(dt);
    pool.forEach(function (b) {
      if (!b.g.visible) return;
      b.age += dt; var u = Math.min(1, b.age / b.life);
      b.g.visible = u < 1;
      b.halo.scale.setScalar(b.size * (8 + u * 18));
      b.core.scale.setScalar(b.size * (3 + u * 5));
      b.halo.material.opacity = Math.pow(1 - u, 2) * .85;
      b.core.material.opacity = Math.pow(1 - u, 6);
      b.ring.scale.setScalar(b.size * (.6 + u * 9)); b.ring.material.opacity = Math.pow(1 - u, 2) * .65;
    });
    lights.forEach(function (l) { l.age += dt; l.light.intensity = (l.strength || 0) * Math.pow(Math.max(0, 1 - l.age / .32), 2); });
  },
  reset: function () { resetTrails(); pool.forEach(function (b) { b.g.visible = false; }); lights.forEach(function (l) { l.age = 1; l.light.intensity = 0; }); },
  stats: function () { return { capacity: pool.length, active: pool.filter(function (b) { return b.g.visible; }).length,
    lights: lights.length, trails: trails.filter(function (t) { return t.mesh.visible; }).length, trailCapacity: trails.length }; }
};
})();
