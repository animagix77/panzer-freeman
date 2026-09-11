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
  // Direct combat probes place actors deliberately; director paths retain production entry.
  P.spawnWorldEnemy=P.entities.spawnEnemy;
  P.entities.spawnEnemy=(type,opts={})=>P.spawnWorldEnemy(type,{entry:false,...opts});
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
 let max=0,total=0,empty=0,longest=0,visibleTotal=0,maxActive=0;
 for(let frame=0;frame<45*30;frame++){
  P.Game.time+=1/30;P.Game.invulnT=1;E.updatePlayer(1/30);E.updateSpawner(1/30);E.updateEnemies(1/30);E.updateProjectiles(1/30);
  const live=E.enemies.filter(e=>e.alive);max=Math.max(max,live.length);total+=live.length;
  const visible=live.filter(e=>e.pos.z-P.Game.railZ>-240 && e.pos.z-P.Game.railZ<450 && Math.abs(e.pos.x)<200);
  visibleTotal+=visible.length;maxActive=Math.max(maxActive,P.enemyCombat.activeCount());
  if(frame>12*30){empty=visible.length?0:empty+1/30;longest=Math.max(longest,empty);}
  live.forEach(e=>{seen.add(e.type);assert([e.pos.x,e.pos.y,e.pos.z].every(Number.isFinite));});
  assert(live.filter(e=>e.attack || e.volley).length<=3,'bounded simultaneous attack warnings and bursts');assert(E.ebullets.length<=100,'bounded hostile projectiles');
  assert(P.enemyCombat.activeCount()<=18,'active director and deployed escort budget');
  assert(E.enemies.length<=28,'resident limit includes departing actors and debris');
 }
 assert(longest<2,'no prolonged visibly empty sky after the opening approach');
 stats.push({stage:stage+1,averageEnemies:+(total/(45*30)).toFixed(1),visibleAverage:+(visibleTotal/(45*30)).toFixed(1),max,maxActive,longestEmpty:longest});
}
for(const type of ['wasp','ray','chaser','carrier','sentinel','bomber','turret','mine'])assert(seen.has(type),type+' encountered');
E.reset();const reused=E.spawnEnemy('sentinel');assert.equal(reused.shieldDown,0);assert.equal(reused.attack,null);assert(!reused.g.userData.warning.visible);
// All flyers approach from beyond fog, stay disarmed and reach their formation continuously.
for (const type of ['wasp','ray','chaser','carrier','sentinel','bomber']) {
 E.reset();P.Game.railZ=0;P.Player.railY=22;P.Player.pos.set(0,22,0);
 const rear=type==='chaser', e=E.spawnEnemy(type,{pos:new P.V3(30,34,rear?-82:140),entry:true});
 assert(e.pos.z>P.world.EPISODES[P.Game.epIndex].fog.far+100);
 for(let i=0;i<720 && e.arrival;i++) {
  const old=e.pos.clone();P.Game.railZ+=56/60;P.Player.pos.z=P.Game.railZ;
  E.updateEnemies(1/60);
  assert(e.pos.distanceTo(old)<5,'arrival has no position jumps');
  if(e.arrival && e.arrival.elapsed>1.8 && e.arrival.elapsed<3.8) {
   const nose=new P.V3(0,0,1).applyQuaternion(e.g.quaternion);
   assert(nose.dot(e.pos.clone().sub(old).normalize())>.7,type+' nose follows incoming flight direction');
  }
  assert.equal(E.ebullets.length,0,'no attacks while arriving');
 }
 assert.equal(e.arrival,null);assert(Math.abs(e.pos.z-P.Game.railZ-(rear?-82:140))<.01);
 // Turning into attack attitude must be continuous after the approach completes.
 for(let i=0;i<90;i++) {
  const orientation=e.g.quaternion.clone();P.Game.railZ+=56/60;P.Player.pos.z=P.Game.railZ;
  E.updateEnemies(1/60);
  assert(orientation.angleTo(e.g.quaternion)<.3,type+' arrival-to-combat turn stays smooth');
 }
}
for(const type of ['wasp','ray','turret','chaser']) {
 E.reset();P.Game.railZ=0;P.Player.pos.set(0,22,0);
 const e=E.spawnEnemy(type,{pos:new P.V3(0,22,150)});e.fireT=0;
 const p=P.enemyCombat.profiles[type];P.enemyCombat.update(e,.01,150);
 P.enemyCombat.update(e,p.windup+.01,150);
 if(p.interval) {
  assert.equal(E.ebullets.length,0);P.enemyCombat.update(e,.01,150);assert.equal(E.ebullets.length,1,'burst begins with one shot');
  assert(e.g.userData.warning.visible,'telegraph remains visible while the burst is firing');
  for(let i=0;i<60;i++)P.enemyCombat.update(e,1/60,150);
 }
 assert.equal(E.ebullets.length,p.count,type+' shot count');
 if(type==='turret')assert(E.ebullets[0].v.length()>100,'precision turret has faster shot');
 if(type==='ray')assert(E.ebullets[0].v.x<0 && E.ebullets[2].v.x>0,'skimmer sweeps three different lanes');
}
// Passed enemies still fade naturally into the distance, but must not reserve
// the entire combat budget or fire again if their old world position is revisited.
E.reset();P.Game.epIndex=0;P.Game.railZ=0;P.Player.pos.set(0,22,0);
for(let i=0;i<18;i++)E.spawnEnemy('wasp',{pos:new P.V3(i*2,22,-400)});
P.encounters.update(.01);P.encounters.update(1);
assert(E.enemies.some(e=>e.arrival),'fresh wave can enter while passed enemies remain rendered');
assert.equal(P.enemyCombat.activeCount(),5);
const retired=E.enemies.find(e=>e.retired);retired.pos.z=100;retired.fireT=0;
P.enemyCombat.update(retired,1,100);assert.equal(retired.attack,null,'departed actors cannot reactivate');
E.reset();const departing=E.spawnEnemy('wasp',{pos:new P.V3(0,22,-301)});
P.enemyCombat.activeCount();assert(departing.retired);
const scoreBeforeDeparture=P.Game.score, killsBeforeDeparture=P.Game.kills;
let lastDeparture=departing.pos.z-P.Game.railZ;
for(let i=0;i<12*60 && E.enemies.includes(departing);i++) {
 P.Player.forwardSpeed=30;P.Game.railZ+=30/60;P.Player.pos.z=P.Game.railZ;
 E.updateEnemies(1/60);
 const separation=departing.pos.z-P.Game.railZ;
 assert(separation<lastDeparture,'retired pursuit keeps leaving even under brake');lastDeparture=separation;
}
assert(!E.enemies.includes(departing),'departed actors are returned to the pool beyond fog');
assert.equal(P.Game.score,scoreBeforeDeparture);assert.equal(P.Game.kills,killsBeforeDeparture);
// At most 28 actors may remain resident, even under cap pressure from deployments.
E.reset();for(let i=0;i<26;i++)E.spawnEnemy('mine',{pos:new P.V3(0,22,-400)});
const limitedCarrier=E.spawnEnemy('carrier',{pos:new P.V3(0,22,140)});limitedCarrier.t=6;
P.enemyCombat.update(limitedCarrier,.016,140);
assert.equal(E.enemies.length,27,'carrier cannot exceed the resident budget with two escorts');
E.reset();const closeTurret=E.spawnEnemy('turret',{pos:new P.V3(0,22,100)});closeTurret.fireT=0;
P.enemyCombat.update(closeTurret,.01,100);assert(closeTurret.attack);
P.enemyCombat.update(closeTurret,2,20);assert.equal(E.ebullets.length,0,'charging attack cancels at unsafe point-blank range');
console.log('Enemy checks passed: pursuit, shields, telegraphs, committed aim, carrier escorts, pause/briefing isolation, all stage decks, actor/projectile limits and pooled reset.');
console.log(stats);

E.reset();const distantDefault=P.spawnWorldEnemy('wasp',{pos:new P.V3(0,34,100)});
assert(distantDefault.arrival,'production spawn defaults to approach without an opt-in flag');
assert(distantDefault.pos.z-P.Game.railZ>700,'all ordinary production spawns start far away');
