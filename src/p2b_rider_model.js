/* =========================================================================
   Part 2b — the modelled rider.

   Rebuilds a SkinnedMesh from the arrays baked by tools/bake-glb.js. There is
   no GLTFLoader and no asset fetch: the geometry is quantised base64 inlined
   straight into the single-file build, and the source model's 2048x2048 atlas
   was sampled per-vertex at bake time into vertex colours, so the material
   stays flat-shaded Phong and takes the same retro vertex-snap as everything
   else. (Verified: skinning_vertex runs before project_vertex, so the snap
   applies to the posed mesh.)

   The atlas SHIPS, downscaled to a 768px JPEG data URI. Baking it into 3043
   vertex colours was tried first and destroyed the model: the dragon crests,
   chest buckles and scale mail live entirely in the texture and cannot be
   carried by one colour per vertex. Vertex colours are still present, but only
   as a white multiplier that setHairAge() darkens over the cranium.
   ========================================================================= */
(function () {
var P = window.__PF;
if (!window.RIDER_MODEL) { P.riderModel = null; return; }

var D = window.RIDER_MODEL;

function unb64(s) {
  var bin = atob(s), n = bin.length, out = new Uint8Array(n);
  for (var i = 0; i < n; i++) out[i] = bin.charCodeAt(i);
  return out;
}

// ---- geometry -------------------------------------------------------------
var geo = new THREE.BufferGeometry();
(function () {
  var qb = unb64(D.pos);
  var q = new Int16Array(qb.buffer, qb.byteOffset, D.v * 3);
  var pos = new Float32Array(D.v * 3);
  for (var i = 0; i < D.v; i++) {
    for (var c = 0; c < 3; c++) {
      var t = (q[i * 3 + c] + 32767) / 65534;
      pos[i * 3 + c] = D.min[c] + t * D.ext[c];
    }
  }
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));

  var uvb = unb64(D.uv);
  var qu = new Uint16Array(uvb.buffer, uvb.byteOffset, D.v * 2);
  var uvs = new Float32Array(D.v * 2);
  for (var u = 0; u < D.v * 2; u++) uvs[u] = qu[u] / 65535;
  geo.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));

  var cf = new Float32Array(D.v * 3);
  // White baseline. The map carries all the colour now; these only exist so
  // setHairAge() has something to multiply the cranium by.
  for (var k = 0; k < D.v * 3; k++) cf[k] = 1;
  geo.setAttribute('color', new THREE.BufferAttribute(cf, 3));

  geo.setAttribute('skinIndex', new THREE.BufferAttribute(unb64(D.jnt), 4));
  var w = unb64(D.wgt), wf = new Float32Array(D.v * 4);
  for (var j = 0; j < D.v; j++) {
    var s = 0, m;
    for (m = 0; m < 4; m++) s += w[j * 4 + m];
    s = s || 255;
    for (m = 0; m < 4; m++) wf[j * 4 + m] = w[j * 4 + m] / s;
  }
  geo.setAttribute('skinWeight', new THREE.BufferAttribute(wf, 4));

  var ib = unb64(D.idx);
  geo.setIndex(new THREE.BufferAttribute(new Uint16Array(ib.buffer, ib.byteOffset, ib.length / 2), 1));
  geo.computeVertexNormals();
})();

// ---- skeleton -------------------------------------------------------------
var bones = [], byName = {};
D.bones.forEach(function (b) {
  var bone = new THREE.Bone();
  bone.name = b.name;
  bone.position.set(b.t[0], b.t[1], b.t[2]);
  bone.quaternion.set(b.r[0], b.r[1], b.r[2], b.r[3]);
  bone.scale.set(b.s[0], b.s[1], b.s[2]);
  bones.push(bone);
  byName[b.name] = bone;
});
var rootBones = [];
D.bones.forEach(function (b, i) {
  if (b.parent >= 0) bones[b.parent].add(bones[i]);
  else rootBones.push(bones[i]);
});

var ibmBuf = unb64(D.ibm);
var ibmF = new Float32Array(ibmBuf.buffer, ibmBuf.byteOffset, bones.length * 16);
var ibm = [];
for (var bi = 0; bi < bones.length; bi++) {
  ibm.push(new THREE.Matrix4().fromArray(ibmF, bi * 16));
}

var tex = null;
(function () {
  var img = new Image();
  tex = new THREE.Texture(img);
  tex.flipY = false;                       // glTF UV convention
  tex.magFilter = THREE.NearestFilter;     // crisp texels, period-correct
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.anisotropy = 1;
  img.onload = function () { tex.needsUpdate = true; };
  img.src = 'data:image/jpeg;base64,' + D.tex;
})();

var mat = new THREE.MeshPhongMaterial({
  map: tex, vertexColors: true, flatShading: true, shininess: 4,
  specular: 0x1a1410, skinning: true, side: THREE.DoubleSide
});
P.retroPatch(mat);

var skinned = new THREE.SkinnedMesh(geo, mat);
skinned.frustumCulled = false;
var skeleton = new THREE.Skeleton(bones, ibm);
rootBones.forEach(function (b) { skinned.add(b); });
skinned.bind(skeleton);

// Bind rotations, kept so posing can be a DELTA from the rest pose. Writing
// bone.rotation directly discards the bind orientation, which on a Mixamo-style
// rig (bones running down the limb's own axis) leaves the arms stuck in T-pose
// no matter what angle you ask for.
var bindQ = {};
bones.forEach(function (b) { bindQ[b.name] = b.quaternion.clone(); });
var _e = new THREE.Euler(), _q = new THREE.Quaternion();

