// Playability regressions: actual production flight and route code, no renderer.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { flight } = require('./check-motion');

function setup(x = 54, z = 4600) {
  const { P, context } = flight();
  const messages = [];
  P.toast = text => messages.push(text);
  P.fx = { burst() {} };
  vm.runInContext(fs.readFileSync(path.join(__dirname, '../src/p4d_campaign.js'), 'utf8'), context);
  P.Game.epIndex = 0; P.Game.epStartZ = 0; P.Game.railZ = z;
  P.Player.x = x; P.Player.pos.set(x, 30, z);
  P.campaign.enter({ id: 'ep1' });
  function move(x, z, dt = 1 / 60) {
    P.Game.time += dt; P.Game.railZ = z;
    P.Player.x = x; P.Player.pos.set(x, 30, z); P.campaign.update(dt);
  }
  return { P, move, messages };
}

// Judge the point where flight crosses the gate plane, including diagonal boosts.
{
  const { P, move } = setup(30, 4690);
  const score = P.Game.score;
  move(78, 4710);
  assert.equal(P.Game.score - score, 350, 'a clean crossing counts even if the frame ends outside');
  move(78, 4710);
  assert.equal(P.Game.score - score, 350, 'crossings cannot reward twice during the success animation');
}
{
  const { P, move } = setup(10, 4690);
  const score = P.Game.score;
  move(54, 4710);
  assert.equal(P.Game.score, score, 'entering the circle after passing its plane is a miss');
}

// The full route must pay exactly once and consistently at common frame rates.
for (const fps of [30, 60, 120]) {
  const { P, move, messages } = setup();
  P.Player.energy = 0;
  const score = P.Game.score;
  for (let z = 4600; z < 5200; z += 92 / fps) move(54 + Math.sin(z * .03) * 6, z, 1 / fps);
  assert.equal(P.Game.score - score, 1550, 'three gates award 3 × 350 plus 500 completion');
  assert.equal(P.Player.energy, 100, 'gate power recharges without exceeding capacity');
  assert.equal(messages.filter(text => text.startsWith('CLEAN PASS')).length, 1);
  assert.equal(P.entities.enemies.length, 1, 'one route patrol, even when all gates are crossed');
  move(54, 5300);
  assert.equal(P.Game.score - score, 1550, 'lingering success effects never repeat rewards');
}
{
  const { P, move, messages } = setup();
  const score = P.Game.score;
  move(54, 4710); move(20, 4850); move(20, 4930); move(54, 5070); move(54, 5150);
  assert.equal(P.Game.score - score, 700, 'missing a gate preserves earned score but prevents completion bonus');
  assert(!messages.some(text => text.startsWith('CLEAN PASS')));
  P.Player.pos.set(54, 30, 4600); P.Game.railZ = 4600; P.campaign.enter({ id: 'ep1' });
  move(54, 4710);
  assert.equal(P.Game.score - score, 1050, 're-entering a stage resets route eligibility');
}

// A pressed dodge protects immediately; its recovery still exposes the player.
{
  const { P } = setup();
  P.Game.invulnT = 0;
  const age = P.Game.age;
  assert(P.flight.roll());
  P.damagePlayer(2);
  assert.equal(P.Game.age, age, 'the first roll frame must evade damage');
  assert(!P.flight.roll(), 'a held/repeated roll cannot bypass cooldown');
  P.flight.update(.52);
  P.damagePlayer(2);
  assert.equal(P.Game.age, age + 2, 'recovery is vulnerable');
  P.flight.reset();
  assert.equal(P.Player.rollT, 0); assert.equal(P.Player.energy, 100);
}
console.log('Gauntlet checks passed: swept diagonal gates, misses, complete routes at 30/60/120 fps, replay reset, immediate dodge and vulnerable recovery.');
