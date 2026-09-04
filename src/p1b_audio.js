/* Layered, original sound effects, rendered once into reusable PCM buffers. */
(function () {
'use strict';
var P = window.__PF, A = P.Audio_, oldInit = A.init;
var durations = { laser: .48, gun: .14, impact: .35, blast: 1.15, hit: .65,
  lock: .13, orb: .65, view: .22, warn: .4, boost: .8, roll: .45 };
// Low-passed noise, swept FM energy, body resonance and a shaped transient.
// Every variant has a zero-ended envelope; no raw square/saw oscillators.
function render(name, rate, variant) {
  var length = Math.ceil(durations[name] * rate), out = new Float32Array(length);
  var seed = 8713 + variant * 971, low = 0, phase = 0, peak = 0;
  function noise() { seed = (Math.imul(seed, 1664525) + 1013904223) | 0; return (seed >>> 0) / 2147483648 - 1; }
  for (var i = 0; i < length; i++) {
    var t = i / rate, u = i / (length - 1), n = noise();
    low += (n - low) * (1 - Math.exp(-2 * Math.PI * (name === 'blast' ? 330 : 1600) / rate));
    var v = 0, pitch = 1 + variant * .023;
    if (name === 'laser') {
      phase += 2 * Math.PI * (170 + 1250 * Math.exp(-t * 14)) * pitch / rate;
      v = .48 * Math.sin(phase + 2.2 * Math.sin(phase * 1.49) * Math.exp(-t * 13)) * Math.exp(-t * 9)
        + .26 * (n - low) * Math.exp(-t * 52) + .22 * low * Math.exp(-t * 11);
    } else if (name === 'blast' || name === 'hit' || name === 'impact' || name === 'gun') {
      var big = name === 'blast', gun = name === 'gun';
      phase += 2 * Math.PI * (big ? 34 + 90 * Math.exp(-t * 15) : gun ? 100 + 350 * Math.exp(-t * 65) : 90 + 620 * Math.exp(-t * 32)) / rate;
      v = (big ? .9 : .5) * Math.sin(phase) * Math.exp(-t * (big ? 5 : 26))
        + low * (big ? 2.1 : .8) * Math.exp(-t * (big ? 3.9 : 17))
        + n * .36 * Math.exp(-t * (gun ? 110 : 60));
      if (big) v += .15 * n * Math.pow(Math.max(0, Math.sin(t * 113)), 16) * Math.exp(-t * 5);
    } else if (name === 'boost' || name === 'roll' || name === 'view') {
      var env = Math.sin(Math.PI * Math.pow(u, .65));
      phase += 2 * Math.PI * (90 + 240 * u) / rate;
      v = (.7 * low + .13 * Math.sin(phase)) * env * (name === 'view' ? .4 : .8);
    } else {
      var freqs = name === 'orb' ? [523.25, 659.25, 783.99, 1046.5] : name === 'warn' ? [220, 277.18] : [1046.5, 1568];
      for (var k = 0; k < freqs.length; k++) {
        var age = t - (name === 'orb' ? k * .065 : 0);
        if (age >= 0) v += .18 * (Math.sin(2 * Math.PI * freqs[k] * age) + .18 * Math.sin(2 * Math.PI * freqs[k] * 3.01 * age)) * Math.exp(-age * (name === 'orb' ? 8 : 23));
      }
    }
    var envEnd = Math.min(1, t / .002) * Math.min(1, (durations[name] - t) / .025);
    out[i] = Math.tanh(v * 1.2) * envEnd; peak = Math.max(peak, Math.abs(out[i]));
  }
  if (peak > .9) for (i = 0; i < length; i++) out[i] *= .9 / peak;
  out[0] = out[length - 1] = 0;
  return out;
}
A.renderEffect = render;
A.init = function (override) {
  if (this.started && !override && this.bank) return;
  oldInit.call(this, override); if (!this.started) return;
  var ctx = this.ctx; this.bank = {}; this.voices = []; this.lastEffect = {};
  Object.keys(durations).forEach(function (name) {
    A.bank[name] = [0, 1, 2].map(function (v) {
      var data = render(name, ctx.sampleRate, v), b = ctx.createBuffer(1, data.length, ctx.sampleRate);
      b.getChannelData(0).set(data); return b;
    });
  });
  this.sfxGain.disconnect();
  var compressor = ctx.createDynamicsCompressor();
  compressor.threshold.value = -16; compressor.knee.value = 16; compressor.ratio.value = 4;
  compressor.attack.value = .004; compressor.release.value = .16;
  this.sfxGain.connect(compressor); compressor.connect(this.master);
  var reverb = ctx.createConvolver(), impulse = ctx.createBuffer(2, Math.ceil(ctx.sampleRate * .7), ctx.sampleRate);
  for (var ch = 0; ch < 2; ch++) {
    var d = impulse.getChannelData(ch), lp = 0;
    for (var i = 0; i < d.length; i++) { lp += ((Math.random() * 2 - 1) - lp) * .3; d[i] = lp * Math.pow(1 - i / d.length, 3); }
  }
  reverb.buffer = impulse;
  var wet = ctx.createGain(), hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 280; wet.gain.value = .13;
  this.sfxGain.connect(hp); hp.connect(reverb); reverb.connect(wet); wet.connect(compressor);
};
A.effect = function (name, volume, pos) {
  if (!this.started || this.muted || !this.bank) return;
  var ctx = this.ctx, now = ctx.currentTime;
  var interval = name === 'gun' ? .045 : name === 'blast' ? .07 : .035;
  if (now - (this.lastEffect[name] === undefined ? -100 : this.lastEffect[name]) < interval) return;
  this.lastEffect[name] = now;
  if (this.voices.length >= 28) return;
  var src = ctx.createBufferSource(), gain = ctx.createGain(), pan = ctx.createStereoPanner ? ctx.createStereoPanner() : ctx.createGain();
  src.buffer = this.bank[name][Math.floor(Math.random() * 3)]; src.playbackRate.value = .97 + Math.random() * .06;
  var distance = pos && P.Player ? pos.distanceTo(P.Player.pos) : 0;
  gain.gain.value = volume / (1 + distance / 220);
  if (pan.pan) {
    var side = pos && P.Player ? (pos.x - P.Player.pos.x) * -Math.cos(P.Player.camYaw) + (pos.z - P.Player.pos.z) * Math.sin(P.Player.camYaw) : 0;
    pan.pan.value = Math.max(-.8, Math.min(.8, side / 100));
  }
  src.connect(gain); gain.connect(pan); pan.connect(this.sfxGain);
  var voices = this.voices; voices.push(src);
  src.onended = function () { var i = voices.indexOf(src); if (i >= 0) voices.splice(i, 1); src.disconnect(); gain.disconnect(); pan.disconnect(); };
  src.start();
};
A.sLaser = function () { this.effect('laser', .48); };
A.sGun = function () { this.effect('gun', .32); };
A.sZap = function (pos) { this.effect('impact', .52, pos); };
A.sBoom = function (big, pos) { this.effect(big ? 'blast' : 'impact', big ? .85 : .45, pos); };
A.sHit = function () { this.effect('hit', .7); };
A.sLock = function () { this.effect('lock', .33); };
A.sOrb = function () { this.effect('orb', .5); };
A.sView = function () { this.effect('view', .35); };
A.sWarn = function () { this.effect('warn', .45); };
A.sBoost = function () { this.effect('boost', .55); };
A.sRoll = function () { this.effect('roll', .6); };
})();
