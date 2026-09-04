/* =========================================================================
   Part 3 — world: terrain chunks, prop fields, episode definitions
   ========================================================================= */
(function () {
var P = window.__PF;
var V3 = P.V3, M = P.M, G = P.G, rand = P.rand, clamp = P.clamp, lerp = P.lerp, TAU = P.TAU;
var scene = P.scene, m = P.models;

// ----------------------------------------------------------- height fields
function hCanyon(x, z) {
  var ax = Math.abs(x);
  var t = Math.max(0, (ax - 105) / 70);
  var wall = 86 * (1 - Math.exp(-t * 1.35));
  var dune = Math.sin(x * 0.031) * 3.6 + Math.sin(z * 0.023 + x * 0.009) * 5.4
           + Math.sin(x * 0.081 + z * 0.047) * 2.4 + Math.sin(z * 0.107) * 1.5
           + Math.sin(x * 0.19 + z * 0.14) * 0.9;
  var mesaMask = clamp((ax - 95) / 30, 0, 1);
  var mesa = Math.max(0, Math.sin(z * 0.0061 + x * 0.0017) - 0.44) * 62 * mesaMask;
  // A long central mesa makes two real passages through the second half.
  var fork = clamp((z - 3900) / 500, 0, 1) * clamp((6100 - z) / 500, 0, 1);
  var ridge = 74 * Math.exp(-Math.pow(x / 24, 4)) * fork;
  return wall + dune + mesa + ridge;
}
function hSea(x, z) {
  return Math.sin(x * 0.055) * 2.6 + Math.sin(z * 0.047 + 1.3) * 3.1
       + Math.sin((x + z) * 0.021) * 3.6 + Math.sin(x * 0.121 + z * 0.093) * 1.5
       + Math.sin(x * 0.24 + z * 0.19) * 0.8 - 5;
}

function hCitadel(x, z) {
  // Continuous mountain shoulders support the fortress on either side of a ravine.
  var shoulder = Math.max(0, Math.abs(x) - 78);
  var rough = Math.min(1, shoulder / 55) * (Math.sin(z * .019 + x * .022) * 16 + Math.abs(Math.sin(z * .009 - x * .031)) * 35);
  return -28 + Math.min(130, shoulder * 0.85) + Math.sin(z * 0.012) * 5 + rough;
}
function hFoundry(x, z) {
  return -12 + Math.max(0, Math.abs(x) - 90) * 0.42 + Math.sin(z * 0.02) * 3;
}

// Keep dense vertices around the flight corridor, spreading the outer terrain beyond fog.
function terrainX(i, sx, width) { var u = i / sx * 2 - 1; return width * .5 * (.25 * u + .75 * u * u * u); }
// ------------------------------------------------------------------ terrain
function Terrain() {
  this.group = new THREE.Group();
  scene.add(this.group);
  this.chunks = [];
  this.W = 2400; this.D = 100; this.SX = 90; this.SZ = 18; this.N = 24;
  this.behind = 1100;
  this.enabled = false;
  this.cfg = null;
  for (var i = 0; i < this.N; i++) this.chunks.push(this._mkChunk());
}
Terrain.prototype._mkChunk = function () {
  var sx = this.SX, sz = this.SZ, W = this.W, D = this.D;
  var pos = [], col = [], idx = [];
  for (var j = 0; j <= sz; j++) {
    for (var i = 0; i <= sx; i++) {
      pos.push(terrainX(i, sx, W), 0, (j / sz) * D);
      col.push(1, 1, 1);
    }
  }
  // Alternate the split diagonal in a checker so slopes don't develop the
  // long directional slivers a uniform triangulation produces.
  for (var j2 = 0; j2 < sz; j2++) {
    for (var i2 = 0; i2 < sx; i2++) {
      var a = j2 * (sx + 1) + i2, b = a + 1, c = a + sx + 1, d = c + 1;
      if (((i2 + j2) & 1) === 0) idx.push(a, c, b, b, c, d);
      else                       idx.push(a, c, d, a, d, b);
    }
  }
  var g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  var mat = new THREE.MeshPhongMaterial({ flatShading: true, vertexColors: true, shininess: 0, specular: 0x000000 });
  P.retroPatch(mat);
  var mesh = new THREE.Mesh(g, mat);
  mesh.frustumCulled = true;
  mesh.receiveShadow = true;   // the ground is the only shadow receiver
  this.group.add(mesh);
  return { mesh: mesh, geo: g, mat: mat, z: 0 };
};
Terrain.prototype.configure = function (cfg, startZ) {
  this.cfg = cfg;
  this.enabled = !!cfg;
  this.group.visible = this.enabled;
  if (!this.enabled) return;
  for (var i = 0; i < this.N; i++) {
    var c = this.chunks[i];
    c.mat.color.set(0xffffff);
    this._fill(c, Math.floor(startZ / this.D) * this.D - this.behind + i * this.D);
  }
};
Terrain.prototype._fill = function (c, zBase) {
  var cfg = this.cfg, sx = this.SX, sz = this.SZ, W = this.W, D = this.D;
  var pa = c.geo.attributes.position.array;
  var ca = c.geo.attributes.color.array;
  var lo = cfg.colLo, hi = cfg.colHi, hr = cfg.colRange || 40;
  var k = 0;
  for (var j = 0; j <= sz; j++) {
    var wz = zBase + (j / sz) * D;
    for (var i = 0; i <= sx; i++) {
      var wx = terrainX(i, sx, W);
      var h = cfg.h(wx, wz);
      pa[k * 3 + 1] = h;
      var t = clamp((h - cfg.colBase) / hr, 0, 1);
      t = t * t * (3 - 2 * t);
      ca[k * 3]     = lerp(lo.r, hi.r, t);
      ca[k * 3 + 1] = lerp(lo.g, hi.g, t);
      ca[k * 3 + 2] = lerp(lo.b, hi.b, t);
      k++;
    }
  }
  c.geo.attributes.position.needsUpdate = true;
  c.geo.attributes.color.needsUpdate = true;
  c.geo.computeVertexNormals();
  c.geo.computeBoundingSphere();
  c.mesh.position.z = zBase;
  c.z = zBase;
};
Terrain.prototype.update = function (playerZ) {
  if (!this.enabled) return;
  var span = this.N * this.D;
  for (var i = 0; i < this.N; i++) {
    var c = this.chunks[i];
    if (playerZ - (c.z + this.D) > this.behind) {
      var jumps = Math.floor((playerZ - this.behind - c.z - this.D) / span) + 1;
      this._fill(c, c.z + span * jumps);
    }
  }
};
Terrain.prototype.heightAt = function (x, z) {
  return this.enabled && this.cfg ? this.cfg.h(x, z) : -9999;
};

// --------------------------------------------------------------- prop field
function PropField() {
  this.group = new THREE.Group();
  scene.add(this.group);
  this.items = [];
  this.spec = null;
  this.nextZ = 0;
}
PropField.prototype.clear = function () {
  for (var i = 0; i < this.items.length; i++) {
    this.group.remove(this.items[i].obj);
    disposeTree(this.items[i].obj);
  }
  this.items.length = 0;
  this.spec = null;
};
PropField.prototype.configure = function (spec, startZ) {
  this.clear();
  this.spec = spec;
  this.nextZ = startZ - 900;
  this.ahead = 1100;
  this.capacity = spec ? Math.max(spec.count, Math.ceil(2300 / (spec.gap * .7)) + 2) : 0;
  if (!spec) return;
  // preload the visible band
  for (var i = 0; i < this.capacity; i++) this._spawn();
};
PropField.prototype._spawn = function () {
  var s = this.spec;
  var obj = s.make();
  batchProp(obj);
  s.place(obj, this.nextZ);
  this.group.add(obj);
  this.items.push({ obj: obj, z: this.nextZ });
  this.nextZ += s.gap * rand(0.7, 1.3);
};
PropField.prototype.update = function (playerZ) {
  if (!this.spec) return;
  var s = this.spec;
  while (this.nextZ < playerZ + this.ahead) {
    // recycle the furthest-behind item if the pool is full
    if (this.items.length >= this.capacity) {
      var it = this.items.shift();
      s.place(it.obj, this.nextZ);
      it.z = this.nextZ;
      this.items.push(it);
      this.nextZ += s.gap * rand(0.7, 1.3);
    } else this._spawn();
  }
};

function batchProp(root) {
  root.updateMatrixWorld(true);
  var batches = {}, meshes = [], inverse = root.matrixWorld.clone().invert();
  root.traverse(function (o) {
    if (!o.isMesh || Array.isArray(o.material)) return;
    var key = o.material.uuid, b = batches[key];
    if (!b) b = batches[key] = { material: o.material, p: [], n: [], uv: [], shadow: o.castShadow };
    var geo = o.geometry.index ? o.geometry.toNonIndexed() : o.geometry.clone();
    geo.applyMatrix4(new THREE.Matrix4().multiplyMatrices(inverse, o.matrixWorld));
    var pos = geo.attributes.position, normal = geo.attributes.normal, uv = geo.attributes.uv;
    for (var i = 0; i < pos.count; i++) {
      b.p.push(pos.getX(i), pos.getY(i), pos.getZ(i));
      b.n.push(normal ? normal.getX(i) : 0, normal ? normal.getY(i) : 1, normal ? normal.getZ(i) : 0);
      b.uv.push(uv ? uv.getX(i) : 0, uv ? uv.getY(i) : 0);
    }
    geo.dispose(); meshes.push(o);
  });
  meshes.forEach(function (o) { o.parent.remove(o); o.geometry.dispose(); });
  Object.keys(batches).forEach(function (key) {
    var b = batches[key], geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(b.p, 3));
    geo.setAttribute('normal', new THREE.Float32BufferAttribute(b.n, 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(b.uv, 2));
    geo.computeBoundingSphere();
    var mesh = new THREE.Mesh(geo, b.material); mesh.castShadow = b.shadow; root.add(mesh);
  });
}

function disposeTree(o) {
  o.traverse(function (n) {
    if (n.geometry) n.geometry.dispose();
  });
}

// ================================================================ EPISODES
function C(hex) { return new THREE.Color(hex); }

var EPISODES = [
  {
    id: 'ep1', label: 'EPISODE I', name: 'THE ASHEN CANYON',
    sub: 'Where the empire buried its machines, the sand still hums.',
    music: 'ep1', length: 7400, railY: 22, speed: 56,
    weather: { ember: 0.85, wind: 0.35 },   // the buried machines still burn
    sky: { lo: 0xffb257, mid: 0xd15a56, hi: 0x33195e, sun: 0xffd08a, sunDir: [0.18, 0.06, 1], sunSize: 0.0034, bands: 24, shaft: 0.46 },
    fog: { col: 0xc4785c, near: 110, far: 640 },
    light: { amb: 0x5d3a4a, ambI: 1.0, key: 0xffcf9a, keyI: 1.15, kd: [0.3, 0.55, 1], rim: 0x7d5fd0, rimI: 0.4 },
    terrain: {
      h: hCanyon, colLo: C(0xe8bf78), colHi: C(0x6d3a2a), colBase: 0, colRange: 52
    },
    props: {
      count: 20, gap: 110, ahead: 820,
      make: function () { return Math.random() < 0.55 ? m.buildSpire(rand(26, 62), 0x9c6742) : m.buildRock(1.1, 0xb3844f); },
      place: function (o, z) {
        var side = Math.random() < 0.5 ? -1 : 1;
        var x = side * rand(112, 220);
        o.position.set(x, hCanyon(x, z) - 4, z);
        o.rotation.y = rand(0, TAU);
        o.scale.setScalar(rand(0.75, 1.5));
      }
    },
    props2: {
      count: 8, gap: 260, ahead: 800,
      make: function () { return m.buildCloud(0xa15d4a); },
      place: function (o, z) {
        o.position.set(rand(-220, 220), rand(78, 150), z);
        o.scale.setScalar(rand(1, 2.2));
      }
    },
    enemyMix: [['wasp', 5], ['turret', 3], ['ray', 2], ['chaser', 1], ['mine', 2]],
    density: 0.85
  },
  {
    id: 'ep2', label: 'EPISODE II', name: 'THE DROWNED CHOIR',
    sub: 'A city sang here once. Now only the water keeps the tune.',
    music: 'ep2', length: 6400, railY: 20, speed: 60,
    weather: { rain: 1.0, wind: 0.7 },      // the drowned city, still drowning
    sky: { lo: 0x8fe0e6, mid: 0x2f7fa8, hi: 0x0e2140, sun: 0xdff4ff, sunDir: [-0.35, 0.22, 1], sunSize: 0.0022, bands: 22 },
    fog: { col: 0x3f90ad, near: 100, far: 620 },
    light: { amb: 0x2f4a68, ambI: 1.05, key: 0xd8f2ff, keyI: 1.0, kd: [-0.4, 0.6, 1], rim: 0x2fd8c8, rimI: 0.45 },
    terrain: {
      h: hSea, colLo: C(0x0b3a55), colHi: C(0x5ec8cc), colBase: -9, colRange: 12
    },
    props: {
      count: 20, gap: 96, ahead: 700,
      make: function () { return m.buildRuin(0x9aa7ac); },
      place: function (o, z) {
        var side = Math.random() < 0.5 ? -1 : 1;
        var x = side * rand(95, 210);
        o.position.set(x, -8, z);
        o.rotation.set(rand(-0.14, 0.14), rand(0, TAU), rand(-0.14, 0.14));
        o.scale.setScalar(rand(0.85, 1.8));
      }
    },
    props2: {
      count: 7, gap: 300, ahead: 800,
      make: function () { return m.buildCloud(0x7ba0b8); },
      place: function (o, z) {
        o.position.set(rand(-240, 240), rand(70, 140), z);
        o.scale.setScalar(rand(1.2, 2.4));
      }
    },
    enemyMix: [['ray', 5], ['wasp', 4], ['chaser', 3], ['carrier', 1], ['mine', 2]],
    density: 1.0
  },
  {
    id: 'foundry', label: 'EPISODE III', name: 'THE EMBER FOUNDRY',
    sub: 'The empire feeds its furnaces with borrowed time. Break the supply line.',
    music: 'ep1', length: 6100, railY: 28, speed: 62,
    weather: { ember: 1.2, wind: 0.8 },
    sky: { lo: 0xff9a48, mid: 0x652d40, hi: 0x130f25, sun: 0xffb46c, sunDir: [0.2, 0.1, 1], sunSize: 0.003, bands: 24, shaft: 0.3 },
    fog: { col: 0x653b40, near: 140, far: 740 },
    light: { amb: 0x59414e, ambI: 1.05, key: 0xffb76c, keyI: 1.3, kd: [0.3, 0.6, 1], rim: 0x68bbdc, rimI: 0.6 },
    terrain: { h: hFoundry, colLo: C(0x372e35), colHi: C(0x866151), colBase: -12, colRange: 80 },
    props: {
      count: 16, gap: 130, ahead: 850,
      make: function () { return m.buildFoundry(); },
      place: function (o, z) {
        var x = (Math.round(z / 130) % 2 ? -1 : 1) * 120;
        o.position.set(x, hFoundry(x, z), z); o.rotation.y = x < 0 ? 0 : Math.PI;
      }
    },
    props2: {
      count: 8, gap: 240, ahead: 800,
      make: function () { return m.buildCloud(0x78616d); },
      place: function (o, z) { o.position.set(Math.sin(z) * 180, 130, z); o.scale.setScalar(1.8); }
    },
    enemyMix: [['carrier', 4], ['turret', 3], ['chaser', 2], ['wasp', 2]], density: 1.1
  },
  {
    id: 'ep3', label: 'EPISODE IV', name: 'THE CITADEL OF HOURS',
    sub: 'The mountain holds the city. The city holds the stolen years.',
    music: 'ep3', length: 7000, railY: 46, speed: 64,
    weather: { snow: 1.0, wind: 0.5 },      // above the last cloud
    sky: { lo: 0xffa8d4, mid: 0x7a4fc0, hi: 0x120833, sun: 0xffd9f0, sunDir: [0.5, 0.3, -1], sunSize: 0.0030, bands: 20 },
    fog: { col: 0x6a45a0, near: 110, far: 660 },
    light: { amb: 0x4a3070, ambI: 1.1, key: 0xffc7ea, keyI: 1.0, kd: [0.5, 0.5, -1], rim: 0x62e0ff, rimI: 0.55 },
    terrain: { h: hCitadel, colLo: C(0x322e48), colHi: C(0xaaa0bc), colBase: -28, colRange: 110 },
    props: {
      count: 14, gap: 150, ahead: 850,
      make: function () { return m.buildKeep(); },
      place: function (o, z) {
        var x = (Math.round(z / 150) % 2 ? -1 : 1) * 128;
        o.position.set(x, hCitadel(x, z), z);
        o.rotation.y = x < 0 ? 0 : Math.PI;
      }
    },
    props2: {
      count: 10, gap: 190, ahead: 820,
      make: function () { return m.buildCloud(0x8d5b9e); },
      place: function (o, z) {
        o.position.set(rand(-200, 200), rand(-130, -60), z);
        o.scale.setScalar(rand(1.6, 3.4));
      }
    },
    enemyMix: [['chaser', 4], ['wasp', 4], ['ray', 4], ['carrier', 2], ['turret', 1], ['mine', 2]],
    density: 1.18
  },
  {
    id: 'boss', label: 'FINAL', name: 'CHRONOS, THE HOUR-SPHINX',
    sub: 'It has counted every second of his life. It intends to keep them.',
    music: 'boss', length: 1e9, railY: 46, speed: 40,
    weather: { snow: 0.5, ember: 0.7, wind: 0.9 },  // snow and forge-light together
    sky: { lo: 0xff7a4a, mid: 0x52205e, hi: 0x08030f, sun: 0xff9f5f, sunDir: [0.15, -0.06, 1], sunSize: 0.0042, bands: 18 },
    fog: { col: 0x3a1140, near: 120, far: 700 },
    light: { amb: 0x5c3358, ambI: 1.25, key: 0xffc190, keyI: 1.25, kd: [0.25, 0.45, -1], rim: 0x9a5fff, rimI: 0.7 },
    terrain: { h: hCitadel, colLo: C(0x251e30), colHi: C(0x72536e), colBase: -28, colRange: 110 },
    props: {
      count: 10, gap: 180, ahead: 850,
      make: function () { return m.buildKeep(); },
      place: function (o, z) {
        var x = (Math.round(z / 180) % 2 ? -1 : 1) * 150;
        o.position.set(x, hCitadel(x, z), z);
        o.rotation.y = x < 0 ? 0 : Math.PI;
      }
    },
    props2: {
      count: 10, gap: 170, ahead: 800,
      make: function () { return m.buildCloud(0x6a2f5a); },
      place: function (o, z) {
        o.position.set(rand(-220, 220), rand(-150, -70), z);
        o.scale.setScalar(rand(2, 4));
      }
    },
    enemyMix: [['mine', 3], ['wasp', 2]],
    density: 0.35
  }
];

P.world = {
  Terrain: Terrain, PropField: PropField, EPISODES: EPISODES,
  hCanyon: hCanyon, hSea: hSea, hCitadel: hCitadel, disposeTree: disposeTree
};

})();
if (window.__PFLOAD) __PFLOAD.set(0.5, 'SEEDING THE WORLD');
