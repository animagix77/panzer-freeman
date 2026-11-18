/* Bounded combat glow pool. Three reusable lights; no postprocess render pass. */
(function () {
'use strict';
var P = window.__PF, scene = P.scene;
var data = new Uint8Array(64 * 64 * 4);
for (var i = 0; i < 4096; i++) {
  var x = (i % 64 - 31.5) / 31.5, y = (Math.floor(i / 64) - 31.5) / 31.5;
  var r = Math.sqrt(x * x + y * y);
  data[i * 4] = data[i * 4 + 1] = data[i * 4 + 2] = 255;
  data[i * 4 + 3] = Math.round(255 * Math.pow(Math.max(0, 1 - r), 2.3));
}
var tex = new THREE.DataTexture(data, 64, 64, THREE.RGBAFormat);
tex.minFilter = tex.magFilter = THREE.LinearFilter; tex.needsUpdate = true;
function sprite(col) {
  return new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, color: col, transparent: true,
    blending: THREE.AdditiveBlending, depthWrite: false, fog: false }));
}
var pool = [], cursor = 0, lights = [], lightCursor = 0;
// A tileable two-channel noise field gives each detonation a rolling edge
// and hot pockets inside the flame. All bursts share this one texture.
var noiseSize = 64, noisePixels = new Uint8Array(noiseSize * noiseSize * 4);
var lattice = new Uint8Array(noiseSize * noiseSize), seed = 73013;
for (i = 0; i < lattice.length; i++) {
  seed = (Math.imul(seed, 1664525) + 1013904223) | 0; lattice[i] = seed >>> 24;
}
function tiledNoise(x, y, period, offset) {
  var ix = Math.floor(x), iy = Math.floor(y), fx = x - ix, fy = y - iy;
  fx *= fx * (3 - 2 * fx); fy *= fy * (3 - 2 * fy);
  var x0 = (ix % period) + offset, x1 = ((ix + 1) % period) + offset;
  var y0 = (iy % period) * noiseSize, y1 = ((iy + 1) % period) * noiseSize;
  return (1 - fy) * ((1 - fx) * lattice[y0 + x0] + fx * lattice[y0 + x1])
    + fy * ((1 - fx) * lattice[y1 + x0] + fx * lattice[y1 + x1]);
}
for (i = 0; i < lattice.length; i++) {
  var nx = (i % noiseSize) / noiseSize, ny = Math.floor(i / noiseSize) / noiseSize;
  for (var channel = 0; channel < 2; channel++) {
    var offset = channel * 32;
    noisePixels[i * 4 + channel] = .62 * tiledNoise(nx * 4, ny * 4, 4, offset)
      + .28 * tiledNoise(nx * 8, ny * 8, 8, offset) + .10 * tiledNoise(nx * 16, ny * 16, 16, offset);
  }
  noisePixels[i * 4 + 3] = 255;
}
var noiseMap = new THREE.DataTexture(noisePixels, noiseSize, noiseSize, THREE.RGBAFormat);
noiseMap.wrapS = noiseMap.wrapT = THREE.RepeatWrapping;
noiseMap.minFilter = noiseMap.magFilter = THREE.LinearFilter; noiseMap.needsUpdate = true;
var flameGeo = new THREE.PlaneGeometry(1, 1);
var flameVertex = [
  'varying vec2 p;',
  'void main(){ p=uv*2.0-1.0; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0); }'
].join('\n');
var flameFragment = [
  'uniform sampler2D turbulence;',
  'uniform vec3 bodyColor, edgeColor;',
  'uniform float age, variant, visibility;',
  'varying vec2 p;',
  'void main(){',
  '  vec2 uv = p*.95+vec2(variant,variant*.77);',
  '  vec2 flow = texture2D(turbulence,uv+vec2(.12,-.31)*age).rg;',
  '  float fold = texture2D(turbulence,uv*1.65+flow*.71-vec2(.04,.23)*age).g;',
  '  float wisps = texture2D(turbulence,uv*3.3+flow*.86+fold*.33).r;',
  '  float r = length(p);',
  '  float angle = atan(p.y,p.x+.00001);',
  '  float jet = pow(.5+.5*cos(angle*6.+1.7*sin(angle*3.+variant*6.)+8.*flow.g+3.*r),2.7);',
  '  float reach = .055+.54*(1.-exp(-age*7.));',
  '  float depth = reach*(.70+.62*jet)-r+(flow.r-.5)*.52+(fold-.5)*.23;',
  '  float cloud = smoothstep(-.025,.075,depth)*(1.-smoothstep(.24,.93,age));',
  '  float layers = (flow.g-.5)*.84+(fold-.5)*1.55+(wisps-.5)*.88;',
  '  cloud *= mix(1.,smoothstep(-.17,.32,layers),smoothstep(.10,.75,age));',
  '  float heat = clamp(.39+depth*1.03+layers*1.55-age*.57,0.,1.);',
  '  vec3 flame = mix(edgeColor*.66,bodyColor,smoothstep(.15,.72,heat));',
  '  flame = mix(flame,vec3(1.,.96,.79),smoothstep(.60,.97,heat)*(1.-smoothstep(.23,.67,age)));',
  // A few shearing arcs race beyond the rolling flame.
  '  float wave = .12+.82*(1.-exp(-age*4.));',
  '  float shell = 1.-smoothstep(.003,.018,abs(r-wave-(flow.r-.5)*.034));',
  '  shell *= smoothstep(.14,.86,.5+.5*sin(angle*3.+flow.g*5.))* .62*(1.-smoothstep(.06,.45,age));',
  '  float echo = 1.-smoothstep(.002,.014,abs(length(p*vec2(.98,1.36))-wave*.89));',
  '  shell += echo*smoothstep(.36,.71,flow.g)*.33*(1.-smoothstep(.04,.35,age));',
  '  float alpha = min(1.,cloud+shell)*visibility;',
  '  if(alpha<.008) discard;',
  '  vec3 color = mix(flame,mix(edgeColor,vec3(1.),.33),shell/max(.001,cloud+shell));',
  '  gl_FragColor=vec4(color,alpha);',
  '}'
].join('\n');
for (i = 0; i < 40; i++) {
  var g = new THREE.Group(), halo = sprite(0xff974a), core = sprite(0xffffff);
  var flame = new THREE.Mesh(flameGeo, new THREE.ShaderMaterial({
    uniforms: { turbulence: { value: noiseMap }, bodyColor: { value: new THREE.Color() },
      edgeColor: { value: new THREE.Color() }, age: { value: 0 }, variant: { value: 0 }, visibility: { value: 1 } },
    vertexShader: flameVertex, fragmentShader: flameFragment, transparent: true, depthWrite: false }));
  flame.name = 'plasma-detonation'; flame.renderOrder = 2; core.renderOrder = 3;
  g.add(halo, core, flame); g.visible = false; scene.add(g);
  pool.push({ g: g, halo: halo, core: core, flame: flame, age: 0, life: 0, size: 1 });
}
for (i = 0; i < 3; i++) { var light = new THREE.PointLight(0xff9944, 0, 95, 2); scene.add(light); lights.push({ light: light, age: 1 }); }

