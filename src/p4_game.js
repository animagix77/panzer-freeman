/* =========================================================================
   Part 4 — entities: player rig, projectiles, particles, enemies, boss
   ========================================================================= */
(function () {
var P = window.__PF;
var V3 = P.V3, M = P.M, G = P.G, rand = P.rand, randi = P.randi, clamp = P.clamp,
    lerp = P.lerp, damp = P.damp, TAU = P.TAU, pick = P.pick;
var scene = P.scene, camera = P.camera, mdl = P.models, A = P.Audio_;

var Game = {
  state: 'title',
  time: 0, railZ: 0, epIndex: 0, epStartZ: 0, epProgress: 0,
  age: 89, startAge: 89, score: 0, kills: 0, shots: 0, hits: 0,
  bestCombo: 0, combo: 0, comboT: 0,
  hurtT: 0, invulnT: 0, shakeT: 0, shakeMag: 0,
  ending: false, bossActive: false, orbsTaken: 0, cinematic: false
};
P.Game = Game;

// ------------------------------------------------------------------- player
var Player = {
  x: 0, y: 0, zOff: 0,       // y is offset from rail height
  vx: 0, vy: 0, vz: 0,
  pos: new V3(),
  camYaw: 0, viewIndex: 0, camYawTarget: 0,
  aimX: 0, aimY: 0,
  gunT: 0, laserT: 0,
  railY: 24, invertY: true, gunCD: 0.085, gunDmg: 1
};
P.Player = Player;

var dragon = mdl.buildDragon();
scene.add(dragon.root);
P.dragon = dragon;
dragon.onBeat = function (power, effort) {
  if (Game.state === 'title') return;
  if (effort > 0.2) A.sWing(clamp(power * 0.75, 0.2, 1.5));
};

// --------------------------------------------------------------- input state
var Input = {
  keys: {}, mx: 0, my: 0, ndx: 0, ndy: 0,
  lmb: false, rmb: false, painted: 0
};
P.Input = Input;

// --------------------------------------------------------------- projectiles
function Pool(make, n) {
  this.free = []; this.make = make;
  for (var i = 0; i < n; i++) { var o = make(); o.visible = false; scene.add(o); this.free.push(o); }
}
Pool.prototype.get = function () {
  var o = this.free.pop();
  if (!o) { o = this.make(); scene.add(o); this.grown++; }
  o.visible = true; return o;
};
Pool.prototype.put = function (o) { o.visible = false; this.free.push(o); };
Pool.prototype.grown = 0;
Pool.prototype.name = '?';

// The same exponential factor damp() uses, for the places that need to smooth
// something damp() can't take — an angle through angDelta, or a Vector3.lerp.
// `min(1, dt * k)` was doing this job and made the rate framerate-dependent.
function dampF(l, dt) { return 1 - Math.exp(-l * dt); }

// ---- swept collision -----------------------------------------------------
// Squared distance from point c to the segment a→b. Allocation-free: this runs
// bullets × enemies times per frame.
var _segA = new V3();
function segPointD2(a, b, c) {
  var abx = b.x - a.x, aby = b.y - a.y, abz = b.z - a.z;
  var acx = c.x - a.x, acy = c.y - a.y, acz = c.z - a.z;
  var ab2 = abx * abx + aby * aby + abz * abz;
  var t = ab2 > 1e-9 ? (acx * abx + acy * aby + acz * abz) / ab2 : 0;
  t = t < 0 ? 0 : (t > 1 ? 1 : t);
  var dx = acx - abx * t, dy = acy - aby * t, dz = acz - abz * t;
  return dx * dx + dy * dy + dz * dz;
}
P.segPointD2 = segPointD2;

// --- Panzer-Dragoon homing laser: a hot head dragging a curved ribbon -----
// Nothing mutates a projectile's material — colour and blending are fixed per
// pool — so one material each is enough. It also means a pool that has to grow
// mid-fight allocates geometry only, not a shader compile.
var MAT_LASER_HEAD = new THREE.MeshBasicMaterial({
  color: 0xffffff, blending: THREE.AdditiveBlending, transparent: true, depthWrite: false, fog: false });
var MAT_LASER_HALO = new THREE.MeshBasicMaterial({
  color: 0x3fb8ff, blending: THREE.AdditiveBlending, transparent: true, opacity: 0.4,
  depthWrite: false, fog: false });
var MAT_GUN = new THREE.MeshBasicMaterial({
  color: 0xfff2b0, blending: THREE.AdditiveBlending, transparent: true, depthWrite: false, fog: false });
var MAT_RIBBON = new THREE.MeshBasicMaterial({
  vertexColors: true, blending: THREE.AdditiveBlending, transparent: true,
  depthWrite: false, side: THREE.DoubleSide, fog: false });
var GEO_LASER_HEAD = new THREE.OctahedronGeometry(0.34, 0);
var GEO_LASER_HALO = new THREE.OctahedronGeometry(0.55, 0);

var laserPool = new Pool(function () {
  var g = new THREE.Group();
  var head = new THREE.Mesh(GEO_LASER_HEAD, MAT_LASER_HEAD);
  head.scale.set(0.5, 0.5, 1.5); g.add(head);
  var halo = new THREE.Mesh(GEO_LASER_HALO, MAT_LASER_HALO);
  halo.scale.set(1, 1, 1.9); g.add(halo);
  return g;
}, 32);

// ---- ribbon trails -------------------------------------------------------
var RIB_N = 18;
var ribbonPool = new Pool(function () {
  var g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(RIB_N * 2 * 3), 3));
  g.setAttribute('color', new THREE.BufferAttribute(new Float32Array(RIB_N * 2 * 3), 3));
  var idx = [];
  for (var i = 0; i < RIB_N - 1; i++) {
    var a = i * 2;
    idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
  }
  g.setIndex(idx);
  g.setDrawRange(0, 0);
  var mm = new THREE.Mesh(g, MAT_RIBBON);
  mm.frustumCulled = false;
  mm.userData.pts = [];
  for (var k = 0; k < RIB_N; k++) mm.userData.pts.push(new V3());
  mm.userData.n = 0;
  return mm;
}, 200);   // one per live bullet + laser + fading tail, measured at peak combat

function ribbonReset(rib, x, y, z) {
  rib.userData.n = 1;
  rib.userData.pts[0].set(x, y, z);
  rib.geometry.setDrawRange(0, 0);
}
// anchors are laid down by distance travelled, so the streak is the same
// length whether the game is running at 30fps or 144
var _rTmp = new V3();
function ribbonAdvance(rib, x, y, z, step) {
  var ud = rib.userData, pts = ud.pts;
  if (ud.n === 0) { pts[0].set(x, y, z); ud.n = 1; return; }
  var anchor = ud.n > 1 ? pts[1] : pts[0];
  _rTmp.set(x, y, z);
  if (anchor.distanceToSquared(_rTmp) > step * step) {
    for (var i = RIB_N - 1; i > 1; i--) pts[i].copy(pts[i - 1]);
    if (ud.n < RIB_N) ud.n++;
    pts[1].copy(pts[0]);
  }
  pts[0].set(x, y, z);
}
var _rDir = new V3(), _rCam = new V3(), _rSide = new V3(), _rColA = new THREE.Color(), _rColB = new THREE.Color();
function ribbonBuild(rib, width, headCol, tailCol, gain) {
  var pts = rib.userData.pts, n = rib.userData.n;
  var geo = rib.geometry;
  if (n < 2) { geo.setDrawRange(0, 0); return; }
  var pa = geo.attributes.position.array, ca = geo.attributes.color.array;
  _rColA.setHex(headCol); _rColB.setHex(tailCol);
  for (var i = 0; i < n; i++) {
    var p = pts[i];
    var nx = pts[Math.min(i + 1, n - 1)], pv = pts[Math.max(i - 1, 0)];
    _rDir.subVectors(nx, pv);
    if (_rDir.lengthSq() < 1e-9) _rDir.set(0, 0, 1);
    _rCam.subVectors(camera.position, p);
    var dCam = _rCam.length();
    _rSide.crossVectors(_rDir, _rCam);
    if (_rSide.lengthSq() < 1e-9) _rSide.set(1, 0, 0);
    _rSide.normalize();
    var f = i / (n - 1);
    // keep the streak a near-constant width on screen rather than in world units
    var w = width * clamp(dCam / 110, 0.3, 2.6) * Math.pow(1 - f, 0.6);
    var o = i * 6;
    pa[o]     = p.x + _rSide.x * w; pa[o + 1] = p.y + _rSide.y * w; pa[o + 2] = p.z + _rSide.z * w;
    pa[o + 3] = p.x - _rSide.x * w; pa[o + 4] = p.y - _rSide.y * w; pa[o + 5] = p.z - _rSide.z * w;
    var k = (1 - f) * (1 - f) * gain;
    var cr = lerp(_rColA.r, _rColB.r, f) * k;
    var cg = lerp(_rColA.g, _rColB.g, f) * k;
    var cb = lerp(_rColA.b, _rColB.b, f) * k;
    ca[o] = ca[o + 3] = cr; ca[o + 1] = ca[o + 4] = cg; ca[o + 2] = ca[o + 5] = cb;
  }
  geo.attributes.position.needsUpdate = true;
  geo.attributes.color.needsUpdate = true;
  geo.setDrawRange(0, (n - 1) * 6);
}

