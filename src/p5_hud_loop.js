/* =========================================================================
   Part 5 — HUD, episode flow, input, main loop
   ========================================================================= */
(function () {
var P = window.__PF;
var V3 = P.V3, clamp = P.clamp, lerp = P.lerp, damp = P.damp, rand = P.rand, TAU = P.TAU;
var scene = P.scene, camera = P.camera, renderer = P.renderer;
var Game = P.Game, Player = P.Player, Input = P.Input, Locks = P.Locks;
var E = P.entities, Boss = P.Boss, A = P.Audio_, hx = P.hx, HUD = P.HUD;
var EPISODES = P.world.EPISODES;

// -------------------------------------------------------------- world setup
var terrain = new P.world.Terrain();
var props   = new P.world.PropField();
var props2  = new P.world.PropField();
P.terrain = terrain;

// ------------------------------------------------------- episode colour lerp
var cur = {
  lo: new THREE.Color(), mid: new THREE.Color(), hi: new THREE.Color(), sun: new THREE.Color(),
  fog: new THREE.Color(), amb: new THREE.Color(), key: new THREE.Color(), rim: new THREE.Color(),
  fogNear: 60, fogFar: 430, sunDir: new V3(0, 0, 1), sunSize: 0.02, bands: 24,
  ambI: 1, keyI: 1, rimI: 0.4, shaft: 0.30, kd: new V3(0, 0.5, 1)
};
var tgt = JSON.parse('{}');
function setTargets(ep) {
  tgt = {
    lo: new THREE.Color(ep.sky.lo), mid: new THREE.Color(ep.sky.mid), hi: new THREE.Color(ep.sky.hi),
    sun: new THREE.Color(ep.sky.sun), fog: new THREE.Color(ep.fog.col),
    amb: new THREE.Color(ep.light.amb), key: new THREE.Color(ep.light.key), rim: new THREE.Color(ep.light.rim),
    fogNear: ep.fog.near, fogFar: ep.fog.far,
    sunDir: new V3(ep.sky.sunDir[0], ep.sky.sunDir[1], ep.sky.sunDir[2]).normalize(),
    sunSize: ep.sky.sunSize, bands: ep.sky.bands,
    shaft: ep.sky.shaft === undefined ? 0.30 : ep.sky.shaft,
    ambI: ep.light.ambI, keyI: ep.light.keyI, rimI: ep.light.rimI,
    kd: new V3(ep.light.kd[0], ep.light.kd[1], ep.light.kd[2]).normalize()
  };
}
function snapColors() {
  ['lo', 'mid', 'hi', 'sun', 'fog', 'amb', 'key', 'rim'].forEach(function (k) { cur[k].copy(tgt[k]); });
  cur.fogNear = tgt.fogNear; cur.fogFar = tgt.fogFar; cur.sunSize = tgt.sunSize; cur.bands = tgt.bands;
  cur.shaft = tgt.shaft;
  cur.ambI = tgt.ambI; cur.keyI = tgt.keyI; cur.rimI = tgt.rimI;
  cur.sunDir.copy(tgt.sunDir); cur.kd.copy(tgt.kd);
  applyColors();
}
function stepColors(dt) {
  var l = 1.5;
  ['lo', 'mid', 'hi', 'sun', 'fog', 'amb', 'key', 'rim'].forEach(function (k) {
    cur[k].lerp(tgt[k], 1 - Math.exp(-l * dt));
  });
  cur.fogNear = damp(cur.fogNear, tgt.fogNear, l, dt);
  cur.fogFar = damp(cur.fogFar, tgt.fogFar, l, dt);
  cur.sunSize = damp(cur.sunSize, tgt.sunSize, l, dt);
  cur.bands = damp(cur.bands, tgt.bands, l, dt);
  cur.shaft = damp(cur.shaft, tgt.shaft, l, dt);
  cur.ambI = damp(cur.ambI, tgt.ambI, l, dt);
  cur.keyI = damp(cur.keyI, tgt.keyI, l, dt);
  cur.rimI = damp(cur.rimI, tgt.rimI, l, dt);
  cur.sunDir.lerp(tgt.sunDir, 1 - Math.exp(-l * dt));
  cur.kd.lerp(tgt.kd, 1 - Math.exp(-l * dt));
  applyColors();
}
function applyColors() {
  var u = P.skyUni;
  u.cLo.value.copy(cur.lo); u.cMid.value.copy(cur.mid); u.cHi.value.copy(cur.hi);
  u.sunCol.value.copy(cur.sun); u.sunDir.value.copy(cur.sunDir);
  u.sunSize.value = cur.sunSize; u.bands.value = Math.round(cur.bands);
  u.shaftAmt.value = cur.shaft; u.shaftT.value = Game.time;
  scene.fog.color.copy(cur.fog);
  scene.fog.near = cur.fogNear; scene.fog.far = cur.fogFar;
  renderer.setClearColor(cur.fog, 1);
  P.ambLight.color.copy(cur.amb); P.ambLight.intensity = cur.ambI;
  P.keyLight.color.copy(cur.key); P.keyLight.intensity = cur.keyI;
  P.keyLight.position.copy(cur.kd);
  P.rimLight.color.copy(cur.rim); P.rimLight.intensity = cur.rimI;
}

// ------------------------------------------------------------ episode entry
var cardT = 0;
function showCard(ep) {
  var c = P.el.card;
  c.querySelector('.ep').textContent = ep.label;
  c.querySelector('.nm').textContent = ep.name;
  c.querySelector('.sub').textContent = ep.sub;
  c.classList.add('on');
  c.style.opacity = '1';
  cardT = 4.0;
}
function enterEpisode(i, instant, silent, keepMusic) {
  Game.epIndex = i;
  Game.epStartZ = Game.railZ;
  var ep = EPISODES[i];
  setTargets(ep);
  if (instant) snapColors();
  terrain.configure(ep.terrain, Game.railZ);
  if (P.weather) P.weather.configure(ep.weather);
  props.configure(ep.props, Game.railZ - 200);
  props2.configure(ep.props2, Game.railZ - 200);
  if (!silent) showCard(ep);
  if (!keepMusic) P.playMusic(ep.music);
  if (ep.id === 'boss') {
    Player.railY = Player.railY;
    setTimeout(function () { if (Game.state === 'playing') E.bossStart(); }, 2600);
  }
}

// --------------------------------------------------------------- projection
var _pv = new V3(), _cv = new V3();
function project(v) {
  _cv.copy(v);
  camera.worldToLocal(_cv);
  var front = _cv.z < -0.5;
  _pv.copy(v).project(camera);
  return {
    x: (_pv.x * 0.5 + 0.5) * HUD.w,
    y: (-_pv.y * 0.5 + 0.5) * HUD.h,
    front: front,
    depth: -_cv.z
  };
}

// -------------------------------------------------------------- lock-on tick
var _wp = new V3();
var _tgtCache = [], _tgtFrame = -1, _frameId = 0;
function targetables() {
  if (_tgtFrame === _frameId) return _tgtCache;
  _tgtFrame = _frameId;
  var out = _tgtCache; out.length = 0;
  for (var i = 0; i < E.enemies.length; i++) if (E.enemies[i].alive) out.push(E.enemies[i]);
  if (Boss.active && !Boss.dead) {
    for (var c = 0; c < Boss.built.cores.length; c++) {
      var core = Boss.built.cores[c];
      if (core.alive) out.push(core);
    }
  }
  return out;
}
function targetPos(t) {
  if (t.def) return t.pos;
  t.group.getWorldPosition(_wp);
  return _wp;
}
// Panzer-Dragoon style painting: sweeping the reticle stacks locks, and a big
// target can soak several of them. One lock lands every LOCK_CD seconds.
var LOCK_CD = 0.075;
function countLocks(t) {
  var n = 0;
  for (var i = 0; i < Locks.list.length; i++) if (Locks.list[i] === t) n++;
  return n;
}
function updateLocks(dt) {
  if (!Input.lmb) { Locks.cd = 0; return; }
  if (Locks.list.length >= Locks.max) return;
  Locks.cd -= dt;
  var R = Math.min(HUD.w, HUD.h) * 0.115;
  var guard = 0;
  while (Locks.cd <= 0 && Locks.list.length < Locks.max && guard++ < Locks.max) {
    var list = targetables();
    var best = null, bestD = R * R;
    for (var i = 0; i < list.length; i++) {
      var t = list[i];
      var cap = t.def ? 3 : 8;
      if (countLocks(t) >= cap) continue;
      var pp = project(targetPos(t));
      if (!pp.front || pp.depth > 460) continue;
      var dx = pp.x - Input.mx, dy = pp.y - Input.my;
      var d2 = dx * dx + dy * dy;
      if (d2 < bestD) { bestD = d2; best = t; }
    }
    if (!best) { Locks.cd = 0; break; }
    Locks.list.push(best); Locks.cd += LOCK_CD; A.sLock();
  }
}

// ================================================================== HUD DRAW
function rgba(r, g, b, a) { return 'rgba(' + r + ',' + g + ',' + b + ',' + a + ')'; }
function bracket(x, y, s, col, lw) {
  hx.strokeStyle = col; hx.lineWidth = lw || 2;
  var c = s * 0.34;
  hx.beginPath();
  hx.moveTo(x - s, y - s + c); hx.lineTo(x - s, y - s); hx.lineTo(x - s + c, y - s);
  hx.moveTo(x + s - c, y - s); hx.lineTo(x + s, y - s); hx.lineTo(x + s, y - s + c);
  hx.moveTo(x + s, y + s - c); hx.lineTo(x + s, y + s); hx.lineTo(x + s - c, y + s);
  hx.moveTo(x - s + c, y + s); hx.lineTo(x - s, y + s); hx.lineTo(x - s, y + s - c);
  hx.stroke();
}
function txt(s, x, y, size, col, align, weight) {
  hx.font = (weight || 'bold') + ' ' + size + 'px "Courier New", monospace';
  hx.textAlign = align || 'left';
  hx.textBaseline = 'alphabetic';
  hx.fillStyle = 'rgba(0,0,0,0.7)';
  hx.fillText(s, x + 2, y + 2);
  hx.fillStyle = col;
  hx.fillText(s, x, y);
}

function drawHUD(dt) {
  var w = HUD.w, h = HUD.h;
  hx.clearRect(0, 0, w, h);
  if (Game.state !== 'playing') return;
  var S = Math.min(w, h) / 900;
  var pad = 26;

  // ---------- lock brackets on locked targets
  var i, pp;
  for (i = 0; i < Locks.list.length; i++) {
    var t = Locks.list[i];
    pp = project(targetPos(t));
    if (!pp.front) continue;
    var dup = 0;
    for (var q = 0; q < i; q++) if (Locks.list[q] === t) dup++;
    var sz = clamp(1400 / Math.max(20, pp.depth), 11, 60) + dup * 5;
    bracket(pp.x, pp.y, sz, '#ff4a6a', 2.5);
    hx.strokeStyle = 'rgba(255,74,106,.35)';
    hx.beginPath(); hx.moveTo(Input.mx, Input.my); hx.lineTo(pp.x, pp.y); hx.stroke();
  }

  // ---------- soft markers on unlocked targets + off-screen arrows
  var list = targetables();
  for (i = 0; i < list.length; i++) {
    var e = list[i];
    if (Locks.list.indexOf(e) >= 0) continue;
    pp = project(targetPos(e));
    if (pp.front && pp.x > -40 && pp.x < w + 40 && pp.y > -40 && pp.y < h + 40) {
      if (pp.depth < 380) {
        var s2 = clamp(1200 / Math.max(20, pp.depth), 8, 44);
        hx.strokeStyle = 'rgba(143,217,255,.42)'; hx.lineWidth = 1.4;
        hx.strokeRect(pp.x - s2, pp.y - s2, s2 * 2, s2 * 2);
      }
    } else {
      // off-screen: draw an edge arrow at the target's true screen bearing
      var tp = targetPos(e);
      var dx = tp.x - Player.pos.x, dz = tp.z - Player.pos.z;
      var cy2 = Math.cos(Player.camYaw), sy2 = Math.sin(Player.camYaw);
      var fwdC = dx * sy2 + dz * cy2;          // along the view direction
      var rgtC = -dx * cy2 + dz * sy2;         // along screen-right
      var ang = Math.atan2(fwdC, rgtC);        // 0 = screen right, PI/2 = up
      var cx = w / 2, cy = h / 2;
      var rr = Math.min(w, h) * 0.42;
      var ax = cx + Math.cos(ang) * rr, ay = cy - Math.sin(ang) * rr * 0.75;
      hx.save();
      hx.translate(ax, ay); hx.rotate(-ang);
      hx.fillStyle = 'rgba(255,110,80,.75)';
      hx.beginPath(); hx.moveTo(12, 0); hx.lineTo(-8, 7); hx.lineTo(-8, -7); hx.closePath(); hx.fill();
      hx.restore();
    }
  }

  // ---------- reticle
  var lockR = Math.min(w, h) * 0.115;
  var nLock = Locks.list.length;
  var retCol = Input.lmb ? (nLock ? '#ff4a6a' : '#ffd25e') : '#8fd9ff';
  hx.strokeStyle = 'rgba(255,255,255,.13)'; hx.lineWidth = 1;
  if (Input.lmb) { hx.beginPath(); hx.arc(Input.mx, Input.my, lockR, 0, TAU); hx.stroke(); }
  bracket(Input.mx, Input.my, 20, retCol, 2.5);
  hx.strokeStyle = retCol; hx.lineWidth = 2;
  hx.beginPath();
  hx.moveTo(Input.mx - 7, Input.my); hx.lineTo(Input.mx + 7, Input.my);
  hx.moveTo(Input.mx, Input.my - 7); hx.lineTo(Input.mx, Input.my + 7);
  hx.stroke();
  if (nLock) txt(nLock + '/' + Locks.max, Input.mx + 28, Input.my - 24, 15, '#ff4a6a');

  // ---------- age gauge (top-left)
  var gx = pad, gy = pad + 6, gw = Math.min(360, w * 0.32), gh = 20;
  var age = Game.age;
  var frac = clamp((100 - age) / (100 - 24), 0, 1);
  var col = age > 88 ? '#ff4a3a' : age > 70 ? '#ffa03a' : age > 50 ? '#ffd25e' : '#8fffc4';
  txt('AGE', gx, gy + 2, 15, '#cbb894');
  txt(age.toFixed(1), gx + 54, gy + 6, 30, col);
  hx.fillStyle = 'rgba(0,0,0,.55)';
  hx.fillRect(gx, gy + 16, gw, gh);
  hx.fillStyle = col;
  hx.fillRect(gx + 2, gy + 18, (gw - 4) * frac, gh - 4);
  hx.strokeStyle = 'rgba(255,255,255,.55)'; hx.lineWidth = 1.5;
  hx.strokeRect(gx, gy + 16, gw, gh);
  // target marker at 30
  var tmx = gx + gw * ((100 - 30) / (100 - 24));
  hx.strokeStyle = '#8fffc4'; hx.lineWidth = 2;
  hx.beginPath(); hx.moveTo(tmx, gy + 12); hx.lineTo(tmx, gy + 16 + gh + 4); hx.stroke();
  txt('30', tmx, gy + 16 + gh + 20, 12, '#8fffc4', 'center');
  txt('100 → DUST', gx, gy + 16 + gh + 20, 12, '#7e7192');

  // ---------- score / combo (top-right)
  txt(('' + Game.score).padStart(8, '0'), w - pad, gy + 22, 26, '#ffd25e', 'right');
  txt('SCORE', w - pad, gy + 40, 12, '#7e7192', 'right');
  if (Game.combo > 1) {
    txt('×' + Game.combo + ' CHAIN', w - pad, gy + 66, 17, '#8fffc4', 'right');
  }

  // ---------- episode + progress (top centre)
  var ep = EPISODES[Game.epIndex];
  txt(ep.label + ' · ' + ep.name, w / 2, gy + 16, 13, 'rgba(203,184,148,.9)', 'center');
  if (ep.id !== 'boss') {
    var pw = Math.min(420, w * 0.34), px = w / 2 - pw / 2, py = gy + 26;
    hx.fillStyle = 'rgba(0,0,0,.5)'; hx.fillRect(px, py, pw, 7);
    hx.fillStyle = '#8fd9ff'; hx.fillRect(px + 1, py + 1, (pw - 2) * clamp(Game.epProgress, 0, 1), 5);
    hx.strokeStyle = 'rgba(255,255,255,.35)'; hx.lineWidth = 1; hx.strokeRect(px, py, pw, 7);
  }

  // ---------- boss bar
  if (Boss.active && !Boss.dead) {
    var totalHp = 0, maxHp = 0;
    for (i = 0; i < Boss.built.cores.length; i++) {
      totalHp += Math.max(0, Boss.built.cores[i].hp); maxHp += Boss.built.cores[i].maxHp;
    }
    var bw = Math.min(620, w * 0.6), bx = w / 2 - bw / 2, by = h - pad - 34;
    txt('CHRONOS · HOUR-SPHINX', w / 2, by - 8, 14, '#ff8a5a', 'center');
    hx.fillStyle = 'rgba(0,0,0,.6)'; hx.fillRect(bx, by, bw, 16);
    hx.fillStyle = '#ff5a3a'; hx.fillRect(bx + 2, by + 2, (bw - 4) * (totalHp / maxHp), 12);
    hx.strokeStyle = 'rgba(255,255,255,.55)'; hx.lineWidth = 1.5; hx.strokeRect(bx, by, bw, 16);
    for (i = 1; i < 3; i++) {
      hx.strokeStyle = 'rgba(0,0,0,.7)';
      hx.beginPath(); hx.moveTo(bx + bw * i / 3, by); hx.lineTo(bx + bw * i / 3, by + 16); hx.stroke();
    }
  }

  // ---------- radar (bottom-left)
  var rcx = pad + 62, rcy = h - pad - 62, rr2 = 54;
  hx.fillStyle = 'rgba(6,3,14,.62)';
  hx.beginPath(); hx.arc(rcx, rcy, rr2, 0, TAU); hx.fill();
  hx.strokeStyle = 'rgba(143,217,255,.5)'; hx.lineWidth = 1.5;
  hx.beginPath(); hx.arc(rcx, rcy, rr2, 0, TAU); hx.stroke();
  hx.strokeStyle = 'rgba(143,217,255,.18)';
  hx.beginPath(); hx.arc(rcx, rcy, rr2 * 0.55, 0, TAU); hx.stroke();
  // view cone (always up)
  hx.fillStyle = 'rgba(143,217,255,.16)';
  hx.beginPath(); hx.moveTo(rcx, rcy);
  hx.arc(rcx, rcy, rr2, -Math.PI / 2 - 0.62, -Math.PI / 2 + 0.62); hx.closePath(); hx.fill();
  // rail-forward tick
  var railA = Math.atan2(Math.cos(Player.camYaw), -Math.sin(Player.camYaw));
  hx.strokeStyle = '#ffd25e'; hx.lineWidth = 2;
  hx.beginPath();
  hx.moveTo(rcx + Math.cos(railA) * (rr2 - 10), rcy - Math.sin(railA) * (rr2 - 10));
  hx.lineTo(rcx + Math.cos(railA) * rr2, rcy - Math.sin(railA) * rr2);
  hx.stroke();
  // blips
  var behindCount = 0;
  var cyR = Math.cos(Player.camYaw), syR = Math.sin(Player.camYaw);
  for (i = 0; i < list.length; i++) {
    var tp2 = targetPos(list[i]);
    var ddx = tp2.x - Player.pos.x, ddz = tp2.z - Player.pos.z;
    var d2 = Math.sqrt(ddx * ddx + ddz * ddz);
    if (d2 > 420) continue;
    var fC = (ddx * syR + ddz * cyR) / (d2 || 1);   // forward component
    var rC = (-ddx * cyR + ddz * syR) / (d2 || 1);  // screen-right component
    var rd = (d2 / 420) * (rr2 - 5);
    var bxp = rcx + rC * rd, byp = rcy - fC * rd;   // radar: up = view direction
    var isBehind = fC < 0.54;
    if (isBehind) behindCount++;
    hx.fillStyle = list[i].def ? (isBehind ? '#ff4a3a' : '#ffd25e') : '#8ffff0';
    hx.fillRect(bxp - 2.5, byp - 2.5, 5, 5);
  }
  hx.fillStyle = '#ffffff';
  hx.fillRect(rcx - 2, rcy - 2, 4, 4);
  if (behindCount && Math.floor(Game.time * 4) % 2 === 0) {
    txt('!', rcx, rcy + rr2 + 20, 20, '#ff4a3a', 'center');
  }
  var dirNames = ['FORWARD', 'STARBOARD', 'ASTERN', 'PORT'];
  txt(dirNames[((Player.viewIndex % 4) + 4) % 4], rcx, rcy - rr2 - 10, 12, '#8fd9ff', 'center');

  // ---------- stats bottom-right
  txt('KILLS ' + Game.kills, w - pad, h - pad - 26, 13, 'rgba(203,184,148,.8)', 'right');
  txt('ORBS ' + Game.orbsTaken, w - pad, h - pad - 8, 13, 'rgba(203,184,148,.8)', 'right');

  // ---------- damage vignette
  if (Game.hurtT > 0) {
    Game.hurtT -= dt;
    var a = clamp(Game.hurtT / 0.55, 0, 1) * 0.5;
    var grd = hx.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.22, w / 2, h / 2, Math.max(w, h) * 0.62);
    grd.addColorStop(0, 'rgba(255,40,20,0)');
    grd.addColorStop(1, 'rgba(255,40,20,' + a + ')');
    hx.fillStyle = grd; hx.fillRect(0, 0, w, h);
  }
  // critical age pulse
  if (Game.age > 92) {
    var pulse = (Math.sin(Game.time * 7) * 0.5 + 0.5) * 0.3 * ((Game.age - 92) / 8);
    var g2 = hx.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.25, w / 2, h / 2, Math.max(w, h) * 0.6);
    g2.addColorStop(0, 'rgba(120,0,0,0)');
    g2.addColorStop(1, 'rgba(150,0,0,' + pulse + ')');
    hx.fillStyle = g2; hx.fillRect(0, 0, w, h);
  }
}

