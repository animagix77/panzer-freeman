// Hit feedback follows actual damage and clears on reset, never on an empty shot.
const assert=require('node:assert/strict');
const {flight}=require('./check-motion');
const {P}=flight(),E=P.entities;
const e=E.spawnEnemy('carrier',{hpMul:2,pos:new P.V3(0,22,120)});
assert.equal(e.maxHp,12);E.fireGun();assert.equal(P.Game.hitConfirmT,0);
E.hurtEnemy(e,1);assert(P.Game.hitConfirmT>0);assert.equal(e.hp,11);
E.updateProjectiles(.2);assert.equal(P.Game.hitConfirmT,0);
E.hurtEnemy(e,100);assert(P.Game.killConfirmT>0);const kills=P.Game.kills;
E.hurtEnemy(e,100);assert.equal(P.Game.kills,kills,'dead target cannot award twice');
E.reset();assert.equal(P.Game.hitConfirmT,0);assert.equal(P.Game.killConfirmT,0);
console.log('Feedback checks passed: misses, confirmed damage, health scaling, decay, kill confirmation and reset.');

// Shockwaves own their fading material; reusing shared debris material made them
// opaque and would let any fade also change all nearby fragments.
E.reset();
const fire=E.SHARD_MATS.fire, before=fire.opacity;
E.boom(new P.V3(0,22,80),2,[fire]);
const wave=P.scene.children.find(o=>o.visible && o.name==='combat-shockwave');
assert(wave,'explosion has its own shockwave material');
assert(wave.material.transparent);const start=wave.material.opacity;
E.updateProjectiles(.2);assert(wave.material.opacity<start,'shockwave fades during expansion');
assert.equal(fire.opacity,before,'debris opacity remains independent');
console.log('Shockwave checks passed: translucent expansion and independent pooled materials.');

// A single projectile can be countered on the leading edge of a roll. The
// return travels through the real homing/collision path and preserves accuracy.
E.reset();
P.Game.railZ = 0;
P.Player.pos.set(0, 22, 0);
const source = E.spawnEnemy('carrier', {pos: new P.V3(0,22,100)});
function inbound() {
  const shot = E.enemyShoot(source, 60, 2, 0);
  shot.m.position.set(0,22,5);
}
P.Player.rollT = .6;
const reactions = [];
P.voice = { react(id) { reactions.push(id); }, isSpeaking() { return false; } };
inbound(); inbound();
const initialShots = P.Game.shots, initialHits = P.Game.hits;
E.updateProjectiles(1 / 30);
assert.equal(E.lasers.length, 1);
assert.equal(E.lasers[0].target, source);
assert.equal(P.Game.reflections, 1);
P.Player.rollT = .25;
inbound(); E.updateProjectiles(.05);
assert.equal(P.Game.reflections, 1, 'late roll dodges without another counter');
assert.deepEqual(reactions, ['counter'], 'only a reflected projectile requests a return-fire line');
for (let i=0; i<120; i++) E.updateProjectiles(1/60);
assert.equal(source.hp, source.maxHp-2);
assert.equal(P.Game.shots, initialShots);
assert.equal(P.Game.hits, initialHits);
console.log('Timed roll returns a shot, lands damage and preserves weapon accuracy.');

// A near-plane unprojection lies behind the dragon. The gun must instead
// converge on the forward camera ray, in every rotated view and off-center aim.
for (let view = 0; view < 4; view++) for (const aim of [[0,0],[.4,.25],[-.35,-.2]]) {
  const {P,step} = flight(), E = P.entities;
  P.Player.viewIndex = view; P.Player.camYaw = P.Player.camYawTarget = view * Math.PI / 2;
  step(null, 1);
  P.camera.updateMatrixWorld(true); P.dragon.root.updateMatrixWorld(true);
  P.Input.ndx = aim[0]; P.Input.ndy = aim[1];
  const target = P.getAimPoint(260), enemy = E.spawnEnemy('wasp', {pos:target.clone()});
  E.fireGun();
  const bullet = E.bullets[0], expected = target.clone().sub(bullet.m.position).normalize();
  assert(bullet.v.clone().normalize().dot(expected) > .9999, 'gun points into view ' + view);
  for (let tick = 0; tick < 100 && enemy.hp === enemy.maxHp; tick++) E.updateProjectiles(1/60);
  assert(enemy.hp < enemy.maxHp, 'actual projectile hits the reticle target in view ' + view);
}
console.log('Rapid-gun aim checks passed: forward and off-center hits in all four camera views.');

// Drive real combat outcomes into the rider's event hooks. The narration
// scheduler and actual media lifetime are exercised separately in check-voice.
{
  const { P, step } = flight(['p4d_campaign.js']), E = P.entities, cues = [];
  P.voice = { react(id) { cues.push(id); return true; }, isSpeaking() { return false; } };
  P.terrain.heightAt = () => 0;
  step('shift', 1); step('x', 1);
  assert.deepEqual(cues.splice(0), ['boost', 'brake'], 'sustained speed changes trigger once each');
  const types = ['wasp','ray','turret','chaser','carrier','mine','sentinel','bomber'];
  for (const type of types) {
    const e = E.spawnEnemy(type);
    P.Game.combo = 0; E.killEnemy(e, true); E.killEnemy(e, true);
    E.killEnemy(E.spawnEnemy(type), false);
  }
  assert.deepEqual(cues.splice(0), types, 'each species reacts to a confirmed player kill only');
  P.Game.age = 81; P.deAge(.5); assert.deepEqual(cues, []);
  P.deAge(1.5); P.deAge(.1);
  assert.deepEqual(cues.splice(0), ['decade'], 'crossing into a younger decade is a single event');
  E.reset(); P.Player.pos.set(0,22,0); P.Game.invulnT = P.Player.rollT = 0;
  const enemy = E.spawnEnemy('carrier', {pos: new P.V3(0,22,100)});
  function incoming(x) {
    const shot = E.enemyShoot(enemy, 60, 2, 0);
    shot.m.position.set(x,22,5); shot.v.set(0,0,-60);
  }
  incoming(8); E.updateProjectiles(.2); E.updateProjectiles(.2);
  incoming(0); E.updateProjectiles(.2); P.damagePlayer(2);
  assert.deepEqual(cues.splice(0), ['nearmiss','wounded'], 'a passing shot is distinct from a hit and invulnerability blocks a second hit');
  const scout = E.spawnEnemy('wasp');
  for (const target of [enemy, scout, scout, scout, enemy]) P.Locks.add(target);
  assert.deepEqual(cues, [], 'three spread-out locks or three on a light fighter cannot trigger the radar joke');
  P.Locks.add(enemy); assert.deepEqual(cues.splice(0), ['momlock']);
  E.reset(); P.Game.railZ = 0; P.Game.age = 86;
  E.bossStart(); assert.deepEqual(cues.splice(0), ['boss']);
  // Bring the first actual weak point into range, fire a locked laser and
  // verify the phase transition and its corresponding reaction.
  const core = E.Boss.built.cores[0];
  core.hp = 4.5; E.Boss.group.position.set(0,22,90); E.Boss.group.updateMatrixWorld(true);
  P.Locks.add(core); E.fireLasers();
  for (let i = 0; i < 180 && core.alive; i++) E.updateProjectiles(1/60);
  assert.equal(core.alive, false); assert.equal(E.Boss.phase, 1);
  assert.deepEqual(cues, ['core'], 'only a destroyed boss weak point earns the comment');
}
console.log('Rider reactions checked against real targets, flight controls, damage, near misses, age changes, lock slots and boss cores.');