// trails that outlive their projectile and fade in place
var fadingTrails = [];
function releaseTrail(rib, width, headCol, tailCol) {
  if (!rib) return;
  fadingTrails.push({ m: rib, life: 0.22, max: 0.22, w: width, c0: headCol, c1: tailCol });
}

// ---- impact flash: hot core, radiating spikes, expanding ring -----------
// The materials have to be per-instance — spawnImpact() tints mArm and the
// update fades mCore — but the eight meshes in each flash were also building
// eight fresh geometries, sixteen times over. They are identical; share them.
var GEO_IMPACT_CORE = new THREE.IcosahedronGeometry(1, 0);
var GEO_IMPACT_SPIKE = new THREE.ConeGeometry(0.44, 3.0, 4);
var GEO_IMPACT_RING = new THREE.TorusGeometry(1, 0.14, 3, 16);
var impactPool = new Pool(function () {
  var g = new THREE.Group();
  var mCore = new THREE.MeshBasicMaterial({ color: 0xffffff, blending: THREE.AdditiveBlending,
    transparent: true, depthWrite: false, fog: false });
  var mArm = new THREE.MeshBasicMaterial({ color: 0x7fe8ff, blending: THREE.AdditiveBlending,
    transparent: true, depthWrite: false, fog: false, side: THREE.DoubleSide });
  var core = new THREE.Mesh(GEO_IMPACT_CORE, mCore); g.add(core);
  var spikes = new THREE.Group();
  var axes = [[1,0,0],[-1,0,0],[0,1,0],[0,-1,0],[0,0,1],[0,0,-1]];
  for (var i = 0; i < axes.length; i++) {
    var sp = new THREE.Mesh(GEO_IMPACT_SPIKE, mArm);
    var a = axes[i];
    sp.position.set(a[0] * 1.6, a[1] * 1.6, a[2] * 1.6);
    sp.lookAt(a[0] * 8, a[1] * 8, a[2] * 8);
    sp.rotateX(Math.PI * 0.5);
    spikes.add(sp);
  }
  g.add(spikes);
  var ring = new THREE.Mesh(GEO_IMPACT_RING, mArm); g.add(ring);
  g.userData = { mCore: mCore, mArm: mArm, core: core, spikes: spikes, ring: ring };
  return g;
}, 24);
var impacts = [];
function spawnImpact(pos, armColor, size) {
  if (P.fx) P.fx.burst(pos, size || 1, armColor || 0x7fe8ff, true);
  var g = impactPool.get();
  g.position.copy(pos);
  g.rotation.set(rand(0, TAU), rand(0, TAU), rand(0, TAU));
  g.userData.mArm.color.setHex(armColor || 0x7fe8ff);
  impacts.push({ g: g, life: 0.30, max: 0.30, size: size || 1 });
}

var gunPool = new Pool(function () {
  var m2 = new THREE.Mesh(GEO_LASER_HEAD, MAT_GUN);
  m2.scale.set(0.5, 0.5, 2.2);
  return m2;
}, 64);

// mdl.tet/oct/tor mint a fresh geometry per call — right for the model builders,
// which then translate and merge them, but wasteful for a pool of 220 identical
// shards. These four are never mutated after construction, so one each will do.
var GEO_EB_CORE = mdl.oct(0.42), GEO_EB_HALO = mdl.oct(0.85);
var GEO_SHARD = mdl.tet(0.55);
var ebPool = new Pool(function () {
  var g = new THREE.Group();
  g.add(mdl.mesh(GEO_EB_CORE, G(0xffd0a0)));
  var h = mdl.mesh(GEO_EB_HALO, G(0xff4a2a, { transparent: true, opacity: 0.45, depthWrite: false }));
  g.add(h);
  return g;
}, 90);

var shardPool = new Pool(function () { return mdl.mesh(GEO_SHARD, G(0xffffff)); }, 220);

var lasers = [], bullets = [], ebullets = [], shards = [], orbs = [], rings = [];

var SHARD_MATS = {
  hot:   G(0xffd25e), fire: G(0xff7a2a), smoke: G(0x5a4a5a),
  cyan:  G(0x8ffff0), violet: G(0xb98cff), white: G(0xfff6dd)
};

function boom(pos, size, colorSet, count) {
  if (P.fx && size >= 1) P.fx.burst(pos, size, 0xff944c, false);
  var n = count || Math.round(10 + size * 5);
  for (var i = 0; i < n; i++) {
    if (shards.length > 200) break;
    var s = shardPool.get();
    s.position.copy(pos);
    s.material = colorSet[i % colorSet.length];
    s.scale.setScalar(rand(0.4, 1.5) * size * 0.5);
    shards.push({
      m: s,
      v: new V3(rand(-1, 1), rand(-1, 1), rand(-1, 1)).normalize().multiplyScalar(rand(6, 26) * (0.5 + size * 0.2)),
      spin: new V3(rand(-9, 9), rand(-9, 9), rand(-9, 9)),
      life: rand(0.5, 1.25), maxLife: 1
    });
    shards[shards.length - 1].maxLife = shards[shards.length - 1].life;
  }
  // shockwave ring
  var r = ringPool.get();
  r.position.copy(pos);
  r.scale.setScalar(0.2);
  r.material = colorSet[0];
  rings.push({ m: r, life: 0.42, max: 0.42, size: size });
}

var GEO_RING = mdl.tor(1, 0.1, 3, 14);
var ringPool = new Pool(function () {
  var r = mdl.mesh(GEO_RING, G(0xffffff, { transparent: true, opacity: 0.7, depthWrite: false }));
  return r;
}, 48);   // a multi-kill can boom a dozen enemies in the same frame

// ------------------------------------------------------------------ enemies
var enemies = [];
var enemyPools = {}, enemyBuilds = 0;   // enemyBuilds is a prewarm-coverage counter
// Only solid things cast. Additive sprites — trails, flames, impact flashes —
// would punch black holes in the shadow map, so they are left out on purpose.
function castAll(root) {
  root.traverse(function (o) {
    if (!o.isMesh) return;
    var m = o.material;
    if (m && (m.transparent || m.blending === THREE.AdditiveBlending)) return;
    o.castShadow = true;
  });
}
P.castAll = castAll;
function getEnemyMesh(type) {
  if (!enemyPools[type]) enemyPools[type] = [];
  var p = enemyPools[type];
  if (p.length) { var o = p.pop(); o.visible = true; return o; }
  var g = mdl.ENEMY_DEFS[type].build();
  enemyBuilds++;
  castAll(g);
  scene.add(g);
  return g;
}
function freeEnemyMesh(type, g) { g.visible = false; enemyPools[type].push(g); }
// Enemy meshes used to be built the first time each type appeared — mid-flight,
// at full speed, with the GPU already busy. maxAlive is 16, so one wave of a
// fresh type could build a dozen rigs inside a single frame. Build them at boot.
var PREWARM = { wasp: 10, ray: 8, turret: 5, chaser: 8, carrier: 4, mine: 7 };
function prewarmEnemies() {
  for (var type in PREWARM) {
    if (!mdl.ENEMY_DEFS[type]) continue;
    var made = [], i;
    for (i = 0; i < PREWARM[type]; i++) made.push(getEnemyMesh(type));
    for (i = 0; i < made.length; i++) freeEnemyMesh(type, made[i]);
  }
}

function spawnEnemy(type, opts) {
  opts = opts || {};
  var def = mdl.ENEMY_DEFS[type];
  var g = getEnemyMesh(type);
  var bs = def.scale || 1;
  var e = {
    type: type, def: def, g: g, hp: def.hp * (opts.hpMul || 1), bs: bs,
    pos: new V3(), vel: new V3(), t: 0, fireT: rand(0.6, 2.0),
    alive: true, locked: 0, phase: rand(0, TAU), hold: rand(26, 64),
    lane: rand(-1, 1), amp: rand(6, 18), flashT: 0, tag: opts.tag || null,
    openingOffset: opts.openingOffset || null,
    formation: opts.formation || null, holdFor: opts.holdFor || 0,
    deAge: opts.deAge === undefined ? def.deAge : opts.deAge
  };
  var pz = Game.railZ, ry = Player.railY;

  if (type === 'turret') {
    var tx = (Math.random() < 0.5 ? -1 : 1) * rand(16, 70);
    var tz = pz + rand(300, 420);
    var th = P.terrain.heightAt(tx, tz);
    e.pos.set(tx, th, tz);
  } else if (type === 'chaser') {
    e.pos.set(rand(-30, 30), ry + rand(-10, 14), pz - rand(120, 200));
  } else if (type === 'ray') {
    var side = Math.random() < 0.5 ? -1 : 1;
    e.pos.set(side * rand(70, 130), ry + rand(-14, 22), pz + rand(240, 360));
    e.vel.set(-side * rand(16, 26), 0, 0);
    e.side = side;
  } else if (type === 'mine') {
    e.pos.set(rand(-26, 26), ry + rand(-14, 16), pz + rand(280, 400));
  } else if (type === 'carrier') {
    e.pos.set(rand(-40, 40), ry + rand(10, 34), pz + rand(300, 400));
  } else { // wasp
    var a = rand(0, TAU);
    e.pos.set(Math.cos(a) * rand(14, 46), ry + Math.sin(a) * rand(8, 26), pz + rand(260, 380));
  }
  if (opts.pos) e.pos.copy(opts.pos);
  g.position.copy(e.pos);
  g.scale.setScalar(bs);
  e.bs = bs;
  enemies.push(e);
  return e;
}

