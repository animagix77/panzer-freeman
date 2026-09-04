// Integration checks for the real flight, campaign, world, VFX and audio code.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const THREE = require('three');
const {flight} = require('./check-motion');
const {P, context} = flight();
function load(f) { vm.runInContext(fs.readFileSync(path.join(__dirname, '../src', f), 'utf8'), context); }
load('p3_world.js'); load('p4c_effects.js'); load('p4d_campaign.js');
P.Game.epIndex = 0; P.Game.epStartZ = 0; P.Game.railZ = 0;
function tick(seconds) { for(let i=0;i<Math.ceil(seconds*60);i++){P.Game.time+=1/60;P.entities.updatePlayer(1/60);} }
P.Input.keys = {shift:true}; tick(2);
assert(P.Game.railZ > 160, 'boost must increase distance travelled');
assert(P.Player.energy < 34 && P.Player.energy > 30, 'boost consumes power');
tick(1.1); assert(!P.Player.boosting, 'exhaustion cuts off boost');
P.Input.keys={};tick(2);assert(P.Player.energy>30, 'rest recharges');
P.Input.keys={x:true};tick(1);assert(P.Player.speedFactor<.57, 'air brake slows rail travel');
P.Input.keys={a:true};P.Player.energy=100;assert(P.flight.roll());assert(!P.flight.roll(), 'roll cooldown prevents repeats');
tick(.15); const age=P.Game.age;P.damagePlayer(1);assert.equal(P.Game.age,age,'roll middle window evades damage');
tick(.6);assert.equal(P.Player.rollT,0);assert.equal(P.dragon.root.rotation.z,0,'roll returns to upright');
P.flight.reset();assert.equal(P.Player.energy,100);assert.equal(P.Player.rollCD,0);
// Carrier damage depends on positioning and preserves normal frontal damage.
let carrier=P.entities.spawnEnemy('carrier',{pos:new P.V3(0,22,120)});carrier.hp=20;
P.Player.x=0;P.Player.pos.set(0,22,0);P.entities.hurtEnemy(carrier,1);assert.equal(carrier.hp,19);
P.Player.x=40;P.entities.hurtEnemy(carrier,1);assert.equal(carrier.hp,17);
P.Player.x=0;P.Player.pos.y=50;P.entities.hurtEnemy(carrier,1);assert.equal(carrier.hp,15);
P.entities.reset();
// Every stage's authored formations must remain finite after AI runs.
assert.equal(P.world.EPISODES.length,5);
for(let ei=0;ei<4;ei++){
 const ep=P.world.EPISODES[ei];P.Game.epIndex=ei;P.Game.epStartZ=0;P.Game.railZ=0;P.Player.railY=ep.railY;P.Player.pos.set(0,ep.railY,0);P.campaign.enter(ep);
 for(const z of [1500,3600,4600,5800]){P.Game.railZ=z;P.campaign.update(1/60);P.entities.updateEnemies(1/60);}
 for(const e of P.entities.enemies) assert([e.pos.x,e.pos.y,e.pos.z].every(Number.isFinite), ep.id+' formation position');
 P.entities.reset();
}
// Both real canyon passages have clearance beneath the central mesa.
assert(P.world.hCanyon(0,5000)>60);
assert(P.world.hCanyon(-54,5000)<24 && P.world.hCanyon(54,5000)<24);
P.Game.epIndex=0;P.Game.epStartZ=0;P.Game.railZ=4600;P.Player.pos.set(54,30,4600);P.Player.x=54;P.campaign.enter(P.world.EPISODES[0]);
const score=P.Game.score;P.Player.pos.z=4710;P.Game.railZ=4710;P.campaign.update(.05);
assert.equal(P.Game.score,score+350,'swept gate crossing awards score');P.campaign.update(.05);assert.equal(P.Game.score,score+350,'gate cannot award twice');
P.entities.reset();P.Game.epIndex=2;P.Game.epStartZ=0;P.Game.railZ=0;P.campaign.enter(P.world.EPISODES[2]);P.Game.railZ=800;P.campaign.update(.016);
const convoy=P.entities.enemies.filter(e=>e.tag==='foundry-convoy');assert.equal(convoy.length,3);
const before=P.Game.score;convoy.forEach(e=>P.entities.killEnemy(e,true));assert(P.Game.score>=before+2000,'completed convoy pays mission reward');
for(const ei of [3,4]){
 const ep=P.world.EPISODES[ei];assert(ep.terrain,'citadel and boss arena have physical terrain');
 for(const z of [0,275,900,1700]){const o=ep.props.make();ep.props.place(o,z);assert.equal(o.position.y,ep.terrain.h(o.position.x,z),'fortress placed at terrain surface');}
}
for(let i=0;i<100;i++)P.fx.burst(new P.V3(0,0,0),3,0xffaa44,false);
assert.equal(P.fx.stats().active,40);assert.equal(P.fx.stats().lights,3);P.fx.update(2);assert.equal(P.fx.stats().active,0);P.fx.reset();
// Audio bank is finite, bounded, non-silent, varied, and zero-ended at both common rates.
const audioP={Audio_:{init(){}}};vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../src/p1b_audio.js'),'utf8'),{window:{__PF:audioP}});
for(const rate of [44100,48000])for(const name of ['laser','gun','impact','blast','hit','lock','orb','view','warn','boost','roll']){
 const a=audioP.Audio_.renderEffect(name,rate,0),b=audioP.Audio_.renderEffect(name,rate,1);
 assert.equal(a[0],0);assert.equal(a.at(-1),0);let peak=0,sum=0;
 for(const n of a){assert(Number.isFinite(n));peak=Math.max(peak,Math.abs(n));sum+=n*n;}
 assert(peak<=.901 && peak>.05,name+' bounded peak');assert(sum/a.length>.0001,name+' audible energy');
 if(name==='laser')assert(a.some((n,i)=>n!==b[i]),'laser variants differ');
}
console.log('Upgrade checks passed: power, boost/brake, roll evasion/recovery, flanking, all authored formations, route rewards, convoy objective, grounded citadels, bounded FX and 44.1/48 kHz audio.');
