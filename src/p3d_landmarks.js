/* Monumental route architecture. Four recycled, material-batched structures. */
(function () {
'use strict';
var P = window.__PF, sites = [], spacing = 960, capacity = 4, stage = null, stageStart = 0, previousRail = null;
var palettes = {
  ep1: [0xa76b45, 0xe4b273, 0x573d35, 0xffca75],
  ep2: [0x476e7a, 0xa7c5be, 0x253d54, 0x78f1e5],
  foundry: [0x46444b, 0x987a66, 0x262a35, 0xff6b24],
  ep3: [0x746578, 0xc0abc4, 0x3f344f, 0xf3b66c],
  boss: [0x62516f, 0xb898b2, 0x342c46, 0xfb6fad]
};
var materials = [];
function clear(site) {
  while (site.root.children.length) {
    var mesh = site.root.children[0]; site.root.remove(mesh); mesh.geometry.dispose();
  }
}
function build(site, z, ep) {
  clear(site); site.z = z; site.root.position.z = z;
  var batches = [[], [], [], []], variant = Math.abs(Math.round((z - stageStart - 450) / spacing)) % 3;
  function put(geo, x, y, localZ, key, rotation) {
    if (rotation) geo.applyMatrix4(new THREE.Matrix4().makeRotationFromQuaternion(rotation));
    geo.translate(x, y, localZ);
    var flat = geo.index ? geo.toNonIndexed() : geo;
    batches[key || 0].push(flat);
    if (flat !== geo) geo.dispose();
  }
  function box(w, h, d, x, y, localZ, key) { put(new THREE.BoxGeometry(w, h, d), x, y, localZ, key); }
  function beam(x1, y1, x2, y2, width, depth, localZ, key) {
    var direction = new THREE.Vector3(x2 - x1, y2 - y1, 0), length = direction.length();
    put(new THREE.BoxGeometry(width, length + .4, depth), (x1 + x2) / 2, (y1 + y2) / 2, localZ, key,
      new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction.normalize()));
  }
  function ground(x, localZ) { return ep.terrain ? ep.terrain.h(x, z + localZ) : -10; }
  function pier(x, localZ, top, width, depth, key) {
    var floor = Math.min(ground(x, localZ), ground(x - width / 2 - 6, localZ - depth / 2 - 6),
      ground(x + width / 2 + 6, localZ - depth / 2 - 6), ground(x - width / 2 - 6, localZ + depth / 2 + 6),
      ground(x + width / 2 + 6, localZ + depth / 2 + 6)) - 12;
    box(width, top - floor, depth, x, (top + floor) / 2, localZ, key);
    box(width + 12, 12, depth + 12, x, floor + 12, localZ, 2);
    box(width + 8, 9, depth + 8, x, top, localZ, 1);
  }
  function arch(radius, spring, rise, localZ, width, key) {
    for (var i = 0; i < 14; i++) {
      var a = i / 14 * Math.PI, b = (i + 1) / 14 * Math.PI;
      beam(Math.cos(a) * radius, spring + Math.sin(a) * rise,
        Math.cos(b) * radius, spring + Math.sin(b) * rise, width, 17, localZ, i % 4 === 0 ? 1 : key);
    }
  }
  if (ep.id === 'ep1') {
    // Twin aqueduct ribs make a recognisable silhouette against the opening sky.
    [-24, 24].forEach(function (depth) {
      [-1, 1].forEach(function (side) { pier(side * 178, depth, 138, 30, 24, 0); });
      arch(178, 138, 74 + variant * 7, depth, 22, 0);
    });
    for (var support = -3; support <= 3; support++) {
      var sx = support * 48, archTop = 138 + Math.sqrt(1 - sx * sx / (178 * 178)) * (74 + variant * 7) + 7;
      var deckBottom = 230 + variant * 7;
      box(24, deckBottom - archTop + 4, 64, sx, (deckBottom + archTop) / 2, 0, 0);
    }
    [-178, 178].forEach(function (x) { box(34, 98 + variant * 7, 70, x, 184 + variant * 3.5, 0, 0); });
    box(418, 16, 70, 0, 238 + variant * 7, 0, 0);
    box(426, 5, 76, 0, 248 + variant * 7, 0, 1);
    for (var x = -192; x <= 192; x += 32) {
      // Missing parapet stones break the pristine repeated outline.
      if ((x / 32 + variant + 6) % 4 !== 1) box(19, 9 + ((x + 192) % 3) * 3, 12, x, 255 + variant * 7, -30, 1);
    }
    [-1, 1].forEach(function (side) {
      pier(side * 258, 8, 169 + variant * 11, 35, 38, 0);
      box(48, 8, 48, side * 258, 178 + variant * 11, 8, 1);
      box(16, 32, 20, side * 178, 181, -39, 2);
    });
  } else if (ep.id === 'ep2') {
    // A drowned nave: tall buttresses, a pointed double arch, and turquoise windows.
    [-1, 1].forEach(function (side) {
      pier(side * 173, 0, 213, 30, 48, 0);
      pier(side * 215, 18, 140, 26, 30, 2);
      beam(side * 215, 128, side * 173, 203, 13, 16, 18, 1);
      put(new THREE.ConeGeometry(24, 67, 4), side * 173, 251, 0, 1);
      box(12, 59, 1.5, side * 173, 159, -25, 3);
      box(4, 66, 2, side * 173, 159, -27, 2);
      [-19, 19].forEach(function (depth) {
        beam(side * 169, 127, side * 126, 183, 16, 15, depth, 1);
        beam(side * 126, 183, side * 67, 217, 16, 15, depth, 0);
        beam(side * 67, 217, 0, 247, 16, 15, depth, 1);
      });
    });
    put(new THREE.TorusGeometry(19, 4, 5, 12), 0, 241, -21, 1);
    beam(-15, 241, 15, 241, 3, 5, -22, 3);
    beam(0, 226, 0, 256, 3, 5, -22, 3);
  } else if (ep.id === 'foundry') {
    // A working furnace gantry: heavy legs, orange furnace mouths and overhead trusses.
    [-1, 1].forEach(function (side) {
      [-24, 24].forEach(function (depth) { pier(side * 168, depth, 192, 22, 22, 0); });
      var floor = ground(side * 172, 0);
      box(58, 86, 83, side * 172, floor + 35, 0, 2);
      box(29, 35, 2, side * 172, floor + 47, -43, 3);
      for (var bar = -1; bar <= 1; bar++) box(3, 40, 4, side * 172 + bar * 9, floor + 47, -45, 0);
      box(72, 13, 93, side * 172, floor + 81, 0, 1);
      var chimneyFloor = ground(side * 230, 19);
      put(new THREE.CylinderGeometry(9, 16, 196, 6), side * 230, chimneyFloor + 86, 19, 0);
      put(new THREE.CylinderGeometry(10, 10, 7, 6), side * 230, chimneyFloor + 183, 19, 3);
    });
    [-25, 25].forEach(function (depth) {
      box(400, 13, 17, 0, 184, depth, 0); box(416, 10, 19, 0, 223, depth, 1);
      for (var x = -180; x < 180; x += 45) beam(x, 188, x + 45, 218, 6, 10, depth, 1);
    });
    for (var lamp = -3; lamp <= 3; lamp++) box(12, 4, 42, lamp * 48, 175, 0, 3);
    box(105, 18, 78, variant * 55 - 55, 238, 0, 2);
  } else {
    // Mountain fortification: the bridge carries between towers with deep foundations.
    [-1, 1].forEach(function (side) {
      var top = Math.max(235, ground(side * 166, 0) + 94);
      pier(side * 166, 0, top, 52, 66, 0);
      box(69, 12, 80, side * 166, top + 10, 0, 1);
      put(new THREE.ConeGeometry(39, 56, 4), side * 166, top + 41, 0, 2);
      box(15, 53, 2, side * 166, top - 46, -34, 3);
      [-20, 20].forEach(function (dx) { box(9, 16, 12, side * 166 + dx, top + 23, -32, 1); });
    });
    arch(166, 150, 59, -23, 18, 1); arch(166, 150, 59, 23, 18, 0);
    box(38, 26, 60, 0, 219, 0, 1);
    box(340, 18, 62, 0, 229, 0, 0); box(350, 5, 70, 0, 242, 0, 1);
    for (var tooth = -140; tooth <= 140; tooth += 28) box(15, 15, 11, tooth, 251, -29, 1);
    [-92, 92].forEach(function (x) { box(17, 32, 2, x, 210, -33, 2); box(9, 25, 2, x, 210, -35, 3); });
  }
  batches.forEach(function (parts, key) {
    if (!parts.length) return;
    var length = parts.reduce(function (sum, g) { return sum + g.attributes.position.array.length; }, 0);
    var positions = new Float32Array(length), normals = new Float32Array(length), offset = 0;
    parts.forEach(function (g) {
      positions.set(g.attributes.position.array, offset); normals.set(g.attributes.normal.array, offset);
      offset += g.attributes.position.array.length; g.dispose();
    });
    var geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3)); geo.setAttribute('normal', new THREE.BufferAttribute(normals, 3));
    geo.computeBoundingSphere();
    var mesh = new THREE.Mesh(geo, materials[key]); mesh.name = 'landmark-' + ep.id + '-' + key;
    site.root.add(mesh);
  });
}
function reset() {
  stage = null; previousRail = null;
  sites.forEach(function (site) { site.root.visible = false; });
}
P.landmarks = {
  update: function () {
    if (!P.Game || !P.world || !P.world.EPISODES) return;
    var game = P.Game, ep = P.world.EPISODES[game.epIndex];
    if (!ep) return;
    if (previousRail !== null && game.railZ < previousRail - 10) stage = null;
    previousRail = game.railZ;
    if (stage !== ep.id || stageStart !== game.epStartZ) {
      stage = ep.id; stageStart = game.epStartZ;
      materials.forEach(function (m) { m.dispose(); }); materials.length = 0;
      (palettes[stage] || palettes.ep3).forEach(function (color, i) {
        materials.push(i === 3 ? new THREE.MeshBasicMaterial({ color: color, fog: true })
          : new THREE.MeshPhongMaterial({ color: color, flatShading: true, shininess: i === 1 ? 15 : 3, fog: true }));
      });
      var base = Math.floor((game.railZ - stageStart - 450) / spacing) * spacing + stageStart + 450 - spacing;
      for (var i = 0; i < capacity; i++) {
        if (!sites[i]) { var root = new THREE.Group(); root.name = 'route-landmark-' + i; P.scene.add(root); sites.push({ root: root, z: 0 }); }
        build(sites[i], base + i * spacing, ep); sites[i].root.visible = true;
      }
    }
    sites.forEach(function (site) {
      if (game.railZ - site.z > 1250) {
        var jumps = Math.ceil((game.railZ - site.z - 1250) / (spacing * capacity));
        build(site, site.z + jumps * spacing * capacity, ep);
      }
    });
  },
  reset: reset,
  stats: function () { return { capacity: capacity, sites: sites.length,
    meshes: sites.reduce(function (sum, site) { return sum + site.root.children.length; }, 0) }; }
};
})();