function enemyCols(e) {
  return e.type === 'carrier' ? [SHARD_MATS.hot, SHARD_MATS.white, SHARD_MATS.fire]
       : e.type === 'ray' ? [SHARD_MATS.cyan, SHARD_MATS.white, SHARD_MATS.smoke]
       : [SHARD_MATS.fire, SHARD_MATS.hot, SHARD_MATS.smoke];
}
function killEnemy(e, byPlayer) {
  if (!e.alive) return;
  e.alive = false;
  var flying = e.type === 'wasp' || e.type === 'ray' || e.type === 'chaser';
  if (flying) {
    // a machine shot out of the sky falls out of the sky: spin, drop, then
    // burst. Scoring lands NOW; the corpse is scenery.
    e.dying = 0.55 + Math.random() * 0.3;
    e.spinA = rand(7, 12) * (Math.random() < 0.5 ? -1 : 1);
    e.fallV = rand(2, 7);
    spawnImpact(e.pos, 0xffa050, 1.3);
    A.sBoom(false, e.pos);
  } else {
    boom(e.pos, e.def.radius * 1.4, enemyCols(e));
    A.sBoom(e.def.radius > 2.3, e.pos);
  }
  if (byPlayer) {
    Game.kills++;
    Game.combo++;
    Game.comboT = 2.6;
    // heat: every kill stokes it, only taking a hit quenches it (no timer
    // decay — the chain timer is strict, heat is the reward that lingers)
    Game.heat = Math.min(1, (Game.heat || 0) + 1 / 12);
    refreshWeapons();
    if (Game.combo > Game.bestCombo) Game.bestCombo = Game.combo;
    var mult = 1 + Math.min(Game.combo, 20) * 0.06;
    Game.score += Math.round(e.def.score * mult);
    deAge(e.deAge * (e.tag === 'opening-target' ? 1 : 2 + Math.min(Game.combo, 15) * 0.06));
    if (P.opening) P.opening.onKill(e);
    if (P.campaign) P.campaign.onKill(e);
    killQuip();
  }
  if (e.def.drops) for (var i = 0; i < e.def.drops; i++) spawnOrb(e.pos, true);
  else if (e.tag !== 'opening-target' && Math.random() < 0.055) spawnOrb(e.pos, false);
  dropLocks(e);
  if (!e.dying) {
    freeEnemyMesh(e.type, e.g);
    var idx = enemies.indexOf(e); if (idx >= 0) enemies.splice(idx, 1);
  }
}

function hurtEnemy(e, dmg) {
  // Carriers expose their cooling core to lateral or elevated attacks.
  if (e.type === 'carrier' && (Math.abs(Player.x - e.pos.x) > 26 || Player.pos.y - e.pos.y > 18)) dmg *= 2;
  e.hp -= dmg;
  e.flashT = 0.09;
  if (e.hp <= 0) killEnemy(e, true);
}

// --------------------------------------------------------------------- orbs
var orbPool = [];
function spawnOrb(pos, guaranteed) {
  var g = orbPool.pop();
  if (!g) { g = mdl.buildOrb(); scene.add(g); }
  g.visible = true;
  g.position.copy(pos);
  orbs.push({ g: g, pos: g.position, v: new V3(rand(-4, 4), rand(2, 7), rand(-2, 2)), t: rand(0, 6), life: 12 });
}

// -------------------------------------------------------------------- locks
var Locks = { list: [], max: 8, cd: 0 };

// ------------------------------------------------------------ vigour tiers
// Every year he sheds makes him faster and deadlier — the upgrade curve IS the
// de-aging, so there are no pickups to balance and no new UI to explain. 89 is
// the start, 24 the floor.
var VIGOUR_TIERS = [
  { age: 100, locks: 8,  gunCD: 0.085, dmg: 1, name: '' },
  { age: 78,  locks: 10, gunCD: 0.074, dmg: 1, name: 'STEADIER HANDS',
    line: 'Something in his shoulder let go. He fired again to be sure.' },
  { age: 64,  locks: 12, gunCD: 0.063, dmg: 2, name: 'THE OLD RHYTHM',
    line: 'Sixty-four. He had forgotten the gun could do that.' },
  { age: 50,  locks: 14, gunCD: 0.054, dmg: 2, name: 'SECOND WIND',
    line: 'Fifty. He stopped bracing for the recoil, and it stopped coming.' },
  { age: 36,  locks: 16, gunCD: 0.046, dmg: 3, name: 'PRIME',
    line: 'Thirty-six, and the sky had begun to feel small.' }
];
var vigour = VIGOUR_TIERS[0], vigourIdx = 0;
// Locks.max = the age-tier baseline plus up to +6 from heat, so a hot streak
// visibly widens the volley and a hit visibly narrows it again.
function refreshWeapons() {
  Locks.max = vigour.locks + Math.floor((Game.heat || 0) * 6);
}
P.refreshWeapons = refreshWeapons;
function applyVigour() {
  var idx = 0;
  for (var i = 0; i < VIGOUR_TIERS.length; i++) if (Game.age <= VIGOUR_TIERS[i].age) idx = i;
  var t = VIGOUR_TIERS[idx];
  vigour = t;
  refreshWeapons();
  Player.gunCD = t.gunCD;
  Player.gunDmg = t.dmg;
  if (idx > vigourIdx) {                        // only announce on the way down
    P.flashScreen(0.3, '#9fe8ff');
    if (t.name) sayQuip(t.name + '\n' + t.line, true);
    A.sLock();
  }
  vigourIdx = idx;
}
P.getVigour = function () { return { tier: vigourIdx, name: vigour.name, locks: Locks.max }; };
P.applyVigour = applyVigour;      // exported so the harnesses can drive tiers directly
// A fresh flight has to start cold. vigourIdx and vigour are module-local, so
// resetGame() could not clear them — "Fly Again" kept PRIME's 0.046 s cooldown
// and 22 locks until the first kill quietly demoted it back to tier 0.
P.resetWeapons = function () {
  Game.heat = 0;
  vigourIdx = 0;
  vigour = VIGOUR_TIERS[0];
  Player.gunCD = vigour.gunCD;
  Player.gunDmg = vigour.dmg;
  Locks.list.length = 0;
  Locks.cd = 0;
  refreshWeapons();
};
function dropLocks(t) {
  for (var i = Locks.list.length - 1; i >= 0; i--) if (Locks.list[i] === t) Locks.list.splice(i, 1);
}
P.Locks = Locks;

// ------------------------------------------------------------------ age/dmg
function deAge(y) {
  Game.age = clamp(Game.age - y, 24, 100);
  dragon.setAge(Game.age);
  applyVigour();
}
function addAge(y) {
  Game.age = clamp(Game.age + y, 24, 100);
  dragon.setAge(Game.age);
  applyVigour();
}
function damagePlayer(amount, hard) {
  if ((Player.rollT > 0.14 && Player.rollT < 0.58) || Game.invulnT > 0 || Game.state !== 'playing' || Game.ending) return;
  addAge(amount);
  Game.invulnT = hard ? 1.5 : 1.15;
  Game.hurtT = 0.55;
  Game.shakeT = 0.5; Game.shakeMag = hard ? 2.4 : 1.4;
  Game.combo = 0;
  if ((Game.heat || 0) > 0.4) sayQuip('The rhythm broke. It had been a good rhythm.', true);
  Game.heat = 0;
  refreshWeapons();
  A.sHit();
  flashScreen(0.18, '#ff3b2a');
  if (P.opening) P.opening.onHit();
  if (Math.random() < 0.5) sayQuip(pick([
    'That one cost him. They always cost him.',
    'He felt every year of it arrive at once.',
    'The sky, it seemed, wanted its time back.',
    'Something in his back reminded him of its opinion.'
  ]), true);
  if (Game.age >= 100) endGame(false);
}
P.damagePlayer = damagePlayer;
P.deAge = deAge;

var flashEl = P.el.flash;
var flashV = 0, flashCol = '#fff';
function flashScreen(v, col) { flashV = Math.max(flashV, v); flashCol = col || '#fff'; }
P.flashScreen = flashScreen;