// ===================================================================== INPUT
function keyName(e) { return (e.key || '').toLowerCase(); }
window.addEventListener('keydown', function (e) {
  var k = keyName(e);
  if (['arrowup', 'arrowdown', 'arrowleft', 'arrowright', ' '].indexOf(k) >= 0) e.preventDefault();
  if (Input.keys[k]) return;
  Input.keys[k] = true;
  if (Game.state === 'playing') {
    if (k === 'q') { Player.viewIndex--; Player.camYawTarget = Player.viewIndex * Math.PI / 2; A.sView(); }
    if (k === 'e') { Player.viewIndex++; Player.camYawTarget = Player.viewIndex * Math.PI / 2; A.sView(); }
  }
  if (k === 'p' || k === 'escape') togglePause();
  if (Game.state === 'intro') skipIntro();
  if (k === 'm') { var m2 = A.toggle(); P.toast(m2 ? 'AUDIO OFF' : 'AUDIO ON'); }
  if (k === 'i') {
    Player.invertY = !Player.invertY;
    P.toast(Player.invertY ? 'PITCH: INVERTED' : 'PITCH: NORMAL');
  }
  if (k === 'r') P.toast(P.toggleRetro() ? 'SATURN MODE' : 'CLEAN MODE');
});
window.addEventListener('keyup', function (e) { Input.keys[keyName(e)] = false; });
window.addEventListener('blur', function () { Input.keys = {}; Input.lmb = false; Input.rmb = false; });

