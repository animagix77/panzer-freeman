const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { flight } = require('./check-motion');
function setup() {
  const {P,context}=flight();
  for(const f of ['p3_world.js','p4e_enemies.js'])vm.runInContext(fs.readFileSync(path.join(__dirname,'../src',f),'utf8'),context);
  P.Game.epIndex=0;P.Game.epProgress=0;P.Game.railZ=0;P.Player.pos.set(0,22,0);
  P.terrain.heightAt=()=>0;P.Game.invulnT=100;
  return P;
}
const P=setup(),E=P.entities;
// Previously rear interceptors could be culled immediately or never catch up.
const chaser=E.spawnEnemy('chaser');
for(let i=0;i<360;i++){E.updatePlayer(1/60);E.updateEnemies(1/60);}
assert(chaser.alive);assert(chaser.pos.z-P.Game.railZ>-90,'interceptor closes on the player');
E.reset();P.Player.pos.set(0,22,0);P.Player.x=0;P.Game.railZ=0;
const sentinel=E.spawnEnemy('sentinel',{pos:new P.V3(0,22,120)});
E.hurtEnemy(sentinel,1);assert.equal(sentinel.hp,4.75,'front shield reduces damage');
P.Player.x=40;E.hurtEnemy(sentinel,1);assert.equal(sentinel.hp,3.75,'flank bypasses shield');
P.Player.x=0;sentinel.shieldDown=2;E.hurtEnemy(sentinel,1);assert.equal(sentinel.hp,2.75,'open shield vulnerable from front');
E.reset();const bomber=E.spawnEnemy('bomber',{pos:new P.V3(0,22,150)});bomber.fireT=0;
P.enemyCombat.update(bomber,.016,150);assert(bomber.attack);assert.equal(E.ebullets.length,0,'warning precedes fire');
P.Player.pos.x=50;
for(let i=0;i<90;i++)P.enemyCombat.update(bomber,1/60,150);
assert.equal(E.ebullets.length,0,'full bomber windup respected');
for(let i=0;i<8;i++)P.enemyCombat.update(bomber,1/60,150);
assert.equal(E.ebullets.length,5,'bomber fires five lanes');
const velocity=E.ebullets[2].v.clone();P.tmpA.set(999,999,999);assert(E.ebullets[2].v.equals(velocity),'shots own their velocity instead of sharing a scratch vector');
assert(Math.abs(E.ebullets[2].v.x)<.001,'aim commits before lateral dodge');
E.reset();P.Player.pos.set(0,22,0);
const guard=E.spawnEnemy('sentinel',{pos:new P.V3(0,22,100)});guard.fireT=0;
for(let i=0;i<80;i++)P.enemyCombat.update(guard,1/60,100);
assert(guard.shieldDown>2,'firing opens the sentinel shield');
E.reset();const carrier=E.spawnEnemy('carrier',{pos:new P.V3(0,22,140)});carrier.t=6;
P.enemyCombat.update(carrier,.016,140);P.enemyCombat.update(carrier,.016,140);
assert.equal(E.enemies.filter(e=>e.tag==='carrier-escort').length,2,'carrier deploys escorts once');
E.reset();P.opening={active:true};P.encounters.update(10);assert.equal(E.enemies.length,0,'director respects briefing');
P.opening.active=false;P.Game.state='paused';P.encounters.update(10);assert.equal(E.enemies.length,0,'director respects pause');
P.Game.state='playing';
const seen=new Set(),stats=[];
for(let stage=0;stage<4;stage++){
 E.reset();P.Game.epIndex=stage;P.Game.railZ=0;P.Player.railY=P.world.EPISODES[stage].railY;
 let max=0,total=0,empty=0,longest=0;
 for(let frame=0;frame<45*30;frame++){
  P.Game.time+=1/30;P.Game.invulnT=1;E.updatePlayer(1/30);E.updateSpawner(1/30);E.updateEnemies(1/30);E.updateProjectiles(1/30);
  const live=E.enemies.filter(e=>e.alive);max=Math.max(max,live.length);total+=live.length;
  if(frame>60){empty=live.length?0:empty+1/30;longest=Math.max(longest,empty);}
  live.forEach(e=>{seen.add(e.type);assert([e.pos.x,e.pos.y,e.pos.z].every(Number.isFinite));});
  assert(live.filter(e=>e.attack).length<=3,'bounded simultaneous attack warnings');assert(E.ebullets.length<=100,'bounded hostile projectiles');
 }
 assert(max<=18,'director + carrier escort limit');assert(longest<2,'no prolonged empty sky');
 stats.push({stage:stage+1,averageEnemies:+(total/(45*30)).toFixed(1),max,longestEmpty:longest});
}
for(const type of ['wasp','ray','chaser','carrier','sentinel','bomber','turret','mine'])assert(seen.has(type),type+' encountered');
E.reset();const reused=E.spawnEnemy('sentinel');assert.equal(reused.shieldDown,0);assert.equal(reused.attack,null);assert(!reused.g.userData.warning.visible);
// All flyers approach from beyond fog, stay disarmed and reach their formation continuously.
for (const type of ['wasp','ray','chaser','carrier','sentinel','bomber']) {
 E.reset();P.Game.railZ=0;P.Player.railY=22;P.Player.pos.set(0,22,0);
 const rear=type==='chaser', e=E.spawnEnemy(type,{pos:new P.V3(30,34,rear?-82:140),entry:true});
 assert(e.pos.z>P.world.EPISODES[P.Game.epIndex].fog.far+100);
 for(let i=0;i<480 && e.arrival;i++) {
  const old=e.pos.clone();P.Game.railZ+=56/60;P.Player.pos.z=P.Game.railZ;
  E.updateEnemies(1/60);
  assert(e.pos.distanceTo(old)<5,'arrival has no position jumps');
  assert.equal(E.ebullets.length,0,'no attacks while arriving');
 }
 assert.equal(e.arrival,null);assert(Math.abs(e.pos.z-P.Game.railZ-(rear?-82:140))<.01);
}
for(const type of ['wasp','ray','turret','chaser']) {
 E.reset();P.Game.railZ=0;P.Player.pos.set(0,22,0);
 const e=E.spawnEnemy(type,{pos:new P.V3(0,22,150)});e.fireT=0;
 const p=P.enemyCombat.profiles[type];P.enemyCombat.update(e,.01,150);
 P.enemyCombat.update(e,p.windup+.01,150);
 if(p.interval) {
  assert.equal(E.ebullets.length,0);P.enemyCombat.update(e,.01,150);assert.equal(E.ebullets.length,1,'burst begins with one shot');
  for(let i=0;i<60;i++)P.enemyCombat.update(e,1/60,150);
 }
 assert.equal(E.ebullets.length,p.count,type+' shot count');
 if(type==='turret')assert(E.ebullets[0].v.length()>100,'precision turret has faster shot');
 if(type==='ray')assert(E.ebullets[0].v.x<0 && E.ebullets[2].v.x>0,'skimmer sweeps three different lanes');
}
console.log('Enemy checks passed: pursuit, shields, telegraphs, committed aim, carrier escorts, pause/briefing isolation, all stage decks, actor/projectile limits and pooled reset.');
console.log(stats);
