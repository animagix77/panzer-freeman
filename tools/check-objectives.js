// Judge Dean LLC — Campaign objective integration, using production flight/combat.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { flight } = require('./check-motion');
function setup(stage, startZ = 0, reactions = []) {
  const { P, context } = flight();
  P.fx = { burst() {} };
  P.voice = { react(id) { reactions.push(id); }, isSpeaking() { return false; } };
  for (const file of ['p3_world.js', 'p4d_campaign.js', 'p4e_enemies.js'])
    vm.runInContext(fs.readFileSync(path.join(__dirname, '../src', file), 'utf8'), context);
  P.Game.epIndex = stage; P.Game.epStartZ = P.Game.railZ = startZ; P.Game.invulnT = 100;
  P.Player.railY = P.world.EPISODES[stage].railY;
  P.Player.pos.set(0, P.Player.railY, startZ); P.terrain.heightAt = () => 0;
  P.campaign.reset(); P.campaign.enter(P.world.EPISODES[stage]);
  return P;
}
// A fresh run has an actionable objective before the first incoming scout arrives.
for (const guided of [false, true]) {
  const P = setup(0); P.opening = { active: guided };
  assert.equal(P.campaign.objective.id, 'launch');
  P.Input.keys = { d: true, shift: true };
  for (let frame = 0; frame < 120; frame++) {
    P.entities.updatePlayer(1 / 60); P.campaign.update(1 / 60);
  }
  assert.equal(P.campaign.objective.status, 'success');
  assert.equal(P.campaign.objective.current, 2);
  assert.equal(P.Game.score, 500); assert.equal(P.campaign.results.length, 1);
  P.campaign.update(1); assert.equal(P.Game.score, 500, 'success rewards only once');
}
{
  const P = setup(0); P.Game.state = 'paused'; P.campaign.update(100);
  assert.equal(P.campaign.objective.remaining, 40, 'pause freezes objective timer');
  P.Game.state = 'playing'; P.campaign.update(40);
  assert.equal(P.campaign.objective.status, 'failed'); assert.equal(P.Game.score, 0);
  P.campaign.finishRun(); assert.equal(P.campaign.results.length, 1, 'failure records exactly once');
  P.campaign.reset(); assert.equal(P.campaign.results.length, 0); assert.equal(P.campaign.objective, null);
}
// The authored salvage trail is physically collectible, including during boost.
for (const boost of [false, true]) {
  const reactions = [], P = setup(1, 9000, reactions); P.Input.keys = boost ? { shift: true } : {};
  P.Game.state = 'intro'; P.Game.railZ += 450; P.Player.pos.z = P.Game.railZ; P.campaign.update(7.4);
  assert.equal(P.entities.orbs.length, 0, 'salvage waits until the opening camera gives control');
  P.Game.state = 'playing';
  for (let frame = 0; frame < 8 * 60 && P.campaign.objective.status === 'active'; frame++) {
    P.entities.updatePlayer(1 / 60); P.entities.updateProjectiles(1 / 60); P.campaign.update(1 / 60);
  }
  assert.equal(P.campaign.objective.status, 'success', 'salvage route is reachable at cruise and boost speed');
  assert(P.Game.orbsTaken >= 5); assert.equal(P.campaign.results[0].score, 1000);
  assert.equal(reactions.filter(id => id === 'pickup').length, P.Game.orbsTaken);
}
// Gate placements and objective closure are relative to the selected sector.
{
  const reactions = [], P = setup(0, 12000, reactions); P.Player.x = 54;
  P.Game.railZ = 16600; P.Player.pos.set(54, 30, 16600); P.campaign.update(.01);
  assert.equal(P.campaign.objective.id, 'gates');
  for (const z of [16710, 16930, 17150]) { P.Game.railZ = z; P.Player.pos.z = z; P.campaign.update(.01); }
  assert.equal(P.campaign.objective.status, 'success'); assert.equal(P.Game.score, 1550);
  assert.deepEqual(reactions, ['gates'], 'only the completed three-gate run requests commentary');
}
{
  const reactions = [], P = setup(0, 0, reactions); P.Game.railZ = 5300; P.Player.pos.z = 5300; P.campaign.update(.01);
  assert.equal(P.campaign.objective.status, 'failed');
  assert.equal(P.campaign.results.filter(r => r.id === 'gates').length, 1);
  assert.deepEqual(reactions, [], 'a missed gate never gets the success line');
}
// Marked objectives ignore ambient kills, count each target once, and retain
// the original earned convoy score/years reward.
{
  const reactions = [], P = setup(2, 5000, reactions), E = P.entities;
  P.Game.railZ = 5800; P.campaign.update(.01);
  const convoy = E.enemies.filter(e => e.tag === 'foundry-convoy');
  assert.equal(convoy.length, 3); assert(convoy.every(e => e.arrival && e.arrival.duration === 9));
  P.campaign.onKill({ tag: 'squadron' }); assert.equal(P.campaign.objective.current, 0);
  P.campaign.onKill(convoy[0]); P.campaign.onKill(convoy[0]); assert.equal(P.campaign.objective.current, 1);
  convoy.slice(1).forEach(e => E.killEnemy(e, true));
  assert.equal(P.campaign.objective.status, 'success'); assert.equal(P.campaign.results[0].score, 2000);
  P.Game.railZ = 8400; P.Player.pos.z = 8400; P.campaign.update(.01);
  assert.equal(P.campaign.objective.id, 'breach');
  const bombers = E.enemies.filter(e => e.tag === 'foundry-breach'); assert.equal(bombers.length, 2);
  for (const e of bombers) {
    e.arrival = null; e.pos.set(0, P.Player.railY, P.Game.railZ + 150); e.fireT = 0;
    P.enemyCombat.update(e, .01, 150); E.hurtEnemy(e, 3);
    assert(e.staggerT > 0, 'actual weapon damage performs a charge break');
  }
  assert.equal(P.campaign.objective.status, 'success');
  bombers.forEach(e => E.killEnemy(e, true));
  assert.equal(P.campaign.results.filter(r => r.id === 'breach').length, 1, 'break then kill cannot double-credit');
  assert.deepEqual(reactions, ['foundryKill', 'foundryKill', 'chargebreak', 'chargebreak', 'bomber', 'streak', 'bomber'],
    'foundry kills, interrupted attacks and the third confirmed kill earn their own remarks');
}
// Every sector supports direct entry and carries outcomes into the finale.
{
  const P = setup(3, 20000); assert.equal(P.campaign.objective.id, 'shield-guard');
  P.Game.railZ = 21000; P.campaign.update(.01);
  const guards = P.entities.enemies.filter(e => e.tag === 'citadel-guard');
  assert.equal(guards.length, 2); guards.forEach(e => P.campaign.onChargeBreak(e));
  assert.equal(P.campaign.objective.status, 'success');
  P.Game.railZ = 24500; P.campaign.update(.01);
  P.entities.enemies.filter(e => e.tag === 'citadel-last').forEach(e => P.entities.killEnemy(e, true));
  assert.equal(P.campaign.objective.status, 'success');
  P.Game.epIndex = 4; P.campaign.enter(P.world.EPISODES[4]);
  P.entities.Boss.built = { cores: [{ alive: false }, { alive: true }, { alive: false }] };
  P.entities.Boss.active = false; P.campaign.update(.01);
  assert.equal(P.campaign.objective.current, 0, 'old boss geometry cannot credit a fresh run before the boss activates');
  P.entities.Boss.active = true;
  P.campaign.update(.01); assert.equal(P.campaign.objective.current, 2);
  P.entities.Boss.built.cores[1].alive = false; P.Game.ending = true; P.campaign.update(.01);
  assert.equal(P.campaign.objective.status, 'success'); assert.equal(P.campaign.results.length, 3);
}
console.log('Objective checks passed: guided/replay engagement, earned success/failure, pause, reachable salvage, relative gates, tagged convoys, real charge breaks, direct sector entry and finale/results.');
