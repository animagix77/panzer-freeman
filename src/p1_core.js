/* =========================================================================
   PANZER FREEMAN — CHRONOS REQUIEM
   A low-poly Sega-Saturn-flavoured rail shooter.
   Part 1 — core engine, retro pipeline, sky, audio
   ========================================================================= */
'use strict';

(function () {

// ------------------------------------------------------------------ utils
var TAU = Math.PI * 2;
function clamp(v, a, b) { return v < a ? a : (v > b ? b : v); }
function lerp(a, b, t) { return a + (b - a) * t; }
function damp(a, b, l, dt) { return lerp(a, b, 1 - Math.exp(-l * dt)); }
function rand(a, b) { return a + Math.random() * (b - a); }
function randi(a, b) { return Math.floor(rand(a, b + 1)); }
function pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }
function angDelta(a, b) { var d = (b - a) % TAU; if (d > Math.PI) d -= TAU; if (d < -Math.PI) d += TAU; return d; }

var V3 = THREE.Vector3;
var tmpA = new V3(), tmpB = new V3(), tmpC = new V3();

// ------------------------------------------------------------------ dom
var glCanvas   = document.getElementById('gl');
var hudCanvas  = document.getElementById('hud');
var hx         = hudCanvas.getContext('2d');
var elFlash    = document.getElementById('flash');
var elCard     = document.getElementById('card');
var elToast    = document.getElementById('toast');
var elPause    = document.getElementById('pausebox');
var elSkip     = document.getElementById('skiphint');
var elQuip     = document.getElementById('quip');
var elTitle    = document.getElementById('title');
var elOver     = document.getElementById('over');
var elWin      = document.getElementById('win');
var elLoading  = document.getElementById('loading');

// ------------------------------------------------------------------ renderer
var renderer = new THREE.WebGLRenderer({
  canvas: glCanvas, antialias: true, alpha: false, powerPreference: 'high-performance',
  stencil: false, logarithmicDepthBuffer: false
});
renderer.setClearColor(0x120a1e, 1);
renderer.sortObjects = true;

// Clean low-poly: render at display resolution (capped for fill-rate sanity).
var MAX_H = 1100;                 // vertical cap on the drawing buffer
var VW = 1280, VH = 720;          // current buffer size (set by resize())

var scene  = new THREE.Scene();
var camera = new THREE.PerspectiveCamera(56, 16 / 9, 0.6, 1600);
scene.add(camera);

function resize() {
  var w = window.innerWidth, h = window.innerHeight;
  var aspect = w / h;
  var dpr3d = Math.min(window.devicePixelRatio || 1, 2);
  // Full-res buffer, capped so 4K displays don't melt the fill rate.
  var scale = Math.min(1, MAX_H / (h * dpr3d));
  renderer.setPixelRatio(dpr3d * scale);
  renderer.setSize(w, h, false);
  VW = Math.round(w * dpr3d * scale);
  VH = Math.round(h * dpr3d * scale);
  camera.aspect = aspect;
  camera.updateProjectionMatrix();

  var dpr = Math.min(window.devicePixelRatio || 1, 2);
  hudCanvas.width  = Math.round(w * dpr);
  hudCanvas.height = Math.round(h * dpr);
  hx.setTransform(dpr, 0, 0, dpr, 0, 0);
  HUD.w = w; HUD.h = h;
}
window.addEventListener('resize', resize);
// Quality knob: lower the cap to trade crispness for fill rate (also lets the
// headless tools render small so they aren't gated on software rasterisation).
function setMaxH(h) { MAX_H = Math.max(180, h | 0); resize(); }

// Saturn mode: vertex snap on, 232-line buffer nearest-upscaled, 15-bit sky,
// full CRT overlay. Off by default; 'R' toggles it.
var cleanMaxH = 1100;
function setRetro(on) {
  RETRO_ON = !!on;
  for (var i = 0; i < retroSnaps.length; i++) retroSnaps[i].value = RETRO_ON ? 1 : 0;
  skyUni.bands.value = RETRO_ON ? 26 : 216;
  document.body.classList.toggle('crt', RETRO_ON);
  setMaxH(RETRO_ON ? 232 : cleanMaxH);
  return RETRO_ON;
}
function toggleRetro() { return setRetro(!RETRO_ON); }

// ------------------------------------------------------------- retro shader
// Snap clip-space verts to a coarse grid -> authentic 90s console wobble.
// The patch is always compiled in but gated on a uniform, so Saturn mode can
// be toggled live without rebuilding every material in the scene.
var JITTER_GRID = 96.0;
var retroSnaps = [];              // every uSnap uniform we've handed out
var RETRO_ON = false;
function retroPatch(mat, grid) {
  mat.onBeforeCompile = function (shader) {
    shader.uniforms.uGrid = { value: grid || JITTER_GRID };
    shader.uniforms.uSnap = { value: RETRO_ON ? 1 : 0 };
    retroSnaps.push(shader.uniforms.uSnap);
    shader.vertexShader = 'uniform float uGrid;\nuniform float uSnap;\n' + shader.vertexShader;
    shader.vertexShader = shader.vertexShader.replace(
      '#include <project_vertex>',
      [
        'vec4 mvPosition = vec4( transformed, 1.0 );',
        '#ifdef USE_INSTANCING',
        '  mvPosition = instanceMatrix * mvPosition;',
        '#endif',
        'mvPosition = modelViewMatrix * mvPosition;',
        'gl_Position = projectionMatrix * mvPosition;',
        'if (uSnap > 0.5) {',
        '  gl_Position.xyz = floor(gl_Position.xyz / gl_Position.w * uGrid) / uGrid * gl_Position.w;',
        '}'
      ].join('\n')
    );
  };
  mat.customProgramCacheKey = function () { return 'retro' + (grid || JITTER_GRID); };
  return mat;
}

var matCache = {};
// Flat-shaded Phong = per-face lighting, exactly the hard-edged 90s look.
function M(color, opts) {
  opts = opts || {};
  var key = color + '|' + JSON.stringify(opts);
  if (matCache[key]) return matCache[key];
  var p = {
    color: color, flatShading: true, shininess: opts.shine || 0,
    specular: opts.spec !== undefined ? opts.spec : 0x000000
  };
  if (opts.emissive !== undefined) p.emissive = opts.emissive;
  if (opts.side) p.side = opts.side;
  if (opts.transparent) { p.transparent = true; p.opacity = opts.opacity !== undefined ? opts.opacity : 1; }
  if (opts.fog === false) p.fog = false;
  if (opts.depthWrite === false) p.depthWrite = false;
  var m = new THREE.MeshPhongMaterial(p);
  if (opts.jitter !== false) retroPatch(m, opts.grid);
  matCache[key] = m;
  return m;
}
// Unlit glow (self-luminous polys — the neon bits)
function G(color, opts) {
  opts = opts || {};
  var key = 'G' + color + '|' + JSON.stringify(opts);
  if (matCache[key]) return matCache[key];
  var p = { color: color, flatShading: true, fog: opts.fog !== false };
  if (opts.transparent) { p.transparent = true; p.opacity = opts.opacity !== undefined ? opts.opacity : 1; }
  if (opts.side) p.side = opts.side;
  if (opts.depthWrite === false) p.depthWrite = false;
  var m = new THREE.MeshBasicMaterial(p);
  if (opts.jitter !== false) retroPatch(m, opts.grid);
  matCache[key] = m;
  return m;
}

// -------------------------------------------------------------------- sky
var SKY_VS = [
  'varying vec3 vDir;',
  'void main(){',
  '  vDir = normalize(position);',
  '  vec4 p = projectionMatrix * modelViewMatrix * vec4(position,1.0);',
  '  gl_Position = p;',
  '}'
].join('\n');

var SKY_FS = [
  'precision mediump float;',
  'varying vec3 vDir;',
  'uniform vec3 cHi; uniform vec3 cMid; uniform vec3 cLo;',
  'uniform vec3 sunDir; uniform vec3 sunCol; uniform float sunSize;',
  'uniform float bands;',
  'uniform float shaftAmt; uniform float shaftT;',
  'float bayer2(vec2 a){ a = floor(a); return fract(a.x/2.0 + a.y*a.y*0.75); }',
  'float bayer4(vec2 a){ return bayer2(0.5*a)*0.25 + bayer2(a); }',
  'void main(){',
  '  vec3 d = normalize(vDir);',
  '  float t = clamp(d.y*0.5+0.5, 0.0, 1.0);',
  '  vec3 c = (t < 0.5) ? mix(cLo, cMid, smoothstep(0.0,0.5,t))',
  '                     : mix(cMid, cHi, smoothstep(0.5,1.0,t));',
  // sun / moon disc + halo
  '  float sd = dot(d, normalize(sunDir));',
  '  float disc = smoothstep(1.0 - sunSize, 1.0 - sunSize*0.35, sd);',
  '  float halo = pow(max(sd,0.0), 52.0);',
  '  c += sunCol * (disc*0.9 + halo*0.42);',
  // Crepuscular shafts. Not volumetric — nothing occludes them — but two
  // incommensurate angular harmonics around the sun axis read as god-rays and
  // cost a handful of instructions instead of a second render target.
  '  vec3 su = normalize(sunDir);',
  '  vec3 tg = normalize(cross(su, vec3(0.0, 1.0, 0.0)));',
  '  vec3 bt = cross(su, tg);',
  '  float ang = atan(dot(d, bt), dot(d, tg));',
  '  float sh = (0.5 + 0.5*sin(ang*7.0  + shaftT*0.07))',
  '           * (0.55 + 0.45*sin(ang*13.0 - shaftT*0.11 + 2.1));',
  '  c += sunCol * sh * pow(max(sd, 0.0), 7.0) * shaftAmt;',
  // Ordered dither at 8-bit — kills gradient banding rather than creating it.
  '  float dth = (bayer4(gl_FragCoord.xy) - 0.5);',
  '  c = floor(c * bands + dth) / bands;',
  '  gl_FragColor = vec4(clamp(c,0.0,1.0), 1.0);',
  '}'
].join('\n');

var skyUni = {
  cHi:  { value: new THREE.Color(0x2a1a5e) },
  cMid: { value: new THREE.Color(0xc0507a) },
  cLo:  { value: new THREE.Color(0xffb257) },
  sunDir:  { value: new V3(0.25, 0.06, 1).normalize() },
  sunCol:  { value: new THREE.Color(0xffd08a) },
  sunSize: { value: 0.016 },
  bands:   { value: 216.0 },
  shaftAmt: { value: 0.34 },
  shaftT:   { value: 0.0 }
};
var skyMesh = new THREE.Mesh(
  new THREE.SphereGeometry(900, 48, 28),
  new THREE.ShaderMaterial({
    vertexShader: SKY_VS, fragmentShader: SKY_FS, uniforms: skyUni,
    side: THREE.BackSide, depthWrite: false, fog: false
  })
);
skyMesh.frustumCulled = false;
skyMesh.renderOrder = -1000;
scene.add(skyMesh);

// ------------------------------------------------------------------ lights
var ambLight = new THREE.AmbientLight(0x5a4b7e, 1.0);
var keyLight = new THREE.DirectionalLight(0xffd6ac, 1.12);
keyLight.position.set(0.4, 0.7, 1).normalize();
var rimLight = new THREE.DirectionalLight(0x6f8bff, 0.58);
rimLight.position.set(-0.6, 0.25, -1).normalize();
scene.add(ambLight, keyLight, rimLight);

// ------------------------------------------------------------------ shadows
// A shadow map on a flat-shaded Saturn-era game is a fight worth picking
// carefully. Soft PCF shadows would look wrong immediately — the whole art
// direction is hard edges and banded light. BasicShadowMap gives a hard,
// aliased, stair-stepped edge, which is exactly what a machine of that era
// would have produced if it could have produced one at all.
//
// The cost is kept honest by scope, not by resolution: only the dragon, the
// enemies and the boss cast, only the terrain receives, and the light's
// orthographic frustum is a tight box dragged along with the player rather
// than one big enough for the whole world.
renderer.shadowMap.enabled = false;      // opt-in; see setShadows() below
renderer.shadowMap.type = THREE.BasicShadowMap;
renderer.shadowMap.autoUpdate = true;

var SHADOW_SPAN = 120;
keyLight.castShadow = false;
keyLight.shadow.mapSize.set(1024, 1024);
var sc = keyLight.shadow.camera;
sc.left = -SHADOW_SPAN; sc.right = SHADOW_SPAN;
sc.top = SHADOW_SPAN; sc.bottom = -SHADOW_SPAN;
sc.near = 1; sc.far = 460;
// Mutating an OrthographicCamera's extents does nothing until the projection is
// rebuilt. Without this the shadow camera keeps its default ±5 frustum and the
// map comes back empty — which looks exactly like shadows being switched off.
sc.updateProjectionMatrix();
keyLight.shadow.bias = -0.0016;
// A DirectionalLight aims at its target; give it one we can move.
var shadowFocus = new THREE.Object3D();
scene.add(shadowFocus);
keyLight.target = shadowFocus;

// The light sits SHADOW_BACK units up-sun from whatever it is lighting, so the
// frustum stays tight no matter how far down the rail the player has flown.
var SHADOW_BACK = 240;
// The episode palette owns the sun DIRECTION; the shadow rig owns where along
// that direction the light actually sits. Before this split, stepColors() wrote
// a unit vector straight into keyLight.position every frame, which parked the
// light one unit from the origin and collapsed the shadow frustum to nothing.
var sunDir = new V3(0.4, 0.7, 1).normalize();
// Every episode's sun sits near the horizon — it is a sunset game. Physically
// that throws a shadow hundreds of units down-rail, off-screen, which costs a
// full depth pass and shows the player nothing. So the KEY LIGHT keeps the
// palette's azimuth but is lifted to at least this elevation, which lands the
// shadow within about 1.3 altitudes of its caster. The sky shader still draws
// the sun exactly where the palette put it; only the lighting rig is raised.
var MIN_SUN_ELEV = 0.60;     // dir.y as a fraction of the horizontal magnitude
var rawSunDir = new V3(0.4, 0.7, 1).normalize();
function setSunDir(v) {
  rawSunDir.copy(v);
  if (rawSunDir.lengthSq() < 1e-8) rawSunDir.set(0.4, 0.7, 1);
  rawSunDir.normalize();
  applySunDir();
}
function applySunDir() {
  sunDir.copy(rawSunDir);
  // The lift is only worth its distortion when something is actually casting.
  // With shadows off, the palette's sun angle is used exactly as authored.
  if (SHADOWS_ON) {
    var horiz = Math.sqrt(sunDir.x * sunDir.x + sunDir.z * sunDir.z);
    if (sunDir.y < MIN_SUN_ELEV * horiz) {
      var k = horiz > 1e-6 ? (sunDir.y / MIN_SUN_ELEV) / horiz : 0;
      sunDir.x *= k; sunDir.z *= k;
      sunDir.normalize();
    }
  }
  placeKeyLight();
}
function placeKeyLight() {
  var f = shadowFocus.position;
  keyLight.position.set(
    f.x + sunDir.x * SHADOW_BACK,
    f.y + sunDir.y * SHADOW_BACK,
    f.z + sunDir.z * SHADOW_BACK
  );
}
function trackShadow(focusX, focusY, focusZ) {
  shadowFocus.position.set(focusX, focusY, focusZ);
  shadowFocus.updateMatrixWorld();
  placeKeyLight();
}
// Default OFF. The map itself is correct — a hard, stair-stepped, era-correct
// shadow, verified landing on the terrain — but at the sunset angles every
// episode uses it lands well outside the chase camera's framing, and the depth
// pass is not free. G turns it on for anyone who wants it.
var SHADOWS_ON = false;
function setShadows(on) {
  SHADOWS_ON = !!on;
  renderer.shadowMap.enabled = SHADOWS_ON;
  keyLight.castShadow = SHADOWS_ON;
  applySunDir();
  scene.traverse(function (o) { if (o.isMesh && o.material) o.material.needsUpdate = true; });
}
function toggleShadows() { setShadows(!SHADOWS_ON); return SHADOWS_ON; }

scene.fog = new THREE.Fog(0xc0507a, 70, 460);

// ------------------------------------------------------------------- audio
var Audio_ = {
  ctx: null, master: null, musicGain: null, sfxGain: null,
  muted: false, started: false, step: 0, nextTime: 0, tempo: 0.135, pattern: null,

  init: function (ctxOverride) {
    if (this.started && !ctxOverride) return;
    var AC = window.AudioContext || window.webkitAudioContext;
    if (!AC && !ctxOverride) return;
    this.ctx = ctxOverride || new AC();
    this.master = this.ctx.createGain();  this.master.gain.value = 0.55;
    this.musicGain = this.ctx.createGain(); this.musicGain.gain.value = 0.62;
    this.sfxGain = this.ctx.createGain();   this.sfxGain.gain.value = 0.5;
    this.musicGain.connect(this.master); this.sfxGain.connect(this.master);
    this.master.connect(this.ctx.destination);
    this.noiseBuf = this._noise();
    this.started = true;
    this.nextTime = this.ctx.currentTime + 0.06;
    this.initMusic();
  },
  _noise: function () {
    var n = this.ctx.sampleRate * 1.2, b = this.ctx.createBuffer(1, n, this.ctx.sampleRate), d = b.getChannelData(0);
    for (var i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
    return b;
  },
  toggle: function () {
    this.muted = !this.muted;
    if (this.master) this.master.gain.setTargetAtTime(this.muted ? 0 : 0.55, this.ctx.currentTime, 0.02);
    setStreamMuted(this.muted);
    return this.muted;
  },
  tone: function (freq, dur, type, vol, slideTo, dest) {
    if (!this.started || this.muted) return;
    var t = this.ctx.currentTime;
    var o = this.ctx.createOscillator(), g = this.ctx.createGain();
    o.type = type || 'square';
    o.frequency.setValueAtTime(freq, t);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(Math.max(20, slideTo), t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol || 0.2, t + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(dest || this.sfxGain);
    o.start(t); o.stop(t + dur + 0.02);
  },
  noise: function (dur, vol, freq, q) {
    if (!this.started || this.muted) return;
    var t = this.ctx.currentTime;
    var s = this.ctx.createBufferSource(); s.buffer = this.noiseBuf;
    var f = this.ctx.createBiquadFilter(); f.type = 'bandpass';
    f.frequency.setValueAtTime(freq || 900, t);
    f.frequency.exponentialRampToValueAtTime(Math.max(60, (freq || 900) * 0.15), t + dur);
    f.Q.value = q || 1.2;
    var g = this.ctx.createGain();
    g.gain.setValueAtTime(vol || 0.3, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(f); f.connect(g); g.connect(this.sfxGain);
    s.start(t); s.stop(t + dur + 0.02);
  },
  // --- sfx ---
  sLock:  function () { this.tone(1180, 0.05, 'square', 0.10); },
  sLaser: function () { this.tone(1720, 0.22, 'sawtooth', 0.12, 220); this.tone(880, 0.16, 'square', 0.05, 180); },
  sZap:   function () { this.tone(2600, 0.07, 'square', 0.09, 900); this.noise(0.12, 0.22, 3200, 1.6); },
  sGun:   function () { this.tone(660, 0.06, 'square', 0.07, 300); },
  sBoom:  function (big) { this.noise(big ? 0.7 : 0.28, big ? 0.55 : 0.3, big ? 420 : 1100, 0.8);
                           if (big) this.tone(90, 0.6, 'triangle', 0.3, 32); },
  sHit:   function () { this.noise(0.35, 0.45, 260, 0.6); this.tone(150, 0.3, 'sawtooth', 0.22, 55); },
  sOrb:   function () { var s = this; [880, 1174, 1568, 2093].forEach(function (f, i) {
                           setTimeout(function () { s.tone(f, 0.11, 'triangle', 0.14); }, i * 45); }); },
  sView:  function () { this.tone(420, 0.09, 'square', 0.07, 700); },
  sWing:  function (power) {
    if (!this.started || this.muted) return;
    var t = this.ctx.currentTime, dur = 0.26;
    var sc = this.ctx.createBufferSource(); sc.buffer = this.noiseBuf;
    var f = this.ctx.createBiquadFilter(); f.type = 'bandpass';
    f.frequency.setValueAtTime(180 + power * 220, t);
    f.frequency.exponentialRampToValueAtTime(70, t + dur);
    f.Q.value = 0.7;
    var g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(0.035 * power, t + 0.035);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    sc.connect(f); f.connect(g); g.connect(this.sfxGain);
    sc.start(t); sc.stop(t + dur + 0.02);
  },
  sWarn:  function () { this.tone(300, 0.16, 'sawtooth', 0.11, 150); },

  // ================= ROCK ENGINE ==========================================
  // Shared distortion channels (notes are summed BEFORE the waveshaper, so
  // power chords intermodulate the way a real amp does), plus a tracker-style
  // sequencer running 16th notes.
  _curve: function (amount) {
    var n = 1024, c = new Float32Array(n);
    for (var i = 0; i < n; i++) {
      var x = i * 2 / n - 1;
      c[i] = (1 + amount) * x / (1 + amount * Math.abs(x));
    }
    return c;
  },
  _chan: function (drive, lpHz, hpHz, level, oversample, presHz, presDb) {
    var c = this.ctx;
    var inp = c.createGain(); inp.gain.value = 1;
    var sh = c.createWaveShaper();
    sh.curve = this._curve(drive);
    sh.oversample = oversample || '2x';
    var lp = c.createBiquadFilter(); lp.type = 'lowpass';
    lp.frequency.value = lpHz; lp.Q.value = 0.9;
    // guitars get high-passed hard so the bass owns the bottom end
    var hp = c.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = hpHz; hp.Q.value = 0.7;
    var out = c.createGain(); out.gain.value = level;
    inp.connect(sh); sh.connect(lp); lp.connect(hp);
    if (presHz) {
      var pk = c.createBiquadFilter(); pk.type = 'peaking';
      pk.frequency.value = presHz; pk.Q.value = 1.1; pk.gain.value = presDb;
      hp.connect(pk); pk.connect(out);
    } else hp.connect(out);
    out.connect(this.mBus);
    return { inp: inp, out: out, lp: lp };
  },
  initMusic: function () {
    var c = this.ctx;
    var comp = c.createDynamicsCompressor();
    comp.threshold.value = -18; comp.knee.value = 24;
    comp.ratio.value = 5; comp.attack.value = 0.004; comp.release.value = 0.16;
    var rumble = c.createBiquadFilter();
    rumble.type = 'highpass'; rumble.frequency.value = 34; rumble.Q.value = 0.6;
    comp.connect(rumble); rumble.connect(this.musicGain);
    this.mBus = comp;

    this.chGtr  = this._chan(64, 4600, 195, 0.40, '2x', 2900, 7);
    this.chLead = this._chan(72, 5200, 330, 0.15, '2x', 3400, 6);
    this.chBass = this._chan(5,   900,  55, 0.20, 'none');
    this.drumGain = c.createGain(); this.drumGain.gain.value = 0.62;
    this.drumGain.connect(this.mBus);

    // ---- pad: clean, wide and slow, with a long tail. This is what carries
    // the title screen before the band walks in.
    var padLp = c.createBiquadFilter(); padLp.type = 'lowpass';
    padLp.frequency.value = 2300; padLp.Q.value = 0.6;
    var padHp = c.createBiquadFilter(); padHp.type = 'highpass';
    padHp.frequency.value = 120; padHp.Q.value = 0.6;
    var padOut = c.createGain(); padOut.gain.value = 0.52;
    padLp.connect(padHp); padHp.connect(padOut); padOut.connect(this.mBus);
    this.chPad = { inp: padLp, out: padOut };
    // long ping-pong-ish tail so the intro has air around it
    var pd = c.createDelay(1.2); pd.delayTime.value = 0.44;
    var pfb = c.createGain(); pfb.gain.value = 0.42;
    var pwet = c.createGain(); pwet.gain.value = 0.30;
    padOut.connect(pd); pd.connect(pfb); pfb.connect(pd);
    pd.connect(pwet); pwet.connect(this.mBus);

    // ---- clean guitar: barely driven, for the lone line over the pad
    this.chCln = this._chan(3, 3600, 240, 0.30, 'none', 2400, 4);

    // a short slap-back on the lead — cheap, and it fills the top end
    var dl = c.createDelay(0.6); dl.delayTime.value = 0.26;
    var fb = c.createGain(); fb.gain.value = 0.3;
    var wet = c.createGain(); wet.gain.value = 0.32;
    this.chLead.out.connect(dl); dl.connect(fb); fb.connect(dl);
    dl.connect(wet); wet.connect(this.mBus);

    this.song = null; this.step = 0; this.stepTime = 0.1;
  },

  // ---- instruments -------------------------------------------------------
  _osc: function (freq, when, dur, type, peak, dest, det, slideTo) {
    var c = this.ctx;
    var o = c.createOscillator(), g = c.createGain();
    o.type = type; o.frequency.setValueAtTime(freq, when);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(Math.max(20, slideTo), when + dur);
    if (det) o.detune.value = det;
    g.gain.setValueAtTime(0.0001, when);
    g.gain.linearRampToValueAtTime(peak, when + 0.006);
    g.gain.setValueAtTime(peak, when + dur * 0.55);
    g.gain.exponentialRampToValueAtTime(0.0001, when + dur);
    o.connect(g); g.connect(dest);
    o.start(when); o.stop(when + dur + 0.02);
    return o;
  },
  gtrChord: function (midi, when, dur, muted, vel) {
    var f = note(midi), v = (vel || 1) * (muted ? 0.30 : 0.25);
    var d = muted ? Math.min(dur, this.stepTime * 0.85) : dur;
    this._osc(f, when, d, 'sawtooth', v, this.chGtr.inp, -7);
    this._osc(f * 1.4983, when, d, 'sawtooth', v * 0.92, this.chGtr.inp, 7);  // fifth
    this._osc(f * 2, when, d, 'sawtooth', v * 0.70, this.chGtr.inp, 3);       // octave
    this._osc(f * 2.9966, when, d, 'square', v * 0.28, this.chGtr.inp, -4);   // octave+fifth bite
  },
  // Slow-swelling stacked fifths. Three detuned voices per partial so it
  // shimmers instead of sitting still.
  padChord: function (midi, when, dur, vel) {
    var c = this.ctx, v = 0.235 * (vel || 1);
    var parts = [[0, 1.0], [7, 0.78], [12, 0.62], [19, 0.34]];
    var atk = Math.min(0.85, dur * 0.42), rel = Math.min(1.3, dur * 0.75);
    for (var i = 0; i < parts.length; i++) {
      for (var d = -1; d <= 1; d++) {
        var o = c.createOscillator(), g = c.createGain();
        o.type = 'sawtooth';
        o.frequency.setValueAtTime(note(midi + parts[i][0]), when);
        o.detune.value = d * 8 + (i % 2 ? 3 : -3);
        var pk = v * parts[i][1];
        g.gain.setValueAtTime(0.0001, when);
        g.gain.linearRampToValueAtTime(pk, when + atk);
        g.gain.setValueAtTime(pk, when + dur - rel);
        g.gain.exponentialRampToValueAtTime(0.0001, when + dur);
        o.connect(g); g.connect(this.chPad.inp);
        o.start(when); o.stop(when + dur + 0.04);
      }
    }
  },
  clnNote: function (midi, when, dur, vel) {
    var f = note(midi), v = 0.30 * (vel || 1);
    this._osc(f, when, dur, 'triangle', v, this.chCln.inp, -4);
    this._osc(f, when, dur, 'sawtooth', v * 0.45, this.chCln.inp, 6);
    this._osc(f * 2, when, dur, 'triangle', v * 0.22, this.chCln.inp, 0);
  },
  bassNote: function (midi, when, dur, vel) {
    this._osc(note(midi), when, dur, 'sawtooth', 0.42 * (vel || 1), this.chBass.inp, 0);
    this._osc(note(midi), when, dur, 'triangle', 0.30 * (vel || 1), this.chBass.inp, 6);
  },
  leadNote: function (midi, when, dur, vel, bendFrom) {
    var c = this.ctx, f = note(midi);
    var o = c.createOscillator(), g = c.createGain();
    o.type = 'sawtooth';
    if (bendFrom) {
      o.frequency.setValueAtTime(note(bendFrom), when);
      o.frequency.exponentialRampToValueAtTime(f, when + Math.min(0.09, dur * 0.4));
    } else o.frequency.setValueAtTime(f, when);
    // vibrato on anything held
    if (dur > 0.22) {
      var lfo = c.createOscillator(), la = c.createGain();
      lfo.frequency.value = 5.6; la.gain.value = 11;
      lfo.connect(la); la.connect(o.detune);
      lfo.start(when + 0.1); lfo.stop(when + dur + 0.02);
    }
    g.gain.setValueAtTime(0.0001, when);
    g.gain.linearRampToValueAtTime(0.5 * (vel || 1), when + 0.012);
    g.gain.setValueAtTime(0.42 * (vel || 1), when + dur * 0.6);
    g.gain.exponentialRampToValueAtTime(0.0001, when + dur);
    o.connect(g); g.connect(this.chLead.inp);
    o.start(when); o.stop(when + dur + 0.03);
  },
  _noiseAt: function (when, dur, peak, type, freq, q, dest) {
    var c = this.ctx;
    var s = c.createBufferSource(); s.buffer = this.noiseBuf;
    var f = c.createBiquadFilter(); f.type = type; f.frequency.value = freq; f.Q.value = q || 1;
    var g = c.createGain();
    g.gain.setValueAtTime(peak, when);
    g.gain.exponentialRampToValueAtTime(0.0001, when + dur);
    s.connect(f); f.connect(g); g.connect(dest || this.drumGain);
    s.start(when); s.stop(when + dur + 0.02);
  },
  dKick: function (when, vel) {
    var c = this.ctx, o = c.createOscillator(), g = c.createGain();
    o.type = 'sine';
    o.frequency.setValueAtTime(165, when);
    o.frequency.exponentialRampToValueAtTime(49, when + 0.10);
    g.gain.setValueAtTime(0.86 * vel, when);
    g.gain.exponentialRampToValueAtTime(0.001, when + 0.19);
    o.connect(g); g.connect(this.drumGain);
    o.start(when); o.stop(when + 0.22);
    this._noiseAt(when, 0.022, 0.30 * vel, 'highpass', 1800, 1);
  },
  dSnare: function (when, vel) {
    var c = this.ctx, o = c.createOscillator(), g = c.createGain();
    o.type = 'triangle'; o.frequency.setValueAtTime(196, when);
    o.frequency.exponentialRampToValueAtTime(120, when + 0.08);
    g.gain.setValueAtTime(0.42 * vel, when);
    g.gain.exponentialRampToValueAtTime(0.001, when + 0.11);
    o.connect(g); g.connect(this.drumGain);
    o.start(when); o.stop(when + 0.13);
    this._noiseAt(when, 0.17, 0.74 * vel, 'bandpass', 1900, 0.7);
    this._noiseAt(when, 0.09, 0.42 * vel, 'highpass', 4200, 0.7);
  },
  dHat: function (when, open, vel) {
    this._noiseAt(when, open ? 0.19 : 0.04, (open ? 0.30 : 0.36) * vel, 'highpass', 6900, 0.8);
  },
  dCrash: function (when, vel) {
    this._noiseAt(when, 1.2, 0.46 * vel, 'highpass', 4600, 0.5);
    this._noiseAt(when, 0.5, 0.20 * vel, 'bandpass', 3400, 0.4);
  },
  dTom: function (when, midi, vel) {
    var c = this.ctx, o = c.createOscillator(), g = c.createGain();
    o.type = 'sine';
    o.frequency.setValueAtTime(note(midi) * 2, when);
    o.frequency.exponentialRampToValueAtTime(note(midi), when + 0.16);
    g.gain.setValueAtTime(0.6 * vel, when);
    g.gain.exponentialRampToValueAtTime(0.001, when + 0.2);
    o.connect(g); g.connect(this.drumGain);
    o.start(when); o.stop(when + 0.22);
    this._noiseAt(when, 0.1, 0.14 * vel, 'bandpass', 700, 1);
  },

  // ---- sequencer ---------------------------------------------------------
  setSong: function (s) {
    this.song = s || null;
    this.step = 0;
    if (s) {
      this.stepTime = 60 / s.bpm / 4;
      this.nextTime = Math.max(this.nextTime, this.ctx.currentTime + 0.05);
    }
  },
  stop: function () { this.song = null; },
  update: function () {
    if (!this.started || this.muted || !this.song) return;
    var t = this.ctx.currentTime;
    if (this.nextTime < t) this.nextTime = t + 0.02;
    while (this.nextTime < t + 0.16) {
      this._step(this.step, this.nextTime);
      this.step++;
      this.nextTime += this.stepTime;
    }
  },
  _step: function (gi, when) {
    var s = this.song, flat = s.flat;
    var slot = flat[gi % flat.length];
    var p = s.patterns[slot.p], i = slot.i;
    var st = this.stepTime;

    function val(track, k) { return track && track[k] !== undefined ? track[k] : 0; }

    // guitar: 0 rest, -1 hold, else MIDI root of a power chord
    var gn = val(p.gtr, i);
    if (gn > 0) {
      var hold = 1;
      while (i + hold < p.len && p.gtr[i + hold] === -1) hold++;
      var muted = p.pm ? !!p.pm[i] : true;
      this.gtrChord(gn, when, st * hold * (muted ? 1 : 1.15), muted, p.gv || 1);
    }
    var pd = val(p.pad, i);
    if (pd > 0) {
      var ph = 1;
      while (i + ph < p.len && p.pad[i + ph] === -1) ph++;
      this.padChord(pd, when, st * ph, p.pv || 1);
    }
    var cl = val(p.cln, i);
    if (cl > 0) {
      var ch = 1;
      while (i + ch < p.len && p.cln[i + ch] === -1) ch++;
      this.clnNote(cl, when, st * ch * 0.98, p.cv || 1);
    }
    var bn = val(p.bass, i);
    if (bn > 0) {
      var bh = 1;
      while (i + bh < p.len && p.bass[i + bh] === -1) bh++;
      this.bassNote(bn, when, st * bh * 0.95, 1);
    }
    var ln = val(p.lead, i);
    if (ln > 0) {
      var lh = 1;
      while (i + lh < p.len && p.lead[i + lh] === -1) lh++;
      this.leadNote(ln, when, st * lh * 0.98, p.lv || 1, p.bend && p.bend[i] ? p.bend[i] : 0);
    }
    var k = val(p.kick, i); if (k) this.dKick(when, k > 1 ? 1.1 : 0.92);
    var sn = val(p.snr, i); if (sn) this.dSnare(when, sn > 1 ? 1.05 : 0.85);
    var h = val(p.hat, i); if (h) this.dHat(when, false, h > 1 ? 1.15 : 0.7);
    var oh = val(p.opn, i); if (oh) this.dHat(when, true, 0.9);
    var cr = val(p.crash, i); if (cr) this.dCrash(when, 1);
    var tm = val(p.tom, i); if (tm) this.dTom(when, tm, 0.9);
  }
};

// ===================== SONGS ==============================================
function note(n) { return 440 * Math.pow(2, (n - 69) / 12); }

// note helpers (MIDI): E1=28 E2=40 E3=52 E4=64
function cat() {
  var o = [];
  for (var i = 0; i < arguments.length; i++) o = o.concat(arguments[i]);
  return o;
}
function gal(n) { return [n, 0, n, n]; }            // gallop: 8th + two 16ths
function q4(n) { return [n, -1, -1, -1]; }          // held quarter
function e8(a, b) { return [a, -1, b, -1]; }        // two eighths
function s16(a, b, c, d) { return [a, b, c, d]; }
function rep(arr, n) { var o = []; for (var i = 0; i < n; i++) o = o.concat(arr); return o; }
function rest(n) { var o = []; for (var i = 0; i < n; i++) o.push(0); return o; }
function w(n, k) { var o = [n]; for (var i = 1; i < k; i++) o.push(-1); return o; }  // held n steps
// drum shorthand: '-' rest, 'x' hit, 'X' accent
function D(str) {
  var a = [], t = str.replace(/[^-xX]/g, '');
  for (var i = 0; i < t.length; i++) a.push(t[i] === '-' ? 0 : (t[i] === 'X' ? 2 : 1));
  return a;
}
function flatten(order, patterns) {
  var f = [];
  for (var i = 0; i < order.length; i++) {
    var p = patterns[order[i]];
    for (var j = 0; j < p.len; j++) f.push({ p: order[i], i: j });
  }
  return f;
}
function song(bpm, order, patterns) {
  for (var k in patterns) if (!patterns[k].len) patterns[k].len = 32;
  return { bpm: bpm, order: order, patterns: patterns, flat: flatten(order, patterns) };
}

var SONGS = {};

// ------------------------------------------- TITLE — "The Sky Still Owes Him"
// A slow burn: pad alone, then one guitar line answering it, then the kit walks
// in on a tom ramp and the whole band lands on the hook. Loops from the top.
SONGS.title = song(132, ['F1', 'F2', 'R', 'A', 'A2', 'B', 'A', 'A2', 'B', 'C', 'X'], {
  // ---- I. the fanfare: big open chords, a soaring lead, no kit yet --------
  F1: {
    pad:  cat(w(40, 16), w(36, 16)), pv: 1,
    gtr:  cat(w(40, 16), w(36, 16)), pm: rep([0, 0, 0, 0], 8), gv: 0.95,
    bass: cat(w(28, 16), w(24, 16)),
    lead: cat(w(76, 10), w(74, 6), w(72, 10), w(71, 6)), lv: 0.9,
    kick: D('x---------------x---------------'),
    crash:D('x---------------x---------------')
  },
  F2: {
    pad:  cat(w(45, 16), w(35, 16)), pv: 1,
    gtr:  cat(w(45, 16), w(35, 8), w(38, 8)), pm: rep([0, 0, 0, 0], 8), gv: 0.95,
    bass: cat(w(33, 16), w(35, 8), w(26, 8)),
    lead: cat(w(79, 10), w(78, 6), w(76, 6), w(74, 4), w(71, 6)), lv: 1,
    kick: D('x---------------x-------x-------'),
    crash:D('x--------------- ---------------'),
    tom:  D('---------------- --------x-x-x-x-')
  },

  // ---- III. the ramp: toms build, guitar starts chugging ------------------
  R: {
    pad:  cat(w(47, 32)), pv: 0.8,
    gtr:  cat(rep([47, 47, 47, 47], 4), rep([47, 47, 47, 47], 4)),
    pm:   rep([1, 1, 1, 1], 8), gv: 0.7,
    bass: cat(rep([35, 0, 35, 35], 4), rep([35, 0, 35, 35], 4)),
    kick: D('x-x-x-x-x-x-x-x- x-x-x-x-x-x-x-x-'),
    tom:  D('--------x-x-x-x- x-xxx-xxXxXxXxXx'),
    hat:  D('x-x-x-x-x-x-x-x- x-x-x-x-x-x-x-x-')
  },

  // ---- IV. the hook -------------------------------------------------------
  A: {
    pad:  cat(w(40, 16), w(43, 8), w(36, 8)), pv: 0.6,
    gtr:  cat(gal(40), gal(40), s16(43, 0, 43, 0), q4(41),
              gal(40), gal(40), s16(36, 0, 36, 0), q4(38)),
    pm:   rep([1, 1, 1, 1], 8), gv: 1,
    bass: cat(rep([28, 0, 28, 28], 2), e8(31, 31), e8(29, 29),
              rep([28, 0, 28, 28], 2), e8(24, 24), e8(26, 26)),
    lead: cat(w(76, 6), w(74, 2), w(71, 8), w(72, 6), w(74, 2), w(76, 8)), lv: 0.95,
    kick: D('x--xx---x--xx--- x--xx---x--xx---'),
    snr:  D('----X-------X--- ----X-------X---'),
    hat:  D('x-x-x-x-x-x-x-x- x-x-x-x-x-x-x-x-'),
    crash:D('x--------------- ----------------')
  },
  A2: {
    pad:  cat(w(45, 16), w(35, 16)), pv: 0.6,
    gtr:  cat(gal(45), gal(45), s16(43, 0, 43, 0), q4(41),
              gal(40), gal(40), e8(35, 35), s16(38, 0, 40, 0)),
    pm:   rep([1, 1, 1, 1], 8), gv: 1,
    bass: cat(rep([33, 0, 33, 33], 2), e8(31, 31), e8(29, 29),
              rep([28, 0, 28, 28], 2), e8(23, 23), s16(26, 0, 28, 0)),
    lead: cat(w(79, 6), w(78, 2), w(76, 6), w(74, 2),
              w(72, 4), w(71, 4), w(69, 4), w(71, 4)), lv: 0.95,
    kick: D('x--xx---x--xx--- x--xx---x--xx-x-'),
    snr:  D('----X-------X--- ----X-------X-X-'),
    hat:  D('x-x-x-x-x-x-x-x- x-x-x-x-x-x-x-x-')
  },

  // ---- V. the lift --------------------------------------------------------
  B: {
    pad:  cat(w(48, 8), w(47, 8), w(45, 8), w(43, 8)), pv: 0.75,
    gtr:  cat(q4(48), q4(48), q4(47), q4(47), q4(45), q4(45), gal(43), s16(43, 0, 41, 0)),
    pm:   rep([0, 0, 0, 0], 8), gv: 1,
    bass: cat(e8(36, 36), e8(36, 36), e8(35, 35), e8(35, 35),
              e8(33, 33), e8(33, 33), rep([31, 0, 31, 31], 1), s16(31, 0, 29, 0)),
    lead: cat(w(84, 8), w(83, 4), w(81, 4), w(79, 6), w(81, 2), w(83, 8)), lv: 1,
    kick: D('x---x---x---x--- x---x---x--xx---'),
    snr:  D('----X-------X--- ----X-------X---'),
    opn:  D('x-x-x-x-x-x-x-x- x-x-x-x-x-x-x-x-'),
    crash:D('x-------x------- x---------------')
  },

  // ---- VI. breakdown, half time ------------------------------------------
  C: {
    pad:  cat(w(40, 32)), pv: 1,
    gtr:  cat(rep([40, 0, 40, 0], 4), rep([38, 0, 38, 0], 2), rep([36, 0, 36, 0], 2)),
    pm:   rep([1, 1, 1, 1], 8), gv: 0.8,
    bass: cat(w(28, 16), w(26, 8), w(24, 8)),
    kick: D('x-------x------- x-------x-------'),
    snr:  D('--------X------- --------X-------'),
    lead: cat(rest(16), w(71, 4), w(72, 4), w(74, 8)), lv: 0.6
  },

  // ---- VII. turnaround back to the top -----------------------------------
  X: {
    pad:  cat(w(47, 32)), pv: 0.9,
    gtr:  cat(rep([47, 47, 47, 47], 4), q4(45), q4(45), gal(43), s16(43, 43, 41, 41)),
    pm:   rep([1, 1, 1, 1], 8), gv: 1,
    bass: cat(rep([35, 0, 35, 35], 4), e8(33, 33), e8(33, 33), e8(31, 31), s16(31, 0, 29, 0)),
    kick: D('x-x-x-x-x-x-x-x- x---x---x--xx---'),
    snr:  D('----X-------X--- ----X---X-X-XxXx'),
    tom:  D('---------------- --------x-x-x-x-'),
    hat:  D('x-x-x-x-x-x-x-x- x-x-x-x---------'),
    crash:D('x--------------- ----------------')
  }
});

// -------------------------------------------- EPISODE I — "Ashen Gallop"
SONGS.ep1 = song(154, ['I', 'A', 'A', 'B', 'B', 'C', 'A', 'B'], {
  I: { // intro: drums + bass only, builds
    bass: cat(rep([28, 0, 28, 28], 4), rep([28, 0, 31, 29], 4)),
    kick: D('x-xxx-x-x-xxx-x- x-xxx-x-x-xxx-x-'),
    snr:  D('----x-------x--- ----x-------x-x-'),
    hat:  D('x-x-x-x-x-x-x-x- x-x-x-x-x-x-xxxx'),
    crash:D('x--------------- ----------------')
  },
  A: { // verse riff: E5 gallop with a Phrygian flat-two lean
    gtr:  cat(gal(40), gal(40), gal(43), gal(41),
              gal(40), gal(40), gal(45), s16(43, 0, 41, 0)),
    pm:   rep([1, 1, 1, 1], 8),
    bass: cat(rep([28, 0, 28, 28], 2), rep([31, 0, 31, 31], 1), rep([29, 0, 29, 29], 1),
              rep([28, 0, 28, 28], 2), rep([33, 0, 33, 33], 1), s16(31, 0, 29, 0)),
    kick: D('x-xxx---x-xxx--- x-xxx---x-xx-x--'),
    snr:  D('----x-------x--- ----x-------x---'),
    hat:  D('x-x-x-x-x-x-x-x- x-x-x-x-x-x-x-xx'),
    crash:D('x--------------- ----------------')
  },
  B: { // chorus: big ringing chords under a soaring lead
    gtr:  cat(q4(40), q4(43), q4(41), q4(40), q4(45), q4(43), q4(41), q4(38)),
    pm:   rep([0, 0, 0, 0], 8),
    bass: cat(e8(28, 35), e8(31, 38), e8(29, 36), e8(28, 35),
              e8(33, 40), e8(31, 38), e8(29, 36), e8(26, 33)),
    lead: cat(q4(76), s16(74, -1, 71, -1), q4(72), s16(71, -1, 69, -1),
              q4(71), s16(69, -1, 67, -1), q4(66), q4(64)),
    bend: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
           69, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
    kick: D('x---x-x-x---x-x- x---x-x-x---x---'),
    snr:  D('----x-------x--- ----x-------x-xx'),
    hat:  D('x-x-x-x-x-x-x-x- x-x-x-x-x-x-x-x-'),
    opn:  D('-------x---------------x--------'),
    crash:D('x--------------- ----------------')
  },
  C: { // breakdown: half-time chug, then a tom fill back into the riff
    gtr:  cat(rep([40, 0, 0, 0], 2), rep([41, 0, 0, 0], 2),
              rep([38, 0, 0, 0], 2), s16(40, 0, 40, 0), rest(4)),
    pm:   rep([1, 1, 1, 1], 8),
    bass: cat(rep([28, 0, 0, 0], 2), rep([29, 0, 0, 0], 2),
              rep([26, 0, 0, 0], 2), s16(28, 0, 28, 0), rest(4)),
    kick: D('x-------x------- x-------x-x-----'),
    snr:  D('----x-------x--- ----x-----------'),
    hat:  D('x---x---x---x--- x---x-----------'),
    tom:  cat(rest(28), [45, 43, 40, 38]),
    crash:D('x--------------- ----------------')
  }
});

// ------------------------------------------ EPISODE II — "Drowned Choir"
SONGS.ep2 = song(142, ['A', 'A', 'B', 'C', 'B', 'B'], {
  A: { // verse: ringing arpeggio over a walking bass, A minor
    gtr:  cat(s16(45, 0, 52, 0), s16(57, 0, 52, 0), s16(43, 0, 50, 0), s16(55, 0, 50, 0),
              s16(41, 0, 48, 0), s16(53, 0, 48, 0), s16(40, 0, 47, 0), s16(52, 0, 47, 0)),
    pm:   rep([0, 0, 0, 0], 8),
    bass: cat(rep([33, 0, 33, 0], 2), rep([31, 0, 31, 0], 2),
              rep([29, 0, 29, 0], 2), rep([28, 0, 28, 0], 2)),
    kick: D('x-------x---x--- x-------x---x---'),
    snr:  D('----x-------x--- ----x-------x---'),
    hat:  D('x-x-x-x-x-x-x-x- x-x-x-x-x-x-x-x-'),
    crash:D('x--------------- ----------------'),
    gv: 0.8
  },
  B: { // chorus: full distortion, driving eighths, lead over the top
    gtr:  cat(rep([45, 0, 45, 0], 2), rep([41, 0, 41, 0], 2),
              rep([43, 0, 43, 0], 2), rep([40, 0, 40, 40], 2)),
    pm:   rep([1, 1, 1, 1], 8),
    bass: cat(rep([33, 0, 33, 33], 2), rep([29, 0, 29, 29], 2),
              rep([31, 0, 31, 31], 2), rep([28, 0, 28, 28], 2)),
    lead: cat(q4(69), s16(72, -1, 76, -1), q4(74), s16(72, -1, 69, -1),
              q4(67), s16(69, -1, 72, -1), q4(71), q4(69)),
    kick: D('x-x-x---x-x-x--- x-x-x---x-x-x---'),
    snr:  D('----x-------x--- ----x-------x-x-'),
    hat:  D('x-x-x-x-x-x-x-x- x-x-x-x-x-x-x-x-'),
    opn:  D('---------------x---------------x'),
    crash:D('x--------------- ----------------')
  },
  C: { // bridge: minor-key climb, no lead, all momentum
    gtr:  cat(gal(41), gal(43), gal(45), gal(46),
              gal(48), gal(46), gal(45), s16(43, 0, 41, 0)),
    pm:   rep([1, 1, 1, 1], 8),
    bass: cat(rep([29, 0, 29, 29], 1), rep([31, 0, 31, 31], 1),
              rep([33, 0, 33, 33], 1), rep([34, 0, 34, 34], 1),
              rep([36, 0, 36, 36], 1), rep([34, 0, 34, 34], 1),
              rep([33, 0, 33, 33], 1), s16(31, 0, 29, 0)),
    kick: D('x-xxx---x-xxx--- x-xxx---x-xxx---'),
    snr:  D('----x-------x--- ----x-------x---'),
    hat:  D('xxxxxxxxxxxxxxxx xxxxxxxxxxxxxxxx'),
    crash:D('x--------------- ----------------')
  }
});

// --------------------------------------- EPISODE III — "Citadel of Hours"
SONGS.ep3 = song(170, ['A', 'A', 'B', 'B', 'C', 'B', 'B'], {
  A: { // fast tremolo-picked ascent in D minor
    gtr:  cat(s16(38, 38, 38, 38), s16(41, 41, 41, 41), s16(43, 43, 43, 43), s16(45, 45, 45, 45),
              s16(46, 46, 46, 46), s16(45, 45, 45, 45), s16(43, 43, 43, 43), s16(41, 41, 40, 38)),
    pm:   rep([1, 1, 1, 1], 8),
    bass: cat(rep([26, 0, 26, 0], 2), rep([31, 0, 31, 0], 2),
              rep([34, 0, 34, 0], 2), rep([29, 0, 26, 0], 2)),
    kick: D('x---x---x---x--- x---x---x---x---'),
    snr:  D('----x-------x--- ----x-------x---'),
    hat:  D('xxxxxxxxxxxxxxxx xxxxxxxxxxxxxxxx'),
    crash:D('x--------------- ----------------')
  },
  B: { // chorus: wide chords, lead screaming above
    gtr:  cat(q4(38), q4(45), q4(43), q4(41), q4(38), q4(46), q4(45), q4(43)),
    pm:   rep([0, 0, 0, 0], 8),
    bass: cat(rep([26, 0, 26, 26], 1), rep([33, 0, 33, 33], 1),
              rep([31, 0, 31, 31], 1), rep([29, 0, 29, 29], 1),
              rep([26, 0, 26, 26], 1), rep([34, 0, 34, 34], 1),
              rep([33, 0, 33, 33], 1), rep([31, 0, 31, 31], 1)),
    lead: cat(q4(81), s16(79, -1, 77, -1), q4(74), s16(77, -1, 79, -1),
              q4(81), s16(82, -1, 81, -1), q4(79), q4(74)),
    bend: cat(rest(16), [83, 0, 0, 0], rest(12)),
    kick: D('x-x-x---x-x-x--- x-x-x---x-x-x---'),
    snr:  D('----x-------x--- ----x-------x-xx'),
    hat:  D('x-x-x-x-x-x-x-x- x-x-x-x-x-x-x-x-'),
    opn:  D('-------x---------------x--------'),
    crash:D('x--------------- ----------------')
  },
  C: { // bridge: stop-start stabs
    gtr:  cat(s16(38, 0, 0, 38), s16(0, 38, 0, 0), s16(41, 0, 0, 41), s16(0, 41, 0, 0),
              s16(43, 0, 0, 43), s16(0, 43, 0, 0), s16(45, 45, 46, 46), s16(48, 48, 50, 50)),
    pm:   rep([1, 1, 1, 1], 8),
    bass: cat(s16(26, 0, 0, 26), s16(0, 26, 0, 0), s16(29, 0, 0, 29), s16(0, 29, 0, 0),
              s16(31, 0, 0, 31), s16(0, 31, 0, 0), s16(33, 33, 34, 34), s16(36, 36, 38, 38)),
    kick: D('x--x-x---x-x-x-- x--x-x---xxxxxxx'),
    snr:  D('----x-------x--- ----x-------x---'),
    hat:  D('--x---x---x---x- --x---x---x---x-'),
    crash:D('x--------------- ----------------')
  }
});

// ------------------------------------------------- BOSS — "The Hour-Sphinx"
SONGS.boss = song(178, ['I', 'A', 'A', 'B', 'A', 'C', 'B'], {
  I: { // chromatic siren of an intro
    gtr:  cat(rep([40, 0, 0, 0], 1), rep([41, 0, 0, 0], 1), rep([42, 0, 0, 0], 1), rep([43, 0, 0, 0], 1),
              rep([43, 0, 0, 0], 1), rep([42, 0, 0, 0], 1), rep([41, 0, 0, 0], 1), rep([40, 0, 0, 0], 1)),
    pm:   rep([0, 0, 0, 0], 8),
    bass: cat(q4(28), q4(29), q4(30), q4(31), q4(31), q4(30), q4(29), q4(28)),
    kick: D('x-------x------- x-------x-------'),
    snr:  D('--------x---------------x-------'),
    hat:  D('x-x-x-x-x-x-x-x- x-x-x-x-x-x-x-x-'),
    crash:D('x---------------x---------------')
  },
  A: { // main riff: chromatic chug, E - F - G - F#
    gtr:  cat(s16(40, 40, 0, 40), s16(0, 40, 41, 0), s16(40, 40, 0, 40), s16(0, 43, 42, 0),
              s16(40, 40, 0, 40), s16(0, 40, 41, 0), s16(43, 0, 42, 0), s16(41, 0, 40, 0)),
    pm:   rep([1, 1, 1, 1], 8),
    bass: cat(s16(28, 28, 0, 28), s16(0, 28, 29, 0), s16(28, 28, 0, 28), s16(0, 31, 30, 0),
              s16(28, 28, 0, 28), s16(0, 28, 29, 0), s16(31, 0, 30, 0), s16(29, 0, 28, 0)),
    kick: D('xx-x--x-xx-x--x- xx-x--x-x-x-x-x-'),
    snr:  D('----x-------x--- ----x-------x---'),
    hat:  D('xxxxxxxxxxxxxxxx xxxxxxxxxxxxxxxx'),
    crash:D('x--------------- ----------------')
  },
  B: { // half-time chorus — the Sphinx's theme, heavy and slow-swinging
    gtr:  cat(rep([40, -1, -1, -1], 2), rep([36, -1, -1, -1], 2),
              rep([38, -1, -1, -1], 2), rep([41, -1, -1, -1], 2)),
    pm:   rep([0, 0, 0, 0], 8),
    bass: cat(rep([28, 0, 28, 0], 2), rep([24, 0, 24, 0], 2),
              rep([26, 0, 26, 0], 2), rep([29, 0, 29, 0], 2)),
    lead: cat(q4(76), q4(75), q4(76), s16(79, -1, 76, -1),
              q4(83), q4(81), q4(79), q4(76)),
    bend: cat(rest(16), [81, 0, 0, 0], rest(12)),
    kick: D('x-------x------- x-------x-------'),
    snr:  D('--------X---------------X-------'),
    hat:  D('x---x---x---x--- x---x---x---x---'),
    crash:D('x---------------x---------------')
  },
  C: { // solo section: double-kick under a runaway lead
    gtr:  cat(rep([40, 40, 40, 40], 4), rep([41, 41, 41, 41], 2), rep([43, 43, 43, 43], 2)),
    pm:   rep([1, 1, 1, 1], 8),
    bass: cat(rep([28, 28, 28, 28], 4), rep([29, 29, 29, 29], 2), rep([31, 31, 31, 31], 2)),
    lead: cat(s16(76, 79, 83, 79), s16(76, 79, 83, 86), s16(83, 79, 76, 79), s16(83, 86, 88, 86),
              s16(84, 81, 77, 81), s16(84, 88, 89, 88), s16(86, 83, 79, 83), s16(86, 88, 91, -1)),
    kick: D('xxxxxxxxxxxxxxxx xxxxxxxxxxxxxxxx'),
    snr:  D('----x-------x--- ----x---x---x-x-'),
    hat:  D('--x---x---x---x- --x---x---x---x-'),
    crash:D('x--------------- x---------------'),
    lv: 0.8
  }
});

// ------------------------------------------------------- streamed soundtrack
// Generated tracks live in sound/*.mp3 next to index.html. If they load, they
// replace the procedural sequencer; if they don't (index.html travelling as a
// bare single file, or a decode failure), the sequencer plays exactly as
// before. So the single-file promise still holds — files are an upgrade, not
// a dependency.
var MUSIC_FILES = {
  title:  'sound/00_title.mp3',
  ep1:    'sound/01_ashen_canyon.mp3',
  ep2:    'sound/02_the_drowned_choir.mp3',
  ep3:    'sound/03_citadel_hours.mp3',
  boss:   'sound/04_hour_sphinx.mp3',
  ending: 'sound/05_ending.mp3'
};
var MUSIC_VOL = 0.48;                 // mastered tracks sit UNDER the synth SFX
var streams = {}, streamDead = false, curStream = null, fadeTimer = null;

function streamFor(k) {
  if (streamDead || !MUSIC_FILES[k]) return null;
  if (!streams[k]) {
    var a = new window.Audio(MUSIC_FILES[k]);
    a.loop = true;
    a.preload = 'auto';
    a.volume = 0;
    a.addEventListener('playing', function () {
      // only silence the sequencer once audio is genuinely rolling — a
      // rejected play() must never leave the game mute
      if (curStream === a) {
        Audio_.setSong(null);
        // mastered tracks flatten the little synth SFX; push the SFX bus up
        // while a stream carries the music
        if (Audio_.sfxGain) Audio_.sfxGain.gain.setTargetAtTime(0.95, Audio_.ctx.currentTime, 0.15);
      }
    });
    a.addEventListener('error', function () {
      // one failure condemns the whole set — half-streamed music is worse
      // than none, and the common cause (no sound/ folder) affects all six
      streamDead = true;
      if (curStream) { try { curStream.pause(); } catch (e) {} curStream = null; }
      if (Audio_.sfxGain) Audio_.sfxGain.gain.setTargetAtTime(0.5, Audio_.ctx.currentTime, 0.1);
      if (pendingKey) Audio_.setSong(SONGS[pendingKey] || null);
    });
    streams[k] = a;
  }
  return streams[k];
}

function fadeStreams(next) {
  if (fadeTimer) clearInterval(fadeTimer);
  var prev = curStream;
  curStream = next;
  fadeTimer = setInterval(function () {
    var done = true;
    if (prev && prev !== next) {
      prev.volume = Math.max(0, prev.volume - 0.08);
      if (prev.volume <= 0.001) { try { prev.pause(); } catch (e) {} }
      else done = false;
    }
    if (next) {
      var tv = Audio_.muted ? 0 : MUSIC_VOL;
      next.volume = Math.min(tv, next.volume + 0.06);
      if (Math.abs(next.volume - tv) > 0.001) done = false;
    }
    if (done) { clearInterval(fadeTimer); fadeTimer = null; }
  }, 50);
}

var pendingKey = null;
function playMusic(k) {
  if (!Audio_.started) return;
  pendingKey = k;
  if (!k) {                                   // explicit stop
    if (curStream) fadeStreams(null);
    Audio_.setSong(null);
    return;
  }
  // the sequencer starts (or keeps) playing regardless; the stream's
  // 'playing' event silences it once real audio is confirmed rolling
  Audio_.setSong(SONGS[k] || (k === 'ending' ? SONGS.title : null));
  var st = streamFor(k);
  if (st) {
    fadeStreams(st);
    var p = st.play();
    if (p && p.catch) p.catch(function () {
      // autoplay-gated (Safari): retry on the next real input
      var retry = function () {
        if (pendingKey === k && !streamDead) {
          var q = st.play();
          if (q && q.catch) q.catch(function () {});
        }
      };
      window.addEventListener('pointerdown', retry, { once: true });
      window.addEventListener('keydown', retry, { once: true });
    });
  }
}
function setStreamMuted(m) {
  if (curStream) curStream.volume = m ? 0 : MUSIC_VOL;
}
// introspection for the check tools
function musicState() {
  return {
    stream: curStream ? curStream.src.split('/').pop() : null,
    playing: !!(curStream && !curStream.paused),
    volume: curStream ? +curStream.volume.toFixed(2) : 0,
    dead: streamDead,
    pending: pendingKey,
    seq: !!Audio_.song
  };
}

// ------------------------------------------------------------------ export
window.__PF = {
  TAU: TAU, clamp: clamp, lerp: lerp, damp: damp, rand: rand, randi: randi,
  pick: pick, angDelta: angDelta, V3: V3, tmpA: tmpA, tmpB: tmpB, tmpC: tmpC,
  renderer: renderer, scene: scene, camera: camera, resize: resize,
  M: M, G: G, retroPatch: retroPatch, setMaxH: setMaxH,
  setRetro: setRetro, toggleRetro: toggleRetro, isRetro: function () { return RETRO_ON; },
  skyUni: skyUni, skyMesh: skyMesh,
  ambLight: ambLight, keyLight: keyLight, rimLight: rimLight,
  trackShadow: trackShadow, setShadows: setShadows, toggleShadows: toggleShadows,
  setSunDir: setSunDir,
  shadowsOn: function () { return SHADOWS_ON; },
  Audio_: Audio_, playMusic: playMusic, musicState: musicState, note: note, SONGS: SONGS,
  hudCanvas: hudCanvas, hx: hx, glCanvas: glCanvas,
  el: { flash: elFlash, card: elCard, toast: elToast, pause: elPause, skip: elSkip, quip: elQuip,
        title: elTitle, over: elOver, win: elWin, loading: elLoading,
        perf: document.getElementById('perf') },
  HUD: (window.HUD = { w: window.innerWidth, h: window.innerHeight })
};

})();
