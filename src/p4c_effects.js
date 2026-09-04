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
  reset: function () { pool.forEach(function (b) { b.g.visible = false; }); lights.forEach(function (l) { l.age = 1; l.light.intensity = 0; }); },
  stats: function () { return { capacity: pool.length, active: pool.filter(function (b) { return b.g.visible; }).length, lights: lights.length }; }
};
})();
