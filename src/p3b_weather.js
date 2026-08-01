/* =========================================================================
   Part 3b — weather, embers and surface response.

   Everything here lives in a box that follows the camera and wraps, so a few
   hundred particles cover an infinite sky. Rain is LineSegments (a point can't
   streak); snow and embers are Points. All three are one draw call each and
   are skipped entirely when an episode doesn't ask for them.

   The surface response walks the shared material cache and pushes shininess up
   in rain / desaturates in snow, so the weather lands on the world instead of
   sitting in front of it as an overlay.
   ========================================================================= */
(function () {
var P = window.__PF;
var V3 = P.V3, clamp = P.clamp, lerp = P.lerp, rand = P.rand, damp = P.damp;

var BOX = { x: 150, y: 120, z: 260 };     // half-extents around the camera

function fill(n, f) { var a = []; for (var i = 0; i < n; i++) a.push(f(i)); return a; }

// ------------------------------------------------------------------- rain
function Rain(n) {
  var pos = new Float32Array(n * 6);
  var g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  var m = new THREE.LineBasicMaterial({
    color: 0xbcd0e8, transparent: true, opacity: 0.5, fog: false, depthWrite: false
  });
  var mesh = new THREE.LineSegments(g, m);
  mesh.frustumCulled = false;
  var p = fill(n, function () {
    return { x: rand(-BOX.x, BOX.x), y: rand(-BOX.y, BOX.y), z: rand(-BOX.z, BOX.z),
             len: rand(2.2, 5.2), spd: rand(150, 250) };
  });
  this.mesh = mesh; this.n = n; this.p = p; this.pos = pos; this.mat = m;
}
Rain.prototype.step = function (dt, cam, wind, amount) {
  this.mat.opacity = 0.5 * amount;
  for (var i = 0; i < this.n; i++) {
    var d = this.p[i];
    d.y -= d.spd * dt;
    d.x += wind * dt * 22;
    // wrap around the camera rather than respawning from a spout
    if (d.y < cam.y - BOX.y) { d.y += BOX.y * 2; d.x = cam.x + rand(-BOX.x, BOX.x); d.z = cam.z + rand(-BOX.z, BOX.z); }
    if (d.x < cam.x - BOX.x) d.x += BOX.x * 2; else if (d.x > cam.x + BOX.x) d.x -= BOX.x * 2;
    if (d.z < cam.z - BOX.z) d.z += BOX.z * 2; else if (d.z > cam.z + BOX.z) d.z -= BOX.z * 2;
    var k = i * 6;
    this.pos[k] = d.x; this.pos[k + 1] = d.y; this.pos[k + 2] = d.z;
    this.pos[k + 3] = d.x - wind * 2.2; this.pos[k + 4] = d.y + d.len; this.pos[k + 5] = d.z;
  }
  this.mesh.geometry.getAttribute('position').needsUpdate = true;
};

// ------------------------------------------------------- snow and embers
function Motes(n, opts) {
  var pos = new Float32Array(n * 3);
  var col = new Float32Array(n * 3);
  var g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  var m = new THREE.PointsMaterial({
    size: opts.size, vertexColors: true, transparent: true, opacity: opts.opacity,
    depthWrite: false, fog: false, sizeAttenuation: true,
    blending: opts.additive ? THREE.AdditiveBlending : THREE.NormalBlending
  });
  var mesh = new THREE.Points(g, m);
  mesh.frustumCulled = false;
  var p = fill(n, function () {
    return { x: rand(-BOX.x, BOX.x), y: rand(-BOX.y, BOX.y), z: rand(-BOX.z, BOX.z),
             spd: rand(opts.spd[0], opts.spd[1]), ph: rand(0, 6.28), sway: rand(0.4, 1.6),
             life: rand(0, 1) };
  });
  this.mesh = mesh; this.n = n; this.p = p; this.pos = pos; this.col = col;
  this.mat = m; this.o = opts;
}
Motes.prototype.step = function (dt, cam, wind, amount, t) {
  var o = this.o, up = o.rise ? 1 : -1;
  this.mat.opacity = o.opacity * amount;
  for (var i = 0; i < this.n; i++) {
    var d = this.p[i];
    d.y += up * d.spd * dt;
    d.x += (Math.sin(t * d.sway + d.ph) * o.swayAmp + wind * 14) * dt;
    d.z += Math.cos(t * d.sway * 0.7 + d.ph) * o.swayAmp * 0.6 * dt;
    if (up > 0 ? d.y > cam.y + BOX.y : d.y < cam.y - BOX.y) {
      d.y -= up * BOX.y * 2;
      d.x = cam.x + rand(-BOX.x, BOX.x); d.z = cam.z + rand(-BOX.z, BOX.z);
      d.life = 0;
    }
    if (d.x < cam.x - BOX.x) d.x += BOX.x * 2; else if (d.x > cam.x + BOX.x) d.x -= BOX.x * 2;
    if (d.z < cam.z - BOX.z) d.z += BOX.z * 2; else if (d.z > cam.z + BOX.z) d.z -= BOX.z * 2;
    d.life = Math.min(1, d.life + dt * 0.5);

    var k = i * 3;
    this.pos[k] = d.x; this.pos[k + 1] = d.y; this.pos[k + 2] = d.z;
    // embers pulse and cool as they rise; snow just twinkles a little
    var f = o.rise
      ? (0.45 + 0.55 * Math.sin(t * 7 + d.ph)) * (1 - d.life * 0.65)
      : 0.75 + 0.25 * Math.sin(t * 3 + d.ph);
    this.col[k] = o.col[0] * f; this.col[k + 1] = o.col[1] * f; this.col[k + 2] = o.col[2] * f;
  }
  this.mesh.geometry.getAttribute('position').needsUpdate = true;
  this.mesh.geometry.getAttribute('color').needsUpdate = true;
};

// ------------------------------------------------------------ the system
var rain = new Rain(560);
var snow = new Motes(460, { size: 2.30, opacity: 0.85, spd: [7, 18], swayAmp: 5.5,
                            col: [0.92, 0.95, 1.0], rise: false, additive: false });
var ember = new Motes(240, { size: 2.05, opacity: 0.9, spd: [9, 26], swayAmp: 7.0,
                             col: [1.0, 0.52, 0.16], rise: true, additive: true });

var group = new THREE.Group();
group.add(rain.mesh); group.add(snow.mesh); group.add(ember.mesh);
group.renderOrder = 900;
P.scene.add(group);

var want = { rain: 0, snow: 0, ember: 0, wind: 0 };
var have = { rain: 0, snow: 0, ember: 0, wind: 0 };
var gust = 0, gustV = 0;

function configure(w) {
  w = w || {};
  want.rain = w.rain || 0;
  want.snow = w.snow || 0;
  want.ember = w.ember || 0;
  want.wind = w.wind === undefined ? 0.2 : w.wind;
}

// --------------------------------------------------- wet / frozen surfaces
// M() caches its materials, so the whole world shares a handful of them. That
// makes a global surface response a matter of walking the cache once per frame
// rather than touching every mesh.
var tracked = null;
function trackMaterials() {
  tracked = [];
  P.scene.traverse(function (o) {
    if (!o.isMesh && !o.isPoints && !o.isLineSegments) return;
    var m = o.material;
    if (!m || m.isShaderMaterial || !m.color) return;
    if (m.userData.__wxBase === undefined) {
      m.userData.__wxBase = {
        shine: m.shininess === undefined ? 0 : m.shininess,
        spec: m.specular ? m.specular.clone() : null,
        col: m.color.clone()
      };
    }
    tracked.push(m);
  });
}
var _hsl = { h: 0, s: 0, l: 0 };
function applySurface(wet, cold) {
  if (!tracked) return;
  for (var i = 0; i < tracked.length; i++) {
    var m = tracked[i], b = m.userData.__wxBase;
    if (!b) continue;
    // rain: everything picks up a hard specular sheen
    if (m.shininess !== undefined) m.shininess = b.shine + wet * 34;
    if (m.specular && b.spec) {
      m.specular.setRGB(
        b.spec.r + wet * 0.17, b.spec.g + wet * 0.19, b.spec.b + wet * 0.24);
    }
    // snow: the world goes cold and loses a little saturation
    b.col.getHSL(_hsl);
    m.color.setHSL(_hsl.h, _hsl.s * (1 - cold * 0.38), _hsl.l * (1 - cold * 0.10) + cold * 0.06);
  }
}

P.weather = {
  group: group,
  configure: configure,
  state: have,
  refresh: trackMaterials,
  update: function (dt, camPos, t) {
    // gusts: a slow random walk so wind never sits still
    gustV += (rand(-1, 1) * 0.9 - gustV * 1.6) * dt;
    gust = clamp(gust + gustV * dt, -1, 1);

    have.rain = damp(have.rain, want.rain, 0.8, dt);
    have.snow = damp(have.snow, want.snow, 0.8, dt);
    have.ember = damp(have.ember, want.ember, 1.2, dt);
    have.wind = damp(have.wind, want.wind, 1.5, dt);

    var wind = have.wind * (0.6 + gust * 0.7);

    rain.mesh.visible = have.rain > 0.01;
    snow.mesh.visible = have.snow > 0.01;
    ember.mesh.visible = have.ember > 0.01;

    if (rain.mesh.visible) rain.step(dt, camPos, wind, have.rain);
    if (snow.mesh.visible) snow.step(dt, camPos, wind, have.snow, t);
    if (ember.mesh.visible) ember.step(dt, camPos, wind, have.ember, t);

    applySurface(have.rain, have.snow);
  }
};

if (window.__PFLOAD) __PFLOAD.set(0.52, 'SEEDING THE WEATHER');

})();
