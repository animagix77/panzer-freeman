/* Continuous flight sound and user-adjustable mixing. No per-frame audio nodes. */
(function () {
'use strict';
var P = window.__PF, A = P.Audio_, init = A.init;
var settings = { music: .8, effects: 1, ambience: .6 };
try {
  var saved = JSON.parse(window.localStorage.getItem('pf-audio-v1') || '{}');
  Object.keys(settings).forEach(function (k) { if (typeof saved[k] === 'number' && isFinite(saved[k])) settings[k] = Math.max(0, Math.min(1, saved[k])); });
} catch (e) {}
if (P.setMusicMix) P.setMusicMix(settings.music);
var duck = 0, lastTime = 0;
// Crossfade the tail of generated noise into its beginning for seamless looping.
function loopBuffer(ctx, kind) {
  var n = Math.round(ctx.sampleRate * 3), fade = Math.round(ctx.sampleRate * .12);
  var b = ctx.createBuffer(2, n, ctx.sampleRate);
  for (var ch = 0; ch < 2; ch++) {
    var raw = new Float32Array(n + fade), low = 0, seed = 391 + ch * 811;
    for (var i = 0; i < raw.length; i++) {
      seed = (Math.imul(seed, 1664525) + 1013904223) | 0;
      var t = i / ctx.sampleRate, noise = (seed >>> 0) / 2147483648 - 1;
      low += (noise - low) * (1 - Math.exp(-2 * Math.PI * 1800 / ctx.sampleRate));
      raw[i] = kind === 'charge' ? .22 * Math.sin(2 * Math.PI * 120 * t) + .09 * Math.sin(2 * Math.PI * 361 * t) + low * .16 : low * 1.5;
      if (kind === 'world') raw[i] += .055 * Math.sin(2 * Math.PI * 60 * t) + .03 * Math.sin(2 * Math.PI * 91 * t);
    }
    var out = b.getChannelData(ch);
    for (i = 0; i < n; i++) {
      var f = Math.min(1, i / fade);
      out[i] = i < fade ? raw[n + i] * (1 - f) + raw[i] * f : raw[i];
    }
  }
  return b;
}
A.init = function (override) {
  var previous = this.ctx;
  init.call(this, override);
  if (!this.started || (previous === this.ctx && this.soundscape)) return;
  if (this.soundscape) Object.keys(this.soundscape).forEach(function (k) { var l = A.soundscape[k]; l.source.stop(); l.source.disconnect(); l.filter.disconnect(); l.gain.disconnect(); });
  var ctx = this.ctx;
  this.ambienceBus = ctx.createGain(); this.ambienceBus.gain.value = settings.ambience; this.ambienceBus.connect(this.master);
  this.soundscape = {};
  ['wind', 'world', 'charge'].forEach(function (kind) {
    var source = ctx.createBufferSource(), filter = ctx.createBiquadFilter(), gain = ctx.createGain();
    source.buffer = loopBuffer(ctx, kind); source.loop = true;
    filter.type = kind === 'charge' ? 'lowpass' : 'bandpass'; filter.frequency.value = 600; filter.Q.value = .55;
    gain.gain.value = 0; source.connect(filter); filter.connect(gain); gain.connect(kind === 'charge' ? A.sfxGain : A.ambienceBus);
    source.start(); A.soundscape[kind] = { source: source, filter: filter, gain: gain };
  });
  this.sfxGain.gain.value = .95 * settings.effects;
  lastTime = ctx.currentTime;
};
A.duck = function (amount) { duck = Math.max(duck, amount); };
function target(param, value, now, speed) { param.setTargetAtTime(value, now, speed || .14); }
A.update = function () {
  if (!this.started || !this.soundscape) return;
  var now = this.ctx.currentTime, dt = Math.min(.1, Math.max(0, now - lastTime)); lastTime = now;
  duck *= Math.exp(-dt * 3.5);
  var state = P.Game ? P.Game.state : 'title';
  var visible = !window.document || !window.document.hidden;
  var flying = visible && (state === 'playing' || state === 'intro');
  var player = P.Player || {}, speed = player.speedFactor || 1;
  var ep = P.world && P.Game ? P.world.EPISODES[P.Game.epIndex] : null, id = ep ? ep.id : '';
  var wind = this.soundscape.wind, world = this.soundscape.world, charge = this.soundscape.charge;
  target(wind.gain.gain, flying ? .11 + Math.max(0, speed - .6) * .14 + Math.min(1, Math.abs(player.vy || 0) / 50) * .055 : 0, now);
  target(wind.filter.frequency, 240 + speed * 390, now, .3);
  target(wind.source.playbackRate, .8 + speed * .18, now, .3);
  var foundry = id === 'foundry' || id === 'boss', rain = id === 'ep2';
  target(world.filter.frequency, foundry ? 110 : rain ? 2300 : 420, now, .7);
  target(world.gain.gain, flying ? (foundry ? .27 : rain ? .17 : .045) : 0, now, .6);
  var locks = P.Locks ? P.Locks.list.length : 0;
  target(charge.gain.gain, flying && P.Input && P.Input.lmb && locks > 0 ? .065 + Math.min(locks, 12) * .006 : 0, now, .045);
  target(charge.source.playbackRate, 1 + Math.min(locks, 16) * .045, now, .1);
  target(charge.filter.frequency, 700 + locks * 100, now, .1);
  if (this.reverbWet) target(this.reverbWet.gain, id === 'ep3' || id === 'boss' ? .2 : rain ? .13 : .085, now, .7);
  if (P.setMusicMix) P.setMusicMix(settings.music * (state === 'paused' ? .6 : 1) * (1 - duck));
};
P.sound = {
  settings: settings,
  set: function (key, value) {
    if (!Object.prototype.hasOwnProperty.call(settings, key) || !isFinite(value)) return;
    settings[key] = Math.max(0, Math.min(1, +value));
    if (A.started) {
      target(A.sfxGain.gain, .95 * settings.effects, A.ctx.currentTime, .035);
      if (A.ambienceBus) target(A.ambienceBus.gain, settings.ambience, A.ctx.currentTime, .035);
    }
    if (P.setMusicMix) P.setMusicMix(settings.music * (1 - duck));
    try { window.localStorage.setItem('pf-audio-v1', JSON.stringify(settings)); } catch (e) {}
  },
  reset: function () { duck = 0; },
  loopBuffer: loopBuffer
};
if (window.document) {
  Object.keys(settings).forEach(function (key) {
    var slider = window.document.getElementById('audio-' + key), output = window.document.getElementById('audio-' + key + '-value');
    if (!slider) return;
    slider.value = Math.round(settings[key] * 100); output.textContent = slider.value + '%';
    slider.addEventListener('input', function () { P.sound.set(key, +slider.value / 100); output.textContent = slider.value + '%'; });
  });
  ['laser', 'blast', 'wing'].forEach(function (name) {
    var button = window.document.getElementById('test-' + name);
    if (button) button.addEventListener('click', function () { P.armAudio(); A.effect(name, name === 'wing' ? .35 : .7); });
  });
  window.document.addEventListener('visibilitychange', function () {
    if (!window.document.hidden || !A.soundscape) return;
    Object.keys(A.soundscape).forEach(function (k) { target(A.soundscape[k].gain.gain, 0, A.ctx.currentTime, .03); });
  });
}
})();
