/* Flight maneuvers and authored encounters layered over the ambient patrols. */
(function () {
'use strict';
var P = window.__PF, Player = P.Player, Game = P.Game, E = P.entities, A = P.Audio_;
P.flight = {
  reset: function () {
    Player.energy = 100; Player.rollT = 0; Player.rollCD = 0; Player.rollDir = 1;
    Player.speedFactor = 1; Player.boosting = Player.braking = Player.exhausted = false;
  },
  roll: function () {
    if (Game.state !== 'playing' || Game.cinematic || Player.energy < 28 || Player.rollCD > 0) return false;
    Player.energy -= 28; Player.rollT = .65; Player.rollCD = 1.4;
    Player.rollDir = P.Input.keys.a || P.Input.keys.arrowleft ? -1 : 1;
    A.sRoll(); return true;
  },
  update: function (dt) {
    if (Player.energy === undefined) this.reset();
    Player.rollT = Math.max(0, Player.rollT - dt); Player.rollCD = Math.max(0, Player.rollCD - dt);
    var keys = P.Input.keys, wasBoosting = Player.boosting;
    Player.braking = !Game.cinematic && !!keys.x;
    if (Player.energy <= .1) Player.exhausted = true;
    if (Player.energy >= 24) Player.exhausted = false;
    Player.boosting = !Game.cinematic && !!keys.shift && !Player.braking && !Player.exhausted && Player.energy > 0 && Player.rollT === 0;
    Player.energy = P.clamp(Player.energy + (Player.boosting ? -34 : Player.rollT > 0 ? 0 : 19) * dt, 0, 100);
    Player.speedFactor = P.damp(Player.speedFactor, Player.braking ? .55 : Player.boosting ? 1.65 : 1, 5, dt);
    if (Player.boosting && !wasBoosting) A.sBoost();
  }
};
P.flight.reset();
var rings = [], geo = new THREE.TorusGeometry(12, .22, 5, 48);
var haloGeo = new THREE.TorusGeometry(12, .7, 5, 48);
var arcGeo = new THREE.TorusGeometry(14.5, .12, 4, 32, Math.PI * .8);
for (var i = 0; i < 6; i++) {
  var ring = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: 0x7befff, transparent: true, opacity: .8,
    blending: THREE.AdditiveBlending, depthWrite: false }));
  var halo = new THREE.Mesh(haloGeo, new THREE.MeshBasicMaterial({ color: 0x49d6ff, transparent: true, opacity: .12,
    blending: THREE.AdditiveBlending, depthWrite: false }));
  var arc = new THREE.Mesh(arcGeo, new THREE.MeshBasicMaterial({ color: 0xb8f7ff, transparent: true, opacity: .6,
    blending: THREE.AdditiveBlending, depthWrite: false }));
  ring.add(halo); ring.add(arc); ring.userData.halo = halo; ring.userData.arc = arc;
  ring.visible = false; P.scene.add(ring); rings.push(ring);
}
var episode = null, events = {}, routeDone = false, routeHits = 0, count = 0, previousPos = new P.V3();
function once(id, distance, fn) {
  if (!events[id] && Game.railZ - Game.epStartZ >= distance) { events[id] = true; fn(); }
}
function formation(type, x, y, z, tag) {
  var e = E.spawnEnemy(type, { pos: new P.V3(x, Player.railY + y, Game.railZ + z), formation: new P.V3(x, y, z), holdFor: 16, tag: tag, entry: true });
  e.fireT = 4; return e;
}
P.campaign = {
  enter: function (ep) {
    episode = ep.id; events = {}; routeDone = false; routeHits = 0; count = 0; previousPos.copy(Player.pos);
    rings.forEach(function (r) {
      r.visible = false; r.userData.collected = false; r.userData.resolved = false; r.userData.fade = 0;
      r.scale.setScalar(1); r.material.color.setHex(0x7befff); r.material.opacity = .8;
      r.userData.halo.material.opacity = .12; r.userData.arc.material.opacity = .6;
    });
    if (episode === 'ep1') rings.forEach(function (r, i) {
      r.position.set(i % 2 ? 54 : -54, 30, 4700 + Math.floor(i / 2) * 220); r.visible = true;
    });
  },
  onKill: function (e) {
    if (e.tag === 'foundry-convoy' && episode === 'foundry') {
      count++;
      if (count === 3) { Game.score += 2000; P.deAge(3); P.toast('SUPPLY LINE BROKEN · +3 YEARS · +2000'); A.sOrb(); }
      else P.toast('CONVOY ' + count + ' / 3');
    }
  },
  update: function (dt) {
    if (Game.state !== 'playing' || !episode) return;
    if (episode === 'ep1') {
      once('fork', 3500, function () { P.toast('SPLIT CANYON · 3 BLUE GATES RECHARGE WING POWER'); });
      rings.forEach(function (r) {
        if (!r.visible) return;
        var ud = r.userData;
        r.rotation.z += dt * .25; ud.arc.rotation.z -= dt * .8;
        if (ud.collected) {
          ud.fade = Math.max(0, ud.fade - dt);
          var fade = ud.fade / .45;
          r.scale.setScalar(1 + (1 - fade) * .8); r.material.opacity = fade * .9;
          ud.halo.material.opacity = fade * .2; ud.arc.material.opacity = fade * .7;
          if (ud.fade === 0) r.visible = false;
          return;
        }
        ud.halo.material.opacity = .10 + Math.sin(Game.time * 2.8 + r.position.z * .01) * .035;
        // Test the swept crossing, so a boost cannot skip a narrow gate.
        if (!ud.resolved && previousPos.z <= r.position.z && Player.pos.z >= r.position.z && Player.pos.z > previousPos.z) {
          ud.resolved = true;
          var crossing = (r.position.z - previousPos.z) / (Player.pos.z - previousPos.z);
          var crossX = P.lerp(previousPos.x, Player.pos.x, crossing), crossY = P.lerp(previousPos.y, Player.pos.y, crossing);
          if (Math.hypot(crossX - r.position.x, crossY - r.position.y) < 13) {
            ud.collected = true; ud.fade = .45; routeHits++;
            r.material.color.setHex(0xffe9a0); Game.score += 350; Player.energy = Math.min(100, Player.energy + 25);
            A.sOrb(); P.fx.burst(r.position, 2, 0x69eaff, true);
            if (routeHits === 3) {
              Game.score += 500; Player.energy = Math.min(100, Player.energy + 25);
              P.toast('CLEAN PASS · +500 BONUS · +50 WING POWER');
            } else P.toast('GATE ' + routeHits + ' / 3 · +350 · +25 WING POWER');
            if (!routeDone) { routeDone = true;
              formation(crossX < 0 ? 'ray' : 'carrier', crossX, 14, 230); }
          }
          if (!ud.collected) r.visible = false;
        }
      });
      once('maneuvers', 5700, function () { P.toast('SHIFT BOOST · X AIR BRAKE · SPACE EVASIVE ROLL'); });
    } else if (episode === 'ep2') {
      once('crossfire', 1400, function () {
        P.toast('CROSSING SQUADRON · KEEP MOVING');
        [-1, 1].forEach(function (side) { for (var i = 0; i < 3; i++) formation('ray', side * (48 + i * 8), 10 + i * 6, 220 + i * 35); });
      });
      once('ambush', 3800, function () { P.toast('INTERCEPTORS INBOUND · WATCH YOUR FLANKS'); formation('chaser', -24, 8, -85); formation('chaser', 24, 8, -110); });
    } else if (episode === 'foundry') {
      once('convoy', 700, function () {
        P.toast('BREAK THE CONVOY · FLANK CARRIERS FOR DOUBLE DAMAGE');
        [-36, 0, 36].forEach(function (x, i) { formation('carrier', x, 8, 210 + i * 50, 'foundry-convoy'); });
      });
      once('guard', 3300, function () { P.toast('FOUNDRY DEFENCE WING'); for (var i = 0; i < 5; i++) formation('wasp', (i - 2) * 25, 18, 190 + i * 18); });
    } else if (episode === 'ep3') {
      once('gate', 900, function () { P.toast('THE MOUNTAIN GATE · CLIMB TO FLANK THE GUARD'); formation('carrier', -24, 0, 230); formation('carrier', 24, 0, 280); });
      once('last', 4400, function () { P.toast('THE LAST DEFENCE'); for (var i = 0; i < 4; i++) formation('wasp', (i - 1.5) * 30, 15, 190 + i * 20); });
    }
    previousPos.copy(Player.pos);
  }
};
})();
