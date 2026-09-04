const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const THREE = require('three');
const {flight} = require('./check-motion');
const {P,context}=flight();
for(const f of ['p3_world.js','p3c_horizon.js'])vm.runInContext(fs.readFileSync(path.join(__dirname,'../src',f),'utf8'),context);
P.skyUni={cHi:{value:new THREE.Color(0x33195e)}};
const terrain=new P.world.Terrain(),props=new P.world.PropField();
for(const ep of P.world.EPISODES) {
 P.scene.fog=new THREE.Fog(ep.fog.col,ep.fog.near,ep.fog.far);
 terrain.configure(ep.terrain,0);props.configure(ep.props,-200);
 const n=props.items.length;
 for(let z=0;z<5500;z+=37) {
  const before=terrain.chunks.map(c=>c.z),oldProps=new Map(props.items.map(it=>[it.obj,it.z]));
  terrain.update(z);props.update(z);
  const chunks=terrain.chunks.map(c=>c.z).sort((a,b)=>a-b);
  assert(chunks[0]<z-1000 && chunks.at(-1)+terrain.D>z+1000,'terrain extends beyond the fog in both travel directions');
  chunks.forEach((v,i)=>{if(i)assert.equal(v-chunks[i-1],terrain.D,'seamless consecutive chunks');});
  terrain.chunks.forEach((c,i)=>{if(c.z!==before[i])assert(z-before[i]-terrain.D>1000,'recycling concealed behind fog');});
  assert.equal(props.items.length,n,'bounded prop pool');
  props.items.forEach(it=>{if(it.z!==oldProps.get(it.obj))assert(z-oldProps.get(it.obj)>1000,'props recycle out of sight');});
 }
 // Strong fog must conceal the outer terrain even in wide side views.
 assert((terrain.W/2-110)*.70>ep.fog.far);
 P.Game.railZ=5500;P.horizon.update();
 for(const layer of P.horizon.layers){assert.equal(layer.position.z,5500);assert(layer.material.depthTest,'foreground occludes distant ridges');}
}
props.clear();
const E=P.entities;E.reset();P.Game.railZ=0;P.Game.age=70;P.Player.pos.set(0,22,0);
for(const offset of [new P.V3(15,0,0),new P.V3(0,15,0),new P.V3(0,0,17)]) {
 const score=P.Game.score;E.spawnOrb(P.Player.pos.clone().add(offset),true);E.updateProjectiles(1/60);
 assert.equal(E.orbs.length,0,'nearby orb collects without touching its mesh');assert.equal(P.Game.score,score+250);
 E.updateProjectiles(1/60);assert.equal(P.Game.score,score+250,'pickup awards once');
}
E.spawnOrb(new P.V3(80,22,0),true);E.orbs[0].v.set(0,0,0);E.updateProjectiles(1/60);
assert(E.orbs[0].v.x<0,'distant orb attracted from 80 units away');
E.reset();E.spawnOrb(new P.V3(110,22,0),true);E.orbs[0].v.set(0,0,0);E.updateProjectiles(1/60);assert.equal(E.orbs[0].v.x,0,'magnet remains bounded');
console.log('Visibility/pickup checks passed: continuous terrain, hidden recycling, bounded props, side-view coverage, occluded horizon layers, broad proximity pickup and stronger bounded magnet.');