// Explosion afterglow: all hot fragments share one line batch, while a small
// smoke pool leaves a readable silhouette after the initial flash has gone.
var sparks = [], sparkCursor = 0, sparkCapacity = 256, smoke = [], smokeCursor = 0;
var sparkPos = new Float32Array(sparkCapacity * 6), sparkCol = new Float32Array(sparkCapacity * 6);
var sparkGeo = new THREE.BufferGeometry();
sparkGeo.setAttribute('position', new THREE.BufferAttribute(sparkPos, 3).setUsage(THREE.DynamicDrawUsage));
sparkGeo.setAttribute('color', new THREE.BufferAttribute(sparkCol, 3).setUsage(THREE.DynamicDrawUsage));
var sparkMesh = new THREE.LineSegments(sparkGeo, new THREE.LineBasicMaterial({ vertexColors: true,
  transparent: true, opacity: .9, blending: THREE.AdditiveBlending, depthWrite: false, fog: false }));
sparkMesh.name = 'explosion-embers'; sparkMesh.visible = false; sparkMesh.frustumCulled = false; scene.add(sparkMesh);
var emberTips = new THREE.Points(sparkGeo, new THREE.PointsMaterial({ map: tex, size: 1.65, vertexColors: true,
  transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, fog: false }));
emberTips.visible = false; emberTips.frustumCulled = false; emberTips.renderOrder = 3; scene.add(emberTips);
for (i = 0; i < sparkCapacity; i++) sparks.push({ pos: new THREE.Vector3(), velocity: new THREE.Vector3(),
  tint: new THREE.Color(), age: 10, life: 0 });
