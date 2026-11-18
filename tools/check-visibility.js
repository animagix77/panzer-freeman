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
// Stage art changes shading and the skyline while retaining collision and pools.
const chunkGeometries = terrain.chunks.map(c=>c.geo), skylineGeometry=P.horizon.layers.map(l=>l.geometry);
const sceneObjects=P.scene.children.length, profiles=[];
for(let stage=0;stage<P.world.EPISODES.length;stage++) {
 const ep=P.world.EPISODES[stage];P.Game.epIndex=stage;
 P.scene.fog=new THREE.Fog(ep.fog.col,ep.fog.near,ep.fog.far);terrain.configure(ep.terrain,0);
 P.Game.time+=.5;terrain.update(0);
 assert.equal(terrain.chunks[0].mat.userData.terrainArt.terrainStyle.value,ep.terrain.surface||0);
 assert.equal(terrain.chunks[0].mat.userData.terrainArt.terrainTime.value,P.Game.time);
 assert.equal(terrain.heightAt(54,4800),ep.terrain.h(54,4800),'surface art leaves collision heights unchanged');
 const shader={uniforms:{},vertexShader:THREE.ShaderLib.phong.vertexShader,fragmentShader:THREE.ShaderLib.phong.fragmentShader};
 terrain.chunks[0].mat.onBeforeCompile(shader);
 assert(shader.vertexShader.includes('terrainWorld=(modelMatrix*vec4(transformed,1.0)).xyz;'));
 assert(shader.fragmentShader.includes('totalEmissiveRadiance+=vec3(1.0,.16,.018)'));
 for(let frame=0;frame<180;frame++){P.Game.time+=1/60;P.horizon.update();}
 profiles.push(Array.from(P.horizon.layers[0].geometry.attributes.position.array));
 P.horizon.layers.forEach((layer,i)=>{assert.equal(layer.geometry,skylineGeometry[i]);assert(layer.geometry.attributes.position.array.every(Number.isFinite));});
 terrain.chunks.forEach((chunk,i)=>assert.equal(chunk.geo,chunkGeometries[i]));
 assert.equal(P.scene.children.length,sceneObjects,'stage changes reuse all horizon and celestial objects');
 if(ep.id==='ep3')assert(P.horizon.celestial.every(o=>o.visible),'citadel has a visible ringed moon');
}
for(let stage=1;stage<4;stage++)assert(profiles[stage].some((v,i)=>Math.abs(v-profiles[stage-1][i])>30),'stages have distinct skyline profiles');
P.Game.epIndex=0;P.Game.time+=1/60;
const beforeProfile=Array.from(P.horizon.layers[0].geometry.attributes.position.array);P.horizon.update();
assert(beforeProfile.every((v,i)=>Math.abs(v-P.horizon.layers[0].geometry.attributes.position.array[i])<20),'skyline transitions ease instead of popping');
for(let frame=0;frame<240;frame++){P.Game.time+=1/60;P.horizon.update();}
assert(P.horizon.celestial.every(o=>!o.visible),'celestial layer fades away outside the mountain stages');
const E=P.entities;E.reset();P.Game.railZ=0;P.Game.age=70;P.Player.pos.set(0,22,0);
for(const offset of [new P.V3(15,0,0),new P.V3(0,15,0),new P.V3(0,0,17)]) {
 const score=P.Game.score;E.spawnOrb(P.Player.pos.clone().add(offset),true);E.updateProjectiles(1/60);
 assert.equal(E.orbs.length,0,'nearby orb collects without touching its mesh');assert.equal(P.Game.score,score+250);
 E.updateProjectiles(1/60);assert.equal(P.Game.score,score+250,'pickup awards once');
}
E.spawnOrb(new P.V3(80,22,0),true);E.orbs[0].v.set(0,0,0);E.updateProjectiles(1/60);
assert(E.orbs[0].v.x<0,'distant orb attracted from 80 units away');
E.reset();E.spawnOrb(new P.V3(110,22,0),true);E.orbs[0].v.set(0,0,0);E.updateProjectiles(1/60);assert.equal(E.orbs[0].v.x,0,'magnet remains bounded');
console.log('Visibility/pickup checks passed: continuous terrain, hidden recycling, fixed world-art geometry, distinct smoothly changing skylines, surface shader hooks, celestial transitions, broad pickup and bounded magnet.');