function updMouse(e) {
  Input.mx = e.clientX; Input.my = e.clientY;
  Input.ndx = (e.clientX / HUD.w) * 2 - 1;
  Input.ndy = -((e.clientY / HUD.h) * 2 - 1);
}
window.addEventListener('mousemove', updMouse);
window.addEventListener('mousedown', function (e) {
  if (Game.state === 'intro') { skipIntro(); return; }
  if (Game.state !== 'playing') return;
  updMouse(e);
  if (e.button === 0) { Input.lmb = true; Input.lmbT = 0; }
  if (e.button === 2) Input.rmb = true;
});
window.addEventListener('mouseup', function (e) {
  if (e.button === 0) {
    if (Input.lmb && Game.state === 'playing') {
      if (Locks.list.length) E.fireLasers();
      else E.fireGun();
    }
    Input.lmb = false;
  }
  if (e.button === 2) Input.rmb = false;
});
window.addEventListener('contextmenu', function (e) { e.preventDefault(); });

// touch: drag to aim, tap to fire
window.addEventListener('touchstart', function (e) {
  if (Game.state !== 'playing') return;
  var t = e.touches[0]; updMouse(t); Input.lmb = true;
}, { passive: true });
window.addEventListener('touchmove', function (e) { updMouse(e.touches[0]); }, { passive: true });
window.addEventListener('touchend', function () {
  if (Input.lmb) { if (Locks.list.length) E.fireLasers(); else E.fireGun(); }
  Input.lmb = false;
});

