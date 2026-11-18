// Judge Dean LLC — Optional narration lifecycle and caption regressions.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const source = fs.readFileSync(path.join(__dirname, '../src/p1d_voice.js'), 'utf8');
function setup(files = {}) {
  const audio = [], ducks = [], nodes = [];
  const node = () => { const n = { hidden: true, children: [], classList: { add() {}, remove() {} }, setAttribute() {}, appendChild(child) { this.children.push(child); }, textContent: '' }; nodes.push(n); return n; };
  const document = { hidden: false, head: node(), body: node(), getElementById: () => null, createElement: node };
  class FakeAudio {
    constructor(url) { this.src = url; this.paused = true; this.duration = 5; this.playCalls = 0; audio.push(this); }
    play() { this.paused = false; this.playCalls++; }
    pause() { this.paused = true; }
    removeAttribute() { this.src = ''; }
  }
  const P = { Game: { state: 'intro', epIndex: 0 }, Audio_: { muted: false, duck: n => ducks.push(n) },
    sound: { settings: { effects: .7, voice: 1 } }, world: { EPISODES: ['ep1','ep2','foundry','ep3','boss'].map(id => ({id})) } };
  vm.runInNewContext(source, { window: { __PF: P, __PF_VOICE_FILES: files, Audio: FakeAudio, document }, console });
  function tick(seconds) { for (let i = 0; i < Math.ceil(seconds * 60); i++) P.voice.update(1 / 60); }
  return { P, audio, ducks, document, tick, nodes };
}
{
  const { P, audio, tick } = setup();
  tick(8); assert.equal(P.voice.state().id, null, 'intro never consumes the timed line');
  P.Game.state = 'playing'; tick(4.4); assert.equal(P.voice.state().id, null);
  tick(.25); assert.equal(P.voice.state().id, 'opening'); assert.equal(audio.length, 0, 'missing asset creates no media request');
  assert.equal(P.voice.hasAudio, false); assert(P.voice.state().caption.includes('At eighty-nine'));
  tick(20); assert.equal(P.voice.state().id, null);
  tick(20); assert.equal(audio.length, 0);
}
{
  const ids = ['opening','salvage','foundry','citadel','victory'];
  const { P, audio, ducks, document, tick } = setup(Object.fromEntries(ids.map(id => [id, 'sound/voice-'+id+'.mp3'])));
  P.Game.state = 'playing'; tick(4.8);
  assert.equal(audio.length, 1); assert.equal(audio[0].playCalls, 1);
  assert.equal(audio[0].volume, .88, 'narration uses its own voice level');
  assert(ducks.length > 0 && ducks[0] < .1, 'music duck fades in instead of stepping to full attenuation');
  const elapsed = P.voice.state().elapsed;
  P.Game.state = 'paused'; tick(10); assert(audio[0].paused); assert.equal(P.voice.state().elapsed, elapsed);
  P.Game.state = 'playing'; tick(.1); assert.equal(audio[0].playCalls, 2, 'resume continues the same media element');
  P.Audio_.muted = true; tick(.1); assert(audio[0].muted, 'global mute applies to the voice');
  document.hidden = true; const hiddenTime = P.voice.state().elapsed; tick(3);
  assert(audio[0].paused); assert.equal(P.voice.state().elapsed, hiddenTime);
  document.hidden = false; P.Audio_.muted = false; tick(.1); assert(!audio[0].paused);
  for (let stage = 1; stage <= 3; stage++) {
    P.Game.epIndex = stage; tick(4.8); assert.equal(P.voice.state().id, ids[stage]);
  }
  P.Game.epIndex = 4; tick(.1); assert.equal(P.voice.state().id, null, 'boss entry clears the previous sector caption');
  P.Game.state = 'win'; tick(.6); assert.equal(P.voice.state().id, 'victory');
  assert.equal(audio.length, 5); assert.equal(audio.filter(a => !a.paused).length, 1, 'only one spoken line at a time');
  audio[4].onended(); tick(8); assert.equal(P.voice.state().id, null);
  tick(20); assert.equal(audio.length, 5, 'victory line does not repeat');
  P.voice.reset(); P.Game.epIndex = 0; P.Game.state = 'playing'; tick(4.8);
  assert.equal(audio.length, 6, 'fresh run can play the opening once again');
  P.Game.state = 'over'; tick(.1); assert(audio[5].paused); assert.equal(P.voice.state().id, null);
}
{
  const { P, audio, tick } = setup({ opening: 'sound/voice-opening.mp3' });
  P.Game.state = 'playing'; tick(4.8); audio[0].onerror();
  tick(.1); assert.equal(P.voice.state().hasAudio, false); assert(P.voice.state().caption.length > 0);
  tick(20); assert.equal(audio[0].playCalls, 1, 'unplayable media never enters a per-frame retry loop');
}
{
  const { P, tick } = setup(); let cardVisible = true;
  P.el = { card: { classList: { contains: () => cardVisible } } };
  P.Game.state = 'playing'; tick(8);
  assert.equal(P.voice.state().id, null, 'sector caption waits until the title card is gone');
  cardVisible = false; tick(.02); assert.equal(P.voice.state().id, 'opening');
  cardVisible = true; P.Game.state = 'win'; tick(.6);
  assert.equal(P.voice.state().id, 'victory', 'victory caption does not wait for a sector card');
}
{
  const { P, audio, tick, nodes } = setup({ opening: 'sound/voice-opening.mp3' });
  P.Game.state = 'playing'; tick(4.8);
  const caption = nodes.find(n => n.id === 'voice-caption');
  assert.equal(caption.children[0].textContent, 'AI PARODY VOICE · PARROT AI');
  P.sound.settings.effects = 0; tick(.01); assert.equal(audio[0].volume, .88, 'effects zero does not mute narration');
  P.sound.settings.voice = .3; tick(.01); assert.equal(audio[0].volume, .88 * .3);
  assert.equal(P.sound.settings.effects, 0, 'voice changes leave effects untouched');
  Object.defineProperty(audio[0], 'volume', { get: () => 1, set() {} });
  P.sound.settings.voice = 0; tick(.01);
  assert(audio[0].muted, 'zero remains silent where media volume is ignored');
  assert(!caption.hidden && caption.children[1].textContent.length > 0, 'voice zero retains captions');
  P.sound.settings.voice = 1; P.Audio_.muted = true; tick(.01); assert(audio[0].muted, 'master mute wins over voice volume');
  P.Audio_.muted = false; tick(.01); assert(!audio[0].muted, 'voice returns after global unmute');
}
// Existing pf-audio-v1 saves gain the new default without losing their mix.
const soundscape = fs.readFileSync(path.join(__dirname, '../src/p1c_soundscape.js'), 'utf8');
function mixer(saved, hasVoice) {
  const nodes = {}, store = { 'pf-audio-v1': saved };
  const document = { addEventListener() {}, getElementById(id) {
    if (!id.startsWith('audio-')) return null;
    return nodes[id] ||= { hidden: true, listeners: {}, addEventListener(type, cb) { this.listeners[type] = cb; } };
  } };
  const P = { Audio_: { started: false, init() {} }, setMusicMix() {} };
  vm.runInNewContext(soundscape, { window: { __PF: P, document,
    __PF_VOICE_FILES: hasVoice ? { opening: 'sound/voice-opening.mp3' } : {},
    localStorage: { getItem: key => store[key], setItem: (key, value) => { store[key] = value; } } } });
  return { P, nodes, store };
}
{
  const { P, nodes, store } = mixer('{"music":0.35,"effects":0.65,"ambience":0.2}', true);
  assert.equal(P.sound.settings.voice, 1); assert.equal(P.sound.settings.music, .35); assert.equal(P.sound.settings.effects, .65);
  assert.equal(nodes['audio-voice-row'].hidden, false); assert.equal(nodes['audio-voice-credit'].hidden, false);
  assert.equal(+nodes['audio-voice'].value, 100);
  nodes['audio-voice'].value = '42'; nodes['audio-voice'].listeners.input();
  const persisted = JSON.parse(store['pf-audio-v1']);
  assert.equal(persisted.voice, .42); assert.equal(persisted.effects, .65); assert.equal(persisted.music, .35);
  const restored = mixer(store['pf-audio-v1'], true); assert.equal(restored.P.sound.settings.voice, .42);
  assert.equal(+restored.nodes['audio-voice'].value, 42);
}
for (const saved of [null, '{broken', '{"voice":"0"}']) {
  const { P, nodes } = mixer(saved, false);
  assert.equal(P.sound.settings.voice, 1, 'missing or invalid saved voice values use default1');
  assert(nodes['audio-voice-row'].hidden && nodes['audio-voice-credit'].hidden, 'voice controls and credit stay hidden without files');
}
assert.equal(mixer('{"voice":0}', true).P.sound.settings.voice, 0, 'saved silence is preserved');
console.log('Voice checks passed: exact sector mapping, caption-only missing assets, single playback, music duck, mute/mix, pause/visibility, replay, victory and failure fallback.');
