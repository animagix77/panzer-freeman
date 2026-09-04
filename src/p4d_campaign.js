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
var rings = [], geo = new THREE.TorusGeometry(10, .25, 5, 48);
for (var i = 0; i < 6; i++) {
  var ring = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: 0x7befff, transparent: true, opacity: .8,
    blending: THREE.AdditiveBlending, depthWrite: false }));
  ring.visible = false; P.scene.add(ring); rings.push(ring);
}
var episode = null, events = {}, routeDone = false, count = 0, previousZ = 0;
function once(id, distance, fn) {
  if (!events[id] && Game.railZ - Game.epStartZ >= distance) { events[id] = true; fn(); }
}
function formation(type, x, y, z, tag) {
  var e = E.spawnEnemy(type, { pos: new P.V3(x, Player.railY + y, Game.railZ + z), formation: new P.V3(x, y, z), holdFor: 16, tag: tag });
  e.fireT = 4; return e;
}
P.campaign = {
  enter: function (ep) {
    episode = ep.id; events = {}; routeDone = false; count = 0; previousZ = Player.pos.z;
    rings.forEach(function (r) { r.visible = false; r.userData.collected = false; });
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
      once('fork', 3500, function () { P.toast('SPLIT CANYON AHEAD · FOLLOW THE BLUE RINGS'); });
      rings.forEach(function (r) {
        if (!r.visible) return;
        r.rotation.z += dt * .25;
        // Test the swept crossing, so a boost cannot skip a narrow gate.
        if (previousZ <= r.position.z && Player.pos.z >= r.position.z) {
          if (Math.hypot(Player.x - r.position.x, Player.pos.y - r.position.y) < 13) {
            r.userData.collected = true; Game.score += 350; Player.energy = Math.min(100, Player.energy + 25);
            A.sOrb(); P.fx.burst(r.position, 2, 0x69eaff, true);
            if (!routeDone) { routeDone = true; P.toast(Player.x < 0 ? 'EAST PASS · INTERCEPTOR PATROL' : 'WEST PASS · ARMOURED PATROL');
              formation(Player.x < 0 ? 'ray' : 'carrier', Player.x, 14, 230); }
          }
          r.visible = false;
        }
      });
      once('maneuvers', 5700, function () { P.toast('SHIFT BOOST · X AIR BRAKE · SPACE EVASIVE ROLL'); });
    } else if (episode === 'ep2') {
      once('crossfire', 1400, function () {
        P.toast('CROSSING SQUADRON · KEEP MOVING');
        [-1, 1].forEach(function (side) { for (var i = 0; i < 3; i++) formation('ray', side * (48 + i * 8), 10 + i * 6, 220 + i * 35); });
      });
      once('ambush', 3800, function () { P.toast('INTERCEPTORS ASTERN · Q / E TO LOOK BACK'); formation('chaser', -24, 8, -85); formation('chaser', 24, 8, -110); });
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
    previousZ = Player.pos.z;
  }
};
})();
