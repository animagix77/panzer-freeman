// Audio graph/mixer lifecycle checks; actual Web Audio rendering has a browser probe.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const THREE = require('three');
const path = require('node:path');
class Param {
  constructor(v=0){this.value=v;}
  setTargetAtTime(v){assert(Number.isFinite(v));this.value=v;}
}
class Node {
  constructor(){for(const p of ['gain','frequency','Q','threshold','knee','ratio','attack','release','playbackRate','pan'])this[p]=new Param();this.connections=[];}
  connect(n){this.connections.push(n);return n;}
  disconnect(){this.connections=[];}
  start(){this.running=true;}
  stop(){this.running=false;if(this.onended)this.onended();}
}
function context(){return {sampleRate:44100,currentTime:0,destination:new Node(),
 createGain:()=>new Node(),createBiquadFilter:()=>new Node(),createBufferSource:()=>new Node(),createStereoPanner:()=>new Node(),createConvolver:()=>new Node(),createDynamicsCompressor:()=>new Node(),
 createBuffer(ch,n,rate){const channels=Array.from({length:ch},()=>new Float32Array(n));return{length:n,sampleRate:rate,getChannelData(i){return channels[i];}};}};}
const ctx=context(),store={};
const P={Game:{state:'playing',epIndex:0},Player:{pos:new THREE.Vector3(),camYaw:0,speedFactor:1,vy:0},Input:{lmb:false},Locks:{list:[]},world:{EPISODES:[{id:'ep1'},{id:'foundry'}]},setMusicMix(v){P.music=v;},Audio_:{started:false,muted:false,init(override){if(this.started&&!override)return;this.ctx=override||ctx;this.master=this.ctx.createGain();this.sfxGain=this.ctx.createGain();this.sfxGain.connect(this.master);this.started=true;}}};
const sandbox=vm.createContext({window:{__PF:P,localStorage:{getItem:k=>store[k]||null,setItem:(k,v)=>store[k]=v}}});
for(const f of ['p1b_audio.js','p1c_soundscape.js'])vm.runInContext(fs.readFileSync(path.join(__dirname,'../src',f),'utf8'),sandbox);
const A=P.Audio_;A.init();const loops=A.soundscape;A.init();assert.equal(A.soundscape,loops,'repeated gesture does not duplicate loops');
A.update();const cruise=loops.wind.gain.gain.value;
P.Player.speedFactor=1.65;ctx.currentTime+=.1;A.update();assert(loops.wind.gain.gain.value>cruise,'boost raises wind');
P.Input.lmb=true;P.Locks.list=[1,2,3];A.update();assert(loops.charge.gain.gain.value>0);
P.Game.epIndex=1;A.update();assert.equal(loops.world.filter.frequency.value,110,'foundry rumble');
P.Game.state='paused';A.update();for(const l of Object.values(loops))assert.equal(l.gain.gain.value,0,'pause fades loops');
P.Game.state='playing';P.sound.set('effects',0);assert.equal(A.sfxGain.gain.value,0);P.sound.set('effects',1);
P.sound.set('ambience',.25);assert.equal(A.ambienceBus.gain.value,.25);assert.equal(JSON.parse(store['pf-audio-v1']).ambience,.25);
P.sound.set('music',0);A.update();assert.equal(P.music,0);P.sound.set('music',.8);
A.effect('blast',.8);A.update();assert(P.music<.8,'heavy impacts duck music');for(let i=0;i<40;i++){ctx.currentTime+=.1;A.update();}assert(P.music>.79,'music recovers');
for(let i=0;i<80;i++){ctx.currentTime+=.2;A.effect('laser',.5,new THREE.Vector3(40,0,0));}assert.equal(A.voices.length,28,'effect voice cap');
A.voices.slice().forEach(v=>v.stop());assert.equal(A.voices.length,0,'finished sources release nodes');
A.muted=true;A.effect('laser',1);assert.equal(A.voices.length,0);A.muted=false;
for(const kind of ['wind','world','charge']){
 const b=P.sound.loopBuffer(ctx,kind);for(let ch=0;ch<2;ch++){const d=b.getChannelData(ch);let sum=0,maxJump=0;
 for(let i=0;i<d.length;i++){assert(Number.isFinite(d[i]));sum+=d[i]*d[i];if(i)maxJump=Math.max(maxJump,Math.abs(d[i]-d[i-1]));}
 assert(sum/d.length>.001,'audible loop');assert(Math.abs(d[0]-d.at(-1))<maxJump,'wrap does not introduce an outlier click');}
}
console.log('Audio checks passed: loop lifecycle, speed/charge/stage response, pause, independent saved levels, duck/recovery, 28-voice cap, cleanup, mute and seamless loop joins.');
// Exercise real streamed-music functions through overlapping cue changes.
const core=fs.readFileSync(path.join(__dirname,'../src/p1_core.js'),'utf8');
const musicCode=core.slice(core.indexOf('var MUSIC_FILES ='),core.indexOf('// ------------------------------------------------------------------ export'));
let fade;
const audio={started:true,muted:false};
class Media { constructor(src){this.src=src;this.paused=true;}addEventListener(){}play(){this.paused=false;return{then(ok){ok();}};}pause(){this.paused=true;} }
const music=vm.createContext({Audio_:audio,clamp:(v,a,b)=>Math.max(a,Math.min(b,v)),window:{Audio:Media,addEventListener(){},removeEventListener(){}},setInterval(fn){fade=fn;return 1;},clearInterval(){fade=null;}});
vm.runInContext(musicCode,music);
music.playMusic('ep1');while(fade)fade();music.playMusic('ep2');
music.setStreamMuted(true);assert(Object.values(music.streams).every(s=>s.muted),'mute includes the outgoing crossfade');
music.setStreamMuted(false);music.setMusicMix(0);assert(Object.values(music.streams).every(s=>s.muted),'zero music silences both crossfade cues');
music.setMusicMix(.5);while(fade)fade();assert.equal(music.curStream.volume,.24);assert(music.streams.ep1.paused,'outgoing cue releases playback');
console.log('Streamed music checks passed: crossfade mute, zero-volume silence, restoration and outgoing playback cleanup.');
