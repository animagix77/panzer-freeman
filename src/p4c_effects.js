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
var ringGeo = new THREE.TorusGeometry(1, .014, 4, 48);
for (i = 0; i < 40; i++) {
  var g = new THREE.Group(), halo = sprite(0xff974a), core = sprite(0xffffff);
  var ring = new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({ color: 0xffb878, transparent: true,
    blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
  g.add(halo, core, ring); g.visible = false; scene.add(g);
  pool.push({ g: g, halo: halo, core: core, ring: ring, age: 0, life: 0, size: 1 });
}
for (i = 0; i < 3; i++) { var light = new THREE.PointLight(0xff9944, 0, 95, 2); scene.add(light); lights.push({ light: light, age: 1 }); }

// Explosion afterglow: all hot fragments share one line batch, while a small
// smoke pool leaves a readable silhouette after the initial flash has gone.
var sparks = [], sparkCursor = 0, sparkCapacity = 256, smoke = [], smokeCursor = 0;
var sparkPos = new Float32Array(sparkCapacity * 6), sparkCol = new Float32Array(sparkCapacity * 6);
var sparkGeo = new THREE.BufferGeometry();
sparkGeo.setAttribute('position', new THREE.BufferAttribute(sparkPos, 3).setUsage(THREE.DynamicDrawUsage));
sparkGeo.setAttribute('color', new THREE.BufferAttribute(sparkCol, 3).setUsage(THREE.DynamicDrawUsage));
var sparkMesh = new THREE.LineSegments(sparkGeo, new THREE.LineBasicMaterial({ vertexColors: true,
  transparent: true, opacity: .9, blending: THREE.AdditiveBlending, depthWrite: false, fog: false }));
sparkMesh.name = 'explosion-embers'; sparkMesh.visible = false; sparkMesh.frustumCulled = false; scene.add(sparkMesh);
for (i = 0; i < sparkCapacity; i++) sparks.push({ pos: new THREE.Vector3(), velocity: new THREE.Vector3(), age: 10, life: 0 });
var smokeData = new Uint8Array(64 * 64 * 4);
for (i = 0; i < 4096; i++) {
  var sx = (i % 64 - 31.5) / 31.5, sy = (Math.floor(i / 64) - 31.5) / 31.5;
  var billow = Math.max(0, 1 - Math.sqrt(sx * sx + sy * sy));
  var folds = .72 + .14 * Math.sin(sx * 13 + Math.sin(sy * 9)) + .14 * Math.cos(sy * 16 - sx * 7);
  smokeData[i * 4] = smokeData[i * 4 + 1] = smokeData[i * 4 + 2] = 255;
  smokeData[i * 4 + 3] = Math.round(255 * Math.pow(billow, 1.2) * folds);
}
var smokeTex = new THREE.DataTexture(smokeData, 64, 64, THREE.RGBAFormat);
smokeTex.minFilter = smokeTex.magFilter = THREE.LinearFilter; smokeTex.needsUpdate = true;
for (i = 0; i < 18; i++) {
  var cloud = new THREE.Sprite(new THREE.SpriteMaterial({ map: smokeTex, color: 0x594951,
    transparent: true, opacity: 0, depthWrite: false, fog: true }));
  cloud.name = 'explosion-smoke'; cloud.visible = false; scene.add(cloud);
  smoke.push({ mesh: cloud, pos: new THREE.Vector3(), age: 10, life: 0, size: 1, drift: 0 });
}
var smokeHot = new THREE.Color(0xed965b), smokeCold = new THREE.Color(0x594951);
function fogVisibility(pos) {
  var fog = scene.fog;
  if (!fog || fog.far === undefined) return 1;
  var distance = pos.distanceTo(P.camera.position);
  var u = Math.max(0, Math.min(1, (distance - fog.near) / Math.max(1, fog.far - fog.near)));
  return 1 - u * u * (3 - 2 * u);
}
function explosionAfterglow(pos, size) {
  var count = Math.min(30, Math.round(14 + size * 2));
  for (var i = 0; i < count; i++) {
    var s = sparks[sparkCursor++ % sparkCapacity], vertical = 1 - (i + .5) / count * 2;
    var radius = Math.sqrt(1 - vertical * vertical), angle = i * 2.399963 + sparkCursor * .17;
    s.pos.copy(pos); s.age = 0; s.life = .55 + (i % 5) * .13;
    s.velocity.set(Math.cos(angle) * radius, vertical * .8 + .22, Math.sin(angle) * radius)
      .multiplyScalar((20 + (i % 4) * 9) * Math.min(2.3, .65 + size * .18));
  }
  for (var puff = 0; puff < 3; puff++) {
    var c = smoke[smokeCursor++ % smoke.length];
    c.age = 0; c.life = 1.3 + puff * .18; c.size = Math.min(7, size) * (3.8 + puff * .8);
    c.pos.copy(pos); c.pos.x += (puff - 1) * size * .7; c.pos.y += puff * size * .35;
    c.drift = (puff - 1) * 2.8;
    c.mesh.position.copy(c.pos); c.mesh.material.opacity = 0; c.mesh.material.rotation = puff * 2.1;
    c.mesh.scale.setScalar(c.size); c.mesh.visible = true;
  }
}
function updateAfterglow(dt) {
  var active = 0;
  sparks.forEach(function (s, i) {
    var k = i * 6;
    if (s.age >= s.life) { sparkCol.fill(0, k, k + 6); return; }
    s.age = Math.min(s.life, s.age + dt);
    // Closed-form drag/gravity keeps spark travel stable at low frame rates.
    var drag = Math.exp(-dt * 1.7), travel = (1 - drag) / 1.7;
    s.pos.addScaledVector(s.velocity, travel); s.pos.y -= 14 * (dt - travel) / 1.7;
    s.velocity.multiplyScalar(drag); s.velocity.y -= 14 * travel;
    var fade = Math.pow(1 - s.age / s.life, 1.4) * fogVisibility(s.pos);
    var tail = .065 * Math.max(.3, 1 - s.age / s.life);
    sparkPos[k] = s.pos.x; sparkPos[k + 1] = s.pos.y; sparkPos[k + 2] = s.pos.z;
    sparkPos[k + 3] = s.pos.x - s.velocity.x * tail; sparkPos[k + 4] = s.pos.y - s.velocity.y * tail;
    sparkPos[k + 5] = s.pos.z - s.velocity.z * tail;
    sparkCol[k] = fade; sparkCol[k + 1] = fade * (.42 + .5 * Math.exp(-s.age * 5)); sparkCol[k + 2] = fade * .25;
    sparkCol[k + 3] = fade * .12; sparkCol[k + 4] = fade * .025; sparkCol[k + 5] = 0;
    if (fade > .001) active++;
  });
  sparkMesh.visible = active > 0;
  sparkGeo.attributes.position.needsUpdate = true; sparkGeo.attributes.color.needsUpdate = true;
  smoke.forEach(function (c) {
    if (!c.mesh.visible) return;
    c.age += dt; var u = Math.min(1, c.age / c.life);
    c.mesh.visible = u < 1;
    c.mesh.position.set(c.pos.x + c.drift * c.age, c.pos.y + c.age * (7 + c.size * .08), c.pos.z);
    c.mesh.scale.setScalar(c.size * (1 + u * 1.6));
    c.mesh.material.color.copy(smokeHot).lerp(smokeCold, Math.min(1, c.age * 3.4));
    c.mesh.material.opacity = .42 * Math.min(1, c.age / .12) * Math.pow(1 - u, 1.5) * fogVisibility(c.mesh.position);
    c.mesh.material.rotation += dt * c.drift * .035;
  });
}

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
  b.halo.material.opacity = .9; b.core.material.opacity = 1; b.ring.material.opacity = .24;
  b.halo.scale.setScalar(size * 8); b.core.scale.setScalar(size * 3);
  b.ring.scale.setScalar(.2);
  if (!small) {
    explosionAfterglow(pos, size);
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
    updateAfterglow(dt);
    pool.forEach(function (b) {
      if (!b.g.visible) return;
      b.age += dt; var u = Math.min(1, b.age / b.life);
      b.g.visible = u < 1;
      b.halo.scale.setScalar(b.size * (8 + u * 18));
      b.core.scale.setScalar(b.size * (3 + u * 5));
      var visibility = fogVisibility(b.g.position);
      b.halo.material.opacity = Math.pow(1 - u, 2) * .85 * visibility;
      b.core.material.opacity = Math.pow(1 - u, 6) * visibility;
      b.ring.scale.setScalar(b.size * (.6 + u * 9)); b.ring.material.opacity = Math.pow(1 - u, 2) * .24 * visibility;
    });
    lights.forEach(function (l) { l.age += dt; l.light.intensity = (l.strength || 0) * Math.pow(Math.max(0, 1 - l.age / .32), 2); });
  },
  reset: function () { resetTrails(); pool.forEach(function (b) { b.g.visible = false; }); lights.forEach(function (l) { l.age = 1; l.light.intensity = 0; });
    sparks.forEach(function (s) { s.age = s.life; }); sparkCol.fill(0); sparkMesh.visible = false;
    smoke.forEach(function (c) { c.mesh.visible = false; }); },
  stats: function () { return { capacity: pool.length, active: pool.filter(function (b) { return b.g.visible; }).length,
    lights: lights.length, trails: trails.filter(function (t) { return t.mesh.visible; }).length, trailCapacity: trails.length,
    sparks: sparks.filter(function (s) { return s.age < s.life; }).length, sparkCapacity: sparkCapacity,
    smoke: smoke.filter(function (c) { return c.mesh.visible; }).length, smokeCapacity: smoke.length }; }
};
})();