// ------------------------------------------------------------------ firing
function fireGun() {
  if (Player.gunT > 0) return;
  Player.gunT = Player.gunCD || 0.085;
  Game.shots++;
  var b = gunPool.get();
  var origin = getMuzzle();
  b.position.copy(origin);
  var dir = getAimDir(origin);
  b.lookAt(origin.clone().add(dir));
  var grib = ribbonPool.get();
  ribbonReset(grib, origin.x, origin.y, origin.z);
  bullets.push({ m: b, rib: grib, v: dir.clone().multiplyScalar(230), life: 2.2, dmg: Player.gunDmg || 1 });
  dragon.muzzleT = 0.06;
  A.sGun();
}

var _fUp = new V3(0, 1, 0), _fSide = new V3(), _fUp2 = new V3(), _fTp = new V3();
function fireLasers() {
  if (!Locks.list.length) return;
  var origin = getMuzzle();
  var n = Locks.list.length;
  for (var i = 0; i < n; i++) {
    var tgt = Locks.list[i];
    var l = laserPool.get();
    if (P.fx) P.fx.attachLaser(l);
    l.visible = i === 0; // queued bolts must not stack their glows on the rider
    l.position.copy(origin);
    if (tgt.def) _fTp.copy(tgt.pos); else tgt.group.getWorldPosition(_fTp);
    var d = new V3().subVectors(_fTp, origin).normalize();
    // the volley splays wide on launch; the homing curls each bolt back in
    _fSide.crossVectors(d, _fUp);
    if (_fSide.lengthSq() < 1e-6) _fSide.set(1, 0, 0);
    _fSide.normalize();
    _fUp2.crossVectors(_fSide, d).normalize();
    var fan = (n === 1 ? rand(-0.4, 0.4) : (i / (n - 1) - 0.5) * 1.7);
    var launch = d.clone()
      .addScaledVector(_fSide, fan + rand(-0.1, 0.1))
      .addScaledVector(_fUp2, rand(0.5, 1.0))
      .normalize();
    var rib = ribbonPool.get();
    ribbonReset(rib, origin.x, origin.y, origin.z);
    lasers.push({
      m: l, rib: rib, v: launch.multiplyScalar(60),
      target: tgt, life: 3.0, dmg: 1, delay: i * 0.07, age: 0
    });
    Game.shots++;
  }
  dragon.muzzleT = 0.18;
  A.sLaser();
  if (P.fx) P.fx.burst(origin, 0.8, 0x69dfff, true);
  Locks.list.length = 0;
}

function getMuzzle() {
  var v = new V3();
  dragon.gun.getWorldPosition(v);
  return v;
}
var _aimNdc = new THREE.Vector3();
function getAimDir(origin) {
  _aimNdc.set(Input.ndx, Input.ndy, 0.5).unproject(camera);
  return _aimNdc.sub(origin).normalize();
}
function getAimPoint(dist) {
  var v = new V3(Input.ndx, Input.ndy, 0.5).unproject(camera);
  v.sub(camera.position).normalize().multiplyScalar(dist || 260).add(camera.position);
  return v;
}
P.getAimPoint = getAimPoint;

// ----------------------------------------------------------------- the boss
var Boss = {
  built: null, group: null, active: false, angle: 0, angleTarget: 0,
  dist: 128, height: 14, phase: 0, t: 0,
  atkT: 2.5, dead: false, deathT: 0, entering: 0
};
P.Boss = Boss;

function bossStart() {
  if (!Boss.built) {
    Boss.built = mdl.buildBoss();
    Boss.group = Boss.built.group;
    scene.add(Boss.group);
  }
  Boss.group.visible = true;
  Boss.active = true; Boss.dead = false; Boss.phase = 0; Boss.t = 0;
  Boss.angle = 0; Boss.angleTarget = 0; Boss.atkT = 3.4; Boss.entering = 3.2;
  Boss.dist = 230;
  for (var i = 0; i < Boss.built.cores.length; i++) {
    var c = Boss.built.cores[i];
    c.hp = c.maxHp; c.alive = true;
    c.group.visible = true;
    c.core.material = G(0x6affd0, { transparent: true, opacity: 0.95 });
  }
  Game.bossActive = true;   // the HP bar sums the cores directly; Boss has no pool of its own
}

function bossCoreHit(c, dmg) {
  if (!c.alive) return;
  c.hp -= dmg;
  c.shield.scale.setScalar(1.35);
  if (c.hp <= 0) {
    c.alive = false;
    var wp = new V3(); c.group.getWorldPosition(wp);
    boom(wp, 5.5, [SHARD_MATS.cyan, SHARD_MATS.white, SHARD_MATS.hot], 34);
    A.sBoom(true);
    Game.score += 3000;
    deAge(3.0);
    sayQuip('One eye of the Sphinx, closed for good.', true);
    flashScreen(0.5, '#8ffff0');
    Game.shakeT = 0.7; Game.shakeMag = 2.6;
    c.group.visible = false;
    var alive = 0;
    for (var i = 0; i < Boss.built.cores.length; i++) if (Boss.built.cores[i].alive) alive++;
    Boss.phase = 3 - alive;
    if (alive === 0) bossDie();
    else { Boss.angleTarget = Boss.phase === 1 ? Math.PI * 0.5 : Math.PI; toast('CORE DESTROYED'); }
  }
}

function bossDie() {
  Boss.dead = true; Boss.deathT = 4.2; Game.ending = true;
  A.sBoom(true);
  toast('THE FOUNTAIN OPENS');
}

// ----------------------------------------------------------- boss attacks
function bossShoot(from, dir, speed, col) {
  var b = ebPool.get();
  b.position.copy(from);
  b.children[0].material = G(col || 0xffd0a0);
  ebullets.push({ m: b, v: dir.clone().normalize().multiplyScalar(speed), life: 6, dmg: 3.2 });
}
function bossRing(center, n, speed, tilt) {
  for (var i = 0; i < n; i++) {
    var a = i / n * TAU + tilt;
    bossShoot(center, new V3(Math.cos(a), Math.sin(a), 0.35), speed, 0xff8a5a);
  }
}
function bossAimed(from, spread, n, speed) {
  var base = new V3().subVectors(Player.pos, from).normalize();
  for (var i = 0; i < n; i++) {
    var off = (i - (n - 1) / 2) * spread;
    var d = base.clone().applyAxisAngle(new V3(0, 1, 0), off);
    d.applyAxisAngle(new V3(1, 0, 0), rand(-0.05, 0.05));
    bossShoot(from, d, speed, 0xffd0a0);
  }
}

function updateBoss(dt) {
  if (!Boss.active) return;
  var B = Boss, bt = B.built;
  B.t += dt;

  if (B.dead) {
    B.deathT -= dt;
    var wp = new V3(); B.group.getWorldPosition(wp);
    if (Math.random() < 0.55) {
      boom(wp.clone().add(new V3(rand(-14, 14), rand(-10, 10), rand(-10, 10))), rand(2, 6),
           [SHARD_MATS.fire, SHARD_MATS.hot, SHARD_MATS.white]);
      if (Math.random() < 0.4) A.sBoom(true);
    }
    B.group.rotation.z += dt * 1.4;
    B.group.scale.multiplyScalar(1 - dt * 0.13);
    Game.shakeT = 0.3; Game.shakeMag = 1.6;
    if (B.deathT <= 0) {
      B.active = false; B.group.visible = false; B.group.scale.setScalar(1);
      endGame(true);
    }
    return;
  }

  // ---- placement: orbit the player, forcing view rotation
  if (B.entering > 0) {
    B.entering -= dt;
    B.dist = damp(B.dist, 128, 1.1, dt);
  } else {
    // phase 2+: drift between angles
    // angleTarget is otherwise set on core destruction; from phase 2 it also
    // wanders on its own every 12 s so the fight never settles into one face.
    if (B.phase >= 2 && B.t % 12 < dt) B.angleTarget = pick([0, Math.PI * 0.5, Math.PI, -Math.PI * 0.5]);
  }
  B.angle += P.angDelta(B.angle, B.angleTarget) * dampF(0.9, dt);
  var dir = new V3(Math.sin(B.angle), 0, Math.cos(B.angle));
  var bp = Player.pos.clone().add(dir.multiplyScalar(B.dist));
  bp.y += B.height + Math.sin(B.t * 0.6) * 4;
  B.group.position.copy(bp);
  B.group.rotation.y = B.angle + Math.PI;
  B.group.rotation.z = Math.sin(B.t * 0.4) * 0.08;

  bt.rings[0].rotation.z += dt * 0.35;
  bt.rings[1].rotation.y += dt * 0.5;
  bt.rings[1].rotation.z -= dt * 0.2;
  bt.rings[2].rotation.z += dt * 0.7;
  bt.head.rotation.y = Math.sin(B.t * 0.7) * 0.16;
  bt.crown.rotation.y += dt * 1.2;

  // cores orbit
  for (var i = 0; i < bt.cores.length; i++) {
    var c = bt.cores[i];
    if (!c.alive) continue;
    var a = c.angle + B.t * (0.35 + B.phase * 0.22);
    c.group.position.set(Math.cos(a) * 11.5, Math.sin(a) * 11.5, 2.0);
    c.core.rotation.x += dt * 2; c.core.rotation.y += dt * 2.6;
    c.shield.rotation.z += dt * 1.6;
    c.shield.scale.setScalar(damp(c.shield.scale.x, 1, 6, dt));
    c.core.scale.setScalar(0.85 + Math.sin(B.t * 4 + i) * 0.1);
  }

  // ---- attacks
  if (B.entering > 0) return;
  B.atkT -= dt;
  if (B.atkT <= 0) {
    var speedUp = 1 + B.phase * 0.35;
    var head = new V3(); bt.head.getWorldPosition(head);
    var roll = Math.random();
    if (roll < 0.34) {
      bossRing(head, 10 + B.phase * 4, 46 * speedUp, B.t);
      B.atkT = 2.4 / speedUp;
      A.sWarn();
    } else if (roll < 0.68) {
      for (var j = 0; j < bt.cores.length; j++) {
        var cc = bt.cores[j];
        if (!cc.alive) continue;
        var wp2 = new V3(); cc.group.getWorldPosition(wp2);
        bossAimed(wp2, 0.13, 3, 62 * speedUp);
      }
      B.atkT = 1.9 / speedUp;
      A.sWarn();
    } else if (roll < 0.86) {
      // sweeping wall
      for (var k = -6; k <= 6; k++) {
        var o = head.clone(); o.x += k * 5;
        bossAimed(o, 0, 1, 52 * speedUp);
      }
      B.atkT = 3.0 / speedUp;
      A.sWarn();
    } else {
      for (var s = 0; s < 2 + B.phase; s++)
        spawnEnemy('mine', { pos: Player.pos.clone().add(new V3(rand(-30, 30), rand(-16, 20), rand(160, 250))) });
      B.atkT = 3.2 / speedUp;
    }
  }
}

