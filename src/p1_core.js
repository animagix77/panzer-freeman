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
  // musicGain is gone with the synth band: the soundtrack is an <audio>
  // element now and never enters this graph, so master -> sfxGain is the
  // whole music-side story.
  ctx: null, master: null, sfxGain: null,
  muted: false, started: false,

  init: function (ctxOverride) {
    if (this.started && !ctxOverride) return;
    var AC = window.AudioContext || window.webkitAudioContext;
    if (!AC && !ctxOverride) return;
    this.ctx = ctxOverride || new AC();
    this.master = this.ctx.createGain();  this.master.gain.value = 0.55;
    this.sfxGain = this.ctx.createGain();  this.sfxGain.gain.value = SFX_GAIN;
    this.sfxGain.connect(this.master);
    this.master.connect(this.ctx.destination);
    this.noiseBuf = this._noise();
    this.started = true;
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

  // The procedural rock engine that used to live here — three distortion
  // channels, a 16th-note tracker sequencer and five hand-written songs —
  // has been removed. It only ever existed to cover the gap before
  // sound/*.mp3 finished buffering, and that gap is exactly where you heard
  // it: a chiptune band opening a game whose score is recorded. The SFX
  // synth above is a separate graph and is untouched.
  stop: function () { stopStream(); },
  update: function () {}       // the frame loop calls this; nothing to drive now
};

// ------------------------------------------------------- streamed soundtrack
// Generated tracks live in sound/*.mp3 next to index.html. These ARE the score
// now — there is no synth fallback behind them. If they fail to load the game
// runs with SFX only, which is the right silence: the chiptune band that used
// to fill the gap was worse than nothing under a recorded soundtrack.
var MUSIC_FILES = {
  title:  'sound/00_title.mp3',
  ep1:    'sound/01_ashen_canyon.mp3',
  ep2:    'sound/02_the_drowned_choir.mp3',
  ep3:    'sound/03_citadel_hours.mp3',
  boss:   'sound/04_hour_sphinx.mp3',
  ending: 'sound/05_ending.mp3'
};
var MUSIC_VOL = 0.48;                 // mastered tracks sit UNDER the synth SFX
// One level, not two. The old 0.5 existed because the synth band shared this
// WebAudio graph and SFX at full level buried it. The score is an <audio>
// element now — it never touches this bus — so there is nothing left to duck
// for, and 0.5 only meant the effects were quiet for the second before the
// first mp3 rolled, and quiet forever if it never did.
var SFX_GAIN = 0.95;
var streams = {}, streamDead = false, curStream = null, fadeTimer = null;

function streamFor(k) {
  if (streamDead || !MUSIC_FILES[k]) return null;
  if (!streams[k]) {
    var a = new window.Audio(MUSIC_FILES[k]);
    a.loop = true;
    a.preload = 'auto';
    a.volume = 0;
    // nothing to do when playback starts any more — the SFX bus no longer
    // shares a graph with the music, so it does not have to get out of the way
    a.addEventListener('error', function () {
      // one failure condemns the whole set — half-streamed music is worse
      // than none, and the common cause (no sound/ folder) affects all six
      streamDead = true;
      if (curStream) { try { curStream.pause(); } catch (e) {} curStream = null; }
      // nothing to fall back to; the game runs on sound effects from here
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
function stopStream() {
  pendingKey = null;
  if (curStream) fadeStreams(null);
}
function playMusic(k) {
  if (!Audio_.started) return;
  pendingKey = k;
  if (!k) { stopStream(); return; }           // explicit stop
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
    pending: pendingKey
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
  Audio_: Audio_, playMusic: playMusic, musicState: musicState,
  hudCanvas: hudCanvas, hx: hx, glCanvas: glCanvas,
  el: { flash: elFlash, card: elCard, toast: elToast, pause: elPause, skip: elSkip, quip: elQuip,
        title: elTitle, over: elOver, win: elWin, loading: elLoading,
        perf: document.getElementById('perf') },
  HUD: (window.HUD = { w: window.innerWidth, h: window.innerHeight })
};

})();
