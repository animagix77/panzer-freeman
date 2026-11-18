/* Judge Dean LLC — Flight maneuvers, sector objectives and authored encounters. */
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
var episode = null, events = {}, routeDone = false, routeHits = 0, previousPos = new P.V3();
var mission = null, credited = [], launchX = 0, launchBanked = false, boostTime = 0, orbBaseline = 0;
function finish(success, detail) {
  if (!mission || mission.status !== 'active') return;
  mission.status = success ? 'success' : 'failed';
  mission.hint = detail || (success ? 'Objective complete. Keep flying.' : 'Window closed. Continue the mission.');
  if (success) {
    Game.score += mission.score; Player.energy = Math.min(100, (Player.energy || 0) + mission.power);
    if (mission.years) P.deAge(mission.years);
    A.sOrb(); P.toast(mission.id === 'gates' ? 'CLEAN PASS · +500 BONUS · +50 WING POWER'
      : 'OBJECTIVE COMPLETE · ' + mission.rewardLabel);
  } else P.toast('OBJECTIVE MISSED · ' + mission.title);
  P.campaign.results.push({ id: mission.id, title: mission.title, sector: episode, status: mission.status,
    current: mission.current, target: mission.target, score: success ? mission.score : 0 });
}
function begin(id, title, hint, target, seconds, score, power, years, tag) {
  if (mission && mission.status === 'active') finish(false);
  credited = [];
  mission = { id: id, title: title, hint: hint, current: 0, target: target, progress: 0, status: 'active',
    remaining: seconds, score: score, power: power || 0, years: years || 0, tag: tag || null,
    rewardLabel: '+' + score + ' SCORE' + (power ? ' · +' + power + ' WING POWER' : '') + (years ? ' · −' + years + ' YEARS' : '') };
  P.campaign.objective = mission;
}
function progress(value) {
  if (!mission || mission.status !== 'active') return;
  mission.current = Math.min(mission.target, value); mission.progress = mission.current / mission.target;
  if (mission.current >= mission.target) finish(true);
}
function credit(e) {
  if (!mission || mission.status !== 'active' || !mission.tag || e.tag !== mission.tag || credited.indexOf(e) >= 0) return;
  credited.push(e); progress(credited.length);
}
function once(id, distance, fn) {
  if (!events[id] && Game.railZ - Game.epStartZ >= distance) { events[id] = true; fn(); }
}
function formation(type, x, y, z, tag) {
  var e = E.spawnEnemy(type, { pos: new P.V3(x, Player.railY + y, Game.railZ + z), formation: new P.V3(x, y, z), holdFor: 16, tag: tag, entry: true });
  e.fireT = 4; return e;
}
P.campaign = {
  // HUD contract: objective is null or {id,title,hint,current,target,progress,
  // status:'active'|'success'|'failed',remaining:seconds|null,rewardLabel}.
  // results holds one {id,title,sector,status,current,target,score} per resolved
  // objective. reset() begins a fresh run; enter() retains prior sector results.
  objective: null, results: [],
  reset: function () { mission = null; this.objective = null; this.results.length = 0; episode = null; credited = []; },
  finishRun: function () { if (mission && mission.status === 'active') finish(false, 'Flight ended before completion.'); },
  enter: function (ep) {
    if (mission && mission.status === 'active') finish(false, 'Sector completed before this objective.');
    episode = ep.id; events = {}; routeDone = false; routeHits = 0; previousPos.copy(Player.pos);
    mission = null; this.objective = null;
    rings.forEach(function (r) {
      r.visible = false; r.userData.collected = false; r.userData.resolved = false; r.userData.fade = 0;
      r.scale.setScalar(1); r.material.color.setHex(0x7befff); r.material.opacity = .8;
      r.userData.halo.material.opacity = .12; r.userData.arc.material.opacity = .6;
    });
    if (episode === 'ep1') rings.forEach(function (r, i) {
      r.position.set(i % 2 ? 54 : -54, 30, Game.epStartZ + 4700 + Math.floor(i / 2) * 220); r.visible = true;
    });
    if (episode === 'ep1') {
      launchX = Player.x; launchBanked = false; boostTime = 0;
      begin('launch', 'Take command', 'Bank left or right, then hold BOOST briefly.', 2, 40, 500, 25);
    } else if (episode === 'ep2') {
      orbBaseline = Game.orbsTaken;
      begin('salvage', 'Recover lost time', 'Collect 5 cyan orbs. Boost toward the trail; nearby orbs pull in.', 5, 20, 1000, 35);
    } else if (episode === 'foundry') {
      begin('convoy', 'Break the supply line', 'Destroy all 3 marked carriers. Flank or climb for double damage.', 3, 55, 2000, 25, 3, 'foundry-convoy');
    } else if (episode === 'ep3') {
      begin('shield-guard', 'Silence the mountain guard', 'Break a charge or destroy each marked sentinel. Flank the blue shields.', 2, 55, 1500, 35, 0, 'citadel-guard');
    } else if (episode === 'boss') {
      begin('fountain', 'Open the Fountain', 'Destroy all 3 cores. Rotate your view to follow the Sphinx.', 3, null, 2500, 0);
    }
  },
  onKill: function (e) {
    credit(e);
  },
  onChargeBreak: function (e) { if (mission && (mission.id === 'breach' || mission.id === 'shield-guard')) credit(e); },
  update: function (dt) {
    if (Game.state !== 'playing' || !episode) return;
    // A direct sector launch has an opening camera flight. Place the salvage
    // ahead only when control begins, so that intro cannot fly past the trail.
    if (episode === 'ep2' && !events.salvageTrail) {
      events.salvageTrail = true;
      for (var o = 0; o < 6; o++) E.spawnOrb(new P.V3((o % 3 - 1) * 18, Player.railY + 12, Game.railZ + 170 + o * 24), true);
    }
    if (mission && mission.status === 'active') {
      if (mission.id === 'launch') {
        launchBanked = launchBanked || Math.abs(Player.x - launchX) >= 18;
        if (Player.boosting) boostTime += dt;
        progress((launchBanked ? 1 : 0) + (boostTime >= .8 ? 1 : 0));
        if (mission.status === 'active') mission.hint = !launchBanked ? 'Bank left or right out of the centre lane.' : 'Hold BOOST briefly. Wing power recharges when released.';
      } else if (mission.id === 'salvage') progress(Game.orbsTaken - orbBaseline);
      else if (mission.id === 'fountain' && E.Boss.active && E.Boss.built) progress(E.Boss.built.cores.filter(function (c) { return !c.alive; }).length);
      if (mission.status === 'active' && mission.remaining !== null) {
        mission.remaining = Math.max(0, mission.remaining - dt);
        if (mission.remaining === 0) finish(false);
      }
    }
    if (episode === 'ep1') {
      once('fork', 3500, function () {
        begin('gates', 'Run the canyon gates', 'Choose either passage and fly through all 3 blue gates.', 3, null, 500, 25);
        P.toast('SPLIT CANYON · 3 BLUE GATES RECHARGE WING POWER');
      });
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
            if (mission && mission.id === 'gates') progress(routeHits);
            if (routeHits < 3) P.toast('GATE ' + routeHits + ' / 3 · +350 · +25 WING POWER');
            if (!routeDone) { routeDone = true;
              formation(crossX < 0 ? 'ray' : 'carrier', crossX, 14, 230); }
          }
          if (!ud.collected) r.visible = false;
        }
      });
      if (mission && mission.id === 'gates' && Game.railZ - Game.epStartZ > 5220) finish(false, 'A gate was missed. Each collected gate still keeps its reward.');
      once('maneuvers', 5700, function () { P.toast('SHIFT BOOST · X AIR BRAKE · SPACE EVASIVE ROLL'); });
    } else if (episode === 'ep2') {
      once('crossfire', 1400, function () {
        begin('crossfire', 'Break the crossing squadron', 'Destroy 4 marked skimmers before they leave the sector.', 4, 38, 1400, 30, 0, 'drowned-patrol');
        P.toast('CROSSING SQUADRON · KEEP MOVING');
        [-1, 1].forEach(function (side) { for (var i = 0; i < 3; i++) formation('ray', side * (48 + i * 8), 10 + i * 6, 220 + i * 35, 'drowned-patrol'); });
      });
      once('ambush', 3800, function () { P.toast('INTERCEPTORS INBOUND · WATCH YOUR FLANKS'); formation('chaser', -24, 8, -85); formation('chaser', 24, 8, -110); });
    } else if (episode === 'foundry') {
      once('convoy', 700, function () {
        P.toast('BREAK THE CONVOY · FLANK CARRIERS FOR DOUBLE DAMAGE');
        [-36, 0, 36].forEach(function (x, i) { formation('carrier', x, 8, 210 + i * 50, 'foundry-convoy'); });
      });
      once('guard', 3300, function () {
        begin('breach', 'Stop the heavy barrage', 'Charge-break or destroy both marked bombers. Fire during CHARGING.', 2, 38, 1600, 40, 0, 'foundry-breach');
        [-1, 1].forEach(function (side) { formation('bomber', side * 42, 18, 180, 'foundry-breach'); });
      });
    } else if (episode === 'ep3') {
      once('gate', 900, function () { P.toast('THE MOUNTAIN GATE · CLIMB TO FLANK THE GUARD'); formation('sentinel', -30, 0, 180, 'citadel-guard'); formation('sentinel', 30, 0, 210, 'citadel-guard'); });
      once('last', 4400, function () {
        begin('last-defence', 'Clear the final defence', 'Destroy all 4 marked fighters before the Fountain approach.', 4, 35, 1800, 40, 0, 'citadel-last');
        P.toast('THE LAST DEFENCE'); for (var i = 0; i < 4; i++) formation('wasp', (i - 1.5) * 30, 15, 190 + i * 20, 'citadel-last');
      });
    }
    previousPos.copy(Player.pos);
  }
};
})();
