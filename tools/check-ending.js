// Judge Dean LLC — drive the production win screen and its camera without a display or audio.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const THREE = require('three');
const { flight } = require('./check-motion');

const { P, context } = flight(['p3_world.js']);
const ui = fs.readFileSync(path.join(__dirname, '../src/shell.html'), 'utf8');
const nodes = {}, windowEvents = {};
function noop() {}
function element() {
  return { style: {}, selectedIndex: 0, hidden: false, textContent: '', events: {},
    classList: { add: noop, remove: noop }, closest() { return this; }, appendChild: noop,
    addEventListener(type, callback) { this.events[type] = callback; }, focus() { document.activeElement = this; } };
}
for (const match of ui.matchAll(/\bid="([^"]+)"/g)) nodes[match[1]] = element();
const document = {
  getElementById(id) { assert(nodes[id], 'missing game element ' + id); return nodes[id]; },
  createElement: element, querySelectorAll: () => [], hidden: false
};
const shell = ['title','card','over','win','flash','skip','toast','quip','pause'];
P.el = Object.fromEntries(shell.map(id => [id, nodes[{ pause: 'pausebox', skip: 'skiphint' }[id] || id]]));
Object.assign(P, {
  HUD: { w: 1280, h: 720 }, hudCanvas: nodes.hud, hx: { clearRect: noop },
  renderer: { compile: noop, setClearColor: noop, render: noop }, resize: noop, castAll: noop,
  trackShadow: noop, shadowsOn: () => false, setSunDir: noop, opening: { reset: noop },
  ambLight: new THREE.Light(), keyLight: new THREE.Light(), rimLight: new THREE.Light(),
  armAudio: noop, playMusic: noop
});
for (const type of ['Terrain','PropField']) P.world[type] = class { configure() {} update() {} };
P.scene.fog = new THREE.Fog(0, 1, 900);
P.skyUni = {};
for (const name of ['cLo','cMid','cHi','sunCol']) P.skyUni[name] = { value: new THREE.Color() };
P.skyUni.sunDir = { value: new THREE.Vector3() };
for (const name of ['sunSize','bands','shaftAmt','shaftT']) P.skyUni[name] = { value: 0 };
P.entities.prewarm = noop;
context.document = document;
context.window.addEventListener = (name, fn) => { windowEvents[name] = fn; };
context.window.__PF_VOICE_FILES = { birthcertificate: 'voice-birthcertificate.mp3' };
let nextFrame, now = 0;
context.requestAnimationFrame = callback => { nextFrame = callback; };
vm.runInContext(fs.readFileSync(path.join(__dirname, '../src/p5_hud_loop.js'), 'utf8'), context);

function advance(seconds) {
  for (let i = 0; i < Math.ceil(seconds * 60); i++) nextFrame(now += 1000 / 60);
}
function finishBoss(age) {
  P.Game.state = 'playing'; P.Game.age = age;
  P.entities.bossStart(); P.Boss.dead = true; P.Boss.deathT = .005;
  P.entities.updateBoss(1 / 60);
  assert.equal(P.Game.state, 'win');
  assert.equal(P.Game.age, 24, 'the Fountain grants actual youth');
  assert.equal(String(nodes.winAge.textContent), '89', 'the recap starts at takeoff age');
  assert(nodes.winText.hidden && nodes.winReveal.hidden && nodes.winPunch.hidden && nodes.winActions.hidden);
}
finishBoss(77);
assert.match(nodes.winStats.innerHTML, /SURVIVED.*AGE BEFORE FOUNTAIN <b>73\.0/);
advance(2); assert.equal(String(nodes.winAge.textContent), '24'); assert(nodes.winText.hidden);
advance(.8); assert(!nodes.winText.hidden); assert(!P.Game.victoryRevealed);
advance(1.7); assert(P.Game.victoryRevealed && !nodes.winReveal.hidden);
assert(nodes.winPunch.hidden && nodes.winActions.hidden && !nodes.skipEnding.hidden);
advance(2.3); assert(!nodes.winPunch.hidden && !nodes.winActions.hidden && nodes.skipEnding.hidden);
for (const [width,height] of [[1280,720], [390,844]]) {
  P.HUD.w = width; P.HUD.h = height; P.camera.aspect = width / height; P.camera.updateProjectionMatrix();
  advance(.02); P.camera.updateMatrixWorld();
  const face = P.dragon.headR.getWorldPosition(new THREE.Vector3()).project(P.camera);
  assert(width > height ? face.x > .35 && face.x < .65 : Math.abs(face.x) < .06 && face.y > .2 && face.y < .5,
    'the rider stays beside the story on desktop and above it on a phone');
}
nodes.winBtn.events.click();
assert(!P.Game.victoryRevealed); assert.equal(P.Game.age, 89, 'replay restores the old rider');
finishBoss(24);
assert.match(nodes.winStats.innerHTML, /REBORN.*AGE BEFORE FOUNTAIN <b>24\.0/);
nodes.skipEnding.events.click(); assert(P.Game.victoryRevealed && !nodes.winPunch.hidden);
nodes.winBtn.events.click(); finishBoss(88);
advance(4.6); assert(nodes.winPunch.hidden);
windowEvents.keydown({ key: 'Escape', preventDefault: noop, target: nodes.skipEnding });
assert(!nodes.winPunch.hidden && String(nodes.winAge.textContent) === '24', 'skip works in the mid-sentence pause');
console.log('Ending checks passed: earned ranks, Fountain age, face framing, timed joke, replay and skip.');