function togglePause() {
  if (Game.state === 'playing') { Game.state = 'paused'; P.el.pause.classList.add('on'); }
  else if (Game.state === 'paused') { Game.state = 'playing'; P.el.pause.classList.remove('on'); }
}

// ============================================================ OPENING SHOT
// Starts tight on the rider's face, then pulls back and swings a full 180
// around to the standard behind-the-dragon flight camera.
var INTRO_LEN = 7.4;
var introT = 0;
var _headW = new V3(), _lookA = new V3(), _lookB = new V3(), _fwdV = new V3();
var _qA = new THREE.Quaternion(), _qB = new THREE.Quaternion();
function sstep(a, b, x) { var t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); }

function updateIntro(dt) {
  introT += dt;
  Game.time += dt;
  E.updatePlayer(dt);                 // dragon keeps flying; it leaves the camera alone
  terrain.update(Game.railZ);
  props.update(Game.railZ);
  props2.update(Game.railZ);
  stepColors(dt);

  var t = clamp(introT / INTRO_LEN, 0, 1);
  // dolly out first, then swing around — the two moves overlap but don't coincide
  var eR = sstep(0.11, 0.80, t); eR = eR * eR * (3 - 2 * eR);
  var eA = sstep(0.30, 0.96, t); eA = eA * eA * (3 - 2 * eA);
  var e = eA;

  P.dragon.root.updateMatrixWorld(true);
  P.dragon.headR.getWorldPosition(_headW);

  var yaw = Player.camYaw;
  _fwdV.set(Math.sin(yaw), 0, Math.cos(yaw));
  var theta = yaw + lerp(0.66, Math.PI, eA);           // opens 3/4-front, ends astern
  var radius = lerp(3.3, 26, eR);
  var height = lerp(2.78, 6.2, eR);
  var drift = (1 - eR) * 0.55;

  camera.position.set(
    Player.pos.x + Math.sin(theta) * radius + Math.sin(Game.time * 0.55) * drift,
    Player.pos.y + height + Math.sin(Game.time * 0.8) * drift * 0.5,
    Player.pos.z + Math.cos(theta) * radius
  );

  // look target slides from his face out to the flight horizon
  _lookA.copy(_headW); _lookA.y += 0.02;
  _lookB.copy(Player.pos).addScaledVector(_fwdV, 34); _lookB.y += 6.0;
  var s = sstep(0.35, 1.0, eA);
  camera.lookAt(
    lerp(_lookA.x, _lookB.x, s),
    lerp(_lookA.y, _lookB.y, s),
    lerp(_lookA.z, _lookB.z, s)
  );
  camera.rotateZ((1 - eR) * 0.055);

  var fov = lerp(29, 56, eR);
  if (Math.abs(camera.fov - fov) > 0.01) { camera.fov = fov; camera.updateProjectionMatrix(); }

  // he holds the camera's eye through the close-up, then turns back to the sky
  var w = 1 - sstep(0.10, 0.62, eA);
  if (w > 0.001) {
    var hr = P.dragon.headR;
    _qA.copy(hr.quaternion);
    hr.lookAt(camera.position);
    _qB.copy(hr.quaternion);
    hr.quaternion.copy(_qA).slerp(_qB, w);
  }

  // a little extra fill so the close-up isn't half in shadow
  P.ambLight.intensity = cur.ambI * lerp(1.75, 1.0, eR);
  P.keyLight.intensity = cur.keyI * lerp(0.85, 1.0, eR);

  P.skyMesh.position.copy(camera.position);

  if (introT >= INTRO_LEN) endIntro();
}