// ------------------------------------------------------------- narrator barks
// In-character narration, in the register the old rider tells his own story in.
var QUIPS = [
  'Some drones are worth shooting. All of them, as it turns out.',
  'He had not fired a weapon in forty years. It came back quickly.',
  'That one had a family. A family of identical drones.',
  'There is a word for a man who shoots machines out of the sky at eighty-nine.\nThe word is "busy".',
  'He would remember this later. At a considerably lower age.',
  'The sky did not object.',
  'Somewhere, a warranty quietly voided itself.',
  'He aimed the way other men breathe.',
  'It is a curious thing, to be shot down by a pensioner.',
  'The dragon approved. The dragon rarely approves.',
  'He had been advised to slow down. He had declined.',
  'Another year, returned to sender.',
  'They built them to last. They did not build them to last this.',
  'Retirement, it turns out, is mostly a question of altitude.',
  'He did not gloat. He simply made a note of it.',
  'The empire\'s finest, undone by an old man with a hand cannon and a grudge.',
  'There are gentler ways to grow young. He had tried none of them.',
  'He was eighty-nine. He was also, briefly, magnificent.',
  'That is what happens when you stand between a man and his Fountain.',
  'The machine asked no questions. It received no answers.',
  'He had all the time in the world. That was rather the problem.',
  'A lifetime of patience, spent in well under a second.',
  'He counted that as one. It was, in fact, three.',
  'Nobody ever told him he was too old for this. Nobody dared.',
  'The desert kept score. The desert was impressed.',
  'He had done difficult things in his life. This was not one of them.',
  'Old hands. Steady hands. The very same hands.',
  'Time was running backward, and he intended to keep it that way.',
  'That drone had one job. It is now between positions.',
  'He felt something loosen in his shoulder. Probably a year.',
  'They should have sent more of them.',
  'No man chooses the morning he begins getting younger.',
  'Somewhere far below, the sand made a note of it.',
  'He had outlived better machines than that one.',
  'The trick, he had learned, is to stop apologising for still being here.',
  'His doctor had advised against strenuous activity.\nHis doctor had not been specific.',
  'At his age most men take up birdwatching.\nHe had simply taken a bird.',
  'He is not, strictly speaking, licensed for this airspace.',
  'His knees have opinions about the dive.\nHis knees are outvoted.',
  'Somewhere, an actuary is quietly revising a table.',
  'The dragon banked before he asked it to.\nThey have been doing this a while.',
  'He does not shout in combat. He finds it unnecessary,\nand the dragon finds it rude.',
  'He aimed for the middle. The middle is no longer available.',
  'They gave him a medal once. He has no idea where it is.\nHe knows exactly where it is.',
  'He had left the stove on. Some years ago now.\nHe has made his peace with it.',
  'A younger man would have missed.\nHe is, worryingly, becoming one.',
  'Two years came back at once. One of them was a good year.',
  'He had been young before. He remembered not caring for it.',
  'The manual advises against this manoeuvre.\nThere is no manual.',
  'He is not entirely certain the dragon is on his side.\nThe dragon is not saying.',
  'That is the sound a thousand years of engineering makes\non its way down.',
  'A machine built to count seconds has met a man\nwho intends to spend them.',
  'His hands are steadier now than they were at thirty.\nHe has stopped asking why.',
  'He would like it noted that he did not start this.\nHe would like it noted that he is finishing it.',
  'There was a queue for the Fountain once.\nHe has resolved the queue.'
];
var CHAIN_QUIPS = {
  5:  'Five in a row. He was not counting. He was absolutely counting.',
  9:  'Nine. The dragon had begun, frankly, to show off.',
  14: 'At this rate he would arrive at the Fountain as a teenager.',
  20: 'Twenty. Whatever the empire had feared, it had underestimated it.'
};
var quipT = 0, quipCD = 0, lastQuip = -1;
function sayQuip(txt, force) {
  if (Game.state !== 'playing' || Game.cinematic) return;
  if (!force && quipCD > 0) return;
  P.el.quip.textContent = txt;
  quipT = 3.6; quipCD = force ? 2.2 : 4.4;
}
function killQuip() {
  var c = CHAIN_QUIPS[Game.combo];
  if (c) { sayQuip(c, true); return; }
  if (Math.random() > 0.42) return;
  var i = Math.floor(Math.random() * QUIPS.length);
  if (i === lastQuip) i = (i + 1) % QUIPS.length;
  lastQuip = i;
  sayQuip(QUIPS[i]);
}
P.sayQuip = sayQuip;

// ------------------------------------------------------------------- toast
var toastT = 0;
function toast(txt) {
  P.el.toast.textContent = txt;
  toastT = 2.0;
}
P.toast = toast;

function endGame(won) {
  if (Game.state !== 'playing') return;
  Game.state = won ? 'win' : 'over';
  P.onEnd(won);
}
P.endGame = endGame;

