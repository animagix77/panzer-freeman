/* Enemy roles, readable attack windups and a paced squadron director. */
(function () {
'use strict';
var P = window.__PF, E = P.entities, Game = P.Game, Player = P.Player;
var ringGeo = new THREE.TorusGeometry(1, .09, 4, 20);
var profiles = {
  wasp: { label: 'WASP', windup: .85, count: 2, arc: .035, damage: 1.5 },
  ray: { label: 'SKIMMER', windup: 1.1, count: 3, arc: .12, damage: 1.7 },
  turret: { label: 'SIEGE TURRET', windup: 1.2, count: 2, arc: .04, damage: 2 },
  chaser: { label: 'INTERCEPTOR', windup: .9, count: 1, arc: 0, damage: 1.8 },
  carrier: { label: 'DRONE CARRIER', windup: 1.35, count: 2, arc: .13, damage: 2 },
  sentinel: { label: 'SHIELD SENTINEL', windup: 1.25, count: 3, arc: .08, damage: 1.8 },
  bomber: { label: 'HEAVY BOMBER', windup: 1.6, count: 5, arc: .16, damage: 2.1 }
};
function flanked(e) { return Math.abs(Player.x - e.pos.x) > 25 || Player.pos.y - e.pos.y > 18; }
function aliveCount() { return E.enemies.filter(function (e) { return e.alive; }).length; }
P.enemyCombat = {
  profiles: profiles,
  prepare: function (e) {
    e.shieldDown = 0; e.attack = null; e.charge = 0; e.deployed = false;
    if (!profiles[e.type]) return;
    if (!e.g.userData.warning) {
      var ring = new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({ color: 0xff814f, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending }));
      ring.position.z = e.def.radius / e.bs * .6;
      e.g.add(ring); e.g.userData.warning = ring;
    }
    e.g.userData.warning.visible = false;
    if (e.g.userData.shield) { e.g.userData.shield.visible = true; e.g.userData.shield.material.opacity = .27; }
  },
  damage: function (e, damage) {
    if (e.type === 'sentinel' && e.shieldDown <= 0 && !flanked(e)) {
      if (P.fx) P.fx.burst(e.pos, 1.1, 0x67dcff, true);
      return damage * .25;
    }
    return damage;
  },
  label: function (e) {
    if (e.attack) return 'FIRING';
    if (e.type === 'sentinel') return e.shieldDown > 0 || flanked(e) ? 'SHIELD OPEN' : 'SHIELD · FLANK';
    return profiles[e.type] ? profiles[e.type].label : '';
  },
  update: function (e, dt, distance) {
    if (Game.state !== 'playing' || Game.ending || !e.alive || e.openingOffset) return;
    var p = profiles[e.type]; if (!p) return;
    e.shieldDown = Math.max(0, (e.shieldDown || 0) - dt);
    if (e.g.userData.shield) {
      e.g.userData.shield.visible = e.shieldDown <= 0;
      e.g.userData.shield.material.opacity = flanked(e) ? .10 : .27;
    }
    // Carriers bring two real escorts into the fight, once, within the shared cap.
    if (e.type === 'carrier' && !e.deployed && e.t > 5 && distance < 240 && aliveCount() <= 16 && !(P.opening && P.opening.active)) {
      e.deployed = true;
      [-1, 1].forEach(function (side) {
        var pos = e.pos.clone().add(new P.V3(side * 12, -4, -15));
        var drone = E.spawnEnemy('wasp', { pos: pos, tag: 'carrier-escort' }); drone.fireT = 2.5;
        if (P.fx) P.fx.burst(pos, .8, 0xffbd69, true);
      });
    }
    if (e.attack) {
      e.attack.left -= dt;
      e.charge = Math.min(1, 1 - e.attack.left / p.windup);
      var cue = e.g.userData.warning; cue.visible = true;
      cue.scale.setScalar((e.def.radius / e.bs) * (1.7 - e.charge * .6));
      cue.material.opacity = .3 + .6 * e.charge;
      if (e.attack.left <= 0) {
        // Lock lateral aim at the warning, but account for forward rail travel.
        e.attack.aim.z += Game.railZ - e.attack.railZ;
        if (distance < 330) for (var i = 0; i < p.count && E.ebullets.length < 100; i++) {
          E.enemyShoot(e, e.def.bulletSpeed, p.damage, 0, e.attack.aim, (i - (p.count - 1) / 2) * p.arc);
        }
        if (P.fx) P.fx.burst(e.pos, e.type === 'bomber' ? 1.6 : .8, 0xffa46b, true);
        if (e.type === 'sentinel') e.shieldDown = 2.5;
        e.attack = null; e.charge = 0; cue.visible = false;
        e.fireT = e.def.fireRate * P.rand(.9, 1.2);
      }
      return;
    }
    e.fireT -= dt;
    var windingUp = E.enemies.filter(function (other) { return other.alive && other.attack; }).length;
    if (e.fireT <= 0 && distance > 35 && distance < 280 && E.ebullets.length < 85 && windingUp < 3) {
      e.attack = { left: p.windup, aim: Player.pos.clone(), railZ: Game.railZ };
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
  var opts = { pos: new P.V3(x, Player.railY + y, Game.railZ + z), tag: 'squadron' };
  if (hold) { opts.formation = new P.V3(x, y, z); opts.holdFor = hold; }
  var e = E.spawnEnemy(type, opts); e.fireT = 1.4 + (sequence % 3) * .4 + Math.abs(x) * .012;
  return e;
}
P.encounters = {
  reset: function () { timer = 0; sequence = 0; episode = -1; },
  update: function (dt) {
    if (Game.state !== 'playing' || Game.ending || Game.cinematic || (P.opening && P.opening.active)) return;
    if (episode !== Game.epIndex) { episode = Game.epIndex; timer = .7; sequence = 0; }
    timer -= dt; if (timer > 0) return;
    var boss = P.world.EPISODES[Game.epIndex].id === 'boss';
    var count = aliveCount(), cap = boss ? 6 : 18;
    if (count > cap - (boss ? 2 : 5)) { timer = .65; return; }
    var deck = decks[Math.min(Game.epIndex, 3)], shape = boss ? 'pair' : deck[sequence % deck.length]; sequence++;
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
        var e = E.spawnEnemy('turret', { pos: new P.V3(x, P.terrain.heightAt(x, z), z), tag: 'squadron' }); e.fireT = 1.7;
        make('mine', side * 35, 7, 125, 0);
      });
    } else if (shape === 'mines') {
      [-52, -26, 26, 52].forEach(function (x, i) { make('mine', x, 8 + (i % 2) * 10, 140 + i * 18, 0); });
    } else if (shape === 'pursuit') {
      make('chaser', -30, 8, -82, 0); make('chaser', 30, 16, -95, 0);
      make('wasp', lane, 12, 130, 3);
      P.toast('INTERCEPTORS ASTERN · Q / E');
    } else {
      make('wasp', -24, 15, 140, 3); make('wasp', 24, 15, 160, 3);
    }
    timer = boss ? 8 : count < 3 ? 3.6 : 5.2;
  }
};
})();