function endIntro() {
  P.ambLight.intensity = cur.ambI;
  P.keyLight.intensity = cur.keyI;
  P.playMusic(EPISODES[Game.epIndex].music);   // hand off from the title theme
  Game.state = 'playing';
  Game.cinematic = false;
  camera.fov = 56; camera.updateProjectionMatrix();
  P.hudCanvas.style.display = 'block';
  P.el.skip.classList.remove('on');
  showCard(EPISODES[0]);
}
P.setIntroT = function (frac) { introT = INTRO_LEN * frac; };
P.getIntroT = function () { return introT; };
function skipIntro() {
  if (Game.state !== 'intro') return;
  introT = Math.max(introT, INTRO_LEN * 0.88);
}

// ================================================================= GAME FLOW
function resetGame() {
  E.reset();
  Game.time = 0; Game.railZ = 0; Game.epProgress = 0;
  Game.age = 89; Game.startAge = 89; Game.score = 0; Game.kills = 0;
  Game.shots = 0; Game.hits = 0; Game.combo = 0; Game.bestCombo = 0; Game.comboT = 0;
  Game.hurtT = 0; Game.invulnT = 0; Game.shakeT = 0; Game.ending = false; Game.orbsTaken = 0;
  Game.cinematic = false;
  Player.x = 0; Player.y = 0; Player.zOff = 0;
  Player.vx = Player.vy = Player.vz = 0;
  Player.viewIndex = 0; Player.camYaw = 0; Player.camYawTarget = 0;
  Player.railY = EPISODES[0].railY;
  P.dragon.setAge(89);
  E.setFlash(0);
  Boss.dead = false;
}