// ================================================================== UPDATES
function updatePlayer(dt) {
  var ep = P.world.EPISODES[Game.epIndex];
  if (P.flight) P.flight.update(dt);
  var speed = ep.speed * (Player.speedFactor || 1);
  var corridor = ep.flightWidth || 72, ceiling = 58;
  // trading altitude for airspeed: a climb bleeds speed, a dive gains it
  var vyPrev = clamp(Player.vy / 44, -1, 1);
  var forwardSpeed = speed * (1 - vyPrev * 0.15);
  Game.railZ += forwardSpeed * dt;

  // ---- view rotation
  Player.camYaw += P.angDelta(Player.camYaw, Player.camYawTarget) * dampF(7.5, dt);

  // ---- steering (camera-relative in the XZ plane)
  var cine = Game.cinematic;
  var k = Input.keys;
  var ix = cine ? 0 : (k['d'] || k['arrowright'] ? 1 : 0) - (k['a'] || k['arrowleft'] ? 1 : 0);
  var iy = cine ? 0 : (k['w'] || k['arrowup'] ? 1 : 0) - (k['s'] || k['arrowdown'] ? 1 : 0);
  if (Player.invertY) iy = -iy;                  // flight-stick pitch
  var yaw = Player.camYaw;
  // the camera looks along +Z, so screen-right is world -X (not +X)
  var rx = -Math.cos(yaw), rz = Math.sin(yaw);
  if (Player.rollT > 0) ix = Player.rollDir;
  var accel = Player.rollT > 0 ? 185 : 128;
  // Ease into the edge of the flight corridor instead of sliding at full
  // speed into an invisible wall while the rig keeps showing a hard turn.
  function corridorSpeed(want, pos, lo, hi) {
    return clamp(want, -Math.max(0, pos - lo) * 4, Math.max(0, hi - pos) * 4);
  }
  Player.vx = damp(Player.vx, corridorSpeed(ix * rx * accel * 0.42, Player.x, -corridor, corridor), 7, dt);
  Player.vz = damp(Player.vz, corridorSpeed(ix * rz * accel * 0.42, Player.zOff, -26, 26), 7, dt);
  Player.vy = damp(Player.vy, corridorSpeed(iy * accel * 0.36, Player.y, -16, ceiling), 7, dt);
  var oldX = Player.x, oldY = Player.y, oldZ = Player.zOff;
  Player.x += Player.vx * dt;
  Player.zOff += Player.vz * dt;
  Player.y += Player.vy * dt;

  Player.x = clamp(Player.x, -corridor, corridor);
  Player.zOff = clamp(Player.zOff, -26, 26);
  Player.y = clamp(Player.y, -16, ceiling);
  if ((Player.x === -corridor && Player.vx < 0) || (Player.x === corridor && Player.vx > 0)) Player.vx = 0;
  if ((Player.zOff === -26 && Player.vz < 0) || (Player.zOff === 26 && Player.vz > 0)) Player.vz = 0;
  if ((Player.y === -16 && Player.vy < 0) || (Player.y === ceiling && Player.vy > 0)) Player.vy = 0;

  Player.railY = damp(Player.railY, ep.railY, 1.4, dt);
  Player.pos.set(Player.x, Player.railY + Player.y, Game.railZ + Player.zOff);

  // stay above the ground
  if (P.terrain.enabled) {
    var gh = P.terrain.heightAt(Player.x, Player.pos.z) + 6;
    if (Player.pos.y < gh) {
      Player.y += (gh - Player.pos.y);
      Player.vy = Math.max(Player.vy, 0);
      Player.pos.y = gh;
    }
  }

  // ---- aim influence for rider posing
  Player.aimX = damp(Player.aimX, cine ? 0 : Input.ndx, 10, dt);
  Player.aimY = damp(Player.aimY, cine ? 0 : Input.ndy, 10, dt);

  // ---- dragon transform
  // Pose from actual travel in the dragon's +Z frame, independent of the
  // viewing direction. Filter contact corrections before they reach the rig.
  var invDt = 1 / Math.max(dt, 1e-4);
  Player.motionX = damp(Player.motionX || 0, (Player.x - oldX) * invDt, 10, dt);
  Player.motionY = damp(Player.motionY || 0, (Player.y - oldY) * invDt, 8, dt);
  Player.motionZ = damp(Player.motionZ || 0, (Player.zOff - oldZ) * invDt, 10, dt);
  var screenStrafe = (Player.motionX * rx + Player.motionZ * rz) / (accel * 0.42);
  Player.lean = damp(Player.lean || 0, screenStrafe, 5, dt);
  dragon.root.position.copy(Player.pos);
  var heading = Math.atan2(Player.motionX, Math.max(20, forwardSpeed + Player.motionZ));
  dragon.root.rotation.y = damp(dragon.root.rotation.y, heading * 0.72, 6, dt);
  dragon.update(dt, Game.time, {
    strafeX: clamp(-Player.motionX / (accel * 0.42), -1, 1),
    strafeY: clamp(Player.motionY / 44, -1, 1),
    vy: Player.motionY,
    aimX: Player.aimX, aimY: Player.aimY, boost: Player.boosting ? 1 : 0
  });

  var rollProgress = Player.rollT > 0 ? 1 - Player.rollT / 0.65 : 0;
  dragon.root.rotation.z = Player.rollT > 0 ? -Player.rollDir * TAU * (rollProgress * rollProgress * (3 - 2 * rollProgress)) : 0;

  // blink while invulnerable
  if (Game.invulnT > 0) {
    Game.invulnT -= dt;
    dragon.root.visible = (Math.floor(Game.time * 22) % 2) === 0;
  } else dragon.root.visible = true;

  // ---- camera (skipped while a cinematic owns it)
  if (cine) { P.skyMesh.position.copy(camera.position); return; }
  // Natural turn feel = mostly POSITION, barely rotation. The camera trails
  // the strafe laterally (parallax you feel in your stomach) and yaws only a
  // few degrees into sustained turns, so quick dodges don't slosh the horizon.
  var lean = Player.lean;
  var camYawV = yaw + lean * 0.12;
  var fwd = new V3(Math.sin(camYawV), 0, Math.cos(camYawV));
  var camPos = Player.pos.clone().addScaledVector(fwd, -26);
  camPos.y += 6.2 + dragon.getBob() * 0.32;
  camPos.addScaledVector(fwd, dragon.getSurge() * 0.5);
  // lateral lag: the boom hangs behind the sideways motion
  var rX = -Math.cos(yaw), rZ = Math.sin(yaw);           // screen-right
  var latV = Player.motionX * rX + Player.motionZ * rZ;
  camPos.x += rX * -latV * 0.05;
  camPos.z += rZ * -latV * 0.05;
  camPos.x += Math.sin(Game.time * 0.7) * 0.25;
  if (Game.shakeT > 0) {
    Game.shakeT -= dt;
    var s = Game.shakeMag * (Game.shakeT / 0.5);
    camPos.x += rand(-s, s); camPos.y += rand(-s, s); camPos.z += rand(-s, s);
  }
  camera.position.copy(camPos);
  var lookYaw = yaw + lean * 0.19;       // look leads the turn slightly more than the boom
  var look = Player.pos.clone();
  look.x += Math.sin(lookYaw) * 34;
  look.z += Math.cos(lookYaw) * 34;
  look.y += 6.0 - Player.aimY * 4.0;
  look.x += Player.aimX * 4.4 * -Math.cos(camYawV);
  look.z += Player.aimX * 4.4 * Math.sin(camYawV);
  camera.lookAt(look);
  camera.rotateZ(-lean * 0.035);         // a whisper of roll, not a tilt-a-whirl
  // speed reads through the lens: diving widens the field, and each wingbeat
  // surge breathes it slightly
  var fovT = 56 + Math.max(0, -Player.vy / 44) * 7 + Math.abs(lean) * 1.5
           + Math.max(0, dragon.getSurge()) * 6 + (Player.boosting ? 10 : 0);
  camera.fov = damp(camera.fov, fovT, 4.5, dt);
  camera.updateProjectionMatrix();

  P.skyMesh.position.copy(camera.position);

  // ---- firing
  if (Player.gunT > 0) Player.gunT -= dt;
  if (Input.rmb) fireGun();
}

