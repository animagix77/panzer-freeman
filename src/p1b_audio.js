/* Layered, original sound effects, rendered once into reusable PCM buffers. */
(function () {
'use strict';
var P = window.__PF, A = P.Audio_, oldInit = A.init;
var durations = { laser: .54, gun: .19, impact: .48, blast: 1.85, hit: .65,
  lock: .13, orb: .65, view: .22, warn: .4, boost: .8, roll: .45, wing: .62, near: .32, enemy: .3 };
// Low-passed noise, swept FM energy, body resonance and a shaped transient.
// Every variant has a zero-ended envelope; no raw square/saw oscillators.
function render(name, rate, variant) {
  var length = Math.ceil(durations[name] * rate), out = new Float32Array(length);
  var seed = 8713 + variant * 971, low = 0, subNoise = 0, phase = 0, phase2 = 0, peak = 0;
  function noise() { seed = (Math.imul(seed, 1664525) + 1013904223) | 0; return (seed >>> 0) / 2147483648 - 1; }
  for (var i = 0; i < length; i++) {
    var t = i / rate, u = i / (length - 1), n = noise();
    low += (n - low) * (1 - Math.exp(-2 * Math.PI * (name === 'blast' ? 330 : 1600) / rate));
    subNoise += (n - subNoise) * (1 - Math.exp(-2 * Math.PI * 110 / rate));
    var v = 0, pitch = 1 + variant * .023;
    if (name === 'laser' || name === 'enemy') {
      var hostile = name === 'enemy';
      // A short electrical crack over a low resonant body; the airy tail
      // carries the motion instead of a conspicuous descending arcade beep.
      phase += 2 * Math.PI * (hostile ? 155 : 245) * pitch / rate;
      phase2 += 2 * Math.PI * (hostile ? 390 : 710 + 420 * Math.exp(-t * 24)) * pitch / rate;
      v = .38 * Math.sin(phase + .8 * Math.sin(phase2)) * Math.exp(-t * 18)
        + .5 * (n - low) * Math.exp(-t * 90)
        + .65 * low * Math.exp(-t * 11) * (.6 + .4 * Math.sin(phase2 * .13));
      var arc = Math.max(0, t - .035);
      if (t > .035) v += .16 * Math.sin(phase2) * Math.exp(-arc * 22);
    } else if (name === 'blast' || name === 'hit' || name === 'impact' || name === 'gun') {
      var big = name === 'blast', gun = name === 'gun';
      phase += 2 * Math.PI * (big ? 39 + 64 * Math.exp(-t * 22) : gun ? 115 + 170 * Math.exp(-t * 80) : 125 + 240 * Math.exp(-t * 42)) * pitch / rate;
      v = (big ? .85 : .4) * Math.sin(phase) * Math.exp(-t * (big ? 5 : 32))
        + low * (big ? 1.5 : .95) * Math.exp(-t * (big ? 4 : 22))
        + n * .42 * Math.exp(-t * (gun ? 120 : 75));
      if (big) {
        // Pressure arrives first; gritty debris and slower low rumble follow.
        v += subNoise * 3.5 * (1 - Math.exp(-t * 40)) * Math.exp(-t * 2.9);
        var crackle = Math.pow(Math.max(0, Math.sin(t * 147 + variant)), 24);
        v += (n - low) * .25 * crackle * Math.exp(-t * 3.5);
      } else if (gun) {
        // The mechanism returns after the shot, like a small mechanical bolt.
        var clack = t - .047;
        if (clack >= 0) v += (.23 * n + .13 * Math.sin(t * 2 * Math.PI * 1710)) * Math.exp(-clack * 160);
      } else {
        // Inharmonic body modes suggest fractured metal rather than a buzzer.
        v += .13 * (Math.sin(t * 2 * Math.PI * 1331 * pitch) + .5 * Math.sin(t * 2 * Math.PI * 2149 * pitch)) * Math.exp(-t * 30);
      }
    } else if (name === 'wing') {
      var down = Math.exp(-Math.pow((t - .11) / .065, 2));
      var recovery = Math.exp(-Math.pow((t - .34) / .1, 2));
      v = (low * .95 + subNoise * 1.8) * down + (n - low) * .14 * recovery;
      v += .07 * Math.sin(2 * Math.PI * 78 * t) * down;
    } else if (name === 'near') {
      var pass = Math.exp(-Math.pow((u - .42) / .19, 2));
      phase += 2 * Math.PI * (1350 - u * 720) / rate;
      v = (low * .75 + Math.sin(phase) * .065) * pass;
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
  var warmth = ctx.createBiquadFilter(); warmth.type = 'lowpass'; warmth.frequency.value = 10500; warmth.Q.value = .5;
  this.sfxGain.connect(warmth); warmth.connect(compressor); compressor.connect(this.master);
  var reverb = ctx.createConvolver(), impulse = ctx.createBuffer(2, Math.ceil(ctx.sampleRate * .7), ctx.sampleRate);
  for (var ch = 0; ch < 2; ch++) {
    var d = impulse.getChannelData(ch), lp = 0;
    for (var i = 0; i < d.length; i++) { lp += ((Math.random() * 2 - 1) - lp) * .3; d[i] = lp * Math.pow(1 - i / d.length, 3); }
  }
  reverb.buffer = impulse;
  var wet = ctx.createGain(), hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 280; wet.gain.value = .11; this.reverbWet = wet;
  this.sfxGain.connect(hp); hp.connect(reverb); reverb.connect(wet); wet.connect(compressor);
};
A.effect = function (name, volume, pos) {
  if (!this.started || this.muted || !this.bank || !this.bank[name]) return;
  var ctx = this.ctx, now = ctx.currentTime;
  var interval = name === 'gun' ? .04 : name === 'blast' ? .1 : name === 'wing' ? .16 : name === 'enemy' ? .12 : name === 'near' ? .18 : .035;
  if (now - (this.lastEffect[name] === undefined ? -100 : this.lastEffect[name]) < interval) return;
  this.lastEffect[name] = now;
  if (this.voices.length >= 28) return;
  var src = ctx.createBufferSource(), gain = ctx.createGain(), pan = ctx.createStereoPanner ? ctx.createStereoPanner() : ctx.createGain();
  src.buffer = this.bank[name][Math.floor(Math.random() * 3)]; src.playbackRate.value = .97 + Math.random() * .06;
  var distance = pos && P.Player ? pos.distanceTo(P.Player.pos) : 0;
  gain.gain.value = volume / (1 + distance / 220);
  var air = ctx.createBiquadFilter(); air.type = 'lowpass'; air.frequency.value = Math.max(1600, 12500 / (1 + distance / 120)); air.Q.value = .5;
  if (pan.pan) {
    var side = pos && P.Player ? (pos.x - P.Player.pos.x) * -Math.cos(P.Player.camYaw) + (pos.z - P.Player.pos.z) * Math.sin(P.Player.camYaw) : 0;
    pan.pan.value = Math.max(-.8, Math.min(.8, side / 100));
  }
  src.connect(air); air.connect(gain); gain.connect(pan); pan.connect(this.sfxGain);
  var voices = this.voices; voices.push(src);
  src.onended = function () { var i = voices.indexOf(src); if (i >= 0) voices.splice(i, 1); src.disconnect(); air.disconnect(); gain.disconnect(); pan.disconnect(); };
  src.start();
  if (this.duck && (name === 'blast' || name === 'hit')) this.duck(name === 'hit' ? .36 : .24);
};
A.sLaser = function () { this.effect('laser', .60); };
A.sGun = function () { this.effect('gun', .43); };
A.sZap = function (pos) { this.effect('impact', .52, pos); };
A.sBoom = function (big, pos) { this.effect(big ? 'blast' : 'impact', big ? .85 : .45, pos); };
A.sHit = function () { this.effect('hit', .7); };
A.sLock = function () { this.effect('lock', .33); };
A.sOrb = function () { this.effect('orb', .5); };
A.sView = function () { this.effect('view', .35); };
A.sWarn = function () { this.effect('warn', .45); };
A.sBoost = function () { this.effect('boost', .55); };
A.sRoll = function () { this.effect('roll', .6); };
A.sWing = function (power) { this.effect('wing', .18 * Math.max(.2, Math.min(1.5, power))); };
A.sNear = function (pos) { this.effect('near', .42, pos); };
A.sEnemy = function (pos) { this.effect('enemy', .33, pos); };
})();