function startGame() {
  A.init();
  if (!A.song) P.playMusic('title');   // in case the gesture that armed audio was this click
  resetGame();
  Game.state = 'intro';
  Game.cinematic = true;
  introT = 0;
  P.hudCanvas.style.display = 'none';
  P.el.title.classList.remove('on');
  P.el.over.classList.remove('on');
  P.el.win.classList.remove('on');
  P.el.skip.classList.add('on');
  enterEpisode(0, true, true, true);   // the title theme carries the cinematic
}

function rankFor(age) {
  if (age <= 30) return { r: 'REBORN', c: '#8ffff0' };
  if (age <= 40) return { r: 'RENEWED', c: '#8fffc4' };
  if (age <= 55) return { r: 'RESTORED', c: '#ffd25e' };
  if (age <= 70) return { r: 'REPRIEVED', c: '#ffa03a' };
  return { r: 'SURVIVED', c: '#ff8a5a' };
}

P.onEnd = function (won) {
  var acc = Game.shots ? Math.round(Game.hits / Game.shots * 100) : 0;
  var finalAge = won ? clamp(Game.age - 4, 24, 100) : Game.age;
  if (won) { Game.age = finalAge; P.dragon.setAge(finalAge); }
  var stats = 'YEARS SHED <b>' + (89 - finalAge).toFixed(1) + '</b> &nbsp;·&nbsp; KILLS <b>' + Game.kills +
              '</b> &nbsp;·&nbsp; BEST CHAIN <b>×' + Game.bestCombo + '</b><br>ACCURACY <b>' + acc +
              '%</b> &nbsp;·&nbsp; ORBS <b>' + Game.orbsTaken + '</b> &nbsp;·&nbsp; SCORE <b>' + Game.score + '</b>';
  if (won) {
    var rk = rankFor(finalAge);
    document.getElementById('winAge').textContent = finalAge.toFixed(0);
    document.getElementById('winAge').style.color = rk.c;
    document.getElementById('winStats').innerHTML = 'RANK <b style="color:' + rk.c + '">' + rk.r + '</b><br>' + stats;
    document.getElementById('winText').innerHTML =
      'The Hour-Sphinx breaks apart and the Fountain finally answers.<br>' +
      'The old rider swings down off the dragon at <b>' + finalAge.toFixed(0) + '</b> — ' +
      (finalAge <= 30 ? 'young enough to start the whole argument over again.'
       : finalAge <= 55 ? 'with a good many years handed back to him.'
       : 'a little lighter than he arrived, which is more than most manage.');
    P.el.win.classList.add('on');
  } else {
    document.getElementById('overTitle').textContent = 'TIME WINS';
    document.getElementById('overStats').innerHTML = stats;
    document.getElementById('overText').innerHTML =
      'The dragon glides down without a rider\'s hand on the reins.<br>' +
      'A hundred years is a hundred years, and the Fountain keeps its distance.';
    P.el.over.classList.add('on');
  }
  P.el.pause.classList.remove('on');
  P.el.card.classList.remove('on'); cardT = 0;
  P.el.toast.style.opacity = '0'; E.setToastT(0);
  P.el.quip.style.opacity = '0'; E.setQuipT(0);
  hx.clearRect(0, 0, HUD.w, HUD.h);
  P.hudCanvas.style.display = 'none';
  if (won) P.playMusic('ending'); else { P.playMusic(null); A.stop(); }
};