var _lz = new V3();
function updateProjectiles(dt) {
  var i, p;
  if (quipCD > 0) quipCD -= dt;
  // player lasers: launch wide, curl onto the target, drag a ribbon behind
  for (i = lasers.length - 1; i >= 0; i--) {
    p = lasers[i];
    if (p.delay > 0) {
      p.delay -= dt;
      var mz = getMuzzle();
      p.m.position.copy(mz);
      ribbonReset(p.rib, mz.x, mz.y, mz.z);
      if (p.delay <= 0) { p.m.visible = true; A.sLaser(); dragon.muzzleT = 0.07; }
      continue;
    }
    p.age += dt;
    var tp = null;
    if (p.target) {
      if (p.target.def) { if (p.target.alive) tp = p.target.pos; }
      else if (p.target.group && p.target.alive) { p.target.group.getWorldPosition(_lz); tp = _lz; }
    }
    var heat = Game.heat || 0;
    var spd = Math.min(215 + heat * 95, 60 + p.age * (200 + heat * 170));
    if (tp) {
      var k = (1.6 + p.age * 15) * (1 + heat * 0.9);   // homing tightens as it flies, hotter = harder
      P.tmpA.copy(tp).sub(p.m.position).normalize().multiplyScalar(spd);
      p.v.lerp(P.tmpA, dampF(k, dt));
    }
    p.v.setLength(spd);
    var previousLaserPos = p.m.position.clone();
    p.m.position.addScaledVector(p.v, dt);
    p.m.lookAt(P.tmpB.copy(p.m.position).add(p.v));
    ribbonAdvance(p.rib, p.m.position.x, p.m.position.y, p.m.position.z, 3.4);
    ribbonBuild(p.rib, 0.85, 0xffffff, 0x166dff, 1.25);
    p.life -= dt;
    var hit = false;
    if (tp && segPointD2(previousLaserPos, p.m.position, tp) < Math.pow(p.target.def ? p.target.def.radius + 1.6 : 7.0, 2)) {
      if (p.target.def) hurtEnemy(p.target, p.dmg);
      else bossCoreHit(p.target, 4.5);
      spawnImpact(p.m.position, 0x7fe8ff, 1.15);
      boom(p.m.position, 0.7, [SHARD_MATS.cyan, SHARD_MATS.white], 4);
      A.sZap(p.m.position);
      hit = true; Game.hits++;
    }
    if (hit || p.life <= 0) {
      releaseTrail(p.rib, 0.85, 0xffffff, 0x166dff);
      p.rib = null;
      laserPool.put(p.m); lasers.splice(i, 1);
    }
  }
  // trails that outlived their bolt
  for (i = fadingTrails.length - 1; i >= 0; i--) {
    var ft = fadingTrails[i];
    ft.life -= dt;
    var fg = Math.max(0, ft.life / ft.max);
    ribbonBuild(ft.m, ft.w * (0.45 + 0.55 * fg), ft.c0, ft.c1, fg * fg);
    if (ft.life <= 0) { ft.m.geometry.setDrawRange(0, 0); ribbonPool.put(ft.m); fadingTrails.splice(i, 1); }
  }
  // impact flashes
  for (i = impacts.length - 1; i >= 0; i--) {
    var im = impacts[i];
    im.life -= dt;
    var it = clamp(1 - im.life / im.max, 0, 1);
    var ud = im.g.userData, sz = im.size;
    ud.core.scale.setScalar(sz * (0.7 + it * 2.1));
    ud.mCore.opacity = Math.max(0, 1 - it * it * 1.15);
    ud.spikes.scale.setScalar(sz * (0.3 + it * 2.5));
    ud.mArm.opacity = Math.max(0, 1 - it * 1.05);
    ud.ring.scale.set(sz * (0.3 + it * 4.0), sz * (0.3 + it * 4.0), 1);
    ud.ring.lookAt(camera.position);
    im.g.rotation.z += dt * 3.2;
    if (im.life <= 0) { impactPool.put(im.g); impacts.splice(i, 1); }
  }
  // player gun bullets
  for (i = bullets.length - 1; i >= 0; i--) {
    p = bullets[i];
    // Remember where the bullet was: at 220 u/s a 30 fps frame steps it 7.3
    // units, wider than most hitboxes, so a point test at each end misses
    // cleanly through the target. Sweep the segment instead — hit rate stops
    // depending on the player's framerate, and ACCURACY stops lying.
    _segA.copy(p.m.position);
    p.m.position.addScaledVector(p.v, dt);
    ribbonAdvance(p.rib, p.m.position.x, p.m.position.y, p.m.position.z, 4.2);
    ribbonBuild(p.rib, 0.19, 0xffeeb4, 0xd8400f, 0.8);
    p.life -= dt;
    var gone = p.life <= 0;
    if (!gone) {
      for (var e = 0; e < enemies.length; e++) {
        var en = enemies[e];
        if (!en.alive) continue;
        var er = en.def.radius + 1.1;
        if (segPointD2(_segA, p.m.position, en.pos) < er * er) {
          hurtEnemy(en, p.dmg); Game.hits++;
          spawnImpact(p.m.position, 0xffc463, 0.62);
          gone = true; break;
        }
      }
    }
    if (!gone && Boss.active && !Boss.dead) {
      for (var c = 0; c < Boss.built.cores.length; c++) {
        var core = Boss.built.cores[c];
        if (!core.alive) continue;
        var wp = P.tmpC; core.group.getWorldPosition(wp);
        if (segPointD2(_segA, p.m.position, wp) < 49.0) {
          bossCoreHit(core, 1.1); Game.hits++;
          spawnImpact(p.m.position, 0xffc463, 0.62);
          gone = true; break;
        }
      }
    }
    if (gone) {
      releaseTrail(p.rib, 0.19, 0xffeeb4, 0xd8400f); p.rib = null;
      gunPool.put(p.m); bullets.splice(i, 1);
    }
  }
  // enemy bullets
  for (i = ebullets.length - 1; i >= 0; i--) {
    p = ebullets[i];
    _segA.copy(p.m.position);
    p.m.position.addScaledVector(p.v, dt);
    p.m.rotation.x += dt * 6; p.m.rotation.y += dt * 4;
    p.life -= dt;
    var dead = p.life <= 0;
    if (!dead && segPointD2(_segA, p.m.position, Player.pos) < 9.0) {
      damagePlayer(p.dmg || 2.6, false);
      boom(p.m.position, 0.8, [SHARD_MATS.fire, SHARD_MATS.hot], 6);
      dead = true;
    }
    if (dead) { ebPool.put(p.m); ebullets.splice(i, 1); }
  }
  // shards
  for (i = shards.length - 1; i >= 0; i--) {
    var s = shards[i];
    s.life -= dt;
    s.v.y -= 24 * dt;
    s.v.multiplyScalar(1 - dt * 0.9);
    s.m.position.addScaledVector(s.v, dt);
    s.m.rotation.x += s.spin.x * dt; s.m.rotation.y += s.spin.y * dt; s.m.rotation.z += s.spin.z * dt;
    var f = clamp(s.life / s.maxLife, 0, 1);
    s.m.scale.setScalar(Math.max(0.02, s.m.scale.x * (1 - dt * 0.8)));
    if (s.life <= 0) { shardPool.put(s.m); shards.splice(i, 1); }
  }
  // shockwave rings
  for (i = rings.length - 1; i >= 0; i--) {
    var r = rings[i];
    r.life -= dt;
    var t = 1 - r.life / r.max;
    r.m.scale.setScalar(0.4 + t * r.size * 3.2);
    r.m.lookAt(camera.position);
    if (r.life <= 0) { ringPool.put(r.m); rings.splice(i, 1); }
  }
  // orbs
  for (i = orbs.length - 1; i >= 0; i--) {
    var o = orbs[i];
    o.t += dt; o.life -= dt;
    o.v.y -= 5 * dt;
    o.v.multiplyScalar(1 - dt * 0.7);
    // gentle magnet
    var d = P.tmpA.copy(Player.pos).sub(o.pos);
    var dist = d.length();
    if (dist < 46) o.v.addScaledVector(d.normalize(), (1 - dist / 46) * 130 * dt);
    o.pos.addScaledVector(o.v, dt);
    o.g.rotation.y += dt * 2.2;
    o.g.userData.rings[0].rotation.z += dt * 3;
    o.g.userData.rings[1].rotation.x += dt * 2.4;
    o.g.scale.setScalar(1 + Math.sin(o.t * 6) * 0.09);
    if (dist < 4.2) {
      deAge(1.0); Game.score += 250; Game.orbsTaken++;
      A.sOrb(); flashScreen(0.28, '#8ffff0');
      sayQuip('A year, handed back to him without ceremony.', true);
      toast('CHRONO ORB  −1 YEAR');
      boom(o.pos, 1.4, [SHARD_MATS.cyan, SHARD_MATS.white], 10);
      o.g.visible = false; orbPool.push(o.g); orbs.splice(i, 1); continue;
    }
    if (o.life <= 0 || o.pos.z < Game.railZ - 90) {
      o.g.visible = false; orbPool.push(o.g); orbs.splice(i, 1);
    }
  }
}

function enemyShoot(e, speed, dmg, spread) {
  var b = ebPool.get();
  b.position.copy(e.pos);
  var d = P.tmpA.copy(Player.pos).sub(e.pos).normalize();
  d.x += rand(-spread, spread); d.y += rand(-spread, spread); d.z += rand(-spread, spread);
  d.normalize();
  var shot = { m: b, v: d.multiplyScalar(speed), life: 6, dmg: dmg };
  ebullets.push(shot);
  return shot;
}

