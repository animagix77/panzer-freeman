/* Judge Dean LLC — authored stage skylines and distant celestial atmosphere. */
(function () {
var P = window.__PF, layers = [], lastTime = null, count = 192;
function ridgeHeight(angle, layer, stage) {
  var a = angle + layer * .12;
  if (stage === 'ep2') {
    var district = Math.floor((Math.sin(a * 9) + 1) * 2.5) * 12;
    var spire = Math.pow(Math.abs(Math.sin(a * 23 + layer)), 18) * 108;
    return 20 + layer * 28 + district + spire;
  }
  if (stage === 'foundry') {
    var block = Math.floor((Math.sin(a * 11 + layer) + 1) * 2) * 20;
    var stack = Math.pow(Math.abs(Math.sin(a * 29)), 28) * 112;
    return 22 + layer * 30 + block + stack;
  }
  if (stage === 'ep3' || stage === 'boss') {
    var peaks = Math.pow(Math.abs(Math.sin(a * 7 + layer)), 2) * 190 + Math.abs(Math.sin(a * 19)) * 42;
    return 55 + layer * 39 + peaks;
  }
  var mesa = Math.min(1, Math.pow(Math.abs(Math.sin(a * 5 + layer)), .55) * 1.6) * 130;
  return 35 + layer * 33 + mesa + Math.sin(a * 17) * 8;
}
for (var layer = 0; layer < 3; layer++) {
  var positions = [], indices = [], radius = 1150 + layer * 130;
  for (var i = 0; i <= count; i++) {
    var angle = i / count * Math.PI * 2;
    positions.push(Math.sin(angle) * radius, -180, Math.cos(angle) * radius,
                   Math.sin(angle) * radius, ridgeHeight(angle, layer, 'ep1'), Math.cos(angle) * radius);
    if (i < count) { var v = i * 2; indices.push(v, v + 1, v + 2, v + 1, v + 3, v + 2); }
  }
  var geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3)); geo.setIndex(indices);
  var material = new THREE.ShaderMaterial({
    uniforms: { haze: { value: new THREE.Color() }, ridge: { value: new THREE.Color() }, alpha: { value: .84 - layer * .16 } },
    vertexShader: 'varying float height; void main(){height=position.y;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}',
    fragmentShader: 'varying float height; uniform vec3 haze; uniform vec3 ridge; uniform float alpha; void main(){float h=smoothstep(-25.0,150.0,height); gl_FragColor=vec4(mix(haze,ridge,h),alpha*smoothstep(-150.0,15.0,height));}',
    side: THREE.DoubleSide, transparent: true, depthWrite: false, depthTest: true, fog: false
  });
  var mesh = new THREE.Mesh(geo, material); mesh.frustumCulled = false; mesh.renderOrder = -910 - layer * 10; P.scene.add(mesh); layers.push(mesh);
}
var moonMaterial = new THREE.ShaderMaterial({
  uniforms: { alpha: { value: 0 }, tint: { value: new THREE.Color(0xc5c4ef) } },
  vertexShader: 'varying vec3 surfaceNormal; void main(){surfaceNormal=normal;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}',
  fragmentShader: 'varying vec3 surfaceNormal;uniform vec3 tint;uniform float alpha;void main(){vec3 n=normalize(surfaceNormal);' +
    'float light=.18+.82*max(0.0,dot(n,normalize(vec3(-.6,.5,-.8))));' +
    'float bands=.92+.08*sin(n.y*31.0+n.x*5.0);gl_FragColor=vec4(tint*light*bands,alpha);}',
  transparent: true, depthWrite: false, depthTest: true, fog: false
});
var moon = new THREE.Mesh(new THREE.SphereGeometry(88, 32, 20), moonMaterial);
moon.name = 'citadel-moon'; moon.renderOrder = -960; moon.frustumCulled = false; P.scene.add(moon);
var moonRing = new THREE.Mesh(new THREE.RingGeometry(117, 154, 80), new THREE.MeshBasicMaterial({ color: 0xc3a7de,
  transparent: true, opacity: 0, side: THREE.DoubleSide, depthWrite: false, depthTest: true, fog: false }));
moonRing.name = 'citadel-moon-rings'; moonRing.rotation.set(.98, .25, -.32); moonRing.renderOrder = -965;
moonRing.frustumCulled = false; P.scene.add(moonRing);
var colors = { ep1: 0x684337, ep2: 0x23465b, foundry: 0x352f42, ep3: 0x514b79, boss: 0x33263f };
var ridgeColor = new THREE.Color(), moonAlpha = 0, targetStage = null, shapeBlendLeft = 0;
var ridgeTargets = layers.map(function () { return new Float32Array(count + 1); });
P.horizon = {
  update: function () {
    var game = P.Game, z = game ? game.railZ : 0, time = game ? game.time : 0;
    var firstFrame = lastTime === null;
    var dt = firstFrame || time < lastTime ? 1 / 60 : Math.min(.1, time - lastTime); lastTime = time;
    var ep = P.world && game ? P.world.EPISODES[game.epIndex] : null, stage = ep ? ep.id : 'ep1';
    var blend = firstFrame ? 1 : 1 - Math.exp(-dt * 2.4);
    if (targetStage !== stage) {
      targetStage = stage;
      shapeBlendLeft = 1;
      ridgeTargets.forEach(function (profile, i) {
        for (var point = 0; point <= count; point++) profile[point] = ridgeHeight(point / count * Math.PI * 2, i, stage);
      });
    }
    var reshape = shapeBlendLeft > 0 && blend > 0;
    shapeBlendLeft *= 1 - blend;
    if (shapeBlendLeft < .001) shapeBlendLeft = 0;
    layers.forEach(function (mesh, i) {
      mesh.position.set(P.camera.position.x * .94, -16, z);
      mesh.rotation.y = Math.sin(z * .000025) * (.1 - i * .02);
      if (reshape) {
        var a = mesh.geometry.attributes.position;
        for (var point = 0; point <= count; point++) {
          var index = point * 6 + 4;
          a.array[index] += (ridgeTargets[i][point] - a.array[index]) * (shapeBlendLeft ? blend : 1);
        }
        a.needsUpdate = true;
      }
      mesh.material.uniforms.haze.value.copy(P.scene.fog.color);
      ridgeColor.setHex(colors[stage] || colors.ep1).lerp(P.scene.fog.color, .36 + i * .18);
      mesh.material.uniforms.ridge.value.lerp(ridgeColor, blend);
    });
    var moonTarget = stage === 'ep3' ? .86 : stage === 'boss' ? .6 : 0;
    moonAlpha += (moonTarget - moonAlpha) * blend;
    moon.position.set(P.camera.position.x - 275, 300, z + 1080);
    moonRing.position.copy(moon.position);
    moon.material.uniforms.alpha.value = moonAlpha; moonRing.material.opacity = moonAlpha * .4;
    moon.visible = moonRing.visible = moonAlpha > .002;
    moon.material.uniforms.tint.value.setHex(stage === 'boss' ? 0xf3ae9a : 0xc5c4ef);
  },
  layers: layers,
  celestial: [moon, moonRing]
};
})();
