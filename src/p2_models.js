/* =========================================================================
   Part 2 — low-poly model factory: dragon, rider, enemies, boss, world props
   ========================================================================= */
(function () {
var P = window.__PF;
var V3 = P.V3, M = P.M, G = P.G, rand = P.rand, clamp = P.clamp, lerp = P.lerp, damp = P.damp, TAU = P.TAU;

// ------------------------------------------------------- geometry shortcuts
function box(w, h, d) { return new THREE.BoxGeometry(w, h, d); }
function cone(r, h, s) { return new THREE.ConeGeometry(r, h, s || 5); }
function cyl(r1, r2, h, s) { return new THREE.CylinderGeometry(r1, r2, h, s || 6); }
function ico(r, d) { return new THREE.IcosahedronGeometry(r, d || 0); }
function oct(r, d) { return new THREE.OctahedronGeometry(r, d || 0); }
function dodec(r) { return new THREE.DodecahedronGeometry(r, 0); }
function tet(r) { return new THREE.TetrahedronGeometry(r, 0); }
function tor(r, t, a, b) { return new THREE.TorusGeometry(r, t, a || 4, b || 12); }
function mesh(g, m) { return new THREE.Mesh(g, m); }

// triangle strip wing membrane
function membrane(pts) {
  var g = new THREE.BufferGeometry(), v = [];
  for (var i = 1; i < pts.length - 1; i++) {
    v.push(pts[0][0], pts[0][1], pts[0][2]);
    v.push(pts[i][0], pts[i][1], pts[i][2]);
    v.push(pts[i + 1][0], pts[i + 1][1], pts[i + 1][2]);
  }
  g.setAttribute('position', new THREE.Float32BufferAttribute(v, 3));
  g.computeVertexNormals();
  return g;
}

// A tapered tube through a list of cross-sections. Superelliptic sections give
// a creature-like profile (flattish back and belly) rather than a plain pipe,
// and the belly is tinted through vertex colour so there's no seam.
function tube(sections, radial, belly, back) {
  var pos = [], col = [], i, j;
  var K = 1.45;
  function pt(si, ai) {
    var sec = sections[si];
    var a = ai / radial * TAU;
    var c = Math.cos(a), sn = Math.sin(a);
    var sx = c < 0 ? -1 : 1, sy = sn < 0 ? -1 : 1;
    return [
      sx * Math.pow(Math.abs(c), 2 / K) * sec.rx,
      sy * Math.pow(Math.abs(sn), 2 / K) * sec.ry + (sec.y || 0),
      sec.z
    ];
  }
  function shade(ai) {                       // 0 at the spine, 1 under the belly
    var sn = Math.sin(ai / radial * TAU);
    return clamp(-sn * 0.5 + 0.5, 0, 1);
  }
  function push(v, ai) {
    pos.push(v[0], v[1], v[2]);
    var f = shade(ai), r = back, g = belly;
    col.push(r.r + (g.r - r.r) * f, r.g + (g.g - r.g) * f, r.b + (g.b - r.b) * f);
  }
  function tri(a, ai, b, bi, c, ci) { push(a, ai); push(b, bi); push(c, ci); }
  for (i = 0; i < sections.length - 1; i++) {
    for (j = 0; j < radial; j++) {
      var a0 = pt(i, j), a1 = pt(i, j + 1), b0 = pt(i + 1, j), b1 = pt(i + 1, j + 1);
      tri(a0, j, b0, j, b1, j + 1);
      tri(a0, j, b1, j + 1, a1, j + 1);
    }
  }
  // caps
  var first = sections[0], last = sections[sections.length - 1];
  var cf = [0, first.y || 0, first.z], cl = [0, last.y || 0, last.z];
  for (j = 0; j < radial; j++) {
    tri(cf, radial / 2, pt(0, j + 1), j + 1, pt(0, j), j);
    tri(cl, radial / 2, pt(sections.length - 1, j), j, pt(sections.length - 1, j + 1), j + 1);
  }
  var g2 = new THREE.BufferGeometry();
  g2.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g2.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g2.computeVertexNormals();
  return g2;
}
function hullMat(shine) {
  var m = new THREE.MeshPhongMaterial({
    vertexColors: true, flatShading: true, shininess: shine || 14, specular: 0x243c40
  });
  P.retroPatch(m);
  return m;
}
// a tapered bone between two points
function bone(a, b, r1, r2, mat) {
  var A = new V3(a[0], a[1], a[2]), B = new V3(b[0], b[1], b[2]);
  var len = A.distanceTo(B);
  var m = mesh(cyl(r2, r1, len, 5), mat);
  m.position.copy(A).add(B).multiplyScalar(0.5);
  m.lookAt(B);
  m.rotateX(-Math.PI * 0.5);
  return m;
}

// ============================================================== THE DRAGON
var DRAGON_COL = {
  hide:  0x1f6f74,
  hide2: 0x14484f,
  plate: 0x7d4bb5,
  belly: 0xd9b871,
  wing:  0xc24a86,
  claw:  0xf0e2bb,
  eye:   0xffe066
};

function buildDragon() {
  var root = new THREE.Group();      // faces +Z
  var body = new THREE.Group(); root.add(body);

  var mHide = M(DRAGON_COL.hide, { shine: 14, spec: 0x224044 });
  var mHide2 = M(DRAGON_COL.hide2, { shine: 8 });
  var mPlate = M(DRAGON_COL.plate, { shine: 26, spec: 0x554070 });
  var mBelly = M(DRAGON_COL.belly);
  var mWing = M(DRAGON_COL.wing, { side: THREE.DoubleSide, shine: 6 });
  var mWing2 = M(0xa63a70, { side: THREE.DoubleSide, shine: 5 });
  var mWing3 = M(0x8c2f5e, { side: THREE.DoubleSide, shine: 4 });
  var mSpar = M(0xb9a37e, { side: THREE.DoubleSide, shine: 18 });
  var mClaw = M(DRAGON_COL.claw);

  // ---- torso: one tapered hull, deep at the chest, narrowing to the hips
  var cBack = new THREE.Color(DRAGON_COL.hide);
  var cBelly = new THREE.Color(DRAGON_COL.belly);
  var mHull = hullMat(16);
  var torsoGeo = tube([
    { z: -3.30, rx: 0.40, ry: 0.38, y:  0.06 },
    { z: -2.40, rx: 0.74, ry: 0.66, y:  0.02 },
    { z: -1.20, rx: 1.08, ry: 0.90, y: -0.06 },
    { z:  0.00, rx: 1.30, ry: 1.02, y: -0.06 },
    { z:  1.10, rx: 1.36, ry: 1.12, y:  0.00 },
    { z:  2.10, rx: 1.12, ry: 0.96, y:  0.10 },
    { z:  2.95, rx: 0.74, ry: 0.68, y:  0.24 },
    { z:  3.45, rx: 0.50, ry: 0.47, y:  0.32 }
  ], 10, cBelly, cBack);
  body.add(mesh(torsoGeo, mHull));

  // shoulder and hip masses so the limbs have something to grow out of
  [-1, 1].forEach(function (sd) {
    var sh = mesh(ico(0.62, 0), mHide2);
    sh.position.set(sd * 0.95, 0.42, 1.35); sh.scale.set(0.9, 0.85, 1.15); body.add(sh);
    var hp = mesh(ico(0.52, 0), mHide2);
    hp.position.set(sd * 0.82, -0.18, -1.30); hp.scale.set(0.85, 0.9, 1.05); body.add(hp);
  });

  // dorsal ridge — plates that shrink and lean back along the spine
  for (var i = 0; i < 9; i++) {
    var f2 = i / 8;
    var pl = mesh(tet(0.40), mPlate);
    pl.position.set(0, 1.02 - f2 * 0.28 + Math.sin(f2 * 3.1) * 0.06, 2.5 - i * 0.72);
    pl.rotation.set(Math.PI * 0.5, 0, Math.PI * 0.25);
    pl.scale.set(0.42, 0.55 + Math.sin(f2 * 3.1) * 0.7, 1.0);
    body.add(pl);
  }

  // ---- neck: five tapering segments, then a proper skull -----------------
  var neck = new THREE.Group(); neck.position.set(0, 0.68, 3.15); body.add(neck);
  var necks = [];
  var parent = neck;
  var NSEG = 5;
  for (var n = 0; n < NSEG; n++) {
    var seg = new THREE.Group(); seg.position.z = n === 0 ? 0 : 0.86;
    var r0 = 0.50 - n * 0.052, r1 = 0.50 - (n + 1) * 0.052;
    seg.add(mesh(tube([
      { z: 0.00, rx: r0 * 1.05, ry: r0 },
      { z: 0.46, rx: (r0 + r1) * 0.53, ry: (r0 + r1) * 0.5 },
      { z: 0.90, rx: r1 * 1.05, ry: r1 }
    ], 8, cBelly, cBack), mHull));
    // a small plate riding each vertebra
    var np = mesh(tet(0.2), mPlate);
    np.position.set(0, r0 * 0.95, 0.42);
    np.rotation.set(Math.PI * 0.5, 0, Math.PI * 0.25);
    np.scale.set(0.34, 0.75, 0.9); seg.add(np);
    parent.add(seg); necks.push(seg); parent = seg;
  }

  var head = new THREE.Group(); head.position.z = 0.86; parent.add(head);
  // cranium tapering into a long snout
  head.add(mesh(tube([
    { z: -0.10, rx: 0.30, ry: 0.30, y: 0.00 },
    { z:  0.35, rx: 0.46, ry: 0.44, y: 0.02 },
    { z:  0.80, rx: 0.44, ry: 0.40, y: 0.00 },
    { z:  1.30, rx: 0.32, ry: 0.28, y: -0.04 },
    { z:  1.90, rx: 0.24, ry: 0.21, y: -0.08 },
    { z:  2.25, rx: 0.15, ry: 0.14, y: -0.11 }
  ], 8, cBelly, cBack), mHull));
  // brow ridge and cheeks
  [-1, 1].forEach(function (sd) {
    var brow = mesh(tet(0.26), mHide2);
    brow.position.set(sd * 0.30, 0.30, 0.62);
    brow.rotation.set(0.5, sd * 0.4, 0); brow.scale.set(1, 0.7, 1.5); head.add(brow);
    var cheek = mesh(tet(0.24), mHide2);
    cheek.position.set(sd * 0.36, -0.10, 0.45);
    cheek.rotation.set(-0.3, sd * 0.6, 0); cheek.scale.set(1, 0.9, 1.2); head.add(cheek);
    // swept-back horns
    var hn = bone([sd * 0.26, 0.42, 0.30], [sd * 0.62, 0.86, -0.92], 0.13, 0.02, mClaw);
    head.add(hn);
    var hn2 = bone([sd * 0.34, 0.10, 0.20], [sd * 0.70, 0.20, -0.62], 0.08, 0.015, mClaw);
    head.add(hn2);
    // eye set into the socket
    var eye = mesh(oct(0.15), G(DRAGON_COL.eye));
    eye.position.set(sd * 0.38, 0.16, 0.82); eye.scale.set(0.55, 1, 0.9); head.add(eye);
  });
  // lower jaw, hinged at the back so it can be opened later
  var jaw = new THREE.Group(); jaw.position.set(0, -0.22, 0.45); head.add(jaw);
  jaw.add(mesh(tube([
    { z: 0.00, rx: 0.30, ry: 0.15 },
    { z: 0.70, rx: 0.24, ry: 0.13 },
    { z: 1.45, rx: 0.15, ry: 0.10 },
    { z: 1.80, rx: 0.09, ry: 0.07 }
  ], 6, cBelly, cBelly), mHull));
  // teeth along the upper jaw line
  for (var tt = 0; tt < 5; tt++) {
    [-1, 1].forEach(function (sd) {
      var tooth = mesh(cone(0.045, 0.17, 4), mClaw);
      tooth.position.set(sd * (0.20 - tt * 0.022), -0.20 - tt * 0.012, 0.95 + tt * 0.26);
      tooth.rotation.x = Math.PI;
      head.add(tooth);
    });
  }
  // nostrils
  [-1, 1].forEach(function (sd) {
    var nos = mesh(oct(0.05), mHide2);
    nos.position.set(sd * 0.09, -0.02, 2.10); head.add(nos);
  });

  // ---- wings: humerus, forearm and four finger spars carrying a scalloped
  // membrane, the way a bat or a dragon actually folds together.
  function wing(side) {
    var w = new THREE.Group();
    w.position.set(side * 1.00, 0.34, 0.80);

    var S  = [0, 0, 0];                       // shoulder
    var E  = [side * 2.40, 0.22, -0.35];      // elbow
    var W2 = [side * 4.70, 0.58, -1.05];      // wrist
    var F1 = [side * 7.05, 0.98, -0.55];      // leading finger
    var F2 = [side * 6.80, 0.40, -2.60];
    var F3 = [side * 5.55, -0.12, -4.20];
    var F4 = [side * 3.60, -0.48, -5.05];     // trailing finger
    var A  = [side * -0.45, -0.28, -2.70];    // membrane root, tucked into the flank

    // arm bones, then four finger spars — thick and pale so they read as
    // structure against the membrane rather than disappearing into it
    w.add(bone(S, E, 0.23, 0.17, mHide));
    w.add(bone(E, W2, 0.17, 0.13, mHide));
    var knuckle = mesh(ico(0.20, 0), mHide2);
    knuckle.position.set(W2[0], W2[1], W2[2]); w.add(knuckle);
    [F1, F2, F3, F4].forEach(function (F, fi) {
      w.add(bone(W2, F, 0.145 - fi * 0.012, 0.040, mSpar));
    });
    w.add(bone(W2, [side * 5.30, 1.12, -0.45], 0.075, 0.014, mClaw));   // thumb claw

    // trailing edges bow inward between the fingertips, two points per span
    // so the scallops actually curve
    function mix(a, b, u) {
      return [a[0] + (b[0] - a[0]) * u, a[1] + (b[1] - a[1]) * u, a[2] + (b[2] - a[2]) * u];
    }
    function pull(p, toward, k) {
      return [p[0] + (toward[0] - p[0]) * k, p[1] + (toward[1] - p[1]) * k,
              p[2] + (toward[2] - p[2]) * k];
    }
    function panel(a, b, hub, k, mat) {
      return mesh(membrane([hub, a,
        pull(mix(a, b, 0.34), hub, k), pull(mix(a, b, 0.68), hub, k), b]), mat);
    }

    var mem = new THREE.Group();
    mem.add(mesh(membrane([S, E, W2, F1]), mWing));            // leading edge
    mem.add(panel(F1, F2, W2, 0.26, mWing));
    mem.add(panel(F2, F3, W2, 0.28, mWing2));
    mem.add(panel(F3, F4, W2, 0.30, mWing2));
    // inner membrane sweeping back to the flank
    mem.add(mesh(membrane([A, E, W2, F4,
      pull(mix(F4, A, 0.4), E, 0.22), pull(mix(F4, A, 0.75), E, 0.14)]), mWing3));
    w.add(mem);
    w.userData.mem = mem;
    return w;
  }
  var wL = wing(-1), wR = wing(1);
  body.add(wL); body.add(wR);

  // ---- legs / claws
  [-1, 1].forEach(function (s) {
    var leg = new THREE.Group(); leg.position.set(s * 0.85, -0.75, 0.4); body.add(leg);
    var thigh = mesh(box(0.55, 1.0, 0.7), mHide2); thigh.position.y = -0.4; leg.add(thigh);
    var foot = mesh(box(0.75, 0.28, 1.1), mHide2); foot.position.set(0, -0.95, 0.25); leg.add(foot);
    for (var c = -1; c <= 1; c++) {
      var claw = mesh(cone(0.09, 0.42, 4), mClaw);
      claw.rotation.x = Math.PI * 0.5;
      claw.position.set(c * 0.22, -1.0, 0.85); leg.add(claw);
    }
  });

  // ---- tail: eight tapering segments with a ridge running down them
  var tailSegs = [];
  var tp = body, tail0 = new THREE.Group(); tail0.position.set(0, 0.08, -3.15); body.add(tail0); tp = tail0;
  var TSEG = 8;
  for (var ti = 0; ti < TSEG; ti++) {
    var ts = new THREE.Group(); ts.position.z = ti === 0 ? 0 : -0.80;
    var q0 = ti / TSEG, q1 = (ti + 1) / TSEG;
    var ra = 0.44 * Math.pow(1 - q0, 0.85) + 0.05;
    var rb = 0.44 * Math.pow(1 - q1, 0.85) + 0.05;
    ts.add(mesh(tube([
      { z:  0.00, rx: ra * 1.05, ry: ra },
      { z: -0.42, rx: (ra + rb) * 0.53, ry: (ra + rb) * 0.5 },
      { z: -0.84, rx: rb * 1.05, ry: rb }
    ], 7, cBelly, cBack), mHull));
    var fin = mesh(tet(0.30), mPlate);
    fin.position.set(0, ra * 0.92, -0.40);
    fin.rotation.set(Math.PI * 0.5, 0, Math.PI * 0.25);
    fin.scale.set(0.34, 0.5 + (1 - q0) * 0.8, 0.95);
    ts.add(fin);
    tp.add(ts); tailSegs.push(ts); tp = ts;
  }
  // tail vane
  var tailFin = new THREE.Group();
  tailFin.add(mesh(membrane([
    [0, 0.02, 0.05], [0.62, 0.95, -0.85], [0.30, 0.30, -1.75], [0, 0.06, -2.05]
  ]), mWing));
  tailFin.add(mesh(membrane([
    [0, 0.02, 0.05], [0, 0.06, -2.05], [-0.30, 0.30, -1.75], [-0.62, 0.95, -0.85]
  ]), mWing));
  tailFin.add(mesh(membrane([
    [0, -0.02, 0.05], [-0.48, -0.62, -0.90], [0, -0.06, -1.60]
  ]), mWing));
  tailFin.add(mesh(membrane([
    [0, -0.02, 0.05], [0, -0.06, -1.60], [0.48, -0.62, -0.90]
  ]), mWing));
  tp.add(tailFin);

  // ============================================================ THE RIDER
  // A sculpted low-poly head: stacked cross-sections stitched into a skull,
  // then brow / cheekbone / nose / lip / ear detail laid on top of it.
  var rider = new THREE.Group();
  rider.position.set(0, 1.15, 0.55);
  body.add(rider);

  var SKIN_OLD = 0x7d5638, SKIN_YOUNG = 0x8d6242;
  var mSkin = new THREE.MeshPhongMaterial({ color: SKIN_OLD, flatShading: true, shininess: 8, specular: 0x2a1d14 });
  P.retroPatch(mSkin);
  var mSkinLo = new THREE.MeshPhongMaterial({ color: 0x5f3f28, flatShading: true, shininess: 3 });
  P.retroPatch(mSkinLo);
  var mLine = new THREE.MeshPhongMaterial({ color: 0x4a2f1e, flatShading: true, shininess: 0 });
  P.retroPatch(mLine);
  var mHair = new THREE.MeshPhongMaterial({ color: 0xdedacd, flatShading: true, shininess: 2 });
  P.retroPatch(mHair);
  var mFleck = new THREE.MeshPhongMaterial({ color: 0x4f3220, flatShading: true, shininess: 0 });
  P.retroPatch(mFleck);
  var mCoat = M(0x2c2f52, { shine: 10 });
  var mCoat2 = M(0x8f3b2e);
  var mBelt = M(0xc8a23f);

  // ---- torso -------------------------------------------------------------
  var torso = mesh(box(0.92, 1.15, 0.62), mCoat); torso.position.y = 0.2; rider.add(torso);
  var coatTail = mesh(box(0.98, 0.9, 0.5), mCoat2);
  coatTail.position.set(0, -0.35, -0.16); coatTail.rotation.x = 0.16; rider.add(coatTail);
  var belt = mesh(box(0.96, 0.16, 0.66), mBelt); belt.position.y = -0.3; rider.add(belt);
  var collar = mesh(box(0.98, 0.2, 0.68), mCoat2); collar.position.y = 0.74; rider.add(collar);
  var neckR = mesh(cyl(0.17, 0.2, 0.3, 6), mSkinLo); neckR.position.y = 0.88; rider.add(neckR);

  // ---- the head ----------------------------------------------------------
  var headR = new THREE.Group(); headR.position.y = 1.24; rider.add(headR);
  var F = new THREE.Group(); F.scale.setScalar(0.345); headR.add(F);   // face space

  // cross-sections from chin (y=-1) to crown (y=1). Long narrow skull,
  // forward chin, high cheekbones, tall forehead.
  var HEAD_RINGS = [
    { y: -1.00, rx: 0.19, rz: 0.25, cz:  0.33 },  // chin point
    { y: -0.86, rx: 0.34, rz: 0.42, cz:  0.26 },
    { y: -0.68, rx: 0.48, rz: 0.55, cz:  0.16 },  // jaw
    { y: -0.44, rx: 0.58, rz: 0.63, cz:  0.07 },  // mouth
    { y: -0.20, rx: 0.64, rz: 0.68, cz:  0.02 },  // nose base
    { y:  0.02, rx: 0.69, rz: 0.70, cz:  0.00 },  // cheekbone
    { y:  0.22, rx: 0.67, rz: 0.69, cz: -0.02 },  // eye line
    { y:  0.40, rx: 0.66, rz: 0.68, cz: -0.03 },  // brow
    { y:  0.60, rx: 0.645,rz: 0.65, cz: -0.05 },  // forehead
    { y:  0.78, rx: 0.60, rz: 0.58, cz: -0.07 },  // temple
    { y:  0.92, rx: 0.45, rz: 0.43, cz: -0.07 },
    { y:  1.00, rx: 0.19, rz: 0.19, cz: -0.07 }
  ];
  var HN = 14;

  function surfPt(y, a, push) {
    var R = HEAD_RINGS, i;
    for (i = 0; i < R.length - 1; i++) if (y <= R[i + 1].y) break;
    var A = R[Math.min(i, R.length - 2)], B = R[Math.min(i + 1, R.length - 1)];
    var t = clamp((y - A.y) / (B.y - A.y || 1), 0, 1);
    var rx = lerp(A.rx, B.rx, t) + (push || 0);
    var rz = lerp(A.rz, B.rz, t) + (push || 0);
    var cz = lerp(A.cz, B.cz, t);
    return new V3(Math.sin(a) * rx, y, cz + Math.cos(a) * rz);
  }

  // z of the skull surface at a given height and lateral offset
  function surfZ(y, x) {
    var R = HEAD_RINGS, i;
    for (i = 0; i < R.length - 1; i++) if (y <= R[i + 1].y) break;
    var A = R[Math.min(i, R.length - 2)], B = R[Math.min(i + 1, R.length - 1)];
    var t = clamp((y - A.y) / (B.y - A.y || 1), 0, 1);
    var rx = lerp(A.rx, B.rx, t), rz = lerp(A.rz, B.rz, t), cz = lerp(A.cz, B.cz, t);
    var a = Math.asin(clamp(Math.abs(x) / Math_ch(rx), -1, 1));
    return cz + Math.cos(a) * rz;
  }
  function Math_ch(v) { return Math.max(1e-4, v); }

  // a curved slab lying on the skull — hair, beard, moustache
  function shellGeo(y0, y1, aSpan, ny, na, offFn, warp) {
    var pos = [];
    function P3(iy, ia) {
      var fy = iy / ny, fa = ia / na;
      var y = lerp(y0, y1, fy);
      var a = lerp(-aSpan, aSpan, fa);
      var v = surfPt(y, a, offFn(fy, fa));
      if (warp) warp(v, fy, fa, a);
      return [v.x, v.y, v.z];
    }
    function tri(A, B, C) { pos.push(A[0], A[1], A[2], B[0], B[1], B[2], C[0], C[1], C[2]); }
    for (var iy = 0; iy < ny; iy++) for (var ia = 0; ia < na; ia++) {
      var a00 = P3(iy, ia), a01 = P3(iy, ia + 1), a10 = P3(iy + 1, ia), a11 = P3(iy + 1, ia + 1);
      tri(a00, a10, a11); tri(a00, a11, a01);
    }
    var g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.computeVertexNormals();
    return g;
  }
  function shellMesh(y0, y1, aSpan, ny, na, offFn, mat, warp) {
    var mm = mesh(shellGeo(y0, y1, aSpan, ny, na, offFn, warp), mat);
    mm.material.side = THREE.DoubleSide;
    return mm;
  }
  function edgeFade(fy, fa, peak) {
    var ea = 1 - Math.pow(Math.abs(fa * 2 - 1), 2.2);
    var ey = Math.sin(Math.PI * clamp(fy, 0, 1));
    return peak * ea * (0.35 + 0.65 * ey);
  }

  var skullGeo = (function () {
    var pos = [], i, r, a, p;
    function P3(y, ang) { var v = surfPt(y, ang, 0); return [v.x, v.y, v.z]; }
    function tri(A, B, C) { pos.push(A[0], A[1], A[2], B[0], B[1], B[2], C[0], C[1], C[2]); }
    for (r = 0; r < HEAD_RINGS.length - 1; r++) {
      var y0 = HEAD_RINGS[r].y, y1 = HEAD_RINGS[r + 1].y;
      for (i = 0; i < HN; i++) {
        var a0 = i / HN * TAU, a1 = (i + 1) / HN * TAU;
        var v00 = P3(y0, a0), v01 = P3(y0, a1), v10 = P3(y1, a0), v11 = P3(y1, a1);
        tri(v00, v10, v11); tri(v00, v11, v01);
      }
    }
    // caps
    var bot = [0, HEAD_RINGS[0].y - 0.07, HEAD_RINGS[0].cz];
    var top = [0, 1.05, HEAD_RINGS[HEAD_RINGS.length - 1].cz];
    for (i = 0; i < HN; i++) {
      var b0 = P3(HEAD_RINGS[0].y, i / HN * TAU), b1 = P3(HEAD_RINGS[0].y, (i + 1) / HN * TAU);
      tri(bot, b1, b0);
      var t0 = P3(1.0, i / HN * TAU), t1 = P3(1.0, (i + 1) / HN * TAU);
      tri(top, t0, t1);
    }
    var g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.computeVertexNormals();
    return g;
  })();
  var mSkull = new THREE.MeshPhongMaterial({
    color: SKIN_OLD, flatShading: true, shininess: 8, specular: 0x2a1d14, side: THREE.DoubleSide
  });
  P.retroPatch(mSkull);
  var skullR = mesh(skullGeo, mSkull); F.add(skullR);

  // ---- brow ridge, cheekbones, jaw ---------------------------------------
  var brow = mesh(box(1.02, 0.13, 0.2), mSkin);
  brow.position.set(0, 0.40, surfZ(0.40, 0.25) + 0.02); brow.rotation.x = -0.16; F.add(brow);
  [-1, 1].forEach(function (s) {
    var bb = mesh(tet(0.2), mSkin);
    bb.position.set(s * 0.42, 0.38, surfZ(0.38, 0.42) - 0.02); bb.scale.set(1.1, 0.6, 0.7); F.add(bb);
    var cheek = mesh(tet(0.26), mSkin);            // high cheekbone
    cheek.position.set(s * 0.46, 0.02, surfZ(0.02, 0.46) - 0.06);
    cheek.rotation.set(0.4, s * 0.5, 0.2); cheek.scale.set(1.0, 0.75, 0.9); F.add(cheek);
    var jaw = mesh(box(0.16, 0.34, 0.5), mSkin);   // jaw angle
    jaw.position.set(s * 0.5, -0.55, surfZ(-0.55, 0.5) - 0.24); jaw.rotation.z = s * 0.2; F.add(jaw);
    var ear = mesh(ico(0.2, 0), mSkinLo);
    ear.position.set(s * 0.70, 0.05, -0.04); ear.scale.set(0.34, 1.15, 0.75);
    ear.rotation.y = s * 0.3; F.add(ear);
    var lobe = mesh(box(0.08, 0.12, 0.11), mSkinLo);
    lobe.position.set(s * 0.70, -0.18, -0.02); F.add(lobe);
  });

  // ---- nose (authored wedge: ridge, side walls, wings) -------------------
  var noseG = new THREE.Group(); F.add(noseG);
  (function () {
    var pos = [];
    function V(x, y, dz) { return [x, y, surfZ(y, Math.abs(x)) + dz]; }
    function tri(A, B, C) { pos.push(A[0], A[1], A[2], B[0], B[1], B[2], C[0], C[1], C[2]); }
    function quad(A, B, C, D) { tri(A, B, C); tri(A, C, D); }
    var R  = V(0,     0.340, 0.020);   // bridge root, between the brows
    var M  = V(0,     0.055, 0.115);   // mid bridge
    var T  = V(0,    -0.160, 0.205);   // tip
    var B  = V(0,    -0.285, 0.085);   // under the tip
    for (var k = 0; k < 2; k++) {
      var sg = k ? 1 : -1;
      var sR = V(sg * 0.055, 0.330, 0.000);
      var sM = V(sg * 0.070, 0.050, 0.045);
      var sU = V(sg * 0.072, -0.205, 0.135);
      var sW = V(sg * 0.113, -0.243, 0.070);
      quad(R, sR, sM, M);
      quad(M, sM, sU, T);
      tri(sM, sW, sU);
      tri(T, sU, B);
      tri(B, sU, sW);
    }
    var g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.computeVertexNormals();
    var mm = mesh(g, mSkin); mm.material.side = THREE.DoubleSide;
    noseG.add(mm);
  })();
  [-1, 1].forEach(function (s) {
    var nostril = mesh(box(0.05, 0.035, 0.05), mLine);
    nostril.position.set(s * 0.072, -0.272, surfZ(-0.272, 0.072) + 0.10); noseG.add(nostril);
  });

  // ---- mouth --------------------------------------------------------------
  var lipUp = mesh(box(0.32, 0.065, 0.11), mSkin);
  lipUp.position.set(0, -0.36, surfZ(-0.36, 0) + 0.04); F.add(lipUp);
  var lipLo = mesh(box(0.3, 0.085, 0.12), mSkin);
  lipLo.position.set(0, -0.45, surfZ(-0.45, 0) + 0.04); F.add(lipLo);
  var mouthLine = mesh(box(0.29, 0.022, 0.05), mLine);
  mouthLine.position.set(0, -0.405, surfZ(-0.405, 0) + 0.055); F.add(mouthLine);
  var philtrum = mesh(box(0.065, 0.085, 0.05), mSkin);
  philtrum.position.set(0, -0.29, surfZ(-0.29, 0) + 0.015); F.add(philtrum);
  var chinBlk = mesh(box(0.26, 0.18, 0.1), mSkin);
  chinBlk.position.set(0, -0.66, surfZ(-0.66, 0) - 0.02); F.add(chinBlk);

  // ---- eyes ---------------------------------------------------------------
  var eyeParts = [];
  [-1, 1].forEach(function (s) {
    var socket = mesh(box(0.3, 0.2, 0.1), mSkinLo);
    socket.position.set(s * 0.27, 0.21, surfZ(0.21, 0.27) - 0.05); F.add(socket);
    var ball = mesh(ico(0.093, 0), G(0xd6c9ad, { fog: true }));
    ball.position.set(s * 0.27, 0.20, surfZ(0.20, 0.27) - 0.035); F.add(ball);
    var iris = mesh(cyl(0.048, 0.048, 0.03, 6), G(0x3a2415, { fog: true }));
    iris.rotation.x = Math.PI * 0.5;
    iris.position.set(s * 0.27, 0.20, surfZ(0.20, 0.27) + 0.05); F.add(iris);
    var pupil = mesh(cyl(0.025, 0.025, 0.02, 6), G(0x120b06, { fog: true }));
    pupil.rotation.x = Math.PI * 0.5;
    pupil.position.set(s * 0.27, 0.20, surfZ(0.20, 0.27) + 0.065); F.add(pupil);
    var lid = mesh(box(0.3, 0.09, 0.13), mSkin);       // heavy upper lid
    lid.position.set(s * 0.27, 0.30, surfZ(0.30, 0.27) + 0.015); lid.rotation.x = -0.35; F.add(lid);
    var lidLo = mesh(box(0.28, 0.05, 0.1), mSkin);
    lidLo.position.set(s * 0.27, 0.115, surfZ(0.115, 0.27) + 0.015); F.add(lidLo);
    var eyebrow = mesh(box(0.27, 0.05, 0.08), mHair);
    eyebrow.position.set(s * 0.28, 0.375, surfZ(0.375, 0.28) + 0.035); eyebrow.rotation.z = -s * 0.1; F.add(eyebrow);
    eyeParts.push({ lid: lid, ball: ball });
  });

  // ---- freckles: one merged mesh of tiny facets on cheeks and nose --------
  var freckles = (function () {
    var spots = [], i;
    var seedA = [0.34, 0.55, 0.78, 1.02, 0.46, 0.68, 0.9, 0.25];
    var seedY = [0.06, -0.02, 0.05, -0.06, -0.13, -0.09, -0.02, 0.14];
    for (i = 0; i < seedA.length; i++) {
      spots.push([seedY[i], seedA[i]]);
      spots.push([seedY[i] + 0.03, -seedA[i]]);
    }
    spots.push([0.12, 0.0]); spots.push([-0.02, 0.16]); spots.push([-0.02, -0.16]);
    var pos = [];
    for (i = 0; i < spots.length; i++) {
      var p = surfPt(spots[i][0], spots[i][1], 0.012);
      var n = p.clone().setY(p.y - 0).normalize();
      var up = new V3(0, 1, 0);
      var right = new V3().crossVectors(up, n).normalize().multiplyScalar(0.028);
      var upv = new V3().crossVectors(n, right).normalize().multiplyScalar(0.028);
      var a = p.clone().sub(right).sub(upv), b = p.clone().add(right).sub(upv);
      var c = p.clone().add(right).add(upv), d = p.clone().sub(right).add(upv);
      pos.push(a.x, a.y, a.z, b.x, b.y, b.z, c.x, c.y, c.z);
      pos.push(a.x, a.y, a.z, c.x, c.y, c.z, d.x, d.y, d.z);
    }
    var g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.computeVertexNormals();
    var mm = mesh(g, mFleck); mm.material.side = THREE.DoubleSide;
    F.add(mm);
    return mm;
  })();

  // ---- age lines (scaled away as he gets younger) ------------------------
  var wrinkles = [];
  function line(w, h, d, x, y, zOff, rz, rx) {
    var mm = mesh(box(w, h, d), mLine);
    mm.position.set(x, y, surfZ(y, Math.abs(x) + w * 0.25) + zOff);
    mm.rotation.z = rz || 0; mm.rotation.x = rx || 0;
    F.add(mm); wrinkles.push(mm);
    return mm;
  }
  line(0.58, 0.024, 0.04, 0, 0.53, 0.008, 0, -0.1);
  line(0.5, 0.022, 0.04, 0, 0.61, 0.008, 0, -0.1);
  line(0.4, 0.02, 0.04, 0, 0.68, 0.008, 0, -0.1);
  [-1, 1].forEach(function (s) {
    line(0.19, 0.022, 0.05, s * 0.27, 0.095, 0.008, 0);          // eye bag
  });

  // ---- hair: a shell over the crown that recedes at the temples ----------
  var hairCap = shellMesh(0.44, 1.02, Math.PI, 6, 18,
    function (fy, fa) { return 0.05 * (0.5 + 0.5 * Math.sin(Math.PI * clamp(fy, 0, 1))) + 0.02; },
    mHair,
    function (v, fy, fa, a) {
      var front = Math.max(0, Math.cos(a));
      var recede = front * front;
      v.y = Math.min(v.y + recede * (1 - fy) * 0.34, 1.06);
      v.z -= recede * (1 - fy) * 0.06;
    });
  F.add(hairCap);
  var sideburns = [];

  // ---- moustache + close-trimmed beard, both hugging the jaw -------------
  var stache = shellMesh(-0.318, -0.248, 0.27, 2, 6,
    function (fy, fa) { return edgeFade(fy, fa, 0.055); }, mHair);
  F.add(stache);
  var beard = new THREE.Group(); F.add(beard);
  var beardShell = shellMesh(-1.02, -0.42, 1.02, 6, 10,
    function (fy, fa) { return edgeFade(fy, fa, 0.085); }, mHair);
  beard.add(beardShell);
  var beardJaw = shellMesh(-0.98, -0.58, 1.35, 3, 12,
    function (fy, fa) { return edgeFade(fy, fa, 0.05); }, mHair);
  beard.add(beardJaw);

  // ---- arms ---------------------------------------------------------------
  var armL = new THREE.Group(); armL.position.set(-0.52, 0.52, 0.05); rider.add(armL);
  var upL = mesh(box(0.24, 0.62, 0.26), mCoat); upL.position.y = -0.28; armL.add(upL);
  var loL = mesh(box(0.2, 0.5, 0.22), mCoat); loL.position.set(0, -0.72, 0.2); loL.rotation.x = -0.7; armL.add(loL);
  var handL = mesh(box(0.2, 0.18, 0.2), mSkin); handL.position.set(0, -0.92, 0.42); armL.add(handL);

  var armR = new THREE.Group(); armR.position.set(0.52, 0.52, 0.05); rider.add(armR);
  var upR = mesh(box(0.24, 0.62, 0.26), mCoat); upR.position.y = -0.28; armR.add(upR);
  var loR = mesh(box(0.2, 0.52, 0.22), mCoat); loR.position.set(0, -0.7, 0.24); loR.rotation.x = -0.9; armR.add(loR);
  var handR = mesh(box(0.22, 0.2, 0.22), mSkin); handR.position.set(0, -0.9, 0.5); armR.add(handR);
  var gun = new THREE.Group(); gun.position.set(0, -0.92, 0.62); armR.add(gun);
  var gunBody = mesh(box(0.24, 0.26, 0.8), M(0x3a3f4a, { shine: 30, spec: 0x778 }));
  gunBody.position.z = 0.25; gun.add(gunBody);
  var gunTip = mesh(cyl(0.1, 0.15, 0.4, 6), M(0x6d7480, { shine: 40 }));
  gunTip.rotation.x = Math.PI * 0.5; gunTip.position.z = 0.75; gun.add(gunTip);
  var muzzle = mesh(oct(0.34), G(0xfff0a0, { transparent: true, opacity: 0.9, depthWrite: false }));
  muzzle.position.z = 0.95; muzzle.visible = false; gun.add(muzzle);
  var saddle = mesh(box(1.3, 0.3, 1.7), M(0x5b3a26)); saddle.position.set(0, 0.95, 0.5); body.add(saddle);

  // ---------------------------------------------------------- age morphing
  var cSkinOld = new THREE.Color(SKIN_OLD), cSkinYoung = new THREE.Color(SKIN_YOUNG);
  var cHairOld = new THREE.Color(0xdedacd), cHairYoung = new THREE.Color(0x201a15);
  function setAge(age) {
    // 89 = ancient, 25 = young
    var t = clamp((89 - age) / (89 - 25), 0, 1);
    mHair.color.copy(cHairOld).lerp(cHairYoung, t);
    mSkin.color.copy(cSkinOld).lerp(cSkinYoung, t);
    mSkull.color.copy(cSkinOld).lerp(cSkinYoung, t);
    // beard recedes to stubble
    var bs = lerp(1, 0.42, t);
    beard.scale.set(lerp(1, 0.82, t), bs, lerp(1, 0.8, t));
    beard.position.y = (1 - bs) * 0.16;
    stache.scale.set(1, lerp(1, 0.7, t), 1);
    // hair fills back in at the temples
    hairCap.scale.set(1, lerp(1, 1.05, t), 1);
    hairCap.position.y = lerp(0, -0.04, t);
    for (var i = 0; i < sideburns.length; i++) sideburns[i].scale.y = lerp(1, 1.3, t);
    // lines fade
    for (var w = 0; w < wrinkles.length; w++) wrinkles[w].scale.setScalar(lerp(1, 0.02, t));
    // heavy lids lift
    for (var e = 0; e < eyeParts.length; e++) {
      eyeParts[e].lid.rotation.x = lerp(-0.35, -0.62, t);
      eyeParts[e].lid.position.y = lerp(0.30, 0.335, t);
    }
    // posture straightens
    torso.rotation.x = lerp(0.19, -0.02, t);
    rider.position.y = lerp(1.08, 1.18, t);
    headR.position.z = lerp(0.16, 0.0, t);
    neckR.scale.y = lerp(1, 1.1, t);
  }
  setAge(89);

  // ---------------------------------------------------- flight model + rig
  // The wingbeat is driven by how hard the dragon is working: climbing costs
  // effort (fast, deep, powered beats), diving costs none (wings lock out and
  // it glides). A damped spring turns each downstroke into a real lift bob.
  var cycT = 0, periodJit = 0, beatFired = false;
  var effort = 0.25, bob = 0, bobV = 0, surge = 0, surgeV = 0;
  var pitchAim = 0, lastW = 0;

  // ---- tail: a lagging spring chain ------------------------------------
  // Each joint keeps its own heading when the joint ahead of it turns, then
  // springs back into line. The result is a travelling wave down the tail:
  // it trails behind the body and whips, instead of steering with it.
  var TN = tailSegs.length;
  var tY = new Float32Array(TN), tVY = new Float32Array(TN);
  var tX = new Float32Array(TN), tVX = new Float32Array(TN);
  var prevRootYaw = 0, prevBodyYaw = 0, prevBodyPitch = 0, prevBodyRoll = 0;

  function sm(t) { return t * t * (3 - 2 * t); }
  // One flap, normalised 0..1. Begins and ends at 0 = wings held out level,
  // so between flaps the dragon simply glides instead of freezing mid-stroke.
  //   0.00-0.18  raise      0 -> +1
  //   0.18-0.50  power down +1 -> -1   (the fast bit that makes lift)
  //   0.50-1.00  recover    -1 -> 0
  function beat(ph) {
    if (ph < 0.18) return sm(ph / 0.18);
    if (ph < 0.50) return 1 - 2 * sm((ph - 0.18) / 0.32);
    return -1 + sm((ph - 0.50) / 0.50);
  }

  var api = {
    root: root, body: body, rider: rider, head: head, gun: gun, muzzle: muzzle,
    headR: headR, face: F, setAge: setAge, wings: [wL, wR], tail: tailSegs,
    muzzleT: 0, onBeat: null,
    getEffort: function () { return effort; },
    getPhase: function () { return cycT; },
    getBob: function () { return bob; },
    getSurge: function () { return surge; }
  };

  api.update = function (dt, t, st) {
    var vy = st.vy || 0;
    var vyN = clamp(vy / 44, -1, 1);              // -1 diving .. +1 climbing
    var boost = st.boost || 0;

    // ---- effort: climbing is work, gliding down is free ------------------
    var effortT = clamp(0.24 + vyN * 1.05 + boost * 0.3, 0, 1.5);
    effort = damp(effort, effortT, 3.2, dt);      // muscles lag the intent
    var eN = clamp(effort / 1.5, 0, 1);

    // ---- wingbeat: a flap takes a fixed ~0.4s no matter how often it comes,
    // so at low effort the dragon holds a glide and flaps only occasionally.
    var rate = 0.12 + 2.6 * Math.pow(effort, 1.35);   // beats/sec
    var period = 1 / rate + periodJit;
    var flapDur = Math.min(period * 0.95, 0.34 + effort * 0.10);
    cycT += dt;
    if (cycT >= period) {
      cycT -= period; if (cycT < 0 || cycT > period) cycT = 0;
      beatFired = false;
      // idle flaps shouldn't be metronomic
      periodJit = effort < 0.4 ? rand(0, 1.4) : 0;
    }
    var ph = cycT / flapDur;
    var w = ph >= 1 ? 0 : beat(ph);
    var stroking = ph >= 0.18 && ph < 0.5;        // the powered part of the beat

    // the power stroke shoves the body up and forward
    if (stroking && !beatFired) {
      beatFired = true;
      var power = 0.55 + effort * 1.2;
      bobV += 1.95 * power;
      surgeV += 1.05 * power;
      if (api.onBeat) api.onBeat(power, effort);
    }
    bobV -= bob * 30 * dt; bobV *= Math.exp(-4.4 * dt);
    bob += bobV * dt; bob = clamp(bob, -0.45, 0.6);
    surgeV -= surge * 40 * dt; surgeV *= Math.exp(-7 * dt);
    surge += surgeV * dt; surge = clamp(surge, -0.3, 0.3);

    // ---- wing pose -------------------------------------------------------
    var amp = 0.30 + effort * 0.45;               // stroke depth
    var rest = 0.20 - eN * 0.16;                  // gliding wings sit flatter
    var sweep = (1 - eN) * 0.17;                  // and sweep back
    var flutter = (1 - eN) * 0.014;               // airflow judder in a glide
    var bank = (st.strafeX || 0) * 0.16;          // outer wing extends in a turn

    wL.rotation.z =  rest + w * amp + bank + Math.sin(t * 21.0) * flutter;
    wR.rotation.z = -rest - w * amp + bank - Math.sin(t * 21.7) * flutter;
    wL.rotation.x = w * (0.10 + eN * 0.06) + (1 - eN) * 0.06;
    wR.rotation.x = wL.rotation.x;
    wL.rotation.y = -0.10 + w * 0.10 + sweep;
    wR.rotation.y =  0.10 - w * 0.10 - sweep;
    // membranes billow against the air, lagging the arm
    if (wL.userData.mem) wL.userData.mem.rotation.x = -w * (0.10 + eN * 0.16);
    if (wR.userData.mem) wR.userData.mem.rotation.x = -w * (0.10 + eN * 0.16);

    // ---- body ------------------------------------------------------------
    body.position.y = bob;
    body.position.z = surge;
    // bank INTO the turn: moving screen-right drops the right wing
    body.rotation.z = damp(body.rotation.z, (st.strafeX || 0) * 0.62, 7, dt);
    // nose up on the climb, nose down in the dive
    pitchAim = damp(pitchAim, -vyN * 0.40, 4.5, dt);
    body.rotation.x = pitchAim + (stroking ? -0.03 : 0.014);
    // and the nose leads the turn a little
    body.rotation.y = damp(body.rotation.y, -(st.strafeX || 0) * 0.13, 5, dt);

    // ---- neck: reaches forward in a dive, rears up on a climb ------------
    for (var i = 0; i < necks.length; i++) {
      var lag = i * 0.5;
      necks[i].rotation.y = Math.sin(t * 1.4 - lag) * 0.06 - (st.strafeX || 0) * 0.09;
      necks[i].rotation.x = Math.sin(t * 1.9 - i * 0.4) * 0.035 - 0.03
                          - vyN * 0.05 - w * 0.02 * eN;
    }
    head.rotation.x = Math.sin(t * 1.2) * 0.05 - vyN * 0.10;

    // ---- tail: lagging chain + organic waver ------------------------------
    // How much the dragon rotated this frame. The tail doesn't get told about
    // the turn — it only feels it as its parent moving out from under it.
    var dRoot  = P.angDelta(prevRootYaw, root.rotation.y);   prevRootYaw  = root.rotation.y;
    var dYaw   = body.rotation.y - prevBodyYaw;              prevBodyYaw  = body.rotation.y;
    var dPitch = body.rotation.x - prevBodyPitch;            prevBodyPitch = body.rotation.x;
    var dRoll  = body.rotation.z - prevBodyRoll;             prevBodyRoll = body.rotation.z;

    // rotation handed down the chain, plus drag from sideways/vertical travel
    var wY = clamp(dRoot * 0.5 + dYaw, -0.2, 0.2) + (st.strafeX || 0) * dt * 2.4;
    var wX = clamp(dPitch, -0.2, 0.2) + vyN * dt * 1.4 - bobV * dt * 0.05;
    var K = 44, D = 6.5, INER = 0.88;

    for (var j = 0; j < TN; j++) {
      // inertia: hold world heading while the parent swings away
      tY[j] -= wY * INER;
      tX[j] -= wX * INER;
      var oy = tY[j], ox = tX[j];
      // spring back into line with the parent
      tVY[j] += (-tY[j]) * K * dt;  tVY[j] *= Math.exp(-D * dt);
      tVX[j] += (-tX[j]) * K * dt;  tVX[j] *= Math.exp(-D * dt);
      tY[j] += tVY[j] * dt;  tX[j] += tVX[j] * dt;
      tY[j] = clamp(tY[j], -0.34, 0.34);
      tX[j] = clamp(tX[j], -0.30, 0.30);
      // a slow waver from two incommensurate frequencies, so it never repeats
      var wav1 = Math.sin(t * 1.31 + j * 0.74) * 0.55 + Math.sin(t * 0.57 + j * 1.27) * 0.45;
      var wav2 = Math.sin(t * 0.97 + j * 1.11) * 0.60 + Math.sin(t * 1.73 + j * 0.41) * 0.40;
      var amp = (0.030 + eN * 0.045) * (0.55 + j / TN);   // freer toward the tip
      tailSegs[j].rotation.y = tY[j] + wav1 * amp;
      tailSegs[j].rotation.x = tX[j] + wav2 * amp * 0.7 + 0.014;  // hangs a little
      tailSegs[j].rotation.z = -dRoll * 0.5 * (1 - j / TN);       // lags the roll too
      // this joint's own swing is what the next one feels
      wY += tY[j] - oy;
      wX += tX[j] - ox;
    }

    // ---- rider aims the cannon toward the reticle ------------------------
    armR.rotation.x = damp(armR.rotation.x, -0.35 + st.aimY * 0.5, 9, dt);
    armR.rotation.z = damp(armR.rotation.z, -st.aimX * 0.55, 9, dt);
    rider.rotation.y = damp(rider.rotation.y, st.aimX * 0.35, 8, dt);
    rider.rotation.x = damp(rider.rotation.x, -pitchAim * 0.55, 7, dt);   // stays upright
    headR.rotation.y = st.aimX * 0.4;
    headR.rotation.x = -st.aimY * 0.3 + Math.sin(t * 0.8) * 0.02;

    if (api.muzzleT > 0) { api.muzzleT -= dt; muzzle.visible = true;
      muzzle.scale.setScalar(0.6 + Math.random() * 0.9); muzzle.rotation.z += dt * 20; }
    else muzzle.visible = false;
  };
  return api;
}

// ================================================================ ENEMIES
var ENEMY_DEFS = {
  wasp: {
    hp: 2, radius: 2.4, scale: 1.5, score: 100, deAge: 0.06, speed: 26, fireRate: 2.4, bulletSpeed: 62,
    build: function () {
      var g = new THREE.Group();
      var b = mesh(oct(1.15), M(0x6c4f8f, { shine: 18, spec: 0x554070 })); b.scale.set(1, 0.72, 1.5); g.add(b);
      var hd = mesh(oct(0.62), M(0x3d2b58)); hd.position.z = 1.25; g.add(hd);
      var eye = mesh(oct(0.3), G(0xff5c3c)); eye.position.z = 1.7; eye.scale.set(1, 0.6, 0.8); g.add(eye);
      [-1, 1].forEach(function (s) {
        var w = mesh(box(2.3, 0.1, 0.85), M(0x9d7ac4, { side: THREE.DoubleSide }));
        w.position.set(s * 1.5, 0.42, -0.2); w.rotation.z = s * 0.25; g.add(w);
        var w2 = mesh(box(1.5, 0.09, 0.6), M(0x7a5da0, { side: THREE.DoubleSide }));
        w2.position.set(s * 1.1, 0.2, -1.0); w2.rotation.z = s * 0.4; g.add(w2);
      });
      var t = mesh(cone(0.42, 1.3, 5), M(0x3d2b58));
      t.rotation.x = -Math.PI * 0.5; t.position.z = -1.5; g.add(t);
      return g;
    }
  },
  ray: {
    hp: 3, radius: 3.1, scale: 1.4, score: 150, deAge: 0.08, speed: 40, fireRate: 3.2, bulletSpeed: 58,
    build: function () {
      var g = new THREE.Group();
      var b = mesh(oct(1.9), M(0x2f7f86, { shine: 20 })); b.scale.set(2.1, 0.28, 1.15); g.add(b);
      var c = mesh(oct(0.7), M(0x1b4f56)); c.position.z = 0.4; c.scale.set(1, 0.7, 1.3); g.add(c);
      var e = mesh(oct(0.34), G(0xffe066)); e.position.z = 1.1; g.add(e);
      [-1, 1].forEach(function (s) {
        var f = mesh(cone(0.5, 1.9, 4), M(0x2f7f86));
        f.position.set(s * 3.1, 0.25, -0.3); f.rotation.z = -s * 1.2; g.add(f);
      });
      var t = mesh(box(0.24, 0.24, 3.0), M(0x1b4f56)); t.position.z = -2.0; g.add(t);
      return g;
    }
  },
  turret: {
    hp: 4, radius: 3.2, scale: 1.6, score: 200, deAge: 0.10, speed: 0, fireRate: 2.0, bulletSpeed: 70,
    build: function () {
      var g = new THREE.Group();
      var base = mesh(cyl(2.0, 2.6, 1.6, 6), M(0x6b5a44)); base.position.y = 0.8; g.add(base);
      var mid = mesh(cyl(1.2, 1.6, 1.4, 6), M(0x4d4132)); mid.position.y = 2.2; g.add(mid);
      var dome = mesh(ico(1.3), M(0x8a7048, { shine: 24 })); dome.position.y = 3.2; g.add(dome);
      var eye = mesh(oct(0.5), G(0xff4a2a)); eye.position.set(0, 3.3, 1.05); eye.scale.set(1, 0.7, 0.6); g.add(eye);
      [-1, 1].forEach(function (s) {
        var bar = mesh(box(0.28, 0.28, 2.4), M(0x2f2a22));
        bar.position.set(s * 0.6, 3.1, 1.5); g.add(bar);
      });
      return g;
    }
  },
  chaser: {
    hp: 3, radius: 2.6, scale: 1.5, score: 180, deAge: 0.09, speed: 46, fireRate: 1.7, bulletSpeed: 72,
    build: function () {
      var g = new THREE.Group();
      var b = mesh(cone(1.05, 3.6, 5), M(0x93332f, { shine: 22, spec: 0x664040 }));
      b.rotation.x = Math.PI * 0.5; g.add(b);
      var r = mesh(cyl(1.15, 1.15, 0.5, 6), M(0x4a1c1a)); r.rotation.x = Math.PI * 0.5; r.position.z = -0.9; g.add(r);
      var e = mesh(oct(0.42), G(0xffb03a)); e.position.z = 1.5; g.add(e);
      [0, 1, 2].forEach(function (i) {
        var a = i / 3 * TAU;
        var f = mesh(box(0.2, 1.5, 1.6), M(0x6d2622));
        f.position.set(Math.cos(a) * 0.9, Math.sin(a) * 0.9, -1.2);
        f.rotation.z = a; g.add(f);
      });
      var flame = mesh(cone(0.6, 1.6, 5), G(0xff8c3a, { transparent: true, opacity: 0.8, depthWrite: false }));
      flame.rotation.x = -Math.PI * 0.5; flame.position.z = -2.2; g.add(flame);
      g.userData.flame = flame;
      return g;
    }
  },
  carrier: {
    hp: 6, radius: 3.9, scale: 1.5, score: 400, deAge: 0.14, speed: 18, fireRate: 3.6, bulletSpeed: 50, drops: 2,
    build: function () {
      var g = new THREE.Group();
      var b = mesh(dodec(2.1), M(0x4b4a6d, { shine: 30, spec: 0x8888aa })); g.add(b);
      var core = mesh(ico(1.05, 0), G(0xffd25e, { transparent: true, opacity: 0.95 })); g.add(core);
      g.userData.core = core;
      [-1, 1].forEach(function (s) {
        var arm = mesh(box(0.5, 0.5, 3.4), M(0x2f2f45)); arm.position.set(s * 2.0, 0, 0); g.add(arm);
        var pod = mesh(oct(0.75), M(0x6a6a95)); pod.position.set(s * 2.0, 0, 1.7); g.add(pod);
      });
      var ring = mesh(tor(2.9, 0.16, 4, 10), M(0x8f8fc0, { shine: 40 }));
      ring.rotation.x = Math.PI * 0.5; g.add(ring); g.userData.ring = ring;
      return g;
    }
  },
  mine: {
    hp: 1, radius: 2.5, scale: 1.4, score: 60, deAge: 0.03, speed: 0, fireRate: 0, bulletSpeed: 0,
    build: function () {
      var g = new THREE.Group();
      var b = mesh(ico(1.1), M(0x6a2f2f, { shine: 20 })); g.add(b);
      for (var i = 0; i < 6; i++) {
        var a = i / 6 * TAU;
        var sp = mesh(cone(0.22, 1.0, 4), M(0xb04a3a));
        sp.position.set(Math.cos(a) * 1.2, Math.sin(a) * 1.2, 0);
        sp.rotation.z = -a + Math.PI * 0.5; g.add(sp);
      }
      var e = mesh(oct(0.4), G(0xff3a2a)); g.add(e); g.userData.core = e;
      return g;
    }
  }
};

function buildOrb() {
  var g = new THREE.Group();
  var core = mesh(ico(0.85, 0), G(0x8ffff0, { transparent: true, opacity: 0.95 })); g.add(core);
  var shell = mesh(ico(1.5, 0), M(0x2fd8c8, { shine: 60, spec: 0xaaffff, transparent: true, opacity: 0.45 }));
  g.add(shell);
  var r1 = mesh(tor(1.9, 0.09, 4, 10), G(0xbafff4)); r1.rotation.x = Math.PI * 0.5; g.add(r1);
  var r2 = mesh(tor(1.9, 0.09, 4, 10), G(0x7fe0ff)); g.add(r2);
  g.userData.rings = [r1, r2];
  return g;
}

// =================================================================== BOSS
function buildBoss() {
  var g = new THREE.Group();
  var mHull = M(0x3b3550, { shine: 34, spec: 0x8f88bb });
  var mHull2 = M(0x241f36, { shine: 20 });
  var mGold = M(0xc8a23f, { shine: 60, spec: 0xfff0b0 });

  // central sphinx head
  var head = new THREE.Group(); g.add(head);
  var skull = mesh(box(7, 6, 6.5), mHull); head.add(skull);
  var face = mesh(box(6.2, 4.4, 1.2), mHull2); face.position.set(0, -0.4, 3.4); head.add(face);
  var brow = mesh(box(7.4, 1.1, 1.6), mGold); brow.position.set(0, 2.0, 3.1); head.add(brow);
  var chin = mesh(box(3.4, 1.6, 1.6), mGold); chin.position.set(0, -3.0, 2.6); head.add(chin);
  [-1, 1].forEach(function (s) {
    var e = mesh(box(1.7, 0.9, 0.6), G(0xff6a3a)); e.position.set(s * 1.7, 0.9, 4.0); head.add(e);
    var hd = mesh(box(2.2, 6.6, 5.0), mGold); hd.position.set(s * 4.4, -0.4, 0.4); head.add(hd);
    var hd2 = mesh(box(1.6, 3.2, 3.0), mGold); hd2.position.set(s * 5.2, -3.6, 1.0); head.add(hd2);
  });
  var crown = mesh(cone(3.0, 3.6, 5), mGold); crown.position.y = 4.4; head.add(crown);

  // clock rings
  var ring1 = mesh(tor(13, 0.7, 4, 20), mGold); ring1.rotation.x = Math.PI * 0.5; g.add(ring1);
  var ring2 = mesh(tor(17, 0.55, 4, 24), M(0x8f88bb, { shine: 50 })); g.add(ring2);
  var ring3 = mesh(tor(10, 0.5, 4, 18), M(0x6f5fa0, { shine: 40 })); ring3.rotation.y = Math.PI * 0.5; g.add(ring3);
  // numerals on ring1
  for (var i = 0; i < 12; i++) {
    var a = i / 12 * TAU;
    var nub = mesh(box(0.9, 0.9, 1.6), i % 3 === 0 ? mGold : mHull2);
    nub.position.set(Math.cos(a) * 13, 0, Math.sin(a) * 13);
    nub.rotation.y = -a; ring1.parent && g.add(nub); ring1.userData.nubs = ring1.userData.nubs || [];
    ring1.userData.nubs.push(nub);
  }

  // three weak-point cores on arms
  var cores = [];
  for (var c = 0; c < 3; c++) {
    var ang = c / 3 * TAU;
    var arm = new THREE.Group(); g.add(arm);
    var beam = mesh(box(1.1, 1.1, 9), mHull);
    beam.position.set(Math.cos(ang) * 5.5, Math.sin(ang) * 5.5, 0);
    beam.lookAt(0, 0, 0); beam.rotation.z += 0; arm.add(beam);
    var pod = new THREE.Group();
    pod.position.set(Math.cos(ang) * 11.5, Math.sin(ang) * 11.5, 1.5);
    arm.add(pod);
    var cage = mesh(oct(2.6), M(0x4a4368, { shine: 40, spec: 0xaaa, transparent: true, opacity: 0.85 }));
    pod.add(cage);
    var core = mesh(ico(1.6, 0), G(0x6affd0, { transparent: true, opacity: 0.95 }));
    pod.add(core);
    var shield = mesh(tor(3.0, 0.22, 4, 12), G(0x9affe0, { transparent: true, opacity: 0.5, depthWrite: false }));
    shield.rotation.x = Math.PI * 0.5; pod.add(shield);
    cores.push({ group: pod, core: core, cage: cage, shield: shield, hp: 200, maxHp: 200, alive: true, angle: ang });
  }

  // wings of stone
  [-1, 1].forEach(function (s) {
    var w = mesh(membrane([
      [s * 6, 2, -2], [s * 15, 8, -5], [s * 22, 4, -9], [s * 18, -3, -8], [s * 9, -4, -4]
    ]), M(0x584f7a, { side: THREE.DoubleSide, shine: 12 }));
    g.add(w);
  });

  g.scale.setScalar(2.0);
  return { group: g, head: head, rings: [ring1, ring2, ring3], cores: cores, crown: crown };
}

// ============================================================ WORLD PROPS
function buildRock(scale, col) {
  var g = new THREE.Group();
  var n = 3 + Math.floor(Math.random() * 3);
  for (var i = 0; i < n; i++) {
    var m = mesh(ico(rand(3, 8) * scale, 0), M(col, { shine: 2 }));
    m.position.set(rand(-4, 4) * scale, rand(0, 6) * scale, rand(-4, 4) * scale);
    m.rotation.set(rand(0, TAU), rand(0, TAU), rand(0, TAU));
    m.scale.set(rand(0.7, 1.3), rand(1.2, 3.2), rand(0.7, 1.3));
    g.add(m);
  }
  return g;
}
function buildSpire(h, col) {
  var g = new THREE.Group();
  var segs = 3 + Math.floor(Math.random() * 3);
  var y = 0, r = rand(4, 8);
  for (var i = 0; i < segs; i++) {
    var sh = h / segs * rand(0.8, 1.2);
    var m = mesh(cyl(r * 0.62, r, sh, 5), M(col, { shine: 2 }));
    m.position.y = y + sh / 2;
    m.rotation.y = rand(0, TAU);
    g.add(m); y += sh * 0.92; r *= 0.66;
  }
  var cap = mesh(cone(r, r * 2.2, 5), M(col, { shine: 2 })); cap.position.y = y + r; g.add(cap);
  return g;
}
function buildRuin(col) {
  var g = new THREE.Group();
  var h = rand(12, 34);
  var col1 = mesh(cyl(2.2, 2.6, h, 6), M(col, { shine: 6 })); col1.position.y = h / 2; g.add(col1);
  var cap = mesh(box(7, 1.6, 7), M(col, { shine: 6 })); cap.position.y = h + 0.8; g.add(cap);
  var base = mesh(box(8, 2, 8), M(col, { shine: 6 })); base.position.y = 1; g.add(base);
  if (Math.random() < 0.5) {
    var arch = mesh(box(14, 1.8, 3), M(col, { shine: 6 }));
    arch.position.set(rand(-6, 6), h * rand(0.5, 0.9), 0);
    arch.rotation.z = rand(-0.3, 0.3); g.add(arch);
  }
  return g;
}
function buildIsland(scale, colTop, colRock) {
  var g = new THREE.Group();
  var top = mesh(cyl(10 * scale, 8 * scale, 3 * scale, 7), M(colTop, { shine: 3 }));
  g.add(top);
  var under = mesh(cone(8 * scale, 22 * scale, 7), M(colRock, { shine: 2 }));
  under.rotation.x = Math.PI; under.position.y = -12 * scale; g.add(under);
  for (var i = 0; i < 3; i++) {
    var r = mesh(ico(rand(1.5, 3.4) * scale, 0), M(colRock, { shine: 2 }));
    r.position.set(rand(-7, 7) * scale, 2 * scale, rand(-7, 7) * scale);
    r.rotation.set(rand(0, 3), rand(0, 3), rand(0, 3)); g.add(r);
  }
  return g;
}
function buildTower(col, col2) {
  var g = new THREE.Group();
  var h = rand(28, 70);
  var body = mesh(cyl(4.5, 6.5, h, 6), M(col, { shine: 10 })); body.position.y = h / 2; g.add(body);
  var top = mesh(cone(7.5, 12, 6), M(col2, { shine: 20 })); top.position.y = h + 6; g.add(top);
  for (var i = 0; i < 3; i++) {
    var ring = mesh(tor(6.4, 0.5, 4, 10), M(col2, { shine: 24 }));
    ring.rotation.x = Math.PI * 0.5; ring.position.y = h * (0.3 + i * 0.24); g.add(ring);
  }
  var lamp = mesh(oct(1.4), G(0xffd25e)); lamp.position.y = h + 13; g.add(lamp);
  return g;
}
function buildCloud(col) {
  var g = new THREE.Group();
  for (var i = 0; i < 5; i++) {
    var m = mesh(ico(rand(8, 18), 0), M(col, { shine: 0 }));
    m.position.set(rand(-24, 24), rand(-4, 4), rand(-18, 18));
    m.scale.set(rand(1, 2), rand(0.4, 0.7), rand(1, 2));
    m.rotation.set(rand(0, 3), rand(0, 3), rand(0, 3));
    g.add(m);
  }
  return g;
}

P.models = {
  box: box, cone: cone, cyl: cyl, ico: ico, oct: oct, dodec: dodec, tet: tet, tor: tor,
  mesh: mesh, membrane: membrane,
  buildDragon: buildDragon, buildOrb: buildOrb, buildBoss: buildBoss,
  ENEMY_DEFS: ENEMY_DEFS,
  buildRock: buildRock, buildSpire: buildSpire, buildRuin: buildRuin,
  buildIsland: buildIsland, buildTower: buildTower, buildCloud: buildCloud
};

})();
