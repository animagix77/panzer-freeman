/* Enemy roles, readable attack windups and a paced squadron director. */
(function () {
'use strict';
var P = window.__PF, E = P.entities, Game = P.Game, Player = P.Player;
var ringGeo = new THREE.TorusGeometry(1, .09, 4, 20);
var flightDirection = new P.V3(), poseTarget = new THREE.Quaternion(), flightPose = new THREE.Quaternion();
var breakPressure = { turret: 2, carrier: 2, sentinel: 2, bomber: 3 };
var staggerDuration = 1.8, chargeTipShown = false;
function warningColor(e) { return e.type === 'turret' ? 0xff5774 : e.type === 'ray' ? 0xffc65c : 0xff814f; }
var profiles = {
  wasp: { label: 'WASP', windup: .85, count: 2, interval: .18, arc: .035, damage: 1.5 },
  ray: { label: 'SKIMMER', windup: 1.1, count: 3, interval: .24, sweep: 28, arc: 0, damage: 1.7 },
  turret: { label: 'SIEGE TURRET', windup: 1.5, count: 1, speed: 1.65, arc: 0, damage: 2.4 },
  chaser: { label: 'INTERCEPTOR', windup: .9, count: 3, interval: .16, arc: .018, damage: 1.3 },
  carrier: { label: 'DRONE CARRIER', windup: 1.35, count: 2, arc: .13, damage: 2 },
  sentinel: { label: 'SHIELD SENTINEL', windup: 1.25, count: 3, arc: .08, damage: 1.8 },
  bomber: { label: 'HEAVY BOMBER', windup: 1.6, count: 5, arc: .16, damage: 2.1 }
};
// Readable silhouettes and engine signatures, even while ships are deep in haze.
Object.keys(profiles).forEach(function(type) {
  var def = P.models.ENEMY_DEFS[type];
  if (def) { def.scale = (def.scale || 1) * 1.28; def.radius *= 1.28; }
});
var pixels = new Uint8Array(32 * 32 * 4);
for(var pixel=0;pixel<1024;pixel++) {
  var bx=(pixel%32-15.5)/15.5,by=(Math.floor(pixel/32)-15.5)/15.5;
  pixels[pixel*4]=pixels[pixel*4+1]=pixels[pixel*4+2]=255;
  pixels[pixel*4+3]=Math.round(255*Math.pow(Math.max(0,1-Math.sqrt(bx*bx+by*by)),2));
}
var beaconMap=new THREE.DataTexture(pixels,32,32,THREE.RGBAFormat);
beaconMap.minFilter=beaconMap.magFilter=THREE.LinearFilter;beaconMap.needsUpdate=true;
function flanked(e) { return Math.abs(Player.x - e.pos.x) > 25 || Player.pos.y - e.pos.y > 18; }
function active(e) {
  if (e.alive && !e.arrival && (e.pos.z < Game.railZ - 300 || Math.abs(e.pos.x) > 350)) e.retired = true;
  return e.alive && !e.retired;
}
function activeCount() {
  var count = 0;
  for (var i = 0; i < E.enemies.length; i++) if (active(E.enemies[i])) count++;
  return count;
}
function combatCap() { return P.world.EPISODES[Game.epIndex].id === 'boss' ? 6 : 18; }
function canAdd(n) { return activeCount() + n <= combatCap() && E.enemies.length + n <= 28; }
P.enemyCombat = {
  profiles: profiles,
  staggerDuration: staggerDuration,
  activeCount: activeCount,
  prepare: function (e) {
    e.shieldDown = 0; e.attack = null; e.volley = null; e.arrival = null; e.charge = 0; e.deployed = false;
    e.staggerT = 0; e.breakRewarded = false;
    e.visibleAge = 0;
    if (e.type !== 'turret' && e.type !== 'mine' && !e.g.userData.beacon) {
      var beacon = new THREE.Sprite(new THREE.SpriteMaterial({map:beaconMap,color:0xffac72,transparent:true,opacity:0,depthWrite:false,fog:false,blending:THREE.AdditiveBlending}));
      beacon.position.set(0,.3,-1);e.g.add(beacon);e.g.userData.beacon=beacon;
    }
    if(e.g.userData.beacon) { e.g.userData.beacon.visible=true;e.g.userData.beacon.material.opacity=0; }
    e.poseBlend = 0; e.poseQuaternion = null; e.retired = false;
    if (!profiles[e.type]) return;
    if (!e.g.userData.warning) {
      var ring = new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({ color: 0xff814f, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending }));
      ring.position.z = e.def.radius / e.bs * .6;
      e.g.add(ring); e.g.userData.warning = ring;
    }
    e.g.userData.warning.visible = false;
    e.g.userData.warning.material.color.setHex(warningColor(e));
    if (e.g.userData.shield) { e.g.userData.shield.visible = true; e.g.userData.shield.material.opacity = .27; }
  },
  beginArrival: function (e) {
    var far = P.world.EPISODES[Game.epIndex].fog.far + 160;
    if (e.type === 'mine' || e.type === 'turret') {
      e.pos.z = Game.railZ + far + Math.max(0, e.pos.z - Game.railZ - 120);
      if (e.type === 'turret') e.pos.y = P.terrain.heightAt(e.pos.x, e.pos.z);
      return;
    }
    e.arrival = { elapsed: 0, duration: e.type === 'chaser' ? 10 : 9,
      target: e.pos.clone().sub(new P.V3(0, Player.railY, Game.railZ)), far: far,
      previous: e.pos.clone(), oriented: false };
    e.pos.z = Game.railZ + far;
    e.arrival.previous.copy(e.pos);
  },
  arrive: function (e, dt) {
    var a = e.arrival; a.elapsed += dt;
    var t = Math.min(1, a.elapsed / a.duration), ease = t * t * (3 - 2 * t);
    // Interceptors sweep down a wide flank before settling astern.
    var pass = e.type === 'chaser' ? Math.sin(Math.PI * t) * (a.target.x < 0 ? -75 : 75) : 0;
    e.pos.set(a.target.x + pass, Player.railY + a.target.y + Math.sin(Math.PI * t) * 12,
      Game.railZ + a.far + (a.target.z - a.far) * ease);
    flightDirection.copy(e.pos).sub(a.previous);
    e.g.position.copy(e.pos);
    if (flightDirection.lengthSq() > .000001) {
      poseTarget.copy(e.g.quaternion);
      e.g.lookAt(flightDirection.add(e.pos));
      flightPose.copy(e.g.quaternion);
      if (a.oriented) e.g.quaternion.slerpQuaternions(poseTarget, flightPose, 1 - Math.exp(-5 * dt));
      a.oriented = true;
    }
    a.previous.copy(e.pos);
    this.visibility(e, dt);
    if (t === 1) {
      e.poseQuaternion = e.g.quaternion.clone(); e.poseBlend = 1.2;
      e.arrival = null; e.t = 0; e.fireT = Math.max(e.fireT, .9);
    }
  },
  visibility: function(e,dt) {
    e.visibleAge += dt;
    var beacon=e.g.userData.beacon;if(!beacon)return;
    var distance=e.pos.distanceTo(P.camera.position);
    var fade=P.clamp((1000-distance)/260,0,1)*P.clamp(e.visibleAge/1.2,0,1);
    beacon.material.opacity=fade*(e.arrival ? .85 : .32);
    // A small luminous engine, never a screen-filling target marker.
    var size=(e.arrival ? 7 : 3.5)/e.bs;beacon.scale.setScalar(size);
  },
  finishPose: function (e, dt) {
    if (e.poseBlend <= 0 || !e.poseQuaternion) return;
    poseTarget.copy(e.g.quaternion);
    e.g.quaternion.slerpQuaternions(e.poseQuaternion, poseTarget, 1 - Math.exp(-5 * dt));
    e.poseQuaternion.copy(e.g.quaternion); e.poseBlend -= dt;
  },
  depart: function (e, dt) {
    e.attack = null; e.volley = null; e.charge = 0; e.bank = 0; e.staggerT = 0;
    if (e.g.userData.warning) e.g.userData.warning.visible = false;
    // Passed ships peel away into the fog instead of resuming pursuit when the
    // player brakes. Ground emplacements stay planted until they leave view.
    if (e.type !== 'turret' && e.type !== 'mine') {
      var forward = Player.forwardSpeed || P.world.EPISODES[Game.epIndex].speed;
      if (e.departSpeed === undefined) e.departSpeed = forward - 30;
      e.departSpeed = P.damp(e.departSpeed, -110, 3, dt);
      e.departSpeed = Math.min(e.departSpeed, forward - 30);
      flightDirection.set(e.pos.x < 0 ? -18 : 18, 5, e.departSpeed);
      e.pos.addScaledVector(flightDirection, dt); e.g.position.copy(e.pos);
      poseTarget.copy(e.g.quaternion); e.g.lookAt(flightDirection.add(e.pos));
      flightPose.copy(e.g.quaternion);
      e.g.quaternion.slerpQuaternions(poseTarget, flightPose, 1 - Math.exp(-5 * dt));
    }
    return Game.railZ - e.pos.z > 1000 || Math.abs(e.pos.x) > 1000;
  },
  damage: function (e, damage) {
    if (e.type === 'sentinel' && e.shieldDown <= 0 && !flanked(e)) {
      if (P.fx) P.fx.burst(e.pos, 1.1, 0x67dcff, true);
      damage *= .25;
    }
    if (e.staggerT > 0) return damage * 1.5;
    if (e.attack && breakPressure[e.type] && damage > 0 && Game.state === 'playing' && !Game.ending &&
        !e.arrival && !e.retired && !e.openingOffset && !(P.opening && P.opening.active)) {
      // Pressure counts weapon damage after shields, before carrier flank bonuses.
      // Each new charge starts fresh, so ordinary chip damage cannot bank a break.
      e.attack.pressure = (e.attack.pressure || 0) + damage;
      if (e.attack.pressure >= breakPressure[e.type]) {
        e.attack = null; e.volley = null; e.charge = 0; e.staggerT = staggerDuration;
        e.fireT = Math.max(e.fireT, .8);
        if (e.type === 'sentinel') {
          e.shieldDown = staggerDuration;
          if (e.g.userData.shield) e.g.userData.shield.visible = false;
        }
        var cue = e.g.userData.warning;
        cue.visible = true; cue.material.color.setHex(0x73fff0); cue.material.opacity = .9;
        cue.scale.setScalar(e.def.radius / e.bs * 1.35);
        if (!e.breakRewarded) {
          e.breakRewarded = true;
          Player.energy = Math.min(100, (Player.energy === undefined ? 100 : Player.energy) + 15);
          P.toast('CHARGE BROKEN · +15 WING POWER · +50% DAMAGE');
        } else P.toast('CHARGE BROKEN · +50% DAMAGE');
        if (P.fx) P.fx.burst(e.pos, 2.1, 0x73fff0, true);
        P.Audio_.sZap(e.pos);
        if (P.campaign && P.campaign.onChargeBreak) P.campaign.onChargeBreak(e);
      }
    }
    return damage;
  },
  label: function (e) {
    if (e.arrival) return 'INCOMING';
    if (e.staggerT > 0) return 'STAGGERED · +50% DAMAGE';
    if (e.attack) return 'CHARGING';
    if (e.volley) return 'FIRING';
    if (e.type === 'sentinel') return e.shieldDown > 0 || flanked(e) ? 'SHIELD OPEN' : 'SHIELD · FLANK';
    return profiles[e.type] ? profiles[e.type].label : '';
  },
  update: function (e, dt, distance) {
    if (Game.state !== 'playing' || Game.ending || !e.alive || e.openingOffset || e.arrival) return;
    var p = profiles[e.type]; if (!p) return;
    if (!active(e)) {
      e.attack = null; e.volley = null; e.charge = 0; e.g.userData.warning.visible = false;
      return;
    }
    e.shieldDown = Math.max(0, (e.shieldDown || 0) - dt);
    if (e.g.userData.shield) {
      e.g.userData.shield.visible = e.shieldDown <= 0;
      e.g.userData.shield.material.opacity = flanked(e) ? .10 : .27;
    }
    if (e.staggerT > 0) {
      e.staggerT = Math.max(0, e.staggerT - dt);
      var staggerCue = e.g.userData.warning;
      staggerCue.visible = e.staggerT > 0;
      staggerCue.material.opacity = .25 + .5 * e.staggerT / staggerDuration;
      staggerCue.scale.setScalar(e.def.radius / e.bs * (1.35 + Math.sin(e.t * 14) * .08));
      return;
    }
    // Carriers bring two real escorts into the fight, once, within the shared cap.
    if (e.type === 'carrier' && !e.deployed && e.t > 5 && distance < 240 && canAdd(2) && !(P.opening && P.opening.active)) {
      e.deployed = true;
      [-1, 1].forEach(function (side) {
        var pos = e.pos.clone().add(new P.V3(side * 12, -4, -15));
        var drone = E.spawnEnemy('wasp', { pos: pos, tag: 'carrier-escort', entry: false, deployed: true }); drone.fireT = 2.5;
        if (P.fx) P.fx.burst(pos, .8, 0xffbd69, true);
      });
    }
    if (e.volley) {
      var volleyCue = e.g.userData.warning;
      volleyCue.visible = true; volleyCue.material.opacity = .75;
      volleyCue.scale.setScalar(e.def.radius / e.bs * (1.1 + Math.sin(e.t * 35) * .12));
      e.volley.wait -= dt;
      while (e.volley && e.volley.wait <= 0) {
        var v = e.volley, aim = v.aim.clone(); aim.z += Game.railZ - v.railZ;
        if (p.sweep) aim.x += (v.index - (p.count - 1) / 2) * p.sweep;
        if (distance > 30 && distance < 330 && E.ebullets.length < 100)
          E.enemyShoot(e, e.def.bulletSpeed * (p.speed || 1), p.damage, 0, aim, (v.index - (p.count - 1) / 2) * p.arc);
        v.index++; v.wait += p.interval || .01;
        if (v.index >= p.count) { e.volley = null; volleyCue.visible = false; }
      }
      return;
    }
    if (e.attack) {
      if (distance <= 30 || distance >= 330) {
        e.attack = null; e.charge = 0; e.fireT = .8; e.g.userData.warning.visible = false;
        return;
      }
      e.attack.left -= dt;
      e.charge = Math.min(1, 1 - e.attack.left / p.windup);
      var cue = e.g.userData.warning; cue.visible = true;
      cue.scale.setScalar((e.def.radius / e.bs) * (1.7 - e.charge * .6));
      cue.material.opacity = .3 + .6 * e.charge;
      if (e.attack.left <= 0) {
        // Lock lateral aim at the warning, but account for forward rail travel.
        e.attack.aim.z += Game.railZ - e.attack.railZ;
        if (p.interval) {
          e.volley = { aim: e.attack.aim.clone(), railZ: Game.railZ, index: 0, wait: 0 };
        } else if (distance < 330) for (var i = 0; i < p.count && E.ebullets.length < 100; i++) {
          E.enemyShoot(e, e.def.bulletSpeed * (p.speed || 1), p.damage, 0, e.attack.aim, (i - (p.count - 1) / 2) * p.arc);
        }
        // Bombers release physical mines from the hull, leaving a hazard trail.
        if (e.type === 'bomber' && !e.deployed && canAdd(2)) {
          e.deployed = true;
          [-1, 1].forEach(function (side) {
            var mine = E.spawnEnemy('mine', { pos: e.pos.clone().add(new P.V3(side * 10, -5, -10)), tag: 'bomber-mine', entry: false, deployed: true });
            mine.dropT = .8;
          });
        }
        if (P.fx) P.fx.burst(e.pos, e.type === 'bomber' ? 1.6 : .8, 0xffa46b, true);
        if (e.type === 'sentinel') e.shieldDown = 2.5;
        e.attack = null; e.charge = 0; cue.visible = false;
        e.fireT = e.def.fireRate * P.rand(.9, 1.2);
      }
      return;
    }
    e.fireT -= dt;
    if (e.fireT > 0 || distance <= 35 || distance >= 280 || E.ebullets.length >= 85) return;
    var windingUp = 0;
    for (var n = 0; n < E.enemies.length; n++) {
      var other = E.enemies[n];
      if (other.alive && (other.attack || other.volley)) windingUp++;
    }
    if (windingUp < 3) {
      e.attack = { left: p.windup, aim: Player.pos.clone(), railZ: Game.railZ };
      e.g.userData.warning.material.color.setHex(warningColor(e));
      if (breakPressure[e.type] && !chargeTipShown && !(P.opening && P.opening.active)) {
        chargeTipShown = true; P.toast('CHARGE BREAK · HIT CHARGING HEAVIES TO INTERRUPT');
      }
    }
  }
};
// Alternate readable shapes and roles; replenish an empty sky quickly without
// adding unlimited actors when the player leaves a large squadron alive.
var timer = 0, sequence = 0, episode = -1;
var decks = [
  ['v', 'cross', 'shield', 'pursuit', 'battery', 'escort'],
  ['cross', 'pursuit', 'v', 'bomber', 'mines'],
  ['bomber', 'escort', 'battery', 'shield', 'pursuit', 'v'],
  ['shield', 'bomber', 'cross', 'battery', 'escort', 'pursuit']
];
function make(type, x, y, z, hold) {
  var opts = { pos: new P.V3(x, Player.railY + y, Game.railZ + z), tag: 'squadron', entry: true };
  if (hold) { opts.formation = new P.V3(x, y, z); opts.holdFor = hold; }
  var e = E.spawnEnemy(type, opts); e.fireT = 1.4 + (sequence % 3) * .4 + Math.abs(x) * .012;
  return e;
}
P.encounters = {
  reset: function () { timer = 0; sequence = 0; episode = -1; chargeTipShown = false; },
  update: function (dt) {
    if (Game.state !== 'playing' || Game.ending || Game.cinematic || (P.opening && P.opening.active)) return;
    if (episode !== Game.epIndex) { episode = Game.epIndex; timer = .7; sequence = 0; }
    timer -= dt; if (timer > 0) return;
    var boss = P.world.EPISODES[Game.epIndex].id === 'boss';
    var count = activeCount(), cap = combatCap();
    var room = Math.min(cap - count, 28 - E.enemies.length);
    if (room < 2) { timer = .65; return; }
    var deck = decks[Math.min(Game.epIndex, 3)], shape = boss ? 'pair' : deck[sequence % deck.length];
    var cost = { v: 5, cross: 4, shield: 3, bomber: 3, escort: 3, battery: 4, mines: 4, pursuit: 3, pair: 2 };
    if (cost[shape] > room) shape = 'pair';
    else sequence++;
    var lane = Math.max(-32, Math.min(32, Player.x * .45));
    if (shape === 'v') {
      for (var i = -2; i <= 2; i++) make('wasp', lane + i * 17, 12 + Math.abs(i) * 4, 125 + Math.abs(i) * 22, 4);
    } else if (shape === 'cross') {
      [-1, 1].forEach(function (side) { for (var i = 0; i < 2; i++) {
        var e = make('ray', side * (68 + i * 16), 10 + i * 14, 135 + i * 40, 0); e.vel.x = -side * 24;
      } });
    } else if (shape === 'shield') {
      make('sentinel', lane, 16, 130, 3);
      make('wasp', lane - 28, 10, 155, 3); make('wasp', lane + 28, 10, 155, 3);
    } else if (shape === 'bomber') {
      make('bomber', lane, 24, 170, 4);
      make('ray', -75, 5, 145, 0).vel.x = 22; make('ray', 75, 5, 145, 0).vel.x = -22;
    } else if (shape === 'escort') {
      make('carrier', lane, 15, 150, 8);
      make('wasp', lane - 28, 8, 125, 4); make('wasp', lane + 28, 8, 125, 4);
    } else if (shape === 'battery') {
      [-1, 1].forEach(function (side) {
        var z = Game.railZ + 185 + (side > 0 ? 35 : 0), x = side * 62;
        var e = E.spawnEnemy('turret', { pos: new P.V3(x, P.terrain.heightAt(x, z), z), tag: 'squadron', entry: true }); e.fireT = 1.7;
        make('mine', side * 35, 7, 125, 0);
      });
    } else if (shape === 'mines') {
      [-52, -26, 26, 52].forEach(function (x, i) { make('mine', x, 8 + (i % 2) * 10, 140 + i * 18, 0); });
    } else if (shape === 'pursuit') {
      make('chaser', -30, 8, -82, 0); make('chaser', 30, 16, -95, 0);
      make('wasp', lane, 12, 130, 3);
      P.toast('INTERCEPTORS INBOUND · WATCH YOUR FLANKS');
    } else {
      make('wasp', -24, 15, 140, 3); make('wasp', 24, 15, 160, 3);
    }
    timer = boss ? 8 : count < 3 ? 3.6 : 5.2;
  }
};
})();