// ---- hair set, for ageing a mesh that has no shape keys --------------------
// Vertices skinned to the Head joint are known exactly from the skin indices;
// within those, the white hair and beard are the bright, low-saturation ones.
// Storing their base colour lets setHairAge() lerp only those toward black, so
// the 89 -> 25 read survives without the procedural beard geometry.
var hairVerts = null, hairBase = null;
(function () {
  // Detect the hair CAP BY POSITION, not by colour. Colour-matching the atlas
  // caught only a bright sliver at the temples — the crown's texels bake dark,
  // so 90% of the hair never got flagged. The cranium above the brow line is
  // unambiguous geometrically, and that is what reads as "his hair" on screen.
  var headJoint = -1, frontJoint = -1;
  D.bones.forEach(function (b, i) {
    if (b.name === 'Head') headJoint = i;
    if (b.name === 'headfront') frontJoint = i;
  });
  if (headJoint < 0) return;
  var ji = geo.getAttribute('skinIndex').array;
  var c = geo.getAttribute('color').array;
  var pa = geo.getAttribute('position').array;

  var mnY = Infinity, mxY = -Infinity, onHead = new Uint8Array(D.v);
  for (var v = 0; v < D.v; v++) {
    for (var k = 0; k < 4; k++) {
      var j = ji[v * 4 + k];
      if (j === headJoint || j === frontJoint) onHead[v] = 1;
    }
    if (!onHead[v]) continue;
    var y = pa[v * 3 + 1];
    if (y < mnY) mnY = y;
    if (y > mxY) mxY = y;
  }
  var span = mxY - mnY;
  var y0 = mnY + span * 0.58, y1 = mnY + span * 0.74;   // brow -> crown

  var list = [], base = [];
  for (var v2 = 0; v2 < D.v; v2++) {
    if (!onHead[v2]) continue;
    var yy = pa[v2 * 3 + 1];
    var f = Math.max(0, Math.min(1, (yy - y0) / (y1 - y0)));
    if (f <= 0.02) continue;
    list.push(v2);
    base.push(1, 1, 1, f);
  }
  hairVerts = list;
  hairBase = new Float32Array(base);
})();

P.riderModel = {
  mesh: skinned,
  bones: byName,
  skeleton: skeleton,
  tris: D.tris,
  bindQ: bindQ,
  // rotate a bone relative to its bind pose; angles in radians
  turn: function (n, x, y, z) {
    var b = byName[n]; if (!b) return;
    _e.set(x || 0, y || 0, z || 0);
    b.quaternion.copy(bindQ[n]).multiply(_q.setFromEuler(_e));
  },
  hairCount: function () { return hairVerts ? hairVerts.length : 0; },
  headLift: 0.0,
  // Age the hair toward black. Beard bulk and wrinkle depth were procedural
  // geometry and are genuinely gone with the sculpt; hair colour is the cue
  // that still reads at gameplay range.
  setHairAge: function (t) {
    if (!hairVerts) return;
    var c = geo.getAttribute('color');
    // These multiply the atlas. The texture already paints his hair white, so
    // old = 1.0 (leave it alone) and young = a dark multiplier that takes the
    // white hair to near-black.
    var oR = 1.0, oG = 1.0, oB = 1.0;
    var yR = 0.13, yG = 0.11, yB = 0.10;
    var tr = oR + (yR - oR) * t, tg = oG + (yG - oG) * t, tb = oB + (yB - oB) * t;
    for (var i = 0; i < hairVerts.length; i++) {
      var k = hairVerts[i] * 3, f = hairBase[i * 4 + 3];
      c.array[k]     = hairBase[i * 4]     * (1 - f) + tr * f;
      c.array[k + 1] = hairBase[i * 4 + 1] * (1 - f) + tg * f;
      c.array[k + 2] = hairBase[i * 4 + 2] * (1 - f) + tb * f;
    }
    c.needsUpdate = true;
  },
  pose: function (p) {
    p = p || {};
    var lean = p.lean || 0, t = this.turn.bind(this);
    this.headLift = -(lean * 0.13 + lean * 0.085 + lean * 0.065) * 0.85;
    t('Spine', lean * 0.13);
    t('Spine01', lean * 0.085);
    t('Spine02', lean * 0.065);
    // legs straddle the saddle
    t('LeftUpLeg', -1.28, 0.16, 0.62);
    t('RightUpLeg', -1.28, -0.16, -0.62);
    t('LeftLeg', 1.40);
    t('RightLeg', 1.40);
    // Arms down out of the T and onto the grips. The forearm bends on X — Y is
    // that bone's twist axis and moves the hand not at all, which is why the
    // old pose left both arms straight out in front of him holding nothing.
    // These angles were solved numerically against a grip target rather than
    // eyeballed: shoulders are mirrored, the elbows are not quite, because the
    // model's own bind pose is not perfectly symmetric.
    t('LeftArm', 0.22, 0, 1.213);
    t('RightArm', 0.22, 0, -1.213);
    t('LeftForeArm', 0.978, 0, 0);
    t('RightForeArm', 0.856, 0, 0);
  }
};

if (window.__PFLOAD) __PFLOAD.set(0.46, 'DRESSING THE RIDER');

})();