// browsers won't start audio without a gesture — take the first one we get
var audioArmed = false;
function armAudio() {
  if (audioArmed) return;
  audioArmed = true;
  A.init();
  if (Game.state === 'title') P.playMusic('title');
}
window.addEventListener('pointerdown', armAudio, { passive: true });
window.addEventListener('keydown', armAudio);

document.getElementById('startBtn').addEventListener('click', startGame);
document.getElementById('againBtn').addEventListener('click', startGame);
document.getElementById('winBtn').addEventListener('click', startGame);

// ================================================================ MAIN LOOP
var lastT = 0;
function frame(now) {
  requestAnimationFrame(frame);
  var dt = Math.min(0.05, (now - lastT) / 1000 || 0.016);
  lastT = now;
  _frameId++; P.frames = _frameId;

  A.update();

  if (Game.state === 'playing') {
    Game.time += dt;
    if (Game.comboT > 0) { Game.comboT -= dt; if (Game.comboT <= 0) Game.combo = 0; }

    E.updatePlayer(dt);
    E.updateSpawner(dt);
    E.updateEnemies(dt);
    E.updateBoss(dt);
    E.updateProjectiles(dt);
    updateLocks(dt);

    terrain.update(Game.railZ);
    props.update(Game.railZ);
    props2.update(Game.railZ);

    // episode progression
    var ep = EPISODES[Game.epIndex];
    if (ep.id !== 'boss') {
      Game.epProgress = (Game.railZ - Game.epStartZ) / ep.length;
      if (Game.epProgress >= 1) {
        P.flashScreen(0.85, '#ffffff');
        enterEpisode(Game.epIndex + 1, false);
      }
    }
    stepColors(dt);
  } else if (Game.state === 'intro') {
    updateIntro(dt);
  } else if (Game.state === 'title') {
    // slow idle orbit over the canyon for the title screen
    Game.time += dt;
    Game.railZ += 26 * dt;
    Player.pos.set(Math.sin(Game.time * 0.3) * 8, 26 + Math.sin(Game.time * 0.4) * 3, Game.railZ);
    P.dragon.root.position.copy(Player.pos);
    P.dragon.root.rotation.y = Math.sin(Game.time * 0.25) * 0.35;
    P.dragon.update(dt, Game.time, { strafeX: Math.sin(Game.time * 0.25) * 0.4, strafeY: 0,
      vy: Math.sin(Game.time * 0.42) * 26, aimX: 0, aimY: 0, boost: 0 });
    var yaw2 = Math.sin(Game.time * 0.22) * 0.8;
    camera.position.set(
      Player.pos.x + Math.sin(yaw2) * -34 + Math.cos(Game.time * 0.18) * 12,
      Player.pos.y + 8,
      Player.pos.z + Math.cos(yaw2) * -34
    );
    camera.lookAt(Player.pos.x, Player.pos.y + 1.5, Player.pos.z + 6);
    P.skyMesh.position.copy(camera.position);
    terrain.update(Game.railZ);
    props.update(Game.railZ);
    props2.update(Game.railZ);
    stepColors(dt);
  } else {
    stepColors(dt);
  }

  // screen flash
  var fv = E.getFlash();
  if (fv > 0) {
    P.el.flash.style.background = E.getFlashCol();
    P.el.flash.style.opacity = fv.toFixed(3);
    E.setFlash(Math.max(0, fv - dt * 2.6));
  } else P.el.flash.style.opacity = '0';

  // episode card fade
  if (cardT > 0) {
    cardT -= dt;
    var o = cardT > 3.2 ? (4.0 - cardT) / 0.8 : Math.min(1, cardT / 0.9);
    P.el.card.style.opacity = clamp(o, 0, 1).toFixed(3);
    if (cardT <= 0) P.el.card.classList.remove('on');
  }
  // toast fade
  var tt = E.getToastT();
  if (tt > 0) {
    tt -= dt; E.setToastT(tt);
    P.el.toast.style.opacity = clamp(tt > 1.5 ? (2.0 - tt) / 0.5 : tt / 0.7, 0, 1).toFixed(3);
  } else P.el.toast.style.opacity = '0';

  // narrator caption
  var qt = E.getQuipT();
  if (qt > 0) {
    qt -= dt; E.setQuipT(qt);
    P.el.quip.style.opacity = clamp(qt > 3.1 ? (3.6 - qt) / 0.5 : Math.min(1, qt / 0.8), 0, 1).toFixed(3);
  } else P.el.quip.style.opacity = '0';

  drawHUD(dt);
  // weather rides the camera, so it updates after the camera is final
  if (P.weather) P.weather.update(dt, camera.position, Game.time);
  renderer.render(scene, camera);
}

