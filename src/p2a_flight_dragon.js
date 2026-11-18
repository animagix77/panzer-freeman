/* Judge Dean LLC — load the Blender dragon's bind mesh, armature and flight action. */
(function () {
var P = window.__PF, data = window.__PF_DRAGON_DATA;

function unpack(text, Type) {
  var binary = atob(text), bytes = new Uint8Array(binary.length);
  for (var i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return new Type(bytes.buffer);
}

function floats(text, Type, scale) {
  var packed = unpack(text, Type), out = new Float32Array(packed.length);
  for (var i = 0; i < packed.length; i++) out[i] = packed[i] / scale;
  return out;
}

P.createFlightDragon = function () {
  var geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(floats(data.positions, Int16Array, 1024), 3));
  geometry.setAttribute('normal', new THREE.BufferAttribute(floats(data.normals, Int8Array, 127), 3));
  // Blender stores painted pigment as sRGB. Light a linear reflectance, then
  // encode it for the canvas before the engine mixes its display-space fog.
  var colors = floats(data.colors, Uint8Array, 255), pigment = new THREE.Color();
  for (var c = 0; c < colors.length; c += 3) {
    pigment.fromArray(colors, c).convertSRGBToLinear().toArray(colors, c);
  }
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geometry.setAttribute('skinIndex', new THREE.BufferAttribute(unpack(data.joints, Uint8Array), 4));
  geometry.setAttribute('skinWeight', new THREE.BufferAttribute(floats(data.weights, Uint8Array, 255), 4));
  geometry.setIndex(new THREE.BufferAttribute(unpack(data.indices, Uint16Array), 1));
  var material = new THREE.MeshPhongMaterial({ vertexColors: true, skinning: true,
    side: THREE.DoubleSide, shininess: 7, specular: 0x060807 });
  material.color.setScalar(.84);
  P.retroPatch(material);
  var patchRetro = material.onBeforeCompile;
  material.onBeforeCompile = function (shader, renderer) {
    patchRetro.call(this, shader, renderer);
    if (renderer.outputEncoding === THREE.LinearEncoding && !renderer.getRenderTarget()) {
      shader.fragmentShader = shader.fragmentShader.replace('#include <encodings_fragment>',
        'gl_FragColor = LinearTosRGB(gl_FragColor);');
    }
  };
  material.customProgramCacheKey = function () { return 'flight-dragon-pigment'; };
  var mesh = new THREE.SkinnedMesh(geometry, material);
  mesh.name = 'flight-dragon-skin';
  mesh.frustumCulled = false;

  // The bake represents the rest axes in game space (+Z forward, +Y up).
  // Each local translation is the offset between two authored joint heads.
  var byName = {};
  var bones = data.bones.map(function (joint) {
    var bone = new THREE.Bone();
    bone.name = joint.name;
    bone.position.fromArray(joint.head);
    byName[bone.name] = bone;
    return bone;
  });
  data.bones.forEach(function (joint, i) {
    var bone = bones[i];
    if (joint.parent >= 0) {
      var parent = data.bones[joint.parent].head;
      bone.position.x -= parent[0]; bone.position.y -= parent[1]; bone.position.z -= parent[2];
      bones[joint.parent].add(bone);
    } else mesh.add(bone);
  });
  mesh.bind(new THREE.Skeleton(bones));

  var clip = data.clips.Wingbeat, keys = floats(clip.rotations, Int16Array, 32767);
  for (var i = 0; i < keys.length; i += 4) {
    var length = Math.hypot(keys[i], keys[i+1], keys[i+2], keys[i+3]);
    for (var c = 0; c < 4; c++) keys[i+c] /= length;
  }
  var to = new THREE.Quaternion(), rest = new THREE.Quaternion();
  function pose(phase, strength) {
    var frame = phase * (clip.frames - 1), first = Math.floor(frame), mix = frame - first;
    var a = first * bones.length * 4, b = Math.min(first + 1, clip.frames - 1) * bones.length * 4;
    for (var i = 0; i < bones.length; i++) {
      var q = bones[i].quaternion, k = i * 4;
      q.fromArray(keys, a+k).slerp(to.fromArray(keys, b+k), mix);
      q.slerp(rest.fromArray(keys, k), 1-strength);
    }
  }
  var delta = new THREE.Quaternion(), angles = new THREE.Euler();
  function offset(joint, x, y, z) {
    joint.quaternion.multiply(delta.setFromEuler(angles.set(x, y, z)));
  }

  var headOrigin = data.bones[bones.indexOf(byName.Head)].head;
  var bridleOrigin = new THREE.Vector3().fromArray(headOrigin);
  pose(0, 1);
  return { mesh: mesh, bones: byName, pose: pose, offset: offset,
    wingTips: data.anchors.wingTips.map(function (name) { return byName[name]; }),
    cheeks: data.anchors.cheeks.map(function (p) {
      return new THREE.Vector3().fromArray(p).sub(bridleOrigin);
    }) };
};
})();