var smokeData = new Uint8Array(64 * 64 * 4);
for (i = 0; i < 4096; i++) {
  var sx = (i % 64 - 31.5) / 31.5, sy = (Math.floor(i / 64) - 31.5) / 31.5;
  var billow = Math.max(0, 1 - Math.sqrt(sx * sx + sy * sy));
  var folds = .72 + .14 * Math.sin(sx * 13 + Math.sin(sy * 9)) + .14 * Math.cos(sy * 16 - sx * 7);
  smokeData[i * 4] = smokeData[i * 4 + 1] = smokeData[i * 4 + 2] = 255;
  smokeData[i * 4 + 3] = Math.round(255 * Math.pow(billow, 1.2) * folds);
}
var smokeTex = new THREE.DataTexture(smokeData, 64, 64, THREE.RGBAFormat);
smokeTex.minFilter = smokeTex.magFilter = THREE.LinearFilter; smokeTex.needsUpdate = true;
for (i = 0; i < 18; i++) {
  var cloud = new THREE.Sprite(new THREE.SpriteMaterial({ map: smokeTex, color: 0x594951,
    transparent: true, opacity: 0, depthWrite: false, fog: true }));
  cloud.name = 'explosion-smoke'; cloud.visible = false; scene.add(cloud);
  smoke.push({ mesh: cloud, pos: new THREE.Vector3(), hot: new THREE.Color(), age: 10, life: 0, size: 1, drift: 0 });
}
var smokeCold = new THREE.Color(0x594951);
function fogVisibility(pos) {
  var fog = scene.fog;
  if (!fog || fog.far === undefined) return 1;
  var distance = pos.distanceTo(P.camera.position);
  var u = Math.max(0, Math.min(1, (distance - fog.near) / Math.max(1, fog.far - fog.near)));
  return 1 - u * u * (3 - 2 * u);
}
function explosionAfterglow(pos, size, body, edge) {
  var count = Math.min(30, Math.round(14 + size * 2));
  for (var i = 0; i < count; i++) {
    var s = sparks[sparkCursor++ % sparkCapacity], vertical = 1 - (i + .5) / count * 2;
    var radius = Math.sqrt(1 - vertical * vertical), angle = i * 2.399963 + sparkCursor * .17;
    s.pos.copy(pos); s.age = 0; s.life = .55 + (i % 5) * .13;
    s.tint.copy(i % 3 ? edge : body);
    s.velocity.set(Math.cos(angle) * radius, vertical * .8 + .22, Math.sin(angle) * radius)
      .multiplyScalar((20 + (i % 4) * 9) * Math.min(2.3, .65 + size * .18));
  }
  for (var puff = 0; puff < 3; puff++) {
    var c = smoke[smokeCursor++ % smoke.length];
    c.hot.copy(puff === 1 ? body : edge);
    c.age = 0; c.life = 1.3 + puff * .18; c.size = Math.min(7, size) * (3.8 + puff * .8);
    c.pos.copy(pos); c.pos.x += (puff - 1) * size * .7; c.pos.y += puff * size * .35;
    c.drift = (puff - 1) * 2.8;
    c.mesh.position.copy(c.pos); c.mesh.material.opacity = 0; c.mesh.material.rotation = puff * 2.1;
    c.mesh.scale.setScalar(c.size); c.mesh.visible = true;
  }
}
function updateAfterglow(dt) {
  var active = 0;
  sparks.forEach(function (s, i) {
    var k = i * 6;
    if (s.age >= s.life) { sparkCol.fill(0, k, k + 6); return; }
    s.age = Math.min(s.life, s.age + dt);
    // Closed-form drag/gravity keeps spark travel stable at low frame rates.
    var drag = Math.exp(-dt * 1.7), travel = (1 - drag) / 1.7;
    s.pos.addScaledVector(s.velocity, travel); s.pos.y -= 14 * (dt - travel) / 1.7;
    s.velocity.multiplyScalar(drag); s.velocity.y -= 14 * travel;
    var fade = Math.pow(1 - s.age / s.life, 1.4) * fogVisibility(s.pos);
    var tail = .105 * Math.max(.3, 1 - s.age / s.life);
    sparkPos[k] = s.pos.x; sparkPos[k + 1] = s.pos.y; sparkPos[k + 2] = s.pos.z;
    sparkPos[k + 3] = s.pos.x - s.velocity.x * tail; sparkPos[k + 4] = s.pos.y - s.velocity.y * tail;
    sparkPos[k + 5] = s.pos.z - s.velocity.z * tail;
    var white = .64 * Math.exp(-s.age * 8);
    sparkCol[k] = fade * (white + (1 - white) * s.tint.r);
    sparkCol[k + 1] = fade * (white + (1 - white) * s.tint.g);
    sparkCol[k + 2] = fade * (white + (1 - white) * s.tint.b);
    sparkCol[k + 3] = fade * s.tint.r * .25;
    sparkCol[k + 4] = fade * s.tint.g * .25;
    sparkCol[k + 5] = fade * s.tint.b * .25;
    if (fade > .001) active++;
  });
  sparkMesh.visible = emberTips.visible = active > 0;
  sparkGeo.attributes.position.needsUpdate = true; sparkGeo.attributes.color.needsUpdate = true;
  smoke.forEach(function (c) {
    if (!c.mesh.visible) return;
    c.age += dt; var u = Math.min(1, c.age / c.life);
    c.mesh.visible = u < 1;
    c.mesh.position.set(c.pos.x + c.drift * c.age, c.pos.y + c.age * (7 + c.size * .08), c.pos.z);
    c.mesh.scale.setScalar(c.size * (1 + u * 1.6));
    c.mesh.material.color.copy(c.hot).lerp(smokeCold, Math.min(1, c.age * 2.1));
    c.mesh.material.opacity = .42 * Math.min(1, c.age / .12) * Math.pow(1 - u, 1.5) * fogVisibility(c.mesh.position);
    c.mesh.material.rotation += dt * c.drift * .035;
  });
}

