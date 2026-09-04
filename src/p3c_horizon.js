/* Three persistent, inexpensive mountain layers beyond the playable terrain. */
(function () {
var P = window.__PF, layers = [];
for (var layer = 0; layer < 3; layer++) {
  var positions = [], indices = [], count = 128, radius = 1150 + layer * 130;
  for (var i = 0; i <= count; i++) {
    var angle = i / count * Math.PI * 2;
    var ridge = 60 + layer * 38 + Math.pow(Math.abs(Math.sin(angle * 5 + layer * .7)), 2) * 95
      + Math.abs(Math.sin(angle * 13 + layer)) * 42;
    positions.push(Math.sin(angle) * radius, -180, Math.cos(angle) * radius,
                   Math.sin(angle) * radius, ridge, Math.cos(angle) * radius);
    if (i < count) { var v = i * 2; indices.push(v, v + 1, v + 2, v + 1, v + 3, v + 2); }
  }
  var geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3)); geo.setIndex(indices);
  var material = new THREE.ShaderMaterial({
    uniforms: { haze: { value: new THREE.Color() }, ridge: { value: new THREE.Color() }, alpha: { value: .72 - layer * .14 } },
    vertexShader: 'varying float height; void main(){height=position.y;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}',
    fragmentShader: 'varying float height; uniform vec3 haze; uniform vec3 ridge; uniform float alpha; void main(){float h=smoothstep(-50.0,180.0,height); gl_FragColor=vec4(mix(haze,ridge,h),alpha*smoothstep(-150.0,15.0,height));}',
    side: THREE.DoubleSide, transparent: true, depthWrite: false, depthTest: true, fog: false
  });
  var mesh = new THREE.Mesh(geo, material); mesh.frustumCulled = false; mesh.renderOrder = -910 - layer * 10; P.scene.add(mesh); layers.push(mesh);
}
P.horizon = {
  update: function () {
    var z = P.Game ? P.Game.railZ : 0;
    layers.forEach(function (mesh, i) {
      mesh.position.set(P.camera.position.x * .94, -16, z);
      mesh.rotation.y = Math.sin(z * .000025) * (.1 - i * .02);
      mesh.material.uniforms.haze.value.copy(P.scene.fog.color);
      mesh.material.uniforms.ridge.value.copy(P.scene.fog.color).lerp(P.skyUni.cHi.value, .25 - i * .06);
    });
  },
  layers: layers
};
})();
