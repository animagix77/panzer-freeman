// Judge Dean LLC — Optional narration lifecycle and caption regressions.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const source = fs.readFileSync(path.join(__dirname, '../src/p1d_voice.js'), 'utf8');
function setup(files = {}, deferPlay = false) {
  const audio = [], ducks = [], nodes = [], pendingPlays = [];
  const node = () => { const n = { hidden: true, children: [], classList: { add() {}, remove() {} }, setAttribute() {}, appendChild(child) { this.children.push(child); }, textContent: '' }; nodes.push(n); return n; };
  const document = { hidden: false, head: node(), body: node(), getElementById: () => null, createElement: node };
  class FakeAudio {
    constructor(url) { this.src = url; this.paused = true; this.duration = 5; this.playCalls = 0; audio.push(this); }
    set src(value) { this.url = value; this.paused = true; }
    get src() { return this.url; }
    play() {
      this.paused = false; this.playCalls++;
      if (deferPlay) return { then(resolve, reject) { pendingPlays.push({ resolve, reject }); } };
    }
    pause() { this.paused = true; }
    removeAttribute() { this.src = ''; }
  }
  const P = { Game: { state: 'intro', epIndex: 0 }, Audio_: { muted: false, duck: n => ducks.push(n) },
    sound: { settings: { effects: .7, voice: 1 } }, world: { EPISODES: ['ep1','ep2','foundry','ep3','boss'].map(id => ({id})) } };
  vm.runInNewContext(source, { window: { __PF: P, __PF_VOICE_FILES: files, Audio: FakeAudio, document }, console });
  function tick(seconds) { for (let i = 0; i < Math.ceil(seconds * 60); i++) P.voice.update(1 / 60); }
  return { P, audio, ducks, document, tick, nodes, pendingPlays };
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
  assert.equal(P.voice.state().id, 'birthcertificate', 'ending caption does not wait for a sector card');
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
// Safari restricts playback to the player's launch gesture. Delayed callbacks
// from one recording must never stop the next recording on that same element.
{
  const { P, audio, pendingPlays, tick } = setup({ counter: 'counter.mp3', citadel: 'citadel.mp3', victory: 'victory.mp3' }, true);
  P.voice.arm();
  assert.equal(audio.length, 1); assert(audio[0].src.startsWith('data:audio/wav;'));
  pendingPlays[0].resolve(); P.voice.arm(); assert.equal(audio[0].playCalls, 1);
  P.voice.reset(); P.Game.state = 'playing'; P.Game.epIndex = 4; tick(.02);
  P.voice.react('counter'); tick(.02);
  const oldEnd = audio[0].onended, oldError = audio[0].onerror;
  assert.equal(audio[0].src, 'counter.mp3');
  P.Game.epIndex = 3; tick(4.8);
  oldEnd(); oldError(); pendingPlays[1].reject(new Error('obsolete'));
  assert.equal(audio.length, 1); assert.equal(audio[0].src, 'citadel.mp3');
  assert(!audio[0].paused && P.voice.state().hasAudio, 'an old error cannot stop the new sector clip');
  P.Game.state = 'win'; tick(.6); pendingPlays[2].resolve();
  assert.equal(audio[0].src, 'victory.mp3'); assert(!audio[0].paused, 'an old successful play cannot pause victory');
  P.Game.state = 'paused'; tick(.2); P.Game.state = 'win'; tick(.02);
  pendingPlays[3].reject({ name: 'AbortError' }); tick(.02);
  assert(P.voice.state().hasAudio && !audio[0].paused, 'a late pause interruption retries the same cue after resuming');
  assert.equal(audio.length, 1); assert.equal(audio[0].playCalls, 5);
  pendingPlays[4].resolve();
  const empty = setup(); empty.P.voice.arm(); assert.equal(empty.audio.length, 0, 'caption-only builds never prime an audio element');
}
// A direct salvage launch collects the trail during the sector introduction.
// The rider makes one pickup remark once the briefing has had room to land.
{
  const { P, audio, tick } = setup({ salvage: 'salvage.mp3', pickup: 'pickup.mp3' });
  P.Game.state = 'playing'; P.Game.epIndex = 1; tick(.05);
  for (let orb = 0; orb < 6; orb++) P.voice.react('pickup');
  tick(4.65); assert.equal(P.voice.state().id, 'salvage');
  tick(6.1); assert.equal(P.voice.state().id, null);
  tick(1.65); assert.equal(P.voice.state().id, null, 'leave a gap after the briefing');
  tick(.4); assert.equal(P.voice.state().id, 'pickup');
  assert.equal(audio[1].src, 'pickup.mp3');
  tick(7); P.voice.react('pickup'); tick(20);
  assert.equal(audio.length, 2, 'repeated pickups produce one reaction per flight');
}
{
  const { P, audio, tick } = setup({ opening: 'opening.mp3', pickup: 'pickup.mp3' });
  P.Game.state = 'playing'; tick(4.8);
  assert.equal(P.voice.state().id, 'opening');
  P.voice.react('pickup'); tick(8.5);
  assert.equal(P.voice.state().id, 'pickup', 'one orb during active narration still earns the joke');
  assert.equal(audio[1].src, 'pickup.mp3');
}
{
  const ids = ['counter', 'chargebreak', 'gates', 'pickup', 'streak'];
  const { P, audio, document, tick } = setup(Object.fromEntries(ids.map(id => [id, id + '.mp3'])));
  P.Game.state = 'playing'; P.Game.epIndex = 4; tick(.02);
  for (const id of ['pickup', 'streak', 'chargebreak', 'gates', 'pickup']) P.voice.react(id);
  tick(.02); assert.equal(P.voice.state().id, 'gates', 'a simultaneous gate completion takes priority');
  tick(6.1); P.voice.react('counter'); tick(.7);
  assert.equal(P.voice.state().id, null, 'leave breathing room even for a special maneuver');
  P.Game.state = 'paused'; tick(30); P.voice.react('gates');
  P.Game.state = 'playing'; tick(.7); assert.equal(P.voice.state().id, 'counter', 'a counter answers promptly after resuming');
  P.voice.react('streak'); tick(15); assert.equal(audio.length, 2, 'stale reactions expire');
  P.voice.react('streak'); tick(.02); assert.equal(P.voice.state().id, 'streak', 'a fresh streak can be earned');
  P.voice.react('chargebreak'); P.Game.epIndex = 3; tick(4.7);
  assert.equal(P.voice.state().id, 'citadel', 'sector handover preempts combat commentary');
  tick(20); assert.equal(audio.length, 3, 'combat reactions stay with their sector');
  document.hidden = true; P.voice.react('chargebreak'); document.hidden = false; tick(.02);
  assert.equal(P.voice.state().id, null);
  P.voice.react('chargebreak'); tick(.02); assert.equal(P.voice.state().id, 'chargebreak');
  P.Game.state = 'win'; tick(.6); assert.equal(P.voice.state().id, 'birthcertificate');
  assert(audio[3].paused, 'victory stops the reaction clip');
  P.voice.reset(); P.Game.state = 'playing'; P.Game.epIndex = 4; tick(.02);
  P.voice.react('counter'); tick(.02); assert.equal(P.voice.state().id, 'counter', 'a new flight resets reactions');
}
{
  const { P, document, nodes, tick } = setup();
  P.Game.state = 'playing'; P.Game.epIndex = 4; tick(.02);
  P.Game.cinematic = true; P.voice.react('pickup'); P.Game.cinematic = false; tick(.02);
  P.Game.ending = true; P.voice.react('counter'); P.Game.ending = false; tick(.02);
  assert.equal(P.voice.state().id, null, 'camera flights and ending shots do not queue remarks');
  P.voice.react('chargebreak'); tick(.02);
  const caption = nodes.find(n => n.id === 'voice-caption');
  assert.equal(caption.children[0].textContent, 'THE RIDER');
  assert.equal(caption.children[1].textContent, P.voice.lines.chargebreak, 'missing event audio is still captioned');
  document.hidden = true; tick(.2); assert(caption.hidden);
}
// A whole volley can arrive before the next voice update. Give the rare earned
// event the floor. Hearing a line consumes it, losing an arbitration does not.
{
  const { P, tick } = setup();
  P.Game.state = 'playing'; P.Game.epIndex = 4; tick(.02);
  P.voice.react('boost'); tick(.18); P.voice.react('wasp'); tick(.1);
  P.voice.react('momlock'); P.voice.react('pickup'); tick(.02);
  assert.equal(P.voice.state().id, 'momlock', 'a heavy lock wins over the kill and boost on approach');
  tick(18); P.voice.react('momlock'); P.voice.react('wasp'); tick(.5);
  assert.equal(P.voice.state().id, 'wasp', 'a later scout earns the line that lost the first arbitration');
  tick(5.1); P.voice.react('brake'); tick(3);
  assert.equal(P.voice.state().id, null, 'routine controls leave a gap after combat and expire promptly');
  tick(4); P.voice.react('brake'); tick(.5); assert.equal(P.voice.state().id, 'brake');
  P.voice.react('foundryKill'); tick(15);
  assert.equal(P.voice.state().id, null, 'a carrier from before a long recording never gets a stale punch line');
  P.voice.react('foundryKill'); tick(.02); assert.equal(P.voice.state().id, 'momcarrier');
}
// Replaying the very same short route discovers another take. In one flight,
// a third equivalent event cannot repeat either take. Muted games retain both.
{
  const { P, tick } = setup();
  P.Game.state = 'playing'; P.Game.epIndex = 4;
  for (const [event, takes] of [['streak', ['streak','hotstreak']], ['foundryKill', ['momcarrier','carrier']],
    ['gates', ['momgates','gates']], ['pickup', ['momorb','pickup']], ['counter', ['counter','momreturn']],
    ['bomber', ['mombomber','bomber']], ['core', ['momclock','core']]]) {
    for (const take of takes) {
      P.voice.reset(); tick(.02); P.voice.react(event); tick(.5);
      assert.equal(P.voice.state().id, take);
    }
    tick(15); P.voice.react(event); tick(.5); assert.equal(P.voice.state().id, takes[0]);
    tick(15); assert.equal(P.voice.react(event), false);
  }
}
// The repeated opening of the seven mom jokes needs room between deliveries.
// A real achievement inside that window can still get its other recording.
{
  const files = Object.fromEntries(['momlock','gates','momgates','momclock','core'].map(id => [id,id+'.mp3']));
  const { P, audio, tick } = setup(files);
  P.Game.state = 'playing'; P.Game.epIndex = 4; tick(.02);
  P.voice.react('momlock'); tick(.02); tick(10);
  P.Game.state = 'paused'; tick(60); P.Game.state = 'playing';
  P.voice.react('gates'); tick(.02);
  assert.equal(P.voice.state().id, 'gates', 'paused time cannot unlock consecutive mom jokes');
  tick(16); P.voice.react('core'); tick(.02);
  assert.equal(P.voice.state().id, 'momclock');
  assert.deepEqual(audio.map(clip => clip.src), ['', '', 'momclock.mp3']);
}
// The portrait and numerical age get a quiet beat. Only the visible reveal
// starts playback. Fast forwarding and replaying follow the same rule.
for (const [files, expected] of [
  [{ birthcertificate:'new.mp3', victory:'old.mp3', core:'core.mp3' }, 'birthcertificate'],
  [{ victory:'old.mp3', core:'core.mp3' }, 'victory'], [{}, 'birthcertificate']
]) {
  const { P, audio, nodes, tick } = setup(files);
  P.Game.state = 'playing'; P.Game.epIndex = 4; tick(.02);
  P.voice.react('core'); tick(.1); assert(P.voice.isSpeaking());
  P.Game.ending = true; P.Game.victoryRevealed = false; tick(.02);
  const count = audio.length;
  assert.equal(P.voice.state().id, null, 'combat speech stops as the finale begins');
  P.Game.state = 'win'; tick(3); assert.equal(audio.length, count);
  assert.equal(P.voice.state().id, null, 'no punch line over the age reveal');
  P.Game.victoryRevealed = true; tick(.02);
  assert.equal(P.voice.state().id, expected); assert.equal(P.voice.state().hasAudio, !!files[expected]);
  assert.equal(nodes.find(n => n.id === 'voice-caption').hidden, expected === 'birthcertificate',
    'the authored card supplies the new line while the optional legacy recording retains its own caption');
  const after = audio.length;
  tick(20); assert.equal(audio.length, after); assert.equal(P.voice.state().id, null);
  P.voice.reset(); P.Game.victoryRevealed = false; tick(.02);
  P.Game.victoryRevealed = true; tick(.02); assert.equal(P.voice.state().id, expected);
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
console.log('Voice checks passed: sector and action cues, event priority and expiry, quiet intervals, single playback, captions, mix, pause, replay and victory.');