// Two short vapor ribbons record the real articulated wingtips in world space.
// A fixed 60 Hz history keeps their length stable across display refresh rates.
var trails = [], trailCount = 34, trailLife = .5, trailTime = 0, trailPower = 0;
var trailView = new THREE.Vector3(), trailTangent = new THREE.Vector3(), trailSide = new THREE.Vector3();
for (i = 0; i < 2; i++) {
  var trailGeo = new THREE.BufferGeometry(), trailIndices = [];
  var trailPositions = new Float32Array((trailCount + 1) * 9), trailColors = new Float32Array((trailCount + 1) * 9);
  for (var ti = 0; ti < trailCount; ti++) {
    for (var edge = 0; edge < 2; edge++) {
      var a = ti * 3 + edge, c = a + 3;
      trailIndices.push(a, c, a + 1, a + 1, c, c + 1);
    }
  }
  trailGeo.setAttribute('position', new THREE.BufferAttribute(trailPositions, 3).setUsage(THREE.DynamicDrawUsage));
  trailGeo.setAttribute('color', new THREE.BufferAttribute(trailColors, 3).setUsage(THREE.DynamicDrawUsage));
  trailGeo.setIndex(trailIndices);
  var trailMesh = new THREE.Mesh(trailGeo, new THREE.MeshBasicMaterial({ color: 0xa4e7ff,
    vertexColors: true, transparent: true, opacity: .72, blending: THREE.AdditiveBlending,
    depthWrite: false, side: THREE.DoubleSide, fog: false }));
  trailMesh.name = 'wing-vapor-' + i; trailMesh.visible = false; trailMesh.frustumCulled = false;
  scene.add(trailMesh);
  var history = [];
  for (ti = 0; ti < trailCount; ti++) history.push({ pos: new THREE.Vector3(), time: -10, power: 0 });
  trails.push({ mesh: trailMesh, history: history, count: 0, previous: new THREE.Vector3(),
    tip: new THREE.Vector3(), nextSample: 0, ready: false });
}
function resetTrails() {
  trailPower = 0;
  trails.forEach(function (t) { t.mesh.visible = false; t.count = 0; t.ready = false; });
}
function updateTrails(dt) {
  if (dt <= 0) return;
  var player = P.Player, dragon = P.dragon;
  if (!player || !dragon || P.Game.state !== 'playing' || P.Game.cinematic || P.Game.ending || dt > .12) {
    resetTrails(); return;
  }
  var wasTime = trailTime; trailTime += dt;
  var desired = player.boosting ? 1 : player.rollT > 0 ? .8 : 0;
  trailPower += (desired - trailPower) * (1 - Math.exp(-dt * (desired ? 8 : 5)));
  if (!desired && trailPower < .004) { resetTrails(); return; }
  dragon.root.updateMatrixWorld(true);
  trails.forEach(function (t, wingIndex) {
    t.tip.setFromMatrixPosition(dragon.wingTips[wingIndex].matrixWorld);
    if (!t.ready || t.previous.distanceToSquared(t.tip) > 90 * 90) {
      t.count = 0; t.previous.copy(t.tip); t.nextSample = wasTime; t.ready = true;
    }
    while (t.nextSample <= trailTime) {
      for (var n = Math.min(t.count, trailCount - 1); n > 0; n--) {
        t.history[n].pos.copy(t.history[n - 1].pos);
        t.history[n].time = t.history[n - 1].time; t.history[n].power = t.history[n - 1].power;
      }
      var sample = t.history[0];
      sample.pos.copy(t.previous).lerp(t.tip, Math.max(0, Math.min(1, (t.nextSample - wasTime) / Math.max(dt, .00001))));
      sample.time = t.nextSample; sample.power = trailPower;
      t.count = Math.min(trailCount, t.count + 1); t.nextSample += 1 / 60;
    }
    t.previous.copy(t.tip);
    var positions = t.mesh.geometry.attributes.position.array, colors = t.mesh.geometry.attributes.color.array;
    var peak = 0;
    for (var j = 0; j <= t.count; j++) {
      var point = j ? t.history[j - 1].pos : t.tip;
      var age = j ? trailTime - t.history[j - 1].time : 0;
      var power = j ? t.history[j - 1].power : trailPower;
      var fade = Math.pow(Math.max(0, 1 - age / trailLife), 1.6) * power;
      peak = Math.max(peak, fade);
      var next = t.history[Math.min(j, t.count - 1)].pos;
      var previous = j > 1 ? t.history[j - 2].pos : t.tip;
      trailTangent.subVectors(previous, next);
      trailView.subVectors(P.camera.position, point);
      trailSide.crossVectors(trailTangent, trailView);
      if (trailSide.lengthSq() < .00001) trailSide.set(1, 0, 0);
      trailSide.normalize().multiplyScalar((.24 + power * .22) * Math.max(.15, 1 - age / trailLife));
      for (var k = 0; k < 3; k++) {
        var offset = j * 9 + k * 3, side = k - 1;
        positions[offset] = point.x + trailSide.x * side;
        positions[offset + 1] = point.y + trailSide.y * side;
        positions[offset + 2] = point.z + trailSide.z * side;
        // Black edges disappear under additive blending for a soft cross-section.
        colors[offset] = colors[offset + 1] = colors[offset + 2] = k === 1 ? fade : 0;
      }
    }
    t.mesh.visible = peak > .015 && t.count > 1;
    t.mesh.geometry.setDrawRange(0, t.count * 12);
    t.mesh.geometry.attributes.position.needsUpdate = true;
    t.mesh.geometry.attributes.color.needsUpdate = true;
  });
}
function poseFlame(b) {
  b.flame.quaternion.copy(P.camera.quaternion); b.flame.rotateZ(b.twist);
  b.flame.scale.setScalar(Math.min(b.size * 12, b.g.position.distanceTo(P.camera.position) * .68));
}
function burst(pos, size, col, small, accent) {
  var b = pool[cursor++ % pool.length];
  b.g.position.copy(pos); b.g.visible = true;
  b.size = size; b.age = 0; b.life = small ? .23 : 1.05;
  var visibility = fogVisibility(pos);
  b.halo.material.color.setHex(col);
  b.halo.material.opacity = .9 * visibility; b.core.material.opacity = visibility;
  b.halo.scale.setScalar(size * 8); b.core.scale.setScalar(size * (small ? 3 : 5));
  b.flame.visible = !small;
  if (!small) {
    var uniforms = b.flame.material.uniforms;
    uniforms.bodyColor.value.setHex(col); uniforms.edgeColor.value.setHex(accent === undefined ? col : accent);
    uniforms.age.value = 0; uniforms.visibility.value = visibility;
    uniforms.variant.value = (cursor * .618034) % 1; b.twist = cursor * 2.399963;
    poseFlame(b);
    explosionAfterglow(pos, size, uniforms.bodyColor.value, uniforms.edgeColor.value);
    var l = lights[lightCursor++ % lights.length]; l.age = 0;
    l.light.position.copy(pos); l.light.color.setHex(col); l.light.intensity = Math.min(7, size * 1.7);
    l.strength = l.light.intensity;
  }
}
P.fx = {
  burst: burst,
  attachLaser: function (mesh) {
    if (mesh.userData.energyHalo) return;
    var halo = sprite(0x49afff); halo.scale.set(7, 7, 7); mesh.add(halo); mesh.userData.energyHalo = halo;
  },
  update: function (dt) {
    updateTrails(dt);
    updateAfterglow(dt);
    pool.forEach(function (b) {
      if (!b.g.visible) return;
      b.age += dt; var u = Math.min(1, b.age / b.life);
      b.g.visible = u < 1;
      b.halo.scale.setScalar(b.size * (8 + u * 14));
      b.core.scale.setScalar(b.size * ((b.flame.visible ? 5 : 3) + u * 4));
      var visibility = fogVisibility(b.g.position);
      b.halo.material.opacity = Math.pow(1 - u, 2) * .85 * visibility;
      b.core.material.opacity = Math.pow(1 - u, 6) * visibility;
      if (b.flame.visible) {
        poseFlame(b);
        b.flame.material.uniforms.age.value = u;
        b.flame.material.uniforms.visibility.value = visibility;
      }
    });
    lights.forEach(function (l) { l.age += dt; l.light.intensity = (l.strength || 0) * Math.pow(Math.max(0, 1 - l.age / .32), 2); });
  },
  reset: function () { resetTrails(); pool.forEach(function (b) { b.g.visible = false; }); lights.forEach(function (l) { l.age = 1; l.light.intensity = 0; });
    sparks.forEach(function (s) { s.age = s.life; }); sparkCol.fill(0); sparkMesh.visible = emberTips.visible = false;
    smoke.forEach(function (c) { c.mesh.visible = false; }); },
  stats: function () { return { capacity: pool.length, active: pool.filter(function (b) { return b.g.visible; }).length,
    lights: lights.length, trails: trails.filter(function (t) { return t.mesh.visible; }).length, trailCapacity: trails.length,
    sparks: sparks.filter(function (s) { return s.age < s.life; }).length, sparkCapacity: sparkCapacity,
    smoke: smoke.filter(function (c) { return c.mesh.visible; }).length, smokeCapacity: smoke.length }; }
};
})();