function updateEnemies(dt) {
  var ry = Player.railY;
  for (var i = enemies.length - 1; i >= 0; i--) {
    var e = enemies[i];
    e.t += dt;
    var d = e.def;

    // ---- death spiral: no AI, just ballistics and spin ------------------
    if (e.dying !== undefined) {
      e.dying -= dt;
      e.fallV += 30 * dt;
      e.pos.y -= e.fallV * dt;
      e.pos.z -= 8 * dt;
      e.g.position.copy(e.pos);
      e.g.rotation.z += e.spinA * dt;
      e.g.rotation.x += e.spinA * 0.55 * dt;
      var gh = P.terrain.enabled ? P.terrain.heightAt(e.pos.x, e.pos.z) : -1e9;
      if (e.dying <= 0 || e.pos.y <= gh + 1) {
        boom(e.pos, e.def.radius * 1.5, enemyCols(e));
        A.sBoom(e.def.radius > 2.3, e.pos);
        freeEnemyMesh(e.type, e.g);
        enemies.splice(i, 1);
      }
      continue;
    }

    // Briefing targets hold a readable formation and never fire or collide.
    if (e.openingOffset) {
      e.pos.set(e.openingOffset.x, ry + e.openingOffset.y, Game.railZ + e.openingOffset.z);
      e.g.position.copy(e.pos);
      e.g.lookAt(Player.pos);
      continue;
    }

    var toP = P.tmpA.copy(Player.pos).sub(e.pos);
    var dist = toP.length();
    var prevX = e.pos.x;

    if (e.formation && e.t < e.holdFor) {
      e.pos.set(e.formation.x, ry + e.formation.y + Math.sin(e.t) * 2, Game.railZ + e.formation.z);
      e.g.lookAt(Player.pos);
    } else switch (e.type) {
      case 'wasp': {
        var want = P.tmpB.copy(Player.pos);
        want.x += Math.sin(e.t * 0.9 + e.phase) * e.amp;
        want.y += Math.cos(e.t * 0.7 + e.phase) * e.amp * 0.6 + 4;
        want.z += e.hold;
        var mv = want.sub(e.pos);
        var l = mv.length();
        if (l > 0.01) e.pos.addScaledVector(mv.normalize(), Math.min(l, d.speed * dt));
        e.g.lookAt(Player.pos);
        e.g.rotation.z = Math.sin(e.t * 2) * 0.3;
        break;
      }
      case 'ray': {
        e.pos.x += e.vel.x * dt;
        e.pos.z -= 6 * dt;
        e.pos.y += Math.sin(e.t * 1.4 + e.phase) * 9 * dt;
        e.g.lookAt(P.tmpB.copy(e.pos).add(P.tmpC.set(e.vel.x, 0, -6)));
        e.g.rotation.z = Math.sin(e.t * 1.2) * 0.35;
        break;
      }
      case 'turret': {
        e.g.rotation.y = Math.atan2(Player.pos.x - e.pos.x, Player.pos.z - e.pos.z);
        break;
      }
      case 'chaser': {
        var tgt = P.tmpB.copy(Player.pos);
        tgt.x += Math.sin(e.t * 1.3 + e.phase) * 14;
        tgt.y += Math.cos(e.t * 1.1 + e.phase) * 9;
        tgt.z -= 46;
        var mv2 = tgt.sub(e.pos);
        var l2 = mv2.length();
        if (l2 > 0.01) e.pos.addScaledVector(mv2.normalize(), Math.min(l2, d.speed * dt));
        e.g.lookAt(Player.pos);
        if (e.g.userData.flame) e.g.userData.flame.scale.setScalar(0.7 + Math.random() * 0.7);
        break;
      }
      case 'carrier': {
        e.pos.z -= 14 * dt;
        e.pos.x += Math.sin(e.t * 0.5 + e.phase) * 10 * dt;
        e.pos.y += Math.sin(e.t * 0.35) * 6 * dt;
        e.g.rotation.y += dt * 0.5;
        if (e.g.userData.ring) e.g.userData.ring.rotation.z += dt * 1.4;
        if (e.g.userData.core) e.g.userData.core.scale.setScalar(0.9 + Math.sin(e.t * 5) * 0.12);
        break;
      }
      case 'mine': {
        e.pos.y += Math.sin(e.t * 1.6 + e.phase) * 5 * dt;
        e.g.rotation.x += dt * 0.7; e.g.rotation.z += dt * 0.5;
        if (e.g.userData.core) e.g.userData.core.scale.setScalar(0.8 + Math.sin(e.t * 9) * 0.35);
        if (dist < 5.5) { killEnemy(e, false); damagePlayer(3.4, true); continue; }
        break;
      }
    }

    e.g.position.copy(e.pos);
    // bank into lateral motion — nothing alive slides sideways flat
    if (e.type !== 'turret') {
      var latVX = (e.pos.x - prevX) / Math.max(dt, 1e-4);
      e.bank = e.bank === undefined ? 0 : e.bank;
      e.bank += (clamp(-latVX * 0.028, -0.55, 0.55) - e.bank) * dampF(6, dt);
      e.g.rotation.z += e.bank;
    }
    // hit flinch: a sharp swell that decays with the damage flash, then eases
    // back. One write per frame — two fought each other here.
    if (e.flashT > 0) {
      e.flashT -= dt;
      var fl = Math.max(0, e.flashT) / 0.09;
      e.g.scale.setScalar(e.bs * (1 + fl * 0.22));
    } else e.g.scale.setScalar(damp(e.g.scale.x, e.bs, 14, dt));

    // the enemy has moved since dist was measured; gates below want the new one
    dist = P.tmpA.copy(Player.pos).sub(e.pos).length();

    // shooting
    if (d.fireRate > 0 && dist < 300 && Game.state === 'playing' && !Game.ending) {
      e.fireT -= dt;
      if (e.fireT <= 0) {
        e.fireT = d.fireRate * rand(0.7, 1.3);
        var n = e.type === 'turret' ? 2 : 1;
        for (var s = 0; s < n; s++) enemyShoot(e, d.bulletSpeed, e.type === 'chaser' ? 3.0 : 2.4, 0.035);
      }
    }

    // collision with the dragon
    if (dist < d.radius + 2.6 && e.type !== 'mine') {
      killEnemy(e, true); damagePlayer(3.0, true); continue;
    }

    // cull
    var behind = Game.railZ - e.pos.z;
    if (behind > 140 || e.pos.z - Game.railZ > 700 || Math.abs(e.pos.x) > 320) {
      e.alive = false;
      freeEnemyMesh(e.type, e.g);
      enemies.splice(i, 1);
      dropLocks(e);
    }
  }
}

// ------------------------------------------------------------- enemy waves
var spawnT = 0;
function updateSpawner(dt) {
  if (Game.state !== 'playing' || Game.ending) return;
  if (P.opening && P.opening.active) return;
  var ep = P.world.EPISODES[Game.epIndex];
  spawnT -= dt;
  if (spawnT > 0) return;
  var maxAlive = Boss.active ? 6 : 16;
  if (enemies.length >= maxAlive) { spawnT = 0.5; return; }
  // pick a weighted type
  var mix = ep.enemyMix, total = 0, i;
  for (i = 0; i < mix.length; i++) total += mix[i][1];
  var r = Math.random() * total, type = mix[0][0];
  for (i = 0; i < mix.length; i++) { r -= mix[i][1]; if (r <= 0) { type = mix[i][0]; break; } }
  if (type === 'turret' && !P.terrain.enabled) type = 'wasp';

  var groupSize = (type === 'wasp' || type === 'mine') ? P.randi(2, 4)
                : (type === 'ray') ? P.randi(1, 3)
                : (type === 'chaser') ? P.randi(1, 2) : 1;
  for (i = 0; i < groupSize; i++) spawnEnemy(type);
  if (type === 'chaser' && Player.viewIndex !== 2) toast('!! ENEMY ASTERN — PRESS Q / E');

  var ramp = 1 + Game.epProgress * 0.55;
  spawnT = (1.9 / (ep.density * ramp)) * rand(0.7, 1.3);
}

P.entities = {
  enemies: enemies, lasers: lasers, bullets: bullets, ebullets: ebullets,
  orbs: orbs, shards: shards,
  spawnEnemy: spawnEnemy, killEnemy: killEnemy, hurtEnemy: hurtEnemy,
  updatePlayer: updatePlayer, updateProjectiles: updateProjectiles,
  updateEnemies: updateEnemies, updateSpawner: updateSpawner,
  updateBoss: updateBoss, bossStart: bossStart, Boss: Boss,
  fireGun: fireGun, fireLasers: fireLasers, boom: boom, SHARD_MATS: SHARD_MATS,
  spawnOrb: spawnOrb, spawnImpact: spawnImpact, impacts: impacts,
  enemyShoot: enemyShoot,
  dismissEnemy: function (e) {
    var i = enemies.indexOf(e);
    if (i < 0) return;
    e.alive = false;
    dropLocks(e);
    freeEnemyMesh(e.type, e.g);
    enemies.splice(i, 1);
  },
  dismissShot: function (shot) {
    var i = ebullets.indexOf(shot);
    if (i < 0) return;
    ebPool.put(shot.m); ebullets.splice(i, 1);
  },
  prewarm: prewarmEnemies,
  poolStats: function () {
    return { laser: laserPool.grown, ribbon: ribbonPool.grown, gun: gunPool.grown,
             impact: impactPool.grown, eb: ebPool.grown, shard: shardPool.grown,
             ring: ringPool.grown, enemyBuilds: enemyBuilds };
  },
  reset: function () {
    var i;
    for (i = enemies.length - 1; i >= 0; i--) { freeEnemyMesh(enemies[i].type, enemies[i].g); }
    enemies.length = 0;
    for (i = 0; i < lasers.length; i++) {
      laserPool.put(lasers[i].m);
      if (lasers[i].rib) { lasers[i].rib.geometry.setDrawRange(0, 0); ribbonPool.put(lasers[i].rib); }
    } lasers.length = 0;
    for (i = 0; i < bullets.length; i++) {
      gunPool.put(bullets[i].m);
      if (bullets[i].rib) { bullets[i].rib.geometry.setDrawRange(0, 0); ribbonPool.put(bullets[i].rib); }
    } bullets.length = 0;
    for (i = 0; i < fadingTrails.length; i++) {
      fadingTrails[i].m.geometry.setDrawRange(0, 0); ribbonPool.put(fadingTrails[i].m);
    } fadingTrails.length = 0;
    for (i = 0; i < impacts.length; i++) impactPool.put(impacts[i].g); impacts.length = 0;
    for (i = 0; i < ebullets.length; i++) ebPool.put(ebullets[i].m); ebullets.length = 0;
    for (i = 0; i < shards.length; i++) shardPool.put(shards[i].m); shards.length = 0;
    for (i = 0; i < rings.length; i++) ringPool.put(rings[i].m); rings.length = 0;
    for (i = 0; i < orbs.length; i++) { orbs[i].g.visible = false; orbPool.push(orbs[i].g); } orbs.length = 0;
    Locks.list.length = 0;
    spawnT = 1.5;
    if (Boss.group) { Boss.group.visible = false; Boss.active = false; Boss.group.scale.setScalar(1); }
    Game.bossActive = false;
  },
  getFlash: function () { return flashV; },
  setFlash: function (v) { flashV = v; },
  getFlashCol: function () { return flashCol; },
  getToastT: function () { return toastT; },
  getQuipT: function () { return quipT; },
  setQuipT: function (v) { quipT = v; },
  setToastT: function (v) { toastT = v; }
};

})();
if (window.__PFLOAD) __PFLOAD.set(0.55, 'TUNING THE ORGAN');