// ==================================================================== BOOT
// Staged across frames so the preload bar reports real work rather than a
// fake sweep — each step yields before the next one runs.
var LD = window.__PFLOAD || { step: function (p, l, n) { n(); }, done: function () {} };

var BOOT = [
  ['SQUARING THE VIEWPORT', function () {
    P.resize();
    Input.mx = HUD.w / 2; Input.my = HUD.h / 2; Input.ndx = 0; Input.ndy = 0;
  }],
  ['SIGHTING THE TARGETS', function () {
    setTargets(EPISODES[0]);
    snapColors();
  }],
  ['RAISING THE TERRAIN', function () {
    terrain.configure(EPISODES[0].terrain, 0);
  }],
  ['GATHERING THE WEATHER', function () {
    if (P.weather) { P.weather.configure(EPISODES[0].weather); P.weather.refresh(); }
  }],
  ['SCATTERING THE RUINS', function () {
    props.configure(EPISODES[0].props, -200);
    props2.configure(EPISODES[0].props2, -200);
    Player.railY = EPISODES[0].railY;
  }],
  ['COMPILING SHADERS', function () {
    // force every material through the GPU once, so the first real frame
    // doesn't stall on shader compilation mid-flight
    P.renderer.compile(P.scene, P.camera);
  }]
];

(function runBoot(i) {
  if (i >= BOOT.length) {
    LD.done();
    requestAnimationFrame(frame);
    return;
  }
  LD.step(0.55 + 0.44 * (i / BOOT.length), BOOT[i][0], function () {
    BOOT[i][1]();
    runBoot(i + 1);
  });
})(0);

})();
